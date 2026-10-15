// ナナフシギ・デュエル: rule checks for the engine, the CPU and the tournament director.
// Run: node tools/nanafushigi-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../nanafushigi/engine.js');
const AI = require('../nanafushigi/ai.js');
const { Director } = require('../nanafushigi/director.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL:', msg); } }
const byName = (n) => E.CARDS.find((c) => c.name === n).id;
function blank() {
  const st = E.newGame(1, { first: 0 });
  st.phase = 'play'; st.draft = null; st.age = 1;
  st.slots = [{ row: 0, x: 0, card: byName('劇場'), up: true, taken: false, cov: [] }, { row: 0, x: 1, card: byName('祭壇'), up: true, taken: false, cov: [] }];
  return st;
}

// deck sizes and layouts
ok(E.CARDS.filter((c) => c.age === 1).length === 23 && E.CARDS.filter((c) => c.age === 2).length === 23 && E.CARDS.filter((c) => c.age === 3).length === 20, 'card counts per age');
ok(E.CARDS.filter((c) => c.type === 'purple').length === 7, 'seven guilds');
[1, 2, 3].forEach((a) => ok(E.LAYOUTS[a].rows.flat().length === 20, 'age ' + a + ' structure holds 20 cards'));

// trading: 2 + opponent's production, 1 with a reserve
{
  const st = blank();
  st.p[1].cards.push(byName('採石場'), byName('段丘採石場'));   // opponent makes 3 stone
  ok(E.prices(st, 0).S === 5, 'stone costs 2 + 3');
  st.p[0].cards.push(byName('石の備蓄'));
  ok(E.prices(st, 0).S === 1, 'stone reserve fixes the price at 1');
  ok(E.cardCost(st, 0, byName('水道橋')).coins === 3, 'aqueduct (3 stone) costs 3 with the reserve');
}
// chains are free, Urbanism pays 4
{
  const st = blank();
  st.p[0].cards.push(byName('劇場'));
  st.p[0].coins = 0;
  ok(E.cardCost(st, 0, byName('彫像')).chain, 'theater chains into the statue');
  st.p[0].tok.push(E.T.URBAN);
  st.slots[1].card = byName('彫像');
  const r = E.apply(st, 0, { k: 'build', slot: 1 });
  ok(r.ok && st.p[0].coins === 4, 'urbanism gives 4 coins on a chain');
}
// Masonry and Architecture discount the two dearest resources
{
  const st = blank();
  st.p[0].tok.push(E.T.MASON);
  ok(E.cardCost(st, 0, byName('宮殿')).coins === 6, 'palace (5 resources) costs 3 bought resources with masonry');
}
// military: looting tokens and supremacy
{
  const st = blank();
  st.p[1].coins = 10;
  st.slots[0].card = byName('見張り塔');
  st.mil = 2;
  E.apply(st, 0, { k: 'build', slot: 0 });
  ok(st.mil === 3 && st.p[1].coins === 8 && !st.loot.a3, 'entering zone 3 loots 2 coins');
  st.mil = 8; st.active = 0; st.slots[1].card = byName('見張り塔');
  E.apply(st, 0, { k: 'build', slot: 1 });
  ok(st.result && st.result.how === 'military' && st.result.winner === 0, 'reaching the capital wins');
}
// science: a pair gives a progress choice, six symbols win
{
  const st = blank();
  st.p[0].cards.push(byName('写字室'));
  st.slots[0].card = byName('図書館'); st.p[0].coins = 20;
  E.apply(st, 0, { k: 'build', slot: 0 });
  ok(st.pend && st.pend.k === 'progress' && st.pend.seat === 0, 'second quill asks for a progress token');
  const st2 = blank();
  ['写字室', '薬剤師', '工房', '薬屋', 'アカデミー'].forEach((n) => st2.p[0].cards.push(byName(n)));
  st2.slots[0].card = byName('大学'); st2.p[0].coins = 30;
  E.apply(st2, 0, { k: 'build', slot: 0 });
  ok(st2.result && st2.result.how === 'science', 'six different symbols win');
}
// discarding pays 2 + yellow cards
{
  const st = blank();
  st.p[0].cards.push(byName('酒場'), byName('税関'));
  st.p[0].coins = 0;
  E.apply(st, 0, { k: 'discard', slot: 0 });
  ok(st.p[0].coins === 4, 'discard gives 2 + 2 yellow');
}
// the seventh wonder removes the eighth
{
  const st = blank();
  st.p[0].wonders = [{ w: 8, card: -1 }, { w: 9, card: 1 }, { w: 10, card: 2 }, { w: 11, card: 3 }];
  st.p[1].wonders = [{ w: 0, card: 4 }, { w: 1, card: 5 }, { w: 2, card: 6 }, { w: 3, card: -1 }];
  st.built = 6; st.p[0].coins = 50;
  const r = E.apply(st, 0, { k: 'wonder', slot: 0, w: 8 });
  ok(r.ok && st.built === 7 && st.p[1].wonders.length === 3 && st.outW.indexOf(3) >= 0, 'seventh wonder removes the last one');
}
// guild coins count the city with the most cards
{
  const st = blank();
  st.age = 3;
  st.p[1].cards.push(byName('劇場'), byName('祭壇'), byName('浴場'));
  st.p[0].cards.push(byName('演壇'));
  st.slots[0].card = byName('執政官ギルド'); st.p[0].coins = 30;
  const before = st.p[0].coins, cost = E.cardCost(st, 0, byName('執政官ギルド')).coins;
  E.apply(st, 0, { k: 'build', slot: 0 });
  ok(st.p[0].coins === before - cost + 3, 'magistrates pay for the bluest city');
  ok(E.score(st)[0].guild === 3, 'magistrates score the bluest city');
}
// random and CPU games always finish, CPU never makes illegal moves
for (let g = 0; g < 60; g++) {
  const st = E.newGame(g + 11), rng = E.mulberry32(g);
  let n = 0;
  while (st.phase !== 'over' && n++ < 400) {
    const s = st.pend ? st.pend.seat : st.active;
    const a = g % 2 ? AI.choose(st, 1 + (g % 4), rng) : E.actions(st, s)[Math.floor(rng() * E.actions(st, s).length)];
    if (!E.apply(st, s, a).ok) { ok(false, 'illegal move in game ' + g); break; }
  }
  ok(st.phase === 'over', 'game ' + g + ' finished');
}
// views hide face-down cards from players but not from spectators
{
  const st = E.newGame(5);
  while (st.phase === 'draft') E.apply(st, st.active, E.actions(st, st.active)[0]);
  const hidden = E.viewFor(st, 0, false).slots.filter((s) => !s.up && s.card != null).length;
  const seen = E.viewFor(st, -1, true).slots.filter((s) => !s.up && s.card != null).length;
  ok(hidden === 0 && seen > 0, 'face-down cards: hidden for players, shown to spectators');
}
// tournaments
{
  const d = new Director([1, 2, 3, 4, 5].map((i) => ({ name: 'P' + i, cpu: 1 })), 'league', 3);
  ok(d.matches.length === 10, 'league of 5 has 10 matches');
  const c = new Director([1, 2, 3, 4, 5, 6].map((i) => ({ name: 'P' + i, cpu: 1 })), 'cup', 3);
  let m, guard = 0;
  while ((m = c.start()) && guard++ < 20) { c.finish(m, { winner: 0, how: 'civil', score: [{ total: 50 }, { total: 40 }] }); }
  ok(c.over() && c.champion() != null && c.matches.length === 7, 'cup of 6 finishes with byes');
}
console.log((fails ? 'FAILED ' : 'OK ') + passes + ' checks' + (fails ? ', ' + fails + ' failed' : ''));
process.exit(fails ? 1 : 0);
