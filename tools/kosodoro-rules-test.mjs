// コソドロ・マイン: rules, CPU and online-protocol regression tests (rules as in the published
// Japanese rulebook of こそどろ鉱山; see kosodoro-mine/RULES.md).
// Run: node tools/kosodoro-rules-test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const E = require('../kosodoro-mine/engine.js');
const AI = require('../kosodoro-mine/ai.js');
const NET = require('../kosodoro-mine/net.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(name); console.error('FAIL', name, '\n  ', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n   ') : e); }
}

const persons = (n, extra = {}) => Array.from({ length: n }, (_, i) => Object.assign({ id: 'p' + i, nm: 'P' + i, ani: i }, extra));
function game(n, opts = {}) { return E.newGame(persons(n), Object.assign({ seed: 7 }, opts)); }
function set(s, { ore, pool, out, susp, used }) {
  if (ore) ore.forEach((v, i) => { s.P[i].ore = v; });
  if (pool != null) s.pool = pool;
  if (out) out.forEach((v, i) => { s.P[i].out = v || ''; });
  if (susp) susp.forEach((v, i) => { s.P[i].susp = !!v; });
  if (used) used.forEach((v, i) => { s.P[i].used = !!v; });
  return s;
}
/* picks from a short string, one letter per seat: w s g x, '-' = not in the season */
const P = str => [...str].map(c => c === '-' ? null : { a: c });
const run = (s, str) => E.resolve(s, P(str));
const ores = s => s.P.map(p => p.ore);

/* ---------- setup ---------- */
test('setup: 3-8 players, 2 ore each, target = 4 x players, unique animals', () => {
  for (let n = 3; n <= 8; n++) {
    const s = E.newGame(Array.from({ length: n }, (_, i) => ({ id: 'x' + i, nm: 'X' + i })), { seed: n });
    assert.equal(s.P.length, n);
    assert.equal(new Set(s.P.map(p => p.ani)).size, n, 'animals are unique');
    s.P.forEach(p => { assert.equal(p.ore, 2); assert.equal(p.out, ''); assert.equal(p.susp, false); });
    assert.equal(s.opts.target, 4 * n);
    assert.equal(s.pool, 0); assert.equal(s.season, 1); assert.equal(s.rnd, 1); assert.equal(s.ph, 'pick');
  }
  assert.deepEqual([3, 4, 5, 6, 7, 8].map(n => E.targetFor(n)), [12, 16, 20, 24, 28, 32], 'the rulebook table');
  assert.equal(game(5, { mult: 3 }).opts.target, 15); assert.equal(game(5, { mult: 5 }).opts.target, 25);
  const s = E.newGame([{ id: 'a', ani: 5 }, { id: 'b', ani: 5 }, { id: 'c' }, { id: 'd', ani: 2 }], { seed: 1 });
  assert.equal(s.P[0].ani, 5); assert.notEqual(s.P[1].ani, 5, 'a taken animal is dealt anew'); assert.equal(s.P[3].ani, 2);
  assert.throws(() => E.newGame(persons(2)), /players/);
  assert.throws(() => E.newGame(persons(9).map((p, i) => ({ ...p, ani: i % 8 }))), /players/);
  assert.deepEqual(E.legalActions(game(4), 0), ['w', 's', 'g'], 'no special card without the advanced rule');
});

