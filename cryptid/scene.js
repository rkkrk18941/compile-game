/* クリプティッド — the 3D table (three.js r160 from a CDN). Every texture is painted here on canvases; no image files.
   World units: one hex has circumradius 1. x to the right, z towards the viewer, y up. The board is 12 x 9 flat-topped
   hexes built from the six map tiles (each a 6 x 3 cardboard piece, laid turned 180 degrees when the setup says so).
   The page tells the scene what to show (setBoard, setPieces, highlights) and asks for animations (dropPiece, movePawn,
   reveal). Rendering happens only when something moves. */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.CRY_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const D = window.CRY_DATA;
const SQ3 = Math.sqrt(3);
const TOP = 0.2;                         // height of the tile surface
const OX = 8.25, OZ = 7.361;           // board centre offsets: hex (0,0) sits at (-OX, -OZ)
const BOARD_W = 18.5, BOARD_D = SQ3 * 9.5;

export const PIECE_HEX = { yellow: '#f4c21b', red: '#d8352b', green: '#2aa84a', cyan: '#1fb4cc', purple: '#8a47cc' };
const STRUCT_HEX = { white: '#ecebe4', green: '#2f9a4c', blue: '#2f6cc4', black: '#2e2f33' };
const TERRAIN_BASE = ['#2f8c45', '#efc23a', '#3a86c6', '#4a2d5b', '#9c9b96'];

export function hexCenter(h) {
  const x = h % 12, y = (h / 12) | 0;
  return { x: 1.5 * x - OX, z: SQ3 * (y + 0.5 * (x & 1)) - OZ };
}
function pixelToHex(X, Z) {
  const px = X + OX, pz = Z + OZ;
  const q = (2 / 3) * px, r = (-1 / 3) * px + (SQ3 / 3) * pz;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy <= dz) rz = -rx - ry;
  const col = rx, row = rz + ((col - (col & 1)) >> 1);
  if (col < 0 || col > 11 || row < 0 || row > 8) return -1;
  return row * 12 + col;
}

