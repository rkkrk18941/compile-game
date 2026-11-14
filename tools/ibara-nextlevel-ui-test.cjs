/* Next-level update (2026-11-13), interface side (jsdom, no browser):
   - every event of whole adventures replays through the director with the new presentation (impact.js,
     moments.js) without an exception and without changing the adventure; at speed 「なし」 it ends at once;
     a tap on a Boss entrance ends that step at once;
   - the lethal warning uses the same sum as the intent bubbles and stays away when Block covers it;
   - low-HP pulse, the act card, the result screen (also for old saves without statistics) and the records screen.
   NODE_PATH=<jsdom> node tools/ibara-nextlevel-ui-test.cjs */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FILES = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'df-data', 'df-mech', 'df-mech-guardian', 'df-mech-hexaghost', 'df-mech-hermit', 'df-shard', 'df-gems',
  'df-cards-slime', 'df-cards-guardian', 'df-cards-hexaghost', 'df-cards-hermit', 'df-cards-hermit-rest', 'df-items', 'df-run', 'df-bosses', 'df-bosses-official', 'df-boons', 'df-items-extra', 'df-events',
  'session', 'help', 'ui-parts', 'help-ui', 'context-help', 'morph', 'director', 'impact', 'moments', 'df-view', 'mapview', 'records', 'daily', 'records-ui', 'ui'];
