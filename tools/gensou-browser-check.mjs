// ゲンソウ・セブン: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/gensou-browser-check.mjs              a CPU game on a phone played by tapping, a two-player game with the
//                                                     two-player variant, a six-player game on a desktop, then an online
//                                                     game between two tabs (?net=local, BroadcastChannel)
//   node tools/gensou-browser-check.mjs --shots DIR  also save screenshots into DIR
// Every score shown on screen is compared with the engine's own best score for that hand.
// Needs Playwright (npm i -g playwright) and Chromium. GS_VENDOR=/path/to/node_modules serves the fonts
// (@fontsource/zen-antique, @fontsource/biz-udpgothic) from local copies instead of Google Fonts.
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
const PORT = 8799, BASE = `http://localhost:${PORT}/gensou-seven/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.GS_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss() {
  if (!VENDOR) return '';
  let css = '';
  for (const [pkg, files] of [['@fontsource/zen-antique', ['400.css']], ['@fontsource/biz-udpgothic', ['400.css', '700.css']]]) {
    for (const f of files) {
      const p = path.join(VENDOR, pkg, f);
      if (fs.existsSync(p)) css += fs.readFileSync(p, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg.split('/')[1] + '/');
    }
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
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_FAILED|net::/.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const waitFor = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
const idle = (page) => waitFor(page, () => { const g = window.__gs; return g && !g.busy && !g.app.pending && !document.querySelector('#fly').children.length; });
/* wait until it is my move or the game is over; returns 'draw' | 'discard' | 'over' */
async function myMove(page, ms = 120000) {
  await waitFor(page, () => { const g = window.__gs; const v = g && g.app.v; if (!v || g.busy || g.app.pending) return false; return v.over || v.turn === v.me; }, null, ms);
  return page.evaluate(() => { const v = window.__gs.app.v; return v.over ? 'over' : v.phase; });
}
/* the score on screen must be the engine's best score for that hand */
async function realmMatchesEngine(page) {
  return page.evaluate(() => {
    const g = window.__gs, v = g.app.v, E = g.E;
    if (!v.hand.length || (v.phase === 'discard' && v.turn === v.me)) return true;
    const shown = parseInt(document.querySelector('#realmScore').textContent, 10);
    return shown === E.bestChoice(v.hand).total;
  });
}
/* play one move like a person: deck or a face-up card, then a card to discard */
async function playMove(page, k) {
  const ph = await page.evaluate(() => window.__gs.app.v.phase);
  if (ph === 'draw') {
    const n = await page.evaluate((k) => {
      const v = window.__gs.app.v;
      // take from the discard area now and then (the CPU's choice), otherwise draw from the deck
      const a = window.GS_AI.choose(v, { level: 'normal', seed: k });
      return a && a.t === 'take' ? a.id : null;
    }, k);
    if (n != null) {
      await page.click(`#discard .mini[data-n="${n}"]`);
      await page.click('.sheet [data-take]');
      return 'take';
    }
    await page.click('#actions [data-act="deck"]');
    return 'deck';
  }
  if (ph === 'discard') {
    const n = await page.evaluate((k) => {
      const v = window.__gs.app.v;
      const a = window.GS_AI.choose(v, { level: k % 3 ? 'normal' : 'easy', seed: k });
      return a.id;
    }, k);
    await page.click(`#rows .row[data-n="${n}"]`);
    await page.click('#actions [data-act="discard"]');
    return 'discard';
  }
  return ph;
}
/* every score in the results equals the engine's best final score for that hand and the discard area */
async function resultsMatchEngine(page) {
  return page.evaluate(() => {
    const g = window.__gs, v = g.app.v, E = g.E;
    if (!v.over || !v.result) return 'not over';
    const ranks = [...document.querySelectorAll('#result .rank')];
    if (ranks.length !== v.players.length) return 'rank count ' + ranks.length;
    const shown = ranks.map((r) => +r.querySelector('.pts').textContent);
    const want = v.result.order.map((seat) => E.bestFinal(v.hands[seat], v.discard).total);
    if (shown.join() !== want.join()) return 'shown ' + shown.join() + ' engine ' + want.join();
    const top = Math.max(...want);
    const tops = v.result.order.filter((seat) => E.bestFinal(v.hands[seat], v.discard).total === top);
    const lowBase = Math.min(...tops.map((seat) => E.bestFinal(v.hands[seat], v.discard).baseTotal));
    const winners = tops.filter((seat) => E.bestFinal(v.hands[seat], v.discard).baseTotal === lowBase);
    if (winners.join() !== v.result.winners.slice().sort((a, b) => a - b).join() && winners.slice().sort((a, b) => a - b).join() !== v.result.winners.slice().sort((a, b) => a - b).join()) return 'winners';
    return 'ok';
  });
}

