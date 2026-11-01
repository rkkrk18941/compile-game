// Round north-up minimap drawn from GSI map tiles (images only, no pixel reads -> no CORS needed).
import { wx01, wy01 } from './geo.js';

const URL_T = (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/std/${z}/${x}/${y}.png`;

export class Minimap {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.cache = new Map();
  }
  img(z, x, y) {
    const k = z + '/' + x + '/' + y;
    let e = this.cache.get(k);
    if (!e) {
      const im = new Image();
      im.decoding = 'async';
      e = { im, ok: false, used: 0 };
      im.onload = () => { e.ok = true; };
      im.src = URL_T(z, x, y);
      this.cache.set(k, e);
      if (this.cache.size > 160) {
        const arr = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
        for (let i = 0; i < 40; i++) this.cache.delete(arr[i][0]);
      }
    }
    e.used = performance.now();
    return e;
  }
  draw(px, pz, heading, camYaw, alt, spots, collected, dest, pois = [], route = []) {
    const c = this.c, g = this.g;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(c.clientWidth * dpr) || 200;
    if (c.width !== W) { c.width = W; c.height = W; }
    const R = W / 2;
    const z = alt < 120 ? 16 : alt < 500 ? 15 : alt < 1500 ? 14 : alt < 4000 ? 12 : 10;
    const scale = 1.05 * dpr; // screen px per tile px
    const n = Math.pow(2, z);
    const gx = wx01(px) * n * 256, gy = wy01(pz) * n * 256;
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#dfe9f1'; g.fillRect(0, 0, W, W);
    const span = R / scale;
    const tx0 = Math.floor((gx - span) / 256), tx1 = Math.floor((gx + span) / 256);
    const ty0 = Math.floor((gy - span) / 256), ty1 = Math.floor((gy + span) / 256);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (ty < 0 || ty >= n) continue;
      const e = this.img(z, ((tx % n) + n) % n, ty);
      const sx = R + (tx * 256 - gx) * scale, sy = R + (ty * 256 - gy) * scale;
      if (e.ok) g.drawImage(e.im, sx, sy, 256 * scale + 0.5, 256 * scale + 0.5);
    }
    // view cone
    g.translate(R, R);
    g.fillStyle = 'rgba(80,150,255,0.18)';
    g.beginPath(); g.moveTo(0, 0);
    g.arc(0, 0, R * 0.9, camYaw - Math.PI / 2 - 0.55, camYaw - Math.PI / 2 + 0.55); g.closePath(); g.fill();
    // Actual nearby features, clipped to their true minimap position.
    for(const p of pois.slice(0,160)) {
      if(p.kind==='place')continue;
      const dx=(wx01(p.x)*n*256-gx)*scale,dy=(wy01(p.z)*n*256-gy)*scale;
      if(Math.hypot(dx,dy)>R-6*dpr)continue;
      g.fillStyle=p.color;g.strokeStyle='#fff';g.lineWidth=dpr;g.beginPath();g.arc(dx,dy,3*dpr,0,Math.PI*2);g.fill();g.stroke();
    }
    // spots
    for (const s of spots) {
      let dx = (wx01(s.x) * n * 256 - gx) * scale, dy = (wy01(s.z) * n * 256 - gy) * scale;
      const d = Math.hypot(dx, dy), lim = R - 7 * dpr;
      const edge = d > lim;
      if (edge) { dx *= lim / d; dy *= lim / d; }
      const done = collected.has(s.s.id);
      g.fillStyle = done ? '#2fbf71' : '#ffb300';
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.2 * dpr;
      g.beginPath(); g.arc(dx, dy, (edge ? 3.2 : 4.4) * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (dest) {
      let dx = (wx01(dest.x) * n * 256 - gx) * scale, dy = (wy01(dest.z) * n * 256 - gy) * scale;
      const d = Math.hypot(dx, dy), lim = R - 8 * dpr;
      if (d > lim) { dx *= lim / d; dy *= lim / d; }
      g.fillStyle = '#b07bff'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(dx, dy, 5.5 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if(route.length>1){g.strokeStyle='#e0aa26';g.lineWidth=3*dpr;g.beginPath();for(let i=0;i<route.length;i++){const p=route[i],dx=(wx01(p.x)*n*256-gx)*scale,dy=(wy01(p.z)*n*256-gy)*scale;if(i)g.lineTo(dx,dy);else g.moveTo(dx,dy);}g.stroke();}
    // player arrow
    g.rotate(heading);
    g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6.5 * dpr, 7 * dpr); g.lineTo(0, 3.5 * dpr); g.lineTo(-6.5 * dpr, 7 * dpr); g.closePath();
    g.stroke(); g.fill();
    g.restore();
    // north mark
    g.fillStyle = 'rgba(255,255,255,.95)'; g.font = `700 ${11 * dpr}px system-ui,sans-serif`; g.textAlign = 'center';
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3 * dpr;
    g.strokeText('N', R, 13 * dpr); g.fillText('N', R, 13 * dpr);
  }
}
