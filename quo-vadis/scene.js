/* クォ・ヴァディス — the 3D table (three.js r160 from a CDN). Every texture is painted here on canvases; no image files.
   Board units come from data.js: x to the right, z towards the entry edge, the Senate at negative z; y is up and the
   board's top is y = 0. On a screen held upright the Senate is at the top; held sideways it is on the right.
   The page tells the scene what to show (setView, highlight) and asks for animations (play one engine event at a
   time). It renders only while something moves. */

const THREE_URLS = [
  '../assets/vendor/three-r160.module.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.QV_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const D = window.QV_DATA;
const B = D.BOARD;
const COLORS = {}; D.PLAYER_COLORS.forEach((c) => { COLORS[c.key] = c; });
const SERIF = '"Cinzel","Trajan Pro","Times New Roman",Georgia,serif';
const TILE_R = 0.45, TILE_H = 0.07, CAESAR_R = 0.5, CAESAR_H = 0.08;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/* ------------------------------------------------------------------ painting helpers */
function rngFrom(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rrect(x, X, Y, w, h, r) {
  x.beginPath(); x.moveTo(X + r, Y); x.lineTo(X + w - r, Y); x.quadraticCurveTo(X + w, Y, X + w, Y + r); x.lineTo(X + w, Y + h - r);
  x.quadraticCurveTo(X + w, Y + h, X + w - r, Y + h); x.lineTo(X + r, Y + h); x.quadraticCurveTo(X, Y + h, X, Y + h - r); x.lineTo(X, Y + r);
  x.quadraticCurveTo(X, Y, X + r, Y); x.closePath();
}
/* a laurel wreath: two branches of leaves meeting at the bottom, open at the top */
function wreath(x, cx, cy, r, col, leafW) {
  x.save();
  x.fillStyle = col; x.strokeStyle = col;
  x.lineWidth = r * 0.07;
  for (const side of [-1, 1]) {
    x.beginPath();
    x.arc(cx, cy, r, Math.PI / 2 + side * 0.25, Math.PI / 2 + side * 2.55, side < 0);
    x.stroke();
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 2 + side * (0.42 + k * 0.29);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      for (const o of [-1, 1]) {
        x.save();
        x.translate(px, py);
        x.rotate(a + side * Math.PI / 2 + o * 0.62 * side + (side < 0 ? Math.PI : 0));
        x.beginPath(); x.ellipse(r * 0.17, 0, r * 0.17, r * (leafW || 0.075), 0, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  }
  x.beginPath(); x.arc(cx, cy + r, r * 0.08, 0, Math.PI * 2); x.fill();
  x.restore();
}
/* Caesar in profile, wearing his wreath, facing right; fits a box of size s centred on (cx, cy) */
function profile(x, cx, cy, s, col, wreathCol) {
  x.save();
  x.translate(cx - s * 0.5, cy - s * 0.5);
  x.scale(s / 100, s / 100);
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(30, 96);                       // back of the neck
  x.bezierCurveTo(33, 82, 30, 72, 24, 64);
  x.bezierCurveTo(16, 54, 16, 34, 26, 22);  // back of the head
  x.bezierCurveTo(36, 10, 56, 8, 66, 16);  // crown
  x.bezierCurveTo(72, 22, 74, 30, 73, 37); // forehead
  x.lineTo(80, 50);                       // nose
  x.lineTo(73, 53);
  x.bezierCurveTo(75, 56, 73, 58, 71, 60); // lips
  x.bezierCurveTo(73, 63, 71, 66, 68, 67);
  x.bezierCurveTo(68, 72, 62, 75, 56, 75); // chin
  x.bezierCurveTo(55, 82, 56, 90, 60, 96); // throat
  x.closePath(); x.fill();
  // the wreath across the head
  x.strokeStyle = wreathCol; x.fillStyle = wreathCol; x.lineWidth = 2.4;
  x.beginPath(); x.moveTo(22, 40); x.bezierCurveTo(34, 26, 52, 18, 70, 24); x.stroke();
  for (let k = 0; k < 7; k++) {
    const t = k / 6, px = 24 + 44 * t, py = 38 - 16 * Math.sin(t * Math.PI * 0.85) - 4 * t;
    for (const o of [-1, 1]) { x.save(); x.translate(px, py); x.rotate(-0.5 + o * 0.7); x.beginPath(); x.ellipse(5, 0, 5.5, 2.2, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
  }
  // the eye
  x.fillStyle = wreathCol; x.beginPath(); x.ellipse(64, 40, 2.4, 1.4, 0, 0, Math.PI * 2); x.fill();
  x.restore();
}

/* ------------------------------------------------------------------ the board itself */
function paintBoard(W) {
  const s = W / B.w, H = Math.round(B.d * s);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const P = (bx, bz) => [(bx - B.x0) * s, (bz - B.z0) * s];
  const rnd = rngFrom(1992);
  // marble
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#efe6d2'); g.addColorStop(0.5, '#e7dcc3'); g.addColorStop(1, '#ece2cc');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${120 + rnd() * 40 | 0},${110 + rnd() * 30 | 0},${95 + rnd() * 30 | 0},${0.05 + rnd() * 0.08})`;
    x.lineWidth = 0.6 + rnd() * 2.2;
    x.beginPath();
    let px = rnd() * W, py = rnd() * H;
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { const nx = px + (rnd() - 0.3) * W * 0.35, ny = py + (rnd() - 0.5) * H * 0.18; x.quadraticCurveTo((px + nx) / 2 + (rnd() - 0.5) * 80, (py + ny) / 2 + (rnd() - 0.5) * 80, nx, ny); px = nx; py = ny; }
    x.stroke();
  }
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(90,70,40,${rnd() * 0.05})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
  // the frame with a meander
  const bw = 0.42 * s;
  x.fillStyle = '#6e1f1b'; x.fillRect(0, 0, W, bw); x.fillRect(0, H - bw, W, bw); x.fillRect(0, 0, bw, H); x.fillRect(W - bw, 0, bw, H);
  x.strokeStyle = '#d2ac55'; x.lineWidth = s * 0.035;
  x.strokeRect(bw * 0.18, bw * 0.18, W - bw * 0.36, H - bw * 0.36);
  x.strokeRect(bw * 1.05, bw * 1.05, W - bw * 2.1, H - bw * 2.1);
  const meander = (x0, y0, len, horiz) => {
    const u = bw * 0.22, step = u * 4;
    x.beginPath();
    for (let t = 0; t + step <= len; t += step) {
      const pts = [[0, 3], [0, 0], [3, 0], [3, 2], [1, 2], [1, 1], [2, 1]];
      pts.forEach((p, k) => {
        const a = horiz ? x0 + t + p[0] * u * 0.9 : x0 + p[1] * u * 0.9 - u * 0.35, b = horiz ? y0 + p[1] * u * 0.9 - u * 0.35 : y0 + t + p[0] * u * 0.9;
        if (k === 0) x.moveTo(a, b); else x.lineTo(a, b);
      });
    }
    x.lineWidth = s * 0.03; x.stroke();
  };
  meander(bw, bw * 0.38, W - 2 * bw, true); meander(bw, H - bw * 0.62, W - 2 * bw, true);
  meander(bw * 0.38, bw, H - 2 * bw, false); meander(W - bw * 0.62, bw, H - 2 * bw, false);

  // the paths (under everything else)
  D.PATHS.forEach((p) => {
    const pts = p.pts.map((q) => P(q[0], q[1]));
    const road = (w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); pts.forEach((q, k) => (k ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.stroke(); };
    road(0.56 * s, '#8b7656'); road(0.44 * s, p.laurel ? '#cbb68c' : '#d9cba9');
    // cobbles
    x.fillStyle = 'rgba(110,88,56,0.28)';
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / (0.17 * s));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, cx = lerp(ax, bx, t), cy = lerp(ay, by, t), nx = -(by - ay) / len, ny = (bx - ax) / len;
        for (const o of [-0.11, 0.11]) { x.beginPath(); x.ellipse(cx + nx * o * s, cy + ny * o * s, 0.055 * s, 0.045 * s, Math.atan2(by - ay, bx - ax), 0, Math.PI * 2); x.fill(); }
      }
    }
  });
  // laurel spaces: a square with a wreath, where a laurel tile lies
  D.PATHS.filter((p) => p.laurel).forEach((p) => {
    const [cx, cy] = P(p.at[0], p.at[1]), h = 0.5 * s;
    x.fillStyle = '#2f4a33'; rrect(x, cx - h, cy - h, 2 * h, 2 * h, 0.08 * s); x.fill();
    x.strokeStyle = '#d6b45c'; x.lineWidth = 0.05 * s; rrect(x, cx - h + 0.05 * s, cy - h + 0.05 * s, 2 * h - 0.1 * s, 2 * h - 0.1 * s, 0.06 * s); x.stroke();
    wreath(x, cx, cy, 0.3 * s, '#8fbf7a');
  });
  // committees
  const FLOOR = { 1: ['#d8c8a6', '#c3b089'], 3: ['#3f6a52', '#2b4c3a'], 5: ['#88302a', '#5e1d19'] };
  D.COMMITTEES.forEach((c) => {
    const [x0, y0] = P(c.x - c.w / 2, c.z - c.d / 2), w = c.w * s, h = c.d * s;
    x.fillStyle = 'rgba(60,40,20,0.35)'; rrect(x, x0 + 0.06 * s, y0 + 0.08 * s, w, h, 0.16 * s); x.fill();
    x.fillStyle = '#8a6a33'; rrect(x, x0, y0, w, h, 0.16 * s); x.fill();
    const gg = x.createLinearGradient(x0, y0, x0 + w, y0 + h);
    gg.addColorStop(0, FLOOR[c.seats][0]); gg.addColorStop(1, FLOOR[c.seats][1]);
    x.fillStyle = gg; rrect(x, x0 + 0.08 * s, y0 + 0.08 * s, w - 0.16 * s, h - 0.16 * s, 0.11 * s); x.fill();
    x.strokeStyle = 'rgba(255,236,190,0.5)'; x.lineWidth = 0.02 * s; rrect(x, x0 + 0.14 * s, y0 + 0.14 * s, w - 0.28 * s, h - 0.28 * s, 0.08 * s); x.stroke();
    c.seatXZ.forEach((q) => {
      const [sx, sy] = P(q[0], q[1]);
      x.fillStyle = 'rgba(20,12,6,0.32)'; x.beginPath(); x.arc(sx, sy, 0.33 * s, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#e0bd62'; x.lineWidth = 0.055 * s; x.beginPath(); x.arc(sx, sy, 0.31 * s, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = 'rgba(255,240,200,0.35)'; x.lineWidth = 0.02 * s; x.beginPath(); x.arc(sx, sy, 0.23 * s, 0, Math.PI * 2); x.stroke();
    });
  });
  // the Senate: a hemicycle of porphyry and marble steps
  {
    const S = D.SENATE, [cx, cy] = P(S.x, S.z), r = S.r * s;
    x.save();
    x.fillStyle = 'rgba(60,30,20,0.35)'; x.beginPath(); x.arc(cx + 0.06 * s, cy + 0.08 * s, r + 0.08 * s, Math.PI, 0); x.closePath(); x.fill();
    x.fillStyle = '#d9cbb0'; x.beginPath(); x.arc(cx, cy, r + 0.12 * s, Math.PI, 0); x.closePath(); x.fill();
    for (let k = 0; k < 4; k++) { x.strokeStyle = 'rgba(120,96,64,0.45)'; x.lineWidth = 0.025 * s; x.beginPath(); x.arc(cx, cy, r - k * 0.22 * s, Math.PI, 0); x.stroke(); }
    const pg = x.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r * 0.85);
    pg.addColorStop(0, '#93342c'); pg.addColorStop(1, '#5a1915');
    x.fillStyle = pg; x.beginPath(); x.arc(cx, cy, r * 0.8, Math.PI, 0); x.closePath(); x.fill();
    x.strokeStyle = '#d6b45c'; x.lineWidth = 0.05 * s; x.beginPath(); x.arc(cx, cy, r * 0.8, Math.PI, 0); x.closePath(); x.stroke();
    // the words around the hemicycle
    x.fillStyle = '#7b5a26'; x.font = `700 ${0.27 * s}px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const words = 'SONO · PAZZI · QVESTI · ROMANI';
    const rr = r + 0.36 * s, span = Math.PI * 0.78, a0 = -Math.PI / 2 - span / 2;
    [...words].forEach((ch, k, arr) => {
      const a = a0 + span * (k + 0.5) / arr.length;
      x.save(); x.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); x.rotate(a + Math.PI / 2); x.fillText(ch, 0, 0); x.restore();
    });
    S.seatXZ.forEach((q, k) => {
      const [sx, sy] = P(q[0], q[1]);
      x.fillStyle = 'rgba(20,10,6,0.35)'; x.beginPath(); x.arc(sx, sy, 0.36 * s, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#f0cf72'; x.lineWidth = 0.065 * s; x.beginPath(); x.arc(sx, sy, 0.34 * s, 0, Math.PI * 2); x.stroke();
      x.fillStyle = 'rgba(255,230,170,0.75)'; x.font = `700 ${0.2 * s}px ${SERIF}`; x.fillText(ROMAN[k + 1], sx, sy + 0.5 * s);
    });
    x.fillStyle = '#f3dfa6'; x.font = `700 ${0.4 * s}px ${SERIF}`; x.fillText('SENATVS', cx, cy - r * 0.2);
    x.restore();
  }
  // the storage spaces beside the Senate
  [['ones', 'I'], ['bag', 'II–V']].forEach(([k, lab]) => {
    const [cx, cy] = P(D.STORE[k][0], D.STORE[k][1]), h = 0.62 * s;
    x.fillStyle = 'rgba(60,40,20,0.25)'; rrect(x, cx - h + 0.05 * s, cy - h + 0.07 * s, 2 * h, 2 * h, 0.12 * s); x.fill();
    x.fillStyle = '#2f4a33'; rrect(x, cx - h, cy - h, 2 * h, 2 * h, 0.12 * s); x.fill();
    x.strokeStyle = '#d6b45c'; x.lineWidth = 0.05 * s; rrect(x, cx - h + 0.07 * s, cy - h + 0.07 * s, 2 * h - 0.14 * s, 2 * h - 0.14 * s, 0.09 * s); x.stroke();
    wreath(x, cx, cy - 0.04 * s, 0.4 * s, '#8fbf7a');
    x.fillStyle = '#f3dfa6'; x.font = `700 ${0.24 * s}px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(lab, cx, cy + 0.86 * s);
  });
  // title and S·P·Q·R
  {
    const [cx, cy] = P(0, 9.75);
    x.fillStyle = '#6e1f1b'; rrect(x, cx - 2.9 * s, cy - 0.42 * s, 5.8 * s, 0.84 * s, 0.14 * s); x.fill();
    x.strokeStyle = '#d6b45c'; x.lineWidth = 0.04 * s; rrect(x, cx - 2.82 * s, cy - 0.34 * s, 5.64 * s, 0.68 * s, 0.1 * s); x.stroke();
    x.fillStyle = '#f3dfa6'; x.font = `700 ${0.46 * s}px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('QVO VADIS ?', cx, cy + 0.02 * s);
    const [tx, ty] = P(0, -10.15);
    x.fillStyle = '#7b5a26'; x.font = `700 ${0.3 * s}px ${SERIF}`; x.fillText('S · P · Q · R', tx, ty);
  }
  return cv;
}

/* laurel tiles: face (with the numeral), the Caesar-marked "II", the back; Caesar's own tile */
function paintTile(kind) {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const x = cv.getContext('2d'), c = N / 2;
  if (kind === 'back') {
    const g = x.createRadialGradient(c, c * 0.8, 10, c, c, c);
    g.addColorStop(0, '#3d6146'); g.addColorStop(1, '#22392a');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.strokeStyle = '#c9a54e'; x.lineWidth = 8; x.beginPath(); x.arc(c, c, c - 12, 0, Math.PI * 2); x.stroke();
    wreath(x, c, c, c * 0.55, '#c9a54e', 0.07);
    return cv;
  }
  if (kind === 'caesar') {
    const g = x.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, c);
    g.addColorStop(0, '#f6dc8c'); g.addColorStop(1, '#b8892c');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.strokeStyle = '#7a1d18'; x.lineWidth = 12; x.beginPath(); x.arc(c, c, c - 10, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#fff1c2'; x.lineWidth = 3; x.beginPath(); x.arc(c, c, c - 22, 0, Math.PI * 2); x.stroke();
    profile(x, c, c * 0.98, N * 0.66, '#5a1712', '#2f5a2a');
    x.fillStyle = '#5a1712'; x.font = `700 26px ${SERIF}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('CAESAR', c, N - 36);
    return cv;
  }
  // a face: kind = 'v1'..'v5' or 'c2'
  const v = +kind.slice(1), isC = kind[0] === 'c';
  const g = x.createRadialGradient(c * 0.8, c * 0.7, 10, c, c, c);
  g.addColorStop(0, v === 1 ? '#fbf3dc' : '#f7ecd0'); g.addColorStop(1, v === 1 ? '#e0d0a8' : '#d9c493');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  x.strokeStyle = isC ? '#7a1d18' : '#2f5a2a'; x.lineWidth = 10; x.beginPath(); x.arc(c, c, c - 9, 0, Math.PI * 2); x.stroke();
  wreath(x, c, c + 4, c * 0.66, '#3f7a35', 0.08);
  x.fillStyle = '#7a1d18'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (isC) {
    x.font = `700 70px ${SERIF}`; x.fillText(ROMAN[v], c, c - 24);
    x.fillStyle = '#7a1d18'; x.beginPath(); x.arc(c, c + 44, 34, 0, Math.PI * 2); x.fill();
    profile(x, c + 1, c + 44, 56, '#f2d37a', '#9fd08a');
  } else {
    x.font = `700 ${v >= 4 ? 92 : 104}px ${SERIF}`; x.fillText(ROMAN[v], c, c + 6);
  }
  return cv;
}
function paintWood(seed) {
  const W = 512, cv = document.createElement('canvas'); cv.width = cv.height = W;
  const x = cv.getContext('2d'), rnd = rngFrom(seed);
  x.fillStyle = '#3a2416'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 160; i++) {
    x.strokeStyle = `rgba(${90 + rnd() * 50 | 0},${55 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${0.1 + rnd() * 0.25})`;
    x.lineWidth = 1 + rnd() * 3;
    const y = rnd() * W;
    x.beginPath(); x.moveTo(0, y);
    for (let k = 1; k <= 8; k++) x.lineTo(k * W / 8, y + Math.sin(k * 0.9 + rnd() * 2) * 6);
    x.stroke();
  }
  return cv;
}

/* Same board, hit targets and rules on devices where WebGL is unavailable. */
function createCanvasScene(host) {
  let container=host, view=null, tap=null, hl={}, metrics={x:0,y:0,s:1}, raf=0;
  const cv=document.createElement('canvas'), ctx=cv.getContext('2d'), board=paintBoard(1200), faces=new Map();
  cv.style.cssText='display:block;width:100%;height:100%;touch-action:pan-y';
  cv.setAttribute('aria-label','クォ・ヴァディスの盤面（3D非対応のため平面表示）');container.appendChild(cv);
  const face=k=>{if(!faces.has(k))faces.set(k,paintTile(k));return faces.get(k);};
  function project(x,y,z){return [metrics.x+(x-B.x0)*metrics.s,metrics.y+(z-B.z0)*metrics.s,0];}
  function draw(){
    raf=0;const r=container.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height),dpr=Math.min(2,devicePixelRatio||1);
    cv.width=w*dpr;cv.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#2b1c13';ctx.fillRect(0,0,w,h);
    const playing=container.id==='stage',top=playing?42:10,bottom=8,tb=D.TABLE_VIEW;
    const s=Math.min((w-12)/tb.w,Math.max(40,h-top-bottom)/tb.d);metrics={x:(w-tb.w*s)/2+(B.x0-tb.x0)*s,y:top+Math.max(0,(h-top-bottom-tb.d*s)/2)+(B.z0-tb.z0)*s,s};
    ctx.drawImage(board,metrics.x,metrics.y,B.w*s,B.d*s);
    const circle=(x,z,r,fill,stroke)=>{const [px,py]=project(x,0,z);ctx.beginPath();ctx.arc(px,py,r*s,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}};
    const tile=(pid,t)=>{const p=D.PATH[pid];if(!p||!p.at||!t)return;const [px,py]=project(...[p.at[0],0,p.at[1]]),r=.46*s;ctx.save();ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.clip();ctx.drawImage(face(t.c?'c2':'v'+t.v),px-r,py-r,r*2,r*2);ctx.restore();};
    if(view){
      const me=Number.isInteger(view.me)&&view.me>=0?view.me:0;
      D.tableSupply(view,me,false).forEach(piece=>{const col=COLORS[view.players[piece.p].color];circle(piece.at[0],piece.at[1],.31,col.hex,'#f0d3a2');});
      D.tableGroups(view.n,me,false).forEach(group=>{const [x,y]=project(group.label[0],0,group.label[1]);ctx.fillStyle='#fff2d8';ctx.font=`bold ${Math.max(9,s*.42)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((group.p===me?'あなた':view.players[group.p].name)+' ×'+view.players[group.p].left,x,y,3.1*s);});
      D.LAUREL_PATHS.forEach(pid=>tile(pid,view.spaces[pid]));
      const p=D.PATH[view.caesar];if(p&&p.at){const [x,y]=project(p.at[0],0,p.at[1]),r=.48*s;ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();ctx.drawImage(face('caesar'),x-r,y-r,2*r,2*r);ctx.restore();}
      for(const c of [...D.COMMITTEES,D.SENATE]){
        const occ=c.id==='S'?view.senate:view.occ[c.id];occ.forEach((sid,k)=>{if(sid<0)return;const [x,z]=c.seatXZ[k],col=COLORS[view.players[Math.floor(sid/D.SENATORS)].color];circle(x,z,.29,col.hex,'#332114');if((hl.senators||[]).includes(sid))circle(x,z,.36,'#0000','#f6ca53');});
      }
    }
    ctx.strokeStyle='#ffdc68';ctx.lineWidth=2.5;
    for(const cid of hl.committees||[]){const c=D.COM[cid];if(!c)continue;const [x,y]=project(c.x,0,c.z);if(cid==='S')ctx.strokeRect(x-c.r*s,y-c.r*s,c.r*2*s,c.r*s);else ctx.strokeRect(x-c.w*s/2-2,y-c.d*s/2-2,c.w*s+4,c.d*s+4);}
    for(const pid of hl.laurels||[]){const p=D.PATH[pid];if(p&&p.at)circle(p.at[0],p.at[1],.54,'#0000','#ffe076');}
  }
  function kick(){if(!raf)raf=requestAnimationFrame(draw);}
  let down=null;
  cv.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  cv.addEventListener('pointerup',e=>{
    if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>12)return;down=null;if(!tap)return;
    const r=cv.getBoundingClientRect(),x=(e.clientX-r.left-metrics.x)/metrics.s+B.x0,z=(e.clientY-r.top-metrics.y)/metrics.s+B.z0;
    if(view){const me=Number.isInteger(view.me)?view.me:0;for(const piece of D.tableSupply(view,me,false)){if(Math.hypot(x-piece.at[0],z-piece.at[1])<.4){tap({kind:'supply',p:piece.p});return;}}}
    for(const pid of D.LAUREL_PATHS){const p=D.PATH[pid];if(Math.hypot(x-p.at[0],z-p.at[1])<.65){tap({kind:'laurel',id:pid});return;}}
    for(const c of D.COMMITTEES){if(Math.abs(x-c.x)<c.w/2+.12&&Math.abs(z-c.z)<c.d/2+.12){tap({kind:'committee',id:c.id});return;}}
  });
  const observer=new ResizeObserver(kick);observer.observe(container);window.addEventListener('resize',kick);kick();
  return {canvas:cv,setView(v){view=v;kick();},async play(){},highlight(v){hl=v;kick();},resize:kick,kick,resetCamera:kick,ensureVisible(){},project,
    setHost(el){if(el&&el!==container){observer.unobserve(container);container=el;el.appendChild(cv);observer.observe(el);}kick();},onTap(f){tap=f;},setSpeed(){},setCam(){},setTitleMode(){kick();},get busy(){return false;},get orient(){return 'front';},
    seatScreen(cid,k){const a=D.COM[cid].seatXZ[k];return project(a[0],0,a[1]);},committeeScreen(cid){const c=D.COM[cid];return project(c.x,0,c.z);},laurelScreen(pid){const a=D.PATH[pid].at;return project(a[0],0,a[1]);}};
}

/* ------------------------------------------------------------------ the scene */
export function createScene(host, opts = {}) {
  let container = host;
  let renderer;
  try {renderer = opts.renderer || new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.keepFrame });}
  catch (err) {console.warn("WebGL unavailable; using the same board in 2D.");return createCanvasScene(host);}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;
  canvasEl.style.display = 'block'; canvasEl.style.width = '100%'; canvasEl.style.height = '100%'; canvasEl.style.touchAction = 'none';

  const scene = new T.Scene();
  scene.background = new T.Color('#1b120c');
  scene.fog = new T.Fog('#1b120c', 60, 140);
  const cam = new T.PerspectiveCamera(36, 1, 0.5, 400);
  scene.add(new T.HemisphereLight('#fff3dc', '#3a2618', 1.15));
  const sun = new T.DirectionalLight('#fff0d6', 1.55); sun.position.set(-8, 22, 12); scene.add(sun);
  const rim = new T.DirectionalLight('#ffd9a0', 0.45); rim.position.set(10, 8, -14); scene.add(rim);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);

  // the table
  const woodTex = new T.CanvasTexture(paintWood(7)); woodTex.colorSpace = T.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.repeat.set(5, 5);
  const table = new T.Mesh(new T.PlaneGeometry(160, 160), new T.MeshStandardMaterial({ map: woodTex, roughness: 0.82 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.26; scene.add(table);
  // the board: a slab with the painting on top
  const boardTex = new T.CanvasTexture(paintBoard(2048)); boardTex.colorSpace = T.SRGBColorSpace; boardTex.anisotropy = aniso;
  const slab = new T.Mesh(new T.BoxGeometry(B.w, 0.25, B.d), new T.MeshStandardMaterial({ color: '#4a2a1a', roughness: 0.7 }));
  slab.position.y = -0.125; scene.add(slab);
  const top = new T.Mesh(new T.PlaneGeometry(B.w, B.d), new T.MeshStandardMaterial({ map: boardTex, roughness: 0.62, metalness: 0.02 }));
  top.rotation.x = -Math.PI / 2; top.position.set(B.x0 + B.w / 2, 0.002, B.z0 + B.d / 2); scene.add(top);
  // a ring of columns behind the Senate
  {
    const colMat = new T.MeshStandardMaterial({ color: '#efe6d3', roughness: 0.5 });
    const shaft = new T.CylinderGeometry(0.13, 0.15, 1.5, 14), cap = new T.BoxGeometry(0.4, 0.1, 0.4);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (1.04 + 0.115 * k), r = D.SENATE.r + 0.36;
      const px = D.SENATE.x + Math.cos(a) * r, pz = D.SENATE.z + Math.sin(a) * r;
      const s1 = new T.Mesh(shaft, colMat); s1.position.set(px, 0.75, pz); scene.add(s1);
      const c1 = new T.Mesh(cap, colMat); c1.position.set(px, 1.53, pz); scene.add(c1);
      const c0 = new T.Mesh(cap, colMat); c0.position.set(px, 0.05, pz); scene.add(c0);
    }
  }

  /* ------------------------------------------------ the pieces */
  const pieceGeo = (() => {
    const pts = [[0, 0], [0.3, 0], [0.31, 0.035], [0.28, 0.07], [0.23, 0.095], [0.21, 0.13], [0.2, 0.2], [0.17, 0.42], [0.155, 0.5], [0.19, 0.56], [0.17, 0.6], [0.085, 0.63], [0.075, 0.66], [0, 0.66]];
    return new T.LatheGeometry(pts.map((p) => new T.Vector2(p[0], p[1])), 28);
  })();
  const headGeo = new T.SphereGeometry(0.115, 20, 14);
  const wreathGeo = new T.TorusGeometry(0.105, 0.025, 6, 18);
  const shadowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(cv); })();
  const shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowGeo = new T.PlaneGeometry(0.85, 0.85);
  const ringGeo = new T.RingGeometry(0.34, 0.46, 36);
  const ringMat = new T.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide });
  const pieceMats = {};
  function pieceMat(color) {
    if (!pieceMats[color]) {
      const c = COLORS[color] || COLORS.red;
      pieceMats[color] = new T.MeshStandardMaterial({ color: c.hex, roughness: color === 'black' ? 0.38 : 0.48, metalness: 0.05, emissive: '#000000' });
    }
    return pieceMats[color];
  }
  const gold = new T.MeshStandardMaterial({ color: '#d8b04c', roughness: 0.35, metalness: 0.6 });
  const senators = new Map();           // sid → group
  let playerColors = [];
  const supplyLabels = new Map();
  function makeSenator(sid) {
    const color = playerColors[Math.floor(sid / D.SENATORS)] || 'red';
    const g = new T.Group();
    const mat = pieceMat(color).clone();
    const body = new T.Mesh(pieceGeo, mat); g.add(body);
    const head = new T.Mesh(headGeo, mat); head.position.y = 0.74; g.add(head);
    const wr = new T.Mesh(wreathGeo, gold); wr.rotation.x = Math.PI / 2; wr.position.y = 0.79; g.add(wr);
    const sh = new T.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.006; g.add(sh);
    const ring = new T.Mesh(ringGeo, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false; g.add(ring);
    g.userData = { sid, mat, ring, kind: 'senator' };
    body.userData.pick = { kind: 'senator', sid }; head.userData.pick = { kind: 'senator', sid };
    scene.add(g);
    senators.set(sid, g);
    return g;
  }
  const tileGeo = new T.CylinderGeometry(TILE_R, TILE_R, TILE_H, 40);
  const caesarGeo = new T.CylinderGeometry(CAESAR_R, CAESAR_R, CAESAR_H, 44);
  const edgeMat = new T.MeshStandardMaterial({ color: '#b79b68', roughness: 0.8 });
  const faceMats = {};
  function faceMat(kind) {
    if (!faceMats[kind]) { const t = new T.CanvasTexture(paintTile(kind)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso; faceMats[kind] = new T.MeshStandardMaterial({ map: t, roughness: 0.6 }); }
    return faceMats[kind];
  }
  function tileKind(t) { return t.c ? 'c' + t.v : 'v' + t.v; }
  function makeTile(kind, backKind) {
    const m = new T.Mesh(tileGeo, [edgeMat, faceMat(kind), faceMat(backKind || 'back')]);
    m.userData.kind = kind;
    scene.add(m);
    return m;
  }
  function setTileFace(m, kind) { m.material = [edgeMat, faceMat(kind), faceMat('back')]; m.userData.kind = kind; }
  const spaceTiles = {};                 // pathId → mesh (or null)
  D.LAUREL_PATHS.forEach((pid) => { spaceTiles[pid] = null; });
  const caesar = new T.Mesh(caesarGeo, [edgeMat, faceMat('caesar'), faceMat('caesar')]);
  scene.add(caesar);
  let caesarAt = null;
  // the "I" stack and the face-down supply
  const onesStack = [], bagStack = [];
  function setStacks(nOnes, nBag) {
    const want1 = Math.min(18, nOnes), wantB = Math.min(36, nBag);
    while (onesStack.length < want1) onesStack.push(makeTile('v1'));
    while (bagStack.length < wantB) { const m = makeTile('back', 'back'); bagStack.push(m); }
    onesStack.forEach((m, k) => { m.visible = k < want1; m.position.set(D.STORE.ones[0] + (k % 2) * 0.02, TILE_H / 2 + k * (TILE_H * 0.9), D.STORE.ones[1]); m.rotation.set(0, k * 0.4, 0); });
    bagStack.forEach((m, k) => {
      m.visible = k < wantB;
      const col = k % 3, lvl = Math.floor(k / 3);
      m.position.set(D.STORE.bag[0] + (col - 1) * 0.36, TILE_H / 2 + lvl * TILE_H * 0.9, D.STORE.bag[1] + (col === 1 ? -0.3 : 0.18));
      m.rotation.set(0, k * 0.7, 0);
    });
  }

  /* ------------------------------------------------ picking and highlights */
  const pickables = [];
  const hlMeshes = {};
  function glowTexture(w, h, round) {
    const s = 96, cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    const x = cv.getContext('2d');
    x.shadowColor = '#ffd84a'; x.shadowBlur = 22; x.strokeStyle = '#ffe680'; x.lineWidth = 10;
    if (round) { x.beginPath(); x.arc(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) / 2 - 18, 0, Math.PI * 2); x.stroke(); }
    else { rrect(x, 18, 18, cv.width - 36, cv.height - 36, 22); x.stroke(); }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function addPick(kind, id, w, d, px, pz, round) {
    const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshBasicMaterial({ visible: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(px, 0.02, pz);
    m.userData.pick = { kind, id };
    scene.add(m); pickables.push(m);
    const hm = new T.Mesh(new T.PlaneGeometry(w + 0.5, d + 0.5), new T.MeshBasicMaterial({ map: glowTexture(w + 0.5, d + 0.5, round), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    hm.rotation.x = -Math.PI / 2; hm.position.set(px, 0.03, pz); hm.visible = false; hm.renderOrder = 3;
    scene.add(hm); hlMeshes[kind + ':' + id] = hm;
  }
  D.COMMITTEES.forEach((c) => addPick('committee', c.id, c.w, c.d, c.x, c.z));
  addPick('committee', 'S', D.SENATE.r * 2, D.SENATE.r, D.SENATE.x, D.SENATE.z - D.SENATE.r / 2);
  D.PATHS.filter((p) => p.laurel).forEach((p) => addPick('laurel', p.id, 1.1, 1.1, p.at[0], p.at[1], true));

  /* ------------------------------------------------ positions */
  function seatXZ(cid, seat) { const c = D.COM[cid]; return c.seatXZ[seat]; }
  function laurelAt(pid) { return D.PATH[pid].at; }

  function reserveSide(){return orient==='side';}
  function setLabel(p, group, pl) {
    const text=(V&&p===V.me?'あなた':pl.name)+' ×'+pl.left;
    let label=supplyLabels.get(p);
    if(!label) {
      label=new T.Mesh(new T.PlaneGeometry(3.15,0.65),new T.MeshBasicMaterial({transparent:true,depthWrite:false}));
      label.userData.pick={kind:'supply',p};label.rotation.x=-Math.PI/2;scene.add(label);supplyLabels.set(p,label);
    }
    if(label.userData.text!==text || label.userData.color!==pl.color) {
      const cv=document.createElement('canvas');cv.width=630;cv.height=130;const x=cv.getContext('2d');
      x.fillStyle='rgba(25,14,8,.74)';rrect(x,2,2,626,126,18);x.fill();
      x.fillStyle=COLORS[pl.color].hex;x.beginPath();x.arc(42,65,19,0,Math.PI*2);x.fill();x.strokeStyle='#f3dfb7';x.lineWidth=3;x.stroke();
      x.fillStyle='#fff2d8';x.font='700 52px "Noto Sans JP",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,342,66,548);
      if(label.material.map)label.material.map.dispose();const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
      label.material.map=texture;label.material.needsUpdate=true;label.userData.text=text;label.userData.color=pl.color;
    }
    label.visible=true;label.position.set(group.label[0],0.018,group.label[1]);label.rotation.set(-Math.PI/2,0,reserveSide()?-Math.PI/2:0);
  }
  function showReserves(seen) {
    const me=Number.isInteger(V.me)&&V.me>=0?V.me:0;
    D.tableSupply(V,me,reserveSide()).forEach(function(piece){
      let g=senators.get(piece.sid);if(!g)g=makeSenator(piece.sid);
      g.userData.mat.color.set(COLORS[playerColors[piece.p]].hex);
      g.position.set(piece.at[0],0,piece.at[1]);g.visible=true;g.scale.setScalar(1);g.rotation.set(0,0,0);seen.add(piece.sid);
    });
    supplyLabels.forEach(label=>{label.visible=false;});
    D.tableGroups(V.n,me,reserveSide()).forEach(group=>setLabel(group.p,group,V.players[group.p]));
  }

  /* the state as it should look, without animation */
  let V = null;
  function setView(v) {
    V = v;
    playerColors = v.players.map((p) => p.color);
    const seen = new Set();
    const put = (sid, cid, seat) => {
      let g = senators.get(sid);
      if (!g) g = makeSenator(sid);
      const xz = seatXZ(cid, seat);
      g.userData.mat.color.set(COLORS[playerColors[Math.floor(sid/D.SENATORS)]].hex);
      g.position.set(xz[0], 0, xz[1]); g.visible = true; g.scale.setScalar(1); g.rotation.set(0, 0, 0);
      seen.add(sid);
    };
    D.COMMITTEES.forEach((c) => v.occ[c.id].forEach((sid, seat) => { if (sid >= 0) put(sid, c.id, seat); }));
    v.senate.forEach((sid, seat) => put(sid, 'S', seat));
    showReserves(seen);
    senators.forEach((g, sid) => { if (!seen.has(sid)) g.visible = false; });
    D.LAUREL_PATHS.forEach((pid) => {
      const t = v.spaces[pid];
      let m = spaceTiles[pid];
      if (!t) { if (m) m.visible = false; return; }
      if (!m) { m = makeTile(tileKind(t)); spaceTiles[pid] = m; }
      setTileFace(m, tileKind(t));
      const at = laurelAt(pid);
      m.position.set(at[0], TILE_H / 2, at[1]); m.rotation.set(0, faceY(), 0); m.scale.setScalar(1); m.visible = true;
    });
    placeCaesar(v.caesar);
    setStacks(v.ones, typeof v.bag === 'number' ? v.bag : v.bag.length);
    kick();
  }
  function placeCaesar(pid) {
    caesarAt = pid;
    const at = laurelAt(pid);
    caesar.position.set(at[0], TILE_H + CAESAR_H / 2 + 0.01, at[1]); caesar.rotation.set(0, faceY(), 0); caesar.visible = true;
  }
  /* a tile's painting reads upright for the player: the cap's texture "up" lies along +x, so turn it */
  function faceY() { return Math.PI / 2 + azimuth(); }
  function faceTiles() {
    const y = faceY();
    D.LAUREL_PATHS.forEach((pid) => { const m = spaceTiles[pid]; if (m) m.rotation.set(0, y, 0); });
    caesar.rotation.set(0, y, 0);
  }

  /* ------------------------------------------------ highlights: { committees, laurels, senators, mark } */
  let hl = { committees: [], laurels: [], senators: [] };
  function highlight(spec) {
    hl = Object.assign({ committees: [], laurels: [], senators: [] }, spec || {});
    Object.values(hlMeshes).forEach((m) => { m.visible = false; });
    hl.committees.forEach((id) => { const m = hlMeshes['committee:' + id]; if (m) m.visible = true; });
    hl.laurels.forEach((id) => { const m = hlMeshes['laurel:' + id]; if (m) m.visible = true; });
    senators.forEach((g) => {
      const on = hl.senators.indexOf(g.userData.sid) >= 0;
      g.userData.ring.visible = on;
      g.userData.mat.emissive.set(on ? '#2a1e00' : '#000000');
    });
    kick();
  }

  /* ------------------------------------------------ animation */
  const tweens = [];
  let speed = 1;
  function tween(ms, fn) {
    return new Promise((res) => { tweens.push({ t0: performance.now(), ms: Math.max(1, ms * speed), fn, res }); kick(); });
  }
  function arcMove(obj, from, to, height, ms, spin) {
    return tween(ms, (k) => {
      const e = ease(k);
      obj.position.set(lerp(from.x, to.x, e), lerp(from.y, to.y, e) + Math.sin(Math.PI * e) * height, lerp(from.z, to.z, e));
      if (spin) obj.rotation.z = spin * Math.PI * e;
    });
  }
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  /* the near edge of the table, where a player's taken laurels go (face down, out of sight) */
  function playerEdge() { return orient === 'side' ? V3(B.x0 + B.w + 1.5, 0.5, 0) : V3(0, 0.5, B.z0 + B.d + 1.5); }

  async function animPlace(e) {
    let g = senators.get(e.sid); if (!g) g = makeSenator(e.sid);
    const xz = seatXZ(e.c, e.seat);
    const from=g.position.clone();
    g.visible = true;
    g.position.copy(from);
    await arcMove(g, from, V3(xz[0], 0, xz[1]), 1.6, 520);
  }
  async function animMove(e) {
    const g = senators.get(e.sid); if (!g) return;
    const a = seatXZ(e.from, e.fromSeat), b = seatXZ(e.to, e.toSeat);
    await arcMove(g, V3(a[0], 0, a[1]), V3(b[0], 0, b[1]), e.to === 'S' ? 2.2 : 1.4, e.to === 'S' ? 820 : 600);
  }
  async function animLaurel(e) {
    const m = spaceTiles[e.path]; if (!m) return;
    const from = m.position.clone(), up = V3(from.x, 1.6, from.z);
    await tween(300, (k) => { const q = ease(k); m.position.lerpVectors(from, up, q); m.rotation.x = Math.PI * q; });
    const edge = playerEdge();
    await tween(340, (k) => { const q = ease(k); m.position.lerpVectors(up, edge, q); m.scale.setScalar(1 - 0.6 * q); });
    m.visible = false; m.scale.setScalar(1); m.rotation.set(0, 0, 0);
    spaceTiles[e.path] = null;
    scene.remove(m);
  }
  async function animRefill(e) {
    if (spaceTiles[e.path]) { scene.remove(spaceTiles[e.path]); spaceTiles[e.path] = null; }
    if (!e.tile) return;
    const m = makeTile(tileKind(e.tile));
    const top = bagStack.filter((x) => x.visible).pop();
    if (top) top.visible = false;
    const from = V3(D.STORE.bag[0], 0.4, D.STORE.bag[1]), at = laurelAt(e.path), to = V3(at[0], TILE_H / 2, at[1]);
    m.position.copy(from); m.rotation.set(Math.PI, faceY(), 0);
    spaceTiles[e.path] = m;
    m.rotation.y = faceY();
    await tween(480, (k) => { const q = ease(k); m.position.set(lerp(from.x, to.x, q), lerp(from.y, to.y, q) + Math.sin(Math.PI * q) * 1.4, lerp(from.z, to.z, q)); m.rotation.x = Math.PI * (1 - q); });
    m.rotation.set(0, faceY(), 0);
  }
  async function animCaesar(e) {
    const a = laurelAt(e.from), b = laurelAt(e.to);
    const y = TILE_H + CAESAR_H / 2 + 0.01;
    await arcMove(caesar, V3(a[0], y, a[1]), V3(b[0], (spaceTiles[e.to] ? y : CAESAR_H / 2 + 0.005), b[1]), 2.4, 640);
    caesarAt = e.to;
  }
  async function animOne(e) {
    // an "I" tile leaves the stack for the player who gave consent
    for (let k = 0; k < e.ones; k++) {
      const top = onesStack.filter((x) => x.visible).pop();
      if (!top) return;
      const from = top.position.clone(), edge = playerEdge();
      await tween(320, (q) => { const t = ease(q); top.position.set(lerp(from.x, edge.x, t), from.y + Math.sin(Math.PI * t) * 1.2, lerp(from.z, edge.z, t)); });
      top.visible = false; top.position.copy(from);
    }
  }
  /* a burst of gold over a Senate seat */
  const sparkGeo = new T.SphereGeometry(0.05, 6, 4), sparkMat = new T.MeshBasicMaterial({ color: '#ffd76a', transparent: true });
  async function animSenate(e) {
    const xz = seatXZ('S', e.idx), sparks = [];
    for (let k = 0; k < 26; k++) {
      const m = new T.Mesh(sparkGeo, sparkMat.clone());
      const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.4;
      m.userData.v = V3(Math.cos(a) * v, 1.6 + Math.random() * 2.2, Math.sin(a) * v);
      m.position.set(xz[0], 0.9, xz[1]); scene.add(m); sparks.push(m);
    }
    await tween(900, (k) => {
      sparks.forEach((m) => { const v = m.userData.v; m.position.set(xz[0] + v.x * k, 0.9 + v.y * k - 2.6 * k * k, xz[1] + v.z * k); m.material.opacity = 1 - k; });
    });
    sparks.forEach((m) => { scene.remove(m); m.material.dispose(); });
  }
  async function play(e) {
    busy++;
    try {
      if (e.e === 'place') await animPlace(e);
      else if (e.e === 'move') await animMove(e);
      else if (e.e === 'laurel') await animLaurel(e);
      else if (e.e === 'refill') await animRefill(e);
      else if (e.e === 'caesar') await animCaesar(e);
      else if (e.e === 'consent') await animOne(e);
      else if (e.e === 'senate') await animSenate(e);
    } finally { busy--; kick(); }
  }
  let busy = 0;

  /* ------------------------------------------------ the camera */
  let W = 1, H = 1, orient = 'front';
  const cs = { tx: 0, tz: 0.2, zoom: 1, fit: 40, pitch: 0.96 };
  let azOverride = null;
  function azimuth() { return azOverride !== null ? azOverride : orient === 'side' ? Math.PI / 2 : 0; }
  function placeCamera() {
    const d = cs.fit / cs.zoom, az = azimuth();
    const horiz = Math.cos(cs.pitch) * d, y = Math.sin(cs.pitch) * d;
    cam.position.set(cs.tx + Math.sin(az) * horiz, y, cs.tz + Math.cos(az) * horiz);
    cam.up.set(0, 1, 0);
    cam.lookAt(cs.tx, 0, cs.tz);
    cam.updateMatrixWorld();
  }
  const tableBounds=D.TABLE_VIEW;
  const corners = [[tableBounds.x0,tableBounds.z0],[tableBounds.x0+tableBounds.w,tableBounds.z0],[tableBounds.x0,tableBounds.z0+tableBounds.d],[tableBounds.x0+tableBounds.w,tableBounds.z0+tableBounds.d]];
  function computeFit() {
    const save = Object.assign({}, cs);
    cs.zoom = 1; cs.tx = 0; cs.tz = orient === 'side' ? 0 : 0.25;
    let lo = 5, hi = 200;
    for (let it = 0; it < 28; it++) {
      const mid = (lo + hi) / 2; cs.fit = mid; placeCamera();
      let ok = true;
      for (const [bx, bz] of corners) {
        for (const yy of [0, 1.6]) {
          const p = new T.Vector3(bx, yy, bz).project(cam);
          if (Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.95) ok = false;
        }
      }
      if (ok) hi = mid; else lo = mid;
    }
    const fit = hi;
    Object.assign(cs, save);
    return fit;
  }
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    orient = W > H * 1.08 ? 'side' : 'front';
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    cs.fit = computeFit();
    resetCamera(false);
    faceTiles();
    if(V)setView(V);
  }
  function resetCamera(animate) {
    const target = { zoom: 1, tx: 0, tz: orient === 'side' ? 0 : 0.25 };
    if (!animate) { Object.assign(cs, target); placeCamera(); kick(); return; }
    const z0 = { zoom: cs.zoom, tx: cs.tx, tz: cs.tz };
    tween(420, (k) => { const q = ease(k); cs.zoom = lerp(z0.zoom, target.zoom, q); cs.tx = lerp(z0.tx, target.tx, q); cs.tz = lerp(z0.tz, target.tz, q); placeCamera(); });
  }
  function clampCam() {
    cs.zoom = clamp(cs.zoom, 0.8, 3.4);
    cs.tx = clamp(cs.tx, B.x0, B.x0 + B.w); cs.tz = clamp(cs.tz, B.z0, B.z0 + B.d);
  }
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function groundAt(sx, sy) {
    ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const out = new T.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }
  function zoomAround(sx, sy, factor) {
    const before = groundAt(sx, sy);
    cs.zoom = clamp(cs.zoom * factor, 0.8, 3.4); placeCamera();
    const after = groundAt(sx, sy);
    if (before && after) { cs.tx += before.x - after.x; cs.tz += before.z - after.z; }
    clampCam(); placeCamera(); kick();
  }
  function project(x, y, z) { const p = new T.Vector3(x, y, z).project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z]; }
  /* bring a board point into view (used when a CPU acts somewhere the zoomed-in view does not show) */
  function ensureVisible(x, z) {
    if (cs.zoom <= 1.05) return;
    const p = project(x, 0, z);
    if (p[0] > W * 0.08 && p[0] < W * 0.92 && p[1] > H * 0.08 && p[1] < H * 0.92) return;
    resetCamera(true);
  }

  /* ------------------------------------------------ input */
  const ptrs = new Map();
  let gesture = null, lastTap = 0, onTapFn = null;
  function local(e) { const r = canvasEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvasEl.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    ptrs.set(e.pointerId, { x, y, x0: x, y0: y, t0: performance.now() });
    try { canvasEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (ptrs.size === 1) gesture = { kind: 'maybe' };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cs.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  });
  canvasEl.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p || !gesture) return;
    const [x, y] = local(e);
    const px = p.x, py = p.y; p.x = x; p.y = y;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const want = clamp(gesture.z0 * d / Math.max(10, gesture.d0), 0.8, 3.4);
      zoomAround(mx, my, want / cs.zoom);
      const g0 = groundAt(gesture.mx, gesture.my), g1 = groundAt(mx, my);
      if (g0 && g1) { cs.tx += g0.x - g1.x; cs.tz += g0.z - g1.z; clampCam(); placeCamera(); }
      gesture.mx = mx; gesture.my = my;
      kick(); return;
    }
    if (gesture.kind === 'maybe' && Math.hypot(x - p.x0, y - p.y0) > 10) gesture.kind = 'pan';
    if (gesture.kind === 'pan') {
      const g0 = groundAt(px, py), g1 = groundAt(x, y);
      if (g0 && g1) { cs.tx += g0.x - g1.x; cs.tz += g0.z - g1.z; clampCam(); placeCamera(); kick(); }
    }
  });
  function endPtr(e) {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p || !gesture) return;
    if (ptrs.size) { if (gesture.kind === 'pinch') gesture = { kind: 'pan' }; return; }
    const g = gesture; gesture = null;
    if (e.type === 'pointercancel' || g.kind !== 'maybe') return;
    if (performance.now() - p.t0 > 650) return;
    const now = performance.now();
    if (now - lastTap < 300) { lastTap = 0; resetCamera(true); return; }
    lastTap = now;
    const hit = pick(p.x, p.y);
    if (onTapFn) onTapFn(hit, p.x, p.y);
  }
  canvasEl.addEventListener('pointerup', endPtr);
  canvasEl.addEventListener('pointercancel', endPtr);
  canvasEl.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); zoomAround(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  function pick(sx, sy) {
    ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const objs = [];
    senators.forEach((g) => { if (g.visible) g.children.forEach((c) => { if (c.userData.pick) objs.push(c); }); });
    supplyLabels.forEach(label=>{if(label.visible)objs.push(label);});
    const hitS = ray.intersectObjects(objs, false)[0];
    if (hitS) return hitS.object.userData.pick;
    const hits = ray.intersectObjects(pickables, false);
    const lau = hits.find((h) => h.object.userData.pick.kind === 'laurel');
    if (lau) return { kind: 'laurel', id: lau.object.userData.pick.id };
    if (hits[0]) return { kind: 'committee', id: hits[0].object.userData.pick.id };
    // near misses: the closest laurel or committee within a finger's width
    const unit = Math.abs(project(1, 0, 0)[0] - project(0, 0, 0)[0]) + Math.abs(project(0, 0, 1)[1] - project(0, 0, 0)[1]);
    let best = null;
    D.PATHS.forEach((p) => { if (!p.laurel) return; const q = project(p.at[0], 0, p.at[1]); const d = Math.hypot(q[0] - sx, q[1] - sy); if (d < Math.max(22, unit * 0.7) && (!best || d < best.d)) best = { d, hit: { kind: 'laurel', id: p.id } }; });
    if (best) return best.hit;
    return null;
  }

  /* ------------------------------------------------ the render loop: only while something changes */
  let raf = 0, idleOrbit = false, orbitT = 0;
  function frame(now) {
    raf = 0;
    let more = false;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); } else more = true;
    }
    // highlighted things breathe
    const pulse = 0.65 + 0.35 * Math.sin(now / 260);
    let glowing = false;
    Object.values(hlMeshes).forEach((m) => { if (m.visible) { m.material.opacity = pulse; glowing = true; } });
    if (hl.senators.length) { ringMat.opacity = 0.55 + 0.45 * Math.sin(now / 220); glowing = true; }
    if (idleOrbit) {
      orbitT += 0.0022;
      const d = cs.fit * 0.92;
      cam.position.set(Math.sin(orbitT) * d * 0.62, d * 0.62, Math.cos(orbitT) * d * 0.62);
      cam.lookAt(0, 0, -1.2);
      more = true;
    }
    renderer.render(scene, cam);
    if (more || glowing) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  window.addEventListener('resize', () => { resize(); kick(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { resize(); kick(); });

  resize();
  setStacks(18, 34);
  placeCaesar(D.CAESAR_START);
  kick();
  return {
    setView, play, highlight, resize, resetCamera, kick, project, ensureVisible,
    setHost(el) { if (el && el !== container) { container = el; el.appendChild(canvasEl); } resize(); kick(); },
    onTap(fn) { onTapFn = fn; },
    setSpeed(f) { speed = f; },
    /* a fixed camera (covers and screenshots): { tx, tz, zoom, pitch, az } */
    setCam(o) { idleOrbit = false; if (o.az !== undefined) azOverride = o.az; ['tx', 'tz', 'zoom', 'pitch'].forEach((k) => { if (o[k] !== undefined) cs[k] = o[k]; }); placeCamera(); faceTiles(); kick(); },
    setTitleMode(on) { idleOrbit = !!on; if (!on) { resize(); } kick(); },
    get busy() { return busy > 0; },
    get orient() { return orient; },
    seatScreen(cid, seat) { const xz = seatXZ(cid, seat); return project(xz[0], 0.4, xz[1]); },
    committeeScreen(cid) { const c = D.COM[cid]; return project(c.x, 0.05, cid === 'S' ? c.z - 1.6 : c.z); },
    laurelScreen(pid) { const a = laurelAt(pid); return project(a[0], 0.05, a[1]); },
    canvas: canvasEl
  };
}
