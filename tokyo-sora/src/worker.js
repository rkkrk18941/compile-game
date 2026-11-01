// City tile builder (Web Worker).
// For one z14 tile: fetch OpenMapTiles (OpenFreeMap) + PLATEAU building tiles, then build
// buildings (with per-building metadata for destruction), road/sidewalk/rail/park/water overlays,
// elevated expressway structures, trees, street lights, a road graph for traffic & pedestrians,
// collision footprints and place names.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import earcut from 'earcut';
import { poiCategory, edgeActivity } from './activity.js';

const E = 4096;            // working extent (z14 tile units)
const TALL_MIN = 28;
let URBAN = [];
const ctrls = new Map();

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') { URBAN = m.urban || []; return; }
  if (m.type === 'cancel') { const c = ctrls.get(m.id); if (c) c.abort(); return; }
  if (m.type !== 'build') return;
  const ctl = new AbortController();
  ctrls.set(m.id, ctl);
  try {
    const out = await job(m, ctl.signal);
    const tr = [];
    const add = (o) => { for (const k in o) { const v = o[k]; if (v && v.buffer instanceof ArrayBuffer && ArrayBuffer.isView(v)) tr.push(v.buffer); } };
    for (const c of out.chunks) add(c);
    if (out.coll) add(out.coll);
    if (out.meta) add(out.meta);
    if (out.overlay) add(out.overlay);
    if (out.struct) add(out.struct);
    if (out.graph) add(out.graph);
    if (out.trees) tr.push(out.trees.buffer);
    if (out.lights) tr.push(out.lights.buffer);
    self.postMessage({ type: 'done', id: m.id, ...out }, [...new Set(tr)]);
  } catch (err) {
    self.postMessage({ type: 'fail', id: m.id, aborted: !!(err && err.name === 'AbortError'), msg: String((err && err.message) || err) });
  } finally { ctrls.delete(m.id); }
};

async function fetchBytes(url, signal, soft) {
  try {
    const res = await fetch(url, { signal });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    return bytes;
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    if (soft) return null;
    throw e;
  }
}
const decode = (bytes) => { try { return bytes ? new VectorTile(new Pbf(bytes)) : null; } catch (e) { return null; } };

// ---------- growable typed arrays ----------
class GF { constructor(n) { this.a = new Float32Array(n || 1024); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { let l = this.a.length * 2; while (l < this.n + k) l *= 2; const b = new Float32Array(l); b.set(this.a); this.a = b; } }
  p(...v) { this.need(v.length); for (const x of v) this.a[this.n++] = x; }
  out() { return this.a.slice(0, this.n); } }
class GU8 { constructor(n) { this.a = new Uint8Array(n || 1024); this.n = 0; }
  p4(a, b, c, d) { if (this.n + 4 > this.a.length) { const x = new Uint8Array(this.a.length * 2); x.set(this.a); this.a = x; } const r = this.a; r[this.n++] = a; r[this.n++] = b; r[this.n++] = c; r[this.n++] = d; }
  out() { return this.a.slice(0, this.n); } }
class GU32 { constructor(n) { this.a = new Uint32Array(n || 1024); this.n = 0; }
  p(v) { if (this.n >= this.a.length) { const x = new Uint32Array(this.a.length * 2); x.set(this.a); this.a = x; } this.a[this.n++] = v; }
  out() { return this.a.slice(0, this.n); } }

class Chunk {
  constructor() { this.pos = new GF(8192); this.uv = new GF(4096); this.col = new GU8(8192); this.cen = new GF(4096); this.idx = new GU32(8192); this.v = 0;
    this.b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; }
  vert(x, y, z, u, v, c, cu, cv) {
    this.pos.p(x, y, z); this.uv.p(u, v); this.col.p4(c[0], c[1], c[2], c[3]); this.cen.p(cu, cv);
    const b = this.b; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
    return this.v++;
  }
  tri(a, b, c) { this.idx.p(a); this.idx.p(b); this.idx.p(c); }
  finish() {
    const idxRaw = this.idx.out();
    const idx = this.v <= 65535 ? Uint16Array.from(idxRaw) : idxRaw;
    const b = this.b;
    const cen = new Uint16Array(this.cen.n);
    for (let i = 0; i < this.cen.n; i++) cen[i] = Math.max(0, Math.min(65535, Math.round(this.cen.a[i] * 65535)));
    return { pos: this.pos.out(), uv: this.uv.out(), col: this.col.out(), cen, idx,
      bs: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2] };
  }
}

// ---------- geometry helpers ----------
function ringArea(r) { let a = 0; for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y; return a / 2; }
function clipAxis(pts, axis, v, keepGreater) {
  const res = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const av = axis ? a.y : a.x, bv = axis ? b.y : b.x;
    const ain = keepGreater ? av >= v : av <= v, bin = keepGreater ? bv >= v : bv <= v;
    if (ain) res.push(a);
    if (ain !== bin) { const t = (v - av) / (bv - av); res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return res;
}
function clipRing(pts, x0, y0, x1, y1) {
  let inside = true;
  for (const p of pts) if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) { inside = false; break; }
  if (inside) return pts;
  let r = clipAxis(pts, 0, x0, true);
  if (r.length) r = clipAxis(r, 0, x1, false);
  if (r.length) r = clipAxis(r, 1, y0, true);
  if (r.length) r = clipAxis(r, 1, y1, false);
  return r;
}
function cleanRing(r) {
  const out = [];
  for (const p of r) { const q = out[out.length - 1]; if (!q || Math.abs(q.x - p.x) > 1e-3 || Math.abs(q.y - p.y) > 1e-3) out.push(p); }
  while (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a.x - b.x) <= 1e-3 && Math.abs(a.y - b.y) <= 1e-3) out.pop(); else break; }
  return out;
}
function clipSeg(ax, ay, bx, by, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; } }
  }
  return [t0, t1];
}
function clipLine(pts, x0, y0, x1, y1) {
  const out = []; let cur = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const r = clipSeg(a.x, a.y, b.x, b.y, x0, y0, x1, y1);
    if (!r) { if (cur) { out.push(cur); cur = null; } continue; }
    const pa = r[0] > 0 ? { x: a.x + (b.x - a.x) * r[0], y: a.y + (b.y - a.y) * r[0], cut: true } : a;
    const pb = r[1] < 1 ? { x: a.x + (b.x - a.x) * r[1], y: a.y + (b.y - a.y) * r[1], cut: true } : b;
    if (!cur || r[0] > 0) { if (cur) out.push(cur); cur = [pa]; }
    cur.push(pb);
    if (r[1] < 1) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((l) => l.length >= 2);
}
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function parseColour(s) {
  if (typeof s !== 'string') return null;
  let m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  m = /^#?([0-9a-f]{3})$/i.exec(s.trim());
  if (m) { const v = m[1]; return [parseInt(v[0] + v[0], 16), parseInt(v[1] + v[1], 16), parseInt(v[2] + v[2], 16)]; }
  return null;
}
function pipXY(r, x, y) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i].x, yi = r[i].y, xj = r[j].x, yj = r[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// simple uniform grid over polygons (z14 extent units) for point-in-building tests
class PolyGrid {
  constructor(cell) { this.c = cell; this.m = new Map(); this.polys = []; }
  add(ring, data) {
    const i = this.polys.length; this.polys.push({ ring, data });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of ring) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    const c = this.c;
    for (let gy = Math.floor(y0 / c); gy <= Math.floor(y1 / c); gy++) for (let gx = Math.floor(x0 / c); gx <= Math.floor(x1 / c); gx++) {
      const k = gx * 100003 + gy; let a = this.m.get(k); if (!a) this.m.set(k, (a = [])); a.push(i);
    }
  }
  hit(x, y) {
    const a = this.m.get(Math.floor(x / this.c) * 100003 + Math.floor(y / this.c));
    if (!a) return null;
    for (const i of a) if (pipXY(this.polys[i].ring, x, y)) return this.polys[i];
    return null;
  }
}

