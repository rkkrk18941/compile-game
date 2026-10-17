/* ハタトリ・ナイン — the formation scene. When a side finishes its formation at a flag, a band sweeps across the
   table: an army of silhouettes marches past in that formation, the formation's name slams in and the cards that
   made it fan out. Every formation has its own battlefield behind the army, and each has two looks:
     楔形 wedge      a charge across the plains under a huge sun (dawn, or a blood-red evening)
     密集 phalanx    a storm over city walls, rain and lightning (dusk, or night with torches in the towers)
     大隊 battalion  a parade before the royal castle (bright noon with petals, or golden afternoon with confetti)
     散兵 skirmish   pine forests in mist with birds (morning, or autumn)
     寄せ集め host   a burning village under the moon, embers and smoke (dusk, or deep night)
     霧 fog          a marsh lost in fog
   Everything is drawn on one 2D canvas over the 3D table. Tap to skip. */
import { paintCard, drawArt } from './scene.js';

const RANKS = [
  { name: '寄せ集め', en: 'HOST', stars: 1 },
  { name: '散兵', en: 'SKIRMISH LINE', stars: 2 },
  { name: '大隊', en: 'BATTALION', stars: 3 },
  { name: '密集', en: 'PHALANX', stars: 4 },
  { name: '楔形', en: 'WEDGE', stars: 5 }
];
/* whose formation it is: the title, the edges of the band and the banners */
const THEME = {
  me: { glow: '#ffd36a', title: ['#fff6d6', '#ffd56a', '#f0a02c'], band: 'rgba(255,214,120,0.95)', banner: '#f2c14e' },
  op: { glow: '#ff7d92', title: ['#fff0f2', '#ff9bab', '#e0405a'], band: 'rgba(255,140,160,0.95)', banner: '#e0566a' },
  fog: { glow: '#cfe0ee', title: ['#ffffff', '#d5e6f2', '#9fb6c8'], band: 'rgba(210,228,240,0.9)', banner: '#cfe0ee' }
};
/* the battlefields. sky: gradient stops from the top of the band to the horizon; layers: silhouettes on the
   horizon, far to near (h: share of the sky's height, par: how fast they slide by) */
