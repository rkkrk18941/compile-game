import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/core/rules.js';
import { snapshotFor } from '../src/core/view.js';
import { PRESET_MAZES, presetToSetup, isValidSetup, generateSetup } from '../src/core/mazegen.js';

const HOST = 'host-ruins', P1 = 'player-1', P2 = 'player-2';

// Fixed maze used by most tests.
//   y\x 0 1 2 3 4
//   0   . . . # .
//   1   . # . . .
//   2   . . S . #
//   3   # . . # .
//   4   . . . . .
function fixedSetup(state, starts = { x1: 0, x2: 24 }) {
  const rows = ['...#.', '.#...', '..S.#', '#..#.', '.....'];
  state.board = Array(25).fill('open');
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    const i = y * 5 + x;
    if (ch === '#') state.board[i] = 'wall';
    if (ch === 'S') state.board[i] = 'shrine';
  }));
  state.shrine = { index: 12, shape: 'I', rotation: 0, under: 'open' }; // exits N(7) and S(17)
  state.starts = { ...starts };
}

function newGame({ players = [P1], explorerCount = 2, starts, chars = ['monk', 'guide', 'doctor'], stacks } = {}) {
  const s = R.createRoom({ roomCode: 'ABCDEFG', hostClientId: HOST, hostName: 'Ruins' });
  for (const p of players) R.joinRoom(s, p, p);
  R.setOptions(s, { explorerCount });
  if (stacks) R.setOptions(s, { timePreset: 'custom', customStacks: stacks });
  R.beginSetup(s);
  const ids = Object.keys(s.explorers);
  fixedSetup(s, starts || (ids.length === 3 ? { x1: 0, x2: 24, x3: 4 } : { x1: 0, x2: 24 }));
  ids.forEach((id, i) => R.setCharacter(s, s.explorers[id].ownerClientId, id, chars[i]));
  return s;
}
const owner = (s, eid) => s.explorers[eid].ownerClientId;

test('lobby: one explorer player controls two explorers; three when requested', () => {
  const a = newGame({ players: [P1] });
  assert.deepEqual(Object.keys(a.explorers), ['x1', 'x2']);
  assert.ok(Object.values(a.explorers).every(e => e.ownerClientId === P1));
  const b = newGame({ players: [P1, P2], explorerCount: 3 });
  assert.deepEqual(Object.values(b.explorers).map(e => e.ownerClientId), [P1, P2, P1]);
});

test('setup checks catch every rule', () => {
  const s = newGame();
  assert.equal(R.validateSetup(s), null);
  s.starts = { x1: 0, x2: 1 };
  assert.match(R.validateSetup(s), /隣接/);
  s.starts = { x1: 0, x2: 11 }; // 11 is next to the shrine (12)
  assert.match(R.validateSetup(s), /石室/);
  s.starts = { x1: 0, x2: 24 };
  s.shrine.rotation = 1; // exits W(11) E(13) are rooms → still fine
  assert.equal(R.validateSetup(s), null);
  s.board[13] = 'wall';
  assert.match(R.validateSetup(s), /矢印/);
  s.board[13] = 'open'; s.shrine.rotation = 0;
  s.board[3] = 'open'; s.board[14] = 'open';
  assert.match(R.validateSetup(s), /5マス以上/);
});

test('characters are unique and the error names who took it', () => {
  const s = newGame({ players: [P1, P2] });
  assert.throws(() => R.setCharacter(s, P2, 'x2', 'monk'), /青の探検家/);
});

test('teammates see each other’s characters during setup; the ruins does not', () => {
  const s = newGame({ players: [P1, P2] });
  const forP2 = snapshotFor(s, P2), forRuins = snapshotFor(s, HOST);
  assert.equal(forP2.explorers.x1.character, 'monk');
  assert.equal(forRuins.explorers.x1.character, 'hidden');
  assert.ok(forRuins.setup.board && !forP2.setup.board);
});

