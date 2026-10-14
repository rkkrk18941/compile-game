// ---------------------------------------------------------------------------
// Zone music. Every wall colour has its own score and the score crossfades as
// you cross a zone border, on every floor:
//   normal (per place) → blue (lost, music-box) → red (pursuit) → black (terror)
// Everything is synthesised live with Web Audio and scheduled a little ahead,
// so it costs no downloads. Deeper floors play lower, darker and more detuned.
// ---------------------------------------------------------------------------

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// per-place moods for the normal zone
const MUSIC_STYLES = {
  title: { root: 57, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [2, 5, 9, 12]], bpm: 54, bell: 0.3, cut: 1300, detune: 10, wobble: 1.2 },
  yellow: { root: 57, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 11, 14, 17]], bpm: 58, bell: 0.32, cut: 1500, detune: 13, wobble: 1.3, muzak: !0 },
  office: { root: 55, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [2, 5, 9, 12]], bpm: 56, bell: 0.22, cut: 1200, detune: 9, wobble: 1 },
  hospital: { root: 52, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 5], [-5, -1, 2, 5]], bpm: 50, bell: 0.3, cut: 1000, detune: 7, wobble: 0.8, piano: !0 },
  pool: { root: 60, prog: [[0, 4, 7, 14], [2, 6, 9, 13], [0, 4, 11, 14], [-1, 2, 6, 9]], bpm: 52, bell: 0.55, cut: 1800, detune: 6, wobble: 0.7, drip: !0 },
  parking: { root: 40, drone: [0, 7, 13], bpm: 44, bell: 0.12, cut: 700, detune: 18, wobble: 0.5, metal: !0 },
  pipes: { root: 38, drone: [0, 1, 7], bpm: 44, bell: 0.1, cut: 600, detune: 20, wobble: 0.4, metal: !0 },
  abyss: { root: 36, drone: [0, 6, 12, 13], bpm: 40, bell: 0.14, cut: 550, detune: 22, wobble: 0.4, metal: !0 },
  station: { root: 62, prog: [[0, 3, 7, 10], [-2, 2, 5, 9], [-4, 0, 3, 7], [-5, -1, 2, 7]], bpm: 60, bell: 0.16, cut: 1300, detune: 11, wobble: 1, chime: [12, 16, 19, 24, 19, 16, 21, 19] },
  mall: { root: 60, prog: [[0, 4, 7, 11], [2, 5, 9, 12], [-3, 0, 4, 7], [-5, -1, 2, 5]], bpm: 62, bell: 0.14, cut: 1500, detune: 15, wobble: 1.6, muzak: !0 },
  school: { root: 60, prog: [[0, 4, 7, 12], [-3, 0, 4, 9], [-7, -3, 0, 5], [-5, -1, 2, 7]], bpm: 56, bell: 0.2, cut: 1200, detune: 12, wobble: 1.1, westminster: !0 },
  hotel: { root: 50, prog: [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 10], [2, 5, 9, 12], [-5, -1, 2, 5, 9]], bpm: 50, bell: 0.26, cut: 1100, detune: 14, wobble: 1.5, piano: !0 },
  subway: { root: 45, drone: [0, 7, 10], bpm: 48, bell: 0.14, cut: 800, detune: 16, wobble: 0.6, metal: !0, chime: [7, 12, 10, 7] },
  arcade: { root: 64, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]], bpm: 70, bell: 0.36, cut: 2200, detune: 20, wobble: 1.8, chip: !0 },
};

