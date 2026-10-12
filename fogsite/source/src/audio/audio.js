// ─────────────────────────────────────────────────────────────
//  Procedural audio: adaptive ambient score + synthesized SFX (Web Audio).
// ─────────────────────────────────────────────────────────────
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
const D_MINOR_BELLS = [62, 65, 67, 69, 72, 74, 77];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.8 };
    this.muted = false;
    this.mood = 'title';
    this.intensity = 0;
    this.heartbeat = false;
    this.padVoices = [];
    this.chordIdx = 0;
    this.started = false;
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }
  setMuted(m) { this.muted = !!m; this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.9, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  // Must be called from a user gesture (mobile autoplay policy).
  unlock() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.started) { this.started = true; this.startMusic(); }
    return true;
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    this.master.connect(comp).connect(c.destination);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.8, 2.6);
    const revOut = c.createGain(); revOut.gain.value = 0.9;
    const revLp = c.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 3800;
    this.reverb.connect(revLp).connect(revOut).connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicWet = c.createGain(); this.musicWet.gain.value = 0.55; this.musicBus.connect(this.musicWet).connect(this.reverb);
    this.sfxWet = c.createGain(); this.sfxWet.gain.value = 0.28; this.sfxBus.connect(this.sfxWet).connect(this.reverb);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    });
  }

  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) { const x = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, decay) * (i < 300 ? i / 300 : 1); }
    }
    return buf;
  }
  makeNoise(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ───────── helpers ─────────
  now() { return this.ctx.currentTime; }
  osc(type, freq, t0, dur, gainPeak, { attack = 0.005, release = null, dest = this.sfxBus, detune = 0, glideTo = null, glideTime = null, filter = null } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + (glideTime ?? dur));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (release ?? dur));
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 0.7; node.connect(f); node = f; }
    node.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + (release ?? dur) + 0.05);
    return o;
  }
  noise(t0, dur, gainPeak, { type = 'bandpass', freq = 1000, q = 1, freqTo = null, attack = 0.005, dest = this.sfxBus } = {}) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }
  bell(freq, t0, gain = 0.06, len = 3.5, dest = this.sfxBus) {
    [[1, 1], [2.76, 0.42], [5.4, 0.18], [8.93, 0.08]].forEach(([m, v], i) => {
      this.osc('sine', freq * m, t0, len, gain * v, { attack: 0.004, release: len * (1 - i * 0.18), dest });
    });
  }

  // ───────── music ─────────
  startMusic() {
    if (!this.ctx) return;
    const c = this.ctx;
    // Drone
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0.0001;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.6;
    this.droneFilter = lp;
    for (const [f, type, v] of [[NOTE(38), 'sine', 0.55], [NOTE(38), 'sawtooth', 0.12], [NOTE(45), 'sine', 0.28], [NOTE(26), 'sine', 0.35]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8; g.gain.value = v;
      o.connect(g).connect(lp); o.start();
    }
    const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.045; lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    lp.connect(this.droneGain).connect(this.musicBus);
    this.droneGain.gain.setTargetAtTime(0.16, c.currentTime, 2.5);
    // Wind
    const ws = c.createBufferSource(); ws.buffer = this.noiseBuf; ws.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 520; wf.Q.value = 0.9;
    const wg = c.createGain(); wg.gain.value = 0.018;
    const wl = c.createOscillator(), wlg = c.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 260;
    wl.connect(wlg).connect(wf.frequency); wl.start();
    ws.connect(wf).connect(wg).connect(this.musicBus); ws.start();
    this.windGain = wg;
    this.scheduleChord();
    this.scheduleBells();
    this.schedulePulse();
  }

  chordSet() {
    if (this.mood === 'victory') return [[62, 66, 69, 74], [59, 62, 66, 71], [57, 61, 64, 69], [62, 66, 69, 76]];
    if (this.mood === 'defeat') return [[50, 53, 56, 59], [49, 52, 55, 58]];
    return [[50, 57, 60, 65], [46, 53, 57, 62], [43, 50, 53, 58], [45, 50, 52, 55]]; // Dm9, Bbmaj7, Gm7, Asus
  }

  scheduleChord() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const set = this.chordSet();
    const chord = set[this.chordIdx++ % set.length];
    const len = this.mood === 'victory' ? 6 : 9.6;
    for (const v of this.padVoices) { try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0.0001, t, 1.4); v.stop(t + 6); } catch { /* ignore */ } }
    this.padVoices = [];
    const brightness = 600 + this.intensity * 220 + (this.mood === 'victory' ? 900 : 0);
    chord.forEach((n, i) => {
      const g = c.createGain(); g.gain.value = 0.0001;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = brightness - i * 60; f.Q.value = 0.5;
      const oscs = [-6, 6].map(det => { const o = c.createOscillator(); o.type = i === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det + (Math.random() - 0.5) * 4; o.connect(f); o.start(t); return o; });
      f.connect(g).connect(this.musicBus);
      const peak = (i === 0 ? 0.05 : 0.026) * (this.mood === 'title' ? 0.85 : 1);
      g.gain.setTargetAtTime(peak, t, 1.8);
      this.padVoices.push({ g, stop: (at) => oscs.forEach(o => o.stop(at)) });
    });
    clearTimeout(this.tChord);
    this.tChord = setTimeout(() => this.scheduleChord(), len * 1000);
  }

  scheduleBells() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const n = D_MINOR_BELLS[Math.floor(Math.random() * D_MINOR_BELLS.length)];
    const gain = this.mood === 'victory' ? 0.05 : 0.032;
    this.bell(NOTE(n), t, gain, 4.2, this.musicBus);
    if (Math.random() < 0.35) this.bell(NOTE(n + (Math.random() < 0.5 ? 7 : 5)), t + 0.42, gain * 0.6, 3.6, this.musicBus);
    const wait = this.mood === 'victory' ? 1600 + Math.random() * 1600 : 6500 + Math.random() * 8000 - this.intensity * 900;
    clearTimeout(this.tBells);
    this.tBells = setTimeout(() => this.scheduleBells(), wait);
  }

  schedulePulse() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.05;
    const active = this.mood === 'ruins' || this.intensity >= 2 || this.heartbeat;
    let wait = 1400;
    if (this.heartbeat) {
      this.osc('sine', 62, t, 0.22, 0.32, { attack: 0.01, glideTo: 38, dest: this.musicBus });
      this.osc('sine', 58, t + 0.24, 0.26, 0.24, { attack: 0.01, glideTo: 36, dest: this.musicBus });
      wait = 1050;
    } else if (active) {
      const accent = (this.pulseN = (this.pulseN || 0) + 1) % 4 === 1;
      this.osc('sine', accent ? 92 : 80, t, 0.5, accent ? 0.26 : 0.14, { attack: 0.004, glideTo: 40, glideTime: 0.4, dest: this.musicBus });
      this.noise(t, 0.08, accent ? 0.05 : 0.025, { type: 'lowpass', freq: 900, dest: this.musicBus });
      wait = this.mood === 'ruins' ? 820 : 1250;
    }
    clearTimeout(this.tPulse);
    this.tPulse = setTimeout(() => this.schedulePulse(), wait);
  }

  setMood(mood, intensity = this.intensity) {
    const changed = mood !== this.mood;
    this.mood = mood;
    this.intensity = intensity;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter?.frequency.setTargetAtTime(240 + intensity * 70 + (mood === 'ruins' ? 60 : 0), t, 1.5);
    this.droneGain?.gain.setTargetAtTime(mood === 'victory' ? 0.06 : mood === 'defeat' ? 0.22 : 0.15 + intensity * 0.018, t, 2);
    this.windGain?.gain.setTargetAtTime(0.014 + intensity * 0.006, t, 2);
    if (changed && (mood === 'victory' || mood === 'defeat' || mood === 'title')) { this.chordIdx = 0; this.scheduleChord(); }
  }
  setHeartbeat(on) { this.heartbeat = !!on; }

  // ───────── SFX ─────────
  play(name, opt = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    const fn = SFX[name];
    if (fn) { try { fn(this, t, opt); } catch (e) { /* audio is best-effort */ } }
  }
}

