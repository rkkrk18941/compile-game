/* ---------- 粒子と光 ---------- */
const FX = (() => {
  const S = {};
  function radial(key, stops, size = 64) {
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const st of stops) gr.addColorStop(st[0], st[1]);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    S[key] = c;
  }
  function init() {
    if (S._ready) return;
    S._ready = true;
    radial('fireW', [[0, 'rgba(255,255,235,1)'], [0.2, 'rgba(255,228,150,0.9)'], [0.5, 'rgba(255,150,40,0.35)'], [1, 'rgba(255,90,0,0)']]);
    radial('fireO', [[0, 'rgba(255,215,120,0.95)'], [0.3, 'rgba(255,125,30,0.7)'], [0.65, 'rgba(200,50,10,0.25)'], [1, 'rgba(120,20,0,0)']]);
    radial('fireR', [[0, 'rgba(255,110,40,0.75)'], [0.4, 'rgba(170,35,10,0.4)'], [1, 'rgba(80,10,0,0)']]);
    radial('glowW', [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    radial('amb', [[0, 'rgba(255,120,40,0.55)'], [0.5, 'rgba(255,80,20,0.18)'], [1, 'rgba(255,60,10,0)']]);
    for (const k in ELEM) {
      const c = hex2rgb(ELEM[k].color).join(','), l = hex2rgb(ELEM[k].glow).join(',');
      radial('g_' + k, [[0, `rgba(${l},1)`], [0.25, `rgba(${c},0.75)`], [0.6, `rgba(${c},0.22)`], [1, `rgba(${c},0)`]]);
    }
    radial('smoke', [[0, 'rgba(34,30,29,0.85)'], [0.5, 'rgba(30,27,26,0.5)'], [1, 'rgba(26,24,23,0)']]);
    radial('smokeL', [[0, 'rgba(92,86,82,0.6)'], [0.5, 'rgba(80,75,71,0.35)'], [1, 'rgba(70,66,62,0)']]);
    radial('smokeF', [[0, 'rgba(120,60,30,0.6)'], [0.5, 'rgba(80,40,24,0.35)'], [1, 'rgba(50,30,20,0)']]);
    radial('dust', [[0, 'rgba(132,118,100,0.75)'], [0.55, 'rgba(112,100,86,0.38)'], [1, 'rgba(96,86,74,0)']]);
    radial('c_poison', [[0, 'rgba(140,215,70,0.5)'], [0.6, 'rgba(90,165,40,0.22)'], [1, 'rgba(60,110,20,0)']]);
    radial('c_curse', [[0, 'rgba(105,55,170,0.55)'], [0.6, 'rgba(65,25,120,0.26)'], [1, 'rgba(40,10,80,0)']]);
    radial('c_thunder', [[0, 'rgba(90,190,255,0.35)'], [1, 'rgba(60,140,255,0)']]);
    radial('c_fire', [[0, 'rgba(255,120,40,0.35)'], [1, 'rgba(255,80,20,0)']]);
    radial('c_shock', [[0, 'rgba(150,135,110,0.55)'], [1, 'rgba(120,105,90,0)']]);
    radial('steam', [[0, 'rgba(200,205,212,0.45)'], [1, 'rgba(200,205,212,0)']]);
    radial('shadow', [[0, 'rgba(0,0,0,0.6)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
  }

  class PS {
    constructor(cap) { this.a = []; this.cap = cap; }
    add(p) {
      if (this.a.length >= this.cap) {
        if (!p.must) return null;
        this.a.splice(0, 8);
      }
      p.life = 0;
      if (p.vx === undefined) p.vx = 0;
      if (p.vy === undefined) p.vy = 0;
      if (p.g === undefined) p.g = 0;
      if (p.drag === undefined) p.drag = 0;
      if (p.grow === undefined) p.grow = 0;
      if (p.a0 === undefined) p.a0 = 1;
      this.a.push(p);
      return p;
    }
    update(dt) {
      const a = this.a;
      let j = 0;
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        p.life += dt;
        if (p.life >= p.max) continue;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += p.g * dt;
        if (p.wind) p.vx += p.wind * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
        if (p.k === 'r' && p.y > (p.gy || 0)) { p.y = p.gy || 0; p.vy *= -0.25; p.vx *= 0.55; if (p.vr) p.vr *= 0.5; }
        a[j++] = p;
      }
      a.length = j;
    }
    draw(g, cam, additive) {
      const a = this.a, sc = cam.s, gx = cam.x, gy = cam.gy, W = cam.W;
      g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        if (!!p.add !== additive) continue;
        const u = p.life / p.max;
        const sx = (p.x - gx) * sc, sy = gy + p.y * sc;
        if (sx < -300 || sx > W + 300) continue;
        let al = p.a0 * (p.fin ? Math.min(1, u / p.fin) : 1) * (1 - Math.pow(u, p.fp || 1.4));
        if (al <= 0.003) continue;
        if (p.k === 'r') {
          g.globalAlpha = Math.min(1, al * 1.4);
          g.fillStyle = p.c;
          const w = p.w * sc, h = p.h * sc;
          if (w < 2.5) g.fillRect(sx - w / 2, sy - h / 2, w, h);
          else { g.save(); g.translate(sx, sy); g.rotate(p.rot || 0); g.fillRect(-w / 2, -h / 2, w, h); g.restore(); }
        } else if (p.k === 'l') {
          g.globalAlpha = al; g.strokeStyle = p.c; g.lineWidth = Math.max(1, (p.lw || 0.3) * sc);
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - p.vx * (p.tl || 0.05) * sc, sy - p.vy * (p.tl || 0.05) * sc); g.stroke();
        } else if (p.k === 'ring') {
          g.globalAlpha = al; g.strokeStyle = p.c; g.lineWidth = Math.max(1, p.lw * sc * (1 - u * 0.6));
          g.beginPath(); g.ellipse(sx, sy, (p.r0 + p.vr * p.life) * sc, (p.r0 + p.vr * p.life) * sc * (p.flat || 1), 0, 0, TAU); g.stroke();
        } else if (p.k === 'bolt') {
          g.globalAlpha = al;
          g.beginPath();
          for (let k = 0; k < p.pts.length; k++) { const q = p.pts[k]; const X = (q[0] - gx) * sc, Y = gy + q[1] * sc; if (k === 0) g.moveTo(X, Y); else g.lineTo(X, Y); }
          g.strokeStyle = rgba(p.c, 0.35); g.lineWidth = Math.max(3, 2.4 * sc); g.stroke();
          g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1.2, 0.6 * sc); g.stroke();
        } else {
          let sp = S[p.sp];
          if (p.fire) sp = u < 0.22 ? S.fireW : u < 0.55 ? S.fireO : S.fireR;
          const size = (p.size + p.grow * p.life) * sc;
          if (size < 0.5) continue;
          g.globalAlpha = Math.min(1, al);
          g.drawImage(sp, sx - size / 2, sy - size / 2, size, size);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }
  function boltPts(x0, y0, x1, y1, n = 10, jit = 0.18) {
    const pts = [[x0, y0]];
    const d = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 1; i < n; i++) {
      const u = i / n;
      pts.push([lerp(x0, x1, u) + (Math.random() - 0.5) * d * jit, lerp(y0, y1, u) + (Math.random() - 0.5) * d * jit * 0.3]);
    }
    pts.push([x1, y1]);
    return pts;
  }
  return { S, init, PS, boltPts };
})();
