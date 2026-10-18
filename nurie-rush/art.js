/* ヌリエ・ラッシュ — all drawings are inline SVG made here: the five animals, the coloured-in cards,
   the pieces on the table and the card back. Each animal sits in a 100×100 box and is painted in one colour
   (plus a darker shade of the same colour for details), with a dark outline and white eyes, so the only
   colours on a card are the two paint colours. With the colour-pattern aid switched on, every paint colour
   also gets its own texture (赤=水玉, 黄=無地, 緑=ななめ線, 青=横線, ピンク=格子). */
(function (root, factory) {
  var api = factory(root && root.NR_DECK ? root.NR_DECK : (typeof require === 'function' ? require('./deck.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_ART = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  var INK = '#2b2420';
  var PAPER = '#fffaf0';
  var opts = { patterns: false };

  function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgb2hex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(h, to, t) { var a = hex2rgb(h), b = hex2rgb(to); return rgb2hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  function shade(h) { return mix(h, '#1a1410', 0.3); }

  function sw(w) { return ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function eye(cx, cy, r, lx) {
    lx = lx || 0;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#fff"' + sw(2.1) + '/>' +
      '<circle cx="' + (cx + lx * r * 0.32).toFixed(2) + '" cy="' + (cy + r * 0.1).toFixed(2) + '" r="' + (r * 0.55).toFixed(2) + '" fill="' + INK + '"/>' +
      '<circle cx="' + (cx + lx * r * 0.32 - r * 0.2).toFixed(2) + '" cy="' + (cy - r * 0.14).toFixed(2) + '" r="' + (r * 0.19).toFixed(2) + '" fill="#fff"/>';
  }
  /* a limb drawn as an outlined stroke: dark wide line, colour line on top */
  function limb(d, w, col) {
    return '<path d="' + d + '" fill="none"' + sw(w + 3.2) + '/>' + '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  /* a main paint area: filled with the paint colour (and the colour's texture when the aid is on) */
  function paint(tag, attrs, F, P, w) {
    var s = '<' + tag + ' ' + attrs + ' fill="' + F + '"' + sw(w == null ? 3 : w) + '/>';
    if (P) s += '<' + tag + ' ' + attrs + ' fill="' + P + '" stroke="none" pointer-events="none"/>';
    return s;
  }

  /* ------------------------------------------------------------ the five animals (100×100, centre 50,52) */
  var DRAW = {};

  DRAW.crab = function (F, S, P) {
    var s = '';
    // legs, three a side
    s += limb('M31 60 Q18 56 11 64', 4.2, F) + limb('M30 66 Q17 68 12 77', 4.2, F) + limb('M34 72 Q24 80 21 88', 4.2, F);
    s += limb('M69 60 Q82 56 89 64', 4.2, F) + limb('M70 66 Q83 68 88 77', 4.2, F) + limb('M66 72 Q76 80 79 88', 4.2, F);
    // arms
    s += limb('M35 52 Q26 46 21 37', 4.6, F) + limb('M65 52 Q74 46 79 37', 4.6, F);
    // claws
    s += paint('path', 'd="M20 41 C9 41 5 29 9 20 C10.5 16.5 13.5 14.5 16.5 15 L17 26 L25.5 20 C29 25 28.5 37 20 41 Z"', F, P);
    s += paint('path', 'd="M80 41 C91 41 95 29 91 20 C89.5 16.5 86.5 14.5 83.5 15 L83 26 L74.5 20 C71 25 71.5 37 80 41 Z"', F, P);
    // eye stalks
    s += limb('M44 47 L42.5 33', 3.6, F) + limb('M56 47 L57.5 33', 3.6, F);
    // body
    s += paint('ellipse', 'cx="50" cy="61" rx="25.5" ry="17.5"', F, P);
    s += '<path d="M33 55 Q50 47 67 55" fill="none" stroke="' + S + '" stroke-width="3" stroke-linecap="round"/>';
    s += '<circle cx="39" cy="66" r="2.6" fill="' + S + '"/><circle cx="61" cy="66" r="2.6" fill="' + S + '"/><circle cx="50" cy="70.5" r="2.2" fill="' + S + '"/>';
    s += eye(42, 30, 5.6, 0) + eye(58, 30, 5.6, 0);
    s += '<path d="M45 62 Q50 66.5 55 62" fill="none"' + sw(2.2) + '/>';
    return s;
  };

  DRAW.chick = function (F, S, P) {
    var s = '';
    // feet
    s += '<path d="M40 86 L35 92 M40 86 L40 93 M40 86 L45 92 M60 86 L55 92 M60 86 L60 93 M60 86 L65 92" fill="none"' + sw(5.6) + '/>';
    s += '<path d="M40 86 L35 92 M40 86 L40 93 M40 86 L45 92 M60 86 L55 92 M60 86 L60 93 M60 86 L65 92" fill="none" stroke="' + S + '" stroke-width="2.6" stroke-linecap="round"/>';
    // tuft
    s += paint('path', 'd="M47 26 C42 18 44 11 50 9 C49 15 51 19 53 25 Z"', F, P, 2.6);
    s += paint('path', 'd="M52 25 C55 18 61 16 65 18 C60 20 57 23 56 28 Z"', F, P, 2.6);
    // wings
    s += paint('path', 'd="M22 54 C11 56 9 68 17 74 C20 70 23 67 27 66 Z"', F, P, 2.8);
    s += paint('path', 'd="M78 54 C89 56 91 68 83 74 C80 70 77 67 73 66 Z"', F, P, 2.8);
    // body
    s += paint('path', 'd="M50 23 C70 23 80 41 80 58 C80 77 67 88 50 88 C33 88 20 77 20 58 C20 41 30 23 50 23 Z"', F, P);
    s += '<path d="M30 64 C33 76 42 82 50 82" fill="none" stroke="' + S + '" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>';
    // face
    s += eye(40, 48, 5, 0) + eye(60, 48, 5, 0);
    s += '<path d="M43 58 L50 53.5 L57 58 L50 65 Z" fill="' + S + '"' + sw(2.4) + '/>';
    s += '<path d="M43.5 58 L56.5 58" fill="none"' + sw(1.8) + '/>';
    return s;
  };

  DRAW.turtle = function (F, S, P) {
    var s = '';
    // tail and legs
    s += paint('path', 'd="M16 63 L5 67.5 L17 69.5 Z"', F, P, 2.8);
    s += paint('rect', 'x="21" y="61" width="13" height="18" rx="5"', F, P, 2.8);
    s += paint('rect', 'x="58" y="61" width="13" height="18" rx="5"', F, P, 2.8);
    s += '<path d="M24 75 L31 75 M61 75 L68 75" fill="none" stroke="' + S + '" stroke-width="2.4" stroke-linecap="round"/>';
    // neck and head
    s += paint('path', 'd="M70 62 C74 54 76 49 82 47 L88 56 C82 58 79 62 77 66 Z"', F, P, 2.8);
    s += paint('circle', 'cx="86" cy="47" r="11"', F, P);
    s += eye(88.5, 44, 3.9, 1);
    s += '<path d="M88 52.5 Q92 54 95.5 50.5" fill="none"' + sw(2) + '/>';
    // shell
    s += paint('path', 'd="M13 64 C13 37 29 23 46 23 C64 23 80 37 80 64 Z"', F, P);
    s += '<path d="M38.5 36 L53.5 36 L60 47.5 L53.5 59 L38.5 59 L32 47.5 Z" fill="' + S + '" opacity=".55"' + sw(2.2) + '/>';
    s += '<path d="M38.5 36 L33 26.5 M53.5 36 L59 26.5 M60 47.5 L77.5 47.5 M32 47.5 L14.5 47.5 M38.5 59 L35 63.5 M53.5 59 L57 63.5" fill="none"' + sw(2.2) + '/>';
    s += paint('rect', 'x="10" y="61" width="73" height="8.5" rx="4.2"', S, '', 2.8);
    return s;
  };

  DRAW.fish = function (F, S, P) {
    var s = '';
    // fins behind the body
    s += paint('path', 'd="M37 35 C42 21 58 19 66 31 Z"', S, '', 2.8);
    s += paint('path', 'd="M46 70 C50 80 60 81 63 72 Z"', S, '', 2.8);
    // tail
    s += paint('path', 'd="M73 52 L94 35 C89.5 45.5 89.5 58.5 94 69 Z"', F, P);
    // body
    s += paint('path', 'd="M8 52 C16 36 34 30 49 30 C65 30 76 41 79 52 C76 63 65 74 49 74 C34 74 16 68 8 52 Z"', F, P);
    s += '<path d="M51 33 C46.5 44 46.5 60 51 71 M63 36.5 C59 46 59 58 63 67.5" fill="none" stroke="' + S + '" stroke-width="4.4" stroke-linecap="round"/>';
    s += '<path d="M29 40 C35 46 35 58 29 64" fill="none"' + sw(2.4) + '/>';
    s += eye(19.5, 47, 5, -1);
    s += '<path d="M8.5 52.5 L14 54" fill="none"' + sw(2.2) + '/>';
    return s;
  };

  DRAW.pig = function (F, S, P) {
    var s = '';
    // front feet (trotters)
    s += paint('path', 'd="M31 77 L31 88 Q31 92 35 92 L42 92 Q46 92 46 88 L46 77 Z"', F, P, 2.8);
    s += paint('path', 'd="M54 77 L54 88 Q54 92 58 92 L65 92 Q69 92 69 88 L69 77 Z"', F, P, 2.8);
    s += '<path d="M38.5 86 L38.5 92 M61.5 86 L61.5 92" fill="none"' + sw(2) + '/>';
    // head and body
    s += paint('ellipse', 'cx="50" cy="55" rx="33" ry="28"', F, P);
    // floppy ears, folded forward over the head
    s += paint('path', 'd="M22 38 C16 30 15 20 19 13 C28 15 37 22 42 31 C35 30 28 33 22 38 Z"', F, P, 2.8);
    s += paint('path', 'd="M78 38 C84 30 85 20 81 13 C72 15 63 22 58 31 C65 30 72 33 78 38 Z"', F, P, 2.8);
    s += '<path d="M23 31 C22 25 22 21 23.5 18 C29 20 33 24 36 28 Z M77 31 C78 25 78 21 76.5 18 C71 20 67 24 64 28 Z" fill="' + S + '"/>';
    // face
    s += eye(36.5, 47.5, 4.4, 0) + eye(63.5, 47.5, 4.4, 0);
    s += paint('ellipse', 'cx="50" cy="62" rx="16" ry="11.5"', F, P, 3.2);
    s += '<ellipse cx="44.4" cy="62" rx="3" ry="4.6" fill="' + S + '"' + sw(1.6) + '/><ellipse cx="55.6" cy="62" rx="3" ry="4.6" fill="' + S + '"' + sw(1.6) + '/>';
    s += '<path d="M42 77.5 Q50 81.5 58 77.5" fill="none"' + sw(2.2) + '/>';
    return s;
  };

  /* <g> of one animal painted in colour key c ('r','y','g','b','p'), placed by transform t (optional) */
  function animal(kind, c, t) {
    var F = D.HEX[c], S = shade(F), P = opts.patterns ? 'url(#nr-pat-' + c + ')' : '';
    return '<g' + (t ? ' transform="' + t + '"' : '') + '>' + DRAW[kind](F, S, P) + '</g>';
  }

  /* ------------------------------------------------------------ texture defs for the colour-pattern aid */
  function defs() {
    var k = 'rgba(43,36,32,.30)';
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      '<pattern id="nr-pat-r" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.7" fill="' + k + '"/><circle cx="7" cy="7" r="1.7" fill="' + k + '"/></pattern>' +
      '<pattern id="nr-pat-y" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="none"/></pattern>' +
      '<pattern id="nr-pat-g" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.6" height="8" fill="' + k + '"/></pattern>' +
      '<pattern id="nr-pat-b" width="8" height="7" patternUnits="userSpaceOnUse"><rect y="2" width="8" height="2.2" fill="' + k + '"/></pattern>' +
      '<pattern id="nr-pat-p" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4H8M4 0V8" stroke="' + k + '" stroke-width="1.5"/></pattern>' +
      '</defs></svg>';
  }

  /* ------------------------------------------------------------ cards */
  var W = 320, H = 250;
  /* where the two animals of each pair stand: [x, y, scale, rotate, flip] for the first and the second animal */
  var LAYOUT = [
    /* カニ × ヒヨコ   */ [[102, 150, 1.6, -4, 0], [230, 106, 1.45, 6, 0]],
    /* カニ × カメ     */ [[86, 102, 1.46, 0, 0], [226, 152, 1.6, 0, 1]],
    /* カニ × サカナ   */ [[100, 160, 1.6, 3, 0], [230, 82, 1.5, -10, 0]],
    /* カニ × ブタ     */ [[232, 158, 1.46, 5, 0], [98, 116, 1.58, -3, 0]],
    /* ヒヨコ × カメ   */ [[84, 148, 1.46, -6, 0], [212, 120, 1.66, 0, 1]],
    /* ヒヨコ × サカナ */ [[234, 146, 1.46, 5, 0], [100, 102, 1.58, 8, 1]],
    /* ヒヨコ × ブタ   */ [[84, 148, 1.4, -4, 0], [212, 120, 1.62, 3, 0]],
    /* カメ × サカナ   */ [[104, 150, 1.68, 0, 0], [232, 86, 1.44, 12, 1]],
    /* カメ × ブタ     */ [[228, 160, 1.56, 0, 1], [94, 102, 1.56, -5, 0]],
    /* サカナ × ブタ   */ [[96, 98, 1.52, -12, 0], [222, 136, 1.62, 4, 0]]
  ];
  function place(p) {
    var x = p[0], y = p[1], s = p[2], r = p[3], f = p[4] ? -1 : 1;
    return 'translate(' + x + ' ' + y + ') rotate(' + r + ') scale(' + (s * f) + ' ' + s + ') translate(-50 -52)';
  }
  function shadowAt(p) {
    return '<ellipse cx="' + p[0] + '" cy="' + (p[1] + 47 * p[2] * 0.82) + '" rx="' + (31 * p[2]) + '" ry="' + (5.5 * p[2]) + '" fill="rgba(43,36,32,.10)"/>';
  }
  function cardFace(card, o) {
    o = o || {};
    var L = LAYOUT[card.pair];
    var s = '<svg class="nr-card" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"' + (o.label ? ' role="img" aria-label="' + o.label + '"' : ' aria-hidden="true"') + '>';
    s += '<rect x="1.5" y="1.5" width="' + (W - 3) + '" height="' + (H - 3) + '" rx="18" fill="' + PAPER + '" stroke="#d9cdb4" stroke-width="3"/>';
    s += '<rect x="11" y="11" width="' + (W - 22) + '" height="' + (H - 22) + '" rx="11" fill="none" stroke="#e8dcc2" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>';
    s += shadowAt(L[0]) + shadowAt(L[1]);
    s += animal(card.a, card.ca, place(L[0]));
    s += animal(card.b, card.cb, place(L[1]));
    if (o.no) s += '<text x="' + (W - 20) + '" y="' + (H - 18) + '" text-anchor="end" font-size="15" font-weight="700" fill="#b9ab8e" font-family="Zen Maru Gothic,sans-serif">' + card.no + '</text>';
    return s + '</svg>';
  }
  function cardBack() {
    var s = '<svg class="nr-card" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<rect x="1.5" y="1.5" width="' + (W - 3) + '" height="' + (H - 3) + '" rx="18" fill="#2f6f6c" stroke="#1f4c4a" stroke-width="3"/>';
    s += '<rect x="13" y="13" width="' + (W - 26) + '" height="' + (H - 26) + '" rx="11" fill="none" stroke="#f6e7c4" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" opacity=".7"/>';
    // crayon scribble band
    var cols = ['r', 'y', 'g', 'b', 'p'];
    for (var i = 0; i < 5; i++) {
      var y0 = 70 + i * 24;
      s += '<path d="M44 ' + y0 + ' C 90 ' + (y0 - 14) + ', 130 ' + (y0 + 14) + ', 170 ' + y0 + ' S 250 ' + (y0 - 12) + ', 276 ' + (y0 + 2) + '" fill="none" stroke="' + D.HEX[cols[i]] + '" stroke-width="9" stroke-linecap="round" opacity=".9"/>';
    }
    s += '<text x="160" y="56" text-anchor="middle" font-size="22" fill="#f6e7c4" font-family="Dela Gothic One,sans-serif" letter-spacing="3">ヌリエ</text>';
    s += '<text x="160" y="214" text-anchor="middle" font-size="15" fill="#f6e7c4" font-family="Zen Maru Gothic,sans-serif" font-weight="700" letter-spacing="4" opacity=".85">RUSH</text>';
    return s + '</svg>';
  }

  /* a piece on the table: the animal in its true colour on a round wooden token */
  function piece(kind, o) {
    o = o || {};
    var c = D.TRUE_COLOR[kind];
    var s = '<svg class="nr-piece" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    s += '<ellipse cx="60" cy="104" rx="44" ry="9" fill="rgba(43,36,32,.18)"/>';
    s += '<circle cx="60" cy="58" r="52" fill="#e7d3ac" stroke="#b59767" stroke-width="3"/>';
    s += '<circle cx="60" cy="56" r="47" fill="#f6ead0"/>';
    s += animal(kind, c, 'translate(60 57) scale(' + (o.scale || 0.95) + ') translate(-50 -52)');
    return s + '</svg>';
  }
  /* small inline icon of an animal in its true colour (for chips, names and result lines) */
  function icon(kind, c) {
    return '<svg class="nr-icon" viewBox="0 0 100 100" aria-hidden="true">' + animal(kind, c || D.TRUE_COLOR[kind], 'translate(50 52) scale(.92) translate(-50 -52)') + '</svg>';
  }

  return {
    W: W, H: H, LAYOUT: LAYOUT, INK: INK,
    animal: animal, cardFace: cardFace, cardBack: cardBack, piece: piece, icon: icon, defs: defs,
    setPatterns: function (on) { opts.patterns = !!on; }, patterns: function () { return opts.patterns; }
  };
});
