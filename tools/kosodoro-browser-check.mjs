// コソドロ・マイン: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/kosodoro-browser-check.mjs              title, CPU games on a phone (portrait, with a reload and
//                                                       "続きから"), a phone held sideways and a desktop, then an online
//                                                       game in two tabs
//   node tools/kosodoro-browser-check.mjs --shots DIR  also save screenshots into DIR
//   node tools/kosodoro-browser-check.mjs --only cpu   run one part: title, cpu, side, desktop, online
// Cards are played the way a player would, by tapping a card and the button. ?test=1 shortens the animations;
// ?net=local runs the online room over a BroadcastChannel between the two tabs instead of the PeerJS server.
// Needs Playwright (npm i -g playwright) and Chromium. KOSO_VENDOR=/path/to/node_modules serves the fonts
// (@fontsource/zen-antique-soft, @fontsource/zen-maru-gothic) from local copies instead of Google Fonts.
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
const PORT = 8797, BASE = `http://localhost:${PORT}/kosodoro-mine/`;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SHOTS = arg('--shots'), ONLY = arg('--only');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.KOSO_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss() {
  if (!VENDOR) return '';
  let css = '';
  for (const [pkg, files] of [['zen-antique-soft', ['index.css']], ['zen-maru-gothic', ['500.css', '700.css', '900.css']]]) {
    for (const f of files) {
      const p = path.join(VENDOR, '@fontsource', pkg, f);
      if (fs.existsSync(p)) css += fs.readFileSync(p, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg + '/');
    }
  }
  return css;
}
async function prep(ctx) {
  const css = fontCss();
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, body: css, contentType: 'text/css' }));
  await ctx.route(/fonts\.gstatic\.com/, (r) => {
    const m = r.request().url().match(/local\/([^/]+)\/(.+)$/);
    const f = m && path.join(VENDOR, '@fontsource', m[1], 'files', m[2]);
    if (f && fs.existsSync(f)) r.fulfill({ path: f, contentType: 'font/woff2' }); else r.fulfill({ status: 404, body: '' });
  });
  await ctx.route(/game-bgm\.mjs/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/javascript' }));   // no music in tests
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function newContext(browser, viewport, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: !!touch, isMobile: !!touch });
  await prep(ctx);
  return ctx;
}
async function newPage(ctx, prefs) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.errors = errors;
  if (prefs) await page.addInitScript((p) => { try { if (!sessionStorage.getItem('koso.test.init')) { localStorage.setItem('kosodoro.prefs', JSON.stringify(p)); sessionStorage.setItem('koso.test.init', '1'); } } catch (e) {} }, prefs);
  return page;
}

/* the state of my own hand: 'over', 'wait', or 'pick:<legal cards>' */
const handState = (page) => page.evaluate(() => {
  const A = window.KOSO_APP; if (!A || !A.shown) return 'none';
  if (A.shown.ph === 'over' && !A.busy) return 'over';
  const hw = document.querySelector('#handWrap'), btn = document.querySelector('#btnCommit');
  if (A.busy || hw.hidden || btn.textContent.indexOf('出しました') === 0) return 'wait';
  const legal = [...document.querySelectorAll('.pcard')].filter((b) => !b.hidden && !b.disabled).map((b) => b.dataset.a);
  return legal.length ? 'pick:' + legal.join('') : 'wait';
});
/* play my cards until the game is over (or `rounds` of my picks were made) */
async function play(page, { rounds = Infinity, prefer = 'wwswgwx', limit = 240000, onPick = null } = {}) {
  const t0 = Date.now();
  let picks = 0;
  while (Date.now() - t0 < limit) {
    const st = await handState(page);
    if (st === 'over') return { over: true, picks };
    if (st.startsWith('pick:')) {
      if (picks >= rounds) return { over: false, picks };
      const legal = st.slice(5);
      let a = prefer[picks % prefer.length];
      if (legal.indexOf(a) < 0) a = legal[0];
      await page.click(`.pcard[data-a="${a}"]`);
      const label = await page.textContent('#btnCommit');
      if (label.indexOf('この札を出す') === 0) { await page.click('#btnCommit'); picks++; if (onPick) await onPick(picks); }
    }
    await sleep(30);
  }
  return { over: false, picks, timeout: true };
}
/* nothing sticks out sideways, the table fits, my cards and the button are on screen */
const layout = (page) => page.evaluate(() => {
  const t = document.querySelector('#table'), btn = document.querySelector('#btnCommit').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.pcard')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect());
  return {
    hscroll: document.documentElement.scrollWidth - innerWidth,
    tableOver: t.scrollHeight - t.clientHeight,
    cardsOn: cards.every((r) => r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1),
    buttonOn: btn.bottom <= innerHeight + 1 && btn.top >= 0,
    tags: document.querySelectorAll('#board .tag').length
  };
});
const resultText = (page) => page.evaluate(() => { const d = document.querySelector('#dlgResult'); return d && d.open ? d.textContent : ''; });

