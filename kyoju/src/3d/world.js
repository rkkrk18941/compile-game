// アルディナ王国：実寸（メートル）の国土。x=東, z=南, y=標高。
import { fbm, ridged, vnoise, clamp, lerp, smoothstep } from './noise.js';

export const KINGDOM = {
  name: 'アルディナ王国',
  bounds: { minX: -26000, maxX: 26000, minZ: -17000, maxZ: 17000 },
  portal: { name: 'グラウ峠', x: 21300, z: -3100 },
};

export const SETTLEMENTS = [
  { id: 'milt', name: 'ミルト村', short: 'ミルト村', kind: 'village', x: 16150, z: -1250, r: 190, pop: 140, seed: 11, mill: 'wind',
    desc: 'グラウ峠のふもとの農村。麦畑と風車がある。' },
  { id: 'buchen', name: 'ブーヘン村', short: 'ブーヘン村', kind: 'village', x: 12100, z: 2650, r: 170, pop: 95, seed: 23,
    desc: 'ブナの森に囲まれた樵の村。' },
  { id: 'garmund', name: '城塞都市ガルムント', short: 'ガルムント', kind: 'town', x: 4300, z: 540, r: 300, wall: [320, 262], pop: 3200, seed: 37,
    desc: 'アル川の渡しに築かれた交易都市。石の城壁と四つの門を持つ。' },
  { id: 'linden', name: 'リンデン村', short: 'リンデン村', kind: 'village', x: -4650, z: -2150, r: 210, pop: 170, seed: 41, mill: 'water',
    desc: 'アル川沿いの村。水車小屋がある。' },
  { id: 'hasel', name: 'ハーゼル村', short: 'ハーゼル村', kind: 'village', x: -9750, z: 3650, r: 170, pop: 110, seed: 53,
    desc: '街道から外れた丘の上の村。' },
  { id: 'capital', name: '王都アルディナ', short: '王都', kind: 'capital', x: -15400, z: 150, r: 900, wall: [950, 720], pop: 24000, seed: 67,
    castle: { x: -15630, z: -360, r: 175, h: 34 }, cathedral: { x: -15120, z: 470 },
    desc: '王城と大聖堂を抱く王国の都。城壁には大射石砲が据えられている。' },
];
export const SETTLE_BY_ID = Object.fromEntries(SETTLEMENTS.map((s) => [s.id, s]));

/* ---------- 川 ---------- */
const RIVER_CTRL = [
  [27000, -12600, 12], [21500, -9700, 14], [16800, -7000, 16], [12200, -4300, 18], [8200, -1700, 20], [5900, 450, 22],
  [4300, 990, 24], [2100, 300, 26], [-1500, -1500, 28], [-4650, -2760, 30], [-8000, -2350, 32], [-11500, -1050, 34],
  [-14300, -280, 38], [-15500, 330, 40], [-16900, 880, 42], [-20000, 1900, 44], [-28000, 3200, 46],
];

function catmull(pts, step, jitter = 0, seed = 0) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const p = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
      for (let j = 2; j < p1.length; j++) p.push(lerp(p1[j], p2[j], t));
      out.push(p);
    }
  }
  out.push(pts[pts.length - 1].slice());
  if (jitter) {
    const orig = out.map((p) => p.slice());
    let acc = 0;
    for (let i = 1; i < out.length - 1; i++) {
      const a = orig[i - 1], b = orig[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
      acc += Math.hypot(orig[i][0] - a[0], orig[i][1] - a[1]) * 0.5 + Math.hypot(b[0] - orig[i][0], b[1] - orig[i][1]) * 0.5;
      const fade = Math.min(1, i / 6, (out.length - 1 - i) / 6);
      const m = ((vnoise(acc / 900 + seed, seed * 0.37) * 2 - 1) * jitter + (vnoise(acc / 260 + seed * 2, 4.1) * 2 - 1) * jitter * 0.25) * fade;
      out[i][0] = orig[i][0] + (-dz / d) * m; out[i][1] = orig[i][1] + (dx / d) * m;
    }
  }
  return out;
}

export const RIVER = (() => {
  const pts = catmull(RIVER_CTRL, 30, 160, 5.3);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  // 川底の標高：上流 560m → 下流 142m
  const floor = cum.map((c) => { const u = c / total; return 142 + 418 * Math.pow(1 - u, 2.2); });
  return { pts, cum, total, floor, width: pts.map((p) => p[2]) };
})();

