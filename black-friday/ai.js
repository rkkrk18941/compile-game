/* ブラックフライデー — the M.I.B.S. and the CPU players. Plain script (window.BF_AI) and CommonJS for node.

   mibsAction(view)          the M.I.B.S. ("minimally intelligent broker service") exactly as its rules describe it
   choose(view, level, rng)  a CPU player: level 1 easy, 2 normal, 3 strong, 4 strongest
   randomAction(view, rng)   any legal action (tests)

   Every function works on a view (engine.viewFor), so a CPU only knows what its seat may know: its own screen,
   the M.I.B.S.'s open assets, the public record of what others bought and sold, and the bag's size and black count.
   The strong levels look ahead by sampling the hidden part (the other screens and the bag's colours) and playing
   the game on with the real engine. */
(function (root, factory) {
  var E = root && root.BF_ENG ? root.BF_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BF_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  var NC = E.NC;

  function priceOf(v, c) { return E.cellPrice(v.price[c]); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function zeros(k) { var a = []; for (var i = 0; i < k; i++) a.push(0); return a; }
  /* pick the best of `list` by a chain of keys: each key is [fn, dir] with dir +1 = larger first, -1 = smaller first;
     the colour order (purple, yellow, green, blue, white) breaks any tie that is left */
  function best(list, keys) {
    var arr = list.slice();
    arr.sort(function (a, b) {
      for (var i = 0; i < keys.length; i++) {
        var fa = keys[i][0](a), fb = keys[i][0](b);
        if (fa !== fb) return keys[i][1] > 0 ? fb - fa : fa - fb;
      }
      return a - b;
    });
    return arr[0];
  }

  /* ================================================================== the M.I.B.S. */
  /* its cheapest `limit` shares, in its buying order: the cheapest colour, ties to the colour it owns fewer of */
  function mibsShareOrder(v, me) {
    var cols = [0, 1, 2, 3, 4];
    cols.sort(function (a, b) {
      var pa = priceOf(v, a), pb = priceOf(v, b);
      if (pa !== pb) return pa - pb;
      if (me.sh[a] !== me.sh[b]) return me.sh[a] - me.sh[b];
      return a - b;
    });
    return cols;
  }
  function mibsSharePlan(v, me, limit, cash) {
    var n = zeros(NC), left = limit, cost = 0, order = mibsShareOrder(v, me);
    for (var i = 0; i < order.length && left > 0; i++) {
      var c = order[i], p = priceOf(v, c);
      var room = Math.min(left, v.market[c]), take = room;
      if (cash != null) take = Math.min(take, Math.floor((cash - cost) / p));
      if (take > 0) { n[c] += take; left -= take; cost += take * p; }
      if (take < room) break;                     // out of cash: every colour after this one costs at least as much
    }
    return { n: n, cost: cost, full: left === 0 };
  }
  /* the share it puts on a purchase track */
  function mibsPlace(v, me, bought, shAfter) {
    var after = v.market.map(function (m, c) { return m - (bought ? bought[c] : 0); });
    var cand = [];
    if (bought) for (var c = 0; c < NC; c++) if (bought[c] > 0 && after[c] >= 1) cand.push(c);
    if (!cand.length) for (c = 0; c < NC; c++) if (after[c] >= 1) cand.push(c);
    if (!cand.length) return null;
    var owned = cand.filter(function (x) { return shAfter[x] > 0; });
    if (owned.length) {
      return best(owned, [[function (x) { return shAfter[x]; }, 1], [function (x) { return priceOf(v, x); }, 1], [function (x) { return after[x]; }, -1]]);
    }
    return best(cand, [[function (x) { return priceOf(v, x); }, -1], [function (x) { return after[x]; }, 1]]);
  }
  /* the share it takes from the sale track after selling `sold` */
  function mibsRemove(v, me, sold, shAfter) {
    var t = v.sale.tracks[v.sale.cur].c;
    var market = v.market.map(function (m, c) { return m + sold[c]; });
    var cand = [];
    for (var c = 0; c < NC; c++) if (sold[c] > 0 && t[c] >= 1) cand.push(c);
    if (cand.length) {
      return best(cand, [[function (x) { return shAfter[x]; }, -1], [function (x) { return priceOf(v, x); }, -1], [function (x) { return market[x]; }, 1]]);
    }
    var any = [];
    for (c = 0; c < NC; c++) if (t[c] >= 1) any.push(c);
    if (!any.length) return null;
    return best(any, [[function (x) { return priceOf(v, x); }, 1], [function (x) { return market[x]; }, -1]]);
  }
  function mibsAction(v) {
    var me = v.players[v.turn], lv = E.LEVELS[v.level], gp = E.GOLD_TRACK[v.gold];
    var shares = mibsSharePlan(v, me, lv.s, null);
    var shareTotal = shares.full ? shares.cost : Infinity;
    var goldTotal = lv.g * gp;
    var offer = shareTotal <= goldTotal ? 'shares' : 'gold';
    var cheaper = Math.min(shareTotal, goldTotal);
    var shAfter;
    if (me.cash >= cheaper) {
      if (offer === 'shares') {
        shAfter = me.sh.map(function (x, c) { return x + shares.n[c]; });
        return { t: 'buy', n: shares.n, place: mibsPlace(v, me, shares.n, shAfter) };
      }
      return { t: 'gold', k: lv.g, place: mibsPlace(v, me, null, me.sh) };
    }
    if (sum(me.sh) > 0) {
      // sell the limit, most expensive colour first (ties: the colour it owns more of)
      var cols = [0, 1, 2, 3, 4].filter(function (c) { return me.sh[c] > 0; });
      cols.sort(function (a, b) {
        var pa = priceOf(v, a), pb = priceOf(v, b);
        if (pa !== pb) return pb - pa;
        if (me.sh[a] !== me.sh[b]) return me.sh[b] - me.sh[a];
        return a - b;
      });
      var n = zeros(NC), left = lv.s;
      cols.forEach(function (c) { var k = Math.min(left, me.sh[c]); n[c] = k; left -= k; });
      shAfter = me.sh.map(function (x, c) { return x - n[c]; });
      return { t: 'sell', n: n, remove: mibsRemove(v, me, n, shAfter) };
    }
    // all shares sold: as much as it can afford of the cheaper offer
    if (offer === 'shares') {
      var part = mibsSharePlan(v, me, lv.s, me.cash);
      if (sum(part.n) > 0) {
        shAfter = me.sh.map(function (x, c) { return x + part.n[c]; });
        return { t: 'buy', n: part.n, place: mibsPlace(v, me, part.n, shAfter) };
      }
    } else {
      var k = Math.min(lv.g, Math.floor(me.cash / gp));
      if (k > 0) return { t: 'gold', k: k, place: mibsPlace(v, me, null, me.sh) };
    }
    // not even that: it only manipulates the market, putting its pick on the gold purchase track
    var avail = [];
    for (var c = 0; c < NC; c++) if (v.market[c] >= 1) avail.push(c);
    var pick = avail.length ? best(avail, [[function (x) { return priceOf(v, x); }, -1], [function (x) { return v.market[x]; }, 1]]) : null;
    return { t: 'gold', k: 0, place: pick };
  }

  /* ================================================================== helpers for every CPU */
  function placeChoicesV(v, n) {
    var after = v.market.map(function (m, c) { return m - (n ? n[c] : 0); }), bought = [], any = [];
    for (var c = 0; c < NC; c++) if (after[c] >= 1) { any.push(c); if (n && n[c] > 0) bought.push(c); }
    return bought.length ? bought : any;
  }
  function removeChoicesV(v, n) {
    var t = v.sale.tracks[v.sale.cur].c, sold = [], any = [];
    for (var c = 0; c < NC; c++) if (t[c] >= 1) { any.push(c); if (n && n[c] > 0) sold.push(c); }
    return sold.length ? sold : any;
  }
  function pick(arr, rng) { return arr.length ? arr[Math.floor(rng() * arr.length)] : null; }

  /* any legal action, with a slight bias towards doing something */
  function randomAction(v, rng) {
    var me = v.players[v.turn], lv = E.LEVELS[v.level], gp = E.GOLD_TRACK[v.gold];
    var bonus = me.tile > 0 && !me.tileUsed;
    if (v.step === 'post') {
      if (rng() < 0.5) return { t: 'end' };
      var tr = pick(['buy', 'gold', 'sale'], rng);
      var cs = [];
      for (var c = 0; c < NC; c++) if (tr === 'sale' ? v.sale.tracks[v.sale.cur].c[c] > 0 : v.market[c] > 0) cs.push(c);
      if (!cs.length) return { t: 'end' };
      return { t: 'bonus', track: tr, c: pick(cs, rng) };
    }
    if (bonus && me.tile >= 2 && rng() < 0.08) {
      var tr2 = pick(['buy', 'gold', 'sale'], rng), cs2 = [];
      for (c = 0; c < NC; c++) if (tr2 === 'sale' ? v.sale.tracks[v.sale.cur].c[c] > 0 : v.market[c] > 0) cs2.push(c);
      if (cs2.length) return { t: 'bonus', track: tr2, c: pick(cs2, rng) };
    }
    var then = bonus && rng() < 0.1;
    var r = rng();
    if (r < 0.4) {
      var max = lv.s + (bonus && me.tile >= 5 ? 1 : 0), n = zeros(NC), cash = me.cash, want = Math.floor(rng() * (max + 1));
      for (var i = 0; i < want; i++) {
        var opts = [];
        for (c = 0; c < NC; c++) if (v.market[c] - n[c] > 0 && E.cellPrice(v.price[c]) <= cash) opts.push(c);
        var x = pick(opts, rng);
        if (x == null) break;
        n[x]++; cash -= E.cellPrice(v.price[x]);
      }
      return { t: 'buy', n: n, place: pick(placeChoicesV(v, n), rng), then: then };
    }
    if (r < 0.7 && sum(me.sh) > 0) {
      var maxS = lv.s + (bonus && me.tile >= 3 ? 1 : 0), ns = zeros(NC), wantS = 1 + Math.floor(rng() * maxS);
      for (i = 0; i < wantS; i++) {
        var own = [];
        for (c = 0; c < NC; c++) if (me.sh[c] - ns[c] > 0) own.push(c);
        var y = pick(own, rng);
        if (y == null) break;
        ns[y]++;
      }
      return { t: 'sell', n: ns, remove: pick(removeChoicesV(v, ns), rng), then: then };
    }
    var maxG = lv.g + (bonus && me.tile >= 4 ? 1 : 0);
    var k = Math.min(maxG, Math.floor(me.cash / gp));
    k = Math.floor(rng() * (k + 1));
    return { t: 'gold', k: k, place: pick(placeChoicesV(v, null), rng), then: then };
  }

  /* ================================================================== the CPU players */
  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* P(at least two black shares) when d shares are drawn from a bag of N with K black */
  function pTwoBlack(N, K, d) {
    if (K < 2 || d < 2 || N <= 0) return 0;
    d = Math.min(d, N);
    var p0 = 1, i;
    for (i = 0; i < d; i++) p0 *= (N - K - i) / (N - i);
    if (N - K < d) p0 = 0;
    var p1 = 0;
    if (N - K >= d - 1) { p1 = d * K / N; for (i = 0; i < d - 1; i++) p1 *= (N - K - i) / (N - 1 - i); }
    return Math.max(0, Math.min(1, 1 - p0 - p1));
  }
  /* the price ladder: moving up one row is worth about two columns (the board is built that way) */
  function ladderOf(cell) { return 2 * (E.ROWS - 1 - E.cellRow(cell)) + E.cellCol(cell); }
  var LADDER_PRICE = (function () {
    var acc = [], cnt = [];
    for (var cell = 0; cell < E.ROWS * E.COLS; cell++) { var L = ladderOf(cell); acc[L] = (acc[L] || 0) + E.cellPrice(cell); cnt[L] = (cnt[L] || 0) + 1; }
    return acc.map(function (a, L) { return a / cnt[L]; });
  })();
  function ladderPrice(L) {
    if (L <= 0) return LADDER_PRICE[0];
    var top = LADDER_PRICE.length - 1;
    if (L >= top) return LADDER_PRICE[top];
    var i = Math.floor(L), f = L - i;
    return LADDER_PRICE[i] * (1 - f) + LADDER_PRICE[i + 1] * f;
  }

  /* ---------------------------------------------------------------- hidden information: one possible world */
  /* Every colour's 25 shares are somewhere. What the table cannot see is the bag's colours and the starting shares
     still behind other screens; together they are known exactly per colour, only their split is not. */
  function sampleState(v, rng) {
    var me = v.me, five = v.five;
    var hiddenPool = [];
    for (var c = 0; c < NC; c++) {
      var seen = v.market[c] + (five ? 0 : 1);
      v.buyTrack.forEach(function (x) { if (x === c) seen++; });
      v.goldTrack.forEach(function (x) { if (x === c) seen++; });
      v.sale.tracks.forEach(function (t) { seen += t.c[c]; });
      v.players.forEach(function (q) { seen += q.open ? q.sh[c] : q.known[c]; });
      var left = E.PER_COLOR - seen;
      for (var i = 0; i < left; i++) hiddenPool.push(c);
    }
    // shuffle, deal the hidden starting shares, the rest is the bag
    for (var j = hiddenPool.length - 1; j > 0; j--) { var r = Math.floor(rng() * (j + 1)); var t = hiddenPool[j]; hiddenPool[j] = hiddenPool[r]; hiddenPool[r] = t; }
    var players = v.players.map(function (q) {
      var sh = q.open ? q.sh.slice() : q.known.slice();
      if (!q.open) for (var k = 0; k < q.unknown && hiddenPool.length; k++) sh[hiddenPool.pop()]++;
      return {
        cash: q.cash, sh: sh, gold: q.gold, tile: q.tile, tileUsed: q.tileUsed, mibs: q.mibs,
        init: zeros(NC), bought: q.bought.slice(), sold: q.sold.slice(), rev: zeros(NC), spent: { shares: 0, gold: 0 }, earned: 0
      };
    });
    var bag = zeros(NC + 1);
    hiddenPool.forEach(function (x) { bag[x]++; });
    bag[E.BLACK] = v.bagBlack;
    return {
      v: 1, seed: 0, rs: (rng() * 4294967296) >>> 0, n: v.n, five: five, cap: v.cap, saleLeft: v.saleLeft,
      seats: v.seats.map(function (s) { return { nm: s.nm, mibs: s.mibs }; }),
      phase: v.phase, turn: v.turn, step: v.step, turnNo: v.turnNo, pcNo: v.pcNo,
      price: v.price.slice(), gold: v.gold, bought: v.bought, level: v.level, levelBlack: v.levelBlack.slice(),
      market: v.market.slice(), bag: bag, bank: v.bank, box: zeros(NC).map(function () { return five ? 0 : 1; }),
      buyTrack: v.buyTrack.slice(), goldTrack: v.goldTrack.slice(),
      sale: { cur: v.sale.cur, stage: v.sale.stage, tracks: v.sale.tracks.map(function (t) { return { c: t.c.slice(), k: t.k }; }) },
      players: players, hist: [], setup: null, last: null, result: null, quiet: true,
      pub: { bagAtDeal: zeros(NC), flowIn: zeros(NC), flowOut: zeros(NC) }
    };
  }
  function copyState(st) {
    return {
      v: 1, seed: 0, rs: st.rs, n: st.n, five: st.five, cap: st.cap, saleLeft: st.saleLeft, seats: st.seats,
      phase: st.phase, turn: st.turn, step: st.step, turnNo: st.turnNo, pcNo: st.pcNo,
      price: st.price.slice(), gold: st.gold, bought: st.bought, level: st.level, levelBlack: st.levelBlack.slice(),
      market: st.market.slice(), bag: st.bag.slice(), bank: st.bank, box: st.box,
      buyTrack: st.buyTrack.slice(), goldTrack: st.goldTrack.slice(),
      sale: { cur: st.sale.cur, stage: st.sale.stage, tracks: st.sale.tracks.map(function (t) { return { c: t.c.slice(), k: t.k }; }) },
      players: st.players.map(function (q) {
        return { cash: q.cash, sh: q.sh.slice(), gold: q.gold, tile: q.tile, tileUsed: q.tileUsed, mibs: q.mibs, init: q.init, bought: q.bought.slice(), sold: q.sold.slice(), rev: q.rev.slice(), spent: { shares: 0, gold: 0 }, earned: 0 };
      }),
      hist: [], setup: null, last: null, result: null, quiet: true,
      pub: { bagAtDeal: st.pub.bagAtDeal, flowIn: st.pub.flowIn.slice(), flowOut: st.pub.flowOut.slice() }
    };
  }

  /* ---------------------------------------------------------------- reading the market */
  /* how likely each colour is to be drawn soon, relative to the others (1 = average): the bag, plus what the
     purchase tracks and the current sale track will throw into it */
  function pressures(st) {
    var inc = zeros(NC), c;
    st.buyTrack.forEach(function (x) { inc[x] += 1; });
    st.goldTrack.forEach(function (x) { inc[x] += 1; });
    var sale = st.sale.tracks[st.sale.cur].c;
    for (c = 0; c < NC; c++) inc[c] += 0.6 * sale[c];
    var w = [], tot = 0;
    for (c = 0; c < NC; c++) { w[c] = st.bag[c] + 0.55 * inc[c] + 0.3; tot += w[c]; }
    return w.map(function (x) { return x * NC / tot; });
  }
  function riskOf(st) {
    var tot = sum(st.bag), d = Math.min(E.LEVELS[st.level].d, tot);
    return pTwoBlack(tot, st.bag[E.BLACK], d);
  }
  /* a rough guess of how many price changes are still to come */
  function pcLeft(st) {
    var tot = sum(st.bag) || 1, d = Math.min(E.LEVELS[st.level].d, tot);
    var blackPer = d * st.bag[E.BLACK] / tot + 0.35 + 0.08 * st.level;   // more black shares come with the levels
    var goldPer = 0.6 + 0.12 * st.level;
    return Math.max(0.3, (E.GOLD_END - st.gold) / (blackPer + goldPer));
  }
  /* what a share of colour c is likely to fetch when the game is over */
  function shareWorth(st, c, press, left, risk) {
    var L = ladderOf(st.price[c]), drift = 0.9 * (press[c] - 1) * 2.2 - 0.25 * st.level * 0.18;
    var Lend = L + drift * Math.min(left, 4) - (left < 2.5 ? (2.6 - left) * 2.2 : 0) - risk * 3;
    return Math.max(4, ladderPrice(Lend));
  }
  function wealth(st, p, press, left, risk) {
    var q = st.players[p], w = q.cash + q.gold * E.GOLD_VALUE;
    for (var c = 0; c < NC; c++) if (q.sh[c]) w += q.sh[c] * shareWorth(st, c, press, left, risk);
    return w;
  }

  /* ---------------------------------------------------------------- a quick player (the rollouts use it) */
  function bestHeld(st, q, avail) {
    var b = null, bv = -1;
    for (var c = 0; c < NC; c++) if (avail[c] && q.sh[c] > 0) { var val = q.sh[c] * E.cellPrice(st.price[c]); if (val > bv) { bv = val; b = c; } }
    return b;
  }
  function placeFor(st, q, n) {
    var after = st.market.map(function (m, c) { return m - (n ? n[c] : 0); }), c;
    if (n) {
      var bb = null, bv = -1;
      for (c = 0; c < NC; c++) if (n[c] > 0 && after[c] >= 1) { var v1 = (q.sh[c] + n[c]) * E.cellPrice(st.price[c]); if (v1 > bv) { bv = v1; bb = c; } }
      if (bb != null) return bb;
    }
    var avail = after.map(function (x) { return x >= 1; });
    var h = bestHeld(st, q, avail);
    if (h != null) return h;
    var cheap = null;
    for (c = 0; c < NC; c++) if (avail[c] && (cheap == null || E.cellPrice(st.price[c]) < E.cellPrice(st.price[cheap]))) cheap = c;
    return cheap;
  }
  function removeFor(st, q, n) {
    var t = st.sale.tracks[st.sale.cur].c, cand = [], c;
    for (c = 0; c < NC; c++) if (t[c] >= 1 && n && n[c] > 0) cand.push(c);
    if (!cand.length) for (c = 0; c < NC; c++) if (t[c] >= 1) cand.push(c);
    if (!cand.length) return null;
    return best(cand, [[function (x) { return q.sh[x] - (n ? n[x] : 0); }, -1], [function (x) { return E.cellPrice(st.price[x]); }, 1]]);
  }
  function quickAction(st, p, rng, prm) {
    var q = st.players[p];
    if (q.mibs) return mibsAction(st);
    if (st.step === 'post') return { t: 'end' };
    var lv = E.LEVELS[st.level], gp = E.GOLD_TRACK[st.gold], c;
    var bonus = q.tile > 0 && !q.tileUsed ? q.tile : 0;
    var press = pressures(st), risk = riskOf(st), left = pcLeft(st);
    var held = sum(q.sh), maxSell = lv.s + (bonus >= 3 ? 1 : 0), maxBuy = lv.s + (bonus >= 5 ? 1 : 0), maxGold = lv.g + (bonus >= 4 ? 1 : 0);
    var endgame = left < prm.endLeft || risk > prm.endRisk;
    function sellTop() {
      var cols = [];
      for (c = 0; c < NC; c++) if (q.sh[c] > 0) cols.push(c);
      cols.sort(function (a, b) { return E.cellPrice(st.price[b]) * (2 - press[b] * 0.3) - E.cellPrice(st.price[a]) * (2 - press[a] * 0.3); });
      var n = zeros(NC), k = maxSell;
      cols.forEach(function (x) { var m = Math.min(k, q.sh[x]); n[x] = m; k -= m; });
      return { t: 'sell', n: n, remove: removeFor(st, q, n) };
    }
    function goldMax() {
      var k = Math.min(maxGold, Math.floor(q.cash / gp));
      return { t: 'gold', k: k, place: placeFor(st, q, null) };
    }
    if (endgame) {
      if (held > 0 && (rng() < 0.85 || q.cash < gp)) return sellTop();
      if (q.cash >= gp) return goldMax();
      return { t: 'sell', n: zeros(NC), remove: removeFor(st, q, zeros(NC)) };
    }
    // sell a high colour whose prospects look poor
    var sellC = null, sellScore = 0;
    for (c = 0; c < NC; c++) {
      if (!q.sh[c]) continue;
      var pr = E.cellPrice(st.price[c]);
      var s = (pr / prm.sellPrice) * (1.25 - press[c] * 0.35) + risk * 1.5;
      if (s > 1 && s > sellScore) { sellScore = s; sellC = c; }
    }
    if (sellC != null && rng() < 0.8) {
      var ns = zeros(NC); ns[sellC] = Math.min(maxSell, q.sh[sellC]);
      return { t: 'sell', n: ns, remove: removeFor(st, q, ns) };
    }
    // gold while it is cheap enough
    var progress = st.gold / E.GOLD_END;
    var goldLimit = prm.goldBase + prm.goldSlope * Math.max(progress, st.level / 9);
    if (q.cash >= gp * Math.min(2, maxGold) && gp <= goldLimit && rng() < prm.goldProb) return goldMax();
    // shares with good prospects
    var bc = null, bs = 0;
    for (c = 0; c < NC; c++) {
      var p2 = E.cellPrice(st.price[c]);
      if (st.market[c] < 1 || p2 > q.cash) continue;
      var sc = press[c] * (1 - risk) / Math.pow(p2, prm.priceExp) * (1 + 0.15 * q.sh[c]);
      if (sc > bs) { bs = sc; bc = c; }
    }
    if (bc != null && rng() < 0.9) {
      var pb = E.cellPrice(st.price[bc]);
      var kb = Math.min(maxBuy, st.market[bc], Math.floor(q.cash / pb));
      if (kb > 0) {
        var nb = zeros(NC); nb[bc] = kb;
        return { t: 'buy', n: nb, place: placeFor(st, q, nb) };
      }
    }
    if (q.cash >= gp) return goldMax();
    if (held > 0 && rng() < 0.5) return sellTop();
    if (rng() < 0.5) return { t: 'buy', n: zeros(NC), place: placeFor(st, q, null) };
    return { t: 'sell', n: zeros(NC), remove: removeFor(st, q, zeros(NC)) };
  }

  var QUICK = { endLeft: 1.6, endRisk: 0.42, sellPrice: 95, goldBase: 32, goldSlope: 55, goldProb: 0.55, priceExp: 0.55 };

  /* play the world on to the end with quick players; the result for seat `me` */
  function rollout(st, me, rng, prm, cap) {
    var guard = 0;
    while (st.phase === 'play' && guard < cap) {
      var p = st.turn;
      var a = quickAction(st, p, rng, prm);
      var r = E.apply(st, p, a);
      if (!r.ok) {
        r = E.apply(st, p, st.step === 'post' ? { t: 'end' } : { t: 'gold', k: 0, place: E.placeChoices(st, null)[0] });
        if (!r.ok) break;
      }
      guard++;
    }
    var vals = [];
    if (st.phase === 'over') vals = st.result.rows.map(function (r) { return r.total; });
    else { var press = pressures(st), risk = riskOf(st), left = pcLeft(st); for (var i = 0; i < st.n; i++) vals.push(wealth(st, i, press, left, risk)); }
    var mine = vals[me], other = -Infinity;
    for (var j = 0; j < vals.length; j++) if (j !== me && vals[j] > other) other = vals[j];
    return (mine - other) / 100 + (mine > other ? 1 : mine === other ? 0.5 : 0);
  }

  /* ---------------------------------------------------------------- candidate moves */
  function candidates(st, p) {
    var q = st.players[p], lv = E.LEVELS[st.level], gp = E.GOLD_TRACK[st.gold], out = [], c, k;
    var bonus = q.tile > 0 && !q.tileUsed ? q.tile : 0;
    var maxBuy = lv.s + (bonus >= 5 ? 1 : 0), maxSell = lv.s + (bonus >= 3 ? 1 : 0), maxGold = lv.g + (bonus >= 4 ? 1 : 0);
    var placeAll = function (n, t) {
      var ch = E.placeChoices(st, t === 'buy' ? n : null);
      if (!ch.length) out.push(t === 'buy' ? { t: 'buy', n: n, place: null } : { t: 'gold', k: n, place: null });
      ch.forEach(function (x) { out.push(t === 'buy' ? { t: 'buy', n: n, place: x } : { t: 'gold', k: n, place: x }); });
    };
    // buy one colour (1..max), plus the cheapest two colours together
    for (c = 0; c < NC; c++) {
      var pr = E.cellPrice(st.price[c]);
      for (k = 1; k <= Math.min(maxBuy, st.market[c]) && k * pr <= q.cash; k++) {
        if (k !== 1 && k !== Math.min(maxBuy, st.market[c], Math.floor(q.cash / pr)) && k !== 2) continue;
        var n = zeros(NC); n[c] = k;
        var ch = E.placeChoices(st, n);
        if (!ch.length) out.push({ t: 'buy', n: n, place: null });
        else ch.forEach(function (x) { if (x === c || ch.length <= 2 || x === placeFor(st, q, n)) out.push({ t: 'buy', n: n.slice(), place: x }); });
      }
    }
    placeAll(zeros(NC), 'buy');
    // sell: one colour (all up to the limit, or one), or the most valuable mix
    for (c = 0; c < NC; c++) {
      if (!q.sh[c]) continue;
      var ks = [Math.min(maxSell, q.sh[c])];
      if (ks[0] > 1) ks.push(1);
      ks.forEach(function (kk) {
        var ns = zeros(NC); ns[c] = kk;
        E.removeChoices(st, ns).forEach(function (x) { out.push({ t: 'sell', n: ns.slice(), remove: x }); });
      });
    }
    if (sum(q.sh) > 0) {
      var cols = []; for (c = 0; c < NC; c++) if (q.sh[c]) cols.push(c);
      cols.sort(function (a, b) { return E.cellPrice(st.price[b]) - E.cellPrice(st.price[a]); });
      var mix = zeros(NC), left = maxSell;
      cols.forEach(function (x) { var m = Math.min(left, q.sh[x]); mix[x] = m; left -= m; });
      if (cols.filter(function (x) { return mix[x] > 0; }).length > 1) E.removeChoices(st, mix).forEach(function (x) { out.push({ t: 'sell', n: mix.slice(), remove: x }); });
    }
    E.removeChoices(st, zeros(NC)).forEach(function (x) { out.push({ t: 'sell', n: zeros(NC), remove: x }); });
    // gold
    var kmax = Math.min(maxGold, Math.floor(q.cash / gp));
    for (k = kmax; k >= 1; k--) {
      if (k !== kmax && k !== 1 && k !== Math.ceil(kmax / 2)) continue;
      placeAll(k, 'gold');
    }
    placeAll(0, 'gold');
    // the one-time manipulation before the action, when it would set off a price change now
    if (bonus >= 2 && st.step === 'pre') {
      var t = st.sale.tracks[st.sale.cur].c;
      for (c = 0; c < NC; c++) {
        if (st.market[c] > 0 && st.buyTrack.length === st.cap - 1) out.push({ t: 'bonus', track: 'buy', c: c });
        if (st.market[c] > 0 && st.goldTrack.length === st.cap - 1) out.push({ t: 'bonus', track: 'gold', c: c });
        if (t[c] > 0 && sum(t) === st.saleLeft + 1) out.push({ t: 'bonus', track: 'sale', c: c });
      }
    }
    return out;
  }
  function sameAction(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* a quick one-step score: wealth after the move (an immediate price change is sampled a few times) */
  function quickScore(st, p, a, rng, samples) {
    var tot = 0;
    for (var i = 0; i < samples; i++) {
      var s = copyState(st);
      s.rs = (rng() * 4294967296) >>> 0;
      var r = E.apply(s, p, a);
      if (!r.ok) return -Infinity;
      if (s.phase === 'over') {
        var rows = s.result.rows, mine = rows[p].total, other = -Infinity;
        rows.forEach(function (x, j) { if (j !== p && x.total > other) other = x.total; });
        tot += (mine - other) * 0.6 + mine * 0.4;
        continue;
      }
      var press = pressures(s), risk = riskOf(s), left = pcLeft(s);
      var me = wealth(s, p, press, left, risk), best2 = -Infinity;
      for (var j = 0; j < s.n; j++) if (j !== p) best2 = Math.max(best2, wealth(s, j, press, left, risk));
      tot += me - 0.35 * best2;
    }
    return tot / samples;
  }

  var LEVELS_CPU = {
    1: { worlds: 1, samples: 1, keep: 0, rolls: 0, noise: 2.5, careless: 0.3 },        // wins about 3 in 10 against two level-2s
    2: { worlds: 2, samples: 3, keep: 0, rolls: 0, noise: 0.08, careless: 0 },
    3: { worlds: 6, samples: 2, keep: 6, rolls: 6, noise: 0, careless: 0 },
    4: { worlds: 12, samples: 2, keep: 10, rolls: 8, noise: 0, careless: 0 }
  };

  function choose(v, level, rng) {
    rng = rng || Math.random;
    var cfg = LEVELS_CPU[level] || LEVELS_CPU[2];
    var p = v.turn, me = v.players[p];
    if (me.mibs) return mibsAction(v);
    if (v.step === 'post') return { t: 'end' };
    var base = sampleState(v, rng);
    if (cfg.careless && rng() < cfg.careless) return quickAction(base, p, rng, QUICK);
    var cands = candidates(base, p);
    if (!cands.length) return { t: 'gold', k: 0, place: placeChoicesV(v, null)[0] };
    // stage 1: quick scores over a few possible worlds
    var worlds = [base];
    for (var w = 1; w < cfg.worlds; w++) worlds.push(sampleState(v, rng));
    var scored = cands.map(function (a) {
      var s = 0;
      for (var i = 0; i < worlds.length; i++) s += quickScore(worlds[i], p, a, rng, cfg.samples);
      s /= worlds.length;
      if (cfg.noise) s += (rng() - 0.5) * cfg.noise * 100;
      return { a: a, s: s };
    }).filter(function (x) { return isFinite(x.s); });
    scored.sort(function (x, y) { return y.s - x.s; });
    if (!cfg.keep || scored.length <= 1) return scored.length ? scored[0].a : cands[0];
    // stage 2: play the top moves on to the end in every world, with the same luck for each move
    var top = scored.slice(0, cfg.keep), seeds = [];
    for (w = 0; w < worlds.length * cfg.rolls; w++) seeds.push((rng() * 4294967296) >>> 0);
    var bestA = top[0].a, bestV = -Infinity;
    top.forEach(function (x, rank) {
      var total = 0, cnt = 0;
      for (var wi = 0; wi < worlds.length; wi++) {
        for (var r = 0; r < cfg.rolls; r++) {
          var seed = seeds[wi * cfg.rolls + r];
          var s = copyState(worlds[wi]);
          s.rs = seed;
          var res = E.apply(s, p, x.a);
          if (!res.ok) { total = -Infinity; break; }
          total += rollout(s, p, mulberry32(seed ^ 0x9e3779b9), QUICK, 400);
          cnt++;
        }
        if (!isFinite(total)) break;
      }
      var val = cnt ? total / cnt : -Infinity;
      val += 0.002 * (top.length - rank);                          // a hair of trust in the quick score
      if (val > bestV) { bestV = val; bestA = x.a; }
    });
    return bestA;
  }

  return {
    mibsAction: mibsAction, randomAction: randomAction, choose: choose,
    _mibs: { sharePlan: mibsSharePlan, place: mibsPlace, remove: mibsRemove },
    _cpu: { sampleState: sampleState, copyState: copyState, quickAction: quickAction, candidates: candidates, rollout: rollout, pTwoBlack: pTwoBlack, pressures: pressures, riskOf: riskOf, pcLeft: pcLeft, QUICK: QUICK, LEVELS_CPU: LEVELS_CPU, mulberry32: mulberry32, ladderOf: ladderOf, ladderPrice: ladderPrice },
    placeChoicesV: placeChoicesV, removeChoicesV: removeChoicesV
  };
});
