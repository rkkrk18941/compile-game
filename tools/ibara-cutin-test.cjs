/* 必殺技カットイン (2026-11-27) for スレイザスパイア, interface side (jsdom, no browser):
   - a rare card, or an attack whose blow is heavy (6 or more to one enemy, before Block; once a round per player),
     gets the cut-in with the card's name and the hero's portrait; ordinary cards keep their old timing;
   - the second cut-in of a round is the quick one; a tap ends a cut-in at once; nothing at speed 「なし」 or with
     the setting off; prefers-reduced-motion keeps a still band;
   - damage named after a relic/power/orb/potion and poison do not count as the card's blow;
   - a teammate's cut-in is a small band that adds no waiting and takes no taps;
   - a whole adventure replays with cut-ins, without an exception and without changing the adventure;
   - the setting is shown in the settings screen and in the battle menu, and is saved.
   NODE_PATH=<jsdom> node tools/ibara-cutin-test.cjs */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FILES = ['data', 'cards', 'items', 'monsters', 'events', 'combat', 'engine', 'df-data', 'df-mech', 'df-mech-guardian', 'df-mech-hexaghost', 'df-mech-hermit', 'df-shard', 'df-gems',
  'df-cards-slime', 'df-cards-guardian', 'df-cards-hexaghost', 'df-cards-hermit', 'df-cards-hermit-rest', 'df-items', 'df-run', 'df-bosses', 'df-bosses-official', 'df-boons', 'df-items-extra', 'df-events',
  'session', 'help', 'ui-parts', 'help-ui', 'context-help', 'morph', 'director', 'impact', 'moments', 'cutin', 'df-view', 'mapview', 'records', 'daily', 'records-ui', 'ui'];
