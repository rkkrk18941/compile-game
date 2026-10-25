/* スレイザスパイア — sessions: the rules engine runs in one browser (solo, or the co-op host); guests mirror the
   host's state and send prompt answers and commands. Transport: IBARA_NET (PeerJS / BroadcastChannel). */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var S = STS.Session = {};
var PROTOCOL = 3;
S.PROTOCOL = PROTOCOL;

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function now() { return Date.now(); }
function schedule(fn, ms) { return setTimeout(fn, ms || 0); }

/* ------------------------------------------------------------------ read-only helpers shared by every view */
/* A query object over a run (live or mirrored): current costs, playability and enemy intents. */
S.query = function (run) {
  if (!run || !run.combat) return null;
  var g = new STS.Game(run, {});
  g.rand = function () { return 0; };
  return new STS.Combat(g, run.combat);
};
S.handInfo = function (run, pi) {
  var cb = S.query(run);
  if (!cb) return null;
  var pc = cb.pc(pi);
  if (!pc) return null;
  var out = {};
  pc.hand.forEach(function (c) {
    var cost = null, why = null;
    try { cost = cb.costOf(pc, c); } catch (e) { cost = null; }
    try { why = cb.canPlay(pc, c); } catch (e) { why = 'このカードは今は使えません。'; }
    out[c.u] = { cost: cost, why: why };
  });
  return out;
};

/* ------------------------------------------------------------------ local engine session */
function Local(run, opts) {
  opts = opts || {};
  var self = this;
  this.kind = 'local';
  this.seats = opts.seats || run.players.map(function (p) { return p.i; });
  this.prompts = {};
  this.seq = 0;
  this.listeners = [];
  this.evq = [];
  this.onCheckpoint = opts.onCheckpoint || null;
  this.io = {
    ask: function (pi, q) {
      return new Promise(function (res) {
        var id = ++self.seq;
        self.prompts[id] = { id: id, pi: pi, q: q, res: res, at: now() };
        self.changed();
      });
    },
    emit: function (ev) { self.evq.push(ev); if (self.evq.length > 400) self.evq.splice(0, 200); self.fire('ev', ev); self.changed(); },
    update: function () { self.changed(); },
    checkpoint: function (snap) { self.snap = snap; if (self.onCheckpoint) self.onCheckpoint(snap); }
  };
  this.g = new STS.Game(run, this.io);
}
S.Local = Local;
Local.prototype.on = function (fn) { this.listeners.push(fn); };
Local.prototype.fire = function (kind, x) { this.listeners.forEach(function (f) { try { f(kind, x); } catch (e) { console.error(e); } }); };
Local.prototype.changed = function () {
  var self = this;
  if (this._pending) return;
  this._pending = true;
  schedule(function () { self._pending = false; self.fire('change'); }, 0);
};
Local.prototype.start = function () {
  var self = this;
  return this.g.start().then(function (r) { self.done = true; self.changed(); return r; }, function (e) { self.error = e; console.error(e); self.fire('error', e); self.changed(); });
};
Local.prototype.run = function () { return this.g.run; };
Local.prototype.pending = function (seats) {
  var s = seats || this.seats, self = this;
  return Object.keys(this.prompts).map(function (k) { return self.prompts[k]; }).filter(function (p) { return s.indexOf(p.pi) >= 0; }).sort(function (a, b) { return a.id - b.id; });
};
Local.prototype.waiting = function () {
  var self = this, w = {};
  Object.keys(this.prompts).forEach(function (k) { w[self.prompts[k].pi] = true; });
  var cb = this.g.combat;
  if (cb && cb.s.phase === 'play' && cb._playDone) cb.pcs().forEach(function (pc) { if (!pc.ready && !pc.dead) w[pc.i] = true; });
  return Object.keys(w).map(Number);
};
Local.prototype.answer = function (id, v) {
  var p = this.prompts[id];
  if (!p) return false;
  delete this.prompts[id];
  p.res(v);
  this.changed();
  return true;
};
Local.prototype.command = function (pi, cmd) {
  var self = this;
  return Promise.resolve().then(function () { return self.g.command(pi, cmd); }).then(function (r) { self.changed(); return r; });
};
Local.prototype.hand = function (pi) {
  var cb = this.g.combat;
  if (!cb) return S.handInfo(this.g.run, pi);
  var pc = cb.pc(pi), out = {};
  if (!pc) return null;
  pc.hand.forEach(function (c) { var cost = null, why = null; try { cost = cb.costOf(pc, c); why = cb.canPlay(pc, c); } catch (e) { why = '使えません'; } out[c.u] = { cost: cost, why: why }; });
  return out;
};
Local.prototype.playOpen = function () { var cb = this.g.combat; return !!(cb && cb.s.phase === 'play' && cb._playDone && !cb.s.over); };
Local.prototype.close = function () { this.closed = true; };

