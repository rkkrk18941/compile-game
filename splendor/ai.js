/* 宝石の煌めき — CPU players. Browser: window.SPL_AI, worker: self.SPL_AI, node: module.exports.

   Every CPU decides from its own seat's view (E.view): other players' cards reserved from a deck and the order of the
   decks are unknown to it. Search levels fill the unknown cards with random guesses consistent with what is visible.

   evaluate(s, q, P)   how good the table is for seat q: prestige, how soon the best cards can be bought (turns needed
                        from the current bonuses, tokens, gold and the bank), noble progress, engine, tokens.
   greedy              every action, completed with the best returns and noble, scored as own value minus the best rival's.
   search              (かなりつよい) the best greedy candidates are compared by playing the game forward many times
                        with random guesses for the unknown cards; the same guesses are used for every candidate
                        (paired comparisons), and weak candidates are dropped round by round (sequential halving).
   tree                (最強 / 成長する敵) information-set Monte Carlo tree search: a tree of both sides' moves, searched
                        with a fresh guess of the unknown cards each iteration, widened in the order the evaluation likes.

   Levels: 1 よわい  2 ふつう  3 つよい  4 かなりつよい  5 最強  6 成長する敵 (最強 with learned values and more time)
   Measured (tools/splendor-ladder.mjs, paired deals): ふつう 85% vs よわい, つよい 83% vs ふつう, かなりつよい 60-0 vs つよい,
   最強 72.5% vs かなりつよい. */
