// ヌリエ・ラッシュ: every card, the settlement rules and the CPU.   node tools/nurie-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../nurie-rush/deck.js');
const E = require('../nurie-rush/engine.js');

const failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), msg + ' → got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
const count = (arr, f) => arr.filter(f).length;

/* ------------------------------------------------------------------ the deck, card by card */
const C = D.CARDS;
eq(C.length, 60, '60 cards');
eq(D.ANIMALS.length, 5, '5 animals');
for (const x of D.ANIMALS) eq(D.OWNER[D.TRUE_COLOR[x]], x, `${x} owns its own colour`);

for (const c of C) {
  check(c.a !== c.b, `#${c.no}: two different animals`);
  check(c.ca !== c.cb, `#${c.no}: two different colours`);
  check(D.ANIMALS.includes(c.a) && D.ANIMALS.includes(c.b), `#${c.no}: known animals`);
  check(D.COLORS.includes(c.ca) && D.COLORS.includes(c.cb), `#${c.no}: known colours`);
  const s = D.solve(c);
  check(!!s.answer, `#${c.no}: has an answer`);
  eq(s.answer, c.expect, `#${c.no} (${D.describe(c)}): answer`);
  // the answer is unique: count how many animals satisfy either rule
  const own = [c.a, c.b].filter((x, k) => D.TRUE_COLOR[x] === (k ? c.cb : c.ca));
  if (own.length === 1) eq(own[0], s.answer, `#${c.no}: own-colour animal is the answer`);
  else {
    eq(own.length, 0, `#${c.no}: never two animals in their own colour`);
    const seen = new Set([c.a, c.b, D.OWNER[c.ca], D.OWNER[c.cb]]);
    eq(seen.size, 4, `#${c.no}: no-match card shows four different animals' worth of hints`);
    eq(D.ANIMALS.filter((x) => !seen.has(x)), [s.answer], `#${c.no}: exactly one animal is missing`);
  }
}

// 10 pairs × 6 colourings, each pair holds both animals' own-colour card once
const pairs = new Map();
for (const c of C) {
  const key = [c.a, c.b].sort().join('+');
  if (!pairs.has(key)) pairs.set(key, []);
  pairs.get(key).push(c);
}
eq(pairs.size, 10, '10 different animal pairs');
for (const [key, cs] of pairs) {
  eq(cs.length, 6, `${key}: 6 cards`);
  eq(new Set(cs.map((c) => c.ca + c.cb)).size, 6, `${key}: 6 different colourings`);
  eq(new Set(cs.map((c) => c.pair)).size, 1, `${key}: one layout`);
  const ans = {};
  cs.forEach((c) => { ans[c.expect] = (ans[c.expect] || 0) + 1; });
  eq(Object.values(ans).sort(), [1, 1, 1, 1, 2], `${key}: answers spread 2/1/1/1/1`);
  eq(count(cs, (c) => D.solve(c).match), 2, `${key}: 2 own-colour cards`);
}

// totals
for (const x of D.ANIMALS) {
  eq(count(C, (c) => c.expect === x), 12, `${x} is the answer on 12 cards`);
  eq(count(C, (c) => c.a === x || c.b === x), 24, `${x} is drawn on 24 cards`);
  eq(count(C, (c) => D.solve(c).match && c.expect === x), 4, `${x} is in its own colour on 4 cards`);
}
eq(count(C, (c) => D.solve(c).match), 20, '20 own-colour cards');
eq(count(C, (c) => !D.solve(c).match), 40, '40 no-match cards');
eq(count(C, (c) => D.needsCall(c)), 24, 'advanced rule: the chick is on 24 cards');