/* neighbour offsets per edge (edge k runs from corner k to corner k+1; corner k at angle 60k degrees, z down) */
const EDGE_NB = [
  [[1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],   // even column
  [[1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0]]      // odd column
];
function corner(cx, cz, r, k) { const a = Math.PI / 3 * k; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; }

/* ------------------------------------------------------------------ small seeded noise for painting */
function rngFrom(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ tile artwork */
const TW = 9.5, TD = SQ3 * 3.5;          // tile size in world units (local frame: x right, z down, origin top-left)
function tileLocal(r, c) { return { x: 1.5 * c + 1, z: SQ3 * (r + 0.5 * (c & 1)) + SQ3 / 2 }; }

function hexPath(ctx, cx, cy, s) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const p = corner(cx, cy, s, k); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
  ctx.closePath();
}
function blob(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

function paintForest(ctx, cx, cy, s, rnd) {
  const g = ctx.createRadialGradient(cx - s * 0.2, cy - s * 0.3, s * 0.1, cx, cy, s);
  g.addColorStop(0, '#3d9c52'); g.addColorStop(1, '#246f37');
  ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, 2 * s, 2 * s);
  const greens = ['#1e5f30', '#25753a', '#2f8a45', '#3a9e52', '#4bb062'];
  const n = 30;
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * s * 0.95; pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95, s * (0.11 + rnd() * 0.1)]); }
  pts.sort((p, q) => p[1] - q[1]);
  for (const p of pts) blob(ctx, p[0] + s * 0.03, p[1] + s * 0.05, p[2], 'rgba(10,40,18,0.35)');
  for (const p of pts) {
    blob(ctx, p[0], p[1], p[2], greens[(rnd() * 3) | 0]);
    blob(ctx, p[0] - p[2] * 0.25, p[1] - p[2] * 0.3, p[2] * 0.55, greens[3 + ((rnd() * 2) | 0)]);
  }
}
function paintDesert(ctx, cx, cy, s, rnd) {
  const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  g.addColorStop(0, '#f6cf4a'); g.addColorStop(1, '#e5b12c');
  ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, 2 * s, 2 * s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const y = cy - s + (i + 0.5 + (rnd() - 0.5) * 0.4) * (2 * s / 7), amp = s * (0.06 + rnd() * 0.08);
    ctx.beginPath(); ctx.moveTo(cx - s, y);
    ctx.bezierCurveTo(cx - s * 0.4, y - amp, cx + s * 0.2, y + amp, cx + s, y - amp * 0.5);
    ctx.strokeStyle = 'rgba(255,244,200,0.55)'; ctx.lineWidth = s * 0.05; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s, y + s * 0.06);
    ctx.bezierCurveTo(cx - s * 0.4, y - amp + s * 0.06, cx + s * 0.2, y + amp + s * 0.06, cx + s, y - amp * 0.5 + s * 0.06);
    ctx.strokeStyle = 'rgba(176,118,22,0.28)'; ctx.lineWidth = s * 0.035; ctx.stroke();
  }
  for (let i = 0; i < 40; i++) blob(ctx, cx + (rnd() - 0.5) * 2 * s, cy + (rnd() - 0.5) * 2 * s, s * 0.012, 'rgba(150,100,20,0.35)');
}
function paintWater(ctx, cx, cy, s, rnd) {
  const g = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.1);
  g.addColorStop(0, '#4a9ad8'); g.addColorStop(1, '#2c75b8');
  ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, 2 * s, 2 * s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = cx + (rnd() - 0.5) * 1.7 * s, y = cy + (rnd() - 0.5) * 1.5 * s, w = s * (0.12 + rnd() * 0.16);
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w / 2, y - w * 0.35, x, y); ctx.quadraticCurveTo(x + w / 2, y + w * 0.35, x + w, y);
    ctx.strokeStyle = i % 3 ? 'rgba(220,240,255,0.55)' : 'rgba(18,70,130,0.35)'; ctx.lineWidth = s * 0.028; ctx.stroke();
  }
}
function paintSwamp(ctx, cx, cy, s, rnd) {
  const g = ctx.createRadialGradient(cx + s * 0.2, cy + s * 0.1, s * 0.1, cx, cy, s * 1.05);
  g.addColorStop(0, '#5a3a6c'); g.addColorStop(1, '#3e2450');
  ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, 2 * s, 2 * s);
  for (let i = 0; i < 6; i++) {
    const x = cx + (rnd() - 0.5) * 1.4 * s, y = cy + (rnd() - 0.5) * 1.3 * s;
    ctx.fillStyle = 'rgba(28,14,40,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, s * (0.12 + rnd() * 0.14), s * (0.06 + rnd() * 0.06), rnd() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,130,190,0.35)'; ctx.lineWidth = s * 0.015; ctx.stroke();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = cx + (rnd() - 0.5) * 1.5 * s, y = cy + (rnd() - 0.5) * 1.4 * s;
    for (let j = 0; j < 4; j++) {
      ctx.beginPath(); ctx.moveTo(x + j * s * 0.025, y);
      ctx.lineTo(x + j * s * 0.025 + (rnd() - 0.5) * s * 0.06, y - s * (0.08 + rnd() * 0.08));
      ctx.strokeStyle = j % 2 ? '#8aa65a' : '#6f8a45'; ctx.lineWidth = s * 0.016; ctx.stroke();
    }
  }
}
function paintMountain(ctx, cx, cy, s, rnd) {
  const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  g.addColorStop(0, '#b3b2ac'); g.addColorStop(1, '#85847e');
  ctx.fillStyle = g; ctx.fillRect(cx - s, cy - s, 2 * s, 2 * s);
  const peaks = [];
  for (let i = 0; i < 4; i++) peaks.push([cx + (rnd() - 0.5) * 1.3 * s, cy + (rnd() - 0.5) * 1.1 * s, s * (0.22 + rnd() * 0.18)]);
  peaks.sort((a, b) => a[1] - b[1]);
  for (const p of peaks) {
    const [x, y, w] = p, h = w * 0.9;
    ctx.fillStyle = 'rgba(40,40,36,0.25)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.15, y + h * 0.15, w * 1.0, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cfcec8'; ctx.beginPath(); ctx.moveTo(x - w, y + h * 0.2); ctx.lineTo(x - w * 0.05, y - h); ctx.lineTo(x, y + h * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a7972'; ctx.beginPath(); ctx.moveTo(x - w * 0.05, y - h); ctx.lineTo(x + w, y + h * 0.2); ctx.lineTo(x, y + h * 0.25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(50,50,46,0.4)'; ctx.lineWidth = s * 0.015;
    ctx.beginPath(); ctx.moveTo(x - w, y + h * 0.2); ctx.lineTo(x - w * 0.05, y - h); ctx.lineTo(x + w, y + h * 0.2); ctx.stroke();
  }
  for (let i = 0; i < 26; i++) blob(ctx, cx + (rnd() - 0.5) * 1.8 * s, cy + (rnd() - 0.5) * 1.7 * s, s * (0.012 + rnd() * 0.02), rnd() < 0.5 ? 'rgba(60,60,55,0.35)' : 'rgba(230,230,225,0.4)');
}
const PAINT = [paintForest, paintDesert, paintWater, paintSwamp, paintMountain];

function drawPaw(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.18, s * 0.34, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  [[-0.38, -0.12], [-0.13, -0.32], [0.13, -0.32], [0.38, -0.12]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, s * 0.12, s * 0.15, 0, 0, Math.PI * 2); ctx.fill(); });
}

