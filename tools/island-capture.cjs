// Captures The・Island field-guide portraits and the PLAYROOM shelf cover from the game
// renderer (so they show the Blender-made assets exactly as they appear in game).
//
//   node serve.js &                                   (local server on :8788)
//   node tools/island-capture.cjs portraits [ids...]  -> island/assets/portraits/<id>.webp
//   node tools/island-capture.cjs cover               -> games/img/island(.webp|-640.webp)
//
// Portraits are shot like a field photographer would: the subject is framed from its real
// bounds, the camera picks a side with the sun behind it and no terrain in the way, plants
// standing between camera and subject are pushed aside (hidden for the shot), animals are held
// in a characteristic pose, and a soft fill flash lifts subjects in the shade of the canopy.
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
  page.on("console", (m) => { if (m.type() === "error") console.log("console: " + m.text()); });
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

// per subject: time of day, animal pose, flash strength (fraction of the sunlight)
const SHOTS = {
  palm: { t: 0.38 }, pandanus: { t: 0.38 }, buttress: { t: 0.43, frameH: 13 }, mangrove: { t: 0.41 }, treefern: { t: 0.43 },
  alocasia: { t: 0.43 }, morningglory: { t: 0.38, frame: [0.4, 1.3], elev: 0.85 },
  pitcher: { t: 0.43 }, glassbloom: { t: 0.37 }, mushroom: { t: 0.772, flash: 1.1, flashWarm: true, expo: 0.3, elev: 0.45, dist: 0.75 },
  heart: { t: 0.34, flash: 0 },
  crab: { t: 0.37, anim: "threat", dist: 1.15, elev: 0.3 },
  monitor: { t: 0.42, anim: "idle", aimBone: "head", aimMix: 0.55, frame: [0.5, 1.5], elev: 0.25 },
  denkui: { t: 0.42, anim: "feed", aimBone: "head", aimMix: 0.8, frame: [1.5, 1.8], elev: -0.12 },
  numa: { t: 0.4, anim: "idle", bank: true, aimBone: "head", aimMix: 0.35, frame: [0.8, 3.2], elev: 0.25 },
  kurohami: { t: 0.35, anim: "listen", aimBone: "head", aimMix: 0.3 }, booby: { t: 0.4, anim: "glide", dist: 0.8 },
};