class ZoneMusic {
  constructor(audio) {
    const ctx = audio.ctx;
    this.audio = audio;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.master);
    this.mix = ctx.createGain();
    // tape wow/flutter on everything: the found-footage warble
    this.wow = ctx.createDelay(0.1);
    this.wow.delayTime.value = 0.018;
    const lfo = ctx.createOscillator(),
      lg = ctx.createGain(),
      lfo2 = ctx.createOscillator(),
      lg2 = ctx.createGain();
    lfo.frequency.value = 0.31;
    lg.gain.value = 0.0035;
    lfo2.frequency.value = 5.7;
    lg2.gain.value = 0.00025;
    lfo.connect(lg).connect(this.wow.delayTime);
    lfo2.connect(lg2).connect(this.wow.delayTime);
    lfo.start();
    lfo2.start();
    this.wowDepth = lg;
    this.mix.connect(this.wow);
    this.wow.connect(this.out);
    this.verb = ctx.createConvolver();
    this.verb.buffer = audio.makeIR(4.2, 1.7);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.wow.connect(this.verb);
    this.verb.connect(this.wet).connect(this.out);
    // a soft-clip stage for the harsh layers
    this.dirt = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3.5) / Math.tanh(3.5);
    }
    this.dirt.curve = curve;
    this.dirt.connect(this.mix);
    // white noise source buffer shared by every noise voice
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
      d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.tracks = {};
    this.zone = -1;
    this.style = "title";
    this.depth = 1;
    this.vol = 0.7;
    this.intensity = 0;
  }
  setVolume(v) {
    this.vol = v;
    this.out.gain.setTargetAtTime(this.enabled ? v * 0.55 : 0, this.ctx.currentTime, 0.4);
  }
  enable(on) {
    this.enabled = on;
    this.setVolume(this.vol);
  }
  // zone: 0 normal, 1 red, 2 blue, 3 black
  set(zone, style, depth) {
    const key = zone === 0 ? "n:" + style + ":" + depth : ["", "red", "blue", "black"][zone] + ":" + depth;
    if (key === this.key) return;
    this.key = key;
    this.zone = zone;
    this.style = style;
    this.depth = depth;
    const now = this.ctx.currentTime;
    for (const k in this.tracks) {
      const t = this.tracks[k];
      if (k !== key) t.fadeOut(now);
    }
    let t = this.tracks[key];
    if (!t) {
      const Ctor = zone === 0 ? NormalTrack : zone === 2 ? BlueTrack : zone === 1 ? RedTrack : BlackTrack;
      t = this.tracks[key] = new Ctor(this, MUSIC_STYLES[style] || MUSIC_STYLES.yellow, depth);
    }
    t.fadeIn(now, zone === 3 ? 1.2 : 2.6);
    // deeper and darker: more wow, more reverb
    this.wowDepth.gain.setTargetAtTime(0.0035 * (zone === 0 ? (MUSIC_STYLES[style] || {}).wobble || 1 : 1.4) * (1 + (depth - 1) * 0.15), now, 1);
    this.wet.gain.setTargetAtTime(zone === 3 ? 0.75 : zone === 2 ? 0.7 : 0.55, now, 1);
  }
  update(dt, info) {
    const now = this.ctx.currentTime;
    this.intensity += ((info.fear || 0) - this.intensity) * Math.min(1, dt * 1.5);
    for (const k in this.tracks) {
      const t = this.tracks[k];
      if (t.dead) {
        delete this.tracks[k];
        continue;
      }
      t.tick(now, info);
    }
  }
  stopAll() {
    const now = this.ctx.currentTime;
    for (const k in this.tracks) this.tracks[k].fadeOut(now, 0.3);
    this.key = null;
  }

  // ---- voices -------------------------------------------------------------
  env(g, t, peak, a, hold, r) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }
  pad(dest, freqs, t, dur, vol, o = {}) {
    const ctx = this.ctx,
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    f.type = "lowpass";
    f.frequency.setValueAtTime(o.cut || 1200, t);
    o.sweep && f.frequency.linearRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q || 0.6;
    f.connect(g).connect(dest);
    this.env(g, t, vol, o.a ?? 2, Math.max(0, dur - (o.a ?? 2)), o.r ?? 3);
    const stop = t + dur + (o.r ?? 3) + 0.1;
    for (const fr of freqs)
      for (const dt of o.detunes || [-1, 1]) {
        const osc = ctx.createOscillator();
        osc.type = o.wave || "sawtooth";
        osc.frequency.value = fr;
        osc.detune.value = dt * (o.detune || 8) + rnd(-3, 3);
        osc.connect(f);
        osc.start(t);
        osc.stop(stop);
      }
    return g;
  }
  bell(dest, freq, t, vol, o = {}) {
    const ctx = this.ctx,
      car = ctx.createOscillator(),
      mod = ctx.createOscillator(),
      mg = ctx.createGain(),
      g = ctx.createGain(),
      dec = o.decay || 2.4;
    car.frequency.value = freq;
    car.detune.value = o.detune || 0;
    mod.frequency.value = freq * (o.ratio || 3.5);
    mg.gain.setValueAtTime(freq * (o.index || 2.2), t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dec * 0.6);
    mod.connect(mg).connect(car.frequency);
    car.connect(g).connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + (o.a || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    car.start(t);
    mod.start(t);
    car.stop(t + dec + 0.05);
    mod.stop(t + dec + 0.05);
  }
  piano(dest, freq, t, vol, o = {}) {
    // two slightly detuned FM partials and a short hammer click
    this.bell(dest, freq, t, vol, { ratio: 1.0, index: 1.6, decay: o.decay || 3.2, detune: rnd(-6, 6) });
    this.bell(dest, freq * 2, t, vol * 0.3, { ratio: 2.0, index: 0.8, decay: (o.decay || 3.2) * 0.6, detune: rnd(-8, 8) });
  }
  noiseHit(dest, t, dur, vol, o = {}) {
    const ctx = this.ctx,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = this.noise;
    f.type = o.type || "bandpass";
    f.frequency.setValueAtTime(o.f0 || 800, t);
    f.frequency.exponentialRampToValueAtTime(o.f1 || o.f0 || 800, t + dur);
    f.Q.value = o.q || 1;
    src.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    if (o.swell) {
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.92);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.exponentialRampToValueAtTime(vol, t + (o.a || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  kick(dest, t, vol, o = {}) {
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      g = ctx.createGain();
    osc.frequency.setValueAtTime(o.f0 || 95, t);
    osc.frequency.exponentialRampToValueAtTime(o.f1 || 38, t + 0.22);
    osc.connect(g).connect(dest);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.45));
    osc.start(t);
    osc.stop(t + (o.dur || 0.45) + 0.05);
  }
  metal(dest, t, vol, base = 180) {
    // inharmonic partials: a struck pipe / girder far away
    for (const r of [1, 2.76, 5.4, 8.93]) this.bell(dest, base * r * rnd(0.98, 1.02), t, vol / (r * 0.9), { ratio: 1.41, index: 3, decay: 2.8 / Math.sqrt(r) });
  }
  pluck(dest, freq, t, vol, o = {}) {
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    osc.type = o.wave || "sawtooth";
    osc.frequency.value = freq;
    f.type = "lowpass";
    f.Q.value = o.q || 6;
    f.frequency.setValueAtTime(o.f0 || 1600, t);
    f.frequency.exponentialRampToValueAtTime(o.f1 || 120, t + (o.dur || 0.22));
    osc.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.22) + 0.05);
    osc.start(t);
    osc.stop(t + (o.dur || 0.22) + 0.1);
  }
  shriek(dest, t, dur, vol) {
    const ctx = this.ctx,
      car = ctx.createOscillator(),
      mod = ctx.createOscillator(),
      mg = ctx.createGain(),
      g = ctx.createGain(),
      f0 = rnd(700, 1500);
    car.type = "sawtooth";
    car.frequency.setValueAtTime(f0, t);
    car.frequency.exponentialRampToValueAtTime(f0 * rnd(0.35, 0.6), t + dur);
    mod.frequency.setValueAtTime(rnd(30, 90), t);
    mod.frequency.linearRampToValueAtTime(rnd(120, 300), t + dur);
    mg.gain.value = f0 * 0.6;
    mod.connect(mg).connect(car.frequency);
    car.connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }
  voices(dest, freq, t, dur, vol) {
    // a moaning choir: saws through two vowel formants
    const ctx = this.ctx,
      g = ctx.createGain(),
      vowels = [[730, 1090], [570, 840], [300, 870], [440, 1020]],
      v = pick(vowels);
    g.connect(dest);
    this.env(g, t, vol, dur * 0.4, dur * 0.2, dur * 0.6);
    for (const fm of v) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = fm;
      bp.Q.value = 9;
      bp.connect(g);
      for (const k of [-1, 0, 1]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq * Math.pow(2, k * 0.0045), t);
        o.frequency.linearRampToValueAtTime(freq * 0.94, t + dur * 1.3);
        o.connect(bp);
        o.start(t);
        o.stop(t + dur * 1.3);
      }
    }
  }
}

