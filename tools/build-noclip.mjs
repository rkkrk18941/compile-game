// Builds noclip/index.html from noclip/src.
//
//   npm install          (once)
//   npm run build:noclip (or: node tools/build-noclip.mjs [--dev])
//
// Every noclip/src/NN-*.js part is concatenated in file-name order into ONE
// module scope (the game was originally a single closure, and the parts still
// share their top-level names), then bundled with three.js and PeerJS by esbuild
// and inlined into noclip/src/shell.html. --dev skips minification.
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "noclip", "src");
const dev = process.argv.includes("--dev");

const parts = readdirSync(srcDir)
  .filter((f) => /^\d\d-.*\.js$/.test(f))
  .sort();
const contents = parts
  .map((f) => `// ---- ${f}\n` + readFileSync(join(srcDir, f), "utf8"))
  .join("\n");

const out = await build({
  stdin: { contents, resolveDir: root, sourcefile: "noclip.js", loader: "js" },
  bundle: true,
  format: "iife",
  minify: !dev,
  target: ["es2020"],
  charset: "ascii",
  legalComments: "none",
  write: false,
  logLevel: "warning",
});
let js = out.outputFiles[0].text.trimEnd();
// An inline script ends at the first "</script" no matter where it appears.
js = js.replace(/<\/(script)/gi, "<\\/$1");

const shell = readFileSync(join(srcDir, "shell.html"), "utf8");
const marker = "/*@GAME_SCRIPT@*/";
if (!shell.includes(marker)) throw new Error("shell.html is missing " + marker);
const html = shell.replace(marker, () => js);
writeFileSync(join(root, "noclip", "index.html"), html);
console.log(
  `noclip/index.html: ${(html.length / 1024).toFixed(0)} KB from ${parts.join(", ")}${dev ? " (dev)" : ""}`,
);

// The physics engine (Rapier, WASM inlined) is loaded on demand from
// noclip/lib so it never weighs on the first page load.
const rapier = join(root, "node_modules", "@dimforge", "rapier3d-compat");
if (existsSync(join(rapier, "rapier.es.js"))) {
  mkdirSync(join(root, "noclip", "lib"), { recursive: true });
  copyFileSync(join(rapier, "rapier.es.js"), join(root, "noclip", "lib", "rapier.mjs"));
  copyFileSync(join(rapier, "LICENSE"), join(root, "noclip", "lib", "RAPIER-LICENSE"));
}
