// ハシッコ・セブン: rules engine tests.   node tools/hashikko-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../hashikko-seven/engine.js');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ' (got ' + A + ', want ' + B + ')'); }
const C = (v, k = 0) => (v - 1) * 3 + k;                 // the k-th copy of number v
const nums = (ids) => ids.map(E.num);

/* ---------------------------------------------------------------- setup for every player count */
for (const n of [2, 3, 4, 5]) {
  const S = E.SETUP[n];
  for (let seed = 1; seed <= 30; seed++) {
    const s = E.newGame({ n, seed });
    const all = s.hands.flat().concat(s.field);
    ok(all.length === S.top * 3, `n=${n}: ${S.top * 3} cards in play`);
    ok(new Set(all).size === all.length, `n=${n}: no card twice`);
    for (let v = 1; v <= 12; v++) {
      const k = all.filter((c) => E.num(c) === v).length;
      if (v <= S.top) ok(k === 3, `n=${n}: three ${v}s`); else ok(k === 0, `n=${n}: no ${v}s`);
    }
    ok(s.hands.every((h) => h.length === S.hand), `n=${n}: hands of ${S.hand}`);
    ok(s.field.length === S.field, `n=${n}: field of ${S.field}`);
    ok(s.hands.every((h) => h.every((c, i) => i === 0 || h[i - 1] < c)), `n=${n}: hands sorted`);
    ok(s.turn >= 0 && s.turn < n && s.turn === s.first, `n=${n}: a first player`);
  }
}
eq([E.SETUP[2].top, E.SETUP[3].top, E.SETUP[4].top, E.SETUP[5].top], [10, 11, 12, 12], 'numbers by player count');

/* ---------------------------------------------------------------- winning */
eq(E.winHow([7]), 'seven', '7s win at once');
eq(E.winHow([2, 9, 7]), 'seven', '7s among others');
eq(E.winHow([1, 2, 11]), 'three', 'three trios');
eq(E.winHow([3, 4]), 'sum7', '3 + 4');
eq(E.winHow([6, 1]), 'sum7', '6 + 1');
eq(E.winHow([12, 5]), 'diff7', '12 - 5');
eq(E.winHow([4, 11]), 'diff7', '11 - 4');
eq(E.winHow([2, 9]), 'diff7', '9 - 2');
eq(E.winHow([3, 5]), null, '3 and 5 do not win');
eq(E.winHow([6, 12]), null, '6 and 12 do not win');
eq(E.winHow([1]), null, 'one trio does not win');
eq(E.winNumbers([], 12), [7], 'no trio: only 7');
eq(E.winNumbers([3], 12), [4, 7, 10], 'after 3: 4, 7, 10');
eq(E.winNumbers([12], 12), [5, 7], 'after 12: 5, 7');
eq(E.winNumbers([3], 12, { 4: true }), [7, 10], 'taken numbers are not offered');
eq(E.winNumbers([1, 2], 10), [3, 4, 5, 6, 7, 8, 9, 10], 'two trios: anything');

/* ---------------------------------------------------------------- a fixed 3-player deal (numbers 1-11)
   p0: 1 1 2 3 5 5 9 11     p1: 2 4 4 6 7 8 10 10     p2: 1 3 3 5 6 6 7 9      field: 2 4 7 8 8 9 10 11 11  */
