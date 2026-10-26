/* コソドロ・マイン: the drawings, as SVG strings (no images to load).
   Eight miners in hard hats, the three action cards, a card back, ore nuggets and the minecart. */
(function (root) {
  'use strict';

  var INK = '#2e1c10';
  function eyes(mood, y, dx, col) {
    col = col || INK;
    var l = 50 - dx, r = 50 + dx;
    if (mood === 'sly') return '<path d="M' + (l - 5) + ' ' + y + 'q5 -3 10 0M' + (r - 5) + ' ' + y + 'q5 -3 10 0" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>';
    if (mood === 'oops') return '<path d="M' + (l - 4) + ' ' + (y - 4) + 'l8 8M' + (l + 4) + ' ' + (y - 4) + 'l-8 8M' + (r - 4) + ' ' + (y - 4) + 'l8 8M' + (r + 4) + ' ' + (y - 4) + 'l-8 8" stroke="' + col + '" stroke-width="2.6" stroke-linecap="round"/>';
    if (mood === 'proud') return '<path d="M' + (l - 5) + ' ' + (y + 1) + 'q5 -6 10 0M' + (r - 5) + ' ' + (y + 1) + 'q5 -6 10 0" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>';
    return '<ellipse cx="' + l + '" cy="' + y + '" rx="3.6" ry="4.4" fill="' + col + '"/><ellipse cx="' + r + '" cy="' + y + '" rx="3.6" ry="4.4" fill="' + col + '"/>' +
      '<circle cx="' + (l + 1.2) + '" cy="' + (y - 1.5) + '" r="1.2" fill="#fff"/><circle cx="' + (r + 1.2) + '" cy="' + (y - 1.5) + '" r="1.2" fill="#fff"/>';
  }
  function mouth(mood, y) {
    if (mood === 'oops') return '<ellipse cx="50" cy="' + (y + 2) + '" rx="3.4" ry="4" fill="' + INK + '"/>';
    if (mood === 'sly') return '<path d="M44 ' + y + 'q7 5 13 -2" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
    if (mood === 'proud') return '<path d="M43 ' + y + 'q7 7 14 0" fill="none" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>';
    return '<path d="M45.5 ' + y + 'q4.5 3.5 9 0" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"/>';
  }
  /* the hard hat with its lamp: drawn over every head */
  function helmet(col, brim) {
    return '<path d="M21 45c0-17 13-28 29-28s29 11 29 28z" fill="' + col + '"/>' +
      '<path d="M27 40c2-10 10-17 20-18" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="14" y="41" width="72" height="8" rx="4" fill="' + brim + '"/>' +
      '<rect x="44" y="23" width="12" height="13" rx="3" fill="#4a4036"/>' +
      '<circle cx="50" cy="29.5" r="9" fill="#ffe7a3" opacity=".28"/><circle cx="50" cy="29.5" r="4.6" fill="#fff6d2"/>';
  }

  var FACES = [
    /* fox */ function (m) {
      return '<path d="M20 52 12 22 38 42z" fill="#d9692a"/><path d="M80 52 88 22 62 42z" fill="#d9692a"/><path d="M19 47 15 29 31 42z" fill="#3a2418"/><path d="M81 47 85 29 69 42z" fill="#3a2418"/>' +
        '<path d="M18 56c0-12 14-17 32-17s32 5 32 17c0 18-14 30-32 34-18-4-32-16-32-34z" fill="#e9843b"/>' +
        '<path d="M50 90c-10-2-22-9-27-21 9 2 18 7 27 7s18-5 27-7c-5 12-17 19-27 21z" fill="#fbefe0"/>' +
        eyes(m, 60, 13) + '<path d="M46 72h8l-4 4z" fill="' + INK + '"/>' + mouth(m, 79) + helmet('#f2b134', '#c8861d');
    },
    /* tanuki */ function (m) {
      return '<circle cx="22" cy="44" r="10" fill="#4b3a2c"/><circle cx="78" cy="44" r="10" fill="#4b3a2c"/>' +
        '<ellipse cx="50" cy="62" rx="34" ry="28" fill="#a08566"/>' +
        '<path d="M22 56c6-6 16-6 21 3 3 6-1 13-9 13-8 0-14-7-12-16zM78 56c-6-6-16-6-21 3-3 6 1 13 9 13 8 0 14-7 12-16z" fill="#4b3a2c"/>' +
        '<ellipse cx="50" cy="76" rx="15" ry="11" fill="#efe2cc"/>' +
        eyes(m, 62, 13, m ? '#f3ead8' : '#f3ead8').replace(/fill="#fff"/g, 'fill="#4b3a2c"') + '<ellipse cx="50" cy="72" rx="4.6" ry="3.4" fill="' + INK + '"/>' + mouth(m, 80) + helmet('#e9a13a', '#b87a22');
    },
    /* rabbit */ function (m) {
      return '<ellipse cx="50" cy="62" rx="31" ry="28" fill="#f3e9da"/>' +
        '<ellipse cx="30" cy="74" rx="7" ry="4.5" fill="#f5b8b8" opacity=".7"/><ellipse cx="70" cy="74" rx="7" ry="4.5" fill="#f5b8b8" opacity=".7"/>' +
        eyes(m, 62, 12) + '<path d="M46.5 70.5h7l-3.5 3.8z" fill="#e27d8c"/>' + mouth(m, 78) +
        '<path d="M30 74H16M30 77l-13 4M70 74h14M70 77l13 4" stroke="#b9a891" stroke-width="1.3" stroke-linecap="round"/>' +
        helmet('#f2b134', '#c8861d') +
        '<path d="M35 26c-6-10-8-24-4-26 5-2 11 11 12 24z" fill="#f3e9da"/><path d="M36 23c-3-7-4-16-2-17 3-1 6 8 7 16z" fill="#f2b2b8"/>' +
        '<path d="M65 26c6-10 8-24 4-26-5-2-11 11-12 24z" fill="#f3e9da"/><path d="M64 23c3-7 4-16 2-17-3-1-6 8-7 16z" fill="#f2b2b8"/>';
    },
    /* bear */ function (m) {
      return '<circle cx="23" cy="42" r="11" fill="#7b4c2b"/><circle cx="77" cy="42" r="11" fill="#7b4c2b"/><circle cx="23" cy="42" r="5.5" fill="#c98f5f"/><circle cx="77" cy="42" r="5.5" fill="#c98f5f"/>' +
        '<ellipse cx="50" cy="62" rx="34" ry="29" fill="#8f5a33"/>' +
        '<ellipse cx="50" cy="75" rx="16" ry="12" fill="#d9ae84"/>' +
        eyes(m, 60, 14) + '<ellipse cx="50" cy="70.5" rx="6" ry="4.2" fill="' + INK + '"/>' + mouth(m, 79) + helmet('#f2b134', '#c8861d');
    },
    /* mole */ function (m) {
      return '<ellipse cx="50" cy="63" rx="33" ry="28" fill="#5f514a"/>' +
        '<path d="M26 58q24-12 48 0" fill="none" stroke="#7a6a61" stroke-width="2" stroke-linecap="round" opacity=".7"/>' +
        (m ? eyes(m, 61, 13, '#efe6dc') : '<path d="M33 61q4 -2 8 0M59 61q4 -2 8 0" stroke="#efe6dc" stroke-width="2.6" stroke-linecap="round" fill="none"/>') +
        '<ellipse cx="50" cy="73" rx="10" ry="7.5" fill="#f08a9b"/><ellipse cx="47" cy="71" rx="3" ry="2" fill="#fff" opacity=".45"/>' +
        '<path d="M44 83q6 4 12 0" fill="none" stroke="#efe6dc" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M27 86c-4 0-7-3-6-6 3 1 5 0 6-2 1 3 3 4 6 3-1 3-3 5-6 5zM73 86c4 0 7-3 6-6-3 1-5 0-6-2-1 3-3 4-6 3 1 3 3 5 6 5z" fill="#f2a5b0"/>' + helmet('#e9a13a', '#b87a22');
    },
    /* owl */ function (m) {
      return '<path d="M20 46 16 30 33 41zM80 46 84 30 67 41z" fill="#7d5a35"/>' +
        '<ellipse cx="50" cy="62" rx="33" ry="29" fill="#b98a55"/>' +
        '<path d="M50 87c-15-3-25-13-25-25 0-8 6-12 13-12 5 0 9 2 12 6 3-4 7-6 12-6 7 0 13 4 13 12 0 12-10 22-25 25z" fill="#efdcb8"/>' +
        (m ? eyes(m, 61, 12) : '<circle cx="38" cy="61" r="8.5" fill="#fff8e6"/><circle cx="62" cy="61" r="8.5" fill="#fff8e6"/><circle cx="38" cy="61" r="5.2" fill="#e8a32c"/><circle cx="62" cy="61" r="5.2" fill="#e8a32c"/><circle cx="38" cy="61" r="2.8" fill="' + INK + '"/><circle cx="62" cy="61" r="2.8" fill="' + INK + '"/>') +
        '<path d="M46 69h8l-4 7z" fill="#e2852b"/>' + helmet('#f2b134', '#c8861d');
    },
    /* squirrel */ function (m) {
      return '<path d="M22 50 16 22l8 4 6-4 8 22zM78 50l6-28-8 4-6-4-8 22z" fill="#a84f22"/>' +
        '<ellipse cx="50" cy="62" rx="32" ry="28" fill="#c8652c"/>' +
        '<ellipse cx="34" cy="74" rx="11" ry="9" fill="#f6e3c7"/><ellipse cx="66" cy="74" rx="11" ry="9" fill="#f6e3c7"/>' +
        eyes(m, 60, 13) + '<ellipse cx="50" cy="70" rx="4" ry="3" fill="' + INK + '"/>' +
        '<rect x="46.5" y="76" width="3.2" height="5.5" rx="1" fill="#fff"/><rect x="50.3" y="76" width="3.2" height="5.5" rx="1" fill="#fff"/>' + helmet('#f2b134', '#c8861d');
    },
    /* hedgehog */ function (m) {
      return '<path d="M12 70 6 56l11 2-5-14 13 5-2-14 13 9 2-13 11 11 4-12 7 13 9-9v14l12-6-4 14 12-1-8 12 9 4z" fill="#7a5536"/>' +
        '<ellipse cx="50" cy="66" rx="29" ry="25" fill="#e5c79c"/>' +
        eyes(m, 63, 11) + '<circle cx="50" cy="74" r="4.4" fill="' + INK + '"/>' + mouth(m, 81) +
        '<ellipse cx="31" cy="75" rx="6" ry="3.6" fill="#f0a49a" opacity=".55"/><ellipse cx="69" cy="75" rx="6" ry="3.6" fill="#f0a49a" opacity=".55"/>' + helmet('#e9a13a', '#b87a22');
    }
  ];

  function face(ani, mood) {
    var f = FACES[ani] || FACES[0];
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' + f(mood || '') + '</svg>';
  }

  /* ---- action cards ---- */
  var ICON = {
    w: '<path d="M14 54 40 20" stroke="#7a4b26" stroke-width="5" stroke-linecap="round"/><path d="M24 14c10-4 23-2 30 6-9-2-18-1-26 4z" fill="#d6dde0" stroke="#4d5a60" stroke-width="2" stroke-linejoin="round"/><circle cx="37" cy="21" r="3" fill="#4d5a60"/>' +
      '<path d="M44 52l4-6 6 3-2 6z" fill="#ffd166" stroke="#a8721a" stroke-width="1.4"/><path d="M52 58l3-4 4 2-2 4z" fill="#ffd166" stroke="#a8721a" stroke-width="1.2"/>',
    s: '<path d="M22 22c5 5 15 5 20 0l-3 8H25z" fill="#b3895a" stroke="#5c3f22" stroke-width="2" stroke-linejoin="round"/><path d="M25 30c-11 6-15 17-11 25 4 7 32 7 36 0 4-8 0-19-11-25z" fill="#c9a06b" stroke="#5c3f22" stroke-width="2.2"/>' +
      '<path d="M24 30h16" stroke="#5c3f22" stroke-width="3" stroke-linecap="round"/><path d="M20 44c4 4 10 5 14 2" fill="none" stroke="#8c6a42" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M44 40l6-5 6 4-3 7z" fill="#ffd166" stroke="#a8721a" stroke-width="1.4"/><path d="M8 52c6-2 10 0 12 4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>',
    g: '<path d="M32 8v6" stroke="#4a4036" stroke-width="3" stroke-linecap="round"/><path d="M24 14h16l2 6H22z" fill="#4a4036"/>' +
      '<path d="M23 20h18l-2 26H25z" fill="#ffe08a" stroke="#4a4036" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 24h8v18h-8z" fill="#fff6d2"/>' +
      '<path d="M22 46h20l-2 6H24z" fill="#4a4036"/>' +
      '<path d="M10 22l-6-4M10 32H2M10 42l-6 4M54 22l6-4M54 32h8M54 42l6 4" stroke="#ffe08a" stroke-width="2.6" stroke-linecap="round"/>'
  };
  function icon(a) { return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + (ICON[a] || '') + '</svg>'; }

  /* the back of a card: a branded mine token */
  var BACK = '<svg viewBox="0 0 60 80" aria-hidden="true" focusable="false"><rect x="2" y="2" width="56" height="76" rx="7" fill="#6e4426" stroke="#3c2312" stroke-width="2"/>' +
    '<path d="M8 18h44M8 34h44M8 50h44M8 66h44" stroke="#5c3720" stroke-width="1.4"/>' +
    '<circle cx="30" cy="40" r="15" fill="#4d2e18" stroke="#c99a63" stroke-width="2"/>' +
    '<path d="M21 49 39 31M39 49 21 31" stroke="#c99a63" stroke-width="3" stroke-linecap="round"/><path d="M17 33q5-6 11-4M43 33q-5-6-11-4" fill="none" stroke="#e8c48f" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function nugget(size) {
    size = size || 16;
    return '<svg viewBox="0 0 20 20" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false"><path d="M3 12 6 4l8-1 4 7-3 7-9 1z" fill="#ffd166" stroke="#9a6514" stroke-width="1.3" stroke-linejoin="round"/><path d="M6 4l3 6 5-7M9 10l-6 2M9 10l6 7M9 10l9 0" stroke="#d4921c" stroke-width="1" fill="none"/><path d="M7 6l2 2" stroke="#fff6cf" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }

  /* the minecart holding the reward pool; the pile grows with n */
  function cart(n) {
    var h = Math.min(40, n <= 0 ? 0 : 5 + Math.sqrt(n) * 5.2), pile = '';
    if (n > 0) {
      pile = '<path d="M6 48 Q60 ' + (48 - h * 2) + ' 114 48Z" fill="#e8b23e"/>';
      var k = Math.min(22, Math.ceil(n / 1.4)), seed = 7;
      for (var i = 0; i < k; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        var x = 16 + (seed / 233280) * 88, top = 48 - h * (1 - Math.pow((x - 60) / 54, 2));
        seed = (seed * 9301 + 49297) % 233280;
        var y = top + 3 + (seed / 233280) * Math.max(1, 46 - top - 3);
        pile += '<path transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(.62)" d="M-7 2-4-6l8-1 4 7-3 7-9 1z" fill="#ffd166" stroke="#9a6514" stroke-width="1.6" stroke-linejoin="round"/>';
      }
    }
    return '<svg viewBox="0 0 120 92" aria-hidden="true" focusable="false">' +
      '<path d="M0 86h120" stroke="#5a463a" stroke-width="3"/><path d="M8 90h104" stroke="#3b2e26" stroke-width="2" stroke-dasharray="6 7"/>' +
      pile +
      '<path d="M4 46h112l-12 32H16z" fill="#5d6a70" stroke="#2f383c" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M10 54h100M14 66h92" stroke="#76858b" stroke-width="2"/>' +
      '<g fill="#2f383c"><circle cx="16" cy="51" r="1.8"/><circle cx="104" cy="51" r="1.8"/><circle cx="22" cy="73" r="1.8"/><circle cx="98" cy="73" r="1.8"/></g>' +
      '<circle cx="34" cy="80" r="8" fill="#2b2622" stroke="#1a1512" stroke-width="2"/><circle cx="34" cy="80" r="3" fill="#8a7a6c"/>' +
      '<circle cx="86" cy="80" r="8" fill="#2b2622" stroke="#1a1512" stroke-width="2"/><circle cx="86" cy="80" r="3" fill="#8a7a6c"/></svg>';
  }

  var api = { face: face, icon: icon, back: BACK, nugget: nugget, cart: cart, count: FACES.length };
  root.KOSO_ART = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
