/* チケット・トゥ・ライド — the 3D table (three.js r160 from a CDN). Every texture is drawn here; no image files.
   Two scenes share one canvas:
     the world: a wooden table with the map board on it (board units: one route space ≈ 1, x east, z south, y up),
       route spaces, city pins and the players' train pieces. A perspective camera looks at it from the south;
       the player pans and pinches it, and it is framed inside layout.board.
     the tray (HUD): the five face-up train cards, the train deck, the ticket pile, the discards and the player's
       hand, drawn over the world with an orthographic camera in CSS pixels (y down in the API).
   The page tells the scene what to show (setView) and asks for animations (flyCard, dropTrains, ...). */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.TTR_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const M = window.TTR_MAP, LAND = window.TTR_LAND;
const LOCO = 8, GRAY = 9;
export const CARD_HEX = ['#d8509a', '#f4f0e6', '#2c6dd0', '#f2c21a', '#f08a1a', '#2a2a2e', '#d6352d', '#2f9a4b', '#ffffff'];
export const ROUTE_HEX = CARD_HEX.slice(0, 8).concat(['#ffffff', '#a9a8a2']);
/* the board's printed spaces: the same colours, a touch paler than the cards and the trains */
const TILE_HEX = ['#dd6aa8', '#f1ede2', '#4a82d6', '#efc534', '#ee9636', '#3b3b40', '#d84a42', '#47a35f', '#ffffff', '#b4b2ab'];
export const COLOR_NAME = ['ピンク', '白', '青', '黄', 'オレンジ', '黒', '赤', '緑', 'SL'];
export const COLOR_KANJI = ['桃', '白', '青', '黄', '橙', '黒', '赤', '緑', 'SL'];
export const SEATS = [      // hex: the trains; ink: the same player's colour for text on the dark panels
  { id: 'blue', name: '青', hex: '#3474e6', dark: '#1d4aa3', ink: '#7aa8ff' },
  { id: 'red', name: '赤', hex: '#e2453a', dark: '#9b241c', ink: '#ff8476' },
  { id: 'green', name: '緑', hex: '#25a85a', dark: '#146b38', ink: '#55d28d' },
  { id: 'yellow', name: '黄', hex: '#f3c22e', dark: '#a98112', ink: '#f6cd4a' },
  { id: 'black', name: '黒', hex: '#34363d', dark: '#141519', ink: '#c3c6cf' }
];
const JP_FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';
const NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", "Zen Maru Gothic", sans-serif';
const DISPLAY_FONT = '"Mochiy Pop One", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function shade(hex, k) {        // k < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
}
function rand32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ================================================================== the map board texture */
function paintBoard(W) {
  const B = M.BOX, bw = B.x1 - B.x0, bh = B.y1 - B.y0, H = Math.round(W * bh / bw);
  const c = canvas(W, H), x = c.getContext('2d'), S = W / bw;
  const X = (u) => (u - B.x0) * S, Y = (v) => (v - B.y0) * S;
  const rnd = rand32(7);
  const path = (flat, close) => {
    x.beginPath();
    for (let i = 0; i < flat.length; i += 2) { const px = X(flat[i] / 100), py = Y(flat[i + 1] / 100); if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    if (close) x.closePath();
  };
  // sea
  const sea = x.createLinearGradient(0, 0, W, H);
  sea.addColorStop(0, '#86b9c4'); sea.addColorStop(1, '#6fa5b4');
  x.fillStyle = sea; x.fillRect(0, 0, W, H);
  // water lines along every coast (drawn first; the land covers the inner half)
  const coastRings = LAND.land.concat(LAND.lakes);
  [[0.95, 'rgba(255,255,255,0.10)'], [0.62, 'rgba(36,86,104,0.10)'], [0.38, 'rgba(255,255,255,0.14)'], [0.2, 'rgba(36,86,104,0.16)']].forEach(([w, col]) => {
    x.strokeStyle = col; x.lineWidth = w * S; x.lineJoin = 'round';
    LAND.land.forEach((r) => { path(r, true); x.stroke(); });
  });
  // land
  const land = x.createRadialGradient(W * 0.45, H * 0.45, W * 0.05, W * 0.5, H * 0.5, W * 0.7);
  land.addColorStop(0, '#f2e6c4'); land.addColorStop(1, '#e3d0a2');
  x.fillStyle = land;
  LAND.land.forEach((r) => { path(r, true); x.fill(); });
  // paper grain on the land
  x.save();
  LAND.land.forEach((r) => { path(r, true); });
  x.beginPath(); LAND.land.forEach((r) => { for (let i = 0; i < r.length; i += 2) { const px = X(r[i] / 100), py = Y(r[i + 1] / 100); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.closePath(); });
  x.clip();
  for (let i = 0; i < W * H / 900; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(120,90,40,0.05)' : 'rgba(255,255,255,0.06)'; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
  // soft relief: a few broad darker blotches (mountain belts, not to scale)
  [[-8.5, -3.5, 3.6, 0.07], [-6.6, 0.5, 2.6, 0.06], [-10.5, -5, 2.2, 0.05], [7.2, 1.5, 2.4, 0.045]].forEach(([u, v, r0, a]) => {
    const g = x.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), r0 * S);
    g.addColorStop(0, 'rgba(150,110,60,' + a + ')'); g.addColorStop(1, 'rgba(150,110,60,0)');
    x.fillStyle = g; x.fillRect(X(u - r0), Y(v - r0), 2 * r0 * S, 2 * r0 * S);
  });
  x.restore();
  // coast line
  x.strokeStyle = '#6d5c3c'; x.lineWidth = Math.max(1.2, 0.035 * S);
  LAND.land.forEach((r) => { path(r, true); x.stroke(); });
  // lakes
  x.fillStyle = '#86b9c4';
  LAND.lakes.forEach((r) => { path(r, true); x.fill(); });
  x.strokeStyle = 'rgba(36,86,104,0.35)'; x.lineWidth = Math.max(1, 0.025 * S);
  LAND.lakes.forEach((r) => { path(r, true); x.stroke(); });
  // rivers
  x.strokeStyle = 'rgba(70,128,150,0.55)'; x.lineWidth = Math.max(1, 0.03 * S); x.lineCap = 'round';
  LAND.rivers.forEach((r) => { path(r, false); x.stroke(); });
  // state and province lines, then the national borders
  x.setLineDash([0.07 * S, 0.11 * S]); x.strokeStyle = 'rgba(120,96,58,0.38)'; x.lineWidth = Math.max(1, 0.025 * S);
  LAND.states.forEach((r) => { path(r, false); x.stroke(); });
  x.setLineDash([0.32 * S, 0.12 * S, 0.06 * S, 0.12 * S]); x.strokeStyle = 'rgba(122,72,40,0.7)'; x.lineWidth = Math.max(1.4, 0.05 * S);
  LAND.borders.forEach((r) => { path(r, false); x.stroke(); });
  x.setLineDash([]);
  // frame
  x.strokeStyle = '#3f3423'; x.lineWidth = 0.09 * S; x.strokeRect(0.25 * S, 0.25 * S, W - 0.5 * S, H - 0.5 * S);
  x.strokeStyle = 'rgba(63,52,35,0.6)'; x.lineWidth = 0.03 * S; x.strokeRect(0.42 * S, 0.42 * S, W - 0.84 * S, H - 0.84 * S);
  // compass rose (Atlantic)
  compass(x, X(12.55), Y(7.2), 1.05 * S);
  // title cartouche (Pacific)
  cartouche(x, X(-14.15), Y(6.35), 4.6 * S, 2.6 * S, S);
  // city names
  M.cities.forEach((ct) => {
    const lb = ct.label, fs = lb.fs * S, lines = lb.text.split('\n');
    x.font = '900 ' + Math.round(fs) + 'px ' + JP_FONT;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    lines.forEach((t, i) => {
      const px = X(ct.x + lb.x), py = Y(ct.y + lb.y + (i - (lines.length - 1) / 2) * lb.fs * 1.12);
      x.strokeStyle = 'rgba(246,238,215,0.95)'; x.lineWidth = fs * 0.32; x.strokeText(t, px, py);
      x.fillStyle = '#2b2116'; x.fillText(t, px, py);
    });
  });
  return c;
}
function compass(x, cx, cy, r) {
  x.save(); x.translate(cx, cy);
  x.strokeStyle = 'rgba(52,44,30,0.75)'; x.lineWidth = r * 0.03;
  x.beginPath(); x.arc(0, 0, r * 0.82, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(0, 0, r * 0.74, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, long = k % 2 === 0, L = long ? r : r * 0.6, w = long ? r * 0.16 : r * 0.11;
    x.save(); x.rotate(a);
    x.beginPath(); x.moveTo(0, -L); x.lineTo(w, 0); x.lineTo(0, 0); x.closePath(); x.fillStyle = long ? '#3d3322' : '#6b5a3d'; x.fill();
    x.beginPath(); x.moveTo(0, -L); x.lineTo(-w, 0); x.lineTo(0, 0); x.closePath(); x.fillStyle = '#efe3c2'; x.fill(); x.stroke();
    x.restore();
  }
  x.fillStyle = '#3d3322'; x.font = '900 ' + Math.round(r * 0.32) + 'px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('N', 0, -r * 1.18);
  x.restore();
}
function cartouche(x, X0, Y0, w, h, S) {
  x.save();
  x.fillStyle = 'rgba(244,234,206,0.92)'; rr(x, X0, Y0, w, h, 0.25 * S); x.fill();
  x.strokeStyle = '#3f3423'; x.lineWidth = 0.05 * S; x.stroke();
  x.strokeStyle = 'rgba(63,52,35,0.55)'; x.lineWidth = 0.02 * S; rr(x, X0 + 0.14 * S, Y0 + 0.14 * S, w - 0.28 * S, h - 0.28 * S, 0.18 * S); x.stroke();
  x.fillStyle = '#3a2d1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = Math.round(0.62 * S) + 'px ' + DISPLAY_FONT;
  x.fillText('北アメリカ鉄道図', X0 + w / 2, Y0 + h * 0.4);
  x.font = '700 ' + Math.round(0.3 * S) + 'px ' + JP_FONT;
  x.fillStyle = '#6b5a3d';
  x.fillText('RAILWAYS OF NORTH AMERICA · 1900', X0 + w / 2, Y0 + h * 0.72);
  // a little locomotive
  x.restore();
}

/* ================================================================== wood, felt */
function paintWood(seed) {
  const c = canvas(1024, 1024), x = c.getContext('2d'), rnd = rand32(seed || 3);
  x.fillStyle = '#5a3a22'; x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 120; i++) {
    const y = rnd() * 1024, a = 0.03 + rnd() * 0.08, h = 2 + rnd() * 18;
    x.fillStyle = (rnd() < 0.5 ? 'rgba(30,16,8,' : 'rgba(140,96,56,') + a + ')';
    x.beginPath(); x.moveTo(0, y);
    for (let k = 0; k <= 16; k++) x.lineTo(k * 64, y + Math.sin(k * 0.7 + i) * 6 + rnd() * 3);
    for (let k = 16; k >= 0; k--) x.lineTo(k * 64, y + h + Math.sin(k * 0.7 + i) * 6);
    x.closePath(); x.fill();
  }
  for (let i = 0; i < 9000; i++) { x.fillStyle = 'rgba(0,0,0,' + (rnd() * 0.06) + ')'; x.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 6, 1); }
  return c;
}

