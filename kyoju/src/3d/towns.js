// 集落の生成：通り・建物・城壁・名所。すべてメートル単位の実寸。
import { SETTLEMENTS, ROADS, RIVER, riverAt, settleBase, heightAt } from './world.js';
import { mulberry32, clamp, lerp } from './noise.js';

/* ---------- 占有グリッド（2m） ---------- */
class Occ {
  constructor(cx, cz, R, cell = 2) {
    this.c = cell; this.x0 = cx - R; this.z0 = cz - R; this.n = Math.ceil((2 * R) / cell); this.a = new Uint8Array(this.n * this.n);
  }
  cellOf(x, z) { return [Math.floor((x - this.x0) / this.c), Math.floor((z - this.z0) / this.c)]; }
  get(i, j) { return i < 0 || j < 0 || i >= this.n || j >= this.n ? 1 : this.a[j * this.n + i]; }
  set(i, j, v = 1) { if (i >= 0 && j >= 0 && i < this.n && j < this.n) this.a[j * this.n + i] = v; }
  rect(cx, cz, ang, w, d, pad, mark) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const hw = w / 2 + pad, hd = d / 2 + pad;
    const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const [i0, j0] = this.cellOf(cx - ex, cz - ez), [i1, j1] = this.cellOf(cx + ex, cz + ez);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = this.x0 + (i + 0.5) * this.c - cx, pz = this.z0 + (j + 0.5) * this.c - cz;
      const lx = px * c - pz * s, lz = px * s + pz * c;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
        if (mark) this.set(i, j, mark); else if (this.get(i, j)) return false;
      }
    }
    return true;
  }
  circle(cx, cz, r, mark = 1) {
    const [i0, j0] = this.cellOf(cx - r, cz - r), [i1, j1] = this.cellOf(cx + r, cz + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = this.x0 + (i + 0.5) * this.c - cx, pz = this.z0 + (j + 0.5) * this.c - cz;
      if (px * px + pz * pz <= r * r) this.set(i, j, mark);
    }
  }
  line(pts, w, mark = 1) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / (this.c * 0.7)));
      for (let q = 0; q <= n; q++) this.circle(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n, w / 2, mark);
    }
  }
}

function plen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }
function wobble(a, b, rng, amp, n) {
  const pts = [a];
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const k = n || Math.max(2, Math.round(L / 40));
  let off = 0;
  for (let i = 1; i < k; i++) {
    off = clamp(off + (rng() - 0.5) * amp, -amp * 1.5, amp * 1.5);
    const t = i / k;
    pts.push([a[0] + dx * t - (dz / L) * off, a[1] + dz * t + (dx / L) * off]);
  }
  pts.push(b);
  return pts;
}
function ellPt(s, t, k) { return [s.x + Math.cos(t) * s.wall[0] * k, s.z + Math.sin(t) * s.wall[1] * k]; }
function inEll(s, x, z, k = 1) { return ((x - s.x) / (s.wall[0] * k)) ** 2 + ((z - s.z) / (s.wall[1] * k)) ** 2 < 1; }
function ellAngle(s, x, z) { return Math.atan2((z - s.z) / s.wall[1], (x - s.x) / s.wall[0]); }
function riverHit(x, z, pad) { const r = riverAt(x, z, 200); return r && r.d < r.w * 0.5 + pad; }

// 道を、川を渡るところで切る（橋の位置を記録）
function cutAtRiver(pts, bridges, allowBridge) {
  const out = []; let cur = [];
  let wet = false, entry = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k < n; k++) {
      const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n];
      const w = riverHit(p[0], p[1], 6);
      if (w && !wet) { wet = true; entry = p; if (cur.length) cur.push(p); if (cur.length > 1) out.push(cur); cur = []; }
      else if (!w && wet) {
        wet = false;
        if (allowBridge && entry) bridges.push({ x0: entry[0], z0: entry[1], x1: p[0], z1: p[1] });
        cur = allowBridge ? [entry, p] : [p];
      } else if (!w) { if (!cur.length || k === 0) cur.push(p); }
    }
  }
  if (!wet) cur.push(pts[pts.length - 1]);
  if (cur.length > 1) out.push(cur);
  return out;
}

