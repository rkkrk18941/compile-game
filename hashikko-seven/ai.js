/* ハシッコ・セブン — CPU players. Pure (no DOM): a plain script (window.HSV_AI), the worker (cpu-worker.js) and node.

   A CPU sees what a player at the table sees: its own hand, the hand counts, the trios, and every card that has
   been shown (the public log in the view). How much of that log it still remembers depends on its level, and it
   forgets the same things from turn to turn (mind.seed): an old reveal fades, it never comes back.

   From what it remembers it works out, for every other player, the smallest and largest cards of their hand it
   knows for sure (a challenge that asked someone's smallest twice saw the two smallest cards of that hand; hands
   only ever lose cards, so this stays true once the numbers already taken are struck out). It then deals the
   cards it has not seen into the places it does not know, many times over ("worlds"), keeping every hand sorted
   and inside what it knows. Each possible reveal is scored by playing the challenge out in all those worlds the
   way it would really play it, weighted by what the trio is worth. Strong play compares the complete
   three-card route, and values learning an unknown card over exposing an already-known own card. */
(function (root, factory) {
  var E = root && root.HSV_ENG ? root.HSV_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HSV_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var LEVELS = {
    1: { worlds: 120, random: 0.22, temp: 0.45, deny: 0, leak: 0, threat: 0 },
    2: { worlds: 220, random: 0.06, temp: 0.12, deny: 1.2, leak: 0.25, threat: 0.1 },
    3: { worlds: 1200, random: 0, temp: 0, deny: 1.8, leak: 0.45, threat: 0.15, plan: true, explore: 0.08 }
  };

  /* ------------------------------------------------------------------ memory */
  function mix(h, x) { h ^= x >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
  function hash01(seed, a, b, c) { return mix(mix(mix(mix(0x9e3779b9, seed), a), b), c) / 4294967296; }
  /* chance that a CPU of this level still remembers a card shown `age` turns ago */
  function keepProb(level, age) {
    if (level >= 3) return 1;
    if (level === 2) return Math.max(0.6, 0.97 - 0.035 * age);
    return Math.max(0.25, 0.8 - 0.09 * age);
  }

  /* ------------------------------------------------------------------ what this player knows
     returns { me, n, top, taken, hands: [sorted values of the current hand, or null for others],
               known: per player { pre, suf, size, a, b } (others), fieldKnown: [value | 0 | null], pool, ok } */
  function knowledge(v, level, mind) {
    var n = v.n, me = v.me, top = v.top;
    var seed = (mind && mind.seed != null ? mind.seed : 0x51ed27 + me * 7919) >>> 0;
    var taken = E.takenOf(v.trios);
    var fieldKnown = v.field.map(function (c) { return c == null ? null : c >= 0 ? E.num(c) : 0; });
    var pre = [], suf = [], w;
    for (w = 0; w < n; w++) { pre.push([]); suf.push([]); }
    v.log.forEach(function (L) {
      var keep = keepProb(level, v.turnNo - L.t), seqs = {};
      L.r.forEach(function (r, j) {
        if (r.i != null) { if (fieldKnown[r.i] === 0 && hash01(seed, L.t, 1000 + r.i, j) < keep) fieldKnown[r.i] = r.v; }
        else { var k = r.w * 2 + r.e; (seqs[k] = seqs[k] || []).push(r.v); }
      });
      Object.keys(seqs).forEach(function (k) {
        var vals = seqs[k], kept = [];
        for (var j = 0; j < vals.length; j++) { if (hash01(seed, L.t, 2000 + +k, j) < keep) kept.push(vals[j]); else break; }
        if (kept.length) (+k % 2 === 0 ? pre : suf)[(+k / 2) | 0].push(kept);
      });
    });
    // the challenge on the table is certain
    var curMin = [], curMax = [];
    for (w = 0; w < n; w++) { curMin.push([]); curMax.push([]); }
    v.chal.forEach(function (x) {
      if (x.src === 'hand') (x.end === 'min' ? curMin : curMax)[x.who].push(E.num(x.c));
    });
    for (w = 0; w < n; w++) { if (curMin[w].length) pre[w].push(curMin[w]); if (curMax[w].length) suf[w].push(curMax[w]); }

    var count = []; for (var x = 0; x <= top; x++) count.push(0);
    var hands = [], known = [];
    var myFull = v.hand.map(E.num).concat(v.front[me].map(E.num)).sort(function (a, b) { return a - b; });
    myFull.forEach(function (x) { count[x]++; });
    for (w = 0; w < n; w++) {
      if (w === me) { hands.push(v.hand.map(E.num)); known.push(null); continue; }
      hands.push(null);
      var size = v.counts[w] + v.front[w].length;
      var P = longest(pre[w], taken), Q = longest(suf[w], taken);
      var K = { size: size, a: curMin[w].length, b: curMax[w].length, pre: P, suf: Q, full: null, u: 0, lo: 1, hi: top };
      if (P.length >= size) K.full = P.slice(0, size);
      else if (Q.length >= size) K.full = Q.slice(0, size).reverse();
      else if (P.length + Q.length >= size) K.full = P.concat(Q.slice(0, size - P.length).reverse());
      if (K.full) K.full.forEach(function (x) { count[x]++; });
      else {
        P.forEach(function (x) { count[x]++; }); Q.forEach(function (x) { count[x]++; });
        K.u = size - P.length - Q.length;
        K.lo = P.length ? P[P.length - 1] : 1; K.hi = Q.length ? Q[Q.length - 1] : top;
      }
      known.push(K);
    }
    var unknownField = 0;
    fieldKnown.forEach(function (fv) { if (fv == null) return; if (fv > 0) count[fv]++; else unknownField++; });
    var pool = [], ok = true, slots = unknownField;
    for (x = 1; x <= top; x++) {
      if (taken[x]) { if (count[x]) ok = false; continue; }
      var left = 3 - count[x];
      if (left < 0) { ok = false; left = 0; }
      for (var k2 = 0; k2 < left; k2++) pool.push(x);
    }
    known.forEach(function (K) { if (K && !K.full) { slots += K.u; if (K.lo > K.hi) ok = false; } });
    if (pool.length !== slots) ok = false;
    return { me: me, n: n, top: top, taken: taken, hands: hands, known: known, fieldKnown: fieldKnown, pool: pool, ok: ok, myFull: myFull };
  }
  /* the longest of several sequences, after striking out numbers that have been taken since */
  function longest(seqs, taken) {
    var best = [];
    seqs.forEach(function (s) { var t = s.filter(function (x) { return !taken[x]; }); if (t.length > best.length) best = t; });
    return best;
  }
  /* what is certain only (cards on the table, own hand, trios): used when remembered pieces do not fit together */
  function amnesia(v) {
    var w = JSON.parse(JSON.stringify(v));
    w.log = [];
    return w;
  }

  /* ------------------------------------------------------------------ worlds */
  function sampleWorld(K, rng) {
    var others = [];
    K.known.forEach(function (k, w) { if (k && !k.full && k.u > 0) others.push(w); });
    for (var attempt = 0; attempt < 40; attempt++) {
      var rest = K.pool.slice(), mids = {}, fail = false;
      shuffleInPlace(others, rng);
      if (attempt > 20) others.sort(function (a, b) { return (K.known[a].hi - K.known[a].lo) - (K.known[b].hi - K.known[b].lo); });
      for (var oi = 0; oi < others.length && !fail; oi++) {
        var w = others[oi], k = K.known[w], cand = [];
        for (var i = 0; i < rest.length; i++) if (rest[i] >= k.lo && rest[i] <= k.hi) cand.push(i);
        if (cand.length < k.u) { fail = true; break; }
        shuffleInPlace(cand, rng);
        var pick = cand.slice(0, k.u).sort(function (a, b) { return b - a; });
        mids[w] = pick.map(function (ix) { return rest[ix]; });
        pick.forEach(function (ix) { rest.splice(ix, 1); });
      }
      if (fail) continue;
      shuffleInPlace(rest, rng);
      var world = { hands: [], field: [] };
      K.known.forEach(function (k, w2) {
        if (!k) { world.hands.push(K.hands[w2]); return; }
        var full = k.full ? k.full.slice() : k.pre.concat((mids[w2] || []).sort(function (a, b) { return a - b; }), k.suf.slice().reverse());
        world.hands.push(full.slice(k.a, full.length - k.b));
      });
      var r = 0;
      K.fieldKnown.forEach(function (fv) { world.field.push(fv == null ? null : fv > 0 ? fv : rest[r++]); });
      return world;
    }
    return null;
  }
  function shuffleInPlace(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ------------------------------------------------------------------ playing a challenge out in the worlds */
  function newState(n) { var lo = [], hi = []; for (var i = 0; i < n; i++) { lo.push(0); hi.push(0); } return { lo: lo, hi: hi, used: {} }; }
  function avail(st, a, counts) { return a.t === 'hand' ? st.lo[a.who] + st.hi[a.who] < counts[a.who] : !st.used[a.i]; }
  function valueIn(world, st, a) {
    if (a.t === 'hand') { var h = world.hands[a.who]; return a.end === 'min' ? h[st.lo[a.who]] : h[h.length - 1 - st.hi[a.who]]; }
    return world.field[a.i];
  }
  function advance(st, a) {
    var s2 = { lo: st.lo.slice(), hi: st.hi.slice(), used: Object.assign({}, st.used) };
    if (a.t === 'hand') { if (a.end === 'min') s2.lo[a.who]++; else s2.hi[a.who]++; } else s2.used[a.i] = true;
    return s2;
  }
  /* in how many of these worlds the challenge for x is completed with `need` more cards, playing each next
     card as the one that matches in the most remaining worlds */
  function complete(worlds, st, x, need, acts, counts, exact) {
    if (need <= 0) return worlds.length;
    if (!worlds.length) return 0;
    var best = 0, bestA = null, bestList = null;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!avail(st, a, counts)) continue;
      var list = [];
      for (var j = 0; j < worlds.length; j++) if (valueIn(worlds[j], st, a) === x) list.push(worlds[j]);
      if (exact && need > 1) {
        // Matching twice is useful only if there is a third match. A certain second
        // card can be a dead end; a less likely second card can still complete the trio.
        if (list.length > best) best = Math.max(best, complete(list, advance(st, a), x, need - 1, acts, counts, true));
        if (best === worlds.length) return best;
      } else if (list.length > best) { best = list.length; bestA = a; bestList = list; }
    }
    if (exact && need > 1) return best;
    if (!bestA) return 0;
    if (need === 1) return best;
    return complete(bestList, advance(st, bestA), x, need - 1, acts, counts, exact);
  }
  function information(spread, n, top) {
    var h = 0;
    Object.keys(spread).forEach(function (x) { var p = spread[x] / n; if (p > 0) h -= p * Math.log(p); });
    return h / Math.log(top);
  }

  /* ------------------------------------------------------------------ what a trio is worth */
  function trioValue(v, x, cfg, taken) {
    var me = v.me, mine = E.trioVals(v, me);
    if (E.winHow(mine.concat([x]))) return 60;
    var w = 1;
    if (cfg.threat) {
      if (mine.length === 1) w += 0.6;                              // the next trio would win
      else w += cfg.threat * E.winNumbers([x], v.top, taken).length;   // numbers that would then win
    }
    if (cfg.deny) {
      for (var p = 0; p < v.n; p++) {
        if (p === me) continue;
        var theirs = E.trioVals(v, p);
        if (E.winNumbers(theirs, v.top, taken).indexOf(x) < 0) continue;
        var next = (me + 1) % v.n === p;
        w += cfg.deny * (theirs.length >= 2 ? 1.4 : 1) * (next ? 1.5 : 1);
      }
    }
    return w;
  }
  /* how much it costs to show x where everybody can see it (when the challenge then fails) */
  function leakCost(v, x, cfg, taken) {
    if (!cfg.leak) return 0;
    var c = 0;
    for (var p = 0; p < v.n; p++) {
      if (p === v.me) continue;
      if (E.winNumbers(E.trioVals(v, p), v.top, taken).indexOf(x) >= 0) c += cfg.leak * ((v.me + 1) % v.n === p ? 1.6 : 1);
    }
    return c;
  }

  /* ------------------------------------------------------------------ choose */
  function scoreActions(v, level, rng, mind) {
    var cfg = LEVELS[level] || LEVELS[2];
    var K = knowledge(v, level, mind);
    if (!K.ok) K = knowledge(amnesia(v), level, mind);
    var acts = E.viewActions(v);
    var worlds = [];
    if (K.ok) for (var i = 0; i < cfg.worlds; i++) { var wd = sampleWorld(K, rng); if (wd) worlds.push(wd); }
    var N = worlds.length;
    var st0 = newState(v.n), counts = v.counts;
    var taken = K.taken;
    var scores = acts.map(function () { return 0; });
    var chances = acts.map(function () { return 0; });
    if (!N) return { acts: acts, scores: scores, chances: chances, worlds: 0 };
    var tgt = E.target(v);
    if (tgt.v) {
      // in the middle of a challenge: the chance to finish it
      acts.forEach(function (a, ai) {
        var list = [], spread = {};
        for (var j = 0; j < N; j++) { var val = valueIn(worlds[j], st0, a); spread[val] = (spread[val] || 0) + 1; if (val === tgt.v) list.push(worlds[j]); }
        var p = complete(list, advance(st0, a), tgt.v, tgt.need - 1, acts, counts, cfg.plan) / N;
        chances[ai] = p;
        // when nothing can finish it: learn something new, and show little that helps the others
        var unsure = Object.keys(spread).length > 1 ? 1 : 0;
        var lk = 0;
        if (p < 0.02) for (var j2 = 0; j2 < N; j2 += 8) lk += leakCost(v, valueIn(worlds[j2], st0, a), cfg, taken);
        scores[ai] = p * 10 + unsure * 0.04 - lk / Math.ceil(N / 8) * 0.05 + (a.t === 'field' ? 0.01 : 0) - (a.t === 'hand' && a.who === v.me ? 0.02 : 0);
        if (cfg.plan) scores[ai] += cfg.explore * (1 - p) * information(spread, N, v.top);
      });
    } else {
      acts.forEach(function (a, ai) {
        var groups = {};
        for (var j = 0; j < N; j++) { var val = valueIn(worlds[j], st0, a); (groups[val] = groups[val] || []).push(worlds[j]); }
        var st1 = advance(st0, a), total = 0, leak = 0, successes = 0, spread = {};
        Object.keys(groups).forEach(function (key) {
          var x = +key, g = groups[key];
          var c = complete(g, st1, x, 2, acts, counts, cfg.plan);
          successes += c; spread[x] = g.length;
          total += c * trioValue(v, x, cfg, taken);
          leak += (g.length - c) * leakCost(v, x, cfg, taken);
        });
        chances[ai] = successes / N;
        var own = a.t === 'hand' && a.who === v.me ? (cfg.plan ? 0.08 * (1 - chances[ai]) : 0.03) : 0;
        scores[ai] = (total - leak) / N - own;
        if (cfg.plan) scores[ai] += cfg.explore * (1 - chances[ai]) * information(spread, N, v.top);
      });
    }
    return { acts: acts, scores: scores, chances: chances, worlds: N };
  }
  function choose(v, level, rng, mind) {
    rng = rng || Math.random;
    var cfg = LEVELS[level] || LEVELS[2];
    var acts = E.viewActions(v);
    if (!acts.length) return null;
    if (acts.length === 1) return acts[0];
    if (cfg.random && rng() < cfg.random) return acts[Math.floor(rng() * acts.length)];
    var r = scoreActions(v, level, rng, mind);
    if (!r.worlds) return acts[Math.floor(rng() * acts.length)];
    if (cfg.plan) {
      var secure = -Infinity;
      r.chances.forEach(function (p, i) { if (p >= 1 - 1e-9) secure = Math.max(secure, r.scores[i]); });
      // A tiny winning-lottery probability must not outweigh a trio we can
      // actually collect now. This is a route check, not a ban on own cards.
      if (secure > -Infinity) r.chances.forEach(function (p, i) { if (p < 0.10) r.scores[i] = Math.min(r.scores[i], secure - 1); });
    }
    var best = -Infinity;
    r.scores.forEach(function (s) { if (s > best) best = s; });
    if (cfg.temp > 0) {
      // softer choices for the easier levels
      var ws = r.scores.map(function (s) { return Math.exp((s - best) / cfg.temp); }), sum = 0;
      ws.forEach(function (x) { sum += x; });
      var u = rng() * sum;
      for (var i = 0; i < ws.length; i++) { u -= ws[i]; if (u <= 0) return r.acts[i]; }
      return r.acts[ws.length - 1];
    }
    var top = [];
    r.scores.forEach(function (s, i) { if (s >= best - 1e-9) top.push(i); });
    return r.acts[top[Math.floor(rng() * top.length)]];
  }

  return { choose: choose, scoreActions: scoreActions, knowledge: knowledge, sampleWorld: sampleWorld, keepProb: keepProb, LEVELS: LEVELS };
});
