/* コソドロ・マイン: the CPU miners.
   A CPU only reads what every player can see: trolleys, the pool, who is still in the mine and the
   history of revealed cards. For each rival it forms a guess of 労働/盗み/防衛 by imagining that
   rival weighing its own options (one level of "what would they do?"), corrected by how that rival
   has actually played so far. It then samples many possible tables from those guesses, plays each
   of its own options through the real round rules (KOSO_ENG.core) and picks with a softmax over the
   expected value, so it stays readable but never fully predictable.
   Levels: 1 やさしい, 2 ふつう, 3 つよい. */
(function (root, factory) {
  var E = root && root.KOSO_ENG ? root.KOSO_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KOSO_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  var LEVELS = {
    1: { samples: 70, temp: 2.2, rel: 0.0, think: 0, trust: 0, spUse: 0, noise: 1.1, keepSp: 0.6 },
    2: { samples: 170, temp: 1.1, rel: 0.18, think: 0.55, trust: 3, spUse: 0.05, noise: 0.45, keepSp: 1.4 },
    3: { samples: 300, temp: 0.9, rel: 0.3, think: 0.65, trust: 1.2, spUse: 0.08, noise: 0.15, keepSp: 1.8 }
  };
  var THINK = { samples: 40, temp: 1.2, rel: 0.15, noise: 0, spUse: 0, keepSp: 1.4 };  // a rival, as imagined
  var WIN = 40;

  function sig(x) { return 1 / (1 + Math.exp(-x)); }

  function persona(rng) {
    rng = rng || Math.random;
    return {
      greed: Math.round((rng() * 2 - 1) * 100) / 100,     // appetite for stealing
      vigil: Math.round((rng() * 2 - 1) * 100) / 100,     // appetite for guarding
      talk: Math.round((0.15 + rng() * 0.3) * 100) / 100,  // how often it speaks before a round
      honest: Math.round(rng() * 100) / 100                // how often what it says is true
    };
  }

  /* A quick, rule-of-thumb guess for one rival: more pool means more thieves, rich thieves in the
     season mean more guards. ore/out/susp are arrays by seat; k = players in the season. */
  function priorAt(pool, ore, out, susp, j, k, T) {
    var pe = pool + 0.6 * (k - 1), canSteal = !susp[j];
    var ps = canSteal ? 0.03 + 0.5 * sig((pe - 0.7 * ore[j] - 5.5) / 2.2) : 0;
    if (canSteal && ore[j] + pe / 1.3 >= T) ps += 0.18;
    if (canSteal && k === 2) ps += 0.06;
    var loot = 0;
    for (var m = 0; m < ore.length; m++) {
      if (m === j || out[m] || susp[m]) continue;
      loot += ore[m] * (0.03 + 0.5 * sig((pe - 0.7 * ore[m] - 5.5) / 2.2));
    }
    var pg = 0.025 + 0.4 * sig((loot * 0.9 + (pe >= 2 ? 1.2 : 0) - 5.5) / 2.5);
    if (k === 2) pg *= 0.7;
    if (k > 3) { var crowd = Math.sqrt(2 / (k - 1)); pg *= crowd; ps *= crowd; }  // in a crowd, someone else will
    var pw = Math.max(0.08, 1 - ps - pg);
    var t = pw + ps + pg;
    return { w: pw / t, s: ps / t, g: pg / t };
  }
  function prior(s, j, k) {
    if (k == null) k = E.activeSeats(s).length;
    return priorAt(s.pool, s.P.map(function (p) { return p.ore; }), s.P.map(function (p) { return p.out; }),
      s.P.map(function (p) { return p.susp; }), j, k, s.opts.target);
  }

  /* What this rival actually did in situations like this one: counts of 労働/盗み/防衛 from the
     revealed history, weighted by how close each past round was (pool size, the rival's own
     trolley, how many were still in the season) and how recent it was. */
  function ctxOf(pool, ore, k) { return [pool < 3 ? 0 : pool < 6 ? 1 : pool < 10 ? 2 : 3, ore < 3 ? 0 : ore < 8 ? 1 : 2, k === 2 ? 0 : k <= 4 ? 1 : 2]; }
  var NEAR = [1, 0.3, 0.08, 0.02];
  function observed(s, j, maxAge) {
    var c = { w: 0, s: 0, g: 0 }, n = 0, age = 0;
    var now = ctxOf(s.pool, s.P[j].ore, E.activeSeats(s).length);
    for (var t = s.log.length - 1; t >= 0 && age < maxAge; t--, age++) {
      var L = s.log[t];
      if (!L.o0) continue;
      var picks = L.a.split(','), a = picks[j] || '-';
      if (a !== 'w' && a !== 's' && a !== 'g') continue;
      var k = 0;
      for (var q = 0; q < picks.length; q++) if (picks[q] !== '-') k++;
      var cx = ctxOf(L.p0, L.o0[j], k);
      var wgt = Math.pow(0.985, age) * NEAR[Math.abs(cx[0] - now[0])] * (cx[1] === now[1] ? 1 : 0.5) * (cx[2] === now[2] ? 1 : 0.6);
      c[a] += wgt; n += wgt;
    }
    return { c: c, n: n };
  }

  function utility(s, me, R, cfg) {
    var T = s.opts.target, u = R.delta[me], n = s.P.length, j;
    if (cfg.rel) for (j = 0; j < n; j++) {
      if (j === me || !R.delta[j]) continue;
      var after = Math.max(0, s.P[j].ore + R.delta[j]);
      u -= cfg.rel * R.delta[j] * (0.15 + 0.85 * Math.pow(Math.min(1, after / T), 2));
    }
    if (!R.end && !R.out[me]) {
      var k = 0, thief = false;
      for (j = 0; j < n; j++) if (!R.out[j]) { k++; if (!R.susp[j]) thief = true; }
      // When nobody left in the mine may steal, the day only ends by people leaving: a war of
      // attrition whose fair value is about the guard's wage, however large the pool has grown.
      u += thief ? (R.pool + 2.5 * k) * 0.8 / k : 1.2;
    } else if (R.end && R.pool > 0) u += R.pool * 0.5 / n;
    var w = R.won != null ? R.won : E.winnerOf(R.ore, T);   // core stops the round the moment someone wins
    if (w === me) u += WIN; else if (w >= 0) u -= WIN * 0.8;
    return u;
  }

  function options(s, me) { return E.legalActions(s, me).map(function (a) { return { a: a }; }); }

  /* expected value of every option of seat `me`, given a guess for each rival */
  function evaluateWith(s, me, cfg, probs, rng) {
    var act = E.activeSeats(s), opts = options(s, me);
    var base = E.coreInput(s, [], false);
    var sums = opts.map(function () { return 0; });
    var canSp = act.map(function (j) { return s.opts.adv && !s.P[j].used && !s.P[j].susp; });
    for (var t = 0; t < cfg.samples; t++) {
      var pick = base.pick.slice();
      for (var q = 0; q < act.length; q++) {
        var j = act[q];
        if (j === me) continue;
        var pr = probs[j], r = rng();
        pick[j] = cfg.spUse > 0 && canSp[q] && rng() < cfg.spUse ? 'x' : r < pr.w ? 'w' : r < pr.w + pr.s ? 's' : 'g';
      }
      base.pick = pick;
      for (var o = 0; o < opts.length; o++) {
        pick[me] = opts[o].a;
        sums[o] += utility(s, me, E.core(base), cfg);
      }
    }
    var lateness = 0;
    s.P.forEach(function (p) { lateness = Math.max(lateness, p.ore / s.opts.target); });
    return opts.map(function (op, o) {
      var ev = sums[o] / cfg.samples;
      if (op.a === 'x') ev -= cfg.keepSp * (1 - lateness);   // the special card is worth keeping early on
      return { a: op.a, ev: ev };
    });
  }

  /* habits every miner shares, added to the expected value before the softmax */
  function habit(s, me, a, pers) {
    var lead = 0;
    s.P.forEach(function (p, j) { if (j !== me) lead = Math.max(lead, p.ore); });
    var gap = Math.max(0, lead - s.P[me].ore), b = 0;
    if (a === 'w') b += 0.5 + (s.pool < 4 ? 0.6 : 0);                    // miners like to dig; an empty pool needs no guard
    if (a === 's') b += 1.2 * ((pers && pers.greed) || 0) + 0.03 * gap;
    if (a === 'g') b += 1.0 * ((pers && pers.vigil) || 0) - 0.06 * gap;   // guarding alone is too slow to catch up
    return b;
  }

  function softmax(evs, s, me, temp, noise, pers, rng) {
    var scale = temp * (1 + s.pool / 12);
    var sc = evs.map(function (o) { return (o.ev + habit(s, me, o.a, pers) + (noise ? (rng() * 2 - 1) * noise : 0)) / scale; });
    var mx = Math.max.apply(null, sc), tot = 0;
    var w = sc.map(function (x) { var e = Math.exp(x - mx); tot += e; return e; });
    return w.map(function (x) { return x / tot; });
  }

  /* "what would they do?": the rival weighing its own options against rule-of-thumb guesses */
  function thinkProbs(s, j, rng) {
    var act = E.activeSeats(s), k = act.length, probs = {};
    act.forEach(function (m) { if (m !== j) probs[m] = prior(s, m, k); });
    var evs = evaluateWith(s, j, THINK, probs, rng);
    var w = softmax(evs, s, j, THINK.temp, 0, null, rng);
    var out = { w: 0, s: 0, g: 0 }, t = 0;
    evs.forEach(function (o, i) { if (o.a !== 'x') { out[o.a] += w[i]; t += w[i]; } });   // the one-use card is sampled apart
    if (t > 0) { out.w /= t; out.s /= t; out.g /= t; }
    return out;
  }

  function rivalProbs(s, j, level, rng) {
    var cfg = LEVELS[level] || LEVELS[2], k = E.activeSeats(s).length;
    var pr = prior(s, j, k);
    if (!cfg.think) return pr;
    rng = rng || Math.random;
    var th = thinkProbs(s, j, rng), ob = observed(s, j, 160), out = {}, t = 0;
    ['w', 's', 'g'].forEach(function (a) {
      var base = cfg.think * th[a] + (1 - cfg.think) * pr[a];
      out[a] = (cfg.trust * base + ob.c[a]) / (cfg.trust + ob.n);
    });
    if (s.P[j].susp) out.s = 0;
    ['w', 's', 'g'].forEach(function (a) { t += out[a]; });
    ['w', 's', 'g'].forEach(function (a) { out[a] /= t; });
    return out;
  }

  function evaluate(s, me, level, rng) {
    var cfg = LEVELS[level] || LEVELS[2];
    rng = rng || Math.random;
    var probs = {};
    E.activeSeats(s).forEach(function (j) { if (j !== me) probs[j] = rivalProbs(s, j, level, rng); });
    return evaluateWith(s, me, cfg, probs, rng);
  }

  /* Rounds in a row in which nobody's trolley changed. `flat`: the pool did not grow either (say,
     two leaders level on top who both keep guarding); `still`: only the pool grew (say, two
     miners who both refuse to leave). Only someone trying something new breaks either. */
  function stagnation(s) {
    var still = 0, flat = 0, flatRun = true;
    for (var t = s.log.length - 1; t >= 0 && still < 40; t--) {
      var L = s.log[t], moved = false;
      for (var i = 0; i < L.dl.length && !moved; i++) if (L.dl[i]) moved = true;
      if (moved) break;
      still++;
      if (flatRun && L.p1 <= L.p0) flat++; else flatRun = false;
    }
    return { still: still, flat: flat };
  }

  function decide(s, me, opt) {
    opt = opt || {};
    if (!E.isActive(s, me)) return null;
    var level = opt.level || s.P[me].cpu || 2, cfg = LEVELS[level] || LEVELS[2];
    var rng = opt.rng || Math.random, pers = opt.pers || s.P[me].pers || null;
    var evs = evaluate(s, me, level, rng);
    var stuck = stagnation(s);
    var w = softmax(evs, s, me, cfg.temp, cfg.noise, pers, rng);
    var explore = Math.min(0.6, Math.max(0.1 * (stuck.flat - 1), 0.08 * (stuck.still - 7), 0));   // after a while, try anything
    if (explore > 0) w = w.map(function (x) { return (1 - explore) * x + explore / w.length; });
    var r = rng();
    for (var i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return { a: evs[i].a }; }
    return { a: evs[evs.length - 1].a };
  }

  /* table talk: short lines a CPU may say before a round (true or not) and after the reveal */
  var CHAT = {
    hi: 'よろしく！', work: 'まじめに働こう', trust: '盗まないよ', believe: '信じて！', watch: '見張ってるからね',
    sus: 'あやしい…', soon: 'そろそろ盗む？', unfair: 'ずるい！', nice: 'ナイス！', sorry: 'ごめんね',
    yay: 'いただき！', gotcha: '御用だ！', ouch: 'うぐっ…', last: 'ひとり占め〜', gg: 'おつかれ！'
  };
  var HUMAN_CHAT = ['hi', 'work', 'trust', 'believe', 'watch', 'sus', 'soon', 'unfair', 'nice', 'sorry', 'gg'];
  function pickOne(list, rng) { return list[Math.floor(rng() * list.length) % list.length]; }

  function chatBefore(s, me, pick, pers, rng) {
    rng = rng || Math.random; pers = pers || {};
    if (!pick || rng() > (pers.talk || 0.25)) return null;
    var honest = rng() < (pers.honest != null ? pers.honest : 0.5);
    var a = E.kindOf(s.P[me].ani, pick.a);
    if (a === 'x') return null;
    if (a === 's') return honest ? (s.pool >= 6 ? 'soon' : null) : pickOne(['trust', 'work', 'believe'], rng);
    if (a === 'g') return honest ? pickOne(['watch', 'sus'], rng) : pickOne(['work', 'trust'], rng);
    return pickOne(s.pool >= 7 ? ['sus', 'soon', 'believe', 'work'] : ['work', 'trust', 'believe'], rng);
  }

  function chatAfter(s, ev, me, rng) {
    rng = rng || Math.random;
    if (!ev || !ev.picks[me] || rng() > 0.45) return null;
    var mine = E.kindOf(s.P[me].ani, ev.picks[me].a), lines = [];
    (ev.steps || []).forEach(function (x) {
      if (x.k === 'steal') { if (x.ps.indexOf(me) >= 0 && ev.delta[me] > 0) lines.push('yay'); else if (mine === 'w') lines.push('unfair'); }
      else if (x.k === 'caught') { if (x.p === me) lines.push(x.n ? 'ouch' : 'sorry'); else if (mine === 'g') lines.push('gotcha'); }
      else if (x.k === 'last' && x.p === me) lines.push('last');
    });
    return lines.length ? lines[0] : null;
  }

  return { LEVELS: LEVELS, persona: persona, stagnation: stagnation, prior: prior, priorAt: priorAt, observed: observed, thinkProbs: thinkProbs,
    rivalProbs: rivalProbs, evaluate: evaluate, decide: decide,
    CHAT: CHAT, HUMAN_CHAT: HUMAN_CHAT, chatBefore: chatBefore, chatAfter: chatAfter };
});
