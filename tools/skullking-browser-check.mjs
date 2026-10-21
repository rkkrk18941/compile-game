// スカルキング: end-to-end check in a real browser (Chromium via Playwright).
//   node tools/skullking-browser-check.mjs              a full 10-round CPU game on a phone played by tapping, a 2-player game
//                                                        with Graybeard and every optional rule, an 8-player game on a desktop,
//                                                        resuming a saved game, then an online game between two tabs
//                                                        (?net=local, BroadcastChannel)
//   node tools/skullking-browser-check.mjs --shots DIR  also save screenshots into DIR
// The final scores on screen are compared with the engine's own scores.
// Needs Playwright (npm i -g playwright) and Chromium. SK_VENDOR=/path/to/node_modules serves the fonts
// (@fontsource/dela-gothic-one, @fontsource/zen-maru-gothic) from local copies instead of Google Fonts.
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
const PORT = 8797, BASE = `http://localhost:${PORT}/skull-king/`;
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const VENDOR = process.env.SK_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss() {
  if (!VENDOR) return '';
  let css = '';
  for (const [pkg, files] of [['@fontsource/dela-gothic-one', ['400.css']], ['@fontsource/zen-maru-gothic', ['500.css', '700.css']]]) {
    for (const f of files) {
      const p = path.join(VENDOR, pkg, f);
      if (fs.existsSync(p)) css += fs.readFileSync(p, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg.split('/')[1] + '/');
    }
  }
  return css;
}
async function newContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  const css = fontCss();
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const u = new URL(r.request().url()), parts = u.pathname.split('/');
    const file = VENDOR && parts[1] === 'local' ? path.join(VENDOR, '@fontsource', parts[2], 'files', parts[3]) : '';
    if (file && fs.existsSync(file)) r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(file) });
    else r.fulfill({ status: 404, body: '' });
  });
  await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com/, (r) => r.abort());
  return ctx;
}
function watch(page, label) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(label + ' console: ' + m.text()); });
  return errors;
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

