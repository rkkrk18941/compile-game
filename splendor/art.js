/* 宝石の煌めき — original artwork: gem cuts, gem chips, development cards, noble tiles (no image files).
   Each gem has its own cut so the colours can also be told apart by shape:
   ダイヤモンド = round brilliant, サファイア = oval, エメラルド = step cut, ルビー = trillion, オニキス = cabochon, 黄金 = crown coin.
   window.SPL_ART.sprite() returns the <svg> symbol sheet (put once in the page); the other helpers return HTML strings. */
(function (root) {
  'use strict';
  var GEMS = [
    { key: 'white', name: 'ダイヤモンド', short: '白', ink: '#1f2433' },
    { key: 'blue', name: 'サファイア', short: '青', ink: '#ffffff' },
    { key: 'green', name: 'エメラルド', short: '緑', ink: '#ffffff' },
    { key: 'red', name: 'ルビー', short: '赤', ink: '#ffffff' },
    { key: 'black', name: 'オニキス', short: '黒', ink: '#ffffff' },
    { key: 'gold', name: '黄金', short: '金', ink: '#3a2706' }
  ];
  var ROMAN = ['I', 'II', 'III'];

  function poly(cx, cy, r, n, rot) {
    var pts = [];
    for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2)); }
    return pts;
  }
  function brilliant() {
    var o = poly(50, 50, 45, 8, Math.PI / 8), t = poly(50, 50, 23, 8, Math.PI / 8), m = poly(50, 50, 45, 8, 0), s = '';
    for (var i = 0; i < 8; i++) {
      var j = (i + 1) % 8;
      // star facets between the table and the girdle, alternating light and shade
      s += '<path d="M' + t[i] + 'L' + m[j] + 'L' + t[j] + 'Z" fill="' + (i % 2 ? '#e3ebf6' : '#fbfdff') + '"/>';
      s += '<path d="M' + t[i] + 'L' + o[i] + 'L' + m[j] + 'Z" fill="' + (i % 2 ? '#c9d5e6' : '#eef3fa') + '"/>';
      s += '<path d="M' + t[j] + 'L' + m[j] + 'L' + o[j] + 'Z" fill="' + (i % 2 ? '#d7e1ef' : '#bfcde2') + '"/>';
    }
    return '<g stroke="#8d9cb6" stroke-width="1.6" stroke-linejoin="round">' + s +
      '<polygon points="' + t.join(' ') + '" fill="#ffffff"/></g><polygon points="' + o.join(' ') + '" fill="none" stroke="#7d8daa" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M38 36l7-6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>';
  }
  function oval() {
    var s = '<ellipse cx="50" cy="50" rx="31" ry="45" fill="#2b62d6"/>', i, a;
    for (i = 0; i < 12; i++) {
      a = i * Math.PI / 6;
      var x1 = 50 + 31 * Math.cos(a), y1 = 50 + 45 * Math.sin(a), x2 = 50 + 31 * Math.cos(a + Math.PI / 6), y2 = 50 + 45 * Math.sin(a + Math.PI / 6);
      var tx = 50 + 16 * Math.cos(a + Math.PI / 12), ty = 50 + 24 * Math.sin(a + Math.PI / 12);
      s += '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ',' + y2.toFixed(1) + 'L' + tx.toFixed(1) + ',' + ty.toFixed(1) + 'Z" fill="' + (i % 3 === 0 ? '#1a43a6' : i % 3 === 1 ? '#3f7cf0' : '#2457c4') + '"/>';
    }
    return '<g stroke="#122f78" stroke-width="1.4" stroke-linejoin="round">' + s + '<ellipse cx="50" cy="50" rx="16" ry="24" fill="#6d9ff7"/></g>' +
      '<ellipse cx="50" cy="50" rx="31" ry="45" fill="none" stroke="#0f2a6e" stroke-width="2.4"/><path d="M41 34q4-7 11-8" stroke="#dfeaff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>';
  }
  function stepCut() {
    var outer = 'M30,8H70L84,22V78L70,92H30L16,78V22Z', mid = 'M34,18H66L74,26V74L66,82H34L26,74V26Z', tab = 'M38,28H62L65,31V69L62,72H38L35,69V31Z';
    return '<path d="' + outer + '" fill="#13875a" stroke="#0a5135" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="' + mid + '" fill="#22ad78" stroke="#0d6a45" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="' + tab + '" fill="#7fe0b6" stroke="#0f7a4f" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<g stroke="#0d6a45" stroke-width="1.2"><path d="M30,8L34,18M70,8L66,18M84,22L74,26M84,78L74,74M70,92L66,82M30,92L34,82M16,78L26,74M16,22L26,26"/>' +
      '<path d="M34,18L38,28M66,18L62,28M74,26L65,31M74,74L65,69M66,82L62,72M34,82L38,72M26,74L35,69M26,26L35,31"/></g>' +
      '<path d="M40 34v14" stroke="#e9fff4" stroke-width="3" stroke-linecap="round" opacity=".85"/>';
  }
  function trillion() {
    var A = [50, 7], B = [93, 84], C = [7, 84], a = [50, 35], b = [70, 70], c = [30, 70];
    var p = function (q) { return q[0] + ',' + q[1]; };
    return '<g stroke="#7a0f22" stroke-width="1.5" stroke-linejoin="round">' +
      '<path d="M' + p(A) + 'L' + p(B) + 'L' + p(b) + 'L' + p(a) + 'Z" fill="#d42443"/>' +
      '<path d="M' + p(B) + 'L' + p(C) + 'L' + p(c) + 'L' + p(b) + 'Z" fill="#a8142f"/>' +
      '<path d="M' + p(C) + 'L' + p(A) + 'L' + p(a) + 'L' + p(c) + 'Z" fill="#ee5470"/>' +
      '<path d="M' + p(a) + 'L' + p(b) + 'L' + p(c) + 'Z" fill="#f68ea0"/></g>' +
      '<path d="M' + p(A) + 'L' + p(B) + 'L' + p(C) + 'Z" fill="none" stroke="#6b0c1d" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<path d="M44 33l-6 11" stroke="#ffe3e8" stroke-width="3" stroke-linecap="round" opacity=".85"/>';
  }
  function cabochon() {
    return '<circle cx="50" cy="50" r="42" fill="url(#onyxDome)" stroke="#0a090c" stroke-width="2.4"/>' +
      '<circle cx="50" cy="50" r="30" fill="none" stroke="#a79bbd" stroke-width="1.2" opacity=".35"/>' +
      '<circle cx="50" cy="50" r="20" fill="none" stroke="#a79bbd" stroke-width="1" opacity=".22"/>' +
      '<ellipse cx="37" cy="33" rx="11" ry="6" fill="#fff" opacity=".42" transform="rotate(-32 37 33)"/>';
  }
  function crownCoin() {
    return '<circle cx="50" cy="50" r="43" fill="#f0c03f" stroke="#8c6512" stroke-width="2.4"/>' +
      '<circle cx="50" cy="50" r="35" fill="none" stroke="#b8891d" stroke-width="2" stroke-dasharray="3 3"/>' +
      '<path d="M28,64L24,36L38,48L50,28L62,48L76,36L72,64Z" fill="#8c6512" stroke="#6a4b0b" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<rect x="28" y="66" width="44" height="7" rx="2" fill="#8c6512"/>' +
      '<circle cx="50" cy="27" r="3.4" fill="#fff4cf"/><circle cx="24" cy="35" r="2.6" fill="#fff4cf"/><circle cx="76" cy="35" r="2.6" fill="#fff4cf"/>' +
      '<path d="M33 22q8-7 18-8" stroke="#fff6d8" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/>';
  }
  var CUTS = [brilliant, oval, stepCut, trillion, cabochon, crownCoin];
  // chip rims: light rim for dark gems, dark rim for light ones; edge notches like a heavy clay token
  var RIM = ['#cfd6e4', '#1d4bb0', '#0e7a50', '#b51f3a', '#2c2733', '#d9a426'];
  var FACE = ['#f6f8fc', '#2f66d3', '#17945f', '#d02c48', '#3d3646', '#f3ca4f'];
  var NOTCH = ['#8d9cb6', '#d7e4ff', '#d6f7e8', '#ffd9df', '#b8acc9', '#fff1c4'];

  function sprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<radialGradient id="onyxDome" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#7c7289"/><stop offset=".45" stop-color="#36303f"/><stop offset="1" stop-color="#121016"/></radialGradient>';
    for (var i = 0; i < 6; i++) s += '<symbol id="g' + i + '" viewBox="0 0 100 100">' + CUTS[i]() + '</symbol>';
    for (i = 0; i < 6; i++) {
      var notches = '';
      for (var k = 0; k < 8; k++) notches += '<rect x="46" y="1.5" width="8" height="11" rx="2" fill="' + NOTCH[i] + '" transform="rotate(' + (k * 45 + 22.5) + ' 50 50)"/>';
      s += '<symbol id="chip' + i + '" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="' + RIM[i] + '"/>' + notches +
        '<circle cx="50" cy="50" r="37" fill="' + FACE[i] + '" stroke="rgba(0,0,0,.28)" stroke-width="1.5"/>' +
        '<use href="#g' + i + '" x="23" y="23" width="54" height="54"/>' +
        '<circle cx="50" cy="50" r="48" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/></symbol>';
    }
    s += '<symbol id="crown" viewBox="0 0 100 100"><path d="M16,72L10,30L32,48L50,18L68,48L90,30L84,72Z" fill="currentColor"/><rect x="16" y="76" width="68" height="10" rx="3" fill="currentColor"/></symbol>';
    s += '<symbol id="laurel" viewBox="0 0 100 100"><g fill="currentColor"><path d="M50 92C26 84 12 62 14 34c6 10 12 30 36 48z"/><path d="M50 92C74 84 88 62 86 34c-6 10-12 30-36 48z"/></g></symbol>';
    return s + '</defs></svg>';
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function gem(i, cls) { return '<svg class="' + (cls || 'gem') + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#g' + i + '"/></svg>'; }
  function chip(i, cls) { return '<svg class="' + (cls || 'chip') + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#chip' + i + '"/></svg>'; }

  function costLabel(cost) {
    var parts = [];
    for (var i = 0; i < 5; i++) if (cost[i]) parts.push(GEMS[i].name + cost[i]);
    return parts.join('、');
  }
  function cardLabel(c) {
    return 'レベル' + ROMAN[c.tier] + '、' + GEMS[c.color].name + 'のカード、' + (c.pts ? c.pts + '点、' : '') + 'コスト ' + costLabel(c.cost);
  }
  /* a development card. opts: { tag: 'button'|'div', cls, attrs, badge } */
  function card(c, opts) {
    opts = opts || {};
    var tag = opts.tag || 'div', cost = '', nc = 0;
    for (var i = 0; i < 5; i++) if (c.cost[i]) { cost += '<i class="k' + i + '">' + c.cost[i] + '</i>'; nc++; }
    return '<' + tag + ' class="card c' + c.color + ' t' + c.tier + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') +
      ' aria-label="' + esc(cardLabel(c) + (opts.extraLabel || '')) + '">' +
      '<span class="card-top">' + (c.pts ? '<b class="pts">' + c.pts + '</b>' : '<b class="pts"></b>') + gem(c.color, 'gem bonus') + '</span>' +
      gem(c.color, 'gem mark') +
      '<span class="cost n' + nc + '">' + cost + '</span>' + (opts.badge ? '' : '<span class="tier">' + ROMAN[c.tier] + '</span>') +
      (opts.badge ? '<span class="badge ' + (opts.badgeCls || '') + '">' + esc(opts.badge) + '</span>' : '') +
      '</' + tag + '>';
  }
  function back(tier, opts) {
    opts = opts || {};
    var tag = opts.tag || 'div';
    return '<' + tag + ' class="card back t' + tier + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') + ' aria-label="' + esc(opts.label || ('レベル' + ROMAN[tier] + 'の裏向きのカード')) + '">' +
      '<span class="back-mark">' + ROMAN[tier] + '</span>' + (opts.count != null ? '<span class="back-count">' + opts.count + '</span>' : '') + '</' + tag + '>';
  }
  function noble(n, opts) {
    opts = opts || {};
    var req = '';
    for (var i = 0; i < 5; i++) if (n.req[i]) req += '<i class="k' + i + '">' + n.req[i] + '</i>';
    var parts = []; for (i = 0; i < 5; i++) if (n.req[i]) parts.push(GEMS[i].name + n.req[i] + '枚');
    var tag = opts.tag || 'div';
    return '<' + tag + ' class="noble' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') + ' aria-label="' + esc('貴族、3点、ボーナス ' + parts.join('、') + (opts.extraLabel || '')) + '">' +
      '<span class="noble-top"><svg class="crown" viewBox="0 0 100 100" aria-hidden="true"><use href="#crown"/></svg><b class="pts">3</b></span>' +
      '<span class="req">' + req + '</span>' + (opts.note ? '<span class="noble-note">' + esc(opts.note) + '</span>' : '') + '</' + tag + '>';
  }

  root.SPL_ART = { GEMS: GEMS, ROMAN: ROMAN, sprite: sprite, gem: gem, chip: chip, card: card, back: back, noble: noble, cardLabel: cardLabel, costLabel: costLabel, esc: esc };
})(typeof window !== 'undefined' ? window : this);