test('start: clue distance, guard in the shrine, apprentice starts fatigued', () => {
  const s = newGame({ chars: ['apprentice', 'guide'] });
  R.startGame(s, HOST, 'x2');
  // shrine 12 exits N→7, S→17. From 17: 17→22→23→24 = 3 steps + 1 = 4
  assert.equal(s.clue.distance, 4);
  assert.equal(s.guards.length, 1);
  assert.equal(s.guards[0].pos, 12);
  assert.equal(s.explorers.x1.fatigue, true);
  assert.equal(s.stage, 'explorerTurns');
  assert.equal(s.activeExplorerId, null, 'nobody is forced to act first');
});

test('explore a room moves in, a wall blocks movement but not abilities', () => {
  const s = newGame();
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  const before = R.totalTimeRemaining(s);
  R.explore(s, P1, 'x1', 'E');                 // 0 → 1 room
  assert.equal(s.explorers.x1.pos, 1);
  assert.equal(R.totalTimeRemaining(s), before - 1);
  R.explore(s, P1, 'x1', 'S');                 // 1 → 6 wall
  assert.equal(s.explorers.x1.blocked, true);
  assert.throws(() => R.moveExplorer(s, P1, 'x1', 'W'), /壁に当たった/);
  R.useAbility(s, P1, 'x1', { dir: 'E' });     // monk still usable
  // monk at 1 looking east: cells 2,3,4 → one wall (3)
  assert.equal(s.intel.at(-1).count, 1);
  // blocked + fatigued → turn ends automatically and with one explorer left it auto-activates
  assert.equal(s.activeExplorerId, 'x2');
});

test('outer edge counts as a wall', () => {
  const s = newGame();
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  R.explore(s, P1, 'x1', 'N');
  assert.equal(s.explorers.x1.discovered['0,-1'], 'wall');
});

test('movePath walks known rooms for free', () => {
  const s = newGame();
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  R.explore(s, P1, 'x1', 'E');
  R.explore(s, P1, 'x1', 'E');                // 0→1→2
  const t = R.totalTimeRemaining(s);
  R.movePath(s, P1, 'x1', ['W', 'W']);
  assert.equal(s.explorers.x1.pos, 0);
  assert.equal(R.totalTimeRemaining(s), t);
  assert.throws(() => R.movePath(s, P1, 'x1', ['S']), /判明済み/);
});

test('geographer needs two unknown neighbours and costs two tiles', () => {
  const s = newGame({ chars: ['geographer', 'guide'] });
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  // at 0: N and W are outer walls (unknown to the explorer), E, S unknown → 4 unknown
  const t = R.totalTimeRemaining(s);
  assert.throws(() => R.useAbility(s, P1, 'x1', { dirs: ['E'] }), /2方向/);
  R.useAbility(s, P1, 'x1', { dirs: ['E', 'S'] });
  assert.equal(R.totalTimeRemaining(s), t - 2);
  assert.equal(s.explorers.x1.discovered['1,0'], 'open');
  assert.equal(s.explorers.x1.discovered['0,1'], 'open');
  assert.equal(s.explorers.x1.pos, 0, 'geographer does not move');
  // with only one unknown neighbour it cannot be used (even after recovering)
  const s2 = newGame({ chars: ['geographer', 'guide'] });
  R.startGame(s2, HOST, 'x1');
  R.claimTurn(s2, P1, 'x1');
  const e = s2.explorers.x1;
  e.discovered['1,0'] = 'open'; e.discovered['0,1'] = 'open'; e.discovered['0,-1'] = 'wall';
  assert.throws(() => R.useAbility(s2, P1, 'x1', { dirs: ['W'] }), /2か所以上/);
});

