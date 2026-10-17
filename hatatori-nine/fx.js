/* ハタトリ・ナイン — the formation scene. When a side finishes its formation at a flag, a band sweeps across the
   table: an army of silhouettes marches past in that formation (a wedge, a dense phalanx, ranks under banners,
   a thin skirmish line, a rabble), the formation's name slams in and the cards that made it fan out.
   Everything is drawn on one 2D canvas over the 3D table. Tap to skip. */
import { paintCard, drawArt } from './scene.js';

const RANKS = [
  { name: '寄せ集め', en: 'HOST', stars: 1 },
  { name: '散兵', en: 'SKIRMISH LINE', stars: 2 },
  { name: '大隊', en: 'BATTALION', stars: 3 },
  { name: '密集', en: 'PHALANX', stars: 4 },
  { name: '楔形', en: 'WEDGE', stars: 5 }
];
const THEME = {
  me: { sky: ['#1b0d05', '#7a2e0c', '#f0a43a', '#ffe7a1'], ink: '#140904', glow: '#ffd36a', title: ['#fff6d6', '#ffd56a', '#f0a02c'], band: 'rgba(255,214,120,0.95)' },
  op: { sky: ['#12050b', '#5a1023', '#d8405a', '#ffc2c8'], ink: '#12040a', glow: '#ff7d92', title: ['#fff0f2', '#ff9bab', '#e0405a'], band: 'rgba(255,140,160,0.95)' },
  fog: { sky: ['#0b1016', '#26323e', '#7d8e9c', '#d8e2ea'], ink: '#0b1118', glow: '#cfe0ee', title: ['#ffffff', '#d5e6f2', '#9fb6c8'], band: 'rgba(210,228,240,0.9)' }
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
/* the formation as a map symbol, drawn faintly in the sky: a chevron, a block, ranks, a dotted line, a scatter */
function diagram(g, rank, fog, cx, cy, s, dir, t, rnd) {
  g.save(); g.translate(cx, cy); g.scale(dir, 1);
  const dot = (x, y, r) => { g.beginPath(); g.arc(x * s, y * s, r * s, 0, Math.PI * 2); g.fill(); };
  if (fog) { for (let i = 0; i < 9; i++) dot(Math.sin(i * 2.1) * 0.9, Math.cos(i * 1.7) * 0.5, 0.07); }
  else if (rank === 4) { for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) dot(0.8 - r * 0.38, r === 0 ? 0 : (k / r - 0.5) * r * 0.3, 0.075); g.lineWidth = s * 0.04; g.beginPath(); g.moveTo(-0.95 * s, -0.75 * s); g.lineTo(1.05 * s, 0); g.lineTo(-0.95 * s, 0.75 * s); g.stroke(); }
  else if (rank === 3) { for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) dot(-0.75 + c * 0.3, -0.45 + r * 0.3, 0.085); g.lineWidth = s * 0.035; g.strokeRect(-0.95 * s, -0.62 * s, 1.9 * s, 1.24 * s); }
  else if (rank === 2) { for (let r = 0; r < 3; r++) { g.fillRect(-0.9 * s, (-0.55 + r * 0.5) * s, 1.8 * s, 0.12 * s); } }
  else if (rank === 1) { for (let c = 0; c < 9; c++) dot(-1 + c * 0.25, (c % 2 ? 0.12 : -0.12), 0.06); }
  else { for (let i = 0; i < 16; i++) dot(-0.9 + rnd() * 1.8, -0.55 + rnd() * 1.1, 0.04 + rnd() * 0.05); }
  g.restore();
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
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  resize();
  cv.addEventListener('pointerdown', () => { if (running) skipReq = true; });

  /* d = { mine, rank, fog, sum, cards: [ids], wilds: {id: {color, value}}, colors: [css], mode: 'full'|'short', speed, oppName } */
  function formation(d) {
    if (running) running.finish();
    resize();
    const th = d.fog ? THEME.fog : d.mine ? THEME.me : THEME.op;
    const R = RANKS[d.fog ? 0 : d.rank], dir = d.mine ? 1 : -1;
    const short = d.mode === 'short';
    const total = (short ? 1.1 : 2.2) / Math.max(0.5, d.speed || 1);
    const rnd = seeded((d.sum * 97 + d.rank * 13 + (d.mine ? 1 : 2)) >>> 0);
    const units = d.cards.slice().sort((a, b) => (b % 10) - (a % 10)).map((c) => unitOf(c, d.wilds && d.wilds[c]));
    const army = short ? [] : formationLayout(d.fog ? -1 : d.rank, d.fog, units, rnd);
    const dust = [];
    for (let i = 0; i < 46; i++) dust.push({ x: rnd(), y: rnd(), v: 0.4 + rnd() * 0.9, r: 0.6 + rnd() * 2.2, a: 0.2 + rnd() * 0.5 });
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
      const tall = H > W * 1.05;
      // dim the table
      x.fillStyle = 'rgba(4,7,10,' + (0.66 * vis) + ')'; x.fillRect(0, 0, W, H);
      // the band: a slanted strip across the table
      const bh = short ? Math.min(H * 0.3, 200) : tall ? Math.min(H * 0.52, 440) : Math.min(H * 0.74, 320);
      const cy = H * (tall ? 0.46 : 0.5), skew = W * 0.05;
      const slide = (1 - easeOut(inT)) * W * 1.2 * dir + easeIn(outT) * -W * 1.2 * dir;
      const top = cy - bh / 2 - skew * 0.4, bot = cy + bh / 2 + skew * 0.4, hor = top + (bot - top) * (short ? 0.7 : tall ? 0.6 : 0.66);
      x.save();
      x.translate(slide, 0);
      x.beginPath();
      x.moveTo(-skew, cy - bh / 2 + skew * 0.35); x.lineTo(W + skew, cy - bh / 2 - skew * 0.35);
      x.lineTo(W + skew, cy + bh / 2 - skew * 0.35); x.lineTo(-skew, cy + bh / 2 + skew * 0.35); x.closePath();
      x.save(); x.clip();
      const sky = x.createLinearGradient(0, top, 0, hor);
      sky.addColorStop(0, th.sky[0]); sky.addColorStop(0.5, th.sky[1]); sky.addColorStop(0.9, th.sky[2]); sky.addColorStop(1, th.sky[3]);
      x.fillStyle = sky; x.fillRect(-skew, top, W + 2 * skew, hor - top);
      // the sun sitting on the horizon, and its turning rays
      const sx = W * (tall ? 0.5 : d.mine ? 0.62 : 0.38), sr = bh * 0.3;
      x.globalCompositeOperation = 'lighter';
      const sg = x.createRadialGradient(sx, hor, 0, sx, hor, sr * 2.8);
      sg.addColorStop(0, th.sky[3]); sg.addColorStop(0.22, th.glow); sg.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.85; x.fillStyle = sg; x.fillRect(-skew, top, W + 2 * skew, bot - top);
      x.globalAlpha = 0.14; x.fillStyle = th.glow;
      const rot = t * 0.5 * dir;
      for (let i = 0; i < 16; i++) {
        const a0 = rot + (i / 16) * Math.PI * 2, a1 = a0 + 0.08;
        x.beginPath(); x.moveTo(sx, hor); x.lineTo(sx + Math.cos(a0) * W * 1.5, hor + Math.sin(a0) * W * 1.5); x.lineTo(sx + Math.cos(a1) * W * 1.5, hor + Math.sin(a1) * W * 1.5); x.closePath(); x.fill();
      }
      // the formation as a map symbol, high in the sky
      if (!short) {
        x.globalAlpha = 0.2 * clamp((t - 0.04) / 0.2, 0, 1); x.strokeStyle = th.glow;
        const sz = tall ? Math.min(W * 0.34, bh * 0.28) : Math.min(bh * 0.34, W * 0.16);
        diagram(x, d.rank, d.fog, tall ? W * 0.5 : W * (d.mine ? 0.62 : 0.38), top + (hor - top) * (tall ? 0.55 : 0.45), sz, dir, t, seeded(7 + d.rank));
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      // ground: a bright haze at the horizon fading into the dark
      const gg = x.createLinearGradient(0, hor, 0, bot);
      gg.addColorStop(0, th.sky[3]); gg.addColorStop(0.05, th.sky[2]); gg.addColorStop(0.42, th.ink); gg.addColorStop(1, '#000');
      x.fillStyle = gg; x.fillRect(-skew, hor, W + 2 * skew, bot - hor);
      // the army on the horizon: farther ranks smaller and higher; all of it marching toward dir
      if (army.length) {
        const march = (t - 0.45) * W * 0.14 * dir;
        const base = Math.min(bh * (tall ? 0.24 : 0.3), W * (tall ? 0.2 : 0.12));
        const spread = tall ? W * 0.42 : W * 0.3;
        const ax = tall ? W * 0.5 : W * 0.5;
        const sorted = army.slice().sort((a, b) => b.z - a.z);
        for (const u of sorted) {
          const depth = 1 - u.z * 0.5;                        // 1 front .. 0.5 back
          const sz = base * depth * u.s;
          const gx = ax + u.x * spread * dir + march * depth;
          const gy = hor + (bot - hor) * (0.03 + (1 - u.z) * (tall ? 0.6 : 0.5));
          const bob = Math.abs(Math.sin((t * 9 + u.j * 6) * (u.run ? 1.6 : 1))) * sz * 0.06;
          const img = sprite(u.u, th.ink, dir < 0 ? !u.flip : !!u.flip);
          x.drawImage(img, gx - sz / 2, gy - sz * 0.92 - bob, sz, sz);
          if (u.spear) { x.strokeStyle = th.ink; x.lineWidth = Math.max(1.2, sz * 0.04); x.beginPath(); x.moveTo(gx - sz * 0.15 * dir, gy - sz * 0.62 - bob); x.lineTo(gx + sz * 0.75 * dir, gy - sz * 1.05 - bob); x.stroke(); }
          if (u.banner) {
            x.fillStyle = th.ink; x.fillRect(gx - sz * 0.02, gy - sz * 1.7 - bob, Math.max(1.5, sz * 0.045), sz * 1.1);
            x.fillStyle = (d.colors && d.colors[0]) || th.glow;
            x.beginPath(); x.moveTo(gx, gy - sz * 1.7 - bob); x.lineTo(gx + sz * 0.5 * dir, gy - sz * 1.58 - bob); x.lineTo(gx, gy - sz * 1.4 - bob); x.closePath(); x.fill();
          }
        }
      }
      // dust kicked up by the march
      x.fillStyle = th.glow;
      for (const p of dust) {
        const px = ((p.x - t * p.v * 0.6 * dir) % 1 + 1) % 1, py = hor + (bot - hor) * (0.02 + p.y * 0.9);
        x.globalAlpha = p.a * vis * 0.6; x.beginPath(); x.arc(-skew + px * (W + 2 * skew), py, p.r, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      // fog drifts over everything in a fog flag
      if (d.fog) {
        for (let i = 0; i < 5; i++) {
          const fx2 = ((i * 0.27 + t * 0.25) % 1.3 - 0.15) * W, fy = top + (bot - top) * (0.3 + 0.13 * i);
          const fg = x.createRadialGradient(fx2, fy, 0, fx2, fy, W * 0.35);
          fg.addColorStop(0, 'rgba(225,235,242,0.38)'); fg.addColorStop(1, 'rgba(225,235,242,0)');
          x.fillStyle = fg; x.fillRect(-skew, top, W + 2 * skew, bot - top);
        }
      }
      // speed lines
      x.strokeStyle = 'rgba(255,255,255,0.2)'; x.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        const yy = top + (bot - top) * ((i * 0.37 + 0.07) % 1), len = W * (0.12 + ((i * 0.53) % 0.2)), ph = ((t * 2.4 + i * 0.29) % 1.2 - 0.1);
        const xx = dir > 0 ? ph * W * 1.2 - len : W - ph * W * 1.2;
        x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + len, yy); x.stroke();
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
  return { formation, resize, get busy() { return !!running; }, skip() { if (running) skipReq = true; }, clear() { if (running) running.finish(); }, RANKS };
}