/* ================================================================== cards */
/* simple side views of the railway cars (each colour its own), drawn into a box centred at 0,0 of width w */
function carIcon(x, kind, w, fg, bg) {
  const h = w * 0.42, u = w / 100;
  x.save();
  x.fillStyle = fg; x.strokeStyle = fg; x.lineWidth = 2.2 * u; x.lineJoin = 'round';
  const wheels = (xs) => { xs.forEach((cx) => { x.beginPath(); x.arc(cx * u, h * 0.5, 7 * u, 0, Math.PI * 2); x.fill(); x.beginPath(); x.fillStyle = bg; x.arc(cx * u, h * 0.5, 2.6 * u, 0, Math.PI * 2); x.fill(); x.fillStyle = fg; }); };
  const frame = () => { x.fillRect(-46 * u, h * 0.32, 92 * u, 4 * u); x.fillRect(-50 * u, h * 0.34, 4 * u, 3 * u); x.fillRect(46 * u, h * 0.34, 4 * u, 3 * u); };
  if (kind === 8) {         // steam locomotive
    rr(x, -44 * u, -h * 0.55, 30 * u, h * 0.9, 3 * u); x.fill();                 // cab
    x.fillRect(-48 * u, -h * 0.66, 38 * u, 5 * u);                                // roof
    rr(x, -16 * u, -h * 0.22, 58 * u, h * 0.56, h * 0.28); x.fill();             // boiler
    x.fillRect(26 * u, -h * 0.62, 9 * u, h * 0.45); x.fillRect(23 * u, -h * 0.7, 15 * u, 5 * u);   // stack
    x.beginPath(); x.arc(8 * u, -h * 0.24, 7 * u, Math.PI, 0); x.fill();       // dome
    x.beginPath(); x.moveTo(42 * u, h * 0.2); x.lineTo(54 * u, h * 0.42); x.lineTo(40 * u, h * 0.42); x.closePath(); x.fill();   // cow catcher
    x.fillStyle = bg; rr(x, -38 * u, -h * 0.42, 18 * u, h * 0.3, 2 * u); x.fill(); x.fillStyle = fg;
    frame();
    [[-30, 9], [-6, 10], [18, 10], [36, 6]].forEach(([cx, r]) => { x.beginPath(); x.arc(cx * u, h * 0.5 - (r - 7) * u, r * u, 0, Math.PI * 2); x.fill(); x.beginPath(); x.fillStyle = bg; x.arc(cx * u, h * 0.5 - (r - 7) * u, r * 0.38 * u, 0, Math.PI * 2); x.fill(); x.fillStyle = fg; });
    // smoke puffs
    x.globalAlpha = 0.55; [[36, -0.95, 6], [46, -1.18, 8], [60, -1.3, 10]].forEach(([cx, cy, r]) => { x.beginPath(); x.arc(cx * u, h * cy, r * u, 0, Math.PI * 2); x.fill(); }); x.globalAlpha = 1;
    x.restore(); return;
  }
  if (kind === 0) {         // box car
    rr(x, -44 * u, -h * 0.62, 88 * u, h * 0.92, 3 * u); x.fill();
    x.fillStyle = bg; x.fillRect(-10 * u, -h * 0.5, 2.5 * u, h * 0.74); x.fillRect(8 * u, -h * 0.5, 2.5 * u, h * 0.74);
    x.fillRect(-8 * u, -h * 0.12, 16 * u, 2 * u); x.fillStyle = fg;
  } else if (kind === 1) {  // passenger car
    rr(x, -48 * u, -h * 0.62, 96 * u, h * 0.92, 6 * u); x.fill();
    x.fillRect(-44 * u, -h * 0.76, 88 * u, 5 * u);
    x.fillStyle = bg; for (let i = 0; i < 6; i++) rr(x, (-40 + i * 14) * u, -h * 0.45, 9 * u, h * 0.3, 1.5 * u), x.fill(); x.fillStyle = fg;
  } else if (kind === 2) {  // tank car
    rr(x, -46 * u, -h * 0.48, 92 * u, h * 0.66, h * 0.33); x.fill();
    rr(x, -6 * u, -h * 0.72, 12 * u, h * 0.3, 2 * u); x.fill();
    x.fillStyle = bg; x.fillRect(-46 * u, -h * 0.17, 92 * u, 1.8 * u); x.fillStyle = fg;
  } else if (kind === 3) {  // refrigerator car
    rr(x, -44 * u, -h * 0.62, 88 * u, h * 0.92, 3 * u); x.fill();
    x.fillStyle = bg; for (let i = 0; i < 9; i++) x.fillRect((-38 + i * 9.5) * u, -h * 0.52, 1.6 * u, h * 0.72);
    x.fillStyle = fg; x.fillRect(-36 * u, -h * 0.82, 8 * u, h * 0.22); x.fillRect(28 * u, -h * 0.82, 8 * u, h * 0.22);
  } else if (kind === 4) {  // flat car with crates
    x.fillRect(-46 * u, h * 0.12, 92 * u, 8 * u);
    rr(x, -40 * u, -h * 0.5, 34 * u, h * 0.62, 2 * u); x.fill(); rr(x, -2 * u, -h * 0.25, 22 * u, h * 0.37, 2 * u); x.fill(); rr(x, 23 * u, -h * 0.62, 18 * u, h * 0.74, 2 * u); x.fill();
    x.fillStyle = bg; x.fillRect(-40 * u, -h * 0.2, 34 * u, 1.6 * u); x.fillRect(23 * u, -h * 0.25, 18 * u, 1.6 * u); x.fillStyle = fg;
  } else if (kind === 5) {  // hopper
    x.beginPath(); x.moveTo(-46 * u, -h * 0.58); x.lineTo(46 * u, -h * 0.58); x.lineTo(40 * u, h * 0.05); x.lineTo(16 * u, h * 0.28); x.lineTo(-16 * u, h * 0.28); x.lineTo(-40 * u, h * 0.05); x.closePath(); x.fill();
    x.fillStyle = bg; x.fillRect(-1 * u, -h * 0.5, 2 * u, h * 0.7); x.fillStyle = fg;
  } else if (kind === 6) {  // coal gondola
    rr(x, -44 * u, -h * 0.25, 88 * u, h * 0.55, 3 * u); x.fill();
    for (let i = 0; i < 7; i++) { x.beginPath(); x.arc((-36 + i * 12) * u, -h * 0.28, 7 * u, Math.PI, 0); x.fill(); }
    x.fillStyle = bg; x.fillRect(-44 * u, -h * 0.02, 88 * u, 1.6 * u); x.fillStyle = fg;
  } else {                  // caboose
    rr(x, -40 * u, -h * 0.5, 80 * u, h * 0.8, 4 * u); x.fill();
    rr(x, -12 * u, -h * 0.82, 24 * u, h * 0.36, 2 * u); x.fill();
    x.fillRect(-44 * u, -h * 0.58, 88 * u, 4 * u);
    x.fillStyle = bg; rr(x, -30 * u, -h * 0.32, 10 * u, h * 0.24, 1.5 * u); x.fill(); rr(x, 20 * u, -h * 0.32, 10 * u, h * 0.24, 1.5 * u); x.fill(); rr(x, -7 * u, -h * 0.72, 14 * u, h * 0.16, 1.5 * u); x.fill(); x.fillStyle = fg;
  }
  frame();
  wheels([-30, -18, 18, 30]);
  x.restore();
}
const CARD_PX = [256, 360];
export function paintTrainCard(col) {
  const [W, H] = CARD_PX, c = canvas(W, H), x = c.getContext('2d');
  const base = CARD_HEX[col];
  rr(x, 0, 0, W, H, 26); x.fillStyle = '#fbf6ea'; x.fill();
  if (col === LOCO) {
    const g = x.createLinearGradient(0, 0, W, H);
    ['#d6352d', '#f08a1a', '#f2c21a', '#2f9a4b', '#2c6dd0', '#d8509a'].forEach((h, i) => g.addColorStop(i / 5, h));
    rr(x, 12, 12, W - 24, H - 24, 18); x.fillStyle = g; x.fill();
    x.fillStyle = 'rgba(255,255,255,0.22)'; for (let i = -6; i < 12; i++) { x.beginPath(); x.moveTo(i * 34, 12); x.lineTo(i * 34 + 14, 12); x.lineTo(i * 34 + 14 + 200, H); x.lineTo(i * 34 + 200, H); x.closePath(); x.fill(); }
  } else {
    rr(x, 12, 12, W - 24, H - 24, 18); x.fillStyle = base; x.fill();
    const g = x.createLinearGradient(0, 12, 0, H - 12); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.14)');
    rr(x, 12, 12, W - 24, H - 24, 18); x.fillStyle = g; x.fill();
  }
  const dark = col === 5 || col === 2 || col === 6 || col === 7 || col === 0;
  // the picture panel
  rr(x, 30, 96, W - 60, 150, 16); x.fillStyle = col === 1 ? '#e6dfcf' : 'rgba(255,255,255,0.86)'; x.fill();
  x.save(); x.translate(W / 2, 176); carIcon(x, col, 176, col === LOCO ? '#2a2420' : col === 1 ? '#5a554a' : shade(base, -0.42), col === 1 ? '#e6dfcf' : '#ffffff'); x.restore();
  // colour name and kanji (also for colour-blind players)
  const ink = col === LOCO ? '#ffffff' : dark ? '#ffffff' : col === 1 ? '#4a4538' : '#2a2116';
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = (col === LOCO ? '900 64px ' + NUM_FONT : '900 58px ' + JP_FONT);
  if (col === LOCO) { x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeText('SL', W / 2, 58); }
  x.fillText(COLOR_KANJI[col], W / 2, 58);
  x.font = '700 30px ' + JP_FONT;
  if (col === LOCO) { x.lineWidth = 6; x.strokeText('どの色にもなる', W / 2, H - 70); }
  x.fillText(col === LOCO ? 'どの色にもなる' : COLOR_NAME[col], W / 2, H - 70);
  // corner marks
  x.font = '900 28px ' + JP_FONT;
  [[34, 36], [W - 34, H - 36]].forEach(([px, py]) => { x.fillText(col === LOCO ? '★' : COLOR_KANJI[col], px, py); });
  return c;
}
export function paintCardBack() {
  const [W, H] = CARD_PX, c = canvas(W, H), x = c.getContext('2d');
  rr(x, 0, 0, W, H, 26); x.fillStyle = '#f3ead2'; x.fill();
  rr(x, 12, 12, W - 24, H - 24, 18); x.fillStyle = '#1f3b57'; x.fill();
  x.strokeStyle = 'rgba(242,200,120,0.6)'; x.lineWidth = 4; rr(x, 24, 24, W - 48, H - 48, 12); x.stroke();
  // rails
  x.save(); x.translate(W / 2, H / 2); x.rotate(-0.35);
  x.strokeStyle = 'rgba(242,200,120,0.32)'; x.lineWidth = 6;
  for (let k = -1; k <= 1; k += 2) { x.beginPath(); x.moveTo(-300, k * 22); x.lineTo(300, k * 22); x.stroke(); }
  x.lineWidth = 9; for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(i * 26, -34); x.lineTo(i * 26, 34); x.stroke(); }
  x.restore();
  x.save(); x.translate(W / 2, H / 2 + 4); carIcon(x, 8, 150, '#f2c878', '#1f3b57'); x.restore();
  return c;
}
/* destination tickets: two city names, a little map with both cities, the points */
export function paintTicket(t) {
  const W = 420, H = 280, c = canvas(W, H), x = c.getContext('2d');
  const T0 = M.tickets[t], A = M.cities[T0.a], B = M.cities[T0.b];
  rr(x, 0, 0, W, H, 22); x.fillStyle = '#f5ecd2'; x.fill();
  x.strokeStyle = '#8a6a3c'; x.lineWidth = 4; rr(x, 10, 10, W - 20, H - 20, 14); x.stroke();
  // the two cities, one per line
  x.fillStyle = '#2b2116'; x.textAlign = 'left'; x.textBaseline = 'middle';
  const fit = (s, maxW, size) => { let f = size; x.font = '900 ' + f + 'px ' + JP_FONT; while (x.measureText(s).width > maxW && f > 16) { f -= 2; x.font = '900 ' + f + 'px ' + JP_FONT; } };
  fit(A.ja, W - 56, 36); x.fillText(A.ja, 26, 46);
  x.fillStyle = '#b8352a'; x.font = '900 24px ' + JP_FONT; x.fillText('⇄', 28, 88);
  x.fillStyle = '#2b2116'; fit(B.ja, W - 92, 36); x.fillText(B.ja, 62, 88);
  // a little map with both cities
  const mw = 204, mh = mw * (M.BOX.y1 - M.BOX.y0) / (M.BOX.x1 - M.BOX.x0), mx = 22, my = H - 18 - mh;
  const S = mw / (M.BOX.x1 - M.BOX.x0);
  const PX = (u) => mx + (u - M.BOX.x0) * S, PY = (v) => my + (v - M.BOX.y0) * S;
  x.save(); rr(x, mx, my, mw, mh, 10); x.clip();
  x.fillStyle = '#a9cbd2'; x.fillRect(mx, my, mw, mh);
  x.fillStyle = '#ead9b0';
  LAND.land.forEach((r) => { x.beginPath(); for (let i = 0; i < r.length; i += 6) { const px = PX(r[i] / 100), py = PY(r[i + 1] / 100); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.closePath(); x.fill(); });
  x.strokeStyle = 'rgba(80,60,30,0.28)'; x.lineWidth = 1.1;
  M.routes.forEach((r) => { if (r.lane === 1) return; const a = M.cities[r.a], b = M.cities[r.b]; x.beginPath(); x.moveTo(PX(a.x), PY(a.y)); x.lineTo(PX(b.x), PY(b.y)); x.stroke(); });
  x.strokeStyle = '#c0392b'; x.lineWidth = 3; x.setLineDash([6, 5]);
  x.beginPath(); x.moveTo(PX(A.x), PY(A.y)); x.lineTo(PX(B.x), PY(B.y)); x.stroke(); x.setLineDash([]);
  [A, B].forEach((C) => { x.beginPath(); x.arc(PX(C.x), PY(C.y), 6.5, 0, Math.PI * 2); x.fillStyle = '#c0392b'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = '#fff'; x.stroke(); });
  x.restore();
  x.strokeStyle = '#8a6a3c'; x.lineWidth = 2; rr(x, mx, my, mw, mh, 10); x.stroke();
  // the points
  const px = W - 92, py = my + mh / 2 - 4;
  x.beginPath(); x.arc(px, py, 56, 0, Math.PI * 2); x.fillStyle = '#c0392b'; x.fill();
  x.lineWidth = 5; x.strokeStyle = '#f5ecd2'; x.beginPath(); x.arc(px, py, 47, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 56px ' + NUM_FONT; x.fillText(String(T0.pts), px, py + 2);
  x.font = '900 22px ' + JP_FONT; x.fillStyle = '#8a6a3c'; x.textAlign = 'left'; x.fillText('点', px + 60, py + 40);
  return c;
}
export function paintTicketBack() {
  const W = 420, H = 280, c = canvas(W, H), x = c.getContext('2d');
  rr(x, 0, 0, W, H, 22); x.fillStyle = '#f3ead2'; x.fill();
  rr(x, 10, 10, W - 20, H - 20, 14); x.fillStyle = '#7a3b22'; x.fill();
  x.strokeStyle = 'rgba(245,220,170,0.6)'; x.lineWidth = 4; rr(x, 22, 22, W - 44, H - 44, 10); x.stroke();
  x.fillStyle = '#f5dcaa'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '400 46px ' + DISPLAY_FONT; x.fillText('行き先チケット', W / 2, H / 2 - 18);
  x.font = '700 22px ' + NUM_FONT; x.fillText('DESTINATION', W / 2, H / 2 + 36);
  return c;
}

/* ================================================================== geometry */
function roundRectShape(w, h, r) {
  const s = new T.Shape(), x0 = -w / 2, y0 = -h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h); s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function normUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - b.min.x) / (b.max.x - b.min.x), (pos.getY(i) - b.min.y) / (b.max.y - b.min.y));
  uv.needsUpdate = true;
  return geo;
}
/* a route space: a flat rounded tile 1 long, 0.34 wide (scaled along x per route) */
function tileGeometry() {
  const g = new T.ExtrudeGeometry(roundRectShape(1, 0.33, 0.07), { depth: 0.018, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.004, 0);
  return g;
}
/* a train piece: a car seen from the side (wheels and a roof), extruded across */
function trainGeometry() {
  const s = new T.Shape(), L = 0.39, H0 = 0.04, H1 = 0.27;
  s.moveTo(-L, H0 + 0.02);
  s.lineTo(-L + 0.08, H0 + 0.02);
  s.absarc(-L + 0.13, H0, 0.045, Math.PI, 0, true);
  s.lineTo(L - 0.18, H0 + 0.02);
  s.absarc(L - 0.13, H0, 0.045, Math.PI, 0, true);
  s.lineTo(L, H0 + 0.02);
  s.lineTo(L, H1 - 0.02);
  s.quadraticCurveTo(L, H1 + 0.02, L - 0.05, H1 + 0.025);
  s.lineTo(-L + 0.05, H1 + 0.025);
  s.quadraticCurveTo(-L, H1 + 0.02, -L, H1 - 0.02);
  s.lineTo(-L, H0 + 0.02);
  const g = new T.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1, curveSegments: 5 });
  g.translate(0, -0.01, -0.12);
  return g;
}