test('phase ends: guard added, fatigue cleared, guardian appears, move tokens grow', () => {
  const s = newGame({ stacks: [2, 2, 2, 2], chars: ['monk', 'guide'] });
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  R.useAbility(s, P1, 'x1', { dir: 'E' });
  assert.equal(s.explorers.x1.fatigue, true);
  R.consumeTime(s, 2, 't');
  assert.equal(s.phase, 1); assert.equal(s.guards.length, 2); assert.equal(s.baseMoveTokens, 3);
  R.consumeTime(s, 2, 't');
  assert.equal(s.phase, 2); assert.equal(s.explorers.x1.fatigue, false);
  R.consumeTime(s, 2, 't');
  assert.equal(s.phase, 3); assert.ok(s.guards.some(g => g.type === 'guardian')); assert.equal(s.baseMoveTokens, 5);
  R.consumeTime(s, 5, 't');
  assert.equal(s.timeExpired, true); assert.equal(R.totalTimeRemaining(s), 0);
});

test('no exploring once the maze tiles are gone (moving still allowed)', () => {
  const s = newGame({ stacks: [1, 1, 1, 1] });
  R.startGame(s, HOST, 'x1');
  R.claimTurn(s, P1, 'x1');
  R.explore(s, P1, 'x1', 'E');
  R.consumeTime(s, 3, 't');
  assert.equal(s.timeExpired, true);
  assert.throws(() => R.explore(s, P1, 'x1', 'E'), /迷宮マスが残っていない/);
  R.moveExplorer(s, P1, 'x1', 'W');
  assert.equal(s.explorers.x1.pos, 0);
});

function playToEscape(s) {
  for (const id of Object.keys(s.explorers)) {
    if (s.stage !== 'explorerTurns') break;
    if (!s.activeExplorerId) R.claimTurn(s, owner(s, id), id);
    R.endExplorerTurn(s, owner(s, s.activeExplorerId), s.activeExplorerId);
  }
}

test('escape needs every explorer player to agree', () => {
  const s = newGame({ players: [P1, P2] });
  R.startGame(s, HOST, 'x1');
  playToEscape(s);
  assert.equal(s.stage, 'escape');
  R.voteEscape(s, P1, 'go');
  assert.equal(s.stage, 'escape', 'one vote is not enough');
  R.voteEscape(s, P2, 'wait');
  assert.equal(s.stage, 'prediction');
  // and a unanimous vote with everyone apart loses
  const t = newGame({ players: [P1, P2] });
  R.startGame(t, HOST, 'x1');
  playToEscape(t);
  R.voteEscape(t, P1, 'go'); R.voteEscape(t, P2, 'go');
  assert.equal(t.winner, 'ruins');
  // same cell → win with score = remaining time
  const u = newGame({ players: [P1, P2] });
  R.startGame(u, HOST, 'x1');
  u.explorers.x2.pos = u.explorers.x1.pos;
  playToEscape(u);
  R.voteEscape(u, P1, 'go'); R.voteEscape(u, P2, 'go');
  assert.equal(u.winner, 'explorers');
  assert.equal(u.score, R.totalTimeRemaining(u));
});

function predictAll(s, choice = 'rest') {
  for (const e of Object.values(s.explorers)) R.submitPrediction(s, e.ownerClientId, e.id, `commit-${e.id}-${choice}-xxxxxxxxxxxx`);
}

test('ruins turn: guards leave the shrine only through its arrows and cannot return', () => {
  const s = newGame();
  R.startGame(s, HOST, 'x1');
  playToEscape(s);
  R.voteEscape(s, P1, 'wait');
  predictAll(s);
  assert.equal(s.stage, 'ruinsTurn');
  const g = s.guards[0];
  assert.deepEqual(R.legalEnemyDestinations(s, g.id).sort((a, b) => a - b), [7, 17]);
  R.moveEnemy(s, HOST, g.id, 7);
  assert.ok(!R.legalEnemyDestinations(s, g.id).includes(12));
});

