// 大会ルール（assets/cup-core.js）の回帰テスト: node tools/cup-regression.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Map, Set };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../assets/cup-core.js', import.meta.url), 'utf8'), ctx);
const C = ctx.COMPILE_CUP_CORE;
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function makeCup(n, format) {
  const cup = C.newCup({ title: 'テスト杯', format, transport: 'local' });
  for (let i = 0; i < n; i++) assert(C.addPlayer(cup, { id: 'p' + i, name: 'P' + i, emoji: '🦊' }));
  return cup;
}
function playAll(cup) {
  let guard = 0;
  while (cup.status === 'running' && guard++ < 500) {
    const ready = cup.matches.filter(m => C.canStart(cup, m.id));
    assert(ready.length, 'a running cup always has a startable match');
    // start several at once (concurrency) when players are free
    const started = [];
    for (const m of ready) if (C.start(cup, m.id)) started.push(m);
    for (const m of started) {
      const others = [...cup.players.map(p => p.id)].filter(id => id !== m.a && id !== m.b);
      if (others[0]) assert(C.setPick(cup, m.id, others[0], rand() < .5 ? 'a' : 'b', 1));
      assert(!C.setPick(cup, m.id, m.a, 'a', 1), 'players cannot predict their own match');
      const aWins = rand() < .5, loserScore = Math.floor(rand() * 3);
      assert(!C.result(cup, m.id, m.a, [2, 2], 10), 'invalid score rejected');
      assert(C.result(cup, m.id, aWins ? m.a : m.b, aWins ? [3, loserScore] : [loserScore, 3], 5 + Math.floor(rand() * 20)));
    }
  }
  return cup;
}
for (const format of ['knockout', 'league']) {
  for (let n = 3; n <= 16; n++) {
    const cup = makeCup(n, format);
    assert(C.draw(cup, rand));
    if (format === 'knockout') {
      const size = 2 ** Math.ceil(Math.log2(n));
      assert.equal(cup.matches.filter(m => m.round === 1).length, size / 2);
      assert(!cup.matches.some(m => m.round === 1 && !m.a && !m.b), 'no empty-vs-empty match');
      assert.equal(cup.matches.filter(m => m.status === 'bye').length, size - n, 'byes = size - players');
      assert.equal(!!cup.matches.find(m => m.bronze), n >= 4, 'bronze match from 4 players');
    } else assert.equal(cup.matches.length, n * (n - 1) / 2, 'league: everyone meets once');
    playAll(cup);
    assert.equal(cup.status, 'done', `${format} ${n}: finishes`);
    assert(cup.champion, 'has a champion');
    const st = C.standings(cup);
    assert.equal(st[0].id, cup.champion);
    assert.equal(st.length, n);
    if (format === 'knockout') {
      const last = cup.matches.find(m => m.round === cup.rounds && !m.bronze);
      assert.equal(st.find(r => r.rank === 1).id, last.winner);
      assert.equal(st.find(r => r.rank === 2).id, last.winner === last.a ? last.b : last.a);
      if (n >= 4) { const b = cup.matches.find(m => m.bronze); assert.equal(st.find(r => r.rank === 3).id, b.winner); }
    } else {
      for (let i = 1; i < st.length; i++) assert(st[i - 1].points >= st[i].points, 'league ordered by points');
    }
    const aw = C.awards(cup);
    assert(aw.some(a => a.title === '優勝'));
    assert(aw.every(a => a.name && a.icon));
  }
}
// cannot double-book a player; reset returns to ready; walkover works
{
  const cup = makeCup(4, 'league'); C.draw(cup, rand);
  const [m1] = cup.matches.filter(m => C.canStart(cup, m.id));
  C.start(cup, m1.id);
  const clash = cup.matches.find(m => m !== m1 && (m.a === m1.a || m.b === m1.a));
  assert(!C.canStart(cup, clash.id), 'busy player cannot start a second match');
  assert(C.reset(cup, m1.id)); assert.equal(m1.status, 'ready');
  assert(C.result(cup, m1.id, m1.a, null, 0, { walkover: true })); assert(m1.walkover);
}
// names stay unique; entry closes after draw
{
  const cup = C.newCup({ title: 'x' });
  C.addPlayer(cup, { id: 'a', name: 'たけし' }); const b = C.addPlayer(cup, { id: 'b', name: 'たけし' });
  assert.equal(b.name, 'たけし2');
  C.addPlayer(cup, { id: 'c', name: 'ゆうき' }); C.draw(cup, rand);
  assert.equal(C.addPlayer(cup, { id: 'd', name: 'late' }), null, 'no entries after the draw');
}
// again(): same members, back to entry
{
  const cup = playAll((() => { const c = makeCup(5, 'knockout'); C.draw(c, rand); return c; })());
  const next = C.again(cup);
  assert.equal(next.status, 'entry'); assert.equal(next.players.length, 5); assert(next.rev > cup.rev);
}
console.log('Cup rules: knockout & league for 3–16 players, byes, bronze, predictions, upsets, standings, awards, walkover and rematch passed');
