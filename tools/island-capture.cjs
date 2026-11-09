// Captures The・Island field-guide portraits and the PLAYROOM shelf cover from the game
// renderer (so they show the Blender-made assets exactly as they appear in game).
//
//   node serve.js &                                   (local server on :8788)
//   node tools/island-capture.cjs portraits [ids...]  -> island/assets/portraits/<id>.webp
//   node tools/island-capture.cjs cover               -> games/img/island(.webp|-640.webp)
//
// Needs Playwright with Chromium. Uses software WebGL when no GPU is available (slow).
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const mode = process.argv[2] || "portraits";
const only = process.argv.slice(3);
const BASE = process.env.ISLAND_URL || "http://localhost:8788/island/index.html";

async function open(w, h, q, t) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("pageerror: " + e.message));
  await page.goto(`${BASE}?q=${q}&fly=1&anim=1&t=${t}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.evaluate(() => { window.__hold = true; });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: "#hud,#playground-return,#loading,#title,.sheet,#joy,#mbtns,#mtop,#pcmenu{display:none!important}" });
  return { browser, page };
}

async function toWebp(png, out, width) {
  // webp conversion through the browser canvas keeps this tool dependency-free
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const data = fs.readFileSync(png).toString("base64");
  const b64 = await page.evaluate(async ({ data, width }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = width || img.width;
    c.height = Math.round(img.height * c.width / img.width);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.86).split(",")[1];
  }, { data, width });
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  await browser.close();
}

async function portraits() {
  const { browser, page } = await open(640, 400, 2, 0.36);
  const subjects = await page.evaluate(() => {
    const g = window.__game;
    if (!g.fauna.list.length) g.fauna.spawnAll(20.3, { x: g.lz.x, z: g.lz.z, r: 60 });
    const res = {};
    const lz = g.lz;
    const near = (list) => list.sort((a, b) => Math.hypot(a.x - lz.x, a.z - lz.z) - Math.hypot(b.x - lz.x, b.z - lz.z))[0];
    for (const S of g.foliage.species) {
      const sz = { palm: 13, pandanus: 6, buttress: 26, mangrove: 7, treefern: 6 }[S.def.id];
      if (!sz) continue;
      const i = near(S.instances.slice());
      if (i) res[S.def.id] = [i.x, i.y + sz * 0.42, i.z, sz];
    }
    // ground plants: take one from the tiles around a jungle spot
    for (const id of ["alocasia", "morningglory"]) {
      const T = g.ground.types.find((t) => t.def.id === id);
      if (!T) continue;
      const S = g.foliage.species.find((s) => s.def.id === (id === "alocasia" ? "treefern" : "palm"));
      const ref = near(S.instances.slice());
      const tx = Math.floor(ref.x / 16), tz = Math.floor(ref.z / 16);
      for (let r = 0; r < 6 && !res[id]; r++) for (let dz = -r; dz <= r && !res[id]; dz++) for (let dx = -r; dx <= r && !res[id]; dx++) {
        const tile = g.ground._genTile(tx + dx, tz + dz);
        const ti = g.ground.types.indexOf(T);
        for (const arr of tile.data[ti] || []) if (arr.length) { res[id] = [arr[12], arr[13] + 0.4, arr[14], id === "alocasia" ? 2.6 : 2.2]; break; }
      }
    }
    for (const s of g.world.specimens) if (!res[s.species]) res[s.species] = [s.pos.x, s.pos.y + (s.species === "heart" ? 6 : 0.4), s.pos.z, s.species === "heart" ? 40 : s.species === "mushroom" ? 2.4 : 1.6];
    for (const c of g.fauna.list) if (!res[c.id]) res[c.id] = [c.pos.x, c.pos.y + (c.id === "denkui" ? 1.4 : c.id === "booby" ? 0 : c.id === "crab" ? 0.12 : 0.35), c.pos.z, { crab: 0.9, booby: 3, monitor: 2.6, denkui: 4.5, numa: 6, kurohami: 3.6 }[c.id], c.uid];
    return res;
  });
  const dir = path.join(root, "island", "assets", "portraits");
  fs.mkdirSync(dir, { recursive: true });
  const times = { mushroom: 0.8, kurohami: 0.31, heart: 0.34, booby: 0.42 };
  for (const [id, v] of Object.entries(subjects)) {
    if (only.length && !only.includes(id)) continue;
    await page.evaluate(([x, y, z, size, uid, id, t]) => {
      const g = window.__game, e = window.__engine;
      e.setTime(t);
      window.__step(2);
      const sun = e.sky.sunDir;
      let ax = sun.x, az = sun.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const side = 0.6;
      let cx = x + (ax * Math.cos(side) - az * Math.sin(side)) * size * 1.1, cz = z + (az * Math.cos(side) + ax * Math.sin(side)) * size * 1.1;
      let cy = Math.max(g.terrain.heightAt(cx, cz) + 1.2, y + size * 0.15);
      if (id === "heart") cy = y + 18;
      if (uid !== undefined) {
        const c = g.fauna.list[uid];
        c.vel = 0; c.timer = 99;
        if (id === "booby") { cx = c.pos.x + 3.5; cz = c.pos.z + 2.5; cy = c.pos.y + 0.8; x = c.pos.x; y = c.pos.y; z = c.pos.z; }
        // keep the animal on screen and posed
        g.fauna.groundY && (c.pos.y = g.fauna.groundY(c));
      }
      window.__fly.look(cx, cy, cz, x, y, z);
      window.__step(6);
    }, [...v.slice(0, 4), v[4], id, times[id] || 0.36]);
    const png = path.join(dir, `${id}.png`);
    await page.screenshot({ path: png, timeout: 600000 });
    await toWebp(png, path.join(dir, `${id}.webp`), 640);
    fs.unlinkSync(png);
    console.log("portrait", id);
  }
  await browser.close();
}

async function cover() {
  const { browser, page } = await open(1280, 720, 2, 0.295);
  await page.evaluate(() => {
    const g = window.__game;
    const ex = g.explorer;
    const px = -96, pz = 312;
    const py = g.terrain.heightAt(px, pz);
    ex.root.visible = true;
    ex.root.position.set(px, py, pz);
    ex.root.rotation.y = Math.atan2(60 - px, -430 - pz);
    for (let i = 0; i < 30; i++) { ex.setPose({ idle: 1 }, { idle: 1 }, {}, 0.1); ex.update(0.1); }
    window.__fly.look(px - 2.6, py + 1.35, pz + 4.2, px + 18, py + 9, pz - 40);
    window.__step(6);
  });
  const png = path.join(root, "games", "img", "island.png");
  await page.screenshot({ path: png, timeout: 600000 });
  await toWebp(png, path.join(root, "games", "img", "island.webp"), 1280);
  await toWebp(png, path.join(root, "games", "img", "island-640.webp"), 640);
  fs.unlinkSync(png);
  console.log("cover done");
  await browser.close();
}

(mode === "cover" ? cover() : portraits()).catch((e) => { console.error(e); process.exit(1); });
