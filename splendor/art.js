/* 宝石の煌めき — original-edition printed card, noble and token artwork.
   Functional card/noble labels always come from the engine; artwork is matched by the complete printed values.
   Image sources, attribution and the 90-card mapping are documented in img/. */
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

  // The original printed components, packed locally; see img/README.md for sources.
  function sprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (var i = 0; i < 6; i++) {
      s += '<symbol id="g' + i + '" viewBox="0 0 100 100"><image href="img/gem-' + i + '.webp" width="100" height="100"/></symbol>';
      s += '<symbol id="chip' + i + '" viewBox="0 0 100 100"><image href="img/chip-' + i + '.webp" width="100" height="100"/></symbol>';
    }
    s += '<symbol id="crown" viewBox="0 0 100 100"><path d="M16,72L10,30L32,48L50,18L68,48L90,30L84,72Z" fill="currentColor"/><rect x="16" y="76" width="68" height="10" rx="3" fill="currentColor"/></symbol>';
    s += '<symbol id="laurel" viewBox="0 0 100 100"><g fill="currentColor"><path d="M50 92C26 84 12 62 14 34c6 10 12 30 36 48z"/><path d="M50 92C74 84 88 62 86 34c-6 10-12 30-36 48z"/></g></symbol>';
    return s + '</defs></svg>';
  }
  function face(kind, id, cols, rows) {
    var x = id % cols, y = Math.floor(id / cols);
    return '<span class="printed-face ' + kind + '-face" aria-hidden="true" style="background-position:' + (x * 100 / (cols - 1)).toFixed(6) + '% ' + (y * 100 / (rows - 1)).toFixed(6) + '%"></span>';
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
    var tag = opts.tag || 'div';
    return '<' + tag + ' class="card printed c' + c.color + ' t' + c.tier + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') +
      ' aria-label="' + esc(cardLabel(c) + (opts.extraLabel || '')) + '">' +
      face('card', c.id, 10, 9) +
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
    var parts = []; for (var i = 0; i < 5; i++) if (n.req[i]) parts.push(GEMS[i].name + n.req[i] + '枚');
    var tag = opts.tag || 'div';
    return '<' + tag + ' class="noble printed' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') + ' aria-label="' + esc('貴族、3点、ボーナス ' + parts.join('、') + (opts.extraLabel || '')) + '">' +
      face('noble', n.id, 5, 2) +
      (opts.note ? '<span class="noble-note">' + esc(opts.note) + '</span>' : '') + '</' + tag + '>';
  }

  root.SPL_ART = { GEMS: GEMS, ROMAN: ROMAN, sprite: sprite, gem: gem, chip: chip, card: card, back: back, noble: noble, cardLabel: cardLabel, costLabel: costLabel, esc: esc };
})(typeof window !== 'undefined' ? window : this);
