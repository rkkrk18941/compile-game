/* Tower co-op — online transport for two. GitHub Pages has no server of its own, so the host's browser owns the game
   and the guest connects through the public PeerJS server with a 4-letter room code.
   LocalLink (BroadcastChannel) is the same API between tabs of one browser, used by the test script (?net=local). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IBARA_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';

  var PEER_URLS = ['vendor/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'ibara-coop-rkkrk-';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var PROTOCOL = 1;   // 2: flags are claimed by declaring them; 3: one declaration at the start of the turn, complete flags settle at once

  var BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(function (r) { return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]); }).join('') + ']', 'g');
  function cleanName(s) { s = String(s || '').replace(BAD_CHARS, '').trim(); return s.slice(0, 10); }
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
        var timer = setTimeout(function(){ sc.onload = sc.onerror = null; sc.remove(); next(); }, 8000);
        sc.onload = function () { clearTimeout(timer); if (G.Peer) res(); else next(); };
        sc.onerror = function () { clearTimeout(timer); sc.remove(); next(); };
        G.document.head.appendChild(sc);
      })();
    });
    return peerLoad;
  }

  /* Link API (both kinds):
       on('peer')        host: a guest's data channel opened
       on('msg', m)      a message object arrived
       on('close')       the other side went away
       host(code) / join(code) → Promise,  send(m),  close()                                        */
  function PeerLink() { this.h = {}; this.peer = null; this.conn = null; this.closed = false; }
  PeerLink.prototype.on = function (e, f) { this.h[e] = f; };
  PeerLink.prototype._e = function (e, a) { var f = this.h[e]; if (f && !this.closed) f(a); };
  PeerLink.prototype._bind = function (conn) {
    var self = this;
    this.conn = conn;
    conn.on('open', function () { if (self.conn === conn) self._e('peer'); });
    conn.on('data', function (m) { if (self.conn === conn && m && typeof m === 'object') self._e('msg', m); });
    conn.on('close', function () { if (self.conn === conn) { self.conn = null; self._e('close'); } });
    conn.on('error', function (err) { console.warn('Tower co-op data channel:', err && (err.type || err.message)); if (self.conn === conn) { self.conn = null; self._e('close'); } });
  };
  PeerLink.prototype.host = function (code) {
    var self = this;
    return loadPeerJS().then(function () {
      return new Promise(function (res, rej) {
        var opened = false, peer = new G.Peer(PREFIX + code, { debug: 0 });
        var timeout = setTimeout(function () { if (!opened) { peer.destroy(); rej({code:'net'}); } }, 15000);
        self.peer = peer;
        peer.on('open', function () { opened = true; clearTimeout(timeout); res(); });
        peer.on('error', function (e) {
          var t = e && e.type; console.warn('Tower co-op signaling:', t);
          if (!opened) { clearTimeout(timeout); try { peer.destroy(); } catch (x) {} rej({ code: t === 'unavailable-id' ? 'taken' : 'net', detail: t }); }
        });
        peer.on('disconnected', function () { try { if (!peer.destroyed) peer.reconnect(); } catch (x) {} });
        peer.on('connection', function (conn) {
          if (self.conn) {   // two players only
            conn.on('open', function () { try { conn.send({ v:1,k:'error',text:'この部屋は満員です。' }); } catch (x) {} setTimeout(function () { try { conn.close(); } catch (x) {} }, 500); });
            return;
          }
          self._bind(conn);
        });
      });
    });
  };
  PeerLink.prototype.join = function (code) {
    var self = this;
    return loadPeerJS().then(function () {
      return new Promise(function (res, rej) {
        var done = false, peer = new G.Peer({ debug: 0 });
        self.peer = peer;
        var to = setTimeout(function () { if (!done) { done = true; peer.destroy(); rej({ code: 'notfound' }); } }, 15000);
        peer.on('error', function (e) {
          var t = e && e.type; console.warn('Tower co-op signaling:', t);
          if (!done) { done = true; clearTimeout(to); peer.destroy(); rej({ code: t === 'peer-unavailable' ? 'notfound' : 'net', detail: t }); }
          else if (t === 'peer-unavailable') self._e('close');
        });
        peer.on('open', function () {
          var conn = peer.connect(PREFIX + code, { reliable: true });
          self.conn = conn;
          conn.on('open', function () { if (!done) { done = true; clearTimeout(to); res(); } });
          conn.on('data', function (m) { if (m && typeof m === 'object') self._e('msg', m); });
          conn.on('close', function () { self._e('close'); });
          conn.on('error', function (err) { console.warn('Tower co-op data channel:', err && (err.type || err.message)); if (self.conn === conn) { self.conn = null; self._e('close'); } });
        });
      });
    });
  };
  PeerLink.prototype.send = function (m) { if (this.conn && this.conn.open) try { this.conn.send(m); } catch (e) {} };
  PeerLink.prototype.close = function () { this.closed = true; try { if (this.peer) this.peer.destroy(); } catch (e) {} this.peer = null; this.conn = null; };

  function LocalLink() { this.h = {}; this.bc = null; this.id = makeCode() + makeCode(); this.other = null; this.closed = false; }
  LocalLink.prototype.on = PeerLink.prototype.on;
  LocalLink.prototype._e = PeerLink.prototype._e;
  LocalLink.prototype._open = function (code) {
    var self = this;
    this.bc = new G.BroadcastChannel('ibara-coop-test-' + code);
    this.bc.onmessage = function (e) {
      var m = e.data;
      if (!m || (m.to && m.to !== self.id) || m.from === self.id) return;
      if (m.k === '_hello' && self.role === 'host') {
        if (self.other && self.other !== m.from) { self.bc.postMessage({ k: '_m', from: self.id, to: m.from, m: { v:1,k:'error',text:'この部屋は満員です。' } }); return; }
        self.other = m.from; self.bc.postMessage({ k: '_ack', from: self.id, to: m.from }); self._e('peer');
      } else if (m.k === '_ack' && self.role === 'guest' && self._ack) { self.other = m.from; self._ack(); self._ack = null; }
      else if (m.k === '_bye' && m.from === self.other) { self.other = null; self._e('close'); }
      else if (m.k === '_m' && (m.from === self.other || !self.other)) self._e('msg', m.m);
    };
  };
  LocalLink.prototype.host = function (code) { this.role = 'host'; this._open(code); return Promise.resolve(); };
  LocalLink.prototype.join = function (code) {
    var self = this;
    this.role = 'guest'; this._open(code);
    return new Promise(function (res, rej) {
      var to = setTimeout(function () { self._ack = null; rej({ code: 'notfound' }); }, 3000);
      self._ack = function () { clearTimeout(to); res(); };
      self.bc.postMessage({ k: '_hello', from: self.id });
    });
  };
  LocalLink.prototype.send = function (m) { if (this.bc && this.other) this.bc.postMessage({ k: '_m', from: this.id, to: this.other, m: m }); };
  LocalLink.prototype.close = function () {
    if (this.bc) { try { if (this.other) this.bc.postMessage({ k: '_bye', from: this.id, to: this.other }); this.bc.close(); } catch (e) {} }
    this.closed = true; this.bc = null; this.other = null;
  };

  function makeLink(kind) { return kind === 'local' ? new LocalLink() : new PeerLink(); }

  return { PROTOCOL: PROTOCOL, makeLink: makeLink, makeCode: makeCode, cleanCode: cleanCode, cleanName: cleanName, loadPeerJS: loadPeerJS, PeerLink: PeerLink, LocalLink: LocalLink };
});
