/* ---------- 音（WebAudio で合成） ---------- */
const Sound = (() => {
  let ctx = null, master = null, nbuf = null, on = true, amb = null;
  function init() {
    if (ctx) return true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return false; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ctx.destination);
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function unlock() { if (!init()) return; if (ctx.state === 'suspended') ctx.resume(); if (musWant && on) startMusic(); }
  function env(gain, t0, a, peak, dur) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noise(t0, dur, type, f0, f1, peak, a = 0.01, q = 0.8) {
    const src = ctx.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0); flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const gn = ctx.createGain(); env(gn, t0, a, peak, dur);
    src.connect(flt); flt.connect(gn); gn.connect(master);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  function tone(t0, dur, type, f0, f1, peak, a = 0.01, dest) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    const gn = ctx.createGain(); env(gn, t0, a, peak, dur);
    o.connect(gn); gn.connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  let shaper = null;
  function dist() {
    if (shaper) return shaper;
    shaper = ctx.createWaveShaper();
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((3 + 20) * x * 20 * (Math.PI / 180)) / (Math.PI + 20 * Math.abs(x)); }
    shaper.curve = c;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    shaper.connect(lp); lp.connect(master);
    return shaper;
  }
  const BREATH = { fire: ['bandpass', 900, 500, 0.5], poison: ['highpass', 2600, 1800, 0.25], thunder: ['highpass', 3200, 2000, 0.3], curse: ['bandpass', 380, 220, 0.5], shock: ['lowpass', 600, 300, 0.5] };
  function play(name, o = {}) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'step': { const k = clamp((o.size || 50) / 70, 0.4, 1.6); tone(t, 0.35, 'sine', 70 / k, 28, 0.55 * k); noise(t, 0.3, 'lowpass', 220, 60, 0.35 * k); break; }
      case 'smash': noise(t, 0.3, 'bandpass', 700, 200, 0.35); tone(t, 0.2, 'sine', 90, 40, 0.3); break;
      case 'crack': noise(t, 0.14, 'highpass', 2400, 1200, 0.12); break;
      case 'collapse': { const k = clamp((o.size || 40) / 80, 0.4, 2); noise(t, 1.6 + k, 'lowpass', 260, 60, 0.45 * Math.min(1.2, k), 0.15); for (let i = 0; i < 5; i++) noise(t + Math.random() * 1.2, 0.12, 'bandpass', 1600, 900, 0.08, 0.005, 2); break; }
      case 'boom': { const k = clamp((o.size || 40) / 60, 0.3, 2); noise(t, 0.8 + k * 0.6, 'lowpass', 500, 60, 0.5 * Math.min(1.3, k), 0.008); tone(t, 0.6 + k * 0.3, 'sine', 80, 30, 0.45 * Math.min(1.2, k)); break; }
      case 'roar': {
        const big = o.big ? 1.3 : 1, dur = o.dying ? 2.4 : 1.5 * big;
        const d = dist();
        const f = o.dying ? 95 : 120 / big;
        tone(t, dur, 'sawtooth', f, f * (o.dying ? 0.35 : 0.6), 0.3, 0.12, d);
        tone(t, dur, 'sawtooth', f * 1.03, f * 0.58, 0.25, 0.15, d);
        tone(t, dur * 0.9, 'square', f * 0.5, f * 0.3, 0.12, 0.2, d);
        noise(t, dur, 'bandpass', 600, 250, 0.18, 0.1, 1.5);
        // サブベース（40Hz台）とフォルマント的な帯域で厚みを足す
        tone(t, dur * 1.05, 'sine', 46, 33, 0.5 * big, 0.09);
        tone(t + 0.05, dur * 0.8, 'sine', 92, 66, 0.16, 0.1);
        noise(t, dur, 'bandpass', 850, 320, 0.14, 0.08, 4.5);
        noise(t + 0.1, dur * 0.7, 'bandpass', 1500, 700, 0.07, 0.12, 6);
        break;
      }
      case 'forge': {
        // 金属の打撃＋小さな咆哮：部位換装の手触り
        noise(t, 0.08, 'highpass', 3200, 2400, 0.16, 0.002, 1.2);
        tone(t, 0.35, 'square', 1240, 1180, 0.05, 0.002);
        tone(t, 0.5, 'triangle', 622, 610, 0.05, 0.002);
        tone(t + 0.11, 0.22, 'square', 1860, 1750, 0.035, 0.002);
        noise(t + 0.11, 0.06, 'highpass', 4200, 3000, 0.1, 0.002, 1.2);
        const d = dist();
        tone(t + 0.05, 0.55, 'sawtooth', 110, 62, 0.14, 0.06, d);
        tone(t + 0.05, 0.6, 'sine', 44, 36, 0.22, 0.05);
        break;
      }
      case 'breath': { const b = BREATH[o.elem] || BREATH.fire; noise(t, o.dur || 2.4, b[0], b[1], b[2], b[3], 0.2, 0.7); if (o.elem === 'thunder') for (let i = 0; i < 6; i++) noise(t + Math.random() * 2, 0.06, 'highpass', 4000, 3000, 0.15); break; }
      case 'thunder': noise(t, 0.12, 'highpass', 2500, 1500, 0.4, 0.002); noise(t + 0.05, 1.6, 'lowpass', 200, 60, 0.4, 0.05); break;
      case 'shot': noise(t, 0.05, 'bandpass', 2000, 1500, 0.06, 0.002, 1.2); break;
      case 'laser': tone(t, 0.16, 'sine', 1900, 500, 0.06); break;
      case 'splash': noise(t, 0.45, 'bandpass', 900, 400, 0.25, 0.01, 1); break;
      case 'alarm': for (let i = 0; i < 4; i++) tone(t + i * 0.3, 0.25, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.05, 0.01); break;
      case 'charge': tone(t, 2.2, 'sine', 180, 1400, 0.07, 0.3); break;
      case 'shatter': noise(t, 0.5, 'highpass', 5000, 3000, 0.2); break;
      case 'shield': tone(t, 0.12, 'sine', 420, 300, 0.05); break;
      case 'power': tone(t, 1.2, 'sawtooth', 120, 30, 0.12, 0.01); break;
      case 'slash': noise(t, 0.22, 'highpass', 3500, 6000, 0.2, 0.005); break;
      case 'wing': for (let i = 0; i < 3; i++) noise(t + i * 0.25, 0.22, 'lowpass', 400, 120, 0.25, 0.05); break;
      case 'ui': tone(t, 0.06, 'sine', 520, 380, 0.08); break;
      case 'buy': tone(t, 0.12, 'triangle', 660, 660, 0.1); tone(t + 0.08, 0.2, 'triangle', 990, 990, 0.1); break;
      case 'bad': tone(t, 0.25, 'sawtooth', 160, 90, 0.08); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.09, 0.3, 'triangle', f, f, 0.08)); break;
      default: break;
    }
  }
  /* ---------- ダイナミックBGM（WebAudio合成） ---------- */
  // mode: 'temple' 魔神殿 / 'battle' 侵攻・レイド / 'kodoku' 蠱毒。intensity 0..1 で層が増減する。
  const MUS_ROOTS = { temple: [55, 55, 43.65, 49], battle: [55, 43.65, 65.41, 49], kodoku: [55, 55, 51.91, 46.25] }; // A, F, C, G 系
  const MUS_TEMPO = { temple: 66, battle: 112, kodoku: 92 };
  const MUS_SCALE = [0, 3, 5, 7, 10, 12, 15]; // 短調ペンタ＋α（半音数）
  let mus = null, musWant = null;
  function musTone(dest, t0, dur, type, f0, f1, peak, a = 0.02) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function musNoise(dest, t0, dur, f0, peak) {
    const src = ctx.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = f0;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(gn); gn.connect(dest);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }
  function startMusic() {
    if (!musWant || !on || !ctx || ctx.state !== 'running') return;
    const mode = musWant.mode;
    if (mus && mus.mode === mode) { setMusicIntensity(musWant.intensity); return; }
    stopMusicNodes();
    stopAmbient();
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    g.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'temple' ? 700 : 1400; lp.connect(g);
    const layers = {};
    for (const k of ['drone', 'bass', 'perc', 'lead']) { const lg = ctx.createGain(); lg.gain.value = 0; lg.connect(lp); layers[k] = lg; }
    mus = { mode, step: 0, next: ctx.currentTime + 0.06, timer: null, gain: g, layers, walk: 2 };
    setMusicIntensity(musWant.intensity);
    const stepDur = 60 / MUS_TEMPO[mode] / 2; // 8分音符
    const tick = () => {
      if (!mus || mus.mode !== mode) return;
      const ahead = ctx.currentTime + 0.18;
      while (mus.next < ahead) { scheduleStep(mus, mus.step, mus.next, stepDur); mus.step++; mus.next += stepDur; }
      mus.timer = setTimeout(tick, 60);
    };
    tick();
  }
  function scheduleStep(m, step, t0, stepDur) {
    const roots = MUS_ROOTS[m.mode];
    const bar = Math.floor(step / 8), s8 = step % 8, root = roots[bar % roots.length];
    const inten = musWant ? musWant.intensity : 0.4;
    if (s8 === 0) { // 小節頭：ドローン／パッド（ルート＋5度＋短3度）
      const dur = stepDur * 8;
      for (const [semi, pk] of [[0, 0.16], [7, 0.09], [3, 0.07]]) {
        const f = root * 2 * Math.pow(2, semi / 12);
        musTone(m.layers.drone, t0, dur, 'triangle', f, f, pk, 0.4);
        musTone(m.layers.drone, t0, dur, 'sine', f * 1.005, f, pk * 0.6, 0.5);
      }
      if (m.mode === 'temple') musTone(m.gain, t0 + 0.02, 3.2, 'sine', root * 8, root * 8 * 0.995, 0.028, 0.005); // 鐘の倍音
    }
    if (m.mode !== 'temple') {
      // 低音パルス（和太鼓＋ベース）
      if (s8 % 2 === 0) musTone(m.layers.bass, t0, stepDur * 1.6, 'sine', root * 2, root * 1.5, 0.30, 0.01);
      if (s8 === 6) musTone(m.layers.bass, t0, stepDur, 'sine', root * 2 * Math.pow(2, 3 / 12), root * 1.8, 0.18, 0.01);
      // 打楽器：四つ打ちの太鼓と裏拍のノイズ
      if (inten > 0.3 && s8 % 4 === 0) { musTone(m.layers.perc, t0, 0.32, 'sine', 95, 38, 0.5, 0.004); musNoise(m.layers.perc, t0, 0.25, 300, 0.20); }
      if (inten > 0.55 && s8 % 4 === 2) { musTone(m.layers.perc, t0, 0.2, 'sine', 130, 55, 0.28, 0.004); }
      if (inten > 0.75 && s8 % 2 === 1) musNoise(m.layers.perc, t0, 0.05, 5200, 0.05);
    } else if (s8 === 4 && Math.random() < 0.5) {
      musTone(m.layers.bass, t0, stepDur * 3, 'sine', root, root * 0.99, 0.20, 0.05); // 静かな地鳴り
    }
    // 旋律断片：強度が高い時だけ、スケール内を歩く
    if (inten > 0.5 && (s8 === 2 || s8 === 5 || s8 === 7) && Math.random() < (m.mode === 'temple' ? 0.35 : 0.75)) {
      m.walk = clamp(m.walk + pick([-2, -1, -1, 0, 1, 1, 2]), 0, MUS_SCALE.length - 1);
      const f = root * 4 * Math.pow(2, MUS_SCALE[m.walk] / 12);
      musTone(m.layers.lead, t0, stepDur * (s8 === 7 ? 2.4 : 1.4), m.mode === 'kodoku' ? 'sawtooth' : 'triangle', f, f, m.mode === 'kodoku' ? 0.05 : 0.085, 0.03);
    }
  }
  function setMusicIntensity(v) {
    if (!mus) return;
    const i = clamp(v == null ? 0.4 : v, 0, 1), t = ctx.currentTime;
    const L = mus.layers, temple = mus.mode === 'temple';
    L.drone.gain.setTargetAtTime(temple ? 0.5 : 0.3 + i * 0.3, t, 0.4);
    L.bass.gain.setTargetAtTime(temple ? 0.12 + i * 0.2 : 0.25 + i * 0.55, t, 0.4);
    L.perc.gain.setTargetAtTime(temple ? 0 : i * i * 0.9, t, 0.4);
    L.lead.gain.setTargetAtTime(i <= 0.5 ? i * 0.4 : 0.2 + (i - 0.5) * 1.2, t, 0.4);
  }
  function stopMusicNodes() {
    if (!mus) return;
    clearTimeout(mus.timer);
    try { mus.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15); const g = mus.gain; setTimeout(() => { try { g.disconnect(); } catch (e) { /* 済 */ } }, 700); } catch (e) { /* 済 */ }
    mus = null;
  }
  function music(mode, intensity) {
    if (!mode || mode === 'off') { musWant = null; stopMusicNodes(); return; }
    musWant = { mode, intensity: intensity == null ? 0.4 : intensity };
    if (!on) { stopMusicNodes(); return; }
    if (!ctx || ctx.state !== 'running') { stopMusicNodes(); return; } // unlock 時に開始
    if (mus && mus.mode === mode) { setMusicIntensity(musWant.intensity); return; }
    startMusic();
  }
  function stopMusic() { musWant = null; stopMusicNodes(); }

  function ambient(kind) {
    stopMusicNodes(); musWant = null;
    stopAmbient();
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(kind === 'medieval' ? 1 : 0.0001, t);
    if (kind !== 'medieval') g.gain.exponentialRampToValueAtTime(0.05, t + 2);
    g.connect(master);
    const nodes = [g];
    if (kind === 'modern') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 780;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.22; const lg = ctx.createGain(); lg.gain.value = 170;
      lfo.connect(lg); lg.connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(lp); lp.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
    } else if (kind === 'future') {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 330;
      const gate = ctx.createGain(); gate.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.1; const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(gate.gain);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(gate); gate.connect(lp); lp.connect(g); o.start(); lfo.start(); nodes.push(o, lfo);
    } else {
      const bell = () => { if (!amb || amb.kind !== 'medieval') return; const tt = ctx.currentTime; [220, 440, 587, 880].forEach((f, i) => tone(tt, 3.5 - i * 0.6, 'sine', f, f * 0.995, 0.05 / (i + 1), 0.005, g)); amb.timer = setTimeout(bell, 2600 + Math.random() * 1800); };
      amb = { kind, nodes, timer: null };
      bell();
      return;
    }
    amb = { kind, nodes, timer: null };
  }
  function stopAmbient() {
    if (!amb) return;
    clearTimeout(amb.timer);
    for (const n of amb.nodes) { try { if (n.stop) n.stop(); else n.disconnect(); } catch (e) { /* 既に停止 */ } }
    amb = null;
  }
  return {
    unlock, play, ambient, stopAmbient, music, stopMusic,
    get on() { return on; },
    set on(v) { on = v; if (!v) { stopAmbient(); stopMusic(); } else if (musWant) startMusic(); },
  };
})();
