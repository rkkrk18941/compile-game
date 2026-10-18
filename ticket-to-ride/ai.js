/* チケット・トゥ・ライド — the CPU. Plain script (window.TTR_AI) for the page and the CPU worker; needs map.js and
   engine.js. It sees only what its own player may see (engine.viewFor), never the hidden cards or tickets.

   Every turn it plans: the cheapest set of routes that joins the cities of its unfinished tickets (a greedy
   Steiner forest over the free and own routes, a few ticket orders tried), then
     - claims a planned route when the cards are there, sooner when the route is hard to replace or long;
     - otherwise draws the colours the plan still lacks (a face-up locomotive when nothing useful shows);
     - with its tickets done and trains to spare it draws new tickets and keeps those its network reaches cheaply;
     - near the end it spends what is left on the routes that score most.
   Levels: 1 やさしい (plans badly, wastes draws), 2 ふつう, 3 つよい (weighs bottlenecks, the end, the longest path).
   choose(view, level, rng) returns an action for engine.apply (without p). */
(function (root, factory) {
  var M = root && root.TTR_MAP ? root.TTR_MAP : (typeof require === 'function' ? require('./map.js') : null);
  var E = root && root.TTR_ENG ? root.TTR_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(M, E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TTR_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (M, E) {
  'use strict';

  var LOCO = 8, GRAY = 9, DECK = 5, NC = M.cities.length;
  var ROUTES = M.routes, TICKETS = M.tickets, SCORE = M.SCORE;

  /* city pairs: one entry per pair with its lanes */
  var PAIRS = [], pairOf = [];
  (function () {
    var at = {};
    ROUTES.forEach(function (r) {
      var key = r.a + '-' + r.b;
      if (at[key] == null) { at[key] = PAIRS.length; PAIRS.push({ i: PAIRS.length, a: r.a, b: r.b, len: r.len, lanes: [] }); }
      PAIRS[at[key]].lanes.push(r.i);
      pairOf[r.i] = at[key];
    });
  })();
  var pairsByCity = M.cities.map(function () { return []; });
  PAIRS.forEach(function (p) { pairsByCity[p.a].push(p.i); pairsByCity[p.b].push(p.i); });

  /* ------------------------------------------------------------------ what the board offers this player */
  function laneOpen(v, me, r) {
    var R = ROUTES[r];
    if (v.owner[r] >= 0) return false;
    if (R.twin >= 0) { var o = v.owner[R.twin]; if (o === me) return false; if (o >= 0 && v.n <= 3) return false; }
    return true;
  }
  function pairState(v, me) {   // per pair: 2 = mine, 1 = open (lanes listed), 0 = gone
    return PAIRS.map(function (P) {
      var mine = P.lanes.some(function (r) { return v.owner[r] === me; });
      if (mine) return { st: 2, open: [] };
      var open = P.lanes.filter(function (r) { return laneOpen(v, me, r); });
      return { st: open.length ? 1 : 0, open: open };
    });
  }
  /* how others threaten a pair: an open pair with a single usable lane is easy to lose */
  function dijkstra(ps, from, cost) {
    var d = new Array(NC).fill(Infinity), via = new Array(NC).fill(-1), done = new Array(NC).fill(false);
    d[from] = 0;
    for (;;) {
      var u = -1;
      for (var i = 0; i < NC; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      var list = pairsByCity[u];
      for (var j = 0; j < list.length; j++) {
        var pi = list[j], P = PAIRS[pi], w = cost(pi);
        if (w === Infinity) continue;
        var x = P.a === u ? P.b : P.a;
        if (d[u] + w < d[x]) { d[x] = d[u] + w; via[x] = pi; }
      }
    }
    return { d: d, via: via };
  }
  function pathPairs(res, from, to) {
    var out = [], x = to;
    while (x !== from && res.via[x] >= 0) { var P = PAIRS[res.via[x]]; out.push(P.i); x = P.a === x ? P.b : P.a; }
    return out;
  }
  /* the cheapest set of pairs to build that joins every ticket (greedy, several ticket orders) */
  function plan(v, me, ps, tix, opt) {
    opt = opt || {};
    var extra = opt.extra || function () { return 0; };
    var todo = tix.filter(function (t) { return !E.connected(v.pl[me].routes, TICKETS[t].a, TICKETS[t].b); });
    if (!todo.length) return { cost: 0, pairs: [], todo: [], fail: [] };
    var orders = [todo.slice().sort(function (a, b) { return TICKETS[b].pts - TICKETS[a].pts; })];
    orders.push(todo.slice().sort(function (a, b) { return TICKETS[a].pts - TICKETS[b].pts; }));
    if (todo.length <= 4) { for (var k = 0; k < todo.length; k++) orders.push(todo.slice(k).concat(todo.slice(0, k))); }
    var best = null;
    orders.forEach(function (ord) {
      var chosen = {}, cost = 0, fail = [];
      ord.forEach(function (t) {
        var T = TICKETS[t];
        var res = dijkstra(ps, T.a, function (pi) {
          var s = ps[pi];
          if (s.st === 2 || chosen[pi]) return 0;
          if (s.st === 0) return Infinity;
          return PAIRS[pi].len + extra(pi);
        });
        if (res.d[T.b] === Infinity) { fail.push(t); return; }
        pathPairs(res, T.a, T.b).forEach(function (pi) { if (ps[pi].st === 1 && !chosen[pi]) { chosen[pi] = true; cost += PAIRS[pi].len; } });
      });
      var pairs = Object.keys(chosen).map(Number);
      var score = cost + fail.reduce(function (s2, t) { return s2 + 100 + TICKETS[t].pts; }, 0);
      if (!best || score < best.score) best = { score: score, cost: cost, pairs: pairs, todo: todo, fail: fail };
    });
    return best;
  }

  /* ------------------------------------------------------------------ cards */
  function bestPayment(hand, R, keepCols) {
    var pays = E.payments(hand, R);
    if (!pays.length) return null;
    // fewest locomotives; on gray routes spend the colour least needed elsewhere
    pays.sort(function (a, b) {
      return a.k - b.k || ((keepCols && keepCols[a.c]) || 0) - ((keepCols && keepCols[b.c]) || 0) || hand[b.c] - hand[a.c];
    });
    return pays[0];
  }
  /* the colours the plan still needs, given the hand */
  function wants(v, me, ps, pairs) {
    var hand = v.hand.slice(), w = [0, 0, 0, 0, 0, 0, 0, 0, 0], gray = [];
    var items = pairs.map(function (pi) {
      var P = PAIRS[pi], lanes = ps[pi].open, cols = lanes.map(function (r) { return ROUTES[r].col; });
      return { pi: pi, len: P.len, cols: cols };
    }).sort(function (a, b) { return b.len - a.len; });
    items.forEach(function (it) {
      if (it.cols.indexOf(GRAY) >= 0) { gray.push(it); return; }
      // the colour of the lane this hand is nearest to
      var bestC = it.cols[0], bestHave = -1;
      it.cols.forEach(function (c) { if (hand[c] > bestHave) { bestHave = hand[c]; bestC = c; } });
      var use = Math.min(hand[bestC], it.len);
      hand[bestC] -= use;
      var lack = it.len - use;
      w[bestC] += lack;
      it.col = bestC;
    });
    gray.forEach(function (it) {
      var bestC = 0;
      for (var c = 1; c < 8; c++) if (hand[c] > hand[bestC]) bestC = c;
      var use = Math.min(hand[bestC], it.len);
      hand[bestC] -= use;
      var lack = it.len - use;
      if (lack > 0) { w[bestC] += lack * 0.8; for (var c2 = 0; c2 < 8; c2++) if (c2 !== bestC) w[c2] += lack * 0.08; }
      it.col = bestC;
    });
    return { w: w, items: items.concat(gray) };
  }

  /* ------------------------------------------------------------------ time */
  /* about how many more turns this player gets: the player nearest to running out of trains ends the game */
  function roundsLeft(v) {
    var each = Math.max(1, (v.turns || 0) / v.n), left = Infinity;
    v.pl.forEach(function (Q) {
      var used = 45 - Q.trains;
      var rate = (used + 1.15 * 6) / (each + 6);            // trains a turn, starting from a typical 1.15
      left = Math.min(left, (Q.trains - 2) / Math.max(0.6, rate));
    });
    if (v.endIn >= 0) return v.endIn > 0 ? 1 : 0;
    return Math.max(0, left) + 1;
  }
  /* turns needed to build a plan: draws for the missing cards (two a turn, colours never fit exactly) + claims */
  function turnsFor(cost, pairsN, handN) {
    var missing = Math.max(0, cost - Math.min(handN * 0.75, cost));
    return missing / 2 * 1.35 + pairsN;
  }
  function chance(spare) { return 1 / (1 + Math.exp(-spare / 2.2)); }

  /* ------------------------------------------------------------------ ticket choice */
  function chooseTickets(v, me, level, rng) {
    var offer = v.offer.slice(), min = Math.min(v.keepMin || 1, offer.length), ps = pairState(v, me);
    var held = v.tix.slice(), trains = v.pl[me].trains;
    if (level <= 1) {
      // easy: as few as allowed, picked almost at random (a little toward short ones)
      var c1 = offer.map(function (t) { return { t: t, c: TICKETS[t].pts + rng() * 14 }; }).sort(function (a, b) { return a.c - b.c; });
      var k1 = Math.min(offer.length, min + (rng() < 0.35 ? 1 : 0));
      return c1.slice(0, k1).map(function (x) { return x.t; });
    }
    var hand = v.hand.reduce(function (a, b) { return a + b; }, 0);
    var rounds = v.phase === 'setup' ? 34 / (v.n <= 2 ? 0.95 : v.n === 3 ? 1.0 : 1.1) : roundsLeft(v);
    var best = null;
    for (var mask = 1; mask < (1 << offer.length); mask++) {
      var pick = offer.filter(function (t, i) { return mask & (1 << i); });
      if (pick.length < min) continue;
      var all = held.concat(pick);
      var pl = plan(v, me, ps, all);
      var need = turnsFor(pl.cost, pl.pairs.length, hand);
      var p = pl.cost > trains - 1 ? 0.02 : chance(rounds - need - (level >= 3 ? 2 : 0.5));
      var score = 0;
      all.forEach(function (t) {
        var done = E.connected(v.pl[me].routes, TICKETS[t].a, TICKETS[t].b);
        var pt = done ? 1 : p;
        if (pl.fail.indexOf(t) >= 0) pt = 0;
        score += TICKETS[t].pts * (2 * pt - 1);
      });
      score += pl.cost * 1.5 * p;                           // the routes themselves score too
      if (level === 2) score += (rng() - 0.5) * 3;
      if (!best || score > best.score) best = { score: score, pick: pick };
    }
    return best.pick;
  }

  /* ------------------------------------------------------------------ the turn */
  function cardChoice(v, me, level, rng, need, second) {
    var face = v.face;
    if (level <= 1 && rng() < 0.5) {
      var any = [];
      for (var i0 = 0; i0 < 5; i0++) if (face[i0] >= 0 && face[i0] !== LOCO) any.push(i0);
      if (v.deckN + v.discN > 0) any.push(DECK);
      if (any.length) return any[Math.floor(rng() * any.length)];
    }
    var bestI = -1, bestW = 0;
    for (var i = 0; i < 5; i++) {
      var c = face[i];
      if (c < 0 || c === LOCO) continue;
      var w = need.w[c];
      if (w > bestW + 1e-9) { bestW = w; bestI = i; }
    }
    var deckOk = v.deckN + v.discN > 0;
    var locoAt = face.indexOf(LOCO);
    var totalNeed = need.w.reduce(function (a, b) { return a + b; }, 0);
    if (!second && locoAt >= 0 && level >= 2) {
      // a sure wild card against what a blind draw (or the best face-up colour) is worth
      var useful = 0;
      for (var c2 = 0; c2 < 8; c2++) if (need.w[c2] > 0.5) useful++;
      var pBlind = (useful * 12 + 14) / 110;
      var blindValue = (bestI >= 0 ? 1 + pBlind : 2 * pBlind) * (deckOk ? 1 : 0);
      var locoValue = totalNeed > 0 ? (level >= 3 ? 1.25 : 1.1) : 0.4;
      if (bestW >= 2) blindValue += 0.2;
      if (locoValue > blindValue) return locoAt;
    }
    if (bestI >= 0 && bestW >= 0.5) return bestI;
    if (deckOk) return DECK;
    // no deck: any face-up card that may be taken
    for (var j = 0; j < 5; j++) if (face[j] >= 0 && !(second && face[j] === LOCO)) return j;
    return -1;
  }

  function choose(v, level, rng) {
    level = level || 2;
    rng = rng || Math.random;
    var me = v.me;
    if (v.phase === 'setup' || (v.step && v.step.k === 'tix')) return { t: 'keep', keep: chooseTickets(v, me, level, rng) };
    if (v.phase !== 'play' || v.turn !== me) return null;

    var ps = pairState(v, me);
    var P = v.pl[me];
    var trains = P.trains;
    var others = v.pl.filter(function (Q, q) { return q !== me; });
    var minOther = Math.min.apply(null, others.map(function (Q) { return Q.trains; }));
    var lastTurn = v.endIn > 0;                        // the final round is on: this is my last turn
    var rounds = roundsLeft(v);
    var nearEnd = lastTurn || (level >= 3 ? rounds <= 4 : minOther <= 6) || trains <= 6;

    var pl = plan(v, me, ps, v.tix);
    var need = wants(v, me, ps, pl.pairs);

    if (v.step && v.step.k === 'draw2') {
      var i2 = cardChoice(v, me, level, rng, need, true);
      return { t: 'card', i: i2 < 0 ? DECK : i2 };
    }

    // ---- claims available now
    var keepCols = need.w;
    var options = [];
    for (var r = 0; r < ROUTES.length; r++) {
      if (E.laneBlock({ owner: v.owner, n: v.n, pl: v.pl }, me, r)) continue;
      var R = ROUTES[r];
      if (R.len > trains) continue;
      var pay = bestPayment(v.hand, R, keepCols);
      if (!pay) continue;
      options.push({ r: r, pay: pay, pi: pairOf[r] });
    }
    var inPlan = {};
    pl.pairs.forEach(function (pi) { inPlan[pi] = true; });

    function completes(r) {     // tickets this claim would finish
      var after = P.routes.concat([r]), gain = 0;
      v.tix.forEach(function (t) {
        var T = TICKETS[t];
        if (!E.connected(P.routes, T.a, T.b) && E.connected(after, T.a, T.b)) gain += TICKETS[t].pts * 2;
      });
      return gain;
    }
    // how much more the plan costs without this pair (a bottleneck is worth taking first)
    function criticality(pi) {
      var ps2 = ps.slice(); ps2[pi] = { st: 0, open: [] };
      var alt = plan(v, me, ps2, v.tix);
      return Math.min(30, alt.score - pl.score);
    }
    var lp = level >= 3 ? E.longestPath(P.routes).len : 0;

    var best = null;
    options.forEach(function (o) {
      var R = ROUTES[o.r], s = 0;
      var pts = SCORE[R.len];
      var gain = completes(o.r);
      if (inPlan[o.pi]) {
        s += 6 + R.len * 1.6 + gain * 0.6;
        if (level >= 2) {
          var crit = criticality(o.pi);
          s += crit * (level >= 3 ? 0.9 : 0.5);
          // a pair with one usable lane left is easier to lose
          if (ps[o.pi].open.length === 1 && v.n >= 3) s += 1.5;
        }
      } else {
        // off the plan: only for points (long routes), or at the end
        s += pts * (nearEnd ? 1.2 : 0.35) - (nearEnd ? 0 : 6) + gain;
        if (!nearEnd && pl.pairs.length) s -= 4;
      }
      s -= o.pay.k * (nearEnd ? 0.3 : 1.6);                 // locomotives are precious
      if (level >= 3 && nearEnd) {
        var lp2 = E.longestPath(P.routes.concat([o.r])).len;
        s += (lp2 - lp) * 0.35;
      }
      if (lastTurn) s = pts + gain + 0.01 * R.len;
      if (level <= 1) s = (inPlan[o.pi] ? 7 : 1) + (rng() - 0.5) * 10;
      if (!best || s > best.s) best = { s: s, o: o };
    });

    var planLeft = pl.cost;
    var allDone = !pl.pairs.length && !pl.fail.length;

    // ---- when to claim rather than draw
    if (best) {
      var o = best.o, R2 = ROUTES[o.r];
      var take = false;
      if (lastTurn) take = true;
      else if (inPlan[o.pi]) {
        // claim when it is long, a bottleneck, finishes a ticket, or the hand is big enough already
        take = level <= 1 ? rng() < 0.45 || nearEnd : best.s >= 9 || v.hand.reduce(function (a, b) { return a + b; }, 0) >= 10 || nearEnd;
        if (!take && level >= 2 && rng() < 0.25) take = true;
      } else if (nearEnd) take = best.s > 1;
      else if (allDone && R2.len >= 4 && (trains - R2.len) >= 0) take = level >= 2 ? best.s > 0 : rng() < 0.5;
      if (take) return { t: 'claim', r: o.r, c: o.pay.c, k: o.pay.k };
    }

    // ---- more tickets?
    var wantTickets = allDone && v.tdeckN > 0 && !nearEnd && trains >= 12 && (level >= 3 ? rounds >= 9 : minOther >= 14 && trains >= 16);
    if (level <= 1) wantTickets = allDone && v.tdeckN > 0 && trains >= 14 && rng() < 0.35;
    if (wantTickets) return { t: 'tickets' };

    // ---- draw cards
    var canCards = v.deckN + v.discN > 0 || v.face.some(function (c) { return c >= 0; });
    if (canCards) {
      var i1 = cardChoice(v, me, level, rng, need, false);
      if (i1 >= 0) return { t: 'card', i: i1 };
    }
    // nothing to draw: claim anything at all, else tickets, else pass
    if (best) return { t: 'claim', r: best.o.r, c: best.o.pay.c, k: best.o.pay.k };
    if (v.tdeckN > 0) return { t: 'tickets' };
    return { t: 'pass' };
  }

  return { choose: choose, plan: plan, pairState: pairState, PAIRS: PAIRS, pairOf: pairOf };
});
