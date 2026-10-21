/* ヒトモジ・バトル — sessions: who holds which word, and how the table moves on.
   Table  — the true game. The solo page runs one; online, the host's browser does. It keeps the words of its own
            seats (the person at that browser and the CPUs) and runs the CPUs.
   Guest  — the other browsers online. A guest's word never leaves its browser before the guest goes out: the host
            gets a salted SHA-256 commitment when it is written, then only the positions each declaration opens.
            When the word is finally shown, every browser checks it against the commitment and against every answer
            given (engine.checkWord), so a wrong answer is caught and marked on the result screen. */
(function (root, factory) {
  var E = root && root.HMB_ENG ? root.HMB_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var AI = root && root.HMB_AI ? root.HMB_AI : (typeof require === 'function' ? require('./ai.js') : null);
  var api = factory(E, AI, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HMB_SES = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E, AI, G) {
  'use strict';

  function noop() {}
  function randHex(bytes, rng) {
    var out = '', i, c = G && (G.crypto || G.msCrypto);
    if (!rng && c && c.getRandomValues) { var a = new Uint8Array(bytes); c.getRandomValues(a); for (i = 0; i < a.length; i++) out += ('0' + a[i].toString(16)).slice(-2); return out; }
    rng = rng || Math.random;
    for (i = 0; i < bytes; i++) out += ('0' + Math.floor(rng() * 256).toString(16)).slice(-2);
    return out;
  }
  var CPU_NAMES = ['イロハ', 'カナ', 'コトハ', 'フミ', 'ヨミ', 'シオリ'];
  var LEVEL_NAME = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい', 4: '最強', 5: '成長する敵' };

  /* ================================================================ the table (solo page or online host) */
  /* opt: { seats: [{ nm, kind: 'me'|'cpu'|'guest', cpu, cid }], gid, mode, theme, maxLen, selfChain, first, rng,
           onUpdate(view, events), schedule, unschedule, speed, think: [min, max], pause, judge } */
  function Table(opt) {
    this.rng = opt.rng || Math.random;
    this.schedule = opt.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    this.unschedule = opt.unschedule || function (h) { clearTimeout(h); };
    this.onUpdate = opt.onUpdate || noop;
    this.speed = opt.speed || 1;
    this.think = opt.think || [600, 1300];
    this.pause = opt.pause != null ? opt.pause : 1300;     // after a reveal, before a CPU declares (the flips play)
    this.judge = opt.judge != null ? opt.judge : 520;      // a beat between the declaration and the flips
    this.saltFn = opt.salt || function () { return randHex(16); };
    this.tune = opt.tune || null;               // seat → values for chooseLetter (the learning rival's)
    this.avoidWords = opt.avoidWords || null;   // words a CPU should not pick again
    this.seats = opt.seats.map(function (x) { return { nm: x.nm, kind: x.kind, cpu: x.cpu | 0, cid: x.cid || null }; });
    this.local = {};       // seat → { cells, disp, salt } for the words this browser holds
    this.timers = {};
    this.closed = false;
    this.s = E.newGame({ gid: opt.gid || (1 + Math.floor(this.rng() * 2e9)), mode: opt.mode, theme: opt.theme, maxLen: opt.maxLen, selfChain: opt.selfChain, first: opt.first, players: this.seats });
  }
  Table.prototype.view = function () { return E.publicView(this.s); };
  Table.prototype.isLocal = function (seat) { var k = this.seats[seat] && this.seats[seat].kind; return k === 'me' || k === 'cpu'; };
  Table.prototype._emit = function (ev) { if (this.closed) return; this.onUpdate(this.view(), ev || []); this.tick(); };
  Table.prototype.start = function () { this._emit([{ k: 'write' }]); };

  /* the person at this browser (or a CPU) has written a word */
  Table.prototype.writeLocal = function (seat, cells, disp) {
    var s = this.s;
    if (!this.isLocal(seat) || s.phase !== 'write' || s.P[seat].ready) return { ok: false, err: 'closed' };
    if (!E.validCells(s.mode, cells, s.maxLen)) return { ok: false, err: 'cells' };
    var salt = this.saltFn(), h = E.commitHash(s.gid, seat, cells, salt);
    this.local[seat] = { cells: cells.slice(), disp: E.cleanDisplay(disp), salt: salt };
    var r = E.setReady(s, seat, h);
    if (r.ok) this._emit(r.started ? [{ k: 'ready', seat: seat }, s.phase === 'over' ? { k: 'over', winner: s.winner } : { k: 'start', seat: s.turn }] : [{ k: 'ready', seat: seat }]);
    return r;
  };
  /* a guest's commitment */
  Table.prototype.commitRemote = function (seat, h) {
    var s = this.s;
    if (this.isLocal(seat)) return { ok: false };
    var r = E.setReady(s, seat, h);
    if (r.ok) this._emit(r.started ? [{ k: 'ready', seat: seat }, s.phase === 'over' ? { k: 'over', winner: s.winner } : { k: 'start', seat: s.turn }] : [{ k: 'ready', seat: seat }]);
    return r;
  };
  Table.prototype.declare = function (seat, ch) {
    var r = E.declare(this.s, seat, ch);
    if (!r.ok) return r;
    var p = this.s.pend, self = this;
    // the words this browser holds answer at once; guests answer when they see the declaration
    p.need.forEach(function (q) { if (self.isLocal(q)) self._answerLocal(q); });
    this._emit([{ k: 'pending', by: seat, ch: ch, ply: p.ply }]);
    return { ok: true };
  };
  Table.prototype._answerLocal = function (q) {
    var s = this.s, w = this.local[q], p = s.pend;
    if (!w || !p) return;
    var a = E.answerFor(w.cells, s.P[q].open, p.ch);
    if (a.out) a.word = { cells: w.cells, disp: w.disp, salt: w.salt };
    E.answer(s, q, a);
  };
  Table.prototype.answerRemote = function (seat, ply, a) {
    var s = this.s;
    if (!s.pend || s.pend.ply !== ply || this.isLocal(seat)) return { ok: false, err: 'stale' };
    var r = E.answer(s, seat, a);
    if (r.ok) this._emit([{ k: 'answered', seat: seat }]);
    return r;
  };
  Table.prototype._resolve = function () {
    var s = this.s;
    if (!s.pend || !E.answered(s)) return;
    var ev = E.resolve(s);
    if (!ev) return;
    if (s.phase === 'over') this._revealLocal();
    this._emit(ev);
  };
  Table.prototype._revealLocal = function () {
    var s = this.s, self = this;
    Object.keys(this.local).forEach(function (q) { q = +q; if (!s.P[q].cells && !s.P[q].forfeit) E.reveal(s, q, self.local[q]); });
  };
  Table.prototype.revealRemote = function (seat, w) {
    var s = this.s;
    if (s.phase !== 'over' || this.isLocal(seat) || !w) return false;
    var ok = E.reveal(s, seat, w);
    if (ok) this._emit([{ k: 'reveal', seat: seat }]);
    return ok;
  };
  /* a guest who is gone for good: out, word unknown */
  Table.prototype.forfeit = function (seat) {
    var s = this.s;
    if (s.phase === 'over' || !s.P[seat] || s.P[seat].out) return false;
    if (s.pend && s.pend.need.indexOf(seat) >= 0 && !s.pend.got[seat]) { E.answer(s, seat, { forfeit: true }); this._emit([{ k: 'answered', seat: seat }]); return true; }
    if (s.pend) return false;
    var ev = E.forfeit(s, seat);
    if (!ev) return false;
    if (s.phase === 'over') this._revealLocal();
    this._emit(ev);
    return true;
  };
  /* what is everyone waiting for? (for the host's screen) */
  Table.prototype.waitingFor = function () {
    var s = this.s, out = [];
    if (s.phase === 'write') s.P.forEach(function (p, i) { if (!p.ready && !p.out) out.push(i); });
    else if (s.pend) s.pend.need.forEach(function (q) { if (!s.pend.got[q]) out.push(q); });
    else if (s.phase === 'play') out.push(s.turn);
    return out;
  };

  /* --- timers: CPUs write, CPUs declare, the pending declaration resolves --- */
  Table.prototype._after = function (key, ms, fn) {
    var self = this;
    if (this.timers[key]) return;
    this.timers[key] = this.schedule(function () { delete self.timers[key]; if (!self.closed) fn(); }, Math.max(0, ms / this.speed));
  };
  Table.prototype.clearTimers = function () { for (var k in this.timers) this.unschedule(this.timers[k]); this.timers = {}; };
  Table.prototype.tick = function () {
    var s = this.s, self = this, gid = s.gid;
    if (this.closed || s.phase === 'over') { this.clearTimers(); return; }
    if (s.phase === 'write') {
      s.P.forEach(function (pl, q) {
        if (pl.ready || pl.out || self.seats[q].kind !== 'cpu') return;
        var t = self.think[0] + self.rng() * (self.think[1] - self.think[0]) + 300 * q;
        self._after('w' + gid + ':' + q, t, function () {
          if (self.s !== s || s.phase !== 'write' || s.P[q].ready) return;
          var avoid = Object.keys(self.local).map(function (k) { return self.local[k].cells.filter(function (c) { return c !== E.X; }).join(''); });
          if (self.avoidWords) avoid = avoid.concat(self.avoidWords);
          var w = AI.chooseWord(s.mode, s.theme.id, self.seats[q].cpu, self.rng, s.maxLen, avoid);
          self.writeLocal(q, w.cells, w.disp);
        });
      });
      return;
    }
    if (s.pend) {
      if (E.answered(s)) this._after('j' + gid + ':' + s.pend.ply, this.judge, function () { self._resolve(); });
      return;
    }
    var t = s.turn;
    if (this.seats[t] && this.seats[t].kind === 'cpu') {
      var ply = s.ply;
      var wait = this.pause + this.think[0] + this.rng() * (this.think[1] - this.think[0]) * (s.chain ? 0.6 : 1);
      this._after('c' + gid + ':' + ply, wait, function () {
        if (self.s !== s || s.phase !== 'play' || s.pend || s.turn !== t || s.ply !== ply) return;
        var ch = AI.chooseLetter(E.publicView(s), t, self.local[t].cells, self.seats[t].cpu, self.rng, self.tune ? self.tune(t) : undefined);
        if (ch) self.declare(t, ch);
      });
    }
  };
  Table.prototype.close = function () { this.closed = true; this.clearTimers(); };

  /* ================================================================ a guest's own word */
  /* opt: { send(msg), store: { get(k), set(k, v) }, key: storage prefix, now() } */
  function Guest(opt) {
    this.send = opt.send || noop;
    this.store = opt.store || memStore();
    this.prefix = opt.key || 'hmb.sec';
    this.now = opt.now || function () { return Date.now(); };
    this.saltFn = opt.salt || function () { return randHex(16); };
    this.seat = -1; this.v = null; this.sent = {};
  }
  Guest.prototype._k = function (gid, seat) { return this.prefix + '.' + gid + '.' + seat; };
  Guest.prototype.secret = function (v) {
    v = v || this.v;
    if (!v || this.seat < 0) return null;
    var j = this.store.get(this._k(v.gid, this.seat));
    try { var w = j ? JSON.parse(j) : null; return w && E.validCells(v.mode, w.cells, v.maxLen) ? w : null; } catch (e) { return null; }
  };
  /* the guest wrote their word: keep it here, send only its hash */
  Guest.prototype.write = function (cells, disp) {
    var v = this.v;
    if (!v || v.phase !== 'write' || this.seat < 0) return { ok: false, err: 'closed' };
    if (!E.validCells(v.mode, cells, v.maxLen)) return { ok: false, err: 'cells' };
    var w = this.secret(v);
    if (!w) { w = { cells: cells.slice(), disp: E.cleanDisplay(disp), salt: this.saltFn() }; this.store.set(this._k(v.gid, this.seat), JSON.stringify(w)); }
    this._commit(v, w, true);
    return { ok: true };
  };
  Guest.prototype._commit = function (v, w, force) {
    var key = 'w' + v.gid, now = this.now();
    if (!force && now - (this.sent[key] || 0) < 1500) return;
    this.sent[key] = now;
    this.send({ k: 'word', gid: v.gid, h: E.commitHash(v.gid, this.seat, w.cells, w.salt) });
  };
  /* every view: answer what is asked of us, resend what may have been lost */
  Guest.prototype.onView = function (v, seat) {
    this.v = v; if (seat != null) this.seat = seat;
    var me = this.seat;
    if (!v || me < 0 || !v.P[me]) return;
    var w = this.secret(v), now = this.now();
    if (!w) {
      // the word is not on this device (another tab or browser): this seat cannot answer, so it gives up
      if (v.phase === 'play' && !v.P[me].out && !this.sent['l' + v.gid]) { this.sent['l' + v.gid] = now; this.send({ k: 'lost', gid: v.gid }); }
      return;
    }
    if (v.phase === 'write' && !v.P[me].ready && !v.P[me].out) this._commit(v, w, false);
    if (v.pend && v.pend.need.indexOf(me) >= 0 && !v.pend.got[me]) {
      var key = 'a' + v.gid + '.' + v.pend.ply;
      if (now - (this.sent[key] || 0) > 1200) {
        this.sent[key] = now;
        var a = E.answerFor(w.cells, v.P[me].open, v.pend.ch);
        var msg = { k: 'hits', gid: v.gid, ply: v.pend.ply, pos: a.pos, out: a.out };
        if (a.out) msg.word = { cells: w.cells, disp: w.disp, salt: w.salt };
        this.send(msg);
      }
    }
    if (v.phase === 'over' && !v.P[me].cells && !v.P[me].forfeit) {
      var rk = 'r' + v.gid;
      if (now - (this.sent[rk] || 0) > 1500) { this.sent[rk] = now; this.send({ k: 'reveal', gid: v.gid, word: { cells: w.cells, disp: w.disp, salt: w.salt } }); }
    }
  };
  Guest.prototype.declare = function (ch) {
    var v = this.v;
    if (!v || E.canDeclare(v, this.seat, ch)) return { ok: false };
    this.send({ k: 'declare', gid: v.gid, ply: v.ply, ch: ch });
    return { ok: true };
  };

  /* ================================================================ host: messages from guests */
  var HEX64 = /^[0-9a-f]{64}$/, SALT = /^[0-9a-f]{8,64}$/;
  function cleanWord(w, mode) {
    if (!w || typeof w !== 'object' || !Array.isArray(w.cells) || w.cells.length !== E.SLOTS) return null;
    var cells = w.cells.map(function (c) { return typeof c === 'string' ? c.slice(0, 2) : ''; });
    if (typeof w.salt !== 'string' || !SALT.test(w.salt)) return null;
    return { cells: cells, disp: E.cleanDisplay(typeof w.disp === 'string' ? w.disp : ''), salt: w.salt };
  }
  /* returns true when the message was for the table */
  function hostHandle(table, seat, m) {
    if (!table || !m || typeof m !== 'object' || seat < 0 || table.isLocal(seat)) return false;
    var s = table.s;
    if (m.gid !== s.gid) return false;
    if (m.k === 'word') { if (typeof m.h === 'string' && HEX64.test(m.h)) table.commitRemote(seat, m.h); return true; }
    if (m.k === 'declare') {
      if (m.ply !== s.ply || typeof m.ch !== 'string') return true;
      table.declare(seat, m.ch);
      return true;
    }
    if (m.k === 'hits') {
      var pos = Array.isArray(m.pos) ? m.pos.slice(0, E.SLOTS) : [];
      var a = { pos: pos, out: !!m.out };
      if (a.out) { a.word = cleanWord(m.word, s.mode); if (!a.word) return true; }
      table.answerRemote(seat, m.ply, a);
      return true;
    }
    if (m.k === 'reveal') { var w = cleanWord(m.word, s.mode); if (w) table.revealRemote(seat, w); return true; }
    if (m.k === 'lost') { if (s.phase === 'play') table.forfeit(seat); return true; }
    return false;
  }

  function memStore() { var m = {}; return { get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, set: function (k, v) { m[k] = v; } }; }

  /* one game between two sets of the learning rival's values, all at once (no timers): n CPUs, a in the even seats
     (the odd ones when swap), the お題 picked by the seed. The result for a: 1 win, 0 loss. */
  function practice(a, b, seed, swap, n, mode) {
    n = n || 3; mode = mode || 'ja';
    var rng = (function (x) { return function () { x = (x + 0x6D2B79F5) >>> 0; var t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(seed >>> 0);
    var seats = [], side = function (q) { return (q % 2 === 0) !== !!swap; };
    for (var i = 0; i < n; i++) seats.push({ nm: 'p' + i, kind: 'cpu', cpu: 5 });
    var themes = W_LIST(mode), th = themes[Math.floor(rng() * themes.length)];
    var queue = [];
    var t = new Table({ seats: seats, mode: mode, theme: { id: th.id, name: th.name }, maxLen: 7, selfChain: true, first: seed % n, rng: rng,
      schedule: function (fn) { queue.push(fn); return queue.length; }, unschedule: function () {}, salt: function () { return '00'; },
      tune: function (q) { return side(q) ? a : b; } });
    t.start();
    var guard = 0;
    while (queue.length && t.s.phase !== 'over' && guard++ < 3000) queue.shift()();
    if (t.s.phase !== 'over') return 0.5;
    return side(t.s.winner) ? 1 : 0;
  }
  function W_LIST(mode) { var W = (G && G.HMB_WORDS) || (typeof require === 'function' ? require('./words.js') : null); return W.list(mode); }

  return { Table: Table, Guest: Guest, hostHandle: hostHandle, memStore: memStore, randHex: randHex, CPU_NAMES: CPU_NAMES, LEVEL_NAME: LEVEL_NAME, practice: practice };
});
