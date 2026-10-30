/* シェディー・レディー — card artwork, drawn on a canvas (no image files). Used by the 3D table (textures), the
   sheets on the page (small images) and the cover script. The look is this app's own: midnight cards with a gold
   art-deco frame and one neon colour per number; burgundy backs with a sunburst around a keyhole. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SL_CARDS = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COLORS = { 1: '#ff5d73', 2: '#ff9f43', 3: '#ffd84d', 4: '#9be15d', 6: '#35e0c2', 7: '#55b6ff', 8: '#ad8dff', 9: '#ff7ad9' };
  var DEEP = { 1: '#8f1d33', 2: '#8a4a0c', 3: '#7d6206', 4: '#3f6e1c', 6: '#0d6f60', 7: '#174f8c', 8: '#4b2f8f', 9: '#8a2370' };
  var GOLD = '#e2c06f', GOLD2 = '#9c7b34';
  var NUM_FONT = '"Playfair Display", "Bodoni 72", "Didot", Georgia, "Times New Roman", serif';

  function rr(x, X, Y, w, h, r) {
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  function diamond(x, cx, cy, s) { x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s * 0.7, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s * 0.7, cy); x.closePath(); }
  // the stepped art-deco frame, inset by m
  function frame(x, w, h, m, col, lw) {
    var s = w * 0.06;
    x.strokeStyle = col; x.lineWidth = lw;
    x.beginPath();
    x.moveTo(m + s, m); x.lineTo(w - m - s, m); x.lineTo(w - m - s, m + s * 0.45); x.lineTo(w - m - s * 0.45, m + s * 0.45); x.lineTo(w - m - s * 0.45, m + s); x.lineTo(w - m, m + s);
    x.lineTo(w - m, h - m - s); x.lineTo(w - m - s * 0.45, h - m - s); x.lineTo(w - m - s * 0.45, h - m - s * 0.45); x.lineTo(w - m - s, h - m - s * 0.45); x.lineTo(w - m - s, h - m);
    x.lineTo(m + s, h - m); x.lineTo(m + s, h - m - s * 0.45); x.lineTo(m + s * 0.45, h - m - s * 0.45); x.lineTo(m + s * 0.45, h - m - s); x.lineTo(m, h - m - s);
    x.lineTo(m, m + s); x.lineTo(m + s * 0.45, m + s); x.lineTo(m + s * 0.45, m + s * 0.45); x.lineTo(m + s, m + s * 0.45); x.closePath();
    x.stroke();
  }

  /* ------------------------------------------------------------------ a face */
  function drawFace(x, n, w, h) {
    var col = COLORS[n] || '#fff', deep = DEEP[n] || '#333', r = w * 0.075;
    x.save();
    rr(x, 0, 0, w, h, r); x.clip();
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#221d3a'); g.addColorStop(0.55, '#151227'); g.addColorStop(1, '#0d0b19');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a fan of light behind the number
    x.save();
    x.translate(w / 2, h * 0.56);
    x.globalAlpha = 0.16; x.fillStyle = col;
    for (var k = 0; k < 13; k++) {
      var a0 = Math.PI + (k / 13) * Math.PI, a1 = a0 + Math.PI / 26;
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, w * 0.62, a0, a1); x.closePath(); x.fill();
    }
    x.globalAlpha = 1;
    x.restore();
    var rad = x.createRadialGradient(w / 2, h * 0.5, w * 0.05, w / 2, h * 0.5, w * 0.62);
    rad.addColorStop(0, hexA(col, 0.22)); rad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rad; x.fillRect(0, 0, w, h);
    // frame
    frame(x, w, h, w * 0.05, GOLD, Math.max(1.5, w * 0.009));
    frame(x, w, h, w * 0.075, hexA(GOLD, 0.45), Math.max(1, w * 0.004));
    // the big number, with a neon glow
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = '900 ' + Math.round(h * 0.5) + 'px ' + NUM_FONT;
    x.save();
    x.shadowColor = col; x.shadowBlur = w * 0.09;
    x.fillStyle = col;
    x.fillText(String(n), w / 2, h * 0.665);
    x.restore();
    x.lineWidth = Math.max(1, w * 0.006); x.strokeStyle = 'rgba(255,255,255,.55)';
    x.strokeText(String(n), w / 2, h * 0.665);
    // pips: as many small diamonds as the number
    var pipS = w * 0.032, gap = Math.min(w * 0.074, w * 0.54 / Math.max(1, n - 1)), y = h * 0.795;
    for (var i = 0; i < n; i++) {
      var px = w / 2 + (i - (n - 1) / 2) * gap;
      diamond(x, px, y, pipS); x.fillStyle = col; x.fill();
      x.lineWidth = Math.max(1, w * 0.003); x.strokeStyle = 'rgba(255,255,255,.5)'; x.stroke();
    }
    // corner indices (top left, and bottom right upside down)
    corner(x, n, w, h, col, deep);
    x.save(); x.translate(w, h); x.rotate(Math.PI); corner(x, n, w, h, col, deep); x.restore();
    x.restore();
    // the edge
    rr(x, 0.5, 0.5, w - 1, h - 1, r); x.lineWidth = Math.max(1, w * 0.006); x.strokeStyle = 'rgba(226,192,111,.65)'; x.stroke();
  }
  function corner(x, n, w, h, col, deep) {
    var cx = w * 0.15, cy = h * 0.135;
    x.fillStyle = deep; x.globalAlpha = 0.85;
    rr(x, cx - w * 0.085, cy - h * 0.085, w * 0.17, h * 0.15, w * 0.03); x.fill();
    x.globalAlpha = 1;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 ' + Math.round(h * 0.115) + 'px ' + NUM_FONT;
    x.fillStyle = '#fff'; x.fillText(String(n), cx, cy - h * 0.012);
    diamond(x, cx, cy + h * 0.075, w * 0.022); x.fillStyle = col; x.fill();
  }

  /* ------------------------------------------------------------------ the back */
  function drawBack(x, w, h) {
    var r = w * 0.075;
    x.save();
    rr(x, 0, 0, w, h, r); x.clip();
    var g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#5a1435'); g.addColorStop(0.5, '#3d0c26'); g.addColorStop(1, '#2a0719');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // sunburst rays
    x.save(); x.translate(w / 2, h / 2);
    for (var k = 0; k < 36; k++) {
      x.rotate(Math.PI / 18);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(w * 0.035, -h); x.lineTo(-w * 0.035, -h); x.closePath();
      x.fillStyle = k % 2 ? 'rgba(226,192,111,.10)' : 'rgba(226,192,111,.04)'; x.fill();
    }
    x.restore();
    // diamond lattice near the edges
    x.strokeStyle = 'rgba(226,192,111,.16)'; x.lineWidth = Math.max(1, w * 0.004);
    for (var d = -h; d < w + h; d += w * 0.12) {
      x.beginPath(); x.moveTo(d, 0); x.lineTo(d - h * 0.7, h); x.stroke();
      x.beginPath(); x.moveTo(d, 0); x.lineTo(d + h * 0.7, h); x.stroke();
    }
    // inner panel
    var pm = w * 0.14;
    x.fillStyle = 'rgba(42,7,25,.55)'; rr(x, pm, pm * 1.15, w - pm * 2, h - pm * 2.3, w * 0.04); x.fill();
    frame(x, w, h, w * 0.05, GOLD, Math.max(1.5, w * 0.01));
    frame(x, w, h, w * 0.14, hexA(GOLD, 0.6), Math.max(1, w * 0.005));
    // the keyhole medallion
    var cx = w / 2, cy = h / 2, R = w * 0.2;
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = '#2a0719'; x.fill();
    x.lineWidth = Math.max(1.5, w * 0.012); x.strokeStyle = GOLD; x.stroke();
    x.beginPath(); x.arc(cx, cy, R * 0.82, 0, Math.PI * 2); x.lineWidth = Math.max(1, w * 0.004); x.strokeStyle = hexA(GOLD, 0.7); x.stroke();
    for (var t = 0; t < 16; t++) {
      var a = (t / 16) * Math.PI * 2;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08); x.lineTo(cx + Math.cos(a) * R * (t % 2 ? 1.22 : 1.36), cy + Math.sin(a) * R * (t % 2 ? 1.22 : 1.36));
      x.lineWidth = Math.max(1, w * 0.006); x.strokeStyle = GOLD; x.stroke();
    }
    x.fillStyle = GOLD;
    x.beginPath(); x.arc(cx, cy - R * 0.18, R * 0.24, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - R * 0.1, cy - R * 0.1); x.lineTo(cx + R * 0.1, cy - R * 0.1); x.lineTo(cx + R * 0.2, cy + R * 0.48); x.lineTo(cx - R * 0.2, cy + R * 0.48); x.closePath(); x.fill();
    // small diamonds top and bottom
    [[cx, h * 0.2], [cx, h * 0.8]].forEach(function (q) { diamond(x, q[0], q[1], w * 0.04); x.fillStyle = GOLD; x.fill(); });
    x.restore();
    rr(x, 0.5, 0.5, w - 1, h - 1, r); x.lineWidth = Math.max(1, w * 0.006); x.strokeStyle = 'rgba(226,192,111,.65)'; x.stroke();
  }

  function hexA(hex, a) {
    var v = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
  }

  /* ------------------------------------------------------------------ canvases and small images */
  function canvas(w, h) {
    if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }
  function faceCanvas(n, w) { w = w || 360; var h = Math.round(w * 1.4), c = canvas(w, h); drawFace(c.getContext('2d'), n, w, h); return c; }
  function backCanvas(w) { w = w || 360; var h = Math.round(w * 1.4), c = canvas(w, h); drawBack(c.getContext('2d'), w, h); return c; }
  var urls = {};
  function faceURL(n, w) { var k = n + ':' + (w || 160); if (!urls[k]) urls[k] = faceCanvas(n, w || 160).toDataURL('image/png'); return urls[k]; }
  function backURL(w) { var k = 'b:' + (w || 160); if (!urls[k]) urls[k] = backCanvas(w || 160).toDataURL('image/png'); return urls[k]; }
  function clearCache() { urls = {}; }
  // wait for the number font (Google Fonts), at most ms; the cards fall back to a system serif
  function fontsReady(ms) {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve(false);
    var done = Promise.all([document.fonts.load('900 100px "Playfair Display"'), document.fonts.load('700 20px "Zen Kaku Gothic New"')]).then(function () { return true; }, function () { return false; });
    return Promise.race([done, new Promise(function (r) { setTimeout(function () { r(false); }, ms || 2500); })]);
  }

  return { COLORS: COLORS, DEEP: DEEP, GOLD: GOLD, drawFace: drawFace, drawBack: drawBack, faceCanvas: faceCanvas, backCanvas: backCanvas, faceURL: faceURL, backURL: backURL, clearCache: clearCache, fontsReady: fontsReady, hexA: hexA };
});