function paintTile(id, px) {
  const tile = D.TILES[id];
  const cv = document.createElement('canvas');
  cv.width = Math.round(TW * px); cv.height = Math.round(TD * px);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3b3227'; ctx.fillRect(0, 0, cv.width, cv.height);
  const rnd = rngFrom(id * 7919 + 17);
  const terr = (r, c) => D.TERRAIN_CODE[tile.t[r][c]], anim = (r, c) => D.ANIMAL_CODE[tile.a[r][c]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const L = tileLocal(r, c), cx = L.x * px, cy = L.z * px, s = px * 1.002;
    ctx.save(); hexPath(ctx, cx, cy, s); ctx.clip();
    PAINT[terr(r, c)](ctx, cx, cy, s, rnd);
    ctx.restore();
  }
  // printed hex lines
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const L = tileLocal(r, c);
    hexPath(ctx, L.x * px, L.z * px, px * 0.985);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = px * 0.03; ctx.stroke();
    hexPath(ctx, L.x * px, L.z * px, px * 0.95);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = px * 0.02; ctx.stroke();
  }
  // animal territory outlines (bear: black dashes, cougar: red), drawn just inside the territory
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const a = anim(r, c);
    if (!a) continue;
    const L = tileLocal(r, c), cx = L.x * px, cy = L.z * px;
    for (let k = 0; k < 6; k++) {
      const d = EDGE_NB[c & 1][k], nc = c + d[0], nr = r + d[1];
      const same = nc >= 0 && nc < 6 && nr >= 0 && nr < 3 && anim(nr, nc) === a;
      if (same) continue;
      const p0 = corner(cx, cy, px * 0.83, k), p1 = corner(cx, cy, px * 0.83, k + 1);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      ctx.lineCap = a === 1 ? 'butt' : 'round';
      if (a === 1) { ctx.setLineDash([px * 0.17, px * 0.1]); ctx.strokeStyle = '#141414'; ctx.lineWidth = px * 0.085; }
      else { ctx.setLineDash([]); ctx.strokeStyle = '#e1251b'; ctx.lineWidth = px * 0.075; }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // a small paw mark on one hex of each territory
  const marked = {};
  for (let r = 2; r >= 0; r--) for (let c = 0; c < 6; c++) {
    const a = anim(r, c);
    if (!a || marked[a]) continue;
    marked[a] = 1;
    const L = tileLocal(r, c);
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(L.x * px, L.z * px + px * 0.55, px * 0.16, 0, Math.PI * 2); ctx.fill();
    drawPaw(ctx, L.x * px, L.z * px + px * 0.55, px * 0.13, a === 1 ? '#141414' : '#e1251b');
    ctx.restore();
  }
  // the tile number, printed on its top-left hex
  const L0 = tileLocal(0, 0), nx = L0.x * px - px * 0.5, ny = L0.z * px + px * 0.05;
  ctx.fillStyle = 'rgba(250,246,232,0.92)'; ctx.beginPath(); ctx.arc(nx, ny, px * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,20,0.7)'; ctx.lineWidth = px * 0.025; ctx.stroke();
  ctx.fillStyle = '#2a2018'; ctx.font = `900 ${Math.round(px * 0.26)}px "Zen Kaku Gothic New", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(id), nx, ny + px * 0.01);
  return cv;
}

/* the outline of a 6 x 3 tile in its local frame (x right, z down, origin top-left) */
function tileOutline() {
  const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
  const edges = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const L = tileLocal(r, c);
    for (let k = 0; k < 6; k++) {
      const d = EDGE_NB[c & 1][k], nc = c + d[0], nr = r + d[1];
      if (nc >= 0 && nc < 6 && nr >= 0 && nr < 3) continue;
      edges.push([corner(L.x, L.z, 1, k), corner(L.x, L.z, 1, k + 1)]);
    }
  }
  const byStart = new Map();
  edges.forEach((e) => byStart.set(key(e[0]), e));
  const loop = [edges[0][0]];
  let cur = edges[0];
  for (let i = 0; i < edges.length; i++) {
    loop.push(cur[1]);
    cur = byStart.get(key(cur[1]));
    if (!cur || cur === edges[0]) break;
  }
  return loop;
}

function woodCanvas() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const ctx = cv.getContext('2d'), rnd = rngFrom(4242);
  ctx.fillStyle = '#4a2f1d'; ctx.fillRect(0, 0, 1024, 1024);
  const plankH = 128;
  for (let p = 0; p < 8; p++) {
    const y0 = p * plankH, tone = 0.85 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(78 * tone)},${Math.round(50 * tone)},${Math.round(31 * tone)})`;
    ctx.fillRect(0, y0, 1024, plankH);
    for (let i = 0; i < 46; i++) {
      const y = y0 + rnd() * plankH, amp = 2 + rnd() * 6;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x / (90 + rnd() * 60) + i) * amp);
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(30,16,8,0.18)' : 'rgba(140,96,60,0.12)'; ctx.lineWidth = 1 + rnd() * 2.2; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(15,8,4,0.55)'; ctx.fillRect(0, y0, 1024, 3);
  }
  return cv;
}