// the published per-animal, per-colour breakdown (animal:colour → answer + own-colour(+) / no-match(-))
const TABLE = {"chick:b": {"crab+": 1, "crab-": 1, "pig+": 1, "pig-": 2, "turtle-": 2}, "chick:g": {"crab-": 1, "fish-": 2, "pig-": 1}, "chick:p": {"crab-": 2, "fish+": 1, "fish-": 1, "turtle+": 1, "turtle-": 2}, "chick:r": {"fish-": 1, "pig-": 1}, "chick:y": {"chick+": 4}, "crab:b": {"chick-": 1, "pig+": 1, "pig-": 1, "turtle+": 1, "turtle-": 2}, "crab:g": {"chick+": 1, "chick-": 1, "fish-": 1, "pig-": 2}, "crab:p": {"chick-": 2, "fish-": 2, "turtle-": 1}, "crab:r": {"crab+": 4}, "crab:y": {"fish+": 1, "fish-": 1, "turtle-": 2}, "fish:b": {"fish+": 4}, "fish:g": {"chick-": 2, "crab-": 1, "pig+": 1, "pig-": 1}, "fish:p": {"chick+": 1, "chick-": 2, "crab+": 1, "turtle-": 1}, "fish:r": {"chick-": 1, "pig-": 2, "turtle-": 2}, "fish:y": {"crab-": 2, "pig-": 2, "turtle+": 1}, "pig:b": {"crab-": 2, "turtle-": 1}, "pig:g": {"chick+": 1, "chick-": 2, "crab+": 1, "crab-": 1, "fish+": 1, "fish-": 1}, "pig:p": {"pig+": 4}, "pig:r": {"chick-": 2, "fish-": 1, "turtle+": 1, "turtle-": 1}, "pig:y": {"crab-": 1, "fish-": 2, "turtle-": 2}, "turtle:b": {"chick-": 2, "crab-": 2, "pig+": 1}, "turtle:g": {"turtle+": 4}, "turtle:p": {"crab-": 2, "fish-": 1}, "turtle:r": {"chick+": 1, "chick-": 1, "fish+": 1, "fish-": 2, "pig-": 2}, "turtle:y": {"crab+": 1, "crab-": 1, "fish-": 1, "pig-": 2}};
const got = {};
for (const c of C) {
  const s = D.solve(c);
  for (const [x, col] of [[c.a, c.ca], [c.b, c.cb]]) {
    const k = x + ':' + col, v = s.answer + (s.match ? '+' : '-');
    got[k] = got[k] || {};
    got[k][v] = (got[k][v] || 0) + 1;
  }
}
const norm = (t) => JSON.stringify(Object.keys(t).sort().map((k) => [k, Object.keys(t[k]).sort().map((v) => [v, t[k][v]])]));
check(norm(got) === norm(TABLE), 'every animal × colour × answer count matches the published breakdown');

// nothing outside the rule: a card with both animals in their own colour, or a repeated colour, has no answer
eq(D.solve({ a: 'crab', ca: 'r', b: 'fish', cb: 'b' }).answer, null, 'two own colours → no single answer');
eq(D.solve({ a: 'crab', ca: 'b', b: 'fish', cb: 'b' }).answer, null, 'same colour twice → not a card');
eq(D.solve({ a: 'crab', ca: 'b', b: 'fish', cb: 'g' }).answer, null, 'a colour of a drawn animal → two missing → not a card');

// advanced rule
for (const c of C) {
  eq(D.required(c, false).type, 'grab', `#${c.no}: basic rule always touches`);
  eq(D.required(c, true).type, D.hasAnimal(c, 'chick') ? 'call' : 'grab', `#${c.no}: advanced rule calls when a chick is drawn`);
}

