/* ハタトリ・ナイン — online rooms. GitHub Pages has no server of its own, so the host's browser runs the room and
   everyone else connects to it through the public PeerJS server with a 4-letter code. A room holds any number of
   people: two of them play, everyone else watches (or plays later in a league or a cup).
   LocalHub (BroadcastChannel) offers the same API between tabs of one browser, for tests (?net=local).

   Host API:  host(code) → Promise; on('join', cid) on('msg', cid, m) on('leave', cid); send(cid, m); broadcast(m); close()
   Guest API: join(code) → Promise; on('msg', m) on('close'); send(m); close()                                    */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GST_TOUR_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';

  var PEER_URLS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'geister-arena-v2-';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var PROTOCOL = 2;
  var MAX_PEOPLE = 24;

  var BAD = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(function (r) { return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g');
  function cleanName(s) { return String(s || '').replace(BAD, '').trim().slice(0, 10); }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01]/g, '').slice(0, 4); }
  function makeCode() {
    var out = '', a = new Uint8Array(4), c = G && G.crypto;
    if (c && c.getRandomValues) c.getRandomValues(a); else for (var j = 0; j < 4; j++) a[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < 4; i++) out += ALPHA[a[i] % ALPHA.length];
    return out;
  }
  var peerLoad = null;
  function loadPeerJS() {
    if (G.Peer) return Promise.resolve();
    if (peerLoad) return peerLoad;
    peerLoad = new Promise(function (res, rej) {
      var i = 0;
      (function next() {
        if (i >= PEER_URLS.length) { peerLoad = null; rej({ code: 'lib' }); return; }
        var sc = G.document.createElement('script'); sc.src = PEER_URLS[i++]; sc.async = true;
        sc.onload = function () { if (G.Peer) res(); else next(); };
        sc.onerror = function () { sc.remove(); next(); };
        G.document.head.appendChild(sc);
      })();
    });
    return peerLoad;
  }
  function Emitter() { this.h = {}; this.closed = false; }
  Emitter.prototype.on = function (e, f) { this.h[e] = f; };
  Emitter.prototype._e = function (e, a, b) { var f = this.h[e]; if (f && !this.closed) f(a, b); };

  /* ---------------------------------------------------------------- PeerJS */
  function PeerHost() { Emitter.call(this); this.peer = null; this.conns = {}; }
  PeerHost.prototype = Object.create(Emitter.prototype);
  PeerHost.prototype.host = function (code) {
    var self = this;
    return loadPeerJS().then(function () {
      return new Promise(function (res, rej) {
        var opened = false, peer = new G.Peer(PREFIX + code, { debug: 0 });
        self.peer = peer;
        peer.on('open', function () { opened = true; res(); });
        peer.on('error', function (e) {
          var t = e && e.type;
          if (!opened) { try { peer.destroy(); } catch (x) {} rej({ code: t === 'unavailable-id' ? 'taken' : 'net', detail: t }); }
        });
        peer.on('disconnected', function () { try { if (!peer.destroyed) peer.reconnect(); } catch (x) {} });
        peer.on('connection', function (conn) {
          var cid = conn.peer;
          conn.on('open', function () {
            if (Object.keys(self.conns).length >= MAX_PEOPLE) { try { conn.send({ k: 'full' }); } catch (x) {} setTimeout(function () { try { conn.close(); } catch (x) {} }, 500); return; }
            self.conns[cid] = conn;
            self._e('join', cid);
          });
          conn.on('data', function (m) { if (self.conns[cid] === conn && m && typeof m === 'object') self._e('msg', cid, m); });
          conn.on('close', function () { if (self.conns[cid] === conn) { delete self.conns[cid]; self._e('leave', cid); } });
          conn.on('error', function () {});
        });
      });
    });
  };
  PeerHost.prototype.send = function (cid, m) { var c = this.conns[cid]; if (c && c.open) try { c.send(m); } catch (e) {} };
  PeerHost.prototype.broadcast = function (m) { for (var k in this.conns) this.send(k, m); };
  PeerHost.prototype.kick = function (cid) { var c = this.conns[cid]; if (c) { delete this.conns[cid]; try { c.close(); } catch (e) {} } };
  PeerHost.prototype.close = function () { this.closed = true; try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conns = {}; };

  function PeerGuest() { Emitter.call(this); this.peer = null; this.conn = null; }
  PeerGuest.prototype = Object.create(Emitter.prototype);
  PeerGuest.prototype.join = function (code) {
    var self = this;
    return loadPeerJS().then(function () {
      return new Promise(function (res, rej) {
        var done = false, peer = new G.Peer({ debug: 0 });
        self.peer = peer;
        var to = setTimeout(function () { if (!done) { done = true; rej({ code: 'notfound' }); } }, 15000);
        peer.on('error', function (e) {
          var t = e && e.type;
          if (!done) { done = true; clearTimeout(to); rej({ code: t === 'peer-unavailable' ? 'notfound' : 'net', detail: t }); }
          else if (t === 'peer-unavailable') self._e('close');
        });
        peer.on('open', function () {
          var conn = peer.connect(PREFIX + code, { reliable: true });
          self.conn = conn;
          conn.on('open', function () { if (!done) { done = true; clearTimeout(to); res(); } });
          conn.on('data', function (m) { if (m && typeof m === 'object') self._e('msg', m); });
          conn.on('close', function () { self._e('close'); });
          conn.on('error', function () {});
        });
      });
    });
  };
  PeerGuest.prototype.send = function (m) { if (this.conn && this.conn.open) try { this.conn.send(m); } catch (e) {} };
  PeerGuest.prototype.close = function () { this.closed = true; try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conn = null; };

  /* ---------------------------------------------------------------- BroadcastChannel (tests) */
  function rid() { return makeCode() + makeCode(); }
  function LocalHost() { Emitter.call(this); this.bc = null; this.id = rid(); this.members = {}; }
  LocalHost.prototype = Object.create(Emitter.prototype);
  LocalHost.prototype.host = function (code) {
    var self = this;
    this.bc = new G.BroadcastChannel('geister-arena-test-' + code);
    this.bc.onmessage = function (e) {
      var m = e.data;
      if (!m || m.to !== self.id) return;
      if (m.k === '_hello') { self.members[m.from] = true; self.bc.postMessage({ k: '_ack', from: self.id, to: m.from }); self._e('join', m.from); }
      else if (m.k === '_bye' && self.members[m.from]) { delete self.members[m.from]; self._e('leave', m.from); }
      else if (m.k === '_m' && self.members[m.from]) self._e('msg', m.from, m.m);
    };
    this.bc.postMessage({ k: '_hostHere', from: this.id });
    this._ann = setInterval(function () { if (self.bc) self.bc.postMessage({ k: '_hostHere', from: self.id }); }, 400);
    return Promise.resolve();
  };
  LocalHost.prototype.send = function (cid, m) { if (this.bc && this.members[cid]) this.bc.postMessage({ k: '_m', from: this.id, to: cid, m: m }); };
  LocalHost.prototype.broadcast = function (m) { for (var k in this.members) this.send(k, m); };
  LocalHost.prototype.kick = function (cid) { delete this.members[cid]; };
  LocalHost.prototype.close = function () { clearInterval(this._ann); if (this.bc) { var self = this; Object.keys(this.members).forEach(function (k) { self.bc.postMessage({ k: '_bye', from: self.id, to: k }); }); this.bc.close(); } this.closed = true; this.bc = null; };

  function LocalGuest() { Emitter.call(this); this.bc = null; this.id = rid(); this.host = null; }
  LocalGuest.prototype = Object.create(Emitter.prototype);
  LocalGuest.prototype.join = function (code) {
    var self = this;
    this.bc = new G.BroadcastChannel('geister-arena-test-' + code);
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej({ code: 'notfound' }); }, 3000), acked = false;
      self.bc.onmessage = function (e) {
        var m = e.data;
        if (!m) return;
        if (m.k === '_hostHere' && !self.host) { self.host = m.from; self.bc.postMessage({ k: '_hello', from: self.id, to: m.from }); }
        else if (m.k === '_ack' && m.to === self.id && !acked) { acked = true; clearTimeout(to); res(); }
        else if (m.k === '_bye' && m.to === self.id) self._e('close');
        else if (m.k === '_m' && m.to === self.id) self._e('msg', m.m);
      };
    });
  };
  LocalGuest.prototype.send = function (m) { if (this.bc && this.host) this.bc.postMessage({ k: '_m', from: this.id, to: this.host, m: m }); };
  LocalGuest.prototype.close = function () { if (this.bc) { if (this.host) this.bc.postMessage({ k: '_bye', from: this.id, to: this.host }); this.bc.close(); } this.closed = true; this.bc = null; };

  function makeHost(kind) { return kind === 'local' ? new LocalHost() : new PeerHost(); }
  function makeGuest(kind) { return kind === 'local' ? new LocalGuest() : new PeerGuest(); }

  return { PROTOCOL: PROTOCOL, makeHost: makeHost, makeGuest: makeGuest, makeCode: makeCode, cleanCode: cleanCode, cleanName: cleanName, loadPeerJS: loadPeerJS };
});
