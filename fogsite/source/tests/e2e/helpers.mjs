import fs from 'node:fs';
import path from 'node:path';
export const OUT = '/tmp/claude-0/shots';
fs.mkdirSync(OUT, { recursive: true });
const FONT_CSS = fs.readFileSync('/home/claude/fonttest/fonts.css', 'utf8');
const FONT_ROOT = '/home/claude/fonttest/node_modules/@fontsource';

export async function setupContext(browser, { width = 390, height = 844, mobile = true, scale = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await ctx.route('https://fonts.gstatic.com/**', r => {
    const u = new URL(r.request().url());
    const m = u.pathname.match(/^\/local\/([^/]+)\/(.+)$/);
    if (!m) return r.fulfill({ status: 404, body: '' });
    const fp = path.join(FONT_ROOT, m[1], 'files', m[2]);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: m[2].endsWith('woff2') ? 'font/woff2' : 'font/woff', body: fs.readFileSync(fp) });
  });
  return ctx;
}
export function watch(page, tag = '') {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag}[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`${tag}[pageerror] ${e.message}\n${e.stack}`));
  return errors;
}
export const launchArgs = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
