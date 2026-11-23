/* エレメンティカ — the cloth map on the table (three.js r160; the copy in ../assets/vendor first, a CDN as a fallback).
   World: y is up, the cloth is y = 0. Hexes are pointy-topped, axial (q, r) -> x = √3(q + r/2), z = 1.5 r.
   The map is a ring of 54 hexes in three areas (黄・緑・青) around the crystal of Elementica. Each hex shows its
   bonus; a planning chip sits on it until someone builds a base there. Covered hexes (2–3 players) lie under dark
   cover tiles. createMap() returns { update(S, view), onHex(fn), resize(), dispose(), kind } and falls back to a flat
   SVG map when WebGL is not there. */

const THREE_URLS = [
  '../assets/vendor/three-r160.module.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of THREE_URLS) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

export const SEAT_COLORS = ['#d9473c', '#f3efe4', '#2f3338', '#ee86b8'];
export const SEAT_NAMES = ['赤', '白', '黒', '桃'];
const AREA_COLORS = ['#d8bd62', '#79b287', '#7aa0d4'];
const AREA_DEEP = ['#a88d2f', '#3f8a57', '#3f6fae'];
const SQ3 = Math.sqrt(3);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}
export function hexXZ(h) { return [SQ3 * (h.q + h.r / 2), 1.5 * h.r]; }

/* ------------------------------------------------------------------ small badges for bonuses */
const BADGE = {
  coin: { fill: '#e9b93b', ink: '#5a3d06', mark: '' },
  gem: { fill: '#58c7e8', ink: '#063848', mark: '' },
  vp: { fill: '#f3e7b6', ink: '#5a4405', mark: '' },
  res: { fill: '#9c7ad6', ink: '#fff', mark: '研' },
  work: { fill: '#b9814c', ink: '#fff', mark: '労' },
  mine: { fill: '#8a8f98', ink: '#fff', mark: '採' },
  water: { fill: '#4b8fe0', ink: '#fff', mark: '水' }
};
export function drawBadge(x, kind, n, cx, cy, r) {
  const b = BADGE[kind];
  if (!b) return;
  x.save();
  x.lineWidth = r * 0.14;
  x.strokeStyle = 'rgba(0,0,0,.35)';
  x.fillStyle = b.fill;
  x.beginPath();
  if (kind === 'coin') x.arc(cx, cy, r, 0, Math.PI * 2);
  else if (kind === 'gem') { x.moveTo(cx, cy - r * 1.1); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r * 1.1); x.lineTo(cx - r, cy); x.closePath(); }
  else if (kind === 'vp') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r * 1.12;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  } else { const s = r * 0.95; x.roundRect(cx - s, cy - s, s * 2, s * 2, s * 0.35); }
  x.fill(); x.stroke();
  x.fillStyle = b.ink;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (b.mark) {
    x.font = '900 ' + Math.round(r * 1.05) + 'px "Zen Kaku Gothic New", sans-serif';
    x.fillText(b.mark, cx, cy + r * 0.04);
    if (n > 1) {
      x.font = '900 ' + Math.round(r * 0.8) + 'px sans-serif';
      x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = r * 0.2;
      x.strokeText(String(n), cx + r * 0.95, cy + r * 0.85); x.fillText(String(n), cx + r * 0.95, cy + r * 0.85);
    }
  } else {
    x.font = '900 ' + Math.round(r * 1.15) + 'px sans-serif';
    x.fillText(String(n), cx, cy + r * 0.06);
  }
  x.restore();
}
function bonusKinds(bonus) { return bonus.map((a) => ({ kind: a.t, n: a.n || 1 })); }