/* ---------- 建物の種類 ---------- */
const STYLE = { timber: 0, stone: 1, plaster: 2 };
const ROOF = { tile: 0, slate: 1, thatch: 2 };
function chooseStyle(kind, rng, core) {
  const r = rng();
  if (kind === 'village') return r < 0.6 ? STYLE.timber : r < 0.82 ? STYLE.plaster : STYLE.stone;
  if (kind === 'town') return r < 0.5 - core * 0.15 ? STYLE.timber : r < 0.78 ? STYLE.stone : STYLE.plaster;
  return r < 0.36 - core * 0.12 ? STYLE.timber : r < 0.8 ? STYLE.stone : STYLE.plaster;
}
function chooseRoof(kind, rng) {
  const r = rng();
  if (kind === 'village') return r < 0.45 ? ROOF.thatch : r < 0.9 ? ROOF.tile : ROOF.slate;
  if (kind === 'town') return r < 0.66 ? ROOF.tile : r < 0.95 ? ROOF.slate : ROOF.thatch;
  return r < 0.55 ? ROOF.tile : ROOF.slate;
}

/* ---------- 集落ごとの生成 ---------- */
export function generateSettlement(s) {
  const rng = mulberry32(s.seed * 7919 + 13);
  const R = (s.wall ? Math.max(...s.wall) : s.r) + 650;
  const occ = new Occ(s.x, s.z, R, 2);
  const base = settleBase(s);
  const out = { s, base, streets: [], plazas: [], buildings: [], walls: [], towers: [], gates: [], landmarks: [], bridges: [] };
  const core = (x, z) => clamp(1 - Math.hypot(x - s.x, z - s.z) / (s.wall ? s.wall[0] : s.r), 0, 1);

  // 川は建てられない（川筋に沿って塗る）
  {
    const P = RIVER.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (Math.hypot(a[0] - s.x, a[1] - s.z) > R * 1.5) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k < n; k++) occ.circle(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, RIVER.width[i] * 0.5 + 10, 2);
    }
  }
  // この集落を通る街道
  const myRoads = ROADS.filter((r) => r.from === s.id || r.to === s.id);
  const addStreet = (pts, w, kind, bridge = false, front = true) => {
    const parts = cutAtRiver(pts, out.bridges, bridge);
    for (const p of parts) { if (plen(p) < 8) continue; out.streets.push({ pts: p, w, kind, front }); occ.line(p, w + 1.2, 3); }
  };
  const clipRoad = (r, inside) => {
    // 集落の中心側から外へ、指定範囲内の部分だけ
    let pts = r.pts.slice();
    if (r.to === s.id) pts = pts.reverse();
    const res = [];
    for (const p of pts) { if (!inside(p[0], p[1])) { res.push(p); break; } res.push(p); }
    return res;
  };

  if (s.kind === 'village') genVillage(s, rng, occ, out, myRoads, addStreet, clipRoad, core);
  else genWalled(s, rng, occ, out, myRoads, addStreet, clipRoad, core);

  // 人口と価値を割り振る
  let tot = 0;
  for (const b of out.buildings) { b.vol = b.w * b.d * b.h; if (b.kind === 'house') tot += b.vol; }
  for (const b of out.buildings) {
    b.ground = base;
    if (b.kind === 'house') b.pop = Math.max(0, Math.round((s.pop * b.vol) / tot));
  }
  return out;
}

