// ヌリエ・ラッシュ: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/nurie-browser-check.mjs              CPU game, 1台でふたり, practice, card list, then an online game between two tabs
//   node tools/nurie-browser-check.mjs --shots DIR  also save screenshots into DIR
// Needs Playwright (npm i -g playwright) and Chromium. The online part runs over BroadcastChannel (?net=local),
// so it needs no PeerJS server.
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
const PORT = 8794, BASE = `http://localhost:${PORT}/nurie-rush/?test=1`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [], errors = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANIMALS = ['crab', 'chick', 'turtle', 'fish', 'pig'];

function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|ERR_INTERNET/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
async function openPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 760 }, hasTouch: true, isMobile: !opts.desktop });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  watch(page, opts.tag || 'page');
  await page.goto(opts.url || BASE);
  return page;
}
/* wait until a new card face is visible; returns what the right answer is */
async function nextFace(page, after) {
  await page.waitForFunction((n) => { const M = window.__NR.M; return M && M.round && !M.round.done && M.round.n > n && performance.now() > M.round.faceAt; }, after, { timeout: 20000, polling: 30 });
  return page.evaluate(() => {
    const M = window.__NR.M, c = window.__NR.D.CARDS[M.round.card];
    const q = window.__NR.D.required(c, M.g ? M.g.callMode : M.set.call);
    return { n: M.round.n, card: M.round.card, type: q.type, item: q.item };
  });
}
async function tap(page, scope, type, item) {
  await page.locator(`${scope} ${type === 'call' ? '.nmbtn' : '.pc'}[data-item="${item}"]`).dispatchEvent('pointerdown', { button: 0 });
}
const over = (page) => page.evaluate(() => !!document.querySelector('.modal .result-title'));

