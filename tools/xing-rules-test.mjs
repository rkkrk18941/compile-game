// ×ing／バッティング: rules, scoring, CPU and online-protocol regression tests.
// Run: node tools/xing-rules-test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../xing/engine.js');
const NET = require('../xing/net.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failures.push(name); console.error('FAIL', name, '\n  ', e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n   ') : e); }
}

// gem ids: blue 0-17, yellow 18-35, red 36-53, white 54-59
const B = n => n, Y = n => 18 + n, R = n => 36 + n, W = n => 54 + n;
const persons = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, nm: 'P' + i }));
function game(np, seed = 7) { return E.newGame(persons(np), { seed, now: 1, dealer: 0 }); }
/* put a game into a hand-made position */
function setup(s, { T, V, K, bag, rest }) {
  if (T) s.T = T.map(x => x.slice());
  if (V) V.forEach((v, a) => { s.A[a].vault = v.slice(); });
  if (K) K.forEach((k, a) => { s.A[a].kept = k.slice(); });
  if (bag) s.bag = bag.slice();
  if (rest) rest.forEach((r, a) => { s.A[a].rest = !!r; });
  return s;
}
const total = s => s.bag.length + s.T.flat().length + s.A.reduce((n, x) => n + x.vault.length + x.kept.length, 0);

/* ---------- setup per player count ---------- */
test('setup: tables, gem counts and actors for 2-6 players', () => {
  const want = { 2: [3, 12, 4], 3: [2, 9, 3], 4: [3, 12, 4], 5: [4, 15, 5], 6: [5, 18, 6] };
  for (const np of [2, 3, 4, 5, 6]) {
    const s = game(np);
    const [tables, col, actors] = want[np];
    assert.equal(s.T.length, tables, np + 'p tables');
    assert.equal(s.A.length, actors, np + 'p actors (vaults)');
    s.T.forEach(t => assert.equal(t.length, 2, 'two gems per table at setup'));
    const all = s.bag.concat(s.T.flat());
    const c = E.counts(all);
    assert.deepEqual(c, [col, col, col, 6], np + 'p bag composition');
    assert.equal(new Set(all).size, all.length, 'unique gems');
    s.A.forEach(x => { assert.equal(x.vault.length, 0); assert.equal(x.kept.length, 0); assert.equal(x.rest, false); });
  }
  assert.throws(() => E.newGame(persons(1)));
  assert.throws(() => E.newGame(persons(7)));
});
test('2 players: each person plays a left and a right hand', () => {
  const s = game(2);
  assert.deepEqual(s.A.map(x => [x.p, x.h]), [[0, 'L'], [0, 'R'], [1, 'L'], [1, 'R']]);
  assert.equal(E.actorName(s, 1), 'P0の右手');
});

/* ---------- scoring ---------- */
test('scoring: blue 1, yellow 2, red 3, white squared, +4 per blue-yellow-red set', () => {
  assert.equal(E.scoreGems([B(0)]).total, 1);
  assert.equal(E.scoreGems([Y(0)]).total, 2);
  assert.equal(E.scoreGems([R(0)]).total, 3);
  assert.equal(E.scoreGems([B(0), Y(0), R(0)]).total, 10, 'one set = 1+2+3+4');
  [1, 4, 9, 16, 25, 36].forEach((pts, i) => assert.equal(E.scoreGems([W(0), W(1), W(2), W(3), W(4), W(5)].slice(0, i + 1)).total, pts, 'white x' + (i + 1)));
  // set + yellow + blue + three whites = 10 + 2 + 1 + 9 = 22
  assert.equal(E.scoreGems([B(0), B(1), Y(0), Y(1), R(0), W(0), W(1), W(2)]).total, 22);
  assert.equal(E.scoreGems([B(0), B(1), B(2), Y(0), Y(1), Y(2), R(0), R(1), R(2)]).total, 30, 'three sets');
  const sc = E.scoreGems([B(0), B(1), Y(0), R(0), R(1)]);
  assert.equal(sc.sets, 1); assert.equal(sc.bonus, 4); assert.equal(sc.total, 2 + 2 + 6 + 4);
});
test('scoring counts both the vault and the secured gems; secured shown apart', () => {
  const s = setup(game(3), { V: [[R(0)], [], []], K: [[B(0), Y(0)], [], []] });
  const sc = E.actorScore(s, 0);
  assert.equal(sc.total, 10);
  assert.equal(sc.secured, 3);
});

