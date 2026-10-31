/* スレイザスパイア: several players choosing the same character in online co-op (Chromium, Playwright).
     node tools/ibara-same-character-browser-check.cjs [--shots DIR]
   1. Normal adventure: a host and two guests in three tabs (?net=local) all choose the Defect. While the last
      player is still choosing, the character already chosen by the others stays selectable and shows who chose it.
      The adventure starts with three Defects; every tab shows its own seat, and the guests follow the host.
   2. Downfall adventure: a host and a guest both choose the Slime Boss; the Boss candidates exclude it. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* next */ } }
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }
const root = path.join(__dirname, '..');
const PORT = 8797, BASE = 'http://localhost:' + PORT + '/ibara/';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(ctx, tag, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
  return p;
}
/* One legal tap: answer the open prompt, pick a target, move on the map, play a card or end the turn. */
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
  if (ans.length) { const next = ans.find((b) => /第\d幕へ進む/.test(b.textContent)); (next || ans[Math.floor(Math.random() * Math.min(ans.length, 3))]).click(); return where + ':answer'; }
  const node = q('[data-a="node"]');
  if (node.length) { node[Math.floor(Math.random() * node.length)].dispatchEvent(new MouseEvent('click', { bubbles: true })); return where + ':move'; }
  const cards = q('.hand .card').filter((c) => !c.classList.contains('no'));
  if (cards.length && Math.random() < 0.88) { const c = cards[Math.floor(Math.random() * cards.length)]; c.click(); c.click(); return where + ':card'; }
  const end = document.querySelector('[data-a="end"]');
  if (end && !end.disabled) { end.click(); return where + ':end'; }
  return where + ':wait';
}
async function openRoom(ctx, errs, names, adv) {
  const pages = [];
  for (let i = 0; i < names.length; i++) pages.push(await newPage(ctx, i ? 'guest' + i : 'host', errs));
  for (const P of pages) {
    await P.goto(BASE + '?net=local', { waitUntil: 'load' });
    await P.evaluate(() => { localStorage.setItem('ibara.bg.prefs.v1', JSON.stringify({ anim: 0 })); });
    await P.reload({ waitUntil: 'load' });
  }
  const H = pages[0];
  await H.click('text=オンライン協力'); await H.fill('#nm', names[0]); await H.click('text=部屋を作る'); await sleep(400);
  const code = await H.evaluate(() => window.STS_APP.coop.code);
  for (let i = 1; i < pages.length; i++) {
    const P = pages[i];
    await P.click('text=オンライン協力'); await P.fill('#nm', names[i]);
    await P.fill('#code', code); await sleep(60); await P.click('button:has-text("参加")'); await sleep(500);
  }
  if (adv === 'downfall') { await H.click('[data-a=adv][data-v=downfall]'); await sleep(100); }
  await H.click('[data-a=startcoop]');
  for (const P of pages) await P.waitForSelector('[data-a=pickonlinech]');
  return { pages, code };
}

