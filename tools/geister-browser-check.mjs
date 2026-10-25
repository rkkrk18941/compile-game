// ガイスター: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/geister-browser-check.mjs              CPU games on a phone (portrait and landscape) and on a desktop,
//                                                      a one-device game, then an online game in two tabs
//   node tools/geister-browser-check.mjs --shots DIR  also save screenshots into DIR
//   node tools/geister-browser-check.mjs --only cpu   run one part: title, cpu, local, online
// Moves are made the way a player would, by tapping squares; ?test=1 shortens the animations and lets the test read
// the player's own view (window.__gst) to pick legal moves. It checks that a page never shows a colour its player may
// not see. Needs Playwright (npm i -g playwright) and Chromium. GST_VENDOR=/path/to/node_modules serves the fonts
// (@fontsource/kaisei-decol, @fontsource/zen-maru-gothic) from local copies instead of Google Fonts. The online part
// runs over BroadcastChannel (?net=local).
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
const PORT = 8799, BASE = `http://localhost:${PORT}/geister/`;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SHOTS = arg('--shots'), ONLY = arg('--only');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.GST_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss() {
  if (!VENDOR) return '';
  const parts = [['@fontsource/kaisei-decol', ['700']], ['@fontsource/zen-maru-gothic', ['500', '700', '900']]];
  let css = '';
  for (const [pkg, ws] of parts) for (const w of ws) {
    const f = path.join(VENDOR, pkg, w + '.css');
    if (fs.existsSync(f)) css += fs.readFileSync(f, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg.split('/')[1] + '/');
  }
  return css;
}
async function prep(ctx) {
  const css = fontCss();
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, body: css, contentType: 'text/css' }));
  await ctx.route(/fonts\.gstatic\.com\/local\//, (r) => {
    const m = r.request().url().match(/local\/([^/]+)\/(.+)$/);
    const f = m && path.join(VENDOR, '@fontsource', m[1], 'files', m[2]);
    if (f && fs.existsSync(f)) r.fulfill({ path: f, contentType: 'font/woff2' }); else r.fulfill({ status: 404, body: '' });
  });
}
async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function newPage(browser, viewport, opts = {}) {
  const ctx = opts.ctx || await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  if (!opts.ctx) await prep(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.errors = errors;
  return page;
}
const waitIdle = (page, ms = 15000) => page.waitForFunction(() => window.__gst && !window.__gst.busy(), null, { timeout: ms });

/* colours the page shows on the opponent's ghosts while the game is on: there must be none */
async function leaked(page) {
  return page.evaluate(() => {
    const g = window.__gst; const M = g.M(); if (!M) return 0;
    const v = g.view(); if (!v || v.phase === 'over' || M.seat < 0) return 0;
    let n = 0;
    document.querySelectorAll('#ghosts .gh').forEach((el) => {
      const id = +el.dataset.id;
      if ((id >> 3) !== M.seat && !el.classList.contains('gone') && (el.classList.contains('good') || el.classList.contains('bad'))) n++;
    });
    return n;
  });
}
/* play the human's moves by tapping squares until the game ends (or `limit` moves) */
async function playOut(page, limit = 400, seatCheck = true) {
  let moves = 0, leaks = 0;
  for (let i = 0; i < limit; i++) {
    await page.waitForFunction(() => { const g = window.__gst, M = g.M(); if (!M) return true; const v = g.view(); return v.phase === 'over' || (!g.busy() && v.phase === 'play' && v.turn === M.seat); }, null, { timeout: 30000 });
    const st = await page.evaluate(() => { const g = window.__gst, v = g.view(), M = g.M(); return { phase: v.phase, seat: M.seat }; });
    if (st.phase === 'over') break;
    if (seatCheck) leaks += await leaked(page);
    const mv = await page.evaluate(() => {
      const g = window.__gst, v = g.view(), M = g.M();
      const ms = g.E.legal(v, M.seat);
      const out = ms.find((a) => a.t === -1);
      if (out) return out;
      const caps = ms.filter((a) => a.t >= 0 && v.board[a.t] >= 0);
      const pick = caps.length && Math.random() < 0.5 ? caps : ms;
      return pick[Math.floor(Math.random() * pick.length)];
    });
    await page.evaluate((q) => window.__gst.tap(q), mv.f);
    if (mv.t === -1) await page.evaluate((q) => window.__gst.tap(q), mv.f);
    else await page.evaluate((q) => window.__gst.tap(q), mv.t);
    moves++;
  }
  return { moves, leaks };
}

async function title(browser) {
  const page = await newPage(browser, { width: 390, height: 844 }, { touch: true });
  await page.goto(BASE + '?test=1');
  await page.waitForSelector('#scrTitle:not([hidden])');
  await page.evaluate(() => document.fonts.ready); await sleep(400);
  await shot(page, '01-title-phone');
  await page.click('#goRules'); await sleep(200);
  check(await page.isVisible('#rules'), 'the rules open');
  await shot(page, '02-rules');
  await page.click('#rulesClose');
  check(page.errors.length === 0, 'no page errors on the title: ' + page.errors.join(' | '));
  await page.context().close();
}

async function cpuGame(browser, viewport, tag, level, touch) {
  const page = await newPage(browser, viewport, { touch });
  await page.goto(BASE + '?test=1');
  await page.waitForSelector('#scrTitle:not([hidden])');
  await page.click('#goCpu');
  await page.click(`#segLevel button[data-v="${level}"]`);
  await page.click('#segFirst button[data-v="me"]');
  await page.click('#cpuStart');
  await page.waitForFunction(() => document.body.classList.contains('ingame'));
  await page.evaluate(() => document.fonts.ready); await sleep(300);
  const setup = await page.evaluate(() => { const v = window.__gst.view(); return { phase: v.phase, cpuReady: v.ready[1], mine: document.querySelectorAll('#ghosts .gh.mine.turned').length, theirsShown: document.querySelectorAll('#ghosts .gh.theirs.good, #ghosts .gh.theirs.bad').length }; });
  check(setup.phase === 'setup' && setup.cpuReady, `${tag}: the CPU has set up and waits for you`);
  check(setup.mine === 8 && setup.theirsShown === 0, `${tag}: your 8 ghosts show their backs, the CPU's show only faces`);
  // swap two ghosts of different colours by tapping
  const before = await page.evaluate(() => window.__gst.M().layout.slice());
  const a = before.indexOf(1), b = before.indexOf(0);
  const sq = await page.evaluate(([ka, kb]) => [window.__gst.E.slotSquare(0, ka), window.__gst.E.slotSquare(0, kb)], [a, b]);
  await page.evaluate((q) => window.__gst.tap(q), sq[0]);
  await page.evaluate((q) => window.__gst.tap(q), sq[1]);
  const after = await page.evaluate(() => window.__gst.M().layout.slice());
  check(after[a] === 0 && after[b] === 1, `${tag}: tapping two ghosts swaps their colours`);
  await shot(page, `${tag}-1-setup`);
  await page.click('#actions .btn.primary');
  await page.waitForFunction(() => window.__gst.view().phase === 'play');
  check(true, `${tag}: the game starts after 決定`);
  // a few moves, then a screenshot mid-game
  const first = await playOut(page, 6);
  await waitIdle(page);
  // select a ghost so the move hints show
  await page.evaluate(() => { const g = window.__gst, v = g.view(), M = g.M(); if (v.phase === 'play' && v.turn === M.seat) { const m = g.E.legal(v, M.seat)[0]; g.tap(m.f); } });
  await sleep(150);
  await shot(page, `${tag}-2-play`);
  const rest = await playOut(page, 400);
  await page.waitForSelector('#result:not([hidden])', { timeout: 30000 });
  await sleep(200);
  await shot(page, `${tag}-3-result`);
  const res = await page.evaluate(() => { const v = window.__gst.view(); return { winner: v.winner, reason: v.reason, ply: v.ply, title: document.querySelector('#resTitle').textContent, shown: document.querySelectorAll('#ghosts .gh.theirs.turned').length, onBoard: v.g.filter((x, id) => id >= 8 && x.st === 'on').length }; });
  check(res.winner !== null && res.title.length > 0, `${tag}: the game ends (${res.title}, ${res.reason}, ${res.ply} moves)`);
  check(res.shown === res.onBoard, `${tag}: at the end every CPU ghost turns round (${res.shown}/${res.onBoard})`);
  check(first.leaks + rest.leaks === 0, `${tag}: no CPU colour was shown during the game`);
  check(page.errors.length === 0, `${tag}: no page errors: ` + page.errors.join(' | '));
  // play again goes straight back to setting up
  await page.click('#resBtns .btn.primary');
  await page.waitForFunction(() => window.__gst.view().phase === 'setup');
  check(true, `${tag}: もう一度 starts a new game`);
  await page.context().close();
}

async function resumeCheck(browser) {
  const page = await newPage(browser, { width: 390, height: 844 }, { touch: true });
  await page.goto(BASE + '?test=1');
  await page.click('#goCpu'); await page.click('#segLevel button[data-v="1"]'); await page.click('#segFirst button[data-v="me"]'); await page.click('#cpuStart');
  await page.waitForFunction(() => document.body.classList.contains('ingame'));
  await page.click('#actions .btn.primary');
  await playOut(page, 3);
  await waitIdle(page);
  const ply = await page.evaluate(() => window.__gst.view().ply);
  await page.reload();
  await page.waitForSelector('#scrTitle:not([hidden])');
  check(await page.isVisible('#goResume'), 'a CPU game can be resumed after a reload');
  await page.click('#goResume');
  await page.waitForFunction(() => document.body.classList.contains('ingame'));
  const ply2 = await page.evaluate(() => window.__gst.view().ply);
  check(ply2 >= ply, `the resumed game is where it was (${ply2} moves)`);
  await page.context().close();
}

async function localGame(browser) {
  const page = await newPage(browser, { width: 390, height: 844 }, { touch: true });
  await page.goto(BASE + '?test=1');
  await page.click('#goLocal');
  await page.fill('#locName0', 'あおい'); await page.fill('#locName1', 'みどり');
  await page.click('#locStart');
  await page.waitForSelector('#curtain:not([hidden])');
  const hidden = await page.evaluate(() => document.querySelectorAll('#ghosts .gh.good, #ghosts .gh.bad').length);
  check(hidden === 0, 'one device: behind the curtain no colour is drawn');
  await shot(page, 'local-1-curtain');
  await page.evaluate(() => window.__gst.curtainGo());
  check(await page.evaluate(() => window.__gst.M().seat === 0), 'one device: the first player sets up');
  await page.evaluate(() => window.__gst.setup());
  await page.waitForSelector('#curtain:not([hidden])');
  await page.evaluate(() => window.__gst.curtainGo());
  const seat1 = await page.evaluate(() => ({ seat: window.__gst.M().seat, shown: [...document.querySelectorAll('#ghosts .gh')].filter((el) => +el.dataset.id < 8 && (el.classList.contains('good') || el.classList.contains('bad'))).length }));
  check(seat1.seat === 1 && seat1.shown === 0, 'one device: the second player sets up and cannot see the first player\'s colours');
  await shot(page, 'local-2-second-setup');
  await page.evaluate(() => window.__gst.setup());
  let leaks = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForSelector('#curtain:not([hidden])', { timeout: 10000 });
    leaks += await page.evaluate(() => document.querySelectorAll('#ghosts .gh.good, #ghosts .gh.bad').length);
    await page.evaluate(() => window.__gst.curtainGo());
    const r = await playOut(page, 1);
    leaks += r.leaks;
    const over = await page.evaluate(() => window.__gst.view().phase === 'over');
    if (over) break;
  }
  check(leaks === 0, 'one device: no colour of the other player was ever drawn');
  await shot(page, 'local-3-play');
  check(page.errors.length === 0, 'one device: no page errors: ' + page.errors.join(' | '));
  await page.context().close();
}

