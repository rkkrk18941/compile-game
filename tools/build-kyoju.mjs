// Builds kyoju/index.html (巨獣黙示録) from kyoju/src.
//
//   npm install            (once)
//   npm run build:kyoju    (or: node tools/build-kyoju.mjs [--dev])
//
// The 3D invasion stage (src/main.js + src/3d/*.js, ES modules with three.js) is
// bundled into one IIFE that defines window.Kyoju3D. The management screens
// (src/legacy/*.js, plain scripts that share globals) are concatenated in order.
// Both are inlined into src/shell.html together with src/legacy/style.css.
// --dev skips minification.
import { build, transform } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "kyoju", "src");
const dev = process.argv.includes("--dev");

const main = await build({ entryPoints: [join(src, "main.js")], bundle: true, format: "iife", minify: !dev, target: ["es2020"], charset: "ascii", legalComments: "none", write: false, logLevel: "warning" });
const game = main.outputFiles[0].text.trimEnd().replace(/<\/(script)/gi, "<\\/$1");

const order = ["00-util.js", "10-data.js", "20-model.js", "30-art-beast.js", "31-art-city.js", "32-fx.js", "50-fight.js", "60-audio.js", "70-ui.js", "99-main.js"];
const legacySrc = order.map((f) => `/* ${f} */\n` + readFileSync(join(src, "legacy", f), "utf8")).join("\n");
// 共有するグローバル名を保つため、識別子は縮めない
const legacy = dev ? legacySrc : (await transform(legacySrc, { minifyWhitespace: true, minifySyntax: true, target: "es2020", charset: "utf8", legalComments: "none" })).code;

const css = readFileSync(join(src, "legacy", "style.css"), "utf8");
const shell = readFileSync(join(src, "shell.html"), "utf8");
for (const m of ["/*@CSS@*/", "/*@GAME_SCRIPT@*/", "/*@LEGACY_SCRIPT@*/"]) if (!shell.includes(m)) throw new Error("shell.html is missing " + m);
const html = shell.replace("/*@CSS@*/", () => css).replace("/*@GAME_SCRIPT@*/", () => game).replace("/*@LEGACY_SCRIPT@*/", () => legacy.replace(/<\/(script)/gi, "<\\/$1"));
const normalized = html.replace(/[ \t]+$/gm, "").replace(/^ +(?=\t)/gm, "");
writeFileSync(join(root, "kyoju", "index.html"), normalized);
console.log(`kyoju/index.html: ${(html.length / 1024).toFixed(0)} KB (3D ${(game.length / 1024).toFixed(0)} KB, screens ${(legacy.length / 1024).toFixed(0)} KB)${dev ? " (dev)" : ""}`);