const PALETTE = [[214, 210, 201], [204, 199, 190], [226, 222, 214], [190, 194, 198], [172, 176, 181], [217, 207, 192], [200, 188, 170], [233, 229, 221], [186, 180, 172], [222, 214, 200], [168, 150, 132], [238, 236, 230]];
const GLASSY = [[146, 165, 183], [126, 146, 166], [168, 182, 196], [110, 124, 140], [188, 196, 204], [150, 160, 168]];

function guessHeight(area, r, urban) {
  if (area < 45) return 3.5 + r * 3;
  if (area < 120) return 6 + r * 4;
  if (area < 300) return 7 + r * (6 + 16 * urban);
  if (area < 1000) return 9 + r * (10 + 28 * urban);
  if (area < 5000) return 12 + r * (12 + 34 * urban);
  return 10 + r * (14 + 12 * urban);
}

// ---------------- the job ----------------
async function job(m, signal) {
  const S = m.size, full = m.lod === 2, sc = S / E;
  const urbanAt = (wx, wz) => { let u = 0; for (const c of URBAN) { const d = Math.hypot(wx - c[0], wz - c[1]); const v = Math.exp(-d / c[2]) * c[3]; if (v > u) u = v; } return Math.min(1, u); };
  // fetch: PLATEAU (23 wards, measured heights) + OpenMapTiles (roads, parks, places, buildings elsewhere)
  const plSub = [];
  if (m.plUrl) {
    if (full) { for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) plSub.push({ ox: sx * E / 4, oy: sy * E / 4, span: 0.25, clip: [sx * E / 4, sy * E / 4, (sx + 1) * E / 4, (sy + 1) * E / 4], url: m.plUrl.replace('{z}', 16).replace('{x}', m.x * 4 + sx).replace('{y}', m.y * 4 + sy) }); }
    else { const qx = m.x & 1, qy = m.y & 1; plSub.push({ ox: -qx * E, oy: -qy * E, span: 2, clip: [0, 0, E, E], url: m.plUrl.replace('{z}', 13).replace('{x}', m.x >> 1).replace('{y}', m.y >> 1) }); }
  }
  const plP = Promise.all(plSub.map((p) => fetchBytes(p.url, signal, true)));
  let osmBytes = null, plBytes;
  if (full) [osmBytes, plBytes] = await Promise.all([m.osmUrl ? fetchBytes(m.osmUrl, signal, !!m.osmSoft) : Promise.resolve(null), plP]);
  else {
    plBytes = await plP;
    // far tiles inside the 23 wards only need PLATEAU's tall buildings: skip the (big) OSM tile
    let cnt = 0;
    plSub.forEach((ps, i) => { const vt = decode(plBytes[i]); const l = vt && vt.layers.bldg; if (!l) return; const ext = l.extent || 4096;
      for (let j = 0; j < l.length && cnt < 30; j++) { const g = l.feature(j).loadGeometry(); const q = g[0] && g[0][0]; if (!q) continue; const X = ps.ox + q.x * (E / ext) * ps.span, Y = ps.oy + q.y * (E / ext) * ps.span; if (X >= 0 && Y >= 0 && X <= E && Y <= E) cnt++; } });
    if (cnt < 30 && m.osmUrl) osmBytes = await fetchBytes(m.osmUrl, signal, !!m.osmSoft);
  }
  const osm = decode(osmBytes);
  const out = { chunks: [], places: [], coll: null, meta: null, ids: [], overlay: null, struct: null, graph: null, trees: null, lights: null, pois: [], nb: 0, osmOk: !!osm, plCount: 0 };

  // DEM in z14 extent units
  const dem = m.dem;
  const demAt = (px, py) => {
    if (!dem) return 0;
    let x = (px / E) * 256 - 0.5, y = (py / E) * 256 - 0.5;
    if (x < 0) x = 0; else if (x > 255) x = 255; if (y < 0) y = 0; else if (y > 255) y = 255;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), fx = x - x0, fy = y - y0;
    const a = dem[y0 * 256 + x0], b = dem[y0 * 256 + x1], c = dem[y1 * 256 + x0], d = dem[y1 * 256 + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  const LX = (px) => (px / E - 0.5) * S, LZ = (py) => (py / E - 0.5) * S;

  // ---------- places ----------
  if (osm && osm.layers.place) {
    const pl = osm.layers.place, ext = pl.extent || 4096, k = E / ext;
    for (let i = 0; i < pl.length; i++) {
      const f = pl.feature(i), p = f.properties;
      const name = p['name:ja'] || p.name || p['name:latin'];
      if (!name) continue;
      const g = f.loadGeometry(); const pt = g[0] && g[0][0];
      if (!pt || pt.x < 0 || pt.y < 0 || pt.x > ext || pt.y > ext) continue;
      out.places.push({ name: String(name), cls: String(p.class || ''), rank: +p.rank || 0, x: LX(pt.x * k), z: LZ(pt.y * k) });
    }
  }

  // POIs retain their actual category and position. Unnamed features get a category,
  // never a fabricated business name. Tile buffers are excluded to avoid duplicates.
  const poiSeen = new Set();
  if (full && osm) for (const layerName of ['poi', 'park']) {
    const l = osm.layers[layerName]; if (!l) continue;
    const k = E / (l.extent || E);
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i); if (f.type !== 1) continue;
      const p = f.properties, pt = f.loadGeometry()[0]?.[0]; if (!pt) continue;
      const px = pt.x * k, py = pt.y * k;
      if (px < 0 || py < 0 || px >= E || py >= E || (+p.level || 0) < 0) continue;
      const cat = poiCategory(layerName === 'park' ? { ...p, subclass: 'park' } : p);
      const name = String(p['name:ja'] || p.name || p['name:nonlatin'] || p['name:latin'] || '');
      if (!name && cat[0] === 'place') continue;
      const poiKey = cat[0]+':'+name+':'+Math.round(px*sc/3)+':'+Math.round(py*sc/3);
      if (poiSeen.has(poiKey)) continue; poiSeen.add(poiKey);
      out.pois.push({ id: layerName + ':' + (f.id ?? i) + ':' + m.x + '/' + m.y, name: name || cat[1], named: !!name, kind: cat[0], category: cat[1], color: cat[2], attraction: cat[3], px, py, x: LX(px), z: LZ(py), y: demAt(px, py), level: Number(p.level) || 0, rank: +p.rank || 100 });
    }
  }
  const poiCells = new Map();
  for (const p of out.pois) { const key = Math.floor(p.px/128)+','+Math.floor(p.py/128); if (!poiCells.has(key)) poiCells.set(key, []); poiCells.get(key).push(p); }

  // ---------- collect building footprints ----------
  const feats = [];
  const plGrid = new PolyGrid(96);
  plSub.forEach((ps, i) => {
    const vt = decode(plBytes[i]);
    const l = vt && vt.layers.bldg;
    if (!l) return;
    const ext = l.extent || 4096, k = (E / ext) * ps.span, ox = ps.ox, oy = ps.oy, clip = ps.clip;
    for (let j = 0; j < l.length; j++) {
      const f = l.feature(j);
      if (f.type !== 3) continue;
      let rings; try { rings = f.loadGeometry(); } catch (e) { continue; }
      const p = f.properties;
      const h = Number(p.measuredHeight);
      if (!full && !(h >= 20)) continue;
      const rr = rings.map((r) => r.map((q) => ({ x: ox + q.x * k, y: oy + q.y * k })));
      feats.push({ rings: rr, h: h > 0 ? h : NaN, mh: 0, known: h > 0, id: 'P' + (p['建物ID'] || (i + '_' + j)), clip, src: 1 });
      out.plCount++;
    }
  });
  const nPl = feats.length;
  if (osm && osm.layers.building) {
    const bl = osm.layers.building, ext = bl.extent || 4096, k = E / ext;
    for (let i = 0; i < bl.length; i++) {
      const f = bl.feature(i);
      if (f.type !== 3) continue;
      const p = f.properties;
      if (p.hide_3d === true || p.hide_3d === 'true' || p.hide_3d === 1) continue;
      const h = Number(p.render_height), mh = Number(p.render_min_height) || 0;
      const known = Number.isFinite(h) && h > 0 && h !== 5;
      if (!full && (!known || h < TALL_MIN)) continue;
      let rings; try { rings = f.loadGeometry(); } catch (e) { continue; }
      const rr = k === 1 ? rings : rings.map((r) => r.map((q) => ({ x: q.x * k, y: q.y * k })));
      feats.push({ rings: rr, h: known ? h : NaN, mh, known, id: f.id !== undefined ? 'O' + f.id : null, colour: p.colour, clip: [0, 0, E, E], src: 0, osmIdx: i });
    }
  }

  // ---------- buildings ----------
  const G = full ? 4 : 1;
  const chunks = []; for (let i = 0; i < G * G; i++) chunks.push(new Chunk());
  const cPts = new GF(8192), cStart = [], cCnt = [], cBot = [], cTop = [], cBB = [];
  const mChunk = [], mVS = [], mVC = [], mIS = [], mIC = [], mCx = [], mCz = [], mBase = [], mArea = [];
  const bGrid = full ? new PolyGrid(128) : null; // all building outlines (for tree placement)
  const excl = m.excl || [];

  for (let fi = 0; fi < feats.length; fi++) {
    const ft = feats[fi];
    // rings -> polygons
    const polys = [];
    for (const raw of ft.rings) {
      const r = cleanRing(raw);
      if (r.length < 3) continue;
      const a = ringArea(r);
      if (a === 0) continue;
      if (a > 0 || !polys.length) { if (a < 0) r.reverse(); polys.push([r]); } else polys[polys.length - 1].push(r);
    }
    for (let pi = 0; pi < polys.length; pi++) {
      const poly = polys[pi];
      const cl = ft.clip;
      const rings2 = [];
      for (let r = 0; r < poly.length; r++) {
        const c = cleanRing(clipRing(poly[r], cl[0], cl[1], cl[2], cl[3]));
        if (c.length < 3 || Math.abs(ringArea(c)) * sc * sc < (r === 0 ? 6 : 2)) { if (r === 0) break; continue; }
        rings2.push(c);
      }
      if (!rings2.length) continue;
      const outer = rings2[0];
      let sx = 0, sy = 0;
      for (const q of outer) { sx += q.x; sy += q.y; }
      const ccx = sx / outer.length, ccy = sy / outer.length;
      // OSM duplicates of PLATEAU buildings are dropped
      if (ft.src === 0 && nPl) {
        let hits = plGrid.hit(ccx, ccy) ? 2 : 0;
        for (let q = 0; q < outer.length && hits < 2; q += Math.max(1, (outer.length / 4) | 0)) if (plGrid.hit(outer[q].x, outer[q].y)) hits++;
        if (hits >= 2) continue;
      }
      if (ft.src === 1) plGrid.add(outer, null);
      const areaM = Math.abs(ringArea(outer)) * sc * sc;
      let gMin = 1e9, gSum = 0;
      for (const q of outer) { const g = demAt(q.x, q.y); gSum += g; if (g < gMin) gMin = g; }
      const lx = LX(ccx), lz = LZ(ccy);
      const gBase = gSum / outer.length;
      const seedR = hash2(Math.round(outer[0].x * 7 + m.x * 131), Math.round(outer[0].y * 7 + m.y * 977));
      const urban = urbanAt(m.cx + lx, m.cz + lz);
      let hh = ft.known ? ft.h : guessHeight(areaM, seedR, urban);
      let skip = false;
      for (const e of excl) if (hh >= e.minH && Math.hypot(lx - e.x, lz - e.z) < e.r) { if (e.clampH) hh = e.clampH; else skip = true; break; }
      if (skip) continue;
      const top = gBase + hh;
      const bot = ft.mh > 0.5 ? gBase + ft.mh : gMin - 4;
      if (top - bot < 0.5) continue;
      // Only attach storefronts to footprints containing the mapped business.
      const businesses = [];
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const q of outer) { bx0=Math.min(bx0,q.x); by0=Math.min(by0,q.y); bx1=Math.max(bx1,q.x); by1=Math.max(by1,q.y); }
      if (full) for (let gy=Math.floor(by0/128);gy<=Math.floor(by1/128);gy++) for (let gx=Math.floor(bx0/128);gx<=Math.floor(bx1/128);gx++) {
        for (const p of poiCells.get(gx+','+gy) || []) {
          if (p.building || !pipXY(outer,p.px,p.py) || rings2.slice(1).some(r=>pipXY(r,p.px,p.py))) continue;
          if (p.level <= 0 && ['convenience','shop','food','health'].includes(p.kind)) businesses.push(p);
          p.building = true; p.roof = top; p.buildingId = ft.id ? (polys.length > 1 ? ft.id + '#' + pi : ft.id) : 'H' + m.x + '_' + m.y + '_' + Math.round(ccx) + '_' + Math.round(ccy);
          // Position the map sign on the nearest facade; facade design is schematic.
          if (p.level > 0) continue;
          let best=Infinity;
          for(let j=0;j<outer.length;j++) { const a=outer[j], b=outer[(j+1)%outer.length], dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy); if(len*sc<2) continue;
            const f=Math.max(0.15,Math.min(0.85,((p.px-a.x)*dx+(p.py-a.y)*dy)/(len*len))), x=a.x+dx*f, y=a.y+dy*f, d=Math.hypot(x-p.px,y-p.py);
            if(d<best){best=d; p.sign={x:LX(x+dy/len*0.25/sc),z:LZ(y-dx/len*0.25/sc),y:gBase+Math.min(3,hh*0.65),yaw:Math.atan2(dy,-dx),width:Math.min(6,len*sc*0.7)};}
          }
        }
      }
      // style: 0 office, 1 apartment, 2 house, 3 apartment with shops
      const r2 = hash2(Math.round(ccx * 13) + 7, Math.round(ccy * 11) + m.y);
      let style;
      if (hh < 10.5 && areaM < 260) style = 2;
      else if (hh >= 45 || (areaM > 1500 && hh > 18)) style = 0;
      else style = urban > 0.35 && r2 < 0.55 ? (r2 < 0.3 ? 3 : 0) : (r2 < 0.25 ? 3 : 1);
      if (businesses.length) style = 3;
      else if (style === 3) style = 1; // no invented ground-floor shops
      // colour
      const pick = hash2(Math.round(outer[0].x * 3 + 17), Math.round(outer[0].y * 5 + m.y));
      const pal = style === 0 && hh > 40 ? GLASSY : PALETTE;
      const b0 = pal[Math.floor(pick * pal.length) % pal.length];
      const cc = parseColour(ft.colour);
      const rgb = cc && !(cc[0] === cc[1] && cc[1] === cc[2] && cc[0] < 40) ? [(cc[0] + b0[0]) >> 1, (cc[1] + b0[1]) >> 1, (cc[2] + b0[2]) >> 1] : b0;
      const col = [rgb[0], rgb[1], rgb[2], ((Math.floor(seedR * 63) & 63) << 2) | style];
      const cu = ccx / E, cv = ccy / E; // centroid in tile uv (roof photo lookup)
      let ci = 0;
      if (G > 1) ci = Math.min(G - 1, Math.max(0, Math.floor((ccy / E) * G))) * G + Math.min(G - 1, Math.max(0, Math.floor((ccx / E) * G)));
      const ch = chunks[ci];
      const vs = ch.v, is = ch.idx.n;
      // gable roof for small simple houses
      const gable = false; // roof shape is unknown: keep the source footprint rather than invent a pitched roof
      if (gable) emitGable(ch, outer, bot, top, gBase, col, cu, cv, LX, LZ, sc);
      else emitPrism(ch, rings2, bot, top, gBase, col, cu, cv, LX, LZ, sc, ft.mh > 0.5);
      // collision + metadata
      if (full) {
        const st = cPts.n / 2;
        let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for (const q of outer) { const x = LX(q.x), z = LZ(q.y); cPts.p(x, z); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
        cStart.push(st); cCnt.push(outer.length); cBot.push(bot); cTop.push(top); cBB.push(x0, z0, x1, z1);
        mChunk.push(ci); mVS.push(vs); mVC.push(ch.v - vs); mIS.push(is); mIC.push(ch.idx.n - is);
        mCx.push(lx); mCz.push(lz); mBase.push(gBase); mArea.push(areaM);
        out.ids.push(ft.id ? (polys.length > 1 ? ft.id + '#' + pi : ft.id) : 'H' + m.x + '_' + m.y + '_' + Math.round(ccx) + '_' + Math.round(ccy));
        bGrid.add(outer, null);
      }
      out.nb++;
    }
  }
  for (const c of chunks) if (c.v > 0) out.chunks.push(Object.assign(c.finish(), { ci: chunks.indexOf(c) }));
  // chunk index remap (only non-empty chunks are sent)
  if (full && cStart.length) {
    const remap = new Map(); out.chunks.forEach((c, i) => remap.set(c.ci, i));
    const nb = cStart.length, C = 32, GN = Math.ceil(S / C) + 1;
    const counts = new Uint32Array(GN * GN);
    const range = (b) => [Math.max(0, Math.floor((cBB[b * 4] + S / 2) / C)), Math.max(0, Math.floor((cBB[b * 4 + 1] + S / 2) / C)), Math.min(GN - 1, Math.floor((cBB[b * 4 + 2] + S / 2) / C)), Math.min(GN - 1, Math.floor((cBB[b * 4 + 3] + S / 2) / C))];
    for (let b = 0; b < nb; b++) { const [x0, z0, x1, z1] = range(b); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) counts[z * GN + x]++; }
    const cellStart = new Uint32Array(GN * GN + 1);
    for (let i = 0; i < GN * GN; i++) cellStart[i + 1] = cellStart[i] + counts[i];
    const fill = cellStart.slice(0, GN * GN), cellItems = new Uint32Array(cellStart[GN * GN]);
    for (let b = 0; b < nb; b++) { const [x0, z0, x1, z1] = range(b); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cellItems[fill[z * GN + x]++] = b; }
    out.coll = { pts: cPts.out(), start: Uint32Array.from(cStart), cnt: Uint32Array.from(cCnt), bot: Float32Array.from(cBot), top: Float32Array.from(cTop), bb: Float32Array.from(cBB), cellStart, cellItems, GN, C, nb };
    out.meta = { chunk: Uint16Array.from(mChunk.map((c) => remap.get(c))), vs: Uint32Array.from(mVS), vc: Uint32Array.from(mVC), is: Uint32Array.from(mIS), ic: Uint32Array.from(mIC), cx: Float32Array.from(mCx), cz: Float32Array.from(mCz), base: Float32Array.from(mBase), area: Float32Array.from(mArea) };
  }
  if (!full || !osm) return out;

  // ---------- roads, rails, parks, water ----------
  buildGround(osm, out, m, demAt, LX, LZ, sc, bGrid);
  return out;
}