/* ------------------------------------------------------------------ painted surfaces */
function paintHexTop(h, n) {
  const cv = canvas(256, 256), x = cv.getContext('2d');
  const base = h.covered ? '#3b3a3f' : AREA_COLORS[h.area];
  // cloth weave
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  x.globalAlpha = 0.08;
  for (let i = 0; i < 256; i += 4) { x.fillStyle = i % 8 ? '#000' : '#fff'; x.fillRect(i, 0, 1, 256); x.fillRect(0, i, 256, 1); }
  x.globalAlpha = 1;
  if (h.covered) {
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 10;
    x.beginPath(); x.moveTo(70, 70); x.lineTo(186, 186); x.moveTo(186, 70); x.lineTo(70, 186); x.stroke();
    return cv;
  }
  if (h.x) {
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  const kinds = bonusKinds(h.bonus);
  const y = h.x ? 128 : 74;
  const r = kinds.length > 1 ? 30 : 36;
  kinds.forEach((k, i) => drawBadge(x, k.kind, k.n, 128 + (i - (kinds.length - 1) / 2) * r * 2.25, y, r));
  return cv;
}
function paintSky() {
  const cv = canvas(8, 256), x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#0d1424'); g.addColorStop(0.55, '#1c2a3c'); g.addColorStop(1, '#2c2a33');
  x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  return cv;
}
function paintTable() {
  const cv = canvas(512, 512), x = cv.getContext('2d');
  const g = x.createRadialGradient(256, 256, 30, 256, 256, 256);
  g.addColorStop(0, '#3a3247'); g.addColorStop(1, '#1d1924');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.globalAlpha = 0.06;
  for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  x.globalAlpha = 1;
  // a faint rune circle
  x.strokeStyle = 'rgba(240,220,160,.18)'; x.lineWidth = 3;
  x.beginPath(); x.arc(256, 256, 236, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(256, 256, 224, 0, Math.PI * 2); x.stroke();
  return cv;
}
const TOKEN_MARK = {
  G_RES: ['研', '2'], G_WORK: ['労', '研'], G_ENV: ['環', '¢'], G_GEM: ['◆', '研'],
  B_WATER: ['水', ''], B_CPW: ['¢', '水'], B_RES: ['研', '¢'], B_WORK: ['労', '¢'],
  O_MINE: ['採', ''], O_GPM: ['◆', '採'], O_GEM: ['◆', '2'], O_VP: ['★', '2'],
  P_COIN: ['¢', '3'], P_RES: ['研', '◆'], P_ENV: ['環', '¢'], P_VP: ['★', '2'],
  W_COIN: ['¢', '2'], W_MIX: ['研', '◆'], N_BASE: ['拠', ''], N_BUILD: ['建', ''], N_COIN: ['¢', '2']
};
export function tokenMark(type) { return TOKEN_MARK[type] || ['', '']; }
export const CHIP_FILL = { G: '#3e9f62', B: '#3a78cf', O: '#e2792d', P: '#8650c2', W: 'rainbow', N: '#ebe6da' };
function paintChip(color, type) {
  const cv = canvas(128, 128), x = cv.getContext('2d');
  if (color === 'W') {
    const g = x.createConicGradient ? x.createConicGradient(0, 64, 64) : null;
    if (g) { ['#e94b4b', '#f0b13a', '#e9e14a', '#4cc26a', '#3a8fe0', '#8a5cd6', '#e94b4b'].forEach((c, i) => g.addColorStop(i / 6, c)); x.fillStyle = g; }
    else x.fillStyle = '#d9b54a';
  } else x.fillStyle = CHIP_FILL[color];
  x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.fill();
  const m = tokenMark(type);
  x.fillStyle = color === 'N' ? '#333' : '#fff';
  x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 6;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 46px "Zen Kaku Gothic New", sans-serif';
  if (m[1]) { x.strokeText(m[0], 44, 66); x.fillText(m[0], 44, 66); x.strokeText(m[1], 86, 66); x.fillText(m[1], 86, 66); }
  else { x.strokeText(m[0], 64, 66); x.fillText(m[0], 64, 66); }
  return cv;
}
function paintLabel(text, opts) {
  opts = opts || {};
  const cv = canvas(256, 96), x = cv.getContext('2d');
  x.font = '900 ' + (opts.size || 54) + 'px "Zen Kaku Gothic New", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (opts.pill) {
    const w = Math.min(250, x.measureText(text).width + 44);
    x.fillStyle = opts.pill; x.beginPath(); x.roundRect(128 - w / 2, 12, w, 72, 36); x.fill();
  }
  x.lineWidth = 10; x.strokeStyle = opts.stroke || 'rgba(0,0,0,.55)'; x.strokeText(text, 128, 50);
  x.fillStyle = opts.color || '#fff'; x.fillText(text, 128, 50);
  return cv;
}

/* ------------------------------------------------------------------ the 3D map */
export async function createMap(host, opts) {
  opts = opts || {};
  let THREE;
  try { THREE = await loadThree(); } catch (e) { return createFlatMap(host); }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.keepFrame }); }
  catch (e) { return createFlatMap(host); }
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const sky = new THREE.CanvasTexture(paintSky()); sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2238, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 16, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const tableTex = new THREE.CanvasTexture(paintTable()); tableTex.colorSpace = THREE.SRGBColorSpace;
  const table = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.95 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.02; table.receiveShadow = true;
  scene.add(table);

  // the crystal of Elementica in the middle
  const crystal = new THREE.Group();
  const gemMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x3a6cff, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), gemMat);
  core.scale.set(0.9, 1.6, 0.9); core.position.y = 1.9; core.castShadow = true;
  crystal.add(core);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x4a4256, roughness: 0.8 }));
  ped.position.y = 0.17; ped.receiveShadow = true; ped.castShadow = true;
  crystal.add(ped);
  const ringColors = [0x3e9f62, 0x3a78cf, 0xe2792d, 0x8650c2];
  const orbs = ringColors.map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7 }));
    m.userData.a = i * Math.PI / 2; crystal.add(m); return m;
  });
  const glow = new THREE.PointLight(0x8fb6ff, 6, 9, 1.6); glow.position.y = 2.2; crystal.add(glow);
  scene.add(crystal);

  const root = new THREE.Group(); scene.add(root);
  const hexGeo = new THREE.CylinderGeometry(0.965, 0.965, 0.14, 6);
  const coverGeo = new THREE.CylinderGeometry(0.985, 0.985, 0.26, 6);
  const chipGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.1, 28);
  const ringGeo = new THREE.RingGeometry(0.74, 0.95, 6, 1);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2a2530, roughness: 0.9 });
  const hexMeshes = [], hexes = {}, chips = {}, bases = {}, marks = {};
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 20), new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xb07a10, emissiveIntensity: 0.6, roughness: 0.3 }));
  pin.rotation.x = Math.PI; pin.visible = false; pin.castShadow = true; scene.add(pin);
  let built = false, lastN = 0, cb = null;

  function buildMap(S) {
    while (root.children.length) root.remove(root.children[0]);
    hexMeshes.length = 0;
    Object.keys(hexes).forEach((k) => delete hexes[k]);
    Object.keys(chips).forEach((k) => delete chips[k]);
    Object.keys(bases).forEach((k) => delete bases[k]);
    Object.keys(marks).forEach((k) => delete marks[k]);
    S.hexes.forEach((h) => {
      const tex = new THREE.CanvasTexture(paintHexTop(h, S.n)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      const mesh = new THREE.Mesh(h.covered ? coverGeo : hexGeo, [sideMat, top, sideMat]);
      const [x, z] = hexXZ(h);
      mesh.position.set(x, h.covered ? 0.13 : 0.07, z);
      mesh.receiveShadow = true; mesh.castShadow = h.covered;
      mesh.userData.hex = h.id;
      root.add(mesh); hexMeshes.push(mesh); hexes[h.id] = mesh;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.set(x, 0.16, z);
      root.add(ring); marks[h.id] = { ring, label: null };
    });
    // area names just outside the ring, in the middle of each area
    for (let a = 0; a < 3 && opts.areaLabels !== false; a++) {
      let sx = 0, sz = 0, cnt = 0;
      S.hexes.forEach((h) => { if (h.area === a) { const [hx, hz] = hexXZ(h); sx += hx; sz += hz; cnt++; } });
      const ang = Math.atan2(sz / cnt, sx / cnt);
      const tex = new THREE.CanvasTexture(paintLabel(['黄', '緑', '青'][a] + 'エリア', { color: '#fff', pill: AREA_DEEP[a] + 'dd', size: 46 }));
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.scale.set(3.2, 1.2, 1); sp.position.set(Math.cos(ang) * 8.6, 0.6, Math.sin(ang) * 8.6);
      sp.renderOrder = 5; root.add(sp);
    }
    built = true; lastN = S.n;
  }

  function makeBase(pid) {
    const g = new THREE.Group(), col = new THREE.Color(SEAT_COLORS[pid]);
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.62), mat);
    body.position.y = 0.21; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.42, 4), mat);
    roof.position.y = 0.63; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a2b1f }));
    flag.position.set(0, 1.0, 0); g.add(flag);
    return g;
  }
  const anims = [];
  function animate(obj, fromY, toY, ms) { anims.push({ obj, fromY, toY, t0: performance.now(), ms }); }

  function update(S, view) {
    view = view || {};
    if (!built || lastN !== S.n) buildMap(S);
    S.hexes.forEach((h) => {
      const [x, z] = hexXZ(h);
      // chip
      const want = h.token || null, have = chips[h.id];
      if (have && have.userData.tok !== want) { root.remove(have); delete chips[h.id]; }
      if (want && !chips[h.id]) {
        const t = S.toks[want];
        const tex = new THREE.CanvasTexture(paintChip(t.color, t.type)); tex.colorSpace = THREE.SRGBColorSpace;
        const side = new THREE.MeshStandardMaterial({ color: t.color === 'W' ? 0xd9b54a : new THREE.Color(CHIP_FILL[t.color]), roughness: 0.5 });
        const m = new THREE.Mesh(chipGeo, [side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), side]);
        m.position.set(x, 0.2, z + 0.32); m.castShadow = true; m.userData.tok = want; m.userData.hex = h.id;
        root.add(m); chips[h.id] = m; hexMeshes.push(m);
      }
      // base
      if (h.base != null && !bases[h.id]) {
        const b = makeBase(h.base); b.position.set(x, 0.14, z); root.add(b); bases[h.id] = b;
        if (view.animate !== false) animate(b, 2.6, 0.14, 420);
      } else if (h.base == null && bases[h.id]) { root.remove(bases[h.id]); delete bases[h.id]; }
      // highlight: hexes you can pick rise a little with a white ring and the others dim; the chosen one turns gold
      const mk = marks[h.id];
      const hl = view.highlight && view.highlight[h.id];
      const sel = view.selected === h.id;
      const lift = hl && !h.covered ? 0.06 : 0;
      const top = hexes[h.id].material[1];
      hexes[h.id].position.y = (h.covered ? 0.13 : 0.07) + lift;
      top.color.setScalar(view.highlight && !hl && !sel ? 0.42 : 1);
      top.emissive.setHex(hl ? 0x2c2614 : 0x000000);
      mk.ring.position.y = (h.covered ? 0.26 : 0.14) + lift + 0.02;
      mk.ring.material.opacity = sel ? 1 : hl ? 0.95 : 0;
      mk.ring.material.color.set(hl && hl.bad ? 0xff8080 : sel ? 0xffc83d : 0xffffff);
      if (chips[h.id]) chips[h.id].position.y = 0.2 + lift;
      if (mk.label) { root.remove(mk.label); mk.label = null; }
      if (hl && hl.label) {
        const tex = new THREE.CanvasTexture(paintLabel(hl.label, { pill: 'rgba(20,16,30,.82)', size: 50 })); tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
        sp.scale.set(1.5, 0.56, 1); sp.position.set(x, 1.05, z - 0.2); sp.renderOrder = 6;
        root.add(sp); mk.label = sp;
      }
    });
    pulse = !!view.highlight;
    // a gold pin over the chosen hex
    if (view.selected != null && S.hexes[view.selected]) {
      const [x, z] = hexXZ(S.hexes[view.selected]);
      pin.visible = true; pin.position.set(x, 1.6, z);
    } else pin.visible = false;
  }

  /* camera: drag to turn, pinch or wheel to zoom, tap to pick, double tap to reset */
  let az = 0, pol = 0.86, dist = 24, distBase = 24, pulse = false;
  function fit() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    camera.aspect = w / h;
    const vfov = camera.fov * Math.PI / 180, need = 18.2; // map width with some room
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    distBase = Math.max(need / 2 / Math.tan(hfov / 2), 16.5 / 2 / Math.tan(vfov / 2)) * 1.02;
    camera.updateProjectionMatrix();
  }
  function place() {
    const d = distBase * dist / 24;
    camera.position.set(Math.sin(az) * Math.sin(pol) * d, Math.cos(pol) * d, Math.cos(az) * Math.sin(pol) * d);
    camera.lookAt(0, 0, 0.4);
  }
  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    fit(); place();
  }
  const ptrs = new Map();
  let downAt = 0, downX = 0, downY = 0, moved = false, pinch0 = 0, dist0 = 24, lastTap = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { downAt = performance.now(); downX = e.clientX; downY = e.clientY; moved = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist; moved = true; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) { dist = clamp(dist0 * pinch0 / d, 9, 30); place(); }
      return;
    }
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) moved = true;
    if (!moved) return;
    az -= (e.clientX - prev.x) * 0.006;
    pol = clamp(pol - (e.clientY - prev.y) * 0.005, 0.25, 1.15);
    place();
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size || moved) return;
    if (performance.now() - downAt > 450) return;
    const now = performance.now();
    const picked = pick(e.clientX, e.clientY);
    if (picked == null && now - lastTap < 320) { az = 0; pol = 0.86; dist = 24; place(); }
    lastTap = now;
    if (picked != null && cb) cb(picked);
  }
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); dist = clamp(dist * (e.deltaY > 0 ? 1.08 : 0.93), 9, 30); place(); }, { passive: false });
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  function pick(cx, cy) {
    const r = el.getBoundingClientRect();
    v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hits = ray.intersectObjects(hexMeshes.concat(Object.values(bases)), true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && o.userData.hex == null && o.parent) o = o.parent;
      if (o && o.userData.hex != null) return o.userData.hex;
      for (const k in bases) if (bases[k] === o || bases[k].children.includes(hit.object)) return +k;
    }
    return null;
  }

  let raf = 0, alive = true;
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const s = t / 1000;
    core.rotation.y = s * 0.4;
    core.position.y = 1.9 + Math.sin(s * 1.3) * 0.08;
    orbs.forEach((o, i) => { const a = o.userData.a + s * 0.6; o.position.set(Math.cos(a) * 1.25, 1.7 + Math.sin(s * 2 + i) * 0.12, Math.sin(a) * 1.25); });
    if (pin.visible) pin.position.y = 1.55 + Math.sin(s * 4) * 0.12;
    if (pulse) {
      const k = 0.55 + 0.45 * Math.sin(s * 5);
      Object.values(marks).forEach((m) => { if (m.ring.material.opacity > 0) m.ring.scale.setScalar(0.96 + k * 0.06); });
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i], p = clamp((performance.now() - a.t0) / a.ms, 0, 1);
      a.obj.position.y = a.fromY + (a.toY - a.fromY) * easeOut(p);
      if (p >= 1) anims.splice(i, 1);
    }
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(resize); ro.observe(host);

  return {
    kind: '3d',
    update,
    onHex(fn) { cb = fn; },
    resize,
    resetView() { az = 0; pol = 0.86; dist = 24; place(); },
    zoom(f) { dist = clamp(dist * f, 9, 30); place(); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.9); },
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.remove(); }
  };
}

