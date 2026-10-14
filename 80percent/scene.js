/* 80% — the 3D table (three.js r160, loaded from a CDN). Everything is procedural: no image files.
   World: metres, y up. The table top is at y = TY. The glass stands on z = 0.
   Side 0 is always the local player (camera side, z > 0); side 1 sits across the glass (z < 0).
   Each side has a root rotated by 180°, so both halves share the same "side-local" layout.  */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.EIGHTY_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

/* ------------------------------------------------------------------ constants */
const TY = 0.76;                               // table top
const HOME_X = [-0.36, -0.18, 0, 0.18, 0.36];
const HOME_Z = [0.47, 0.605];                  // front row (index 0-4), back row (5-9)
const TRAY_Z = [0.27, 0.14];                   // tray row used by home row 0 / 1
const TRAY = { x0: -0.46, x1: 0.46, z0: 0.08, z1: 0.38 };
const DOOR_Y = TY - 0.004;                     // money in the tray rests here
const IOU = { x: 0.68, z: 0.25 };
const SLOT_X = 0.68;                           // the pass-through slot under the glass (world x)
const GOLD_LAMPS = [0, 1, 2, 3, 5, 6, 7, 8], RED_LAMPS = [4, 9];
const MAX_PILE_H = 0.13;                       // taller piles are squashed so they never hide the tray

const DEN = [
  { k: 'case', v: 1e8, h: 0.087 },
  { k: 'brick', v: 1e7, h: 0.0505 },
  { k: 'bundle', v: 1e6, h: 0.0102 },
  { k: 'b10k', v: 1e4, h: 0.0002, bill: 1, L: 0.160 },
  { k: 'b5k', v: 5e3, h: 0.0002, bill: 1, L: 0.156 },
  { k: 'b1k', v: 1e3, h: 0.0002, bill: 1, L: 0.150 },
  { k: 'c500', v: 500, h: 0.0018, r: 0.01325, coin: 1 },
  { k: 'c100', v: 100, h: 0.0017, r: 0.0113, coin: 1 },
  { k: 'c50', v: 50, h: 0.0017, r: 0.0105, coin: 1, hole: 1 },
  { k: 'c10', v: 10, h: 0.0015, r: 0.01175, coin: 1 }
];
const DENK = {}; DEN.forEach((d, i) => { d.i = i; DENK[d.k] = d; });
const CAP = { case: 160, brick: 260, bundle: 460, b10k: 4400, b5k: 520, b1k: 1000, c500: 520, c100: 1100, c50: 520, c10: 1100 };

export function breakdown(a) {
  const c = {};
  for (const d of DEN) { const n = Math.floor(a / d.v + 1e-9); c[d.k] = n; a -= n * d.v; }
  return c;
}

/* ------------------------------------------------------------------ small helpers */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const EASE = {
  lin: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  drop: (t) => { if (t < 0.72) { const u = t / 0.72; return u * u; } const u = (t - 0.72) / 0.28; return 1 - Math.abs(Math.sin(u * Math.PI * 2)) * 0.05 * (1 - u); },
  float: (t) => 1 - Math.pow(1 - t, 2.2)
};
function hrand(a, b, c) {   // deterministic noise in [-1, 1]
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
const rnd = (a = 1) => (Math.random() * 2 - 1) * a;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Noto Serif CJK JP",serif';
const SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic",sans-serif';

/* ------------------------------------------------------------------ canvas art */
function noiseFill(x, w, h, amt, mono = true) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += n * 0.7; d[i + 1] += n; d[i + 2] += n * 0.85; }
  }
  x.putImageData(img, 0, 0);
}
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv(w, h), x = out.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  const H = (px, py) => src[((((py + h) % h) * w + ((px + w) % w)) << 2)] / 255;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const dx = (H(px + 1, py) - H(px - 1, py)) * strength, dy = (H(px, py + 1) - H(px, py - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (py * w + px) << 2;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return out;
}
function blurred(c, px) { const o = cv(c.width, c.height), x = o.getContext('2d'); x.filter = `blur(${px}px)`; x.drawImage(c, 0, 0); return o; }

function feltCanvas() {
  const S = 512, c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = '#7d8a83'; x.fillRect(0, 0, S, S);       // neutral: tinted by the material colour
  noiseFill(x, S, S, 26);
  x.globalAlpha = 0.07;
  for (let i = 0; i < 3200; i++) {
    x.strokeStyle = Math.random() < 0.5 ? '#ffffff' : '#000000'; x.lineWidth = 1;
    const px = Math.random() * S, py = Math.random() * S, a = Math.random() * Math.PI, l = 2 + Math.random() * 6;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  x.globalAlpha = 1;
  return c;
}
function leatherCanvas() {
  const S = 256, c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + Math.random() * 0.08})`;
    x.beginPath(); x.ellipse(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 1 + Math.random() * 4, Math.random() * 3, 0, Math.PI * 2); x.fill();
  }
  noiseFill(x, S, S, 30);
  return blurred(c, 1.2);
}
function woodCanvas() {
  const W = 512, H = 128, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#3a2216'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const y0 = Math.random() * H, a = 1 + Math.random() * 3;
    x.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,5' : '90,55,35'},${0.25 + Math.random() * 0.3})`; x.lineWidth = 0.6 + Math.random() * 1.8;
    x.beginPath();
    for (let px = 0; px <= W; px += 8) { const py = y0 + Math.sin(px * 0.01 + i) * a + Math.sin(px * 0.05 + i * 3) * 0.6; px ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  noiseFill(x, W, H, 14, false);
  return c;
}
function concreteCanvas() {
  const S = 512, c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const v = Math.random() < 0.5 ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${v},${0.05 + Math.random() * 0.07})`); g.addColorStop(1, `rgba(${v},0)`);
    x.save(); x.translate(Math.random() * S, Math.random() * S); x.scale(20 + Math.random() * 90, 20 + Math.random() * 90);
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
  }
  noiseFill(x, S, S, 22);
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
  return c;
}
function streakCanvas() {   // soft diagonal reflections that make the glass readable
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d');
  for (const [x0, w, a] of [[0.08, 0.1, 0.07], [0.22, 0.04, 0.05], [0.62, 0.14, 0.05], [0.8, 0.05, 0.04]]) {
    x.save(); x.translate(W * x0, 0); x.transform(1, 0, -0.55, 1, 0, 0);
    const g = x.createLinearGradient(0, 0, W * w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(235,245,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W * w, H); x.restore();
  }
  const v = x.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  return c;
}
function glowCanvas() {
  const S = 128, c = cv(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}
function smudgeCanvas() {
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const px = Math.random() * W, py = H * (0.45 + Math.random() * 0.55), r = 6 + Math.random() * 26;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.18})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 6; i++) {     // wiped streaks
    x.lineWidth = 8 + Math.random() * 16; x.beginPath();
    const y0 = Math.random() * H; x.moveTo(-10, y0); x.bezierCurveTo(W * 0.3, y0 + rnd(60), W * 0.6, y0 + rnd(60), W + 10, y0 + rnd(40)); x.stroke();
  }
  return c;
}

/* coins: height map → normal map + albedo */
const COIN_ART = {
  c500: { metal: [216, 192, 128], label: '500', ring: [228, 222, 205], beads: 1, reed: 1 },
  c100: { metal: [214, 217, 220], label: '100', beads: 1, reed: 1 },
  c50: { metal: [221, 223, 226], label: '50', hole: 0.19, reed: 1 },
  c10: { metal: [184, 112, 70], label: '10', leaves: 1, reed: 0 }
};
function coinArt(k) {
  const A = COIN_ART[k], S = 256, C = S / 2, R = S / 2 - 2;
  const hc = cv(S, S), x = hc.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.fillStyle = 'rgb(70,70,70)'; x.beginPath(); x.arc(C, C, R, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = S * 0.055; x.beginPath(); x.arc(C, C, R - S * 0.03, 0, Math.PI * 2); x.stroke();
  if (A.beads) { x.fillStyle = '#d8d8d8'; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; x.beginPath(); x.arc(C + Math.cos(a) * R * 0.83, C + Math.sin(a) * R * 0.83, S * 0.011, 0, Math.PI * 2); x.fill(); } }
  if (A.ring) { x.strokeStyle = 'rgb(150,150,150)'; x.lineWidth = S * 0.012; x.beginPath(); x.arc(C, C, R * 0.72, 0, Math.PI * 2); x.stroke(); }
  if (A.leaves) {
    x.fillStyle = '#c8c8c8';
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + s * (0.5 + i * 0.27);
      x.save(); x.translate(C + Math.cos(a) * R * 0.66, C + Math.sin(a) * R * 0.66); x.rotate(a + s * 0.9);
      x.beginPath(); x.ellipse(0, 0, S * 0.045, S * 0.018, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
  }
  if (k === 'c100') {   // three cherry blossoms around the numeral
    x.fillStyle = '#cfcfcf';
    for (const [fx, fy, fr] of [[0.5, 0.25, 0.085], [0.27, 0.66, 0.07], [0.73, 0.66, 0.07]]) {
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.arc(S * fx + Math.cos(a) * S * fr * 0.55, S * fy + Math.sin(a) * S * fr * 0.55, S * fr * 0.5, 0, Math.PI * 2); x.fill(); }
    }
  }
  if (k === 'c50') {    // chrysanthemum petals around the hole
    x.fillStyle = '#c8c8c8';
    for (let p = 0; p < 16; p++) { const a = p / 16 * Math.PI * 2; x.save(); x.translate(C + Math.cos(a) * R * 0.34, C + Math.sin(a) * R * 0.34); x.rotate(a); x.beginPath(); x.ellipse(0, 0, S * 0.06, S * 0.022, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  }
  x.fillStyle = '#f2f2f2'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = A.label.length >= 3 ? S * 0.30 : S * 0.36;
  x.font = `900 ${fs}px "Arial Black","Helvetica Neue",Arial,sans-serif`;
  if (k === 'c50') { x.font = `900 ${S * 0.2}px "Arial Black",Arial,sans-serif`; x.fillText(A.label, C, C + R * 0.62); }
  else x.fillText(A.label, C, C + (k === 'c100' ? S * 0.06 : S * 0.02));
  if (A.hole) { x.fillStyle = '#000'; x.beginPath(); x.arc(C, C, R * A.hole, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = S * 0.03; x.beginPath(); x.arc(C, C, R * A.hole + S * 0.02, 0, Math.PI * 2); x.stroke(); }
  const soft = blurred(hc, 1.4);
  const nrm = normalFromHeight(soft, 3.2);
  // albedo: metal tone, recesses a touch darker, fine wear
  const ac = cv(S, S), ax = ac.getContext('2d');
  const hd = soft.getContext('2d').getImageData(0, 0, S, S).data, img = ax.createImageData(S, S), d = img.data;
  const ringM = A.ring ? [205, 200, 186] : null;
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const i = (py * S + px) << 2, hgt = hd[i] / 255, r = Math.hypot(px - C, py - C) / R;
    const m = ringM && r > 0.5 && r < 0.72 ? ringM : A.metal;
    const f = (0.78 + 0.26 * hgt) * (0.97 + Math.random() * 0.06);
    d[i] = clamp(m[0] * f, 0, 255); d[i + 1] = clamp(m[1] * f, 0, 255); d[i + 2] = clamp(m[2] * f, 0, 255); d[i + 3] = 255;
  }
  ax.putImageData(img, 0, 0);
  let alpha = null;
  if (A.hole) { alpha = cv(S, S); const al = alpha.getContext('2d'); al.fillStyle = '#fff'; al.fillRect(0, 0, S, S); al.fillStyle = '#000'; al.beginPath(); al.arc(C, C, R * A.hole, 0, Math.PI * 2); al.fill(); }
  return { albedo: ac, normal: nrm, alpha };
}
function reedCanvas() {
  const W = 64, H = 4, c = cv(W, H), x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#202020' : '#e0e0e0'; x.fillRect(i * 8, 0, 8, H); }
  return normalFromHeight(blurred(c, 1), 1.6);
}

/* bank notes — a made-up bank, so nothing here imitates real currency */
const BILL = {
  b10k: { label: '10000', kanji: '壱萬圓', base: '#bfa47a', ink: '#4e321c', ink2: '#7a5432', holo: 1 },
  b5k: { label: '5000', kanji: '五千圓', base: '#ab93b8', ink: '#3f2654', ink2: '#664783', holo: 1 },
  b1k: { label: '1000', kanji: '千圓', base: '#93adc4', ink: '#1d3d5c', ink2: '#3f6a8e', holo: 0 }
};
function rosette(x, cx, cy, r, col) {
  x.save(); x.strokeStyle = col; x.globalAlpha = 0.55; x.lineWidth = 0.9;
  for (let k = 0; k < 22; k++) {
    x.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
      const rr = r * (0.62 + 0.38 * Math.cos(6 * a + k * 0.29) * Math.cos(a * 2 + k));
      const px = cx + Math.cos(a + k * 0.14) * rr, py = cy + Math.sin(a + k * 0.14) * rr;
      a ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  x.globalAlpha = 1; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r * 1.04, 0, Math.PI * 2); x.stroke();
  x.restore();
}
function billCanvas(k, back) {
  const W = 512, H = 244, c = cv(W, H), x = c.getContext('2d'), B = BILL[k];
  x.fillStyle = B.base; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = B.ink2; x.lineWidth = 0.9; x.globalAlpha = 0.34;
  for (let i = 0; i < 30; i++) {
    x.beginPath();
    for (let px = 0; px <= W; px += 4) { const py = H * 0.5 + Math.sin(px * 0.034 + i * 0.47) * H * 0.33 * Math.sin(i * 0.2 + 0.6) + (i - 15) * 2.4; px ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  x.globalAlpha = 1;
  // coloured bands top and bottom: what tells the notes apart from across the table
  x.fillStyle = B.ink2; x.globalAlpha = 0.55; x.fillRect(0, 0, W, 26); x.fillRect(0, H - 26, W, 26); x.globalAlpha = 1;
  x.strokeStyle = B.ink; x.lineWidth = 7; x.strokeRect(9, 9, W - 18, H - 18);
  x.lineWidth = 1.4; x.strokeRect(21, 21, W - 42, H - 42);
  x.fillStyle = B.ink2; x.globalAlpha = 0.28; x.beginPath(); x.arc(back ? W * 0.5 : W * 0.73, H * 0.5, H * 0.31, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
  rosette(x, back ? W * 0.5 : W * 0.73, H * 0.5, H * 0.3, B.ink);
  x.fillStyle = B.ink; x.textBaseline = 'middle';
  if (!back) {
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.ellipse(W * 0.3, H * 0.52, H * 0.22, H * 0.28, 0, 0, Math.PI * 2); x.fill();
    if (B.holo) {
      const hg = x.createLinearGradient(0, 0, 0, H);
      ['#d8d8e0', '#b8e0d8', '#e6d0f0', '#f0e6c0', '#c8d8f0'].forEach((c2, i, a) => hg.addColorStop(i / (a.length - 1), c2));
      x.fillStyle = hg; x.fillRect(34, 22, 24, H - 44);
    }
    x.fillStyle = B.ink;
    x.font = `700 21px ${SERIF}`; x.textAlign = 'center'; x.fillText('八十銀行券', W * 0.5, 44);
    x.font = `900 38px "Arial Black",Arial,sans-serif`; x.textAlign = 'left'; x.fillText(B.label, 70, 52);
    x.textAlign = 'right'; x.fillText(B.label, W - 34, H - 40);
    x.font = `700 34px ${SERIF}`; x.textAlign = 'center'; x.fillText(B.kanji, W * 0.5, H * 0.62);
    x.fillStyle = '#8a2b1c'; x.font = `600 16px "Courier New",monospace`; x.textAlign = 'left';
    x.fillText('EB 080080 Z', 70, H - 40); x.textAlign = 'right'; x.fillText('EB 080080 Z', W - 34, 52);
    x.fillStyle = 'rgba(176,32,24,0.85)'; x.beginPath(); x.arc(W * 0.6, H * 0.3, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f6e9d6'; x.font = `700 15px ${SERIF}`; x.textAlign = 'center'; x.fillText('八十', W * 0.6, H * 0.3 + 1);
  } else {
    x.font = `900 92px "Arial Black",Arial,sans-serif`; x.textAlign = 'center'; x.globalAlpha = 0.9; x.fillText(B.label, W * 0.5, H * 0.52); x.globalAlpha = 1;
    x.font = `700 17px "Arial",sans-serif`; x.fillText('THE EIGHTY BANK', W * 0.5, 40);
    x.font = `700 15px ${SERIF}`; x.fillText(B.kanji, W * 0.5, H - 36);
  }
  noiseFill(x, W, H, 10, false);
  return c;
}
function paperEdgeCanvas(W, H, bands) {
  const c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#e9e3d4'; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,80' : '255,255,255'},${0.06 + Math.random() * 0.14})`; x.fillRect(0, y, W, 1); }
  for (const b of bands || []) {
    x.fillStyle = '#f6f3ea'; x.fillRect(b[0] * W, 0, (b[1] - b[0]) * W, H);
    x.fillStyle = 'rgba(40,70,140,0.6)'; x.fillRect(b[0] * W + 2, H * 0.35, (b[1] - b[0]) * W - 4, H * 0.3);
  }
  return c;
}
function bundleTopCanvas(back) {
  const c = billCanvas('b10k', back), x = c.getContext('2d'), W = c.width, H = c.height, bw = 58;
  x.fillStyle = '#f4f0e6'; x.fillRect(W / 2 - bw / 2, 0, bw, H);
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; x.strokeRect(W / 2 - bw / 2, -1, bw, H + 2);
  x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.PI / 2);
  x.fillStyle = '#23407a'; x.font = `700 17px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('八十銀行　百萬圓', 0, -8);
  x.font = `600 12px "Courier New",monospace`; x.fillText('¥1,000,000', 0, 13);
  x.restore();
  x.fillStyle = 'rgba(180,30,25,0.85)'; x.beginPath(); x.arc(W / 2, H * 0.82, 11, 0, Math.PI * 2); x.fill();
  return c;
}
function stackCanvas(srcTop, rowsTop, W, H) {   // a block made of several bundle tops
  const c = cv(W, H), x = c.getContext('2d');
  for (let i = 0; i < rowsTop; i++) x.drawImage(srcTop, 0, i * H / rowsTop, W, H / rowsTop);
  return c;
}
function layeredCanvas(W, H, layers, bands) {
  const c = cv(W, H), x = c.getContext('2d'), one = paperEdgeCanvas(W, Math.ceil(H / layers), bands);
  for (let i = 0; i < layers; i++) { x.drawImage(one, 0, i * H / layers, W, H / layers); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, (i + 1) * H / layers - 1, W, 1); }
  return c;
}
function ridgeCanvas() {
  const S = 256, c = cv(S, S), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (const y0 of [0.33, 0.67]) { const g = x.createLinearGradient(0, S * (y0 - 0.06), 0, S * (y0 + 0.06)); g.addColorStop(0, '#808080'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#808080'); x.fillStyle = g; x.fillRect(0, S * (y0 - 0.06), S, S * 0.12); }
  noiseFill(x, S, S, 6);
  return normalFromHeight(c, 2.5);
}
function neonCanvas() {
  const W = 1024, H = 420, c = cv(W, H), x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 290px "Dela Gothic One","Arial Black",Impact,sans-serif`;
  x.lineJoin = 'round';
  x.shadowColor = '#ff1e4f'; x.shadowBlur = 48; x.strokeStyle = 'rgba(255,40,90,0.9)'; x.lineWidth = 22; x.strokeText('80%', W / 2, H / 2 + 10);
  x.shadowBlur = 18; x.strokeStyle = '#ff5a82'; x.lineWidth = 11; x.strokeText('80%', W / 2, H / 2 + 10);
  x.shadowBlur = 4; x.strokeStyle = '#ffe1ea'; x.lineWidth = 4; x.strokeText('80%', W / 2, H / 2 + 10);
  return c;
}
function decalCanvas() {   // gold print on the felt in front of each player
  const W = 1024, H = 384, c = cv(W, H), x = c.getContext('2d');
  x.strokeStyle = 'rgba(214,176,92,0.95)'; x.fillStyle = 'rgba(214,176,92,0.95)';
  x.lineWidth = 3;
  const r = 26, x0 = 16, y0 = 16, x1 = W - 16, y1 = H - 60;
  x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x1, y0, x1, y1, r); x.arcTo(x1, y1, x0, y1, r); x.arcTo(x0, y1, x0, y0, r); x.arcTo(x0, y0, x1, y0, r); x.closePath(); x.stroke();
  x.lineWidth = 1.2; x.strokeRect(x0 + 10, y0 + 10, x1 - x0 - 20, y1 - y0 - 20);
  x.font = `700 30px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('1 山 ＝ 10 %', W / 2, H - 30);
  x.font = `700 22px "Arial",sans-serif`; x.textAlign = 'left'; x.fillText('EIGHTY PERCENT', 40, H - 30);
  x.textAlign = 'right'; x.fillText('DOUBLE OR NOTHING', W - 40, H - 30);
  return c;
}
function doorCanvas() {
  const W = 1024, H = 336, c = cv(W, H), x = c.getContext('2d');
  x.fillStyle = '#7d8a83'; x.fillRect(0, 0, W, H); noiseFill(x, W, H, 24);
  x.fillStyle = 'rgba(232,196,110,0.22)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 200px "Dela Gothic One","Arial Black",sans-serif`; x.fillText('×2', W * 0.3, H / 2 + 8);
  x.font = `900 120px "Dela Gothic One","Arial Black",sans-serif`; x.fillText('80%', W * 0.72, H / 2 + 6);
  return c;
}