function emitPrism(ch, rings2, bot, top, gBase, col, cu, cv, LX, LZ, sc, underside) {
  const flat = [], holes = [], topIdx = [], botIdx = [];
  for (let r = 0; r < rings2.length; r++) {
    const ring = rings2[r], n = ring.length;
    const a = ringArea(ring);
    if ((r === 0 && a < 0) || (r > 0 && a > 0)) ring.reverse();
    if (r > 0) holes.push(flat.length / 2);
    const vb = ch.v;
    const cum = new Float32Array(n + 1);
    for (let j = 1; j <= n; j++) { const q = ring[j % n], pq = ring[j - 1]; cum[j] = cum[j - 1] + Math.hypot(q.x - pq.x, q.y - pq.y) * sc; }
    for (let j = 0; j <= n; j++) { const q = ring[j % n]; ch.vert(LX(q.x), bot, LZ(q.y), cum[j], bot - gBase, col, cu, cv); }
    for (let j = 0; j <= n; j++) { const q = ring[j % n]; ch.vert(LX(q.x), top, LZ(q.y), cum[j], top - gBase, col, cu, cv); }
    for (let j = 0; j < n; j++) {
      const a0 = vb + j, b0 = vb + j + 1, a1 = vb + n + 1 + j, b1 = a1 + 1;
      ch.tri(a0, b1, b0); ch.tri(a0, a1, b1);
    }
    for (let j = 0; j < n; j++) { const q = ring[j]; flat.push(LX(q.x), LZ(q.y)); topIdx.push(vb + n + 1 + j); botIdx.push(vb + j); }
  }
  let tri;
  try { tri = earcut(flat, holes.length ? holes : undefined, 2); } catch (e) { tri = []; }
  if (!tri.length) return;
  let flip = false;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 2, b = tri[t + 1] * 2, c = tri[t + 2] * 2;
    const cr = (flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]) - (flat[b + 1] - flat[a + 1]) * (flat[c] - flat[a]);
    if (Math.abs(cr) > 1e-6) { flip = cr > 0; break; }
  }
  for (let t = 0; t < tri.length; t += 3) {
    const a = topIdx[tri[t]], b = topIdx[tri[t + 1]], c = topIdx[tri[t + 2]];
    if (flip) ch.tri(a, c, b); else ch.tri(a, b, c);
    if (underside) { const a2 = botIdx[tri[t]], b2 = botIdx[tri[t + 1]], c2 = botIdx[tri[t + 2]]; if (flip) ch.tri(a2, b2, c2); else ch.tri(a2, c2, b2); }
  }
}

