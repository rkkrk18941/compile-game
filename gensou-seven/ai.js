/* ファンタジーレルムズ — computer players.
   A CPU sees exactly what a person in its seat would see (its own hand, the discard area, the public log) and picks
   the move whose resulting hand scores best, with a look-ahead bonus for hands that one more card would improve. */
(function (root, factory) {
  var api = factory(root.GS_ENGINE || (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GS_AI = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var cache = null;
  function score(ids) {
    var k = ids.slice().sort(function (a, b) { return a - b; }).join(',');
    if (cache && k in cache) return cache[k];
    var v = E.quickScore(ids, 400);
    if (cache) cache[k] = v;
    return v;
  }

  // Cards nobody has shown: not in my hand, not in the discard area, and not known to be in another hand
  // (a card someone took from the discard area and has not discarded since).
  function unseen(v) {
    var known = {}, i;
    v.hand.forEach(function (n) { known[n] = true; });
    v.discard.forEach(function (n) { known[n] = true; });
    var holding = {};
    (v.log || []).forEach(function (e) {
      if (e.seat === v.me) return;
      if (e.t === 'take') holding[e.id] = true;
      if (e.t === 'discard') delete holding[e.id];
    });
    for (var h in holding) known[h] = true;
    var out = [];
    for (i = 1; i <= E.DECK_SIZE; i++) if (!known[i]) out.push(i);
    return out;
  }

  function sample(arr, k, rand) {
    if (arr.length <= k) return arr.slice();
    var a = arr.slice(); E.shuffle(a, rand); return a.slice(0, k);
  }

  // best hand of size `keep` from the cards `ids` when one card must go (or none, if ids is already small enough)
  function bestKeep(ids, mustDiscardFrom) {
    var best = null;
    var from = mustDiscardFrom || ids;
    from.forEach(function (d) {
      var rest = ids.slice(); rest.splice(rest.indexOf(d), 1);
      var s = score(rest);
      if (!best || s > best.s) best = { s: s, d: d, hand: rest };
    });
    return best;
  }

  // expected gain from one more card (draw one, keep the best seven)
  function potential(hand, pool, rand, k) {
    if (!pool.length) return 0;
    var base = score(hand), sum = 0, cards = sample(pool, k || 10, rand), n = 0;
    for (var i = 0; i < cards.length; i++) {
      if (n >= 3 && Date.now() > deadline) break; // a hand full of wild cards: average what there is time for
      var all = hand.concat([cards[i]]);
      var b = hand.length >= 7 ? bestKeep(all).s : score(all);
      sum += Math.max(0, b - base);
      n++;
    }
    return n ? sum / n : 0;
  }

  // how many more turns this CPU can expect, roughly (for weighing the look-ahead)
  function turnsLeft(v) {
    var n = v.players.length;
    if (v.variant) {
      var need = Math.max(0, 7 - v.handSizes[v.me]) + Math.max(0, 12 - v.discard.length) / 2;
      return Math.max(0.5, need / 1.5);
    }
    return Math.max(0, (10 - v.discard.length) / n);
  }

  // samples: cards tried per look-ahead; w: weight of the look-ahead; top: how many candidate moves get one.
  // (In CPU-vs-CPU four-player games 16/4 beat 8/3 by 89 wins to 51 over 140 games, and the weight 0.6 beat both
  // 0 and 1 by 34 wins to 26 over 60 games.) A move takes at most about `budget` ms of look-ahead.
  var P = { samples: 16, w: 0.6, top: 4 }, deadline = Infinity;
  function choose(v, opts) {
    opts = opts || {};
    P = { samples: opts.samples || 16, w: opts.w != null ? opts.w : 0.6, top: opts.top || 4 };
    deadline = Date.now() + (opts.budget || 1200);
    var rand = E.rng(opts.seed != null ? opts.seed : (v.seq * 2654435761 + v.me * 97 + 13) >>> 0);
    cache = {};
    try {
      return opts.level === 'easy' ? chooseEasy(v, rand) : chooseNormal(v, rand);
    } finally { cache = null; }
  }

  function chooseEasy(v, rand) {
    // greedy on the current score only, with a little randomness
    var hand = v.hand;
    if (v.phase === 'discard') {
      var from = v.drawn2 || hand;
      var b = bestKeep(hand, from);
      if (rand() < 0.15) return { t: 'discard', id: from[Math.floor(rand() * from.length)] };
      return { t: 'discard', id: b.d };
    }
    var building = v.variant && hand.length < 7;
    var cur = score(hand), best = null;
    v.discard.forEach(function (c) {
      var s = building ? score(hand.concat([c])) : bestKeep(hand.concat([c])).s;
      if (!best || s > best.s) best = { s: s, c: c };
    });
    if (best && best.s > cur + 8 && rand() < 0.8) return { t: 'take', id: best.c };
    if (v.deck >= (building ? 2 : 1)) return { t: 'deck' };
    return best ? { t: 'take', id: best.c } : { t: 'deck' };
  }

  function chooseNormal(v, rand) {
    var hand = v.hand, pool = unseen(v);
    var w = Math.min(1, turnsLeft(v) / 2) * P.w;
    var building = v.variant && hand.length < 7;

    if (v.phase === 'discard') {
      var from = v.drawn2 || hand;
      var cands = from.map(function (d) {
        var rest = hand.slice(); rest.splice(rest.indexOf(d), 1);
        return { d: d, hand: rest, s: score(rest) };
      }).sort(function (a, b) { return b.s - a.s; });
      // look ahead on the strongest few
      var top = cands.slice(0, P.top);
      var poolNoMine = pool.filter(function (u) { return from.indexOf(u) < 0; });
      top.forEach(function (c) { c.v = c.s + (w ? w * potential(c.hand, poolNoMine, rand, P.samples) : 0); });
      top.sort(function (a, b) { return b.v - a.v || b.s - a.s; });
      return { t: 'discard', id: top[0].d };
    }

    // draw phase: every face-up card, against the deck
    var options = [];
    v.discard.forEach(function (c) {
      if (building) {
        var h = hand.concat([c]);
        options.push({ a: { t: 'take', id: c }, s: score(h), hand: h });
      } else {
        var b = bestKeep(hand.concat([c]));
        options.push({ a: { t: 'take', id: c }, s: b.s, hand: b.hand, same: b.d === c });
      }
    });
    var deckOk = v.deck >= (building ? 2 : 1);
    if (deckOk) {
      var draws = sample(pool, 14, rand), sum = 0;
      if (building) {
        // draw two, keep one
        for (var i = 0; i < draws.length; i++) {
          var u1 = draws[i], u2 = draws[(i + 1) % draws.length];
          if (draws.length < 2) { sum += score(hand.concat([u1])); continue; }
          sum += Math.max(score(hand.concat([u1])), score(hand.concat([u2])));
        }
      } else {
        draws.forEach(function (u) { sum += bestKeep(hand.concat([u])).s; });
      }
      var ev = draws.length ? sum / draws.length : score(hand);
      options.push({ a: { t: 'deck' }, s: ev, hand: hand, deck: true });
    }
    if (!options.length) return null;
    options.sort(function (a, b) { return b.s - a.s; });
    var top = options.slice(0, P.top + 1);
    top.forEach(function (o) {
      if (o.same) { o.v = -Infinity; return; } // taking a card only to throw it back helps nobody
      o.v = o.s + (w ? w * potential(o.hand, pool.filter(function (u) { return o.hand.indexOf(u) < 0; }), rand, P.samples) : 0);
      if (o.deck) o.v += 0.5; // on a tie, keep the game moving
    });
    top.sort(function (a, b) { return b.v - a.v; });
    var pick = top[0];
    if (!pick || pick.v === -Infinity) return deckOk ? { t: 'deck' } : options[0].a;
    return pick.a;
  }

  return { choose: choose, unseen: unseen };
});