const errors = [], vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.stack || e))); vc.on('error', (e) => errors.push(String(e)));
const dom = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url: 'https://example.test/ibara/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
w.console.error = (e) => errors.push(String(e && e.stack || e)); // the director logs what a step threw
for (const name of FILES) w.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
const S = w.STS, A = S.UI.state, NL = w.IBARA.NL;
const bot = require('./ibara-bot.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
function ok(c, m) { assert.ok(c, m); checks++; }
const layer = () => d.getElementById('floatLayer');
function clear() { layer().innerHTML = ''; }

/* A director with a real page but its own speed (the page's own director replays at once under jsdom).
   waits: what on_play returned for each card. */
function director(speed, instant, sounds, waits) {
  const dir = new S.Director({
    me: () => 0, setView: (f) => { A.view = f; }, draw: () => S.UI.draw(), sfx: (n) => sounds.push(n), speed: () => speed, instant: () => instant,
    playerName: (i) => (i === 0 ? 'あなた' : '仲間'), enemyName: () => '敵', round: () => 1, partySize: () => (A.sess && A.sess.run ? A.sess.run().players.length : 1), fitCards: () => {}
  });
  dir.on_play = function (ev, pre, me) { const x = S.Director.prototype.on_play.call(this, ev, pre, me); if (waits) waits.push({ id: ev.card.id, i: ev.i, w: x }); return x; };
  return dir;
}
async function idle(dir, limit) { const t0 = Date.now(); while ((dir.busy || dir.q.length) && Date.now() - t0 < limit) await sleep(5); return !(dir.busy || dir.q.length); }
/* A battle and the events of the cards played in it (with the battle picture, like the session adds). */
function battle(chs, o) {
  o = o || {};
  const evs = [];
  const run = S.Game.newRun({ players: chs.map((ch) => ({ ch })), seed: o.seed || 41, buff: false });
  const io = { emit: (ev) => { if (run.combat && run.combat.pcs && ev.t !== 'log' && ev.t !== 'relic') ev.vs = S.Session.visual(run); evs.push(ev); } };
  const g = new S.Game(run, io); g.setupDecks(); g.setupAct(1);
  const cb = S.Combat.create(g, { kind: 'normal' }); run.combat = cb.s; g.combat = cb; run.phase = 'combat';
  const e = cb.spawn('Cultist', 0); e.hp = e.max = 80;
  cb.s.phase = 'play'; cb.s.round = o.round || 2;
  cb.pcs().forEach((pc) => { pc.en = 9; pc.t = { played: 0, attacks: 0, skills: 0, powers: 0 }; pc.str = o.str || 0; pc.hand = []; });
  A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null;
  A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
  const api = {
    run, g, cb, e, evs,
    async play(pi, id, up) {
      const pc = cb.pc(pi), c = { u: g.uid(), id, up: !!up };
      pc.hand.push(c);
      const dd = S.CARDS[id];
      await cb.playFromHand(pc, dd.tg === 'R' ? { type: 'play', u: c.u, row: 0 } : dd.tg === 'E' ? { type: 'play', u: c.u, target: e.u } : { type: 'play', u: c.u });
    },
    take() { const out = evs.splice(0, evs.length); return JSON.parse(JSON.stringify(out)); }
  };
  return api;
}
async function replay(dir, events, limit) { for (const ev of events) dir.push(ev); return idle(dir, limit || 8000); }

(async () => {
  NL.prefs.cutin = true;

  /* ---------------- a rare card: the cut-in, its name, the portrait, the wait ---------------- */
  {
    clear();
    const b = battle(['R']);
    await b.play(0, 'Bludgeon');
    const sounds = [], waits = [], dir = director(1, false, sounds, waits);
    const evs = b.take();
    const t0 = Date.now();
    for (const ev of evs) dir.push(ev);
    await sleep(30);
    const m = d.querySelector('.nl-moment.nl-cutin');
    ok(m, 'a rare card: the cut-in is shown');
    ok(m && /脳天割り/.test(m.querySelector('.ci-text b').textContent) && /レア・アタック/.test(m.querySelector('.ci-text em').textContent) && /Bludgeon/.test(m.textContent), 'with the card name, 「★ レア・アタック」 and the English name');
    ok(m && m.querySelector('.ci-hero:not(.ci-echo) img').getAttribute('src') === S.View.heroImg('R') && m.querySelector('.ci-hero').classList.contains('flip'), 'with the Ironclad\'s battle portrait, mirrored like on the battlefield');
    ok(m && m.classList.contains('ci-R') && !m.classList.contains('quick'), 'in the Ironclad\'s colours, the full version first');
    ok(sounds.indexOf('cutin') >= 0, 'with its sound');
    ok(await idle(dir, 4000), 'the replay goes on by itself');
    const wt = waits.filter((x) => x.id === 'Bludgeon')[0];
    ok(wt && wt.w >= 900 && wt.w <= 1000, 'the full cut-in takes about 0.96 s at normal speed (' + (wt && wt.w) + ' ms)');
    ok(Date.now() - t0 >= 900, 'and the replay waited for it');
    ok(!d.querySelector('.nl-cutin'), 'it has gone afterwards');
  }

  /* ---------------- a tap ends it at once; the second cut-in of a round is the quick one ---------------- */
  {
    clear();
    const b = battle(['G']);
    await b.play(0, 'DieDieDie');
    await b.play(0, 'AfterImage');
    const evs = b.take();
    const sounds = [], waits = [], dir = director(1, false, sounds, waits);
    const t0 = Date.now();
    for (const ev of evs) dir.push(ev);
    await sleep(30);
    let m = d.querySelector('.nl-cutin');
    ok(m && /ダイ！ダイ！ダイ！/.test(m.textContent), 'the first rare card of the round');
    m.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(15);
    ok(!d.querySelector('.nl-cutin') || d.querySelector('.nl-cutin') !== m, 'a tap removes it');
    const t1 = Date.now();
    ok(t1 - t0 < 600, 'and the replay goes on without waiting for the rest');
    for (let k = 0; k < 300 && !(d.querySelector('.nl-cutin') && d.querySelector('.nl-cutin') !== m); k++) await sleep(10);
    m = d.querySelector('.nl-cutin');
    ok(m && /残像/.test(m.textContent) && /レア・パワー/.test(m.textContent) && m.classList.contains('quick'), 'the next rare card of the same round (a Power): the quick cut-in');
    ok(await idle(dir, 4000), 'the replay ends');
    const q = waits.filter((x) => x.id === 'AfterImage')[0];
    ok(q && q.w >= 480 && q.w <= 560, 'the quick cut-in takes about 0.52 s (' + (q && q.w) + ' ms)');
  }

  /* ---------------- heavy blows: 6 or more to one enemy, once a round ---------------- */
  {
    clear();
    const b = battle(['R'], { str: 2 });
    await b.play(0, 'HeavyBlade'); // 3 + 3 per Strength = 9
    await b.play(0, 'HeavyBlade');
    let evs = b.take();
    ok(evs.filter((x) => x.t === 'edmg').every((x) => x.n >= 6), 'Heavy Blade with Strength 2 deals 6 or more');
    const sounds = [], waits = [], dir = director(4, false, sounds, waits);
    let seen = 0;
    const mo = new w.MutationObserver(() => { const m = d.querySelector('.nl-cutin'); if (m && !m.dataset.seen) { m.dataset.seen = '1'; seen++; ok(/大ダメージ/.test(m.querySelector('em').textContent) && /ヘビーブレード/.test(m.textContent), 'a heavy blow: 「大ダメージ」 and the name'); } });
    mo.observe(layer(), { childList: true });
    ok(await replay(dir, evs), 'replayed');
    ok(seen === 1, 'two heavy blows in one round: one cut-in (' + seen + ')');
    ok(waits[0].w > 900 && waits[1].w < 400, 'the second one keeps the ordinary timing');
    // the next round: again
    b.cb.s.round = 3; b.cb.pc(0).en = 9;
    await b.play(0, 'HeavyBlade');
    evs = b.take();
    ok(await replay(dir, evs), 'replayed');
    ok(seen === 2, 'the next round, a heavy blow has its cut-in again');
    mo.disconnect();
  }

  /* ---------------- ordinary cards keep their timing ---------------- */
  {
    clear();
    const b = battle(['R']);
    await b.play(0, 'StrikeR'); await b.play(0, 'DefendR'); await b.play(0, 'Bash');
    const evs = b.take();
    const plain = new JSDOM('<div id="app"></div><div id="toast"></div><div id="floatLayer"></div>', { url: 'https://example.test/ibara/', runScripts: 'outside-only', pretendToBeVisual: true });
    for (const name of FILES) if (name !== 'cutin') plain.window.eval(fs.readFileSync(path.join(__dirname, '../ibara/bg', name + '.js'), 'utf8'));
    const total = (W) => {
      const dir = new W.STS.Director({ me: () => 0, setView: () => {}, draw: () => {}, sfx: () => {}, speed: () => 1, instant: () => false, playerName: () => 'あなた', enemyName: () => '敵', round: () => 2, partySize: () => 1, fitCards: () => {} });
      return evs.reduce((a, ev) => a + (dir.play(JSON.parse(JSON.stringify(ev))) || 0), 0);
    };
    const before = total(plain.window), after = total(w);
    ok(after === before && !d.querySelector('.nl-cutin'), 'Strike, Defend and Bash: no cut-in, the same waits (' + before + ' → ' + after + ' ms)');
  }

  /* ---------------- damage from other sources and poison are not the card's blow ---------------- */
  {
    const dir = director(1, true, [], []);
    dir.q = [{ t: 'edmg', u: 1, n: 9, src: 'ライトニング' }, { t: 'poison', u: 2 }, { t: 'edmg', u: 2, n: 9 }, { t: 'edmg', u: 3, n: 3 }, { t: 'edmg', u: 3, n: 2 }, { t: 'play' }, { t: 'edmg', u: 3, n: 9 }];
    ok(dir.cutinBlow() === 5, 'only the card\'s own hits on one enemy, up to the next card (' + dir.cutinBlow() + ')');
  }

  /* ---------------- the setting, speed 「なし」, reduced motion ---------------- */
  {
    clear();
    const b = battle(['B']);
    await b.play(0, 'MeteorStrike');
    const evs = b.take();
    NL.prefs.cutin = false;
    let sounds = [], waits = [];
    ok(await replay(director(4, false, sounds, waits), JSON.parse(JSON.stringify(evs))), 'replayed');
    ok(sounds.indexOf('cutin') < 0 && waits[0].w < 400, 'setting off: no cut-in');
    NL.prefs.cutin = true;
    sounds = []; waits = [];
    const dirNone = director(1, true, sounds, waits);
    for (const ev of JSON.parse(JSON.stringify(evs))) dirNone.push(ev);
    await sleep(10);
    ok(!dirNone.busy && !d.querySelector('.nl-cutin') && sounds.length === 0, 'speed なし: nothing is played');
    const FX0 = w.IBARA.FX;
    w.IBARA.FX = { reduce: true, burst() {}, ring() {}, streak() {}, bolt() {}, slash() {} };
    clear();
    const dir = director(1, false, [], []);
    for (const ev of JSON.parse(JSON.stringify(evs))) dir.push(ev);
    await sleep(30);
    const m = d.querySelector('.nl-cutin');
    ok(m && m.classList.contains('still') && !m.querySelector('.ci-lines') && !m.querySelector('.ci-rays') && !m.querySelector('.ci-echo'), 'reduced motion: a still band without moving lines or afterimage');
    ok(await idle(dir, 3000), 'replayed');
    w.IBARA.FX = FX0;
  }

  /* ---------------- a teammate's cut-in never stops the replay ---------------- */
  {
    clear();
    const b = battle(['R', 'W']);
    await b.play(1, 'Brilliance');
    const evs = b.take();
    const waits = [], sounds = [], dir = director(1, false, sounds, waits);
    // the small band needs the teammate's hero on the page
    const run = b.run; A.sess.run = () => run; S.UI.draw();
    for (const ev of evs) dir.push(ev);
    await sleep(30);
    ok(!d.querySelector('.nl-moment'), 'a teammate\'s rare card: no overlay that would take taps');
    ok(waits[0] && waits[0].w <= 400, 'and no extra waiting (' + (waits[0] && waits[0].w) + ' ms)');
    ok(await idle(dir, 3000), 'replayed');
  }

  /* ---------------- whole adventure with cut-ins ---------------- */
  {
    clear();
    const evs = [];
    const r = await bot.playSmart(S, { players: [{ ch: 'R' }], seed: 31, buff: true }, {
      mutate: (run) => { run.players[0].hp = run.players[0].maxHp = 70; },
      onEmit: (g, ev) => { const c = Object.assign({}, ev); if (g.run.combat && g.run.combat.pcs && ev.t !== 'log' && ev.t !== 'relic') c.vs = S.Session.visual(g.run); evs.push(c); }
    });
    const run = r.run, before = JSON.stringify(run);
    A.screen = 'game'; A.me = 0; A.ui = {}; A.view = null; A.lastCombat = null; // the battles of the sections above are not this adventure's
    A.sess = { run: () => run, pending: () => [], waiting: () => [], hand: () => ({}), playOpen: () => false, answer: () => true, command: () => Promise.resolve(), changed: () => {} };
    const sounds = [], dir = director(400, false, sounds, null);
    const n0 = errors.length;
    for (const ev of evs) dir.push(ev);
    ok(await idle(dir, 60000), 'a whole adventure (' + evs.length + ' events) replays to the end');
    if (errors.length !== n0) console.log(errors.slice(n0, n0 + 1).join('\n'));
    ok(errors.length === n0, 'without an exception ' + errors.slice(n0, n0 + 2).join(' | '));
    ok(JSON.stringify(run) === before, 'and without changing the adventure');
    const n = sounds.filter((x) => x === 'cutin').length;
    ok(n > 0, 'with cut-ins (' + n + ')');
    console.log('通しプレイ1回（アイアンクラッド）のカットイン：' + n + '回');
    clear();
  }

  /* ---------------- the setting in the settings screen and the battle menu ---------------- */
  {
    w.localStorage.clear();
    A.screen = 'settings'; A.ui = {}; A.sess = null; S.UI.draw();
    let btn = d.querySelector('[data-a=togglecutin]');
    ok(btn && /必殺技カットイン：オン/.test(btn.textContent) && btn.getAttribute('aria-pressed') === 'true', 'settings screen: 必殺技カットイン：オン');
    btn.click(); await sleep(20);
    btn = d.querySelector('[data-a=togglecutin]');
    ok(NL.prefs.cutin === false && /オフ/.test(btn.textContent), 'a tap turns it off');
    const saved = Object.keys(w.localStorage).map((k) => w.localStorage.getItem(k)).filter((v) => /"cutin":false/.test(v || ''));
    ok(saved.length === 1, 'and the choice is saved');
    btn.click(); await sleep(20);
    ok(NL.prefs.cutin === true, 'a second tap turns it on again');
    const b = battle(['R']); A.sess.run = () => b.run; A.screen = 'game'; A.ui = { info: { k: 'menu' } }; S.UI.draw();
    ok(d.querySelector('[data-a=togglecutin]') && /必殺技カットイン/.test(d.querySelector('[data-a=togglecutin]').textContent), 'the battle menu has it too');
  }

  ok(errors.length === 0, 'no page error ' + errors.slice(0, 2).join(' | '));
  console.log('ok: ' + checks + ' cut-in checks (rare, heavy blow once a round, quick second, tap, ordinary timing, sources, setting, speed none, reduced motion, teammate, whole adventure, menus)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