// Gable roof on a 4-corner footprint: walls up to the eaves, two sloped roof planes, triangular gable ends.
function emitGable(ch, ring, bot, top, gBase, col, cu, cv, LX, LZ, sc) {
  if (ringArea(ring) < 0) ring.reverse();
  const P = ring.map((q) => [LX(q.x), LZ(q.y)]);
  const len = (i) => Math.hypot(P[(i + 1) % 4][0] - P[i][0], P[(i + 1) % 4][1] - P[i][1]);
  // ridge runs along the longer pair of opposite edges
  const k = len(0) + len(2) >= len(1) + len(3) ? 0 : 1; // edges k and k+2 are the long (eave) sides
  const short = (len(k + 1) + len((k + 3) % 4)) / 2;
  const roofH = Math.min(3.2, Math.max(1.2, short * 0.32), (top - gBase) * 0.45);
  const eave = top - roofH;
  const mid = (a, b) => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
  const r0 = mid((k + 1) % 4, (k + 2) % 4), r1 = mid((k + 3) % 4, k % 4); // ridge ends at the middle of the short edges
  const V = (x, y, z, u) => ch.vert(x, y, z, u, y - gBase, col, cu, cv);
  // walls (4 quads up to eaves), u = running perimeter length
  let u = 0;
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], l = len(i);
    const a0 = V(a[0], bot, a[1], u), b0 = V(b[0], bot, b[1], u + l), a1 = V(a[0], eave, a[1], u), b1 = V(b[0], eave, b[1], u + l);
    ch.tri(a0, b1, b0); ch.tri(a0, a1, b1);
    // gable triangle on the short edges
    if (i === (k + 1) % 4 || i === (k + 3) % 4) {
      const rr = i === (k + 1) % 4 ? r0 : r1;
      const t0 = V(a[0], eave, a[1], u), t1 = V(b[0], eave, b[1], u + l), t2 = V(rr[0], top, rr[1], u + l / 2);
      ch.tri(t0, t2, t1);
    }
    u += l;
  }
  // roof planes (slightly overhanging is skipped for simplicity)
  const e0 = k % 4, e1 = (k + 1) % 4, e2 = (k + 2) % 4, e3 = (k + 3) % 4;
  // plane over edge k: corners e0,e1 at eave, ridge r1 (near e0) and r0 (near e1)
  const q = (x, z, y) => V(x, y, z, 0);
  const A = q(P[e0][0], P[e0][1], eave), B = q(P[e1][0], P[e1][1], eave), R0 = q(r0[0], r0[1], top), R1 = q(r1[0], r1[1], top);
  upTri(ch, A, B, R0); upTri(ch, A, R0, R1);
  const C2 = q(P[e2][0], P[e2][1], eave), D = q(P[e3][0], P[e3][1], eave), R0b = q(r0[0], r0[1], top), R1b = q(r1[0], r1[1], top);
  upTri(ch, C2, D, R1b); upTri(ch, C2, R1b, R0b);
}
function upTri(ch, a, b, c) {
  const p = ch.pos.a;
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az, vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
  const ny = uz * vx - ux * vz; // y of cross(u, v)
  if (ny >= 0) ch.tri(a, b, c); else ch.tri(a, c, b);
}

