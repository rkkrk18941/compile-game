// Streams OSM buildings (OpenFreeMap z14 vector tiles) around the camera.
// lod 2 = every building (+ collision), lod 1 = only tall towers (distant skyline).
import * as THREE from 'three';
import { tileSize, tileBounds, tileAt, distToRect } from './geo.js';
import { buildingMaterial } from './shaders.js';

const Z = 14;
const TILEJSONS = ['https://tiles.openfreemap.org/planet', 'https://tiles.openfreemap.org/planet/latest'];
const FALLBACK_URL = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf';

export class Buildings {
  constructor(scene, dem, workerCode) {
    this.dem = dem;
    this.group = new THREE.Group(); this.group.name = 'buildings';
    scene.add(this.group);
    this.material = buildingMaterial();
    this.tiles = new Map();
    this.jobs = new Map(); this.nextId = 1; this.active = 0; this.ready = [];
    this.url = null; this.status = 'init'; this.failStreak = 0;
    this.fullR = 1400; this.tallR = 3500; this.tallMax = 5000; this.maxActive = 4;
    this.places = []; this.placesDirty = false;
    this.exclusions = [];
    this.S = tileSize(Z);
    this.qid = 1;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(blobUrl);
      w.onmessage = (e) => this.onMessage(e.data);
      w.onerror = () => {};
      this.workers.push(w);
    }
  }
  init(urban) {
    for (const w of this.workers) w.postMessage({ type: 'init', urban });
    const tryJson = (i) => {
      if (i >= TILEJSONS.length) { this.url = FALLBACK_URL; this.status = 'fallback'; return; }
      fetch(TILEJSONS[i]).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
        const u = j && j.tiles && j.tiles[0];
        if (typeof u !== 'string' || u.indexOf('{z}') < 0) throw new Error('bad tilejson');
        this.url = u; this.status = 'ok';
      }).catch(() => tryJson(i + 1));
    };
    tryJson(0);
  }
  setQuality(fullR, tallR, tallMax) { this.fullR = fullR; this.tallR = tallR; this.tallMax = tallMax; }
  update(cam, alt, now) {
    if (!this.url) return;
    const S = this.S;
    const fullR = alt > 1600 ? 0 : this.fullR;
    const tallR = Math.min(this.tallMax, this.tallR + Math.max(0, alt) * 1.4);
    const [tx, ty] = tileAt(Z, cam.x, cam.z);
    const rad = Math.ceil(tallR / S) + 1;
    const want = [];
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = tx + dx, y = ty + dy;
      const key = x + '/' + y;
      let t = this.tiles.get(key);
      const b = t ? t.b : tileBounds(Z, x, y);
      const d = distToRect(cam.x, cam.z, b[0], b[1], b[2], b[3]);
      let lod = d <= fullR ? 2 : d <= tallR ? 1 : 0;
      if (t && t.lod === 2 && lod === 1 && fullR > 0 && d < fullR + 350) lod = 2; // hysteresis
      if (lod === 0) continue;
      if (!t) {
        t = { key, x, y, b, cx: (b[0] + b[2]) / 2, cz: (b[1] + b[3]) / 2, lod: 0, meshes: [], coll: null, places: [], job: null, failedAt: 0, fails: 0 };
        this.tiles.set(key, t);
      }
      t.want = lod; t.d = d; t.seen = now;
      want.push(t);
    }
    for (const t of this.tiles.values()) {
      if (t.seen !== now && now - t.seen > 1500) this.drop(t);
    }
    want.sort((a, b) => a.d - b.d);
    for (const t of want) {
      if (this.active >= this.maxActive) break;
      if (t.lod === t.want && !t.job) continue;
      if (t.job) { if (t.job.lod === t.want || t.job.done) continue; this.cancel(t.job); }
      if (t.lod === t.want) continue;
      if (t.failedAt && now - t.failedAt < 4000 * t.fails) continue;
      const de = this.dem.need(Z, t.x, t.y, t.d / S - 0.5);
      if (de.state !== 'ready') continue;
      this.dispatch(t, t.want, de.data);
    }
  }
  dispatch(t, lod, demData) {
    const id = this.nextId++;
    const w = this.workers[id % this.workers.length];
    const job = { id, t, lod, w };
    t.job = job; this.jobs.set(id, job); this.active++;
    const S = this.S;
    const excl = [];
    for (const e of this.exclusions) {
      if (Math.abs(e.x - t.cx) < S / 2 + e.r && Math.abs(e.z - t.cz) < S / 2 + e.r) excl.push({ x: e.x - t.cx, z: e.z - t.cz, r: e.r, minH: e.minH });
    }
    const dem = demData ? demData.slice() : null;
    const url = this.url.replace('{z}', Z).replace('{x}', t.x).replace('{y}', t.y);
    w.postMessage({ type: 'build', id, url, lod, size: S, cx: t.cx, cz: t.cz, x: t.x, y: t.y, dem, excl }, dem ? [dem.buffer] : []);
  }
  cancel(job) {
    if (job.done) return;
    job.w.postMessage({ type: 'cancel', id: job.id });
    job.cancelled = true;
    if (job.t.job === job) job.t.job = null;
  }
  onMessage(m) {
    const job = this.jobs.get(m.id);
    if (!job) return;
    this.jobs.delete(m.id); this.active--;
    const t = job.t;
    if (job.cancelled || t.dropped) { if (t.job === job) t.job = null; return; }
    if (m.type === 'fail') {
      if (t.job === job) t.job = null;
      if (!m.aborted) {
        t.fails++; t.failedAt = performance.now(); this.lastError = m.msg;
        // if nothing has ever loaded, the tile URL itself may be wrong: switch to the plain "latest" endpoint once
        if (!this.built && ++this.failStreak >= 6 && this.url !== FALLBACK_URL) {
          this.url = FALLBACK_URL; this.failStreak = 0;
          for (const x of this.tiles.values()) { x.fails = 0; x.failedAt = 0; }
        }
      }
      return;
    }
    job.done = true;
    this.ready.push({ t, job, m });
  }
  flush() {
    const r = this.ready.shift();
    if (!r) return;
    const { t, job, m } = r;
    if (t.job === job) t.job = null;
    if (t.dropped) return;
    this.clearMeshes(t);
    for (const c of m.chunks) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(c.uv, 2));
      g.setAttribute('aColor', new THREE.BufferAttribute(c.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(c.idx, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.bs[0], c.bs[1], c.bs[2]), c.bs[3] + 1);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.set(t.cx, 0, t.cz);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.group.add(mesh);
      t.meshes.push(mesh);
    }
    t.lod = job.lod;
    t.fails = 0;
    t.coll = m.coll ? Object.assign(m.coll, { mark: new Uint32Array(m.coll.nb) }) : null;
    t.places = (m.places || []).map((p) => ({ name: p.name, cls: p.cls, rank: p.rank, x: p.x + t.cx, z: p.z + t.cz }));
    this.placesDirty = true;
    this.built = (this.built || 0) + 1;
  }
  clearMeshes(t) {
    for (const mesh of t.meshes) { this.group.remove(mesh); mesh.geometry.dispose(); }
    t.meshes = [];
  }
  drop(t) {
    t.dropped = true;
    if (t.job) this.cancel(t.job);
    this.clearMeshes(t);
    t.coll = null;
    if (t.places.length) this.placesDirty = true;
    this.tiles.delete(t.key);
  }
  clearAll() { for (const t of [...this.tiles.values()]) this.drop(t); }
  getPlaces() {
    if (this.placesDirty) {
      this.placesDirty = false;
      const all = [];
      for (const t of this.tiles.values()) for (const p of t.places) all.push(p);
      this.places = all;
    }
    return this.places;
  }
  get loading() { return this.active; }

  // ---------------- collision ----------------
  // calls fn(t, coll, b) for each building whose footprint grid cell overlaps the circle
  near(x, z, r, fn) {
    const S = this.S, q = ++this.qid;
    const [ax, ay] = tileAt(Z, x - r, z - r), [bx, by] = tileAt(Z, x + r, z + r);
    for (let ty = ay; ty <= by; ty++) for (let tx = ax; tx <= bx; tx++) {
      const t = this.tiles.get(tx + '/' + ty);
      if (!t || !t.coll) continue;
      const c = t.coll, C = c.C, GN = c.GN;
      const lx = x - t.cx + S / 2, lz = z - t.cz + S / 2;
      const x0 = Math.max(0, Math.floor((lx - r) / C)), x1 = Math.min(GN - 1, Math.floor((lx + r) / C));
      const z0 = Math.max(0, Math.floor((lz - r) / C)), z1 = Math.min(GN - 1, Math.floor((lz + r) / C));
      for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
        const cell = gz * GN + gx;
        for (let k = c.cellStart[cell], e = c.cellStart[cell + 1]; k < e; k++) {
          const b = c.cellItems[k];
          if (c.mark[b] === q) continue;
          c.mark[b] = q;
          if (fn(t, c, b) === true) return;
        }
      }
    }
  }
  // highest roof under (x,z) that is not higher than maxY
  supportAt(x, z, maxY) {
    let best = -1e9;
    this.near(x, z, 0.01, (t, c, b) => {
      const top = c.top[b];
      if (top > maxY || top <= best) return;
      const lx = x - t.cx, lz = z - t.cz, bb = c.bb;
      if (lx < bb[b * 4] || lx > bb[b * 4 + 2] || lz < bb[b * 4 + 1] || lz > bb[b * 4 + 3]) return;
      if (pip(c.pts, c.start[b], c.cnt[b], lx, lz)) best = top;
    });
    return best;
  }
  // is the point inside a building volume?
  solidAt(x, y, z) {
    let hit = false;
    this.near(x, z, 0.01, (t, c, b) => {
      if (y >= c.top[b] || y <= c.bot[b]) return;
      const lx = x - t.cx, lz = z - t.cz, bb = c.bb;
      if (lx < bb[b * 4] || lx > bb[b * 4 + 2] || lz < bb[b * 4 + 1] || lz > bb[b * 4 + 3]) return;
      if (pip(c.pts, c.start[b], c.cnt[b], lx, lz)) { hit = true; return true; }
    });
    return hit;
  }
  // push a vertical capsule (feet y, height H, radius r) out of walls; returns true if it touched a wall
  pushOut(p, r, H, step) {
    let touched = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.near(p.x, p.z, r, (t, c, b) => {
        if (c.top[b] <= p.y + step || c.bot[b] >= p.y + H) return;
        const lx = p.x - t.cx, lz = p.z - t.cz, bb = c.bb;
        if (lx < bb[b * 4] - r || lx > bb[b * 4 + 2] + r || lz < bb[b * 4 + 1] - r || lz > bb[b * 4 + 3] + r) return;
        const s = c.start[b], n = c.cnt[b], pts = c.pts;
        const inside = pip(pts, s, n, lx, lz);
        let best = 1e18, qx = 0, qz = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const ax = pts[(s + j) * 2], az = pts[(s + j) * 2 + 1], bx = pts[(s + i) * 2], bz = pts[(s + i) * 2 + 1];
          const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
          let u = l2 > 0 ? ((lx - ax) * ex + (lz - az) * ez) / l2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const cx = ax + ex * u, cz = az + ez * u, d2 = (lx - cx) * (lx - cx) + (lz - cz) * (lz - cz);
          if (d2 < best) { best = d2; qx = cx; qz = cz; }
        }
        const d = Math.sqrt(best);
        if (inside) {
          let nx = qx - lx, nz = qz - lz; const l = Math.hypot(nx, nz) || 1e-6; nx /= l; nz /= l;
          p.x = t.cx + qx + nx * (r + 0.01); p.z = t.cz + qz + nz * (r + 0.01); moved = true;
        } else if (d < r) {
          const nx = (lx - qx) / (d || 1e-6), nz = (lz - qz) / (d || 1e-6);
          p.x = t.cx + qx + nx * (r + 0.01); p.z = t.cz + qz + nz * (r + 0.01); moved = true;
        }
      });
      if (!moved) break;
      touched = true;
    }
    return touched;
  }
}

function pip(pts, s, n, x, z) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[(s + i) * 2], zi = pts[(s + i) * 2 + 1], xj = pts[(s + j) * 2], zj = pts[(s + j) * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
