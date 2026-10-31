/* 宝石の煌めき — rules engine (no DOM). Browser: window.SPL_ENG, worker: self.SPL_ENG, node: module.exports.

   Rules follow the published rulebook of the board game Splendor (宝石の煌き, Space Cowboys / Hobby Japan):
   2-4 players; gem tokens 4/5/7 per colour for 2/3/4 players, always 5 gold; players+1 nobles; 4 face-up cards per level.
   One action per turn: take 3 different gems / take 2 of one colour (only if 4+ remain) / reserve 1 card (+1 gold if any)
   / buy 1 card (market or own reserve). At most 10 tokens at the end of a turn (return the excess, any colour, gold
   included). Nobles visit at the end of a turn when your card bonuses meet them, one per turn, you choose, you cannot
   refuse. Someone at 15+ prestige ends the game after the round is complete; most prestige wins, ties go to the player
   with the fewest development cards. App decisions where the rulebook is silent are listed in RULES.md.

   Colours: 0 white (ダイヤモンド) 1 blue (サファイア) 2 green (エメラルド) 3 red (ルビー) 4 black (オニキス) 5 gold (黄金).
   Card ids 0..89 (level I: 0-39, II: 40-69, III: 70-89). In a player's view an unknown card is 90 + level index.

   State (JSON-safe):
   { v, n, cur, first, turn, fin, over, passes, bank[6], mk[12] (level*4+slot, -1 empty), dk[[],[],[]] (top = last),
     nb[noble ids], pl[{ tok[6], bon[5], pts, nc, res[], hid[], nob[], cards[] }] }
   Action: { k:'take', g:[c..] } | { k:'res', m:i } | { k:'res', d:level } | { k:'buy', m:i } | { k:'buy', r:i } | { k:'pass' }
   Turn:   { a: action, ret: [6] | null, nob: nobleId | -1 }                                                        */
