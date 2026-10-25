// ガイスター: rules engine and CPU tests.   node tools/geister-rules-test.mjs [--quick]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../geister/engine.js');
let AI = null;
try { AI = require('../geister/ai.js'); } catch (e) { console.log('ai.js not loaded: ' + e.message); }
const QUICK = process.argv.includes('--quick');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ' (got ' + A + ', want ' + B + ')'); }
const S = (r, c) => r * 6 + c;
const ALL_GOOD_FRONT = [1, 1, 1, 1, 0, 0, 0, 0];   // front row good, back row bad

/* a game with both players set up */
function started(l0 = ALL_GOOD_FRONT, l1 = ALL_GOOD_FRONT, first = 0) {
  const s = E.newGame({ seed: 7, first });
  ok(E.setup(s, 0, l0).ok, 'player 0 sets up');
  ok(E.setup(s, 1, l1).ok, 'player 1 sets up');
  return s;
}
/* move a ghost anywhere (test helper: keeps board and ghosts in step) */
function place(s, id, q) {
  const x = s.g[id];
  if (x.at >= 0) s.board[x.at] = -1;
  if (s.board[q] >= 0) { const o = s.g[s.board[q]]; o.st = 'cap'; o.at = -1; }
  s.board[q] = id; x.at = q; x.st = 'on';
}
function act(s, p, f, t) { const r = E.apply(s, p, { f, t }); ok(r.ok, `move ${f}→${t} by ${p} is legal (${r.err || ''})`); return r; }

/* ---------------------------------------------------------------- the board */
{
  eq(E.homeSquares(0), [S(4, 1), S(4, 2), S(4, 3), S(4, 4), S(5, 1), S(5, 2), S(5, 3), S(5, 4)], 'player 0 home squares, front row first');
  eq(E.homeSquares(1), [S(1, 4), S(1, 3), S(1, 2), S(1, 1), S(0, 4), S(0, 3), S(0, 2), S(0, 1)], 'player 1 home squares, as seen from the top seat');
  eq(E.exitsOf(0), [S(0, 0), S(0, 5)], 'player 0 leaves through the far corners');
  eq(E.exitsOf(1), [S(5, 0), S(5, 5)], 'player 1 leaves through the bottom corners');
  ok(E.homeSquares(0).every((q) => !E.homeSquares(1).includes(q)), 'home squares do not overlap');
  ok(E.homeSquares(0).every((q) => E.colOf(q) >= 1 && E.colOf(q) <= 4), 'the corner columns start empty');
  eq(E.neighbours(S(0, 0)).length, 2, 'a corner has two neighbours');
  eq(E.neighbours(S(2, 3)).length, 4, 'a middle square has four');
  eq(E.dist(S(5, 0), S(0, 5)), 10, 'distance across the board');
}

/* ---------------------------------------------------------------- setting up */
{
  const s = E.newGame({ seed: 3, first: 1 });
  eq(s.phase, 'setup', 'a new game starts with setting up');
  ok(!E.setup(s, 0, [1, 1, 1, 0, 0, 0, 0, 0]).ok, 'three good ghosts are refused');
  ok(!E.setup(s, 0, [1, 1, 1, 1, 1, 0, 0, 0]).ok, 'five good ghosts are refused');
  ok(!E.setup(s, 0, [1, 1, 1, 1, 0, 0, 0]).ok, 'seven slots are refused');
  ok(E.setup(s, 0, [0, 1, 0, 1, 1, 0, 1, 0]).ok, 'four and four is fine');
  ok(!E.setup(s, 0, [0, 1, 0, 1, 1, 0, 1, 0]).ok, 'a player sets up once');
  eq(s.phase, 'setup', 'still waiting for the other player');
  eq(E.legal(s, 1).length, 0, 'no moves before both are ready');
  ok(E.setup(s, 1, ALL_GOOD_FRONT).ok, 'player 1 sets up');
  eq(s.phase, 'play', 'then the game begins');
  eq(s.turn, 1, 'the chosen first player moves first');
  eq(s.g[1].good, true, 'slot 1 of player 0 is good'); eq(s.g[0].good, false, 'slot 0 is bad');
  eq(s.board[S(4, 2)], 1, 'ghost 1 stands on its slot square');
  const seeds = new Set(); for (let i = 0; i < 40; i++) seeds.add(E.newGame({ seed: i }).first);
  eq([...seeds].sort(), [0, 1], 'the first player is drawn when not given');
  for (let i = 0; i < 50; i++) ok(E.validLayout(E.randomLayout(E.mulberry32(i))), 'random layouts are valid');
}

