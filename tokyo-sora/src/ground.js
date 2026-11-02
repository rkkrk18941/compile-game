import { fetchResource } from './network.js';
// Ground: quadtree of GSI raster tiles draped over GSI elevation.
// A tile only splits when all four children are ready, so there are never holes or overlaps.
import * as THREE from 'three';
import { tileBounds, tileAt } from './geo.js';
import { sampleDem, demZoomFor } from './dem.js';
import { rasterWater } from './hydro.js';
import { groundMaterial, dryMask } from './shaders.js';

export const GROUND_SOURCES = {
  photo: { url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x}/${y}.jpg`, maxZ: 18, fallback: '#24425c' },
  std: { url: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`, maxZ: 18, fallback: '#bed8ef' },
};
const ROOT_Z = 7;

class GTile {
  constructor(z, x, y, parent) {
    this.z = z; this.x = x; this.y = y; this.key = z + '/' + x + '/' + y;
    const b = tileBounds(z, x, y);
    this.x0 = b[0]; this.z0 = b[1]; this.x1 = b[2]; this.z1 = b[3];
    this.size = this.x1 - this.x0;
    this.cx = (this.x0 + this.x1) / 2; this.cz = (this.z0 + this.z1) / 2;
    this.state = 'idle';
    this.tex = null; this.mesh = null; this.used = 0; this.prio = 0; this.retryAt = 0; this.fails = 0;
    this.minH = parent ? parent.minH : 0; this.maxH = parent ? parent.maxH : 0;
    this.dz = demZoomFor(z);
    const sh = z - this.dz;
    this.dx = sh >= 0 ? x >> sh : x; this.dy = sh >= 0 ? y >> sh : y;
  }
}

export class Ground {
  constructor(scene, dem, sched, renderer) {
    this.dem = dem; this.sched = sched;this.emptyWaterMask=dryMask;
    this.group = new THREE.Group();
    this.group.name = 'ground';
    scene.add(this.group);
    this.tiles = new Map();
    this.show = []; this.prevShow = [];
    this.now = 0; this.gen = 0;
    this.splitK = 1.5; this.maxTiles = 420;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4(); this.box = new THREE.Box3();
    this.setSource('photo');
  }
  setSource(name) {
    this.srcName = name;
    this.src = GROUND_SOURCES[name] || GROUND_SOURCES.photo;
    this.gen++;
    for (const t of [...this.tiles.values()]) this.dispose(t);
    this.show = []; this.prevShow = [];
    if (this.fallbackTex) this.fallbackTex.dispose();
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const g = c.getContext('2d'); g.fillStyle = this.src.fallback; g.fillRect(0, 0, 4, 4);
    this.fallbackTex = new THREE.CanvasTexture(c);
    this.fallbackTex.colorSpace = THREE.SRGBColorSpace;
  }
  get(z, x, y, parent) {
    const k = z + '/' + x + '/' + y;
    let t = this.tiles.get(k);
    if (!t) { t = new GTile(z, x, y, parent); this.tiles.set(k, t); }
    return t;
  }
  update(camera, now) {
    this.now = now;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const cp = camera.position;
    this.builds = 0;
    this.show = [];
    const [rx, ry] = tileAt(ROOT_Z, cp.x, cp.z);
    const rr = cp.y > 5000 ? 2 : 1; // see further from very high up
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) this.visit(ROOT_Z, rx + dx, ry + dy, cp, null);
    for (const t of this.prevShow) if (t.mesh) t.mesh.visible = false;
    let masks=0;
    for (const t of this.show){t.mesh.visible=true;if(this.hydrography && t.waterRevision!==this.hydrography.waterRevision && masks<4){this.waterMask(t);masks++;}}

