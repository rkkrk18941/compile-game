// Plays a complete game as the ruins player against CPU explorers.
import { chromium } from 'playwright';
import { setupContext, watch, launchArgs, OUT, sleep } from './helpers.mjs';
const level = process.argv[2] || 'normal';
const browser = await chromium.launch({ args: launchArgs });
const ctx = await setupContext(browser);
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = watch(page);
const seen = new Set();
const shotOnce = async (key) => { if (seen.has(key)) return; seen.add(key); await page.screenshot({ path: `${OUT}/fr-${key}.png` }); };
await page.goto('http://localhost:8790/', { waitUntil: 'networkidle' }).catch(() => {});
await sleep(800);
await page.fill('input.input', 'イセキ');
await page.getByText('ひとりでCPUと遊ぶ').click(); await sleep(200);
await page.locator('.seg button', { hasText: '遺跡役' }).click();
await page.locator('.seg button', { hasText: level === 'easy' ? 'やさしい' : level === 'hard' ? 'むずかしい' : 'ふつう' }).click();
await page.getByText('はじめる').click(); await sleep(1500);
await shotOnce('setup');
await page.screenshot({ path: `${OUT}/fr-setup-full.png`, fullPage: true });
// try a tool interaction: rotate shrine arrows then randomize normal
await page.locator('.btn', { hasText: '矢印を回す' }).click(); await sleep(300);
await page.locator('.btn', { hasText: 'ふつう' }).first().click(); await sleep(500);
for (let i = 0; i < 30; i++) { const b = page.locator('.dock .btn', { hasText: '探索を開始する' }); if (await b.count() && await b.isEnabled()) { await b.click(); break; } await sleep(300); }
let iter = 0;
while (iter++ < 1500) {
  const cine = await page.$('.cine');
  if (cine) {
    const cls = await cine.getAttribute('class');
    const kind = (cls.match(/kind-(\w+)/) || [])[1];
    const title = (await page.$eval('.cine-title', e => e.textContent).catch(() => '')) || '';
    await sleep(400);
    await shotOnce(`cine-${kind}-${title.replace(/\s/g, '').slice(0, 8)}`);
    if (!cls.includes('kind-banner')) await cine.click({ force: true }).catch(() => {}); else await sleep(400);
    await sleep(150);
    continue;
  }
  const room = await page.$('.app-room');
  if (!room) { await sleep(200); continue; }
  const stage = ((await room.getAttribute('class')).match(/stage-(\w+)/) || [])[1];
  if (iter % 10 === 0) console.log(iter, stage, await page.evaluate(() => { const s = window.__mm.state().snap; return JSON.stringify({ rib: document.querySelector('.ribbon')?.textContent, pa: s.pendingAttack, pe: s.pendingEndRuins, rw: s.ruins?.revealWait, rpa: s.ruins?.pendingAttack, tok: s.time.moveRemaining, att: s.ruins?.attackable, last: s.ruins?.lastMovedPieceId }); }));
  if (stage === 'gameover') { await sleep(1500); await shotOnce('result'); break; }
  // prompts
  const enc = page.locator('.prompt.ward .btn', { hasText: Math.random() < 0.7 ? '遭遇を宣言' : '黙っておく' });
  if (await enc.count()) { await shotOnce('prompt-encounter'); await enc.first().click({ timeout: 3000 }).catch(() => {}); await sleep(300); continue; }
  const gdir = page.locator('.prompt.brass .dirbtn:not([disabled])');
  if (await gdir.count()) { await shotOnce('prompt-guide'); await gdir.first().click({ timeout: 3000 }).catch(() => {}); await sleep(300); continue; }
  const merc = page.locator('.prompt.brass .btn.primary');
  if (await merc.count()) { await shotOnce('prompt-merc'); await merc.first().click({ timeout: 3000 }).catch(() => {}); await sleep(300); continue; }
  if (stage === 'explorerTurns') { await shotOnce('watch'); await sleep(400); continue; }
  if (stage === 'ruinsTurn') {
    await shotOnce('ruinsturn');
    const atk = page.locator('.attackbar .btn.danger');
    if (await atk.count()) { await shotOnce('attack-chance'); await atk.first().click(); await sleep(500); continue; }
    const legal = await page.$$('.st-cell.hl-legal, .st-cell.hl-legal2');
    if (legal.length) { await shotOnce('guard-selected'); try { await legal[Math.floor(Math.random() * legal.length)].click(); } catch (e) { console.log('legal click failed', e.message.split('\n')[0]); await page.screenshot({ path: `${OUT}/fr-legalfail.png` }); } await sleep(450); continue; }
    const g = await page.$$('.gpick:not([disabled])');
    if (g.length) { try { await g[0].click(); } catch (e) { console.log('gpick click failed', e.message.split('\n')[0]); } await sleep(300); continue; }

    const end = page.locator('.ruinsctl .btn', { hasText: '遺跡役の手番を終える' });
    if (await end.count() && await end.isEnabled()) { await end.click(); await sleep(500); continue; }
    await sleep(300); continue;
  }
  await shotOnce(`stage-${stage}`);
  await sleep(400);
}
const summary = await page.evaluate(() => ({ title: document.querySelector('.result-title')?.textContent, text: document.querySelector('.result-text')?.textContent }));
console.log('iterations', iter, JSON.stringify(summary));
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