async function onlineGame(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await prep(ctx);
  const host = await newPage(browser, null, { ctx }), guest = await newPage(browser, null, { ctx });
  await host.goto(BASE + '?test=1&net=local');
  await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
  await host.waitForSelector('#scrLobby:not([hidden])');
  const code = (await host.textContent('#lobCode')).trim();
  check(/^[A-Z0-9]{4}$/.test(code), 'online: a room code is shown (' + code + ')');
  await guest.goto(BASE + '?test=1&net=local');
  await guest.click('#goOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.click('#onJoin');
  await guest.waitForSelector('#scrLobby:not([hidden])');
  await host.waitForFunction(() => !document.querySelector('#lobStart').disabled);
  await shot(host, 'online-1-lobby');
  await host.click('#lobStart');
  await host.waitForFunction(() => window.__gst.M() && window.__gst.view().phase === 'setup');
  await guest.waitForFunction(() => window.__gst.M() && window.__gst.view().phase === 'setup');
  const g0 = await guest.evaluate(() => JSON.stringify(window.__gst.view().g.slice(0, 8)));
  check(!/"good":(true|false)/.test(g0), 'online: the guest is never sent the host\'s colours');
  await guest.evaluate(() => window.__gst.setup());
  await host.evaluate(() => window.__gst.setup());
  await host.waitForFunction(() => window.__gst.view().phase === 'play');
  await guest.waitForFunction(() => window.__gst.view().phase === 'play');
  check(true, 'online: both have set up and the game is on');
  let leaks = 0, moves = 0;
  for (let i = 0; i < 400; i++) {
    const turn = await host.evaluate(() => { const v = window.__gst.view(); return v.phase === 'over' ? -1 : v.turn; });
    if (turn < 0) break;
    const page = turn === 0 ? host : guest;
    await page.waitForFunction((t) => { const g = window.__gst, v = g.view(); return v.phase === 'over' || (!g.busy() && !g.M().waiting && v.turn === t && v.phase === 'play'); }, turn, { timeout: 15000 });
    leaks += await leaked(host) + await leaked(guest);
    const sent = await guest.evaluate(() => JSON.stringify(window.__gst.view().g.slice(0, 8).filter((x) => x.st === 'on')));
    if (/"good":(true|false)/.test(sent) && !(await guest.evaluate(() => window.__gst.view().phase === 'over'))) leaks++;
    const r = await playOut(page, 1);
    moves += r.moves;
    await host.waitForFunction((n) => window.__gst.view().ply >= n || window.__gst.view().phase === 'over', moves, { timeout: 15000 });
    if (i === 6) { await shot(guest, 'online-2-guest'); await shot(host, 'online-3-host'); }
    if (i === 9) {
      // the guest reloads mid-game and comes back to the same seat
      const ply = await host.evaluate(() => window.__gst.view().ply);
      check(/room=/.test(guest.url()), 'online: the guest keeps the room code in the address');
      await guest.reload();
      await guest.waitForFunction(() => window.__gst && window.__gst.M() && window.__gst.M().mode === 'guest', null, { timeout: 15000 });
      const back = await guest.evaluate(() => window.__gst.view().ply);
      check(back === ply, `online: after a reload the guest is back in the game (${back} moves)`);
    }
  }
  await host.waitForFunction(() => window.__gst.view().phase === 'over', null, { timeout: 15000 });
  await guest.waitForFunction(() => window.__gst.view().phase === 'over', null, { timeout: 15000 });
  const hv = await host.evaluate(() => window.__gst.view()), gv = await guest.evaluate(() => window.__gst.view());
  check(hv.winner === gv.winner && hv.ply === gv.ply, `online: both see the same ending (${hv.reason}, ${hv.ply} moves)`);
  check(leaks === 0, 'online: no colour crossed over during the game');
  await guest.waitForSelector('#result:not([hidden])');
  await shot(guest, 'online-4-result');
  check(host.errors.length === 0 && guest.errors.length === 0, 'online: no page errors: ' + host.errors.concat(guest.errors).join(' | '));
  await ctx.close();
}

try {
  await sleep(400);
  const browser = await playwright.chromium.launch();
  if (!ONLY || ONLY === 'title') await title(browser);
  if (!ONLY || ONLY === 'cpu') {
    await cpuGame(browser, { width: 390, height: 844 }, 'phone', 2, true);
    await cpuGame(browser, { width: 844, height: 390 }, 'landscape', 1, true);
    await cpuGame(browser, { width: 1280, height: 800 }, 'desktop', 3, false);
    await resumeCheck(browser);
  }
  if (!ONLY || ONLY === 'local') await localGame(browser);
  if (!ONLY || ONLY === 'online') await onlineGame(browser);
  await browser.close();
} catch (e) {
  console.error(e);
  failures.push(String(e && e.message || e));
} finally {
  server.kill();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