function deal3() {
  const used = {};
  const take = (v) => { const k = used[v] || 0; used[v] = k + 1; if (k > 2) throw new Error('too many ' + v); return C(v, k); };
  const hands = [[1, 1, 2, 3, 5, 5, 9, 11], [2, 4, 4, 6, 7, 8, 10, 10], [1, 3, 3, 5, 6, 6, 7, 9]].map((h) => h.map(take));
  const field = [2, 4, 7, 8, 8, 9, 10, 11, 11].map(take);
  return E.newGame({ n: 3, seed: 7, first: 0, deal: { hands, field } });
}
let s = deal3();
eq(s.hands.map(nums), [[1, 1, 2, 3, 5, 5, 9, 11], [2, 4, 4, 6, 7, 8, 10, 10], [1, 3, 3, 5, 6, 6, 7, 9]], 'fixed deal');
// min of p0 twice: the first 1 goes in front, so the second ask shows the other 1
let r = E.apply(s, { t: 'hand', p: 0, who: 0, end: 'min' });
ok(r.ok && r.ev.length === 1 && r.ev[0].k === 'reveal' && r.ev[0].v === 1, 'p0 reveals own smallest: 1');
eq(nums(s.front[0]), [1], 'the 1 lies in front of p0');
eq(s.hands[0].length, 7, 'p0 holds 7 now');
r = E.apply(s, { t: 'hand', p: 0, who: 0, end: 'min' });
ok(r.ok && r.ev[0].v === 1 && s.chal.length === 2, 'asking the same end again shows the next card: the other 1');
// a wrong turn is refused
eq(E.apply(s, { t: 'field', p: 1, i: 0 }).err, 'turn', 'only the player to move can reveal');
// third 1 is p2's smallest
r = E.apply(s, { t: 'hand', p: 0, who: 2, end: 'min' });
ok(r.ok, 'third reveal ok');
eq(r.ev.map((e) => e.k), ['reveal', 'trio', 'turn'], 'three 1s: trio, then the next player');
eq(s.trios[0].map((t) => t.v), [1], 'p0 keeps the 1s');
eq(nums(s.hands[0]), [2, 3, 5, 5, 9, 11], 'p0 hand without the 1s');
eq(nums(s.hands[2]), [3, 3, 5, 6, 6, 7, 9], 'p2 hand without its 1');
ok(s.front.every((f) => f.length === 0), 'nothing left in front');
eq(s.turn, 1, 'turn passes to p1');
eq(s.log[0], { p: 0, t: 1, ok: true, r: [{ w: 0, e: 0, v: 1 }, { w: 0, e: 0, v: 1 }, { w: 2, e: 0, v: 1 }], v: 1 }, 'log of the challenge');
// p1: field 2 (slot 0), then p0's min (2), then p1's own min (2) -> trio of 2s
r = E.apply(s, { t: 'field', p: 1, i: 0 }); ok(r.ok && r.ev[0].v === 2 && s.up[0], 'field slot 0 is a 2, face up');
eq(E.apply(s, { t: 'field', p: 1, i: 0 }).err, 'up', 'a face-up field card cannot be revealed again');
r = E.apply(s, { t: 'hand', p: 1, who: 0, end: 'min' }); ok(r.ok && r.ev[0].v === 2, 'p0 smallest is now 2');
r = E.apply(s, { t: 'hand', p: 1, who: 1, end: 'min' }); ok(r.ok && r.ev[0].v === 2 && r.ev[1].k === 'trio', 'p1 smallest 2: trio');
eq(s.field[0], null, 'the field slot is empty now');
eq(E.apply(s, { t: 'field', p: 2, i: 0 }).err, 'gone', 'an empty slot cannot be revealed');
eq(s.turn, 2, 'p2 to move');
// p2: own max (9), then p0 max (11): fail. Both go back, sorted
r = E.apply(s, { t: 'hand', p: 2, who: 2, end: 'max' }); ok(r.ok && r.ev[0].v === 9, 'p2 own largest 9');
r = E.apply(s, { t: 'hand', p: 2, who: 0, end: 'max' });
ok(r.ok && r.ev[0].v === 11, 'p0 largest 11');
eq(r.ev.map((e) => e.k), ['reveal', 'fail', 'turn'], 'a different number: fail and next player');
eq(nums(s.hands[0]), [3, 5, 5, 9, 11], 'p0 got the 11 back');
eq(nums(s.hands[2]), [3, 3, 5, 6, 6, 7, 9], 'p2 got the 9 back');
eq(s.turn, 0, 'back to p0');
eq(s.last, { p: 2, ok: false, v: 9, bad: 11, t: 3 }, 'last challenge');
// p0: field 7 (slot 2), p1 ... p1 has 7 in the middle; p2's 7 is under the 9: reveal p2 max -> 9: fail
r = E.apply(s, { t: 'field', p: 0, i: 2 }); ok(r.ok && r.ev[0].v === 7, 'field 7');
r = E.apply(s, { t: 'hand', p: 0, who: 2, end: 'max' }); ok(r.ok && r.ev[1].k === 'fail', 'p2 largest is 9: fail');
ok(!s.up[2] && E.num(s.field[2]) === 7, 'the field 7 is face down again in its place');
// a field-and-hand fail with cards from two hands
s = deal3();
E.apply(s, { t: 'hand', p: 0, who: 1, end: 'max' });   // p1 10
E.apply(s, { t: 'hand', p: 0, who: 1, end: 'max' });   // p1 10 again
eq(nums(s.front[1]), [10, 10], 'two 10s in front of p1');
r = E.apply(s, { t: 'field', p: 0, i: 8 });            // 11: fail
eq(r.ev[1].k, 'fail', 'third card 11: fail');
eq(nums(s.hands[1]), [2, 4, 4, 6, 7, 8, 10, 10], 'p1 hand restored in order');
// one card hand: min and max are the same card
s = E.newGame({ n: 2, seed: 3, first: 0, deal: { hands: [[C(5)], [C(5, 1), C(6)]], field: [C(5, 2), C(6, 1), C(6, 2)] } });
eq(E.legalActions(s).filter((a) => a.t === 'hand' && a.who === 0).length, 1, 'a one-card hand offers one hand action');
r = E.apply(s, { t: 'hand', p: 0, who: 0, end: 'max' }); ok(r.ok && r.ev[0].v === 5, 'max of a one-card hand works too');
eq(E.apply(s, { t: 'hand', p: 0, who: 0, end: 'min' }).err, 'empty', 'an empty hand cannot be asked');
r = E.apply(s, { t: 'hand', p: 0, who: 1, end: 'min' }); r = E.apply(s, { t: 'field', p: 0, i: 0 });
eq(r.ev.map((e) => e.k), ['reveal', 'trio', 'turn'], 'trio of 5s from hand, hand, field');
eq(s.hands[0].length, 0, 'p0 has no cards left and still plays');