// Play whatever this page is asked to do until the result appears. Returns some counts.
async function autoplay(page, { maxMs = 240000, label = '', rnd = Math.random, shotPrefix = null } = {}) {
  const t0 = Date.now(), seen = { bids: 0, plays: 0, rounds: 0, abilities: 0, tigress: 0 };
  let shotRound = false, lastError = '';
  while (Date.now() - t0 < maxMs) {
    const state = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      if (q('.podium')) return { k: 'over' };
      if (q('.sheet [data-close]') && /配られなかったカード/.test(q('.sheet h3').textContent)) return { k: 'closesheet' };
      if (q('[data-next]')) return { k: 'next' };
      if (q('.coin')) return { k: 'bid', n: document.querySelectorAll('.coin').length };
      if (q('#actions [data-act="bendt"]')) return { k: 'bendt', need: +(q('#actions .hint').textContent.match(/(\d)枚/) || [0, 2])[1] };
      const ab = q('#actions [data-act="rosie"], #actions [data-act="rascal"], #actions [data-act="juanitaView"], #actions [data-act="harry"]');
      if (ab) return { k: 'ability' };
      if (q('#actions [data-act="tig"]')) return { k: 'tig' };
      if (q('#actions [data-act="play"]')) return { k: 'confirm' };
      const p = q('#prompt') ? q('#prompt').textContent : '';
      if (/あなたのリード|あなたの番/.test(p)) {
        const ok = [...document.querySelectorAll('#hand .card:not(.no)')].map((c) => c.dataset.id);
        return { k: 'play', ok };
      }
      return { k: 'wait' };
    });
    try {
      if (state.k === 'over') return seen;
      if (state.k === 'closesheet') { await page.click('.sheet [data-close]', { timeout: 1500 }); continue; }
      if (state.k === 'next') {
        seen.rounds++;
        if (shotPrefix && !shotRound) { await shot(page, shotPrefix + '-round'); shotRound = true; }
        await page.click('[data-next]', { timeout: 1500 });
      } else if (state.k === 'bid') {
        const n = Math.floor(rnd() * Math.min(state.n, 4));
        await page.click(`.coin[data-bid="${n}"]`, { timeout: 1500 });
        await page.click('[data-act="bid"]', { timeout: 1500 });
        seen.bids++;
      } else if (state.k === 'bendt') {
        const ids = await page.evaluate((need) => [...document.querySelectorAll('#hand .card')].slice(0, need).map((c) => c.dataset.id), state.need);
        for (const id of ids) await page.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 });
        await page.click('#actions [data-act="bendt"]', { timeout: 1500 });
        seen.abilities++;
      } else if (state.k === 'ability') {
        const btns = await page.$$('#actions [data-act]');
        await btns[Math.floor(rnd() * btns.length)].click({ timeout: 1500 });
        seen.abilities++;
      } else if (state.k === 'tig') {
        await page.click(`#actions [data-act="tig"][data-as="${rnd() < 0.5 ? 'pirate' : 'escape'}"]`, { timeout: 1500 });
        seen.tigress++; seen.plays++;
      } else if (state.k === 'confirm') {
        await page.click('#actions [data-act="play"]', { timeout: 1500 });
        seen.plays++;
      } else if (state.k === 'play' && state.ok.length) {
        const id = state.ok[Math.floor(rnd() * state.ok.length)];
        try { await page.click(`#hand .card[data-id="${id}"]`, { timeout: 1500 }); } catch (e) {
          // what is in the way? (kept for debugging layout problems)
          const hit = await page.evaluate((id) => {
            const c = document.querySelector(`#hand .card[data-id="${id}"]`); if (!c) return 'card gone';
            const r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, el = document.elementFromPoint(x, y);
            const d = (n) => n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && n.className.baseVal === undefined ? '.' + String(n.className).trim().replace(/\s+/g, '.') : '') : 'null';
            return `card box ${[r.left, r.top, r.width, r.height].map(Math.round)} in ${innerWidth}x${innerHeight}; at center: ${d(el)} < ${d(el && el.parentElement)} < ${d(el && el.parentElement && el.parentElement.parentElement)}`;
          }, id).catch((x) => String(x));
          throw new Error(hit + '\n' + e.message);
        }
      } else await sleep(40);
    } catch (e) { lastError = state.k + ': ' + String(e.message).split('\n').slice(0, 18).join(' / '); await sleep(60); }
  }
  const dump = await page.evaluate(() => {
    const a = window.__sk && window.__sk.app, v = a && a.v;
    return v ? { phase: v.phase, turn: v.turn, me: v.me, round: v.round, ability: v.ability, busy: a.busy, pending: a.pending, prompt: document.querySelector('#prompt').textContent,
      actions: document.querySelector('#actions').innerHTML.slice(0, 300), sheets: [...document.querySelectorAll('.sheet h3')].map((h) => h.textContent), k: v.k, lastK: a.lastK, hand: v.hand,
      dom: [...document.querySelectorAll('#hand .card')].map((c) => c.dataset.id + (c.className.includes(' no') ? '·no' : '') + (c.className.includes('sel') ? '·sel' : '')).join(' '),
      sel: a.sel, trick: v.trick && v.trick.plays } : null;
  }).catch((e) => String(e));
  check(false, label + ' finished in time\n  ' + JSON.stringify(dump) + '\n  last error: ' + lastError);
  return seen;
}
async function finalScores(page) {
  return page.evaluate(() => [...document.querySelectorAll('.podium .pl')].map((r) => +r.querySelector('.sc').textContent));
}
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function cpuGame(browser, { label, viewport, mobile, count, level, opts, seed, shots }) {
  const ctx = await newContext(browser, { viewport, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
  await ctx.addInitScript(([c, l, o]) => { localStorage.setItem('sk.count', c); localStorage.setItem('sk.level', JSON.stringify(l)); localStorage.setItem('sk.opts', JSON.stringify(o)); }, [String(count), level, opts]);
  const page = await ctx.newPage();
  const errors = watch(page, label);
  await page.goto(BASE + '?test=1');
  await page.click('#goCpu');
  if (shots) await shot(page, shots + '-setup');
  await page.click('#cpuStart');
  await page.waitForSelector('#hand .card', { timeout: 10000 });
  if (shots) { await page.waitForSelector('.coin'); await shot(page, shots + '-bid'); }
  const seen = await autoplay(page, { label, rnd: seeded(seed), shotPrefix: shots });
  if (shots) await shot(page, shots + '-result');
  const shown = await finalScores(page);
  const st = await page.evaluate(() => window.__sk.ctl().table.st);
  const want = st.ranking.map((r) => r.score);
  check(JSON.stringify(shown) === JSON.stringify(want), `${label}: result list matches the engine (${shown.join(', ')})`);
  check(st.history.length === st.schedule.length, `${label}: all ${st.schedule.length} rounds were played`);
  check(seen.bids === st.schedule.length, `${label}: bid once per round by tapping (${seen.bids})`);
  check(errors.length === 0, `${label}: no script errors` + (errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''));
  await ctx.close();
  return { seen, st };
}

// SK_ONLY=phone,ghost,desktop,landscape,resume,online,abilities runs only those parts
const ONLY = (process.env.SK_ONLY || '').split(',').filter(Boolean);
const part = (name) => !ONLY.length || ONLY.includes(name);

try {
  await sleep(500);
  const browser = await playwright.chromium.launch();

  // 1) a full standard game on a phone, 4 players
  if (part('phone')) await cpuGame(browser, { label: 'phone 4p', viewport: { width: 390, height: 844 }, mobile: true, count: 4, level: 'normal', opts: {}, seed: 1, shots: 'phone' });

  // 2) two players with Graybeard's ghost and every optional rule, Rascal scoring with cannonballs
  if (part('ghost')) {
    const r = await cpuGame(browser, { label: 'phone 2p', viewport: { width: 390, height: 760 }, mobile: true, count: 2, level: 'hard',
      opts: { kraken: true, whale: true, loot: true, abilities: true, scoring: 'rascal', cannon: true, schedule: 'swift' }, seed: 2, shots: 'ghost' });
    check(r.st.ghost && !r.st.opts.loot, 'phone 2p: Graybeard plays and loot is left out');
  }

  // 3) eight players on a desktop with all extras
  if (part('desktop')) {
    const r = await cpuGame(browser, { label: 'desktop 8p', viewport: { width: 1280, height: 800 }, count: 8, level: 'easy',
      opts: { kraken: true, whale: true, loot: true, abilities: true, schedule: 'brawl' }, seed: 3, shots: 'desktop' });
    check(r.st.schedule.join() === '6,7,8,9,9', 'desktop 8p: Skip to the Brawl capped at 9 cards with 74 cards');
  }

  // 4) a 10-card hand on every screen size: nothing spills off the screen while bidding and playing
  for (const [w, h, mobile, name] of part('layout') || part('landscape') ? [[320, 640, true, 'small phone'], [390, 844, true, 'phone'], [844, 390, true, 'landscape'], [667, 375, true, 'small landscape'], [1280, 800, false, 'desktop']] : []) {
    const ctx = await newContext(browser, { viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    await ctx.addInitScript(() => { localStorage.setItem('sk.count', '6'); localStorage.setItem('sk.opts', JSON.stringify({ schedule: 'broadside' })); });
    const page = await ctx.newPage();
    const errors = watch(page, name);
    await page.goto(BASE + '?test=1');
    await page.click('#goCpu'); await page.click('#cpuStart');
    await page.waitForSelector('.coin');
    await sleep(150);
    const onScreen = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).every((r) => r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1), sel);
    const fit = await page.evaluate(() => ({ n: document.querySelectorAll('#hand .card').length, wide: document.querySelector('#app').scrollWidth - innerWidth }));
    check(fit.n === 10 && await onScreen('#hand .card'), `${name} ${w}x${h}: all 10 cards of the hand are on screen while bidding`);
    check(fit.wide <= 1, `${name}: the table is no wider than the screen (${fit.wide}px extra)`);
    check(await onScreen('#actions .coin, #actions [data-act="bid"]'), `${name}: the bid panel is on screen`);
    check(await onScreen('.plate'), `${name}: every rival plate is on screen`);
    await shot(page, 'layout-' + name.replace(/ /g, '-') + '-bid');
    await page.click('.coin[data-bid="2"]'); await page.click('[data-act="bid"]');
    await page.waitForFunction(() => /あなたのリード|あなたの番/.test(document.querySelector('#prompt').textContent), null, { timeout: 15000 });
    const id = await page.evaluate(() => { const cs = [...document.querySelectorAll('#hand .card:not(.no)')]; return cs[cs.length - 1].dataset.id; });
    await page.click(`#hand .card[data-id="${id}"]`, { timeout: 3000 });
    check(await onScreen('#hand .card') && await onScreen('#actions .btn') && await onScreen('#trick .card'), `${name}: hand, play button and trick are on screen when playing the rightmost card`);
    await shot(page, 'layout-' + name.replace(/ /g, '-') + '-play');
    check(errors.length === 0, `${name}: no script errors`);
    await ctx.close();
  }

  // 5) resume a saved game after a reload
  if (part('resume')) {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('sk.count', '3'); localStorage.setItem('sk.opts', JSON.stringify({})); });
    const page = await ctx.newPage();
    const errors = watch(page, 'resume');
    await page.goto(BASE + '?test=1');
    await page.click('#goCpu'); await page.click('#cpuStart');
    await page.waitForSelector('.coin');
    await page.click('.coin[data-bid="0"]'); await page.click('[data-act="bid"]');
    await sleep(800);
    const before = await page.evaluate(() => ({ seq: window.__sk.ctl().table.st.seq, round: window.__sk.ctl().table.st.round, gid: window.__sk.ctl().table.st.gid }));
    await page.reload();
    await page.waitForSelector('#goResume:not([hidden])', { timeout: 5000 });
    check(/続きから/.test(await page.textContent('#goResume')), 'resume: the title offers to continue');
    await page.click('#goResume');
    await sleep(500);
    const after = await page.evaluate(() => ({ seq: window.__sk.ctl().table.st.seq, round: window.__sk.ctl().table.st.round, gid: window.__sk.ctl().table.st.gid }));
    check(after.gid === before.gid && after.seq >= before.seq && after.round === before.round, 'resume: the same game continues where it stopped');
    check(errors.length === 0, 'resume: no script errors');
    await ctx.close();
  }

  // 6) online between two tabs: a host, a guest and a CPU
  if (part('online')) {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('sk.opts', JSON.stringify({ schedule: 'swift', abilities: true, loot: true })); });
    const host = await ctx.newPage(), guest = await ctx.newPage();
    const errH = watch(host, 'host'), errG = watch(guest, 'guest');
    await host.goto(BASE + '?test=1&net=local');
    await host.click('#goOnline'); await host.fill('#onName', 'ホスト'); await host.click('#onCreate');
    await host.waitForSelector('#scrLobby:not([hidden])');
    const code = (await host.textContent('#lobCode')).trim();
    check(/^[A-Z0-9]{4}$/.test(code), 'online: the host gets a room code (' + code + ')');
    await guest.goto(BASE + '?test=1&net=local&room=' + code);
    await guest.fill('#onName', 'ゲスト'); await guest.click('#onJoin');
    await guest.waitForSelector('#scrLobby:not([hidden])', { timeout: 6000 });
    await host.waitForFunction(() => document.querySelectorAll('#lobSeats .seatrow').length === 2);
    await host.click('#lobAddCpu');
    await guest.waitForFunction(() => document.querySelectorAll('#lobSeats .seatrow').length === 3);
    check(/略奪品/.test(await guest.textContent('#lobOpts')), 'online: the guest sees the host’s rule choices');
    await shot(guest, 'online-lobby');
    await host.click('#lobStart');
    await guest.waitForSelector('#hand .card', { timeout: 6000 });
    const [a, b] = await Promise.all([autoplay(host, { label: 'host', rnd: seeded(5), maxMs: 120000 }), autoplay(guest, { label: 'guest', rnd: seeded(6), maxMs: 120000 })]);
    const hs = await finalScores(host), gs = await finalScores(guest);
    check(hs.length === 3 && JSON.stringify(hs) === JSON.stringify(gs), 'online: host and guest see the same result (' + hs.join(', ') + ')');
    const st = await host.evaluate(() => window.__sk.ctl().table.st);
    check(!!st.ranking && JSON.stringify(st.ranking.map((r) => r.score)) === JSON.stringify(hs), 'online: the result matches the host’s engine');
    check(a.bids === 5 && b.bids === 5, 'online: both people bid every round');
    await shot(guest, 'online-result');
    check(errH.length === 0 && errG.length === 0, 'online: no script errors' + (errH.concat(errG).length ? '\n  ' + errH.concat(errG).slice(0, 5).join('\n  ') : ''));
    await ctx.close();
  }

  // 7) every pirate ability through the page; the deal is arranged through the test hook so the pirate wins trick 1
  for (const key of part('abilities') ? ['rosie', 'bendt', 'rascal', 'juanita', 'harry'] : []) {
    const ctx = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('sk.count', '3'); localStorage.setItem('sk.opts', JSON.stringify({ abilities: true, schedule: 'swift' })); });
    const page = await ctx.newPage();
    const errors = watch(page, key);
    await page.goto(BASE + '?test=1');
    await page.click('#goCpu'); await page.click('#cpuStart');
    await page.waitForSelector('.coin');
    await page.evaluate((key) => {
      const sk = window.__sk, st = sk.ctl().table.st, E = sk.E;
      const pid = E.PIRATE_IDS[E.PIRATES.findIndex((p) => p.key === key)];
      const C = (s, n) => ({ y: 0, p: 1, g: 2, k: 3 }[s]) * 14 + n - 1;
      st.hands = [[pid, C('g', 2), C('g', 3), C('g', 4), C('g', 5)], [6, 7, 8, 9, 10].map((n) => C('y', n)), [6, 7, 8, 9, 10].map((n) => C('p', n))];
      const used = new Set(st.hands.flat());
      st.deck = E.deckFor(st.opts).filter((id) => !used.has(id));
      sk.app.onView(sk.ctl().view());
    }, key);
    await sleep(200);
    await page.click('.coin[data-bid="1"]'); await page.click('[data-act="bid"]');
    // play the pirate when it is my turn
    for (let i = 0; i < 100; i++) {
      const can = await page.evaluate(() => /あなたのリード|あなたの番/.test(document.querySelector('#prompt').textContent));
      if (can) break;
      await sleep(50);
    }
    const pid = await page.evaluate((key) => window.__sk.E.PIRATE_IDS[window.__sk.E.PIRATES.findIndex((p) => p.key === key)], key);
    await page.click(`#hand .card[data-id="${pid}"]`);
    await page.click('#actions [data-act="play"]');
    await page.waitForSelector('#actions.act-panel', { timeout: 8000 });
    await shot(page, 'ability-' + key);
    let ok = false;
    if (key === 'rosie') {
      await page.click('#actions [data-act="rosie"][data-seat="2"]');
      await sleep(300);
      ok = await page.evaluate(() => { const st = window.__sk.ctl().table.st; return st.tricks.length === 1 && ((st.trick && st.trick.leader === 2) || (st.tricks[1] && st.tricks[1].plays[0].seat === 2)); });
    } else if (key === 'bendt') {
      const drawn = await page.$$eval('#hand .card.drawn', (cs) => cs.map((c) => c.dataset.id));
      check(drawn.length === 2, 'bendt: the two drawn cards are marked in the hand');
      for (const id of drawn) await page.click(`#hand .card[data-id="${id}"]`);
      await page.click('#actions [data-act="bendt"]');
      await sleep(300);
      ok = await page.evaluate(() => { const st = window.__sk.ctl().table.st; return st.out.length === 2 && st.outBy[0].length === 2; });
    } else if (key === 'rascal') {
      await page.click('#actions [data-act="rascal"][data-w="20"]');
      await sleep(300);
      ok = await page.evaluate(() => window.__sk.ctl().table.st.wager[0] === 20);
    } else if (key === 'juanita') {
      await page.click('#actions [data-act="juanitaView"]');
      await page.waitForSelector('.sheet .seen-row');
      await shot(page, 'ability-juanita-sheet');
      const rows = await page.$$eval('.sheet .seen-row', (r) => r.length);
      check(rows >= 2, 'juanita: the undealt cards are listed by suit (' + rows + ' rows)');
      await page.click('.sheet [data-close]');
      await sleep(300);
      ok = await page.evaluate(() => { const st = window.__sk.ctl().table.st; return st.phase !== 'ability' && st.seen[0] && st.seen[0].length > 0; });
      check(await page.$('#myPlate [data-act="seen"]') !== null, 'juanita: the list can be opened again from your plate');
    } else if (key === 'harry') {
      await page.click('#actions [data-act="harry"][data-d="1"]');
      await sleep(300);
      ok = await page.evaluate(() => window.__sk.ctl().table.st.bids[0] === 2);
    }
    check(ok, key + ': the ability works through the page');
    check(errors.length === 0, key + ': no script errors' + (errors.length ? '\n  ' + errors.join('\n  ') : ''));
    await ctx.close();
  }

  await browser.close();
} catch (e) {
  console.error(e);
  failures.push(String(e && e.message || e));
} finally {
  server.kill();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
