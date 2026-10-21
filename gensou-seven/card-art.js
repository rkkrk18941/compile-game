/* ファンタジーレルムズ — the printed cards.
   cardSVG(d) draws one card at full size (the original artwork in a Japanese card frame); it is used for the big card
   view, the title screen and the cover image. The small readable cards on the table are plain HTML in app.js.
   artStyle(d) gives the CSS that crops a card's artwork for a thumbnail. */
(function (root, factory) {
  var api = factory(root.GS_ENGINE || (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GS_CARD_ART = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var serial = 0;
  var SUIT_INK = { land: '#64412c', flood: '#454d84', weather: '#6b91b2', flame: '#b64c30', army: '#44423f', wizard: '#b74f89', leader: '#77478d', beast: '#4e874a', weapon: '#727b83', artifact: '#b65336', wild: '#8b8170' };

  function lines(text, size, width) {
    var out = [], line = '', used = 0;
    (text.match(/[+＋−-]?\d+(?:[.,]\d+)*|[A-Za-z]+|[^\s]|\s+/gu) || []).forEach(function (ch) {
      var advance = Array.from(ch).reduce(function (n, c) { return n + size * (/^[\x20-\x7e]$/.test(c) ? 0.59 : 1); }, 0);
      if (line && used + advance > width && !/[、。，．）」』】]/.test(ch)) { out.push(line); line = ''; used = 0; }
      line += ch; used += advance;
    });
    if (line) out.push(line);
    return out;
  }
  function effectLayout(d) {
    var size = 22.5, groups, total;
    do {
      groups = [];
      [['b', 'ボーナス', '#31582b'], ['p', 'ペナルティ', '#8b2c24']].forEach(function (kind) {
        if (!(d[kind[0]] || []).length) return;
        var ls = [];
        d[kind[0]].forEach(function (t) { ls = ls.concat(lines(t, size, 286)); });
        groups.push({ label: kind[1], color: kind[2], lines: ls });
      });
      total = groups.reduce(function (n, g) { return n + 28 + g.lines.length * (size + 7); }, 0) + Math.max(0, groups.length - 1) * 14;
      if (total <= 238 || size <= 18) break;
      size -= 0.5;
    } while (true);
    return { size: size, groups: groups, height: total };
  }
  /* base: the folder that holds assets/ ('' inside the game, '../gensou-seven/' elsewhere) */
  function cardSVG(d, cls, base) {
    base = base || '';
    var id = 'frc-' + d.n + '-' + (++serial), layout = effectLayout(d);
    var suitColor = SUIT_INK[d.suit], y = 356 + (238 - layout.height) / 2, effects = '';
    layout.groups.forEach(function (g, gi) {
      effects += '<path d="M64 ' + (y + 8) + 'H126M276 ' + (y + 8) + 'H340" stroke="#baa16a" stroke-width="1"/>' +
        '<text x="202" y="' + (y + 15) + '" text-anchor="middle" font-size="18" font-weight="700" fill="' + g.color + '">' + g.label + '</text>';
      y += 28;
      g.lines.forEach(function (line) { effects += '<text x="58" y="' + (y + layout.size * 0.8) + '" font-size="' + layout.size + '" fill="#30271d">' + esc(line) + '</text>'; y += layout.size + 7; });
      if (gi + 1 < layout.groups.length) y += 14;
    });
    var sj = E.SUIT_JA[d.suit];
    var suit = Array.from(sj).map(function (ch, i, chars) { return '<text x="27" y="' + (215 - (chars.length - 1) * 12 + i * 25) + '" text-anchor="middle" font-size="20" fill="#f6ead0">' + ch + '</text>'; }).join('');
    var art = base + 'assets/cards/' + d.key + '.webp';
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="realm-card s-' + d.suit + ' ' + (cls || 'card-image') + '" viewBox="0 0 400 640" width="400" height="640" role="img" aria-label="' + esc(d.ja + '。' + (d.b || []).concat(d.p || []).join('')) + '" font-family="BIZ UDPGothic, sans-serif">' +
      '<title>' + esc(d.ja) + '</title><defs>' +
      '<linearGradient id="' + id + '-paper" x2="0.2" y2="1"><stop stop-color="#f3ecda"/><stop offset=".55" stop-color="#e9ddc1"/><stop offset="1" stop-color="#d9c7a1"/></linearGradient>' +
      '<linearGradient id="' + id + '-gold" x2="0.2" y2="1"><stop stop-color="#fff0ad"/><stop offset=".25" stop-color="#d7a23c"/><stop offset=".5" stop-color="#8e591b"/><stop offset=".74" stop-color="#e6b650"/><stop offset="1" stop-color="#9b641f"/></linearGradient>' +
      '<linearGradient id="' + id + '-red" x2="0" y2="1"><stop stop-color="#a74228"/><stop offset=".45" stop-color="#8c291b"/><stop offset="1" stop-color="#632015"/></linearGradient>' +
      '<radialGradient id="' + id + '-seal"><stop stop-color="' + suitColor + '"/><stop offset="1" stop-color="#241c16"/></radialGradient>' +
      '<clipPath id="' + id + '-art"><path d="M100 108H331V145Q331 157 348 157V323H52V140Q52 134 100 134Z"/></clipPath></defs>' +
      '<rect x="1" y="1" width="398" height="638" rx="14" fill="#362c20"/><rect x="5" y="5" width="390" height="630" rx="11" fill="url(#' + id + '-paper)"/>' +
      '<rect x="8" y="8" width="39" height="624" rx="8" fill="' + suitColor + '"/>' +
      '<path d="M48 13V625" stroke="#b89754" stroke-width="2"/>' + suit +
      '<image href="' + art + '" xlink:href="' + art + '" x="-7" y="0" width="428" height="619.5" preserveAspectRatio="none" clip-path="url(#' + id + '-art)"/>' +
      '<path d="M100 108H331V145Q331 157 348 157V323H52V140Q52 134 100 134Z" fill="none" stroke="#775220" stroke-width="5"/>' +
      '<path d="M100 108H331V145Q331 157 348 157V323H52V140Q52 134 100 134Z" fill="none" stroke="url(#' + id + '-gold)" stroke-width="2.5"/>' +
      '<path d="M91 43Q218 34 366 44Q375 46 373 58L368 108L377 137L349 127L354 103Q223 98 91 108Z" fill="#502116" stroke="#542319" stroke-width="1"/>' +
      '<path d="M85 42Q226 35 366 44L364 102Q227 96 85 106Z" fill="url(#' + id + '-red)" stroke="#9d5531" stroke-width="1"/>' +
      '<path d="M93 46Q228 40 359 48" fill="none" stroke="#c47a46" stroke-opacity=".5"/>' +
      '<text x="225" y="82" text-anchor="middle" fill="#fff2d7" font-family="Zen Antique, BIZ UDPGothic, serif" font-size="' + (d.ja.length > 7 ? 24 : 27) + '">' + esc(d.ja) + '</text>' +
      '<circle cx="49" cy="69" r="43" fill="#633d16"/><circle cx="49" cy="68" r="40" fill="url(#' + id + '-gold)" stroke="#e6bc61" stroke-width="2"/>' +
      '<circle cx="49" cy="68" r="32" fill="url(#' + id + '-seal)" stroke="#af7528" stroke-width="3"/>' +
      '<path d="M63 27C90 21 102 37 91 48C83 55 76 45 83 41M17 99C1 98 1 115 17 114" fill="none" stroke="url(#' + id + '-gold)" stroke-width="5" stroke-linecap="round"/>' +
      '<text x="49" y="83" text-anchor="middle" font-family="Georgia, serif" font-size="43" fill="#fff5df">' + d.str + '</text>' +
      '<rect x="34" y="334" width="338" height="284" rx="10" fill="#f1e9d5" stroke="#81551d" stroke-width="5"/>' +
      '<rect x="34" y="334" width="338" height="284" rx="10" fill="none" stroke="url(#' + id + '-gold)" stroke-width="3"/>' +
      '<rect x="39" y="339" width="328" height="274" rx="7" fill="none" stroke="#c3a567" stroke-width="1"/>' +
      ['34 334', '372 334', '34 618', '372 618'].map(function (pos, i) { return '<path d="M-8 11C-13 -1 -4 -13 7 -7C18 -1 9 11 3 5C0 2 4 -2 7 1" transform="translate(' + pos + ') scale(' + (i % 2 ? -1 : 1) + ' ' + (i > 1 ? -1 : 1) + ')" fill="none" stroke="url(#' + id + '-gold)" stroke-width="3.5" stroke-linecap="round"/>'; }).join('') + effects +
      '<path d="M170 627H193L200 622L207 627H230" fill="none" stroke="#a48442" stroke-width="1"/>' +
      '<text x="374" y="629" text-anchor="end" font-size="9" fill="#776342">' + d.n + '/53</text></svg>';
  }
  /* the artwork alone, cropped from each card (assets/art/<key>.webp) */
  function artStyle(d, base) { return "--art:url('" + (base || '') + 'assets/art/' + d.key + ".webp')"; }

  /* The title picture: a hand of seven cards held up, with gold threads above it linking the cards that score
     together. The hand is real: the Enchantress (+5 for each land) makes the Dragon safe, and the Cavern, Bell Tower,
     Magic Wand and Unicorn all score off the two of them (163 points). viewBox 1000 × 660. */
  var HERO = ['mountain', 'cavern', 'dragon', 'enchantress', 'unicorn', 'bellTower', 'magicWand'];
  var HERO_LINKS = [[3, 0, ''], [3, 1, ''], [3, 2, ''], [1, 2, '+25'], [3, 4, '+15'], [3, 5, '+15'], [3, 6, '+25']];
  function heroSVG(base, opts) {
    opts = opts || {};
    var W = 1000, H = 660, px = 500, py = 1290, R = 900, step = 7, cw = 210, ch = 336;
    var STAR_LIFT = [64, 104, 88, 190, 84, 104, 66];
    var stars = HERO.map(function (k, i) {
      var a = (i - 3) * step * Math.PI / 180, r = R + ch / 2 + STAR_LIFT[i];
      return { x: px + r * Math.sin(a), y: py - r * Math.cos(a) };
    });
    var s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="7枚の手札">' +
      '<defs><radialGradient id="heroGlow" cx="50%" cy="58%" r="52%"><stop offset="0" stop-color="#ffb35a" stop-opacity=".42"/><stop offset=".45" stop-color="#c2561f" stop-opacity=".18"/><stop offset="1" stop-color="#5a1d0b" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="heroThread" x1="0" x2="1"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".25"/><stop offset=".5" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffe7a8" stop-opacity=".25"/></linearGradient>' +
      '<filter id="heroBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '<filter id="heroShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".55"/></filter></defs>' +
      '<ellipse cx="500" cy="400" rx="520" ry="300" fill="url(#heroGlow)"/>';
    // threads between stars, bowing upward
    var threads = '', glows = '', labels = '';
    HERO_LINKS.forEach(function (l) {
      var a = stars[l[0]], b = stars[l[1]], mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 26 - Math.abs(a.x - b.x) * 0.06;
      var d = 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
      glows += '<path d="' + d + '" fill="none" stroke="#ffb347" stroke-width="7" stroke-opacity=".35" filter="url(#heroBlur)"/>';
      threads += '<path d="' + d + '" fill="none" stroke="#ffe2a0" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="' + (l[2] ? '0' : '2 7') + '"/>';
      if (l[2] && !opts.noLabels) {
        var lx, ly;
        if (l[0] === 3) { lx = b.x; ly = b.y - 34; } else { lx = mx; ly = (a.y + b.y) / 4 + my / 2 - 22; }
        labels += '<g transform="translate(' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')"><rect x="-28" y="-15" width="56" height="29" rx="14.5" fill="#2a160c" stroke="#e7b85e" stroke-width="1.6"/>' +
          '<text y="6" text-anchor="middle" font-family="Georgia, serif" font-size="18" font-weight="700" fill="#ffe2a0">' + l[2] + '</text></g>';
      }
    });
    s += '<g class="stars">' + glows + threads;
    stars.forEach(function (p, i) {
      var big = i === 3 ? 1.6 : 1;
      s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (14 * big) + '" fill="#ffcf73" fill-opacity=".28" filter="url(#heroBlur)"/>' +
        '<path transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') scale(' + big + ')" d="M0 -11L2.6 -2.6L11 0L2.6 2.6L0 11L-2.6 2.6L-11 0L-2.6 -2.6Z" fill="#fff4d2"/>';
    });
    s += labels + '</g><g class="fan" filter="url(#heroShadow)">';
    HERO.forEach(function (k, i) {
      var ang = (i - 3) * step;
      var d = E.BY_KEY[k];
      s += '<g style="transform-origin:' + px + 'px ' + py + 'px;transform:rotate(' + ang + 'deg);animation-delay:' + (Math.abs(i - 3) * 0.05) + 's"><g transform="translate(' + (px - cw / 2) + ' ' + (py - R - ch / 2) + ') scale(' + (cw / 400) + ')">' + cardSVG(d, 'hero-card', base) + '</g></g>';
    });
    s += '</g></svg>';
    return s;
  }

  return { cardSVG: cardSVG, artStyle: artStyle, heroSVG: heroSVG, HERO: HERO, SUIT_INK: SUIT_INK };
});
