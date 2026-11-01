// Builds 3D building meshes from OpenMapTiles (OpenFreeMap) z14 vector tiles.
// Runs in a Web Worker: fetch -> decode -> clip -> extrude -> triangulate -> collision grid.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import earcut from 'earcut';

const TALL_MIN = 28;
const ctrls = new Map();
let URBAN = [];

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') { URBAN = m.urban || []; return; }
  if (m.type === 'cancel') { const c = ctrls.get(m.id); if (c) c.abort(); return; }
  if (m.type !== 'build') return;
  const ctl = new AbortController();
  ctrls.set(m.id, ctl);
  try {
    const res = await fetch(m.url, { signal: ctl.signal });
    if (res.status === 404 || res.status === 204) { self.postMessage({ type: 'done', id: m.id, chunks: [], places: [], coll: null }); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    const out = build(m, bytes);
    const transfer = [];
    for (const c of out.chunks) transfer.push(c.pos.buffer, c.uv.buffer, c.col.buffer, c.idx.buffer);
    if (out.coll) for (const k of ['pts', 'start', 'cnt', 'bot', 'top', 'bb', 'cellStart', 'cellItems']) transfer.push(out.coll[k].buffer);
    self.postMessage({ type: 'done', id: m.id, chunks: out.chunks, places: out.places, coll: out.coll, nb: out.nb }, transfer);
  } catch (err) {
    self.postMessage({ type: 'fail', id: m.id, aborted: !!(err && err.name === 'AbortError'), msg: String(err && err.message || err) });
  } finally {
    ctrls.delete(m.id);
  }
};

