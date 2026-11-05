/* 風の怪物ピラデロ — every painted surface of a card, drawn on canvases (no image files).
   Original designs for this app: ivory cards with a brass frame and gear pips for 1–8, two storm cards
   with a single glowing eye for 0 (blue) and 9 (red), a teal back with a compass rose in a gear ring.
   PD_CARDS.face(v) / back() / eye(color) / num(v, color) return canvases (cached); faceURL(v) a data URL. */
(function (root) {
  'use strict';
  var W = 320, H = 448;
  var NUM_FONT = '"Cinzel","Playfair Display","Bodoni 72",Didot,Georgia,serif';
  var JP_FONT = '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho",serif';
  var cache = {};

  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rr(x, X, y, w, h, r) {
    x.beginPath();
    x.moveTo(X + r, y); x.lineTo(X + w - r, y); x.quadraticCurveTo(X + w, y, X + w, y + r);
    x.lineTo(X + w, y + h - r); x.quadraticCurveTo(X + w, y + h, X + w - r, y + h);
    x.lineTo(X + r, y + h); x.quadraticCurveTo(X, y + h, X, y + h - r);
    x.lineTo(X, y + r); x.quadraticCurveTo(X, y, X + r, y); x.closePath();
  }
  function gearPath(x, cx, cy, ro, ri, teeth, hole) {
    x.beginPath();
    for (var i = 0; i < teeth; i++) {
      var a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.18) / teeth) * Math.PI * 2, a2 = ((i + 0.32) / teeth) * Math.PI * 2;
      var a3 = ((i + 0.68) / teeth) * Math.PI * 2, a4 = ((i + 0.82) / teeth) * Math.PI * 2;
      if (i === 0) x.moveTo(cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri);
      x.lineTo(cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri);
      x.lineTo(cx + Math.cos(a2) * ro, cy + Math.sin(a2) * ro);
      x.lineTo(cx + Math.cos(a3) * ro, cy + Math.sin(a3) * ro);
      x.lineTo(cx + Math.cos(a4) * ri, cy + Math.sin(a4) * ri);
      x.lineTo(cx + Math.cos(((i + 1) / teeth) * Math.PI * 2) * ri, cy + Math.sin(((i + 1) / teeth) * Math.PI * 2) * ri);
    }
    x.closePath();
    if (hole) { x.moveTo(cx + hole, cy); x.arc(cx, cy, hole, 0, Math.PI * 2, true); }
  }
  function brass(x, x0, y0, x1, y1) {
    var g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#6d4c18'); g.addColorStop(0.25, '#e6c46e'); g.addColorStop(0.5, '#9a7330'); g.addColorStop(0.75, '#f1d88f'); g.addColorStop(1, '#6d4c18');
    return g;
  }
  function speckle(x, w, h, n, alpha, dark) {
    for (var i = 0; i < n; i++) {
      x.fillStyle = dark ? 'rgba(60,40,10,' + (Math.random() * alpha) + ')' : 'rgba(255,255,255,' + (Math.random() * alpha) + ')';
      x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  function frame(x, colA, colB) {
    rr(x, 0, 0, W, H, 26); x.save(); x.clip();
    x.lineWidth = 14; x.strokeStyle = colA || brass(x, 0, 0, W, H); rr(x, 7, 7, W - 14, H - 14, 20); x.stroke();
    x.lineWidth = 2; x.strokeStyle = colB || 'rgba(110,80,30,.85)'; rr(x, 20, 20, W - 40, H - 40, 12); x.stroke();
    x.restore();
  }
  function cornerGears(x, color) {
    x.save(); x.fillStyle = color;
    [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]].forEach(function (p) { gearPath(x, p[0], p[1], 11, 8, 8, 3.2); x.fill('evenodd'); });
    x.restore();
  }
  function index(x, v, color, stroke) {
    x.save();
    x.font = '900 44px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 4; x.strokeStyle = stroke; x.fillStyle = color;
    // both corners upright (the table never turns a card round), and 6 / 9 underlined all the same
    [[60, 64], [W - 60, H - 64]].forEach(function (p) {
      x.strokeText(String(v), p[0], p[1]); x.fillText(String(v), p[0], p[1]);
      if (v === 6 || v === 9) { x.fillRect(p[0] - 13, p[1] + 22, 26, 4); }
    });
    x.restore();
  }

  /* ------------------------------------------------------------------ 1..8 */
  function paintPlain(v) {
    var c = cv(W, H), x = c.getContext('2d');
    rr(x, 0, 0, W, H, 26); x.save(); x.clip();
    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fbf3df'); g.addColorStop(0.55, '#efe0bd'); g.addColorStop(1, '#dcc597');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    speckle(x, W, H, 900, 0.18, true);
    // faint sky lines behind the number
    x.strokeStyle = 'rgba(120,90,40,.10)'; x.lineWidth = 2;
    for (var k = 0; k < 5; k++) { x.beginPath(); x.arc(W / 2, H * 0.44, 70 + k * 18, Math.PI * 0.15, Math.PI * 0.85, true); x.stroke(); }
    x.restore();
    frame(x);
    cornerGears(x, 'rgba(122,90,34,.7)');
    // the number
    x.save();
    x.font = '900 200px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(80,50,10,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    var ng = x.createLinearGradient(0, H * 0.25, 0, H * 0.62);
    ng.addColorStop(0, '#3a2a17'); ng.addColorStop(1, '#1b120a');
    x.fillStyle = ng; x.fillText(String(v), W / 2, H * 0.43);
    x.shadowColor = 'transparent';
    x.lineWidth = 3; x.strokeStyle = '#c99a3c'; x.strokeText(String(v), W / 2, H * 0.43);
    x.restore();
    // gear pips: as many as the number
    var rows = v <= 4 ? [v] : [Math.ceil(v / 2), Math.floor(v / 2)];
    rows.forEach(function (cnt, r) {
      var y = H * (rows.length === 1 ? 0.76 : 0.72 + r * 0.095), gap = 40, x0 = W / 2 - (cnt - 1) * gap / 2;
      for (var i = 0; i < cnt; i++) {
        x.save();
        x.fillStyle = brass(x, x0 + i * gap - 16, y - 16, x0 + i * gap + 16, y + 16);
        gearPath(x, x0 + i * gap, y, 16, 12, 10, 5); x.fill('evenodd');
        x.lineWidth = 1.2; x.strokeStyle = 'rgba(70,45,10,.75)'; x.stroke();
        x.restore();
      }
    });
    index(x, v, '#2a1d0f', '#f1dfb3');
    return c;
  }

  /* ------------------------------------------------------------------ 0 and 9: the storm eyes */
  function eye(x, cx, cy, w, h, iris, glow, fierce) {
    x.save();
    x.shadowColor = glow; x.shadowBlur = 38;
    x.beginPath();
    if (fierce) {
      x.moveTo(cx - w / 2, cy + h * 0.1);
      x.quadraticCurveTo(cx - w * 0.1, cy - h * 0.95, cx + w / 2, cy - h * 0.2);
      x.quadraticCurveTo(cx + w * 0.05, cy + h * 0.85, cx - w / 2, cy + h * 0.1);
    } else {
      x.moveTo(cx - w / 2, cy);
      x.quadraticCurveTo(cx, cy - h, cx + w / 2, cy);
      x.quadraticCurveTo(cx, cy + h, cx - w / 2, cy);
    }
    x.closePath();
    x.fillStyle = fierce ? '#160303' : '#06101d'; x.fill();
    x.lineWidth = 4; x.strokeStyle = glow; x.stroke();
    x.clip();
    x.shadowBlur = 0;
    var r = h * 0.42, ig = x.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    iris.forEach(function (s, i) { ig.addColorStop(i / (iris.length - 1), s); });
    x.fillStyle = ig; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    // iris fibres
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1.5;
    for (var k = 0; k < 28; k++) { var a = k / 28 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35); x.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); x.stroke(); }
    x.fillStyle = '#020306'; x.beginPath(); x.ellipse(cx, cy, r * (fierce ? 0.16 : 0.22), r * 0.86, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.ellipse(cx - r * 0.35, cy - r * 0.38, r * 0.13, r * 0.09, -0.5, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  function cloudPuffs(x, list, color) {
    x.save(); x.fillStyle = color;
    list.forEach(function (p) { x.beginPath(); x.ellipse(p[0], p[1], p[2], p[2] * 0.55, 0, 0, Math.PI * 2); x.fill(); });
    x.restore();
  }
  function paintMonster(v) {
    var blue = v === 0, c = cv(W, H), x = c.getContext('2d');
    rr(x, 0, 0, W, H, 26); x.save(); x.clip();
    var g = x.createRadialGradient(W / 2, H * 0.46, 10, W / 2, H * 0.46, H * 0.7);
    if (blue) { g.addColorStop(0, '#3f93cf'); g.addColorStop(0.4, '#123a66'); g.addColorStop(1, '#040d1c'); }
    else { g.addColorStop(0, '#c4291f'); g.addColorStop(0.42, '#560c0b'); g.addColorStop(1, '#130202'); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    speckle(x, W, H, 500, blue ? 0.25 : 0.18, false);
    // wind: long arcs sweeping across the card
    x.lineCap = 'round';
    for (var k = 0; k < 7; k++) {
      x.strokeStyle = blue ? 'rgba(200,236,255,' + (0.12 + k * 0.03) + ')' : 'rgba(255,190,140,' + (0.08 + k * 0.025) + ')';
      x.lineWidth = 2 + (k % 3);
      x.beginPath();
      var y0 = H * (0.18 + k * 0.1);
      x.moveTo(-10, y0); x.bezierCurveTo(W * 0.3, y0 - 40 + k * 6, W * 0.65, y0 + 50 - k * 9, W + 10, y0 - 10);
      x.stroke();
    }
    if (!blue) {
      // lightning
      x.save(); x.strokeStyle = '#fff2b8'; x.shadowColor = '#ffcf6a'; x.shadowBlur = 16; x.lineWidth = 3; x.lineJoin = 'miter';
      [[60, 30, [[78, 70], [58, 96], [84, 140], [66, 170]]], [262, 300, [[244, 334], [270, 352], [246, 400], [262, 430]]]].forEach(function (b) {
        x.beginPath(); x.moveTo(b[0], b[1]); b[2].forEach(function (p) { x.lineTo(p[0], p[1]); }); x.stroke();
      });
      x.restore();
    }
    cloudPuffs(x, [[40, H - 40, 70], [130, H - 22, 80], [240, H - 34, 90], [300, H - 70, 60], [20, 110, 50], [290, 120, 46]], blue ? 'rgba(220,240,255,.20)' : 'rgba(0,0,0,.38)');
    cloudPuffs(x, [[90, H - 60, 50], [210, H - 70, 56]], blue ? 'rgba(240,250,255,.18)' : 'rgba(40,0,0,.35)');
    x.restore();
    frame(x, blue ? (function () { var b = x.createLinearGradient(0, 0, W, H); b.addColorStop(0, '#2f5d80'); b.addColorStop(0.5, '#cfe9fb'); b.addColorStop(1, '#2f5d80'); return b; })() : brass(x, 0, 0, W, H), blue ? 'rgba(190,230,255,.6)' : 'rgba(255,200,120,.55)');
    cornerGears(x, blue ? 'rgba(190,230,255,.55)' : 'rgba(255,190,110,.6)');
    if (blue) eye(x, W / 2, H * 0.47, 230, 118, ['#f1fcff', '#8fe3ff', '#2aa7e8', '#0b4f8a'], '#6fd6ff', false);
    else {
      eye(x, W / 2, H * 0.48, 236, 124, ['#fff6c2', '#ffb03a', '#ff3b1f', '#6a0505'], '#ff4a2a', true);
      x.save(); x.strokeStyle = '#ff7a52'; x.lineWidth = 6; x.lineCap = 'round'; x.shadowColor = '#ff3b1f'; x.shadowBlur = 14;
      x.beginPath(); x.moveTo(W * 0.2, H * 0.3); x.lineTo(W * 0.47, H * 0.36); x.stroke();
      x.beginPath(); x.moveTo(W * 0.8, H * 0.28); x.lineTo(W * 0.56, H * 0.35); x.stroke();
      x.restore();
    }
    // big number under the eye, and the name of the eye
    x.save();
    x.font = '900 92px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = blue ? '#6fd6ff' : '#ff4a2a'; x.shadowBlur = 22;
    x.fillStyle = blue ? '#e9f8ff' : '#fff0d0'; x.fillText(String(v), W / 2, H * 0.73);
    x.shadowBlur = 0;
    x.font = '800 24px ' + JP_FONT; x.fillStyle = blue ? '#cfeeff' : '#ffd9b0';
    x.fillText(blue ? '蒼 き 眼' : '紅 き 眼', W / 2, H * 0.85);
    x.restore();
    index(x, v, blue ? '#e9f8ff' : '#fff0d0', blue ? '#0b2a4a' : '#3a0505');
    return c;
  }

  /* ------------------------------------------------------------------ the back */
  function paintBack() {
    var c = cv(W, H), x = c.getContext('2d');
    rr(x, 0, 0, W, H, 26); x.save(); x.clip();
    var g = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.65);
    g.addColorStop(0, '#24585e'); g.addColorStop(0.6, '#123438'); g.addColorStop(1, '#081a1d');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(226,192,111,.07)'; x.lineWidth = 2;
    for (var i = -H; i < W + H; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - H, H); x.stroke(); x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); }
    x.restore();
    frame(x, null, 'rgba(226,192,111,.55)');
    cornerGears(x, 'rgba(226,192,111,.7)');
    var cx = W / 2, cy = H / 2;
    x.save();
    x.fillStyle = brass(x, cx - 90, cy - 90, cx + 90, cy + 90);
    gearPath(x, cx, cy, 92, 82, 24, 72); x.fill('evenodd');
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(40,25,5,.7)'; x.stroke();
    x.strokeStyle = 'rgba(226,192,111,.6)'; x.lineWidth = 2;
    x.beginPath(); x.arc(cx, cy, 62, 0, Math.PI * 2); x.stroke();
    // compass rose
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2 - Math.PI / 2, long = k % 2 === 0 ? 60 : 36;
      x.save(); x.translate(cx, cy); x.rotate(a);
      x.beginPath(); x.moveTo(long, 0); x.lineTo(0, 7); x.lineTo(0, -7); x.closePath();
      x.fillStyle = k % 2 === 0 ? brass(x, 0, -7, long, 7) : 'rgba(226,192,111,.55)'; x.fill();
      x.restore();
    }
    x.fillStyle = '#123438'; x.beginPath(); x.arc(cx, cy, 9, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e6c46e'; x.lineWidth = 2; x.stroke();
    x.restore();
    // a tiny key under the rose
    x.save(); x.translate(cx, cy + 128); x.fillStyle = 'rgba(226,192,111,.8)';
    x.beginPath(); x.arc(-26, 0, 9, 0, Math.PI * 2); x.arc(-26, 0, 4, 0, Math.PI * 2, true); x.fill('evenodd');
    x.fillRect(-17, -2.5, 44, 5); x.fillRect(16, 2, 4, 8); x.fillRect(23, 2, 4, 6);
    x.restore();
    return c;
  }

  /* ------------------------------------------------------------------ small round badges (sprites) */
  function paintEye(color) {
    var s = 96, c = cv(s, s), x = c.getContext('2d');
    x.fillStyle = color; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); x.fill();
    x.lineWidth = 5; x.strokeStyle = '#fff8e8'; x.stroke();
    x.fillStyle = '#fff8e8';
    x.beginPath(); x.moveTo(s * 0.2, s / 2); x.quadraticCurveTo(s / 2, s * 0.22, s * 0.8, s / 2); x.quadraticCurveTo(s / 2, s * 0.78, s * 0.2, s / 2); x.fill();
    x.fillStyle = '#1b1208'; x.beginPath(); x.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2); x.fill();
    return c;
  }
  function paintNum(v, color) {
    var s = 96, c = cv(s, s), x = c.getContext('2d');
    x.fillStyle = color || '#e6c46e'; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff6dc'; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 11, 0, Math.PI * 2); x.fill();
    x.font = '900 52px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = v === 0 ? '#0b4f8a' : v === 9 ? '#9a0f0a' : '#24170a';
    x.fillText(String(v), s / 2, s / 2 + 3);
    return c;
  }

  function get(key, make) { if (!cache[key]) cache[key] = make(); return cache[key]; }
  var api = {
    W: W, H: H,
    face: function (v) { return get('f' + v, function () { return v === 0 || v === 9 ? paintMonster(v) : paintPlain(v); }); },
    back: function () { return get('back', paintBack); },
    eye: function (color) { return get('e' + color, function () { return paintEye(color); }); },
    num: function (v, color) { return get('n' + v + (color || ''), function () { return paintNum(v, color); }); },
    faceURL: function (v, w) {
      return get('u' + v + '-' + (w || 120), function () {
        var src = api.face(v), ww = w || 120, hh = Math.round(ww * H / W), c = cv(ww, hh);
        c.getContext('2d').drawImage(src, 0, 0, ww, hh);
        return c.toDataURL('image/png');
      });
    },
    backURL: function (w) {
      return get('ub-' + (w || 120), function () {
        var ww = w || 120, hh = Math.round(ww * H / W), c = cv(ww, hh);
        c.getContext('2d').drawImage(api.back(), 0, 0, ww, hh);
        return c.toDataURL('image/png');
      });
    },
    fontsReady: function (ms) {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      var all = Promise.all(['900 64px "Cinzel"', '800 24px "Shippori Mincho B1"'].map(function (f) { return document.fonts.load(f).catch(function () {}); }));
      return Promise.race([all, new Promise(function (r) { setTimeout(r, ms || 2500); })]);
    },
    reset: function () { cache = {}; }
  };
  root.PD_CARDS = api;
})(typeof window !== 'undefined' ? window : this);
