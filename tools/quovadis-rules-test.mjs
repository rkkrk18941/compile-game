// クォ・ヴァディス: rules tests for quo-vadis/engine.js (node tools/quovadis-rules-test.mjs).
// Each rule from the rulebook (Hans im Glück 1992 / AMIGO 2005) is checked on a set-up position.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../quo-vadis/engine.js');
const D = require('../quo-vadis/data.js');
const AI = require('../quo-vadis/ai.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
const sid = (p, k) => p * D.SENATORS + k;
function game(n = 4, opts = {}, first = 0) {
  const players = []; for (let i = 0; i < n; i++) players.push({ name: 'P' + i, kind: 'cpu', level: 2, color: D.PLAYER_COLORS[i].key });
  return E.newGame({ players, seed: 42, first, opts });
}
function clear(st) { D.COMMITTEES.forEach((c) => st.occ[c.id].fill(-1)); st.senate.length = 0; st.players.forEach((p) => { p.left = D.SENATORS; }); }
function put(st, cid, ...sids) { sids.forEach((s, i) => { st.occ[cid][i] = s; st.players[Math.floor(s / D.SENATORS)].left--; }); }

/* ------------------------------------------------ the board and the box */
{
  eq(D.COMMITTEES.length, 14, '14 committees besides the Senate');
  eq(D.ENTRY.map((c) => D.COM[c].seats).sort(), [1, 1, 3, 5], 'the four lowest committees: 1, 1, 3 and 5 seats');
  eq(D.LAUREL_PATHS.length, 10, '10 laurel spaces');
  ok(D.PATHS.every((p) => p.laurel === (D.COM[p.from].seats > 1)), 'laurel spaces on every path out of a 3- or 5-seat committee, none out of a 1-seat one');
  eq(D.IN.S.length, 3, 'three paths lead into the Senate');
  eq(D.PATH[D.CAESAR_START].to, 'S', 'Caesar starts on the laurel directly below the Senate');
  eq(D.COM[D.PATH[D.CAESAR_START].from].seats, 5, 'the committee directly below the Senate has five seats');
  ok(D.COMMITTEES.every((c) => (D.OUT[c.id] || []).length >= 1 && (D.OUT[c.id] || []).length <= 2), 'every committee leads up to one or two others');
  ok(D.COMMITTEES.filter((c) => !c.entry).every((c) => (D.IN[c.id] || []).length >= 1 && (D.IN[c.id] || []).length <= 2), 'every higher committee has one or two paths into it');
  ok(D.COMMITTEES.every((c) => D.DIST[c.id] >= 1), 'every committee can reach the Senate');
  const tiles = D.TILE_SET.reduce((s, t) => s + t.n, 0);
  eq([D.ONES, tiles], [18, 44], '18 "I" laurels and 44 others (8 II, 6 II Caesar, 15 III, 9 IV, 6 V)');
  eq(D.TILE_SET.map((t) => [t.v, !!t.c, t.n]), [[2, false, 8], [2, true, 6], [3, false, 15], [4, false, 9], [5, false, 6]], 'the laurel tiles of the 2005 edition');
}

/* ------------------------------------------------ setting up */
for (const n of [3, 4, 5]) {
  const st = game(n);
  eq(st.players.map((p) => p.left), Array(n).fill(8), `${n} players: 8 senators each`);
  ok(D.LAUREL_PATHS.every((p) => st.spaces[p] && st.spaces[p].v >= 2), `${n} players: a face-up laurel (II–V) on each of the 10 spaces`);
  eq(st.bag.length, 34, `${n} players: the other 34 laurels form the face-down supply`);
  eq(st.ones, 18, `${n} players: 18 "I" laurels beside the board`);
  eq(st.caesar, D.CAESAR_START, `${n} players: Caesar on the laurel below the Senate`);
}
eq([3, 4, 5].map((n) => game(n, { oneLimit: true }).ones), [10, 14, 18], 'variant: 10 / 14 / 18 "I" laurels');
{
  let threw = false; try { game(2); } catch (e) { threw = true; }
  ok(threw, 'two players are not allowed (3 to 5)');
}

/* ------------------------------------------------ placing */
{
  const st = game(4);
  ok(!E.apply(st, 0, { t: 'place', c: 'B2' }).ok, 'place only in the four lowest committees');
  ok(!E.apply(st, 1, { t: 'place', c: 'A2' }).ok, 'only on your own turn');
  const r = E.apply(st, 0, { t: 'place', c: 'A1' });
  ok(r.ok && st.occ.A1[0] === sid(0, 0) && st.players[0].left === 7, 'a senator from the supply onto a free seat');
  eq(st.turn, 1, 'play passes clockwise');
  ok(!E.apply(st, 1, { t: 'place', c: 'A1' }).ok, 'not onto a full committee');
  st.players[1].left = 0;
  ok(!E.apply(st, 1, { t: 'place', c: 'A2' }).ok, 'not without senators in the supply');
}

/* ------------------------------------------------ moving out of a 1-seat committee */
{
  const st = game(4); clear(st); put(st, 'A1', sid(0, 0));
  const info = E.moveInfo(st, 0, 'A1', 'B2');
  ok(info.ok && info.free && !info.laurel, 'a 1-seat committee is left without consent, and its paths carry no laurel');
  const pts = st.players[0].pts;
  ok(E.apply(st, 0, { t: 'move', from: 'A1', to: 'B2' }).ok && st.occ.B2[0] === sid(0, 0) && st.players[0].pts === pts, 'free move, no laurel');
}
/* paths and seats */
{
  const st = game(4); clear(st); put(st, 'A1', sid(0, 0));
  ok(!E.moveInfo(st, 0, 'A1', 'C1').ok, 'committees cannot be skipped');
  ok(!E.moveInfo(st, 0, 'A1', 'B3').ok, 'only along a path');
  put(st, 'B1', sid(1, 0));
  eq(E.moveInfo(st, 0, 'A1', 'B1').why, 'full', 'the next committee needs a free seat (and may not be skipped even then)');
  ok(E.moveInfo(st, 0, 'A1', 'B2').ok, 'any upward path may be taken');
  ok(!E.moveInfo(st, 0, 'B2', 'A1').ok, 'senators never move down');
}

/* ------------------------------------------------ 3-seat committees */
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0));
  eq(E.moveInfo(st, 0, 'A3', 'B3').why, 'fewvoters', 'alone in a 3-seat committee: no move');
  st.occ.A3[1] = sid(0, 1); st.players[0].left--;
  const self = E.moveInfo(st, 0, 'A3', 'B3');
  ok(self.ok && self.free && self.laurel, 'own second senator gives the consent');
  const tile = st.spaces['A3-B3'], top = st.bag[st.bag.length - 1];
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' });
  eq(st.players[0].pts, tile.v, 'the mover takes the laurel on the path');
  eq(st.spaces['A3-B3'], top, 'and a new one is laid face up from the supply');
  eq(st.ones, 18, 'own consent earns no "I"');
}
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(1, 0), sid(2, 0));
  const info = E.moveInfo(st, 0, 'A3', 'B3');
  eq([info.need, info.own, info.ext, info.avail], [1, 0, 1, { 1: 1, 2: 1 }], '3-seat: exactly one other senator must consent');
  ok(!E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' }).ok, 'no consent, no move');
  ok(!E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1, 2: 1 } }).ok, 'exactly the consents needed (the mover picks whom)');
  ok(!E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 3: 1 } }).ok, 'only senators sitting in that committee vote');
  const r = E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 2: 1 } });
  ok(r.ok && st.players[2].pts === 1 && st.ones === 17, 'a consenting player of another colour gets an "I" laurel');
}

