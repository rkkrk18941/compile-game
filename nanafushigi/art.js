/* ナナフシギ・デュエル — every picture in the game is drawn here on canvases: cards, card backs, the twelve wonders,
   progress tokens and the small icons the HTML uses. No image files. The same canvases become three.js textures
   and, through toDataURL, <img> sources. */
const E = window.NFD_ENG;

export const TYPE_COL = {
  brown: ['#a8703a', '#6b4320'], grey: ['#a4a8ae', '#5c6066'], blue: ['#3f86d0', '#1d4a86'], green: ['#3aa462', '#1b5f35'],
  red: ['#d8483c', '#7f1f19'], yellow: ['#f0c039', '#9a6a0c'], purple: ['#9a63d4', '#4d2a7a']
};
export const SEAT_COL = ['#f3c45a', '#5fc6ff'];
export const FONT_JP = '"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif';
export const FONT_MIN = '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
export const FONT_LAT = '"Cinzel","Trajan Pro","Times New Roman",serif';
const CHAIN_EMOJI = { mask: '🎭', moon: '🌙', drop: '💧', book: '📖', gear: '⚙️', horseshoe: '🐎', sword: '🗡️', tower: '🏰', vase: '🏺',
  pillar: '🏛️', sun: '☀️', bank: '📜', harp: '🎵', lamp: '🪔', target: '🎯', helmet: '⛑️', barrel: '🛢️' };
export const TOKEN_EMOJI = ['🌾', '📐', '💰', '⚖️', '🧱', '🔢', '🦉', '⚔️', '🕊️', '🏙️'];
export function chainEmoji(k) { return CHAIN_EMOJI[k] || '🔗'; }

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}

