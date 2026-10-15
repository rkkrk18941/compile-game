/* ハシッコ・セブン — the 3D table (three.js r160 from a CDN). Every texture is drawn here; no image files.
   World units: a card is 1.0 wide and 1.4 long, y is up. The local player always sits at +z (near the camera),
   the others around the far side of an oval table in turn order (clockwise seen from above: left, far, right).
   Every rack and every hand runs from its smallest card on the left to its largest on the right, as seen from here.

   A view from the engine (engine.viewFor) is shown with setView(view, hints): every card animates from where it
   was to where the view puts it. Cards this player may not see are plain backs: the backs standing in the other
   players' racks and the face-down field. hints.from[card] = { seat, end } | { field } names the back a card that
   turns up came from; hints.to[card] the back it goes back into. */

import { AVATARS, cleanAvatar, createAnimal, disposeAnimal } from './avatars.js?v=animals-1';

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.HSV_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const E = window.HSV_ENG;

/* ------------------------------------------------------------------ cards and colours */
const CW = 1.0, CH = 1.4, CT = 0.04, CR = 0.11;
export const NUM_COLORS = [null, '#e0443a', '#ee8424', '#d49a10', '#6aa83a', '#2c9a5a', '#119f9d', '#e3b23c', '#2f8be0', '#4058cf', '#8053cc', '#cc4a9c', '#8d5a36'];
const NUM_DARK = [null, '#8c2018', '#93460a', '#7f5a03', '#3b6516', '#145a32', '#075c5a', '#6b4a06', '#154d8c', '#1e2f80', '#47237f', '#7c1f5b', '#4f2e16'];
export const SEAT_COLORS = ['#ffcf5a', '#ff7a6b', '#5cc2ff', '#7fdc8a', '#c79bff'];
const NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
const FELTS = { teal: ['#14595d', '#0f474b', '#1d6d70'], green: ['#1f6b47', '#175a3b', '#2a7d55'], wine: ['#6b2333', '#561a28', '#80303f'] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(x, X, y, w, h, r) { x.beginPath(); x.moveTo(X + r, y); x.arcTo(X + w, y, X + w, y + h, r); x.arcTo(X + w, y + h, X, y + h, r); x.arcTo(X, y + h, X, y, r); x.arcTo(X, y, X + w, y, r); x.closePath(); }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
}
function star(x, cx, cy, R, r, pts, rot = -Math.PI / 2) {
  x.beginPath();
  for (let k = 0; k < pts * 2; k++) { const a = rot + k * Math.PI / pts, q = k % 2 ? r : R; const px = cx + Math.cos(a) * q, py = cy + Math.sin(a) * q; k ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.closePath();
}
function sparkle(x, cx, cy, s) {   // a four-point twinkle
  x.beginPath(); x.moveTo(cx, cy - s); x.quadraticCurveTo(cx, cy, cx + s, cy); x.quadraticCurveTo(cx, cy, cx, cy + s); x.quadraticCurveTo(cx, cy, cx - s, cy); x.quadraticCurveTo(cx, cy, cx, cy - s); x.fill();
}

/* the faces: 12 numbers in a 4 x 3 atlas */
const AC = 4, AR = 3, CELL_W = 320, CELL_H = 448, AW = AC * CELL_W, AH = AR * CELL_H;
function cellOf(v) { return [(v - 1) % AC, Math.floor((v - 1) / AC)]; }
function numeral(x, txt, cx, cy, size, fill, stroke, lw, underline) {
  x.font = '700 ' + Math.round(size) + 'px ' + NUM_FONT;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; x.strokeText(txt, cx, cy); }
  x.fillStyle = fill; x.fillText(txt, cx, cy);
  if (underline) {
    const w = size * 0.42, h = size * 0.075, y = cy + size * 0.42;
    if (stroke) { x.lineWidth = lw; x.strokeStyle = stroke; rr(x, cx - w / 2, y, w, h, h / 2); x.stroke(); }
    x.fillStyle = fill; rr(x, cx - w / 2, y, w, h, h / 2); x.fill();
  }
}
function drawFace(x, v, X, Y, w, h) {
  const gold = v === 7, col = NUM_COLORS[v], dark = NUM_DARK[v];
  x.save();
  rr(x, X + 3, Y + 3, w - 6, h - 6, w * 0.11); x.clip();
  if (gold) {
    const g = x.createLinearGradient(X, Y, X + w, Y + h);
    g.addColorStop(0, '#fff1b8'); g.addColorStop(0.28, '#f2c94c'); g.addColorStop(0.52, '#c98d1c'); g.addColorStop(0.74, '#f6d873'); g.addColorStop(1, '#b97a14');
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    // fine guilloche rings
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
    for (let r = 20; r < h; r += 18) { x.beginPath(); x.arc(X + w / 2, Y + h / 2, r, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,0.9)';
    [[0.2, 0.3, 14], [0.8, 0.24, 10], [0.74, 0.74, 16], [0.24, 0.78, 9], [0.52, 0.12, 7], [0.5, 0.9, 8]].forEach(([a, b, s]) => sparkle(x, X + w * a, Y + h * b, s));
  } else {
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, shade(col, 0.1)); g.addColorStop(1, shade(col, -0.14));
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    // polka dots
    x.fillStyle = 'rgba(255,255,255,0.08)';
    for (let j = 0; j < 12; j++) for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(X + (i + (j % 2) * 0.5) * w / 8, Y + j * h / 11, w * 0.022, 0, Math.PI * 2); x.fill(); }
  }
  // the badge behind the big number
  const bx = X + w / 2, by = Y + h * 0.53, br = w * 0.36;
  x.fillStyle = gold ? 'rgba(255,250,225,0.55)' : 'rgba(255,255,255,0.2)';
  if (gold) { star(x, bx, by, br * 1.18, br * 0.8, 7); x.fill(); }
  else { x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill(); }
  const txt = String(v), big = (txt.length > 1 ? 0.5 : 0.62) * w, ul = v === 6 || v === 9;
  numeral(x, txt, bx, by + big * 0.04, big, gold ? '#5b3605' : '#fffdf6', gold ? '#fff6d6' : dark, w * 0.055, ul);
  // corner indices
  for (const top of [true, false]) {
    x.save();
    if (!top) { x.translate(X + w, Y + h); x.rotate(Math.PI); x.translate(-X, -Y); }
    const s = w * (txt.length > 1 ? 0.2 : 0.23);
    numeral(x, txt, X + w * 0.17, Y + h * 0.1, s, gold ? '#5b3605' : '#fffdf6', gold ? 'rgba(255,246,214,0.9)' : dark, w * 0.032, ul);
    x.restore();
  }
  x.restore();
  // edge
  x.save(); x.strokeStyle = gold ? 'rgba(255,248,220,0.95)' : 'rgba(255,253,246,0.85)'; x.lineWidth = w * 0.028;
  rr(x, X + w * 0.05, Y + w * 0.05, w - w * 0.1, h - w * 0.1, w * 0.07); x.stroke(); x.restore();
}
function drawAtlas(cv) {
  const x = cv.getContext('2d');
  x.clearRect(0, 0, AW, AH);
  for (let v = 1; v <= 12; v++) { const [i, j] = cellOf(v); drawFace(x, v, i * CELL_W, j * CELL_H, CELL_W, CELL_H); }
}
function drawBack() {
  const w = 320, h = 448, c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#343a86'); g.addColorStop(1, '#1b1f52');
  rr(x, 0, 0, w, h, 30); x.fillStyle = g; x.fill();
  x.save(); rr(x, 0, 0, w, h, 30); x.clip();
  x.strokeStyle = 'rgba(236,196,92,0.16)'; x.lineWidth = 3;
  for (let k = -h; k < w + h; k += 24) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.moveTo(k + h, 0); x.lineTo(k, h); x.stroke(); }
  x.restore();
  x.strokeStyle = 'rgba(236,196,92,0.95)'; x.lineWidth = 8; rr(x, 16, 16, w - 32, h - 32, 18); x.stroke();
  x.lineWidth = 3; rr(x, 30, 30, w - 60, h - 60, 12); x.stroke();
  x.fillStyle = '#1b1f52'; x.beginPath(); x.arc(w / 2, h / 2, 92, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ecc45c'; star(x, w / 2, h / 2, 86, 46, 7); x.fill();
  x.fillStyle = '#1b1f52'; x.font = '700 64px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('7', w / 2, h / 2 + 5);
  return c;
}
function drawShine() {
  const c = canvas(256, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(0.58, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return c;
}
function sparkTex() {
  const c = canvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
}
function woodTex(w, h) {
  const c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6f3f22'); g.addColorStop(0.5, '#8b532d'); g.addColorStop(1, '#5f341b');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '45,22,8' : '190,140,90') + ',' + (0.05 + Math.random() * 0.1) + ')';
    x.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * h; x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= w; px += w / 8) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 3 + (Math.random() - 0.5) * 2);
    x.stroke();
  }
  return c;
}