(function (root) {
  'use strict';
  var GOAL = 15, LIMIT = 10, MAXRES = 3, GOLD = 5;
  var IDLE_ROUNDS = 12;   // app safeguard: this many rounds with no purchase and no reservation ends a deadlocked game
  var COLOR_KEYS = ['white', 'blue', 'green', 'red', 'black', 'gold'];
  // [level, bonus colour, prestige, cost white, blue, green, red, black] — verified against three independent transcriptions.
  var CARD_ROWS = [[1,0,0,0,0,0,2,1],[1,0,0,0,1,1,1,1],[1,0,0,0,1,2,1,1],[1,0,0,0,2,0,0,2],[1,0,0,0,2,2,0,1],[1,0,0,0,3,0,0,0],[1,0,0,3,1,0,0,1],[1,0,1,0,0,4,0,0],[1,1,0,0,0,0,0,3],[1,1,0,0,0,2,0,2],[1,1,0,0,1,3,1,0],[1,1,0,1,0,0,0,2],[1,1,0,1,0,1,1,1],[1,1,0,1,0,1,2,1],[1,1,0,1,0,2,2,0],[1,1,1,0,0,0,4,0],[1,2,0,0,0,0,3,0],[1,2,0,0,1,0,2,2],[1,2,0,0,2,0,2,0],[1,2,0,1,1,0,1,1],[1,2,0,1,1,0,1,2],[1,2,0,1,3,1,0,0],[1,2,0,2,1,0,0,0],[1,2,1,0,0,0,0,4],[1,3,0,0,2,1,0,0],[1,3,0,1,0,0,1,3],[1,3,0,1,1,1,0,1],[1,3,0,2,0,0,2,0],[1,3,0,2,0,1,0,2],[1,3,0,2,1,1,0,1],[1,3,0,3,0,0,0,0],[1,3,1,4,0,0,0,0],[1,4,0,0,0,1,3,1],[1,4,0,0,0,2,1,0],[1,4,0,0,0,3,0,0],[1,4,0,1,1,1,1,0],[1,4,0,1,2,1,1,0],[1,4,0,2,0,2,0,0],[1,4,0,2,2,0,1,0],[1,4,1,0,4,0,0,0],[2,0,1,0,0,3,2,2],[2,0,1,2,3,0,3,0],[2,0,2,0,0,0,5,0],[2,0,2,0,0,0,5,3],[2,0,2,0,0,1,4,2],[2,0,3,6,0,0,0,0],[2,1,1,0,2,2,3,0],[2,1,1,0,2,3,0,3],[2,1,2,0,5,0,0,0],[2,1,2,2,0,0,1,4],[2,1,2,5,3,0,0,0],[2,1,3,0,6,0,0,0],[2,2,1,2,3,0,0,2],[2,2,1,3,0,2,3,0],[2,2,2,0,0,5,0,0],[2,2,2,0,5,3,0,0],[2,2,2,4,2,0,0,1],[2,2,3,0,0,6,0,0],[2,3,1,0,3,0,2,3],[2,3,1,2,0,0,2,3],[2,3,2,0,0,0,0,5],[2,3,2,1,4,2,0,0],[2,3,2,3,0,0,0,5],[2,3,3,0,0,0,6,0],[2,4,1,3,0,3,0,2],[2,4,1,3,2,2,0,0],[2,4,2,0,0,5,3,0],[2,4,2,0,1,4,2,0],[2,4,2,5,0,0,0,0],[2,4,3,0,0,0,0,6],[3,0,3,0,3,3,5,3],[3,0,4,0,0,0,0,7],[3,0,4,3,0,0,3,6],[3,0,5,3,0,0,0,7],[3,1,3,3,0,3,3,5],[3,1,4,6,3,0,0,3],[3,1,4,7,0,0,0,0],[3,1,5,7,3,0,0,0],[3,2,3,5,3,0,3,3],[3,2,4,0,7,0,0,0],[3,2,4,3,6,3,0,0],[3,2,5,0,7,3,0,0],[3,3,3,3,5,3,0,3],[3,3,4,0,0,7,0,0],[3,3,4,0,3,6,3,0],[3,3,5,0,0,7,3,0],[3,4,3,3,3,5,3,0],[3,4,4,0,0,0,7,0],[3,4,4,0,0,3,6,3],[3,4,5,0,0,0,7,3]];
  // noble requirements (white, blue, green, red, black); each noble is worth 3 prestige.
  var NOBLE_ROWS = [[0,0,0,4,4],[0,0,4,4,0],[0,4,4,0,0],[4,0,0,0,4],[4,4,0,0,0],[0,0,3,3,3],[0,3,3,3,0],[3,0,0,3,3],[3,3,0,0,3],[3,3,3,0,0]];

  var CARDS = CARD_ROWS.map(function (r, i) {
    var cost = r.slice(3, 8);
    return { id: i, tier: r[0] - 1, color: r[1], pts: r[2], cost: cost, total: cost[0] + cost[1] + cost[2] + cost[3] + cost[4] };
  });
  var NOBLES = NOBLE_ROWS.map(function (r, i) { return { id: i, req: r.slice(), pts: 3 }; });
  var HIDDEN = 90;                                    // 90 + level: a card someone else cannot see
  function tierOf(id) { return id >= HIDDEN ? id - HIDDEN : CARDS[id].tier; }

  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function gemsFor(n) { return n === 2 ? 4 : n === 3 ? 5 : 7; }
  function newPlayer() { return { tok: [0, 0, 0, 0, 0, 0], bon: [0, 0, 0, 0, 0], pts: 0, nc: 0, res: [], hid: [], nob: [], cards: [] }; }

  /* opts: { players: 2..4, first: seat index (default 0), rng: () => [0,1) } */
  function newGame(opts) {
    opts = opts || {};
    var n = Math.max(2, Math.min(4, opts.players | 0 || 2)), rng = opts.rng || Math.random, g = gemsFor(n);
    var s = { v: 1, n: n, cur: 0, first: 0, turn: 0, fin: false, over: false, passes: 0, idle: 0,
      bank: [g, g, g, g, g, 5], mk: [], dk: [[], [], []], nb: [], pl: [] };
    var first = opts.first == null ? 0 : opts.first | 0;
    s.cur = s.first = ((first % n) + n) % n;
    for (var i = 0; i < CARDS.length; i++) s.dk[CARDS[i].tier].push(i);
    for (var t = 0; t < 3; t++) shuffle(s.dk[t], rng);
    for (t = 0; t < 3; t++) for (var k = 0; k < 4; k++) s.mk[t * 4 + k] = s.dk[t].pop();
    var nobles = shuffle(NOBLES.map(function (x) { return x.id; }), rng);
    s.nb = nobles.slice(0, n + 1);
    for (i = 0; i < n; i++) s.pl.push(newPlayer());
    return s;
  }

  function clonePlayer(p, light) {
    return { tok: p.tok.slice(), bon: p.bon.slice(), pts: p.pts, nc: p.nc, res: p.res.slice(), hid: p.hid.slice(),
      nob: light ? p.nob : p.nob.slice(), cards: light ? p.cards : p.cards.slice() };
  }
  /* light: for search. Lists only the interface reads (purchased cards, noble ids) are shared, not updated. */
  function clone(s, light) {
    var c = { v: s.v, n: s.n, cur: s.cur, first: s.first, turn: s.turn, fin: s.fin, over: s.over, passes: s.passes, idle: s.idle | 0,
      bank: s.bank.slice(), mk: s.mk.slice(), dk: [s.dk[0].slice(), s.dk[1].slice(), s.dk[2].slice()], nb: s.nb.slice(), pl: [] };
    for (var i = 0; i < s.n; i++) c.pl.push(clonePlayer(s.pl[i], light));
    if (light) c.light = true;
    return c;
  }

  function tokenCount(p) { var t = p.tok; return t[0] + t[1] + t[2] + t[3] + t[4] + t[5]; }
  /* gold needed beyond coloured tokens; 0 means the player can pay without gold */
  function goldNeeded(p, cid) {
    var c = CARDS[cid].cost, b = p.bon, t = p.tok, need = 0, x;
    for (var i = 0; i < 5; i++) { x = c[i] - b[i] - t[i]; if (x > 0) need += x; }
    return need;
  }
  function canAfford(p, cid) { return cid >= 0 && cid < HIDDEN && goldNeeded(p, cid) <= p.tok[GOLD]; }
  /* the tokens a purchase spends: coloured tokens first, gold only for what is missing (gold is never worse to keep) */
  function payment(p, cid) {
    var c = CARDS[cid].cost, pay = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 5; i++) {
      var need = c[i] - p.bon[i]; if (need <= 0) continue;
      var use = need < p.tok[i] ? need : p.tok[i];
      pay[i] = use; pay[GOLD] += need - use;
    }
    return pay;
  }
  function colorsAvailable(s) { var n = 0; for (var i = 0; i < 5; i++) if (s.bank[i] > 0) n++; return n; }

  /* every legal action for the current player (returns are chosen afterwards; see finishTurn) */
  function legal(s) {
    var out = [], p = s.pl[s.cur], b = s.bank, i, j, k;
    if (s.over) return out;
    var avail = [];
    for (i = 0; i < 5; i++) if (b[i] > 0) avail.push(i);
    if (avail.length >= 3) {
      for (i = 0; i < avail.length; i++) for (j = i + 1; j < avail.length; j++) for (k = j + 1; k < avail.length; k++)
        out.push({ k: 'take', g: [avail[i], avail[j], avail[k]] });
    } else if (avail.length === 2) out.push({ k: 'take', g: [avail[0], avail[1]] });
    else if (avail.length === 1) out.push({ k: 'take', g: [avail[0]] });
    for (i = 0; i < 5; i++) if (b[i] >= 4) out.push({ k: 'take', g: [i, i] });
    for (i = 0; i < 12; i++) if (s.mk[i] >= 0 && canAfford(p, s.mk[i])) out.push({ k: 'buy', m: i });
    for (i = 0; i < p.res.length; i++) if (canAfford(p, p.res[i])) out.push({ k: 'buy', r: i });
    if (p.res.length < MAXRES) {
      for (i = 0; i < 12; i++) if (s.mk[i] >= 0) out.push({ k: 'res', m: i });
      for (i = 0; i < 3; i++) if (s.dk[i].length) out.push({ k: 'res', d: i });
    }
    if (!out.length) out.push({ k: 'pass' });
    return out;
  }

  /* null when legal, otherwise a short Japanese reason */
  function check(s, a) {
    if (!a || typeof a !== 'object') return '行動がありません';
    if (s.over) return 'ゲームは終わっています';
    var p = s.pl[s.cur], b = s.bank, i;
    if (a.k === 'take') {
      var g = a.g;
      if (!Array.isArray(g) || !g.length || g.length > 3) return '宝石の取り方が正しくありません';
      for (i = 0; i < g.length; i++) if (!(g[i] >= 0 && g[i] < 5 && (g[i] | 0) === g[i])) return '黄金トークンは取れません';
      if (g.length === 2 && g[0] === g[1]) {
        if (b[g[0]] < 4) return '同じ色を2つ取れるのは、その色が4つ以上残っているときだけです';
        return null;
      }
      for (i = 0; i < g.length; i++) {
        if (b[g[i]] < 1) return 'その宝石は残っていません';
        for (var j = i + 1; j < g.length; j++) if (g[i] === g[j]) return '違う色を選んでください';
      }
      var want = Math.min(3, colorsAvailable(s));
      if (g.length !== want) return want === 3 ? '違う色を3つ選んでください' : '残っている色を1つずつ取ってください';
      return null;
    }
    if (a.k === 'res') {
      if (p.res.length >= MAXRES) return '確保できるのは3枚までです';
      if (a.m != null) return (a.m >= 0 && a.m < 12 && s.mk[a.m] >= 0) ? null : 'そのカードはありません';
      if (a.d != null) return (a.d >= 0 && a.d < 3 && s.dk[a.d].length) ? null : 'その山札は空です';
      return '確保するカードがありません';
    }
    if (a.k === 'buy') {
      var cid = a.m != null ? (a.m >= 0 && a.m < 12 ? s.mk[a.m] : -1) : a.r != null ? (a.r >= 0 && a.r < p.res.length ? p.res[a.r] : -1) : -1;
      if (cid < 0 || cid >= HIDDEN) return 'そのカードはありません';
      if (!canAfford(p, cid)) return '宝石が足りません';
      return null;
    }
    if (a.k === 'pass') {
      var l = legal(s);
      return l.length === 1 && l[0].k === 'pass' ? null : 'できる行動があるのでパスはできません';
    }
    return '知らない行動です';
  }

  /* performs the action for the current player. Returns { card, from, slot, revealed, gold, pay } for the interface. */
  function act(s, a) {
    var p = s.pl[s.cur], b = s.bank, info = { k: a.k }, i, cid;
    if (a.k === 'take') {
      for (i = 0; i < a.g.length; i++) { b[a.g[i]]--; p.tok[a.g[i]]++; }
      s.passes = 0; s.idle = (s.idle | 0) + 1;
    } else if (a.k === 'res') {
      if (a.m != null) {
        cid = s.mk[a.m]; info.slot = a.m; info.card = cid; info.from = 'm';
        p.res.push(cid); p.hid.push(false);
        var t = Math.floor(a.m / 4), d = s.dk[t];
        s.mk[a.m] = d.length ? d.pop() : -1; info.revealed = s.mk[a.m];
      } else {
        cid = s.dk[a.d].pop(); info.card = cid; info.from = 'd'; info.tier = a.d;
        p.res.push(cid); p.hid.push(true);
      }
      if (b[GOLD] > 0) { b[GOLD]--; p.tok[GOLD]++; info.gold = 1; } else info.gold = 0;
      s.passes = 0; s.idle = 0;
    } else if (a.k === 'buy') {
      if (a.m != null) { cid = s.mk[a.m]; info.slot = a.m; info.from = 'm'; }
      else { cid = p.res[a.r]; info.from = 'r'; info.ri = a.r; info.wasHidden = p.hid[a.r]; }
      var pay = payment(p, cid);
      for (i = 0; i < 6; i++) { p.tok[i] -= pay[i]; b[i] += pay[i]; }
      var card = CARDS[cid];
      p.bon[card.color]++; p.pts += card.pts; p.nc++;
      if (!s.light) p.cards.push(cid);
      if (a.m != null) {
        var tt = Math.floor(a.m / 4), dd = s.dk[tt];
        s.mk[a.m] = dd.length ? dd.pop() : -1; info.revealed = s.mk[a.m];
      } else { p.res.splice(a.r, 1); p.hid.splice(a.r, 1); }
      info.card = cid; info.pay = pay;
      s.passes = 0; s.idle = 0;
    } else if (a.k === 'pass') {
      s.passes++; s.idle = (s.idle | 0) + 1;
    }
    return info;
  }

  function excess(s) { var x = tokenCount(s.pl[s.cur]) - LIMIT; return x > 0 ? x : 0; }
  function eligible(s, pi) {
    var p = s.pl[pi == null ? s.cur : pi], out = [];
    for (var i = 0; i < s.nb.length; i++) {
      var r = NOBLES[s.nb[i]].req, ok = true;
      for (var c = 0; c < 5; c++) if (p.bon[c] < r[c]) { ok = false; break; }
      if (ok) out.push(s.nb[i]);
    }
    return out;
  }
  function checkReturn(s, ret) {
    var x = excess(s), p = s.pl[s.cur];
    if (!x) return ret && ret.some(function (v) { return v; }) ? '返す必要はありません' : null;
    if (!Array.isArray(ret) || ret.length !== 6) return '返すトークンを選んでください';
    var sum = 0;
    for (var i = 0; i < 6; i++) { if (!(ret[i] >= 0) || ret[i] > p.tok[i] || (ret[i] | 0) !== ret[i]) return '持っていないトークンは返せません'; sum += ret[i]; }
    return sum === x ? null : 'トークンを' + x + '個返してください';
  }
  /* returns, noble visit, end-of-game check, next player. Returns { noble, ended, trigger } */
  function finish(s, ret, nob) {
    var p = s.pl[s.cur], info = { noble: -1 }, i;
    if (ret) for (i = 0; i < 6; i++) if (ret[i]) { p.tok[i] -= ret[i]; s.bank[i] += ret[i]; }
    var el = eligible(s);
    if (el.length) {
      var pick = el.indexOf(nob) >= 0 ? nob : el[0];
      s.nb.splice(s.nb.indexOf(pick), 1);
      if (!s.light) p.nob.push(pick);
      p.pts += 3; info.noble = pick;
    }
    if (p.pts >= GOAL && !s.fin) { s.fin = true; info.trigger = s.cur; }
    s.turn++;
    s.cur = (s.cur + 1) % s.n;
    if ((s.fin && s.cur === s.first) || s.passes >= s.n) { s.over = true; info.ended = true; }
    else if ((s.idle | 0) >= IDLE_ROUNDS * s.n) { s.over = true; s.stalled = true; info.ended = true; info.stalled = true; }
    return info;
  }
  /* a whole turn with validation (throws on anything illegal). Returns { act, fin } */
  function play(s, turn) {
    var a = turn && turn.a, err = check(s, a);
    if (err) throw new Error(err);
    var probe = clone(s, true); act(probe, a);
    err = checkReturn(probe, turn.ret || null);
    if (err) throw new Error(err);
    var after = probe; if (turn.ret) for (var i = 0; i < 6; i++) { after.pl[after.cur].tok[i] -= turn.ret[i]; }
    var el = eligible(after);
    if (el.length > 1 && el.indexOf(turn.nob) < 0) throw new Error('来訪する貴族を選んでください');
    var ai = act(s, a), fi = finish(s, turn.ret || null, turn.nob == null ? -1 : turn.nob);
    return { act: ai, fin: fi };
  }

  /* ranking: prestige high to low, then fewer development cards. Shared places when both are equal. */
  function result(s) {
    var order = s.pl.map(function (p, i) { return { seat: i, pts: p.pts, nc: p.nc }; });
    order.sort(function (a, b) { return b.pts - a.pts || a.nc - b.nc || a.seat - b.seat; });
    var rank = 1;
    for (var i = 0; i < order.length; i++) {
      if (i > 0 && (order[i].pts !== order[i - 1].pts || order[i].nc !== order[i - 1].nc)) rank = i + 1;
      order[i].rank = rank;
    }
    return { order: order, winners: order.filter(function (o) { return o.rank === 1; }).map(function (o) { return o.seat; }) };
  }

  /* what one seat can see: other players' cards reserved from a deck and every deck's order are unknown */
  function view(s, seat) {
    var v = clone(s);
    for (var i = 0; i < v.n; i++) {
      if (i === seat) continue;
      var p = v.pl[i];
      for (var j = 0; j < p.res.length; j++) if (p.hid[j]) p.res[j] = HIDDEN + CARDS[p.res[j]].tier;
    }
    for (var t = 0; t < 3; t++) v.dk[t] = v.dk[t].map(function () { return HIDDEN + t; });
    v.seat = seat;
    return v;
  }
  /* fills every unknown card of a view with a random consistent guess (for the CPU's sampling) */
  function determinize(v, rng, light) {
    var s = clone(v, light), seen = new Uint8Array(HIDDEN), i, j, t;
    for (i = 0; i < 12; i++) if (s.mk[i] >= 0) seen[s.mk[i]] = 1;
    for (i = 0; i < s.n; i++) {
      var p = s.pl[i];
      for (j = 0; j < p.cards.length; j++) seen[p.cards[j]] = 1;
      for (j = 0; j < p.res.length; j++) if (p.res[j] < HIDDEN) seen[p.res[j]] = 1;
    }
    var pool = [[], [], []];
    for (i = 0; i < HIDDEN; i++) if (!seen[i]) pool[CARDS[i].tier].push(i);
    for (t = 0; t < 3; t++) shuffle(pool[t], rng || Math.random);
    for (i = 0; i < s.n; i++) {
      var q = s.pl[i];
      for (j = 0; j < q.res.length; j++) if (q.res[j] >= HIDDEN) q.res[j] = pool[q.res[j] - HIDDEN].pop();
    }
    for (t = 0; t < 3; t++) { var len = s.dk[t].length; s.dk[t] = pool[t].splice(0, len); }
    delete s.seat;
    return s;
  }

  var api = {
    GOAL: GOAL, LIMIT: LIMIT, MAXRES: MAXRES, GOLD: GOLD, HIDDEN: HIDDEN, COLOR_KEYS: COLOR_KEYS, IDLE_ROUNDS: IDLE_ROUNDS,
    CARDS: CARDS, NOBLES: NOBLES, tierOf: tierOf, mulberry32: mulberry32, shuffle: shuffle, gemsFor: gemsFor,
    newGame: newGame, clone: clone, tokenCount: tokenCount, goldNeeded: goldNeeded, canAfford: canAfford, payment: payment,
    colorsAvailable: colorsAvailable, legal: legal, check: check, act: act, excess: excess, eligible: eligible,
    checkReturn: checkReturn, finish: finish, play: play, result: result, view: view, determinize: determinize
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SPL_ENG = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
