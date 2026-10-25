/* ガイスター — online play for two. GitHub Pages has no server of its own, so the host's browser owns
   the game and every guest connects to it through the public PeerJS server with a 4-letter room code.
   LocalHost / LocalGuest (BroadcastChannel) are the same API between tabs of one browser, used by the test script
   (?net=local).

   Host link:   host(code) → Promise;  on('msg', cid, m)  on('leave', cid);  send(cid, m)  broadcast(m)  drop(cid)  close()
   Guest link:  join(code) → Promise;  on('msg', m)       on('close');       send(m)                        close()
   A guest's first message must be { k: 'hello', cid, ... }: the host link files the connection under that cid,
   and a newer connection with the same cid (a reload, a dropped line) replaces the old one. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GST_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';

  var PEER_URLS = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'geister-rkkrk-';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var PROTOCOL = 1;
  var CID = /^[A-Za-z0-9]{6,32}$/;

  var BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(function (r) { return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g');
  function cleanName(s) { s = String(s || '').replace(BAD_CHARS, '').trim(); return s.slice(0, 10); }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01]/g, '').slice(0, 4); }
  function randomChars(k) {
    var out = '', a = new Uint8Array(k), c = G && G.crypto;
    if (c && c.getRandomValues) c.getRandomValues(a); else for (var j = 0; j < k; j++) a[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < k; i++) out += ALPHA[a[i] % ALPHA.length];
    return out;
  }
  function makeCode() { return randomChars(4); }
  function makeCid() { return randomChars(12); }

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

  /* ------------------------------------------------------------------ PeerJS host */
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
          conn.on('data', function (m) {
            if (!m || typeof m !== 'object') return;
            if (m.k === 'hello' && typeof m.cid === 'string' && CID.test(m.cid)) {
              var old = self.conns[m.cid];
              if (old && old !== conn) { old._replaced = true; try { old.close(); } catch (x) {} }
              conn._cid = m.cid; self.conns[m.cid] = conn;
            }
            if (conn._cid && self.conns[conn._cid] === conn) self._e('msg', conn._cid, m);
          });
          conn.on('close', function () { if (conn._cid && self.conns[conn._cid] === conn) { delete self.conns[conn._cid]; self._e('leave', conn._cid); } });
          conn.on('error', function () {});
        });
      });
    });
  };
  PeerHost.prototype.send = function (cid, m) { var c = this.conns[cid]; if (c && c.open) try { c.send(m); } catch (e) {} };
  PeerHost.prototype.broadcast = function (m) { var self = this; Object.keys(this.conns).forEach(function (cid) { self.send(cid, m); }); };
  PeerHost.prototype.drop = function (cid) { var c = this.conns[cid]; if (!c) return; delete this.conns[cid]; setTimeout(function () { try { c.close(); } catch (e) {} }, 400); };
  PeerHost.prototype.close = function () { this.closed = true; try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conns = {}; };

  /* ------------------------------------------------------------------ PeerJS guest */
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

  /* ------------------------------------------------------------------ the same over BroadcastChannel (tests) */
  function LocalHost() { Emitter.call(this); this.bc = null; this.byLink = {}; this.conns = {}; }
  LocalHost.prototype = Object.create(Emitter.prototype);
  LocalHost.prototype.host = function (code) {
    var self = this;
    this.bc = new G.BroadcastChannel('geister-test-' + code);
    this.bc.onmessage = function (e) {
      var d = e.data;
      if (!d || d.to !== 'host') return;
      if (d.k === '_knock') { self.bc.postMessage({ k: '_open', to: d.from }); return; }
      if (d.k === '_bye') { var cid0 = self.byLink[d.from]; delete self.byLink[d.from]; if (cid0 && self.conns[cid0] === d.from) { delete self.conns[cid0]; self._e('leave', cid0); } return; }
      if (d.k !== '_m' || !d.m || typeof d.m !== 'object') return;
      var m = d.m;
      if (m.k === 'hello' && typeof m.cid === 'string' && CID.test(m.cid)) {
        var old = self.conns[m.cid];
        if (old && old !== d.from) { delete self.byLink[old]; self.bc.postMessage({ k: '_bye', to: old }); }
        self.conns[m.cid] = d.from; self.byLink[d.from] = m.cid;
      }
      var cid = self.byLink[d.from];
      if (cid && self.conns[cid] === d.from) self._e('msg', cid, m);
    };
    return Promise.resolve();
  };
  LocalHost.prototype.send = function (cid, m) { var to = this.conns[cid]; if (this.bc && to) this.bc.postMessage({ k: '_m', to: to, m: m }); };
  LocalHost.prototype.broadcast = function (m) { var self = this; Object.keys(this.conns).forEach(function (cid) { self.send(cid, m); }); };
  LocalHost.prototype.drop = function (cid) { var to = this.conns[cid]; if (!to) return; delete this.conns[cid]; delete this.byLink[to]; var bc = this.bc; setTimeout(function () { try { bc.postMessage({ k: '_bye', to: to }); } catch (e) {} }, 400); };
  LocalHost.prototype.close = function () {
    var self = this;
    if (this.bc) { try { Object.keys(this.conns).forEach(function (cid) { self.bc.postMessage({ k: '_bye', to: self.conns[cid] }); }); this.bc.close(); } catch (e) {} }
    this.closed = true; this.bc = null; this.conns = {}; this.byLink = {};
  };
  function LocalGuest() { Emitter.call(this); this.bc = null; this.id = randomChars(10); }
  LocalGuest.prototype = Object.create(Emitter.prototype);
  LocalGuest.prototype.join = function (code) {
    var self = this;
    this.bc = new G.BroadcastChannel('geister-test-' + code);
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { rej({ code: 'notfound' }); }, 3000), open = false;
      self.bc.onmessage = function (e) {
        var d = e.data;
        if (!d || d.to !== self.id) return;
        if (d.k === '_open' && !open) { open = true; clearTimeout(to); res(); }
        else if (d.k === '_bye') self._e('close');
        else if (d.k === '_m') self._e('msg', d.m);
      };
      self.bc.postMessage({ k: '_knock', from: self.id, to: 'host' });
    });
  };
  LocalGuest.prototype.send = function (m) { if (this.bc) this.bc.postMessage({ k: '_m', from: this.id, to: 'host', m: m }); };
  LocalGuest.prototype.close = function () {
    if (this.bc) { try { this.bc.postMessage({ k: '_bye', from: this.id, to: 'host' }); this.bc.close(); } catch (e) {} }
    this.closed = true; this.bc = null;
  };

  function makeHost(kind) { return kind === 'local' ? new LocalHost() : new PeerHost(); }
  function makeGuest(kind) { return kind === 'local' ? new LocalGuest() : new PeerGuest(); }

  return { PROTOCOL: PROTOCOL, makeHost: makeHost, makeGuest: makeGuest, makeCode: makeCode, makeCid: makeCid, cleanCode: cleanCode, cleanName: cleanName, loadPeerJS: loadPeerJS };
});