/* ------------------------------------------------------------------ the flat map (no WebGL) */
export function createFlatMap(host) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-9.6 -8.4 19.2 16.8');
  svg.style.width = '100%'; svg.style.height = '100%'; svg.style.background = '#1d1924'; svg.style.touchAction = 'manipulation';
  host.appendChild(svg);
  let cb = null, built = false, lastN = 0;
  const cells = {};
  function hexPts(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push((cx + r * Math.cos(a)).toFixed(3) + ',' + (cy + r * Math.sin(a)).toFixed(3)); }
    return pts.join(' ');
  }
  function build(S) {
    svg.innerHTML = '';
    const core = document.createElementNS(NS, 'circle');
    core.setAttribute('cx', 0); core.setAttribute('cy', 0); core.setAttribute('r', 1.6); core.setAttribute('fill', '#7fb2ff'); core.setAttribute('opacity', '.5');
    svg.appendChild(core);
    S.hexes.forEach((h) => {
      const [x, z] = hexXZ(h);
      const g = document.createElementNS(NS, 'g');
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', hexPts(x, z, 0.96));
      poly.setAttribute('fill', h.covered ? '#3b3a3f' : AREA_COLORS[h.area]);
      poly.setAttribute('stroke', '#2a2530'); poly.setAttribute('stroke-width', '0.06');
      g.appendChild(poly);
      if (!h.covered) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', z - 0.35); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '0.38');
        t.setAttribute('font-weight', '900'); t.setAttribute('fill', '#2a2018');
        t.textContent = h.bonus.map((a) => ({ coin: '¢', gem: '◆', vp: '★', res: '研', work: '労', mine: '採', water: '水' }[a.t] + (a.n || 1))).join(' ');
        g.appendChild(t);
      }
      const chip = document.createElementNS(NS, 'circle');
      chip.setAttribute('cx', x); chip.setAttribute('cy', z + 0.3); chip.setAttribute('r', 0.3);
      g.appendChild(chip);
      const base = document.createElementNS(NS, 'rect');
      base.setAttribute('x', x - 0.3); base.setAttribute('y', z - 0.15); base.setAttribute('width', 0.6); base.setAttribute('height', 0.6); base.setAttribute('rx', 0.08);
      base.setAttribute('stroke', '#111'); base.setAttribute('stroke-width', '0.05');
      g.appendChild(base);
      const ring = document.createElementNS(NS, 'polygon');
      ring.setAttribute('points', hexPts(x, z, 0.86)); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#fff2b0'); ring.setAttribute('stroke-width', '0.12');
      g.appendChild(ring);
      const lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', x); lab.setAttribute('y', z - 0.95); lab.setAttribute('text-anchor', 'middle'); lab.setAttribute('font-size', '0.42');
      lab.setAttribute('font-weight', '900'); lab.setAttribute('fill', '#fff'); lab.setAttribute('stroke', '#000'); lab.setAttribute('stroke-width', '0.08'); lab.setAttribute('paint-order', 'stroke');
      g.appendChild(lab);
      g.addEventListener('click', () => { if (cb) cb(h.id); });
      svg.appendChild(g);
      cells[h.id] = { chip, base, ring, lab };
    });
    built = true; lastN = S.n;
  }
  function update(S, view) {
    view = view || {};
    if (!built || lastN !== S.n) build(S);
    S.hexes.forEach((h) => {
      const c = cells[h.id];
      if (h.token) { const t = S.toks[h.token]; c.chip.setAttribute('fill', t.color === 'W' ? '#d9b54a' : CHIP_FILL[t.color]); c.chip.style.display = ''; }
      else c.chip.style.display = 'none';
      if (h.base != null) { c.base.setAttribute('fill', SEAT_COLORS[h.base]); c.base.style.display = ''; } else c.base.style.display = 'none';
      const hl = view.highlight && view.highlight[h.id];
      c.ring.style.display = hl || view.selected === h.id ? '' : 'none';
      c.ring.setAttribute('stroke', hl && hl.bad ? '#ff8080' : view.selected === h.id ? '#fff' : '#fff2b0');
      c.lab.textContent = hl && hl.label ? hl.label : '';
    });
  }
  return { kind: '2d', update, onHex(fn) { cb = fn; }, resize() {}, resetView() {}, zoom() {}, snapshot() { return null; }, dispose() { svg.remove(); } };
}
