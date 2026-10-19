/* ブラックフライデー — effects: a particle layer on one canvas, synthesized sound (no audio files) and the
   site's background music. Presentation only: nothing here reads or changes the game.
     BF_FX.burst(x, y, kind, opt)      coins / sparks / shards / tape / confetti / rings
     BF_FX.fly(from, to, kind, opt)    something travelling on an arc (coins, gold bars, briefcases)
     BF_FX.rain(kind, ms)              ticker tape or confetti falling over the whole screen
     BF_FX.flash(color, ms)            a full-screen flash
     BF_FX.sfx(name, opt)              a sound;  BF_FX.music.mood('title' | 'game' | 'clutch' | 'off')
   Every effect respects the "effects" setting (0 off, 1 normal, 2 full) and prefers-reduced-motion. */
(function (G) {
  'use strict';
  var REDUCE = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var level = REDUCE ? 0 : 2;                                          // 0 none, 1 light, 2 full
  var COLORS = ['#9657a8', '#eadc25', '#4b973c', '#3271b2', '#f6f4df', '#262323'];
  var cv = null, ctx = null, W = 0, H = 0, DPR = 1, parts = [], running = false, flashes = [];
  var TAU = Math.PI * 2;

  function setup() {
    cv = document.getElementById('fx');
    if (!cv) return false;
    ctx = cv.getContext('2d');
    resize();
    G.addEventListener('resize', resize);
    return true;
  }
  function resize() {
    if (!cv) return;
    DPR = Math.min(2, G.devicePixelRatio || 1);
    W = G.innerWidth; H = G.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pt(p) {                                                    // an element, a rect or {x, y}
    if (!p) return { x: W / 2, y: H / 2 };
    if (p.getBoundingClientRect) { var r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    if (p.width != null && p.left != null) return { x: p.left + p.width / 2, y: p.top + p.height / 2 };
    return p;
  }
  function start() {
    if (running) return;
    running = true;
    var last = performance.now();
    (function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      step(dt);
      draw();
      if (parts.length || flashes.length) requestAnimationFrame(frame);
      else { running = false; ctx && ctx.clearRect(0, 0, cv.width, cv.height); }
    })(last);
  }
  function step(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.path) {
        var u = Math.min(1, p.t / p.dur), e = p.ease ? p.ease(u) : u;
        var a = p.path, inv = 1 - e;
        p.x = inv * inv * a.x0 + 2 * inv * e * a.cx + e * e * a.x1;
        p.y = inv * inv * a.y0 + 2 * inv * e * a.cy + e * e * a.y1;
        p.rot += p.vr * dt;
        if (u >= 1) { if (p.done) p.done(); parts.splice(i, 1); }
        continue;
      }
      p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag;
      if (p.flutter) { p.vx += Math.sin(p.t * p.flutter + p.ph) * 40 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.t > p.life || p.y > H + 60) parts.splice(i, 1);
    }
    for (var j = flashes.length - 1; j >= 0; j--) { flashes[j].t += dt; if (flashes[j].t > flashes[j].dur) flashes.splice(j, 1); }
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    flashes.forEach(function (f) {
      var k = 1 - f.t / f.dur;
      ctx.globalAlpha = Math.max(0, k) * f.a;
      ctx.fillStyle = f.color; ctx.fillRect(0, 0, W, H);
    });
    ctx.globalAlpha = 1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.t < 0) continue;
      var fade = p.path ? 1 : Math.max(0, Math.min(1, (p.life - p.t) / Math.min(0.35, p.life * 0.4)));
      ctx.globalAlpha = fade * (p.alpha == null ? 1 : p.alpha);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      drawPart(p);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function drawPart(p) {
    var s = p.size;
    switch (p.kind) {
      case 'coin': {
        var sx = Math.abs(Math.cos(p.t * p.spin)) * 0.85 + 0.15;
        ctx.scale(sx, 1);
        ctx.fillStyle = '#b8862a'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f6c64a'; ctx.beginPath(); ctx.arc(0, -0.6, s * 0.82, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,248,214,.9)'; ctx.fillRect(-s * 0.5, -s * 0.5, s * 0.35, s * 0.2);
        break;
      }
      case 'bar': {
        ctx.fillStyle = '#8a5e12';
        ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.45); ctx.lineTo(s * 0.8, -s * 0.45); ctx.lineTo(s * 1.05, s * 0.45); ctx.lineTo(-s * 1.05, s * 0.45); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f6c64a';
        ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.36); ctx.lineTo(s * 0.7, -s * 0.36); ctx.lineTo(s * 0.92, s * 0.36); ctx.lineTo(-s * 0.92, s * 0.36); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,248,214,.85)'; ctx.fillRect(-s * 0.55, -s * 0.28, s * 1.0, s * 0.12);
        break;
      }
      case 'case': {
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
        ctx.fillStyle = p.color;
        roundRect(-s, -s * 0.55, s * 2, s * 1.3, s * 0.28); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.55); ctx.lineTo(-s * 0.32, -s * 0.85); ctx.lineTo(s * 0.32, -s * 0.85); ctx.lineTo(s * 0.32, -s * 0.55);
        ctx.strokeStyle = p.color === '#16191b' ? '#d8a441' : 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.6; ctx.stroke();
        if (p.color === '#16191b') { ctx.strokeStyle = '#d8a441'; ctx.lineWidth = 1; roundRect(-s, -s * 0.55, s * 2, s * 1.3, s * 0.28); ctx.stroke(); }
        break;
      }
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter';
        var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.4);
        gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s * 2.4, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'tape': {
        ctx.fillStyle = p.color;
        ctx.fillRect(-s * 0.18, -s * 2.2, s * 0.36, s * 4.4);
        if (p.mark) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-s * 0.1, -s * 1.4, s * 0.2, s * 0.5); ctx.fillRect(-s * 0.1, s * 0.3, s * 0.2, s * 0.7); }
        break;
      }
      case 'confetti': {
        ctx.scale(1, Math.abs(Math.sin(p.t * p.spin)) * 0.9 + 0.1);
        ctx.fillStyle = p.color; ctx.fillRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.7);
        break;
      }
      case 'shard': {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.5, s * 0.8); ctx.closePath(); ctx.fill();
        break;
      }
      case 'ring': {
        var k = p.t / p.life;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, (1 - k) * s * 0.18);
        ctx.beginPath(); ctx.arc(0, 0, s * (0.3 + k * 2.4), 0, TAU); ctx.stroke();
        break;
      }
      case 'text': {
        ctx.font = '700 ' + s + 'px Oswald, "Zen Kaku Gothic New", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,20,24,.9)'; ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
        break;
      }
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function add(p) {
    if (!ctx && !setup()) return;
    parts.push(p);
    start();
  }
  function base(kind, x, y) { return { kind: kind, x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, t: 0, life: 1, size: 6, color: '#fff', spin: 8 }; }

  /* ------------------------------------------------------------------ public effects */
  function burst(at, kind, opt) {
    if (!level) return;
    opt = opt || {};
    var c = pt(at), n = Math.round((opt.n || 14) * (level === 1 ? 0.5 : 1));
    for (var i = 0; i < n; i++) {
      var p = base(kind, c.x + rnd(-4, 4), c.y + rnd(-4, 4));
      var ang = opt.up ? rnd(-Math.PI * 0.92, -Math.PI * 0.08) : rnd(0, TAU), sp = rnd(opt.speed ? opt.speed * 0.5 : 80, opt.speed || 260);
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      p.g = opt.g != null ? opt.g : (kind === 'spark' ? 60 : 620);
      p.drag = kind === 'spark' ? 0.92 : 0.985;
      p.vr = rnd(-9, 9); p.spin = rnd(5, 14);
      p.size = opt.size ? rnd(opt.size * 0.7, opt.size * 1.15) : (kind === 'coin' ? rnd(4.5, 7) : kind === 'spark' ? rnd(2, 4) : kind === 'shard' ? rnd(5, 11) : rnd(4, 8));
      p.life = opt.life || rnd(0.7, 1.3);
      p.color = Array.isArray(opt.color) ? opt.color[i % opt.color.length] : (opt.color || '#ffcf7a');
      p.t = -(opt.stagger || 0) * i;
      add(p);
    }
  }
  function ring(at, color, size, life) {
    if (!level) return;
    var c = pt(at), p = base('ring', c.x, c.y);
    p.size = size || 40; p.life = life || 0.6; p.color = color || '#ffb43f';
    add(p);
  }
  function fly(from, to, kind, opt) {
    opt = opt || {};
    var a = pt(from), b = pt(to);
    if (!level) { if (opt.done) setTimeout(opt.done, 0); return; }
    var n = opt.n || 1;
    for (var i = 0; i < n; i++) {
      var p = base(kind, a.x, a.y);
      var mx = (a.x + b.x) / 2 + rnd(-30, 30), my = Math.min(a.y, b.y) - (opt.arc != null ? opt.arc : 80) - rnd(0, 30);
      p.path = { x0: a.x + rnd(-6, 6), y0: a.y + rnd(-6, 6), cx: mx, cy: my, x1: b.x + rnd(-5, 5), y1: b.y + rnd(-4, 4) };
      p.dur = (opt.ms || 650) / 1000 * rnd(0.88, 1.12);
      p.ease = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
      p.size = opt.size || (kind === 'bar' ? 9 : kind === 'case' ? 9 : 6);
      p.color = Array.isArray(opt.color) ? opt.color[i % opt.color.length] : (opt.color || '#fff');
      p.vr = kind === 'case' ? rnd(-3, 3) : rnd(-6, 6); p.spin = 10;
      p.t = -(opt.stagger != null ? opt.stagger : 0.06) * i;
      if (i === n - 1 && opt.done) p.done = opt.done;
      add(p);
    }
  }
  function rain(kind, ms, colors) {
    if (!level) return;
    var n = Math.round((kind === 'tape' ? 90 : 120) * (level === 1 ? 0.4 : 1)), dur = (ms || 3000) / 1000;
    for (var i = 0; i < n; i++) {
      var p = base(kind, rnd(0, W), rnd(-H * 0.3, -10));
      p.vx = rnd(-30, 30); p.vy = rnd(90, 220); p.g = kind === 'tape' ? 30 : 60; p.drag = 0.995;
      p.flutter = rnd(2, 5); p.ph = rnd(0, TAU); p.vr = rnd(-3, 3); p.spin = rnd(4, 9);
      p.size = kind === 'tape' ? rnd(5, 8) : rnd(5, 9);
      p.color = colors ? colors[i % colors.length] : (kind === 'tape' ? (i % 3 ? '#efe9da' : '#ffe9b0') : COLORS[i % 5]);
      p.mark = kind === 'tape' && i % 2 === 0;
      p.life = dur + rnd(0, 1.2); p.t = -rnd(0, dur * 0.6);
      add(p);
    }
  }
  function flash(color, ms, a) {
    if (!level) return;
    if (!ctx && !setup()) return;
    flashes.push({ color: color || '#fff', dur: (ms || 300) / 1000, t: 0, a: a == null ? 0.6 : a });
    start();
  }
  function floatText(at, text, color, size) {
    if (!level) return;
    var c = pt(at), p = base('text', c.x, c.y);
    p.text = text; p.color = color || '#fff'; p.size = size || 18; p.vy = -60; p.drag = 0.97; p.life = 1.1;
    add(p);
  }
  function shake(el, strength) {
    if (!level || !el) return;
    el.classList.remove('shakeit'); void el.offsetWidth;
    el.style.setProperty('--q', String(strength || 1));
    el.classList.add('shakeit');
    setTimeout(function () { el.classList.remove('shakeit'); }, 520);
  }

  /* ------------------------------------------------------------------ sound */
  var AC = null, master = null, verb = null, verbGain = null, muted = false, vol = 0.7;
  function audio() {
    if (AC) return AC;
    var Ctx = G.AudioContext || G.webkitAudioContext;
    if (!Ctx) return null;
    try {
      AC = new Ctx();
      var comp = AC.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
      comp.connect(AC.destination);
      master = AC.createGain(); master.gain.value = vol; master.connect(comp);
      verb = AC.createConvolver();
      var len = Math.floor(AC.sampleRate * 1.6), ir = AC.createBuffer(2, len, AC.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir; verbGain = AC.createGain(); verbGain.gain.value = 0.32; verb.connect(verbGain); verbGain.connect(master);
    } catch (e) { AC = null; }
    return AC;
  }
  function unlock() { var fresh = !AC, c = audio(); if (c && c.state === 'suspended') c.resume().catch(function () {}); if (fresh && c) music.apply(); }
  function out(wet) { return wet ? [master, verb] : [master]; }
  function tone(f, len, type, v, at, slide, wet) {
    var c = AC, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.15, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); out(wet).forEach(function (n) { g.connect(n); }); o.start(t); o.stop(t + len + 0.03);
  }
  var noiseBuf = null;
  function noise(len, v, freq, at, q, type, wet, sweep) {
    var c = AC, t = c.currentTime + (at || 0);
    if (!noiseBuf) { var n = c.sampleRate * 2; noiseBuf = c.createBuffer(1, n, c.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 2400, t); f.Q.value = q || 0.8;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (freq || 2400) * sweep), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); out(wet).forEach(function (nn) { g.connect(nn); }); src.start(t, Math.random()); src.stop(t + len + 0.05);
  }
  function bell(at, f0, v) {
    [1, 2.76, 5.4, 8.93].forEach(function (m, i) { tone(f0 * m, 1.6 - i * 0.3, 'sine', (v || 0.14) / (i + 1), at, 1, true); });
  }
  var S = {
    tap: function () { tone(1100, 0.04, 'triangle', 0.05); },
    open: function () { tone(660, 0.06, 'triangle', 0.06); tone(990, 0.08, 'triangle', 0.05, 0.04); },
    place: function () { noise(0.05, 0.22, 1300, 0, 1.4); tone(220, 0.06, 'square', 0.04); },
    coin: function (o) { var p = (o && o.pitch) || 1; tone(2093 * p, 0.12, 'square', 0.05); tone(3136 * p, 0.2, 'triangle', 0.05, 0.05); },
    coins: function (o) { var n = Math.min(8, (o && o.n) || 4); for (var i = 0; i < n; i++) { tone(1800 + Math.random() * 1400, 0.09, 'triangle', 0.045, i * 0.055); noise(0.03, 0.08, 6000, i * 0.055, 2); } },
    register: function () { noise(0.07, 0.2, 2500, 0, 2); tone(1568, 0.12, 'triangle', 0.08, 0.06); tone(2349, 0.4, 'sine', 0.08, 0.11, 1, true); },
    gold: function () { tone(1318, 0.5, 'triangle', 0.07, 0, 1, true); tone(1976, 0.6, 'sine', 0.06, 0.07, 1, true); noise(0.18, 0.06, 8000, 0, 3, 'highpass'); },
    clank: function () { tone(420, 0.18, 'square', 0.05, 0, 0.6); noise(0.1, 0.12, 3000, 0, 1); },
    bell: function () { bell(0, 523, 0.16); bell(0.42, 523, 0.13); bell(0.84, 523, 0.11); },
    turn: function () { tone(988, 0.1, 'sine', 0.07); tone(1319, 0.16, 'sine', 0.06, 0.08); },
    myturn: function () { tone(784, 0.12, 'triangle', 0.08); tone(1175, 0.14, 'triangle', 0.08, 0.09); tone(1568, 0.22, 'triangle', 0.07, 0.18, 1, true); },
    deny: function () { tone(160, 0.16, 'sawtooth', 0.06); },
    alert: function () { tone(880, 0.12, 'square', 0.06); tone(660, 0.16, 'square', 0.06, 0.13); },
    rustle: function () { for (var i = 0; i < 6; i++) noise(0.08, 0.14, 1500 + Math.random() * 2500, i * 0.06, 0.9); },
    pop: function (o) { var k = (o && o.i) || 0; tone(420 + k * 70, 0.12, 'sine', 0.12, 0, 1.9); noise(0.04, 0.1, 3000, 0, 1.2); },
    black: function () { tone(70, 0.6, 'sine', 0.38, 0, 0.5); tone(55, 0.9, 'triangle', 0.18, 0.02, 0.6, true); noise(0.3, 0.18, 300, 0, 0.7, 'lowpass', true); },
    tally: function () { tone(660, 0.05, 'square', 0.04); },
    flip: function () { for (var i = 0; i < 5; i++) noise(0.025, 0.12, 2200, i * 0.035, 1.5); },
    rise: function (o) { var k = (o && o.k) || 1; for (var i = 0; i < Math.min(5, k + 1); i++) tone(523 * Math.pow(1.122, i * 2), 0.14, 'triangle', 0.06, i * 0.05); },
    fall: function (o) { var k = (o && o.k) || 1; tone(523, 0.3 + k * 0.06, 'sawtooth', 0.05, 0, 0.45); },
    level: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'square', 0.05, i * 0.09); tone(f / 2, 0.24, 'triangle', 0.06, i * 0.09); }); tone(1568, 0.8, 'triangle', 0.06, 0.38, 1, true); },
    goldup: function () { tone(1046, 0.15, 'triangle', 0.06); tone(1568, 0.3, 'sine', 0.05, 0.06, 1, true); },
    siren: function () { var c = AC, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 700; l.frequency.value = 3.2; lg.gain.value = 220; l.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.05); g.gain.setValueAtTime(0.06, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 2.2); l.stop(t + 2.2); },
    crash: function () { tone(110, 1.4, 'sawtooth', 0.12, 0, 0.25, true); tone(55, 1.8, 'sine', 0.35, 0, 0.6); noise(1.6, 0.4, 900, 0, 0.6, 'lowpass', true, 0.1); noise(0.4, 0.25, 4000, 0.02, 0.9, 'bandpass', true); },
    glass: function () { for (var i = 0; i < 9; i++) tone(2400 + Math.random() * 3000, 0.25, 'triangle', 0.03, i * 0.03 + Math.random() * 0.03, 1, true); noise(0.35, 0.18, 6000, 0, 1.2, 'highpass'); },
    win: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, i === 5 ? 1.2 : 0.3, 'triangle', 0.09, i * 0.11, 1, i === 5); }); bell(0.66, 1047, 0.08); },
    lose: function () { [392, 349, 311, 262].forEach(function (f, i) { tone(f, 0.38, 'triangle', 0.08, i * 0.17); }); },
    paper: function () { noise(0.5, 0.25, 1800, 0, 0.6, 'bandpass', false, 0.4); noise(0.3, 0.15, 900, 0.35, 0.8); }
  };
  function sfx(name, o) { if (muted) return; var c = audio(); if (!c || c.state !== 'running') return; try { S[name] && S[name](o); } catch (e) { /* audio is optional */ } }

  /* ------------------------------------------------------------------ the site's music (made for COMPILE) */
  var music = (function () {
    var loading = null, bus = null, want = 'off', on = true;
    var TRACK = { title: 'lounge', game: 'runtime', clutch: 'lastcompile', calm: 'select' };
    function load() {
      if (G.COMPILE_MUSIC) return Promise.resolve();
      if (!loading) loading = new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = '../assets/music.js'; sc.onload = res; sc.onerror = function () { loading = null; rej(); }; document.head.appendChild(sc); });
      return loading;
    }
    function apply() {
      var c = AC;                                                      // never make the audio context before a tap
      if (!c) return;
      var M0 = G.COMPILE_MUSIC;
      if (muted || !on || want === 'off') { if (M0) M0.stop(); return; }
      load().then(function () {
        var M = G.COMPILE_MUSIC;
        if (!M || muted || !on || want === 'off') return;
        if (!bus) { bus = c.createGain(); bus.gain.value = 0.34; bus.connect(master); }
        M.attach(c, bus); M.setChoice(TRACK[want] || 'runtime'); M.start();
      }).catch(function () {});
    }
    return {
      mood: function (m) { if (m === want) return; want = m; apply(); },
      enable: function (v) { on = !!v; apply(); },
      jingle: function (name) { var M = G.COMPILE_MUSIC; if (!M || !on || muted || !AC) return; try { M.jingle(name); } catch (e) { /* optional */ } },
      apply: apply
    };
  })();

  G.BF_FX = {
    burst: burst, ring: ring, fly: fly, rain: rain, flash: flash, floatText: floatText, shake: shake,
    sfx: sfx, unlock: unlock, music: music, COLORS: COLORS,
    setLevel: function (v) { level = REDUCE ? 0 : v; },
    getLevel: function () { return level; },
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : vol; music.apply(); },
    audio: audio
  };
  document.addEventListener('visibilitychange', function () { if (!AC) return; if (document.hidden) AC.suspend(); else AC.resume(); });
})(window);
