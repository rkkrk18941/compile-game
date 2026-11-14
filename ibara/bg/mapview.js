/* スレイザスパイア — the act map (moved from ui.js and extended, next-level update 2026-11-13).
   The route walked so far is a solid line, "you are here" is marked with the hero, the rooms that can be entered
   pulse, and the Boss of the act waits at the top with its name. Choosing a room walks the marker there (0.4 s)
   before the choice is sent. The map keeps the colours of its act (I torchlight, II cold, III violet, IV red). */
(function (root) {
'use strict';
var STS = root.STS, V = STS.View, D = STS.DATA, esc = V.esc;

V.ROOM_GLYPH = {
  M: '<path d="M-7 4c0-7 3-11 7-11s7 4 7 11zM-4 -2a1.5 1.5 0 1 0 .1 0M4 -2a1.5 1.5 0 1 0 .1 0" fill="#2a1d12"/><path d="M-5 4l2 3 2-3 2 3 2-3" stroke="#2a1d12" stroke-width="1.5" fill="none"/>',
  E: '<path d="M-8 6l2-10 4 5 2-8 2 8 4-5 2 10z" fill="#7a1d12"/>',
  'É': '<path d="M-8 6l2-10 4 5 2-8 2 8 4-5 2 10z" fill="#e05a12"/><path d="M0 -10c3 3 4 6 0 9-4-3-3-6 0-9z" fill="#ffd040"/>',
  '?': '<text x="0" y="6" text-anchor="middle" font-size="17" font-weight="900" fill="#2a1d12" font-family="serif">?</text>',
  '$': '<path d="M-6 -2h12l2 9h-16z" fill="#6a4a1a"/><path d="M-3 -2a3 4 0 0 1 6 0" stroke="#6a4a1a" stroke-width="2" fill="none"/><text x="0" y="6" text-anchor="middle" font-size="8" fill="#ffd77a" font-weight="900">$</text>',
  R: '<path d="M0 -9c4 4 6 8 2 12 1-4-1-5-2-6-1 2-4 3-3 6-4-4 0-8 3-12z" fill="#d05a12"/><path d="M-8 7l16-4M-8 3l16 4" stroke="#4a3018" stroke-width="2"/>',
  T: '<rect x="-8" y="-4" width="16" height="10" rx="1.5" fill="#8a5a1a"/><rect x="-8" y="-7" width="16" height="5" rx="2" fill="#a8772a"/><rect x="-1.5" y="-3" width="3" height="4" fill="#ffd77a"/>',
  B: '<circle r="9" fill="#5a1210"/><path d="M-5 -2a1.5 1.5 0 1 0 .1 0M5 -2a1.5 1.5 0 1 0 .1 0M-4 4h8" stroke="#ffd0c0" stroke-width="2"/>',
  X: '<circle r="4" fill="#7a6a50"/>'
};

function bossImg(id) {
  var m = STS.MONSTERS && STS.MONSTERS[id];
  var art = m && m.art;
  return art && V.ENEMY_IMG && V.ENEMY_IMG[art] ? 'img/enemies/' + art + '.webp?v=' + V.ASSET : null;
}
function bossName(id) { return id ? ((STS.ENCOUNTERS['Boss:' + id] || {}).name || '') : ''; }

/* o: { party: bool (several players vote), ch: the viewer's character, me: viewer index } */
V.mapHTML = function (run, cur, o) {
  o = o || {};
  var m = run.map;
  if (!m) return '';
  var opts = cur && cur.q.type === 'map' ? cur.q.options.concat(cur.q.wing || []) : [];
  var cols = 7, W = Math.min(root.innerWidth || 390, 560), cw = W / cols, rh = 58, top = m.act === 4 ? 26 : 104, H = m.rows * rh + 40 + top;
  function xy(k) { var n = m.nodes[k]; return [cw * (n.c + 0.5), H - 30 - n.r * rh]; }
  var svg = '<svg class="mapsvg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" data-cw="' + cw + '" data-rh="' + rh + '" data-h="' + H + '">';
  svg += '<defs><clipPath id="mapYouClip"><circle r="13"/></clipPath><clipPath id="mapBossClip"><circle r="26"/></clipPath><radialGradient id="mapBossGlow"><stop offset="0" stop-color="#ff5a3a" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a3a" stop-opacity="0"/></radialGradient></defs>';
  Object.keys(m.edges).forEach(function (k) {
    m.edges[k].forEach(function (k2) {
      if (!m.nodes[k2]) return;
      var a = xy(k), b = xy(k2), open = m.pos === k && opts.indexOf(k2) >= 0;
      svg += '<line class="mapedge' + (open ? ' open' : '') + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + (open ? '#8a2a14' : '#5a4630') + '" stroke-width="' + (open ? 2.6 : 2) + '" stroke-dasharray="4 5"/>';
    });
  });
  // the route actually walked, in order (Wing Boots and the portal included)
  var route = m.visited.filter(function (k) { return m.nodes[k]; }).map(xy);
  if (route.length > 1) {
    var pts = route.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    svg += '<polyline class="maproute-under" points="' + pts + '" fill="none" stroke="#f4e6c4" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<polyline class="maproute" points="' + pts + '" fill="none" stroke="#7a2a12" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  var bossKey = null;
  Object.keys(m.nodes).forEach(function (k) {
    var n = m.nodes[k], p = xy(k);
    if (n.t === 'B') bossKey = k;
    var reach = opts.indexOf(k) >= 0, curN = m.pos === k, done = m.visited.indexOf(k) >= 0;
    var r = n.t === 'B' ? 20 : 15;
    svg += '<g class="mapnode' + (reach ? ' reach' : '') + (curN ? ' cur' : '') + (done ? ' done' : '') + (n.t === 'B' ? ' boss' : '') + '" data-k="' + k + '" transform="translate(' + p[0] + ',' + p[1] + ')"' + (reach && cur ? ' data-a="node" data-v="' + k + '"' : n.t === 'B' && run.boss ? ' data-a="bossinfo"' : ' data-a="nodeinfo" data-v="' + k + '"') + '>' +
      (reach ? '<circle class="halo" r="' + (r + 7) + '"/>' : '') +
      '<circle class="bgc" r="' + r + '" fill="rgba(240,226,196,.9)"/><circle class="ring" r="' + r + '"/><g transform="scale(' + (n.t === 'B' ? 1.6 : 1.05) + ')">' + (V.ROOM_GLYPH[n.t] || '') + '</g></g>';
  });
  // the Boss waits at the top: its picture and its name
  if (bossKey && m.act !== 4 && run.boss) {
    var bp = xy(bossKey), img = bossImg(run.boss), name = bossName(run.boss) + (run.boss2 ? '・' + bossName(run.boss2) : '');
    var by = bp[1] - 66;
    svg += '<g class="mapboss" data-a="bossinfo" transform="translate(' + (W / 2).toFixed(1) + ',' + by.toFixed(1) + ')">' +
      '<circle r="44" fill="url(#mapBossGlow)"/><circle r="27.5" fill="#1a0a08" stroke="#8a1a10" stroke-width="2.5"/>' + (img ? '<image href="' + esc(img) + '" x="-26" y="-26" width="52" height="52" clip-path="url(#mapBossClip)" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '<text y="44" text-anchor="middle" class="mapboss-name">' + esc(name) + '</text></g>';
  }
  // "you are here": the hero's face over the current room
  if (m.pos && m.nodes[m.pos] && o.ch) {
    var cp = xy(m.pos);
    svg += '<g class="mapyou" data-key="mapyou" transform="translate(' + cp[0].toFixed(1) + ',' + (cp[1] - 24).toFixed(1) + ')"><path d="M0 22 L-7 9 L7 9 Z" fill="#f2c45a" stroke="#2a1d12" stroke-width="1.2"/>' +
      '<circle r="15" fill="#2a1d12" stroke="#f2c45a" stroke-width="2.5"/><image href="' + esc(V.heroImg(o.ch)) + '" x="-13" y="-13" width="26" height="26" clip-path="url(#mapYouClip)" preserveAspectRatio="xMidYMin slice"/></g>';
  }
  svg += '</svg>';
  var title = cur && cur.q.type === 'map' ? (cur.q.portal ? '秘密のポータル：上の好きな部屋へ' : (o.party ? '次の部屋に投票してください' : '次の部屋を選んでください')) : '第' + run.act + '幕のマップ';
  var boss = bossName(run.boss);
  return '<div class="mapview act-' + (run.act || 1) + '" data-keep="map"><div class="mapbanner">' + esc(title) + (boss ? '<button type="button" class="map-boss" data-a="bossinfo">ボス：' + esc(boss) + (run.boss2 ? '・' + esc(bossName(run.boss2)) : '') + '<span>能力を見る</span></button>' : '') + '</div>' + svg + V.mapLegendHTML(m) + '</div>';
};
/* The legend uses the same symbols as the map; the burning elite is listed only when it is on this map. */
V.mapLegendHTML = function (m) {
  var present = {};
  Object.keys(m.nodes).forEach(function (k) { present[m.nodes[k].t] = true; });
  return '<div class="maplegend" aria-label="記号の意味">' + ['M', 'E', 'É', '?', '$', 'R', 'T'].filter(function (t) { return t !== 'É' || present[t]; }).map(function (t) {
    return '<span><svg viewBox="-11 -11 22 22" aria-hidden="true"><circle r="10.2" fill="rgba(240,226,196,.95)" stroke="#5a4630" stroke-width="1"/><g transform="scale(.86)">' + V.ROOM_GLYPH[t] + '</g></svg>' + esc((D.ROOM[t] || {}).name || t) + '</span>';
  }).join('') + '</div>';
};
/* Walk the marker to the chosen room, then call done (0.4 s; at once without animation). */
V.mapWalk = function (key, ms, done) {
  var svg = document.querySelector('#app .mapview .mapsvg'), you = svg && svg.querySelector('.mapyou'), to = svg && svg.querySelector('.mapnode[data-k="' + key + '"]');
  if (!svg || !to || !ms || !to.animate) { done(); return; }
  var t = /translate\(([-\d.]+),([-\d.]+)\)/.exec(to.getAttribute('transform') || '');
  if (!t) { done(); return; }
  var tx = +t[1], ty = +t[2] - 24, finished = false;
  function finish() { if (finished) return; finished = true; done(); }
  to.classList.add('chosen');
  if (you) {
    var f = /translate\(([-\d.]+),([-\d.]+)\)/.exec(you.getAttribute('transform') || '');
    var fx = f ? +f[1] : tx, fy = f ? +f[2] : ty + 40;
    var a = you.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(' + ((tx - fx) * 0.5).toFixed(1) + 'px,' + ((ty - fy) * 0.5 - 8).toFixed(1) + 'px)', offset: 0.5 }, { transform: 'translate(' + (tx - fx).toFixed(1) + 'px,' + (ty - fy).toFixed(1) + 'px)' }], { duration: ms, easing: 'ease-in-out', fill: 'forwards', composite: 'add' });
    if (a) a.onfinish = finish;
  }
  setTimeout(finish, ms + 40);
};
})(typeof window !== 'undefined' ? window : globalThis);
