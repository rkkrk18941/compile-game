/* Mechanics of the Guardian, Hexaghost and Hermit (rulebook v1.47 pp.4–7) with stand-in test cards, so the rules
   are fixed before the printed cards are added. Run: node tools/ibara-downfall-mech-test.cjs */
'use strict';
const assert = require('assert/strict');
const sim = require('./ibara-bg-sim.cjs');
const STS = sim.load();
const D = STS.DATA, DF = STS.DF;
let passed = 0;
async function test(name, fn) { if (process.env.V) console.log('..', name); try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }
function same(a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); }

/* Stand-in cards (not real Downfall cards; only for this test process). */
const C = STS.CARDS;
function card(id, o) { o.id = id; if (o.cu === undefined) o.cu = o.c; C[id] = o; return o; }
card('T_StrikeU', { ch: 'U', t: 'A', r: 'S', c: 1, name: 'T攻撃', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: (k) => k.atk([1]) });
card('T_DefendU', { ch: 'U', t: 'S', r: 'S', c: 1, name: 'T防御', tx: ['ブロック1。', 'ブロック2。'], play: (k) => k.blk(1) });
card('T_Vigor', { ch: 'U', t: 'S', r: 'C', c: 0, name: 'T活力', grants: ['vigor'], tx: ['活力2。', '活力3。'], play: (k) => k.vigor(2) });
DF.variable('T_Var', { ch: 'U', r: 'C', c: 1, cu: 1, name: 'T可変', tg: 'E', refMode: true, grants: ['mode'], tx: ['1ダメージ。ブロック1。', '1ダメージ。ブロック1。'], play: async (k) => { await k.atk([1]); await k.blk(1); } });
card('T_StrikeH', { ch: 'H', t: 'A', r: 'S', c: 1, name: 'T攻撃H', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: (k) => k.atk([1]) });
card('T_Advance', { ch: 'H', t: 'S', r: 'C', c: 0, name: 'T前進', grants: ['heat'], tx: ['前進。ヒート3以上なら1枚引く。', '前進2。'], play: async (k) => { await k.advance(1); if (k.heat() >= 3) await k.draw(1); } });
card('T_Burn', { ch: 'H', t: 'S', r: 'C', c: 0, name: 'Tソウル', grants: ['soulburn'], tx: ['ソウルバーン2。', 'ソウルバーン3。'], play: (k) => k.soulburn(2) });
card('T_StrikeM', { ch: 'M', t: 'A', r: 'S', c: 1, name: 'T攻撃M', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: (k) => k.atk([1]) });
card('T_Load', { ch: 'M', t: 'S', r: 'S', c: 0, name: 'T装填', grants: ['load'], tx: ['1枚装填。', '2枚まで装填。'], play: (k) => k.load(1) });
card('T_DeadOn', { ch: 'M', t: 'A', r: 'C', c: 1, name: 'Tデッド', tg: 'E', tx: ['2ダメージ。デッド-オン：+2ダメージ。', '3ダメージ。デッド-オン：+2ダメージ。'], play: (k) => k.atk([2 + (k.deadOn ? 2 : 0)]) });
card('T_Rapid', { ch: 'M', t: 'A', r: 'C', c: 1, name: 'T連射', tg: 'E', rapid: 1, tx: ['1ダメージ。連射。', '1ダメージ。連射。'], play: (k) => k.atk([1]) });
card('T_Malice', { ch: 'M', t: 'C', r: 'C', c: null, unplayable: true, hermitCurse: true, name: 'T悪意', tx: ['使用不可。装填した時：列に2ダメージ。', '使用不可。装填した時：列に3ダメージ。'], onLoad: (cb, pc, c) => cb.damageAnyRow(pc, c.up ? 3 : 2, 'T悪意：列を選択') });
DF.addChar('U', { deck: ['T_StrikeU', 'T_StrikeU', 'T_DefendU', 'T_DefendU', 'T_Var'] });
DF.addChar('H', { deck: ['T_StrikeH', 'T_StrikeH', 'T_StrikeH', 'T_Advance', 'T_Burn'] });
DF.addChar('M', { deck: ['T_StrikeM', 'T_StrikeM', 'T_StrikeM', 'T_Load', 'T_DeadOn'] });