/* ---------------------------------------------------------------- the three ways to win */
function quickWin(handNums0, handNums1, fieldNums, moves) {
  const used = {}; const take = (v) => { const k = used[v] || 0; used[v] = k + 1; return C(v, k); };
  const st = E.newGame({ n: 2, seed: 1, first: 0, deal: { hands: [handNums0.map(take), handNums1.map(take)], field: fieldNums.map(take) } });
  let last = null;
  for (const m of moves) { last = E.apply(st, Object.assign({ p: st.turn }, m)); if (!last.ok) throw new Error(JSON.stringify(m) + ' ' + last.err); }
  return st;
}
s = quickWin([7, 7], [1], [7, 2], [{ t: 'hand', who: 0, end: 'min' }, { t: 'hand', who: 0, end: 'min' }, { t: 'field', i: 0 }]);
ok(s.phase === 'over' && s.winner === 0 && s.win === 'seven', 'the 7s win at once');
s = quickWin([3, 3, 3], [4, 4, 4], [1, 9],
  [{ t: 'hand', who: 0, end: 'min' }, { t: 'hand', who: 0, end: 'min' }, { t: 'hand', who: 0, end: 'min' },
   { t: 'field', i: 1 }, { t: 'field', i: 0 },                   // p1 fails
   { t: 'hand', who: 1, end: 'min' }, { t: 'hand', who: 1, end: 'min' }, { t: 'hand', who: 1, end: 'min' }]);
ok(s.phase === 'over' && s.winner === 0 && s.win === 'sum7', '3 and 4: sum 7');
eq(s.log.length, 3, 'three challenges logged');
s = quickWin([5, 5, 5, 12, 12, 12], [1], [1, 1],
  [{ t: 'hand', who: 0, end: 'min' }, { t: 'hand', who: 0, end: 'min' }, { t: 'hand', who: 0, end: 'min' },
   { t: 'hand', who: 1, end: 'min' }, { t: 'field', i: 0 }, { t: 'field', i: 1 },
   { t: 'hand', who: 0, end: 'max' }, { t: 'hand', who: 0, end: 'max' }, { t: 'hand', who: 0, end: 'max' }]);
ok(s.phase === 'over' && s.winner === 0 && s.win === 'diff7', '12 and 5: difference 7 (p1 took the 1s on the way)');
eq(s.trios[1].map((t) => t.v), [1], 'p1 kept the 1s');
const MIN0 = { t: 'hand', who: 0, end: 'min' };
s = quickWin([3, 3, 3, 5, 5, 5, 9, 9, 9], [1, 2], [1, 1, 2, 2],
  [MIN0, MIN0, MIN0,                                             // p0: 3s
   { t: 'hand', who: 1, end: 'min' }, { t: 'hand', who: 1, end: 'max' },   // p1: 1 then 2, fail
   MIN0, MIN0, MIN0]);                                           // p0: 5s
ok(s.phase === 'play' && s.trios[0].length === 2, '3 and 5 is not a win');
E.apply(s, { t: 'field', p: 1, i: 0 }); E.apply(s, { t: 'field', p: 1, i: 2 });   // p1: 1 then 2, fail
eq(s.turn, 0, 'p0 again');
for (let k = 0; k < 3; k++) E.apply(s, { t: 'hand', p: 0, who: 0, end: 'max' });
ok(s.phase === 'over' && s.win === 'three' && s.winner === 0, 'the third trio wins');
eq(E.apply(s, { t: 'field', p: s.turn, i: 1 }).err, 'over', 'nothing after the end');