/* ================================================================== the scene */
export function createScene(host, opts = {}) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.keepFrame });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x1a120c, 1);
  host.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;
  canvasEl.style.touchAction = 'none';
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let quality = opts.quality || 'high';
  let speed = opts.speed || 1;
  const ms = (d) => d / speed;

  /* ------------------------------------------------ tweens */
  const tweens = new Set();
  let clock = performance.now();
  function tween(dur, fn, ease = easeIO) {
    return new Promise((res) => {
      if (dur <= 0) { fn(1); res(); return; }
      tweens.add({ t0: performance.now(), dur, fn, ease, res });
      kick();
    });
  }
  const wait = (d) => tween(d, () => {});

  /* ------------------------------------------------ the world */
  const world = new T.Scene();
  const cam = new T.PerspectiveCamera(30, 1, 0.5, 600);
  world.add(new T.HemisphereLight(0xfff3e0, 0x3a2a1c, 1.05));
  const key = new T.DirectionalLight(0xfff1dc, 1.75);
  key.position.set(-9, 32, 16); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -19; key.shadow.camera.right = 19; key.shadow.camera.top = 15; key.shadow.camera.bottom = -15;
  key.shadow.camera.near = 5; key.shadow.camera.far = 80; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  world.add(key); world.add(key.target);

  const woodTex = new T.CanvasTexture(paintWood(5)); woodTex.colorSpace = T.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(5, 5); woodTex.anisotropy = ANISO;
  const table = new T.Mesh(new T.PlaneGeometry(220, 220), new T.MeshStandardMaterial({ map: woodTex, roughness: 0.78 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.24; table.receiveShadow = true;
  world.add(table);

  const BX = M.BOX, BW = BX.x1 - BX.x0, BH = BX.y1 - BX.y0, BCX = (BX.x0 + BX.x1) / 2, BCZ = (BX.y0 + BX.y1) / 2;
  let boardTex = null;
  const boardTop = new T.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const boardSide = new T.MeshStandardMaterial({ color: 0x23302a, roughness: 0.7 });
  const board = new T.Mesh(new T.BoxGeometry(BW, 0.22, BH), [boardSide, boardSide, boardTop, boardSide, boardSide, boardSide]);
  board.position.set(BCX, -0.11, BCZ); board.receiveShadow = true; board.castShadow = true;
  world.add(board);
  function paintBoardTexture() {
    const W = Math.min(quality === 'high' ? 4096 : 2048, renderer.capabilities.maxTextureSize || 4096);
    const tex = new T.CanvasTexture(paintBoard(W));
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = ANISO;
    if (boardTex) boardTex.dispose();
    boardTex = tex; boardTop.map = tex; boardTop.needsUpdate = true;
  }
  paintBoardTexture();

  /* route spaces */
  const GEO = M.geometry();
  const SPACES = [];           // { r, k, x, z, ang, len }
  GEO.forEach((g, r) => g.spaces.forEach((s, k) => SPACES.push({ r, k, x: s.x, z: s.y, ang: s.ang, len: s.len })));
  const spacesOf = M.routes.map(() => []);
  SPACES.forEach((s, i) => spacesOf[s.r].push(i));
  const tileGeo = tileGeometry();
  const tileMat = new T.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const tiles = new T.InstancedMesh(tileGeo, tileMat, SPACES.length);
  const edgeMat = new T.MeshStandardMaterial({ color: 0x2b2116, roughness: 0.8 });
  const edgeGeo = new T.ShapeGeometry(roundRectShape(1, 0.33, 0.09), 2); edgeGeo.rotateX(-Math.PI / 2);
  const edges = new T.InstancedMesh(edgeGeo, edgeMat, SPACES.length);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), v3 = new T.Vector3(), s3 = new T.Vector3(), up = new T.Vector3(0, 1, 0), col = new T.Color();
  SPACES.forEach((s, i) => {
    q.setFromAxisAngle(up, -s.ang);
    m4.compose(v3.set(s.x, 0.0, s.z), q, s3.set(s.len, 1, 1)); tiles.setMatrixAt(i, m4);
    m4.compose(v3.set(s.x, 0.003, s.z), q, s3.set(s.len + 0.07, 1, 1.24)); edges.setMatrixAt(i, m4);
    col.set(TILE_HEX[M.routes[s.r].col]);
    tiles.setColorAt(i, col);
  });
  tiles.castShadow = true; tiles.receiveShadow = true; edges.receiveShadow = true;
  world.add(edges); world.add(tiles);

  /* highlight halos under the spaces */
  const haloMat = new T.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const plateGeo = new T.ShapeGeometry(roundRectShape(1, 0.33, 0.12), 3); plateGeo.rotateX(-Math.PI / 2);
  const halos = new T.InstancedMesh(plateGeo, haloMat, SPACES.length);
  halos.count = 0; halos.renderOrder = 2;
  world.add(halos);
  const selMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const selHalo = new T.InstancedMesh(plateGeo, selMat, 8);
  selHalo.count = 0; selHalo.renderOrder = 3;
  world.add(selHalo);
  const pathMat = new T.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.9, depthWrite: false });
  const pathHalo = new T.InstancedMesh(plateGeo, pathMat, SPACES.length);
  pathHalo.count = 0; pathHalo.renderOrder = 2;
  world.add(pathHalo);

  /* city pins */
  const pinTex = (() => {
    const c = canvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#f6ecd0'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#b8352a'; x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(54, 52, 18, 0, Math.PI * 2); x.fill();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  const pinGeo = new T.CylinderGeometry(0.25, 0.27, 0.12, 28);
  const pins = new T.InstancedMesh(pinGeo, [new T.MeshStandardMaterial({ color: 0x6e2a1f, roughness: 0.6 }), new T.MeshStandardMaterial({ map: pinTex, roughness: 0.5 }), new T.MeshStandardMaterial({ color: 0x3a1a12 })], M.cities.length);
  M.cities.forEach((c, i) => { m4.compose(v3.set(c.x, 0.06, c.y), q.identity(), s3.set(1, 1, 1)); pins.setMatrixAt(i, m4); });
  pins.castShadow = true; pins.receiveShadow = true;
  world.add(pins);
  const ringGeo = new T.RingGeometry(0.33, 0.47, 40); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new T.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
  const rings = new T.InstancedMesh(ringGeo, ringMat, M.cities.length);
  rings.count = 0; rings.renderOrder = 4;
  world.add(rings);
  const ringMat2 = new T.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide });
  const rings2 = new T.InstancedMesh(ringGeo, ringMat2, M.cities.length);
  rings2.count = 0; rings2.renderOrder = 4;
  world.add(rings2);

  /* train pieces, one instanced mesh per seat */
  const trainGeo = trainGeometry();
  let seatColors = SEATS.map((s) => s.hex);
  const trainMeshes = SEATS.map((s, i) => {
    const mat = new T.MeshStandardMaterial({ color: new T.Color(s.hex), roughness: 0.32, metalness: 0.06 });
    const mesh = new T.InstancedMesh(trainGeo, mat, 50);
    mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  });
  const placed = SEATS.map(() => []);       // per seat: [{ r, k, y }]
  function trainMatrix(spaceIdx, lift, spin) {
    const s = SPACES[spaceIdx];
    q.setFromAxisAngle(up, -s.ang + (spin || 0));
    const sc = Math.min(1, (s.len + 0.02) / 0.8);
    return m4.compose(v3.set(s.x, 0.03 + (lift || 0), s.z), q, s3.set(sc, 1, 1));
  }
  function rebuildTrains(seat) {
    const mesh = trainMeshes[seat], list = placed[seat];
    list.forEach((t, i) => mesh.setMatrixAt(i, trainMatrix(t.si, t.lift || 0, t.spin || 0)));
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    kick();
  }
  function setSeatColors(hexes) {
    seatColors = hexes.slice();
    trainMeshes.forEach((m, i) => { if (hexes[i]) m.material.color.set(hexes[i]); });
  }

  /* ------------------------------------------------ the tray (HUD) */
  const hud = new T.Scene();
  const hcam = new T.OrthographicCamera(0, 100, 0, -100, -2000, 2000);
  hud.add(new T.AmbientLight(0xffffff, 1.6));
  const hkey = new T.DirectionalLight(0xffffff, 1.5); hkey.position.set(-300, 600, 900); hud.add(hkey);
  const cardTex = [];
  function trainTex(c) { if (!cardTex[c]) { const t = new T.CanvasTexture(paintTrainCard(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = ANISO; cardTex[c] = t; } return cardTex[c]; }
  const backTex = new T.CanvasTexture(paintCardBack()); backTex.colorSpace = T.SRGBColorSpace; backTex.anisotropy = ANISO;
  const tixTex = [];
  function ticketTex(t) { if (!tixTex[t]) { const tx = new T.CanvasTexture(paintTicket(t)); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = ANISO; tixTex[t] = tx; } return tixTex[t]; }
  const tixBackTex = new T.CanvasTexture(paintTicketBack()); tixBackTex.colorSpace = T.SRGBColorSpace;
  // one unit card (1 wide) in two proportions; meshes are scaled to pixels
  function unitCard(aspect) {
    const r = 0.08, sh = roundRectShape(1, aspect, r);
    const front = normUV(new T.ShapeGeometry(sh, 6));
    const back = normUV(new T.ShapeGeometry(sh, 6)); back.rotateY(Math.PI); back.translate(0, 0, -0.012);
    front.translate(0, 0, 0.012);
    const body = new T.ExtrudeGeometry(roundRectShape(0.985, aspect - 0.015, r), { depth: 0.022, bevelEnabled: false, curveSegments: 6 }); body.translate(0, 0, -0.011);
    // the back's u runs mirrored: flip it so text reads the right way
    const uv = back.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    return { front, back, body };
  }
  const CARD_GEO = unitCard(1.406), TIX_GEO = unitCard(0.667);
  const bodyMat = new T.MeshStandardMaterial({ color: 0xe9e0c8, roughness: 0.8 });
  function makeCard(kind) {      // kind: 'train' | 'ticket'
    const G = kind === 'ticket' ? TIX_GEO : CARD_GEO;
    const g = new T.Group();
    const fm = new T.MeshStandardMaterial({ roughness: 0.62, transparent: true });
    const bm = new T.MeshStandardMaterial({ roughness: 0.62, map: kind === 'ticket' ? tixBackTex : backTex, transparent: true });
    const f = new T.Mesh(G.front, fm), b = new T.Mesh(G.back, bm), body = new T.Mesh(G.body, bodyMat);
    g.add(body); g.add(f); g.add(b);
    g.userData = { kind, f, b, val: null };
    return g;
  }
  function setCardFace(g, val) {
    if (g.userData.val === val) return;
    g.userData.val = val;
    const tex = val == null || val < 0 ? null : g.userData.kind === 'ticket' ? ticketTex(val) : trainTex(val);
    g.userData.f.material.map = tex || (g.userData.kind === 'ticket' ? tixBackTex : backTex);
    g.userData.f.material.needsUpdate = true;
  }
  function setOpacity(g, a) { g.userData.f.material.opacity = a; g.userData.b.material.opacity = a; g.children[0].visible = a > 0.98; g.visible = a > 0.01; }
  function placeCard(g, x, y, w, rotZ = 0, faceUp = true, z = 0, tilt = 0) {
    g.position.set(x, -y, z);
    g.scale.set(w, w, w);
    g.rotation.set(tilt, faceUp ? 0 : Math.PI, rotZ);
  }

  // what the tray shows
  const tray = new T.Group(); hud.add(tray);
  const faceCards = [0, 1, 2, 3, 4].map(() => { const g = makeCard('train'); tray.add(g); return g; });
  const deckStack = [0, 1, 2, 3, 4].map(() => { const g = makeCard('train'); tray.add(g); return g; });
  const discStack = [0, 1, 2].map(() => { const g = makeCard('train'); tray.add(g); return g; });
  const tixStack = [0, 1, 2, 3].map(() => { const g = makeCard('ticket'); tray.add(g); return g; });
  const handCards = [];      // per colour: up to 4 meshes
  for (let c = 0; c < 9; c++) { const list = []; for (let k = 0; k < 4; k++) { const g = makeCard('train'); setCardFace(g, c); tray.add(g); list.push(g); } handCards.push(list); }
  const myTix = [0, 1, 2].map(() => { const g = makeCard('ticket'); tray.add(g); return g; });
  const trayBg = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x24170e, transparent: true, opacity: 0.0 }));
  trayBg.position.z = -500; hud.add(trayBg);
  const flying = new T.Group(); hud.add(flying);

  /* ------------------------------------------------ layout */
  const L = { w: 1, h: 1, board: { x: 0, y: 0, w: 1, h: 1 }, market: null, hand: null, orient: 'tall' };
  const anchors = { face: [], deck: null, disc: null, tix: null, hand: [], myTix: null, cardW: 50, handW: 40 };
  let view = null, handShown = new Array(9).fill(0), hidden = { face: [false, false, false, false, false] };
  const TIX_H = 1.5;      // the ticket pile stands a ticket on its side: its height is card width x 1.5
  function layoutTray() {
    anchors.face = []; anchors.hand = []; anchors.deck = null;
    const mk = L.market, hd = L.hand;
    if (!mk || !hd) return;
    if (L.orient === 'tall') {
      // one row: 5 face-up, the deck, the ticket pile
      const n = 7, gap = 6, cw = Math.min((mk.w - gap * (n + 1)) / n, (mk.h - 10) / 1.406);
      const total = n * cw + (n - 1) * gap + 6, x0 = mk.x + (mk.w - total) / 2 + cw / 2, y = mk.y + mk.h / 2;
      for (let i = 0; i < 5; i++) anchors.face.push({ x: x0 + i * (cw + gap), y, w: cw });
      anchors.deck = { x: x0 + 5 * (cw + gap) + 6, y, w: cw };
      anchors.tix = { x: x0 + 6 * (cw + gap) + 6, y, w: cw };
      anchors.cardW = cw;
    } else {
      // a grid of 4 x 2: face-up 5, then the deck and the ticket pile
      const cols = 4, gap = 7, cw = Math.min((mk.w - gap * (cols + 1)) / cols, (mk.h - gap * 3) / 2 / 1.406);
      const tw = cols * cw + (cols - 1) * gap, x0 = mk.x + (mk.w - tw) / 2 + cw / 2;
      const rh = cw * 1.406, y0 = mk.y + (mk.h - (2 * rh + gap)) / 2 + rh / 2;
      const slots = [];
      for (let r = 0; r < 2; r++) for (let k = 0; k < cols; k++) slots.push({ x: x0 + k * (cw + gap), y: y0 + r * (rh + gap), w: cw });
      for (let i = 0; i < 5; i++) anchors.face.push(slots[i]);
      anchors.deck = slots[5]; anchors.tix = slots[6];
      anchors.cardW = cw;
    }
    anchors.disc = { x: anchors.deck.x - anchors.cardW * 0.1, y: anchors.deck.y + anchors.cardW * 0.25, w: anchors.cardW * 0.9 };
    layoutHand();
    drawTray();
  }
  /* the hand: one fanned stack per colour held, packed from the left, my tickets at the right end */
  function handPlaces(counts) {
    const hd = L.hand, out = [];
    if (!hd) return { places: out, tix: null, w: 40 };
    const groups = [];
    for (let c = 0; c < 9; c++) if (counts[c] > 0) groups.push(c);
    const pad = 8, tixW = Math.min(64, hd.h * 0.9), avail = hd.w - pad * 2 - tixW - 10;
    // cards keep their size; with many colours the stacks overlap (the colour mark sits at the left edge)
    const w = Math.min(58, (hd.h - 16) / 1.406, avail / 4.2);
    const step = Math.min(w + 8, (avail - w) / Math.max(1, groups.length - 1));
    const y = hd.y + hd.h / 2 + 3;
    groups.forEach((c, i) => { out[c] = { x: hd.x + pad + w / 2 + i * step, y, w }; });
    return { places: out, tix: { x: hd.x + hd.w - pad - tixW / 2, y: y - 2, w: tixW }, w };
  }
  function layoutHand() {
    const P = handPlaces(handShown);
    anchors.hand = P.places; anchors.myTix = P.tix; anchors.handW = P.w;
  }
  /* where a card of colour c would land if one more came in */
  function handTarget(c) {
    const counts = handShown.slice(); counts[c] = Math.max(1, counts[c] + (counts[c] ? 0 : 1));
    return handPlaces(counts).places[c];
  }
  function drawTray() {
    if (!anchors.deck) { [faceCards, deckStack, discStack, tixStack, myTix].forEach((l) => l.forEach((g) => { g.visible = false; })); handCards.forEach((l) => l.forEach((g) => { g.visible = false; })); kick(); return; }
    const v = view;
    for (let i = 0; i < 5; i++) {
      const a = anchors.face[i], g = faceCards[i], c = v ? v.face[i] : -1;
      if (c >= 0 && !hidden.face[i]) { setCardFace(g, c); setOpacity(g, 1); placeCard(g, a.x, a.y, a.w, 0, true, 2); }
      else g.visible = false;
    }
    const dn = v ? v.deckN : 0, dshow = dn <= 0 ? 0 : Math.min(5, 1 + Math.floor(dn / 20));
    deckStack.forEach((g, k) => { if (k < dshow) { setCardFace(g, null); setOpacity(g, 1); placeCard(g, anchors.deck.x - k * 0.7, anchors.deck.y - k * 1.4, anchors.deck.w, 0, false, 2 + k * 2); } else g.visible = false; });
    discStack.forEach((g) => { g.visible = false; });
    const tn = v ? v.tdeckN : 0, tshow = tn <= 0 ? 0 : Math.min(4, 1 + Math.floor(tn / 8));
    const tw = anchors.tix.w * 1.406;      // rotated: the ticket's width becomes the pile's height
    tixStack.forEach((g, k) => { if (k < tshow) { setCardFace(g, null); setOpacity(g, 1); placeCard(g, anchors.tix.x - k * 0.7, anchors.tix.y - k * 1.4, tw, Math.PI / 2, false, 2 + k * 2); } else g.visible = false; });
    layoutHand();
    let order = 0;
    for (let c = 0; c < 9; c++) {
      const a = anchors.hand[c], n = handShown[c], list = handCards[c];
      const z0 = 10 + order * 12;          // stacks further right lie on top, so every colour mark stays in sight
      if (a) order++;
      list.forEach((g, k) => {
        const m = Math.min(4, n);
        if (a && k < m) { setOpacity(g, 1); placeCard(g, a.x + (k - (m - 1) / 2) * a.w * 0.05, a.y - k * a.w * 0.06, a.w, (k - (m - 1) / 2) * 0.05, true, z0 + k * 2); }
        else g.visible = false;
      });
    }
    const mt = v ? v.tix.length : 0, A = anchors.myTix;
    myTix.forEach((g, k) => { if (A && k < Math.min(3, mt)) { setCardFace(g, v.tix[v.tix.length - 1 - k]); setOpacity(g, 1); placeCard(g, A.x + k * 1.6, A.y - k * 2.6, A.w, 0, true, 150 + k * 2); } else g.visible = false; });
    kick();
  }

  /* ------------------------------------------------ the camera over the board */
  const camState = { tx: BCX, tz: BCZ + 0.3, zoom: 1, fit: 50, minZoom: 1, maxZoom: 4.2, base: 1 };
  const TILT = 0.5;       // radians from vertical
  function placeCamera() {
    const d = camState.fit / camState.zoom;
    const tilt = TILT + (camState.zoom - 1) * 0.04;
    cam.position.set(camState.tx, Math.cos(tilt) * d, camState.tz + Math.sin(tilt) * d);
    cam.lookAt(camState.tx, 0, camState.tz);
    cam.updateMatrixWorld();
    kick();
  }
  function applyOffset() {
    const b = L.board, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    cam.aspect = L.w / L.h;
    cam.setViewOffset(L.w, L.h, -(cx - L.w / 2), -(cy - L.h / 2), L.w, L.h);
    cam.updateProjectionMatrix();
  }
  /* the distance at which the board fits in the board rect (fill: 'height' fits the height only) */
  function computeFit(fill) {
    const b = L.board, corners = [[BX.x0, BX.y0], [BX.x1, BX.y0], [BX.x0, BX.y1], [BX.x1, BX.y1]];
    const save = { zoom: camState.zoom, tx: camState.tx, tz: camState.tz, fit: camState.fit };
    camState.zoom = 1; camState.tx = BCX; camState.tz = BCZ;
    let lo = 5, hi = 400;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2; camState.fit = mid; placeCamera();
      let okAll = true;
      for (const [x, z] of corners) {
        const p = new T.Vector3(x, 0, z).project(cam), sx = (p.x + 1) / 2 * L.w, sy = (1 - p.y) / 2 * L.h;
        if (fill === 'height') { if (sy < b.y + 4 || sy > b.y + b.h - 4) okAll = false; }
        else if (sx < b.x + 4 || sx > b.x + b.w - 4 || sy < b.y + 4 || sy > b.y + b.h - 4) okAll = false;
      }
      if (okAll) hi = mid; else lo = mid;
    }
    Object.assign(camState, save);
    return hi;
  }
  let fitAll = 50, fitHeight = 50;
  function resetCamera(animate) {
    const z0 = { zoom: camState.zoom, tx: camState.tx, tz: camState.tz };
    const target = { zoom: camState.base, tx: BCX, tz: BCZ + 0.2 };
    if (!animate) { Object.assign(camState, target); clampCam(); placeCamera(); return; }
    tween(ms(450), (k) => { camState.zoom = lerp(z0.zoom, target.zoom, k); camState.tx = lerp(z0.tx, target.tx, k); camState.tz = lerp(z0.tz, target.tz, k); clampCam(); placeCamera(); });
  }
  /* the whole board, or back to the usual view */
  function toggleOverview() {
    const whole = Math.abs(camState.zoom - 1) < 0.05 && Math.abs(camState.tx - BCX) < 0.6;
    const z0 = { zoom: camState.zoom, tx: camState.tx, tz: camState.tz };
    const target = whole ? { zoom: camState.base, tx: BCX, tz: BCZ + 0.2 } : { zoom: 1, tx: BCX, tz: BCZ + 0.2 };
    if (whole && camState.base === 1) target.zoom = 1.8;
    tween(ms(450), (k) => { camState.zoom = lerp(z0.zoom, target.zoom, k); camState.tx = lerp(z0.tx, target.tx, k); camState.tz = lerp(z0.tz, target.tz, k); clampCam(); placeCamera(); if (handlers.gesture) handlers.gesture(); });
  }
  function clampCam() {
    camState.zoom = clamp(camState.zoom, camState.minZoom, camState.maxZoom);
    // how much of the board the view covers around its centre (in board units), from the board rect's edges
    const b = L.board;
    placeCamera();
    const left = groundAt(b.x, b.y + b.h / 2), right = groundAt(b.x + b.w, b.y + b.h / 2);
    const top = groundAt(b.x + b.w / 2, b.y), bottom = groundAt(b.x + b.w / 2, b.y + b.h);
    if (!left || !right || !top || !bottom) return;
    const hx0 = camState.tx - left.x, hx1 = right.x - camState.tx, hz0 = camState.tz - top.z, hz1 = bottom.z - camState.tz;
    const m = L.orient === 'tall' ? 0.25 : 0.5;      // a little table may show at the edges
    if (hx0 + hx1 >= BW + 2 * m) camState.tx = BCX + (hx0 - hx1) / 2;
    else camState.tx = clamp(camState.tx, BX.x0 - m + hx0, BX.x1 + m - hx1);
    if (hz0 + hz1 >= BH + 2 * m) camState.tz = BCZ + (hz0 - hz1) / 2;
    else camState.tz = clamp(camState.tz, BX.y0 - m + hz0, BX.y1 + m - hz1);
  }
  /* a screen point → the board plane */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function groundAt(sx, sy) {
    ndc.set(sx / L.w * 2 - 1, -(sy / L.h) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const out = new T.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }
  function zoomAround(sx, sy, factor) {
    const before = groundAt(sx, sy);
    camState.zoom = clamp(camState.zoom * factor, camState.minZoom, camState.maxZoom);
    placeCamera();
    const after = groundAt(sx, sy);
    if (before && after) { camState.tx += before.x - after.x; camState.tz += before.z - after.z; }
    clampCam(); placeCamera();
  }
  function project(x, y, z) {
    const p = new T.Vector3(x, y, z).project(cam);
    return [(p.x + 1) / 2 * L.w, (1 - p.y) / 2 * L.h, p.z];
  }

  /* ------------------------------------------------ pointer input on the board */
  const ptrs = new Map();
  let gesture = null, lastTap = 0;
  const handlers = { tap: null, hudTap: null, gesture: null };
  function inTray(x, y) {
    const r = [L.market, L.hand].filter(Boolean);
    return r.some((b) => x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4);
  }
  function local(e) { const r = canvasEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvasEl.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() });
    try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (ptrs.size === 1) gesture = { kind: inTray(x, y) ? 'tray' : 'maybe', moved: false };
    else if (ptrs.size === 2 && gesture && gesture.kind !== 'tray') {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: camState.zoom, moved: true, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  canvasEl.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const [x, y] = local(e);
    const px = p.x, py = p.y;
    p.x = x; p.y = y;
    if (!gesture || gesture.kind === 'tray') return;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const want = clamp(gesture.z0 * d / Math.max(10, gesture.d0), camState.minZoom, camState.maxZoom);
      zoomAround(mx, my, want / camState.zoom);
      // two-finger pan
      const g0 = groundAt(gesture.mx, gesture.my), g1 = groundAt(mx, my);
      if (g0 && g1) { camState.tx += g0.x - g1.x; camState.tz += g0.z - g1.z; clampCam(); placeCamera(); }
      gesture.mx = mx; gesture.my = my;
      if (handlers.gesture) handlers.gesture();
      return;
    }
    if (gesture.kind === 'maybe' && Math.hypot(x - p.x0, y - p.y0) > 9) gesture.kind = 'pan';
    if (gesture.kind === 'pan') {
      const g0 = groundAt(px, py), g1 = groundAt(x, y);
      if (g0 && g1) { camState.tx += g0.x - g1.x; camState.tz += g0.z - g1.z; clampCam(); placeCamera(); }
      gesture.moved = true;
      if (handlers.gesture) handlers.gesture();
    }
  });
  function endPtr(e) {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p || !gesture) return;
    if (ptrs.size) { if (gesture.kind === 'pinch') gesture = { kind: 'pan', moved: true }; return; }
    const g = gesture; gesture = null;
    if (e.type === 'pointercancel') return;
    const quick = performance.now() - p.t0 < 600 && Math.hypot(p.x - p.x0, p.y - p.y0) < 10;
    if (!quick) return;
    if (g.kind === 'tray') { if (handlers.hudTap) handlers.hudTap(pickTray(p.x, p.y), p.x, p.y); return; }
    if (g.kind === 'maybe') {
      const now = performance.now();
      if (now - lastTap < 320) { lastTap = 0; if (handlers.doubleTap) handlers.doubleTap(); else resetCamera(true); return; }
      lastTap = now;
      if (handlers.tap) handlers.tap(pickBoard(p.x, p.y), p.x, p.y);
    }
  }
  canvasEl.addEventListener('pointerup', endPtr);
  canvasEl.addEventListener('pointercancel', endPtr);
  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    if (inTray(x, y)) return;
    zoomAround(x, y, Math.exp(-e.deltaY * 0.0015));
    if (handlers.gesture) handlers.gesture();
  }, { passive: false });

  /* ------------------------------------------------ picking */
  function pickBoard(x, y) {
    // nearest route space on screen, then nearest city
    let best = null;
    const unit = Math.abs(project(BCX + 1, 0, BCZ)[0] - project(BCX, 0, BCZ)[0]);
    for (let i = 0; i < SPACES.length; i++) {
      const s = SPACES[i], p = project(s.x, 0.05, s.z);
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (!best || d < best.d) best = { d, r: s.r };
    }
    let city = null;
    M.cities.forEach((c, i) => { const p = project(c.x, 0.1, c.y), d = Math.hypot(p[0] - x, p[1] - y); if (!city || d < city.d) city = { d, i }; });
    const lim = Math.max(16, unit * 0.42);
    if (city && city.d < Math.max(14, unit * 0.3) && (!best || city.d <= best.d)) return { kind: 'city', i: city.i };
    if (best && best.d < lim) return { kind: 'route', r: best.r };
    if (city && city.d < Math.max(18, unit * 0.45)) return { kind: 'city', i: city.i };
    return null;
  }
  function pickTray(x, y) {
    const hit = (a, w, h) => a && Math.abs(x - a.x) <= w / 2 + 3 && Math.abs(y - a.y) <= h / 2 + 3;
    const cw = anchors.cardW, ch = cw * 1.406;
    for (let i = 0; i < 5; i++) if (hit(anchors.face[i], cw, ch)) return { kind: 'face', i };
    if (hit(anchors.deck, cw, ch)) return { kind: 'deck' };
    if (hit(anchors.tix, cw, ch)) return { kind: 'tickets' };
    let best = null;
    for (let c = 0; c < 9; c++) { const a = anchors.hand[c]; if (a && hit(a, a.w + 6, a.w * 1.406 + 10)) { const d = Math.abs(x - a.x); if (!best || d < best.d) best = { d, c }; } }
    if (best) return { kind: 'hand', c: best.c };
    if (anchors.myTix && hit(anchors.myTix, anchors.myTix.w, anchors.myTix.w * 0.9)) return { kind: 'mytix' };
    return { kind: 'none' };
  }

  /* ------------------------------------------------ marks on the board */
  const marks = { claimable: [], selected: -1, path: [], cities: [], cities2: [], dimOthers: false };
  function setMarks(m) {
    Object.assign(marks, m || {});
    let n = 0;
    (marks.claimable || []).forEach((r) => spacesOf[r].forEach((si) => { const s = SPACES[si]; q.setFromAxisAngle(up, -s.ang); m4.compose(v3.set(s.x, 0.006, s.z), q, s3.set(s.len + 0.26, 1, 2.15)); halos.setMatrixAt(n++, m4); }));
    halos.count = n; halos.instanceMatrix.needsUpdate = true;
    let k = 0;
    if (marks.selected >= 0) spacesOf[marks.selected].forEach((si) => { const s = SPACES[si]; q.setFromAxisAngle(up, -s.ang); m4.compose(v3.set(s.x, 0.008, s.z), q, s3.set(s.len + 0.32, 1, 2.4)); selHalo.setMatrixAt(k++, m4); });
    selHalo.count = k; selHalo.instanceMatrix.needsUpdate = true;
    let pn = 0;
    (marks.path || []).forEach((r) => spacesOf[r].forEach((si) => { const s = SPACES[si]; q.setFromAxisAngle(up, -s.ang); m4.compose(v3.set(s.x, 0.007, s.z), q, s3.set(s.len + 0.28, 1, 2.2)); pathHalo.setMatrixAt(pn++, m4); }));
    pathHalo.count = pn; pathHalo.instanceMatrix.needsUpdate = true;
    if (marks.pathColor) pathMat.color.set(marks.pathColor);
    let cn = 0;
    (marks.cities || []).forEach((i) => { const c = M.cities[i]; m4.compose(v3.set(c.x, 0.13, c.y), q.identity(), s3.set(1, 1, 1)); rings.setMatrixAt(cn++, m4); });
    rings.count = cn; rings.instanceMatrix.needsUpdate = true;
    let c2 = 0;
    (marks.cities2 || []).forEach((i) => { const c = M.cities[i]; m4.compose(v3.set(c.x, 0.135, c.y), q.identity(), s3.set(1.18, 1, 1.18)); rings2.setMatrixAt(c2++, m4); });
    rings2.count = c2; rings2.instanceMatrix.needsUpdate = true;
    kick();
  }

  /* ------------------------------------------------ state → table */
  /* claimed spaces turn into a dark bed under the trains; with 2-3 players a closed twin lane fades out */
  const BED = new T.Color('#2b241d'), PAPER = new T.Color('#e9dcb8');
  let tileKey = '';
  function refreshTiles(v) {
    const key = v.n + ':' + v.owner.join(',');
    if (key === tileKey) return;
    tileKey = key;
    SPACES.forEach((s, i) => {
      const R = M.routes[s.r];
      if (v.owner[s.r] >= 0) col.copy(BED);
      else if (R.twin >= 0 && v.owner[R.twin] >= 0 && v.n <= 3) col.set(TILE_HEX[R.col]).lerp(PAPER, 0.72);
      else col.set(TILE_HEX[R.col]);
      tiles.setColorAt(i, col);
    });
    tiles.instanceColor.needsUpdate = true;
    kick();
  }
  function setView(v, opt = {}) {
    view = v;
    if (!v) return;
    refreshTiles(v);
    // trains on the board: rebuild from owners (animations add pieces themselves)
    const want = SEATS.map(() => []);
    v.owner.forEach((p, r) => { if (p >= 0 && want[p]) spacesOf[r].forEach((si) => want[p].push({ si, r })); });
    for (let p = 0; p < SEATS.length; p++) {
      const cur = placed[p].filter((t) => !t.anim);
      const same = cur.length === want[p].length && cur.every((t, i) => t.si === want[p][i].si);
      if (!same || opt.force) { placed[p] = want[p].map((t) => ({ si: t.si, r: t.r })); rebuildTrains(p); }
    }
    if (!opt.keepHand && v.hand) handShown = v.hand.slice();
    if (opt.keepFace == null) hidden.face = [false, false, false, false, false];
    drawTray();
  }
  function showHandCount(c, n) { handShown[c] = n; drawTray(); }
  function hideFace(i, on) { hidden.face[i] = on; drawTray(); }

  /* ------------------------------------------------ animations */
  /* a card flying in the tray: from/to { x, y, w } (CSS px), face value (train colour, ticket id or null for a back) */
  function flyCard(o) {
    const g = makeCard(o.kind || 'train');
    setCardFace(g, o.val == null ? null : o.val);
    flying.add(g);
    const from = o.from, to = o.to, dur = ms(o.dur || 520);
    const rot0 = o.rot0 || 0, rot1 = o.rot1 || 0;
    const up0 = o.faceUp0 !== false, up1 = o.faceUp1 !== false;
    const arc = o.arc == null ? 26 : o.arc;
    return tween(dur, (k) => {
      const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * arc, w = lerp(from.w, to.w, k) * (1 + Math.sin(k * Math.PI) * 0.12);
      g.position.set(x, -y, 300 + k * 10);
      g.scale.set(w, w, w);
      const flip = up0 === up1 ? (up0 ? 0 : Math.PI) : (up0 ? k * Math.PI : Math.PI - k * Math.PI);
      g.rotation.set(Math.sin(k * Math.PI) * 0.25, flip, lerp(rot0, rot1, k));
      setOpacity(g, o.fadeOut ? (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) : o.fadeIn ? Math.min(1, k * 4) : 1);
    }).then(() => { flying.remove(g); g.userData.f.material.dispose(); g.userData.b.material.dispose(); });
  }
  /* train pieces dropping onto a route, one after another */
  async function dropTrains(r, seat, onEach) {
    const list = spacesOf[r];
    const items = list.map((si) => ({ si, r, lift: 2.2, spin: 0.6, anim: true }));
    items.forEach((t) => { t.lift = 99; placed[seat].push(t); });
    rebuildTrains(seat);
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      t.lift = 2.2;
      const d = ms(300);
      tween(d, (k) => { const e = easeIn(k); t.lift = 2.2 * (1 - e) + (k > 0.85 ? Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.05 : 0); t.spin = 0.6 * (1 - easeOut(k)); rebuildTrains(seat); }, (x) => x)
        .then(() => { t.lift = 0; t.spin = 0; t.anim = false; rebuildTrains(seat); if (onEach) onEach(i); });
      await wait(ms(110));
    }
    await wait(ms(330));
  }
  /* glide the camera so a route (or a point) is in view */
  function focus(x, z, zoomTo) {
    const z0 = { zoom: camState.zoom, tx: camState.tx, tz: camState.tz };
    const tz = zoomTo || camState.zoom;
    const t = { tx: x, tz: z };
    // only move when the point is off screen or close to the edge of the board rect
    const p = project(x, 0, z), b = L.board;
    const inside = p[0] > b.x + b.w * 0.12 && p[0] < b.x + b.w * 0.88 && p[1] > b.y + b.h * 0.12 && p[1] < b.y + b.h * 0.88;
    if (inside && !zoomTo) return Promise.resolve();
    return tween(ms(520), (k) => { camState.zoom = lerp(z0.zoom, tz, k); camState.tx = lerp(z0.tx, t.tx, k); camState.tz = lerp(z0.tz, t.tz, k); clampCam(); placeCamera(); if (handlers.gesture) handlers.gesture(); });
  }
  function routeMid(r) { const g = GEO[r].mid; return { x: g.x, z: g.y }; }
  function screenOfRoute(r) { const m = routeMid(r); return project(m.x, 0.3, m.z); }
  function screenOfCity(i) { const c = M.cities[i]; return project(c.x, 0.15, c.y); }
  function cityOnScreen(i) { const p = screenOfCity(i), b = L.board; return p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h; }

  /* ------------------------------------------------ frame loop (renders only while something changes) */
  let raf = 0, dirty = true, lastPulse = 0;
  function kick() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    clock = now;
    // only the glow is moving: about 24 frames a second is plenty (and kinder to phone batteries)
    if (!dirty && !tweens.size && now - lastPulse < 40) { if (!raf) raf = requestAnimationFrame(frame); return; }
    lastPulse = now;
    for (const t of tweens) {
      const k = clamp((now - t.t0) / t.dur, 0, 1);
      try { t.fn(t.ease(k)); } catch (e) { console.error(e); }
      if (k >= 1) { tweens.delete(t); t.res(); }
    }
    const pulsing = !opts.still && (halos.count || selHalo.count || rings.count || rings2.count || pathHalo.count);
    if (pulsing) {
      const s = 0.5 + 0.5 * Math.sin(now / 260);
      haloMat.opacity = 0.5 + 0.45 * s;
      selMat.opacity = 0.7 + 0.3 * s;
      ringMat.opacity = 0.55 + 0.45 * s;
      ringMat2.opacity = 0.55 + 0.45 * (1 - s);
      pathMat.opacity = 0.55 + 0.35 * s;
    }
    if (dirty || tweens.size || pulsing) {
      dirty = false;
      renderer.setViewport(0, 0, L.w, L.h);
      renderer.clear();
      renderer.render(world, cam);
      renderer.clearDepth();
      renderer.render(hud, hcam);
      if (handlers.frame) handlers.frame();
    }
    if ((tweens.size || pulsing) && !raf) raf = requestAnimationFrame(frame);
  }

  function resize(layout) {
    Object.assign(L, layout);
    const dpr = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(dpr);
    renderer.setSize(L.w, L.h, false);
    canvasEl.style.width = L.w + 'px'; canvasEl.style.height = L.h + 'px';
    hcam.left = 0; hcam.right = L.w; hcam.top = 0; hcam.bottom = -L.h; hcam.updateProjectionMatrix();
    applyOffset();
    fitAll = computeFit('all'); fitHeight = computeFit('height');
    camState.fit = fitAll;
    // tall screens: start zoomed so the board fills the height (pan sideways); wide: the whole board
    camState.base = L.orient === 'tall' ? clamp(fitAll / fitHeight, 1, 2.2) : 1;
    camState.minZoom = 1;
    if (!layout.keepCamera) { camState.zoom = camState.base; camState.tx = BCX; camState.tz = BCZ + 0.2; }
    clampCam(); placeCamera();
    layoutTray();
    kick();
  }
  function setQuality(qv) {
    quality = qv;
    renderer.shadowMap.enabled = qv === 'high'; key.castShadow = qv === 'high';
    key.shadow.mapSize.set(qv === 'high' ? 2048 : 1024, qv === 'high' ? 2048 : 1024);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    paintBoardTexture();
    resize(Object.assign({}, L, { keepCamera: true }));
  }
  function setSpeed(s) { speed = s || 1; }
  function refreshFonts() { paintBoardTexture(); cardTex.forEach((t) => t && t.dispose()); cardTex.length = 0; tixTex.forEach((t) => t && t.dispose()); tixTex.length = 0; for (let c = 0; c < 9; c++) handCards[c].forEach((g) => { g.userData.val = null; setCardFace(g, c); }); drawTray(); }
  function snapshot() { kick(); return new Promise((res) => requestAnimationFrame(() => { frame(performance.now()); res(canvasEl.toDataURL('image/jpeg', 0.9)); })); }

  return {
    renderer, cam, hcam, canvas: canvasEl, world, hud,
    resize, setView, setMarks, setSeatColors, setQuality, setSpeed, refreshFonts, snapshot,
    flyCard, dropTrains, focus, wait, tween, resetCamera, toggleOverview, showHandCount, hideFace, handTarget,
    anchors: () => anchors, screenOfRoute, screenOfCity, cityOnScreen, project, routeMid, pickTray, pickBoard,
    on(name, fn) { handlers[name] = fn; },
    get zoom() { return camState.zoom; }, get busy() { return tweens.size > 0; },
    spacesOf: (r) => spacesOf[r].map((i) => SPACES[i]),
    kick
  };
}