/* ------------------------------------------------------------------ table layouts
   seats: [x, z, yaw] for the other players in turn order after me (yaw turns a seat to face the middle; a side
   seat faces it square on). grid: [columns, rows] of the field, field: its centre z and spacing.
   Every other seat, in its own frame (+z toward the middle): the rack at 0, the trios in a row in front of it,
   the cards it has shown this turn further in, the player's figure behind.                                  */
const SIDE = Math.PI / 2 - 0.22;
const SEATS = {
  wide: {
    2: [[0, -4.2, 0]],
    3: [[-3.0, -3.7, 0.35], [3.0, -3.7, -0.35]],
    4: [[-4.5, -1.7, 1.0], [0, -4.5, 0], [4.5, -1.7, -1.0]],
    5: [[-4.75, -1.0, 1.15], [-1.85, -4.5, 0.1], [1.85, -4.5, -0.1], [4.75, -1.0, -1.15]]
  },
  tall: {
    2: [[0, -4.9, 0]],
    3: [[-1.95, -4.9, 0.06], [1.95, -4.9, -0.06]],
    4: [[-3.1, -1.6, SIDE], [0, -5.15, 0], [3.1, -1.6, -SIDE]],
    5: [[-3.1, -1.45, SIDE], [-1.45, -5.15, 0.04], [1.45, -5.15, -0.04], [3.1, -1.45, -SIDE]]
  }
};
const GRID = { wide: { 2: [5, 2], 3: [3, 3], 4: [4, 2], 5: [3, 2] }, tall: { 2: [5, 2], 3: [3, 3], 4: [2, 4], 5: [2, 3] } };
const FIELD = {
  wide: { 2: [-0.35, 1.18, 1.58], 3: [-0.55, 1.18, 1.56], 4: [-0.45, 1.18, 1.58], 5: [-0.45, 1.2, 1.58] },
  tall: { 2: [-1.0, 1.15, 1.56], 3: [-0.7, 1.15, 1.5], 4: [-1.05, 1.12, 1.5], 5: [-0.8, 1.12, 1.5] }
};
function makeLayout(n, mode) {
  const tall = mode === 'tall';
  const [cols, rows] = GRID[mode][n];
  const [cz, px, pz] = FIELD[mode][n];
  const L = {
    mode, n, cols, rows,
    field: { cx: 0, cz, px, pz },
    me: tall ? { z: 4.55, sc: 1.18, pitch: 0.98, maxW: 6.2, tilt: 0.88, frontZ: 2.62, frontSc: 0.92, trioX: -2.95, trioZ: 1.75, trioDx: 0, trioDz: 0.62 }
      : { z: 4.15, sc: 1.08, pitch: 0.96, maxW: 7.6, tilt: 0.95, frontZ: 2.45, frontSc: 0.9, trioX: -4.1, trioZ: 2.45, trioDx: 0.78, trioDz: 0 },
    opp: { sc: tall ? 0.56 : 0.6, pitch: 0.3, maxW: tall ? 2.0 : 2.3, front: 1.42, frontSc: tall ? 0.78 : 0.82, frontDx: tall ? 0.84 : 0.88, trio: 0.64, trioSc: 0.5, trioDx: 0.58, pawn: -0.95 },
    seats: [null].concat(SEATS[mode][n].map(([x, z, yaw]) => ({ x, z, yaw }))),
    pitch: tall ? 1.05 : 0.92, fov: tall ? 34 : 32
  };
  if (n === 2) { L.me.pitch = tall ? 0.62 : 0.76; L.opp.maxW = 3.0; }
  if (n === 3) { L.me.pitch = tall ? 0.76 : 0.92; L.opp.maxW = tall ? 2.4 : 2.6; }
  // the table: an oval around everything
  let rx = 0, rz = 0;
  L.seats.forEach((S) => {
    if (!S) return;
    const c = Math.abs(Math.cos(S.yaw)), s = Math.abs(Math.sin(S.yaw));
    rx = Math.max(rx, Math.abs(S.x) + c * (L.opp.maxW / 2 + 0.6) + s * 1.3);
    rz = Math.max(rz, Math.abs(S.z) + s * (L.opp.maxW / 2 + 0.6) + c * 1.3);
  });
  rx = Math.max(rx, (cols * px) / 2 + 1.4, L.me.maxW / 2 + 0.9, Math.abs(L.me.trioX) + 0.9);
  rz = Math.max(rz, L.me.z + 0.6, (rows * pz) / 2 + Math.abs(cz) + 1.2);
  L.table = { rx: rx + 0.3, rz: rz + 0.15 };
  return L;
}

