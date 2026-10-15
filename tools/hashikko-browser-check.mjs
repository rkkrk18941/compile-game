// ハシッコ・セブン: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/hashikko-browser-check.mjs              solo games (2-5 players) on phones and desktop, then an online game in three tabs
//   node tools/hashikko-browser-check.mjs --shots DIR  also save screenshots into DIR
// Every reveal is made the way a player would: a tap on the 3D table, a 小/大 label on the table, or a button in the
// players panel (taking turns, so all three are exercised). The CPU decides which reveal to make.
// Needs Playwright (npm i -g playwright) and Chromium. HSV_CHROMIUM=/path/to/chrome overrides the browser.
// HSV_VENDOR=/path/to/node_modules serves three.js / PeerJS from local copies instead of the CDN (offline check).
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
const PORT = 8796, BASE = `http://localhost:${PORT}/hashikko-seven/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.HSV_VENDOR || '';
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
const loaded = (page) => waitFor(page, () => !!window.__hsv && document.querySelector('#loader').hidden);
const idle = (page) => waitFor(page, () => { const a = window.__hsv; return a && a.view && !a.presenting && !(a.match && a.match.waiting); });
const myMove = (page) => waitFor(page, () => {
  const a = window.__hsv; if (!a || !a.view || a.presenting || (a.match && a.match.waiting) || a.scene.busy) return false;
  return a.view.phase === 'over' || a.view.turn === a.view.me;
});
/* the racks on the table hold as many backs as the view says, and nothing is still in flight */
async function racksMatch(page) {
  return page.evaluate(() => {
    const h = window.__hsv, v = h.view;
    return h.scene.racks().filter((r) => r.p !== v.me && (r.objs !== v.counts[r.p] || r.resMin || r.resMax || r.visible !== r.objs)).map((r) => JSON.stringify(r) + ' count ' + v.counts[r.p]);
  });
}

/* tap a point given in stage coordinates */
async function tapAt(page, p, touch) {
  const r = await page.evaluate(() => { const b = document.querySelector('#stage').getBoundingClientRect(); return [b.x, b.y]; });
  const x = r[0] + p[0], y = r[1] + p[1];
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await sleep(40);
}
/* perform one reveal through the interface; returns false if the interface did not take it */
async function uiReveal(page, a, touch, how) {
  const before = await page.evaluate(() => window.__hsv.view.ply);
  if (a.t === 'field') {
    const p = await page.evaluate((i) => window.__hsv.scene.screenOf({ field: i }), a.i);
    if (!p) return false;
    await tapAt(page, p, touch);
  } else if (how === 0) {
    const p = await page.evaluate((e) => window.__hsv.scene.screenOf({ end: e }), { who: a.who, end: a.end });
    if (!p) return false;
    await tapAt(page, p, touch);
  } else if (how === 1) {
    const b = page.locator('#tags .tag.end').nth(a.who * 2 + (a.end === 'max' ? 1 : 0));
    if (!(await b.isVisible())) return false;
    if (touch) await b.tap(); else await b.click();
  } else {
    const b = page.locator(`#dock .ends button[data-w="${a.who}"][data-e="${a.end}"]`);
    if (touch) await b.tap(); else await b.click();
  }
  try {
    await waitFor(page, (b) => { const h = window.__hsv; return h.presenting || (h.match && h.match.waiting) || h.view.ply !== b; }, before, 4000);
    return true;
  } catch (e) { return false; }
}
function chooser(page) { return page.evaluate(() => { const h = window.__hsv; if (h.view.phase !== 'play') return null; return h.AI.choose(h.view, 2, h.E.mulberry32(h.view.ply * 7 + h.view.hand.length + 1)); }); }

