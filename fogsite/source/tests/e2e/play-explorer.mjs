import { chromium } from 'playwright';
import { setupContext, watch, launchArgs, OUT, sleep } from './helpers.mjs';
const browser = await chromium.launch({ args: launchArgs });
const ctx = await setupContext(browser);
const page = await ctx.newPage();
const errors = watch(page);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const skipCine = async () => { for (let i = 0; i < 6; i++) { const c = await page.$('.cine'); if (!c) return; if ((await c.getAttribute('class')).includes('kind-banner')) { await sleep(500); continue; } await c.click({ force: true }).catch(() => {}); await sleep(250); } };
await page.goto('http://localhost:8790/', { waitUntil: 'networkidle' }).catch(() => {});
await sleep(1200);
await shot('10-title-fonts');
await page.fill('input.input', 'ミナト');
await page.getByText('ひとりでCPUと遊ぶ').click();
await sleep(300);
await page.getByText('はじめる').click();
await sleep(700);
// pick characters for both explorers
const cards = await page.$$('.charpick');
await cards[0].$$eval('.charcard', els => els[0].click());   // guide for blue
await sleep(400);
await cards[1].$$eval('.charcard', els => els[2].click());   // archaeologist for yellow
await sleep(500);
await shot('11-chars');
// wait for game start
for (let i = 0; i < 40; i++) { if (await page.$('.app-room.stage-explorerTurns')) break; await sleep(300); }
await sleep(600);
await shot('12-start-cine');
await skipCine();
await sleep(400);
await shot('13-turnpick');
await page.getByText('青の探検家で行動する').click();
await sleep(1600);
await skipCine();
await shot('14-myturn');
// explore via dpad until blocked or 4 tries
for (let i = 0; i < 4; i++) {
  const btn = await page.$('.dpad-btn.m-explore:not([disabled])');
  if (!btn) break;
  await btn.click();
  await sleep(900);
  await skipCine();
}
await shot('15-after-explore');
await page.locator('.tabbar .tab').nth(2).click(); await sleep(300); await shot('16-intel');
await page.locator('.tabbar .tab').nth(1).click(); await sleep(300); await shot('17-teamboard');
await page.locator('.tabbar .tab').nth(3).click(); await sleep(300);
await page.locator('.stamp-btn').first().click(); await sleep(500); await shot('18-chat');
await page.locator('.tabbar .tab').first().click(); await sleep(400);
await shot('19-map-again');
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