/* ------------------------------------------------------------------ the scene */
export function createScene(host, opts = {}) {
  const lin = (hex) => new T.Color(hex);
  const tex = (c, aniso) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; if (aniso) t.anisotropy = aniso; return t; };
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.keep });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x0c0f12, 1);
  host.appendChild(renderer.domElement);
  const ANISO = renderer.capabilities.getMaxAnisotropy();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.5, 200);
  const AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1);
  const qAx = (a) => new T.Quaternion().setFromAxisAngle(AX, a);
  const qAy = (a) => new T.Quaternion().setFromAxisAngle(AY, a);
  const Q_DOWN = new T.Quaternion().setFromAxisAngle(AZ, Math.PI);
  const LEAN = 0.86;      // rack cards lean back this far from upright, their backs up toward the room
  const qRack = (yaw) => qAy(yaw).multiply(qAx(-(Math.PI / 2 + LEAN)));
  const qFlat = (yaw) => qAy(yaw || 0);
  const qDown = (yaw) => qAy(yaw || 0).multiply(Q_DOWN);

  // light
  scene.add(new T.HemisphereLight(0xfff1dc, 0x1c2a2e, 2.0));
  const key = new T.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(3, 18, 8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 4, far: 40 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new T.DirectionalLight(0xcfe2ff, 0.7); fill.position.set(-9, 7, -5); scene.add(fill);
  const lamp = new T.PointLight(0xffd8a0, 18, 26, 1.6); lamp.position.set(0, 7.5, 0); scene.add(lamp);

  // table: wooden apron, felt, padded rail
  let feltName = opts.felt && FELTS[opts.felt] ? opts.felt : 'teal';
  const woodMap = tex(woodTex(1024, 128)); woodMap.wrapS = woodMap.wrapT = T.RepeatWrapping; woodMap.repeat.set(6, 1);
  const woodMat = new T.MeshStandardMaterial({ map: woodMap, roughness: 0.55, metalness: 0.05 });
  const apron = new T.Mesh(new T.CylinderGeometry(1, 1, 0.55, 120, 1, true), woodMat); apron.position.y = -0.3; apron.castShadow = true; scene.add(apron);
  const top = new T.Mesh(new T.CircleGeometry(1, 120), woodMat); top.rotation.x = -Math.PI / 2; top.position.y = -0.012; top.receiveShadow = true; scene.add(top);
  const feltCanvas = canvas(1600, 1200);
  let feltTex = null;
  const felt = new T.Mesh(new T.CircleGeometry(1, 120), new T.MeshStandardMaterial({ roughness: 0.95 }));
  felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
  const railMat = new T.MeshStandardMaterial({ color: lin('#3a2216'), roughness: 0.42, metalness: 0.08 });
  let rail = null;
  const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshBasicMaterial({ color: lin(0x0c0f12) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; scene.add(floor);

  let LY = makeLayout(4, 'wide');
  let mode = 'wide', nPlayers = 4;
  function layTable() {
    const { rx, rz } = LY.table;
    felt.scale.set(rx, rz, 1);
    top.scale.set(rx + 0.55, rz + 0.55, 1);
    apron.scale.set(rx + 0.55, 1, rz + 0.55);
    if (rail) { scene.remove(rail); rail.geometry.dispose(); }
    class Oval extends T.Curve { getPoint(t, o = new T.Vector3()) { return o.set(Math.cos(t * Math.PI * 2) * (rx + 0.26), 0.07, Math.sin(t * Math.PI * 2) * (rz + 0.26)); } }
    rail = new T.Mesh(new T.TubeGeometry(new Oval(), 240, 0.27, 14, true), railMat);
    rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
    drawFelt();
    const span = Math.max(rx, rz) + 1;
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span }); key.shadow.camera.updateProjectionMatrix();
  }
  function drawFelt() {
    const { rx, rz } = LY.table, F = FELTS[feltName];
    feltCanvas.width = 1600; feltCanvas.height = Math.round(1600 * rz / rx);
    const x = feltCanvas.getContext('2d', { willReadFrequently: true }), W = feltCanvas.width, H = feltCanvas.height;
    const k = W / (2 * rx);
    const P = (wx, wz) => [(wx + rx) * k, (wz + rz) * k];
    x.fillStyle = F[0]; x.fillRect(0, 0, W, H);
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - 0.5) * 12; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    x.putImageData(img, 0, 0);
    const g = x.createRadialGradient(W / 2, H / 2, W * 0.08, W / 2, H / 2, W * 0.58);
    g.addColorStop(0, 'rgba(255,240,210,0.09)'); g.addColorStop(1, 'rgba(0,0,0,0.32)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // the field: a soft rounded panel with a dashed edge
    const fw = LY.cols * LY.field.px + 0.5, fh = LY.rows * LY.field.pz + 0.3;
    const a = P(LY.field.cx - fw / 2, LY.field.cz - fh / 2);
    x.fillStyle = F[1]; x.globalAlpha = 0.55; rr(x, a[0], a[1], fw * k, fh * k, 0.3 * k); x.fill(); x.globalAlpha = 1;
    x.strokeStyle = 'rgba(255,236,190,0.22)'; x.lineWidth = 0.03 * k; x.setLineDash([0.14 * k, 0.1 * k]);
    rr(x, a[0], a[1], fw * k, fh * k, 0.3 * k); x.stroke(); x.setLineDash([]);
    // a little spot for every field card
    for (let i = 0; i < LY.cols * LY.rows; i++) {
      const p = fieldPos(i); const q = P(p.x - 0.53, p.z - 0.73);
      x.strokeStyle = 'rgba(255,236,190,0.13)'; x.lineWidth = 0.022 * k; rr(x, q[0], q[1], 1.06 * k, 1.46 * k, 0.12 * k); x.stroke();
    }
    // a seven-pointed star in the middle of the field panel, very faint
    const c = P(LY.field.cx, LY.field.cz);
    x.fillStyle = 'rgba(255,236,190,0.05)'; star(x, c[0], c[1], 1.6 * k, 0.9 * k, 7); x.fill();
    // a lamp-lit arc in front of every seat
    LY.seats.forEach((S, r) => {
      if (!S) return;
      const p = P(S.x + Math.sin(S.yaw) * LY.opp.front, S.z + Math.cos(S.yaw) * LY.opp.front);
      const gg = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], 1.5 * k); gg.addColorStop(0, 'rgba(255,240,210,0.07)'); gg.addColorStop(1, 'rgba(255,240,210,0)');
      x.fillStyle = gg; x.fillRect(p[0] - 1.6 * k, p[1] - 1.6 * k, 3.2 * k, 3.2 * k);
    });
    const mp = P(0, LY.me.frontZ);
    const gm = x.createRadialGradient(mp[0], mp[1], 0, mp[0], mp[1], 2.2 * k); gm.addColorStop(0, 'rgba(255,240,210,0.08)'); gm.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = gm; x.fillRect(mp[0] - 2.3 * k, mp[1] - 2.3 * k, 4.6 * k, 4.6 * k);
    if (feltTex) feltTex.dispose();
    feltTex = tex(feltCanvas, ANISO);
    felt.material.map = feltTex; felt.material.needsUpdate = true;
  }

  // card geometry
  const atlasCanvas = canvas(AW, AH);
  drawAtlas(atlasCanvas);
  const atlas = tex(atlasCanvas, ANISO);
  const faceMat = new T.MeshStandardMaterial({ map: atlas, roughness: 0.46, metalness: 0 });
  const goldMat = new T.MeshStandardMaterial({ map: atlas, roughness: 0.32, metalness: 0.35, emissive: lin('#3a2400'), emissiveIntensity: 0.6 });
  const dimMat = new T.MeshStandardMaterial({ map: atlas, roughness: 0.6, color: lin('#8a8a8a') });
  const backMat = new T.MeshStandardMaterial({ map: tex(drawBack(), ANISO), roughness: 0.5 });
  const edgeMat = new T.MeshStandardMaterial({ color: lin('#f3ead6'), roughness: 0.6 });
  const shineTex = tex(drawShine()); shineTex.wrapS = shineTex.wrapT = T.RepeatWrapping;
  const shineMat = new T.MeshBasicMaterial({ map: shineTex, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending });
  const shape = new T.Shape();
  { const w = CW, h = CH, r = CR, x0 = -w / 2, y0 = -h / 2;
    shape.moveTo(x0 + r, y0); shape.lineTo(x0 + w - r, y0); shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); shape.lineTo(x0 + w, y0 + h - r); shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    shape.lineTo(x0 + r, y0 + h); shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0); }
  const bodyGeo = new T.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, -CT / 2, 0);
  const decal = new T.ShapeGeometry(shape, 6);
  { const uv = decal.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + CW / 2) / CW, (uv.getY(i) + CH / 2) / CH); }
  const faceGeos = [null];
  for (let v = 1; v <= 12; v++) {
    const g = decal.clone(); g.rotateX(-Math.PI / 2); g.translate(0, CT / 2 + 0.0015, 0);
    const [i, j] = cellOf(v), uv = g.attributes.uv;
    const u0 = (i * CELL_W) / AW, u1 = ((i + 1) * CELL_W) / AW, v1 = 1 - (j * CELL_H) / AH, v0 = 1 - ((j + 1) * CELL_H) / AH;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    faceGeos.push(g);
  }
  const shineGeo = decal.clone(); shineGeo.rotateX(-Math.PI / 2); shineGeo.translate(0, CT / 2 + 0.003, 0);
  const backGeo = decal.clone(); backGeo.rotateX(Math.PI / 2); backGeo.translate(0, -CT / 2 - 0.0015, 0);
  const topBackGeo = decal.clone(); topBackGeo.rotateX(-Math.PI / 2); topBackGeo.translate(0, CT / 2 + 0.0015, 0);
  const haloShape = new T.Shape();
  { const w = CW + 0.22, h = CH + 0.22, r = CR + 0.11, x0 = -w / 2, y0 = -h / 2;
    haloShape.moveTo(x0 + r, y0); haloShape.lineTo(x0 + w - r, y0); haloShape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); haloShape.lineTo(x0 + w, y0 + h - r); haloShape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    haloShape.lineTo(x0 + r, y0 + h); haloShape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); haloShape.lineTo(x0, y0 + r); haloShape.quadraticCurveTo(x0, y0, x0 + r, y0);
    const hole = new T.Path(); const w2 = CW - 0.02, h2 = CH - 0.02, r2 = CR, a0 = -w2 / 2, b0 = -h2 / 2;
    hole.moveTo(a0 + r2, b0); hole.lineTo(a0 + w2 - r2, b0); hole.quadraticCurveTo(a0 + w2, b0, a0 + w2, b0 + r2); hole.lineTo(a0 + w2, b0 + h2 - r2); hole.quadraticCurveTo(a0 + w2, b0 + h2, a0 + w2 - r2, b0 + h2);
    hole.lineTo(a0 + r2, b0 + h2); hole.quadraticCurveTo(a0, b0 + h2, a0, b0 + h2 - r2); hole.lineTo(a0, b0 + r2); hole.quadraticCurveTo(a0, b0, a0 + r2, b0);
    haloShape.holes.push(hole); }
  const haloGeo = new T.ShapeGeometry(haloShape, 6);
  const haloUp = haloGeo.clone(); haloUp.rotateX(-Math.PI / 2); haloUp.translate(0, CT / 2 + 0.004, 0);
  const haloDown = haloGeo.clone(); haloDown.rotateX(Math.PI / 2); haloDown.translate(0, -CT / 2 - 0.004, 0);
  const HALO = { tgt: lin('#7fe0ff'), sel: lin('#ffd76a'), bad: lin('#ff5b5b'), match: lin('#ffd76a') };
  function makeHalo(geo) { const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: HALO.tgt, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })); m.visible = false; m.renderOrder = 3; return m; }

  /* one object for every real card: shown wherever this player may see it */
  const cards = [];
  for (let c = 0; c < 36; c++) {
    const v = E.num(c), g = new T.Group();
    const body = new T.Mesh(bodyGeo, edgeMat); body.castShadow = true; body.receiveShadow = true;
    const face = new T.Mesh(faceGeos[v], v === 7 ? goldMat : faceMat); face.receiveShadow = true;
    const back = new T.Mesh(backGeo, backMat);
    const halo = makeHalo(haloUp);
    g.add(body, face, back, halo);
    if (v === 7) { const sh = new T.Mesh(shineGeo, shineMat); sh.renderOrder = 2; g.add(sh); }
    g.visible = false; scene.add(g);
    const o = { c, v, g, face, halo, shown: false, anim: null, place: null, hl: null, lift: 0 };
    body.userData.card = o; face.userData.card = o; back.userData.card = o;
    cards.push(o);
  }
  /* plain backs: the other players' racks and the face-down field */
  const generics = [];
  function newGeneric() {
    const g = new T.Group();
    const body = new T.Mesh(bodyGeo, edgeMat); body.castShadow = true; body.receiveShadow = true;
    const back = new T.Mesh(backGeo, backMat), front = new T.Mesh(topBackGeo, backMat);
    const halo = makeHalo(haloUp), halo2 = makeHalo(haloDown);
    g.add(body, back, front, halo, halo2); scene.add(g);
    const o = { g, anim: null, halo, halo2, hl: null, busy: false };
    body.userData.gen = o; back.userData.gen = o; front.userData.gen = o;
    generics.push(o);
    return o;
  }
  const genPool = [];
  function takeGeneric() { const o = genPool.pop() || newGeneric(); o.g.visible = true; o.hl = null; o.halo.visible = false; o.halo2.visible = false; o.anim = null; o.onDone = null; return o; }
  function dropGeneric(o) { if (!o) return; o.g.visible = false; o.anim = null; o.onDone = null; o.rack = null; o.slot = null; genPool.push(o); }

  // racks and avatars for the other players
  const rackMat = new T.MeshStandardMaterial({ map: woodMap, roughness: 0.5, metalness: 0.05, color: lin('#c9a27a') });
  const seats = [];   // by absolute player index: { rack: mesh, pawn, objs: [generic], resMin, resMax }
  let playerAvatars = [];
  const avatarAt = (p) => cleanAvatar(playerAvatars[p] || AVATARS[p % AVATARS.length].id);
  const ringMat = new T.MeshBasicMaterial({ color: lin('#ffd76a'), transparent: true, opacity: 0.6, depthWrite: false });
  function buildSeats() {
    seats.forEach((S) => { if (S) { scene.remove(S.group); S.objs.forEach(dropGeneric); disposeAnimal(S.pawn); S.rack.geometry.dispose(); S.ring.geometry.dispose(); S.ring.material.dispose(); } });
    seats.length = 0;
    for (let p = 0; p < nPlayers; p++) {
      const group = new T.Group(); scene.add(group);
      const rack = new T.Mesh(new T.BoxGeometry(1, 0.14, 0.36), rackMat); rack.castShadow = true; rack.receiveShadow = true;
      const pawn = createAnimal(T, avatarAt(p)); pawn.scale.setScalar(.90);
      const ring = new T.Mesh(new T.RingGeometry(0.42, 0.52, 40), ringMat.clone()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006; ring.visible = false;
      group.add(rack, pawn, ring);
      seats.push({ p, group, rack, pawn, ring, objs: [], resMin: 0, resMax: 0, bob: 0, jump: -9 });
    }
  }
  function setAvatars(ids) {
    playerAvatars = ids.map(cleanAvatar);
    seats.forEach((S) => {
      if (S.pawn.userData.avatar === avatarAt(S.p)) return;
      const old = S.pawn, pawn = createAnimal(T, avatarAt(S.p));
      pawn.scale.copy(old.scale); pawn.position.copy(old.position); pawn.quaternion.copy(old.quaternion); pawn.visible=old.visible;
      S.group.remove(old); disposeAnimal(old); S.group.add(pawn); S.pawn=pawn;
    });
  }

  /* ------------------------------------------------------------------ positions */
  const relOf = (p) => (p - me + nPlayers) % nPlayers;
  function seatFrame(p) { return LY.seats[relOf(p)]; }
  function seatPoint(S, lx, ly, lz) { const c = Math.cos(S.yaw), s = Math.sin(S.yaw); return new T.Vector3(S.x + lx * c + lz * s, ly, S.z - lx * s + lz * c); }
  function fieldPos(i) {
    const c = i % LY.cols, r = Math.floor(i / LY.cols);
    return { x: LY.field.cx + (c - (LY.cols - 1) / 2) * LY.field.px, z: LY.field.cz + (r - (LY.rows - 1) / 2) * LY.field.pz };
  }
  function fieldPlace(i, up) {
    const f = fieldPos(i), jit = (((i * 37) % 11) - 5) * 0.012;
    return { p: new T.Vector3(f.x, CT / 2 + (up ? 0.05 : 0.002), f.z), q: up ? qFlat(jit) : qDown(jit), s: 1 };
  }
  function rackPitch(k) { const O = LY.opp; return k > 1 ? Math.min(O.pitch, (O.maxW - CW * O.sc) / (k - 1)) : 0; }
  function rackSlot(p, j, k) {
    const S = seatFrame(p), O = LY.opp;
    const lx = (j - (k - 1) / 2) * rackPitch(k), half = (CH / 2) * O.sc;
    const nrm = j * 0.007;
    return { p: seatPoint(S, lx, 0.12 + Math.cos(LEAN) * half + Math.sin(LEAN) * nrm, -Math.sin(LEAN) * half + Math.cos(LEAN) * nrm), q: qRack(S.yaw), s: O.sc };
  }
  function rackWidth(k) { return rackPitch(k) * Math.max(0, k - 1) + CW * LY.opp.sc; }
  function handPlace(j, k) {
    const M = LY.me, pitch = k > 1 ? Math.min(M.pitch, M.maxW / (k - 1)) : 0;
    const x = (j - (k - 1) / 2) * pitch, half = (CH / 2) * M.sc, t = M.tilt, nrm = j * 0.008;
    return { p: new T.Vector3(x, 0.02 + Math.sin(t) * half + Math.cos(t) * nrm, M.z - Math.cos(t) * half + Math.sin(t) * nrm), q: qAx(t), s: M.sc };
  }
  function frontPlace(p, j, k) {
    if (p === me) { const M = LY.me, dx = 1.06 * M.frontSc; return { p: new T.Vector3((j - (k - 1) / 2) * dx, CT / 2 + 0.01, M.frontZ), q: qFlat(0), s: M.frontSc }; }
    const S = seatFrame(p), O = LY.opp;
    return { p: seatPoint(S, (j - (k - 1) / 2) * O.frontDx, CT / 2 + 0.01, O.front), q: qFlat(S.yaw), s: O.frontSc };
  }
  function trioPlace(p, t, k) {   // card k (0-2) of trio t
    const fan = (k - 1) * 0.1;
    if (p === me) {
      const M = LY.me, sc = 0.62;
      const bx = M.trioX + t * M.trioDx, bz = M.trioZ + t * M.trioDz;
      return { p: new T.Vector3(bx + k * 0.09, CT / 2 + 0.003 + k * (CT + 0.004), bz - k * 0.03), q: qFlat(fan * 0.6), s: sc };
    }
    const S = seatFrame(p), O = LY.opp;
    const cnt = view ? Math.max(1, view.trios[p].length) : 1;
    const lx = (t - (cnt - 1) / 2) * O.trioDx;
    return { p: seatPoint(S, lx + k * 0.06, CT / 2 + 0.003 + k * (CT + 0.004), O.trio - k * 0.02), q: qFlat(S.yaw + fan * 0.6), s: O.trioSc };
  }
  function pawnPlace(p) { const S = seatFrame(p); return seatPoint(S, 0, 0, LY.opp.pawn); }

  /* ------------------------------------------------------------------ animation */
  let speed = 1, clock = 0;
  function animate(o, to, dur, arc, delay = 0) {
    const g = o.g;
    o.anim = { p0: g.position.clone(), q0: g.quaternion.clone(), s0: g.scale.x, p1: to.p.clone(), q1: to.q.clone(), s1: to.s, t0: clock + delay / speed, dur: Math.max(0.01, dur / speed), arc: arc || 0 };
  }
  function jump(o, to) { o.g.position.copy(to.p); o.g.quaternion.copy(to.q); o.g.scale.setScalar(to.s); o.anim = null; }
  function stepAnim(o) {
    const a = o.anim; if (!a) return;
    if (clock < a.t0) return;
    const u = clamp((clock - a.t0) / a.dur, 0, 1), e = easeIO(u);
    o.g.position.lerpVectors(a.p0, a.p1, e);
    if (a.arc) o.g.position.y += Math.sin(Math.PI * u) * a.arc;
    o.g.quaternion.slerpQuaternions(a.q0, a.q1, e);
    o.g.scale.setScalar(a.s0 + (a.s1 - a.s0) * e);
    if (u >= 1) { o.anim = null; if (o.onDone) { const f = o.onDone; o.onDone = null; f(); } }
  }

  /* ------------------------------------------------------------------ the view on the table */
  let view = null, me = 0;
  const fieldGen = [];          // slot -> generic back (face down)
  const fieldWait = [];         // slot -> a card is still flying back into it
  let busyUntil = 0;

  function layoutRack(p, instant) {
    const S = seats[p];
    const k = S.objs.length + S.resMin + S.resMax;
    S.objs.forEach((o, j) => {
      o.rack = { p, j: S.resMin + j, k };
      const tgt = rackSlot(p, S.resMin + j, k);
      if (instant) jump(o, tgt); else animate(o, tgt, 0.3, 0);
    });
    const w = rackWidth(Math.max(k, 1));
    const fr = seatFrame(p);
    S.rack.scale.set(w + 0.25, 1, 1);
    S.rack.position.copy(seatPoint(fr, 0, 0.07, -0.12));
    S.rack.quaternion.copy(qAy(fr.yaw));
    S.pawn.position.copy(pawnPlace(p)); S.pawn.quaternion.copy(qAy(fr.yaw));
    S.ring.position.copy(pawnPlace(p)); S.ring.position.y = 0.006;
  }

  /* a card flying back into hiding finishes its trip when it lands, or at once when the next view comes first */
  function landing(o, finish) {
    o.pending = finish;
    o.onDone = () => { if (o.pending === finish) { o.pending = null; finish(); } };
  }
  function flushLandings() {
    cards.forEach((o) => { if (o.pending) { const f = o.pending; o.pending = null; o.onDone = null; o.anim = null; f(); } });
  }
  function setView(v, hints = {}) {
    flushLandings();
    const prev = view;
    const rebuild = !prev || prev.n !== v.n || prev.me !== v.me || hints.instant;
    if (!prev || prev.n !== v.n || prev.me !== v.me) {
      me = v.me;
      if (nPlayers !== v.n || !seats.length) { nPlayers = v.n; buildSeats(); }
      mode = bestMode();
      setLayout(LY.mode === mode && LY.n === v.n ? LY : makeLayout(v.n, mode));
    }
    view = v;
    const from = hints.from || {}, to = hints.to || {}, instant = !!rebuild;
    let longest = 0;
    const D = (x) => x / speed;
    // --- the other players' racks
    for (let p = 0; p < v.n; p++) {
      const S = seats[p];
      if (p === me) { S.objs.forEach(dropGeneric); S.objs = []; S.resMin = S.resMax = 0; S.rack.visible = false; S.pawn.visible = false; S.ring.visible = false; continue; }
      S.rack.visible = true; S.pawn.visible = true;
      if (instant) {
        S.objs.forEach(dropGeneric); S.objs = []; S.resMin = S.resMax = 0;
        for (let j = 0; j < v.counts[p]; j++) S.objs.push(takeGeneric());
        layoutRack(p, true);
      }
    }
    // cards leaving a rack: the back at that end goes, the real card takes its place
    const lifts = {};
    if (!instant) {
      Object.keys(from).forEach((cs) => {
        const f = from[cs], c = +cs;
        if (f.seat == null || f.seat === me) return;
        const S = seats[f.seat];
        const o = f.end === 'min' ? S.objs.shift() : S.objs.pop();
        if (o) { lifts[c] = { p: o.g.position.clone(), q: o.g.quaternion.clone(), s: o.g.scale.x }; dropGeneric(o); }
      });
      for (let p = 0; p < v.n; p++) {
        if (p === me) continue;
        const S = seats[p];
        const want = v.counts[p];
        // returning cards keep their ends free until they land (see below); anything else is a resync
        const pending = Object.keys(to).filter((cs) => to[cs].seat === p).length;
        const have = S.objs.length + S.resMin + S.resMax;
        if (have + pending !== want) {
          while (S.objs.length + S.resMin + S.resMax + pending > want && S.objs.length) dropGeneric(S.objs.pop());
          while (S.objs.length + S.resMin + S.resMax + pending < want) S.objs.push(takeGeneric());
        }
        Object.keys(to).forEach((cs) => { if (to[cs].seat === p) { if (to[cs].end === 'max') S.resMax++; else S.resMin++; } });
        layoutRack(p, false);
      }
    }
    // --- where every real card should be
    const targets = new Map();
    v.hand.forEach((c, j) => targets.set(c, Object.assign(handPlace(j, v.hand.length), { where: 'hand' })));
    v.front.forEach((f, p) => f.forEach((c, j) => targets.set(c, Object.assign(frontPlace(p, j, f.length), { where: 'front' }))));
    v.field.forEach((c, i) => { if (c != null && c >= 0) targets.set(c, Object.assign(fieldPlace(i, true), { where: 'field', slot: i })); });
    v.trios.forEach((ts, p) => ts.forEach((t, ti) => t.cards.forEach((c, k) => targets.set(c, Object.assign(trioPlace(p, ti, k), { where: 'trio' })))));
    // --- face-down field
    v.field.forEach((c, i) => {
      const want = c === -1;
      if (want && !fieldGen[i] && !fieldWait[i]) { const o = takeGeneric(); o.slot = i; fieldGen[i] = o; jump(o, fieldPlace(i, false)); }
      if (!want && fieldGen[i]) { dropGeneric(fieldGen[i]); fieldGen[i] = null; }
    });
    for (let i = v.field.length; i < fieldGen.length; i++) if (fieldGen[i]) { dropGeneric(fieldGen[i]); fieldGen[i] = null; }
    // --- real cards
    for (const o of cards) {
      const tgt = targets.get(o.c);
      if (tgt) {
        const was = o.place;
        o.place = tgt.where; o.slot = tgt.slot;
        if (!o.shown) {
          o.shown = true; o.g.visible = true;
          let org = null;
          if (!instant && from[o.c]) {
            const f = from[o.c];
            if (f.field != null) org = fieldPlace(f.field, false);
            else if (lifts[o.c]) org = lifts[o.c];
          }
          if (org) {
            jump(o, org);
            const flip = from[o.c].field != null;
            animate(o, tgt, flip ? 0.5 : 0.6, flip ? 0.55 : 0.75);
            longest = Math.max(longest, 0.6);
          } else jump(o, tgt);
        } else if (instant) jump(o, tgt);
        else {
          const moved = o.g.position.distanceTo(tgt.p) > 0.002 || o.g.quaternion.angleTo(tgt.q) > 0.002 || Math.abs(o.g.scale.x - tgt.s) > 0.002;
          if (moved) {
            const far = was !== tgt.where;
            const dur = far ? (tgt.where === 'trio' ? 0.7 : 0.55) : 0.3;
            animate(o, tgt, dur, far ? (tgt.where === 'trio' ? 1.1 : 0.5) : 0);
            longest = Math.max(longest, dur);
          }
        }
      } else if (o.shown) {
        o.place = null;
        const t = !instant ? to[o.c] : null;
        if (t && t.field != null) {
          const i = t.field;
          fieldWait[i] = true;
          if (fieldGen[i]) { dropGeneric(fieldGen[i]); fieldGen[i] = null; }
          animate(o, fieldPlace(i, false), 0.45, 0.4);
          landing(o, () => {
            o.g.visible = false; fieldWait[i] = false;
            if (view && view.field[i] === -1 && !fieldGen[i]) { const g = takeGeneric(); g.slot = i; fieldGen[i] = g; jump(g, fieldPlace(i, false)); }
          });
          o.shown = false; longest = Math.max(longest, 0.45);
        } else if (t && t.seat != null && t.seat !== me) {
          // back into the rack, at the end it came from (t.k: how many others go to that end before it)
          const S = seats[t.seat], end = t.end === 'max' ? 'max' : 'min';
          const k = S.objs.length + S.resMin + S.resMax;
          const j = end === 'min' ? (t.k || 0) : k - 1 - (t.k || 0);
          animate(o, rackSlot(t.seat, clamp(j, 0, Math.max(0, k - 1)), k), 0.55, 0.6);
          landing(o, () => {
            o.g.visible = false;
            if (end === 'min') { if (S.resMin > 0) S.resMin--; S.objs.unshift(takeGeneric()); }
            else { if (S.resMax > 0) S.resMax--; S.objs.push(takeGeneric()); }
            const g = end === 'min' ? S.objs[0] : S.objs[S.objs.length - 1];
            jump(g, { p: o.g.position.clone(), q: o.g.quaternion.clone(), s: o.g.scale.x });
            layoutRack(t.seat, false);
          });
          o.shown = false; longest = Math.max(longest, 0.55);
        } else { o.shown = false; o.g.visible = false; o.anim = null; o.onDone = null; }
      }
    }
    applyHighlights();
    busyUntil = clock + D(longest);
    return D(longest);
  }

  /* ------------------------------------------------------------------ highlights
     hl = { field: [slots], ends: [{ who, end }], match: [cards], bad: card, turn: p, mine: bool }        */
  let hl = {};
  function endObject(who, end) {
    if (!view) return null;
    if (who === me) {
      const h = view.hand; if (!h.length) return null;
      const c = end === 'min' ? h[0] : h[h.length - 1];
      return { card: cards[c] };
    }
    const S = seats[who]; if (!S || !S.objs.length) return null;
    return { gen: end === 'min' ? S.objs[0] : S.objs[S.objs.length - 1] };
  }
  function applyHighlights() {
    const match = new Set(hl.match || []);
    cards.forEach((o) => {
      let mode = null;
      if (o.shown && o.c === hl.bad) mode = 'bad';
      else if (o.shown && match.has(o.c)) mode = 'match';
      o.hl = mode; o.lift = 0;
      if (mode) { o.halo.visible = true; o.halo.material.color.copy(HALO[mode]); } else o.halo.visible = false;
      o.face.material = o.v === 7 ? goldMat : faceMat;
    });
    generics.forEach((o) => { o.hl = null; o.halo.visible = false; o.halo2.visible = false; });
    (hl.field || []).forEach((i) => { const o = fieldGen[i]; if (o) { o.hl = 'tgt'; o.halo2.visible = true; o.halo2.material.color.copy(HALO.tgt); } });
    (hl.ends || []).forEach((e) => {
      const x = endObject(e.who, e.end); if (!x) return;
      if (x.card) { x.card.hl = 'tgt'; x.card.halo.visible = true; x.card.halo.material.color.copy(HALO.tgt); x.card.lift = 0.18; }
      else { x.gen.hl = 'tgt'; x.gen.halo2.visible = true; x.gen.halo2.material.color.copy(HALO.tgt); }
    });
    if (hl.mine && view) {   // my turn: the middle of my hand is dimmed (only the ends can be shown)
      const h = view.hand;
      h.forEach((c, j) => { if (j > 0 && j < h.length - 1) cards[c].face.material = dimMat; });
    }
    seats.forEach((S) => { S.ring.visible = hl.turn === S.p && S.p !== me; });
  }
  function setHighlights(h) { hl = h || {}; applyHighlights(); }

  /* ------------------------------------------------------------------ effects */
  const sparkMat = new T.SpriteMaterial({ map: tex(sparkTex()), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const sparks = [];
  function burst(at, color, count = 26, power = 1) {
    const col = lin(color);
    for (let k = 0; k < count; k++) {
      const sp = new T.Sprite(sparkMat.clone()); sp.material.color = col.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, 0);
      const a = Math.random() * Math.PI * 2, r = (0.4 + Math.random() * 1.3) * power;
      sp.position.copy(at); sp.scale.setScalar(0.18 + Math.random() * 0.22);
      sp.userData = { v: new T.Vector3(Math.cos(a) * r, (1.6 + Math.random() * 1.8) * power, Math.sin(a) * r), t0: clock, life: 0.8 + Math.random() * 0.6 };
      scene.add(sp); sparks.push(sp);
    }
  }
  /* a trio landed in front of p */
  function celebrate(p, v) {
    if (!view) return;
    const t = view.trios[p].length - 1;
    const at = trioPlace(p, Math.max(0, t), 1).p.clone(); at.y += 0.3;
    burst(at, v === 7 ? '#ffd76a' : NUM_COLORS[v], v === 7 ? 60 : 28, v === 7 ? 1.4 : 1);
    if (p !== me && seats[p]) seats[p].jump = clock;
  }
  function shake(c) { const o = cards[c]; if (o) o.shakeT = clock; }
  function winner(p) {
    const at = p === me ? new T.Vector3(0, 1, LY.me.frontZ) : pawnPlace(p).add(new T.Vector3(0, 1, 0));
    burst(at, SEAT_COLORS[p % SEAT_COLORS.length], 70, 1.5);
    if (p !== me && seats[p]) seats[p].jump = clock;
  }

  /* ------------------------------------------------------------------ camera */
  let layout = { w: 1, h: 1, top: 0, bottom: 0 };
  let attract = false, attractT = 0, baseCam = null;
  const camTarget = new T.Vector3();
  function boundsPoints() {
    const pts = [], M = LY.me;
    // my hand (as wide as it can get) and my trios
    const hx = M.maxW / 2 + 0.1, half = (CH / 2) * M.sc;
    for (const x of [-hx, hx]) { pts.push(new T.Vector3(x, 0.02 + Math.sin(M.tilt) * half * 2 + 0.25, M.z - Math.cos(M.tilt) * half * 2)); pts.push(new T.Vector3(x, 0, M.z + 0.12)); }
    pts.push(new T.Vector3(M.trioX - 0.45, 0, M.trioZ - 0.5), new T.Vector3(M.trioX + 2 * M.trioDx + 0.6, 0, M.trioZ + 2 * M.trioDz + 0.5));
    // the field
    const fx = (LY.cols * LY.field.px) / 2 + 0.05, fz = (LY.rows * LY.field.pz) / 2 + 0.05;
    for (const x of [-fx, fx]) for (const z of [-fz, fz]) pts.push(new T.Vector3(LY.field.cx + x, 0, LY.field.cz + z));
    // every other seat: rack, figure and name, the row of trios, the cards shown this turn
    for (let r = 1; r < LY.seats.length; r++) {
      const S = LY.seats[r], O = LY.opp, w = O.maxW / 2 + 0.1;
      pts.push(seatPoint(S, -w, 0.75, -0.6), seatPoint(S, w, 0.75, -0.6), seatPoint(S, -w, 0, 0.2), seatPoint(S, w, 0, 0.2));
      // Include ears and round cheeks at head height, even at the side seats.
      for (const x of [-.65,.65]) for (const y of [0,1.75]) for (const z of [-.45,.45]) pts.push(seatPoint(S,x,y,O.pawn+z));
      pts.push(seatPoint(S, -O.trioDx * 1.5, 0, O.trio + 0.35), seatPoint(S, O.trioDx * 1.5, 0, O.trio + 0.35));
      const fw = O.frontDx + 0.5 * O.frontSc;
      pts.push(seatPoint(S, -fw, 0, O.front + 0.62 * O.frontSc), seatPoint(S, fw, 0, O.front + 0.62 * O.frontSc), seatPoint(S, -fw, 0, O.front - 0.62 * O.frontSc), seatPoint(S, fw, 0, O.front - 0.62 * O.frontSc));
    }
    return pts;
  }
  const _p = new T.Vector3();
  function fit() {
    const aspect = layout.w / Math.max(1, layout.h);
    camera.aspect = aspect; camera.fov = LY.fov;
    camera.clearViewOffset(); camera.updateProjectionMatrix();
    const dir = new T.Vector3(0, Math.sin(LY.pitch), Math.cos(LY.pitch));
    const pts = boundsPoints();
    let zmin = 1e9, zmax = -1e9;
    pts.forEach((p) => { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); });
    camTarget.set(0, 0, (zmin + zmax) / 2);
    const mt = (layout.top / layout.h) * 2, mb = (layout.bottom / layout.h) * 2, mx = 0.025, room = 2 - mt - mb - 0.03;
    const measure = (d) => {
      camera.position.copy(camTarget).addScaledVector(dir, d); camera.lookAt(camTarget); camera.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { _p.copy(p).project(camera); x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 3, hi = 140;
    for (let k = 0; k < 34; k++) {
      const d = (lo + hi) / 2, m = measure(d);
      if (m.x0 >= -1 + mx && m.x1 <= 1 - mx && m.y1 - m.y0 <= room) hi = d; else lo = d;
    }
    const d = hi, m = measure(d);
    const want = ((-1 + mb) + (1 - mt)) / 2, have = (m.y0 + m.y1) / 2;
    const offY = ((want - have) * layout.h) / 2;
    camera.setViewOffset(layout.w, layout.h, 0, offY, layout.w, layout.h);
    baseCam = { pos: camera.position.clone(), target: camTarget.clone(), d, dir };
  }
  function setLayout(L) {
    LY = L;
    layTable();
    // the field backs move to the new grid
    fieldGen.forEach((o, i) => { if (o) jump(o, fieldPlace(i, false)); });
    seats.forEach((S, p) => { if (S && p !== me) layoutRack(p, true); });
    fit();
  }
  /* the layout that shows the table biggest on this stage (the current one keeps a small edge, so it does not flicker) */
  function bestMode() {
    const keep = LY, size = {};
    for (const m of ['tall', 'wide']) {
      LY = keep.mode === m && keep.n === nPlayers ? keep : makeLayout(nPlayers, m);
      fit();
      size[m] = layout.h / (2 * baseCam.d * Math.tan((LY.fov * Math.PI) / 360));
    }
    LY = keep;
    const other = mode === 'tall' ? 'wide' : 'tall';
    return size[other] > size[mode] * 1.06 ? other : mode;
  }
  function resize(w, h, topPx = 0, bottomPx = 0) {
    layout = { w, h, top: topPx, bottom: bottomPx };
    const m = bestMode();
    const q = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(q);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    if (m !== mode || LY.n !== nPlayers) {
      mode = m; LY = makeLayout(nPlayers, mode); layTable();
      if (view) { const v = view; view = null; setView(v, { instant: true }); }
    }
    fit();
  }
  let quality = opts.quality || 'high';
  function setQuality(qv) {
    quality = qv; renderer.shadowMap.enabled = qv === 'high'; key.castShadow = qv === 'high';
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    resize(layout.w, layout.h, layout.top, layout.bottom);
  }

  /* ------------------------------------------------------------------ picking
     returns { field: i } | { end: { who, end } } | { mid: card } | { seat: p } | {}                       */
  const ray = new T.Raycaster();
  function pick(px, py) {
    scene.updateMatrixWorld();   // a tap can come before the next frame has been drawn
    const ndc = new T.Vector2((px / layout.w) * 2 - 1, -(py / layout.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = [];
    cards.forEach((o) => { if (o.shown) objs.push(o.g.children[0], o.g.children[1]); });
    generics.forEach((o) => { if (o.g.visible) objs.push(o.g.children[0], o.g.children[1], o.g.children[2]); });
    seats.forEach((S) => { if (S.pawn.visible) S.pawn.traverse((m) => { if(m.isMesh) { m.userData.seat = S.p; objs.push(m); } }); });
    const hits = ray.intersectObjects(objs, false);
    for (const h of hits) {
      const u = h.object.userData;
      if (u.card) {
        const o = u.card;
        if (o.place === 'hand') {
          const hd = view.hand, j = hd.indexOf(o.c);
          if (j === 0) return { end: { who: me, end: 'min' }, card: o.c };
          if (j === hd.length - 1) return { end: { who: me, end: 'max' }, card: o.c };
          return { mid: o.c };
        }
        if (o.place === 'field') return { faceUp: o.slot, card: o.c };
        return { card: o.c };
      }
      if (u.gen) {
        const g = u.gen;
        if (g.slot != null && fieldGen[g.slot] === g) return { field: g.slot };
        if (g.rack) { const { p, j, k } = g.rack; return { end: { who: p, end: j < k / 2 ? 'min' : 'max' } }; }
      }
      if (u.seat != null) return { seat: u.seat };
    }
    return {};
  }

  /* screen positions (CSS px inside the stage) */
  const _v = new T.Vector3();
  function toScreen(p) { _v.copy(p).project(camera); return [(_v.x + 1) / 2 * layout.w, (1 - _v.y) / 2 * layout.h, _v.z < 1]; }
  function anchors() {
    const a = { seats: [], ends: [], field: [] };
    if (!view) return a;
    for (let p = 0; p < nPlayers; p++) {
      if (p === me) { a.seats.push(toScreen(new T.Vector3(-LY.me.maxW / 2 - 0.2, 0, LY.me.z + 0.55))); continue; }
      a.seats.push(toScreen(seatPoint(seatFrame(p), 0, 1.62, LY.opp.pawn)));
    }
    for (let p = 0; p < nPlayers; p++) {
      const e = { min: null, max: null };
      if (p === me) {
        const h = view.hand;
        if (h.length) {
          const o0 = cards[h[0]], o1 = cards[h[h.length - 1]], up = LY.me.sc * CH * 0.62;
          e.min = toScreen(o0.g.position.clone().add(new T.Vector3(0, up, -0.2)));
          e.max = toScreen(o1.g.position.clone().add(new T.Vector3(0, up, -0.2)));
        }
      } else {
        // just past each end of the rack, level with the middle of the cards
        const S = seats[p], F = seatFrame(p);
        if (S.objs.length) {
          const k = S.objs.length + S.resMin + S.resMax, half = rackWidth(k) / 2 + 0.24, y = 0.12 + Math.cos(LEAN) * CH * LY.opp.sc * 0.5;
          const zc = -Math.sin(LEAN) * CH * LY.opp.sc * 0.5;
          e.min = toScreen(seatPoint(F, -half, y, zc)); e.max = toScreen(seatPoint(F, half, y, zc));
          e.side = Math.abs(Math.sin(F.yaw)) > 0.7;
        }
      }
      a.ends.push(e);
    }
    for (let i = 0; i < view.field.length; i++) a.field.push(toScreen(new T.Vector3(fieldPos(i).x, 0.05, fieldPos(i).z)));
    return a;
  }
  /* where to tap for things (tests): CSS px inside the stage */
  function screenOf(q) {
    if (q.field != null) { const o = fieldGen[q.field]; if (!o) return null; return toScreen(o.g.position.clone().add(new T.Vector3(0, 0.03, 0.18))); }
    if (q.end) {
      const x = endObject(q.end.who, q.end.end); if (!x) return null;
      if (x.card) {
        const o = x.card, j = view.hand.indexOf(o.c), k = view.hand.length;
        // the part of an end card that is not covered by its neighbour
        const dx = k > 1 ? (j === 0 ? -0.3 : 0.3) * LY.me.sc : 0;
        return toScreen(o.g.position.clone().add(new T.Vector3(dx, 0.2 * LY.me.sc, -0.05)));
      }
      const g = x.gen, rk = g.rack, S = seatFrame(rk.p);
      const side = rk.k > 1 ? (rk.j < rk.k / 2 ? -1 : 1) : 0;
      const p = g.g.position.clone(), c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      p.x += side * 0.22 * c * LY.opp.sc; p.z -= side * 0.22 * s * LY.opp.sc; p.y += 0.12;
      return toScreen(p);
    }
    return null;
  }

  /* ------------------------------------------------------------------ frame loop */
  let last = performance.now(), onFrame = null;
  let odd = false;
  function frame(now) {
    requestAnimationFrame(frame);
    // when nothing is on the move, half the frames are enough for the gentle glows (easier on phone batteries)
    const moving = attract || sparks.length || cards.some((o) => o.anim || o.shakeT != null) || generics.some((o) => o.anim) || seats.some((S) => clock - S.jump < 1);
    if (!moving) { odd = !odd; if (odd) return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    cards.forEach((o) => {
      stepAnim(o);
      if (!o.anim && o.shown && o.place === 'hand' && view) {
        const j = view.hand.indexOf(o.c);
        if (j >= 0) { const base = handPlace(j, view.hand.length).p.y + o.lift; o.g.position.y += (base - o.g.position.y) * Math.min(1, dt * 12); }
      }
      if (o.shakeT != null) {
        const age = clock - o.shakeT;
        if (age < 0.5) o.g.rotateY(Math.sin(age * 40) * 0.02 * (1 - age / 0.5)); else o.shakeT = null;
      }
      if (o.halo.visible) o.halo.material.opacity = o.hl === 'tgt' ? 0.5 + Math.sin(clock * 5) * 0.3 : o.hl === 'bad' ? 0.85 : 0.75;
    });
    generics.forEach((o) => {
      stepAnim(o);
      if (o.halo2.visible) o.halo2.material.opacity = 0.5 + Math.sin(clock * 5) * 0.3;
      if (o.halo.visible) o.halo.material.opacity = 0.5 + Math.sin(clock * 5) * 0.3;
    });
    shineTex.offset.x = ((clock * 0.22) % 2) - 1; shineTex.offset.y = -shineTex.offset.x * 0.5;
    seats.forEach((S) => {
      if (!S.pawn.visible) return;
      const base = pawnPlace(S.p);
      const active = hl.turn === S.p;
      const jumpAge = clock - S.jump;
      let y = active ? Math.abs(Math.sin(clock * 3.2)) * 0.12 : 0;
      if (jumpAge >= 0 && jumpAge < 0.9) y += Math.sin(Math.PI * jumpAge / 0.9) * 0.7;
      S.pawn.position.y = base.y + y;
      S.pawn.rotation.y = seatFrame(S.p).yaw + (jumpAge >= 0 && jumpAge < 0.9 ? jumpAge / 0.9 * Math.PI * 2 : Math.sin(clock * 0.7 + S.p) * 0.12);
      if (S.ring.visible) S.ring.material.opacity = 0.45 + Math.sin(clock * 4) * 0.2;
    });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i], u = sp.userData, age = clock - u.t0;
      if (age > u.life) { scene.remove(sp); sp.material.dispose(); sparks.splice(i, 1); continue; }
      u.v.y -= 4.5 * dt; sp.position.addScaledVector(u.v, dt);
      sp.material.opacity = 1 - age / u.life;
    }
    if (attract && baseCam) {
      attractT += dt;
      const a = Math.sin(attractT * 0.11) * 0.34;
      const d = baseCam.d * 0.95, el = LY.pitch + 0.04;
      camera.position.set(baseCam.target.x + Math.sin(a) * d * Math.cos(el), baseCam.target.y + Math.sin(el) * d, baseCam.target.z + Math.cos(a) * d * Math.cos(el));
      camera.lookAt(baseCam.target);
    }
    renderer.render(scene, camera);
    if (onFrame) onFrame();
  }
  requestAnimationFrame(frame);

  function setFelt(name) { feltName = FELTS[name] ? name : 'teal'; drawFelt(); }
  function refreshFonts() { drawAtlas(atlasCanvas); atlas.needsUpdate = true; }
  function setAttract(on) {
    attract = !!on; attractT = 0;
    if (!on && baseCam) { camera.position.copy(baseCam.pos); camera.lookAt(baseCam.target); }
  }
  function clear() {
    view = null;
    cards.forEach((o) => { o.shown = false; o.g.visible = false; o.anim = null; o.onDone = null; o.pending = null; o.place = null; });
    seats.forEach((S) => { S.objs.forEach(dropGeneric); S.objs = []; S.resMin = S.resMax = 0; });
    fieldGen.forEach((o, i) => { dropGeneric(o); fieldGen[i] = null; });
    fieldWait.length = 0;
    setHighlights({});
  }
  buildSeats(); layTable(); fit();

  return {
    setView, setHighlights, pick, resize, anchors, screenOf, setFelt, setQuality, refreshFonts, setAttract, clear, setAvatars,
    avatars: () => seats.map((S) => S.pawn.userData.avatar),
    racks: () => seats.map((S) => ({ p: S.p, objs: S.objs.length, resMin: S.resMin, resMax: S.resMax, visible: S.objs.filter((o) => o.g.visible).length })),
    /* tests: every plain back has exactly one job, sits where that job says, and the pool holds only idle ones */
    check() {
      const bad = [], owner = new Map();
      const own = (o, what) => { if (owner.has(o)) bad.push('shared: ' + owner.get(o) + ' & ' + what); else owner.set(o, what); };
      seats.forEach((S) => S.objs.forEach((o, j) => { own(o, 'rack' + S.p + ':' + j); if (!o.g.visible) bad.push('hidden rack card ' + S.p + ':' + j); }));
      fieldGen.forEach((o, i) => {
        if (!o) return;
        own(o, 'field' + i);
        if (!o.g.visible) bad.push('hidden field back ' + i);
        if (o.slot !== i) bad.push('field back ' + i + ' thinks it is ' + o.slot);
        if (!o.anim && o.g.position.distanceTo(fieldPlace(i, false).p) > 0.01) bad.push('field back ' + i + ' out of place');
      });
      genPool.forEach((o, k) => { own(o, 'pool' + k); if (o.g.visible) bad.push('visible pooled back ' + k); });
      return bad;
    },
    celebrate, shake, winner,
    set speed(v) { speed = v; }, get speed() { return speed; },
    get mode() { return mode; },
    get busy() { return clock < busyUntil || cards.some((o) => o.anim) || generics.some((o) => o.anim && o.g.visible); },
    set onFrame(f) { onFrame = f; },
    renderer, camera,
    /* a fixed camera for pictures (cover art): pitch in radians, zoom < 1 moves closer, tz shifts the aim */
    pose(o) {
      attract = false;
      const pitch = o.pitch != null ? o.pitch : LY.pitch;
      camera.fov = o.fov || camera.fov; camera.clearViewOffset(); camera.updateProjectionMatrix();
      const dir = new T.Vector3(Math.sin(o.yaw || 0) * Math.cos(pitch), Math.sin(pitch), Math.cos(o.yaw || 0) * Math.cos(pitch));
      const tgt = new T.Vector3(o.tx || 0, 0, o.tz != null ? o.tz : baseCam.target.z);
      camera.position.copy(tgt).addScaledVector(dir, baseCam.d * (o.zoom || 1)); camera.lookAt(tgt); camera.updateMatrixWorld();
    }
  };
}
