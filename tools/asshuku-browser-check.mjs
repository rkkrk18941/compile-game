// アッシュク・エイト: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/asshuku-browser-check.mjs              a CPU game and a solo game on a phone, a CPU game on desktop,
//                                                      then an online game in two tabs
//   node tools/asshuku-browser-check.mjs --shots DIR  also save screenshots into DIR
// Moves are made the way a player would: tapping cards on the note mat and the 0 / 1 buttons. The test peeks at
// the top card (?test=1) so it can answer right, and answers wrong on purpose to see a penalty.
// Needs Playwright (npm i -g playwright) and Chromium. ASE_CHROMIUM=/path/to/chrome overrides the browser.
// ASE_VENDOR=/path/to/node_modules serves the fonts (@fontsource/dotgothic16, @fontsource/zen-kaku-gothic-new)
// and PeerJS from local copies instead of the CDN. The online part runs over BroadcastChannel (?net=local).
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
const PORT = 8797, BASE = `http://localhost:${PORT}/asshuku-eight/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.ASE_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss() {
  if (!VENDOR) return '';
  const parts = [['@fontsource/dotgothic16', ['400']], ['@fontsource/zen-kaku-gothic-new', ['500', '700', '900']]];
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
  await ctx.route(/peerjs@1\.5\.4\/dist\/peerjs\.min\.js/, (r) => (VENDOR ? r.fulfill({ path: path.join(VENDOR, 'peerjs/dist/peerjs.min.js'), contentType: 'text/javascript' }) : r.abort()));
}
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_FAILED|net::/.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const waitFor = (page, fn, arg, ms = 60000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 });
const loaded = (page) => waitFor(page, () => document.querySelector('#loader').hidden);
const settled = (page) => waitFor(page, () => { const a = window.__ase; return a && a.view && !a.presenting && a.queue === 0 && !(a.match && a.match.waiting); });
/* wait until it is my move or the game is over; returns 'answer' | 'add' | 'over' */
async function myMove(page, ms = 90000) {
  await waitFor(page, () => { const a = window.__ase; if (!a || !a.view || a.presenting || a.queue) return false; return a.view.phase === 'over' || a.myTurn(); }, null, ms);
  return page.evaluate(() => window.__ase.view.phase);
}
async function tapCard(page, id) {
  const el = page.locator(`#mat .nc[data-id="${id}"]`);
  await el.click({ force: true });
}
/* play my move like a person: tap a card then 出す, or press 0 / 1 */
async function playMove(page, wrong) {
  const ph = await page.evaluate(() => window.__ase.view.phase);
  if (ph === 'add') {
    const id = await page.evaluate(() => window.__ase.view.hand.find((c) => c < 100));
    await tapCard(page, id);
    await page.click('#aAdd');
    return 'add';
  }
  if (ph === 'answer') {
    const top = await page.evaluate(() => window.__ase.top());
    const v = wrong ? 1 - top : top;
    await page.click(v ? '#a1' : '#a0');
    return 'answer';
  }
  return ph;
}

