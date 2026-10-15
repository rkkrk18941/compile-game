/* ハシッコ・セブン — rules engine (pure, no DOM). Loaded as a plain script (window.HSV_ENG) and by node tests.
   The rules follow the card game ナナ / nana (game design: Kaya Miyano, MoB+ 2021).

   36 cards: the numbers 1-12, three of each. 2-5 players; the deck and the deal depend on the player count:
       players  numbers  hand  field
          2      1-10     10    10
          3      1-11      8     9
          4      1-12      7     8
          5      1-12      6     6
   Every hand is kept sorted. On your turn you make one challenge: reveal cards one at a time, each one either
     - the smallest or the largest card of anyone's hand (your own too), or
     - any face-down card of the field.
   A card revealed from a hand is laid in front of its owner, so asking the same end again shows the next card.
   As soon as a revealed number differs from the first one, the challenge fails: the hand cards go back to their
   owners and the field cards turn face down where they were. Three of the same number: the challenger keeps
   them (a trio). Either way the turn passes to the next player (to the left).
   A player wins at once with the trio of 7s, with three trios, or with two trios whose numbers add up to 7 or
   differ by 7 (3 and 4, 12 and 5, ...).

   Cards are integers: id = (number - 1) * 3 + copy (copy 0-2), number = floor(id / 3) + 1, so sorting ids sorts
   numbers. The engine applies one reveal at a time and returns events; viewFor() is what one player may see and
   reduceView() steps such a view forward by one event (the UI replays a turn with it). Nothing in the events is
   secret: every card they name has been shown to the whole table. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HSV_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SETUP = {
    2: { top: 10, hand: 10, field: 10 },
    3: { top: 11, hand: 8, field: 9 },
    4: { top: 12, hand: 7, field: 8 },
    5: { top: 12, hand: 6, field: 6 }
  };
  var WIN_TEXT = {
    seven: '7のトリオをそろえた',
    three: 'トリオを3組そろえた',
    sum7: '足して7になる2組をそろえた',
    diff7: '引いて7になる2組をそろえた'
  };

  function num(c) { return ((c / 3) | 0) + 1; }
  function byId(a, b) { return a - b; }

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function randomSeed() { return (Math.random() * 4294967296) >>> 0; }
  function fail(err) { return { ok: false, err: err }; }

  /* ================================================================== winning */
  /* how a player with these trio numbers wins (or null) */
  function winHow(vals) {
    if (vals.indexOf(7) >= 0) return 'seven';
    if (vals.length >= 3) return 'three';
    if (vals.length === 2) {
      if (vals[0] + vals[1] === 7) return 'sum7';
      if (Math.abs(vals[0] - vals[1]) === 7) return 'diff7';
    }
    return null;
  }
  /* the numbers (1..top, not yet taken) whose trio would make this player win at once */
  function winNumbers(vals, top, taken) {
    var out = [];
    for (var v = 1; v <= top; v++) {
      if (taken && taken[v]) continue;
      if (vals.indexOf(v) >= 0) continue;
      if (winHow(vals.concat([v]))) out.push(v);
    }
    return out;
  }
  function takenOf(trios) {
    var t = {};
    trios.forEach(function (ts) { ts.forEach(function (x) { t[x.v] = true; }); });
    return t;
  }

  /* ================================================================== setup */
  /* opt: { n: 2-5, seed, first, deal: { hands: [[ids]], field: [ids] } (tests) } */
  function newGame(opt) {
    opt = opt || {};
    var n = opt.n | 0;
    if (!SETUP[n]) throw new Error('2-5 players');
    var S = SETUP[n];
    var seed = opt.seed != null ? opt.seed >>> 0 : randomSeed();
    var rng = mulberry32(seed);
    var hands, field;
    if (opt.deal) {
      hands = opt.deal.hands.map(function (h) { return h.slice().sort(byId); });
      field = opt.deal.field.slice();
    } else {
      var deck = [];
      for (var c = 0; c < S.top * 3; c++) deck.push(c);
      shuffle(deck, rng);
      field = deck.slice(0, S.field);
      hands = [];
      for (var p = 0; p < n; p++) hands.push(deck.slice(S.field + p * S.hand, S.field + (p + 1) * S.hand).sort(byId));
    }
    var first = opt.first != null ? ((opt.first | 0) % n + n) % n : Math.floor(rng() * n);
    var empty = function () { var a = []; for (var i = 0; i < n; i++) a.push([]); return a; };
    return {
      v: 1, n: n, top: S.top, seed: seed, first: first,
      turn: first, phase: 'play', ply: 0, turnNo: 1,
      hands: hands, front: empty(), field: field, up: field.map(function () { return false; }),
      chal: [], trios: empty(), winner: -1, win: null, log: [], last: null
    };
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  /* ================================================================== actions
     { t: 'hand', p, who, end: 'min' | 'max' }   reveal the smallest / largest card of who's hand
     { t: 'field', p, i }                         reveal the face-down field card in slot i            */
  function legalActions(s) {
    var out = [];
    if (s.phase !== 'play') return out;
    for (var w = 0; w < s.n; w++) {
      var k = s.hands[w].length;
      if (!k) continue;
      out.push({ t: 'hand', who: w, end: 'min' });
      if (k > 1) out.push({ t: 'hand', who: w, end: 'max' });
    }
    s.field.forEach(function (c, i) { if (c != null && !s.up[i]) out.push({ t: 'field', i: i }); });
    return out;
  }
  function record(x) { return x.src === 'hand' ? { w: x.who, e: x.end === 'min' ? 0 : 1, v: num(x.c) } : { i: x.i, v: num(x.c) }; }

  function apply(s, a) {
    if (!a || typeof a !== 'object') return fail('bad');
    if (s.phase !== 'play') return fail('over');
    if (a.p !== s.turn) return fail('turn');
    var rec, c;
    if (a.t === 'hand') {
      var w = a.who;
      if (typeof w !== 'number' || w < 0 || w >= s.n || w !== (w | 0)) return fail('who');
      if (a.end !== 'min' && a.end !== 'max') return fail('end');
      var h = s.hands[w];
      if (!h.length) return fail('empty');
      c = a.end === 'min' ? h.shift() : h.pop();
      s.front[w].push(c);
      rec = { src: 'hand', who: w, end: a.end, c: c };
    } else if (a.t === 'field') {
      var i = a.i;
      if (typeof i !== 'number' || i < 0 || i >= s.field.length || i !== (i | 0)) return fail('slot');
      if (s.field[i] == null) return fail('gone');
      if (s.up[i]) return fail('up');
      c = s.field[i];
      s.up[i] = true;
      rec = { src: 'field', i: i, c: c };
    } else return fail('type');
    s.chal.push(rec);
    s.ply++;
    var ev = [Object.assign({ k: 'reveal', p: a.p, v: num(c), n: s.chal.length }, rec)];
    var v0 = num(s.chal[0].c);
    if (num(c) !== v0) endChallenge(s, false, ev);
    else if (s.chal.length === 3) endChallenge(s, true, ev);
    return { ok: true, ev: ev };
  }

  function endChallenge(s, ok, ev) {
    var p = s.turn;
    var log = { p: p, t: s.turnNo, ok: ok, r: s.chal.map(record) };
    var cards = s.chal.map(function (x) { return x.c; });
    if (!ok) {
      for (var w = 0; w < s.n; w++) {
        if (!s.front[w].length) continue;
        s.hands[w] = s.hands[w].concat(s.front[w]).sort(byId);
        s.front[w] = [];
      }
      s.chal.forEach(function (x) { if (x.src === 'field') s.up[x.i] = false; });
      ev.push({ k: 'fail', p: p, cards: cards });
      s.last = { p: p, ok: false, v: num(s.chal[0].c), bad: num(s.chal[s.chal.length - 1].c), t: s.turnNo };
    } else {
      var v = num(s.chal[0].c);
      s.chal.forEach(function (x) {
        if (x.src === 'field') { s.field[x.i] = null; s.up[x.i] = false; }
        else { var f = s.front[x.who], k = f.indexOf(x.c); if (k >= 0) f.splice(k, 1); }
      });
      s.trios[p].push({ v: v, cards: cards, t: s.turnNo });
      log.v = v;
      ev.push({ k: 'trio', p: p, v: v, cards: cards });
      s.last = { p: p, ok: true, v: v, t: s.turnNo };
      var how = winHow(s.trios[p].map(function (x) { return x.v; }));
      if (how) { s.phase = 'over'; s.winner = p; s.win = how; }
    }
    s.log.push(log);
    s.chal = [];
    if (s.phase === 'over') ev.push({ k: 'over', p: s.winner, how: s.win });
    else { s.turn = (p + 1) % s.n; s.turnNo++; ev.push({ k: 'turn', p: s.turn }); }
  }

  /* ================================================================== views (what one player may see)
     field: null = empty slot, -1 = face down, id = face up (revealed in the current challenge)               */
  function viewFor(s, me) {
    return {
      v: 1, me: me, n: s.n, top: s.top, first: s.first, turn: s.turn, phase: s.phase, ply: s.ply, turnNo: s.turnNo,
      hand: s.hands[me].slice(),
      counts: s.hands.map(function (h) { return h.length; }),
      front: s.front.map(function (f) { return f.slice(); }),
      field: s.field.map(function (c, i) { return c == null ? null : s.up[i] ? c : -1; }),
      chal: s.chal.map(function (x) { return Object.assign({}, x); }),
      trios: s.trios.map(function (ts) { return ts.map(function (x) { return { v: x.v, cards: x.cards.slice(), t: x.t }; }); }),
      log: s.log.map(function (l) { var o = { p: l.p, t: l.t, ok: l.ok, r: l.r.map(function (r) { return Object.assign({}, r); }) }; if (l.v != null) o.v = l.v; return o; }),
      winner: s.winner, win: s.win, last: s.last ? Object.assign({}, s.last) : null
    };
  }
  /* the actions of the player to move, from a view (the same list legalActions gives for the state) */
  function viewActions(v) {
    var out = [];
    if (v.phase !== 'play') return out;
    for (var w = 0; w < v.n; w++) {
      var k = v.counts[w];
      if (!k) continue;
      out.push({ t: 'hand', who: w, end: 'min' });
      if (k > 1) out.push({ t: 'hand', who: w, end: 'max' });
    }
    v.field.forEach(function (c, i) { if (c === -1) out.push({ t: 'field', i: i }); });
    return out;
  }
  /* Step a view forward by one event. The UI uses it to show a turn one card at a time; the authoritative
     view that arrives with the events replaces it afterwards. */
  function reduceView(v0, e) {
    var v = JSON.parse(JSON.stringify(v0)), me = v.me;
    switch (e.k) {
      case 'reveal': {
        var rec = e.src === 'hand' ? { src: 'hand', who: e.who, end: e.end, c: e.c } : { src: 'field', i: e.i, c: e.c };
        if (e.src === 'hand') {
          if (e.who === me) { var k = v.hand.indexOf(e.c); if (k >= 0) v.hand.splice(k, 1); }
          v.counts[e.who] = Math.max(0, v.counts[e.who] - 1);
          v.front[e.who].push(e.c);
        } else v.field[e.i] = e.c;
        v.chal.push(rec);
        v.ply++;
        break;
      }
      case 'fail': {
        v.log.push({ p: e.p, t: v.turnNo, ok: false, r: v.chal.map(record) });
        for (var w = 0; w < v.n; w++) {
          if (!v.front[w].length) continue;
          if (w === me) v.hand = v.hand.concat(v.front[w]).sort(byId);
          v.counts[w] += v.front[w].length;
          v.front[w] = [];
        }
        v.chal.forEach(function (x) { if (x.src === 'field') v.field[x.i] = -1; });
        v.last = { p: e.p, ok: false, v: v.chal.length ? num(v.chal[0].c) : 0, bad: v.chal.length ? num(v.chal[v.chal.length - 1].c) : 0, t: v.turnNo };
        v.chal = [];
        break;
      }
      case 'trio': {
        v.log.push({ p: e.p, t: v.turnNo, ok: true, r: v.chal.map(record), v: e.v });
        v.chal.forEach(function (x) {
          if (x.src === 'field') v.field[x.i] = null;
          else { var f = v.front[x.who], j = f.indexOf(x.c); if (j >= 0) f.splice(j, 1); }
        });
        v.trios[e.p].push({ v: e.v, cards: e.cards.slice(), t: v.turnNo });
        v.last = { p: e.p, ok: true, v: e.v, t: v.turnNo };
        v.chal = [];
        break;
      }
      case 'turn':
        v.turn = e.p; v.turnNo++;
        break;
      case 'over':
        v.phase = 'over'; v.winner = e.p; v.win = e.how;
        break;
    }
    return v;
  }

  /* ================================================================== small helpers for the UI */
  function trioVals(v, p) { return v.trios[p].map(function (x) { return x.v; }); }
  /* the number the current challenge is after (0 when nothing is revealed yet) and how many are still needed */
  function target(v) {
    if (!v.chal.length) return { v: 0, need: 3 };
    return { v: num(v.chal[0].c), need: 3 - v.chal.length };
  }

  return {
    SETUP: SETUP, WIN_TEXT: WIN_TEXT,
    num: num, mulberry32: mulberry32, shuffle: shuffle, randomSeed: randomSeed,
    winHow: winHow, winNumbers: winNumbers, takenOf: takenOf,
    newGame: newGame, clone: clone, legalActions: legalActions, apply: apply,
    viewFor: viewFor, viewActions: viewActions, reduceView: reduceView, trioVals: trioVals, target: target
  };
});