    this.prevShow = this.show;
    if ((this._tick = (this._tick || 0) + 1) % 20 === 0) this.housekeep();
  }
  visit(z, x, y, cp, parent) {
    const n = 1 << z;
    if (y < 0 || y >= n || x < 0 || x >= n) return;
    const t = this.get(z, x, y, parent);
    t.used = this.now;
    const dx = cp.x < t.x0 ? t.x0 - cp.x : cp.x > t.x1 ? cp.x - t.x1 : 0;
    const dz = cp.z < t.z0 ? t.z0 - cp.z : cp.z > t.z1 ? cp.z - t.z1 : 0;
    const dy = cp.y > t.maxH ? cp.y - t.maxH : cp.y < t.minH ? t.minH - cp.y : 0;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.box.min.set(t.x0, t.minH - 50, t.z0); this.box.max.set(t.x1, t.maxH + 10, t.z1);
    const inView = this.frustum.intersectsBox(this.box);
    t.prio = d / t.size + (inView ? 0 : 3) + z * 0.02;
    const split = z < this.src.maxZ && d < t.size * this.splitK && (inView || d < t.size * 0.35);
    if (split) {
      const kz = z + 1, kx = x * 2, ky = y * 2;
      let ready = true;
      for (let i = 0; i < 4; i++) {
        const k = this.get(kz, kx + (i & 1), ky + (i >> 1), t);
        k.used = this.now;
        k.prio = t.prio + 0.5;
        this.request(k);
        if (k.state !== 'ready') ready = false;
      }
      if (ready) {
        for (let i = 0; i < 4; i++) this.visit(kz, kx + (i & 1), ky + (i >> 1), cp, t);
        return;
      }
    }
    this.request(t);
    if (t.state === 'ready') this.show.push(t);
  }
  request(t) {
    if (t.state === 'idle') {
      if (this.now < t.retryAt) return;
      t.state = 'queued';
      const gen = this.gen;
      this.sched.add({
        prio: () => t.prio,
        alive: () => gen === this.gen && this.now - t.used < 1200,
        start: () => this.load(t, gen),
        drop: () => { if (t.state === 'queued') t.state = 'idle'; },
      });
    } else if (t.state === 'img') {
      const de = this.dem.need(t.dz, t.dx, t.dy, t.prio);
      if (de.state === 'ready' && this.builds < 10) { this.builds++; this.build(t, this.dem.dataAtTile(t.dz,t.dx,t.dy)); }
    }
  }
  async load(t, gen) {
    if (gen !== this.gen || t.disposed) return;
    t.state = 'loading';
    const ctl = new AbortController(); t.ctl = ctl;
    try {
      const r = await fetchResource(this.src.url(t.z, t.x, t.y), { signal: ctl.signal }, async r=>({ok:r.ok,status:r.status,body:r.ok?await r.blob():null}));
      if (gen !== this.gen || t.disposed) return;
      if (r.status === 404 || r.status === 204) {
        // no imagery here: far-out sea tiles get a flat colour; detailed tiles simply stop the parent from splitting
        if (t.z > 10) { t.state = 'nodata'; return; }
        t.tex = this.fallbackTex; t.state = 'img'; return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = r.body;
      const bmp = await createImageBitmap(blob);
      if (gen !== this.gen || t.disposed) { if (bmp.close) bmp.close(); return; }
      const tex = new THREE.Texture(bmp);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.aniso;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      t.tex = tex; t.state = 'img';
    } catch (e) {
      if (gen !== this.gen || t.disposed) return;
      if (e && e.name === 'AbortError') { t.state = 'idle'; return; }
      t.fails++;
      if (t.fails >= 3) { t.tex = this.fallbackTex; t.state = 'img'; }
      else { t.state = 'idle'; t.retryAt = this.now + 1500 * t.fails; }
    } finally { t.ctl = null; }
  }
  build(t, data) {
    const segs = t.z <= 11 ? 32 : 16;
    const sc = Math.pow(2, t.z - t.dz);
    const offU = t.x - t.dx * sc, offV = t.y - t.dy * sc;
    const S = t.size, n = segs + 1;
    const skirt = Math.max(3, S * 0.02);
    const vcount = n * n + 4 * n;
    const pos = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
    let mn = 1e9, mx = -1e9;
    for (let j = 0; j < n; j++) {
      const v = j / segs;
      for (let i = 0; i < n; i++) {
        const u = i / segs, k = j * n + i;
        const h = data ? sampleDem(data, (offU + u) / sc, (offV + v) / sc) : 0;
        if (h < mn) mn = h; if (h > mx) mx = h;
        pos[k * 3] = (u - 0.5) * S; pos[k * 3 + 1] = h; pos[k * 3 + 2] = (v - 0.5) * S;
        uv[k * 2] = u; uv[k * 2 + 1] = v;
      }
    }
    const edge = (e, s) => (e === 0 ? s : e === 1 ? segs * n + s : e === 2 ? s * n : s * n + segs);
    let k = n * n;
    for (let e = 0; e < 4; e++) for (let s = 0; s < n; s++, k++) {
      const src = edge(e, s);
      pos[k * 3] = pos[src * 3]; pos[k * 3 + 1] = pos[src * 3 + 1] - skirt; pos[k * 3 + 2] = pos[src * 3 + 2];
      uv[k * 2] = uv[src * 2]; uv[k * 2 + 1] = uv[src * 2 + 1];
    }
    const idx = new Uint16Array(segs * segs * 6 + 4 * segs * 6);
    let p = 0;
    for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
    for (let e = 0; e < 4; e++) for (let s = 0; s < segs; s++) {
      const g0 = edge(e, s), g1 = edge(e, s + 1), s0 = n * n + e * n + s, s1 = s0 + 1;
      idx[p++] = g0; idx[p++] = s0; idx[p++] = g1;
      idx[p++] = g1; idx[p++] = s0; idx[p++] = s1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, groundMaterial(t.tex, [((t.cx % 512) + 512) % 512, ((t.cz % 512) + 512) % 512]));
    mesh.renderOrder = -2;
    mesh.position.set(t.cx, 0, t.cz);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.frustumCulled = t.z > 10;
    mesh.visible = false;
    this.group.add(mesh);
    t.mesh = mesh; if(this.hydrography)this.waterMask(t); t.minH = mn - skirt; t.maxH = mx; t.state = 'ready';
  }
  waterMask(t){
    t.waterRevision=this.hydrography.waterRevision;
    const bodies=this.hydrography.getWaterBodies(),b=[t.x0,t.z0,t.x1,t.z1];
    if(t.waterMask){t.waterMask.dispose();t.waterMask=null;}
    const mask=rasterWater(bodies,b,128);
    if(mask.hasWater){const texture=new THREE.DataTexture(mask.data,128,128,THREE.RedFormat);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;t.waterMask=texture;}
    t.mesh.material.uniforms.uWaterMask.value=t.waterMask||this.emptyWaterMask;
  }
  housekeep() {
    const now = this.now;
    for (const t of this.tiles.values()) {
      if (t.state === 'loading' && t.ctl && now - t.used > 2500) t.ctl.abort();
    }
    if (this.tiles.size > this.maxTiles) {
      const arr = [];
      for (const t of this.tiles.values()) if (now - t.used > 1000 && t.state !== 'loading' && t.state !== 'queued') arr.push(t);
      arr.sort((a, b) => a.used - b.used);
      for (let i = 0; i < arr.length && this.tiles.size > this.maxTiles * 0.85; i++) this.dispose(arr[i]);
    }
  }
  dispose(t) {
    t.disposed = true; if(t.waterMask)t.waterMask.dispose();
    if (t.ctl) t.ctl.abort();
    if (t.mesh) { this.group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.mesh = null; }
    if (t.tex && t.tex !== this.fallbackTex) { const img = t.tex.image; t.tex.dispose(); if (img && img.close) img.close(); }
    t.tex = null;
    this.tiles.delete(t.key);
  }
  get loading() { let n = 0; for (const t of this.tiles.values()) if (t.state === 'loading' || t.state === 'queued' || t.state === 'img') n++; return n; }
  get count() { return this.show.length; }
}
