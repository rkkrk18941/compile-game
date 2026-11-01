// Streams the city around the camera: buildings (PLATEAU + OSM), roads & ground overlays,
// elevated structures, trees, street lights, roof photos, road graphs, collision and destruction.
import * as THREE from 'three';
import { tileSize, tileBounds, tileAt, distToRect } from './geo.js';
import { buildingMaterial, overlayMaterial, structMaterial, addCurvature, shared } from './shaders.js';

const Z = 14;
const TILEJSONS = ['https://tiles.openfreemap.org/planet', 'https://tiles.openfreemap.org/planet/latest'];
const FALLBACK_URL = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf';
export const PLATEAU_URL = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf';
const PHOTO = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`;
const DESTROY_KEY = 'tokyoSora.destroyed.v1';

function treeGeometries() {
  const merge = (parts) => {
    const geos = parts.map(([g, color]) => { const n = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(color); const cols = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; } n.setAttribute('color', new THREE.BufferAttribute(cols, 3)); n.deleteAttribute('uv'); return n; });
    let total = 0; for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0; for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere(); return out;
  };
  const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
  const broad = merge([
    [T(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 5, 1, true), 0, 1.6, 0), '#5a4636'],
    [T(new THREE.IcosahedronGeometry(2.3, 0), 0, 4.5, 0), '#ffffff'],
    [T(new THREE.IcosahedronGeometry(1.5, 0), 0.9, 3.8, 0.6), '#ececec'],
  ]);
  const conifer = merge([
    [T(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 5, 1, true), 0, 1.1, 0), '#4f3d30'],
    [T(new THREE.ConeGeometry(2.0, 3.8, 6, 1, true), 0, 3.5, 0), '#ffffff'],
    [T(new THREE.ConeGeometry(1.3, 3.2, 6, 1, true), 0, 5.6, 0), '#eeeeee'],
  ]);
  const pole = merge([
    [T(new THREE.CylinderGeometry(0.08, 0.11, 7.2, 6), 0, 3.6, 0), '#7b8086'],
    [T(new THREE.BoxGeometry(1.7, 0.1, 0.1), 0.8, 7.1, 0), '#7b8086'],
  ]);
  const lamp = T(new THREE.BoxGeometry(0.6, 0.16, 0.32), 1.55, 7.0, 0);
  return { broad, conifer, pole, lamp };
}

export class City {
  constructor(scene, dem, sched, workerCode) {
    this.dem = dem; this.sched = sched; this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'city';
    scene.add(this.group);
    this.overlayMat = overlayMaterial();
    this.structMat = structMaterial();
    this.treeMat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.poleMat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.lampMat = addCurvature(new THREE.MeshBasicMaterial({ color: '#fff4d6' }));
    this.geo = treeGeometries();
    this.tiles = new Map();
    this.jobs = new Map(); this.nextId = 1; this.active = 0; this.ready = [];
    this.url = null; this.status = 'init'; this.failStreak = 0; this.osmOkCount = 0; this.osmFail = 0;
    this.fullR = 1400; this.tallR = 3500; this.tallMax = 5000; this.maxActive = 4; this.roofZoom = 16; this.maxTrees = 2500;
    this.places = []; this.placesDirty = false;
    this.exclusions = [];
    this.S = tileSize(Z);
    this.qid = 1;
    this.usePhotoRoofs = true;
    this.destroyed = new Set();
    try { for (const id of JSON.parse(localStorage.getItem(DESTROY_KEY) || '[]')) this.destroyed.add(id); } catch (e) { /* ignore */ }
    this.anims = [];
    this.onCollapse = null; // callback(x, y, z, w, h, d)
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    this.workers = [];
    for (let i = 0; i < n; i++) { const w = new Worker(blobUrl); w.onmessage = (e) => this.onMessage(e.data); this.workers.push(w); }
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
  setQuality(q) { this.fullR = q.full; this.tallR = q.tall; this.tallMax = q.tallMax; this.roofZoom = q.roofZoom; this.maxTrees = q.trees; }
  setPhotoRoofs(on) {
    this.usePhotoRoofs = on;
    for (const t of this.tiles.values()) if (t.mat) t.mat.uniforms.uHasRoof.value = on && t.roofTex ? 1 : 0;
  }
  // ---------------- streaming ----------------
  update(cam, alt, now) {
    if (!this.url) return;
    const S = this.S;
    const fullR = alt > 1600 ? 0 : this.fullR;
    const tallR = Math.min(this.tallMax, this.tallR + Math.max(0, alt) * 1.4);
    const [tx, ty] = tileAt(Z, cam.x, cam.z);
    const rad = Math.ceil(tallR / S) + 1;
    const want = [];
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = tx + dx, y = ty + dy, key = x + '/' + y;
      let t = this.tiles.get(key);
      const b = t ? t.b : tileBounds(Z, x, y);
      const d = distToRect(cam.x, cam.z, b[0], b[1], b[2], b[3]);
      let lod = d <= fullR ? 2 : d <= tallR ? 1 : 0;
      if (t && t.lod === 2 && lod === 1 && fullR > 0 && d < fullR + 350) lod = 2;
      if (lod === 0) continue;
      if (!t) {
        t = { key, x, y, b, cx: (b[0] + b[2]) / 2, cz: (b[1] + b[3]) / 2, lod: 0, meshes: [], extra: [], coll: null, meta: null, ids: null, places: [], graph: null, job: null, failedAt: 0, fails: 0, mat: null, roofTex: null, roofState: 0 };
        this.tiles.set(key, t);
      }
      t.want = lod; t.d = d; t.seen = now;
      want.push(t);
    }
    for (const t of this.tiles.values()) if (t.seen !== now && now - t.seen > 1500) this.drop(t);
    want.sort((a, b) => a.d - b.d);
    for (const t of want) {
      if (this.usePhotoRoofs && t.roofState !== 1 && t.lod) {
        const wantZ = t.lod === 2 ? this.roofZoom : t.d < 6000 ? 14 : 0;
        if (wantZ > (t.roofZ || 0)) this.loadRoof(t, wantZ);
      }
      if (this.active >= this.maxActive) continue;
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
    const S = this.S, excl = [];
    for (const e of this.exclusions) if (Math.abs(e.x - t.cx) < S / 2 + e.r && Math.abs(e.z - t.cz) < S / 2 + e.r) excl.push({ x: e.x - t.cx, z: e.z - t.cz, r: e.r, minH: e.minH, clampH: e.clampH || 0 });
    const dem = demData ? demData.slice() : null;
    const osmUrl = this.osmDisabled ? null : this.url.replace('{z}', Z).replace('{x}', t.x).replace('{y}', t.y);
    w.postMessage({ type: 'build', id, osmUrl, osmSoft: this.osmOkCount === 0 && this.osmFail > 3, plUrl: (typeof window !== 'undefined' && window.__PLATEAU_URL) || PLATEAU_URL, lod, size: S, cx: t.cx, cz: t.cz, x: t.x, y: t.y, dem, excl, maxTrees: this.maxTrees }, dem ? [dem.buffer] : []);
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
        t.fails++; t.failedAt = performance.now(); this.lastError = m.msg; this.osmFail++;
        if (!this.built && ++this.failStreak >= 6 && this.url !== FALLBACK_URL) {
          this.url = FALLBACK_URL; this.failStreak = 0;
          for (const x of this.tiles.values()) { x.fails = 0; x.failedAt = 0; }
        }
      }
      return;
    }
    if (m.osmOk) this.osmOkCount++;
    job.done = true;
    this.ready.push({ t, job, m });
  }
  // build at most one finished tile per frame (spreads GPU uploads)
  flush() {
    const r = this.ready.shift();
    if (!r) return;
    const { t, job, m } = r;
    if (t.job === job) t.job = null;
    if (t.dropped) return;
    this.clearMeshes(t);
    if (!t.mat) {
      t.mat = buildingMaterial();
      if (t.roofTex) { t.mat.uniforms.uRoof.value = t.roofTex; t.mat.uniforms.uHasRoof.value = this.usePhotoRoofs ? 1 : 0; }
    }
    for (const c of m.chunks) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(c.uv, 2));
      g.setAttribute('aColor', new THREE.BufferAttribute(c.col, 4, true));
      g.setAttribute('aCen', new THREE.BufferAttribute(c.cen, 2, true));
      g.setIndex(new THREE.BufferAttribute(c.idx, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.bs[0], c.bs[1], c.bs[2]), c.bs[3] + 1);
      t.meshes.push(this.addMesh(t, g, t.mat, 0));
    }
    if (m.overlay) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.overlay.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.overlay.uv, 2));
      g.setAttribute('aInfo', new THREE.BufferAttribute(m.overlay.inf, 4, true));
      g.setIndex(new THREE.BufferAttribute(m.overlay.idx, 1));
      g.computeBoundingSphere();
      t.extra.push(this.addMesh(t, g, this.overlayMat, -1));
    }
    if (m.struct) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.struct.pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(m.struct.uv, 2));
      g.setAttribute('aInfo', new THREE.BufferAttribute(m.struct.inf, 4, true));
      g.setIndex(new THREE.BufferAttribute(m.struct.idx, 1));
      g.computeBoundingSphere();
      t.extra.push(this.addMesh(t, g, this.structMat, 0));
    }
    if (m.trees) this.addTrees(t, m.trees);
    if (m.lights) this.addLights(t, m.lights);
    t.lod = job.lod; t.fails = 0;
    t.coll = m.coll ? Object.assign(m.coll, { mark: new Uint32Array(m.coll.nb) }) : null;
    t.meta = m.meta || null; t.ids = m.ids || null; t.hp = null;
    t.graph = m.graph || null;
    if (t.graph) t.graph.version = (t.graph.version || 0) + 1;
    t.graphVersion = (t.graphVersion || 0) + 1;
    t.places = (m.places || []).map((p) => ({ name: p.name, cls: p.cls, rank: p.rank, x: p.x + t.cx, z: p.z + t.cz }));
    t.plCount = m.plCount || 0;
    this.placesDirty = true;
    this.built = (this.built || 0) + 1;
    // re-apply destruction the player caused earlier
    if (t.ids && this.destroyed.size) for (let b = 0; b < t.ids.length; b++) if (this.destroyed.has(t.ids[b])) this.rubble(t, b);
  }
  addMesh(t, g, mat, order) {
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(t.cx, 0, t.cz);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }
  addTrees(t, arr) {
    const n = arr.length / 5;
    const month = new Date().getMonth() + 1;
    const leaf = (kind, r) => {
      if (kind === 1) return new THREE.Color().setHSL(0.33 + r * 0.04, 0.42, 0.2 + r * 0.06);
      if (kind === 2 && (month === 11 || month === 12)) return r < 0.55 ? new THREE.Color().setHSL(0.13 + r * 0.03, 0.85, 0.5) : new THREE.Color().setHSL(0.06 + r * 0.04, 0.7, 0.38);
      if (month === 4 && kind === 0 && r < 0.35) return new THREE.Color().setHSL(0.95, 0.55, 0.82);
      if (month <= 2 || month === 12) return new THREE.Color().setHSL(0.08, 0.25, 0.3 + r * 0.1);
      return new THREE.Color().setHSL(0.25 + r * 0.08, 0.5, 0.26 + r * 0.08);
    };
    const groups = [[], []];
    for (let i = 0; i < n; i++) groups[arr[i * 5 + 4] === 1 ? 1 : 0].push(i);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    groups.forEach((list, gi) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(gi === 1 ? this.geo.conifer : this.geo.broad, this.treeMat, list.length);
      list.forEach((i, k) => {
        const sc = arr[i * 5 + 3], r = (Math.sin(i * 12.9898 + t.x) * 43758.5453) % 1;
        const rr = Math.abs(r);
        q.setFromAxisAngle(up, rr * 6.283);
        s.set(sc, sc * (0.9 + rr * 0.3), sc);
        p.set(arr[i * 5], arr[i * 5 + 1], arr[i * 5 + 2]);
        m4.compose(p, q, s); im.setMatrixAt(k, m4);
        im.setColorAt(k, leaf(arr[i * 5 + 4], rr));
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.position.set(t.cx, 0, t.cz); im.updateMatrix(); im.matrixAutoUpdate = false;
      this.group.add(im); t.extra.push(im);
    });
  }
  addLights(t, arr) {
    const n = arr.length / 5;
    const poles = new THREE.InstancedMesh(this.geo.pole, this.poleMat, n);
    const lamps = new THREE.InstancedMesh(this.geo.lamp, this.lampMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      q.setFromAxisAngle(up, Math.atan2(-arr[i * 5 + 4], arr[i * 5 + 3]));
      p.set(arr[i * 5], arr[i * 5 + 1], arr[i * 5 + 2]);
      m4.compose(p, q, s); poles.setMatrixAt(i, m4); lamps.setMatrixAt(i, m4);
    }
    for (const im of [poles, lamps]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.position.set(t.cx, 0, t.cz); im.updateMatrix(); im.matrixAutoUpdate = false; this.group.add(im); t.extra.push(im); }
  }
  // aerial photo mosaic for roofs (and wall tint)
  loadRoof(t, zr) {
    const n = 1 << (zr - Z), size = n * 256;
    t.roofState = 1; t.roofZ = zr;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    g.fillStyle = '#7d7f80'; g.fillRect(0, 0, size, size);
    let left = n * n, okCount = 0;
    const finish = () => {
      if (t.dropped || !okCount) { t.roofState = okCount ? 2 : 3; return; }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
      if (t.roofTex) t.roofTex.dispose();
      t.roofTex = tex; t.roofState = 2;
      if (t.mat) { t.mat.uniforms.uRoof.value = tex; t.mat.uniforms.uHasRoof.value = this.usePhotoRoofs ? 1 : 0; }
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const url = PHOTO(zr, t.x * n + i, t.y * n + j);
      this.sched.add({
        prio: () => (t.d || 0) / this.S + 0.8,
        alive: () => !t.dropped,
        drop: () => { left--; if (!left) finish(); },
        start: () => fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null)).then((bmp) => {
          if (bmp) { g.drawImage(bmp, i * 256, j * 256); if (bmp.close) bmp.close(); okCount++; }
        }).catch(() => {}).then(() => { left--; if (!left) finish(); }),
      });
    }
  }
  clearMeshes(t) {
    for (const mesh of t.meshes) { this.group.remove(mesh); mesh.geometry.dispose(); }
    for (const mesh of t.extra) { this.group.remove(mesh); if (mesh.isInstancedMesh) mesh.dispose(); else mesh.geometry.dispose(); }
    t.meshes = []; t.extra = [];
  }
  drop(t) {
    t.dropped = true;
    if (t.job) this.cancel(t.job);
    this.clearMeshes(t);
    if (t.mat) t.mat.dispose();
    if (t.roofTex) t.roofTex.dispose();
    t.coll = null; t.graph = null;
    if (t.places.length) this.placesDirty = true;
    this.tiles.delete(t.key);
  }
  getPlaces() {
    if (this.placesDirty) {
      this.placesDirty = false;
      const all = [];
      for (const t of this.tiles.values()) for (const p of t.places) all.push(p);
      this.places = all;
    }
    return this.places;
  }
  get loading() { return this.active + this.ready.length; }
  graphTiles() { const a = []; for (const t of this.tiles.values()) if (t.graph && t.lod === 2) a.push(t); return a; }
  tileAtWorld(x, z) { const [tx, ty] = tileAt(Z, x, z); return this.tiles.get(tx + '/' + ty); }

  // ---------------- collision ----------------
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
  solidAt(x, y, z) {
    let hit = null;
    this.near(x, z, 0.01, (t, c, b) => {
      if (y >= c.top[b] || y <= c.bot[b]) return;
      const lx = x - t.cx, lz = z - t.cz, bb = c.bb;
      if (lx < bb[b * 4] || lx > bb[b * 4 + 2] || lz < bb[b * 4 + 1] || lz > bb[b * 4 + 3]) return;
      if (pip(c.pts, c.start[b], c.cnt[b], lx, lz)) { hit = { t, b }; return true; }
    });
    return hit;
  }
  pushOut(p, r, H, step, onHit) {
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
        if (inside || d < r) {
          let nx, nz;
          if (inside) { nx = qx - lx; nz = qz - lz; const l = Math.hypot(nx, nz) || 1e-6; nx /= l; nz /= l; }
          else { nx = (lx - qx) / (d || 1e-6); nz = (lz - qz) / (d || 1e-6); }
          p.x = t.cx + qx + nx * (r + 0.01); p.z = t.cz + qz + nz * (r + 0.01); moved = true;
          if (onHit) onHit(t, b, nx, nz);
        }
      });
      if (!moved) break;
      touched = true;
    }
    return touched;
  }
  // march a segment; returns {x,y,z,t,b} for the first building or ground hit
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let step = 1.5, d = 0;
    while (d < maxD) {
      const x = ox + dx * d, y = oy + dy * d, z = oz + dz * d;
      if (y < this.dem.heightAt(x, z)) return { x, y, z, ground: true };
      const s = this.solidAt(x, y, z);
      if (s) return { x, y, z, t: s.t, b: s.b };
      d += step; step = Math.min(6, step * 1.04);
    }
    return null;
  }

  // ---------------- destruction ----------------
  hpOf(t, b) {
    if (!t.hp) { t.hp = new Float32Array(t.coll.nb); t.hp.fill(-1); }
    if (t.hp[b] < 0) { const h = t.coll.top[b] - t.meta.base[b]; t.hp[b] = Math.min(3000, Math.max(70, (t.meta.area[b] * h) / 450)); }
    return t.hp[b];
  }
  // damage everything within radius; returns number of buildings destroyed
  damage(x, y, z, radius, power) {
    let n = 0;
    const list = [];
    this.near(x, z, radius, (t, c, b) => {
      if (!t.meta || c.top[b] - t.meta.base[b] < 2.5) return;
      if (y > c.top[b] + radius * 0.7 || y < c.bot[b] - radius) return;
      const s = c.start[b], cnt = c.cnt[b], pts = c.pts, lx = x - t.cx, lz = z - t.cz;
      let d = 0;
      if (!pip(pts, s, cnt, lx, lz)) {
        let best = 1e18;
        for (let i = 0, j = cnt - 1; i < cnt; j = i++) {
          const ax = pts[(s + j) * 2], az = pts[(s + j) * 2 + 1], bx = pts[(s + i) * 2], bz = pts[(s + i) * 2 + 1];
          const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
          let u = l2 > 0 ? ((lx - ax) * ex + (lz - az) * ez) / l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = ax + ex * u - lx, qz = az + ez * u - lz; const dd = qx * qx + qz * qz; if (dd < best) best = dd;
        }
        d = Math.sqrt(best);
      }
      if (d > radius) return;
      list.push([t, b, d]);
    });
    for (const [t, b, d] of list) {
      const hp = this.hpOf(t, b) - power * Math.pow(1 - d / radius, 0.7);
      t.hp[b] = hp;
      if (hp <= 0) { this.collapse(t, b); n++; }
    }
    return n;
  }
  collapse(t, b) {
    const id = t.ids && t.ids[b];
    if (!t.meta || t.coll.top[b] - t.meta.base[b] < 2.5) return;
    const ci = t.meta.chunk[b], mesh = t.meshes[ci];
    if (!mesh) return;
    const g = mesh.geometry, vs = t.meta.vs[b], vc = t.meta.vc[b], is = t.meta.is[b], ic = t.meta.ic[b];
    // falling copy
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(g.attributes.position.array.slice(vs * 3, (vs + vc) * 3), 3));
    pg.setAttribute('uv', new THREE.BufferAttribute(g.attributes.uv.array.slice(vs * 2, (vs + vc) * 2), 2));
    pg.setAttribute('aColor', new THREE.BufferAttribute(g.attributes.aColor.array.slice(vs * 4, (vs + vc) * 4), 4, true));
    pg.setAttribute('aCen', new THREE.BufferAttribute(g.attributes.aCen.array.slice(vs * 2, (vs + vc) * 2), 2, true));
    const src = g.index.array, ia = new Uint32Array(ic);
    for (let i = 0; i < ic; i++) ia[i] = src[is + i] - vs;
    pg.setIndex(new THREE.BufferAttribute(ia, 1));
    pg.computeBoundingSphere();
    const fall = new THREE.Mesh(pg, t.mat);
    fall.position.set(t.cx, 0, t.cz);
    this.group.add(fall);
    const base = t.meta.base[b], h = t.coll.top[b] - base;
    this.anims.push({ mesh: fall, t0: performance.now(), h, base });
    this.rubble(t, b);
    if (id) {
      this.destroyed.add(id); this.saveDestroyed();
      // the same building can be split across data tiles: bring down the other pieces too
      for (const t2 of this.tiles.values()) {
        if (!t2.ids || !t2.meta || Math.abs(t2.cx - t.cx) > this.S * 1.01 || Math.abs(t2.cz - t.cz) > this.S * 1.01) continue;
        for (let b2 = 0; b2 < t2.ids.length; b2++) if (t2.ids[b2] === id && t2.coll.top[b2] - t2.meta.base[b2] >= 2.5) this.collapse(t2, b2);
      }
    }
    if (this.onCollapse) {
      const bb = t.coll.bb;
      this.onCollapse(t.cx + t.meta.cx[b], base, t.cz + t.meta.cz[b], Math.max(6, bb[b * 4 + 2] - bb[b * 4]), h, Math.max(6, bb[b * 4 + 3] - bb[b * 4 + 1]));
    }
  }
  // flatten a building into a low pile of rubble (no animation)
  rubble(t, b) {
    const ci = t.meta.chunk[b], mesh = t.meshes[ci];
    if (!mesh) return;
    const g = mesh.geometry, vs = t.meta.vs[b], vc = t.meta.vc[b], base = t.meta.base[b];
    const P = g.attributes.position, A = P.array, UV = g.attributes.uv.array, C = g.attributes.aColor.array;
    for (let v = vs; v < vs + vc; v++) {
      const k = v * 3;
      const cap = base + 1.2 + Math.abs(Math.sin(v * 7.13)) * 1.8;
      if (A[k + 1] > cap) A[k + 1] = cap;
      UV[v * 2 + 1] = Math.min(UV[v * 2 + 1], -2);
      C[v * 4] = 92; C[v * 4 + 1] = 88; C[v * 4 + 2] = 82;
    }
    P.addUpdateRange(vs * 3, vc * 3); P.needsUpdate = true;
    g.attributes.uv.addUpdateRange(vs * 2, vc * 2); g.attributes.uv.needsUpdate = true;
    g.attributes.aColor.addUpdateRange(vs * 4, vc * 4); g.attributes.aColor.needsUpdate = true;
    t.coll.top[b] = base + 1.6;
    if (t.hp) t.hp[b] = 1e9;
  }
  saveDestroyed() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { try { localStorage.setItem(DESTROY_KEY, JSON.stringify([...this.destroyed].slice(-4000))); } catch (e) { /* full */ } }, 800);
  }
  restoreAll() {
    this.destroyed.clear();
    try { localStorage.removeItem(DESTROY_KEY); } catch (e) { /* ignore */ }
    for (const t of this.tiles.values()) { t.lod = 0; }
  }
  animate(now, dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      const k = (now - a.t0) / 2600;
      if (k >= 1) { this.group.remove(a.mesh); a.mesh.geometry.dispose(); this.anims.splice(i, 1); continue; }
      const e = k * k * (3 - 2 * k);
      a.mesh.position.y = -a.h * 0.95 * e;
      a.mesh.position.x += Math.sin(now * 0.05 + i) * 0.04 * (1 - k);
      a.mesh.position.z += Math.cos(now * 0.043 + i) * 0.04 * (1 - k);
    }
    // street lamps glow at night
    const n = shared.uNight.value;
    this.lampMat.color.setRGB(0.55 + 2.2 * n, 0.52 + 1.9 * n, 0.45 + 1.4 * n);
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
