/* スレイザスパイア: Downfall end-to-end check in Chromium (Playwright).
     node tools/ibara-downfall-browser-check.cjs [--shots DIR]
   1. Character select with every character on a phone (portrait, landscape) and a desktop: no sideways scrolling,
      every portrait reachable, the adventure picker is separate from the difficulty.
   2. Solo Slime Boss: Act I by tapping; Slimes are shown next to the hero, their sheet opens; then 「続きから」.
   3. Online: Slime Boss host with base-game guests (?net=local); guests see the host's Slimes and the same state.
   Fails on page errors and on missing images. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* next */ } }
if (!playwright) { console.error('Playwright was not found.'); process.exit(2); }
const root = path.join(__dirname, '..');
const PORT = 8796, BASE = 'http://localhost:' + PORT + '/ibara/';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const missing = new Set();
async function newPage(ctx, tag, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
  p.on('response', (r) => { if (r.status() === 404 && /\/ibara\//.test(r.url())) missing.add(r.url().replace(/\?.*$/, '').replace(/.*\/ibara\//, '')); });
  return p;
}
function botStep() {
  const A = window.STS_APP, q = (s) => Array.from(document.querySelectorAll(s)), vis = (el) => el && el.offsetParent !== null;
  const run = A.sess && A.sess.run();
  if (!run) return 'norun';
  if (run.phase === 'over') return 'over';
  const where = run.combat ? 'combat' : run.room ? 'room-' + run.room.t : run.phase;
  const msel = q('[data-a="msel"]');
  if (msel.length) { const ok = document.querySelector('[data-a="mselok"]'); if (ok && !ok.disabled) { ok.click(); return where + ':pick'; } const c = msel.find((x) => !x.classList.contains('chosen')); if (c) { c.click(); return where + ':pick'; } }
  const pick = q('[data-a="rewardpick"]');
  if (pick.length) { const ok = document.querySelector('[data-a="rewardconfirm"]'); if (ok && !ok.disabled) { ok.click(); return where + ':reward'; } pick[Math.floor(Math.random() * pick.length)].click(); return where + ':reward'; }
  const t = q('.foe.target, .band.rowtarget, .hero.target');
  if (t.length) { t[0].click(); return where + ':target'; }
  const ans = q('[data-a="ans"]').filter(vis);
  if (ans.length) {
    const next = ans.find((b) => /第\d幕へ進む/.test(b.textContent));
    (next || ans[Math.floor(Math.random() * Math.min(ans.length, 3))]).click();
    return where + ':answer';
  }
  const node = q('[data-a="node"]');
  if (node.length) { node[Math.floor(Math.random() * node.length)].dispatchEvent(new MouseEvent('click', { bubbles: true })); return where + ':move'; }
  const cards = q('.hand .card').filter((c) => !c.classList.contains('no'));
  if (cards.length && Math.random() < 0.88) { const c = cards[Math.floor(Math.random() * cards.length)]; c.click(); c.click(); return where + ':card'; }
  const end = document.querySelector('[data-a="end"]');
  if (end && !end.disabled) { end.click(); return where + ':end'; }
  return where + ':wait';
}
async function setupScreen(browser, vp, name, errs) {
  const ctx = await browser.newContext(Object.assign({ deviceScaleFactor: 1 }, vp));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const p = await newPage(ctx, name, errs);
  await p.goto(BASE, { waitUntil: 'load' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ibara.bg.prefs.v1', JSON.stringify({ anim: 0 })); });
  await p.reload({ waitUntil: 'load' });
  await p.click('text=ひとりで遊ぶ');
  await sleep(150);
  const info = await p.evaluate(() => {
    const D = window.STS.DATA, btns = Array.from(document.querySelectorAll('.charbtn'));
    const se = document.querySelector('.page') || document.scrollingElement;
    const W = window.innerWidth;
    return { order: D.CHAR_ORDER.join(''), shown: btns.map((b) => b.getAttribute('data-v')).join(''), overflowX: se.scrollWidth > se.clientWidth + 1 || document.documentElement.scrollWidth > W + 1,
      outside: btns.filter((b) => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > W + 1; }).length,
      adv: Array.from(document.querySelectorAll('.adv-picker [data-a="adv"]')).map((b) => b.textContent).join('|'),
      mode: Array.from(document.querySelectorAll('.mode-picker [data-a="mode"]')).map((b) => b.textContent).join('|'),
      gridH: Math.round((document.querySelector('.chars') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height) };
  });
  check(info.shown === info.order, name + ': every character is offered (' + info.shown + ')');
  check(!info.overflowX && !info.outside, name + ': no sideways scrolling on the character screen');
  check(/^通常の冒険\|Downfallの冒険/.test(info.adv) && /通常/.test(info.mode), name + ': adventure picker beside the difficulty (' + info.adv + ' / ' + info.mode + ')');
  const ready = await p.evaluate(() => window.STS.DF.adventureReady());
  if (!ready) {
    const off = await p.evaluate(() => { const b = document.querySelector('[data-a="adv"][data-v="downfall"]'); return !!(b && b.disabled); });
    check(off, name + ': the Downfall adventure stays disabled until all of its content exists');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'select-' + name + '.png'), fullPage: false });
    await ctx.close();
    return;
  }
  check(info.gridH <= vp.viewport.height * 0.8, name + ': character grid fits the screen (' + info.gridH + 'px)');
  await p.click('[data-a="adv"][data-v="downfall"]');
  await sleep(120);
  const adv = await p.evaluate(() => ({ adv: window.STS_APP.setup.adv, note: (document.querySelector('.adv-picker .note') || {}).textContent || '' }));
  check(adv.adv === 'downfall' && /慣れた方向け/.test(adv.note) && !/難しい|高難度|ハード/.test(adv.note), name + ': Downfall adventure described for experienced players');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'select-' + name + '-downfall.png'), fullPage: false });
  await p.click('[data-a="adv"][data-v="normal"]');
  await sleep(80);
  await p.click('.charbtn[data-v="S"]');
  await sleep(120);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'select-' + name + '.png'), fullPage: false });
  await ctx.close();
}