/* ------------------------------------------------------------------ settlement */
function game(n, o = {}) {
  return E.newGame({ seats: Array.from({ length: n }, (_, k) => ({ name: 'P' + k })), deckSize: o.deckSize || 60, callMode: !!o.call, rnd: E.seeded(o.seed || 7) });
}
{
  const g = game(3, { seed: 1 });
  eq(g.deck.length, 60, 'new game: 60 cards in the pile');
  eq(new Set(g.deck).size, 60, 'new game: all 60 different cards');
  const c = E.reveal(g);
  check(c !== null, 'reveal turns a card');
  eq(E.reveal(g), null, 'cannot turn a second card before settling');
  const q = E.need(g, c);
  const wrong = D.ANIMALS.find((x) => x !== q.item);
  check(E.touch(g, 1, 'grab', wrong, 500).ok === false, 'wrong touch is wrong');
  eq(E.touch(g, 1, 'grab', q.item, 600), null, 'one touch per player and card');
  check(E.touch(g, 2, 'grab', q.item, 800).ok, 'right touch is right');
  check(!E.allTouched(g), 'seat 0 has not touched');
  const out = E.settle(g);
  eq(out.win, 2, 'fastest right touch wins');
  eq(out.moves, [{ from: 1, to: 2, card: null }], 'the wrong player had no card to hand over');
  eq(E.scores(g), [0, 0, 1], 'winner holds the card');
  eq(out.left, 59, '59 left');
}
{
  // penalty card goes to the winner; a wrong touch slower than the winner's costs nothing
  const g = game(3, { seed: 2 });
  for (let k = 0; k < 2; k++) { const c = E.reveal(g); E.touch(g, 0, 'grab', E.need(g, c).item, 400); E.settle(g); }
  eq(E.scores(g), [2, 0, 0], 'seat 0 won two cards');
  const c = E.reveal(g); const q = E.need(g, c);
  const wrong = D.ANIMALS.find((x) => x !== q.item);
  E.touch(g, 0, 'grab', wrong, 300);
  E.touch(g, 1, 'grab', q.item, 700);
  E.touch(g, 2, 'grab', wrong, 900);
  const out = E.settle(g);
  eq(out.win, 1, 'seat 1 wins');
  eq(out.moves.length, 1, 'only the early wrong touch pays');
  eq(E.scores(g), [1, 2, 0], 'seat 0 handed one card to seat 1');
  check(out.tries.find((t) => t.seat === 2).late, 'slow wrong touch is marked late');
  eq(g.seats[0].paid, 1, 'paid count');
  eq(g.seats[2].bad, 1, 'late wrong touch still counts as a miss');
}
{
  // nobody right: card and handed cards go under the pile
  const g = game(2, { seed: 3 });
  const c0 = E.reveal(g); E.touch(g, 0, 'grab', E.need(g, c0).item, 400); E.settle(g);
  const before = g.deck.length;
  const c = E.reveal(g); const q = E.need(g, c);
  const wrong = D.ANIMALS.filter((x) => x !== q.item);
  E.touch(g, 0, 'grab', wrong[0], 300); E.touch(g, 1, 'grab', wrong[1], 350);
  check(E.allTouched(g), 'both touched');
  const out = E.settle(g);
  eq(out.win, -1, 'nobody wins');
  check(out.back, 'cards go back');
  eq(E.scores(g), [0, 0], 'seat 0 lost its card');
  eq(g.deck.length, before - 1 + 2, 'the turned card and the handed card are under the pile');
  check(g.deck.slice(-2).includes(c) && g.deck.slice(-2).includes(c0), 'both cards are at the bottom');
}
{
  // advanced rule: touching when you must call is wrong, and the other way round
  const g = game(2, { call: true, seed: 4 });
  let checkedCall = false, checkedGrab = false;
  while (!g.over && !(checkedCall && checkedGrab)) {
    const c = E.reveal(g); const q = E.need(g, c);
    const t0 = E.touch(g, 0, q.type === 'call' ? 'grab' : 'call', q.item, 300);
    const t1 = E.touch(g, 1, q.type, q.item, 500);
    check(!t0.ok && t1.ok, `#${D.CARDS[c].no}: wrong kind of answer is wrong (${q.type})`);
    if (q.type === 'call') checkedCall = true; else checkedGrab = true;
    E.settle(g);
  }
  check(checkedCall && checkedGrab, 'advanced rule: both kinds seen');
}
{
  // a full game always ends with every card accounted for
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = E.seeded(seed);
    const g = E.newGame({ seats: [1, 2, 3, 4].map((k) => ({ name: 'C' + k, kind: 'cpu', level: 1 + (k % 3) })), deckSize: seed % 3 ? 60 : 30, callMode: seed % 2 === 0, rnd });
    let guard = 0;
    while (!g.over && guard++ < 1000) {
      const c = E.reveal(g);
      const plans = g.seats.map((s) => E.cpuPlan(c, s.level, g.callMode, rnd, 1));
      const order = plans.map((p, k) => [p.rt, k]).sort((a, b) => a[0] - b[0]);
      for (const [rt, k] of order) {
        const t = E.touch(g, k, plans[k].type, plans[k].item, rt);
        if (t && t.ok) break;
      }
      E.settle(g, rnd);
      const total = E.scores(g).reduce((a, b) => a + b, 0) + g.deck.length;
      if (total !== g.deckSize) { check(false, `seed ${seed}: cards lost (${total})`); break; }
    }
    check(g.over, `seed ${seed}: game ends`);
    eq(E.scores(g).reduce((a, b) => a + b, 0), g.deckSize, `seed ${seed}: all cards are in someone's pile`);
    const r = E.ranking(g);
    check(r[0].rank === 1 && r.every((x, k) => !k || x.score <= r[k - 1].score), `seed ${seed}: ranking sorted`);
  }
}

/* ------------------------------------------------------------------ CPU */
{
  const rnd = E.seeded(99);
  const stats = { 1: [], 2: [], 3: [] }, slips = { 1: 0, 2: 0, 3: 0 };
  const N = 6000;
  for (const lv of [1, 2, 3]) {
    for (let k = 0; k < N; k++) {
      const c = k % 60;
      const p = E.cpuPlan(c, lv, false, rnd, 1);
      stats[lv].push(p.rt);
      const q = D.required(D.CARDS[c], false);
      if (p.type !== q.type || p.item !== q.item) slips[lv]++;
      else check(!p.slip, 'a plan marked as slip is wrong');
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  check(avg(stats[1]) > avg(stats[2]) && avg(stats[2]) > avg(stats[3]), 'stronger CPUs are faster');
  check(slips[1] / N > slips[2] / N && slips[2] / N > slips[3] / N, 'stronger CPUs slip less');
  console.log('CPU average ms:', [1, 2, 3].map((lv) => Math.round(avg(stats[lv]))).join(' / '), ' slips:', [1, 2, 3].map((lv) => (100 * slips[lv] / N).toFixed(1) + '%').join(' / '));
}

if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('all rules checks passed (60 cards, settlement, CPU)');