/* ---------------------------------------------------------------- views hide what they must */
s = E.newGame({ n: 4, seed: 99, first: 2 });
let v = E.viewFor(s, 1);
eq(v.hand, s.hands[1], 'my own hand is in my view');
ok(!('hands' in v), 'other hands are not');
eq(v.counts, [7, 7, 7, 7], 'hand counts');
ok(v.field.every((c) => c === -1), 'field face down');
E.apply(s, { t: 'field', p: 2, i: 3 });
v = E.viewFor(s, 1);
eq(v.field[3], s.field[3], 'a revealed field card shows');
ok(v.field.filter((c) => c === -1).length === 7, 'the others stay hidden');
eq(E.viewActions(v), E.legalActions(s), 'view actions match the engine');

/* ---------------------------------------------------------------- random games: termination, conservation, replay
   The players here peek: at the start of a challenge they sometimes go straight for a trio they can reach
   (that keeps games short); otherwise they reveal at random. */
function reachableTrio(st) {
  const out = [];
  for (let v = 1; v <= st.top; v++) {
    const plan = [];
    st.field.forEach((c, i) => { if (c != null && E.num(c) === v) plan.push({ t: 'field', i }); });
    st.hands.forEach((h, w) => {
      const k = h.filter((c) => E.num(c) === v).length;
      if (!k) return;
      const end = h.every((c) => E.num(c) >= v) ? 'min' : h.every((c) => E.num(c) <= v) ? 'max' : null;
      if (end) for (let j = 0; j < k; j++) plan.push({ t: 'hand', who: w, end });
    });
    if (plan.length === 3) out.push(plan);
  }
  return out;
}
let games = 0; const wins = { seven: 0, three: 0, sum7: 0, diff7: 0 }; const lens = [];
for (let g = 0; g < 600; g++) {
  const n = 2 + (g % 4);
  const st = E.newGame({ n, seed: 1000 + g });
  const rng = E.mulberry32(5 + g);
  let views = [];
  for (let p = 0; p < n; p++) views.push(E.viewFor(st, p));
  try {
    let steps = 0, plan = [];
    while (st.phase === 'play') {
      if (steps++ > 3000) throw new Error('game did not end');
      const acts = E.legalActions(st);
      if (!acts.length) throw new Error('no legal action');
      const vw = E.viewFor(st, st.turn);
      if (JSON.stringify(E.viewActions(vw)) !== JSON.stringify(acts)) throw new Error('view actions differ');
      if (!st.chal.length) { const tr = reachableTrio(st); plan = tr.length && rng() < 0.35 ? tr[Math.floor(rng() * tr.length)].slice() : []; }
      const a = plan.length ? plan.shift() : acts[Math.floor(rng() * acts.length)];
      const r2 = E.apply(st, Object.assign({ p: st.turn }, a));
      if (!r2.ok) throw new Error('legal action refused: ' + r2.err);
      // every card is somewhere exactly once
      const where = st.hands.flat().concat(st.front.flat(), st.field.filter((c) => c != null), st.trios.flat().flatMap((t) => t.cards));
      if (where.length !== E.SETUP[n].top * 3 || new Set(where).size !== where.length) throw new Error('card conservation');
      if (st.hands.some((h) => h.some((c, i) => i && h[i - 1] > c))) throw new Error('hand out of order');
      // replay: every player's view stepped by the events equals the new view
      for (let p = 0; p < n; p++) {
        let rv = views[p];
        for (const e of r2.ev) rv = E.reduceView(rv, e);
        const fresh = E.viewFor(st, p);
        if (JSON.stringify(rv) !== JSON.stringify(fresh)) throw new Error('reduceView differs for p' + p + ' after ' + JSON.stringify(r2.ev));
        views[p] = fresh;
        if (p !== st.turn && Object.keys(fresh).includes('hands')) throw new Error('leak');
      }
    }
    if (!E.winHow(st.trios[st.winner].map((t) => t.v))) throw new Error('winner without a win');
    st.trios.forEach((ts, p) => { if (p !== st.winner && E.winHow(ts.map((t) => t.v))) throw new Error('two winners'); });
    wins[st.win]++; lens.push(st.turnNo); games++;
  } catch (e) { fails++; console.log('FAIL game ' + g + ' (n=' + n + '): ' + e.message); }
}
console.log('random games:', games, 'avg turns', (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1), JSON.stringify(wins));

