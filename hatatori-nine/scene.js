/* ハタトリ・ナイン — the 3D table (three.js r160 from a CDN). Every texture is drawn here; no image files.
   World units: one card is 1.0 wide and 1.4 long, y is up. The flag line runs along x at z = 0.
   The local player always sits at +z (near the camera); the other player across at -z.
   A view from the engine (engine.viewFor) is shown with setView(view, hints): every card animates from
   where it was to where the view puts it. hints.from[card] / hints.to[card] name a place ('deckT', 'deckX',
   'opp', 'disc') for cards that appear out of a hidden place or vanish into one. */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.HTN_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const E = window.HTN_ENG;

/* ------------------------------------------------------------------ layout */
const CW = 1.0, CH = 1.4, CT = 0.045, CR = 0.1;     // card
const PITCH = 1.1;                                  // flag spacing
/* Two table layouts. tall (phone held upright): the stacks overlap less so more of each card shows, the hand
   is bigger, and the decks sit in the far corners. wide: the decks sit at the ends of the flag line. */
const PRESET = {
  tall: { tw: 11.7, td: 13.6, Z0: 1.5, SO: 0.74, hand: { z: 5.28, y: 0.66, sc: 1.6, pitch: 1.36, tilt: 0.6 }, opp: { z: -5.0, y: 0.36, sc: 0.64, pitch: 0.5 },
    deck: { T: [-4.62, -4.95], X: [4.62, -4.95] }, disc: [-3.12, -4.95], pitch: 1.13, fov: 30 },
  wide: { tw: 14.6, td: 11.6, Z0: 1.6, SO: 0.5, hand: { z: 4.62, y: 0.64, sc: 1.0, pitch: 1.04, tilt: 0.95 }, opp: { z: -4.45, y: 0.44, sc: 0.7, pitch: 0.6 },
    deck: { T: [-6.3, 0], X: [6.3, 0] }, disc: [6.3, -2.45], pitch: 0.97, fov: 32 }
};
let LY = PRESET.wide;
let DECK = LY.deck, DISC = LY.disc;
function stackEnd(n) { return LY.Z0 + (n - 1) * LY.SO + CH / 2; }

export const COLORS = ['#e2483d', '#f08c22', '#e7b51c', '#2f9d5a', '#3577d4', '#8a56c6'];
const DARK = ['#8f241b', '#9a4d08', '#8f6a05', '#165a33', '#1a4688', '#4e2a7c'];
const NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", "Helvetica Neue", Arial, sans-serif';
const JP_FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif';
const FELTS = { green: ['#1f6b47', '#175a3b', '#2a7d55'], navy: ['#1e3a5c', '#152b45', '#284b73'], wine: ['#6b2333', '#561a28', '#80303f'] };
const PLAYER_COL = ['#f2c14e', '#e0566a'];   // me (brass), them (crimson)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(x, X, y, w, h, r) { x.beginPath(); x.moveTo(X + r, y); x.arcTo(X + w, y, X + w, y + h, r); x.arcTo(X + w, y + h, X, y + h, r); x.arcTo(X, y + h, X, y, r); x.arcTo(X, y, X + w, y, r); x.closePath(); }
function flagX(f) { return (f - 4) * PITCH; }
export function sortHand(h) {
  return h.slice().sort((a, b) => {
    const ta = a >= 60, tb = b >= 60;
    if (ta !== tb) return ta ? 1 : -1;
    if (ta) return a - b;
    const ca = Math.floor(a / 10), cb = Math.floor(b / 10);
    return ca !== cb ? ca - cb : (a % 10) - (b % 10);
  });
}

/* ------------------------------------------------------------------ drawing: suit glyphs and icons */
function glyph(x, ci, cx, cy, r) {
  x.beginPath();
  if (ci === 0) { x.moveTo(cx, cy - r * 1.05); x.lineTo(cx + r * 1.05, cy + r * 0.8); x.lineTo(cx - r * 1.05, cy + r * 0.8); x.closePath(); }
  else if (ci === 1) x.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  else if (ci === 2) { for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.48 : r * 1.08; const px = cx + Math.cos(a) * q, py = cy + Math.sin(a) * q + r * 0.08; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); }
  else if (ci === 3) {
    const s = r * 0.5;
    x.moveTo(cx + s, cy - r * 0.42); x.arc(cx, cy - r * 0.42, s, 0, Math.PI * 2);
    x.moveTo(cx - r * 0.45 + s, cy + r * 0.2); x.arc(cx - r * 0.45, cy + r * 0.2, s, 0, Math.PI * 2);
    x.moveTo(cx + r * 0.45 + s, cy + r * 0.2); x.arc(cx + r * 0.45, cy + r * 0.2, s, 0, Math.PI * 2);
    x.moveTo(cx - r * 0.14, cy + r * 0.3); x.lineTo(cx + r * 0.14, cy + r * 0.3); x.lineTo(cx + r * 0.26, cy + r * 1.05); x.lineTo(cx - r * 0.26, cy + r * 1.05); x.closePath();
  }
  else if (ci === 4) { x.moveTo(cx, cy - r * 1.1); x.lineTo(cx + r * 0.85, cy); x.lineTo(cx, cy + r * 1.1); x.lineTo(cx - r * 0.85, cy); x.closePath(); }
  else { x.arc(cx, cy, r * 0.98, Math.PI * 0.32, Math.PI * 1.68, false); x.arc(cx + r * 0.42, cy - r * 0.08, r * 0.78, Math.PI * 1.55, Math.PI * 0.45, true); x.closePath(); }
}
/* tactics icons, drawn into a box of size s centred at (cx, cy); fill/stroke style set by the caller */
function icon(x, c, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s / 100, s / 100); x.lineJoin = 'round'; x.lineCap = 'round';
  const fill = () => x.fill(), stroke = (w) => { x.lineWidth = w; x.stroke(); };
  if (c === 60 || c === 61) {          // crown
    x.beginPath(); x.moveTo(-42, 26); x.lineTo(-46, -22); x.lineTo(-22, 2); x.lineTo(0, -34); x.lineTo(22, 2); x.lineTo(46, -22); x.lineTo(42, 26); x.closePath(); fill();
    x.beginPath(); x.rect(-42, 30, 84, 12); fill();
    x.beginPath(); for (const p of [[-46, -26], [0, -38], [46, -26]]) { x.moveTo(p[0] + 7, p[1]); x.arc(p[0], p[1], 7, 0, Math.PI * 2); } fill();
    if (c === 61) { x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(0, 8, 9, 0, Math.PI * 2); fill(); x.restore(); }
    else { x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(0, -2); x.lineTo(9, 9); x.lineTo(0, 20); x.lineTo(-9, 9); x.closePath(); fill(); x.restore(); }
  } else if (c === 62) {               // horseshoe
    x.beginPath(); x.arc(0, -4, 36, Math.PI * 0.08, Math.PI * 0.92, true); stroke(18);
    x.beginPath(); x.moveTo(-36, 0); x.lineTo(-38, 38); x.moveTo(36, 0); x.lineTo(38, 38); stroke(18);
  } else if (c === 63) {               // shield
    x.beginPath(); x.moveTo(0, -44); x.quadraticCurveTo(26, -32, 40, -34); x.quadraticCurveTo(42, 18, 0, 46); x.quadraticCurveTo(-42, 18, -40, -34); x.quadraticCurveTo(-26, -32, 0, -44); x.closePath(); fill();
    x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(0, -26); x.lineTo(0, 30); x.moveTo(-24, -6); x.lineTo(24, -6); x.lineWidth = 9; x.stroke(); x.restore();
  } else if (c === 64) {               // fog: wavy lines
    for (let k = 0; k < 3; k++) { const y = -26 + k * 26; x.beginPath(); x.moveTo(-44, y); x.bezierCurveTo(-26, y - 14, -14, y + 14, 0, y); x.bezierCurveTo(14, y - 14, 26, y + 14, 44, y); stroke(11); }
  } else if (c === 65) {               // mud: puddle and drops
    x.beginPath(); x.ellipse(0, 22, 44, 16, 0, 0, Math.PI * 2); fill();
    for (const p of [[-18, -18, 10], [14, -30, 8], [26, -6, 7]]) { x.beginPath(); x.moveTo(p[0], p[1] - p[2] * 1.8); x.quadraticCurveTo(p[0] + p[2], p[1], p[0], p[1] + p[2]); x.quadraticCurveTo(p[0] - p[2], p[1], p[0], p[1] - p[2] * 1.8); fill(); }
  } else if (c === 66) {               // scout: eye
    x.beginPath(); x.moveTo(-46, 0); x.quadraticCurveTo(0, -42, 46, 0); x.quadraticCurveTo(0, 42, -46, 0); x.closePath(); stroke(9);
    x.beginPath(); x.arc(0, 0, 16, 0, Math.PI * 2); fill();
  } else if (c === 67) {               // redeploy: two curved arrows
    x.beginPath(); x.arc(0, 0, 32, Math.PI * 1.1, Math.PI * 1.85); stroke(10);
    x.beginPath(); x.arc(0, 0, 32, Math.PI * 0.1, Math.PI * 0.85); stroke(10);
    const head = (a, dir) => { const px = Math.cos(a) * 32, py = Math.sin(a) * 32, tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir; x.beginPath(); x.moveTo(px + tx * 16, py + ty * 16); x.lineTo(px + Math.cos(a) * 13, py + Math.sin(a) * 13); x.lineTo(px - Math.cos(a) * 13, py - Math.sin(a) * 13); x.closePath(); fill(); };
    head(Math.PI * 1.85, 1); head(Math.PI * 0.85, 1);
  } else if (c === 68) {               // deserter: door and arrow out
    x.beginPath(); x.rect(-40, -40, 44, 80); stroke(9);
    x.beginPath(); x.moveTo(-6, 0); x.lineTo(40, 0); stroke(11);
    x.beginPath(); x.moveTo(46, 0); x.lineTo(28, -16); x.lineTo(28, 16); x.closePath(); fill();
  } else if (c === 69) {               // traitor: swap arrows
    x.beginPath(); x.moveTo(-40, -14); x.lineTo(30, -14); stroke(10);
    x.beginPath(); x.moveTo(44, -14); x.lineTo(24, -30); x.lineTo(24, 2); x.closePath(); fill();
    x.beginPath(); x.moveTo(40, 18); x.lineTo(-30, 18); stroke(10);
    x.beginPath(); x.moveTo(-44, 18); x.lineTo(-24, 2); x.lineTo(-24, 34); x.closePath(); fill();
  } else {                              // flag
    x.beginPath(); x.moveTo(-26, 44); x.lineTo(-26, -44); stroke(9);
    x.beginPath(); x.moveTo(-24, -42); x.lineTo(36, -26); x.lineTo(-24, -8); x.closePath(); fill();
  }
  x.restore();
}
const TAC_SHORT = { 60: '指揮官', 61: '指揮官', 62: '近衛騎兵', 63: '盾兵', 64: '霧', 65: '泥沼', 66: '偵察', 67: '再配置', 68: '脱走', 69: '寝返り' };
const TAC_HINT = { 60: '1〜10', 61: '1〜10', 62: '8', 63: '1〜3' };

