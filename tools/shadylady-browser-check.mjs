// シェディー・レディー: end-to-end check in a real browser (Chromium via Playwright, software WebGL).
//   node tools/shadylady-browser-check.mjs              a whole solo game upright (moves made by tapping the table
//                                                       and the buttons), a short one sideways, resume, then online
//   node tools/shadylady-browser-check.mjs --shots DIR  also save screenshots into DIR
//   SL_ONLY=portrait,landscape,resume,online           run only some of the parts
// My moves are chosen by the CPU logic (つよい) and made through the page: the draw pile, the top of a discard pile
// and my cards are tapped where they are drawn; Try, Jack and the answers use the buttons; the order sheet is tapped.
// SL_VENDOR=/path/to/node_modules serves three.js, PeerJS and the fonts (@fontsource) from local copies.
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
const PORT = 8796, BASE = `http://localhost:${PORT}/shady-lady/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.SL_VENDOR || '';
const ONLY = (process.env.SL_ONLY || 'portrait,landscape,resume,online').split(',');
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FONTS = { 'playfair-display': ['700.css', '900.css'], 'zen-kaku-gothic-new': ['400.css', '500.css', '700.css', '900.css'], 'shippori-mincho-b1': ['700.css', '800.css'] };
async function prep(ctx) {
  await ctx.route(/assets\/bgm\//, (r) => r.fulfill({ status: 404, body: '' }));
  if (!VENDOR) { await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' })); return; }
  await ctx.route(/three@0\.160\.0\/build\/three\.module\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'three/build/three.module.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/peerjs@1\.5\.4\/dist\/peerjs\.min\.js/, (r) => r.fulfill({ path: path.join(VENDOR, 'peerjs/dist/peerjs.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.googleapis\.com/, (r) => {
    let css = '';
    for (const [pkg, files] of Object.entries(FONTS)) for (const f of files) {
      const p = path.join(VENDOR, '@fontsource', pkg, f);
      if (fs.existsSync(p)) css += fs.readFileSync(p, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg + '/');
    }
    r.fulfill({ status: 200, body: css, contentType: 'text/css' });
  });
  await ctx.route(/fonts\.gstatic\.com\/local\//, (r) => {
    const m = r.request().url().match(/local\/([^/]+)\/(.+)$/);
    const f = m && path.join(VENDOR, '@fontsource', m[1], 'files', m[2]);
    if (f && fs.existsSync(f)) r.fulfill({ path: f, contentType: f.endsWith('woff2') ? 'font/woff2' : 'font/woff' }); else r.fulfill({ status: 404, body: '' });
  });
}
function watchErrors(page, tag, list) {
  page.on('pageerror', (e) => list.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|bgm|404/i.test(m.text())) list.push(`${tag}: ${m.text()}`); });
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 120000 }); }
async function openPage(browser, vp, url, tag, errors, ctxIn) {
  const ctx = ctxIn || await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  if (!ctxIn) await prep(ctx);
  const page = await ctx.newPage();
  watchErrors(page, tag, errors);
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  await page.evaluate(() => { window.__sl.settings.speed = 'fast'; window.__sl.settings.sound = false; });
  return { ctx, page };
}

/* one step of the person at this page, made through the interface. Returns what it did. */
async function personStep(page, opts = {}) {
  const s = await page.evaluate(() => {
    const q = window.__sl, V = q.V;
    if (!V) return { k: 'none' };
    if (document.querySelector('#layer .sheet-bg.order')) return { k: 'ordersheet' };
    if (V.phase === 'over') return { k: 'over' };
    if (!q.canAct()) return { k: 'wait' };
    const act = q.AI.decide(V, 3, Math.random);
    return { k: 'act', act, phase: V.phase, beat: q.E.canBeat(V) };
  });
  if (s.k === 'ordersheet') {
    for (let i = 0; i < 2; i++) {
      const sel = `#layer .sheet-bg.order .ocard:not(.on)`;
      if (!(await page.$(sel))) break;
      await page.click(sel, { timeout: 5000 }).catch(() => {});
      await sleep(150);
    }
    return 'order';
  }
  if (s.k !== 'act') return s.k;
  const a = s.act;
  if (!a) return 'none';
  if (opts.api) { await page.evaluate((a) => window.__sl.submit(a), a); return a.t; }
  const tp = await page.evaluate(() => window.__sl.scene.tapPoints());
  if (a.t === 'draw') { await page.mouse.click(tp.deck.x, tp.deck.y); return 'draw'; }
  if (a.t === 'take') { const p = tp.piles[a.from]; if (p) { await page.mouse.click(p.x, p.y); return 'take'; } await page.evaluate((a) => window.__sl.submit(a), a); return 'take(api)'; }
  if (a.t === 'discard') {
    const p = tp.hand[a.card];
    if (p) { await page.mouse.click(p.x, p.y); await sleep(150); await page.mouse.click(p.x, p.y); return 'discard'; }
    await page.evaluate((a) => window.__sl.submit(a), a); return 'discard(api)';
  }
  if (a.t === 'try') { await page.click('#dock [data-act="try"]'); return 'try'; }
  if (a.t === 'jack') {
    await page.click('#dock [data-act="jack"]');
    await sleep(150);
    await page.click(`#tags .tag[data-seat="${a.target}"]`);
    await sleep(150);
    await page.click('#dock [data-act="jackGo"]');
    return 'jack';
  }
  if (a.t === 'respond') {
    await page.click(`#dock [data-act="${a.reveal ? 'reveal' : 'pass'}"]`);
    return a.reveal ? 'reveal' : 'pass';
  }
  if (a.t === 'order') { await page.evaluate((a) => window.__sl.submit(a), a); return 'order(api)'; }
  return 'none';
}
async function playOut(page, limitMs, opts = {}) {
  const t0 = Date.now(), did = {};
  let stuckSince = Date.now(), lastMoves = -1;
  while (Date.now() - t0 < limitMs) {
    const k = await personStep(page, opts);
    did[k] = (did[k] || 0) + 1;
    if (k === 'over') break;
    const mv = await page.evaluate(() => window.__sl.V ? window.__sl.V.moves : -1);
    if (mv !== lastMoves) { lastMoves = mv; stuckSince = Date.now(); }
    else if (Date.now() - stuckSince > 25000) { did.stuck = 1; break; }
    if (opts.stopAt && did[opts.stopAt] >= (opts.stopAfter || 1)) break;
    await sleep(k === 'wait' ? 120 : 260);
  }
  return did;
}
async function tableOk(page) {
  for (let k = 0; k < 200; k++) {
    const r = await tableNow(page);
    if (r !== 'busy') return r;
    await sleep(60);
  }
  return ['always busy'];
}
// checked in one go while nothing is being animated (a CPU may start its move right after)
async function tableNow(page) {
  return page.evaluate(() => {
    const q = window.__sl, V = q.V, c = q.scene.counts();
    if (q.busy) return 'busy';
    const bad = [];
    if (c.deck !== V.deck) bad.push('deck ' + c.deck + '≠' + V.deck);
    V.players.forEach((P, s) => {
      const T = c.seats[s];
      if (T.chips !== P.pts) bad.push(`chips ${s}`);
      if (T.pile.join() !== P.pile.join()) bad.push(`pile ${s}`);
      if (s !== V.me && T.hand !== P.count) bad.push(`hand ${s}`);
    });
    if (c.mine.slice().sort().join() !== (V.players[V.me].hand || []).map((h) => h.id).sort().join()) bad.push('my hand');
    return bad;
  });
}

