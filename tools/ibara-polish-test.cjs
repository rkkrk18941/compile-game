/* Product-polish regressions (2026-10-30): nothing the player earns is lost silently, irreversible choices ask
   once more, X is chosen before a card is sent, and the opening blessing shows what it changed. No browser needed. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FILES = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'df-data', 'df-mech', 'df-mech-guardian', 'df-mech-hexaghost', 'df-mech-hermit', 'df-shard', 'df-gems',
  'df-cards-slime', 'df-cards-guardian', 'df-cards-hexaghost', 'df-cards-hermit', 'df-cards-hermit-rest', 'df-items', 'df-run', 'df-bosses', 'df-bosses-official', 'df-boons', 'df-items-extra', 'df-events',
  'session', 'help', 'ui-parts', 'help-ui', 'context-help', 'morph', 'director', 'df-view', 'ui'];
function makeDom(url) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && e.stack || e))); vc.on('error', (e) => errors.push(String(e)));
  const dom = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  for (const name of FILES) dom.window.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
  return { w: dom.window, d: dom.window.document, errors };
}
const tick = () => new Promise((r) => setTimeout(r, 30));
let passed = 0;
async function test(name, fn) { await fn(); passed++; }

(async () => {
  const { w, d, errors } = makeDom('https://example.test/ibara/');
  const S = w.STS, A = S.UI.state;
  const click = async (sel) => { const el = d.querySelector(sel); assert.ok(el, 'missing ' + sel); el.click(); await tick(); };
  function stage(run, prompt, answers) {
    A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null; A.host = null; A.guest = null;
    A.sess = { run: () => run, pending: () => (prompt.current ? [prompt.current] : []), waiting: () => [], hand: () => ({}), playOpen: () => true,
      answer: (id, v) => { answers.push({ id, v }); return Promise.resolve(); }, command: (pi, c) => { answers.push({ cmd: c }); return Promise.resolve(); } };
    S.UI.draw();
  }

  await test('the opening blessing ends with a receipt of everything it changed (Neow and Heart\'s Boon)', async () => {
    for (const adv of ['normal', 'downfall']) {
      const run = S.Game.newRun({ players: [{ ch: adv === 'downfall' ? 'S' : 'R' }], seed: 7, adv });
      const seen = [];
      const g = new S.Game(run, { ask: async (pi, q) => { seen.push(q); return S.autoAnswer(g, pi, q); } });
      g.setupDecks(); g.setupAct(1); run.phase = 'neow';
      const deckBefore = run.players[0].deck.length;
      await g.openingWithReport();
      const receipt = seen.filter((q) => q.type === 'info' && q.result)[0];
      assert.ok(receipt, adv + ': a result prompt follows the blessing');
      assert.equal(receipt.title, adv === 'downfall' ? 'ハートの恩恵の結果' : 'ネオーの祝福の結果');
      assert.equal(receipt.ok, '確認して冒険を始める');
      assert.equal(receipt.result.choices.length, 1, adv + ': the chosen option is listed');
      const row = receipt.result.rows[0];
      assert.equal(row.addedCards.length - row.removedCards.length, run.players[0].deck.length - deckBefore, adv + ': card changes match the deck');
      assert.equal(run.opening, undefined, adv + ': nothing is left behind after acknowledging');
    }
  });

  await test('a save taken on the receipt resumes on the receipt without applying the blessing twice', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'G' }], seed: 11 });
    let stop = null;
    const g = new S.Game(run, { ask: async (pi, q) => { if (q.type === 'info' && q.result) { stop = JSON.parse(JSON.stringify(run)); throw new Error('pause'); } return S.autoAnswer(g, pi, q); } });
    g.setupDecks(); g.setupAct(1); run.phase = 'neow';
    await g.openingWithReport().catch((e) => { if (e.message !== 'pause') throw e; });
    assert.ok(stop && stop.opening && stop.opening.report, 'the receipt is part of the save');
    const deck = stop.players[0].deck.length, gold = stop.players[0].gold, asked = [];
    const g2 = new S.Game(stop, { ask: async (pi, q) => { asked.push(q.type); return S.autoAnswer(g2, pi, q); } });
    await g2.openingWithReport();
    assert.deepEqual(asked, ['info'], 'only the receipt is shown again');
    assert.equal(stop.players[0].deck.length, deck); assert.equal(stop.players[0].gold, gold);
  });

  await test('moving on from rewards collects the gold and never takes other rewards by itself', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 3 });
    const g = new S.Game(run, { ask: async () => 'done' });
    g.setupDecks(); g.setupAct(1);
    const p = run.players[0], deck = p.deck.length, gold = p.gold;
    const rw = g.makeRewards(p, { gold: 3, potion: 1, cards: [{ kind: 'normal' }] });
    await g.claimFor(rw);
    assert.equal(p.gold, gold + 3); assert.equal(p.deck.length, deck); assert.equal(p.potions.length, 0);
    assert.ok(rw.items[0].taken && !rw.items[1].taken && !rw.items[2].taken && rw.done);
  });

  await test('the reward screen asks before leaving unclaimed rewards behind', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 5 }); run.phase = 'room'; run.room = { t: 'M', rewards: [] };
    const answers = [], prompt = { current: { id: 41, q: { type: 'reward', items: [{ idx: 0, k: 'gold', n: 2 }, { idx: 1, k: 'card', kind: 'normal', n: 3 }] } } };
    stage(run, prompt, answers);
    await click('[data-a=rewarddone]');
    assert.equal(answers.length, 0, 'nothing is sent before confirming');
    assert.match(d.querySelector('.confirm-box').textContent, /カード報酬/);
    assert.match(d.querySelector('.confirm-box').textContent, /ゴールド（2）は自動で受け取ります/);
    await click('[data-a=confirmno].btn');
    assert.equal(d.querySelector('.confirm-box'), null); assert.equal(answers.length, 0);
    await click('[data-a=rewarddone]'); await click('[data-a=confirmyes]');
    assert.deepEqual(answers, [{ id: 41, v: 'done' }]);
    // Only gold left: no question at all.
    answers.length = 0; prompt.current = { id: 42, q: { type: 'reward', items: [{ idx: 0, k: 'gold', n: 2 }, { idx: 1, k: 'card', kind: 'normal', n: 3, taken: true }] } };
    S.UI.draw(); await click('[data-a=rewarddone]');
    assert.deepEqual(answers, [{ id: 42, v: 'done' }]); assert.equal(d.querySelector('.confirm-box'), null);
    // A confirmation for an old prompt can never answer a newer one.
    answers.length = 0; prompt.current = { id: 43, q: { type: 'reward', items: [{ idx: 1, k: 'card', kind: 'normal', n: 3 }] } };
    S.UI.draw(); await click('[data-a=rewarddone]');
    prompt.current = { id: 44, q: { type: 'reward', items: [{ idx: 1, k: 'card', kind: 'normal', n: 3 }] } }; S.UI.draw(); await tick();
    assert.equal(d.querySelector('.confirm-box'), null, 'the dialog closes when the question changes');
    assert.equal(answers.length, 0);
  });

  await test('ending the adventure at an act break is confirmed first', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 9 });
    const g = new S.Game(run, { ask: async (pi, q) => { run.__q = q; return 'next'; } });
    g.setupDecks(); g.setupAct(1); run.phase = 'actEnd';
    await g.actEnd();
    const q = run.__q; delete run.__q;
    const end = q.options.filter((o) => o.id === 'end')[0];
    assert.ok(end && end.confirm && /遊べなくなります/.test(end.confirm.text));
    assert.ok(!q.options.filter((o) => o.id === 'next')[0].confirm, 'moving on needs no extra question');
    const answers = [], prompt = { current: { id: 51, q } };
    stage(run, prompt, answers);
    assert.ok(d.querySelector('[data-a=optconfirm]'));
    await click('[data-a=optconfirm]');
    assert.equal(answers.length, 0); assert.match(d.querySelector('.confirm-box h3').textContent, /冒険をここで終えますか/);
    await click('[data-a=confirmyes]');
    assert.deepEqual(answers, [{ id: 51, v: 'end' }]);
    // Option explanations are short, with the full name for assistive technology.
    const summary = d.querySelector('.opts details.tap-effect-help summary');
    if (summary) { assert.equal(summary.textContent, '解説'); assert.match(summary.getAttribute('aria-label'), /の解説$/); }
  });

  await test('boss relics are selected first and only sent with the confirm button', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 13 }); run.phase = 'bossRelic';
    const answers = [], prompt = { current: { id: 61, q: { type: 'bossRelic', title: 'ボスレリックを1つ選ぶ', ids: ['Astrolabe', 'FrozenCore', 'PandorasBox'], taken: {} } } };
    stage(run, prompt, answers);
    assert.ok(d.querySelector('[data-a=bossconfirm]').disabled);
    await click('[data-a=bosspick][data-v=FrozenCore]');
    assert.equal(answers.length, 0); assert.equal(d.querySelector('[data-a=bosspick][data-v=FrozenCore]').getAttribute('aria-pressed'), 'true');
    assert.ok(!d.querySelector('[data-a=bossconfirm]').disabled);
    await click('[data-a=bossconfirm]');
    assert.deepEqual(answers, [{ id: 61, v: 'FrozenCore' }]);
    // A relic another player has just taken can no longer be confirmed.
    answers.length = 0; prompt.current = { id: 62, q: { type: 'bossRelic', title: 'x', ids: ['Astrolabe', 'FrozenCore'], taken: {} } }; S.UI.draw(); await tick();
    await click('[data-a=bosspick][data-v=Astrolabe]');
    prompt.current.q.taken = { Astrolabe: 1 }; S.UI.draw(); await tick();
    assert.ok(d.querySelector('[data-a=bossconfirm]').disabled); assert.equal(answers.length, 0);
  });

  await test('decisions outside battle can open the deck; the map legend matches the map symbols', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 17 });
    const g = new S.Game(run, {}); g.setupDecks(); g.setupAct(1); run.phase = 'room'; run.room = { t: 'M', rewards: [] };
    const answers = [], prompt = { current: { id: 71, q: { type: 'cardReward', title: 'カード報酬', skip: true, cards: [{ idx: 0, id: 'Anger' }, { idx: 1, id: 'Cleave' }, { idx: 2, id: 'Clash' }] } } };
    stage(run, prompt, answers);
    await click('.sheet-deck');
    assert.equal(A.ui.info.k, 'deck'); assert.ok(d.querySelector('.info-sheet .cardgrid.deckgrid'));
    await click('.info-sheet [data-a=close]');
    assert.equal(answers.length, 0);
    prompt.current = { id: 72, q: { type: 'map', options: [] } }; run.phase = 'map'; run.room = null; S.UI.draw(); await tick();
    const legend = Array.from(d.querySelectorAll('.maplegend span'));
    assert.deepEqual(legend.map((s) => Array.from(s.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')), ['遭遇', 'エリート', 'イベント', '商人', '休憩所', '宝箱']);
    assert.ok(legend.every((s) => s.querySelector('svg')), 'each legend entry shows its symbol');
  });

  await test('X-cost cards: X is chosen before anything is sent, and the play can be called off', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 19 });
    const g = new S.Game(run, {}); g.setupDecks(); g.setupAct(1);
    const cb = S.Combat.create(g, { kind: 'normal' }); g.combat = cb; run.combat = cb.s; run.phase = 'combat'; cb.s.phase = 'play';
    const pc = cb.pcs()[0]; pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0 }; cb.spawn('SmallSlime', 0);
    pc.hand = [{ id: 'Whirlwind', u: 900, up: false }];
    const answers = [], prompt = { current: null };
    stage(run, prompt, answers);
    A.sess.hand = () => S.Session.handInfo(run, 0);
    A.ui.sel = 900; S.UI.draw(); await tick();
    // The selected card's "use" button leads to the X choice, not to a command.
    await click('[data-a=playsel]');
    assert.ok(A.ui.xpick, 'the X picker opens');
    assert.deepEqual(Array.from(d.querySelectorAll('[data-a=xpick]')).map((b) => b.textContent), ['0', '1', '2', '3']);
    assert.equal(answers.length, 0, 'nothing is sent yet');
    await click('[data-a=xcancel]');
    assert.equal(A.ui.xpick, null); assert.equal(answers.length, 0, 'cancelling sends nothing');
    A.ui.sel = 900; S.UI.draw(); await tick(); await click('[data-a=playsel]');
    await click('[data-a=xpick][data-v="2"]');
    assert.deepEqual(JSON.parse(JSON.stringify(answers)), [{ cmd: { type: 'play', u: 900, x: 2 } }]);
    // The engine plays exactly the chosen X.
    await cb.command(0, { type: 'play', u: 900, x: 2 });
    assert.equal(pc.en, 1, 'two energy paid');
  });

  await test('giving up asks in the game\'s own dialog; play again opens the setup; expansion heroes pass their boxes on', async () => {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 23 });
    const g = new S.Game(run, {}); g.setupDecks(); g.setupAct(1); run.phase = 'map';
    w.localStorage.setItem('ibara.bg.save.v3', JSON.stringify({ v: 3, run }));
    const answers = [], prompt = { current: null };
    stage(run, prompt, answers);
    A.sess.close = () => {};
    A.ui.info = { k: 'menu' }; S.UI.draw(); await tick();
    await click('[data-a=abandon]');
    assert.match(d.querySelector('.confirm-box').textContent, /あきらめますか/);
    await click('[data-a=confirmno].btn');
    assert.ok(w.localStorage.getItem('ibara.bg.save.v3'), 'the save survives "continue"');
    A.ui.info = { k: 'menu' }; S.UI.draw(); await tick();
    await click('[data-a=abandon]'); await click('[data-a=confirmyes]');
    assert.ok([null, 'null'].includes(w.localStorage.getItem('ibara.bg.save.v3')), 'the save is gone'); assert.equal(A.screen, 'title');
    // Result screen of a Slime Boss adventure.
    w.localStorage.setItem('ibara.bg.unlock.v1', JSON.stringify({ asc: 0, ch: { R: 0, G: 0, B: 0, W: 0, S: 0 }, colorless: 0, act4: 0, spare: 0 }));
    const df = S.Game.newRun({ players: [{ ch: 'S' }], seed: 29, adv: 'downfall' }); df.phase = 'over'; df.result = 'defeat'; df.bosses = 1; df.boxes = 2;
    stage(df, { current: null }, []);
    const sheet = JSON.parse(w.localStorage.getItem('ibara.bg.unlock.v1'));
    assert.equal(sheet.ch.S | 0, 0, 'no boxes are wasted on a hero whose cards are all available');
    assert.equal(sheet.spare, 2, 'the boxes can go to Colorless or Act IV');
    assert.ok(d.querySelector('[data-a=spare][data-v=colorless]'));
    await click('[data-a=playagain]');
    assert.equal(A.screen, 'solo');
  });

  await test('an invitation link opens the online page with the room code filled in', async () => {
    const inv = makeDom('https://example.test/ibara/?room=ab12');
    const A2 = inv.w.STS.UI.state;
    await tick();
    assert.equal(A2.screen, 'coop'); assert.equal(A2.coop.code, 'AB12');
    assert.equal(inv.d.getElementById('code').value, 'AB12');
    assert.match(inv.d.querySelector('.selection-status').textContent, /部屋 AB12 に招待されています/);
    assert.deepEqual(inv.errors, []);
    const plain = makeDom('https://example.test/ibara/');
    await tick();
    assert.equal(plain.w.STS.UI.state.screen, 'title');
  });

  assert.deepEqual(errors, []);
  console.log('ok: ' + passed + ' polish checks (opening receipt and resume, reward gold and leave confirmation, act-end and give-up dialogs, boss relic confirm, deck shortcut and legend, X picker with cancel, expansion boxes, play again, invitation link)');
})().catch((e) => { console.error(e); process.exit(1); });