/* ------------------------------------------------------------------ soldiers (art.js: game-icons.net, CC BY 3.0) */
export const UNIT_NAME = ['投石兵', '弓兵', '投槍兵', '重装歩兵', '長槍兵', '近衛歩兵', '軽騎兵', '重騎兵', '戦車', '戦象'];
const ART = (typeof window !== 'undefined' && window.HTN_ART) ? window.HTN_ART.PATHS : {};
const _paths = {};
export function artPath(key) {
  if (!_paths[key] && ART[key] && typeof Path2D !== 'undefined') _paths[key] = new Path2D(ART[key]);
  return _paths[key] || null;
}
export function unitKey(c) {   // which silhouette a card shows
  if (c < 60) return 'u' + (c % 10 + 1);
  return { 60: 'leader', 61: 'leader', 62: 'cav', 63: 'shield', 64: 'fog', 65: 'mud', 66: 'scout', 67: 'redeploy', 68: 'deserter', 69: 'traitor' }[c];
}
/* draw a silhouette centred on (cx, cy), `size` px tall/wide; flip mirrors it */
export function drawArt(x, key, cx, cy, size, fill, flip) {
  const p = artPath(key);
  if (!p) return false;
  x.save(); x.translate(cx, cy); x.scale((flip ? -1 : 1) * size / 512, size / 512); x.translate(-256, -256);
  x.fillStyle = fill; x.fill(p); x.restore();
  return true;
}
/* the war elephant carries a little tower with a pennant (drawn here, on top of the elephant silhouette) */
function howdah(x, cx, cy, size, fill, accent) {
  const k = size / 512;
  x.save(); x.translate(cx, cy); x.scale(k, k); x.translate(-256, -256);
  x.fillStyle = fill;
  x.beginPath(); x.moveTo(150, 128); x.lineTo(330, 128); x.lineTo(322, 58); x.lineTo(158, 58); x.closePath(); x.fill();
  for (let i = 0; i < 5; i++) x.fillRect(158 + i * 36, 28, 22, 34);
  x.fillRect(236, -40, 9, 72);
  x.fillStyle = accent;
  x.beginPath(); x.moveTo(245, -38); x.lineTo(312, -20); x.lineTo(245, -2); x.closePath(); x.fill();
  x.fillRect(166, 76, 148, 14);
  x.restore();
}

/* ------------------------------------------------------------------ the card atlas: 70 faces in a 10 x 7 grid */
const AW = 2048, AH = 2048, CELL_W = 204, CELL_H = 286;
function cellOf(c) { return [c % 10, Math.floor(c / 10)]; }
const TIER_FRAME = ['#fff3dc', '#fff3dc', '#fff3dc', '#dfe6ee', '#dfe6ee', '#dfe6ee', '#f2c14e', '#f2c14e', '#f2c14e', '#ffd75e'];
/* paint one card face into (X, Y, w, h). Used for the 3D atlas and for the formation scenes. */
export function paintCard(x, c, X, Y, w, h) {
  const band = h * 0.265;
  x.save();
  rr(x, X + 1, Y + 1, w - 2, h - 2, w * 0.1); x.clip();
  if (c < 60) {
    const ci = Math.floor(c / 10), v = c % 10 + 1, col = COLORS[ci];
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, shade(col, 0.06)); g.addColorStop(1, shade(col, -0.2));
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    // the picture window
    const px = X + w * 0.07, py = Y + band - h * 0.012, pw = w * 0.86, ph = h - 2 * band + h * 0.024;
    x.save();
    rr(x, px, py, pw, ph, w * 0.06); x.clip();
    const pg = x.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, shade(col, 0.78)); pg.addColorStop(1, shade(col, 0.5));
    x.fillStyle = pg; x.fillRect(px, py, pw, ph);
    const acx = px + pw / 2, acy = py + ph * 0.52;
    if (v >= 7) {   // rays behind the strong ones; the 10 gets a full sunburst
      const n = v === 10 ? 22 : 14, R = Math.max(pw, ph) * 0.95;
      x.save(); x.translate(acx, acy);
      x.fillStyle = v === 10 ? 'rgba(255,214,90,0.55)' : 'rgba(255,255,255,0.3)';
      for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n * 0.9; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); x.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); x.closePath(); x.fill(); }
      x.restore();
    }
    if (v === 10) { const rg = x.createRadialGradient(acx, acy, 0, acx, acy, pw * 0.7); rg.addColorStop(0, 'rgba(255,240,170,0.9)'); rg.addColorStop(1, 'rgba(255,240,170,0)'); x.fillStyle = rg; x.fillRect(px, py, pw, ph); }
    // ground line
    x.fillStyle = shade(col, 0.32); x.fillRect(px, py + ph * 0.86, pw, ph * 0.14);
    const ink = shade(col, -0.62), sz = Math.min(pw, ph) * (v >= 7 ? 1.02 : 0.96);
    const key = 'u' + v, cy2 = acy + (v === 10 ? ph * 0.06 : 0);
    x.globalAlpha = 0.28; drawArt(x, key, acx + w * 0.012, cy2 + w * 0.012, sz, '#000'); x.globalAlpha = 1;
    drawArt(x, key, acx, cy2, sz, ink);
    if (v === 10) howdah(x, acx, cy2, sz, ink, '#e8483d');
    x.restore();
    // frame of the window: thicker and brighter for stronger troops
    x.save();
    x.strokeStyle = TIER_FRAME[v - 1]; x.lineWidth = w * (v === 10 ? 0.034 : v >= 7 ? 0.026 : 0.018);
    rr(x, px, py, pw, ph, w * 0.06); x.stroke();
    if (v >= 4) { x.lineWidth = w * 0.008; x.globalAlpha = 0.8; rr(x, px + w * 0.03, py + w * 0.03, pw - w * 0.06, ph - w * 0.06, w * 0.04); x.stroke(); x.globalAlpha = 1; }
    if (v >= 7) {   // rivets on the corners
      x.fillStyle = TIER_FRAME[v - 1];
      for (const [qx, qy] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]]) { x.beginPath(); x.arc(qx + (qx > X + w / 2 ? -1 : 1) * w * 0.045, qy + (qy > Y + h / 2 ? -1 : 1) * w * 0.045, w * (v === 10 ? 0.03 : 0.022), 0, Math.PI * 2); x.fill(); }
    }
    x.restore();
    // unit name on a ribbon at the foot of the window
    {
      const nm = UNIT_NAME[v - 1], fs = Math.round(h * 0.056);
      x.font = '900 ' + fs + 'px ' + JP_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
      const tw = x.measureText(nm).width + fs * 0.9, ry = py + ph - fs * 0.62;
      x.fillStyle = v === 10 ? '#7a1d14' : shade(col, -0.55);
      rr(x, X + w / 2 - tw / 2, ry - fs * 0.62, tw, fs * 1.24, fs * 0.3); x.fill();
      x.fillStyle = v === 10 ? '#ffe9a8' : '#fff6e4'; x.fillText(nm, X + w / 2, ry + fs * 0.04);
    }
    // index bands: a big number and the suit, top and bottom (both upright, so stacks always show one)
    for (const top of [true, false]) {
      const by = top ? Y : Y + h - band;
      x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(X, by, w, band);
      const cy = by + band * 0.53, txt = String(v);
      x.font = '700 ' + Math.round(band * (txt.length > 1 ? 0.84 : 0.92)) + 'px ' + NUM_FONT;
      x.textAlign = 'left'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.lineWidth = w * 0.075; x.strokeStyle = 'rgba(24,10,4,0.62)'; x.strokeText(txt, X + w * 0.09, cy + band * 0.04);
      x.fillStyle = v === 10 ? '#ffe28a' : '#fffaf0'; x.fillText(txt, X + w * 0.09, cy + band * 0.04);
      glyph(x, ci, X + w * 0.8, cy, band * 0.27);
      x.lineWidth = w * 0.035; x.strokeStyle = 'rgba(24,10,4,0.5)'; x.stroke(); x.fillStyle = '#fffaf0'; x.fill();
    }
  } else {
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, '#34425f'); g.addColorStop(1, '#1a2133');
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    const hint = TAC_HINT[c], cx = X + w / 2, cy = Y + h * (hint ? 0.455 : 0.5);
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5); rg.addColorStop(0, 'rgba(232,196,106,0.28)'); rg.addColorStop(1, 'rgba(232,196,106,0)');
    x.fillStyle = rg; x.fillRect(X, Y, w, h);
    x.strokeStyle = 'rgba(232,196,106,0.85)'; x.lineWidth = w * 0.022; rr(x, X + w * 0.07, Y + w * 0.07, w - w * 0.14, h - w * 0.14, w * 0.06); x.stroke();
    const asz = w * (hint ? 0.46 : 0.6);
    if (!drawArt(x, unitKey(c), cx, cy, asz, '#e8c46a')) { x.fillStyle = '#e8c46a'; icon(x, c, cx, cy, asz * 0.7); }
    if (hint) {   // the values it may stand for, on a small plate under the picture
      const fs = Math.round(h * 0.082), hy = Y + h * 0.695;
      x.font = '700 ' + fs + 'px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
      const tw = x.measureText(hint).width + fs * 0.9;
      x.fillStyle = 'rgba(8,12,24,0.55)'; rr(x, cx - tw / 2, hy - fs * 0.62, tw, fs * 1.24, fs * 0.3); x.fill();
      x.fillStyle = '#ffe9b0'; x.fillText(hint, cx, hy + fs * 0.04);
    }
    for (const top of [true, false]) {
      const cy3 = top ? Y + band * 0.52 : Y + h - band * 0.48;
      const name = TAC_SHORT[c];
      x.fillStyle = '#f6e7c2';
      x.font = '900 ' + Math.round(Math.min(band * 0.5, (w * 0.62) / name.length)) + 'px ' + JP_FONT;
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText(name, X + w * 0.1, cy3);
      if (!drawArt(x, unitKey(c), X + w * 0.84, cy3, band * 0.5, '#e8c46a')) { x.fillStyle = '#e8c46a'; icon(x, c, X + w * 0.84, cy3, band * 0.44); }
    }
  }
  x.restore();
  // edge
  x.save(); x.strokeStyle = c < 60 ? (c % 10 === 9 ? 'rgba(255,215,94,0.95)' : 'rgba(255,250,240,0.75)') : 'rgba(232,196,106,0.5)'; x.lineWidth = w * (c < 60 && c % 10 === 9 ? 0.04 : 0.03);
  rr(x, X + w * 0.045, Y + w * 0.045, w - w * 0.09, h - w * 0.09, w * 0.07); x.stroke(); x.restore();
}
function drawFace(x, c, X, Y, w, h) { paintCard(x, c, X, Y, w, h); }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
}
function drawAtlas(cv) {
  const x = cv.getContext('2d');
  x.clearRect(0, 0, AW, AH);
  for (let c = 0; c < 70; c++) { const [i, j] = cellOf(c); drawFace(x, c, i * CELL_W, j * CELL_H, CELL_W, CELL_H); }
}
function drawBack(kind) {
  const w = 256, h = 358, c = canvas(w, h), x = c.getContext('2d');
  const base = kind === 'X' ? ['#6a2131', '#3e111c'] : ['#22466d', '#132a45'];
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]);
  rr(x, 0, 0, w, h, 24); x.fillStyle = g; x.fill();
  x.save(); rr(x, 0, 0, w, h, 24); x.clip();
  x.strokeStyle = 'rgba(232,196,106,0.18)'; x.lineWidth = 3;
  for (let k = -h; k < w + h; k += 26) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.moveTo(k + h, 0); x.lineTo(k, h); x.stroke(); }
  x.restore();
  x.strokeStyle = 'rgba(232,196,106,0.9)'; x.lineWidth = 7; rr(x, 14, 14, w - 28, h - 28, 16); x.stroke();
  x.beginPath(); x.arc(w / 2, h / 2, 62, 0, Math.PI * 2); x.fillStyle = base[1]; x.fill(); x.lineWidth = 5; x.stroke();
  x.fillStyle = '#e8c46a';
  if (kind === 'X') { x.font = '900 70px ' + JP_FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('戦', w / 2, h / 2 + 4); }
  else icon(x, -1, w / 2 + 4, h / 2, 82);
  return c;
}
/* a flag is a round token on the felt carrying its number (the part you read at a glance) and a pennant
   on a pole at its back. Neutral flags are ivory; a taken flag turns the colour of whoever holds it. */