/* ------------------------------------------------------------------ room roster (host side) */
var BAD = /[\x00-\x1f\x7f<>]/g;
function cleanName(s) { return String(s || '冒険者').replace(BAD, '').trim().slice(0, 12) || '冒険者'; }
S.cleanName = cleanName;
function Roster(host) {
  this.slots = [{ name: cleanName(host.name), ch: host.ch, unlock: host.unlock | 0, token: host.token, cid: null, online: true }];
  this.started = false;
}
S.Roster = Roster;
Roster.prototype.view = function () { return this.slots.map(function (s, i) { return { seat: i, name: s.name, ch: s.ch, unlock: s.unlock, online: s.online }; }); };
Roster.prototype.hello = function (cid, m) {
  if (!m || typeof m.token !== 'string' || m.token.length < 12 || m.token.length > 100) return { err: '参加情報が正しくありません。' };
  var ix = -1;
  for (var i = 0; i < this.slots.length; i++) if (this.slots[i].token === m.token) ix = i;
  if (ix === 0) return { err: 'ホストと同じ端末情報です。別の端末（またはタブ）から参加してください。' };
  if (ix < 0) {
    if (this.started) return { err: '冒険の途中からは新しく参加できません。参加済みの端末から再接続してください。' };
    if (!STS.DATA.CHARS[m.ch]) return { err: 'キャラクターを選んでください。' };
    if (this.slots.length >= 4) return { err: 'この部屋は満員です（最大4人）。' };
    if (this.slots.some(function (s) { return s.ch === m.ch; })) return { err: 'そのキャラクターは選ばれています。別のキャラクターを選んでください。' };
    ix = this.slots.length;
    this.slots.push({ ch: m.ch });
  } else if (!this.started && m.ch && m.ch !== this.slots[ix].ch) {
    var taken = this.slots.some(function (s, j) { return j !== ix && s.ch === m.ch; });
    if (taken) return { err: 'そのキャラクターは選ばれています。' };
    this.slots[ix].ch = m.ch;
  }
  var s = this.slots[ix], old = s.cid;
  s.token = m.token; s.cid = cid; s.online = true; s.name = cleanName(m.name);
  if (!this.started) s.unlock = Math.max(0, Math.min(3, m.unlock | 0));
  return { seat: ix, old: old && old !== cid ? old : null };
};
Roster.prototype.depart = function (cid) { this.slots.forEach(function (s) { if (s.cid === cid) { s.online = false; s.cid = null; } }); };
Roster.prototype.seatOf = function (cid) { for (var i = 1; i < this.slots.length; i++) if (this.slots[i].cid === cid && this.slots[i].online) return i; return -1; };
Roster.prototype.kick = function (seat) {
  if (this.started || seat < 1 || seat >= this.slots.length) return null;
  return this.slots.splice(seat, 1)[0];
};
Roster.prototype.setHost = function (o) { var s = this.slots[0]; if (o.name != null) s.name = cleanName(o.name); if (o.ch && !this.slots.some(function (x, j) { return j && x.ch === o.ch; })) s.ch = o.ch; if (o.unlock != null) s.unlock = o.unlock | 0; };

/* ------------------------------------------------------------------ host: local engine + network */
function Host(link, roster, opts) {
  this.link = link; this.roster = roster; this.opts = opts || {};
  this.local = null; this.listeners = []; this.settings = this.opts.settings || {};
  this.lastSent = 0; this.evBuf = [];
  var self = this;
  link.on('msg', function (m, cid) { self.onMsg(m, cid); });
  link.on('close', function (cid) { self.roster.depart(cid); self.publishRoster(); self.fire('roster'); });
  link.on('peer', function () { /* waits for hello */ });
}
S.Host = Host;
Host.prototype.on = function (fn) { this.listeners.push(fn); };
Host.prototype.fire = function (k, x) { this.listeners.forEach(function (f) { try { f(k, x); } catch (e) { console.error(e); } }); };
Host.prototype.publishRoster = function () {
  var msg = { v: PROTOCOL, k: 'roster', roster: this.roster.view(), started: this.roster.started, settings: this.settings };
  var self = this;
  this.roster.slots.forEach(function (s, i) { if (i && s.online && s.cid) self.link.send(Object.assign({ seat: i }, msg), s.cid); });
};
Host.prototype.onMsg = function (m, cid) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'hello') {
    if (m.v !== PROTOCOL) { this.link.send({ v: PROTOCOL, k: 'error', text: 'バージョンが違います。ページを再読み込みしてください。', rejected: true }, cid); return; }
    var r = this.roster.hello(cid, m);
    if (r.err) { this.link.send({ v: PROTOCOL, k: 'error', text: r.err, rejected: true }, cid); setTimeout(function () { try { this.link.drop(cid); } catch (e) {} }.bind(this), 400); return; }
    if (r.old) try { this.link.drop(r.old); } catch (e) {}
    this.publishRoster();
    this.fire('roster');
    if (this.local) this.sendState(true);
    return;
  }
  var seat = this.roster.seatOf(cid);
  if (seat < 1 || !this.local) return;
  if (m.k === 'answer') {
    var p = this.local.prompts[m.id];
    if (!p || p.pi !== seat) return;
    this.local.answer(m.id, m.val);
  } else if (m.k === 'cmd') {
    var self = this;
    this.local.command(seat, m.cmd || {}).then(function () { self.link.send({ v: PROTOCOL, k: 'cmdResult', rid: m.rid }, cid); },
      function (e) { self.link.send({ v: PROTOCOL, k: 'cmdResult', rid: m.rid, err: e && e.message || String(e) }, cid); });
  } else if (m.k === 'sync') this.sendState(true);
};
Host.prototype.begin = function (local) {
  var self = this;
  this.local = local;
  this.roster.started = true;
  local.on(function (k, x) {
    if (k === 'ev') { self.evBuf.push(x); if (self.evBuf.length > 300) self.evBuf.splice(0, 150); }
    if (k === 'change') self.sendState(false);
  });
  this.publishRoster();
  this.sendState(true);
};
Host.prototype.sendState = function (force) {
  var self = this;
  if (this._timer && !force) return;
  var wait = force ? 0 : Math.max(0, 70 - (now() - this.lastSent));
  if (this._timer) clearTimeout(this._timer);
  this._timer = schedule(function () {
    self._timer = null; self.lastSent = now();
    var local = self.local; if (!local) return;
    var run = local.run();
    var base = { v: PROTOCOL, k: 'state', run: run, waiting: local.waiting(), ev: self.evBuf.splice(0), done: !!local.done, play: local.playOpen() };
    var json = JSON.stringify(base);
    self.roster.slots.forEach(function (s, i) {
      if (!i || !s.online || !s.cid) return;
      var msg = JSON.parse(json);
      msg.seat = i;
      msg.prompts = local.pending([i]).map(function (p) { return { id: p.id, pi: p.pi, q: p.q }; });
      msg.hand = local.hand(i);
      self.link.send(msg, s.cid);
    });
  }, wait);
};
Host.prototype.close = function () { try { this.link.close(); } catch (e) {} };