/* ------------------------------------------------ 5-seat committees */
{
  const st = game(4); clear(st); put(st, 'A2', sid(0, 0), sid(1, 0));
  eq(E.moveInfo(st, 0, 'A2', 'B2').why, 'fewvoters', 'a 5-seat committee with one other senator: no move');
  st.occ.A2[2] = sid(1, 1); st.players[1].left--;
  const info = E.moveInfo(st, 0, 'A2', 'B2');
  eq([info.need, info.ext, info.avail], [2, 2, { 1: 2 }], '5-seat: two other senators must consent');
  const r = E.apply(st, 0, { t: 'move', from: 'A2', to: 'B2', votes: { 1: 2 } });
  ok(r.ok && st.players[1].pts === 2 && st.players[1].ones === 2, 'two consents from one player: two "I" laurels');
}
{
  const st = game(4); clear(st); put(st, 'A2', sid(0, 0), sid(0, 1), sid(2, 0));
  const info = E.moveInfo(st, 0, 'A2', 'B2');
  eq([info.own, info.ext], [1, 1], 'own senator gives one of the two consents');
  ok(E.apply(st, 0, { t: 'move', from: 'A2', to: 'B2', votes: { 2: 1 } }).ok, 'and another player the second');
}
{
  const st = game(4); clear(st); put(st, 'A2', sid(0, 0), sid(0, 1), sid(0, 2));
  ok(E.moveInfo(st, 0, 'A2', 'B2').free, 'three of your own in a 5-seat committee: no one else needed');
}

