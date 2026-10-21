/* スカルキング — the page.
   CPU games run the engine here and the CPUs in cpu-worker.js. Online, the host's browser runs the engine (and the CPUs)
   and every guest sends its moves and gets back its own view. Whatever happens arrives as a view: the page plays the new
   log entries one by one (cards flying to the table, the "Yo-ho-ho!" reveal, tricks going to their winner), then draws
   the view. */
(function () {
  'use strict';
  var E = window.SK_ENGINE, AI = window.SK_AI, NET = window.SK_NET;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var TEST = params.get('test') === '1';
  var NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
  var FAST = TEST || params.get('fast') === '1';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('sk.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('sk.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('sk.' + k); } catch (e) {} }
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HOVER = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var speed = store.get('quick', false) ? 0.5 : 1;   // メニューの「すばやく進める」
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, FAST ? Math.min(ms, 25) : reduceMotion ? Math.min(ms, 260) : ms * speed); }); }

  /* ================================================================ cards */
  var ICON = { y: 'chest', p: 'map', g: 'parrot', k: 'flag', escape: 'escape', pirate: 'pirate', tigress: 'tigress', king: 'king', mermaid: 'mermaid', kraken: 'kraken', whale: 'whale', loot: 'loot' };
  var PIRATE_SHORT = {}, PIRATE_INFO = {};
  E.PIRATES.forEach(function (p) { PIRATE_SHORT[p.key] = p.ja; PIRATE_INFO[p.key] = p; });
  var SUIT_DOT = { y: '#F2C230', p: '#7A4EC6', g: '#2C9E5C', k: '#23262C' };
  function use(icon) { return '<svg class="ce" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-' + icon + '" width="64" height="64"/></svg>'; }
  function cardName(id, as) {
    var c = E.CARDS[id];
    if (c.t === 'num') return E.SUIT[c.s].color + 'の' + c.n;
    if (c.t === 'pirate') return '海賊' + PIRATE_SHORT[c.key];
    if (c.t === 'tigress') return as ? 'ティグレス（' + (as === 'pirate' ? '海賊' : '逃走') + '）' : 'ティグレス';
    return E.TYPE_JA[c.t];
  }
  // Original Grandpa Beck's Games artwork: 14 columns × 5 rows (248 × 347 per face).
  // Engine order is yellow, purple, green, black; artwork order is green, purple, yellow, black.
  function cardFace(id) {
    var c = E.CARDS[id];
    if (c.t === 'num') return { x: c.n - 1, y: { g: 0, p: 1, y: 2, k: 3 }[c.s] };
    var x = c.t === 'pirate' ? E.PIRATE_IDS.indexOf(id) : c.t === 'mermaid' ? 5 + E.MERMAIDS.indexOf(id) :
      { king: 7, tigress: 8, escape: 9, kraken: 10, whale: 11, loot: 12 }[c.t];
    return { x: x, y: 4 };
  }
  function cardHTML(id, o) {
    o = o || {};
    var c = E.CARDS[id], face = cardFace(id), cls = 'card art';
    cls += c.t === 'num' ? ' s-' + c.s : ' sp t-' + c.t + (c.t === 'tigress' && o.as ? ' as-' + o.as : '');
    if (o.cls) cls += ' ' + o.cls;
    var style = '--face-x:' + (face.x / 13 * 100) + '%;--face-y:' + (face.y / 4 * 100) + '%;' + (o.style || '');
    var inner = c.t === 'tigress' && o.as ? '<span class="mode-badge">' + (o.as === 'pirate' ? '海賊' : '逃走') + '</span>' : '';
    return '<div class="' + cls + '" data-id="' + id + '" style="' + style + '"' +
      (o.attrs || ' role="img"') + ' aria-label="' + esc(cardName(id, o.as)) + '" title="' + esc(cardName(id, o.as)) + '">' + inner + '</div>';
  }
  function backHTML(style) { return '<div class="card art back" style="--face-x:100%;--face-y:100%;' + (style || '') + '" aria-hidden="true"></div>'; }
  function sortKey(id) {
    var c = E.CARDS[id];
    if (c.t === 'num') return E.SUITS.indexOf(c.s) * 20 + c.n;
    return { escape: 100, loot: 101, kraken: 102, whale: 103, mermaid: 104, tigress: 105, pirate: 106, king: 120 }[c.t] + (c.t === 'pirate' ? E.PIRATE_IDS.indexOf(id) : 0);
  }
  function sorted(ids) { return ids.slice().sort(function (a, b) { return sortKey(a) - sortKey(b); }); }

  /* ================================================================ sound (synthesized, no files) */
  var Sound = (function () {
    var ctx = null, on = store.get('sound', true);
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function tone(c, f, dur, type, vol, at, to) {
      var t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(c, dur, vol, at, freq) {
      var t = c.currentTime + (at || 0), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq || 2000; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
    }
    var fx = {
      card: function (c) { noise(c, 0.07, 0.35, 0, 2600); },
      thump: function (c) { tone(c, 110, 0.22, 'sine', 0.8, 0, 46); noise(c, 0.06, 0.25, 0, 500); },
      win: function (c) { tone(c, 587, 0.14, 'triangle', 0.22); tone(c, 880, 0.24, 'triangle', 0.2, 0.11); },
      lose: function (c) { tone(c, 330, 0.16, 'triangle', 0.12, 0, 260); },
      coin: function (c) { tone(c, 1318, 0.07, 'square', 0.06); tone(c, 1760, 0.16, 'square', 0.05, 0.07); },
      kraken: function (c) { tone(c, 80, 1.0, 'sawtooth', 0.18, 0, 34); noise(c, 0.8, 0.12, 0, 220); },
      whale: function (c) { tone(c, 260, 1.1, 'sine', 0.2, 0, 140); tone(c, 390, 0.9, 'sine', 0.08, 0.1, 210); },
      bell: function (c) { tone(c, 880, 0.6, 'sine', 0.22); tone(c, 1320, 0.7, 'sine', 0.1, 0.02); },
      tick: function (c) { tone(c, 1200, 0.04, 'square', 0.04); }
    };
    return {
      play: function (name) { if (!on || FAST) return; var c = ac(); if (!c) return; try { fx[name](c); } catch (e) {} },
      unlock: function () { if (on) ac(); },
      get on() { return on; },
      set: function (v) { on = !!v; store.set('sound', on); if (on) ac(); }
    };
  })();
  document.addEventListener('pointerdown', function () { Sound.unlock(); }, { once: true });

  /* ================================================================ the sea */
  function drawWaves() {
    var svg = $('#waves'), w = window.innerWidth, h = window.innerHeight, out = '';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    for (var y = 30, i = 0; y < h + 40; y += 46, i++) {
      var d = 'M-20 ' + y, amp = 5 + (i % 3) * 2, len = 70 + (i % 4) * 16, ph = (i * 37) % len;
      for (var x = -20 - ph; x < w + len; x += len) d += ' Q' + (x + len / 4) + ' ' + (y - amp) + ' ' + (x + len / 2) + ' ' + y + ' T' + (x + len) + ' ' + y;
      out += '<path d="' + d + '"/>';
    }
    svg.innerHTML = out;
  }
  var waveTimer = null;
  window.addEventListener('resize', function () { clearTimeout(waveTimer); waveTimer = setTimeout(function () { drawWaves(); if (app.v) layoutHand(); setCols(); }, 150); });

  /* ================================================================ screens, sheets, toast */
  var screens = ['scrTitle', 'scrCpu', 'scrOnline', 'scrLobby'];
  function showScreen(id) {
    screens.forEach(function (s) { $('#' + s).hidden = s !== id; });
    document.body.classList.toggle('ingame', !id);
    if (id && HOVER) { var f = $('#' + id + ' button:not([hidden])'); if (f && !TEST) try { f.focus({ preventScroll: true }); } catch (e) {} }
  }
  var sheetStack = [];
  function openSheet(html, opts) {
    opts = opts || {};
    var veil = document.createElement('div');
    veil.className = 'veil';
    veil.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    $('#sheetHost').appendChild(veil);
    sheetStack.push({ veil: veil, opts: opts });
    veil.addEventListener('click', function (e) { if (e.target === veil && !opts.sticky) closeSheet(); });
    var f = veil.querySelector('[data-focus]') || veil.querySelector('button');
    if (f && !TEST && HOVER) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
    return veil;
  }
  function closeSheet(all) {
    while (sheetStack.length) {
      var s = sheetStack.pop();
      s.veil.remove();
      if (s.opts.onClose) s.opts.onClose();
      if (!all) break;
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheetStack.length && !sheetStack[sheetStack.length - 1].opts.sticky) closeSheet();
  });
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, FAST ? 400 : ms || 2600);
  }

  /* ================================================================ CPU moves (in a worker when possible) */
  var worker = null, workerFailed = false, workerSeq = 0, workerWait = {};
  function cpuMove(view, level) {
    var seed = (view.seq * 2654435761 + view.me * 7919 + view.k * 31) >>> 0;
    if (!workerFailed && window.Worker && location.protocol !== 'file:') {
      try {
        if (!worker) {
          worker = new Worker('cpu-worker.js?v=1');
          worker.onmessage = function (e) { var r = workerWait[e.data.id]; if (r) { delete workerWait[e.data.id]; r(e.data.a); } };
          worker.onerror = function () { workerFailed = true; Object.keys(workerWait).forEach(function (k) { workerWait[k](undefined); }); workerWait = {}; };
        }
        var id = ++workerSeq;
        return new Promise(function (res) {
          var done = false;
          var finish = function (a) { if (done) return; done = true; delete workerWait[id]; res(a == null ? AI.choose(view, { level: level, seed: seed }) : a); };
          workerWait[id] = finish;
          setTimeout(function () { finish(undefined); }, 9000);
          worker.postMessage({ id: id, view: view, level: level, seed: seed });
        });
      } catch (e) { workerFailed = true; }
    }
    return Promise.resolve(AI.choose(view, { level: level, seed: seed }));
  }

  /* ================================================================ controllers
     Each one exposes: me (my seat), view(), act(action), and calls app.onView(view) when something happens. */
  var CPU_NAMES = ['ロッコ', 'メイベル', 'ガスト', 'ナギ', 'ブラム', 'シエラ', 'トト'];
  var AV = ['#F2C230', '#7FD6CC', '#F7A08E', '#BBA6F2', '#94D492', '#F5BC6E', '#9CC6F6', '#EDA9D7'];
  var LEVEL_JA = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
  var ctl = null;

  function Table(players, cfg) {
    // the engine plus CPU seats; used by CPU games and by the online host
    this.players = players; this.cfg = cfg;
    this.st = cfg.state || E.newGame({ players: players, opts: cfg.opts, seed: cfg.seed });
    this.busy = false; this.dead = false; this.lastPhase = null; this.onChange = null;
  }
  Table.prototype.isCpu = function (seat) { var p = this.players[seat]; return !!p && (p.kind === 'cpu' || (p.kind === 'remote' && p.away && p.awayCpu)); };
  Table.prototype.apply = function (seat, a) {
    if (!E.apply(this.st, seat, a)) return false;
    if (this.onChange) this.onChange();
    return true;
  };
  Table.prototype.drive = function (after) {
    // let the CPUs act, one action at a time; bids are simultaneous, so every CPU without a bid takes its turn
    var self = this;
    if (self.busy || self.dead || self.st.over) return;
    var seats = E.actors(self.st).filter(function (s) { return self.isCpu(s); });
    if (!seats.length) return;
    var seat = seats[0], phase = self.st.phase;
    var delay = phase === 'bid' ? (self.lastPhase === 'bid' ? 140 : 700) : phase === 'ability' ? 1000 : 820;
    self.lastPhase = phase;
    self.busy = true;
    sleep(delay).then(function () {
      if (self.dead) return null;
      return cpuMove(E.view(self.st, seat), self.players[seat].level || 'normal');
    }).then(function (a) {
      self.busy = false;
      if (self.dead) return;
      if (E.actors(self.st).indexOf(seat) >= 0) {
        if (!a || !E.isLegal(self.st, seat, a)) { var leg = E.legal(self.st, seat); a = leg[0]; }
        if (a) self.apply(seat, a);
      }
      self.lastPhase = self.st.phase === 'bid' && phase === 'bid' ? 'bid' : self.st.phase;
      after();
      self.drive(after);
    });
  };

  function LocalCtl(cfg, saved) {
    var players = [{ name: 'あなた', kind: 'human' }];
    for (var i = 1; i < cfg.count; i++) players.push({ name: CPU_NAMES[i - 1], kind: 'cpu', level: cfg.level });
    this.cfg = cfg; this.me = 0; this.online = false;
    this.table = new Table(players, { opts: cfg.opts, seed: cfg.seed, state: saved || null });
    var self = this;
    this.table.onChange = function () { self.save(); };
  }
  LocalCtl.prototype.save = function () {
    var st = this.table.st;
    if (st.over) store.del('save');
    else store.set('save', { cfg: this.cfg, st: st, at: Date.now() });
  };
  LocalCtl.prototype.view = function () { return E.view(this.table.st, this.me); };
  LocalCtl.prototype.start = function () { var self = this; self.save(); app.onView(self.view()); self.table.drive(function () { app.onView(self.view()); }); };
  LocalCtl.prototype.act = function (a) {
    var self = this;
    if (!self.table.apply(self.me, a)) { app.onView(self.view()); return; }
    app.onView(self.view());
    self.table.drive(function () { app.onView(self.view()); });
  };
  LocalCtl.prototype.again = function () { startLocal(Object.assign({}, this.cfg, { seed: undefined })); };
  LocalCtl.prototype.destroy = function () { this.table.dead = true; };
  LocalCtl.prototype.seatInfo = function (seat) { var p = this.table.players[seat]; return p ? { kind: p.kind, level: p.level } : null; };

  /* ---------------- online host */
  function HostCtl(name) {
    this.name = name; this.me = 0; this.online = true; this.isHost = true;
    this.seats = [{ kind: 'me', name: name }];
    this.opts = Object.assign({}, store.get('opts', {}));
    this.level = store.get('level', 'normal');
    this.table = null; this.link = null; this.code = null; this.dead = false; this.awayTimer = null;
  }
  HostCtl.prototype.open = function () {
    var self = this, tries = 0;
    function attempt() {
      self.code = NET.makeCode();
      self.link = NET.makeHost(NETKIND);
      return self.link.host(self.code).catch(function (e) {
        if (e && e.code === 'taken' && ++tries < 4) return attempt();
        throw e;
      });
    }
    return attempt().then(function () {
      self.link.on('msg', function (cid, m) { self.onMsg(cid, m); });
      self.link.on('leave', function (cid) { self.onLeave(cid); });
    });
  };
  HostCtl.prototype.seatOf = function (cid) { for (var i = 0; i < this.seats.length; i++) if (this.seats[i].cid === cid) return i; return -1; };
  HostCtl.prototype.lobbyInfo = function (forSeat) {
    return { k: 'lobby', code: this.code, opts: E.normOpts(this.opts, this.seats.length), level: this.level, you: forSeat,
      seats: this.seats.map(function (s) { return { name: s.name, kind: s.kind === 'me' ? 'host' : s.kind === 'cpu' ? 'cpu' : 'guest', away: !!s.away }; }) };
  };
  HostCtl.prototype.syncLobby = function () {
    var self = this;
    self.seats.forEach(function (s, i) { if (s.cid) self.link.send(s.cid, self.lobbyInfo(i)); });
    renderLobby(self.lobbyInfo(0), true);
  };
  HostCtl.prototype.onMsg = function (cid, m) {
    var self = this;
    if (!m || typeof m !== 'object') return;
    if (m.k === 'hello') {
      var i = self.seatOf(cid);
      if (self.table) {
        if (i < 0) { self.link.send(cid, { k: 'refused', why: 'started' }); self.link.drop(cid); return; }
        self.seats[i].away = false; self.table.players[i].away = false; self.table.players[i].awayCpu = false;
        toast(self.seats[i].name + 'がもどりました');
        self.push();
        return;
      }
      if (i < 0) {
        if (self.seats.length >= 8) { self.link.send(cid, { k: 'refused', why: 'full' }); self.link.drop(cid); return; }
        self.seats.push({ kind: 'remote', cid: cid, name: NET.cleanName(m.name) || 'ゲスト' });
      } else { self.seats[i].name = NET.cleanName(m.name) || self.seats[i].name; self.seats[i].away = false; }
      self.syncLobby();
      return;
    }
    if (m.k === 'act' && self.table) {
      var seat = self.seatOf(cid);
      if (seat < 0) return;
      if (self.table.apply(seat, m.a)) { self.push(); self.table.drive(function () { self.push(); }); }
      else self.link.send(cid, { k: 'view', view: self.viewFor(seat) });
      return;
    }
    if (m.k === 'leave') self.onLeave(cid, true);
  };
  HostCtl.prototype.onLeave = function (cid) {
    var self = this, i = self.seatOf(cid);
    if (i < 0) return;
    if (!self.table) { self.seats.splice(i, 1); self.syncLobby(); return; }
    self.seats[i].away = true; self.table.players[i].away = true;
    toast(self.seats[i].name + 'の接続が切れました');
    self.watchAway();
    self.push();
  };
  HostCtl.prototype.watchAway = function () {
    // a seat that stays disconnected while it has to act is played by a CPU after a while
    var self = this;
    clearTimeout(self.awayTimer);
    if (!self.table || self.table.st.over) return;
    var waiting = E.actors(self.table.st).filter(function (s) { var p = self.table.players[s]; return p.kind === 'remote' && p.away && !p.awayCpu; });
    if (!waiting.length) return;
    self.awayTimer = setTimeout(function () {
      if (!self.table) return;
      waiting.forEach(function (s) {
        var p = self.table.players[s];
        if (!p.away) return;
        p.awayCpu = true; p.level = 'normal';
        toast(p.name + 'の番をCPUが代わりに進めます');
      });
      self.push();
      self.table.drive(function () { self.push(); });
    }, FAST ? 500 : 45000);
  };
  HostCtl.prototype.addCpu = function () {
    if (this.table || this.seats.length >= 8) return;
    var used = this.seats.map(function (s) { return s.name; });
    var name = CPU_NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || 'CPU';
    this.seats.push({ kind: 'cpu', name: name });
    this.syncLobby();
  };
  HostCtl.prototype.removeSeat = function (i) {
    var s = this.seats[i];
    if (this.table || !s || s.kind === 'me') return;
    if (s.cid) { this.link.send(s.cid, { k: 'refused', why: 'kicked' }); this.link.drop(s.cid); }
    this.seats.splice(i, 1);
    this.syncLobby();
  };
  HostCtl.prototype.start = function () {
    var self = this;
    if (self.seats.length < 2) return;
    var level = self.level;
    var players = self.seats.map(function (s) { return { name: s.name, kind: s.kind === 'cpu' ? 'cpu' : s.kind === 'me' ? 'human' : 'remote', level: level, cid: s.cid, away: !!s.away }; });
    store.set('opts', self.opts); store.set('level', level);
    app.freshGame = true;
    self.table = new Table(players, { opts: E.normOpts(self.opts, players.length) });
    showScreen(null);
    self.push();
    self.table.drive(function () { self.push(); });
  };
  HostCtl.prototype.viewFor = function (seat) {
    var v = E.view(this.table.st, seat), tp = this.table.players;
    v.players.forEach(function (p, i) { p.away = !!tp[i].away; p.awayCpu = !!tp[i].awayCpu; p.cpu = tp[i].kind === 'cpu'; });
    return v;
  };
  HostCtl.prototype.view = function () { return this.viewFor(this.me); };
  HostCtl.prototype.push = function () {
    var self = this;
    if (!self.table) return;
    self.seats.forEach(function (s, i) { if (s.cid) self.link.send(s.cid, { k: 'view', view: self.viewFor(i) }); });
    app.onView(self.view());
    self.watchAway();
  };
  HostCtl.prototype.act = function (a) {
    var self = this;
    if (!self.table) return;
    if (!self.table.apply(self.me, a)) { app.onView(self.view()); return; }
    self.push();
    self.table.drive(function () { self.push(); });
  };
  HostCtl.prototype.again = function () {
    // back to the room with the same seats
    var self = this;
    if (self.table) self.table.dead = true;
    self.table = null;
    clearTimeout(self.awayTimer);
    self.seats = self.seats.filter(function (s) { return !s.away; });
    self.seats.forEach(function (s) { if (s.cid) self.link.send(s.cid, { k: 'again' }); });
    resetGameView();
    closeSheet(true);
    showScreen('scrLobby');
    self.syncLobby();
  };
  HostCtl.prototype.destroy = function () {
    var self = this; self.dead = true;
    if (self.table) self.table.dead = true;
    clearTimeout(self.awayTimer);
    try { self.seats.forEach(function (s) { if (s.cid) self.link.send(s.cid, { k: 'bye' }); }); } catch (e) {}
    setTimeout(function () { try { self.link.close(); } catch (e) {} }, 300);
  };
  HostCtl.prototype.seatInfo = function (seat) { var p = this.table && this.table.players[seat]; return p ? { kind: p.kind, level: p.level } : null; };

  /* ---------------- online guest */
  function GuestCtl(name, code) {
    this.name = name; this.code = code; this.online = true; this.isHost = false;
    this.cid = store.get('cid', null) || NET.makeCid(); store.set('cid', this.cid);
    this.me = null; this.v = null; this.link = null; this.dead = false;
  }
  GuestCtl.prototype.join = function () {
    var self = this;
    self.link = NET.makeGuest(NETKIND);
    return self.link.join(self.code).then(function () {
      self.link.on('msg', function (m) { self.onMsg(m); });
      self.link.on('close', function () { if (!self.dead) lostHost(); });
      self.link.send({ k: 'hello', cid: self.cid, name: self.name, v: NET.PROTOCOL });
      setRoomParam(self.code);
    });
  };
  GuestCtl.prototype.onMsg = function (m) {
    var self = this;
    if (m.k === 'lobby') { self.me = m.you; showScreen('scrLobby'); renderLobby(m, false); return; }
    if (m.k === 'view') {
      var first = !self.v || self.v.gid !== m.view.gid;
      if (first) app.freshGame = m.view.round === 0 && m.view.tricksDone === 0 && m.view.phase === 'bid';
      self.v = m.view; self.me = m.view.me;
      if (!document.body.classList.contains('ingame')) { closeSheet(true); showScreen(null); }
      app.onView(m.view);
      return;
    }
    if (m.k === 'again') { self.v = null; resetGameView(); closeSheet(true); showScreen('scrLobby'); return; }
    if (m.k === 'refused') {
      self.dead = true;
      var why = m.why === 'full' ? 'この部屋は満員です（8人まで）。' : m.why === 'started' ? 'この部屋はもうゲームを始めています。' : '部屋から外されました。';
      try { self.link.close(); } catch (e) {}
      ctl = null; showScreen('scrOnline'); onlineError(why); return;
    }
    if (m.k === 'bye') lostHost();
  };
  GuestCtl.prototype.view = function () { return this.v; };
  GuestCtl.prototype.act = function (a) { if (!this.v) return; this.link.send({ k: 'act', a: a, seq: this.v.seq }); app.pending = true; render(); };
  GuestCtl.prototype.destroy = function () { this.dead = true; try { this.link.send({ k: 'leave' }); } catch (e) {} var l = this.link; setTimeout(function () { try { l.close(); } catch (e) {} }, 200); };
  GuestCtl.prototype.seatInfo = function (seat) { var p = this.v && this.v.players[seat]; return p ? { kind: p.cpu ? 'cpu' : 'remote' } : null; };

  function lostHost() {
    if (!ctl || ctl.isHost || ctl.dead) return;
    ctl.dead = true;
    openSheet('<h3>接続が切れました</h3><p class="note">部屋をつくった人との接続が切れたため、ゲームを続けられません。</p><div class="rowbtns"><button class="btn primary" data-act="title" data-focus>タイトルへ</button></div>', { sticky: true }).addEventListener('click', function (e) {
      if (e.target.closest('[data-act="title"]')) { closeSheet(true); goTitle(true); }
    });
  }

  /* ================================================================ the game view */
  var app = {
    v: null, lastK: -1, busy: false, pending: false, sel: null, bendt: [], freshGame: false, resultShown: false, gen: 0,
    hints: store.get('hints', false),
    onView: function (v) { queueView(v); }
  };
  // what the table shows while log entries are being played back
  var disp = null;
  function blankDisp(v) {
    return { round: v.round, cards: v.cards, bids: v.players.map(function () { return null; }), hasBid: v.players.map(function () { return false; }), revealed: false,
      won: v.players.map(function () { return 0; }), ghostWon: 0, scores: v.players.map(function (p) { return p.score; }), trick: [], win: -1, verdict: '', hand: null, flash: -1 };
  }
  function syncDisp(v) {
    disp = disp || blankDisp(v);
    disp.round = v.round; disp.cards = v.cards;
    disp.bids = v.players.map(function (p) { return p.bid; });
    disp.hasBid = v.players.map(function (p) { return p.hasBid; });
    disp.revealed = v.phase !== 'bid';
    disp.won = v.players.map(function (p) { return p.won; });
    disp.ghostWon = v.ghostWon;
    disp.scores = v.players.map(function (p) { return p.score; });
    disp.trick = v.trick ? v.trick.plays.slice() : [];
    disp.win = -1; disp.verdict = disp.trick.length ? '' : disp.verdict;
    disp.hand = null;
  }

  var viewQueue = [], viewBusy = false;
  function queueView(v) { viewQueue.push(v); if (!viewBusy) nextView(); }
  function nextView() {
    if (!viewQueue.length) { viewBusy = false; return; }
    viewBusy = true;
    var v = viewQueue[viewQueue.length - 1];
    viewQueue = [];
    var prev = app.v;
    var newGame = !prev || prev.gid !== v.gid;
    if (newGame) {
      app.sel = null; app.bendt = []; app.resultShown = false; disp = blankDisp(v);
      app.lastK = app.freshGame ? 0 : v.k;
      app.freshGame = false;
      if (app.lastK >= v.k) syncDisp(v);
    }
    var fresh = (v.log || []).filter(function (e) { return e.k > app.lastK; });
    if (!newGame && fresh.length && fresh.every(function (e) { return e.t === 'bidMade'; }) && !app.busy) {
      // someone decided a bid: nothing to animate, just tick their plate (and leave the bid panel alone)
      app.v = v; app.pending = false; app.lastK = fresh[fresh.length - 1].k;
      fresh.forEach(function (e) { disp.hasBid[e.seat] = true; if (e.seat === v.me) disp.bids[e.seat] = v.players[v.me].bid; });
      if (fresh.some(function (e) { return e.seat === v.me; })) render(); else { renderRivals(v); renderPrompt(v); }
      nextView();
      return;
    }
    var before = captureRects(fresh);
    if (!newGame && fresh.some(function (e) { return e.t === 'deal'; })) {
      var mine = fresh.filter(function (e) { return e.t === 'play' && e.seat === v.me; }).map(function (e) { return e.id; });
      disp.hand = prev.hand.filter(function (id) { return mine.indexOf(id) < 0; });
    }
    app.v = v; app.pending = false;
    if (fresh.length) app.lastK = fresh[fresh.length - 1].k;
    if (!(v.phase === 'play' && v.turn === v.me)) app.sel = null;
    if (!(v.phase === 'ability' && v.ability && v.ability.seat === v.me && v.ability.key === 'bendt')) app.bendt = [];
    app.busy = fresh.length > 0;
    render();
    var gen = app.gen;
    playEntries(fresh, before, gen).then(function () {
      if (gen !== app.gen) { viewBusy = false; if (viewQueue.length) nextView(); return; }   // left the game meanwhile
      app.busy = false;
      syncDisp(app.v);
      render();
      if (app.v.over && !app.resultShown) { app.resultShown = true; setTimeout(function () { showResult(app.v); }, FAST ? 0 : 300); }
      nextView();
    });
  }

  function me() { return app.v ? app.v.me : 0; }
  function seatName(seat) { var v = app.v; if (seat === v.G) return '白ひげの幽霊'; return seat === v.me ? 'あなた' : v.players[seat].name; }
  function avColor(seat) { return app.v && seat === app.v.G ? '#C8D2D8' : AV[seat % AV.length]; }
  function avChar(seat) { var v = app.v; if (seat === v.G) return '幽'; var nm = seat === v.me ? (ctl && ctl.online ? v.players[seat].name : 'あなた') : v.players[seat].name; return Array.from(nm)[0] || '?'; }
  function myTurnToPlay() { var v = app.v; return v && !v.over && v.phase === 'play' && v.turn === v.me && !app.pending && !app.busy; }
  function myAbility() { var v = app.v; return v && v.phase === 'ability' && v.ability && v.ability.seat === v.me && !app.pending && !app.busy ? v.ability : null; }
  function myBidPending() { var v = app.v; return v && v.phase === 'bid' && v.players[v.me] && v.players[v.me].bid === null && !app.pending && !app.busy; }

  /* ---------------------------------------------------------------- drawing */
  function render() {
    var v = app.v;
    if (!v || !disp) return;
    renderTop(v); renderRivals(v); renderTable(v); renderMine(v); renderPrompt(v);
  }
  function renderTop(v) {
    var total = v.schedule.length;
    $('#tRound').textContent = total > 1 ? '第' + (disp.round + 1) + 'ラウンド' : '1ラウンド勝負';
    $('#tCards').textContent = (total > 1 ? '全' + total + 'ラウンド、' : '') + '手札' + disp.cards + '枚';
    var chips = [];
    if (v.opts.kraken) chips.push('クラーケン');
    if (v.opts.whale) chips.push('白クジラ');
    if (v.opts.loot) chips.push('略奪品');
    if (v.opts.abilities) chips.push('海賊の能力');
    if (v.opts.scoring === 'rascal') chips.push(v.opts.cannon ? 'ラスカル式（大砲）' : 'ラスカル式');
    $('#tRules').innerHTML = window.innerWidth >= 640 ? chips.map(function (c) { return '<span class="rchip">' + c + '</span>'; }).join('') : '';
  }
  function rivalSeats(v) {
    var out = [];
    for (var i = 1; i < v.n; i++) out.push((v.me + i) % v.n);
    if (v.ghost) out.push(v.G);
    return out;
  }
  function setCols() {
    var v = app.v; if (!v) return;
    var k = rivalSeats(v).length, w = window.innerWidth, cols;
    if (w >= 900) cols = k;
    else if (w >= 620) cols = Math.min(k, k > 5 ? Math.ceil(k / 2) : k);
    else cols = k <= 3 ? k : k === 4 ? (w >= 520 ? 4 : 2) : k <= 6 ? 3 : 4;
    $('#rivals').style.setProperty('--cols', cols);
    $('#rivals').classList.toggle('compact', $('#rivals').clientWidth / cols < 110);
    app.cols = cols;
  }
  function cols() { return app.cols || 3; }
  function pipsHTML(bid, won, revealed, max) {
    if (!revealed || bid == null) return won ? new Array(won + 1).join('<span class="pip on"></span>') : '';
    if (bid === 0 && won === 0) return '';
    var n = Math.max(bid, won);
    if (n > (max || 6)) return '<span class="tally' + (won > bid ? ' over' : won === bid ? ' ok' : '') + '">' + won + '/' + bid + '</span>';
    var h = '';
    for (var i = 0; i < n; i++) h += '<span class="pip ' + (i < won ? (i < bid ? 'on' : 'over') : '') + '"></span>';
    return h;
  }
  function plateExtras(v, seat) {
    var p = v.players[seat], bits = [];
    if (p.cannon && disp.revealed) bits.push('大砲');
    if (p.wager) bits.push('賭' + p.wager);
    if (p.harry) bits.push('ハリー' + (p.harry > 0 ? '+' : '') + p.harry);
    var allies = v.alliances.filter(function (a) { return a.a === seat || a.b === seat; }).length;
    if (allies) bits.push('同盟' + (allies > 1 ? '×' + allies : ''));
    return bits;
  }
  function actingSeats(v) {
    if (v.over) return [];
    if (v.phase === 'bid') return v.players.map(function (p, i) { return p.hasBid ? -1 : i; }).filter(function (i) { return i >= 0; });
    if (v.phase === 'play') return [v.turn];
    if (v.phase === 'ability' && v.ability) return [v.ability.seat];
    return [];
  }
  function renderRivals(v) {
    setCols();
    var acting = app.busy ? [] : actingSeats(v);
    $('#rivals').innerHTML = rivalSeats(v).map(function (seat) {
      if (seat === v.G) {
        return '<button class="plate ghost" data-seat="' + seat + '" aria-label="白ひげの幽霊の説明"><span class="av" style="--avc:' + avColor(seat) + '">幽</span>' +
          '<span class="nm">白ひげの幽霊</span><span class="bidline"><span class="bid wait">ビッドなし</span><span class="pips">' + pipsHTML(null, disp.ghostWon, false) + '</span></span>' +
          '<span class="sc">山' + v.ghostHand + '枚</span></button>';
      }
      var p = v.players[seat], bid;
      if (disp.revealed && disp.bids[seat] != null) bid = '<span class="bid"><small>ビッド</small>' + disp.bids[seat] + '</span>';
      else if (disp.hasBid[seat]) bid = '<span class="bid ready">✓ 決めた</span>';
      else bid = '<span class="bid wait">' + (acting.indexOf(seat) >= 0 ? '考え中 <span class="thinking"><i></i><i></i><i></i></span>' : '…') + '</span>';
      var turn = acting.indexOf(seat) >= 0 && v.phase !== 'bid';
      var hit = disp.revealed && disp.won[seat] === disp.bids[seat];
      var tag = p.away ? '<span class="tag away">' + (p.awayCpu ? 'CPU代行' : '接続待ち') + '</span>' : turn ? '<span class="tag">番</span>' : '';
      var extras = plateExtras(v, seat);
      return '<button class="plate' + (turn ? ' turn' : '') + (hit && v.phase !== 'bid' ? ' hit' : '') + (disp.flash === seat ? ' flash' : '') + '" data-seat="' + seat + '" aria-label="' + esc(p.name) + 'の情報">' + tag +
        '<span class="av" style="--avc:' + avColor(seat) + '">' + esc(avChar(seat)) + '</span>' +
        '<span class="nm">' + esc(p.name) + '</span>' +
        '<span class="bidline">' + bid + '<span class="pips">' + pipsHTML(disp.bids[seat], disp.won[seat], disp.revealed, cols() >= 4 ? 4 : 6) + '</span></span>' +
        '<span class="sc"><b>' + disp.scores[seat] + '</b>点' + (extras.length ? '　' + extras.join('　') : '') + '</span></button>';
    }).join('');
  }
  function leadText(plays) {
    if (!plays.length) return '';
    var first = E.eff(plays[0]);
    if (first === 'pirate' || first === 'king' || first === 'mermaid' || first === 'kraken' || first === 'whale') return '<span class="lchip"><i style="--dot:#9fb"></i>スートの指定なし（' + cardName(plays[0].id, plays[0].as) + 'から）</span>';
    var ls = E.leadSuit(plays);
    if (!ls) return '<span class="lchip"><i style="--dot:#ddd"></i>次の数字カードがスートを決める</span>';
    return '<span class="lchip"><i style="--dot:' + SUIT_DOT[ls] + '"></i>' + E.SUIT[ls].color + '（' + E.SUIT[ls].ja + '）を出す</span>';
  }
  function renderTable(v) {
    var tw = trickWidth(v);
    $('#table').style.setProperty('--trick-w', tw + 'px');
    var lead = leadText(disp.trick);
    $('#leadline').innerHTML = lead + (disp.trick.length || v.phase === 'play' ? '<span class="lchip"><i style="--dot:#23262C"></i>黒が切り札</span>' : '');
    var h = disp.trick.map(function (p, i) {
      return '<div class="slot' + (disp.win === i ? ' win' : '') + '" data-i="' + i + '">' + cardHTML(p.id, { as: p.as }) + '<span class="who">' + esc(seatName(p.seat)) + '</span></div>';
    }).join('');
    if (!h) {
      var txt = '';
      if (v.phase === 'bid') txt = disp.revealed ? '' : 'ビッドがそろうと、ここにカードが出ます';
      else if (v.phase === 'play' && v.trick && !app.busy) txt = seatName(v.trick.leader) + 'がリードします';
      h = '<div class="empty">' + txt + '</div>';
    }
    $('#trick').innerHTML = h;
    $('#verdict').textContent = disp.verdict || '';
  }
  function trickWidth(v) {
    var n = v.n + (v.ghost ? 1 : 0), W = $('#table').clientWidth - 24, H = $('#table').clientHeight;
    var base = window.innerWidth >= 700 ? 100 : 92, min = 40;
    var perRow = n, w = Math.floor((W - (perRow - 1) * 10) / perRow);
    if (w < 52 && n > 4) { perRow = Math.ceil(n / 2); w = Math.floor((W - (perRow - 1) * 10) / perRow); var rows = 2; var maxH = (H - 70) / rows / 1.42 - 20; w = Math.min(w, maxH); }
    else { var mh = (H - 70) / 1.42 - 20; w = Math.min(w, mh); }
    return Math.max(min, Math.min(base, Math.floor(w)));
  }
  function renderPrompt(v) {
    var el = $('#prompt'), t = '', sub = '';
    if (v.over) t = 'ゲーム終了';
    else if (app.busy) t = '';
    else if (app.pending) t = '送信中…';
    else if (v.phase === 'bid') {
      if (v.players[v.me].bid === null) { t = '何トリック取れるか、ビッドしてください'; sub = 'ぴったり当てると得点、外れると減点'; }
      else t = 'ほかの人のビッドを待っています…';
    } else if (v.phase === 'play') {
      if (v.turn === v.me) {
        var plays = v.trick.plays, ls = E.leadSuit(plays);
        if (!plays.length) t = 'あなたのリードです。好きなカードを出せます';
        else if (ls && v.hand.some(function (id) { return E.suitOf(id) === ls; })) { t = 'あなたの番です。' + E.SUIT[ls].color + 'を出してください'; sub = '特殊カードはいつでも出せます'; }
        else t = 'あなたの番です。好きなカードを出せます';
      } else t = seatName(v.turn) + 'の番です…';
    } else if (v.phase === 'ability' && v.ability) {
      var nm = PIRATE_INFO[v.ability.key].full;
      t = v.ability.seat === v.me ? nm + 'の力を使えます' : seatName(v.ability.seat) + 'が' + nm + 'の力を使っています…';
    }
    el.innerHTML = esc(t) + (sub ? '<br><span class="sub">' + esc(sub) + '</span>' : '');
  }
  function renderMine(v) {
    var m = v.players[v.me], plate = $('#myPlate');
    var turn = !app.busy && ((v.phase === 'play' && v.turn === v.me) || (v.phase === 'ability' && v.ability && v.ability.seat === v.me));
    plate.className = turn ? 'turn' : '';
    var bid = disp.bids[v.me];
    var extras = plateExtras(v, v.me);
    plate.innerHTML = '<span class="me">' + esc(ctl && ctl.online ? m.name + '（あなた）' : 'あなた') + '</span>' +
      '<span class="stat">ビッド<b>' + (bid == null ? '–' : bid) + '</b></span>' +
      '<span class="stat">取った<b>' + disp.won[v.me] + '</b></span>' +
      (bid != null && disp.revealed ? '<span class="pips">' + pipsHTML(bid, disp.won[v.me], true) + '</span>' : '') +
      '<span class="stat">得点<b class="score">' + disp.scores[v.me] + '</b></span>' +
      (extras.length ? '<span class="stat">' + extras.join('　') + '</span>' : '') +
      (v.seen && !app.busy ? '<button class="btn small ghost" data-act="seen">見た山札</button>' : '');
    renderActions(v);
    renderHand(v);
  }

  function renderHand(v) {
    var hand = disp.hand || v.hand, el = $('#hand');
    var playable = myTurnToPlay() ? E.legalCards(v.hand, v.trick.plays) : null;
    var ab = myAbility(), bendt = ab && ab.key === 'bendt';
    var ids = sorted(hand);
    if (!ids.length) { el.innerHTML = '<div class="none">' + (v.phase === 'bid' && app.busy ? '' : '') + '</div>'; return; }
    el.innerHTML = ids.map(function (id) {
      var cls = [];
      if (playable && playable.indexOf(id) < 0) cls.push('no');
      if (app.sel === id) cls.push('sel');
      if (bendt && app.bendt.indexOf(id) >= 0) cls.push('mark');
      if (bendt && ab.drawn && ab.drawn.indexOf(id) >= 0) cls.push('drawn');
      return cardHTML(id, { cls: cls.join(' '), attrs: ' role="button" tabindex="0"' });
    }).join('');
    layoutHand();
  }
  function layoutHand() {
    var el = $('#hand'), cards = $$('.card', el);
    if (!cards.length) return;
    // the card's layout width (not its box, which the deal animation scales) and the room the hand really has
    var cw = parseFloat(getComputedStyle(cards[0]).width) || cards[0].offsetWidth, W = el.clientWidth - 8, n = cards.length;
    var step = n > 1 ? Math.min(cw + 6, (W - cw) / (n - 1)) : 0;
    cards.forEach(function (c, i) { c.style.marginLeft = i === 0 ? '0' : (step - cw) + 'px'; c.style.zIndex = String(i + 1); });
  }

  /* ---------------------------------------------------------------- actions (bid, play, abilities) */
  var bidPick = { n: null, cannon: false };
  function renderActions(v) {
    var el = $('#actions'), h = '', inline = false;
    if (app.busy || app.pending || v.over) { el.innerHTML = ''; el.className = ''; return; }
    if (myBidPending()) {
      var coins = '';
      for (var i = 0; i <= v.cards; i++) coins += '<button class="coin" data-bid="' + i + '" aria-pressed="' + (bidPick.n === i) + '">' + i + '</button>';
      var cannon = v.opts.cannon ? '<div class="seg" id="cannonSeg"><button data-cannon="0" aria-pressed="' + !bidPick.cannon + '">散弾（1ずれても半分）</button><button data-cannon="1" aria-pressed="' + bidPick.cannon + '">大砲（ぴったりで1.5倍）</button></div>' : '';
      var hint = app.hints ? '<span class="hint">目安：' + AI.feelBid(v.hand, v.n, v.cards) + 'くらい（手札の強さからのおおよその見込み）</span>' : '';
      h = '<div class="bidpanel"><div class="coins" role="group" aria-label="ビッドの数">' + coins + '</div>' + cannon + hint +
        '<button class="btn primary" data-act="bid"' + (bidPick.n == null ? ' disabled' : '') + '>' + (bidPick.n == null ? '数を選んでください' : bidPick.n + 'でビッド') + '</button></div>';
    } else if (myTurnToPlay() && app.sel != null) {
      inline = true;
      if (app.sel === E.TIGRESS) h = '<button class="btn primary" data-act="tig" data-as="pirate">海賊として出す</button><button class="btn" data-act="tig" data-as="escape">逃走として出す</button>';
      else h = '<button class="btn primary" data-act="play">' + esc(cardName(app.sel)) + 'を出す</button>';
    } else {
      var ab = myAbility();
      if (ab) h = abilityHTML(v, ab);
    }
    el.innerHTML = h;
    el.className = h ? (inline ? 'act-inline' : 'act-panel') : '';
  }
  function abilityHTML(v, ab) {
    var m = v.players[v.me], info = PIRATE_INFO[ab.key];
    var head = '<div class="bidpanel"><div class="q">' + esc(info.full) + 'の力<small>' + esc(info.ab) + '</small></div>';
    if (ab.key === 'rosie') {
      var b = '';
      for (var s = 0; s < v.n; s++) b += '<button class="btn small" data-act="rosie" data-seat="' + s + '">' + esc(seatName(s)) + '</button>';
      return head + '<div class="coins">' + b + '</div></div>';
    }
    if (ab.key === 'bendt') return head + '<span class="hint">手札から' + ab.need + '枚えらんでください（引いたカードも選べます）</span><button class="btn primary" data-act="bendt"' + (app.bendt.length === ab.need ? '' : ' disabled') + '>選んだ' + ab.need + '枚を捨てる</button></div>';
    if (ab.key === 'rascal') return head + '<span class="hint">ビッドが当たれば獲得、外れれば失います（今のビッド' + m.bid + '、取った' + m.won + '）</span><div class="coins"><button class="btn small" data-act="rascal" data-w="0">賭けない</button><button class="btn small" data-act="rascal" data-w="10">10点賭ける</button><button class="btn small" data-act="rascal" data-w="20">20点賭ける</button></div></div>';
    if (ab.key === 'juanita') {
      var cnt = v.seen ? v.seen.length : 0;
      return head + '<span class="hint">配られなかったカードは' + cnt + '枚。見たあとも、このラウンドの間は「見た山札」で見直せます</span><div class="coins"><button class="btn primary" data-act="juanitaView">山札を見る</button><button class="btn small" data-act="juanita">見ずに進む</button></div></div>';
    }
    if (ab.key === 'harry') {
      var bb = '';
      [-1, 0, 1].forEach(function (d) {
        var nb = m.bid + d;
        if (nb < 0 || nb > v.cards) return;
        bb += '<button class="btn small' + (d === 0 ? '' : '') + '" data-act="harry" data-d="' + d + '">' + (d === 0 ? 'そのまま（' + nb + '）' : (d > 0 ? '+1して' : '−1して') + nb + 'に') + '</button>';
      });
      return head + '<span class="hint">今のビッド' + m.bid + '、取った' + m.won + (ab.final ? '（このラウンドは終わりました）' : '') + '</span><div class="coins">' + bb + '</div></div>';
    }
    return '';
  }
  function act(a) { if (ctl && !app.pending) ctl.act(a); }

  $('#actions').addEventListener('click', function (e) {
    var v = app.v; if (!v) return;
    var coin = e.target.closest('[data-bid]');
    if (coin) { bidPick.n = +coin.dataset.bid; Sound.play('tick'); renderActions(v); return; }
    var cs = e.target.closest('[data-cannon]');
    if (cs) { bidPick.cannon = cs.dataset.cannon === '1'; renderActions(v); return; }
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var k = b.dataset.act;
    if (k === 'bid' && myBidPending() && bidPick.n != null) {
      var a = { t: 'bid', n: bidPick.n };
      if (v.opts.cannon) a.cannon = bidPick.cannon;
      bidPick = { n: null, cannon: false };
      act(a);
    } else if (k === 'play' && myTurnToPlay() && app.sel != null) { var id = app.sel; app.sel = null; act({ t: 'play', id: id }); }
    else if (k === 'tig' && myTurnToPlay()) { app.sel = null; act({ t: 'play', id: E.TIGRESS, as: b.dataset.as }); }
    else if (k === 'rosie') act({ t: 'rosie', seat: +b.dataset.seat });
    else if (k === 'bendt' && app.bendt.length) { var d = app.bendt.slice(); app.bendt = []; act({ t: 'bendt', discard: d }); }
    else if (k === 'rascal') act({ t: 'rascal', w: +b.dataset.w });
    else if (k === 'juanita') act({ t: 'juanita' });
    else if (k === 'juanitaView') showSeen(true);
    else if (k === 'harry') act({ t: 'harry', d: +b.dataset.d });
  });
  // フアニータ・ジェイド: the undealt cards, grouped by suit so a long list stays readable
  function seenHTML(ids) {
    var groups = [];
    E.SUITS.forEach(function (s) {
      var ns = ids.filter(function (id) { return E.suitOf(id) === s; }).sort(function (a, b) { return a - b; });
      if (ns.length) groups.push('<div class="seen-row"><span class="lchip"><i style="--dot:' + SUIT_DOT[s] + '"></i>' + E.SUIT[s].color + '</span><span class="seen-nums">' + ns.map(function (id) { return id % 14 + 1; }).join(' ') + '</span><span class="note">' + ns.length + '枚</span></div>');
    });
    var sp = sorted(ids.filter(function (id) { return !E.isNum(id); }));
    if (sp.length) groups.push('<div class="cardrow">' + sp.map(function (id) { return cardHTML(id, { cls: 'mini' }); }).join('') + '</div>');
    return groups.join('') || '<p class="note">配られなかったカードはありません。</p>';
  }
  function showSeen(acting) {
    var v = app.v; if (!v || !v.seen) return;
    var veil = openSheet('<h3>配られなかったカード</h3><p class="note">このラウンドで、だれの手札にもない' + v.seen.length + '枚（フアニータで見たとき）。ここにないカードは、だれかの手札か、もう出たカードです。</p>' + seenHTML(v.seen) +
      '<div class="rowbtns"><button class="btn primary" data-close data-focus>' + (acting ? '見た（ゲームにもどる）' : '閉じる') + '</button></div>', { onClose: function () { if (acting && myAbility() && myAbility().key === 'juanita') act({ t: 'juanita' }); } });
    veil.addEventListener('click', function (ev) { if (ev.target.closest('[data-close]')) closeSheet(); });
  }
  $('#myPlate').addEventListener('click', function (e) {
    if (e.target.closest('[data-act="seen"]') && app.v && app.v.seen) showSeen(false);
  });

  function handClick(id) {
    var v = app.v; if (!v || app.busy) return;
    var ab = myAbility();
    if (ab && ab.key === 'bendt') {
      var i = app.bendt.indexOf(id);
      if (i >= 0) app.bendt.splice(i, 1);
      else if (app.bendt.length < ab.need) app.bendt.push(id);
      else { app.bendt.shift(); app.bendt.push(id); }
      render();
      return;
    }
    if (!myTurnToPlay()) {
      if (v.phase === 'play' && v.turn !== v.me) toast(seatName(v.turn) + 'の番です');
      return;
    }
    var legal = E.legalCards(v.hand, v.trick.plays);
    if (legal.indexOf(id) < 0) {
      var ls = E.leadSuit(v.trick.plays);
      toast(E.SUIT[ls].color + 'を持っているので、' + E.SUIT[ls].color + 'か特殊カードを出してください');
      return;
    }
    if (app.sel === id && id !== E.TIGRESS) { app.sel = null; act({ t: 'play', id: id }); return; }
    app.sel = id;
    render();
  }
  $('#hand').addEventListener('click', function (e) { var c = e.target.closest('.card[data-id]'); if (c) handClick(+c.dataset.id); });
  $('#hand').addEventListener('keydown', function (e) {
    var c = e.target.closest('.card[data-id]');
    if (!c) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handClick(+c.dataset.id); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var n = e.key === 'ArrowRight' ? c.nextElementSibling : c.previousElementSibling; if (n) n.focus(); }
  });
  $('#rivals').addEventListener('click', function (e) {
    var p = e.target.closest('.plate[data-seat]');
    if (p && app.v) showPlayerSheet(+p.dataset.seat);
  });

  /* ---------------------------------------------------------------- playing back the log */
  function rectOf(el) { if (!el) return null; var r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }
  function plateRect(seat) {
    var v = app.v;
    if (seat === v.me) return rectOf($('#myPlate'));
    return rectOf($('.plate[data-seat="' + seat + '"]'));
  }
  function captureRects(fresh) {
    var out = {};
    fresh.forEach(function (e) {
      if (e.t !== 'play') return;
      if (app.v && e.seat === app.v.me) out['p' + e.k] = rectOf($('#hand .card[data-id="' + e.id + '"]'));
    });
    return out;
  }
  function flyCard(html, from, to, opts) {
    opts = opts || {};
    if (!from || !to || FAST || reduceMotion) return Promise.resolve();
    return new Promise(function (res) {
      var wrap = document.createElement('div');
      wrap.className = 'flyer';
      wrap.style.width = from.w + 'px'; wrap.style.height = from.h + 'px';
      wrap.style.transform = 'translate(' + from.x + 'px,' + from.y + 'px)';
      wrap.innerHTML = html;
      var cardEl = wrap.firstElementChild;
      if (cardEl) { cardEl.style.setProperty('--cw', from.w + 'px'); }
      $('#fly').appendChild(wrap);
      var dur = Math.round((opts.dur || 380) * speed);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          wrap.style.transition = 'transform ' + dur + 'ms cubic-bezier(.2,.8,.2,1), opacity ' + dur + 'ms ease';
          var sx = to.w / from.w, sy = to.h / from.h;
          wrap.style.transform = 'translate(' + to.x + 'px,' + to.y + 'px) scale(' + sx + ',' + sy + ')' + (opts.rot ? ' rotate(' + opts.rot + 'deg)' : '');
          if (opts.fade) wrap.style.opacity = '0';
        });
      });
      setTimeout(function () { wrap.remove(); res(); }, dur + 40);
    });
  }
  function popup(text, rect, color) {
    if (!rect || FAST) return;
    var el = document.createElement('div');
    el.className = 'pop'; el.textContent = text;
    el.style.left = (rect.x + rect.w / 2) + 'px'; el.style.top = (rect.y + 4) + 'px';
    if (color) el.style.color = color;
    $('#fly').appendChild(el);
    setTimeout(function () { el.remove(); }, 1300);
  }
  function stamp(words, small) {
    var host = $('#stamp'), chain = Promise.resolve();
    words.forEach(function (w, i) {
      chain = chain.then(function () {
        if (small) host.innerHTML = '<div class="word small">' + esc(w) + '</div>';
        else {
          // the words pile up into one shout: ヨー → ヨー ホー → ヨー ホー ホー！
          if (!i) host.innerHTML = '<div class="shout"></div>';
          var sh = host.firstElementChild, span = document.createElement('span');
          span.className = 'word'; span.textContent = w;
          sh.appendChild(span);
        }
        if (!small) { Sound.play('thump'); var a = $('#app'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); }
        return sleep(small ? 650 : (i === words.length - 1 ? 520 : 330));
      });
    });
    return chain.then(function () { host.innerHTML = ''; });
  }
  function verdictText(e) {
    if (e.kind === 'kraken') return 'クラーケン！ このトリックは海の底へ。次は' + seatName(e.next) + 'から';
    if (e.kind === 'void') return '白クジラ！ 数字カードがないので、トリックは流れました';
    var who = seatName(e.winner), c = e.plays[e.wi];
    var s = (e.winner === me() ? 'あなた' : who) + 'の勝ち（' + cardName(c.id, c.as) + '）';
    if (e.whale) s = '白クジラ！ 数字だけの勝負で' + s;
    var pts = e.bonus.reduce(function (t, b) { return t + b.pts; }, 0);
    if (pts) s += '　ボーナス候補+' + pts;
    if (e.alliances.length) s += '　略奪品で同盟';
    return s;
  }
  var ABILITY_DONE = {
    rosie: function (e) { return '次のトリックは' + seatName(e.to) + 'から'; },
    bendt: function (e) { return '山札から' + e.n + '枚引いて' + e.n + '枚捨てた'; },
    rascal: function (e) { return e.w ? e.w + '点を賭けた' : '賭けなかった'; },
    juanita: function () { return '配られなかったカードを見た'; },
    harry: function (e) { return e.d === 0 ? 'ビッドはそのまま（' + e.bid + '）' : 'ビッドを' + (e.d > 0 ? '1増やした' : '1減らした') + '（→' + e.bid + '）'; }
  };

  function playEntries(fresh, before, gen) {
    var chain = Promise.resolve();
    fresh.forEach(function (e) { chain = chain.then(function () { return gen === app.gen ? playEntry(e, before, gen) : null; }); });
    return chain;
  }
  function playEntry(e, before, gen) {
    var v = app.v;
    function alive() { return gen === app.gen && disp; }
    if (e.t === 'deal') {
      disp.round = e.round; disp.cards = e.cards;
      disp.bids = v.players.map(function () { return null; }); disp.hasBid = v.players.map(function () { return false; });
      disp.revealed = false; disp.won = v.players.map(function () { return 0; }); disp.ghostWon = 0;
      disp.trick = []; disp.win = -1; disp.verdict = ''; disp.hand = null;
      bidPick = { n: null, cannon: false };
      render();
      var h = $('#hand'); h.classList.remove('dealing'); void h.offsetWidth; h.classList.add('dealing');
      $$('#hand .card').forEach(function (c, i) { c.style.animationDelay = (i * 45) + 'ms'; });
      Sound.play('card');
      var total = v.schedule.length;
      return stamp([total > 1 ? '第' + (e.round + 1) + 'ラウンド' : '1ラウンド勝負'], true).then(function () { h.classList.remove('dealing'); });
    }
    if (e.t === 'bidMade') { disp.hasBid[e.seat] = true; if (e.seat === v.me) disp.bids[e.seat] = v.players[v.me].bid; render(); return sleep(60); }
    if (e.t === 'reveal') {
      return stamp(['ヨー', 'ホー', 'ホー！']).then(function () {
        if (!alive()) return;
        disp.bids = e.bids.slice(); disp.revealed = true;
        render();
        $$('.plate .bid').forEach(function (b) { b.animate && b.animate([{ transform: 'scale(1.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: FAST ? 1 : 360, easing: 'cubic-bezier(.2,1.6,.4,1)' }); });
        return sleep(500);
      });
    }
    if (e.t === 'play') {
      disp.verdict = '';
      disp.trick.push({ seat: e.seat, id: e.id, as: e.as });
      renderTable(v); renderRivals(v);
      var slots = $$('#trick .slot'), slot = slots[slots.length - 1];
      var target = slot && rectOf(slot.querySelector('.card'));
      var from = before['p' + e.k] || plateRect(e.seat) || (target && { x: target.x, y: target.y - 80, w: target.w, h: target.h });
      if (from && target && !before['p' + e.k]) from = { x: from.x + from.w / 2 - target.w * 0.3, y: from.y + from.h / 2 - target.h * 0.3, w: target.w * 0.6, h: target.h * 0.6 };
      if (slot) slot.style.visibility = 'hidden';
      Sound.play('card');
      return flyCard(cardHTML(e.id, { as: e.as }), from, target).then(function () { if (!alive()) return; if (slot) slot.style.visibility = ''; return sleep(e.seat === v.me ? 120 : 260); });
    }
    if (e.t === 'trick') {
      disp.win = e.kind === 'win' ? e.wi : -1;
      disp.verdict = verdictText(e);
      renderTable(v);
      if (e.kind === 'kraken') Sound.play('kraken'); else if (e.kind === 'void' || e.whale) Sound.play('whale'); else Sound.play(e.winner === v.me ? 'win' : 'lose');
      return sleep(e.kind === 'win' ? 1050 : 1500).then(function () {
        if (!alive()) return;
        var slots = $$('#trick .slot');
        var target = e.kind === 'win' ? plateRect(e.winner) : null;
        var pts = e.bonus.reduce(function (t, b) { return t + b.pts; }, 0);
        if (pts && e.kind === 'win') { popup('+' + pts + '?', target); Sound.play('coin'); }
        var flights = slots.map(function (s, i) {
          var c = s.querySelector('.card'), r = rectOf(c);
          if (!r) return Promise.resolve();
          var to = target ? { x: target.x + target.w / 2 - r.w * 0.2, y: target.y + target.h / 2 - r.h * 0.2, w: r.w * 0.4, h: r.h * 0.4 } : { x: r.x, y: r.y + 70, w: r.w * 0.8, h: r.h * 0.8 };
          var html = c.outerHTML;
          s.style.visibility = 'hidden';
          return flyCard(html, r, to, { fade: true, dur: 420 + i * 30, rot: target ? 0 : (i % 2 ? 9 : -9) });
        });
        return Promise.all(flights);
      }).then(function () {
        if (!alive()) return;
        disp.trick = []; disp.win = -1;
        if (e.kind === 'win') { if (e.winner === v.G) disp.ghostWon++; else disp.won[e.winner]++; disp.flash = e.winner; }
        render();
        disp.flash = -1;
        return sleep(140);
      });
    }
    if (e.t === 'ability') {
      var nm = PIRATE_INFO[e.key].full;
      if (e.seat !== v.me) toast(seatName(e.seat) + 'が' + nm + 'の力を使います', 2200);
      Sound.play('coin');
      return sleep(e.seat === v.me ? 200 : 700);
    }
    if (e.t === 'abilityDone') {
      if (e.seat !== v.me) toast(seatName(e.seat) + '：' + ABILITY_DONE[e.key](e), 2600);
      return sleep(e.seat === v.me ? 100 : 500);
    }
    if (e.t === 'round') {
      disp.scores = e.results.map(function (r) { return r.score; });
      disp.verdict = '';
      render();
      Sound.play('bell');
      return showRoundSummary(e);
    }
    return Promise.resolve();
  }

  /* ---------------------------------------------------------------- sheets: round, scores, players, results */
  var BONUS_JA = { '14': function (b) { return E.SUIT[E.suitOf(b.id)].color + 'の14'; }, mermaid: function () { return 'マーメイドを捕獲'; }, pirate: function () { return '海賊を捕獲'; }, king: function () { return 'スカルキングを捕獲'; } };
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0'; }
  function resultRows(v, rec) {
    var order = rec.results.slice().sort(function (a, b) { return b.total - a.total || a.seat - b.seat; });
    return order.map(function (r) {
      var det = ['ビッド' + r.bid + (r.harry ? '（ハリー' + (r.harry > 0 ? '+' : '') + r.harry + '）' : '') + (r.cannon ? '（大砲）' : '') + '→取った' + r.won, '基本 ' + signed(r.base)];
      if (r.bonusList.length) det.push('ボーナス ' + signed(r.bonus) + '（' + r.bonusList.map(function (b) { return BONUS_JA[b.k](b) + '+' + b.pts; }).join('、') + (r.hit ? '' : '：外れたので無効') + '）');
      if (r.loot) det.push('略奪品 ' + signed(r.loot));
      if (r.wager) det.push('賭け ' + signed(r.wagerPts));
      return '<div class="res-row' + (r.hit ? ' hit' : '') + '"><span class="av" style="--avc:' + avColor(r.seat) + '">' + esc(avChar(r.seat)) + '</span><span class="nm">' + esc(seatName(r.seat)) + '</span>' +
        '<span class="tot ' + (r.total >= 0 ? 'pos' : 'neg') + '">' + signed(r.total) + '<small>合計 ' + r.score + '点</small></span><div class="det">' + det.map(esc).join('<span aria-hidden="true">／</span>') + '</div></div>';
    }).join('');
  }
  function showRoundSummary(e) {
    var v = app.v, last = e.round >= v.schedule.length - 1;
    var h = '<h3>' + (v.schedule.length > 1 ? '第' + (e.round + 1) + 'ラウンドの結果' : '結果') + '</h3><p class="note">手札' + e.cards + '枚。' + (v.opts.scoring === 'rascal' ? 'ラスカル式：ぴったりで' + (10 * e.cards) + '点、1ずれで' + (5 * e.cards) + '点。' : '') + (v.ghost ? '白ひげの幽霊は' + e.ghostWon + 'トリック取りました。' : '') + '</p>' +
      resultRows(v, e) + '<div class="rowbtns"><button class="btn primary" data-next data-focus>' + (last ? '最終結果へ' : '次のラウンドへ') + '</button><button class="btn" data-scores>得点表</button></div>';
    return new Promise(function (res) {
      var veil = openSheet(h, { sticky: true, onClose: function () { res(); } });
      veil.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-next]')) closeSheet();
        else if (ev.target.closest('[data-scores]')) showScores();
      });
    });
  }
  function showScores() {
    var v = app.v; if (!v) return;
    var seats = []; for (var i = 0; i < v.n; i++) seats.push(i);
    var head = '<tr><th>ラウンド</th>' + seats.map(function (s) { return '<th>' + esc(seatName(s)) + '</th>'; }).join('') + '</tr>';
    var body = v.history.map(function (h) {
      return '<tr><td>' + (h.round + 1) + '（' + h.cards + '枚）</td>' + h.results.map(function (r) {
        return '<td><span style="color:var(--mist)">' + r.bid + '/' + r.won + '</span> <span class="' + (r.total >= 0 ? 'pos' : 'neg') + '">' + signed(r.total) + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    var foot = '<tr><td>合計</td>' + seats.map(function (s) { return '<td>' + v.players[s].score + '</td>'; }).join('') + '</tr>';
    var cur = v.over ? '' : '<p class="note">このラウンド：' + seats.map(function (s) { var p = v.players[s]; return esc(seatName(s)) + ' ビッド' + (p.bid == null ? '？' : p.bid) + '・取った' + p.won; }).join('、') + '</p>';
    openSheet('<h3>得点表</h3><p class="note">ビッド/取った数と、そのラウンドの点数</p><div class="tablewrap"><table><thead>' + head + '</thead><tbody>' + (body || '<tr><td colspan="' + (v.n + 1) + '">まだ記録はありません</td></tr>') + '</tbody><tfoot>' + foot + '</tfoot></table></div>' + cur +
      '<div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  }
  function showPlayerSheet(seat) {
    var v = app.v;
    if (seat === v.G) {
      openSheet('<h3>白ひげの幽霊</h3><p>2人で遊ぶときの3人目。ビッドも得点もしません。毎トリック2番目に、自分の山のいちばん上のカードをそのまま出します（スートに従わない。ティグレスは逃走）。勝ったトリックは次のリードになります。</p><p class="note">このラウンドに取ったトリック：' + disp.ghostWon + '</p><div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>')
        .addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
      return;
    }
    var p = v.players[seat], info = ctl && ctl.seatInfo ? ctl.seatInfo(seat) : null;
    var kind = info ? (info.kind === 'cpu' ? 'CPU' + (info.level ? '（' + LEVEL_JA[info.level] + '）' : '') : info.kind === 'human' ? '' : 'プレイヤー') : '';
    var bonus = p.bonus.length ? p.bonus.map(function (b) { return BONUS_JA[b.k](b) + ' +' + b.pts; }).join('、') : 'まだありません';
    var allies = v.alliances.filter(function (a) { return a.a === seat || a.b === seat; }).map(function (a) { return seatName(a.a === seat ? a.b : a.a); });
    openSheet('<h3>' + esc(seatName(seat)) + '</h3>' + (kind ? '<p class="note">' + esc(kind) + '</p>' : '') +
      '<p>ビッド：' + (disp.revealed && p.bid != null ? p.bid : p.hasBid ? '決めた（まだ非公開）' : 'まだ') + '　取った：' + p.won + '　得点：' + p.score + '</p>' +
      '<p>ためているボーナス（ビッドが当たれば加算）：' + esc(bonus) + '</p>' +
      (allies.length ? '<p>略奪品の同盟：' + esc(allies.join('、')) + '</p>' : '') +
      (p.wager ? '<p>ラスカルの賭け：' + p.wager + '点</p>' : '') +
      '<div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  }
  function showLastTrick() {
    var v = app.v, t = v && v.lastTrick;
    var h = '<h3>前のトリック</h3>';
    if (!t) h += '<p class="note">このラウンドはまだトリックがありません。</p>';
    else h += '<div class="cardrow">' + t.plays.map(function (p, i) { return '<div class="slot' + (i === t.wi ? ' win' : '') + '" style="--trick-w:56px">' + cardHTML(p.id, { as: p.as }) + '<span class="who">' + esc(seatName(p.seat)) + '</span></div>'; }).join('') + '</div><p>' + esc(verdictText(t)) + '</p>';
    if (v && v.tricks.length) {
      h += '<h4>このラウンドのトリック</h4><ol class="loglist">' + v.tricks.map(function (t2, i) {
        var w = t2.kind === 'win' ? seatName(t2.winner) + 'の勝ち' : t2.kind === 'kraken' ? 'クラーケンで消滅' : '白クジラで流れた';
        return '<li>' + (i + 1) + '：' + esc(w) + '（' + t2.plays.map(function (p) { return esc(seatName(p.seat)) + ' ' + esc(cardName(p.id, p.as)); }).join('、') + '）</li>';
      }).join('') + '</ol>';
    }
    openSheet(h + '<div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeSheet(); });
  }
  function showResult(v) {
    var rows = v.ranking.map(function (r) {
      return '<div class="pl' + (r.place === 1 ? ' first' : '') + '"><span class="place">' + r.place + '位</span><span class="av" style="--avc:' + avColor(r.seat) + '">' + esc(avChar(r.seat)) + '</span><span class="nm">' + esc(seatName(r.seat)) + '</span><span class="sc">' + r.score + '</span></div>';
    }).join('');
    var mine = v.ranking.filter(function (r) { return r.seat === v.me; })[0];
    var title = mine && mine.place === 1 ? 'あなたがスカルキング！' : '勝者は' + seatName(v.ranking[0].seat);
    var canAgain = ctl && (!ctl.online || ctl.isHost);
    Sound.play('bell');
    var veil = openSheet('<h3>' + esc(title) + '</h3><div class="podium">' + rows + '</div>' +
      '<div class="rowbtns">' + (canAgain ? '<button class="btn primary" data-again data-focus>もう一度</button>' : '') + '<button class="btn" data-scores>得点表</button><button class="btn" data-title>タイトルへ</button></div>' +
      (ctl && ctl.online && !ctl.isHost ? '<p class="note">部屋をつくった人が「もう一度」を押すと、部屋にもどります。</p>' : ''), { sticky: true });
    veil.addEventListener('click', function (e) {
      if (e.target.closest('[data-again]')) { closeSheet(true); ctl.again(); }
      else if (e.target.closest('[data-scores]')) showScores();
      else if (e.target.closest('[data-title]')) { closeSheet(true); goTitle(true); }
    });
  }

  /* ---------------------------------------------------------------- menu */
  $('#btnScore').addEventListener('click', showScores);
  $('#btnMenu').addEventListener('click', function () {
    var v = app.v;
    var veil = openSheet('<h3>メニュー</h3><div class="menu-list">' +
      '<button class="btn" data-m="scores">得点表</button>' +
      '<button class="btn" data-m="last">前のトリック</button>' +
      '<button class="btn" data-m="rules">あそびかた</button>' +
      '<button class="btn" data-m="cards">カード一覧</button>' +
      '<label class="toggle"><input type="checkbox" id="mSound"' + (Sound.on ? ' checked' : '') + '><span><b>音を出す</b><small>カードの音や「ヨー・ホー・ホー！」の太鼓</small></span></label>' +
      '<label class="toggle"><input type="checkbox" id="mHints"' + (app.hints ? ' checked' : '') + '><span><b>ビッドの目安を表示</b><small>手札の強さから、取れそうな数のおおよその見込みを出します</small></span></label>' +
      '<label class="toggle"><input type="checkbox" id="mQuick"' + (speed < 1 ? ' checked' : '') + '><span><b>すばやく進める</b><small>カードの動きとCPUの待ち時間を半分にします</small></span></label>' +
      '<button class="btn" data-m="title">' + (ctl && ctl.online ? (ctl.isHost ? '部屋を閉じてタイトルへ' : '部屋を出てタイトルへ') : 'タイトルへ（続きはあとで再開できます）') + '</button>' +
      '<button class="btn ghost" data-m="close" data-focus>閉じる</button></div>');
    veil.addEventListener('change', function (e) {
      if (e.target.id === 'mSound') Sound.set(e.target.checked);
      if (e.target.id === 'mHints') { app.hints = e.target.checked; store.set('hints', app.hints); render(); }
      if (e.target.id === 'mQuick') { speed = e.target.checked ? 0.5 : 1; store.set('quick', e.target.checked); }
    });
    veil.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var m = b.dataset.m;
      if (m === 'close') closeSheet();
      else if (m === 'scores') { closeSheet(); showScores(); }
      else if (m === 'last') { closeSheet(); showLastTrick(); }
      else if (m === 'rules') { closeSheet(); openRules('flow'); }
      else if (m === 'cards') { closeSheet(); openRules('cards'); }
      else if (m === 'title') {
        if (ctl && ctl.online && !v.over) {
          closeSheet();
          openSheet('<h3>本当に抜けますか？</h3><p>' + (ctl.isHost ? 'あなたが部屋を閉じると、全員のゲームが終わります。' : '抜けたあとは、あなたの番をCPUが代わりに進めます。') + '</p><div class="rowbtns"><button class="btn" data-no data-focus>もどる</button><button class="btn primary" data-yes>抜ける</button></div>')
            .addEventListener('click', function (ev) { if (ev.target.closest('[data-no]')) closeSheet(); if (ev.target.closest('[data-yes]')) { closeSheet(true); goTitle(true); } });
        } else { closeSheet(true); goTitle(true); }
      }
    });
  });

  /* ---------------------------------------------------------------- rules and cards */
  var RANK_ROWS = [
    [[67], 'スカルキング', '海賊（ティグレスも）に勝つ。負けるのはマーメイドだけ'],
    [[61, 66], '海賊・ティグレス（海賊）', '数字カードとマーメイドに勝つ。海賊どうしは先に出した方'],
    [[68], 'マーメイド', '数字カードとスカルキングに勝つ。海賊には負ける'],
    [[55], '黒（海賊旗）', '切り札。ほかの色の数字に勝つ。黒どうしは大きい方'],
    [[13, 27, 41], '黄・紫・緑', 'リードされた色の中で大きい方。ほかの色は勝てない'],
    [[56, 66], '逃走・ティグレス（逃走）', '必ず負ける。全員が逃走なら最初に出した人']
  ];
  function rulesHTML(tab) {
    if (tab === 'flow') return '<div class="rules">' +
      '<h4>目的</h4><p>毎ラウンド、自分が取れるトリックの数をぴったり予想（ビッド）する。全ラウンドの合計点がいちばん高い人の勝ち。</p>' +
      '<h4>1ラウンドの流れ</h4><ol><li>第1ラウンドは1枚、第2ラウンドは2枚…と、ラウンドの数だけ手札が配られる（全10ラウンド）。</li>' +
      '<li>手札を見て、全員がいっせいにビッド。「ヨー・ホー・ホー！」の合図で公開する。あとから変えられない。</li>' +
      '<li>最初の人（ラウンドごとに左へ移る）から順に1枚ずつ出す。いちばん強いカードを出した人がトリックを取り、次のリードをする。</li>' +
      '<li>手札がなくなったら得点計算。</li></ol>' +
      '<h4>出せるカード</h4><ul><li>数字カードがリードされたら、同じ色を持っていれば必ずその色を出す（黒がリードされたら黒）。</li>' +
      '<li>特殊カード（逃走・海賊・ティグレス・スカルキング・マーメイドなど）は、いつでも出してよい。</li>' +
      '<li>逃走がリードされたら、あとから最初に出された数字カードが色を決める。</li>' +
      '<li>海賊・スカルキング・マーメイド（追加ルールのクラーケン・白クジラも）がリードされたら、そのトリックは色の指定なし。</li></ul>' +
      '<h4>2人のとき</h4><p>「白ひげの幽霊」が3人目として加わる。幽霊はビッドも得点もせず、毎トリック2番目に、裏向きの山のいちばん上を出す（色に従わない。ティグレスは逃走）。幽霊が勝ったら次は幽霊からで、2番目はそのラウンドの最初の人。略奪品は使わない。</p>' +
      '<h4>7〜8人のとき</h4><p>カードが足りなくなる最後のほうのラウンドは、配れる最大の枚数をくり返す（8人なら第9・第10ラウンドも8枚）。</p></div>';
    if (tab === 'rank') return '<div class="rules"><p>強い順。特殊カードどうしは「マーメイド＞スカルキング＞海賊＞マーメイド」の三すくみ。</p>' +
      RANK_ROWS.map(function (r) { return '<div class="rank"><div class="cardrow">' + r[0].map(function (id, i) { return cardHTML(id, { as: id === 66 ? (r[1].indexOf('逃走') >= 0 ? 'escape' : 'pirate') : undefined }); }).join('') + '</div><div><b>' + r[1] + '</b><br><span class="note">' + r[2] + '</span></div></div>'; }).join('') +
      '<h4>同じトリックに出たとき</h4><ul><li>海賊・スカルキング・マーメイドがそろったら、出した順に関係なくマーメイドの勝ち。</li><li>マーメイドが2枚なら先に出した方。</li><li>ティグレスは出すときに「海賊」か「逃走」かを決める。</li></ul></div>';
    if (tab === 'score') return '<div class="rules">' +
      '<h4>スカルキング式（ふつう）</h4><ul><li>ビッド1以上でぴったり：ビッド×20点</li><li>ビッド1以上で外れ：ずれた数×10点のマイナス（取りすぎても足りなくても）</li><li>ビッド0でぴったり（1トリックも取らない）：手札の枚数×10点</li><li>ビッド0で1トリックでも取った：手札の枚数×10点のマイナス</li></ul>' +
      '<h4>ボーナス（ビッドがぴったりのときだけ）</h4><ul><li>取ったトリックの中の14：黄・紫・緑は1枚10点、黒は20点（だれが出した14でも）</li><li>海賊でマーメイドを取った：1枚20点</li><li>スカルキングで海賊を取った：1枚30点（海賊として出したティグレスも）</li><li>マーメイドでスカルキングを取った：40点</li><li>略奪品の同盟：2人ともぴったりなら、それぞれ20点</li></ul>' +
      '<h4>ラスカル式（選べる得点）</h4><ul><li>ビッドの大きさに関係なく、全員が同じ「手札の枚数×10点」をねらう。</li><li>ぴったり：全部。1ずれ：半分。2以上ずれ：0点。ボーナスも同じ割合。</li><li>大砲と散弾（選べる）：ビッドと一緒に選ぶ。大砲はぴったりなら手札の枚数×15点、1でもずれたら0点（ボーナスもなし）。散弾はふつうのラスカル式。</li><li>略奪品とラスカルの賭けは、ぴったりのときだけ。</li></ul></div>';
    if (tab === 'extra') return '<div class="rules">' +
      '<h4>クラーケン</h4><p>出たトリックは、だれのものにもならず捨てられる。次のリードは「クラーケンがなければ勝っていた人」。</p>' +
      '<h4>白クジラ</h4><p>このトリックの特殊カードはすべて力を失う（逃走あつかい）。色も関係なくなり、いちばん大きい数字の勝ち（同じなら先に出した方）。数字カードがなければトリックは流れ、白クジラを出した人が次のリード。</p>' +
      '<p>クラーケンと白クジラが同じトリックに出たら、あとから出た方だけが効く。先の方は逃走あつかい。途中で出た白クジラは色の指定を消さない。</p>' +
      '<h4>略奪品（2枚）</h4><p>逃走と同じように扱う。出した人と、そのトリックを取った人が同盟。ラウンドの終わりに2人ともビッドぴったりなら、それぞれ20点。略奪品の人がそのまま勝った（ほかが逃走だけ）なら同盟はなし。</p>' +
      '<h4>海賊の能力</h4><p>海賊でトリックに<b>勝った</b>ときだけ、その海賊の力をすぐ使う（取っただけでは使えない）。最後のトリックで使えるのはハリーだけ。</p><ul>' +
      E.PIRATES.map(function (p) { return '<li><b>' + p.full + '</b>：' + p.ab + (p.key === 'rascal' ? '。ビッドが当たれば獲得、外れれば失う' : p.key === 'juanita' ? '（このラウンドの間はいつでも見直せます）' : p.key === 'harry' ? '。最後のトリックのあとでも使える' : '') + '</li>'; }).join('') + '</ul>' +
      '<h4>ラウンドの進め方</h4><ul>' + E.SCHEDULE_KEYS.map(function (k) { var s = E.SCHEDULES[k]; return '<li><b>' + s.ja + '</b>：' + s.note + '</li>'; }).join('') + '</ul></div>';
    if (tab === 'cards') {
      var items = [
        [0, '宝箱（黄）1〜14', '数字カード'], [14, '地図（紫）1〜14', '数字カード'], [28, 'オウム（緑）1〜14', '数字カード'], [42, '海賊旗（黒）1〜14', '切り札。ほかの色に勝つ'],
        [56, '逃走 ×5', '必ず負ける。白旗'], [61, '海賊 ×5', 'ロージー、ベント、ラスカル、フアニータ、ハリー'], [66, 'ティグレス ×1', '出すときに海賊か逃走か選ぶ'],
        [67, 'スカルキング ×1', '海賊に勝つ。マーメイドに負ける'], [68, 'マーメイド ×2', 'スカルキングに勝つ。海賊に負ける'],
        [70, 'クラーケン（追加）', 'トリックを海の底へ'], [71, '白クジラ（追加）', '数字だけの勝負に'], [72, '略奪品 ×2（追加）', '取った人と同盟']
      ];
      return '<p class="note">基本は70枚。追加ルールでクラーケン・白クジラ・略奪品2枚を足すと74枚。</p><div class="cardlist">' + items.map(function (it) { return '<div class="item">' + cardHTML(it[0], { as: it[0] === 66 ? 'pirate' : undefined }) + '<div><b>' + it[1] + '</b><small>' + it[2] + '</small></div></div>'; }).join('') + '</div>';
    }
    return '';
  }
  function openRules(tab) {
    var tabs = [['flow', 'あそびかた'], ['rank', 'カードの強さ'], ['score', '得点'], ['extra', '追加ルール'], ['cards', 'カード一覧']];
    var h = '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join('') + '</div><div id="rulesBody"></div><div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>';
    var veil = openSheet(h);
    function show(t) { $('#rulesBody', veil).innerHTML = rulesHTML(t); $$('.tabs button', veil).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t); }); }
    show(tab);
    veil.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab);
      if (e.target.closest('[data-close]')) closeSheet();
    });
  }

  /* ================================================================ options UI (CPU setup and lobby) */
  function optsHTML(o, n, editable) {
    o = E.normOpts(o, n);
    if (!editable) {
      var chips = [E.SCHEDULES[o.schedule].ja + '（' + E.SCHEDULES[o.schedule].note + '）'];
      if (o.kraken) chips.push('クラーケン'); if (o.whale) chips.push('白クジラ'); if (o.loot) chips.push('略奪品'); if (o.abilities) chips.push('海賊の能力');
      chips.push(o.scoring === 'rascal' ? (o.cannon ? 'ラスカル式（大砲と散弾）' : 'ラスカル式') : 'スカルキング式');
      return '<div class="field"><span>ルール</span><div class="optsummary">' + chips.map(function (c) { return '<span class="rchip">' + esc(c) + '</span>'; }).join('') + '</div></div>';
    }
    function tog(key, title, small, off) {
      return '<label class="toggle' + (off ? ' off' : '') + '"><input type="checkbox" data-opt="' + key + '"' + (o[key] ? ' checked' : '') + (off ? ' disabled' : '') + '><span><b>' + title + '</b><small>' + small + '</small></span></label>';
    }
    return '<div class="field"><span>ラウンドの進め方</span><select class="input" data-opt="schedule">' + E.SCHEDULE_KEYS.map(function (k) { var s = E.SCHEDULES[k]; return '<option value="' + k + '"' + (o.schedule === k ? ' selected' : '') + '>' + s.ja + '（' + s.note + '）</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span>追加ルール</span><div class="optgrid">' +
      tog('kraken', 'クラーケン', '出たトリックはだれのものにもならない') +
      tog('whale', '白クジラ', '特殊カードが力を失い、数字だけの勝負') +
      tog('loot', '略奪品', '取った人と同盟。2人とも的中で+20点ずつ' + (n === 2 ? '（2人では使えません）' : ''), n === 2) +
      tog('abilities', '海賊の能力', '海賊でトリックに勝つと、その海賊の力を使える') + '</div></div>' +
      '<div class="field"><span>得点のつけ方</span><div class="seg" data-optseg="scoring"><button data-v="classic" aria-pressed="' + (o.scoring === 'classic') + '">スカルキング式</button><button data-v="rascal" aria-pressed="' + (o.scoring === 'rascal') + '">ラスカル式</button></div>' +
      '<p class="note">' + (o.scoring === 'rascal' ? '全員が同じ点数（手札×10点）をねらう。ぴったりで全部、1ずれで半分。' : 'ぴったりでビッド×20点。外れるとずれ×10点のマイナス。ビッド0は手札×10点。') + '</p></div>' +
      (o.scoring === 'rascal' ? tog('cannon', '大砲と散弾', 'ビッドと一緒に選ぶ。大砲はぴったりなら手札×15点、ずれたら0点') : '');
  }
  function bindOpts(container, get, set) {
    container.addEventListener('change', function (e) {
      var k = e.target.dataset.opt; if (!k) return;
      var o = Object.assign({}, get());
      o[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      set(o);
    });
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-optseg] button'); if (!b) return;
      var o = Object.assign({}, get());
      o[b.parentNode.dataset.optseg] = b.dataset.v;
      set(o);
    });
  }

  /* ---------------- CPU setup */
  var cpuCfg = { count: store.get('count', 4), level: store.get('level', 'normal'), opts: store.get('opts', {}) };
  function syncCpuSetup() {
    $$('#segCount button').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.v === cpuCfg.count); });
    $$('#segLevel button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === cpuCfg.level); });
    var n = cpuCfg.count;
    $('#cpuCountNote').textContent = n === 2 ? '2人のときは「白ひげの幽霊」が3人目として加わります（ビッドも得点もしません）。' : n === 8 ? '8人のときは、カードが足りない最後のラウンドも8枚ずつ配ります。' : n >= 6 ? 'にぎやかな人数です。追加ルールを入れると、さらに荒れます。' : '';
    $('#cpuOpts').innerHTML = optsHTML(cpuCfg.opts, n, true);
  }
  bindOpts($('#cpuOpts'), function () { return cpuCfg.opts; }, function (o) { cpuCfg.opts = o; store.set('opts', o); syncCpuSetup(); });
  $('#segCount').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cpuCfg.count = +b.dataset.v; store.set('count', cpuCfg.count); syncCpuSetup(); });
  $('#segLevel').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cpuCfg.level = b.dataset.v; store.set('level', cpuCfg.level); syncCpuSetup(); });
  $('#cpuStart').addEventListener('click', function () { startLocal({ count: cpuCfg.count, level: cpuCfg.level, opts: E.normOpts(cpuCfg.opts, cpuCfg.count) }); });

  function resetGameView() { app.gen++; app.v = null; app.sel = null; app.bendt = []; app.pending = false; app.busy = false; app.lastK = -1; app.resultShown = false; viewQueue = []; disp = null; bidPick = { n: null, cannon: false }; $('#stamp').innerHTML = ''; $('#fly').innerHTML = ''; }
  function startLocal(cfg, saved) {
    if (ctl) ctl.destroy();
    resetGameView();
    closeSheet(true);
    app.freshGame = !saved;
    ctl = new LocalCtl(cfg, saved);
    showScreen(null);
    ctl.start();
  }

  /* ---------------- online */
  function onlineError(msg) { var e = $('#onErr'); e.textContent = msg; e.hidden = false; }
  function readName() {
    var n = NET.cleanName($('#onName').value);
    if (!n) { onlineError('名前を入れてください'); $('#onName').focus(); return null; }
    store.set('name', n);
    return n;
  }
  $('#onCreate').addEventListener('click', function () {
    var name = readName(); if (!name) return;
    $('#onErr').hidden = true;
    var h = new HostCtl(name);
    if (ctl) ctl.destroy();
    ctl = h;
    $('#onCreate').disabled = true;
    h.open().then(function () {
      $('#onCreate').disabled = false;
      setRoomParam(h.code);
      showScreen('scrLobby');
      h.syncLobby();
    }).catch(function (e) {
      $('#onCreate').disabled = false; ctl = null;
      onlineError(e && e.code === 'lib' ? 'オンライン対戦の部品を読み込めませんでした。通信状況を確かめてください。' : '部屋をつくれませんでした。少し待ってからもう一度ためしてください。');
    });
  });
  function joinRoom(code) {
    code = NET.cleanCode(code);
    if (code.length !== 4) { onlineError('部屋コードは4文字です'); return; }
    var name = readName(); if (!name) return;
    $('#onErr').hidden = true;
    if (ctl) ctl.destroy();
    var g = new GuestCtl(name, code);
    ctl = g;
    $('#onJoin').disabled = true;
    g.join().then(function () { $('#onJoin').disabled = false; }).catch(function (e) {
      $('#onJoin').disabled = false; ctl = null;
      onlineError(e && e.code === 'notfound' ? 'その部屋は見つかりませんでした。コードを確かめてください。' : e && e.code === 'lib' ? 'オンライン対戦の部品を読み込めませんでした。' : '部屋に入れませんでした。');
    });
  }
  $('#onJoin').addEventListener('click', function () { joinRoom($('#onCode').value); });
  $('#onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom($('#onCode').value); });

  function renderLobby(info, isHost) {
    $('#lobCode').textContent = info.code;
    $('#lobNote').textContent = isHost ? 'このコードか招待リンクを友だちに送ってください。足りない席にはCPUを入れられます（2〜8人）。' : '部屋をつくった人がはじめるのを待っています。';
    $('#lobSeats').innerHTML = info.seats.map(function (s, i) {
      var kind = s.kind === 'host' ? '部屋の主' : s.kind === 'cpu' ? 'CPU（' + LEVEL_JA[info.level] + '）' : s.away ? '接続待ち' : 'プレイヤー';
      return '<div class="seatrow"><span class="av" style="--avc:' + AV[i % AV.length] + '">' + esc(Array.from(s.name)[0] || '?') + '</span><span class="nm">' + esc(s.name) + (i === info.you ? '（あなた）' : '') + '</span><span class="kind">' + kind + '</span>' +
        (isHost && s.kind !== 'host' ? '<button data-rm="' + i + '">外す</button>' : '') + '</div>';
    }).join('');
    $('#lobHostBtns').hidden = !isHost;
    $('#lobLevelRow').hidden = !isHost || !info.seats.some(function (s) { return s.kind === 'cpu'; });
    $$('#lobLevel button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === info.level); });
    $('#lobAddCpu').disabled = info.seats.length >= 8;
    $('#lobOpts').innerHTML = optsHTML(info.opts, info.seats.length, isHost);
    $('#lobStart').hidden = !isHost;
    $('#lobStart').disabled = info.seats.length < 2;
    $('#lobStart').textContent = info.seats.length < 2 ? 'あと1人以上必要です' : info.seats.length + '人ではじめる';
  }
  bindOpts($('#lobOpts'), function () { return ctl && ctl.isHost ? ctl.opts : {}; }, function (o) { if (ctl && ctl.isHost && !ctl.table) { ctl.opts = o; ctl.syncLobby(); } });
  $('#lobSeats').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b && ctl && ctl.isHost) ctl.removeSeat(+b.dataset.rm); });
  $('#lobAddCpu').addEventListener('click', function () { if (ctl && ctl.isHost) ctl.addCpu(); });
  $('#lobLevel').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && ctl && ctl.isHost) { ctl.level = b.dataset.v; ctl.syncLobby(); } });
  $('#lobInvite').addEventListener('click', function () {
    if (!ctl || !ctl.code) return;
    var url = location.origin + location.pathname + '?room=' + ctl.code;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('招待リンクをコピーしました'); }, function () { toast(url, 5000); });
    else toast(url, 5000);
  });
  $('#lobStart').addEventListener('click', function () { if (ctl && ctl.isHost) ctl.start(); });
  $('#lobLeave').addEventListener('click', function () { goTitle(true); });

  function setRoomParam(code) {
    try {
      var u = new URL(location.href);
      if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
      history.replaceState(null, '', u.pathname + u.search);
    } catch (e) {}
  }
  function goTitle(destroy) {
    if (destroy && ctl) { ctl.destroy(); ctl = null; }
    setRoomParam(null);
    resetGameView();
    closeSheet(true);
    refreshResume();
    showScreen('scrTitle');
  }
  window.addEventListener('beforeunload', function (e) {
    if (ctl && ctl.online && ctl.isHost && ctl.table && !ctl.table.st.over) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================================================================ title */
  function drawHeroFan() {
    var ids = [13, 25, 37, 55, 61, 67, 68], h = '', step = Math.min(30, Math.max(18, (window.innerWidth - 120) / 9));
    ids.forEach(function (id, i) {
      var ang = (i - 3) * 9, dx = (i - 3) * step;
      h += cardHTML(id, { style: 'transform:translateX(calc(-50% + ' + dx + 'px)) rotate(' + ang + 'deg);z-index:' + (i + 1) });
    });
    $('#heroFan').innerHTML = h;
  }
  function refreshResume() {
    var s = store.get('save', null), b = $('#goResume');
    var ok = s && s.st && !s.st.over && s.st.v === 1 && s.cfg;
    b.hidden = !ok;
    if (ok) b.textContent = '続きから（' + (s.st.schedule.length > 1 ? '第' + (s.st.round + 1) + 'ラウンド、' : '') + s.st.n + '人）';
  }
  $('#goResume').addEventListener('click', function () {
    var s = store.get('save', null);
    if (!s || !s.st || s.st.over) { refreshResume(); return; }
    startLocal(s.cfg, s.st);
  });
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { showScreen('scrTitle'); }); });
  $('#goCpu').addEventListener('click', function () { showScreen('scrCpu'); syncCpuSetup(); });
  $('#goOnline').addEventListener('click', function () { showScreen('scrOnline'); $('#onName').value = store.get('name', ''); $('#onErr').hidden = true; });
  $('#goRules').addEventListener('click', function () { openRules('flow'); });
  $('#goCards').addEventListener('click', function () { openRules('cards'); });

  /* ================================================================ boot */
  drawWaves();
  drawHeroFan();
  refreshResume();
  var room = NET.cleanCode(params.get('room') || '');
  if (room.length === 4) { showScreen('scrOnline'); $('#onCode').value = room; $('#onName').value = store.get('name', ''); }
  else showScreen('scrTitle');
  $('#loader').remove();

  // test hooks (used by tools/skullking-browser-check.mjs)
  if (TEST) window.__sk = { app: app, disp: function () { return disp; }, ctl: function () { return ctl; }, E: E };
})();
