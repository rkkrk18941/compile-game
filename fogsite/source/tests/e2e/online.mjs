// Three real browser contexts talking over WebRTC through a local PeerJS server.
import { chromium } from 'playwright';
import { setupContext, watch, launchArgs, OUT, sleep } from './helpers.mjs';
const Q = process.env.NET === 'local' ? '?net=local' : '?peerhost=127.0.0.1&peerport=9000&peerpath=/myapp';
const browser = await chromium.launch({ args: [...launchArgs, '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const mk = async (name) => {
  const ctx = process.env.NET === 'local' ? shared : await setupContext(browser);
  const page = await ctx.newPage();
  page.__cid = process.env.NET === 'local' ? `&cid=test-${name}-0000` : '';
  page.setDefaultTimeout(8000);
  const errs = watch(page, `[${name}]`);
  return { ctx, page, errs, name };
};
let shared = null;
if (process.env.NET === 'local') shared = await setupContext(browser);
const H = await mk('host'), A = await mk('aki'), B = await mk('yuu');
const shot = (p, n) => p.page.screenshot({ path: `${OUT}/on-${n}.png` });
const skip = async (p) => { for (let i = 0; i < 8; i++) { const c = await p.page.$('.cine'); if (!c) return; if ((await c.getAttribute('class')).includes('kind-banner')) { await sleep(500); continue; } await c.click({ force: true }).catch(() => {}); await sleep(200); } };
const log = (...a) => console.log(new Date().toISOString().slice(14, 23), ...a);

await H.page.goto('http://localhost:8790/' + Q + H.page.__cid, { waitUntil: 'domcontentloaded' });
await sleep(800);
await H.page.fill('input.input', 'ホスト');
await H.page.getByText('オンラインで遊ぶ').click();
await H.page.locator('.menu-body .btn.primary', { hasText: '部屋を作る' }).click();
await H.page.waitForSelector('.roomcode', { timeout: 30000 });
const code = (await H.page.textContent('.roomcode')).trim();
log('room', code);
await shot(H, '01-host-lobby');

for (const [P, nm] of [[A, 'アキ'], [B, 'ユウ']]) {
  await P.page.goto(`http://localhost:8790/${Q}&room=${code}${P.page.__cid}`, { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await P.page.fill('input.input', nm);
  await P.page.locator('.menu-body .btn', { hasText: '参加する' }).click();
  await P.page.waitForSelector('.lobby', { timeout: 40000 });
  log(nm, 'joined');
}
await sleep(1200);
await shot(H, '02-host-lobby-full');
await shot(A, '03-guest-lobby');
await H.page.locator('.dock .btn', { hasText: '迷宮の準備をはじめる' }).click();
await A.page.waitForSelector('.charpick'); await B.page.waitForSelector('.charpick');
await A.page.$$eval('.charpick .charcard', els => els[0].click());
await sleep(500);
await B.page.$$eval('.charpick .charcard', els => els[2].click());
await sleep(800);
await shot(B, '04-guest-chars');
await shot(H, '05-host-setup');
for (let i = 0; i < 30; i++) { const b = H.page.locator('.dock .btn', { hasText: '探索を開始する' }); if (await b.count() && await b.isEnabled()) { await b.click(); break; } await sleep(300); }
await A.page.waitForSelector('.app-room.stage-explorerTurns', { timeout: 15000 });
await sleep(1500); await skip(A); await skip(B); await skip(H);
await shot(A, '06-guest-turnpick');
// A takes the first turn
await A.page.locator('.stagepanel .btn', { hasText: '青の探検家で行動する' }).click();
await sleep(1500); await skip(A); await skip(B);
await shot(B, '07-B-watching-A');
for (let i = 0; i < 3; i++) { const b = await A.page.$('.dpad-btn.m-explore:not([disabled])'); if (!b) break; await b.click(); await sleep(900); await skip(A); }
await shot(A, '08-A-explored');
await shot(H, '09-host-sees-A');
// chat stamp from A appears for B
await A.page.locator('.tabbar .tab').nth(3).click(); await sleep(300);
await A.page.locator('.stamp-btn').first().click(); await sleep(1200);
await B.page.locator('.tabbar .tab').nth(3).click(); await sleep(500);
const bchat = await B.page.textContent('.msgs');
log('B chat sees:', bchat.slice(0, 60));
await shot(B, '10-B-chat');
await A.page.locator('.tabbar .tab').nth(0).click(); await sleep(300); await skip(A);
// A ends turn (hands over to B automatically: only one left)
const end = A.page.locator('.tray .btn', { hasText: '手番を終える' });
if (await end.count()) await end.click();
await sleep(1500); await skip(B); await skip(A);
for (let i = 0; i < 2; i++) { const b = await B.page.$('.dpad-btn.m-explore:not([disabled])'); if (!b) break; await b.click(); await sleep(900); await skip(B); }
// team board by B
await B.page.locator('.tabbar .tab').nth(1).click({ noWaitAfter: true }); await sleep(400);
const place = B.page.locator('.btn', { hasText: 'まだ置いていない地図を並べる' });
if (await place.count()) await place.click();
await sleep(1500);
await A.page.locator('.tabbar .tab').nth(1).click(); await sleep(800);
const layersOnA = await A.page.$$eval('.tracing .tb-layer', els => els.length);
log('layers visible to A:', layersOnA);
await shot(A, '11-A-teamboard');
console.log('B map click...');
await B.page.locator('.tabbar .tab').nth(0).click({ noWaitAfter: true }).catch(e => console.log('B click err', e.message.split('\n')[0]));
console.log('B alive?', await Promise.race([B.page.evaluate(() => 'yes'), sleep(4000).then(() => 'HUNG')]));
await sleep(300); await skip(B);
const endB = B.page.locator('.tray .btn', { hasText: '手番を終える' });
if (await endB.count()) await endB.click();
await sleep(1500); await skip(A); await skip(B);
await A.page.locator('.tabbar .tab').nth(0).click(); await sleep(300);
await shot(A, '12-A-escape');
for (const P of [A, B]) { const w = P.page.locator('.escape .btn', { hasText: 'まだ脱出しない' }); if (await w.count()) await w.click(); await sleep(700); }
await sleep(1200); await skip(A); await skip(B);
for (const P of [A, B]) { const c = await P.page.$$('.pchoice:not([disabled])'); if (c.length) await c[0].click(); await sleep(900); }
await sleep(1500); await skip(H);
await shot(H, '13-host-ruinsturn');
// host moves the guard twice, then ends the ruins turn
for (let i = 0; i < 2; i++) {
  await skip(H);
  const g = await H.page.$('.gpick:not([disabled])'); if (g) { await g.click(); await sleep(400); }
  const cells = await H.page.$$('.st-cell.hl-legal, .st-cell.hl-legal2');
  if (cells.length) { await cells[0].click(); await sleep(700); }
  const atk = H.page.locator('.attackbar .btn.danger'); if (await atk.count()) { await atk.first().click(); await sleep(2500); }
}
await skip(H);
const endR = H.page.locator('.ruinsctl .btn', { hasText: '遺跡役の手番を終える' });
await endR.click();
await sleep(3500); await skip(A); await skip(B); await skip(H);
const stageA = await A.page.$eval('.app-room', e => e.className);
log('A stage after ruins turn:', stageA);
await shot(A, '14-A-round2');
// disconnect / reconnect A
await A.page.close();
await sleep(20000);
await skip(H);
await shot(H, '15-host-sees-disconnect');
const A2 = { page: await A.ctx.newPage(), name: 'aki2' };
const errs2 = watch(A2.page, '[aki2]');
await A2.page.goto('http://localhost:8790/' + Q + A.page.__cid, { waitUntil: 'domcontentloaded' });
await sleep(800);
await A2.page.locator('.resume .btn', { hasText: '再接続' }).click();
await A2.page.waitForSelector('.app-room', { timeout: 30000 });
await sleep(2000); await skip(A2);
log('A rejoined:', await A2.page.$eval('.app-room', e => e.className));
await shot(A2, '16-A-rejoined');
console.log('ERRORS:\n' + [...H.errs, ...A.errs, ...B.errs, ...errs2].filter(e => !/ERR_TUNNEL|stun|turn/i.test(e)).join('\n'));
await browser.close();
