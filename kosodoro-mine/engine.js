/* コソドロ・マイン (browser edition of こそどろ鉱山 / DIRTY WORK): the rules, as pure functions.
   Deterministic and free of DOM access, so the same code runs in the page, on the online host,
   in the CPU and in node tests. RULES.md lists the source of every rule.

   The game is a series of seasons; each season a series of rounds. Everyone still in the season
   picks a card at the same time: 労働 (w), 盗み (s), 防衛 (g), or — with the advanced rule — their
   one-use special card (x). Then:
     1. every 労働 adds 1 ore from the supply to the reward pool
     2. 盗み and 防衛 at once:
        盗み without 防衛: the thieves share the pool, the remainder stays, the season ends
        盗み with 防衛: every thief loses all their ore to the guards (shared, remainder to the pool)
        防衛 without 盗み: each guard takes 1 ore from the pool, if there is one for every guard
        everyone who played 盗み or 防衛 leaves the season
     3. special cards, in card-number order
     4. one player left: they take the whole pool and the season ends
   Everyone starts with 2 ore; the first to reach 4 x players ore with nobody level wins. The rule
   book ends the game "at any point" someone reaches it, so the win is checked after step 2, after
   each special card and after step 4, and nothing after that point is resolved. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KOSO_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ACT_NAME = { w: '労働', s: '盗み', g: '防衛', x: '特殊' };
  /* The eight miners and their special cards. The effects and the card numbers (which decide the
     order when several special cards are played together) are the published game's; the character identities and ability assignments now match the Japanese edition.
     Existing ability numbers and saved-game indices remain stable. type: how the card counts — w = as 労働
     (adds 1 ore, stays in the season), s = as 盗み, x = a special action (leaves the season). */
  var ANIMALS = [
    { k: 'owl', nm: 'オウリビア', cpu: 'オウリビア', sp: { no: 8, nm: '特殊 8', type: 'x', tx: 'いちばん多く鉱石を持っている人（自分以外）から3個もらう。そのシーズンは抜ける。' } },
    { k: 'otter', nm: 'ハリーオッター', cpu: 'ハリー', sp: { no: 7, nm: '特殊 7', type: 'x', tx: 'だれも【盗み】を出していなければ、【防衛】を出した全員から鉱石を全部もらう。そのシーズンは抜ける。' } },
    { k: 'fox', nm: 'フォックスマイク', cpu: 'マイク', sp: { no: 4, nm: '盗み 4', type: 's', tx: '【盗み】として出す。ほかにも【盗み】を出した人がいれば、防衛されても自分の鉱石は没収されない。' } },
    { k: 'rabbit', nm: 'ウサバズ', cpu: 'バズ', sp: { no: 5, nm: '盗み 5', type: 's', tx: '【盗み】として出す。防衛されたとき、没収されるのは鉱石の半分（切り捨て）だけ。残りは手元に残る。' } },
    { k: 'moose', nm: 'ムースチョコ', cpu: 'チョコ', sp: { no: 3, nm: '労働 3', type: 'w', tx: '【労働】として出す。そのあと報酬プールを、【労働】を出した全員（自分を含む）で均等に分ける。余りは自分のもの。' } },
    { k: 'bear', nm: 'クマゲイリー', cpu: 'ゲイリー', sp: { no: 2, nm: '労働 2', type: 'w', tx: '【労働】として出す。さらに、【労働】を出したほかの全員から1個ずつもらう。' } },
    { k: 'bird', nm: 'フェザーマックフライ', cpu: 'マックフライ', sp: { no: 6, nm: '特殊 6', type: 'x', tx: '報酬プールの半分（切り上げ）をもらう。そのシーズンは抜ける。' } },
    { k: 'boar', nm: 'イノシシビリー', cpu: 'ビリー', sp: { no: 1, nm: '労働 1', type: 'w', tx: '【労働】として出す。さらに、【盗み】を出した全員から2個ずつもらう。' } }
  ];
  var START_ORE = 2, SUSPEND_LIFT = 3;
  var MIN_PLAYERS = 3, MAX_PLAYERS = 8;
  var MULTS = [3, 4, 5], DEFAULT_MULT = 4;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mulberry(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* the winning number: 4 ore per player in the published game */
  function targetFor(n, mult) { return clamp(n, MIN_PLAYERS, MAX_PLAYERS) * (MULTS.indexOf(+mult) >= 0 ? +mult : DEFAULT_MULT); }

  /* persons: [{id, nm, cpu, ani}] (ani optional: free animals are dealt at random).
     opts: {mult (3/4/5) or target, adv (special cards), seed} */
  function newGame(persons, opts) {
    opts = opts || {};
    if (!persons || persons.length < MIN_PLAYERS || persons.length > MAX_PLAYERS) throw new Error('players');
    var seed = opts.seed != null ? opts.seed >>> 0 : Math.floor(Math.random() * 4294967296);
    var rng = mulberry(seed), taken = {}, free = [], k;
    var want = persons.map(function (p) {
      var a = p.ani == null ? -1 : p.ani | 0;
      if (a >= 0 && a < ANIMALS.length && !taken[a]) { taken[a] = 1; return a; }
      return -1;
    });
    for (k = 0; k < ANIMALS.length; k++) if (!taken[k]) free.push(k);
    for (k = free.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)); var t = free[k]; free[k] = free[j]; free[j] = t; }
    var P = persons.map(function (p, i) {
      var ani = want[i] >= 0 ? want[i] : free.shift();
      return {
        id: String(p.id), nm: String(p.nm || ANIMALS[ani].cpu), cpu: p.cpu ? clamp(p.cpu | 0, 1, 3) : 0, ani: ani,
        ore: START_ORE, out: '', susp: false, used: false, hist: [],
        st: { w: 0, s: 0, g: 0, x: 0, stole: 0, loot: 0, caught: 0, lost: 0, catches: 0, last: 0 }
      };
    });
    var mult = MULTS.indexOf(+opts.mult) >= 0 ? +opts.mult : DEFAULT_MULT;
    var target = opts.target != null ? clamp(Math.round(+opts.target) || 0, 6, 99) : targetFor(P.length, mult);
    return {
      v: 2, gid: (opts.gid || seed.toString(36)), seed: seed,
      opts: { target: target, mult: mult, adv: !!opts.adv },
      P: P, season: 1, rnd: 1, turn: 1, pool: 0, carry: 0,
      ph: 'pick', winners: [], log: [], last: null
    };
  }

  function sp(ani) { return ANIMALS[ani] && ANIMALS[ani].sp; }
  function kindOf(ani, a) { return a === 'x' ? sp(ani).type : a; }        // how a played card counts
  function isActive(s, i) { return s.ph === 'pick' && !!s.P[i] && !s.P[i].out; }
  function activeSeats(s) { var out = []; for (var i = 0; i < s.P.length; i++) if (!s.P[i].out) out.push(i); return out; }
  /* 謹慎 (suspended): only 労働 and 防衛 until the trolley holds 3 ore again */
  function legalActions(s, i) {
    if (!isActive(s, i)) return [];
    var p = s.P[i];
    if (p.susp) return ['w', 'g'];
    var out = ['w', 's', 'g'];
    if (s.opts.adv && !p.used) out.push('x');
    return out;
  }
  function validPick(s, i, pick) { return !!pick && legalActions(s, i).indexOf(pick.a) >= 0; }
  function normPick(s, i, pick) { return pick && legalActions(s, i).indexOf(String(pick.a)) >= 0 ? { a: String(pick.a) } : null; }

  /* One round, on plain arrays. The CPU calls this many times to look ahead, so it allocates little
     and records the step list only when asked. Input (arrays by seat):
       pool, ore, out ('' = still in the season), susp, used, ani, pick ('w'|'s'|'g'|'x'|null), steps,
       target (optional: stop as soon as someone has won) */
  function core(I) {
    var n = I.ore.length, i, k, q;
    var ore = I.ore.slice(), out = I.out.slice(), susp = I.susp.slice(), used = I.used.slice();
    var pool = I.pool, ani = I.ani, steps = I.steps ? [] : null, T = I.target || 0, won = -1, lastSeat = -1;
    function won_() { if (T && won < 0) { won = winnerOf(ore, T); if (won >= 0 && steps) steps.push({ k: 'win', p: won }); } return won >= 0; }
    var W = [], S = [], G = [], X = [], card = [], delta = [];
    for (i = 0; i < n; i++) {
      delta.push(0); card.push(0);
      if (out[i] || !I.pick[i]) continue;
      var a = I.pick[i];
      if (a === 'x') { if (used[i] || susp[i]) a = 'w'; else { used[i] = true; card[i] = sp(ani[i]).no; } }
      if (a === 's' && susp[i]) a = 'w';
      var kd = card[i] ? sp(ani[i]).type : a;
      if (kd === 'w') W.push(i); else if (kd === 's') S.push(i); else if (kd === 'g') G.push(i); else if (kd === 'x') X.push(i);
    }
    function gain(p, m) { ore[p] += m; delta[p] += m; }
    function take(from, to, m) { m = Math.min(m, ore[from]); if (m > 0) { ore[from] -= m; delta[from] -= m; gain(to, m); } return m; }
    // 1. 労働 always first
    for (k = 0; k < W.length; k++) { pool += 1; if (steps) steps.push({ k: 'work', p: W[k], n: 1, card: card[W[k]] }); }
    // 2. 盗み and 防衛 at the same time
    var end = '', rem = 0, caught = [];
    if (S.length && !G.length) {
      var each = Math.floor(pool / S.length);
      rem = pool - each * S.length;
      for (k = 0; k < S.length; k++) gain(S[k], each);
      if (steps) steps.push({ k: 'steal', ps: S.slice(), each: each, rem: rem, pool: pool });
      pool = rem; end = 'stolen';
    } else if (S.length && G.length) {
      var conf = 0;
      for (k = 0; k < S.length; k++) {
        i = S[k];
        var c = card[i], lose = ore[i], why = '';
        if (c === 4 && S.length > 1) { lose = 0; why = 'cover'; }
        else if (c === 5) { lose = Math.floor(ore[i] / 2); why = 'half'; }
        var empty = ore[i] === 0 && why !== 'cover';
        ore[i] -= lose; delta[i] -= lose; conf += lose; caught.push(i);
        if (empty) susp[i] = true;
        if (steps) steps.push({ k: 'caught', p: i, n: lose, why: why, susp: empty, by: G.slice() });
      }
      if (conf > 0) {
        var share = Math.floor(conf / G.length), r = conf - share * G.length;
        for (k = 0; k < G.length; k++) gain(G[k], share);
        pool += r;
        if (steps) steps.push({ k: 'split', to: G.map(function (g) { return { p: g, n: share }; }), rem: r });
      }
    } else if (G.length) {
      if (pool >= G.length) {
        for (k = 0; k < G.length; k++) { pool -= 1; gain(G[k], 1); if (steps) steps.push({ k: 'wage', p: G[k], n: 1 }); }
      } else if (steps) steps.push({ k: 'nowage', ps: G.slice(), pool: pool });
    }
    // 3. special cards, lowest number first
    var order = [];
    for (i = 0; i < n; i++) if (card[i]) order.push(i);
    order.sort(function (x, y) { return card[x] - card[y]; });
    if (won_()) order = [];
    for (q = 0; q < order.length; q++) {
      i = order[q];
      var no = card[i], got = [], m;
      if (no === 1) {
        for (k = 0; k < S.length; k++) if (S[k] !== i) { m = take(S[k], i, 2); if (m) got.push({ p: S[k], n: m }); }
        if (steps) steps.push({ k: 'sp', no: 1, p: i, from: got });
      } else if (no === 2) {
        for (k = 0; k < W.length; k++) if (W[k] !== i) { m = take(W[k], i, 1); if (m) got.push({ p: W[k], n: m }); }
        if (steps) steps.push({ k: 'sp', no: 2, p: i, from: got });
      } else if (no === 3) {
        var cut = W.length ? Math.floor(pool / W.length) : 0, left = pool - cut * W.length, to = [];
        for (k = 0; k < W.length; k++) { var amt = cut + (W[k] === i ? left : 0); if (amt) { gain(W[k], amt); to.push({ p: W[k], n: amt }); } }
        if (steps) steps.push({ k: 'sp', no: 3, p: i, to: to, pool: pool });
        pool = 0;
      } else if (no === 6) {
        m = Math.ceil(pool / 2); pool -= m; gain(i, m);
        if (steps) steps.push({ k: 'sp', no: 6, p: i, n: m });
      } else if (no === 7) {
        if (!S.length) for (k = 0; k < G.length; k++) { m = take(G[k], i, ore[G[k]]); if (m) got.push({ p: G[k], n: m }); }
        if (steps) steps.push({ k: 'sp', no: 7, p: i, from: got, none: !!S.length });
      } else if (no === 8) {
        var best = -1, victim = -1;
        for (k = 1; k < n; k++) { var j = (i + k) % n; if (ore[j] > best) { best = ore[j]; victim = j; } }
        m = victim >= 0 ? take(victim, i, 3) : 0;
        if (steps) steps.push({ k: 'sp', no: 8, p: i, from: m ? [{ p: victim, n: m }] : [], victim: victim });
      } else if (steps) steps.push({ k: 'sp', no: no, p: i });   // 4 and 5 already worked during the theft
      if (won_()) break;
    }
    if (won >= 0) return finish();
    // 4. who leaves the season
    for (k = 0; k < S.length; k++) { out[S[k]] = end === 'stolen' ? 'thief' : 'caught'; }
    for (k = 0; k < G.length; k++) out[G[k]] = 'guard';
    for (k = 0; k < X.length; k++) out[X[k]] = 'special';
    if (steps && !end) {
      for (k = 0; k < G.length; k++) steps.push({ k: 'leave', p: G[k], why: 'guard' });
      for (k = 0; k < caught.length; k++) steps.push({ k: 'leave', p: caught[k], why: 'caught' });
      for (k = 0; k < X.length; k++) steps.push({ k: 'leave', p: X[k], why: 'special' });
    }
    // 5. the last one in the season takes everything
    if (!end) {
      var left2 = [];
      for (i = 0; i < n; i++) if (!out[i]) left2.push(i);
      if (left2.length === 1) {
        lastSeat = left2[0];
        if (steps) steps.push({ k: 'last', p: lastSeat, n: pool });
        gain(lastSeat, pool); pool = 0; end = 'last';
        if (won_()) return finish();
      } else if (!left2.length) {
        end = 'empty';
        if (steps) steps.push({ k: 'carry', n: pool });
      }
    }
    // 6. a suspended miner gets 盗み back with 3 ore in the trolley
    for (i = 0; i < n; i++) if (susp[i] && ore[i] >= SUSPEND_LIFT && caught.indexOf(i) < 0) { susp[i] = false; if (steps) steps.push({ k: 'unsusp', p: i }); }
    return finish();
    function finish() {
      return { ore: ore, out: out, susp: susp, used: used, pool: pool, end: end, delta: delta, card: card,
        W: W, S: S, G: G, X: X, caught: caught, rem: rem, lastSeat: lastSeat, won: won, steps: steps };
    }
  }

  function coreInput(s, picks, withSteps) {
    return {
      pool: s.pool, steps: !!withSteps, target: s.opts.target,
      ore: s.P.map(function (p) { return p.ore; }),
      out: s.P.map(function (p) { return p.out; }),
      susp: s.P.map(function (p) { return p.susp; }),
      used: s.P.map(function (p) { return p.used; }),
      ani: s.P.map(function (p) { return p.ani; }),
      pick: s.P.map(function (p, i) { return picks[i] ? picks[i].a : null; })
    };
  }

  /* the winner, if the round left exactly one player on top at or above the target */
  function winnerOf(ore, target) {
    var best = -1, who = -1, tie = false;
    for (var i = 0; i < ore.length; i++) { if (ore[i] > best) { best = ore[i]; who = i; tie = false; } else if (ore[i] === best) tie = true; }
    return best >= target && !tie ? who : -1;
  }

  /* picks: array by seat of {a} for every player in the season. Returns {state, ev}; the input
     state is not modified. */
  function resolve(s0, picks) {
    if (s0.ph !== 'pick') throw new Error('phase');
    var s = clone(s0), act = activeSeats(s), i;
    var norm = s.P.map(function () { return null; });
    act.forEach(function (i) {
      var p = normPick(s, i, picks[i]);
      if (!p) throw new Error('pick ' + i);
      norm[i] = p;
    });
    var R = core(coreInput(s, norm, true));
    var poolBefore = s.pool;
    s.P.forEach(function (p, i) {
      if (norm[i]) {
        var kd = norm[i].a === 'x' ? 'x' : norm[i].a;
        p.hist.push(kd);
        if (p.hist.length > 60) p.hist.shift();
        p.st[kd]++;
      }
      p.ore = R.ore[i]; p.out = R.out[i]; p.susp = R.susp[i]; p.used = R.used[i];
    });
    if (R.end === 'stolen') R.S.forEach(function (i) { s.P[i].st.stole++; s.P[i].st.loot += Math.max(0, R.delta[i]); });
    R.steps.forEach(function (x) { if (x.k === 'caught') { s.P[x.p].st.caught++; s.P[x.p].st.lost += x.n; } });
    if (R.caught.length) R.G.forEach(function (i) { s.P[i].st.catches++; });
    if (R.end === 'last') s.P[R.lastSeat].st.last++;
    s.pool = R.pool;
    var ev = {
      season: s.season, rnd: s.rnd, turn: s.turn, pool0: poolBefore, pool1: R.pool,
      ore0: s0.P.map(function (p) { return p.ore; }),
      picks: norm.map(function (p) { return p ? { a: p.a } : null; }), card: R.card.slice(),
      steps: R.steps, delta: R.delta, end: R.end, ore: R.ore.slice(), over: false, winners: []
    };
    s.log.push({ d: s.season, r: s.rnd, p0: poolBefore, p1: R.pool, o0: ev.ore0,
      a: norm.map(function (p) { return p ? p.a : '-'; }).join(','), dl: R.delta.slice(), e: R.end });
    if (s.log.length > 400) s.log.shift();
    if (R.end) {                                   // a new season: everyone comes back
      s.P.forEach(function (p) { p.out = ''; });
      s.carry = R.pool;
      s.season++; s.rnd = 1;
    } else s.rnd++;
    s.turn++;
    var w = R.won;
    if (w >= 0) { s.ph = 'over'; s.winners = [w]; ev.over = true; ev.winners = [w]; }
    s.last = ev;
    return { state: s, ev: ev };
  }

  function publicView(s) {
    var v = clone(s);
    delete v.seed;
    v.P.forEach(function (p) { delete p.pers; });
    return v;
  }

  function ranking(s) {
    return s.P.map(function (p, i) { return i; }).sort(function (a, b) {
      return s.P[b].ore - s.P[a].ore || s.P[b].st.stole - s.P[a].st.stole || a - b;
    });
  }

  /* one-line Japanese summary of a round, for the caption and the log */
  function summary(s, ev) {
    var nm = function (i) { return s.P[i] ? s.P[i].nm : '?'; };
    var parts = [];
    (ev.steps || []).forEach(function (x) {
      if (x.k === 'steal') parts.push(x.ps.length === 1 ? nm(x.ps[0]) + 'が' + x.each + '個を盗んだ' : x.ps.map(nm).join('・') + 'が' + x.each + '個ずつ山分け');
      else if (x.k === 'caught') parts.push(nm(x.p) + (x.why === 'cover' ? 'は身代わりで没収をまぬがれた' : 'がつかまった' + (x.n ? '（' + x.n + '個没収）' : '')) + (x.susp ? '。謹慎に' : ''));
      else if (x.k === 'nowage') parts.push('プールが足りず見張り代はなし');
      else if (x.k === 'last') parts.push(nm(x.p) + 'が最後のひとりで' + x.n + '個');
      else if (x.k === 'carry') parts.push('だれも残らず、' + x.n + '個は次のシーズンへ');
      else if (x.k === 'win') parts.push(nm(x.p) + 'が' + s.opts.target + '個に届いた');
      else if (x.k === 'sp') {
        var a = ANIMALS[s.P[x.p].ani].sp, tot = 0;
        (x.from || x.to || []).forEach(function (f) { tot += f.n; });
        if (x.no === 6) tot = x.n;
        parts.push(nm(x.p) + 'の「' + a.nm + '」' + (x.no === 4 || x.no === 5 ? '' : tot ? '（' + tot + '個）' : '（空振り）'));
      }
    });
    if (!parts.length) {
      var g = ev.picks.filter(function (p) { return p && p.a === 'g'; }).length;
      parts.push(g ? '見張り' + g + '人が坑道を出た' : '全員まじめに働いた');
    }
    return parts.join('。');
  }

  return {
    ACT_NAME: ACT_NAME, ANIMALS: ANIMALS, START_ORE: START_ORE, SUSPEND_LIFT: SUSPEND_LIFT,
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, MULTS: MULTS, DEFAULT_MULT: DEFAULT_MULT,
    clone: clone, mulberry: mulberry, targetFor: targetFor, sp: sp, kindOf: kindOf,
    newGame: newGame, isActive: isActive, activeSeats: activeSeats, legalActions: legalActions,
    validPick: validPick, normPick: normPick, core: core, coreInput: coreInput, winnerOf: winnerOf,
    resolve: resolve, publicView: publicView, ranking: ranking, summary: summary
  };
});
