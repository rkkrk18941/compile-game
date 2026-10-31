/* Character buffs (house rule, 2026-10-31) for スレイザスパイア (ibara/bg): the rules with run.buff on and off,
   and the setting in the interface (on by default, applies to new, continued and current adventures).
   Run: node tools/ibara-buff-test.cjs   (needs jsdom for the interface part) */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sim = require('./ibara-bg-sim.cjs');
const bot = require('./ibara-bot.cjs');
const STS = sim.load();
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } }

function game(ch, buff, asks) {
  const run = STS.Game.newRun({ players: [{ ch }], asc: 0, seed: 7, buff });
  const g = new STS.Game(run, { ask: (pi, q) => { asks.push(q); return q.answer !== undefined ? q.answer : asks.reply ? asks.reply(q) : STS.autoAnswer(g, pi, q); } });
  g.setupDecks(); g.setupAct(1);
  const cb = STS.Combat.create(g, { kind: 'normal' });
  g.run.combat = cb.s; g.combat = cb;
  cb.pcs().forEach((pc) => { pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; });
  cb.s.phase = 'play'; cb.s.round = 2;
  return { g, cb, pc: cb.pc(0), P: run.players[0] };
}

(async () => {
  await test('engine default and newRun flag', async () => {
    assert.equal(STS.Game.newRun({ players: [{ ch: 'R' }], seed: 1 }).buff, false, 'printed rules unless asked');
    assert.equal(STS.Game.newRun({ players: [{ ch: 'R' }], seed: 1, buff: true }).buff, true);
    assert.deepEqual(Object.keys(STS.DATA.BUFFS).sort(), ['G', 'R', 'W'], 'Defect and the expansion characters have no buff');
  });

  await test('Ironclad: heal 1 at the end of the turn, 2 at 1 HP, never above max; nothing when off', async () => {
    let t = game('R', true, []);
    t.P.hp = 5; t.cb.spawn('Cultist', 0);
    await t.cb.endTurn(); assert.equal(t.P.hp, 6);
    t = game('R', true, []); t.cb.spawn('Cultist', 0); t.P.hp = 1;
    await t.cb.endTurn(); assert.equal(t.P.hp, 3, 'at 1 HP: 1 + 1 more');
    t = game('R', true, []); t.cb.spawn('Cultist', 0);
    await t.cb.endTurn(); assert.equal(t.P.hp, t.P.maxHp, 'full HP stays full');
    t = game('R', true, []); t.cb.spawn('Cultist', 0); t.P.hp = 2; t.pc.hand.push({ u: t.g.uid(), id: 'Burn', up: false });
    await t.cb.endTurn(); assert.equal(t.P.hp, 2, 'heals with the other end-of-turn effects, before Burn damage (2 +1 -1)');
    t = game('R', false, []); t.cb.spawn('Cultist', 0); t.P.hp = 1;
    await t.cb.endTurn(); assert.equal(t.P.hp, 1, 'normal rules: no heal');
  });

  await test('Silent, start of turn: Poison 1 on an enemy without Poison (automatic for one, chosen or declined for several)', async () => {
    let asks = [], t = game('G', true, asks);
    const a = t.cb.spawn('Cultist', 0);
    await t.cb.startOfTurn(t.pc);
    assert.equal(a.psn, 1); assert.equal(asks.filter((q) => q.buff).length, 0, 'one candidate: no question');
    await t.cb.startOfTurn(t.pc);
    assert.equal(a.psn, 1, 'cannot add to an enemy that already has Poison');
    asks = []; t = game('G', true, asks);
    const b = t.cb.spawn('Cultist', 0), c = t.cb.spawn('Cultist', 0), d = t.cb.spawn('Cultist', 0);
    b.psn = 2;
    asks.reply = (q) => (q.buff ? d.u : STS.autoAnswer(t.g, 0, q));
    await t.cb.startOfTurn(t.pc);
    const q = asks.find((x) => x.buff === 'G');
    assert.equal(q.type, 'enemy'); assert.deepEqual(Array.from(q.options), [c.u, d.u], 'only enemies without Poison'); assert.equal(q.skip, '使わない');
    assert.deepEqual([b.psn, c.psn, d.psn], [2, 0, 1]);
    asks.length = 0; asks.reply = (x) => (x.buff ? null : STS.autoAnswer(t.g, 0, x));
    d.psn = 0;
    await t.cb.startOfTurn(t.pc);
    assert.deepEqual([b.psn, c.psn, d.psn], [2, 0, 0], 'declined');
    t = game('G', false, []); const e = t.cb.spawn('Cultist', 0);
    await t.cb.startOfTurn(t.pc); assert.equal(e.psn, 0, 'normal rules: no free Poison');
    t = game('G', true, []); const f = t.cb.spawn('Cultist', 0), h = t.cb.spawn('JawWorm', 0, { lvl: 'medium' });
    f.psn = 30; await t.cb.startOfTurn(t.pc); assert.equal(h.psn, 0, 'Poison supply (30) is used up');
  });

  await test('Silent, end of turn: Poison deals its damage first, then may become Block (all of it) or stay', async () => {
    let asks = [], t = game('G', true, asks);
    let a = t.cb.spawn('JawWorm', 0, { lvl: 'medium' }), b = t.cb.spawn('Cultist', 0);
    a.psn = 3; b.psn = 2;
    const hpA = a.hp, hpB = b.hp;
    asks.reply = (q) => (q.buff ? 'shield' : STS.autoAnswer(t.g, 0, q));
    await t.cb.endTurn();
    assert.equal(a.hp, hpA - 3); assert.equal(b.hp, hpB - 2, 'Poison damage happens before the choice');
    const q = asks.find((x) => x.buff === 'G');
    assert.equal(q.type, 'option'); assert.equal(q.poison, 5); assert.equal(q.gain, 5);
    assert.deepEqual(Array.from(q.options, (o) => o.id), ['shield', 'keep']);
    assert.deepEqual([a.psn, b.psn, t.pc.blk], [0, 0, 5], 'every Poison removed, Block = amount removed');
    asks = []; t = game('G', true, asks);
    a = t.cb.spawn('JawWorm', 0, { lvl: 'medium' }); a.psn = 3;
    asks.reply = (x) => (x.buff ? 'keep' : STS.autoAnswer(t.g, 0, x));
    await t.cb.endTurn();
    assert.deepEqual([a.psn, t.pc.blk], [3, 0], 'kept: Poison keeps ticking');
    asks = []; t = game('G', true, asks);
    a = t.cb.spawn('JawWorm', 0, { lvl: 'medium' }); a.psn = 4; t.pc.blk = 18;
    asks.reply = (x) => (x.buff ? 'shield' : STS.autoAnswer(t.g, 0, x));
    await t.cb.endTurn();
    assert.equal(asks.find((x) => x.buff).gain, 2); assert.deepEqual([a.psn, t.pc.blk], [0, 20], 'Block limit 20');
    asks = []; t = game('G', true, asks);
    a = t.cb.spawn('JawWorm', 0, { lvl: 'medium' }); a.psn = 2; t.pc.blk = 20;
    await t.cb.endTurn();
    assert.deepEqual([asks.filter((x) => x.buff).length, a.psn], [0, 2], 'Block already 20: no question, Poison stays');
    asks = []; t = game('G', true, asks); t.cb.spawn('Cultist', 0);
    await t.cb.endTurn(); assert.equal(asks.filter((x) => x.buff).length, 0, 'no Poison: no question');
    asks = []; t = game('G', false, asks); a = t.cb.spawn('JawWorm', 0, { lvl: 'medium' }); a.psn = 3;
    await t.cb.endTurn(); assert.deepEqual([a.psn, t.pc.blk, asks.filter((x) => x.buff).length], [3, 0, 0], 'normal rules');
  });

  await test('Watcher: Block 1 for every change of stance (back to none too); nothing when off or for others', async () => {
    let t = game('W', true, []); t.cb.spawn('Cultist', 0);
    await t.cb.setStance(t.pc, 'wrath'); assert.equal(t.pc.blk, 1);
    await t.cb.setStance(t.pc, 'wrath'); assert.equal(t.pc.blk, 1, 'same stance is not a change');
    const en = t.pc.en;
    await t.cb.setStance(t.pc, 'calm'); await t.cb.setStance(t.pc, 'none');
    assert.equal(t.pc.blk, 3); assert.equal(t.pc.en, en + 2, 'leaving Calm still gives 2 Energy');
    t = game('W', true, []); t.cb.spawn('Cultist', 0);
    t.pc.pow.push({ u: 999, id: 'MentalFortress', up: false, card: { u: 999, id: 'MentalFortress' }, n: 0, v: 0, data: {} });
    await t.cb.setStance(t.pc, 'wrath'); assert.equal(t.pc.blk, 2, 'adds to Mental Fortress');
    t = game('W', false, []); t.cb.spawn('Cultist', 0);
    await t.cb.setStance(t.pc, 'wrath'); assert.equal(t.pc.blk, 0);
    t = game('R', true, []); t.cb.spawn('Cultist', 0);
    await t.cb.setStance(t.pc, 'wrath'); assert.equal(t.pc.blk, 0, 'only the Watcher');
  });

  await test('Defect and normal rules are untouched; bot games finish with the buffs on', async () => {
    const t = game('B', true, []); t.cb.spawn('Cultist', 0); t.P.hp = 3;
    await t.cb.endTurn(); assert.equal(t.P.hp, 3);
    for (const ch of ['R', 'G', 'W']) for (const buff of [false, true]) {
      const r = await bot.playSmart(STS, { players: [{ ch }], asc: 0, seed: 11, buff }, { strict: true });
      assert.ok(r.result === 'victory' || r.result === 'defeat', ch + ' ' + buff);
      assert.equal(r.run.buff, buff);
    }
    // Two players, one Silent: the buff only belongs to the Silent player.
    const r2 = await bot.playSmart(STS, { players: [{ ch: 'G' }, { ch: 'B' }], asc: 0, seed: 5, buff: true }, { strict: true });
    assert.ok(r2.result);
  });

  // ---------------------------------------------------------------- interface (jsdom)
  let JSDOM, VirtualConsole;
  try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { console.log('jsdom not installed: interface checks skipped'); }
  if (JSDOM) {
    const FILES = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'session', 'help', 'ui-parts', 'help-ui', 'context-help', 'morph', 'director', 'ui'];
    const errors = [], vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(String(e && e.stack || e))); vc.on('error', (e) => errors.push(String(e)));
    const dom = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url: 'https://example.test/ibara/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window, d = w.document;
    for (const name of FILES) w.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
    const S = w.STS, A = S.UI.state, tick = () => new Promise((r) => setTimeout(r, 30));
    const click = async (sel) => { const el = d.querySelector(sel); assert.ok(el, 'missing ' + sel); el.click(); await tick(); };
    const prefs = () => JSON.parse(w.localStorage.getItem('ibara.bg.prefs.v1') || '{}');
    await tick();

    await test('settings: on by default, switch to normal and back; new and continued adventures follow it', async () => {
      A.screen = 'settings'; S.UI.draw();
      assert.equal(d.querySelector('[data-a="herobuff"][data-v="on"]').getAttribute('aria-pressed'), 'true');
      assert.match(d.querySelector('.buff-setting').textContent, /アイアンクラッド.*サイレント.*ウォッチャー/);
      await click('[data-a="herobuff"][data-v="off"]');
      assert.equal(prefs().heroBuff, false);
      assert.equal(d.querySelector('[data-a="herobuff"][data-v="off"]').getAttribute('aria-pressed'), 'true');
      A.setup.ch = 'G'; S.UI.startSolo(); await tick();
      assert.equal(A.sess.run().buff, false, 'new adventure: normal rules');
      // Changing it during the adventure applies at once.
      A.ui.info = { k: 'settings' }; S.UI.draw();
      await click('.info-sheet [data-a="herobuff"][data-v="on"]');
      assert.equal(A.sess.run().buff, true);
      assert.doesNotMatch(d.querySelector('.topbar').textContent, /強化/, 'no label outside the abilities and the settings');
      // A saved adventure (from before the setting existed) follows the setting when continued.
      const saved = JSON.parse(w.localStorage.getItem('ibara.bg.save.v3'));
      delete saved.run.buff; w.localStorage.setItem('ibara.bg.save.v3', JSON.stringify(saved));
      A.sess.close(); A.sess = null; A.screen = 'title'; S.UI.draw();
      await click('[data-a="resume"]');
      assert.equal(A.sess.run().buff, true, 'continued adventure uses the setting (on)');
    });

    await test('setup screen: the buff is part of the ability text only (no other label); nothing when off', async () => {
      A.sess && A.sess.close && A.sess.close(); A.sess = null; A.screen = 'solo'; A.setup.ch = 'W'; S.UI.draw();
      assert.match(d.querySelector('.setup-page .buff-note').textContent, /^スタンスを変えるたび/);
      assert.doesNotMatch(d.querySelector('.setup-page').textContent, /強化あり|キャラクター強化/);
      A.setup.ch = 'B'; S.UI.draw();
      assert.equal(d.querySelector('.setup-page .buff-note'), null, 'Defect: nothing added');
      A.screen = 'settings'; S.UI.draw(); await click('[data-a="herobuff"][data-v="off"]');
      A.screen = 'solo'; A.setup.ch = 'R'; S.UI.draw();
      assert.equal(d.querySelector('.setup-page .buff-note'), null, 'off: printed ability only');
      A.screen = 'settings'; S.UI.draw(); await click('[data-a="herobuff"][data-v="on"]');
    });

    await test('battle prompts: decline button for the free Poison, incoming damage for the Block choice', async () => {
      const run = S.Game.newRun({ players: [{ ch: 'G' }], seed: 61, buff: true }), g = new S.Game(run, {});
      g.setupDecks(); g.setupAct(1);
      const cb = S.Combat.create(g, { kind: 'normal' }); g.combat = cb; run.combat = cb.s; run.phase = 'combat'; cb.s.phase = 'play';
      const pc = cb.pcs()[0]; pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 };
      const e1 = cb.spawn('Cultist', 0), e2 = cb.spawn('JawWorm', 0, { lvl: 'medium' });
      let prompt = { id: 7, pi: 0, q: { type: 'enemy', pi: 0, title: 'キャラ強化：毒1を与える敵を選択', options: [e1.u, e2.u], skip: '使わない', buff: 'G' } };
      const answers = [];
      A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null; A.host = null; A.guest = null;
      A.sess = { run: () => run, pending: () => (prompt ? [prompt] : []), waiting: () => [], playOpen: () => false, hand: () => S.Session.handInfo(run, 0), command: () => Promise.resolve(), answer: (id, v) => { answers.push([id, v]); prompt = null; return Promise.resolve(); } };
      S.UI.draw();
      const skip = d.querySelector('.target-ask [data-a="ans"]');
      assert.ok(skip); assert.match(skip.textContent, /使わない/);
      skip.click(); await tick();
      assert.deepEqual(answers.at(-1), [7, null]);
      e2.psn = 3; pc.blk = 1;
      prompt = { id: 8, pi: 0, q: { type: 'option', pi: 0, buff: 'G', title: 'キャラ強化：毒をブロックに変えますか？', poison: 3, gain: 3, blk: 1, text: '敵の毒：合計3', options: [{ id: 'shield', label: '毒3を取り除いてブロック+3' }, { id: 'keep', label: '毒を残す' }] } };
      S.UI.draw();
      const hint = d.querySelector('.buff-hint');
      assert.ok(hint, 'incoming damage hint'); assert.match(hint.textContent, /あなたへ合計\d+/);
      await click('[data-a="ans"][data-v="&quot;shield&quot;"], [data-a="ans"][data-v=\'"shield"\']');
      assert.deepEqual(answers.at(-1), [8, 'shield']);
      A.ui = { info: { k: 'ability' } }; S.UI.draw();
      assert.match(d.querySelector('.info-sheet .buff-ability').textContent, /^ターン開始時：毒を持っていない敵1体に毒1/);
      run.buff = false; S.UI.draw();
      assert.equal(d.querySelector('.info-sheet .buff-ability'), null);
      assert.equal(errors.length, 0, errors.join('\n'));
    });

    await test('map: the act Boss is tappable and shows each monster of the fight with its abilities and actions', async () => {
      const run = S.Game.newRun({ players: [{ ch: 'R' }, { ch: 'G' }], seed: 3, asc: 13 }), g = new S.Game(run, {});
      g.setupDecks(); g.setupAct(3); run.phase = 'map'; run.boss = 'AwakenedOne'; run.boss2 = 'DonuDeca';
      A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null;
      A.sess = { run: () => run, pending: () => [], waiting: () => [], playOpen: () => false, hand: () => ({}), command: () => Promise.resolve(), answer: () => Promise.resolve() };
      S.UI.draw();
      assert.match(d.querySelector('.map-boss').textContent, /覚醒者・ドヌーとデカ/);
      await click('.map-boss'); await tick(); S.UI.draw();
      const sheet = d.querySelector('.info-sheet');
      assert.match(sheet.textContent, /好奇心/); assert.match(sheet.textContent, /覚醒者（第2形態）/); assert.match(sheet.textContent, /狂信者 ×4/);
      assert.match(sheet.textContent, /循環の力/); assert.match(sheet.textContent, /四角形の防御/);
      assert.equal(d.querySelectorAll('.boss-preview').length, 2, 'both Bosses of Ascension 13');
      assert.equal(JSON.stringify(run.combat), 'null', 'the real adventure is untouched');
      A.ui = {}; S.UI.draw();
      const node = d.querySelector('.mapnode[data-a="bossinfo"]');
      assert.ok(node, 'the Boss room on the map opens the same sheet');
      node.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick(); await tick();
      assert.equal(A.ui.info.k, 'boss');
      // Every Boss (and every enemy) names its effects in the action table; no Boss is without an ability text.
      for (const id of Object.keys(S.MONSTERS)) for (const r of S.View.enemyReference(id, 10)) assert.doesNotMatch(r.text, /特殊/, id + ' ' + r.name);
      for (const id of Object.keys(S.MONSTERS).filter((k) => S.MONSTERS[k].boss)) assert.ok(S.View.PASSIVE[id], id + ' has an ability text');
      assert.equal(errors.length, 0, errors.join('\n'));
    });
    dom.window.close();
  }
  console.log('ok: ' + passed + ' character-buff and Boss-sheet checks (Ironclad heal, Silent Poison/Block, Watcher stance Block, settings, prompts, Boss abilities from the map)');
})().catch((e) => { console.error(e); process.exitCode = 1; });
