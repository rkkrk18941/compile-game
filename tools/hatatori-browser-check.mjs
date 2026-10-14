// ハタトリ・ナイン: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/hatatori-browser-check.mjs              solo games on phones and desktop, then an online game between two tabs
//   node tools/hatatori-browser-check.mjs --shots DIR  also save screenshots into DIR
// Every move is made by tapping the 3D table / the buttons, the way a player would (the CPU picks which move).
// Needs Playwright (npm i -g playwright) and Chromium. HTN_CHROMIUM=/path/to/chrome overrides the browser.
// HTN_VENDOR=/path/to/node_modules serves three.js / PeerJS from local copies instead of the CDN (offline check).
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
const PORT = 8794, BASE = `http://localhost:${PORT}/hatatori-nine/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.HTN_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const proxy = process.env.HTTPS_PROXY && !VENDOR ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
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
const idle = (page) => waitFor(page, () => { const a = window.__htn; return a && a.view && !a.presenting && !(a.match && a.match.waiting); });
const myMove = (page) => waitFor(page, () => {
  const a = window.__htn; if (!a || !a.view || a.presenting || (a.match && a.match.waiting) || a.scene.busy) return false;
  const v = a.view; return v.phase === 'over' || (v.turn === v.me && !(v.phase === 'draw' && ['T', 'X'].filter((d) => v.deck[d] > 0).length === 1));
});

/* tap a point given in stage coordinates */
async function tapAt(page, p, touch) {
  const r = await page.evaluate(() => { const b = document.querySelector('#stage').getBoundingClientRect(); return [b.x, b.y]; });
  const x = r[0] + p[0], y = r[1] + p[1];
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await sleep(40);
}
async function tapThing(page, q, touch) {
  const p = await page.evaluate((q) => window.__htn.scene.screenOf(q), q);
  if (!p) throw new Error('nothing to tap for ' + JSON.stringify(q));
  await tapAt(page, p, touch);
}
async function clickButton(page, text) {
  const b = page.locator('#actions button', { hasText: text }).first();
  await b.click();
  await sleep(40);
}
/* perform one action through the interface; returns false if the interface did not take it */
async function uiAction(page, a, touch) {
  const before = await page.evaluate(() => JSON.stringify([window.__htn.view.ply, window.__htn.view.phase, window.__htn.view.hand, window.__htn.view.deck]));
  const t = a.t;
  if (t === 'draw' || t === 'sdraw') await tapThing(page, { deck: a.d }, touch);
  else if (t === 'pass') await clickButton(page, 'パス');
  else if (t === 'sret') { for (const c of a.cards) await tapThing(page, { hand: c }, touch); await clickButton(page, '戻す'); }
  else {
    await tapThing(page, { hand: a.c }, touch);
    await waitFor(page, () => !window.__htn.scene.busy, null, 3000).catch(() => {});
    if (t === 'card' || t === 'env') await tapThing(page, { lane: a.f, mine: true }, touch);
    else if (t === 'scout') await clickButton(page, '使う');
    else if (t === 'deserter') await tapThing(page, { card: a.x }, touch);
    else if (t === 'redeploy') { await tapThing(page, { card: a.x }, touch); await sleep(80); if (a.to === -1) await clickButton(page, '捨てる'); else await tapThing(page, { lane: a.to, mine: true }, touch); }
    else if (t === 'traitor') { await tapThing(page, { card: a.x }, touch); await sleep(80); await tapThing(page, { lane: a.to, mine: true }, touch); }
  }
  try {
    await waitFor(page, (b) => { const a = window.__htn; return a.presenting || (a.match && a.match.waiting) || JSON.stringify([a.view.ply, a.view.phase, a.view.hand, a.view.deck]) !== b; }, before, 4000);
    return true;
  } catch (e) { return false; }
}
/* play my side of a game through the interface until it ends */
async function playOut(page, tag, touch, maxMoves = 400) {
  let n = 0, missed = 0, kinds = {};
  for (; n < maxMoves; n++) {
    await myMove(page);
    const a = await page.evaluate(() => { const h = window.__htn; if (h.view.phase === 'over') return null; return h.AI.choose(h.view, 2, h.E.mulberry32(h.view.ply * 7 + h.view.hand.length)); });
    if (!a) break;
    kinds[a.t] = (kinds[a.t] || 0) + 1;
    const ok = await uiAction(page, a, touch);
    if (!ok) {
      missed++;
      if (missed < 6) console.log(`  ${tag}: the interface did not take ${JSON.stringify(a)}; playing it directly (ui ${JSON.stringify(await page.evaluate(() => window.__htn.ui))}, prompt "${await page.evaluate(() => document.querySelector('#prompt').textContent)}")`);
      await page.evaluate((a) => { const h = window.__htn; h.act(a); }, a);
    }
    await idle(page);
  }
  return { n, missed, kinds };
}

async function soloGame(browser, name, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: opts.dpr || 2, isMobile: !!opts.touch, hasTouch: !!opts.touch, proxy });
  await prep(ctx);
  const page = await ctx.newPage(), errs = [];
  watchErrors(page, name, errs);
  await page.goto(BASE + '?test=1&speed=4');
  await waitFor(page, () => !!window.__htn && document.querySelector('#loader').hidden);
  await shot(page, name + '-title');
  await page.click('#goSolo');
  if (opts.basic) await page.click('#segRules button[data-v="0"]'); else await page.click('#segRules button[data-v="1"]');
  await page.click('#segLevel button[data-v="' + (opts.level || 2) + '"]');
  await page.click('#soloStart');
  await idle(page);
  await shot(page, name + '-start');
  const r = await playOut(page, name, !!opts.touch);
  await waitFor(page, () => !!document.querySelector('#layer .sheet'), null, 20000).catch(() => {});
  const res = await page.evaluate(() => ({ phase: window.__htn.view.phase, winner: window.__htn.view.winner, win: window.__htn.view.win, sheet: !!document.querySelector('#layer .sheet'), flags: window.__htn.view.flags.map((f) => f.claimed) }));
  await shot(page, name + '-result');
  check(res.phase === 'over', `${name}: the game ended (${res.win}, winner ${res.winner}) after ${r.n} of my moves; moves by kind ${JSON.stringify(r.kinds)}`);
  check(res.sheet, `${name}: the result sheet opened`);
  check(r.missed <= Math.max(1, Math.floor(r.n * 0.05)), `${name}: taps worked (${r.missed} of ${r.n} moves had to be played directly)`);
  // rematch
  await page.click('#rAgain');
  await idle(page);
  const again = await page.evaluate(() => ({ phase: window.__htn.view.phase, games: window.__htn.match.series.games }));
  check(again.phase !== 'over' && again.games === 1, `${name}: rematch started a new game (series games ${again.games})`);
  check(errs.length === 0, `${name}: no page errors ${errs.length ? JSON.stringify(errs.slice(0, 5)) : ''}`);
  await ctx.close();
}

async function onlineGame(browser) {
  const mk = async (name, vp) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, proxy });
    await prep(ctx);
    const page = await ctx.newPage(), errs = [];
    watchErrors(page, name, errs);
    return { ctx, page, errs };
  };
  // BroadcastChannel only works inside one browser context, so both players share it here
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, proxy });
  await prep(ctx);
  const host = await ctx.newPage(), guest = await ctx.newPage(), errs = [];
  watchErrors(host, 'host', errs); watchErrors(guest, 'guest', errs);
  await host.goto(BASE + '?test=1&speed=4&net=local');
  await guest.goto(BASE + '?test=1&speed=4&net=local');
  await waitFor(host, () => !!window.__htn && document.querySelector('#loader').hidden);
  await waitFor(guest, () => !!window.__htn && document.querySelector('#loader').hidden);
  await host.click('#goOnline'); await host.fill('#onName', 'ホスト');
  await host.click('#onCreate');
  await waitFor(host, () => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent));
  const code = await host.evaluate(() => document.querySelector('#lobCode').textContent);
  await guest.click('#goOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code);
  await guest.click('#onJoin');
  await waitFor(host, () => !document.querySelector('#lobStart').hidden);
  check(true, `online: guest joined room ${code}`);
  await host.click('#lobStart');
  await idle(host); await waitFor(guest, () => window.__htn && window.__htn.view && !window.__htn.presenting);
  await shot(guest, 'online-guest-start');
  // both play by tapping, each with the CPU choosing
  let moves = 0, missed = 0;
  for (let i = 0; i < 1500; i++) {
    const st = await host.evaluate(() => ({ over: window.__htn.view.phase === 'over', turn: window.__htn.view.turn }));
    if (st.over) break;
    const page = st.turn === 0 ? host : guest;
    // wait until that player's table is still and it is really their move (an automatic draw may pass the turn)
    await waitFor(page, () => { const a = window.__htn; return a.view && !a.presenting && !(a.match && a.match.waiting) && !a.scene.busy; });
    const ready = await page.evaluate(() => { const v = window.__htn.view; return v.phase !== 'over' && v.turn === v.me && !(v.phase === 'draw' && ['T', 'X'].filter((d) => v.deck[d] > 0).length === 1); });
    if (!ready) { await sleep(150); continue; }
    const a = await page.evaluate(() => { const h = window.__htn; if (h.view.phase === 'over') return null; return h.AI.choose(h.view, 2, h.E.mulberry32(h.view.ply * 13 + 5)); });
    if (!a) { await sleep(100); continue; }
    const ok = await uiAction(page, a, true);
    if (!ok) { missed++; await page.evaluate((a) => window.__htn.act(a), a); }
    moves++;
    await idle(host); await waitFor(guest, () => !window.__htn.presenting);
    // wait until the guest has caught up with the host
    const hp = await host.evaluate(() => window.__htn.view.ply + ':' + window.__htn.view.phase);
    await waitFor(guest, (hp) => { const v = window.__htn.view; return v.ply + ':' + v.phase === hp && !window.__htn.presenting; }, hp, 20000).catch(() => {});
  }
  const hv = await host.evaluate(() => window.__htn.view), gv = await guest.evaluate(() => window.__htn.view);
  check(hv.phase === 'over' && gv.phase === 'over', `online: both see the end (host ${hv.win}/${hv.winner}, guest ${gv.win}/${gv.winner}) after ${moves} moves`);
  check(JSON.stringify(hv.flags.map((f) => f.claimed)) === JSON.stringify(gv.flags.map((f) => f.claimed)), 'online: both see the same flags');
  check(hv.winner === gv.winner, 'online: same winner on both sides');
  const leak = await guest.evaluate(() => window.__htn.view.opp.every((k) => k === 'T' || k === 'X'));
  check(leak, 'online: the guest never sees the host hand');
  check(missed <= Math.max(1, moves * 0.05), `online: taps worked (${missed} of ${moves} moves played directly)`);
  await shot(host, 'online-host-end');
  // rematch from the host's result sheet
  await waitFor(host, () => !!document.querySelector('#rAgain'), null, 20000);
  await host.click('#rAgain');
  await waitFor(guest, () => window.__htn.view && window.__htn.view.phase !== 'over' && window.__htn.match.series && window.__htn.match.series.games === 1, null, 20000);
  check(true, 'online: rematch reached the guest');
  check(errs.length === 0, `online: no page errors ${errs.length ? JSON.stringify(errs.slice(0, 5)) : ''}`);
  await ctx.close();
}

async function main() {
  await sleep(500);
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (process.env.HTN_CHROMIUM) launch.executablePath = process.env.HTN_CHROMIUM;
  const browser = await playwright.chromium.launch(launch);
  try {
    await soloGame(browser, 'phone-portrait', { width: 390, height: 844 }, { touch: true });
    await soloGame(browser, 'phone-landscape', { width: 844, height: 390 }, { touch: true, level: 3 });
    await soloGame(browser, 'desktop-basic', { width: 1280, height: 800 }, { dpr: 1, basic: true, level: 1 });
    await onlineGame(browser);
  } catch (e) { failures.push('crashed: ' + (e && e.stack || e)); console.log('FAIL crashed:', e); }
  await browser.close();
  server.kill();
  console.log(failures.length ? `\n${failures.length} check(s) FAILED` : '\nall browser checks passed');
  process.exit(failures.length ? 1 : 0);
}
main();
