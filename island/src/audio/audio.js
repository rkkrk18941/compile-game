// Synthesised soundscape (no samples): surf, wind, insects, birds, frogs, the Heart,
// helicopter, footsteps by surface and UI/creature effects.
let ctx = null;

function noiseBuffer(sec, color = "white") {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (color === "pink") { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    else d[i] = w;
  }
  return b;
}

function loopSource(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(0, Math.random() * buf.duration);
  return s;
}

export const Audio = {
  volume: +(localStorage.getItem("island.vol") ?? 0.8),
  ready: false,

  init() {
    if (this.ready) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.ready = true;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    this.white = noiseBuffer(2, "white");
    this.pink = noiseBuffer(4, "pink");
    this.brown = noiseBuffer(5, "brown");
    // ---- ambience beds
    const bed = (buf, type, freq, q) => {
      const src = loopSource(buf);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q || 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      return { src, f, g };
    };
    this.surf = bed(this.brown, "lowpass", 700);
    this.surf2 = bed(this.pink, "bandpass", 1600, 0.6);
    this.wind = bed(this.pink, "bandpass", 700, 0.8);
    this.leaves = bed(this.white, "highpass", 4500, 0.5);
    this.drone = bed(this.brown, "lowpass", 90);
    this.rotor = bed(this.brown, "lowpass", 380);
    this.turbine = ctx.createOscillator();
    this.turbine.type = "sawtooth";
    this.turbine.frequency.value = 2900;
    this.turbineG = ctx.createGain();
    this.turbineG.gain.value = 0;
    const tf = ctx.createBiquadFilter();
    tf.type = "bandpass";
    tf.frequency.value = 2900;
    tf.Q.value = 8;
    this.turbine.connect(tf).connect(this.turbineG).connect(this.master);
    this.turbine.start();
    // insects: amplitude-modulated high tones
    this.cicada = this.insect(4300, 18, 0.9);
    this.cricket = this.insect(5200, 3.5, 0.5);
    this.scanTone = ctx.createOscillator();
    this.scanTone.type = "sine";
    this.scanTone.frequency.value = 1200;
    this.scanG = ctx.createGain();
    this.scanG.gain.value = 0;
    this.scanTone.connect(this.scanG).connect(this.master);
    this.scanTone.start();
    this.t = 0;
    this.nextBird = 2;
    this.nextFrog = 1;
    this.nextBeat = 0;
    this.nextCrash = 3;
  },

  insect(freq, rate, depth) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.value = depth * 0.5;
    lfo.connect(lg).connect(am.gain);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(bp).connect(am).connect(g).connect(this.master);
    o.start();
    lfo.start();
    am.gain.value = 0.5;
    return { g, o, lfo };
  },

  setVolume(v) {
    this.volume = v;
    localStorage.setItem("island.vol", String(v));
    if (this.master) this.master.gain.value = v;
  },

  ramp(param, v, t = 0.4) { param.setTargetAtTime(v, ctx.currentTime, t); },

  /** env: {zone, night, cam, heli, canopy, wading, mire, decoys, menu} */
  update(dt, env) {
    if (!this.ready || ctx.state !== "running") return;
    this.t += dt;
    const cam = env.cam.position;
    const alt = Math.max(0, cam.y);
    const zone = env.zone;
    const shore = zone === "shore" ? 1 : zone === "mire" ? 0.45 : zone === "jungle" ? 0.25 : 0.12;
    const wave = 0.55 + 0.45 * Math.sin(this.t * 0.75) * Math.sin(this.t * 0.31);
    this.ramp(this.surf.g.gain, (env.menu ? 0.5 : shore) * 0.55 * wave, 0.6);
    this.ramp(this.surf2.g.gain, (env.menu ? 0.3 : shore) * 0.12 * wave, 0.6);
    const windAmt = 0.06 + Math.min(alt / 260, 1) * 0.25 + (zone === "ridge" ? 0.12 : 0) + (zone === "shore" ? 0.05 : 0);
    this.wind.f.frequency.value = 500 + 400 * Math.sin(this.t * 0.13);
    this.ramp(this.wind.g.gain, windAmt * (0.7 + 0.3 * Math.sin(this.t * 0.4)), 1);
    this.ramp(this.leaves.g.gain, (zone === "jungle" ? 0.02 : 0.006) * (0.6 + 0.4 * Math.sin(this.t * 0.9)), 1);
    const day = 1 - env.night;
    const jungle = zone === "jungle" || zone === "mire" ? 1 : zone === "shore" ? 0.3 : 0.05;
    this.ramp(this.cicada.g.gain, day * jungle * 0.018 * (0.6 + 0.4 * Math.sin(this.t * 0.11)), 1.5);
    this.ramp(this.cricket.g.gain, env.night * (jungle + 0.3) * 0.012, 1.5);
    // heart drone and beat
    const heartD = env.heartDist ?? 9999;
    this.ramp(this.drone.g.gain, zone === "heart" ? 0.35 : 0.0, 2);
    // helicopter
    const h = env.heli;
    if (h && h.root.visible) {
      const d = h.pos.distanceTo(cam);
      const att = Math.min(1, 40 / (d + 10)) * h.rotor;
      const blade = 17 * h.rotor + 1;
      this.rotor.f.frequency.value = 320 + 200 * Math.max(0, Math.sin(this.t * blade * Math.PI * 2));
      this.ramp(this.rotor.g.gain, att * 1.4 * (0.6 + 0.4 * Math.abs(Math.sin(this.t * blade * Math.PI))), 0.02);
      this.ramp(this.turbineG.gain, att * 0.025, 0.2);
    } else {
      this.ramp(this.rotor.g.gain, 0, 0.5);
      this.ramp(this.turbineG.gain, 0, 0.5);
    }
    // one-shots: birds by day, frogs in the mire, crashing waves
    this.nextBird -= dt;
    if (this.nextBird < 0 && day > 0.5 && !env.menu) { this.nextBird = 2 + Math.random() * 6; if (zone !== "heart") this.bird(zone === "jungle" ? 1 : 0.5); }
    this.nextFrog -= dt;
    if (this.nextFrog < 0) { this.nextFrog = 0.4 + Math.random() * 2; if (env.mire > 0.3) this.frog(env.mire); }
    this.nextCrash -= dt;
    if (this.nextCrash < 0) { this.nextCrash = 5 + Math.random() * 6; if (shore > 0.4) this.noise(1.6, "lowpass", 900, shore * 0.25, 0.4); }
  },

  // ---- primitives
  noise(dur, type, freq, gain, attack = 0.005, pan = 0, q = 0.7, buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf || this.white;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
    return { f, g };
  },
  tone(freq, dur, gain, type = "sine", glide = 0, pan = 0, delay = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  bird(k) {
    const pan = Math.random() * 1.6 - 0.8;
    const base = 1800 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base * (1 + 0.15 * Math.sin(i)), 0.09 + Math.random() * 0.08, 0.03 * k, "sine", 0.7 + Math.random() * 0.8, pan, i * 0.13);
  },
  frog(k) {
    const pan = Math.random() * 1.6 - 0.8;
    const f = 140 + Math.random() * 120;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f, 0.12, 0.05 * k, "sawtooth", 0.8, pan, i * 0.16);
  },

  step(surface, speed, wading) {
    if (!this.ready) return;
    const v = Math.min(1, 0.4 + speed / 6);
    if (wading > 0.2 || surface === "water") { this.noise(0.35, "lowpass", 1200, 0.12 * v, 0.01, 0, 0.7, this.pink); this.noise(0.2, "bandpass", 2500, 0.04 * v); return; }
    switch (surface) {
      case "sand": this.noise(0.18, "lowpass", 1800, 0.07 * v, 0.01, 0, 0.6, this.pink); break;
      case "leaves": this.noise(0.12, "highpass", 2400, 0.06 * v); this.noise(0.09, "bandpass", 5000, 0.03 * v, 0.002, 0, 3); break;
      case "mud": this.noise(0.25, "lowpass", 500, 0.12 * v, 0.02, 0, 2, this.brown); this.tone(180, 0.12, 0.02 * v, "sine", 0.6); break;
      case "rock": this.noise(0.06, "bandpass", 3000, 0.06 * v, 0.001, 0, 2); this.tone(900 + Math.random() * 400, 0.04, 0.012 * v, "triangle"); break;
      default: this.noise(0.14, "bandpass", 1500, 0.05 * v, 0.01, 0, 1);
    }
  },

  scan(on, locked) {
    if (!this.ready) return;
    this.ramp(this.scanG.gain, on ? (locked ? 0.012 : 0.004) : 0, 0.05);
    this.scanTone.frequency.value = locked ? 1500 + 300 * Math.sin(ctx.currentTime * 12) : 900;
  },

  play(name, pos) {
    if (!this.ready) return;
    switch (name) {
      case "radio": this.tone(1200, 0.08, 0.06, "square"); this.tone(1600, 0.08, 0.06, "square", 0, 0, 0.12); this.noise(0.5, "bandpass", 2000, 0.05, 0.05, 0, 0.5); break;
      case "static": this.noise(1.2, "bandpass", 2500, 0.12, 0.05, 0, 0.3); break;
      case "beep": for (let i = 0; i < 3; i++) this.tone(1800 + i * 300, 0.1, 0.05, "square", 0, 0, i * 0.14); break;
      case "deploy": this.noise(0.08, "bandpass", 4000, 0.1, 0.001, 0, 4); this.tone(600, 0.15, 0.04, "triangle", 1.6, 0, 0.1); this.tone(2400, 0.3, 0.03, "sine", 1, 0, 0.3); break;
      case "discover": this.tone(880, 0.25, 0.05, "sine"); this.tone(1320, 0.35, 0.05, "sine", 0, 0, 0.12); break;
      case "complete": [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.4, 0.04, "sine", 0, 0, i * 0.1)); break;
      case "hurt": this.noise(0.3, "lowpass", 500, 0.35, 0.002, 0, 1, this.brown); this.tone(110, 0.25, 0.15, "sine", 0.6); break;
      case "hit": this.noise(0.2, "bandpass", 1200, 0.2, 0.002, 0, 2); break;
      case "growl": this.noise(1.1, "bandpass", 180, 0.4, 0.15, 0, 4, this.brown); this.tone(70, 1.0, 0.12, "sawtooth", 0.8); break;
      case "splash": this.noise(0.8, "lowpass", 1500, 0.35, 0.01, 0, 0.6, this.pink); this.noise(0.4, "highpass", 3000, 0.1, 0.01); break;
      case "break": this.noise(0.15, "bandpass", 2500, 0.3, 0.001, 0, 3); this.tone(300, 0.6, 0.06, "sawtooth", 0.3, 0, 0.05); break;
      case "creak": this.tone(220, 0.8, 0.05, "sawtooth", 1.5); this.tone(160, 0.9, 0.04, "sawtooth", 0.7, 0, 0.3); break;
      case "decoy": for (let i = 0; i < 8; i++) this.tone(2200, 0.06, 0.04, "square", 0, 0, i * 0.25); break;
      case "click": this.noise(0.03, "bandpass", 5000, 0.05, 0.001, 0, 5); break;
    }
  },
};
