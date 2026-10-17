// アッシュク・エイト: rules engine tests.   node tools/asshuku-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../asshuku-eight/engine.js');
const AI = require('../asshuku-eight/ai.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ' (got ' + A + ', want ' + B + ')'); }
const D = E.digit;

/* ---------------------------------------------------------------- the cards */
{
  const kinds = {};
  for (let i = 0; i < E.NUMBERS; i++) { const k = D(i) + '/' + E.black(i); kinds[k] = (kinds[k] || 0) + 1; }
  eq(Object.keys(kinds).sort(), ['0/0', '0/1', '1/0', '1/1'], 'four kinds of card');
  ok(Object.values(kinds).every((n) => n === 22), '22 of each kind');
  eq(E.NUMBERS + E.PEN_COUNT, 96, '96 cards in the box');
  ok(E.isPen(E.PEN_BASE) && !E.isPen(87), 'penalty ids');
  eq([E.kindName(0), E.kindName(1), E.kindName(2), E.kindName(3)], ['白の0', '白の1', '黒の0', '黒の1'], 'card names');
}

/* ---------------------------------------------------------------- setup for every player count */
for (let n = 1; n <= 7; n++) {
  for (let seed = 1; seed <= 20; seed++) {
    const s = E.newGame({ n, seed });
    const all = s.hands.flat().concat(s.deck);
    ok(all.length === 88 && new Set(all).size === 88, `n=${n}: every number card once`);
    ok(s.hands.every((h) => h.length === 8), `n=${n}: hands of 8`);
    ok(s.deck.length === 88 - 8 * n, `n=${n}: deck of ${88 - 8 * n}`);
    ok(s.phase === 'add' && s.turn === s.first && s.mem.length === 0, `n=${n}: the first player lays the first card`);
    ok(s.pool.length === 8, `n=${n}: 8 penalty cards`);
  }
}
{
  const a = E.newGame({ n: 3, seed: 42 }), b = E.newGame({ n: 3, seed: 42 });
  eq(a.hands, b.hands, 'same seed, same deal');
  const solo = E.newGame({ n: 1, seed: 5, deckSize: 20 });
  eq(solo.deck.length, 20, 'a shorter deck for a solo challenge');
}

/* ---------------------------------------------------------------- one game step by step */
function play(s, a) { const r = E.apply(s, a); if (!r.ok) throw new Error('rejected ' + JSON.stringify(a) + ' ' + r.err); return r.ev; }
{
  const s = E.newGame({ n: 3, seed: 7, first: 1 });
  ok(!E.apply(s, { t: 'answer', p: 1, v: 0 }).ok, 'no answer before the first card');
  ok(!E.apply(s, { t: 'add', p: 0, card: s.hands[0][0] }).ok, 'only the player on turn');
  ok(!E.apply(s, { t: 'add', p: 1, card: s.hands[0][0] }).ok, 'only a card from your own hand');
  const c1 = s.hands[1][0];
  let ev = play(s, { t: 'add', p: 1, card: c1 });
  eq(ev.map((e) => e.k), ['add', 'draw', 'turn'], 'first card: add, draw, next player');
  eq(s.mem, [c1], 'the first card is the memory pile');
  ok(s.hands[1].length === 8 && !s.hands[1].includes(c1), 'the hand is refilled');
  eq([s.turn, s.phase], [2, 'answer'], 'the next player answers');
  ok(!E.apply(s, { t: 'answer', p: 2, v: 5 }).ok, 'answers are 0 or 1');
  // player 2 answers the only card right: the round ends, the same player adds
  ev = play(s, { t: 'answer', p: 2, v: D(c1) });
  eq(ev.map((e) => e.k), ['answer', 'reveal', 'recycle'], 'last card of a round: reveal, recycle');
  ok(ev[1].ok && ev[1].card === c1 && ev[1].pos === 1 && ev[1].len === 1, 'reveal shows the card');
  eq([s.turn, s.phase, s.round], [2, 'add', 1], 'whoever answered last adds a card');
  const c2 = s.hands[2].find((c) => D(c) !== D(c1)) ?? s.hands[2][0];
  play(s, { t: 'add', p: 2, card: c2 });
  eq(s.mem, [c1, c2], 'the new card goes on top');
  eq(E.line(s), [c2, c1], 'next round: the new card first');
  eq([s.turn, s.phase], [0, 'answer'], 'then the next player answers');
  // answer c2 (player 0) and c1 (player 1)
  play(s, { t: 'answer', p: 0, v: D(c2) });
  eq([s.turn, s.mem.length, s.chk.length], [1, 1, 1], 'one card answered, one to go');
  ev = play(s, { t: 'answer', p: 1, v: D(c1) });
  eq(ev[ev.length - 1].k, 'recycle', 'round over');
  eq(s.mem, [c2, c1], 'the checked pile comes back as it is');
  eq(E.line(s), [c1, c2], 'so the next round runs in reverse');
  const c3 = s.hands[1][3];
  play(s, { t: 'add', p: 1, card: c3 });
  eq(E.line(s), [c3, c1, c2], 'and the new card is first');
  // three answers, the third one wrong
  play(s, { t: 'answer', p: 2, v: D(c3) });
  play(s, { t: 'answer', p: 0, v: D(c1) });
  ev = play(s, { t: 'answer', p: 1, v: 1 - D(c2) });
  eq(ev.map((e) => e.k), ['answer', 'reveal', 'penalty', 'recycle'], 'a wrong answer takes a penalty card');
  ok(!ev[1].ok, 'reveal says wrong');
  eq(s.pens[1].length, 1, 'one penalty card');
  ok(s.hands[1].includes(s.pens[1][0]), 'the penalty card joins the notes');
  ok(!E.apply(s, { t: 'add', p: 1, card: s.pens[1][0] }).ok, 'a penalty card cannot be laid');
  eq(E.line(s), [c2, c1, c3], 'the line goes on after a mistake');
  // a second mistake ends the game
  play(s, { t: 'add', p: 1, card: s.hands[1].find((c) => !E.isPen(c)) });
  const top = s.mem[s.mem.length - 1];
  play(s, { t: 'answer', p: 2, v: D(top) });
  play(s, { t: 'answer', p: 0, v: D(s.mem[s.mem.length - 1]) });
  ev = play(s, { t: 'answer', p: 1, v: 1 - D(s.mem[s.mem.length - 1]) });
  eq(ev.map((e) => e.k), ['answer', 'reveal', 'penalty', 'over'], 'second penalty: game over');
  eq(s.phase, 'over', 'phase over');
  eq(s.result.loser, 1, 'the loser');
  eq(s.result.winners, [0, 2], 'everyone with the fewest penalties wins');
  eq(s.result.len, 4, 'the line had 4 cards');
  ok(!E.apply(s, { t: 'answer', p: 2, v: 0 }).ok, 'nothing after the end');
}

/* ---------------------------------------------------------------- the line keeps growing at alternate ends */
{
  const s = E.newGame({ n: 2, seed: 99 });
  const history = [];
  for (let k = 0; k < 12; k++) {
    // answer the whole round right, then add
    while (s.phase === 'answer') play(s, { t: 'answer', p: s.turn, v: D(s.mem[s.mem.length - 1]) });
    const before = E.line(s);
    const c = s.hands[s.turn].find((x) => !E.isPen(x));
    play(s, { t: 'add', p: s.turn, card: c });
    const after = E.line(s);
    ok(after.length === before.length + 1 && after[0] === c, 'the new card leads the next round');
    eq(after.slice(1), before, 'everything else in the same order');
    history.push(after.slice());
  }
  // seen in one fixed direction, new cards land on alternate ends
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], cur = history[i].slice(1).reverse();
    eq(cur, prev, 'each round is the previous one reversed');
  }
  ok(s.pens.every((x) => x.length === 0), 'right answers never cost anything');
}