test('normal attack: rest is hit for 3, alert blocks, unattacked alert gets locked', () => {
  const s = newGame({ starts: { x1: 2, x2: 24 } }); // x1 at 2, next to the N exit (7)
  R.startGame(s, HOST, 'x1');
  playToEscape(s);
  R.voteEscape(s, P1, 'wait');
  predictAll(s);
  const g = s.guards[0];
  R.moveEnemy(s, HOST, g.id, 7);
  R.moveEnemy(s, HOST, g.id, 2);
  assert.deepEqual(R.attackableTargets(s), ['x1']);
  const t = R.totalTimeRemaining(s);
  const res = R.declareAttack(s, HOST, 'x1');
  assert.equal(res.reveal.explorerId, 'x1');
  R.applyReveal(s, 'x1', 'rest');
  assert.equal(R.totalTimeRemaining(s), t - 3);
  assert.deepEqual(R.attackableTargets(s), [], 'cannot attack the same explorer twice');
  const end = R.endRuinsTurn(s, HOST);
  assert.deepEqual(end.reveals.map(r => r.explorerId), ['x2']);
  R.applyReveal(s, 'x2', 'alert');
  assert.equal(s.stage, 'explorerTurns');
  assert.equal(s.round, 2);
  assert.equal(s.explorers.x2.alertLocked, true);
  assert.equal(s.explorers.x1.alertLocked, false);
});

test('guardian super attack ignores alert, once per explorer per turn', () => {
  const s = newGame({ starts: { x1: 2, x2: 24 }, stacks: [1, 1, 1, 9] });
  R.startGame(s, HOST, 'x1');
  R.consumeTime(s, 3, 't');
  const k = s.guards.find(g => g.type === 'guardian');
  assert.ok(k);
  playToEscape(s);
  R.voteEscape(s, P1, 'wait');
  predictAll(s, 'alert');
  R.moveEnemy(s, HOST, k.id, 2);   // 12 → 7 → 2 in one token
  const t = R.totalTimeRemaining(s);
  R.declareAttack(s, HOST, 'x1');
  assert.equal(R.totalTimeRemaining(s), t - 3);
  assert.deepEqual(R.attackableTargets(s), []);
});

test('time running out in the ruins turn still gives explorers a final move-only round', () => {
  const s = newGame({ starts: { x1: 2, x2: 24 }, stacks: [1, 1, 1, 2] });
  R.startGame(s, HOST, 'x1');
  R.consumeTime(s, 3, 't');            // now in phase 4 with 2 left
  playToEscape(s);
  R.voteEscape(s, P1, 'wait');
  predictAll(s, 'rest');
  const g = s.guards.find(x => x.type === 'guard');
  R.moveEnemy(s, HOST, g.id, 7);
  R.moveEnemy(s, HOST, g.id, 2);
  R.declareAttack(s, HOST, 'x1');
  R.applyReveal(s, 'x1', 'rest');
  assert.equal(s.timeExpired, true);
  R.endRuinsTurn(s, HOST);
  R.applyReveal(s, 'x2', 'rest');
  assert.equal(s.stage, 'explorerTurns');
  assert.equal(s.finalRound, true);
  R.claimTurn(s, P1, 'x1');
  assert.throws(() => R.explore(s, P1, 'x1', 'W'), /迷宮マス/);
  R.endExplorerTurn(s, P1, 'x1');
  R.endExplorerTurn(s, P1, 'x2');
  assert.equal(s.stage, 'finalEscape');
  assert.throws(() => R.voteEscape(s, P1, 'wait'), /最後の脱出/);
  R.voteEscape(s, P1, 'go');
  assert.equal(s.stage, 'gameover');
});

test('encounters never block the explorer and default to declared', () => {
  const s = newGame({ starts: { x1: 2, x2: 24 } });
  R.startGame(s, HOST, 'x1');
  s.guards[0].pos = 1; // put the guard next to x1
  R.claimTurn(s, P1, 'x1');
  const t = R.totalTimeRemaining(s);
  R.explore(s, P1, 'x1', 'W');  // 2 → 1 (guard there)
  assert.equal(s.pendingEncounters.length, 1);
  R.explore(s, P1, 'x1', 'W');  // keeps acting: 1 → 0
  assert.equal(s.explorers.x1.pos, 0);
  R.expireEncounters(s, Date.now() + 60000);
  assert.equal(s.pendingEncounters.length, 0);
  assert.equal(R.totalTimeRemaining(s), t - 3);
  // ruins may also decline explicitly
  const u = newGame({ starts: { x1: 2, x2: 24 } });
  R.startGame(u, HOST, 'x1');
  u.guards[0].pos = 1;
  R.claimTurn(u, P1, 'x1');
  R.explore(u, P1, 'x1', 'W');
  const q = u.pendingEncounters[0];
  const tu = R.totalTimeRemaining(u);
  R.resolveEncounter(u, HOST, q.id, false);
  assert.equal(R.totalTimeRemaining(u), tu);
});

