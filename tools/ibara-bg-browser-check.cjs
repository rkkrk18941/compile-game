/* スレイザスパイア: end-to-end check in Chromium (Playwright).
     node tools/ibara-bg-browser-check.cjs [--shots DIR]
   1. Solo: a full Act I played by tapping (random choices, extra HP so the check covers rooms rather than balance),
      then a reload and 「続きから」.
   2. Online: a host and two guests in three tabs over BroadcastChannel (?net=local) play together;
      the guests' views must follow the host's state. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* next */ } }
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }
const root = path.join(__dirname, '..');
const PORT = 8795, BASE = 'http://localhost:' + PORT + '/ibara/';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(ctx, tag, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errs.push(tag + ' console: ' + m.text()); });
  return p;
}
/* One tap by a random but legal player: answer the open prompt, pick a target, move on the map, play a card or end the turn. */
function botStep() {
  const A = window.STS_APP, q = (s) => Array.from(document.querySelectorAll(s)), vis = (el) => el && el.offsetParent !== null;
  const run = A.sess && A.sess.run();
  if (!run) return 'norun';
  if (run.phase === 'over') return 'over';
  const where = run.combat ? 'combat' : run.room ? 'room-' + run.room.t : run.phase;
  const msel = q('[data-a="msel"]');
  if (msel.length) { const ok = document.querySelector('[data-a="mselok"]'); if (ok && !ok.disabled) { ok.click(); return where + ':pick'; } const c = msel.find((x) => !x.classList.contains('chosen')); if (c) { c.click(); return where + ':pick'; } }
  const pick = q('[data-a="rewardpick"]');
  if (pick.length) { const ok = document.querySelector('[data-a="rewardconfirm"]'); if (ok && !ok.disabled) { ok.click(); return where + ':reward'; } pick[Math.floor(Math.random() * pick.length)].click(); return where + ':reward'; }
  const t = q('.foe.target, .band.rowtarget, .hero.target');
  if (t.length) { t[0].click(); return where + ':target'; }
  const ans = q('[data-a="ans"]').filter(vis);
  if (ans.length) {
    const next = ans.find((b) => /第\d幕へ進む/.test(b.textContent));
    (next || ans[Math.floor(Math.random() * Math.min(ans.length, 3))]).click();
    return where + ':answer';
  }
  const node = q('[data-a="node"]');
  if (node.length) { node[Math.floor(Math.random() * node.length)].dispatchEvent(new MouseEvent('click', { bubbles: true })); return where + ':move'; }
  const cards = q('.hand .card').filter((c) => !c.classList.contains('no'));
  if (cards.length && Math.random() < 0.88) { const c = cards[Math.floor(Math.random() * cards.length)]; c.click(); c.click(); return where + ':card'; }
  const end = document.querySelector('[data-a="end"]');
  if (end && !end.disabled) { end.click(); return where + ':end'; }
  return where + ':wait';
}