const errors = [], vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.stack || e))); vc.on('error', (e) => errors.push(String(e)));
const dom = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url: 'https://example.test/ibara/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
for (const name of FILES) w.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
const S = w.STS, A = S.UI.state, NL = w.IBARA.NL;
const bot = require('./ibara-bot.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
function ok(c, m) { assert.ok(c, m); checks++; }

/* A director with a real page but its own speed (the page's own director replays at once under jsdom). */
function director(speed, instant, sounds) {
  return new S.Director({
    me: () => 0, setView: (f) => { A.view = f; }, draw: () => S.UI.draw(), sfx: (n) => sounds.push(n), speed: () => speed, instant: () => instant,
    playerName: () => 'あなた', enemyName: () => '敵', round: () => 1, partySize: () => 1, fitCards: () => {}
  });
}
async function idle(dir, limit) { const t0 = Date.now(); while ((dir.busy || dir.q.length) && Date.now() - t0 < limit) await sleep(5); return !(dir.busy || dir.q.length); }

(async () => {
  /* ---------------- whole adventures through the new presentation ---------------- */
  const types = {};
  for (const [ch, seed] of [['R', 31], ['G', 32], ['B', 33], ['W', 34]]) {
    const evs = [];
    const r = await bot.playSmart(S, { players: [{ ch }], seed, buff: true }, {
      mutate: (run) => { run.players[0].hp = run.players[0].maxHp = 70; },
      onEmit: (g, ev) => { const c = Object.assign({}, ev); if (g.run.combat && g.run.combat.pcs && ev.t !== 'log' && ev.t !== 'relic') c.vs = S.Session.visual(g.run); evs.push(c); types[ev.t] = (types[ev.t] || 0) + 1; }
    });
    const run = r.run, before = JSON.stringify(run);
    A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null;
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
    const sounds = [], dir = director(400, false, sounds);
    const n0 = errors.length;
    for (const ev of evs) dir.push(ev);
    ok(await idle(dir, 60000), ch + ': the replay of ' + evs.length + ' events finished');
    ok(errors.length === n0, ch + ': no exception during the replay ' + errors.slice(n0, n0 + 2).join(' | '));
    ok(JSON.stringify(run) === before, ch + ': the adventure is unchanged by its replay');
    if (evs.some((e) => e.t === 'combatStart' && e.kind === 'boss')) ok(sounds.indexOf('bossdrum') >= 0, ch + ': Boss entrance sound');
    w.document.getElementById('floatLayer').innerHTML = '';
  }
  ok(types.combatStart > 10 && types.edmg > 50 && types.die > 10 && types.gainRelic > 0 && types.upgrade > 0, 'the replays covered entrances, hits, deaths, relics and upgrades');

  /* ---------------- speed 「なし」: only the result ---------------- */
  {
    const sounds = [], dir = director(1, true, sounds);
    dir.push({ t: 'combatStart', kind: 'boss', act: 1, enc: 'Boss:Hexaghost' });
    dir.push({ t: 'round', n: 1 });
    await sleep(5);
    ok(!dir.busy && !dir.q.length && !d.querySelector('.nl-moment') && sounds.length === 0, 'speed なし: nothing is played, the replay ends at once');
  }

  /* ---------------- a tap ends a Boss entrance at once ---------------- */
  {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 5, buff: true }), g = new S.Game(run, {});
    g.setupDecks(); g.setupAct(1);
    const cb = S.Combat.create(g, { kind: 'boss', enc: 'Boss:' + run.boss }); run.combat = cb.s; g.combat = cb;
    await S.ENCOUNTERS['Boss:' + run.boss].build(cb);
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
    const sounds = [], dir = director(1, false, sounds);
    const t0 = Date.now();
    dir.push({ t: 'combatStart', kind: 'boss', act: 1, enc: 'Boss:' + run.boss, vs: S.Session.visual(run) });
    dir.push({ t: 'round', n: 1, vs: S.Session.visual(run) });
    await sleep(80);
    const m = d.querySelector('.nl-moment.nl-boss');
    ok(m && /第1幕 ボス/.test(m.textContent), 'Boss entrance shows 「第1幕 ボス」 and the name');
    m.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(20);
    ok(!d.querySelector('.nl-moment'), 'a tap removes the entrance');
    ok(await idle(dir, 1500) && Date.now() - t0 < 1700, 'and the replay goes on without waiting for the rest of the 2.3 s');
  }

  /* ---------------- the lethal warning ---------------- */
  {
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 7, buff: true }), g = new S.Game(run, {});
    g.setupDecks(); g.setupAct(1);
    const cb = S.Combat.create(g, { kind: 'normal' }); run.combat = cb.s; run.phase = 'combat'; cb.s.phase = 'play'; cb.s.round = 1; cb.s.die = 3;
    const enc = run.decks.enc1st[run.decks.enc1st.length - 1]; cb.s.encs = [enc]; await S.ENCOUNTERS[enc].build(cb, 0); cb.pcs()[0].t = {};
    A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null; A.host = A.guest = null;
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => S.Session.handInfo(run, 0), playOpen: () => true, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
    let inc = 0;
    for (let die = 1; die <= 6 && !inc; die++) { cb.s.die = die; inc = S.UI.incomingTo(run, 0); }
    ok(inc > 0, 'the enemy announces an attack (' + inc + ')');
    run.players[0].hp = inc; cb.pcs()[0].blk = 0; S.UI.draw();
    ok(d.querySelector('.nl-lethal-tag') && d.querySelector('.endturn.lethal') && d.querySelector('.intent.lethal'), 'announced damage ≧ Block + HP: bubble, button and message');
    ok(new RegExp('予告の合計' + inc + ' ≧ ブロック＋HP ' + inc).test(d.querySelector('.nl-lethal-tag').textContent), 'the same sum as the intent bubbles');
    cb.pcs()[0].blk = 1; S.UI.draw();
    ok(!d.querySelector('.nl-lethal-tag') && !d.querySelector('.endturn.lethal'), 'Block covers it: no warning');
    cb.pcs()[0].blk = 0; run.players[0].hp = inc + 1; S.UI.draw();
    ok(!d.querySelector('.nl-lethal-tag'), 'HP left after the hit: no warning');
    // low HP: the red edge
    run.players[0].hp = 3; S.UI.draw();
    ok(d.body.classList.contains('nl-lowhp') && d.getElementById('nlEdge'), 'HP 3 or less: the edge pulses');
    run.players[0].hp = 4; S.UI.draw();
    ok(!d.body.classList.contains('nl-lowhp'), 'HP above 3: no pulse');
    // long fights are announced two rounds before (buffs on)
    cb.s.round = S.DATA.LONG_FIGHT - 2; S.UI.draw();
    ok(d.querySelector('.nl-long-tag') && /あと2ラウンド/.test(d.querySelector('.nl-long-tag').textContent), 'long fight announced two rounds before');
    run.buff = false; S.UI.draw();
    ok(!d.querySelector('.nl-long-tag'), 'not with the printed rules');
    run.buff = true; cb.s.round = S.DATA.LONG_FIGHT - 3; S.UI.draw();
    ok(!d.querySelector('.nl-long-tag'), 'not earlier');
  }

  /* ---------------- the act card waits for a tap ---------------- */
  {
    const run = S.Game.newRun({ players: [{ ch: 'G' }], seed: 9, buff: true });
    run.stats.kills = 12;
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
    A.screen = 'game';
    NL.onEvent({ t: 'act', act: 2 }, A);
    const card = d.querySelector('.nl-actcard');
    ok(card && /第2幕/.test(card.textContent) && /倒した敵12体/.test(card.textContent.replace(/\s/g, '')), 'act card with the summary');
    await sleep(1500);
    ok(d.querySelector('.nl-actcard'), 'it does not go away by itself');
    card.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(!d.querySelector('.nl-actcard'), 'a tap closes it');
  }

  /* ---------------- result screen (old save without statistics) and records ---------------- */
  {
    w.localStorage.clear();
    const run = S.Game.newRun({ players: [{ ch: 'W' }], seed: 11, buff: true });
    run.phase = 'over'; run.result = 'defeat'; run.act = 2; run.bosses = 1; run.boxes = 2; delete run.stats;
    A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null; A.host = A.guest = null;
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {}, close: () => {} };
    const n0 = errors.length;
    S.UI.draw();
    const res = d.querySelector('.result');
    ok(res && errors.length === n0, 'result screen of an old save renders');
    ok(/スコア/.test(res.textContent) && /次の目標/.test(res.textContent) && /シード\s*11/.test(res.textContent), 'score, next goal and seed are shown');
    ok(d.querySelector('[data-a=playagain]') && d.querySelector('[data-a=copyseed]'), 'play again and copy the seed');
    const recs = JSON.parse(w.localStorage.getItem('ibara.bg.records.v1'));
    ok(recs.history.length === 1 && recs.history[0].ch === 'W', 'the adventure is in the records');
    A.screen = 'records'; A.ui = {}; S.UI.draw();
    ok(d.querySelector('.records-page .nl-hist') && d.querySelectorAll('.nl-medal').length === S.Records.MEDALS.length, 'records screen: history and all medals with their conditions');
    d.querySelector('.nl-hist').click(); await sleep(40);
    ok(d.querySelector('.nl-rec-detail .card'), 'an adventure opens with its deck');
  }

  /* ---------------- an ordinary action takes no more time than before ---------------- */
  {
    // The same events (a Strike on a healthy enemy, the enemy's light attacks, a Defend) are played by the director
    // with and without the new presentation files; the waits it returns (the replay time) are compared.
    const evs = [];
    const run = S.Game.newRun({ players: [{ ch: 'R' }], seed: 41, buff: false }), io = { emit: (ev) => { if (run.combat && run.combat.pcs && ev.t !== 'log' && ev.t !== 'relic') ev.vs = S.Session.visual(run); evs.push(ev); } };
    const g = new S.Game(run, io); g.setupDecks(); g.setupAct(1);
    const cb = S.Combat.create(g, { kind: 'normal' }); run.combat = cb.s; g.combat = cb; run.phase = 'combat';
    const e = cb.spawn('Cultist', 0); e.hp = e.max = 60;
    cb.s.phase = 'play'; cb.s.round = 2; const pc = cb.pc(0); pc.en = 3; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0 };
    pc.hand = [{ u: g.uid(), id: 'StrikeR', up: false }, { u: g.uid(), id: 'DefendR', up: false }];
    evs.length = 0;
    await cb.playFromHand(pc, { type: 'play', u: pc.hand[0].u, target: e.u });
    await cb.playFromHand(pc, { type: 'play', u: pc.hand[0].u });
    await cb.enemyHit(e, pc, 1, {});
    const plain = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url: 'https://example.test/ibara/', runScripts: 'outside-only', pretendToBeVisual: true });
    for (const name of FILES) if (name !== 'impact' && name !== 'moments') plain.window.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
    const total = (W) => {
      const dir = new W.STS.Director({ me: () => 0, setView: () => {}, draw: () => {}, sfx: () => {}, speed: () => 1, instant: () => false, playerName: () => 'あなた', enemyName: () => '敵', round: () => 2, partySize: () => 1, fitCards: () => {} });
      return evs.reduce((a, ev) => a + (dir.play(JSON.parse(JSON.stringify(ev))) || 0), 0);
    };
    const before = total(plain.window), after = total(w);
    ok(evs.some((x) => x.t === 'edmg') && evs.some((x) => x.t === 'pdmg' || x.t === 'hp'), 'the action has a hit and an enemy attack');
    ok(after <= before, 'ordinary action: ' + after + ' ms with the new presentation, ' + before + ' ms before');
    console.log('通常の1アクション（ストライク・防御・敵の攻撃）の待ち時間：変更前 ' + before + 'ms → 変更後 ' + after + 'ms');
    plain.window.close();
  }

  assert.deepEqual(errors, []);
  console.log('ok: ' + checks + ' next-level interface checks (replay of 4 adventures, speed none, tap, lethal, low HP, long fights, act card, result, records)');
  dom.window.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