function placeAlong(out, occ, rng, street, side, o, s, core) {
  const pts = street.pts;
  let acc = o.startGap ? o.startGap * rng() : 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.1) continue;
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    const nx = -tz * side, nz = tx * side;
    while (acc < L) {
      const w = lerp(o.w[0], o.w[1], rng());
      const d = lerp(o.d[0], o.d[1], rng());
      const t = acc + w / 2;
      if (t > L) break;
      const px = a[0] + tx * t, pz = a[1] + tz * t;
      const set = street.w / 2 + o.setback + rng() * o.setbackVar;
      const cx = px + nx * (set + d / 2), cz = pz + nz * (set + d / 2);
      const ang = Math.atan2(nx, nz);
      if ((!o.keep || o.keep(cx, cz)) && rng() < o.density && occ.rect(cx, cz, ang, w, d, o.pad, 0)) {
        occ.rect(cx, cz, ang, w, d, 0.2, 4);
        const cr = core(cx, cz);
        const floors = Math.max(1, Math.round(lerp(o.floors[0], o.floors[1], Math.min(1, cr * 1.2 + rng() * 0.4))));
        const style = chooseStyle(s.kind, rng, cr);
        const roof = chooseRoof(s.kind, rng);
        const h = floors * 3.0 + (style === STYLE.stone ? 0.4 : 0.6);
        out.buildings.push({ kind: 'house', x: cx, z: cz, rot: ang, w, d, h, floors, style, roof, ridge: rng() < 0.78 ? 0 : 1, pitch: lerp(0.95, 1.35, rng()), jetty: style === STYLE.timber && floors > 1 ? 0.35 + rng() * 0.25 : 0, seed: rng(), hue: rng() });
        if (o.barn && rng() < o.barn) {
          const bw = lerp(11, 17, rng()), bd = lerp(7, 10, rng());
          const bx = cx + nx * (d / 2 + bd / 2 + 4 + rng() * 6), bz = cz + nz * (d / 2 + bd / 2 + 4 + rng() * 6);
          if (occ.rect(bx, bz, ang, bw, bd, 0.8, 0)) {
            occ.rect(bx, bz, ang, bw, bd, 0.2, 4);
            out.buildings.push({ kind: 'house', barn: true, x: bx, z: bz, rot: ang + (rng() < 0.5 ? Math.PI / 2 : 0), w: bw, d: bd, h: 4.2, floors: 1, style: STYLE.timber, roof: rng() < 0.6 ? ROOF.thatch : ROOF.tile, ridge: 0, pitch: 1.0, jetty: 0, seed: rng(), hue: rng() });
          }
        }
      }
      acc += w + lerp(o.gap[0], o.gap[1], rng());
    }
    acc -= L;
  }
}

