// Plays a complete game as the explorer team against the CPU ruins, screenshotting key moments.
import { chromium } from 'playwright';
import { setupContext, watch, launchArgs, OUT, sleep } from './helpers.mjs';
const level = process.argv[2] || 'easy';
const count = Number(process.argv[3] || 2);
const browser = await chromium.launch({ args: launchArgs });
const ctx = await setupContext(browser);
const page = await ctx.newPage();
const errors = watch(page);
const seen = new Set();
const shotOnce = async (key) => { if (seen.has(key)) return; seen.add(key); await page.screenshot({ path: `${OUT}/fg-${key}.png` }); };
await page.goto('http://localhost:8790/', { waitUntil: 'networkidle' }).catch(() => {});
await sleep(800);
await page.fill('input.input', 'ミナト');
await page.getByText('ひとりでCPUと遊ぶ').click(); await sleep(200);
if (count === 3) await page.locator('.seg button', { hasText: '3人' }).click();
await page.locator('.seg button', { hasText: level === 'easy' ? 'やさしい' : level === 'hard' ? 'むずかしい' : 'ふつう' }).click();
await page.getByText('はじめる').click(); await sleep(600);
const picks = await page.$$('.charpick');
for (let i = 0; i < picks.length; i++) { await picks[i].$$eval('.charcard', (els, i) => els[[0, 2, 1][i]].click(), i); await sleep(300); }
let iter = 0, explores = 0;
while (iter++ < 900) {
  const cine = await page.$('.cine');
  if (cine) {
    const cls = await cine.getAttribute('class');
    const kind = (cls.match(/kind-(\w+)/) || [])[1], tone = (cls.match(/tone-(\w+)/) || [])[1];
    const title = (await page.$eval('.cine-title', e => e.textContent).catch(() => '')) || '';
    await sleep(450);
    await shotOnce(`cine-${kind}-${title.replace(/\s/g, '').slice(0, 8)}`);
    if (!cls.includes('kind-banner')) await cine.click({ force: true }).catch(() => {}); else await sleep(400);
    await sleep(200);
    continue;
  }
  const room = await page.$('.app-room');
  if (!room) { await sleep(200); continue; }
  const stage = ((await room.getAttribute('class')).match(/stage-(\w+)/) || [])[1];
  if (stage === 'gameover') { await sleep(1500); await shotOnce('result'); await page.screenshot({ path: `${OUT}/fg-result-full.png`, fullPage: true }); break; }
  if (stage === 'explorerTurns') {
    const claim = page.locator('.stagepanel .btn.primary', { hasText: 'で行動する' });
    if (await claim.count()) { await shotOnce('turnpick'); await claim.first().click(); explores = 0; await sleep(500); continue; }
    if (await page.$('.tray')) {
      await shotOnce('tray');
      const btns = await page.$$('.dpad-btn.m-explore:not([disabled])');
      if (btns.length && explores < 3) { await btns[Math.floor(Math.random() * btns.length)].click(); explores++; await sleep(700); continue; }
      const next = page.locator('.nextpick .btn', { hasText: '決めずに終える' });
      if (await next.count()) { await next.click(); await sleep(500); continue; }
      await page.locator('.tray .btn', { hasText: '手番を終える' }).click(); await sleep(500); continue;
    }
    await sleep(300); continue;
  }
  if (stage === 'escape') { await shotOnce('escape'); const b = page.locator('.escape .btn', { hasText: 'まだ脱出しない' }); if (await b.count() && !(await b.getAttribute('class')).includes('primary')) await b.click(); await sleep(400); continue; }
  if (stage === 'finalEscape') { await shotOnce('final'); const b = page.locator('.escape .btn', { hasText: '最後の脱出に挑む' }); if (await b.count()) await b.click(); await sleep(600); continue; }
  if (stage === 'prediction') {
    await shotOnce('prediction');
    const ch = await page.$$('.pchoice:not([disabled])');
    if (ch.length) { await ch[Math.floor(Math.random() * ch.length)].click(); await sleep(600); continue; }
    await sleep(300); continue;
  }
  if (stage === 'ruinsTurn') { await shotOnce('ruinsturn'); await sleep(400); continue; }
  await sleep(300);
}
const summary = await page.evaluate(() => ({ title: document.querySelector('.result-title')?.textContent, text: document.querySelector('.result-text')?.textContent }));
console.log('iterations', iter, JSON.stringify(summary));
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
