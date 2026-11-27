/* 必殺技カットイン (2026-11-27) for スレイザスパイア: check in Chromium (Playwright).
     node tools/ibara-cutin-browser-check.cjs [--shots DIR]
   On a phone held upright and sideways and on a desktop screen, for the eight heroes:
   - a rare card played in a real battle shows the band, the hero's portrait (loaded) and the card's name inside
     the screen; a tap on it ends it at once and the battle goes on;
   - the finishing blow follows; the second cut-in of the round is the quick one;
   - prefers-reduced-motion shows the still band;
   - a teammate's rare card shows the small band over their hero, which lets taps through;
   - no page errors. With --shots, a picture of each cut-in at its middle is saved. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* next */ } }
if (!playwright) { console.error('Playwright was not found. Install it with: npm i -g playwright'); process.exit(2); }
const root = path.join(__dirname, '..');
const PORT = 8796, BASE = 'http://localhost:' + PORT + '/ibara/';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'ignore' });
const failures = [];
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures.push(msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEROES = [['R', 'Bludgeon'], ['G', 'DieDieDie'], ['B', 'MeteorStrike'], ['W', 'Brilliance'], ['S', 'ViciousTackle'], ['U', 'GigaBeam'], ['H', 'DoomsdayH'], ['M', 'MagnumM']];

/* A battle in the page's own session (so the page's director replays it), with the given hands. */
function setup(page, chs, hands) {
  return page.evaluate(async ({ chs, hands }) => {
    const S = window.STS, A = S.UI.state;
    document.getElementById('floatLayer').innerHTML = ''; S.UI.director.ci = null;
    const run = S.Game.newRun({ players: chs.map((ch) => ({ ch })), seed: 7 }), g = new S.Game(run, {});
    g.setupDecks(); g.setupAct(1); run.phase = 'room'; run.room = { t: 'M', step: 'fight' };
    const cb = S.Combat.create(g, { kind: 'normal' }); run.combat = cb.s; cb.s.phase = 'play'; cb.s.round = 1; cb.s.die = 3;
    const e = cb.spawn('JawWorm', 0); e.hp = e.max = 60; cb.spawn('Cultist', 0);
    hands.forEach((ids, i) => { const pc = cb.pc(i); pc.en = 9; pc.t = {}; pc.hand = ids.map((id) => ({ id, u: g.uid() })); });
    S.UI.startRun(run); A.view = null; A.field = null;
    await new Promise((r) => setTimeout(r, 0)); S.UI.draw(); await new Promise(requestAnimationFrame); S.UI.draw();
    await new Promise((r) => setTimeout(r, 250));
    window.__foe = e.u;
  }, { chs, hands });
}
function play(page, pi, k) {
  return page.evaluate(async ({ pi, k }) => {
    const S = window.STS, sess = S.UI.state.sess, pc = sess.g.combat.pc(pi), c = pc.hand[k], d = S.CARDS[c.id];
    sess.command(pi, d.tg === 'R' ? { type: 'play', u: c.u, row: 0 } : d.tg === 'E' ? { type: 'play', u: c.u, target: window.__foe } : { type: 'play', u: c.u }).catch((e) => { window.__err = String(e); });
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 10)); for (const q of sess.pending()) sess.answer(q.id, S.autoAnswer(sess.g, q.pi, q.q)); }
    return c.id;
  }, { pi, k });
}
const idle = (page) => page.waitForFunction(() => !window.STS.UI.director.busy && !window.STS.UI.director.q.length, null, { timeout: 8000 }).then(() => true, () => false);
/* Freeze the cut-in at its middle (for the measurements and the pictures). */
function freeze(page) {
  return page.evaluate(() => {
    clearTimeout(window.STS.UI.director.momentT);
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.closest && (t.closest('.nl-cutin') || t.closest('.ci-mini'))) { a.pause(); a.currentTime = 560; } }
  });
}