/* ------------------------------------------------------------------ the scene */
export function createScene(host, opts = {}) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.keepFrame });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x0d1512, 1);
  let hostEl = host;
  hostEl.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.display = 'block';
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let speed = opts.speed || 1;

  /* tweens and on-demand rendering */
  const tweens = new Set();
  let frameReq = 0, needs = true;
  function kick() { needs = true; if (!frameReq) frameReq = requestAnimationFrame(frame); }
  function tween(dur, fn, ease = easeIO) {
    return new Promise((res) => {
      dur = dur / speed;
      if (dur <= 0) { fn(1); kick(); res(); return; }
      tweens.add({ t0: performance.now(), dur, fn, ease, res });
      kick();
    });
  }
  const wait = (d) => tween(d, () => {});
  const loops = new Set(); // continuous effects (pulses)

  const world = new T.Scene();
  world.fog = new T.Fog(0x0d1512, 38, 80);
  const cam = new T.PerspectiveCamera(30, 1, 0.5, 200);
  world.add(new T.HemisphereLight(0xfff1dd, 0x2a3328, 1.0));
  const sun = new T.DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(-9, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  world.add(sun);
  const fill = new T.DirectionalLight(0xbcd6ff, 0.35); fill.position.set(12, 8, -6); world.add(fill);

  // table
  const woodTex = new T.CanvasTexture(woodCanvas());
  woodTex.colorSpace = T.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(4, 4); woodTex.anisotropy = ANISO;
  const table = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ map: woodTex, roughness: 0.78, metalness: 0 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; world.add(table);
  // a soft glow under the board, like a lamp over the table
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 256;
  { const g = glowCv.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,214,150,0.45)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const glowTex = new T.CanvasTexture(glowCv); glowTex.colorSpace = T.SRGBColorSpace;
  const glow = new T.Mesh(new T.PlaneGeometry(46, 40), new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.005; world.add(glow);

  const boardGroup = new T.Group(); world.add(boardGroup);
  const propGroup = new T.Group(); world.add(propGroup);
  const structGroup = new T.Group(); world.add(structGroup);
  const pieceGroup = new T.Group(); world.add(pieceGroup);
  const fxGroup = new T.Group(); world.add(fxGroup);

  /* shared geometry */
  const outline = tileOutline();
  const tileShape = new T.Shape();
  outline.forEach((p, i) => { const x = p[0] - TW / 2, y = -(p[1] - TD / 2); if (i) tileShape.lineTo(x, y); else tileShape.moveTo(x, y); });
  const tileGeo = new T.ExtrudeGeometry(tileShape, { depth: TOP - 0.03, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelOffset: -0.04, bevelSegments: 2, curveSegments: 1 });
  tileGeo.rotateX(-Math.PI / 2);
  { const pos = tileGeo.attributes.position, uv = tileGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + TW / 2) / TW, (TD / 2 - pos.getZ(i)) / TD);
    uv.needsUpdate = true; tileGeo.computeVertexNormals(); }
  const sideMat = new T.MeshStandardMaterial({ color: 0x2b241c, roughness: 0.9 });
  const tileTex = {};
  function tileMaterial(id) {
    if (!tileTex[id]) {
      const tex = new T.CanvasTexture(paintTile(id, opts.lowRes ? 72 : 112));
      tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = ANISO;
      tileTex[id] = new T.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
    }
    return tileTex[id];
  }

  const hexShape = new T.Shape();
  for (let k = 0; k < 6; k++) { const p = corner(0, 0, 1, k); if (k) hexShape.lineTo(p[0], -p[1]); else hexShape.moveTo(p[0], -p[1]); }
  const hexFillGeo = new T.ShapeGeometry(hexShape); hexFillGeo.rotateX(-Math.PI / 2);
  const ringShape = new T.Shape();
  for (let k = 0; k < 6; k++) { const p = corner(0, 0, 0.97, k); if (k) ringShape.lineTo(p[0], -p[1]); else ringShape.moveTo(p[0], -p[1]); }
  const hole = new T.Path();
  for (let k = 5; k >= 0; k--) { const p = corner(0, 0, 0.8, k); if (k < 5) hole.lineTo(p[0], -p[1]); else hole.moveTo(p[0], -p[1]); }
  ringShape.holes.push(hole);
  const ringGeo = new T.ShapeGeometry(ringShape); ringGeo.rotateX(-Math.PI / 2);

  // per-hex overlays: a fill (regions, legal spaces) and a ring (selection, last action)
  const fills = [], rings = [];
  for (let h = 0; h < 108; h++) {
    const c = hexCenter(h);
    const f = new T.Mesh(hexFillGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    f.position.set(c.x, TOP + 0.012, c.z); f.visible = false; f.renderOrder = 2; fxGroup.add(f); fills.push(f);
    const r = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xff3d8b, transparent: true, opacity: 1, depthWrite: false }));
    r.position.set(c.x, TOP + 0.02, c.z); r.visible = false; r.renderOrder = 3; fxGroup.add(r); rings.push(r);
  }

  /* pieces */
  const discGeo = new T.CylinderGeometry(0.33, 0.33, 0.13, 32);
  const discEdge = new T.CylinderGeometry(0.345, 0.345, 0.125, 32);
  const cubeGeo = new T.BoxGeometry(0.42, 0.42, 0.42);
  const cubeEdge = new T.BoxGeometry(0.44, 0.44, 0.44);
  const pieceMats = {};
  const darkEdge = new T.MeshBasicMaterial({ color: 0x0b0b0b, side: T.BackSide });
  function pieceMat(color) {
    if (!pieceMats[color]) pieceMats[color] = new T.MeshStandardMaterial({ color: PIECE_HEX[color], roughness: 0.55, metalness: 0 });
    return pieceMats[color];
  }
  function makePiece(kind, color) {
    const g = new T.Group();
    const m = new T.Mesh(kind === 'disc' ? discGeo : cubeGeo, pieceMat(color));
    m.castShadow = true; m.receiveShadow = true;
    const e = new T.Mesh(kind === 'disc' ? discEdge : cubeEdge, darkEdge);
    g.add(e); g.add(m);
    g.userData.h = kind === 'disc' ? 0.13 : 0.42;
    return g;
  }
  // where pieces sit inside a hex: the disc stack and cube at the centre (a bit lower when a structure is there)
  function stackSpot(h) {
    const c = hexCenter(h), hasStruct = boardInfo && boardInfo.struct[h] >= 0;
    return { x: c.x + (hasStruct ? 0.16 : 0.04), z: c.z + (hasStruct ? 0.2 : 0.08) };
  }
  const stacks = []; // per hex: { discs: [{seat, obj}], cube: {seat, obj} }
  for (let h = 0; h < 108; h++) stacks.push({ discs: [], cube: null });
  let seatColors = [];

  function layoutStack(h) {
    const st = stacks[h], sp = stackSpot(h);
    let y = TOP;
    st.discs.forEach((d) => { d.obj.position.set(sp.x, y + 0.065, sp.z); y += 0.13; });
    if (st.cube) st.cube.obj.position.set(sp.x, y + 0.21, sp.z);
  }

  /* structures */
  const stoneGeo = new T.CylinderGeometry(0.25, 0.27, 0.62, 8);
  const shackShape = new T.Shape(); shackShape.moveTo(-0.34, 0); shackShape.lineTo(0.34, 0); shackShape.lineTo(0, 0.5); shackShape.closePath();
  const shackGeo = new T.ExtrudeGeometry(shackShape, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
  shackGeo.translate(0, 0, -0.17);
  const structMats = {};
  function structMat(color) {
    if (!structMats[color]) structMats[color] = new T.MeshStandardMaterial({ color: STRUCT_HEX[color], roughness: color === 'black' ? 0.5 : 0.62, metalness: 0 });
    return structMats[color];
  }

  /* props: little trees, rocks and reeds, kept to the edge of each hex */
  const treeGeo = (() => { const g1 = new T.ConeGeometry(0.15, 0.36, 7); g1.translate(0, 0.25, 0); const g2 = new T.CylinderGeometry(0.03, 0.04, 0.1, 5); g2.translate(0, 0.05, 0); return [g1, g2]; })();
  const treeMat = new T.MeshStandardMaterial({ color: 0x1f6a33, roughness: 0.85, flatShading: true });
  const trunkMat = new T.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const rockGeo = new T.DodecahedronGeometry(0.16, 0); rockGeo.scale(1, 0.62, 1);
  const rockMat = new T.MeshStandardMaterial({ color: 0x8d8c86, roughness: 0.95, flatShading: true });
  const deadGeo = new T.CylinderGeometry(0.012, 0.03, 0.34, 4); deadGeo.translate(0, 0.17, 0);
  const deadMat = new T.MeshStandardMaterial({ color: 0x2d1d33, roughness: 1 });

  let boardInfo = null;
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse && c.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); } }

  function setBoard(spec, info) {
    boardInfo = info;
    clearGroup(boardGroup); clearGroup(propGroup); clearGroup(structGroup);
    for (let s = 0; s < 6; s++) {
      const t = spec.tiles[s], tc = s % 2, tr = (s / 2) | 0;
      const m = new T.Mesh(tileGeo, [tileMaterial(t.id), sideMat]);
      m.position.set(3.75 + 9 * tc - OX, 0, 2.165 + 3 * SQ3 * tr - OZ);
      if (t.flip) m.rotation.y = Math.PI;
      m.receiveShadow = true; m.castShadow = true;
      boardGroup.add(m);
    }
    // props
    const rnd = rngFrom(77);
    const treeSpots = [], rockSpots = [], deadSpots = [];
    const spots = [[-0.66, 0.2], [0.58, 0.4], [-0.25, 0.64], [0.7, 0.02], [-0.62, -0.38], [0.05, -0.68]];
    for (let h = 0; h < 108; h++) {
      const t = info.terrain[h], c = hexCenter(h);
      const free = spots.filter((p) => !(info.struct[h] >= 0 && p[0] < 0 && p[1] < 0));
      if (t === 0) for (let i = 0; i < 3; i++) { const p = free[(h + i * 2) % free.length]; treeSpots.push([c.x + p[0] + (rnd() - 0.5) * 0.08, c.z + p[1] + (rnd() - 0.5) * 0.08, 0.8 + rnd() * 0.45, rnd() * 6]); }
      if (t === 4) for (let i = 0; i < 2; i++) { const p = free[(h * 3 + i * 3) % free.length]; rockSpots.push([c.x + p[0], c.z + p[1], 0.8 + rnd() * 0.6, rnd() * 6]); }
      if (t === 3 && h % 2 === 0) { const p = free[h % free.length]; deadSpots.push([c.x + p[0], c.z + p[1], 0.8 + rnd() * 0.5, rnd() * 6]); }
    }
    const dummy = new T.Object3D();
    function inst(geo, mat, list, y0) {
      if (!list.length) return;
      const im = new T.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => { dummy.position.set(p[0], y0, p[1]); dummy.scale.setScalar(p[2]); dummy.rotation.set(0, p[3], 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.castShadow = true; im.receiveShadow = true; propGroup.add(im);
    }
    inst(treeGeo[0], treeMat, treeSpots, TOP); inst(treeGeo[1], trunkMat, treeSpots, TOP);
    inst(rockGeo, rockMat, rockSpots, TOP + 0.04);
    inst(deadGeo, deadMat, deadSpots, TOP);
    // structures
    spec.structs.forEach((st) => {
      if (!st) return;
      const c = hexCenter(st.h), x = c.x - 0.42, z = c.z - 0.3;
      const mesh = new T.Mesh(st.type === 'stone' ? stoneGeo : shackGeo, structMat(st.color));
      if (st.type === 'stone') mesh.position.set(x, TOP + 0.31, z);
      else { mesh.position.set(x, TOP, z); mesh.rotation.y = 0.35; }
      mesh.castShadow = true; mesh.receiveShadow = true;
      structGroup.add(mesh);
    });
    kick();
  }

  function setSeatColors(cols) { seatColors = cols.slice(); }
  function setPieces(cube, discs) {
    clearGroup(pieceGroup);
    for (let h = 0; h < 108; h++) {
      const st = stacks[h]; st.discs = []; st.cube = null;
      (discs[h] || []).forEach((s) => { const o = makePiece('disc', seatColors[s]); pieceGroup.add(o); st.discs.push({ seat: s, obj: o }); });
      if (cube[h] >= 0) { const o = makePiece('cube', seatColors[cube[h]]); pieceGroup.add(o); st.cube = { seat: cube[h], obj: o }; }
      layoutStack(h);
    }
    kick();
  }
  async function dropPiece(kind, seat, h) {
    const st = stacks[h], o = makePiece(kind, seatColors[seat]);
    pieceGroup.add(o);
    if (kind === 'disc') st.discs.push({ seat, obj: o }); else st.cube = { seat, obj: o };
    layoutStack(h);
    const end = o.position.clone(), start = end.clone(); start.y += 2.2;
    const spin = kind === 'cube' ? (Math.random() - 0.5) * 1.2 : 0;
    o.position.copy(start);
    await tween(380, (t) => {
      o.position.y = start.y + (end.y - start.y) * t;
      o.rotation.y = spin * (1 - t);
    }, easeInQuad);
    await tween(140, (t) => { o.position.y = end.y + Math.sin(t * Math.PI) * 0.07; }, linear);
    o.position.copy(end); o.rotation.y = 0;
    kick();
  }

  /* the pawn: a black wooden pawn that marks the space being asked about or searched */
  const pawnPts = [];
  [[0, 0], [0.26, 0], [0.27, 0.05], [0.2, 0.1], [0.14, 0.2], [0.1, 0.42], [0.16, 0.48], [0.1, 0.52], [0.12, 0.58], [0.15, 0.68], [0.12, 0.78], [0.05, 0.83], [0, 0.84]].forEach((p) => pawnPts.push(new T.Vector2(p[0], p[1])));
  const pawn = new T.Mesh(new T.LatheGeometry(pawnPts, 24), new T.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.35, metalness: 0.05 }));
  pawn.castShadow = true; pawn.visible = false; world.add(pawn);
  let pawnHex = -1;
  function pawnSpot(h) { const c = hexCenter(h); return { x: c.x + 0.5, z: c.z - 0.34 }; }
  async function movePawn(h, instant) {
    if (h < 0) { pawn.visible = false; pawnHex = -1; kick(); return; }
    const to = pawnSpot(h);
    if (!pawn.visible || instant) { pawn.position.set(to.x, TOP, to.z); pawn.visible = true; pawnHex = h; kick(); if (!instant) await tween(160, () => {}); return; }
    if (pawnHex === h) return;
    const from = pawn.position.clone();
    pawnHex = h;
    const dist = Math.hypot(to.x - from.x, to.z - from.z), lift = Math.min(1.6, 0.4 + dist * 0.12);
    await tween(Math.min(720, 260 + dist * 40), (t) => {
      pawn.position.set(from.x + (to.x - from.x) * t, TOP + Math.sin(t * Math.PI) * lift, from.z + (to.z - from.z) * t);
    }, easeIO);
    kick();
  }

  /* highlights */
  const hl = { legal: new Set(), region: new Map(), sel: -1, last: -1, mark: new Map() };
  function applyHighlights() {
    for (let h = 0; h < 108; h++) {
      const f = fills[h], r = rings[h];
      let fv = false, rv = false;
      if (hl.region.has(h)) { f.material.color.set(hl.region.get(h)); f.material.opacity = 0.42; fv = true; }
      else if (hl.legal.has(h)) { f.material.color.set(0xfff4c8); f.material.opacity = 0.32; fv = true; }
      if (h === hl.sel) { r.material.color.set(0xff3d8b); r.material.opacity = 1; rv = true; r.scale.setScalar(1); }
      else if (hl.mark.has(h)) { r.material.color.set(hl.mark.get(h)); r.material.opacity = 0.95; rv = true; r.scale.setScalar(1); }
      else if (h === hl.last) { r.material.color.set(0xffffff); r.material.opacity = 0.75; rv = true; r.scale.setScalar(0.96); }
      f.visible = fv; r.visible = rv;
    }
    kick();
  }
  function setLegal(list) { hl.legal = new Set(list || []); applyHighlights(); }
  function setRegion(list, color) { hl.region = new Map(); (list || []).forEach((h) => hl.region.set(h, color || 0xff3d8b)); applyHighlights(); }
  function setRegionMap(map) { hl.region = new Map(map || []); applyHighlights(); }
  function setSelected(h) { hl.sel = h; applyHighlights(); }
  function setLast(h) { hl.last = h; applyHighlights(); }
  function setMarks(map) { hl.mark = new Map(map || []); applyHighlights(); }

  /* the reveal: a column of light over the habitat */
  let beam = null;
  async function reveal(h) {
    if (beam) { fxGroup.remove(beam); beam = null; }
    const c = hexCenter(h);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,240,190,0.95)'); gr.addColorStop(0.35, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
    beam = new T.Mesh(new T.CylinderGeometry(0.85, 0.95, 6, 6, 1, true), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    beam.position.set(c.x, TOP + 3, c.z); beam.scale.y = 0.01; fxGroup.add(beam);
    hl.mark.set(h, 0xffd36a); applyHighlights();
    await tween(900, (t) => { beam.scale.y = Math.max(0.01, t); beam.position.y = TOP + 3 * t; }, easeOutCubic);
    kick();
  }
  function clearReveal() { if (beam) { fxGroup.remove(beam); beam = null; } kick(); }

  /* camera: framed to the board, pan with one finger, pinch to zoom, double-tap to reset */
  const view = { tx: 0, tz: 0.2, zoom: 1, tilt: 0.72, yaw: 0, fit: 30 };
  let top = false;
  function placeCamera() {
    const tilt = top ? 0.08 : view.tilt;      // angle from straight down
    const d = view.fit * view.zoom;
    cam.position.set(view.tx + Math.sin(view.yaw) * Math.sin(tilt) * d, Math.cos(tilt) * d, view.tz + Math.cos(view.yaw) * Math.sin(tilt) * d);
    cam.lookAt(view.tx, 0, view.tz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
  let baseTilt = 0.72, centreZ = 0.6;
  function fitDistance() {
    // smallest distance at which the whole board (plus a margin) is in view, with the board centred on screen
    const pts = [[-BOARD_W / 2 - 0.4, -BOARD_D / 2 - 0.4], [BOARD_W / 2 + 0.4, -BOARD_D / 2 - 0.4], [-BOARD_W / 2 - 0.4, BOARD_D / 2 + 0.4], [BOARD_W / 2 + 0.4, BOARD_D / 2 + 0.4]];
    const save = { ...view };
    const portrait = cam.aspect < 0.9;
    baseTilt = portrait ? 0.5 : 0.72;
    view.tilt = baseTilt; view.zoom = 1; view.tx = 0; view.yaw = 0;
    // leave room for the bar of buttons over the top of the board
    const hgt = Math.max(1, hostEl.clientHeight || 1), topPad = Math.min(0.4, 2 * (opts.topBar || 56) / hgt), lowY = -0.96, highY = 0.98 - topPad;
    const fits = () => pts.every(([x, z]) => { const v = new T.Vector3(x, TOP, z).project(cam); return Math.abs(v.x) < 0.97 && v.y < highY && v.y > lowY && v.z < 1; });
    const search = () => { let lo = 5, hi = 140; for (let i = 0; i < 26; i++) { view.fit = (lo + hi) / 2; placeCamera(); if (fits()) hi = view.fit; else lo = view.fit; } view.fit = hi; placeCamera(); };
    view.tz = top ? 0 : 0.6;
    for (let pass = 0; pass < 4; pass++) {
      search();
      let mn = 9, mx = -9;
      pts.forEach(([x, z]) => { const v = new T.Vector3(x, TOP, z).project(cam); mn = Math.min(mn, v.y); mx = Math.max(mx, v.y); });
      const off = (mn + mx) / 2 - (highY + lowY) / 2;   // >0: the board sits too high on screen
      if (Math.abs(off) < 0.01) break;
      view.tz -= off * BOARD_D * 0.5;
    }
    centreZ = view.tz;
    const fit = view.fit;
    Object.assign(view, save); view.fit = fit; view.tilt = baseTilt;
  }
  function resetView() { view.tx = 0; view.tz = centreZ; view.zoom = 1; view.yaw = 0; view.tilt = baseTilt; placeCamera(); kick(); }
  function setTopView(on) { top = !!on; fitDistance(); resetView(); }
  function resize() {
    const w = hostEl.clientWidth || 1, hgt = hostEl.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    renderer.setSize(w, hgt, false);
    canvas.style.width = w + 'px'; canvas.style.height = hgt + 'px';
    cam.aspect = w / hgt;
    cam.fov = w / hgt < 0.9 ? 36 : 30;
    cam.updateProjectionMatrix();
    fitDistance(); if (!orbiting) resetView(); else placeCamera(); kick();
  }
  function clampView() {
    view.zoom = Math.min(1.25, Math.max(0.32, view.zoom));
    view.tx = Math.min(BOARD_W / 2, Math.max(-BOARD_W / 2, view.tx));
    view.tz = Math.min(BOARD_D / 2, Math.max(-BOARD_D / 2, view.tz));
  }

  /* input */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
  function hexAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const p = new T.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return -1;
    return pixelToHex(p.x, p.z);
  }
  function groundAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const p = new T.Vector3();
    return ray.ray.intersectPlane(plane, p) ? p : null;
  }
  let onTap = null, onHover = null;
  const ptrs = new Map();
  let gesture = null, lastTapAt = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), button: e.button });
    if (ptrs.size === 1) gesture = { kind: 'maybeTap', moved: 0, rot: e.button === 2 };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: view.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (onHover && e.pointerType === 'mouse') onHover(hexAt(e.clientX, e.clientY)); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.zoom = gesture.z0 * gesture.d0 / Math.max(20, d);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - gesture.mx, my - gesture.my); gesture.mx = mx; gesture.my = my;
      clampView(); placeCamera(); kick();
      return;
    }
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    if (gesture.kind === 'maybeTap' && gesture.moved > 9) gesture.kind = gesture.rot ? 'rotate' : 'pan';
    if (gesture.kind === 'pan') { panBy(dx, dy); clampView(); placeCamera(); kick(); }
    else if (gesture.kind === 'rotate') { view.yaw -= dx * 0.006; view.tilt = Math.min(1.2, Math.max(0.35, view.tilt - dy * 0.004)); placeCamera(); kick(); }
  });
  function panBy(dx, dy) {
    const rect = canvas.getBoundingClientRect();
    const a = groundAt(rect.left + rect.width / 2, rect.top + rect.height / 2), b = groundAt(rect.left + rect.width / 2 + dx, rect.top + rect.height / 2 + dy);
    if (!a || !b) return;
    view.tx -= b.x - a.x; view.tz -= b.z - a.z;
  }
  function endPtr(e) {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p) return;
    if (gesture && gesture.kind === 'maybeTap' && ptrs.size === 0 && performance.now() - p.t0 < 600) {
      const now = performance.now();
      lastTapAt = now;
      const h = hexAt(e.clientX, e.clientY);
      if (onTap) onTap(h, e);
    }
    if (ptrs.size === 0) gesture = null;
    else if (ptrs.size === 1) gesture = { kind: 'pan', moved: 99 };
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom *= Math.exp(e.deltaY * 0.0012); clampView(); placeCamera(); kick(); }, { passive: false });
  canvas.addEventListener('dblclick', () => resetView());

  /* frame loop */
  function frame(now) {
    frameReq = 0;
    let active = false;
    for (const tw of [...tweens]) {
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      tw.fn(tw.ease(t));
      if (t >= 1) { tweens.delete(tw); tw.res(); } else active = true;
    }
    for (const lp of loops) if (lp(now)) active = true;
    if (needs || active) { renderer.render(world, cam); needs = false; }
    if (active) frameReq = requestAnimationFrame(frame);
  }
  // a gentle pulse on the selected ring
  loops.add((now) => { const r = hl.sel >= 0 ? rings[hl.sel] : null; if (!r) return false; const s = 1 + Math.sin(now / 220) * 0.035; r.scale.set(s, 1, s); return true; });

  // the title screen: a slow turn around the board
  let orbiting = false;
  loops.add((now) => { if (!orbiting) return false; view.yaw = Math.sin(now / 9000) * 0.5; view.tilt = 0.85; placeCamera(); return true; });
  function setOrbit(on) { orbiting = !!on; if (!on) { view.yaw = 0; fitDistance(); resetView(); } kick(); }
  function setHost(el) { if (hostEl === el) return; hostEl = el; el.appendChild(canvas); resize(); }

  window.addEventListener('resize', resize);
  resize();
  setTopView(false);

  return {
    setBoard, setSeatColors, setPieces, dropPiece, movePawn,
    setLegal, setRegion, setRegionMap, setSelected, setLast, setMarks, reveal, clearReveal,
    resize, resetView, setTopView, isTop: () => top, setOrbit, setHost,
    setSpeed: (s) => { speed = s || 1; },
    onTap: (f) => { onTap = f; }, onHover: (f) => { onHover = f; },
    wait, kick, hexScreen: (h) => { const c = hexCenter(h), v = new T.Vector3(c.x, TOP, c.z).project(cam), r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; },
    renderer, canvas,
    setCamera: (o) => { Object.assign(view, o); placeCamera(); kick(); },
    _view: () => ({ ...view, top, centreZ, baseTilt, aspect: cam.aspect, fov: cam.fov, pos: cam.position.toArray() })
  };
}

function linear(t) { return t; }
function easeIO(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeInQuad(t) { return t * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