/* ---------- choices ---------- */
test('round 1: only gem tables can be pointed at', () => {
  const s = game(4);
  assert.deepEqual(E.legalTargets(s, 0), ['t0', 't1', 't2']);
});
test('vaults with gems become targets; empty vaults and empty tables are not', () => {
  const s = setup(game(3), { T: [[B(0)], []], V: [[Y(0)], [], [R(0)]] });
  assert.deepEqual(E.legalTargets(s, 0), ['t0', 'v2', 'v0']);   // own vault = barrier, listed last
  assert.deepEqual(E.legalTargets(s, 1), ['t0', 'v0', 'v2']);   // empty vault: no barrier
});

/* ---------- simultaneous resolution ---------- */
test('a table pointed at by one player: all its gems go to that vault', () => {
  const s = setup(game(3), { T: [[B(0), R(0), W(0)], [Y(0), Y(1)]] });
  const r = E.resolveRound(s, ['t0', 't1', 't1']);
  assert.ok(r.ok);
  assert.deepEqual(r.res.out, ['gain', 'clash', 'clash']);
  assert.deepEqual(s.A[0].vault.slice().sort((a, b) => a - b), [B(0), R(0), W(0)]);
  assert.deepEqual(s.A[1].vault, []); assert.deepEqual(s.A[2].vault, []);
});
test('×ing: everyone on the same table gets nothing and the gems stay', () => {
  const s = setup(game(4), { T: [[B(0), B(1)], [Y(0), Y(1)], [R(0), R(1)]], bag: [W(0), W(1), W(2)] });
  const r = E.resolveRound(s, ['t0', 't0', 't2', 't2']);
  assert.deepEqual(r.res.out, ['clash', 'clash', 'clash', 'clash']);
  assert.deepEqual(s.T[0].slice(0, 2), [B(0), B(1)]);
  assert.deepEqual(s.T[2].slice(0, 2), [R(0), R(1)]);
  s.A.forEach(x => assert.equal(x.vault.length, 0));
});
test('steal: the only finger on another vault takes everything in it', () => {
  const s = setup(game(3), { T: [[B(0)], [B(1)]], V: [[], [R(0), R(1), Y(0)], []] });
  const r = E.resolveRound(s, ['v1', 't0', 't1']);
  assert.deepEqual(r.res.out, ['steal', 'gain', 'gain']);
  assert.deepEqual(s.A[0].vault, [R(0), R(1), Y(0)]);
  assert.deepEqual(s.A[1].vault, [B(0)], 'the victim keeps what it took this round');
});
test('steal clash: two fingers on one vault take nothing', () => {
  const s = setup(game(3), { T: [[B(0)], [B(1)]], V: [[], [], [R(0), R(1)]] });
  const r = E.resolveRound(s, ['v2', 'v2', 't0']);
  assert.deepEqual(r.res.out, ['clash', 'clash', 'gain']);
  assert.deepEqual(s.A[2].vault, [R(0), R(1), B(0)]);
});
test('barrier: gems are secured, thieves are stopped, the next round is a pass', () => {
  const s = setup(game(3), { T: [[B(0), B(1)], [Y(0), Y(1)]], V: [[R(0), R(1)], [], []], bag: [W(0), W(1), W(2), W(3), W(4), W(5), B(5), B(6)] });
  const r = E.resolveRound(s, ['v0', 'v0', 't1']);
  assert.deepEqual(r.res.out, ['barrier', 'blocked', 'gain']);
  assert.deepEqual(s.A[0].kept, [R(0), R(1)]);
  assert.deepEqual(s.A[0].vault, []);
  assert.deepEqual(s.A[1].vault, []);
  assert.equal(s.A[0].rest, true);
  // the next round: the barrier player passes
  assert.equal(s.ph, 'pick');
  assert.deepEqual(E.legalTargets(s, 0), []);
  assert.ok(!E.activeActors(s).includes(0));
  assert.equal(E.resolveRound(s, ['t0', 't1', null]).ok, false, 'a resting player cannot point');
  const r2 = E.resolveRound(s, [null, 't0', 't1']);
  assert.ok(r2.ok);
  assert.equal(r2.res.out[0], 'rest');
  assert.equal(s.A[0].rest, false, 'the vault turns face up after the pass');
  assert.ok(E.legalTargets(s, 0).length > 0);
});
test('barrier with an empty vault is not a legal choice', () => {
  const s = game(3);
  assert.ok(!E.isLegal(s, 0, 'v0'));
  assert.equal(E.resolveRound(s, ['v0', 't0', 't1']).ok, false);
});
test('resolution uses the moment of pointing: mutual steals swap vaults', () => {
  const s = setup(game(3), { T: [[B(0)], [B(1)]], V: [[R(0)], [Y(0), Y(1)], []] });
  const r = E.resolveRound(s, ['v1', 'v0', 't0']);
  assert.deepEqual(r.res.out, ['steal', 'steal', 'gain']);
  assert.deepEqual(s.A[0].vault, [Y(0), Y(1)]);
  assert.deepEqual(s.A[1].vault, [R(0)]);
});
test('chain: a thief gets only what the victim had before this round', () => {
  const s = setup(game(4), { T: [[W(0)], [B(0)], [B(1)]], V: [[], [R(0)], [Y(0)], []] });
  // 0 steals from 1, 1 steals from 2, 2 takes table 0, 3 takes table 1
  const r = E.resolveRound(s, ['v1', 'v2', 't0', 't1']);
  assert.deepEqual(r.res.out, ['steal', 'steal', 'gain', 'gain']);
  assert.deepEqual(s.A[0].vault, [R(0)]);
  assert.deepEqual(s.A[1].vault, [Y(0)]);
  assert.deepEqual(s.A[2].vault, [W(0)]);
  assert.deepEqual(s.A[3].vault, [B(0)]);
});
test('pick order never matters: permuting actors gives the same outcome', () => {
  const base = setup(game(4), { T: [[W(0), W(1)], [B(0)], [R(0)]], V: [[Y(0)], [R(1)], [], [B(2)]] });
  const picks = ['t0', 'v0', 't0', 'v1'];
  const a = E.clone(base), b = E.clone(base);
  E.resolveRound(a, picks);
  E.resolveRound(b, picks.slice());
  assert.deepEqual(a.A, b.A);
  assert.deepEqual(a.T, b.T);
});