// ---------- roads / ground overlays ----------
const RC = { motorway: 1, trunk: 2, primary: 3, secondary: 4, tertiary: 5, minor: 6, service: 7, path: 8, rail: 9, track: 10 };
const ROADW = { 1: 7.5, 2: 13, 3: 11, 4: 9.5, 5: 7.5, 6: 5.2, 7: 3.6, 8: 2.4, 10: 3 };
const ONEWAYW = { 1: 7.5, 2: 7.5, 3: 6.8, 4: 6, 5: 5, 6: 3.6, 7: 3.4 };
const SIDEW = { 2: 3.2, 3: 3, 4: 2.6, 5: 2.0 };

class Mesh { // generic overlay/structure mesh
  constructor() { this.pos = new GF(16384); this.uv = new GF(8192); this.inf = new GU8(8192); this.idx = new GU32(16384); this.v = 0; }
  vert(x, y, z, u, v, i0, i1, i2, i3) { this.pos.p(x, y, z); this.uv.p(u, v); this.inf.p4(i0, i1, i2, i3); return this.v++; }
  tri(a, b, c) { this.idx.p(a); this.idx.p(b); this.idx.p(c); }
  out() { const r = this.idx.out(); return { pos: this.pos.out(), uv: this.uv.out(), inf: this.inf.out(), idx: this.v <= 65535 ? Uint16Array.from(r) : r }; }
}