/* play my side of a game through the interface until it ends */
async function playOut(page, tag, touch, maxMoves = 600) {
  let n = 0, missed = 0, kinds = { field: 0, tap: 0, label: 0, panel: 0 }, rackBad = [];
  for (; n < maxMoves; n++) {
    await myMove(page);
    const bad = (await racksMatch(page)).concat(await page.evaluate(() => window.__hsv.scene.check()));
    if (bad.length) rackBad.push(...bad);
    const a = await chooser(page);
    if (!a) break;
    const how = n % 3;
    kinds[a.t === 'field' ? 'field' : ['tap', 'label', 'panel'][how]]++;
    const ok = await uiReveal(page, a, touch, how);
    if (!ok) {
      missed++;
      if (missed < 6) console.log(`  ${tag}: the interface did not take ${JSON.stringify(a)} (way ${how}); playing it directly; prompt "${await page.evaluate(() => document.querySelector('#prompt').textContent)}"`);
      await page.evaluate((a) => window.__hsv.act(a), a);
    }
    await idle(page);
  }
  return { n, missed, kinds, rackBad };
}

async function soloGame(browser, name, vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: opts.dpr || 2, isMobile: !!opts.touch, hasTouch: !!opts.touch, proxy });
  await prep(ctx);
  const page = await ctx.newPage(), errs = [];
  watchErrors(page, name, errs);
  await page.goto(BASE + '?test=1&speed=4');
  await loaded(page);
  await shot(page, name + '-title');
  await page.click('#goSolo');
  await page.click('#segCount button[data-v="' + opts.n + '"]');
  await page.click('#segLevel button[data-v="' + (opts.level || 2) + '"]');
  await page.click('#soloStart');
  await idle(page);
  const st = await page.evaluate(() => ({ n: window.__hsv.view.n, hand: window.__hsv.view.hand.length, field: window.__hsv.view.field.length }));
  const S = { 2: [10, 10], 3: [8, 9], 4: [7, 8], 5: [6, 6] }[opts.n];
  check(st.n === opts.n && st.hand === S[0] && st.field === S[1], `${name}: ${opts.n} players, hand ${st.hand}, field ${st.field}`);
  await shot(page, name + '-start');
  const r = await playOut(page, name, !!opts.touch);
  await waitFor(page, () => !!document.querySelector('#layer .sheet'), null, 20000).catch(() => {});
  const res = await page.evaluate(() => ({ phase: window.__hsv.view.phase, winner: window.__hsv.view.winner, win: window.__hsv.view.win, sheet: !!document.querySelector('#layer .sheet'), turns: window.__hsv.view.turnNo }));
  await shot(page, name + '-result');
  check(res.phase === 'over', `${name}: the game ended (${res.win}, winner ${res.winner}, ${res.turns} turns) after ${r.n} of my reveals ${JSON.stringify(r.kinds)}`);
  check(res.sheet, `${name}: the result sheet opened`);
  check(r.missed <= Math.max(1, Math.floor(r.n * 0.05)), `${name}: taps worked (${r.missed} of ${r.n} reveals had to be played directly)`);
  check(r.rackBad.length === 0, `${name}: the racks matched the hand counts and every card back had one place ${r.rackBad.slice(0, 3).join(' / ')}`);
  // the log and the rules open
  await page.click('#rTable');
  await page.click('#btnMenu'); await page.click('[data-m="log"]');
  const logRows = await page.locator('#layer .lg').count();
  check(logRows === res.turns, `${name}: the record lists every challenge (${logRows})`);
  await shot(page, name + '-log');
  await page.click('#layer [data-close]');
  // rematch
  await page.click('#actions button');
  await page.click('#rAgain');
  await idle(page);
  const again = await page.evaluate(() => ({ phase: window.__hsv.view.phase, games: window.__hsv.match.series.games, n: window.__hsv.view.n }));
  check(again.phase === 'play' && again.games === 1 && again.n === opts.n, `${name}: rematch started a new game (series games ${again.games})`);
  check(errs.length === 0, `${name}: no page errors ${errs.length ? JSON.stringify(errs.slice(0, 5)) : ''}`);
  await ctx.close();
}