const STAGES = {
  4: [
    { sky: [[0, '#140a26'], [0.42, '#5d2147'], [0.74, '#e2603a'], [0.9, '#ffb04a'], [1, '#ffe6a6']], sun: { x: 0.5, y: 1, r: 0.36, core: '#fff3cc', glow: '255,176,72', rays: true },
      layers: [{ kind: 'mountains', col: '#45203f', h: 0.46, par: 0.05 }, { kind: 'mountains', col: '#2a1029', h: 0.28, par: 0.14 }],
      ground: ['#73402a', '#1b0d08'], ink: '#170a06', haze: '#ffcf8a', weather: 'dust', speed: 16, march: 1.8 },
    { sky: [[0, '#0d0710'], [0.4, '#4a0f1e'], [0.72, '#b8241f'], [0.9, '#f2632a'], [1, '#ffb070']], sun: { x: 0.5, y: 1, r: 0.42, core: '#ffd9a0', glow: '255,90,40', rays: true },
      layers: [{ kind: 'mountains', col: '#3a0d18', h: 0.4, par: 0.05 }, { kind: 'hills', col: '#220710', h: 0.2, par: 0.16 }],
      ground: ['#5a1c14', '#120505'], ink: '#120404', haze: '#ff9a6a', weather: 'dust', speed: 16, march: 1.8 }
  ],
  3: [
    { sky: [[0, '#05090d'], [0.45, '#1b2a35'], [0.8, '#4a6474'], [1, '#aabdc7']], clouds: { col: [26, 34, 42], n: 7, a: 0.9, low: true },
      layers: [{ kind: 'hills', col: '#33454f', h: 0.3, par: 0.03 }, { kind: 'walls', col: '#121c24', h: 0.62, par: 0.06, lights: 'rgba(255,200,120,0.55)' }],
      ground: ['#38443d', '#090d0b'], ink: '#090d10', haze: '#a9bcc6', weather: 'rain', lightning: true, speed: 4, march: 0.55, fade: true },
    { sky: [[0, '#020407'], [0.55, '#0c1622'], [0.9, '#26384a'], [1, '#4c6276']], clouds: { col: [14, 20, 28], n: 6, a: 0.95, low: true }, moon: { x: 0.78, y: 0.3, r: 0.07 },
      layers: [{ kind: 'hills', col: '#1a2633', h: 0.28, par: 0.03 }, { kind: 'walls', col: '#070b10', h: 0.62, par: 0.06, lights: 'rgba(255,190,90,0.9)' }],
      ground: ['#26302e', '#050707'], ink: '#05080a', haze: '#6f8496', weather: 'rain', lightning: true, speed: 4, march: 0.55, fade: true }
  ],
  2: [
    { sky: [[0, '#1b58a4'], [0.55, '#4b92d8'], [0.9, '#bde1fb'], [1, '#f2fbff']], sun: { x: 0.82, y: 0.24, r: 0.1, core: '#fffef2', glow: '255,250,215' }, clouds: { col: [255, 255, 255], n: 5, a: 0.92 },
      layers: [{ kind: 'castle', col: '#56769e', h: 0.62, par: 0.04 }, { kind: 'hills', col: '#3d6a39', h: 0.2, par: 0.16 }],
      ground: ['#79a64a', '#1d3312'], ink: '#13200c', haze: '#e4f4ff', weather: 'petals', speed: 4, march: 0.9 },
    { sky: [[0, '#2c3e7a'], [0.5, '#c56c4c'], [0.85, '#f5b56a'], [1, '#ffe2a8']], sun: { x: 0.8, y: 0.62, r: 0.13, core: '#fff1c8', glow: '255,200,120' }, clouds: { col: [255, 214, 190], n: 4, a: 0.7 },
      layers: [{ kind: 'castle', col: '#5a3b58', h: 0.62, par: 0.04 }, { kind: 'hills', col: '#4a3a24', h: 0.2, par: 0.16 }],
      ground: ['#8a6a34', '#24180a'], ink: '#1a1006', haze: '#ffe0a8', weather: 'confetti', speed: 4, march: 0.9 }
  ],
  1: [
    { sky: [[0, '#22322b'], [0.6, '#7f9a88'], [0.94, '#dfe8d6'], [1, '#f5f7ea']], sun: { x: 0.3, y: 0.72, r: 0.15, core: '#fffdf0', glow: '250,250,225' },
      layers: [{ kind: 'forest', col: '#5d7a69', h: 0.62, par: 0.04 }, { kind: 'forest', col: '#3a5546', h: 0.44, par: 0.11 }, { kind: 'forest', col: '#1d3025', h: 0.3, par: 0.22 }],
      ground: ['#45603e', '#0f180f'], ink: '#0c160e', haze: '#e6eedd', weather: 'mist', birds: true, speed: 8, march: 1.3, fade: true },
    { sky: [[0, '#2b2236'], [0.55, '#9b6a5a'], [0.9, '#f0c48a'], [1, '#fbe6bf']], sun: { x: 0.7, y: 0.8, r: 0.15, core: '#fff3d6', glow: '255,214,150' },
      layers: [{ kind: 'forest', col: '#8a5a3c', h: 0.6, par: 0.04 }, { kind: 'forest', col: '#5e3423', h: 0.42, par: 0.11 }, { kind: 'forest', col: '#2a160e', h: 0.28, par: 0.22 }],
      ground: ['#6a4a2a', '#160d06'], ink: '#140a04', haze: '#ffe2b8', weather: 'leaves', birds: true, speed: 8, march: 1.3, fade: true }
  ],
  0: [
    { sky: [[0, '#0a0612'], [0.5, '#3a1236'], [0.82, '#a3323a'], [1, '#f08a45']], moon: { x: 0.74, y: 0.26, r: 0.08 }, stars: 50,
      layers: [{ kind: 'village', col: '#1d0c15', h: 0.42, par: 0.08 }],
      ground: ['#4c2017', '#0c0405'], ink: '#0c0305', haze: '#ff9a55', weather: 'embers', speed: 6, march: 1.0 },
    { sky: [[0, '#02030a'], [0.6, '#0e1530'], [0.92, '#2b2f55'], [1, '#5a4a6a']], moon: { x: 0.26, y: 0.3, r: 0.1 }, stars: 90,
      layers: [{ kind: 'village', col: '#06070f', h: 0.42, par: 0.08 }],
      ground: ['#2a2238', '#05040a'], ink: '#040309', haze: '#9a7aa0', weather: 'embers', speed: 6, march: 1.0 }
  ],
  fog: [
    { sky: [[0, '#0b1016'], [0.6, '#4a5763'], [1, '#c9d3da']], moon: { x: 0.3, y: 0.32, r: 0.08, pale: true },
      layers: [{ kind: 'reeds', col: '#2a343b', h: 0.24, par: 0.14 }],
      ground: ['#3b4650', '#0b0f12'], ink: '#0b1014', haze: '#d8e2ea', weather: 'fog', speed: 3, march: 0.7, fade: true }
  ]
};
const TITLE_FONT = '"Dela Gothic One", "Mochiy Pop One", "Hiragino Sans", "Noto Sans JP", sans-serif';
const UI_FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';
const NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", Arial, sans-serif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* the soldier each card sends into the scene */
function unitOf(c, wild) {
  if (c < 60) return 'u' + (c % 10 + 1);
  if (c === 62) return 'u8';
  if (c === 63) return 'u4';
  if (wild && wild.value) return 'u' + Math.max(1, Math.min(10, wild.value));
  return 'u8';
}
/* where the soldiers stand: x = along the march (front is +x), z = depth (0 front .. 1 back), size factor */
function formationLayout(rank, fog, units, rnd) {
  const out = [];
  const pick = (i) => units[i % units.length];
  if (fog) {
    for (let i = 0; i < 18; i++) out.push({ x: -1 + rnd() * 2, z: rnd(), u: pick(i), s: 0.85 + rnd() * 0.3, j: rnd() });
    return out;
  }
  if (rank === 4) {          // wedge: a spearhead, the strongest unit at the tip
    const R = 5;
    for (let r = 0; r < R; r++) for (let k = 0; k <= r; k++) {
      out.push({ x: 0.75 - r * 0.36, z: r === 0 ? 0.5 : 0.5 + (k / r - 0.5) * (r / (R - 1)) * 1.0, u: r === 0 ? units[0] : pick(r + k), s: r === 0 ? 1.25 : 1, j: rnd() });
    }
  } else if (rank === 3) {   // phalanx: a dense block, spears levelled forward
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) out.push({ x: 0.55 - c * 0.24 + r * 0.04, z: r / 3, u: pick(r + c), s: 1, j: rnd() * 0.2, spear: true });
  } else if (rank === 2) {   // battalion: neat ranks under banners
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) out.push({ x: 0.7 - c * 0.34, z: r / 2, u: pick(c + r), s: 1, j: rnd() * 0.3, banner: (c === 1 || c === 4) && r === 2 });
  } else if (rank === 1) {   // skirmish line: one long, loose line on the run
    for (let c = 0; c < 9; c++) out.push({ x: 0.95 - c * 0.26 + (rnd() - 0.5) * 0.06, z: 0.25 + (c % 2) * 0.35 + (rnd() - 0.5) * 0.15, u: pick(c), s: 1, j: rnd(), run: true });
  } else {                   // host: a crowd, every which way
    for (let i = 0; i < 20; i++) out.push({ x: -0.95 + rnd() * 1.8, z: rnd(), u: pick(i), s: 0.8 + rnd() * 0.45, j: rnd(), flip: rnd() < 0.3 });
  }
  return out;
}
/* ------------------------------------------------------------------ silhouettes on the horizon
   Each draws into (0..w, 0..h) with the ground line at y = h. */
