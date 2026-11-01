// Procedural sound: wind, engines, explosions, guns, chimes. No audio files.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.lastGun = 0; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99 * b0 + w * 0.06; b1 = 0.96 * b1 + w * 0.12; d[i] = (b0 + b1) * 0.5; }
    this.noise = buf;
    const wbuf = ctx.createBuffer(1, len, ctx.sampleRate), wd = wbuf.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wbuf;
    // wind
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 300;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); src.start();
    // engine
    this.engO = ctx.createOscillator(); this.engO.type = 'sawtooth'; this.engO.frequency.value = 40;
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.engO.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master); this.engO.start();
    const jet = ctx.createBufferSource(); jet.buffer = wbuf; jet.loop = true;
    this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'bandpass'; this.jetF.frequency.value = 900; this.jetF.Q.value = 0.6;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    jet.connect(this.jetF); this.jetF.connect(this.jetG); this.jetG.connect(this.master); jet.start();
    // rain
    const rain = ctx.createBufferSource(); rain.buffer = wbuf; rain.loop = true;
    this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 2500;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    rain.connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(this.master); rain.start();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  wind(speed, flying) {
    if (!this.ctx) return;
    const s = Math.min(1, speed / (flying ? 260 : 40)), t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime((flying ? 0.05 : 0.0) + s * 0.5, t, 0.25);
    this.windF.frequency.setTargetAtTime(220 + s * 1600, t, 0.25);
  }
  engine(kind, speed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'car' || kind === 'tank') {
      const base = kind === 'tank' ? 28 : 45, k = kind === 'tank' ? 4 : 2.2;
      this.engO.frequency.setTargetAtTime(base + Math.abs(speed) * k, t, 0.1);
      this.engF.frequency.setTargetAtTime(kind === 'tank' ? 260 : 380 + Math.abs(speed) * 12, t, 0.1);
      this.engG.gain.setTargetAtTime(kind === 'tank' ? 0.22 : 0.13, t, 0.2);
    } else this.engG.gain.setTargetAtTime(0, t, 0.2);
    if (kind === 'jet') { this.jetG.gain.setTargetAtTime(0.12 + throttle * 0.25, t, 0.2); this.jetF.frequency.setTargetAtTime(500 + throttle * 1400, t, 0.2); }
    else this.jetG.gain.setTargetAtTime(0, t, 0.2);
  }
  rain(k) { if (this.ctx) this.rainG.gain.setTargetAtTime(k * 0.16, this.ctx.currentTime, 0.5); }
  tone(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, f0, f1, vol, q, type, white) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = white ? this.white : this.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  boom(k) { this.burst(1.6 + k, 1800, 60, 0.9 * (0.4 + k * 0.6), 0.7, 'lowpass', true); this.tone(55, 0.9, 'sine', 0.7 * (0.4 + k * 0.6)); }
  rumble(k) { this.burst(3.5, 400, 40, 0.5 + k * 0.4, 0.5, 'lowpass', true); }
  cannon() { this.burst(0.8, 2200, 80, 0.9, 0.7, 'lowpass', true); this.tone(70, 0.4, 'sine', 0.6); }
  launch() { this.burst(0.6, 600, 2400, 0.4, 1.2, 'bandpass', true); }
  gun() { const n = performance.now(); if (n - this.lastGun < 45) return; this.lastGun = n; this.burst(0.07, 3000, 800, 0.35, 0.8, 'bandpass', true); }
  whoosh(up) { this.burst(0.5, up ? 300 : 900, up ? 1400 : 200, 0.5, 1.2, 'bandpass'); }
  thud() { this.tone(70, 0.3, 'sine', 0.5); this.tone(45, 0.4, 'triangle', 0.3); }
  crash() { this.burst(0.5, 3000, 300, 0.7, 0.6, 'lowpass', true); this.tone(90, 0.25, 'square', 0.15); }
  horn() { this.tone(415, 0.45, 'square', 0.12); this.tone(523, 0.45, 'square', 0.1); }
  jump() { this.tone(420, 0.12, 'square', 0.05); this.tone(640, 0.1, 'square', 0.04, 0.05); }
  chime() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.16, i * 0.09)); }
  click() { this.tone(900, 0.05, 'sine', 0.06); }
}
