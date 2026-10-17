/* ヒトモジ・バトル — the app: screens, the table, the word sheet, solo and online play.
   Solo: a Table (session.js) runs here with CPUs in the other seats.
   Online: the host's browser runs the Table and sends every guest the public view; each guest keeps its own word
   (session.js Guest) and answers declarations itself.
   Every change arrives as (view, events); the presenter shows them one at a time so flips can be followed. */
(function () {
  'use strict';
  var E = window.HMB_ENG, W = window.HMB_WORDS, AI = window.HMB_AI, S = window.HMB_SES, N = window.HMB_NET;
  var X = E.X, SLOTS = E.SLOTS;
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  var params = new URLSearchParams(location.search);
  var TEST = params.get('test') === '1';
  var NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('hmb.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('hmb.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var sessionStore = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  var prefs = {
    name: store.get('name', ''), count: store.get('count', 4), level: store.get('level', 2), theme: store.get('theme', 'random'),
    mode: store.get('mode', 'ja'), maxLen: store.get('maxLen', 7), selfChain: store.get('selfChain', true),
    sound: store.get('sound', true), speed: store.get('speed', 1), marks: store.get('marks', true)
  };
  if (TEST && params.get('speed')) prefs.speed = Number(params.get('speed')) || 1;
  var LEVEL_NAME = S.LEVEL_NAME, CPU_NAMES = S.CPU_NAMES, MAX_SEATS = 6;
  var PC = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)'];
  var JA_COLS = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や_ゆ_よ', 'らりるれろ', 'わ___を', 'ん_ー__'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function myCid() {
    var c = sessionStore.get('hmb.cid');
    if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); sessionStore.set('hmb.cid', c); }
    return c;
  }
  var CID = myCid();

  /* ================================================================ sound (synthesized, no files) */
  var sfx = (function () {
    var ctx = null;
    function ac() {
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, t0, dur, type, vol, f2) {
      var c = ctx, t = c.currentTime + t0, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(t0, dur, vol, freq) {
      var c = ctx, t = c.currentTime + t0, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = 0.8; g.gain.value = vol;
      src.connect(f).connect(g).connect(c.destination); src.start(t);
    }
    var defs = {
      tap: function () { tone(660, 0, 0.05, 'triangle', 0.05); },
      pick: function () { tone(880, 0, 0.06, 'sine', 0.06); },
      declare: function () { noise(0, 0.14, 0.12, 3200); tone(540, 0.02, 0.1, 'triangle', 0.035, 820); },
      flip: function () { noise(0, 0.05, 0.1, 1500); tone(240, 0, 0.07, 'sine', 0.07, 150); },
      hit: function () { tone(523, 0, 0.09, 'triangle', 0.07); tone(784, 0.07, 0.14, 'triangle', 0.06); },
      miss: function () { tone(220, 0, 0.2, 'sine', 0.06, 160); },
      self: function () { tone(480, 0, 0.12, 'square', 0.03, 240); tone(300, 0.11, 0.22, 'square', 0.028, 140); },
      out: function () { tone(392, 0, 0.14, 'triangle', 0.07); tone(330, 0.13, 0.14, 'triangle', 0.07); tone(247, 0.26, 0.32, 'triangle', 0.07); },
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.24, 'triangle', 0.07); }); },
      turn: function () { tone(784, 0, 0.08, 'sine', 0.05); tone(988, 0.08, 0.12, 'sine', 0.05); },
      join: function () { tone(700, 0, 0.1, 'sine', 0.05, 900); }
    };
    return {
      play: function (k) { if (!prefs.sound) return; var c = ac(); if (!c) return; try { if (defs[k]) defs[k](); } catch (e) { /* ignore */ } },
      unlock: function () { if (prefs.sound) ac(); }
    };
  })();

  /* ================================================================ small UI pieces */
  function toast(msg, kind, ms) {
    var box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : ''); el.innerHTML = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { el.classList.add('bye'); setTimeout(function () { el.remove(); }, 320); }, ms || 2600);
  }
  function showScreen(id) {
    $$('.screen').forEach(function (s) { s.hidden = '#' + s.id !== id; });
    var inGame = !id;
    $('#topbar').hidden = !inGame; $('#table').hidden = !inGame;
  }
  var layerOnClose = null;
  function openLayer(html, opt) {
    opt = opt || {};
    var L = $('#layer');
    L.innerHTML = '<div class="scrim' + (opt.mid ? ' mid' : '') + '">' + html + '</div>';
    layerOnClose = opt.onClose || null;
    var scrim = L.firstChild;
    if (opt.closable !== false) {
      scrim.addEventListener('click', function (e) { if (e.target === scrim) closeLayer(); });
      $$('[data-close]', scrim).forEach(function (b) { b.onclick = closeLayer; });
    }
    var first = $('[autofocus]', scrim) || $('.sheet-b button, .sheet-b input', scrim);
    if (first && !('ontouchstart' in window)) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    return scrim;
  }
  function closeLayer() { var f = layerOnClose; layerOnClose = null; $('#layer').innerHTML = ''; if (f) f(); }
  function layerKind() { var s = $('#layer .sheet'); return s ? s.dataset.kind || '' : ''; }
  function sheet(kind, title, body, closable) {
    return '<div class="sheet" data-kind="' + kind + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-h"><h3>' + esc(title) + '</h3>' +
      (closable === false ? '' : '<button class="iconbtn" type="button" data-close aria-label="閉じる"><svg><use href="#i-close"/></svg></button>') + '</div><div class="sheet-b">' + body + '</div></div>';
  }

  /* hand-drawn marker strokes: a few shapes, picked by position so the board looks written on */
  var RINGS = [
    'M52 9 C80 8 95 34 93 62 C91 92 68 113 46 112 C20 111 6 86 8 58 C10 30 26 11 58 12',
    'M47 10 C75 6 96 30 94 61 C92 94 70 114 47 113 C22 112 5 88 7 59 C9 33 24 13 52 9',
    'M55 11 C83 13 94 40 92 66 C90 96 64 115 43 110 C19 105 7 82 9 55 C11 28 30 9 60 14'
  ];
  var SLASHES = ['M14 86 C34 66 62 40 88 14', 'M12 82 C36 64 60 42 86 12', 'M16 88 C40 62 58 44 84 18', 'M10 84 C38 60 66 36 90 16'];
  function ringSvg(i, h) { return '<svg class="ring" viewBox="0 0 100 ' + (h || 124) + '" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="' + RINGS[i % RINGS.length] + '"/></svg>'; }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* one piece. kind (space-separated): hid (back shows) | up (opened, ringed) | peek (your own, unopened) |
     known (word shown at the end, never opened) | x (an × piece) | w (written, in the word sheet) | e (empty face) */
  function tagHtml(kind, ch, pc, extra, delay, ringIdx) {
    var ks = String(kind || 'hid').split(' ');
    var cls = 'tag' + ks.filter(function (k) { return k !== 'hid'; }).map(function (k) { return ' ' + k; }).join('') + (extra ? ' ' + extra : '');
    var face = ks.indexOf('x') >= 0 ? '<span class="ltr">×</span>' : ch ? '<span class="ltr">' + esc(ch) + '</span>' : '';
    if (ks.indexOf('up') >= 0) face += ringSvg(ringIdx || 0);
    var style = '--pc:' + pc + (delay ? ';--d:' + delay.toFixed(2) + 's' : '');
    return '<span class="' + cls + '" style="' + style + '"><span class="card"><span class="back"></span><span class="face">' + face + '</span></span></span>';
  }

  /* ================================================================ the match */
  var match = null;      // { mode: 'solo'|'host'|'guest', table, brain, me, view, prev, q, busy, opts, series, lobby }
  var lobby = null;      // online room (host or guest)
  var matchSeq = 0;
  var sel = null;        // letter picked on the board, not declared yet

  function mySecret(m) {
    m = m || match;
    if (!m) return null;
    if (m.mode === 'guest') return m.brain ? m.brain.secret(m.view) : null;
    return m.table && m.table.local[m.me] || null;
  }
  function nameOf(v, q, me) { if (!v || !v.P[q]) return ''; return q === me ? 'あなた' : v.P[q].nm; }

  function newSeries(n) { return { wins: Array.from({ length: n }, function () { return 0; }), games: 0, next: Math.floor(Math.random() * n) }; }

  /* ---------------- presenting views, one at a time ---------------- */
  function present(m, view, ev) {
    if (match !== m) return;
    m.q.push({ view: view, ev: ev || [] });
    if (!m.busy) drain(m);
  }
  function drain(m) {
    if (match !== m) return;
    var item = m.q.shift();
    if (!item) { m.busy = false; return; }
    m.busy = true;
    var ms = apply(m, item.view, item.ev);
    if (m.q.length && ms > 0 && !item.ev.length) ms = 0;
    setTimeout(function () { drain(m); }, ms);
  }
  function scaleMs(ms) { return Math.round(ms / (prefs.speed || 1)); }

  function apply(m, view, ev) {
    var prev = m.view;
    m.prev = prev; m.view = view;
    var me = m.me, info = { flips: {}, fresh: null, pend: null }, ms = 0, n = 0;
    var kinds = ev.map(function (e) { return e.k; });
    if (sel && (view.phase !== 'play' || view.turn !== me || view.pend || view.used[sel])) sel = null;
    // which pieces turned over
    if (prev && prev.gid === view.gid) {
      var order = seatOrder(view, me);
      order.forEach(function (q) {
        for (var i = 0; i < SLOTS; i++) {
          var was = prev.P[q].open[i], now = view.P[q].open[i];
          if (!was && now) { info.flips[q + ':' + i] = (n++) * 0.11; }
        }
      });
    }
    var dec = null;
    ev.forEach(function (e) {
      if (e.k === 'pending') { info.pend = e.ch; sfx.play('declare'); ms = Math.max(ms, 380); }
      if (e.k === 'declare') { dec = e; info.fresh = e.ch; }
    });
    if (dec) {
      var hits = ev.filter(function (e) { return e.k === 'hit'; });
      var selfHit = hits.some(function (e) { return e.self; }), otherHit = hits.some(function (e) { return !e.self; });
      if (!hits.length) sfx.play('miss');
      else {
        for (var f = 0; f < Math.min(n, 8); f++) (function (f) { setTimeout(function () { sfx.play('flip'); }, scaleMs(f * 110 + 60)); })(f);
        setTimeout(function () { sfx.play(otherHit ? 'hit' : 'self'); }, scaleMs(n * 110 + 260));
      }
      ms = Math.max(ms, 420 + n * 110 + (hits.length ? 520 : 200));
      if (selfHit && !otherHit && dec.by === me) setTimeout(function () { toast('自爆！ 自分の文字が開きました', 'warn'); }, scaleMs(500));
    }
    ev.forEach(function (e) {
      if (e.k === 'out') { setTimeout(function () { sfx.play('out'); }, scaleMs(ms)); ms += 650; }
      if (e.k === 'forfeit') toast(esc(nameOf(view, e.seat, me)) + ' は棄権しました', 'warn');
      if (e.k === 'again' && e.seat === me) setTimeout(function () { sfx.play('turn'); }, scaleMs(ms));
      if (e.k === 'turn' && e.seat === me && view.phase === 'play') setTimeout(function () { sfx.play('turn'); }, scaleMs(ms));
      if (e.k === 'start') { toast('全員が書きました。' + esc(nameOf(view, view.turn, me)) + (view.turn === me ? 'から' : ' から') + 'スタート'); sfx.play('join'); ms = Math.max(ms, 500); }
      if (e.k === 'ready' && e.seat !== me && view.phase === 'write') sfx.play('tap');
    });
    render(m, info);
    if (view.phase === 'write' && !view.P[me].ready && !view.P[me].out && !mySecret(m) && layerKind() !== 'write' && (kinds.indexOf('write') >= 0 || (!m.writeDismissed && !$('#layer .scrim')))) openWrite();
    if (view.phase !== 'write' && layerKind() === 'write') closeLayer();
    if (kinds.indexOf('over') >= 0 && view.phase === 'over') {
      var won = view.winner === me;
      if (!m.counted) { m.counted = true; m.series.wins[view.winner] = (m.series.wins[view.winner] || 0) + 1; m.series.games++; }
      setTimeout(function () { sfx.play(won ? 'win' : 'out'); }, scaleMs(ms));
      setTimeout(function () { if (match === m && m.view.gid === view.gid) openResults(); }, scaleMs(ms + 900));
      ms += 900;
    }
    if (layerKind() === 'results' && view.phase === 'over') renderResults();
    return scaleMs(ms);
  }

  function seatOrder(v, me) { var out = []; for (var k = 0; k < v.n; k++) out.push(((me < 0 ? 0 : me) + k) % v.n); return out; }

  /* ---------------- drawing the table ---------------- */
  function render(m, info) {
    m = m || match; info = info || { flips: {} };
    if (!m || !m.view) return;
    var v = m.view, me = m.me, sec = mySecret(m);
    document.body.classList.toggle('en', v.mode === 'en');
    $('#themeName').textContent = v.theme.name;
    $('#roomChip').hidden = !m.lobby; if (m.lobby) $('#roomChip').textContent = m.lobby.code;
    // racks
    var html = seatOrder(v, me).map(function (q) { return rackHtml(m, q, sec, info); }).join('');
    $('#racks').style.setProperty('--n', v.n);
    $('#racks').innerHTML = html;
    // board
    renderBoard(m, info);
    renderCall(m, info);
    renderBar(m);
  }
  function rackHtml(m, q, sec, info) {
    var v = m.view, me = m.me, pl = v.P[q], pc = PC[q % PC.length];
    var cls = 'rack' + (q === me ? ' me' : '') + (v.phase === 'play' && v.turn === q && !pl.out ? ' turn' : '') + (pl.out && v.phase !== 'write' ? ' out' : '') + (v.phase === 'over' && v.winner === q ? ' win' : '');
    var st = '', away = m.mode === 'host' && m.seatsMeta[q] && m.seatsMeta[q].away && v.phase !== 'over' && !pl.out;
    if (away) st = '接続が切れています';
    else if (v.phase === 'write') st = pl.out ? '棄権' : pl.ready ? '書けた' : '書いています…';
    else if (v.phase === 'over') st = pl.place + '位' + (pl.forfeit ? '（棄権）' : '');
    else if (pl.out) st = pl.forfeit ? '棄権' : '脱落' + (pl.word ? '：' + pl.word : '');
    else if (v.turn === q) st = v.pend ? '判定中' : v.chain ? '連続攻撃' : '攻撃する番';
    else if (pl.kind === 'cpu') st = 'CPU・' + (LEVEL_NAME[pl.cpu] || '');
    var tags = '';
    for (var i = 0; i < SLOTS; i++) {
      var o = pl.open[i], key = q + ':' + i, d = info.flips[key], kind = 'hid', ch = '', extra = '';
      if (o === X) kind = 'x';
      else if (o) { kind = 'up'; ch = o; }
      else if (q === me && sec) { kind = sec.cells[i] === X ? 'peek x' : 'peek'; ch = sec.cells[i] === X ? '' : sec.cells[i]; }
      else if (pl.cells) { kind = pl.cells[i] === X ? 'x' : 'known'; ch = pl.cells[i] === X ? '' : pl.cells[i]; }
      if (d != null) extra = q === me && sec ? 'bump' : 'flip';
      tags += tagHtml(kind, ch, pc, extra, d, q * 7 + i);
    }
    var nm = q === me ? 'あなた' : pl.nm;
    var said = [];
    for (var j = 0; j < SLOTS; j++) if (pl.open[j] && pl.open[j] !== X) said.push((j + 1) + '枚目が「' + pl.open[j] + '」');
    var sr = (q === me && sec ? 'あなたの言葉は「' + sec.cells.filter(function (c) { return c !== X; }).join('') + '」。' : '') + (said.length ? said.join('、') : 'まだ開いたふだはありません');
    return '<div class="' + cls + '" style="--pc:' + pc + '"><div class="who"><span class="nm"><i></i><span>' + esc(nm) + '</span></span><span class="st">' + esc(st) + '</span><span class="sr">' + esc(sr) + '</span></div><div class="tags" aria-hidden="true">' + tags + '</div></div>';
  }
  function boardLetters(mode) {
    if (mode === 'en') return E.ABC.split('');
    var out = [];
    JA_COLS.forEach(function (col) { for (var r = 0; r < 5; r++) out.push(col[r] === '_' ? '' : col[r]); });
    return out;
  }
  function renderBoard(m, info) {
    var v = m.view, me = m.me, sec = mySecret(m), mine = {};
    if (sec && prefs.marks) for (var i = 0; i < SLOTS; i++) if (sec.cells[i] !== X && !v.P[me].open[i]) mine[sec.cells[i]] = 1;
    var myTurn = v.phase === 'play' && !v.pend && v.turn === me && !v.P[me].out && !m.waiting;
    var pendCh = v.pend ? v.pend.ch : null;
    var g = $('#board');
    g.className = 'grid' + (v.mode === 'en' ? ' en' : '');
    $('#boardWrap').classList.toggle('off', !myTurn);
    g.innerHTML = boardLetters(v.mode).map(function (ch) {
      if (!ch) return '<span class="k blank" aria-hidden="true"></span>';
      var u = v.used[ch], cls = 'k', inner = esc(ch), label = ch;
      if (u) {
        cls += ' used' + (info.fresh === ch ? ' fresh' : '');
        inner += '<svg class="slash" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="' + SLASHES[hash(ch) % SLASHES.length] + '"/></svg>';
        var who = Object.keys(u.hits).map(Number).sort(function (a, b) { return a - b; });
        if (who.length) inner += '<span class="dots" aria-hidden="true">' + who.map(function (q) { return '<i class="' + (q === u.by ? 'me' : '') + '" style="--pc:' + PC[q % PC.length] + '"></i>'; }).join('') + '</span>';
        label += who.length ? '（使用済み・' + who.map(function (q) { return nameOf(v, q, me); }).join('、') + 'が持っていた）' : '（使用済み・はずれ）';
      } else {
        if (mine[ch]) { cls += ' mine'; label += '（あなたの言葉にもある）'; }
        if (ch === pendCh) { cls += ' pend sel'; inner += '<svg class="circle" viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="' + RINGS[1] + '"/></svg>'; }
        else if (ch === sel) { cls += ' sel'; inner += '<svg class="circle" viewBox="0 0 100 124" preserveAspectRatio="none" aria-hidden="true"><path pathLength="100" d="' + RINGS[hash(ch) % RINGS.length] + '"/></svg>'; }
      }
      var dis = !myTurn || !!u;
      return '<button type="button" class="' + cls + '" data-ch="' + esc(ch) + '" aria-label="' + esc(label) + '"' + (dis ? ' disabled' : '') + (ch === sel ? ' aria-pressed="true"' : '') + '>' + inner + '</button>';
    }).join('');
  }
  function renderCall(m, info) {
    var v = m.view, me = m.me, box = $('#call');
    var rec = null, pending = v.pend;
    if (!pending && v.log.length) rec = v.log[v.log.length - 1];
    if (!pending && !rec) {
      box.innerHTML = v.phase === 'write' ? '' : '<div class="txt"><span class="res">' + (v.turn === me ? 'あなたから' : esc(v.P[v.turn].nm) + 'から') + 'はじめます</span></div>';
      box.classList.remove('fresh');
      return;
    }
    var ch = pending ? pending.ch : rec.ch, by = pending ? pending.by : rec.by;
    var res;
    if (pending) res = '<span class="res">判定中<span class="dots3"><i></i><i></i><i></i></span></span>';
    else {
      var parts = Object.keys(rec.hits).map(Number).sort(function (a, b) { return a - b; }).map(function (q) {
        return '<b>' + esc(nameOf(v, q, me)) + '</b> ' + rec.hits[q].length + '枚' + (q === rec.by ? '（自爆）' : '');
      });
      res = '<span class="res">' + (parts.length ? parts.join('・') : '<span class="miss">だれも持っていない（はずれ）</span>') +
        (rec.out.length ? '　<b>' + rec.out.map(function (q) { return esc(nameOf(v, q, me)); }).join('・') + ' 脱落</b>' : '') +
        (rec.again && v.phase === 'play' ? '　→ 連続攻撃' : '') + '</span>';
    }
    box.innerHTML = '<div class="big">' + esc(ch) + '<svg viewBox="0 0 100 100" aria-hidden="true"><path pathLength="100" d="' + RINGS[hash(ch) % RINGS.length] + '"/></svg></div>' +
      '<div class="txt"><span class="who">' + esc(nameOf(v, by, me)) + 'の攻撃</span>' + res + '</div>';
    box.classList.toggle('fresh', !!(info.pend || info.fresh));
    if (!pending && !Object.keys(rec.hits).length) { var p = $('.big svg', box); if (p) p.remove(); }
  }
  function renderBar(m) {
    var v = m.view, me = m.me, p = $('#prompt'), a = $('#actions'), pl = v.P[me];
    var html = '', act = '';
    if (v.phase === 'write') {
      if (!pl.ready && !pl.out) { html = 'お題にそった言葉を書いてください'; act = '<button class="btn primary" type="button" id="bWrite">書く</button>'; }
      else {
        var wait = v.P.map(function (x, q) { return !x.ready && !x.out ? nameOf(v, q, me) : null; }).filter(Boolean);
        html = 'ほかの人が書き終わるのを待っています<span class="dots3"><i></i><i></i><i></i></span><small>' + esc(wait.join('・')) + '</small>';
        if (m.mode === 'host') {
          var gone = v.P.map(function (x, q) { return q; }).filter(function (q) { return !v.P[q].ready && !v.P[q].out && m.seatsMeta[q] && m.seatsMeta[q].away; });
          if (gone.length) {
            html = esc(gone.map(function (q) { return v.P[q].nm; }).join('・')) + 'の接続が切れています<small>戻ってくるのを待つか、棄権にして始めます。</small>';
            if (gone.some(function (q) { return Date.now() - m.seatsMeta[q].away > 10000; })) act = '<button class="btn" type="button" id="bForfeit" data-seat="' + gone[0] + '">棄権にする</button>';
          }
        }
      }
    } else if (v.phase === 'over') {
      html = (v.winner === me ? 'あなたの勝ち！' : esc(v.P[v.winner].nm) + 'の勝ち') + (v.last ? '<small>最後の人たちが同じ文字で同時に脱落。言った人の勝ちです。</small>' : '');
      act = '<button class="btn primary" type="button" id="bResults">結果を見る</button>';
    } else if (v.pend || m.waiting) {
      var waitFor = v.pend ? v.pend.need.filter(function (q) { return !v.pend.got[q]; }) : [];
      html = '判定中<span class="dots3"><i></i><i></i><i></i></span>';
      if (m.mode === 'host' && waitFor.length) {
        var away = waitFor.filter(function (q) { return m.seatsMeta[q] && m.seatsMeta[q].away; });
        if (away.length) {
          html = esc(away.map(function (q) { return v.P[q].nm; }).join('・')) + 'の接続が切れています<small>戻ってくるのを待つか、棄権にして進めます。</small>';
          if (away.some(function (q) { return Date.now() - m.seatsMeta[q].away > 10000; })) act = '<button class="btn" type="button" id="bForfeit" data-seat="' + away[0] + '">棄権にする</button>';
        }
      }
    } else if (pl.out) {
      html = 'あなたは脱落しました。最後まで見届けましょう<small>' + esc(v.P[v.turn].nm) + 'の番です</small>';
    } else if (v.turn === me) {
      var sec = mySecret(m), selfHit = 0;
      if (sel && sec) for (var i = 0; i < SLOTS; i++) if (sec.cells[i] === sel && !pl.open[i]) selfHit++;
      if (sel) {
        var left = sec ? E.hiddenCount(sec.cells, pl.open) : 99;
        html = '「' + esc(sel) + '」で攻撃しますか？' + (selfHit ? '<small class="warn">あなたの言葉にも' + selfHit + '枚あります。言うと自分のふだも開きます' + (selfHit >= left ? '（全部開いて脱落）' : '') + '</small>' : '<small>' + (v.chain ? '連続攻撃の2回め。' : '') + '同じ文字をもう一度タップしても攻撃できます。</small>');
        act = '<span class="pick" aria-hidden="true">' + esc(sel) + '</span><button class="btn primary" type="button" id="bAttack">攻撃する</button>';
      } else html = v.chain ? '連続攻撃！ もう1文字えらべます<small>当たっても、この攻撃で手番はおわりです。</small>' : 'あなたの番です。50音から1文字えらんで攻撃<small>' + (prefs.marks ? '青い線はあなたの言葉にある文字。言うと自爆します。' : 'ほかの人が書いていそうな文字を言います。') + '</small>';
    } else {
      var t = v.P[v.turn];
      html = esc(t.nm) + 'の番です' + (t.kind === 'cpu' ? '<span class="dots3"><i></i><i></i><i></i></span>' : '') + (v.chain ? '<small>連続攻撃中</small>' : '');
      if (m.mode === 'host' && m.seatsMeta[v.turn] && m.seatsMeta[v.turn].away) {
        html = esc(t.nm) + 'の接続が切れています<small>戻ってくるのを待つか、棄権にして進めます。</small>';
        if (Date.now() - m.seatsMeta[v.turn].away > 10000) act = '<button class="btn" type="button" id="bForfeit" data-seat="' + v.turn + '">棄権にする</button>';
      }
    }
    p.innerHTML = html; a.innerHTML = act;
    var b;
    if ((b = $('#bWrite'))) b.onclick = function () { m.writeDismissed = false; openWrite(); };
    if ((b = $('#bResults'))) b.onclick = openResults;
    if ((b = $('#bAttack'))) b.onclick = attack;
    if ((b = $('#bForfeit'))) b.onclick = function () { var q = Number(this.dataset.seat); if (m.table) m.table.forfeit(q); };
  }

  /* ---------------- acting ---------------- */
  function onBoardClick(e) {
    var b = e.target.closest('.k');
    if (!b || b.disabled || !match) return;
    var ch = b.dataset.ch;
    sfx.unlock();
    if (sel === ch) { attack(); return; }       // tapping the circled letter again declares it
    sel = ch; sfx.play('pick');
    renderBoard(match, { flips: {} }); renderBar(match);
  }
  function attack() {
    var m = match;
    if (!m || !sel) return;
    var v = m.view, ch = sel;
    if (E.canDeclare(v, m.me, ch)) return;
    sel = null;
    if (m.mode === 'guest') {
      var r = m.brain.declare(ch);
      if (r.ok) { m.waiting = true; clearTimeout(m.waitTo); m.waitTo = setTimeout(function () { if (match === m) { m.waiting = false; render(m); } }, 5000); render(m); }
    } else m.table.declare(m.me, ch);
  }

  /* ================================================================ writing the word */
  function openWrite() {
    var m = match;
    if (!m || !m.view) return;
    var v = m.view, me = m.me;
    if (v.phase !== 'write' || v.P[me].ready || v.P[me].out) return;
    var en = v.mode === 'en';
    var body = '<div class="wtheme"><span>お題</span><b>' + esc(v.theme.name) + '</b></div>' +
      '<div class="wprev"><div class="tags" id="wTags"></div><div class="wconv" id="wConv"></div></div>' +
      '<label class="field"><span>' + (en ? '英単語（A〜Z）' : 'あなたの言葉（ひらがな・カタカナ）') + '</span><input class="input" id="wIn" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="24" placeholder="' + (en ? '例：LION' : '例：ジャガー、らいおん') + '"' + (en ? ' autocapitalize="characters"' : '') + '></label>' +
      '<p class="werr" id="wErr"></p>' +
      '<div class="row">' + (v.theme.id === 'custom' ? '' : '<button class="btn" type="button" id="wRand">おまかせ</button>') + '<button class="btn" type="button" id="wPadT" aria-expanded="false">文字ボタン</button><button class="btn primary" type="button" id="wOk">これで書く</button></div>' +
      '<div id="wPad" hidden><div class="pad' + (en ? ' en' : '') + '" id="wPadKeys"></div><div class="pad-tools"><button class="btn sm" type="button" id="wDel">1文字けす</button><button class="btn sm" type="button" id="wClr">ぜんぶけす</button></div></div>' +
      '<p class="rules-short">' + (en ? '2〜' + v.maxLen + '文字の英単語。スペースや記号は消えます。あまったふだは×になります。' :
        '「゛」「゜」は書きません（が→か、ぱ→は）。小さい字は大きく（ゃ→や、っ→つ）。「ー」はそのまま1文字。2〜' + v.maxLen + '文字で、あまったふだは×。') +
      'ほかの人には見えません' + (m.mode === 'guest' ? '（言葉はこの端末から出ません）' : '') + '。</p>';
    var scrim = openLayer(sheet('write', '言葉を書く', body, true), { onClose: function () { if (match === m) { m.writeDismissed = true; render(m); } } });
    var inp = $('#wIn', scrim);
    function update() {
      var r = E.normalize(inp.value, v.mode, v.maxLen), cells = r.cells.slice(0, SLOTS), tags = '', pc = PC[me % PC.length];
      for (var i = 0; i < SLOTS; i++) tags += i < cells.length ? tagHtml('w', cells[i], pc) : tagHtml(r.ok ? 'w x' : 'e', '', pc);
      $('#wTags', scrim).innerHTML = tags;
      var word = inp.value.trim(), conv = r.cells.join('');
      $('#wConv', scrim).innerHTML = word && conv && conv !== word && !en ? esc(word) + ' → <b>' + esc(conv) + '</b>' : r.len ? r.len + '文字' : '';
      $('#wErr', scrim).textContent = word ? E.errorText(r, v.mode) : '';
      $('#wOk', scrim).disabled = !r.ok;
      return r;
    }
    inp.addEventListener('input', update);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
    if ($('#wRand', scrim)) $('#wRand', scrim).onclick = function () { inp.value = AI.suggest(v.mode, v.theme.id, v.maxLen); update(); sfx.play('pick'); };
    $('#wPadT', scrim).onclick = function () {
      var p = $('#wPad', scrim), open = p.hidden;
      p.hidden = !open; this.setAttribute('aria-expanded', String(open));
      if (open && !$('#wPadKeys', scrim).children.length) {
        $('#wPadKeys', scrim).innerHTML = boardLetters(v.mode).map(function (ch) { return ch ? '<button type="button" data-ch="' + esc(ch) + '">' + esc(ch) + '</button>' : '<button type="button" class="blank" tabindex="-1" aria-hidden="true"></button>'; }).join('');
      }
    };
    $('#wPadKeys', scrim).addEventListener('click', function (e) { var b = e.target.closest('button[data-ch]'); if (!b) return; inp.value += b.dataset.ch; update(); sfx.play('tap'); });
    $('#wDel', scrim).onclick = function () { inp.value = Array.from(inp.value).slice(0, -1).join(''); update(); };
    $('#wClr', scrim).onclick = function () { inp.value = ''; update(); };
    function submit() {
      var r = update();
      if (!r.ok) { if (!inp.value.trim()) $('#wErr', scrim).textContent = E.errorText(r, v.mode); return; }
      var cells = E.pad(r.cells), res;
      if (m.mode === 'guest') res = m.brain.write(cells, r.word);
      else res = m.table.writeLocal(me, cells, r.word);
      if (res && res.ok) { layerOnClose = null; closeLayer(); sfx.play('join'); render(m); }
      else $('#wErr', scrim).textContent = '書けませんでした。もう一度ためしてください。';
    }
    $('#wOk', scrim).onclick = submit;
    update();
  }

  /* ================================================================ results */
  function openResults() {
    var m = match;
    if (!m || !m.view || m.view.phase !== 'over') return;
    openLayer(sheet('results', '結果', '<div id="resBody"></div>', true), { mid: true });
    renderResults();
  }
  function renderResults() {
    var m = match, box = $('#resBody');
    if (!m || !box) return;
    var v = m.view, me = m.me;
    var rows = v.P.map(function (p, q) { return q; }).sort(function (a, b) { return v.P[a].place - v.P[b].place || a - b; });
    var html = '<p class="win-title">' + (v.winner === me ? 'あなたの勝ち！' : esc(v.P[v.winner].nm) + 'の勝ち') + '</p>';
    if (v.last) html += '<p class="note" style="text-align:center">最後の人たちが同じ文字で同時に脱落。言った人の勝ちです。</p>';
    html += '<div class="res-list">' + rows.map(function (q) {
      var p = v.P[q], pc = PC[q % PC.length], cells = p.cells || (q === me && mySecret(m) ? mySecret(m).cells : null);
      var tags = '';
      if (cells) for (var i = 0; i < SLOTS; i++) tags += cells[i] === X ? tagHtml('x', '', pc) : tagHtml(p.open[i] ? 'up' : 'known', cells[i], pc, '', null, q * 7 + i);
      var say = p.word || (q === me && mySecret(m) ? mySecret(m).disp : '');
      var chk = '';
      if (m.mode !== 'solo' && p.cells) chk = p.ok ? '<span class="chk">最初に約束した言葉と、すべての答えが一致</span>' : '<span class="chk bad">言葉か答えが一致しません（' + ({ hash: '約束した言葉とちがう', answer: 'どこかの答えがちがう', out: '脱落の申告がちがう', cells: '書き方がちがう' }[p.why] || '不一致') + '）</span>';
      if (p.forfeit) chk = '<span class="chk bad">棄権</span>';
      else if (!p.cells && m.mode === 'host') chk = '<span class="chk">言葉の確認を待っています…</span>';
      return '<div class="res-row' + (p.place === 1 ? ' first' : '') + '" style="--pc:' + pc + '"><span class="pl">' + p.place + '<small>位</small></span>' +
        '<span class="nm"><i></i>' + esc(q === me ? (p.nm && p.nm !== 'あなた' ? 'あなた（' + p.nm + '）' : 'あなた') : p.nm) + '</span>' +
        '<span class="wd">' + (cells ? '<span class="tags">' + tags + '</span>' : '') + (say ? '<span class="say">' + esc(say) + '</span>' : '') + '</span>' + chk + '</div>';
    }).join('') + '</div>';
    if (m.series.games > 1) html += '<p class="series">これまで ' + m.series.games + ' 回：' + v.P.map(function (p, q) { return esc(q === me ? 'あなた' : p.nm) + ' ' + (m.series.wins[q] || 0) + '勝'; }).join('、') + '</p>';
    if (m.mode === 'guest') html += '<p class="note" style="text-align:center">もう一度遊ぶかどうかは、ホストが決めます。</p><div class="row"><button class="btn ghost" type="button" id="rQuit">部屋を出る</button></div>';
    else html += '<div class="row">' + (m.mode === 'host' ? '<button class="btn ghost" type="button" id="rLobby">部屋にもどる</button>' : '<button class="btn ghost" type="button" id="rTitle">タイトルへ</button>') + '<button class="btn primary" type="button" id="rAgain">もう一度</button></div>';
    box.innerHTML = html;
    var b;
    if ((b = $('#rAgain'))) b.onclick = function () { closeLayer(); if (m.mode === 'host') startHostMatch(lobby, true); else startSolo(true); };
    if ((b = $('#rTitle'))) b.onclick = function () { closeLayer(); quitToTitle(); };
    if ((b = $('#rLobby'))) b.onclick = function () { closeLayer(); hostBackToLobby(); };
    if ((b = $('#rQuit'))) b.onclick = function () { closeLayer(); quitToTitle(); };
  }

  /* ================================================================ menu, rules, log, settings */
  function openMenu() {
    var m = match, inGame = !!m;
    var body = '<div class="menu-list">' +
      '<button class="btn" type="button" data-k="rules">あそびかた</button>' +
      (inGame ? '<button class="btn" type="button" data-k="log">これまでの攻撃</button>' : '') +
      '<button class="btn" type="button" data-k="settings">設定</button>' +
      (inGame ? '<button class="btn" type="button" data-k="quit">' + (m.mode === 'solo' ? 'やめてタイトルへ' : '部屋を出る') + '</button>' : '') +
      '<a class="btn" href="../games/">PLAYROOMへ戻る</a></div>';
    var scrim = openLayer(sheet('menu', 'メニュー', body), {});
    $$('[data-k]', scrim).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.k;
        if (k === 'rules') openRules();
        else if (k === 'log') openLog();
        else if (k === 'settings') openSettings();
        else if (k === 'quit') confirmQuit();
      };
    });
  }
  function confirmQuit() {
    var m = match;
    if (!m || m.view.phase === 'over') { closeLayer(); quitToTitle(); return; }
    var body = '<p>' + (m.mode === 'host' ? 'あなたが部屋を出ると、この対戦はおわります。' : m.mode === 'guest' ? '部屋を出ると、あなたは棄権になります。' : 'この対戦をやめて、タイトルにもどります。') + '</p><div class="row"><button class="btn ghost" type="button" data-close>つづける</button><button class="btn primary" type="button" id="qYes">やめる</button></div>';
    var scrim = openLayer(sheet('quit', 'やめますか？', body), { mid: true });
    $('#qYes', scrim).onclick = function () { closeLayer(); quitToTitle(); };
  }
  function openRules() {
    var t = function (w, mode) { var r = E.normalize(w, mode || 'ja'); var cells = E.pad(r.cells); return '<span class="tags">' + cells.map(function (c, i) { return c === X ? tagHtml('w x', '', 'var(--p1)') : tagHtml('w', c, 'var(--p1)'); }).join('') + '</span>'; };
    var body =
      '<p>お題にそった言葉を、7枚のふだにこっそり書きます。順番に50音から1文字ずつ言って攻撃。その文字が書かれたふだは、だれのものでも全部開きます。最後まで言葉を隠し通した人の勝ちです。</p>' +
      '<h4>言葉の書き方</h4><ul><li>お題にそった2〜7文字の言葉。ひらがなで書きます（カタカナで入れても、ひらがなになります）。</li><li>「゛」「゜」は書きません。小さい字は大きく書きます。「ー」はそのまま1文字です。</li><li>あまったふだには×を書きます。×は攻撃されません。</li></ul>' +
      '<div class="ex">スパゲッティ<br>' + t('スパゲッティ') + '<br>ジャガー<br>' + t('ジャガー') + '</div>' +
      '<h4>攻撃</h4><ul><li>自分の番に、ボードの文字を1つ言います。言った文字は斜線で消え、もう使えません。</li><li>その文字が書かれたふだは、全員ぶん開きます。同じ文字が2枚あれば2枚とも。<b>自分の言葉にある文字を言うと、自分のふだも開きます（自爆）。</b></li><li>1枚でも開いたら、もう1回だけ続けて言えます（自爆でもOK）。1回の番で言えるのは2文字までです。だれも持っていなければ、次の人の番です。</li></ul>' +
      '<h4>脱落と勝ち</h4><ul><li>×以外のふだが全部開いたら脱落。×も見せて、言葉を明かします。</li><li>最後まで残った1人の勝ち。残った人たちが同じ文字で同時に全部開いたときは、その文字を言った人の勝ちです。</li><li>相手の言葉がわかっても、口で当てるのはなし。かならず1文字ずつ攻撃します。</li></ul>' +
      '<h4>このブラウザ版で</h4><ul><li>ボードの青い線は、あなたの言葉にまだ隠れている文字の印です（設定で消せます）。</li><li>オンラインでは、言葉はあなたの端末から出ません。最初に言葉の「ハッシュ（指紋）」だけを送り、攻撃のたびに開く場所だけを答えます。言葉が明かされたとき、全員の画面で最初の約束とすべての答えを照合します。</li><li>「なんでも」は、お題なしで好きな言葉を書くモード。「アルファベット」は、ボード裏面の英語で遊ぶモードです。</li><li>CPUはテーブルに見えていることだけで考えます。ほかの人の言葉はのぞきません。</li></ul>' +
      '<p class="note">原作：『あいうえバトル』ゲームデザイン 米光一成。Anaguma版（第二版・2〜6人）と、幻冬舎eduの新版（2024年・2〜5人）があります。このページは原作のルールで遊べる非公式のファンメイド版で、お題とことばリストは独自に作成しました。</p>';
    openLayer(sheet('rules', 'あそびかた', body), {});
  }
  function openLog() {
    var m = match;
    if (!m) return;
    var v = m.view, me = m.me;
    var items = v.log.slice().reverse().map(function (r) {
      var hits = Object.keys(r.hits).map(Number).map(function (q) { return esc(nameOf(v, q, me)) + ' ' + r.hits[q].length + '枚' + (q === r.by ? '（自爆）' : ''); });
      return '<li><span class="n">' + r.ply + '</span><span>' + esc(nameOf(v, r.by, me)) + '「<b>' + esc(r.ch) + '</b>」' + (hits.length ? '→ ' + hits.join('、') : '→ はずれ') +
        (r.out.length ? ' <span class="ko">' + r.out.map(function (q) { return esc(nameOf(v, q, me)); }).join('・') + ' 脱落</span>' : '') + (r.again ? ' <span class="again">連続攻撃</span>' : '') + '</span></li>';
    }).join('');
    openLayer(sheet('log', 'これまでの攻撃', items ? '<ol class="log-list">' + items + '</ol>' : '<p class="note">まだだれも攻撃していません。</p>'), {});
  }
  function openSettings() {
    var body = '<label class="check"><input type="checkbox" id="sSound"' + (prefs.sound ? ' checked' : '') + '><span>効果音</span></label>' +
      '<label class="check"><input type="checkbox" id="sMarks"' + (prefs.marks ? ' checked' : '') + '><span>ボードに自分の文字の印を出す<small>青い線のある文字を言うと、自分のふだも開きます。</small></span></label>' +
      '<div class="field"><span>進む速さ（CPUと演出）</span><div class="seg" id="sSpeed"><button type="button" data-v="0.7">ゆっくり</button><button type="button" data-v="1">ふつう</button><button type="button" data-v="1.6">はやい</button></div></div>';
    var scrim = openLayer(sheet('settings', '設定', body), {});
    $('#sSound', scrim).onchange = function () { prefs.sound = this.checked; store.set('sound', prefs.sound); renderSound(); if (prefs.sound) sfx.play('pick'); };
    $('#sMarks', scrim).onchange = function () { prefs.marks = this.checked; store.set('marks', prefs.marks); if (match) render(match); };
    segInit($('#sSpeed', scrim), prefs.speed, function (x) { prefs.speed = Number(x); store.set('speed', prefs.speed); if (match && match.table) match.table.speed = prefs.speed; });
  }
  function renderSound() { $('#btnSound').classList.toggle('off', !prefs.sound); $('#btnSound').setAttribute('aria-pressed', String(prefs.sound)); }

  /* ================================================================ solo */
  function themeOptions(mode, cur, custom) {
    var o = '<option value="random">おまかせ（毎回ちがうお題）</option><option value="free">なんでも（お題なし）</option>';
    o += W.list(mode).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    if (custom) o += '<option value="custom">じぶんで決める</option>';
    return o;
  }
  function pickTheme(mode, choice, customText) {
    if (choice === 'custom') return { id: 'custom', name: E.cleanDisplay(customText).slice(0, 16) || 'じゆうなお題' };
    var t = choice === 'random' ? null : W.theme(mode, choice);
    if (!t) { var L = W.list(mode); t = L[Math.floor(Math.random() * L.length)]; }
    return { id: t.id, name: t.name };
  }
  function soloName() { return N.cleanName($('#soloName').value) || 'あなた'; }
  function startSolo(again) {
    var prev = again && match && match.mode === 'solo' ? match : null;
    leaveGame();
    var n = prev ? prev.view.n : Math.min(MAX_SEATS, Math.max(2, prefs.count | 0));
    var opts = prev ? prev.opts : { mode: prefs.mode, theme: prefs.theme, maxLen: prefs.maxLen, selfChain: prefs.selfChain, level: prefs.level, name: soloName() };
    var series = prev ? prev.series : newSeries(n);
    var seats = [{ nm: opts.name, kind: 'me' }];
    for (var i = 1; i < n; i++) seats.push({ nm: CPU_NAMES[(i - 1) % CPU_NAMES.length], kind: 'cpu', cpu: opts.level });
    var first = series.next % n; series.next = (series.next + 1) % n;
    var m = { mode: 'solo', id: ++matchSeq, me: 0, q: [], busy: false, opts: opts, series: series, seatsMeta: {}, counted: false };
    match = m;
    m.table = new S.Table({ seats: seats, mode: opts.mode, theme: pickTheme(opts.mode, opts.theme), maxLen: opts.maxLen, selfChain: opts.selfChain, first: first, speed: prefs.speed, onUpdate: function (view, ev) { present(m, view, ev); } });
    showScreen(null);
    m.table.start();
  }
  function leaveGame() {
    var m = match;
    match = null; sel = null;
    if (m) { if (m.table && m.mode === 'solo') m.table.close(); if (m.table && m.mode === 'host') m.table.close(); clearTimeout(m.waitTo); }
    closeLayer();
  }
  function quitToTitle() {
    var m = match;
    if (m && m.mode !== 'solo') closeLobby(true);
    leaveGame();
    document.body.classList.remove('en');
    showScreen('#scrTitle');
  }

  /* ================================================================ online: shared */
  function netErr(e) {
    var c = e && e.code;
    if (c === 'lib') return '通信ライブラリを読み込めませんでした。通信状況を確かめてください。';
    if (c === 'notfound') return 'その部屋が見つかりません。コードを確かめてください。';
    if (c === 'taken') return '部屋をつくれませんでした。もう一度ためしてください。';
    return '接続できませんでした。少し待ってから、もう一度ためしてください。';
  }
  function onlineErr(msg) { var e = $('#onErr'); e.textContent = msg || ''; e.hidden = !msg; }
  function resetOnlineUI() { $('#onCreate').disabled = false; $('#onJoin').disabled = false; onlineErr(''); }
  function rememberName() { var n = N.cleanName($('#onName').value); prefs.name = n; store.set('name', n); return n; }
  function closeLobby(quit) {
    var L = lobby;
    if (!L) return;
    lobby = null;
    try { if (L.role === 'host') L.link.broadcast({ k: 'bye' }); else L.link.send({ k: 'bye', quit: !!quit }); } catch (e) { /* ignore */ }
    setTimeout(function () { L.link.close(); }, 120);
  }

  /* ================================================================ online: host */
  async function hostRoom() {
    onlineErr('');
    var name = rememberName();
    if (!name) { onlineErr('名前を入れてください'); $('#onName').focus(); return; }
    $('#onCreate').disabled = true;
    var link = N.makeHost(NETKIND), code = null, lastErr = null;
    for (var i = 0; i < 4 && !code; i++) {
      var c = N.makeCode();
      try { await link.host(c); code = c; } catch (e) { lastErr = e; if (e.code !== 'taken') break; }
    }
    if (!code) { $('#onCreate').disabled = false; onlineErr(netErr(lastErr)); return; }
    var L = lobby = { role: 'host', link: link, code: code, seats: [{ kind: 'host', nm: name, cid: CID }], opts: { mode: prefs.mode, theme: prefs.theme === 'custom' ? 'random' : prefs.theme, custom: '', maxLen: prefs.maxLen, selfChain: prefs.selfChain } };
    link.on('msg', function (cid, msg) { onHostMsg(L, cid, msg); });
    link.on('leave', function (cid) { onGuestGone(L, cid); });
    showLobby();
  }
  function lobbySeats(L) { return L.seats.map(function (s) { return { nm: s.nm, kind: s.kind, level: s.level || 0, here: s.here !== false }; }); }
  function pushLobby(L, back) {
    if (match && match.mode === 'host' && match.lobby === L) return;      // the room list only changes between games
    var seats = lobbySeats(L);
    L.seats.forEach(function (s, i) { if (s.kind === 'guest') L.link.send(s.cid, { k: 'lobby', seats: seats, you: i, code: L.code, opts: L.opts, back: !!back }); });
    if (lobby === L && !match) renderLobby({ seats: seats, you: 0, code: L.code, opts: L.opts });
  }
  function onHostMsg(L, cid, msg) {
    if (lobby !== L || !msg || typeof msg !== 'object') return;
    if (msg.k === 'hello') {
      if (msg.v !== N.PROTOCOL) { L.link.send(cid, { k: 'old' }); return; }
      var nm = N.cleanName(msg.nm) || 'ゲスト';
      var m = match && match.mode === 'host' && match.lobby === L ? match : null;
      if (m && m.view && m.view.phase !== 'over') {
        var p = m.table.seats.findIndex(function (s) { return s.kind === 'guest' && s.cid === cid; });
        if (p < 0) { L.link.send(cid, { k: 'busy' }); L.link.drop(cid); return; }
        if (m.seatsMeta[p]) m.seatsMeta[p].away = 0;
        L.link.send(cid, { k: 'start', view: m.table.view(), you: p, code: L.code, resume: true });
        toast(esc(m.table.seats[p].nm) + ' がもどりました');
        render(m);
        return;
      }
      var seat = L.seats.find(function (s) { return s.kind === 'guest' && s.cid === cid; });
      if (seat) { seat.nm = nm; seat.here = true; }
      else if (L.seats.length >= MAX_SEATS) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
      else { L.seats.push({ kind: 'guest', nm: nm, cid: cid, here: true }); toast(esc(nm) + ' が入りました'); sfx.play('join'); }
      if (m && m.view && m.view.phase === 'over') { L.link.send(cid, { k: 'lobby', seats: lobbySeats(L), you: L.seats.findIndex(function (s) { return s.cid === cid; }), code: L.code, opts: L.opts, waiting: true }); return; }
      pushLobby(L);
      return;
    }
    if (msg.k === 'bye') {
      onGuestGone(L, cid);
      var mq = match && match.mode === 'host' && match.lobby === L ? match : null;
      if (msg.quit && mq && mq.view && mq.view.phase !== 'over') { var qs = mq.table.seats.findIndex(function (s) { return s.kind === 'guest' && s.cid === cid; }); if (qs >= 0) mq.table.forfeit(qs); }
      return;
    }
    var m2 = match;
    if (!m2 || m2.mode !== 'host' || m2.lobby !== L) return;
    var seatIx = m2.table.seats.findIndex(function (s) { return s.kind === 'guest' && s.cid === cid; });
    if (seatIx < 0) return;
    S.hostHandle(m2.table, seatIx, msg);
  }
  function onGuestGone(L, cid) {
    if (lobby !== L) return;
    var m = match && match.mode === 'host' && match.lobby === L ? match : null;
    if (m) {
      var p = m.table.seats.findIndex(function (s) { return s.kind === 'guest' && s.cid === cid; });
      if (p >= 0 && !(m.seatsMeta[p] && m.seatsMeta[p].away)) {
        m.seatsMeta[p] = { away: Date.now() };
        if (m.view.phase !== 'over') toast(esc(m.table.seats[p].nm) + ' の接続が切れました', 'warn', 3200);
        render(m);
        setTimeout(function () { if (match === m) render(m); }, 10500);
      }
      var s0 = L.seats.find(function (s) { return s.cid === cid; });
      if (s0) s0.here = false;
      return;
    }
    var i = L.seats.findIndex(function (s) { return s.kind === 'guest' && s.cid === cid; });
    if (i > 0) { var nm = L.seats[i].nm; L.seats.splice(i, 1); toast(esc(nm) + ' が出ました', 'warn'); pushLobby(L); }
  }
  function addCpu(L) {
    if (L.seats.length >= MAX_SEATS) return;
    var used = L.seats.map(function (s) { return s.nm; });
    var nm = CPU_NAMES.find(function (x) { return used.indexOf(x) < 0; }) || 'CPU';
    L.seats.push({ kind: 'cpu', nm: nm, level: prefs.level || 2 });
    pushLobby(L);
  }
  function startHostMatch(L, again) {
    if (!L || lobby !== L || L.role !== 'host') return;
    var prev = again && match && match.mode === 'host' && match.lobby === L ? match : null;
    if (prev) L.seats = L.seats.filter(function (s) { return s.kind !== 'guest' || s.here !== false; });
    var seatsL = L.seats.slice(0, MAX_SEATS);
    clearTimeout(L.customTo);
    if (seatsL.length < 2) { lobbyErr('2人以上で始められます。CPUを入れることもできます。'); leaveGame(); showLobby(); return; }
    if (L.opts.theme === 'custom' && seatsL.some(function (s) { return s.kind === 'cpu'; })) { lobbyErr('じぶんで決めたお題は、CPUなしで遊べます。'); return; }
    var n = seatsL.length;
    var series = prev && prev.series.wins.length === n ? prev.series : newSeries(n);
    var first = series.next % n; series.next = (series.next + 1) % n;
    leaveGame();
    var seats = seatsL.map(function (s) { return s.kind === 'host' ? { nm: s.nm, kind: 'me' } : s.kind === 'cpu' ? { nm: s.nm, kind: 'cpu', cpu: s.level || 2 } : { nm: s.nm, kind: 'guest', cid: s.cid }; });
    var m = { mode: 'host', id: ++matchSeq, me: 0, q: [], busy: false, opts: L.opts, series: series, lobby: L, seatsMeta: {}, counted: false };
    match = m;
    m.table = new S.Table({
      seats: seats, mode: L.opts.mode, theme: pickTheme(L.opts.mode, L.opts.theme, L.opts.custom), maxLen: L.opts.maxLen, selfChain: L.opts.selfChain, first: first, speed: prefs.speed,
      onUpdate: function (view, ev) { if (lobby === L) L.link.broadcast({ k: 'upd', view: view, ev: ev }); present(m, view, ev); }
    });
    showScreen(null);
    var v = m.table.view();
    seats.forEach(function (s, i) { if (s.kind === 'guest') L.link.send(s.cid, { k: 'start', view: v, you: i, code: L.code }); });
    m.table.start();
  }
  function hostBackToLobby() {
    var L = lobby;
    if (!L || L.role !== 'host') return;
    leaveGame();
    L.seats = L.seats.filter(function (s) { return s.kind !== 'guest' || s.here !== false; });
    showScreen('#scrLobby');
    pushLobby(L, true);
  }
  function lobbyErr(msg) { var e = $('#lobErr'); e.textContent = msg || ''; e.hidden = !msg; }
  function showLobby() {
    var L = lobby;
    if (!L) return;
    showScreen('#scrLobby');
    if (L.role === 'host') pushLobby(L);
    else if (L.last) renderLobby(L.last);
  }
  function renderLobby(d) {
    var L = lobby;
    if (!L) return;
    var host = L.role === 'host', o = d.opts || {};
    $('#lobCode').textContent = d.code || L.code;
    $('#lobNote').textContent = host ? '友だちにこのコードか招待リンクを送ってください。2〜6人で遊べます。' : d.waiting ? '前の対戦がおわるまで待っています…' : 'ホストがスタートするのを待っています…';
    $('#lobSeats').innerHTML = d.seats.map(function (s, i) {
      return '<div class="seat' + (s.here === false ? ' away' : '') + '" style="--pc:' + PC[i % PC.length] + '"><span class="sw"></span><span class="nm">' + esc(s.nm) + (i === d.you ? '（あなた）' : '') + '</span>' +
        '<span class="who2">' + (s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU' : 'ゲスト') + '</span>' +
        (host && s.kind === 'cpu' ? '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map(function (lv) { return '<option value="' + lv + '"' + (lv === s.level ? ' selected' : '') + '>' + LEVEL_NAME[lv] + '</option>'; }).join('') + '</select>' : s.kind === 'cpu' ? '<span class="who2">' + LEVEL_NAME[s.level || 2] + '</span>' : '') +
        (host && i > 0 ? '<button class="x" type="button" data-rm="' + i + '" aria-label="外す">✕</button>' : '') + '</div>';
    }).join('');
    // options
    var th = $('#lobTheme');
    var mode = o.mode || 'ja';
    if (th.dataset.mode !== mode) { th.innerHTML = themeOptions(mode, o.theme, true); th.dataset.mode = mode; }
    th.value = o.theme || 'random'; if (!th.value) th.value = 'random';
    th.disabled = !host;
    $('#lobCustomField').hidden = o.theme !== 'custom';
    if (!host || document.activeElement !== $('#lobCustom')) $('#lobCustom').value = o.custom || '';
    $('#lobCustom').disabled = !host;
    segInit($('#lobMode'), mode, host ? function (x) { L.opts.mode = x; if (L.opts.theme !== 'random' && L.opts.theme !== 'free' && L.opts.theme !== 'custom' && !W.theme(x, L.opts.theme)) L.opts.theme = 'random'; pushLobby(L); } : null);
    segInit($('#lobLen'), o.maxLen || 7, host ? function (x) { L.opts.maxLen = Number(x); pushLobby(L); } : null);
    $('#lobSelf').checked = o.selfChain !== false; $('#lobSelf').disabled = !host;
    var thName = o.theme === 'random' ? 'おまかせ' : o.theme === 'free' ? 'なんでも' : o.theme === 'custom' ? (o.custom || 'じぶんで決める') : ((W.theme(mode, o.theme) || {}).name || '');
    $('#lobRule').textContent = 'お題：' + thName + '／' + (mode === 'en' ? 'アルファベット' : 'ひらがな') + '／2〜' + (o.maxLen || 7) + '文字／自爆で連続攻撃' + (o.selfChain !== false ? 'あり' : 'なし');
    $('#lobAddCpu').hidden = !host || d.seats.length >= MAX_SEATS;
    $('#lobHostTools').hidden = !host;
    $('#lobStart').hidden = !host;
    $('#lobStart').disabled = d.seats.length < 2;
    $('#lobInvite').hidden = !host;
    if (host) {
      $$('[data-rm]', $('#lobSeats')).forEach(function (b) {
        b.onclick = function () {
          var i = Number(b.dataset.rm), s = L.seats[i];
          if (!s) return;
          L.seats.splice(i, 1);
          if (s.kind === 'guest') { L.link.send(s.cid, { k: 'kick' }); L.link.drop(s.cid); }
          pushLobby(L);
        };
      });
      $$('[data-lv]', $('#lobSeats')).forEach(function (s) { s.onchange = function () { var x = L.seats[Number(s.dataset.lv)]; if (x) { x.level = Number(s.value); pushLobby(L); } }; });
    }
  }

  /* ================================================================ online: guest */
  async function joinRoom(codeArg) {
    onlineErr('');
    var name = rememberName();
    if (!name) { onlineErr('名前を入れてください'); $('#onName').focus(); return; }
    var code = N.cleanCode(codeArg || $('#onCode').value);
    if (code.length !== 4) { onlineErr('4文字の部屋コードを入れてください'); return; }
    $('#onJoin').disabled = true;
    var link = N.makeGuest(NETKIND);
    try { await link.join(code); } catch (e) { $('#onJoin').disabled = false; onlineErr(netErr(e)); return; }
    var L = lobby = { role: 'guest', link: link, code: code, last: null };
    link.on('msg', function (msg) { onGuestMsg(L, msg); });
    link.on('close', function () { onHostGone(L); });
    link.send({ k: 'hello', cid: CID, nm: name, v: N.PROTOCOL });
    sessionStore.set('hmb.room', JSON.stringify({ code: code, at: Date.now() }));
    showScreen('#scrLobby');
    renderLobby({ seats: [{ nm: name, kind: 'guest', here: true }], you: 0, code: code, opts: {} });
    $('#lobNote').textContent = '接続しました。ホストからの返事を待っています…';
  }
  function onGuestMsg(L, msg) {
    if (lobby !== L || !msg || typeof msg !== 'object') return;
    if (msg.k === 'full') { failGuest(L, 'この部屋はもういっぱいです'); return; }
    if (msg.k === 'busy') { failGuest(L, 'この部屋はいま対戦中です。おわってから、もう一度入ってください'); return; }
    if (msg.k === 'old') { failGuest(L, 'ホストのページと版がちがいます。両方とも再読み込みしてください'); return; }
    if (msg.k === 'kick') { failGuest(L, 'ホストに外されました'); return; }
    if (msg.k === 'bye') { onHostGone(L); return; }
    if (msg.k === 'lobby') {
      L.last = { seats: msg.seats, you: msg.you, code: msg.code, opts: msg.opts || {}, waiting: msg.waiting };
      if (match && match.lobby === L && match.view && match.view.phase !== 'over' && !msg.back) return;   // a late room update: the game goes on
      if (match && match.lobby === L && !(match.view && match.view.phase === 'over' && msg.waiting)) leaveGame();
      if (!match) { showScreen('#scrLobby'); renderLobby(L.last); }
      return;
    }
    if (msg.k === 'start' && msg.view) {
      var v = msg.view;
      var prev = match && match.mode === 'guest' && match.lobby === L ? match : null;
      var series = prev && prev.series.wins.length === v.n ? prev.series : newSeries(v.n);
      if (match) leaveGame();
      var m = { mode: 'guest', id: ++matchSeq, me: msg.you, q: [], busy: false, lobby: L, series: series, seatsMeta: {}, counted: false, opts: {} };
      m.brain = new S.Guest({ send: function (x) { L.link.send(x); }, store: sessionStore, key: 'hmb.sec.' + L.code });
      match = m;
      showScreen(null);
      m.brain.onView(v, msg.you);
      present(m, v, msg.resume ? [] : [{ k: 'write' }]);
      if (msg.resume) toast('対戦にもどりました');
      return;
    }
    var m2 = match;
    if (!m2 || m2.mode !== 'guest' || m2.lobby !== L) return;
    if (msg.k === 'upd' && msg.view) {
      if (msg.view.gid !== (m2.view && m2.view.gid) && m2.view) return;
      m2.waiting = false; clearTimeout(m2.waitTo);
      m2.brain.onView(msg.view, m2.me);
      present(m2, msg.view, Array.isArray(msg.ev) ? msg.ev : []);
    }
  }
  function failGuest(L, text) {
    if (lobby !== L) return;
    lobby = null; L.link.close();
    if (match && match.lobby === L) leaveGame();
    showScreen('#scrOnline'); resetOnlineUI(); onlineErr(text);
  }
  function onHostGone(L) {
    if (lobby !== L || L.gone) return;
    L.gone = true;
    if (match && match.lobby === L && match.view && match.view.phase !== 'over') {
      var scrim = openLayer(sheet('gone', '接続が切れました', '<p>ホストとの接続が切れました。</p><button class="btn primary" type="button" id="hQuit">タイトルへ</button>', false), { mid: true, closable: false });
      $('#hQuit', scrim).onclick = function () { closeLayer(); lobby = null; quitToTitle(); };
      return;
    }
    failGuest(L, 'ホストとの接続が切れました');
  }

  /* ================================================================ wiring */
  function segInit(box, cur, fn) {
    $$('button', box).forEach(function (b) {
      b.setAttribute('aria-pressed', String(String(cur) === b.dataset.v));
      b.disabled = !fn;
      b.onclick = fn ? function () { $$('button', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); sfx.play('tap'); fn(b.dataset.v); } : null;
    });
  }
  function fillSoloTheme() {
    var sel0 = $('#soloTheme');
    sel0.innerHTML = themeOptions(prefs.mode, prefs.theme, false);
    sel0.value = prefs.theme; if (!sel0.value) { sel0.value = 'random'; }
  }
  function wire() {
    $('#logoTags').innerHTML = ['ヒ', 'ト', 'モ', 'ジ'].map(function (c, i) { return tagHtml(i === 2 ? 'hid' : 'up', c, 'var(--p1)', '', null, i); }).join('');
    $('#goSolo').onclick = function () { sfx.unlock(); showScreen('#scrSolo'); };
    $('#goOnline').onclick = function () { sfx.unlock(); resetOnlineUI(); showScreen('#scrOnline'); };
    $('#goRules').onclick = openRules;
    $$('[data-back]').forEach(function (b) { b.onclick = function () { if (lobby && !match) closeLobby(); resetOnlineUI(); showScreen('#scrTitle'); }; });
    $('#soloName').value = prefs.name;
    $('#soloName').addEventListener('change', function () { prefs.name = N.cleanName(this.value); store.set('name', prefs.name); $('#onName').value = prefs.name; });
    segInit($('#segCount'), prefs.count, function (x) { prefs.count = Number(x); store.set('count', prefs.count); });
    segInit($('#segLevel'), prefs.level, function (x) { prefs.level = Number(x); store.set('level', prefs.level); });
    segInit($('#segMode'), prefs.mode, function (x) { prefs.mode = x; store.set('mode', x); if (prefs.theme !== 'random' && prefs.theme !== 'free' && !W.theme(x, prefs.theme)) { prefs.theme = 'random'; store.set('theme', 'random'); } fillSoloTheme(); });
    segInit($('#segLen'), prefs.maxLen, function (x) { prefs.maxLen = Number(x); store.set('maxLen', prefs.maxLen); });
    $('#soloSelf').checked = prefs.selfChain !== false;
    $('#soloSelf').onchange = function () { prefs.selfChain = this.checked; store.set('selfChain', prefs.selfChain); };
    fillSoloTheme();
    $('#soloTheme').onchange = function () { prefs.theme = this.value; store.set('theme', prefs.theme); };
    $('#soloStart').onclick = function () { sfx.unlock(); prefs.name = N.cleanName($('#soloName').value); store.set('name', prefs.name); startSolo(false); };
    $('#onName').value = prefs.name;
    $('#onCreate').onclick = function () { sfx.unlock(); hostRoom(); };
    $('#onJoin').onclick = function () { sfx.unlock(); joinRoom(); };
    $('#onCode').addEventListener('input', function (e) { e.target.value = N.cleanCode(e.target.value); });
    $('#onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });
    $('#lobAddCpu').onclick = function () { if (lobby && lobby.role === 'host') { sfx.play('tap'); addCpu(lobby); } };
    $('#lobStart').onclick = function () { if (lobby && lobby.role === 'host') { sfx.unlock(); lobbyErr(''); startHostMatch(lobby, false); } };
    $('#lobLeave').onclick = function () { closeLobby(); resetOnlineUI(); showScreen('#scrOnline'); };
    $('#lobTheme').onchange = function () { if (lobby && lobby.role === 'host') { lobby.opts.theme = this.value; prefs.theme = this.value === 'custom' ? prefs.theme : this.value; pushLobby(lobby); } };
    $('#lobCustom').addEventListener('input', function () { if (lobby && lobby.role === 'host') { lobby.opts.custom = E.cleanDisplay(this.value).slice(0, 16); clearTimeout(lobby.customTo); var L = lobby; L.customTo = setTimeout(function () { pushLobby(L); }, 300); } });
    $('#lobSelf').onchange = function () { if (lobby && lobby.role === 'host') { lobby.opts.selfChain = this.checked; pushLobby(lobby); } };
    $('#lobInvite').onclick = async function () {
      if (!lobby) return;
      var url = location.origin + location.pathname + '?room=' + lobby.code;
      try { if (navigator.share) { await navigator.share({ title: 'ヒトモジ・バトル', text: '部屋コード ' + lobby.code, url: url }); return; } } catch (e) { /* fall through */ }
      try { await navigator.clipboard.writeText(url); toast('招待リンクをコピーしました'); } catch (e) { toast(esc(url), '', 6000); }
    };
    $('#board').addEventListener('click', onBoardClick);
    $('#btnMenu').onclick = function () { sfx.unlock(); openMenu(); };
    $('#btnSound').onclick = function () { prefs.sound = !prefs.sound; store.set('sound', prefs.sound); renderSound(); if (prefs.sound) { sfx.unlock(); sfx.play('pick'); } };
    $('#btnHome').onclick = function (e) { if (match && match.view && match.view.phase !== 'over' && match.mode !== 'solo') { e.preventDefault(); confirmQuit(); } };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#layer .scrim') && $('#layer [data-close]')) closeLayer(); });
    window.addEventListener('pagehide', function () { if (lobby) closeLobby(); });
    renderSound();
  }

  function boot() {
    wire();
    showScreen('#scrTitle');
    var room = N.cleanCode(params.get('room') || '');
    if (!room) { try { var r = JSON.parse(sessionStore.get('hmb.room') || 'null'); if (r && Date.now() - r.at < 3 * 3600 * 1000) room = r.code; } catch (e) { /* ignore */ } }
    if (room) { $('#onCode').value = room; if (params.get('room')) showScreen('#scrOnline'); }
    if (TEST) window.__hmb = {
      E: E, AI: AI, S: S, N: N, prefs: prefs,
      get match() { return match; }, get view() { return match && match.view; }, get lobby() { return lobby; },
      startSolo: startSolo, openResults: openResults,
      secret: function () { return mySecret(); },
      busy: function () { return !!(match && (match.busy || match.q.length)); },
      pick: function (ch) { sel = ch; if (match) render(match); }, attack: attack
    };
  }
  boot();
})();