try {
  await sleep(500);
  const browser = await playwright.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  /* ---------------------------------------------------------------- a whole game upright, by tapping */
  if (ONLY.includes('portrait')) {
    const errors = [];
    const { ctx, page } = await openPage(browser, { width: 390, height: 844 }, BASE + '?test=1', 'portrait', errors);
    await shot(page, 'p0-title');
    await page.click('#tSolo');
    await page.click('#soN [data-v="4"]');
    await page.click('#soLevel [data-v="2"]');
    await page.click('#soFirst [data-v="me"]');
    await page.click('#soTarget [data-v="3"]');
    await shot(page, 'p1-setup');
    await page.click('#soStart');
    await page.waitForFunction(() => window.__sl.V && window.__sl.canAct(), null, { timeout: 30000 });
    await page.evaluate(() => { window.__sl.settings.speed = 'fast'; window.__sl.scene.setSpeed(0.55); });
    await shot(page, 'p2-start');
    // a first move by hand: tap the draw pile, then one of my cards twice
    let tp = await page.evaluate(() => window.__sl.scene.tapPoints());
    await page.mouse.click(tp.deck.x, tp.deck.y);
    await page.waitForFunction(() => window.__sl.V.phase === 'discard' && window.__sl.canAct(), null, { timeout: 15000 });
    check(true, 'tapping the draw pile draws a card');
    await shot(page, 'p3-discard');
    tp = await page.evaluate(() => window.__sl.scene.tapPoints());
    const id = await page.evaluate(() => window.__sl.V.players[0].hand[0].id);
    await page.mouse.click(tp.hand[id].x, tp.hand[id].y);
    await sleep(200);
    const selected = await page.evaluate(() => window.__sl.U.sel);
    check(selected === id, 'the first tap on a card selects it');
    await page.mouse.click(tp.hand[id].x, tp.hand[id].y);
    await page.waitForFunction((id) => window.__sl.V.players[0].pile.length === 1 && window.__sl.V.phase !== 'discard', id, { timeout: 15000 });
    check(true, 'the second tap discards it onto my pile');
    // the rest of the game through the page
    const did = await playOut(page, 420000);
    const fin = await page.evaluate(() => ({ phase: window.__sl.V.phase, pts: window.__sl.V.players.map((p) => p.pts), w: window.__sl.V.winner }));
    console.log('     my moves:', JSON.stringify(did), 'result', JSON.stringify(fin));
    check(fin.phase === 'over' && fin.pts[fin.w] === 3, 'a whole 4-player game reaches 3 points');
    check(!did.stuck, 'the game never stalled');
    await page.waitForSelector('#layer .sheet-bg.end', { timeout: 15000 });
    check(true, 'the result sheet opens');
    check((await tableOk(page)).length === 0, 'the table matches the game at the end: ' + (await tableOk(page)).join(','));
    await shot(page, 'p4-end');
    await page.click('#layer .sheet-bg.end [data-a="again"]');
    await page.waitForFunction(() => window.__sl.V && window.__sl.V.phase !== 'over' && window.__sl.V.moves === 0, null, { timeout: 15000 });
    check(true, '「もう一度」 starts a new game');
    // the menu, the rules, the log, a seat
    await page.click('#btnMenu'); await sleep(150);
    check(await page.isVisible('#layer .sheet [data-seg="speed"]'), 'the menu opens');
    await page.click('#layer .sheet [data-a="rules"]'); await sleep(150);
    check((await page.textContent('#layer .sheet')).includes('ゾロ目'), 'the rules open from the menu');
    await shot(page, 'p5-rules');
    await page.click('#layer .sheet [data-a="close"]');
    await page.click('#btnLog'); await sleep(150);
    check(await page.isVisible('#logList'), 'the log opens');
    await page.click('#layer .sheet [data-a="close"]');
    await page.click('#tags .tag[data-seat="2"]'); await sleep(150);
    check((await page.textContent('#layer .sheet')).includes('捨て札'), 'tapping a name shows that player');
    await page.click('#layer .sheet [data-a="close"]');
    check(errors.length === 0, 'no errors upright' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  /* ---------------------------------------------------------------- sideways, six players, with the order sheet */
  if (ONLY.includes('landscape')) {
    const errors = [];
    const { ctx, page } = await openPage(browser, { width: 844, height: 390 }, BASE + '?test=1', 'landscape', errors);
    await page.evaluate(() => { window.__sl.settings.order = 'pick'; window.__sl.startSolo({ n: 6, level: 3, first: 'me', target: 3 }); window.__sl.scene.setSpeed(0.55); });
    await page.waitForFunction(() => window.__sl.V && window.__sl.canAct(), null, { timeout: 30000 });
    await shot(page, 'l1-start');
    const did = await playOut(page, 300000, { stopAt: 'order', stopAfter: 1 });
    console.log('     sideways:', JSON.stringify(did));
    check(!did.stuck, 'six players sideways keep going');
    await page.waitForFunction(() => !window.__sl.busy, null, { timeout: 20000 });
    await shot(page, 'l2-mid');
    const bad = await tableOk(page);
    check(bad.length === 0, 'the table matches the game sideways' + (bad.length ? ': ' + bad.join(',') : ''));
    check(errors.length === 0, 'no errors sideways' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  /* ---------------------------------------------------------------- resume */
  if (ONLY.includes('resume')) {
    const errors = [];
    const { ctx, page } = await openPage(browser, { width: 390, height: 844 }, BASE + '?test=1', 'resume', errors);
    await page.evaluate(() => window.__sl.startSolo({ n: 3, level: 1, first: 'me', target: 3 }));
    await page.waitForFunction(() => window.__sl.V && window.__sl.canAct(), null, { timeout: 30000 });
    await playOut(page, 60000, { api: true, stopAt: 'discard', stopAfter: 3 });
    await page.waitForFunction(() => !window.__sl.busy && window.__sl.canAct(), null, { timeout: 30000 });
    const before = await page.evaluate(() => ({ t: window.__sl.V.turnNo, m: window.__sl.V.moves, hand: window.__sl.V.players[0].hand.map((c) => c.id).sort().join(), piles: window.__sl.V.players.map((p) => p.pile.join('')) }));
    await page.reload();
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    check(await page.isVisible('#tResume'), '「続きから」 appears after a reload');
    await page.click('#tResume');
    await page.waitForFunction(() => window.__sl.V, null, { timeout: 30000 });
    const after = await page.evaluate(() => ({ t: window.__sl.V.turnNo, m: window.__sl.V.moves, hand: window.__sl.V.players[0].hand.map((c) => c.id).sort().join(), piles: window.__sl.V.players.map((p) => p.pile.join('')) }));
    check(JSON.stringify(before) === JSON.stringify(after), 'the game comes back exactly as it was');
    const did = await playOut(page, 240000, { api: true });
    check(did.over >= 1, 'the resumed game can be finished');
    check(errors.length === 0, 'no errors in resume' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  /* ---------------------------------------------------------------- online: host + guest + CPU */
  if (ONLY.includes('online')) {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await prep(ctx);
    const { page: host } = await openPage(browser, null, BASE + '?net=local&test=1', 'host', errors, ctx);
    const { page: guest } = await openPage(browser, null, BASE + '?net=local&test=1', 'guest', errors, ctx);
    await host.click('#tOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
    await host.waitForSelector('#scrLobby:not([hidden])');
    const code = (await host.textContent('#lobCode')).trim();
    await guest.click('#tOnline'); await guest.fill('#onName', 'ゲスト'); await guest.fill('#onCode', code); await guest.click('#onJoin');
    await guest.waitForSelector('#scrLobby:not([hidden])');
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat-row').length === 2, null, { timeout: 15000 });
    await host.click('#lobAddCpu');
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seat-row').length === 3);
    await guest.waitForFunction(() => document.querySelectorAll('#lobSeats .seat-row').length === 3, null, { timeout: 15000 });
    check(true, 'a guest joins by room code and sees the CPU seat');
    await shot(guest, 'o1-lobby');
    await host.click('#lobStart');
    await guest.waitForFunction(() => window.__sl.V && window.__sl.S && window.__sl.S.kind === 'guest', null, { timeout: 20000 });
    check(true, 'the game starts on both screens');
    const leak = await guest.evaluate(() => window.__sl.V.players.some((p, i) => i !== window.__sl.V.me && p.hand));
    check(!leak, 'the guest never receives another player\'s hand');
    await guest.evaluate(() => { window.__sl.settings.order = 'auto'; });
    await host.evaluate(() => { window.__sl.settings.order = 'auto'; });
    const t0 = Date.now(); let lastMv = -1, still = Date.now(), stuck = false;
    while (Date.now() - t0 < 360000) {
      const [a, b] = await Promise.all([personStep(host, { api: true }), personStep(guest, { api: true })]);
      if (a === 'over' && b === 'over') break;
      const mv = await host.evaluate(() => window.__sl.V ? window.__sl.V.moves : -1);
      if (mv !== lastMv) { lastMv = mv; still = Date.now(); } else if (Date.now() - still > 30000) { stuck = true; break; }
      await sleep(200);
    }
    await sleep(2500);
    const hv = await host.evaluate(() => ({ phase: window.__sl.V.phase, pts: window.__sl.V.players.map((p) => p.pts), w: window.__sl.V.winner }));
    const gv = await guest.evaluate(() => ({ phase: window.__sl.V.phase, pts: window.__sl.V.players.map((p) => p.pts), w: window.__sl.V.winner }));
    console.log('     online result', JSON.stringify(hv), JSON.stringify(gv));
    check(!stuck && hv.phase === 'over', 'an online game with a host, a guest and a CPU is played to the end');
    check(JSON.stringify(hv) === JSON.stringify(gv), 'host and guest agree on the result');
    const gbad = await tableOk(guest);
    check(gbad.length === 0, 'the guest\'s table matches its view' + (gbad.length ? ': ' + gbad.join(',') : ''));
    await shot(guest, 'o2-end');
    check(errors.length === 0, 'no errors online' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  await browser.close();
} catch (e) {
  console.error(e);
  failures.push('crashed: ' + e.message);
} finally {
  server.kill();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall browser checks passed');
process.exit(failures.length ? 1 : 0);
