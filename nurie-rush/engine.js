/* おばけキャッチ — the table: draw pile, one round's touches, and the settlement from the rulebook.
   Every mode uses it (CPU, 1台でふたり, ひとり練習); in online games only the host runs it.

   One round:
     reveal(g)                 turns the top card face up
     touch(g, seat, type, item, rt)
                               one touch per player and card (type 'grab' = touch the piece,
                               'call' = name button for the advanced rule); rt = ms since the card face showed
     settle(g)                 the fastest correct touch wins the card. Everyone who touched wrong before that
                               hands over one of their cards (if they have one) to the winner.
                               If nobody is right, the card and the handed-over cards go under the pile.
   The game ends when the pile is empty; most cards wins.

   cpuPlan() decides when and what a CPU touches. */
(function (root, factory) {
  var api = factory(root && root.NR_DECK ? root.NR_DECK : (typeof require === 'function' ? require('./deck.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_ENGINE = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function newGame(o) {
    var rnd = o.rnd || Math.random;
    var ids = [];
    for (var i = 0; i < D.CARDS.length; i++) ids.push(i);
    shuffle(ids, rnd);
    var size = Math.max(1, Math.min(D.CARDS.length, o.deckSize || D.CARDS.length));
    ids = ids.slice(0, size);
    return {
      deck: ids,
      seats: o.seats.map(function (s, k) {
        return { i: k, name: s.name, kind: s.kind || 'human', level: s.level || 0, pile: [], ok: 0, bad: 0, paid: 0, rts: [] };
      }),
      callMode: !!o.callMode,
      deckSize: size,
      n: 0,
      round: null,
      over: false,
      log: []
    };
  }

  function need(g, cardId) { return D.required(D.CARDS[cardId], g.callMode); }

  function reveal(g) {
    if (g.over || !g.deck.length) return null;
    if (g.round && !g.round.done) return null;
    var c = g.deck.shift();
    g.n += 1;
    g.round = { n: g.n, card: c, tries: {}, done: false };
    return c;
  }

  function touch(g, seat, type, item, rt) {
    var r = g.round;
    if (!r || r.done || g.over || !g.seats[seat] || r.tries[seat]) return null;
    if (type !== 'grab' && type !== 'call') return null;
    if (D.ANIMALS.indexOf(item) < 0) return null;
    var q = need(g, r.card);
    var t = { seat: seat, type: type, item: item, rt: Math.max(0, Math.round(+rt || 0)), ok: type === q.type && item === q.item };
    r.tries[seat] = t;
    return t;
  }

  function tries(g) {
    var r = g.round;
    if (!r) return [];
    return Object.keys(r.tries).map(function (k) { return r.tries[k]; });
  }
  /* has every seat in `seats` (default: all) touched this round? */
  function allTouched(g, seats) {
    var r = g.round;
    if (!r) return false;
    var list = seats || g.seats.map(function (s) { return s.i; });
    return list.every(function (i) { return !!r.tries[i]; });
  }
  function bestCorrect(g) {
    var best = null;
    tries(g).forEach(function (t) { if (t.ok && (!best || t.rt < best.rt || (t.rt === best.rt && t.seat < best.seat))) best = t; });
    return best;
  }

  function settle(g, rnd) {
    var r = g.round;
    if (!r || r.done) return null;
    r.done = true;
    var list = tries(g);
    var best = bestCorrect(g);
    var win = best ? best.seat : -1;
    var limit = best ? best.rt : Infinity;
    var moves = [], back = [];
    list.forEach(function (t) {
      if (t.ok) return;
      g.seats[t.seat].bad += 1;
      if (t.rt >= limit) { t.late = true; return; }       // touched after the card was already taken
      var p = g.seats[t.seat].pile;
      var c = p.length ? p.pop() : null;
      if (c !== null) {
        g.seats[t.seat].paid += 1;
        if (win >= 0) g.seats[win].pile.push(c); else back.push(c);
      }
      moves.push({ from: t.seat, to: win, card: c });
    });
    if (win >= 0) {
      g.seats[win].pile.push(r.card);
      g.seats[win].ok += 1;
      g.seats[win].rts.push(best.rt);
    } else {
      back.push(r.card);
      shuffle(back, rnd);
      g.deck = g.deck.concat(back);
    }
    var q = need(g, r.card);
    var out = {
      n: r.n, card: r.card, need: q.type, answer: q.item,
      win: win, rt: best ? best.rt : null, back: win < 0, moves: moves,
      tries: list.map(function (t) { return { seat: t.seat, type: t.type, item: t.item, rt: t.rt, ok: t.ok, late: !!t.late }; }),
      left: g.deck.length
    };
    if (!g.deck.length) g.over = true;
    g.log.push(out);
    return out;
  }

  function scores(g) { return g.seats.map(function (s) { return s.pile.length; }); }
  /* [{ seat, score, rank }] best first; equal scores share a rank */
  function ranking(g) {
    var rows = g.seats.map(function (s) { return { seat: s.i, score: s.pile.length }; });
    rows.sort(function (a, b) { return b.score - a.score || a.seat - b.seat; });
    rows.forEach(function (row, k) { row.rank = k && rows[k - 1].score === row.score ? rows[k - 1].rank : k + 1; });
    return rows;
  }

  /* ---------------------------------------------------------------- CPU */
  var LEVELS = {
    1: { name: 'やさしい', match: [1650, 2900], none: [2250, 3800], err: 0.12, call: 320 },
    2: { name: 'ふつう', match: [1120, 2000], none: [1500, 2650], err: 0.07, call: 260 },
    3: { name: 'つよい', match: [760, 1320], none: [980, 1700], err: 0.035, call: 200 }
  };
  function distractor(card, s, rnd) {
    var w = [], sum = 0;
    D.ANIMALS.forEach(function (x) {
      if (x === s.answer) return;
      var wt = 1;
      if (x === card.a || x === card.b) wt += s.match ? 3 : 2;
      if (x === D.OWNER[card.ca] || x === D.OWNER[card.cb]) wt += s.match ? 2 : 3;
      w.push([x, wt]); sum += wt;
    });
    var u = rnd() * sum;
    for (var i = 0; i < w.length; i++) { u -= w[i][1]; if (u < 0) return w[i][0]; }
    return w[w.length - 1][0];
  }
  /* { rt, type, item } — speed: personal multiplier around 1 */
  function cpuPlan(cardId, level, callMode, rnd, speed) {
    rnd = rnd || Math.random;
    var L = LEVELS[level] || LEVELS[2];
    var card = D.CARDS[cardId], s = D.solve(card), q = D.required(card, callMode);
    var span = s.match ? L.match : L.none;
    var u = (rnd() + rnd()) / 2;
    var rt = (span[0] + (span[1] - span[0]) * u) * (speed || 1);
    if (q.type === 'call') rt += L.call;
    var err = L.err + (s.match ? 0 : 0.015) + (q.type === 'call' ? 0.025 : 0);
    var plan = { rt: rt, type: q.type, item: q.item, slip: false };
    if (rnd() < err) {
      plan.slip = true;
      plan.rt = rt * (0.76 + rnd() * 0.14);
      if (q.type === 'call' && rnd() < 0.45) plan.type = 'grab';
      else if (callMode && q.type === 'grab' && rnd() < 0.12) plan.type = 'call';
      else plan.item = distractor(card, s, rnd);
    }
    plan.rt = Math.round(plan.rt);
    return plan;
  }

  return {
    seeded: seeded, shuffle: shuffle, newGame: newGame, need: need, reveal: reveal, touch: touch, tries: tries,
    allTouched: allTouched, bestCorrect: bestCorrect, settle: settle, scores: scores, ranking: ranking,
    LEVELS: LEVELS, cpuPlan: cpuPlan
  };
});