/* ---------- refill and end ---------- */
test('refill: empty tables get 2 first, tables with gems get 1', () => {
  const s = setup(game(4), { T: [[B(0)], [Y(0)], [R(0)]], bag: [B(5), B(6), B(7), B(8), B(9), B(10)] });
  E.resolveRound(s, ['t0', 't1', 't1', 't1']);   // table 0 emptied
  assert.equal(s.T[0].length, 2);
  assert.equal(s.T[1].length, 2);
  assert.equal(s.T[2].length, 2);
  assert.equal(s.bag.length, 2);
  assert.equal(s.final, false);
  assert.equal(s.rnd, 2);
});
test('the round after the bag is emptied is the last one; table leftovers score nothing', () => {
  const s = setup(game(3), { T: [[B(0)], [Y(0)]], bag: [R(0), R(1)] });
  E.resolveRound(s, ['t0', 't0', 't0']);         // clash: both tables keep gems, need 2, bag 2
  assert.equal(s.bag.length, 0);
  assert.equal(s.final, true);
  assert.ok(s.last.finalNext);
  const r = E.resolveRound(s, ['t0', 't1', 't1']);
  assert.ok(r.ok);
  assert.equal(s.ph, 'over');
  assert.ok(s.result && s.result.length === 3);
  assert.ok(s.T[1].length > 0, 'leftover gems remain on the table');
  assert.equal(E.personScore(s, 1).total, 0, 'leftovers are not scored');
});
test('short bag: the drawer chooses where the last gem goes among the remaining tables', () => {
  const s = setup(game(5), { T: [[B(0)], [Y(0)], [R(0)], [W(0)]], bag: [W(1), W(2), W(3), W(4)] });
  // table 0 becomes empty and is owed 2; tables 1-3 are owed 1 each: 5 needed, 4 in the bag
  E.resolveRound(s, ['t0', 't1', 't1', 't1', 't1']);
  assert.equal(s.ph, 'deal');
  assert.equal(s.T[0].length, 2, 'the empty table is served first');
  const served = [1, 2, 3].filter(t => s.T[t].length === 2);
  assert.equal(served.length, 1, 'then one table that still had gems');
  assert.equal(s.deal.legal.length, 2);
  assert.ok(!s.deal.legal.includes(0) && !s.deal.legal.includes(served[0]), 'only tables still owed a gem');
  assert.equal(s.deal.gem, W(1));
  assert.equal(E.dealPlace(s, 1, s.deal.legal[0]).ok, false, 'only the dealer places it');
  assert.equal(E.dealPlace(s, 0, served[0]).ok, false, 'not on a table already served');
  const t = s.deal.legal[1];
  assert.ok(E.dealPlace(s, 0, t).ok);
  assert.equal(s.T[t].length, 2);
  assert.equal(s.final, true);
  assert.equal(s.ph, 'pick');
  assert.equal(s.rnd, 2);
});
test('short bag: an empty table and a table with gems both count as remaining', () => {
  const s = setup(game(3), { T: [[B(0)], [Y(0)]], bag: [W(0)] });
  E.resolveRound(s, ['t0', 't1', 't1']);         // table 0 owed 2, table 1 owed 1, only 1 gem left
  assert.equal(s.ph, 'deal');
  assert.deepEqual(s.deal.legal, [0, 1]);
});
test('short bag with a single remaining table needs no choice', () => {
  const s = setup(game(3), { T: [[B(0)], [Y(0)]], bag: [W(0), W(1), W(2)], rest: [0, 0, 1] });
  E.resolveRound(s, ['t0', 't1', null]);        // both tables emptied: 4 owed, 3 in the bag
  assert.equal(s.ph, 'pick');
  assert.equal(s.final, true);
  assert.deepEqual([s.T[0].length, s.T[1].length].sort(), [1, 2]);
});
test('nobody can act (all resting): the round passes and tables still refill', () => {
  const s = setup(game(3), { T: [[B(0)], [Y(0)]], rest: [1, 1, 1], bag: [R(0), R(1), R(2), R(3)] });
  const r = E.resolveRound(s, [null, null, null]);
  assert.ok(r.ok);
  assert.deepEqual(r.res.out, ['rest', 'rest', 'rest']);
  assert.equal(s.T[0].length, 2); assert.equal(s.T[1].length, 2);
  s.A.forEach(x => assert.equal(x.rest, false));
});

