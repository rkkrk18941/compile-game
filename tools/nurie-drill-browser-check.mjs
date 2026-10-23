// おばけキャッチ 反射ドリル: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/nurie-drill-browser-check.mjs              setup screen, a 60-answer session with mistakes and a pause,
//                                                         results, the card map after reload, ranking answers in the map,
//                                                         the advanced rule and keyboard play
//   node tools/nurie-drill-browser-check.mjs --shots DIR  also save screenshots into DIR
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
const PORT = 8795, BASE = `http://localhost:${PORT}/nurie-rush/?test=1`;
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
async function shot(page, name, full) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); }
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 760 }, hasTouch: !opts.desktop, isMobile: !opts.desktop, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  return ctx;
}
async function openPage(ctx, tag, url) { const page = await ctx.newPage(); watch(page, tag); await page.goto(url || BASE); return page; }
/* wait for a new card face; returns what the right answer is */
async function nextFace(page, after) {
  await page.waitForFunction((n) => { const M = window.__NR.M; return M && M.round && !M.round.done && M.round.n > n && performance.now() > M.round.faceAt; }, after, { timeout: 20000, polling: 30 });
  return page.evaluate(() => {
    const M = window.__NR.M, c = window.__NR.D.CARDS[M.round.card], q = window.__NR.D.required(c, M.g.callMode);
    return { n: M.round.n, card: M.round.card, type: q.type, item: q.item };
  });
}
async function tap(page, type, item) {
  await page.locator(`#table ${type === 'call' ? '.nmbtn' : '.pc'}[data-item="${item}"]`).dispatchEvent('pointerdown', { button: 0 });
}
const resultShown = (page) => page.evaluate(() => !!document.querySelector('.modal .result-title'));

