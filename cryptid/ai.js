/* クリプティッド — the CPU players. A CPU sees exactly what a person at the table sees: the map, every disc and cube,
   its own clue(s) and a hint if one was taken. It never looks at anyone else's clue.

   It lists every "world" (one clue per player) that fits the pieces on the board and the dealing rules (exactly one
   space fits all clues, every clue is needed, no two clues alike). Each world puts the habitat on one space, which
   gives a probability for every space. Questions are chosen by how much they are expected to narrow that down;
   cubes are placed where they say as little as possible about the CPU's own clue.

   Levels: 1 やさしい (loose questions, careless cubes, searches late), 2 ふつう, 3 つよい (weighs what its own
   penalty cubes give away, places cubes where others already expect nothing, searches earlier). */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./data.js') : root.CRY_DATA, node ? require('./engine.js') : root.CRY_ENG);
  if (node) module.exports = api;
  if (root) root.CRY_AI = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis, function (D, E) {
  'use strict';

  var N = D.N;
  var EXHAUSTIVE = 2500000; // above this many combinations, sample instead of listing every world
  var SAMPLES = 260000;
  var KEEP = 90000;         // worlds kept for question scoring (a uniform sample if there are more)

  function popc(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }

  // mode: 'sheet' (default), 'novice' (only counts cubes as evidence: discs are easy to overlook) or 'deep'
  // (every whole combination of clues, with the dealing rules; far stronger than a person can be)
  function analyze(view, rng, mode) {
    var deep = mode === 'deep', novice = mode === 'novice';
    var masks = E.context(view.spec).masks;
    var hintKey = view.hintShown ? view.hint : null;
    var pool = E.poolFor(view.advanced, hintKey);
    var nS = view.seats.length, me = view.me;
    var mine = me >= 0 ? view.ownerSeats[me] : [];
    var known = mine.map(function (s) { return view.clues[s]; });
    var dH = [], cH = [], s, h;
    for (s = 0; s < nS; s++) { dH.push([]); cH.push([]); }
    for (h = 0; h < N; h++) {
      if (view.cube[h] >= 0) cH[view.cube[h]].push(h);
      view.discs[h].forEach(function (x) { dH[x].push(h); });
    }
    var cand = [];
    for (s = 0; s < nS; s++) {
      if (view.clues[s] >= 0) { cand.push([view.clues[s]]); continue; }
      cand.push(pool.filter(function (i) {
        if (known.indexOf(i) >= 0) return false;
        var a = masks[i].arr, j;
        if (!novice) for (j = 0; j < dH[s].length; j++) if (!a[dH[s][j]]) return false;
        for (j = 0; j < cH[s].length; j++) if (a[cH[s][j]]) return false;
        return true;
      }));
    }
    if (!deep) return sheetModel(view, masks, pool, hintKey, cand, nS, mine);
    // seats in order: known first, then unknown by fewest candidates
    var order = [];
    for (s = 0; s < nS; s++) order.push(s);
    order.sort(function (a, b) { return cand[a].length - cand[b].length; });
    var product = 1;
    order.forEach(function (x) { product *= Math.max(1, cand[x].length); });

    var hc = new Float64Array(N), total = 0;
    var keepClue = new Int16Array(KEEP * nS), keepHab = new Int16Array(KEEP), kept = 0, seen = 0;
    var assign = new Int16Array(nS), m0 = new Uint32Array(4);
    function needed() {
      for (var j = 0; j < nS; j++) {
        var a0 = 0xffffffff, a1 = 0xffffffff, a2 = 0xffffffff, a3 = 0xffffffff;
        for (var q = 0; q < nS; q++) {
          if (q === j) continue;
          var b = masks[assign[q]].bs;
          a0 &= b[0]; a1 &= b[1]; a2 &= b[2]; a3 &= b[3];
        }
        if (popc(a0) + popc(a1) + popc(a2) + popc(a3 & 0xfff) < 2) return false;
      }
      return true;
    }
    function record(hab) {
      hc[hab] += 1; total += 1; seen += 1;
      var slot = -1;
      if (kept < KEEP) slot = kept++;
      else { var r = Math.floor(rng() * seen); if (r < KEEP) slot = r; }
      if (slot >= 0) { keepHab[slot] = hab; for (var q = 0; q < nS; q++) keepClue[slot * nS + q] = assign[q]; }
    }
    function habOf(w0, w1, w2, w3) {
      if (w0) return 31 - Math.clz32(w0 & -w0);
      if (w1) return 32 + 31 - Math.clz32(w1 & -w1);
      if (w2) return 64 + 31 - Math.clz32(w2 & -w2);
      return 96 + 31 - Math.clz32(w3 & -w3);
    }
    var sampled = product > EXHAUSTIVE;
    if (!sampled) {
      var used = {};
      (function dfs(d, w0, w1, w2, w3, cnt) {
        if (d === nS) {
          if (cnt === 1 && needed()) record(habOf(w0, w1, w2, w3));
          return;
        }
        var st = order[d], cs = cand[st];
        for (var k = 0; k < cs.length; k++) {
          var c = cs[k];
          if (used[c]) continue;
          var b = masks[c].bs;
          var x0 = w0 & b[0], x1 = w1 & b[1], x2 = w2 & b[2], x3 = w3 & b[3];
          var n = popc(x0) + popc(x1) + popc(x2) + popc(x3);
          if (n === 0) continue;
          if (n === cnt) continue;              // this clue would not be needed
          if (n === 1 && d < nS - 1) continue;  // unique too early: a later clue would not be needed
          assign[st] = c; used[c] = 1;
          dfs(d + 1, x0, x1, x2, x3, n);
          used[c] = 0;
        }
      })(0, E.ALL[0], E.ALL[1], E.ALL[2], E.ALL[3], N);
    } else {
      for (var t = 0; t < SAMPLES; t++) {
        var w0 = E.ALL[0], w1 = E.ALL[1], w2 = E.ALL[2], w3 = E.ALL[3], ok = true, picked = [];
        for (var d = 0; d < nS && ok; d++) {
          var st2 = order[d], cs2 = cand[st2], c2 = cs2[Math.floor(rng() * cs2.length)];
          if (picked.indexOf(c2) >= 0) { ok = false; break; }
          picked.push(c2); assign[st2] = c2;
          var b2 = masks[c2].bs;
          w0 &= b2[0]; w1 &= b2[1]; w2 &= b2[2]; w3 &= b2[3];
          if (!(w0 | w1 | w2 | w3)) ok = false;
        }
        if (!ok) continue;
        if (popc(w0) + popc(w1) + popc(w2) + popc(w3) !== 1 || !needed()) continue;
        record(habOf(w0, w1, w2, w3));
      }
    }
    var P = new Float64Array(N), Hx = 0;
    if (total > 0) {
      for (h = 0; h < N; h++) if (hc[h] > 0) { P[h] = hc[h] / total; Hx -= P[h] * Math.log2(P[h]); }
    } else {
      // nothing found (only possible when sampling a huge space): fall back to "my clue fits and no cube"
      var cnt0 = 0;
      for (h = 0; h < N; h++) if (view.cube[h] < 0 && mine.every(function (x) { return masks[view.clues[x]].arr[h]; })) { P[h] = 1; cnt0++; }
      for (h = 0; h < N; h++) P[h] /= cnt0 || 1;
      Hx = Math.log2(cnt0 || 1);
    }
    return { deep: true, masks: masks, pool: pool, hintKey: hintKey, cand: cand, nS: nS, P: P, H: Hx, total: total, sampled: sampled,
      worlds: { n: kept, clue: keepClue, hab: keepHab } };
  }

  /* The way a person reasons with a deduction sheet: for every other player, the clues still possible given their
     pieces; a space is as likely as the share of each player's possible clues that allow it (players treated as
     independent, no counting of whole combinations). */
  function fitShare(masks, list, h) {
    if (!list.length) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) n += masks[list[i]].arr[h];
    return n / list.length;
  }
  function sheetP(view, masks, cand, nS, override) {
    var P = new Float64Array(N), T = 0, h, s;
    for (h = 0; h < N; h++) {
      if (view.cube[h] >= 0) continue;
      var w = 1;
      for (s = 0; s < nS && w > 0; s++) w *= fitShare(masks, (override && override[s]) || cand[s], h);
      P[h] = w; T += w;
    }
    var Hx = 0;
    if (T > 0) for (h = 0; h < N; h++) if (P[h] > 0) { P[h] /= T; Hx -= P[h] * Math.log2(P[h]); }
    return { P: P, H: Hx, T: T };
  }
  function sheetModel(view, masks, pool, hintKey, cand, nS, mine) {
    var r = sheetP(view, masks, cand, nS, null);
    return { deep: false, masks: masks, pool: pool, hintKey: hintKey, cand: cand, nS: nS, P: r.P, H: r.H, total: r.T, sampled: false,
      worlds: { n: 0, clue: null, hab: null } };
  }

  function entropyOf(vec, touched) {
    var T = 0, S = 0, i, w;
    for (i = 0; i < touched.length; i++) { w = vec[touched[i]]; if (w > 0) { T += w; S += w * Math.log2(w); } }
    if (T <= 0) return { T: 0, H: 0 };
    return { T: T, H: Math.log2(T) - S / T };
  }

  // share[s][h]: share of seat s's still-possible clues that allow space h
  function shares(an) {
    if (an._share) return an._share;
    var out = [];
    for (var s = 0; s < an.nS; s++) {
      var row = new Float64Array(N), list = an.cand[s];
      if (list.length) for (var i = 0; i < list.length; i++) { var a = an.masks[list[i]].arr; for (var h = 0; h < N; h++) row[h] += a[h]; }
      for (var h2 = 0; h2 < N; h2++) row[h2] = list.length ? row[h2] / list.length : 0;
      out.push(row);
    }
    an._share = out;
    return out;
  }

  // Probability that each other owner's clue(s) all allow each space (used to judge what a cube tells the others).
  function othersPlausible(view, an) {
    if (!an.deep) {
      var sh = shares(an), res = new Float64Array(N);
      for (var p0 = 0; p0 < view.k; p0++) {
        if (p0 === view.me) continue;
        for (var h0 = 0; h0 < N; h0++) { var w0 = 1; view.ownerSeats[p0].forEach(function (s0) { w0 *= sh[s0][h0]; }); res[h0] += w0; }
      }
      return res;
    }
    var nS = an.nS, W = an.worlds, out = new Float64Array(N), me = view.me;
    if (!W.n) return out;
    for (var p = 0; p < view.k; p++) {
      if (p === me) continue;
      var seats = view.ownerSeats[p], fitCount = new Float64Array(N);
      var groups = new Map();
      for (var w = 0; w < W.n; w++) {
        var key = 0;
        for (var j = 0; j < seats.length; j++) key = key * 64 + W.clue[w * nS + seats[j]];
        groups.set(key, (groups.get(key) || 0) + 1);
      }
      groups.forEach(function (cnt, key) {
        var cs = [], kk = key;
        for (var j = seats.length - 1; j >= 0; j--) { cs[j] = kk % 64; kk = Math.floor(kk / 64); }
        for (var h = 0; h < N; h++) {
          var all = true;
          for (var q = 0; q < cs.length; q++) if (!an.masks[cs[q]].arr[h]) { all = false; break; }
          if (all) fitCount[h] += cnt;
        }
      });
      for (var h2 = 0; h2 < N; h2++) out[h2] += fitCount[h2] / W.n;
    }
    return out;
  }

  // Deduction-sheet scoring: an answer narrows the asked player's possible clues; score by how much it is expected
  // to narrow where the habitat can be.
  function scoreQuestionsSheet(view, an) {
    var res = [], nS = an.nS, me = view.me, sh = shares(an), masks = an.masks, h, s, x;
    // product of every seat's share except one, with cubes removed
    var excl = [];
    for (s = 0; s < nS; s++) {
      var row = new Float64Array(N);
      for (h = 0; h < N; h++) {
        if (view.cube[h] >= 0) continue;
        var w = 1;
        for (x = 0; x < nS && w > 0; x++) if (x !== s) w *= sh[x][h];
        row[h] = w;
      }
      excl.push(row);
    }
    function entropy(vals) {
      var T = 0, S = 0;
      for (var i = 0; i < N; i++) { var v = vals[i]; if (v > 0) { T += v; S += v * Math.log2(v); } }
      return T > 0 ? Math.log2(T) - S / T : 0;
    }
    function shareOf(list) {
      var row = new Float64Array(N);
      if (!list.length) return row;
      for (var i = 0; i < list.length; i++) { var a = masks[list[i]].arr; for (var q = 0; q < N; q++) row[q] += a[q]; }
      for (var q2 = 0; q2 < N; q2++) row[q2] /= list.length;
      return row;
    }
    var tmp = new Float64Array(N);
    for (var p = 0; p < view.k; p++) {
      if (p === me) continue;
      var seats = view.ownerSeats[p];
      for (h = 0; h < N; h++) {
        if (view.cube[h] >= 0 || E.ownerHasDisc(view, p, h)) continue;
        var outs = [];
        if (seats.length === 1) {
          s = seats[0];
          var yes = an.cand[s].filter(function (c) { return masks[c].arr[h]; }), no = an.cand[s].filter(function (c) { return !masks[c].arr[h]; });
          var fy = an.cand[s].length ? yes.length / an.cand[s].length : 0;
          [[yes, fy, false], [no, 1 - fy, true]].forEach(function (o) {
            if (o[1] <= 0 || !o[0].length) return;
            var rs = shareOf(o[0]);
            for (var q = 0; q < N; q++) tmp[q] = excl[s][q] * rs[q];
            outs.push({ p: o[1], H: entropy(tmp), isNo: o[2] });
          });
        } else {
          var a = seats[0], b = seats[1];
          var ya = an.cand[a].filter(function (c) { return masks[c].arr[h]; }), na = an.cand[a].filter(function (c) { return !masks[c].arr[h]; });
          var yb = an.cand[b].filter(function (c) { return masks[c].arr[h]; }), nb = an.cand[b].filter(function (c) { return !masks[c].arr[h]; });
          var fa = an.cand[a].length ? ya.length / an.cand[a].length : 0, fb = an.cand[b].length ? yb.length / an.cand[b].length : 0;
          var shA = sh[a], shB = sh[b];
          var cases = [
            { pr: fa * fb, la: ya, lb: yb, isNo: false },
            { pr: (1 - fa) * fb + 0.5 * (1 - fa) * (1 - fb), la: na, lb: null, isNo: true },
            { pr: fa * (1 - fb) + 0.5 * (1 - fa) * (1 - fb), la: null, lb: nb, isNo: true }
          ];
          cases.forEach(function (c) {
            if (c.pr <= 1e-9) return;
            if ((c.la && !c.la.length) || (c.lb && !c.lb.length)) return;
            var ra = c.la ? shareOf(c.la) : shA, rb = c.lb ? shareOf(c.lb) : shB;
            for (var q = 0; q < N; q++) { var base = excl[a][q]; tmp[q] = shB[q] > 0 ? base / shB[q] * ra[q] * rb[q] : 0; }
            // excl[a] already contains shB; when shB is 0 the space is impossible anyway
            outs.push({ p: c.pr, H: entropy(tmp), isNo: c.isNo });
          });
        }
        var Pt = 0, Hexp = 0, pNo = 0;
        outs.forEach(function (o) { Pt += o.p; });
        if (Pt <= 0) continue;
        outs.forEach(function (o) { Hexp += (o.p / Pt) * o.H; if (o.isNo) pNo += o.p / Pt; });
        res.push({ to: p, h: h, gain: an.H - Hexp, pNo: pNo });
      }
    }
    return res;
  }

  // Every question this player may ask, scored by expected information about where the habitat is.
  function scoreQuestions(view, an) {
    if (!an.deep) return scoreQuestionsSheet(view, an);
    var res = [], nS = an.nS, W = an.worlds, me = view.me;
    if (!W.n) return res;
    var vec = new Float64Array(N);
    for (var p = 0; p < view.k; p++) {
      if (p === me) continue;
      var seats = view.ownerSeats[p];
      // group the worlds by this player's clue(s); each group keeps a sparse habitat histogram
      var groups = new Map();
      for (var w = 0; w < W.n; w++) {
        var key = 0;
        for (var j = 0; j < seats.length; j++) key = key * 64 + W.clue[w * nS + seats[j]];
        var g = groups.get(key);
        if (!g) { g = { cs: seats.map(function (s) { return W.clue[w * nS + s]; }), hist: new Map() }; groups.set(key, g); }
        var hb = W.hab[w];
        g.hist.set(hb, (g.hist.get(hb) || 0) + 1);
      }
      var list = [];
      groups.forEach(function (g) { var habs = [], ws = []; g.hist.forEach(function (c, hb) { habs.push(hb); ws.push(c); }); list.push({ cs: g.cs, habs: habs, ws: ws }); });
      for (var h = 0; h < N; h++) {
        if (view.cube[h] >= 0 || E.ownerHasDisc(view, p, h)) continue;
        // outcomes: 0 = disc(s); 1.. = cube of seat index
        var outs = seats.length === 1 ? [[], []] : [[], [], []];
        var acc = outs.map(function () { return { touched: [], v: new Float64Array(N) }; });
        for (var gi = 0; gi < list.length; gi++) {
          var g2 = list[gi], f = g2.cs.map(function (c) { return an.masks[c].arr[h]; });
          var shares;
          if (seats.length === 1) shares = f[0] ? [[0, 1]] : [[1, 1]];
          else if (f[0] && f[1]) shares = [[0, 1]];
          else if (!f[0] && f[1]) shares = [[1, 1]];
          else if (f[0] && !f[1]) shares = [[2, 1]];
          else shares = [[1, 0.5], [2, 0.5]];
          for (var si = 0; si < shares.length; si++) {
            var A = acc[shares[si][0]], m = shares[si][1];
            for (var q = 0; q < g2.habs.length; q++) {
              var hb2 = g2.habs[q];
              if (A.v[hb2] === 0) A.touched.push(hb2);
              A.v[hb2] += g2.ws[q] * m;
            }
          }
        }
        var Ttot = 0, Hexp = 0, pNo = 0;
        var parts = acc.map(function (A) { return entropyOf(A.v, A.touched); });
        parts.forEach(function (pt) { Ttot += pt.T; });
        if (Ttot <= 0) continue;
        parts.forEach(function (pt, oi) { if (pt.T > 0) { Hexp += (pt.T / Ttot) * pt.H; if (oi > 0) pNo += pt.T / Ttot; } });
        var gain = an.H - Hexp;
        res.push({ to: p, h: h, gain: gain, pNo: pNo });
      }
    }
    void vec;
    return res;
  }

  function pickMin(opts, rng) {
    var best = null;
    opts.forEach(function (o) { var sc = o.score + rng() * 1e-6; if (!best || sc < best.sc) best = { o: o, sc: sc }; });
    return best && best.o;
  }

  function myPublic(view, an) {
    var out = {};
    view.ownerSeats[view.me].forEach(function (s) { out[s] = E.publicCandidates(view, s, an.hintKey); });
    return out;
  }
  // share of the clues others still think possible for seat s that a piece on h would rule out
  function elimFrac(an, pub, s, h, isCube) {
    var list = pub[s];
    if (!list || !list.length) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) { var f = an.masks[list[i]].arr[h]; if (isCube ? f : !f) n++; }
    return n / list.length;
  }

  // How each level plays. th / thLate: search once the likeliest space reaches this probability (thLate from round
  // `late` on). pick: share of the best questions chosen from at random. lambda: weight of the cube a "no" answer
  // forces on the asker. beta: weight of how much a cube tells the others about the habitat. loose: cubes and discs
  // placed without care.
  var LEVELS = {
    1: { mode: 'novice', th: 0.8, thLate: 0.62, late: 6, pick: 0.4, lambda: 0, beta: 0, loose: true, lowGain: 0 },
    2: { mode: 'sheet', th: 0.62, thLate: 0.5, late: 4, pick: 0, lambda: 0, beta: 0.2, loose: false, lowGain: 0 },
    3: { mode: 'sheet', th: 0.38, thLate: 0.3, late: 3, pick: 0, lambda: 0, beta: 0.2, loose: false, lowGain: 0.25 }
  };
  function params(level, over) {
    var base = LEVELS[level] || LEVELS[2], out = {};
    for (var k in base) out[k] = base[k];
    if (over) for (var k2 in over) out[k2] = over[k2];
    return out;
  }

  function chooseCube(view, an, P, rng) {
    var opts = [];
    E.legalCubes(view, view.me).forEach(function (c) { c.seats.forEach(function (s) { opts.push({ h: c.h, s: s }); }); });
    if (!opts.length) return null;
    if (P.loose) { var o1 = opts[Math.floor(rng() * opts.length)]; return { t: 'cube', h: o1.h, s: o1.s }; }
    var pub = myPublic(view, an), plaus = P.beta ? othersPlausible(view, an) : null;
    opts.forEach(function (o) { o.score = elimFrac(an, pub, o.s, o.h, true) + (plaus ? P.beta * plaus[o.h] : 0) + rng() * 0.04; });
    var b = pickMin(opts, rng);
    return { t: 'cube', h: b.h, s: b.s };
  }
  function chooseExtraDisc(view, an, P, rng) {
    var p = view.pending, opts = [];
    p.seats.forEach(function (s) { E.legalExtraDiscs(view, s, p.h).forEach(function (h) { opts.push({ h: h, s: s }); }); });
    if (!opts.length) return null;
    if (P.loose) { var o1 = opts[Math.floor(rng() * opts.length)]; return { t: 'disc', h: o1.h, s: o1.s }; }
    var pub = myPublic(view, an);
    opts.forEach(function (o) { o.score = elimFrac(an, pub, o.s, o.h, false) + rng() * 0.05; });
    var b = pickMin(opts, rng);
    return { t: 'disc', h: b.h, s: b.s };
  }
  function chooseColor(view, an, P, rng) {
    var seats = view.ownerSeats[view.me], h = view.pending.h;
    if (P.loose) return { t: 'color', s: seats[Math.floor(rng() * seats.length)] };
    var pub = myPublic(view, an);
    var opts = seats.map(function (s) { return { s: s, score: elimFrac(an, pub, s, h, true) + rng() * 0.05 }; });
    return { t: 'color', s: pickMin(opts, rng).s };
  }

  function chooseTurn(view, an, P, rng) {
    var me = view.me, rounds = view.turn / view.k;
    var best = -1, pmax = 0;
    for (var h = 0; h < N; h++) if (an.P[h] > pmax && E.canSearch(view, me, h)) { pmax = an.P[h]; best = h; }
    var qs = scoreQuestions(view, an).filter(function (q) { return q.gain > 1e-9; });
    var search = function () { return { t: 'search', h: best }; };
    if (best >= 0 && (pmax > 0.999 || !qs.length)) return search();
    var th = rounds >= P.late ? P.thLate : P.th;
    if (best >= 0 && pmax >= th) return search();
    qs.forEach(function (q) { q.score = q.gain - P.lambda * q.pNo + rng() * 1e-4; });
    qs.sort(function (a, b) { return b.score - a.score; });
    if (best >= 0 && P.lowGain && qs.length && qs[0].gain < 0.12 && pmax >= P.lowGain) return search();
    if (!qs.length) return best >= 0 ? search() : null;
    var q = P.pick ? qs[Math.floor(rng() * Math.max(1, Math.ceil(qs.length * P.pick)))] : qs[0];
    return { t: 'question', h: q.h, to: q.to };
  }

  // The move for whatever this player has to do now (view.pending.o === view.me).
  function choose(view, level, rng, over) {
    rng = rng || Math.random;
    var p = view.pending;
    if (!p || p.o !== view.me) return null;
    var P = params(level, over);
    var an = analyze(view, rng, P.mode);
    switch (p.k) {
      case 'setup':
      case 'penalty': return chooseCube(view, an, P, rng);
      case 'extra': return chooseExtraDisc(view, an, P, rng);
      case 'color': return chooseColor(view, an, P, rng);
      case 'turn': return chooseTurn(view, an, P, rng);
    }
    return null;
  }

  // Would this CPU agree to take a hint? Not while it is close to the answer itself.
  function voteHint(view, level, rng) {
    rng = rng || Math.random;
    var rounds = view.turn / view.k;
    if (view.phase !== 'play' || rounds < 2) return false;
    var P = params(level), an = analyze(view, rng, P.mode), pmax = 0;
    for (var h = 0; h < N; h++) if (an.P[h] > pmax) pmax = an.P[h];
    return pmax < P.th * 0.7;
  }

  return { analyze: analyze, choose: choose, voteHint: voteHint, scoreQuestions: scoreQuestions, LEVELS: LEVELS };
});
