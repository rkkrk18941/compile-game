/* 茨の塔 — particles, floating numbers, screen effects and synthesized sound. */
(function () {
'use strict';
var G = window.IBARA || (window.IBARA = {});
var FX = G.FX = {};
var cv, ctx, parts = [], lines = [], running = false, dpr = 1, W = 0, H = 0, layer;
FX.speed = 1;
FX.reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

FX.init = function (canvas, floatLayer) {
  cv = canvas; ctx = cv.getContext('2d'); layer = floatLayer;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  resize(); window.addEventListener('resize', resize);
};
function rnd(a, b) { return a + Math.random() * (b - a); }
function kick() { if (!running) { running = true; requestAnimationFrame(loop); } }
var last = 0;
function loop(t) {
  var dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt); p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    var k = p.life / p.max, a = Math.min(1, k * 1.6) * p.alpha;
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    var s = p.size * (p.shrink ? (0.3 + 0.7 * k) : 1);
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    if (p.shape === 'spark') {
      ctx.lineWidth = Math.max(1, s * 0.45); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
    } else if (p.shape === 'ring') {
      var rr = p.r0 + (p.r1 - p.r0) * (1 - k);
      ctx.lineWidth = Math.max(1, s * k); ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    } else if (p.shape === 'shard') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.4, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.4, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (p.shape === 'bubble') {
      ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = a * 0.25; ctx.fill();
    } else if (p.shape === 'star') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath();
      for (var j = 0; j < 8; j++) { var rr2 = j % 2 ? s * 0.4 : s; var aa = j * Math.PI / 4; ctx.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (p.shape === 'coin') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1); ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8a6010'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    } else {
      if (p.glow) { var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 2.2); gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, s * 2.2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  for (var m = lines.length - 1; m >= 0; m--) {
    var L = lines[m]; L.life -= dt; if (L.life <= 0) { lines.splice(m, 1); continue; }
    var kk = L.life / L.max;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, kk * 1.5);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = L.color; ctx.lineWidth = L.w * (0.4 + kk);
    ctx.shadowColor = L.color; ctx.shadowBlur = 14;
    ctx.beginPath();
    if (L.kind === 'arc') { var prog = Math.min(1, (1 - kk) * 2.2); ctx.moveTo(L.pts[0][0], L.pts[0][1]); var n = Math.max(2, Math.floor(L.pts.length * prog)); for (var q = 1; q < n; q++) ctx.lineTo(L.pts[q][0], L.pts[q][1]); }
    else { ctx.moveTo(L.pts[0][0], L.pts[0][1]); for (var q2 = 1; q2 < L.pts.length; q2++) ctx.lineTo(L.pts[q2][0], L.pts[q2][1]); }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, L.w * 0.35 * kk); ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (parts.length || lines.length) requestAnimationFrame(loop); else { running = false; last = 0; ctx.clearRect(0, 0, W, H); }
}
FX.burst = function (x, y, o) {
  if (!ctx) return; o = o || {};
  var n = Math.round((o.n || 14) * (FX.reduce ? 0.4 : 1));
  var cols = o.colors || ['#fff'];
  for (var i = 0; i < n; i++) {
    var ang = o.angle != null ? o.angle + rnd(-(o.spread || Math.PI), o.spread || Math.PI) : rnd(0, Math.PI * 2);
    var sp = rnd(o.speed ? o.speed[0] : 80, o.speed ? o.speed[1] : 260);
    var life = rnd(o.life ? o.life[0] : 0.35, o.life ? o.life[1] : 0.8);
    parts.push({ x: x + rnd(-(o.jitter || 0), o.jitter || 0), y: y + rnd(-(o.jitter || 0), o.jitter || 0), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: o.g != null ? o.g : 300, drag: o.drag != null ? o.drag : 2,
      life: life, max: life, size: rnd(o.size ? o.size[0] : 2, o.size ? o.size[1] : 5), color: cols[i % cols.length], shape: o.shape || 'spark', rot: rnd(0, 6.28), vr: rnd(-8, 8),
      alpha: o.alpha || 1, add: o.add !== false, glow: !!o.glow, shrink: o.shrink !== false });
  }
  kick();
};
FX.ring = function (x, y, o) { if (!ctx) return; o = o || {}; var life = o.life || 0.5; parts.push({ x: x, y: y, vx: 0, vy: 0, g: 0, drag: 0, life: life, max: life, size: o.w || 4, color: o.color || '#fff', shape: 'ring', r0: o.r0 || 6, r1: o.r1 || 60, rot: 0, vr: 0, alpha: 1, add: true }); kick(); };
FX.slash = function (x, y, o) {
  if (!ctx) return; o = o || {};
  var r = o.r || 60, a0 = o.a0 != null ? o.a0 : -2.4, a1 = o.a1 != null ? o.a1 : -0.4, pts = [];
  for (var i = 0; i <= 16; i++) { var t = a0 + (a1 - a0) * i / 16; pts.push([x + Math.cos(t) * r - r * 0.2, y + Math.sin(t) * r * 0.7 + r * 0.3]); }
  lines.push({ pts: pts, life: 0.32, max: 0.32, w: o.w || 7, color: o.color || '#ffe0b0', kind: 'arc' }); kick();
};
FX.bolt = function (x1, y1, x2, y2, o) {
  if (!ctx) return; o = o || {};
  var pts = [[x1, y1]], n = 9;
  for (var i = 1; i < n; i++) { var t = i / n; pts.push([x1 + (x2 - x1) * t + rnd(-16, 16), y1 + (y2 - y1) * t + rnd(-16, 16)]); }
  pts.push([x2, y2]);
  lines.push({ pts: pts, life: o.life || 0.28, max: o.life || 0.28, w: o.w || 5, color: o.color || '#fff27a' }); kick();
};
FX.streak = function (x1, y1, x2, y2, o) { if (!ctx) return; o = o || {}; lines.push({ pts: [[x1, y1], [x2, y2]], life: o.life || 0.22, max: o.life || 0.22, w: o.w || 3, color: o.color || '#e8ffe0' }); kick(); };
FX.float = function (x, y, text, cls) {
  if (!layer) return;
  var el = document.createElement('div');
  el.className = 'float-txt ' + (cls || '');
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  layer.appendChild(el);
  var dx = rnd(-18, 18);
  var anim = el.animate([
    { transform: 'translate(-50%,-50%) translate(0,0) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%,-50%) translate(' + (dx * 0.3) + 'px,-26px) scale(1.25)', opacity: 1, offset: 0.18 },
    { transform: 'translate(-50%,-50%) translate(' + (dx * 0.6) + 'px,-40px) scale(1)', opacity: 1, offset: 0.6 },
    { transform: 'translate(-50%,-50%) translate(' + dx + 'px,-70px) scale(.9)', opacity: 0 }
  ], { duration: 1100 / Math.max(0.6, FX.speed), easing: 'cubic-bezier(.2,.8,.3,1)' });
  anim.onfinish = function () { el.remove(); };
};
FX.shake = function (el, mag, dur) {
  if (!el || FX.reduce) return;
  mag = mag || 6; dur = dur || 320;
  var k = [];
  for (var i = 0; i < 7; i++) { var m = mag * (1 - i / 7); k.push({ transform: 'translate(' + rnd(-m, m).toFixed(1) + 'px,' + rnd(-m * 0.6, m * 0.6).toFixed(1) + 'px)' }); }
  k.push({ transform: 'translate(0,0)' });
  el.animate(k, { duration: dur / Math.max(0.6, FX.speed) });
};
FX.pulse = function (el, cls, ms) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(function () { el.classList.remove(cls); }, ms || 600); };
FX.center = function (el, oy) { if (!el) return { x: W / 2, y: H / 2 }; var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * (oy == null ? 0.5 : oy) }; };
FX.wait = function (ms) { return new Promise(function (res) { setTimeout(res, ms / Math.max(0.3, FX.speed)); }); };