const TOKEN_COL = [['#ffe9a6', '#e3a92c', '#3a2406'], ['#ff9fad', '#c8324c', '#fff8f0'], ['#fffdf6', '#e8d9b8', '#3a2412']];
function drawPennant(n, state) {
  const c = canvas(256, 160), x = c.getContext('2d');
  const bg = state === 0 ? PLAYER_COL[0] : state === 1 ? PLAYER_COL[1] : '#fbf4e2';
  x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 0); x.lineTo(196, 80); x.lineTo(256, 160); x.lineTo(0, 160); x.closePath();   // swallowtail
  x.fillStyle = bg; x.fill();
  x.save(); x.clip();
  x.fillStyle = state === -1 ? '#d8423c' : 'rgba(0,0,0,0.16)'; x.fillRect(0, 0, 256, 22); x.fillRect(0, 138, 256, 22);
  x.font = '700 96px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = state === 1 ? '#fffaf0' : state === 0 ? '#3a2a06' : '#5a3a1a';
  x.fillText(String(n + 1), 96, 84);
  x.restore();
  return c;
}
function drawToken(n, state) {
  const S = 256, c = canvas(S, S), x = c.getContext('2d'), col = TOKEN_COL[state < 0 ? 2 : state];
  const g = x.createRadialGradient(S * 0.4, S * 0.34, S * 0.04, S / 2, S / 2, S * 0.56);
  g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.lineWidth = 8; x.strokeStyle = state === 1 ? 'rgba(255,236,238,0.75)' : 'rgba(120,80,20,0.6)';
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(S / 2, S / 2, S * 0.37, 0, Math.PI * 2); x.stroke();
  x.font = '700 ' + Math.round(S * 0.56) + 'px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = 10; x.strokeStyle = state === 1 ? 'rgba(90,10,24,0.55)' : 'rgba(255,255,255,0.6)';
  x.strokeText(String(n + 1), S / 2, S / 2 + S * 0.035);
  x.fillStyle = col[2]; x.fillText(String(n + 1), S / 2, S / 2 + S * 0.035);
  return c;
}
function drawFelt(cv, felt) {
  cv.width = 1792; cv.height = Math.round(1792 * LY.td / LY.tw);
  const x = cv.getContext('2d', { willReadFrequently: true }), W = cv.width, H = cv.height;
  const k = W / LY.tw;                           // the texture covers the whole felt of this layout
  const P = (wx, wz) => [(wx + LY.tw / 2) * k, (wz + LY.td / 2) * k];
  x.fillStyle = felt[0]; x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = (Math.random() - 0.5) * 14; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  x.putImageData(img, 0, 0);
  const g = x.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // the battle line: a darker strip with bright edges, the flags stand on it
  { const t0 = P(-5.25, -0.56), t1 = P(5.25, 0.56);
    x.fillStyle = 'rgba(0,0,0,0.24)'; rr(x, t0[0], t0[1], t1[0] - t0[0], t1[1] - t0[1], 0.16 * k); x.fill();
    x.strokeStyle = 'rgba(255,232,180,0.42)'; x.lineWidth = 0.028 * k;
    for (const z of [-0.56, 0.56]) { const a = P(-5.2, z), b = P(5.2, z); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); } }
  // a lane for every flag on both sides
  const len = stackEnd(3) - 0.62 + 0.06;
  for (let f = 0; f < 9; f++) {
    for (const s of [1, -1]) {
      const z0 = s > 0 ? 0.62 : -(0.62 + len), p = P(flagX(f) - 0.52, z0);
      x.fillStyle = felt[1]; x.globalAlpha = 0.55; rr(x, p[0], p[1], 1.04 * k, len * k, 0.12 * k); x.fill(); x.globalAlpha = 1;
      const q = P(flagX(f) - 0.5, s > 0 ? LY.Z0 - 0.7 : -(LY.Z0 + 0.7));
      x.strokeStyle = 'rgba(255,240,200,0.2)'; x.lineWidth = 0.025 * k; x.setLineDash([0.08 * k, 0.07 * k]);
      rr(x, q[0], q[1], 1.0 * k, 1.4 * k, 0.1 * k); x.stroke(); x.setLineDash([]);
    }

  }
  // deck pads
  for (const key of ['T', 'X']) { const p = P(DECK[key][0] - 0.6, DECK[key][1] - 0.8); x.fillStyle = felt[1]; x.globalAlpha = 0.7; rr(x, p[0], p[1], 1.2 * k, 1.6 * k, 0.14 * k); x.fill(); x.globalAlpha = 1; }
  const p = P(DISC[0] - 0.62, DISC[1] - 0.82); x.strokeStyle = 'rgba(255,240,200,0.16)'; x.lineWidth = 0.025 * k; rr(x, p[0], p[1], 1.24 * k, 1.64 * k, 0.14 * k); x.stroke();
}
function cloudTex() {
  const c = canvas(256, 256), x = c.getContext('2d');
  for (let k = 0; k < 9; k++) {
    const cx = 60 + Math.random() * 136, cy = 70 + Math.random() * 116, r = 50 + Math.random() * 40;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  return c;
}
function mudTex() {
  const c = canvas(256, 256), x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 124); g.addColorStop(0, 'rgba(70,44,22,0.92)'); g.addColorStop(0.7, 'rgba(84,54,28,0.75)'); g.addColorStop(1, 'rgba(84,54,28,0)');
  x.fillStyle = g; x.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, r = 100 + Math.sin(k * 2.7) * 14; const px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r * 0.86; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.fill();
  x.fillStyle = 'rgba(200,170,120,0.25)'; for (let k = 0; k < 6; k++) { x.beginPath(); x.ellipse(70 + Math.random() * 110, 80 + Math.random() * 90, 14, 6, 0.4, 0, Math.PI * 2); x.fill(); }
  return c;
}
function twinkleTex() {   // a four-point glint
  const c = canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [w, h] of [[3, 62], [62, 3]]) { x.beginPath(); x.ellipse(64, 64, w, h, 0, 0, Math.PI * 2); x.fill(); }
  return c;
}
function glowTex() {   // a soft ring of light that sits around a taken flag
  const c = canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 20, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return c;
}
function sparkTex() {
  const c = canvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
}
function woodTex(w, h) {
  const c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7a4524'); g.addColorStop(0.5, '#955a30'); g.addColorStop(1, '#6b3c1f');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '50,24,10' : '190,140,90') + ',' + (0.05 + Math.random() * 0.1) + ')';
    x.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * h; x.beginPath(); x.moveTo(0, y);
    for (let px = 0; px <= w; px += w / 8) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 3 + (Math.random() - 0.5) * 2);
    x.stroke();
  }
  return c;
}

