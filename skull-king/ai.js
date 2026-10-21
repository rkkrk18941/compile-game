/* スカルキング — the CPU. It decides from a view only (never the full state), like a person at the table.
   choose(view, { level, seed }) → an action for view.me.
     easy    bids by feel and plays a simple greedy hand with some mistakes
     normal  bids by simulating the round, plays the greedy hand without mistakes
     hard    simulates the rest of the round many times for every bid, card and pirate ability
   A simulation deals the unseen cards to the other players (respecting the suits they have shown they lack) and plays
   the round out with the greedy hand for everybody. */
(function (root, factory) {
  var E = root && root.SK_ENGINE ? root.SK_ENGINE : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SK_AI = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  var CARDS = E.CARDS, TIGRESS = E.TIGRESS;

  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      var t = (a = (a + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  /* ================================================================ how strong a card is
     power: the chance-ish that the card takes a trick it is thrown into (used to rank cards, not as a probability). */
  function power(id, as) {
    var c = CARDS[id];
    switch (c.t) {
      case 'num': return c.s === 'k' ? 0.42 + 0.034 * c.n : 0.05 + 0.04 * c.n;
      case 'king': return 0.97;
      case 'pirate': return 0.86;
      case 'tigress': return as === 'pirate' ? 0.85 : 0;
      case 'mermaid': return 0.78;
      case 'kraken': return 0.012;
      case 'whale': return 0.015;
      default: return 0;     // escape, loot
    }
  }
  function pw(o) { return power(o.id, o.as); }
  function bestPower(id) { return id === TIGRESS ? power(id, 'pirate') : power(id); }

  // A rough count of the tricks a card takes, for guessing what the others will bid.
  var BLACK_WIN = [0, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.27, 0.31, 0.36, 0.42, 0.5, 0.58, 0.68, 0.8];
  var PLAIN_WIN = [0, 0.02, 0.02, 0.03, 0.03, 0.04, 0.04, 0.05, 0.07, 0.1, 0.15, 0.22, 0.31, 0.42, 0.55];
  function staticWin(id, n) {
    var c = CARDS[id], few = n <= 3;
    switch (c.t) {
      case 'king': return 0.92;
      case 'pirate': return few ? 0.85 : 0.74;
      case 'tigress': return few ? 0.78 : 0.68;
      case 'mermaid': return few ? 0.6 : 0.5;
      case 'num':
        if (c.s === 'k') return BLACK_WIN[c.n] * (few ? 1.1 : 1);
        return PLAIN_WIN[c.n] * Math.sqrt(4 / Math.max(2, n));
      default: return 0;
    }
  }
  function feelBid(hand, n, cards) {
    var e = 0;
    hand.forEach(function (id) { e += staticWin(id, n); });
    return Math.max(0, Math.min(cards, Math.round(e)));
  }

  /* ================================================================ moves */
  function expand(ids) {
    var out = [];
    ids.forEach(function (id) { if (id === TIGRESS) { out.push({ id: id, as: 'pirate' }); out.push({ id: id, as: 'escape' }); } else out.push({ id: id }); });
    return out;
  }
  function toAction(o) { var a = { t: 'play', id: o.id }; if (o.as) a.as = o.as; return a; }
  function minBy(list, f) { var b = null, bv = Infinity; list.forEach(function (x) { var v = f(x); if (v < bv) { bv = v; b = x; } }); return b; }
  function maxBy(list, f) { var b = null, bv = -Infinity; list.forEach(function (x) { var v = f(x); if (v > bv) { bv = v; b = x; } }); return b; }

  // The greedy hand: want tricks → win as cheaply as is safe; want none → throw the most dangerous card that loses.
  //   need  tricks still wanted (bid − won; ≤ 0 means "lose everything from now on")
  //   after players still to play after this one in the trick
  //   left  tricks left in the round, this one included
  function greedy(hand, plays, need, after, seat, left) {
    var opts = expand(E.legalCards(hand, plays));
    if (opts.length === 1) return opts[0];
    if (!plays.length) return lead(opts, need, left);
    var wins = [], loses = [];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i], p = { seat: seat, id: o.id };
      if (o.as) p.as = o.as;
      var r = E.resolve(plays.concat([p]));
      if (r.kind === 'win' && r.winner === plays.length) wins.push(o); else loses.push(o);
    }
    if (need > 0) {
      if (wins.length) {
        if (after === 0) return minBy(wins, pw);
        var thr = Math.min(0.93, 0.5 + 0.07 * after);
        var safe = wins.filter(function (o) { return pw(o) >= thr; });
        if (safe.length && need < left) return minBy(safe, pw);
        var top = maxBy(wins, pw);
        if (need >= left || pw(top) >= 0.35) return top;
      }
      return minBy(opts, keepValue);
    }
    if (loses.length) return maxBy(loses, pw);
    return after === 0 ? maxBy(opts, pw) : minBy(opts, pw);
  }
  // What a card is worth keeping when it is thrown away: escapes and the beasts are useful later, so throw low numbers first.
  function keepValue(o) {
    var c = CARDS[o.id];
    if (c.t === 'escape' || c.t === 'loot') return 0.3;
    if (c.t === 'kraken' || c.t === 'whale') return 0.45;
    return pw(o);
  }
  function lead(opts, need, left) {
    if (need > 0) {
      var top = maxBy(opts, pw);
      if (need >= left || pw(top) >= 0.84) return top;
      var nums = opts.filter(function (o) { return E.isNum(o.id); });
      var hi = maxBy(nums, pw);
      if (hi && pw(hi) >= 0.55 && need * 2 >= left) return hi;
      return minBy(opts, keepValue);
    }
    var low = opts.filter(function (o) { return E.isNum(o.id) && pw(o) < 0.3; });
    if (low.length) return minBy(low, pw);
    return minBy(opts, pw);
  }

  /* ================================================================ what is known */
  function knowledge(v) {
    var me = v.me, gone = {}, known = {};
    v.hand.forEach(function (id) { gone[id] = 1; });
    v.played.forEach(function (id) { gone[id] = 1; });
    (v.discarded || []).forEach(function (id) { gone[id] = 1; });
    if (v.seen) v.seen.forEach(function (id) { if (!gone[id]) known[id] = 1; });   // フアニータで見た山札
    var unseen = E.deckFor(v.opts).filter(function (id) { return !gone[id] && !known[id]; });
    var voids = {}, others = [], sizes = {};
    for (var s = 0; s < v.n; s++) { voids[s] = {}; if (s !== me) { others.push(s); sizes[s] = v.players[s].hand; } }
    if (v.ghost) { others.push(v.G); sizes[v.G] = v.ghostHand; voids[v.G] = {}; }
    var tricks = v.tricks.map(function (t) { return t.plays; });
    if (v.trick) tricks.push(v.trick.plays);
    tricks.forEach(function (plays) {
      for (var i = 1; i < plays.length; i++) {
        var p = plays[i];
        if (p.seat === v.G || !E.isNum(p.id)) continue;
        var ls = E.leadSuit(plays.slice(0, i));
        if (ls && E.suitOf(p.id) !== ls) voids[p.seat][ls] = true;
      }
    });
    return { unseen: unseen, voids: voids, others: others, sizes: sizes };
  }
  function sampleWorld(k, rnd) {
    var order = k.others.slice().sort(function (a, b) { return Object.keys(k.voids[b]).length - Object.keys(k.voids[a]).length; });
    for (var attempt = 0; attempt < 24; attempt++) {
      var pool = shuffle(k.unseen.slice(), rnd), hands = {}, ok = true, strict = attempt < 20;
      for (var oi = 0; oi < order.length && ok; oi++) {
        var s = order[oi], need = k.sizes[s], h = [];
        for (var j = 0; j < pool.length && h.length < need; j++) {
          var id = pool[j];
          if (id < 0) continue;
          if (strict && E.isNum(id) && k.voids[s][E.suitOf(id)]) continue;
          h.push(id); pool[j] = -1;
        }
        if (h.length < need) ok = false; else hands[s] = h;
      }
      if (ok) return hands;
    }
    return hands;
  }

  /* ================================================================ playing a round out */
  function context(v) {
    var me = v.me, mine = v.players[me];
    return {
      me: me, n: v.n, G: v.G, ghost: v.ghost, roundLeader: v.roundLeader, cards: v.cards, opts: v.opts,
      won: v.players.map(function (p) { return p.won; }), tricksDone: v.tricksDone,
      trick: v.trick ? { order: v.trick.order.slice(), plays: v.trick.plays.slice() } : null,
      nextLeader: v.phase === 'bid' ? v.roundLeader : (v.ability && v.ability.next != null ? v.ability.next : v.roundLeader),
      myBonus: mine.bonus.reduce(function (s, x) { return s + x.pts; }, 0),
      allies: v.alliances.filter(function (a) { return a.a === me || a.b === me; }).map(function (a) { return a.a === me ? a.b : a.a; }),
      wager: mine.wager || 0, cannon: !!mine.cannon
    };
  }
  function handsFor(world, v) {
    var h = [];
    for (var s = 0; s < v.n + (v.ghost ? 1 : 0); s++) h.push(s === v.me ? v.hand.slice() : (world[s] || []).slice());
    return h;
  }
  function removeOne(a, id) { var i = a.indexOf(id); if (i >= 0) a.splice(i, 1); }

  function simulate(ctx, hands, targets, rnd, firstMove, nextLeader) {
    var won = ctx.won.slice(), myBonus = ctx.myBonus, allies = ctx.allies.slice(), me = ctx.me;
    var trick = ctx.trick ? { order: ctx.trick.order, plays: ctx.trick.plays.slice() } : null;
    var leader = nextLeader != null ? nextLeader : ctx.nextLeader, left = ctx.cards - ctx.tricksDone;
    var g = { ghost: ctx.ghost, roundLeader: ctx.roundLeader, n: ctx.n };
    while (left > 0) {
      if (!trick) trick = { order: E.orderFrom(g, leader), plays: [] };
      while (trick.plays.length < trick.order.length) {
        var s = trick.order[trick.plays.length], mv;
        var hs = hands[s];
        if (!hs.length) return null;                       // a sampling slip; skip this world
        if (s === ctx.G) { var gid = hs[Math.floor(rnd() * hs.length)]; mv = { id: gid, as: gid === TIGRESS ? 'escape' : undefined }; }
        else if (firstMove && s === me) { mv = firstMove; firstMove = null; }
        else mv = greedy(hs, trick.plays, targets[s] - won[s], trick.order.length - trick.plays.length - 1, s, left);
        removeOne(hs, mv.id);
        var p = { seat: s, id: mv.id };
        if (mv.as) p.as = mv.as;
        trick.plays.push(p);
      }
      var res = E.resolve(trick.plays);
      if (res.kind === 'win') {
        var ws = trick.plays[res.winner].seat;
        if (ws !== ctx.G) {
          won[ws]++;
          var b = E.trickBonus(trick.plays, res);
          if (ws === me) for (var bi = 0; bi < b.list.length; bi++) myBonus += b.list[bi].pts;
          for (var ai = 0; ai < b.alliances.length; ai++) {
            var al = b.alliances[ai];
            if (al.a === me) allies.push(al.b); else if (al.b === me) allies.push(al.a);
          }
        }
      }
      leader = res.next; trick = null; left--;
    }
    return { won: won, myBonus: myBonus, allies: allies };
  }
  function scoreFor(ctx, sim, bid, targets, cannon) {
    var loot = 0;
    sim.allies.forEach(function (p) { if (targets[p] === sim.won[p]) loot++; });
    return E.roundScore({ bid: bid, won: sim.won[ctx.me], cards: ctx.cards, bonus: sim.myBonus, loot: loot, wager: ctx.wager, cannon: cannon == null ? ctx.cannon : cannon }, ctx.opts).total;
  }
  function targetsFrom(v, world) {
    return v.players.map(function (p, i) {
      if (p.bid != null) return p.bid;
      if (i === v.me) return 0;
      return feelBid(world[i] || [], v.n, v.cards);
    });
  }

  /* ================================================================ decisions */
  function chooseBid(v, lvl, rnd) {
    var cards = v.cards, a;
    if (lvl === 'easy') {
      var b = feelBid(v.hand, v.n, cards);
      if (rnd() < 0.45) b += rnd() < 0.5 ? -1 : 1;
      a = { t: 'bid', n: Math.max(0, Math.min(cards, b)) };
      if (v.opts.cannon) a.cannon = rnd() < 0.25;
      return a;
    }
    var S = lvl === 'hard' ? 72 : 26;
    var k = knowledge(v), ctx = context(v);
    var tot = zeros(cards + 1), exact = zeros(cards + 1), off1 = zeros(cards + 1), runs = zeros(cards + 1);
    for (var s = 0; s < S; s++) {
      var world = sampleWorld(k, rnd), targets = targetsFrom(v, world);
      for (var bid = 0; bid <= cards; bid++) {
        targets[v.me] = bid;
        var sim = simulate(ctx, handsFor(world, v), targets, rnd, null);
        if (!sim) continue;
        var w = sim.won[v.me];
        tot[bid] += scoreFor(ctx, sim, bid, targets, false); runs[bid]++;
        if (w === bid) exact[bid]++; else if (Math.abs(w - bid) === 1) off1[bid]++;
      }
    }
    var best = 0, bestV = -Infinity;
    for (var i = 0; i <= cards; i++) { var m = runs[i] ? tot[i] / runs[i] : -Infinity; if (m > bestV + 1e-9) { bestV = m; best = i; } }
    a = { t: 'bid', n: best };
    if (v.opts.cannon) a.cannon = exact[best] > off1[best];   // 大砲（15点）が散弾より得なのは、ぴったりの見込みが1ずれより高いとき
    return a;
  }

  function choosePlay(v, lvl, rnd) {
    var me = v.me, plays = v.trick.plays;
    var options = expand(E.legalCards(v.hand, plays));
    if (options.length === 1) return toAction(options[0]);
    var mine = v.players[me];
    var need = mine.bid - mine.won, after = v.trick.order.length - plays.length - 1, left = v.cards - v.tricksDone;
    var g = greedy(v.hand, plays, need, after, me, left);
    if (lvl === 'easy') return toAction(rnd() < 0.3 ? options[Math.floor(rnd() * options.length)] : g);
    if (lvl !== 'hard') return toAction(g);
    var k = knowledge(v), ctx = context(v);
    var targets = v.players.map(function (p) { return p.bid; });
    var S = Math.max(24, Math.min(90, Math.floor(720 / options.length)));
    var tot = zeros(options.length), runs = zeros(options.length);
    for (var s = 0; s < S; s++) {
      var world = sampleWorld(k, rnd);
      for (var i = 0; i < options.length; i++) {
        var sim = simulate(ctx, handsFor(world, v), targets, rnd, options[i]);
        if (!sim) continue;
        tot[i] += scoreFor(ctx, sim, targets[me], targets); runs[i]++;
      }
    }
    var best = -1, bestV = -Infinity;
    for (var j = 0; j < options.length; j++) {
      var m = runs[j] ? tot[j] / runs[j] : -Infinity;
      if (options[j].id === g.id && options[j].as === g.as) m += 0.5;    // ties go to the greedy choice
      if (m > bestV) { bestV = m; best = j; }
    }
    return toAction(options[best >= 0 ? best : 0]);
  }

  // expected score from here on with a given bid / next leader (abilities)
  function expectScore(v, rnd, S, bidOverride, leaderOverride) {
    var k = knowledge(v), ctx = context(v), total = 0, runs = 0, hits = 0;
    var bid = bidOverride != null ? bidOverride : v.players[v.me].bid;
    for (var s = 0; s < S; s++) {
      var world = sampleWorld(k, rnd), targets = targetsFrom(v, world);
      targets[v.me] = bid;
      var sim = simulate(ctx, handsFor(world, v), targets, rnd, null, leaderOverride);
      if (!sim) continue;
      total += scoreFor(ctx, sim, bid, targets); runs++;
      if (sim.won[v.me] === bid) hits++;
    }
    return { mean: runs ? total / runs : 0, hit: runs ? hits / runs : 0 };
  }

  function bendtHeuristic(hand, k, need, left) {
    var sorted = hand.slice().sort(function (a, b) { return bestPower(b) - bestPower(a); });
    var keepN = Math.max(0, Math.min(need, left));
    var keepers = sorted.slice(0, keepN), rest = sorted.slice(keepN);
    var disc = rest.slice(0, k);
    if (disc.length < k) disc = disc.concat(keepers.slice(keepers.length - (k - disc.length)));
    return disc;
  }

  function chooseAbility(v, lvl, rnd) {
    var ab = v.ability, me = v.me, mine = v.players[me];
    var need = mine.bid - mine.won, left = v.cards - v.tricksDone;
    if (ab.key === 'juanita') return { t: 'juanita' };
    if (ab.key === 'rosie') {
      var last = v.ghost ? 1 - me : (me + 1) % v.n;            // その人から始めれば自分が最後に出せる
      if (lvl !== 'hard') return { t: 'rosie', seat: lvl === 'easy' ? me : last };
      var best = last, bestV = -Infinity;
      for (var s = 0; s < v.n; s++) {
        var r = expectScore(v, rnd, 28, null, s);
        var m = r.mean + (s === last ? 0.5 : 0);
        if (m > bestV) { bestV = m; best = s; }
      }
      return { t: 'rosie', seat: best };
    }
    if (ab.key === 'bendt') {
      var kk = ab.need;
      if (lvl !== 'hard') return { t: 'bendt', discard: bendtHeuristic(v.hand, kk, need, left) };
      var combos = [];
      (function rec(start, cur) {
        if (cur.length === kk) { combos.push(cur.slice()); return; }
        for (var i = start; i < v.hand.length; i++) { cur.push(v.hand[i]); rec(i + 1, cur); cur.pop(); }
      })(0, []);
      var heur = bendtHeuristic(v.hand, kk, need, left).slice().sort().join(',');
      var bestC = combos[0], bestCV = -Infinity;
      combos.forEach(function (c) {
        var hand = v.hand.slice(); c.forEach(function (id) { removeOne(hand, id); });
        var v2 = Object.assign({}, v, { hand: hand, discarded: (v.discarded || []).concat(c), ability: null });
        var r = expectScore(v2, rnd, 10, null, ab.next != null ? ab.next : me);
        var m = r.mean + (c.slice().sort().join(',') === heur ? 3 : 0);
        if (m > bestCV) { bestCV = m; bestC = c; }
      });
      return { t: 'bendt', discard: bestC };
    }
    if (ab.key === 'rascal') {
      if (lvl === 'easy') return { t: 'rascal', w: rnd() < 0.5 ? 0 : 10 };
      var p = expectScore(v, rnd, lvl === 'hard' ? 40 : 20, null, me).hit;
      return { t: 'rascal', w: p >= 0.66 ? 20 : p >= 0.5 ? 10 : 0 };
    }
    if (ab.key === 'harry') {
      var choices = [-1, 0, 1].filter(function (d) { var b = mine.bid + d; return b >= 0 && b <= v.cards; });
      if (ab.final) return { t: 'harry', d: minBy(choices, function (d) { return Math.abs(mine.won - (mine.bid + d)) + Math.abs(d) * 0.01; }) };
      if (lvl === 'easy') return { t: 'harry', d: 0 };
      if (lvl === 'normal') return { t: 'harry', d: mine.won > mine.bid && choices.indexOf(1) >= 0 ? 1 : 0 };
      var bestD = 0, bestDV = -Infinity;
      choices.forEach(function (d) {
        var r = expectScore(v, rnd, 30, mine.bid + d, me);
        var m = r.mean + (d === 0 ? 0.5 : 0);
        if (m > bestDV) { bestDV = m; bestD = d; }
      });
      return { t: 'harry', d: bestD };
    }
    return null;
  }

  function choose(v, o) {
    o = o || {};
    var lvl = o.level === 'easy' || o.level === 'hard' ? o.level : 'normal';
    var rnd = makeRng(o.seed == null ? Math.floor(Math.random() * 4294967296) : o.seed);
    if (v.phase === 'bid') return chooseBid(v, lvl, rnd);
    if (v.phase === 'play') return choosePlay(v, lvl, rnd);
    if (v.phase === 'ability') return chooseAbility(v, lvl, rnd);
    return null;
  }

  return { choose: choose, greedy: greedy, power: power, feelBid: feelBid, knowledge: knowledge, sampleWorld: sampleWorld };
});
