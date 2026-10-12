// Bundles the whole game into one self-contained HTML file: dist/index.html
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const minify = process.argv.includes('--minify');
// --artifact: a body-only page for the claude.ai artifact viewer (CPU play only; no WebRTC there)
const artifact = process.argv.includes('--artifact');

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/ui/main.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify,
  legalComments: 'none',
  charset: 'utf8',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
// keep </script> from terminating the inline script
js = js.replace(/<\/script/gi, '<\\/script');

const cssFiles = ['base.css', 'boards.css', 'screens.css', 'fx.css'];
let css = cssFiles.map(f => fs.readFileSync(path.join(root, 'src/styles', f), 'utf8')).join('\n');
if (minify) {
  const r = await esbuild.transform(css, { loader: 'css', minify: true });
  css = r.code;
}

const tpl = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
let html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
let out = 'dist/index.html';
if (artifact) {
  // the viewer supplies doctype/head/body; keep title, fonts and styles at the top of the file
  const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  const keep = head.split('\n').filter(l => /^<(title|link href=|style|\/style)|^[^<]/.test(l) || l.startsWith('#boot')).join('\n');
  html = `${keep}\n<script>window.__MM_EMBED__=true</script>\n${body}`;
  out = 'dist/artifact.html';
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, out), html);
console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB  (js ${(js.length / 1024).toFixed(1)} KB, css ${(css.length / 1024).toFixed(1)} KB)`);