/* ---------- 線分の空間索引 ---------- */
class SegIndex {
  constructor(lines, cell) {
    this.cell = cell; this.map = new Map(); this.segs = [];
    for (const L of lines) {
      for (let i = 0; i < L.pts.length - 1; i++) {
        const a = L.pts[i], b = L.pts[i + 1];
        const seg = { ax: a[0], az: a[1], bx: b[0], bz: b[1], line: L, i };
        this.segs.push(seg);
        const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
        const z0 = Math.floor(Math.min(a[1], b[1]) / cell), z1 = Math.floor(Math.max(a[1], b[1]) / cell);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const k = x * 100003 + z; let arr = this.map.get(k); if (!arr) this.map.set(k, (arr = [])); arr.push(seg);
        }
      }
    }
  }
  // 最も近い線分：{d, seg, t}
  nearest(x, z, maxR) {
    const c = this.cell, cx = Math.floor(x / c), cz = Math.floor(z / c), rr = Math.ceil(maxR / c);
    let best = maxR, bs = null, bt = 0;
    for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) {
      const arr = this.map.get((cx + i) * 100003 + cz + j); if (!arr) continue;
      for (let q = 0; q < arr.length; q++) {
        const s = arr[q];
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1);
        const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
        if (d < best) { best = d; bs = s; bt = t; }
      }
    }
    return { d: best, seg: bs, t: bt };
  }
}
const riverIndex = new SegIndex([{ pts: RIVER.pts, id: 'river' }], 2100);
export function riverAt(x, z, maxR = 2000) {
  const r = riverIndex.nearest(x, z, maxR);
  if (!r.seg) return null;
  const i = r.seg.i;
  return { d: r.d, floor: lerp(RIVER.floor[i], RIVER.floor[i + 1], r.t), w: lerp(RIVER.width[i], RIVER.width[i + 1], r.t), i, t: r.t, s: lerp(RIVER.cum[i], RIVER.cum[i + 1], r.t) };
}

/* ---------- 標高 ---------- */
function rawHeight(x, z) {
  let h = 215 + 62 * fbm(x / 7200, z / 7200, 4) + 16 * fbm(x / 1700 + 31, z / 1700 - 17, 3);
  // 東のグラウ山地
  const m = smoothstep(15200, 23000, x + 900 * fbm(z / 5000, 3.3, 2));
  if (m > 0) h += m * m * (420 + 1050 * ridged(x / 5200, z / 5200, 4));
  // 北の丘陵
  const n = smoothstep(-6500, -15500, z + 1500 * fbm(x / 6000, 1.7, 2));
  if (n > 0) h += n * (120 + 260 * (0.5 + 0.5 * fbm(x / 4200 + 7, z / 4200, 3)));
  // 南の丘
  const s = smoothstep(7000, 16000, z);
  if (s > 0) h += s * 110 * (0.6 + 0.4 * fbm(x / 3000, z / 3000 + 9, 3));
  return h;
}
// 峠道：魔界の裂け目からミルト村へ下る谷
const PASS = [[KINGDOM.portal.x, KINGDOM.portal.z], [19400, -2650], [17600, -1700]];
function passValley(x, z) {
  if (x < 15500) return null;
  let best = 1e9, u = 0;
  for (let i = 0; i < PASS.length - 1; i++) {
    const a = PASS[i], b = PASS[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; u = (i + (1 - t)) / (PASS.length - 1); }
  }
  return { d: best, floor: lerp(300, 760, u) };
}

const SETTLE_BASE = new Map();
function settleBase(s) {
  if (SETTLE_BASE.has(s.id)) return SETTLE_BASE.get(s.id);
  let h = rawHeight(s.x, s.z);
  const rv = riverAt(s.x, s.z, 4000);
  if (rv && rv.d < 1500) h = Math.max(lerp(h, rv.floor + 9, smoothstep(1500, 300, rv.d)), rv.floor + 8);
  SETTLE_BASE.set(s.id, h);
  return h;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const pv = passValley(x, z);
  if (pv && pv.d < 3200) h = lerp(h, Math.min(h, pv.floor + pv.d * 0.1), Math.exp(-((pv.d / 1150) ** 2)));
  const rv = riverAt(x, z, 2000);
  if (rv) {
    const valley = rv.floor + 4 + rv.d * 0.035 + 18 * smoothstep(300, 1600, rv.d);
    h = lerp(h, Math.min(h, valley), Math.exp(-((rv.d / 1100) ** 2)) * smoothstep(2000, 1500, rv.d));
  }
  for (const s of SETTLEMENTS) {
    const ex = s.wall ? s.wall[0] : s.r, ez = s.wall ? s.wall[1] : s.r;
    const dx = (x - s.x) / ex, dz = (z - s.z) / ez;
    const e = Math.sqrt(dx * dx + dz * dz) * Math.max(ex, ez);
    const R = Math.max(ex, ez);
    if (e < R + 420) h = lerp(h, settleBase(s), smoothstep(R + 420, R * 0.85, e));
    if (s.castle) {
      const c = s.castle, d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 2.2) h += c.h * (1 - smoothstep(c.r * 0.55, c.r * 2.2, d)) + 2.5 * smoothstep(c.r * 0.7, c.r * 0.5, d);
    }
  }
  if (rv && rv.d < rv.w * 0.5 + 14) {
    const bank = rv.floor + 2.2;
    const half = rv.w * 0.5;
    if (rv.d < half) h = Math.min(h, rv.floor - 2.6 * (1 - (rv.d / half) ** 2));
    else h = Math.min(h, lerp(rv.floor + 0.2, Math.max(h, bank), smoothstep(half, half + 14, rv.d)));
  }
  return h;
}