// ---- tracks ----------------------------------------------------------------
class MusicTrack {
  constructor(m, style, depth) {
    this.m = m;
    this.style = style;
    this.depth = depth;
    this.g = m.ctx.createGain();
    this.g.gain.value = 0;
    this.g.connect(m.mix);
    this.next = 0;
    this.step = 0;
    this.on = !1;
    this.silentSince = 0;
    this.tr = -(depth - 1); // a semitone lower per floor
    this.dark = Math.min(1, (depth - 1) / 4);
    this.held = [];
  }
  fadeIn(now, tau = 2.4) {
    this.on = !0;
    this.next = Math.max(this.next, now + 0.08);
    this.g.gain.cancelScheduledValues(now);
    this.g.gain.setTargetAtTime(this.level || 1, now, tau / 3);
    this.startHeld && !this.held.length && this.startHeld(now);
  }
  fadeOut(now, tau = 2.2) {
    if (!this.on) return;
    this.on = !1;
    this.offAt = now;
    this.g.gain.cancelScheduledValues(now);
    this.g.gain.setTargetAtTime(0, now, tau / 3);
  }
  tick(now, info) {
    if (!this.on && now - this.offAt > 6) {
      for (const h of this.held) try { h.stop(); } catch {}
      this.held = [];
      this.g.disconnect();
      this.dead = !0;
      return;
    }
    this.react && this.react(now, info);
    let n = 0;
    while (this.next < now + 0.35 && n++ < 16) {
      if (this.on) this.beat(this.next, this.step);
      this.step++;
      this.next += 60 / this.bpm;
    }
  }
  hold(node) {
    this.held.push(node);
    return node;
  }
  drone(freq, vol, o = {}) {
    // a sustained voice that lives as long as the track
    const ctx = this.m.ctx,
      g = ctx.createGain(),
      f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.cut || 400;
    f.Q.value = o.q || 0.7;
    g.gain.value = vol;
    f.connect(g).connect(o.dest || this.g);
    for (const d of o.detunes || [-6, 6]) {
      const osc = this.hold(ctx.createOscillator());
      osc.type = o.wave || "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = d;
      osc.connect(f);
      osc.start();
    }
    if (o.lfo) {
      const l = this.hold(ctx.createOscillator()),
        lg = ctx.createGain();
      l.frequency.value = o.lfo;
      lg.gain.value = (o.cut || 400) * 0.6;
      l.connect(lg).connect(f.frequency);
      l.start();
    }
    return g;
  }
}