const SFX = {
  tap(a, t) { a.osc('triangle', 820, t, 0.06, 0.035, { glideTo: 560 }); },
  select(a, t) { a.osc('sine', 660, t, 0.12, 0.05); a.osc('sine', 990, t + 0.05, 0.16, 0.04); },
  back(a, t) { a.osc('sine', 520, t, 0.12, 0.045, { glideTo: 340 }); },
  error(a, t) { a.osc('square', 170, t, 0.09, 0.03, { filter: { freq: 900 } }); a.osc('square', 150, t + 0.11, 0.12, 0.03, { filter: { freq: 900 } }); },
  step(a, t) {
    a.noise(t, 0.07, 0.07, { freq: 900 + Math.random() * 600, q: 1.4 });
    a.osc('sine', 120, t, 0.06, 0.06, { glideTo: 70 });
  },
  walk(a, t, o) { const n = Math.min(4, o.n || 2); for (let i = 0; i < n; i++) SFX.step(a, t + i * 0.17); },
  reveal(a, t) {
    a.noise(t, 0.5, 0.05, { freq: 420, freqTo: 2600, q: 0.8, attack: 0.12 });
    a.bell(NOTE(81), t + 0.18, 0.03, 1.6);
    SFX.step(a, t + 0.32);
  },
  thud(a, t) {
    a.osc('sine', 78, t, 0.45, 0.42, { attack: 0.003, glideTo: 34 });
    a.noise(t, 0.6, 0.12, { type: 'lowpass', freq: 380, q: 0.5 });
    a.noise(t + 0.05, 0.9, 0.03, { type: 'bandpass', freq: 2400, q: 0.6, attack: 0.05 });
  },
  encounter(a, t) {
    a.osc('sine', NOTE(62), t, 1.3, 0.07, { attack: 0.35 });
    a.osc('sine', NOTE(68), t, 1.3, 0.06, { attack: 0.4 });
    a.noise(t, 1.3, 0.05, { freq: 3200, q: 3, attack: 0.3 });
    a.osc('sine', 55, t + 0.1, 0.9, 0.18, { attack: 0.2 });
  },
  attackDeclare(a, t) {
    a.noise(t, 1.25, 0.08, { freq: 300, freqTo: 3800, q: 1.2, attack: 1.0 });
    a.osc('sawtooth', 55, t, 1.3, 0.06, { attack: 0.6, filter: { freq: 500 } });
  },
  hit(a, t) {
    a.osc('sine', 64, t, 0.7, 0.55, { attack: 0.002, glideTo: 30 });
    a.noise(t, 0.35, 0.22, { type: 'lowpass', freq: 2200, q: 0.4 });
    [523, 1271, 2102].forEach((f, i) => a.osc('sine', f, t + 0.01, 0.9 - i * 0.2, 0.05 / (i + 1)));
  },
  block(a, t) {
    [880, 1320, 2660, 3990].forEach((f, i) => a.osc('triangle', f, t, 1.1 - i * 0.18, 0.06 / (i + 1)));
    a.noise(t, 0.25, 0.08, { freq: 4500, q: 0.8 });
    a.osc('sine', 180, t, 0.2, 0.12, { glideTo: 90 });
  },
  superhit(a, t) {
    a.noise(t - 0.0, 0.6, 0.06, { freq: 600, freqTo: 5000, attack: 0.55 });
    SFX.hit(a, t + 0.55);
    a.osc('sine', 40, t + 0.55, 1.4, 0.5, { attack: 0.004, glideTo: 24 });
  },
  phase(a, t) {
    a.noise(t, 1.4, 0.05, { freq: 200, freqTo: 2400, attack: 1.2 });
    [[1, 0.36], [2.08, 0.16], [3.33, 0.09], [4.74, 0.05]].forEach(([m, v]) => a.osc('sine', 55 * m, t + 1.3, 5, v, { attack: 0.004 }));
    a.osc('sine', 27.5, t + 1.3, 3.5, 0.3, { attack: 0.01 });
  },
  tick(a, t, o) {
    const n = Math.min(6, o.n || 1);
    for (let i = 0; i < n; i++) { a.osc('sine', 1250 - i * 40, t + i * 0.09, 0.05, 0.05); a.osc('sine', 620, t + i * 0.09, 0.07, 0.03); }
  },
  yourTurn(a, t) {
    a.osc('sawtooth', NOTE(62), t, 1.1, 0.045, { attack: 0.18, filter: { freq: 1400 } });
    a.osc('sawtooth', NOTE(69), t + 0.08, 1.1, 0.035, { attack: 0.2, filter: { freq: 1400 } });
    a.bell(NOTE(86), t + 0.1, 0.025, 1.8);
  },
  turn(a, t) { a.bell(NOTE(74), t, 0.03, 2.2); },
  round(a, t) { a.bell(NOTE(62), t, 0.04, 3); a.bell(NOTE(69), t + 0.25, 0.03, 3); },
  ability(a, t) {
    [74, 77, 81, 86, 89].forEach((n, i) => a.osc('sine', NOTE(n), t + i * 0.07, 1.2, 0.04, { attack: 0.01 }));
    a.noise(t, 0.9, 0.03, { freq: 6000, q: 1.5, attack: 0.2 });
  },
  chat(a, t) { a.osc('sine', 1400, t, 0.07, 0.04, { glideTo: 900 }); },
  ping(a, t) { a.osc('sine', 1760, t, 0.08, 0.04); a.osc('sine', 2350, t + 0.09, 0.1, 0.035); },
  rumble(a, t) { a.noise(t, 1.1, 0.07, { type: 'lowpass', freq: 260, q: 0.6, attack: 0.35 }); a.osc('sine', 46, t, 1.0, 0.1, { attack: 0.3 }); },
  stoneMove(a, t) { a.noise(t, 0.5, 0.08, { type: 'lowpass', freq: 520, q: 0.7, attack: 0.06 }); a.osc('sawtooth', 70, t, 0.45, 0.04, { filter: { freq: 300 }, attack: 0.05 }); },
  flip(a, t) { a.noise(t, 0.16, 0.08, { freq: 2500, freqTo: 6000, q: 0.6 }); },
  lock(a, t) { [1600, 2400, 1900].forEach((f, i) => a.osc('square', f, t + i * 0.06, 0.05, 0.015, { filter: { freq: 3000 } })); a.osc('sine', 220, t, 0.2, 0.08, { glideTo: 140 }); },
  drumroll(a, t) {
    for (let i = 0; i < 14; i++) { const tt = t + 2.2 * (1 - Math.pow(1 - i / 14, 1.7)); a.osc('sine', 88, tt, 0.25, 0.08 + i * 0.012, { glideTo: 44 }); a.noise(tt, 0.05, 0.02, { type: 'lowpass', freq: 1200 }); }
  },
  success(a, t) {
    [62, 66, 69, 74, 78].forEach((n, i) => a.osc('triangle', NOTE(n), t + i * 0.06, 3.5, 0.05, { attack: 0.05 }));
    [86, 90, 93].forEach((n, i) => a.bell(NOTE(n), t + 0.4 + i * 0.18, 0.04, 3));
    a.noise(t, 1.5, 0.03, { freq: 7000, q: 1, attack: 0.4 });
  },
  fail(a, t) {
    [50, 49, 46].forEach((n, i) => a.osc('sawtooth', NOTE(n), t + i * 0.5, 2.6, 0.06, { attack: 0.2, filter: { freq: 700 }, glideTo: NOTE(n - 2) }));
    a.osc('sine', 36, t, 3, 0.35, { attack: 0.1 });
    a.noise(t, 2.5, 0.06, { type: 'lowpass', freq: 500, attack: 0.3 });
  },
  join(a, t) { a.bell(NOTE(79), t, 0.03, 1.6); a.bell(NOTE(84), t + 0.12, 0.025, 1.6); },
  whoosh(a, t) { a.noise(t, 0.55, 0.06, { freq: 300, freqTo: 3000, q: 0.7, attack: 0.25 }); },
};

export const audio = new AudioEngine();