(async () => {
  await sleep(600);
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    await setupScreen(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 'phone', errs);
    await setupScreen(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, 'phone-landscape', errs);
    await setupScreen(browser, { viewport: { width: 1280, height: 800 } }, 'desktop', errs);

    /* ---------------- solo Slime Boss ---------------- */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
    const p = await newPage(ctx, 'solo', errs);
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ibara.bg.prefs.v1', JSON.stringify({ anim: 0 })); });
    await p.reload({ waitUntil: 'load' });
    await p.click('text=ひとりで遊ぶ');
    await p.click('.charbtn[data-v="S"]');
    await p.click('text=冒険を始める');
    await p.evaluate(() => { const r = window.STS_APP.sess.run(); r.players[0].hp = r.players[0].maxHp = 400; });
    const seen = {}, trail = [];
    let slimeShot = false, sheet = false, maxSlimes = 0;
    for (let i = 0; i < 1400; i++) {
      await sleep(20);
      const a = await p.evaluate(botStep);
      trail.push(a); if (trail.length > 24) trail.shift();
      seen[a.split(':')[0]] = true;
      if (a === 'over') break;
      const st = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, n: document.querySelectorAll('.hero .dfslime').length, combat: !!r.combat }; });
      maxSlimes = Math.max(maxSlimes, st.n);
      if (st.n && !sheet && !(await p.evaluate(() => !!document.querySelector('.sheet-back')))) {
        await p.click('.hero .dfslime');
        await sleep(80);
        const txt = await p.evaluate(() => (document.querySelector('.info-sheet') || {}).textContent || '');
        sheet = /スライム/.test(txt) && /Lv1/.test(txt);
        if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'solo-slime-sheet.png') });
        await p.evaluate(() => { const b = document.querySelector('[data-a="close"]'); if (b) b.click(); });
      }
      if (st.n >= 2 && !slimeShot && SHOTS) { slimeShot = true; await p.screenshot({ path: path.join(SHOTS, 'solo-slimes.png') }); }
      if (st.act >= 2) break;
    }
    const solo = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, bosses: r.bosses, phase: r.phase, result: r.result, deck: r.players[0].deck.length }; });
    check(solo.bosses >= 1, 'solo: Slime Boss defeats the Act I boss by tapping (act ' + solo.act + ', bosses ' + solo.bosses + ')');
    if (solo.bosses < 1) console.log('     last taps: ' + trail.join(' '));
    check(maxSlimes >= 1, 'solo: Slimes are shown beside the hero (max ' + maxSlimes + ')');
    check(sheet, 'solo: tapping a Slime opens its level sheet');
    await p.reload({ waitUntil: 'load' });
    // The title is rendered on requestAnimationFrame after load; inspect saves only once it is visible.
    await p.waitForSelector('[data-a="go"][data-v="solo"]');
    const resume = await p.$('text=続きから');
    check(!!resume, 'solo: 「続きから」 offered after a reload');
    if (resume) {
      await resume.click(); await sleep(400);
      const back = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, bosses: r.bosses, ch: r.players[0].ch, adv: window.STS.DF.adventureOf(r) }; });
      check(back.bosses === solo.bosses && back.ch === 'S' && back.adv === 'normal', 'solo: resumed the Slime Boss adventure');
    }
    await p.close();

    /* ---------------- online: Slime Boss host, base-game guests ---------------- */
    const H = await newPage(ctx, 'host', errs), G1 = await newPage(ctx, 'guest1', errs), G2 = await newPage(ctx, 'guest2', errs);
    for (const P of [H, G1, G2]) await P.goto(BASE + '?net=local', { waitUntil: 'load' });
    await H.click('text=オンライン協力'); await H.fill('#nm', 'ホスト'); await H.click('text=部屋を作る'); await sleep(400);
    const code = await H.evaluate(() => window.STS_APP.coop.code);
    for (const [P, nm] of [[G1, 'ゲスト1'], [G2, 'ゲスト2']]) {
      await P.click('text=オンライン協力'); await P.fill('#nm', nm);
      await P.fill('#code', code); await sleep(60); await P.click('button:has-text("参加")'); await sleep(500);
    }
    const hostAdv = await H.evaluate(() => document.querySelectorAll('.adv-picker [data-a="adv"]').length);
    check(hostAdv === 2, 'online: the host chooses the adventure in the room');
    const gset = await G1.evaluate(() => (document.querySelector('.adv-picker .note') || {}).textContent || '');
    check(/通常の冒険/.test(gset), 'online: guests see the adventure chosen by the host');
    await H.click('[data-a=startcoop]');
    for (const [P, ch] of [[H, 'S'], [G1, 'R'], [G2, 'W']]) { await P.waitForSelector('[data-a=pickonlinech]'); }
    const eight = await G2.evaluate(() => ({ n: document.querySelectorAll('[data-a=pickonlinech]').length, all: window.STS.DATA.CHAR_ORDER.length, grid: !!document.querySelector('.character-selection .chars.chars8'), adv: ((document.querySelector('.character-selection .adv-picker .note') || {}).textContent || '') }));
    check(eight.n === eight.all && eight.all >= 5 && eight.grid && /通常の冒険/.test(eight.adv), 'online: every registered character (' + eight.n + ') and the adventure on the character screen');
    for (const [P, ch] of [[H, 'S'], [G1, 'R'], [G2, 'W']]) await P.click('[data-a=pickonlinech][data-v=' + ch + ']');
    await H.waitForFunction(() => window.STS_APP.screen === 'game'); await sleep(500);
    const roster = await H.evaluate(() => window.STS_APP.sess.run().players.map((r) => r.name + ':' + r.ch));
    check(roster.length === 3 && roster.includes('ホスト:S') && roster.includes('ゲスト1:R') && roster.includes('ゲスト2:W'), 'online: mixed party ' + roster.join(', '));
    await H.evaluate(() => { const r = window.STS_APP.sess.run(); r.players.forEach((x) => { x.hp = x.maxHp = 400; }); });
    let guestSlimes = 0;
    for (let i = 0; i < 300; i++) {
      for (const P of [H, G1, G2]) await P.evaluate(botStep);
      guestSlimes = Math.max(guestSlimes, await G1.evaluate(() => document.querySelectorAll('.hero[data-ch="S"] .dfslime').length));
      await sleep(40);
    }
    await sleep(400);
    const hs = await H.evaluate(() => { const r = window.STS_APP.sess.run(); return { pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(','), adv: window.STS.DF.adventureOf(r) }; });
    const gs = await G1.evaluate(() => { const r = window.STS_APP.sess && window.STS_APP.sess.run(); return r ? { pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(','), adv: window.STS.DF.adventureOf(r) } : null; });
    check(!!hs.pos && gs && gs.pos === hs.pos && gs.gold === hs.gold && gs.deck === hs.deck && gs.adv === hs.adv, 'online: guest view matches the host (' + (gs && gs.pos) + ')');
    check(guestSlimes >= 1, 'online: guests see the Slime Boss Slimes');
    if (SHOTS) { await H.screenshot({ path: path.join(SHOTS, 'online-host.png') }); await G1.screenshot({ path: path.join(SHOTS, 'online-guest.png') }); }
  } catch (e) {
    check(false, 'exception: ' + (e && e.stack || e));
  }
  check(!missing.size, 'no missing images' + (missing.size ? ': ' + Array.from(missing).slice(0, 12).join(', ') : ''));
  check(!errs.length, 'no page errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
  await browser.close();
  server.kill();
  if (failures.length) { console.log(failures.length + ' failure(s)'); process.exit(1); }
  console.log('Downfall browser check passed.');
})();
