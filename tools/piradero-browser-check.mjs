// 風の怪物ピラデロ: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/piradero-browser-check.mjs              solo games on a phone and a desktop, then an online game
//   node tools/piradero-browser-check.mjs --shots DIR  also save screenshots into DIR
//   --solo / --online                                   only that part;  --game=desktop-3p  one solo game
// Needs Playwright and Chromium. The online part runs over BroadcastChannel (?net=local), so it needs no PeerJS server.
// three.js comes from ../assets/vendor; Google Fonts and the music are stubbed out so it runs offline.
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
const PORT = 8797, BASE = `http://localhost:${PORT}/piradero/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function context(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  await ctx.route(/game-bgm\.mjs/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/javascript' }));
  return ctx;
}
function watch(page, errors, label) {
  page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); });
}
// one move for my seat if it is my turn: a random field card, and always fight
async function step(page) {
  const st = await page.evaluate(() => {
    const A = window.PD_APP, V = A && A.V;
    if (!V) return null;
    return { busy: A.busy, phase: V.phase, turn: V.turn, me: V.me, open: V.slots.map((s, i) => (s.by < 0 ? i : -1)).filter((i) => i >= 0), sheet: !!document.querySelector('.sheet-bg.result') };
  });
  if (!st) return null;
  if (st.phase === 'over') return st;
  if (st.sheet) { await page.click('.sheet-bg.result [data-a="next"]').catch(() => {}); return st; }
  if (!st.busy && st.turn === st.me) {
    if (st.phase === 'pick') await page.evaluate((s) => window.PD_APP.onPick(s), st.open[Math.floor(Math.random() * st.open.length)]);
    else if (st.phase === 'escape') await page.click('#dock [data-a="fight"]').catch(() => {});
  }
  return st;
}

async function soloGame(browser, name, viewport, n) {
  const errors = [];
  const ctx = await context(browser, viewport);
  const page = await ctx.newPage();
  watch(page, errors, name);
  await page.goto(BASE + '?test=1');
  await page.waitForSelector('#scrTitle:not([hidden])', { timeout: 20000 });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '-title.png') });
  await page.click('#tSolo');
  await page.click(`#soN button[data-v="${n}"]`);
  await page.click('#soGears button[data-v="3"]');
  await page.click('#soStart');
  let shot = 0, last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 420000) {
    last = await step(page);
    if (last && last.phase === 'over') break;
    if (SHOTS && last && shot < 3 && (last.phase === 'escape' || (shot === 0 && last.phase === 'pick'))) {
      await page.screenshot({ path: path.join(SHOTS, `${name}-${shot}.png`) }); shot++;
    }
    await sleep(120);
  }
  check(last && last.phase === 'over', `${name}: a ${n}-player game reaches the end` + (last && last.phase !== 'over' ? ' (stopped at ' + JSON.stringify(last) + ')' : ''));
  const end = await page.evaluate(() => !!document.querySelector('.end-title'));
  check(end, `${name}: the final summary is shown`);
  // canvas really draws (not black): sample the middle of the table
  const lit = await page.evaluate(async () => {
    const url = window.PD_APP.scene.snapshot();
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
    const d = x.getImageData(16, 16, 32, 32).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (d.length / 4);
  });
  check(lit > 30, `${name}: the table is drawn`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '-end.png') });
  check(!errors.length, `${name}: no errors` + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function onlineGame(browser) {
  const errors = [];
  const ctx = await context(browser, { width: 390, height: 844 });
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watch(host, errors, 'host'); watch(guest, errors, 'guest');
  await host.goto(BASE + '?test=1&net=local');
  await host.waitForSelector('#scrTitle:not([hidden])', { timeout: 60000 });
  await host.click('#tOnline');
  await host.fill('#onName', 'ホスト');
  await host.click('#onCreate');
  await host.waitForSelector('#scrLobby:not([hidden])');
  const code = (await host.textContent('#lobCode')).trim();
  check(/^[A-Z0-9]{4}$/.test(code), 'online: a room code ' + code);
  await guest.goto(BASE + '?test=1&net=local&room=' + code);
  await guest.waitForSelector('#scrOnline:not([hidden])', { timeout: 90000 });
  await guest.fill('#onName', 'ゲスト');
  await guest.click('#onJoin');
  await guest.waitForSelector('#scrLobby:not([hidden])');
  await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat-row').length === 2, null, { timeout: 8000 });
  await host.click('#lobAddCpu');
  check((await host.$$('#lobSeats .seat-row')).length === 3, 'online: host + guest + CPU in the lobby');
  await host.click('#lobGears button[data-v="3"]');
  await host.click('#lobStart');
  await guest.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  check(true, 'online: the guest is at the table');
  let hs = null, gs = null, peeked = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    hs = await step(host); gs = await step(guest);
    if (hs && gs && hs.phase === 'over' && gs.phase === 'over') break;
    if (!peeked) {
      // the guest must never see a number it was not shown
      const leak = await guest.evaluate(() => { const V = window.PD_APP.V; if (!V || V.phase !== 'pick') return false; return V.slots.some((s) => s.v !== null && !s.mine && !s.open); });
      if (leak) { check(false, 'online: a hidden number reached the guest'); peeked = true; }
    }
    await sleep(120);
  }
  check(hs && hs.phase === 'over' && gs && gs.phase === 'over', 'online: the game ends on both screens');
  const same = await Promise.all([host, guest].map((p) => p.evaluate(() => { const V = window.PD_APP.V; return V ? V.players.map((P) => P.gears).join() + '/' + V.winner : ''; })));
  check(same[0] === same[1], 'online: both screens agree on the result ' + same.join(' vs '));
  if (SHOTS) { await host.screenshot({ path: path.join(SHOTS, 'online-host.png') }); await guest.screenshot({ path: path.join(SHOTS, 'online-guest.png') }); }
  check(!errors.length, 'online: no errors' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

let browser;
try {
  await sleep(500);
  browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const only = process.argv.includes('--online') ? 'online' : process.argv.includes('--solo') ? 'solo' : '';
  const which = (process.argv.find((a) => a.startsWith('--game=')) || '').slice(7);
  const games = [['phone-2p', { width: 390, height: 844 }, 2], ['phone-3p', { width: 390, height: 844 }, 3], ['desktop-2p', { width: 1280, height: 760 }, 2], ['desktop-3p', { width: 1280, height: 760 }, 3]];
  if (only !== 'online') for (const g of games) if (!which || which === g[0]) await soloGame(browser, ...g);
  if (only !== 'solo') await onlineGame(browser);
} catch (e) {
  check(false, 'run: ' + (e && e.message));
} finally {
  if (browser) await browser.close();
  server.kill();
}
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nall browser checks passed');