function mountains(g, w, h, rnd) {
  g.beginPath(); g.moveTo(-10, h + 2);
  let x = -w * 0.03, up = true;
  while (x < w * 1.03) {
    g.lineTo(x, up ? h * (0.02 + rnd() * 0.42) : h * (0.42 + rnd() * 0.32));
    x += w * (0.035 + rnd() * 0.06); up = !up;
  }
  g.lineTo(w + 10, h + 2); g.closePath(); g.fill();
}
function hills(g, w, h, rnd) {
  const a = rnd() * 6, b = rnd() * 6;
  g.beginPath(); g.moveTo(-5, h + 2);
  for (let x = -5; x <= w + 5; x += 6) g.lineTo(x, h * (0.42 + 0.2 * Math.sin(x / w * 5 + a) + 0.1 * Math.sin(x / w * 13 + b)));
  g.lineTo(w + 5, h + 2); g.closePath(); g.fill();
}
function walls(g, w, h, rnd, lights) {
  const col = g.fillStyle, wt = h * 0.46, mer = h * 0.05;
  g.fillRect(-5, wt, w + 10, h - wt + 2);
  for (let x = -5; x < w + 5; x += mer * 2) g.fillRect(x, wt - mer, mer, mer + 1);
  let x = w * (0.02 + rnd() * 0.06);
  while (x < w) {
    const tw = h * (0.13 + rnd() * 0.07), th = h * (0.74 + rnd() * 0.24);
    g.fillStyle = col; g.fillRect(x, h - th, tw, th + 2);
    if (rnd() < 0.55) { g.beginPath(); g.moveTo(x - tw * 0.14, h - th); g.lineTo(x + tw / 2, h - th - tw * 1.15); g.lineTo(x + tw * 1.14, h - th); g.closePath(); g.fill(); }
    else for (let k = 0; k < 3; k++) g.fillRect(x + k * tw * 0.39, h - th - mer, tw * 0.22, mer + 1);
    if (lights) { g.fillStyle = lights; for (let k = 0; k < 2; k++) if (rnd() < 0.8) g.fillRect(x + tw * 0.42, h - th + th * (0.2 + k * 0.28), tw * 0.16, th * 0.07); }
    x += w * (0.14 + rnd() * 0.13);
  }
  const gx = w * (0.4 + rnd() * 0.2), gw = h * 0.2, gh = h * 0.22;   // the gate
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.moveTo(gx, h + 1); g.lineTo(gx, h - gh); g.arc(gx + gw / 2, h - gh, gw / 2, Math.PI, 0); g.lineTo(gx + gw, h + 1); g.closePath(); g.fill();
  g.fillStyle = col;
}
function castle(g, w, h, rnd, accent) {
  const col = g.fillStyle;
  let x = -5;   // the town
  while (x < w + 5) {
    const bw = h * (0.07 + rnd() * 0.09), bh = h * (0.08 + rnd() * 0.12);
    g.fillRect(x, h - bh, bw, bh + 2);
    g.beginPath(); g.moveTo(x - 1, h - bh); g.lineTo(x + bw / 2, h - bh - bw * 0.5); g.lineTo(x + bw + 1, h - bh); g.closePath(); g.fill();
    x += bw + h * 0.008;
  }
  const cx = w * (0.32 + rnd() * 0.36), kw = h * 0.46, kh = h * 0.46, mer = h * 0.04;
  g.fillRect(cx - kw / 2, h - kh, kw, kh + 2);
  for (let k = 0; k < 6; k++) g.fillRect(cx - kw / 2 + k * kw / 5.5, h - kh - mer, kw / 11, mer + 1);
  const flagAt = (fx, fy, s) => { g.fillRect(fx, fy - s * 0.9, Math.max(1, s * 0.06), s * 0.9); g.fillStyle = accent; g.beginPath(); g.moveTo(fx, fy - s * 0.9); g.lineTo(fx + s * 0.55, fy - s * 0.75); g.lineTo(fx, fy - s * 0.58); g.closePath(); g.fill(); g.fillStyle = col; };
  for (const sd of [-1, 1]) {
    const tw = h * 0.12, th = h * 0.74, tx = cx + sd * kw * 0.62 - tw / 2;
    g.fillRect(tx, h - th, tw, th + 2);
    g.beginPath(); g.moveTo(tx - tw * 0.22, h - th); g.lineTo(tx + tw / 2, h - th - tw * 1.7); g.lineTo(tx + tw * 1.22, h - th); g.closePath(); g.fill();
    flagAt(tx + tw / 2, h - th - tw * 1.7, h * 0.16);
  }
  const sw = h * 0.1, sh = h * 0.86, sx = cx - sw / 2;   // the central spire
  g.fillRect(sx, h - sh, sw, sh + 2);
  g.beginPath(); g.moveTo(sx - sw * 0.3, h - sh); g.lineTo(sx + sw / 2, h - sh - sw * 1.6); g.lineTo(sx + sw * 1.3, h - sh); g.closePath(); g.fill();
  flagAt(sx + sw / 2, h - sh - sw * 1.6, h * 0.2);
  g.fillStyle = 'rgba(255,240,200,0.35)';
  for (let k = 0; k < 4; k++) g.fillRect(cx - kw * 0.3 + k * kw * 0.18, h - kh * 0.6, kw * 0.05, kh * 0.12);
  g.fillStyle = col;
}
function forest(g, w, h, rnd) {
  let x = -h * 0.2;
  while (x < w + h * 0.2) {
    const th = h * (0.5 + rnd() * 0.5), tw = th * (0.32 + rnd() * 0.12), b = h + 1;
    for (let k = 0; k < 3; k++) {
      const yTop = b - th + k * th * 0.22, half = tw * (0.5 + k * 0.25) / 2;
      g.beginPath(); g.moveTo(x, yTop); g.lineTo(x - half, Math.min(b, yTop + th * 0.45)); g.lineTo(x + half, Math.min(b, yTop + th * 0.45)); g.closePath(); g.fill();
    }
    g.fillRect(x - tw * 0.06, b - th * 0.3, tw * 0.12, th * 0.3);
    x += tw * (0.35 + rnd() * 0.55);
  }
  g.fillRect(-5, h * 0.84, w + 10, h * 0.2);
}
function village(g, w, h, rnd) {   // returns where the fires burn
  const fires = [];
  let x = -5;
  while (x < w + 5) {
    const bw = h * (0.16 + rnd() * 0.18), bh = h * (0.16 + rnd() * 0.2);
    g.fillRect(x, h - bh, bw, bh + 2);
    g.beginPath(); g.moveTo(x - bw * 0.08, h - bh); g.lineTo(x + bw / 2, h - bh - bw * 0.55); g.lineTo(x + bw * 1.08, h - bh); g.closePath(); g.fill();
    if (rnd() < 0.42) fires.push({ x: x + bw * (0.3 + rnd() * 0.4), y: h - bh - bw * 0.2, s: bw * (0.8 + rnd() * 0.6), ph: rnd() * 6 });
    x += bw + h * (0.02 + rnd() * 0.12);
    if (rnd() < 0.22) {   // a watchtower
      const tw = h * 0.05, th = h * (0.5 + rnd() * 0.3);
      g.fillRect(x, h - th, tw, th + 2);
      g.beginPath(); g.moveTo(x - tw * 0.8, h - th); g.lineTo(x + tw / 2, h - th - tw * 1.8); g.lineTo(x + tw * 1.8, h - th); g.closePath(); g.fill();
      x += tw * 3;
    }
  }
  return fires;
}
function reeds(g, w, h, rnd) {
  g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(1, h * 0.025);
  for (let k = 0; k < w / 3; k++) {
    const x = rnd() * w, hh = h * (0.4 + rnd() * 0.6), lean = (rnd() - 0.5) * h * 0.3;
    g.beginPath(); g.moveTo(x, h + 1); g.quadraticCurveTo(x, h - hh * 0.6, x + lean, h - hh); g.stroke();
    if (rnd() < 0.3) { g.beginPath(); g.ellipse(x + lean, h - hh, h * 0.03, h * 0.09, lean / h, 0, Math.PI * 2); g.fill(); }
  }
  g.fillRect(-5, h * 0.86, w + 10, h * 0.2);
}

