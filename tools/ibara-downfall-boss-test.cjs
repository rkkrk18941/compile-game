/* The Downfall characters as Bosses (ibara/bg/df-bosses.js): registry, party HP, each Boss's character mechanics
   (Slimes with Grow/Command/Split, Mode Shift and Sharp Hide, Heat, Chamber and Dead On), the battlefield forecast
   against the real hits, and complete fights for 1–4 players at Ascension 0 and 10.
   Run: NODE_PATH=<dir with jsdom> node tools/ibara-downfall-boss-test.cjs */
'use strict';
const assert = require('assert/strict');
const fs = require('fs'), path = require('path');
const sim = require('./ibara-bg-sim.cjs');
const STS = sim.load();
const DF = STS.DF;
let passed = 0;
async function test(name, fn) { if (process.env.V) console.log('..', name); try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
function same(a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); }

const DESIGNED = ['DfSlimeBoss2', 'DfSlimeBoss3', 'DfGuardian2', 'DfGuardian3', 'DfHexaghost2', 'DfHexaghost3', 'DfHermit1', 'DfHermit2', 'DfHermit3'];

async function fixture(S, enc, n, asc) {
  const run = S.Game.newRun({ players: ['R', 'G', 'B', 'W'].slice(0, n || 1).map((ch) => ({ ch })), asc: asc || 0, seed: 77 });
  const g = new S.Game(run, {});
  g.setupDecks(); g.setupAct(2);
  run.players.forEach((p) => { p.hp = p.maxHp = 500; });
  const cb = S.Combat.create(g, { kind: 'boss', enc: 'Boss:' + enc });
  run.combat = cb.s; g.combat = cb;
  await S.ENCOUNTERS['Boss:' + enc].build(cb);
  for (const e of cb.s.enemies.slice()) { const m = cb.mdef(e); if (m.start) await m.start(cb, e); }
  cb.s.phase = 'play'; cb.s.round = 1; cb.s.die = 3;
  cb.pcs().forEach((pc) => { pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; });
  return { run, g, cb, boss: cb.s.enemies.filter((e) => e.row === -1)[0] };
}
function hpOf(run) { return run.players.map((p) => p.hp); }
function lost(before, run) { return run.players.map((p, i) => before[i] - p.hp); }