// normal zone: per-place nostalgia gone wrong
class NormalTrack extends MusicTrack {
  constructor(m, s, depth) {
    super(m, s, depth);
    this.bpm = s.bpm * (1 - this.dark * 0.12);
    this.level = 0.9;
    this.chord = 0;
  }
  startHeld(now) {
    const s = this.style,
      root = s.root + this.tr - 12;
    this.drone(mtof(root), 0.05, { wave: "sine", cut: 300, detunes: [-4, 4] });
    if (s.drone) for (const iv of s.drone) this.drone(mtof(s.root + this.tr + iv), 0.035 + this.dark * 0.02, { cut: s.cut * 0.6, lfo: 0.05 + Math.random() * 0.05, detunes: [-s.detune, s.detune] });
    if (s.muzak && this.m.audio.bufs.muzak) {
      const src = this.hold(this.m.ctx.createBufferSource()),
        f = this.m.ctx.createBiquadFilter(),
        g = this.m.ctx.createGain();
      src.buffer = this.m.audio.bufs.muzak;
      src.loop = !0;
      src.playbackRate.value = 0.93 - this.dark * 0.1;
      f.type = "lowpass";
      f.frequency.value = 1700 - this.dark * 700;
      g.gain.value = 0.32;
      src.connect(f).connect(g).connect(this.g);
      src.start();
    }
  }
  beat(t, step) {
    const s = this.style,
      m = this.m,
      root = s.root + this.tr,
      bar = Math.floor(step / 8),
      inBar = step % 8,
      det = s.detune + this.dark * 14;
    if (s.prog) {
      const ch = s.prog[bar % s.prog.length];
      if (inBar === 0) {
        m.pad(this.g, ch.map((iv) => mtof(root + iv - 12)), t, (60 / this.bpm) * 8, 0.035, { cut: s.cut * (1 - this.dark * 0.4), detune: det, a: 2.2, r: 3.5, wave: s.piano ? "triangle" : "sawtooth" });
        this.chord = ch;
      }
      // sparse melody from chord tones, an octave up, sometimes bent flat
      if (Math.random() < s.bell * (inBar % 2 ? 0.5 : 1)) {
        const iv = pick(this.chord) + 12 + (Math.random() < 0.2 ? 12 : 0),
          f = mtof(root + iv),
          detune = Math.random() < 0.15 + this.dark * 0.3 ? -rnd(20, 60) : rnd(-det, det) * 0.4;
        s.piano ? m.piano(this.g, f * Math.pow(2, detune / 1200), t, 0.05) : m.bell(this.g, f, t, 0.045, { detune, decay: 2.8 });
      }
    } else if (s.drone && inBar === 0 && Math.random() < 0.5) {
      m.pad(this.g, [mtof(root + pick([0, 7, 12]) - 12)], t, 6, 0.03, { cut: s.cut, detune: det, a: 3, r: 4 });
    }
    if (s.bell && s.drone && Math.random() < s.bell) m.bell(this.g, mtof(root + 24 + pick([0, 1, 6, 7, 13])), t, 0.03, { detune: rnd(-40, 40), decay: 3.5 });
    if (s.metal && Math.random() < 0.05) m.metal(this.g, t, 0.025, rnd(90, 220));
    if (s.drip && Math.random() < 0.12) m.bell(this.g, mtof(root + 36 + pick([0, 2, 4, 7, 9])), t, 0.03, { ratio: 1, index: 0.3, decay: 0.6 });
    if (s.chime && step % 64 === 16) s.chime.forEach((iv, k) => m.bell(this.g, mtof(root + iv), t + k * 0.32, 0.05, { ratio: 2, index: 1.2, decay: 1.4, detune: k > 4 ? -rnd(10, 40) * (1 + this.dark) : 0 }));
    if (s.westminster && step % 96 === 32) {
      // the school chime, a little out of tune and a little too slow
      [[4, 0, 2, -5], [-5, 2, 4, 0]].flat().forEach((iv, k) => m.bell(this.g, mtof(root + 12 + iv), t + k * 0.62 + (k > 3 ? 0.6 : 0), 0.06, { ratio: 3.01, index: 1.4, decay: 2.2, detune: -k * 4 * (1 + this.dark * 2) }));
    }
    if (s.chip && Math.random() < 0.3) m.pluck(this.g, mtof(root + 12 + pick(this.chord || [0, 4, 7])), t, 0.03, { wave: "square", f0: 3000, f1: 800, dur: 0.12, q: 1 });
  }
}

