// Builds tokyo-sora/index.html (東京そらさんぽ) from tokyo-sora/src.
//
//   npm install                (once)
//   npm run build:tokyo-sora   (or: node tools/build-tokyo-sora.mjs [--dev])
//
// The building worker (src/worker.js) is bundled first and embedded as a string,
// then the game (src/main.js) is bundled with three.js and Leaflet and inlined
// into src/shell.html together with Leaflet's stylesheet. --dev skips minification.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "tokyo-sora", "src");
const dev = process.argv.includes("--dev");
const common = { bundle: true, format: "iife", minify: !dev, target: ["es2020"], charset: "ascii", legalComments: "none", write: false, logLevel: "warning" };

const worker = await build({ ...common, entryPoints: [join(src, "worker.js")] });
const workerCode = worker.outputFiles[0].text;

const main = await build({ ...common, entryPoints: [join(src, "main.js")], define: { __WORKER_CODE__: JSON.stringify(workerCode) } });
let js = main.outputFiles[0].text.trimEnd();
js = js.replace(/<\/(script)/gi, "<\\/$1"); // an inline script ends at the first "</script"

// Leaflet's stylesheet without its image references (we only use vector markers).
const leafletCss = readFileSync(join(root, "node_modules", "leaflet", "dist", "leaflet.css"), "utf8")
  .replace(/url\([^)]*\)/g, "none")
  .replace(/<\/(style)/gi, "<\\/$1");

const shell = readFileSync(join(src, "shell.html"), "utf8");
for (const m of ["/*@LEAFLET_CSS@*/", "/*@GAME_SCRIPT@*/"]) if (!shell.includes(m)) throw new Error("shell.html is missing " + m);
const html = shell.replace("/*@LEAFLET_CSS@*/", () => leafletCss).replace("/*@GAME_SCRIPT@*/", () => js);
writeFileSync(join(root, "tokyo-sora", "index.html"), html);
console.log(`tokyo-sora/index.html: ${(html.length / 1024).toFixed(0)} KB (worker ${(workerCode.length / 1024).toFixed(0)} KB)${dev ? " (dev)" : ""}`);
