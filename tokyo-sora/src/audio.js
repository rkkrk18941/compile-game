// Procedural sound: wind that rises with speed, a chime for stamps, small whooshes.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99 * b0 + w * 0.06; b1 = 0.96 * b1 + w * 0.12; d[i] = (b0 + b1) * 0.5; }
    this.noise = buf;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 300; this.windF.Q.value = 0.7;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    src.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  wind(speed, flying) {
    if (!this.ctx) return;
    const s = Math.min(1, speed / (flying ? 260 : 40));
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime((flying ? 0.05 : 0.0) + s * 0.55, t, 0.25);
    this.windF.frequency.setTargetAtTime(220 + s * 1600, t, 0.25);
  }
  tone(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  whoosh(up) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 300 : 900, t); f.frequency.exponentialRampToValueAtTime(up ? 1400 : 200, t + 0.45);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.6);
  }
  thud() { this.tone(70, 0.3, 'sine', 0.5); this.tone(45, 0.4, 'triangle', 0.3); }
  jump() { this.tone(420, 0.12, 'square', 0.05); this.tone(640, 0.1, 'square', 0.04, 0.05); }
  chime() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, i * 0.09)); }
  click() { this.tone(900, 0.05, 'sine', 0.06); }
}