(async () => {
  await sleep(600);
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const errs = [];
  try {
    /* ---------------- normal adventure: three Defects ---------------- */
    const { pages } = await openRoom(ctx, errs, ['ホスト', 'ゲスト1', 'ゲスト2']);
    const [H, G1, G2] = pages;
    await H.click('[data-a=pickonlinech][data-v=B]'); await sleep(250);
    await G1.click('[data-a=pickonlinech][data-v=B]'); await sleep(300);
    const before = await G2.evaluate(() => {
      const b = document.querySelector('[data-a=pickonlinech][data-v=B]');
      return { disabled: b.disabled, picked: b.classList.contains('picked'), taken: b.classList.contains('taken'), label: b.querySelector('.cn span').textContent,
        status: document.querySelector('.selection-status').textContent, note: document.querySelector('.character-selection .note').textContent };
    });
    check(!before.disabled && before.picked && !before.taken, 'a character two players already chose is still selectable for the third (' + JSON.stringify(before) + ')');
    check(/ホスト・ゲスト1が選択済み/.test(before.label), 'the button shows who chose it: ' + before.label);
    check(/同じキャラクター/.test(before.note) && !/空いている/.test(before.status), 'the page says the same character may be chosen');
    if (SHOTS) await G2.screenshot({ path: path.join(SHOTS, 'same-character-selection.png') });
    await G2.click('[data-a=pickonlinech][data-v=B]');
    await H.waitForFunction(() => window.STS_APP.screen === 'game', null, { timeout: 8000 });
    for (const P of [G1, G2]) await P.waitForFunction(() => window.STS_APP.screen === 'game' && window.STS_APP.sess && window.STS_APP.sess.run(), null, { timeout: 8000 });
    await sleep(500);
    const chs = await H.evaluate(() => window.STS_APP.sess.run().players.map((p) => p.ch + ':' + p.name));
    check(chs.join(',') === 'B:ホスト,B:ゲスト1,B:ゲスト2', 'the adventure starts with three Defects: ' + chs.join(', '));
    await H.evaluate(() => { const r = window.STS_APP.sess.run(); r.players.forEach((x) => { x.hp = x.maxHp = 400; }); });
    let heroesSeen = false;
    for (let i = 0; i < 240; i++) {
      for (const P of pages) await P.evaluate(botStep);
      if (!heroesSeen) {
        const v = await G1.evaluate(() => Array.from(document.querySelectorAll('.hero[data-pi]'), (h) => h.dataset.ch + h.dataset.pi + (h.classList.contains('me') ? '*' : '')).join(','));
        if (v) {
          heroesSeen = true;
          check(v === 'B0,B1*,B2', 'battle: three Defect heroes, the guest\'s own seat marked (' + v + ')');
          if (SHOTS) await G1.screenshot({ path: path.join(SHOTS, 'same-character-battle.png') });
        }
      }
      await sleep(40);
    }
    check(heroesSeen, 'battle screen reached');
    await sleep(400);
    const hs = await H.evaluate(() => { const r = window.STS_APP.sess.run(); return { pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(','), phase: r.phase }; });
    const g2 = await G2.evaluate(() => { const r = window.STS_APP.sess && window.STS_APP.sess.run(); return r ? { pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(','), me: window.STS_APP.me } : null; });
    check(!!hs.pos && hs.phase !== 'over', 'the party moved on the map (' + hs.pos + ', ' + hs.phase + ')');
    check(g2 && g2.me === 2 && g2.pos === hs.pos && g2.gold === hs.gold && g2.deck === hs.deck, 'guest 2 follows the host (decks ' + hs.deck + ')');
    for (const P of pages) await P.close();

    /* ---------------- Downfall adventure: two Slime Bosses ---------------- */
    const room2 = await openRoom(ctx, errs, ['ホスト', 'ゲスト'], 'downfall');
    for (const P of room2.pages) { await P.click('[data-a=pickonlinech][data-v=S]'); await sleep(250); }
    await room2.pages[0].waitForFunction(() => window.STS_APP.screen === 'game', null, { timeout: 8000 });
    await sleep(400);
    const df = await room2.pages[0].evaluate(() => { const r = window.STS_APP.sess.run(); return { chs: r.players.map((p) => p.ch).join(','), adv: r.adv, pool: r.df && r.df.pool.join(',') }; });
    check(df.adv === 'downfall' && df.chs === 'S,S', 'Downfall adventure with two Slime Bosses (' + df.chs + ')');
    check(!!df.pool && df.pool.split(',').indexOf('S') < 0, 'Boss candidates exclude the chosen character: ' + df.pool);
  } catch (e) {
    check(false, 'exception: ' + (e && e.stack || e));
  }
  check(!errs.length, 'no page errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
  await browser.close();
  server.kill();
  if (failures.length) { console.log(failures.length + ' failure(s)'); process.exit(1); }
  console.log('スレイザスパイア same-character co-op check passed.');
})();