/* ------------------------------------------------ deals made this turn are paid at once */
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(1, 0));
  st.players[0].pts = 2;
  const v = st.spaces['A3-B3'].v;
  ok(!E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, pay: { 1: 3 + v } }).ok, 'cannot pay more than you have (plus the laurel of this move)');
  ok(!E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, pay: { 2: 1 } }).ok, 'payments go to the voters of this move');
  const r = E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, pay: { 1: 2 + v } });
  ok(r.ok && st.players[0].pts === 0 && st.players[1].pts === 3 + v, 'the share of the laurel just taken can be paid too (2 + laurel, plus the "I")');
}

/* ------------------------------------------------ Caesar */
{
  const st = game(4); clear(st); put(st, 'D2', sid(0, 0));
  st.caesar = 'D2-S';
  const info = E.moveInfo(st, 0, 'D2', 'S');
  ok(info.ok && info.free && info.caesar && !info.laurel, 'with Caesar on the path, the committee below is left without consent');
  const tile = st.spaces['D2-S'];
  E.apply(st, 0, { t: 'move', from: 'D2', to: 'S' });
  ok(st.players[0].pts === 0 && st.spaces['D2-S'] === tile, 'and Caesar\'s laurel cannot be taken, not even by the mover');
}
{
  const st = game(4);
  ok(!E.apply(st, 0, { t: 'caesar', to: st.caesar }).ok, 'Caesar must go to another laurel');
  ok(!E.apply(st, 0, { t: 'caesar', to: 'A1-B1' }).ok, 'only onto a laurel space');
  ok(E.apply(st, 0, { t: 'caesar', to: 'A2-B2' }).ok && st.caesar === 'A2-B2' && st.turn === 1, 'moving Caesar is a whole action');
}
{
  // a "II Caesar" laurel lets the mover move Caesar after the move — or whoever the deal names
  for (const by of [0, 1]) {
    const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(1, 0));
    st.spaces['A3-B3'] = { id: 99, v: 2, c: true };
    const r = E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, caesarBy: by });
    ok(r.ok && st.phase === 'bonus' && st.bonus.by === by && st.turn === 0, `II Caesar: a bonus Caesar move for ${by === 0 ? 'the mover' : 'the voter named in the deal'}`);
    ok(!E.apply(st, by === 0 ? 1 : 0, { t: 'bonus', to: 'C1-D1' }).ok, 'only that player chooses');
    ok(E.apply(st, by, { t: 'bonus', to: 'C1-D1' }).ok && st.caesar === 'C1-D1' && st.turn === 1, 'then play goes on');
  }
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(0, 1));
  st.spaces['A3-B3'] = { id: 99, v: 2, c: true };
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' });
  const cz = st.caesar;
  ok(E.apply(st, 0, { t: 'bonus', to: null }).ok && st.caesar === cz && st.turn === 1, 'the bonus may be left unused');
  const st2 = game(4); clear(st2); put(st2, 'A3', sid(0, 0), sid(1, 0));
  st2.spaces['A3-B3'] = { id: 99, v: 2, c: true };
  ok(!E.apply(st2, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, caesarBy: 3 }).ok, 'only the mover or a voter can be handed the Caesar move');
}

/* ------------------------------------------------ the supplies run out */
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(1, 0));
  st.ones = 0;
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 } });
  eq(st.players[1].pts, 0, 'no "I" laurels left: consent earns nothing');
}
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(0, 1), sid(0, 2));
  st.bag.length = 0;
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' });
  eq(st.spaces['A3-B3'], null, 'empty supply: the space stays empty');
  st.turn = 0;
  const before = st.players[0].pts;
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' });
  eq(st.players[0].pts, before, 'and nothing more is taken there');
}

