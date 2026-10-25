/* Tower co-op — online transport for up to six. GitHub Pages has no server of its own, so the host's browser owns the game
   and the guest connects through the public PeerJS server with a 4-letter room code.
   LocalLink (BroadcastChannel) is the same API between tabs of one browser, used by the test script (?net=local). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IBARA_NET = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';

  var PEER_URLS = ['vendor/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
  var PREFIX = 'ibara-bg3-rkkrk-';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var PROTOCOL = 3;

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

  // Host receives (message, connectionId); send(message, connectionId) targets a guest.
  // Without a target the host broadcasts. The room layer decides who may join.
  function PeerLink(){this.h={};this.peer=null;this.conn=null;this.conns={};this.serial=0;this.closed=false;this.role=null;}
  PeerLink.prototype.on=function(e,f){this.h[e]=f;};
  PeerLink.prototype._e=function(e,a,b){var f=this.h[e];if(f&&!this.closed)f(a,b);};
  PeerLink.prototype._bind=function(conn,cid){
    var self=this;this.conns[cid]=conn;
    var timeout=setTimeout(function(){if(!conn.open)self.drop(cid);},20000);
    conn.on('open',function(){clearTimeout(timeout);if(self.conns[cid]===conn)self._e('peer',cid);});
    conn.on('data',function(m){if(self.conns[cid]===conn&&m&&typeof m==='object')self._e('msg',m,cid);});
    function gone(){clearTimeout(timeout);if(self.conns[cid]===conn){delete self.conns[cid];self._e('close',cid);}}
    conn.on('close',gone);conn.on('error',gone);
  };
  PeerLink.prototype.host=function(code){var self=this;this.role='host';return loadPeerJS().then(function(){return new Promise(function(res,rej){
    var opened=false,peer=self.peer=new G.Peer(PREFIX+code,{debug:0});
    var timer=setTimeout(function(){if(!opened){peer.destroy();rej({code:'net'});}},20000);
    peer.on('open',function(){opened=true;clearTimeout(timer);res();});
    peer.on('error',function(e){if(!opened){clearTimeout(timer);peer.destroy();rej({code:e&&e.type==='unavailable-id'?'taken':'net'});}});
    peer.on('disconnected',function(){try{if(!peer.destroyed)peer.reconnect();}catch(e){}});
    peer.on('connection',function(c){
      if(Object.keys(self.conns).length>=10){c.on('open',function(){c.send({v:2,k:'error',text:'接続が混雑しています。少し待って再参加してください。',rejected:true});setTimeout(function(){c.close();},300);});return;}
      self._bind(c,'c'+(++self.serial));
    });
  });});};
  PeerLink.prototype.join=function(code){var self=this;this.role='guest';return loadPeerJS().then(function(){return new Promise(function(res,rej){
    var done=false,peer=self.peer=new G.Peer({debug:0});
    var timer=setTimeout(function(){if(!done){done=true;peer.destroy();rej({code:'notfound'});}},20000);
    peer.on('error',function(e){if(!done){done=true;clearTimeout(timer);peer.destroy();rej({code:e&&e.type==='peer-unavailable'?'notfound':'net'});}else self._e('close');});
    peer.on('open',function(){var conn=self.conn=peer.connect(PREFIX+code,{reliable:true});
      conn.on('open',function(){if(!done){done=true;clearTimeout(timer);res();}});
      conn.on('data',function(m){if(conn===self.conn&&m&&typeof m==='object')self._e('msg',m);});
      conn.on('close',function(){if(conn===self.conn)self._e('close');});
      conn.on('error',function(){if(conn===self.conn)self._e('close');});
    });
  });});};
  PeerLink.prototype.send=function(m,cid){if(this.role==='host'){var self=this;var ids=cid?[cid]:Object.keys(this.conns);ids.forEach(function(id){var c=self.conns[id];if(c&&c.open)try{c.send(m);}catch(e){}});}else if(this.conn&&this.conn.open)try{this.conn.send(m);}catch(e){}};
  PeerLink.prototype.drop=function(cid){var c=this.conns[cid];if(!c)return;delete this.conns[cid];try{c.close();}catch(e){}this._e('close',cid);};
  PeerLink.prototype.close=function(){this.closed=true;try{if(this.peer)this.peer.destroy();}catch(e){}this.peer=null;this.conn=null;this.conns={};};

  function LocalLink(){this.h={};this.bc=null;this.id=makeCode()+makeCode()+makeCode();this.other=null;this.conns={};this.closed=false;}
  LocalLink.prototype.on=PeerLink.prototype.on;LocalLink.prototype._e=PeerLink.prototype._e;
  LocalLink.prototype._open=function(code){var self=this;this.bc=new G.BroadcastChannel('ibara-bg3-test-'+code);this.bc.onmessage=function(e){var m=e.data;
    if(!m||m.from===self.id||(m.to&&m.to!==self.id))return;
    if(m.k==='_hello'&&self.role==='host'){
      if(Object.keys(self.conns).length>=10&&!self.conns[m.from])return;
      self.conns[m.from]=true;self.bc.postMessage({k:'_ack',from:self.id,to:m.from});self._e('peer',m.from);
    }else if(m.k==='_ack'&&self.role==='guest'&&self._ack){self.other=m.from;self._ack();self._ack=null;}
    else if(m.k==='_bye'){if(self.role==='host'&&self.conns[m.from]){delete self.conns[m.from];self._e('close',m.from);}else if(m.from===self.other){self.other=null;self._e('close');}}
    else if(m.k==='_m'&&((self.role==='host'&&self.conns[m.from])||(self.role==='guest'&&m.from===self.other)))self._e('msg',m.m,self.role==='host'?m.from:undefined);
  };};
  LocalLink.prototype.host=function(code){this.role='host';this._open(code);return Promise.resolve();};
  LocalLink.prototype.join=function(code){var self=this;this.role='guest';this._open(code);return new Promise(function(res,rej){var timer=setTimeout(function(){self._ack=null;rej({code:'notfound'});},3000);self._ack=function(){clearTimeout(timer);res();};self.bc.postMessage({k:'_hello',from:self.id});});};
  LocalLink.prototype.send=function(m,cid){if(!this.bc)return;var self=this;var ids=this.role==='host'?(cid?[cid]:Object.keys(this.conns)):(this.other?[this.other]:[]);ids.forEach(function(id){self.bc.postMessage({k:'_m',from:self.id,to:id,m:m});});};
  LocalLink.prototype.drop=function(cid){if(!this.bc||!this.conns[cid])return;delete this.conns[cid];this.bc.postMessage({k:'_bye',from:this.id,to:cid});this._e('close',cid);};
  LocalLink.prototype.close=function(){if(this.bc){var self=this;var ids=this.role==='host'?Object.keys(this.conns):(this.other?[this.other]:[]);ids.forEach(function(id){self.bc.postMessage({k:'_bye',from:self.id,to:id});});this.bc.close();}this.closed=true;this.bc=null;this.other=null;this.conns={};};

  function makeLink(kind) { return kind === 'local' ? new LocalLink() : new PeerLink(); }

  return { PROTOCOL: PROTOCOL, makeLink: makeLink, makeCode: makeCode, cleanCode: cleanCode, cleanName: cleanName, loadPeerJS: loadPeerJS, PeerLink: PeerLink, LocalLink: LocalLink };
});
