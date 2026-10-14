// 80%: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/eighty-browser-check.mjs              solo game on desktop + phones, then an online game between two tabs
//   node tools/eighty-browser-check.mjs --shots DIR  also save screenshots into DIR
// Needs Playwright (npm i -g playwright) and Chromium. EIGHTY_CHROMIUM=/path/to/chrome overrides the browser.
// EIGHTY_VENDOR=/path/to/node_modules serves three.js / PeerJS from local copies instead of the CDN (offline check).
// The online part runs over BroadcastChannel (?net=local), so it needs no PeerJS server.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
  try { playwright = require(p); break; } catch (e) { /* try next */ }
}
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8793, BASE = `http://localhost:${PORT}/80percent/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.EIGHTY_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const proxy = process.env.HTTPS_PROXY && !VENDOR ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prep(ctx) {
  if (!VENDOR) return;
  await ctx.route(/three@0\.160\.0\/build\/three\.module\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'three/build/three.module.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/peerjs@1\.5\.4\/dist\/peerjs\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'peerjs/dist/peerjs.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
}
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const waitFor = (page, fn, arg, ms = 120000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
const st = (page) => page.evaluate(() => { const m = window.__eighty.match; return m && m.s ? JSON.parse(JSON.stringify(m.s)) : null; });
const hudText = (page) => page.evaluate(() => [0, 1].map((i) => [document.getElementById('hudCash' + i).dataset.v, document.getElementById('hudNet' + i).dataset.v]));

async function playRound(page, k, atkJ) {
  await waitFor(page, () => { const a = window.__eighty; return a && a.panel.mode != null || (a.match && a.match.over); });
  const mode = await page.evaluate(() => window.__eighty.panel.mode);
  if (mode === 'borrow') { await page.click('#btnBorrow'); return 'borrow'; }
  if (mode !== 'decide') return mode;
  await page.evaluate(([k, j]) => { const p = window.__eighty.panel; p.setCount(k); if (!document.getElementById('secAtk').hidden) { p.atkJ = j; p.render(); } }, [k, atkJ]);
  await page.click('#btnGo');
  return 'decide';
}

async function soloDesktop(browser, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await prep(ctx);
  const page = await ctx.newPage(); watchErrors(page, 'solo', errs);
  await page.goto(BASE + '?test=1&speed=8');
  await waitFor(page, () => window.__eighty && !document.getElementById('title').hidden, null, 60000);
  check(true, 'title screen is up');
  await page.waitForTimeout(800); await shot(page, 'title-desktop');
  await page.click('#btnCpu'); await page.click('#cpuOpp button[data-v="calc"]'); await page.click('#cpuRounds button[data-v="5"]');
  // round 1: we stake 30% and win; the CPU's bet loses → check the numbers
  await page.evaluate(() => window.__eighty.setRolls([0.1, 0.95, 0.5, 0.5]));
  await page.click('#btnCpuStart');
  await waitFor(page, () => window.__eighty.panel.mode === 'decide', null, 60000);
  await shot(page, 'start-desktop');
  // tap a pile on the table (the middle of the front row) to bet it
  const box = await page.locator('#view canvas').boundingBox();
  const at = await page.evaluate(() => { const a = window.__eighty, sc = a.scene, T = sc.THREE; const v = new T.Vector3(0, 0.765, 0.475).project(sc.camera); const c = document.querySelector('#view canvas'); return [(v.x + 1) / 2 * c.clientWidth, (1 - v.y) / 2 * c.clientHeight]; });
  await page.mouse.click(box.x + at[0], box.y + at[1]);
  await page.waitForTimeout(300);
  const tapped = await page.evaluate(() => [...window.__eighty.panel.sel]);
  check(tapped.length === 1 && tapped[0] === 2, `tapping the middle front pile selects it (${JSON.stringify(tapped)})`);
  await page.evaluate(() => window.__eighty.panel.setCount(3));
  check((await page.textContent('#betAmt')).includes('300') && (await page.textContent('#betPct')).includes('30'), 'slider shows ¥300 / 30%');
  await page.waitForTimeout(500); await shot(page, 'bet-30-desktop');
  const before = await st(page);
  await page.click('#btnGo');
  await waitFor(page, () => { const m = window.__eighty.match; return m && m.s && m.s.rnd === 2 && window.__eighty.panel.mode != null; }, null, 60000);
  const after = await st(page);
  const cpuBet = after.last.d[1].bet;
  check(after.P[0].cash === 1300, `win 30%: ¥1,000 → ¥1,300 (got ${after.P[0].cash})`);
  check(after.P[1].cash === before.P[1].cash - cpuBet, `CPU lost its stake ¥${cpuBet}`);
  const hv = await hudText(page);
  check(Number(hv[0][0]) === 1300, 'HUD shows the new cash');
  // force a bust: all-in and lose, then borrow
  await page.evaluate(() => window.__eighty.setRolls([0.99, 0.1, 0.5, 0.5]));
  await page.evaluate(() => window.__eighty.panel.setCount(10));
  await page.click('#btnGo');
  await waitFor(page, () => window.__eighty.panel.mode === 'borrow', null, 60000);
  check(true, 'all-in loss leads to the borrow panel');
  check((await page.textContent('#borrowMax')).includes('1,300'), 'borrow limit is the cash held when the round began');
  await shot(page, 'borrow-desktop');
  await page.click('#btnBorrow');
  await waitFor(page, () => window.__eighty.panel.mode === 'decide', null, 60000);
  const s3 = await st(page);
  check(s3.P[0].cash === 1300 && s3.P[0].debt === 1300, `borrowed ¥1,300 (cash ${s3.P[0].cash}, debt ${s3.P[0].debt})`);
  await page.waitForTimeout(400); await shot(page, 'debt-desktop');
  // play out the rest with random choices
  for (let i = 0; i < 40; i++) {
    const over = await page.evaluate(() => !document.getElementById('result').hidden);
    if (over) break;
    await page.evaluate(() => window.__eighty.setRolls([]));
    await playRound(page, Math.floor(Math.random() * 11), Math.floor(Math.random() * 6));
    await page.waitForTimeout(100);
  }
  await waitFor(page, () => !document.getElementById('result').hidden, null, 240000);
  const fin = await st(page);
  check(fin.ph === 'over' && fin.hist.length === 6, 'a 5-round game reaches the result screen');
  await page.waitForTimeout(400); await shot(page, 'result-desktop');
  await ctx.close();
}

async function phone(browser, errs, w, h, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, isMobile: true });
  await prep(ctx);
  const page = await ctx.newPage(); watchErrors(page, name, errs);
  await page.goto(BASE + '?test=1&speed=8');
  await waitFor(page, () => window.__eighty && !document.getElementById('title').hidden, null, 60000);
  await page.waitForTimeout(600); await shot(page, 'title-' + name);
  await page.tap('#btnCpu'); await page.tap('#btnCpuStart');
  await waitFor(page, () => window.__eighty.panel.mode === 'decide', null, 60000);
  await page.evaluate(() => window.__eighty.panel.setCount(4));
  await page.waitForTimeout(600); await shot(page, 'decide-' + name);
  const fit = await page.evaluate(() => { const p = document.getElementById('panel').getBoundingClientRect(), go = document.getElementById('btnGo').getBoundingClientRect(); return go.bottom <= innerHeight + 1 && p.right <= innerWidth + 1; });
  check(fit, `${name}: the 勝負 button is on screen`);
  await page.evaluate(() => window.__eighty.setRolls([0.1, 0.1, 0.5, 0.5]));
  await page.tap('#btnGo');
  await waitFor(page, () => { const m = window.__eighty.match; return m.s.rnd === 2 && window.__eighty.panel.mode != null; }, null, 60000);
  await page.waitForTimeout(500); await shot(page, 'after-win-' + name);
  await ctx.close();
}

async function online(browser, errs) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 480 } });
  await prep(ctx);
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watchErrors(host, 'host', errs); watchErrors(guest, 'guest', errs);
  await host.goto(BASE + '?test=1&speed=8&net=local'); await guest.goto(BASE + '?test=1&speed=8&net=local');
  for (const p of [host, guest]) await waitFor(p, () => window.__eighty && !document.getElementById('title').hidden, null, 60000);
  await host.click('#btnOnline'); await host.fill('#nmInput', 'ホスト'); await host.click('#onRounds button[data-v="5"]'); await host.click('#btnHost');
  await waitFor(host, () => /^[A-Z2-9]{4}$/.test(document.getElementById('roomCode').textContent));
  const code = await host.textContent('#roomCode');
  await guest.click('#btnOnline'); await guest.fill('#nmInput', 'ゲスト'); await guest.click('.tabs button[data-tab="join"]');
  await guest.fill('#codeInput', code); await guest.click('#btnJoin');
  await waitFor(host, () => !document.getElementById('btnHostStart').hidden);
  check(true, `guest joined room ${code}`);
  await host.click('#btnHostStart');
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const done = await host.evaluate(() => !document.getElementById('result').hidden) && await guest.evaluate(() => !document.getElementById('result').hidden);
    if (done) break;
    const both = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__eighty.panel.mode)));
    for (const [j, p] of [host, guest].entries()) {
      if (both[j] === 'decide') await playRound(p, 2 + Math.floor(Math.random() * 9), 3);
      else if (both[j] === 'borrow') await p.click('#btnBorrow');
    }
    await sleep(300);
  }
  await waitFor(host, () => !document.getElementById('result').hidden, null, 30000);
  await waitFor(guest, () => !document.getElementById('result').hidden, null, 30000);
  const a = await st(host), b = await st(guest);
  check(JSON.stringify(a) === JSON.stringify(b), 'host and guest end with the same game');
  check(a.ph === 'over' && a.rounds === 5, 'online game finished all 5 rounds');
  const ha = await hudText(host), hb = await hudText(guest);
  check(ha[0][1] === hb[1][1] && ha[1][1] === hb[0][1], 'both screens show the same net worths (mirrored seats)');
  await shot(host, 'online-host-result'); await shot(guest, 'online-guest-result');
  // rematch from the host
  await host.click('#btnAgain');
  await waitFor(guest, () => { const m = window.__eighty.match; return m && m.s && m.s.rnd === 1 && !m.over; }, null, 30000);
  check(true, 'rematch reaches the guest');
  await ctx.close();
}

let browser;
try {
  await sleep(400);
  browser = await playwright.chromium.launch({
    executablePath: process.env.EIGHTY_CHROMIUM || undefined, proxy,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const errs = [];
  await soloDesktop(browser, errs);
  await phone(browser, errs, 390, 844, 'portrait');
  await phone(browser, errs, 844, 390, 'landscape');
  await online(browser, errs);
  check(errs.length === 0, 'no page errors' + (errs.length ? ':\n  ' + errs.slice(0, 10).join('\n  ') : ''));
} catch (e) {
  console.error(e); failures.push(String(e && e.message || e));
} finally {
  if (browser) await browser.close();
  server.kill();
}
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall browser checks passed');
