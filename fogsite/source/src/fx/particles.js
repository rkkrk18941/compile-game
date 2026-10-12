// Drifting dust motes and embers (2D canvas, very cheap).
export class Particles {
  constructor(canvas) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.parts = [];
    this.enabled = true;
    this.warm = 0.25;
    this.burstQ = [];
    this.last = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(this.loop); });
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(46, (this.w * this.h) / 16000));
    while (this.parts.length < n) this.parts.push(this.spawn(true));
    this.parts.length = n;
  }
  spawn(anywhere = false) {
    const ember = Math.random() < this.warm;
    return {
      x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : this.h + 10,
      vx: (Math.random() - 0.5) * 6, vy: -(4 + Math.random() * (ember ? 16 : 7)),
      r: ember ? 0.8 + Math.random() * 1.4 : 0.6 + Math.random() * 1.8,
      a: 0, life: 0, max: 8 + Math.random() * 12, ember, tw: Math.random() * 6,
    };
  }
  burst(x, y, color = '255,190,110', n = 26, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.9);
      this.burstQ.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, r: 1 + Math.random() * 2.2, life: 0, max: 0.6 + Math.random() * 0.8, color });
    }
  }
  loop(now) {
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    const x = this.x;
    x.clearRect(0, 0, this.w, this.h);
    if (this.enabled) {
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        p.life += dt; p.x += p.vx * dt + Math.sin(now / 1300 + p.tw) * 0.15; p.y += p.vy * dt;
        p.a = Math.min(1, p.life / 2) * Math.max(0, 1 - p.life / p.max);
        if (p.life > p.max || p.y < -10) { this.parts[i] = this.spawn(); continue; }
        const tw = 0.6 + 0.4 * Math.sin(now / 400 + p.tw * 3);
        x.fillStyle = p.ember ? `rgba(255,${150 + p.tw * 12 | 0},80,${0.55 * p.a * tw})` : `rgba(210,230,222,${0.22 * p.a})`;
        x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill();
      }
    }
    for (let i = this.burstQ.length - 1; i >= 0; i--) {
      const p = this.burstQ[i];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; p.vx *= 0.98;
      const a = Math.max(0, 1 - p.life / p.max);
      if (a <= 0) { this.burstQ.splice(i, 1); continue; }
      x.fillStyle = `rgba(${p.color},${a})`;
      x.beginPath(); x.arc(p.x, p.y, p.r * (0.6 + a * 0.6), 0, 6.283); x.fill();
    }
    requestAnimationFrame(this.loop);
  }
}
