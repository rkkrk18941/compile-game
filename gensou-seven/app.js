/* ファンタジーレルムズ — the page.
   CPU games run the engine here and the CPUs in cpu-worker.js. Online, the host's browser runs the engine (and the
   CPUs) and every guest sends its moves and gets back its own view. Whatever happens arrives as a view; the page
   animates the new log entries, then draws the view. */
(function () {
  'use strict';
  var E = window.GS_ENGINE, AI = window.GS_AI, NET = window.GS_NET, ICONS = window.GS_ICONS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var params = new URLSearchParams(location.search);
  var TEST = params.get('test') === '1';
  var NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
  var FAST = TEST || params.get('fast') === '1';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('gs7.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('gs7.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, FAST ? Math.min(ms, 30) : ms); }); }

  /* ================================================================ card pictures and text */
  function svg(path, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 512 512" aria-hidden="true" focusable="false">' + path + '</svg>'; }
  function def(n) { return E.BY_N[n]; }
  function sj(s) { return E.SUIT_JA[s]; }
  function cardName(n) { return def(n).ja; }
  function q(n) { return '「' + cardName(n) + '」'; }
  function textHTML(d) {
    var out = '';
    (d.b || []).forEach(function (t) { out += '<p><span class="lb b">ボーナス</span>' + esc(t) + '</p>'; });
    (d.p || []).forEach(function (t) { out += '<p><span class="lb p">ペナルティ</span>' + esc(t) + '</p>'; });
    return out;
  }
  function cardImage(d, cls) {
    var effects = textHTML(d).replace(/<p>/g, '<span class="card-effect-line">').replace(/<\/p>/g, '</span>');
    return '<span class="realm-card s-' + d.suit + ' ' + (cls || 'card-image') + '">' +
      '<span class="card-top"><img src="assets/cards/' + d.key + '.webp" alt="" loading="lazy" decoding="async" width="400" height="579">' +
      '<span class="card-title">' + esc(d.ja) + '</span><span class="card-suit">' + sj(d.suit) + '</span></span>' +
      '<span class="card-effects">' + effects + '</span></span>';
  }
  function miniHTML(n, cls, attrs) {
    var d = def(n);
    return '<button class="mini s-' + d.suit + ' ' + (cls || '') + '" data-n="' + n + '" ' + (attrs || '') + ' aria-label="' + esc(d.ja + '（' + sj(d.suit) + '・基本値' + d.str + '）') + '">' +
      cardImage(d) + '</button>';
  }
  function bigCardHTML(n) {
    var d = def(n);
    return '<div class="bigcard s-' + d.suit + '">' + cardImage(d) + '</div>';
  }

  /* explaining one card of a scored hand */
  function asText(c, ids) {
    var a = c.as;
    if (!a) return '';
    if (a.type === 'doppel') return q(ids[a.of]) + 'を写す';
    if (a.n != null) return q(a.n) + 'として扱う';
    return '名前なしの' + sj(a.g) + 'として扱う';
  }
  function blankText(c, cards, ids) {
    if (!c.blanked) return '';
    if (c.selfBlank) {
      var k = c.penKey;
      if (k === 'smoke') return '炎が1枚もないので無効';
      if (k === 'warship') return '洪水が1枚もないので無効';
      if (k === 'warDirigible') {
        var weather = cards.some(function (o) { return !o.blanked && o.suit === 'weather'; });
        return weather ? '天候があるので無効' : '軍隊が1枚もないので無効';
      }
      return '無効';
    }
    var by = (c.blankedBy || []).map(function (i) { return i === c.i ? 'このカード自身' : q(ids[i]); });
    return by.length ? by.join('・') + 'によって無効' : '無効';
  }
  function scoredRowsHTML(res, opts) {
    // rows for a scored hand (the realm while playing, the results, the calculator)
    opts = opts || {};
    var ids = res.ids || opts.ids;
    var order = res.cards.map(function (c, i) { return i; });
    if (opts.sort !== false) order.sort(function (a, b) { return sortKey(ids[a]) - sortKey(ids[b]); });
    return order.map(function (i) {
      var c = res.cards[i], d = def(ids[i]);
      var suitNow = c.suit;
      var notes = [];
      var t = asText(c, ids); if (t) notes.push(t);
      if (c.bookFrom) notes.push('変化の書で' + sj(c.bookFrom) + '→' + sj(c.suit));
      if (res.necroPick === ids[i] && i === ids.length - 1 && opts.final) notes.push('死霊術師が捨て場から加えた');
      if (!c.blanked) {
        if (c.island) notes.push('島がペナルティを解除');
        else if (c.cleared && c.hasPenalty) notes.push('ペナルティ解除');
        else if (c.armyCleared && ARMY_PENALTIES[c.penKey]) notes.push('ペナルティから「軍隊」の語を解除');
      }
      var why = [];
      if (!c.blanked) {
        (c.bonusWhy || []).forEach(function (w) { why.push(w); });
        (c.penaltyWhy || []).forEach(function (w) { why.push(w); });
      }
      var bt = blankText(c, res.cards, ids);
      var extra = opts.rowExtra ? opts.rowExtra(i, c) : '';
      return '<div class="row s-' + suitNow + (c.blanked ? ' blank' : '') + (opts.rowClass ? ' ' + opts.rowClass(i, c) : '') + '" data-n="' + ids[i] + '" data-i="' + i + '">' +
        '<span class="rb"></span>' +
        '<span class="rv">' + cardImage(d, 'row-art') + '</span>' +
        '<span class="rt">' +
        (notes.filter(Boolean).length || why.length || bt ? '<span class="why">' + notes.filter(Boolean).map(function (s) { return '<span>◆' + esc(s) + '</span>'; }).join('') +
          (bt ? '<span>' + esc(bt) + '</span>' : '') + why.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</span>' : '') +
        '</span>' +
        '<span class="rp"><span class="score-label">現在の得点</span>' + (c.blanked ? '<b>0</b>' : '<b>' + c.points + '</b>') + extra + '</span>' +
        (c.blanked ? '<span class="stamp">無効</span>' : '') +
        '</div>';
    }).join('');
  }
  function plainRowHTML(n, opts) {
    opts = opts || {};
    var d = def(n);
    return '<div class="row s-' + d.suit + (opts.cls ? ' ' + opts.cls : '') + '" data-n="' + n + '"' + (opts.attrs || '') + '>' +
      '<span class="rv">' + cardImage(d, 'row-art') + '</span>' +
      (opts.right ? '<span class="rp">' + opts.right + '</span>' : '') + '</div>';
  }
  function choiceSummary(res) {
    var ch = res.choice || {}, ids = res.ids, parts = [];
    var idx = function (key) { for (var i = 0; i < ids.length; i++) if (def(ids[i]).key === key) return i; return -1; };
    if (res.necroPick != null) parts.push('死霊術師：捨て場から' + q(res.necroPick) + 'を加える');
    if (ch.doppel != null) parts.push('ドッペルゲンガー：' + q(ids[ch.doppel]) + 'を写す');
    if (ch.mirage) parts.push('蜃気楼：' + (ch.mirage.n != null ? q(ch.mirage.n) : '名前なしの' + sj(ch.mirage.g)));
    if (ch.shapeshifter) parts.push('変身者：' + (ch.shapeshifter.n != null ? q(ch.shapeshifter.n) : '名前なしの' + sj(ch.shapeshifter.g)));
    if (ch.book) parts.push('変化の書：' + q(ids[ch.book.t]) + 'を' + sj(ch.book.s) + 'に');
    if (ch.island != null) parts.push('島：' + q(ids[ch.island]) + 'のペナルティを解除');
    return parts;
  }
  var ARMY_PENALTIES = { swamp: 1, greatFlood: 1, blizzard: 1, dwarvishInfantry: 1, basilisk: 1, warDirigible: 1 };
  var SUIT_ORDER = {}; E.ALL_SUITS.forEach(function (s, i) { SUIT_ORDER[s] = i; });
  function sortKey(n) { var d = def(n); return SUIT_ORDER[d.suit] * 100 + d.n; }
  function sortIds(ids) { return ids.slice().sort(function (a, b) { return sortKey(a) - sortKey(b); }); }

  /* scores of hands, cached (the search can take a moment on hands full of wild cards) */
  var scoreCache = {};
  function handKey(ids) { return ids.slice().sort(function (a, b) { return a - b; }).join(','); }
  function bestOf(ids) {
    var k = ids.join(',');
    if (!scoreCache[k]) { var r = E.bestChoice(ids); r.ids = ids.slice(); scoreCache[k] = r; }
    return scoreCache[k];
  }
  var quickCache = {};
  function quickOf(ids) { var k = handKey(ids); if (!(k in quickCache)) quickCache[k] = E.bestChoice(ids, { fast: true }).total; return quickCache[k]; }

  /* ================================================================ the map behind everything */
  function drawMap() {
    var el = $('#map');
    function ring(cx, cy, r, k, seed) {
      var N = 40, pts = [], i;
      for (i = 0; i < N; i++) {
        var a = (i / N) * Math.PI * 2;
        var w = 1 + 0.1 * Math.sin(3 * a + seed) + 0.06 * Math.sin(5 * a + seed * 1.7) + 0.035 * Math.sin(9 * a + seed * 2.3) + k * 0.02 * Math.sin(2 * a + seed * 0.5);
        pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w * 0.92]);
      }
      var d = 'M' + pts[0][0].toFixed(0) + ' ' + pts[0][1].toFixed(0);
      for (i = 0; i < N; i++) {
        var p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
        d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(0) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(0) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(0) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(0) + ' ' + p2[0].toFixed(0) + ' ' + p2[1].toFixed(0);
      }
      return '<path d="' + d + 'Z"/>';
    }
    var s = '<defs><radialGradient id="mapGlow" cx="52%" cy="45%" r="55%"><stop offset="0" stop-color="#2a3f6b" stop-opacity=".55"/><stop offset="1" stop-color="#16213a" stop-opacity="0"/></radialGradient></defs><rect class="glow" width="1000" height="1000"/>';
    for (var k = 0; k < 7; k++) s += ring(520, 470, 70 + k * 58, k, 1.3 + k * 0.21);
    for (k = 0; k < 4; k++) s += ring(150, 880, 40 + k * 46, k, 4.1 + k * 0.3);
    for (k = 0; k < 3; k++) s += ring(900, 120, 36 + k * 44, k, 2.2 + k * 0.4);
    el.setAttribute('viewBox', '0 0 1000 1000');
    el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    el.innerHTML = s;
  }

  /* the crest on the title: seven cards around a seven */
  function drawCrest() {
    var keys = ['mountain', 'greatFlood', 'rainstorm', 'wildfire', 'king', 'dragon', 'bookOfChanges'];
    var h = '<div class="ring">';
    keys.forEach(function (k, i) {
      var d = E.BY_KEY[k], ang = i * 360 / 7;
      h += '<div class="card s-' + d.suit + '" style="transform:rotate(' + ang + 'deg) translateY(-118%)">' + cardImage(d) + '</div>';
    });
    h += '</div><div class="seven">七</div>';
    $('#crest').innerHTML = h;
  }

  /* ================================================================ screens and sheets */
  var screens = ['scrTitle', 'scrCpu', 'scrOnline', 'scrLobby'];
  function showScreen(id) {
    screens.forEach(function (s) { $('#' + s).hidden = s !== id; });
    document.body.classList.toggle('ingame', !id);
    if (id) closeSheet();
  }
  var sheetStack = [];
  function openSheet(html, opts) {
    opts = opts || {};
    var host = $('#sheetHost');
    var veil = document.createElement('div');
    veil.className = 'veil';
    if (opts.id) veil.id = opts.id;
    veil.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    veil.addEventListener('click', function (e) { if (e.target === veil && !opts.sticky) closeSheet(); });
    host.appendChild(veil);
    sheetStack.push(veil);
    var f = veil.querySelector('[data-focus]') || veil.querySelector('button');
    if (f && !TEST) try { f.focus({ preventScroll: true }); } catch (e) {}
    return veil;
  }
  function closeSheet(all) {
    if (all) { while (sheetStack.length) sheetStack.pop().remove(); return; }
    var v = sheetStack.pop(); if (v) v.remove();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetStack.length) closeSheet(); });
  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2400);
  }

  /* ================================================================ CPU moves (in a worker when possible) */
  var worker = null, workerFailed = false, workerSeq = 0, workerWait = {};
  function cpuMove(view, level) {
    var seed = (view.seq * 2654435761 + view.me * 7919) >>> 0;
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
          setTimeout(function () { finish(undefined); }, 8000);
          worker.postMessage({ id: id, view: view, level: level, seed: seed });
        });
      } catch (e) { workerFailed = true; }
    }
    return Promise.resolve(AI.choose(view, { level: level, seed: seed }));
  }

  /* ================================================================ controllers
     Each one exposes: me (my seat), view(), act(action), and calls app.onView(view) when something happens. */
  var CPU_NAMES = ['アルデン', 'ベリカ', 'カスパル', 'ドゥーラ', 'エルマ'];
  var ctl = null;

  function Table(players, opts) {
    // the engine plus CPU seats; used by CPU games and by the online host
    this.players = players; this.opts = opts;
    this.st = E.newGame({ players: players, twoPlayerVariant: opts.variant, seed: opts.seed });
    this.busy = false; this.dead = false; this.awayTimer = null;
  }
  Table.prototype.isCpu = function (seat) { var p = this.players[seat]; return p.kind === 'cpu' || (p.kind === 'remote' && p.away && p.awayCpu); };
  Table.prototype.apply = function (seat, a) {
    var st = this.st;
    if (st.over || st.turn !== seat || !a || !E.isLegal(st, a)) return false;
    E.apply(st, a);
    return true;
  };
  Table.prototype.drive = function (after) {
    // let CPUs play while it's their turn, one action at a time
    var self = this;
    if (self.busy || self.dead || self.st.over) return;
    var seat = self.st.turn;
    if (!self.isCpu(seat)) return;
    self.busy = true;
    var phase = self.st.phase;
    sleep(phase === 'draw' ? 750 : 850).then(function () {
      if (self.dead) return null;
      return cpuMove(E.view(self.st, seat), self.players[seat].level || 'normal');
    }).then(function (a) {
      self.busy = false;
      if (self.dead || a == null) return;
      if (self.st.turn !== seat || !self.apply(seat, a)) {
        // fall back to anything legal (should not happen)
        var leg = E.legal(self.st); if (self.st.turn === seat && leg.length) self.apply(seat, leg[0]);
      }
      after();
      self.drive(after);
    });
  };

  function LocalCtl(cfg) {
    var players = [{ name: 'あなた', kind: 'human' }];
    for (var i = 1; i < cfg.count; i++) players.push({ name: CPU_NAMES[i - 1], kind: 'cpu', level: cfg.level });
    this.cfg = cfg; this.me = 0; this.online = false;
    this.table = new Table(players, { variant: cfg.variant, seed: cfg.seed });
  }
  LocalCtl.prototype.view = function () { return E.view(this.table.st, this.me); };
  LocalCtl.prototype.start = function () { var self = this; app.onView(self.view()); self.table.drive(function () { app.onView(self.view()); }); };
  LocalCtl.prototype.act = function (a) {
    var self = this;
    if (!self.table.apply(self.me, a)) return;
    app.onView(self.view());
    self.table.drive(function () { app.onView(self.view()); });
  };
  LocalCtl.prototype.again = function () { var c = Object.assign({}, this.cfg, { seed: undefined }); startLocal(c); };
  LocalCtl.prototype.destroy = function () { this.table.dead = true; };

  /* ---------------- online host */
  function HostCtl(name) {
    this.name = name; this.me = 0; this.online = true; this.isHost = true;
    this.seats = [{ kind: 'me', name: name }];
    this.variant = store.get('variant', true);
    this.table = null; this.link = null; this.code = null; this.dead = false;
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
    return { k: 'lobby', code: this.code, variant: this.variant, you: forSeat,
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
        self.push();
        return;
      }
      if (i < 0) {
        if (self.seats.length >= 6) { self.link.send(cid, { k: 'refused', why: 'full' }); self.link.drop(cid); return; }
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
  HostCtl.prototype.onLeave = function (cid, forGood) {
    var self = this, i = self.seatOf(cid);
    if (i < 0) return;
    if (!self.table) { self.seats.splice(i, 1); self.syncLobby(); return; }
    self.seats[i].away = true; self.table.players[i].away = true;
    toast(self.seats[i].name + 'の接続が切れました');
    self.watchAway();
    self.push();
  };
  HostCtl.prototype.watchAway = function () {
    // a seat that stays disconnected on its own turn is played by a CPU after a while
    var self = this;
    clearTimeout(self.awayTimer);
    if (!self.table || self.table.st.over) return;
    var t = self.table.st.turn, p = self.table.players[t];
    if (p.kind === 'remote' && p.away && !p.awayCpu) {
      self.awayTimer = setTimeout(function () {
        if (!self.table || self.table.st.turn !== t || !self.table.players[t].away) return;
        self.table.players[t].awayCpu = true; self.table.players[t].level = 'normal';
        toast(p.name + 'の番をCPUが代わりに進めます');
        self.table.drive(function () { self.push(); });
      }, FAST ? 500 : 45000);
    }
  };
  HostCtl.prototype.addCpu = function () {
    if (this.table || this.seats.length >= 6) return;
    var used = this.seats.map(function (s) { return s.name; });
    var name = CPU_NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || 'CPU';
    this.seats.push({ kind: 'cpu', name: name, level: 'normal' });
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
    var players = self.seats.map(function (s) { return { name: s.name, kind: s.kind === 'cpu' ? 'cpu' : s.kind === 'me' ? 'human' : 'remote', level: s.level, cid: s.cid, away: !!s.away }; });
    self.table = new Table(players, { variant: self.variant });
    store.set('variant', self.variant);
    showScreen(null);
    self.push();
    self.table.drive(function () { self.push(); });
  };
  HostCtl.prototype.viewFor = function (seat) {
    var v = E.view(this.table.st, seat), tp = this.table.players;
    v.players.forEach(function (p, i) { p.away = !!tp[i].away; p.awayCpu = !!tp[i].awayCpu; });
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
    if (!self.table || !self.table.apply(self.me, a)) return;
    self.push();
    self.table.drive(function () { self.push(); });
  };
  HostCtl.prototype.again = function () {
    // back to the room with the same seats
    var self = this;
    if (self.table) self.table.dead = true;
    self.table = null;
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
    if (m.k === 'view') { self.v = m.view; self.me = m.view.me; if (!document.body.classList.contains('ingame')) { closeSheet(true); showScreen(null); } app.onView(m.view); return; }
    if (m.k === 'again') { resetGameView(); closeSheet(true); showScreen('scrLobby'); return; }
    if (m.k === 'refused') {
      self.dead = true;
      var why = m.why === 'full' ? 'この部屋は満員です（6人まで）。' : m.why === 'started' ? 'この部屋はもうゲームを始めています。' : '部屋から外されました。';
      try { self.link.close(); } catch (e) {}
      ctl = null; showScreen('scrOnline'); onlineError(why); return;
    }
    if (m.k === 'bye') { lostHost(); }
  };
  GuestCtl.prototype.view = function () { return this.v; };
  GuestCtl.prototype.act = function (a) { if (!this.v) return; this.link.send({ k: 'act', a: a, seq: this.v.seq }); app.pending = true; render(); };
  GuestCtl.prototype.destroy = function () { this.dead = true; try { this.link.send({ k: 'leave' }); } catch (e) {} var l = this.link; setTimeout(function () { try { l.close(); } catch (e) {} }, 200); };

  function lostHost() {
    if (!ctl || ctl.isHost || ctl.dead) return;
    ctl.dead = true;
    openSheet('<h3>接続が切れました</h3><p class="note">部屋をつくった人との接続が切れたため、ゲームを続けられません。</p><div class="rowbtns"><button class="btn primary" data-act="title" data-focus>タイトルへ</button></div>', { sticky: true }).addEventListener('click', function (e) {
      if (e.target.closest('[data-act="title"]')) { closeSheet(true); goTitle(true); }
    });
  }

  /* ================================================================ the game view */
  var app = {
    v: null, pick: null, pending: false, lastK: -1, resultShown: false, hints: store.get('hints', true),
    onView: function (v) { queueView(v); }
  };
  var viewQueue = [], viewBusy = false;
  function queueView(v) { viewQueue.push(v); if (!viewBusy) nextView(); }
  function nextView() {
    if (!viewQueue.length) { viewBusy = false; return; }
    viewBusy = true;
    // only the newest view matters, but every log entry in between is animated
    var v = viewQueue[viewQueue.length - 1];
    viewQueue = [];
    if (app.v && app.v.gid !== v.gid) { app.lastK = -1; app.resultShown = false; app.pick = null; scoreCache = {}; quickCache = {}; }
    var fresh = (v.log || []).filter(function (e) { return e.k > app.lastK; });
    var before = captureRects(fresh);
    app.v = v; app.pending = false;
    if (fresh.length) app.lastK = fresh[fresh.length - 1].k;
    if (v.phase !== 'discard' || v.turn !== v.me) app.pick = null;
    render();
    animate(fresh, before).then(function () {
      if (v.over && !app.resultShown) {
        app.resultShown = true;
        setTimeout(function () { showResult(app.v); }, FAST ? 0 : 500);
      }
      nextView();
    });
  }

  function seatName(seat) { var v = app.v; return seat === v.me ? 'あなた' : v.players[seat].name; }
  function myTurn() { var v = app.v; return v && !v.over && v.turn === v.me && !app.pending; }

  function render() {
    var v = app.v;
    if (!v) return;
    renderTop(v); renderRivals(v); renderCommon(v); renderRealm(v); renderBar(v); renderHistory(v);
  }
  function logLine(e, v) {
    var who = seatName(e.seat);
    var what = e.t === 'deck' ? '山札から引いた' : e.t === 'deck2' ? '山札から2枚引いた' : e.t === 'take' ? '捨て場から' + q(e.id) + 'を取った' : q(e.id) + 'を捨てた';
    return '<li class="' + (e.seat === v.me ? 'mine' : '') + '"><b>' + esc(who) + '</b><span>' + esc(what) + '</span></li>';
  }
  function renderHistory(v) {
    var el = $('#logList'); if (!el) return;
    el.innerHTML = v.log.slice(-40).reverse().map(function (e) { return logLine(e, v); }).join('') || '<li>まだありません</li>';
  }

  function renderTop(v) {
    var chip = $('#hudDiscard');
    var goal = v.variant ? 12 : 10;
    chip.innerHTML = '捨て場 <b>' + v.discard.length + '</b>/' + goal + (v.variant ? '<small>以上</small>' : '');
    chip.classList.toggle('hot', v.discard.length >= goal - 2);
    chip.title = v.variant ? '2人とも7枚になり、捨て場が12枚以上で終了' : '捨て場が10枚になったら終了';
  }

  function lastActText(seat, v) {
    for (var i = v.log.length - 1; i >= 0; i--) {
      var e = v.log[i];
      if (e.seat !== seat) continue;
      if (e.t === 'discard') return q(e.id) + 'を捨てた';
      if (e.t === 'take') return q(e.id) + 'を取った';
      if (e.t === 'deck') return '山札から引いた';
      if (e.t === 'deck2') return '山札から2枚引いた';
    }
    return '';
  }
  function renderRivals(v) {
    var n = v.players.length, h = '';
    for (var k = 1; k <= n; k++) {
      var seat = (v.me + k) % n;
      var p = v.players[seat], me = seat === v.me;
      if (me && n > 1) continue;
      var turn = !v.over && v.turn === seat;
      var act = turn ? (p.kind === 'cpu' || p.awayCpu ? '考えています…' : p.away ? '接続を待っています…' : '手番です') : lastActText(seat, v);
      h += '<div class="rival' + (turn ? ' turn' : '') + (p.away ? ' away' : '') + '" data-seat="' + seat + '">' +
        '<span class="av">' + esc(p.name.slice(0, 1)) + '</span>' +
        '<span class="nm">' + esc(p.name) + '<small>' + v.handSizes[seat] + '枚' + (seat === v.first ? '・最初の手番' : '') + '</small></span>' +
        '<span class="act">' + esc(act) + '</span></div>';
    }
    $('#rivals').innerHTML = h;
  }

  function renderCommon(v) {
    var mine = myTurn() && v.phase === 'draw';
    var deck = $('#deck');
    var need = v.variant && v.hand && v.hand.length < 7 ? 2 : 1;
    deck.disabled = !(mine && v.deck >= need);
    deck.classList.toggle('can', !deck.disabled);
    $('#deckN').textContent = '山札 ' + v.deck;
    deck.setAttribute('aria-label', '山札（残り' + v.deck + '枚）' + (deck.disabled ? '' : need === 2 ? '：2枚引く' : '：1枚引く'));
    var h = v.discard.map(function (n) { return miniHTML(n, mine ? 'can' : ''); }).join('');
    var dEl = $('#discard');
    dEl.innerHTML = h || '<div class="empty">まだ何も捨てられていません。</div>';
    if (dEl.scrollWidth > dEl.clientWidth + 4) dEl.scrollLeft = dEl.scrollWidth; // one scrolling row on short phones: show the newest
    $('#commonSub').textContent = mine ? 'カードをタップして取れます' : '表向き。だれでも取れます';
  }

  function renderRealm(v) {
    var hand = v.hand || [];
    var rowsEl = $('#rows');
    var discardPhase = myTurn() && v.phase === 'discard';
    var limitTo = discardPhase && v.drawn2 ? v.drawn2 : null;
    $('#realmCount').textContent = hand.length + '枚';
    var note = '';
    var html = '';
    if (!hand.length) {
      html = '<p class="note" style="padding:8px 2px">' + (v.variant ? '2人用ルールでは手札0枚から始めます。捨て場から取るか、山札から2枚引いて1枚を残します。' : '') + '</p>';
      $('#realmScore').innerHTML = '';
    } else if (discardPhase) {
      // 8 cards (or the two just drawn): pick one to discard
      var options = limitTo || hand;
      if (app.pick != null && options.indexOf(app.pick) < 0) app.pick = null;
      var restIds = null;
      if (app.pick != null) { restIds = hand.slice(); restIds.splice(restIds.indexOf(app.pick), 1); }
      var res = restIds ? bestOf(restIds) : null;
      var previews = {};
      if (app.hints) options.forEach(function (n) { var r = hand.slice(); r.splice(r.indexOf(n), 1); var k = handKey(r); previews[n] = k in quickCache ? quickCache[k] : null; });
      sortIds(hand).forEach(function (n) {
        var selectable = options.indexOf(n) >= 0;
        var cls = (n === app.pick ? ' pick' : '') + (n === v.drawn || (v.drawn2 && v.drawn2.indexOf(n) >= 0) ? ' fresh' : '') + (selectable ? '' : ' locked');
        var right = '';
        if (n === v.drawn || (v.drawn2 && v.drawn2.indexOf(n) >= 0)) right += '<span class="tag">' + (v.drawn2 ? '引いた' : (lastTakeWasMine(v, n) ? '取った' : '引いた')) + '</span>';
        if (n === app.pick) right += '<span class="tag alt">捨てる</span>';
        else if (res) { var ci = res.ids.indexOf(n); if (ci >= 0) right += '<b>' + (res.cards[ci].blanked ? 0 : res.cards[ci].points) + '</b>'; }
        if (app.hints && selectable) right += '<span class="preview" data-pv="' + n + '">捨てると<b>' + (previews[n] == null ? '…' : previews[n]) + '</b>点</span>';
        html += plainRowHTML(n, { cls: cls.trim(), right: right, attrs: selectable ? ' role="button" tabindex="0" aria-pressed="' + (n === app.pick) + '"' : '' });
      });
      if (res) {
        $('#realmScore').innerHTML = res.total + '<small>点（捨てた後）</small>';
        var parts = choiceSummary(res); if (parts.length) note = '最善の使い方：' + parts.join('／');
      } else {
        $('#realmScore').innerHTML = '';
        note = limitTo ? '引いた2枚のうち、捨てる1枚を選んでください。' : '捨てるカードを1枚選んでください。';
      }
    } else {
      var r = bestOf(hand);
      html = scoredRowsHTML(r, { ids: r.ids, rowClass: function (i) { return r.ids[i] === v.drawn ? 'fresh' : ''; } });
      $('#realmScore').innerHTML = r.total + '<small>点</small>';
      var ps = choiceSummary(r);
      if (ps.length) note = '最善の使い方：' + ps.join('／');
      if (hand.indexOf(E.BY_KEY.necromancer.n) >= 0) note += (note ? '　' : '') + '死霊術師の8枚目は終了時に捨て場から選ばれます（この点には含みません）。';
    }
    $('#realmNote').textContent = note;
    $('#realmNote').hidden = !note;
    rowsEl.innerHTML = html;
    if (discardPhase && app.hints) fillPreviews(v);
  }
  // the "捨てると…点" previews are worked out one at a time, so a hand full of wild cards never freezes the page
  var previewToken = 0;
  function fillPreviews(v) {
    var token = ++previewToken, hand = v.hand, todo = $$('#rows [data-pv]').filter(function (el) { return el.querySelector('b').textContent === '…'; });
    (function next() {
      if (token !== previewToken || !todo.length) return;
      var el = todo.shift(), n = +el.dataset.pv;
      var r = hand.slice(); r.splice(r.indexOf(n), 1);
      var val = quickOf(r);
      el.querySelector('b').textContent = val;
      setTimeout(next, 0);
    })();
  }
  function lastTakeWasMine(v, n) {
    for (var i = v.log.length - 1; i >= 0; i--) { var e = v.log[i]; if (e.seat === v.me) return e.t === 'take' && e.id === n; }
    return false;
  }

  function renderBar(v) {
    var p = $('#prompt'), a = $('#actions');
    var h = '', ah = '';
    if (v.over) {
      h = '<b>ゲーム終了</b>';
      ah = '<button class="btn primary" data-act="result">結果を見る</button>';
    } else if (app.pending) {
      h = '送信中…';
    } else if (v.turn !== v.me) {
      var pl = v.players[v.turn];
      h = '<b>' + esc(pl.name) + '</b>の番です' + (pl.kind === 'cpu' ? '。考えています…' : pl.away ? '（接続を待っています）' : '');
    } else if (v.phase === 'draw') {
      var building = v.variant && v.hand.length < 7;
      h = building ? '<b>あなたの番</b>：山札から2枚引くか、捨て場のカードを1枚取ってください（取ったときは捨てません）。' : '<b>あなたの番</b>：山札から引くか、捨て場のカードを選んで取ってください。';
      if (!v.discard.length && v.turns === 0) h = '<b>あなたの番</b>：最初の手番は山札から引きます。';
      ah = '<button class="btn primary" data-act="deck"' + (v.deck >= (building ? 2 : 1) ? '' : ' disabled') + '>' + (building ? '山札から2枚引く' : '山札から引く') + '</button>';
    } else {
      if (app.pick != null) {
        h = q(app.pick) + 'を捨て場に置きます。';
        ah = '<button class="btn ghost" data-act="unpick">やめる</button><button class="btn primary" data-act="discard">捨てる</button>';
      } else {
        h = v.drawn2 ? '<b>引いた2枚</b>のうち、捨てる1枚を選んでください。' : '<b>捨てるカード</b>を1枚選んでください。';
      }
    }
    p.innerHTML = h; a.innerHTML = ah;
  }

  /* ---------------- interactions */
  $('#actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !ctl) return;
    var act = b.dataset.act;
    if (act === 'deck' && myTurn()) ctl.act({ t: 'deck' });
    if (act === 'unpick') { app.pick = null; render(); }
    if (act === 'discard' && myTurn() && app.pick != null) { var n = app.pick; app.pick = null; ctl.act({ t: 'discard', id: n }); }
    if (act === 'result') showResult(app.v);
  });
  $('#deck').addEventListener('click', function () { if (myTurn() && app.v.phase === 'draw' && ctl) ctl.act({ t: 'deck' }); });
  $('#discard').addEventListener('click', function (e) {
    var m = e.target.closest('.mini'); if (!m) return;
    showCardSheet(+m.dataset.n, 'discard');
  });
  $('#rows').addEventListener('click', function (e) {
    var r = e.target.closest('.row'); if (!r) return;
    var n = +r.dataset.n, v = app.v;
    if (myTurn() && v.phase === 'discard') {
      var options = v.drawn2 || v.hand;
      if (options.indexOf(n) < 0) { toast('捨てられるのは、いま引いた2枚のどちらかです'); return; }
      app.pick = app.pick === n ? null : n;
      renderRealm(v); renderBar(v);
      return;
    }
    showCardSheet(n, 'hand');
  });
  $('#rows').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')) { e.preventDefault(); e.target.click(); }
  });
  $('#rivals').addEventListener('click', function (e) {
    var r = e.target.closest('.rival'); if (!r || !app.v) return;
    var seat = +r.dataset.seat, v = app.v, p = v.players[seat];
    var taken = v.log.filter(function (x) { return x.seat === seat && (x.t === 'take' || x.t === 'discard'); });
    var known = {}; taken.forEach(function (x) { if (x.t === 'take') known[x.id] = true; else delete known[x.id]; });
    var ks = Object.keys(known).map(Number);
    var h = '<h3>' + esc(p.name) + '</h3><p class="note">手札' + v.handSizes[seat] + '枚。' + (ks.length ? '捨て場から取って、まだ持っているはずのカード：' : '捨て場から取ったカードはありません。') + '</p>';
    if (ks.length) h += '<div class="calcpick">' + ks.map(function (n) { return miniHTML(n); }).join('') + '</div>';
    h += '<div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>';
    openSheet(h).addEventListener('click', function (ev) { if (ev.target.closest('[data-close]')) closeSheet(); else { var mm = ev.target.closest('.mini'); if (mm) showCardSheet(+mm.dataset.n, 'info'); } });
  });

  function showCardSheet(n, where) {
    var v = app.v, d = def(n);
    var h = bigCardHTML(n);
    var canTake = where === 'discard' && myTurn() && v.phase === 'draw';
    if (canTake && app.hints) {
      var building = v.variant && v.hand.length < 7;
      var withIt = v.hand.concat([n]);
      var best = null;
      if (building) best = { s: quickOf(withIt) };
      else withIt.forEach(function (x) { var r = withIt.slice(); r.splice(r.indexOf(x), 1); var s = quickOf(r); if (!best || s > best.s) best = { s: s, d: x }; });
      h += '<p class="note" style="margin-top:10px">' + (building ? '取ると手札の得点は ' + best.s + ' 点（いまは ' + quickOf(v.hand) + ' 点）。' : '取ったあと' + (best.d === n ? 'このカードをそのまま捨てるのが最善で、' : q(best.d) + 'を捨てると ') + best.s + ' 点（いまは ' + quickOf(v.hand) + ' 点）。') + '</p>';
    }
    h += '<div class="rowbtns">' + (canTake ? '<button class="btn primary" data-take data-focus>このカードを取る</button>' : '') + '<button class="btn" data-close' + (canTake ? '' : ' data-focus') + '>閉じる</button></div>';
    var veil = openSheet(h);
    veil.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeSheet();
      if (e.target.closest('[data-take]')) { closeSheet(); if (myTurn() && app.v.phase === 'draw' && app.v.discard.indexOf(n) >= 0) ctl.act({ t: 'take', id: n }); }
    });
  }

  /* ---------------- flying cards */
  function rectOf(el) { if (!el) return null; var r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }
  function rivalEl(seat) { return $('.rival[data-seat="' + seat + '"]'); }
  function captureRects(fresh) {
    var out = {};
    fresh.forEach(function (e) {
      if (e.t === 'discard') out['d' + e.k] = rectOf(e.seat === (app.v && app.v.me) ? $('#rows .row[data-n="' + e.id + '"]') : rivalEl(e.seat));
      if (e.t === 'take') out['t' + e.k] = rectOf($('#discard .mini[data-n="' + e.id + '"]'));
    });
    out.deck = rectOf($('#deck'));
    return out;
  }
  function flyOne(html, from, to, cls) {
    return new Promise(function (res) {
      if (!from || !to || reduceMotion || FAST) { res(); return; }
      var layer = $('#fly');
      var w = Math.min(64, to.w || 64), h = w * 1.4;
      var el = document.createElement('div');
      el.innerHTML = html; el = el.firstChild;
      el.style.width = w + 'px'; el.style.height = h + 'px';
      el.style.left = (from.x + from.w / 2 - w / 2) + 'px'; el.style.top = (from.y + from.h / 2 - h / 2) + 'px';
      if (cls) el.classList.add(cls);
      layer.appendChild(el);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.transform = 'translate(' + ((to.x + to.w / 2) - (from.x + from.w / 2)) + 'px,' + ((to.y + to.h / 2) - (from.y + from.h / 2)) + 'px) scale(' + Math.max(0.6, Math.min(1.1, (to.w || w) / w)) + ')';
        });
      });
      setTimeout(function () { el.remove(); res(); }, 460);
    });
  }
  function backHTML() { return '<div style="position:fixed;border-radius:7px" class="back"></div>'; }
  function animate(fresh, before) {
    if (!fresh.length || FAST || reduceMotion) return Promise.resolve();
    var v = app.v, chain = Promise.resolve();
    fresh.slice(-4).forEach(function (e) {
      chain = chain.then(function () {
        var mine = e.seat === v.me;
        if (e.t === 'deck' || e.t === 'deck2') {
          var to = mine ? rectOf($('#rows')) : rectOf(rivalEl(e.seat));
          if (to && mine) to = { x: to.x + to.w / 2 - 30, y: to.y + 10, w: 60, h: 84 };
          return flyOne(backHTML(), before.deck, to);
        }
        if (e.t === 'take') {
          var to2 = mine ? rectOf($('#rows .row[data-n="' + e.id + '"]')) : rectOf(rivalEl(e.seat));
          return flyOne(miniHTML(e.id), before['t' + e.k], to2);
        }
        if (e.t === 'discard') {
          var target = $('#discard .mini[data-n="' + e.id + '"]');
          if (target) target.style.visibility = 'hidden';
          return flyOne(miniHTML(e.id), before['d' + e.k], rectOf(target)).then(function () {
            if (target) { target.style.visibility = ''; target.classList.add('fresh'); }
          });
        }
      });
    });
    return chain;
  }

  /* ---------------- results */
  function showResult(v) {
    if (!v || !v.result) return;
    var res = v.result, n = v.players.length;
    var winners = res.winners;
    var verdict;
    if (winners.length > 1) verdict = '引き分け（' + winners.map(seatName).join('と') + '）';
    else verdict = winners[0] === v.me ? 'あなたの勝ち！' : seatName(winners[0]) + 'の勝ち';
    var first = res.scores[res.order[0]], second = n > 1 ? res.scores[res.order[1]] : null;
    var sub = second && first.total === second.total && winners.length === 1 ? '同点のため、基本値の合計が低い' + seatName(winners[0]) + 'の勝ち（' + first.baseTotal + '対' + second.baseTotal + '）' : '';
    var h = '<div class="verdict">' + esc(verdict) + '</div><p class="subverdict">' + esc(sub || (v.variant ? '2人用ルール・捨て場' + v.discard.length + '枚で終了' : '捨て場が10枚になって終了')) + '</p>';
    var place = 0, prev = null;
    res.order.forEach(function (seat, k) {
      var r = res.scores[seat];
      if (!prev || r.total !== prev.total || r.baseTotal !== prev.baseTotal) place = k + 1;
      prev = r;
      var parts = choiceSummary(r);
      h += '<details class="rank' + (winners.indexOf(seat) >= 0 ? ' win' : '') + '"' + (seat === v.me || k === 0 ? ' open' : '') + '><summary><span class="pl">' + place + '</span><span class="who">' + esc(seatName(seat)) +
        '<small>基本値の合計 ' + r.baseTotal + (parts.length ? '　' + esc(parts.join('／')) : '') + '</small></span><span class="pts">' + r.total + '</span></summary><div class="body">' +
        scoredRowsHTML(r, { ids: r.ids, final: true, text: false }) + '</div></details>';
    });
    h += '<div class="rowbtns"><button class="btn" data-act="close">盤面を見る</button>' + (ctl && (!ctl.online || ctl.isHost) ? '<button class="btn primary" data-act="again" data-focus>もう一度</button>' : '') + '<button class="btn" data-act="title">タイトルへ</button></div>';
    if (ctl && ctl.online && !ctl.isHost) h += '<p class="note" style="margin-top:8px">「もう一度」は部屋をつくった人が選べます。</p>';
    closeSheet(true);
    var veil = openSheet(h, { id: 'result' });
    veil.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') closeSheet();
      if (b.dataset.act === 'again') { closeSheet(true); ctl.again(); }
      if (b.dataset.act === 'title') { closeSheet(true); goTitle(true); }
    });
  }

  /* ---------------- menu */
  $('#btnMenu').addEventListener('click', function () {
    var h = '<h3>メニュー</h3><div class="stack">' +
      '<button class="btn" data-m="rules">あそびかた・得点のきまり</button>' +
      '<button class="btn" data-m="cards">カード一覧</button>' +
      (app.v ? '<button class="btn" data-m="log">これまでの手</button>' : '') +
      '<label class="toggle"><input type="checkbox" id="hintToggle"' + (app.hints ? ' checked' : '') + '><span>捨てる前に「捨てると何点か」を表示する</span></label>' +
      '<button class="btn" data-m="title">タイトルへ戻る</button>' +
      '<button class="btn ghost" data-m="close" data-focus>閉じる</button></div>';
    var veil = openSheet(h);
    veil.addEventListener('change', function (e) { if (e.target.id === 'hintToggle') { app.hints = e.target.checked; store.set('hints', app.hints); render(); } });
    veil.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var m = b.dataset.m;
      if (m === 'close') closeSheet();
      if (m === 'rules') { closeSheet(); openRules('play'); }
      if (m === 'cards') { closeSheet(); openRules('cards'); }
      if (m === 'log') {
        closeSheet();
        var lv = openSheet('<h3>これまでの手</h3><ol class="log">' + (app.v.log.slice().reverse().map(function (e) { return logLine(e, app.v); }).join('') || '<li>まだありません</li>') + '</ol><div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>');
        lv.addEventListener('click', function (ev) { if (ev.target.closest('[data-close]')) closeSheet(); });
      }
      if (m === 'title') {
        closeSheet();
        if (app.v && !app.v.over) {
          var c = openSheet('<h3>ゲームをやめますか？</h3><p class="note">' + (ctl && ctl.online && ctl.isHost ? 'あなたが部屋をつくった人なので、ほかの人のゲームも終わります。' : 'いまのゲームは記録されません。') + '</p><div class="rowbtns"><button class="btn" data-no data-focus>続ける</button><button class="btn primary" data-yes>やめる</button></div>');
          c.addEventListener('click', function (ev) { if (ev.target.closest('[data-no]')) closeSheet(); if (ev.target.closest('[data-yes]')) { closeSheet(true); goTitle(true); } });
        } else goTitle(true);
      }
    });
  });

  /* ================================================================ rules, card list, calculator */
  var RULES_PLAY = '<div class="doc">' +
    '<h4>めざすこと</h4><p>手札7枚で自分の「国」をつくり、得点がいちばん高い人が勝ちです。カードには<b>基本値</b>（左上の数字）があり、さらにほかのカードとの組み合わせで点が増える<b>ボーナス</b>と、点が減ったりカードが消えたりする<b>ペナルティ</b>があります。</p>' +
    '<h4>準備</h4><p>53枚をよく混ぜ、全員に7枚ずつ配ります。残りは山札です。最初の手番の人はランダムに決まり、そこから順番に回ります。</p>' +
    '<h4>手番</h4><ol><li>山札のいちばん上を1枚引くか、捨て場から好きなカードを1枚取ります（最初の手番は捨て場が空なので山札から）。</li><li>手札から1枚を捨て場に表向きで置きます。取ったばかりのカードを捨ててもかまいません。</li></ol><p>手札はいつも7枚。ほかの人の手札は見えませんが、捨て場はだれでも見られます。</p>' +
    '<h4>ゲームの終わり</h4><p>捨て場のカードが<b>10枚</b>になったら、その場で終了します。全員が手札を公開して得点を数えます。死霊術師を持っている人は、その前に捨て場から軍隊・指導者・魔術師・獣のどれか1枚を取って8枚目にできます。</p><p>得点がいちばん高い人の勝ち。同点なら、手札の<b>基本値の合計が低い人</b>の勝ちです（無効化されたカードは数えず、ドッペルゲンガーは写した基本値で数えます）。</p>' +
    '<h4>2人で遊ぶとき（公式の2人用ルール）</h4><ul><li>はじめは2人とも手札0枚です。</li><li>手札が7枚になるまでは、自分の番に「捨て場から1枚取る（捨てない）」か「山札から2枚引き、その2枚のうち1枚を捨てる」のどちらかをします。</li><li>7枚になったら、ふつうの手番（1枚取って1枚捨てる）をします。</li><li>2人とも7枚になり、捨て場が<b>12枚以上</b>になったら終了します。</li></ul><p class="src">設定で2人用ルールを外すと、2人でもふつうのルール（7枚配って捨て場10枚で終了）で遊べます。デザイナーは、2人でもふつうのルールで問題なく遊べると述べています。</p>' +
    '<h4>このアプリでの得点</h4><p>ワイルドカード（変身者・蜃気楼・ドッペルゲンガー）、変化の書、島、死霊術師の使い方は、終了時に<b>得点がいちばん高くなるように自動で選びます</b>。同じ点になる使い方が複数あるときは、同点の判定で有利になるよう基本値の合計が低いほうを選びます。</p><p>遊んでいる間は「あなたの国」に、いまの手札の得点と、各カードの点数・理由が表示されます（死霊術師の8枚目は終了時に決まるので含みません）。</p>' +
    '<p class="src">収録しているのは基本セットの53枚です。プロモカードと拡張『The Cursed Hoard』、制限時間つきの「カオス・レルム」は含みません。</p>' +
    '</div>';
  var RULES_SCORE = '<div class="doc">' +
    '<h4>ことば</h4><dl>' +
    '<dt>「〜があれば」</dt><dd>条件に合うカードが何枚あっても、1回だけ数えます。</dd>' +
    '<dt>「〜1枚ごとに」</dt><dd>条件に合うカードの枚数だけ数えます。そのカード自身も条件に合えば数えます。</dd>' +
    '<dt>「ほかの〜」</dt><dd>そのカード自身は数えません。</dd>' +
    '<dt>無効化</dt><dd>無効化されたカードは、名前・スート・基本値・ボーナス・ペナルティがすべてなくなり、ないものとして扱います。</dd>' +
    '<dt>解除</dt><dd>ペナルティを取り除きます。解除はボーナスの一種で、どのペナルティよりも先に起こります。解除したカードがあとで無効化されても、解除はそのまま有効です。「『軍隊』の語を解除」は、ペナルティの文から「軍隊」だけを取り除きます。それでその文が意味を持たなくなれば、その文ごとなくなります（軍用飛行船の「軍隊が1枚もなければ無効化」など）。</dd></dl>' +
    '<h4>解決の順番</h4><ol><li>（ゲーム終了時）死霊術師で捨て場から8枚目を加える</li><li>ドッペルゲンガーが何を写すか決める</li><li>蜃気楼が何になるか決める</li><li>変身者が何になるか決める</li><li>変化の書でスートを変える</li><li>島などでペナルティを解除する</li><li>ペナルティを適用する。ほかのカードに無効化されないカードから順に。無効化されたカードのペナルティは働きません。互いに無効化し合うカード（たとえばバジリスクと、それを写したドッペルゲンガー）は、解除するカードがなければ両方とも無効化され、ほかのカードは無効化しません。</li><li>無効化されていないカードの基本値・ボーナス・ペナルティを合計する</li></ol>' +
    '<h4>細かい裁定</h4><ul>' +
    '<li>野火の文はペナルティです。島や守護のルーンで解除でき、ドッペルゲンガーが写せます。名前とスートを決めていないワイルドカードも無効化します。</li>' +
    '<li>軍艦の「洪水のペナルティから『軍隊』の語を解除する」はボーナスです（ドッペルゲンガーは写さず、解除されることもありません）。「洪水がなければ無効化」はペナルティです。</li>' +
    '<li>レンジャーは「軍隊」の語を含むペナルティ（大洪水・バジリスク・沼地・吹雪・ドワーフの歩兵など）から軍隊を守りますが、「軍隊」の語がない野火からは守りません。</li>' +
    '<li>島は、ペナルティのある洪水か炎があれば、必ずそのうち1枚のペナルティを解除します。</li>' +
    '<li>変化の書で変えたスートは、そのカード自身の条件にも使えます（ドラゴンを魔術師に変えれば、ドラゴン自身が「魔術師」になります）。ただし「ほかの」と書かれた条件では自分を数えません。変えられるのは自分の手札のカードだけで、新しいスートはワイルドを含む11種類から選べます。</li>' +
    '<li>蜃気楼と変身者は、手札にないカードの名前とスートにもなれます。名前のない「ただの洪水」などになることもできます。基本値は0のままで、0も秩序の宝珠の並びに使えます。</li>' +
    '<li>ドッペルゲンガーが写せるのは自分の手札のカードだけです。写すのは名前・基本値・スート・ペナルティで、ボーナス（解除を含む）は写しません。</li>' +
    '<li>収集家は名前の異なるカードだけを数えます（ドッペルゲンガーが写した同じ名前のカードは数えません）。条件を満たすスートが2つあれば両方のボーナスを得ます。6枚以上でも+100です。</li>' +
    '<li>秩序の宝珠は、基本値が1ずつ続くカードの並びを数えます。別々の並びはそれぞれ得点し、1枚を2つの並びに使うことはできません。8枚の並びでも+150です。</li>' +
    '<li>生命の泉が加えられるのは、自分の手札にある（無効化されていない）カードの基本値だけです。</li>' +
    '<li>ろうそくの「魔術師」は1枚以上あればよく、2枚以上でもかまいません。</li>' +
    '<li>森は、獣1枚ごとに+12、さらに「エルフの射手」1枚ごとに+12です。</li>' +
    '<li>死霊術師が取るカードのスートは、捨て場にあるときの（印刷どおりの）スートで判断します。取ったカードは、その後のドッペルゲンガーや変化の書の対象にできます。</li></ul>' +
    '<p class="src">出典：WizKids の公式ルールブック（改訂版・デラックス版）のQ&amp;A、デザイナー Bruce Glassco 氏の BoardGameGeek での回答、WizKids 公認の得点計算アプリ（fantasy-realms.github.io）。資料の確認日 2026年10月20日。</p>' +
    '</div>';

  function cardsListHTML(filter) {
    var h = '<div class="suitfilter">' + ['all'].concat(E.ALL_SUITS).map(function (s) {
      return '<button data-suit="' + s + '" class="' + (s === 'all' ? '' : 's-' + s) + '" aria-pressed="' + (filter === s) + '">' + (s === 'all' ? '' : svg(ICONS.suits[s])) + (s === 'all' ? 'すべて' : sj(s)) + '</button>';
    }).join('') + '</div>';
    var list = E.CARDS.slice().sort(function (a, b) { return sortKey(a.n) - sortKey(b.n); }).filter(function (d) { return filter === 'all' || d.suit === filter; });
    h += '<div class="card-grid">' + list.map(function (d) { return plainRowHTML(d.n, { en: true }); }).join('') + '</div>';
    return h;
  }

  var calc = { ids: [] };
  function calcHTML() {
    var h = '<p class="note">カードを選ぶと、その手札の得点と内訳を表示します（7枚まで。8枚目は死霊術師がいるときだけ）。ワイルドカードなどの使い方は、いちばん高くなるものを自動で選びます。</p>';
    h += '<div class="calcsum"><b id="calcTotal">' + (calc.ids.length ? '' : '—') + '</b><span class="note" id="calcInfo"></span><span class="spacer"></span><button class="btn small" data-calc="clear">選び直す</button></div>';
    h += '<div id="calcRows"></div>';
    h += '<div class="calcpick">' + E.CARDS.slice().sort(function (a, b) { return sortKey(a.n) - sortKey(b.n); }).map(function (d) { return miniHTML(d.n, calc.ids.indexOf(d.n) >= 0 ? 'on' : '', 'aria-pressed="' + (calc.ids.indexOf(d.n) >= 0) + '"'); }).join('') + '</div>';
    return h;
  }
  function updateCalc(root) {
    var ids = calc.ids;
    $$('.calcpick .mini', root).forEach(function (m) { var on = ids.indexOf(+m.dataset.n) >= 0; m.classList.toggle('on', on); m.setAttribute('aria-pressed', on); });
    if (!ids.length) { $('#calcTotal', root).textContent = '—'; $('#calcInfo', root).textContent = ''; $('#calcRows', root).innerHTML = ''; return; }
    var r = E.bestChoice(ids); r.ids = ids.slice();
    $('#calcTotal', root).textContent = r.total + '点';
    var parts = choiceSummary(r);
    $('#calcInfo', root).textContent = ids.length + '枚・基本値の合計 ' + r.baseTotal + (parts.length ? '　' + parts.join('／') : '');
    $('#calcRows', root).innerHTML = scoredRowsHTML(r, { ids: r.ids });
  }

  function openRules(tab) {
    var tabs = [['play', 'あそびかた'], ['score', '得点のきまり'], ['cards', 'カード一覧'], ['calc', '得点を試す']];
    var h = '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + t[1] + '</button>'; }).join('') + '</div><div id="rulesBody"></div><div class="rowbtns"><button class="btn" data-close data-focus>閉じる</button></div>';
    var veil = openSheet(h, { id: 'rules' });
    var filter = 'all';
    function show(t) {
      tab = t;
      $$('.tabs button', veil).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t); });
      var body = $('#rulesBody', veil);
      if (t === 'play') body.innerHTML = RULES_PLAY;
      if (t === 'score') body.innerHTML = RULES_SCORE;
      if (t === 'cards') body.innerHTML = cardsListHTML(filter);
      if (t === 'calc') { body.innerHTML = calcHTML(); updateCalc(veil); }
      veil.querySelector('.sheet').scrollTop = 0;
    }
    show(tab);
    veil.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-tab]'); if (tb) { show(tb.dataset.tab); return; }
      if (e.target.closest('[data-close]')) { closeSheet(); return; }
      var sf = e.target.closest('[data-suit]'); if (sf) { filter = sf.dataset.suit; $('#rulesBody', veil).innerHTML = cardsListHTML(filter); return; }
      if (e.target.closest('[data-calc="clear"]')) { calc.ids = []; updateCalc(veil); return; }
      var m = e.target.closest('.calcpick .mini');
      if (m && tab === 'calc') {
        var n = +m.dataset.n, i = calc.ids.indexOf(n);
        if (i >= 0) calc.ids.splice(i, 1);
        else {
          var hasNecro = calc.ids.indexOf(E.BY_KEY.necromancer.n) >= 0 || n === E.BY_KEY.necromancer.n;
          if (calc.ids.length >= 8 || (calc.ids.length >= 7 && !hasNecro)) { toast(calc.ids.length >= 8 ? '8枚までです' : '8枚目を入れられるのは死霊術師がいるときだけです'); return; }
          calc.ids.push(n);
        }
        updateCalc(veil);
      }
    });
  }

  /* ================================================================ title, setup, lobby */
  function goTitle(destroy) {
    if (destroy && ctl) { try { ctl.destroy(); } catch (e) {} }
    ctl = null; app.v = null; app.pick = null; app.lastK = -1; app.resultShown = false; viewQueue = [];
    setRoomParam(null);
    closeSheet(true);
    showScreen('scrTitle');
  }
  function setRoomParam(code) {
    // a guest's reload rejoins the same room
    try {
      var p = new URLSearchParams(location.search);
      if (code) p.set('room', code); else p.delete('room');
      var qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (e) {}
  }
  window.addEventListener('beforeunload', function (e) {
    if (ctl && ctl.isHost && ctl.table && !ctl.table.st.over) { e.preventDefault(); e.returnValue = ''; }
  });
  $$('[data-back]').forEach(function (b) { b.addEventListener('click', function () { showScreen('scrTitle'); }); });
  $('#goCpu').addEventListener('click', function () { showScreen('scrCpu'); syncCpuSetup(); });
  $('#goOnline').addEventListener('click', function () { showScreen('scrOnline'); $('#onName').value = store.get('name', ''); $('#onErr').hidden = true; });
  $('#goRules').addEventListener('click', function () { openRules('play'); });
  $('#goCards').addEventListener('click', function () { openRules('cards'); });
  $('#goCalc').addEventListener('click', function () { openRules('calc'); });

  var cpuCfg = { count: store.get('count', 4), level: store.get('level', 'normal'), variant: store.get('variant', true) };
  function syncCpuSetup() {
    $$('#segCount button').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.v === cpuCfg.count); });
    $$('#segLevel button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === cpuCfg.level); });
    $('#cpuVariantRow').hidden = cpuCfg.count !== 2;
    $('#cpuVariant').checked = cpuCfg.variant;
    $('#cpuNote').textContent = cpuCfg.count === 2 && cpuCfg.variant ? '2人用ルール：2人とも手札0枚から集め、2人とも7枚で捨て場が12枚以上になったら終了します。' :
      '全員7枚ずつ配って始め、捨て場が10枚になったら終了します。' + (cpuCfg.level === 'easy' ? 'やさしいCPUは、いまの点数だけを見て、ときどき迷います。' : 'ふつうのCPUは、次に引くカードの見込みも考えます。');
  }
  $('#segCount').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cpuCfg.count = +b.dataset.v; store.set('count', cpuCfg.count); syncCpuSetup(); });
  $('#segLevel').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cpuCfg.level = b.dataset.v; store.set('level', cpuCfg.level); syncCpuSetup(); });
  $('#cpuVariant').addEventListener('change', function (e) { cpuCfg.variant = e.target.checked; store.set('variant', cpuCfg.variant); syncCpuSetup(); });
  $('#cpuStart').addEventListener('click', function () { startLocal(Object.assign({}, cpuCfg)); });

  function resetGameView() { app.v = null; app.pick = null; app.pending = false; app.lastK = -1; app.resultShown = false; viewQueue = []; scoreCache = {}; quickCache = {}; }
  function startLocal(cfg) {
    if (ctl) { try { ctl.destroy(); } catch (e) {} }
    resetGameView();
    if (TEST && params.get('seed')) cfg.seed = +params.get('seed');
    ctl = new LocalCtl(cfg);
    closeSheet(true);
    showScreen(null);
    ctl.start();
  }

  /* online */
  function onlineError(msg) { var e = $('#onErr'); e.textContent = msg; e.hidden = false; }
  function readName() {
    var name = NET.cleanName($('#onName').value);
    if (!name) { onlineError('名前を入れてください。'); $('#onName').focus(); return null; }
    store.set('name', name);
    return name;
  }
  $('#onCreate').addEventListener('click', function () {
    var name = readName(); if (!name) return;
    if (ctl) { try { ctl.destroy(); } catch (e) {} }
    resetGameView();
    var h = new HostCtl(name);
    ctl = h;
    $('#onCreate').disabled = true;
    h.open().then(function () {
      $('#onCreate').disabled = false;
      showScreen('scrLobby');
      h.syncLobby();
    }).catch(function (e) {
      $('#onCreate').disabled = false; ctl = null;
      onlineError(e && e.code === 'lib' ? '通信の部品を読みこめませんでした。ネットワークを確認してください。' : '部屋をつくれませんでした。少し待ってからもう一度試してください。');
    });
  });
  function joinRoom(code) {
    var name = readName(); if (!name) return;
    code = NET.cleanCode(code);
    if (code.length !== 4) { onlineError('部屋コードは4文字です。'); return; }
    if (ctl) { try { ctl.destroy(); } catch (e) {} }
    resetGameView();
    var g = new GuestCtl(name, code);
    ctl = g;
    $('#onJoin').disabled = true;
    g.join().then(function () { $('#onJoin').disabled = false; }).catch(function (e) {
      $('#onJoin').disabled = false; ctl = null;
      onlineError(e && e.code === 'notfound' ? 'その部屋が見つかりません。コードを確かめてください。' : e && e.code === 'lib' ? '通信の部品を読みこめませんでした。' : '部屋に入れませんでした。');
    });
  }
  $('#onJoin').addEventListener('click', function () { joinRoom($('#onCode').value); });
  $('#onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom($('#onCode').value); });

  function renderLobby(info, isHost) {
    $('#lobCode').textContent = info.code;
    $('#lobSeats').innerHTML = info.seats.map(function (s, i) {
      var kind = s.kind === 'host' ? '部屋をつくった人' : s.kind === 'cpu' ? 'CPU' : 'ゲスト';
      var you = (isHost && i === 0) || (!isHost && i === info.you);
      return '<div class="seat"><span class="av">' + esc(s.name.slice(0, 1)) + '</span><span class="nm">' + esc(s.name) + (you ? '（あなた）' : '') + '</span><span class="kind">' + kind + (s.away ? '・切断中' : '') + '</span>' +
        (isHost && i > 0 ? '<button class="x" data-rm="' + i + '" aria-label="' + esc(s.name) + 'を外す">外す</button>' : '') + '</div>';
    }).join('');
    $('#lobHostBtns').hidden = !isHost;
    $('#lobStart').hidden = !isHost;
    $('#lobStart').disabled = info.seats.length < 2;
    $('#lobVariantRow').hidden = !(isHost && info.seats.length === 2);
    $('#lobVariant').checked = info.variant;
    $('#lobNote').textContent = isHost ? (info.seats.length < 2 ? '部屋コードか招待リンクを送ってください。CPUを入れて始めることもできます（2〜6人）。' : info.seats.length + '人で始められます。') :
      '部屋をつくった人が始めるのを待っています。' + (info.seats.length === 2 && info.variant ? '（2人用ルール）' : '');
  }
  $('#lobSeats').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b && ctl && ctl.isHost) ctl.removeSeat(+b.dataset.rm); });
  $('#lobAddCpu').addEventListener('click', function () { if (ctl && ctl.isHost) ctl.addCpu(); });
  $('#lobVariant').addEventListener('change', function (e) { if (ctl && ctl.isHost) { ctl.variant = e.target.checked; ctl.syncLobby(); } });
  $('#lobInvite').addEventListener('click', function () {
    if (!ctl || !ctl.code) return;
    var url = location.origin + location.pathname + '?room=' + ctl.code + (NETKIND === 'local' ? '&net=local' : '');
    var done = function () { toast('招待リンクをコピーしました'); };
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { navigator.share({ title: 'ファンタジーレルムズ', text: '部屋コード ' + ctl.code, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { toast(url, 6000); }); else toast(url, 6000);
  });
  $('#lobStart').addEventListener('click', function () { if (ctl && ctl.isHost) ctl.start(); });
  $('#lobLeave').addEventListener('click', function () { goTitle(true); });

  /* ================================================================ start */
  drawMap();
  drawCrest();
  $('#loader').hidden = true;
  var room = params.get('room');
  if (room) {
    showScreen('scrOnline');
    $('#onName').value = store.get('name', '');
    $('#onCode').value = NET.cleanCode(room);
    if (store.get('name', '')) joinRoom(room);
  } else showScreen('scrTitle');

  // hooks for the browser test
  if (TEST) window.__gs = { app: app, get ctl() { return ctl; }, get busy() { return viewBusy || viewQueue.length > 0; }, E: E, startLocal: startLocal, showResult: showResult };
})();
