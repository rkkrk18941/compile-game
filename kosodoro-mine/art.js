/* Original printed artwork, extracted from the publisher's Japanese rulebook.
   See assets/original/SOURCES.md. No generated substitute art is used. */
(function (root) {
  'use strict';
  var BASE = 'assets/original/', NUM = [8, 7, 4, 5, 3, 2, 6, 1];
  function img(name, cls, alt, size) {
    return '<img class="original-art ' + (cls || '') + '" src="' + BASE + name + '.webp" alt="' + (alt || '') + '" draggable="false"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + '>';
  }
  function face(ani) { return img('portrait-' + NUM[ani], 'portrait'); }
  function character(ani) { return img('character-' + ani, 'character-art'); }
  function card(a, ani) { return img(a === 'x' ? 'special-' + NUM[ani] : 'action-' + a, 'printed-card'); }
  function icon(a) { return card(a, 0); }
  function nugget(size, value) { return img('ore-' + (value || 1), 'ore-art', '', size || 16); }
  function tokens(n, cap) {
    var html = '', count = 0;
    [10, 5, 1].forEach(function (value) {
      while (n >= value && count < (cap || 18)) { html += nugget(24, value); n -= value; count++; }
    });
    return html;
  }
  function cart(n) { return '<span class="original-pool">' + tokens(n, 18) + '</span>'; }
  var api = { face: face, character: character, card: card, icon: icon,
    back: img('back', 'card-back'), nugget: nugget, tokens: tokens, cart: cart, count: 8 };
  root.KOSO_ART = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