async function partTitle(browser) {
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await newPage(ctx);
  await page.goto(BASE);
  await page.waitForSelector('#scrTitle:not([hidden])');
  const t = await page.evaluate(() => ({ h1: document.querySelector('.logo').getAttribute('aria-label'), lineup: document.querySelectorAll('#lineup svg').length, home: document.querySelector('.home').getAttribute('href'), credit: document.querySelector('.credit').textContent }));
  check(t.h1 === 'コソドロ・マイン', 'title: the sign reads コソドロ・マイン');
  check(t.lineup === 8, 'title: eight miners in the lineup');
  check(t.home === '../games/', 'title: a way back to PLAYROOM');
  check(/こそどろ鉱山/.test(t.credit) && /非公式/.test(t.credit), 'title: credits the original and says it is unofficial');
  await page.click('#goRules');
  await page.waitForSelector('#dlgRules[open]');
  const r = await page.evaluate(() => ({ cards: document.querySelectorAll('#rulesCards > div').length, abil: document.querySelectorAll('#rulesAbil > div').length }));
  check(r.cards === 3 && r.abil === 8, 'title: the rules show the 3 cards and all 8 special cards');
  await shot(page, 'title-rules');
  check(page.errors.length === 0, 'title: no errors ' + page.errors.slice(0, 2).join(' | '));
  await ctx.close();
}

