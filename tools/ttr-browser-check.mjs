// チケット・トゥ・ライド: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/ttr-browser-check.mjs              a whole solo game on a phone held upright, a short one sideways, then online
//   node tools/ttr-browser-check.mjs --shots DIR  also save screenshots into DIR
//   TTR_ONLY=portrait,landscape,online           run only some of the parts
// Moves are made through the interface the way a player would: tapping the face-up cards, the deck, the ticket pile and
// the routes on the 3D board, choosing tickets in the dialog and paying in the route panel (the CPU picks which move).
// Needs Playwright (npm i -g playwright) and Chromium. TTR_CHROMIUM=/path/to/chrome overrides the browser.
// TTR_VENDOR=/path/to/node_modules serves three.js / PeerJS from local copies instead of the CDN (offline check).
// TTR_GL="--use-gl=..." overrides the WebGL flags (the default software path is the one that renders this page headless).
// The online part runs over BroadcastChannel (?net=local), so it needs no PeerJS server.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
  try { playwright = require(p); break; } catch (e) { /* try next */ }
}
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8796, BASE = `http://localhost:${PORT}/ticket-to-ride/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.TTR_VENDOR || '';
const ONLY = (process.env.TTR_ONLY || 'portrait,landscape,online').split(',');
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const proxy = process.env.HTTPS_PROXY && !VENDOR ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prep(ctx) {
  await ctx.route(/assets\/music\.js/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/javascript' }));
  if (!VENDOR) return;
  await ctx.route(/three@0\.160\.0\/build\/three\.module\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'three/build/three.module.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/peerjs@1\.5\.4\/dist\/peerjs\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'peerjs/dist/peerjs.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
}
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 120000 }); }
const idle = (page) => page.waitForFunction(() => { const a = window.__ttr; return a && a.view && !a.presenting && !(a.match && a.match.waiting) && !a.scene.busy; }, null, { timeout: 120000, polling: 100 });
async function tapStage(page, x, y) {
  const r = await page.evaluate(() => { const b = document.querySelector('#stage').getBoundingClientRect(); return [b.x, b.y]; });
  await page.touchscreen.tap(r[0] + x, r[1] + y);
  await sleep(60);
}
const cpuMove = (page) => page.evaluate(() => window.TTR_AI.choose(window.__ttr.view, 2, window.TTR_ENG.mulberry32((Math.random() * 1e9) | 0)));

/* one action through the interface; returns its kind */
async function uiMove(page, stats) {
  const st = await page.evaluate(() => { const v = window.__ttr.view; return { phase: v.phase, turn: v.turn, me: v.me, step: v.step && v.step.k, offer: v.offer, layer: !!document.querySelector('#layer .sheet') }; });
  if (st.phase === 'over') return 'over';
  if (st.offer && (st.phase === 'setup' || st.step === 'tix')) {
    if (!st.layer) { await page.evaluate(() => window.__ttr.onTrayTap({ kind: 'tickets' })); await sleep(150); }
    const a = await cpuMove(page);
    for (const t of a.keep) { await page.locator('.tk[data-t="' + t + '"]').click({ noWaitAfter: true }); await sleep(60); }
    await page.locator('#tkOk').click({ noWaitAfter: true });
    stats.keep++;
    return 'keep';
  }
  if (st.phase !== 'play' || st.turn !== st.me) return 'wait';
  const a = await cpuMove(page);
  if (a.t === 'card') {
    const p = await page.evaluate((i) => { const A = window.__ttr.scene.anchors(); const q = i === 5 ? A.deck : A.face[i]; return [q.x, q.y]; }, a.i);
    await tapStage(page, p[0], p[1]);
    if (await page.evaluate(() => window.__ttr.ui.confirm === 'loco')) await page.locator('#actions button', { hasText: '取る' }).click({ noWaitAfter: true });
    stats.cards++;
  } else if (a.t === 'claim') {
    // bring the route into view and tap the middle of it on the 3D board
    await page.evaluate((r) => { const s = window.__ttr.scene, m = s.routeMid(r); return s.focus(m.x, m.z, s.zoom); }, a.r);
    await sleep(80);
    const sp = await page.evaluate((r) => { const s = window.__ttr.scene, ss = s.spacesOf(r), k = Math.floor(ss.length / 2); return s.project(ss[k].x, 0.05, ss[k].z); }, a.r);
    await tapStage(page, sp[0], sp[1]);
    let sel = await page.evaluate(() => window.__ttr.ui.sel);
    const R = await page.evaluate((r) => window.TTR_MAP.routes[r], a.r);
    if (sel !== a.r && !(R.twin >= 0 && sel === R.twin)) { stats.missTaps++; await page.evaluate((r) => window.__ttr.onBoardTap({ kind: 'route', r }), a.r); sel = a.r; }
    if (sel !== a.r) await page.evaluate((r) => window.__ttr.onBoardTap({ kind: 'route', r }), a.r);
    // the payment the CPU wanted, if the panel offers a choice
    const idx = await page.evaluate((a) => { const v = window.__ttr.view, R = window.TTR_MAP.routes[a.r], pays = window.TTR_ENG.payments(v.hand, R), list = [], seen = {}; pays.forEach((p) => { if (p.c === 8) { list.push(p); return; } if (seen[p.c]) return; seen[p.c] = true; list.push(p); }); list.sort((x, y) => x.k - y.k || v.hand[y.c] - v.hand[x.c]); return list.findIndex((p) => p.c === a.c && p.k === a.k); }, a);
    const pays = page.locator('#panel .btn.pay');
    if (idx > 0 && await pays.count() > idx) await pays.nth(idx).click({ noWaitAfter: true });
    await page.locator('#pnGo').click({ noWaitAfter: true });
    stats.claims++;
  } else if (a.t === 'tickets') {
    const p = await page.evaluate(() => { const A = window.__ttr.scene.anchors(); return [A.tix.x, A.tix.y]; });
    await tapStage(page, p[0], p[1]);
    await page.locator('#actions button', { hasText: '引く' }).click({ noWaitAfter: true });
    stats.tickets++;
  } else {
    await page.locator('#actions button', { hasText: 'パス' }).click({ noWaitAfter: true });
    stats.passes++;
  }
  return a.t;
}

async function soloGame(browser, name, vp, opts) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true, proxy });
  await prep(ctx);
  const page = await ctx.newPage();
  const errors = [];
  watchErrors(page, name, errors);
  await page.addInitScript((n) => { localStorage.setItem('ttr.count', String(n)); localStorage.setItem('ttr.level', '2'); localStorage.setItem('ttr.seenTips', 'true'); }, opts.n);
  await page.goto(BASE + '?test=1&still=1&q=low&speed=' + (opts.speed || 4));
  await page.waitForFunction(() => window.__ttr && window.__ttr.scene, null, { timeout: 60000 });
  await shot(page, name + '-title');
  await page.click('#goSolo'); await page.click('#soloStart');
  await page.waitForSelector('.tk', { timeout: 20000 });
  await shot(page, name + '-tickets');
  const stats = { keep: 0, cards: 0, claims: 0, tickets: 0, passes: 0, missTaps: 0 };
  let moves = 0;
  for (let i = 0; i < 4000 && moves < opts.moves; i++) {
    await idle(page);
    const k = await uiMove(page, stats);
    if (k === 'over') break;
    if (k === 'wait') { await sleep(120); continue; }
    moves++;
    if (moves === 14) { await idle(page); await shot(page, name + '-play'); }
  }
  await idle(page);
  const v = await page.evaluate(() => { const v = window.__ttr.view; return { phase: v.phase, rows: v.result && v.result.rows.map((r) => ({ total: r.total, route: r.route, plus: r.plus, minus: r.minus, bonus: r.bonus })), trains: v.pl.map((q) => q.trains), pts: v.pl.map((q) => q.pts) }; });
  if (opts.full) {
    await page.waitForSelector('.res', { timeout: 60000 });
    await shot(page, name + '-result');
    check(v.phase === 'over', name + ': the game was played to the end through the interface');
    check(v.rows && v.rows.every((r) => r.total === r.route + r.plus - r.minus + r.bonus), name + ': final scores add up');
    check(v.rows && v.rows.some((r) => r.bonus === 10), name + ': someone got the longest path bonus');
    check(Math.min(...v.trains) <= 2, name + ': the game ended after someone ran down to 2 trains or fewer');
    const shown = await page.evaluate(() => document.querySelectorAll('.res .rs').length);
    check(shown === opts.n, name + ': the result sheet lists every player');
  } else check(v.phase === 'play' && stats.claims + stats.cards > 0, name + ': moves made through the interface (' + JSON.stringify(stats) + ')');
  check(stats.claims > 0, name + ': routes claimed by tapping the board (' + stats.claims + ', ' + stats.missTaps + ' taps needed help)');
  check(stats.missTaps <= Math.max(1, stats.claims / 5), name + ': tapping a route selects it');
  check(!errors.length, name + ': no errors in the page' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
  console.log('     ' + name + ' ' + JSON.stringify(stats) + (v.rows ? ' totals ' + v.rows.map((r) => r.total).join('/') : ''));
  await ctx.close();
}

async function onlineGame(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, proxy });
  await prep(ctx);
  const errors = [];
  async function open(tag) {
    const page = await ctx.newPage();
    watchErrors(page, tag, errors);
    await page.addInitScript(() => { localStorage.setItem('ttr.seenTips', 'true'); });
    await page.goto(BASE + '?test=1&still=1&q=low&net=local&speed=4');
    await page.waitForFunction(() => window.__ttr && window.__ttr.scene, null, { timeout: 60000 });
    return page;
  }
  const host = await open('host'), guest = await open('guest');
  await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
  await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent), null, { timeout: 20000 });
  const code = await host.textContent('#lobCode');
  await guest.click('#goOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.click('#onJoin');
  await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 2, null, { timeout: 20000 });
  await host.click('#lobAddCpu');
  await guest.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 3, null, { timeout: 20000 });
  check(true, 'online: the guest joined room ' + code + ' and sees the CPU seat');
  await host.click('#lobStart');
  await guest.waitForFunction(() => window.__ttr.view && window.__ttr.view.phase === 'setup', null, { timeout: 20000 });
  const stats = { keep: 0, cards: 0, claims: 0, tickets: 0, passes: 0, missTaps: 0 };
  let moves = 0;
  for (let i = 0; i < 3000 && moves < 36; i++) {
    let acted = false;
    for (const page of [host, guest]) {
      const ready = await page.evaluate(() => { const a = window.__ttr; return !!(a.view && !a.presenting && !(a.match && a.match.waiting) && !a.scene.busy); });
      if (!ready) continue;
      const k = await uiMove(page, stats);
      if (k !== 'wait' && k !== 'over') { moves++; acted = true; }
    }
    if (!acted) await sleep(150);
    if (await host.evaluate(() => window.__ttr.view.phase === 'over')) break;
  }
  await idle(host); await idle(guest);
  await sleep(500);
  const look = (page) => page.evaluate(() => { const v = window.__ttr.view; return JSON.stringify({ owner: v.owner, pts: v.pl.map((q) => q.pts), trains: v.pl.map((q) => q.trains), cards: v.pl.map((q) => q.cards), face: v.face, deck: v.deckN }); });
  const hv = await look(host), gv = await look(guest);
  check(hv === gv, 'online: host and guest see the same board, scores, cards and face-up row after ' + moves + ' moves');
  check(stats.claims > 0, 'online: routes were claimed from both screens (' + JSON.stringify(stats) + ')');
  await shot(guest, 'online-guest');
  check(!errors.length, 'online: no errors in the pages' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  await sleep(500);
  const launch = { args: (process.env.TTR_GL || '--use-gl=swiftshader --ignore-gpu-blocklist').split(' ') };
  if (process.env.TTR_CHROMIUM) launch.executablePath = process.env.TTR_CHROMIUM;
  const browser = await playwright.chromium.launch(launch);
  try {
    if (ONLY.includes('portrait')) await soloGame(browser, 'portrait', { width: 390, height: 844 }, { n: 3, moves: 5000, full: true, speed: 5 });
    if (ONLY.includes('landscape')) await soloGame(browser, 'landscape', { width: 844, height: 390 }, { n: 5, moves: 18, speed: 5 });
    if (ONLY.includes('online')) await onlineGame(browser);
  } catch (e) { check(false, 'unexpected: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  await browser.close();
  server.kill();
  console.log(failures.length ? failures.length + ' FAILED' : 'all browser checks passed');
  process.exit(failures.length ? 1 : 0);
})();
