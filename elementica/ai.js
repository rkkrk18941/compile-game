/* エレメンティカ — the CPU. It looks one action ahead (two for the strong level), picks choices with quick
   rules of thumb, and scores the result with an estimate of the final score.
   decide(S, level, rnd) answers whoever must decide now:
     { k: 'prep', hex } | { k: 'action', free: [...], move: { slots, choices } } | { k: 'produce', free: [...], plan } */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EL_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  var E = G && G.EL_ENG ? G.EL_ENG : (typeof require === 'function' ? require('./engine.js') : null);

  var COIN = 0.33, GEM = 0.5;

  function light(S) { var lg = S.log; S.log = []; var c = JSON.parse(JSON.stringify(S)); S.log = lg; return c; }

  function roundsLeft(S) {
    if (S.final != null) return Math.max(1, S.final - S.round + 1);
    var top = 0;
    S.players.forEach(function (p) { if (p.vp > top) top = p.vp; });
    var pace = Math.max(2.5, top / Math.max(1, S.round));
    var r = Math.ceil(Math.max(0, E.END_VP - top) / pace) + 1;
    return Math.max(1, Math.min(9, r));
  }

  // rough worth of gaining atoms, in VP
  function atomWorth(S, p, a, R) {
    switch (a.t) {
      case 'coin': return a.n * COIN;
      case 'gem': return a.n * GEM;
      case 'vp': return a.n;
      case 'res': return a.n * (p.res < 10 ? 0.5 : 0.35);
      case 'work': return p.work < 5 ? 0.55 * a.n : (p.work < E.WORK_MAX ? 0.25 : 1);
      case 'mine': return p.mine < 4 ? 0.7 * a.n : (p.mine < E.MINE_MAX ? 0.2 : 1);
      case 'water': return p.water < 4 ? 0.65 * a.n : (p.water < E.WATER_MAX ? 0.3 : 1);
      case 'env': {
        var gaia = p.forge.filter(function (f) { return f && !f.art && E.PLANTS[f.key].color === 'G'; }).length;
        return a.n * (gaia ? 0.25 * gaia : -0.05);
      }
      case 'cpw': return Math.max(1, Math.min(p.water, a.max)) * COIN;
      case 'gpm': return Math.max(1, Math.min(p.mine, a.max)) * GEM;
      case 'base': return 1.1;
      case 'build': return 1.4;
    }
    return 0;
  }
  function fxWorth(S, p, atoms, R) { return atoms.reduce(function (s, a) { return s + atomWorth(S, p, a, R); }, 0); }
  function tokenWorth(S, p, id) {
    var T = E.TOKEN_TYPES[S.toks[id].type], f = T.front, w = fxWorth(S, p, f.fx, 3);
    if (f.cost) w -= (f.cost.coin || 0) * COIN + (f.cost.gem || 0) * GEM;
    return Math.max(w, COIN);
  }

  // mana the player can count on next production, with some of the paid plants
  function expectedMana(S, pid) {
    var p = S.players[pid], info = E.produceInfo(S, pid), mana = info.fixed;
    var gems = p.gems, coins = Math.max(0, p.coins - E.SALARY[p.work]);
    info.fire.slice().sort(function (a, b) { return b.mana - a.mana; }).forEach(function (t) {
      var u = Math.min(t.uses, Math.floor(gems / t.gem)); gems -= u * t.gem; mana += u * t.mana * 0.85;
    });
    info.dark.slice().sort(function (a, b) { return b.mana / b.coin - a.mana / a.coin; }).forEach(function (t) {
      var u = Math.min(t.uses, Math.floor(coins / t.coin)); coins -= u * t.coin; mana += u * t.mana * 0.75;
    });
    return Math.min(E.MANA_MAX, Math.floor(mana));
  }
  // planning worth of a steady mana level per round: the track pays about 0.3 VP and 0.35 coins per mana
  function manaWorth(m) { return Math.max(0, Math.min(E.MANA_MAX, m)) * (0.3 + 0.35 * COIN); }

  // an estimate of pid's final score
  function value(S, pid, areas) {
    var p = S.players[pid], R = roundsLeft(S), v = p.vp;
    if (S.phase === 'end') return E.scoreOf(S, pid).total;
    v += p.coins * COIN + p.gems * GEM;
    var inc = (p.gemInc[0] ? 1 : 0) + (p.gemInc[1] ? 1 : 0);
    v += (inc * GEM + (p.coinInc ? 2 * COIN : 0)) * R;
    v -= E.SALARY[p.work] * COIN * R;
    v += manaWorth(expectedMana(S, pid)) * R * 0.9;
    var late = R >= 2 ? 1 : 0.3;
    v += late * (Math.min(p.work, 5) * 0.3 + Math.min(p.mine, 4) * 0.3 + Math.min(p.water, 4) * 0.3);
    v += late * (p.res >= 10 ? 1.4 : p.res >= 5 ? 0.8 : p.res * 0.1);
    if (p.res >= E.RES_END) v += 2; else if (p.res >= 11) v += 0.7;
    for (var c = 0; c < 3; c++) {
      var filled = [0, 3, 6, 9].filter(function (o) { return p.forge[o + c]; }).length;
      v += filled === 4 ? E.FORGE_COL_VP[c] : filled * E.FORGE_COL_VP[c] / 4 * 0.45;
    }
    areas = areas || E.areaScores(S);
    var map = areas.reduce(function (s, a) { return s + a.rows[pid].vp; }, 0);
    v += map * (0.55 + 0.4 / R);
    v += E.scoreOf(S, pid, areas).objectives * 0.9;
    if (p.objs.length < E.MAX_OBJ && p.res < 7) v += 0.4;
    var deck = p.standby.concat(p.used);
    var dv = 0;
    deck.forEach(function (id) { dv += tokenWorth(S, p, id); });
    v += dv * 0.12 - Math.max(0, deck.length - 9) * 0.15;
    v += p.bases * 0.05 * late;
    return v;
  }
  function rivalsBest(S, pid) {
    var best = -1e9;
    S.players.forEach(function (o, i) { if (i !== pid) { var x = value(S, i); if (x > best) best = x; } });
    return best;
  }

  /* ------------------------------------------------------------------ choices inside an action */
  function chooser(S, pid, level, rnd) {
    return function (req) {
      if (req.k === 'hex') return pickHex(S, pid, req, level, rnd);
      if (req.k === 'build') return pickBuild(S, pid, req, level, rnd);
      if (req.k === 'obj') return pickObj(S, pid, req);
      return null;
    };
  }
  function hexScore(S, pid, o, R) {
    var p = S.players[pid], h = S.hexes[o.hex], s = fxWorth(S, p, h.bonus, R) - o.cost.total * COIN;
    if (h.token) s += tokenWorth(S, p, h.token) * 0.9;
    var own = E.neighbors(S, o.hex).filter(function (n) { return S.hexes[n].base === pid; }).length;
    s += own * 0.35;
    if (!S.hexes.some(function (x) { return x.base === pid && x.area === h.area; })) s += 0.8;
    p.objs.forEach(function (ob) {
      var t = { J5: 'gem', J6: 'coin', J7: 'mine', J8: 'water' }[ob.id];
      if (t && h.bonus.some(function (a) { return a.t === t; })) s += t === 'mine' || t === 'water' ? 1.3 : 0.8;
    });
    return s;
  }
  function pickHex(S, pid, req, level, rnd) {
    var R = roundsLeft(S);
    var scored = req.options.map(function (o) { return { o: o, s: hexScore(S, pid, o, R) + (level < 2 ? rnd() * 1.2 : 0) }; })
      .sort(function (a, b) { return b.s - a.s; });
    var top = scored.slice(0, level >= 3 ? 5 : level === 2 ? 3 : 1), best = null, bestV = -1e9;
    if (top.length === 1) return top[0].s > -0.2 || req.prep ? top[0].o.hex : null;
    var base = req.prep ? -1e9 : value(S, pid);
    top.forEach(function (t) {
      var c = light(S);
      try { E.drive(placeOnly(c, pid, t.o.hex, req.prep), function () { return null; }); } catch (e) { return; }
      var v = value(c, pid);
      if (v > bestV) { bestV = v; best = t.o.hex; }
    });
    if (!req.prep && bestV < base - 0.05) return null;
    return best;
  }
  function* placeOnly(S, pid, hex, prep) {
    // a quick, choice-free placement used only to look at a candidate hex
    var it = prep ? E.prepGen(S, pid) : baseGen(S, pid), r = it.next();
    while (!r.done) r = it.next(r.value.k === 'hex' ? hex : null);
  }
  function* baseGen(S, pid) { yield* E.actionGen(S, pid, [{ skip: true }, null, { skip: true }]); }

  function plantScore(S, pid, key, R) {
    var p = S.players[pid], P = E.PLANTS[key], pr = P.prod, m = 0;
    if (pr.k === 'gaia') m = pr.base + E.envBand(Math.max(0, Math.min(10, S.env + P.env)));
    else if (pr.k === 'water') {
      var tiles = [];
      p.forge.forEach(function (f) { if (f && !f.art && E.PLANTS[f.key].prod.k === 'water') tiles.push(E.PLANTS[f.key].prod); });
      var before = E.waterMana(tiles, p.water); tiles.push(pr);
      m = E.waterMana(tiles, p.water + 1) - before; // count on one more water later
    } else if (pr.k === 'fire') m = Math.min(pr.uses, p.gems + 1 + ((p.gemInc[0] ? 1 : 0) + (p.gemInc[1] ? 1 : 0)) * 2) * pr.mana * 0.7;
    else if (pr.k === 'dark') m = pr.uses * pr.mana * 0.55;
    var s = m * 0.42 * Math.max(1, R - 0.5) - plantCostOf(S, key) * COIN;
    p.objs.forEach(function (ob) {
      if ((ob.id === 'J1' && P.color === 'G') || (ob.id === 'J2' && P.color === 'B') || (ob.id === 'J3' && P.color === 'O') || (ob.id === 'J4' && P.color === 'P')) s += 1.3;
      if (ob.id === 'J13' && P.lv === 2) s += 1.3;
      if (ob.id === 'J14' && P.lv === 3) s += 2;
      if (ob.id === 'J12') s += 0.5;
    });
    return s;
  }
  function plantCostOf(S, key) { return key === 'ART' ? E.artifactCost(S) * GEM / COIN : E.plantCost(S, key); }
  function spaceScore(S, p, sp, R) {
    var r = Math.floor(sp / 3), c = sp % 3, s = fxWorth(S, p, E.FORGE_SPACE[sp], R);
    var rowFilled = [0, 1, 2].filter(function (k) { return p.forge[r * 3 + k]; }).length;
    if (rowFilled === 2) s += fxWorth(S, p, E.FORGE_ROW[r], R);
    else s += rowFilled * 0.25;
    var colFilled = [0, 3, 6, 9].filter(function (o) { return p.forge[o + c]; }).length;
    s += colFilled * 0.3 + (colFilled === 3 ? E.FORGE_COL_VP[c] * 0.8 : 0);
    return s;
  }
  function pickBuild(S, pid, req, level, rnd) {
    var p = S.players[pid], R = roundsLeft(S);
    var plants = req.options.map(function (o) {
      var s = o.art ? artScore(S, pid, R) : plantScore(S, pid, o.key, R);
      return { o: o, s: s + (level < 2 ? rnd() * 1.5 : 0) };
    }).sort(function (a, b) { return b.s - a.s; });
    var cands = [];
    plants.slice(0, level >= 3 ? 4 : 2).forEach(function (pl) {
      var spaces = pl.o.art ? req.pairs : req.spaces;
      var best = null, bs = -1e9;
      spaces.forEach(function (sp) {
        var sc = spaceScore(S, p, sp, R) + (pl.o.art ? spaceScore(S, p, sp + 1, R) * 0.8 : 0);
        if (sc > bs) { bs = sc; best = sp; }
      });
      if (best != null) cands.push({ key: pl.o.key, space: best });
    });
    var base = value(S, pid), bestV = base + 0.2, pick = null;
    cands.forEach(function (cd) {
      var c = light(S);
      try { E.drive(buildOnly(c, pid), function (q) { return q.k === 'build' ? cd : q.k === 'obj' ? (q.options[0] || null) : null; }); }
      catch (e) { return; }
      var v = value(c, pid);
      if (v > bestV) { bestV = v; pick = cd; }
    });
    return pick;
  }
  function artScore(S, pid, R) {
    var p = S.players[pid], cols = E.artifactDef(S.artifact.id).colors, cnt = 0;
    p.standby.concat(p.used).forEach(function (id) { if (cols.indexOf(S.toks[id].color) >= 0) cnt++; });
    return (cnt + 1) * 0.42 * Math.max(1, R - 0.5) - E.artifactCost(S) * GEM;
  }
  function* buildOnly(S, pid) { yield* E.actionGen(S, pid, [{ skip: true }, { skip: true }, null]); }

  function pickObj(S, pid, req) {
    var best = null, bs = -1e9, p = S.players[pid];
    req.options.forEach(function (id) {
      var now = E.objectiveVp(S, pid, id, null, null), pot = 1.5;
      if (id === 'J17') pot = Math.min(E.WORK_MAX, p.work + 2) - p.work;
      if (id === 'J18') pot = 2;
      if (id === 'J9' || id === 'J15') pot = 2;
      if (id === 'J10' || id === 'J11') pot = 1;
      var s = now + pot;
      if (s > bs) { bs = s; best = id; }
    });
    return best;
  }

  /* ------------------------------------------------------------------ plans for one action */
  function planList(S, pid, level) {
    var p = S.players[pid];
    var types = {}, order = [];
    p.standby.forEach(function (id) {
      var t = S.toks[id].type;
      if (!types[t]) { types[t] = []; order.push(t); }
      types[t].push(id);
    });
    var plans = [[null, null, null]];
    function take(used, t) { var list = types[t]; for (var i = 0; i < list.length; i++) if (used.indexOf(list[i]) < 0) return list[i]; return null; }
    function frontWeak(t) { var f = E.TOKEN_TYPES[t].front; return !!f.cost; }
    // one chip
    order.forEach(function (t) {
      for (var s = 0; s < 3; s++) {
        var pl = [null, null, null]; pl[s] = { tok: types[t][0], face: 'f' }; plans.push(pl);
        if (frontWeak(t)) { var b = [null, null, null]; b[s] = { tok: types[t][0], face: 'b' }; plans.push(b); }
      }
    });
    // two chips
    var pairsAt = [[0, 1], [0, 2], [1, 2]];
    order.forEach(function (a) {
      order.forEach(function (b) {
        pairsAt.forEach(function (pos) {
          var used = [], ta = take(used, a); if (!ta) return; used.push(ta);
          var tb = take(used, b); if (!tb) return;
          var pl = [null, null, null]; pl[pos[0]] = { tok: ta, face: 'f' }; pl[pos[1]] = { tok: tb, face: 'f' }; plans.push(pl);
        });
      });
    });
    // three chips: every order if few kinds, otherwise the ones that match a row and the best by worth
    var triples = [];
    order.forEach(function (a) { order.forEach(function (b) { order.forEach(function (c) {
      var used = [], ta = take(used, a); if (!ta) return; used.push(ta);
      var tb = take(used, b); if (!tb) return; used.push(tb);
      var tc = take(used, c); if (!tc) return;
      triples.push([ta, tb, tc]);
    }); }); });
    var full = order.length <= 5 || level >= 3;
    var rowsFull = [0, 1, 2, 3].some(function (r) { return E.rowFull(p, r); });
    var keep = triples.filter(function (tr) {
      if (full) return true;
      if (rowsFull && E.matchRows(p, tr.map(function (id) { return S.toks[id].color; })).length) return true;
      return false;
    });
    if (!full) {
      triples.map(function (tr) { return { tr: tr, w: tr.reduce(function (s, id) { return s + tokenWorth(S, p, id); }, 0) }; })
        .sort(function (x, y) { return y.w - x.w; }).slice(0, 12).forEach(function (x) { keep.push(x.tr); });
    }
    keep.forEach(function (tr) {
      plans.push(tr.map(function (id) { return { tok: id, face: 'f' }; }));
      if (rowsFull) {
        // a matching row may be worth the plain backs of weak chips
        var cols = tr.map(function (id) { return S.toks[id].color; });
        if (E.matchRows(p, cols).length) plans.push(tr.map(function (id) { return { tok: id, face: tokenWorth(S, p, id) < 0.4 ? 'b' : 'f' }; }));
      }
    });
    // de-duplicate by chip type
    var seen = {}, out = [];
    plans.forEach(function (pl) {
      var key = pl.map(function (s) { return s ? S.toks[s.tok].type + s.face : '-'; }).join('|');
      if (!seen[key]) { seen[key] = 1; out.push(pl); }
    });
    return out;
  }

  function tryPlan(S, pid, slots, level, rnd) {
    var c = light(S), choices;
    try { choices = E.drive(E.actionGen(c, pid, slots), chooser(c, pid, level, rnd)); }
    catch (e) { return null; }
    return { state: c, choices: choices };
  }
  function bestAction(S, pid, level, rnd, keepTop) {
    var plans = planList(S, pid, level), scored = [];
    var cap = level === 1 ? 40 : level === 2 ? 160 : 400;
    if (plans.length > cap) {
      var first = plans.slice(0, 1), rest = plans.slice(1);
      // keep a spread: shuffle deterministically, then cut
      for (var i = rest.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      plans = first.concat(rest.slice(0, cap - 1));
    }
    plans.forEach(function (slots) {
      var r = tryPlan(S, pid, slots, level, rnd);
      if (!r) return;
      var v = value(r.state, pid);
      if (level >= 3) v -= 0.15 * (rivalsBest(r.state, pid) - rivalsBest(S, pid));
      if (level === 1) v += rnd() * 2.2; else if (level === 2) v += rnd() * 0.4;
      scored.push({ slots: slots, choices: r.choices, v: v, state: r.state });
    });
    scored.sort(function (a, b) { return b.v - a.v; });
    return keepTop ? scored.slice(0, keepTop) : scored[0];
  }

  /* ------------------------------------------------------------------ free actions */
  function freeBefore(S, pid, level) {
    var p = S.players[pid], out = [];
    if (level < 2) return out;
    var deck = p.standby.concat(p.used).filter(function (id) { return S.toks[id].color !== 'N'; });
    if (deck.length >= 9) {
      var worst = deck.map(function (id) { return { id: id, w: tokenWorth(S, p, id), c: S.toks[id].color }; }).sort(function (a, b) { return a.w - b.w; });
      for (var i = 0; i < worst.length && out.length === 0; i++) {
        if (worst[i].w > 0.55) break;
        for (var j = i + 1; j < worst.length; j++) {
          if (worst[j].w > 0.65) break;
          var ci = worst[i].c, cj = worst[j].c;
          if (ci === cj || ci === 'W' || cj === 'W') { out.push({ k: 'rm2', a: worst[i].id, b: worst[j].id }); break; }
        }
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ production */
  function bestProduce(S, pid, level) {
    var p = S.players[pid], info = E.produceInfo(S, pid), best = null, bestV = -1e9;
    var fireOpts = [[]], darkOpts = [[]];
    info.fire.forEach(function (t) { var next = []; fireOpts.forEach(function (o) { for (var u = 0; u <= t.uses; u++) next.push(o.concat([u])); }); fireOpts = next; });
    info.dark.forEach(function (t) { var next = []; darkOpts.forEach(function (o) { for (var u = 0; u <= t.uses; u++) next.push(o.concat([u])); }); darkOpts = next; });
    var salary = E.SALARY[p.work], income = (p.coinInc ? 2 : 0);
    var price = E.gemPrice(S.env), buys = info.fire.length && level >= 2 ? [0, 1, 2, 3] : [0];
    buys.forEach(function (buy) {
      if (buy * price > p.coins) return;
      fireOpts.forEach(function (f) { darkOpts.forEach(function (d) {
        var plan = { fire: f, dark: d };
        var q = { players: S.players.map(function (x, i) { return i === pid ? Object.assign({}, x, { gems: x.gems + buy, coins: x.coins - buy * price }) : x; }) };
        var r = E.produceResult(Object.assign({}, S, q), pid, plan);
        if (!r.ok) return;
        var coinsAfter = p.coins - buy * price - r.coins + r.gain + income;
        var short = Math.max(0, salary - coinsAfter);
        var spare = Math.max(0, p.gems + buy - 3), gemUse = Math.min(r.gems, spare) * 0.25 + Math.max(0, r.gems - spare) * GEM;
        var v = r.vp + r.gain * COIN - r.coins * COIN - gemUse - buy * price * COIN + buy * GEM - short * 1.0 + r.disc * 0.02;
        if (v > bestV) { bestV = v; best = { plan: plan, buy: buy }; }
      }); });
    });
    var free = [];
    for (var b = 0; b < (best ? best.buy : 0); b++) free.push({ k: 'buy' });
    return { k: 'produce', free: free, plan: best ? best.plan : {} };
  }

  /* ------------------------------------------------------------------ entry */
  function decide(S, level, rnd) {
    level = level || 2;
    rnd = rnd || Math.random;
    var w = E.who(S);
    if (!w) return null;
    var pid = w.pid;
    if (w.kind === 'prep') {
      var legal = E.legalHexes(S, pid, true);
      return { k: 'prep', hex: pickHex(S, pid, { k: 'hex', prep: true, options: legal }, level, rnd) };
    }
    if (w.kind === 'produce') return bestProduce(S, pid, level);
    // action
    var free = freeBefore(S, pid, level), T = S;
    if (free.length) { T = light(S); free.forEach(function (a) { try { E.applyFree(T, pid, a); } catch (e) {} }); }
    var pick;
    if (level >= 3 && w.left >= 2) {
      var tops = bestAction(T, pid, level, rnd, 5), bestV = -1e9;
      tops.forEach(function (t) {
        // the same player acts again right away: look at the best follow-up
        var c = t.state;
        c.phase = 'action';
        var nxt = bestAction(c, pid, 2, rnd);
        var v = nxt ? nxt.v : t.v;
        if (v > bestV) { bestV = v; pick = t; }
      });
    } else pick = bestAction(T, pid, level, rnd);
    if (!pick) return { k: 'action', free: free, move: { slots: [null, null, null], choices: [] } };
    return { k: 'action', free: free, move: { slots: pick.slots, choices: pick.choices } };
  }

  return { decide: decide, value: value, roundsLeft: roundsLeft, planList: planList, tokenWorth: tokenWorth };
});
