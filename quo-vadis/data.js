/* クォ・ヴァディス — the board and the pieces.

   What the rulebook (Hans im Glück 1992 / AMIGO 2005) and the published descriptions fix:
     - 14 committees ("Gremien") with 1, 3 or 5 seats, plus the Senate (5 seats) at the far end.
     - The four lowest committees, where new senators enter: two 1-seat, one 3-seat, one 5-seat.
     - Every committee leads up to one or two higher committees; three paths lead into the Senate.
     - 10 laurel spaces, on the paths that leave 3- and 5-seat committees; paths out of 1-seat committees have none.
     - Directly beneath the Senate is a 5-seat committee; Caesar starts on the laurel just above it.
   How the middle rows are wired could not be read off a photo of the board, so it is rebuilt from those facts
   (one exit with one laurel above every 3- and 5-seat committee). Everything here is data: if the real board differs,
   only this file has to change.

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
    { id: 'A1', seats: 1, x: -5.55, z: 7.50, row: 0, name: '入口・左（1人）' },
    { id: 'A2', seats: 5, x: -2.30, z: 7.50, row: 0, name: '入口・中左（5人）' },
    { id: 'A3', seats: 3, x: 1.70, z: 7.50, row: 0, name: '入口・中右（3人）' },
    { id: 'A4', seats: 1, x: 5.45, z: 7.50, row: 0, name: '入口・右（1人）' },
    { id: 'B1', seats: 1, x: -5.55, z: 3.80, row: 1, name: '2段・左（1人）' },
    { id: 'B2', seats: 3, x: -2.40, z: 3.80, row: 1, name: '2段・中左（3人）' },
    { id: 'B3', seats: 5, x: 1.15, z: 3.80, row: 1, name: '2段・中右（5人）' },
    { id: 'B4', seats: 3, x: 4.75, z: 3.80, row: 1, name: '2段・右（3人）' },
    { id: 'C1', seats: 3, x: -3.70, z: 0.30, row: 2, name: '3段・左（3人）' },
    { id: 'C2', seats: 3, x: 0.30, z: 0.30, row: 2, name: '3段・中央（3人）' },
    { id: 'C3', seats: 1, x: 4.30, z: 0.30, row: 2, name: '3段・右（1人）' },
    { id: 'D1', seats: 3, x: -4.30, z: -3.20, row: 3, name: '4段・左（3人）' },
    { id: 'D2', seats: 5, x: 0.00, z: -3.20, row: 3, name: '4段・中央（5人）' },
    { id: 'D3', seats: 3, x: 4.30, z: -3.20, row: 3, name: '4段・右（3人）' }
  ];
  var SENATE = { id: 'S', seats: 5, x: 0, z: -6.40, r: 3.55, seatR: 2.35, name: '元老院' };

  /* the paths, from a lower committee to a higher one */
  var PATH_LIST = [
    ['A1', 'B1'], ['A1', 'B2'], ['A2', 'B2'], ['A3', 'B3'], ['A4', 'B3'], ['A4', 'B4'],
    ['B1', 'C1'], ['B2', 'C1'], ['B3', 'C2'], ['B4', 'C3'],
    ['C1', 'D1'], ['C2', 'D2'], ['C3', 'D2'], ['C3', 'D3'],
    ['D1', 'S'], ['D2', 'S'], ['D3', 'S']
  ];
  /* where the three paths meet the front of the Senate */
  var SENATE_DOOR = { D1: -2.35, D2: 0, D3: 2.35 };

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
    var lz = ex[1] - 0.66;
    var en;
    if (t.id === 'S') en = [SENATE.x + SENATE_DOOR[f.id], SENATE.z];
    else en = [clamp(f.x, t.x - t.w / 2 + 0.42, t.x + t.w / 2 - 0.42), t.z + t.d / 2];
    var pts = laurel ? [ex, [ex[0], lz], en] : [ex, en];
    var p = { id: id, k: k, from: f.id, to: t.id, laurel: laurel, at: laurel ? [ex[0], lz] : null, pts: pts };
    PATHS.push(p); PATH[id] = p;
    (OUT[f.id] = OUT[f.id] || []).push(p);
    (IN[t.id] = IN[t.id] || []).push(p);
  });
  var LAUREL_PATHS = PATHS.filter(function (p) { return p.laurel; }).map(function (p) { return p.id; });
  var CAESAR_START = 'D2-S';

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
    COMMITTEES: COMMITTEES, COM: COM, SENATE: SENATE, PATHS: PATHS, PATH: PATH, OUT: OUT, IN: IN,
    LAUREL_PATHS: LAUREL_PATHS, CAESAR_START: CAESAR_START, DIST: DIST, ENTRY: COMMITTEES.filter(function (c) { return c.entry; }).map(function (c) { return c.id; }),
    ONES: ONES, TILE_SET: TILE_SET, ONE_LIMIT: ONE_LIMIT, SENATORS: SENATORS, PLAYER_COLORS: PLAYER_COLORS,
    STORE: STORE, BOARD: BOARD, SEAT_GAP: SEAT_GAP
  };
});
