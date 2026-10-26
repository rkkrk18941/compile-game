/* コソドロ・マイン: sessions for solo and online play.
   The host (in solo play: this page alone) owns the real game and runs the CPUs. Every human pick
   travels as a salted SHA-256 commitment first; the picks themselves are sent only after every
   miner in the mine has committed, so nobody (the host included) can see a card before all cards
   are down. The host then publishes each round's proof so every guest can check it. */
(function (root, factory) {
  var E = root && root.KOSO_ENG ? root.KOSO_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var AI = root && root.KOSO_AI ? root.KOSO_AI : (typeof require === 'function' ? require('./ai.js') : null);
  var api = factory(E, AI, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KOSO_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E, AI, G) {
  'use strict';

  function noop() {}
  var BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(function (r) { return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g');
  function cleanName(s) { s = String(s == null ? '' : s).replace(BAD_CHARS, '').trim(); return s.slice(0, 10) || 'ゲスト'; }
  function randHex(bytes) {
    var out = '', i, c = G && G.crypto;
    if (c && c.getRandomValues) { var a = new Uint8Array(bytes); c.getRandomValues(a); for (i = 0; i < a.length; i++) out += ('0' + a[i].toString(16)).slice(-2); return out; }
    for (i = 0; i < bytes; i++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
    return out;
  }

  /* ---------- SHA-256 (synchronous, so it also works where crypto.subtle does not) ---------- */
  var K = [];
  (function () {
    var n = 2, found = 0;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (found < 64) {
      var prime = true;
      for (var d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (prime) { K.push(frac(Math.pow(n, 1 / 3))); found++; }
      n++;
    }
  })();
  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(str) {
    var b = utf8(String(str)), bits = b.length * 8, i;
    b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    for (i = 7; i >= 0; i--) b.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
    for (var off = 0; off < b.length; off += 64) {
      for (i = 0; i < 16; i++) W[i] = (b[off + 4 * i] << 24) | (b[off + 4 * i + 1] << 16) | (b[off + 4 * i + 2] << 8) | b[off + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        var s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  function commitHash(key, seat, pick, salt) { return sha256(key + '|' + seat + '|' + pick.a + '|' + salt); }

  var HEX64 = /^[0-9a-f]{64}$/, SALT = /^[0-9a-f]{16,64}$/;
  var MAX_SEATS = E.MAX_PLAYERS, MIN_SEATS = E.MIN_PLAYERS;

  /* ===================== host ===================== */
  function HostSession(opt) {
    var self = this;
    this.me = { cid: opt.me.cid, nm: cleanName(opt.me.nm), ani: opt.me.ani == null ? -1 : opt.me.ani };
    this.tr = opt.transport || null;
    this.code = opt.code || '';
    this.onView = opt.onView || noop;
    this.onEvent = opt.onEvent || noop;
    this.schedule = opt.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    this.unschedule = opt.unschedule || function (h) { clearTimeout(h); };
    this.rng = opt.rng || Math.random;
    this.salt = opt.salt || function () { return randHex(16); };
    this.think = opt.think || [500, 1900];
    this.roundPause = opt.roundPause != null ? opt.roundPause : 2600;
    this.settings = { mult: E.DEFAULT_MULT, adv: false };
    if (opt.settings) this.setSettings(opt.settings);
    this.lobby = [{ id: this.me.cid, nm: this.me.nm, cpu: 0, ani: this.me.ani, here: true }];
    this.state = null; this.rd = null; this.pf = null; this.lastEv = null; this.seq = 0;
    this.timers = []; this.chatAt = {};
    if (this.tr) {
      this.tr.on('msg', function (cid, m) { self._remote(cid, m); });
      this.tr.on('leave', function (cid) { self._leave(cid); });
    }
  }
  HostSession.prototype.isHost = true;
  HostSession.prototype.online = function () { return !!this.tr; };
  HostSession.prototype._seatOf = function (cid) {
    if (!this.state) return -1;
    for (var i = 0; i < this.state.P.length; i++) if (this.state.P[i].id === cid) return i;
    return -1;
  };
  HostSession.prototype.mySeat = function () { return this._seatOf(this.me.cid); };
  HostSession.prototype._rdPublic = function () {
    var rd = this.rd;
    if (!rd) return null;
    var rv = {}; Object.keys(rd.rv).forEach(function (k) { rv[k] = 1; });
    return { key: rd.key, cm: Object.assign({}, rd.cm), lock: rd.lock, rv: rv };
  };
  HostSession.prototype.view = function () {
    var base = { code: this.code, hostId: this.me.cid, settings: Object.assign({}, this.settings), seq: this.seq };
    if (!this.state) { base.lobby = this.lobby.map(function (x) { return Object.assign({}, x); }); return base; }
    base.state = E.publicView(this.state);
    base.rd = this._rdPublic(); base.pf = this.pf; base.ev = this.lastEv;
    base.here = this.state.P.map(function (p) { return p.here !== false; });
    base.sub = this.state.P.map(function (p) { return !!p.sub; });
    return base;
  };
  HostSession.prototype.publish = function () {
    var v = this.view();
    if (this.tr) this.tr.broadcast({ k: 'view', v: v });
    this.onView(v);
  };
  HostSession.prototype._event = function (e) {
    if (this.tr) this.tr.broadcast({ k: 'evt', e: e });
    this.onEvent(e);
  };
  HostSession.prototype.myPick = function () {
    var me = this.mySeat(), rd = this.rd;
    return rd && me >= 0 && rd.sec[me] ? { a: rd.sec[me].a } : null;
  };

  /* ---- lobby ---- */
  HostSession.prototype.setSettings = function (o) {
    if (this.state) return;
    if (o.mult != null && E.MULTS.indexOf(+o.mult) >= 0) this.settings.mult = +o.mult;
    if (o.adv != null) this.settings.adv = !!o.adv;
    if (this.lobby) this.publish();
  };
  HostSession.prototype._freeAnimal = function (exceptIdx) {
    var used = {};
    this.lobby.forEach(function (s, i) { if (i !== exceptIdx && s.ani >= 0) used[s.ani] = 1; });
    var free = [];
    for (var a = 0; a < E.ANIMALS.length; a++) if (!used[a]) free.push(a);
    return free;
  };
  HostSession.prototype.addCpu = function (level) {
    if (this.state || this.lobby.length >= MAX_SEATS) return false;
    var free = this._freeAnimal(-1);
    var ani = free[Math.floor(this.rng() * free.length)];
    this.lobby.push({ id: 'cpu' + Math.floor(this.rng() * 1e9).toString(36), nm: E.ANIMALS[ani].cpu, cpu: level || 2, ani: ani, here: true });
    this.publish();
    return true;
  };
  HostSession.prototype.removeSeat = function (i) {
    if (this.state || i <= 0 || !this.lobby[i] || !this.lobby[i].cpu) return;
    this.lobby.splice(i, 1); this.publish();
  };
  HostSession.prototype.setCpuLevel = function (i, lv) {
    var s = this.lobby[i];
    if (!this.state && s && s.cpu) { s.cpu = Math.max(1, Math.min(3, lv | 0)); this.publish(); }
  };
  /* claim an animal for a seat; a CPU holding it gives it up for another free one */
  HostSession.prototype.setAnimal = function (cid, ani) {
    if (this.state) return false;
    ani = ani | 0;
    if (ani < -1 || ani >= E.ANIMALS.length) return false;
    var idx = -1;
    this.lobby.forEach(function (s, i) { if (s.id === cid) idx = i; });
    if (idx < 0) return false;
    if (ani >= 0) {
      for (var i = 0; i < this.lobby.length; i++) {
        if (i === idx || this.lobby[i].ani !== ani) continue;
        if (!this.lobby[i].cpu) return false;                 // another person has it
        var self = this, oldCpu = this.lobby[i];
        this.lobby[idx].ani = ani;
        var free = this._freeAnimal(i);
        oldCpu.ani = free.length ? free[Math.floor(self.rng() * free.length)] : -1;
        if (oldCpu.ani >= 0) oldCpu.nm = E.ANIMALS[oldCpu.ani].cpu;
        this.publish();
        return true;
      }
    }
    this.lobby[idx].ani = ani;
    if (cid === this.me.cid) this.me.ani = ani;
    this.publish();
    return true;
  };

  /* ---- the game ---- */
  HostSession.prototype.start = function () {
    var seats = this.lobby.filter(function (s) { return s.cpu || s.here; });
    if (seats.length < MIN_SEATS || seats.length > MAX_SEATS) return false;
    this.clearTimers();
    var rng = this.rng;
    this.state = E.newGame(seats.map(function (s) { return { id: s.id, nm: s.nm, cpu: s.cpu, ani: s.ani >= 0 ? s.ani : null }; }),
      { mult: this.settings.mult, adv: this.settings.adv, seed: Math.floor(rng() * 4294967296) });
    this.state.P.forEach(function (p) {
      if (p.cpu) { p.pers = AI.persona(rng); if (!p.nm || /^CPU/.test(p.nm)) p.nm = E.ANIMALS[p.ani].cpu; }
    });
    this.pf = null; this.lastEv = null; this.seq++;
    this._newRound();
    this._event({ k: 'start' });
    this.publish();
    return true;
  };
  /* continue a saved solo game */
  HostSession.prototype.resume = function (state) {
    if (!state || !state.P || state.ph !== 'pick') return false;
    this.clearTimers();
    this.state = state; this.pf = null; this.lastEv = null; this.seq++;
    this.state.P.forEach(function (p) { p.here = true; });
    this._newRound(true);
    this.publish();
    return true;
  };
  HostSession.prototype.rematch = function () {
    if (!this.state) return false;
    this._toLobby();
    return this.start();
  };
  HostSession.prototype.backToLobby = function () { if (this.state) { this._toLobby(); this.publish(); } };
  HostSession.prototype._toLobby = function () {
    var me = this.me.cid;
    this.lobby = this.state.P.filter(function (p) { return p.cpu || p.here !== false || p.id === me; }).map(function (p) {
      return { id: p.id, nm: p.nm, cpu: p.sub ? 0 : p.cpu, ani: p.ani, here: true };
    });
    this.state = null; this.rd = null; this.pf = null; this.lastEv = null; this.clearTimers();
  };
  HostSession.prototype.clearTimers = function () { var self = this; this.timers.forEach(function (h) { self.unschedule(h); }); this.timers = []; };
  HostSession.prototype._later = function (fn, ms) { this.timers.push(this.schedule(fn, ms)); };
  HostSession.prototype._newRound = function (soon) {
    var s = this.state, self = this;
    this.rd = { key: s.gid + ':' + s.turn, cm: {}, sec: {}, rv: {}, lock: false };
    if (s.ph !== 'pick') return;
    var key = this.rd.key, pause = soon ? 300 : this.roundPause;
    E.activeSeats(s).forEach(function (i) {
      var p = s.P[i];
      if (!p.cpu && !p.sub) return;
      var t = pause + self.think[0] + self.rng() * (self.think[1] - self.think[0]);
      self._later(function () { if (self.rd && self.rd.key === key) self._cpuPick(i); }, t);
    });
  };
  HostSession.prototype._cpuPick = function (i) {
    var s = this.state, rd = this.rd;
    if (!s || !rd || rd.lock || rd.sec[i] || !E.isActive(s, i)) return;
    var p = s.P[i];
    if (!p.cpu && !p.sub) return;                         // the person came back in time
    var pick = AI.decide(s, i, { level: p.cpu || 2, rng: this.rng, pers: p.pers });
    this._store(i, pick);
    if (p.cpu && !p.sub) {
      var line = AI.chatBefore(s, i, pick, p.pers, this.rng);
      if (line) this._event({ k: 'chat', p: i, id: line });
    }
    this.publish();
    this._check();
  };
  HostSession.prototype._store = function (i, pick) {
    var salt = this.salt();
    this.rd.sec[i] = { a: pick.a, s: salt };
    this.rd.cm[i] = commitHash(this.rd.key, i, pick, salt);
  };
  /* the host's own pick (can be changed until every card is down) */
  HostSession.prototype.pick = function (pick) {
    var s = this.state, rd = this.rd, me = this.mySeat();
    if (!s || !rd || rd.lock || me < 0 || !E.validPick(s, me, pick)) return { ok: false };
    this._store(me, { a: pick.a });
    this.publish();
    this._check();
    return { ok: true };
  };
  HostSession.prototype._check = function () {
    var s = this.state, rd = this.rd;
    if (!s || !rd || s.ph !== 'pick' || rd.done) return;
    var act = E.activeSeats(s);
    if (!rd.lock) {
      if (!act.every(function (i) { return rd.cm[i]; })) return;
      rd.lock = true;
      Object.keys(rd.sec).forEach(function (i) { rd.rv[i] = rd.sec[i]; });   // the host's and the CPUs' cards
      this.publish();
      if (this.rd !== rd || rd.done) return;     // a reveal that arrived during publish already resolved it
    }
    if (!act.every(function (i) { return rd.rv[i]; })) return;
    rd.done = true;
    this._resolve(rd);
  };
  HostSession.prototype._resolve = function (rd) {
    var s = this.state, self = this, picks = [];
    E.activeSeats(s).forEach(function (i) { picks[i] = { a: rd.rv[i].a }; });
    var r = E.resolve(s, picks);
    this.state = r.state;
    var rv = {};
    Object.keys(rd.rv).forEach(function (i) { rv[i] = { a: rd.rv[i].a, s: rd.rv[i].s }; });
    this.pf = { key: rd.key, cm: Object.assign({}, rd.cm), rv: rv };
    this.seq++;
    this.lastEv = Object.assign({ seq: this.seq }, r.ev);
    // keep CPU table talk for after the reveal animation
    var talk = [];
    this.state.P.forEach(function (p, i) {
      if (!p.cpu || p.sub) return;
      var line = AI.chatAfter(self.state, r.ev, i, self.rng);
      if (line) talk.push({ p: i, id: line });
    });
    if (this.state.ph === 'pick') this._newRound(); else this.rd = null;
    this.publish();
    this._event({ k: 'reveal', seq: this.seq });
    talk.slice(0, 2).forEach(function (t, n) { self._later(function () { self._event({ k: 'chat', p: t.p, id: t.id }); }, 1700 + n * 500); });
  };
  HostSession.prototype.chat = function (id) { var me = this.mySeat(); if (me >= 0) this._chat(me, id); };
  HostSession.prototype._chat = function (seat, id) {
    if (!AI.CHAT[id] || AI.HUMAN_CHAT.indexOf(id) < 0) return;
    var now = Date.now();
    if (now - (this.chatAt[seat] || 0) < 1200) return;
    this.chatAt[seat] = now;
    this._event({ k: 'chat', p: seat, id: id });
  };

  /* ---- messages from guests ---- */
  HostSession.prototype._remote = function (cid, m) {
    if (!m || typeof m !== 'object') return;
    var s = this.state, seat;
    if (m.k === 'hello') {
      var nm = cleanName(m.nm);
      if (!s) {
        var have = this.lobby.filter(function (x) { return x.id === cid; })[0];
        if (have) { have.nm = nm; have.here = true; }
        else {
          if (this.lobby.length >= MAX_SEATS) {
            // make room by dropping a CPU, otherwise the room is full
            var cpuAt = -1;
            for (var i = this.lobby.length - 1; i > 0; i--) if (this.lobby[i].cpu) { cpuAt = i; break; }
            if (cpuAt < 0) { this.tr.send(cid, { k: 'deny', why: 'full' }); return; }
            this.lobby.splice(cpuAt, 1);
          }
          var want = m.ani | 0, free = this._freeAnimal(-1);
          this.lobby.push({ id: cid, nm: nm, cpu: 0, ani: free.indexOf(want) >= 0 ? want : -1, here: true });
          this._event({ k: 'join', nm: nm });
        }
        this.publish();
        return;
      }
      seat = this._seatOf(cid);
      if (seat < 0) { this.tr.send(cid, { k: 'deny', why: 'started' }); return; }
      s.P[seat].here = true;
      if (s.P[seat].sub) { s.P[seat].sub = false; this._event({ k: 'join', nm: s.P[seat].nm, back: true }); }
      this.publish();
      return;
    }
    if (m.k === 'ani') { if (!s) this.setAnimal(cid, m.ani); return; }
    if (m.k === 'bye') { this._leave(cid); return; }
    seat = this._seatOf(cid);
    if (seat < 0 || !s) return;
    var rd = this.rd;
    if (m.k === 'chat') { this._chat(seat, String(m.id || '')); return; }
    if (!rd || m.key !== rd.key || s.P[seat].sub) return;
    if (m.k === 'commit') {
      if (rd.lock || !E.isActive(s, seat) || typeof m.h !== 'string' || !HEX64.test(m.h)) return;
      rd.cm[seat] = m.h;
      this.publish();
      this._check();
    } else if (m.k === 'reveal') {
      if (!rd.lock || rd.rv[seat] || !rd.cm[seat] || typeof m.s !== 'string' || !SALT.test(m.s)) return;
      var pick = { a: String(m.a) };
      if (!E.validPick(s, seat, pick) || commitHash(rd.key, seat, pick, m.s) !== rd.cm[seat]) return;
      rd.rv[seat] = { a: pick.a, s: m.s };
      this._check();
    }
  };
  HostSession.prototype._leave = function (cid) {
    var s = this.state;
    if (!s) {
      var before = this.lobby.length;
      this.lobby = this.lobby.filter(function (x) { return x.id !== cid || x.cpu; });
      if (this.lobby.length !== before) this.publish();
      return;
    }
    var seat = this._seatOf(cid);
    if (seat < 0 || s.P[seat].cpu) return;
    s.P[seat].here = false; s.P[seat].sub = true;
    this._event({ k: 'leave', nm: s.P[seat].nm });
    var rd = this.rd, self = this;
    // a CPU takes over this seat; a commitment it cannot reveal is replaced
    if (rd && E.isActive(s, seat) && !rd.rv[seat]) {
      delete rd.cm[seat]; delete rd.sec[seat];
      if (rd.lock) { var p = AI.decide(s, seat, { level: 2, rng: this.rng }); this._store(seat, p); rd.rv[seat] = rd.sec[seat]; this.publish(); this._check(); }
      else this._later(function () { self._cpuPick(seat); }, 400);
    }
    this.publish();
  };
  HostSession.prototype.close = function () { this.clearTimers(); if (this.tr) { this.tr.broadcast({ k: 'closed' }); this.tr.close(); } };

  /* ===================== guest ===================== */
  function memStore() { var m = {}; return { get: function (k) { return m[k] || null; }, set: function (k, v) { m[k] = v; } }; }
  function webStore() {
    try {
      var t = G.sessionStorage; t.setItem('kosodoro.t', '1');
      return { get: function (k) { try { return t.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { t.setItem(k, v); } catch (e) {} } };
    } catch (e) { return memStore(); }
  }
  function GuestSession(opt) {
    var self = this;
    this.me = { cid: opt.me.cid, nm: cleanName(opt.me.nm), ani: opt.me.ani == null ? -1 : opt.me.ani };
    this.tr = opt.transport; this.code = opt.code;
    this.onView = opt.onView || noop; this.onEvent = opt.onEvent || noop; this.onClose = opt.onClose || noop;
    this.store = opt.store || (G && G.sessionStorage ? webStore() : memStore());
    this.salt = opt.salt || function () { return randHex(16); };
    this.now = opt.now || function () { return Date.now(); };
    this.v = null; this.seenCm = {}; this.sentAt = {}; this.checked = {};
    this.tr.on('msg', function (m) {
      if (!m) return;
      if (m.k === 'view' && m.v) self._onView(m.v);
      else if (m.k === 'evt' && m.e) self.onEvent(m.e);
      else if (m.k === 'deny') self.onClose(m.why || 'deny');
      else if (m.k === 'closed') self.onClose('host');
    });
    this.tr.on('close', function (why) { self.onClose(why || 'host'); });
  }
  GuestSession.prototype.isHost = false;
  GuestSession.prototype.online = function () { return true; };
  GuestSession.prototype.view = function () { return this.v; };
  GuestSession.prototype.mySeat = function () {
    if (!this.v || !this.v.state) return -1;
    var P = this.v.state.P;
    for (var i = 0; i < P.length; i++) if (P[i].id === this.me.cid) return i;
    return -1;
  };
  GuestSession.prototype._skey = function (key, seat) { return 'kosodoro.sec.' + key + '.' + seat; };
  GuestSession.prototype._secret = function (key, seat) { var j = this.store.get(this._skey(key, seat)); try { return j ? JSON.parse(j) : null; } catch (e) { return null; } };
  GuestSession.prototype.myPick = function () {
    var v = this.v, me = this.mySeat();
    if (!v || !v.rd || me < 0) return null;
    var sc = this._secret(v.rd.key, me);
    return sc ? { a: sc.a } : null;
  };
  GuestSession.prototype.pick = function (pick) {
    var v = this.v, me = this.mySeat();
    if (!v || !v.state || !v.rd || me < 0 || v.rd.lock || !E.validPick(v.state, me, pick)) return { ok: false };
    var salt = this.salt(), p = { a: pick.a };
    var sc = { a: p.a, s: salt, h: commitHash(v.rd.key, me, p, salt) };
    this.store.set(this._skey(v.rd.key, me), JSON.stringify(sc));
    this.tr.send({ k: 'commit', key: v.rd.key, h: sc.h });
    this.sentAt.c = this.now();
    return { ok: true };
  };
  GuestSession.prototype.chat = function (id) { this.tr.send({ k: 'chat', id: id }); };
  GuestSession.prototype.setAnimal = function (ani) { this.me.ani = ani; this.tr.send({ k: 'ani', ani: ani }); };
  GuestSession.prototype._onView = function (v) {
    this.v = v;
    var rd = v.rd, me = this.mySeat(), now = this.now();
    if (v.state && rd && me >= 0 && v.state.ph === 'pick') {
      if (!rd.lock) this.seenCm[rd.key] = Object.assign({}, rd.cm);
      var sc = this._secret(rd.key, me);
      if (sc) {
        if (!rd.lock && rd.cm[me] !== sc.h && now - (this.sentAt.c || 0) > 1500) {   // resend a lost commit
          this.sentAt.c = now; this.tr.send({ k: 'commit', key: rd.key, h: sc.h });
        }
        if (rd.lock && rd.cm[me] === sc.h && !rd.rv[me] && now - (this.sentAt['r' + rd.key] || 0) > 1200) {
          this.sentAt['r' + rd.key] = now;
          this.tr.send({ k: 'reveal', key: rd.key, a: sc.a, s: sc.s });
        }
      }
    }
    // every card the host revealed must match the commitment it published before the reveal
    var pf = v.pf;
    if (pf && !this.checked[pf.key]) {
      var ok = true, saw = this.seenCm[pf.key];
      Object.keys(pf.rv).forEach(function (i) {
        var x = pf.rv[i];
        if (commitHash(pf.key, +i, x, x.s) !== pf.cm[i]) ok = false;
        if (saw && saw[i] && saw[i] !== pf.cm[i] && +i !== me) ok = false;
      });
      this.checked[pf.key] = ok ? 1 : -1;
      if (!ok) this.onEvent({ k: 'proof', ok: false });
    }
    this.onView(v);
  };
  GuestSession.prototype.close = function () { try { this.tr.send({ k: 'bye' }); } catch (e) {} this.tr.close(); };

  /* ===================== PeerJS transport (GitHub Pages has no server of our own) ===================== */
  var PEER_URLS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'kosodoro-mine-v1-';
  var peerLoad = null;
  function loadPeerJS() {
    if (G.Peer) return Promise.resolve();
    if (peerLoad) return peerLoad;
    peerLoad = new Promise(function (res, rej) {
      var i = 0;
      (function next() {
        if (i >= PEER_URLS.length) { peerLoad = null; rej({ code: 'lib' }); return; }
        var sc = G.document.createElement('script'); sc.src = PEER_URLS[i++]; sc.async = true;
        sc.onload = function () { G.Peer ? res() : next(); };
        sc.onerror = function () { sc.remove(); next(); };
        G.document.head.appendChild(sc);
      })();
    });
    return peerLoad;
  }
  function peerOpts() { var o = { debug: 0 }; if (G.KOSO_PEER_OPTS) Object.keys(G.KOSO_PEER_OPTS).forEach(function (k) { o[k] = G.KOSO_PEER_OPTS[k]; }); return o; }
  function PeerTransport() { this.handlers = {}; this.conns = {}; this.peer = null; this.conn = null; }
  PeerTransport.prototype.on = function (ev, fn) { this.handlers[ev] = fn; };
  PeerTransport.prototype.emit = function (ev, a, b) { var f = this.handlers[ev]; if (f) f(a, b); };
  PeerTransport.prototype.hostOpen = async function (code) {
    await loadPeerJS();
    var self = this;
    await new Promise(function (res, rej) {
      var opened = false, peer = new G.Peer(PREFIX + code, peerOpts());
      self.peer = peer;
      peer.on('open', function () { opened = true; res(); });
      peer.on('error', function (e) {
        var t = e && e.type;
        if (!opened) { try { peer.destroy(); } catch (x) {} rej({ code: t === 'unavailable-id' ? 'taken' : 'net', detail: t }); }
        else self.emit('error', t);
      });
      peer.on('disconnected', function () { try { if (!peer.destroyed) peer.reconnect(); } catch (x) {} });
      peer.on('connection', function (conn) {
        conn.on('data', function (msg) {
          if (!msg || typeof msg !== 'object') return;
          if (msg.k === 'hello' && typeof msg.cid === 'string' && msg.cid.length < 40) {
            var old = self.conns[msg.cid];
            if (old && old !== conn) { try { old.close(); } catch (x) {} }
            conn._cid = msg.cid; self.conns[msg.cid] = conn;
            self.emit('msg', msg.cid, { k: 'hello', cid: msg.cid, nm: msg.nm, ani: msg.ani });
          } else if (conn._cid && self.conns[conn._cid] === conn) self.emit('msg', conn._cid, msg);
        });
        conn.on('close', function () { if (conn._cid && self.conns[conn._cid] === conn) { delete self.conns[conn._cid]; self.emit('leave', conn._cid); } });
        conn.on('error', function () {});
      });
    });
  };
  PeerTransport.prototype.broadcast = function (msg) {
    var self = this;
    Object.keys(this.conns).forEach(function (cid) { var c = self.conns[cid]; if (c.open) try { c.send(msg); } catch (e) {} });
  };
  PeerTransport.prototype.send = function (cidOrMsg, msg) {
    if (msg === undefined) { if (this.conn && this.conn.open) try { this.conn.send(cidOrMsg); } catch (e) {} return; }
    var c = this.conns[cidOrMsg];
    if (c && c.open) try { c.send(msg); } catch (e) {}
  };
  PeerTransport.prototype.clientConnect = async function (code, hello) {
    await loadPeerJS();
    var self = this;
    await new Promise(function (res, rej) {
      var done = false, peer = new G.Peer(peerOpts());
      self.peer = peer;
      var to = setTimeout(function () { if (!done) { done = true; rej({ code: 'notfound' }); } }, 15000);
      peer.on('error', function (e) {
        var t = e && e.type;
        if (!done) { done = true; clearTimeout(to); rej({ code: t === 'peer-unavailable' ? 'notfound' : 'net', detail: t }); }
        else if (t === 'peer-unavailable') self.emit('close', 'host');
      });
      peer.on('open', function () {
        var conn = peer.connect(PREFIX + code, { reliable: true });
        self.conn = conn;
        conn.on('open', function () {
          conn.send({ k: 'hello', cid: hello.cid, nm: hello.nm, ani: hello.ani });
          if (!done) { done = true; clearTimeout(to); res(); }
        });
        conn.on('data', function (msg) { if (msg && typeof msg === 'object') self.emit('msg', msg); });
        conn.on('close', function () { self.emit('close', 'host'); });
        conn.on('error', function () {});
      });
    });
  };
  PeerTransport.prototype.close = function () { try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conn = null; this.conns = {}; };

  /* ============ same-browser transport (?net=local): tabs talk over a BroadcastChannel ============ */
  /* Same calls and events as PeerTransport, for trying a room in two tabs without the PeerJS server
     (the browser check uses it). Envelopes: c2h {cid,msg}, h2c {to,msg}, ping/pong, bye, hclose. */
  function LocalTransport() { this.handlers = {}; this.ch = null; this.role = ''; this.cid = ''; this.peers = {}; }
  LocalTransport.prototype.on = PeerTransport.prototype.on;
  LocalTransport.prototype.emit = PeerTransport.prototype.emit;
  LocalTransport.prototype._open = function (code) {
    if (typeof G.BroadcastChannel !== 'function') throw { code: 'lib' };
    this.ch = new G.BroadcastChannel(PREFIX + code);
    var self = this;
    this._bye = function () { self.close(); };
    if (G.addEventListener) G.addEventListener('pagehide', this._bye);
    return this.ch;
  };
  LocalTransport.prototype.hostOpen = async function (code) {
    var self = this, ch = this._open(code), taken = false;
    ch.onmessage = function (e) { var d = e.data || {}; if (d.t === 'pong' && d.to === '#probe') taken = true; };
    ch.postMessage({ t: 'ping', from: '#probe' });
    await new Promise(function (r) { setTimeout(r, 200); });
    if (taken) { ch.close(); this.ch = null; throw { code: 'taken' }; }
    this.role = 'host';
    ch.onmessage = function (e) {
      var d = e.data || {};
      if (d.t === 'ping') ch.postMessage({ t: 'pong', to: d.from });
      else if (d.t === 'c2h' && typeof d.cid === 'string' && d.msg && typeof d.msg === 'object') {
        if (d.msg.k === 'hello') { self.peers[d.cid] = true; self.emit('msg', d.cid, { k: 'hello', cid: d.cid, nm: d.msg.nm, ani: d.msg.ani }); }
        else if (self.peers[d.cid]) self.emit('msg', d.cid, d.msg);
      } else if (d.t === 'bye' && self.peers[d.cid]) { delete self.peers[d.cid]; self.emit('leave', d.cid); }
    };
  };
  LocalTransport.prototype.broadcast = function (msg) { if (this.ch && this.role === 'host') this.ch.postMessage({ t: 'h2c', to: '*', msg: msg }); };
  LocalTransport.prototype.send = function (cidOrMsg, msg) {
    if (!this.ch) return;
    if (msg === undefined) { if (this.role === 'guest') this.ch.postMessage({ t: 'c2h', cid: this.cid, msg: cidOrMsg }); return; }
    if (this.role === 'host' && this.peers[cidOrMsg]) this.ch.postMessage({ t: 'h2c', to: cidOrMsg, msg: msg });
  };
  LocalTransport.prototype.clientConnect = async function (code, hello) {
    var self = this, ch = this._open(code), found = false;
    this.cid = hello.cid;
    ch.onmessage = function (e) { var d = e.data || {}; if (d.t === 'pong' && d.to === self.cid) found = true; };
    ch.postMessage({ t: 'ping', from: this.cid });
    for (var k = 0; k < 15 && !found; k++) await new Promise(function (r) { setTimeout(r, 100); });
    if (!found) { ch.close(); this.ch = null; throw { code: 'notfound' }; }
    this.role = 'guest';
    ch.onmessage = function (e) {
      var d = e.data || {};
      if (d.t === 'h2c' && (d.to === '*' || d.to === self.cid) && d.msg && typeof d.msg === 'object') self.emit('msg', d.msg);
      else if (d.t === 'hclose') self.emit('close', 'host');
    };
    ch.postMessage({ t: 'c2h', cid: this.cid, msg: { k: 'hello', cid: hello.cid, nm: hello.nm, ani: hello.ani } });
  };
  LocalTransport.prototype.close = function () {
    if (!this.ch) return;
    try { if (this.role) this.ch.postMessage(this.role === 'host' ? { t: 'hclose' } : { t: 'bye', cid: this.cid }); this.ch.close(); } catch (e) {}
    if (G.removeEventListener && this._bye) G.removeEventListener('pagehide', this._bye);
    this.ch = null; this.peers = {}; this.role = '';
  };

  /* ===================== in-memory transport (tests) ===================== */
  function MemoryHub() { this.host = null; this.clients = {}; this.queue = []; this.auto = true; }
  MemoryHub.prototype._post = function (fn) { if (this.auto) fn(); else this.queue.push(fn); };
  MemoryHub.prototype.flush = function () { var n = 0; while (this.queue.length && n++ < 100000) this.queue.shift()(); };
  MemoryHub.prototype.hostTransport = function () {
    var hub = this, h = { handlers: {} };
    h.on = function (ev, fn) { h.handlers[ev] = fn; };
    h.broadcast = function (msg) { var d = JSON.parse(JSON.stringify(msg)); Object.keys(hub.clients).forEach(function (cid) { var c = hub.clients[cid]; hub._post(function () { if (hub.clients[cid] === c && c.handlers.msg) c.handlers.msg(d); }); }); };
    h.send = function (cid, msg) { var c = hub.clients[cid], d = JSON.parse(JSON.stringify(msg)); if (c) hub._post(function () { if (c.handlers.msg) c.handlers.msg(d); }); };
    h.close = function () { Object.keys(hub.clients).forEach(function (cid) { var c = hub.clients[cid]; hub._post(function () { if (c.handlers.close) c.handlers.close('host'); }); }); };
    this.host = h;
    return h;
  };
  MemoryHub.prototype.clientTransport = function (cid) {
    var hub = this, c = { handlers: {} };
    c.on = function (ev, fn) { c.handlers[ev] = fn; };
    c.send = function (msg) { var d = JSON.parse(JSON.stringify(msg)); hub._post(function () { if (hub.host && hub.host.handlers.msg && hub.clients[cid] === c) hub.host.handlers.msg(cid, d); }); };
    c.close = function () { if (hub.clients[cid] !== c) return; delete hub.clients[cid]; hub._post(function () { if (hub.host && hub.host.handlers.leave) hub.host.handlers.leave(cid); }); };
    c.connect = function (hello) { hub.clients[cid] = c; c.send(Object.assign({ k: 'hello', cid: cid }, hello)); };
    return c;
  };

  return { HostSession: HostSession, GuestSession: GuestSession, PeerTransport: PeerTransport, LocalTransport: LocalTransport, MemoryHub: MemoryHub,
    loadPeerJS: loadPeerJS, cleanName: cleanName, randHex: randHex, sha256: sha256, commitHash: commitHash, memStore: memStore,
    MAX_SEATS: MAX_SEATS, MIN_SEATS: MIN_SEATS };
});