/* ---------------------------------------------------------------- moving and capturing */
{
  const s = started();
  const first = E.legal(s, 0);
  // front row (4 ghosts) each step forward + the two at the ends step sideways into the corner columns; back row the ends sideways
  eq(first.length, 4 + 2 + 2, 'eight opening moves');
  ok(!E.apply(s, 1, { f: S(1, 1), t: S(2, 1) }).ok, 'not your turn');
  ok(!E.apply(s, 0, { f: S(4, 1), t: S(4, 2) }).ok, 'cannot move onto your own ghost');
  ok(!E.apply(s, 0, { f: S(4, 1), t: S(2, 1) }).ok, 'one square only');
  ok(!E.apply(s, 0, { f: S(4, 1), t: S(3, 2) }).ok, 'no diagonal moves');
  ok(!E.apply(s, 0, { f: S(2, 2), t: S(3, 2) }).ok, 'must move a ghost of yours');
  act(s, 0, S(4, 1), S(3, 1));
  eq(s.turn, 1, 'turns alternate');
  eq(s.ply, 1, 'moves are counted');
  act(s, 1, S(1, 1), S(2, 1));
  const r = act(s, 0, S(3, 1), S(2, 1));
  eq(r.ev.cap, 8 + 3, 'the ghost on 2,1 is captured');
  eq(s.g[11].st, 'cap', 'it leaves the board');
  eq(r.ev.capGood, true, 'and its colour is shown');
  eq(s.board[S(2, 1)], 0, 'the capturing ghost takes the square');
}

/* ---------------------------------------------------------------- leaving the board */
{
  const s = started();
  place(s, 1, S(0, 0));      // a good ghost of player 0 on a far corner
  place(s, 4, S(0, 5));      // a bad ghost of player 0 on the other far corner
  place(s, 9, S(5, 0));      // a good ghost of player 1 on player 0's corner
  const exits = E.legal(s, 0).filter((a) => a.t === E.EXIT);
  eq(exits.map((a) => a.f), [S(0, 0)], 'only the good ghost on a far corner may leave');
  ok(!E.apply(s, 0, { f: S(0, 5), t: E.EXIT }).ok, 'a bad ghost cannot leave');
  ok(!E.apply(s, 0, { f: S(4, 2), t: E.EXIT }).ok, 'nor a ghost away from the corners');
  const r = act(s, 0, S(0, 0), E.EXIT);
  ok(r.ev.esc, 'the ghost leaves');
  eq([s.phase, s.winner, s.reason], ['over', 0, 'escape'], 'and wins the game');
}
{
  const s = started();
  place(s, 1, S(5, 0));      // a good ghost of player 0 on its own corner
  ok(!E.legal(s, 0).some((a) => a.t === E.EXIT), 'your own corners are not exits for you');
}

/* ---------------------------------------------------------------- four good, four bad */
{
  const s = started([1, 1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0]);
  // player 0 takes player 1's four good ghosts (ids 8..11, on row 1)
  for (let k = 0; k < 3; k++) { s.g[8 + k].st = 'cap'; s.board[s.g[8 + k].at] = -1; s.g[8 + k].at = -1; }
  place(s, 1, S(2, 1));      // next to player 1's last good ghost on 1,1 (id 11)
  const r = act(s, 0, S(2, 1), S(1, 1));
  eq([r.ev.capGood, s.winner, s.reason], [true, 0, 'good'], 'taking the fourth good ghost wins');
}
{
  const s = started([1, 1, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0]);
  // player 0 has taken three of player 1's bad ghosts already
  for (let k = 4; k < 7; k++) { s.g[8 + k].st = 'cap'; s.board[s.g[8 + k].at] = -1; s.g[8 + k].at = -1; }
  place(s, 1, S(0, 0));      // next to player 1's last bad ghost on 0,1 (id 15)
  const r = act(s, 0, S(0, 0), S(0, 1));
  eq([r.ev.capGood, s.winner, s.reason], [false, 1, 'bad'], 'taking the fourth bad ghost loses');
}
{
  const s = started();
  s.limit = 4;
  act(s, 0, S(4, 1), S(3, 1)); act(s, 1, S(1, 1), S(2, 1)); act(s, 0, S(3, 1), S(3, 0)); act(s, 1, S(2, 1), S(2, 0));
  eq([s.phase, s.winner, s.reason], ['over', -1, 'limit'], 'a game that reaches the limit is drawn');
  const t = started();
  ok(E.resign(t, 1).ok && t.winner === 0 && t.reason === 'resign', 'resigning hands the win over');
}