/* ---------- two players ---------- */
test('2 players: the lower hand is the score; hands can point at each other', () => {
  const s = setup(game(2), { T: [[B(0)], [B(1)], [B(2)]], V: [[R(0), R(1)], [], [W(0)], [Y(0)]] });
  assert.ok(E.isLegal(s, 1, 'v0'), 'right hand may point at the left hand vault');
  assert.ok(!E.isLegal(s, 1, 'v1'), 'right hand has nothing to barrier');
  assert.ok(E.isLegal(s, 0, 'v0'), 'left hand barriers its own vault');
  const ps = E.personScore(s, 0);
  assert.equal(ps.total, 0, 'min(6, 0)');
  E.resolveRound(s, ['t0', 'v0', 't1', 't2']);  // P0's right hand takes the left hand's vault
  assert.deepEqual(s.A[1].vault, [R(0), R(1)]);
  assert.deepEqual(s.A[0].vault, [B(0)]);
  assert.equal(E.personScore(s, 0).total, 1);
});
test('2 players: both hands of one person on the same place collide', () => {
  const s = setup(game(2), { T: [[R(0)], [B(1)], [B(2)]] });
  const r = E.resolveRound(s, ['t0', 't0', 't1', 't2']);
  assert.deepEqual(r.res.out, ['clash', 'clash', 'gain', 'gain']);
});