function buildGround(osm, out, m, demAt, LX, LZ, sc, bGrid) {
  const S = m.size;
  const ov = { water: new Mesh(), grass: new Mesh(), walk: new Mesh(), minor: new Mesh(), major: new Mesh(), rail: new Mesh() };
  const st = new Mesh();
  const rand = rng(m.x * 9781 + m.y * 6271);
  const trees = new GF(4096), lights = new GF(1024);
  const maxTrees = m.maxTrees || 2500;
  const zones = [];
  const toLocal = (q) => ({ x: LX(q.x), z: LZ(q.y), px: q.x, py: q.y });

  // polygons (water / grass) → flat overlay
  const fillPoly = (mesh, rings, kind, yOff) => {
    const flat = [], holes = [], verts = [];
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      if (r > 0) holes.push(flat.length / 2);
      for (const q of ring) { flat.push(q.x, q.y); verts.push(q); }
    }
    let tri; try { tri = earcut(flat, holes.length ? holes : undefined, 2); } catch (e) { return; }
    const base = mesh.v;
    for (const q of verts) { const x = LX(q.x), z = LZ(q.y); mesh.vert(x, demAt(q.x, q.y) + yOff, z, x, z, kind, 0, 0, 0); }
    for (let t = 0; t < tri.length; t += 3) upTriM(mesh, base + tri[t], base + tri[t + 1], base + tri[t + 2]);
  };
  const polyLayer = (name, fn) => {
    const l = osm.layers[name]; if (!l) return;
    const ext = l.extent || 4096, k = E / ext;
    for (let i = 0; i < l.length; i++) {
      const f = l.feature(i); if (f.type !== 3) continue;
      const kind = fn(f.properties); if (kind < 0) continue;
      let rings; try { rings = f.loadGeometry(); } catch (e) { continue; }
      const polys = [];
      for (const raw of rings) {
        let r = cleanRing(raw.map((q) => ({ x: q.x * k, y: q.y * k })));
        if (r.length < 3) continue;
        const a = ringArea(r); if (a === 0) continue;
        if (a > 0 || !polys.length) { if (a < 0) r.reverse(); polys.push([r]); } else polys[polys.length - 1].push(r);
      }
      for (const poly of polys) {
        const rr = [];
        for (let r = 0; r < poly.length; r++) { const c = cleanRing(clipRing(poly[r], 0, 0, E, E)); if (c.length < 3) { if (r === 0) break; continue; } rr.push(c); }
        if (!rr.length) continue;
        if (name === 'park') {
          const props=f.properties, title=String(props['name:ja'] || props.name || '');
          if(title){let px=rr[0].reduce((a,p)=>a+p.x,0)/rr[0].length,py=rr[0].reduce((a,p)=>a+p.y,0)/rr[0].length;
            if(!out.pois.some(p=>p.kind==='park'&&p.name===title))out.pois.push({id:'park-area:'+m.x+'/'+m.y+':'+i,name:title,named:true,kind:'park',category:'公園・自然',color:'#488747',attraction:0.8,px,py,x:LX(px),z:LZ(py),y:demAt(px,py),rank:1,level:0});
          }
        }
        if (name !== 'water') zones.push({ rings: rr, cls: String(f.properties.class || ''), kind });
        if (kind === 7) fillPoly(ov.water, rr, 7, 0.03);
        else if (kind !== 13) {
          if (kind !== 11) fillPoly(ov.grass, rr, kind, 0.05); // forests keep the aerial photo, only trees are added
          // trees inside parks & woods
          const area = Math.abs(ringArea(rr[0])) * sc * sc;
          const dens = kind === 11 ? 1 / 70 : kind === 12 ? 1 / 260 : 1 / 900;
          let n = Math.min(900, Math.round(area * dens));
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const q of rr[0]) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
          for (let t = 0; t < n * 3 && n > 0 && trees.n / 5 < maxTrees; t++) {
            const px = x0 + rand() * (x1 - x0), py = y0 + rand() * (y1 - y0);
            if (!pipXY(rr[0], px, py)) continue;
            let inHole = false; for (let h = 1; h < rr.length; h++) if (pipXY(rr[h], px, py)) { inHole = true; break; }
            if (inHole || bGrid.hit(px, py)) continue;
            trees.p(LX(px), demAt(px, py), LZ(py), 0.75 + rand() * 0.7, kind === 11 ? 1 : 0);
            n--;
          }
        }
      }
    }
  };
  polyLayer('water', (p) => (p.class === 'swimming_pool' ? -1 : 7));
  polyLayer('landcover', (p) => (p.class === 'wood' ? 11 : p.class === 'grass' ? (p.subclass === 'park' || p.subclass === 'garden' || p.subclass === 'village_green' ? 12 : 6) : -1));

  polyLayer('park', () => 12);
  // Preserve aerial details in school grounds, sports fields and parking lots.
  polyLayer('landuse', () => 13);

  // lines
  const tl = osm.layers.transportation;
  const ways = []; // graph candidates
  if (tl) {
    const ext = tl.extent || 4096, k = E / ext;
    for (let i = 0; i < tl.length; i++) {
      const f = tl.feature(i);
      if (f.type !== 2) continue;
      const p = f.properties;
      const brunnel = p.brunnel;
      if (brunnel === 'tunnel') continue;
      let cls = RC[p.class];
      if (p.class === 'transit' || p.class === 'rail') { if (p.subclass === 'subway' && brunnel !== 'bridge') continue; cls = 9; }
      if (p.class === 'path' && (p.subclass === 'pedestrian')) cls = 8;
      if (!cls || cls === 10) continue;
      const oneway = +p.oneway || 0;
      const layer = Math.max(0, +p.layer || 0);
      const elevated = brunnel === 'bridge' && (cls === 1 || (cls === 9 && layer >= 1) || ((cls === 2 || cls === 3) && layer >= 2));
      const elevH = elevated ? (cls === 9 ? 8 : 9 + 4 * Math.max(0, layer - 1)) : 0;
      let w = cls === 9 ? 4 * (p.subclass === 'rail' ? 2 : 1) : (oneway ? ONEWAYW[cls] || ROADW[cls] : ROADW[cls]);
      if (p.class === 'path' && p.subclass === 'pedestrian') w = 6;
      if (cls === 1 && !oneway) w = 15;
      let lines; try { lines = f.loadGeometry(); } catch (e) { continue; }
      for (const raw of lines) {
        const pts0 = raw.map((q) => ({ x: q.x * k, y: q.y * k, ix: q.x, iy: q.y }));
        for (const seg of clipLine(pts0, 0, 0, E, E)) {
          const pts = [];
          for (const q of seg) { const pq = pts[pts.length - 1]; if (!pq || Math.hypot(pq.px - q.x, pq.py - q.y) * sc > 0.3) pts.push({ x: LX(q.x), z: LZ(q.y), px: q.x, py: q.y, key: q.cut ? null : q.ix * 70001 + q.iy, g: demAt(q.x, q.y) }); }
          if (pts.length < 2) continue;
          for (const q of pts) q.y = q.g + (elevated ? elevH : 0);
          const hw = w / 2, sw = !elevated && SIDEW[cls] ? SIDEW[cls] : 0;
          const lanes = cls >= 8 ? 0 : Math.max(1, Math.min(6, Math.round(w / 3.25)));
          const flags = (oneway ? 1 : 0) | (cls === 6 ? 2 : 0);
          if (elevated) {
            emitDeck(st, pts, hw, cls === 9 ? 3 : 0, lanes, flags, cls === 9 ? 1.6 : 2.2);
          } else if (cls === 9) {
            ribbon(ov.rail, pts, -hw, hw, 0.22, 3, 0, 0, hw);
          } else if (cls === 8) {
            ribbon(ov.walk, pts, -hw, hw, 0.08, 2, 0, 0, hw);
          } else {
            const mesh = cls <= 5 ? ov.major : ov.minor;
            if (sw) { ribbon(ov.walk, pts, hw, hw + sw, 0.2, 1, 0, 0, sw); ribbon(ov.walk, pts, -hw - sw, -hw, 0.2, 1, 0, 0, sw); }
            ribbon(mesh, pts, -hw, hw, 0.1, 0, lanes, flags, hw);
          }
          // Schematic lights along bigger streets. Trees only come from mapped greenery.
          if (!elevated && cls >= 2 && cls <= 5) {
            let accL = rand() * 30, side = 1;
            for (let j = 1; j < pts.length; j++) {
              const a = pts[j - 1], b = pts[j];
              const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
              const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, rx = -dz, rz = dx;
              for (let s = (30 - accL % 30) % 30; s < L; s += 30) {
                side = -side;
                const off = hw + 0.5;
                const x = a.x + dx * s + rx * off * side, z = a.z + dz * s + rz * off * side;
                const px = x / sc + E / 2, py = z / sc + E / 2;
                if (px < 0 || py < 0 || px > E || py > E || bGrid.hit(px, py)) continue;
                lights.p(x, demAt(px, py), z, -rx * side, -rz * side);
              }
              accL += L;
            }
          }
          if (cls <= 8) ways.push({ pts, cls, hw, sw, oneway, elevated, restricted: p.access === 'no' || p.access === 'private' || p.class === 'service' && p.service === 'driveway' });
        }
      }
    }
  }
  // overlay mesh in draw order
  const parts = [ov.water, ov.grass, ov.walk, ov.minor, ov.major, ov.rail];
  out.overlay = mergeMeshes(parts);
  if (st.v) out.struct = st.out();
  if (trees.n) out.trees = trees.out();
  if (lights.n) out.lights = lights.out();
  out.graph = buildGraph(ways, sc);
  if (out.graph) {
    const g = out.graph, n = g.eA.length;
    const attractCells = new Map();
    for (const p of out.pois) { const key=Math.floor(p.x/100)+','+Math.floor(p.z/100); if(!attractCells.has(key)) attractCells.set(key,[]); attractCells.get(key).push(p); }
    g.ePed = new Float32Array(n); g.eCar = new Float32Array(n); g.eStation = new Float32Array(n); g.ePark = new Uint8Array(n);
    for (let e=0;e<n;e++) {
      const k=(g.eS[e]+Math.floor(g.eC[e]/2))*3, x=g.pts[k], z=g.pts[k+2], px=x/sc+E/2, py=z/sc+E/2;
      const localZones = [...new Set(zones.filter(a=>pipXY(a.rings[0],px,py) && !a.rings.slice(1).some(r=>pipXY(r,px,py))).map(a=>a.kind===12?'park':a.cls))];
      const attractions=[];
      for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) for(const p of attractCells.get((Math.floor(x/100)+dx)+','+(Math.floor(z/100)+dz)) || []) { const influence=p.attraction*Math.exp(-Math.hypot(p.x-x,p.z-z)/65); if(influence>0.04) attractions.push({kind:p.kind,influence}); }
      const a=edgeActivity(g.eCls[e],g.eSW[e],localZones,attractions,!!g.eElevated[e],!!g.eRestricted[e]);
      g.ePed[e]=a.ped;g.eCar[e]=a.car;g.eStation[e]=a.station;g.ePark[e]=a.park;
    }
  }
}
function upTriM(mesh, a, b, c) {
  const p = mesh.pos.a;
  const ax = p[a * 3], az = p[a * 3 + 2];
  const ny = (p[b * 3 + 2] - az) * (p[c * 3] - ax) - (p[b * 3] - ax) * (p[c * 3 + 2] - az);
  if (ny >= 0) mesh.tri(a, b, c); else mesh.tri(a, c, b);
}
function mergeMeshes(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.v; ni += p.idx.n; }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), inf = new Uint8Array(nv * 4), idx = nv <= 65535 ? new Uint16Array(ni) : new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.pos.a.subarray(0, p.v * 3), ov * 3); uv.set(p.uv.a.subarray(0, p.v * 2), ov * 2); inf.set(p.inf.a.subarray(0, p.v * 4), ov * 4);
    for (let i = 0; i < p.idx.n; i++) idx[oi + i] = p.idx.a[i] + ov;
    ov += p.v; oi += p.idx.n;
  }
  return { pos, uv, inf, idx };
}
// ribbon between lateral offsets o0..o1 (metres, + = right of travel direction)
function ribbon(mesh, pts, o0, o1, yOff, kind, lanes, flags, hw) {
  const n = pts.length; let along = 0;
  const base = mesh.v;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    let nx, nz, scl = 1;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    if (i > 0 && i < n - 1) {
      let d1x = p.x - a.x, d1z = p.z - a.z, d2x = b.x - p.x, d2z = b.z - p.z;
      const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1; d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
      nx = -(d1z + d2z); nz = d1x + d2x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      scl = 1 / Math.max(0.5, nx * -d1z + nz * d1x);
    } else { let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; nx = -dz / l; nz = dx / l; }
    const y = p.y + yOff;
    mesh.vert(p.x + nx * o0 * scl, y, p.z + nz * o0 * scl, o0, along, kind, lanes, flags, Math.min(255, Math.round(hw * 8)));
    mesh.vert(p.x + nx * o1 * scl, y, p.z + nz * o1 * scl, o1, along, kind, lanes, flags, Math.min(255, Math.round(hw * 8)));
  }
  for (let i = 0; i < n - 1; i++) {
    const A = base + i * 2, B = A + 1, A2 = A + 2, B2 = A + 3;
    mesh.tri(A, B, A2); mesh.tri(B, B2, A2);
  }
}
// elevated deck: road/rail surface on top, concrete sides & underside, pillars
function emitDeck(st, pts, hw, kind, lanes, flags, pillarW) {
  const th = 1.4;
  ribbon(st, pts, -hw - 0.4, hw + 0.4, 0.0, kind, lanes, flags, hw);
  const n = pts.length; let along = 0;
  const sideL = [], sideR = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; const nx = -dz / l, nz = dx / l;
    if (i > 0) along += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const o = hw + 0.4;
    sideL.push([p.x - nx * o, p.z - nz * o, p.y, along]); sideR.push([p.x + nx * o, p.z + nz * o, p.y, along]);
  }
  const wall = (side, out) => {
    const base = st.v;
    for (const s of side) { st.vert(s[0], s[2] + 0.9, s[1], 0, s[3], 4, 0, 0, 0); st.vert(s[0], s[2] - th, s[1], 0, s[3], 4, 0, 0, 0); }
    for (let i = 0; i < side.length - 1; i++) {
      const A = base + i * 2, B = A + 1, C = A + 2, D = A + 3;
      if (out) { st.tri(A, B, C); st.tri(B, D, C); } else { st.tri(A, C, B); st.tri(B, C, D); }
    }
  };
  wall(sideL, true); wall(sideR, false);
  // underside
  const base = st.v;
  for (let i = 0; i < n; i++) { st.vert(sideL[i][0], sideL[i][2] - th, sideL[i][1], 0, 0, 4, 0, 0, 0); st.vert(sideR[i][0], sideR[i][2] - th, sideR[i][1], 0, 0, 4, 0, 0, 0); }
  for (let i = 0; i < n - 1; i++) { const A = base + i * 2, B = A + 1, A2 = A + 2, B2 = A + 3; st.tri(A, A2, B); st.tri(B, A2, B2); }
  // pillars every ~26 m
  let acc = 13;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = acc; s < L; s += 26) {
      const t = s / L, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, top = a.y + (b.y - a.y) * t - th, g = a.g + (b.g - a.g) * t - 1;
      box(st, x, z, g, top, pillarW, 4);
    }
    acc = (acc - L) % 26; if (acc < 0) acc += 26;
  }
}
function box(st, x, z, y0, y1, w, kind) {
  const h = w / 2, c = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    const v0 = st.vert(a[0], y0, a[1], 0, 0, kind, 0, 0, 0), v1 = st.vert(b[0], y0, b[1], 0, 0, kind, 0, 0, 0);
    const v2 = st.vert(b[0], y1, b[1], 0, 0, kind, 0, 0, 0), v3 = st.vert(a[0], y1, a[1], 0, 0, kind, 0, 0, 0);
    st.tri(v0, v2, v1); st.tri(v0, v3, v2);
  }
}