/* ---------- 道 ---------- */
const P = KINGDOM.portal;
const ROAD_DEFS = [
  { id: 'r1', kind: 'main', from: 'portal', to: 'milt', w: 6, ctrl: [[P.x, P.z], [19400, -2650], [17600, -1700], [16150, -1250]] },
  { id: 'r2', kind: 'main', from: 'milt', to: 'buchen', w: 6, ctrl: [[16150, -1250], [15000, -350], [13600, 1350], [12100, 2650]] },
  { id: 'r3', kind: 'main', from: 'buchen', to: 'garmund', w: 6, ctrl: [[12100, 2650], [10300, 2700], [8200, 1900], [6200, 900], [4300, 540]] },
  { id: 'r4', kind: 'main', from: 'garmund', to: 'linden', w: 6, ctrl: [[4300, 540], [2400, 520], [300, -150], [-1600, -880], [-3400, -1650], [-4650, -2150]] },
  { id: 'r5', kind: 'main', from: 'linden', to: 'capital', w: 7, ctrl: [[-4650, -2150], [-6600, -1700], [-8800, -1000], [-11300, -380], [-13300, 120], [-15400, 150]] },
  { id: 'r6', kind: 'side', from: 'linden', to: 'hasel', w: 4, ctrl: [[-4650, -2150], [-5800, -400], [-7700, 1700], [-9750, 3650]] },
  { id: 'r7', kind: 'side', from: 'capital', to: 'west', w: 6, ctrl: [[-15400, 150], [-18200, 700], [-21500, 1500], [-27000, 2300]] },
  { id: 'r8', kind: 'side', from: 'garmund', to: 'south', w: 4, ctrl: [[4300, 540], [4450, 1600], [4900, 4200], [5600, 9000], [6200, 17500]] },
  { id: 'r9', kind: 'side', from: 'capital', to: 'north', w: 4, ctrl: [[-15400, 150], [-15200, -2400], [-14400, -6800], [-13600, -17500]] },
  { id: 'r10', kind: 'side', from: 'buchen', to: 'north', w: 3, ctrl: [[12100, 2650], [11600, 6200], [10800, 11000], [10000, 17500]] },
];
export const ROADS = ROAD_DEFS.map((r, i) => {
  const pts = catmull(r.ctrl, 22, r.kind === 'main' ? 70 : 90, 11 + i * 3.1);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return Object.assign({}, r, { pts, cum, length: cum[cum.length - 1] });
});
const roadIndex = new SegIndex(ROADS, 600);
export function roadAt(x, z, maxR = 60) { const r = roadIndex.nearest(x, z, maxR); return r.seg ? { d: r.d, road: r.seg.line, i: r.seg.i, t: r.t } : null; }

// 巨獣の進路：峠 → ミルト → ブーヘン → ガルムント → リンデン → 王都
export const ROUTE = (() => {
  const order = ['r1', 'r2', 'r3', 'r4', 'r5'];
  const pts = [];
  for (const id of order) { const r = ROADS.find((q) => q.id === id); for (let i = pts.length ? 1 : 0; i < r.pts.length; i++) pts.push(r.pts[i]); }
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const stops = [];
  for (const s of SETTLEMENTS) {
    let best = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - s.x, pts[i][1] - s.z); if (d < best) { best = d; bi = i; } }
    if (best < 400) stops.push({ id: s.id, s: cum[bi], i: bi });
  }
  stops.sort((a, b) => a.s - b.s);
  return { pts, cum, length: cum[cum.length - 1], stops };
})();
export function routePoint(s) {
  const { pts, cum } = ROUTE;
  s = clamp(s, 0, ROUTE.length);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  const a = pts[lo], b = pts[hi];
  return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), dx: b[0] - a[0], dz: b[1] - a[1] };
}
export function routeProject(x, z) {
  let best = 1e18, bs = 0;
  const { pts, cum } = ROUTE;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
    const d = (x - a[0] - dx * t) ** 2 + (z - a[1] - dz * t) ** 2;
    if (d < best) { best = d; bs = cum[i] + t * (cum[i + 1] - cum[i]); }
  }
  return { s: bs, d: Math.sqrt(best) };
}
// 道のりの距離表（km）
export function roadDistances() {
  const out = [];
  const stops = [{ id: 'portal', name: KINGDOM.portal.name, s: 0 }].concat(ROUTE.stops.map((t) => ({ id: t.id, name: SETTLE_BY_ID[t.id].short, s: t.s })));
  for (let i = 1; i < stops.length; i++) out.push({ from: stops[i - 1], to: stops[i], km: (stops[i].s - stops[i - 1].s) / 1000 });
  const side = ROADS.find((r) => r.id === 'r6');
  out.push({ from: { id: 'linden', name: 'リンデン村' }, to: { id: 'hasel', name: 'ハーゼル村' }, km: side.length / 1000, side: true });
  return out;
}