/* ================================================================== icons (drawn centred in a box of size s) */
function glow(x, col, blur) { x.shadowColor = col; x.shadowBlur = blur; x.shadowOffsetY = blur * 0.15; }
function noGlow(x) { x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; }
export function drawRes(x, k, cx, cy, s) {
  x.save(); x.translate(cx, cy); const u = s / 100;
  glow(x, 'rgba(0,0,0,.55)', 6 * u);
  x.lineWidth = 5 * u; x.strokeStyle = '#fff8e8';
  if (k === 'W') {
    for (let i = 0; i < 2; i++) {
      x.save(); x.translate(0, (i ? 16 : -16) * u); x.rotate(-0.12);
      rr(x, -40 * u, -15 * u, 80 * u, 30 * u, 14 * u); x.fillStyle = i ? '#7a4a22' : '#93592a'; x.fill(); x.stroke();
      noGlow(x);
      x.beginPath(); x.ellipse(32 * u, 0, 9 * u, 13 * u, 0, 0, 7); x.fillStyle = '#e8b87a'; x.fill();
      x.beginPath(); x.ellipse(32 * u, 0, 4 * u, 6 * u, 0, 0, 7); x.strokeStyle = '#9a5f2a'; x.lineWidth = 2 * u; x.stroke();
      x.strokeStyle = 'rgba(40,20,5,.45)'; x.lineWidth = 2 * u; x.beginPath(); x.moveTo(-30 * u, -5 * u); x.lineTo(14 * u, -5 * u); x.moveTo(-24 * u, 5 * u); x.lineTo(20 * u, 5 * u); x.stroke();
      x.restore(); x.strokeStyle = '#fff8e8'; x.lineWidth = 5 * u; glow(x, 'rgba(0,0,0,.55)', 6 * u);
    }
  } else if (k === 'C') {
    x.save(); x.rotate(-0.08);
    rr(x, -42 * u, -26 * u, 84 * u, 52 * u, 6 * u); x.fillStyle = '#c55a2a'; x.fill(); x.stroke(); noGlow(x);
    x.strokeStyle = 'rgba(255,220,190,.75)'; x.lineWidth = 3 * u; x.beginPath();
    x.moveTo(-42 * u, 0); x.lineTo(42 * u, 0); x.moveTo(-8 * u, -26 * u); x.lineTo(-8 * u, 0); x.moveTo(16 * u, 0); x.lineTo(16 * u, 26 * u); x.moveTo(-28 * u, 0); x.lineTo(-28 * u, 26 * u); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(-40 * u, -24 * u, 80 * u, 8 * u);
    x.restore();
  } else if (k === 'S') {
    x.beginPath(); x.moveTo(-44 * u, 22 * u); x.lineTo(-34 * u, -18 * u); x.lineTo(-6 * u, -34 * u); x.lineTo(30 * u, -26 * u); x.lineTo(44 * u, 6 * u); x.lineTo(30 * u, 30 * u); x.lineTo(-20 * u, 32 * u); x.closePath();
    x.fillStyle = '#8f969e'; x.fill(); x.stroke(); noGlow(x);
    x.fillStyle = '#b8bfc6'; x.beginPath(); x.moveTo(-34 * u, -18 * u); x.lineTo(-6 * u, -34 * u); x.lineTo(30 * u, -26 * u); x.lineTo(4 * u, -6 * u); x.closePath(); x.fill();
    x.fillStyle = '#6c737a'; x.beginPath(); x.moveTo(4 * u, -6 * u); x.lineTo(44 * u, 6 * u); x.lineTo(30 * u, 30 * u); x.lineTo(-2 * u, 20 * u); x.closePath(); x.fill();
  } else if (k === 'G') {
    x.beginPath(); x.moveTo(0, -44 * u); x.lineTo(34 * u, -8 * u); x.lineTo(0, 44 * u); x.lineTo(-34 * u, -8 * u); x.closePath();
    const g = x.createLinearGradient(-30 * u, -40 * u, 30 * u, 40 * u); g.addColorStop(0, '#c9f6ff'); g.addColorStop(0.5, '#37b6d6'); g.addColorStop(1, '#1b6f96');
    x.fillStyle = g; x.fill(); x.stroke(); noGlow(x);
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2.5 * u; x.beginPath(); x.moveTo(-34 * u, -8 * u); x.lineTo(34 * u, -8 * u); x.moveTo(-12 * u, -8 * u); x.lineTo(0, 44 * u); x.lineTo(12 * u, -8 * u); x.moveTo(-12 * u, -8 * u); x.lineTo(0, -44 * u); x.lineTo(12 * u, -8 * u); x.stroke();
  } else if (k === 'P') {
    rr(x, -30 * u, -36 * u, 60 * u, 72 * u, 4 * u); x.fillStyle = '#ecdcab'; x.fill(); x.stroke(); noGlow(x);
    x.fillStyle = '#c9b071'; rr(x, -38 * u, -42 * u, 76 * u, 14 * u, 7 * u); x.fill(); rr(x, -38 * u, 28 * u, 76 * u, 14 * u, 7 * u); x.fill();
    x.strokeStyle = 'rgba(110,80,30,.6)'; x.lineWidth = 3 * u; x.beginPath();
    for (let i = 0; i < 4; i++) { x.moveTo(-20 * u, (-18 + i * 12) * u); x.lineTo((i === 3 ? 6 : 20) * u, (-18 + i * 12) * u); }
    x.stroke();
  }
  x.restore();
}
export function drawCoin(x, n, cx, cy, s) {
  x.save(); x.translate(cx, cy); const r = s * 0.44;
  glow(x, 'rgba(0,0,0,.5)', s * 0.08);
  const g = x.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fff2b0'); g.addColorStop(0.45, '#f2c339'); g.addColorStop(1, '#a8740c');
  x.beginPath(); x.arc(0, 0, r, 0, 7); x.fillStyle = g; x.fill(); noGlow(x);
  x.lineWidth = s * 0.05; x.strokeStyle = '#7a4f05'; x.stroke();
  x.beginPath(); x.arc(0, 0, r * 0.78, 0, 7); x.strokeStyle = 'rgba(122,79,5,.55)'; x.lineWidth = s * 0.03; x.stroke();
  if (n != null) { x.fillStyle = '#4a2c02'; x.font = '900 ' + Math.round(s * (String(n).length > 1 ? 0.46 : 0.56)) + 'px ' + FONT_LAT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 0, s * 0.04); }
  x.restore();
}
export function drawShield(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); const u = s / 100;
  glow(x, 'rgba(0,0,0,.5)', 6 * u);
  x.beginPath(); x.moveTo(0, -42 * u); x.bezierCurveTo(22 * u, -32 * u, 34 * u, -34 * u, 38 * u, -36 * u); x.bezierCurveTo(40 * u, 4 * u, 30 * u, 28 * u, 0, 44 * u); x.bezierCurveTo(-30 * u, 28 * u, -40 * u, 4 * u, -38 * u, -36 * u); x.bezierCurveTo(-34 * u, -34 * u, -22 * u, -32 * u, 0, -42 * u); x.closePath();
  const g = x.createLinearGradient(0, -40 * u, 0, 44 * u); g.addColorStop(0, '#ff6d5c'); g.addColorStop(1, '#a51d14');
  x.fillStyle = g; x.fill(); noGlow(x); x.lineWidth = 5 * u; x.strokeStyle = '#fff1dc'; x.stroke();
  x.strokeStyle = 'rgba(255,230,200,.8)'; x.lineWidth = 4 * u; x.beginPath(); x.moveTo(0, -30 * u); x.lineTo(0, 30 * u); x.moveTo(-22 * u, -10 * u); x.lineTo(22 * u, -10 * u); x.stroke();
  x.restore();
}
export function drawVP(x, n, cx, cy, s, tint) {
  x.save(); x.translate(cx, cy); const r = s * 0.42;
  glow(x, 'rgba(0,0,0,.5)', s * 0.08);
  x.beginPath(); x.arc(0, 0, r, 0, 7); x.fillStyle = tint || '#1b3f8f'; x.fill(); noGlow(x);
  x.lineWidth = s * 0.05; x.strokeStyle = '#f6d77a'; x.stroke();
  // laurel
  x.fillStyle = '#f6d77a';
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + side * (0.55 + i * 0.36), px = Math.cos(a) * r * 0.86, py = Math.sin(a) * r * 0.86;
    x.save(); x.translate(px, py); x.rotate(a + side * 0.9); x.beginPath(); x.ellipse(0, 0, s * 0.07, s * 0.03, 0, 0, 7); x.fill(); x.restore();
  }
  x.fillStyle = '#fff'; x.font = '900 ' + Math.round(s * (String(n).length > 1 ? 0.4 : 0.48)) + 'px ' + FONT_LAT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 0, s * 0.03);
  x.restore();
}
export function drawSci(x, sym, cx, cy, s, plain) {
  x.save(); x.translate(cx, cy); const u = s / 100;
  if (!plain) {
    glow(x, 'rgba(0,0,0,.5)', 6 * u);
    x.beginPath(); x.arc(0, 0, 46 * u, 0, 7);
    const g = x.createRadialGradient(-10 * u, -14 * u, 4 * u, 0, 0, 46 * u); g.addColorStop(0, '#2c7f4a'); g.addColorStop(1, '#0d3a1f');
    x.fillStyle = g; x.fill(); noGlow(x); x.lineWidth = 4 * u; x.strokeStyle = '#e9d27a'; x.stroke();
  }
  x.strokeStyle = '#fff6dc'; x.fillStyle = '#fff6dc'; x.lineWidth = 5 * u; x.lineCap = 'round'; x.lineJoin = 'round';
  const L = (a, b, c, d) => { x.beginPath(); x.moveTo(a * u, b * u); x.lineTo(c * u, d * u); x.stroke(); };
  switch (sym) {
    case 'globe':
      x.beginPath(); x.arc(0, -2 * u, 26 * u, 0, 7); x.stroke();
      x.beginPath(); x.ellipse(0, -2 * u, 11 * u, 26 * u, 0, 0, 7); x.stroke();
      L(-26, -2, 26, -2); L(-22, -15, 22, -15); L(-22, 11, 22, 11); L(-14, 32, 14, 32); L(0, 24, 0, 32);
      break;
    case 'wheel':
      x.beginPath(); x.arc(0, 0, 28 * u, 0, 7); x.lineWidth = 7 * u; x.stroke(); x.lineWidth = 4 * u;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * 26, Math.sin(a) * 26); }
      x.beginPath(); x.arc(0, 0, 7 * u, 0, 7); x.fill();
      break;
    case 'sundial':
      x.beginPath(); x.arc(0, 12 * u, 30 * u, Math.PI, 0); x.closePath(); x.stroke();
      for (let i = 1; i < 6; i++) { const a = Math.PI + i * Math.PI / 6; L(Math.cos(a) * 8, 12 + Math.sin(a) * 8, Math.cos(a) * 26, 12 + Math.sin(a) * 26); }
      x.beginPath(); x.moveTo(-2 * u, 12 * u); x.lineTo(-2 * u, -24 * u); x.lineTo(16 * u, 12 * u); x.closePath(); x.fill();
      L(-34, 20, 34, 20);
      break;
    case 'mortar':
      x.beginPath(); x.moveTo(-28 * u, 0); x.quadraticCurveTo(-26 * u, 30 * u, 0, 30 * u); x.quadraticCurveTo(26 * u, 30 * u, 28 * u, 0); x.closePath(); x.fill();
      L(-14, 34, 14, 34);
      x.save(); x.rotate(-0.6); rr(x, -5 * u, -40 * u, 10 * u, 40 * u, 5 * u); x.fill(); x.restore();
      break;
    case 'compass':
      x.beginPath(); x.arc(0, -28 * u, 6 * u, 0, 7); x.fill();
      L(0, -28, -20, 30); L(0, -28, 20, 30);
      x.beginPath(); x.arc(0, -28 * u, 40 * u, Math.PI * 0.33, Math.PI * 0.67); x.stroke();
      break;
    case 'quill':
      x.beginPath(); x.moveTo(24 * u, -34 * u); x.quadraticCurveTo(-8 * u, -26 * u, -18 * u, 24 * u); x.quadraticCurveTo(10 * u, 4 * u, 24 * u, -34 * u); x.fill();
      L(-18, 24, -26, 36);
      x.strokeStyle = 'rgba(13,58,31,.8)'; x.lineWidth = 2 * u; L(16, -24, -12, 18);
      break;
    case 'law':
      L(0, -30, 0, 30); L(-16, 30, 16, 30); L(-28, -18, 28, -18);
      x.beginPath(); x.arc(-22 * u, 2 * u, 12 * u, 0, Math.PI); x.fill(); x.beginPath(); x.arc(22 * u, 2 * u, 12 * u, 0, Math.PI); x.fill();
      x.lineWidth = 2 * u; L(-28, -18, -32, 2); L(-28, -18, -12, 2); L(28, -18, 12, 2); L(28, -18, 32, 2);
      break;
  }
  x.restore();
}
function drawMiniCard(x, type, cx, cy, s) {
  x.save(); x.translate(cx, cy);
  glow(x, 'rgba(0,0,0,.5)', s * 0.08);
  rr(x, -s * 0.28, -s * 0.4, s * 0.56, s * 0.8, s * 0.08);
  const c = TYPE_COL[type] || ['#888', '#444'];
  x.fillStyle = c[0]; x.fill(); noGlow(x); x.lineWidth = s * 0.06; x.strokeStyle = '#fff8e8'; x.stroke();
  x.restore();
}
function drawWonderGlyph(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); const u = s / 100;
  glow(x, 'rgba(0,0,0,.5)', 6 * u);
  x.beginPath(); x.moveTo(-40 * u, 30 * u); x.lineTo(0, -34 * u); x.lineTo(40 * u, 30 * u); x.closePath();
  x.fillStyle = '#e9c45a'; x.fill(); noGlow(x); x.lineWidth = 4 * u; x.strokeStyle = '#fff8e8'; x.stroke();
  x.strokeStyle = 'rgba(120,80,10,.7)'; x.lineWidth = 3 * u; x.beginPath(); x.moveTo(-20 * u, 0); x.lineTo(20 * u, 0); x.moveTo(-30 * u, 15 * u); x.lineTo(30 * u, 15 * u); x.stroke();
  x.restore();
}
function drawAgain(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); const u = s / 100;
  glow(x, 'rgba(0,0,0,.5)', 6 * u);
  x.beginPath(); x.arc(0, 0, 40 * u, 0, 7); x.fillStyle = '#2b2116'; x.fill(); noGlow(x);
  x.lineWidth = 4 * u; x.strokeStyle = '#f6d77a'; x.stroke();
  x.lineWidth = 8 * u; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, 22 * u, -2.6, 1.6); x.stroke();
  x.beginPath(); x.moveTo(-2 * u, 30 * u); x.lineTo(-16 * u, 22 * u); x.lineTo(-2 * u, 12 * u); x.fillStyle = '#f6d77a'; x.fill();
  x.restore();
}
function drawText(x, t, cx, cy, s, col) {
  x.save(); x.fillStyle = col || '#fff8e8'; x.font = '900 ' + Math.round(s * 0.5) + 'px ' + FONT_LAT; x.textAlign = 'center'; x.textBaseline = 'middle';
  glow(x, 'rgba(0,0,0,.6)', 4); x.fillText(t, cx, cy); x.restore();
}
/* a row of glyphs centred at (cx, cy); items: {k:'res'|'coin'|'shield'|'vp'|'sci'|'card'|'wonder'|'again'|'text', v, s(scale)} */
export function glyphRow(x, items, cx, cy, size, maxW) {
  const ws = items.map((it) => (it.k === 'text' ? size * 0.42 * (it.w || 1) : size * (it.s || 1) * (it.k === 'res' ? 0.92 : 0.96)));
  let total = ws.reduce((a, b) => a + b, 0);
  let sc = maxW && total > maxW ? maxW / total : 1;
  let xx = cx - (total * sc) / 2;
  items.forEach((it, i) => {
    const w = ws[i] * sc, c = xx + w / 2, s = size * (it.s || 1) * sc;
    switch (it.k) {
      case 'res': drawRes(x, it.v, c, cy, s); break;
      case 'coin': drawCoin(x, it.v, c, cy, s); break;
      case 'shield': drawShield(x, c, cy, s); break;
      case 'vp': drawVP(x, it.v, c, cy, s, it.tint); break;
      case 'sci': drawSci(x, it.v, c, cy, s); break;
      case 'card': drawMiniCard(x, it.v, c, cy, s); break;
      case 'wonder': drawWonderGlyph(x, c, cy, s); break;
      case 'again': drawAgain(x, c, cy, s); break;
      case 'text': drawText(x, it.v, c, cy, size * sc, it.col); break;
    }
    xx += w;
  });
}
/* the effect of a card as glyphs */
export function effectGlyphs(d) {
  const g = [];
  if (d.prod) for (const k of d.prod) g.push({ k: 'res', v: k });
  if (d.choice) d.choice.split('').forEach((k, i) => { if (i) g.push({ k: 'text', v: '/', w: 0.9 }); g.push({ k: 'res', v: k, s: 0.75 }); });
  if (d.trade) d.trade.split('').forEach((k, i) => { if (i) g.push({ k: 'text', v: '', w: 0.4 }); g.push({ k: 'res', v: k, s: 0.75 }); g.push({ k: 'coin', v: 1, s: 0.55 }); });
  if (d.sh) for (let i = 0; i < d.sh; i++) g.push({ k: 'shield' });
  if (d.sci) g.push({ k: 'sci', v: d.sci, s: 1.05 });
  if (d.gain) g.push({ k: 'coin', v: d.gain, s: 1.05 });
  if (d.per) { g.push(d.per === 'wonder' ? { k: 'wonder', s: 0.7 } : { k: 'card', v: d.per, s: 0.7 }); g.push({ k: 'text', v: ':', w: 0.6 }); g.push({ k: 'coin', v: d.each, s: 0.7 }); }
  if (d.guild) {
    const m = { yellow: ['card', 'yellow'], blue: ['card', 'blue'], green: ['card', 'green'], red: ['card', 'red'], wonder: ['wonder'], money: ['coin', 3] }[d.guild];
    if (d.guild === 'raw') { g.push({ k: 'card', v: 'brown', s: 0.62 }); g.push({ k: 'card', v: 'grey', s: 0.62 }); }
    else g.push({ k: m[0], v: m[1], s: 0.7 });
    g.push({ k: 'text', v: '→', w: 0.9 });
    if (d.guild !== 'wonder' && d.guild !== 'money') g.push({ k: 'coin', v: 1, s: 0.6 });
    g.push({ k: 'vp', v: d.guild === 'wonder' ? 2 : 1, s: 0.66, tint: '#4d2a7a' });
  }
  if (d.vp && d.type !== 'purple') g.push({ k: 'vp', v: d.vp, s: d.type === 'blue' ? 1.1 : 0.7, tint: d.type === 'blue' ? '#1d4a86' : d.type === 'green' ? '#14532d' : '#6b4a06' });
  return g;
}
export function wonderGlyphs(w) {
  const W = E.WONDERS[w], g = [];
  if (W.gain) g.push({ k: 'coin', v: W.gain });
  if (W.steal) { g.push({ k: 'text', v: '−', w: 0.7 }); g.push({ k: 'coin', v: W.steal, s: 0.8 }); }
  if (W.sh) for (let i = 0; i < W.sh; i++) g.push({ k: 'shield' });
  if (W.destroy) { g.push({ k: 'text', v: '✕', w: 0.8, col: '#ff8a7a' }); g.push({ k: 'card', v: W.destroy }); }
  if (W.library) g.push({ k: 'text', v: '◎×3', w: 2.2 });
  if (W.mausoleum) { g.push({ k: 'card', v: 'grey', s: 0.8 }); g.push({ k: 'text', v: '↻', w: 0.9 }); }
  if (W.choice) W.choice.split('').forEach((k, i) => { if (i) g.push({ k: 'text', v: '/', w: 0.8 }); g.push({ k: 'res', v: k, s: 0.72 }); });
  if (W.again) g.push({ k: 'again' });
  if (W.vp) g.push({ k: 'vp', v: W.vp, tint: '#6b4a06' });
  return g;
}
function costGlyphs(cost, coins) {
  const g = [];
  if (coins) g.push({ k: 'coin', v: coins });
  for (const k of cost) g.push({ k: 'res', v: k });
  return g;
}

