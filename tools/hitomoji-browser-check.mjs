// ヒトモジ・バトル: end-to-end check in real browsers.
//   node tools/hitomoji-browser-check.mjs           solo games (phone 4 players, desktop English) + online game over BroadcastChannel
//   node tools/hitomoji-browser-check.mjs --peer    the online game uses the public PeerJS server, like the published page
//   node tools/hitomoji-browser-check.mjs --solo    solo games only
// Needs Playwright (npm i -g playwright) and Chromium. HMB_CHROMIUM=/path/to/chrome overrides the browser.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
  try { playwright = require(p); break; } catch (e) {}
}
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8793, BASE = `http://localhost:${PORT}/hitomoji-battle/`;
const soloOnly = process.argv.includes('--solo'), usePeer = process.argv.includes('--peer');
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) page.errs.push(m.text()); });
  return page;
}
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((o) => { try { localStorage.setItem('hmb.sound', 'false'); localStorage.setItem('hmb.count', String(o.count || 4)); localStorage.setItem('hmb.mode', JSON.stringify(o.mode || 'ja')); localStorage.setItem('hmb.theme', JSON.stringify(o.theme || 'random')); } catch (e) {} }, opts);
  return ctx;
}
/* one move for this page if it is its turn: a letter not in its own word when possible */
async function step(page) {
  const st = await page.evaluate(() => {
    const h = window.__hmb, v = h && h.view; if (!v) return { phase: 'none' };
    const me = h.match.me, sec = h.secret();
    let ch = null;
    if (v.phase === 'play' && v.turn === me && !v.pend && !h.busy() && !v.P[me].out && sec && !h.match.waiting) {
      const L = h.E.alphabet(v.mode).split(''), mine = new Set(sec.cells);
      ch = L.find((c) => !v.used[c] && !mine.has(c)) || L.find((c) => !v.used[c]);
    }
    return { phase: v.phase, ch, ply: v.ply };
  });
  if (st.ch) {
    const b = page.locator('#board .k[data-ch="' + st.ch + '"]');
    if (await b.isEnabled().catch(() => false)) { await b.click(); await page.click('#bAttack').catch(() => {}); }
  }
  return st;
}
async function writeWord(page, word) {
  await page.waitForSelector('#wIn', { timeout: 15000 });
  if (word) await page.fill('#wIn', word); else await page.click('#wRand');
  await page.click('#wOk');
}

