// GSI elevation tiles (dem_png): decoded to Float32 heights in metres.
import { wx01, wy01 } from './geo.js';

const DEM_URL = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`;
export const DEM_MAXZ = 14, DEM_MINZ = 5;

let ctx2d = null;
function getCtx() {
  if (!ctx2d) {
    try { if (typeof OffscreenCanvas !== 'undefined') ctx2d = new OffscreenCanvas(256, 256).getContext('2d', { willReadFrequently: true }); } catch (e) { ctx2d = null; }
    if (!ctx2d) { const c = document.createElement('canvas'); c.width = c.height = 256; ctx2d = c.getContext('2d', { willReadFrequently: true }); }
  }
  return ctx2d;
}

export function sampleDem(data, u, v) {
  if (!data) return 0;
  let px = u * 256 - 0.5, py = v * 256 - 0.5;
  if (px < 0) px = 0; else if (px > 255) px = 255;
  if (py < 0) py = 0; else if (py > 255) py = 255;
  const x0 = px | 0, y0 = py | 0;
  const x1 = x0 < 255 ? x0 + 1 : 255, y1 = y0 < 255 ? y0 + 1 : 255;
  const fx = px - x0, fy = py - y0;
  const r0 = y0 * 256, r1 = y1 * 256;
  const a = data[r0 + x0], b = data[r0 + x1], c = data[r1 + x0], d = data[r1 + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// Which DEM zoom a ground tile of zoom z uses (coarser DEM for far tiles = fewer downloads).
export const demZoomFor = (z) => (z >= 16 ? 14 : Math.max(DEM_MINZ, Math.min(14, z - 2)));

export class Dem {
  constructor(sched) { this.sched = sched; this.map = new Map(); this.now = 0; }
  need(z, x, y, prio) {
    const k = z + '/' + x + '/' + y;
    let e = this.map.get(k);
    const now = this.now;
    if (!e) {
      e = { k, z, x, y, state: 'idle', data: null, min: 0, max: 0, prio, used: now, retryAt: 0, fails: 0 };
      this.map.set(k, e);
    }
    if (e.pf !== now) { e.pf = now; e.prio = prio; } else if (prio < e.prio) e.prio = prio;
    e.used = now;
    if (e.state === 'idle' && now >= e.retryAt) {
      e.state = 'queued';
      this.sched.add({
        prio: () => e.prio,
        alive: () => this.now - e.used < 2500,
        start: () => this._load(e),
        drop: () => { e.state = 'idle'; },
      });
    }
    return e;
  }
  get(z, x, y) { return this.map.get(z + '/' + x + '/' + y); }
  async _load(e) {
    e.state = 'loading';
    const ctl = new AbortController(); e.ctl = ctl;
    try {
      const r = await fetch(DEM_URL(e.z, e.x, e.y), { signal: ctl.signal });
      if (!r.ok) {
        if (r.status >= 500 && e.fails < 2) throw new Error('HTTP ' + r.status);
        e.data = null; e.state = 'ready'; return; // 404 = sea / outside Japan
      }
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const ctx = getCtx();
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(bmp, 0, 0, 256, 256);
      if (bmp.close) bmp.close();
      const px = ctx.getImageData(0, 0, 256, 256).data;
      const out = new Float32Array(65536);
      let mn = 1e9, mx = -1e9;
      for (let i = 0, p = 0; i < 65536; i++, p += 4) {
        const v = px[p] * 65536 + px[p + 1] * 256 + px[p + 2];
        let h = v === 8388608 ? 0 : v > 8388608 ? (v - 16777216) * 0.01 : v * 0.01;
        if (h < -100 || h > 4000) h = 0;
        out[i] = h;
        if (h < mn) mn = h; if (h > mx) mx = h;
      }
      e.data = out; e.min = mn; e.max = mx; e.state = 'ready';
    } catch (err) {
      if (err && err.name === 'AbortError') { e.state = 'idle'; return; }
      e.fails++;
      if (e.fails >= 3) { e.data = null; e.state = 'ready'; }
      else { e.state = 'idle'; e.retryAt = this.now + 1500 * e.fails; }
    } finally { e.ctl = null; }
  }
  update(now) {
    this.now = now;
    if ((this._tick = (this._tick || 0) + 1) % 30) return;
    for (const e of this.map.values()) {
      if (e.state === 'loading' && now - e.used > 5000 && e.ctl) e.ctl.abort();
    }
    if (this.map.size > 140) {
      const arr = [...this.map.values()].filter((e) => e.state === 'ready' && now - e.used > 8000);
      arr.sort((a, b) => a.used - b.used);
      for (let i = 0; i < arr.length && this.map.size > 110; i++) this.map.delete(arr[i].k);
    }
  }
  // Ground height in metres at a world position, from the most detailed DEM tile in memory.
  heightAt(wx, wz) {
    const fx = wx01(wx), fy = wy01(wz);
    for (let z = DEM_MAXZ; z >= DEM_MINZ; z--) {
      const n = Math.pow(2, z);
      const tx = Math.floor(fx * n), ty = Math.floor(fy * n);
      const e = this.map.get(z + '/' + tx + '/' + ty);
      if (e && e.state === 'ready') return sampleDem(e.data, fx * n - tx, fy * n - ty);
    }
    return 0;
  }
  hasDetail(wx, wz) {
    const n = 16384, e = this.map.get('14/' + Math.floor(wx01(wx) * n) + '/' + Math.floor(wy01(wz) * n));
    return !!(e && e.state === 'ready');
  }
}