/* ================================================================== cards (300 × 450) */
export const CARD_W = 300, CARD_H = 450;
const cardCache = new Map();
export function cardCanvas(id) {
  if (cardCache.has(id)) return cardCache.get(id);
  const d = E.CARDS[id], c = canvas(CARD_W, CARD_H), x = c.getContext('2d'), col = TYPE_COL[d.type];
  const W = CARD_W, H = CARD_H;
  // frame
  rr(x, 0, 0, W, H, 22); x.fillStyle = '#17120c'; x.fill();
  rr(x, 6, 6, W - 12, H - 12, 17); x.save(); x.clip();
  // parchment body
  const pg = x.createLinearGradient(0, 0, 0, H); pg.addColorStop(0, '#f3e6c4'); pg.addColorStop(1, '#d9c294');
  x.fillStyle = pg; x.fillRect(0, 0, W, H);
  const h = hash(id + 7);
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(120,90,40,' + (0.03 + hash(id * 31 + i) * 0.04) + ')'; x.beginPath(); x.arc(hash(i * 13 + id) * W, 200 + hash(i * 7 + id * 3) * 250, 6 + hash(i + id) * 26, 0, 7); x.fill(); }
  // art
  drawCardArt(x, d, h, 0, 196, W, 214);
  // header
  const hg = x.createLinearGradient(0, 0, 0, 196); hg.addColorStop(0, shade(col[0], 0.18)); hg.addColorStop(0.6, col[0]); hg.addColorStop(1, col[1]);
  x.fillStyle = hg; x.fillRect(0, 0, W, 196);
  x.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(i * 40, 0); x.lineTo(i * 40 + 18, 0); x.lineTo(i * 40 + 18 - 120, 196); x.lineTo(i * 40 - 120, 196); x.fill(); }
  // cost strip
  x.fillStyle = 'rgba(10,8,5,.42)'; x.fillRect(0, 0, W, 54);
  const cg = costGlyphs(d.cost, d.$);
  if (cg.length) glyphRow(x, cg, 22 + cg.length * 18, 28, 40, 220); else { x.fillStyle = 'rgba(255,248,232,.7)'; x.font = '700 22px ' + FONT_JP; x.textBaseline = 'middle'; x.fillText('無料', 18, 29); }
  if (d.to) { x.beginPath(); x.arc(W - 30, 28, 21, 0, 7); x.fillStyle = '#fff6df'; x.fill(); x.lineWidth = 3; x.strokeStyle = col[1]; x.stroke(); x.font = '24px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(chainEmoji(d.to), W - 30, 30); x.textAlign = 'left'; }
  // effect
  glyphRow(x, effectGlyphs(d), W / 2, 112, 74, W - 30);
  // name band
  const ng = x.createLinearGradient(0, 154, 0, 200); ng.addColorStop(0, '#1d150d'); ng.addColorStop(1, '#2e2215');
  x.fillStyle = ng; x.fillRect(0, 156, W, 44);
  x.fillStyle = '#d9b75a'; x.fillRect(0, 155, W, 2); x.fillRect(0, 199, W, 2);
  x.fillStyle = '#fff4d6'; x.font = '700 ' + (d.name.length > 7 ? 22 : 25) + 'px ' + FONT_JP; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(d.name, W / 2, 179);
  // chain-from hint and age
  if (d.from) {
    x.fillStyle = 'rgba(30,20,10,.78)'; rr(x, 14, H - 54, 150, 38, 19); x.fill();
    x.font = '22px sans-serif'; x.textAlign = 'left'; x.fillText(chainEmoji(d.from), 24, H - 34);
    x.fillStyle = '#ffe9a8'; x.font = '700 17px ' + FONT_JP; x.fillText('があれば無料', 54, H - 34);
  }
  x.fillStyle = 'rgba(40,25,10,.55)'; x.font = '700 26px ' + FONT_LAT; x.textAlign = 'right'; x.fillText(d.age === 4 ? 'G' : ['I', 'II', 'III'][d.age - 1], W - 18, H - 32);
  x.restore();
  // gilt edge
  rr(x, 6, 6, W - 12, H - 12, 17); x.lineWidth = 3; x.strokeStyle = '#c9a24a'; x.stroke();
  rr(x, 2, 2, W - 4, H - 4, 20); x.lineWidth = 2; x.strokeStyle = 'rgba(255,230,160,.35)'; x.stroke();
  cardCache.set(id, c);
  return c;
}
function drawCardArt(x, d, h, X, Y, W, H) {
  x.save(); x.translate(X, Y); x.beginPath(); x.rect(0, 0, W, H); x.clip();
  const col = TYPE_COL[d.type];
  // sky / wall wash
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade(col[0], 0.55)); g.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = g; x.globalAlpha = 0.55; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
  // a sun or a moon
  x.fillStyle = 'rgba(255,240,190,.55)'; x.beginPath(); x.arc(40 + h * (W - 80), 46, 18 + h * 10, 0, 7); x.fill();
  // ground
  x.fillStyle = shade(col[1], 0.35); x.globalAlpha = 0.35;
  x.beginPath(); x.moveTo(0, H * 0.78); for (let i = 0; i <= 6; i++) x.lineTo(i * W / 6, H * (0.72 + 0.08 * hash(i * 17 + d.id))); x.lineTo(W, H); x.lineTo(0, H); x.fill(); x.globalAlpha = 1;
  const cx = W / 2, cy = H * 0.5;
  switch (d.type) {
    case 'brown': case 'grey': {
      const k = d.prod[0];
      if (d.prod.length > 1) { drawRes(x, k, cx - 42, cy + 6, 96); drawRes(x, k, cx + 42, cy - 6, 96); } else drawRes(x, k, cx, cy, 120);
      break;
    }
    case 'blue': temple(x, cx, cy + 20, 150 + (d.vp || 3) * 6, d.vp || 3, col); break;
    case 'green': drawSci(x, d.sci, cx, cy, 128); stars(x, W, H, d.id); break;
    case 'red': spears(x, cx, cy, 130); drawShield(x, cx, cy + 6, 96); break;
    case 'yellow': amphora(x, cx, cy, 140, d.id); break;
    case 'purple': crest(x, cx, cy, 140, d); break;
  }
  x.restore();
}
function temple(x, cx, by, w, cols, col) {
  const n = Math.max(4, Math.min(8, cols + 1)), h = w * 0.62;
  x.save(); x.translate(cx, by);
  x.fillStyle = 'rgba(30,40,70,.18)'; x.fillRect(-w / 2 - 10, h * 0.25, w + 20, 16);
  x.fillStyle = '#f7f0df'; x.strokeStyle = shade(col[1], -0.1); x.lineWidth = 3;
  x.fillRect(-w / 2 - 8, h * 0.18, w + 16, 10); x.strokeRect(-w / 2 - 8, h * 0.18, w + 16, 10);
  x.fillRect(-w / 2, h * 0.1, w, 10); x.strokeRect(-w / 2, h * 0.1, w, 10);
  for (let i = 0; i < n; i++) { const xx = -w / 2 + 8 + i * (w - 16) / (n - 1); x.fillRect(xx - 6, -h * 0.42, 12, h * 0.52); x.strokeRect(xx - 6, -h * 0.42, 12, h * 0.52); }
  x.fillRect(-w / 2 - 4, -h * 0.5, w + 8, 12); x.strokeRect(-w / 2 - 4, -h * 0.5, w + 8, 12);
  x.beginPath(); x.moveTo(-w / 2 - 8, -h * 0.5); x.lineTo(0, -h * 0.82); x.lineTo(w / 2 + 8, -h * 0.5); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = col[0]; x.beginPath(); x.moveTo(-w / 2 + 20, -h * 0.53); x.lineTo(0, -h * 0.76); x.lineTo(w / 2 - 20, -h * 0.53); x.closePath(); x.globalAlpha = 0.5; x.fill(); x.globalAlpha = 1;
  x.restore();
}
function stars(x, W, H, id) {
  x.fillStyle = 'rgba(255,250,220,.8)';
  for (let i = 0; i < 9; i++) { const sx = hash(id * 5 + i) * W, sy = hash(id * 9 + i * 3) * H * 0.6; x.beginPath(); x.arc(sx, sy, 1.5 + hash(i) * 2, 0, 7); x.fill(); }
}
function spears(x, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.strokeStyle = '#5a3b1d'; x.lineWidth = 7; x.lineCap = 'round';
  for (const a of [-0.75, 0.75]) {
    x.save(); x.rotate(a); x.beginPath(); x.moveTo(0, s * 0.62); x.lineTo(0, -s * 0.5); x.stroke();
    x.fillStyle = '#c9ccd2'; x.beginPath(); x.moveTo(0, -s * 0.72); x.lineTo(10, -s * 0.48); x.lineTo(-10, -s * 0.48); x.closePath(); x.fill(); x.restore();
  }
  x.restore();
}
function amphora(x, cx, cy, s, id) {
  x.save(); x.translate(cx - 30, cy);
  x.fillStyle = '#b8642d'; x.strokeStyle = '#4a2410'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(-14, -s * 0.42); x.lineTo(14, -s * 0.42); x.quadraticCurveTo(12, -s * 0.3, 30, -s * 0.12); x.quadraticCurveTo(46, s * 0.15, 0, s * 0.45); x.quadraticCurveTo(-46, s * 0.15, -30, -s * 0.12); x.quadraticCurveTo(-12, -s * 0.3, -14, -s * 0.42); x.fill(); x.stroke();
  x.fillStyle = '#1d140c'; x.fillRect(-28, -s * 0.06, 56, 8); x.fillRect(-22, s * 0.1, 44, 5);
  x.restore();
  for (let i = 0; i < 5; i++) drawCoin(x, null, cx + 40 + (i % 2) * 14, cy + 40 - i * 13, 44);
}
function crest(x, cx, cy, s, d) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = '#4d2a7a'; x.strokeStyle = '#e8c96a'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(-s * 0.4, -s * 0.48); x.lineTo(s * 0.4, -s * 0.48); x.lineTo(s * 0.4, s * 0.2); x.lineTo(0, s * 0.5); x.lineTo(-s * 0.4, s * 0.2); x.closePath(); x.fill(); x.stroke();
  x.restore();
  const m = { yellow: { k: 'card', v: 'yellow' }, blue: { k: 'card', v: 'blue' }, green: { k: 'card', v: 'green' }, red: { k: 'card', v: 'red' }, wonder: { k: 'wonder' }, money: { k: 'coin', v: 3 }, raw: { k: 'card', v: 'brown' } }[d.guild];
  glyphRow(x, [m], cx, cy - 6, 70);
}

