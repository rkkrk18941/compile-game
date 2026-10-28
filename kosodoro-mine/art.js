/* コソドロ・マイン: original characters with the earlier mine UI and component artwork. */
(function (root) {
  'use strict';

  /* Only the character illustrations use the original Japanese edition art.
     All card icons, colours, ore, card backs and carts retain the previous style. */
  var ORIGINAL_SPECIAL = [8, 7, 4, 5, 3, 2, 6, 1];
  function face(ani) {
    var no = ORIGINAL_SPECIAL[ani] || ORIGINAL_SPECIAL[0];
    return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><image href="assets/original/miner-' + no + '.webp" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>';
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

  var api = { face: face, icon: icon, back: BACK, nugget: nugget, cart: cart, count: ORIGINAL_SPECIAL.length };
  root.KOSO_ART = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