async function partCpu(browser) {
  // a phone in portrait: 5 players with the special cards; reload in the middle and continue
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const page = await newPage(ctx, { sound: false, count: 5, adv: true, ani: 6, name: 'テスト', level: 2, mult: 3 });
  await page.goto(BASE + '?test=1');
  await page.click('#goSolo');
  await page.waitForSelector('#scrSolo:not([hidden])');
  check(await page.evaluate(() => document.querySelectorAll('#soloAnimals button').length === 8), 'cpu: eight animals to choose from');
  await page.click('#soloStart');
  await page.waitForSelector('#game:not([hidden])');
  await sleep(500);
  const l = await layout(page);
  check(l.tags === 5 && l.hscroll <= 0 && l.tableOver <= 4 && l.cardsOn && l.buttonOn, 'cpu: phone layout fits ' + JSON.stringify(l));
  check(await page.evaluate(() => !document.querySelector('.pcard[data-a="x"]').hidden), 'cpu: the special card is in the hand');
  await shot(page, 'cpu-phone');
  const first = await play(page, { rounds: 6 });
  check(first.picks === 6 || first.over, 'cpu: six cards played by tapping');
  const before = await page.evaluate(() => { const s = window.KOSO_APP.session.state; return { turn: s.turn, ore: s.P.map((p) => p.ore).join(','), over: s.ph === 'over' }; });
  if (!before.over) {
    await page.waitForFunction(() => !window.KOSO_APP.busy, null, { timeout: 15000 });
    const saved = await page.evaluate(() => { const s = window.KOSO_APP.session.state; return { turn: s.turn, ore: s.P.map((p) => p.ore).join(',') }; });
    await page.reload();
    await page.waitForSelector('#scrTitle:not([hidden])');
    check(await page.isVisible('#goResume'), 'cpu: after a reload the title offers 続きから遊ぶ');
    await page.click('#goResume');
    await page.waitForSelector('#game:not([hidden])');
    await sleep(300);
    const after = await page.evaluate(() => { const s = window.KOSO_APP.session.state; return { turn: s.turn, ore: s.P.map((p) => p.ore).join(',') }; });
    check(after.turn === saved.turn && after.ore === saved.ore, `cpu: the game continues where it was (turn ${saved.turn})`);
  }
  const end = await play(page, {});
  check(end.over, 'cpu: the game reaches its end');
  await page.waitForSelector('#dlgResult[open]', { timeout: 10000 }).catch(() => {});
  const res = await resultText(page);
  check(/の勝ち/.test(res), 'cpu: the result names a winner');
  await shot(page, 'cpu-phone-result');
  check(!(await page.isVisible('#goResume').catch(() => false)), 'cpu: a finished game is not offered to continue');
  check(page.errors.length === 0, 'cpu: no errors ' + page.errors.slice(0, 2).join(' | '));
  await ctx.close();
}

async function partSide(browser) {
  // a phone held sideways: the hand sits beside the table; 8 players
  const ctx = await newContext(browser, { width: 844, height: 390 }, true);
  const page = await newPage(ctx, { sound: false, count: 8, adv: true, ani: 0, name: 'ヨコ', level: 1, mult: 3 });
  await page.goto(BASE + '?test=1');
  await page.click('#goSolo'); await page.click('#soloStart');
  await page.waitForSelector('#game:not([hidden])');
  await sleep(500);
  const l = await layout(page);
  check(l.tags === 8 && l.hscroll <= 0 && l.tableOver <= 4 && l.cardsOn && l.buttonOn, 'side: landscape layout fits ' + JSON.stringify(l));
  const side = await page.evaluate(() => { const d = document.querySelector('#dock').getBoundingClientRect(), t = document.querySelector('#table').getBoundingClientRect(); return d.left >= t.right - 1; });
  check(side, 'side: the hand is a column to the right of the table');
  await shot(page, 'side');
  const end = await play(page, {});
  check(end.over, 'side: an 8-player game reaches its end');
  check(page.errors.length === 0, 'side: no errors ' + page.errors.slice(0, 2).join(' | '));
  await ctx.close();
}

async function partDesktop(browser) {
  const ctx = await newContext(browser, { width: 1366, height: 860 }, false);
  const page = await newPage(ctx, { sound: false, count: 6, adv: false, ani: 3, name: 'PC', level: 3, mult: 3 });
  await page.goto(BASE + '?test=1');
  await page.click('#goSolo'); await page.click('#soloStart');
  await page.waitForSelector('#game:not([hidden])');
  await sleep(500);
  const l = await layout(page);
  check(l.tags === 6 && l.hscroll <= 0 && l.tableOver <= 4 && l.cardsOn && l.buttonOn, 'desktop: layout fits ' + JSON.stringify(l));
  check(await page.evaluate(() => document.querySelector('.pcard[data-a="x"]').hidden), 'desktop: no special card without the advanced rule');
  check(await page.isVisible('#logPanel') && !(await page.isVisible('#btnLog')), 'desktop: the record stays open beside the table');
  const end = await play(page, { prefer: 'wgwws' });
  check(end.over, 'desktop: the game reaches its end');
  const logRows = await page.evaluate(() => document.querySelectorAll('#logList .lg:not(.day)').length);
  check(logRows > 3, `desktop: the record lists the rounds (${logRows})`);
  await shot(page, 'desktop-result');
  check(page.errors.length === 0, 'desktop: no errors ' + page.errors.slice(0, 2).join(' | '));
  await ctx.close();
}