test('an undecided encounter stays open through the escape talk and resolves before the ruins turn', () => {
  const s = newGame({ starts: { x1: 2, x2: 24 } });
  R.startGame(s, HOST, 'x1');
  s.guards[0].pos = 1;
  R.claimTurn(s, P1, 'x1');
  R.explore(s, P1, 'x1', 'W'); // enters the guard's room
  const t = R.totalTimeRemaining(s);
  R.endExplorerTurn(s, P1, 'x1');
  if (s.stage === 'explorerTurns') { if (!s.activeExplorerId) R.claimTurn(s, P1, 'x2'); R.endExplorerTurn(s, P1, 'x2'); }
  assert.equal(s.stage, 'escape');
  assert.equal(s.pendingEncounters.length, 1, 'still the ruins player\'s call during the escape talk');
  R.voteEscape(s, P1, 'wait');
  assert.equal(s.pendingEncounters.length, 1);
  predictAll(s);
  assert.equal(s.stage, 'ruinsTurn');
  assert.equal(s.pendingEncounters.length, 0);
  assert.equal(R.totalTimeRemaining(s), t - 1, 'undecided encounters default to declared');
});

test('explorer snapshot hides the maze, guards and real positions', () => {
  const s = newGame();
  R.startGame(s, HOST, 'x1');
  const snap = snapshotFor(s, P1);
  assert.equal(snap.ruins, undefined);
  assert.equal(snap.reveal, undefined);
  const txt = JSON.stringify(snap);
  assert.ok(!txt.includes('"pos"'), 'no absolute positions');
  assert.ok(!txt.includes('"board"'));
  const rs = snapshotFor(s, HOST);
  assert.ok(rs.ruins.board.length === 25 && rs.ruins.guards.length === 1);
});

test('turn order: claim, pass to a named explorer, auto pick after the deadline', () => {
  const s = newGame({ players: [P1, P2], explorerCount: 3 });
  R.startGame(s, HOST, 'x1');
  assert.ok(s.turnClaimDeadline);
  R.autoAssignTurn(s, s.turnClaimDeadline + 1);
  assert.ok(s.activeExplorerId);
  const a = s.activeExplorerId;
  const rest = ['x1', 'x2', 'x3'].filter(x => x !== a);
  R.endExplorerTurn(s, owner(s, a), a, rest[1]);
  assert.equal(s.activeExplorerId, rest[1]);
});

test('team board clamps layers and keeps a single meeting mark', () => {
  const s = newGame({ players: [P1, P2] });
  R.startGame(s, HOST, 'x1');
  R.teamMoveLayer(s, P1, 'x1', 10, -4);
  assert.deepEqual([s.teamBoard.layers.x1.x, s.teamBoard.layers.x1.y], [6, 0]);
  R.teamMark(s, P2, 3, 3, 'meet');
  R.teamMark(s, P1, 2, 2, 'meet');
  assert.equal(s.teamBoard.marks.filter(m => m.kind === 'meet').length, 1);
  assert.throws(() => R.teamMark(s, HOST, 1, 1, 'star'), /探検家だけ/);
});

test('preset mazes and generated mazes are valid', () => {
  for (const p of PRESET_MAZES) {
    for (const ids of [['x1', 'x2'], ['x1', 'x2', 'x3']]) {
      const setup = presetToSetup(p, ids);
      assert.ok(isValidSetup(setup), `preset ${p.name} (${ids.length})`);
    }
  }
  for (const level of ['easy', 'normal', 'hard']) {
    for (let i = 0; i < 5; i++) assert.ok(isValidSetup(generateSetup(['x1', 'x2', 'x3'], { level })), level);
  }
});
