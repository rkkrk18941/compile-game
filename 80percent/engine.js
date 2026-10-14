/* 80%（エイティ・パーセント） — rules engine. Runs in the browser (window.EIGHTY_ENG) and in Node (require).
   Money is whole yen in 10-yen units. A player's cash is always laid out as 10 piles: 1 pile = 10%.
   A round: [borrow phase, only for bankrupt players] → both players decide (bet piles + debt attack) → resolve.
   Bet:    80% the stake doubles, 20% it is lost.
   Borrow: at 0 cash a player may borrow up to the cash they held when the round they went bust began.
   Attack: pick an amount of the opponent's debt. 80% that amount is doubled (their debt grows by it);
           20% it backfires and that amount of debt moves from them to you.
   Winner: higher (cash - debt) after the last round. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EIGHTY_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var START_CASH = 1000;
  var WIN_P = 0.8;
  var UNIT = 10;
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
      v: 1, gid: opts.gid || rid(), rounds: rounds, rnd: 1, ph: 'decide',
      P: ps.map(newPlayer),
      hist: [{ r: 0, cash: [START_CASH, START_CASH], debt: [0, 0] }],
      last: null
    };
  }
  function net(p) { return p.cash - p.debt; }
  function canBorrowRaw(p) { return p.cash === 0 && p.limit > 0 && !p.took; }
  function canBorrow(s, i) { return s.ph !== 'over' && canBorrowRaw(s.P[i]); }
  // returns the amount actually borrowed (0 = declined). Either way the chance is used up for this round.
  function applyBorrow(s, i, x) {
    var p = s.P[i];
    if (!canBorrowRaw(p)) return 0;
    x = clampBorrow(p.limit, x);
    p.took = true;
    if (x > 0) { p.cash += x; p.debt += x; p.st.borrowed += x; }
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
    for (i = 0; i < 2; i++) {
      var q = s.P[i];
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
  function lerp(a, b, t) { return a + (b - a) * t; }
  function cpuBorrow(s, i, type, rng) {
    rng = rng || Math.random;
    var T = CPU_TYPES[type] || CPU_TYPES.calc, p = s.P[i], left = s.rounds - s.rnd + 1;
    var f = lerp(T.borrowF[0], T.borrowF[1], rng());
    if (left <= 2 && net(p) < net(s.P[1 - i])) f = 1;
    var j = Math.max(1, Math.min(10, Math.round(f * 10)));
    return stepOf(p.limit, j) || p.limit;
  }
  function cpuDecide(s, i, type, rng) {
    rng = rng || Math.random;
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
    CPU_TYPES: CPU_TYPES, CPU_KEYS: CPU_KEYS,
    rid: rid, piles: piles, cleanSel: cleanSel, betOf: betOf, selByCount: selByCount, liveCount: liveCount,
    stepOf: stepOf, clampAtk: clampAtk, clampBorrow: clampBorrow,
    newGame: newGame, net: net, canBorrow: canBorrow, applyBorrow: applyBorrow, resolveRound: resolveRound,
    result: result, clone: clone, cryptoRng: cryptoRng, Referee: Referee,
    cpuBorrow: cpuBorrow, cpuDecide: cpuDecide
  };
});