/* ------------------------------------------------------------------ sound (WebAudio, synthesised) */
class SFX {
  constructor() { this.ctx = null; this.on = true; this.last = {}; this.vol = 0.8; }
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? this.vol : 0;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this._ambience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setEnabled(v) { this.on = !!v; if (this.master) this.master.gain.setTargetAtTime(this.on ? this.vol : 0, this.ctx.currentTime, 0.05); }
  _ok(name, gap) {
    if (!this.ctx || !this.on || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t; return true;
  }
  _noise(t, dur, type, freq, q, gain, out) {
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(out || this.master); n.start(t, Math.random()); n.stop(t + dur + 0.05);
    return f;
  }
  _tone(t, type, f0, f1, dur, gain, out) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  coin(k = 'c100', vol = 0.35, when = 0) {
    if (!this._ok('coin', 0.028)) return;
    const c = this.ctx, t = c.currentTime + when;
    const base = { c500: 2500, c100: 3150, c50: 3500, c10: 2150 }[k] || 3000, f0 = base * (0.93 + Math.random() * 0.14);
    const out = c.createGain(); out.gain.value = vol; out.connect(this.master);
    [1, 2.31, 3.87, 5.42].forEach((m, i) => {
      const dur = 0.28 / (1 + i * 0.55) + Math.random() * 0.06;
      this._tone(t, 'sine', f0 * m, f0 * m, dur, 0.5 / (1 + i), out);
    });
    this._noise(t, 0.018, 'highpass', 3500, 0.7, 0.35, out);
  }
  paper(vol = 0.25) {
    if (!this._ok('paper', 0.05)) return;
    const t = this.ctx.currentTime; this._noise(t, 0.14 + Math.random() * 0.06, 'bandpass', 2200 + Math.random() * 900, 0.6, vol);
  }
  swish(vol = 0.3) {
    if (!this._ok('swish', 0.1)) return;
    const c = this.ctx, t = c.currentTime, f = this._noise(t, 0.38, 'bandpass', 700, 1.2, vol);
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.32);
  }
  tick(i = 0) {
    if (!this._ok('tick', 0.018)) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'square', 1700 + (i % 2) * 140, 1700, 0.018, 0.07);
    this._noise(t, 0.012, 'highpass', 4000, 0.7, 0.12);
  }
  beat() {
    if (!this._ok('beat', 0.3)) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 70, 42, 0.16, 0.5); this._tone(t + 0.19, 'sine', 64, 40, 0.14, 0.32);
  }
  win() {
    if (!this._ok('win', 0.3)) return;
    const t = this.ctx.currentTime;
    [880, 1109, 1319, 1760].forEach((f, i) => { this._tone(t + i * 0.07, 'triangle', f, f, 0.55, 0.16); this._tone(t + i * 0.07, 'sine', f * 2, f * 2, 0.4, 0.05); });
  }
  lose() {
    if (!this._ok('lose', 0.3)) return;
    const c = this.ctx, t = c.currentTime;
    this._tone(t, 'sine', 95, 38, 0.5, 0.6);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(this.master);
    this._tone(t + 0.02, 'sawtooth', 190, 110, 0.45, 0.12, lp);
  }
  clunk() {
    if (!this._ok('clunk', 0.15)) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.16, 'lowpass', 520, 0.8, 0.6); this._tone(t, 'sine', 80, 50, 0.2, 0.45);
  }
  stamp() {
    if (!this._ok('stamp', 0.15)) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sine', 150, 55, 0.14, 0.65); this._noise(t, 0.08, 'bandpass', 1300, 0.8, 0.3);
  }
  wobble(dur = 1.1) {
    if (!this._ok('wobble', 0.3)) return;
    const c = this.ctx, t0 = c.currentTime;
    let t = 0, gap = 0.075, n = 0;
    while (t < dur && n < 60) { this._noise(t0 + t, 0.012, 'highpass', 2600 + n * 60, 0.8, 0.05 + n * 0.002); t += gap; gap *= 0.93; n++; }
    this._tone(t0 + dur, 'sine', 3100, 3100, 0.12, 0.08);
  }
  _ambience() {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.05; g.connect(this.master);
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    n.connect(lp).connect(g); n.start();
    const hum = c.createOscillator(), hg = c.createGain(); hum.frequency.value = 50; hg.gain.value = 0.05; hum.connect(hg).connect(g); hum.start();
  }
}

