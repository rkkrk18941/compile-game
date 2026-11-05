/* 風の怪物ピラデロ — the CPU. It decides from a view (what its own seat may know) and nothing else.
   The cards it cannot see are few (at most 9 places in a deal of 10), so it counts the possible deals:
   all of them when it decides to fight or flee (at most 120), a sample of them while picking cards.
     やさしい  peeks anywhere, keeps a peeked card when it is big, fights on a rough chance with some doubt
     ふつう    tries every card it could take and plays the rest of the picking out on sample deals;
              fights or flees on the exact chance and on what the gears left are worth
     つよい    also reads the others: a peeked card that was kept is probably big, one that was left is probably
              small, and weighs the deals by that; peeks where knowing helps its choice most; and before it
              fights it works out whether the players after it will flee (so it can push with a weak hand)
   The worth of the gears is the chance to win the whole game from there, from a small model of rounds. */
(function (root, factory) {
  var E = root && root.PD_ENG ? root.PD_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PD_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
  // how likely a player keeps a card they just peeked, by its number (used to read the others, and in play-outs)
  var KEEP = [0.38, 0.2, 0.24, 0.3, 0.4, 0.5, 0.62, 0.72, 0.8, 0.86];

  /* ------------------------------------------------------------------ what the gears are worth */
  var m2 = {}, m3 = {};
  function W2(a, b) {
    if (a <= 0) return 0;
    if (b <= 0) return 1;
    var k = a * 16 + b;
    if (m2[k] !== undefined) return m2[k];
    var s = 0.62;
    var r = s * (0.5 * W2(a, b - 2) + 0.5 * W2(a - 2, b)) + (1 - s) * (0.5 * W2(a, b - 1) + 0.5 * W2(a - 1, b));
    m2[k] = r;
    return r;
  }
  function W3(a, b, c) {
    if (a <= 0) return 0;
    if (b <= 0 && c <= 0) return 1;
    if (b <= 0) return W2(a, c);
    if (c <= 0) return W2(a, b);
    var k = (a * 16 + b) * 16 + c;
    if (m3[k] !== undefined) return m3[k];
    var r = 0;
    r += 0.45 / 3 * (W3(a, b - 2, c - 2) + W3(a - 2, b, c - 2) + W3(a - 2, b - 2, c));
    r += 0.4 / 3 * (0.5 * W3(a - 1, b - 2, c) + 0.5 * W3(a - 1, b, c - 2));
    r += 0.4 / 3 * (0.5 * W3(a, b - 1, c - 2) + 0.5 * W3(a - 2, b - 1, c));
    r += 0.4 / 3 * (0.5 * W3(a, b - 2, c - 1) + 0.5 * W3(a - 2, b, c - 1));
    r += 0.15 / 3 * (W3(a, b - 1, c - 1) + W3(a - 1, b, c - 1) + W3(a - 1, b - 1, c));
    m3[k] = r;
    return r;
  }
  // chance that seat `me` wins the game with these gear counts (gears ≤ 0 = out)
  function worth(gears, me) {
    if (gears[me] <= 0) return 0;
    var opp = [];
    for (var i = 0; i < gears.length; i++) if (i !== me && gears[i] > 0) opp.push(gears[i]);
    if (!opp.length) return 1;
    if (opp.length === 1) return W2(gears[me], opp[0]);
    return W3(gears[me], opp[0], opp[1]);
  }

  /* ------------------------------------------------------------------ the round, played out on a full deal */
  // fighters in turn order; returns the gear counts after the round
  function outcome(order, hands, field, wind, choice, gears) {
    var g = gears.slice(), fighters = [];
    order.forEach(function (s) { if (choice[s] === 'flee') g[s] = Math.max(0, g[s] - 1); else fighters.push(s); });
    if (fighters.length >= 2) {
      var b = E.battle(order, hands, field, fighters, wind);
      fighters.forEach(function (s) { if (s !== b.winner) g[s] = Math.max(0, g[s] - 2); });
      return { g: g, winner: b.winner };
    }
    return { g: g, winner: fighters.length ? fighters[0] : -1 };
  }

  /* ------------------------------------------------------------------ what this seat knows */
  function knowledge(v) {
    var have = {}, me = v.me;
    (v.players[me].hand || []).forEach(function (c) { have[c] = 1; });
    v.slots.forEach(function (S) { if (S.v !== null && S.v !== undefined) have[S.v] = 1; });
    if (v.wind !== null && v.wind !== undefined) have[v.wind] = 1;
    var U = E.CARDS.filter(function (c) { return !have[c]; });
    var unknownSlots = [];
    v.slots.forEach(function (S, i) { if (S.v === null || S.v === undefined) unknownSlots.push(i); });
    return { U: U, unknownSlots: unknownSlots, unused: v.unused };
  }
  function shuffled(a, rnd) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // a full deal: the number in every slot, the wind card
  function fillDeal(v, K, vals) {
    var sv = v.slots.map(function (S) { return S.v; });
    K.unknownSlots.forEach(function (i, j) { sv[i] = vals[j]; });
    return { sv: sv, wind: vals[K.unknownSlots.length] };
  }
  function sampleDeal(v, K, rnd) { return fillDeal(v, K, shuffled(K.U, rnd)); }
  // every deal of the unseen numbers into the unseen slots and the wind card (the rest are the unused cards)
  function allDeals(v, K) {
    var m = K.unknownSlots.length + 1, out = [], pick = [], used = {};
    (function rec() {
      if (pick.length === m) { out.push(fillDeal(v, K, pick)); return; }
      for (var i = 0; i < K.U.length; i++) {
        var c = K.U[i];
        if (used[c]) continue;
        used[c] = 1; pick.push(c); rec(); pick.pop(); used[c] = 0;
      }
    })();
    return out;
  }
  // how well a deal explains what the others did: kept a peeked card → it was probably big
  function likelihood(v, deal) {
    var w = 1;
    v.picks.forEach(function (r) {
      if (r.p === v.me || r.peek < 0) return;
      var x = deal.sv[r.peek];
      w *= r.peek === r.take ? KEEP[x] : 1 - KEEP[x];
    });
    return w;
  }
  function handsOf(v, deal) {
    var h = [];
    for (var s = 0; s < v.n; s++) h.push([]);
    v.slots.forEach(function (S, i) { if (S.by >= 0) h[S.by].push(deal.sv[i]); });
    return h;
  }

  /* ------------------------------------------------------------------ how good a hand is, before anyone decides
     The chance a 2-card hand wins a battle where everyone fights, knowing only the open field cards
     (every deal of the rest counted, the seat order averaged). Filled in as needed and kept. */
  var strength = {};
  function handStrength(hand, field, k) {
    var h = hand.slice().sort(), f = field.slice().sort();
    var key = k + ':' + h.join('') + '|' + f.join('');
    if (strength[key] !== undefined) return strength[key];
    var have = {}; h.concat(f).forEach(function (c) { have[c] = 1; });
    var U = E.CARDS.filter(function (c) { return !have[c]; });
    var win = 0, cnt = 0, order = k === 3 ? [0, 1, 2] : [0, 1];
    var orders = k === 3 ? [[0, 1, 2], [1, 2, 0], [2, 0, 1]] : [[0, 1], [1, 0]];
    var hands = k === 3 ? [h, [], []] : [h, []];
    function judge(w) {
      orders.forEach(function (o) { var b = E.battle(o, hands, f, o, w); if (b.winner === 0) win++; cnt++; });
    }
    for (var i = 0; i < U.length; i++) for (var j = i + 1; j < U.length; j++) {
      hands[1] = [U[i], U[j]];
      var rest = U.filter(function (c) { return c !== U[i] && c !== U[j]; });
      if (k === 3) {
        for (var a = 0; a < rest.length; a++) for (var b2 = a + 1; b2 < rest.length; b2++) {
          hands[2] = [rest[a], rest[b2]];
          var rest2 = rest.filter(function (c) { return c !== rest[a] && c !== rest[b2]; });
          rest2.forEach(judge);
        }
      } else rest.forEach(judge);
    }
    var p = cnt ? win / cnt : 0;
    strength[key] = p;
    return p;
  }
  // a quick fight-or-flee rule for play-outs and for reading other players: fight on a fair chance
  function quickChoices(order, hands, field, gears) {
    var c = [], anyFight = false, k = order.length;
    order.forEach(function (s, i) {
      if (i === k - 1 && !anyFight) { c[s] = 'fight'; return; }
      var p = handStrength(hands[s], field, k);
      var fight = gears[s] <= 1 || p > (k === 3 ? 0.24 : 0.33);
      c[s] = fight ? 'fight' : 'flee';
      if (fight) anyFight = true;
    });
    return c;
  }

  function laterQuick(order, pos, choice, hands, field, gears) {
    var c = choice.slice(), k = order.length;
    for (var i = pos + 1; i < k; i++) {
      var s = order[i], anyFight = false;
      for (var j = 0; j < i; j++) if (c[order[j]] === 'fight') anyFight = true;
      if (i === k - 1 && !anyFight) { c[s] = 'fight'; continue; }
      c[s] = gears[s] <= 1 || handStrength(hands[s], field, k) > (k === 3 ? 0.24 : 0.33) ? 'fight' : 'flee';
    }
    return c;
  }

  /* ------------------------------------------------------------------ picking: play the rest out */
  function playOut(v, deal, firstTake, rnd, gears) {
    var me = v.me, k = v.order.length, by = v.slots.map(function (S) { return S.by; });
    by[firstTake] = me;
    var ti = v.picks.length + 1;
    while (ti < 2 * k) {
      var q = v.order[ti % k], free = [];
      by.forEach(function (b, i) { if (b < 0) free.push(i); });
      var peek = free[Math.floor(rnd() * free.length)], take = peek;
      if (rnd() >= KEEP[deal.sv[peek]] && free.length > 1) {
        var others = free.filter(function (i) { return i !== peek; });
        take = others[Math.floor(rnd() * others.length)];
      }
      by[take] = q; ti++;
    }
    var hands = [], field = [];
    for (var s = 0; s < v.n; s++) hands.push([]);
    by.forEach(function (b, i) { if (b >= 0) hands[b].push(deal.sv[i]); else field.push(deal.sv[i]); });
    // everyone fights or flees by the quick rule; the play-out is worth the gears it leaves me
    var c = quickChoices(v.order, hands, field, gears);
    return worth(outcome(v.order, hands, field, deal.wind, c, gears).g, me);
  }
  function gearsOf(v) { return v.players.map(function (P) { return P.out ? 0 : P.gears; }); }
  function takeScores(v, level, rnd, deals) {
    var free = E.openSlots(v), score = free.map(function () { return 0; }), wsum = 0, gears = gearsOf(v);
    deals.forEach(function (d) {
      var w = level >= 3 ? likelihood(v, d) : 1;
      if (w <= 0) return;
      wsum += w;
      free.forEach(function (s, j) { score[j] += w * playOut(v, d, s, rnd, gears); });
    });
    return { free: free, score: score.map(function (x) { return wsum ? x / wsum : 0; }) };
  }
  function samples(v, K, n, rnd) { var a = []; for (var i = 0; i < n; i++) a.push(sampleDeal(v, K, rnd)); return a; }

  function choosePeek(v, level, rnd) {
    var free = E.openSlots(v);
    var unknown = free.filter(function (i) { return !v.slots[i].mine; });
    var pool = unknown.length ? unknown : free;
    if (level <= 1 || pool.length === 1) return pool[Math.floor(rnd() * pool.length)];
    if (level === 2) {
      var fresh = pool.filter(function (i) { return !v.slots[i].seen.length; });
      var p2 = fresh.length && rnd() < 0.7 ? fresh : pool;
      return p2[Math.floor(rnd() * p2.length)];
    }
    // つよい: where would knowing the number change the take the most?
    var K = knowledge(v), deals = samples(v, K, 220, rnd), gears = gearsOf(v);
    var free2 = free, rows = [];
    deals.forEach(function (d) {
      var w = likelihood(v, d);
      if (w <= 0) return;
      rows.push({ d: d, w: w, r: free2.map(function (s) { return playOut(v, d, s, rnd, gears); }) });
    });
    var best = pool[0], bestVal = -1;
    pool.forEach(function (s) {
      var groups = {};
      rows.forEach(function (row) {
        var x = row.d.sv[s], g = groups[x] || (groups[x] = { w: 0, sc: free2.map(function () { return 0; }) });
        g.w += row.w;
        row.r.forEach(function (r, j) { g.sc[j] += row.w * r; });
      });
      var val = 0;
      Object.keys(groups).forEach(function (x) { val += Math.max.apply(null, groups[x].sc); });
      val += rnd() * 1e-6;
      if (val > bestVal) { bestVal = val; best = s; }
    });
    return best;
  }

  function chooseTake(v, level, rnd) {
    var free = E.openSlots(v), ps = v.peekSlot;
    if (level <= 1) {
      var pv = ps >= 0 ? v.slots[ps].v : null;
      if (pv !== null && (pv >= 6 || (pv === 5 && rnd() < 0.5))) return ps;
      var others = free.filter(function (i) { return i !== ps && !(v.slots[i].mine && v.slots[i].v < 5); });
      if (!others.length) others = free;
      return others[Math.floor(rnd() * others.length)];
    }
    var K = knowledge(v);
    var sc = takeScores(v, level, rnd, samples(v, K, level >= 3 ? 320 : 170, rnd));
    var best = 0;
    for (var j = 1; j < sc.free.length; j++) if (sc.score[j] > sc.score[best] + (rnd() - 0.5) * 1e-4) best = j;
    return sc.free[best];
  }

  /* ------------------------------------------------------------------ fight or flee */
  // the chance the decider at this point fights, seen from its own seat (used by つよい to read later players)
  function fightChance(v, deal, q, choiceSoFar, gears) {
    // what q knows: its hand, the open field, the slots it peeked (numbers from this deal)
    var have = {}, me = q;
    var hands = handsOf(v, deal);
    hands[q].forEach(function (c) { have[c] = 1; });
    var field = [];
    v.slots.forEach(function (S, i) { if (S.by < 0) { field.push(deal.sv[i]); have[deal.sv[i]] = 1; } });
    var qKnows = {};
    v.slots.forEach(function (S, i) { if (S.seen.indexOf(q) >= 0 || S.by === q) { qKnows[i] = deal.sv[i]; have[deal.sv[i]] = 1; } });
    var U = E.CARDS.filter(function (c) { return !have[c]; });
    var hidden = [];
    v.slots.forEach(function (S, i) { if (S.by >= 0 && S.by !== q && qKnows[i] === undefined) hidden.push(i); });
    var m = hidden.length + 1, pick = [], used = {}, fight = 0, flee = 0, cnt = 0;
    var later = v.order.slice(v.order.indexOf(q) + 1);
    (function rec() {
      if (pick.length === m) {
        var sv = deal.sv.slice();
        hidden.forEach(function (i, j) { sv[i] = pick[j]; });
        var h = handsOf(v, { sv: sv });
        var w = pick[hidden.length];
        var c1 = choiceSoFar.slice(), c2 = choiceSoFar.slice();
        c1[q] = 'fight'; c2[q] = 'flee';
        later.forEach(function (s) { c1[s] = 'fight'; c2[s] = 'fight'; });
        fight += worth(outcome(v.order, h, field, w, c1, gears).g, me);
        flee += worth(outcome(v.order, h, field, w, autoLast(v.order, c2), gears).g, me);
        cnt++;
        return;
      }
      for (var i = 0; i < U.length; i++) {
        var c = U[i];
        if (used[c]) continue;
        used[c] = 1; pick.push(c); rec(); pick.pop(); used[c] = 0;
      }
    })();
    if (!cnt) return 1;
    var d = (fight - flee) / cnt;
    return 1 / (1 + Math.exp(-d * 18));
  }
  // nobody may be left to fight: when everyone else fled, the last one fights (the rule's default win)
  function autoLast(order, choice) {
    var c = choice.slice(), anyFight = order.some(function (s) { return c[s] === 'fight'; });
    if (!anyFight) c[order[order.length - 1]] = 'fight';
    return c;
  }

  function chooseEscape(v, level, rnd) {
    var me = v.me, gears = v.players.map(function (P) { return P.out ? 0 : P.gears; });
    var K = knowledge(v), deals = allDeals(v, K);
    var pos = v.order.indexOf(me), later = v.order.slice(pos + 1);
    var base = v.choice.slice();
    var field = [];
    v.slots.forEach(function (S) { if (S.by < 0) field.push(S.v); });
    var uF = 0, uL = 0, wsum = 0, pwin = 0;
    deals.forEach(function (d) {
      var w = level >= 3 ? likelihood(v, d) : 1;
      if (w <= 0) return;
      var hands = handsOf(v, d);
      wsum += w;
      // all fight: the plain chance to win the battle
      var all = base.slice(); all[me] = 'fight'; later.forEach(function (s) { all[s] = 'fight'; });
      var o = outcome(v.order, hands, field, d.wind, all, gears);
      pwin += w * (o.winner === me ? 1 : 0);
      if (level >= 3 && later.length) {
        // branch over what the later players do, each with the chance they fight
        var branches = [{ c: base.slice(), p: 1 }];
        branches[0].c[me] = 'fight';
        var fl = base.slice(); fl[me] = 'flee';
        var branchesL = [{ c: fl, p: 1 }];
        later.forEach(function (q, li) {
          [branches, branchesL].forEach(function (list, which) {
            var next = [];
            list.forEach(function (b) {
              var lastOne = li === later.length - 1;
              var anyFight = v.order.slice(0, pos + 1 + li).some(function (s) { return b.c[s] === 'fight'; });
              if (lastOne && !anyFight) { var cA = b.c.slice(); cA[q] = 'fight'; next.push({ c: cA, p: b.p }); return; }
              var pf = fightChance(v, d, q, b.c, gears);
              var cF = b.c.slice(); cF[q] = 'fight';
              var cL = b.c.slice(); cL[q] = 'flee';
              if (pf > 0.001) next.push({ c: cF, p: b.p * pf });
              if (pf < 0.999) next.push({ c: cL, p: b.p * (1 - pf) });
            });
            if (which === 0) branches = next; else branchesL = next;
          });
        });
        branches.forEach(function (b) { uF += w * b.p * worth(outcome(v.order, hands, field, d.wind, b.c, gears).g, me); });
        branchesL.forEach(function (b) { uL += w * b.p * worth(outcome(v.order, hands, field, d.wind, autoLast(v.order, b.c), gears).g, me); });
      } else {
        // the later players fight or flee by the quick rule (they see the same open field)
        var fc = base.slice(); fc[me] = 'fight';
        var lc = base.slice(); lc[me] = 'flee';
        fc = laterQuick(v.order, pos, fc, hands, field, gears);
        lc = laterQuick(v.order, pos, lc, hands, field, gears);
        uF += w * worth(outcome(v.order, hands, field, d.wind, fc, gears).g, me);
        uL += w * worth(outcome(v.order, hands, field, d.wind, lc, gears).g, me);
      }
    });
    if (!wsum) return { t: 'fight' };
    uF /= wsum; uL /= wsum; pwin /= wsum;
    if (gears[me] <= 1) return { t: 'fight' };          // fleeing would put me out anyway
    if (level <= 1) return { t: pwin + (rnd() - 0.5) * 0.3 > 0.4 ? 'fight' : 'flee' };
    if (Math.abs(uF - uL) < 0.012) return { t: rnd() < 0.5 ? 'fight' : 'flee' };
    return { t: uF >= uL ? 'fight' : 'flee' };
  }

  /* ------------------------------------------------------------------ the CPU's move */
  function decide(v, level, rnd) {
    rnd = rnd || Math.random;
    level = level || 2;
    if (v.phase === 'pick' && v.turn === v.me) {
      if (v.step === 'peek') return { t: 'peek', slot: choosePeek(v, level, rnd) };
      return { t: 'take', slot: chooseTake(v, level, rnd) };
    }
    if (v.phase === 'escape' && v.turn === v.me) return chooseEscape(v, level, rnd);
    return null;
  }
  // the chance to win the battle if everyone fights (the page shows it in the round summary for learning)
  function winChance(v) {
    var me = v.me, K = knowledge(v), deals = allDeals(v, K), win = 0;
    var field = [];
    v.slots.forEach(function (S) { if (S.by < 0) field.push(S.v); });
    deals.forEach(function (d) {
      var hands = handsOf(v, d);
      var b = E.battle(v.order, hands, field, v.order.slice(), d.wind);
      if (b.winner === me) win++;
    });
    return deals.length ? win / deals.length : 0;
  }

  return { LEVEL_NAME: LEVEL_NAME, decide: decide, worth: worth, winChance: winChance, _allDeals: allDeals, _knowledge: knowledge, KEEP: KEEP };
});
