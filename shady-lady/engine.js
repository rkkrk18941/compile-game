/* シェディー・レディー — the rules, with nothing about the screen.
   80 cards: 1–4 and 6–9, ten of each (there is no 5). Everyone holds 3 cards (or 4 in the app variant). On a turn you do one of:
     draw  the top card of the draw pile, then discard 1 card onto your own discard pile
     take  the top card of anyone's discard pile (yours too), then discard 1 card onto your own pile
     try   (only with a set) reveal your hand; clockwise, the others may reveal only a stronger set;
           the strongest set scores 1; everyone who revealed discards those cards in an order of their choice
           and draws 3 new cards
     jack  name a player, who reveals: a set → you score 1, no set → they score 1; they discard in an order
           of their choice and draw 3 new cards
   Sets: three of a number (ゾロ目) beats any run of three consecutive numbers (連番); within a kind higher wins.
   With no 5 the runs are 1-2-3, 2-3-4, 6-7-8 and 7-8-9. When the draw pile runs out, every discard pile keeps
   only its top card and the rest is shuffled into a new draw pile. The first to 3 points wins at once.

   State (plain JSON, so a game can be saved and sent): see newGame. Card ids 0..79, number = NUMS[id / 10].
   apply(st, seat, act) → { ok, ev } or { ok: false, err }. Events carry the public part of what happened;
   anything only one player may see sits under ev.priv and is removed by evFor for everyone else.
   viewFor(st, seat) is everything that seat may know. Seats run clockwise: the next player is seat + 1. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SL_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var NUMS = [1, 2, 3, 4, 6, 7, 8, 9];
  var PER = 10, TOTAL = 80, HAND = 3, HIST = 12;
  function num(id) { return NUMS[(id / PER) | 0]; }
  function nums(ids) { return ids.map(num); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ randomness (state kept in st.rs) */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand(st) {
    var a = st.rs = (st.rs + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand(st) * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ------------------------------------------------------------------ sets */
  // combo([n, n, n]) → null or { k: 'triple'|'run', n: deciding number, s: strength, nums: sorted }
  function combo(ns) {
    if (!ns || (ns.length !== 3 && ns.length !== 4) || ns.some(function (n) { return NUMS.indexOf(n) < 0; })) return null;
    var a = ns.slice().sort(function (x, y) { return x - y; });
    if (a.every(function (n) { return n === a[0]; })) return { k: 'triple', n: a[0], s: 100 + a[0], nums: a };
    if (a.every(function (n, i) { return n === a[0] + i; })) return { k: 'run', n: a[a.length - 1], s: a[a.length - 1], nums: a };
    return null;
  }
  function comboName(c) {
    if (!c) return '役なし';
    return c.k === 'triple' ? c.n + 'のゾロ目' : c.nums.join('-') + 'の連番';
  }
  // every possible set, weakest first (used by the help screen and the CPU)
  function setsFor(size) {
    var out = [], runs = size === 4 ? [[1, 2, 3, 4], [6, 7, 8, 9]] : [[1, 2, 3], [2, 3, 4], [6, 7, 8], [7, 8, 9]];
    runs.forEach(function (r) { out.push(combo(r)); });
    NUMS.forEach(function (n) { out.push(combo(Array(size === 4 ? 4 : 3).fill(n))); });
    return out;
  }
  var ALL_SETS = setsFor(3);

  /* ------------------------------------------------------------------ a new game */
  // o: { handSize: 3|4 (default 3), players: [{ name, kind: 'human'|'cpu', level }], seed, first (seat, or -1 for random), target (points, default 3) }
  function newGame(o) {
    var n = o.players.length;
    if (n < 2 || n > 6) throw new Error('2〜6人で遊びます');
    var st = {
      v: 1, n: n, handSize: o.handSize === 4 ? 4 : 3, rs: (o.seed >>> 0) || 1, target: o.target >= 1 ? o.target | 0 : 3,
      players: o.players.map(function (p) {
        return { name: String(p.name || ''), kind: p.kind === 'cpu' ? 'cpu' : 'human', level: p.level | 0, hand: [], pile: [], pts: 0, known: [], since: 0, hist: [], pass: null };
      }),
      deck: [], turn: 0, first: 0, phase: 'turn', drawn: null, tr: null, ord: null, open: [], winner: -1, turnNo: 1, moves: 0, reshuffles: 0, last: null
    };
    var deck = [];
    for (var i = 0; i < TOTAL; i++) deck.push(i);
    st.deck = shuffle(st, deck);
    st.first = o.first >= 0 && o.first < n ? o.first : Math.floor(rand(st) * n);
    st.turn = st.first;
    for (var k = 0; k < (st.handSize || HAND); k++) for (var p = 0; p < n; p++) st.players[(st.first + p) % n].hand.push(st.deck.pop());
    return st;
  }

  /* ------------------------------------------------------------------ helpers */
  function next(st, p) { return (p + 1) % st.n; }
  function drawOne(st, ev) {
    if (!st.deck.length) reshuffle(st, ev);
    return st.deck.length ? st.deck.pop() : null;
  }
  // every discard pile keeps only its top card; the rest becomes the new draw pile
  function reshuffle(st, ev) {
    var pool = [];
    st.players.forEach(function (P) { if (P.pile.length > 1) { pool = pool.concat(P.pile.slice(0, -1)); P.pile = P.pile.slice(-1); } });
    st.deck = shuffle(st, pool);
    st.reshuffles++;
    ev.push({ t: 'reshuffle', deck: st.deck.length, tops: st.players.map(function (P) { return P.pile.length ? num(P.pile[0]) : null; }) });
  }
  function award(st, p, why, ev) {
    var P = st.players[p];
    P.pts++;
    ev.push({ t: 'point', p: p, why: why, pts: P.pts });
    if (P.pts >= st.target) { st.phase = 'over'; st.winner = p; ev.push({ t: 'over', winner: p }); }
  }
  function passTurn(st, from, ev) {
    st.turn = next(st, from);
    st.turnNo++;
    ev.push({ t: 'turn', p: st.turn, no: st.turnNo });
  }
  function fail(err) { return { ok: false, err: err }; }
  function isSeat(st, s) { return typeof s === 'number' && s >= 0 && s < st.n && (s | 0) === s; }

  // who has to decide now: [seat, …]
  function waitingFor(st) {
    if (st.phase === 'turn' || st.phase === 'discard') return [st.turn];
    if (st.phase === 'try') return st.tr.q.length ? [st.tr.q[0]] : [];
    if (st.phase === 'order') return st.ord.pend.filter(function (s) { return !st.ord.got[s]; });
    return [];
  }

  /* ------------------------------------------------------------------ moves */
  function apply(st, p, act) {
    if (!act || typeof act !== 'object') return fail('bad');
    if (st.phase === 'over') return fail('over');
    if (!isSeat(st, p)) return fail('bad');
    var P = st.players[p], ev = [], id, c;
    switch (act.t) {
      case 'draw':
        if (st.phase !== 'turn' || p !== st.turn) return fail('turn');
        id = drawOne(st, ev);
        if (id === null) return fail('empty');
        P.hand.push(id);
        st.drawn = { id: id, src: -1 };
        st.phase = 'discard';
        ev.push({ t: 'draw', p: p, deck: st.deck.length, priv: { id: id, n: num(id) } });
        break;

      case 'take':
        if (st.phase !== 'turn' || p !== st.turn) return fail('turn');
        if (!isSeat(st, act.from) || !st.players[act.from].pile.length) return fail('bad');
        id = st.players[act.from].pile.pop();
        P.hand.push(id);
        P.known.push(num(id));
        st.drawn = { id: id, src: act.from };
        st.phase = 'discard';
        ev.push({ t: 'take', p: p, from: act.from, n: num(id), priv: { id: id } });
        break;

      case 'discard': {
        if (st.phase !== 'discard' || p !== st.turn) return fail('turn');
        var i = P.hand.indexOf(act.card);
        if (i < 0) return fail('bad');
        P.hand.splice(i, 1);
        P.pile.push(act.card);
        var d = num(act.card), k = P.known.indexOf(d);
        if (k >= 0) P.known.splice(k, 1);
        P.since++;
        P.pass = null;
        P.hist.push({ src: st.drawn.src, n: st.drawn.src >= 0 ? num(st.drawn.id) : null, d: d });
        if (P.hist.length > HIST) P.hist.shift();
        var wasDrawn = act.card === st.drawn.id;
        st.last = { p: p, src: st.drawn.src, n: st.drawn.src >= 0 ? num(st.drawn.id) : null, d: d };
        st.drawn = null;
        st.phase = 'turn';
        ev.push({ t: 'discard', p: p, n: d, priv: { id: act.card, drawn: wasDrawn } });
        passTurn(st, p, ev);
        break;
      }

      case 'try': {
        if (st.phase !== 'turn' || p !== st.turn) return fail('turn');
        c = combo(nums(P.hand));
        if (!c) return fail('noset');
        var q = [];
        for (var s = next(st, p); s !== p; s = next(st, s)) q.push(s);
        st.tr = { by: p, best: p, s: c.s, q: q, rev: [p], pass: [] };
        st.open = [p];
        st.phase = 'try';
        ev.push({ t: 'try', p: p, hand: nums(P.hand), c: c });
        if (!q.length) endTry(st, ev);
        break;
      }

      case 'respond':
        if (st.phase !== 'try' || st.tr.q[0] !== p) return fail('turn');
        if (act.reveal) {
          c = combo(nums(P.hand));
          if (!c || c.s <= st.tr.s) return fail('weak');
          st.tr.best = p; st.tr.s = c.s; st.tr.rev.push(p);
          st.open.push(p);
          ev.push({ t: 'respond', p: p, reveal: true, hand: nums(P.hand), c: c });
        } else {
          st.tr.pass.push(p);
          P.pass = st.tr.s;   // public: they did not show a set stronger than this
          ev.push({ t: 'respond', p: p, reveal: false });
        }
        st.tr.q.shift();
        if (!st.tr.q.length) endTry(st, ev);
        break;

      case 'jack': {
        if (st.phase !== 'turn' || p !== st.turn) return fail('turn');
        var t = act.target;
        if (!isSeat(st, t) || t === p) return fail('bad');
        c = combo(nums(st.players[t].hand));
        st.open = [t];
        ev.push({ t: 'jack', p: p, target: t, hand: nums(st.players[t].hand), c: c, ok: !!c });
        award(st, c ? p : t, c ? 'jack' : 'jackFail', ev);
        if (st.phase !== 'over') { st.ord = { ctx: 'jack', by: p, pend: [t], got: {} }; st.phase = 'order'; }
        st.last = { p: p, jack: t, ok: !!c };
        break;
      }

      case 'order': {
        if (st.phase !== 'order' || st.ord.pend.indexOf(p) < 0 || st.ord.got[p]) return fail('turn');
        var cards = act.cards;   // top first: [top, middle, bottom]
        if (!Array.isArray(cards) || cards.length !== P.hand.length) return fail('bad');
        var rest = P.hand.slice();
        for (var j = 0; j < cards.length; j++) { var at = rest.indexOf(cards[j]); if (at < 0) return fail('bad'); rest.splice(at, 1); }
        st.ord.got[p] = cards.slice();
        ev.push({ t: 'ordered', p: p });
        if (!waitingFor(st).length) finishOrder(st, ev);
        break;
      }

      default:
        return fail('bad');
    }
    st.moves++;
    return { ok: true, ev: ev };
  }

  function endTry(st, ev) {
    var tr = st.tr;
    ev.push({ t: 'tryEnd', by: tr.by, winner: tr.best, s: tr.s, rev: tr.rev.slice() });
    award(st, tr.best, 'try', ev);
    st.last = { p: tr.by, tried: true, winner: tr.best };
    if (st.phase === 'over') return;
    st.ord = { ctx: 'try', by: tr.by, pend: tr.rev.slice(), got: {} };
    st.phase = 'order';
  }

  // Revealed hands go onto their owners' piles, then refill to the chosen hand size.
  function finishOrder(st, ev) {
    var o = st.ord;
    o.pend.forEach(function (s) {
      var P = st.players[s], topFirst = o.got[s], bottomFirst = topFirst.slice().reverse();
      bottomFirst.forEach(function (id) { P.pile.push(id); });
      P.hand = [];
      ev.push({ t: 'shed', p: s, ns: nums(bottomFirst), priv: { ids: bottomFirst } });
    });
    o.pend.forEach(function (s) {
      var P = st.players[s];
      for (var k = 0; k < (st.handSize || HAND); k++) { var id = drawOne(st, ev); if (id !== null) P.hand.push(id); }
      P.known = []; P.since = 0; P.hist = []; P.pass = null;
      ev.push({ t: 'refill', p: s, deck: st.deck.length, priv: { ids: P.hand.slice(), ns: nums(P.hand) } });
    });
    st.ord = null; st.tr = null; st.open = [];
    st.phase = 'turn';
    passTurn(st, o.by, ev);
  }

  /* ------------------------------------------------------------------ what one seat may know */
  function viewFor(st, me) {
    var v = {
      v: 1, me: me, n: st.n, handSize: st.handSize || HAND, target: st.target, phase: st.phase, turn: st.turn, turnNo: st.turnNo, first: st.first,
      winner: st.winner, deck: st.deck.length, reshuffles: st.reshuffles, moves: st.moves,
      players: st.players.map(function (P, i) {
        var o = { name: P.name, kind: P.kind, level: P.level, pts: P.pts, count: P.hand.length, pile: nums(P.pile), known: P.known.slice(), since: P.since, hist: clone(P.hist), pass: P.pass };
        if (i === me) o.hand = P.hand.map(function (id) { return { id: id, n: num(id) }; });
        if (st.open.indexOf(i) >= 0) o.shown = nums(P.hand);
        return o;
      }),
      drawnSrc: st.drawn ? st.drawn.src : null,
      drawnId: st.drawn && st.turn === me ? st.drawn.id : null,
      tr: st.tr ? { by: st.tr.by, best: st.tr.best, s: st.tr.s, q: st.tr.q.slice(), rev: st.tr.rev.slice(), pass: st.tr.pass.slice() } : null,
      ord: st.ord ? { ctx: st.ord.ctx, by: st.ord.by, pend: st.ord.pend.slice(), done: Object.keys(st.ord.got).map(Number) } : null,
      open: st.open.slice(),
      last: st.last ? clone(st.last) : null,
      waiting: waitingFor(st)
    };
    return v;
  }
  function evFor(evs, me) {
    return (evs || []).map(function (e) {
      var c = clone(e);
      if (c.priv && c.p !== me) delete c.priv;
      return c;
    });
  }

  /* ------------------------------------------------------------------ small queries on a view */
  function myNums(v) { var h = v.players[v.me].hand; return h ? h.map(function (c) { return c.n; }) : []; }
  function canTry(v) { return v.phase === 'turn' && v.turn === v.me && !!combo(myNums(v)); }
  function canJack(v) { return v.phase === 'turn' && v.turn === v.me; }
  function mustRespond(v) { return v.phase === 'try' && v.tr && v.tr.q[0] === v.me; }
  function canBeat(v) { var c = combo(myNums(v)); return !!(c && v.tr && c.s > v.tr.s); }
  function mustOrder(v) { return v.phase === 'order' && v.ord && v.ord.pend.indexOf(v.me) >= 0 && v.ord.done.indexOf(v.me) < 0; }
  function takeable(v) { var out = []; v.players.forEach(function (P, i) { if (P.pile.length) out.push(i); }); return out; }
  // count check used by the tests: every card is somewhere exactly once
  function census(st) {
    var seen = {}, all = st.deck.slice();
    st.players.forEach(function (P) { all = all.concat(P.hand, P.pile); });
    for (var i = 0; i < all.length; i++) { if (seen[all[i]]) return false; seen[all[i]] = 1; }
    return all.length === TOTAL;
  }

  return {
    NUMS: NUMS, PER: PER, TOTAL: TOTAL, HAND: HAND, ALL_SETS: ALL_SETS, setsFor: setsFor,
    num: num, nums: nums, combo: combo, comboName: comboName, mulberry32: mulberry32,
    newGame: newGame, apply: apply, viewFor: viewFor, evFor: evFor, waitingFor: waitingFor, census: census,
    myNums: myNums, canTry: canTry, canJack: canJack, mustRespond: mustRespond, canBeat: canBeat, mustOrder: mustOrder, takeable: takeable
  };
});