export function createFx(host, opts = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'fxcanvas';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const x = cv.getContext('2d');
  let W = 1, H = 1, DPR = 1, running = null, skipReq = false;
  const sprites = {};       // silhouettes pre-drawn once per unit and colour
  function sprite(key, ink, flip) {
    const id = key + ink + (flip ? 'f' : '');
    if (sprites[id]) return sprites[id];
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d');
    drawArt(g, key, 80, 80, 156, ink, flip);
    if (key === 'u10') {   // the war elephant's tower
      g.save(); g.translate(80, 80); g.scale((flip ? -1 : 1) * 156 / 512, 156 / 512); g.translate(-256, -256); g.fillStyle = ink;
      g.fillRect(150, 58, 180, 70); for (let i = 0; i < 5; i++) g.fillRect(158 + i * 36, 28, 22, 34); g.fillRect(236, -40, 9, 72); g.restore();
    }
    sprites[id] = c;
    return c;
  }
  function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * DPR)); c.height = Math.max(1, Math.round(h * DPR)); const g = c.getContext('2d'); g.scale(DPR, DPR); return [c, g]; }
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  resize();
  cv.addEventListener('pointerdown', () => { if (running) skipReq = true; });

  /* everything behind the army, built once per scene: the sky, the silhouettes, the particles */
  function buildStage(S, G, rnd, accent, dir) {
    const mx0 = (v) => (dir < 0 ? 1 - v : v);   // the sky is mirrored for the other side, so the title never sits on the moon
    const { top, hor, bot } = G, BW = W + G.skew * 2, SH = hor - top, margin = W * 0.3;
    const st = { S, layers: [], fires: [], clouds: [], stars: [], drops: [], bits: [], birds: [], plumes: [], bolts: [] };
    // the sky with its sun or moon (drawn once)
    {
      const [c, g] = layer(BW, SH + 2);
      const gr = g.createLinearGradient(0, 0, 0, SH);
      S.sky.forEach(([k, col]) => gr.addColorStop(k, col));
      g.fillStyle = gr; g.fillRect(0, 0, BW, SH + 2);
      if (S.stars) for (let i = 0; i < S.stars; i++) st.stars.push({ x: rnd() * BW, y: rnd() * SH * 0.75, r: 0.5 + rnd() * 1.3, ph: rnd() * 6 });
      if (S.moon) {
        const mx = BW * mx0(S.moon.x), my = SH * S.moon.y, mr = Math.min(SH, W) * S.moon.r;
        const mg = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4);
        mg.addColorStop(0, S.moon.pale ? 'rgba(220,230,240,0.35)' : 'rgba(255,240,210,0.3)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
        g.fillStyle = mg; g.fillRect(0, 0, BW, SH);
        g.fillStyle = S.moon.pale ? '#dfe7ee' : '#fff4dc'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
        if (!S.moon.pale) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; }
      }
      st.sky = c;
    }
    // silhouettes
    S.layers.forEach((L) => {
      const lh = SH * L.h, lw = BW + margin * 2;
      const [c, g] = layer(lw, lh + 2);
      g.fillStyle = L.col;
      if (L.kind === 'mountains') mountains(g, lw, lh, rnd);
      else if (L.kind === 'hills') hills(g, lw, lh, rnd);
      else if (L.kind === 'walls') walls(g, lw, lh, rnd, L.lights);
      else if (L.kind === 'castle') castle(g, lw, lh, rnd, accent);
      else if (L.kind === 'forest') forest(g, lw, lh, rnd);
      else if (L.kind === 'reeds') reeds(g, lw, lh, rnd);
      else if (L.kind === 'village') village(g, lw, lh, rnd).forEach((f) => st.fires.push({ x: f.x - margin, y: hor - lh + f.y, s: f.s, ph: f.ph, par: L.par }));
      st.layers.push({ c, w: lw, h: lh, par: L.par });
    });
    if (S.clouds) for (let i = 0; i < S.clouds.n; i++) st.clouds.push({ x: rnd(), y: S.clouds.low ? 0.05 + rnd() * 0.45 : 0.08 + rnd() * 0.45, w: 0.25 + rnd() * 0.3, v: 0.03 + rnd() * 0.05, seed: rnd() });
    const n = S.weather === 'rain' ? 110 : S.weather === 'embers' ? 70 : S.weather === 'dust' ? 50 : 46;
    for (let i = 0; i < n; i++) st.bits.push({ x: rnd(), y: rnd(), v: 0.4 + rnd() * 0.9, r: 0.6 + rnd() * 2.2, a: 0.25 + rnd() * 0.5, ph: rnd() * 6, spin: (rnd() - 0.5) * 8, hue: rnd() });
    if (S.weather === 'dust') for (let i = 0; i < 7; i++) st.plumes.push({ x: rnd(), r: 0.08 + rnd() * 0.1, ph: rnd() });
    if (S.birds) { const n2 = 5 + Math.floor(rnd() * 4), by = 0.18 + rnd() * 0.3; for (let i = 0; i < n2; i++) st.birds.push({ dx: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.03, dy: Math.ceil(i / 2) * 0.035, y: by, ph: rnd() * 6 }); }
    if (S.lightning) for (const at of [0.26 + rnd() * 0.12, 0.58 + rnd() * 0.14]) {
      const pts = [], bx = 0.15 + rnd() * 0.7; let px = bx, py = 0;
      while (py < 1) { pts.push([px, py]); px += (rnd() - 0.5) * 0.08; py += 0.08 + rnd() * 0.1; }
      pts.push([px, 1]);
      st.bolts.push({ at, pts });
    }
    return st;
  }
  /* sky, silhouettes and weather that sits behind the army */
  function drawBack(st, G, t, dir, march) {
    const S = st.S, { top, hor, bot, skew } = G, BW = W + skew * 2, SH = hor - top;
    x.drawImage(st.sky, -skew, top, BW, SH + 2);
    if (st.stars.length) { x.fillStyle = '#fff'; st.stars.forEach((s) => { x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 6 + s.ph)); x.beginPath(); x.arc(s.x - skew, top + s.y, s.r, 0, Math.PI * 2); x.fill(); }); x.globalAlpha = 1; }
    if (S.sun) {
      const sx = -skew + BW * (dir < 0 ? 1 - S.sun.x : S.sun.x), sy = top + SH * S.sun.y, sr = Math.min(SH * 1.2, W * 0.5) * S.sun.r;
      x.globalCompositeOperation = 'lighter';
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 3.2);
      sg.addColorStop(0, 'rgba(' + S.sun.glow + ',0.9)'); sg.addColorStop(0.25, 'rgba(' + S.sun.glow + ',0.45)'); sg.addColorStop(1, 'rgba(' + S.sun.glow + ',0)');
      x.fillStyle = sg; x.fillRect(-skew, top, BW, bot - top);
      if (S.sun.rays) {
        x.globalAlpha = 0.13; x.fillStyle = 'rgb(' + S.sun.glow + ')';
        const rot = t * 0.5 * dir;
        for (let i = 0; i < 18; i++) {
          const a0 = rot + (i / 18) * Math.PI * 2, a1 = a0 + 0.07;
          x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a0) * W * 1.5, sy + Math.sin(a0) * W * 1.5); x.lineTo(sx + Math.cos(a1) * W * 1.5, sy + Math.sin(a1) * W * 1.5); x.closePath(); x.fill();
        }
        x.globalAlpha = 1;
      }
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = S.sun.core; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    }
    if (S.clouds) {
      const [r, g, b] = S.clouds.col;
      st.clouds.forEach((c) => {
        const cw = W * c.w, ch = cw * 0.32, cx0 = ((c.x - t * c.v * dir) % 1.4 + 1.4) % 1.4 - 0.2, cx = -skew + cx0 * BW, cyy = top + SH * c.y;
        for (let k = 0; k < 5; k++) {
          const px = cx + (k - 2) * cw * 0.2, py = cyy - Math.sin(k + c.seed * 6) * ch * 0.25, pr = ch * (0.55 + 0.25 * Math.sin(k * 2.3 + c.seed * 9));
          const gg = x.createRadialGradient(px, py, 0, px, py, pr);
          gg.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + S.clouds.a + ')'); gg.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
          x.fillStyle = gg; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
        }
      });
    }
    // lightning: a flash over everything and a bolt down to the horizon
    st.bolts.forEach((B) => {
      const u = (t - B.at) / 0.07;
      if (u < 0 || u > 1) return;
      x.fillStyle = 'rgba(235,245,255,' + (0.55 * (1 - u)) + ')'; x.fillRect(-skew, top, BW, bot - top);
      x.strokeStyle = 'rgba(255,255,255,' + (1 - u * 0.6) + ')'; x.lineWidth = 2.6; x.shadowColor = '#cfe6ff'; x.shadowBlur = 14;
      x.beginPath(); B.pts.forEach(([px, py], i) => { const X = -skew + px * BW, Y = top + py * SH; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.stroke();
      x.shadowBlur = 0;
    });
    // the silhouettes slide by, far ones slower
    st.layers.forEach((L) => {
      const shift = (t - 0.5) * W * L.par * march * -dir;
      x.drawImage(L.c, -skew - W * 0.3 + shift, hor - L.h, L.w, L.h + 2);
    });
    // fires and their smoke over the village
    if (st.fires.length) st.fires.forEach((f) => {
      const shift = (t - 0.5) * W * f.par * march * -dir, fx = -skew + f.x + shift, fy = f.y, fl = 0.75 + 0.25 * Math.sin(t * 40 + f.ph);
      x.globalCompositeOperation = 'lighter';
      const fg = x.createRadialGradient(fx, fy, 0, fx, fy, f.s * 1.3 * fl);
      fg.addColorStop(0, 'rgba(255,220,120,0.9)'); fg.addColorStop(0.35, 'rgba(255,120,40,0.55)'); fg.addColorStop(1, 'rgba(255,60,20,0)');
      x.fillStyle = fg; x.fillRect(fx - f.s * 1.4, fy - f.s * 1.4, f.s * 2.8, f.s * 2.8);
      x.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 4; k++) {   // smoke rising
        const u = ((t * 0.9 + k * 0.25 + f.ph) % 1), py = fy - u * SH * 0.7, pr = f.s * (0.4 + u * 1.2);
        const sg = x.createRadialGradient(fx + Math.sin(u * 4 + f.ph) * pr * 0.3, py, 0, fx, py, pr);
        sg.addColorStop(0, 'rgba(40,30,36,' + (0.45 * (1 - u)) + ')'); sg.addColorStop(1, 'rgba(40,30,36,0)');
        x.fillStyle = sg; x.fillRect(fx - pr, py - pr, pr * 2, pr * 2);
      }
    });
    // birds over the forest
    st.birds.forEach((b, i) => {
      const u = (t * 0.55 + 0.1) % 1.2, bx = -skew + (dir > 0 ? u : 1 - u) * BW + b.dx * W * dir * -1, by = top + SH * (b.y + b.dy);
      const flap = Math.sin(t * 30 + b.ph) * 0.5, s = Math.max(5, W * 0.012);
      x.strokeStyle = 'rgba(20,28,24,0.75)'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(bx - s, by - s * flap); x.quadraticCurveTo(bx - s * 0.4, by - s * 0.5, bx, by); x.quadraticCurveTo(bx + s * 0.4, by - s * 0.5, bx + s, by - s * flap); x.stroke();
    });
    // the ground: a bright haze at the horizon fading into the dark
    const gg = x.createLinearGradient(0, hor, 0, bot);
    gg.addColorStop(0, S.haze); gg.addColorStop(0.06, S.ground[0]); gg.addColorStop(0.5, S.ground[1]); gg.addColorStop(1, '#000');
    x.fillStyle = gg; x.fillRect(-skew, hor, BW, bot - hor);
    // dust clouds kicked up behind a charge
    st.plumes.forEach((p) => {
      const u = ((p.x + t * 0.5 * -dir) % 1 + 1) % 1, px = -skew + u * BW, py = hor + (bot - hor) * 0.2, pr = (bot - top) * p.r * (0.8 + 0.4 * Math.sin(t * 3 + p.ph * 6));
      const pg = x.createRadialGradient(px, py, 0, px, py, pr * 2);
      pg.addColorStop(0, 'rgba(255,200,140,0.28)'); pg.addColorStop(1, 'rgba(255,200,140,0)');
      x.fillStyle = pg; x.fillRect(px - pr * 2, py - pr * 2, pr * 4, pr * 4);
    });
  }
  /* weather in front of the army */
  function drawFront(st, G, t, dir, vis) {
    const S = st.S, { top, hor, bot, skew } = G, BW = W + skew * 2, BH = bot - top;
    const w = S.weather;
    if (w === 'rain') {
      x.strokeStyle = 'rgba(200,220,236,0.42)'; x.lineWidth = 1.2;
      x.beginPath();
      st.bits.forEach((d) => {
        const y = top + (((d.y + t * (2.2 + d.v)) % 1) * BH), px = -skew + ((d.x + t * 0.25) % 1) * BW, len = BH * (0.05 + d.r * 0.02);
        x.moveTo(px, y); x.lineTo(px - len * 0.35, y + len);
      });
      x.stroke();
    } else if (w === 'embers') {
      x.globalCompositeOperation = 'lighter';
      st.bits.forEach((e) => {
        const u = (e.y + t * (0.4 + e.v * 0.5)) % 1, px = -skew + (e.x + Math.sin(t * 3 + e.ph) * 0.02) * BW, py = bot - u * BH;
        x.globalAlpha = (1 - u) * (0.5 + 0.5 * Math.sin(t * 30 + e.ph)) * vis;
        x.fillStyle = e.hue < 0.5 ? '#ffb347' : '#ff6a2a'; x.beginPath(); x.arc(px, py, e.r * 0.9, 0, Math.PI * 2); x.fill();
      });
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    } else if (w === 'petals' || w === 'confetti' || w === 'leaves') {
      const cols = w === 'petals' ? ['#ffd6e4', '#fff4f8', '#ffb8cf'] : w === 'leaves' ? ['#e07a2c', '#c4471f', '#e8b04a'] : ['#f2c14e', '#e0566a', '#4fa3e0', '#7ed36b', '#fff4d6'];
      st.bits.forEach((p, i) => {
        const u = (p.y + t * (0.35 + p.v * 0.3)) % 1, px = -skew + ((p.x + t * 0.12 * dir + Math.sin(t * 4 + p.ph) * 0.03) % 1 + 1) % 1 * BW, py = top + u * BH;
        x.save(); x.translate(px, py); x.rotate(p.ph + t * p.spin); x.globalAlpha = 0.85 * vis;
        x.fillStyle = cols[i % cols.length];
        if (w === 'confetti') x.fillRect(-p.r * 1.6, -p.r * 0.7, p.r * 3.2, p.r * 1.4);
        else { x.beginPath(); x.ellipse(0, 0, p.r * (w === 'leaves' ? 2.4 : 1.9), p.r * (w === 'leaves' ? 1.2 : 1.1), 0, 0, Math.PI * 2); x.fill(); }
        x.restore();
      });
      x.globalAlpha = 1;
    } else if (w === 'mist' || w === 'fog') {
      for (let i = 0; i < 5; i++) {
        const fx = ((i * 0.27 + t * 0.22 * dir) % 1.3 + 1.3) % 1.3 * W - W * 0.15, fy = top + BH * (0.35 + 0.12 * i);
        const fg = x.createRadialGradient(fx, fy, 0, fx, fy, W * 0.38);
        const a = w === 'fog' ? 0.42 : 0.3;
        fg.addColorStop(0, 'rgba(232,240,236,' + a + ')'); fg.addColorStop(1, 'rgba(232,240,236,0)');
        x.fillStyle = fg; x.fillRect(-skew, top, BW, BH);
      }
    } else {   // dust
      x.fillStyle = S.haze;
      st.bits.forEach((p) => {
        const px = ((p.x - t * p.v * 0.6 * dir) % 1 + 1) % 1, py = hor + (bot - hor) * (0.02 + p.y * 0.9);
        x.globalAlpha = p.a * vis * 0.6; x.beginPath(); x.arc(-skew + px * BW, py, p.r, 0, Math.PI * 2); x.fill();
      });
      x.globalAlpha = 1;
    }
  }

  /* d = { mine, rank, fog, sum, cards: [ids], wilds: {id: {color, value}}, colors: [css], mode: 'full'|'short', speed, oppName, seed } */
  function formation(d) {
    if (running) running.finish();
    resize();
    const th = d.fog ? THEME.fog : d.mine ? THEME.me : THEME.op;
    const R = RANKS[d.fog ? 0 : d.rank], dir = d.mine ? 1 : -1;
    const short = d.mode === 'short';
    const total = (short ? 1.1 : 2.2) / Math.max(0.5, d.speed || 1);
    const rnd = seeded(d.seed != null ? d.seed : (Math.random() * 4294967296) >>> 0);
    const looks = STAGES[d.fog ? 'fog' : d.rank], S = d.look != null ? looks[d.look % looks.length] : looks[Math.floor(rnd() * looks.length)];
    const units = d.cards.slice().sort((a, b) => (b % 10) - (a % 10)).map((c) => unitOf(c, d.wilds && d.wilds[c]));
    const army = short ? [] : formationLayout(d.fog ? -1 : d.rank, d.fog, units, rnd);
    // the band: a slanted strip across the table
    const tall = H > W * 1.05;
    const bh = short ? Math.min(H * 0.3, 200) : tall ? Math.min(H * 0.52, 440) : Math.min(H * 0.74, 320);
    const cy = H * (tall ? 0.46 : 0.5), skew = W * 0.05;
    const top = cy - bh / 2 - skew * 0.4, bot = cy + bh / 2 + skew * 0.4;
    const G = { tall, bh, cy, skew, top, bot, hor: top + (bot - top) * (short ? 0.7 : tall ? 0.6 : 0.66) };
    const stage = buildStage(S, G, rnd, th.banner, dir);
    const faces = d.cards.map((c) => { const k = document.createElement('canvas'); k.width = 204; k.height = 286; paintCard(k.getContext('2d'), c, 0, 0, 204, 286); return k; });
    cv.classList.add('on');
    let t0 = performance.now(), resolveP, finished = false, skipAt = -1;
    skipReq = false;
    const p = new Promise((res) => { resolveP = res; });
    function finish() { if (finished) return; finished = true; cv.classList.remove('on'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); running = null; if (d.onEnd) d.onEnd(); resolveP(); }
    running = { finish };
    if (opts.onStart) opts.onStart(d);

    function frame(now) {
      if (finished) return;
      let t = (now - t0) / 1000 / total;            // 0..1 over the whole scene
      if (skipReq && skipAt < 0) { skipAt = t; }
      if (skipAt >= 0) t = Math.max(t, 0.86 + (t - skipAt) * 3);
      if (t >= 1) { finish(); return; }
      draw(t);
      requestAnimationFrame(frame);
    }
    function draw(t) {
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      x.clearRect(0, 0, W, H);
      const inT = clamp(t / 0.12, 0, 1), outT = clamp((t - 0.86) / 0.14, 0, 1);
      const vis = easeOut(inT) * (1 - easeIn(outT));
      const { tall, bh, cy, skew, top, bot, hor } = G;
      // dim the table
      x.fillStyle = 'rgba(4,7,10,' + (0.66 * vis) + ')'; x.fillRect(0, 0, W, H);
      const slide = (1 - easeOut(inT)) * W * 1.2 * dir + easeIn(outT) * -W * 1.2 * dir;
      x.save();
      x.translate(slide, 0);
      x.beginPath();
      x.moveTo(-skew, cy - bh / 2 + skew * 0.35); x.lineTo(W + skew, cy - bh / 2 - skew * 0.35);
      x.lineTo(W + skew, cy + bh / 2 - skew * 0.35); x.lineTo(-skew, cy + bh / 2 + skew * 0.35); x.closePath();
      x.save(); x.clip();
      drawBack(stage, G, t, dir, S.march);
      // the army on the horizon: farther ranks smaller and higher; all of it marching toward dir
      if (army.length) {
        const march = (t - 0.45) * W * 0.14 * dir * S.march;
        const base = Math.min(bh * (tall ? 0.24 : 0.3), W * (tall ? 0.2 : 0.12));
        const spread = tall ? W * 0.42 : W * 0.3;
        const ax = W * 0.5;
        const sorted = army.slice().sort((a, b) => b.z - a.z);
        for (const u of sorted) {
          const depth = 1 - u.z * 0.5;                        // 1 front .. 0.5 back
          const sz = base * depth * u.s;
          const gx = ax + u.x * spread * dir + march * depth;
          const gy = hor + (bot - hor) * (0.03 + (1 - u.z) * (tall ? 0.6 : 0.5));
          const bob = Math.abs(Math.sin((t * 9 * Math.max(0.6, S.march) + u.j * 6) * (u.run ? 1.6 : 1))) * sz * 0.06;
          const img = sprite(u.u, S.ink, dir < 0 ? !u.flip : !!u.flip);
          if (S.fade) x.globalAlpha = 0.55 + 0.45 * (1 - u.z);   // the haze swallows the back ranks
          x.drawImage(img, gx - sz / 2, gy - sz * 0.92 - bob, sz, sz);
          if (u.spear) { x.strokeStyle = S.ink; x.lineWidth = Math.max(1.2, sz * 0.04); x.beginPath(); x.moveTo(gx - sz * 0.15 * dir, gy - sz * 0.62 - bob); x.lineTo(gx + sz * 0.75 * dir, gy - sz * 1.05 - bob); x.stroke(); }
          if (u.banner) {
            x.fillStyle = S.ink; x.fillRect(gx - sz * 0.02, gy - sz * 1.7 - bob, Math.max(1.5, sz * 0.045), sz * 1.1);
            x.fillStyle = (d.colors && d.colors[0]) || th.banner;
            const wave = Math.sin(t * 12 + u.j * 5) * sz * 0.05;
            x.beginPath(); x.moveTo(gx, gy - sz * 1.7 - bob); x.lineTo(gx + sz * 0.5 * dir, gy - sz * 1.58 - bob + wave); x.lineTo(gx, gy - sz * 1.4 - bob); x.closePath(); x.fill();
          }
          x.globalAlpha = 1;
        }
      }
      drawFront(stage, G, t, dir, vis);
      // speed lines
      x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 1.2;
      for (let i = 0; i < S.speed; i++) {
        const yy = top + (bot - top) * ((i * 0.37 + 0.07) % 1), len = W * (0.12 + ((i * 0.53) % 0.2)), ph = ((t * 2.4 + i * 0.29) % 1.2 - 0.1);
        const xx = dir > 0 ? ph * W * 1.2 - len : W - ph * W * 1.2;
        x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + len, yy); x.stroke();
      }
      // whose it is: the other side's scene is edged in red
      if (!d.mine && !d.fog) {
        for (const [y0, y1] of [[top, top + bh * 0.22], [bot, bot - bh * 0.22]]) {
          const eg = x.createLinearGradient(0, y0, 0, y1); eg.addColorStop(0, 'rgba(200,30,60,0.32)'); eg.addColorStop(1, 'rgba(200,30,60,0)');
          x.fillStyle = eg; x.fillRect(-skew, Math.min(y0, y1), W + 2 * skew, Math.abs(y1 - y0));
        }
      }
      x.restore();
      // bright edges of the band
      x.strokeStyle = th.band; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-skew, cy - bh / 2 + skew * 0.35); x.lineTo(W + skew, cy - bh / 2 - skew * 0.35); x.stroke();
      x.beginPath(); x.moveTo(-skew, cy + bh / 2 + skew * 0.35); x.lineTo(W + skew, cy + bh / 2 - skew * 0.35); x.stroke();
      x.restore();

      // the title
      const tt = clamp((t - 0.08) / 0.15, 0, 1);
      if (tt > 0) {
        const s = tt < 1 ? 1.9 - 0.9 * easeBack(tt) : 1;
        const label = d.fog ? '合計勝負' : R.name;
        const fs = short ? Math.min(W * 0.16, bh * 0.4, 96) : tall ? Math.min(W * (label.length > 2 ? 0.17 : 0.22), bh * 0.26, 120) : Math.min(W * (label.length > 2 ? 0.1 : 0.13), bh * 0.34, 118);
        const tx = tall || short ? W * 0.5 : W * (d.mine ? 0.32 : 0.68);
        const ty = short ? cy - bh * 0.06 : tall ? top + bh * 0.26 : cy - bh * 0.12;
        x.save();
        x.globalAlpha = Math.min(1, tt * 2) * (1 - easeIn(outT));
        x.translate(tx + slide * 0.3, ty); x.rotate(-0.06 * dir); x.scale(s, s);
        x.font = '400 ' + Math.round(fs) + 'px ' + TITLE_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineJoin = 'round';
        x.shadowColor = th.glow; x.shadowBlur = fs * 0.4;
        x.lineWidth = fs * 0.17; x.strokeStyle = 'rgba(10,4,2,0.92)'; x.strokeText(label, 0, 0);
        x.shadowBlur = 0;
        const tg = x.createLinearGradient(0, -fs * 0.5, 0, fs * 0.5);
        tg.addColorStop(0, th.title[0]); tg.addColorStop(0.55, th.title[1]); tg.addColorStop(1, th.title[2]);
        x.fillStyle = tg; x.fillText(label, 0, 0);
        const sh = clamp((t - 0.26) / 0.25, 0, 1);   // a shine sweeping across the letters
        if (sh > 0 && sh < 1) {
          x.save(); x.globalCompositeOperation = 'source-atop';
          const sw = x.createLinearGradient(-fs * 2 + sh * fs * 4, 0, -fs * 1.4 + sh * fs * 4, 0);
          sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, 'rgba(255,255,255,0.9)'); sw.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = sw; x.fillText(label, 0, 0); x.restore();
        }
        const small = Math.max(11, Math.min(fs * 0.2, 19));
        x.font = '900 ' + Math.round(small) + 'px ' + UI_FONT;
        const whoTxt = d.mine ? 'あなたの陣形' : (d.oppName || '相手') + 'の陣形';
        x.fillStyle = th.title[0]; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.lineWidth = small * 0.3;
        x.strokeText(whoTxt, 0, -fs * 0.74); x.fillText(whoTxt, 0, -fs * 0.74);
        x.font = '700 ' + Math.round(small * 0.95) + 'px ' + NUM_FONT;
        const en = d.fog ? 'FOG · 合計 ' + d.sum : R.en + ' · 合計 ' + d.sum;
        x.strokeText(en, 0, fs * 0.74); x.fillText(en, 0, fs * 0.74);
        if (!d.fog) {   // rank stars
          const st = small * 1.2;
          for (let i = 0; i < 5; i++) {
            x.fillStyle = i < R.stars ? th.title[1] : 'rgba(255,255,255,0.22)';
            x.strokeStyle = 'rgba(10,4,2,0.85)'; x.lineWidth = Math.max(2, st * 0.16);
            star(x, (i - 2) * st * 1.3, fs * 0.74 + small * 1.45, st * 0.52); x.stroke(); x.fill();
          }
        }
        x.restore();
      }
      // the cards that made it: flying in, then fanned out
      const n = faces.length;
      const cwid = short ? Math.min(W * 0.1, bh * 0.36, 70) : tall ? Math.min(W * 0.15, bh * 0.19, 84) : Math.min(W * 0.1, bh * 0.36, 92), chgt = cwid * 1.4;
      const cxs = short ? W * (d.mine ? 0.84 : 0.16) : tall ? W * 0.5 : W * (d.mine ? 0.77 : 0.23);
      const cys = short ? cy + bh * 0.05 : tall ? bot - bh * 0.15 : cy + bh * 0.04;
      for (let i = 0; i < n; i++) {
        const ct = clamp((t - 0.16 - i * 0.06) / 0.2, 0, 1);
        if (ct <= 0) continue;
        const e = easeBack(ct);
        const fx2 = cxs + (i - (n - 1) / 2) * cwid * 0.74;
        const fy = cys + Math.abs(i - (n - 1) / 2) * cwid * 0.08;
        const ox = fx2 + (1 - e) * W * 0.7 * dir + slide, rot = (i - (n - 1) / 2) * 0.14 + (1 - e) * 0.8 * dir;
        x.save();
        x.globalAlpha = 1 - easeIn(outT);
        x.translate(ox, fy); x.rotate(rot);
        x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 16; x.shadowOffsetY = 6;
        x.drawImage(faces[i], -cwid / 2, -chgt / 2, cwid, chgt);
        x.shadowColor = 'transparent';
        if (ct >= 1 && t < 0.6) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = (0.6 - t) * 1.3; x.fillStyle = th.glow; roundRect(x, -cwid / 2, -chgt / 2, cwid, chgt, cwid * 0.1); x.fill(); }
        x.restore();
      }
      // the opening flash
      if (t < 0.1) { x.fillStyle = 'rgba(255,255,255,' + (0.6 * (1 - t / 0.1)) + ')'; x.fillRect(0, 0, W, H); }
    }
    if (d.freezeAt != null) { draw(d.freezeAt); return p; }
    requestAnimationFrame(frame);
    setTimeout(finish, total * 1000 + 2500);   // never hold the game up if frames stop coming
    return p;
  }
  function star(g, cx, cy, r) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; const px = cx + Math.cos(a) * q, py = cy + Math.sin(a) * q; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.closePath(); g.fill();
  }
  function roundRect(g, X, Y, w, h, r) { g.beginPath(); g.moveTo(X + r, Y); g.arcTo(X + w, Y, X + w, Y + h, r); g.arcTo(X + w, Y + h, X, Y + h, r); g.arcTo(X, Y + h, X, Y, r); g.arcTo(X, Y, X + w, Y, r); g.closePath(); }
  return { formation, resize, get busy() { return !!running; }, skip() { if (running) skipReq = true; }, clear() { if (running) running.finish(); }, RANKS, STAGES };
}