/* ============================ sound ============================ */
var A = G.SFX = { on: true, music: true, vol: 0.8, musicVolume: 1, externalAudio: true };
var ac = null, master, sfxBus, musBus, noiseBuf, verb;
function ensure() {
  if (A.externalAudio) return false;
  if (ac) return true;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
  master = ac.createGain(); master.gain.value = A.vol; master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musBus = ac.createGain(); musBus.gain.value = 0.0; musBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  verb = ac.createConvolver();
  var len = ac.sampleRate * 1.8, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (var c = 0; c < 2; c++) { var ch = ir.getChannelData(c); for (var j = 0; j < len; j++) ch[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 2.6); }
  verb.buffer = ir; var vg = ac.createGain(); vg.gain.value = 0.28; verb.connect(vg); vg.connect(master);
  return true;
}
A.unlock = function () { if (!ensure()) return; if (ac.state === 'suspended') ac.resume(); if (mus.want && mus.playing !== mus.want) A.music(mus.want); };
A.setVol = function (v) { A.vol = v; if (master) master.gain.value = v; };
// Merely opening or touching the game must not create an AudioContext or take audio focus.
A.setExternalAudio = function (on) {
  A.externalAudio = on !== false;
  if (!A.externalAudio || !ac) return;
  stopDrone(); clearTimeout(mus.timer);
  mus.mode = mus.want = mus.playing = null;
  var closing = ac; ac = null; master = sfxBus = musBus = noiseBuf = verb = null;
  var closed = closing.close(); if (closed && closed.catch) closed.catch(function () {});
};
function env(g, t, a, peak, dcy, sus) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dcy); }
function osc(type, f, t, dur, peak, dest, o) {
  o = o || {};
  var oc = ac.createOscillator(), g = ac.createGain();
  oc.type = type; oc.frequency.setValueAtTime(f, t);
  if (o.f2) oc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || dur));
  if (o.detune) oc.detune.value = o.detune;
  env(g, t, o.a || 0.005, peak, dur);
  oc.connect(g); g.connect(dest || sfxBus);
  if (o.verb) g.connect(verb);
  oc.start(t); oc.stop(t + dur + 0.05);
  return oc;
}
function noise(t, dur, peak, o) {
  o = o || {};
  var src = ac.createBufferSource(); src.buffer = noiseBuf;
  var f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q || 1;
  var g = ac.createGain(); env(g, t, o.a || 0.003, peak, dur);
  src.connect(f); f.connect(g); g.connect(o.dest || sfxBus); if (o.verb) g.connect(verb);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
var SND = {
  click: function (t) { osc('triangle', 660, t, 0.06, 0.12); },
  draw: function (t) { noise(t, 0.07, 0.08, { f: 3200, f2: 1800, q: 0.8 }); },
  shuffle: function (t) { for (var i = 0; i < 6; i++) noise(t + i * 0.035, 0.05, 0.07, { f: 2600 + i * 200, q: 1 }); },
  play: function (t) { osc('sine', 150, t, 0.16, 0.25, null, { f2: 70 }); noise(t, 0.08, 0.08, { f: 2000, q: 0.7 }); },
  slash: function (t) { noise(t, 0.18, 0.28, { f: 4500, f2: 900, q: 0.9 }); },
  hit: function (t, k) { k = Math.min(3, k || 1); noise(t, 0.16 + k * 0.03, 0.32 + k * 0.08, { f: 900, f2: 300, q: 0.7 }); osc('sine', 120 + 20 * k, t, 0.22, 0.35, null, { f2: 45 }); },
  bighit: function (t) { noise(t, 0.4, 0.55, { f: 700, f2: 120, q: 0.6, verb: true }); osc('sine', 90, t, 0.45, 0.55, null, { f2: 30 }); },
  block: function (t) { osc('triangle', 980, t, 0.25, 0.14, null, { verb: true }); osc('sine', 1960, t, 0.12, 0.06); noise(t, 0.05, 0.06, { f: 5000, q: 2 }); },
  blocked: function (t) { osc('square', 520, t, 0.08, 0.06); osc('triangle', 1400, t, 0.18, 0.12, null, { verb: true }); },
  hurt: function (t) { noise(t, 0.25, 0.4, { f: 600, f2: 200, q: 0.8 }); osc('sawtooth', 160, t, 0.25, 0.12, null, { f2: 60 }); },
  buff: function (t) { [523, 659, 784].forEach(function (f, i) { osc('triangle', f, t + i * 0.06, 0.2, 0.12, null, { verb: true }); }); },
  debuff: function (t) { [440, 349, 277].forEach(function (f, i) { osc('triangle', f, t + i * 0.07, 0.22, 0.12); }); },
  poison: function (t) { for (var i = 0; i < 5; i++) osc('sine', 300 + Math.random() * 400, t + i * 0.05, 0.08, 0.08); },
  energy: function (t) { osc('sine', 880, t, 0.14, 0.1, null, { f2: 1320 }); },
  coin: function (t) { osc('square', 1318, t, 0.08, 0.06); osc('square', 1760, t + 0.07, 0.14, 0.06, null, { verb: true }); },
  die: function (t) { for (var i = 0; i < 9; i++) noise(t + Math.pow(i, 1.35) * 0.04, 0.03, 0.18 - i * 0.012, { f: 2200 + Math.random() * 1500, q: 3 }); },
  dieland: function (t) { osc('triangle', 784, t, 0.3, 0.12, null, { verb: true }); osc('triangle', 1175, t + 0.04, 0.3, 0.08, null, { verb: true }); },
  turn: function (t) { osc('sine', 220, t, 1.2, 0.16, null, { verb: true }); osc('sine', 330, t, 1.0, 0.1, null, { verb: true }); },
  enemyturn: function (t) { osc('sawtooth', 110, t, 0.8, 0.08, null, { verb: true }); osc('sine', 82, t, 1.0, 0.18, null, { verb: true }); },
  whoosh: function (t) { noise(t, 0.25, 0.22, { f: 400, f2: 2400, q: 0.6 }); },
  zap: function (t) { osc('sawtooth', 1400, t, 0.16, 0.08, null, { f2: 200 }); noise(t, 0.14, 0.18, { f: 6000, q: 0.5 }); },
  frost: function (t) { [1568, 2093, 2637].forEach(function (f, i) { osc('sine', f, t + i * 0.04, 0.4, 0.06, null, { verb: true }); }); },
  void: function (t) { osc('sine', 300, t, 0.5, 0.2, null, { f2: 50, verb: true }); },
  calm: function (t) { [392, 494, 587].forEach(function (f) { osc('sine', f, t, 0.9, 0.06, null, { a: 0.1, verb: true }); }); },
  wrath: function (t) { osc('sawtooth', 98, t, 0.5, 0.12, null, { f2: 196 }); noise(t, 0.35, 0.2, { f: 500, f2: 1500, q: 0.6 }); },
  divine: function (t) { [523, 659, 784, 1046].forEach(function (f, i) { osc('triangle', f, t + i * 0.05, 1.0, 0.08, null, { verb: true }); }); },
  burn: function (t) { noise(t, 0.5, 0.3, { f: 900, f2: 300, q: 0.5, type: 'lowpass' }); },
  exhaust: function (t) { noise(t, 0.45, 0.18, { f: 1200, f2: 300, q: 0.4, type: 'lowpass' }); },
  heal: function (t) { [659, 784, 988].forEach(function (f, i) { osc('sine', f, t + i * 0.08, 0.4, 0.1, null, { verb: true }); }); },
  relic: function (t) { osc('triangle', 1046, t, 0.5, 0.08, null, { verb: true }); osc('sine', 1568, t + 0.06, 0.6, 0.05, null, { verb: true }); },
  death: function (t) { noise(t, 0.6, 0.3, { f: 500, f2: 80, q: 0.5, verb: true }); osc('sine', 140, t, 0.6, 0.2, null, { f2: 40 }); },
  victory: function (t) { [523, 659, 784, 1046, 1318].forEach(function (f, i) { osc('triangle', f, t + i * 0.09, 0.9, 0.11, null, { verb: true }); }); osc('sine', 262, t + 0.45, 1.6, 0.14, null, { verb: true }); },
  defeat: function (t) { [392, 330, 262, 196].forEach(function (f, i) { osc('sawtooth', f, t + i * 0.25, 0.7, 0.07, null, { verb: true }); }); },
  card: function (t) { noise(t, 0.1, 0.1, { f: 2400, f2: 1200, q: 0.8 }); osc('triangle', 880, t + 0.03, 0.15, 0.06); },
  step: function (t) { noise(t, 0.08, 0.14, { f: 300, q: 1 }); noise(t + 0.18, 0.08, 0.12, { f: 280, q: 1 }); },
  open: function (t) { noise(t, 0.3, 0.12, { f: 600, f2: 1600, q: 0.6 }); [784, 988, 1175, 1568].forEach(function (f, i) { osc('triangle', f, t + 0.2 + i * 0.07, 0.6, 0.07, null, { verb: true }); }); },
  shiv: function (t) { noise(t, 0.08, 0.2, { f: 6000, f2: 2500, q: 1.2 }); osc('triangle', 1760, t, 0.06, 0.05); },
  orb: function (t) { osc('sine', 660, t, 0.25, 0.1, null, { f2: 990, verb: true }); },
  error: function (t) { osc('square', 180, t, 0.12, 0.06); osc('square', 140, t + 0.1, 0.14, 0.06); }
};
A.play = function (name, k) {
  if (!A.on || !ensure() || ac.state !== 'running') return;
  var f = SND[name]; if (!f) return;
  try { f(ac.currentTime + 0.005, k); } catch (e) {}
};

/* ambient music: slow drone + sparse plucks, different moods per scene */
var mus = { mode: null, want: null, playing: null, timer: null, drone: [] };
var SCALES = { title: [57, 60, 62, 64, 67, 69, 72], map: [57, 60, 62, 64, 67, 69, 72, 74], combat: [52, 55, 57, 59, 62, 64, 67], boss: [50, 53, 55, 56, 58, 62, 65], rest: [60, 62, 64, 67, 69, 72] };
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function stopDrone() { mus.drone.forEach(function (n) { try { n.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.6); n.o.stop(ac.currentTime + 3); } catch (e) {} }); mus.drone = []; }
A.music = function (mode) {
  mus.want = mode;
  if (!ac) return; // started from unlock() after the first user gesture
  if (mode === mus.playing) return;
  mus.mode = mus.playing = mode;
  stopDrone(); clearTimeout(mus.timer);
  musBus.gain.setTargetAtTime(A.music_on() && mode ? 0.32 * A.musicVolume : 0.0001, ac.currentTime, 0.8);
  if (!mode) return;
  var root = mode === 'boss' ? 38 : mode === 'combat' ? 40 : 45;
  [0, 7, 12].forEach(function (iv, i) {
    var o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(root + iv); o.detune.value = (i - 1) * 6;
    f.type = 'lowpass'; f.frequency.value = mode === 'boss' ? 520 : 380; f.Q.value = 0.7;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(i === 2 ? 0.03 : 0.045, ac.currentTime, 2);
    var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.05 + i * 0.03; lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    o.connect(f); f.connect(g); g.connect(musBus); o.start();
    mus.drone.push({ o: o, g: g }); mus.drone.push({ o: lfo, g: lg });
  });
  function pluck() {
    if (mus.mode !== mode) return;
    var sc = SCALES[mode] || SCALES.map, t = ac.currentTime + 0.05;
    var m = sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = mode === 'combat' || mode === 'boss' ? 'triangle' : 'sine'; o.frequency.value = mtof(m);
    env(g, t, 0.01, mode === 'boss' ? 0.07 : 0.06, 1.8);
    o.connect(g); g.connect(musBus); g.connect(verb); o.start(t); o.stop(t + 2);
    if (Math.random() < 0.4) { var o2 = ac.createOscillator(), g2 = ac.createGain(); o2.type = 'sine'; o2.frequency.value = mtof(m + (Math.random() < 0.5 ? 7 : 4)); env(g2, t + 0.25, 0.01, 0.035, 1.6); o2.connect(g2); g2.connect(musBus); g2.connect(verb); o2.start(t + 0.25); o2.stop(t + 2.2); }
    var gap = mode === 'combat' ? 700 + Math.random() * 900 : mode === 'boss' ? 500 + Math.random() * 700 : 1100 + Math.random() * 1600;
    mus.timer = setTimeout(pluck, gap);
  }
  mus.timer = setTimeout(pluck, 800);
};
A.music_on = function () { return A.music_enabled !== false; };
A.setMusic = function (on) { A.music_enabled = on; if (musBus) musBus.gain.setTargetAtTime(on && mus.playing ? 0.32 * A.musicVolume : 0.0001, ac.currentTime, 0.4); };
A.setMusicVolume = function (v) { A.musicVolume = Math.max(0, Math.min(1, v)); if (musBus) musBus.gain.setTargetAtTime(A.music_on() && mus.playing ? 0.32 * A.musicVolume : 0.0001, ac.currentTime, 0.4); };
})();