async function main() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://localhost:${PORT}/nurie-rush/`); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
  const browser = await playwright.chromium.launch();

  /* ---------------- CPU game on a phone */
  {
    const page = await openPage(browser, { tag: 'cpu' });
    await page.evaluate(() => { Object.assign(window.__NR.S, { cpu: 3, level: 1, deck: 15, call: true }); window.__NR.startCpu(); });
    let q = await nextFace(page, 0);
    await sleep(150); await tap(page, '#table', q.type, q.item);
    await page.waitForFunction(() => window.__NR.M.round.done);
    check((await page.evaluate(() => window.__NR.M.scores[0])) === 1, 'CPU game: the right touch wins the card');
    await shot(page, 'cpu-right');
    q = await nextFace(page, q.n);
    const wrong = ANIMALS.find((x) => x !== q.item);
    await tap(page, '#table', q.type, wrong);
    await page.waitForFunction(() => window.__NR.M.round.done, null, { timeout: 20000 });
    const s2 = await page.evaluate(() => ({ sc: window.__NR.M.scores, log: window.__NR.M.g.log[1] }));
    check(s2.sc[0] === 0 && s2.log.moves.some((m) => m.from === 0 && m.card !== null), 'CPU game: a wrong touch hands one card over');
    await shot(page, 'cpu-wrong');
    let n = q.n;
    while (!(await over(page))) {
      try { q = await nextFace(page, n); } catch (e) { break; }
      n = q.n;
      await tap(page, '#table', q.type, q.item);
      await sleep(60);
      await page.evaluate(() => { const M = window.__NR.M; if (M && M.skip) M.skip(); });
    }
    await page.waitForSelector('.modal .result-title', { timeout: 20000 });
    const total = await page.evaluate(() => window.__NR.M.g.seats.reduce((a, s) => a + s.pile.length, 0));
    check(total === 15, `CPU game: all 15 cards ended in someone's pile (${total})`);
    await shot(page, 'cpu-results');
    await page.context().close();
  }

  /* ---------------- 1台でふたり */
  {
    const page = await openPage(browser, { tag: 'duo', viewport: { width: 390, height: 800 } });
    await page.evaluate(() => { Object.assign(window.__NR.S, { duoDeck: 15, duoCall: false, duo: ['A', 'B'] }); window.__NR.startDuo(); });
    let q = await nextFace(page, 0);
    await tap(page, '#halfP2', 'grab', q.item);
    await page.waitForFunction(() => window.__NR.M.round.done);
    check(JSON.stringify(await page.evaluate(() => window.__NR.M.scores)) === '[0,1]', '1台でふたり: the top player can win');
    q = await nextFace(page, q.n);
    await tap(page, '#halfP1', 'grab', ANIMALS.find((x) => x !== q.item));
    await tap(page, '#halfP2', 'grab', ANIMALS.find((x) => x !== q.item));
    await page.waitForFunction(() => window.__NR.M.round.done);
    const d = await page.evaluate(() => ({ sc: window.__NR.M.scores, left: window.__NR.M.g.deck.length, back: window.__NR.M.g.log[1].back }));
    check(d.back && d.sc[1] === 0 && d.left === 15, '1台でふたり: both wrong → the card and the handed card go under the pile');
    await shot(page, 'duo');
    await page.context().close();
  }

  /* ---------------- practice and the card list */
  {
    const page = await openPage(browser, { tag: 'practice' });
    await page.evaluate(() => { Object.assign(window.__NR.S, { pracDeck: 15, pracCall: true }); window.__NR.startPractice(); });
    let n = 0, k = 0;
    while (!(await over(page))) {
      let q; try { q = await nextFace(page, n); } catch (e) { break; }
      n = q.n; k++;
      if (k === 2) await tap(page, '#table', q.type === 'call' ? 'grab' : 'call', q.item);
      else await tap(page, '#table', q.type, q.item);
      await sleep(60);
      await page.evaluate(() => { const M = window.__NR.M; if (M && M.skip) M.skip(); });
    }
    await page.waitForSelector('.modal .result-title', { timeout: 20000 });
    const txt = await page.innerText('.modal .stats');
    check(/14 \/ 15/.test(txt), 'practice: 14 of 15 right after one wrong kind of answer');
    await shot(page, 'practice');
    await page.evaluate(() => { document.querySelector('.modal').remove(); });
    await page.evaluate(() => window.__NR.openGallery());
    const counts = {};
    for (const f of ['all', 'match', 'none', ...ANIMALS]) {
      await page.click(`.modal [data-f="${f}"]`);
      counts[f] = await page.evaluate(() => document.querySelectorAll('#galGrid figure').length);
    }
    check(counts.all === 60 && counts.match === 20 && counts.none === 40 && ANIMALS.every((x) => counts[x] === 12), 'card list: 60 cards, 20 own colour, 40 missing, 12 per animal');
    await page.context().close();
  }

  /* ---------------- online over BroadcastChannel: host + guest + CPU */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
    const host = await ctx.newPage(), guest = await ctx.newPage();
    watch(host, 'host'); watch(guest, 'guest');
    await host.goto(BASE + '&net=local'); await guest.goto(BASE + '&net=local');
    await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
    await host.waitForSelector('#scrLobby:not([hidden])');
    const code = await host.innerText('#lobCode');
    await guest.click('#goOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.click('#onJoin');
    await guest.waitForFunction(() => document.querySelectorAll('#lobSeats li').length === 2, null, { timeout: 8000 });
    await host.click("#lobCpuLevel [data-v='1']"); await host.click('#lobAddCpu'); await host.click("#lobDeck [data-v='15']");
    await guest.waitForFunction(() => document.querySelectorAll('#lobSeats li').length === 3 && /15枚/.test(document.getElementById('lobRule').textContent), null, { timeout: 8000 });
    check(true, 'online: guest sees the host, the CPU and the settings');
    await host.click('#lobStart');
    await guest.waitForSelector('#app:not([hidden])');
    let n = 0, rounds = 0, synced = true;
    while (!(await over(host))) {
      let q; try { q = await nextFace(host, n); } catch (e) { break; }
      n = q.n; rounds++;
      await guest.waitForFunction((r) => window.__NR.M && window.__NR.M.round && window.__NR.M.round.n === r && performance.now() > window.__NR.M.round.faceAt, n, { timeout: 8000 });
      const sameCard = await guest.evaluate((c) => window.__NR.M.round.card === c, q.card);
      if (!sameCard) synced = false;
      if (rounds % 3 === 1) await tap(guest, '#table', q.type, q.item);
      else if (rounds % 3 === 2) { await tap(guest, '#table', q.type, ANIMALS.find((x) => x !== q.item)); await sleep(200); await tap(host, '#table', q.type, q.item); }
      else {
        // leave it to the CPU; if the CPU slips, the round waits for the people, so the host takes it
        try { await host.waitForFunction((r) => window.__NR.M.round && window.__NR.M.round.n === r && window.__NR.M.round.done, n, { timeout: 6000 }); }
        catch (e) { await tap(host, '#table', q.type, q.item); }
      }
      await host.waitForFunction((r) => window.__NR.M.round && window.__NR.M.round.n === r && window.__NR.M.round.done, n, { timeout: 20000 });
      await guest.waitForFunction((r) => window.__NR.M.round && window.__NR.M.round.n === r && window.__NR.M.round.done, n, { timeout: 8000 });
      const a = await host.evaluate(() => window.__NR.M.scores), b = await guest.evaluate(() => window.__NR.M.scores);
      if (JSON.stringify(a) !== JSON.stringify(b)) synced = false;
      if (rounds === 2) { await shot(host, 'online-host'); await shot(guest, 'online-guest'); }
    }
    await host.waitForSelector('.modal .result-title', { timeout: 20000 });
    await guest.waitForSelector('.modal .result-title', { timeout: 8000 });
    check(synced, `online: same cards and same scores on both screens for ${rounds} rounds`);
    await host.click('.modal [data-act=again]');
    await guest.waitForSelector('#scrLobby:not([hidden])', { timeout: 8000 });
    check(true, 'online: "この部屋でもう一度" brings the guest back to the lobby');
    await ctx.close();
  }

  await browser.close();
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
}

main().catch((e) => { failures.push(String(e && e.stack || e)); console.log('FAIL ' + e); }).finally(() => {
  server.kill();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log('\nall browser checks passed');
});
