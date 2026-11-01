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
  var FACE_V = '20261101';   // card faces were retouched (printed cost column removed): refresh cached copies
  var COST_Y = 81;   // baseline that centres a cost digit (88px in the gem's 100-unit box; see .gcost text)

  // The original printed components, packed locally; see img/README.md for sources.
  function sprite() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (var i = 0; i < 6; i++) {
      s += '<symbol id="g' + i + '" viewBox="0 0 100 100"><image href="img/gem-' + i + '.webp" width="100" height="100"/></symbol>';
      s += '<symbol id="chip' + i + '" viewBox="0 0 100 100"><image href="img/chip-' + i + '.webp" width="100" height="100"/></symbol>';
    }
    // purchase cost: a cut gem in a gold bezel, coloured by the --gk/--gt of its k0…k4 class (see .gcost in index.html)
    s += '<linearGradient id="cgBezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5d2"/><stop offset=".3" stop-color="#ecc56a"/><stop offset=".62" stop-color="#9a6a1b"/><stop offset="1" stop-color="#f4d68c"/></linearGradient>';
    s += '<linearGradient id="cgSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>';
    s += '<symbol id="cgem" viewBox="0 0 100 100">' +
      '<path d="M29.3 0 70.7 0 100 29.3 100 70.7 70.7 100 29.3 100 0 70.7 0 29.3Z" fill="#0b0810"/>' +
      '<path d="M31.4 5 68.6 5 95 31.4 95 68.6 68.6 95 31.4 95 5 68.6 5 31.4Z" fill="url(#cgBezel)"/>' +
      '<path d="M33.4 10 66.6 10 90 33.4 90 66.6 66.6 90 33.4 90 10 66.6 10 33.4Z" style="fill:var(--gk)"/>' +
      '<path d="M33.4 10 66.6 10 60.4 25 39.6 25Z" fill="#fff" fill-opacity=".34"/>' +
      '<path d="M66.6 10 90 33.4 75 39.6 60.4 25Z" fill="#fff" fill-opacity=".16"/>' +
      '<path d="M90 33.4 90 66.6 75 60.4 75 39.6Z" fill="#000" fill-opacity=".12"/>' +
      '<path d="M90 66.6 66.6 90 60.4 75 75 60.4Z" fill="#000" fill-opacity=".28"/>' +
      '<path d="M66.6 90 33.4 90 39.6 75 60.4 75Z" fill="#000" fill-opacity=".34"/>' +
      '<path d="M33.4 90 10 66.6 25 60.4 39.6 75Z" fill="#000" fill-opacity=".2"/>' +
      '<path d="M10 66.6 10 33.4 25 39.6 25 60.4Z" fill="#fff" fill-opacity=".08"/>' +
      '<path d="M10 33.4 33.4 10 39.6 25 25 39.6Z" fill="#fff" fill-opacity=".48"/>' +
      '<path d="M39.6 25 60.4 25 75 39.6 75 60.4 60.4 75 39.6 75 25 60.4 25 39.6Z" style="fill:var(--gt)"/>' +
      '<path d="M39.6 25 60.4 25 75 39.6 75 60.4 60.4 75 39.6 75 25 60.4 25 39.6Z" fill="url(#cgSheen)"/>' +
      '<path d="M26 17.5 27.6 24.4 34.5 26 27.6 27.6 26 34.5 24.4 27.6 17.5 26 24.4 24.4Z" fill="#fff"/>' +
      '</symbol>';
    s += '<symbol id="crown" viewBox="0 0 100 100"><path d="M16,72L10,30L32,48L50,18L68,48L90,30L84,72Z" fill="currentColor"/><rect x="16" y="76" width="68" height="10" rx="3" fill="currentColor"/></symbol>';
    s += '<symbol id="laurel" viewBox="0 0 100 100"><g fill="currentColor"><path d="M50 92C26 84 12 62 14 34c6 10 12 30 36 48z"/><path d="M50 92C74 84 88 62 86 34c-6 10-12 30-36 48z"/></g></symbol>';
    return s + '</defs></svg>';
  }
  function face(kind, id, cols, rows) {
    if (kind === 'card') return '<span class="printed-face card-face" aria-hidden="true" style="background-image:url(img/cards/' + id + '.webp?v=' + FACE_V + ')"></span>';
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
    var tag = opts.tag || 'div', cost = '', n = 0;
    // each cost is a cut gem with its count; a 1 sits left of its advance width, so it is nudged to look centred
    for (var i = 0; i < 5; i++) if (c.cost[i]) {
      n++;
      cost += '<i class="k' + i + '"><svg viewBox="0 0 100 100"><use href="#cgem"/><text x="' + (c.cost[i] === 1 ? 54 : 50) + '" y="' + COST_Y + '">' + c.cost[i] + '</text></svg></i>';
    }
    return '<' + tag + ' class="card printed c' + c.color + ' t' + c.tier + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.attrs || '') +
      ' aria-label="' + esc(cardLabel(c) + (opts.extraLabel || '')) + '">' +
      face('card', c.id, 10, 9) +
      '<span class="card-top" aria-hidden="true"><b class="pts">' + (c.pts || '') + '</b><span class="bonus-label k' + c.color + '">' + GEMS[c.color].short + gem(c.color, 'gem bonus') + '</span></span>' +
      '<span class="gcost n' + n + '" aria-hidden="true">' + cost + '</span>' +
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