// ---------- growable typed arrays ----------
class GF32 { constructor(n) { this.a = new Float32Array(n); this.n = 0; }
  push2(x, y) { if (this.n + 2 > this.a.length) this.grow(); this.a[this.n++] = x; this.a[this.n++] = y; }
  push3(x, y, z) { if (this.n + 3 > this.a.length) this.grow(); this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
  grow() { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
  out() { return this.a.slice(0, this.n); } }
class GU8 { constructor(n) { this.a = new Uint8Array(n); this.n = 0; }
  push4(r, g, b, s) { if (this.n + 4 > this.a.length) { const c = new Uint8Array(this.a.length * 2); c.set(this.a); this.a = c; } const a = this.a; a[this.n++] = r; a[this.n++] = g; a[this.n++] = b; a[this.n++] = s; }
  out() { return this.a.slice(0, this.n); } }
class GU32 { constructor(n) { this.a = new Uint32Array(n); this.n = 0; }
  push(v) { if (this.n >= this.a.length) { const c = new Uint32Array(this.a.length * 2); c.set(this.a); this.a = c; } this.a[this.n++] = v; }
  out() { return this.a.slice(0, this.n); } }

class Chunk {
  constructor() { this.pos = new GF32(4096); this.uv = new GF32(2048); this.col = new GU8(4096); this.idx = new GU32(4096); this.v = 0;
    this.minX = 1e9; this.minY = 1e9; this.minZ = 1e9; this.maxX = -1e9; this.maxY = -1e9; this.maxZ = -1e9; }
  vert(x, y, z, u, v, c) {
    this.pos.push3(x, y, z); this.uv.push2(u, v); this.col.push4(c[0], c[1], c[2], c[3]);
    if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return this.v++;
  }
  finish() {
    const n = this.v;
    const idxRaw = this.idx.out();
    const idx = n <= 65535 ? Uint16Array.from(idxRaw) : idxRaw;
    const cx = (this.minX + this.maxX) / 2, cy = (this.minY + this.maxY) / 2, cz = (this.minZ + this.maxZ) / 2;
    const r = Math.hypot(this.maxX - this.minX, this.maxY - this.minY, this.maxZ - this.minZ) / 2;
    return { pos: this.pos.out(), uv: this.uv.out(), col: this.col.out(), idx, bs: [cx, cy, cz, r] };
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
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function parseColour(s) {
  if (typeof s !== 'string') return null;
  let m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  m = /^#?([0-9a-f]{3})$/i.exec(s.trim());
  if (m) { const v = m[1]; return [parseInt(v[0] + v[0], 16), parseInt(v[1] + v[1], 16), parseInt(v[2] + v[2], 16)]; }
  return null;
}
const PALETTE = [[214, 210, 201], [204, 199, 190], [226, 222, 214], [190, 194, 198], [172, 176, 181], [217, 207, 192], [200, 188, 170], [233, 229, 221], [186, 180, 172], [222, 214, 200]];
const GLASSY = [[146, 165, 183], [126, 146, 166], [168, 182, 196], [110, 124, 140], [188, 196, 204]];

function guessHeight(area, r, urban) {
  if (area < 45) return 3.5 + r * 3;
  if (area < 120) return 6 + r * 4;
  if (area < 300) return 7 + r * (6 + 16 * urban);
  if (area < 1000) return 9 + r * (10 + 28 * urban);
  if (area < 5000) return 12 + r * (12 + 34 * urban);
  return 10 + r * (14 + 12 * urban);
}

// ---------- main build ----------
function build(m, bytes) {
  const tile = new VectorTile(new Pbf(bytes));
  const S = m.size, full = m.lod === 2;
  const out = { chunks: [], places: [], coll: null, nb: 0 };

  const pl = tile.layers.place;
  if (pl) {
    const ext = pl.extent || 4096;
    for (let i = 0; i < pl.length; i++) {
      const f = pl.feature(i), p = f.properties;
      const name = p['name:ja'] || p.name || p['name:latin'];
      if (!name) continue;
      const g = f.loadGeometry(); const pt = g[0] && g[0][0];
      if (!pt || pt.x < 0 || pt.y < 0 || pt.x > ext || pt.y > ext) continue;
      out.places.push({ name: String(name), cls: String(p.class || ''), rank: +p.rank || 0, x: (pt.x / ext - 0.5) * S, z: (pt.y / ext - 0.5) * S });
    }
  }

  const bl = tile.layers.building;
  if (!bl) return out;
  const ext = bl.extent || 4096;
  const sc = S / ext;
  const dem = m.dem;
  const demAt = (px, py) => {
    if (!dem) return 0;
    let x = (px / ext) * 256 - 0.5, y = (py / ext) * 256 - 0.5;
    if (x < 0) x = 0; else if (x > 255) x = 255; if (y < 0) y = 0; else if (y > 255) y = 255;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), fx = x - x0, fy = y - y0;
    const a = dem[y0 * 256 + x0], b = dem[y0 * 256 + x1], c = dem[y1 * 256 + x0], d = dem[y1 * 256 + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  const G = full ? 4 : 1;
  const chunks = [];
  for (let i = 0; i < G * G; i++) chunks.push(new Chunk());
  // collision
  const cPts = full ? new GF32(8192) : null, cStart = [], cCnt = [], cBot = [], cTop = [], cBB = [];

  const excl = m.excl || [];
  const tcx = m.cx, tcz = m.cz;
  const urbanAt = (wx, wz) => {
    let u = 0;
    for (const c of URBAN) { const d = Math.hypot(wx - c[0], wz - c[1]); const v = Math.exp(-d / c[2]) * c[3]; if (v > u) u = v; }
    return Math.min(1, u);
  };

  for (let i = 0; i < bl.length; i++) {
    const f = bl.feature(i);
    if (f.type !== 3) continue;
    const p = f.properties;
    if (p.hide_3d === true || p.hide_3d === 'true' || p.hide_3d === 1) continue;
    let h = Number(p.render_height), mh = Number(p.render_min_height) || 0;
    const known = Number.isFinite(h) && h > 0 && h !== 5;
    if (!full && (!known || h < TALL_MIN)) continue;
    let rings;
    try { rings = f.loadGeometry(); } catch (e) { continue; }
    // group rings into polygons (exterior = positive area in tile coords)
    const polys = [];
    for (const raw of rings) {
      const r = cleanRing(raw);
      if (r.length < 3) continue;
      const a = ringArea(r);
      if (a === 0) continue;
      if (a > 0 || !polys.length) { if (a < 0) r.reverse(); polys.push([r]); }
      else polys[polys.length - 1].push(r);
    }
    for (const poly of polys) {
      const rings2 = [];
      for (let r = 0; r < poly.length; r++) {
        let c = clipRing(poly[r], 0, 0, ext, ext);
        c = cleanRing(c);
        if (c.length < 3 || Math.abs(ringArea(c)) * sc * sc < (r === 0 ? 8 : 2)) { if (r === 0) break; continue; }
        rings2.push(c);
      }
      if (!rings2.length) continue;
      const outer = rings2[0];
      const areaM = Math.abs(ringArea(outer)) * sc * sc;
      // centroid & ground
      let sx = 0, sy = 0, gMin = 1e9, gSum = 0;
      for (const q of outer) { sx += q.x; sy += q.y; const g = demAt(q.x, q.y); gSum += g; if (g < gMin) gMin = g; }
      const ccx = sx / outer.length, ccy = sy / outer.length;
      const lx = (ccx / ext - 0.5) * S, lz = (ccy / ext - 0.5) * S;
      const gBase = gSum / outer.length;
      const seedR = hash2(Math.round(outer[0].x * 7 + m.x * 131), Math.round(outer[0].y * 7 + m.y * 977));
      let hh = h;
      if (!known) hh = guessHeight(areaM, seedR, urbanAt(tcx + lx, tcz + lz));
      // landmark exclusion (custom models replace OSM shapes)
      let skip = false;
      for (const e of excl) if (hh >= e.minH && Math.hypot(lx - e.x, lz - e.z) < e.r) { skip = true; break; }
      if (skip) continue;
      const top = gBase + hh;
      const bot = mh > 0.5 ? gBase + mh : gMin - 4;
      if (top - bot < 0.5) continue;
      // colour
      let rgb;
      const cc = parseColour(p.colour);
      const pick = hash2(Math.round(outer[0].x * 3 + 17), Math.round(outer[0].y * 5 + m.y));
      const pal = hh > 60 && known ? GLASSY : PALETTE;
      const b0 = pal[Math.floor(pick * pal.length) % pal.length];
      if (cc && !(cc[0] === cc[1] && cc[1] === cc[2] && cc[0] < 40)) rgb = [(cc[0] + b0[0]) >> 1, (cc[1] + b0[1]) >> 1, (cc[2] + b0[2]) >> 1];
      else rgb = b0;
      const col = [rgb[0], rgb[1], rgb[2], Math.floor(seedR * 255)];
      // chunk by centroid cell
      let ci = 0;
      if (G > 1) {
        const gx = Math.min(G - 1, Math.max(0, Math.floor((ccx / ext) * G)));
        const gy = Math.min(G - 1, Math.max(0, Math.floor((ccy / ext) * G)));
        ci = gy * G + gx;
      }
      const ch = chunks[ci];
      // walls (+ shared top vertices for roof)
      const flat = [], holes = [], topIdx = [], botIdx = [];
      for (let r = 0; r < rings2.length; r++) {
        const ring = rings2[r];
        const n = ring.length;
        // orientation: outer positive, holes negative
        const a = ringArea(ring);
        if ((r === 0 && a < 0) || (r > 0 && a > 0)) ring.reverse();
        if (r > 0) holes.push(flat.length / 2);
        const vb = ch.v;
        const cum = new Float32Array(n + 1);
        for (let j = 1; j <= n; j++) { const q = ring[j % n], pq = ring[j - 1]; cum[j] = cum[j - 1] + Math.hypot(q.x - pq.x, q.y - pq.y) * sc; }
        for (let j = 0; j <= n; j++) { const q = ring[j % n]; ch.vert((q.x / ext - 0.5) * S, bot, (q.y / ext - 0.5) * S, cum[j], bot - gBase, col); }
        for (let j = 0; j <= n; j++) { const q = ring[j % n]; ch.vert((q.x / ext - 0.5) * S, top, (q.y / ext - 0.5) * S, cum[j], top - gBase, col); }
        for (let j = 0; j < n; j++) {
          const a0 = vb + j, b0 = vb + j + 1, a1 = vb + n + 1 + j, b1 = a1 + 1;
          ch.idx.push(a0); ch.idx.push(b1); ch.idx.push(b0);
          ch.idx.push(a0); ch.idx.push(a1); ch.idx.push(b1);
        }
        for (let j = 0; j < n; j++) {
          const q = ring[j];
          flat.push((q.x / ext - 0.5) * S, (q.y / ext - 0.5) * S);
          topIdx.push(vb + n + 1 + j); botIdx.push(vb + j);
        }
      }
      // roof
      let tri;
      try { tri = earcut(flat, holes.length ? holes : undefined, 2); } catch (e) { tri = []; }
      if (tri.length) {
        // make roof triangles face up (+Y): need cross2D(q-p, r-p) < 0 in (x,z)
        let flip = false;
        for (let t = 0; t < tri.length; t += 3) {
          const a = tri[t] * 2, b = tri[t + 1] * 2, c = tri[t + 2] * 2;
          const cr = (flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]) - (flat[b + 1] - flat[a + 1]) * (flat[c] - flat[a]);
          if (Math.abs(cr) > 1e-6) { flip = cr > 0; break; }
        }
        for (let t = 0; t < tri.length; t += 3) {
          const a = topIdx[tri[t]], b = topIdx[tri[t + 1]], c = topIdx[tri[t + 2]];
          if (flip) { ch.idx.push(a); ch.idx.push(c); ch.idx.push(b); } else { ch.idx.push(a); ch.idx.push(b); ch.idx.push(c); }
          if (mh > 0.5) { // underside of raised parts
            const a2 = botIdx[tri[t]], b2 = botIdx[tri[t + 1]], c2 = botIdx[tri[t + 2]];
            if (flip) { ch.idx.push(a2); ch.idx.push(b2); ch.idx.push(c2); } else { ch.idx.push(a2); ch.idx.push(c2); ch.idx.push(b2); }
          }
        }
      }
      // collision footprint (outer ring only)
      if (full) {
        const st = cPts.n / 2;
        let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
        for (const q of outer) {
          const x = (q.x / ext - 0.5) * S, z = (q.y / ext - 0.5) * S;
          cPts.push2(x, z);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        cStart.push(st); cCnt.push(outer.length); cBot.push(bot); cTop.push(top); cBB.push(x0, z0, x1, z1);
      }
      out.nb++;
    }
  }
  for (const c of chunks) if (c.v > 0) out.chunks.push(c.finish());

  if (full && cStart.length) {
    const nb = cStart.length, C = 32, GN = Math.ceil(S / C) + 1;
    const counts = new Uint32Array(GN * GN + 1);
    const cellRange = (b) => {
      const x0 = Math.max(0, Math.floor((cBB[b * 4] + S / 2) / C)), z0 = Math.max(0, Math.floor((cBB[b * 4 + 1] + S / 2) / C));
      const x1 = Math.min(GN - 1, Math.floor((cBB[b * 4 + 2] + S / 2) / C)), z1 = Math.min(GN - 1, Math.floor((cBB[b * 4 + 3] + S / 2) / C));
      return [x0, z0, x1, z1];
    };
    for (let b = 0; b < nb; b++) { const [x0, z0, x1, z1] = cellRange(b); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) counts[z * GN + x]++; }
    const cellStart = new Uint32Array(GN * GN + 1);
    for (let i = 0; i < GN * GN; i++) cellStart[i + 1] = cellStart[i] + counts[i];
    const fill = cellStart.slice(0, GN * GN);
    const cellItems = new Uint32Array(cellStart[GN * GN]);
    for (let b = 0; b < nb; b++) { const [x0, z0, x1, z1] = cellRange(b); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) cellItems[fill[z * GN + x]++] = b; }
    out.coll = {
      pts: cPts.out(), start: Uint32Array.from(cStart), cnt: Uint32Array.from(cCnt), bot: Float32Array.from(cBot), top: Float32Array.from(cTop),
      bb: Float32Array.from(cBB), cellStart, cellItems, GN, C, nb,
    };
  }
  return out;
}