/* ---------- 労働 / 盗み / 防衛 ---------- */
test('労働: each adds 1 ore from the supply, the season goes on', () => {
  const r = run(game(4), 'wwww');
  assert.equal(r.state.pool, 4); assert.equal(r.ev.end, ''); assert.equal(r.state.rnd, 2); assert.equal(r.state.season, 1);
  assert.deepEqual(ores(r.state), [2, 2, 2, 2]);
});
test('盗み without 防衛: the thief takes the pool after this round\'s work; the season ends', () => {
  const r = run(set(game(4), { pool: 5 }), 'swww');
  assert.deepEqual(ores(r.state), [2 + 8, 2, 2, 2]);
  assert.equal(r.ev.end, 'stolen'); assert.equal(r.state.pool, 0);
  assert.equal(r.state.season, 2); assert.equal(r.state.rnd, 1);
  assert.ok(r.state.P.every(p => !p.out), 'everyone is back for the next season');
  assert.equal(r.state.P[0].st.stole, 1); assert.equal(r.state.P[0].st.loot, 8);
});
test('several thieves share the pool; the remainder stays in the pool', () => {
  const r = run(set(game(5), { pool: 5 }), 'sssww');       // 7 -> 2 each, 1 left
  assert.deepEqual(ores(r.state), [4, 4, 4, 2, 2]); assert.equal(r.state.pool, 1); assert.equal(r.state.carry, 1);
  const r2 = run(set(game(4), { pool: 4 }), 'ssww');        // 6 -> 3 each
  assert.deepEqual(ores(r2.state), [5, 5, 2, 2]); assert.equal(r2.state.pool, 0);
});
test('盗み against 防衛: every thief loses all ore to the guards, no wage, both leave, the pool stays', () => {
  const r = run(set(game(4), { pool: 6, ore: [7, 3, 2, 2] }), 'sgww');
  assert.deepEqual(ores(r.state), [0, 10, 2, 2]);
  assert.equal(r.state.pool, 8, 'the pool is protected');
  assert.equal(r.state.P[0].out, 'caught'); assert.equal(r.state.P[1].out, 'guard');
  assert.equal(r.ev.end, ''); assert.equal(r.state.rnd, 2);
  assert.deepEqual(E.legalActions(r.state, 0), []); assert.deepEqual(E.legalActions(r.state, 1), []);
  assert.equal(r.state.P[0].st.caught, 1); assert.equal(r.state.P[0].st.lost, 7); assert.equal(r.state.P[1].st.catches, 1);
  const r2 = run(set(game(5), { ore: [4, 5, 2, 2, 2] }), 'ssgww');   // two thieves, one guard
  assert.deepEqual(ores(r2.state), [0, 0, 11, 2, 2]);
});
test('several guards share what they confiscate; the remainder goes to the pool', () => {
  const r = run(set(game(5), { pool: 0, ore: [7, 2, 2, 2, 2] }), 'sggww');
  assert.deepEqual(ores(r.state), [0, 5, 5, 2, 2]);       // 7 -> 3 each
  assert.equal(r.state.pool, 2 + 1);
});
test('防衛 without 盗み: 1 ore each from the pool, only if there is one for every guard', () => {
  const r = run(set(game(4), { pool: 0 }), 'gwww');         // pool 3 after work
  assert.deepEqual(ores(r.state), [3, 2, 2, 2]); assert.equal(r.state.pool, 2); assert.equal(r.state.P[0].out, 'guard');
  const r2 = run(set(game(4), { pool: 0 }), 'gggw');        // pool 1 < 3 guards: nobody is paid
  assert.deepEqual(ores(r2.state), [2, 2, 2, 2 + 1], 'and the one left takes the pool');
  assert.ok(r2.ev.steps.some(x => x.k === 'nowage'));
  const r3 = run(set(game(4), { pool: 2 }), 'ggww');        // pool 4 >= 2
  assert.deepEqual(ores(r3.state), [3, 3, 2, 2]); assert.equal(r3.state.pool, 2);
});
test('the last one left in the season takes the whole pool', () => {
  const r = run(set(game(4), { pool: 9 }), 'wggg');         // pool 10, 3 guards paid 1 each -> 7
  assert.deepEqual(ores(r.state), [9, 3, 3, 3]); assert.equal(r.ev.end, 'last'); assert.equal(r.state.pool, 0);
  assert.equal(r.state.season, 2); assert.equal(r.state.P[0].st.last, 1);
  let t = run(set(game(3), { pool: 0 }), 'gww').state;      // pool 2 -> wage 1 -> 1
  t = run(t, '-sg').state;                                  // P1 caught, P2 guards: nobody left
  assert.equal(t.season, 2, 'nobody left ends the season');
  assert.equal(t.pool, 1, 'and the pool waits for the next season');
});
test('謹慎: a thief caught with an empty trolley plays only 労働 and 防衛 until holding 3 ore', () => {
  let s = run(set(game(4), { ore: [0, 2, 2, 2], pool: 3 }), 'sgww').state;
  assert.equal(s.P[0].susp, true);
  s = run(s, '--ww').state;                                 // P0 is out for the rest of the season
  s = run(s, '--sw').state;                                 // P2 steals the pool: new season
  assert.equal(s.season, 2);
  assert.deepEqual(E.legalActions(s, 0), ['w', 'g'], 'suspended: no 盗み');
  assert.throws(() => run(s, 'swww'), /pick 0/);
  s = run(set(s, { pool: 0, ore: [0, 2, 2, 2] }), 'wggg').state;   // pool 1 < 3 guards: unpaid; P0 last with 1
  assert.equal(s.P[0].ore, 1); assert.equal(s.P[0].susp, true, 'still under 3');
  s = run(set(s, { pool: 4 }), 'wggg').state;               // pool 5, guards paid 3 -> P0 last with 1 + 2 = 3
  assert.equal(s.P[0].ore, 3); assert.equal(s.P[0].susp, false, 'back with 3');
  assert.deepEqual(E.legalActions(s, 0), ['w', 's', 'g']);
});