async function main() {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://localhost:${PORT}/nurie-rush/`); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
  const browser = await playwright.chromium.launch();

  /* ---------------- phone: setup, one session, results, map, reload */
  {
    const ctx = await newContext(browser);
    let page = await openPage(ctx, 'drill');
    await page.click('#goDrill');
    await page.waitForSelector('#scrDrill:not([hidden])');
    const fresh = await page.evaluate(() => ({ cells: document.querySelectorAll('#drillMap .dcell').length, isNew: document.querySelectorAll('#drillMap .dcell.st-new').length, kpi: document.getElementById('drillKpi').innerText }));
    check(fresh.cells === 60 && fresh.isNew === 60 && /まだ記録がありません/.test(fresh.kpi), 'setup: 60 unmeasured cards on the map and no prediction yet');
    await shot(page, 'drill-setup-empty', true);
    await page.click('#segDrillLen [data-v="60"]');
    check(await page.evaluate(() => window.__NR.S.drillLen === 60), 'setup: the session length is saved');
    await page.click('#drillStart');
    await page.waitForSelector('.modal [data-drill-intro="start"]');
    await shot(page, 'drill-intro');
    await page.click('.modal [data-drill-intro="start"]');
    await page.waitForSelector('#app:not([hidden])');
    check(await page.evaluate(() => window.__NR.S.drillIntroSeen === true && !document.querySelector('.modal')), 'start: a one-time explanation, then the session');
    check(await page.evaluate(() => !document.getElementById('drillBar').hidden && document.getElementById('app').classList.contains('drilling') && document.getElementById('seats').hidden), 'play: time line shown, players and pile hidden');

    let n = 0, k = 0, lastCard = -1, sawFix = false, fixHeld = false, pausedSame = false, recorded = 0, seen = new Set();
    while (!(await resultShown(page))) {
      let q; try { q = await nextFace(page, n); } catch (e) { break; }
      n = q.n; k++; seen.add(q.card);
      if (k === 1) {
        await sleep(200);
        const p = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('drillBarFill')).transform; return s; });
        check(p !== 'none' && p !== 'matrix(0, 0, 0, 1, 0, 0)', 'play: the time line fills while the card is up');
        await shot(page, 'drill-play');
      }
      if (k === 5) {
        // pause on an unanswered card: the same card comes back and nothing is recorded
        const before = await page.evaluate(() => window.__NR.M.drill.s.done);
        await page.click('#btnMenu');
        await page.waitForSelector('.modal [data-act="resume"]');
        await page.click('.modal [data-act="resume"]');
        const again = await nextFace(page, 0);
        const after = await page.evaluate(() => window.__NR.M.drill.s.done);
        pausedSame = again.card === q.card && before === after;
        q = again; n = again.n;
      }
      if (k === 3 || k === 17) {
        const wrong = ANIMALS.find((x) => x !== q.item);
        await tap(page, q.type, wrong);
        await page.waitForFunction(() => window.__NR.M.drill.fix !== null, null, { timeout: 4000 });
        sawFix = true;
        if (k === 3) await shot(page, 'drill-mistake');
        await tap(page, q.type, ANIMALS.find((x) => x !== q.item && x !== wrong));   // still wrong: must not move on
        await page.click('#stage', { position: { x: 30, y: 30 } });                 // nor a stray tap on the card
        await page.keyboard.press('Space');
        await sleep(350);
        fixHeld = await page.evaluate((c) => window.__NR.M.drill.fix !== null && window.__NR.M.round && window.__NR.M.round.card === c, q.card);
        await tap(page, q.type, q.item);
        await page.waitForFunction(() => window.__NR.M && window.__NR.M.drill.fix === null);
      } else {
        await sleep(k % 4 === 0 ? 480 : 700);   // a person's pace, so the times on the screenshots look real
        await tap(page, q.type, q.item);
        await page.waitForFunction(() => !window.__NR.M || (window.__NR.M.round && window.__NR.M.round.done) || window.__NR.M.round === null);
        if (k === 2) await shot(page, 'drill-pass');
        await page.evaluate(() => { const M = window.__NR.M; if (M && M.skip) M.skip(); });
      }
      lastCard = q.card;
    }
    void lastCard;
    await page.waitForSelector('.modal .result-title', { timeout: 20000 });
    recorded = await page.evaluate(() => window.__NR.DRD.base.trials);
    const res = await page.innerText('.modal .sheet');
    check(k === 60 && recorded === 60, `play: 60 answers recorded in a 60-answer session (${k} / ${recorded})`);
    check(sawFix && fixHeld, 'mistake: the session waits until the right piece is touched (覚え直し)');
    check(pausedSame, 'pause: the unanswered card comes back and is not counted');
    check(/合格/.test(res) && /58 \/ 60|正解 58/.test(res) && /60枚の予想タイム/.test(res), 'results: passes, 58 of 60 right and the predicted 60-card time');
    check(seen.size >= 40, `play: a first session meets most of the deck (${seen.size} different cards)`);
    await shot(page, 'drill-results', true);
    await page.click('.modal [data-drill="setup"]');
    await page.waitForSelector('#scrDrill:not([hidden])');
    const map = await page.evaluate(() => ({ isNew: document.querySelectorAll('#drillMap .dcell.st-new').length, legend: [...document.querySelectorAll('#drillLegend b')].reduce((a, b) => a + +b.textContent, 0), kpi: document.getElementById('drillKpi').innerText }));
    check(map.isNew < 30 && map.legend === 60 && /\d:\d\d\.\d/.test(map.kpi), `map: most cards measured, legend adds up to 60, predicted time shown (${map.isNew} unmeasured)`);
    await page.click('#drillMap .dcell:not(.st-new)');
    await page.waitForSelector('.modal .ex');
    const detail = await page.innerText('.modal .sheet');
    check(/→/.test(detail) && /いまのタイム/.test(detail) && /つよい級/.test(detail), 'map: a card opens with its answer, its time and the band limits');
    await shot(page, 'drill-card');
    await page.click('.modal [data-close]');
    await shot(page, 'drill-setup-after', true);
    // the records survive a reload
    await page.reload();
    await page.click('#goDrill');
    await page.waitForSelector('#scrDrill:not([hidden])');
    const kept = await page.evaluate(() => ({ trials: window.__NR.DRD.base.trials, isNew: document.querySelectorAll('#drillMap .dcell.st-new').length, hist: !document.getElementById('drillHistory').hidden }));
    check(kept.trials === 60 && kept.isNew === map.isNew && kept.hist, 'reload: drill records and the session list are kept');

    /* ranking answers update the map too */
    await page.route('https://obake-catch-ranking.kd37yg.chatgpt.site/api/rankings**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: true, entries: [], total: 0, self: null }) }));
    await page.evaluate(() => { Object.assign(window.__NR.S, { rankName: 'TEST', rankCall: false }); window.__NR.startRanking(); });
    const rq = await nextFace(page, 0);
    const beforeN = await page.evaluate((c) => (window.__NR.DRD.base.cards[c] || { n: 0 }).n, rq.card);
    await sleep(120); await tap(page, rq.type, rq.item);
    await page.waitForFunction(() => window.__NR.M.round.done);
    const afterN = await page.evaluate((c) => window.__NR.DRD.base.cards[c].n, rq.card);
    check(afterN === beforeN + 1 && (await page.evaluate(() => window.__NR.DRD.base.trials)) === 60, 'ranking: an answer updates that card in the drill map without moving the drill schedule');
    await page.evaluate(() => { window.__NR.M.onEnd && window.__NR.M.onEnd(); });

    /* the reset asks first */
    await page.goto(BASE);
    await page.click('#goDrill');
    await page.click('#drillReset');
    await page.waitForSelector('.modal [data-reset]');
    await page.click('.modal [data-reset]');
    check(await page.evaluate(() => window.__NR.DRD.base.trials === 0 && document.querySelectorAll('#drillMap .dcell.st-new').length === 60), 'reset: after confirming, the basic-rule records are cleared');
    await ctx.close();
  }

  /* ---------------- the advanced rule: name buttons, separate records */
  {
    const ctx = await newContext(browser);
    const page = await openPage(ctx, 'drill-call');
    await page.evaluate(() => { Object.assign(window.__NR.S, { drillCall: true, drillLen: 60, drillIntroSeen: true }); window.__NR.startDrill(); });
    let n = 0, calls = 0, callFix = false;
    for (let i = 0; i < 24; i++) {
      const q = await nextFace(page, n); n = q.n;
      if (q.type === 'call') {
        calls++;
        if (!callFix) {
          await tap(page, 'grab', q.item);   // touching the piece is wrong when a book is drawn
          await page.waitForFunction(() => window.__NR.M.drill.fix !== null);
          await tap(page, 'grab', q.item); await sleep(250);
          const held = await page.evaluate(() => window.__NR.M.drill.fix !== null);
          await tap(page, 'call', q.item);
          await page.waitForFunction(() => window.__NR.M.drill.fix === null);
          callFix = held;
          continue;
        }
      }
      await sleep(600); await tap(page, q.type, q.item);
      await page.waitForFunction(() => window.__NR.M.round && window.__NR.M.round.done);
      await page.evaluate(() => { const M = window.__NR.M; if (M && M.skip) M.skip(); });
    }
    const st = await page.evaluate(() => ({ call: window.__NR.DRD.call.trials, base: window.__NR.DRD.base.trials, lines: Object.keys(window.__NR.M.drill.s.lines).sort().join(',') }));
    check(calls > 0 && callFix, `advanced rule: book cards need the name button, and the 覚え直し asks for the name too (${calls} book cards)`);
    check(st.call === 24 && st.base === 0 && st.lines === 'm,mc,n,nc', 'advanced rule: own records and four time lines');
    await shot(page, 'drill-call');
    await ctx.close();
  }

  /* ---------------- a week of practice: trend line and a varied map */
  {
    const ctx = await newContext(browser);
    const page = await openPage(ctx, 'drill-week');
    await page.evaluate(() => {
      const DR = window.__NR.DR, D = window.__NR.D, data = window.__NR.DRD, seen = new Array(60).fill(0);
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let day = 0; day < 7; day++) {
        const s = DR.begin(data, false, 120);
        while (s.done < s.total) {
          const id = DR.next(s, data, rnd), own = D.solve(D.CARDS[id]).match, n = seen[id]++;
          DR.answer(s, data, id, rnd() > 0.06, ((own ? 380 : 520) + (own ? 520 : 980) * Math.pow(1 + n, -0.45)) * (0.85 + rnd() * 0.3));
        }
        DR.finish(s, data, Date.now() - (7 - day) * 86400000);
      }
      localStorage.setItem('obake.drill.v1', JSON.stringify(data));
    });
    await page.click('#goDrill');
    await page.waitForSelector('#scrDrill:not([hidden])');
    const week = await page.evaluate(() => ({ spark: !!document.querySelector('#drillKpi .spark'), rows: document.querySelectorAll('#drillHistoryBody tbody tr').length, good: !!document.querySelector('#drillKpi small.good') }));
    check(week.spark && week.rows === 7 && week.good, 'setup: after a week the trend line, the improvement and seven sessions are shown');
    await page.evaluate(() => { document.getElementById('drillHistory').open = true; });
    await shot(page, 'drill-setup-week', true);
    await ctx.close();
  }

  /* ---------------- desktop: keys 1–5, landscape layout, dark colours */
  {
    const ctx = await newContext(browser, { desktop: true, viewport: { width: 1280, height: 800 }, dark: true });
    const page = await openPage(ctx, 'drill-desktop');
    await page.evaluate(() => { Object.assign(window.__NR.S, { drillCall: false, drillLen: 60, drillIntroSeen: true }); window.__NR.startDrill(); });
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const q = await nextFace(page, n); n = q.n;
      const key = await page.evaluate((item) => [...document.querySelectorAll('#pieces .pc')].findIndex((b) => b.dataset.item === item) + 1, q.item);
      await sleep(550); await page.keyboard.press(String(key));
      await page.waitForFunction(() => window.__NR.M.round && window.__NR.M.round.done);
      if (i === 2) await shot(page, 'drill-desktop-dark');
      await page.keyboard.press('Space');
    }
    check((await page.evaluate(() => window.__NR.DRD.base.trials)) === 6, 'desktop: keys 1–5 answer, space moves on');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.modal [data-act="quit"]');
    await page.click('.modal [data-act="quit"]');
    await page.click('#goDrill');
    await shot(page, 'drill-setup-dark', true);
    check(await page.evaluate(() => getComputedStyle(document.querySelector('.dcell:not(.st-new) .nr-card')).boxShadow !== 'none'), 'desktop: measured cards carry their band ring');
    await ctx.close();
  }

  await browser.close();
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
}

main().catch((e) => { failures.push(String(e && e.stack || e)); console.log('FAIL ' + e); }).finally(() => {
  server.kill();
  if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log('\nall reflex drill browser checks passed');
});