(async () => {
  await test('every Downfall character has a Boss for Acts I–III; Act I of the Slime Boss, Guardian and Hexaghost is the base game Boss', async () => {
    for (const ch of ['S', 'U', 'H', 'M']) {
      assert.ok(DF.bossReady(ch), ch);
      for (const a of [1, 2, 3]) {
        const id = DF.bossOf(ch, a);
        assert.ok(STS.ENCOUNTERS['Boss:' + id], 'encounter ' + id);
        assert.ok(DF.BOSSES[ch][a].source, 'source recorded');
      }
    }
    same([DF.bossOf('S', 1), DF.bossOf('U', 1), DF.bossOf('H', 1)], ['SlimeBoss', 'Guardian', 'Hexaghost']);
    ['S', 'U', 'H'].forEach((ch) => assert.match(DF.BOSSES[ch][1].source, /official/));
    DESIGNED.forEach((id) => { assert.ok(STS.MONSTERS[id] && STS.MONSTERS[id].boss, id); assert.equal(DF.bossCharOf(id) != null, true); });
    assert.equal(DF.bossCharOf('DfHermit2'), 'M');
  });

  await test('party HP: printed-style tables for 1–4 players, Ascension 10 versions are higher', async () => {
    for (const id of DESIGNED) {
      const t = STS.PARTY_HP[id];
      for (let n = 1; n <= 4; n++) {
        const f = await fixture(STS, id, n, 0), f10 = await fixture(STS, id, n, 10);
        assert.equal(f.boss.hp, t[0][n - 1], id + ' ' + n);
        assert.equal(f10.boss.hp, t[10][n - 1], id + ' A10 ' + n);
        assert.ok(f10.boss.hp > f.boss.hp);
        assert.equal(t[0][n - 1], t[0][0] * n, 'HP per player × players');
      }
    }
  });

  await test('Slime Boss II: a Bruiser Slime in every row; Grow strengthens every Slime; Command makes the Slimes act again; Split', async () => {
    for (let n = 1; n <= 4; n++) {
      const { run, cb, boss } = await fixture(STS, 'DfSlimeBoss2', n);
      const br = cb.alive().filter((e) => e.id === 'DfBruiserSlime');
      same(br.map((e) => e.row).sort(), Array.from({ length: n }, (_, i) => i), 'one per row');
      br.forEach((e) => assert.equal(e.hp, 8));
      // Goop Spray + Grow
      const slimed = cb.pcs().map((pc) => pc.disc.length);
      boss.cube = 0; await cb.enemyAct(boss);
      cb.alive().forEach((e) => assert.equal(e.str, 1, 'Grow: ' + e.id));
      cb.pcs().forEach((pc, i) => assert.equal(pc.disc.length - slimed[i], 3, '3 Slimed'));
      // Command: boss hit 3 (+1 Strength), then every Bruiser acts once more (2 + 1).
      boss.cube = 1; const before = hpOf(run);
      cb.pcs().forEach((pc) => { pc.blk = 0; });
      await cb.enemyAct(boss);
      same(lost(before, run), Array(n).fill(4 + 3), 'boss hit 4, Bruiser in the row hits 3');
      // Split: two Slimes per row at the start of the next round; the fight is not over before that.
      await cb.killEnemy(boss, {});
      br.forEach((e) => { e.dead = true; });
      assert.equal(cb.checkEnd(), false, 'Split pending keeps the fight going');
      cb.s.round = 1; cb.s.phase = 'round';
      await cb.startRound();
      const ids = cb.alive().map((e) => e.id).sort();
      same(ids, Array(n).fill('AcidSlimeM').concat(Array(n).fill('LargeSlime')).sort());
    }
  });

  await test('Slime Boss III: Bruiser (HP10) and Acid Slime per row, Secrete fills rows, Split with Strength', async () => {
    const { run, cb, boss } = await fixture(STS, 'DfSlimeBoss3', 3);
    assert.equal(cb.alive().filter((e) => e.id === 'DfBruiserSlime' && e.hp === 10).length, 3);
    assert.equal(cb.alive().filter((e) => e.id === 'AcidSlimeM').length, 3);
    cb.alive().filter((e) => e.id === 'AcidSlimeM' && e.row === 1).forEach((e) => { e.dead = true; });
    boss.cube = 1; await cb.enemyAct(boss);
    assert.equal(cb.rowEnemies(1).length, 2, 'row 1 refilled with a Spike Slime');
    assert.equal(cb.rowEnemies(0).length, 2, 'full rows unchanged');
    assert.equal(boss.blk, 12, 'Block 4 × players');
    await cb.killEnemy(boss, {});
    cb.alive().forEach((e) => { e.dead = true; });
    cb.s.phase = 'round'; await cb.startRound();
    const l = cb.alive();
    assert.equal(l.filter((e) => e.id === 'LargeSlime' && e.str === 1).length, 3);
    assert.equal(l.filter((e) => e.id === 'SpikeSlimeM' && e.str === 1).length, 3);
  });

  await test('Guardian II/III: Mode Shift attacks while Block remains, otherwise Defensive Mode; Sharp Hide; back to Attack Mode', async () => {
    for (const [id, shift, hide] of [['DfGuardian2', 9, 1], ['DfGuardian3', 11, 2]]) {
      let { run, cb, boss } = await fixture(STS, id, 2);
      boss.mode = 'attack'; boss.cube = 2; boss.x.startBlk = 5; boss.blk = 0;
      let before = hpOf(run);
      await cb.enemyAct(boss);
      same(lost(before, run), [shift, shift], id + ' Mode Shift hit');
      ({ run, cb, boss } = await fixture(STS, id, 2));
      boss.mode = 'attack'; boss.cube = 2; boss.x.startBlk = 0;
      before = hpOf(run);
      await cb.enemyAct(boss); cb.advance(boss);
      same(lost(before, run), [0, 0], 'no Block: no attack');
      assert.equal(boss.mode, 'defense');
      // Sharp Hide: playing an Attack hurts.
      const pc = cb.pc(0);
      pc.hand.push({ u: 9001, id: 'StrikeR', up: false });
      before = hpOf(run);
      await cb.playFromHand(pc, { u: 9001, target: boss.u });
      assert.equal(before[0] - run.players[0].hp, hide, 'Sharp Hide ' + hide);
      boss.cube = 1; await cb.enemyAct(boss); cb.advance(boss);
      assert.equal(boss.mode, 'attack');
      assert.equal(boss.cube, 0);
    }
  });

  await test('Hexaghost II/III: Heat starts at 2/3, Ghostflame deals Heat twice, Heat stays within 1–6', async () => {
    for (const [id, start] of [['DfHexaghost2', 2], ['DfHexaghost3', 3]]) {
      const { run, cb, boss } = await fixture(STS, id, 1);
      assert.equal(boss.x.heat, start);
      boss.x.heat = 5; boss.cube = 1;
      const before = hpOf(run);
      await cb.enemyAct(boss);
      same(lost(before, run), [10], 'Heat 5 × 2');
      boss.x.heat = 6; boss.cube = id === 'DfHexaghost2' ? 2 : 3; await cb.enemyAct(boss);
      assert.equal(boss.x.heat, 6, 'Advance at 6 stays 6');
      boss.x.heat = 1; boss.cube = id === 'DfHexaghost2' ? 4 : 5; await cb.enemyAct(boss);
      assert.equal(boss.x.heat, 1, 'Retract at 1 stays 1');
    }
  });

  await test('Hermit I/II/III: the Chamber holds up to 2 rounds; Dead On spends one; Fan the Hammer fires them all', async () => {
    let { run, cb, boss } = await fixture(STS, 'DfHermit1', 1);
    assert.equal(boss.x.ammo, 1);
    boss.cube = 3; let before = hpOf(run);
    await cb.enemyAct(boss);
    same(lost(before, run), [7], 'loaded Headshot');
    assert.equal(boss.x.ammo, 0);
    before = hpOf(run); await cb.enemyAct(boss);
    same(lost(before, run), [3], 'empty Headshot');
    boss.cube = 0; await cb.enemyAct(boss); await cb.enemyAct(boss); await cb.enemyAct(boss);
    assert.equal(boss.x.ammo, 2, 'at most 2 rounds');
    ({ run, cb, boss } = await fixture(STS, 'DfHermit2', 2));
    assert.equal(boss.x.ammo, 2);
    boss.cube = 1; before = hpOf(run);
    await cb.enemyAct(boss);
    same(lost(before, run), [6, 6], '2 damage × (1 + 2 rounds)');
    assert.equal(boss.x.ammo, 0);
    ({ run, cb, boss } = await fixture(STS, 'DfHermit3', 1));
    boss.cube = 4; before = hpOf(run); await cb.enemyAct(boss);
    same(lost(before, run), [12]);
  });

  await test('battlefield forecast equals the real hits for every action of every designed Boss', async () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('', { runScripts: 'outside-only' }), w = dom.window;
    const files = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'df-data', 'df-mech', 'df-mech-guardian', 'df-mech-hexaghost', 'df-mech-hermit',
      'df-shard', 'df-cards-slime', 'df-cards-hermit', 'df-items', 'df-run', 'df-bosses', 'help', 'ui-parts', 'context-help', 'df-view'];
    for (const f of files) w.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', f + '.js'), 'utf8'));
    const S = w.STS, V = S.View;
    let checks = 0;
    for (const id of DESIGNED) {
      const m = S.MONSTERS[id];
      assert.ok(V.PASSIVE[id], 'passive text ' + id);
      const modes = m.modes || [null];
      for (const mode of modes) {
        const probe = await fixture(S, id, 2);
        if (mode) probe.boss.mode = mode;
        const len = m.track ? m.track(probe.cb, probe.boss).length : 3;
        for (let cube = 0; cube < len; cube++) {
          for (const blk of m.modes ? [0, 4] : [0]) {
            const { run, cb, boss } = await fixture(S, id, 2);
            if (mode) boss.mode = mode;
            boss.cube = cube; boss.blk = blk; boss.x.startBlk = blk;
            const a = cb.currentAction(boss);
            if (!a) continue;
            const data = V.intentData(cb, boss, a);
            assert.ok(V.actionText(boss, a).length && V.intentHTML(cb, boss, a, run, 0).length);
            (a.fx || []).forEach((fx) => { if (fx[0] === 'fn') assert.ok(V.FN[fx[1]], 'label for ' + fx[1]); });
            const expected = []; data.attacks.forEach((x) => { for (let i = 0; i < x.times; i++) expected.push([x.player, x.damage]); });
            const actual = []; const emit = cb.emit.bind(cb); cb.emit = (ev) => { if (ev.t === 'ehit' && ev.u === boss.u) actual.push([ev.i, ev.n]); return emit(ev); };
            await cb.enemyAct(boss);
            same(actual.sort(), expected.sort(), id + ' ' + (mode || '') + ' cube ' + cube + ' blk ' + blk);
            checks++;
          }
        }
      }
      assert.ok(V.enemyReference(id, 0).length >= 3, 'reference table ' + id);
      const f = await fixture(S, id, 1);
      assert.ok(V.behaviour(f.cb, f.boss).length >= (m.track ? 3 : 1), 'behaviour rows ' + id);
      if (f.boss.x.heat != null || f.boss.x.ammo != null) assert.match(V.dfFoeToks(f.boss, true), /ヒート|装填/);
    }
    assert.ok(checks >= 30, String(checks));
  });

  await test('complete fights against every Downfall Boss for 1–4 players at Ascension 0 and 10', async () => {
    const ids = DESIGNED.concat(['SlimeBoss', 'Guardian', 'Hexaghost']);
    for (const id of ids) for (let n = 1; n <= 4; n++) for (const asc of [0, 10]) {
      const run = STS.Game.newRun({ players: ['S', 'R', 'G', 'B', 'W'].slice(0, n).map((ch) => ({ ch })), asc, seed: 11 * n + asc });
      run.players.forEach((p) => { p.hp = p.maxHp = 400; });
      const g = new STS.Game(run, null);
      g.setupDecks(); g.setupAct(id === 'DfHermit1' || /^(SlimeBoss|Guardian|Hexaghost)$/.test(id) ? 1 : /3$/.test(id) ? 3 : 2);
      const rnd = sim.makeRng(n * 97 + asc), stats = { types: {} };
      const update = sim.makeDriver(STS, g, rnd, stats, { strict: true });
      g.io = { ask: (pi, q) => sim.randomAnswer(STS, g, pi, q, rnd, stats), emit: () => {}, update, checkpoint: () => {} };
      const result = await g.fight({ kind: 'boss', boss: id });
      if (stats.fatal) throw stats.fatal;
      assert.ok(result === 'victory' || result === 'defeat', id + ' ' + n + ' ' + asc + ' ' + result);
      assert.ok(run.lastCombat.rounds < 150, id + ' rounds ' + run.lastCombat.rounds);
    }
  });

  console.log('ok: ' + passed + ' Downfall Boss tests');
})().catch((e) => { console.error(e); process.exit(1); });