/* card backs */
const backCache = new Map();
export function backCanvas(kind) {
  if (backCache.has(kind)) return backCache.get(kind);
  const c = canvas(CARD_W, CARD_H), x = c.getContext('2d'), W = CARD_W, H = CARD_H;
  const pal = { 1: ['#b27a33', '#5a3510'], 2: ['#3c6fb4', '#142c55'], 3: ['#a8435d', '#43122a'], guild: ['#8a56c6', '#2f1550'] }[kind];
  rr(x, 0, 0, W, H, 22); x.fillStyle = '#120d08'; x.fill();
  rr(x, 6, 6, W - 12, H - 12, 17); x.save(); x.clip();
  const g = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.7); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H / 2);
  for (let i = 0; i < 36; i++) { x.rotate(Math.PI / 18); x.fillStyle = i % 2 ? 'rgba(255,230,160,.07)' : 'rgba(0,0,0,.06)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(-30, -H); x.lineTo(30, -H); x.fill(); }
  x.restore();
  x.strokeStyle = 'rgba(240,210,130,.75)'; x.lineWidth = 3; rr(x, 22, 22, W - 44, H - 44, 12); x.stroke();
  x.lineWidth = 1.5; rr(x, 32, 32, W - 64, H - 64, 8); x.stroke();
  x.beginPath(); x.arc(W / 2, H / 2, 82, 0, 7); x.fillStyle = 'rgba(0,0,0,.28)'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#e8c96a'; x.stroke();
  x.fillStyle = '#f5dc8e'; x.textAlign = 'center'; x.textBaseline = 'middle';
  glow(x, 'rgba(255,200,80,.6)', 16);
  if (kind === 'guild') { x.font = '700 64px ' + FONT_MIN; x.fillText('組', W / 2, H / 2 + 4); }
  else { x.font = '700 ' + (kind === 3 ? 74 : 86) + 'px ' + FONT_LAT; x.fillText(['I', 'II', 'III'][kind - 1], W / 2, H / 2 + 6); }
  noGlow(x);
  x.font = '700 18px ' + FONT_JP; x.fillStyle = 'rgba(255,236,190,.8)'; x.fillText(kind === 'guild' ? 'ギルド' : '第' + ['一', '二', '三'][kind - 1] + '時代', W / 2, H / 2 + 118);
  x.restore();
  rr(x, 6, 6, W - 12, H - 12, 17); x.lineWidth = 3; x.strokeStyle = '#c9a24a'; x.stroke();
  backCache.set(kind, c);
  return c;
}