// road graph: split ways at shared vertices → nodes & edges (polylines)
function buildGraph(ways, sc) {
  const count = new Map();
  for (const w of ways) for (let i = 0; i < w.pts.length; i++) { const k = w.pts[i].key; if (k === null || k === undefined) continue; count.set(k, (count.get(k) || 0) + 1); }
  const nodeIdx = new Map(), nodes = [];
  const nodeOf = (p) => {
    const k = p.key !== null && p.key !== undefined ? p.key : 'c' + Math.round(p.x * 10) + '_' + Math.round(p.z * 10);
    let i = nodeIdx.get(k);
    if (i === undefined) { i = nodes.length / 3; nodeIdx.set(k, i); nodes.push(p.x, p.y, p.z); }
    return i;
  };
  const pts = [], eA = [], eB = [], eS = [], eC = [], eCls = [], eHW = [], eSW = [], eOne = [], eLen = [], eElevated = [], eRestricted = [];
  for (const w of ways) {
    let start = 0;
    for (let i = 1; i < w.pts.length; i++) {
      const p = w.pts[i];
      const split = i === w.pts.length - 1 || (p.key !== null && p.key !== undefined && count.get(p.key) > 1);
      if (!split) continue;
      const seg = w.pts.slice(start, i + 1);
      let L = 0; for (let j = 1; j < seg.length; j++) L += Math.hypot(seg[j].x - seg[j - 1].x, seg[j].z - seg[j - 1].z);
      if (L > 0.5) {
        eA.push(nodeOf(seg[0])); eB.push(nodeOf(seg[seg.length - 1]));
        eS.push(pts.length / 3); eC.push(seg.length);
        for (const q of seg) pts.push(q.x, q.y, q.z);
        eCls.push(w.cls); eHW.push(w.hw); eSW.push(w.sw); eOne.push(w.oneway); eLen.push(L); eElevated.push(w.elevated ? 1 : 0); eRestricted.push(w.restricted ? 1 : 0);
      }
      start = i;
    }
  }
  const nn = nodes.length / 3, ne = eA.length;
  if (!ne) return null;
  const deg = new Uint32Array(nn + 1);
  for (let e = 0; e < ne; e++) { deg[eA[e]]++; deg[eB[e]]++; }
  const adjStart = new Uint32Array(nn + 1);
  for (let i = 0; i < nn; i++) adjStart[i + 1] = adjStart[i] + deg[i];
  const fill = adjStart.slice(0, nn), adj = new Uint32Array(adjStart[nn]);
  for (let e = 0; e < ne; e++) { adj[fill[eA[e]]++] = e; adj[fill[eB[e]]++] = e; }
  return { nodes: Float32Array.from(nodes), pts: Float32Array.from(pts), eA: Uint32Array.from(eA), eB: Uint32Array.from(eB), eS: Uint32Array.from(eS), eC: Uint32Array.from(eC),
    eElevated: Uint8Array.from(eElevated), eRestricted: Uint8Array.from(eRestricted), eCls: Uint8Array.from(eCls), eHW: Float32Array.from(eHW), eSW: Float32Array.from(eSW), eOne: Int8Array.from(eOne), eLen: Float32Array.from(eLen), adjStart, adj };
}
