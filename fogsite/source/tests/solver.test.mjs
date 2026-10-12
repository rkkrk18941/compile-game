import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/core/rules.js';
import { snapshotFor } from '../src/core/view.js';
import { buildKnowledge, solve, summarize, boardConflicts, positionsFor } from '../src/core/solver.js';
import { DIR_KEYS } from '../src/core/constants.js';

function randomGame(seedCount = 3, chars = ['guide', 'monk', 'archaeologist']) {
  const s = R.createRoom({ roomCode: 'ABCDEFG', hostClientId: 'H', hostName: 'R' });
  R.joinRoom(s, 'P', 'P');
  R.setOptions(s, { explorerCount: seedCount, timePreset: 'custom', customStacks: [30, 30, 30, 30] });
  R.beginSetup(s);
  Object.keys(s.explorers).forEach((id, i) => R.setCharacter(s, 'P', id, chars[i]));
  R.startGame(s, 'H', 'x1');
  return s;
}

test('solver never rules out the true placement (random play, with guide + monk + archaeologist)', () => {
  for (let g = 0; g < 25; g++) {
    const s = randomGame(3);
    for (let step = 0; step < 40 && s.stage === 'explorerTurns'; step++) {
      if (!s.activeExplorerId) R.claimTurn(s, 'P', Object.keys(s.explorers).find(id => !s.doneExplorers.includes(id)));
      const e = s.explorers[s.activeExplorerId];
      const r = Math.random();
      try {
        if (r < 0.12 && !e.fatigue) {
          if (e.character === 'monk') R.useAbility(s, 'P', e.id, { dir: DIR_KEYS[Math.floor(Math.random() * 4)] });
          else if (e.character === 'guide') { R.useAbility(s, 'P', e.id, { targetExplorerId: e.id === 'x1' ? 'x2' : 'x1' }); R.resolvePendingAbility(s, 'H', { dir: s.pendingAbility.validDirs[0] }); }
          else if (e.character === 'archaeologist') {
            const d = DIR_KEYS.find(d => e.discovered[`${e.localPos.x + { N: 0, E: 1, S: 0, W: -1 }[d]},${e.localPos.y + { N: -1, E: 0, S: 1, W: 0 }[d]}`] === 'wall');
            if (d) R.useAbility(s, 'P', e.id, { dir: d });
          }
        } else if (!e.blocked && r < 0.85) R.explore(s, 'P', e.id, DIR_KEYS[Math.floor(Math.random() * 4)]);
        else R.endExplorerTurn(s, 'P', e.id);
      } catch { /* illegal random choice; ignore */ }
      if (s.stage !== 'explorerTurns') break;
      const snap = snapshotFor(s, 'P');
      const know = buildKnowledge(snap);
      const sol = solve(know);
      const truth = know.ids.map(id => s.starts[id]);
      assert.ok(sol.combos.some(c => c.every((v, i) => v === truth[i])), `true placement missing (game ${g}, step ${step})`);
    }
  }
});

test('team board flags clashes and open squares on the outer ring', () => {
  const know = {
    ids: ['x1', 'x2'],
    cells: { x1: [{ lx: 0, ly: 0, v: 'open' }, { lx: 1, ly: 0, v: 'wall' }], x2: [{ lx: 0, ly: 0, v: 'open' }] },
    monks: [], guides: [], local: { x1: { x: 0, y: 0 }, x2: { x: 0, y: 0 } },
  };
  assert.ok(boardConflicts(know, { x1: { x: 2, y: 2 }, x2: { x: 4, y: 4 } }).ok);
  const clash = boardConflicts(know, { x1: { x: 2, y: 2 }, x2: { x: 3, y: 2 } });
  assert.ok(clash.issues.some(i => i.type === 'clash'));
  const ring = boardConflicts(know, { x1: { x: 0, y: 3 } });
  assert.ok(ring.issues.some(i => i.type === 'openOnRing'));
});

test('a full-width corridor pins the row once the walls on both ends are found', () => {
  const s = randomGame(2, ['guide', 'monk']);
  // craft explorer x1 knowledge: 5 rooms in a row with walls on both ends -> x is fixed
  const e = s.explorers.x1;
  e.discovered = { '0,0': 'start', '1,0': 'open', '2,0': 'open', '3,0': 'open', '4,0': 'open', '-1,0': 'wall', '5,0': 'wall' };
  const snap = snapshotFor(s, 'P');
  const know = buildKnowledge(snap);
  const sol = solve(know);
  const xs = new Set(sol.combos.map(c => c[0] % 5));
  assert.deepEqual([...xs], [0]);
  const sum = summarize(know, sol);
  assert.ok(sum.count > 0);
  assert.ok(positionsFor(know, sol.combos[0]).length === 2);
});
