/* ハタトリ・ナイン — CPU players. Plain script (window.HTN_AI, also importScripts-able) and a node module.
   The CPU decides from a view (engine.viewFor), so it only knows what its seat may know: its own hand,
   the table, both discard piles, how many troop / tactics cards the other player holds, and the deck sizes.

   How it judges a position:
     1. It deals out K possible futures: the unseen troop cards are shuffled into "their hand" and "the deck",
        and each side gets the next few draws.
     2. For every flag and every future it asks: what is the best formation each side could still finish there
        (engine.bestStrength with that side's cards)? Comparing the two gives the chance to win that flag.
        Levels 1-3 share each side's cards out between the flags, most committed flags first, so that one card
        is never counted twice. Level 4 judges every flag on its own, each side drawing on its whole pool there:
        sharing cards out in a fixed order makes some flags look cheaper to play on than they really are.
     3. The nine chances are combined into the chance to win the game (five flags, or three in a row).
        Level 4 blends in the expected number of flags, which keeps it trying when that chance is near 0 or 1.
   Every legal move is tried on a copy of the position and the one with the best chance is played.
   Tactics cards carry a small "keep" value so they are not thrown away on a whim.
   Self-play (tools/hatatori-selfplay.mjs): level 4 wins about four games in five against level 3. */