/* ------------------------------------------------ the Senate and the end */
{
  const st = game(3); clear(st);
  st.senate.push(sid(0, 0), sid(1, 0), sid(0, 1));
  put(st, 'D2', sid(1, 1), sid(1, 2), sid(1, 3), sid(1, 4)); put(st, 'D1', sid(2, 0), sid(2, 1));
  st.caesar = 'D2-S';                                  // Caesar's path: no laurels change hands
  st.players[0].pts = 10; st.players[1].pts = 10; st.players[2].pts = 30;
  st.turn = 1;
  ok(E.apply(st, 1, { t: 'move', from: 'D2', to: 'S' }).ok && st.phase === 'play' && st.senate.length === 4, 'the fourth senator enters; the game goes on');
  st.turn = 1;
  E.apply(st, 1, { t: 'move', from: 'D2', to: 'S' });
  eq([st.phase, st.senate.length], ['over', 5], 'the game ends the moment the fifth senator enters the Senate');
  const res = st.over;
  ok(res.rows.find((r) => r.p === 2).qualified === false, 'a player without a senator in the Senate does not qualify');
  ok(res.winner !== 2, '... and cannot win, even with the most laurels');
  eq(res.winner, 0, 'tie on laurels: whoever reached the Senate first wins');
  ok(!E.apply(st, st.turn, { t: 'place', c: 'A1' }).ok, 'nothing happens after the end');
  const st2 = game(3); clear(st2);
  st2.senate.push(sid(0, 0), sid(1, 0), sid(0, 1), sid(1, 1));
  put(st2, 'D2', sid(1, 2), sid(1, 3), sid(1, 4));
  st2.players[0].pts = 10; st2.players[1].pts = 11; st2.turn = 1; st2.caesar = 'A2-B2';
  E.apply(st2, 1, { t: 'move', from: 'D2', to: 'S' });
  eq(st2.over.winner, 1, 'otherwise the most laurels wins');
  eq(D.SENATE.seatXZ.length, 5, 'the Senate has five seats');
}
{
  const st = game(4); clear(st); put(st, 'D2', sid(0, 0));
  st.senate.push(sid(1, 0), sid(2, 0), sid(3, 0), sid(1, 1));
  st.caesar = 'D2-S';
  st.spaces['D2-S'] = { id: 98, v: 2, c: true };
  E.apply(st, 0, { t: 'move', from: 'D2', to: 'S' });
  eq(st.phase, 'over', 'the end comes before any Caesar bonus');
}

/* ------------------------------------------------ promises (not binding) */
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(1, 0)); put(st, 'A2', sid(1, 1), sid(0, 1), sid(0, 2));
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, promise: [1] });
  ok(E.owes(st, 0, 1), 'a promise of future support is noted');
  st.turn = 1;
  E.apply(st, 1, { t: 'move', from: 'A2', to: 'B2', votes: { 0: 2 } });
  ok(!E.owes(st, 0, 1) && st.promises[0].done === 'kept', 'consenting later keeps it');
  const st2 = game(4); clear(st2); put(st2, 'A3', sid(0, 0), sid(1, 0));
  E.apply(st2, 0, { t: 'move', from: 'A3', to: 'B3', votes: { 1: 1 }, promise: [1] });
  eq(E.breakPromise(st2, 0, 1).length, 1, 'refusing breaks it (nothing else happens: promises are not binding)');
}

/* ------------------------------------------------ what each player sees */
{
  const st = game(4); clear(st); put(st, 'A3', sid(0, 0), sid(0, 1));
  E.apply(st, 0, { t: 'move', from: 'A3', to: 'B3' });
  const v = E.viewFor(st, 1);
  ok(v.players[0].pts === null && v.players[1].pts === 0 && v.players[0].tiles === 1, 'laurel totals are secret (tile counts are not)');
  eq(v.bag, st.bag.length, 'the face-down supply is only a count');
  const open = game(4, { open: true }); clear(open); put(open, 'A3', sid(0, 0), sid(0, 1));
  E.apply(open, 0, { t: 'move', from: 'A3', to: 'B3' });
  ok(E.viewFor(open, 1).players[0].pts > 0, 'option: everyone\'s laurels shown');
}
{
  const st = game(4, { reveal: true }); clear(st); put(st, 'D2', sid(0, 0), sid(0, 1), sid(0, 2));
  const r = E.apply(st, 0, { t: 'move', from: 'D2', to: 'S' });
  ok(r.ev.some((e) => e.e === 'reveal' && e.idx === 1), 'variant: laurels revealed after the first senator enters');
}

/* ------------------------------------------------ the CPU only makes legal moves and answers sensibly */
{
  const st = game(4); clear(st); put(st, 'D2', sid(0, 0), sid(1, 0), sid(2, 0));
  st.senate.push(sid(1, 1), sid(2, 1), sid(3, 0), sid(1, 2));
  st.players[1].pts = 40; st.players[0].pts = 5; st.caesar = 'A2-B2';
  st.turn = 1;
  const ans = AI.respond(st, 0, { mover: 1, from: 'D2', to: 'S', votes: 1, pay: 0 }, 3);
  ok(!ans.ok, 'a CPU does not let the leader end the game while it would lose');
  for (let s = 1; s <= 30; s++) {
    const g = game(3 + (s % 3)); const rnd = E.mulberry32(s);
    for (let k = 0; k < 40 && g.phase !== 'over'; k++) {
      if (g.phase === 'bonus') { E.apply(g, g.bonus.by, { t: 'bonus', to: AI.bonus(g, g.bonus.by, 2, rnd) }); continue; }
      const c = AI.decide(g, g.turn, 1 + (s % 3), rnd)[0];
      const r = E.apply(g, g.turn, c.act);
      if (!r.ok) { ok(false, 'CPU plan rejected: ' + r.err + ' ' + JSON.stringify(c.act)); break; }
    }
  }
  ok(true, 'CPU plans are legal');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