/* ================================================================== wonders (scene art + labels) */
const SKIES = {
  road: ['#f6a96b', '#6b3b6e'], circus: ['#ffcf7a', '#8a3b2a'], colossus: ['#7fc7e8', '#1e4f86'], library: ['#ffd9a0', '#5a3a6e'],
  lighthouse: ['#1d2b5a', '#060914'], gardens: ['#bfe6a8', '#2e6b5a'], mausoleum: ['#f3b38a', '#4a2a4f'], harbor: ['#9fd8f0', '#245f8f'],
  pyramids: ['#ffc56b', '#b5552a'], sphinx: ['#ffb36b', '#6b2a3b'], zeus: ['#e7d3a8', '#5b3b28'], artemis: ['#c9e3ff', '#5468a8']
};
const wonderCache = new Map();
export function wonderCanvas(w, Wd, Ht, plain) {
  const key = w + ':' + Wd + 'x' + Ht + (plain ? 'p' : '');
  if (wonderCache.has(key)) return wonderCache.get(key);
  const c = canvas(Wd, Ht), x = c.getContext('2d'), W = E.WONDERS[w], sky = SKIES[W.art], u = Wd / 480;
  rr(x, 0, 0, Wd, Ht, 18 * u); x.save(); x.clip();
  const g = x.createLinearGradient(0, 0, 0, Ht); g.addColorStop(0, sky[1]); g.addColorStop(0.75, sky[0]); g.addColorStop(1, sky[0]);
  x.fillStyle = g; x.fillRect(0, 0, Wd, Ht);
  // sun glow
  const sg = x.createRadialGradient(Wd * 0.72, Ht * 0.55, 4, Wd * 0.72, Ht * 0.55, Ht * 0.6); sg.addColorStop(0, 'rgba(255,245,200,.85)'); sg.addColorStop(1, 'rgba(255,245,200,0)');
  x.fillStyle = sg; x.fillRect(0, 0, Wd, Ht);
  if (W.art === 'lighthouse' || W.art === 'library') for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,255,240,' + (0.3 + hash(i * 3 + w) * 0.6) + ')'; x.beginPath(); x.arc(hash(i * 7 + w) * Wd, hash(i * 11 + w) * Ht * 0.6, (0.6 + hash(i) * 1.4) * u, 0, 7); x.fill(); }
  x.save(); x.scale(u, u);
  drawWonderArt(x, W.art);
  x.restore();
  if (!plain) {
    // bottom band
    const bg = x.createLinearGradient(0, Ht - 92 * u, 0, Ht); bg.addColorStop(0, 'rgba(10,8,5,0)'); bg.addColorStop(0.35, 'rgba(10,8,5,.78)'); bg.addColorStop(1, 'rgba(10,8,5,.92)');
    x.fillStyle = bg; x.fillRect(0, Ht - 92 * u, Wd, 92 * u);
    x.fillStyle = '#fff1c8'; x.font = '700 ' + Math.round(28 * u) + 'px ' + FONT_MIN; x.textAlign = 'left'; x.textBaseline = 'middle';
    glow(x, 'rgba(0,0,0,.8)', 6 * u); x.fillText(W.name, 16 * u, Ht - 58 * u); noGlow(x);
    glyphRow(x, wonderGlyphs(w), Wd - 16 * u - Math.min(250, wonderGlyphs(w).length * 46) * u / 2, Ht - 26 * u, 44 * u, 250 * u);
    // cost column
    x.fillStyle = 'rgba(10,8,5,.6)'; rr(x, 8 * u, 8 * u, 50 * u, (E.WONDERS[w].cost.length * 40 + 12) * u, 12 * u); x.fill();
    E.WONDERS[w].cost.split('').forEach((k, i) => drawRes(x, k, 33 * u, (30 + i * 40) * u, 38 * u));
  }
  x.restore();
  rr(x, 1.5 * u, 1.5 * u, Wd - 3 * u, Ht - 3 * u, 17 * u); x.lineWidth = 3 * u; x.strokeStyle = '#d4af5a'; x.stroke();
  wonderCache.set(key, c);
  return c;
}
function drawWonderArt(x, art) {
  // drawn in a 480 × 300 space
  const dark = '#2a1a12', mid = '#5b3a24', lit = '#e9c27a';
  const ground = (col, y) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(240, y - 14, 480, y + 4); x.lineTo(480, 300); x.lineTo(0, 300); x.fill(); };
  const rim = (f) => { x.save(); x.strokeStyle = 'rgba(255,220,150,.55)'; x.lineWidth = 2; f(); x.stroke(); x.restore(); };
  switch (art) {
    case 'pyramids': {
      ground('#c9893f', 236);
      [[300, 236, 150, 130], [150, 240, 110, 96], [410, 240, 70, 60]].forEach(([cx, by, hw, h]) => {
        x.fillStyle = '#d99a4c'; x.beginPath(); x.moveTo(cx - hw, by); x.lineTo(cx, by - h); x.lineTo(cx + hw, by); x.fill();
        x.fillStyle = '#9a5a26'; x.beginPath(); x.moveTo(cx, by - h); x.lineTo(cx + hw, by); x.lineTo(cx + hw * 0.25, by); x.fill();
        x.strokeStyle = 'rgba(90,50,20,.25)'; x.lineWidth = 1.5; for (let i = 1; i < 8; i++) { const yy = by - h * i / 8; x.beginPath(); x.moveTo(cx - hw * (1 - i / 8), yy); x.lineTo(cx + hw * (1 - i / 8), yy); x.stroke(); }
      });
      break;
    }
    case 'sphinx': {
      ground('#c27a3c', 240);
      x.fillStyle = '#d8964e';
      x.beginPath(); x.moveTo(110, 240); x.lineTo(130, 196); x.quadraticCurveTo(220, 170, 300, 186); x.lineTo(320, 150); x.quadraticCurveTo(330, 116, 356, 118); x.quadraticCurveTo(384, 122, 382, 160); x.lineTo(378, 204); x.lineTo(420, 214); x.lineTo(420, 240); x.fill();
      x.fillStyle = '#a0612c'; x.beginPath(); x.moveTo(326, 128); x.lineTo(316, 176); x.lineTo(340, 176); x.lineTo(346, 128); x.fill();
      x.beginPath(); x.moveTo(370, 128); x.lineTo(388, 176); x.lineTo(364, 176); x.fill();
      x.fillStyle = '#7a3f1a'; x.fillRect(150, 216, 160, 6);
      x.fillStyle = 'rgba(255,230,170,.5)'; x.beginPath(); x.arc(70, 120, 26, 0, 7); x.fill();
      break;
    }
    case 'colossus': {
      x.fillStyle = '#2d6aa0'; x.fillRect(0, 238, 480, 62);
      x.fillStyle = '#5a4630'; x.fillRect(150, 220, 70, 30); x.fillRect(270, 220, 70, 30);
      x.fillStyle = '#b8873c';
      x.beginPath(); x.moveTo(176, 222); x.lineTo(214, 120); x.lineTo(232, 120); x.lineTo(206, 222); x.fill();
      x.beginPath(); x.moveTo(306, 222); x.lineTo(258, 120); x.lineTo(276, 120); x.lineTo(312, 222); x.fill();
      x.fillRect(214, 70, 52, 58);
      x.beginPath(); x.arc(240, 54, 17, 0, 7); x.fill();
      x.beginPath(); x.moveTo(262, 80); x.lineTo(304, 26); x.lineTo(312, 32); x.lineTo(270, 92); x.fill();
      x.fillStyle = '#ffdd7a'; x.beginPath(); x.arc(310, 20, 9, 0, 7); x.fill();
      x.strokeStyle = '#ffdd7a'; x.lineWidth = 2; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.4; x.beginPath(); x.moveTo(240 + Math.cos(a) * 18, 54 + Math.sin(a) * 18); x.lineTo(240 + Math.cos(a) * 28, 54 + Math.sin(a) * 28); x.stroke(); }
      x.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 6; i++) x.fillRect(20 + i * 80, 254 + (i % 2) * 14, 40, 2);
      break;
    }
    case 'library': {
      ground('#3b2a3f', 244);
      x.fillStyle = '#e6d3a8'; x.fillRect(110, 150, 260, 94);
      x.beginPath(); x.moveTo(96, 150); x.lineTo(240, 96); x.lineTo(384, 150); x.fill();
      x.fillStyle = '#b89a62'; for (let i = 0; i < 8; i++) x.fillRect(124 + i * 32, 158, 12, 80);
      x.fillStyle = '#ffd98a'; x.globalAlpha = 0.85; for (let i = 0; i < 7; i++) x.fillRect(140 + i * 32, 170, 14, 56); x.globalAlpha = 1;
      x.fillStyle = '#f2e3b8'; x.fillRect(100, 240, 280, 8);
      break;
    }
    case 'lighthouse': {
      x.fillStyle = '#0b1c3a'; x.fillRect(0, 246, 480, 54);
      const bg = x.createLinearGradient(240, 70, 480, 40); bg.addColorStop(0, 'rgba(255,240,170,.75)'); bg.addColorStop(1, 'rgba(255,240,170,0)');
      x.fillStyle = bg; x.beginPath(); x.moveTo(240, 64); x.lineTo(480, 10); x.lineTo(480, 120); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(240, 64); x.lineTo(0, 20); x.lineTo(0, 110); x.closePath(); x.fill();
      x.fillStyle = '#d9c9a0'; x.fillRect(196, 170, 88, 80); x.fillRect(210, 110, 60, 62); x.fillRect(222, 70, 36, 42);
      x.fillStyle = '#8a7a58'; x.fillRect(196, 168, 88, 6); x.fillRect(210, 108, 60, 5);
      x.fillStyle = '#ffef9a'; x.beginPath(); x.arc(240, 62, 16, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,240,170,.18)'; x.beginPath(); x.arc(240, 62, 44, 0, 7); x.fill();
      break;
    }
    case 'gardens': {
      ground('#3d6b42', 250);
      for (let i = 0; i < 4; i++) {
        const w = 280 - i * 56, y = 230 - i * 40;
        x.fillStyle = '#d8b98a'; x.fillRect(240 - w / 2, y, w, 22);
        x.fillStyle = '#4c9a50'; for (let j = 0; j < w / 18; j++) { x.beginPath(); x.arc(240 - w / 2 + 9 + j * 18, y, 11, Math.PI, 0); x.fill(); }
        x.fillStyle = '#2f7a3f'; for (let j = 0; j < w / 30; j++) { x.beginPath(); x.moveTo(240 - w / 2 + 14 + j * 30, y + 22); x.quadraticCurveTo(240 - w / 2 + 10 + j * 30, y + 34, 240 - w / 2 + 16 + j * 30, y + 42); x.lineWidth = 3; x.strokeStyle = '#2f7a3f'; x.stroke(); }
      }
      x.fillStyle = '#2f6b3a'; x.beginPath(); x.arc(240, 92, 22, 0, 7); x.fill(); x.fillRect(236, 96, 8, 30);
      break;
    }
    case 'mausoleum': {
      ground('#5a3b4a', 252);
      x.fillStyle = '#e8d6b0'; x.fillRect(130, 190, 220, 62);
      x.fillStyle = '#c9b48a'; for (let i = 0; i < 9; i++) x.fillRect(146 + i * 24, 132, 10, 58);
      x.fillStyle = '#e8d6b0'; x.fillRect(136, 124, 208, 10);
      for (let i = 0; i < 6; i++) x.fillRect(150 + i * 15, 124 - i * 12, 180 - i * 30, 12);
      x.fillStyle = '#d9a64a'; x.fillRect(222, 40, 36, 20); x.beginPath(); x.arc(240, 38, 8, 0, 7); x.fill();
      break;
    }
    case 'harbor': {
      x.fillStyle = '#1f5a8a'; x.fillRect(0, 210, 480, 90);
      x.fillStyle = '#d9c39a'; x.fillRect(0, 196, 150, 18); x.fillRect(330, 196, 150, 18);
      x.fillStyle = '#e8dcbf'; x.fillRect(20, 150, 90, 46); x.fillRect(360, 160, 80, 36);
      x.beginPath(); x.moveTo(14, 150); x.lineTo(65, 126); x.lineTo(116, 150); x.fill();
      [[200, 236], [300, 256], [140, 266]].forEach(([sx, sy], i) => {
        x.fillStyle = '#5a3a20'; x.beginPath(); x.moveTo(sx - 40, sy); x.lineTo(sx + 40, sy); x.lineTo(sx + 28, sy + 14); x.lineTo(sx - 28, sy + 14); x.fill();
        x.fillStyle = '#4a2c18'; x.fillRect(sx - 2, sy - 60, 4, 60);
        x.fillStyle = i === 1 ? '#c94f3a' : '#f2e6c8'; x.beginPath(); x.moveTo(sx, sy - 58); x.quadraticCurveTo(sx + 34, sy - 34, sx, sy - 8); x.fill();
      });
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(30 + i * 60, 228 + (i % 3) * 18); x.lineTo(60 + i * 60, 228 + (i % 3) * 18); x.stroke(); }
      break;
    }
    case 'zeus': {
      ground('#4a3424', 252);
      x.fillStyle = '#d9c9a0'; x.fillRect(110, 236, 260, 16);
      x.fillStyle = '#c4b48a'; x.fillRect(116, 80, 14, 156); x.fillRect(350, 80, 14, 156);
      x.fillStyle = '#d9c9a0'; x.fillRect(104, 66, 272, 16);
      x.fillStyle = '#e2b84a';
      x.fillRect(196, 168, 88, 68); // throne + lap
      x.beginPath(); x.moveTo(206, 168); x.lineTo(214, 112); x.lineTo(266, 112); x.lineTo(274, 168); x.fill();
      x.beginPath(); x.arc(240, 100, 16, 0, 7); x.fill();
      x.fillStyle = '#b88a2a'; x.fillRect(282, 92, 6, 144);
      x.fillStyle = '#f2d27a'; x.beginPath(); x.arc(285, 88, 9, 0, 7); x.fill();
      break;
    }
    case 'artemis': {
      ground('#4a5a7a', 252);
      x.fillStyle = '#eef0f5'; x.fillRect(80, 232, 320, 20); x.fillRect(96, 222, 288, 12);
      for (let i = 0; i < 10; i++) { x.fillStyle = '#f4f6fb'; x.fillRect(104 + i * 29, 116, 14, 106); x.fillStyle = 'rgba(80,100,140,.25)'; x.fillRect(114 + i * 29, 116, 4, 106); }
      x.fillStyle = '#eef0f5'; x.fillRect(90, 102, 300, 16);
      x.beginPath(); x.moveTo(84, 102); x.lineTo(240, 52); x.lineTo(396, 102); x.fill();
      x.fillStyle = 'rgba(120,140,190,.4)'; x.beginPath(); x.moveTo(130, 98); x.lineTo(240, 64); x.lineTo(350, 98); x.fill();
      x.strokeStyle = '#f6e7a8'; x.lineWidth = 3; x.beginPath(); x.arc(70, 70, 18, -1.2, 1.2); x.stroke();
      break;
    }
    case 'road': {
      x.fillStyle = '#6b4a3a'; x.beginPath(); x.moveTo(0, 210); x.lineTo(480, 200); x.lineTo(480, 300); x.lineTo(0, 300); x.fill();
      x.fillStyle = '#b9a58a'; x.beginPath(); x.moveTo(200, 200); x.lineTo(280, 200); x.lineTo(420, 300); x.lineTo(60, 300); x.fill();
      x.strokeStyle = 'rgba(80,60,40,.35)'; x.lineWidth = 1.5; for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(200 - i * 14, 200 + i * 10); x.lineTo(280 + i * 14, 200 + i * 10); x.stroke(); }
      x.fillStyle = '#3a2a22'; [[110, 176], [380, 176]].forEach(([cx, by]) => { for (let i = 0; i < 3; i++) { x.fillRect(cx - 50 + i * 36, by - 46, 10, 46); } x.fillRect(cx - 54, by - 56, 100, 12); });
      x.fillStyle = '#2f4a2a'; [[40, 196], [440, 192], [330, 200], [150, 200]].forEach(([tx, ty]) => { x.beginPath(); x.ellipse(tx, ty - 40, 9, 40, 0, 0, 7); x.fill(); });
      break;
    }
    case 'circus': {
      ground('#6b3a24', 250);
      x.fillStyle = '#c99a5a'; x.beginPath(); x.ellipse(240, 220, 200, 50, 0, 0, 7); x.fill();
      x.fillStyle = '#e0b878'; x.beginPath(); x.ellipse(240, 222, 160, 34, 0, 0, 7); x.fill();
      x.fillStyle = '#8a5a30'; x.fillRect(120, 218, 240, 6);
      x.fillStyle = '#5a3a20'; x.fillRect(236, 160, 8, 60); x.beginPath(); x.moveTo(232, 160); x.lineTo(240, 136); x.lineTo(248, 160); x.fill();
      x.fillStyle = '#e8d2a0'; for (let i = 0; i < 14; i++) { const a = Math.PI + i * Math.PI / 13; x.fillRect(240 + Math.cos(a) * 196 - 5, 214 + Math.sin(a) * 48 - 30, 10, 30); }
      x.fillStyle = '#3a2214'; x.beginPath(); x.ellipse(170, 228, 14, 6, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(300, 214, 14, 6, 0, 0, 7); x.fill();
      break;
    }
  }
  rim(() => { x.beginPath(); });
  void dark; void mid; void lit;
}