(async () => {
  await sleep(600);
  const browser = await playwright.chromium.launch();
  const errs = [];
  for (const [w, h] of [[390, 844], [844, 390], [1366, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(w + 'x' + h + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errs.push(w + 'x' + h + ' console: ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(BASE, { waitUntil: 'load' });
    const size = w + 'x' + h;
    for (const [ch, id] of (w === 390 ? HEROES : HEROES.slice(0, 2))) {
      await setup(page, [ch], [[id, id, 'StrikeR']]);
      await play(page, 0, 0);
      const seen = await page.waitForSelector('.nl-cutin', { timeout: 3000 }).then(() => true, () => false);
      check(seen, size + ' ' + ch + ': cut-in for 「' + id + '」');
      if (!seen) continue;
      await freeze(page);
      const m = await page.evaluate(() => {
        const q = (s) => document.querySelector('.nl-cutin ' + s), r = (el) => el.getBoundingClientRect();
        const band = r(q('.ci-band')), name = r(q('.ci-text b')), img = q('.ci-hero:not(.ci-echo) img');
        return { band, name, img: img && img.complete && img.naturalWidth > 0, text: q('.ci-text b').textContent, vw: innerWidth, vh: innerHeight };
      });
      check(m.band.top > 0 && m.band.bottom < m.vh && m.band.width >= m.vw, size + ' ' + ch + ': the band crosses the screen');
      check(m.name.left >= 0 && m.name.right <= m.vw + 1 && m.name.top >= 0 && m.name.bottom <= m.vh, size + ' ' + ch + ': 「' + m.text + '」 is inside the screen');
      check(m.img, size + ' ' + ch + ': the portrait is loaded');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cutin-' + size + '-' + ch + '.png') });
      // a tap ends it at once and the battle goes on
      await page.evaluate(() => { const el = document.querySelector('.nl-cutin'); el.getAnimations({ subtree: true }).forEach((a) => a.play()); });
      const t0 = Date.now();
      await page.mouse.click(Math.round(w / 2), Math.round(h * 0.2));
      const gone = await page.waitForSelector('.nl-cutin', { state: 'detached', timeout: 400 }).then(() => true, () => false);
      check(gone && Date.now() - t0 < 600, size + ' ' + ch + ': a tap ends it');
      check(await idle(page), size + ' ' + ch + ': the battle goes on');
      if (ch === 'R') {
        await play(page, 0, 0);
        const quick = await page.waitForSelector('.nl-cutin.quick', { timeout: 3000 }).then(() => true, () => false);
        check(quick, size + ': the second cut-in of the round is the quick one');
        check(await idle(page), size + ': and it ends by itself');
      }
    }
    if (w === 390) {
      // reduced motion: the still band
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(BASE, { waitUntil: 'load' });
      await setup(page, ['W'], [['Brilliance']]);
      await play(page, 0, 0);
      check(await page.waitForSelector('.nl-cutin.still', { timeout: 3000 }).then(() => true, () => false), size + ': reduced motion keeps a still band');
      check(await idle(page), size + ': and it ends by itself');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // a teammate's rare card: the small band, which lets taps through
      await page.goto(BASE, { waitUntil: 'load' });
      await setup(page, ['R', 'W'], [['StrikeR'], ['Ragnarok']]);
      await play(page, 1, 0);
      const mini = await page.waitForSelector('.ci-mini', { timeout: 3000 }).then(() => true, () => false);
      check(mini, size + ': a teammate\'s rare card shows the small band');
      if (mini) {
        await freeze(page);
        const r = await page.evaluate(() => {
          const el = document.querySelector('.ci-mini'), b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { overlay: !!document.querySelector('.nl-cutin'), through: !el.contains(hit), inside: b.left >= 0 && b.right <= innerWidth };
        });
        check(!r.overlay && r.through && r.inside, size + ': no overlay, taps go through the band, inside the screen');
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cutin-teammate-' + size + '.png') });
      }
      check(await idle(page), size + ': the replay goes on');
    }
    await ctx.close();
  }
  check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  server.kill();
  if (failures.length) { console.log('\n' + failures.length + ' check(s) failed.'); process.exit(1); }
  console.log('スレイザスパイア cut-in browser check passed.');
})().catch((e) => { console.error(e); server.kill(); process.exit(1); });
