/* Authenticated HTTPS transport for two-player rooms. Uses the site's existing Firebase
   project and room permissions; no WebRTC, UDP, external script, or rule changes.
   Game state stays in the host browser. Only the existing per-player messages are relayed. */
(function (G, factory) {
  var api = factory(G);
  if (typeof module === 'object' && module.exports) module.exports = api;
  G.PLAYROOM_HTTPS = api;
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  var BASE = 'https://compile-game-online-default-rtdb.asia-southeast1.firebasedatabase.app';
  var KEY = 'AIzaSyBk3VGsRGRLhqanV1ZGUZbHoPrtM9KTypg';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', authCache = {}, authPending = {};
  var ROOM_TTL = 180000, MARK = 'geister-https-v1-';
  function token(n) {
    var a = new Uint8Array(n); G.crypto.getRandomValues(a);
    return Array.from(a, function (b) { return ALPHA[b % ALPHA.length]; }).join('');
  }
  function storage(key, value) {
    try { if (value === undefined) return JSON.parse(G.sessionStorage.getItem(key)); G.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  async function http(url, method, body, headers) {
    var ctrl = new G.AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 15000);
    try {
      var res = await G.fetch(url, { method: method || 'GET', cache: 'no-store', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: body === undefined ? undefined : JSON.stringify(body) });
      var value = await res.json();
      if (!res.ok) throw { code: 'net', detail: 'relay-' + res.status, status: res.status };
      return { value: value, etag: res.headers.get('etag') };
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'net', detail: 'timeout' };
      throw e;
    } finally { clearTimeout(timer); }
  }
  async function signUp() {
    for (var attempt = 0; attempt < 3; attempt++) {
      try { return (await http('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, 'POST', { returnSecureToken: true })).value; }
      catch (e) {
        if (attempt === 2 || !(e.detail === 'timeout' || e.name === 'TypeError' || e.status >= 500)) throw e;
        await new Promise(function (resolve) { setTimeout(resolve, 500 * (attempt + 1)); });
      }
    }
  }
  function authenticate(role) {
    var key = 'gst.https-auth.' + role;
    if (!authCache[role]) authCache[role] = storage(key);
    var saved = authCache[role];
    if (saved && saved.expiresAt > Date.now() + 60000) return Promise.resolve(saved);
    if (authPending[role]) return authPending[role];
    authPending[role] = (async function () {
      var r;
      if (saved && saved.refreshToken) {
        // Refresh the anonymous identity so guest reloads retain their room seat.
        var ctrl = new G.AbortController(), timer = setTimeout(function () { ctrl.abort(); }, 10000);
        try {
          var response = await G.fetch('https://securetoken.googleapis.com/v1/token?key=' + KEY, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken }).toString(), signal: ctrl.signal });
          r = await response.json();
          if (!response.ok) throw { code: 'net', detail: 'relay-auth' };
          r = { localId: r.user_id, idToken: r.id_token, refreshToken: r.refresh_token, expiresIn: r.expires_in };
        } finally { clearTimeout(timer); }
      } else r = await signUp();
      var auth = { uid: r.localId, idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn) * 1000 };
      authCache[role] = auth; storage(key, auth); return auth;
    })().finally(function () { delete authPending[role]; });
    return authPending[role];
  }
  function Link(role, options) {
    options = options || {}; this.prefix = options.prefix || 'GSTR'; this.mark = options.mark || MARK; this.fixedIdentity = !!options.fixedIdentity;
    this.role = role; this.h = {}; this.closed = false; this.conns = {}; this.auth = null;
    this.clientId = token(20); this.session = token(16); this.seq = 0; this.code = ''; this.meta = null;
    // Separate room owners even in one tab; the existing database rules then prevent
    // a colliding four-letter code from replacing an active room.
    this.authRole = role === 'host' ? options.authRole || 'host.' + this.clientId : 'guest';
    this.remoteSession = null; this.appCid = null; this.lastSeen = Date.now(); this.lastTouch = 0; this.seen = new Set();
    this.timer = null; this.tail = Promise.resolve(); this.started = false; this.claimed = false; this.disconnected = false;
  }
  Link.prototype.on = function (event, handler) { this.h[event] = handler; };
  Link.prototype._e = function (event, a, b) { if (!this.closed && this.h[event]) this.h[event](a, b); };
  Link.prototype._check = function () { if (this.closed) throw { code: 'net', detail: 'cancelled' }; };
  Link.prototype._url = function (suffix) { return BASE + '/rooms/' + this.prefix + this.code + (suffix || '') + '.json?auth=' + encodeURIComponent(this.auth.idToken); };
  Link.prototype._db = async function (suffix, method, body, headers) {
    this.auth = await authenticate(this.authRole);
    return http(this._url(suffix), method, body, headers);
  };
  Link.prototype.host = async function (code) {
    this.code = code; this.auth = await authenticate(this.authRole); this._check();
    var meta = { version: 4, hostUid: this.auth.uid, hostClientId: this.clientId, hostName: 'ガイスター',
      hostPeerId: this.mark + code, controlEnabled: true, createdAt: { '.sv': 'timestamp' }, expiresAt: Date.now() + ROOM_TTL };
    try { this.meta = (await this._db('/meta', 'PUT', meta)).value; }
    catch (e) { if (e.status === 412 || e.status === 401) throw { code: 'taken' }; throw e; }
    if (this.closed) { this._removeRoom(); this._check(); }
    this.started = true; this.lastTouch = Date.now(); this._schedule(0);
  };
  Link.prototype.join = async function (code) {
    this.code = code; this.auth = await authenticate('guest'); this._check();
    for (var attempt = 0; attempt < 5; attempt++) {
      var snap;
      try { snap = await this._db('/meta', 'GET', undefined, { 'X-Firebase-ETag': 'true' }); }
      catch (e) { if (e.status === 401 || e.status === 404) throw { code: 'notfound' }; throw e; }
      this._check(); var m = snap.value;
      if (!m || m.hostPeerId !== this.mark + code || m.expiresAt <= Date.now()) throw { code: 'notfound' };
      if (m.guestUid && m.guestUid !== this.auth.uid) throw { code: 'full' };
      this.clientId = m.guestUid === this.auth.uid && m.guestClientId ? m.guestClientId : this.clientId;
      if (m.guestUid === this.auth.uid && m.guestName === this.session) {
        // The previous write may have committed before its response was lost.
        this.claimed = true; this.meta = m; break;
      }
      if (!snap.etag) throw { code: 'net', detail: 'relay-etag' };
      var claim = { guestUid: this.auth.uid, guestClientId: this.clientId, guestName: this.session };
      try {
        this.meta = (await this._db('/meta', 'PUT', Object.assign({}, m, claim), { 'if-match': snap.etag })).value;
        this.claimed = true; break;
      } catch (e) {
        // A host heartbeat changes the ETag too: it is not a full room.
        if (attempt === 4 || !(e.status === 412 || e.status === 401 || e.detail === 'timeout')) throw e;
      }
    }
    if (this.closed) { this._queue({ _https: 'leave' }); this._check(); }
    this._check(); this.started = true; this.lastSeen = this.lastTouch = Date.now(); this._schedule(0);
  };
  Link.prototype._schedule = function (ms) {
    var self = this; clearTimeout(this.timer);
    if (!this.closed) this.timer = setTimeout(function () { self._poll(); }, ms);
  };
  Link.prototype._poll = async function () {
    if (this.closed) return;
    try {
      // Empty tournament reception rooms need only a slow presence check.
      if (this.role === 'host' && !this.meta.guestUid) {
        this.meta = (await this._db('/meta')).value; this._check();
        if (!this.meta.guestUid) {
          if (Date.now() - this.lastTouch > 10000) {
            await this._db('/meta', 'PATCH', { expiresAt: Date.now() + ROOM_TTL });
            this.lastTouch = Date.now();
          }
          this._schedule(2500); return;
        }
      }
      var result = (await this._db('/messages')).value || {}; this._check();
      var self = this, records = Object.keys(result).map(function (id) {
        var row = result[id]; if (!row || row.fromClient === self.clientId) return null;
        try { return { id: id, row: row, p: JSON.parse(row.payload) }; } catch (e) { return null; }
      }).filter(Boolean).sort(function (a, b) { return a.p.session === b.p.session ? a.p.seq - b.p.seq : (a.row.createdAt || 0) - (b.row.createdAt || 0); });
      for (var record of records) {
        var packet = record.p;
        if (!packet || packet.transport !== 1 || typeof packet.session !== 'string' || !Number.isInteger(packet.seq) || !packet.data || typeof packet.data !== 'object') continue;
        var allowed = this.meta && (this.role === 'host' ? record.row.fromUid === this.meta.guestUid && record.row.fromClient === this.meta.guestClientId && packet.session === this.meta.guestName : record.row.fromUid === this.meta.hostUid && record.row.fromClient === this.meta.hostClientId);
        // Refresh metadata when the guest has just claimed the room.
        if (!allowed && this.role === 'host') { this.meta = (await this._db('/meta')).value; this._check(); allowed = this.meta && record.row.fromUid === this.meta.guestUid && record.row.fromClient === this.meta.guestClientId && packet.session === this.meta.guestName; }
        if (!allowed) { if (this.role === 'host') await this._db('/messages/' + record.id, 'DELETE'); continue; }
        if (packet.targetSession && packet.targetSession !== this.session) {
          await this._db('/messages/' + record.id, 'DELETE'); continue;
        }
        if (this.role === 'host' && packet.data.k === 'hello') this.remoteSession = packet.session;
        this.lastSeen = Date.now(); this.disconnected = false;
        if (!this.seen.has(record.id)) {
          this.seen.add(record.id);
          if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value);
          this._receive(packet.data);
        }
        // Acknowledge only after delivery; failed deletes are safe to retry without replaying moves.
        await this._db('/messages/' + record.id, 'DELETE');
      }
      if (Date.now() - this.lastTouch > 10000) {
        this.lastTouch = Date.now();
        if (this.role === 'host') {
          await this._db('/meta', 'PATCH', { expiresAt: Date.now() + ROOM_TTL }); this._check();
          // PATCH returns only changed fields, so obtain the complete participant metadata.
          this.meta = (await this._db('/meta')).value; this._check();
        }
        if (this.role === 'guest' || (this.meta && this.meta.guestUid)) this._queue({ _https: 'ping' });
      }
      this._checkSilence();
      this._schedule(450);
    } catch (e) {
      if (this.closed) return;
      this._checkSilence();
      this._schedule(1500);
    }
  };
  // A healthy database connection does not imply that the other browser is still open.
  Link.prototype._checkSilence = function () {
    if (this.closed || this.disconnected || Date.now() - this.lastSeen <= 45000) return;
    this.disconnected = true;
    if (this.role === 'guest') this._e('close');
    else if (this.appCid) { var cid = this.appCid; this.appCid = null; delete this.conns[cid]; this._e('leave', cid); }
  };
  Link.prototype._releaseSeat = async function () {
    var previous = this.meta;
    for (var attempt = 0; attempt < 3; attempt++) {
      var snap = await this._db('/meta', 'GET', undefined, { 'X-Firebase-ETag': 'true' });
      var meta = snap.value;
      if (!meta || !previous || meta.guestUid !== previous.guestUid || meta.guestClientId !== previous.guestClientId || meta.guestName !== previous.guestName) return;
      delete meta.guestUid; delete meta.guestClientId; delete meta.guestName;
      try { await this._db('/meta', 'PUT', meta, { 'if-match': snap.etag }); this.meta = meta; return; }
      catch (e) { if (e.status !== 412 || attempt === 2) throw e; }
    }
  };
  Link.prototype._receive = function (m) {
    if (m._https === 'ping') { this._queue({ _https: 'pong' }); return; }
    if (m._https === 'pong') return;
    if (m._https === 'leave') {
      if (this.role === 'guest') this._e('close');
      else {
        var cid = this.appCid; this.appCid = null; this.conns = {};
        this._releaseSeat().catch(function () {});
        if (cid) this._e('leave', cid);
      }
      return;
    }
    if (this.role === 'host') {
      if (this.fixedIdentity && m.k === 'hello') m = Object.assign({}, m, { cid: this.meta.guestClientId });
      if (m.k === 'hello' && /^[A-Za-z0-9]{6,32}$/.test(m.cid || '')) { this.appCid = m.cid; this.conns = {}; this.conns[m.cid] = true; }
      if (this.appCid) this._e('msg', this.appCid, m);
    } else this._e('msg', m);
  };
  Link.prototype._queue = function (m) {
    var self = this;
    var id = '-' + token(19), packet = { transport: 1, session: this.session, seq: ++this.seq, data: m };
    if (this.role === 'host' && this.remoteSession) packet.targetSession = this.remoteSession;
    var row = { fromUid: this.auth.uid, fromClient: this.clientId, createdAt: { '.sv': 'timestamp' }, payload: JSON.stringify(packet) };
    this.tail = this.tail.catch(function () {}).then(async function () {
      for (var attempt = 0; attempt < 4; attempt++) {
        try { await self._db('/messages/' + id, 'PUT', row); return; }
        catch (e) { if (attempt === 3) throw e; await new Promise(function (r) { setTimeout(r, 500 * (attempt + 1)); }); }
      }
    });
    this.tail.catch(function () { if (!self.closed) { self.lastSeen = 0; self._checkSilence(); } });
  };
  Link.prototype.send = function (cid, m) {
    if (this.closed || !this.started) return;
    if (this.role === 'guest') this._queue(cid);
    else if (this.conns[cid]) this._queue(m);
  };
  Link.prototype.broadcast = function (m) { if (!this.closed && this.started && this.appCid) this._queue(m); };
  Link.prototype.drop = function (cid) { if (this.conns[cid]) { this._queue({ _https: 'leave' }); delete this.conns[cid]; this.appCid = null; var self = this; this.tail.then(function () { return self._releaseSeat(); }).catch(function () {}); } };
  Link.prototype._removeRoom = function () { if (this.auth && this.code) this._db('', 'DELETE').catch(function () {}); };
  Link.prototype.close = function () {
    if (this.closed) return;
    if (this.started || this.claimed) this._queue({ _https: 'leave' });
    this.closed = true; clearTimeout(this.timer); this.conns = {};
    if (this.role === 'host' && this.started) { var self = this; this.tail.finally(function () { self._removeRoom(); }).catch(function () {}); }
  };
  // Existing server permissions are for two participants per room. A tournament
  // uses a separate private room per guest, just like the collection's cup mode.
  // Views go only to their recipient; there is no shared, readable game-state node.
  var HUB_SLOTS = 11;
  function slotOptions(index, authRole) { return { prefix: 'GT' + ALPHA[index] + 'R', mark: 'geister-tournament-https-v1-' + index + '-', authRole: authRole, fixedIdentity: true }; }
  function HubHost() { this.h = {}; this.closed = false; this.links = []; this.byCid = {}; this.authRole = 'tournament.' + token(20); }
  HubHost.prototype.on = Link.prototype.on;
  HubHost.prototype._e = Link.prototype._e;
  HubHost.prototype.host = async function (code) {
    var self = this;
    if (this.closed) throw { code: 'net', detail: 'cancelled' };
    this.links = Array.from({ length: HUB_SLOTS }, function (_, index) {
      var link = new Link('host', slotOptions(index, self.authRole));
      link.on('msg', function (cid, message) {
        if (!self.byCid[cid]) { self.byCid[cid] = link; self._e('join', cid); }
        if (self.byCid[cid] === link) self._e('msg', cid, message);
      });
      link.on('leave', function (cid) { if (self.byCid[cid] === link) { delete self.byCid[cid]; self._e('leave', cid); } });
      return link;
    });
    var results = await Promise.allSettled(this.links.map(function (link) { return link.host(code); }));
    var failed = results.find(function (result) { return result.status === 'rejected'; });
    if (failed || this.closed) { this.close(); throw failed ? failed.reason : { code: 'net', detail: 'cancelled' }; }
  };
  HubHost.prototype.send = function (cid, m) { if (this.byCid[cid]) this.byCid[cid].send(cid, m); };
  HubHost.prototype.broadcast = function (m) { var self = this; Object.keys(this.byCid).forEach(function (cid) { self.send(cid, m); }); };
  HubHost.prototype.kick = function (cid) { if (this.byCid[cid]) { this.byCid[cid].drop(cid); delete this.byCid[cid]; } };
  HubHost.prototype.close = function () { this.closed = true; this.links.forEach(function (link) { link.close(); }); this.byCid = {}; };
  function HubGuest() { this.h = {}; this.closed = false; this.link = null; this.peer = null; }
  HubGuest.prototype.on = Link.prototype.on;
  HubGuest.prototype._e = Link.prototype._e;
  HubGuest.prototype._join = async function (code) {
    var self = this, last = { code: 'full' };
    for (var index = 0; index < HUB_SLOTS; index++) {
      if (this.closed) throw { code: 'net', detail: 'cancelled' };
      var link = this.link = new Link('guest', slotOptions(index));
      try {
        await link.join(code);
        if (this.closed) { link.close(); throw { code: 'net', detail: 'cancelled' }; }
        this.peer = { id: link.clientId };
        link.on('msg', function (m) { self._e('msg', m); });
        link.on('close', function () { self._e('close'); });
        return;
      } catch (e) {
        link.close(); last = e;
        if (e.code !== 'full') throw e;
      }
    }
    throw last;
  };
  HubGuest.prototype.join = function (code) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(error) {
        if (done) return;
        done = true; clearTimeout(timer); self._cancelJoin = null;
        if (error) reject(error); else resolve();
      }
      var timer = setTimeout(function () { finish({ code: 'net', detail: 'timeout' }); self.close(); }, 60000);
      self._cancelJoin = function () { finish({ code: 'net', detail: 'cancelled' }); };
      self._join(code).then(function () { finish(); }, finish);
    });
  };
  HubGuest.prototype.send = function (m) {
    if (!this.closed && this.link) this.link.send(m.k === 'hello' ? Object.assign({}, m, { cid: this.link.clientId }) : m);
  };
  HubGuest.prototype.close = function () { this.closed = true; if (this._cancelJoin) this._cancelJoin(); if (this.link) this.link.close(); };
  return { makeHost: function (options) { return new Link('host', options); }, makeGuest: function (options) { return new Link('guest', options); },
    makeHubHost: function () { return new HubHost(); }, makeHubGuest: function () { return new HubGuest(); } };
});