/* ---------- ranking ---------- */
test('ties: more gems wins; the same score and gem count share the place', () => {
  const s = setup(game(3), { K: [[R(0), R(1)], [B(0), B(1), Y(0), Y(1)], [R(2), B(4), B(5), B(6)]] });
  const st = E.standings(s);
  assert.equal(st[0].total, 6); assert.equal(st[1].total, 6); assert.equal(st[2].total, 6);
  assert.deepEqual(st.map(r => r.rank), [1, 1, 3]);
  assert.equal(st[2].p, 0, 'two gems lose to four');
  assert.ok(st.every(r => r.sameTotal));
});

/* ---------- views and CPU ---------- */
test('public view hides the bag order and keeps counts only', () => {
  const s = game(4), v = E.publicView(s);
  assert.equal(v.bag, undefined); assert.equal(v.rs, undefined);
  assert.equal(v.bagN, s.bag.length);
  assert.deepEqual(v.bagC, E.counts(s.bag));
});
test('CPU decides from the public view only and always picks legal places', () => {
  const s = setup(game(4), { V: [[R(0)], [], [Y(0), W(0)], []] });
  const v = E.publicView(s);
  for (let lv = 1; lv <= 3; lv++) for (let p = 0; p < 4; p++) {
    const d1 = E.cpuDecide(v, p, lv, E.mulberry32(99));
    const v2 = E.clone(v); v2.secretPicks = { 0: 't0', 1: 't0', 2: 't0', 3: 't0' };     // anything extra is ignored
    const d2 = E.cpuDecide(v2, p, lv, E.mulberry32(99));
    assert.deepEqual(d1, d2);
    Object.entries(d1).forEach(([a, t]) => assert.ok(E.isLegal(s, +a, t), 'legal ' + t));
  }
});
test('CPU self-play: every player count finishes with all gems accounted for', () => {
  for (const np of [2, 3, 4, 5, 6]) for (let g = 0; g < 12; g++) {
    const rng = E.mulberry32(100 + g * 31 + np);
    const s = E.newGame(persons(np), { seed: 500 + g + np * 1000, now: 1 });
    const all = total(s);
    let guard = 0;
    while (s.ph !== 'over') {
      assert.ok(guard++ < 80, 'game ends');
      if (s.ph === 'deal') { assert.ok(E.dealPlace(s, s.dealer, E.cpuDeal(E.publicView(s), s.dealer, 1 + g % 3, rng)).ok); continue; }
      const v = E.publicView(s), picks = s.A.map(() => null);
      for (let p = 0; p < np; p++) Object.entries(E.cpuDecide(v, p, 1 + (p + g) % 3, rng)).forEach(([a, t]) => { picks[a] = t; });
      const r = E.resolveRound(s, picks);
      assert.ok(r.ok, r.err);
      assert.equal(total(s), all);
      // a 2-player CPU never collides with its own other hand
      if (np === 2) for (let p = 0; p < 2; p++) { const [l, rr] = [picks[p * 2], picks[p * 2 + 1]]; if (l && rr) assert.notEqual(l, rr); }
    }
    assert.equal(s.bag.length, 0);
  }
});
test('CPU learns habits from revealed rounds', () => {
  const s = game(3);
  const rng = E.mulberry32(5);
  for (let i = 0; i < 6 && s.ph === 'pick'; i++) {
    const v = E.publicView(s), picks = s.A.map(() => null);
    for (let p = 0; p < 3; p++) Object.entries(E.cpuDecide(v, p, 2, rng)).forEach(([a, t]) => { picks[a] = t; });
    E.resolveRound(s, picks);
    while (s.ph === 'deal') E.dealPlace(s, s.dealer, s.deal.legal[0]);
  }
  const h = E.learnHabits(E.publicView(s).hist, 0);
  assert.ok(h[1] && h[2] && h[1].n > 0);
  assert.equal(h[0], undefined, 'no model of itself');
});