const browser = await playwright.chromium.launch({ executablePath: process.env.HMB_CHROMIUM || undefined, proxy });
try {
  await sleep(400);
  /* ------------------------------------------------ solo, phone, 4 players */
  {
    const ctx = await newContext(browser, { phone: true, count: 4, theme: 'animals' });
    const page = await newPage(ctx);
    await page.goto(BASE + '?test=1&speed=4');
    await page.click('#goSolo');
    await page.click('#soloStart');
    await writeWord(page, 'ジャガー');
    const sec = await page.evaluate(() => window.__hmb.secret());
    check(sec && sec.cells.join('') === 'しやかー×××', 'the word is written as the rules say (ジャガー → しやかー + ×××)');
    let st, guard = 0;
    do { st = await step(page); await sleep(120); } while (st.phase !== 'over' && guard++ < 1500);
    check(st.phase === 'over', 'solo game reaches the end (' + st.ply + ' declarations)');
    await page.waitForSelector('#layer .sheet[data-kind="results"]', { timeout: 15000 });
    const res = await page.evaluate(() => ({ rows: document.querySelectorAll('.res-row').length, words: [...document.querySelectorAll('.res-row .say')].map((e) => e.textContent), title: document.querySelector('.win-title').textContent }));
    check(res.rows === 4 && res.words.length === 4, 'results list 4 players with their words: ' + res.words.join(' / ') + ' — ' + res.title);
    await page.click('#rAgain');
    await page.waitForSelector('#wIn', { timeout: 10000 });
    check(true, '"もう一度" starts a new game');
    check(page.errs.length === 0, 'no page errors (solo phone)' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }
  /* ------------------------------------------------ solo, desktop, English */
  {
    const ctx = await newContext(browser, { count: 3, mode: 'en', theme: 'fruits' });
    const page = await newPage(ctx);
    await page.goto(BASE + '?test=1&speed=4');
    await page.click('#goSolo');
    await page.click('#soloStart');
    await writeWord(page, 'Kiwi');
    let st, guard = 0;
    do { st = await step(page); await sleep(120); } while (st.phase !== 'over' && guard++ < 1500);
    check(st.phase === 'over', 'English game reaches the end');
    const letters = await page.evaluate(() => document.querySelectorAll('#board .k:not(.blank)').length);
    check(letters === 26, 'the English board has 26 letters');
    check(page.errs.length === 0, 'no page errors (English)' + (page.errs.length ? ': ' + page.errs.join(' | ') : ''));
    await ctx.close();
  }
  /* ------------------------------------------------ online: host + 2 guests + a CPU */
  if (!soloOnly) {
    const net = usePeer ? '' : '&net=local';
    const ctx = await newContext(browser, { theme: 'random' });
    const host = await newPage(ctx), g1 = await newPage(ctx), g2 = await newPage(ctx);
    await host.goto(BASE + '?test=1&speed=4' + net);
    await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent) || !document.querySelector('#onErr').hidden, null, { timeout: 40000 });
    const netErr = await host.evaluate(() => document.querySelector('#onErr').hidden ? '' : document.querySelector('#onErr').textContent);
    if (netErr) { console.log('skip online: could not open a room here (' + netErr + ')'); await ctx.close(); throw { skip: true }; }
    const code = await host.textContent('#lobCode');
    for (const [g, nm] of [[g1, 'ゲスト1'], [g2, 'ゲスト2']]) {
      await g.goto(BASE + '?test=1&speed=4' + net);
      await g.click('#goOnline'); await g.fill('#onName', nm); await g.fill('#onCode', code); await g.click('#onJoin');
    }
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 3, null, { timeout: 30000 });
    await host.click('#lobAddCpu');
    await host.selectOption('#lobTheme', 'animals');
    await g1.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 4 && /どうぶつ/.test(document.querySelector('#lobRule').textContent), null, { timeout: 10000 });
    check(true, 'guests see the seats and the お題 the host picked (room ' + code + ')');
    await host.click('#lobStart');
    await writeWord(host, 'ライオン');
    await writeWord(g1, 'カピバラ');
    await writeWord(g2, 'ペンギン');
    await host.waitForFunction(() => window.__hmb.view && window.__hmb.view.phase === 'play', null, { timeout: 20000 });
    const leak = await host.evaluate(() => JSON.stringify(window.__hmb.view).includes('かひはら') || JSON.stringify(window.__hmb.view).includes('へんきん'));
    check(!leak, "the host's table never holds a guest's word");
    let reloaded = false, guard = 0, phases;
    for (;;) {
      const sts = [await step(host), await step(g1), await step(g2)];
      phases = sts.map((s) => s.phase);
      if (phases.every((p) => p === 'over')) break;
      if (!reloaded && sts[0].ply >= 6) {
        // a guest reloads in the middle of the game and comes back with the same code
        reloaded = true;
        await g2.reload();
        await g2.click('#goOnline'); await g2.fill('#onCode', code); await g2.click('#onJoin');
        await g2.waitForFunction(() => window.__hmb.view && window.__hmb.view.phase !== 'write', null, { timeout: 20000 });
        check(true, 'a guest who reloads comes back into the same seat');
      }
      await sleep(150);
      if (guard++ > 2500) break;
    }
    check(phases.every((p) => p === 'over'), 'the online game ends on every screen');
    await sleep(2500);
    const finals = await Promise.all([host, g1, g2].map((p) => p.evaluate(() => { const v = window.__hmb.view; return { w: v.winner, ok: v.P.map((x) => x.ok), words: v.P.map((x) => x.word) }; })));
    check(finals.every((f) => f.w === finals[0].w), 'every screen shows the same winner');
    check(finals[0].ok.every((x) => x === true), 'every word was checked against its commitment and every answer: ' + JSON.stringify(finals[0].words));
    for (const [p, nm] of [[host, 'host'], [g1, 'guest 1'], [g2, 'guest 2']]) check(p.errs.length === 0, 'no page errors (' + nm + ')' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
    await ctx.close();
  }
  /* ------------------------------------------------ online: a free-text お題, and a guest who leaves while writing */
  if (!soloOnly && !usePeer) {
    const ctx = await newContext(browser, {});
    const host = await newPage(ctx), g = await newPage(ctx);
    await host.goto(BASE + '?test=1&speed=4&net=local');
    await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#lobCode').textContent), null, { timeout: 15000 });
    const code = await host.textContent('#lobCode');
    await g.goto(BASE + '?test=1&speed=4&net=local');
    await g.click('#goOnline'); await g.fill('#onName', 'ゲスト'); await g.fill('#onCode', code); await g.click('#onJoin');
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 2, null, { timeout: 15000 });
    await host.click('#lobAddCpu');
    await host.selectOption('#lobTheme', 'custom');
    await host.fill('#lobCustom', 'きのう食べたもの');
    await host.click('#lobStart');
    check(await host.isVisible('#lobErr'), 'a free-text お題 cannot start with a CPU seated');
    await host.click('#lobSeats [data-rm="2"]');
    await g.waitForFunction(() => /きのう食べたもの/.test(document.querySelector('#lobRule').textContent), null, { timeout: 10000 });
    check(true, 'the guest sees the free-text お題');
    await host.click('#lobStart');
    await g.waitForSelector('#wIn', { timeout: 10000 });
    const th = await g.textContent('.wtheme b');
    check(th === 'きのう食べたもの', 'the word sheet shows the free-text お題 (' + th + ')');
    await g.click('#layer [data-close]');
    await g.click('#btnMenu'); await g.click('[data-k="quit"]'); await g.click('#qYes');
    await host.waitForFunction(() => window.__hmb.view && window.__hmb.view.P[1].forfeit, null, { timeout: 10000 });
    check(true, 'a guest who leaves the room is out at once (棄権)');
    await writeWord(host, 'カレー');
    await host.waitForFunction(() => window.__hmb.view && window.__hmb.view.phase === 'over', null, { timeout: 10000 });
    const w = await host.evaluate(() => window.__hmb.view.winner);
    check(w === 0, 'with nobody else left, the host wins');
    for (const [p, nm] of [[host, 'host'], [g, 'guest']]) check(p.errs.length === 0, 'no page errors (' + nm + ', free-text room)' + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
    await ctx.close();
  }
} catch (e) {
  if (!(e && e.skip)) throw e;
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? '\n' + failures.length + ' check(s) failed' : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