function game(chs, answers) {
  const run = STS.Game.newRun({ players: chs.map((ch) => ({ ch })), asc: 0, seed: 5 });
  const g = new STS.Game(run, null);
  g.io = { ask: (pi, q) => { const f = answers && answers.length ? answers.shift() : null; return f ? f(q, pi) : STS.autoAnswer(g, pi, q); } };
  g.setupDecks(); g.setupAct(1);
  return g;
}
async function combat(g) {
  const cb = STS.Combat.create(g, { kind: 'normal' });
  g.run.combat = cb.s; g.combat = cb;
  await cb.setup();
  cb.s.round = 1;
  cb.pcs().forEach((pc) => { pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; });
  cb.s.phase = 'play';
  return cb;
}
function give(g, pc, id, up) { const c = { u: g.uid(), id, up: !!up }; pc.hand.push(c); return c; }
const play = (cb, pc, c, x) => cb.playFromHand(pc, Object.assign({ u: c.u }, x || {}));

(async () => {
  await test('Guardian: starts in Attack Mode; "???" cards are Attacks, then Skills after a Mode Shift', async () => {
    const g = game(['U']);
    const cb = await combat(g);
    const pc = cb.pc(0);
    assert.equal(pc.mode, 'attack');
    const v = pc.draw.find((c) => DF.canon(c.id) === 'T_Var');
    assert.equal(STS.CARDS[v.id].t, 'A');
    cb.modeShift(pc);
    assert.equal(pc.mode, 'defense');
    assert.equal(STS.CARDS[v.id].t, 'S');
    assert.equal(STS.CARDS.T_Var.t, 'V', 'outside combat: neither Attack nor Skill');
    assert.ok(!g.run.players[0].rewardDeck.some((id) => id.indexOf('~') >= 0), 'twins never in reward decks');
  });
  await test('Guardian: start of turn may Mode Shift (after drawing)', async () => {
    const g = game(['U'], [(q) => (q.modeShift ? 'shift' : undefined)]);
    const cb = await combat(g);
    const pc = cb.pc(0);
    await cb.startOfTurn(pc);
    assert.equal(pc.mode, 'defense');
  });
  await test('Vigor: max 4 with the Spent zone; Attack Mode +1 per HIT, Defense Mode +1 per Block icon, spent lost at end of turn', async () => {
    const g = game(['U']);
    const cb = await combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    await play(cb, pc, give(g, pc, 'T_Vigor'));
    await play(cb, pc, give(g, pc, 'T_Vigor'));
    assert.equal(pc.vigor, 4);
    await cb.exec(0, { type: 'vigor' });
    assert.equal(pc.vigor, 3); assert.equal(pc.vigorSpent, 1);
    await cb.gainVigor(pc, 5);
    assert.equal(pc.vigor + pc.vigorSpent, 4, 'cap includes spent tokens');
    const hp = e.hp;
    await play(cb, pc, give(g, pc, 'T_StrikeU'), { target: e.u });
    assert.equal(e.hp, hp - 2, 'Attack Mode: +1 damage per spent Vigor');
    const b0 = pc.blk;
    await play(cb, pc, give(g, pc, 'T_DefendU'));
    assert.equal(pc.blk, b0 + 1, 'no Block bonus in Attack Mode');
    cb.modeShift(pc);
    const b1 = pc.blk;
    await play(cb, pc, give(g, pc, 'T_DefendU'));
    assert.equal(pc.blk, b1 + 2, 'Defense Mode: +1 Block per spent Vigor');
    await cb.endTurn();
    assert.equal(pc.vigorSpent, 0); assert.equal(pc.vigor, 3, 'unspent Vigor stays');
  });
  await test('Hexaghost: Heat 1..6, Advance at 6 still counts, Soulburn = Heat damage without Strength/Weak/Vulnerable', async () => {
    const g = game(['H']);
    const cb = await combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    assert.equal(pc.heat, 1); assert.equal(pc.soul, 1);
    let advances = 0;
    DF.on('advance', () => { advances++; });
    await cb.heatStep(pc, 1, 7);
    assert.equal(pc.heat, 6); assert.equal(advances, 7);
    await cb.heatStep(pc, -1, 9);
    assert.equal(pc.heat, 1);
    await play(cb, pc, give(g, pc, 'T_Advance'));
    await play(cb, pc, give(g, pc, 'T_Advance'));
    assert.equal(pc.heat, 3);
    pc.str = 4; pc.weak = 1; e.vuln = 2;
    const hp = e.hp;
    await cb.exec(0, { type: 'soulburn', target: e.u });
    assert.equal(e.hp, hp - 3);
    assert.equal(e.vuln, 2); assert.equal(pc.soul, 0);
    pc.soul = 6;
    const hp2 = e.hp;
    await play(cb, pc, give(g, pc, 'T_Burn'));
    assert.equal(pc.soul, 6); assert.equal(e.hp, Math.max(0, hp2 - 6), 'over the cap: the damage now (twice)');
  });
  await test('Hermit: Load, the Chamber survives the end of turn, Dead On only from the Chamber, Rapid Fire with Attack Potion plays 4 times', async () => {
    const g = game(['M']);
    const cb = await combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    cb.spawn('JawWorm', 0, { lvl: 'hard' });
    same(pc.chamber, [null, null]);
    const dead = give(g, pc, 'T_DeadOn');
    await play(cb, pc, give(g, pc, 'T_Load'));
    assert.equal(pc.chamber[0], dead);
    assert.ok(!pc.hand.includes(dead));
    await cb.endTurn();
    assert.equal(pc.chamber[0], dead, 'not discarded at the end of turn');
    pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; cb.s.phase = 'play';
    const hp = e.hp;
    await cb.exec(0, { type: 'chamber', u: dead.u, target: e.u });
    assert.equal(e.hp, hp - 4, 'Dead On bonus');
    assert.equal(pc.en, 2, 'costs paid as normal');
    assert.equal(pc.chamber[0], null);
    const hp2 = e.hp;
    await play(cb, pc, give(g, pc, 'T_DeadOn'), { target: e.u });
    assert.equal(e.hp, hp2 - 2, 'no Dead On from the hand');
    let hits = 0; const count = (ev) => { if (ev.t === 'edmg') hits++; };
    g.io.emit = count;
    pc.t.atkPotion = 1; pc.en = 3;
    await play(cb, pc, give(g, pc, 'T_Rapid'), { target: e.u });
    assert.equal(hits, 4, 'Rapid Fire 1 + Attack Potion: 4 plays');
  });
  await test('Hermit curses: Loadable with "When Loaded", upgradable, not stopped by Omamori, 3 Gold at the Merchant', async () => {
    const g = game(['M']);
    const p = g.run.players[0];
    p.relics.push({ id: 'Omamori', n: 0 });
    const c = await g.addCard(p, 'T_Malice', false);
    assert.ok(c && p.deck.includes(c));
    assert.ok(g.upgradable(p).includes(c));
    assert.equal(g.cardPrice('T_Malice'), 3);
    const cb = await combat(g);
    const pc = cb.pc(0), e = cb.spawn('Cultist', 0);
    const m = give(g, pc, 'T_Malice');
    assert.ok(cb.canPlay(pc, m), 'unplayable');
    await cb.loadCards(pc, 1, { card: m });
    assert.equal(e.hp, 9 - 2);
  });
  await test('Corrupted Shard: gained with another character\'s Load card; 1 Chamber slot and Heat 1; first Soulburn enters a Mode', async () => {
    const g = game(['R', 'M'], [(q) => (/モードを選択/.test(q.title) ? 'defense' : undefined)]);
    const ic = g.run.players[0];
    await g.addCard(ic, 'T_Load', false);
    assert.ok(ic.relics.some((r) => r.id === 'CorruptedShard'));
    await g.addCard(ic, 'T_Burn', false);
    assert.equal(ic.relics.filter((r) => r.id === 'CorruptedShard').length, 1);
    const cb = await combat(g);
    const pc = cb.pc(0);
    same(pc.chamber, [null]); assert.equal(pc.heat, 1); assert.equal(pc.mode, null);
    assert.equal(cb.pc(1).chamber.length, 2, 'the Hermit keeps his own Chamber');
    cb.spawn('Cultist', 0);
    pc.soul = 1;
    await cb.exec(0, { type: 'soulburn' });
    assert.equal(pc.mode, 'defense');
  });
  await test('mixed party: Guardian, Hexaghost, Hermit and Slime Boss states survive a save and resume', async () => {
    const g = game(['U', 'H', 'M', 'S']);
    const cb = await combat(g);
    cb.spawn('Cultist', 0);
    const [u, h, m, s] = cb.pcs();
    cb.modeShift(u); await cb.gainVigor(u, 2); await cb.heatStep(h, 1, 2);
    const ld = give(g, m, 'T_StrikeM'); await cb.loadCards(m, 1, { card: ld });
    const snap = JSON.parse(JSON.stringify(g.run));
    const g2 = new STS.Game(snap, null);
    const cb2 = new STS.Combat(g2, snap.combat);
    const [u2, h2, m2, s2] = cb2.pcs();
    same([u2.mode, u2.vigor, h2.heat, h2.soul, m2.chamber[0].id, s2.slimes[0].id], ['defense', 2, 3, 1, 'T_StrikeM', 'BruiserSlime']);
    const v = u2.draw.concat(u2.hand).find((c) => DF.canon(c.id) === 'T_Var');
    assert.equal(STS.CARDS[v.id].t, 'S');
  });
  await test('Hermit cards (transcribed): Snapshot, Pistol Whip, Headshot, Itchy Trigger+, Vantage, Fan the Hammer, Tracking Shots, Body Armor, Heroic Bravado, Misfire', async () => {
    const g = game(['M'], []);
    const cb = await combat(g);
    const pc = cb.pc(0), e = cb.spawn('JawWorm', 0, { lvl: 'hard' });
    cb.spawn('JawWorm', 0, { lvl: 'hard' });
    const reset = () => { pc.en = 6; cb.s.phase = 'play'; };
    // Snapshot from the Chamber: Block = the card's damage, whatever the enemy's Block (FAQ)
    reset(); e.blk = 5;
    const snap = give(g, pc, 'Snapshot'); await cb.loadCards(pc, 1, { card: snap });
    const b0 = pc.blk; await cb.exec(0, { type: 'chamber', u: snap.u, target: e.u });
    assert.equal(pc.blk, b0 + 2);
    // Pistol Whip Dead On: +1 Energy and Load
    reset();
    const pw = give(g, pc, 'PistolWhip'); await cb.loadCards(pc, 1, { card: pw });
    const keep = give(g, pc, 'StrikeM');
    const en0 = pc.en; await cb.exec(0, { type: 'chamber', u: pw.u, target: e.u });
    assert.equal(pc.en, en0 - 1 + 1); assert.ok(pc.chamber.includes(keep));
    // Headshot from the hand does nothing; from the Chamber 5 damage
    reset(); e.blk = 0;
    let hp = e.hp; await play(cb, pc, give(g, pc, 'Headshot'));
    assert.equal(e.hp, hp);
    pc.chamber = [null, null];
    const hs = give(g, pc, 'Headshot'); await cb.loadCards(pc, 1, { card: hs });
    hp = e.hp; await cb.exec(0, { type: 'chamber', u: hs.u, target: e.u });
    assert.equal(e.hp, hp - 5);
    // Itchy Trigger+: Rapid Fire twice = 3 plays
    reset(); let hits = 0; g.io.emit = (ev) => { if (ev.t === 'edmg') hits++; };
    await play(cb, pc, give(g, pc, 'ItchyTrigger', true), { target: e.u });
    assert.equal(hits, 3);
    // Vantage: the next Attack gains Rapid Fire
    reset(); hits = 0; pc.chamber = [null, null];
    give(g, pc, 'DefendM');
    await play(cb, pc, give(g, pc, 'Vantage', true));
    await play(cb, pc, give(g, pc, 'StrikeM'), { target: e.u });
    assert.equal(hits, 2);
    hits = 0; await play(cb, pc, give(g, pc, 'StrikeM'), { target: e.u });
    assert.equal(hits, 1, 'only the next Attack');
    // Fan the Hammer: plays a Chamber card for 0 Energy, Dead On included
    reset(); pc.chamber = [null, null];
    const hs2 = give(g, pc, 'Headshot'); await cb.loadCards(pc, 1, { card: hs2 });
    const total = () => cb.s.enemies.reduce((a, x) => a + Math.max(0, x.hp), 0);
    hp = total(); const en1 = pc.en;
    await play(cb, pc, give(g, pc, 'FanTheHammer'), { target: e.u });
    assert.equal(pc.en, en1 - 1); assert.ok(total() <= hp - 2 - 5, 'Headshot played free with Dead On');
    // Tracking Shots from the hand may Load itself
    reset(); pc.chamber = [null, null];
    const fresh = () => { cb.s.over = false; cb.s.result = null; return cb.spawn('JawWorm', 0, { lvl: 'hard' }); };
    const e2 = fresh();
    const ts = give(g, pc, 'TrackingShots');
    await play(cb, pc, ts, { target: e2.u });
    assert.ok(pc.chamber.includes(ts));
    // Body Armor: Dead On costs 0; Heroic Bravado: 1 less per Attack in the Chamber
    reset(); pc.chamber = [null, null];
    const ba = give(g, pc, 'BodyArmor'); await cb.loadCards(pc, 1, { card: ba });
    pc.t.fromChamber = ba.u; assert.equal(cb.costOf(pc, ba), 0); pc.t.fromChamber = null;
    assert.equal(cb.costOf(pc, ba), 1, 'from the hand it costs 1');
    const hb = give(g, pc, 'HeroicBravado'); const st = give(g, pc, 'StrikeM'); await cb.loadCards(pc, 1, { card: st });
    assert.equal(cb.costOf(pc, hb), 2);
    // Misfire: +1 with a Curse in the Chamber
    reset(); pc.chamber = [null, null]; fresh(); fresh();
    const mal = give(g, pc, 'T_Malice'); await cb.loadCards(pc, 1, { card: mal });
    const row = cb.aoeTargets(0).map((x) => x.hp);
    await play(cb, pc, give(g, pc, 'Misfire'), { row: 0 });
    assert.ok(cb.aoeTargets(0).every((x, i) => x.hp === Math.max(0, row[i] - 2)) || cb.s.over);
  });
  await test('random games with all eight characters (stand-in cards) end without errors', async () => {
    const parties = [['U', 'H'], ['M', 'S', 'R'], ['U', 'H', 'M', 'S'], ['G', 'M'], ['B', 'U', 'W']];
    for (const chs of parties) for (let seed = 1; seed <= 12; seed++) {
      const r = await sim.playRandom(STS, { players: chs.map((ch) => ({ ch })), asc: seed % 14, seed, act4: true }, {
        strict: true, mutate: (run) => run.players.forEach((p) => { p.hp = p.maxHp = 300; }),
        onAsk: (g, pi, q) => { if (q.type === 'option' && q.options.some((o) => o.id === 'next')) return 'next'; }
      });
      assert.ok(['victory', 'defeat', 'stopped'].includes(r.result));
    }
  });
  console.log('ok: ' + passed + ' Downfall mechanics tests (stand-in cards)');
})().catch((e) => { console.error(e); process.exit(1); });
