/* ナナフシギ・デュエル — the flourish layer: a full-screen 2D canvas for sparks, coins, confetti and fireworks drawn
   over the 3D table and the HTML, plus synthesized sound (Web Audio, no files). */

export function createFX(cv) {
  const x = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const parts = [];
  let running = false, last = 0, reduce = false;
  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  size();
  window.addEventListener('resize', size);
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function add(p) { if (parts.length > 900) return; parts.push(Object.assign({ life: 1, age: 0, vx: 0, vy: 0, g: 0, drag: 0.98, size: 4, rot: 0, vr: 0, alpha: 1 }, p)); kick(); }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.delay && p.age < p.delay) continue;
      const t = (p.age - (p.delay || 0)) / p.life;
      if (t >= 1) { parts.splice(i, 1); if (p.done) p.done(); continue; }
      if (p.to) {   // homing (coins flying to a counter)
        const k = p.ez ? p.ez(t) : t * t * (3 - 2 * t);
        p.x = p.x0 + (p.to.x - p.x0) * k + Math.sin(t * Math.PI) * (p.arc || 0);
        p.y = p.y0 + (p.to.y - p.y0) * k - Math.sin(t * Math.PI) * (p.lift || 80);
      } else {
        p.vy += p.g * dt; p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      p.rot += p.vr * dt;
      const a = p.alpha * (p.fade === false ? 1 : t < 0.15 && p.fadeIn ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4));
      x.globalAlpha = Math.max(0, a);
      draw(p, t);
    }
    x.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop); else { running = false; x.clearRect(0, 0, W, H); }
  }
  function draw(p, t) {
    switch (p.kind) {
      case 'spark': {
        x.globalCompositeOperation = 'lighter';
        const r = p.size * (1 - t * 0.6);
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, r * 3, 0, 7); x.fill();
        x.globalCompositeOperation = 'source-over';
        break;
      }
      case 'streak': {
        x.globalCompositeOperation = 'lighter';
        x.strokeStyle = p.color; x.lineWidth = p.size; x.lineCap = 'round';
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); x.stroke();
        x.globalCompositeOperation = 'source-over';
        break;
      }
      case 'coin': {
        x.save(); x.translate(p.x, p.y); x.scale(Math.cos(p.rot), 1);
        const r = p.size;
        const g = x.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        g.addColorStop(0, '#fff3b5'); g.addColorStop(0.5, '#f2c339'); g.addColorStop(1, '#9a6a08');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
        x.strokeStyle = '#7a4f05'; x.lineWidth = r * 0.15; x.stroke();
        x.restore();
        break;
      }
      case 'confetti': {
        x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.scale(1, Math.cos(p.rot * 1.7));
        x.fillStyle = p.color; x.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        x.restore();
        break;
      }
      case 'ring': {
        x.globalCompositeOperation = 'lighter';
        x.strokeStyle = p.color; x.lineWidth = p.width * (1 - t);
        x.beginPath(); x.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - t, 3)), 0, 7); x.stroke();
        x.globalCompositeOperation = 'source-over';
        break;
      }
      case 'text': {
        x.save(); x.translate(p.x, p.y - t * (p.rise || 50)); const s = 1 + (t < 0.15 ? (1 - t / 0.15) * 0.8 : 0); x.scale(s, s);
        x.font = p.font; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 6; x.strokeStyle = 'rgba(10,6,2,.85)'; x.strokeText(p.text, 0, 0);
        x.fillStyle = p.color; x.fillText(p.text, 0, 0);
        x.restore();
        break;
      }
      case 'ember': {
        x.globalCompositeOperation = 'lighter';
        x.fillStyle = p.color; x.beginPath(); x.arc(p.x, p.y, p.size * (1 - t), 0, 7); x.fill();
        x.globalCompositeOperation = 'source-over';
        break;
      }
      case 'flash': {
        const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); x.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }
  const R = (a, b) => a + Math.random() * (b - a);
  const api = {
    set reduced(v) { reduce = v; },
    burst(px, py, o) {
      o = o || {};
      const n = reduce ? Math.ceil((o.n || 30) / 3) : o.n || 30, cols = o.colors || ['#ffe7a6', '#ffd05a', '#fff'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = R(o.min || 80, o.max || 420);
        add({ kind: o.kind || 'spark', x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), g: o.g != null ? o.g : 260, drag: 0.93, life: R(0.5, o.life || 1.1), size: R(2, o.size || 5), color: cols[i % cols.length] });
      }
      add({ kind: 'flash', x: px, y: py, r: o.flash || 140, life: 0.35, color: (o.colors || ['rgba(255,220,140,.8)'])[0] });
    },
    ring(px, py, color, r1, w) { add({ kind: 'ring', x: px, y: py, r0: 10, r1: r1 || 160, width: w || 10, life: 0.7, color: color || '#ffd27a' }); },
    text(px, py, text, color, sz, life) { add({ kind: 'text', x: px, y: py, text, color: color || '#ffe7a6', font: '900 ' + (sz || 30) + 'px "Zen Kaku Gothic New","Hiragino Sans",sans-serif', life: life || 1.4, rise: 46, fade: true }); },
    coins(from, to, n, onEach) {
      n = Math.min(n, 14);
      for (let i = 0; i < n; i++) {
        add({ kind: 'coin', x0: from.x + R(-20, 20), y0: from.y + R(-10, 10), x: from.x, y: from.y, to: { x: to.x + R(-6, 6), y: to.y + R(-4, 4) }, life: R(0.55, 0.8), delay: i * 0.05, size: R(7, 10), vr: R(8, 14), arc: R(-60, 60), lift: R(40, 120), fade: false,
          done: () => { api.burst(to.x, to.y, { n: 4, min: 30, max: 120, life: 0.4, g: 0, flash: 30 }); if (onEach) onEach(); } });
      }
    },
    shower(px, py, n) {
      for (let i = 0; i < (reduce ? n / 3 : n); i++) add({ kind: 'coin', x: px + R(-30, 30), y: py, vx: R(-160, 160), vy: R(-380, -120), g: 900, drag: 0.99, life: R(0.8, 1.3), size: R(6, 10), vr: R(6, 14) });
    },
    embers(px, py, n, color) {
      for (let i = 0; i < (reduce ? n / 3 : n); i++) add({ kind: 'ember', x: px + R(-40, 40), y: py + R(-50, 50), vx: R(-40, 40), vy: R(-160, -40), g: -40, drag: 0.98, life: R(0.6, 1.4), size: R(2, 5), color: color || (Math.random() < 0.5 ? '#ff8a2a' : '#ffcf5a') });
    },
    confetti(n) {
      const cols = ['#ffd05a', '#ff6d5c', '#5fc6ff', '#7dffb0', '#c79bff', '#fff3d6'];
      for (let i = 0; i < (reduce ? n / 3 : n); i++) add({ kind: 'confetti', x: R(0, W), y: R(-H * 0.4, -10), vx: R(-60, 60), vy: R(60, 220), g: 120, drag: 0.995, life: R(2.6, 4.6), size: R(8, 15), rot: R(0, 6), vr: R(-8, 8), color: cols[i % cols.length], fade: true });
    },
    firework(px, py, color) {
      const c2 = color || ['#ffd05a', '#ff6d5c', '#5fc6ff', '#7dffb0', '#c79bff'][Math.floor(Math.random() * 5)];
      add({ kind: 'streak', x: px, y: H + 10, vx: 0, vy: -(H + 10 - py) * 1.6, g: 0, drag: 0.94, life: 0.5, size: 3, color: '#fff6dc', done: () => {
        const n = reduce ? 20 : 70;
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, s = R(180, 340); add({ kind: 'streak', x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 160, drag: 0.95, life: R(0.9, 1.5), size: 2.5, color: c2 }); }
        add({ kind: 'flash', x: px, y: py, r: 220, life: 0.4, color: c2 });
        api.sound && api.sound('boom');
      } });
    },
    vignette(color, ms) {
      const el = document.getElementById('vignette'); if (!el) return;
      el.style.setProperty('--vc', color); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms || 700);
    },
    size
  };
  return api;
}

