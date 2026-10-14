// ×ing／バッティング: end-to-end check in real browsers.
//   node tools/xing-browser-check.mjs            solo games (4 players desktop, 2 players phone) + online game
//   node tools/xing-browser-check.mjs --solo     solo games only (no internet needed except the CDN)
// Needs Playwright (npm i -g playwright) and Chromium. XING_CHROMIUM=/path/to/chrome overrides the browser.
// The online part uses the public PeerJS server, like the published page.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
  try { playwright = require(p); break; } catch (e) {}
}
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791, BASE = `http://localhost:${PORT}/xing/`;
const soloOnly = process.argv.includes('--solo');
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
// behind an HTTPS proxy, let the local test server bypass it (Playwright otherwise forces loopback through the proxy)
if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
const launch = () => playwright.chromium.launch({
  executablePath: process.env.XING_CHROMIUM || undefined, proxy,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }

async function newPage(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('xing.sound', 'off'); localStorage.setItem('xing.speed', '1.6'); localStorage.setItem('xing.quality', 'low'); } catch (e) {} });
  return page;
}
/* one step of play for this page: pick for every open hand by tapping the 3D table, or place the dealer's gem */
async function step(page, k) {
  const st = await page.evaluate(() => {
    const A = window.XING_APP, s = A.shown, E = window.XING_ENG; if (!s || !A.session) return null;
    const me = A.session.mySeat(), rd = A.view && A.view.rd;
    const open = s.ph === 'pick' && rd && rd.r === s.rnd ? E.actorsOf(s, me).filter(a => E.isActive(s, a) && !rd.cm[a]) : [];
    return { ph: s.ph, rnd: s.rnd, busy: A.busy, me, dealer: s.dealer, deal: s.deal, open: open.map(a => [a, E.legalTargets(s, a)]) };
  });
  if (!st || st.busy) return st;
  const tap = async t => {
    const p = await page.evaluate(t => { const a = window.XING_APP.scene.targetAnchor(t), r = document.getElementById('stage').getBoundingClientRect(); return { x: a.x + r.left, y: a.y + r.top + 6 }; }, t);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
  };
  if (st.ph === 'deal' && st.dealer === st.me) {
    await tap('t' + st.deal.legal[0]);
    if (await page.$('#aDeal')) await page.click('#aDeal');
  } else if (st.ph === 'pick' && st.open.length) {
    for (const [a, L] of st.open) {
      const t = L[(st.rnd * 7 + a * 3 + k) % L.length];
      await page.evaluate(a => { window.XING_APP.ui.hand = a; }, a);
      await tap(t);
      if (await page.evaluate(a => window.XING_APP.ui.sel[a], a) !== t) { await page.click('#aList'); await page.click(`[data-t="${t}"]`); }
    }
    await page.click('#aGo');
  }
  return st;
}
/* length: 0 = the original rules (until the bag is empty), otherwise the number of turns */
async function solo(players, phone, length) {
  const browser = await launch(), page = await newPage(browser, phone);
  await page.goto(BASE + '?seed=' + (40 + players), { waitUntil: 'load' });
  await page.click('#goSolo'); await page.click(`#segCount button[data-v="${players}"]`);
  if (await page.$('#soloLength')) await page.selectOption('#soloLength', String(length));
  await page.click('#soloStart');
  for (let i = 0; i < 600; i++) { const st = await step(page, 0); if (st && st.ph === 'over') break; await page.waitForTimeout(200); }
  await page.waitForTimeout(2000);
  const fin = await page.evaluate(() => { const s = window.XING_APP.shown; return { ph: s.ph, rnd: s.rnd, limit: s.roundLimit || 0, bag: s.bagN, rows: s.result && s.result.length, modal: !!document.querySelector('.res-table') }; });
  const ended = length ? fin.rnd === length : fin.bag === 0;
  check(fin.ph === 'over' && ended && fin.rows === players && fin.modal, `solo ${players}p ${phone ? 'phone' : 'desktop'} (${length ? length + ' turns' : 'original length'}): game finished with results (${JSON.stringify(fin)})`);
  check(!page.errs.length, `solo ${players}p: no page errors ${page.errs.join(' | ')}`);
  await browser.close();
}
async function online(nClients) {
  const browsers = [], pages = [];
  for (let i = 0; i <= nClients; i++) { const b = await launch(); browsers.push(b); const p = await newPage(b, i === 1); await p.goto(BASE, { waitUntil: 'load' }); pages.push(p); }
  const host = pages[0];
  await host.click('#goOnline'); await host.click('#onCreate');
  await host.waitForFunction(() => /^\d{4}$/.test(document.getElementById('lobCode').textContent), null, { timeout: 40000 });
  const code = await host.textContent('#lobCode');
  for (let i = 1; i <= nClients; i++) {
    const p = pages[i];
    await p.click('#goOnline'); await p.fill('#onName', 'ゲスト' + i); await p.fill('#onCode', code); await p.click('#onJoin');
    await p.waitForFunction(n => document.querySelectorAll('#lobSeats .seat').length >= n, i + 1, { timeout: 40000 });
  }
  await host.click('#lobAddCpu'); await host.waitForTimeout(500); await host.click('#lobStart');
  for (const p of pages) await p.waitForFunction(() => window.XING_APP.shown, null, { timeout: 30000 });
  let leak = false;
  for (let i = 0; i < 900; i++) {
    const sts = [];
    for (let k = 0; k < pages.length; k++) {
      sts.push(await step(pages[k], k));
      // nobody's view of an open round may contain a pick
      leak = leak || (await Promise.all(pages.map(q => q.evaluate(() => { const v = window.XING_APP.view; return /"t":"[tv]\d"/.test(JSON.stringify(v && v.rd || {})); })))).some(Boolean);
    }
    if (sts.every(s => s && s.ph === 'over')) break;
    await host.waitForTimeout(200);
  }
  await host.waitForTimeout(2000);
  const fins = await Promise.all(pages.map(p => p.evaluate(() => { const A = window.XING_APP, s = A.shown; return { ph: s.ph, proof: A.proof, key: JSON.stringify([s.A, s.T, s.result]) }; })));
  check(fins.every(f => f.ph === 'over'), `online: host + ${nClients} clients + CPU finished`);
  check(fins.every(f => f.key === fins[0].key), 'online: every browser shows the same final table and result');
  check(fins.slice(1).every(f => f.proof === true), 'online: clients verified every revealed pick against its commitment');
  check(!leak, 'online: no pick was visible before every hand had committed');
  check(pages.every(p => !p.errs.length), 'online: no page errors ' + pages.map(p => p.errs.join(' | ')).join(' '));
  for (const b of browsers) await b.close();
}

try {
  await new Promise(r => setTimeout(r, 600));
  await solo(4, false, 0);
  await solo(2, true, 20);
  if (!soloOnly) await online(2);
} catch (e) { failures.push(String(e && e.stack || e)); console.error(e); }
server.kill();
console.log(failures.length ? `${failures.length} failed` : 'all browser checks passed');
process.exit(failures.length ? 1 : 0);