/* ---------------------------------------------------------------- hidden information */
{
  const s = started([0, 1, 0, 1, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 1]);
  const v0 = E.viewFor(s, 0), v1 = E.viewFor(s, 1);
  ok(v0.g.slice(0, 8).every((x) => typeof x.good === 'boolean'), 'a player sees their own colours');
  ok(v0.g.slice(8).every((x) => x.good === null), 'but not the opponent\'s');
  ok(v1.g.slice(0, 8).every((x) => x.good === null) && v1.g.slice(8).every((x) => typeof x.good === 'boolean'), 'the same from the other seat');
  const spect = E.viewFor(s, -1);
  ok(spect.g.every((x) => x.good === null), 'nobody else sees any colour');
  act(s, 0, S(4, 1), S(3, 1)); act(s, 1, S(1, 1), S(2, 1)); act(s, 0, S(3, 1), S(2, 1));
  const after = E.viewFor(s, 0);
  eq(after.g[11].good, true, 'a captured ghost is shown to both');
  eq(E.viewFor(s, 1).g[11].good, true, 'to its owner as well');
  ok(!JSON.stringify(E.viewFor(s, 1)).includes('"seed"'), 'the view does not carry the seed');
  E.resign(s, 1);
  ok(E.viewFor(s, 1).g.every((x) => typeof x.good === 'boolean'), 'when the game is over everything is shown');
  eq(E.tally(after, 1), { onBoard: 7, good: 3, bad: 4, lostGood: 1, lostBad: 0 }, 'public counts of what is left');
}

/* ---------------------------------------------------------------- random games keep the board in order */
{
  let games = 0, decided = 0;
  const reasons = {};
  for (let seed = 1; seed <= (QUICK ? 150 : 600); seed++) {
    const rng = E.mulberry32(seed);
    const s = E.newGame({ seed });
    E.setup(s, 0, E.randomLayout(rng)); E.setup(s, 1, E.randomLayout(rng));
    let guard = 0, broken = false;
    while (s.phase === 'play' && guard++ < 400) {
      const ms = E.legal(s, s.turn);
      if (!ms.length) { broken = true; break; }
      // random play that grabs exits when it can, so that every way of winning shows up
      const ex = ms.filter((a) => a.t === E.EXIT);
      const a = ex.length ? ex[0] : ms[Math.floor(rng() * ms.length)];
      const r = E.apply(s, s.turn, a);
      if (!r.ok) { broken = true; break; }
      for (let q = 0; q < 36; q++) { const id = s.board[q]; if (id >= 0 && (s.g[id].at !== q || s.g[id].st !== 'on')) broken = true; }
      if (s.g.some((x) => x.st === 'on' && s.board[x.at] !== s.g.indexOf(x))) broken = true;
    }
    ok(!broken, `random game ${seed} stays consistent`);
    ok(s.phase === 'over', `random game ${seed} ends`);
    games++; if (s.winner >= 0) decided++;
    reasons[s.reason] = (reasons[s.reason] || 0) + 1;
  }
  ok(reasons.escape > 0 && reasons.good > 0 && reasons.bad > 0, 'random play reaches every way of winning ' + JSON.stringify(reasons));
}

/* ---------------------------------------------------------------- the CPU */
if (AI) await (await import('./geister-ai-test.mjs')).default({ E, AI, ok, eq, QUICK, place, started, S });

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
