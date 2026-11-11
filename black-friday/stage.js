/* ブラックフライデー — the stage: everything around the game that makes it feel like a place.
     BF_STAGE.ambient      lamp light and dust behind the table; it warms, then reddens, as the gold price nears $100
     BF_STAGE.hero         the title's live market wall: five prices climbing, gold creeping to $100, the crash
     BF_STAGE.tween(root)  numbers marked data-tw roll from the value they showed last to the new one
     BF_STAGE.crack / glitch / iris / bars / halt / shake   moments of the cinematics
   Presentation only: nothing here reads or changes the game. Everything follows the effects setting of BF_FX
   (0 off, 1 light, 2 full) and prefers-reduced-motion. */
(function (G) {
  'use strict';
  var FX = G.BF_FX;
  var REDUCE = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU = Math.PI * 2;
  function lvl() { return REDUCE ? 0 : (FX ? FX.getLevel() : 2); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ================================================================ ambient light */
  var ambient = (function () {
    var cv = null, g = null, W = 0, H = 0, raf = 0, last = 0, motes = [], heat = 0, heatNow = 0, pulse = 0, on = false, t = 0;
    function make() {
      if (cv) return;
      cv = el('canvas'); cv.id = 'amb'; cv.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(cv, document.body.firstChild);
      g = cv.getContext('2d');
      size();
      G.addEventListener('resize', size);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
    }
    function size() {
      if (!cv) return;
      W = G.innerWidth; H = G.innerHeight;
      var sc = W * H > 900000 ? 0.5 : 0.75;                             // soft light needs few pixels
      cv.width = Math.max(2, Math.round(W * sc)); cv.height = Math.max(2, Math.round(H * sc));
      var n = Math.round(clamp(W * H / 26000, 18, 60));
      motes = [];
      for (var i = 0; i < n; i++) motes.push({ x: Math.random(), y: Math.random(), z: rnd(0.3, 1), ph: rnd(0, TAU), sp: rnd(0.004, 0.014) });
      paint(0);
    }
    function mix(a, b, k) { return 'rgba(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ','; }
    function paint(dt) {
      if (!g) return;
      t += dt;
      heatNow += (heat - heatNow) * Math.min(1, dt * 1.2);
      pulse = Math.max(0, pulse - dt * 0.9);
      var sx = cv.width / W, k = heatNow;
      g.setTransform(sx, 0, 0, sx, 0, 0);
      g.clearRect(0, 0, W, H);
      // the lamp over the desk: brass-green when calm, ember-red near the end
      var lamp = mix([120, 150, 96], [214, 74, 46], k), breathe = 0.5 + 0.5 * Math.sin(t * (0.5 + k * 1.6));
      var gr = g.createRadialGradient(W * 0.5, -H * 0.12, 0, W * 0.5, -H * 0.12, Math.max(W, H) * 0.95);
      gr.addColorStop(0, lamp + (0.2 + k * 0.1 + breathe * 0.03 * (1 + k * 2) + pulse * 0.25) + ')');
      gr.addColorStop(0.5, lamp + (0.06 + k * 0.04) + ')');
      gr.addColorStop(1, lamp + '0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var warm = mix([196, 160, 92], [226, 60, 40], k);
      gr = g.createRadialGradient(W * 0.92, H * 1.05, 0, W * 0.92, H * 1.05, Math.max(W, H) * 0.7);
      gr.addColorStop(0, warm + (0.13 + k * 0.1 + pulse * 0.2) + ')'); gr.addColorStop(1, warm + '0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // dust in the lamp light
      if (lvl() > 0) {
        g.globalCompositeOperation = 'lighter';
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i];
          m.y -= m.sp * dt * (1 + k * 2.4) * m.z; m.x += Math.sin(t * 0.3 + m.ph) * 0.00045 * dt * 60;
          if (m.y < -0.03) { m.y = 1.03; m.x = Math.random(); }
          var a = (0.1 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.9 + m.ph))) * m.z * (1 - m.y * 0.55);
          var r = 1 + m.z * 2.2;
          g.fillStyle = (k > 0.5 ? 'rgba(255,150,110,' : 'rgba(255,236,190,') + a.toFixed(3) + ')';
          g.beginPath(); g.arc(m.x * W, m.y * H, r, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
    function frame(now) {
      raf = 0;
      if (!on || document.hidden) return;
      var dt = Math.min(0.1, (now - last) / 1000);
      if (dt < 0.03) { raf = requestAnimationFrame(frame); return; }     // ~30 frames a second is plenty for light
      last = now;
      paint(dt);
      if (lvl() > 0) raf = requestAnimationFrame(frame);
    }
    function kick() { if (on && !raf && lvl() > 0) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    return {
      start: function () { make(); on = true; paint(0); kick(); },
      heat: function (v) { heat = clamp(v, 0, 1); document.documentElement.style.setProperty('--heat', heat.toFixed(3)); if (lvl() === 0) { heatNow = heat; paint(0); } kick(); },
      pulse: function (v) { pulse = v == null ? 1 : v; kick(); },
      refresh: function () { paint(0); kick(); }
    };
  })();

  /* ================================================================ the title: a market wall that never sleeps */
  var hero = (function () {
    var COLS = ['#c08be0', '#f2e04e', '#62c96c', '#5fa9f0', '#f4f0e2'];
    var cv = null, g = null, raf = 0, last = 0, t = 0, W = 0, H = 0, DPR = 1;
    var N = 150, series = [], gold = [], goldV = 20, state = 'run', stateT = 0, runFor = 0, born = 0, host = null;
    var LO = Math.log(4), HI = Math.log(260);
    function reset() {
      series = [0, 1, 2, 3, 4].map(function (i) { var v = Math.log(7 + i * 1.4 + Math.random() * 3), a = []; for (var k = 0; k < N; k++) a.push(v); return { a: a, v: v, d: 0, ph: Math.random() * 9 }; });
      gold = []; for (var k = 0; k < N; k++) gold.push(20);
      goldV = 20; state = 'run'; stateT = 0; runFor = rnd(9, 12);
    }
    function tick() {                                                   // one step of the little market
      series.forEach(function (s, i) {
        var drift;
        if (state === 'crash') drift = -0.085 - Math.random() * 0.05;
        else if (state === 'rest') drift = (Math.random() - 0.46) * 0.02;
        else drift = 0.017 + Math.sin(t * 0.7 + s.ph) * 0.016 + (Math.random() - 0.5) * 0.05 + (Math.random() < 0.035 ? (Math.random() < 0.72 ? 0.11 : -0.13) : 0);
        s.d = s.d * 0.55 + drift * 0.45;
        s.v = clamp(s.v + s.d, LO + 0.25, HI - 0.1);
        s.a.push(s.v); s.a.shift();
      });
      if (state === 'run') goldV = Math.min(100, goldV + (goldV < 30 ? 0.34 : 0.62));
      gold.push(goldV); gold.shift();
    }
    function yOf(lv, top, bot) { return bot - (lv - LO) / (HI - LO) * (bot - top); }
    function frame(now) {
      raf = 0;
      if (!cv || !host || host.hidden) return;
      var dt = Math.min(0.08, (now - last) / 1000); last = now;
      var w = cv.clientWidth, h = cv.clientHeight;
      DPR = Math.min(2, G.devicePixelRatio || 1);
      if (w !== W || h !== H) { W = w; H = h; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
      if (!W || !H) { raf = requestAnimationFrame(frame); return; }
      t += dt; stateT += dt;
      // the story: prices climb, gold reaches $100, everything falls, the floor reopens
      var steps = Math.round(dt * 26 + (frame.acc || 0)); frame.acc = dt * 26 + (frame.acc || 0) - steps;
      for (var s = 0; s < steps; s++) tick();
      if (state === 'run' && (goldV >= 100 || stateT > runFor + 6)) { state = 'crash'; stateT = 0; }
      else if (state === 'crash' && stateT > 0.95) { state = 'rest'; stateT = 0; }
      else if (state === 'rest' && stateT > 2.6) { state = 'run'; stateT = 0; runFor = rnd(9, 12); goldV = 20; for (var k = 0; k < N; k++) gold[k] = Math.min(gold[k], 20); }
      draw(Math.min(1, (t - born) / 1.6));
      if (lvl() > 0) raf = requestAnimationFrame(frame);
    }
    function draw(intro) {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.clearRect(0, 0, W, H);
      var top = H * 0.07, bot = H * 0.93, left = 0, right = W - 58, i, k;
      // ruled ledger lines with their prices
      g.font = '500 10px Oswald, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
      [5, 10, 20, 50, 100, 200].forEach(function (p) {
        var y = Math.round(yOf(Math.log(p), top, bot)) + 0.5;
        g.strokeStyle = 'rgba(231,214,170,.075)'; g.lineWidth = 1; g.beginPath(); g.moveTo(left, y); g.lineTo(W, y); g.stroke();
        g.fillStyle = 'rgba(231,214,170,.34)'; g.fillText('$' + p, W - 26, y - 7);
      });
      for (i = 0; i < 9; i++) {                                         // time, walking left
        var x = right - ((t * 26 * (right / N)) % (right / 8)) - i * (right / 8);
        if (x < 0) continue;
        g.strokeStyle = 'rgba(231,214,170,.05)'; g.beginPath(); g.moveTo(Math.round(x) + 0.5, top - 6); g.lineTo(Math.round(x) + 0.5, bot + 6); g.stroke();
      }
      var shown = Math.max(2, Math.round(N * intro)), x0 = right - (shown - 1) * (right / (N - 1));
      function path(arr, map) {
        g.beginPath();
        for (k = N - shown; k < N; k++) { var px = x0 + (k - (N - shown)) * (right / (N - 1)), py = map(arr[k]); if (k === N - shown) g.moveTo(px, py); else g.lineTo(px, py); }
      }
      // gold: a dashed brass line creeping toward the $100 that ends the game
      var gy = function (v) { return yOf(Math.log(v), top, bot); }, y100 = Math.round(gy(100)) + 0.5;
      g.setLineDash([2, 5]); g.strokeStyle = 'rgba(246,198,74,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y100); g.lineTo(W, y100); g.stroke();
      g.setLineDash([7, 5]); g.lineWidth = 1.6; g.strokeStyle = 'rgba(246,198,74,.9)'; path(gold, gy); g.stroke(); g.setLineDash([]);
      g.textAlign = 'left'; g.fillStyle = 'rgba(246,198,74,.85)'; g.font = '600 10px "Zen Kaku Gothic New", sans-serif';
      g.fillText('金が $100 に届くと取引停止', W > 900 ? W * 0.58 : 14, y100 - 9);
      // the five stocks
      var ly = function (v) { return yOf(v, top, bot); };
      series.forEach(function (s, c) {
        g.lineJoin = 'round'; g.lineCap = 'round';
        path(s.a, ly);
        g.strokeStyle = COLS[c]; g.globalAlpha = 0.16; g.lineWidth = 7; g.stroke();
        g.globalAlpha = 1; g.lineWidth = 1.9; g.stroke();
      });
      // where each price stands now
      var tags = series.map(function (s, c) { return { c: c, y: ly(s.a[N - 1]), p: Math.round(Math.exp(s.a[N - 1])) }; }).sort(function (a, b) { return a.y - b.y; });
      for (i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 15) tags[i].ty = (tags[i - 1].ty || tags[i - 1].y) + 15;
      g.font = '600 11px Oswald, sans-serif'; g.textAlign = 'left';
      tags.forEach(function (tg) {
        var ty = tg.ty || tg.y, yy = tg.y;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.9;
        var gr = g.createRadialGradient(right, yy, 0, right, yy, 11); gr.addColorStop(0, COLS[tg.c]); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(right, yy, 11, 0, TAU); g.fill();
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(right, yy, 2.2, 0, TAU); g.fill();
        g.fillStyle = COLS[tg.c]; g.globalAlpha = intro;
        var label = '$' + tg.p, tw = g.measureText(label).width + 10;
        g.beginPath(); if (g.roundRect) g.roundRect(right + 8, ty - 8, tw, 16, 3); else g.rect(right + 8, ty - 8, tw, 16); g.fill();
        g.fillStyle = tg.c === 0 || tg.c === 3 ? '#fff' : '#17231c'; g.fillText(label, right + 13, ty + 0.5);
        g.globalAlpha = 1;
      });
      var gyNow = gy(gold[N - 1]);
      g.fillStyle = '#f6c64a'; g.beginPath(); g.arc(right, gyNow, 2.6, 0, TAU); g.fill();
      // the crash
      if (state === 'crash' || (state === 'rest' && stateT < 1.5)) {
        var q = state === 'crash' ? stateT / 0.95 : 1, out = state === 'rest' ? clamp(1 - stateT / 1.5, 0, 1) : 1;
        g.fillStyle = 'rgba(214,40,30,' + (0.2 * out * (state === 'crash' ? 1 - q * 0.4 : 0.6)).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
        var sc = 1 + Math.pow(Math.max(0, 1 - q * 5), 2) * 2.4;
        g.save(); g.translate(W * 0.5, H * 0.5); g.rotate(-0.09); g.scale(sc, sc);
        g.globalAlpha = Math.min(1, q * 6) * out;
        g.font = '800 ' + Math.round(Math.min(H * 0.34, W * 0.3)) + 'px "Shippori Mincho B1", "Hiragino Mincho ProN", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.strokeStyle = 'rgba(60,8,6,.9)'; g.strokeText('暴落', 0, 0);
        g.fillStyle = '#ffe9e2'; g.fillText('暴落', 0, 0);
        g.restore(); g.globalAlpha = 1;
      }
    }
    return {
      start: function () {
        cv = document.getElementById('heroCanvas'); host = document.getElementById('scrTitle');
        if (!cv) return;
        g = cv.getContext('2d');
        if (!series.length) reset();
        if (raf) return;
        if (lvl() === 0) {                                              // one still picture of a market in full swing
          for (var i = 0; i < 400; i++) { t += 0.04; tick(); }
          W = 0; var w = cv.clientWidth, h = cv.clientHeight; W = w; H = h; DPR = Math.min(2, G.devicePixelRatio || 1);
          cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); if (W && H) draw(1);
          return;
        }
        born = t; last = performance.now(); raf = requestAnimationFrame(frame);
      }
    };
  })();

  /* ================================================================ numbers that roll */
  var shown = {};                                                       // key -> { v: the value on screen, raf }
  function fmt(n, e) { return (e.dataset.pre || '') + Math.round(n).toLocaleString('en-US') + (e.dataset.suf || ''); }
  function tween(root, ms) {
    var list = (root || document).querySelectorAll('[data-tw]');
    for (var i = 0; i < list.length; i++) roll(list[i], ms || 520);
  }
  function roll(e, ms) {
    var key = e.dataset.tw, to = Number(e.dataset.v), st = shown[key];
    if (!st) { shown[key] = { v: to, raf: 0 }; return; }
    if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    var from = st.v;
    if (from === to || lvl() === 0 || !isFinite(from)) { st.v = to; return; }
    var t0 = performance.now(), dir = to > from ? 'tw-up' : 'tw-dn';
    e.textContent = fmt(from, e);
    e.classList.add(dir);
    (function step(now) {
      if (!e.isConnected) { st.raf = 0; return; }                       // redrawn meanwhile: the new element carries on from st.v
      var k = Math.min(1, (now - t0) / ms), q = 1 - Math.pow(1 - k, 3);
      st.v = from + (to - from) * q;
      e.textContent = fmt(st.v, e);
      if (k < 1) st.raf = requestAnimationFrame(step);
      else { st.v = to; st.raf = 0; setTimeout(function () { e.classList.remove(dir); }, 420); }
    })(t0);
  }

  /* ================================================================ moments */
  function shakeTargets() { return document.querySelectorAll('#top,#ticker,#seats,#mkt,#me,#meters,#bagwrap,#boardWrap,#trend,#dock'); }
  function shake(q) { if (FX) FX.shake(shakeTargets(), q || 1); }

  /* glass breaking where something hit it: jagged rays, and rings of short cracks joining them */
  function crack(at, power) {
    if (lvl() < 1) return null;
    var p = FX ? FX.point(at) : { x: G.innerWidth / 2, y: G.innerHeight / 2 };
    var W = G.innerWidth, H = G.innerHeight, big = power || 1, R = Math.max(W, H) * (0.55 + 0.35 * big);
    var n = Math.round(9 + big * 5), rays = [], d = '', d2 = '', i, k;
    for (i = 0; i < n; i++) {
      var a = i / n * TAU + rnd(-0.22, 0.22), len = R * rnd(0.45, 1), pts = [[p.x, p.y]], segs = Math.round(5 + big * 3);
      for (k = 1; k <= segs; k++) { var rr = len * k / segs, aa = a + rnd(-0.11, 0.11) * (k / segs + 0.3); pts.push([p.x + Math.cos(aa) * rr, p.y + Math.sin(aa) * rr]); }
      rays.push(pts);
      d += 'M' + pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('L');
      if (Math.random() < 0.55) {                                       // a branch
        var from = pts[Math.floor(rnd(1, segs - 1))], ba = a + (Math.random() < 0.5 ? 1 : -1) * rnd(0.3, 0.7), bl = len * rnd(0.12, 0.3);
        d2 += 'M' + from[0].toFixed(1) + ' ' + from[1].toFixed(1) + 'L' + (from[0] + Math.cos(ba) * bl * 0.5 + rnd(-6, 6)).toFixed(1) + ' ' + (from[1] + Math.sin(ba) * bl * 0.5 + rnd(-6, 6)).toFixed(1) + 'L' + (from[0] + Math.cos(ba) * bl).toFixed(1) + ' ' + (from[1] + Math.sin(ba) * bl).toFixed(1);
      }
    }
    for (var ring = 1; ring <= 2 + Math.round(big); ring++) {
      for (i = 0; i < n; i++) {
        if (Math.random() < 0.3) continue;
        var A = rays[i], B = rays[(i + 1) % n], ia = Math.min(A.length - 1, ring), ib = Math.min(B.length - 1, ring);
        d2 += 'M' + A[ia][0].toFixed(1) + ' ' + A[ia][1].toFixed(1) + 'L' + B[ib][0].toFixed(1) + ' ' + B[ib][1].toFixed(1);
      }
    }
    var box = el('div', 'crackfx');
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="' + (2.6 + big) + '" transform="translate(1.5,2)"/>' +
      '<path class="c1" d="' + d + '" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="' + (1.1 + big * 0.5) + '" stroke-linejoin="bevel"/>' +
      '<path class="c2" d="' + d2 + '" fill="none" stroke="rgba(235,245,255,.6)" stroke-width="' + (0.7 + big * 0.2) + '"/>' +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (5 + big * 5) + '" fill="rgba(255,255,255,.8)"/></svg>';
    document.body.appendChild(box);
    var life = 1700 + big * 900;
    setTimeout(function () { box.classList.add('out'); setTimeout(function () { box.remove(); }, 900); }, life);
    return box;
  }
  /* the picture tearing for a moment */
  function glitch(ms) {
    if (lvl() < 2) return;
    var box = el('div', 'glitchfx'), bars = [], i;
    for (i = 0; i < 7; i++) { var b = el('i'); box.appendChild(b); bars.push(b); }
    document.body.appendChild(box);
    var t0 = performance.now(), D = ms || 460;
    (function step(now) {
      var k = (now - t0) / D;
      if (k >= 1) { box.remove(); return; }
      bars.forEach(function (b, j) {
        var h = rnd(0.6, 9) * (1 - k * 0.5);
        b.style.cssText = 'top:' + rnd(0, 100).toFixed(1) + '%;height:' + h.toFixed(1) + '%;transform:translateX(' + rnd(-26, 26).toFixed(0) + 'px);opacity:' + rnd(0.25, 0.85).toFixed(2) + ';background:' + (j % 3 === 0 ? 'rgba(255,40,40,.55)' : j % 3 === 1 ? 'rgba(60,220,255,.35)' : 'rgba(255,255,255,.22)');
      });
      setTimeout(function () { requestAnimationFrame(step); }, 34);
    })(t0);
  }
  /* the picture opening from the middle, like an iris */
  function iris(ms, at) {
    if (lvl() < 1) return;
    var box = el('div', 'irisfx'), t0 = performance.now(), D = ms || 760, W = G.innerWidth, H = G.innerHeight;
    var p = at && FX ? FX.point(at) : { x: W / 2, y: H * 0.42 }, R = Math.hypot(Math.max(p.x, W - p.x), Math.max(p.y, H - p.y)) + 60;
    document.body.appendChild(box);
    (function step(now) {
      var k = Math.min(1, (now - t0) / D), q = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2, r = R * q;
      var m = 'radial-gradient(circle at ' + p.x.toFixed(0) + 'px ' + p.y.toFixed(0) + 'px, transparent ' + Math.max(0, r - 2).toFixed(0) + 'px, #000 ' + (r + 46).toFixed(0) + 'px)';
      box.style.webkitMaskImage = m; box.style.maskImage = m;
      box.style.setProperty('--r', r.toFixed(0) + 'px'); box.style.setProperty('--x', p.x.toFixed(0) + 'px'); box.style.setProperty('--y', p.y.toFixed(0) + 'px');
      if (k < 1) requestAnimationFrame(step); else box.remove();
    })(t0);
  }
  /* cinema bars for the big scenes */
  function bars(on) {
    if (on && !document.getElementById('barT')) { var a = el('div'), b = el('div'); a.id = 'barT'; b.id = 'barB'; document.body.appendChild(a); document.body.appendChild(b); void a.offsetWidth; }
    document.body.classList.toggle('cine-bars', !!on && lvl() > 0);
  }
  /* trading halted: the colour drains from the floor (the sheets above it keep theirs) */
  function halt(on) {
    var old = document.querySelector('.haltfx');
    if (on && !old && lvl() > 0) document.body.appendChild(el('div', 'haltfx'));
    else if (!on && old) old.remove();
  }

  G.BF_STAGE = {
    ambient: ambient, hero: hero, tween: tween, shake: shake, crack: crack, glitch: glitch, iris: iris, bars: bars, halt: halt,
    resetNumbers: function () { for (var k in shown) { if (shown[k].raf) cancelAnimationFrame(shown[k].raf); } shown = {}; }
  };
})(window);
