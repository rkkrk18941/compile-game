// 80%: rules checks + CPU self-play.   node tools/eighty-rules-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../80percent/engine.js');

const failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), msg + ' → got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
const sum = (a) => a.reduce((x, y) => x + y, 0);

/* piles */
eq(E.piles(E.START_CASH), Array(10).fill(1000), 'start: ten 1,000-yen banknotes');
for (const c of [0, 10, 50, 90, 100, 130, 1370, 99990, 123456780]) {
  const ps = E.piles(c);
  check(sum(ps) === c, `piles(${c}) add up`);
  check(ps.every((x) => x % 10 === 0 && x >= 0), `piles(${c}) are whole 10-yen amounts`);
  const mx = Math.max(...ps), mn = Math.min(...ps);
  check(mx - mn <= 10, `piles(${c}) differ by at most 10 yen`);
}
// choosing k piles by percent never stakes more than k tenths
for (const c of [1370, 990, 1010, 55550, 70]) {
  for (let k = 0; k <= 10; k++) {
    const sel = E.selByCount(c, k), b = E.betOf(c, sel);
    if (c >= 100) {
      check(sel.length === k, `selByCount(${c}, ${k}) picks ${k}`);
      check(b <= Math.floor(c * k / 10) + 0.001, `bet(${c}, ${k}0%)=${b} is not above ${k}0%`);
      check(k < 10 || b === c, `100% of ${c} is all of it`);
    }
  }
}
eq(E.cleanSel(1000, [3, 3, 11, -1, 'x', 2.5, 9]), [3, 9], 'cleanSel drops junk and repeats');
eq(E.cleanSel(30, [0, 9]), [9], 'cleanSel drops empty piles');
eq(E.stepOf(8000, 3), 2400, 'stepOf 30%');
eq(E.stepOf(8010, 10), 8010, 'stepOf 100% is everything');
eq(E.stepOf(30, 1), 0, 'stepOf below 10 yen is 0');

/* one round by hand */
{
  const s = E.newGame({ rounds: 5, players: [{ id: 'a', nm: 'A' }, { id: 'b', nm: 'B' }] });
  s.P.forEach((p) => { p.cash = 1000; });
  const r = E.resolveRound(s, [{ sel: [0, 1, 2], atk: 0 }, { sel: E.selByCount(1000, 10), atk: 0 }], { bet: [true, false], atk: [0, 0] });
  eq([s.P[0].cash, s.P[1].cash], [1300, 0], 'win +stake / lose all');
  eq(r.out.bet, [true, false], 'outcomes recorded');
  eq(s.P[1].limit, 1000, 'bust player may borrow what they held this round');
  eq(s.ph, 'borrow', 'next round opens with a borrow phase');
  eq(E.applyBorrow(s, 1, 99999), 1000, 'borrow is capped at the limit');
  eq([s.P[1].cash, s.P[1].debt], [1000, 1000], 'borrowed cash and debt');
  eq(E.applyBorrow(s, 1, 500), 0, 'cannot borrow twice');
  // B goes bust again with borrowed money → limit becomes the borrowed amount
  s.ph = 'decide';
  E.resolveRound(s, [{ sel: [], atk: 1000 }, { sel: E.selByCount(1000, 10), atk: 0 }], { bet: [0, 0.95], atk: [0.1, 0] });
  eq([s.P[1].cash, s.P[1].debt, s.P[1].limit], [0, 2600, 1000], 'attack success doubles chosen debt before 30% interest');
  s.ph = 'decide';
  E.resolveRound(s, [{ sel: [], atk: 500 }, { sel: [], atk: 0 }], { bet: [0, 0], atk: [0.9, 0] });
  eq([s.P[0].debt, s.P[1].debt], [650, 2730], 'failed attack transfers debt before both players accrue interest');
  check(s.ph === 'over' || s.rnd === 4, 'round counter advances');
}

/* attacks are clamped to the debt that exists */
{
  const s = E.newGame({ rounds: 5 });
  s.P[1].debt = 300;
  E.resolveRound(s, [{ sel: [], atk: 5000 }, { sel: [], atk: 999 }], { bet: [0, 0], atk: [0, 0] });
  eq([s.P[0].debt, s.P[1].debt], [0, 780], 'attack clamps to target debt, then interest accrues');
}