(function (root) {
  'use strict';
  var E = root.SPL_ENG || (typeof require === 'function' ? require('./engine.js') : null);
  var CARDS = E.CARDS, NOBLES = E.NOBLES, HIDDEN = E.HIDDEN, GOAL = E.GOAL;
  var NC = CARDS.length;
  var CCOST = new Int8Array(NC * 5), CPTS = new Int8Array(NC), CCOL = new Int8Array(NC), CTIER = new Int8Array(NC), CTOT = new Int8Array(NC);
  CARDS.forEach(function (c, i) { for (var k = 0; k < 5; k++) CCOST[i * 5 + k] = c.cost[k]; CPTS[i] = c.pts; CCOL[i] = c.color; CTIER[i] = c.tier; CTOT[i] = c.total; });
  var NREQ = new Int8Array(NOBLES.length * 5);
  NOBLES.forEach(function (n, i) { for (var k = 0; k < 5; k++) NREQ[i * 5 + k] = n.req[k]; });

  /* strategy values, tuned by self-play (tools/splendor-tune.mjs: 1025 candidates tried, 33 kept; the result wins 60.7% of
     games against the hand-set starting values). Every key in SPACE can be learned by the growing rival. */
  var BASE = {
    vp: 1,      // one prestige point
    bv0: 0.4,     // a bonus card early in the game (fades with progress)
    bvD: 0.8,     // a bonus that lowers the cost of the cards worth aiming for
    bvN: 0.45,    // a bonus that brings a noble closer
    disc: 0.7,    // value kept per turn a card still needs (buying it is one turn)
    risk: 0.7,    // a face-up card a rival can buy right now
    resB: 1.05,   // a reserved card is safe from rivals
    p1: 0.6, p2: 0.27, p3: 0.08,          // the three best cards within reach
    nob: 0.52, nobDecay: 0.72, nobC: 0.65, // nobles: weight, per missing bonus, when a rival is nearer
    eng: 1, engFade: 0.8,                // owned bonuses (fading toward the end)
    tk: 0.16, tkx: 0.09, gd: 0.22, cap: 0,    // tokens toward the best cards, other tokens, gold, holding 9+
    clog: 0.2, aBase: 0.6, opp: 0.9, unk: 0.4
  };
  // ranges for tuning and for the growing rival; label is how the rival's learning log names each value
  var SPACE = {
    bv0: { min: 0, max: 1.5, step: 0.05, label: '序盤のボーナスカードの価値' },
    bvD: { min: 0, max: 2, step: 0.05, label: '狙うカードを安くするボーナスの重視' },
    bvN: { min: 0, max: 1.5, step: 0.05, label: '貴族に近づくボーナスの重視' },
    disc: { min: 0.4, max: 0.95, step: 0.02, label: '遠いカードもあきらめない粘り' },
    risk: { min: 0.2, max: 1, step: 0.05, label: '相手も買えるカードを狙う大胆さ' },
    resB: { min: 0.8, max: 1.5, step: 0.05, label: '確保したカードの重視' },
    p1: { min: 0.2, max: 1, step: 0.04, label: 'いちばんの狙いへの集中' },
    p2: { min: 0, max: 0.6, step: 0.03, label: '2番目の狙いの重視' },
    p3: { min: 0, max: 0.4, step: 0.02, label: '3番目の狙いの重視' },
    nob: { min: 0, max: 1, step: 0.04, label: '貴族の重視' },
    nobDecay: { min: 0.3, max: 0.9, step: 0.03, label: '遠い貴族もあきらめない粘り' },
    nobC: { min: 0.2, max: 1, step: 0.05, label: '相手と競る貴族を狙う大胆さ' },
    eng: { min: 0.2, max: 2, step: 0.05, label: 'ボーナス（地力）の重視' },
    engFade: { min: 0, max: 1, step: 0.05, label: '終盤に地力より点を急ぐ度合い' },
    tk: { min: 0, max: 0.4, step: 0.01, label: '狙いに役立つ宝石の重視' },
    tkx: { min: -0.1, max: 0.2, step: 0.01, label: '余分な宝石の価値' },
    gd: { min: 0, max: 0.6, step: 0.02, label: '黄金の重視' },
    cap: { min: 0, max: 0.5, step: 0.02, label: '宝石を9個以上かかえる警戒' },
    clog: { min: 0, max: 1.5, step: 0.05, label: '買えない確保カードの警戒' },
    aBase: { min: 0.1, max: 2, step: 0.1, label: '0点カードも狙う度合い' },
    opp: { min: 0.3, max: 1.2, step: 0.05, label: '相手のじゃまをする度合い' },
    unk: { min: 0, max: 1, step: 0.05, label: '山札から伏せて確保するカードへの期待' }
  };

  /* ---------- evaluation ---------- */
  var TV = new Float64Array(16), TT = new Float64Array(16), TID = new Int16Array(16), TA = new Float64Array(16), TNEED = new Int8Array(16 * 5);
  var DEM = new Float64Array(5), NDEM = new Float64Array(5), BV = new Float64Array(5), SH = new Int8Array(5);

  function nobleRemain(bon, nid) {
    var r = 0, o = nid * 5, x;
    for (var c = 0; c < 5; c++) { x = NREQ[o + c] - bon[c]; if (x > 0) r += x; }
    return r;
  }
  /* turns needed to buy card id from this player's position (1 = can buy now) */
  function turnsFor(p, id, bank, sh) {
    var o = id * 5, bon = p.bon, tok = p.tok, gold = tok[5], needSum = 0, short = 0, c, x;
    for (c = 0; c < 5; c++) {
      x = CCOST[o + c] - bon[c]; if (x < 0) x = 0;
      needSum += x;
      var s = x - tok[c]; if (s < 0) s = 0; sh[c] = s; short += s;
    }
    var missing = short - gold;
    if (missing <= 0) return 1;
    // gold covers the largest shortfalls first
    var g = gold;
    while (g > 0) { var bi = 0, bv = -1; for (c = 0; c < 5; c++) if (sh[c] > bv) { bv = sh[c]; bi = c; } if (bv <= 0) break; sh[bi]--; g--; }
    var turns = Math.ceil(missing / 3);
    for (c = 0; c < 5; c++) {
      if (!sh[c]) continue;
      var b = bank[c], tc;
      if (b >= sh[c] + 2 && b >= 4) tc = Math.ceil(sh[c] / 2);
      else if (b >= sh[c]) tc = sh[c];
      else tc = sh[c] + (sh[c] - b) * 2;     // must wait for others to spend that colour
      if (tc > turns) turns = tc;
    }
    if (needSum > 10) turns += Math.ceil((needSum - 10) * 1.5);
    var held = tok[0] + tok[1] + tok[2] + tok[3] + tok[4] + gold;
    var over = held + missing - 10;
    if (over > 0) turns += Math.ceil(over / 3);
    return turns + 1;
  }

  function canBuyNow(p, id) {
    var o = id * 5, bon = p.bon, tok = p.tok, miss = 0, x;
    for (var c = 0; c < 5; c++) { x = CCOST[o + c] - bon[c] - tok[c]; if (x > 0) miss += x; }
    return miss <= tok[5];
  }

  /* how many turns this seat still plays in a game whose end has been triggered (0 when it will not move again) */
  function movesLeft(s, q) {
    if (!s.fin || s.over) return s.over ? 0 : 99;
    var n = s.n, untilFirst = (s.first - s.cur + n) % n;
    return ((q - s.cur + n) % n) < untilFirst ? 1 : 0;
  }
  /* most prestige seat q can still add in the final round (one purchase, plus a noble it would bring) */
  function finalGain(s, q) {
    if (!movesLeft(s, q)) return 0;
    var p = s.pl[q], best = 0, i, id;
    var cands = [];
    for (i = 0; i < 12; i++) if (s.mk[i] >= 0 && s.mk[i] < HIDDEN) cands.push(s.mk[i]);
    for (i = 0; i < p.res.length; i++) if (p.res[i] < HIDDEN) cands.push(p.res[i]);
    var el = 0;
    for (i = 0; i < s.nb.length; i++) if (nobleRemain(p.bon, s.nb[i]) === 0) el = 3;
    best = el;
    for (i = 0; i < cands.length; i++) {
      id = cands[i];
      if (!canBuyNow(p, id)) continue;
      var g = CPTS[id], nb = el;
      if (!nb) { p.bon[CCOL[id]]++; for (var k = 0; k < s.nb.length; k++) if (nobleRemain(p.bon, s.nb[k]) === 0) { nb = 3; break; } p.bon[CCOL[id]]--; }
      if (g + nb > best) best = g + nb;
    }
    return best;
  }

  function discTable(P) {
    if (P._dt && P._dv === P.disc) return P._dt;
    var t = new Float64Array(64); t[0] = 1; for (var i = 1; i < 64; i++) t[i] = t[i - 1] * P.disc;
    P._dt = t; P._dv = P.disc; return t;
  }
  function evaluate(s, q, P, wantOut) {
    var p = s.pl[q], bon = p.bon, tok = p.tok, n = s.n, i, c, k, id;
    if (s.fin) {
      if (wantOut) for (c = 0; c < 5; c++) wantOut[c] = 0;
      // the race is decided by prestige (then fewer cards); only what can still be bought this round matters
      return 100 * (p.pts + finalGain(s, q)) - p.nc;
    }
    var DT = discTable(P);
    var lead = 0; for (i = 0; i < n; i++) if (s.pl[i].pts > lead) lead = s.pl[i].pts;
    var phase = lead >= GOAL ? 1 : lead / GOAL;
    // targets: the face-up cards and this seat's reserved cards
    var nt = 0;
    for (i = 0; i < 12; i++) { id = s.mk[i]; if (id >= 0 && id < HIDDEN) TID[nt++] = id; }
    var firstRes = nt, unknown = 0;
    for (i = 0; i < p.res.length; i++) { id = p.res[i]; if (id < HIDDEN) TID[nt++] = id; else unknown += P.unk * (id - HIDDEN + 1); }
    // which colours the cards worth aiming for still need, and the turns each card is away
    var sumA = 0;
    for (c = 0; c < 5; c++) { DEM[c] = 0; NDEM[c] = 0; }
    for (k = 0; k < nt; k++) {
      id = TID[k];
      TT[k] = turnsFor(p, id, s.bank, SH);
      var o = id * 5, needSum = 0;
      for (c = 0; c < 5; c++) { var x = CCOST[o + c] - bon[c]; if (x < 0) x = 0; TNEED[k * 5 + c] = x; needSum += x; }
      var a = (CPTS[id] + P.aBase) / (needSum + 1);
      sumA += a;
      for (c = 0; c < 5; c++) if (TNEED[k * 5 + c] > 0) DEM[c] += a;
    }
    var nobV = 0;
    for (i = 0; i < s.nb.length; i++) {
      var nid = s.nb[i], r = nobleRemain(bon, nid), w = r < 64 ? Math.pow(P.nobDecay, r) : 0;
      // a rival nearer to this noble will probably take it first
      for (var j = 0; j < n; j++) if (j !== q && nobleRemain(s.pl[j].bon, nid) < r) { w *= P.nobC; break; }
      nobV += 3 * w;
      for (c = 0; c < 5; c++) if (NREQ[nid * 5 + c] > bon[c]) NDEM[c] += w;
    }
    var inv = sumA > 0 ? 1 / sumA : 0;
    for (c = 0; c < 5; c++) BV[c] = P.bv0 * (1 - phase) + P.bvD * DEM[c] * inv + P.bvN * NDEM[c];
    // the three best cards within reach (a card that can be bought now is still one turn away)
    var r1 = 0, r2 = 0, r3 = 0, i1 = -1, i2 = -1, i3 = -1, clog = 0;
    for (k = 0; k < nt; k++) {
      id = TID[k];
      var reach = (P.vp * CPTS[id] + BV[CCOL[id]]) * DT[TT[k] < 63 ? TT[k] : 63];
      if (k >= firstRes) { reach *= P.resB; if (TT[k] >= 5) clog++; }
      else for (var jj = 0; jj < n; jj++) if (jj !== q && canBuyNow(s.pl[jj], id)) { reach *= P.risk; break; }
      if (reach > r1) { r3 = r2; i3 = i2; r2 = r1; i2 = i1; r1 = reach; i1 = k; }
      else if (reach > r2) { r3 = r2; i3 = i2; r2 = reach; i2 = k; }
      else if (reach > r3) { r3 = reach; i3 = k; }
    }
    if (unknown > r3) { r3 = unknown; i3 = -1; }
    // tokens count fully only toward the best cards; the rest are nearly dead weight
    var useful = 0, held = 0;
    for (c = 0; c < 5; c++) {
      var want = 0;
      if (i1 >= 0 && TNEED[i1 * 5 + c] > want) want = TNEED[i1 * 5 + c];
      if (i2 >= 0 && TNEED[i2 * 5 + c] > want) want = TNEED[i2 * 5 + c];
      if (i3 >= 0 && TNEED[i3 * 5 + c] > want) want = TNEED[i3 * 5 + c];
      useful += tok[c] < want ? tok[c] : want; held += tok[c];
      if (wantOut) wantOut[c] = want;
    }
    var eng = 0; for (c = 0; c < 5; c++) eng += bon[c] < 4 ? bon[c] : 4 + (bon[c] - 4) * 0.25;
    return P.vp * p.pts
      + P.p1 * r1 + P.p2 * r2 + P.p3 * r3
      + P.nob * nobV
      + P.eng * eng * (1 - P.engFade * phase)
      + P.tk * useful + P.tkx * (held - useful) + P.gd * tok[5]
      - (held + tok[5] >= 9 ? P.cap : 0)
      - P.clog * clog;
  }

  /* score of a finished turn for the seat that played it */
  function scoreAfter(s, me, P) {
    if (s.over) {
      var res = E.result(s);
      if (res.winners.indexOf(me) >= 0) return res.winners.length > 1 ? 5000 : 10000;
      return -10000 + 100 * s.pl[me].pts;
    }
    if (s.fin) return finalScore(s, me);
    var mine = evaluate(s, me, P), best = -Infinity;
    for (var q = 0; q < s.n; q++) if (q !== me) { var v = evaluate(s, q, P); if (v > best) best = v; }
    return mine - P.opp * best;
  }
  /* the end is triggered: who wins if everyone still to move buys the best card they can */
  function finalScore(s, me) {
    var myPts = s.pl[me].pts + finalGain(s, me), myNc = s.pl[me].nc, beaten = 0, tied = 0, bestOther = -1;
    for (var q = 0; q < s.n; q++) {
      if (q === me) continue;
      var g = finalGain(s, q), pts = s.pl[q].pts + g, nc = s.pl[q].nc + (g > 0 ? 1 : 0);
      if (pts > bestOther) bestOther = pts;
      if (pts > myPts || (pts === myPts && nc < myNc)) beaten++;
      else if (pts === myPts && nc === myNc) tied++;
    }
    if (beaten) return -9000 + 10 * myPts - 10 * (bestOther - myPts);
    return (tied ? 4000 : 9000) + 10 * (myPts - bestOther);
  }

  /* ---------- completing an action: returns and nobles ---------- */
  function chooseReturns(s, me, P, x) {
    // return one token at a time, each time the one whose loss hurts least
    var p = s.pl[me], ret = [0, 0, 0, 0, 0, 0];
    for (var r = 0; r < x; r++) {
      var bestC = -1, bestV = -Infinity;
      for (var c = 0; c < 6; c++) {
        if (p.tok[c] <= 0) continue;
        p.tok[c]--; s.bank[c]++;
        var v = evaluate(s, me, P);
        p.tok[c]++; s.bank[c]--;
        if (v > bestV) { bestV = v; bestC = c; }
      }
      p.tok[bestC]--; s.bank[bestC]++; ret[bestC]++;
    }
    for (var k = 0; k < 6; k++) { p.tok[k] += ret[k]; s.bank[k] -= ret[k]; }
    return ret;
  }
  var WANTQ = new Int8Array(5);
  function quickReturns(s, me, P, x) {
    var p = s.pl[me], ret = [0, 0, 0, 0, 0, 0], c;
    evaluate(s, me, P, WANTQ);
    for (var r = 0; r < x; r++) {
      var best = -1, bestV = 0;
      for (c = 0; c < 5; c++) { var sur = p.tok[c] - ret[c] - WANTQ[c]; if (sur > bestV) { bestV = sur; best = c; } }
      if (best < 0) { bestV = 0; for (c = 0; c < 5; c++) { var left = p.tok[c] - ret[c]; if (left > bestV) { bestV = left; best = c; } } }
      if (best < 0) best = 5;
      ret[best]++;
    }
    return ret;
  }
  function chooseNoble(s, me, P, el) {
    if (el.length <= 1) return el.length ? el[0] : -1;
    // every noble is 3 prestige: take the one a rival is closest to
    var best = el[0], bestD = Infinity;
    for (var i = 0; i < el.length; i++) {
      var d = Infinity;
      for (var q = 0; q < s.n; q++) if (q !== me) { var r = nobleRemain(s.pl[q].bon, el[i]); if (r < d) d = r; }
      if (d < bestD) { bestD = d; best = el[i]; }
    }
    return best;
  }
  /* applies action a to s (mutating) with the best returns and noble. Returns the full turn object. */
  function complete(s, a, P, fast) {
    var me = s.cur;
    E.act(s, a);
    var x = E.excess(s), ret = x ? (fast ? quickReturns(s, me, P, x) : chooseReturns(s, me, P, x)) : null;
    var nob = chooseNoble(s, me, P, E.eligible(s, me));
    E.finish(s, ret, nob);
    return { a: a, ret: ret, nob: nob };
  }

  /* ---------- greedy ---------- */
  /* taking gems and handing the very same gems back changes nothing: only worth it when nothing else is */
  function noop(turn) {
    if (turn.a.k !== 'take' || !turn.ret) return false;
    var got = [0, 0, 0, 0, 0, 0]; for (var i = 0; i < turn.a.g.length; i++) got[turn.a.g[i]]++;
    for (i = 0; i < 6; i++) if (got[i] !== turn.ret[i]) return false;
    return true;
  }
  function rankActions(s, P, acts) {
    var me = s.cur, out = [];
    for (var i = 0; i < acts.length; i++) {
      var t = E.clone(s, true), turn = complete(t, acts[i], P);
      out.push({ turn: turn, score: scoreAfter(t, me, P) - (noop(turn) ? 0.05 : 0) });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  function greedyTurn(s, P, rng, temp) {
    var acts = E.legal(s);
    if (acts.length === 1) { var t1 = E.clone(s, true); return complete(t1, acts[0], P); }
    var ranked = rankActions(s, P, acts);
    if (!temp) return ranked[0].turn;
    // softmax over scores: higher temperature, more mistakes
    var top = ranked[0].score, sum = 0, w = [];
    for (var i = 0; i < ranked.length; i++) { var e = Math.exp((ranked[i].score - top) / temp); w.push(e); sum += e; }
    var r = rng() * sum;
    for (i = 0; i < ranked.length; i++) { r -= w[i]; if (r <= 0) return ranked[i].turn; }
    return ranked[0].turn;
  }

  /* fast playout move: the same greedy with quick returns, looking only at reservations that usually matter
     (a card worth 3+, a card a rival can buy now, a level III card from the deck) */
  function playoutStep(s, P) {
    var acts = E.legal(s), me = s.cur, best = null, bestS = -Infinity, p = s.pl[me];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.k === 'res' && acts.length > 1) {
        if (a.m != null) {
          var id = s.mk[a.m], keep = CPTS[id] >= 3;
          for (var q = 0; q < s.n && !keep; q++) if (q !== me && canBuyNow(s.pl[q], id)) keep = true;
          if (!keep) continue;
        } else if (a.d !== 2 || p.res.length >= 2) continue;
      }
      var t = E.clone(s, true);
      var turn = complete(t, a, P, true), sc = scoreAfter(t, me, P) - (noop(turn) ? 0.05 : 0);
      if (sc > bestS) { bestS = sc; best = turn; }
    }
    if (!best) { var t2 = E.clone(s, true); best = complete(t2, acts[0], P, true); }
    return best;
  }

  /* reward in [0,1] for seat me at the end of a playout */
  function reward(s, me, P, temp) {
    if (s.over) {
      var res = E.result(s), k = res.winners.indexOf(me);
      if (k >= 0) return 1 / res.winners.length;
      var rank = 0; for (var i = 0; i < res.order.length; i++) if (res.order[i].seat === me) rank = res.order[i].rank;
      return s.n > 2 ? 0.08 * (s.n - rank) / (s.n - 1) : 0;
    }
    // not finished: share of a softmax over the seats' values
    var vs = [], mx = -Infinity;
    for (var q = 0; q < s.n; q++) { var v = evaluate(s, q, P); if (s.fin) v /= 100; vs.push(v); if (v > mx) mx = v; }
    var sum = 0, mine = 0;
    for (q = 0; q < s.n; q++) { var e = Math.exp((vs[q] - mx) / temp); sum += e; if (q === me) mine = e; }
    return mine / sum;
  }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  /* ---------- search ---------- */
  function search(view, P, rng, o) {
    var me = view.cur, acts = E.legal(view);
    var info = { sims: 0, cands: 0 };
    search.lastInfo = info;
    if (acts.length === 1) return complete(E.clone(view, true), acts[0], P);
    // pre-rank with a few guesses of the unknown cards
    var D = o.pre || 3, score = new Float64Array(acts.length), d, i;
    for (d = 0; d < D; d++) {
      var g = E.determinize(view, rng, true);
      for (i = 0; i < acts.length; i++) {
        var t = E.clone(g, true); complete(t, acts[i], P); score[i] += scoreAfter(t, me, P);
      }
    }
    var order = acts.map(function (a, i) { return i; }).sort(function (a, b) { return score[b] - score[a]; });
    var K = Math.min(o.k || 8, acts.length);
    var cand = order.slice(0, K);
    // always look at every purchase of a card with prestige (they decide races) and at reserving a rival's best card
    for (i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (cand.indexOf(i) >= 0) continue;
      if (a.k === 'buy' && cand.length < K + 4) {
        var id = a.m != null ? view.mk[a.m] : view.pl[me].res[a.r];
        if (CPTS[id] > 0) cand.push(i);
      }
    }
    info.cands = cand.length;
    var sum = new Float64Array(acts.length), cnt = new Float64Array(acts.length);
    var alive = cand.slice(), start = now(), budget = o.ms || 1000, horizon = o.h || 16, temp = o.temp || 1.6;
    var rounds = Math.max(1, Math.ceil(Math.log(alive.length) / Math.LN2)), seedBase = (rng() * 4294967296) >>> 0, sim = 0;
    for (var round = 0; round < rounds && alive.length > 1; round++) {
      var until = start + budget * (round + 1) / rounds, minEach = o.minEach || 2, done = 0;
      while ((now() < until || done < minEach) && done < (o.maxEach || 400)) {
        var seed = (seedBase + sim * 2654435761) >>> 0; sim++;
        var base = E.determinize(view, E.mulberry32(seed), true);
        for (var c = 0; c < alive.length; c++) {
          var ai = alive[c], st = E.clone(base, true);
          complete(st, acts[ai], P);
          for (var ply = 0; ply < horizon && !st.over; ply++) {
            var turn = playoutStep(st, P);
            E.act(st, turn.a); E.finish(st, turn.ret, turn.nob);
          }
          sum[ai] += reward(st, me, P, temp); cnt[ai]++;
          info.sims++;
        }
        done++;
        if (o.deadline && now() > o.deadline) break;
      }
      alive.sort(function (a, b) { return sum[b] / cnt[b] - sum[a] / cnt[a]; });
      alive = alive.slice(0, Math.max(1, Math.ceil(alive.length / 2)));
    }
    var best = alive[0];
    info.mean = cnt[best] ? sum[best] / cnt[best] : null;
    info.ms = Math.round(now() - start);
    return complete(E.clone(view, true), acts[best], P);
  }

  /* ---------- tree search (最強): information-set Monte Carlo tree search ----------
     Every iteration guesses the unknown cards, walks down one tree of moves shared by all guesses (each seat picks by
     UCB from its own point of view, so a rival's best reply is searched, not assumed), adds one new move, plays a short
     greedy continuation, scores it with the evaluation and backs the result up. Moves open up in the order the
     evaluation likes them (progressive widening), so the time goes to the lines that matter. */
  function actKey(s, a) {
    if (a.k === 'take') return 't' + a.g.join('');
    if (a.k === 'buy') return a.m != null ? 'b' + s.mk[a.m] : 'r' + s.pl[s.cur].res[a.r];
    if (a.k === 'res') return a.m != null ? 'R' + s.mk[a.m] : 'D' + a.d;
    return 'p';
  }
  function TNode() { this.e = {}; this.order = null; this.prior = null; this.n = 0; }
  function rewardVec(s, P, temp, out) {
    var n = s.n, q;
    if (s.over) {
      var res = E.result(s);
      for (var i = 0; i < res.order.length; i++) {
        var r = res.order[i];
        out[r.seat] = r.rank === 1 ? 1 / res.winners.length : (n > 2 ? 0.08 * (n - r.rank) / (n - 1) : 0);
      }
      return out;
    }
    var mx = -Infinity;
    for (q = 0; q < n; q++) { var v = evaluate(s, q, P); if (s.fin) v /= 100; out[q] = v; if (v > mx) mx = v; }
    var sum = 0;
    for (q = 0; q < n; q++) { out[q] = Math.exp((out[q] - mx) / temp); sum += out[q]; }
    for (q = 0; q < n; q++) out[q] /= sum;
    return out;
  }
  function nodePriors(node, s, P, acts, pt) {
    var me = s.cur, sc = [], keys = [], mx = -Infinity, i;
    for (i = 0; i < acts.length; i++) {
      var t = E.clone(s, true), turn = complete(t, acts[i], P, true);
      var v = scoreAfter(t, me, P) - (noop(turn) ? 0.05 : 0);
      sc.push(v); keys.push(actKey(s, acts[i])); if (v > mx) mx = v;
    }
    var sum = 0, pr = [];
    for (i = 0; i < sc.length; i++) { var e = Math.exp((sc[i] - mx) / pt); pr.push(e); sum += e; }
    node.prior = {};
    for (i = 0; i < keys.length; i++) node.prior[keys[i]] = pr[i] / sum;
    node.order = keys.slice().sort(function (a, b) { return node.prior[b] - node.prior[a]; });
  }
  function tree(view, P, rng, o) {
    var me = view.cur, acts = E.legal(view), info = { sims: 0, nodes: 0 };
    tree.lastInfo = info;
    if (acts.length === 1) return complete(E.clone(view, true), acts[0], P);
    var root = new TNode(), start = now(), budget = o.ms || 2000, H = o.h == null ? 6 : o.h;
    var C = o.c || 0.55, B = o.bias || 0.35, W = o.wide || 1.2, RW = o.rootWide || 4, PT = o.pt || 0.6, temp = o.temp || 1.6;
    var seedBase = (rng() * 4294967296) >>> 0, R = new Float64Array(view.n), path = [], movers = [], it = 0;
    while (now() - start < budget || it < 40) {
      var s = E.determinize(view, E.mulberry32((seedBase + it * 2654435761) >>> 0), true); it++;
      var node = root, depth = 0;
      path.length = 0; movers.length = 0;
      while (!s.over) {
        var la = E.legal(s), keyed = {}, i;
        if (!node.order) { nodePriors(node, s, P, la, PT); info.nodes++; }
        for (i = 0; i < la.length; i++) {
          var k = actKey(s, la[i]); keyed[k] = la[i];
          if (!(k in node.prior)) { node.prior[k] = 0.0005; node.order.push(k); }
        }
        var width = (node === root ? RW : 2) + Math.floor(W * Math.sqrt(node.n + 1)), seen = 0, pick = null, fresh = false, bestU = -Infinity;
        for (i = 0; i < node.order.length && seen < width; i++) {
          var key = node.order[i]; if (!keyed[key]) continue; seen++;
          var e = node.e[key];
          if (!e) { pick = key; fresh = true; break; }
          e.av++;
          var u = e.w / e.n + C * Math.sqrt(Math.log(e.av) / e.n) + B * node.prior[key] / (1 + e.n);
          if (u > bestU) { bestU = u; pick = key; }
        }
        if (pick === null) break;
        var edge = node.e[pick];
        if (fresh) edge = node.e[pick] = { n: 0, w: 0, av: 1, child: null, a: keyed[pick] };
        movers.push(s.cur); path.push(edge);
        node.n++;
        complete(s, keyed[pick], P, true);
        if (fresh) break;
        node = edge.child || (edge.child = new TNode());
        depth++;
      }
      for (var ply = 0; ply < H && !s.over; ply++) { var turn = playoutStep(s, P); E.act(s, turn.a); E.finish(s, turn.ret, turn.nob); }
      rewardVec(s, P, temp, R);
      for (var j = 0; j < path.length; j++) { path[j].n++; path[j].w += R[movers[j]]; }
      info.sims++;
    }
    // the move searched the most (ties: the better average)
    var best = null, bn = -1, bm = -1;
    for (var kk in root.e) { var ed = root.e[kk], m = ed.w / ed.n; if (ed.n > bn || (ed.n === bn && m > bm)) { bn = ed.n; bm = m; best = kk; } }
    info.ms = Math.round(now() - start); info.visits = bn; info.mean = bm;
    var rootKeyed = {}; for (var q = 0; q < acts.length; q++) rootKeyed[actKey(view, acts[q])] = acts[q];
    return complete(E.clone(view, true), rootKeyed[best] || acts[0], P);
  }

  /* ---------- levels ---------- */
  var LEVELS = {
    1: { name: 'よわい', temp: 1.5, weak: true },   // ふつう wins about 85%
    2: { name: 'ふつう', temp: 0.3 },               // つよい wins about 83%
    3: { name: 'つよい', temp: 0 },
    4: { name: 'かなりつよい', search: { ms: 900, k: 7, h: 12, pre: 2 } },
    5: { name: '最強', search: { ms: 2600 }, tree: true },
    6: { name: '成長する敵', search: { ms: 2600 }, tree: true },
    // for the strength ladder only (not offered in the game): the previous 最強, wide flat search
    7: { name: '旧最強', search: { ms: 2600, k: 10, h: 22, pre: 3 } }
  };
  var WEAK = (function () {
    var w = {}; for (var k in BASE) w[k] = BASE[k];
    // a beginner looks only at what is close: little planning, no defence
    w.p2 = 0; w.p3 = 0; w.nob = 0.1; w.opp = 0; w.risk = 1; w.bvN = 0; w.disc = 0.5;
    return w;
  })();

  function params(level, extra) {
    var P = {}, k, src = level === 1 ? WEAK : BASE;
    for (k in src) P[k] = src[k];
    if (level === 6 && extra && extra.params) for (k in extra.params) if (typeof extra.params[k] === 'number' && k in P) P[k] = extra.params[k];
    return P;
  }
  /* view: E.view(state, seat) with view.cur === seat. Returns a turn { a, ret, nob }. */
  function choose(view, level, rng, extra) {
    rng = rng || Math.random; extra = extra || {};
    var L = LEVELS[level] || LEVELS[3], P = params(level, extra);
    choose.lastInfo = null;
    if (L.search) {
      var o = {}; for (var k in L.search) o[k] = L.search[k];
      if (view.n >= 3) o.ms = Math.round(o.ms * 0.7);       // several CPUs take turns: keep the table moving
      if (level === 6 && extra.boost) o.ms = Math.round(o.ms * extra.boost);
      if (extra.ms) o.ms = extra.ms;
      if (extra.tune) for (var t in extra.tune) o[t] = extra.tune[t];
      var turn = L.tree ? tree(view, P, rng, o) : search(view, P, rng, o);
      choose.lastInfo = L.tree ? tree.lastInfo : search.lastInfo;
      return turn;
    }
    // a greedy player looks one turn ahead on its own view: a card that would come up from a deck stays unknown
    return greedyTurn(E.clone(view, true), P, rng, L.temp);
  }

  /* a greedy turn decided on the seat's own view of a full state */
  function greedyView(s, P, rng, temp) { return greedyTurn(E.clone(E.view(s, s.cur), true), P, rng, temp || 0); }
  /* practice game for the rival's learning: strategy a against b at the greedy level, same deal, seats swapped by swap */
  function practice(a, b, seed, swap, players) {
    var rng = E.mulberry32(seed), n = players || 2, s = E.newGame({ players: n, first: 0, rng: rng });
    var PA = params(3), PB = params(3), k;
    for (k in a) if (k in PA) PA[k] = a[k];
    for (k in b) if (k in PB) PB[k] = b[k];
    var seatA = swap ? n - 1 : 0;
    for (var ply = 0; ply < 400 && !s.over; ply++) {
      var turn = greedyView(s, s.cur === seatA ? PA : PB, rng, 0);
      E.act(s, turn.a); E.finish(s, turn.ret, turn.nob);
    }
    if (!s.over) return 0.5;
    var res = E.result(s);
    if (res.winners.indexOf(seatA) < 0) return 0;
    return 1 / res.winners.length;
  }

  var api = {
    BASE: BASE, SPACE: SPACE, LEVELS: LEVELS, GROW_BASE: BASE, GROW_SPACE: SPACE,
    evaluate: evaluate, scoreAfter: scoreAfter, complete: complete, greedyTurn: greedyTurn, rankActions: rankActions,
    search: search, tree: tree, choose: choose, params: params, practice: practice, turnsFor: turnsFor, greedyView: greedyView,
    /* returns the CPU would choose for the seat to move in s (s already has the action applied) */
    suggestReturns: function (s, x) { return chooseReturns(E.clone(s, true), s.cur, params(3), x); },
    /* the move つよい would play from this view (a hint for you) */
    hint: function (view) { return greedyTurn(E.clone(view, true), params(3), Math.random, 0); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SPL_AI = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