/* ------------------------------------------------------------------ the scene */
export function createScene(host, opts = {}) {
  const lin = (hex) => new T.Color(hex);
  const tex = (c, aniso) => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; if (aniso) t.anisotropy = aniso; return t; };
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x0b110e, 1);
  host.appendChild(renderer.domElement);
  const ANISO = renderer.capabilities.getMaxAnisotropy();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.5, 200);

  // light
  scene.add(new T.HemisphereLight(0xfff3df, 0x203a2c, 2.1));
  const key = new T.DirectionalLight(0xfff4e6, 2.7);
  key.position.set(4, 18, 9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8, near: 4, far: 40 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new T.DirectionalLight(0xd2e6ff, 0.75); fill.position.set(-10, 8, -6); scene.add(fill);

  // table
  let feltName = opts.felt && FELTS[opts.felt] ? opts.felt : 'green';
  const feltCanvas = canvas(1792, 1434);
  drawFelt(feltCanvas, FELTS[feltName]);
  let feltTex = tex(feltCanvas, ANISO);
  const felt = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: feltTex, roughness: 0.96 }));
  felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; scene.add(felt);
  const woodMap = tex(woodTex(1024, 128)); woodMap.wrapS = woodMap.wrapT = T.RepeatWrapping;
  const woodMat = new T.MeshStandardMaterial({ map: woodMap, roughness: 0.55, metalness: 0.05 });
  const rails = [0, 1, 2, 3].map(() => { const m = new T.Mesh(new T.BoxGeometry(1, 0.5, 1), woodMat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; });
  function layTable() {
    const w = LY.tw, d = LY.td, r = 0.9;
    felt.scale.set(w, d, 1);
    [[0, -d / 2 - r / 2, w + 2 * r, r], [0, d / 2 + r / 2, w + 2 * r, r], [-w / 2 - r / 2, 0, r, d], [w / 2 + r / 2, 0, r, d]].forEach(([x, z, sx, sz], i) => {
      rails[i].scale.set(sx, 1, sz); rails[i].position.set(x, 0.05, z);
    });
  }
  function redrawFelt() {
    drawFelt(feltCanvas, FELTS[feltName]);
    feltTex.dispose(); feltTex = tex(feltCanvas, ANISO);
    felt.material.map = feltTex; felt.material.needsUpdate = true;
  }
  layTable();
  const floor = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshBasicMaterial({ color: lin(0x0b110e) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.3; scene.add(floor);

  // cards
  const atlasCanvas = canvas(AW, AH);
  drawAtlas(atlasCanvas);
  const atlas = tex(atlasCanvas, ANISO);
  const faceMat = new T.MeshStandardMaterial({ map: atlas, roughness: 0.48, metalness: 0 });
  const backMat = { T: new T.MeshStandardMaterial({ map: tex(drawBack('T'), ANISO), roughness: 0.5 }), X: new T.MeshStandardMaterial({ map: tex(drawBack('X'), ANISO), roughness: 0.5 }) };
  const edgeMat = { T: new T.MeshStandardMaterial({ color: lin('#f3ead6'), roughness: 0.6 }), X: new T.MeshStandardMaterial({ color: lin('#d9c08a'), roughness: 0.5 }) };
  const shape = new T.Shape();
  { const w = CW, h = CH, r = CR, x0 = -w / 2, y0 = -h / 2;
    shape.moveTo(x0 + r, y0); shape.lineTo(x0 + w - r, y0); shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); shape.lineTo(x0 + w, y0 + h - r); shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    shape.lineTo(x0 + r, y0 + h); shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0); }
  const bodyGeo = new T.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.rotateX(-Math.PI / 2); bodyGeo.translate(0, -CT / 2, 0);
  const decal = new T.ShapeGeometry(shape, 6);
  // ShapeGeometry UVs are in shape units; remap to 0..1
  { const uv = decal.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + CW / 2) / CW, (uv.getY(i) + CH / 2) / CH); }
  const faceGeo = (c) => {
    const g = decal.clone(); g.rotateX(-Math.PI / 2); g.translate(0, CT / 2 + 0.0015, 0);
    const [i, j] = cellOf(c), uv = g.attributes.uv;
    const u0 = (i * CELL_W) / AW, u1 = ((i + 1) * CELL_W) / AW, v1 = 1 - (j * CELL_H) / AH, v0 = 1 - ((j + 1) * CELL_H) / AH;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
    return g;
  };
  const backGeo = decal.clone(); backGeo.rotateX(Math.PI / 2); backGeo.translate(0, -CT / 2 - 0.0015, 0);
  const haloShape = new T.Shape();
  { const w = CW + 0.2, h = CH + 0.2, r = CR + 0.1, x0 = -w / 2, y0 = -h / 2;
    haloShape.moveTo(x0 + r, y0); haloShape.lineTo(x0 + w - r, y0); haloShape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r); haloShape.lineTo(x0 + w, y0 + h - r); haloShape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    haloShape.lineTo(x0 + r, y0 + h); haloShape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); haloShape.lineTo(x0, y0 + r); haloShape.quadraticCurveTo(x0, y0, x0 + r, y0);
    const hole = new T.Path(); const w2 = CW - 0.02, h2 = CH - 0.02, r2 = CR, a0 = -w2 / 2, b0 = -h2 / 2;
    hole.moveTo(a0 + r2, b0); hole.lineTo(a0 + w2 - r2, b0); hole.quadraticCurveTo(a0 + w2, b0, a0 + w2, b0 + r2); hole.lineTo(a0 + w2, b0 + h2 - r2); hole.quadraticCurveTo(a0 + w2, b0 + h2, a0 + w2 - r2, b0 + h2);
    hole.lineTo(a0 + r2, b0 + h2); hole.quadraticCurveTo(a0, b0 + h2, a0, b0 + h2 - r2); hole.lineTo(a0, b0 + r2); hole.quadraticCurveTo(a0, b0, a0 + r2, b0);
    haloShape.holes.push(hole); }
  const haloGeo = new T.ShapeGeometry(haloShape, 6); haloGeo.rotateX(-Math.PI / 2); haloGeo.translate(0, CT / 2 + 0.004, 0);
  const haloColors = { sel: lin('#ffd76a'), tgt: lin('#7fe0ff'), bad: lin('#ff6b6b'), last: lin('#ffffff') };

  const cards = [];
  for (let c = 0; c < 70; c++) {
    const g = new T.Group();
    const kind = c < 60 ? 'T' : 'X';
    const body = new T.Mesh(bodyGeo, edgeMat[kind]); body.castShadow = true; body.receiveShadow = true;
    const face = new T.Mesh(faceGeo(c), faceMat); face.receiveShadow = true;
    const back = new T.Mesh(backGeo, backMat[kind]);
    const halo = new T.Mesh(haloGeo, new T.MeshBasicMaterial({ color: haloColors.sel, transparent: true, opacity: 0, depthWrite: false }));
    halo.visible = false; halo.renderOrder = 3;
    g.add(body, face, back, halo); g.visible = false; scene.add(g);
    const o = { c, g, body, face, halo, kind, shown: false, anim: null, lift: 0, hl: null, place: null };
    body.userData.card = o; face.userData.card = o; back.userData.card = o;
    cards.push(o);
  }
  // generic backs for the other player's hand
  const generic = [];
  function newGeneric(kind) {
    const g = new T.Group();
    const body = new T.Mesh(bodyGeo, edgeMat[kind]); body.castShadow = true;
    const back = new T.Mesh(backGeo, backMat[kind]);
    const front = new T.Mesh(decal.clone().rotateX(-Math.PI / 2).translate(0, CT / 2 + 0.0015, 0), backMat[kind]);
    g.add(body, back, front); scene.add(g);
    return { g, kind, anim: null };
  }
  // deck blocks
  const deckEdge = (() => { const c = canvas(64, 64), x = c.getContext('2d'); x.fillStyle = '#efe4c8'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(120,90,50,0.35)'; for (let y = 0; y < 64; y += 4) x.fillRect(0, y, 64, 1.4); const t = tex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; })();
  const decks = {};
  for (const k of ['T', 'X']) {
    const g = new T.Group();
    const side = new T.MeshStandardMaterial({ map: deckEdge, roughness: 0.7 });
    const block = new T.Mesh(new T.BoxGeometry(CW * 0.98, 1, CH * 0.98), [side, side, backMat[k], side, side, side]);
    block.castShadow = true; block.receiveShadow = true;
    g.add(block); scene.add(g);
    const halo = new T.Mesh(haloGeo, new T.MeshBasicMaterial({ color: haloColors.tgt, transparent: true, opacity: 0, depthWrite: false }));
    halo.visible = false; halo.renderOrder = 3; g.add(halo);
    block.userData.deck = k;
    decks[k] = { g, block, halo, n: 0, h: 0, shownH: 0 };
  }
  placeDecks();
  // flags
  const flags = [];
  const TOK_R = 0.4, TOK_H = 0.09;
  const pennantGeo = new T.PlaneGeometry(0.6, 0.38, 10, 1);
  const flagHitGeo = new T.CylinderGeometry(0.46, 0.46, 1.1, 12);
  const glowGeo = new T.PlaneGeometry(TOK_R * 3.2, TOK_R * 3.2);
  const glowMap = tex(glowTex()), glintMap = tex(twinkleTex());
  const tokenGeo = new T.CylinderGeometry(TOK_R, TOK_R * 1.05, TOK_H, 48);
  const hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const brass = new T.MeshStandardMaterial({ color: lin('#c99a3a'), roughness: 0.35, metalness: 0.6 });
  const rimCol = [lin('#d9a53a'), lin('#b8273f'), lin('#c8a15a')];
  for (let f = 0; f < 9; f++) {
    const g = new T.Group();
    const tcv = [drawToken(f, -1), drawToken(f, 0), drawToken(f, 1)].map((c) => tex(c, ANISO));
    const topMat = new T.MeshStandardMaterial({ map: tcv[0], roughness: 0.45, metalness: 0.05 });
    const rimMat = new T.MeshStandardMaterial({ color: rimCol[2], roughness: 0.4, metalness: 0.45 });
    const token = new T.Mesh(tokenGeo, [rimMat, topMat, rimMat]);
    token.rotation.y = Math.PI / 2;            // the number reads upright from our side
    token.position.y = TOK_H / 2 + 0.004; token.castShadow = true; token.receiveShadow = true;
    const px = -0.26, pz = -0.24, top = TOK_H + 0.004;
    const pole = new T.Mesh(new T.CylinderGeometry(0.026, 0.03, 0.86, 10), brass); pole.position.set(px, top + 0.43, pz); pole.castShadow = true;
    const knob = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), brass); knob.position.set(px, top + 0.88, pz);
    const cv = [drawPennant(f, -1), drawPennant(f, 0), drawPennant(f, 1)].map((c) => tex(c, ANISO));
    const pm = new T.MeshStandardMaterial({ map: cv[0], side: T.DoubleSide, roughness: 0.8, transparent: true, alphaTest: 0.5 });
    const pen = new T.Mesh(pennantGeo.clone(), pm); pen.position.set(px + 0.31, top + 0.66, pz); pen.castShadow = true;
    const hit = new T.Mesh(flagHitGeo, hitMat); hit.position.y = 0.5; hit.userData.flag = f;
    // once taken: a soft glow around the token and a few glints that come and go
    const owner = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowMap, color: lin(PLAYER_COL[0]), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    owner.rotation.x = -Math.PI / 2; owner.position.y = 0.012; owner.visible = false; owner.renderOrder = 2;
    g.add(token, pole, knob, pen, hit, owner);
    const twinkles = [];
    for (let k = 0; k < 6; k++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glintMap, color: lin('#ffffff'), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
      const a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, onPennant = k % 3 === 2;
      if (onPennant) sp.position.set(px + 0.1 + Math.random() * 0.45, top + 0.5 + Math.random() * 0.36, pz + 0.02);
      else sp.position.set(Math.cos(a) * TOK_R * 0.92, TOK_H + 0.02, Math.sin(a) * TOK_R * 0.92);
      sp.scale.setScalar(0.2 + Math.random() * 0.14); sp.visible = false; sp.renderOrder = 7;
      sp.userData.ph = Math.random() * Math.PI * 2; sp.userData.sp = 1.3 + Math.random() * 0.8;
      g.add(sp); twinkles.push(sp);
    }
    g.position.set(flagX(f), 0, 0); scene.add(g);
    const pos0 = pen.geometry.attributes.position.array.slice();
    flags.push({ g, pen, pm, cv, tcv, topMat, rimMat, owner, hit, twinkles, state: -1, z: 0, anim: null, pos0, phase: Math.random() * 6 });
  }
  // lanes: invisible hit areas, one per flag and side
  const lanes = [];
  const laneGeo = new T.PlaneGeometry(PITCH, 1);
  for (let f = 0; f < 9; f++) for (const s of [1, -1]) {
    const m = new T.Mesh(laneGeo, hitMat);
    m.rotation.x = -Math.PI / 2; m.userData.lane = { f, mine: s > 0 }; m.userData.s = s;
    scene.add(m); lanes.push(m);
  }
  function layLanes() {
    const len = stackEnd(4) + 0.1;
    lanes.forEach((m) => { m.scale.y = len; m.position.set(flagX(m.userData.lane.f), 0.002, m.userData.s * len / 2); });
  }
  layLanes();
  // a grey wash over the lane of the side that lost the flag (nothing more can be placed there)
  const washes = [];
  for (let f = 0; f < 9; f++) for (const sd of [1, -1]) {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: lin('#aeb3b8'), transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
    washes.push({ f, sd, m, a: 0, want: 0 });
  }
  function layWashes() {
    const len = stackEnd(4) - 0.62 + 0.08;
    washes.forEach((W) => { W.m.scale.set(1.04, len, 1); W.m.position.set(flagX(W.f), 0.0035, W.sd * (0.62 + len / 2)); });
  }
  layWashes();
  // target ghosts (where a card can go)
  const ghostMat = new T.MeshBasicMaterial({ color: lin('#7fe0ff'), transparent: true, opacity: 0.0, depthWrite: false });
  const ghosts = [];
  for (let f = 0; f < 9; f++) {
    const m = new T.Mesh(haloGeo, ghostMat.clone()); m.visible = false; m.renderOrder = 2;
    const fillM = new T.Mesh(decal.clone().rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: lin('#7fe0ff'), transparent: true, opacity: 0.12, depthWrite: false }));
    fillM.position.y = CT / 2; m.add(fillM);
    scene.add(m); ghosts.push(m);
  }
  // the inspected flag: a ring on the felt
  const ring = new T.Mesh(new T.RingGeometry(0.47, 0.58, 48), new T.MeshBasicMaterial({ color: lin('#7fe0ff'), transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; ring.visible = false; ring.renderOrder = 1; scene.add(ring);
  let focusF = -1;
  function setFocus(f) { focusF = f; ring.visible = f >= 0; }
  // weather
  const cloudMat = new T.MeshBasicMaterial({ map: tex(cloudTex()), transparent: true, opacity: 0.0, depthWrite: false });
  const mudMat = new T.MeshBasicMaterial({ map: tex(mudTex()), transparent: true, opacity: 0.0, depthWrite: false });
  const weather = [];
  for (let f = 0; f < 9; f++) {
    const clouds = [];
    for (let k = 0; k < 4; k++) {
      const m = new T.Mesh(new T.PlaneGeometry(1.9, 2.4), cloudMat.clone());
      m.rotation.x = -Math.PI / 2; m.position.set(flagX(f), 0.5 + k * 0.06, (k - 1.5) * 1.75); m.renderOrder = 5; m.visible = false;
      scene.add(m); clouds.push(m);
    }
    const mud = new T.Mesh(new T.PlaneGeometry(1.5, 1.3), mudMat.clone()); mud.rotation.x = -Math.PI / 2; mud.position.set(flagX(f), 0.003, 0); mud.visible = false; scene.add(mud);
    weather.push({ clouds, mud, fog: 0, fogT: 0, mudV: 0, mudT: 0 });
  }
  // sparks
  const sparkMat = new T.SpriteMaterial({ map: tex(sparkTex()), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const sparks = [];
  // a finished formation: a column of light over the stack and a ring running across the felt
  const RANK_COL = ['#cfd8e0', '#7fe0ff', '#9dff8a', '#ff7a5c', '#ffd36a'];
  const beamTex = (() => { const c = canvas(64, 256), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256); const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256); return tex(c); })();
  const beamGeo = new T.CylinderGeometry(0.62, 0.7, 4.2, 28, 1, true);
  const shockGeo = new T.RingGeometry(0.9, 1, 64);
  const beams = [];
  function formationFx(f, mine, rank) {
    const col = lin(mine ? RANK_COL[rank] : '#ff6b81');
    const z = mine ? LY.Z0 + LY.SO : -(LY.Z0 + LY.SO);
    const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    beam.position.set(flagX(f), 2.1, z); beam.renderOrder = 6; scene.add(beam);
    const ring = new T.Mesh(shockGeo, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(flagX(f), 0.02, z); ring.renderOrder = 6; scene.add(ring);
    beams.push({ beam, ring, t0: clock, life: 1.5 / speed, rank });
    for (let k = 0; k < 14 + rank * 8; k++) {
      const sp = new T.Sprite(sparkMat.clone()); sp.material.color = col.clone();
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * (1 + rank * 0.4);
      sp.position.set(flagX(f), 0.3, z); sp.scale.setScalar(0.18 + Math.random() * 0.22);
      sp.userData = { v: new T.Vector3(Math.cos(a) * r, 2 + Math.random() * (2 + rank), Math.sin(a) * r), t0: clock, life: 0.9 + Math.random() * 0.6 };
      scene.add(sp); sparks.push(sp);
    }
    shake = Math.max(shake, 0.1 + rank * 0.05);
  }
  let shake = 0;

  /* ---------------------------------------------------------------- placements */
  const Q = {
    flat: new T.Quaternion(),
    down: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI),
    stand: { tall: new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), PRESET.tall.hand.tilt), wide: new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), PRESET.wide.hand.tilt) },
    oppStand: new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -(Math.PI / 2 + 0.95)),   // backs turned up toward us
    cross: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2)
  };
  const yawQ = (a) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a);
  function slotPlace(f, mine, k) {
    const z = mine ? LY.Z0 + k * LY.SO : -(LY.Z0 + k * LY.SO);
    return { p: new T.Vector3(flagX(f), CT / 2 + 0.002 + k * (CT + 0.006), z), q: Q.flat, s: 1 };
  }
  function envPlace(f, mine, kind) {   // just off the flag token, on the side of whoever played it
    const off = kind === 'fog' ? -0.06 : 0.06;
    return { p: new T.Vector3(flagX(f) + off, CT / 2 + 0.004 + (kind === 'fog' ? 0.03 : 0), (mine ? 0.64 : -0.64)), q: Q.cross, s: 0.42 };
  }
  function handPlace(j, n) {
    const H = LY.hand, pitch = Math.min(H.pitch, (H.pitch * 7) / Math.max(n, 1));
    const x = (j - (n - 1) / 2) * pitch;
    return { p: new T.Vector3(x, H.y + j * 0.004, H.z + j * 0.012 * H.sc), q: Q.stand[mode], s: H.sc };
  }
  function oppPlace(j, n) {
    const O = LY.opp, pitch = Math.min(O.pitch, (O.pitch * 7) / Math.max(n, 1));
    const x = (j - (n - 1) / 2) * pitch;
    return { p: new T.Vector3(x, O.y, O.z), q: Q.oppStand, s: O.sc };
  }
  function deckTop(k) { const d = decks[k]; return new T.Vector3(DECK[k][0], d.h + CT / 2 + 0.01, DECK[k][1]); }
  function discPlace(i, n, c) {
    const yaw = ((c * 37) % 21 - 10) * 0.025;
    return { p: new T.Vector3(DISC[0] + ((c * 13) % 7 - 3) * 0.02, CT / 2 + 0.002 + i * (CT + 0.004), DISC[1] + ((c * 7) % 5 - 2) * 0.02), q: yawQ(yaw), s: 0.86 };
  }
  function originFor(where, view) {
    if (where === 'deckT' || where === 'deckX') { const k = where === 'deckT' ? 'T' : 'X'; return { p: deckTop(k), q: Q.down, s: 1 }; }
    if (where === 'opp') {
      const n = Math.max(1, oppBacks.length);
      const j = Math.floor(n / 2);
      return { p: oppPlace(j, n).p.clone().add(new T.Vector3(0, 0.1, 0)), q: Q.oppStand, s: LY.opp.sc };
    }
    if (where === 'disc') return { p: new T.Vector3(DISC[0], 0.3, DISC[1]), q: Q.flat, s: 0.86 };
    return null;
  }

  /* ---------------------------------------------------------------- animation */
  let speed = 1;
  let clock = 0;
  function animate(o, to, dur, arc, delay = 0) {
    const g = o.g;
    o.anim = { p0: g.position.clone(), q0: g.quaternion.clone(), s0: g.scale.x, p1: to.p.clone(), q1: to.q.clone(), s1: to.s, t0: clock + delay / speed, dur: Math.max(0.01, dur / speed), arc: arc || 0 };
  }
  function jump(o, to) { o.g.position.copy(to.p); o.g.quaternion.copy(to.q); o.g.scale.setScalar(to.s); o.anim = null; }
  function stepAnim(o) {
    const a = o.anim; if (!a) return;
    const u = clamp((clock - a.t0) / a.dur, 0, 1);
    if (clock < a.t0) return;
    const e = easeIO(u);
    o.g.position.lerpVectors(a.p0, a.p1, e);
    if (a.arc) o.g.position.y += Math.sin(Math.PI * u) * a.arc;
    o.g.quaternion.slerpQuaternions(a.q0, a.q1, e);
    o.g.scale.setScalar(a.s0 + (a.s1 - a.s0) * e);
    if (u >= 1) { o.anim = null; if (o.onDone) { const f = o.onDone; o.onDone = null; f(); } }
  }

  let view = null, me = 0;
  let oppBacks = [];   // generic objects in the other hand
  const genericPool = { T: [], X: [] };
  function takeGeneric(kind) { const o = genericPool[kind].pop() || newGeneric(kind); o.g.visible = true; return o; }
  function dropGeneric(o) { o.g.visible = false; o.anim = null; genericPool[o.kind].push(o); }
  let busyUntil = 0;

  /* place every card where the view says; returns the seconds the animation takes */
  function setView(v, hints = {}) {
    const prev = view; view = v; me = v.me;
    const from = hints.from || {}, to = hints.to || {}, instant = !!hints.instant || !prev;
    const targets = new Map();
    const hand = sortHand(v.hand);
    hand.forEach((c, j) => targets.set(c, Object.assign(handPlace(j, hand.length), { where: 'hand' })));
    v.flags.forEach((fl, f) => {
      for (let p = 0; p < 2; p++) fl.side[p].forEach((e, k) => targets.set(e.c, Object.assign(slotPlace(f, p === me, k), { where: 'table' })));
      if (fl.fog >= 0) targets.set(64, Object.assign(envPlace(f, fl.fog === me, 'fog'), { where: 'table' }));
      if (fl.mud >= 0) targets.set(65, Object.assign(envPlace(f, fl.mud === me, 'mud'), { where: 'table' }));
    });
    const disc = v.discard[1 - me].concat(v.discard[me]);
    disc.forEach((c, i) => targets.set(c, Object.assign(discPlace(i, disc.length, c), { where: 'disc' })));
    let longest = 0, delay = 0;
    const D = (x) => x / speed;
    // decks
    for (const k of ['T', 'X']) {
      const d = decks[k]; d.n = v.deck[k];
      d.h = d.n ? 0.03 + d.n * 0.012 : 0;
    }
    for (let c = 0; c < 70; c++) {
      const o = cards[c], tgt = targets.get(c);
      if (tgt) {
        const was = o.place;
        o.place = tgt.where;
        if (tgt.where === 'hand') o.baseY = tgt.p.y;
        if (!o.shown) {
          o.shown = true; o.g.visible = true;
          const org = !instant && from[c] ? originFor(from[c], v) : null;
          if (org) { jump(o, org); animate(o, tgt, 0.62, tgt.where === 'hand' ? 0.5 : 0.7); longest = Math.max(longest, 0.62); }
          else jump(o, tgt);
        } else if (instant) jump(o, tgt);
        else {
          const moved = o.g.position.distanceTo(tgt.p) > 0.002 || o.g.quaternion.angleTo(tgt.q) > 0.002;
          if (moved) {
            const far = was !== tgt.where || o.g.position.distanceTo(tgt.p) > 1.2;
            const dur = far ? 0.55 : 0.32;
            animate(o, tgt, dur, far ? (tgt.where === 'table' ? 0.8 : 0.45) : 0);
            longest = Math.max(longest, dur);
          }
        }
      } else if (o.shown) {
        o.place = null;
        const dest = !instant && to[c] ? originFor(to[c], v) : null;
        if (dest) {
          animate(o, dest, 0.5, 0.5);
          o.onDone = () => { o.g.visible = false; };
          o.shown = false; longest = Math.max(longest, 0.5);
        } else { o.shown = false; o.g.visible = false; o.anim = null; }
      }
    }
    // the other hand: one back per card, troop / tactics backs as they are
    const want = v.opp.slice();
    const n = want.length;
    // keep matching kinds in place; remove extras; add missing from the right deck
    const next = [];
    const avail = { T: oppBacks.filter((o) => o.kind === 'T'), X: oppBacks.filter((o) => o.kind === 'X') };
    const removed = [];
    want.forEach((k) => { const o = avail[k].shift(); next.push(o || null); });
    avail.T.concat(avail.X).forEach((o) => removed.push(o));
    removed.forEach((o) => {
      if (instant || hints.oppPlayed) { dropGeneric(o); return; }
      animate(o, { p: deckTop(o.kind === 'T' ? 'T' : 'X'), q: Q.down, s: 1 }, 0.5, 0.5);
      o.onDone = () => dropGeneric(o);
    });
    next.forEach((o, j) => {
      const tgt = oppPlace(j, n);
      if (!o) {
        const kind = want[j];
        o = takeGeneric(kind);
        if (instant) jump(o, tgt);
        else { jump(o, { p: deckTop(kind), q: Q.down, s: 1 }); animate(o, tgt, 0.6, 0.6); longest = Math.max(longest, 0.6); }
        next[j] = o;
      } else if (instant) jump(o, tgt);
      else animate(o, tgt, 0.35, 0);
    });
    oppBacks = next;
    // flags: a taken flag goes to stand on the winner's cards; the loser's side turns grey
    const grey = new Set();
    v.flags.forEach((fl) => { if (fl.claimed !== -1) fl.side[1 - fl.claimed].forEach((e) => grey.add(e.c)); });
    if (grey.size) ensureGray();
    cards.forEach((o) => { o.gray = o.place === 'table' && grey.has(o.c); });
    washes.forEach((W) => { const fl = v.flags[W.f]; W.want = fl.claimed !== -1 && (fl.claimed === me ? -1 : 1) === W.sd ? 0.26 : 0; if (instant) W.a = W.want; });
    v.flags.forEach((fl, f) => {
      const F = flags[f];
      const st = fl.claimed === -1 ? -1 : fl.claimed === me ? 0 : 1;
      if (st !== F.state) {
        F.state = st; F.pm.map = F.cv[st + 1]; F.pm.needsUpdate = true;
        F.topMat.map = F.tcv[st + 1]; F.topMat.needsUpdate = true; F.rimMat.color.copy(rimCol[st < 0 ? 2 : st]);
        F.owner.visible = st >= 0; if (st >= 0) F.owner.material.color.copy(lin(PLAYER_COL[st]));
        F.twinkles.forEach((sp) => { sp.material.color.copy(lin(st === 1 ? '#ffd0d8' : '#fff4d0')); });
        F.hit.scale.y = st >= 0 ? 0.5 : 1;
        const home = flagHome(f, F);
        if (!instant) { F.anim = { from: F.g.position.clone(), to: home, t0: clock, dur: D(1.0) }; if (st >= 0) burst(f, st, home); longest = Math.max(longest, 1.0); }
        else { F.anim = null; F.g.position.set(home.x, home.y, home.z); F.g.rotation.y = 0; }
      } else if (!F.anim) { const home = flagHome(f, F); F.g.position.set(home.x, home.y, home.z); }
      const W = weather[f];
      W.fogT = fl.fog >= 0 ? 1 : 0; W.mudT = fl.mud >= 0 ? 1 : 0;
      if (instant) { W.fog = W.fogT; W.mudV = W.mudT; }
    });
    applyHighlights();
    busyUntil = clock + D(longest);
    return D(longest);
  }

  /* ---------------------------------------------------------------- highlights
     hl = { hand: [ids], sel: id, flags: [f], cards: [ids on table], decks: ['T','X'], last: id, picked: [ids] } */
  let hl = {};
  function applyHighlights() {
    const sel = hl.sel, handSet = new Set(hl.hand || []), cardSet = new Set(hl.cards || []), picked = new Set(hl.picked || []);
    cards.forEach((o) => {
      let mode = null;
      if (o.shown && o.place === 'hand') {
        if (o.c === sel || picked.has(o.c)) mode = 'sel';
        else if (hl.dimHand && !handSet.has(o.c)) mode = 'dim';
      } else if (o.shown && cardSet.has(o.c)) mode = 'tgt';
      else if (o.shown && o.c === hl.last && o.place === 'table') mode = 'last';
      o.hl = mode;
      const want = o.c === sel || picked.has(o.c) ? 0.32 : 0;
      o.lift = want;
      if (mode === 'sel' || mode === 'tgt' || mode === 'last') { o.halo.visible = true; o.halo.material.color.copy(haloColors[mode]); }
      else o.halo.visible = false;
      o.face.material = o.gray ? grayFaceMat : mode === 'dim' ? dimFaceMat : faceMat;
    });
    // ghosts on my side
    const fl = new Set(hl.flags || []);
    ghosts.forEach((m, f) => {
      if (!fl.has(f) || !view) { m.visible = false; return; }
      const flg = view.flags[f];
      if (hl.ghostMode === 'env') { m.visible = true; m.position.set(flagX(f), 0.01, 0.64); m.quaternion.copy(Q.cross); m.scale.setScalar(0.46); return; }
      const k = flg.side[me].length;
      const pl = slotPlace(f, true, k);
      m.visible = true; m.position.copy(pl.p); m.position.y += 0.002; m.quaternion.copy(Q.flat); m.scale.setScalar(1);
    });
    for (const k of ['T', 'X']) decks[k].halo.visible = (hl.decks || []).includes(k) && decks[k].n > 0;
  }
  const dimFaceMat = new T.MeshStandardMaterial({ map: atlas, roughness: 0.6, color: lin('#8a8a8a') });
  /* the cards of a side that lost its flag turn grey: a grey copy of the atlas, made when first needed */
  const grayFaceMat = new T.MeshStandardMaterial({ roughness: 0.66, color: lin('#c8c8c8') });
  let grayAtlas = null, grayDirty = true;
  function ensureGray() {
    if (grayAtlas && !grayDirty) return;
    const S = 1024, c = canvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(atlasCanvas, 0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, v = l * 0.78 + 22; d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(img, 0, 0);
    if (grayAtlas) grayAtlas.dispose();
    grayAtlas = tex(c, ANISO); grayFaceMat.map = grayAtlas; grayFaceMat.needsUpdate = true; grayDirty = false;
  }
  function setHighlights(h) { hl = h || {}; applyHighlights(); }

  /* where a flag stands: on the line while open; once taken, on top of the winner's cards (over the lower part
     of the last card, so every card's number stays in sight) */
  function flagHome(f, F) {
    if (!view || F.state < 0) return { x: flagX(f), y: 0, z: 0 };
    const fl = view.flags[f], p = fl.claimed, k = Math.max(1, fl.side[p].length) - 1;
    const zc = LY.Z0 + k * LY.SO + CH * 0.2;
    return { x: flagX(f), y: CT + 0.006 + k * (CT + 0.006), z: p === me ? zc : -zc };
  }
  /* ---------------------------------------------------------------- effects */
  function burst(f, st, at) {
    const col = lin(PLAYER_COL[st]);
    for (let k = 0; k < 22; k++) {
      const sp = new T.Sprite(sparkMat.clone()); sp.material.color = col;
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2;
      sp.position.set(flagX(f), (at ? at.y : 0) + 0.7, at ? at.z : st === 0 ? 0.3 : -0.3); sp.scale.setScalar(0.22 + Math.random() * 0.2);
      sp.userData = { v: new T.Vector3(Math.cos(a) * r, 1.6 + Math.random() * 1.6, Math.sin(a) * r), t0: clock, life: 0.9 + Math.random() * 0.5 };
      scene.add(sp); sparks.push(sp);
    }
  }

  /* ---------------------------------------------------------------- camera */
  let layout = { w: 1, h: 1, top: 0, bottom: 0 };
  let attract = false, attractT = 0;
  const camTarget = new T.Vector3();
  function boundsPoints() {
    const pts = [], H = LY.hand, O = LY.opp;
    const bx = 4 * PITCH + 0.56, bz = stackEnd(3) + 0.05;
    for (const x of [-bx, bx]) for (const z of [-bz, bz]) pts.push(new T.Vector3(x, 0, z));
    const hx = 3 * H.pitch + 0.52 * H.sc, hs = Math.sin(H.tilt) * 0.72 * H.sc, hc = Math.cos(H.tilt) * 0.72 * H.sc;
    for (const x of [-hx, hx]) { pts.push(new T.Vector3(x, H.y + hs + 0.3 * H.sc, H.z - hc)); pts.push(new T.Vector3(x, H.y - hs, H.z + hc)); }
    const ox = 3 * O.pitch + 0.52 * O.sc;
    for (const x of [-ox, ox]) { pts.push(new T.Vector3(x, O.y + 0.62 * O.sc, O.z - 0.3 * O.sc)); pts.push(new T.Vector3(x, 0.02, O.z - 0.45 * O.sc)); }
    for (const k of ['T', 'X']) for (const dx of [-0.52, 0.52]) for (const dz of [-0.74, 0.74]) pts.push(new T.Vector3(DECK[k][0] + dx, dz < 0 ? 0.35 : 0, DECK[k][1] + dz));
    for (const dx of [-0.48, 0.48]) for (const dz of [-0.66, 0.66]) pts.push(new T.Vector3(DISC[0] + dx, 0, DISC[1] + dz));
    pts.push(new T.Vector3(0, 1.0, 0));
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
    const mt = (layout.top / layout.h) * 2, mb = (layout.bottom / layout.h) * 2, mx = 0.03, room = 2 - mt - mb - 0.04;
    const measure = (d) => {
      camera.position.copy(camTarget).addScaledVector(dir, d); camera.lookAt(camTarget); camera.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { _p.copy(p).project(camera); x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 3, hi = 120;
    for (let k = 0; k < 32; k++) {
      const d = (lo + hi) / 2, m = measure(d);
      if (m.x0 >= -1 + mx && m.x1 <= 1 - mx && m.y1 - m.y0 <= room) hi = d; else lo = d;
    }
    const d = hi, m = measure(d);
    const want = ((-1 + mb) + (1 - mt)) / 2, have = (m.y0 + m.y1) / 2;
    const offY = ((want - have) * layout.h) / 2;
    camera.setViewOffset(layout.w, layout.h, 0, offY, layout.w, layout.h);
    baseCam = { pos: camera.position.clone(), target: camTarget.clone(), d, dir };
  }
  let baseCam = null;
  let mode = 'wide';
  function setMode(m) {
    if (m === mode) return false;
    mode = m; LY = PRESET[m]; DECK = LY.deck; DISC = LY.disc;
    redrawFelt(); layTable(); layLanes(); layWashes(); placeDecks();
    return true;
  }
  function placeDecks() { for (const k of ['T', 'X']) decks[k].g.position.set(DECK[k][0], 0, DECK[k][1]); }
  function resize(w, h, top = 0, bottom = 0) {
    layout = { w, h, top, bottom };
    const changed = setMode(w / Math.max(1, h) < 1.05 ? 'tall' : 'wide');
    const q = quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(q);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    fit();
    if (changed && view) setView(view, { instant: true });
  }
  let quality = opts.quality || 'high';
  function setQuality(qv) {
    quality = qv; renderer.shadowMap.enabled = qv === 'high'; key.castShadow = qv === 'high';
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    resize(layout.w, layout.h, layout.top, layout.bottom);
  }

  /* ---------------------------------------------------------------- picking */
  const ray = new T.Raycaster();
  function pick(px, py) {
    const ndc = new T.Vector2((px / layout.w) * 2 - 1, -(py / layout.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = [];
    cards.forEach((o) => { if (o.shown) objs.push(o.body, o.face); });
    for (const k of ['T', 'X']) if (decks[k].n) objs.push(decks[k].block);
    flags.forEach((F) => objs.push(F.g.children[4]));
    objs.push(...lanes);
    const hits = ray.intersectObjects(objs, false);
    const out = { hand: null, card: null, deck: null, flag: null, lane: null, disc: false };
    for (const h of hits) {
      const u = h.object.userData;
      if (u.card) {
        if (u.card.place === 'hand' && out.hand == null && out.card == null) out.hand = u.card.c;
        else if (u.card.place === 'table' && out.card == null) out.card = u.card.c;
        else if (u.card.place === 'disc') out.disc = true;
      } else if (u.deck && out.deck == null) out.deck = u.deck;
      else if (u.flag != null && out.flag == null) out.flag = u.flag;
      else if (u.lane && out.lane == null) out.lane = u.lane;
    }
    // a hand card hit first wins over things behind it.
    // fog and mud lie small beside the flag token, so a tap close to one counts as a tap on it
    if (out.hand == null && !(out.card >= 64 && out.card <= 65)) {
      const o = ray.ray.origin, d = ray.ray.direction;
      if (d.y < -1e-4) {
        for (const c of [64, 65]) {
          const e = cards[c];
          if (!e.shown || e.place !== 'table' || e.anim) continue;
          const p = e.g.position, k = (p.y - o.y) / d.y, x = o.x + d.x * k, z = o.z + d.z * k;
          const sc = e.g.scale.x, hx = (CH * sc) / 2 + 0.1, hz = (CW * sc) / 2;
          const out2 = (z - p.z) * Math.sign(p.z || 1);   // + toward that side's cards, - toward the flag token
          if (Math.abs(x - p.x) <= hx && out2 >= -(hz + 0.16) && out2 <= hz + 0.05) { out.card = c; break; }
        }
      }
    }
    return out;
  }

  /* screen position of a world point (CSS px inside the stage) */
  const _v = new T.Vector3();
  function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return [(_v.x + 1) / 2 * layout.w, (1 - _v.y) / 2 * layout.h, _v.z < 1]; }
  function anchors() {
    const a = {};
    // counts sit on the piles themselves, so they never cover a column
    a.deckT = toScreen(DECK.T[0], decks.T.shownH + 0.02, DECK.T[1] + 0.22);
    a.deckX = toScreen(DECK.X[0], decks.X.shownH + 0.02, DECK.X[1] + 0.22);
    a.disc = toScreen(DISC[0], 0.08, DISC[1] + 0.22);
    a.opp = toScreen(0, LY.opp.y + 0.62 * LY.opp.sc, LY.opp.z - 0.2);
    a.flags = flags.map((F, f) => toScreen(flagX(f), 0.72, 0));
    return a;
  }
  /* where a side's formation label goes: ours in the gap between the flag and our first card;
     theirs just beyond the far end of their stack (the pennant leans over the gap on their side) */
  function flagAnchor(f, mine) {
    if (mine) return toScreen(flagX(f), 0.01, (0.36 + LY.Z0 - CH / 2) / 2 - 0.03);
    const n = view ? Math.max(1, view.flags[f].side[1 - me].length) : 3;
    return toScreen(flagX(f), 0.01, LY === PRESET.tall ? -Math.min(stackEnd(n) + 0.3, 4.25) : -Math.min(stackEnd(n) + 0.55, 3.95));
  }
  /* where to tap for things (tests, tutorials): CSS px inside the stage */
  function screenOf(q) {
    if (q.hand != null) { const o = cards[q.hand]; if (!o.shown) return null; const p = o.g.position; return toScreen(p.x, p.y, p.z); }
    if (q.card != null) {
      const o = cards[q.card]; if (!o.shown) return null;
      const p = o.g.position, mine = p.z > 0, onFloor = o.place === 'table' && Math.abs(o.g.scale.x - 1) < 0.01;
      if (!onFloor) return toScreen(p.x, p.y + 0.05, p.z);
      return toScreen(p.x - 0.18, p.y + 0.03, p.z + (mine ? -0.5 : 0.5));
    }
    if (q.lane != null) { const z = LY.Z0 + LY.SO; return toScreen(flagX(q.lane), 0.02, q.mine === false ? -z : z); }
    if (q.flag != null) return toScreen(flagX(q.flag), 0.6, flags[q.flag].g.position.z);
    if (q.deck) { const d = decks[q.deck]; return toScreen(DECK[q.deck][0], d.h * 0.6, DECK[q.deck][1] + 0.1); }
    if (q.disc) return toScreen(DISC[0], 0.1, DISC[1]);
    return null;
  }

  /* ---------------------------------------------------------------- frame loop */
  let last = performance.now(), onFrame = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    cards.forEach((o) => {
      stepAnim(o);
      if (!o.anim && o.shown && o.place === 'hand') {
        // selection lift (smooth)
        const target = handLift(o);
        o.g.position.y += (target - o.g.position.y) * Math.min(1, dt * 14);
      }
      if (o.halo.visible) o.halo.material.opacity = o.hl === 'last' ? 0.5 : 0.55 + Math.sin(clock * 5) * 0.3;
    });
    oppBacks.forEach((o) => stepAnim(o));
    for (const k of ['T', 'X']) {
      const d = decks[k];
      d.shownH += (d.h - d.shownH) * Math.min(1, dt * 8);
      d.block.visible = d.shownH > 0.004;
      d.block.scale.y = Math.max(0.0001, d.shownH); d.block.position.y = d.shownH / 2;
      d.halo.position.y = d.shownH + 0.01;
      if (d.halo.visible) d.halo.material.opacity = 0.5 + Math.sin(clock * 5) * 0.3;
    }
    flags.forEach((F) => {
      if (F.anim) {   // the taken flag flies onto the winner's cards
        const A = F.anim, u = clamp((clock - A.t0) / A.dur, 0, 1), e = easeIO(u);
        F.g.position.set(A.from.x + (A.to.x - A.from.x) * e, A.from.y + (A.to.y - A.from.y) * e + Math.sin(Math.PI * u) * 1.1, A.from.z + (A.to.z - A.from.z) * e);
        F.g.rotation.y = (1 - easeOut(u)) * Math.PI * 2;
        if (u >= 1) { F.anim = null; F.g.position.set(A.to.x, A.to.y, A.to.z); F.g.rotation.y = 0; }
      }
      if (F.state >= 0) {   // a gentle glow and glints now and then
        const pulse = 0.5 + 0.5 * Math.sin(clock * 1.8 + F.phase);
        F.owner.material.opacity = 0.22 + 0.2 * pulse;
        F.topMat.emissive.copy(F.owner.material.color); F.topMat.emissiveIntensity = 0.04 + 0.08 * pulse;
        F.twinkles.forEach((sp) => {
          const w = Math.sin(clock * sp.userData.sp + sp.userData.ph), a = w > 0 ? Math.pow(w, 16) : 0;
          sp.visible = a > 0.01; sp.material.opacity = a; sp.material.rotation = clock * 0.5 + sp.userData.ph;
        });
      } else if (F.twinkles[0].visible || F.topMat.emissiveIntensity) {
        F.twinkles.forEach((sp) => { sp.visible = false; }); F.topMat.emissiveIntensity = 0;
      }
      // wave the pennant
      const pos = F.pen.geometry.attributes.position, p0 = F.pos0;
      for (let i = 0; i < pos.count; i++) {
        const x0 = p0[i * 3] + 0.3;
        pos.array[i * 3 + 2] = Math.sin(clock * 3.2 + F.phase - x0 * 7) * 0.06 * x0;
      }
      pos.needsUpdate = true;
    });
    ghosts.forEach((m) => { if (m.visible) m.material.opacity = 0.45 + Math.sin(clock * 5) * 0.3; });
    if (focusF >= 0) { const G = flags[focusF].g.position; ring.position.set(G.x, G.y + 0.006, G.z); ring.material.opacity = 0.4 + Math.sin(clock * 2.5) * 0.15; }
    washes.forEach((W) => { W.a += (W.want - W.a) * Math.min(1, dt * 3); W.m.material.opacity = W.a; W.m.visible = W.a > 0.005; });
    weather.forEach((W, f) => {
      W.fog += (W.fogT - W.fog) * Math.min(1, dt * 3);
      W.mudV += (W.mudT - W.mudV) * Math.min(1, dt * 3);
      W.clouds.forEach((m, k) => {
        m.visible = W.fog > 0.01; m.material.opacity = W.fog * 0.42;
        m.position.x = flagX(f) + Math.sin(clock * 0.35 + k * 1.7 + f) * 0.18;
        m.position.z = (k - 1.5) * (stackEnd(3) / 1.9) + Math.sin(clock * 0.25 + k) * 0.2;
        m.rotation.z = Math.sin(clock * 0.1 + k) * 0.4 + k;
      });
      W.mud.visible = W.mudV > 0.01; W.mud.material.opacity = W.mudV;
    });
    for (let i = beams.length - 1; i >= 0; i--) {
      const B = beams[i], u = (clock - B.t0) / B.life;
      if (u >= 1) { scene.remove(B.beam); scene.remove(B.ring); B.beam.material.dispose(); B.ring.material.dispose(); beams.splice(i, 1); continue; }
      B.beam.material.opacity = Math.sin(Math.PI * Math.min(1, u * 1.3)) * (0.5 + B.rank * 0.1);
      B.beam.scale.set(1 + u * 0.4, 0.4 + easeOut(Math.min(1, u * 2)) * 0.8, 1 + u * 0.4);
      B.beam.position.y = 2.1 * B.beam.scale.y;
      const rs = 0.5 + easeOut(u) * (1.2 + B.rank * 0.3);
      B.ring.scale.set(rs, rs, rs); B.ring.material.opacity = 0.9 * (1 - u);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i], u = sp.userData, age = clock - u.t0;
      if (age > u.life) { scene.remove(sp); sp.material.dispose(); sparks.splice(i, 1); continue; }
      u.v.y -= 4.5 * dt; sp.position.addScaledVector(u.v, dt);
      sp.material.opacity = 1 - age / u.life;
    }
    if (attract && baseCam) {
      attractT += dt;
      const a = Math.sin(attractT * 0.12) * 0.32;
      const d = baseCam.d * 0.92;
      camera.position.set(baseCam.target.x + Math.sin(a) * d * Math.cos(0.9), baseCam.target.y + Math.sin(0.9) * d, baseCam.target.z + Math.cos(a) * d * Math.cos(0.9));
      camera.lookAt(baseCam.target);
    }
    if (shake > 0.001 && baseCam && !attract) {
      const k = shake * shake;
      camera.position.copy(baseCam.pos).add(new T.Vector3((Math.random() - 0.5) * k * 1.6, (Math.random() - 0.5) * k * 1.2, 0));
      shake = Math.max(0, shake - dt * 0.9);
      if (shake <= 0.001) camera.position.copy(baseCam.pos);
    }
    renderer.render(scene, camera);
    if (onFrame) onFrame();
    requestAnimationFrame(frame);
  }
  function handLift(o) { return (o.baseY != null ? o.baseY : LY.hand.y) + (o.lift || 0) * LY.hand.sc; }
  requestAnimationFrame(frame);

  function setFelt(name) {
    feltName = FELTS[name] ? name : 'green';
    redrawFelt();
  }
  function refreshFonts() {
    drawAtlas(atlasCanvas); atlas.needsUpdate = true; grayDirty = true;
    if (cards.some((o) => o.gray)) ensureGray();
    flags.forEach((F, f) => {
      F.cv.forEach((t, s) => { t.image = drawPennant(f, s - 1); t.needsUpdate = true; });
      F.tcv.forEach((t, s) => { t.image = drawToken(f, s - 1); t.needsUpdate = true; });
    });
  }
  function setAttract(on) {
    attract = !!on; attractT = 0;
    if (!on && baseCam) { camera.position.copy(baseCam.pos); camera.lookAt(baseCam.target); }
  }
  function clear() {
    view = null; setFocus(-1);
    cards.forEach((o) => { o.shown = false; o.g.visible = false; o.anim = null; o.place = null; });
    oppBacks.forEach(dropGeneric); oppBacks = [];
    flags.forEach((F) => {
      F.state = -1; F.pm.map = F.cv[0]; F.pm.needsUpdate = true; F.topMat.map = F.tcv[0]; F.topMat.needsUpdate = true; F.rimMat.color.copy(rimCol[2]);
      F.g.position.set(F.g.position.x, 0, 0); F.g.rotation.y = 0; F.owner.visible = false; F.anim = null; F.hit.scale.y = 1;
      F.twinkles.forEach((sp) => { sp.visible = false; }); F.topMat.emissiveIntensity = 0;
    });
    washes.forEach((W) => { W.a = W.want = 0; W.m.visible = false; });
    cards.forEach((o) => { o.gray = false; });
    weather.forEach((W) => { W.fog = W.fogT = 0; W.mudV = W.mudT = 0; });
    for (const k of ['T', 'X']) { decks[k].n = 0; decks[k].h = 0; }
    setHighlights({});
  }

  return {
    setView, setHighlights, setFocus, formationFx, pick, resize, anchors, flagAnchor, screenOf, setFelt, setQuality, refreshFonts, setAttract, clear,
    set speed(v) { speed = v; }, get speed() { return speed; },
    get mode() { return mode; },
    get busy() { return clock < busyUntil || cards.some((o) => o.anim) || oppBacks.some((o) => o.anim); },
    wait: (s) => new Promise((r) => setTimeout(r, (s * 1000) / speed)),
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