/* ---------------------------------------------------------------- the deck running out */
{
  const s = E.newGame({ n: 1, seed: 3, deckSize: 5 });
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 200) {
    if (s.phase === 'answer') play(s, { t: 'answer', p: 0, v: D(s.mem[s.mem.length - 1]) });
    else play(s, { t: 'add', p: 0, card: s.hands[0].find((x) => !E.isPen(x)) });
  }
  eq(s.result.why, 'deck', 'solo: the deck runs out');
  eq(s.result.len, 5, 'a 5-card deck makes a 5-card line');
  eq(s.result.winners, [0], 'a clean solo run wins');
  eq(s.deck.length, 0, 'the deck is empty');
}

/* ---------------------------------------------------------------- views, private events, reduceView */
for (let seed = 1; seed <= 25; seed++) {
  const n = 1 + (seed % 7);
  const s = E.newGame({ n, seed });
  const views = [];
  for (let p = 0; p < n; p++) views.push(E.viewFor(s, p));
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 3000) {
    const p = s.turn;
    const a = AI.act(s, p, 1 + (seed % 3), E.mulberry32(seed * 31 + guard));
    const r = E.apply(s, Object.assign({ p }, a));
    ok(r.ok, 'CPU moves are legal');
    if (!r.ok) break;
    for (let q = 0; q < n; q++) {
      let v = views[q];
      const evq = E.evFor(r.ev, q);
      for (const e of evq) {
        if (e.k === 'draw' && e.p !== q) ok(e.card === -1, 'others do not see what you draw');
        v = E.reduceView(v, e);
      }
      const want = E.viewFor(s, q);
      ok(JSON.stringify(v) === JSON.stringify(want), `seed ${seed}: replaying events gives the same view (player ${q})`);
      views[q] = want;
    }
  }
  const v = E.viewFor(s, 0);
  ok(!('memCards' in v) && typeof v.mem === 'number', 'the memory pile is only a count');
}
{
  const s = E.newGame({ n: 2, seed: 11 });
  const v = E.viewFor(s, 1);
  ok(JSON.stringify(v).indexOf(JSON.stringify(s.deck)) < 0, 'the deck order is not in a view');
  eq(v.hand, s.hands[1], 'you see your own hand');
}