/* Interest and repeat borrowing, including declined/zero loans and a transferred-away first debt. */
{
  const s = E.newGame({ rounds: 5 }), p = s.P[0];
  p.cash = 0; p.limit = 1000; s.ph = 'borrow';
  eq(E.applyBorrow(s, 0, 0), 0, 'declining does not borrow');
  eq(p.st.borrowed, 0, 'declining is not a first loan');
  p.took = false;
  eq(E.borrowDebt(p, 1000), 1000, 'first loan preview');
  E.applyBorrow(s, 0, 1000);
  eq([p.cash, p.debt], [1000, 1000], 'first loan has no multiplier');
  eq(E.applyBorrow(s, 0, 1000), 0, 'duplicate loan request cannot multiply debt');
  s.ph = 'decide';
  const r = E.resolveRound(s, [{ sel: E.selByCount(1000, 10) }, {}], { bet: [false, false], atk: [false, false] });
  eq(r.interest, [300, 0], 'round-end interest is included in the referee result');
  eq(s.hist.at(-1).debt, [1300, 0], 'history includes interest');
  eq(E.borrowDebt(p, 1000), 11500, 'repeat loan preview includes new principal in the fivefold debt');
  eq(E.applyBorrow(s, 0, 1000), 1000, 'second loan cash is its principal only');
  eq([p.cash, p.debt], [1000, 11500], 'second loan applies multiplier immediately');
  p.cash = 0; p.took = false;
  E.applyBorrow(s, 0, 1000);
  eq(p.debt, 62500, 'third loan multiplies again');
  p.debt = 0; p.cash = 0; p.took = false;
  E.applyBorrow(s, 0, 1000);
  eq(p.debt, 5000, 'previous loan still counts after debt is transferred away');
  eq(E.interestOf(10), 10, 'interest rounds upward to ten yen');
  eq(E.interestOf(0), 0, 'zero debt incurs no interest');
  s.rnd = s.rounds; s.ph = 'decide'; p.debt = 1000;
  E.resolveRound(s, [{}, {}], { bet: [false, false], atk: [false, false] });
  eq(p.debt, 1300, 'final round also charges interest');
  eq(E.result(s).nets[0], p.cash - 1300, 'final score subtracts debt including interest');
  p.cash = 0; p.took = false;
  eq(E.applyBorrow(s, 0, 1000), 0, 'no loans after the game has ended');
}

/* referee + CPU self-play */
const types = E.CPU_KEYS;
let games = 0, events = 0, overs = 0, maxCash = 0, maxDebt = 0, borrows = 0, atks = 0;
const winsBy = {};
for (let g = 0; g < 3000; g++) {
  const rounds = E.ROUND_CHOICES[g % 4];
  const ta = types[g % 4], tb = types[(g >> 2) % 4];
  const s = E.newGame({ rounds, players: [{ id: 'a', nm: 'A', cpu: ta }, { id: 'b', nm: 'B', cpu: tb }] });
  let seen = 0, lastRound = 0, ok = true;
  const queue = [];
  const ref = new E.Referee({ state: s, rng: Math.random, onEvent: (ev) => queue.push(ev) });
  ref.start();
  while (queue.length) {
    const ev = queue.shift(); seen++;
    const st = ev.s;
    for (const p of st.P) {
      if (!(p.cash >= 0 && p.debt >= 0 && p.cash % 10 === 0 && p.debt % 10 === 0)) { ok = false; }
      maxCash = Math.max(maxCash, p.cash); maxDebt = Math.max(maxDebt, p.debt);
    }
    if (ev.t === 'phase') {
      if (ev.r < lastRound) ok = false;
      lastRound = ev.r;
      for (let i = 0; i < 2; i++) {
        if (ev.ph === 'borrow' && ev.need[i]) { ref.borrow(i, E.cpuBorrow(ref.s, i, st.P[i].cpu)); borrows++; }
        if (ev.ph === 'decide') { const d = E.cpuDecide(ref.s, i, st.P[i].cpu); if (d.atk) atks++; ref.decide(i, d); }
      }
    }
    if (ev.t === 'resolve') {
      const r = ev.res;
      for (let i = 0; i < 2; i++) if (r.d[i].bet > r.d[i].base) ok = false;
    }
    if (ev.t === 'over') {
      overs++;
      if (st.hist.length !== rounds + 1) ok = false;
      const w = ev.result.winner;
      const key = w < 0 ? 'draw' : st.P[w].cpu;
      winsBy[key] = (winsBy[key] || 0) + 1;
    }
  }
  check(ok, `self-play game ${g} kept every invariant`);
  games++; events += seen;
}
check(overs === games, `every self-play game finished (${overs}/${games})`);

console.log(`self-play: ${games} games, ${events} events, ${borrows} borrows, ${atks} attacks, max cash ¥${maxCash.toLocaleString()}, max debt ¥${maxDebt.toLocaleString()}`);
console.log('wins by type:', winsBy);
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('all rules checks passed');