async function phoneGame(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, 'phone', errors);
  await page.goto(BASE + '?test=1&seed=5');
  await waitFor(page, () => document.querySelector('#loader').hidden);
  await shot(page, '01-title');
  check(await page.isVisible('#scrTitle'), 'title screen');
  check(await page.locator('#hero .fan > g').count() === 7, 'seven cards held up on the title');
  await page.click('#goRules');
  check(await page.locator('#rules .tabs button').count() === 4, 'rules sheet with four tabs');
  await page.click('[data-tab="cards"]');
  check(await page.locator('#rules .row').count() === 53, 'the card list shows all 53 cards');
  await page.click('#rules [data-suit="flood"]');
  check(await page.locator('#rules .row').count() === 5, 'filtering by suit shows the five Floods');
  await page.click('[data-tab="score"]');
  check((await page.textContent('#rulesBody')).includes('解決の順番'), 'the scoring rules explain the order of resolution');
  await shot(page, '02-rules');
  await page.click('#rules [data-close]');
  await page.click('#goCpu');
  await page.click('#segCount button[data-v="4"]');
  await page.click('#segLevel button[data-v="normal"]');
  await page.click('#cpuStart');
  await waitFor(page, () => window.__gs && window.__gs.app.v && document.querySelectorAll('#rows .row').length === 7);
  check(await page.locator('#rivals .rival').count() === 3, 'three opponents');
  check(await realmMatchesEngine(page), 'the realm score is the engine\'s best score');
  await shot(page, '03-start');
  let moves = 0, takes = 0, guard = 0, checkedScore = 0;
  while (guard++ < 200) {
    const ph = await myMove(page);
    if (ph === 'over') break;
    if (ph === 'draw' && checkedScore < 3) { checkedScore++; check(await realmMatchesEngine(page), 'score check before my move ' + checkedScore); }
    if (ph === 'discard' && moves < 2) {
      await shot(page, '04-discard');
      const previews = await page.locator('#rows .preview').count();
      check(previews === 8, 'eight discard choices, each with its score preview');
    }
    const r = await playMove(page, moves);
    if (r === 'take') takes++;
    moves++;
  }
  check(moves >= 4, 'played ' + moves + ' actions (' + takes + ' taken from the discard area)');
  await waitFor(page, () => document.querySelector('#result'), null, 20000);
  await sleep(200);
  await shot(page, '05-result');
  const res = await resultsMatchEngine(page);
  check(res === 'ok', 'results equal the engine\'s final scores (' + res + ')');
  const v = await page.evaluate(() => window.__gs.app.v);
  check(v.discard.length === 10, 'the game ended with 10 cards in the discard area');
  check(v.hands.every((h) => h.length === 7), 'everyone ends with seven cards');
  check(errors.length === 0, 'no page errors on the phone' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

async function twoPlayerGame(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, '2p', errors);
  await page.goto(BASE + '?test=1&seed=9');
  await waitFor(page, () => document.querySelector('#loader').hidden);
  await page.click('#goCpu');
  await page.click('#segCount button[data-v="2"]');
  check(await page.isVisible('#cpuVariantRow'), 'the two-player variant switch appears for two players');
  if (!(await page.isChecked('#cpuVariant'))) await page.click('#cpuVariant');
  await page.click('#cpuStart');
  await waitFor(page, () => window.__gs && window.__gs.app.v);
  const v0 = await page.evaluate(() => window.__gs.app.v);
  check(v0.variant && v0.hand.length === 0 && v0.handSizes.every((n) => n === 0), 'two-player variant: nobody starts with cards');
  let sawDraw2 = false, sawTakeNoDiscard = false, guard = 0;
  while (guard++ < 200) {
    const ph = await myMove(page);
    if (ph === 'over') break;
    const st = await page.evaluate(() => { const v = window.__gs.app.v; return { n: v.hand.length, discard: v.discard.length, phase: v.phase }; });
    if (ph === 'draw' && st.n < 7) {
      if (!sawTakeNoDiscard && st.discard > 0 && st.n >= 2) {
        const n = await page.evaluate(() => window.__gs.app.v.discard[0]);
        await page.click(`#discard .mini[data-n="${n}"]`);
        await page.click('.sheet [data-take]');
        await idle(page);
        const after = await page.evaluate(() => { const v = window.__gs.app.v; return { n: v.hand[v.hand.length - 1], len: v.handSizes[v.me], turn: v.turn, me: v.me }; });
        check(after.len === st.n + 1 && after.turn !== after.me, 'taking a face-up card while collecting needs no discard');
        sawTakeNoDiscard = true;
        continue;
      }
      await page.click('#actions [data-act="deck"]');
      await idle(page);
      const d = await page.evaluate(() => { const v = window.__gs.app.v; return { two: v.drawn2, n: v.hand.length, sel: document.querySelectorAll('#rows .row[role="button"]').length }; });
      if (!sawDraw2) { await shot(page, '06-two-drawn'); check(d.two && d.two.length === 2 && d.n === st.n + 2 && d.sel === 2, 'drawing two: only those two can be discarded'); sawDraw2 = true; }
      await page.click(`#rows .row[data-n="${d.two[1]}"]`);
      await page.click('#actions [data-act="discard"]');
      continue;
    }
    await playMove(page, guard);
  }
  check(sawDraw2 && sawTakeNoDiscard, 'both collecting moves were used');
  await waitFor(page, () => document.querySelector('#result'), null, 20000);
  const v = await page.evaluate(() => window.__gs.app.v);
  check(v.hands.every((h) => h.length === 7) && v.discard.length >= 12, 'two-player end: both have 7 cards and the discard area holds ' + v.discard.length + ' (12 or more)');
  check(await resultsMatchEngine(page) === 'ok', 'two-player results equal the engine');
  check(errors.length === 0, 'no page errors in the two-player game' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

async function desktopGame(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, 'desktop', errors);
  await page.goto(BASE + '?test=1&seed=13');
  await waitFor(page, () => document.querySelector('#loader').hidden);
  await page.click('#goCpu');
  await page.click('#segCount button[data-v="6"]');
  await page.click('#cpuStart');
  await waitFor(page, () => window.__gs && window.__gs.app.v);
  check(await page.locator('#rivals .rival').count() === 5, 'six players: five opponents');
  check(await page.isVisible('#history'), 'the move log is shown on a wide screen');
  let guard = 0;
  while (guard++ < 200) {
    const ph = await myMove(page);
    if (ph === 'over') break;
    if (guard === 2) await shot(page, '07-desktop');
    await page.evaluate(() => { const g = window.__gs; g.ctl.act(window.GS_AI.choose(g.app.v, { level: 'normal' })); });
  }
  await waitFor(page, () => document.querySelector('#result'), null, 20000);
  await sleep(200);
  await shot(page, '08-desktop-result');
  check(await resultsMatchEngine(page) === 'ok', 'six-player results equal the engine');
  check(errors.length === 0, 'no page errors on the desktop' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

async function onlineGame(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await prep(ctx);
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watchErrors(host, 'host', errors); watchErrors(guest, 'guest', errors);
  await host.goto(BASE + '?test=1&net=local');
  await guest.goto(BASE + '?test=1&net=local');
  for (const p of [host, guest]) await waitFor(p, () => document.querySelector('#loader').hidden);
  await host.click('#goOnline');
  await host.fill('#onName', 'ホスト');
  await host.click('#onCreate');
  await waitFor(host, () => !document.querySelector('#scrLobby').hidden);
  const code = (await host.textContent('#lobCode')).trim();
  check(/^[A-Z2-9]{4}$/.test(code), 'room code ' + code);
  await guest.click('#goOnline');
  await guest.fill('#onName', 'ゲスト');
  await guest.fill('#onCode', code);
  await guest.click('#onJoin');
  await waitFor(guest, () => !document.querySelector('#scrLobby').hidden);
  await waitFor(host, () => document.querySelectorAll('#lobSeats .seat').length === 2);
  check(true, 'the guest joined the room');
  await host.click('#lobAddCpu');
  await waitFor(guest, () => document.querySelectorAll('#lobSeats .seat').length === 3);
  check(true, 'a CPU seat shows up on both screens');
  await shot(guest, '09-lobby');
  await host.click('#lobStart');
  await waitFor(guest, () => window.__gs && window.__gs.app.v && document.body.classList.contains('ingame'));
  await waitFor(host, () => window.__gs && window.__gs.app.v);
  const seats = await guest.evaluate(() => window.__gs.app.v.players.map((p) => p.name));
  check(seats.join() === 'ホスト,ゲスト,アルデン', 'seats in order: ' + seats.join());
  // the guest's hand is the host's record of that seat, and the guest never sees other hands
  const same = await Promise.all([
    host.evaluate(() => window.__gs.ctl.table.st.hands[1].slice().sort((a, b) => a - b).join()),
    guest.evaluate(() => window.__gs.app.v.hand.slice().sort((a, b) => a - b).join()),
    guest.evaluate(() => window.__gs.app.v.hands)
  ]);
  check(same[0] === same[1] && same[2] === null, 'the guest sees exactly its own hand');
  let guard = 0, hostMoves = 0, guestMoves = 0, k = 0;
  while (guard++ < 400) {
    const st = await host.evaluate(() => { const t = window.__gs.ctl.table.st; return t.over ? 'over' : t.turn; });
    if (st === 'over') break;
    if (st === 0) { const ph = await myMove(host); if (ph === 'over') break; await playMove(host, k++); hostMoves++; }
    else if (st === 1) { const ph = await myMove(guest); if (ph === 'over') break; await playMove(guest, k++); guestMoves++; }
    else await sleep(80);
  }
  check(hostMoves > 2 && guestMoves > 2, 'both people played (' + hostMoves + ' and ' + guestMoves + ' actions)');
  await waitFor(guest, () => document.querySelector('#result'), null, 30000);
  await waitFor(host, () => document.querySelector('#result'), null, 30000);
  await shot(guest, '10-online-result');
  const rh = await host.evaluate(() => [...document.querySelectorAll('#result .rank .pts')].map((e) => e.textContent).join());
  const rg = await guest.evaluate(() => [...document.querySelectorAll('#result .rank .pts')].map((e) => e.textContent).join());
  check(rh === rg && rh.length > 0, 'host and guest show the same results (' + rh + ')');
  check(await resultsMatchEngine(guest) === 'ok', 'the guest\'s results equal the engine');
  // again: back to the room
  await host.click('#result [data-act="again"]');
  await waitFor(guest, () => !document.querySelector('#scrLobby').hidden, null, 10000);
  check(true, '"もう一度" brings both back to the room');
  check(errors.length === 0, 'no page errors online' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

let browser;
try {
  await sleep(400);
  browser = await playwright.chromium.launch(process.env.GS_CHROMIUM ? { executablePath: process.env.GS_CHROMIUM } : {});
  await phoneGame(browser);
  await twoPlayerGame(browser);
  await desktopGame(browser);
  await onlineGame(browser);
} catch (e) {
  failures.push('crashed: ' + (e && e.stack || e));
  console.log('FAIL crashed:', e);
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