/* ================================================================== sound */
export function createSound() {
  let ctx = null, master = null, sfxGain = null, bgmGain = null, bgmOn = false, sfxOn = true, bgmTimer = null, noiseBuf = null;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(comp);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0; bgmGain.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function tone(freq, t, dur, type, vol, dest, attack, glideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + (attack || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, freq, q, vol, type) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const SFX = {
    tap(t) { tone(880, t, 0.06, 'triangle', 0.08); },
    deal(t) { noise(t, 0.08, 2400, 1.2, 0.08); },
    swish(t) { noise(t, 0.22, 1800, 0.8, 0.2); },
    build(t) { [60, 64, 67, 72].forEach((m, i) => tone(N(m + 12), t + i * 0.05, 0.5, 'triangle', 0.12)); noise(t, 0.12, 3000, 1, 0.08); },
    coin(t) { tone(1760, t, 0.09, 'square', 0.04); tone(2637, t + 0.05, 0.16, 'square', 0.035); },
    coins(t) { for (let i = 0; i < 5; i++) { tone(1600 + Math.random() * 1200, t + i * 0.05, 0.1, 'square', 0.03); } },
    discard(t) { noise(t, 0.4, 700, 0.7, 0.25, 'lowpass'); tone(220, t, 0.3, 'sawtooth', 0.04, null, 0.01, 110); },
    sword(t) { noise(t, 0.35, 5200, 3, 0.35); tone(1240, t, 0.4, 'triangle', 0.08, null, 0.002, 980); tone(1870, t, 0.3, 'sine', 0.05); },
    drum(t) { tone(90, t, 0.35, 'sine', 0.5, null, 0.003, 45); noise(t, 0.12, 300, 0.8, 0.2, 'lowpass'); },
    loot(t) { SFX.sword(t); for (let i = 0; i < 6; i++) tone(2400 - i * 180, t + 0.1 + i * 0.04, 0.12, 'square', 0.03); },
    science(t) { [72, 76, 79, 84, 88].forEach((m, i) => tone(N(m), t + i * 0.07, 0.6, 'sine', 0.09)); },
    pair(t) { [79, 84, 88, 91].forEach((m, i) => tone(N(m), t + i * 0.06, 0.8, 'triangle', 0.1)); },
    token(t) { [67, 74, 79, 86].forEach((m, i) => tone(N(m), t + i * 0.08, 0.7, 'sine', 0.1)); },
    reveal(t) { tone(N(84), t, 0.3, 'sine', 0.06); tone(N(91), t + 0.04, 0.3, 'sine', 0.04); },
    wonder(t) {
      [[48, 55, 60, 64], [50, 57, 62, 65], [52, 59, 64, 67, 72]].forEach((ch, j) => ch.forEach((m) => { tone(N(m), t + j * 0.42, 1.3, 'sawtooth', 0.035, null, 0.06); tone(N(m + 12), t + j * 0.42, 1.2, 'triangle', 0.03, null, 0.04); }));
      tone(N(36), t, 2, 'sine', 0.3); noise(t + 0.84, 1.4, 6000, 0.5, 0.06, 'highpass');
    },
    age(t) { tone(N(43), t, 2.2, 'sine', 0.35); [55, 62, 67, 74].forEach((m, i) => tone(N(m), t + 0.2 + i * 0.16, 1.4, 'triangle', 0.07, null, 0.05)); noise(t, 1.5, 400, 0.6, 0.12, 'lowpass'); },
    turn(t) { tone(N(76), t, 0.25, 'sine', 0.08); tone(N(83), t + 0.08, 0.35, 'sine', 0.07); },
    again(t) { [72, 79, 84].forEach((m, i) => tone(N(m), t + i * 0.06, 0.4, 'square', 0.04)); },
    warn(t) { tone(N(57), t, 0.3, 'sawtooth', 0.06); tone(N(57), t + 0.35, 0.3, 'sawtooth', 0.06); },
    boom(t) { tone(70, t, 0.6, 'sine', 0.28, null, 0.004, 35); noise(t, 0.5, 1200, 0.5, 0.15, 'lowpass'); },
    win(t) { [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((ch, j) => ch.forEach((m) => { tone(N(m), t + j * 0.28, j === 3 ? 1.8 : 0.5, 'sawtooth', 0.04, null, 0.02); tone(N(m + 12), t + j * 0.28, j === 3 ? 1.6 : 0.4, 'triangle', 0.04); })); tone(N(36), t + 0.84, 2, 'sine', 0.3); },
    lose(t) { [[57, 60, 64], [53, 57, 60], [52, 55, 59], [45, 52, 57]].forEach((ch, j) => ch.forEach((m) => tone(N(m), t + j * 0.42, 0.9, 'triangle', 0.05, null, 0.05))); },
    destroy(t) { noise(t, 0.6, 500, 0.6, 0.3, 'lowpass'); tone(160, t, 0.5, 'sawtooth', 0.06, null, 0.01, 60); },
    revive(t) { [60, 67, 72, 79].forEach((m, i) => tone(N(m), t + i * 0.1, 0.9, 'sine', 0.07, null, 0.08)); }
  };
  /* BGM: a slow lyre arpeggio over a drone, Dorian, generated forever */
  const SCALE = [0, 2, 3, 5, 7, 9, 10];
  let step = 0, chordRoot = 50;
  const ROOTS = [50, 50, 48, 53, 50, 55, 48, 45];
  function bgmTick() {
    if (!ctx || !bgmOn) return;
    const t = ctx.currentTime + 0.05;
    if (step % 16 === 0) {
      chordRoot = ROOTS[(step / 16) % ROOTS.length];
      tone(N(chordRoot - 12), t, 4.6, 'sine', 0.13, bgmGain, 0.6);
      tone(N(chordRoot - 5), t, 4.6, 'sine', 0.06, bgmGain, 0.8);
    }
    if (Math.random() < 0.72) {
      const deg = [0, 2, 4, 6, 7, 4, 2, 9][step % 8] + (Math.random() < 0.2 ? 2 : 0);
      const oct = Math.floor(deg / 7), m = chordRoot + 12 + SCALE[deg % 7] + oct * 12;
      tone(N(m), t, 1.6, 'triangle', 0.05, bgmGain, 0.005);
      tone(N(m) * 2.005, t, 0.8, 'sine', 0.012, bgmGain, 0.005);
    }
    step++;
    bgmTimer = setTimeout(bgmTick, 290);
  }
  return {
    unlock() { ensure(); },
    play(name) { if (!sfxOn) return; if (!ensure()) return; const f = SFX[name]; if (f) f(ctx.currentTime + 0.01); },
    set sfx(v) { sfxOn = v; }, get sfx() { return sfxOn; },
    set bgm(v) {
      bgmOn = v;
      if (!ensure()) return;
      bgmGain.gain.cancelScheduledValues(ctx.currentTime);
      bgmGain.gain.linearRampToValueAtTime(v ? 0.55 : 0, ctx.currentTime + 1.2);
      clearTimeout(bgmTimer);
      if (v) bgmTick();
    },
    get bgm() { return bgmOn; }
  };
}
