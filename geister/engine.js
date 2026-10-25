/* ガイスター — the rules (window.GST_ENG in a page or worker, module.exports in node). No DOM, no clock.

   The board is 6×6, squares 0..35 = row × 6 + col, row 0 at the top. Player 0 sits at the bottom (home rows 4–5),
   player 1 at the top (home rows 0–1). Each player has 8 ghosts — ids 0–7 belong to player 0, 8–15 to player 1 —
   four good (blue) and four bad (red). Only the owner sees which is which.

   Setting up: each player fills the 8 squares of their two home rows, columns 1–4 (the corner columns stay empty).
   A layout lists the colour for each slot as seen from the player's own seat: front row left → right (slots 0–3),
   back row left → right (slots 4–7); 1 = good, 0 = bad. Ghost id = player × 8 + slot, so an id says where a ghost
   started and never what colour it is.

   A turn: move one of your ghosts one square up, down, left or right, onto an empty square or onto an opponent's
   ghost to capture it (its colour is then shown to both). A good ghost standing on one of the two corner squares on
   the opponent's side may use its move to leave the board through that exit (action t = EXIT).

   You win when one of your good ghosts leaves the board, when you have captured all four of the opponent's good
   ghosts, or when the opponent has captured all four of your bad ghosts. This version adds one rule of its own:
   after LIMIT moves in all without a winner, the game is drawn.

   Reasons, from the winner's side: 'escape', 'good' (took all four good), 'bad' (all four of the winner's bad ghosts
   were taken), 'resign', 'left' (online: the other player went away); a draw is winner -1 with reason 'limit'. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GST_ENG = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var N = 6, CELLS = 36, EXIT = -1, LIMIT = 300, GHOSTS = 8;

  function rowOf(q) { return (q / N) | 0; }
  function colOf(q) { return q % N; }
  function sq(r, c) { return r * N + c; }
  function dist(a, b) { return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b)); }
  function flip(q) { return CELLS - 1 - q; }                 // the same square seen from the other seat

  /* the 8 home squares, in slot order as the player sees them */
  function slotSquare(p, k) {
    var q = k < 4 ? sq(4, 1 + k) : sq(5, 1 + (k - 4));
    return p === 0 ? q : flip(q);
  }
  function homeSquares(p) { var a = []; for (var k = 0; k < GHOSTS; k++) a.push(slotSquare(p, k)); return a; }
  /* where p's good ghosts leave: the two corners on the far side */
  var EXITS = [[sq(0, 0), sq(0, 5)], [sq(5, 0), sq(5, 5)]];
  function exitsOf(p) { return EXITS[p]; }
  function isExitOf(p, q) { return q === EXITS[p][0] || q === EXITS[p][1]; }
  function owner(id) { return id < GHOSTS ? 0 : 1; }

  var NB = [];
  for (var q0 = 0; q0 < CELLS; q0++) {
    var r0 = rowOf(q0), c0 = colOf(q0), nb = [];
    if (r0 > 0) nb.push(q0 - N);
    if (r0 < N - 1) nb.push(q0 + N);
    if (c0 > 0) nb.push(q0 - 1);
    if (c0 < N - 1) nb.push(q0 + 1);
    NB.push(nb);
  }
  function neighbours(q) { return NB[q]; }

  function mulberry32(a) {
    a = (a >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function randomLayout(rng) { return shuffle([1, 1, 1, 1, 0, 0, 0, 0], rng || Math.random); }
  function validLayout(l) {
    if (!Array.isArray(l) || l.length !== GHOSTS) return false;
    var good = 0;
    for (var i = 0; i < GHOSTS; i++) { if (l[i] !== 0 && l[i] !== 1) return false; good += l[i]; }
    return good === 4;
  }

  /* ---------------------------------------------------------------- a new game */
  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? (Math.random() * 4294967296) >>> 0 : opts.seed >>> 0;
    var first = opts.first === 0 || opts.first === 1 ? opts.first : (mulberry32(seed ^ 0x9e3779b9)() < 0.5 ? 0 : 1);
    var g = [];
    for (var id = 0; id < 2 * GHOSTS; id++) g.push({ o: owner(id), good: null, at: -1, st: 'wait' });
    var board = []; for (var i = 0; i < CELLS; i++) board.push(-1);
    return { v: 1, seed: seed, phase: 'setup', first: first, turn: first, ply: 0, limit: opts.limit || LIMIT,
      g: g, board: board, ready: [false, false], log: [], winner: null, reason: null };
  }

  function setup(s, p, layout) {
    if (s.phase !== 'setup') return { ok: false, err: 'phase' };
    if (p !== 0 && p !== 1) return { ok: false, err: 'player' };
    if (s.ready[p]) return { ok: false, err: 'ready' };
    if (!validLayout(layout)) return { ok: false, err: 'layout' };
    for (var k = 0; k < GHOSTS; k++) {
      var id = p * GHOSTS + k, q = slotSquare(p, k), x = s.g[id];
      x.good = layout[k] === 1; x.at = q; x.st = 'on';
      s.board[q] = id;
    }
    s.ready[p] = true;
    if (s.ready[0] && s.ready[1]) { s.phase = 'play'; s.turn = s.first; }
    return { ok: true };
  }

  /* ---------------------------------------------------------------- moves */
  function legal(s, p) {
    var out = [];
    if (s.phase !== 'play' || s.turn !== p) return out;
    for (var k = 0; k < GHOSTS; k++) {
      var id = p * GHOSTS + k, x = s.g[id];
      if (x.st !== 'on') continue;
      var nb = NB[x.at];
      for (var j = 0; j < nb.length; j++) {
        var t = nb[j], o = s.board[t];
        if (o < 0 || s.g[o].o !== p) out.push({ f: x.at, t: t });
      }
      if (x.good && isExitOf(p, x.at)) out.push({ f: x.at, t: EXIT });
    }
    return out;
  }
  /* the moves of one ghost, as its owner sees them (the owner knows its colour) */
  function movesFrom(s, q) {
    var id = s.board[q];
    if (id < 0) return [];
    var p = s.g[id].o;
    return legal(s, p).filter(function (a) { return a.f === q; });
  }

  function countLeft(s, p, good) {
    var n = 0;
    for (var k = 0; k < GHOSTS; k++) { var x = s.g[p * GHOSTS + k]; if (x.st === 'on' && x.good === good) n++; }
    return n;
  }

  function apply(s, p, a) {
    if (s.phase !== 'play') return { ok: false, err: 'phase' };
    if (s.turn !== p) return { ok: false, err: 'turn' };
    if (!a || typeof a.f !== 'number' || typeof a.t !== 'number') return { ok: false, err: 'action' };
    var f = a.f | 0, t = a.t | 0;
    if (f < 0 || f >= CELLS) return { ok: false, err: 'from' };
    var id = s.board[f];
    if (id < 0 || s.g[id].o !== p) return { ok: false, err: 'from' };
    var x = s.g[id];
    var ev = { p: p, id: id, f: f, t: t, cap: -1, capGood: null, esc: false, ply: s.ply + 1, winner: null, reason: null };
    if (t === EXIT) {
      if (!isExitOf(p, f)) return { ok: false, err: 'exit' };
      if (!x.good) return { ok: false, err: 'bad-exit' };
      s.board[f] = -1; x.at = -1; x.st = 'esc';
      ev.esc = true;
    } else {
      if (t < 0 || t >= CELLS || NB[f].indexOf(t) < 0) return { ok: false, err: 'to' };
      var o = s.board[t];
      if (o >= 0) {
        if (s.g[o].o === p) return { ok: false, err: 'own' };
        var y = s.g[o];
        y.st = 'cap'; y.at = -1; y.by = p;
        ev.cap = o; ev.capGood = y.good;
      }
      s.board[f] = -1; s.board[t] = id; x.at = t;
    }
    s.ply++;
    s.log.push({ p: p, id: id, f: f, t: t, cap: ev.cap, capGood: ev.capGood, esc: ev.esc });
    var q = 1 - p;
    if (ev.esc) end(s, p, 'escape');
    else if (ev.cap >= 0) {
      if (ev.capGood && countLeft(s, q, true) === 0) end(s, p, 'good');
      else if (!ev.capGood && countLeft(s, q, false) === 0) end(s, q, 'bad');
    }
    if (s.phase === 'play' && s.ply >= s.limit) end(s, -1, 'limit');
    if (s.phase === 'play') {
      s.turn = q;
      if (!legal(s, q).length) s.turn = p;       // cannot happen on a 6×6 board, but never leave a player stuck
    }
    ev.winner = s.winner; ev.reason = s.reason;
    return { ok: true, ev: ev };
  }
  function end(s, winner, reason) { s.phase = 'over'; s.winner = winner; s.reason = reason; }
  function resign(s, p, reason) {
    if (s.phase === 'over') return { ok: false, err: 'phase' };
    end(s, 1 - p, reason || 'resign');
    return { ok: true, ev: { p: p, resign: true, winner: s.winner, reason: s.reason } };
  }

  /* ---------------------------------------------------------------- what one player may see */
  function viewFor(s, p) {
    var over = s.phase === 'over';
    return {
      v: s.v, phase: s.phase, first: s.first, turn: s.turn, ply: s.ply, limit: s.limit, me: p,
      ready: s.ready.slice(), winner: s.winner, reason: s.reason, board: s.board.slice(),
      g: s.g.map(function (x) {
        var show = over || x.o === p || x.st === 'cap' || x.st === 'esc';
        return { o: x.o, at: x.at, st: x.st, good: show ? x.good : null };
      }),
      log: s.log.map(function (m) { return { p: m.p, id: m.id, f: m.f, t: m.t, cap: m.cap, capGood: m.capGood, esc: m.esc }; })
    };
  }
  /* an event is public as it is (it only names colours that were just shown), but keep the shape fixed */
  function evFor(ev) {
    if (!ev) return null;
    return { p: ev.p, id: ev.id, f: ev.f, t: ev.t, cap: ev.cap, capGood: ev.capGood, esc: ev.esc, ply: ev.ply, winner: ev.winner, reason: ev.reason, resign: !!ev.resign };
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  /* counts a player can be sure of: ghosts still on the board by colour (the colours of captured ghosts are public) */
  function tally(v, p) {
    var t = { onBoard: 0, good: 0, bad: 0, lostGood: 0, lostBad: 0 };
    for (var k = 0; k < GHOSTS; k++) {
      var x = v.g[p * GHOSTS + k];
      if (x.st === 'on') t.onBoard++;
      if (x.st === 'cap') { if (x.good) t.lostGood++; else t.lostBad++; }
    }
    var escaped = 0;
    for (var j = 0; j < GHOSTS; j++) if (v.g[p * GHOSTS + j].st === 'esc') escaped++;
    t.good = 4 - t.lostGood - escaped;
    t.bad = 4 - t.lostBad;
    return t;
  }

  return {
    N: N, CELLS: CELLS, EXIT: EXIT, LIMIT: LIMIT, GHOSTS: GHOSTS,
    rowOf: rowOf, colOf: colOf, sq: sq, dist: dist, flip: flip, neighbours: neighbours, owner: owner,
    slotSquare: slotSquare, homeSquares: homeSquares, exitsOf: exitsOf, isExitOf: isExitOf,
    mulberry32: mulberry32, shuffle: shuffle, randomLayout: randomLayout, validLayout: validLayout,
    newGame: newGame, setup: setup, legal: legal, movesFrom: movesFrom, apply: apply, resign: resign,
    viewFor: viewFor, evFor: evFor, clone: clone, tally: tally, countLeft: countLeft
  };
});
