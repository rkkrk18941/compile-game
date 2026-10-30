// シェディー・レディー: renders tools/shadylady-cover.html into the PLAYROOM cover and the share image.
//   node tools/shadylady-cover.mjs [outDir]     (default: write into games/img and shady-lady)
// Needs Playwright with Chromium and sharp. SL_VENDOR=/path/to/node_modules serves the fonts from local
// @fontsource copies (playfair-display, shippori-mincho-b1, zen-kaku-gothic-new) when Google Fonts cannot be reached.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
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
const VENDOR = process.env.SL_VENDOR || '';
const server = spawn(process.execPath, ['serve.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FONTS = { 'playfair-display': ['700.css', '900.css'], 'shippori-mincho-b1': ['700.css', '800.css'], 'zen-kaku-gothic-new': ['500.css', '700.css', '900.css'] };

async function fonts(ctx) {
  if (!VENDOR) return;
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

try {
  await sleep(400);
  const browser = await playwright.chromium.launch();
  for (const og of [false, true]) {
    const W = og ? 1200 : 1280, H = og ? 630 : 720;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await fonts(ctx);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/tools/shadylady-cover.html${og ? '?og=1' : ''}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(400);
    const png = await page.locator('#cover').screenshot({ type: 'png' });
    if (og) {
      const dest = out ? path.join(out, 'og.jpg') : path.join(root, 'shady-lady/og.jpg');
      await sharp(png).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(dest);
      console.log('wrote', dest);
    } else {
      const big = out ? path.join(out, 'shady-lady.webp') : path.join(root, 'games/img/shady-lady.webp');
      const small = out ? path.join(out, 'shady-lady-640.webp') : path.join(root, 'games/img/shady-lady-640.webp');
      await sharp(png).resize(1280, 720).webp({ quality: 82 }).toFile(big);
      await sharp(png).resize(640, 360).webp({ quality: 80 }).toFile(small);
      console.log('wrote', big, small);
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  server.kill();
}
