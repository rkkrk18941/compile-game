import assert from 'node:assert/strict';
await import('../assets/arena-core.js');
const R = globalThis.COMPILE_ARENA_RULES;
for (let n = 3; n <= 16; n++) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Player ' + i }));
  for (const mode of ['league', 'knockout']) {
    const t = R.create(players, mode);
    if (t.mode === 'league') {
      assert.equal(t.matches.length, n * (n - 1) / 2);
      assert.equal(new Set(t.matches.map(m => [m.a, m.b].sort().join('/'))).size, t.matches.length);
      for (const r of new Set(t.matches.map(m => m.round))) {
        const ids = t.matches.filter(m => m.round === r).flatMap(m => [m.a, m.b]); assert.equal(new Set(ids).size, ids.length, 'one player cannot play two simultaneous matches');
      }
    }
    let played = 0;
    while (t.status === 'running') {
      const ready = R.ready(t); assert(ready.length);
      for (const m of ready) {
        assert(R.start(t, m.id)); assert(!R.start(t, m.id));
        assert(!R.result(t, m.id, 'outsider', [3, 0]));
        assert(!R.result(t, m.id, m.a, [2, 1]));
        assert(R.result(t, m.id, m.a, [3, 1], 20)); assert(!R.result(t, m.id, m.a, [3, 1], 20)); played++;
      }
    }
    assert.equal(played, t.mode === 'league' ? n * (n - 1) / 2 : n - 1);
    const rows = R.standings(t); assert.equal(rows.reduce((s, p) => s + p.wins, 0), played); assert.equal(rows.reduce((s, p) => s + p.losses, 0), played);
    assert.equal(rows.reduce((s, p) => s + p.scored, 0), rows.reduce((s, p) => s + p.conceded, 0));
    assert.equal(rows[0].rank, 1);
    if (t.mode === 'knockout') assert.equal(rows[0].id, t.champion);
  }
}
const tied = R.create(['a', 'b', 'c'].map(id => ({ id, name: id })));
while (tied.status === 'running') for (const m of R.ready(tied)) {
  const winner = m.a === 'a' && m.b === 'b' || m.b === 'a' && m.a === 'b' ? 'a' :
    m.a === 'b' && m.b === 'c' || m.b === 'b' && m.a === 'c' ? 'b' : 'c';
  assert(R.start(tied, m.id)); assert(R.result(tied, m.id, winner, m.a === winner ? [3, 1] : [1, 3]));
}
assert.deepEqual(R.standings(tied).map(p => p.rank), [1, 1, 1], 'equal circular wins produce joint winners');
const game = { turn: 1, current: 0, winner: null, control: null, phase: 'action', log: [{ msg: 'secret' }],
  players: [0, 1].map(p => ({ name: 'P' + p, protocols: [{ name: 'FIRE', compiled: false }], hand: [{ id: 'SECRET-HAND' }], deck: [{ id: 'SECRET-DECK' }], discard: [], lines: [[{ id: 'SECRET-HIDDEN', protocol: 'DEATH', value: 6, faceDown: true }], [], []] })) };
const publicGame = R.publicGame(game, [[2, 0, 0], [2, 0, 0]]);
for (const secret of ['SECRET-HAND', 'SECRET-DECK', 'SECRET-HIDDEN', 'DEATH', 'log']) assert(!JSON.stringify(publicGame).includes(secret));
assert.deepEqual(publicGame.players[0].lines[0][0], { faceDown: true });
console.log('Arena: 3–16 players, both formats, byes, concurrent scheduling, scoring, ties and spectator privacy passed');