/* ---------- 土地利用 ---------- */
export function settleDist(x, z) {
  let best = 1e9, bs = null;
  for (const s of SETTLEMENTS) {
    const ex = s.wall ? s.wall[0] : s.r, ez = s.wall ? s.wall[1] : s.r;
    const d = (Math.sqrt(((x - s.x) / ex) ** 2 + ((z - s.z) / ez) ** 2) - 1) * Math.max(ex, ez);
    if (d < best) { best = d; bs = s; }
  }
  return { d: best, s: bs };
}
// 戻り値：[森, 畑, 集落の土, 湿地] それぞれ 0..1
export function landAt(x, z, h, out = [0, 0, 0, 0]) {
  const sd = settleDist(x, z);
  const rv = riverAt(x, z, 400);
  const rd = roadAt(x, z, 60);
  const big = sd.s && sd.s.kind !== 'village';
  // 畑：集落のまわりと平地
  let field = smoothstep(big ? 4200 : 2300, big ? 900 : 260, sd.d) * 0.95;
  field = Math.max(field, 0.55 * smoothstep(420, 280, h) * (0.5 + 0.5 * vnoise(x / 2600 + 50, z / 2600)));
  field *= smoothstep(-40, 30, sd.d);
  // 森
  let forest = smoothstep(0.02, 0.32, fbm(x / 2600 + 100, z / 2600 - 50, 4) + 0.12);
  const bx = x - 12600, bz = z - 4300;
  forest = Math.max(forest, smoothstep(3600, 1800, Math.hypot(bx * 0.8, bz)) * 0.95);
  forest = Math.max(forest, smoothstep(470, 650, h) * smoothstep(1250, 1050, h) * 0.9);
  forest *= 1 - field * 0.92;
  forest *= smoothstep(30, 140, sd.d);
  if (rd) forest *= smoothstep(10, 34, rd.d);
  let wet = 0;
  if (rv) { wet = smoothstep(rv.w * 0.5 + 70, rv.w * 0.5 + 6, rv.d); forest *= 1 - wet * 0.7; field *= 1 - wet; }
  const settle = smoothstep(60, -30, sd.d) * (sd.s && sd.s.kind === 'village' ? 0.35 : 1);
  out[0] = clamp(forest, 0, 1); out[1] = clamp(field, 0, 1); out[2] = settle; out[3] = wet;
  return out;
}
export function forestAt(x, z) { const h = heightAt(x, z); return landAt(x, z, h)[0]; }

/* ---------- 実行時の高さキャッシュ（4mごと） ---------- */
const TILE = 64, STEP = 4, NS = TILE / STEP + 1;
const tiles = new Map();
function tileOf(tx, tz) {
  const k = tx * 100003 + tz;
  let t = tiles.get(k);
  if (!t) {
    t = new Float32Array(NS * NS);
    for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) t[j * NS + i] = heightAt(tx * TILE + i * STEP, tz * TILE + j * STEP);
    tiles.set(k, t);
    if (tiles.size > 12000) tiles.clear();
  }
  return t;
}
export function groundH(x, z) {
  const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
  const t = tileOf(tx, tz);
  const lx = (x - tx * TILE) / STEP, lz = (z - tz * TILE) / STEP;
  const i = Math.min(NS - 2, Math.floor(lx)), j = Math.min(NS - 2, Math.floor(lz));
  const fx = lx - i, fz = lz - j;
  const a = t[j * NS + i], b = t[j * NS + i + 1], c = t[(j + 1) * NS + i], d = t[(j + 1) * NS + i + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function groundNormal(x, z, e = 3) {
  const hx = groundH(x + e, z) - groundH(x - e, z), hz = groundH(x, z + e) - groundH(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz, l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}
export function inRiver(x, z) { const rv = riverAt(x, z, 120); return rv && rv.d < rv.w * 0.5 + 2; }
export { settleBase };
