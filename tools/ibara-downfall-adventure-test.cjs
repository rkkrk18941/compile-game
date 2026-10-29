/* The Downfall adventure's run rules with stand-in bosses: candidates fixed at the start (every character not in
   the party), one Boss drawn per act, two different ones in Act III at Ascension 13, draws saved and resumed,
   old saves stay normal adventures. Run: node tools/ibara-downfall-adventure-test.cjs */
'use strict';
const assert = require('assert/strict');
const sim = require('./ibara-bg-sim.cjs');
const STS = sim.load();
const D = STS.DATA, DF = STS.DF;
let passed = 0;
async function test(name, fn) { if (process.env.V) console.log('..', name); try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
function same(a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); }

// Stand-ins: the missing characters (starter cards of the base game), base bosses for every character and act,
// a no-op Heart's Boon and the Heart as the final boss. Only for this test process.
['U', 'H', 'M'].forEach((ch) => { if (!D.CHARS[ch]) DF.addChar(ch, { deck: ['StrikeR', 'StrikeR', 'StrikeR', 'DefendR', 'DefendR', 'Bash'] }); });
const stand = { 1: ['SlimeBoss', 'Guardian', 'Hexaghost'], 2: ['Automaton', 'Collector', 'Champ'], 3: ['AwakenedOne', 'TimeEater', 'DonuDeca'] };
D.CHAR_ORDER.forEach((ch, i) => { for (const a of [1, 2, 3]) DF.addBoss(ch, a, stand[a][i % 3], { source: 'test' }); });
let boons = 0;
DF.PARTS.heartsBoon = async (g) => { boons++; g.run.players.forEach((p) => { p.flags.boon = true; }); };
DF.PARTS.neow = 'Heart';
assert.ok(DF.adventureReady(), DF.adventureMissing().join(','));

(async () => {
  await test('candidates: every character except the party, fixed when the run starts', async () => {
    const run = STS.Game.newRun({ players: [{ ch: 'S' }, { ch: 'R' }], asc: 0, seed: 3, adv: 'downfall' });
    assert.equal(run.adv, 'downfall');
    same(run.df.party, ['S', 'R']);
    same(run.df.pool, D.CHAR_ORDER.filter((c) => c !== 'S' && c !== 'R'));
    const n = STS.Game.newRun({ players: [{ ch: 'S' }], asc: 0, seed: 3 });
    assert.equal(DF.adventureOf(n), 'normal'); assert.ok(!n.df);
    assert.equal(DF.adventureOf({ act: 2, players: [] }), 'normal', 'old saves are normal adventures');
  });
  await test('one Boss per act, never a party character, two different Bosses in Act III at Ascension 13', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const party = D.CHAR_ORDER.slice(seed % 5, seed % 5 + 1 + (seed % 4));
      const run = STS.Game.newRun({ players: party.map((ch) => ({ ch })), asc: 13, seed, adv: 'downfall' });
      const g = new STS.Game(run, null);
      g.setupDecks();
      for (const a of [1, 2, 3]) g.setupAct(a);
      const drawn = [].concat(run.df.bosses[1], run.df.bosses[2], run.df.bosses[3]);
      assert.equal(drawn.length, 4, 'A13: 1 + 1 + 2 bosses (' + party.join('') + ')');
      assert.equal(new Set(drawn).size, 4, 'all different');
      assert.ok(drawn.every((ch) => party.indexOf(ch) < 0));
      assert.ok(run.boss2 && run.boss2 !== run.boss || DF.bossOf(run.df.bosses[3][0], 3) === DF.bossOf(run.df.bosses[3][1], 3));
      g.setupAct(4);
      assert.equal(run.boss, 'Heart');
    }
  });
  await test('draws are saved: a resumed run keeps them, setup never redraws', async () => {
    const run = STS.Game.newRun({ players: [{ ch: 'B' }], asc: 0, seed: 9, adv: 'downfall' });
    const g = new STS.Game(run, null);
    g.setupDecks(); g.setupAct(1);
    const first = run.df.bosses[1].slice();
    const snap = JSON.parse(JSON.stringify(run));
    const g2 = new STS.Game(snap, null);
    g2.setupAct(1);
    same(snap.df.bosses[1], first);
    assert.equal(snap.boss, DF.bossOf(first[0], 1));
  });
  await test('Heart\'s Boon replaces Neow\'s Blessing only in the Downfall adventure', async () => {
    const before = boons;
    await sim.playRandom(STS, { players: [{ ch: 'S' }], asc: 0, seed: 4, adv: 'downfall' }, { maxAsks: 4000, onAsk: (g, pi, q) => { if (q.type === 'map') throw new Error('stop'); } }).catch((e) => { if (e.message !== 'stop') throw e; });
    assert.equal(boons, before + 1);
    await sim.playRandom(STS, { players: [{ ch: 'S' }], asc: 0, seed: 4 }, { maxAsks: 4000, onAsk: (g, pi, q) => { if (q.type === 'map') throw new Error('stop'); } }).catch((e) => { if (e.message !== 'stop') throw e; });
    assert.equal(boons, before + 1);
  });
  await test('random Downfall adventures (stand-in content) for 1–4 players fight only candidate Bosses', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const n = 1 + (seed % 4);
      const party = D.CHAR_ORDER.slice(seed % 4, seed % 4 + n);
      const fought = [];
      const r = await sim.playRandom(STS, { players: party.map((ch) => ({ ch })), asc: (seed * 3) % 14, seed, act4: true, adv: 'downfall' }, {
        strict: true,
        mutate: (run) => run.players.forEach((p) => { p.hp = p.maxHp = 900; }),
        // Boss rooms only (Mind Bloom's event fight against an Act I boss is the base game's event).
        onEmit: (g, ev) => { if (ev.t === 'combatStart' && g.run.combat && g.run.combat.kind === 'boss' && g.run.room && g.run.room.t === 'B') fought.push(g.run.act + ':' + g.run.combat.enc); },
        onAsk: (g, pi, q) => {
          if (q.type === 'option' && q.options.some((o) => o.id === 'key')) return 'key';
          if (q.type === 'option' && q.options.some((o) => o.id === 'next')) return 'next';
        }
      });
      assert.ok(['victory', 'defeat', 'stopped'].includes(r.result));
      const df = r.run.df;
      fought.forEach((f) => {
        const [act, enc] = f.split(':Boss:');
        if (+act === 4) { assert.equal(enc, 'Heart'); return; }
        const ids = (df.bosses[+act] || []).map((ch) => DF.bossOf(ch, +act));
        assert.ok(ids.indexOf(enc) >= 0, 'act ' + act + ' boss ' + enc + ' drawn from ' + ids.join(','));
      });
    }
  });
  console.log('ok: ' + passed + ' Downfall adventure tests (stand-in bosses)');
})().catch((e) => { console.error(e); process.exit(1); });
