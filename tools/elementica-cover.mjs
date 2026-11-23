// エレメンティカ: renders tools/elementica-cover.html into the PLAYROOM cover and the share image.
//   node tools/elementica-cover.mjs [outDir]     (default: write into games/img and elementica)
// Needs Playwright with Chromium and sharp.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function need(name) {
  for (const p of [name, '/opt/node22/lib/node_modules/' + name, '/opt/npm-tools/node_modules/' + name]) { try { return require(p); } catch (e) { /* next */ } }
  console.error(name + ' was not found'); process.exit(2);
}
const playwright = need('playwright'), sharp = need('sharp');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const out = process.argv[2] || null;
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(500);
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function shoot(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  // offline runs: Google Fonts may be unreachable, use the fallbacks instead of waiting
  if (process.env.EL_NO_WEBFONTS) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/tools/elementica-cover.html`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
  const png = await page.screenshot({ type: 'png', timeout: 120000 });
  await ctx.close();
  return png;
}
const wide = await shoot(1280, 720);
const og = await shoot(1200, 630);
const imgDir = out || path.join(root, 'games/img'), ogDir = out || path.join(root, 'elementica');
await sharp(wide).resize(1280, 720).webp({ quality: 84 }).toFile(path.join(imgDir, 'elementica.webp'));
await sharp(wide).resize(640, 360).webp({ quality: 84 }).toFile(path.join(imgDir, 'elementica-640.webp'));
await sharp(og).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(ogDir, 'og.jpg'));
await browser.close();
server.kill();
console.log('wrote elementica.webp, elementica-640.webp, og.jpg');
