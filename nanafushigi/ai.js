/* ナナフシギ・デュエル — the CPU. It reads the real state but never looks at cards that are face down for it:
   when it imagines the opponent's answer it only lets them take cards that were already face up before its own move.
   Level 1 plays greedily with a lot of noise, level 2 looks one reply ahead on its best ideas, level 3 checks every
   move against the opponent's best reply. */
(function (root, factory) {
  var api = factory(root.NFD_ENG || (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NFD_AI = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var T = E.T, CARDS = E.CARDS, WONDERS = E.WONDERS;
  var WONDER_RANK = [8, 7, 6.5, 7.5, 6.5, 7.5, 6.5, 7.5, 8, 8.5, 7, 8];
  var MIL = [0, 0.6, 1.4, 3, 4.5, 6, 9, 13, 20, 40];
  var SCI_D = [0, 0.4, 1.2, 2.6, 5, 10, 60];

  function progress(st) {
    if (st.phase === 'draft') return 0;
    var taken = 0;
    st.slots.forEach(function (s) { if (s.taken) taken++; });
    return Math.min(1, ((st.age - 1) + taken / Math.max(1, st.slots.length)) / 3);
  }
  function prodValue(pl, g) {
    var pr = E.production(pl), v = 0, early = 1 - g;
    E.RES.forEach(function (k) {
      var n = pr.fixed[k], cap = k === 'G' || k === 'P' ? 2 : 3;
      for (var i = 0; i < Math.min(n, cap); i++) v += (i === 0 ? 2.3 : i === 1 ? 1.4 : 0.6) * early;
    });
    v += pr.choices.length * 1.3 * early;
    v += Object.keys(pr.trade).length * 1.3 * early;
    return v;
  }
  function sciValue(st, seat) {
    var pl = st.p[seat], d = E.distinctSci(pl), v = SCI_D[Math.min(6, d)];
    var n = E.sciCounts(pl), pairs = 0;
    for (var k in n) if (n[k] >= 2) pairs++;
    return v + pairs * 0.4;
  }
  function tokValue(st, seat, g) {
    var pl = st.p[seat], v = 0, unbuilt = pl.wonders.filter(function (w) { return w.card < 0; }).length;
    pl.tok.forEach(function (t) {
      if (t === T.ECON) v += 2.5 * (1 - g) + 0.5;
      if (t === T.ARCH) v += 1.2 * unbuilt;
      if (t === T.THEO) v += 1.4 * unbuilt;
      if (t === T.MASON) v += 2.5 * (1 - g);
      if (t === T.STRAT) v += 3 * (1 - g);
      if (t === T.URBAN) v += 1.5 * (1 - g);
    });
    return v;
  }
  /* how good the position is for `me`, in rough victory points */
  function value(st, me) {
    if (st.result) {
      if (st.result.winner === me) return 10000 - st.turn;
      if (st.result.winner === 1 - me) return -10000 + st.turn;
      return 0;
    }
    var op = 1 - me, g = progress(st), sc = E.score(st);
    var v = (sc[me].total - sc[me].coin - sc[me].mil) - (sc[op].total - sc[op].coin - sc[op].mil);
    v += (st.p[me].coins - st.p[op].coins) / 3;
    v += (Math.min(st.p[me].coins, 12) - Math.min(st.p[op].coins, 12)) * 0.25 * (1 - g);
    var m = me === 0 ? st.mil : -st.mil, mm = Math.min(9, Math.abs(m));
    v += (m >= 0 ? 1 : -1.25) * (MIL[mm] + E.milVP(st.mil, m >= 0 ? me : op) * 0.6);
    v += prodValue(st.p[me], g) - prodValue(st.p[op], g) * 0.8;
    v += sciValue(st, me) - sciValue(st, op) * 1.15;
    v += tokValue(st, me, g) - tokValue(st, op, g);
    // wonders still to build are a promise; the seventh wonder rule cuts them off
    [me, op].forEach(function (s, i) {
      var left = st.p[s].wonders.filter(function (w) { return w.card < 0; });
      var w = 0;
      left.forEach(function (x) { w += WONDER_RANK[x.w] * 0.22 * (1 - g * 0.8); });
      v += i === 0 ? w : -w;
    });
    return v;
  }

  function seatOf(st) { return st.pend ? st.pend.seat : st.active; }
  /* take the pending choices after a move without looking further ahead */
  function settle(st, me, depth) {
    var guard = 0;
    while (st.pend && !st.result && guard++ < 6) {
      var s = st.pend.seat, acts = E.actions(st, s), best = null, bv = -Infinity;
      if (!acts.length) break;
      if (st.pend.k === 'start') { E.apply(st, s, { k: 'start', who: s }); continue; }
      for (var i = 0; i < acts.length; i++) {
        var c = E.clone(st);
        E.apply(c, s, acts[i]);
        if (depth < 2) settle(c, s, depth + 1);
        var x = value(c, s);
        if (x > bv) { bv = x; best = acts[i]; }
      }
      E.apply(st, s, best);
    }
    return st;
  }
  function after(st, seat, a) {
    var c = E.clone(st);
    var r = E.apply(c, seat, a);
    if (!r.ok) return null;
    settle(c, seat, 0);
    return c;
  }
  /* the opponent's best answer among cards that were face up before our move */
  function bestReply(c, known) {
    if (c.result || c.phase !== 'play' || c.pend) return value(c, 1 - seatOf(c)) * -1;
    var opp = c.active, acts = E.actions(c, opp), worst = Infinity, any = false;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.slot != null && !known[a.slot]) continue;
      var d = after(c, opp, a);
      if (!d) continue;
      any = true;
      var v = value(d, opp);
      if (-v < worst) worst = -v;
    }
    return any ? worst : -value(c, opp);
  }

  function choose(st, level, rng) {
    rng = rng || Math.random;
    var me = seatOf(st), acts = E.actions(st, me);
    if (!acts.length) return null;
    if (acts.length === 1) return acts[0];
    if (st.phase === 'draft') {
      var bw = null, bs = -Infinity;
      acts.forEach(function (a) {
        var s = WONDER_RANK[a.w] + (rng() - 0.5) * (level === 1 ? 6 : level === 2 ? 1.5 : 0.6);
        if (s > bs) { bs = s; bw = a; }
      });
      return bw;
    }
    if (st.pend && st.pend.k === 'start') return { k: 'start', who: me };
    var noise = level === 1 ? 4.5 : level === 2 ? 0.9 : 0.15;
    // one-step values
    var scored = acts.map(function (a) {
      var c = after(st, me, a);
      return { a: a, c: c, v: c ? value(c, me) : -Infinity };
    }).filter(function (x) { return x.c; });
    if (level >= 2 && st.phase === 'play' && !st.pend) {
      var known = {};
      st.slots.forEach(function (s, i) { if (s.up) known[i] = true; });
      scored.sort(function (x, y) { return y.v - x.v; });
      var deep = level === 2 ? scored.slice(0, 7) : scored;
      deep.forEach(function (x) {
        if (x.c.result) return;
        // if we play again, our own next move matters more than the reply
        if (x.c.active === me && !x.c.pend && x.c.phase === 'play') x.v = x.v * 0.6 + bestOwn(x.c, me, known) * 0.4;
        else x.v = bestReply(x.c, known);
      });
      if (level === 2) scored.forEach(function (x, i) { if (i >= 7) x.v -= 3; });
      if (level >= 4) {
        // the strongest level also looks at our answer to their best few replies
        scored.sort(function (x, y) { return y.v - x.v; });
        scored.slice(0, 6).forEach(function (x) {
          if (x.c.result || x.c.phase !== 'play' || x.c.pend || x.c.active === me) return;
          x.v = threePly(x.c, me, known);
        });
        scored.forEach(function (x, i) { if (i >= 6) x.v -= 0.5; });
      }
    }
    var best = null, bv = -Infinity;
    scored.forEach(function (x) {
      var v = x.v + (rng() - 0.5) * noise * 2;
      if (v > bv) { bv = v; best = x.a; }
    });
    return best || acts[0];
  }
  function threePly(c, me, known) {
    var opp = 1 - me, acts = E.actions(c, opp), rep = [];
    acts.forEach(function (a) {
      if (a.slot != null && !known[a.slot]) return;
      var d = after(c, opp, a);
      if (d) rep.push({ d: d, v: value(d, opp) });
    });
    if (!rep.length) return value(c, me);
    rep.sort(function (x, y) { return y.v - x.v; });
    var worst = Infinity;
    rep.slice(0, 5).forEach(function (r) {
      var v = r.d.result || r.d.phase !== 'play' || r.d.pend || r.d.active !== me ? value(r.d, me) : bestOwn(r.d, me, known);
      if (v < worst) worst = v;
    });
    return worst;
  }
  function bestOwn(c, me, known) {
    var acts = E.actions(c, me), b = -Infinity;
    acts.forEach(function (a) {
      if (a.slot != null && !known[a.slot]) return;
      var d = after(c, me, a);
      if (d) b = Math.max(b, value(d, me));
    });
    return b === -Infinity ? value(c, me) : b;
  }

  return { choose: choose, value: value };
});
