/* ブラックフライデー — effects: a particle layer on one canvas, synthesized sound (no audio files), haptics and the
   site's background music. Presentation only: nothing here reads or changes the game.
     BF_FX.burst(at, kind, opt)        coins / sparks / shards / tape / confetti / embers / digits
     BF_FX.fly(from, to, kind, opt)    something travelling on an arc (coins, gold bars, briefcases), with a light trail
     BF_FX.rain(kind, ms)              ticker tape, confetti or falling quotes over the whole screen
     BF_FX.ring / shock / rays / flash light that answers an event
     BF_FX.sfx(name, opt)              a sound (opt.at = an element: the sound sits where the element is)
     BF_FX.haptic(name)                the phone's short buzz for the same moment, when sound is off
     BF_FX.tension(0 | 1 | 2)          a heartbeat under the tense moments
     BF_FX.music.mood('title' | 'game' | 'clutch' | 'off')
   Every effect respects the "effects" setting (0 off, 1 normal, 2 full) and prefers-reduced-motion. */
(function (G) {
  'use strict';
  var REDUCE = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var level = REDUCE ? 0 : 2;                                          // 0 none, 1 light, 2 full
  var COLORS = ['#9657a8', '#eadc25', '#4b973c', '#3271b2', '#f6f4df', '#262323'];
  var cv = null, ctx = null, W = G.innerWidth || 360, H = G.innerHeight || 640, DPR = 1, parts = [], running = false, flashes = [];
  var TAU = Math.PI * 2, MAX_PARTS = 520;

  function setup() {
    cv = document.getElementById('fx');
    if (!cv) return false;
    ctx = cv.getContext('2d');
    resize();
    G.addEventListener('resize', resize);
    return true;
  }
  function resize() {
    W = G.innerWidth; H = G.innerHeight;
    if (!cv) return;
    DPR = Math.min(2, G.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pt(p) {                                                    // an element, a rect or {x, y}
    if (!p) return { x: W / 2, y: H / 2 };
    if (p.getBoundingClientRect) { var r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    if (p.width != null && p.left != null) return { x: p.left + p.width / 2, y: p.top + p.height / 2 };
    return p;
  }

  /* soft light is drawn from small pre-rendered sprites: one gradient per colour instead of one per particle per frame */
  var sprites = {};
  function glow(color) {
    var s = sprites[color];
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    var g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.95; g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    sprites[color] = s;
    return s;
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
        p.px = p.x; p.py = p.y;
        p.x = inv * inv * a.x0 + 2 * inv * e * a.cx + e * e * a.x1;
        p.y = inv * inv * a.y0 + 2 * inv * e * a.cy + e * e * a.y1;
        p.rot += p.vr * dt;
        if (p.trail && level > 1 && Math.random() < 0.7 && parts.length < MAX_PARTS) {
          var s = base('spark', p.x, p.y);
          s.color = p.trail; s.size = rnd(1.4, 2.6); s.life = rnd(0.25, 0.5); s.drag = 0.9; s.g = 30;
          s.vx = rnd(-18, 18); s.vy = rnd(-18, 18);
          parts.push(s);
        }
        if (u >= 1) { if (p.done) p.done(); parts.splice(i, 1); }
        continue;
      }
      p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag;
      if (p.flutter) { p.vx += Math.sin(p.t * p.flutter + p.ph) * 40 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.floor != null && p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.38; p.vx *= 0.7; p.vr *= 0.5; if (Math.abs(p.vy) < 30) p.g = 0, p.vy = 0, p.vx = 0, p.vr = 0; }
      if (p.t > p.life || p.y > H + 60) parts.splice(i, 1);
    }
    for (var j = flashes.length - 1; j >= 0; j--) { flashes[j].t += dt; if (flashes[j].t > flashes[j].dur) flashes.splice(j, 1); }
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var f = 0; f < flashes.length; f++) {
      var fl = flashes[f], k = 1 - fl.t / fl.dur;
      ctx.globalAlpha = Math.max(0, k * k) * fl.a;
      ctx.fillStyle = fl.color; ctx.fillRect(0, 0, W, H);
    }
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
        var sx = Math.cos(p.t * p.spin), ax = Math.abs(sx) * 0.86 + 0.14;
        ctx.scale(ax, 1);
        ctx.fillStyle = '#7d5a12'; ctx.beginPath(); ctx.arc(0, 0.9, s, 0, TAU); ctx.fill();      // the edge
        ctx.fillStyle = sx > 0 ? '#f3c94f' : '#d9a936'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(122,84,10,.75)'; ctx.lineWidth = Math.max(0.6, s * 0.14); ctx.beginPath(); ctx.arc(0, 0, s * 0.68, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,250,224,.92)'; ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.38, s * 0.3, s * 0.13, -0.6, 0, TAU); ctx.fill();
        break;
      }
      case 'bar': {
        ctx.fillStyle = '#7a5410';                                                              // the long side
        ctx.beginPath(); ctx.moveTo(-s * 1.1, s * 0.5); ctx.lineTo(s * 1.1, s * 0.5); ctx.lineTo(s * 1.1, s * 0.74); ctx.lineTo(-s * 1.1, s * 0.74); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c8982c';
        ctx.beginPath(); ctx.moveTo(-s * 0.82, -s * 0.5); ctx.lineTo(s * 0.82, -s * 0.5); ctx.lineTo(s * 1.1, s * 0.5); ctx.lineTo(-s * 1.1, s * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f7d15c';
        ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.38); ctx.lineTo(s * 0.7, -s * 0.38); ctx.lineTo(s * 0.9, s * 0.34); ctx.lineTo(-s * 0.9, s * 0.34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,222,.9)'; ctx.fillRect(-s * 0.56, -s * 0.28, s * 1.0, s * 0.13);
        var gl = (p.t * 1.6) % 1.4 - 0.2;                                                       // a glint crossing the bar
        if (gl > 0 && gl < 1) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-s * 0.8 + gl * s * 1.5, -s * 0.36, s * 0.14, s * 0.68); }
        break;
      }
      case 'case': {
        var black = p.color === '#16191b' || p.color === '#262323';
        ctx.strokeStyle = black ? '#d8a441' : 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-s * 0.34, -s * 0.55); ctx.lineTo(-s * 0.34, -s * 0.9); ctx.lineTo(s * 0.34, -s * 0.9); ctx.lineTo(s * 0.34, -s * 0.55); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.3)'; roundRect(-s, -s * 0.47, s * 2, s * 1.3, s * 0.28); ctx.fill();
        ctx.fillStyle = black ? '#1b1d1e' : p.color;
        roundRect(-s, -s * 0.55, s * 2, s * 1.3, s * 0.28); ctx.fill();
        ctx.strokeStyle = black ? '#d8a441' : 'rgba(0,0,0,.45)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-s, s * 0.02, s * 2, s * 0.09);
        ctx.fillStyle = black ? '#d8a441' : 'rgba(0,0,0,.35)'; ctx.fillRect(-s * 0.16, -s * 0.06, s * 0.32, s * 0.26);
        ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.fillRect(-s * 0.78, -s * 0.42, s * 0.9, s * 0.1);
        break;
      }
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter';
        var r = s * 2.6;
        ctx.drawImage(glow(p.color), -r, -r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'ember': {
        ctx.globalCompositeOperation = 'lighter';
        var er = s * (1.6 + Math.sin(p.t * 9 + p.ph) * 0.5);
        ctx.drawImage(glow(p.color), -er, -er, er * 2, er * 2);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'tape': {
        var wv = Math.sin(p.t * p.spin + p.ph) * 0.5;
        ctx.transform(1, 0, wv * 0.4, 1, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-s * 0.2, -s * 2.4, s * 0.4, s * 4.8);
        if (p.mark) { ctx.fillStyle = 'rgba(20,34,28,.42)'; for (var m = -3; m < 4; m++) if ((m + p.mk) % 3) ctx.fillRect(-s * 0.11, m * s * 0.56, s * 0.22, s * 0.3); }
        break;
      }
      case 'confetti': {
        var fy = Math.sin(p.t * p.spin + p.ph);
        ctx.scale(1, Math.abs(fy) * 0.9 + 0.1);
        ctx.fillStyle = p.color; ctx.fillRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.7);
        if (fy > 0) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.25); }
        break;
      }
      case 'shard': {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.5, s * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + 0.4 * Math.abs(Math.sin(p.t * p.spin))) + ')';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(s * 0.1, s * 0.1); ctx.closePath(); ctx.fill();
        break;
      }
      case 'ring': {
        var k = p.t / p.life;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, (1 - k) * s * 0.18);
        ctx.beginPath(); ctx.arc(0, 0, s * (0.3 + k * 2.4), 0, TAU); ctx.stroke();
        break;
      }
      case 'shock': {                                                   // a thick wave of light that thins as it travels
        var q = p.t / p.life, e2 = 1 - Math.pow(1 - q, 3), rad = s * e2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color; ctx.globalAlpha *= (1 - q) * 0.7;
        ctx.lineWidth = Math.max(1, (1 - q) * (1 - q) * s * 0.035);
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.stroke();
        ctx.lineWidth = Math.max(0.5, (1 - q) * 2.2); ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, rad * 0.94, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'rays': {                                                    // light fanning out from one point
        var qr = p.t / p.life, len = s * (0.4 + qr * 0.9);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= Math.sin(Math.min(1, qr * 3) * Math.PI / 2) * (1 - qr) * 0.55;
        ctx.fillStyle = p.color;
        for (var ri = 0; ri < p.n; ri++) {
          var a0 = ri / p.n * TAU, wdt = (0.035 + (ri % 3) * 0.018);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0 - wdt) * len, Math.sin(a0 - wdt) * len); ctx.lineTo(Math.cos(a0 + wdt) * len, Math.sin(a0 + wdt) * len); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'text': {
        ctx.font = '700 ' + s + 'px Oswald, "Zen Kaku Gothic New", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var pop = p.pop ? 1 + Math.max(0, 0.22 - p.t) * 2.2 : 1;
        ctx.scale(pop, pop);
        ctx.lineWidth = Math.max(3, s * 0.22); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(6,14,20,.92)'; ctx.strokeText(p.text, 0, 0);
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
    if (parts.length >= MAX_PARTS && !p.path) return;                 // travelling pieces carry callbacks: never drop them
    parts.push(p);
    start();
  }
  function base(kind, x, y) { return { kind: kind, x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1, rot: 0, vr: 0, t: 0, life: 1, size: 6, color: '#fff', spin: 8, ph: 0 }; }

  /* ------------------------------------------------------------------ public effects */
  function burst(at, kind, opt) {
    if (!level) return;
    opt = opt || {};
    var c = pt(at), n = Math.round((opt.n || 14) * (level === 1 ? 0.5 : 1));
    var spread = opt.spread || 4;
    for (var i = 0; i < n; i++) {
      var p = base(kind, c.x + rnd(-spread, spread), c.y + rnd(-spread, spread));
      var ang = opt.up ? rnd(-Math.PI * 0.92, -Math.PI * 0.08) : rnd(0, TAU), sp = rnd(opt.speed ? opt.speed * 0.5 : 80, opt.speed || 260);
      p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      var lightKind = kind === 'spark' || kind === 'ember';
      p.g = opt.g != null ? opt.g : (kind === 'spark' ? 60 : kind === 'ember' ? -70 : 620);
      p.drag = lightKind ? 0.92 : 0.985;
      p.vr = lightKind ? 0 : rnd(-9, 9); p.spin = rnd(5, 14); p.ph = rnd(0, TAU);
      p.size = opt.size ? rnd(opt.size * 0.7, opt.size * 1.15) : (kind === 'coin' ? rnd(4.5, 7) : lightKind ? rnd(2, 4) : kind === 'shard' ? rnd(5, 11) : rnd(4, 8));
      p.life = opt.life || rnd(0.7, 1.3);
      p.color = Array.isArray(opt.color) ? opt.color[i % opt.color.length] : (opt.color || '#ffcf7a');
      p.t = -(opt.stagger || 0) * i;
      if (opt.floor != null) p.floor = opt.floor + rnd(-6, 6);
      if (kind === 'text') { p.text = Array.isArray(opt.text) ? opt.text[i % opt.text.length] : String(opt.text || ''); p.vr = 0; p.rot = rnd(-0.25, 0.25); }
      add(p);
    }
  }
  function ring(at, color, size, life) {
    if (!level) return;
    var c = pt(at), p = base('ring', c.x, c.y);
    p.size = size || 40; p.life = life || 0.6; p.color = color || '#ffb43f';
    add(p);
  }
  function shock(at, color, size, life) {
    if (!level) return;
    var c = pt(at), p = base('shock', c.x, c.y);
    p.size = size || Math.max(W, H) * 0.7; p.life = life || 0.8; p.color = color || '#ffd27a';
    add(p);
  }
  function rays(at, color, size, life, n) {
    if (level < 2) return;
    var c = pt(at), p = base('rays', c.x, c.y);
    p.size = size || 260; p.life = life || 1.2; p.color = color || '#ffe7a8'; p.n = n || 14; p.vr = 0.35; p.rot = rnd(0, TAU);
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
      p.size = opt.size || (kind === 'bar' ? 10 : kind === 'case' ? 9.5 : 6);
      p.color = Array.isArray(opt.color) ? opt.color[i % opt.color.length] : (opt.color || '#fff');
      p.vr = kind === 'case' ? rnd(-3, 3) : kind === 'bar' ? rnd(-2, 2) : rnd(-6, 6); p.spin = 10;
      p.trail = opt.trail === false ? null : (kind === 'coin' || kind === 'bar' ? '#ffd774' : kind === 'case' ? (p.color === '#16191b' ? '#ff6a5c' : p.color) : null);
      p.t = -(opt.stagger != null ? opt.stagger : 0.06) * i;
      if (i === n - 1 && opt.done) p.done = opt.done;
      add(p);
    }
  }
  var DIGITS = ['▼12', '▼30', '−45', '▼8', '▼60', '−25', '▼110', '▼5', '−75', '▼20'];
  function rain(kind, ms, colors) {
    if (!level) return;
    var digits = kind === 'digits';
    var n = Math.round((kind === 'tape' ? 90 : digits ? 46 : 120) * (level === 1 ? 0.4 : 1)), dur = (ms || 3000) / 1000;
    for (var i = 0; i < n; i++) {
      var p = base(digits ? 'text' : kind, rnd(0, W), rnd(-H * 0.3, -10));
      p.vx = rnd(-30, 30); p.vy = digits ? rnd(260, 620) : rnd(90, 220); p.g = kind === 'tape' ? 30 : digits ? 500 : 60; p.drag = 0.995;
      if (!digits) { p.flutter = rnd(2, 5); p.vr = rnd(-3, 3); }
      p.ph = rnd(0, TAU); p.spin = rnd(4, 9);
      p.size = digits ? rnd(13, 26) : kind === 'tape' ? rnd(5, 8) : rnd(5, 9);
      p.color = colors ? colors[i % colors.length] : (kind === 'tape' ? (i % 3 ? '#efe9da' : '#ffe9b0') : digits ? (i % 4 ? '#ff6a5c' : '#ffb1a8') : COLORS[i % 5]);
      p.mark = kind === 'tape' && i % 2 === 0; p.mk = i % 3;
      if (digits) { p.text = DIGITS[i % DIGITS.length]; p.alpha = rnd(0.45, 0.95); }
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
    p.text = text; p.color = color || '#fff'; p.size = size || 18; p.vy = -70; p.drag = 0.965; p.life = 1.25; p.pop = true;
    add(p);
  }
  /* a jolt. Pass one element or a list: the pieces of the screen shake together, so nothing fixed to the window
     (the action bar) loses its place the way it would if their parent were moved. */
  function shake(el, strength) {
    if (!level || !el) return;
    var q = strength || 1, list = el.length != null && !el.tagName ? Array.prototype.slice.call(el) : [el];
    var f = [{ transform: 'translate3d(0,0,0)' }];
    for (var i = 1; i < 9; i++) { var d = (1 - i / 9) * q * 7; f.push({ transform: 'translate3d(' + rnd(-d, d).toFixed(1) + 'px,' + rnd(-d * 0.6, d * 0.6).toFixed(1) + 'px,0) rotate(' + (rnd(-0.12, 0.12) * q).toFixed(3) + 'deg)' }); }
    f.push({ transform: 'translate3d(0,0,0)' });
    list.forEach(function (x) { if (x && x.animate) x.animate(f, { duration: 420 + q * 90, easing: 'cubic-bezier(.36,.07,.19,.97)' }); });
  }

  /* ------------------------------------------------------------------ sound */
  var AC = null, master = null, verb = null, verbGain = null, muted = false, vol = 0.72, dest = null;
  function audio() {
    if (AC) return AC;
    var Ctx = G.AudioContext || G.webkitAudioContext;
    if (!Ctx) return null;
    try {
      AC = new Ctx();
      var comp = AC.createDynamicsCompressor();
      comp.threshold.value = -15; comp.knee.value = 14; comp.ratio.value = 4.5; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(AC.destination);
      master = AC.createGain(); master.gain.value = vol; master.connect(comp);
      dest = master;
      // a hall: early reflections off the far wall, then a tail that darkens as it fades
      verb = AC.createConvolver();
      var sr = AC.sampleRate, len = Math.floor(sr * 2.2), ir = AC.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch), lp = 0;
        for (var i = 0; i < len; i++) {
          var tt = i / len, n = (Math.random() * 2 - 1) * Math.pow(1 - tt, 3.1);
          var k = 0.5 - tt * 0.42;                                    // the filter closes over the tail
          lp += (n - lp) * k; d[i] = lp * 1.6;
        }
        for (var e = 0; e < 7; e++) { var at = Math.floor(sr * (0.011 + e * 0.013 + Math.random() * 0.006 + ch * 0.003)); d[at] += (Math.random() > 0.5 ? 1 : -1) * (0.55 - e * 0.06); }
      }
      verb.buffer = ir; verbGain = AC.createGain(); verbGain.gain.value = 0.3; verb.connect(verbGain); verbGain.connect(master);
    } catch (e) { AC = null; }
    return AC;
  }
  function unlock() { var fresh = !AC, c = audio(); if (c && c.state === 'suspended') c.resume().catch(function () {}); if (fresh && c) music.apply(); }
  function route(g, wet) { g.connect(dest || master); if (wet) { if (typeof wet === 'number') { var s = AC.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); } else g.connect(verb); } }
  function env(g, t, v, len, attack) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (attack || 0.006)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }
  function tone(f, len, type, v, at, slide, wet) {
    var c = AC, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide && slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + len);
    env(g, t, v || 0.15, len);
    o.connect(g); route(g, wet); o.start(t); o.stop(t + len + 0.03);
  }
  /* a struck piece of metal: a carrier bent by a faster partner, both dying together */
  function fm(f, ratio, index, len, v, at, wet) {
    var c = AC, t = c.currentTime + (at || 0), car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.02), t + len);
    mod.connect(mg); mg.connect(car.frequency);
    env(g, t, v || 0.12, len, 0.003);
    car.connect(g); route(g, wet); car.start(t); mod.start(t); car.stop(t + len + 0.05); mod.stop(t + len + 0.05);
  }
  /* brass: two saws a few cents apart, opened and closed by a filter */
  function brass(f, len, v, at, wet) {
    var c = AC, t = c.currentTime + (at || 0), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'lowpass'; fl.Q.value = 1.2;
    fl.frequency.setValueAtTime(f * 1.2, t); fl.frequency.exponentialRampToValueAtTime(f * 6, t + Math.min(0.08, len * 0.3)); fl.frequency.exponentialRampToValueAtTime(f * 2.2, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.08, t + 0.03); g.gain.setValueAtTime(v || 0.08, t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    [-6, 5].forEach(function (cents) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents; o.connect(fl); o.start(t); o.stop(t + len + 0.05); });
    fl.connect(g); route(g, wet);
  }
  var noiseBuf = null;
  function noise(len, v, freq, at, q, type, wet, sweep) {
    var c = AC, t = c.currentTime + (at || 0);
    if (!noiseBuf) { var n = c.sampleRate * 2; noiseBuf = c.createBuffer(1, n, c.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 2400, t); f.Q.value = q || 0.8;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (freq || 2400) * sweep), t + len);
    env(g, t, v || 0.2, len, 0.01);
    src.connect(f); f.connect(g); route(g, wet); src.start(t, Math.random()); src.stop(t + len + 0.05);
  }
  function thump(f, len, v, at, wet) {                                 // a drum skin: the pitch falls as it rings
    var c = AC, t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); o.frequency.exponentialRampToValueAtTime(Math.max(22, f * 0.55), t + len);
    env(g, t, v || 0.3, len, 0.004);
    o.connect(g); route(g, wet); o.start(t); o.stop(t + len + 0.05);
  }
  function bell(at, f0, v, len) {                                      // a hand bell: inharmonic partials, the low ones last
    var L = len || 2.2;
    [[1, 1, 1], [2.0, 0.6, 0.85], [2.76, 0.45, 0.7], [4.07, 0.25, 0.5], [5.4, 0.2, 0.36], [8.93, 0.08, 0.2]].forEach(function (p) {
      tone(f0 * p[0], L * p[2], 'sine', (v || 0.14) * p[1], at, 1, true);
    });
    tone(f0 * 1.006, L * 0.9, 'sine', (v || 0.14) * 0.5, at, 1, true);   // a near-unison that makes it shimmer
    noise(0.03, (v || 0.14) * 0.9, 5200, at, 1.4, 'bandpass');          // the clapper
  }
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function note(semi) { return 523.25 * Math.pow(2, semi / 12); }
  var S = {
    tap: function () { tone(1750, 0.035, 'triangle', 0.05, 0, 0.7); noise(0.014, 0.06, 5200, 0, 1.6, 'highpass'); },
    open: function () { noise(0.11, 0.07, 700, 0, 0.9, 'bandpass', false, 4); tone(740, 0.07, 'triangle', 0.05, 0.01); tone(1110, 0.11, 'sine', 0.045, 0.05, 1, 0.5); },
    close: function () { noise(0.1, 0.06, 2600, 0, 0.9, 'bandpass', false, 0.25); tone(620, 0.07, 'sine', 0.035, 0, 0.75); },
    place: function () { noise(0.035, 0.24, 1900, 0, 2.2); thump(170, 0.09, 0.2); tone(330, 0.05, 'triangle', 0.05, 0.004, 0.6); },
    coin: function (o) { var p = o.pitch || 1; fm(2350 * p, 2.41, 1.1, 0.42, 0.07, 0, 0.6); tone(4700 * p, 0.12, 'sine', 0.025, 0.002); },
    coins: function (o) { var n = Math.min(9, o.n || 4); for (var i = 0; i < n; i++) { var at = i * 0.052 + Math.random() * 0.02, f = 2000 + Math.random() * 1700; fm(f, 2.41, 0.9, 0.26, 0.05, at, 0.4); noise(0.02, 0.07, 6500, at, 2.2); } },
    register: function () { noise(0.05, 0.22, 2400, 0, 2.2); thump(140, 0.1, 0.16, 0.01); noise(0.09, 0.1, 900, 0.05, 1.1, 'bandpass', false, 2.4); fm(2093, 3.01, 1.4, 1.1, 0.1, 0.12, true); fm(2637, 3.01, 1.2, 0.9, 0.05, 0.14, true); },
    gold: function () { [0, 4, 7, 12].forEach(function (s, i) { fm(note(s + 12), 3.5, 1.3, 0.9 - i * 0.08, 0.06, i * 0.06, true); }); noise(0.5, 0.045, 9000, 0.04, 2.6, 'highpass', true); thump(110, 0.16, 0.22); },
    clank: function () { fm(420, 1.41, 2.4, 0.3, 0.09, 0, 0.5); noise(0.08, 0.14, 3000, 0, 1); thump(90, 0.14, 0.2); },
    bell: function () { bell(0, 587, 0.17, 2.6); bell(0.36, 587, 0.15, 2.6); bell(0.72, 587, 0.16, 3.2); },
    turn: function () { fm(784, 4, 0.5, 0.2, 0.06, 0, 0.4); fm(1175, 4, 0.5, 0.3, 0.05, 0.085, 0.5); },
    myturn: function () { [7, 12, 16].forEach(function (s, i) { fm(note(s), 4, 0.6, 0.34, 0.085, i * 0.095, 0.5); }); bell(0.29, note(19), 0.07, 1.5); },
    deny: function () { tone(150, 0.11, 'sawtooth', 0.06); tone(141, 0.16, 'sawtooth', 0.06, 0.12); },
    alert: function () { fm(880, 2, 1.2, 0.16, 0.07); fm(660, 2, 1.2, 0.22, 0.07, 0.14, 0.4); },
    rustle: function () { for (var i = 0; i < 9; i++) { var at = i * 0.07 + Math.random() * 0.03; noise(0.07, 0.13, 1400 + Math.random() * 2600, at, 0.9); if (i % 2) fm(1500 + Math.random() * 900, 2.7, 1, 0.07, 0.022, at); } thump(95, 0.12, 0.14, 0.02); thump(88, 0.12, 0.12, 0.35); },
    pop: function (o) { var k = o.i || 0, f = note(PENTA[Math.min(PENTA.length - 1, k)]); fm(f, 2, 0.8, 0.3, 0.1, 0, 0.5); noise(0.03, 0.12, 3400, 0, 1.4); thump(150, 0.07, 0.12); },
    black: function () { thump(52, 1.1, 0.5, 0, 0.5); tone(58, 1.3, 'sawtooth', 0.07, 0.01, 0.5, true); tone(61.5, 1.3, 'sawtooth', 0.06, 0.01, 0.5, true); noise(0.5, 0.22, 240, 0, 0.7, 'lowpass', true); noise(0.25, 0.1, 3000, 0, 0.8, 'bandpass', true, 0.2); fm(196, 1.41, 3, 1.2, 0.05, 0.02, true); },
    heart: function (o) { var v = o.v || 0.3; thump(54, 0.16, v); thump(46, 0.2, v * 0.75, 0.2); },
    tally: function () { tone(1320, 0.03, 'square', 0.03); fm(660, 3, 0.8, 0.12, 0.05, 0.01, 0.4); },
    tick: function (o) { tone(1500 * (o.pitch || 1), 0.022, 'square', 0.018); },
    flip: function () { for (var i = 0; i < 5; i++) noise(0.025, 0.12, 2200, i * 0.035, 1.5); },
    rise: function (o) { var k = Math.min(5, (o.k || 1) + 1); for (var i = 0; i < k; i++) fm(note(PENTA[i + 2]), 3, 0.7, 0.26, 0.06, i * 0.055, 0.5); noise(0.3, 0.03, 2000, 0, 1, 'bandpass', true, 3); },
    fall: function (o) { var k = o.k || 1; tone(494, 0.34 + k * 0.07, 'sawtooth', 0.045, 0, 0.42, 0.4); tone(466, 0.4 + k * 0.07, 'triangle', 0.05, 0.02, 0.4, 0.4); thump(70, 0.22, 0.16, 0.24 + k * 0.03); },
    level: function () { [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach(function (ch, i) { ch.forEach(function (s) { brass(note(s - 12), i === 3 ? 0.9 : 0.2, 0.05, i * 0.17, 0.5); }); }); bell(0.52, note(24), 0.07, 1.8); thump(65, 0.4, 0.3, 0.51, 0.3); noise(0.8, 0.05, 7000, 0.5, 1.5, 'highpass', true); },
    goldup: function () { fm(1047, 3.5, 1.2, 0.5, 0.07, 0, true); fm(1568, 3.5, 1, 0.6, 0.05, 0.07, true); noise(0.12, 0.03, 9000, 0, 3, 'highpass'); },
    whoosh: function (o) { var up = o.down ? 0.2 : 5; noise(o.len || 0.32, o.v || 0.16, o.down ? 3200 : 420, 0, 0.9, 'bandpass', 0.5, up); },
    riser: function (o) { var L = o.len || 1.2; noise(L, 0.09, 500, 0, 1.4, 'bandpass', true, 9); tone(110, L, 'sawtooth', 0.03, 0, 3.6, true); },
    slam: function () { thump(60, 0.7, 0.55, 0, 0.4); noise(0.2, 0.3, 900, 0, 0.7, 'lowpass', true); noise(0.05, 0.25, 3600, 0, 1.2); tone(98, 0.9, 'sawtooth', 0.05, 0.01, 0.5, true); },
    stamp: function () { thump(95, 0.24, 0.42); noise(0.06, 0.26, 1500, 0, 1); noise(0.2, 0.06, 500, 0.03, 0.8, 'lowpass', true); },
    drum: function (o) { var L = o.len || 1.3, n = Math.floor(L * 26); for (var i = 0; i < n; i++) { var u = i / n; noise(0.04, 0.05 + u * 0.12, 1800 + u * 600, u * L, 1.1, 'bandpass', 0.25); } thump(70, 0.6, 0.5, L, 0.4); noise(0.5, 0.2, 6000, L, 1, 'highpass', true); },
    reveal: function () { [0, 7, 12, 16].forEach(function (s, i) { fm(note(s), 4, 0.5, 0.9, 0.05, i * 0.04, true); }); noise(0.5, 0.04, 8000, 0, 2, 'highpass', true); },
    siren: function () {
      var c = AC, t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 640; o2.frequency.value = 643; l.frequency.value = 2.6; lg.gain.value = 210;
      l.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      fl.type = 'lowpass'; fl.frequency.value = 1900; fl.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.08); g.gain.setValueAtTime(0.05, t + 1.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
      o.connect(fl); o2.connect(fl); fl.connect(g); route(g, 0.6); o.start(t); o2.start(t); l.start(t); o.stop(t + 2.4); o2.stop(t + 2.4); l.stop(t + 2.4);
    },
    crash: function () {
      thump(48, 2.2, 0.6, 0, 0.5); thump(40, 1.4, 0.35, 0.09, 0.5);
      tone(110, 1.8, 'sawtooth', 0.1, 0, 0.22, true); tone(116.5, 1.8, 'sawtooth', 0.08, 0, 0.22, true);
      noise(2.0, 0.42, 1100, 0, 0.6, 'lowpass', true, 0.08); noise(0.4, 0.28, 4200, 0.02, 0.9, 'bandpass', true);
      for (var i = 0; i < 10; i++) { var at = 0.3 + i * 0.11 + Math.random() * 0.06; noise(0.05, 0.12 * (1 - i / 12), 800 + Math.random() * 2400, at, 1.6); thump(80 + Math.random() * 60, 0.1, 0.12 * (1 - i / 12), at); }
    },
    glass: function () {
      noise(0.09, 0.3, 5200, 0, 1, 'highpass'); noise(0.5, 0.16, 7000, 0.02, 1.2, 'highpass', true);
      for (var i = 0; i < 16; i++) { var at = i * 0.035 + Math.random() * 0.05 + (i > 9 ? 0.25 : 0); fm(2200 + Math.random() * 4200, 1.73, 1.5, 0.18 + Math.random() * 0.25, 0.035, at, 0.6); }
    },
    crack: function () { noise(0.03, 0.34, 4200, 0, 1.2, 'highpass'); for (var i = 0; i < 6; i++) noise(0.018, 0.2, 3000 + Math.random() * 3000, 0.02 + i * 0.022 + Math.random() * 0.02, 2.2); thump(120, 0.12, 0.2); },
    win: function () {
      [[0, 4, 7], [0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]].forEach(function (ch, i) { var at = [0, 0.16, 0.32, 0.5, 0.74][i], L = i === 4 ? 1.5 : 0.2; ch.forEach(function (s) { brass(note(s - 12), L, 0.06, at, 0.5); }); });
      [12, 16, 19, 24, 28].forEach(function (s, i) { fm(note(s), 3.5, 0.9, 1.1, 0.045, 0.78 + i * 0.07, true); });
      thump(62, 0.6, 0.4, 0.74, 0.4); noise(1.2, 0.06, 7500, 0.74, 1.4, 'highpass', true); bell(0.9, note(24), 0.06, 2.4);
    },
    lose: function () { [7, 5, 3, 0].forEach(function (s, i) { brass(note(s - 12), i === 3 ? 0.9 : 0.34, 0.05, i * 0.26, 0.5); }); thump(55, 0.8, 0.25, 0.78, 0.4); },
    paper: function () { noise(0.55, 0.26, 1700, 0, 0.6, 'bandpass', 0.4, 0.4); for (var i = 0; i < 7; i++) noise(0.03, 0.1, 2600, 0.05 + i * 0.07, 1.4); thump(90, 0.18, 0.3, 0.95); noise(0.1, 0.2, 1200, 0.95, 0.9); }
  };
  /* the phone answers only the moments that matter (it follows the effects setting, not the sound switch) */
  var HAPTIC = { black: [40, 30, 60], crash: [90, 40, 160, 40, 220], slam: [50, 20, 90], myturn: [16, 40, 16], level: [20, 30, 20, 30, 60], win: [30, 40, 30, 40, 120], crack: [14, 10, 30], deny: [30, 30, 30] };
  function haptic(name) {
    if (level < 1) return;
    var p = HAPTIC[name];
    if (p && G.navigator && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* optional */ } }
  }
  function sfx(name, o) {
    if (muted) return;
    haptic(name);
    var c = audio();
    if (!c || c.state !== 'running') return;
    o = o || {};
    try {
      dest = master;
      if (o.at && c.createStereoPanner) {                              // sit the sound where the thing is on screen
        var pn = c.createStereoPanner(); pn.pan.value = clamp((pt(o.at).x / Math.max(1, W)) * 2 - 1, -1, 1) * 0.7; pn.connect(master); dest = pn;
      }
      if (S[name]) S[name](o);
    } catch (e) { /* audio is optional */ }
    dest = master;
  }
  /* a heartbeat under the tense moments: 1 = watchful, 2 = racing */
  var tenseTimer = null, tenseLevel = 0;
  function tension(v) {
    v = level ? (v || 0) : 0;
    if (v === tenseLevel) return;
    tenseLevel = v;
    clearInterval(tenseTimer); tenseTimer = null;
    if (!v) return;
    var beat = function () { if (!document.hidden) sfx('heart', { v: tenseLevel > 1 ? 0.34 : 0.22 }); };
    beat();
    tenseTimer = setInterval(beat, v > 1 ? 560 : 900);
  }

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
      var recorded = G.GEMINI_BGM;
      if (recorded) { recorded.setEnabled(!muted && on); if (recorded.isRecorded()) { if (G.COMPILE_MUSIC) G.COMPILE_MUSIC.stop(); return; } }
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
    document.addEventListener('gemini-bgm-change', apply);
    return {
      mood: function (m) { if (m === want) return; want = m; apply(); },
      enable: function (v) { on = !!v; apply(); },
      jingle: function (name) { var M = G.COMPILE_MUSIC; if (!M || !on || muted || !AC) return; try { M.jingle(name); } catch (e) { /* optional */ } },
      /* the synthesized score steps back while something loud happens */
      duck: function (to, ms) { if (!bus || !AC) return; var t = AC.currentTime; try { bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.34 * to, t, 0.08); bus.gain.setTargetAtTime(0.34, t + (ms || 1500) / 1000, 0.5); } catch (e) { /* optional */ } },
      apply: apply
    };
  })();

  /* take one kind of particle off the screen at once (the falling quotes stop when the paper lands) */
  function clear(kind) { for (var i = parts.length - 1; i >= 0; i--) if (!parts[i].path && (!kind || parts[i].kind === kind)) parts.splice(i, 1); }

  G.BF_FX = {
    clear: clear, burst: burst, ring: ring, shock: shock, rays: rays, fly: fly, rain: rain, flash: flash, floatText: floatText, shake: shake,
    sfx: sfx, haptic: haptic, tension: tension, unlock: unlock, music: music, COLORS: COLORS, point: pt,
    setLevel: function (v) { level = REDUCE ? 0 : v; if (!level) tension(0); },
    getLevel: function () { return level; },
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : vol; if (muted) tension(0); music.apply(); },
    audio: audio
  };
  document.addEventListener('visibilitychange', function () { if (!AC) return; if (document.hidden) AC.suspend(); else AC.resume(); });
})(window);
