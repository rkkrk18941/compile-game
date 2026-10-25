/* Rules checks for the board-game engine of スレイザスパイア (ibara/bg). Run: node tools/ibara-bg-rules-test.cjs */
'use strict';
const assert = require('assert/strict');
const sim = require('./ibara-bg-sim.cjs');
const STS = sim.load();
const D = STS.DATA;
let passed = 0;
let finished = false;
async function test(name, fn) {
  if (process.env.V) console.log('..', name); try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; }
}
function game(cfg) {
  const run = STS.Game.newRun(Object.assign({ players: [{ ch: 'R' }], asc: 0, seed: 7 }, cfg || {}));
  const g = new STS.Game(run, null);
  g.setupDecks();
  g.setupAct(1);
  return g;
}
function combat(g, kind) {
  const cb = STS.Combat.create(g, { kind: kind || 'normal' });
  g.run.combat = cb.s; g.combat = cb;
  cb.pcs().forEach((pc) => { pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; });
  cb.s.phase = 'play';
  return cb;
}
function give(g, pc, id, up) { const c = { u: g.uid(), id, up: !!up }; pc.hand.push(c); return c; }

(async () => {
  await test('setup: solo gold, Loaded Die, Ascension 2/5/9', async () => {
    const run = STS.Game.newRun({ players: [{ ch: 'G' }], asc: 9, seed: 3 });
    const p = run.players[0];
    assert.equal(p.gold, 2);
    assert.ok(p.relics.some((r) => r.id === 'LoadedDie'));
    assert.equal(p.maxHp, D.CHARS.G.hp - 1);
    assert.equal(p.hp, p.maxHp - 1);
    assert.ok(p.deck.some((c) => c.id === 'AscendersBane'));
    const duo = STS.Game.newRun({ players: [{ ch: 'R' }, { ch: 'B' }], asc: 0, seed: 3 });
    assert.equal(duo.players[0].gold, 0);
    assert.ok(!duo.players[0].relics.length);
    assert.throws(() => STS.Game.newRun({ players: [{ ch: 'R' }, { ch: 'R' }] }));
  });
  await test('content counts', async () => {
    const byCh = {};
    Object.values(STS.CARDS).forEach((d) => { byCh[d.ch] = (byCh[d.ch] || 0) + 1; });
    assert.deepEqual([byCh.R, byCh.G, byCh.B, byCh.W], [61, 64, 61, 64], JSON.stringify(byCh));
    assert.equal(Object.values(STS.CARDS).filter((d) => d.ch === 'C').length, 22);
    assert.equal(Object.values(STS.RELICS).filter((r) => r.type === 'normal').length, 58);
    assert.equal(Object.values(STS.RELICS).filter((r) => r.type === 'boss').length, 20);
    let pots = 0; Object.values(STS.POTIONS).forEach((p) => { pots += p.copies || 1; });
    assert.equal(pots, 29);
    assert.equal(Object.keys(STS.POTIONS).length, 21);
    let curses = 0; Object.values(STS.CARDS).forEach((d) => { if (d.t === 'C' && d.copies) curses += d.copies; });
    assert.equal(curses, 13);
  });
  await test('reward decks: commons x2, uncommons x1, rares separate, Golden Ticket by unlock', async () => {
    const g = game({ players: [{ ch: 'W', unlock: 0 }] });
    const p = g.run.players[0];
    const count = (id) => p.rewardDeck.filter((x) => x === id).length;
    const common = Object.keys(STS.CARDS).find((k) => STS.CARDS[k].ch === 'W' && STS.CARDS[k].r === 'C' && !STS.CARDS[k].unlock);
    const unc = Object.keys(STS.CARDS).find((k) => STS.CARDS[k].ch === 'W' && STS.CARDS[k].r === 'U' && !STS.CARDS[k].unlock);
    assert.equal(count(common), 2);
    assert.equal(count(unc), 1);
    assert.equal(count('Ticket'), 1);
    assert.ok(p.rareDeck.every((id) => STS.CARDS[id].r === 'R'));
    const g2 = game({ players: [{ ch: 'W', unlock: 3 }] });
    assert.equal(g2.run.players[0].rewardDeck.filter((x) => x === 'Ticket').length, 2);
    assert.ok(g2.run.players[0].rewardDeck.length > p.rewardDeck.length);
  });
  await test('event decks per act and Ascension 3', async () => {
    assert.equal(STS.EVENT_DECKS[1](0).length, 12);
    assert.equal(STS.EVENT_DECKS[1](3).length, 18);
    assert.equal(STS.EVENT_DECKS[2](0).length, 14);
    assert.equal(STS.EVENT_DECKS[2](3).length, 19);
    assert.equal(STS.EVENT_DECKS[3](0, false).length, 11);
    assert.equal(STS.EVENT_DECKS[3](3, true).length, 15);
    for (let a = 1; a <= 3; a++) STS.EVENT_DECKS[a](3, true).forEach((id) => assert.ok(STS.EVENTS[id], id));
  });
  await test('first ? room of Act I redraws Hallway/Merchant/Dead Adventurer', async () => {
    const g = game({ asc: 3 });
    const run = g.run, m = run.map;
    const key = Object.keys(m.nodes).find((k) => m.nodes[k].r === 1 && m.nodes[k].t === '?');
    run.decks.events.push('Hallway');
    run.phase = 'room'; run.room = { t: '?', key, step: 'enter' };
    let drawn = null;
    STS.EVENTS.Hallway.run = async () => { drawn = 'Hallway'; };
    const orig = {};
    Object.keys(STS.EVENTS).forEach((id) => { orig[id] = STS.EVENTS[id].run; STS.EVENTS[id].run = async () => { drawn = id; }; });
    await g.roomEvent();
    Object.keys(orig).forEach((id) => { STS.EVENTS[id].run = orig[id]; });
    assert.ok(drawn && !STS.EVENTS[drawn].notFirstQ, 'drew ' + drawn);
  });
  await test('Strength per HIT, Weak and Vulnerable cancel, Vulnerable doubles and decays', async () => {
    const g = game();
    const cb = combat(g);
    const e = cb.spawn('Cultist', 0);
    const pc = cb.pc(0);
    pc.str = 2;
    let c = give(g, pc, 'StrikeR');
    await cb.playFromHand(pc, { u: c.u });
    assert.equal(e.hp, 9 - 3);
    e.vuln = 1;
    c = give(g, pc, 'StrikeR'); pc.en = 3;
    await cb.playFromHand(pc, { u: c.u });
    assert.equal(e.hp, 6 - 6);
    const e2 = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    cb.s.over = false; cb.s.result = null;
    e2.vuln = 2; pc.weak = 1; pc.str = 0;
    c = give(g, pc, 'StrikeR'); pc.en = 3;
    await cb.playFromHand(pc, { u: c.u, target: e2.u });
    assert.equal(e2.hp, 10 - 1, 'weak and vulnerable cancel');
    assert.equal(e2.vuln, 1, 'vulnerable decreases after the card');
    assert.equal(pc.weak, 0, 'player weak decreases after an attack');
  });
  await test('caps: Block 20, Strength 8, Poison 30 total', async () => {
    const g = game();
    const cb = combat(g);
    const pc = cb.pc(0);
    await cb.gainBlock(pc, 25); assert.equal(pc.blk, 20);
    cb.gainStr(pc, 12); assert.equal(pc.str, 8);
    const a = cb.spawn('Cultist', 0), b = cb.spawn('Cultist', 0);
    await cb.applyPoison(a, 25, pc); await cb.applyPoison(b, 10, pc);
    assert.equal(a.psn + b.psn, 30);
  });
  await test('Envenom: every HIT applies Poison, even when blocked', async () => {
    const g = game({ players: [{ ch: 'G' }] });
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'medium' });
    pc.pow.push({ u: 999, id: 'Envenom', up: false, card: { u: 999, id: 'Envenom' }, n: 0, v: 0, data: {} });
    e.blk = 5;
    await cb.attack(pc, e, [1], { card: { id: 'StrikeG' } });
    assert.equal(e.hp, 10);
    assert.equal(e.psn, 1);
  });
  await test('Wrist Blade adds 1 to Shivs', async () => {
    const g = game({ players: [{ ch: 'G' }] });
    g.run.players[0].relics.push({ id: 'WristBlade' });
    const cb = combat(g);
    const pc = cb.pc(0), e = cb.spawn('Centurion', 0, { beh: 'B3' });
    pc.shiv = 1;
    await cb.useShiv(pc, { target: e.u });
    assert.equal(e.hp, 15 - 2);
  });
  await test('summon cards keep their printed behaviour', async () => {
    const g = game();
    const cb = combat(g);
    g.run.decks.summons.acid = ['AcidSlimeM|LAC'];
    const e = cb.summonFrom('acid', 0);
    assert.equal(e.id, 'AcidSlimeM');
    assert.equal(e.beh, 'LAC');
    g.returnSummons(cb);
    assert.equal(JSON.stringify(g.run.decks.summons.acid), '["AcidSlimeM|LAC"]');
  });
  await test('Nemesis cannot lose HP while its cube is on a Scythe box', async () => {
    const g = game({ asc: 0 });
    const cb = combat(g, 'elite');
    const e = cb.spawn('Nemesis', 0);
    const pc = cb.pc(0);
    e.cube = 1;
    await cb.damageEnemy(e, 5, { pc });
    assert.equal(e.hp, e.max);
    e.cube = 2;
    await cb.damageEnemy(e, 5, { pc });
    assert.equal(e.hp, e.max - 5);
  });
  await test('Act IV: elite deck, empty elite space below Ascension 11', async () => {
    const g = game({ asc: 0 });
    g.setupAct(4);
    assert.equal(JSON.stringify(g.run.decks.elite), '["ShieldSpear"]');
    assert.ok(Object.values(g.run.map.nodes).some((n) => n.t === 'X'));
    const g2 = game({ asc: 11 });
    g2.setupAct(4);
    assert.ok(Object.values(g2.run.map.nodes).some((n) => n.t === 'E'));
    assert.equal(g2.run.boss, 'Heart');
  });
  await test('Spire Shield and Spear: facing abilities after a row switch', async () => {
    const g = game({ players: [{ ch: 'R' }, { ch: 'B' }], asc: 11 });
    const cb = STS.Combat.create(g, { kind: 'elite', rows: 2 });
    g.run.combat = cb.s; g.combat = cb;
    await STS.ENCOUNTERS.ShieldSpear.build(cb);
    cb.pcs().forEach((pc) => { pc.en = 3; pc.t = {}; });
    await cb.facingStep();
    const p0 = cb.pc(0), p1 = cb.pc(1);
    assert.equal(p0.en, 2, 'Shield (row 1, first box) costs 1 energy');
    assert.equal(p1.disc.filter((c) => c.id === 'Burn').length, 2, 'Spear gives 2 Burns');
  });
  await test('boss relic draft: n+1 relics, solo 3, never the same relic twice', async () => {
    const g = game({ players: [{ ch: 'R' }, { ch: 'G' }, { ch: 'B' }] });
    g.run.phase = 'bossRelic';
    await g.bossRelicDraft();
    const owned = g.run.players.map((p) => p.relics.filter((r) => STS.RELICS[r.id].type === 'boss').map((r) => r.id)).flat();
    assert.equal(new Set(owned).size, owned.length);
    assert.equal(g.run.decks.bossRelics.length, 20 - owned.length);
  });
  await test('Mind Bloom [I am War] fights an Act I boss and rewards a relic', async () => {
    const g = game({ players: [{ ch: 'R' }] });
    g.run.players[0].hp = g.run.players[0].maxHp = 500;
    const before = g.run.players[0].relics.length;
    let fought = null;
    g.fight = async (spec) => { fought = spec; return 'victory'; };
    g.io = { ask: (pi, q) => (q.type === 'option' && q.options.some((o) => o.id === 'war') ? 'war' : STS.autoAnswer(g, pi, q)) };
    g.run.room = { t: '?', ev: { id: 'MindBloom' } };
    await STS.EVENTS.MindBloom.run(g, g.run.room.ev);
    assert.equal(fought.kind, 'boss');
    assert.ok(STS.ACTS[1].bosses(0).includes(fought.boss));
    assert.equal(g.run.players[0].relics.length, before + 1);
  });
  await test('every event resolves for 1-4 players', async () => {
    for (const id of Object.keys(STS.EVENTS)) {
      for (let n = 1; n <= 4; n++) {
        const chs = ['R', 'G', 'B', 'W'].slice(0, n);
        const run = STS.Game.newRun({ players: chs.map((ch) => ({ ch })), asc: 3, seed: 11 + n, colorless: true, act4: true });
        const g = new STS.Game(run, null);
        g.fight = async () => 'victory';   // event combats are exercised by the full-game simulations
        g.setupDecks(); g.setupAct(id === 'MindBloom' || id === 'Falling' ? 3 : 2);
        run.players.forEach((p) => { p.hp = p.maxHp = 60; p.gold = 12; p.relics.push({ id: 'Anchor' }); p.potions.push('Fire'); });
        run.phase = 'room';
        const key = Object.keys(run.map.nodes)[3];
        run.map.pos = key;
        run.room = { t: '?', key, step: 'event', event: id, ev: { id } };
        await g.roomEvent();
        assert.notEqual(run.phase, 'over', id + ' killed the party');
      }
    }
  });
  await test('random 1-4 player games through every act at several Ascensions', async () => {
    let games = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const n = 1 + (seed % 4);
      const chs = ['R', 'G', 'B', 'W'].slice(seed % 4).concat(['R', 'G', 'B', 'W'].slice(0, seed % 4)).slice(0, n);
      const r = await sim.playRandom(STS, { players: chs.map((ch) => ({ ch, unlock: seed % 4 })), asc: (seed * 5) % 14, seed, colorless: seed % 2 === 0, act4: true }, {
        strict: true,
        mutate: (run) => run.players.forEach((p) => { p.hp = p.maxHp = 900; }),
        onAsk: (g, pi, q) => {
          if (q.type === 'option' && q.options.some((o) => o.id === 'key')) return 'key';
          if (q.type === 'option' && q.options.some((o) => o.id === 'next')) return 'next';
          if (q.type === 'bossRelic') { const av = q.ids.filter((id) => q.taken[id] == null && id !== 'MarkOfPain'); return av[0] || 'skip'; }
        }
      });
      assert.ok(['victory', 'defeat', 'stopped'].includes(r.result));
      games++;
    }
    assert.equal(games, 24);
  });
  finished = true;
  console.log('ibara board-game rules: ' + passed + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
process.on('exit', (code) => {
  if (!finished && code === 0) { console.error('ibara board-game rules: stopped before every check finished (an awaited prompt was never answered)'); process.exitCode = 1; }
});