/* ---------------------------------------------------------------- CPU */
{
  const s = E.newGame({ n: 2, seed: 4 });
  play(s, { t: 'add', p: s.turn, card: s.hands[s.turn][0] });
  for (const lv of [1, 2, 3]) eq(AI.slipChance(s, lv), 0, 'a card just shown is never missed (level ' + lv + ')');
  // a long, busy line makes the weak CPU slip more than the strong one
  const t = E.newGame({ n: 1, seed: 8 });
  for (let k = 0; k < 24; k++) {
    while (t.phase === 'answer') play(t, { t: 'answer', p: 0, v: D(t.mem[t.mem.length - 1]) });
    const want = k % 2;
    const c = t.hands[0].find((x) => !E.isPen(x) && D(x) === want) ?? t.hands[0].find((x) => !E.isPen(x));
    play(t, { t: 'add', p: 0, card: c });
  }
  play(t, { t: 'answer', p: 0, v: D(t.mem[t.mem.length - 1]) });
  play(t, { t: 'answer', p: 0, v: D(t.mem[t.mem.length - 1]) });
  play(t, { t: 'answer', p: 0, v: D(t.mem[t.mem.length - 1]) });
  const p1 = AI.slipChance(t, 1), p3 = AI.slipChance(t, 3);
  ok(p1 > p3 && p1 > 0.2 && p3 < 0.3, 'weak CPUs slip more on a long line (' + p1.toFixed(3) + ' vs ' + p3.toFixed(3) + ')');
  const add = AI.add(t, 0, 2);
  ok(t.hands[0].includes(add) && !E.isPen(add), 'the CPU lays a card it holds');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