/* ---------------------------------------------------------------- the CPU */
const AI = require('../hashikko-seven/ai.js');
{
  // always a legal reveal, from any view, at every level
  let checked = 0;
  for (let g = 0; g < 60; g++) {
    const n = 2 + (g % 4), st = E.newGame({ n, seed: 7000 + g }), rng = E.mulberry32(g + 3);
    let steps = 0;
    while (st.phase === 'play' && steps++ < 400) {
      const v = E.viewFor(st, st.turn), legal = JSON.stringify(E.viewActions(v));
      for (const lv of [1, 2, 3]) {
        const a = AI.choose(v, lv, rng, { seed: 99 + st.turn });
        if (!a || !legal.includes(JSON.stringify(a))) { ok(false, `AI level ${lv} chose ${JSON.stringify(a)} which is not legal`); break; }
        checked++;
      }
      const acts = E.legalActions(st);
      E.apply(st, Object.assign({ p: st.turn }, acts[Math.floor(rng() * acts.length)]));
    }
  }
  ok(checked > 1000, 'AI checked on ' + checked + ' views');
  // a sure win: three 7s at the bottom of my own hand
  const take = (() => { const used = {}; return (v) => { const k = used[v] || 0; used[v] = k + 1; return C(v, k); }; })();
  let st = E.newGame({ n: 3, seed: 5, first: 0, deal: { hands: [[7, 7, 7, 8, 9, 10, 11, 11].map(take), [1, 1, 2, 2, 3, 3, 4, 4].map(take), [1, 2, 3, 4, 5, 5, 6, 6].map(take)], field: [5, 6, 8, 8, 9, 9, 10, 10, 11].map(take) } });
  for (let k = 0; k < 3; k++) {
    const a = AI.choose(E.viewFor(st, 0), 3, E.mulberry32(k + 1));
    eq(a, { t: 'hand', who: 0, end: 'min' }, 'level 3 goes for its own 7s (' + (k + 1) + ')');
    E.apply(st, Object.assign({ p: 0 }, a));
  }
  ok(st.phase === 'over' && st.win === 'seven', 'and wins with them');
  // memory: a field card seen earlier is remembered by level 3 and used
  const t2 = (() => { const used = {}; return (v) => { const k = used[v] || 0; used[v] = k + 1; return C(v, k); }; })();
  st = E.newGame({ n: 2, seed: 9, first: 1, deal: { hands: [[4, 4, 5, 6, 7, 8, 8, 9, 9, 10].map(t2), [1, 1, 2, 2, 3, 3, 5, 5, 6, 6].map(t2)], field: [2, 3, 4, 7, 7, 8, 9, 10, 10, 1].map(t2) } });
  // p1 reveals field slot 2 (a 4), then field slot 0 (a 2): fail. Now p0 knows where the third 4 is,
  // and its own two 4s sit at the small end: the only trio it can be sure of.
  E.apply(st, { t: 'field', p: 1, i: 2 }); E.apply(st, { t: 'field', p: 1, i: 0 });
  eq(st.turn, 0, 'p0 to move after the failed challenge');
  const seq = [];
  for (let k = 0; k < 3 && st.phase === 'play' && st.turn === 0; k++) { const a = AI.choose(E.viewFor(st, 0), 3, E.mulberry32(50 + k)); seq.push(a); E.apply(st, Object.assign({ p: 0 }, a)); }
  eq(st.trios[0].map((t) => t.v), [4], 'level 3 remembers the 4 on the field and takes the 4s (' + JSON.stringify(seq) + ')');
  // no peeking: the CPU's choice does not depend on cards it has not seen
  const base = E.newGame({ n: 4, seed: 31, first: 0 });
  const v1 = E.viewFor(base, 0);
  const other = E.clone(base); other.hands[2] = other.hands[2].slice().reverse().sort((a, b) => b - a).sort((a, b) => a - b);
  const sw = other.field[0]; other.field[0] = other.hands[3][3]; other.hands[3][3] = sw; other.hands[3].sort((a, b) => a - b);
  const v2 = E.viewFor(other, 0);
  eq(JSON.stringify(v1) === JSON.stringify(v2), true, 'two different deals that look the same to p0');
  eq(AI.choose(v1, 3, E.mulberry32(8), { seed: 1 }), AI.choose(v2, 3, E.mulberry32(8), { seed: 1 }), 'the CPU decides the same in both');
}

console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} checks passed`);
process.exit(fails ? 1 : 0);
