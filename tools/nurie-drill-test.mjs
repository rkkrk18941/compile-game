// おばけキャッチ 反射ドリル: the per-card bands, the adaptive time line, the scheduler and a simulated learner.
//   node tools/nurie-drill-test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const R = require('../nurie-rush/drill.js'), D = require('../nurie-rush/deck.js'), E = require('../nurie-rush/engine.js');

/* ---------------- kinds of card */
const kinds = (call) => D.CARDS.map((c) => R.kind(c.id, call));
const tally = (list) => list.reduce((o, k) => ((o[k] = (o[k] || 0) + 1), o), {});
assert.deepEqual(tally(kinds(false)), { m: 20, n: 40 }, 'basic rule: 20 own-colour cards and 40 missing-object cards');
assert.deepEqual(tally(kinds(true)), { m: 12, n: 24, mc: 8, nc: 16 }, 'advanced rule: the 24 cards with a book are answered by name');

/* ---------------- bands follow the CPU times in engine.js */
const mid = (span) => (span[0] + span[1]) / 2;
assert.equal(R.bandLimit('strong', 'm'), mid(E.LEVELS[3].match)); assert.equal(R.bandLimit('strong', 'n'), mid(E.LEVELS[3].none));
assert.equal(R.bandLimit('max', 'm'), mid(E.LEVELS[4].match)); assert.equal(R.bandLimit('max', 'n'), mid(E.LEVELS[4].none));
assert.equal(R.bandLimit('strong', 'nc') - R.bandLimit('strong', 'n'), E.LEVELS[3].call, 'つよい級 with a name call allows the CPU call time');
assert.equal(R.bandLimit('max', 'mc') - R.bandLimit('max', 'm'), E.LEVELS[4].call);
assert(R.bandLimit('reflex', 'm') > E.FLOOR.match && R.bandLimit('reflex', 'n') > E.FLOOR.none, '反射級 stays above what a person can do');
assert.equal(R.FLOOR.m, E.FLOOR.match); assert.equal(R.FLOOR.n, E.FLOOR.none);

/* ---------------- a card's band */
{
  const data = R.fresh(), own = 0, none = 2;   // No.1: red chair (own colour), No.3: the bottle is missing
  assert.equal(R.kind(own, false), 'm'); assert.equal(R.kind(none, false), 'n'); assert.equal(R.kind(own, true), 'mc');
  assert.equal(R.status(data, false, own), 'new');
  R.observe(data, false, own, true, 650); assert.equal(R.status(data, false, own), 'slow', 'one answer is not enough for a band');
  R.observe(data, false, own, true, 640); assert.equal(R.status(data, false, own), 'max', 'two answers: the slower one counts (0.65 s → 最強級)');
  R.observe(data, false, own, true, 500); assert.equal(R.status(data, false, own), 'max', 'median of 0.65, 0.64, 0.50');
  R.observe(data, false, own, true, 520); assert.equal(R.status(data, false, own), 'reflex', 'median of 0.64, 0.50, 0.52 → 反射級');
  R.observe(data, false, own, false, 0); assert.equal(R.status(data, false, own), 'miss');
  R.observe(data, false, own, true, 510); assert.equal(R.status(data, false, own), 'miss', 'one right answer after a mistake is not enough');
  R.observe(data, false, own, true, 505); assert.equal(R.status(data, false, own), 'reflex', 'two right answers after it clear the review');
  for (const t of [1300, 1310, 1290]) R.observe(data, false, none, true, t);
  assert.equal(R.status(data, false, none), 'strong', '1.30 s on a missing-object card is つよい級');
  for (const t of [1500, 1500]) R.observe(data, false, none, true, t);
  assert.equal(R.status(data, false, none), 'slow');
  assert.equal(R.status(data, true, none), 'new', 'the advanced rule keeps its own records');
  const e = data.base.cards[own];
  assert.equal(e.rts.length, 5, 'only the last five correct times are kept');
  assert.equal(R.estimate(e), 510);
  assert.equal(data.base.trials, 0, 'observed answers (rankings) do not move the drill schedule');
  const before = JSON.stringify(e.rts);
  R.observe(data, false, own, true, 12000);
  assert.equal(JSON.stringify(e.rts), before, 'an answer over 10 s (a pause) counts as right but its time is not kept');
  assert.equal(e.n, 8); assert.equal(e.ok, 7);
  assert.equal(R.observe(data, false, 60, true, 500), null); assert.equal(R.observe(data, false, -1, true, 500), null);
}

