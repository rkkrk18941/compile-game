/* 80%（エイティ・パーセント） — rules engine. Runs in the browser (window.EIGHTY_ENG) and in Node (require).
   Money is whole yen in 10-yen units. A player's cash is always laid out as 10 piles: 1 pile = 10%.
   A round: [borrow phase, only for bankrupt players] → both players decide (bet piles + debt attack) → resolve.
   Bet:    80% the stake doubles, 20% it is lost.
   Borrow: at 0 cash a player may borrow up to the cash they held when the round they went bust began.
           Repeat borrowing immediately multiplies (existing debt + new principal) by five.
   Interest: 30% of outstanding debt after attacks at every round end, rounded up to 10 yen.
   Attack: pick an amount of the opponent's debt. 80% that amount is doubled (their debt grows by it);
           20% it backfires and that amount of debt moves from them to you.
   Winner: higher (cash - debt) after the last round. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EIGHTY_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var START_CASH = 10000; // Ten piles, each beginning with one 1,000-yen banknote.
  var WIN_P = 0.8;
  var UNIT = 10;
  var INTEREST_PERCENT = 30;
  var REBORROW_MULTIPLIER = 5;
  var ROUND_CHOICES = [5, 10, 15, 20];
  // piles picked by "percent": front row centre first, then outwards, then the back row the same way
  var PILE_ORDER = [2, 1, 3, 0, 4, 7, 6, 8, 5, 9];

  function rid() { return Math.floor(Math.random() * 2176782336).toString(36) + Date.now().toString(36).slice(-4); }
  function floorUnit(n) { n = Number(n) || 0; return n <= 0 ? 0 : Math.floor(n / UNIT) * UNIT; }

  /* ---------- piles ---------- */
  // 10 piles that add up to cash. Odd 10-yen coins go to the piles picked last,
  // so choosing "30%" never stakes more than 30%.
  function piles(cash) {
    var u = Math.max(0, Math.floor((Number(cash) || 0) / UNIT)), base = Math.floor(u / 10), rem = u - base * 10, out = [], i;
    for (i = 0; i < 10; i++) out.push(base * UNIT);
    for (i = 0; i < rem; i++) out[PILE_ORDER[9 - i]] += UNIT;
    return out;
  }
  function cleanSel(cash, sel) {
    var ps = piles(cash), seen = {}, out = [];
    if (!Array.isArray(sel)) return out;
    for (var i = 0; i < sel.length && out.length < 10; i++) {
      var k = sel[i];
      if (typeof k !== 'number' || k !== Math.floor(k) || k < 0 || k > 9 || seen[k] || ps[k] <= 0) continue;
      seen[k] = 1; out.push(k);
    }
    return out.sort(function (a, b) { return a - b; });
  }
  function betOf(cash, sel) {
    var ps = piles(cash), b = 0;
    cleanSel(cash, sel).forEach(function (k) { b += ps[k]; });
    return b;
  }
  function selByCount(cash, k) {
    var ps = piles(cash), out = [];
    for (var i = 0; i < 10 && out.length < k; i++) if (ps[PILE_ORDER[i]] > 0) out.push(PILE_ORDER[i]);
    return out.sort(function (a, b) { return a - b; });
  }
  function liveCount(cash) { return piles(cash).filter(function (x) { return x > 0; }).length; }
  // j tenths of a total (j = 0..10), floored to 10 yen; 10 tenths is the whole amount
  function stepOf(total, j) {
    j = Math.max(0, Math.min(10, Math.floor(Number(j) || 0)));
    if (j >= 10) return Math.max(0, total);
    return floorUnit(total * j / 10);
  }
  function clampAtk(debt, x) { x = floorUnit(x); return x <= 0 ? 0 : Math.min(x, Math.max(0, debt)); }
  function clampBorrow(limit, x) { x = floorUnit(x); return x <= 0 ? 0 : Math.min(x, Math.max(0, limit)); }

  /* ---------- game state ---------- */
  function newPlayer(o) {
    return {
      id: String(o.id || ''), nm: String(o.nm || ''), cpu: o.cpu || '',
      cash: START_CASH, debt: 0, limit: 0, took: false,
      st: { win: 0, lose: 0, pass: 0, atkOk: 0, atkNg: 0, hitOk: 0, hitNg: 0, maxCash: START_CASH, maxNet: START_CASH, borrowed: 0, bigWin: 0 }
    };
  }
  function newGame(opts) {
    opts = opts || {};
    var rounds = ROUND_CHOICES.indexOf(Number(opts.rounds)) >= 0 ? Number(opts.rounds) : 10;
    var ps = (opts.players || []).slice(0, 2);
    while (ps.length < 2) ps.push({ id: 'p' + ps.length, nm: 'P' + (ps.length + 1) });
    return {
      v: 2, gid: opts.gid || rid(), rounds: rounds, rnd: 1, ph: 'decide',
      P: ps.map(newPlayer),
      hist: [{ r: 0, cash: [START_CASH, START_CASH], debt: [0, 0] }],
      last: null
    };
  }
  function net(p) { return p.cash - p.debt; }
  function canBorrowRaw(p) { return p.cash === 0 && p.limit > 0 && !p.took; }
  function canBorrow(s, i) { return s.ph !== 'over' && canBorrowRaw(s.P[i]); }
  // A prior loan remains a prior loan even if its debt was transferred away by an attack.
  function borrowDebt(p, x) {
    x = clampBorrow(p.limit, x);
    return x > 0 ? (p.debt + x) * (p.st.borrowed > 0 ? REBORROW_MULTIPLIER : 1) : p.debt;
  }
  function interestOf(debt) { return debt > 0 ? Math.ceil(debt * INTEREST_PERCENT / (100 * UNIT)) * UNIT : 0; }
  // returns the amount actually borrowed (0 = declined). Either way the chance is used up for this round.
  function applyBorrow(s, i, x) {
    var p = s.P[i];
    if (!canBorrow(s, i)) return 0;
    x = clampBorrow(p.limit, x);
    p.took = true;
    if (x > 0) { p.debt = borrowDebt(p, x); p.cash += x; p.st.borrowed += x; }
    return x;
  }
  function won(r) { return typeof r === 'boolean' ? r : Number(r) < WIN_P; }

  // decs[i] = { sel: [pile indexes], atk: yen of the opponent's debt }; rolls = { bet: [r0, r1], atk: [r0, r1] }
  // (each roll is a uniform number in [0,1) or a boolean meaning "succeeds")
  function resolveRound(s, decs, rolls) {
    var res = { r: s.rnd, d: [], out: { bet: [null, null], atk: [null, null] } }, i;
    for (i = 0; i < 2; i++) {
      var p = s.P[i], o = s.P[1 - i], d = decs[i] || {};
      var sel = cleanSel(p.cash, d.sel);
      res.d.push({ sel: sel, bet: betOf(p.cash, sel), atk: clampAtk(o.debt, d.atk), base: p.cash, debt0: p.debt });
    }
    for (i = 0; i < 2; i++) {
      var dd = res.d[i], pp = s.P[i];
      if (dd.bet > 0) {
        var w = won(rolls.bet[i]);
        res.out.bet[i] = w;
        if (w) { pp.cash += dd.bet; pp.st.win++; pp.st.bigWin = Math.max(pp.st.bigWin, dd.bet); }
        else { pp.cash -= dd.bet; pp.st.lose++; }
      } else pp.st.pass++;
    }
    // attack amounts were checked against the debts at decision time; the two attacks commute
    for (i = 0; i < 2; i++) {
      var x = res.d[i].atk;
      if (x > 0) {
        var ok = won(rolls.atk[i]), a = s.P[i], t = s.P[1 - i];
        res.out.atk[i] = ok;
        if (ok) { t.debt += x; a.st.atkOk++; t.st.hitOk++; }
        else { t.debt -= x; a.debt += x; a.st.atkNg++; t.st.hitNg++; }
      }
    }
    res.interest = [];
    for (i = 0; i < 2; i++) {
      var q = s.P[i];
      res.interest[i] = interestOf(q.debt);
      q.debt += res.interest[i];
      if (q.cash === 0 && res.d[i].bet > 0) q.limit = res.d[i].base;   // "the amount you held last turn"
      q.st.maxCash = Math.max(q.st.maxCash, q.cash);
      q.st.maxNet = Math.max(q.st.maxNet, net(q));
      q.took = false;
    }
    s.hist.push({ r: s.rnd, cash: [s.P[0].cash, s.P[1].cash], debt: [s.P[0].debt, s.P[1].debt] });
    s.last = res;
    if (s.rnd >= s.rounds) s.ph = 'over';
    else { s.rnd++; s.ph = (canBorrowRaw(s.P[0]) || canBorrowRaw(s.P[1])) ? 'borrow' : 'decide'; }
    return res;
  }
  function result(s) {
    var n0 = net(s.P[0]), n1 = net(s.P[1]);
    return { nets: [n0, n1], winner: n0 > n1 ? 0 : n1 > n0 ? 1 : -1 };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- referee: owns the true game (solo play, or the host of an online room) ---------- */
  function cryptoRng() {
    var c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && c.getRandomValues) { var a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
    return Math.random();
  }
  function Referee(opt) {
    this.s = opt.state;
    this.rng = opt.rng || cryptoRng;
    this.emit = opt.onEvent || function () {};
    this.need = null; this.got = null;
  }
  Referee.prototype.snap = function () { return clone(this.s); };
  Referee.prototype.start = function () { this.emit({ t: 'start', s: this.snap() }); this._phase(); };
  Referee.prototype._phase = function () {
    var s = this.s;
    if (s.ph === 'over') { this.need = null; this.got = null; this.emit({ t: 'over', s: this.snap(), result: result(s) }); return; }
    if (s.ph === 'borrow') {
      this.need = [canBorrow(s, 0), canBorrow(s, 1)];
      if (!this.need[0] && !this.need[1]) { s.ph = 'decide'; this._phase(); return; }
    } else this.need = [true, true];
    this.got = [null, null];
    this.emit({ t: 'phase', ph: s.ph, r: s.rnd, need: this.need.slice(), s: this.snap() });
  };
  Referee.prototype._ready = function () {
    for (var i = 0; i < 2; i++) if (this.need[i] && this.got[i] === null) return false;
    return true;
  };
  Referee.prototype.waitingFor = function (seat) { return !!(this.need && this.got && this.need[seat] && this.got[seat] === null); };
  Referee.prototype.borrow = function (seat, amt) {
    var s = this.s;
    if (s.ph !== 'borrow' || !this.need || !this.need[seat] || this.got[seat] !== null) return false;
    this.got[seat] = { amt: Number(amt) || 0 };
    if (this._ready()) {
      var list = [];
      for (var i = 0; i < 2; i++) if (this.need[i]) list.push({ seat: i, amt: applyBorrow(s, i, this.got[i].amt) });
      s.ph = 'decide';
      this.emit({ t: 'borrows', list: list, s: this.snap() });
      this._phase();
    }
    return true;
  };
  Referee.prototype.decide = function (seat, d) {
    var s = this.s;
    if (s.ph !== 'decide' || !this.got || this.got[seat] !== null) return false;
    this.got[seat] = { sel: cleanSel(s.P[seat].cash, d && d.sel), atk: clampAtk(s.P[1 - seat].debt, d && d.atk) };
    if (this.got[0] && this.got[1]) {
      var rolls = { bet: [this.rng(), this.rng()], atk: [this.rng(), this.rng()] };
      var res = resolveRound(s, this.got, rolls);
      this.emit({ t: 'resolve', res: res, s: this.snap() });
      this._phase();
    }
    return true;
  };

  /* ---------- CPU players ---------- */
  var CPU_TYPES = {
    careful: { nm: '石橋', title: '慎重派', bet: [0.2, 0.4], atkP: 0.25, atkF: [0.2, 0.4], borrowF: [0.5, 0.5] },
    calc:    { nm: '九条', title: '計算派', bet: [0.5, 0.7], atkP: 0.6, atkF: [0.3, 0.7], borrowF: [1, 1] },
    mad:     { nm: '獅堂', title: '狂犬', bet: [0.8, 1.0], atkP: 0.9, atkF: [0.7, 1.0], borrowF: [1, 1] },
    whim:    { nm: '宮', title: '気分屋', bet: [0, 1], atkP: 0.5, atkF: [0.1, 1.0], borrowF: [0.3, 1] }
  };
  var CPU_KEYS = ['careful', 'calc', 'mad', 'whim'];
  // 最強 and the learning rival play by simulation (below); they are not part of おまかせ
  CPU_TYPES.max = { nm: '鷹宮', title: '最強', bet: [0.6, 0.6], atkP: 0.6, atkF: [0.5, 0.5], borrowF: [1, 1], sim: true };
  CPU_TYPES.grow = { nm: '鏡', title: '成長する敵', bet: [0.6, 0.6], atkP: 0.6, atkF: [0.5, 0.5], borrowF: [1, 1], sim: true };
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* ---------- 最強: play every candidate out many times ----------
     For each candidate (how many piles to stake × how much of the opponent's debt to attack) it plays the rest of
     the game out a few hundred times from the public table: the opponent's move this round is drawn from how players
     usually play (the four personalities, or — for the learning rival — what it has seen of you), every later round
     from a sensible plan for both, and the dice are the same for every candidate. It keeps the candidate that wins
     most often. Everything it uses is on the table: both players' cash and debt, and the round. */
  function simOf(s) {
    return { cash: [s.P[0].cash, s.P[1].cash], debt: [s.P[0].debt, s.P[1].debt], limit: [s.P[0].limit, s.P[1].limit],
      borrowed: [s.P[0].st.borrowed, s.P[1].st.borrowed], took: [s.P[0].took, s.P[1].took], rnd: s.rnd, rounds: s.rounds };
  }
  function simNet(m, i) { return m.cash[i] - m.debt[i]; }
  // the plan both players follow in the imagined rounds: about Kelly's 60%, all in when behind near the end
  function simPlan(m, i, P) {
    var left = m.rounds - m.rnd + 1, lead = simNet(m, i) - simNet(m, 1 - i);
    var k = P.base;
    if (lead < 0 && left <= 3) k = left === 1 ? 10 : 8;
    else if (lead > 0 && left <= 2) k = left === 1 ? 0 : 3;
    var j = 0;
    if (m.debt[1 - i] > 0) j = lead < 0 ? 10 : lead > 0 && left === 1 ? 0 : P.atk;
    return { k: k, j: j };
  }
  function simBorrow(m, i) {
    if (!(m.cash[i] === 0 && m.limit[i] > 0 && !m.took[i])) return;
    var left = m.rounds - m.rnd + 1, behind = simNet(m, i) < simNet(m, 1 - i);
    var x = floorUnit(m.limit[i] * (behind || left > 2 ? 1 : 0.5));
    if (x <= 0) return;
    m.took[i] = true;
    m.debt[i] = (m.debt[i] + x) * (m.borrowed[i] > 0 ? REBORROW_MULTIPLIER : 1);
    m.cash[i] += x; m.borrowed[i] += x;
  }
  function simRound(m, d, r) {   // d: [{k, j}, {k, j}]; r(): uniform
    var base = [m.cash[0], m.cash[1]], stake = [0, 0], atk = [0, 0], i;
    for (i = 0; i < 2; i++) { stake[i] = stepOf(m.cash[i], d[i].k); atk[i] = d[i].j ? stepOf(m.debt[1 - i], d[i].j) : 0; }
    for (i = 0; i < 2; i++) if (stake[i] > 0) { if (r() < WIN_P) m.cash[i] += stake[i]; else m.cash[i] -= stake[i]; }
    for (i = 0; i < 2; i++) {
      var x = atk[i]; if (!x) continue;
      if (r() < WIN_P) m.debt[1 - i] += x; else { m.debt[1 - i] -= x; m.debt[i] += x; }
    }
    for (i = 0; i < 2; i++) {
      m.debt[i] += interestOf(m.debt[i]);
      if (m.cash[i] === 0 && stake[i] > 0) m.limit[i] = base[i];
      m.took[i] = false;
    }
    m.rnd++;
  }
  function cloneSim(m) { return { cash: m.cash.slice(), debt: m.debt.slice(), limit: m.limit.slice(), borrowed: m.borrowed.slice(), took: m.took.slice(), rnd: m.rnd, rounds: m.rounds }; }
  function rng32(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // the opponent's move this round: one of the personalities, or what the learning rival has seen of you
  function oppGuess(s, o, r, P) {
    var h = P.habit;
    if (h && h.n >= 3 && r() < Math.min(0.85, h.n / 12)) {
      var lead = net(s.P[o]) - net(s.P[1 - o]), left = s.rounds - s.rnd + 1;
      var key = (lead < 0 ? 'b' : 'a') + (left <= 2 ? 'e' : 'm'), b = h[key] && h[key].n ? h[key] : h.all;
      var k = Math.max(0, Math.min(10, Math.round((b.bet / b.n) * 10 + (r() - 0.5) * 3)));
      var pa = b.atkC ? (b.atkN || 0) / b.atkC : 0;
      var j = s.P[1 - o].debt > 0 && r() < pa ? Math.max(1, Math.min(10, Math.round((b.atk || 0) / Math.max(1, b.atkN || 0) * 10))) : 0;
      return { k: k, j: j };
    }
    var t = CPU_KEYS[Math.floor(r() * CPU_KEYS.length)], dd = cpuDecide(s, o, t, r);
    var cash = s.P[o].cash, k2 = cash > 0 ? Math.round(betOf(cash, dd.sel) / cash * 10) : 0;
    var od = s.P[1 - o].debt, j2 = od > 0 && dd.atk ? Math.max(1, Math.round(dd.atk / od * 10)) : 0;
    return { k: k2, j: j2 };
  }
  function simDecide(s, i, rng, P) {
    P = P || {};
    var p = s.P[i], o = 1 - i, plan = { base: P.base || 6, atk: P.atk || 5 };
    var ks = p.cash > 0 ? [0, 2, 4, 6, 8, 10] : [0], js = s.P[o].debt > 0 ? [0, 3, 6, 10] : [0];
    var N = P.N || 260, seed = Math.floor((rng || Math.random)() * 4294967296);
    var opp = [], m0 = simOf(s);
    for (var n = 0; n < N; n++) opp.push(oppGuess(s, o, rng32(seed + n * 7919), P));
    var best = null, bv = -1;
    ks.forEach(function (k) {
      js.forEach(function (j) {
        var w = 0;
        for (var n2 = 0; n2 < N; n2++) {
          var r = rng32(seed + 104729 * (n2 + 1)), m = cloneSim(m0), d = [];
          d[i] = { k: k, j: j }; d[o] = opp[n2];
          simRound(m, d, r);
          while (m.rnd <= m.rounds) {
            simBorrow(m, 0); simBorrow(m, 1);
            simRound(m, [simPlan(m, 0, plan), simPlan(m, 1, plan)], r);
          }
          var a = simNet(m, i), b = simNet(m, o);
          w += a > b ? 1 : a === b ? 0.5 : 0;
        }
        if (w > bv + 1e-9) { bv = w; best = { k: k, j: j }; }
      });
    });
    return { sel: p.cash > 0 ? selByCount(p.cash, best.k) : [], atk: best.j ? stepOf(s.P[o].debt, best.j) : 0, p: bv / N };
  }
  function simBorrowAmount(s, i, rng, P) {
    var p = s.P[i], o = 1 - i, plan = { base: (P && P.base) || 6, atk: (P && P.atk) || 5 }, N = (P && P.N) || 260;
    var seed = Math.floor((rng || Math.random)() * 4294967296), best = 0, bv = -1;
    [0, 5, 10].forEach(function (f) {
      var x = f ? stepOf(p.limit, f) || p.limit : 0, w = 0;
      for (var n = 0; n < N; n++) {
        var r = rng32(seed + n * 15485863), m = simOf(s);
        if (x > 0) { m.took[i] = true; m.debt[i] = (m.debt[i] + x) * (m.borrowed[i] > 0 ? REBORROW_MULTIPLIER : 1); m.cash[i] += x; m.borrowed[i] += x; }
        else m.took[i] = true;
        simBorrow(m, o);
        while (m.rnd <= m.rounds) { simRound(m, [simPlan(m, 0, plan), simPlan(m, 1, plan)], r); simBorrow(m, 0); simBorrow(m, 1); }
        var a = simNet(m, i), b = simNet(m, o); w += a > b ? 1 : a === b ? 0.5 : 0;
      }
      if (w > bv) { bv = w; best = x; }
    });
    return best;
  }
  function cpuBorrow(s, i, type, rng, P) {
    rng = rng || Math.random;
    if (CPU_TYPES[type] && CPU_TYPES[type].sim) return simBorrowAmount(s, i, rng, P);
    var T = CPU_TYPES[type] || CPU_TYPES.calc, p = s.P[i], left = s.rounds - s.rnd + 1;
    var f = lerp(T.borrowF[0], T.borrowF[1], rng());
    if (left <= 2 && net(p) < net(s.P[1 - i])) f = 1;
    var j = Math.max(1, Math.min(10, Math.round(f * 10)));
    return stepOf(p.limit, j) || p.limit;
  }
  function cpuDecide(s, i, type, rng, P) {
    rng = rng || Math.random;
    if (CPU_TYPES[type] && CPU_TYPES[type].sim) { var dd = simDecide(s, i, rng, P); return { sel: dd.sel, atk: dd.atk }; }
    var T = CPU_TYPES[type] || CPU_TYPES.calc, p = s.P[i], o = s.P[1 - i], left = s.rounds - s.rnd + 1;
    var lead = net(p) - net(o);
    var f = lerp(T.bet[0], T.bet[1], rng());
    if (type === 'mad' && rng() < 0.6) f = 1;
    if (lead < 0 && left <= 3) f = Math.min(1, f + (left === 1 ? 0.6 : 0.25));
    if (lead > 0 && left <= 2 && type !== 'mad') f = Math.max(0, f - (left === 1 ? 0.4 : 0.2));
    var k = Math.max(0, Math.min(10, Math.round(f * 10)));
    var sel = p.cash > 0 ? selByCount(p.cash, k) : [];
    var atk = 0;
    if (o.debt > 0) {
      var prob = T.atkP + (lead < 0 ? 0.25 : 0) - (lead > 0 && left === 1 ? 0.3 : 0);
      if (rng() < prob) {
        var g = lerp(T.atkF[0], T.atkF[1], rng());
        if (lead < 0 && left === 1) g = 1;
        var j = Math.max(1, Math.min(10, Math.round(g * 10)));
        atk = stepOf(o.debt, j);
      }
    }
    return { sel: sel, atk: atk };
  }

  return {
    START_CASH: START_CASH, WIN_P: WIN_P, UNIT: UNIT, ROUND_CHOICES: ROUND_CHOICES, PILE_ORDER: PILE_ORDER,
    INTEREST_PERCENT: INTEREST_PERCENT, REBORROW_MULTIPLIER: REBORROW_MULTIPLIER,
    CPU_TYPES: CPU_TYPES, CPU_KEYS: CPU_KEYS,
    rid: rid, piles: piles, cleanSel: cleanSel, betOf: betOf, selByCount: selByCount, liveCount: liveCount,
    stepOf: stepOf, clampAtk: clampAtk, clampBorrow: clampBorrow,
    newGame: newGame, net: net, canBorrow: canBorrow, borrowDebt: borrowDebt, interestOf: interestOf, applyBorrow: applyBorrow, resolveRound: resolveRound,
    result: result, clone: clone, cryptoRng: cryptoRng, Referee: Referee,
    cpuBorrow: cpuBorrow, cpuDecide: cpuDecide, simDecide: simDecide
  };
});