// blue: lost in the maze — a broken music box over a cold cluster
class BlueTrack extends MusicTrack {
  constructor(m, s, depth) {
    super(m, s, depth);
    this.bpm = 54;
    this.level = 0.95;
    this.root = 57 + this.tr;
    this.tune = [0, 3, 7, 8, 7, 3, 2, 3, -1, 0];
  }
  startHeld() {
    const r = this.root - 12;
    for (const iv of [0, 1, 6]) this.drone(mtof(r + iv), 0.03, { cut: 520, lfo: 0.07 + Math.random() * 0.08, detunes: [-14, 9] });
    this.drone(mtof(r - 12), 0.06, { wave: "sine", cut: 200, detunes: [0, 3] });
  }
  beat(t, step) {
    const m = this.m,
      r = this.root;
    // music box: plays the tune, then forgets notes and drifts
    if (step % 2 === 0) {
      const k = (step / 2) % this.tune.length,
        drop = Math.random() < 0.18 + this.dark * 0.2;
      drop || m.bell(this.g, mtof(r + 24 + this.tune[k]), t + rnd(0, 0.06), 0.05, { ratio: 5.19, index: 1.1, decay: 1.8, detune: -(step % 40) * (1 + this.dark) - rnd(0, 25) });
    }
    if (step % 16 === 0) m.pad(this.g, [mtof(r - 12), mtof(r - 11), mtof(r - 5)], t, 8, 0.03, { cut: 700, sweep: 300, detune: 18, a: 3, r: 4 });
    if (step % 24 === 12) m.noiseHit(this.g, t, rnd(2.5, 4), 0.05, { swell: !0, type: "bandpass", f0: 300, f1: 3500, q: 2 });
    if (Math.random() < 0.06) this.m.audio.bufs.whisper && this.whisper(t);
    if (step % 4 === 0 && Math.random() < 0.4) m.kick(this.g, t, 0.08, { f0: 60, f1: 34, dur: 0.6 });
  }
  whisper(t) {
    const ctx = this.m.ctx,
      src = ctx.createBufferSource(),
      g = ctx.createGain(),
      p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.buffer = pick(this.m.audio.bufs.whisper);
    src.playbackRate.value = rnd(0.7, 0.95);
    g.gain.value = 0.12;
    src.connect(g);
    p ? ((p.pan.value = rnd(-0.9, 0.9)), g.connect(p).connect(this.g)) : g.connect(this.g);
    src.start(t);
  }
}