(async () => {
  await sleep(600);
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const errs = [];
  try {
    /* ---------------- solo ---------------- */
    const p = await newPage(ctx, 'solo', errs);
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ibara.bg.prefs.v1', JSON.stringify({ anim: 0 })); });
    await p.reload({ waitUntil: 'load' });
    await p.click('text=ひとりで遊ぶ');
    await p.click('.charbtn:has-text("サイレント")');
    await p.click('text=冒険を始める');
    await p.evaluate(() => { const r = window.STS_APP.sess.run(); r.players[0].hp = r.players[0].maxHp = 400; });
    const seen = {};
    const trail = [];
    for (let i = 0; i < 1000; i++) {
      await sleep(25);
      const a = await p.evaluate(botStep);
      trail.push(a); if (trail.length > 24) trail.shift();
      seen[a.split(':')[0]] = true;
      if (a === 'over') break;
      const st = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, bosses: r.bosses }; });
      if (st.act >= 2) break;
      if (i === 60 && SHOTS) await p.screenshot({ path: path.join(SHOTS, 'solo-combat.png') });
    }
    const solo = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, bosses: r.bosses, phase: r.phase, result: r.result, deck: r.players[0].deck.length }; });
    check(solo.bosses >= 1, 'solo: Act I boss defeated by tapping (act ' + solo.act + ', bosses ' + solo.bosses + ', ' + solo.phase + (solo.result ? ' ' + solo.result : '') + ')');
    if (solo.bosses < 1 || solo.phase === 'over') console.log('     last taps: ' + trail.join(' ') + '\n     state: ' + JSON.stringify(await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { phase: r.phase, floor: r.map && r.map.pos, room: r.room && r.room.t, hp: r.players[0].hp, round: r.combat && r.combat.round }; })));
    check(seen.combat && seen.map, 'solo: map and combat screens used');
    await p.reload({ waitUntil: 'load' });
    const resume = await p.$('text=続きから');
    check(!!resume, 'solo: 「続きから」 offered after a reload');
    if (resume) {
      await resume.click(); await sleep(400);
      const back = await p.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, bosses: r.bosses, deck: r.players[0].deck.length }; });
      check(back.bosses === solo.bosses && back.deck >= solo.deck - 2, 'solo: resumed the saved adventure');
    }
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'solo-resumed.png') });
    await p.close();

    /* ---------------- online, three tabs ---------------- */
    const H = await newPage(ctx, 'host', errs), G1 = await newPage(ctx, 'guest1', errs), G2 = await newPage(ctx, 'guest2', errs);
    for (const P of [H, G1, G2]) await P.goto(BASE + '?net=local', { waitUntil: 'load' });
    await H.click('text=オンライン協力'); await H.fill('#nm', 'ホスト'); await H.click('text=部屋を作る'); await sleep(400);
    const code = await H.evaluate(() => window.STS_APP.coop.code);
    check(/^[A-Z0-9]{4}$/.test(code || ''), 'online: room code ' + code);
    for (const [P, nm, ch] of [[G1, 'ゲスト1', 'ディフェクト'], [G2, 'ゲスト2', 'ウォッチャー']]) {
      await P.click('text=オンライン協力'); await P.fill('#nm', nm); await P.click('.charbtn:has-text("' + ch + '")'); await sleep(120);
      await P.fill('#code', code); await sleep(60); await P.click('button:has-text("参加")'); await sleep(500);
    }
    const roster = await H.evaluate(() => window.STS_APP.host.roster.view().map((r) => r.name + ':' + r.ch));
    check(roster.length === 3 && roster.includes('ゲスト1:B') && roster.includes('ゲスト2:W'), 'online: roster ' + roster.join(', '));
    await H.click('text=冒険を始める'); await sleep(500);
    await H.evaluate(() => { const r = window.STS_APP.sess.run(); r.players.forEach((x) => { x.hp = x.maxHp = 400; }); });
    for (let i = 0; i < 260; i++) {
      for (const P of [H, G1, G2]) await P.evaluate(botStep);
      await sleep(40);
    }
    await sleep(400);
    const hs = await H.evaluate(() => { const r = window.STS_APP.sess.run(); return { act: r.act, phase: r.phase, pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(',') }; });
    const gs = await G1.evaluate(() => { const r = window.STS_APP.sess && window.STS_APP.sess.run(); return r ? { act: r.act, phase: r.phase, pos: r.map && r.map.pos, gold: r.players.map((x) => x.gold).join(','), deck: r.players.map((x) => x.deck.length).join(','), me: window.STS_APP.me } : null; });
    check(!!hs.pos, 'online: the party moved on the map (' + hs.pos + ')');
    check(gs && gs.me === 1 && gs.pos === hs.pos && gs.gold === hs.gold && gs.deck === hs.deck, 'online: guest view matches the host');
    if (SHOTS) { await H.screenshot({ path: path.join(SHOTS, 'online-host.png') }); await G1.screenshot({ path: path.join(SHOTS, 'online-guest.png') }); }
  } catch (e) {
    check(false, 'exception: ' + (e && e.stack || e));
  }
  check(!errs.length, 'no page errors' + (errs.length ? ':\n  ' + errs.slice(0, 8).join('\n  ') : ''));
  await browser.close();
  server.kill();
  if (failures.length) { console.log(failures.length + ' failure(s)'); process.exit(1); }
  console.log('スレイザスパイア browser check passed.');
})();