/* ---------------- the adaptive time line */
{
  const data = R.fresh(), s = R.begin(data, false, 50);
  assert.deepEqual(s.lines, { m: R.START.m, n: R.START.n }, 'no records yet: starting lines');
  let passes = 0, guard = 0;
  while (passes < 3 && guard++ < 50) {
    const id = R.next(s, data);
    const k = R.kind(id, false);
    if (k !== 'n') { R.answer(s, data, id, true, 300); continue; }
    const before = s.lines.n, r = R.answer(s, data, id, true, 900);
    assert(r.pass && r.line === before); passes++;
    if (passes < 3) assert.equal(s.lines.n, before, 'the line waits for three passes in a row');
    else assert.equal(s.lines.n, Math.round(before * R.STEP), 'three passes in a row: 5 % shorter');
  }
  let id = R.next(s, data); while (R.kind(id, false) !== 'n') { R.answer(s, data, id, true, 300); id = R.next(s, data); }
  const before = s.lines.n, r = R.answer(s, data, id, true, before + 1);
  assert(r.ok && !r.pass, 'right but over the line is not a pass');
  assert.equal(s.lines.n, Math.round(before / R.STEP), 'a slow answer makes the line 5 % longer');
  id = R.next(s, data); while (R.kind(id, false) !== 'n') { R.answer(s, data, id, true, 300); id = R.next(s, data); }
  const b2 = s.lines.n; R.answer(s, data, id, false, 200);
  assert.equal(s.lines.n, Math.round(b2 / R.STEP), 'a wrong answer makes it longer too, however fast');
  assert.equal(data.base.lines.n, s.lines.n, 'the line is kept for the next session');
  const s2 = R.begin(data, false, 10);
  assert.equal(s2.lines.n, Math.round(data.base.lines.n / R.STEP), 'a new session warms up one step easier');
  // it never asks for less than a person can do
  const fast = R.fresh(), f = R.begin(fast, false, 900);
  while (f.done < f.total) { const c = R.next(f, fast); R.answer(f, fast, c, true, 1); }
  assert.equal(f.lines.m, R.FLOOR.m); assert.equal(f.lines.n, R.FLOOR.n);
}

/* ---------------- the staircase settles near four passes in five */
{
  const rnd = E.seeded(77), data = R.fresh(), s = R.begin(data, false, 6000);
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  const rt = (k) => Math.exp(Math.log(k === 'm' ? 760 : 1050) + 0.18 * gauss());
  let late = 0, latePass = 0;
  while (s.done < s.total) {
    const id = R.next(s, data, rnd), r = R.answer(s, data, id, rnd() > 0.01, rt(R.kind(id, false)));
    if (s.done > 2000) { late++; if (r.pass) latePass++; }
  }
  const rate = latePass / late;
  assert(rate > 0.74 && rate < 0.86, 'pass rate settles near 79 % (got ' + (rate * 100).toFixed(1) + ' %)');
}

/* ---------------- the scheduler */
{
  const rnd = E.seeded(4242), data = R.fresh(), s = R.begin(data, false, 10000);
  const seen = new Set(), firstAll = { at: null }, shown = [];
  let afterMiss = 0, afterMissLook = 0, afterRight = 0, afterRightLook = 0, missGaps = [], pendingMiss = new Map();
  while (s.done < s.total) {
    const id = R.next(s, data, rnd);
    assert.equal(R.next(s, data, rnd), id, 'the same card stays until it is answered');
    const last3 = shown.slice(-R.NO_REPEAT);
    assert(!last3.includes(id), 'never the same card within three cards');
    const lastTwo = shown.slice(-R.SAME_ANSWER_MAX).map(R.answerOf);
    assert(!(lastTwo.length === R.SAME_ANSWER_MAX && lastTwo.every((a) => a === R.answerOf(id))), 'never three of the same answer in a row');
    if (shown.length) {
      const prev = shown[shown.length - 1], look = D.CARDS[prev].pair === D.CARDS[id].pair && R.answerOf(prev) !== R.answerOf(id);
      if (s.prevOk) { afterRight++; if (look) afterRightLook++; } else { afterMiss++; if (look) afterMissLook++; }
    }
    if (pendingMiss.has(id)) { missGaps.push(s.done - pendingMiss.get(id)); pendingMiss.delete(id); }
    seen.add(id); if (seen.size === 60 && firstAll.at === null) firstAll.at = s.done + 1;
    shown.push(id);
    const ok = rnd() > 0.08;
    R.answer(s, data, id, ok, 700 + rnd() * 600);
    if (!ok) pendingMiss.set(id, s.done);
  }
  assert(firstAll.at !== null && firstAll.at <= 110, 'a new player meets all 60 cards early (' + firstAll.at + ' answers)');
  const missLook = afterMissLook / afterMiss, rightLook = afterRightLook / afterRight;
  assert(missLook > 0.5, 'after a mistake, usually a look-alike with another answer comes next (' + (missLook * 100).toFixed(0) + ' %)');
  assert(rightLook > 0.2 && rightLook < 0.4, 'after a right answer, sometimes (' + (rightLook * 100).toFixed(0) + ' %)');
  const gap = R.median(missGaps), within = missGaps.filter((g) => g <= 4).length / missGaps.length;
  assert(gap === 3 && within > 0.9, 'a missed card is asked again three cards later (median ' + gap + ', ' + (within * 100).toFixed(0) + ' % within four)');
  assert.equal(R.answer(s, data, 0, true, 500), null, 'no answers after the session is over');
}