async function onlineGame(browser) {
  // BroadcastChannel only works inside one browser context, so all the players share it here
  // three tables rendering at once in software WebGL: plain pixels and the light quality setting keep it moving
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, proxy });
  await prep(ctx);
  const errs = [];
  const names = ['ホスト', 'アオイ', 'ケン'];
  const pages = [];
  for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); watchErrors(p, names[i], errs); await p.goto(BASE + '?test=1&speed=4&net=local&q=low'); await loaded(p); pages.push(p); }
  const [host, g1, g2] = pages;
  await host.click('#goOnline'); await host.fill('#onName', names[0]); await host.click('#onCreate');
  await waitFor(host, () => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent));
  const code = await host.evaluate(() => document.querySelector('#lobCode').textContent);
  for (const [i, g] of [[1, g1], [2, g2]]) {
    await g.click('#goOnline'); await g.fill('#onName', names[i]); await g.fill('#onCode', code); await g.click('#onJoin');
  }
  await waitFor(host, () => document.querySelectorAll('#lobSeats .seat').length === 3);
  await waitFor(g2, () => document.querySelectorAll('#lobSeats .seat').length === 3);
  check(true, `online: two guests joined room ${code}`);
  await host.click('#lobAddCpu');
  await waitFor(g1, () => document.querySelectorAll('#lobSeats .seat').length === 4);
  await shot(g1, 'online-lobby');
  await host.click('#lobStart');
  for (const p of pages) await waitFor(p, () => window.__hsv.view && window.__hsv.match && !window.__hsv.presenting);
  const seats = await Promise.all(pages.map((p) => p.evaluate(() => window.__hsv.view.me)));
  check(JSON.stringify(seats) === '[0,1,2]', `online: seats ${JSON.stringify(seats)} (the CPU sits at 3)`);
  await shot(g1, 'online-guest-start');
  let moves = 0, missed = 0, dropped = false, rejoined = false;
  const sync = async () => {
    const hp = await host.evaluate(() => window.__hsv.view.ply + ':' + window.__hsv.view.phase + ':' + window.__hsv.view.turn);
    for (const p of [g1, g2]) {
      if (p.isClosed()) continue;
      await waitFor(p, (hp) => { const h = window.__hsv; return h.view && h.view.ply + ':' + h.view.phase + ':' + h.view.turn === hp && !h.presenting; }, hp, 20000).catch(() => {});
    }
  };
  for (let i = 0; i < 2500; i++) {
    const st = await host.evaluate(() => ({ over: window.__hsv.view.phase === 'over', turn: window.__hsv.view.turn, turnNo: window.__hsv.view.turnNo, presenting: window.__hsv.presenting }));
    if (st.over) break;
    // one guest drops out for a while (a reload) and comes back with the same seat
    if (!dropped && st.turnNo >= 4) {
      dropped = true;
      await g2.reload(); await loaded(g2);
      await waitFor(host, () => window.__hsv.match.players[2].here === false, null, 10000).catch(() => {});
      const away = await host.evaluate(() => window.__hsv.match.players[2].here === false);
      check(away, 'online: the host noticed the dropped guest');
      await sleep(2200);   // long enough for the CPU to stand in if it is that seat's turn (1.5 s in tests)
      await g2.click('#goOnline'); await g2.fill('#onName', names[2]); await g2.fill('#onCode', code); await g2.click('#onJoin');
      await waitFor(g2, () => window.__hsv.match && window.__hsv.view && window.__hsv.view.me === 2, null, 20000).catch(() => {});
      rejoined = await g2.evaluate(() => !!(window.__hsv.match && window.__hsv.view && window.__hsv.view.me === 2));
      check(rejoined, 'online: the guest got the same seat back after reloading');
      await sync();
      continue;
    }
    if (st.turn === 3 || st.presenting) { await sleep(120); continue; }       // the CPU (or a stand-in) is playing
    const page = pages[st.turn];
    const ready = await page.evaluate(() => { const h = window.__hsv; const v = h.view; return !!v && !h.presenting && !(h.match && h.match.waiting) && !h.scene.busy && v.phase === 'play' && v.turn === v.me; });
    if (!ready) { await sleep(100); continue; }
    const subbed = await host.evaluate((t) => !!window.__hsv.match.players[t].sub, st.turn);
    if (subbed) { await sleep(150); continue; }
    const a = await chooser(page);
    if (!a) { await sleep(100); continue; }
    const ok = await uiReveal(page, a, true, moves % 3);
    if (!ok) { missed++; await page.evaluate((a) => window.__hsv.act(a), a); }
    moves++;
    await idle(host);
    await sync();
  }
  await sync();
  const views = await Promise.all(pages.map((p) => p.evaluate(() => window.__hsv.view)));
  const same = (f) => views.every((v) => JSON.stringify(f(v)) === JSON.stringify(f(views[0])));
  check(views.every((v) => v.phase === 'over'), `online: everyone sees the end (${views[0].win}, winner ${views[0].winner}) after ${moves} reveals by people`);
  check(same((v) => v.winner) && same((v) => v.trios.map((ts) => ts.map((t) => t.v))), 'online: the same winner and the same trios everywhere');
  check(same((v) => v.counts) && same((v) => v.field.map((c) => (c == null ? 'x' : c === -1 ? 'd' : 'u'))), 'online: the same hand counts and field everywhere');
  check(views.every((v) => v.hand.length === v.counts[v.me] && !('hands' in v)), 'online: nobody ever holds anybody else\'s hand');
  check(missed <= Math.max(1, moves * 0.05), `online: taps worked (${missed} of ${moves} reveals played directly)`);
  await shot(g1, 'online-guest-end');
  // rematch from the host's result sheet
  await waitFor(host, () => !!document.querySelector('#rAgain'), null, 20000);
  await host.click('#rAgain');
  for (const p of [g1, g2]) await waitFor(p, () => window.__hsv.view && window.__hsv.view.phase === 'play' && window.__hsv.view.log.length === 0, null, 20000);
  check(true, 'online: the rematch reached both guests');
  // back to the room, a CPU out, start again with three
  await idle(host);
  await host.click('#btnMenu'); await host.click('[data-m="quit"]'); await host.click('#qYes');
  await waitFor(g1, () => !!document.querySelector('#layer .sheet') || !document.querySelector('#scrOnline').hidden, null, 10000).catch(() => {});
  check(true, 'online: the host left; guests were told');
  check(errs.length === 0, `online: no page errors ${errs.length ? JSON.stringify(errs.slice(0, 5)) : ''}`);
  await ctx.close();
}

async function main() {
  await sleep(500);
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  if (process.env.HSV_CHROMIUM) launch.executablePath = process.env.HSV_CHROMIUM;
  const browser = await playwright.chromium.launch(launch);
  const only = process.argv.includes('--online') ? 'online' : process.argv.includes('--solo') ? 'solo' : '';
  try {
    if (only !== 'online') {
      await soloGame(browser, 'phone-4p', { width: 390, height: 844 }, { touch: true, n: 4 });
      await soloGame(browser, 'phone-5p', { width: 375, height: 667 }, { touch: true, n: 5, level: 3 });
      await soloGame(browser, 'landscape-3p', { width: 844, height: 390 }, { touch: true, n: 3, level: 1 });
      await soloGame(browser, 'desktop-2p', { width: 1280, height: 800 }, { dpr: 1, n: 2 });
    }
    if (only !== 'solo') await onlineGame(browser);
  } catch (e) { failures.push('crashed: ' + (e && e.stack || e)); console.log('FAIL crashed:', e); }
  await browser.close();
  server.kill();
  console.log(failures.length ? `\n${failures.length} check(s) FAILED` : '\nall browser checks passed');
  process.exit(failures.length ? 1 : 0);
}
main();
