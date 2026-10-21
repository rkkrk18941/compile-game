/* ナナフシギ・デュエル — the CPU. It reads the real state but never looks at cards that are face down for it:
   when it imagines the opponent's answer it only lets them take cards that were already face up before its own move.
   Level 1 plays greedily with a lot of noise, level 2 looks one reply ahead on its best ideas, level 3 checks every
   move against the opponent's best reply, level 4 also looks at its answer to their best few replies.
   Level 5 (最強) and 6 (成長する敵) first replace everything a player cannot see — the face-down cards (only their
   backs show), the decks of the coming ages, the shuffle of the token box — with guesses of their own, many times
   over, and search every move, every reply and their own answer in each guess (so they also feel the risk of
   uncovering a good card for the opponent). Level 6 plays with the values it learned after its losses. */
(function (root, factory) {
  var api = factory(root.NFD_ENG || (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NFD_AI = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var T = E.T, CARDS = E.CARDS, WONDERS = E.WONDERS;
  var WONDER_RANK = [8, 7, 6.5, 7.5, 6.5, 7.5, 6.5, 7.5, 8, 8.5, 7, 8];
  var MIL = [0, 0.6, 1.4, 3, 4.5, 6, 9, 13, 20, 40];
  /* the weights of the position value; levels 1–4 use BASE, 最強 the tuned ones, 成長する敵 what it learned */
  var BASE = { coin: 1 / 3, purse: 0.25, mil: 1, milLoss: 1.25, prod: 1, oppProd: 0.8, sci: 1, oppSci: 1.15, tok: 1, won: 0.22 };
  var TUNED = {};
  var GROW_SPACE = {
    coin: { min: 0.15, max: 0.6, step: 0.04, label: 'お金の重み', up: '重く見る', down: '軽く見る' },
    mil: { min: 0.5, max: 2, step: 0.12, label: '軍事の重み', up: '重く見る', down: '軽く見る' },
    milLoss: { min: 0.6, max: 2.2, step: 0.12, label: '軍事で押される怖さ', up: '強める', down: '弱める' },
    prod: { min: 0.4, max: 2, step: 0.12, label: '資源づくりの重み', up: '重く見る', down: '軽く見る' },
    oppProd: { min: 0.3, max: 1.4, step: 0.1, label: '相手の資源づくりへの警戒', up: '強める', down: '弱める' },
    sci: { min: 0.5, max: 2, step: 0.12, label: '科学の重み', up: '重く見る', down: '軽く見る' },
    oppSci: { min: 0.6, max: 2, step: 0.1, label: '相手の科学への警戒', up: '強める', down: '弱める' },
    tok: { min: 0.4, max: 2, step: 0.12, label: '進歩トークンの重み', up: '重く見る', down: '軽く見る' },
    won: { min: 0.06, max: 0.5, step: 0.03, label: '建てる前の不思議への期待', up: '高める', down: '下げる' }
  };
  var W = BASE;
  function weights(p) { var o = {}; for (var k in BASE) o[k] = p && typeof p[k] === 'number' ? p[k] : TUNED[k] != null ? TUNED[k] : BASE[k]; return o; }
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
    v += (st.p[me].coins - st.p[op].coins) * W.coin;
    v += (Math.min(st.p[me].coins, 12) - Math.min(st.p[op].coins, 12)) * W.purse * (1 - g);
    var m = me === 0 ? st.mil : -st.mil, mm = Math.min(9, Math.abs(m));
    v += (m >= 0 ? W.mil : -W.milLoss) * (MIL[mm] + E.milVP(st.mil, m >= 0 ? me : op) * 0.6);
    v += (prodValue(st.p[me], g) - prodValue(st.p[op], g) * W.oppProd) * W.prod;
    v += (sciValue(st, me) - sciValue(st, op) * W.oppSci) * W.sci;
    v += (tokValue(st, me, g) - tokValue(st, op, g)) * W.tok;
    // wonders still to build are a promise; the seventh wonder rule cuts them off
    [me, op].forEach(function (s, i) {
      var left = st.p[s].wonders.filter(function (w) { return w.card < 0; });
      var w = 0;
      left.forEach(function (x) { w += WONDER_RANK[x.w] * W.won * (1 - g * 0.8); });
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

  /* ---------------------------------------------------------------- a fair table
     The state handed to the CPU is the real one. Before any thinking, everything a player at the table cannot see is
     replaced by a guess drawn from what is still unseen: the face-down cards (their backs show whether they are
     guilds), the decks of the ages to come, the second set of wonders in the draft, and the shuffle of the token box
     (whose contents anyone can work out). So no level ever profits from hidden cards. */
  function pickOut(pool, n, rng) {
    var a = pool.slice(), out = [];
    for (var i = 0; i < n && a.length; i++) { var j = Math.floor(rng() * a.length); out.push(a[j]); a.splice(j, 1); }
    return out;
  }
  function fairCopy(st, rng) {
    var c = E.clone(st), seen = {};
    c.p.forEach(function (pl) { pl.cards.forEach(function (id) { seen[id] = 1; }); pl.wonders.forEach(function (w) { if (w.card >= 0) seen[w.card] = 1; }); });
    (c.discard || []).forEach(function (id) { seen[id] = 1; });
    (c.slots || []).forEach(function (s) { if ((s.up || s.taken) && s.card != null) seen[s.card] = 1; });
    var ofAge = function (a) { var r = []; for (var i = 0; i < CARDS.length; i++) if (CARDS[i].age === a && !seen[i]) r.push(i); return r; };
    if (c.phase !== 'draft' && c.age >= 1) {
      var hid = [], hidG = [];
      c.slots.forEach(function (s, i) { if (!s.up && !s.taken) ((s.card != null ? CARDS[s.card].type === 'purple' : s.guild) ? hidG : hid).push(i); });
      var g1 = pickOut(ofAge(c.age), hid.length, rng), g2 = pickOut(ofAge(4), hidG.length, rng);
      hid.forEach(function (i, k) { c.slots[i].card = g1[k]; });
      hidG.forEach(function (i, k) { c.slots[i].card = g2[k]; });
    }
    var decks = {};
    for (var a = Math.max(1, c.age + 1); a <= 3; a++) {
      var d = pickOut(ofAge(a), a === 3 ? 17 : 20, rng);
      if (a === 3) { d = d.concat(pickOut(ofAge(4).filter(function (id) { return !c.slots.some(function (s) { return s.card === id; }); }), 3, rng)); d = pickOut(d, d.length, rng); }
      decks[a] = d;
    }
    c.decks = decks;
    if (c.draft && c.draft.next && c.draft.next.length) {
      var known = {};
      c.draft.pool.forEach(function (w) { known[w] = 1; });
      c.p.forEach(function (pl) { pl.wonders.forEach(function (w) { known[w.w] = 1; }); });
      var rest = []; for (var w = 0; w < WONDERS.length; w++) if (!known[w]) rest.push(w);
      rest = pickOut(rest, rest.length, rng);
      c.draft.next = rest.slice(0, c.draft.next.length);
      c.removedW = rest.slice(c.draft.next.length);
    }
    if (c.boxTok) {
      var used = {};
      (c.boardTok || []).forEach(function (t) { used[t] = 1; });
      c.p.forEach(function (pl) { pl.tok.forEach(function (t) { used[t] = 1; }); });
      var box = []; for (var t = 0; t < 10; t++) if (!used[t]) box.push(t);
      c.boxTok = pickOut(box, Math.min(box.length, c.boxTok.length), rng);
    }
    c.rs = (Math.floor(rng() * 4294967295) >>> 0) || 1;
    return c;
  }

  function choose(st, level, rng, extra) {
    rng = rng || Math.random;
    extra = extra || {};
    level = +level || 2;
    W = level >= 5 ? weights(level >= 6 ? extra.params : null) : BASE;
    try {
      if (level >= 5) return deepChoose(st, level, rng, extra);
      return basicChoose(fairCopy(st, rng), level, rng);
    } finally { W = BASE; }
  }

  /* ---------------------------------------------------------------- 最強 / 成長する敵
     For each of K guesses of the hidden cards: every move of ours; for each, every reply of the opponent (cards our
     move uncovers included); for their M most dangerous replies, our best answer. The values are averaged over the
     guesses. Thinking more (成長する敵) means more guesses and more replies answered. */
  function deepChoose(st, level, rng, extra) {
    var me = seatOf(st), acts = E.actions(st, me);
    if (!acts.length) return null;
    if (acts.length === 1) return acts[0];
    if (st.pend && st.pend.k === 'start') return { k: 'start', who: me };
    if (st.phase === 'draft') {
      var bw = null, bs = -Infinity;
      acts.forEach(function (a) { var s = WONDER_RANK[a.w] + (rng() - 0.5) * 0.3; if (s > bs) { bs = s; bw = a; } });
      return bw;
    }
    var b = level >= 6 ? Math.max(1, Math.min(3, +extra.boost || 1)) : 1;
    var P = { K: Math.round((extra.K || 6) * b), M: Math.round((extra.M || 4) * (1 + (b - 1) * 0.5)) };
    var sum = acts.map(function () { return 0; }), n = 0, t0 = Date.now(), cap = extra.timeMs || 2500 * b;
    for (var k = 0; k < P.K; k++) {
      if (k >= 2 && Date.now() - t0 > cap) break;
      var w = fairCopy(st, rng);
      for (var i = 0; i < acts.length; i++) {
        var c = after(w, me, acts[i]);
        sum[i] += c ? afterMine(c, me, P) : -1e6;
      }
      n++;
    }
    var best = 0, bv = -Infinity;
    for (var j = 0; j < acts.length; j++) { var v = sum[j] / n + rng() * 1e-6; if (v > bv) { bv = v; best = j; } }
    return acts[best];
  }
  function over(c) { return !!c.result || c.phase !== 'play'; }
  /* just after our move: our next move if we play again, else the opponent's reply and our answer */
  function afterMine(c, me, P) {
    if (over(c) || c.pend) return value(c, me);
    if (seatOf(c) === me) {
      var acts = E.actions(c, me), best = -Infinity;
      for (var i = 0; i < acts.length; i++) { var d = after(c, me, acts[i]); if (d) best = Math.max(best, theirBest(d, me)); }
      return best === -Infinity ? value(c, me) : best;
    }
    var opp = seatOf(c), ra = E.actions(c, opp), rep = [];
    for (var j = 0; j < ra.length; j++) { var e = after(c, opp, ra[j]); if (e) rep.push({ d: e, v: value(e, me) }); }
    if (!rep.length) return value(c, me);
    rep.sort(function (x, y) { return x.v - y.v; });
    var worst = Infinity;
    for (var r = 0; r < rep.length && r < P.M; r++) {
      var x = rep[r], v = over(x.d) || x.d.pend ? x.v : seatOf(x.d) === me ? myBest(x.d, me) : theirBest(x.d, me);
      if (v < worst) worst = v;
    }
    return worst;
  }
  function myBest(c, me) {
    var acts = E.actions(c, me), b = -Infinity;
    for (var i = 0; i < acts.length; i++) { var d = after(c, me, acts[i]); if (d) b = Math.max(b, value(d, me)); }
    return b === -Infinity ? value(c, me) : b;
  }
  function theirBest(c, me) {
    if (over(c) || c.pend) return value(c, me);
    var s = seatOf(c);
    if (s === me) return myBest(c, me);
    var acts = E.actions(c, s), b = Infinity;
    for (var i = 0; i < acts.length; i++) { var d = after(c, s, acts[i]); if (d) b = Math.min(b, value(d, me)); }
    return b === Infinity ? value(c, me) : b;
  }

  /* ---------------------------------------------------------------- practice games for the learning rival
     A whole game between two sets of values, both played at level 3 (quick), on the same deal with seats swapped. */
  function practice(a, b, seed, swap, lv) {
    var st = E.newGame(seed >>> 0, { first: 0 }), rng = E.mulberry32((seed ^ 0x5bd1e995) >>> 0);
    var vals = swap ? [weights(b), weights(a)] : [weights(a), weights(b)], guard = 0;
    while (!st.result && st.phase !== 'over' && guard++ < 400) {
      var s = seatOf(st);
      W = vals[s];
      var x;
      try { x = basicChoose(fairCopy(st, rng), lv || 3, rng); } finally { W = BASE; }
      if (!x || !E.apply(st, s, x).ok) { var al = E.actions(st, s); if (!al.length) break; E.apply(st, s, al[0]); }
    }
    var win = st.result ? st.result.winner : -1, aSeat = swap ? 1 : 0;
    return win === -1 ? 0.5 : win === aSeat ? 1 : 0;
  }

  function basicChoose(st, level, rng) {
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

  function growBase() { return weights(null); }
  return { choose: choose, value: value, practice: practice, fairCopy: fairCopy, GROW_SPACE: GROW_SPACE, GROW_BASE: weights(null), growBase: growBase, BASE: BASE };
});