/* ---------------- a mistake is asked again three cards later, then within eight */
{
  const rnd = E.seeded(31), data = R.fresh(), s = R.begin(data, false, 300), order = [];
  let target = null, missAt = -1;
  while (s.done < s.total) {
    const i = s.done, id = R.next(s, data, rnd);
    order.push(id);
    const ok = i !== 150;
    if (!ok) { target = id; missAt = i; }
    R.answer(s, data, id, ok, 650);
  }
  const again = order.map((id, i) => (id === target && i > missAt ? i : -1)).filter((i) => i >= 0);
  assert.equal(again[0] - missAt - 1, 3, 'three other cards, then the missed card again');
  assert(again[1] - again[0] - 1 <= 8, 'after the first right answer it comes back within eight cards');
  assert.notEqual(R.status(data, false, target), 'miss', 'two right answers later the review is over');
}

/* ---------------- practice goes where it is needed */
{
  const rnd = E.seeded(99), data = R.fresh(), slowCards = new Set([2, 3, 4, 5, 8, 9, 10, 11, 14, 15]);
  const reps = new Array(60).fill(0);
  for (let k = 0; k < 15; k++) {
    const s = R.begin(data, false, 120);
    while (s.done < s.total) {
      const id = R.next(s, data, rnd); reps[id]++;
      R.answer(s, data, id, true, slowCards.has(id) ? 1700 + rnd() * 200 : 520 + rnd() * 60);
    }
    R.finish(s, data, k);
  }
  const avg = (ids) => ids.reduce((a, i) => a + reps[i], 0) / ids.length;
  const slow = avg([...slowCards]), fast = avg([...Array(60).keys()].filter((i) => !slowCards.has(i)));
  assert(slow > fast * 3, 'slow cards get far more practice than mastered ones (' + slow.toFixed(1) + ' vs ' + fast.toFixed(1) + ' each)');
  assert(fast >= 6, 'mastered cards still come back from time to time (' + fast.toFixed(1) + ' each)');
  assert.equal(data.base.sessions.length, 15);
}

/* ---------------- a simulated learner gets faster (power law of practice) */
{
  const rnd = E.seeded(2026), data = R.fresh(), exposures = new Array(60).fill(0), preds = [];
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  // until a card is remembered it is worked out (slow); every encounter makes remembering it faster
  const learnerRt = (id) => {
    const own = D.solve(D.CARDS[id]).match, n = exposures[id];
    const base = own ? 380 : 520, work = own ? 520 : 980;
    return (base + work * Math.pow(1 + n, -0.55)) * Math.exp(0.12 * gauss());
  };
  const learnerOk = (id) => rnd() > 0.10 * Math.pow(1 + exposures[id], -0.5);
  preds.push(R.predict(data, false).total);
  for (let day = 0; day < 10; day++) {
    const s = R.begin(data, false, 200);
    while (s.done < s.total) { const id = R.next(s, data, rnd), ok = learnerOk(id), t = learnerRt(id); exposures[id]++; R.answer(s, data, id, ok, t); }
    const sum = R.finish(s, data, day);
    preds.push(sum.pred);
    assert.equal(sum.startPred, preds[preds.length - 2]);
  }
  assert(preds[10] < preds[1] * 0.8, 'predicted 60-card time keeps falling (' + preds.map((p) => (p / 1000).toFixed(1)).join(' → ') + ' s)');
  const c = R.counts(data, false);
  assert(c.reflex + c.max >= 30, 'most cards reach 最強級 or 反射級: ' + JSON.stringify(c));
  assert(R.takeRate(data, false, E.LEVELS[3], 1) > 0.8, 'takes most cards from one つよい CPU');
  console.log('  simulated learner, predicted 60-card time: ' + preds.map((p) => (p / 1000).toFixed(1)).join(' → ') + ' s; bands ' + JSON.stringify(c));
}

