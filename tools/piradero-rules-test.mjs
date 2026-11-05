// 風の怪物ピラデロ: rules and CPU checks (no browser).
//   node tools/piradero-rules-test.mjs            rules, random games, CPU games
//   node tools/piradero-rules-test.mjs --league   also a longer CPU-vs-CPU league with win rates
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'piradero/engine.js'));
globalThis.PD_ENG = E;
const AI = require(path.join(root, 'piradero/ai.js'));

const failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }

/* ---------------------------------------------------------------- the battle, from the rule sheet's example */
{
  // three players fight: totals 10 (3+7), 8 (6+2), 9 (4+5); field 0, 8, 1
  const order = [0, 1, 2], hands = [[3, 7], [6, 2], [4, 5]];
  const hi = E.battle(order, hands, [0, 8, 1], [0, 1, 2], 5);
  eq(hi.recv, { 0: 0, 1: 8, 2: 1 }, 'smallest total takes the largest field card, and so on');
  eq(hi.total, { 0: 10, 1: 16, 2: 10 }, 'totals after taking');
  eq(hi.winner, 1, 'wind 1..8: the largest total wins');
  const lo = E.battle(order, hands, [0, 8, 1], [0, 1, 2], 9);
  eq(lo.winner, 2, 'wind 9: the smallest total wins; on a tie the earlier player counts as larger');
  const lo0 = E.battle([2, 0, 1], hands, [0, 8, 1], [2, 0, 1], 0);
  eq(lo0.winner, 0, 'wind 0 with seat 2 first: seat 2 counts as larger, so seat 0 is the smallest');
  // two fighters with three field cards: largest and smallest, the middle stays
  const two = E.battle([0, 1, 2], [[4, 5], [], [3, 8]], [2, 5, 7], [0, 2], 3);
  eq(two.recv, { 0: 7, 2: 2 }, 'two fighters of three take the largest and the smallest');
  eq(two.total, { 0: 16, 2: 13 }, 'two fighters totals');
  // equal totals when taking: the earlier player takes first (the larger card)
  const tie = E.battle([1, 0], [[4, 5], [6, 3]], [1, 6], [1, 0], 4);
  eq(tie.recv, { 1: 6, 0: 1 }, 'equal totals: the earlier player takes the larger card');
  // two players: the lower hand gets the bigger card and can pass the higher one
  const flip = E.battle([0, 1], [[9, 1], [2, 6]], [0, 7], [0, 1], 3);
  eq(flip.total, { 0: 10, 1: 15 }, 'the lower hand takes the larger field card');
  eq(flip.winner, 1, 'and wins with high wind');
}

