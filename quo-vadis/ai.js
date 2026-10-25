/* クォ・ヴァディス — the CPU players.

   Every decision looks one action ahead and asks: how likely am I to win from here?
     expected score  = (laurels + what the senators on the board are still worth) x the chance of getting a senator
                       into the Senate, plus a little for every senator already there;
     chance to win   = a soft comparison of everyone's expected score; a finished game is simply won or lost.
   With one Senate seat left it also checks the players who move next: if one of them could walk in for free and win,
   that is (almost) as bad as losing. A table that has been stuck for long grows tired of blocking.

     decide(st, p, level, rnd)          ranked candidate actions for the player to move (negotiated moves carry offers)
     respond(st, q, req, level, rnd)    asked for consent: { ok } or { ok: false, ask: pts } or { ok: false, never }
     acceptCounter(st, p, cand, q, pts, level, rest)   is the voter's price still worth paying?
     bonus(st, p, level, rnd)           where to put Caesar after a "II Caesar" laurel (null: leave him)
   The CPU plays from what everyone at the table has seen: laurels taken and paid are public, so it may add them up;
   it never looks at the order of the face-down supply. */
(function (root, factory) {
  var D = root && root.QV_DATA ? root.QV_DATA : (typeof require === 'function' ? require('./data.js') : null);
  var E = root && root.QV_ENG ? root.QV_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(D, E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QV_AI = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (D, E) {
  'use strict';

  var LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
  var PARAMS = {
    1: { noise: 1.4, tau: 5.0, thresh: -1.1, lookAlt: 0.0, honesty: 0.95, potW: 0.8, caesarTax: 0.9, askUp: 0, watch: 0.5, share: 0 },
    2: { noise: 0.45, tau: 3.6, thresh: -0.15, lookAlt: 0.45, honesty: 0.8, potW: 1.0, caesarTax: 0.8, askUp: 0, watch: 0.9, share: 0.25 },
    3: { noise: 0.12, tau: 3.2, thresh: 0.1, lookAlt: 0.65, honesty: 0.65, potW: 1.0, caesarTax: 0.7, askUp: 1, watch: 1, share: 0.35 }
  };
  var SCALE = 20;                                   // utility = SCALE x chance to win
  var PROG = [0, 2.7, 1.75, 1.05, 0.55, 0.22];     // a senator's worth by its distance to the Senate (5 = not placed yet)
  var MEAN_TILE = 3.16;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function gauss(rnd) { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function P(level) { return PARAMS[level] || PARAMS[2]; }

  /* ------------------------------------------------------------------ judging a position */
  function qualifyProb(st, i) {
    if (E.senateCount(st, i) > 0) return 1;
    var rem = 5 - st.senate.length;
    if (rem <= 0) return 0;
    var mine = E.senatorsOf(st, i), best = 9, atDoor = 0;
    mine.forEach(function (s) { var d = D.DIST[s.cid]; if (d < best) best = d; if (d === 1) atDoor++; });
    if (best === 9 && st.players[i].left > 0) best = 5;
    if (best === 9) return 0;
    var threat = 0;
    for (var j = 0; j < st.n; j++) if (j !== i) E.senatorsOf(st, j).forEach(function (s) { if (s.cid !== 'S' && D.DIST[s.cid] === 1) threat++; });
    var p = 0.78 - 0.10 * (best - 1) - 0.13 * (5 - rem) - 0.03 * threat + 0.04 * Math.max(0, atDoor - 1);
    return clamp(p, 0.03, 0.95);
  }
  function potential(st, i) {
    var v = 0, seenTile = {};
    E.senatorsOf(st, i).forEach(function (s) {
      if (s.cid === 'S') return;
      v += PROG[D.DIST[s.cid]];
      var c = D.COM[s.cid];
      if (c.seats === 1) return;
      var path = D.OUT[s.cid][0];
      if (st.caesar === path.id) { v += 0.35; return; }      // a free way up, without the laurel
      var t = st.spaces[path.id];
      var tv = seenTile[s.cid] ? MEAN_TILE * Math.min(1, st.bag.length / 10) : (t ? t.v : 0);
      seenTile[s.cid] = 1;
      var own = E.countIn(st, s.cid, i), need = c.seats === 3 ? 2 : 3;
      var chance = own >= need ? 0.62 : 0.36;
      v += 0.42 * tv * chance;
    });
    v += st.players[i].left * PROG[5];
    return v;
  }
  function expected(st, i, W) {
    var pl = st.players[i], inS = E.senateCount(st, i);
    var rem = 5 - st.senate.length;
    var later = W.potW * (0.35 + 0.65 * rem / 5);              // what is still to come counts less as the Senate fills
    return (pl.pts + potential(st, i) * later) * qualifyProb(st, i) + (inS > 1 ? 1.1 * (inS - 1) : 0) + (inS > 0 ? 4 : 0);
  }
  function chances(st, W) {
    var out = [], i;
    if (st.phase === 'over') { var r = E.result(st); for (i = 0; i < st.n; i++) out.push(i === r.winner ? 1 : 0); return out; }
    var es = [], mx = -1e9, sum = 0;
    for (i = 0; i < st.n; i++) { es.push(expected(st, i, W)); if (es[i] > mx) mx = es[i]; }
    for (i = 0; i < st.n; i++) { out.push(Math.exp((es[i] - mx) / W.tau)); sum += out[i]; }
    for (i = 0; i < st.n; i++) out[i] /= sum;
    return out;
  }
  /* turns since anything changed: no laurel, no Senate entry */
  function stalled(st) { return st.turnNo - Math.max(st.lastScore || 0, st.lastSenate || 0); }
  /* the players who move before p moves again */
  function before(st, p) { var out = []; for (var k = 0; k < st.n; k++) { var q = (st.turn + k) % st.n; if (q === p) break; out.push(q); } return out; }
  /* can q walk into the Senate now, without anyone's consent? returns the state after it if so */
  function freeEntry(st, q) {
    if (E.freeSeat(st, 'S') < 0) return null;
    for (var k = 0; k < 3; k++) {
      var cid = ['D1', 'D2', 'D3'][k];
      if (!E.countIn(st, cid, q)) continue;
      var info = E.moveInfo(st, q, cid, 'S');
      if (info.ok && info.free) {
        var s3 = E.clone(st);
        s3.turn = q; s3.phase = 'play'; s3.bonus = null;
        if (E.apply(s3, q, { t: 'move', from: cid, to: 'S' }).ok) return s3;
      }
    }
    return null;
  }
  function utility(st, p, W) {
    var u = SCALE * chances(st, W)[p];
    if (st.phase !== 'over' && st.senate.length === 4 && W.watch > 0) {
      // the last seat: does someone who moves before me get to end the game and win?
      var tired = Math.max(0, stalled(st) - 4 * st.n) / (8 * st.n);
      var rho = 0.9 * W.watch * Math.max(0, 1 - tired);
      var qs = before(st, p);
      for (var k = 0; k < qs.length; k++) {
        var s3 = freeEntry(st, qs[k]);
        if (s3 && E.result(s3).winner === qs[k]) { u = (1 - rho) * u; break; }
      }
      // ... or could I, if nobody stops me?
      var mine = freeEntry(st, p);
      if (mine && E.result(mine).winner === p) u += 0.25 * (SCALE - u);
    }
    return u;
  }

  /* play an action on a copy; a pending Caesar bonus is left unused (its worth is added by the callers) */
  function sim(st, p, act) {
    var s2 = E.clone(st);
    var r = E.apply(s2, p, act);
    if (!r.ok) return null;
    if (s2.phase === 'bonus') E.apply(s2, s2.bonus.by, { t: 'bonus', to: null });
    return s2;
  }
  function idleTurns(st) { return st.turnNo - st.lastMove; }

  /* ------------------------------------------------------------------ being asked for consent */
  function trust(st, m) {
    var kept = 0, broken = 0;
    st.promises.forEach(function (pr) { if (pr.from === m) { if (pr.done === 'kept') kept++; else if (pr.done === 'broken') broken++; } });
    return (1 + kept) / (2 + kept + 2 * broken);
  }
  function promiseWorth(st, q, m) {
    // worth something only if m still has senators on the way up whose committees q may need to leave
    var mHas = E.senatorsOf(st, m).some(function (s) { return s.cid !== 'S'; });
    return mHas ? 1.2 * trust(st, m) : 0.15;
  }
  /* fill the votes a move needs, starting with `first` giving k; the rest from the other senators in the committee */
  function voteSet(info, first, k, skip) {
    var votes = {}, left = info.ext;
    if (first >= 0) { votes[first] = Math.min(k, info.avail[first] || 0, left); left -= votes[first]; }
    Object.keys(info.avail).map(Number).sort(function (a, b) { return a - b; }).forEach(function (q) {
      if (left <= 0 || q === first || q === skip) return;
      var x = Math.min(info.avail[q], left);
      if (x > 0) { votes[q] = x; left -= x; }
    });
    return left > 0 ? null : votes;
  }
  /* req: { mover, from, to, votes, pay, promise, caesar } — how the voter q's chances change with its consent */
  function judge(st, q, req, W) {
    var m = req.mover, info = E.moveInfo(st, m, req.from, req.to, req.ownVotes);
    if (!info.ok || info.free || !(info.avail[q] > 0)) return null;
    var k = Math.min(req.votes || 1, info.avail[q], info.ext);
    var votes = voteSet(info, q, k, -1);
    if (!votes) return null;
    var stay = utility(st, q, W);
    var alt = stay;
    var without = voteSet(info, -1, 0, q);
    if (without && W.lookAlt > 0) {
      var s3 = sim(st, m, { t: 'move', from: req.from, to: req.to, votes: without });
      if (s3) alt = W.lookAlt * utility(s3, q, W) + (1 - W.lookAlt) * stay;
    }
    var extra = (req.promise ? promiseWorth(st, q, m) : 0) + (req.caesar && info.laurel && info.laurel.c ? 0.8 : 0);
    var slack = 0.3 * Math.max(0, idleTurns(st) - st.n) / st.n;  // a table where nothing moves gets more agreeable
    var gain = info.laurel ? info.laurel.v : 0, ones = Math.min(k, st.ones);
    function worth(pay) {
      var pays = {}; if (pay > 0) pays[q] = pay;
      var s2 = sim(st, m, { t: 'move', from: req.from, to: req.to, ownVotes:req.ownVotes, votes: votes, pay: pays });
      if (!s2) return -1e9;
      // people like a fair share of what their vote earns the mover
      var envy = W.share * 0.8 * Math.max(0, gain - ones - 2 * pay);
      return utility(s2, q, W) + extra - alt + slack - envy;
    }
    return { info: info, worth: worth, budget: E.budget(st, m, info), k: k };
  }
  function respond(st, q, req, level, rnd) {
    var W = P(level), j = judge(st, q, req, W);
    if (!j) return { ok: true };
    var pay = Math.max(0, Math.floor(req.pay || 0));
    var noise = rnd && level === 1 ? gauss(rnd) * 0.6 : 0;
    var g = j.worth(pay) + noise;
    if (E.owes(st, q, req.mover) && g > -4 && (rnd ? rnd() : 0.5) < W.honesty) return { ok: true, kept: true };
    if (g >= W.thresh) return { ok: true };
    // the smallest payment that would do (the worth only grows with the payment)
    if (pay >= j.budget || j.worth(j.budget) + noise < W.thresh) return { ok: false, never: true };
    var lo = pay + 1, hi = j.budget;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (j.worth(mid) + noise >= W.thresh) hi = mid; else lo = mid + 1; }
    return { ok: false, ask: Math.min(j.budget, lo + (W.askUp && lo + 1 <= j.budget && rnd && rnd() < 0.3 ? 1 : 0)) };
  }
  /* the cheapest price a voter would accept (exactly for CPUs; for a person, what an ordinary CPU would ask) */
  function priceOf(st, q, req) {
    var lvl = st.players[q].kind === 'cpu' ? (st.players[q].level || 2) : 2;
    var W = P(lvl), j = judge(st, q, req, W);
    if (!j) return 0;
    if (j.worth(0) >= W.thresh) return 0;
    if (j.worth(j.budget) < W.thresh) return Infinity;
    var lo = 1, hi = j.budget;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (j.worth(mid) >= W.thresh) hi = mid; else lo = mid + 1; }
    return lo;
  }

  /* ------------------------------------------------------------------ choosing an action */
  function planMove(st, p, info, W) {
    var voters = Object.keys(info.avail).map(Number);
    var budget = E.budget(st, p, info), options = [];
    var cache = {};
    function price(q, k) { var key = q + ':' + k; if (!(key in cache)) cache[key] = priceOf(st, q, { mover: p, from: info.from, to: info.to, votes: k, pay: 0 }); return cache[key]; }
    if (info.ext === 1) voters.forEach(function (q) { var x = price(q, 1); if (x <= budget) options.push({ asks: [{ q: q, k: 1, pay: x }], cost: x }); });
    else {
      voters.forEach(function (q) { if (info.avail[q] >= 2) { var x = price(q, 2); if (x <= budget) options.push({ asks: [{ q: q, k: 2, pay: x }], cost: x }); } });
      for (var a = 0; a < voters.length; a++) for (var b = a + 1; b < voters.length; b++) {
        var xa = price(voters[a], 1), xb = price(voters[b], 1);
        if (xa + xb <= budget) options.push({ asks: [{ q: voters[a], k: 1, pay: xa }, { q: voters[b], k: 1, pay: xb }], cost: xa + xb });
      }
    }
    if (!options.length) return null;
    options.sort(function (x, y) { return x.cost - y.cost; });
    var best = null;
    options.slice(0, 4).forEach(function (o) {
      var votes = {}, pay = {};
      o.asks.forEach(function (a) { votes[a.q] = a.k; if (a.pay) pay[a.q] = a.pay; });
      var act = { t: 'move', from: info.from, to: info.to, votes: votes, pay: pay };
      var s2 = sim(st, p, act);
      if (!s2) return;
      var val = utility(s2, p, W) + (info.laurel && info.laurel.c ? 0.6 : 0);
      if (!best || val > best.val) best = { act: act, val: val, asks: o.asks, cost: o.cost };
    });
    return best;
  }
  function decide(st, p, level, rnd) {
    var W = P(level), cands = [];
    rnd = rnd || Math.random;
    var idle = idleTurns(st), stall = idle > st.n * 2 ? (idle - st.n * 2) * 0.3 : 0;
    E.placeTargets(st, p).forEach(function (cid) {
      var act = { t: 'place', c: cid }, s2 = sim(st, p, act);
      if (s2) cands.push({ act: act, val: utility(s2, p, W) + 0.1 });
    });
    E.moveOptions(st, p).forEach(function (info) {
      if (!info.ok) return;
      if (info.free) {
        var act = { t: 'move', from: info.from, to: info.to }, s2 = sim(st, p, act);
        if (s2) cands.push({ act: act, val: utility(s2, p, W) + (info.laurel && info.laurel.c ? 0.6 : 0) + 0.1 });
        return;
      }
      var plan = planMove(st, p, info, W);
      if (plan) cands.push({ act: plan.act, val: plan.val, asks: plan.asks });
    });
    E.caesarTargets(st).forEach(function (pid) {
      var act = { t: 'caesar', to: pid }, s2 = sim(st, p, act);
      if (s2) cands.push({ act: act, val: utility(s2, p, W) - W.caesarTax - stall });
    });
    cands.forEach(function (c) { c.score = c.val + gauss(rnd) * W.noise; });
    cands.sort(function (a, b) { return b.score - a.score; });
    return cands;
  }
  /* a voter named a price: pay it if the move still beats the next best plan */
  function acceptCounter(st, p, cand, q, pts, level, restBest) {
    var W = P(level);
    var act = E.clone(cand.act);
    act.pay = act.pay || {};
    act.pay[q] = pts;
    var info = E.moveInfo(st, p, act.from, act.to);
    var total = 0; Object.keys(act.pay).forEach(function (k) { total += act.pay[k]; });
    if (!info.ok || total > E.budget(st, p, info)) return null;
    var s2 = sim(st, p, act);
    if (!s2) return null;
    var val = utility(s2, p, W) + (info.laurel && info.laurel.c ? 0.6 : 0);
    return val >= (restBest === undefined ? -1e9 : restBest) - 0.2 ? act : null;
  }

  /* ------------------------------------------------------------------ Caesar after a "II Caesar" laurel */
  function bonus(st, p, level, rnd) {
    var W = P(level), best = null, bestV = -1e9;
    var opts = [null].concat(E.caesarTargets(st));
    opts.forEach(function (pid) {
      var s2 = E.clone(st);
      var r = E.apply(s2, p, { t: 'bonus', to: pid });
      if (!r.ok) return;
      var v = utility(s2, p, W) + (rnd && level === 1 ? gauss(rnd) * 0.6 : 0);
      if (v > bestV + 1e-9) { bestV = v; best = pid; }
    });
    return best;
  }

  return { LEVEL_NAME: LEVEL_NAME, PARAMS: PARAMS, decide: decide, respond: respond, priceOf: priceOf, acceptCounter: acceptCounter,
    bonus: bonus, utility: utility, chances: chances, qualifyProb: qualifyProb, expected: expected };
});