// red: something is coming — pulsing ostinato, heartbeat kick, tremolo strings
class RedTrack extends MusicTrack {
  constructor(m, s, depth) {
    super(m, s, depth);
    this.bpm = 104 + depth * 3;
    this.level = 0.9;
    this.root = 40 + this.tr;
    this.ost = [0, 0, 1, 0, 0, 0, 1, -1, 0, 0, 1, 0, 3, 1, 0, -1];
  }
  startHeld() {
    const ctx = this.m.ctx,
      r = this.root;
    // tremolo strings: tritone, amplitude chopped at 11 Hz
    const trem = ctx.createGain(),
      lfo = this.hold(ctx.createOscillator()),
      lg = ctx.createGain();
    trem.gain.value = 0.5;
    lfo.frequency.value = 11;
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(trem.gain);
    lfo.start();
    trem.connect(this.g);
    for (const iv of [24, 30, 25]) this.drone(mtof(r + iv), 0.022, { cut: 2200, q: 1.2, dest: trem, detunes: [-9, 0, 11] });
    this.drone(mtof(r - 12), 0.07, { wave: "sine", cut: 160, detunes: [-3, 3] });
  }
  beat(t, step) {
    const m = this.m,
      r = this.root,
      half = 30 / this.bpm;
    for (const k of [0, 1]) {
      const iv = this.ost[(step * 2 + k) % this.ost.length];
      m.pluck(this.g, mtof(r + iv), t + k * half, 0.07, { f0: 900 + this.dark * 600, f1: 90, dur: 0.18 });
    }
    if (step % 4 === 0 || step % 4 === 1) m.kick(this.g, t + (step % 4 === 1 ? half * 0.6 : 0), 0.22, { f0: 80, f1: 36 });
    if (step % 16 === 15) m.pad(this.g, [mtof(r + 12), mtof(r + 13), mtof(r + 18)], t, 1.4, 0.06, { cut: 2600, sweep: 500, detune: 20, a: 0.05, r: 1.2, wave: "square" });
    if (Math.random() < 0.06) m.noiseHit(this.g, t, rnd(1, 2.2), 0.06, { type: "bandpass", f0: rnd(2000, 4000), f1: rnd(500, 900), q: 18 });
    if (step % 32 === 31) m.noiseHit(this.g, t, 1.8, 0.09, { swell: !0, type: "highpass", f0: 400, f1: 6000, q: 0.7 });
    if (Math.random() < 0.03) m.metal(this.g, t, 0.05, rnd(110, 260));
  }
  react(now, info) {
    // the closer the monsters, the louder the pulse
    const lv = 0.75 + Math.min(0.5, info.fear * 0.5);
    if (Math.abs(lv - (this.level || 0)) > 0.05 && this.on) (this.level = lv), this.g.gain.setTargetAtTime(lv, now, 0.6);
  }
}