/* ================================================================== progress tokens */
const tokCache = new Map();
export function tokenCanvas(t, size) {
  size = size || 160;
  const key = t + ':' + size;
  if (tokCache.has(key)) return tokCache.get(key);
  const c = canvas(size, size), x = c.getContext('2d'), r = size / 2;
  const g = x.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#5fd38a'); g.addColorStop(0.7, '#1f7a46'); g.addColorStop(1, '#0d3a22');
  x.beginPath(); x.arc(r, r, r - 2, 0, 7); x.fillStyle = g; x.fill();
  x.lineWidth = size * 0.05; x.strokeStyle = '#e8c96a'; x.stroke();
  x.beginPath(); x.arc(r, r, r * 0.8, 0, 7); x.lineWidth = size * 0.015; x.strokeStyle = 'rgba(255,240,190,.6)'; x.stroke();
  x.font = Math.round(size * 0.46) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(TOKEN_EMOJI[t], r, r * 1.04);
  tokCache.set(key, c);
  return c;
}

/* ================================================================== small icons for HTML (data URLs) */
const urlCache = new Map();
export function iconURL(kind, v, size) {
  size = size || 64;
  const key = kind + ':' + v + ':' + size;
  if (urlCache.has(key)) return urlCache.get(key);
  const c = canvas(size, size), x = c.getContext('2d'), m = size / 2;
  if (kind === 'res') drawRes(x, v, m, m, size * 0.9);
  else if (kind === 'coin') drawCoin(x, v, m, m, size * 0.98);
  else if (kind === 'shield') drawShield(x, m, m, size * 0.92);
  else if (kind === 'vp') drawVP(x, v, m, m, size * 0.98);
  else if (kind === 'sci') drawSci(x, v, m, m, size * 0.98);
  else if (kind === 'tok') x.drawImage(tokenCanvas(v, size * 2), 0, 0, size, size);
  const u = c.toDataURL();
  urlCache.set(key, u);
  return u;
}
export function cardURL(id) { const k = 'card:' + id; if (!urlCache.has(k)) urlCache.set(k, cardCanvas(id).toDataURL()); return urlCache.get(k); }
export function wonderURL(w, big) { const k = 'w:' + w + (big ? 'b' : ''); if (!urlCache.has(k)) urlCache.set(k, (big ? wonderCanvas(w, 960, 600) : wonderCanvas(w, 480, 300)).toDataURL()); return urlCache.get(k); }
export function wonderArtURL(w) { const k = 'wa:' + w; if (!urlCache.has(k)) urlCache.set(k, wonderCanvas(w, 960, 600, true).toDataURL()); return urlCache.get(k); }

export async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const fams = ['700 20px "Zen Kaku Gothic New"', '700 20px "Shippori Mincho B1"', '700 20px "Cinzel"', '900 20px "Cinzel"'];
  try { await Promise.race([Promise.all(fams.map((f) => document.fonts.load(f, 'あI'))), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts are optional */ }
}