// ------------------------------------------------------------------ in-page photo kit
function installPhotoKit() {
  const g = window.__game, e = window.__engine;
  const V3 = e.camera.position.constructor;
  const lz = g.lz;
  if (!g.fauna.list.length) g.fauna.spawnAll(20.3, { x: lz.x, z: lz.z, r: 60 });
  g.fauna.authority = false; // hold the animals still; poses are set by hand
  const P = (window.__photo = { flash: g.world.heartLight, hidden: [], tiles: new Set() });
  const tmp = new V3();
  const H = (x, z) => g.terrain.heightAt(x, z);

  // world-space bounds of an object (current pose for skinned meshes)
  const bounds = (obj, filter) => {
    obj.updateMatrixWorld(true);
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    obj.traverse((o) => {
      if (!o.isMesh || (filter && !filter(o))) return;
      let gb;
      if (o.isSkinnedMesh) { o.computeBoundingBox(); gb = o.boundingBox; }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); gb = o.geometry.boundingBox; }
      for (let i = 0; i < 8; i++) {
        tmp.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(o.matrixWorld);
        for (let k = 0; k < 3; k++) { const v = tmp.getComponent(k); mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }
      }
    });
    return { mn, mx };
  };
  // model-space bounds of instanced geometry
  const geoBounds = (meshes) => {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const m of meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      mn[0] = Math.min(mn[0], b.min.x); mn[1] = Math.min(mn[1], b.min.y); mn[2] = Math.min(mn[2], b.min.z);
      mx[0] = Math.max(mx[0], b.max.x); mx[1] = Math.max(mx[1], b.max.y); mx[2] = Math.max(mx[2], b.max.z);
    }
    return { mn, mx };
  };
  const spDims = new Map();
  const speciesDims = (S, v) => {
    const key = S.def.id + v;
    if (!spDims.has(key)) spDims.set(key, geoBounds(S.tiers[v][0].meshes));
    return spDims.get(key);
  };
  const gpDims = (ti, v) => geoBounds(g.ground.types[ti].variants[v].meshes);
  // trunks and rocks within r of a point: a rough measure of how cluttered a spot is
  const crowd = (x, z, r = 7) => g.foliage.collidersNear(x, z, []).filter((c) => { const d = Math.hypot(c.x - x, c.z - z); return d < r && d > 0.3; }).length;

  // ---- subjects: { x, y, z: target centre, base (ground y), Hs, Ws: size, yaw?, inst?, gp?, c? }
  const fromBox = (b, extra) => ({
    x: (b.mn[0] + b.mx[0]) / 2, y: (b.mn[1] + b.mx[1]) / 2, z: (b.mn[2] + b.mx[2]) / 2,
    base: b.mn[1], Hs: b.mx[1] - b.mn[1], Ws: Math.max(b.mx[0] - b.mn[0], b.mx[2] - b.mn[2]), ...extra,
  });
  const pickNear = (list, px, pz, score) => list.map((o) => ({ o, s: score(o) + Math.hypot(o.x - px, o.z - pz) * 0.02 })).sort((a, b) => a.s - b.s)[0].o;

  P.find = (id, opt) => {
    const S = g.foliage.species.find((s) => s.def.id === id);
    if (S) {
      const pool = S.instances.filter((i) => Math.hypot(i.x - lz.x, i.z - lz.z) < 600 && g.terrain.slopeAt(i.x, i.z) < 18);
      const inst = pickNear(pool.length ? pool : S.instances, lz.x, lz.z, (i) => crowd(i.x, i.z) * 1.5);
      const d = speciesDims(S, inst.v);
      const c = Math.cos(inst.rot), s = Math.sin(inst.rot);
      const cx = (d.mn[0] + d.mx[0]) / 2 * inst.s, cz = (d.mn[2] + d.mx[2]) / 2 * inst.s;
      const Hs = (d.mx[1] - Math.max(d.mn[1], 0)) * inst.s;
      const frameH = Math.min(Hs, opt.frameH || 1e9);
      return {
        x: inst.x + c * cx + s * cz, z: inst.z - s * cx + c * cz, y: inst.y + frameH * 0.48, base: inst.y,
        Hs: frameH, Ws: Math.min(Math.max(d.mx[0] - d.mn[0], d.mx[2] - d.mn[2]) * inst.s, frameH * 1.4), inst,
      };
    }
    const ti = g.ground.types.findIndex((t) => t.def.id === id);
    if (ti >= 0) {
      // a plant in its habitat near the camp
      const ref = id === "alocasia" ? g.foliage.species.find((s) => s.def.id === "treefern") : g.foliage.species.find((s) => s.def.id === "palm");
      const pool = ref.instances.filter((i) => Math.hypot(i.x - lz.x, i.z - lz.z) < 600);
      const r0 = pickNear(pool.length ? pool : ref.instances, lz.x, lz.z, (i) => crowd(i.x, i.z));
      const tx = Math.floor(r0.x / 16), tz = Math.floor(r0.z / 16);
      const cands = [];
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const tile = g.ground._genTile(tx + dx, tz + dz);
        (tile.data[ti] || []).forEach((arr, v) => {
          for (let k = 0; k + 16 <= arr.length; k += 16) cands.push({ x: arr[k + 12], y: arr[k + 13], z: arr[k + 14], s: Math.hypot(arr[k], arr[k + 1], arr[k + 2]), v });
        });
      }
      const p = pickNear(cands, r0.x, r0.z, (q) => crowd(q.x, q.z, 4) * 2 + (q.s < 1 ? 1 : 0));
      const d = gpDims(ti, p.v);
      const Hs = (d.mx[1] - Math.max(d.mn[1], 0)) * p.s;
      const Ws = Math.max(d.mx[0] - d.mn[0], d.mx[2] - d.mn[2]) * p.s;
      // creeping plants: a close look at a patch of leaves and flowers rather than the whole mat
      if (opt.frame) return { x: p.x, z: p.z, y: p.y + opt.frame[0] * 0.3, base: p.y, Hs: opt.frame[0], Ws: opt.frame[1], gp: p };
      return { x: p.x, z: p.z, y: p.y + Hs * 0.45, base: p.y, Hs, Ws, gp: p };
    }
    if (id === "heart") {
      const b = bounds(g.world.heart), x = (b.mn[0] + b.mx[0]) / 2, z = (b.mn[2] + b.mx[2]) / 2;
      const base = H(x, z);
      return { x, z, y: base + 3, base, Hs: 9, Ws: 26, heart: true };
    }
    const spec = g.world.specimens.filter((s) => s.species === id);
    if (spec.length) {
      const s = pickNear(spec.map((q) => ({ x: q.pos.x, z: q.pos.z, q })), lz.x, lz.z, (o) => crowd(o.x, o.z, 4) * 2).q;
      s.obj.visible = true;
      // glowing mushrooms: aim at the caps, not the log they grow on
      const gb = bounds(s.obj, (o) => o.material === g.world.mushroomGlow);
      if (gb.mx[0] > gb.mn[0]) {
        const b = bounds(s.obj);
        return { ...fromBox(gb, {}), base: b.mn[1], Ws: Math.max(gb.mx[0] - gb.mn[0], gb.mx[2] - gb.mn[2]) + 0.3, Hs: gb.mx[1] - gb.mn[1] + 0.1 };
      }
      return fromBox(bounds(s.obj), {});
    }
    // animals
    const list = g.fauna.list.filter((c) => c.id === id);
    const c = pickNear(list.map((q) => ({ x: q.pos.x, z: q.pos.z, q })), lz.x, lz.z, (o) => crowd(o.x, o.z) * 3).q;
    c.state = id === "booby" ? "glide" : "idle"; c.vel = 0; c.turn = 0;
    if (opt.bank) {
      // haul the crocodilian out on a muddy bank, facing the water
      let best = null;
      for (let r = 2; r < 60 && !best; r += 2) for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r, h = H(x, z);
        if (h > 0.15 && h < 0.6 && g.terrain.slopeAt(x, z) < 10 && crowd(x, z, 5) < 2) { best = { x, z }; break; }
      }
      if (best) {
        c.pos.x = best.x; c.pos.z = best.z;
        const gx = H(best.x + 1, best.z) - H(best.x - 1, best.z), gz = H(best.x, best.z + 1) - H(best.x, best.z - 1);
        c.yaw = Math.atan2(-gx, -gz);
      }
    }
    c.pos.y = g.fauna.groundY(c);
    c.root.position.copy(c.pos);
    c.root.rotation.set(0, c.yaw, 0);
    c.root.visible = true;
    for (let i = 0; i < 20; i++) g.fauna.setAnim(c, opt.anim || "idle", 0.5);
    c.mixer.update(0.7);
    const b = bounds(c.root);
    const box = fromBox(b, { c, yaw: c.yaw });
    if (id === "booby") return box;
    // aim between the body and the head (bones follow the pose); optional tighter frame
    let tx = c.pos.x, tz = c.pos.z, ty = b.mn[1] + (b.mx[1] - b.mn[1]) * 0.42;
    const bone = opt.aimBone && c.root.getObjectByName(opt.aimBone);
    if (bone) {
      bone.getWorldPosition(tmp);
      const k = opt.aimMix !== undefined ? opt.aimMix : 0.6;
      tx += (tmp.x - tx) * k; ty += (tmp.y - ty) * k; tz += (tmp.z - tz) * k;
    }
    if (opt.frame) { box.Hs = opt.frame[0]; box.Ws = opt.frame[1]; }
    return { ...box, x: tx, y: ty, z: tz };
  };

  const segDist = (px, pz, ax, az, bx, bz) => {
    const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(wx - vx * t, wz - vz * t);
  };
  // distance outside the view wedge from the camera (a) to the subject's silhouette (half width w at b)
  const wedgeDist = (px, pz, ax, az, bx, bz, w) => {
    const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(wx - vx * t, wz - vz * t) - (0.3 + w * t);
  };

  // push aside every plant between the camera and the subject (restored after the shot)
  P.clear = (cx, cz, sx, sz, sr, subj) => {
    const L = Math.hypot(sx - cx, sz - cz) || 1;
    // trees: keep the trunk and lower crown clear, stop at the trunk; others: the whole silhouette
    const stop = subj.inst ? 1.5 : sr, ww = subj.inst ? Math.min(sr * 0.6, 4) : sr * 1.1;
    const ex = sx - (sx - cx) / L * stop, ez = sz - (sz - cz) / L * stop; // stop at the subject's near side
    for (const S of g.foliage.species) {
      for (const inst of S.instances) {
        if (inst === subj.inst || inst.s === 0) continue;
        if (Math.abs(inst.x - cx) + Math.abs(inst.z - cz) > L + 60) continue;
        const d = speciesDims(S, inst.v);
        const r = Math.max(d.mx[0] - d.mn[0], d.mx[2] - d.mn[2]) * 0.5 * inst.s;
        if (wedgeDist(inst.x, inst.z, cx, cz, ex, ez, ww) < r * 0.8 || Math.hypot(inst.x - cx, inst.z - cz) < r + 1) {
          P.hidden.push([inst, inst.s, inst.y]);
          inst.s = 0;
          inst.y -= 50; // collapsed and buried, so wind sway cannot leave specks behind
        }
      }
    }
    for (const [key, tile] of g.ground.tiles) {
      tile.data.forEach((per, ti) => per.forEach((arr, v) => {
        let rr = null;
        for (let k = 0; k + 16 <= arr.length; k += 16) {
          const px = arr[k + 12], pz = arr[k + 14];
          if (subj.gp && Math.abs(px - subj.gp.x) < 0.01 && Math.abs(pz - subj.gp.z) < 0.01) continue;
          if (rr === null) { const d = gpDims(ti, v); rr = Math.max(d.mx[0] - d.mn[0], d.mx[2] - d.mn[2]) * 0.5; }
          const s = Math.hypot(arr[k], arr[k + 1], arr[k + 2]);
          if (wedgeDist(px, pz, cx, cz, ex, ez, ww) < rr * s * 0.85) {
            // collapse the instance but keep w = 1 (an all-zero matrix sends vertices to infinity)
            arr.fill(0, k, k + 11);
            arr[k + 13] -= 50;
            P.tiles.add(key);
          }
        }
      }));
    }
    if (g.grass.clearSeg) {
      g.grass.clearSeg.value.set(cx, cz, ex, ez);
      g.grass.clearR.value = Math.max(0.35, Math.min(1.2, subj.Ws * 0.5));
    }
    g.foliage.lastCam.set(1e9, 1e9, 1e9);
  };

  P.restore = () => {
    for (const [inst, s, y] of P.hidden) { inst.s = s; inst.y = y; }
    P.hidden.length = 0;
    g.ground.tiles.clear();
    g.ground.lastTile = "";
    P.tiles.clear();
    if (g.grass.clearR) g.grass.clearR.value = 0;
    g.foliage.lastCam.set(1e9, 1e9, 1e9);
    P.flash.intensity = 0;
  };

  P.shoot = (id, opt) => {
    e.setTime(opt.t);
    window.__step(2);
    // the heart keeps its own red light; everyone else borrows it as a fill flash
    g.world.heartLight = id === "heart" ? P.flash : null;
    if (id === "heart") { P.flash.color.set(0xff3040); P.flash.distance = 120; P.flash.decay = 1.6; }
    const s = P.find(id, opt);
    const fov = e.camera.fov * Math.PI / 180, tanV = Math.tan(fov / 2), tanH = tanV * e.camera.aspect;
    const small = s.Hs < 1.2 && !s.c;
    let D = Math.max(s.Hs * 0.5 * 1.3 / tanV, s.Ws * 0.5 * 1.25 / tanH) + s.Ws * 0.25;
    if (s.heart) D = 27;
    if (s.c) D = Math.max(D, 0.8);
    if (small) D = Math.max(D, 0.6);
    D *= opt.dist || 1;
    // candidate sides: three-quarter views for animals, all round for the rest
    const sun = e.sky.sunDir, sl = Math.hypot(sun.x, sun.z) || 1;
    let dirs = [];
    if (s.c && id === "booby") {
      // from the seaward side, so the island stands behind the bird
      const hx = g.world.heart.position.x, hz = g.world.heart.position.z;
      const L = Math.hypot(s.x - hx, s.z - hz) || 1;
      const ax = (s.x - hx) / L, az = (s.z - hz) / L;
      dirs = [[ax, az]];
      // bird flying across and towards the camera
      const a = Math.atan2(-ax, -az) + Math.PI * 0.72;
      s.c.yaw = Math.atan2(Math.sin(a), Math.cos(a));
      s.c.root.rotation.set(0, s.c.yaw, 0);
    } else if (s.c) {
      for (const deg of [50, -50, 75, -75, 30, -30, 105, -105]) {
        const a = s.yaw + deg * Math.PI / 180;
        dirs.push([Math.sin(a), Math.cos(a)]);
      }
    } else {
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; dirs.push([Math.cos(a), Math.sin(a)]); }
    }
    let best = null;
    for (const [dx, dz] of dirs) {
      const px = s.x + dx * D, pz = s.z + dz * D, gh = Math.max(H(px, pz), 0);
      let cy;
      if (s.heart) cy = Math.max(gh + 1.7, s.base + 8);
      else if (id === "booby") cy = s.y + D * 0.18;
      else if (small) cy = Math.max(gh + 0.22, s.y + D * (opt.elev || 0.42));
      else if (s.c) cy = Math.max(gh + 0.22, s.y + D * (opt.elev !== undefined ? opt.elev : 0.2));
      else cy = Math.max(gh + 1.65, s.base + 1.65);
      let score = 0;
      const foot = s.base + Math.min(0.5, s.Hs * 0.2);
      for (let i = 1; i < 10; i++) {
        const t = i / 10, x = s.x + (px - s.x) * t, z = s.z + (pz - s.z) * t;
        if (H(x, z) > s.y + (cy - s.y) * t - 0.05) score += 3;
        if (id !== "booby" && H(x, z) > foot + (cy - foot) * t + 0.02) score += 1;
      }
      // fewer plants to push aside keeps the shot natural
      for (const c of g.foliage.collidersNear((s.x + px) / 2, (s.z + pz) / 2, [])) if (segDist(c.x, c.z, px, pz, s.x, s.z) < c.r + 0.8) score += 0.6;
      score -= (dx * sun.x + dz * sun.z) / sl * 2.2;
      if (!s.c && gh - s.base > D * 0.6) score += 2; // looking down a steep slope
      if (!best || score < best.score) best = { score, px, pz, cy, dx, dz };
    }
    const cx = best.px, cz = best.pz, cy = best.cy;
    window.__fly.look(cx, cy, cz, s.x, s.y, s.z);
    // regenerate every ground-plant tile around the new viewpoint before clearing the corridor
    g.ground.tiles.clear();
    g.ground.lastTile = "";
    window.__step(1);
    if (!s.heart) P.clear(cx, cz, s.x, s.z, s.Ws * 0.5, s);
    // fill flash slightly above and right of the lens, scaled to the subject distance
    const f = opt.flash !== undefined ? opt.flash : s.c ? 0.75 : 0.5;
    if (id !== "heart") {
      const dist = Math.hypot(cx - s.x, cy - s.y, cz - s.z);
      P.flash.color.setRGB(1, opt.flashWarm ? 0.82 : 0.97, opt.flashWarm ? 0.6 : 0.92);
      P.flash.distance = 0; P.flash.decay = 2;
      P.flash.position.set(cx - best.dz * 0.3, cy + 0.35, cz + best.dx * 0.3);
      P.flash.intensity = f * (0.18 * Math.PI / (0.25 * e.targetExposure)) * dist * dist;
    }
    const ek = opt.expo || 1;
    window.__step(4);
    e.exposure = e.targetExposure * ek;
    window.__step(2);
    e.exposure = e.targetExposure * ek;
    window.__step(1);
    return { id, at: [cx, cy, cz].map((v) => +v.toFixed(1)), subj: [s.x, s.y, s.z].map((v) => +v.toFixed(1)), H: +s.Hs.toFixed(2), W: +s.Ws.toFixed(2), D: +D.toFixed(1), hidden: P.hidden.length };
  };
  return Object.keys(window.__shots);
}

