/* ×ing／バッティング (browser edition): the 3D table (three.js r128).
   Gem tables in the middle, one vault per hand around them, a tray beside each vault for
   secured gems, and the gem bag at the side. All textures and models are generated here. */
(function (G) {
  'use strict';
  var T = G.THREE, E = G.XING_ENG;
  if (!T) return;

  var PCOL = ['#ff8a5c', '#2ec4b6', '#b18cff', '#a5d84e', '#ff73b9', '#56cdf5'];   // seat colours (not gem colours)
  var TS = 2.5, TH = 0.24;          // gem table tile
  var VS = 2.2, VH = 0.16;          // vault tile
  var KW = 1.3, KD = 2.2;           // secured-gem tray (local x / z)
  var GAP = 3.8;                    // space between gem tables keeps stones and labels apart
  var FONT = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif';
  var NUM_FONT = '"Fredoka", "Arial Rounded MT Bold", Arial, sans-serif';

  function lin(hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function srgbTex(c, aniso) { var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; if (aniso) t.anisotropy = aniso; return t; }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rrPath(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function roundRect(w, h, r) {
    var s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function rrHole(w, h, r) { var s = roundRect(w, h, r), p = new T.Path(); p.setFromPoints(s.getPoints(8).reverse()); return p; }
  function slab(w, d, h, r) {
    var g = new T.ExtrudeGeometry(roundRect(w, d, r), { depth: h - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 6 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0); g.computeVertexNormals();
    return g;
  }
  function hash(n) { var t = (n * 2654435761) >>> 0; t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967296; }

  /* ---------- gem models: round (blue), triangle (yellow), square (red), tall hexagon (white) ---------- */
  var GEMS = [
    { col: '#2565ef', em: '#163574', edge: '#90c4ff', seg: 12, r: 0.28, top: 0.22, prof: [[0.001, -0.21], [1, 0], [1, 0.05], [0.64, 0.22], [0.001, 0.22]] },
    { col: '#ffc72c', em: '#6c4706', edge: '#fff2ad', seg: 3, r: 0.34, top: 0.26, prof: [[0.001, -0.22], [1, 0], [1, 0.07], [0.6, 0.26], [0.001, 0.26]], phi: Math.PI / 2 },
    { col: '#ee1740', em: '#750c28', edge: '#ffafc4', seg: 4, r: 0.4, top: 0.31, prof: [[0.001, -0.27], [0.7, -0.13], [1, 0], [1, 0.08], [0.64, 0.31], [0.001, 0.31]], phi: Math.PI / 4 },
    { col: '#e5f5ff', em: '#455972', edge: '#ffffff', seg: 6, r: 0.43, top: 0.4, prof: [[0.001, -0.31], [0.64, -0.17], [1, 0], [1, 0.1], [0.57, 0.4], [0.001, 0.4]] }
  ];
  function gemGeometry(k) {
    var gm = GEMS[k], pts = gm.prof.map(function (p) { return new T.Vector2(p[0] * (p[0] > 0.01 ? gm.r : 1), p[1]); });
    var g = new T.LatheGeometry(pts, gm.seg, gm.phi || 0, Math.PI * 2).toNonIndexed();
    // Flat face colours make the cut readable without relying on tiny reflected highlights.
    var pos = g.attributes.position, colours = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    for (var i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      var normal = b.sub(a).cross(c.sub(a)).normalize();
      var shade = 0.64 + 0.28 * Math.max(0, normal.y) + 0.1 * Math.sin(i * 0.7);
      var colour = new T.Color(gm.col).lerp(new T.Color('#ffffff'), Math.max(0, normal.y) * (k === 3 ? 0.38 : 0.22)).multiplyScalar(shade).convertSRGBToLinear();
      for (var v = 0; v < 3; v++) colours.push(colour.r, colour.g, colour.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
    g.computeVertexNormals();
    return g;
  }
  function settingGeometry(k) {
    var gm = GEMS[k], rim = k === 3 ? 1.12 : 1.07;
    var pts = [[rim, -0.025], [rim, 0.045], [1, 0.065], [1, -0.025], [rim, -0.025]].map(function (p) { return new T.Vector2(gm.r * p[0], p[1]); });
    return new T.LatheGeometry(pts, gm.seg, gm.phi || 0);
  }

  // Shared, camera-facing number labels stay readable when the table is rotated.
  function gemPointsTex(k) {
    var c = canvas(128, 96), x = c.getContext('2d');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + (k === 3 ? 60 : 72) + 'px Arial, sans-serif';
    x.lineJoin = 'round'; x.lineWidth = 10;
    x.strokeStyle = k === 3 ? '#ffffff' : '#10142a';
    x.fillStyle = k === 3 ? '#141933' : '#ffffff';
    var text = k === 3 ? 'n²' : String(E.POINTS[k]);
    x.strokeText(text, 64, 50); x.fillText(text, 64, 50);
    return c;
  }

  /* ---------- environment for the sparkle: a dim room with a few soft boxes ---------- */
  function makeEnv(renderer) {
    var sc = new T.Scene();
    var geo = new T.SphereGeometry(20, 32, 16), pos = geo.attributes.position, col = [];
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i) / 20, c = new T.Color().setHSL(0.66, 0.35, 0.05 + 0.32 * Math.max(0, y) * Math.max(0, y));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    [[0, 16, 0, 12, 12, 5], [12, 7, 6, 5, 7, 3.2], [-13, 6, -5, 4, 8, 2.6], [4, 5, -14, 8, 3, 2.2], [-6, 3, 13, 6, 2, 1.8]].forEach(function (p) {
      var m = new T.Mesh(new T.PlaneGeometry(p[3], p[4]), new T.MeshBasicMaterial({ color: new T.Color(p[5], p[5], p[5] * 0.96), side: T.DoubleSide }));
      m.position.set(p[0], p[1], p[2]); m.lookAt(0, 0, 0); sc.add(m);
    });
    var pm = new T.PMREMGenerator(renderer);
    var rt = pm.fromScene(sc, 0.015);
    pm.dispose();
    return rt.texture;
  }

  /* ---------- textures ---------- */
  function feltTex(w, h, L) {
    var c = canvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#16213f'; x.fillRect(0, 0, w, h);
    var img = x.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) { var v = (Math.random() - 0.5) * 14; d[i] += v; d[i + 1] += v; d[i + 2] += v * 1.2; }
    x.putImageData(img, 0, 0);
    // a quiet diamond pattern woven into the cloth
    x.strokeStyle = 'rgba(160,180,255,0.045)'; x.lineWidth = 2;
    var step = w / 22;
    for (var k = -h; k < w + h; k += step) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + h, h); x.stroke(); x.beginPath(); x.moveTo(k, h); x.lineTo(k + h, 0); x.stroke(); }
    var g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(120,140,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (L) {
      // a faint gold line around the gem-table area
      var k2 = w / (L.hx * 2);
      x.strokeStyle = 'rgba(242,193,78,0.22)'; x.lineWidth = 0.05 * k2; x.setLineDash([0.25 * k2, 0.18 * k2]);
      rrPath(x, (L.cx0 + L.hx) * k2, (L.cz0 + L.hz) * k2, (L.cx1 - L.cx0) * k2, (L.cz1 - L.cz0) * k2, 0.7 * k2); x.stroke();
    }
    return c;
  }
  function woodTex(w, h) {
    var c = canvas(w, h), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4a2a1a'); g.addColorStop(0.5, '#64381f'); g.addColorStop(1, '#3f2314');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 60; i++) {
      x.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '30,14,6' : '170,120,80') + ',' + (0.05 + Math.random() * 0.1) + ')';
      x.lineWidth = 1 + Math.random() * 2;
      var y = Math.random() * h; x.beginPath(); x.moveTo(0, y);
      for (var px = 0; px <= w; px += w / 8) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 3 + (Math.random() - 0.5) * 2);
      x.stroke();
    }
    return c;
  }
  /* gem table top: dark velvet cushion, gold frame, the table's letter in a corner */
  function tableTopTex(letter) {
    var c = canvas(512, 512), x = c.getContext('2d');
    var g = x.createRadialGradient(256, 256, 40, 256, 256, 330); g.addColorStop(0, '#3a1e4f'); g.addColorStop(1, '#1d0f2a');
    x.fillStyle = '#16121f'; x.fillRect(0, 0, 512, 512);
    rrPath(x, 26, 26, 460, 460, 54); x.fillStyle = g; x.fill();
    x.lineWidth = 10; x.strokeStyle = '#d6aa45'; x.stroke();
    rrPath(x, 46, 46, 420, 420, 40); x.lineWidth = 3; x.strokeStyle = 'rgba(242,193,78,0.45)'; x.stroke();
    for (var i = 0; i < 1600; i++) { x.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.03 + ')'; x.fillRect(30 + Math.random() * 452, 30 + Math.random() * 452, 2, 2); }
    x.beginPath(); x.arc(256, 256, 150, 0, Math.PI * 2); x.strokeStyle = 'rgba(242,193,78,0.16)'; x.lineWidth = 4; x.stroke();
    x.font = '700 70px ' + NUM_FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(242,193,78,0.85)'; x.fillText(letter, 96, 100);
    return c;
  }
  /* vault face: ivory plate with a safe dial and the owner's colour band; the back shows the rest ✕ */
  function vaultTex(color, label) {
    var c = canvas(512, 512), x = c.getContext('2d');
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 512, 512);
    var g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(120,100,60,0.18)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.fillStyle = color; x.fillRect(0, 452, 512, 60);
    rrPath(x, 22, 22, 468, 418, 30); x.lineWidth = 6; x.strokeStyle = 'rgba(90,70,40,0.35)'; x.stroke();
    x.save(); x.translate(256, 230);
    x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2); x.strokeStyle = 'rgba(90,70,40,0.22)'; x.lineWidth = 8; x.stroke();
    for (var i = 0; i < 24; i++) { x.save(); x.rotate(i * Math.PI / 12); x.fillStyle = 'rgba(90,70,40,0.25)'; x.fillRect(-3, -150, 6, i % 2 ? 14 : 24); x.restore(); }
    x.restore();
    x.font = '900 40px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1c1a2e'; x.fillText(label, 256, 482);
    return c;
  }
  function restTex() {
    var c = canvas(512, 512), x = c.getContext('2d');
    x.fillStyle = '#5c1620'; x.fillRect(0, 0, 512, 512);
    rrPath(x, 22, 22, 468, 468, 30); x.lineWidth = 8; x.strokeStyle = 'rgba(255,220,200,0.35)'; x.stroke();
    x.strokeStyle = '#ffd9cf'; x.lineCap = 'round'; x.lineWidth = 46;
    x.beginPath(); x.moveTo(150, 150); x.lineTo(362, 362); x.moveTo(362, 150); x.lineTo(150, 362); x.stroke();
    x.font = '900 46px ' + FONT; x.textAlign = 'center'; x.fillStyle = '#ffd9cf'; x.fillText('休み', 256, 462);
    return c;
  }
  function trayTex() {
    var c = canvas(256, 432), x = c.getContext('2d');
    x.fillStyle = '#0f3a3f'; x.fillRect(0, 0, 256, 432);
    var g = x.createRadialGradient(128, 216, 20, 128, 216, 250); g.addColorStop(0, 'rgba(110,227,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 432);
    rrPath(x, 10, 10, 236, 412, 22); x.lineWidth = 5; x.strokeStyle = 'rgba(111,227,255,0.55)'; x.stroke();
    // lock
    x.save(); x.translate(128, 392); x.fillStyle = 'rgba(111,227,255,0.6)';
    rrPath(x, -18, -6, 36, 28, 5); x.fill();
    x.beginPath(); x.lineWidth = 6; x.strokeStyle = 'rgba(111,227,255,0.6)'; x.arc(0, -8, 12, Math.PI, 0); x.stroke();
    x.restore();
    return c;
  }
  function crossTex() {
    var c = canvas(256, 256), x = c.getContext('2d');
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(40,0,0,0.6)'; x.lineWidth = 46; x.beginPath(); x.moveTo(60, 60); x.lineTo(196, 196); x.moveTo(196, 60); x.lineTo(60, 196); x.stroke();
    x.strokeStyle = '#ff4d4d'; x.lineWidth = 32; x.stroke();
    return c;
  }
  function starTex() {
    var c = canvas(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(64, 0); x.quadraticCurveTo(70, 58, 128, 64); x.quadraticCurveTo(70, 70, 64, 128); x.quadraticCurveTo(58, 70, 0, 64); x.quadraticCurveTo(58, 58, 64, 0); x.fill();
    return c;
  }
  function hexTex() {
    var c = canvas(256, 256), x = c.getContext('2d');
    x.strokeStyle = 'rgba(160,240,255,0.9)'; x.lineWidth = 3;
    var r = 18, w = r * Math.sqrt(3);
    for (var row = -1; row < 12; row++) for (var col = -1; col < 10; col++) {
      var cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
      x.beginPath();
      for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; k ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.closePath(); x.stroke();
    }
    return c;
  }
  function bagTex() {
    var c = canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#5a2a72'; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,220,255') + ',' + Math.random() * 0.08 + ')'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    x.strokeStyle = 'rgba(242,193,78,0.6)'; x.lineWidth = 4;
    for (var k = 0; k < 256; k += 32) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 16, 256); x.stroke(); }
    return c;
  }

  /* ---------- layout ---------- */
  function seatAngles(nA, two) {
    var d = Math.PI / 180;
    if (two) return [-36 * d, 36 * d, 144 * d, 216 * d];       // my left, my right, their left (my right side), their right
    var out = [];
    for (var i = 0; i < nA; i++) out.push(i * 2 * Math.PI / nA);
    return out;
  }
  function layoutFor(nA, nt, tall, two) {
    var tables = [];
    if (!tall || nt <= 2) {
      if (tall) for (var i = 0; i < nt; i++) tables.push({ x: 0, z: (i - (nt - 1) / 2) * GAP });
      else for (var j = 0; j < nt; j++) tables.push({ x: (j - (nt - 1) / 2) * GAP, z: 0 });
    } else if (nt === 3) {
      for (var k = 0; k < 3; k++) tables.push({ x: 0, z: (k - 1) * GAP });
    } else {
      var rows = Math.ceil(nt / 2);
      for (var m = 0; m < nt; m++) {
        var col = m % 2, row = Math.floor(m / 2), inRow = Math.min(2, nt - row * 2);
        tables.push({ x: inRow === 1 ? 0 : (col - 0.5) * GAP, z: (row - (rows - 1) / 2) * GAP });
      }
    }
    var cx0 = 1e9, cx1 = -1e9, cz0 = 1e9, cz1 = -1e9;
    tables.forEach(function (t) { cx0 = Math.min(cx0, t.x - TS / 2); cx1 = Math.max(cx1, t.x + TS / 2); cz0 = Math.min(cz0, t.z - TS / 2); cz1 = Math.max(cz1, t.z + TS / 2); });
    var hw = Math.max(cx1, -cx0), hh = Math.max(cz1, -cz0);
    var rx = hw + (tall ? 3.1 : 4.4) + (two ? (tall ? 0.4 : 0.6) : 0), rz = hh + (tall ? 3.7 : 3.9) + (two ? 0.4 : 0);
    if (nA >= 5 && !tall) rx += 0.6;
    if (nA >= 5 && tall) rz += 0.5;
    var seats = seatAngles(nA, two).map(function (phi) {
      // two players sit side by side, each pair of hands facing the table squarely
      var x = Math.sin(phi) * rx, z = Math.cos(phi) * rz, yaw = two ? (z > 0 ? 0 : Math.PI) : Math.atan2(x, z);
      // the secured-gem tray goes on the side that runs along the screen's long axis
      var c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
      var right = tall ? sn >= c - 0.05 : c >= sn - 0.05;
      var seat = { x: x, z: z, yaw: yaw, tray: right ? 'right' : 'out' };
      // name tag: outside the seat for top/bottom seats, above or below the vault for side seats
      if (sn <= c + 0.05) seat.tag = right ? local2world(seat, 0.45, VS / 2 + 0.55) : local2world(seat, 0, VS / 2 + 0.22 + KW + 0.5);
      else {
        var tl = trayLocal(seat, 0, 0), tw = local2world(seat, tl[0], tl[1]), dz = tw.z - z;
        seat.tag = { x: x, z: z + (Math.abs(dz) > 0.5 ? -Math.sign(dz) : z >= 0 ? 1 : -1) * (VS / 2 + 0.5) };
      }
      return seat;
    });
    var hx = 0, hz = 0;
    seats.forEach(function (s) {
      hx = Math.max(hx, Math.abs(s.tag.x) + 2.2); hz = Math.max(hz, Math.abs(s.tag.z) + 1.2);
      [[-VS / 2, -VS / 2], [VS / 2, VS / 2 + 1.0]].concat(s.tray === 'right' ? [[VS / 2 + 0.3 + KW, 0]] : [[0, VS / 2 + 0.3 + KW + 1.0]]).forEach(function (q) {
        var w = local2world(s, q[0], q[1]); hx = Math.max(hx, Math.abs(w.x) + 1.2); hz = Math.max(hz, Math.abs(w.z) + 1.2);
      });
    });
    hx = Math.max(hx, hw + 3); hz = Math.max(hz, hh + 3);
    // the bag goes where it is farthest from every seat, tray and gem table (upper side preferred)
    var bag = null, bestScore = -1e9;
    for (var bx = -hx + 1.3; bx <= hx - 1.3; bx += 0.5) for (var bz = -hz + 1.3; bz <= hz - 1.3; bz += 0.5) {
      var dmin = 1e9;
      tables.forEach(function (t) { dmin = Math.min(dmin, Math.max(Math.abs(bx - t.x), Math.abs(bz - t.z)) - TS / 2 - 1.0); });
      seats.forEach(function (s) {
        var c2 = s.tray === 'right' ? local2world(s, (VS / 2 + 0.22 + KW / 2) / 2, 0.2) : local2world(s, 0, (VS / 2 + 0.22 + KW / 2) / 2 + 0.2);
        dmin = Math.min(dmin, Math.hypot(bx - c2.x, bz - c2.z) - 3.0);
      });
      var score = Math.min(dmin, 1.6) - bz * 0.04 - Math.abs(bx) * 0.01 + (bx < 0 ? 0.05 : 0);
      if (score > bestScore) { bestScore = score; bag = { x: bx, z: bz }; }
    }
    return { tables: tables, seats: seats, bag: bag, hx: hx, hz: hz, cx0: cx0 - 0.4, cx1: cx1 + 0.4, cz0: cz0 - 0.4, cz1: cz1 + 0.4, nA: nA, nt: nt, tall: tall, two: two };
  }
  /* tray coordinates (u across, v along the long side) to seat coordinates */
  function trayLocal(seat, u, v) {
    var c = VS / 2 + 0.22 + KW / 2;
    return seat.tray === 'right' ? [c + u, v] : [v, c - u];
  }
  function local2world(seat, lx, lz) {
    var c = Math.cos(seat.yaw), s = Math.sin(seat.yaw);
    return { x: seat.x + lx * c + lz * s, z: seat.z - lx * s + lz * c };
  }
  /* hex-packed spots on a round cushion, nearest the centre first */
  function hexSpots(radius, step) {
    var out = [];
    for (var r = -6; r <= 6; r++) for (var q = -6; q <= 6; q++) {
      var x = (q + r / 2) * step, z = r * step * Math.sqrt(3) / 2;
      if (Math.hypot(x, z) <= radius + 1e-6) out.push([x, z]);
    }
    out.sort(function (a, b) { return Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]); });
    return out;
  }
  var TABLE_SPOTS = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
  var VAULT_SPOTS = [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]];
  var GS_T = 1.18, GS_V = 1.03, GS_K = 0.64;           // fit even the larger white setting without touching neighbours
  function displaySpot(spots, j, n) {
    // The usual two gems sit side by side, centred on the cushion.
    if (n <= 2) return n === 1 ? [0, 0] : [spots[j][0], 0];
    return spots[j % spots.length];
  }

  /* ---------- Scene ---------- */
  function Scene(host) {
    this.host = host;
    var r = this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.setClearColor(0x080b16, 1);
    host.appendChild(r.domElement);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 1, 0.5, 400);
    this.quality = 'high';
    this.gems = {};
    this.layout = null; this.state = null; this.mySeat = -1;
    this.camYaw = 0; this.camPitchAdj = 0; this.camZoom = 1; this.pan = new T.Vector3(); this.camAnim = null;
    this.hl = { legal: [], sel: {} };
    this.clock = 0; this.attract = false; this.tweens = []; this.fx = []; this.speed = 1;
    this.reserve = { top: 12, bottom: 12, left: 8, right: 8 };
    this._build();
    this.resize();
    var self = this;
    this._raf = function (t) { self._frame(t); requestAnimationFrame(self._raf); };
    requestAnimationFrame(this._raf);
  }
  Scene.prototype._build = function () {
    var sc = this.scene, self = this, aniso = this.renderer.capabilities.getMaxAnisotropy();
    sc.add(new T.HemisphereLight(0xe8ecff, 0x1a1830, 0.55));
    var key = this.key = new T.DirectionalLight(0xfff2e0, 1.0);
    key.position.set(6, 24, 14); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    var sh = key.shadow.camera; sh.left = -20; sh.right = 20; sh.top = 20; sh.bottom = -20; sh.near = 5; sh.far = 70;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    sc.add(key);
    var fill = new T.DirectionalLight(0xbcd2ff, 0.3); fill.position.set(-14, 10, -10); sc.add(fill);
    var spot = this.spot = new T.PointLight(0xfff0d0, 0.5, 40, 2); spot.position.set(0, 9, 2); sc.add(spot);

    this.env = makeEnv(this.renderer);
    this.feltCanvas = canvas(1024, 1024);
    this.feltTex = srgbTex(this.feltCanvas, aniso);
    this.feltMat = new T.MeshStandardMaterial({ map: this.feltTex, roughness: 0.96, metalness: 0 });
    this.felt = new T.Mesh(new T.PlaneGeometry(1, 1), this.feltMat);
    this.felt.rotation.x = -Math.PI / 2; this.felt.receiveShadow = true; sc.add(this.felt);
    var wood = srgbTex(woodTex(1024, 128)); wood.wrapS = wood.wrapT = T.RepeatWrapping;
    this.woodMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.5, metalness: 0.05, envMap: this.env, envMapIntensity: 0.35 });
    this.tableGroup = new T.Group(); sc.add(this.tableGroup);
    var floor = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshBasicMaterial({ color: lin('#070a14') }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; sc.add(floor);

    // shared geometry & materials
    this.tableGeo = slab(TS, TS, TH, 0.32);
    this.vaultGeo = slab(VS, VS, VH, 0.26);
    this.trayGeo = slab(KW, KD, 0.1, 0.2);
    this.decalGeo = { t: new T.PlaneGeometry(TS - 0.04, TS - 0.04), v: new T.PlaneGeometry(VS - 0.04, VS - 0.04), k: new T.PlaneGeometry(KW - 0.06, KD - 0.06) };
    this.tableBodyMat = new T.MeshStandardMaterial({ color: lin('#1a1626'), roughness: 0.45, metalness: 0.3, envMap: this.env, envMapIntensity: 0.6 });
    this.vaultBodyMat = new T.MeshStandardMaterial({ color: lin('#d9cdb3'), roughness: 0.5, metalness: 0.05, envMap: this.env, envMapIntensity: 0.4 });
    this.trayBodyMat = new T.MeshStandardMaterial({ color: lin('#0d2a2f'), roughness: 0.6, metalness: 0.1 });
    this.trayTopMat = new T.MeshStandardMaterial({ map: srgbTex(trayTex(), aniso), roughness: 0.9 });
    this.restMat = new T.MeshStandardMaterial({ map: srgbTex(restTex(), aniso), roughness: 0.6 });
    this.gemGeo = [0, 1, 2, 3].map(gemGeometry);
    this.gemEdgeGeo = this.gemGeo.map(function (g) { return new T.EdgesGeometry(g, 24); });
    this.gemEdgeMat = GEMS.map(function (g) { return new T.LineBasicMaterial({ color: lin(g.edge), transparent: true, opacity: 0.72, toneMapped: false }); });
    this.gemSettingGeo = { 2: settingGeometry(2), 3: settingGeometry(3) };
    this.gemSettingMat = new T.MeshStandardMaterial({ color: lin('#f6ce72'), metalness: 0.7, roughness: 0.26, envMap: this.env, envMapIntensity: 0.8 });
    this.gemPointMat = [0, 1, 2, 3].map(function (k) {
      return new T.SpriteMaterial({ map: srgbTex(gemPointsTex(k)), transparent: true, depthWrite: false, toneMapped: false });
    });
    this.gemMat = GEMS.map(function (g, k) {
      return new T.MeshPhysicalMaterial({
        color: 0xffffff, vertexColors: true, emissive: lin(g.em), emissiveIntensity: k === 3 ? 0.4 : 0.3, roughness: k === 3 ? 0.15 : 0.24, metalness: k === 3 ? 0.2 : 0.05,
        clearcoat: 1, clearcoatRoughness: 0.08, envMap: self.env, envMapIntensity: k === 3 ? 1.6 : 0.9, flatShading: true, reflectivity: 0.8
      });
    });
    var ringShape = roundRect(TS + 0.5, TS + 0.5, 0.5); ringShape.holes.push(rrHole(TS + 0.12, TS + 0.12, 0.34));
    this.ringGeoT = new T.ShapeGeometry(ringShape); this.ringGeoT.rotateX(-Math.PI / 2);
    var ringShapeV = roundRect(VS + 0.5, VS + 0.5, 0.45); ringShapeV.holes.push(rrHole(VS + 0.12, VS + 0.12, 0.3));
    this.ringGeoV = new T.ShapeGeometry(ringShapeV); this.ringGeoV.rotateX(-Math.PI / 2);
    this.crossMat = new T.SpriteMaterial({ map: srgbTex(crossTex()), transparent: true, depthTest: false, depthWrite: false });
    this.starMat = new T.SpriteMaterial({ map: srgbTex(starTex()), transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffffff });
    var hx = srgbTex(hexTex()); hx.wrapS = hx.wrapT = T.RepeatWrapping; hx.repeat.set(3, 1.5);
    this.domeMat = new T.MeshBasicMaterial({ map: hx, color: lin('#6fe3ff'), transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    this.domeGeo = new T.SphereGeometry(1.65, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    this.ray = new T.Raycaster();

    // gem bag
    var bagPts = [[0.001, 0], [0.75, 0.05], [0.95, 0.35], [0.92, 0.75], [0.6, 1.05], [0.36, 1.2], [0.42, 1.38], [0.3, 1.45], [0.001, 1.42]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var bag = this.bag = new T.Mesh(new T.LatheGeometry(bagPts, 24), new T.MeshStandardMaterial({ map: srgbTex(bagTex()), roughness: 0.85 }));
    bag.castShadow = true; bag.receiveShadow = true;
    var tie = new T.Mesh(new T.TorusGeometry(0.38, 0.05, 8, 24), new T.MeshStandardMaterial({ color: lin('#d6aa45'), roughness: 0.4, metalness: 0.6, envMap: this.env }));
    tie.rotation.x = Math.PI / 2; tie.position.y = 1.22; bag.add(tie);
    sc.add(bag);
  };

  /* ---------- static furniture for a layout ---------- */
  Scene.prototype._buildTable = function (L, names) {
    var key = [L.nA, L.nt, L.tall, L.two, this.quality, JSON.stringify(names)].join(':');
    if (this._tableKey === key) return;
    this._tableKey = key;
    var self = this, g = this.tableGroup, aniso = this.renderer.capabilities.getMaxAnisotropy();
    while (g.children.length) {
      var c = g.children.pop();
      c.traverse(function (o) {
        if (o.geometry && [self.tableGeo, self.vaultGeo, self.trayGeo, self.ringGeoT, self.ringGeoV, self.decalGeo.t, self.decalGeo.v, self.decalGeo.k].indexOf(o.geometry) < 0) o.geometry.dispose();
        if (o.material && o.material._own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
    var max = this.quality === 'high' ? 2048 : 1024, W, H;
    if (L.hx >= L.hz) { W = max; H = Math.round(max * L.hz / L.hx); } else { H = max; W = Math.round(max * L.hx / L.hz); }
    var fc = feltTex(W, H, L);
    this.feltTex.dispose(); this.feltTex = srgbTex(fc, aniso);
    this.feltMat.map = this.feltTex; this.feltMat.needsUpdate = true;
    this.felt.scale.set(L.hx * 2, L.hz * 2, 1);
    var railW = 1.1, railH = 0.7;
    [[0, -L.hz - railW / 2, L.hx * 2 + railW * 2, 0], [0, L.hz + railW / 2, L.hx * 2 + railW * 2, 0], [-L.hx - railW / 2, 0, L.hz * 2, 1], [L.hx + railW / 2, 0, L.hz * 2, 1]].forEach(function (p) {
      var m = new T.Mesh(new T.BoxGeometry(p[2], railH, railW), self.woodMat);
      m.position.set(p[0], railH / 2 - 0.25, p[1]); if (p[3]) m.rotation.y = Math.PI / 2;
      m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    // gem tables
    this.tableObjs = L.tables.map(function (t, i) {
      var grp = new T.Group(); grp.position.set(t.x, 0, t.z);
      var body = new T.Mesh(self.tableGeo, self.tableBodyMat); body.castShadow = true; body.receiveShadow = true;
      var topMat = new T.MeshStandardMaterial({ map: srgbTex(tableTopTex(E.TABLE_NAMES[i]), aniso), roughness: 0.85, metalness: 0.05 }); topMat._own = true;
      var top = new T.Mesh(self.decalGeo.t, topMat); top.rotation.x = -Math.PI / 2; top.position.y = TH + 0.003; top.receiveShadow = true;
      var ring = new T.Mesh(self.ringGeoT, new T.MeshBasicMaterial({ color: lin('#f2c14e'), transparent: true, opacity: 0, depthWrite: false })); ring.position.y = 0.02; ring.visible = false; ring.material._own = true;
      body.userData.pick = { kind: 't', i: i }; top.userData.pick = { kind: 't', i: i };
      grp.add(body); grp.add(top); grp.add(ring); g.add(grp);
      return { grp: grp, body: body, top: top, ring: ring, x: t.x, z: t.z, shake: 0 };
    });
    // vaults + trays
    this.seatObjs = L.seats.map(function (s, slot) {
      var grp = new T.Group(); grp.position.set(s.x, 0, s.z); grp.rotation.y = s.yaw;
      var flip = new T.Group(); flip.position.y = 0; grp.add(flip);
      var body = new T.Mesh(self.vaultGeo, self.vaultBodyMat); body.castShadow = true; body.receiveShadow = true;
      var nm = names[slot] || { color: '#888', label: '' };
      var faceMat = new T.MeshStandardMaterial({ map: srgbTex(vaultTex(nm.color, nm.label), aniso), roughness: 0.55 }); faceMat._own = true;
      var face = new T.Mesh(self.decalGeo.v, faceMat); face.rotation.x = -Math.PI / 2; face.position.y = VH + 0.003; face.receiveShadow = true;
      var back = new T.Mesh(self.decalGeo.v, self.restMat); back.rotation.set(Math.PI / 2, 0, Math.PI); back.position.y = -0.003;
      body.userData.pick = { kind: 'v', slot: slot }; face.userData.pick = { kind: 'v', slot: slot };
      flip.add(body); flip.add(face); flip.add(back);
      var ring = new T.Mesh(self.ringGeoV, new T.MeshBasicMaterial({ color: lin('#f2c14e'), transparent: true, opacity: 0, depthWrite: false })); ring.position.y = 0.02; ring.visible = false; ring.material._own = true; grp.add(ring);
      var tray = new T.Group(); grp.add(tray);
      if (s.tray === 'right') tray.position.set(VS / 2 + 0.22 + KW / 2, 0, 0);
      else { tray.position.set(0, 0, VS / 2 + 0.22 + KW / 2); tray.rotation.y = Math.PI / 2; }
      var tb = new T.Mesh(self.trayGeo, self.trayBodyMat); tb.castShadow = true; tb.receiveShadow = true; tray.add(tb);
      var tt = new T.Mesh(self.decalGeo.k, self.trayTopMat); tt.rotation.x = -Math.PI / 2; tt.position.y = 0.103; tt.receiveShadow = true; tray.add(tt);
      g.add(grp);
      return { grp: grp, flip: flip, body: body, face: face, ring: ring, tray: tray, seat: s, rot: 0, rotTo: 0, lift: 0 };
    });
    this.bag.position.set(L.bag.x, 0, L.bag.z);
  };

  /* ---------- where each hand sits: me at the bottom ---------- */
  Scene.prototype._slotOf = function (a) { return this.slotMap ? this.slotMap[a] : a; };
  Scene.prototype._seatFor = function (a) { var o = this.seatObjs && this.seatObjs[this._slotOf(a)]; return o || null; };
  function slotMapFor(s, mySeat) {
    var nA = s.A.length, two = s.np === 2, map = [];
    var me = mySeat >= 0 ? mySeat : 0;
    if (two) {
      var other = 1 - me;
      map[me * 2] = 0; map[me * 2 + 1] = 1; map[other * 2] = 2; map[other * 2 + 1] = 3;
      return map;
    }
    for (var a = 0; a < nA; a++) map[a] = (a - me + nA) % nA;
    return map;
  }

  /* ---------- gem meshes ---------- */
  Scene.prototype._gem = function (id) {
    var g = this.gems[id];
    if (g) return g;
    var k = E.colorIdx(id);
    var m = new T.Mesh(this.gemGeo[k], this.gemMat[k]); m.castShadow = true; m.receiveShadow = false;
    m.add(new T.LineSegments(this.gemEdgeGeo[k], this.gemEdgeMat[k]));
    if (this.gemSettingGeo[k]) m.add(new T.Mesh(this.gemSettingGeo[k], this.gemSettingMat));
    var label = new T.Sprite(this.gemPointMat[k]);
    label.position.y = GEMS[k].top + 0.06;
    label.scale.set(k >= 2 ? 0.28 : 0.23, 0.19, 1);
    label.renderOrder = 2; m.add(label);
    m.visible = false; this.scene.add(m);
    g = this.gems[id] = { id: id, k: k, m: m, place: null, anim: null, shown: false, yaw: hash(id + 7) * Math.PI * 2, tilt: (hash(id + 3) - 0.5) * 0.08 };
    return g;
  };
  Scene.prototype._gemPlace = function (g, x, y, z, s) {
    var q = new T.Quaternion().setFromEuler(new T.Euler(g.tilt, g.yaw, g.tilt * 0.6, 'YXZ'));
    return { p: new T.Vector3(x, y + (-GEMS[g.k].prof[0][1] + 0.02) * s, z), q: q, s: s };
  };
  Scene.prototype._setGem = function (g, place, instant, delay) {
    var m = g.m;
    if (!g.shown || instant) {
      m.position.copy(place.p); m.quaternion.copy(place.q); m.scale.setScalar(place.s);
      g.anim = null; m.visible = true; g.shown = true; g.place = place; return;
    }
    var old = g.place; g.place = place;
    if (old && old.p.distanceTo(place.p) < 0.001 && old.s === place.s) return;
    var dist = m.position.distanceTo(place.p);
    g.anim = { p0: m.position.clone(), q0: m.quaternion.clone(), s0: m.scale.x, t0: performance.now() + (delay || 0), dur: (420 + Math.min(700, dist * 60)) / this.speed, lift: dist > 0.6 ? Math.min(3, 0.7 + dist * 0.16) : 0 };
  };
  Scene.prototype._hideGem = function (g) { g.m.visible = false; g.shown = false; g.anim = null; g.place = null; };

  /* view: a public game state. opts: { instant, hide: {gemId:1} kept in the bag, bagDelay } */
  Scene.prototype.setView = function (s, mySeat, opts) {
    opts = opts || {};
    this.state = s; this.mySeat = mySeat;
    if (!s) return;
    var two = s.np === 2;
    var L = this.layout = layoutFor(s.A.length, s.T.length, this.tall, two);
    this.slotMap = slotMapFor(s, mySeat);
    var self = this, names = [];
    s.A.forEach(function (x, a) { names[self.slotMap[a]] = { color: PCOL[x.p % PCOL.length], label: x.h === 'L' ? '左手' : x.h === 'R' ? '右手' : '金庫' }; });
    this._buildTable(L, names);
    var hide = opts.hide || {}, seen = {};
    var bagTop = new T.Vector3(L.bag.x, 1.5, L.bag.z);
    function put(id, place, extraDelay) {
      seen[id] = 1;
      var g = self._gem(id);
      if (hide[id]) { if (g.shown) self._hideGem(g); return; }
      if (!g.shown && !opts.instant && self._ready) {
        // new on the table: comes out of the bag
        self._setGem(g, { p: bagTop.clone(), q: place.q, s: 0.4 }, true);
        self._setGem(g, place, false, extraDelay || 0);
      } else self._setGem(g, place, !!opts.instant);
    }
    var order = {};
    if (s.last && s.last.refill) s.last.refill.forEach(function (r, i) { order[r.g] = i; });
    s.T.forEach(function (gems, i) {
      var t = L.tables[i];
      gems.forEach(function (id, j) {
        var layer = Math.floor(j / TABLE_SPOTS.length), sp = displaySpot(TABLE_SPOTS, j, gems.length);
        put(id, self._gemPlace(self._gem(id), t.x + sp[0], TH + layer * 0.88, t.z + sp[1], GS_T), order[id] != null ? 120 * order[id] / self.speed : 0);
      });
    });
    s.A.forEach(function (x, a) {
      var so = self._seatFor(a); if (!so) return;
      var seat = so.seat;
      x.vault.forEach(function (id, j) {
        var layer = Math.floor(j / VAULT_SPOTS.length), sp = displaySpot(VAULT_SPOTS, j, x.vault.length);
        var w = local2world(seat, sp[0], sp[1]);
        put(id, self._gemPlace(self._gem(id), w.x, VH + layer * 0.78, w.z, GS_V));
      });
      // secured gems: grouped by colour in the tray beside the vault
      var kept = x.kept.slice().sort(function (p, q) { return E.colorIdx(p) - E.colorIdx(q) || p - q; });
      kept.forEach(function (id, j) {
        var per = 6, layer = Math.floor(j / per), k = j % per, col = k % 2, row = Math.floor(k / 2);
        var tl = trayLocal(seat, (col - 0.5) * 0.66, (row - 1) * 0.7);
        var w = local2world(seat, tl[0], tl[1]);
        put(id, self._gemPlace(self._gem(id), w.x, 0.1 + layer * 0.52, w.z, GS_K));
      });
      so.rotTo = x.rest ? Math.PI : 0;
      if (opts.instant) so.rot = so.rotTo;
    });
    Object.keys(this.gems).forEach(function (id) { if (!seen[id]) self._hideGem(self.gems[id]); });
    this._ready = true;
    var ck = [L.nA, L.nt, L.tall, L.two].join(':');
    if (this._camKey !== ck) { this._camKey = ck; this.camZoom = 1; this.pan.set(0, 0, 0); this.camAnim = null; this.fitCamera(); }
  };

  /* ---------- highlights: legal targets pulse, chosen ones glow ---------- */
  Scene.prototype.setHighlight = function (legal, sel) { this.hl = { legal: legal || [], sel: sel || {} }; };
  Scene.prototype._ringFor = function (target) {
    var i = E.tIdx(target);
    if (i >= 0) return this.tableObjs && this.tableObjs[i] ? this.tableObjs[i].ring : null;
    var so = this._seatFor(E.vIdx(target));
    return so ? so.ring : null;
  };

  /* ---------- the reveal: everyone's finger at once ---------- */
  Scene.prototype.targetPos = function (target, y) {
    var i = E.tIdx(target);
    if (i >= 0 && this.layout) { var t = this.layout.tables[i]; return new T.Vector3(t.x, y || 0.6, t.z); }
    var so = this._seatFor(E.vIdx(target));
    return so ? new T.Vector3(so.seat.x, y || 0.6, so.seat.z) : new T.Vector3();
  };
  Scene.prototype.showArcs = function (s, picks) {
    this.clearArcs();
    var self = this, grp = this.arcs = new T.Group(); this.scene.add(grp);
    var now = performance.now();
    this.arcList = [];
    picks.forEach(function (t, a) {
      if (!t) return;
      var x = s.A[a], col = lin(PCOL[x.p % PCOL.length]);
      var from = self.targetPos('v' + a, 0.5), to = self.targetPos(t, 0.55);
      var own = t === 'v' + a;
      var mat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false });
      var item = { a: a, t: t, mat: mat, t0: now + Math.random() * 60, own: own };
      if (own) {
        // barrier: a short raised palm over the own vault instead of an arc
        var palm = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.08, 24), mat); palm.position.copy(from); palm.position.y = 1.6; palm.scale.setScalar(0.01);
        grp.add(palm); item.palm = palm;
      } else {
        var dist = from.distanceTo(to);
        var mid = from.clone().lerp(to, 0.5); mid.y += 1.2 + dist * 0.22;
        // fan arcs a little so several fingers on one place stay readable
        var side = new T.Vector3(to.z - from.z, 0, from.x - to.x).normalize().multiplyScalar(((a % 3) - 1) * 0.35);
        mid.add(side);
        var end = to.clone().lerp(mid, 0.12);
        var curve = new T.QuadraticBezierCurve3(from, mid, end);
        var geo = new T.TubeGeometry(curve, 48, 0.07, 8, false);
        var tube = new T.Mesh(geo, mat); tube.renderOrder = 5;
        geo.setDrawRange(0, 0);
        var head = new T.Mesh(new T.ConeGeometry(0.2, 0.46, 12), mat); head.visible = false; head.renderOrder = 5;
        var tan = curve.getTangent(1); head.position.copy(end); head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), tan);
        grp.add(tube); grp.add(head);
        item.tube = tube; item.head = head; item.count = geo.index.count;
      }
      self.arcList.push(item);
    });
  };
  Scene.prototype.markArcs = function (out) {
    var red = lin('#ff4d4d'), grey = lin('#9aa0b8');
    (this.arcList || []).forEach(function (it) {
      var o = out[it.a];
      if (o === 'clash') it.mat.color.copy(red);
      else if (o === 'blocked') it.mat.color.copy(grey);
      else if (o === 'barrier') it.mat.color.copy(lin('#6fe3ff'));
    });
  };
  Scene.prototype.clearArcs = function (fade) {
    var grp = this.arcs;
    if (!grp) return;
    this.arcs = null;
    var list = this.arcList || [];
    this.arcList = null;
    var self = this;
    function kill() { self.scene.remove(grp); grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    if (!fade) { kill(); return; }
    this._tween(320, function (k) { list.forEach(function (it) { it.mat.opacity = 0.95 * (1 - k); }); }, kill);
  };
  Scene.prototype.clashAt = function (target) {
    var sp = new T.Sprite(this.crossMat.clone()); sp.position.copy(this.targetPos(target, 1.5)); sp.scale.setScalar(0.1); sp.renderOrder = 9;
    this.scene.add(sp);
    var self = this, i = E.tIdx(target), obj = i >= 0 && this.tableObjs ? this.tableObjs[i] : null;
    if (obj) obj.shake = 1;
    this._tween(1500, function (k) {
      var s = k < 0.15 ? 2.6 * easeOut(k / 0.15) : 2.6;
      sp.scale.setScalar(s); sp.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    }, function () { self.scene.remove(sp); sp.material.dispose(); });
  };
  Scene.prototype.barrierAt = function (a, blocked) {
    var so = this._seatFor(a); if (!so) return;
    var dome = new T.Mesh(this.domeGeo, this.domeMat.clone()); dome.position.set(so.seat.x, 0.05, so.seat.z); dome.scale.setScalar(0.01); dome.renderOrder = 6;
    this.scene.add(dome);
    var self = this;
    this._tween(1700, function (k) {
      var s = easeOut(Math.min(1, k / 0.25));
      dome.scale.set(s, s * 0.9, s);
      dome.material.opacity = (k < 0.7 ? 0.75 : 0.75 * (1 - (k - 0.7) / 0.3)) * (blocked && k > 0.25 && k < 0.45 ? 1.4 : 1);
      dome.rotation.y = k * 1.2;
    }, function () { self.scene.remove(dome); dome.material.dispose(); });
  };
  Scene.prototype.sparkleAt = function (pos, n) {
    var self = this;
    for (var i = 0; i < (n || 6); i++) (function (i) {
      var sp = new T.Sprite(self.starMat.clone()); sp.renderOrder = 8;
      var off = new T.Vector3((Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.4);
      sp.position.copy(pos).add(off); sp.scale.setScalar(0.01);
      self.scene.add(sp);
      self._tween(700 + i * 60, function (k) { var s = Math.sin(Math.PI * k) * 0.8; sp.scale.setScalar(s); }, function () { self.scene.remove(sp); sp.material.dispose(); });
    })(i);
  };
  Scene.prototype._tween = function (ms, fn, done) { this.tweens.push({ t0: performance.now(), dur: ms / this.speed, fn: fn, done: done }); };

  /* ---------- camera ---------- */
  Scene.prototype.fitCamera = function () {
    var w = this.host.clientWidth || 1, h = this.host.clientHeight || 1, asp = w / h;
    var cam = this.camera; cam.aspect = asp;
    cam.fov = asp < 1 ? 44 : 36; cam.updateProjectionMatrix();
    var L = this.layout || layoutFor(4, 3, this.tall, false), pts = [];
    L.tables.forEach(function (t) { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { pts.push(new T.Vector3(t.x + q[0] * TS / 2, 0.4, t.z + q[1] * TS / 2)); }); });
    L.seats.forEach(function (s) {
      var q4 = s.tray === 'right'
        ? [[-VS / 2 - 0.2, -VS / 2], [VS / 2 + 0.3 + KW, -VS / 2], [-VS / 2 - 0.2, VS / 2 + 1.0], [VS / 2 + 0.3 + KW, VS / 2 + 1.0]]
        : [[-VS / 2 - 0.3, -VS / 2], [VS / 2 + 0.3, -VS / 2], [-VS / 2 - 0.3, VS / 2 + 0.3 + KW + 0.9], [VS / 2 + 0.3, VS / 2 + 0.3 + KW + 0.9]];
      q4.forEach(function (q) { var p = local2world(s, q[0], q[1]); pts.push(new T.Vector3(p.x, 0.3, p.z)); });
      [[-1.5, -0.45], [1.5, -0.45], [-1.5, 0.45], [1.5, 0.45]].forEach(function (q) { pts.push(new T.Vector3(s.tag.x + q[0], 0.25, s.tag.z + q[1])); });
    });
    pts.push(new T.Vector3(L.bag.x, 1.6, L.bag.z));
    var pitch = (asp < 1 ? 64 : asp > 1.75 ? 49 : 54) * Math.PI / 180 + this.camPitchAdj;
    var yaw = this.camYaw;
    var rs = this.reserve;
    var mTop = 1 - 2 * (rs.top / h), mBot = -1 + 2 * (rs.bottom / h), mL = -1 + 2 * (rs.left / w), mR = 1 - 2 * (rs.right / w);
    var target = new T.Vector3(0, 0, 0);
    var dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    var _v = new T.Vector3();
    function fits(d, tgt) {
      cam.position.copy(tgt).addScaledVector(dir, d); cam.lookAt(tgt); cam.updateMatrixWorld();
      var b = { x0: 9, x1: -9, y0: 9, y1: -9 };
      pts.forEach(function (p) { _v.copy(p).project(cam); b.x0 = Math.min(b.x0, _v.x); b.x1 = Math.max(b.x1, _v.x); b.y0 = Math.min(b.y0, _v.y); b.y1 = Math.max(b.y1, _v.y); });
      return b;
    }
    var d = 30;
    for (var it = 0; it < 6; it++) {
      var lo = 4, hi = 220;
      for (var k = 0; k < 32; k++) { var mid = (lo + hi) / 2, b = fits(mid, target); if (b.x0 < mL || b.x1 > mR || b.y1 > mTop || b.y0 < mBot) lo = mid; else hi = mid; }
      d = hi;
      var bb = fits(d, target);
      var wantY = (mTop + mBot) / 2, haveY = (bb.y0 + bb.y1) / 2, wantX = (mL + mR) / 2, haveX = (bb.x0 + bb.x1) / 2;
      target.z -= (haveY - wantY) * d * 0.4;
      target.x += (haveX - wantX) * d * 0.3;
      target.z = Math.max(-12, Math.min(12, target.z)); target.x = Math.max(-12, Math.min(12, target.x));
    }
    this.baseTarget = target; this.baseDist = d; this.camDir = dir;
    this._clampPan();
    this.applyCamera();
  };
  Scene.prototype.applyCamera = function () {
    if (!this.baseTarget) return;
    var cam = this.camera, tgt = this.baseTarget.clone().add(this.pan), d = this.baseDist / this.camZoom;
    cam.position.copy(tgt).addScaledVector(this.camDir, d);
    cam.lookAt(tgt); cam.updateMatrixWorld();
  };
  Scene.prototype._clampPan = function () {
    var L = this.layout; if (!L) { this.pan.set(0, 0, 0); return; }
    var k = 1 - 1 / this.camZoom, mx = (L.hx + 1) * k, mz = (L.hz + 1) * k;
    this.pan.y = 0;
    this.pan.x = Math.max(-mx, Math.min(mx, this.pan.x));
    this.pan.z = Math.max(-mz, Math.min(mz, this.pan.z));
  };
  var _plane = new T.Plane(new T.Vector3(0, 1, 0), -0.3);
  var RING_GOLD = lin('#f2c14e'), RING_SHIELD = lin('#6fe3ff');
  Scene.prototype._groundAt = function (cx, cy) {
    var r = this.renderer.domElement.getBoundingClientRect();
    var v = new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    var p = new T.Vector3();
    return this.ray.ray.intersectPlane(_plane, p) ? p : null;
  };
  Scene.prototype.zoomAt = function (f, cx, cy) {
    this.camAnim = null;
    var before = this._groundAt(cx, cy);
    this.camZoom = Math.max(1, Math.min(3, this.camZoom * f));
    this.applyCamera();
    var after = this._groundAt(cx, cy);
    if (before && after) { this.pan.x += before.x - after.x; this.pan.z += before.z - after.z; }
    this._clampPan(); this.applyCamera();
  };
  Scene.prototype.panBy = function (x0, y0, x1, y1) {
    var a = this._groundAt(x0, y0), b = this._groundAt(x1, y1);
    if (!a || !b) return;
    this.camAnim = null;
    this.pan.x += a.x - b.x; this.pan.z += a.z - b.z;
    this._clampPan(); this.applyCamera();
  };
  Scene.prototype.zoomed = function () { return this.camZoom > 1.02 || Math.abs(this.camYaw) > 0.01 || Math.abs(this.camPitchAdj) > 0.01; };
  Scene.prototype.orbit = function (dx, dy) {
    this.camYaw = Math.max(-0.6, Math.min(0.6, this.camYaw - dx * 0.004));
    this.camPitchAdj = Math.max(-0.28, Math.min(0.3, this.camPitchAdj + dy * 0.003));
    this.fitCamera();
  };
  Scene.prototype.resetCam = function (animate) {
    if (animate) { this.camAnim = { t0: performance.now(), z0: this.camZoom, p0: this.pan.clone(), y0: this.camYaw, a0: this.camPitchAdj }; return; }
    this.camAnim = null; this.camYaw = 0; this.camPitchAdj = 0; this.camZoom = 1; this.pan.set(0, 0, 0); this.fitCamera();
  };
  Scene.prototype.resize = function () {
    var w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    var pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    var tall = w / h < 0.95;
    if (tall !== this.tall) { this.tall = tall; this._camKey = null; this._tableKey = null; if (this.state) this.setView(this.state, this.mySeat, { instant: true }); }
    this.fitCamera();
  };
  Scene.prototype.setQuality = function (q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.key.castShadow = q === 'high';
    this.scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; });
    this._tableKey = null;
    if (this.state) this.setView(this.state, this.mySeat, { instant: true });
    this.resize();
  };

  /* ---------- picking: a gem table or a vault under the finger ---------- */
  Scene.prototype.pick = function (cx, cy) {
    var rect = this.renderer.domElement.getBoundingClientRect();
    var v = new T.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    var objs = [], self = this;
    (this.tableObjs || []).forEach(function (o) { objs.push(o.body, o.top); });
    (this.seatObjs || []).forEach(function (o) { objs.push(o.body, o.face); });
    var gemOwner = {};
    if (this.state) {
      this.state.T.forEach(function (gs, i) { gs.forEach(function (id) { gemOwner[id] = 't' + i; }); });
      this.state.A.forEach(function (x, a) { x.vault.forEach(function (id) { gemOwner[id] = 'v' + a; }); });
    }
    Object.keys(this.gems).forEach(function (id) { var g = self.gems[id]; if (g.shown && gemOwner[id]) { g.m.userData.target = gemOwner[id]; objs.push(g.m); } });
    var hit = this.ray.intersectObjects(objs, false)[0];
    if (hit) {
      var o = hit.object;
      if (o.userData.target) return o.userData.target;
      var pk = o.userData.pick;
      if (pk && pk.kind === 't') return 't' + pk.i;
      if (pk && pk.kind === 'v') return 'v' + this._actorAtSlot(pk.slot);
    }
    // forgiving taps: nearest centre within reach
    var best = null, bd = 44;
    var cand = [];
    if (this.layout) {
      this.layout.tables.forEach(function (t, i) { cand.push(['t' + i, new T.Vector3(t.x, 0.3, t.z)]); });
      if (this.state) this.state.A.forEach(function (x, a) { var so = self._seatFor(a); if (so) cand.push(['v' + a, new T.Vector3(so.seat.x, 0.3, so.seat.z)]); });
    }
    cand.forEach(function (c) {
      var p = self.project(c[1].x, c[1].y, c[1].z), dd = Math.hypot(p.x - (cx - rect.left), p.y - (cy - rect.top));
      if (dd < bd) { bd = dd; best = c[0]; }
    });
    return best;
  };
  Scene.prototype._actorAtSlot = function (slot) { var m = this.slotMap || []; for (var a = 0; a < m.length; a++) if (m[a] === slot) return a; return -1; };

  /* ---------- anchors for HTML labels (pixels inside the stage) ---------- */
  Scene.prototype.project = function (x, y, z) {
    var v = new T.Vector3(x, y, z).project(this.camera), el = this.renderer.domElement;
    return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight, vis: v.z < 1 };
  };
  Scene.prototype.tableAnchor = function (i) { var t = this.layout && this.layout.tables[i]; return t ? this.project(t.x, 0.2, t.z + TS / 2 + 0.12) : null; };
  Scene.prototype.tableLabelWidth = function (i) {
    var t = this.layout && this.layout.tables[i]; if (!t) return 0;
    var left = this.project(t.x - TS / 2, 0.2, t.z + TS / 2), right = this.project(t.x + TS / 2, 0.2, t.z + TS / 2);
    return Math.abs(right.x - left.x);
  };
  Scene.prototype.tableCenter = function (i) { var t = this.layout && this.layout.tables[i]; return t ? this.project(t.x, 0.9, t.z) : null; };
  Scene.prototype.seatAnchor = function (a) {
    var so = this._seatFor(a); if (!so) return null;
    return this.project(so.seat.tag.x, 0.25, so.seat.tag.z);
  };
  Scene.prototype.vaultCenter = function (a) { var so = this._seatFor(a); return so ? this.project(so.seat.x, 0.9, so.seat.z) : null; };
  Scene.prototype.trayCenter = function (a) { var so = this._seatFor(a); if (!so) return null; var tl = trayLocal(so.seat, 0, 0), w = local2world(so.seat, tl[0], tl[1]); return this.project(w.x, 0.6, w.z); };
  Scene.prototype.targetAnchor = function (t) { var i = E.tIdx(t); return i >= 0 ? this.tableCenter(i) : this.vaultCenter(E.vIdx(t)); };
  Scene.prototype.bagAnchor = function () { var L = this.layout; return L ? this.project(L.bag.x, 1.9, L.bag.z) : null; };

  /* ---------- frame loop ---------- */
  Scene.prototype._frame = function (now) {
    var dt = Math.min(0.05, (now - (this._last || now)) / 1000); this._last = now;
    this.clock += dt;
    if (this.attract) { this.camYaw = Math.sin(this.clock * 0.13) * 0.32; this.fitCamera(); }
    else if (this.camAnim) {
      var ca = this.camAnim, k = Math.min(1, (now - ca.t0) / 340), e = easeIO(k);
      this.camZoom = ca.z0 + (1 - ca.z0) * e;
      this.pan.copy(ca.p0).multiplyScalar(1 - e);
      this.camYaw = ca.y0 * (1 - e); this.camPitchAdj = ca.a0 * (1 - e);
      this.fitCamera();
      if (k >= 1) this.camAnim = null;
    }
    var self = this;
    Object.keys(this.gems).forEach(function (id) {
      var g = self.gems[id], m = g.m;
      if (!g.shown || !g.anim) return;
      var a = g.anim; if (now < a.t0) return;
      var k = Math.min(1, (now - a.t0) / a.dur), e = easeIO(k);
      m.position.lerpVectors(a.p0, g.place.p, e);
      m.position.y += a.lift * Math.sin(Math.PI * k);
      m.quaternion.copy(a.q0).slerp(g.place.q, e);
      m.scale.setScalar(a.s0 + (g.place.s - a.s0) * e);
      if (k >= 1) g.anim = null;
    });
    // vault flips (barrier → rest side up; back after the pass)
    (this.seatObjs || []).forEach(function (so) {
      if (Math.abs(so.rot - so.rotTo) > 1e-3) {
        var step = dt * 4.2 * self.speed, d = so.rotTo - so.rot;
        so.rot += Math.sign(d) * Math.min(Math.abs(d), step);
        so.flip.rotation.z = so.rot;
        so.flip.position.y = Math.sin(so.rot) * VS * 0.5 + (so.rot > Math.PI / 2 ? VH * Math.abs(Math.cos(so.rot)) : 0);
        if (Math.abs(so.rot - so.rotTo) <= 1e-3) { so.rot = so.rotTo; so.flip.rotation.z = so.rot; so.flip.position.y = so.rot > 1 ? VH : 0; }
      } else { so.flip.rotation.z = so.rot; so.flip.position.y = so.rot > 1 ? VH : 0; }
    });
    // highlight rings
    var hl = this.hl, pulse = 0.25 + 0.2 * Math.sin(now / 230);
    var lit = {};
    hl.legal.forEach(function (t) { lit[t] = 1; });
    Object.keys(hl.sel || {}).forEach(function (k) { lit[hl.sel[k]] = 2; });
    (this.tableObjs || []).forEach(function (o, i) {
      var l = lit['t' + i] || 0; o.ring.visible = l > 0; o.ring.material.opacity = l === 2 ? 0.95 : pulse;
      if (o.shake > 0) { o.shake = Math.max(0, o.shake - dt * 2.2); o.grp.position.x = o.x + Math.sin(now / 22) * 0.07 * o.shake; } else o.grp.position.x = o.x;
    });
    if (this.state) this.state.A.forEach(function (x, a) {
      var so = self._seatFor(a); if (!so) return;
      var l = lit['v' + a] || 0; so.ring.visible = l > 0; so.ring.material.opacity = l === 2 ? 0.95 : pulse;
      so.ring.material.color.copy(l === 2 && hl.sel && hl.sel[a] === 'v' + a ? RING_SHIELD : RING_GOLD);
    });
    // arcs grow out from each vault at the same moment
    (this.arcList || []).forEach(function (it) {
      var k = Math.max(0, Math.min(1, (now - it.t0) / (520 / self.speed)));
      if (it.tube) { it.tube.geometry.setDrawRange(0, Math.floor(it.count * easeOut(k) / 3) * 3); it.head.visible = k >= 0.98; }
      if (it.palm) { var s = easeOut(k); it.palm.scale.set(s, 1, s); it.palm.position.y = 1.6 - 0.6 * s; }
    });
    // tweens
    for (var i = this.tweens.length - 1; i >= 0; i--) {
      var tw = this.tweens[i], kk = Math.min(1, (now - tw.t0) / tw.dur);
      if (kk >= 0) tw.fn(kk);
      if (kk >= 1) { this.tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    // a slow glint wandering over the gems
    if (this.quality === 'high' && now - (this._glint || 0) > 420 && !this.attract) {
      this._glint = now;
      var vis = [];
      Object.keys(this.gems).forEach(function (id) {
        var gem = self.gems[id]; if (!gem.shown || gem.anim) return;
        // Higher-tier cuts catch the light more often, especially the white diamond.
        for (var n = 0; n < [1, 2, 3, 6][gem.k]; n++) vis.push(id);
      });
      if (vis.length) {
        var g2 = this.gems[vis[Math.floor(Math.random() * vis.length)]];
        var sp = new T.Sprite(this.starMat.clone()); sp.position.copy(g2.m.position); sp.position.y += GEMS[g2.k].top * g2.m.scale.y + 0.08; sp.renderOrder = 8;
        if (g2.k === 3) sp.material.color.copy(lin('#fff4cf'));
        this.scene.add(sp);
        var shineSize = [0.32, 0.4, 0.55, 0.75][g2.k];
        this._tween(600, function (k) { sp.scale.setScalar(Math.sin(Math.PI * k) * shineSize); sp.material.rotation = k * 1.2; }, function () { self.scene.remove(sp); sp.material.dispose(); });
      }
    }
    this.bag.rotation.y += dt * 0.15;
    this.renderer.render(this.scene, this.camera);
    if (this.onFrame) this.onFrame(now);
  };

  G.XING_SCENE = { Scene: Scene, PCOL: PCOL, layoutFor: layoutFor };
})(typeof window !== 'undefined' ? window : globalThis);