/* ---------------------------------------------------------------- a round by hand */
function play(st, p, act, msg) {
  const r = E.apply(st, p, act);
  check(r.ok, msg + ' (' + JSON.stringify(act) + ' by ' + p + ' → ' + (r.err || '') + ')');
  check(E.census(st), 'census after ' + msg);
  return r;
}
{
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 7, key: 0 });
  eq(st.slots.length, 6, '2 players: 6 field cards');
  eq(st.unused.length, 3, '2 players: 3 unused cards');
  check(st.wind >= 0, 'a wind card is set aside');
  eq(E.waitingFor(st), [0], 'the key holder starts');
  check(!E.apply(st, 1, { t: 'peek', slot: 0 }).ok, 'out of turn is refused');
  check(!E.apply(st, 0, { t: 'take', slot: 0 }).ok, 'take before peek is refused');
  let r = play(st, 0, { t: 'peek', slot: 2 }, 'A peeks');
  const seen = E.evFor(r.ev, 0)[0], hidden = E.evFor(r.ev, 1)[0];
  check(seen.v === st.slots[2].c, 'the peeker sees the number');
  check(hidden.v === undefined, 'the others do not');
  const vB = E.viewFor(st, 1);
  check(vB.slots[2].v === null && vB.slots[2].seen.indexOf(0) >= 0, 'B sees that A looked at slot 2, not the number');
  play(st, 0, { t: 'take', slot: 4 }, 'A takes another card');
  check(!E.apply(st, 1, { t: 'peek', slot: 4 }).ok, 'a taken card cannot be peeked');
  play(st, 1, { t: 'peek', slot: 2 }, 'B peeks');
  r = play(st, 1, { t: 'take', slot: 2 }, 'B takes the peeked card');
  check(E.evFor(r.ev, 0)[0].v === st.slots[2].c, 'A knows the card B took (A had peeked it)');
  const vA = E.viewFor(st, 0);
  check(vA.slots[2].v === st.slots[2].c && vA.slots[2].by === 1, 'A’s view shows B holds that number');
  play(st, 0, { t: 'peek', slot: 0 }, 'A peeks 2nd');
  play(st, 0, { t: 'take', slot: 0 }, 'A takes 2nd');
  play(st, 1, { t: 'peek', slot: 1 }, 'B peeks 2nd');
  r = play(st, 1, { t: 'take', slot: 1 }, 'B takes 2nd');
  eq(st.phase, 'escape', 'after two laps: escape');
  const rev = r.ev.find((e) => e.t === 'reveal');
  eq(rev.slots.map((x) => x.slot), [3, 5], 'the two cards left are turned up');
  eq(E.viewFor(st, 1).wind, null, 'the wind card stays down');
  // A flees: B wins by default without choosing
  const gA = st.players[0].gears;
  r = play(st, 0, { t: 'flee' }, 'A flees');
  eq(st.players[0].gears, gA - 1, 'fleeing costs 1 gear');
  check(r.ev.some((e) => e.t === 'choose' && e.p === 1 && e.auto), 'B fights automatically');
  check(r.ev.some((e) => e.t === 'default' && e.p === 1), 'B wins by default');
  check(!r.ev.some((e) => e.t === 'wind'), 'no wind card on a default win');
  eq(st.key, 1, 'the winner takes the key');
  eq(st.round, 2, 'next round dealt');
  eq(E.waitingFor(st), [1], 'the new key holder starts');
  eq(st.last.kind, 'default', 'summary kind');
}
{
  // a full battle with three players, everyone fights
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 11, key: 2 });
  eq(st.slots.length, 9, '3 players: 9 field cards');
  eq(st.unused.length, 0, '3 players: no unused cards');
  eq(st.order, [2, 0, 1], 'clockwise from the key');
  let left = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = 0; i < 6; i++) {
    const p = st.order[i % 3], s = left.shift();
    play(st, p, { t: 'peek', slot: s }, 'peek ' + i);
    play(st, p, { t: 'take', slot: s }, 'take ' + i);
  }
  eq(st.phase, 'escape', '3p escape');
  const hands = st.hands.map((h) => h.slice()), field = [6, 7, 8].map((i) => st.slots[i].c), wind = st.wind;
  const g0 = st.players.map((P) => P.gears);
  play(st, 2, { t: 'fight' }, 'C fights');
  play(st, 0, { t: 'fight' }, 'A fights');
  const r = play(st, 1, { t: 'fight' }, 'B fights');
  const b = E.battle([2, 0, 1], hands, field, [2, 0, 1], wind);
  eq(st.last.winner, b.winner, 'winner as the battle says');
  eq(st.last.wind, wind, 'the wind card is shown');
  [0, 1, 2].forEach((s) => eq(st.players[s].gears, s === b.winner ? g0[s] : g0[s] - 2, 'gears after the battle, seat ' + s));
  check(r.ev.filter((e) => e.t === 'recv').length === 3, 'three field cards handed out');
}
{
  // three players: the first two flee, the third wins by default
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 5, key: 0 });
  for (let i = 0; i < 6; i++) { const p = st.order[i % 3]; const s = st.slots.findIndex((S) => S.by < 0); play(st, p, { t: 'peek', slot: s }, 'p'); play(st, p, { t: 'take', slot: s }, 't'); }
  play(st, 0, { t: 'flee' }, 'A flees');
  const r = play(st, 1, { t: 'flee' }, 'B flees');
  check(r.ev.some((e) => e.t === 'default' && e.p === 2), 'C wins by default');
  eq(st.players.map((P) => P.gears), [4, 4, 5], 'two fled, one gear each');
}
{
  // gears never go below zero, the game ends with one player left
  const st = E.newGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 3, key: 0, gears: 3 });
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 200) {
    const p = E.waitingFor(st)[0];
    if (st.phase === 'pick') {
      const s = st.slots.findIndex((S) => S.by < 0);
      play(st, p, { t: st.step, slot: s }, 'loop pick');
    } else play(st, p, { t: 'fight' }, 'loop fight');
    st.players.forEach((P) => check(P.gears >= 0, 'gears ≥ 0'));
  }
  eq(st.phase, 'over', 'a 3-gear game ends');
  check(!st.players[st.winner].out, 'the winner is still in');
}