async function portraits() {
  const { browser, page } = await open(640, 400, 2, 0.36);
  await page.evaluate((shots) => { window.__shots = shots; }, SHOTS);
  const ids = await page.evaluate(installPhotoKit);
  const dir = path.join(root, "island", "assets", "portraits");
  fs.mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    const info = await page.evaluate(([id, opt]) => window.__photo.shoot(id, opt), [id, SHOTS[id]]);
    const png = path.join(dir, `${id}.png`);
    await page.screenshot({ path: png, timeout: 600000 });
    await page.evaluate(() => window.__photo.restore());
    await toWebp(png, path.join(dir, `${id}.webp`), 640);
    if (!process.env.KEEP_PNG) fs.unlinkSync(png);
    console.log("portrait", JSON.stringify(info));
  }
  await browser.close();
}

// cover: the explorer walking up from the landing pad toward the camp and the jungle wall,
// the helicopter parked behind, the volcano in the morning haze. Positions relative to the LZ.
const COVER = { t: 0.31, cam: [6, 27, 1.25], look: [-2, 7, -30], ex: [7.2, 22.3, 197] };

async function cover() {
  const small = process.env.COVER_TEST === "1";
  const W = small ? 640 : 1280, Hh = small ? 360 : 720;
  const P = process.env.COVER ? { ...COVER, ...JSON.parse(process.env.COVER) } : COVER;
  const { browser, page } = await open(W, Hh, 2, P.t);
  await page.evaluate((P) => {
    const g = window.__game, e = window.__engine;
    const lz = g.lz, H = (x, z) => g.terrain.heightAt(x, z);
    const ex = g.explorer;
    const px = lz.x + P.ex[0], pz = lz.z + P.ex[1];
    ex.root.visible = true;
    ex.root.position.set(px, H(px, pz), pz);
    ex.root.rotation.y = P.ex[2] * Math.PI / 180;
    for (let i = 0; i < 12; i++) { ex.setPose({ walk: 1 }, { walk: 1 }, { walk: 1 }, 0.1); ex.update(0.1); }
    const cx = lz.x + P.cam[0], cz = lz.z + P.cam[1];
    window.__fly.look(cx, H(cx, cz) + P.cam[2], cz, lz.x + P.look[0], H(lz.x + P.look[0], lz.z + P.look[2]) + P.look[1], lz.z + P.look[2]);
    window.__step(4);
    e.exposure = e.targetExposure * 1.05;
    window.__step(2);
    e.exposure = e.targetExposure * 1.05;
    window.__step(1);
  }, P);
  const png = small ? path.join(process.env.COVER_OUT || root, "cover-test.png") : path.join(root, "games", "img", "island.png");
  await page.screenshot({ path: png, timeout: 600000 });
  if (!small) {
    await toWebp(png, path.join(root, "games", "img", "island.webp"), 1280);
    await toWebp(png, path.join(root, "games", "img", "island-640.webp"), 640);
    fs.unlinkSync(png);
  }
  console.log("cover done", png);
  await browser.close();
}

(mode === "cover" ? cover() : portraits()).catch((e) => { console.error(e); process.exit(1); });
