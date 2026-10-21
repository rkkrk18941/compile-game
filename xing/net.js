/* ×ing／バッティング (browser edition): sessions for solo and online play.
   The host owns the true game. Every pick travels as a salted SHA-256 commitment first; the picks
   themselves are only sent after every active hand has committed, so nobody (the host included)
   sees a choice before all choices are locked. Resolution uses the set of picks, never arrival order. */
(function (root, factory) {
  var E = root && root.XING_ENG ? root.XING_ENG : (typeof require === 'function' ? require('./engine.js') : null);
  var api = factory(E, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.XING_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E, G) {
  'use strict';

  function noop() {}
  var BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(function (r) { return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g');
  function cleanName(s) { s = String(s || '').replace(BAD_CHARS, '').trim(); return s.slice(0, 10) || 'ゲスト'; }
  function randHex(bytes) {
    var out = '', i;
    var c = G && (G.crypto || (G.msCrypto));
    if (c && c.getRandomValues) { var a = new Uint8Array(bytes); c.getRandomValues(a); for (i = 0; i < a.length; i++) out += ('0' + a[i].toString(16)).slice(-2); return out; }
    for (i = 0; i < bytes; i++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
    return out;
  }
  var HEX64 = /^[0-9a-f]{64}$/, SALT = /^[0-9a-f]{16,64}$/, TARGET = /^[tv][0-9]$/;
  var CPU_NAMES = ['ルビ', 'サファ', 'コハク', 'オパル', 'ヒスイ', 'ラピス'];
  var MAX_SEATS = 6;

  /* ===================== host ===================== */
  function HostSession(opt) {
    this.me = opt.me;
    this.tr = opt.transport || null;
    this.code = opt.code || '';
    this.roundLimit = E.roundLimit(opt.roundLimit);
    this.onView = opt.onView || noop;
    this.onEvent = opt.onEvent || noop;
    this.schedule = opt.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    this.unschedule = opt.unschedule || function (h) { clearTimeout(h); };
    this.rng = opt.rng || Math.random;
    this.cpuOver = opt.cpuOver || null;   // (person, state) → the learning rival's settings for that CPU, or null
    this.salt = opt.salt || function () { return randHex(16); };
    this.lobby = [{ id: this.me.cid, nm: this.me.nm, cpu: 0, here: true }];
    this.state = null; this.rd = null; this.pf = null;
    this.timers = {}; this.speed = 1;
    this.roundPause = opt.roundPause != null ? opt.roundPause : 2900;   // let the reveal animation play before CPUs commit
    this.think = opt.think || [700, 2300];
    var self = this;
    if (this.tr) {
      this.tr.on('msg', function (cid, m) { self._remote(cid, m); });
      this.tr.on('leave', function (cid) { self._leave(cid); });
    }
  }
  HostSession.prototype.isHost = true;
  HostSession.prototype.mySeat = function () {
    if (!this.state) return 0;
    for (var i = 0; i < this.state.P.length; i++) if (this.state.P[i].id === this.me.cid) return i;
    return -1;
  };
  HostSession.prototype._roundInfo = function () {
    var rd = this.rd;
    if (!rd) return null;
    var rvd = {}; Object.keys(rd.rv).forEach(function (a) { rvd[a] = 1; });
    return { g: rd.g, r: rd.r, cm: Object.assign({}, rd.cm), lock: rd.lock, rvd: rvd };
  };
  HostSession.prototype.view = function () {
    if (!this.state) return { lobby: this.lobby.map(function (x) { return Object.assign({}, x); }), code: this.code, hostId: this.me.cid, roundLimit: this.roundLimit };
    return { state: E.publicView(this.state), rd: this._roundInfo(), pf: this.pf, code: this.code, hostId: this.me.cid };
  };
  /* the host's own secrets, for its own screen only */
  HostSession.prototype.myPicks = function () {
    var rd = this.rd, out = {}, me = this.mySeat(), s = this.state;
    if (!rd || !s || me < 0) return out;
    E.actorsOf(s, me).forEach(function (a) { if (rd.sec[a]) out[a] = rd.sec[a].t; });
    return out;
  };
  HostSession.prototype.publish = function () {
    var v = this.view();
    if (this.tr) this.tr.hostPublish(v);
    this.onView(v);
  };
  HostSession.prototype.addCpu = function (level) {
    if (this.state || this.lobby.length >= MAX_SEATS) return;
    var used = this.lobby.map(function (s) { return s.nm; });
    var nm = CPU_NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || 'CPU';
    this.lobby.push({ id: 'cpu' + Math.floor(this.rng() * 1e9).toString(36), nm: nm, cpu: level || 2, here: true });
    this.publish();
  };
  HostSession.prototype.removeSeat = function (i) { if (!this.state && i > 0 && this.lobby[i]) { this.lobby.splice(i, 1); this.publish(); } };
  HostSession.prototype.setCpuLevel = function (i, lv) { var s = this.lobby[i]; if (!this.state && s && s.cpu) { s.cpu = lv; this.publish(); } };
  HostSession.prototype.setRoundLimit = function (n) { if (!this.state) { this.roundLimit = E.roundLimit(n); this.publish(); } };
  HostSession.prototype.start = function (opts) {
    var seats = this.lobby.filter(function (s) { return s.cpu || s.here; });
    if (seats.length < 2 || seats.length > MAX_SEATS) return false;
    opts = Object.assign({ roundLimit: this.roundLimit }, opts || {});
    this.state = E.newGame(seats.map(function (s) { return { id: s.id, nm: s.nm, cpu: s.cpu }; }), opts);
    this.roundLimit = this.state.roundLimit;
    this.pf = null;
    this.clearTimers();
    this._newRound(true);
    this.publish();
    this.onEvent({ k: 'start' });
    this.tick();
    return true;
  };
  HostSession.prototype.rematch = function () {
    if (!this.state) return;
    this.lobby = this.state.P.filter(function (p) { return p.cpu || p.here !== false; }).map(function (p) { return { id: p.id, nm: p.nm, cpu: p.sub ? 0 : p.cpu, here: true }; });
    this.state = null;
    return this.start();
  };
  HostSession.prototype.backToLobby = function () {
    if (!this.state) return;
    this.lobby = this.state.P.filter(function (p) { return p.cpu || p.here !== false; }).map(function (p) { return { id: p.id, nm: p.nm, cpu: p.sub ? 0 : p.cpu, here: true }; });
    this.state = null; this.rd = null; this.pf = null; this.clearTimers(); this.publish();
  };
  HostSession.prototype._newRound = function () {
    var s = this.state;
    this.rd = { g: s.gid, r: s.rnd, cm: {}, rv: {}, sec: {}, lock: false, t0: Date.now() };
  };
  HostSession.prototype._ownerOf = function (a) { return this.state.A[a] ? this.state.A[a].p : -1; };
  HostSession.prototype._personOf = function (cid) { var s = this.state; for (var i = 0; i < s.P.length; i++) if (s.P[i].id === cid) return i; return -1; };

  /* record one commitment (first one wins; repeats are ignored) */
  HostSession.prototype._commit = function (a, h) {
    var s = this.state, rd = this.rd;
    if (!s || !rd || s.ph !== 'pick' || rd.lock) return false;
    if (!E.isActive(s, a) || rd.cm[a]) return false;
    rd.cm[a] = h;
    var all = E.activeActors(s).every(function (x) { return !!rd.cm[x]; });
    if (all) {
      rd.lock = true;
      // the host's own and the CPUs' secrets are opened only now, when nothing can change any more
      Object.keys(rd.sec).forEach(function (k) { rd.rv[k] = rd.sec[k]; });
    }
    return true;
  };
  /* the host's own hand: pick is kept locally until everyone has committed */
  HostSession.prototype.commitLocal = function (a, t) {
    var s = this.state, me = this.mySeat();
    if (!s || this._ownerOf(a) !== me || s.P[me].cpu) return { ok: false, err: 'not yours' };
    return this._commitSecret(a, t);
  };
  HostSession.prototype._commitSecret = function (a, t) {
    var s = this.state, rd = this.rd;
    if (!s || !rd || s.ph !== 'pick' || rd.lock || rd.cm[a]) return { ok: false, err: 'closed' };
    if (!E.isLegal(s, a, t)) return { ok: false, err: 'illegal' };
    var salt = this.salt(), h = E.commitHash(rd.g, rd.r, a, t, salt);
    rd.sec[a] = { t: t, s: salt, h: h };
    this._commit(a, h);
    this.onEvent({ k: 'commit', a: a });
    this._afterChange();
    return { ok: true };
  };
  HostSession.prototype._reveal = function (a, t, salt) {
    var s = this.state, rd = this.rd;
    if (!s || !rd || !rd.lock || rd.rv[a] || !rd.cm[a]) return false;
    if (E.commitHash(rd.g, rd.r, a, t, salt) !== rd.cm[a]) return false;
    rd.rv[a] = { t: t, s: salt, h: rd.cm[a] };
    return true;
  };
  HostSession.prototype._afterChange = function () {
    if (!this._tryResolve()) { this.publish(); this.tick(); }
  };
  HostSession.prototype._tryResolve = function () {
    var s = this.state, rd = this.rd;
    if (!s || !rd || s.ph !== 'pick' || !rd.lock) return false;
    var act = E.activeActors(s);
    if (!act.every(function (a) { return !!rd.rv[a]; })) return false;
    var picks = s.A.map(function (x, a) {
      if (x.rest) return null;
      var t = rd.rv[a].t;
      return E.isLegal(s, a, t) ? t : null;     // a forged illegal pick only forfeits that hand
    });
    var r = E.resolveRound(s, picks);
    if (!r.ok) return false;
    var proof = { g: rd.g, r: rd.r, cm: Object.assign({}, rd.cm), rv: {} };
    Object.keys(rd.rv).forEach(function (k) { proof.rv[k] = { t: rd.rv[k].t, s: rd.rv[k].s }; });
    this.pf = proof;
    this._newRound();
    this.onEvent({ k: 'resolved', res: r.res });
    this.publish();
    this.tick();
    return true;
  };
  HostSession.prototype.dealLocal = function (t) {
    var s = this.state, me = this.mySeat();
    if (!s || s.ph !== 'deal' || s.dealer !== me || s.P[me].cpu) return { ok: false, err: 'not dealer' };
    return this._deal(t);
  };
  HostSession.prototype._deal = function (t) {
    var s = this.state, r = E.dealPlace(s, s.dealer, t);
    if (r.ok) { this._newRound(); this.onEvent({ k: 'dealt', t: t }); this.publish(); this.tick(); }
    return r;
  };
  HostSession.prototype._remote = function (cid, m) {
    if (!m || typeof m !== 'object' || cid === this.me.cid) return;
    var s = this.state;
    if (m.k === 'hello') {
      var nm = cleanName(m.nm);
      if (!s) {
        var seat = this.lobby.filter(function (x) { return x.id === cid; })[0];
        if (seat) { seat.nm = nm; seat.here = true; }
        else if (this.lobby.length < MAX_SEATS) { this.lobby.push({ id: cid, nm: nm, cpu: 0, here: true }); this.onEvent({ k: 'join', nm: nm }); }
      } else {
        var p = this._personOf(cid);
        if (p >= 0) { s.P[p].here = true; if (s.P[p].sub) { s.P[p].cpu = 0; s.P[p].sub = 0; } this.onEvent({ k: 'back', nm: s.P[p].nm }); }
      }
      this.publish();
      return;
    }
    if (!s || !this.rd) return;
    var who = this._personOf(cid);
    if (who < 0 || s.P[who].cpu) return;
    if (m.g !== this.rd.g || m.r !== this.rd.r) return;               // stale or future round: ignored
    if (m.k === 'commit') {
      var a = m.a | 0;
      if (this._ownerOf(a) !== who || typeof m.h !== 'string' || !HEX64.test(m.h)) return;
      if (this._commit(a, m.h)) { this.onEvent({ k: 'commit', a: a }); this._afterChange(); }
      else this.publish();                                              // duplicates still get a fresh view back
    } else if (m.k === 'reveal') {
      var b = m.a | 0;
      if (this._ownerOf(b) !== who || typeof m.t !== 'string' || !TARGET.test(m.t) || typeof m.s !== 'string' || !SALT.test(m.s)) return;
      if (this._reveal(b, m.t, m.s)) this._afterChange();
    } else if (m.k === 'deal') {
      if (s.ph !== 'deal' || s.dealer !== who || !s.deal || m.gem !== s.deal.gem) return;
      this._deal(m.t | 0);
    }
  };
  HostSession.prototype._leave = function (cid) {
    if (!this.state) {
      var i = -1; this.lobby.forEach(function (x, k) { if (x.id === cid) i = k; });
      if (i > 0) { var nm = this.lobby[i].nm; this.lobby.splice(i, 1); this.onEvent({ k: 'left', nm: nm }); this.publish(); }
      return;
    }
    var p = this._personOf(cid);
    if (p >= 0 && this.state.P[p].here !== false) { this.state.P[p].here = false; this.onEvent({ k: 'away', nm: this.state.P[p].nm }); this.publish(); }
  };
  /* someone left: a CPU takes the seat (decides from the public view only) */
  HostSession.prototype.replaceWithCpu = function (p) {
    var s = this.state, rd = this.rd, pl = s && s.P[p];
    if (!pl || pl.cpu || pl.here !== false) return;
    pl.cpu = 2; pl.sub = 1;
    if (rd) E.actorsOf(s, p).forEach(function (a) {
      if (rd.cm[a] && !rd.rv[a]) { delete rd.cm[a]; delete rd.sec[a]; rd.lock = false; }
    });
    this.publish(); this.tick();
  };

  /* --- CPU scheduler --- */
  HostSession.prototype.clearTimers = function () { for (var k in this.timers) this.unschedule(this.timers[k]); this.timers = {}; };
  HostSession.prototype._after = function (key, ms, fn) {
    var self = this;
    if (this.timers[key]) return;
    this.timers[key] = this.schedule(function () { delete self.timers[key]; fn(); }, ms / this.speed);
  };
  HostSession.prototype.tick = function () {
    var s = this.state, rd = this.rd, self = this;
    if (!s || s.ph === 'over') { this.clearTimers(); return; }
    var gid = s.gid, rnd = s.rnd;
    var pause = this.roundPause;
    if (s.ph === 'deal') {
      if (s.P[s.dealer].cpu) this._after('deal' + gid + rnd, pause + this.think[0], function () {
        if (self.state !== s || s.ph !== 'deal') return;
        var t = E.cpuDeal(E.publicView(s), s.dealer, s.P[s.dealer].cpu, self.rng);
        self._deal(t);
      });
      return;
    }
    if (!E.activeActors(s).length) {
      // everybody is resting after a barrier: the round passes by itself
      this._after('idle' + gid + rnd, pause, function () { if (self.state === s && s.rnd === rnd && rd === self.rd) { rd.lock = true; self._tryResolve(); } });
      return;
    }
    s.P.forEach(function (pl, p) {
      if (!pl.cpu) return;
      var mine = E.actorsOf(s, p).filter(function (a) { return E.isActive(s, a) && !rd.cm[a]; });
      if (!mine.length) return;
      var wait = pause + self.think[0] + self.rng() * (self.think[1] - self.think[0]);
      self._after('cpu' + gid + rnd + ':' + p, wait, function () {
        if (self.state !== s || s.rnd !== rnd || s.ph !== 'pick' || self.rd !== rd || !s.P[p].cpu) return;
        // the CPU sees exactly what a player at the table sees: no bag order, no pending picks
        var choice = E.cpuDecide(E.publicView(s), p, s.P[p].cpu, self.rng, self.cpuOver ? self.cpuOver(p, s) : null);
        Object.keys(choice).forEach(function (a) {
          a = +a;
          if (rd.cm[a] || !E.isActive(s, a)) return;
          var salt = self.salt();
          rd.sec[a] = { t: choice[a], s: salt, h: E.commitHash(rd.g, rd.r, a, choice[a], salt) };
          self._commit(a, rd.sec[a].h);
          self.onEvent({ k: 'commit', a: a });
        });
        self._afterChange();
      });
    });
  };
  HostSession.prototype.close = function () { this.clearTimers(); if (this.tr) this.tr.close(); };

  /* ===================== client ===================== */
  function memStore() { var m = {}; return { get: function (k) { return m[k] || null; }, set: function (k, v) { m[k] = v; } }; }
  function webStore() {
    try { var t = G.sessionStorage; t.setItem('xing.t', '1'); return { get: function (k) { try { return t.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { t.setItem(k, v); } catch (e) {} } }; }
    catch (e) { return memStore(); }
  }
  function ClientSession(opt) {
    this.me = opt.me; this.tr = opt.transport; this.code = opt.code;
    this.onView = opt.onView || noop; this.onClose = opt.onClose || noop; this.onProof = opt.onProof || noop;
    this.store = opt.store || (G && G.sessionStorage ? webStore() : memStore());
    this.salt = opt.salt || function () { return randHex(16); };
    this.now = opt.now || function () { return Date.now(); };
    this.v = null; this.seen = {}; this.sentAt = {}; this.checked = {};
    var self = this;
    this.tr.on('state', function (v) { self._onState(v); });
    this.tr.on('close', function (why) { self.onClose(why); });
  }
  ClientSession.prototype.isHost = false;
  ClientSession.prototype.mySeat = function () {
    if (!this.v || !this.v.state) return -1;
    var P = this.v.state.P;
    for (var i = 0; i < P.length; i++) if (P[i].id === this.me.cid) return i;
    return -1;
  };
  ClientSession.prototype.view = function () { return this.v; };
  ClientSession.prototype._key = function (g, r, a) { return 'xing.sec.' + g + '.' + r + '.' + a; };
  ClientSession.prototype._secret = function (g, r, a) { var j = this.store.get(this._key(g, r, a)); try { return j ? JSON.parse(j) : null; } catch (e) { return null; } };
  ClientSession.prototype.myPicks = function () {
    var v = this.v, out = {}, me = this.mySeat(), self = this;
    if (!v || !v.state || !v.rd || me < 0) return out;
    E.actorsOf(v.state, me).forEach(function (a) { var sc = self._secret(v.rd.g, v.rd.r, a); if (sc) out[a] = sc.t; });
    return out;
  };
  /* lock in a pick: only its salted hash leaves this browser now */
  ClientSession.prototype.commit = function (a, t) {
    var v = this.v; if (!v || !v.state || !v.rd) return { ok: false, err: 'no game' };
    var s = v.state, rd = v.rd, me = this.mySeat();
    if (me < 0 || !s.A[a] || s.A[a].p !== me) return { ok: false, err: 'not yours' };
    if (rd.lock || rd.cm[a]) return { ok: false, err: 'closed' };
    var sc = this._secret(rd.g, rd.r, a);
    if (!sc) {
      if (!E.isLegal(s, a, t)) return { ok: false, err: 'illegal' };
      var salt = this.salt();
      sc = { t: t, s: salt, h: E.commitHash(rd.g, rd.r, a, t, salt) };
      this.store.set(this._key(rd.g, rd.r, a), JSON.stringify(sc));
    }
    this.tr.clientSend({ k: 'commit', g: rd.g, r: rd.r, a: a, h: sc.h });
    this.sentAt['c' + a] = this.now();
    return { ok: true, sent: true };
  };
  ClientSession.prototype.deal = function (t) {
    var v = this.v; if (!v || !v.state || !v.state.deal) return { ok: false };
    this.tr.clientSend({ k: 'deal', g: v.rd.g, r: v.rd.r, t: t, gem: v.state.deal.gem });
    return { ok: true, sent: true };
  };
  ClientSession.prototype._onState = function (v) {
    this.v = v;
    var self = this, s = v.state, rd = v.rd, me = this.mySeat(), now = this.now();
    if (s && rd && me >= 0 && s.ph === 'pick') {
      this.seen[rd.g + '.' + rd.r] = rd.cm;
      E.actorsOf(s, me).forEach(function (a) {
        var sc = self._secret(rd.g, rd.r, a);
        if (!sc) return;
        if (!rd.lock && !rd.cm[a] && now - (self.sentAt['c' + a] || 0) > 1500) self.commit(a, sc.t);          // resend a lost commit
        if (rd.lock && rd.cm[a] === sc.h && !rd.rvd[a] && now - (self.sentAt['r' + a + rd.r] || 0) > 1200) {
          self.sentAt['r' + a + rd.r] = now;
          self.tr.clientSend({ k: 'reveal', g: rd.g, r: rd.r, a: a, t: sc.t, s: sc.s });
        }
      });
    }
    // check the host's proof: every revealed pick must match the hash committed before anything was opened
    var pf = v.pf;
    if (pf && !this.checked[pf.g + '.' + pf.r]) {
      var ok = true, saw = this.seen[pf.g + '.' + pf.r];
      Object.keys(pf.rv).forEach(function (a) {
        var x = pf.rv[a];
        if (E.commitHash(pf.g, pf.r, +a, x.t, x.s) !== pf.cm[a]) ok = false;
        if (saw && saw[a] && saw[a] !== pf.cm[a]) ok = false;
      });
      this.checked[pf.g + '.' + pf.r] = ok ? 1 : -1;
      this.onProof(ok, pf);
    }
    this.onView(v);
  };
  ClientSession.prototype.close = function () { this.tr.close(); };

  /* ===================== PeerJS transport (GitHub Pages: no server of our own) ===================== */
  var PEER_URLS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'xing-rigoler-';
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
  function peerOpts() { var o = { debug: 0 }; if (G.XING_PEER_OPTS) Object.keys(G.XING_PEER_OPTS).forEach(function (k) { o[k] = G.XING_PEER_OPTS[k]; }); return o; }
  function PeerTransport() { this.handlers = {}; this.conns = {}; this.peer = null; this.conn = null; }
  PeerTransport.prototype.on = function (ev, fn) { this.handlers[ev] = fn; };
  PeerTransport.prototype.emit = function (ev, a, b) { var f = this.handlers[ev]; if (f) f(a, b); };
  PeerTransport.prototype.hostOpen = async function (code) {
    await loadPeerJS();
    var self = this;
    await new Promise(function (res, rej) {
      var opened = false;
      var peer = new G.Peer(PREFIX + code, peerOpts());
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
            self.emit('msg', msg.cid, { k: 'hello', cid: msg.cid, nm: cleanName(msg.nm) });
          } else if (conn._cid && self.conns[conn._cid] === conn) self.emit('msg', conn._cid, msg);
        });
        conn.on('close', function () { if (conn._cid && self.conns[conn._cid] === conn) { delete self.conns[conn._cid]; self.emit('leave', conn._cid); } });
        conn.on('error', function () {});
      });
    });
  };
  PeerTransport.prototype.hostPublish = function (view) {
    var self = this;
    Object.keys(this.conns).forEach(function (cid) {
      var c = self.conns[cid];
      if (c.open) try { c.send({ k: 'view', v: view }); } catch (e) {}
    });
  };
  PeerTransport.prototype.clientConnect = async function (code, hello) {
    await loadPeerJS();
    var self = this;
    this.hello = hello;
    await new Promise(function (res, rej) {
      var done = false;
      var peer = new G.Peer(peerOpts());
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
          conn.send({ k: 'hello', cid: hello.cid, nm: hello.nm });
          if (!done) { done = true; clearTimeout(to); res(); }
        });
        conn.on('data', function (msg) { if (msg && msg.k === 'view' && msg.v) self.emit('state', msg.v); });
        conn.on('close', function () { self.emit('close', 'host'); });
        conn.on('error', function () {});
      });
    });
  };
  PeerTransport.prototype.clientSend = function (msg) { if (this.conn && this.conn.open) try { this.conn.send(msg); } catch (e) {} };
  PeerTransport.prototype.close = function () { try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conn = null; this.conns = {}; };

  return { HostSession: HostSession, ClientSession: ClientSession, PeerTransport: PeerTransport, loadPeerJS: loadPeerJS, cleanName: cleanName, randHex: randHex, CPU_NAMES: CPU_NAMES, MAX_SEATS: MAX_SEATS, memStore: memStore };
});
