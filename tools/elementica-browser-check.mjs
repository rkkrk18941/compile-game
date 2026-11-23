// エレメンティカ: browser check with headless Chrome.
//   node tools/elementica-browser-check.mjs [outDir]
// Serves the repo, then: (1) plays the first turns by hand (prep, an action with a chip, a base and a build prompt),
// (2) lets the CPU play the human seat to the end of a 3-player game, (3) checks two tabs online over BroadcastChannel.
// Fails on any page error or console error.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright', path.join(process.env.npm_config_prefix || '', 'lib/node_modules/playwright')]) {
  try { playwright = require(p); break; } catch (e) { /* try next */ }
}
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }
const { chromium } = playwright;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'tools', 'out-elementica');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(root, p);
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
const base = 'http://localhost:' + server.address().port + '/elementica/';

const failures = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
function watch(page, tag) {
  page.on('pageerror', (e) => failures.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) failures.push(tag + ' console: ' + m.text()); });
  page.route('**/fonts.googleapis.com/**', (r) => r.abort());
}

/* 1. by hand */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  watch(page, 'hand');
  await page.goto(base + '?test=1&start=3&level=1&seed=11');
  await page.waitForFunction(() => window.__EL && window.__EL.st.S && window.__EL.st.map);
  // wait for my prep
  await page.waitForFunction(() => { const s = window.__EL.st; const w = window.__EL.E.who(s.S); return w && w.pid === s.me; }, null, { timeout: 20000 });
  await page.click('[data-act="prep"]');
  await page.click('.opt[data-hex]');
  await page.click('[data-answer="hex"]');
  await page.waitForFunction(() => { const s = window.__EL.st; const w = window.__EL.E.who(s.S); return w && w.kind === 'action' && w.pid === s.me; }, null, { timeout: 20000 });
  await page.screenshot({ path: path.join(out, 'hand-action.png') });
  // put the white coin chip in the first space, keep base and build
  const coinTok = await page.evaluate(() => { const s = window.__EL.st; return s.S.players[s.me].standby.find((id) => s.S.toks[id].type === 'N_COIN'); });
  await page.click('[data-tok="' + coinTok + '"]');
  await page.click('[data-act="go"]');
  // a base prompt (if affordable) then a build prompt (if affordable)
  for (let i = 0; i < 4; i++) {
    const req = await page.evaluate(() => window.__EL.st.flow && window.__EL.st.flow.req.k);
    if (!req) break;
    if (req === 'hex') {
      await page.screenshot({ path: path.join(out, 'hand-hex.png') });
      await page.click('.opt[data-hex]'); await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, 'hand-hex-sel.png') });
      await page.click('[data-answer="hex"]');
    }
    else if (req === 'build') { await page.screenshot({ path: path.join(out, 'hand-build.png') }); await page.click('[data-answer="skip"]'); }
    else if (req === 'obj') await page.click('[data-obj]');
  }
  const used = await page.evaluate(() => { const s = window.__EL.st; return s.S.players[s.me].used.length + s.S.players[s.me].standby.length; });
  if (used < 3) failures.push('hand: chips went missing');
  await page.click('[data-tab="me"]');
  await page.screenshot({ path: path.join(out, 'hand-board.png') });
  await page.click('[data-tab="board"]');
  await page.screenshot({ path: path.join(out, 'hand-common.png') });
  await page.close();
}

/* 2. the CPU plays my seat to the end */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  watch(page, 'auto');
  await page.goto(base + '?test=1&auto=1&start=3&level=2&seed=21');
  await page.waitForFunction(() => window.__EL && window.__EL.st.S && window.__EL.st.S.round >= 3, null, { timeout: 120000 });
  await page.click('[data-tab="turn"]');
  await page.screenshot({ path: path.join(out, 'auto-mid.png') });
  await page.waitForFunction(() => window.__EL.st.S.phase === 'end', null, { timeout: 240000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, 'auto-result.png') });
  const res = await page.evaluate(() => { const S = window.__EL.st.S; return { round: S.round, totals: S.result.rows.map((r) => r.total) }; });
  console.log('auto game:', JSON.stringify(res));
  await page.close();
}

/* 3. online over BroadcastChannel: a host and a guest in one browser */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watch(host, 'host'); watch(guest, 'guest');
  await host.goto(base + '?test=1&net=local');
  await host.click('#tOnline');
  await host.fill('#onName', 'ホスト');
  await host.click('#onCreate');
  await host.waitForFunction(() => document.querySelector('#lobCode').textContent.length === 4);
  const code = await host.textContent('#lobCode');
  await guest.goto(base + '?test=1&net=local&room=' + code);
  await guest.fill('#onName', 'ゲスト');
  await guest.click('#onJoin');
  await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat').length === 2, null, { timeout: 10000 });
  await host.click('#lobStart');
  await guest.waitForFunction(() => window.__EL.st.S && window.__EL.st.me === 1, null, { timeout: 10000 });
  // play prep on both sides by hand: whoever's turn it is
  for (let k = 0; k < 2; k++) {
    for (const pg of [host, guest]) {
      const mine = await pg.evaluate(() => { const s = window.__EL.st; const w = window.__EL.E.who(s.S); return w && w.pid === s.me && w.kind === 'prep'; });
      if (mine) {
        await pg.click('[data-act="prep"]'); await pg.click('.opt[data-hex]'); await pg.click('[data-answer="hex"]');
        await host.waitForTimeout(300);
      }
    }
  }
  await guest.waitForFunction(() => window.__EL.st.S.phase === 'action', null, { timeout: 10000 });
  const same = await Promise.all([host, guest].map((pg) => pg.evaluate(() => window.__EL.st.S.seq + ':' + window.__EL.st.S.hexes.filter((h) => h.base != null).length)));
  if (same[0] !== same[1]) failures.push('online: host and guest differ ' + same.join(' vs '));
  await guest.screenshot({ path: path.join(out, 'online-guest.png') });
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures.length ? failures.join('\n') + '\n' + failures.length + ' FAILED' : 'elementica browser check passed');
process.exit(failures.length ? 1 : 0);