function genVillage(s, rng, occ, out, myRoads, addStreet, clipRoad, core) {
  const inside = (x, z) => Math.hypot(x - s.x, z - s.z) < s.r + 170;
  // 村の中の街道
  for (const r of myRoads) addStreet(clipRoad(r, inside), r.w, 'dirt', true);
  // 横道
  const nl = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < nl; i++) {
    const ang = rng() * Math.PI * 2, L = 70 + rng() * 110;
    const a = [s.x + Math.cos(ang) * 15, s.z + Math.sin(ang) * 15];
    const b = [s.x + Math.cos(ang) * L, s.z + Math.sin(ang) * L];
    addStreet(wobble(a, b, rng, 10), 3.5, 'dirt');
  }
  // 礼拝堂
  const ca = rng() * Math.PI * 2;
  const cx = s.x + Math.cos(ca) * 28, cz = s.z + Math.sin(ca) * 28;
  if (occ.rect(cx, cz, ca, 11, 24, 2, 0) || true) {
    occ.rect(cx, cz, ca, 13, 30, 2, 5);
    out.landmarks.push({ type: 'church', x: cx, z: cz, rot: ca, scale: 0.62, name: '礼拝堂' });
  }
  for (const st of out.streets) for (const side of [-1, 1]) {
    placeAlong(out, occ, rng, st, side, { w: [8, 12.5], d: [7.5, 11], gap: [8, 22], setback: 3, setbackVar: 6, pad: 2.5, density: 0.8, floors: [1, 2], barn: 0.6, startGap: 14, keep: (x, z) => Math.hypot(x - s.x, z - s.z) < s.r - 15 }, s, core);
  }
  if (s.mill === 'wind') {
    const a = rng() * Math.PI * 2, d = s.r + 120;
    const mx = s.x + Math.cos(a) * d, mz = s.z + Math.sin(a) * d;
    out.landmarks.push({ type: 'windmill', x: mx, z: mz, rot: rng() * 6.28, name: '風車' });
  }
  if (s.mill === 'water') {
    let best = null;
    for (let k = 0; k < 500; k++) {
      const a = rng() * Math.PI * 2, d = 100 + rng() * 650;
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      const r = riverAt(x, z, 400); if (!r) continue;
      const err = Math.abs(r.d - (r.w * 0.5 + 9)) + d * 0.01;
      if (!best || err < best.err) best = { x, z, err };
    }
    if (best) { const g = gradDir(best.x, best.z); out.landmarks.push({ type: 'watermill', x: best.x, z: best.z, rot: Math.atan2(g[0], g[1]), name: '水車小屋' }); }
  }
}
function gradDir(x, z) {
  const e = 5, a = riverAt(x + e, z, 800), b = riverAt(x - e, z, 800), c = riverAt(x, z + e, 800), d = riverAt(x, z - e, 800);
  if (!a || !b || !c || !d) return [0, 1];
  const gx = a.d - b.d, gz = c.d - d.d, l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

function genWalled(s, rng, occ, out, myRoads, addStreet, clipRoad, core) {
  const cap = s.kind === 'capital';
  const [ax, az] = s.wall;
  // 門：街道が城壁を横切る場所
  const gateAngles = [];
  for (const r of myRoads) {
    const pts = r.from === s.id ? r.pts : r.pts.slice().reverse();
    for (const p of pts) if (!inEll(s, p[0], p[1])) { gateAngles.push({ t: ellAngle(s, p[0], p[1]), road: r }); break; }
  }
  for (const want of cap ? [Math.PI / 2, -Math.PI / 2 + 0.3] : [-Math.PI / 2]) {
    if (!gateAngles.some((g) => Math.abs(Math.atan2(Math.sin(g.t - want), Math.cos(g.t - want))) < 0.7)) gateAngles.push({ t: want, road: null });
  }
  gateAngles.sort((a, b) => a.t - b.t);
  // 広場
  const sqA = rng() * Math.PI;
  const sq = cap ? { x: s.x + 60, z: s.z - 210, w: 110, d: 74, rot: 0.25 } : { x: s.x + 10, z: s.z - 20, w: 78, d: 50, rot: sqA * 0.2 };
  out.plazas.push(sq);
  occ.rect(sq.x, sq.z, sq.rot, sq.w, sq.d, 0, 3);
  const sqEdge = (t) => [sq.x + Math.cos(t) * sq.w * 0.45, sq.z + Math.sin(t) * sq.d * 0.45];
  // 城と大聖堂の敷地
  if (s.castle) occ.circle(s.castle.x, s.castle.z, s.castle.r + 12, 6);
  let cat = null;
  if (s.cathedral) {
    cat = { x: s.cathedral.x, z: s.cathedral.z, rot: 0.32 };
    occ.rect(cat.x, cat.z, cat.rot, 52, 132, 6, 5);
    const cs = { x: cat.x + Math.sin(cat.rot) * -96, z: cat.z + Math.cos(cat.rot) * -96, w: 60, d: 44, rot: cat.rot };
    out.plazas.push(cs); occ.rect(cs.x, cs.z, cs.rot, cs.w, cs.d, 0, 3);
  }
  // 城壁の帯
  const ringPts = (k, n = 96) => { const p = []; for (let i = 0; i <= n; i++) p.push(ellPt(s, (i / n) * Math.PI * 2, k)); return p; };
  occ.line(ringPts(1, 160), 10, 7);
  // 大通り：門 → 広場
  for (const g of gateAngles) {
    const gp = ellPt(s, g.t, 1.0), gi = ellPt(s, g.t, 0.97);
    out.gates.push({ x: gp[0], z: gp[1], t: g.t, rot: Math.atan2(Math.cos(g.t) / ax, Math.sin(g.t) / az) });
    const target = sqEdge(Math.atan2(gi[1] - sq.z, gi[0] - sq.x));
    addStreet(wobble(ellPt(s, g.t, 1.06), target, rng, cap ? 14 : 8), cap ? 10 : 8, 'cobble', true);
    // 門の外の街道（郊外まで）
    if (g.road) {
      const r = g.road;
      const pts = r.from === s.id ? r.pts : r.pts.slice().reverse();
      const sub = [];
      for (const p of pts) { if (!inEll(s, p[0], p[1], 1.04)) sub.push(p); if (sub.length && !inEll(s, p[0], p[1], cap ? 1.55 : 2.4)) break; }
      if (sub.length > 1) addStreet(sub, r.w, 'dirt', true);
    }
  }
  // 環状路と放射路
  const rings = cap ? [0.9, 0.77, 0.64, 0.51, 0.38, 0.25] : [0.84, 0.64, 0.44];
  for (const k of rings) {
    const n = cap ? 140 : 70;
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; const j = 1 + (rng() - 0.5) * 0.03; pts.push(ellPt(s, t, k * j)); }
    addStreet(pts, k > 0.8 ? 6 : 6.5, 'cobble', false);
  }
  const nr = cap ? 26 : 12;
  for (let i = 0; i < nr; i++) {
    const t = (i / nr) * Math.PI * 2 + rng() * 0.2;
    const a = cap ? ellPt(s, t, 0.25) : sqEdge(t), b = ellPt(s, t, rings[0]);
    addStreet(wobble(a, b, rng, 9), 5.5, 'cobble', false);
  }
  // 細い路地
  const na = cap ? 170 : 34;
  for (let i = 0; i < na; i++) {
    const t = rng() * Math.PI * 2, k0 = lerp(0.2, 0.85, rng());
    const a = ellPt(s, t, k0), b = ellPt(s, t + (rng() - 0.5) * 0.35, Math.min(0.92, k0 + lerp(0.08, 0.16, rng())));
    addStreet(wobble(a, b, rng, 5, 3), 3.6, 'cobble');
  }
  // 名所
  if (cat) out.landmarks.push({ type: 'cathedral', x: cat.x, z: cat.z, rot: cat.rot, name: '大聖堂' });
  if (s.castle) out.landmarks.push({ type: 'castle', x: s.castle.x, z: s.castle.z, rot: 0.15, name: '王城', r: s.castle.r });
  {
    const ct = cap ? null : { x: sq.x + Math.cos(sq.rot + Math.PI / 2) * -48, z: sq.z + Math.sin(sq.rot + Math.PI / 2) * -48 };
    if (ct) { occ.rect(ct.x, ct.z, sq.rot, 22, 50, 2, 5); out.landmarks.push({ type: 'church', x: ct.x, z: ct.z, rot: sq.rot + Math.PI / 2, scale: 1.0, name: '聖ガルム教会' }); }
  }
  const th = { x: sq.x + Math.cos(sq.rot) * (sq.w / 2 + 12), z: sq.z + Math.sin(sq.rot) * (sq.w / 2 + 12) };
  occ.rect(th.x, th.z, sq.rot, 18, 34, 1, 5);
  out.landmarks.push({ type: 'townhall', x: th.x, z: th.z, rot: sq.rot + Math.PI / 2, name: '市庁舎' });
  if (cap) {
    // 第二の教会と修道院
    for (let i = 0; i < 3; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const t = rng() * Math.PI * 2, k = lerp(0.45, 0.8, rng());
        const p = ellPt(s, t, k), rot = rng() * Math.PI;
        if (occ.rect(p[0], p[1], rot, 24, 50, 3, 0)) { occ.rect(p[0], p[1], rot, 24, 50, 2, 5); out.landmarks.push({ type: 'church', x: p[0], z: p[1], rot, scale: 0.9, name: '教会' }); break; }
      }
    }
  }
  // 家並み
  const oIn = { w: [6, 9.5], d: [10, 15], gap: [0, 1.4], setback: 0.6, setbackVar: 0.8, pad: 0.3, density: 0.97, floors: cap ? [2, 5] : [2, 4], barn: 0, startGap: 2, keep: (x, z) => inEll(s, x, z, 0.965) };
  const oOut = { w: [7, 11], d: [8, 12], gap: [2, 8], setback: 2, setbackVar: 3, pad: 1.2, density: 0.85, floors: [1, 2], barn: 0.25, startGap: 4, keep: (x, z) => !inEll(s, x, z, 1.03) };
  for (const st of out.streets) for (const side of [-1, 1]) placeAlong(out, occ, rng, st, side, st.kind === 'cobble' ? oIn : oOut, s, core);
  // 二列目（裏の建物）
  for (const st of out.streets.filter((q) => q.kind === 'cobble')) for (const side of [-1, 1]) {
    placeAlong(out, occ, rng, st, side, Object.assign({}, oIn, { setback: 17, setbackVar: 3, density: cap ? 0.38 : 0.5, d: [8, 12], floors: [1, 3] }), s, core);
  }
  // 城壁・塔
  const perim = Math.PI * (3 * (ax + az) - Math.sqrt((3 * ax + az) * (ax + 3 * az)));
  const nt = Math.round(perim / (cap ? 85 : 72));
  const towerT = [];
  for (let i = 0; i < nt; i++) towerT.push((i / nt) * Math.PI * 2 + 0.05);
  const isGate = (t) => out.gates.some((g) => Math.abs(Math.atan2(Math.sin(g.t - t), Math.cos(g.t - t))) < (cap ? 0.035 : 0.06));
  const wallH = cap ? 15 : 11, thick = cap ? 4.2 : 3.2;
  for (let i = 0; i < nt; i++) {
    const t0 = towerT[i], t1 = towerT[(i + 1) % nt] + (i === nt - 1 ? Math.PI * 2 : 0);
    const steps = 3;
    for (let k = 0; k < steps; k++) {
      const a = t0 + ((t1 - t0) * k) / steps, b = t0 + ((t1 - t0) * (k + 1)) / steps;
      const mid = (a + b) / 2;
      if (isGate(mid) || isGate(a) || isGate(b)) continue;
      const pa = ellPt(s, a, 1), pb = ellPt(s, b, 1);
      if (riverHit((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 2)) continue;
      out.walls.push({ x0: pa[0], z0: pa[1], x1: pb[0], z1: pb[1], h: wallH, t: thick });
    }
    const tp = ellPt(s, t0, 1);
    if (!isGate(t0) && !riverHit(tp[0], tp[1], 4)) out.towers.push({ x: tp[0], z: tp[1], r: cap ? 6.5 : 5, h: wallH + (cap ? 9 : 7), round: cap || i % 2 === 0 });
  }
  // 川沿いの郊外の水車
  if (!cap) {
    for (const g of out.bridges) { out.landmarks.push({ type: 'bridge', x0: g.x0, z0: g.z0, x1: g.x1, z1: g.z1, name: '橋' }); }
  } else {
    for (const g of out.bridges) out.landmarks.push({ type: 'bridge', x0: g.x0, z0: g.z0, x1: g.x1, z1: g.z1, name: '橋' });
  }
  if (cap) out.bombard = (() => {
    const g = out.gates.find((q) => Math.cos(q.t) > 0.7) || out.gates[0];
    const p = ellPt(s, g.t - 0.05, 0.93);
    return { x: p[0], z: p[1] };
  })();
}

/* ---------- 王国全体 ---------- */
export function generateKingdom() {
  const t0 = performance.now();
  const towns = SETTLEMENTS.map((s) => generateSettlement(s));
  let id = 0;
  for (const t of towns) for (const b of t.buildings) { b.id = id++; b.sid = t.s.id; }
  return { towns, ms: performance.now() - t0 };
}
export { STYLE, ROOF };