/* ------------------------------------------------------------------ the scene */
export async function createScene(host, opts = {}) {
  await loadThree();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const lowEnd = coarse && small;

  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  let dprCap = lowEnd ? 1.75 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowEnd ? T.PCFShadowMap : T.PCFSoftShadowMap;
  renderer.domElement.className = 'gl';
  host.prepend(renderer.domElement);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new T.Scene();
  scene.background = new T.Color(0x040507);
  scene.fog = new T.FogExp2(0x040507, 0.13);
  const camera = new T.PerspectiveCamera(55, 1, 0.03, 40);
  scene.add(camera);

  const tex = (c, o = {}) => {
    const t = new T.CanvasTexture(c);
    if (o.srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    return t;
  };

  /* environment for reflections: a dark room with two soft boxes above the table */
  {
    const pm = new T.PMREMGenerator(renderer), es = new T.Scene();
    es.add(new T.Mesh(new T.SphereGeometry(10, 16, 8), new T.MeshBasicMaterial({ color: 0x1c1e22, side: T.BackSide })));
    const floorE = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ color: 0x3a4a40 })); floorE.rotation.x = -Math.PI / 2; floorE.position.y = 0.2; es.add(floorE);
    const box = (w, h, x, y, z, v, col = 0xffffff) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(v), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0.8, z * 0.3); es.add(m); };
    box(2.4, 1.2, 0, 3.0, 0.8, 6, 0xfff0dc); box(2.4, 1.2, 0, 3.0, -0.9, 4, 0xfff0dc); box(4, 1.6, 0, 2.2, 3.5, 1.6, 0xffe6cc);
    box(3, 0.4, 3.5, 1.6, 0, 0.9, 0x9fb8ff); box(3, 0.4, -3.5, 1.6, 0, 0.6, 0xffd0c0); box(2, 0.6, 0, 1.4, -4, 1.2, 0xff4a70);
    scene.environment = pm.fromScene(es, 0.04).texture;
    pm.dispose();
  }

  /* lights */
  scene.add(new T.HemisphereLight(0x323c50, 0x0b0907, 0.7));
  const mkSpot = (z, tz, inten, shadow, size) => {
    const s = new T.SpotLight(0xffe0b4, inten, 0, 0.64, 0.7, 2);
    s.position.set(0, 2.02, z); s.target.position.set(0, TY, tz);
    scene.add(s); scene.add(s.target);
    if (shadow) {
      s.castShadow = true; s.shadow.mapSize.set(size, size);
      s.shadow.camera.near = 0.6; s.shadow.camera.far = 2.4; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.012; s.shadow.radius = 3;
    }
    return s;
  };
  const spotMe = mkSpot(0.52, 0.42, 26, true, lowEnd ? 1024 : 2048);
  const spotOp = mkSpot(-0.56, -0.5, 19, true, lowEnd ? 512 : 1024);
  const rim = new T.SpotLight(0x7f95ff, 9, 0, 0.5, 0.8, 2); rim.position.set(0.3, 2.0, -2.5); rim.target.position.set(0, 1.25, -1.1); scene.add(rim, rim.target);
  const neonLight = new T.PointLight(0xff2a5a, 2.4, 5, 2); neonLight.position.set(-0.8, 1.4, -2.55); scene.add(neonLight);
  const bounce = new T.PointLight(0xffc890, 0.32, 1.6, 2); bounce.position.set(0, TY + 0.12, -0.62); scene.add(bounce);

  /* materials */
  const feltTex = tex(feltCanvas(), { repeat: [2.2, 2.2] });
  const feltMat = lowEnd
    ? new T.MeshStandardMaterial({ map: feltTex, color: 0x145a41, roughness: 0.96, metalness: 0, envMapIntensity: 0.2 })
    : new T.MeshPhysicalMaterial({ map: feltTex, color: 0x145a41, roughness: 0.97, metalness: 0, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new T.Color(0x3f8f6c), envMapIntensity: 0.2 });
  const leatherTex = tex(leatherCanvas(), { srgb: false, repeat: [6, 6] });
  const leatherMat = new T.MeshStandardMaterial({ color: 0x1b1412, roughness: 0.52, metalness: 0, bumpMap: leatherTex, bumpScale: 0.6, envMapIntensity: 0.6 });
  const woodMat = new T.MeshStandardMaterial({ map: tex(woodCanvas(), { repeat: [2, 1] }), roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  const brassMat = new T.MeshStandardMaterial({ color: 0xb8913f, metalness: 1, roughness: 0.32 });
  const alumMat = new T.MeshStandardMaterial({ color: 0x3b3f45, metalness: 1, roughness: 0.42 });
  const darkMat = new T.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: T.BackSide });

  /* room */
  {
    const floor = new T.Mesh(new T.PlaneGeometry(12, 12), new T.MeshStandardMaterial({ color: 0x0e0c0b, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const wallMat = new T.MeshStandardMaterial({ map: tex(concreteCanvas(), { repeat: [3, 1.5] }), color: 0x5a5a5e, roughness: 0.95 });
    const wall = new T.Mesh(new T.PlaneGeometry(9, 4.5), wallMat); wall.position.set(0, 2.25, -2.9); scene.add(wall);
    const back = new T.Mesh(new T.PlaneGeometry(9, 4.5), wallMat); back.position.set(0, 2.25, 3.4); back.rotation.y = Math.PI; scene.add(back);
    for (const sx of [-1, 1]) { const w = new T.Mesh(new T.PlaneGeometry(7, 4.5), wallMat); w.position.set(sx * 3.2, 2.25, 0.2); w.rotation.y = -sx * Math.PI / 2; scene.add(w); }
  }

  /* table */
  const sideRoot = [new T.Group(), new T.Group()];
  sideRoot[1].rotation.y = Math.PI;
  scene.add(sideRoot[0], sideRoot[1]);
  sideRoot.forEach((g) => g.updateMatrixWorld(true));
  const rr = (s, x0, y0, x1, y1, r) => {
    s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s;
  };
  {
    const top = rr(new T.Shape(), -0.93, -0.93, 0.93, 0.93, 0.03);
    for (const sgn of [1, -1]) {   // two tray openings (shape y = -world z)
      const hole = new T.Path(); const z0 = TRAY.z0 * sgn, z1 = TRAY.z1 * sgn;
      rr(hole, TRAY.x0, -Math.max(z0, z1), TRAY.x1, -Math.min(z0, z1), 0.018); top.holes.push(hole);
    }
    const g = new T.ExtrudeGeometry(top, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, TY - 0.04, 0);
    const m = new T.Mesh(g, feltMat); m.receiveShadow = true; scene.add(m);
    // padded leather rail
    const ring = rr(new T.Shape(), -1.0, -1.0, 1.0, 1.0, 0.07);
    ring.holes.push(rr(new T.Path(), -0.925, -0.925, 0.925, 0.925, 0.025));
    const rg = new T.ExtrudeGeometry(ring, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.016, bevelSegments: 5, curveSegments: 10 });
    rg.rotateX(-Math.PI / 2); rg.translate(0, TY - 0.01, 0);
    const rail = new T.Mesh(rg, leatherMat); rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
    const apronS = rr(new T.Shape(), -1.0, -1.0, 1.0, 1.0, 0.04); apronS.holes.push(rr(new T.Path(), -0.9, -0.9, 0.9, 0.9, 0.02));
    const ag = new T.ExtrudeGeometry(apronS, { depth: 0.13, bevelEnabled: false, curveSegments: 4 }); ag.rotateX(-Math.PI / 2); ag.translate(0, TY - 0.17, 0);
    scene.add(new T.Mesh(ag, woodMat));
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const leg = new T.Mesh(new T.CylinderGeometry(0.035, 0.03, TY - 0.17, 12), woodMat); leg.position.set(lx, (TY - 0.17) / 2, lz); scene.add(leg); }
  }

  /* per side: tray (brass rim, trap doors, pit), lamp ring, gold print, IOU board */
  const glowTex = tex(glowCanvas());
  const doorTex = tex(doorCanvas());
  const decalTex = tex(decalCanvas());
  const sides = [0, 1].map((side) => {
    const R = sideRoot[side], S = { side, root: R };
    // brass rim
    const outer = rr(new T.Shape(), TRAY.x0 - 0.016, -(TRAY.z1 + 0.016), TRAY.x1 + 0.016, -(TRAY.z0 - 0.016), 0.03);
    outer.holes.push(rr(new T.Path(), TRAY.x0, -TRAY.z1, TRAY.x1, -TRAY.z0, 0.018));
    const rimG = new T.ExtrudeGeometry(outer, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6 });
    rimG.rotateX(-Math.PI / 2); rimG.translate(0, TY, 0);
    const rim = new T.Mesh(rimG, brassMat); rim.receiveShadow = true; R.add(rim);
    // pit (open-topped dark box)
    const pit = new T.Mesh(new T.BoxGeometry(TRAY.x1 - TRAY.x0, 0.34, TRAY.z1 - TRAY.z0), darkMat);
    pit.position.set(0, TY - 0.175, (TRAY.z0 + TRAY.z1) / 2); R.add(pit);
    // trap doors (hinged on the long edges)
    const dw = TRAY.x1 - TRAY.x0 - 0.004, dd = (TRAY.z1 - TRAY.z0) / 2 - 0.002;
    const doorMat = new T.MeshPhysicalMaterial({ map: doorTex, color: 0x18573f, roughness: 0.97, sheen: 0.9, sheenRoughness: 0.55, sheenColor: new T.Color(0x4f9f7c), envMapIntensity: 0.25 });
    const mkDoor = (hingeZ, dir, v0, v1) => {
      const piv = new T.Group(); piv.position.set(0, DOOR_Y - 0.004, hingeZ); R.add(piv);
      const g = new T.BoxGeometry(dw, 0.008, dd);
      const uv = g.attributes.uv;           // map the top face onto its half of the door artwork
      for (let i = 0; i < uv.count; i++) uv.setY(i, lerp(v0, v1, uv.getY(i)));
      const m = new T.Mesh(g, doorMat); m.position.set(0, 0, dir * dd / 2); m.receiveShadow = true; piv.add(m);
      return piv;
    };
    S.doorFar = mkDoor(TRAY.z0 + 0.001, 1, 0.5, 1);   // hinge at the glass side
    S.doorNear = mkDoor(TRAY.z1 - 0.001, -1, 0, 0.5);
    S.doorOpen = 0;
    // gold print around the home area
    const dec = new T.Mesh(new T.PlaneGeometry(0.98, 0.98 * 384 / 1024), new T.MeshStandardMaterial({ map: decalTex, transparent: true, roughness: 0.45, metalness: 0.6, color: 0xffe6a8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    dec.rotation.x = -Math.PI / 2; dec.position.set(0, TY + 0.0004, 0.57); dec.receiveShadow = true; R.add(dec);
    // lamp ring
    S.lamps = [];
    const zN = TRAY.z1 + 0.012, zF = TRAY.z0 - 0.012, xS = TRAY.x1 + 0.012, zM = (TRAY.z0 + TRAY.z1) / 2;
    const lampPos = [[-0.33, zN], [-0.11, zN], [0.11, zN], [0.33, zN], [xS, zM], [0.33, zF], [0.11, zF], [-0.11, zF], [-0.33, zF], [-xS, zM]];
    const bezelG = new T.CylinderGeometry(0.018, 0.02, 0.006, 24), lensG = new T.SphereGeometry(0.0145, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    lampPos.forEach(([lx, lz], i) => {
      const red = RED_LAMPS.includes(i), col = new T.Color(red ? 0xff2a24 : 0xffc96e);
      const bez = new T.Mesh(bezelG, brassMat); bez.position.set(lx, TY + 0.004, lz); bez.castShadow = true; R.add(bez);
      const lm = new T.MeshStandardMaterial({ color: red ? 0x5a0d0b : 0x6b5530, roughness: 0.2, metalness: 0, emissive: col, emissiveIntensity: 0.06 });
      const lens = new T.Mesh(lensG, lm); lens.position.set(lx, TY + 0.007, lz); lens.scale.y = 0.6; R.add(lens);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      sp.position.set(lx, TY + 0.02, lz); sp.scale.setScalar(0.2); R.add(sp);
      const pool = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), new T.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(lx, TY + 0.0015, lz); R.add(pool);
      S.lamps.push({ mat: lm, sp, pool, red, level: 0 });
    });
    S.ring = { pos: side ? 7 : 2, cur: -1, run: null, flash: null };
    // the tray floor lights up gold or red when the lamps stop
    const fl = new T.Mesh(new T.PlaneGeometry(TRAY.x1 - TRAY.x0, TRAY.z1 - TRAY.z0), new T.MeshBasicMaterial({ color: 0xffc96e, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, DOOR_Y + 0.0012, (TRAY.z0 + TRAY.z1) / 2); R.add(fl);
    S.trayFlash = fl;
    // IOU board, lying flat, text towards its owner
    const ix = side ? -IOU.x : IOU.x;
    const board = new T.Group(); board.position.set(ix, TY, IOU.z); board.rotation.y = side ? 0.1 : -0.1; R.add(board);
    const plank = new T.Mesh(new T.BoxGeometry(0.155, 0.006, 0.215), woodMat); plank.position.y = 0.003; plank.castShadow = true; plank.receiveShadow = true; board.add(plank);
    const clip = new T.Mesh(new T.BoxGeometry(0.06, 0.012, 0.024), alumMat); clip.position.set(0, 0.009, -0.093); clip.castShadow = true; board.add(clip);
    const pc = cv(264, 360);
    const paperTex = tex(pc);
    const paper = new T.Mesh(new T.PlaneGeometry(0.132, 0.18), new T.MeshStandardMaterial({ map: paperTex, roughness: 0.92 }));
    paper.rotation.x = -Math.PI / 2; paper.position.set(0, 0.0063, 0.006); paper.receiveShadow = true; paper.visible = false; board.add(paper);
    S.iou = { board, paper, pc, paperTex, shown: 0, target: 0, from: 0, t: 1, dur: 0, stamps: [], name: '', round: 1, dirty: true };
    // attack marker (pulsing ring around the board)
    const mk = new T.Mesh(new T.RingGeometry(0.15, 0.162, 48), new T.MeshBasicMaterial({ color: 0xff3048, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    mk.rotation.x = -Math.PI / 2; mk.position.set(ix, TY + 0.012, IOU.z); R.add(mk);
    S.marker = mk; S.markOn = false;
    return S;
  });

  /* glass partition */
  {
    const gm = new T.MeshPhysicalMaterial({ color: 0xdcecec, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.13, envMapIntensity: 1.8, depthWrite: false, side: T.DoubleSide });
    const glass = new T.Mesh(new T.BoxGeometry(1.84, 0.86, 0.008), gm); glass.position.set(0, TY + 0.024 + 0.43, 0); glass.renderOrder = 5; scene.add(glass);
    const sm = new T.Mesh(new T.PlaneGeometry(1.84, 0.86), new T.MeshBasicMaterial({ map: tex(smudgeCanvas()), color: 0x8c979b, transparent: true, opacity: 0.16, depthWrite: false, blending: T.AdditiveBlending }));
    sm.position.set(0, TY + 0.024 + 0.43, 0.0045); sm.renderOrder = 6; scene.add(sm);
    const st = new T.Mesh(new T.PlaneGeometry(1.84, 0.86), new T.MeshBasicMaterial({ map: tex(streakCanvas()), transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    st.position.set(0, TY + 0.024 + 0.43, 0.005); st.renderOrder = 7; scene.add(st);
    const post = new T.BoxGeometry(0.036, 0.9, 0.05);
    for (const sx of [-1, 1]) { const p = new T.Mesh(post, alumMat); p.position.set(sx * 0.935, TY + 0.45, 0); p.castShadow = true; scene.add(p); }
    const topR = new T.Mesh(new T.BoxGeometry(1.9, 0.034, 0.05), alumMat); topR.position.set(0, TY + 0.895, 0); topR.castShadow = true; scene.add(topR);
    // bottom rail with the pass-through slot
    const slotA = SLOT_X - 0.12, slotB = SLOT_X + 0.12;
    const segL = new T.Mesh(new T.BoxGeometry(slotA + 0.92, 0.024, 0.05), alumMat); segL.position.set((-0.92 + slotA) / 2, TY + 0.012, 0); segL.castShadow = true; scene.add(segL);
    const segR = new T.Mesh(new T.BoxGeometry(0.92 - slotB, 0.024, 0.05), alumMat); segR.position.set((slotB + 0.92) / 2, TY + 0.012, 0); scene.add(segR);
    const lip = new T.Mesh(new T.BoxGeometry(slotB - slotA, 0.006, 0.05), brassMat); lip.position.set(SLOT_X, TY + 0.027, 0); scene.add(lip);
  }

  /* pendant lamps (mostly off-screen, but they read in the reflections) */
  for (const z of [0.52, -0.56]) {
    const shade = new T.Mesh(new T.CylinderGeometry(0.06, 0.23, 0.16, 32, 1, true), new T.MeshStandardMaterial({ color: 0x163a2c, metalness: 0.6, roughness: 0.38, side: T.DoubleSide }));
    shade.position.set(0, 2.1, z); scene.add(shade);
    const bulb = new T.Mesh(new T.SphereGeometry(0.035, 16, 10), new T.MeshBasicMaterial({ color: 0xfff0d0 })); bulb.position.set(0, 2.05, z); scene.add(bulb);
    const cord = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 1.2, 6), new T.MeshBasicMaterial({ color: 0x050505 })); cord.position.set(0, 2.78, z); scene.add(cord);
  }

  /* light cones and dust */
  const coneMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uColor: { value: new T.Color(0xffd9a8) }, uInt: { value: 0.055 } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uInt; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float h = smoothstep(0.0, 0.3, vH) * (0.25 + 0.75 * vH); gl_FragColor = vec4(uColor * uInt * f * h, 1.0); }'
  });
  const cones = [];
  for (const [z, sc] of [[0.52, 1], [-0.56, 0.8]]) {
    const cone = new T.Mesh(new T.CylinderGeometry(0.05, 0.86, 2.0 - TY, 40, 1, true), coneMat.clone());
    cone.material.uniforms.uInt.value = 0.022 * sc;
    cone.position.set(0, (2.04 + TY) / 2, z); scene.add(cone); cones.push(cone);
  }
  const dustN = lowEnd ? 160 : 320;
  const dustGeo = new T.BufferGeometry(), dustPos = new Float32Array(dustN * 3), dustSeed = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    const z = i % 2 ? 0.5 : -0.55, h = Math.random(), r = (0.05 + h * 0.75) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    dustSeed[i * 3] = Math.cos(a) * r; dustSeed[i * 3 + 1] = TY + 0.05 + (1 - h) * 1.15; dustSeed[i * 3 + 2] = z + Math.sin(a) * r;
  }
  dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: 0.004, map: glowTex, color: 0xffe9c8, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  /* neon sign on the back wall */
  const neonMat = new T.MeshBasicMaterial({ map: tex(neonCanvas()), transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false });
  {
    const plate = new T.Mesh(new T.BoxGeometry(1.3, 0.56, 0.03), new T.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6, metalness: 0.4 }));
    plate.position.set(-0.86, 1.4, -2.87); scene.add(plate);
    const neon = new T.Mesh(new T.PlaneGeometry(1.22, 0.5), neonMat); neon.position.set(-0.86, 1.4, -2.85); scene.add(neon);
  }
  let neonFlicker = 0;

  /* sparks for wins */
  const sparkN = 90, sparkGeo = new T.BufferGeometry(), sparkPos = new Float32Array(sparkN * 3);
  const sparks = []; for (let i = 0; i < sparkN; i++) sparks.push({ p: new T.Vector3(0, -10, 0), v: new T.Vector3(), life: 0 });
  sparkGeo.setAttribute('position', new T.BufferAttribute(sparkPos, 3));
  const sparkPts = new T.Points(sparkGeo, new T.PointsMaterial({ size: 0.012, map: glowTex, color: 0xffd27a, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
  sparkPts.frustumCulled = false; scene.add(sparkPts);
  function burst(side, n = 50) {
    const c = new T.Vector3(0, DOOR_Y + 0.02, 0.23).applyMatrix4(sideRoot[side].matrixWorld);
    let k = 0;
    for (const s of sparks) {
      if (s.life > 0) continue;
      s.p.set(c.x + rnd(0.4), c.y, c.z + rnd(0.12)); s.v.set(rnd(0.5), 0.6 + Math.random() * 1.1, rnd(0.35)); s.life = 0.7 + Math.random() * 0.6;
      if (++k >= n) break;
    }
  }

  /* ---------------------------------------------------------------- money: instanced meshes */
  const coinMats = {}, coinGeos = {};
  for (const d of DEN.filter((x) => x.coin)) {
    const art = coinArt(d.k);
    const face = new T.MeshStandardMaterial({ map: tex(art.albedo), normalMap: tex(art.normal, { srgb: false }), normalScale: new T.Vector2(1.1, 1.1), metalness: 0.92, roughness: d.k === 'c10' ? 0.42 : 0.34, envMapIntensity: 1.6 });
    if (art.alpha) { face.alphaMap = tex(art.alpha, { srgb: false }); face.alphaTest = 0.5; }
    const edge = new T.MeshStandardMaterial({ color: new T.Color(`rgb(${COIN_ART[d.k].metal.join(',')})`), metalness: 0.92, roughness: 0.36, envMapIntensity: 1.6 });
    if (COIN_ART[d.k].reed) { const rt = tex(reedCanvas(), { srgb: false, repeat: [25, 1] }); edge.normalMap = rt; edge.normalScale = new T.Vector2(1.2, 1.2); }
    const g = new T.CylinderGeometry(d.r, d.r, d.h, 44, 1);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (const grp of g.groups) {
      if (grp.materialIndex === 0) continue;
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        const vi = g.index.getX(i), px = pos.getX(vi), pz = pos.getZ(vi), top = grp.materialIndex === 1;
        uv.setXY(vi, (top ? px : -px) / (2 * d.r) + 0.5, -pz / (2 * d.r) + 0.5);
      }
    }
    coinGeos[d.k] = g; coinMats[d.k] = [edge, face, face];
  }
  const edgeMat = new T.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.9 });
  const billParts = {};
  for (const k of ['b10k', 'b5k', 'b1k']) {
    const d = DENK[k];
    const front = new T.MeshStandardMaterial({ map: tex(billCanvas(k, false)), color: 0xd2d2d2, roughness: 0.8 });
    const back = new T.MeshStandardMaterial({ map: tex(billCanvas(k, true)), color: 0xd2d2d2, roughness: 0.82 });
    billParts[k] = [[new T.BoxGeometry(d.L, 0.00018, 0.076), [edgeMat, edgeMat, front, back, edgeMat, edgeMat]]];
  }
  const bTopC = bundleTopCanvas(false), bBotC = bundleTopCanvas(true);
  const bundleMats = (() => {
    const top = new T.MeshStandardMaterial({ map: tex(bTopC), color: 0xd2d2d2, roughness: 0.8 });
    const bot = new T.MeshStandardMaterial({ map: tex(bBotC), color: 0xd2d2d2, roughness: 0.82 });
    const side = new T.MeshStandardMaterial({ map: tex(paperEdgeCanvas(512, 24, [[0.41, 0.59]])), roughness: 0.9 });
    const end = new T.MeshStandardMaterial({ map: tex(paperEdgeCanvas(256, 24)), roughness: 0.9 });
    return [end, end, top, bot, side, side];
  })();
  const wrap = (m) => { const p = new T.MeshPhysicalMaterial({ map: m.map, roughness: 0.75, clearcoat: 1, clearcoatRoughness: 0.12 }); return p; };
  const brickMats = (() => {
    const top = wrap({ map: tex(stackCanvas(bTopC, 2, 512, 486)) });
    const side = wrap({ map: tex(layeredCanvas(512, 160, 5, [[0.41, 0.59]])) });
    const end = wrap({ map: tex(layeredCanvas(486, 160, 5)) });
    return [end, end, top, top, side, side];
  })();
  const caseParts = (() => {
    const s = rr(new T.Shape(), -0.15, -0.11, 0.15, 0.11, 0.025);
    const body = new T.ExtrudeGeometry(s, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 8 });
    body.rotateX(-Math.PI / 2); body.translate(0, -0.0375, 0);
    const nt = tex(ridgeCanvas(), { srgb: false }); nt.wrapS = nt.wrapT = T.RepeatWrapping; nt.repeat.set(1 / 0.3, 1 / 0.22); nt.offset.set(0.5, 0.5);
    const al = new T.MeshStandardMaterial({ color: 0xd2d6db, metalness: 1, roughness: 0.27, normalMap: nt });
    const handle = new T.TorusGeometry(0.034, 0.0065, 8, 22, Math.PI); handle.rotateX(Math.PI / 2); handle.translate(0, 0, 0.114);
    const latch = new T.BoxGeometry(0.03, 0.018, 0.008); const l2 = latch.clone(); latch.translate(-0.085, 0.012, 0.117); l2.translate(0.085, 0.012, 0.117);
    return [[body, al], [handle, new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })], [latch, alumMat], [l2, alumMat]];
  })();
  const PARTS = {
    case: caseParts,
    brick: [[new T.BoxGeometry(0.16, 0.0505, 0.152), brickMats]],
    bundle: [[new T.BoxGeometry(0.16, 0.0102, 0.076), bundleMats]],
    b10k: billParts.b10k, b5k: billParts.b5k, b1k: billParts.b1k
  };
  for (const k of Object.keys(coinGeos)) PARTS[k] = [[coinGeos[k], coinMats[k]]];
  const IM = {};
  for (const d of DEN) {
    IM[d.k] = PARTS[d.k].map(([g, m]) => {
      const im = new T.InstancedMesh(g, m, CAP[d.k]);
      im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
      scene.add(im); return im;
    });
  }

  /* ---------------------------------------------------------------- clock, waits, tweens */
  let speed = 1, gameClock = 0;
  const waits = [];
  function wait(sec) { return new Promise((res) => waits.push({ at: gameClock + Math.max(0, sec), res })); }
  const tweens = [];
  function tween(dur, fn, ease = EASE.inOutCubic) { return new Promise((res) => { tweens.push({ t: 0, d: Math.max(0.001, dur), fn, ease, res }); fn(0, 0); }); }

  /* ---------------------------------------------------------------- piles */
  const tmpM = new T.Matrix4(), tmpM2 = new T.Matrix4(), tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpS = new T.Vector3(), tmpV = new T.Vector3(), tmpV2 = new T.Vector3();
  const qFrom = (rx, ry, rz) => new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ'));
  function layoutPile(c, seed) {
    const L = {}; let y = 0;
    const R = (ki, i, s) => hrand(seed, ki * 131 + i, s);
    const put = (k, o) => (L[k] || (L[k] = [])).push(o);
    for (let i = 0; i < c.case; i++) { put('case', { x: R(0, i, 1) * 0.004, y: y + 0.0435, z: R(0, i, 2) * 0.004, ry: R(0, i, 3) * 0.04, rx: 0, rz: 0 }); y += 0.087; }
    for (let i = 0; i < c.brick; i++) { put('brick', { x: R(1, i, 1) * 0.003, y: y + 0.02525, z: R(1, i, 2) * 0.003, ry: R(1, i, 3) * 0.05, rx: 0, rz: 0 }); y += 0.0505; }
    for (let i = 0; i < c.bundle; i++) { put('bundle', { x: R(2, i, 1) * 0.004, y: y + 0.0051, z: R(2, i, 2) * 0.003, ry: R(2, i, 3) * 0.06, rx: 0, rz: 0 }); y += 0.0102; }
    for (let i = 0; i < c.b10k; i++) { put('b10k', { x: R(3, i, 1) * 0.002, y: y + 0.0001, z: R(3, i, 2) * 0.0015, ry: R(3, i, 3) * 0.035, rx: 0, rz: 0 }); y += 0.0002; }
    for (let i = 0; i < c.b5k; i++) { put('b5k', { x: 0.006 + R(4, i, 1) * 0.003, y: y + 0.0001, z: 0.006 + R(4, i, 2) * 0.002, ry: 0.07 + R(4, i, 3) * 0.04, rx: 0, rz: 0 }); y += 0.0002; }
    for (let i = 0; i < c.b1k; i++) { put('b1k', { x: -0.008 + R(5, i, 1) * 0.004, y: y + 0.0001, z: 0.012 + R(5, i, 2) * 0.003, ry: -0.08 + R(5, i, 3) * 0.06, rx: 0, rz: 0 }); y += 0.0002; }
    const notesTop = y;
    const coins = ['c500', 'c100', 'c50', 'c10'].filter((k) => c[k] > 0);
    const big = c.case + c.brick > 0, notes = notesTop > 0;
    let top = notesTop;
    coins.forEach((k, j) => {
      const d = DENK[k], n = coins.length, off = (j - (n - 1) / 2) * 0.03;
      const bx = big ? off * 0.9 : off, bz = big ? 0 : notes ? 0.058 : 0, by = big ? notesTop : 0;
      for (let i = 0; i < c[k]; i++) {
        const yy = by + d.h / 2 + i * (d.h + 0.00005);
        put(k, { x: bx + R(d.i, i, 1) * 0.0007, y: yy, z: bz + R(d.i, i, 2) * 0.0007, ry: R(d.i, i, 3) * Math.PI, rx: R(d.i, i, 4) * 0.012, rz: R(d.i, i, 5) * 0.012 });
        top = Math.max(top, yy + d.h / 2);
      }
    });
    return { L, top };
  }
  const sfx = new SFX();
  let soundGate = 0;
  function landSound(k) {
    const d = DENK[k];
    if (d.coin) sfx.coin(k, 0.22 + Math.random() * 0.12);
    else sfx.paper(0.12 + Math.random() * 0.08);
  }
  class Pile {
    constructor(side, idx, payout) {
      this.side = side; this.idx = idx; this.payout = !!payout;
      this.obj = new T.Object3D(); sideRoot[side].add(this.obj);
      this.seed = 1000 + side * 97 + idx * 13 + (payout ? 500 : 0);
      this.items = {}; for (const d of DEN) this.items[d.k] = [];
      this.dying = []; this.amount = 0; this.top = 0;
      this.anim = null; this.place = 'home'; this.off = { x: 0, z: 0, ry: 0 };
      this.fall = null;
    }
    setAmount(amount, mode = 'instant', o = {}) {
      this.amount = amount;
      const lay = layoutPile(breakdown(amount), this.seed);
      this.top = lay.top;
      this.obj.scale.y = lay.top > MAX_PILE_H ? MAX_PILE_H / lay.top : 1;
      let n = 0;
      for (const d of DEN) {
        const arr = this.items[d.k], tg = lay.L[d.k] || [];
        for (let i = 0; i < tg.length; i++) {
          const t = tg[i];
          let it = arr[i];
          const p1 = new T.Vector3(t.x, t.y, t.z), q1 = qFrom(t.rx, t.ry, t.rz);
          if (!it) {
            it = { k: d.k, p: p1.clone(), q: q1.clone(), s: 1, a: null }; arr.push(it);
            if (mode !== 'instant') {
              const h = mode === 'rain' ? (o.h || 0.3) + Math.random() * 0.15 : mode === 'morph' ? 0.035 : 0.12;
              const p0 = p1.clone().add(new T.Vector3(rnd(mode === 'rain' ? 0.05 : 0.01), h, rnd(mode === 'rain' ? 0.05 : 0.01)));
              const q0 = d.bill ? qFrom(rnd(0.6), t.ry + rnd(0.8), rnd(0.6)) : qFrom(rnd(1.2), rnd(3), rnd(1.2));
              const dur = (mode === 'morph' ? 0.2 : d.bill || d.k === 'bundle' ? 0.55 : 0.4) + Math.random() * 0.08;
              const delay = (o.delay || 0) + n * (o.stagger != null ? o.stagger : mode === 'morph' ? 0.004 : 0.018);
              n++;
              it.p.copy(p0); it.q.copy(q0);
              it.a = { t: -delay, d: dur, p0, p1, q0, q1, s0: 1, s1: 1, ease: d.bill ? EASE.float : EASE.drop, flutter: d.bill ? 0.5 : 0, ph: Math.random() * 6, done: mode === 'morph' ? null : () => landSound(d.k) };
            }
          } else if (mode === 'instant') { it.p.copy(p1); it.q.copy(q1); it.s = 1; it.a = null; }
          else if (it.p.distanceToSquared(p1) > 1e-9 || it.q.angleTo(q1) > 1e-4) {
            it.a = { t: -(o.delay || 0), d: 0.22, p0: it.p.clone(), p1, q0: it.q.clone(), q1, s0: it.s, s1: 1, ease: EASE.inOutCubic };
          }
        }
        while (arr.length > tg.length) {
          const it = arr.pop();
          if (mode === 'instant') continue;
          it.a = { t: -(o.delay || 0) * 0.5, d: 0.2, p0: it.p.clone(), p1: it.p.clone().add(new T.Vector3(0, 0.03, 0)), q0: it.q.clone(), q1: it.q.clone(), s0: 1, s1: 0.001, ease: EASE.inQuad, kill: true };
          this.dying.push(it);
        }
      }
    }
    clear() { for (const d of DEN) this.items[d.k].length = 0; this.dying.length = 0; this.amount = 0; this.top = 0; this.obj.scale.y = 1; }
    get vtop() { return this.top * this.obj.scale.y; }
    moveTo(x, y, z, ry, o = {}) {
      return new Promise((res) => {
        const p = this.obj.position;
        this.anim = { t: -(o.delay || 0), d: o.dur || 0.38, p0: p.clone(), p1: new T.Vector3(x, y, z), r0: this.obj.rotation.y, r1: ry, arc: o.arc != null ? o.arc : 0.06, res };
      });
    }
  }
  function homePos(i, off) { return [HOME_X[i % 5] + (off ? off.x : 0), TY, HOME_Z[i < 5 ? 0 : 1] + (off ? off.z : 0)]; }
  function trayPos(i) { return [HOME_X[i % 5] + hrand(i, 7, 3) * 0.006, DOOR_Y, TRAY_Z[i < 5 ? 0 : 1] + hrand(i, 9, 4) * 0.005]; }
  const piles = [0, 1].map((side) => Array.from({ length: 10 }, (_, i) => new Pile(side, i)));
  const pays = [0, 1].map((side) => Array.from({ length: 10 }, (_, i) => new Pile(side, i, true)));
  const allPiles = [...piles[0], ...piles[1], ...pays[0], ...pays[1]];
  function resetPilePos(p, scatter) {
    p.off = scatter ? { x: rnd(0.035), z: rnd(0.03), ry: rnd(Math.PI) } : { x: rnd(0.006), z: rnd(0.005), ry: rnd(0.06) };
    const [x, y, z] = homePos(p.idx, p.off);
    p.obj.position.set(x, y, z); p.obj.rotation.set(0, p.off.ry, 0); p.place = 'home'; p.anim = null; p.fall = null;
  }

  function renderMoney() {
    const cnt = {}; for (const d of DEN) cnt[d.k] = 0;
    for (const p of allPiles) {
      p.obj.updateMatrixWorld();
      const W = p.obj.matrixWorld;
      const write = (it) => {
        const ms = IM[it.k], n = cnt[it.k];
        if (n >= CAP[it.k]) return;
        tmpS.setScalar(it.s); tmpM.compose(it.p, it.q, tmpS); tmpM2.multiplyMatrices(W, tmpM);
        for (const m of ms) m.setMatrixAt(n, tmpM2);
        cnt[it.k] = n + 1;
      };
      for (const d of DEN) for (const it of p.items[d.k]) write(it);
      for (const it of p.dying) write(it);
    }
    for (const d of DEN) for (const m of IM[d.k]) { m.count = cnt[d.k]; m.instanceMatrix.needsUpdate = true; }
  }
  function stepItems(dt) {
    for (const p of allPiles) {
      for (const d of DEN) for (const it of p.items[d.k]) if (it.a) stepItem(it, dt);
      for (let i = p.dying.length - 1; i >= 0; i--) { const it = p.dying[i]; if (it.a) stepItem(it, dt); if (!it.a) p.dying.splice(i, 1); }
      if (p.anim) {
        const a = p.anim; a.t += dt;
        if (a.t >= 0) {
          const u = Math.min(1, a.t / a.d), e = EASE.inOutCubic(u);
          p.obj.position.lerpVectors(a.p0, a.p1, e); p.obj.position.y += Math.sin(Math.PI * u) * a.arc;
          p.obj.rotation.y = lerp(a.r0, a.r1, e);
          if (u >= 1) { p.anim = null; a.res(); }
        }
      }
      if (p.fall) {
        const f = p.fall; f.t += dt;
        p.obj.position.y = f.y0 - 1.6 * f.t * f.t; p.obj.rotation.x = f.rx * f.t; p.obj.rotation.z = f.rz * f.t;
        if (f.t >= f.d) { p.fall = null; f.res(); }
      }
    }
  }
  function stepItem(it, dt) {
    const a = it.a; a.t += dt;
    if (a.t < 0) { it.p.copy(a.p0); it.q.copy(a.q0); it.s = a.s0; return; }
    const u = Math.min(1, a.t / a.d), e = a.ease(u);
    if (a.toss) {   // thrown coin: short flight, lands on its rim, rolls in and wobbles flat
      if (u < a.land) {
        const v = u / a.land;
        it.p.lerpVectors(a.p0, a.pl, v); it.p.y += Math.sin(Math.PI * v) * 0.1 + v * a.toss * 0.91;
        tmpQ.setFromEuler(tmpE.set(a.ph + v * 14, v * 3, v * 5)); it.q.copy(a.q1).multiply(tmpQ);
      } else {
        if (!a.landed) { a.landed = true; if (a.onLand) a.onLand(); }
        const w = (u - a.land) / (1 - a.land);
        it.p.lerpVectors(a.pl, a.p1, EASE.outCubic(Math.min(1, w * 1.5)));
        const tilt = 1.15 * Math.pow(1 - w, 1.7), phi = a.ph + w * 9 + w * w * 26;
        tmpV2.set(Math.cos(phi), 0, Math.sin(phi)); tmpQ.setFromAxisAngle(tmpV2, tilt);
        it.q.copy(tmpQ).multiply(a.q1);
        it.p.y = a.p1.y + Math.sin(tilt) * a.toss;
      }
      if (u >= 1) { it.p.copy(a.p1); it.q.copy(a.q1); it.a = null; if (a.done) a.done(); }
      return;
    }
    it.p.lerpVectors(a.p0, a.p1, e);
    it.q.slerpQuaternions(a.q0, a.q1, Math.min(1, u * 1.15));
    if (a.flutter) { tmpQ.setFromEuler(tmpE.set(Math.sin(u * 13 + a.ph) * a.flutter * (1 - u), 0, Math.cos(u * 11 + a.ph) * a.flutter * (1 - u))); it.q.multiply(tmpQ); }
    it.s = a.s0 + (a.s1 - a.s0) * e;
    if (u >= 1) { it.a = null; if (a.done) a.done(); }
  }

  /* ---------------------------------------------------------------- lamp rings */
  function stepRings(dt) {
    for (const S of sides) {
      const R = S.ring;
      if (R.run) {
        const r = R.run; r.t += dt;
        const u = Math.min(1, r.t / r.d), e = 1 - Math.pow(1 - u, 3.4);
        const idx = Math.floor(r.from + r.steps * e + 1e-6) % 10;
        if (idx !== R.cur) { R.cur = idx; S.lamps[idx].level = 1; if (S.side === 0 || !r.quiet) sfx.tick(idx); if (u > 0.55 && (idx === 4 || idx === 9)) sfx.beat(); }
        if (u >= 1) { R.run = null; R.pos = r.target; R.flash = { t: 0, ok: r.ok, idx: r.target }; r.res(); }
      }
      if (R.flash) { R.flash.t += dt; if (R.flash.t > 2.2) R.flash = null; }
      if (R.flash) {
        const f = R.flash, a = f.t < 0.9 ? (0.5 + 0.5 * Math.cos(f.t * 14)) * 0.3 : Math.max(0, 0.18 * (1 - (f.t - 0.9) / 1.3));
        S.trayFlash.material.color.setHex(f.ok ? 0xffc96e : 0xff2a24); S.trayFlash.material.opacity = a;
      } else S.trayFlash.material.opacity = 0;
      S.lamps.forEach((L, i) => {
        let lv = L.level;
        if (R.run && i === R.cur) lv = 1;
        if (R.flash) {
          const f = R.flash, blink = 0.5 + 0.5 * Math.cos(f.t * 14);
          if (i === f.idx) lv = Math.max(lv, f.t < 0.9 ? blink : 0.8);
          else if (f.t < 0.9 && (f.ok ? !L.red : L.red)) lv = Math.max(lv, blink * 0.55);
        }
        L.level = Math.max(0, L.level - dt * 5.5);
        L.mat.emissiveIntensity = 0.06 + lv * 6;
        L.sp.material.opacity = lv * 0.95; L.pool.material.opacity = lv * 0.7;
      });
    }
  }

  /* ---------------------------------------------------------------- IOU paper */
  function drawIOU(S, amount) {
    const c = S.iou.pc, x = c.getContext('2d'), W = c.width, H = c.height;
    x.fillStyle = '#f2ecdc'; x.fillRect(0, 0, W, H);
    if (!S.iou.grain) { const g = cv(W, H), gx = g.getContext('2d'); gx.fillStyle = '#808080'; gx.fillRect(0, 0, W, H); noiseFill(gx, W, H, 40); S.iou.grain = g; }
    x.globalAlpha = 0.08; x.drawImage(S.iou.grain, 0, 0); x.globalAlpha = 1;
    x.strokeStyle = '#a32b22'; x.lineWidth = 3; x.strokeRect(9, 9, W - 18, H - 18); x.lineWidth = 1; x.strokeRect(15, 15, W - 30, H - 30);
    x.fillStyle = '#241e1a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 32px ${SERIF}`; x.fillText('借 用 書', W / 2, 52);
    x.fillStyle = '#a32b22'; x.fillRect(40, 76, W - 80, 2);
    x.fillStyle = '#241e1a'; x.font = `700 20px ${SERIF}`; x.textAlign = 'left'; x.fillText('金', 26, 122);
    const s = yen(amount);
    let fs = 38; x.font = `700 ${fs}px ${SERIF}`;
    while (x.measureText(s).width > W - 92 && fs > 12) { fs -= 2; x.font = `700 ${fs}px ${SERIF}`; }
    x.textAlign = 'center'; x.fillText(s, W / 2 + 4, 122);
    x.font = `700 18px ${SERIF}`; x.textAlign = 'right'; x.fillText('也', W - 24, 122);
    x.fillStyle = '#7d6f63'; x.fillRect(46, 146, W - 92, 1);
    x.fillStyle = '#3a322c'; x.font = `500 13px ${SERIF}`; x.textAlign = 'left';
    x.fillText('上記の金額を確かに借用しました。', 28, 182);
    x.fillText('勝負の結果をもって返済とします。', 28, 204);
    x.fillText(`第 ${S.iou.round} 回戦`, 28, 248);
    x.font = `700 16px ${SERIF}`; x.fillText('借主', 28, 300);
    x.font = `700 18px ${SANS}`; x.fillText(S.iou.name || '', 74, 300);
    x.strokeStyle = 'rgba(190,30,25,0.85)'; x.fillStyle = 'rgba(190,30,25,0.85)'; x.lineWidth = 3;
    x.beginPath(); x.arc(W - 52, 296, 22, 0, Math.PI * 2); x.stroke();
    x.font = `700 20px ${SERIF}`; x.textAlign = 'center'; x.fillText((S.iou.name || '借').slice(0, 1), W - 52, 297);
    for (const st of S.iou.stamps) {
      x.save(); x.translate(st.x * W, st.y * H); x.rotate(st.r); x.globalAlpha = 0.86;
      x.strokeStyle = '#d0201a'; x.fillStyle = '#d0201a'; x.lineWidth = 4; x.strokeRect(-30, -30, 60, 60);
      x.font = `900 44px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('倍', 0, 2);
      x.restore();
    }
    S.iou.paperTex.needsUpdate = true;
  }
  function stepIOU(dt) {
    for (const S of sides) {
      const I = S.iou;
      if (I.t < 1) {
        I.t = Math.min(1, I.t + dt / Math.max(0.01, I.dur));
        const v = Math.round(lerp(I.from, I.target, EASE.outCubic(I.t)) / 10) * 10;
        if (v !== I.shown || I.dirty) { I.shown = v; drawIOU(S, v); I.dirty = false; }
      } else if (I.dirty) { drawIOU(S, I.shown); I.dirty = false; }
      I.paper.visible = I.shown > 0 || I.t < 1 && I.target > 0;
      if (S.markOn) S.marker.material.opacity = 0.55 + 0.45 * Math.sin(gameClock * 9);
      else S.marker.material.opacity = Math.max(0, S.marker.material.opacity - dt * 3);
    }
  }
  function setDebt(side, debt, dur = 0.6) {
    const I = sides[side].iou;
    I.from = I.shown; I.target = debt; I.t = dur > 0 ? 0 : 1; I.dur = dur;
    if (dur <= 0) { I.shown = debt; I.dirty = true; }
    if (debt <= 0) I.stamps = [];
  }

  /* stamp and the slip of paper that slides under the glass */
  const stampG = new T.Group();
  {
    const handle = new T.Mesh(new T.CylinderGeometry(0.011, 0.014, 0.07, 16), woodMat); handle.position.y = 0.05; stampG.add(handle);
    const knob = new T.Mesh(new T.SphereGeometry(0.019, 16, 12), woodMat); knob.position.y = 0.092; stampG.add(knob);
    const base = new T.Mesh(new T.BoxGeometry(0.06, 0.016, 0.06), new T.MeshStandardMaterial({ color: 0x7a1410, roughness: 0.5 })); base.position.y = 0.008; stampG.add(base);
    stampG.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    stampG.visible = false; scene.add(stampG);
  }
  const slipC = cv(220, 300), slipTex = tex(slipC);
  const slip = new T.Mesh(new T.PlaneGeometry(0.11, 0.15), new T.MeshStandardMaterial({ map: slipTex, roughness: 0.9, side: T.DoubleSide }));
  slip.castShadow = true; slip.visible = false; scene.add(slip);

  /* ---------------------------------------------------------------- the opponent */
  const opp = (() => {
    const skin = new T.MeshStandardMaterial({ color: 0x9e7865, roughness: 0.56 });
    const suit = new T.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.84, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new T.Color(0x3a404c) });
    const shirt = new T.MeshStandardMaterial({ color: 0xd9d6cd, roughness: 0.7 });
    const tieM = new T.MeshStandardMaterial({ color: 0x7a1c1c, roughness: 0.45 });
    const hairM = new T.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.42 });
    const shadesM = new T.MeshPhysicalMaterial({ color: 0x040405, roughness: 0.05, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03 });
    const root = new T.Group(); scene.add(root);
    const chair = new T.Mesh(new T.BoxGeometry(0.6, 0.8, 0.1), leatherMat); chair.position.set(0, 1.0, -1.42); root.add(chair);
    const chairTop = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 16), leatherMat); chairTop.rotation.z = Math.PI / 2; chairTop.position.set(0, 1.4, -1.42); root.add(chairTop);
    const waist = new T.Group(); waist.position.set(0, 0.75, -1.12); root.add(waist);
    const torso = new T.Mesh(new T.CapsuleGeometry(0.16, 0.3, 8, 18), suit); torso.scale.set(1.3, 1, 0.74); torso.position.set(0, 0.21, 0); waist.add(torso);
    for (const sx of [-1, 1]) { const sh = new T.Mesh(new T.SphereGeometry(0.078, 18, 12), suit); sh.position.set(sx * 0.19, 0.37, 0); waist.add(sh); }
    const vShape = new T.Shape(); vShape.moveTo(-0.05, 0.06); vShape.lineTo(0.05, 0.06); vShape.lineTo(0, -0.08); vShape.closePath();
    const vneck = new T.Mesh(new T.ShapeGeometry(vShape), shirt); vneck.position.set(0, 0.36, 0.118); vneck.rotation.x = -0.12; waist.add(vneck);
    const tie = new T.Mesh(new T.BoxGeometry(0.026, 0.13, 0.006), tieM); tie.position.set(0, 0.33, 0.124); tie.rotation.x = -0.12; waist.add(tie);
    const knot = new T.Mesh(new T.BoxGeometry(0.03, 0.022, 0.012), tieM); knot.position.set(0, 0.405, 0.12); waist.add(knot);
    const neckPivot = new T.Group(); neckPivot.position.set(0, 0.43, 0.01); waist.add(neckPivot);
    const neck = new T.Mesh(new T.CylinderGeometry(0.047, 0.054, 0.1, 16), skin); neck.position.y = 0.035; neckPivot.add(neck);
    const head = new T.Group(); head.position.set(0, 0.165, 0.012); neckPivot.add(head);
    const skull = new T.Mesh(new T.SphereGeometry(0.1, 32, 24), skin); skull.scale.set(0.86, 1.1, 0.98); head.add(skull);
    const jaw = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), skin); jaw.scale.set(0.94, 0.74, 0.96); jaw.position.set(0, -0.05, 0.013); head.add(jaw);
    const nose = new T.Mesh(new T.SphereGeometry(0.016, 14, 10), skin); nose.scale.set(0.58, 1.0, 0.8); nose.position.set(0, -0.009, 0.092); head.add(nose);
    for (const sx of [-1, 1]) { const ear = new T.Mesh(new T.SphereGeometry(0.022, 12, 10), skin); ear.scale.set(0.45, 1, 0.75); ear.position.set(sx * 0.085, 0.004, -0.004); head.add(ear); }
    // slicked-back hair: a cap over the crown and the back of the head, hairline well above the brow
    const hair = new T.Mesh(new T.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.43), hairM);
    hair.scale.set(0.9, 1.13, 1.03); hair.position.set(0, 0.006, -0.006); hair.rotation.x = -0.5; head.add(hair);
    const nape = new T.Mesh(new T.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.2), hairM);
    nape.scale.set(0.9, 1.12, 1.02); nape.position.set(0, 0.0, -0.008); nape.rotation.x = -0.9; head.add(nape);
    const mouth = new T.Mesh(new T.BoxGeometry(0.03, 0.003, 0.004), new T.MeshBasicMaterial({ color: 0x2a1410 })); mouth.position.set(0, -0.062, 0.086); head.add(mouth);
    const shades = new T.Group(); head.add(shades);
    const lensShape = rr(new T.Shape(), -0.022, -0.014, 0.022, 0.014, 0.008);
    const lensG = new T.ExtrudeGeometry(lensShape, { depth: 0.003, bevelEnabled: false, curveSegments: 6 });
    for (const sx of [-1, 1]) { const l = new T.Mesh(lensG, shadesM); l.position.set(sx * 0.03, 0.014, 0.091); l.rotation.y = sx * 0.13; shades.add(l); }
    const bridge = new T.Mesh(new T.BoxGeometry(0.016, 0.004, 0.004), shadesM); bridge.position.set(0, 0.021, 0.095); shades.add(bridge);
    for (const sx of [-1, 1]) { const tm = new T.Mesh(new T.BoxGeometry(0.003, 0.004, 0.09), shadesM); tm.position.set(sx * 0.079, 0.02, 0.045); tm.rotation.y = -sx * 0.06; shades.add(tm); }
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // arms
    const upperG = new T.CylinderGeometry(0.048, 0.044, 1, 14), foreG = new T.CylinderGeometry(0.043, 0.036, 1, 14);
    const cuffG = new T.CylinderGeometry(0.037, 0.037, 0.02, 14), handG = new T.SphereGeometry(0.05, 16, 10); handG.scale(0.72, 0.3, 1);
    const arms = [-1, 1].map((sx) => {
      const up = new T.Mesh(upperG, suit), fo = new T.Mesh(foreG, suit), el = new T.Mesh(new T.SphereGeometry(0.046, 14, 10), suit);
      const cuff = new T.Mesh(cuffG, shirt), hand = new T.Mesh(handG, skin);
      [up, fo, el, cuff, hand].forEach((m) => { m.castShadow = true; m.receiveShadow = true; root.add(m); });
      return { sx, up, fo, el, cuff, hand, tgt: new T.Vector3(), cur: new T.Vector3(sx * 0.16, TY + 0.03, -0.86), rest: new T.Vector3(sx * 0.17, TY + 0.028, -0.86) };
    });
    const st = { lean: 0.12, tLean: 0.12, pitch: 0.12, tPitch: 0.12, yaw: 0, tYaw: 0, breathe: 0, timer: 0, mode: 'idle', modeT: 0 };
    const up = new T.Vector3(0, 1, 0), v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3();
    function limb(m, a, b) { v1.subVectors(b, a); const len = v1.length(); m.position.copy(a).addScaledVector(v1, 0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(up, v1.normalize()); }
    function ik(S, Tg, l1, l2, pole) {
      const d = v2.subVectors(Tg, S); let len = d.length(); const mx = l1 + l2 - 1e-3;
      if (len > mx) { d.setLength(mx); len = mx; }
      const dir = d.clone().normalize();
      const a = Math.acos(clamp((l1 * l1 + len * len - l2 * l2) / (2 * l1 * len), -1, 1));
      const pv = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
      const E = S.clone().addScaledVector(dir, Math.cos(a) * l1).addScaledVector(pv, Math.sin(a) * l1);
      return { E, H: S.clone().addScaledVector(dir, len) };
    }
    function set(mode, t = 0) { st.mode = mode; st.modeT = t; }
    function look(look) {
      arms.forEach((A) => A.tgt.copy(A.rest));
      st.tLean = 0.12; st.tPitch = 0.14; st.tYaw = 0;
      const m = st.mode;
      if (m === 'think') { st.tPitch = 0.26; st.tYaw = Math.sin(gameClock * 0.6) * 0.18; arms[0].tgt.y += Math.max(0, Math.sin(gameClock * 7)) * 0.02; }
      else if (m === 'push') { st.tLean = 0.3; st.tPitch = 0.4; arms[0].tgt.set(-0.06, TY + 0.04, -0.6); }
      else if (m === 'point') { st.tLean = 0.22; st.tPitch = 0.05; st.tYaw = -0.25; arms[1].tgt.set(0.3, TY + 0.2, -0.3); }
      else if (m === 'win') { st.tLean = -0.04; st.tPitch = -0.12 + Math.sin(gameClock * 10) * 0.03; }
      else if (m === 'lose') { st.tLean = 0.26; st.tPitch = 0.55; arms[0].tgt.set(-0.02, 1.44, -0.98); }
      else if (m === 'shock') { st.tLean = -0.08; st.tPitch = -0.2; arms.forEach((A) => { A.tgt.y += 0.06; A.tgt.z += 0.06; }); }
      else if (m === 'watch') { st.tPitch = 0.3; st.tYaw = Math.sin(gameClock * 0.4) * 0.06; }
      else { st.tYaw = Math.sin(gameClock * 0.23) * 0.12 + Math.sin(gameClock * 0.71) * 0.04; st.tPitch = 0.12 + Math.sin(gameClock * 0.37) * 0.05; }
    }
    function update(dt) {
      if (st.modeT > 0) { st.modeT -= dt; if (st.modeT <= 0) st.mode = 'idle'; }
      look();
      const k = 1 - Math.exp(-dt * 4);
      st.lean += (st.tLean - st.lean) * k; st.pitch += (st.tPitch - st.pitch) * k; st.yaw += (st.tYaw - st.yaw) * k;
      st.breathe += dt;
      waist.rotation.x = st.lean + Math.sin(st.breathe * 1.4) * 0.008;
      torso.scale.y = 1 + Math.sin(st.breathe * 1.4) * 0.01;
      neckPivot.rotation.x = st.pitch * 0.4; head.rotation.x = st.pitch * 0.6; head.rotation.y = st.yaw; neckPivot.rotation.y = st.yaw * 0.3;
      waist.updateMatrixWorld(true);
      for (const A of arms) {
        A.cur.lerp(A.tgt, 1 - Math.exp(-dt * 5));
        const S = v3.set(A.sx * 0.2, 0.37, 0.02).applyMatrix4(waist.matrixWorld).clone();
        const { E, H } = ik(S, A.cur, 0.31, 0.29, new T.Vector3(A.sx * 0.75, -0.55, -0.5));
        limb(A.up, S, E); limb(A.fo, E, H); A.el.position.copy(E);
        const dir = v1.subVectors(H, E).normalize();
        A.cuff.position.copy(H).addScaledVector(dir, -0.012); A.cuff.quaternion.setFromUnitVectors(up, dir);
        A.hand.position.copy(H).addScaledVector(dir, 0.04);
        const flat = new T.Vector3(dir.x, Math.min(0, dir.y) * 0.3, dir.z).normalize();
        A.hand.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), flat);
      }
    }
    function style(o = {}) {
      tieM.color.setHex(o.tie || 0x7a1c1c);
      shades.visible = o.shades !== false;
      suit.color.setHex(o.suit || 0x15171c);
      hair.scale.set(0.91, o.hairTall ? 1.16 : 1.1, 1.04);
    }
    return { set, update, style, root };
  })();

  /* ---------------------------------------------------------------- camera */
  const cam = { mode: 'title', blend: 0, yaw: 0, pitch: 0, uYaw: 0, uPitch: 0, drag: null, t: 0, shake: 0, aspect: 1 };
  const PRESET = {
    land: { pos: new T.Vector3(0, 1.42, 1.08), tgt: new T.Vector3(0, 0.8, 0.0), h: 64, v: 64 },
    port: { pos: new T.Vector3(0, 1.84, 1.3), tgt: new T.Vector3(0, 0.8, 0.0), h: 44, v: 66 }
  };
  const camPos = new T.Vector3(), camTgt = new T.Vector3();
  function updateCamera(dt) {
    cam.t += dt;
    const a = cam.aspect, t = clamp((a - 0.72) / (1.3 - 0.72), 0, 1), s = t * t * (3 - 2 * t);
    const P = PRESET.port, L = PRESET.land;
    camPos.lerpVectors(P.pos, L.pos, s); camTgt.lerpVectors(P.tgt, L.tgt, s);
    const hf = lerp(P.h, L.h, s), vf = lerp(P.v, L.v, s);
    const need = 2 * Math.atan(Math.tan(hf * Math.PI / 360) / a) * 180 / Math.PI;
    camera.fov = clamp(Math.max(vf, need), 40, 84);
    const tb = cam.mode === 'title' ? 1 : 0;
    cam.blend += (tb - cam.blend) * (1 - Math.exp(-dt * 1.6));
    if (cam.blend > 0.001) {
      camPos.y += 0.16 * cam.blend; camPos.z += 0.24 * cam.blend; camTgt.y += 0.1 * cam.blend;
      const orbit = Math.sin(cam.t * 0.12) * 0.24 * cam.blend;
      camPos.applyAxisAngle(up0, orbit);
    }
    if (!cam.drag) { cam.uYaw *= Math.exp(-dt * 0.6); cam.uPitch *= Math.exp(-dt * 0.6); }
    cam.yaw += (cam.uYaw - cam.yaw) * (1 - Math.exp(-dt * 8)); cam.pitch += (cam.uPitch - cam.pitch) * (1 - Math.exp(-dt * 8));
    const dir = tmpV.subVectors(camTgt, camPos);
    dir.applyAxisAngle(up0, cam.yaw);
    const right = new T.Vector3().crossVectors(dir, up0).normalize();
    dir.applyAxisAngle(right, cam.pitch);
    camera.position.copy(camPos);
    camera.position.x += Math.sin(cam.t * 0.5) * 0.002; camera.position.y += Math.sin(cam.t * 0.31) * 0.0015;
    if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt); camera.position.x += rnd(cam.shake * 0.01); camera.position.y += rnd(cam.shake * 0.006); }
    camera.lookAt(tmpS.copy(camera.position).add(dir));
    if (typeof api !== 'undefined' && api.debugCam) { const d = api.debugCam; camera.position.set(...d.pos); camera.lookAt(...d.tgt); if (d.fov) camera.fov = d.fov; }
    camera.updateProjectionMatrix();
  }
  const up0 = new T.Vector3(0, 1, 0);

  /* ---------------------------------------------------------------- input */
  const el = renderer.domElement;
  const ray = new T.Raycaster(), ndc = new T.Vector2(), tablePlane = new T.Plane(new T.Vector3(0, 1, 0), -(TY + 0.004));
  let tapEnabled = false, onTap = null;
  el.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    cam.drag = { x: e.clientX, y: e.clientY, yaw: cam.uYaw, pitch: cam.uPitch, moved: false, id: e.pointerId, t: performance.now() };
  });
  el.addEventListener('pointermove', (e) => {
    const d = cam.drag; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 8) { d.moved = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} }
    if (d.moved) { const h = el.clientHeight || 1; cam.uYaw = clamp(d.yaw - dx / h * 0.9, -0.38, 0.38); cam.uPitch = clamp(d.pitch - dy / h * 0.6, -0.16, 0.2); }
  });
  const endDrag = (e) => {
    const d = cam.drag; if (!d || d.id !== e.pointerId) return;
    cam.drag = null;
    if (!d.moved && tapEnabled && onTap) {
      // where the finger meets the table, then the nearest of your piles (forgiving on small screens)
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const at = ray.ray.intersectPlane(tablePlane, tmpV2);
      if (!at) return;
      let best = -1, bd = 0.12;
      piles[0].forEach((p, i) => {
        if (p.amount <= 0) return;
        const c = new T.Vector3(0, 0, 0.012).applyMatrix4(p.obj.matrixWorld);
        const dd = Math.hypot(c.x - at.x, c.z - at.z);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best >= 0) onTap(best);
    }
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', (e) => { if (cam.drag && cam.drag.id === e.pointerId) cam.drag = null; });

  /* ---------------------------------------------------------------- resize */
  let vw = 1, vh = 1;
  function resize() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (w === vw && h === vh) return;
    vw = w; vh = h; renderer.setSize(w, h, false); cam.aspect = w / h; camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  /* ---------------------------------------------------------------- floating labels */
  const popLayer = document.createElement('div'); popLayer.className = 'pops'; host.appendChild(popLayer);
  const pops = [];
  function worldToScreen(v) { tmpV.copy(v).project(camera); return [(tmpV.x + 1) / 2 * vw, (1 - tmpV.y) / 2 * vh, tmpV.z < 1]; }
  function pop(world, html, cls = '', life = 1.7) {
    const d = document.createElement('div'); d.className = 'pop ' + cls; d.innerHTML = html; popLayer.appendChild(d);
    const p = { el: d, w: world.clone(), life, t: 0 }; pops.push(p);
    placePop(p);   // place it now, not on the next frame (it would flash in the corner)
    return p;
  }
  function placePop(p) {
    const [x, y, vis] = worldToScreen(p.w);
    p.el.style.transform = `translate(${x}px, ${y - p.t * 26}px) translate(-50%, -50%)`;
    p.el.style.opacity = vis ? String(clamp(p.life - p.t, 0, 0.35) / 0.35) : '0';
  }
  function stepPops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt;
      placePop(p);
      if (p.t >= p.life) { p.el.remove(); pops.splice(i, 1); }
    }
  }
  const sideWorld = (side, x, y, z) => new T.Vector3(x, y, z).applyMatrix4(sideRoot[side].matrixWorld);

  /* ---------------------------------------------------------------- main loop */
  let last = performance.now(), running = true, frameAvg = 16, perfT = 0;
  const maxDt = opts.maxDt || 0.1;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const rdt = Math.min(maxDt, Math.max(0, (now - last) / 1000)); last = now;
    const dt = rdt * speed;
    gameClock += dt;
    for (let i = waits.length - 1; i >= 0; i--) if (waits[i].at <= gameClock) { const w = waits[i]; waits.splice(i, 1); w.res(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt; const u = Math.min(1, tw.t / tw.d);
      tw.fn(tw.ease(u), u);
      if (u >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    stepItems(dt); stepRings(dt); stepIOU(dt);
    opp.update(dt);
    // doors
    for (const S of sides) { S.doorFar.rotation.x = S.doorOpen * 1.45; S.doorNear.rotation.x = -S.doorOpen * 1.45; }
    // dust and sparks
    const dp = dustGeo.attributes.position.array, tt = gameClock * 0.3;
    for (let i = 0; i < dustN; i++) {
      const j = i * 3;
      dp[j] = dustSeed[j] + Math.sin(tt + i * 1.7) * 0.03; dp[j + 1] = dustSeed[j + 1] + Math.sin(tt * 0.7 + i) * 0.04; dp[j + 2] = dustSeed[j + 2] + Math.cos(tt * 0.8 + i * 0.3) * 0.03;
    }
    dustGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < sparkN; i++) {
      const s = sparks[i];
      if (s.life > 0) { s.life -= dt; s.v.y -= 2.2 * dt; s.p.addScaledVector(s.v, dt); if (s.life <= 0) s.p.set(0, -10, 0); }
      sparkPos[i * 3] = s.p.x; sparkPos[i * 3 + 1] = s.p.y; sparkPos[i * 3 + 2] = s.p.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    // neon flicker
    neonFlicker -= rdt;
    if (neonFlicker <= 0) neonFlicker = 2 + Math.random() * 7;
    const fl = neonFlicker < 0.18 ? (Math.random() < 0.5 ? 0.25 : 1) : 1;
    neonMat.opacity = fl; neonLight.intensity = 2.2 * fl;
    updateCamera(rdt);
    renderMoney();
    renderer.render(scene, camera);
    stepPops(rdt);
    // adaptive resolution
    frameAvg = frameAvg * 0.95 + (now - (frame.prev || now)) * 0.05; frame.prev = now; perfT += rdt;
    if (perfT > 3) {
      perfT = 0;
      if (frameAvg > 26 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap)); vw = 0; resize(); }
    }
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  /* ================================================================ public API */
  const api = {
    THREE: T, renderer, camera, sfx,
    wait, tween,
    get speed() { return speed; },
    get clock() { return gameClock; },
    setSpeed(s) { speed = s; },
    setMode(m) { cam.mode = m; },
    shake(s = 0.4) { cam.shake = s; },
    set onTap(fn) { onTap = fn; },
    setTapEnabled(v) { tapEnabled = !!v; },
    pop(side, where, html, cls, life) {
      const at = where === 'iou' ? sideWorld(side, side ? -IOU.x : IOU.x, TY + 0.05, IOU.z)
        : where === 'home' ? sideWorld(side, 0, TY + 0.08, 0.57)
          : sideWorld(side, 0, TY + (side ? 0.15 : 0.04), side ? 0.3 : 0.23);
      return pop(at, html, cls, life);
    },
    // -------- setup
    reset() {
      for (const p of allPiles) { p.clear(); resetPilePos(p, true); }
      for (const S of sides) {
        S.doorOpen = 0; S.ring.run = null; S.ring.flash = null; S.lamps.forEach((L) => { L.level = 0; });
        S.iou.stamps = []; S.iou.shown = 0; S.iou.target = 0; S.iou.t = 1; S.iou.dirty = true; S.markOn = false;
      }
      stampG.visible = false; slip.visible = false;
      for (const p of pops) p.el.remove(); pops.length = 0;
      opp.set('idle');
    },
    setNames(me, op, round) { sides[0].iou.name = me; sides[1].iou.name = op; api.setRound(round || 1); },
    setRound(r) { for (const S of sides) { S.iou.round = r; S.iou.dirty = true; } },
    setOpponentStyle(o) { opp.style(o); },
    opp(mode, t = 1.5) { opp.set(mode, t); },
    setPiles(side, amounts) { piles[side].forEach((p, i) => { p.setAmount(amounts[i], 'instant'); }); },
    // coins tossed onto both sides at the start of a game
    async intro(a0, a1) {
      for (const side of [0, 1]) {
        const am = side ? a1 : a0;
        piles[side].forEach((p, i) => {
          resetPilePos(p, true);
          p.setAmount(am[i], 'instant');
          p.obj.updateMatrix();
          const inv = p.obj.matrix.clone().invert();          // side-local -> pile-local
          const hand = new T.Vector3(rnd(0.12), TY + 0.3 + Math.random() * 0.08, 0.98);
          const delay = 0.2 + i * 0.06 + side * 0.25 + Math.random() * 0.1;
          let n = 0;
          for (const d of DEN) for (const it of p.items[d.k]) {
            const p1 = it.p.clone(), q1 = it.q.clone(), p0 = hand.clone().applyMatrix4(inv);
            const pl = p1.clone().add(new T.Vector3(rnd(0.05), 0, 0.03 + Math.random() * 0.05));
            it.p.copy(p0);
            it.a = { t: -(delay + n * 0.03), d: 1.15 + Math.random() * 0.4, p0, p1, pl, q0: it.q.clone(), q1, s0: 1, s1: 1, ease: EASE.lin,
              toss: d.coin ? d.r : 0.002, land: 0.3, ph: Math.random() * 6, onLand: d.coin ? () => sfx.coin(d.k, 0.3) : () => sfx.paper(0.2) };
            n++;
          }
        });
      }
      setTimeout(() => sfx.wobble(1.1), 700 / Math.max(0.5, speed));
      await wait(2.1);
    },
    // move your chosen piles into the tray and the rest back home
    select(side, sel) {
      const set = new Set(sel), jobs = [];
      piles[side].forEach((p, i) => {
        const want = set.has(i) && p.amount > 0 ? 'tray' : 'home';
        if (want === p.place) return;
        p.place = want;
        const [x, y, z] = want === 'tray' ? trayPos(i) : homePos(i, p.off);
        const ry = want === 'tray' ? hrand(i, side, 5) * 0.08 : p.off.ry;
        jobs.push(p.moveTo(x, y, z, ry, { dur: 0.34, arc: 0.05, delay: jobs.length * 0.025 }));
      });
      if (jobs.length) { sfx.coin('c100', 0.18); setTimeout(() => sfx.paper(0.12), 120); }
      return Promise.all(jobs);
    },
    selected(side) { return piles[side].filter((p) => p.place === 'tray').map((p) => p.idx); },
    spin(side, ok, o = {}) {
      const S = sides[side], R = S.ring;
      R.flash = null;
      const target = ok ? GOLD_LAMPS[Math.floor(Math.random() * GOLD_LAMPS.length)] : RED_LAMPS[Math.floor(Math.random() * RED_LAMPS.length)];
      const loops = 2 + Math.floor(Math.random() * 2), from = R.pos;
      const steps = loops * 10 + (((target - from) % 10) + 10) % 10;
      const d = o.dur || (2.1 + Math.random() * 0.5);
      return new Promise((res) => { R.run = { t: 0, d, from, steps, ok, target, res, quiet: !!o.quiet }; });
    },
    async payout(side) {
      const sel = piles[side].filter((p) => p.place === 'tray');
      sel.forEach((bp, j) => {
        const pp = pays[side][bp.idx];
        pp.obj.position.set(bp.obj.position.x + rnd(0.008), DOOR_Y + bp.vtop + 0.0004, bp.obj.position.z + rnd(0.006));
        pp.obj.rotation.set(0, bp.obj.rotation.y + rnd(0.18), 0);
        pp.place = 'tray';
        pp.setAmount(bp.amount, 'rain', { delay: j * 0.07, h: 0.32 });
      });
      burst(side, 60);
      await wait(0.75 + sel.length * 0.07);
    },
    async lose(side) {
      const S = sides[side], sel = piles[side].filter((p) => p.place === 'tray');
      sfx.clunk();
      await tween(0.22, (e) => { S.doorOpen = e; }, EASE.inQuad);
      await Promise.all(sel.map((p) => new Promise((res) => { p.fall = { t: 0, d: 0.5, y0: p.obj.position.y, rx: rnd(4), rz: rnd(4), res }; })));
      sel.forEach((p) => { p.setAmount(0, 'instant'); resetPilePos(p, false); });
      await tween(0.3, (e) => { S.doorOpen = 1 - e; }, EASE.outBack);
      sfx.clunk();
    },
    async collect(side, amounts) {
      const jobs = [];
      piles[side].forEach((p, i) => {
        if (p.place === 'tray') {
          p.off = { x: rnd(0.006), z: rnd(0.005), ry: rnd(0.06) };
          const [x, y, z] = homePos(i, p.off);
          jobs.push(p.moveTo(x, y, z, p.off.ry, { dur: 0.48, arc: 0.07, delay: jobs.length * 0.03 }));
          const pp = pays[side][i];
          if (pp.amount > 0) jobs.push(pp.moveTo(x + rnd(0.006), y + p.vtop + 0.0004, z + rnd(0.005), p.off.ry + rnd(0.15), { dur: 0.52, arc: 0.09, delay: jobs.length * 0.03 }));
          p.place = 'home';
        }
      });
      piles[side].forEach((p, i) => {
        if (p.place === 'home' && !p.anim && Math.abs(p.off.ry) > 0.07) {
          p.off = { x: rnd(0.006), z: rnd(0.005), ry: rnd(0.06) };
          const [x, y, z] = homePos(i, p.off);
          jobs.push(p.moveTo(x, y, z, p.off.ry, { dur: 0.4, arc: 0.012 }));
        }
      });
      if (jobs.length) sfx.swish(0.18);
      await Promise.all(jobs);
      pays[side].forEach((pp) => { if (pp.amount > 0) { pp.setAmount(0, 'instant'); } pp.place = 'home'; });
      piles[side].forEach((p, i) => { if (p.place !== 'home') resetPilePos(p, false); p.setAmount(amounts[i], 'morph', { delay: i * 0.01 }); });
      await wait(0.4);
    },
    // re-lay all piles (e.g. after a guest reconnects); no animation
    sync(side, amounts, debt) { piles[side].forEach((p, i) => { if (p.place !== 'home') resetPilePos(p, false); p.setAmount(amounts[i], 'instant'); }); pays[side].forEach((pp) => pp.setAmount(0, 'instant')); setDebt(side, debt, 0); },
    async borrow(side, amounts, debt) {
      piles[side].forEach((p, i) => { resetPilePos(p, false); p.setAmount(amounts[i], 'rain', { delay: i * 0.05, h: 0.36 }); });
      sfx.paper(0.3);
      setDebt(side, debt, 0.8);
      await wait(1.2);
    },
    setDebt(side, debt, dur = 0.6) { setDebt(side, debt, dur); },
    mark(side, on) { sides[side].markOn = !!on; },
    async stamp(side, newDebt) {
      const S = sides[side], b = S.iou.board;
      const at = new T.Vector3(0, 0.0065, 0.006).applyMatrix4(b.matrixWorld);
      stampG.visible = true; stampG.position.set(at.x + 0.15, at.y + 0.3, at.z + (side ? -0.1 : 0.1)); stampG.rotation.set(0, 0, 0.2);
      const p0 = stampG.position.clone();
      await tween(0.32, (e) => { stampG.position.lerpVectors(p0, at, e); stampG.rotation.z = 0.2 * (1 - e); }, EASE.inQuad);
      sfx.stamp(); cam.shake = 0.15;
      S.iou.stamps.push({ x: 0.5 + rnd(0.18), y: 0.42 + rnd(0.12), r: rnd(0.4) });
      if (S.iou.stamps.length > 4) S.iou.stamps.shift();
      setDebt(side, newDebt, 0.7);
      await wait(0.18);
      const p1 = at.clone().add(new T.Vector3(-0.1, 0.32, side ? -0.1 : 0.1));
      await tween(0.3, (e) => { stampG.position.lerpVectors(at, p1, e); }, EASE.outCubic);
      stampG.visible = false;
    },
    async transfer(fromSide, toSide, amount, debts) {
      const x = slipC.getContext('2d'), W = slipC.width, H = slipC.height;
      x.fillStyle = '#f2ecdc'; x.fillRect(0, 0, W, H); x.strokeStyle = '#a32b22'; x.lineWidth = 3; x.strokeRect(7, 7, W - 14, H - 14);
      x.fillStyle = '#241e1a'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 26px ${SERIF}`; x.fillText('借 用 書', W / 2, 44);
      let fs = 32; x.font = `700 ${fs}px ${SERIF}`; const s = yen(amount);
      while (x.measureText(s).width > W - 30 && fs > 12) { fs -= 2; x.font = `700 ${fs}px ${SERIF}`; }
      x.fillText(s, W / 2, 130); x.font = `500 14px ${SERIF}`; x.fillText('肩代わり', W / 2, 190);
      slipTex.needsUpdate = true;
      const A = new T.Vector3(0, 0.012, 0.006).applyMatrix4(sides[fromSide].iou.board.matrixWorld);
      const B = new T.Vector3(0, 0.014, 0.006).applyMatrix4(sides[toSide].iou.board.matrixWorld);
      const gz = A.z < 0 ? -1 : 1;
      const pts = [A, new T.Vector3(SLOT_X, TY + 0.006, gz * 0.06), new T.Vector3(SLOT_X, TY + 0.006, -gz * 0.06), B];
      const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
      slip.visible = true; slip.rotation.set(-Math.PI / 2, 0, fromSide ? Math.PI : 0);
      sfx.swish(0.35);
      const r0 = fromSide ? Math.PI : 0, r1 = toSide ? Math.PI : 0;
      await tween(1.05, (e) => { curve.getPoint(e, slip.position); slip.position.y += Math.sin(Math.PI * e) * 0.012; slip.rotation.z = r0 + (r1 - r0) * e; }, EASE.inOutCubic);
      slip.visible = false; sfx.paper(0.3);
      if (debts) { setDebt(fromSide, debts[fromSide], 0.6); setDebt(toSide, debts[toSide], 0.6); }
      await wait(0.3);
    },
    burst,
    dispose() { running = false; ro.disconnect(); renderer.dispose(); }
  };
  return api;
}