/* ---------------------------------------------------------------- random legal games */
function rndLegal(st, rnd) {
  const p = E.waitingFor(st)[0];
  if (st.phase === 'pick') { const free = st.slots.map((S, i) => (S.by < 0 ? i : -1)).filter((i) => i >= 0); return [p, { t: st.step, slot: free[Math.floor(rnd() * free.length)] }]; }
  return [p, { t: rnd() < 0.7 ? 'fight' : 'flee' }];
}
{
  const rnd = E.mulberry32(99);
  let rounds = 0, defaults = 0, lows = 0, battles = 0;
  for (let g = 0; g < 400; g++) {
    const n = g % 2 ? 3 : 2;
    const st = E.newGame({ players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })), seed: 1000 + g });
    let guard = 0;
    while (st.phase !== 'over' && guard++ < 1000) {
      const [p, act] = rndLegal(st, rnd);
      const r = E.apply(st, p, act);
      if (!r.ok) { check(false, 'random legal move refused ' + JSON.stringify(act) + ' ' + r.err); break; }
      if (!E.census(st)) { check(false, 'census'); break; }
      for (const e of r.ev) { if (e.t === 'default') defaults++; if (e.t === 'wind') { battles++; if (e.v === 0 || e.v === 9) lows++; } if (e.t === 'round') rounds++; }
      const alive = st.players.filter((P) => !P.out).length;
      if (st.phase !== 'over') check(st.order.length === alive, 'order = players still in');
      if (st.phase === 'pick') check(st.slots.length === (alive === 3 ? 9 : 6), 'field size follows the players still in');
    }
    check(st.phase === 'over', 'random game ' + g + ' ends');
  }
  console.log(`random games: ${rounds} rounds, ${battles} battles (${(lows / battles * 100).toFixed(0)}% monster wind), ${defaults} default wins`);
}

/* ---------------------------------------------------------------- the CPU */
function cpuGame(levels, seed, timing) {
  const n = levels.length;
  const st = E.newGame({ players: levels.map((l, i) => ({ name: 'C' + i, kind: 'cpu', level: l })), seed });
  const rnd = E.mulberry32(seed ^ 0x9e3779b9);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 1000) {
    const p = E.waitingFor(st)[0];
    const t0 = performance.now();
    const act = AI.decide(E.viewFor(st, p), levels[p], rnd);
    const dt = performance.now() - t0;
    if (timing) { const k = st.phase + (st.phase === 'pick' ? '-' + st.step : '') + '-L' + levels[p] + '-' + n + 'p'; (timing[k] = timing[k] || []).push(dt); }
    const r = E.apply(st, p, act);
    if (!r.ok) { check(false, 'CPU move refused ' + JSON.stringify(act) + ' ' + r.err); return -1; }
  }
  check(st.phase === 'over', 'CPU game ends');
  return st.winner;
}
{
  const timing = {};
  for (let g = 0; g < 12; g++) cpuGame([1 + (g % 3), 1 + ((g + 1) % 3)], 500 + g, timing);
  for (let g = 0; g < 6; g++) cpuGame([3, 2, 1], 700 + g, timing);
  const rows = Object.entries(timing).map(([k, a]) => `${k}: avg ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}ms max ${Math.max(...a).toFixed(1)}ms`);
  console.log('CPU think time\n  ' + rows.sort().join('\n  '));
}
{
  // a CPU never fights hopelessly with gears to spare: hand 0+1 against a known 8+9... just check legality on many views
  check(AI.worth([5, 5], 0) > 0.49 && AI.worth([5, 5], 0) < 0.51, 'even gears are worth 50%');
  check(AI.worth([1, 5], 0) < AI.worth([3, 5], 0), 'more gears are worth more');
  check(AI.worth([2, 2, 2], 0) > 0.32 && AI.worth([2, 2, 2], 0) < 0.35, 'three even players ~1/3');
}
if (process.argv.includes('--league')) {
  const pairs = [[3, 1], [3, 2], [2, 1]];
  for (const [a, b] of pairs) {
    let wa = 0, games = 0;
    for (let g = 0; g < 120; g++) {
      const levels = g % 2 ? [a, b] : [b, a];
      const w = cpuGame(levels, 9000 + g * 7 + a * 1000 + b * 100);
      if (w < 0) continue;
      games++;
      if (levels[w] === a) wa++;
    }
    console.log(`L${a} vs L${b}: L${a} wins ${wa}/${games} (${(wa / games * 100).toFixed(0)}%)`);
  }
  let w3 = 0, n3 = 0;
  for (let g = 0; g < 90; g++) {
    const levels = [[3, 2, 1], [1, 3, 2], [2, 1, 3]][g % 3];
    const w = cpuGame(levels, 20000 + g);
    if (w < 0) continue;
    n3++; if (levels[w] === 3) w3++;
  }
  console.log(`3 players (L3, L2, L1): L3 wins ${w3}/${n3} (${(w3 / n3 * 100).toFixed(0)}%)`);
}

if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