/* ---------- online: commit-reveal host/client ---------- */
function makeNet(nClients, opts = {}) {
  const timers = [];
  const toHost = [];
  const clients = [];
  const hostTr = { h: {}, on(ev, fn) { this.h[ev] = fn; }, hostPublish(v) { const j = JSON.stringify(v); clients.forEach(c => c.tr.h.state && c.tr.h.state(JSON.parse(j))); }, close() {} };
  const host = new NET.HostSession({
    me: { cid: 'host', nm: 'H' }, transport: hostTr, code: '1234', roundPause: 0, think: [0, 0],
    schedule: (fn) => { timers.push(fn); return timers.length; }, unschedule: () => {}, rng: E.mulberry32(opts.seed || 3)
  });
  for (let i = 0; i < nClients; i++) {
    const cid = 'c' + i;
    const tr = { h: {}, on(ev, fn) { this.h[ev] = fn; }, clientSend(msg) { toHost.push({ cid, msg: JSON.parse(JSON.stringify(msg)) }); }, close() {} };
    const cs = new NET.ClientSession({ me: { cid, nm: 'C' + i }, transport: tr, code: '1234', store: NET.memStore(), now: () => 1e12 + timers.length * 5000 + toHost.length * 5000 });
    clients.push({ cid, tr, cs });
    hostTr.h.msg(cid, { k: 'hello', cid, nm: 'C' + i });
  }
  function flush(order) {
    let guard = 0;
    while ((toHost.length || timers.length) && guard++ < 2000) {
      if (toHost.length) {
        const i = order === 'reverse' ? toHost.length - 1 : order === 'random' ? Math.floor(Math.random() * toHost.length) : 0;
        const { cid, msg } = toHost.splice(i, 1)[0];
        hostTr.h.msg(cid, msg);
        if (order === 'dup') hostTr.h.msg(cid, msg);        // every message arrives twice
      } else timers.shift()();
    }
  }
  return { host, clients, toHost, timers, flush, hostTr };
}
test('online: picks never leave a browser before every hand has committed', () => {
  const N = makeNet(2);
  N.host.addCpu(2);
  N.host.start({ seed: 11, now: 1, dealer: 0 });
  const s = N.host.state;
  const c0 = N.clients[0].cs, me0 = c0.mySeat();
  const a0 = E.actorsOf(s, me0)[0];
  const t0 = E.legalTargets(s, a0)[0];
  c0.commit(a0, t0);
  const sent = N.toHost.map(m => JSON.stringify(m.msg)).join(' ');
  assert.ok(!sent.includes('"t":'), 'the commit carries no target');
  N.flush();
  const v = N.host.view();
  assert.ok(!JSON.stringify(v).includes('"t":"' + t0 + '"') || v.pf, 'the published view has no picks for the open round');
  assert.equal(v.rd.lock, false);
  assert.ok(v.rd.cm[a0], 'the commitment is public');
});
function playOnline(order, seed) {
  const N = makeNet(2, { seed });
  N.host.addCpu(3);
  N.host.start({ seed, now: 1, dealer: 3 });
  const pick = E.mulberry32(seed + 1);
  let guard = 0;
  while (N.host.state.ph !== 'over' && guard++ < 200) {
    const s = N.host.state;
    if (s.ph === 'pick') {
      const me = N.host.mySeat();
      E.actorsOf(s, me).forEach(a => { if (E.isActive(s, a) && !N.host.rd.cm[a]) { const L = E.legalTargets(s, a); N.host.commitLocal(a, L[Math.floor(pick() * L.length)]); } });
      N.clients.forEach(({ cs }) => {
        const v = cs.view(), p = cs.mySeat();
        E.actorsOf(v.state, p).forEach(a => { if (!v.state.A[a].rest && !v.rd.cm[a]) { const L = E.legalTargets(v.state, a); cs.commit(a, L[Math.floor(pick() * L.length)]); } });
      });
    }
    N.flush(order);
  }
  return N;
}
test('online: the result does not depend on message order or duplicates', () => {
  const ref = playOnline('fifo', 21);
  assert.equal(ref.host.state.ph, 'over');
  for (const order of ['reverse', 'dup', 'random']) {
    const other = playOnline(order, 21);
    assert.equal(other.host.state.ph, 'over', order);
    assert.deepEqual(other.host.state.hist.map(h => h.pk), ref.host.state.hist.map(h => h.pk), order + ': same picks every round');
    assert.deepEqual(other.host.state.result, ref.host.state.result, order + ': same result');
  }
  // every client sees the same final table as the host
  ref.clients.forEach(({ cs }) => assert.deepEqual(cs.view().state.A, E.publicView(ref.host.state).A));
});
test('online: duplicate, stale and forged messages are ignored', () => {
  const N = makeNet(1);
  N.host.addCpu(2);
  N.host.start({ seed: 5, now: 1 });
  const s = N.host.state, rd = N.host.rd;
  const p = N.host._personOf('c0'), a = E.actorsOf(s, p)[0];
  const h1 = E.commitHash(rd.g, rd.r, a, 't0', 'aa'.repeat(16));
  const h2 = E.commitHash(rd.g, rd.r, a, 't1', 'bb'.repeat(16));
  N.hostTr.h.msg('c0', { k: 'commit', g: rd.g, r: rd.r + 1, a, h: h1 });          // future round
  assert.equal(rd.cm[a], undefined);
  N.hostTr.h.msg('c0', { k: 'commit', g: rd.g, r: rd.r, a: a === 0 ? 1 : 0, h: h1 });   // someone else's hand
  assert.equal(Object.keys(rd.cm).length, 0);
  N.hostTr.h.msg('c0', { k: 'commit', g: rd.g, r: rd.r, a, h: h1 });
  N.hostTr.h.msg('c0', { k: 'commit', g: rd.g, r: rd.r, a, h: h2 });              // second commit: first one stands
  assert.equal(rd.cm[a], h1);
  E.actorsOf(s, N.host.mySeat()).forEach(x => N.host.commitLocal(x, E.legalTargets(s, x)[0]));
  N.toHost.length = 0;                                                             // the client's own auto-resends are not needed here
  N.flush();                                                                       // CPUs commit, round locks
  assert.equal(N.host.rd.lock, true);
  N.hostTr.h.msg('c0', { k: 'reveal', g: rd.g, r: rd.r, a, t: 't1', s: 'aa'.repeat(16) });   // does not match the hash
  assert.equal(rd.rv[a], undefined);
  N.hostTr.h.msg('c0', { k: 'reveal', g: rd.g, r: rd.r, a, t: 't0', s: 'aa'.repeat(16) });
  assert.equal(N.host.state.rnd, 2, 'round resolved after the matching reveal');
  assert.equal(N.host.state.hist[0].pk[a], 't0');
});
test('online: clients verify every revealed pick against the commitments', () => {
  let proofs = [];
  const N = makeNet(1);
  N.clients[0].cs.onProof = (ok) => proofs.push(ok);
  N.host.addCpu(1);
  N.host.start({ seed: 9, now: 1 });
  const s = N.host.state;
  E.actorsOf(s, N.host.mySeat()).forEach(a => N.host.commitLocal(a, E.legalTargets(s, a)[0]));
  const cs = N.clients[0].cs, v = cs.view();
  E.actorsOf(v.state, cs.mySeat()).forEach(a => cs.commit(a, E.legalTargets(v.state, a)[0]));
  N.flush();
  assert.equal(N.host.state.rnd, 2);
  assert.deepEqual(proofs, [true]);
});
test('online: a disconnected player can be replaced by a CPU mid-round', () => {
  const N = makeNet(1);
  N.host.start({ seed: 4, now: 1 });
  const s = N.host.state;
  const p = N.host._personOf('c0'), a = E.actorsOf(s, p)[0];
  N.clients[0].cs.commit(a, E.legalTargets(s, a)[0]);
  N.flush();
  N.hostTr.h.leave('c0');
  N.host.replaceWithCpu(p);
  assert.equal(N.host.rd.cm[a], undefined, 'the unopened commitment is dropped');
  E.actorsOf(s, N.host.mySeat()).forEach(x => N.host.commitLocal(x, E.legalTargets(s, x)[0]));
  N.flush();
  assert.equal(N.host.state.rnd, 2);
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
