'use strict';
/* ==== COMPILE : BGM（WebAudio で端末内合成。音声ファイルなし） ====
   7曲＋ジングル。曲は「コード進行・パターン・メロディ」をデータで書き、
   ここのシンセで鳴らす。場面（タイトル／ロビー／大会／ドラフト／対戦／終盤）に
   合わせて自動で切り替え、小節の頭でクロスフェードする。
   スマホのスピーカーでも聞こえるよう、ベースとキックは倍音を足して作っている。 */
(() => {
  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 14],
    madd9: [0, 3, 7, 14], dim: [0, 3, 6], m6: [0, 3, 7, 9], '7sus4': [0, 5, 7, 10], 6: [0, 4, 7, 9], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 9: [0, 4, 7, 10, 14]
  };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function midi(name) {
    const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    return 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  }
  function parseChord(sym) {
    const [main, slash] = String(sym).split('/');
    const m = /^([A-G](?:#|b)?)(.*)$/.exec(main);
    if (!m || !(m[2] in QUAL)) throw new Error('bad chord ' + sym);
    return { sym, root: NOTE[m[1]], ints: QUAL[m[2]], bass: slash ? NOTE[slash] : NOTE[m[1]] };
  }
  /* 和音を中心音のまわりに並べる（毎小節同じ中心なので自然に声部がつながる） */
  function voicing(ch, center = 64, maxVoices = 4) {
    const pcs = [...new Set(ch.ints.map(i => (ch.root + i) % 12))].slice(0, maxVoices);
    return pcs.map(pc => { let n = pc + 12 * Math.floor(center / 12); while (n < center - 6) n += 12; while (n > center + 6) n -= 12; return n; }).sort((a, b) => a - b);
  }
  function bassNote(ch, lo = 33) { let n = ch.bass; while (n < lo) n += 12; while (n >= lo + 12) n -= 12; return n; }
  function chordTone(ch, deg) {
    // '3' '5' '7' を和音の構成音から（なければ自然な代替）
    const ints = ch.ints;
    if (deg === '3') return ints.find(i => i === 3 || i === 4) ?? (ints.includes(5) ? 5 : 4);
    if (deg === '5') return ints.find(i => i === 7 || i === 6) ?? 7;
    if (deg === '7') return ints.find(i => i === 10 || i === 11) ?? 10;
    return 0;
  }
  /* "E5:4 D5:2 -:2" → [{step,len,note}] （16分音符単位） */
  function parseBar(str) {
    const out = []; let step = 0;
    for (const tok of String(str || '').trim().split(/\s+/).filter(Boolean)) {
      const [n, l] = tok.split(':'), len = Number(l) || 1;
      if (n !== '-') out.push({ step, len, note: midi(n) });
      step += len;
    }
    out.total = step;
    return out;
  }

  /* ---------- 共有バッファ ---------- */
  const cache = new WeakMap();
  function res(ctx) {
    let r = cache.get(ctx); if (r) return r;
    const rate = ctx.sampleRate, noise = ctx.createBuffer(1, rate, rate), d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    const pulse = duty => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty); return ctx.createPeriodicWave(re, im); };
    r = { noise, curve, pulse25: pulse(.25), pulse12: pulse(.125) };
    cache.set(ctx, r); return r;
  }
  function impulse(ctx, seconds, decay, pre = .012) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate), p = Math.floor(pre * rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = p; i < len; i++) {
        const t = (i - p) / (len - p), n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.55 - 0.4 * t);                 // 時間とともに高域が減る
        d[i] = lp * Math.pow(1 - t, decay) * (i < p + rate * .06 && Math.random() < .015 ? 3 : 1);
      }
    }
    return buf;
  }

  /* ---------- エンジン（1曲ぶんのミキサーと楽器） ---------- */
  class Engine {
    constructor(ctx, dest, { bpm = 120, delayBeats = .75, reverb = .3, raw = false } = {}) {
      this.ctx = ctx; this.R = res(ctx); this.bpm = bpm;
      const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      const bq = (type, f, Q = .7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = Q; return n; };
      this.g = g; this.bq = bq;
      this.out = g(0); this.out.connect(dest);
      const hp = bq('highpass', 30), low = bq('lowshelf', 120), high = bq('highshelf', 7500);
      low.gain.value = 1.5; high.gain.value = -1.5;
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -16; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = .012; glue.release.value = .22;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .001; lim.release.value = .12;
      this.mix = g(1); this.mix.connect(hp); hp.connect(low); low.connect(high);
      if (raw) high.connect(this.out); else { high.connect(glue); glue.connect(lim); lim.connect(this.out); }
      this.drums = g(1); this.drums.connect(this.mix);
      this.pump = g(1); this.pump.connect(this.mix);         // キックで凹むグループ（ベース・パッド・アルペジオ）
      this.leadBus = g(1); this.leadBus.connect(this.mix);
      // リバーブ
      this.rev = g(1);
      const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, 2.6, 2.4);
      const rhp = bq('highpass', 280), rlp = bq('lowpass', 5200), rOut = g(reverb);
      this.rev.connect(rhp); rhp.connect(conv); conv.connect(rlp); rlp.connect(rOut); rOut.connect(this.mix);
      // ピンポンディレイ
      this.del = g(1);
      const beat = 60 / bpm, dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = g(.36), lp = bq('lowpass', 3000), pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(), dOut = g(.28);
      dl.delayTime.value = beat * delayBeats; dr.delayTime.value = beat * delayBeats;
      pl.pan.value = -.75; pr.pan.value = .75;
      this.del.connect(dl); dl.connect(pl); pl.connect(dOut); dl.connect(lp); lp.connect(dr); dr.connect(pr); pr.connect(dOut); dr.connect(fb); fb.connect(dl);
      dOut.connect(this.mix);
      this.t0 = ctx.currentTime; this.held = []; this.V = {};
    }
    /* 発音の出口：パン＋リバーブ/ディレイ送り */
    voiceOut(dest, { pan = 0, rev = 0, del = 0 } = {}) {
      const ctx = this.ctx, v = ctx.createGain();
      let tail = v;
      if (pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); v.connect(p); tail = p; }
      tail.connect(dest);
      if (rev) { const s = ctx.createGain(); s.gain.value = rev; tail.connect(s); s.connect(this.rev); }
      if (del) { const s = ctx.createGain(); s.gain.value = del; tail.connect(s); s.connect(this.del); }
      return v;
    }
    env(param, t, { a = .005, peak = 1, d = .1, s = .6, r = .1, dur = .2 }) {
      param.setValueAtTime(.0001, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.setTargetAtTime(peak * s, t + a, d / 3);
      const end = t + Math.max(a, dur);
      param.setTargetAtTime(.0001, end, r / 3);
      return end + r * 1.2;
    }
    osc(type, f, t, stop) { const o = this.ctx.createOscillator(); if (type === 'pulse25') o.setPeriodicWave(this.R.pulse25); else if (type === 'pulse12') o.setPeriodicWave(this.R.pulse12); else o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; }
    noise(t, stop) { const s = this.ctx.createBufferSource(); s.buffer = this.R.noise; s.loop = true; s.start(t, Math.random() * .9); s.stop(stop); return s; }
    duck(t, depth = .55, beats = .5) {
      const p = this.pump.gain, len = 60 / this.bpm * beats;
      p.cancelScheduledValues(t); p.setValueAtTime(1, t); p.linearRampToValueAtTime(1 - depth, t + .012); p.linearRampToValueAtTime(1, t + len);
    }

    /* ---- ドラム ---- */
    kick(t, v = 1, { pitch = 1, len = .38, duck = .55 } = {}) {
      const ctx = this.ctx, stop = t + len + .05;
      const o = this.osc('sine', 165 * pitch, t, stop), g = ctx.createGain(), sh = ctx.createWaveShaper(); sh.curve = this.R.curve;
      o.frequency.exponentialRampToValueAtTime(58 * pitch, t + .055); o.frequency.exponentialRampToValueAtTime(44 * pitch, t + len);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.29 * v, t + .003); g.gain.setTargetAtTime(.0001, t + .08, len / 6);
      o.connect(sh); sh.connect(g); g.connect(this.drums);
      // 中域のノック（スマホのスピーカーでも聞こえる）
      const k = this.osc('triangle', 210 * pitch, t, t + .08), kg = ctx.createGain();
      k.frequency.exponentialRampToValueAtTime(90, t + .06);
      kg.gain.setValueAtTime(.26 * v, t); kg.gain.exponentialRampToValueAtTime(.0001, t + .08); k.connect(kg); kg.connect(this.drums);
      const n = this.noise(t, t + .02), nf = this.bq('highpass', 2600), ng = ctx.createGain();
      ng.gain.setValueAtTime(.12 * v, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .012); n.connect(nf); nf.connect(ng); ng.connect(this.drums);
      if (duck) this.duck(t, duck);
    }
    snare(t, v = 1, { tone = 1, rev = .18 } = {}) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { rev });
      const b = this.osc('triangle', 195 * tone, t, t + .2), bg = ctx.createGain();
      b.frequency.exponentialRampToValueAtTime(150 * tone, t + .08);
      bg.gain.setValueAtTime(.62 * v, t); bg.gain.exponentialRampToValueAtTime(.0001, t + .14); b.connect(bg); bg.connect(out);
      const n = this.noise(t, t + .3), hp = this.bq('highpass', 1100), bp = this.bq('bandpass', 4200, .6), ng = ctx.createGain();
      ng.gain.setValueAtTime(.0001, t); ng.gain.linearRampToValueAtTime(.78 * v, t + .002); ng.gain.exponentialRampToValueAtTime(.0001, t + .21);
      n.connect(hp); hp.connect(bp); bp.connect(ng); ng.connect(out);
    }
    clap(t, v = 1, { rev = .25 } = {}) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { rev, pan: .05 });
      const n = this.noise(t, t + .4), bp = this.bq('bandpass', 1500, 1.1), hp = this.bq('highpass', 700), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      for (const [o, a] of [[0, 1.3], [.011, 1.1], [.022, 1.25]]) { g.gain.setValueAtTime(a * v, t + o); g.gain.exponentialRampToValueAtTime(.12 * v, t + o + .009); }
      g.gain.setValueAtTime(.85 * v, t + .033); g.gain.exponentialRampToValueAtTime(.0001, t + .26);
      n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
    }
    hat(t, v = 1, { open = false, pan = .18 } = {}) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { pan });
      const len = open ? .26 : .045, n = this.noise(t, t + len + .05), hp = this.bq('highpass', open ? 6500 : 7800), bp = this.bq('bandpass', 10000, .5), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime((open ? .5 : .6) * v, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + len);
      n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
    }
    shaker(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { pan: -.25 });
      const n = this.noise(t, t + .08), hp = this.bq('highpass', 5200), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.26 * v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + .06);
      n.connect(hp); hp.connect(g); g.connect(out);
    }
    rim(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { pan: -.15, rev: .12 });
      const o = this.osc('square', 1650, t, t + .05), bp = this.bq('bandpass', 1700, 4), g = ctx.createGain();
      g.gain.setValueAtTime(.28 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .035); o.connect(bp); bp.connect(g); g.connect(out);
    }
    ride(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { pan: .3, rev: .1 });
      const n = this.noise(t, t + .6), hp = this.bq('highpass', 5500), bp = this.bq('bandpass', 9000, 1.5), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.12 * v, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
      n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
      const o = this.osc('square', 5200, t, t + .3), og = ctx.createGain(); og.gain.setValueAtTime(.015 * v, t); og.gain.exponentialRampToValueAtTime(.0001, t + .25); o.connect(og); og.connect(out);
    }
    crash(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { rev: .35, pan: -.1 });
      const n = this.noise(t, t + 2.2), hp = this.bq('highpass', 4200), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.3 * v, t + .004); g.gain.setTargetAtTime(.0001, t + .02, .55);
      n.connect(hp); hp.connect(g); g.connect(out);
    }
    tom(t, f, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { rev: .2, pan: (f - 120) / 300 });
      const o = this.osc('sine', f * 1.6, t, t + .45), g = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(f, t + .05);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.75 * v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + .36);
      o.connect(g); g.connect(out);
    }
    timpani(t, f, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.drums, { rev: .4 });
      const o = this.osc('sine', f, t, t + 1.6), o2 = this.osc('sine', f * 1.5, t, t + 1), g = ctx.createGain(), g2 = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(f * .96, t + 1.2);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.8 * v, t + .006); g.gain.setTargetAtTime(.0001, t + .05, .4);
      g2.gain.setValueAtTime(.25 * v, t); g2.gain.setTargetAtTime(.0001, t + .02, .15);
      o.connect(g); o2.connect(g2); g.connect(out); g2.connect(out);
      const n = this.noise(t, t + .2), lp = this.bq('lowpass', 900), ng = ctx.createGain(); ng.gain.setValueAtTime(.3 * v, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .12); n.connect(lp); lp.connect(ng); ng.connect(out);
    }
    /* ---- ベース ---- */
    bass(t, note, dur, v = 1, kind = 'pluck') {
      const ctx = this.ctx, f = mtof(note), stop = t + dur + .3, out = this.voiceOut(this.pump, {});
      const sub = this.osc('sine', f, t, stop), sg = ctx.createGain();
      this.env(sg.gain, t, { a: .004, peak: (kind === 'reese' ? .15 : .14) * v, d: .2, s: .9, r: .05, dur });
      sub.connect(sg); sg.connect(out);
      const lp = this.bq('lowpass', 800, kind === 'funk' ? 3 : 5), g = ctx.createGain();
      if (kind === 'reese') {
        for (const det of [-14, 13]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det; o.connect(lp); }
        lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * .6); lp.frequency.linearRampToValueAtTime(600, t + dur);
        this.env(g.gain, t, { a: .02, peak: .14 * v, d: .3, s: .85, r: .08, dur });
      } else if (kind === 'funk') {
        const o = this.osc('pulse25', f * 1.012, t, stop); o.frequency.exponentialRampToValueAtTime(f, t + .03); o.connect(lp);
        lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(520, t + .12);
        this.env(g.gain, t, { a: .003, peak: .2 * v, d: .12, s: .5, r: .05, dur: Math.min(dur, .3) });
      } else {
        const o = this.osc('sawtooth', f, t, stop), o2 = this.osc('square', f * 2, t, stop), drive = ctx.createWaveShaper(), pre = ctx.createGain(); o2.detune.value = -6;
        drive.curve = this.R.curve; pre.gain.value = .8;
        o.connect(pre); const half = ctx.createGain(); half.gain.value = .6; o2.connect(half); half.connect(pre); pre.connect(drive); drive.connect(lp);
        lp.frequency.setValueAtTime(kind === 'soft' ? 1500 : 3400, t); lp.frequency.exponentialRampToValueAtTime(kind === 'soft' ? 800 : 1150, t + .2);
        this.env(g.gain, t, { a: .004, peak: (kind === 'soft' ? .09 : .11) * v, d: .15, s: .7, r: .06, dur });
      }
      lp.connect(g); g.connect(out);
    }
    /* ---- パッド・和音 ---- */
    pad(t, notes, dur, v = 1, kind = 'warm') {
      const ctx = this.ctx, stop = t + dur + 2.2;
      notes.forEach((n, i) => {
        const pan = (i / Math.max(1, notes.length - 1) - .5) * .8, out = this.voiceOut(this.pump, { pan, rev: kind === 'choir' ? .5 : .35 });
        const g = ctx.createGain(), f = mtof(n);
        if (kind === 'choir') {
          const o = this.osc('sawtooth', f, t, stop), vib = this.osc('sine', 5.2, t, stop), vg = ctx.createGain(); vg.gain.value = 3.5; vib.connect(vg); vg.connect(o.detune);
          const mixF = ctx.createGain(); mixF.gain.value = .9;
          for (const [ff, q, a] of [[730, 9, 1], [1150, 10, .55], [2650, 12, .3]]) { const bp = this.bq('bandpass', ff, q), ag = ctx.createGain(); ag.gain.value = a; o.connect(bp); bp.connect(ag); ag.connect(mixF); }
          mixF.connect(g);
          this.env(g.gain, t, { a: .5, peak: .5 * v, d: .5, s: .9, r: .9, dur });
        } else if (kind === 'glass') {
          const o = this.osc('triangle', f, t, stop), o2 = this.osc('sine', f * 2, t, stop), h = ctx.createGain(); h.gain.value = .25;
          o.connect(g); o2.connect(h); h.connect(g);
          this.env(g.gain, t, { a: .35, peak: .14 * v, d: .5, s: .85, r: .9, dur });
        } else {
          const lp = this.bq('lowpass', kind === 'bright' ? 3800 : kind === 'dark' ? 900 : 1600, .6);
          for (const det of [-9, 8]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det + i * 1.3; o.connect(lp); }
          if (kind === 'bright') { lp.frequency.setValueAtTime(1800, t); lp.frequency.linearRampToValueAtTime(4200, t + dur * .5); }
          lp.connect(g);
          this.env(g.gain, t, { a: kind === 'bright' ? .08 : .3, peak: (kind === 'dark' ? .078 : .062) * v, d: .5, s: .85, r: .6, dur });
        }
        g.connect(out);
      });
    }
    stab(t, notes, dur, v = 1, kind = 'saw') {
      const ctx = this.ctx, stop = t + dur + .4;
      notes.forEach((n, i) => {
        const out = this.voiceOut(this.pump, { pan: (i - notes.length / 2) * .14, rev: .22, del: kind === 'saw' ? .1 : .06 }), f = mtof(n), g = ctx.createGain();
        if (kind === 'epiano') {
          const c = this.osc('sine', f, t, stop), m = this.osc('sine', f, t, stop), mg = ctx.createGain();
          mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * .15, t + .5); m.connect(mg); mg.connect(c.frequency);
          const tine = this.osc('sine', f * 7, t, t + .15), tg = ctx.createGain(); tg.gain.setValueAtTime(.05 * v, t); tg.gain.exponentialRampToValueAtTime(.0001, t + .12); tine.connect(tg); tg.connect(out);
          c.connect(g); this.env(g.gain, t, { a: .004, peak: .13 * v, d: .5, s: .45, r: .25, dur });
        } else {
          const lp = this.bq('lowpass', 4500, 1.2);
          for (const det of [-14, 0, 13]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det; o.connect(lp); }
          lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(1200, t + dur + .1);
          lp.connect(g); this.env(g.gain, t, { a: .003, peak: .07 * v, d: .12, s: .55, r: .12, dur });
        }
        g.connect(out);
      });
    }
    /* ---- メロディ・アルペジオ ---- */
    lead(t, note, dur, v = 1, kind = 'saw', glideFrom = null) {
      const ctx = this.ctx, f = mtof(note), stop = t + dur + (kind === 'bell' || kind === 'fm' ? 1.6 : .7), g = ctx.createGain();
      const wet = { saw: [.26, .2], fm: [.32, .22], square: [.22, .2], chip: [.16, .18], brass: [.3, .1], pluck: [.25, .25], bell: [.4, .28], whistle: [.3, .2] }[kind] || [.25, .2];
      const out = this.voiceOut(this.leadBus, { rev: wet[0], del: wet[1] });
      const vibrato = o => {
        if (dur < .3) return;
        const l = this.osc('sine', 5.4, t, stop), lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + .18); lg.gain.linearRampToValueAtTime(kind === 'chip' ? 18 : 9, t + .45);
        l.connect(lg); lg.connect(o.detune);
      };
      const glide = o => { if (glideFrom != null) { o.frequency.setValueAtTime(mtof(glideFrom), t); o.frequency.exponentialRampToValueAtTime(f, t + .06); } };
      if (kind === 'fm' || kind === 'bell') {
        const c = this.osc('sine', f, t, stop), m = this.osc('sine', f * (kind === 'bell' ? 3.5 : 2), t, stop), mg = ctx.createGain();
        mg.gain.setValueAtTime(f * (kind === 'bell' ? 2.2 : 1.4), t); mg.gain.exponentialRampToValueAtTime(f * .12, t + (kind === 'bell' ? .9 : .4));
        m.connect(mg); mg.connect(c.frequency); glide(c); c.connect(g);
        this.env(g.gain, t, kind === 'bell' ? { a: .003, peak: .21 * v, d: .9, s: .2, r: .7, dur } : { a: .006, peak: .2 * v, d: .35, s: .55, r: .25, dur });
      } else if (kind === 'pluck') {
        const lp = this.bq('lowpass', 5200, 2);
        for (const det of [-6, 6]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det; o.connect(lp); }
        lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + .2);
        lp.connect(g); this.env(g.gain, t, { a: .002, peak: .27 * v, d: .2, s: .3, r: .2, dur: Math.min(dur, .35) });
      } else if (kind === 'chip' || kind === 'square') {
        const o = this.osc(kind === 'chip' ? 'pulse25' : 'square', f, t, stop), lp = this.bq('lowpass', kind === 'chip' ? 6000 : 3200, .8);
        glide(o); vibrato(o); o.connect(lp); lp.connect(g);
        this.env(g.gain, t, { a: .008, peak: (kind === 'chip' ? .1 : .106) * v, d: .2, s: .75, r: .12, dur });
      } else if (kind === 'whistle') {
        const o = this.osc('sine', f, t, stop), o2 = this.osc('triangle', f * 2, t, stop), h = ctx.createGain(); h.gain.value = .12;
        glide(o); vibrato(o); o.connect(g); o2.connect(h); h.connect(g);
        this.env(g.gain, t, { a: .03, peak: .21 * v, d: .2, s: .85, r: .15, dur });
      } else if (kind === 'brass') {
        const lp = this.bq('lowpass', 500, 1.5);
        for (const det of [-10, 0, 9]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det; glide(o); vibrato(o); o.connect(lp); }
        lp.frequency.setValueAtTime(450, t); lp.frequency.exponentialRampToValueAtTime(2800, t + .07); lp.frequency.exponentialRampToValueAtTime(1700, t + .35);
        lp.connect(g); this.env(g.gain, t, { a: .035, peak: .11 * v, d: .3, s: .85, r: .18, dur });
      } else { // supersaw
        const lp = this.bq('lowpass', 7000, 1);
        for (const det of [-21, -11, 0, 10, 20]) { const o = this.osc('sawtooth', f, t, stop); o.detune.value = det; glide(o); vibrato(o); o.connect(lp); }
        const sub = this.osc('square', f / 2, t, stop), sg = ctx.createGain(); sg.gain.value = .25; glide(sub); sub.connect(sg); sg.connect(lp);
        lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(7000, t + .04); lp.frequency.exponentialRampToValueAtTime(3600, t + .4);
        lp.connect(g); this.env(g.gain, t, { a: .005, peak: .08 * v, d: .25, s: .8, r: .16, dur });
      }
      g.connect(out);
    }
    arp(t, note, dur, v = 1, kind = 'pluck') {
      const ctx = this.ctx, f = mtof(note), stop = t + Math.min(dur, .2) + .9, g = ctx.createGain(), out = this.voiceOut(this.pump, { rev: .2, del: .32, pan: ((note % 7) - 3) * .08 });
      if (kind === 'bell') {
        const c = this.osc('sine', f, t, stop), m = this.osc('sine', f * 3.5, t, stop), mg = ctx.createGain();
        mg.gain.setValueAtTime(f * 1.8, t); mg.gain.exponentialRampToValueAtTime(f * .1, t + .5); m.connect(mg); mg.connect(c.frequency); c.connect(g);
        this.env(g.gain, t, { a: .002, peak: .42 * v, d: .4, s: .2, r: .4, dur: Math.min(dur, .2) });
      } else if (kind === 'chip') {
        const o = this.osc('pulse12', f, t, stop); o.connect(g);
        this.env(g.gain, t, { a: .002, peak: .13 * v, d: .1, s: .5, r: .04, dur: Math.min(dur, .12) });
      } else if (kind === 'pizz') {
        const lp = this.bq('lowpass', 2400, 1.5), o = this.osc('sawtooth', f, t, stop), o2 = this.osc('sawtooth', f, t, stop); o2.detune.value = 9;
        o.connect(lp); o2.connect(lp); lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + .15);
        lp.connect(g); this.env(g.gain, t, { a: .004, peak: .26 * v, d: .14, s: .3, r: .12, dur: Math.min(dur, .2) });
      } else {
        const lp = this.bq('lowpass', 4200, 3), o = this.osc('sawtooth', f, t, stop); o.connect(lp);
        lp.frequency.setValueAtTime(4800, t); lp.frequency.exponentialRampToValueAtTime(900, t + .2);
        lp.connect(g); this.env(g.gain, t, { a: .002, peak: .42 * v, d: .16, s: .3, r: .12, dur: Math.min(dur, .22) });
      }
      g.connect(out);
    }
    /* ---- 効果音（曲の中） ---- */
    riser(t, dur, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.mix, { rev: .4 });
      const n = this.noise(t, t + dur + .1), bp = this.bq('bandpass', 400, 2.5), g = ctx.createGain();
      bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22 * v, t + dur * .95); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
      n.connect(bp); bp.connect(g); g.connect(out);
      const o = this.osc('sawtooth', 180, t, t + dur + .05), ol = this.bq('lowpass', 2000), og = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(1400, t + dur); og.gain.setValueAtTime(.0001, t); og.gain.exponentialRampToValueAtTime(.03 * v, t + dur * .95); og.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
      o.connect(ol); ol.connect(og); og.connect(out);
    }
    impact(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.mix, { rev: .5 });
      const o = this.osc('sine', 75, t, t + 1.6), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(32, t + 1.2);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.8 * v, t + .005); g.gain.setTargetAtTime(.0001, t + .05, .35); o.connect(g); g.connect(out);
      const n = this.noise(t, t + .9), lp = this.bq('lowpass', 5000), ng = ctx.createGain(); lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(200, t + .8);
      ng.gain.setValueAtTime(.4 * v, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .8); n.connect(lp); lp.connect(ng); ng.connect(out);
    }
    swell(t, dur, v = 1) { // 逆再生シンバル風
      const ctx = this.ctx, out = this.voiceOut(this.mix, { rev: .3 });
      const n = this.noise(t, t + dur + .02), hp = this.bq('highpass', 3500), g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.25 * v, t + dur); g.gain.linearRampToValueAtTime(.0001, t + dur + .015);
      n.connect(hp); hp.connect(g); g.connect(out);
    }
    glitch(t, v = 1) {
      const ctx = this.ctx, out = this.voiceOut(this.leadBus, { del: .35, pan: Math.random() - .5 });
      for (let i = 0; i < 4; i++) {
        const s = t + i * .028, o = this.osc('square', 1200 + Math.random() * 2600, s, s + .02), g = ctx.createGain();
        g.gain.setValueAtTime(.035 * v, s); g.gain.setValueAtTime(.0001, s + .015); o.connect(g); g.connect(out);
      }
    }

    /* ===== 常駐ボイス =====
       同じ楽器は毎回ノードを作らず、鳴らしっぱなしの発振器に「音程・音量・フィルタ」の
       変化だけを予約する。スマホでも処理が軽く、音切れしにくい。 */
    hold(node) { node.start(this.t0); this.held.push(node); return node; }
    pOsc(type, f = 220, detune = 0) {
      const o = this.ctx.createOscillator();
      if (type === 'pulse25') o.setPeriodicWave(this.R.pulse25); else if (type === 'pulse12') o.setPeriodicWave(this.R.pulse12); else o.type = type;
      o.frequency.value = f; o.detune.value = detune; return this.hold(o);
    }
    pNoise() { if (!this.noiseSrc) { const s = this.ctx.createBufferSource(); s.buffer = this.R.noise; s.loop = true; this.noiseSrc = this.hold(s); } return this.noiseSrc; }
    pEnv(param, t, { a = .005, peak = 1, d = .1, s = .6, r = .1, dur = .2 }) {
      param.cancelScheduledValues(t);
      param.setTargetAtTime(peak, t, Math.max(.0008, a / 3));
      param.setTargetAtTime(peak * s, t + a, Math.max(.002, d / 3));
      param.setTargetAtTime(0, t + Math.max(a, dur), Math.max(.003, r / 3));
    }
    pOff(param, t, tau = .08) { param.cancelScheduledValues(t); param.setTargetAtTime(0, t, tau); }
    pFreq(param, t, f, glide = 0) { param.cancelScheduledValues(t); if (glide) param.setTargetAtTime(f, t, glide); else param.setValueAtTime(f, t); }
    pCut(param, t, from, to, tau, hold = .002) { param.cancelScheduledValues(t); param.setValueAtTime(from, t); param.setTargetAtTime(to, t + hold, tau); }
    gainNode(v = 0) { const n = this.ctx.createGain(); n.gain.value = v; return n; }
    vibrato(oscs, rate = 5.4) {
      const l = this.pOsc('sine', rate), lg = this.gainNode(0); l.connect(lg);
      for (const o of oscs) lg.connect(o.detune);
      return lg;
    }
    drumVoice(name) {
      if (this.V[name]) return this.V[name];
      const ctx = this.ctx, G = v => this.gainNode(v), v = {};
      if (name === 'kick') {
        v.o = this.pOsc('sine', 44); const sh = ctx.createWaveShaper(); sh.curve = this.R.curve; v.g = G(0); v.o.connect(sh); sh.connect(v.g); v.g.connect(this.drums);
        v.k = this.pOsc('triangle', 90); v.kg = G(0); v.k.connect(v.kg); v.kg.connect(this.drums);
        const hp = this.bq('highpass', 2600); v.ng = G(0); this.pNoise().connect(hp); hp.connect(v.ng); v.ng.connect(this.drums);
      } else if (name === 'snare') {
        const out = this.voiceOut(this.drums, { rev: .18 });
        v.b = this.pOsc('triangle', 160); v.bg = G(0); v.b.connect(v.bg); v.bg.connect(out);
        const hp = this.bq('highpass', 1100), bp = this.bq('bandpass', 4200, .6); v.ng = G(0); this.pNoise().connect(hp); hp.connect(bp); bp.connect(v.ng); v.ng.connect(out);
      } else if (name === 'clap') {
        const out = this.voiceOut(this.drums, { rev: .25, pan: .05 }), bp = this.bq('bandpass', 1500, 1.1), hp = this.bq('highpass', 700);
        v.g = G(0); this.pNoise().connect(bp); bp.connect(hp); hp.connect(v.g); v.g.connect(out);
      } else if (name === 'hat' || name === 'ohat') {
        const out = this.voiceOut(this.drums, { pan: name === 'hat' ? .18 : -.12 }), hp = this.bq('highpass', name === 'hat' ? 7800 : 6500), bp = this.bq('bandpass', 10000, .5);
        v.g = G(0); this.pNoise().connect(hp); hp.connect(bp); bp.connect(v.g); v.g.connect(out);
      } else if (name === 'shaker') {
        const out = this.voiceOut(this.drums, { pan: -.25 }), hp = this.bq('highpass', 5200);
        v.g = G(0); this.pNoise().connect(hp); hp.connect(v.g); v.g.connect(out);
      } else if (name === 'rim') {
        const out = this.voiceOut(this.drums, { pan: -.15, rev: .12 }), bp = this.bq('bandpass', 1700, 4);
        v.o = this.pOsc('square', 1650); v.g = G(0); v.o.connect(bp); bp.connect(v.g); v.g.connect(out);
      } else if (name === 'ride') {
        const out = this.voiceOut(this.drums, { pan: .3, rev: .1 }), hp = this.bq('highpass', 5500), bp = this.bq('bandpass', 9000, 1.5);
        v.g = G(0); this.pNoise().connect(hp); hp.connect(bp); bp.connect(v.g); v.g.connect(out);
      }
      return (this.V[name] = v);
    }
    pKick(t, v = 1, { pitch = 1, len = .38, duck = .55 } = {}) {
      const d = this.drumVoice('kick'), f = d.o.frequency, k = d.k.frequency;
      f.cancelScheduledValues(t); f.setValueAtTime(165 * pitch, t); f.exponentialRampToValueAtTime(58 * pitch, t + .055); f.exponentialRampToValueAtTime(44 * pitch, t + len);
      d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(.29 * v, t, .0008); d.g.gain.setTargetAtTime(0, t + .08, len / 6);
      k.cancelScheduledValues(t); k.setValueAtTime(210 * pitch, t); k.exponentialRampToValueAtTime(90, t + .06);
      d.kg.gain.cancelScheduledValues(t); d.kg.gain.setTargetAtTime(.26 * v, t, .0005); d.kg.gain.setTargetAtTime(0, t + .004, .02);
      d.ng.gain.cancelScheduledValues(t); d.ng.gain.setTargetAtTime(.12 * v, t, .0003); d.ng.gain.setTargetAtTime(0, t + .002, .003);
      if (duck) this.duck(t, duck);
    }
    pSnare(t, v = 1, { tone = 1 } = {}) {
      const d = this.drumVoice('snare'), f = d.b.frequency;
      f.cancelScheduledValues(t); f.setValueAtTime(195 * tone, t); f.exponentialRampToValueAtTime(150 * tone, t + .08);
      d.bg.gain.cancelScheduledValues(t); d.bg.gain.setTargetAtTime(.62 * v, t, .0006); d.bg.gain.setTargetAtTime(0, t + .003, .03);
      d.ng.gain.cancelScheduledValues(t); d.ng.gain.setTargetAtTime(.78 * v, t, .0006); d.ng.gain.setTargetAtTime(0, t + .004, .045);
    }
    pClap(t, v = 1) {
      const g = this.drumVoice('clap').g.gain;
      g.cancelScheduledValues(t);
      for (const [o, a] of [[0, 1.3], [.011, 1.1], [.022, 1.25]]) { g.setTargetAtTime(a * v, t + o, .0004); g.setTargetAtTime(.12 * v, t + o + .002, .003); }
      g.setTargetAtTime(.85 * v, t + .033, .0005); g.setTargetAtTime(0, t + .035, .055);
    }
    pHat(t, v = 1, open = false) {
      const g = this.drumVoice(open ? 'ohat' : 'hat').g.gain;
      g.cancelScheduledValues(t); g.setTargetAtTime((open ? .5 : .6) * v, t, .0005); g.setTargetAtTime(0, t + .002, open ? .075 : .011);
    }
    pShaker(t, v = 1) { const g = this.drumVoice('shaker').g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(.26 * v, t, .004); g.setTargetAtTime(0, t + .012, .014); }
    pRim(t, v = 1) { const g = this.drumVoice('rim').g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(.28 * v, t, .0004); g.setTargetAtTime(0, t + .002, .009); }
    pRide(t, v = 1) { const g = this.drumVoice('ride').g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(.13 * v, t, .0005); g.setTargetAtTime(0, t + .002, .11); }
    bassVoice(kind) {
      const key = 'bass:' + kind; if (this.V[key]) return this.V[key];
      const ctx = this.ctx, out = this.voiceOut(this.pump, {}), v = { kind };
      v.sub = this.pOsc('sine', 55); v.sg = this.gainNode(0); v.sub.connect(v.sg); v.sg.connect(out);
      v.lp = this.bq('lowpass', 800, kind === 'funk' ? 3 : 5); v.g = this.gainNode(0); v.lp.connect(v.g); v.g.connect(out);
      if (kind === 'reese') { v.oscs = [this.pOsc('sawtooth', 55, -14), this.pOsc('sawtooth', 55, 13)]; v.oscs.forEach(o => o.connect(v.lp)); v.mult = [1, 1]; }
      else if (kind === 'funk') { v.oscs = [this.pOsc('pulse25', 55)]; v.oscs[0].connect(v.lp); v.mult = [1]; }
      else {
        const sq = this.pOsc('square', 110, -6), saw = this.pOsc('sawtooth', 55), drive = ctx.createWaveShaper(), pre = this.gainNode(.8), half = this.gainNode(.6);
        drive.curve = this.R.curve; saw.connect(pre); sq.connect(half); half.connect(pre); pre.connect(drive); drive.connect(v.lp);
        v.oscs = [saw, sq]; v.mult = [1, 2];
      }
      return (this.V[key] = v);
    }
    pBass(t, note, dur, vel = 1, kind = 'pluck') {
      const v = this.bassVoice(kind), f = mtof(note);
      this.pFreq(v.sub.frequency, t, f);
      v.oscs.forEach((o, i) => {
        if (kind === 'funk') { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f * 1.012, t); o.frequency.setTargetAtTime(f, t, .01); }
        else this.pFreq(o.frequency, t, f * v.mult[i]);
      });
      this.pEnv(v.sg.gain, t, { a: .004, peak: (kind === 'reese' ? .15 : .14) * vel, d: .2, s: .9, r: .05, dur });
      if (kind === 'reese') {
        const c = v.lp.frequency; c.cancelScheduledValues(t); c.setValueAtTime(380, t); c.linearRampToValueAtTime(1300, t + dur * .6); c.linearRampToValueAtTime(600, t + dur);
        this.pEnv(v.g.gain, t, { a: .02, peak: .14 * vel, d: .3, s: .85, r: .08, dur });
      } else if (kind === 'funk') {
        this.pCut(v.lp.frequency, t, 3200, 520, .04);
        this.pEnv(v.g.gain, t, { a: .003, peak: .2 * vel, d: .12, s: .5, r: .05, dur: Math.min(dur, .3) });
      } else {
        this.pCut(v.lp.frequency, t, kind === 'soft' ? 1500 : 3400, kind === 'soft' ? 800 : 1150, .06);
        this.pEnv(v.g.gain, t, { a: .004, peak: (kind === 'soft' ? .09 : .11) * vel, d: .15, s: .7, r: .06, dur });
      }
    }
    padVoices(kind) {
      const key = 'pad:' + kind; if (this.V[key]) return this.V[key];
      const ctx = this.ctx, voices = [];
      const vib = kind === 'choir' ? this.vibrato([], 5.2) : null; if (vib) vib.gain.value = 3.5;
      for (let i = 0; i < 4; i++) {
        const pan = (i / 3 - .5) * .8, out = this.voiceOut(this.pump, { pan, rev: kind === 'choir' ? .5 : .35 }), g = this.gainNode(0), v = { g, oscs: [], mult: [] };
        if (kind === 'choir') {
          const o = this.pOsc('sawtooth', 220); vib.connect(o.detune); const m = this.gainNode(.9);
          for (const [ff, q, a] of [[730, 9, 1], [1150, 10, .55], [2650, 12, .3]]) { const bp = this.bq('bandpass', ff, q), ag = this.gainNode(a); o.connect(bp); bp.connect(ag); ag.connect(m); }
          m.connect(g); v.oscs = [o]; v.mult = [1];
        } else if (kind === 'glass') {
          const o = this.pOsc('triangle', 220), o2 = this.pOsc('sine', 440), h = this.gainNode(.25); o.connect(g); o2.connect(h); h.connect(g); v.oscs = [o, o2]; v.mult = [1, 2];
        } else {
          v.lp = this.bq('lowpass', kind === 'bright' ? 3800 : kind === 'dark' ? 900 : 1600, .6);
          for (const det of [-9, 8]) { const o = this.pOsc('sawtooth', 220, det + i * 1.3); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
          v.lp.connect(g);
        }
        g.connect(out); voices.push(v);
      }
      return (this.V[key] = voices);
    }
    pPad(t, notes, dur, vel = 1, kind = 'warm') {
      const voices = this.padVoices(kind);
      const env = kind === 'choir' ? { a: .5, peak: .5 * vel, d: .5, s: .9, r: .9, dur } : kind === 'glass' ? { a: .35, peak: .14 * vel, d: .5, s: .85, r: .9, dur }
        : { a: kind === 'bright' ? .08 : .3, peak: (kind === 'dark' ? .078 : .062) * vel, d: .5, s: .85, r: .6, dur };
      voices.forEach((v, i) => {
        if (notes[i] == null) { this.pOff(v.g.gain, t, .2); return; }
        const f = mtof(notes[i]);
        v.oscs.forEach((o, k) => this.pFreq(o.frequency, t, f * v.mult[k]));
        if (kind === 'bright') { const c = v.lp.frequency; c.cancelScheduledValues(t); c.setValueAtTime(1800, t); c.linearRampToValueAtTime(4200, t + dur * .5); }
        this.pEnv(v.g.gain, t, env);
      });
    }
    stabVoices(kind) {
      const key = 'stab:' + kind; if (this.V[key]) return this.V[key];
      const voices = [];
      for (let i = 0; i < 4; i++) {
        const out = this.voiceOut(this.pump, { pan: (i - 2) * .14, rev: .22, del: kind === 'saw' ? .1 : .06 }), g = this.gainNode(0), v = { g, oscs: [], mult: [] };
        if (kind === 'epiano') {
          v.c = this.pOsc('sine', 220); v.m = this.pOsc('sine', 220); v.mg = this.gainNode(0); v.m.connect(v.mg); v.mg.connect(v.c.frequency); v.c.connect(g);
          v.tine = this.pOsc('sine', 1540); v.tg = this.gainNode(0); v.tine.connect(v.tg); v.tg.connect(out);
          v.oscs = [v.c, v.m, v.tine]; v.mult = [1, 1, 7];
        } else {
          v.lp = this.bq('lowpass', 4500, 1.2);
          for (const det of [-14, 0, 13]) { const o = this.pOsc('sawtooth', 220, det); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
          v.lp.connect(g);
        }
        g.connect(out); voices.push(v);
      }
      return (this.V[key] = voices);
    }
    pStab(t, notes, dur, vel = 1, kind = 'saw') {
      this.stabVoices(kind).forEach((v, i) => {
        if (notes[i] == null) { this.pOff(v.g.gain, t, .05); return; }
        const f = mtof(notes[i]);
        v.oscs.forEach((o, k) => this.pFreq(o.frequency, t, f * v.mult[k]));
        if (kind === 'epiano') {
          const m = v.mg.gain; m.cancelScheduledValues(t); m.setValueAtTime(f * 1.6, t); m.setTargetAtTime(f * .15, t, .16);
          this.pEnv(v.tg.gain, t, { a: .001, peak: .05 * vel, d: .03, s: .0, r: .02, dur: .02 });
          this.pEnv(v.g.gain, t, { a: .004, peak: .13 * vel, d: .5, s: .45, r: .25, dur });
        } else {
          this.pCut(v.lp.frequency, t, 6000, 1200, (dur + .1) / 3);
          this.pEnv(v.g.gain, t, { a: .003, peak: .07 * vel, d: .12, s: .55, r: .12, dur });
        }
      });
    }
    arpVoice(kind) {
      const key = 'arp:' + kind; if (this.V[key]) return this.V[key];
      const out = this.voiceOut(this.pump, { rev: .2, del: .32, pan: .12 }), g = this.gainNode(0), v = { g, oscs: [], mult: [] };
      if (kind === 'bell') { v.c = this.pOsc('sine', 440); v.m = this.pOsc('sine', 1540); v.mg = this.gainNode(0); v.m.connect(v.mg); v.mg.connect(v.c.frequency); v.c.connect(g); v.oscs = [v.c, v.m]; v.mult = [1, 3.5]; }
      else if (kind === 'chip') { const o = this.pOsc('pulse12', 440); o.connect(g); v.oscs = [o]; v.mult = [1]; }
      else {
        v.lp = this.bq('lowpass', 4200, kind === 'pizz' ? 1.5 : 3);
        const dets = kind === 'pizz' ? [0, 9] : [0];
        for (const det of dets) { const o = this.pOsc('sawtooth', 440, det); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
        v.lp.connect(g);
      }
      g.connect(out);
      return (this.V[key] = v);
    }
    pArp(t, note, dur, vel = 1, kind = 'pluck') {
      const v = this.arpVoice(kind), f = mtof(note), len = Math.min(dur, kind === 'chip' ? .12 : .22);
      v.oscs.forEach((o, k) => this.pFreq(o.frequency, t, f * v.mult[k]));
      if (kind === 'bell') {
        const m = v.mg.gain; m.cancelScheduledValues(t); m.setValueAtTime(f * 1.8, t); m.setTargetAtTime(f * .1, t, .15);
        this.pEnv(v.g.gain, t, { a: .002, peak: .42 * vel, d: .4, s: .2, r: .4, dur: len });
      } else if (kind === 'chip') this.pEnv(v.g.gain, t, { a: .002, peak: .13 * vel, d: .1, s: .5, r: .04, dur: len });
      else if (kind === 'pizz') { this.pCut(v.lp.frequency, t, 2600, 500, .05); this.pEnv(v.g.gain, t, { a: .004, peak: .26 * vel, d: .14, s: .3, r: .12, dur: len }); }
      else { this.pCut(v.lp.frequency, t, 4800, 900, .06); this.pEnv(v.g.gain, t, { a: .002, peak: .42 * vel, d: .16, s: .3, r: .12, dur: len }); }
    }
    leadVoice(kind) {
      const key = 'lead:' + kind; if (this.V[key]) return this.V[key];
      const wet = { saw: [.26, .2], fm: [.32, .22], square: [.22, .2], chip: [.16, .18], brass: [.3, .1], pluck: [.25, .25], bell: [.4, .28], whistle: [.3, .2] }[kind] || [.25, .2];
      const out = this.voiceOut(this.leadBus, { rev: wet[0], del: wet[1] }), g = this.gainNode(0), v = { kind, g, oscs: [], mult: [] };
      if (kind === 'fm' || kind === 'bell') {
        v.c = this.pOsc('sine', 440); v.m = this.pOsc('sine', 880); v.mg = this.gainNode(0); v.m.connect(v.mg); v.mg.connect(v.c.frequency); v.c.connect(g);
        v.oscs = [v.c, v.m]; v.mult = [1, kind === 'bell' ? 3.5 : 2];
      } else if (kind === 'pluck') {
        v.lp = this.bq('lowpass', 5200, 2);
        for (const det of [-6, 6]) { const o = this.pOsc('sawtooth', 440, det); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
        v.lp.connect(g);
      } else if (kind === 'chip' || kind === 'square') {
        const o = this.pOsc(kind === 'chip' ? 'pulse25' : 'square', 440); v.lp = this.bq('lowpass', kind === 'chip' ? 6000 : 3200, .8); o.connect(v.lp); v.lp.connect(g);
        v.oscs = [o]; v.mult = [1]; v.vib = this.vibrato(v.oscs); v.vibDepth = kind === 'chip' ? 18 : 9;
      } else if (kind === 'whistle') {
        const o = this.pOsc('sine', 440), o2 = this.pOsc('triangle', 880), h = this.gainNode(.12); o.connect(g); o2.connect(h); h.connect(g);
        v.oscs = [o, o2]; v.mult = [1, 2]; v.vib = this.vibrato(v.oscs); v.vibDepth = 9;
      } else if (kind === 'brass') {
        v.lp = this.bq('lowpass', 500, 1.5);
        for (const det of [-10, 0, 9]) { const o = this.pOsc('sawtooth', 440, det); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
        v.lp.connect(g); v.vib = this.vibrato(v.oscs); v.vibDepth = 9;
      } else {
        v.lp = this.bq('lowpass', 7000, 1);
        for (const det of [-21, -11, 0, 10, 20]) { const o = this.pOsc('sawtooth', 440, det); o.connect(v.lp); v.oscs.push(o); v.mult.push(1); }
        const sub = this.pOsc('square', 220), sg = this.gainNode(.25); sub.connect(sg); sg.connect(v.lp); v.oscs.push(sub); v.mult.push(.5);
        v.lp.connect(g); v.vib = this.vibrato(v.oscs); v.vibDepth = 9;
      }
      g.connect(out);
      return (this.V[key] = v);
    }
    pLead(t, note, dur, vel = 1, kind = 'saw', glideFrom = null) {
      const v = this.leadVoice(kind), f = mtof(note), glide = glideFrom != null ? .022 : 0;
      v.oscs.forEach((o, k) => this.pFreq(o.frequency, t, f * v.mult[k], glide));
      if (v.vib) { const p = v.vib.gain; p.cancelScheduledValues(t); p.setValueAtTime(0, t); if (dur >= .3) p.setTargetAtTime(v.vibDepth, t + .2, .08); }
      if (kind === 'fm' || kind === 'bell') {
        const m = v.mg.gain; m.cancelScheduledValues(t); m.setValueAtTime(f * (kind === 'bell' ? 2.2 : 1.4), t); m.setTargetAtTime(f * .12, t, kind === 'bell' ? .3 : .13);
        this.pEnv(v.g.gain, t, kind === 'bell' ? { a: .003, peak: .21 * vel, d: .9, s: .2, r: .7, dur } : { a: .006, peak: .2 * vel, d: .35, s: .55, r: .25, dur });
      } else if (kind === 'pluck') {
        this.pCut(v.lp.frequency, t, 5200, 700, .07);
        this.pEnv(v.g.gain, t, { a: .002, peak: .27 * vel, d: .2, s: .3, r: .2, dur: Math.min(dur, .35) });
      } else if (kind === 'chip' || kind === 'square') {
        this.pEnv(v.g.gain, t, { a: .008, peak: (kind === 'chip' ? .1 : .106) * vel, d: .2, s: .75, r: .12, dur });
      } else if (kind === 'whistle') {
        this.pEnv(v.g.gain, t, { a: .03, peak: .21 * vel, d: .2, s: .85, r: .15, dur });
      } else if (kind === 'brass') {
        const c = v.lp.frequency; c.cancelScheduledValues(t); c.setValueAtTime(glide ? 1700 : 450, t); c.setTargetAtTime(2800, t, .025); c.setTargetAtTime(1700, t + .08, .1);
        this.pEnv(v.g.gain, t, { a: .035, peak: .11 * vel, d: .3, s: .85, r: .18, dur });
      } else {
        const c = v.lp.frequency; c.cancelScheduledValues(t); c.setValueAtTime(2600, t); c.setTargetAtTime(7000, t, .015); c.setTargetAtTime(3600, t + .05, .12);
        this.pEnv(v.g.gain, t, { a: .005, peak: .08 * vel, d: .25, s: .8, r: .16, dur });
      }
    }
    fadeIn(t, sec, level = 1) { const p = this.out.gain; p.cancelScheduledValues(t); p.setValueAtTime(Math.max(.0001, p.value), t); p.linearRampToValueAtTime(level, t + sec); }
    fadeOut(t, sec) { const p = this.out.gain; p.cancelScheduledValues(t); p.setValueAtTime(Math.max(.0001, p.value), t); p.linearRampToValueAtTime(.0001, t + sec); }
    dispose() {
      const now = this.ctx.currentTime;
      for (const s of this.held) { try { s.stop(now + .02); } catch (e) {} }
      this.held = [];
      try { this.out.disconnect(); } catch (e) {}
    }
  }

  /* ---------- 曲データ ----------
     drums: 1小節16文字。x=通常 X=強 o=弱 .=休み。 k=キック s=スネア c=クラップ h=ハット o=オープン sh=シェイカー r=ライド p=リム t=タム
     bass : R=根音 r=1オクターブ上 5=5度 3=3度 7=7度 -=伸ばす .=休み
     arp  : 数字=和音の何番目の音（下から）. -=伸ばす
     mel  : 小節ごとに "音名:長さ(16分)"。-:n は休み                                           */
  const D = {
    four: { k: 'x...x...x...x...' },
    snare24: { s: '....x.......x...' },
    clap24: { c: '....x.......x...' },
    off8: { h: '..x...x...x...x.' },
    hat16: { h: 'xoxoxoxoxoxoxoxo' },
    openOff: { o: '..x...x...x...x.' },
    fill1: { s: '........x.x.xxxx', t: '....x.x.........' },
    roll: [{ s: '....x.......x...' }, { s: '..x...x...x...x.' }, { s: 'x.x.x.x.x.x.x.x.' }, { s: 'xxxxxxxxxxxxxxxx' }]
  };
  const mix = (...parts) => Object.assign({}, ...parts);
  const TRACKS = [
    {
      id: 'boot', title: '起動シーケンス', sub: 'タイトル／シンセウェイブ', bpm: 104, swing: 0, gain: 0.7, delay: .75, reverb: .3,
      sections: [
        { n: 'intro', bars: 4, prog: ['Am', 'F', 'C', 'G'], pad: { kind: 'warm', v: .9 }, arp: { pat: '0123432101234321', kind: 'pluck', v: .55, open: true, center: 64 }, fx: { riserLast: 2 } },
        { n: 'verse', bars: 8, prog: ['Am', 'F', 'C', 'G'], drums: mix(D.four, D.snare24, D.off8, { sh: 'oxoxoxoxoxoxoxox' }), fill: D.fill1, bass: { pat: 'R.r.R.r.R.r.R.r.', kind: 'pluck', v: .9 },
          pad: { kind: 'warm', v: .75 }, arp: { pat: '0.1.2.3.4.3.2.1.', kind: 'pluck', v: .45 }, lead: { mel: 'A', kind: 'fm', v: .95 }, fx: { crashFirst: true } },
        { n: 'chorus', bars: 8, prog: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'E'], drums: mix(D.four, D.snare24, D.clap24, D.hat16, D.openOff), fill: D.fill1,
          bass: { pat: 'R.r.R.r.R.r.R.r.', kind: 'pluck', v: 1 }, pad: { kind: 'bright', v: .7 }, arp: { pat: '0123432101234321', kind: 'pluck', v: .4 }, lead: { mel: 'B', kind: 'saw', v: 1 }, fx: { crashFirst: true } },
        { n: 'break', bars: 4, prog: ['Am', 'F', 'C', 'G'], pad: { kind: 'warm', v: 1 }, arp: { pat: '0..1..2..3..4...', kind: 'bell', v: .6, center: 72 }, lead: { mel: 'C', kind: 'fm', v: .7 }, fx: { swellLast: true } }
      ],
      loop: 1,
      mel: {
        A: ['E5:4 D5:2 C5:2 A4:6 C5:2', 'C5:4 A4:2 F4:2 A4:4 C5:4', 'E5:4 D5:2 E5:2 G5:6 E5:2', 'D5:6 B4:2 D5:4 -:4',
          'E5:4 D5:2 C5:2 A4:4 B4:2 C5:2', 'F5:4 E5:2 C5:2 A4:6 -:2', 'G5:4 E5:2 C5:2 E5:4 D5:2 C5:2', 'B4:6 G4:2 B4:2 D5:2 -:4'],
        B: ['A5:3 G5:3 F5:2 E5:2 F5:2 A5:4', 'G5:3 F5:3 D5:2 B4:4 D5:4', 'E5:3 G5:3 B5:2 A5:2 G5:2 E5:4', 'A5:6 G5:2 E5:8',
          'A5:3 G5:3 F5:2 E5:2 F5:2 A5:4', 'B5:3 A5:3 G5:2 D5:4 G5:4', 'C6:4 B5:2 A5:2 E5:4 A5:4', 'G#5:4 B5:4 E5:2 G#5:2 B5:4'],
        C: ['-:8 E5:4 C5:4', 'A4:16', '-:8 G5:4 E5:4', 'D5:16']
      }
    },
    {
      id: 'lounge', title: 'ロビー・ラウンジ', sub: 'ロビー／シティポップ風', bpm: 112, swing: .14, gain: 0.62, delay: .75, reverb: .26,
      sections: [
        { n: 'intro', bars: 2, prog: ['Bbmaj7', 'C7sus4'], drums: { k: 'x.......x.......', h: 'xoxoxoxoxoxoxoxo' }, stab: { pat: '..x...x...x..x..', kind: 'epiano', v: 1 }, pad: { kind: 'glass', v: .7 } },
        { n: 'A', bars: 8, prog: ['Bbmaj7', 'Am7', 'Gm7', 'C7'], drums: { k: 'x.....x...x.....', s: '....x..o....x.o.', h: 'xoxoxoxoxoxoxoxo', o: '..............x.' }, fill: { s: '....x..o..x.xxx.', k: 'x.....x.........' },
          bass: { pat: 'R-.R..5.r.R..75.', kind: 'funk', v: 1 }, stab: { pat: '..x...x...x..x..', kind: 'epiano', v: .9 }, pad: { kind: 'glass', v: .5 }, lead: { mel: 'A', kind: 'whistle', v: .95 } },
        { n: 'B', bars: 8, prog: ['Dm7', 'Gm7', 'C7', 'Fmaj7', 'Bbmaj7', 'Am7', 'Gm7', 'C7'], drums: { k: 'x.....x...x.....', s: '....x..o....x.o.', h: 'xoxoxoxoxoxoxoxo', o: '..x...x...x...x.', sh: 'oxoxoxoxoxoxoxox' }, fill: { s: '....x..o..x.xxx.', k: 'x.....x.........' },
          bass: { pat: 'R-.R..5.r.R..75.', kind: 'funk', v: 1 }, stab: { pat: '..x...x...x..x..', kind: 'epiano', v: .85 }, pad: { kind: 'glass', v: .55 }, arp: { pat: '0.2.1.3.2.4.3.1.', kind: 'chip', v: .5 }, lead: { mel: 'B', kind: 'chip', v: 1 } },
        { n: 'break', bars: 2, prog: ['Bbmaj7', 'C7sus4'], drums: { h: 'xoxoxoxoxoxoxoxo', p: '....x.......x...' }, stab: { pat: 'x.....x.....x...', kind: 'epiano', v: 1 }, pad: { kind: 'glass', v: .8 } }
      ],
      loop: 1,
      mel: {
        A: ['-:2 D5:2 F5:2 A5:2 G5:3 F5:3 D5:2', 'E5:3 C5:3 A4:2 C5:2 E5:2 G5:4', 'F5:3 D5:3 Bb4:2 D5:2 F5:2 A5:2 G5:2', 'E5:6 C5:2 -:4 G4:2 Bb4:2',
          '-:2 D5:2 F5:2 A5:2 C6:3 A5:3 F5:2', 'G5:3 E5:3 C5:2 E5:2 G5:2 A5:4', 'Bb5:3 A5:3 F5:2 D5:2 F5:2 G5:4', 'E5:4 D5:2 C5:2 -:8'],
        B: ['A5:4 F5:2 D5:2 C5:2 D5:2 F5:4', 'G5:4 Bb5:2 G5:2 F5:2 D5:2 Bb4:4', 'C5:2 E5:2 G5:2 Bb5:2 A5:3 G5:3 E5:2', 'F5:6 E5:2 C5:4 A4:4',
          'D5:2 F5:2 A5:2 C6:2 D6:4 A5:4', 'C6:3 A5:3 E5:2 G5:4 E5:4', 'F5:3 G5:3 A5:2 Bb5:4 D6:4', 'C6:6 Bb5:2 G5:4 E5:4']
      }
    },
    {
      id: 'select', title: 'プロトコル選択', sub: 'ドラフト／緊張感', bpm: 118, swing: 0, gain: 0.58, delay: .75, reverb: .34,
      sections: [
        { n: 'A', bars: 8, prog: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'Asus4', 'A'], drums: { k: 'x.......x.......', h: 'o.o.o.o.o.o.o.o.', p: '......x.......x.' },
          bass: { pat: 'R.R.R.R.R.R.R.R.', kind: 'soft', v: .9 }, pad: { kind: 'glass', v: .8 }, arp: { pat: '0..2..1..3..2...', kind: 'bell', v: .55, center: 60 }, lead: { mel: 'A', kind: 'fm', v: .75 }, fx: { glitch: [3, 7] } },
        { n: 'B', bars: 8, prog: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'Asus4', 'A'], drums: { k: 'x.....x.x.......', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', p: '......x.......x.' }, fill: { s: '..........x.x.xx' },
          bass: { pat: 'R.R.R.R.R.R.R.R.', kind: 'pluck', v: .9 }, pad: { kind: 'dark', v: .9 }, arp: { pat: '0.1.2.3.4.3.2.1.', kind: 'pluck', v: .5 }, lead: { mel: 'A', kind: 'fm', v: .85 }, fx: { glitch: [3, 7], crashFirst: true } }
      ],
      loop: 0,
      mel: { A: ['D5:3 A4:3 F5:2 E5:4 -:4', 'D5:3 A4:3 C5:2 D5:8', 'D5:3 Bb4:3 F5:2 E5:4 D5:4', 'C5:8 -:8', 'Bb4:3 G4:3 D5:2 C5:4 Bb4:4', 'A4:8 -:8', 'D5:4 E5:4 A5:8', 'C#5:8 E5:8'] }
    },
    {
      id: 'runtime', title: 'ランタイム', sub: '対戦／サイバー・エレクトロ', bpm: 126, swing: 0, gain: 0.67, delay: .75, reverb: .28,
      sections: [
        { n: 'intro', bars: 4, prog: ['Em', 'C', 'G', 'D'], drums: { k: 'x...x...x...x...' }, bass: { pat: '.R.R.R.R.R.R.R.R', kind: 'pluck', v: .8 }, arp: { pat: '0123210301232103', kind: 'pluck', v: .5, open: true, center: 64 }, fx: { riserLast: 2 } },
        { n: 'A', bars: 8, prog: ['Em', 'C', 'G', 'D'], drums: mix(D.four, D.clap24, D.off8, { sh: 'oxoxoxoxoxoxoxox' }), fill: D.fill1, bass: { pat: '.RrR.RrR.RrR.RrR', kind: 'pluck', v: .95 },
          pad: { kind: 'warm', v: .7 }, arp: { pat: '0123210301232103', kind: 'pluck', v: .42 }, lead: { mel: 'A', kind: 'pluck', v: 1.1 }, fx: { crashFirst: true } },
        { n: 'build', bars: 4, prog: ['C', 'D', 'Em', 'D'], drums: { k: 'x...x...x...x...' }, rollDrums: true, bass: { pat: 'R.R.R.R.R.R.R.R.', kind: 'pluck', v: .8 }, arp: { pat: '0123012301230123', kind: 'pluck', v: .5, open: true, center: 64 }, fx: { riserAll: true } },
        { n: 'drop', bars: 8, prog: ['Em', 'C', 'Am', 'B7'], drums: mix(D.four, D.clap24, D.hat16, D.openOff, { p: '...x......x...x.' }), fill: D.fill1, bass: { pat: '.RrR.RrR.RrR.RrR', kind: 'pluck', v: 1 },
          stab: { pat: 'x..x..x...x..x..', kind: 'saw', v: .8 }, arp: { pat: '0123210301232103', kind: 'pluck', v: .35 }, lead: { mel: 'B', kind: 'saw', v: 1 }, fx: { crashFirst: true, impactFirst: true } },
        { n: 'break', bars: 4, prog: ['Em', 'C', 'G', 'D'], pad: { kind: 'warm', v: 1 }, arp: { pat: '0..1..2..3..2...', kind: 'bell', v: .55, center: 74 }, lead: { mel: 'C', kind: 'fm', v: .7 }, fx: { swellLast: true } }
      ],
      loop: 1,
      mel: {
        A: ['B4:4 -:2 E5:2 G5:4 F#5:2 E5:2', 'E5:4 -:2 G5:2 C5:4 D5:2 E5:2', 'D5:4 -:2 B4:2 G4:4 B4:2 D5:2', 'F#5:4 E5:2 D5:2 A4:8',
          'B4:4 -:2 E5:2 G5:4 F#5:2 E5:2', 'E5:4 -:2 G5:2 C5:4 D5:2 E5:2', 'D5:4 G5:2 B5:2 A5:4 G5:2 F#5:2', 'F#5:6 E5:2 D5:8'],
        B: ['E5:2 G5:2 B5:2 E6:2 D6:3 B5:3 G5:2', 'C6:4 B5:2 G5:2 E5:4 G5:4', 'A5:2 C6:2 E6:4 D6:2 C6:2 B5:2 A5:2', 'B5:6 F#5:2 D#5:4 B4:4',
          'E5:2 G5:2 B5:2 E6:2 F#6:3 E6:3 D6:2', 'E6:4 D6:2 C6:2 G5:4 C6:4', 'A5:2 B5:2 C6:2 D6:2 E6:4 C6:4', 'D#6:4 F#6:4 B5:8'],
        C: ['-:8 B5:4 G5:4', 'E5:16', '-:8 D6:4 B5:4', 'A5:16']
      }
    },
    {
      id: 'overflow', title: 'スタックオーバーフロー', sub: '対戦／ドラムンベース', bpm: 172, swing: 0, gain: 0.72, delay: .5, reverb: .3,
      sections: [
        { n: 'intro', bars: 4, prog: ['Fm', 'Fm', 'Db', 'Db'], drums: { h: 'x.x.x.x.x.x.x.x.' }, pad: { kind: 'dark', v: 1 }, fx: { riserLast: 1 } },
        { n: 'A', bars: 8, prog: ['Fm', 'Fm', 'Db', 'Db', 'Bbm', 'Bbm', 'C', 'C'], drums: { k: 'x.........x.....', s: '....x..o.o..x...', h: 'x.x.x.x.x.x.x.x.' }, fill: { s: '....x..o.xx.xxxx', k: 'x.........x.....' },
          bass: { pat: 'R---------R---5-', kind: 'reese', v: 1 }, pad: { kind: 'dark', v: .8 }, fx: { crashFirst: true, impactFirst: true } },
        { n: 'B', bars: 8, prog: ['Fm', 'Fm', 'Db', 'Db', 'Bbm', 'Bbm', 'C', 'C'], drums: { k: 'x.........x.....', s: '....x..o.o..x...', h: 'xoxoxoxoxoxoxoxo', r: 'x...x...x...x...' }, fill: { s: '....x..o.xx.xxxx', k: 'x.........x.....' },
          bass: { pat: 'R---------R---5-', kind: 'reese', v: 1 }, pad: { kind: 'warm', v: .6 }, arp: { pat: '0.1.2.1.0.1.2.3.', kind: 'pluck', v: .35 }, lead: { mel: 'A', kind: 'square', v: 1 }, fx: { crashFirst: true } },
        { n: 'break', bars: 4, prog: ['Bbm', 'Bbm', 'C', 'C'], drums: { h: 'x.x.x.x.x.x.x.x.', k: 'x...............' }, pad: { kind: 'choir', v: .9 }, lead: { mel: 'B', kind: 'fm', v: .7 }, fx: { riserLast: 1 } }
      ],
      loop: 1,
      mel: {
        A: ['C6:4 Ab5:4 F5:4 G5:2 Ab5:2', 'G5:6 Eb5:2 F5:8', 'Ab5:4 F5:4 Db5:4 Eb5:2 F5:2', 'Eb5:6 C5:2 Db5:8',
          'F5:4 Db5:4 Bb4:4 C5:2 Db5:2', 'Eb5:4 Db5:4 C5:4 Bb4:4', 'C5:4 E5:4 G5:4 Bb5:4', 'E5:4 G5:4 C6:8'],
        B: ['F5:16', '-:16', 'E5:8 G5:8', 'C6:16']
      }
    },
    {
      id: 'lastcompile', title: 'ラストコンパイル', sub: '終盤／決戦', bpm: 140, swing: 0, gain: 0.55, delay: .75, reverb: .36,
      sections: [
        { n: 'intro', bars: 4, prog: ['Dm', 'Bb', 'F', 'A'], pad: { kind: 'choir', v: 1.45 }, timpani: 'x.......x.......', fx: { riserLast: 1 } },
        { n: 'A', bars: 8, prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], drums: { k: 'x.....x...x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' }, fill: { t: '........x.x.x.x.', s: '............xxxx' },
          bass: { pat: 'R.R.R.R.r.R.R.R.', kind: 'pluck', v: .75 }, pad: { kind: 'choir', v: 1.15 }, arp: { pat: '0101210101210121', kind: 'pizz', v: 1.05 }, timpani: 'x...............', fx: { crashFirst: true } },
        { n: 'B', bars: 8, prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], drums: { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '..x...x...x...x.' }, fill: { t: '........x.x.x.x.', s: '............xxxx' },
          bass: { pat: 'R.R.R.R.r.R.R.R.', kind: 'pluck', v: .85 }, pad: { kind: 'warm', v: .7 }, arp: { pat: '0101210101210121', kind: 'pizz', v: .85 }, lead: { mel: 'A', kind: 'brass', v: 1.35 }, fx: { crashFirst: true, impactFirst: true } },
        { n: 'break', bars: 4, prog: ['Gm', 'Bb', 'Gm', 'A'], pad: { kind: 'choir', v: 1.45 }, timpani: 'x.......x...x.x.', fx: { swellLast: true } }
      ],
      loop: 1,
      mel: { A: ['D5:6 F5:2 A5:6 G5:2', 'F5:6 D5:2 Bb4:8', 'C5:6 F5:2 A5:4 C6:4', 'G5:12 E5:4', 'D6:6 C6:2 A5:6 F5:2', 'G5:4 F5:4 D5:8', 'Bb4:4 D5:4 G5:4 Bb5:4', 'A5:8 C#6:4 E6:4'] }
    },
    {
      id: 'cup', title: 'チャンピオンシップ', sub: '大会／お祭り', bpm: 128, swing: 0, gain: 0.73, delay: .75, reverb: .3,
      sections: [
        // ニ長調。サビ（drop）は王道進行（IV–V–iii–vi）で、対戦曲ランタイム（ホ短調）と聴き分けられるようにする
        { n: 'intro', bars: 4, prog: ['G', 'A', 'F#m', 'Bm'], drums: { k: 'x...x...x...x...', c: '....x.......x...' }, pad: { kind: 'warm', v: .9 }, arp: { pat: '0123012301230123', kind: 'pluck', v: .5, open: true, center: 64 }, fx: { riserLast: 2 } },
        { n: 'A', bars: 8, prog: ['D', 'A', 'Bm', 'G'], drums: mix(D.four, D.clap24, D.off8, { sh: 'oxoxoxoxoxoxoxox' }), fill: D.fill1, bass: { pat: '..R...R...R...R.', kind: 'pluck', v: 1 },
          pad: { kind: 'warm', v: .75 }, arp: { pat: '0123012301230123', kind: 'pluck', v: .4 }, lead: { mel: 'A', kind: 'pluck', v: 1.1 }, fx: { crashFirst: true } },
        { n: 'build', bars: 4, prog: ['Em', 'F#m', 'G', 'A'], drums: { k: 'x...x...x...x...' }, rollDrums: true, bass: { pat: 'R.R.R.R.R.R.R.R.', kind: 'pluck', v: .8 }, pad: { kind: 'bright', v: .6 }, fx: { riserAll: true } },
        { n: 'drop', bars: 8, prog: ['G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D'], drums: mix(D.four, D.clap24, D.hat16, D.openOff), fill: D.fill1, bass: { pat: '..R...R...R...R.', kind: 'pluck', v: 1 },
          pad: { kind: 'bright', v: .8 }, arp: { pat: '0123012301230123', kind: 'pluck', v: .35 }, lead: { mel: 'B', kind: 'saw', v: 1 }, fx: { crashFirst: true, impactFirst: true } },
        { n: 'break', bars: 4, prog: ['G', 'D', 'Em', 'A'], pad: { kind: 'warm', v: 1 }, arp: { pat: '0..1..2..3..2...', kind: 'bell', v: .6, center: 74 }, fx: { swellLast: true } }
      ],
      loop: 1,
      mel: {
        A: ['D5:2 F#5:2 A5:3 F#5:1 A5:4 D6:4', 'C#6:3 B5:1 A5:4 E5:4 A5:4', 'B5:2 C#6:2 D6:3 C#6:1 B5:4 F#5:4', 'G5:4 A5:4 B5:8',
          'D5:2 F#5:2 A5:3 F#5:1 A5:4 D6:4', 'E6:3 D6:1 C#6:4 A5:4 C#6:4', 'D6:3 C#6:1 B5:4 F#5:2 G5:2 A5:4', 'B5:4 A5:4 G5:4 A5:4'],
        B: ['B5:2 B5:2 D6:2 B5:2 G6:4 F#6:2 D6:2', 'E6:4 C#6:2 A5:2 C#6:4 E6:4', 'F#6:2 E6:2 C#6:2 A5:2 C#6:4 E6:2 C#6:2', 'D6:4 C#6:2 B5:2 F#5:8',
          'B5:2 B5:2 D6:2 B5:2 G6:4 A6:2 G6:2', 'F#6:4 E6:2 C#6:2 E6:4 A6:4', 'F#6:3 E6:3 D6:2 A5:4 D6:4', 'E6:2 F#6:2 A6:4 D6:8']
      }
    }
  ];
  /* 場面 → 曲（おまかせのとき） */
  const SCENE_TRACK = { title: 'boot', lobby: 'lounge', cup: 'cup', draft: 'select', battle: ['runtime', 'overflow'], clutch: 'lastcompile' };

  /* ---------- 1曲を鳴らすシーケンサ ---------- */
  function prepare(track) {
    if (track._ready) return track;
    track.sections.forEach(sec => {
      sec.chords = sec.prog.map(parseChord);
      if (sec.lead) {
        const bars = track.mel[sec.lead.mel] || [];
        sec.melBars = bars.map(parseBar);
      }
    });
    track._ready = true; return track;
  }
  const VEL = { x: .9, X: 1, o: .45 };
  class Seq {
    constructor(track, engine, t0) {
      this.tr = prepare(track); this.e = engine; this.si = 0; this.bar = 0; this.step = 0; this.next = t0; this.barIndex = 0; this.lastLead = null; this.cycle = 0;
      this.spb = 60 / track.bpm / 4;
    }
    get section() { return this.tr.sections[this.si]; }
    /* t までの発音を予約する */
    pump(until) {
      while (this.next < until) { this.play(this.step, this.next); this.advance(); }
    }
    advance() {
      this.next += this.spb; this.step++;
      if (this.step >= 16) {
        this.step = 0; this.bar++; this.barIndex++;
        if (this.bar >= this.section.bars) { this.bar = 0; this.si++; if (this.si >= this.tr.sections.length) { this.si = this.tr.loop; this.cycle++; } }
      }
    }
    /* 次の小節の頭の時刻 */
    nextBarTime() { return this.next + (16 - this.step) % 16 * this.spb; }
    play(step, t0) {
      const tr = this.tr, sec0 = this.section, e = this.e, last = this.bar === sec0.bars - 1, spb = this.spb;
      const sec = this.only ? Object.fromEntries(Object.entries(sec0).filter(([k]) => ['n', 'bars', 'prog', 'chords', 'melBars', this.only, ...(this.only === 'drums' ? ['fill', 'rollDrums', 'timpani'] : [])].includes(k))) : sec0;
      const ch = sec.chords[this.bar % sec.chords.length];
      const t = t0 + (step % 2 ? tr.swing * spb : 0);
      const human = (amt = .004) => (Math.random() - .5) * amt;
      // 小節頭：パッド・効果
      if (step === 0) {
        const fx = sec.fx || {};
        if (this.bar === 0 && fx.crashFirst) e.crash(t, .9);
        if (this.bar === 0 && fx.impactFirst) e.impact(t, .7);
        if (sec.pad) e.pPad(t, voicing(ch, sec.pad.kind === 'choir' ? 62 : 64), spb * 16 * .98, sec.pad.v, sec.pad.kind);
        else for (const k in e.V) if (k.startsWith('pad:')) e.V[k].forEach(v => e.pOff(v.g.gain, t, .25)); // パッドのない区間は鳴らし残さない
        if (fx.riserLast && this.bar === sec.bars - fx.riserLast) e.riser(t, spb * 16 * fx.riserLast, .9);
        if (fx.riserAll && this.bar === 0) e.riser(t, spb * 16 * sec.bars, 1);
        if (fx.swellLast && last) e.swell(t + spb * 8, spb * 8, .8);
      }
      if (sec.fx?.glitch && sec.fx.glitch.includes(this.bar) && step === 13) e.glitch(t, .9);
      // ドラム
      let drums = sec.drums;
      if (last && sec.fill) drums = Object.assign({}, drums, sec.fill);
      if (sec.rollDrums) drums = Object.assign({}, drums, D.roll[Math.min(3, this.bar)]);
      if (drums) {
        for (const lane in drums) {
          const c = drums[lane][step]; if (!c || c === '.' || c === '-') continue;
          const v = (VEL[c] || .9) * (sec.rollDrums && lane === 's' ? .45 + .55 * (this.bar * 16 + step) / (sec.bars * 16) : 1);
          if (lane === 'k') e.pKick(t, v); else if (lane === 's') e.pSnare(t + human(), v); else if (lane === 'c') e.pClap(t + human(), v);
          else if (lane === 'h') e.pHat(t + human(.006), v * (step % 4 === 2 ? 1 : .8)); else if (lane === 'o') e.pHat(t, v, true);
          else if (lane === 'sh') e.pShaker(t + human(.008), v); else if (lane === 'r') e.pRide(t, v); else if (lane === 'p') e.pRim(t + human(), v);
          else if (lane === 't') e.tom(t, [190, 160, 130, 110][Math.floor(step / 4)] || 120, v);
        }
      }
      if (sec.timpani && sec.timpani[step] === 'x') e.timpani(t, mtof(bassNote(ch, 38)), .62);
      // ベース
      if (sec.bass) {
        const p = sec.bass.pat, c = p[step];
        if (c && c !== '.' && c !== '-') {
          let len = 1; while (p[step + len] === '-') len++;
          const root = bassNote(ch, 33);
          const n = c === 'R' ? root : c === 'r' ? root + 12 : root + chordTone(ch, c);
          e.pBass(t, n, len * spb * .92, sec.bass.v * (step % 4 === 0 ? 1 : .85), sec.bass.kind);
        }
      }
      // コードのきざみ
      if (sec.stab && sec.stab.pat[step] === 'x') e.pStab(t, voicing(ch, sec.stab.kind === 'epiano' ? 62 : 67), spb * (sec.stab.kind === 'epiano' ? 2.2 : 1.6), sec.stab.v, sec.stab.kind);
      // アルペジオ
      if (sec.arp) {
        const c = sec.arp.pat[step];
        if (c >= '0' && c <= '9') {
          const v0 = voicing(ch, sec.arp.center ?? 57, 4), notes = [...v0, ...v0.map(n => n + 12)], n = notes[Number(c) % notes.length];
          let len = 1; while (sec.arp.pat[step + len] === '-') len++;
          let v = sec.arp.v * (step % 4 === 0 ? 1 : .78);
          if (sec.arp.open) v *= .4 + .6 * (this.bar * 16 + step) / (sec.bars * 16);
          e.pArp(t + human(.003), n, len * spb, v, sec.arp.kind);
        }
      }
      // メロディ
      if (sec.lead && sec.melBars?.length) {
        const bar = sec.melBars[this.bar % sec.melBars.length];
        for (const note of bar) if (note.step === step) {
          const legato = this.lastLead && this.lastLead.end >= t - .01 && ['saw', 'square', 'chip', 'whistle', 'brass'].includes(sec.lead.kind) && Math.abs(this.lastLead.note - note.note) <= 7;
          e.pLead(t, note.note, note.len * spb * .94, sec.lead.v, sec.lead.kind, legato ? this.lastLead.note : null);
          this.lastLead = { note: note.note, end: t + note.len * spb };
        }
      }
    }
  }

  /* ---------- ジングル ---------- */
  function playJingle(e, name, t) {
    const ch = (notes, at, dur, v, kind) => e.stab(t + at, notes.map(midi), dur, v, kind);
    if (name === 'vs') {
      e.impact(t, 1); e.timpani(t, mtof(38), 1);
      e.pad(t, ['D3', 'A3', 'D4', 'F4'].map(midi), .5, 1.4, 'bright');
      e.riser(t + .05, .55, .7);
      e.crash(t + .62, 1); e.kick(t + .62, 1, { duck: 0 });
      for (const n of ['A3', 'C#4', 'E4', 'A4']) e.lead(t + .62, midi(n), 1.2, .8, 'brass');
      return 2.2;
    }
    if (name === 'draw') {
      const n = 26;
      for (let i = 0; i < n; i++) { const s = t + 2.4 * (1 - Math.pow(1 - i / n, 1.6)); e.snare(s, .25 + .6 * i / n, { rev: .1 }); }
      e.riser(t, 2.4, .8);
      return 2.6;
    }
    if (name === 'draw-done') {
      e.crash(t, 1); e.kick(t, 1, { duck: 0 }); e.impact(t, .6);
      for (const n of ['G3', 'B3', 'D4', 'G4']) e.lead(t, midi(n), 1.1, .7, 'saw');
      for (const [i, n] of ['G5', 'B5', 'D6', 'G6'].entries()) e.arp(t + .12 + i * .09, midi(n), .3, .8, 'bell');
      return 1.8;
    }
    if (name === 'champion') {
      // 大会曲（ニ長調）の上で鳴るので、ハ長調で書いた譜面を全音上げて鳴らす
      const beat = .2, tp = n => midi(n) + 2;
      [['G4', 0, .6], ['G4', 1, .6], ['G4', 2, .6], ['C5', 3, 2.6], ['E5', 6, .8], ['D5', 7, .8], ['C5', 8, 1.5], ['G5', 10, 5]].forEach(([n, at, len]) => {
        e.lead(t + at * beat, tp(n), len * beat, 1, 'brass'); e.lead(t + at * beat, tp(n) - 12, len * beat, .5, 'brass');
      });
      e.timpani(t, mtof(45), .8); e.timpani(t + 3 * beat, mtof(38), 1); e.timpani(t + 10 * beat, mtof(45), 1);
      e.crash(t + 10 * beat, 1); e.kick(t + 10 * beat, 1, { duck: 0 }); e.impact(t + 10 * beat, .7);
      e.pad(t + 3 * beat, ['C4', 'E4', 'G4', 'C5'].map(tp), 7 * beat, 1.2, 'choir');
      e.pad(t + 10 * beat, ['C4', 'E4', 'G4', 'C5'].map(tp), 2.6, 1.2, 'choir');
      e.pad(t + 10 * beat, ['C3', 'G3', 'C4', 'E4'].map(tp), 2.6, 1.3, 'bright');
      ['C6', 'E6', 'G6', 'C7', 'G6', 'E6', 'C6'].forEach((n, i) => e.arp(t + 10 * beat + .1 + i * .11, tp(n), .4, .7, 'bell'));
      return 4.6;
    }
    return 0;
  }

  /* ---------- 再生管理（ライブ） ---------- */
  const P = { ctx: null, dest: null, choice: 'auto', scene: 'title', cur: null, timer: 0, battlePick: null, level: 1, jingleBus: null };
  function trackById(id) { return TRACKS.find(t => t.id === id) || null; }
  function wantedTrack() {
    if (P.choice !== 'auto') return trackById(P.choice) || TRACKS[0];
    const m = SCENE_TRACK[P.scene] || 'boot';
    if (Array.isArray(m)) { if (!P.battlePick) P.battlePick = m[Math.floor(Math.random() * m.length)]; return trackById(P.battlePick); }
    return trackById(m);
  }
  function startTrack(track, at) {
    const e = new Engine(P.ctx, P.dest, { bpm: track.bpm, delayBeats: track.delay, reverb: track.reverb });
    e.fadeIn(at, .9, track.gain);
    P.cur = { track, e, seq: new Seq(track, e, at) };
  }
  function switchTo(track) {
    const ctx = P.ctx, now = ctx.currentTime;
    const old = P.cur;
    if (!old) { startTrack(track, now + .08); return; }
    // 小節の頭（ただし2秒以内）で入れ替える
    let at = old.seq.nextBarTime(); if (at - now > 2.2 || at < now + .05) at = now + .12;
    old.e.fadeOut(at - .05, 1.4);
    old.dead = true;
    setTimeout(() => old.e.dispose(), (at - now + 1.8) * 1000);
    startTrack(track, at);
  }
  function tick() {
    if (!P.ctx) return;
    if (P.ctx.state !== 'running') return;
    const want = wantedTrack();
    if (!P.cur || P.cur.track !== want) switchTo(want);
    const now = P.ctx.currentTime, seq = P.cur.seq;
    if (seq.next < now - .25) { const skip = Math.ceil((now - seq.next) / seq.spb); for (let i = 0; i < skip; i++) seq.advance(); }
    seq.pump(now + 1.4);
  }
  function start() { if (!P.ctx) return; if (!P.timer) P.timer = setInterval(tick, 200); tick(); }
  function stop() {
    clearInterval(P.timer); P.timer = 0;
    if (P.cur) { const c = P.cur; P.cur = null; try { c.e.fadeOut(P.ctx.currentTime, .4); } catch (e) {} setTimeout(() => c.e.dispose(), 800); }
  }
  function setScene(scene) {
    if (!scene || scene === P.scene) return;
    if (scene === 'battle' && P.scene !== 'clutch') P.battlePick = null; // 対戦ごとに曲を選び直す
    P.scene = scene;
    if (P.timer) tick();
  }
  function jingle(name) {
    if (!P.ctx || P.ctx.state !== 'running') return;
    if (!P.jingleBus || P.jingleBus.ctx !== P.ctx) {
      const e = new Engine(P.ctx, P.dest, { bpm: 120, reverb: .35 }); e.out.gain.value = .75; P.jingleBus = e;
    }
    const t = P.ctx.currentTime + .03, len = playJingle(P.jingleBus, name, t);
    if (P.cur && len) { const g = P.cur.e.out.gain, lvl = P.cur.track.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(.0001, g.value), t); g.linearRampToValueAtTime(lvl * .25, t + .1); g.setValueAtTime(lvl * .25, t + len); g.linearRampToValueAtTime(lvl, t + len + .8); }
  }

  /* ---------- テスト用：オフライン描画 ---------- */
  async function renderOffline(id, seconds = 30, { sampleRate = 44100, startSection = 0, jingleName = null, only = null, raw = false } = {}) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(sampleRate * seconds), sampleRate);
    if (jingleName) { const e = new Engine(ctx, ctx.destination, { bpm: 120 }); e.out.gain.value = .75; playJingle(e, jingleName, .05); return ctx.startRendering(); }
    const track = trackById(id), e = new Engine(ctx, ctx.destination, { bpm: track.bpm, delayBeats: track.delay, reverb: track.reverb, raw: raw || !!only });
    e.out.gain.value = track.gain;
    const seq = new Seq(track, e, .05); seq.si = startSection; seq.only = only;
    seq.pump(seconds - .2);
    return ctx.startRendering();
  }

  globalThis.COMPILE_MUSIC = Object.freeze({
    attach(ctx, dest) { if (P.ctx !== ctx || P.dest !== dest) { stop(); P.ctx = ctx; P.dest = dest; P.jingleBus = null; } },
    start, stop, setScene, jingle,
    setChoice(id) { P.choice = id === 'auto' || trackById(id) ? id : 'auto'; if (P.timer) tick(); },
    tracks: () => TRACKS.map(t => ({ id: t.id, title: t.title, sub: t.sub, bpm: t.bpm })),
    state: () => ({ scene: P.scene, choice: P.choice, track: P.cur?.track.id || null, section: P.cur ? P.cur.seq.section.n : null, bar: P.cur?.seq.bar ?? null, running: !!P.timer }),
    renderOffline, _data: { TRACKS, parseBar, parseChord, voicing }
  });
})();
