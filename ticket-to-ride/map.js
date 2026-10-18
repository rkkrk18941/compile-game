/* チケット・トゥ・ライド — the board: North America, 36 cities, 78 city pairs (22 of them double) = 100 route
   lanes, 30 destination tickets. Plain script (window.TTR_MAP) shared by the page, the CPU worker and node tests.

   The routes and tickets are those of the original Ticket to Ride (Days of Wonder, 2004; the Japanese edition
   チケット・トゥ・ライド・アメリカ): lengths and colours checked against an independent data set, and 25 of the 30
   ticket values equal the fewest trains that join their cities (the other five are the printed values:
   LA–New York 21, LA–Miami 20, Seattle–New York 22, Sault St. Marie–Oklahoma City 9, LA–Chicago 16).
   City positions are real geography (Lambert conformal conic) nudged so every route's spaces come out about the
   same size; the drawing itself is original.

   Colours: 0 pink, 1 white, 2 blue, 3 yellow, 4 orange, 5 black, 6 red, 7 green; cards also have 8 = locomotive
   (SL, wild); a route of colour 9 is gray (any one colour). Board units: about one route space each; x east,
   y south. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TTR_MAP = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BOX = {"x0":-15.248,"x1":14.277,"y0":-11.12,"y1":9.975};
  // id, English, 日本語, x, y (board units, y = south), name label offset x, y, font size, label text
  var C = [
    ['VAN','Vancouver','バンクーバー',-11.146,-8.92,0,-0.524,0.4,'バンクーバー'],
    ['SEA','Seattle','シアトル',-11.212,-7.033,-1.044,-0.326,0.4,'シアトル'],
    ['POR','Portland','ポートランド',-12.848,-6.16,-0.515,-0.61,0.34,'ポートランド'],
    ['SFO','San Francisco','サンフランシスコ',-12.431,-0.922,1.447,0.318,0.34,'サンフランシスコ'],
    ['LAX','Los Angeles','ロサンゼルス',-11.274,2.711,-1.452,0,0.4,'ロサンゼルス'],
    ['LAS','Las Vegas','ラスベガス',-9.442,0.767,1.26,0,0.4,'ラスベガス'],
    ['SLC','Salt Lake City','ソルトレイクシティ',-7.355,-2.267,0.872,-0.572,0.34,'ソルトレイク\nシティ'],
    ['PHX','Phoenix','フェニックス',-7.944,1.897,-0.787,-0.392,0.34,'フェニックス'],
    ['ELP','El Paso','エルパソ',-5.425,4.479,0,0.764,0.4,'エルパソ'],
    ['SAF','Santa Fe','サンタフェ',-4.564,1.835,0.79,0.477,0.34,'サンタフェ'],
    ['DEN','Denver','デンバー',-3.865,-0.831,-0.957,0.318,0.34,'デンバー'],
    ['HEL','Helena','ヘレナ',-4.799,-4.982,-1.059,0.155,0.4,'ヘレナ'],
    ['CAL','Calgary','カルガリー',-7.472,-8.839,0,-0.524,0.4,'カルガリー'],
    ['WIN','Winnipeg','ウィニペグ',-1.239,-8.058,0,-0.524,0.4,'ウィニペグ'],
    ['DUL','Duluth','ダルース',1.458,-4.761,0.184,-0.699,0.34,'ダルース'],
    ['OMA','Omaha','オマハ',-0.244,-2.528,-1.03,0,0.34,'オマハ'],
    ['KAN','Kansas City','カンザスシティ',0.258,-0.521,0.957,-0.365,0.34,'カンザス\nシティ'],
    ['OKC','Oklahoma City','オクラホマシティ',-0.889,2.071,1.08,-0.365,0.34,'オクラホマ\nシティ'],
    ['DAL','Dallas','ダラス',-0.617,4.778,1.116,0,0.4,'ダラス'],
    ['HOU','Houston','ヒューストン',-0.004,6.661,0,0.644,0.4,'ヒューストン'],
    ['NOR','New Orleans','ニューオーリンズ',2.589,6.063,0,0.764,0.4,'ニューオーリンズ'],
    ['LRK','Little Rock','リトルロック',1.347,2.957,1.332,0.326,0.4,'リトルロック'],
    ['STL','Saint Louis','セントルイス',2.738,0.673,1.52,0,0.34,'セントルイス'],
    ['CHI','Chicago','シカゴ',3.813,-2.053,0.173,-0.699,0.34,'シカゴ'],
    ['SSM','Sault St. Marie','スーセントマリー',5.074,-6.007,0,-0.988,0.4,'スーセント\nマリー'],
    ['TOR','Toronto','トロント',7.32,-4.132,1.123,0.124,0.4,'トロント'],
    ['MON','Montreal','モントリオール',10.255,-6.341,0,-0.524,0.4,'モントリオール'],
    ['BOS','Boston','ボストン',11.877,-4.178,0.766,0.494,0.4,'ボストン'],
    ['NYC','New York','ニューヨーク',9.574,-2.762,1.597,0.155,0.4,'ニューヨーク'],
    ['PIT','Pittsburgh','ピッツバーグ',7.274,-1.337,0.908,-0.148,0.34,'ピッツバーグ'],
    ['WAS','Washington','ワシントン',9.718,-0.305,1.26,0,0.4,'ワシントン'],
    ['RAL','Raleigh','ローリー',7.818,1.263,1.238,0.155,0.4,'ローリー'],
    ['NAS','Nashville','ナッシュビル',4.9,2.249,-0.515,0.61,0.34,'ナッシュビル'],
    ['ATL','Atlanta','アトランタ',6.471,3.327,0.862,0.494,0.4,'アトランタ'],
    ['CHA','Charleston','チャールストン',9.172,3.368,1.765,0,0.4,'チャールストン'],
    ['MIA','Miami','マイアミ',9.1,7.775,0,0.524,0.4,'マイアミ']
  ];
  // city a, city b, spaces, colour (0-7, 9 = gray), lane of a double route (-1 = single), which side a bent route bulges to
  var R = [
    [0,12,3,9,-1,1],
    [0,1,1,9,0,1],
    [0,1,1,9,1,1],
    [1,12,4,9,-1,1],
    [1,11,6,3,-1,1],
    [1,2,1,9,0,1],
    [1,2,1,9,1,1],
    [2,3,5,7,0,1],
    [2,3,5,0,1,1],
    [2,6,6,2,-1,1],
    [3,6,5,4,0,1],
    [3,6,5,1,1,1],
    [3,4,3,3,0,1],
    [3,4,3,0,1,1],
    [4,5,2,9,-1,1],
    [4,7,3,9,-1,1],
    [4,8,6,5,-1,1],
    [5,6,3,4,-1,1],
    [12,11,4,9,-1,1],
    [12,13,6,1,-1,1],
    [11,13,4,2,-1,1],
    [11,14,6,4,-1,1],
    [11,15,5,6,-1,1],
    [11,10,4,7,-1,1],
    [11,6,3,0,-1,1],
    [6,10,3,6,0,1],
    [6,10,3,3,1,1],
    [7,10,5,1,-1,1],
    [7,9,3,9,-1,1],
    [7,8,3,9,-1,1],
    [8,9,2,9,-1,1],
    [8,17,5,3,-1,1],
    [8,18,4,6,-1,1],
    [8,19,6,7,-1,1],
    [9,10,2,9,-1,1],
    [9,17,3,2,-1,1],
    [10,15,4,0,-1,1],
    [10,16,4,5,0,1],
    [10,16,4,4,1,1],
    [10,17,4,6,-1,1],
    [13,14,4,5,-1,1],
    [13,24,6,9,-1,1],
    [14,24,3,9,-1,1],
    [14,25,6,0,-1,1],
    [14,23,3,6,-1,1],
    [14,15,2,9,0,1],
    [14,15,2,9,1,1],
    [15,23,4,2,-1,1],
    [15,16,1,9,0,1],
    [15,16,1,9,1,1],
    [16,22,2,2,0,1],
    [16,22,2,0,1,1],
    [16,17,2,9,0,1],
    [16,17,2,9,1,1],
    [17,18,2,9,0,1],
    [17,18,2,9,1,1],
    [17,21,2,9,-1,1],
    [18,21,2,9,-1,1],
    [18,19,1,9,0,1],
    [18,19,1,9,1,1],
    [19,20,2,9,-1,1],
    [21,22,2,9,-1,1],
    [21,32,3,1,-1,1],
    [21,20,3,7,-1,1],
    [20,33,4,3,0,1],
    [20,33,4,4,1,1],
    [20,35,6,6,-1,1],
    [22,23,2,7,0,1],
    [22,23,2,1,1,1],
    [22,32,2,9,-1,1],
    [22,29,5,7,-1,1],
    [23,29,3,4,0,1],
    [23,29,3,5,1,1],
    [23,25,4,1,-1,1],
    [24,25,2,9,-1,1],
    [24,26,5,5,-1,1],
    [25,26,3,9,-1,1],
    [25,29,2,9,-1,1],
    [26,27,2,9,0,1],
    [26,27,2,9,1,1],
    [26,28,3,2,-1,1],
    [27,28,2,3,0,1],
    [27,28,2,6,1,1],
    [28,29,2,1,0,1],
    [28,29,2,7,1,1],
    [28,30,2,4,0,1],
    [28,30,2,5,1,1],
    [29,30,2,9,-1,1],
    [29,31,2,9,-1,1],
    [29,32,4,3,-1,1],
    [30,31,2,9,0,1],
    [30,31,2,9,1,1],
    [31,32,3,5,-1,1],
    [31,33,2,9,0,1],
    [31,33,2,9,1,1],
    [31,34,2,9,-1,1],
    [32,33,1,9,-1,1],
    [33,34,2,9,-1,1],
    [33,35,5,2,-1,1],
    [34,35,4,0,-1,1]
  ];
  // city a, city b, points
  var T = [
    [4,28,21],
    [14,19,8],
    [24,32,8],
    [28,33,6],
    [2,32,17],
    [0,26,20],
    [14,8,10],
    [25,35,10],
    [2,7,11],
    [18,28,11],
    [12,6,7],
    [12,7,13],
    [4,35,20],
    [13,21,11],
    [3,33,17],
    [16,19,5],
    [4,23,16],
    [10,29,11],
    [23,9,9],
    [0,9,13],
    [27,35,12],
    [23,20,7],
    [26,33,9],
    [1,28,22],
    [10,8,4],
    [11,4,8],
    [13,19,12],
    [26,20,13],
    [24,17,9],
    [1,4,9]
  ];

  var COLOR_NAMES = ['ピンク', '白', '青', '黄', 'オレンジ', '黒', '赤', '緑', 'SL'];
  var GRAY = 9, LOCO = 8;
  var SCORE = [0, 1, 2, 4, 7, 10, 15];       // points for a route of 1-6 spaces

  var cities = C.map(function (c, i) {
    return { i: i, id: c[0], en: c[1], ja: c[2], x: c[3], y: c[4], label: { x: c[5], y: c[6], fs: c[7], text: c[8] } };
  });
  var routes = R.map(function (r, i) { return { i: i, a: r[0], b: r[1], len: r[2], col: r[3], lane: r[4], bend: r[5], twin: -1 }; });
  routes.forEach(function (r, i) {      // the two lanes of a double route are listed one after the other
    if (r.lane === 0) { r.twin = i + 1; routes[i + 1].twin = i; }
  });
  var tickets = T.map(function (t, i) { return { i: i, a: t[0], b: t[1], pts: t[2] }; });
  var byCity = cities.map(function () { return []; });
  routes.forEach(function (r) { byCity[r.a].push(r.i); byCity[r.b].push(r.i); });

  /* Where each space of each lane lies on the board. A route is straight, or a gentle quadratic curve when its
     cities are closer than its spaces need; spaces may shrink to 82% before a route bends. */
  function geometry(opt) {
    opt = opt || {};
    var RC = opt.rc || 0.36, GAP = opt.gap || 0.1, U = 1.0, LANE = opt.lane || 0.215, SQ = 0.82, N = 48;
    function bez(A, Cc, B, t) { var u = 1 - t; return [u * u * A[0] + 2 * u * t * Cc[0] + t * t * B[0], u * u * A[1] + 2 * u * t * Cc[1] + t * t * B[1]]; }
    function bezD(A, Cc, B, t) { var u = 1 - t; return [2 * u * (Cc[0] - A[0]) + 2 * t * (B[0] - Cc[0]), 2 * u * (Cc[1] - A[1]) + 2 * t * (B[1] - Cc[1])]; }
    function poly(A, Cc, B, off) {
      var pts = [];
      for (var i = 0; i <= N; i++) { var t = i / N, p = bez(A, Cc, B, t), d = bezD(A, Cc, B, t), l = Math.hypot(d[0], d[1]) || 1; pts.push([p[0] - d[1] / l * off, p[1] + d[0] / l * off]); }
      return pts;
    }
    function len(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
    function at(pts, s) {
      var acc = 0;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + l >= s || i === pts.length - 1) { var t = l ? Math.max(0, Math.min(1, (s - acc) / l)) : 0; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
        acc += l;
      }
    }
    function ctrl(A, B, h) { var dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1; return [(A[0] + B[0]) / 2 - dy / l * h, (A[1] + B[1]) / 2 + dx / l * h]; }
    var cache = {};
    return routes.map(function (r) {
      var A = [cities[r.a].x, cities[r.a].y], B = [cities[r.b].x, cities[r.b].y], key = r.a + '-' + r.b;
      var Cc = cache[key];
      if (!Cc) {
        var d = Math.hypot(B[0] - A[0], B[1] - A[1]), need = r.len * U * SQ - GAP + 2 * RC, h = 0;
        if (need > d) {
          var lo = 0, hi = d;
          for (var it = 0; it < 36; it++) { var mid = (lo + hi) / 2; if (len(poly(A, ctrl(A, B, mid), B, 0)) < need) lo = mid; else hi = mid; }
          h = (lo + hi) / 2;
        }
        Cc = cache[key] = ctrl(A, B, h * r.bend);
      }
      var pts = poly(A, Cc, B, r.lane < 0 ? 0 : r.lane === 0 ? -LANE : LANE), L = len(pts);
      var pitch = (L - 2 * RC) / r.len, sl = Math.min(pitch - GAP, U * 1.12), spaces = [];
      for (var i = 0; i < r.len; i++) { var p = at(pts, RC + pitch * (i + 0.5)); spaces.push({ x: p.x, y: p.y, ang: p.ang, len: sl }); }
      return { path: pts, spaces: spaces, mid: at(pts, L / 2) };
    });
  }

  return {
    BOX: BOX, COLOR_NAMES: COLOR_NAMES, GRAY: GRAY, LOCO: LOCO, SCORE: SCORE,
    cities: cities, routes: routes, tickets: tickets, byCity: byCity, geometry: geometry
  };
});