/* ---------- end of the game ---------- */
test('the game ends when exactly one player is on top at or above the target', () => {
  const s = set(game(4), { ore: [10, 15, 2, 2], pool: 3 });   // target 16
  const r = run(s, 'sgww');                                  // P1 confiscates 10 -> 25
  assert.equal(r.state.ph, 'over'); assert.deepEqual(r.state.winners, [1]); assert.equal(r.ev.over, true);
  assert.throws(() => E.resolve(r.state, P('wwww')), /phase/);
  const t = set(game(4), { ore: [15, 15, 2, 2], pool: 2 });
  const r2 = run(t, 'ggww');                                 // both reach 16: level, so the game goes on
  assert.equal(r2.state.ph, 'pick'); assert.deepEqual(ores(r2.state).slice(0, 2), [16, 16]);
  const r3 = run(r2.state, '--sw');                          // P2 steals the pool: still level on top
  assert.equal(r3.state.ph, 'pick');
  const r4 = run(set(r3.state, { pool: 2 }), 'gwww');        // P0 paid 1 -> 17: alone on top
  assert.deepEqual(r4.state.winners, [0]);
});

/* ---------- validation ---------- */
test('every player in the season must pick a legal card; the input state is untouched', () => {
  const s = game(4);
  const before = JSON.stringify(s);
  assert.throws(() => E.resolve(s, P('www')), /pick 3/);
  assert.throws(() => E.resolve(s, [{ a: 'q' }, { a: 'w' }, { a: 'w' }, { a: 'w' }]), /pick 0/);
  assert.throws(() => run(s, 'xwww'), /pick 0/, 'no special card without the advanced rule');
  run(s, 'swgw');
  assert.equal(JSON.stringify(s), before);
});

