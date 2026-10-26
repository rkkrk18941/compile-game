// クォ・ヴァディス: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/quovadis-browser-check.mjs              a whole solo game upright, a short one sideways, resume, then online
//   node tools/quovadis-browser-check.mjs --shots DIR  also save screenshots into DIR
//   QV_ONLY=portrait,landscape,resume,online           run only some of the parts
// My moves are chosen by the CPU logic but made through the page (the option buttons, the negotiation rows, the
// request sheet). QV_VENDOR=/path/to/node_modules serves three.js / PeerJS from local copies instead of the CDN.
// The online part runs over BroadcastChannel (?net=local): a host, a guest and a CPU play a whole game.
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
const PORT = 8794, BASE = `http://localhost:${PORT}/quo-vadis/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.QV_VENDOR || '';
const ONLY = (process.env.QV_ONLY || 'portrait,landscape,resume,online').split(',');
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prep(ctx) {
  await ctx.route(/assets\/bgm\//, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  if (!VENDOR) return;
  await ctx.route(/three@0\.160\.0\/build\/three\.module\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'three/build/three.module.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/peerjs@1\.5\.4\/dist\/peerjs\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'peerjs/dist/peerjs.min.js'), contentType: 'text/javascript' }));
}
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|bgm|404/i.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 120000 }); }
async function openPage(browser, vp, url, tag, errors) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, tag, errors);
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.evaluate(() => { window.__qv.settings.speed = 'fast'; window.__qv.settings.sound = false; });
  return { ctx, page };
}

/* one step of the person at this page: answer a request, or act on my turn, through the interface */
async function personStep(page) {
  const s = await page.evaluate(() => {
    const q = window.__qv, V = q.V;
    if (!V) return { k: 'none' };
    const sheet = document.querySelector('#layer .sheet');
    if (sheet) return { k: V.phase === 'over' && sheet.querySelector('table.res') ? 'end' : 'sheet' };
    if (V.phase === 'over') return { k: 'over' };
    if (q.U.req) return { k: 'req' };
    // a negotiation of mine in progress: wait for the answers without blocking the other page
    if (window.__qvAsked && q.U.nego) return { k: Object.values(q.U.nego.rows).some((r) => r.st === 'wait') ? 'asking' : 'answers' };
    window.__qvAsked = false;
    return { k: q.canAct() ? (V.phase === 'bonus' ? 'bonus' : 'turn') : 'wait' };
  });
  if (s.k === 'asking') return 'asking';
  if (s.k === 'answers') {
    await page.evaluate(() => { window.__qvAsked = false; });
    if (await page.evaluate(() => !!document.querySelector('#aGo') && !document.querySelector('#aGo').disabled)) { await page.locator('#aGo').click({ noWaitAfter: true }); return 'nego'; }
    await page.evaluate(() => { const q = window.__qv, N = q.U.nego; if (!window.__qvSkip || window.__qvSkip.turn !== q.V.turnNo) window.__qvSkip = { turn: q.V.turnNo, keys: [] }; if (N) window.__qvSkip.keys.push(N.from + '-' + N.to); });
    await page.locator('#aCancel').click({ noWaitAfter: true });
    return 'refused';
  }
  if (s.k === 'sheet') { await page.locator('#layer .sheet [data-a="close"]').first().click({ noWaitAfter: true }).catch(() => {}); return 'sheet'; }
  if (s.k !== 'req' && s.k !== 'turn' && s.k !== 'bonus') return s.k;
  // the full position as the CPU logic wants it (guests only have their view: unknown parts filled with averages)
  const plan = await page.evaluate((k) => {
    const q = window.__qv, V = q.V;
    const st = JSON.parse(JSON.stringify(q.S.st || V));
    if (typeof st.bag === 'number') st.bag = new Array(st.bag).fill({ v: 3 });
    st.players.forEach((p) => { if (!Array.isArray(p.got)) { const n = Math.max(0, (p.tiles || 0) - (p.ones || 0)); p.got = new Array(n).fill(3); p.pts = (p.ones || 0) + 3 * n; p.paid = 0; p.recv = 0; } });
    if (k === 'req') return { ans: q.AI.respond(st, V.me, q.U.req.req, 2, Math.random) };
    if (k === 'bonus') return { bonus: q.AI.bonus(st, V.me, 2, Math.random) };
    const skip = window.__qvSkip && window.__qvSkip.turn === V.turnNo ? window.__qvSkip.keys : [];
    return { cands: q.AI.decide(st, V.me, 2, Math.random).filter((c) => !(c.asks && skip.indexOf(c.act.from + '-' + c.act.to) >= 0)).slice(0, 6).map((c) => ({ act: c.act, asks: c.asks || null })) };
  }, s.k);
  if (plan.ans) {
    const a = plan.ans;
    if (a.ok) await page.locator('#rYes').click({ noWaitAfter: true });
    else if (a.ask) { await page.evaluate((x) => { window.__qv.U.req.pay = x; }, a.ask); await page.locator('#rAsk').click({ noWaitAfter: true }); }
    else await page.locator('#rNo').click({ noWaitAfter: true });
    return 'answered';
  }
  if (plan.bonus !== undefined) {
    if (plan.bonus) { await page.locator(`[data-b="${plan.bonus}"]`).click({ noWaitAfter: true }); await page.locator('#aGo').click({ noWaitAfter: true }); }
    else await page.locator('#aSkip').click({ noWaitAfter: true });
    return 'bonus';
  }
  for (const c of plan.cands) {
    const a = c.act;
    if (a.t === 'place') { await page.locator(`[data-place="${a.c}"]`).click({ noWaitAfter: true }); await page.locator('#aGo').click({ noWaitAfter: true }); return 'place'; }
    if (a.t === 'caesar') { await page.locator(`[data-caesar="${a.to}"]`).click({ noWaitAfter: true }); await page.locator('#aGo').click({ noWaitAfter: true }); return 'caesar'; }
    await page.locator(`[data-from="${a.from}"][data-to="${a.to}"]`).click({ noWaitAfter: true });
    if (!c.asks) { await page.locator('#aGo').click({ noWaitAfter: true }); return 'move'; }
    // the offers the CPU logic planned, set in the negotiation rows, then ask
    await page.evaluate((c) => { const N = window.__qv.U.nego; Object.keys(N.rows).forEach((k) => { N.rows[k].use = false; }); c.asks.forEach((x) => { const r = N.rows[x.q]; if (r) { r.use = true; r.votes = x.k; r.pay = x.pay || 0; } }); }, c);
    await page.evaluate(() => { window.__qvAsked = true; });
    await page.locator('#aAsk').click({ noWaitAfter: true });
    return 'asking';
  }
  const first = await page.evaluate(() => window.__qv.D.LAUREL_PATHS.find((p) => p !== window.__qv.V.caesar));
  await page.locator(`[data-caesar="${first}"]`).click({ noWaitAfter: true }); await page.locator('#aGo').click({ noWaitAfter: true });
  return 'caesar';
}

async function soloGame(browser, vp, tag, maxActs) {
  const errors = [];
  const { ctx, page } = await openPage(browser, vp, BASE, tag, errors);
  await shot(page, tag + '-title');
  await page.locator('#tSolo').click();
  await page.locator('#soN [data-v="4"]').click();
  await page.locator('#soVar [data-v="both"]').click();
  await page.locator('#soStart').click();
  await page.waitForFunction(() => window.__qv.V && window.__qv.S, null, { timeout: 30000 });
  const tally = {};
  let acts = 0, end = false;
  for (let i = 0; i < 20000 && acts < maxActs; i++) {
    const k = await personStep(page);
    tally[k] = (tally[k] || 0) + 1;
    if (['place', 'move', 'nego', 'caesar', 'bonus'].includes(k)) { acts++; if (acts === 3) await shot(page, tag + '-play'); }
    if (k === 'nego' && tally.nego === 1) await shot(page, tag + '-after-nego');
    if (k === 'end') { end = true; await shot(page, tag + '-end'); break; }
    await sleep(k === 'wait' ? 150 : 60);
  }
  const res = await page.evaluate(() => { const V = window.__qv.V; return { phase: V.phase, senate: V.senate.length, turn: V.turnNo }; });
  return { ctx, page, errors, tally, end, res };
}

const browser = await playwright.chromium.launch({ executablePath: process.env.QV_CHROMIUM || undefined, args: (process.env.QV_GL || '--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist').split(' ') });
try {
  await sleep(500);
  if (ONLY.includes('portrait')) {
    const r = await soloGame(browser, { width: 390, height: 844 }, 'portrait', 400);
    check(r.end && r.res.phase === 'over' && r.res.senate === 5, `portrait: a whole 4-player game to the end (${r.res.turn} turns; ${JSON.stringify(r.tally)})`);
    check((r.tally.nego || 0) + (r.tally.answered || 0) > 0, 'portrait: negotiations happened through the page (asking and answering)');
    check(!r.errors.length, 'portrait: no page errors' + (r.errors.length ? ' — ' + r.errors.slice(0, 3).join(' | ') : ''));
    await r.ctx.close();
  }
  if (ONLY.includes('landscape')) {
    const r = await soloGame(browser, { width: 844, height: 390 }, 'landscape', 10);
    check(r.res.turn > 10, 'landscape: game remains playable');
    const side = await r.page.evaluate(() => window.__qv.scene().orient);
    check(side === 'front', 'landscape: Senate stays at the top and own supply stays by the entrance');
    check(!r.errors.length, 'landscape: no page errors' + (r.errors.length ? ' — ' + r.errors.slice(0, 3).join(' | ') : ''));
    await r.ctx.close();
  }
  if (ONLY.includes('resume')) {
    const errors = [];
    const { ctx, page } = await openPage(browser, { width: 390, height: 844 }, BASE, 'resume', errors);
    await page.evaluate(() => window.__qv.startSolo({ n: 3, level: 1, color: 'yellow', first: 'me', open: '0', variant: 'none' }));
    await page.waitForFunction(() => window.__qv.canAct(), null, { timeout: 30000 });
    await page.locator('[data-place="A2"]').click(); await page.locator('#aGo').click();
    await page.waitForFunction(() => window.__qv.canAct() && window.__qv.V.turnNo > 3, null, { timeout: 60000 });
    const before = await page.evaluate(() => JSON.stringify(window.__qv.S.st.occ));
    await page.reload();
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    check(await page.locator('#tResume').isVisible(), 'resume: the title offers 続きから');
    await page.locator('#tResume').click();
    await page.waitForFunction(() => window.__qv.S && window.__qv.V, null, { timeout: 30000 });
    const after = await page.evaluate(() => JSON.stringify(window.__qv.S.st.occ));
    check(before === after, 'resume: the saved game comes back as it was');
    const hidden = await page.evaluate(() => window.__qv.V.players.filter((p, i) => i !== window.__qv.V.me).every((p) => p.pts === null));
    check(hidden, 'resume: the other players\' laurels stay hidden');
    check(!errors.length, 'resume: no page errors' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  if (ONLY.includes('online')) {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await prep(ctx);
    const open = async (tag) => { const p = await ctx.newPage(); watchErrors(p, tag, errors); await p.goto(BASE + '?net=local'); await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }); await p.evaluate(() => { window.__qv.settings.speed = 'fast'; window.__qv.settings.sound = false; }); return p; };
    const host = await open('host'), guest = await open('guest');
    await host.locator('#tOnline').click(); await host.fill('#onName', 'ホスト'); await host.locator('#onCreate').click();
    await host.waitForFunction(() => document.querySelector('#lobCode').textContent.length === 4);
    const code = await host.evaluate(() => document.querySelector('#lobCode').textContent);
    await guest.locator('#tOnline').click(); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.locator('#onJoin').click();
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .lseat').length === 2, null, { timeout: 15000 });
    check(true, 'online: a guest joined the room by its code');
    await host.locator('#lobAddCpu').click();
    await host.locator('#lobStart').click();
    await guest.waitForFunction(() => window.__qv.S && window.__qv.S.kind === 'guest' && window.__qv.V, null, { timeout: 20000 });
    const tally = { host: {}, guest: {} };
    const t0 = Date.now();
    let done = false;
    while (Date.now() - t0 < 900000) {
      const [a, b] = await Promise.all([personStep(host), personStep(guest)]);
      tally.host[a] = (tally.host[a] || 0) + 1; tally.guest[b] = (tally.guest[b] || 0) + 1;
      if ((a === 'end' || a === 'over') && (b === 'end' || b === 'over')) { done = true; break; }
      await sleep(80);
    }
    await shot(guest, 'online-guest-end');
    const rh = await host.evaluate(() => ({ phase: window.__qv.V.phase, w: window.__qv.V.over && window.__qv.V.over.winner, turn: window.__qv.V.turnNo, pts: window.__qv.V.players.map((p) => p.pts) }));
    const rg = await guest.evaluate(() => ({ phase: window.__qv.V.phase, w: window.__qv.V.over && window.__qv.V.over.winner, turn: window.__qv.V.turnNo, pts: window.__qv.V.players.map((p) => p.pts) }));
    check(done && rh.phase === 'over' && JSON.stringify(rh) === JSON.stringify(rg), `online: host and guest finish the same game (${rh.turn} turns; host ${JSON.stringify(tally.host)}; guest ${JSON.stringify(tally.guest)})`);
    check((tally.host.answered || 0) + (tally.guest.answered || 0) + (tally.host.nego || 0) + (tally.guest.nego || 0) > 0, 'online: requests went across the link');
    check(!errors.length, 'online: no page errors' + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures.length ? `${failures.length} check(s) failed` : 'all checks passed');
process.exit(failures.length ? 1 : 0);