async function phoneGame(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, 'phone', errors);
  await page.goto(BASE + '?test=1&speed=5');
  await loaded(page);
  await sleep(300);
  await shot(page, '01-title');
  check(await page.isVisible('#scrTitle'), 'title screen');
  await page.click('#goRules');
  await sleep(250);
  await shot(page, '02-rules');
  check(await page.locator('.sheet').count() === 1, 'rules sheet opens');
  await page.click('[data-close]');
  await page.click('#goCpu');
  await page.click('#segCount button[data-v="3"]');
  await page.click('#segLevel button[data-v="1"]');
  await page.click('#cpuStart');
  await waitFor(page, () => window.__ase && window.__ase.view && document.querySelectorAll('#mat .nc').length === 8);
  await sleep(500);
  await shot(page, '03-start');
  check(await page.locator('#mat .nc').count() === 8, 'eight cards on the mat');
  check(await page.locator('#seats .seat').count() === 3, 'three seats');

  // note mat: drag, rotate, flip, order
  const id0 = await page.evaluate(() => window.__ase.view.hand[0]);
  const card = page.locator(`#mat .nc[data-id="${id0}"]`);
  const b = await card.boundingBox();
  const before = await page.evaluate((id) => { const c = window.__ase.mat.cards.get(id); return [c.cx, c.cy]; }, id0);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2 + i * 6, b.y + b.height / 2 - i * 14);
  await page.mouse.up();
  const after = await page.evaluate((id) => { const c = window.__ase.mat.cards.get(id); return [c.cx, c.cy]; }, id0);
  check(after[1] < before[1] - 1 && after[0] > before[0], 'a card can be dragged across the mat');
  check(await page.evaluate((id) => window.__ase.mat.sel === id, id0), 'dragging selects the card');
  await card.click({ force: true });
  check(await page.evaluate((id) => window.__ase.mat.cards.get(id).r === 45, id0), 'tapping the selected card turns it 45°');
  await card.click({ force: true });
  check(await page.evaluate((id) => window.__ase.mat.cards.get(id).r === 90, id0), 'and again to 90°');
  await page.click('#tFlip');
  check(await page.evaluate((id) => window.__ase.mat.cards.get(id).f === true, id0), 'the flip tool turns it face down');
  await page.click('#tFlip');
  await page.click('#tDown');
  check(await page.evaluate((id) => window.__ase.mat.z[0] === id, id0), 'send to the bottom of the pile');
  await page.mouse.click(5, (await page.locator('#mat').boundingBox()).y + 5);
  check(await page.evaluate(() => window.__ase.mat.sel === null), 'tapping the mat clears the selection');
  await shot(page, '04-notes');

  // play: right answers, one wrong one, until the game ends
  let moves = 0, wrongDone = false, sawPenalty = false, sawRecycle = false, guard = 0, firstAdd = true, firstAns = true;
  while (guard++ < 400) {
    const ph = await myMove(page);
    if (ph === 'over') break;
    const len = await page.evaluate(() => window.__ase.view.len);
    const wrong = !wrongDone && ph === 'answer' && len >= 4;
    if (ph === 'add' && firstAdd) {
      firstAdd = false;
      const id = await page.evaluate(() => window.__ase.view.hand.find((c) => c < 100));
      await tapCard(page, id);
      await sleep(150);
      await shot(page, '05-add-phase');
      check(await page.isEnabled('#aAdd'), 'the lay button wakes up once a card is chosen');
    }
    if (ph === 'answer' && firstAns) { firstAns = false; await shot(page, '05b-answer-turn'); check(await page.isVisible('#a0') && await page.isVisible('#a1'), 'answer buttons on my turn'); }
    await playMove(page, wrong);
    moves++;
    if (wrong) {
      wrongDone = true;
      await waitFor(page, () => document.querySelector('#stamp').classList.contains('show'), null, 8000);
      await shot(page, '07-penalty');
      await settled(page);
      sawPenalty = await page.evaluate(() => window.__ase.view.pens[window.__ase.match.me] === 1 && window.__ase.view.hand.some((c) => c >= 100));
    }
    if (moves === 3) { await sleep(120); await shot(page, '06-reveal'); }
    if (!sawRecycle) sawRecycle = await page.evaluate(() => window.__ase.view.round >= 2);
    if (moves > 60) break;   // enough for the phone check; finish with deliberate mistakes
  }
  check(moves > 5, 'played ' + moves + ' moves');
  check(sawPenalty, 'a wrong answer gives a penalty card that lands on the mat');
  check(sawRecycle, 'rounds come around');
  // lose on purpose to see the end
  let over = false;
  for (let k = 0; k < 400 && !over; k++) {
    const ph = await myMove(page);
    if (ph === 'over') { over = true; break; }
    await playMove(page, ph === 'answer');
  }
  check(over, 'the game ends');
  await waitFor(page, () => !!document.querySelector('.sheet .result-big'), null, 15000);
  await sleep(300);
  await shot(page, '08-result');
  const res = await page.evaluate(() => ({ head: document.querySelector('.result-big').textContent, line: document.querySelectorAll('.lineview .mini').length, len: window.__ase.view.result.len }));
  check(res.line === res.len && res.len > 0, 'the result shows the whole line (' + res.len + ' cards)');
  await page.click('#rAgain');
  await waitFor(page, () => window.__ase.view && window.__ase.view.phase !== 'over' && document.querySelectorAll('#mat .nc').length === 8);
  check(true, 'play again');
  // solo
  await page.click('#btnMenu');
  await page.click('[data-m="title"]');
  await page.click('#qYes');
  await page.click('#goSolo');
  await page.click('#segTarget button[data-v="20"]');
  await page.click('#soloStart');
  let soloOver = false;
  for (let k = 0; k < 400; k++) {
    const ph = await myMove(page);
    if (ph === 'over') { soloOver = true; break; }
    await playMove(page, false);
  }
  check(soloOver, 'a solo run to 20 cards');
  await waitFor(page, () => !!document.querySelector('.sheet .result-big'), null, 15000);
  const head = await page.textContent('.result-big');
  check(/クリア/.test(head), 'clear: ' + head);
  await shot(page, '09-solo-clear');
  check(errors.length === 0, 'no errors on the phone' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function desktop(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, locale: 'ja-JP' });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, 'desktop', errors);
  await page.goto(BASE + '?test=1&speed=5');
  await loaded(page);
  await page.click('#goCpu');
  await page.click('#segCount button[data-v="7"]');
  await page.click('#cpuStart');
  await waitFor(page, () => window.__ase && window.__ase.view && document.querySelectorAll('#mat .nc').length === 8);
  for (let k = 0; k < 12; k++) {
    const ph = await myMove(page);
    if (ph === 'over') break;
    if (ph === 'answer') { const top = await page.evaluate(() => window.__ase.top()); await page.keyboard.press(String(top)); }
    else await playMove(page, false);
  }
  await sleep(200);
  await shot(page, '10-desktop');
  check(await page.locator('#seats .seat').count() === 7, 'seven seats on desktop');
  check(errors.length === 0, 'no errors on desktop' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

async function online(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ja-JP' });
  await prep(ctx);
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watchErrors(host, 'host', errors); watchErrors(guest, 'guest', errors);
  await host.goto(BASE + '?test=1&speed=5&net=local');
  await guest.goto(BASE + '?test=1&speed=5&net=local');
  await loaded(host); await loaded(guest);
  await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
  await waitFor(host, () => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent));
  const code = await host.textContent('#lobCode');
  await guest.click('#goOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.click('#onJoin');
  await waitFor(host, () => document.querySelectorAll('#lobSeats .lseat').length === 2);
  await host.click('#lobAddCpu');
  await waitFor(guest, () => document.querySelectorAll('#lobSeats .lseat').length === 3);
  check(true, 'lobby: host, guest and a CPU');
  await shot(guest, '11-lobby');
  await host.click('#lobStart');
  await waitFor(guest, () => window.__ase && window.__ase.view && document.querySelectorAll('#mat .nc').length === 8);
  check(await guest.evaluate(() => window.__ase.view.me) === 1, 'the guest sits in seat 2');
  check(await guest.evaluate(() => window.__ase.top() === null), 'the guest cannot see the memory pile');
  let turns = 0;
  for (let k = 0; k < 60 && turns < 14; k++) {
    for (const [pg, tag] of [[host, 'h'], [guest, 'g']]) {
      const mine = await pg.evaluate(() => { const a = window.__ase; return !!(a && a.view && !a.presenting && !a.queue && a.myTurn()); });
      if (!mine) continue;
      const ph = await pg.evaluate(() => window.__ase.view.phase);
      if (ph === 'add') { const id = await pg.evaluate(() => window.__ase.view.hand.find((c) => c < 100)); await tapCard(pg, id); await pg.click('#aAdd'); }
      else {
        // the guest asks the host page for the answer (it cannot see the pile itself)
        const top = await host.evaluate(() => window.__ase.top());
        await pg.click(top ? '#a1' : '#a0');
      }
      turns++;
    }
    await sleep(150);
  }
  check(turns >= 8, 'host and guest took ' + turns + ' turns');
  await settled(host); await settled(guest);
  const same = await Promise.all([host.evaluate(() => ({ len: window.__ase.view.len, turn: window.__ase.view.turn, pens: window.__ase.view.pens })), guest.evaluate(() => ({ len: window.__ase.view.len, turn: window.__ase.view.turn, pens: window.__ase.view.pens }))]);
  check(JSON.stringify(same[0]) === JSON.stringify(same[1]), 'host and guest agree on the table ' + JSON.stringify(same[0]));
  await shot(guest, '12-online-guest');
  // a reload keeps the guest's seat and their notes
  const before = await guest.evaluate(() => { const m = window.__ase.mat; const id = m.z[m.z.length - 1]; const c = m.cards.get(id); return { id, cx: c.cx, cy: c.cy }; });
  await guest.evaluate((id) => { const c = window.__ase.mat.cards.get(id); c.cx += 1; c.r = 90; }, before.id);
  await guest.click(`#mat .nc[data-id="${before.id}"]`, { force: true });   // select (the click saves nothing yet)
  await guest.evaluate(() => { const m = window.__ase.mat; m.cards.forEach(() => {}); });
  await guest.click('#tUp');   // saves the layout
  await guest.reload();
  await loaded(guest);
  await waitFor(guest, () => window.__ase && window.__ase.view && document.querySelectorAll('#mat .nc').length >= 8, null, 20000);
  const back = await guest.evaluate((id) => { const c = window.__ase.mat.cards.get(id); return c ? { cx: c.cx, r: c.r } : null; }, before.id);
  check(back && Math.abs(back.cx - (before.cx + 1)) < 0.01 && back.r === 90, 'after a reload the guest is back with the same notes');
  check(errors.length === 0, 'no errors online' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

let browser;
try {
  await sleep(400);
  browser = await playwright.chromium.launch({ executablePath: process.env.ASE_CHROMIUM || undefined, args: ['--disable-gpu'] });
  await phoneGame(browser);
  await desktop(browser);
  await online(browser);
} catch (e) {
  console.error(e);
  failures.push(String(e && e.message || e));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(failures.length ? `\n${failures.length} problem(s)` : '\nall good');
process.exit(failures.length ? 1 : 0);