/* ---------- special cards (advanced rule) ---------- */
const A = (opts = {}) => E.newGame(persons(8), Object.assign({ seed: 3, adv: true }, opts));   // seat i plays animal i
const SEAT = Object.fromEntries(E.ANIMALS.map((a, i) => [a.sp.no, i]));                        // card number -> seat
function picks8(map) { const s = Array(8).fill('w'); for (const [no, a] of Object.entries(map)) s[SEAT[no]] = a; return s.join(''); }
test('special cards: numbers 1-8, one use, not while suspended', () => {
  assert.deepEqual(E.ANIMALS.map(a => a.sp.no).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  const s = A();
  assert.deepEqual(E.legalActions(s, 0), ['w', 's', 'g', 'x']);
  const r = run(s, picks8({ 2: 'x' }));                     // card 2 counts as 労働: stays in the season
  assert.equal(r.state.P[SEAT[2]].used, true);
  assert.deepEqual(E.legalActions(r.state, SEAT[2]), ['w', 's', 'g'], 'used up');
  const t = set(A(), { susp: [true] });
  assert.deepEqual(E.legalActions(t, 0), ['w', 'g']);
});
test('card 1: counts as 労働, then takes 2 from every thief', () => {
  const r = run(set(A(), { pool: 1 }), picks8({ 1: 'x', 4: 's' }));   // pool 1 + 7 work = 8, the thief takes 8
  const me = SEAT[1], th = SEAT[4];
  assert.equal(r.state.P[th].ore, 2 + 8 - 2); assert.equal(r.state.P[me].ore, 2 + 2);
  assert.equal(r.ev.end, 'stolen');
});
test('card 2: counts as 労働, then takes 1 from every other worker', () => {
  const r = run(A(), picks8({ 2: 'x' }));
  const me = SEAT[2];
  assert.equal(r.state.P[me].ore, 2 + 7); assert.equal(r.state.pool, 8);
  r.state.P.forEach((p, i) => { if (i !== me) assert.equal(p.ore, 1); });
  assert.equal(r.state.P[me].out, '', 'stays in the season');
});
test('card 3: counts as 労働, then the workers split the pool; the remainder is mine', () => {
  const r = run(set(A(), { pool: 3 }), picks8({ 3: 'x', 6: 'g' }));   // pool 3 + 7 = 10, guard paid 1 -> 9 split by 7
  const me = SEAT[3], g = SEAT[6];
  assert.equal(r.state.P[g].ore, 3);
  assert.equal(r.state.P[me].ore, 2 + 1 + 2); assert.equal(r.state.pool, 0);
  r.state.P.forEach((p, i) => { if (i !== me && i !== g) assert.equal(p.ore, 3); });
  assert.equal(r.ev.end, '', 'the season goes on');
});
test('card 4: with another thief, a guard cannot confiscate my ore', () => {
  const s = set(A(), { ore: [5, 5, 5, 5, 5, 5, 5, 5] });
  const r = run(s, picks8({ 4: 'x', 5: 's', 6: 'g' }));
  assert.equal(r.state.P[SEAT[4]].ore, 5, 'covered'); assert.equal(r.state.P[SEAT[5]].ore, 0);
  assert.equal(r.state.P[SEAT[6]].ore, 10); assert.equal(r.state.P[SEAT[4]].out, 'caught');
  const r2 = run(s, picks8({ 4: 'x', 6: 'g' }));            // alone: confiscated as usual
  assert.equal(r2.state.P[SEAT[4]].ore, 0);
});
test('card 5: when guarded, only half (rounded down) is confiscated', () => {
  const s = set(A(), { ore: [7, 7, 7, 7, 7, 7, 7, 7] });
  const r = run(s, picks8({ 5: 'x', 6: 'g' }));
  assert.equal(r.state.P[SEAT[5]].ore, 4); assert.equal(r.state.P[SEAT[6]].ore, 10);
});
test('card 6: half the pool, rounded up, and out of the season', () => {
  const r = run(set(A(), { pool: 2 }), picks8({ 6: 'x' }));   // pool 2 + 7 = 9 -> 5
  assert.equal(r.state.P[SEAT[6]].ore, 7); assert.equal(r.state.pool, 4); assert.equal(r.state.P[SEAT[6]].out, 'special');
});
test('card 7: with no thief, all ore of every guard', () => {
  const r = run(set(A(), { pool: 0 }), picks8({ 7: 'x', 6: 'g', 3: 'g' }));   // 5 workers, 2 guards paid, then they lose 3 each
  assert.equal(r.state.P[SEAT[7]].ore, 2 + 6); assert.equal(r.state.P[SEAT[6]].ore, 0); assert.equal(r.state.P[SEAT[3]].ore, 0);
  const r2 = run(A(), picks8({ 7: 'x', 6: 'g', 4: 's' }));   // a thief came: nothing
  assert.equal(r2.state.P[SEAT[7]].ore, 2);
});
test('card 8: 3 ore from the richest other player (seat order breaks a tie)', () => {
  const me = SEAT[8];
  const ore = [2, 2, 2, 2, 2, 2, 2, 2]; const a = (me + 3) % 8, b = (me + 5) % 8;
  ore[a] = 9; ore[b] = 9;
  const r = run(set(A(), { ore }), picks8({ 8: 'x' }));
  assert.equal(r.state.P[me].ore, 5); assert.equal(r.state.P[a].ore, 6, 'the first one after me'); assert.equal(r.state.P[b].ore, 9);
  assert.equal(r.state.P[me].out, 'special');
});
test('several special cards resolve in card-number order', () => {
  const r = run(set(A(), { pool: 1 }), picks8({ 3: 'x', 6: 'x' }));   // 3 splits the pool first: 6 gets half of nothing
  assert.equal(r.state.P[SEAT[6]].ore, 2); assert.equal(r.state.pool, 0);
});

test('the game ends at once when someone reaches the target, even in the middle of a round', () => {
  // after 盗み: the thief reaches 32 of 32, so card 1 (2 from every thief) never resolves
  const th = SEAT[6], c1 = SEAT[1];
  const ore = Array(8).fill(2); ore[th] = 25;
  const r = run(set(A(), { ore, pool: 0 }), picks8({ 1: 'x', 6: 's' }));   // 6 workers + card 1 = 7 in the pool
  assert.equal(r.state.ph, 'over'); assert.deepEqual(r.state.winners, [th]);
  assert.equal(r.state.P[th].ore, 32); assert.equal(r.state.P[c1].ore, 2, 'card 1 did not take 2');
  assert.ok(!r.ev.steps.some(x => x.k === 'sp')); assert.ok(r.ev.steps.some(x => x.k === 'win' && x.p === th));
  assert.match(E.summary(r.state, r.ev), /32個に届いた/);
  // between special cards: card 2 makes 32, so card 8 (3 from the richest) never resolves
  const c2 = SEAT[2], c8 = SEAT[8];
  const ore2 = Array(8).fill(2); ore2[c2] = 26;
  const r2 = run(set(A(), { ore: ore2 }), picks8({ 2: 'x', 8: 'x' }));
  assert.deepEqual(r2.state.winners, [c2]); assert.equal(r2.state.P[c2].ore, 32); assert.equal(r2.state.P[c8].ore, 2);
  // without the target the same round plays on: card 8 takes 3 back
  const I = E.coreInput(set(A(), { ore: ore2 }), P(picks8({ 2: 'x', 8: 'x' })), false);
  delete I.target;
  const R = E.core(I);
  assert.equal(R.won, -1); assert.equal(R.ore[c2], 29); assert.equal(R.ore[c8], 5);
});

/* ---------- log and summary ---------- */
test('log entries and the round summary', () => {
  const r = run(set(game(4), { pool: 5 }), 'swww');
  const L = r.state.log[0];
  assert.equal(L.a, 's,w,w,w'); assert.equal(L.p0, 5); assert.equal(L.e, 'stolen'); assert.deepEqual(L.o0, [2, 2, 2, 2]);
  assert.match(E.summary(r.state, r.ev), /P0が8個を盗んだ/);
  assert.match(E.summary(r.state, run(game(4), 'wwww').ev), /全員まじめに働いた/);
  assert.equal(E.publicView(r.state).seed, undefined);
});

/* ---------- CPU ---------- */
test('CPU picks are always legal and never steal while suspended', () => {
  const rng = E.mulberry(11);
  for (const level of [1, 2, 3]) for (let seed = 1; seed <= 6; seed++) {
    let s = E.newGame(persons(3 + seed % 6).map(p => ({ ...p, cpu: level })), { seed, adv: seed % 2 === 0 });
    s.P.forEach(p => { p.pers = AI.persona(rng); });
    for (let r = 0; r < 60 && s.ph === 'pick'; r++) {
      const picks = [];
      E.activeSeats(s).forEach(i => {
        const p = AI.decide(s, i, { level, rng, pers: s.P[i].pers });
        assert.ok(E.validPick(s, i, p), 'legal pick');
        if (s.P[i].susp) assert.ok(p.a === 'w' || p.a === 'g');
        picks[i] = p;
      });
      s = E.resolve(s, picks).state;
    }
  }
});
test('CPU-only games always finish', () => {
  const rng = E.mulberry(5);
  for (let seed = 1; seed <= 36; seed++) {
    const n = 3 + seed % 6;
    let s = E.newGame(persons(n).map((p, i) => ({ ...p, cpu: 1 + (i + seed) % 3 })), { seed, adv: seed % 3 === 0, mult: [3, 4, 5][seed % 3] });
    s.P.forEach(p => { p.pers = AI.persona(rng); });
    let r = 0;
    while (s.ph === 'pick' && r < 500) {
      const picks = [];
      E.activeSeats(s).forEach(i => { picks[i] = AI.decide(s, i, { level: s.P[i].cpu, rng, pers: s.P[i].pers }); });
      s = E.resolve(s, picks).state; r++;
    }
    assert.equal(s.ph, 'over', `seed ${seed} finished in ${r} rounds`);
  }
});
test('CPU sense: every level works, steals and guards; a stand-off gets broken', () => {
  const rng = E.mulberry(2);
  assert.ok(AI.evaluate(game(5), 0, 3, rng).every(o => Number.isFinite(o.ev)));
  for (const level of [1, 2, 3]) {
    const n = { w: 0, s: 0, g: 0, x: 0 };
    for (let seed = 1; seed <= 6; seed++) {
      let s = E.newGame(persons(5).map(p => ({ ...p, cpu: level })), { seed });
      for (let r = 0; r < 80 && s.ph === 'pick'; r++) {
        const picks = [];
        E.activeSeats(s).forEach(i => { picks[i] = AI.decide(s, i, { level, rng }); n[picks[i].a]++; });
        s = E.resolve(s, picks).state;
      }
    }
    const tot = n.w + n.s + n.g;
    assert.ok(n.w / tot > 0.3 && n.s / tot > 0.04 && n.g / tot > 0.04, 'level ' + level + ' mixes its cards ' + JSON.stringify(n));
  }
  // two leaders level above the target keep guarding: the CPUs start trying other cards
  let s = set(game(3, { mult: 3 }), { ore: [3, 11, 11], pool: 1 });
  for (let r = 0; r < 4; r++) s = run(s, 'ggg').state;
  assert.deepEqual(AI.stagnation(s), { still: 4, flat: 4 });
  let other = 0;
  for (let k = 0; k < 100; k++) if (AI.decide(s, 1, { level: 3, rng }).a !== 'g') other++;
  assert.ok(other >= 8, 'not always 防衛 again (' + other + '/100)');
  // a suspended miner and a miner who never leaves: after a while the CPU gives in
  let u = set(game(5), { ore: [16, 13, 13, 8, 2], susp: [false, false, false, false, true], out: ['', 'guard', 'guard', 'guard', ''], pool: 40 });
  for (let r = 0; r < 12; r++) u = run(u, 'w---w').state;
  assert.equal(AI.stagnation(u).still, 12);
  let gave = 0;
  for (let k = 0; k < 100; k++) if (AI.decide(u, 4, { level: 3, rng }).a === 'g') gave++;
  assert.ok(gave >= 8, 'the stand-off ends (' + gave + '/100)');
});
test('rival guesses are probabilities', () => {
  const s = set(game(6), { pool: 7, ore: [1, 5, 9, 0, 3, 12] });
  for (const level of [1, 2, 3]) for (let j = 1; j < 6; j++) {
    const p = AI.rivalProbs(s, j, level, E.mulberry(j));
    assert.ok(Math.abs(p.w + p.s + p.g - 1) < 1e-9 && p.w >= 0 && p.s >= 0 && p.g >= 0);
  }
  s.P[2].susp = true;
  assert.equal(AI.rivalProbs(s, 2, 3, E.mulberry(1)).s, 0, 'a suspended rival never steals');
});

/* ---------- hashing ---------- */
test('sha256 matches node:crypto', () => {
  for (const str of ['', 'abc', 'こそどろ鉱山', 'a'.repeat(200), 'k:1|3|s|00ff']) {
    assert.equal(NET.sha256(str), createHash('sha256').update(str, 'utf8').digest('hex'));
  }
});

/* ---------- sessions ---------- */
function clock() {
  let now = 0, id = 0;
  const q = [];
  return {
    schedule(fn, ms) { const h = ++id; q.push({ h, t: now + ms, fn }); return h; },
    unschedule(h) { const i = q.findIndex(x => x.h === h); if (i >= 0) q.splice(i, 1); },
    run(limit = 1e6) { let n = 0; while (q.length && n++ < limit) { q.sort((a, b) => a.t - b.t); const x = q.shift(); now = x.t; x.fn(); } return n; }
  };
}
test('solo session: a full game against CPUs', () => {
  const c = clock();
  const views = [];
  const h = new NET.HostSession({ me: { cid: 'me', nm: 'わたし', ani: 4 }, schedule: c.schedule, unschedule: c.unschedule, rng: E.mulberry(4), onView: v => views.push(v) });
  [1, 2, 3].forEach(l => assert.ok(h.addCpu(l)));
  h.setSettings({ mult: 3, adv: true });
  assert.ok(h.start());
  assert.equal(h.state.P[0].ani, 4, 'my animal'); assert.equal(h.state.opts.target, 12); assert.equal(h.state.opts.adv, true);
  assert.ok(h.state.P.slice(1).every(p => p.cpu && p.pers), 'CPUs have a persona');
  assert.equal(views.at(-1).state.P[1].pers, undefined, 'personas stay private');
  let rounds = 0;
  while (h.state.ph === 'pick' && rounds < 400) {
    const me = h.mySeat();
    if (E.isActive(h.state, me) && !h.rd.sec[me]) {
      const L = E.legalActions(h.state, me).filter(a => a !== 'x');
      const t0 = h.state.turn;
      assert.ok(h.pick({ a: L[rounds % L.length] }).ok);
      if (h.state.turn === t0) assert.equal(h.myPick().a, L[rounds % L.length]);
    }
    const t = h.state.turn;
    c.run();
    const mine = h.mySeat(), waiting = E.isActive(h.state, mine) && !h.rd.sec[mine];
    if (h.state.turn === t && h.state.ph === 'pick' && !waiting) assert.fail('stuck in round ' + t);
    rounds++;
  }
  assert.equal(h.state.ph, 'over');
  assert.ok(views.at(-1).ev && views.at(-1).ev.over);
});
test('online: commit, lock, reveal, proof; nobody sees a card early', () => {
  const hub = new NET.MemoryHub();
  const c = clock();
  const h = new NET.HostSession({ me: { cid: 'H', nm: 'ホスト', ani: 0 }, transport: hub.hostTransport(), code: '1234', schedule: c.schedule, unschedule: c.unschedule, rng: E.mulberry(9) });
  const guests = ['A', 'B'].map((cid, k) => {
    const tr = hub.clientTransport(cid), seen = [], evts = [];
    const g = new NET.GuestSession({ me: { cid, nm: 'G' + cid, ani: k + 1 }, transport: tr, code: '1234', store: NET.memStore(), onView: v => seen.push(v), onEvent: e => evts.push(e) });
    tr.connect({ nm: 'G' + cid, ani: k + 1 });
    return { g, seen, evts, tr };
  });
  assert.equal(h.lobby.length, 3);
  assert.deepEqual(h.lobby.map(s => s.ani), [0, 1, 2]);
  h.addCpu(2);
  assert.ok(h.start());
  const [A1, B1] = guests;
  assert.equal(A1.g.mySeat(), 1); assert.equal(B1.g.mySeat(), 2);
  h.pick({ a: 'w' }); A1.g.pick({ a: 's' });
  c.run();   // the CPU commits
  const last = B1.seen.at(-1);
  assert.equal(last.rd.lock, false);
  assert.equal(JSON.stringify(last).includes('"sec"'), false, 'no secrets in the view');
  assert.ok(last.rd.cm[0] && last.rd.cm[1] && last.rd.cm[3] && !last.rd.cm[2]);
  hub.host.handlers.msg('A', { k: 'reveal', key: h.rd.key, a: 'g', s: 'ab'.repeat(8) });   // a reveal before the lock is ignored
  assert.equal(h.rd.rv[1], undefined);
  B1.g.pick({ a: 'g' });
  assert.equal(h.state.turn, 2, 'the round resolved');
  assert.equal(h.state.log[0].a.split(',')[1], 's'); assert.equal(h.state.log[0].a.split(',')[2], 'g');
  assert.equal(h.state.P[1].out, 'caught'); assert.equal(h.state.P[2].out, 'guard');
  assert.ok(A1.evts.some(e => e.k === 'reveal'));
  assert.ok(!A1.evts.some(e => e.k === 'proof'), 'the proof checked out');
  assert.equal(A1.g.checked[h.pf.key], 1);
  hub.host.handlers.msg('A', { k: 'commit', key: 'old', h: 'f'.repeat(64) });
  assert.equal(h.rd.cm[1], undefined, 'a commit for another round is ignored');
});
test('online: a guest who leaves is replaced by a CPU and can come back', () => {
  const hub = new NET.MemoryHub();
  const c = clock();
  const h = new NET.HostSession({ me: { cid: 'H', nm: 'ホスト' }, transport: hub.hostTransport(), code: '5678', schedule: c.schedule, unschedule: c.unschedule, rng: E.mulberry(3) });
  const tr = hub.clientTransport('A');
  const g = new NET.GuestSession({ me: { cid: 'A', nm: 'A' }, transport: tr, code: '5678', store: NET.memStore() });
  tr.connect({ nm: 'A' });
  h.addCpu(1);
  h.start();
  h.pick({ a: 'w' });
  g.pick({ a: 'w' });
  tr.close();
  c.run();
  assert.equal(h.state.P[1].sub, true);
  assert.ok(h.state.turn >= 2, 'the game went on');
  const tr2 = hub.clientTransport('A');
  const g2 = new NET.GuestSession({ me: { cid: 'A', nm: 'A' }, transport: tr2, code: '5678', store: NET.memStore() });
  tr2.connect({ nm: 'A' });
  assert.equal(h.state.P[1].sub, false); assert.equal(g2.mySeat(), 1);
  const tr3 = hub.clientTransport('Z'); let closed = '';
  new NET.GuestSession({ me: { cid: 'Z', nm: 'Z' }, transport: tr3, code: '5678', store: NET.memStore(), onClose: w => { closed = w; } });
  tr3.connect({ nm: 'Z' });
  assert.equal(closed, 'started', 'nobody new joins a game in progress');
});
test('lobby: animals, seats and settings', () => {
  const hub = new NET.MemoryHub();
  const h = new NET.HostSession({ me: { cid: 'H', nm: 'ホスト', ani: 3 }, transport: hub.hostTransport(), code: '1111', rng: E.mulberry(1) });
  assert.equal(h.start(), false, 'needs 3 players');
  for (let i = 0; i < 7; i++) h.addCpu(2);
  assert.equal(h.addCpu(2), false, 'at most 8 seats');
  assert.equal(new Set(h.lobby.map(s => s.ani)).size, 8);
  const tr = hub.clientTransport('A');
  new NET.GuestSession({ me: { cid: 'A', nm: 'A' }, transport: tr, code: '1111', store: NET.memStore() });
  tr.connect({ nm: 'A', ani: 3 });
  assert.equal(h.lobby.length, 8, 'a CPU made room');
  const a = h.lobby.find(s => s.id === 'A');
  assert.notEqual(a.ani, 3, 'the host keeps its animal');
  assert.equal(h.setAnimal('A', 3), false, 'cannot take a person\'s animal');
  const cpu = h.lobby.find(s => s.cpu);
  assert.equal(h.setAnimal('A', cpu.ani), true, 'a CPU gives its animal up');
  assert.equal(new Set(h.lobby.map(s => s.ani)).size, 8, 'still all different');
  h.setSettings({ mult: 5, adv: true });
  assert.deepEqual(h.view().settings, { mult: 5, adv: true });
  assert.ok(h.start());
  assert.equal(h.state.opts.target, 40); assert.equal(h.state.opts.adv, true);
  h.backToLobby();
  assert.equal(h.lobby.length, 8); assert.equal(h.state, null);
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