(function (root, factory) {
  var E = (typeof module === 'object' && module.exports) ? require('./engine.js') : root.HTN_ENG;
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HTN_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var LEVELS = {
    1: { K: 8, H: 4, sym: false, noise: 0.06, tacDraw: 0, keep: 1, guile: false, name: 'やさしい' },
    2: { K: 16, H: 14, sym: true, noise: 0.004, tacDraw: 1, keep: 1, guile: true, name: 'ふつう' },
    3: { K: 48, H: 14, sym: true, noise: 0, tacDraw: 1, keep: 1, guile: true, name: 'つよい' },
    4: { K: 96, H: 14, indep: true, mixF: 0.8, noise: 0, tacDraw: 1, keep: 1, guile: true, name: 'もっとつよい' }
  };
  /* what keeping a tactics card in hand is worth (in win probability) */
  var KEEP = { 60: 0.035, 61: 0.035, 62: 0.022, 63: 0.016, 64: 0.012, 65: 0.012, 66: 0.008, 67: 0.014, 68: 0.02, 69: 0.026 };

  /* ------------------------------------------------------------------ a searchable copy of a view */
  function stateFromView(v) {
    var me = v.me, o = 1 - me, hands = [];
    hands[me] = v.hand.slice();
    hands[o] = v.opp.map(function (k) { return k === 'T' ? -2 : -3; });   // unknown cards: never read
    return {
      v: 1, tactics: v.tactics, claims: v.claims || 'auto', declared: !!v.declared, turn: v.turn, phase: v.phase, clock: v.clock, ply: v.ply, passes: v.passes, first: v.first,
      deck: { T: new Array(v.deck.T).fill(-1), X: new Array(v.deck.X).fill(-1) },
      hands: hands, flags: JSON.parse(JSON.stringify(v.flags)), discard: [v.discard[0].slice(), v.discard[1].slice()],
      tac: v.tac.slice(), leader: v.leader.slice(), scout: v.scout ? { left: v.scout.left } : null,
      winner: v.winner, win: v.win, last: null
    };
  }
  function copyState(s) {
    return {
      v: 1, tactics: s.tactics, claims: s.claims, declared: s.declared, turn: s.turn, phase: s.phase, clock: s.clock, ply: s.ply, passes: s.passes, first: s.first,
      deck: { T: s.deck.T.slice(), X: s.deck.X.slice() }, hands: [s.hands[0].slice(), s.hands[1].slice()],
      flags: s.flags.map(function (fl) { return { side: [fl.side[0].slice(), fl.side[1].slice()], fog: fl.fog, mud: fl.mud, claimed: fl.claimed, claim: fl.claim }; }),
      discard: [s.discard[0].slice(), s.discard[1].slice()], tac: s.tac.slice(), leader: s.leader.slice(),
      scout: s.scout ? { left: s.scout.left } : null, winner: s.winner, win: s.win, last: null
    };
  }

  /* ------------------------------------------------------------------ chance of winning the game from flag chances */
  var DP = new Float64Array(10 * 3 * 2 * 3 * 2), DP2 = new Float64Array(10 * 3 * 2 * 3 * 2);
  function idx(c, mr, ma, orr, oa) { return (((c * 3 + mr) * 2 + ma) * 3 + orr) * 2 + oa; }
  function gameChance(pf) {
    var a = DP, b = DP2, i, c, mr, ma, orr, oa;
    a.fill(0); a[idx(0, 0, 0, 0, 0)] = 1;
    for (var f = 0; f < 9; f++) {
      var p = pf[f], q = 1 - p;
      b.fill(0);
      for (c = 0; c <= f; c++) for (mr = 0; mr < 3; mr++) for (ma = 0; ma < 2; ma++) for (orr = 0; orr < 3; orr++) for (oa = 0; oa < 2; oa++) {
        var w = a[idx(c, mr, ma, orr, oa)];
        if (!w) continue;
        if (p > 0) { var nr = mr + 1, nma = ma || nr >= 3 ? 1 : 0; b[idx(c + 1, nr >= 3 ? 2 : nr, nma, 0, oa)] += w * p; }
        if (q > 0) { var no = orr + 1, noa = oa || no >= 3 ? 1 : 0; b[idx(c, 0, ma, no >= 3 ? 2 : no, noa)] += w * q; }
      }
      var t = a; a = b; b = t;
    }
    var win = 0;
    for (c = 0; c <= 9; c++) for (mr = 0; mr < 3; mr++) for (ma = 0; ma < 2; ma++) for (orr = 0; orr < 3; orr++) for (oa = 0; oa < 2; oa++) {
      i = a[idx(c, mr, ma, orr, oa)];
      if (!i) continue;
      var mw = ma || c >= 5, ow = oa || 9 - c >= 5;
      win += mw && ow ? i * 0.5 : mw ? i : 0;
    }
    return win;
  }

  /* ------------------------------------------------------------------ the futures */
  function makeFutures(s, me, K, H, rng) {
    var o = 1 - me, known = new Uint8Array(60), i;
    s.flags.forEach(function (fl) { for (var p = 0; p < 2; p++) fl.side[p].forEach(function (e) { if (e.c < 60) known[e.c] = 1; }); });
    s.discard.forEach(function (d) { d.forEach(function (c) { if (c < 60) known[c] = 1; }); });
    s.hands[me].forEach(function (c) { if (c >= 0 && c < 60) known[c] = 1; });
    var unseen = [];
    for (i = 0; i < 60; i++) if (!known[i]) unseen.push(i);
    var hOpp = s.hands[o].filter(function (c) { return c === -2 || (c >= 0 && c < 60); }).length;
    var D = s.deck.T.length;
    var nDraw = Math.min(H, Math.floor(D / 2) + (D % 2));
    var fut = [];
    for (var k = 0; k < K; k++) {
      var perm = E.shuffle(unseen.slice(), rng);
      var mine = new Uint8Array(60), theirs = new Uint8Array(60);
      for (i = 0; i < hOpp && i < perm.length; i++) theirs[perm[i]] = 1;
      var deck = perm.slice(hOpp);
      for (var d = 0; d < nDraw; d++) {
        if (2 * d < deck.length) mine[deck[2 * d]] = 1;
        if (2 * d + 1 < deck.length) theirs[deck[2 * d + 1]] = 1;
      }
      fut.push({ mine: mine, theirs: theirs });
    }
    return fut;
  }

  /* ------------------------------------------------------------------ the judge
     Each future gives both players a pool of troop cards (hand + draws for us; a guessed hand + draws for them).
     Cards are handed out flag by flag, most committed flags first, so one card is never counted twice. */
  function orderFor(t, p) {   // most committed flags first, then contested ones, then the middle
    var o = [];
    for (var f = 0; f < 9; f++) if (t.flags[f].claimed === -1) o.push(f);
    o.sort(function (a, b) {
      var fa = t.flags[a], fb = t.flags[b];
      var ka = fa.side[p].length * 100 + fa.side[1 - p].length * 10 + (4 - Math.abs(a - 4));
      var kb = fb.side[p].length * 100 + fb.side[1 - p].length * 10 + (4 - Math.abs(b - 4));
      return kb - ka;
    });
    return o;
  }
  function Judge(s, me, lv, rng) {
    this.me = me; this.lv = lv; this.K = lv.K;
    this.fut = makeFutures(s, me, lv.K, lv.H, rng);
    this.base = s;
    var hand = s.hands[me].filter(function (c) { return c >= 0 && c < 60; });
    this.res = this.fut.map(function (F) { var a = new Uint8Array(F.mine); hand.forEach(function (c) { a[c] = 1; }); return a; });
    this.tmp = new Uint8Array(60);
    this.picks = [];
    this.oppBase = lv.indep ? this.indepOpp(s) : this.allocOpp(s);
  }
  /* the other player's best per flag and future (they are given their cards without regard to ours) */
  Judge.prototype.allocOpp = function (t) {
    var o = 1 - this.me, order = orderFor(t, o), out = [], picks = this.picks, a = this.tmp;
    var info = flagInfo(t, o);
    for (var k = 0; k < this.K; k++) {
      var r = new Int16Array(9);
      a.set(this.fut[k].theirs);
      for (var j = 0; j < order.length; j++) {
        var f = order[j], I = info[f];
        if (I.done) { r[f] = I.exact; continue; }
        picks.length = 0;
        r[f] = E.bestStrength(I.ids, I.cap, I.fog, a, picks);
        if (r[f] >= 0) for (var q = 0; q < picks.length; q++) a[picks[q]] = 0;
      }
      out.push(r);
    }
    return out;
  };
  function flagInfo(t, p) {
    return t.flags.map(function (fl) {
      var cap = E.capOf(fl), fog = fl.fog >= 0, ids = E.ids(fl.side[p]);
      var done = ids.length >= cap;
      return { cap: cap, fog: fog, ids: ids, done: done, exact: done ? E.bestStrength(ids, cap, fog, null) : -1 };
    });
  }
  Judge.prototype.sameOpp = function (t) {
    var o = 1 - this.me;
    for (var f = 0; f < 9; f++) {
      var a = t.flags[f], b = this.base.flags[f];
      if (a.claimed !== b.claimed || a.fog !== b.fog || a.mud !== b.mud || !sameSide(a.side[o], b.side[o])) return false;
    }
    return true;
  };
  /* value of position t (our hand may have lost troop card `used`): chance to win the game */
  /* hand cards out flag by flag; with `against`, cards are not spent on a flag that is lost anyway */
  function allocate(info, order, a, against, tieW, picks, out) {
    for (var j = 0; j < order.length; j++) {
      var f = order[j], I = info[f];
      if (I.done) { out[f] = I.exact; continue; }
      picks.length = 0;
      var ms = E.bestStrength(I.ids, I.cap, I.fog, a, picks);
      out[f] = ms;
      if (ms < 0) continue;
      if (against) { var th = against[f]; if (th >= 0 && (ms < th || (ms === th && tieW[f] === 0))) continue; }
      for (var q = 0; q < picks.length; q++) a[picks[q]] = 0;
    }
    return out;
  }
  Judge.prototype.value = function (t, used) {
    if (this.lv.indep) return this.valueIndep(t, used);
    var me = this.me, o = 1 - me, K = this.K, f, k;
    var oppSame = this.sameOpp(t);
    var opp = oppSame ? this.oppBase : this.allocOpp(t);
    var order = orderFor(t, me), info = flagInfo(t, me), picks = this.picks, a = this.tmp;
    var sym = this.lv.sym, oOrder, oInfo;
    if (sym) { oOrder = orderFor(t, o); oInfo = flagInfo(t, o); }
    var tieW = new Float64Array(9), tieO = new Float64Array(9), wins = new Float64Array(9);
    for (f = 0; f < 9; f++) {
      var fl = t.flags[f], cap = E.capOf(fl);
      var mD = fl.side[me].length >= cap, oD = fl.side[o].length >= cap;
      tieW[f] = mD && oD ? (E.doneAt(fl.side[me], cap) < E.doneAt(fl.side[o], cap) ? 1 : 0) : mD ? 1 : oD ? 0 : 0.5;
      tieO[f] = 1 - tieW[f];
    }
    var mine = new Int16Array(9), theirs2 = new Int16Array(9);
    for (k = 0; k < K; k++) {
      var th = opp[k];
      a.set(this.res[k]); if (used != null) a[used] = 0;
      allocate(info, order, a, th, tieW, picks, mine);
      if (sym) {
        a.set(this.fut[k].theirs);
        allocate(oInfo, oOrder, a, mine, tieO, picks, theirs2);
        th = theirs2;
        a.set(this.res[k]); if (used != null) a[used] = 0;
        allocate(info, order, a, th, tieW, picks, mine);
      }
      for (f = 0; f < 9; f++) {
        if (t.flags[f].claimed !== -1) continue;
        var ms = mine[f], ts = th[f];
        wins[f] += ms < 0 && ts < 0 ? 0.5 : ms > ts ? 1 : ms === ts ? tieW[f] : 0;
      }
    }
    var pf = new Array(9);
    for (f = 0; f < 9; f++) {
      var c = t.flags[f].claimed;
      pf[f] = c !== -1 ? (c === me ? 1 : 0) : wins[f] / K;
    }
    return { win: gameChance(pf), pf: pf };
  };
  /* level 4: every flag on its own, each side may use its whole pool there */
  Judge.prototype.indepOpp = function (t) {
    var o = 1 - this.me, info = flagInfo(t, o), out = [];
    for (var k = 0; k < this.K; k++) {
      var r = new Int16Array(9), a = this.fut[k].theirs;
      for (var f = 0; f < 9; f++) {
        if (t.flags[f].claimed !== -1) { r[f] = -1; continue; }
        var I = info[f];
        r[f] = I.done ? I.exact : E.bestStrength(I.ids, I.cap, I.fog, a);
      }
      out.push(r);
    }
    return out;
  };
  Judge.prototype.valueIndep = function (t, used) {
    var me = this.me, o = 1 - me, K = this.K, f, k;
    var opp = this.sameOpp(t) ? this.oppBase : this.indepOpp(t);
    var info = flagInfo(t, me), a = this.tmp;
    var tieW = new Float64Array(9), wins = new Float64Array(9), open = [];
    for (f = 0; f < 9; f++) {
      var fl = t.flags[f];
      if (fl.claimed !== -1) continue;
      open.push(f);
      var cap = E.capOf(fl), mD = fl.side[me].length >= cap, oD = fl.side[o].length >= cap;
      tieW[f] = mD && oD ? (E.doneAt(fl.side[me], cap) < E.doneAt(fl.side[o], cap) ? 1 : 0) : mD ? 1 : oD ? 0 : 0.5;
    }
    for (k = 0; k < K; k++) {
      a.set(this.res[k]); if (used != null) a[used] = 0;
      var th = opp[k];
      for (var j = 0; j < open.length; j++) {
        f = open[j];
        var I = info[f], ms = I.done ? I.exact : E.bestStrength(I.ids, I.cap, I.fog, a), ts = th[f];
        wins[f] += ms < 0 && ts < 0 ? 0.5 : ms > ts ? 1 : ms === ts ? tieW[f] : 0;
      }
    }
    var pf = new Array(9), sf = 0;
    for (f = 0; f < 9; f++) {
      var c = t.flags[f].claimed;
      pf[f] = c !== -1 ? (c === me ? 1 : 0) : wins[f] / K;
      sf += pf[f];
    }
    var mix = this.lv.mixF || 0;
    return { win: (1 - mix) * gameChance(pf) + mix * sf / 9, pf: pf };
  };
  function sameSide(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i].c !== b[i].c) return false;
    return true;
  }

  /* ------------------------------------------------------------------ choosing */
  function tacticsInHand(h) { return h.filter(function (c) { return c >= 60; }).length; }
  function chooseDraw(s, me, lv) {
    if (!s.deck.X.length) return 'T';
    if (!s.deck.T.length) return 'X';
    if (!lv.tacDraw) return 'T';
    var h = s.hands[me], tac = tacticsInHand(h);
    var open = E.openFlags(s, me).reduce(function (n, f) { return n + E.capOf(s.flags[f]) - s.flags[f].side[me].length; }, 0);
    var troops = h.length - tac;
    // a tactics card when the hand holds none, the game is not nearly over, and troops are plentiful
    if (lv.tacDraw === 3) {   // eager: keep up to two tactics cards
      if (tac < 2 && open >= 4 && troops >= 4) return 'X';
      return 'T';
    }
    if (lv.tacDraw === 2) {   // conservative: one tactics card at a time, only while it can still be used
      if (tac === 0 && open >= 8 && troops >= 6 && s.tac[me] <= s.tac[1 - me]) return 'X';
      return 'T';
    }
    if (tac === 0 && open >= 6 && troops >= 5) return 'X';
    if (tac === 1 && open >= 14 && troops >= 6 && s.tac[me] <= s.tac[1 - me]) return 'X';
    return 'T';
  }

  /* declared claims: one a turn, at its start. With several provable flags, the one that wins the game,
     else the one that matters most for five flags or three in a row. */
  function pickClaim(s, me, cl) {
    var best = cl[0], bestV = -1;
    for (var i = 0; i < cl.length; i++) {
      var t = copyState(s);
      E.apply(t, { t: 'claim', f: cl[i] });
      if (t.phase === 'over') return cl[i];
      var pf = t.flags.map(function (fl) { return fl.claimed === me ? 1 : fl.claimed === -1 ? (E.claimCheck(t, t.flags.indexOf(fl), me) ? 0.9 : 0.5) : 0; });
      var g = gameChance(pf);
      if (g > bestV) { bestV = g; best = cl[i]; }
    }
    return best;
  }
  function choose(view, level, rng, tweak) {
    var lv = LEVELS[level] || LEVELS[2];
    if (tweak) lv = Object.assign({}, lv, tweak);
    rng = rng || Math.random;
    var s = stateFromView(view), me = view.me;
    if (s.turn !== me || s.phase === 'over') return null;
    if (E.canClaimNow(s, me)) {
      var cl = E.claimableFlags(s, me);
      if (cl.length) return { t: 'claim', f: pickClaim(s, me, cl) };
    }
    if (s.phase === 'draw') return { t: 'draw', d: chooseDraw(s, me, lv) };
    var judge = new Judge(s, me, lv, rng);
    if (s.phase === 'scout') return chooseScout(s, me, lv, judge);
    var acts = E.legalActions(s);
    if (!acts.length) return null;
    if (acts.length === 1) return acts[0];
    var now = judge.value(s, null).win;
    var best = null, bestV = -1e9;
    var oppTac = s.hands[1 - me].filter(function (c) { return c === -3; }).length;
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i], v, t, used, pen;
      if (a.t === 'pass') v = now;
      else if (a.t === 'scout') { v = now + 0.012 - KEEP[66] * lv.keep; }
      else {
        if (!lv.guile && (a.t === 'redeploy' || a.t === 'traitor') && rng() < 0.5) continue;
        t = copyState(s);
        var r = E.apply(t, a);
        if (!r.ok) continue;
        if (t.phase === 'over') v = t.winner === me ? 2 : -1;
        else {
          used = a.t === 'card' && a.c < 60 ? a.c : null;
          v = judge.value(t, used).win;
        }
        if (a.c >= 60) { pen = KEEP[a.c] * lv.keep + 0.004 * oppTac; v -= pen; }
      }
      if (lv.noise) v += (rng() - 0.5) * 2 * lv.noise;
      if (v > bestV) { bestV = v; best = a; }
    }
    return best || acts[0];
  }

  function chooseScout(s, me, lv, judge) {
    if (s.scout.left > 0 && s.deck.T.length + s.deck.X.length > 0) {
      var tac = tacticsInHand(s.hands[me]);
      var d = s.deck.X.length && (tac === 0 || !s.deck.T.length) && lv.tacDraw ? 'X' : 'T';
      if (!s.deck[d].length) d = d === 'T' ? 'X' : 'T';
      return { t: 'sdraw', d: d };
    }
    var need = E.scoutReturnCount(s);
    if (!need) return { t: 'sret', cards: [] };
    // return the cards we would miss least
    var now = judge.value(s, null).win;
    var scored = s.hands[me].map(function (c) {
      if (c >= 60) return { c: c, v: KEEP[c] + (E.isLeader(c) && s.leader[me] ? -1 : 0) };
      return { c: c, v: now - judge.value(s, c).win };
    });
    scored.sort(function (a, b) { return a.v - b.v; });
    return { t: 'sret', cards: scored.slice(0, need).map(function (x) { return x.c; }) };
  }

  return { LEVELS: LEVELS, choose: choose, stateFromView: stateFromView, gameChance: gameChance, Judge: Judge };
});
