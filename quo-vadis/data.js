/* クォ・ヴァディス — the board and the pieces.

   AMIGO 2005 board, transcribed from the rulebook's board diagram and checked against photographs:
   https://www.spiele4us.de/wp-content/uploads/2022/10/quo-vadis-gebraucht_g000800900.pdf (page 1)
   https://www.tk-game-diary.net/quo_vadis/1.JPG
   Four entrances (left to right): 1, 5, 1, 3 seats. Seven 1-seat, five 3-seat and two 5-seat committees.
   Seventeen directed connections, ten laurel spaces. C2 (5 seats) has the direct central path to the Senate.
   The former inferred board is intentionally not used; see RULES.md for the complete adjacency table.

   Board units: x to the right, z towards the entry edge (the side the players sit at), the Senate at negative z. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QV_DATA = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var SEAT_GAP = 0.86;       // centre-to-centre distance of two seats
  var PAD = 0.30;            // frame around the seats

  /* the committees: id, seats, centre, the row (0 = entry) and a short Japanese name used in the log */
  var COMMITTEES = [
    { id: 'A1', seats: 1, x: -5.45, z: 7.50, row: 0, name: '入口・左（1人）' },
    { id: 'A2', seats: 5, x: -1.95, z: 7.50, row: 0, name: '入口・中左（5人）' },
    { id: 'A3', seats: 1, x: 2.10, z: 7.50, row: 0, name: '入口・中右（1人）' },
    { id: 'A4', seats: 3, x: 5.05, z: 7.50, row: 0, name: '入口・右（3人）' },
    { id: 'B1', seats: 1, x: -5.45, z: 3.65, row: 1, name: '2段・左（1人）' },
    { id: 'B2', seats: 1, x: -1.95, z: 3.65, row: 1, name: '2段・中左（1人）' },
    { id: 'B3', seats: 3, x: 2.55, z: 3.65, row: 1, name: '2段・中右（3人）' },
    { id: 'B4', seats: 1, x: 5.45, z: 3.65, row: 1, name: '2段・右（1人）' },
    { id: 'C1', seats: 3, x: -4.55, z: 0.00, row: 2, name: '3段・左（3人）' },
    { id: 'C2', seats: 5, x: -0.10, z: -0.80, row: 2, name: '中央議会（5人）' },
    { id: 'C3', seats: 1, x: 5.45, z: -0.50, row: 2, name: '3段・右（1人）' },
    { id: 'D1', seats: 3, x: -4.85, z: -4.30, row: 3, name: '上段・左（3人）' },
    { id: 'D2', seats: 1, x: 2.65, z: -3.00, row: 3, name: '上段・中右（1人）' },
    { id: 'D3', seats: 3, x: 5.05, z: -4.90, row: 3, name: '上段・右（3人）' }
  ];
  var SENATE = { id: 'S', seats: 5, x: 0, z: -6.40, r: 3.05, seatR: 2.10, name: '元老院' };

  // Laurel coordinates lie ON their individual route, including both exits of A2, A4 and B3.
  var PATH_LIST = [
    ['A1', 'B1'],
    ['A2', 'C1', [-3.55, 2.05]], ['A2', 'B2', [-1.95, 5.55]],
    ['A3', 'B3'],
    ['A4', 'B3', [4.15, 5.55]], ['A4', 'B4', [5.60, 5.55]],
    ['B1', 'C1'], ['B2', 'C2'],
    ['B3', 'C2', [1.55, 1.55]], ['B3', 'D2', [2.90, 1.55]],
    ['B4', 'C3'],
    ['C1', 'D1', [-4.85, -2.00]], ['C2', 'S', [-0.10, -4.20]], ['C3', 'D3'],
    ['D1', 'S', [-2.85, -5.90]], ['D2', 'D3'], ['D3', 'S', [2.85, -5.90]]
  ];
  var SENATE_DOOR = { D1: -2.35, C2: 0, D3: 2.35 };

  /* laurel tiles: the "I" tiles lie open beside the board (rewards for consent); II to V are shuffled face down */
  var ONES = 18;
  var TILE_SET = [{ v: 2, n: 8 }, { v: 2, c: true, n: 6 }, { v: 3, n: 15 }, { v: 4, n: 9 }, { v: 5, n: 6 }];
  var ONE_LIMIT = { 3: 10, 4: 14, 5: 18 };      // variant: fewer "I" tiles with fewer players
  var SENATORS = 8;                              // per player

  var PLAYER_COLORS = [
    { key: 'red', name: '赤', hex: '#c33a2c', dark: '#7c1d14' },
    { key: 'blue', name: '青', hex: '#2f63b8', dark: '#173a75' },
    { key: 'yellow', name: '黄', hex: '#e7b531', dark: '#94690b' },
    { key: 'black', name: '黒', hex: '#2d2a2b', dark: '#0f0e0e' },
    { key: 'white', name: '白', hex: '#efe9dc', dark: '#a39a86' }
  ];

  /* ------------------------------------------------------------------ derived geometry */
  var COM = {};
  COMMITTEES.forEach(function (c) {
    c.entry = c.row === 0;
    c.cols = c.seats === 1 ? 1 : 3;
    c.w = c.cols * SEAT_GAP + 2 * PAD;
    c.d = (c.seats === 5 ? 2 : 1) * SEAT_GAP + 2 * PAD;
    var s = [];
    if (c.seats === 1) s.push([0, 0]);
    else if (c.seats === 3) s.push([-SEAT_GAP, 0], [0, 0], [SEAT_GAP, 0]);
    else s.push([-SEAT_GAP, -SEAT_GAP / 2], [0, -SEAT_GAP / 2], [SEAT_GAP, -SEAT_GAP / 2], [-SEAT_GAP / 2, SEAT_GAP / 2], [SEAT_GAP / 2, SEAT_GAP / 2]);
    c.seatXZ = s.map(function (o) { return [c.x + o[0], c.z + o[1]]; });
    COM[c.id] = c;
  });
  /* Senate seats on an arc, filled from the left */
  SENATE.seatXZ = [];
  for (var i = 0; i < 5; i++) {
    var a = Math.PI * (1.12 + 0.19 * i);
    SENATE.seatXZ.push([SENATE.x + SENATE.seatR * Math.cos(a), SENATE.z + SENATE.seatR * Math.sin(a)]);
  }
  COM.S = SENATE;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var PATHS = [], PATH = {}, OUT = {}, IN = {};
  PATH_LIST.forEach(function (pr, k) {
    var f = COM[pr[0]], t = COM[pr[1]];
    var id = pr[0] + '-' + pr[1];
    var siblings = PATH_LIST.filter(function (q) { return q[0] === pr[0]; });
    var exitOff = siblings.length > 1 ? (siblings.indexOf(pr) === 0 ? -1 : 1) * Math.min(0.32, f.w / 2 - 0.3) : 0;
    var ex = [f.x + exitOff, f.z - f.d / 2];
    var laurel = f.seats > 1;
    var at = pr[2] || null;
    var en;
    if (t.id === 'S') en = [SENATE.x + SENATE_DOOR[f.id], SENATE.z];
    else en = [clamp(f.x, t.x - t.w / 2 + 0.42, t.x + t.w / 2 - 0.42), t.z + t.d / 2];
    // Orthogonal corridors, as on the printed board; a long route may bypass a row, never a committee.
    var pts;
    if (at) pts = [ex, [at[0], ex[1]], at, [at[0], en[1]], en];
    else pts = [ex, [ex[0], (ex[1] + en[1]) / 2], [en[0], (ex[1] + en[1]) / 2], en];
    var p = { id: id, k: k, from: f.id, to: t.id, laurel: laurel, at: at, pts: pts };
    PATHS.push(p); PATH[id] = p;
    (OUT[f.id] = OUT[f.id] || []).push(p);
    (IN[t.id] = IN[t.id] || []).push(p);
  });
  var LAUREL_PATHS = PATHS.filter(function (p) { return p.laurel; }).map(function (p) { return p.id; });
  var CAESAR_START = 'C2-S';

  /* fewest moves from each committee to the Senate */
  var DIST = { S: 0 };
  for (var guard = 0; guard < 10; guard++) {
    COMMITTEES.forEach(function (c) {
      (OUT[c.id] || []).forEach(function (p) {
        if (DIST[p.to] !== undefined && (DIST[c.id] === undefined || DIST[p.to] + 1 < DIST[c.id])) DIST[c.id] = DIST[p.to] + 1;
      });
    });
  }

  /* storage spaces beside the Senate: "I" tiles on the left, the face-down supply on the right */
  var STORE = { ones: [-5.45, -8.55], bag: [5.45, -8.55] };
  var BOARD = { w: 14.2, d: 21.4, x0: -7.1, z0: -10.7 };

  return {
    BOARD_VERSION: 'amigo-2005', COMMITTEES: COMMITTEES, COM: COM, SENATE: SENATE, PATHS: PATHS, PATH: PATH, OUT: OUT, IN: IN,
    LAUREL_PATHS: LAUREL_PATHS, CAESAR_START: CAESAR_START, DIST: DIST, ENTRY: COMMITTEES.filter(function (c) { return c.entry; }).map(function (c) { return c.id; }),
    ONES: ONES, TILE_SET: TILE_SET, ONE_LIMIT: ONE_LIMIT, SENATORS: SENATORS, PLAYER_COLORS: PLAYER_COLORS,
    STORE: STORE, BOARD: BOARD, SEAT_GAP: SEAT_GAP
  };
});
