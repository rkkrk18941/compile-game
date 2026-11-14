/* スレイザスパイア next-level update: the guests see the same presentation as the host (Chromium, Playwright).
   Three tabs over BroadcastChannel (?net=local): the host's first room is turned into the Act I Boss fight, then
   every tab records what the presentation layer shows (Boss entrance, weights of hits, last blow, Boss's fall).
     node tools/ibara-nextlevel-coop-check.cjs [--shots DIR] */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* next */ } }
if (!playwright) { console.error('Playwright was not found.'); process.exit(2); }
const root = path.join(__dirname, '..');
const PORT = 8797, BASE = 'http://localhost:' + PORT + '/ibara/';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Records the presentation elements that appear in the effect layer. */
function watch() {
  window.__seen = {};
  const L = document.getElementById('floatLayer');
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    String(n.className || '').split(/\s+/).forEach((c) => { if (c) window.__seen[c] = (window.__seen[c] || 0) + 1; });
    if (n.classList && n.classList.contains('nl-moment')) window.__seen['text:' + n.textContent.replace(/\s+/g, '')] = 1;
  }))).observe(L, { childList: true });
}
/* A legal tap (answers, targets, cards, end of turn), as in ibara-bg-browser-check.cjs. */
function botStep() {
  const A = window.STS_APP, q = (s) => Array.from(document.querySelectorAll(s)), vis = (el) => el && el.offsetParent !== null;
  const run = A.sess && A.sess.run();
  if (!run) return 'norun';
  if (run.phase === 'over') return 'over';
  if (A.view) return 'replay';
  const msel = q('[data-a="msel"]');
  if (msel.length) { const ok = document.querySelector('[data-a="mselok"]'); if (ok && !ok.disabled) { ok.click(); return 'pick'; } const c = msel.find((x) => !x.classList.contains('chosen')); if (c) { c.click(); return 'pick'; } }
  const pick = q('[data-a="rewardpick"]');
  if (pick.length) { const ok = document.querySelector('[data-a="rewardconfirm"]'); if (ok && !ok.disabled) { ok.click(); return 'reward'; } pick[0].click(); return 'reward'; }
  const t = q('.foe.target, .band.rowtarget, .hero.target');
  if (t.length) { t[0].click(); return 'target'; }
  const ans = q('[data-a="ans"]').filter(vis);
  if (ans.length) { ans[0].click(); return 'answer'; }
  const cards = q('.hand .card').filter((c) => !c.classList.contains('no'));
  if (cards.length && Math.random() < 0.9) { const c = cards[Math.floor(Math.random() * cards.length)]; c.click(); c.click(); return 'card'; }
  const end = document.querySelector('[data-a="end"]');
  if (end && !end.disabled) { end.click(); return 'end'; }
  return 'wait';
}

(async () => {
  await sleep(600);
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const errs = [];
  try {
    const tabs = [];
    for (const tag of ['host', 'guest1', 'guest2']) {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
      await p.goto(BASE + '?net=local', { waitUntil: 'load' });
      await p.evaluate(() => { localStorage.setItem('ibara.bg.prefs.v1', JSON.stringify({ anim: 1.6, music: false, sfx: false })); });
      await p.reload({ waitUntil: 'load' });
      await p.evaluate(watch);
      tabs.push(p);
    }
    const [H, G1, G2] = tabs;
    // The host's first room becomes the Act I Boss (only to reach a Boss quickly; the engine plays it normally).
    await H.evaluate(() => {
      const G = window.STS.Game.prototype, move = G.moveTo;
      G.moveTo = function (key) { move.call(this, key); if (this.run.map.visited.length === 1 && this.run.act === 1) { this.run.room.t = 'B'; this.run.room.first = false; } };
    });
    await H.click('text=オンライン協力'); await H.fill('#nm', 'ホスト'); await H.click('text=部屋を作る'); await sleep(400);
    const code = await H.evaluate(() => window.STS_APP.coop.code);
    for (const [P, nm] of [[G1, 'ゲスト1'], [G2, 'ゲスト2']]) {
      await P.click('text=オンライン協力'); await P.fill('#nm', nm);
      await P.fill('#code', code); await sleep(60); await P.click('button:has-text("参加")'); await sleep(500);
    }
    await H.click('[data-a=startcoop]');
    for (const [P, ch] of [[H, 'R'], [G1, 'G'], [G2, 'W']]) { await P.waitForSelector('[data-a=pickonlinech]'); await P.click('[data-a=pickonlinech][data-v=' + ch + ']'); }
    await H.waitForFunction(() => window.STS_APP.screen === 'game'); await sleep(500);
    await H.evaluate(() => { const r = window.STS_APP.sess.run(); r.players.forEach((x) => { x.hp = x.maxHp = 400; }); });
    let bossShot = false;
    for (let i = 0; i < 900; i++) {
      for (const P of tabs) await P.evaluate(botStep);
      await sleep(30);
      if (!bossShot && SHOTS) {
        const m = await G1.evaluate(() => !!document.querySelector('.nl-moment.nl-boss'));
        if (m) { bossShot = true; await G1.screenshot({ path: path.join(SHOTS, 'coop-guest-boss.png') }); await H.screenshot({ path: path.join(SHOTS, 'coop-host-boss.png') }); }
      }
      const done = await H.evaluate(() => { const r = window.STS_APP.sess.run(); return r && r.bosses >= 1 && !window.STS_APP.view; });
      if (done) break;
      if (i === 120 || i === 400) {
        // make the fight end in reasonable time: the Boss is weakened on the host (the guests replay what happens)
        await H.evaluate(() => { const r = window.STS_APP.sess.run(); if (r.combat) r.combat.enemies.forEach((e) => { if (!e.dead) e.hp = Math.min(e.hp, 4); }); });
      }
    }
    await sleep(3000);
    const seen = [];
    for (const P of tabs) seen.push(await P.evaluate(() => window.__seen));
    const names = ['host', 'guest1', 'guest2'];
    const bosses = await H.evaluate(() => window.STS_APP.sess.run().bosses);
    check(bosses >= 1, 'the party defeated the Act I Boss (' + bosses + ')');
    seen.forEach((s, i) => {
      check(!!s['nl-boss'] && Object.keys(s).some((k) => /^text:.*第1幕ボス/.test(k)), names[i] + ': Boss entrance 「第1幕 ボス」');
      check(!!s['fxt-num'], names[i] + ': damage numbers');
      check(!!s['nl-flash'], names[i] + ': the last blow flashes');
      check(!!s['nl-bossdown'] || !!s['nl-shard'], names[i] + ': the Boss falls (shards or 「ボス撃破」)');
    });
    if (SHOTS) for (let i = 0; i < 3; i++) await tabs[i].screenshot({ path: path.join(SHOTS, 'coop-' + names[i] + '-after.png') });
  } catch (e) {
    check(false, 'exception: ' + (e && e.stack || e));
  }
  check(!errs.length, 'no page errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
  await browser.close();
  server.kill();
  if (failures.length) { console.log(failures.length + ' failure(s)'); process.exit(1); }
  console.log('スレイザスパイア next-level co-op presentation check passed.');
})();