async function partOnline(browser) {
  // two tabs of one browser: a host with a CPU, and a guest who joins with the room code
  const ctx = await newContext(browser, { width: 390, height: 844 }, true);
  const host = await newPage(ctx, { sound: false, ani: 1, mult: 3, adv: true, chat: 'on' });
  await host.goto(BASE + '?test=1&net=local');
  await host.click('#goOnline');
  await host.fill('#onName', 'ホスト');
  await host.click('#onCreate');
  await host.waitForSelector('#scrLobby:not([hidden])');
  await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('#lobCode').textContent));
  const code = await host.textContent('#lobCode');
  check(/^\d{4}$/.test(code), 'online: the host gets a 4-digit room code ' + code);
  await host.click('#lobAddCpu');
  const guest = await newPage(ctx, { sound: false, ani: 4, chat: 'on' });
  await guest.goto(BASE + '?test=1&net=local');
  await guest.click('#goOnline');
  await guest.fill('#onName', 'ゲスト');
  await guest.fill('#onCode', '0000');
  await guest.click('#onJoin');
  await guest.waitForSelector('#onErr:not([hidden])');
  check(/見つかりません/.test(await guest.textContent('#onErr')), 'online: a wrong code says the room was not found');
  await guest.fill('#onCode', code);
  await guest.click('#onJoin');
  await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 3, null, { timeout: 10000 });
  check(true, 'online: the guest is seated in the host\'s lobby');
  await guest.waitForSelector('#scrLobby:not([hidden])');
  check(await guest.isHidden('#lobStart'), 'online: only the host can start');
  await shot(host, 'online-lobby');
  await host.click('#lobStart');
  await Promise.all([host.waitForSelector('#game:not([hidden])'), guest.waitForSelector('#game:not([hidden])')]);
  // the guest's view never carries anybody's card before the reveal
  let peeks = 0, looks = 0;
  const peek = async () => {
    looks++;
    const leak = await guest.evaluate(() => { const v = window.KOSO_APP.view; return !!(v && v.rd && /"a"\s*:/.test(JSON.stringify(v.rd))); });
    if (leak) peeks++;
  };
  const [h, g] = await Promise.all([play(host, { prefer: 'wwgws' }), play(guest, { prefer: 'wswwg', onPick: peek })]);
  check(h.over && g.over, `online: both tabs play to the end (host ${h.picks}, guest ${g.picks} cards)`);
  check(looks > 0 && peeks === 0, `online: the guest never saw a card early (${looks} looks)`);
  const fin = await Promise.all([host, guest].map((p) => p.evaluate(() => { const s = window.KOSO_APP.shown; return s.P.map((x) => x.ore).join(',') + '|' + s.winners.join(','); })));
  check(fin[0] === fin[1], 'online: both tabs show the same final trolleys ' + fin[0]);
  await guest.waitForSelector('#dlgResult[open]', { timeout: 10000 }).catch(() => {});
  check(/の勝ち/.test(await resultText(guest)), 'online: the guest sees the result');
  await shot(guest, 'online-result');
  check(host.errors.length === 0 && guest.errors.length === 0, 'online: no errors ' + host.errors.concat(guest.errors).slice(0, 2).join(' | '));
  await ctx.close();
}

try {
  await sleep(500);
  const browser = await playwright.chromium.launch();
  const parts = { title: partTitle, cpu: partCpu, side: partSide, desktop: partDesktop, online: partOnline };
  for (const [name, fn] of Object.entries(parts)) {
    if (ONLY && ONLY !== name) continue;
    try { await fn(browser); } catch (e) { check(false, name + ': ' + (e && e.message ? e.message.split('\n')[0] : e)); }
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
