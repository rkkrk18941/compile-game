// Builds island/index.html (The・Island) from island/src.
//
//   npm install            (once)
//   npm run build:island   (or: node tools/build-island.mjs [--dev])
//
// The game (src/main.js) is bundled with three.js and inlined into src/shell.html.
// Runtime assets (terrain data, GLB models, textures) stay as files in island/assets
// and are loaded on demand. --dev skips minification.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "island", "src");
const dev = process.argv.includes("--dev");

const main = await build({
  entryPoints: [join(src, "main.js")],
  bundle: true, format: "iife", minify: !dev, target: ["es2020"], charset: "ascii",
  legalComments: "none", write: false, logLevel: "warning",
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
});
let js = main.outputFiles[0].text.trimEnd();
js = js.replace(/<\/(script)/gi, "<\\/$1"); // an inline script ends at the first "</script"

const shell = readFileSync(join(src, "shell.html"), "utf8");
if (!shell.includes("/*@GAME_SCRIPT@*/")) throw new Error("shell.html is missing /*@GAME_SCRIPT@*/");
const html = shell.replace("/*@GAME_SCRIPT@*/", () => js);
writeFileSync(join(root, "island", "index.html"), html);
console.log(`island/index.html: ${(html.length / 1024).toFixed(0)} KB${dev ? " (dev)" : ""}`);