// black: terror — sub rumble, choirs sliding down, shrieks, iron hits, dropouts
class BlackTrack extends MusicTrack {
  constructor(m, s, depth) {
    super(m, s, depth);
    this.bpm = 72;
    this.level = 0.8;
    this.root = 33 + this.tr;
  }
  startHeld() {
    const ctx = this.m.ctx;
    // two sines a hair apart: the room itself throbbing
    for (const f of [mtof(this.root), mtof(this.root) + 0.9]) {
      const o = this.hold(ctx.createOscillator()),
        g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.09;
      o.connect(g).connect(this.g);
      o.start();
    }
    const src = this.hold(ctx.createBufferSource()),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = this.m.noise;
    src.loop = !0;
    f.type = "lowpass";
    f.frequency.value = 140;
    g.gain.value = 0.2;
    src.connect(f).connect(g).connect(this.g);
    src.start();
    for (const iv of [12, 13, 18]) this.drone(mtof(this.root + iv), 0.03, { cut: 900, lfo: 0.13, detunes: [-25, 0, 30], dest: this.m.dirt });
  }
  beat(t, step) {
    const m = this.m,
      r = this.root;
    if (step % 8 === 0 || Math.random() < 0.08) m.voices(this.g, mtof(r + 36 + pick([0, 1, 6, 7])), t, rnd(3, 6), 0.05);
    if (Math.random() < 0.09) m.shriek(m.dirt, t + rnd(0, 0.4), rnd(0.6, 1.8), 0.05);
    if (Math.random() < 0.16) m.metal(this.g, t, 0.09, rnd(60, 140));
    if (Math.random() < 0.2) m.kick(this.g, t, 0.35, { f0: 70, f1: 28, dur: 0.9 });
    if (step % 12 === 11) m.noiseHit(this.g, t, 2.6, 0.12, { swell: !0, type: "lowpass", f0: 200, f1: 4000, q: 4 });
    if (Math.random() < 0.05 && this.m.audio.bufs.whisper) BlueTrack.prototype.whisper.call(this, t);
    // dropout: everything cuts out for a breath, then slams back
    if (Math.random() < 0.035 && this.on) {
      const g = this.m.mix.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(0.02, t + 0.05);
      g.setValueAtTime(0.02, t + rnd(0.6, 1.4));
      g.linearRampToValueAtTime(1, t + 1.6);
      m.kick(this.g, t + 1.55, 0.5, { f0: 120, f1: 30, dur: 1.2 });
    }
  }
}

// ---- wiring: a game system that follows the zone you stand in
const ZoneMusicSystem = {
  music: null,
  ensure(g) {
    const a = g.audio;
    if (!a || !a.ctx) return null;
    if (!this.music) {
      this.music = new ZoneMusic(a);
      this.music.vol = (g.settings && g.settings.bgm) ?? 0.7;
      this.music.enable(!0);
    }
    return this.music;
  },
  pick(g) {
    if (!g.fs) return;
    const m = this.ensure(g);
    if (!m) return;
    if (g.state === "title" || g.state === "result" || !g.run) return m.set(0, "title", 1);
    const zone = g.inBlack ? 3 : g.zoneNow > 0 ? g.zoneNow : 0;
    m.set(zone, g.fs.themeId, g.fs.depth);
  },
  onFloorEnter() {
    this.game && this.pick(this.game);
  },
  onZoneChange() {
    this.game && this.pick(this.game);
  },
  // called from the main loop in every state (title and menus included)
  tick(dt) {
    const g = this.game;
    if (!g || !g.audio || !g.audio.ctx) return;
    this.t = (this.t || 0) + dt;
    if (this.t > 0.5 || !this.music) (this.t = 0), this.pick(g);
    const m = this.music;
    m && m.update(dt, { fear: g.monsters && g.state === "play" ? Math.min(1, g.monsters.fear) : 0 });
  },
};
// the old muzak loop now lives inside the normal-zone score
{
  const upd = Ed.prototype.update;
  Ed.prototype.update = function (dt, p, info) {
    upd.call(this, dt, p, info);
    this.loopGain("muzak", 0, 0.5);
  };
}
