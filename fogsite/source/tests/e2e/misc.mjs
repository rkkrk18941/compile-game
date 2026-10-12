import { chromium } from 'playwright';
import { setupContext, watch, launchArgs, OUT, sleep } from './helpers.mjs';
const browser = await chromium.launch({ args: launchArgs });
const ctx = await setupContext(browser);
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = watch(page);
const skip = async () => { for (let i = 0; i < 8; i++) { const c = await page.$('.cine'); if (!c) return; if ((await c.getAttribute('class')).includes('kind-banner')) { await sleep(500); continue; } await c.click({ force: true }).catch(() => {}); await sleep(200); } };
await page.goto('http://localhost:8790/', { waitUntil: 'domcontentloaded' });
await sleep(900);
// rules + settings overlays
await page.locator('.btn', { hasText: '遊び方' }).click(); await sleep(500);
await page.screenshot({ path: `${OUT}/m-rules.png` });
await page.locator('.overlay .iconbtn').click(); await sleep(300);
await page.locator('.btn', { hasText: '設定' }).click(); await sleep(400);
await page.screenshot({ path: `${OUT}/m-settings.png` });
await page.locator('.overlay .iconbtn').click(); await sleep(300);
// CPU game with geographer + guide
await page.getByText('ひとりでCPUと遊ぶ').click(); await sleep(200);
await page.getByText('はじめる').click(); await sleep(600);
const cards = await page.$$('.charpick');
await cards[0].$$eval('.charcard', els => els[1].click()); await sleep(300);   // geographer
await cards[1].$$eval('.charcard', els => els[0].click()); await sleep(300);   // guide
await page.waitForSelector('.app-room.stage-explorerTurns', { timeout: 20000 });
await sleep(800); await skip();
await page.locator('.stagepanel .btn', { hasText: '青の探検家で行動する' }).click(); await sleep(1200); await skip();
await page.locator('.ability-btn').click(); await sleep(500);
await page.screenshot({ path: `${OUT}/m-ability-sheet.png` });
const dirs = await page.$$('.sheet .dirbtn:not([disabled])');
await dirs[0].click(); await sleep(150); await dirs[1].click(); await sleep(150);
await page.screenshot({ path: `${OUT}/m-ability-geo-selected.png` });
await page.locator('.sheet .btn.primary').click(); await sleep(700);
await page.screenshot({ path: `${OUT}/m-ability-cine.png` });
await skip(); await sleep(400);
await page.screenshot({ path: `${OUT}/m-after-geo.png` });
// end turn -> yellow (guide) uses guide on blue
await page.locator('.tray .btn', { hasText: '手番を終える' }).click(); await sleep(1500); await skip();
await page.locator('.ability-btn').click(); await sleep(400);
await page.screenshot({ path: `${OUT}/m-guide-sheet.png` });
await page.locator('.sheet .btn', { hasText: '青の探検家' }).click(); await sleep(2500);
await page.screenshot({ path: `${OUT}/m-guide-cine.png` });
await skip();
// reload mid-game and restore
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1000);
await page.screenshot({ path: `${OUT}/m-title-resume.png` });
await page.locator('.resume .btn', { hasText: '復元' }).click(); await sleep(1500); await skip();
await page.screenshot({ path: `${OUT}/m-restored.png` });
console.log('restored stage:', await page.$eval('.app-room', e => e.className).catch(() => 'none'));
// desktop layout
await page.setViewportSize({ width: 1280, height: 820 }); await sleep(800);
await page.screenshot({ path: `${OUT}/m-desktop.png` });
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