/* ------------------------------------------------------------------ guest: mirrors the host */
function Guest(link, hello) {
  var self = this;
  this.kind = 'guest'; this.link = link; this.hello = hello; this.listeners = [];
  this.state = null; this.roster = []; this.settings = {}; this.seat = null; this.started = false;
  this.rid = 0; this.waitCmd = {}; this.answered = {};
  link.on('msg', function (m) { self.onMsg(m); });
  link.on('close', function () { self.connected = false; self.fire('close'); });
}
S.Guest = Guest;
Guest.prototype.on = Local.prototype.on;
Guest.prototype.fire = Local.prototype.fire;
Guest.prototype.sendHello = function () { this.link.send(Object.assign({ v: PROTOCOL, k: 'hello' }, this.hello)); this.connected = true; };
Guest.prototype.onMsg = function (m) {
  if (!m || typeof m !== 'object') return;
  if (m.k === 'error') { this.lastError = m.text; this.fire('error', m); return; }
  if (m.k === 'roster') { this.roster = m.roster; this.seat = m.seat; this.started = m.started; this.settings = m.settings || {}; this.fire('roster'); return; }
  if (m.k === 'state') {
    this.state = m; this.seat = m.seat; this.started = true;
    this.seats = [m.seat];
    var live = {};
    (m.prompts || []).forEach(function (p) { live[p.id] = true; });
    var self = this;
    Object.keys(this.answered).forEach(function (id) { if (!live[id]) delete self.answered[id]; });
    (m.ev || []).forEach(function (ev) { self.fire('ev', ev); });
    this.fire('change');
    return;
  }
  if (m.k === 'cmdResult') { var w = this.waitCmd[m.rid]; if (w) { delete this.waitCmd[m.rid]; if (m.err) w.rej(new Error(m.err)); else w.res(); } }
};
Guest.prototype.run = function () { return this.state && this.state.run; };
Guest.prototype.pending = function () {
  var self = this;
  return ((this.state && this.state.prompts) || []).filter(function (p) { return !self.answered[p.id]; });
};
Guest.prototype.waiting = function () { return (this.state && this.state.waiting) || []; };
Guest.prototype.answer = function (id, v) { this.answered[id] = true; this.link.send({ v: PROTOCOL, k: 'answer', id: id, val: v }); this.fire('change'); return true; };
Guest.prototype.command = function (pi, cmd) {
  var self = this, rid = ++this.rid;
  return new Promise(function (res, rej) {
    self.waitCmd[rid] = { res: res, rej: rej };
    self.link.send({ v: PROTOCOL, k: 'cmd', rid: rid, cmd: cmd });
    setTimeout(function () { if (self.waitCmd[rid]) { delete self.waitCmd[rid]; rej(new Error('応答がありません。接続を確認してください。')); } }, 20000);
  });
};
Guest.prototype.hand = function () { return this.state && this.state.hand; };
Guest.prototype.playOpen = function () { return !!(this.state && this.state.play); };
Guest.prototype.close = function () { try { this.link.close(); } catch (e) {} };
})(typeof window !== 'undefined' ? window : globalThis);
