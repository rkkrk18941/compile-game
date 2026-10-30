/* シェディー・レディー — the CPU players. They decide only from a seat's view (engine.viewFor): their own hand,
   every discard pile, the cards others are known to hold (taken from a pile in plain sight), and the record of
   what each player took and threw away since they last drew a fresh hand. Nothing hidden is looked at.

   The core is a small model of everyone else's hand: every possible set of unknown cards is weighed by how
   likely it is (cards not yet seen) and, for the stronger CPUs, by how well it explains what that player just
   did (which card they threw away, whether they took a card in plain sight, whether they let a Try pass).
   From that come "how likely is X to hold a set" (for Jack) and "how likely is someone to beat my set" (Try).

   decideTurn(view, level, rnd)    → { t: 'draw' } | { t: 'take', from } | { t: 'try' } | { t: 'jack', target }
   decideDiscard(view, level, rnd) → { t: 'discard', card }
   decideRespond(view, level, rnd) → { t: 'respond', reveal }
   decideOrder(view, level, rnd)   → { t: 'order', cards: [top, middle, bottom] }
   decide(view, level, rnd)        → whichever of the above the view is waiting for from this seat (or null)
   Levels: 1 やさしい, 2 ふつう, 3 つよい. */
(function (root, factory) {
  var E = root && root.SL_ENG ? root.SL_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SL_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var NUMS = E.NUMS, IDX = {};
  NUMS.forEach(function (n, i) { IDX[n] = i; });
  var RUNS = [[1, 2, 3], [2, 3, 4], [6, 7, 8], [7, 8, 9]];
  var LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
  var PARAMS = {
    1: { behave: false, tryWin: 0, jackTau: 0.7, jackChance: 0.5, noise: 1.6, feed: 0, careful: false, bluff: 0, signal: 0 },
    2: { behave: false, tryWin: 0.5, jackTau: 0.62, jackChance: 1, noise: 0.25, feed: 1.6, careful: false, bluff: 0, signal: 0 },
    3: { behave: true, tryWin: 0.44, jackTau: 0.56, jackChance: 1, noise: 0, feed: 3.2, careful: true, bluff: 0.18, signal: 1 }
  };
  var REVEAL = 0.93;     // how often a player who can beat a Try is expected to reveal

  /* ------------------------------------------------------------------ counting */
  function ncr(n, k) { if (k < 0 || k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  // cards this seat has not seen (in the draw pile or in someone's hand, unknown)
  function poolOf(v, extra) {
    var U = {};
    NUMS.forEach(function (n) { U[n] = E.PER; });
    var me = v.players[v.me];
    (me.hand || []).forEach(function (c) { U[c.n]--; });
    v.players.forEach(function (P, i) {
      P.pile.forEach(function (n) { U[n]--; });
      if (i === v.me) return;
      (P.shown || P.known).forEach(function (n) { U[n]--; });
    });
    if (extra) extra.forEach(function (n) { U[n]++; });
    NUMS.forEach(function (n) { if (U[n] < 0) U[n] = 0; });
    return U;
  }
  function ctxOf(U) { var tot = 0; NUMS.forEach(function (n) { tot += U[n]; }); return { U: U, tot: tot, mv: {}, md: {} }; }
  function key(h) { return h.slice().sort(function (a, b) { return a - b; }).join(''); }
  function without(a, i) { var o = a.slice(); o.splice(i, 1); return o; }

  /* ------------------------------------------------------------------ how good is a hand */
  function setScore(c) { return c.k === 'triple' ? 2 + IDX[c.n] * 0.25 : ({ 3: 0, 4: 0.3, 8: 0.6, 9: 0.9 })[c.n]; }
  function bestSet(h4) {   // strongest full-size set after discarding one drawn card
    var b = null;
    for (var i = 0; i < h4.length; i++) { var c = E.combo(without(h4, i)); if (c && (!b || c.s > b.s)) b = c; }
    return b;
  }
  function runPair(a, b, size) { var runs = size === 4 ? [[1, 2, 3, 4], [6, 7, 8, 9]] : RUNS; for (var r = 0; r < runs.length; r++) if (runs[r].indexOf(a) >= 0 && runs[r].indexOf(b) >= 0 && a !== b) return true; return false; }
  function structure(h) {
    var s = 0;
    for (var i = 0; i < h.length; i++) for (var j = i + 1; j < h.length; j++) { if (h[i] === h[j]) s += 1; else if (runPair(h[i], h[j], h.length)) s += Math.abs(h[i] - h[j]) === 1 ? 0.8 : 0.5; }
    return s;
  }
  // a set: 10 + its strength; otherwise the chance that one more card completes a set (and a little for shape)
  function val(ctx, h) {
    var k = key(h);
    if (ctx.mv[k] !== undefined) return ctx.mv[k];
    var c = E.combo(h), r;
    if (c) r = 10 + setScore(c);
    else {
      var p = 0;
      if (ctx.tot > 0) NUMS.forEach(function (x) { if (ctx.U[x] > 0) { var b = bestSet(h.concat([x])); if (b) p += ctx.U[x] / ctx.tot * (1 + 0.12 * setScore(b)); } });
      r = 6 * p + 0.3 * structure(h);
    }
    ctx.mv[k] = r;
    return r;
  }
  function bestKeep(ctx, h4) {   // { v, i }: best full hand and which drawn/held card goes
    var b = { v: -1, i: 0 };
    for (var i = 0; i < h4.length; i++) { var x = val(ctx, without(h4, i)); if (x > b.v) b = { v: x, i: i }; }
    return b;
  }
  function eDeck(ctx, h3) {   // expected value of drawing blind from the pile and keeping the best 3
    var k = key(h3);
    if (ctx.md[k] !== undefined) return ctx.md[k];
    var e = 0;
    if (ctx.tot > 0) NUMS.forEach(function (x) { if (ctx.U[x] > 0) e += ctx.U[x] / ctx.tot * bestKeep(ctx, h3.concat([x])).v; });
    else e = val(ctx, h3);
    ctx.md[k] = e;
    return e;
  }

  /* ------------------------------------------------------------------ what does someone else hold */
  function enumerate(U, tot, u, cb) {
    var counts = NUMS.map(function (n) { return U[n]; }), den = ncr(tot, u), picked = [];
    if (den <= 0) { if (u === 0) cb([], 1); return; }
    (function rec(i, left, ways) {
      if (left === 0) { cb(picked.slice(), ways / den); return; }
      if (i >= NUMS.length) return;
      for (var m = 0; m <= Math.min(left, counts[i]); m++) {
        for (var a = 0; a < m; a++) picked.push(NUMS[i]);
        rec(i + 1, left - m, ways * ncr(counts[i], m));
        for (var b = 0; b < m; b++) picked.pop();
      }
    })(0, u, 1);
  }
  // how well a hand H explains this player's last move (they threw away d; maybe they took a card in plain sight).
  // rho is how often that player moves without much thought: the evidence is mixed with a random move by that much.
  var BETA = 2.4, BETA_T = 2.4;
  function rhoOf(P) { return P.kind === 'cpu' ? ({ 1: 0.75, 2: 0.25, 3: 0.15 })[P.level] || 0.3 : 0.3; }
  function likelihood(ctx, P, H, rho) {
    var h = P.hist && P.hist.length ? P.hist[P.hist.length - 1] : null;
    if (!h || (H.length !== 3 && H.length !== 4)) return 1;
    var H4 = H.concat([h.d]), vals = [], mx = -1e9, i;
    for (i = 0; i < H4.length; i++) { vals.push(val(ctx, without(H4, i))); if (vals[i] > mx) mx = vals[i]; }
    var z = 0;
    for (i = 0; i < H4.length; i++) z += Math.exp(BETA * (vals[i] - mx));
    var L = (1 - rho) * Math.exp(BETA * (vals[H.length] - mx)) / z + rho / H4.length;
    if (h.src >= 0 && h.n != null) {
      var at = H4.indexOf(h.n);
      if (at < 0) return L * 0.02;
      var prev = without(H4, at), vt = mx, vd = eDeck(ctx, prev);
      L *= (1 - rho) / (1 + Math.exp(-BETA_T * (vt - vd))) + rho * 0.5;
      var cp = E.combo(prev);
      if (cp) L *= (1 - rho) * (cp.k === 'triple' ? 0.25 : 0.55) + rho;   // with a set in hand they would often have tried instead
    }
    return L;
  }
  // { p: chance of holding a set, dist: { strength: chance }, hands: [{ h, w }] }
  function model(ctx, v, j, behave) {
    var P = v.players[j], out = { p: 0, dist: {}, hands: [] };
    if (P.shown) { var c0 = E.combo(P.shown); out.p = c0 ? 1 : 0; if (c0) out.dist[c0.s] = 1; out.hands.push({ h: P.shown.slice(), w: 1 }); return out; }
    var K = P.known.slice(0, v.handSize || 3), u = Math.max(0, Math.min(v.handSize || 3, P.count) - K.length), sum = 0;
    enumerate(ctx.U, ctx.tot, u, function (S, pr) {
      var H = K.concat(S), w = pr;
      if (behave) w *= likelihood(ctx, P, H, rhoOf(P));
      var c = E.combo(H);
      if (P.pass != null && c && c.s > P.pass) w *= 0.1;   // they let a weaker Try pass with this hand?
      if (w <= 0) return;
      sum += w;
      out.hands.push({ h: H, w: w });
      if (c) { out.p += w; out.dist[c.s] = (out.dist[c.s] || 0) + w; }
    });
    if (sum > 0) { out.p /= sum; Object.keys(out.dist).forEach(function (s) { out.dist[s] /= sum; }); out.hands.forEach(function (x) { x.w /= sum; }); }
    // people often sit on a set for a while (to beat someone else's Try, or to improve it): the longer since a
    // fresh hand, the likelier one is being held
    if (P.kind === 'human' && P.since > 1 && out.p < 1) {
      var p2 = out.p + (1 - out.p) * Math.min(0.25, 0.03 * P.since), up = out.p > 0 ? p2 / out.p : 1, down = (1 - p2) / (1 - out.p);
      Object.keys(out.dist).forEach(function (s) { out.dist[s] *= up; });
      out.hands.forEach(function (x) { x.w *= E.combo(x.h) ? up : down; });
      if (out.p === 0) out.p = 0; else out.p = p2;
    }
    return out;
  }
  function pStronger(m, s) { var p = 0; Object.keys(m.dist).forEach(function (k) { if (+k > s) p += m.dist[k]; }); return p; }
  // how much more likely player j is to hold a set if card x lands on top of a pile they can take
  function feedGain(m, x) {
    var g = 0;
    m.hands.forEach(function (o) { if (!E.combo(o.h) && bestSet(o.h.concat([x]))) g += o.w; });
    return g;
  }
  // how likely the others think I hold a set, from what I have done in plain sight (optionally after a move)
  function suspicion(v, known, hist, behave) {
    var me = v.players[v.me], hidden = me.hand.map(function (c) { return c.n; }).slice();
    known.forEach(function (n) { var k = hidden.indexOf(n); if (k >= 0) hidden.splice(k, 1); });
    var ctx = ctxOf(poolOf(v, hidden));
    var fake = { known: known, count: v.handSize || 3, hist: hist, pass: me.pass, kind: 'human' };
    var vv = { players: v.players.slice(), handSize: v.handSize || 3 };
    vv.players[v.me] = fake;
    return model(ctx, vv, v.me, behave).p;
  }

  /* ------------------------------------------------------------------ helpers */
  function others(v) { var o = []; for (var i = 0; i < v.n; i++) if (i !== v.me) o.push(i); return o; }
  function myNums(v) { return v.players[v.me].hand.map(function (c) { return c.n; }); }
  function pickSoft(opts, noise, rnd) {   // highest score, or a noisy pick for the weaker CPUs
    if (!noise) { var b = opts[0]; opts.forEach(function (o) { if (o.s > b.s) b = o; }); return b; }
    var mx = -1e9; opts.forEach(function (o) { if (o.s > mx) mx = o.s; });
    var ws = opts.map(function (o) { return Math.exp((o.s - mx) / noise); }), z = 0;
    ws.forEach(function (w) { z += w; });
    var r = rnd() * z;
    for (var i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }
  function nextActor(v, after) { return (after + 1) % v.n; }

  /* ------------------------------------------------------------------ my turn */
  function decideTurn(v, level, rnd) {
    var prm = PARAMS[level] || PARAMS[2], me = v.players[v.me], H = myNums(v);
    var ctx = ctxOf(poolOf(v)), opp = others(v), M = {};
    opp.forEach(function (j) { M[j] = model(ctx, v, j, prm.behave); });
    var c = E.combo(H), target = v.target;

    // 1. a set in hand: try now?
    var evTry = -9, pwin = 0;
    if (c) {
      pwin = 1;
      opp.forEach(function (j) { pwin *= 1 - REVEAL * pStronger(M[j], c.s); });
      if (level === 1) { if (rnd() < 0.9) return { t: 'try' }; }
      else {
        var thr = prm.tryWin;
        if (me.pts === target - 1) thr -= 0.1;
        if (prm.signal) { var sus = suspicion(v, me.known, me.hist, true); if (sus > 0.5) thr -= 0.14; if (sus < 0.2) thr += 0.06; }
        opp.forEach(function (j) { if (v.players[j].pts === target - 1 && pStronger(M[j], c.s) > 0.15) thr += 0.08; });
        evTry = pwin - (1 - pwin) * 0.6;
        if (pwin >= thr) {
          // …unless a Jack is clearly better (someone almost surely holds a set that could beat mine)
          var bj = bestJack(v, M, prm, level, rnd);
          if (!(bj && bj.ev > evTry + 0.25)) return { t: 'try' };
          return { t: 'jack', target: bj.j };
        }
      }
    }
    // 2. Jack?
    var jb = bestJack(v, M, prm, level, rnd);
    if (level === 1 && !c && !jb && rnd() < 0.06) {   // a hunch: somebody who just took a card in plain sight
      var sus = opp.filter(function (j) { var h = v.players[j].hist; return h.length && h[h.length - 1].src >= 0; });
      if (sus.length) return { t: 'jack', target: sus[Math.floor(rnd() * sus.length)] };
    }
    if (jb && (level === 1 ? rnd() < prm.jackChance : true)) {
      if (!c || jb.ev > evTry + 0.1) return { t: 'jack', target: jb.j };
    }
    // 3. a set I would not try with: still try when waiting looks worse
    if (c && level > 1) {
      var sus2 = prm.signal ? suspicion(v, me.known, me.hist, true) : 0.35;
      if (pwin >= 0.3 && sus2 > 0.45) return { t: 'try' };
      if (pwin >= 0.25 && c.k === 'run' && c.n <= 4 && rnd() < 0.3) return { t: 'try' };
    }
    // 4. improve the hand: the draw pile or the top of a discard pile
    var opts = [{ a: { t: 'draw' }, s: eDeck(ctx, H) }];
    v.players.forEach(function (P, i) {
      if (!P.pile.length) return;
      var top = P.pile[P.pile.length - 1], H4 = H.concat([top]), bk = bestKeep(ctx, H4), s = bk.v;
      if (bk.i === H.length && i === v.me) s -= 0.4;                 // taking back my own card to throw it away again: a wasted turn
      if (prm.signal) {
        var after = without(H4, bk.i), known2 = me.known.concat([top]);
        var dk = known2.indexOf(H4[bk.i]); if (dk >= 0) known2.splice(dk, 1);
        var sus3 = suspicion(v, known2, me.hist.concat([{ src: i, n: top, d: H4[bk.i] }]), true);
        if (E.combo(after)) s -= 1.2 * sus3;                  // a set everybody can see coming invites a Jack
        else if (sus3 > 0.5 && rnd() < prm.bluff) s += 0.9;   // look dangerous without being dangerous: bait a Jack
      }
      opts.push({ a: { t: 'take', from: i }, s: s });
    });
    return pickSoft(opts, prm.noise, rnd).a;
  }
  function bestJack(v, M, prm, level, rnd) {
    var me = v.players[v.me], target = v.target, best = null;
    Object.keys(M).forEach(function (k) {
      var j = +k, p = M[j].p, P = v.players[j], tau = prm.jackTau;
      if (P.pts === target - 1) tau = Math.min(tau, 0.58);     // a miss hands them the game, a hit stops them
      if (me.pts === target - 1) tau -= 0.08;                    // a hit wins the game
      if (level === 1) tau += (rnd() - 0.5) * 0.2;
      var ev = p - (1 - p) * (P.pts === target - 1 ? 1.4 : 0.8) + (P.pts === target - 1 ? p * 0.6 : 0) + (me.pts === target - 1 ? p * 0.6 : 0);
      if (p >= tau && (!best || ev > best.ev)) best = { j: j, p: p, ev: ev };
    });
    return best;
  }

  /* ------------------------------------------------------------------ after drawing: what to throw away */
  function decideDiscard(v, level, rnd) {
    var prm = PARAMS[level] || PARAMS[2], hand = v.players[v.me].hand, H4 = hand.map(function (c) { return c.n; });
    var ctx = ctxOf(poolOf(v)), nx = nextActor(v, v.me), m = null;
    if (prm.feed && nx !== v.me) m = model(ctx, v, nx, prm.behave);
    var opts = hand.map(function (c, i) {
      var s = val(ctx, without(H4, i));
      if (m) s -= prm.feed * feedGain(m, c.n);
      return { a: { t: 'discard', card: c.id }, s: s };
    });
    return pickSoft(opts, prm.noise, rnd).a;
  }

  /* ------------------------------------------------------------------ someone tried: reveal a stronger set? */
  function decideRespond(v, level, rnd) {
    var H = myNums(v), c = E.combo(H);
    if (!c || !v.tr || c.s <= v.tr.s) return { t: 'respond', reveal: false };
    if (level === 1) return { t: 'respond', reveal: rnd() < 0.92 };
    var prm = PARAMS[level] || PARAMS[2];
    if (!prm.careful) return { t: 'respond', reveal: true };
    var me = v.players[v.me], target = v.target;
    if (me.pts === target - 1 || v.players[v.tr.best].pts === target - 1) return { t: 'respond', reveal: true };
    var ctx = ctxOf(poolOf(v)), pwin = 1;
    v.tr.q.slice(1).forEach(function (j) { pwin *= 1 - REVEAL * pStronger(model(ctx, v, j, prm.behave), c.s); });
    return { t: 'respond', reveal: pwin >= 0.3 };
  }

  /* ------------------------------------------------------------------ the order of a revealed hand on my pile */
  function decideOrder(v, level, rnd) {
    var hand = v.players[v.me].hand.slice();
    if (level === 1 || !v.ord) {
      for (var i = hand.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = hand[i]; hand[i] = hand[j]; hand[j] = t; }
      return { t: 'order', cards: hand.map(function (c) { return c.id; }) };
    }
    var prm = PARAMS[level] || PARAMS[2], ctx = ctxOf(poolOf(v));
    var nx = nextActor(v, v.ord.by);
    if (nx === v.me) nx = nextActor(v, nx);
    var m = nx !== v.me ? model(ctx, v, nx, prm.behave) : null;
    var scored = hand.map(function (c) { return { c: c, g: m ? feedGain(m, c.n) + rnd() * 1e-3 : rnd() }; });
    scored.sort(function (a, b) { return a.g - b.g; });     // least useful to the next player on top
    return { t: 'order', cards: scored.map(function (x) { return x.c.id; }) };
  }

  function decide(v, level, rnd) {
    if (!v || v.phase === 'over' || v.waiting.indexOf(v.me) < 0) return null;
    if (v.phase === 'turn') return decideTurn(v, level, rnd);
    if (v.phase === 'discard') return decideDiscard(v, level, rnd);
    if (v.phase === 'try') return decideRespond(v, level, rnd);
    if (v.phase === 'order') return decideOrder(v, level, rnd);
    return null;
  }

  // used by the page's hint for people: the chance each other player holds a set, as the つよい CPU sees it
  function readTable(v) {
    var ctx = ctxOf(poolOf(v)), out = {};
    others(v).forEach(function (j) { out[j] = model(ctx, v, j, true).p; });
    return out;
  }

  return { LEVEL_NAME: LEVEL_NAME, PARAMS: PARAMS, decide: decide, decideTurn: decideTurn, decideDiscard: decideDiscard, decideRespond: decideRespond, decideOrder: decideOrder, readTable: readTable, _model: model, _pool: poolOf, _ctx: ctxOf, _val: val };
});