/* ---------------- session summary */
{
  const data = R.fresh(), s = R.begin(data, false, 30), rnd = E.seeded(5);
  let k = 0; const wrong = new Set();
  while (s.done < s.total) { const id = R.next(s, data, rnd), ok = k % 10 !== 3; if (!ok) wrong.add(id); R.answer(s, data, id, ok, 600 + (k % 7) * 150); k++; }
  assert.equal(R.next(s, data, rnd), null);
  const sum = R.finish(s, data, 1700000000000);
  assert.equal(sum.n, 30); assert.equal(sum.ok, 27); assert.deepEqual(new Set(sum.misses), wrong);
  assert(sum.slow.every((id) => !sum.misses.includes(id)), 'slow list leaves out the missed cards');
  assert.equal(sum.startPred, 20 * R.START.m + 40 * R.START.n, 'unknown cards count with the starting times');
  assert.equal(sum.startKnown, 0); assert(sum.known >= R.MIN_KNOWN);
  assert.equal(data.base.sessions.length, 1); assert.equal(data.base.sessions[0].at, 1700000000000);
  assert.equal(data.base.sessions[0].from, null, 'a first session has no measured starting prediction to compare with');
  assert.equal(data.base.sessions[0].pred, sum.pred);
  for (let i = 0; i < 40; i++) { const t = R.begin(data, false, 1); R.answer(t, data, R.next(t, data, rnd), true, 800); R.finish(t, data, i); }
  assert.equal(data.base.sessions.length, 30, 'only the last 30 sessions are kept');
  const empty = R.begin(data, false, 5); R.finish(empty, data, 0); assert.equal(data.base.sessions.length, 30, 'an empty session is not recorded');
}

/* ---------------- CPU comparison */
{
  const L = E.LEVELS[3];
  assert.equal(R.beat(L.match[0] - 1, L.match), 1); assert.equal(R.beat(L.match[1], L.match), 0);
  assert(Math.abs(R.beat(mid(L.match), L.match) - 0.5) < 1e-9, 'the middle of the CPU spread is an even match');
  let prev = 2; for (let t = 700; t < 1400; t += 10) { const b = R.beat(t, L.match); assert(b <= prev); prev = b; }
  assert(Math.abs(R.beat(mid(L.match) + L.call, L.match, L.call) - 0.5) < 1e-9, 'a name call shifts the CPU time');
  const data = R.fresh();
  assert(R.takeRate(data, false, L, 1) > 0 && R.takeRate(data, false, L, 3) < R.takeRate(data, false, L, 1), 'more CPUs, fewer cards');
}

/* ---------------- saving and loading */
{
  const data = R.fresh(), rnd = E.seeded(8), s = R.begin(data, true, 40);
  while (s.done < s.total) { const id = R.next(s, data, rnd); R.answer(s, data, id, rnd() > 0.1, 900 + rnd() * 900); }
  R.finish(s, data, 123);
  assert(data.call.sessions[0].pred > 60000);
  const back = R.normalize(JSON.parse(JSON.stringify(data)));
  for (let i = 0; i < 60; i++) assert.equal(R.status(back, true, i), R.status(data, true, i));
  assert.deepEqual(back.call.lines, data.call.lines); assert.equal(back.call.trials, 40);
  assert.equal(back.call.sessions[0].pred, data.call.sessions[0].pred, 'a predicted time over 60 s survives the reload');
  const bad = R.normalize({ base: { trials: -4, cards: { 3: { n: 'x', rts: [1, 'a', -5, 1e9] }, 4: { n: 3, ok: 9, rts: [700, 800], h: [1, 7, 0], last: 99 }, 70: { n: 1 } },
    lines: { m: -1, n: 5000, q: 5 }, sessions: [null, { n: 0 }, { n: 4, pred: 'x' }] }, call: 7 });
  assert.equal(bad.base.trials, 0); assert(!bad.base.cards[3]); assert(!bad.base.cards[70]);
  assert.deepEqual(bad.base.cards[4], { n: 3, ok: 3, rts: [700, 800], h: [1, 0], best: null, last: 0 });
  assert.deepEqual(bad.base.lines, { n: 4000 }); assert.equal(bad.base.sessions.length, 1); assert.equal(bad.base.sessions[0].pred, null);
  assert.deepEqual(bad.call, R.fresh().call);
  assert.deepEqual(R.normalize(null), R.fresh()); assert.deepEqual(R.normalize('junk'), R.fresh());
  R.reset(data, true); assert.deepEqual(data.call, R.fresh().call); assert.equal(data.base.trials, 0);
}

console.log('Reflex drill passed: card kinds, CPU-based bands, review after mistakes, 1-up/3-down time line (≈79 % passes), spacing, look-alike contrast, no guessable runs, practice on slow cards, simulated learning, summaries and saved data.');
