/* ガイスター — the page: screens, the board, CPU games, one-device games and online rooms.
   A game lives in one place (engine.js): in this browser for CPU and one-device games, in the host's browser online.
   Whatever is drawn comes from one player's view (engine.viewFor), so a colour that player may not see is never in
   the page. ?test=1 shortens the animations and opens window.__gst for the browser check; ?net=local plays online
   rooms over BroadcastChannel between tabs. */
(function () {
  'use strict';
  var E = window.GST_ENG, AI = window.GST_AI, N = window.GST_NET, RIVALS = window.PLAYROOM_RIVAL;
  var params = new URLSearchParams(location.search);
  var TEST = params.get('test') === '1';
  var NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
  var WORKER_URL = 'cpu-worker.js?v=20261025-1';
  var LEVELS = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい', 4: '最強', 5: '成長する敵' };
  var LEVEL_NOTES = {
    1: '気まぐれに動きます。ルールを覚えるのにどうぞ。',
    2: '一手先の取り合いを考えます。',
    3: '三手ほど先まで読み、動きからおばけの色を推理します。',
    4: 'もっと深く読み、はったりにも気をつけます。いちばん強いCPUです。',
    5: '最強と同じ強さから始まり、あなたに負けるたびに学習します。あなたのおばけの並べ方や動かし方のくせも覚えます。'
  };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, TEST ? Math.min(ms, 30) : ms); }); };
  if (TEST) document.documentElement.classList.add('fast');

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('gst.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('gst.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem('gst.' + k); } catch (e) { /* ignore */ } }
  };
  var prefs = Object.assign({ sound: true, level: 3, first: 'random', name: '', names: ['', ''], layout: null }, store.get('prefs', {}));
  function savePrefs() { store.set('prefs', prefs); }
  var rival = RIVALS ? RIVALS.open('geister', { base: AI.GROW_BASE, space: AI.GROW_SPACE, boostStep: 0.3, boostMax: 2.5 }) : null;

  /* ================================================================ sound (synthesised, no files) */
  var SND = (function () {
    var ctx = null;
    function ac() {
      if (!prefs.sound) return null;
      if (ctx === null) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = false; } }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx || null;
    }
    function tone(f, dur, type, vol, at, f2) {
      var c = ac(); if (!c) return;
      var t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function hiss(dur, vol, at, from, to) {
      var c = ac(); if (!c) return;
      var t = c.currentTime + (at || 0), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = b; f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t); s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
    }
    return {
      unlock: function () { ac(); },
      pick: function () { tone(740, 0.07, 'sine', 0.07); },
      move: function () { tone(190, 0.09, 'triangle', 0.22); hiss(0.05, 0.08, 0, 1800, 900); },
      swap: function () { tone(520, 0.06, 'sine', 0.07); tone(660, 0.06, 'sine', 0.06, 0.06); },
      take: function () { hiss(0.32, 0.18, 0, 600, 3200); },
      good: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'sine', 0.09, 0.05 + i * 0.07); }); },
      bad: function () { tone(220, 0.5, 'triangle', 0.14, 0.05, 140); tone(233, 0.5, 'sine', 0.06, 0.05, 150); },
      escape: function () { tone(392, 0.7, 'sine', 0.12, 0, 1568); [1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.06, 0.35 + i * 0.08); }); },
      turn: function () { tone(988, 0.16, 'sine', 0.05); },
      win: function () { [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.1, i * 0.12); }); },
      lose: function () { [392, 349, 311, 262].forEach(function (f, i) { tone(f, 0.4, 'sine', 0.09, i * 0.18); }); }
    };
  })();
  document.addEventListener('pointerdown', function () { SND.unlock(); }, { capture: true, once: true });

  /* ================================================================ ghosts as markup */
  var G3D = '<div class="g3d"><svg class="face front" viewBox="0 0 100 100"><use href="#gBody"/><use href="#gFace"/></svg>' +
    '<svg class="face back" viewBox="0 0 100 100"><use href="#gBody"/><use href="#gDot"/></svg></div>';
  function mini(cls) { return '<svg viewBox="0 0 100 100" class="' + (cls || '') + '"><use href="#gBody"/><use href="#gDot"/></svg>'; }
  function miniFace() { return '<svg viewBox="0 0 100 100" style="--body:#fffef1;--edge:#c7cabe"><use href="#gBody"/><use href="#gFace"/></svg>'; }
  /* a small ghost for the room list: the host's from behind (brass mark), the guest's face */
  function seatIcon(face) {
    return face
      ? '<svg viewBox="0 0 100 100" style="width:26px;height:26px;--body:#DCD5EF;--edge:#837CA3;--eye:#2B2740"><use href="#gBody"/><use href="#gFace"/></svg>'
      : '<svg viewBox="0 0 100 100" style="width:26px;height:26px;--body:#F4F1E7;--edge:#9C97B3;--dot:var(--brass)"><use href="#gBody"/><use href="#gDot"/></svg>';
  }
  function miniStyle(good) { return 'style="--body:#F4F1E7;--edge:#9C97B3;--dot:' + (good ? 'var(--good)' : 'var(--bad)') + '"'; }

  /* ================================================================ the board */
  var cellsEl = $('#cells'), ghostsEl = $('#ghosts'), hintsEl = $('#hints'), marksEl = $('#marks'), boardEl = $('#board');
  var cellBtns = [], ghostEls = [];
  for (var d0 = 0; d0 < 36; d0++) {
    var b = document.createElement('button');
    b.className = 'cell' + ((((d0 / 6) | 0) + (d0 % 6)) % 2 ? ' alt' : '');
    b.dataset.d = d0; b.type = 'button';
    b.setAttribute('aria-label', '横' + (d0 % 6 + 1) + '・縦' + (((d0 / 6) | 0) + 1));
    cellsEl.appendChild(b); cellBtns.push(b);
  }
  for (var id0 = 0; id0 < 16; id0++) {
    var g = document.createElement('div');
    g.className = 'gh'; g.dataset.id = id0; g.innerHTML = G3D;
    ghostsEl.appendChild(g); ghostEls.push(g);
  }
  [0, 5, 30, 35].forEach(function (d) {
    var m = document.createElement('div');
    m.className = 'mark'; m.dataset.d = d; m.setAttribute('aria-label', '盤外への出口');
    m.style.left = 'calc(' + (d % 6) + ' * var(--cell))'; m.style.top = 'calc(' + ((d / 6) | 0) + ' * var(--cell))';
    m.innerHTML = '<svg viewBox="0 0 40 40"><use href="#iExit"/></svg><span class="lbl"></span>';
    marksEl.appendChild(m);
  });

  var landscape = window.matchMedia('(min-aspect-ratio:5/4)');
  /* the board as large as it fits: beside the panel when the screen is wide, between the two players' rows when tall */
  function fit() {
    var st = document.documentElement.style, bs;
    if (landscape.matches) {
      var r = $('#boardWrap').getBoundingClientRect();
      if (!r.width || !r.height) return;
      bs = Math.min(r.width - 18, r.height - 18) / 1.05;
    } else {
      var app = $('#app'), cs = getComputedStyle(app);
      var w = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var h = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      h -= $('#topbar').offsetHeight + $('#sideOpp').offsetHeight + $('#sideMe').offsetHeight + $('#bar').offsetHeight;
      bs = Math.min(w - 18, h - 18) / 1.05;
    }
    bs = Math.max(150, Math.min(Math.floor(bs), 760));
    st.setProperty('--bs', bs + 'px');
    // messages go where nothing needs to be read: the side panel, or the space above the opponent's row
    if (landscape.matches) {
      var b = $('#bar').getBoundingClientRect();
      st.setProperty('--toast-top', Math.round(b.top + 8) + 'px'); st.setProperty('--toast-bottom', 'auto');
      st.setProperty('--toast-left', Math.round(b.left + b.width / 2) + 'px'); st.setProperty('--toast-w', Math.round(b.width - 20) + 'px');
    } else {
      var o = $('#sideOpp').getBoundingClientRect();
      st.setProperty('--toast-top', 'auto'); st.setProperty('--toast-bottom', Math.round(window.innerHeight - o.top + 6) + 'px');
      st.setProperty('--toast-left', '50%'); st.setProperty('--toast-w', 'min(92vw,420px)');
    }
  }
  window.addEventListener('resize', fit);
  if (landscape.addEventListener) landscape.addEventListener('change', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe($('#app'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  /* ================================================================ the match */
  var M = null;      // { mode: 'cpu'|'local'|'host'|'guest', s, view, seat, names, level, cpu, layout, sel, busy, token, ... }
  var L = null;      // the online link: { role, code, link, guest, ... }
  var setupDrag = null, setupClickBlockUntil = 0;

  function viewNow() {
    if (!M) return null;
    if (M.mode === 'guest' || M.mode === 'tournament') return M.view;
    return E.viewFor(M.s, M.seat < 0 ? -1 : M.seat);
  }
  function seatOf() { return M && M.seat >= 0 ? M.seat : 0; }
  function disp(q) { return seatOf() === 1 ? 35 - q : q; }
  function nameOf(p) { return M.names[p]; }
  function oppName() { return M.mode === 'cpu' ? 'CPU' : nameOf(1 - seatOf()); }

  /* ---------------------------------------------------------------- drawing */
  function place(el, d) { el.style.setProperty('--x', d % 6); el.style.setProperty('--y', (d / 6) | 0); }
  function render() {
    if (!M) return;
    var v = viewNow(), me = seatOf(), op = 1 - me, setup = v.phase === 'setup';
    var editing = setup && !v.ready[me] && M.seat >= 0 && M.layout;
    if (setupDrag && !validSetupDrag(setupDrag)) endSetupDrag(false);
    var over = v.phase === 'over';
    // cells
    var home = {};
    if (editing) E.homeSquares(me).forEach(function (q) { home[disp(q)] = true; });
    var last = v.log.length ? v.log[v.log.length - 1] : null;
    cellBtns.forEach(function (c, d) {
      c.classList.toggle('home', !!home[d]);
      c.classList.toggle('setup-draggable', !!home[d]);
      c.classList.toggle('last-f', !!last && disp(last.f) === d && !over);
      c.classList.toggle('last-t', !!last && last.t >= 0 && disp(last.t) === d && !over);
    });
    // exits
    var mineEx = E.exitsOf(me).map(disp), canEsc = escapable(v);
    $$('.mark', marksEl).forEach(function (m) {
      var d = +m.dataset.d, mine = mineEx.indexOf(d) >= 0;
      m.className = 'mark ' + (mine ? 'mine' : 'theirs') + (mine && canEsc.some(function (q) { return disp(q) === d; }) ? ' open' : '');
      $('.lbl', m).textContent = mine ? '出口' : '';
    });
    // ghosts
    for (var id = 0; id < 16; id++) {
      var x = v.g[id], el = ghostEls[id], own = x.o === me && M.seat >= 0;
      var at = x.st === 'on' ? x.at : -1, good = x.good;
      if (x.st === 'wait') { at = E.slotSquare(x.o, id & 7); if (own && editing) good = M.layout[id & 7] === 1; }
      if (M.hideIds && M.hideIds[id]) at = -1;
      el.classList.toggle('gone', at < 0);
      if (at >= 0) place(el, disp(at));
      el.classList.toggle('mine', own); el.classList.toggle('theirs', !own);
      var known = good === true || good === false;
      var shown = own || (M.spectator && known) || (over && known && M.revealed && M.revealed[id]);
      el.classList.toggle('good', known && good === true && (own || shown));
      el.classList.toggle('bad', known && good === false && (own || shown));
      el.classList.toggle('turned', !!shown || (own && known));
      el.classList.toggle('sel', M.sel != null && at === M.sel && own);
    }
    // hints
    hintsEl.innerHTML = '';
    if (editing && M.sel != null) {
      E.homeSquares(me).forEach(function (q) { if (q !== M.sel) addHint(disp(q), 'swap'); });
    } else if (!setup && !over && M.sel != null && myTurn(v)) {
      E.movesFrom(v, M.sel).forEach(function (a) {
        if (a.t === E.EXIT) { addHint(disp(a.f), 'exit'); return; }
        addHint(disp(a.t), v.board[a.t] >= 0 ? 'cap' : '');
      });
    }
    // trays: what each side has taken
    trays(v, me);
    // names and turn
    $('#nmMe').innerHTML = esc(M.seat < 0 ? nameOf(0) : nameOf(me)) + '<small>' + esc(sideNote(v, me)) + '</small>';
    $('#nmOpp').innerHTML = esc(M.seat < 0 ? nameOf(1) : oppName()) + '<small>' + esc(sideNote(v, op)) + '</small>';
    $('#sideMe').classList.toggle('turn', v.phase === 'play' && v.turn === me);
    $('#sideOpp').classList.toggle('turn', v.phase === 'play' && v.turn === op);
    $('#hudPly').textContent = v.ply + '手' + (v.ply >= 240 ? ' / ' + v.limit : '');
    boardEl.classList.toggle('locked', !canAct(v));
    prompt(v);
    if (M.mode === 'tournament' && window.GST_TOUR) window.GST_TOUR.renderStatus();
  }
  function addHint(d, kind) {
    var h = document.createElement('div');
    h.className = 'hint ' + (kind || '');
    h.style.left = 'calc(' + (d % 6) + ' * var(--cell))'; h.style.top = 'calc(' + ((d / 6) | 0) + ' * var(--cell))';
    if (kind === 'exit') {
      var right = d % 6 === 5;
      h.innerHTML = '<svg viewBox="0 0 40 40" style="' + (right ? 'transform:scaleX(-1)' : '') + '"><use href="#iArrow"/></svg>';
      h.style.setProperty('--ex', right ? '3px' : '-3px'); h.style.setProperty('--ey', '-3px');
    }
    if (kind === 'swap') h.className = 'hint';
    hintsEl.appendChild(h);
  }
  function trays(v, me) {
    var op = 1 - me;
    // ghosts of `owner` captured, in the order they were taken
    function taken(owner) {
      var out = [];
      v.log.forEach(function (m) { if (m.cap >= 0 && (m.cap >> 3) === owner) out.push(m.cap); });
      return out.filter(function (id) { return !(M.flying && M.flying[id]); });
    }
    function fill(el, ids, good) {
      var slots = $$('i', el), list = ids.filter(function (id) { return v.g[id].good === good; });
      slots.forEach(function (s, k) {
        var on = k < list.length;
        s.classList.toggle('on', on);
        s.innerHTML = on ? mini() : '';
        if (on) s.firstChild.setAttribute('style', '--body:#F4F1E7;--edge:#9C97B3;--dot:' + (good ? 'var(--good)' : 'var(--bad)'));
      });
      el.classList.toggle('hot', list.length === 3);
    }
    var mineTaken = taken(op), theirsTaken = taken(me);
    fill($('#meBlue'), mineTaken, true); fill($('#meRed'), mineTaken, false);
    fill($('#oppBlue'), theirsTaken, true); fill($('#oppRed'), theirsTaken, false);
  }
  function sideNote(v, p) {
    if (!M) return '';
    if (v.phase === 'setup') return v.ready[p] ? '並べ終わりました' : (M.mode === 'cpu' && p === M.cpu ? '' : '並べています');
    if (v.phase === 'over') return v.winner === p ? '勝ち' : v.winner === -1 ? '引き分け' : '';
    if (v.turn === p) {
      if (M.mode === 'cpu' && p === M.cpu) return M.thinking ? '考えています…' : 'の番';
      return 'の番';
    }
    if (M.mode === 'cpu' && p === M.cpu) return LEVELS[M.level];
    if ((M.mode === 'host' && p === 1) || (M.mode === 'guest' && p === 0)) return L && L.away ? '接続が切れています' : 'オンライン';
    return '';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function myTurn(v) { return v.phase === 'play' && M.seat >= 0 && v.turn === M.seat && (!M.ctrl || M.ctrl.indexOf(M.seat) >= 0); }
  function canAct(v) {
    if (!M || M.busy || M.seat < 0 || (M.ctrl && M.ctrl.indexOf(M.seat) < 0)) return false;
    if (v.phase === 'setup') return !v.ready[M.seat];
    return myTurn(v) && !M.waiting;
  }
  /* my good ghosts that stand on one of my exits now (only on my turn) */
  function escapable(v) {
    if (!M || !myTurn(v) || M.busy) return [];
    return E.legal(v, M.seat).filter(function (a) { return a.t === E.EXIT; }).map(function (a) { return a.f; });
  }

  /* ---------------------------------------------------------------- the prompt and its buttons */
  function prompt(v) {
    var p = $('#prompt'), acts = $('#actions'), me = seatOf();
    acts.innerHTML = '';
    var text = '', small = '';
    if (v.phase === 'setup') {
      if (M.seat >= 0 && !v.ready[me] && (!M.ctrl || M.ctrl.indexOf(me) >= 0)) {
        text = 'おばけの並びを決めましょう';
        small = M.sel != null ? '入れ替える相手をタップ。長押しで持ち上げて移動もできます' : '2つをタップで入れ替え。長押ししてドラッグでも並べ替えできます';
        button('ランダム', function () { endSetupDrag(false); M.layout = E.randomLayout(Math.random); M.sel = null; SND.swap(); render(); }, 'small');
        button('決定', confirmSetup, 'small primary');
      } else {
        text = M.mode === 'cpu' ? 'CPUを待っています' : (oppName() + 'が並べ終わるのを待っています');
        small = '相手には、あなたのおばけの色は見えません';
      }
    } else if (v.phase === 'over') {
      text = resultLine(v);
      button('結果', showResult, 'small primary');
    } else if (myTurn(v)) {
      var ex = escapable(v);
      if (ex.length) {
        text = '青いおばけが出口にいます';
        small = '盤の外へ逃がせば勝ちです';
        button('逃がす', function () { act({ f: ex[0], t: E.EXIT }); }, 'small primary');
      } else if (M.sel != null) { text = '動かす先をタップ'; small = '前後左右に1マス。相手のおばけのマスに入ると取れます'; }
      else { text = 'あなたの番です'; small = '動かすおばけをタップ'; }
      if (M.mode === 'local') text = nameOf(me) + 'さんの番です';
    } else {
      if (M.mode === 'cpu') { text = 'CPUが考えています'; p.classList.add('thinking'); }
      else if (M.mode === 'guest' || M.mode === 'host' || M.mode === 'tournament') text = oppName() + 'の番です';
      else text = '';
      if (L && L.away) small = '相手との接続が切れています。戻ってくるのを待っています';
    }
    p.classList.toggle('thinking', v.phase === 'play' && !myTurn(v) && M.mode === 'cpu');
    p.innerHTML = esc(text) + (small ? '<small>' + esc(small) + '</small>' : '');
    function button(label, fn, cls) {
      var b = document.createElement('button');
      b.className = 'btn ' + (cls || ''); b.type = 'button'; b.textContent = label;
      b.onclick = fn; acts.appendChild(b);
    }
  }

  /* ---------------------------------------------------------------- taps on the board */
  cellsEl.addEventListener('click', function (e) {
    // A long press/drop must not also run the ordinary two-tap operation.
    if (e.detail !== 0 && Date.now() < setupClickBlockUntil) { e.preventDefault(); return; }
    var c = e.target.closest('.cell'); if (!c || !M) return;
    var d = +c.dataset.d, q = disp(d), v = viewNow();
    if (!canAct(v)) return;
    if (v.phase === 'setup') return tapSetup(q, v);
    var id = v.board[q], me = M.seat;
    if (M.sel != null) {
      var moves = E.movesFrom(v, M.sel), hit = moves.filter(function (a) { return a.t === q; })[0];
      if (hit) { act(hit); return; }
      if (q === M.sel) {
        var out = moves.filter(function (a) { return a.t === E.EXIT; })[0];
        if (out) { act(out); return; }               // tapping a good ghost on its exit again lets it out
        M.sel = null; render(); return;
      }
    }
    if (id >= 0 && v.g[id].o === me) { M.sel = q; SND.pick(); render(); return; }
    M.sel = null; render();
  });
  function tapSetup(q, v) {
    var me = M.seat, k = E.homeSquares(me).indexOf(q);
    if (k < 0) { M.sel = null; render(); return; }
    if (M.sel == null) { M.sel = q; SND.pick(); render(); return; }
    var k0 = E.homeSquares(me).indexOf(M.sel);
    if (k0 === k) { M.sel = null; render(); return; }
    var t = M.layout[k0]; M.layout[k0] = M.layout[k]; M.layout[k] = t;
    M.sel = null; SND.swap();
    // the two ghosts hop as they trade places
    [ghostEls[me * 8 + k0], ghostEls[me * 8 + k]].forEach(function (el) { el.animate && el.animate([{ transform: getComputedStyle(el).transform }, { transform: getComputedStyle(el).transform + ' translateY(-14%)' }, { transform: getComputedStyle(el).transform }], { duration: 260, easing: 'ease-out' }); });
    render();
  }

  /* Long-press pickup is an extra setup gesture; normal taps and game moves stay available. */
  function validSetupDrag(drag) {
    if (!drag || !M || M !== drag.match || M.token !== drag.token || M.seat !== drag.seat || M.layout !== drag.layout) return false;
    var v = viewNow();
    return v && v.phase === 'setup' && M.seat >= 0 && !v.ready[M.seat] && canAct(v);
  }
  function setupDropSlot(drag, x, y) {
    var r = cellsEl.getBoundingClientRect();
    if (!r.width || !r.height || x < r.left || x >= r.right || y < r.top || y >= r.bottom) return -1;
    var d = Math.floor((y - r.top) / r.height * 6) * 6 + Math.floor((x - r.left) / r.width * 6);
    return E.homeSquares(drag.seat).indexOf(disp(d));
  }
  function moveSetupDrag(drag, x, y) {
    drag.x = x; drag.y = y;
    drag.el.style.setProperty('--drag-x', (x - drag.startX) + 'px');
    drag.el.style.setProperty('--drag-y', (y - drag.startY) + 'px');
    drag.target = setupDropSlot(drag, x, y);
    cellBtns.forEach(function (c, d) {
      c.classList.toggle('setup-drop', drag.target >= 0 && drag.target !== drag.slot && disp(d) === E.slotSquare(drag.seat, drag.target));
    });
  }
  function endSetupDrag(redraw) {
    var drag = setupDrag;
    if (!drag) return;
    setupDrag = null;
    clearTimeout(drag.timer);
    if (drag.active) setupClickBlockUntil = Date.now() + 600;
    drag.el.classList.remove('setup-lifted');
    drag.el.style.removeProperty('--drag-x'); drag.el.style.removeProperty('--drag-y');
    drag.cell.classList.remove('setup-source');
    cellBtns.forEach(function (c) { c.classList.remove('setup-drop'); });
    boardEl.classList.remove('setup-dragging');
    if (drag.cell.hasPointerCapture && drag.cell.hasPointerCapture(drag.pointerId)) drag.cell.releasePointerCapture(drag.pointerId);
    if (redraw && drag.active && M) render();
  }
  cellsEl.addEventListener('pointerdown', function (e) {
    if (setupDrag) { if (e.pointerId !== setupDrag.pointerId) endSetupDrag(true); return; }
    if (!e.isPrimary || e.button !== 0 || !M || !M.layout || M.seat < 0) return;
    var v = viewNow(), cell = e.target.closest('.cell');
    if (!cell || v.phase !== 'setup' || v.ready[M.seat] || !canAct(v)) return;
    var q = disp(+cell.dataset.d), slot = E.homeSquares(M.seat).indexOf(q);
    if (slot < 0) return;
    var drag = setupDrag = { match: M, token: M.token, seat: M.seat, layout: M.layout, slot: slot,
      cell: cell, el: ghostEls[M.seat * 8 + slot], pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, target: slot, active: false };
    // Capture on the original cell so a short press retains its ordinary click target.
    if (cell.setPointerCapture) cell.setPointerCapture(e.pointerId);
    drag.timer = setTimeout(function () {
      if (setupDrag !== drag) return;
      if (!validSetupDrag(drag)) { endSetupDrag(true); return; }
      drag.active = true; M.sel = null; render();
      drag.baseTransform = getComputedStyle(drag.el).transform;
      drag.el.classList.add('setup-lifted'); drag.cell.classList.add('setup-source');
      boardEl.classList.add('setup-dragging');
      moveSetupDrag(drag, drag.x, drag.y); SND.pick();
      $('#prompt').innerHTML = 'おばけを持ち上げています<small>自分の別のマスで離すと入れ替え。盤外で離すと戻ります</small>';
    }, 280);
  });
  cellsEl.addEventListener('pointermove', function (e) {
    var drag = setupDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!validSetupDrag(drag)) { endSetupDrag(true); return; }
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 10) {
        setupClickBlockUntil = Date.now() + 600; endSetupDrag(false);
      }
      return;
    }
    e.preventDefault(); moveSetupDrag(drag, e.clientX, e.clientY);
  }, { passive: false });
  cellsEl.addEventListener('pointerup', function (e) {
    var drag = setupDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) { endSetupDrag(false); return; }
    e.preventDefault();
    var target = validSetupDrag(drag) ? setupDropSlot(drag, e.clientX, e.clientY) : -1;
    var swap = target >= 0 && target !== drag.slot, other, from, to;
    if (swap) {
      other = ghostEls[drag.seat * 8 + target];
      from = getComputedStyle(drag.el).transform; to = getComputedStyle(other).transform;
      var value = M.layout[drag.slot]; M.layout[drag.slot] = M.layout[target]; M.layout[target] = value;
      M.sel = null;
    }
    endSetupDrag(true);
    if (swap) {
      SND.swap();
      if (other.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var options = { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' };
        other.animate([{ transform: from }, { transform: to }], options);
        drag.el.animate([{ transform: to }, { transform: drag.baseTransform }], options);
      }
    }
  });
  cellsEl.addEventListener('pointercancel', function () { endSetupDrag(true); });
  cellsEl.addEventListener('lostpointercapture', function (e) { if (setupDrag && e.pointerId === setupDrag.pointerId) endSetupDrag(true); });
  cellsEl.addEventListener('contextmenu', function (e) { if (e.target.closest('.setup-draggable')) e.preventDefault(); });
  window.addEventListener('blur', function () { endSetupDrag(true); });
  window.addEventListener('resize', function () { endSetupDrag(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) endSetupDrag(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && setupDrag) { e.preventDefault(); endSetupDrag(true); } });
  document.addEventListener('pointerdown', function (e) {
    if (setupDrag && e.pointerId !== setupDrag.pointerId) {
      setupClickBlockUntil = Date.now() + 600; endSetupDrag(true);
    }
  }, true);

  /* ---------------------------------------------------------------- setting up */
  /* where the ghosts start in the arrangement screen: last time's arrangement, except on a shared device */
  function startLayout() {
    var l = prefs.layout;
    if (M && M.mode === 'local') return E.randomLayout(Math.random);
    return E.validLayout(l) ? l.slice() : E.randomLayout(Math.random);
  }
  function confirmSetup() {
    endSetupDrag(false);
    var v = viewNow();
    if (!M || v.phase !== 'setup' || v.ready[M.seat] || !E.validLayout(M.layout)) return;
    if (M.mode === 'tournament') { window.GST_TOUR.setup(M.layout.slice(), M.seat); return; }
    if (M.mode !== 'local') { prefs.layout = M.layout.slice(); savePrefs(); }
    M.sel = null;
    if (M.mode === 'guest') {
      L.link.send({ k: 'setup', layout: M.layout.slice() });
      M.view.ready[M.seat] = true;
      M.view.g.forEach(function (x, id) { if ((id >> 3) === M.seat) { x.st = 'on'; x.at = E.slotSquare(M.seat, id & 7); x.good = M.layout[id & 7] === 1; } });
      render();
      return;
    }
    var r = E.setup(M.s, M.seat, M.layout);
    if (!r.ok) { toast('並べ方を確かめてください'); return; }
    SND.move();
    save();
    if (M.mode === 'host') pushGuest(null);
    if (M.mode === 'local' && M.s.phase === 'setup') {
      // the other player sets up next, out of sight
      return curtain(1 - M.seat, nameOf(1 - M.seat) + 'さんの番です', '端末を受け取ったら「見る」を押して、おばけを並べてください。', function () { M.layout = startLayout(); });
    }
    if (M.s.phase === 'play') begin();
    else render();
  }
  function begin() {
    var v = viewNow();
    var first = M.s ? M.s.first : v.first;
    var who = M.mode === 'cpu' ? (first === M.cpu ? 'CPUが先に動かします' : 'あなたが先に動かします')
      : M.mode === 'local' ? nameOf(first) + 'さんが先に動かします'
      : (first === M.seat ? 'あなたが先に動かします' : oppName() + 'が先に動かします');
    toast(who);
    SND.turn();
    if (M.mode === 'local') {
      return curtain(first, nameOf(first) + 'さんから始めます', '端末を受け取ったら「見る」を押してください。', null);
    }
    step();
  }

  /* ---------------------------------------------------------------- making a move */
  function act(a) {
    var v = viewNow();
    if (!canAct(v) || v.phase !== 'play') return;
    M.sel = null;
    if (M.mode === 'tournament') { window.GST_TOUR.act(a); return; }
    if (M.mode === 'guest') {
      M.waiting = true;
      L.link.send({ k: 'act', a: a, ply: v.ply });
      render();
      return;
    }
    play(M.seat, a);
  }
  /* apply a move in a game this browser owns, show it, then carry on */
  function play(p, a) {
    var before = viewNow();
    var r = E.apply(M.s, p, a);
    if (!r.ok) { toast('その動きはできません'); render(); return Promise.resolve(); }
    save();
    if (M.mode === 'host') pushGuest(r.ev);
    return show(r.ev, before).then(function () { after(r.ev); });
  }
  function after(ev) {
    if (!M) return;
    if (ev.cap >= 0) captureNote(ev);
    step();
  }
  function step() {
    if (!M) return;
    var v = viewNow();
    if (v.phase === 'over') { finish(); return; }
    if (M.mode === 'cpu' && M.s.turn === M.cpu && M.s.phase === 'play') { cpuTurn(); return; }
    if (M.mode === 'local' && M.s.phase === 'play' && M.s.turn !== M.seat) {
      var nx = M.s.turn;
      curtain(nx, nameOf(nx) + 'さんの番です', '端末を受け取ったら「見る」を押してください。', null);
      return;
    }
    if (myTurn(v) && !M.busy) { SND.turn(); }
    render();
  }
  function captureNote(ev) {
    var v = viewNow(), me = seatOf(), byMe = ev.p === me, colour = ev.capGood ? '青' : '赤';
    var t = E.tally(v, byMe ? 1 - me : me);
    var msg, tone = ev.capGood ? 'good' : 'bad';
    if (M.mode === 'local') {
      msg = nameOf(ev.p) + 'さんが' + nameOf(1 - ev.p) + 'さんの' + colour + 'いおばけを取りました';
    } else if (byMe) {
      msg = oppName() + 'の' + colour + 'いおばけを取りました';
      if (v.phase === 'play') msg += ev.capGood ? '（青はあと' + t.good + 'つ）' : (t.bad === 1 ? '（赤をあと1つ取ると負け！）' : '');
    } else {
      msg = oppName() + 'があなたの' + colour + 'いおばけを取りました';
      if (v.phase === 'play' && !ev.capGood && t.bad <= 2) msg += '（赤をあと' + t.bad + 'つ取らせれば勝ち）';
    }
    toast(msg, tone);
  }

  /* ---------------------------------------------------------------- showing a move */
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function show(ev, before) {
    if (!ev || ev.resign) { render(); return Promise.resolve(); }
    M.busy = true;
    var me = seatOf();
    var mover = ghostEls[ev.id], capEl = ev.cap >= 0 ? ghostEls[ev.cap] : null;
    var capRect = capEl ? rectOf(capEl) : null, capWasMine = ev.cap >= 0 && (ev.cap >> 3) === me;
    var moverRect = rectOf(mover);
    if (ev.cap >= 0) { M.flying = {}; M.flying[ev.cap] = true; }
    if (ev.esc) { M.hideIds = {}; M.hideIds[ev.id] = true; }
    render();
    SND.move();
    var chain = sleep(240);
    if (ev.cap >= 0) {
      chain = chain.then(function () {
        // the captured ghost turns round to show its colour, then goes to the capturer's side
        var clone = flyClone(capEl, capRect, capWasMine);
        SND.take();
        return sleep(60).then(function () {
          clone.classList.add(ev.capGood ? 'good' : 'bad');
          clone.classList.add('turned');
          (ev.capGood ? SND.good : SND.bad)();
          return sleep(620);
        }).then(function () {
          var trayId = (ev.p === me ? 'me' : 'opp') + (ev.capGood ? 'Blue' : 'Red');
          var slots = $$('#' + trayId + ' i'), slot = slots.filter(function (s) { return !s.classList.contains('on'); })[0] || slots[slots.length - 1];
          var to = rectOf(slot);
          clone.style.transform = 'translate(' + (to.x + to.w / 2 - (capRect.x + capRect.w / 2)) + 'px,' + (to.y + to.h / 2 - (capRect.y + capRect.h / 2)) + 'px) scale(' + (to.w / capRect.w) + ')';
          return sleep(560).then(function () { clone.remove(); M.flying = null; render(); });
        });
      });
    }
    if (ev.esc) {
      chain = chain.then(function () {
        var clone = flyClone(mover, moverRect, ev.p === me);
        clone.classList.add('good', 'turned');
        SND.escape();
        var right = disp(ev.f) % 6 === 5;
        sparks(moverRect, '#8DBDFF');
        clone.style.transform = 'translate(' + (right ? 1 : -1) * moverRect.w * 0.9 + 'px,' + (-moverRect.h * 0.9) + 'px) scale(.6)';
        clone.style.opacity = '0';
        return sleep(700).then(function () { clone.remove(); });
      });
    }
    return chain.then(function () { M.busy = false; M.hideIds = null; render(); });
  }
  function flyClone(src, r, mineSide) {
    var c = document.createElement('div');
    c.className = src.className.replace(/\bsel\b/, '') + ' flying';
    c.classList.remove('gone');
    c.innerHTML = G3D;
    c.style.cssText = 'position:fixed;left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px;transform:none';
    if (!mineSide) c.classList.add('theirs');
    $('#fly').appendChild(c);
    c.getBoundingClientRect();
    return c;
  }
  function sparks(r, colour) {
    var fly = $('#fly');
    for (var i = 0; i < 14; i++) {
      var s = document.createElement('i'), ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 60;
      s.className = 'spark';
      s.style.left = (r.x + r.w / 2) + 'px'; s.style.top = (r.y + r.h / 2) + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px'); s.style.setProperty('--dy', Math.sin(ang) * dist - 30 + 'px');
      s.style.setProperty('--sc', colour);
      fly.appendChild(s);
      (function (el) { setTimeout(function () { el.remove(); }, 900); })(s);
    }
  }

  /* ---------------------------------------------------------------- the CPU */
  var worker = null, wid = 0, waiting = {};
  function getWorker() {
    if (worker === null) {
      try {
        worker = new Worker(WORKER_URL);
        worker.onmessage = function (e) { var d = e.data || {}; if (waiting[d.id]) { waiting[d.id](d); delete waiting[d.id]; } };
        worker.onerror = function () { worker = false; Object.keys(waiting).forEach(function (k) { waiting[k]({}); delete waiting[k]; }); };
      } catch (e) { worker = false; }
    }
    return worker || null;
  }
  function think(view, level, extra) {
    var seed = (Math.random() * 4294967296) >>> 0;
    var local = function () { return AI.choose(view, level, E.mulberry32(seed), Object.assign({}, extra, { ms: Math.min(400, AI.LEVELS[level].ms) })); };
    return new Promise(function (res) {
      var w = getWorker();
      if (!w) { setTimeout(function () { res(local()); }, 20); return; }
      var id = ++wid;
      var to = setTimeout(function () { delete waiting[id]; res(local()); }, 20000);
      waiting[id] = function (d) { clearTimeout(to); res(d.a || local()); };
      w.postMessage({ id: id, view: view, level: level, seed: seed, extra: extra });
    });
  }
  function rivalExtra() {
    if (!rival) return {};
    return { params: Object.assign({}, rival.params), boost: rival.boost, habits: rival.seen && rival.seen.habits ? rival.seen.habits : null };
  }
  function cpuTurn() {
    var token = M.token, t0 = Date.now();
    M.thinking = true; render();
    var extra = M.level >= 5 ? rivalExtra() : {};
    return think(E.viewFor(M.s, M.cpu), M.level, extra).then(function (a) {
      var wait = Math.max(0, (TEST ? 0 : 650) - (Date.now() - t0));
      return sleep(wait).then(function () {
        if (!M || M.token !== token || M.s.phase !== 'play') return;
        M.thinking = false;
        if (!a) { var ms = E.legal(M.s, M.cpu); a = ms[Math.floor(Math.random() * ms.length)]; }
        return play(M.cpu, a);
      });
    });
  }

  /* ---------------------------------------------------------------- the end of a game */
  function resultLine(v) {
    if (v.winner === -1) return '引き分け';
    if (M.mode === 'local' || M.mode === 'tournament') return nameOf(v.winner) + 'さんの勝ち';
    return v.winner === seatOf() ? 'あなたの勝ち' : (M.mode === 'cpu' ? 'CPU' : oppName()) + 'の勝ち';
  }
  function reasonText(v) {
    var me = seatOf(), w = v.winner, mine = w === me, opn = M.mode === 'cpu' ? 'CPU' : oppName();
    if (M.mode === 'local' || M.mode === 'tournament') {
      var wn = nameOf(w), ln = nameOf(1 - w);
      return { escape: wn + 'さんの青いおばけが出口から逃げました。', good: wn + 'さんが' + ln + 'さんの青いおばけを4つ全部取りました。', bad: ln + 'さんが' + wn + 'さんの赤いおばけを4つ全部取ってしまいました。', resign: ln + 'さんが投了しました。', limit: '300手で決着がつきませんでした。' }[v.reason] || '';
    }
    if (v.reason === 'limit') return '300手で決着がつきませんでした。';
    if (mine) return { escape: '青いおばけが出口から逃げ切りました。', good: opn + 'の青いおばけを4つ全部取りました。', bad: opn + 'に赤いおばけを4つ全部取らせました。', resign: opn + 'が投了しました。', left: opn + 'が部屋を出ました。' }[v.reason] || '';
    return { escape: opn + 'の青いおばけに逃げられました。', good: '青いおばけを4つ全部取られました。', bad: opn + 'の赤いおばけを4つ全部取ってしまいました。', resign: '投了しました。', left: '' }[v.reason] || '';
  }
  function finish() {
    if (!M || M.finished) { render(); return; }
    M.finished = true; M.sel = null;
    var token = M.token;
    if (M.mode === 'cpu' || M.mode === 'local') store.del('save');
    if (M.mode === 'local') M.seat = M.s.winner >= 0 ? M.s.winner : 0;
    var v = viewNow(), me = seatOf();
    // every ghost still hiding its colour turns round, one after another
    M.revealed = {};
    var ids = [];
    for (var id = 0; id < 16; id++) if (v.g[id].st === 'on' && ((id >> 3) !== me || M.mode === 'local')) ids.push(id);
    ids.sort(function (a, b) { return disp(v.g[a].at) - disp(v.g[b].at); });
    render();
    var chain = sleep(350);
    ids.forEach(function (id2) {
      chain = chain.then(function () { if (!M || M.token !== token) return; M.revealed[id2] = true; render(); SND.pick(); return sleep(150); });
    });
    chain.then(function () { return sleep(650); }).then(function () {
      if (!M || M.token !== token) return;
      var won = v.winner === me && M.mode !== 'local';
      if (v.winner === -1) SND.turn(); else if (won || M.mode === 'local') SND.win(); else SND.lose();
      if (M.mode === 'cpu') rivalAfter(v);
      showResult();
    });
  }
  function showResult() {
    if (!M) return;
    if (M.mode === 'tournament') { window.GST_TOUR.showBoard(); return; }
    var v = viewNow(), me = seatOf();
    var t = $('#resTitle');
    t.textContent = resultLine(v);
    t.className = 'rtitle ' + (v.winner === -1 ? '' : (M.mode === 'local' || v.winner === me) ? 'win' : 'lose');
    $('#resText').textContent = reasonText(v) + (v.ply ? '（' + v.ply + '手）' : '');
    $('#resExtra').innerHTML = M.mode === 'cpu' && M.level >= 5 && rival ? '<p style="margin:0 0 6px;font-size:13px">' + esc(RIVALS.recordText(rival)) + '</p>' : '';
    var bt = $('#resBtns'); bt.innerHTML = '';
    function add(label, fn, cls) { var b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.onclick = fn; bt.appendChild(b); }
    if (M.mode === 'cpu') {
      add('もう一度', function () { hide('#result'); startCpu(); }, 'primary big');
      add('強さを変える', function () { hide('#result'); leaveGame(); openScreen('#scrCpu'); });
    } else if (M.mode === 'local') {
      add('もう一度', function () { hide('#result'); startLocal(); }, 'primary big');
    } else if (M.mode === 'host') {
      add('もう一度', function () { hide('#result'); hostNewGame(); }, 'primary big');
    } else if (M.mode === 'guest') {
      add(M.askedAgain ? 'もう一度（相手を待っています）' : 'もう一度', function (e) { M.askedAgain = true; L.link.send({ k: 'again' }); e.target.textContent = 'もう一度（相手を待っています）'; }, 'primary big');
    }
    add('盤面を見る', function () { hide('#result'); render(); });
    add(M.mode === 'host' || M.mode === 'guest' ? '部屋を出る' : 'タイトルへ', function () { hide('#result'); quitToTitle(); }, 'ghosty');
    openVeil('#result');
  }
  function rivalAfter(v) {
    if (M.level < 5 || !rival || M.rivalDone) return;
    M.rivalDone = true;
    var outcome = v.winner === -1 ? 'draw' : v.winner === M.cpu ? 'cpu' : 'you';
    var overView = E.viewFor(M.s, M.cpu);     // the game is over: every colour is shown
    rival.observe(function (seen) { seen.habits = AI.learnHabits(seen.habits || null, overView, 1 - M.cpu); });
    if (rival.result(outcome)) {
      setTimeout(function () {
        RIVALS.learn(rival, RIVALS.workerTune(WORKER_URL), { timeMs: 16000, tune: { minPairs: 6, maxPairs: 30 }, notes: AI.habitNotes(rival.seen.habits) });
      }, 1200);
    }
  }

  /* ================================================================ modes */
  function newToken() { return (Math.random() * 1e9) | 0; }
  function enterGame() {
    document.body.classList.add('ingame');
    $$('.screen').forEach(function (s) { s.hidden = true; });
    $('#loader').hidden = true;
    fit();
    $('#avMe').innerHTML = '<svg viewBox="0 0 100 100" style="--body:#F4F1E7;--edge:#9C97B3;--dot:var(--brass)"><use href="#gBody"/><use href="#gDot"/></svg>';
    $('#avOpp').innerHTML = miniFace();
    render();
  }
  function leaveGame() {
    endSetupDrag(false);
    if (M) M.token = -1;
    M = null;
    document.body.classList.remove('ingame');
    ['#result', '#curtain', '#menuSheet', '#confirm'].forEach(hide);
  }
  /* ---------------------------------------------------------------- vs CPU */
  function startCpu() {
    leaveGame();
    var first = prefs.first === 'me' ? 0 : prefs.first === 'cpu' ? 1 : (Math.random() < 0.5 ? 0 : 1);
    M = { mode: 'cpu', s: E.newGame({ first: first }), seat: 0, cpu: 1, level: prefs.level, names: ['あなた', 'CPU（' + LEVELS[prefs.level] + '）'], token: newToken() };
    E.setup(M.s, 1, AI.setupFor(M.level, Math.random, M.level >= 5 ? rivalExtra() : {}));
    M.layout = startLayout();
    enterGame();
  }
  /* ---------------------------------------------------------------- one device */
  function startLocal() {
    leaveGame();
    var n0 = (prefs.names[0] || '').trim() || 'プレイヤー1', n1 = (prefs.names[1] || '').trim() || 'プレイヤー2';
    M = { mode: 'local', s: E.newGame({}), seat: -1, names: [n0, n1], token: newToken() };
    enterGame();
    curtain(0, n0 + 'さんの番です', '端末を受け取ったら「見る」を押して、おばけを並べてください。もうひとりは画面を見ないでください。', function () { M.layout = startLayout(); });
  }
  /* the screen between turns on one device: nothing behind it shows a colour */
  function curtain(seat, title, text, onGo) {
    M.seat = -1; M.sel = null;
    render();
    $('#curtainTitle').textContent = title;
    $('#curtainText').textContent = text;
    var hero = $('#curtainHero'); hero.innerHTML = '';
    for (var i = 0; i < 3; i++) { var gh = document.createElement('div'); gh.className = 'gh theirs'; gh.innerHTML = G3D; hero.appendChild(gh); }
    $('#curtainGo').onclick = function () {
      hide('#curtain');
      M.seat = seat;
      if (onGo) onGo();
      if (viewNow().phase === 'play') {
        var log = viewNow().log, last = log[log.length - 1];
        if (last && last.p !== seat && last.cap >= 0) captureNote(last);
      }
      render();
      if (viewNow().phase === 'play' && viewNow().turn === seat) SND.turn();
    };
    save();
    openVeil('#curtain');
  }

  /* ---------------------------------------------------------------- saving and resuming (CPU and one device) */
  function save() {
    if (!M || (M.mode !== 'cpu' && M.mode !== 'local') || M.s.phase === 'over') return;
    store.set('save', { mode: M.mode, s: M.s, level: M.level, cpu: M.cpu, names: M.names, at: Date.now() });
  }
  function resumeInfo() {
    var sv = store.get('save', null);
    if (!sv || !sv.s || sv.s.phase === 'over') return null;
    return sv;
  }
  function resume() {
    var sv = resumeInfo(); if (!sv) return;
    leaveGame();
    M = { mode: sv.mode, s: sv.s, seat: sv.mode === 'cpu' ? 0 : -1, cpu: sv.cpu, level: sv.level, names: sv.names, token: newToken() };
    if (M.mode === 'cpu') { M.layout = startLayout(); enterGame(); if (M.s.phase === 'play') step(); return; }
    enterGame();
    var s = M.s;
    if (s.phase === 'setup') {
      var nx = s.ready[0] ? 1 : 0;
      curtain(nx, nameOf(nx) + 'さんの番です', 'おばけを並べてください。', function () { M.layout = startLayout(); });
    } else curtain(s.turn, nameOf(s.turn) + 'さんの番です', '端末を受け取ったら「見る」を押してください。', null);
  }

  /* ---------------------------------------------------------------- online */
  var CID = (function () {
    var c = null;
    try { c = sessionStorage.getItem('gst.cid'); } catch (e) { /* ignore */ }
    if (!c || !/^[A-Za-z0-9]{6,32}$/.test(c)) { c = N.makeCid(); try { sessionStorage.setItem('gst.cid', c); } catch (e) { /* ignore */ } }
    return c;
  })();
  function onlineName() { var n = N.cleanName($('#onName').value) || N.cleanName(prefs.name) || 'ゲスト'; prefs.name = n; savePrefs(); return n; }
  function onErr(msg) { var e = $('#onErr'); e.textContent = msg; e.hidden = !msg; }
  function netMsg(err) {
    var c = err && err.code;
    return c === 'notfound' ? 'その部屋が見つかりません。コードを確かめてください。' : c === 'lib' ? '通信の準備ができませんでした。電波のよい所でもう一度どうぞ。' : c === 'taken' ? '部屋をつくれませんでした。もう一度どうぞ。' : '接続できませんでした。もう一度どうぞ。';
  }
  function setRoomInUrl(code) {
    try { var u = new URL(location.href); if (code) u.searchParams.set('room', code); else u.searchParams.delete('room'); history.replaceState(null, '', u); } catch (e) { /* ignore */ }
  }
  function hostRoom() {
    onErr('');
    var name = onlineName(), tries = 0, link = N.makeHost(NETKIND);
    $('#onCreate').disabled = true;
    (function attempt() {
      var code = N.makeCode();
      link.host(code).then(function () {
        $('#onCreate').disabled = false;
        L = { role: 'host', code: code, link: link, name: name, guest: null, away: false };
        link.on('msg', hostMsg); link.on('leave', hostLeave);
        lobby();
      }, function (err) {
        if (err && err.code === 'taken' && tries++ < 4) { attempt(); return; }
        $('#onCreate').disabled = false; onErr(netMsg(err));
      });
    })();
  }
  function lobby() {
    openScreen('#scrLobby');
    $('#lobCode').textContent = L.code;
    var seats = '<div class="seatrow">' + seatIcon(false) + esc(L.role === 'host' ? L.name : (L.hostName || '部屋の主')) + '<small>部屋の主</small></div>';
    var gname = L.role === 'host' ? (L.guest ? L.guest.nm : null) : L.name;
    seats += gname ? '<div class="seatrow">' + seatIcon(true) + esc(gname) + '<small>' + (L.role === 'guest' ? 'あなた' : (L.guest && L.guest.on ? '参加' : '接続が切れています')) + '</small></div>' : '<div class="seatrow wait">相手を待っています…</div>';
    $('#lobSeats').innerHTML = seats;
    $('#lobNote').textContent = L.role === 'host' ? 'このコードか招待リンクを相手に送ってください。' : '部屋の主が始めるのを待っています。';
    $('#lobStart').hidden = L.role !== 'host';
    $('#lobInvite').hidden = L.role !== 'host';
    $('#lobStart').disabled = !(L.guest && L.guest.on);
  }
  function hostMsg(cid, m) {
    if (!L || L.role !== 'host') return;
    if (m.k === 'hello') {
      if (m.v !== N.PROTOCOL) { L.link.send(cid, { k: 'old' }); return; }
      if (L.guest && L.guest.cid !== cid && L.guest.on) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
      if (L.guest && L.guest.cid !== cid && M) { L.link.send(cid, { k: 'full' }); L.link.drop(cid); return; }
      L.guest = { cid: cid, nm: N.cleanName(m.nm) || 'ゲスト', on: true };
      L.away = false;
      if (M && M.mode === 'host') {
        M.names[1] = L.guest.nm;
        L.link.send(cid, { k: 'start', view: E.viewFor(M.s, 1), names: M.names, resume: true });
        toast(L.guest.nm + 'が戻ってきました');
        render();
      } else {
        L.link.send(cid, { k: 'lobby', host: L.name, code: L.code });
        lobby();
        toast(L.guest.nm + 'が入りました');
      }
      return;
    }
    if (!L.guest || cid !== L.guest.cid) return;
    if (m.k === 'bye') { hostLeave(cid, true); return; }
    if (!M || M.mode !== 'host') return;
    if (m.k === 'setup') {
      var r = E.setup(M.s, 1, m.layout);
      if (!r.ok) { L.link.send(cid, { k: 'err', err: r.err, view: E.viewFor(M.s, 1), names: M.names }); return; }
      pushGuest(null);
      if (M.s.phase === 'play') begin(); else render();
      return;
    }
    if (m.k === 'act') {
      if (M.s.phase !== 'play' || M.s.turn !== 1 || m.ply !== M.s.ply || M.busy) { L.link.send(cid, { k: 'err', err: 'stale', view: E.viewFor(M.s, 1), names: M.names }); return; }
      play(1, m.a);
      return;
    }
    if (m.k === 'again') { if (M.s.phase === 'over') toast(L.guest.nm + 'がもう一度遊びたがっています'); return; }
    if (m.k === 'resign') { if (M.s.phase !== 'over') { E.resign(M.s, 1); pushGuest({ resign: true }); finish(); } }
  }
  function hostLeave(cid, bye) {
    if (!L || !L.guest || L.guest.cid !== cid) return;
    L.guest.on = false;
    if (!M) { if (bye) L.guest = null; lobby(); return; }
    if (bye && M.s.phase === 'play') { E.resign(M.s, 1, 'left'); finish(); toast(L.guest.nm + 'が部屋を出ました'); return; }
    L.away = true;
    toast('相手との接続が切れました。戻ってくるのを待っています');
    render();
  }
  function pushGuest(ev) {
    if (!L || L.role !== 'host' || !L.guest || !M) return;
    L.link.send(L.guest.cid, { k: 'upd', view: E.viewFor(M.s, 1), ev: ev && !ev.resign ? E.evFor(ev) : null, names: M.names });
  }
  function hostNewGame() {
    if (!L || !L.guest) { toast('相手がいません'); return; }
    var prevFirst = M && M.s ? M.s.first : null;
    leaveGame();
    var first = prevFirst == null ? (Math.random() < 0.5 ? 0 : 1) : 1 - prevFirst;
    M = { mode: 'host', s: E.newGame({ first: first }), seat: 0, names: [L.name, L.guest.nm], token: newToken() };
    M.layout = startLayout();
    L.link.send(L.guest.cid, { k: 'start', view: E.viewFor(M.s, 1), names: M.names });
    enterGame();
    toast('おばけを並べましょう');
  }
  function joinRoom(code) {
    onErr('');
    code = N.cleanCode(code);
    if (code.length !== 4) { onErr('4文字の部屋コードを入れてください。'); return; }
    var name = onlineName(), link = N.makeGuest(NETKIND);
    $('#onJoin').disabled = true;
    link.join(code).then(function () {
      $('#onJoin').disabled = false;
      L = { role: 'guest', code: code, link: link, name: name, hostName: '' };
      link.on('msg', guestMsg);
      link.on('close', function () { if (L && L.link === link) roomClosed(); });
      link.send({ k: 'hello', cid: CID, nm: name, v: N.PROTOCOL });
      setRoomInUrl(code);
    }, function (err) { $('#onJoin').disabled = false; onErr(netMsg(err)); openScreen('#scrOnline'); setRoomInUrl(null); });
  }
  function guestMsg(m) {
    if (!L || L.role !== 'guest') return;
    if (m.k === 'lobby') { L.hostName = m.host; lobby(); return; }
    if (m.k === 'full') { leaveRoom(); openScreen('#scrOnline'); onErr('その部屋はもう埋まっています。'); return; }
    if (m.k === 'old') { leaveRoom(); openScreen('#scrOnline'); onErr('相手と版がちがいます。ページを読み込み直してください。'); return; }
    if (m.k === 'bye') { roomClosed(); return; }
    if (m.k === 'start') {
      leaveGame();
      M = { mode: 'guest', view: m.view, seat: 1, names: m.names, token: newToken() };
      M.layout = startLayout();
      enterGame();
      if (m.resume) toast('部屋に戻りました'); else toast('おばけを並べましょう');
      if (m.view.phase === 'over') finish();
      return;
    }
    if (!M || M.mode !== 'guest') return;
    if (m.k === 'upd') {
      var before = M.view, wasSetup = before.phase === 'setup';
      M.view = m.view; M.names = m.names || M.names; M.waiting = false;
      var ev = m.ev;
      if (ev && ev.id >= 0 && typeof ev.f === 'number') {
        show(ev, before).then(function () {
          if (ev.cap >= 0) captureNote(ev);
          if (M.view.phase === 'over') finish(); else { if (myTurn(M.view)) SND.turn(); render(); }
        });
        return;
      }
      if (wasSetup && m.view.phase === 'play') { begin(); return; }
      if (m.view.phase === 'over') { finish(); return; }
      render();
      return;
    }
    if (m.k === 'err') { M.view = m.view; M.waiting = false; toast('その動きは受け付けられませんでした'); render(); }
  }
  function roomClosed() {
    var inGame = !!M;
    leaveRoom();
    leaveGame();
    openScreen('#scrOnline');
    onErr(inGame ? '部屋が閉じられました。' : '部屋が閉じられました。');
  }
  function leaveRoom() {
    if (L) {
      try { if (L.role === 'host') L.link.broadcast({ k: 'bye' }); else L.link.send({ k: 'bye' }); } catch (e) { /* ignore */ }
      var link = L.link; L = null;
      setTimeout(function () { try { link.close(); } catch (e) { /* ignore */ } }, 150);
    }
    setRoomInUrl(null);
  }

  /* ================================================================ screens, menus, little helpers */
  function openScreen(sel) {
    endSetupDrag(false);
    $$('.screen').forEach(function (s) { s.hidden = '#' + s.id !== sel; });
    $('#loader').hidden = true;
    $$('[data-play-screen]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.playScreen === sel)); });
    if (sel === '#scrTitle') titleShow();
    if (sel === '#scrCpu') cpuScreen();
    if (sel === '#scrLocal') { $('#locName0').value = prefs.names[0] || ''; $('#locName1').value = prefs.names[1] || ''; $('#locName0').placeholder = 'プレイヤー1'; $('#locName1').placeholder = 'プレイヤー2'; }
    if (sel === '#scrOnline') { $('#onName').value = prefs.name || ''; }
  }
  function openVeil(sel) { endSetupDrag(true); $(sel).hidden = false; }
  function hide(sel) { var el = $(sel); if (el) el.hidden = true; }
  function toast(msg, tone) {
    var t = document.createElement('div');
    t.className = 'toast' + (tone ? ' ' + tone : ''); t.textContent = msg;
    var box = $('#toasts'); box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(function () { t.remove(); }, TEST ? 800 : 3200);
  }
  function confirmBox(title, text, yes, fn) {
    $('#cfTitle').textContent = title; $('#cfText').textContent = text;
    var bt = $('#cfBtns'); bt.innerHTML = '';
    var no = document.createElement('button'); no.className = 'btn ghosty'; no.textContent = 'やめる'; no.onclick = function () { hide('#confirm'); };
    var ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = yes; ok.onclick = function () { hide('#confirm'); fn(); };
    bt.appendChild(no); bt.appendChild(ok);
    openVeil('#confirm');
  }
  function quitToTitle() {
    if (window.GST_TOUR && window.GST_TOUR.active) window.GST_TOUR.leave(false);
    if (L) leaveRoom();
    leaveGame();
    openScreen('#scrTitle');
  }

  /* title: the hero ghosts turn round one by one */
  var heroTimer = [];
  function titleShow() {
    var sv = resumeInfo();
    $('#goResume').hidden = !sv;
    if (sv) $('#resumeInfo').textContent = '（' + (sv.mode === 'cpu' ? 'CPU・' + LEVELS[sv.level] : '1台でふたり') + '・' + sv.s.ply + '手）';
    var row = $('#heroRow'); row.innerHTML = '';
    heroTimer.forEach(clearTimeout); heroTimer = [];
    var cols = [1, 0, 1, 0].sort(function () { return Math.random() - 0.5; });
    cols.forEach(function (c, i) {
      var gh = document.createElement('div');
      gh.className = 'gh theirs ' + (c ? 'good' : 'bad'); gh.innerHTML = G3D;
      row.appendChild(gh);
      heroTimer.push(setTimeout(function () { gh.classList.add('turned'); }, (TEST ? 0 : 700) + i * 380));
    });
  }
  function cpuScreen() {
    $$('#segLevel button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === prefs.level)); });
    $$('#segFirst button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === prefs.first)); });
    $('#levelNote').textContent = LEVEL_NOTES[prefs.level];
    var rc = $('#rivalCard');
    if (rival && prefs.level >= 5) { rc.innerHTML = RIVALS.cardHTML(rival); RIVALS.bindCard(rc, rival, cpuScreen); } else rc.innerHTML = '';
  }
  $$('#segLevel button').forEach(function (b) { b.onclick = function () { prefs.level = +b.dataset.v; savePrefs(); cpuScreen(); }; });
  $$('#segFirst button').forEach(function (b) { b.onclick = function () { prefs.first = b.dataset.v; savePrefs(); cpuScreen(); }; });
  $$('[data-back]').forEach(function (b) { b.onclick = function () { openScreen('#scrTitle'); }; });
  $('#goPlay').onclick = function () { openScreen('#scrCpu'); };
  $$('[data-play-screen]').forEach(function (b) { b.onclick = function () { openScreen(b.dataset.playScreen); }; });
  $('#goRules').onclick = function () { openVeil('#rules'); };
  $('#goResume').onclick = resume;
  $('#cpuStart').onclick = startCpu;
  $('#locStart').onclick = function () {
    prefs.names = [N.cleanName($('#locName0').value).slice(0, 8), N.cleanName($('#locName1').value).slice(0, 8)]; savePrefs();
    startLocal();
  };
  $('#onCreate').onclick = hostRoom;
  $('#onJoin').onclick = function () { joinRoom($('#onCode').value); };
  $('#onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom($('#onCode').value); });
  $('#onCode').addEventListener('input', function (e) { e.target.value = N.cleanCode(e.target.value); });
  $('#lobStart').onclick = function () { if (L && L.role === 'host' && L.guest && L.guest.on) hostNewGame(); };
  $('#lobLeave').onclick = function () { leaveRoom(); openScreen('#scrOnline'); };
  $('#lobInvite').onclick = function () {
    if (!L) return;
    var url = location.origin + location.pathname + '?room=' + L.code + (NETKIND === 'local' ? '&net=local' : '');
    var text = 'ガイスターで対戦しよう！ 部屋コード ' + L.code;
    if (navigator.share) { navigator.share({ title: 'ガイスター', text: text, url: url }).catch(function () { /* closed */ }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('招待リンクをコピーしました'); }, function () { toast(url); });
    else toast(url);
  };
  $('#rulesClose').onclick = function () { hide('#rules'); };
  $('#rules').addEventListener('click', function (e) { if (e.target.id === 'rules') hide('#rules'); });
  $('#btnRules').onclick = function () { openVeil('#rules'); };
  $('#btnSound').onclick = function () { prefs.sound = !prefs.sound; savePrefs(); renderSound(); if (prefs.sound) { SND.unlock(); SND.pick(); } };
  function renderSound() { $('#btnSound').classList.toggle('off', !prefs.sound); if (globalThis.GEMINI_BGM) globalThis.GEMINI_BGM.setEnabled(prefs.sound); }
  document.addEventListener('gemini-bgm-change', function () { if (globalThis.GEMINI_BGM) globalThis.GEMINI_BGM.setEnabled(prefs.sound); });
  $('#btnMenu').onclick = function () {
    if (!M) return;
    var bt = $('#menuBtns'); bt.innerHTML = '';
    var v = viewNow();
    function add(label, fn, cls) { var b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label; b.onclick = function () { hide('#menuSheet'); fn(); }; bt.appendChild(b); }
    add('あそびかた', function () { openVeil('#rules'); });
    if (v.phase === 'play' && M.seat >= 0 && !M.busy && (!M.ctrl || M.ctrl.indexOf(M.seat) >= 0)) add('投了する', function () {
      confirmBox('投了しますか？', 'この対戦は' + (M.mode === 'local' ? nameOf(M.seat) + 'さんの負け' : 'あなたの負け') + 'になります。', '投了する', resignNow);
    });
    if (v.phase === 'over') add('結果を見る', showResult);
    if (M.mode === 'cpu' || M.mode === 'local') add('タイトルへ（続きから再開できます）', quitToTitle);
    else add('部屋を出る', function () { confirmBox('部屋を出ますか？', v.phase === 'play' ? '対戦中に出ると、あなたの負けになります。' : 'この部屋から出ます。', '部屋を出る', quitToTitle); });
    add('閉じる', function () { /* just close */ }, 'ghosty');
    openVeil('#menuSheet');
  };
  $('#menuSheet').addEventListener('click', function (e) { if (e.target.id === 'menuSheet') hide('#menuSheet'); });
  function resignNow() {
    if (!M) return;
    if (M.mode === 'tournament') { window.GST_TOUR.resign(); return; }
    if (M.mode === 'guest') { L.link.send({ k: 'resign' }); return; }
    if (M.s.phase !== 'play') return;
    E.resign(M.s, M.seat < 0 ? M.s.turn : M.seat);
    if (M.mode === 'host') pushGuest({ resign: true });
    finish();
  }

  /* rule pictures */
  (function rulesArt() {
    var g = $('#raSetup'); if (!g) return;
    var html = '';
    var cols = [1, 0, 0, 1, 0, 1, 1, 0];
    for (var k = 0; k < 8; k++) {
      var x = 70 + (k % 4) * 52, y = k < 4 ? 8 : 62;
      html += '<g transform="translate(' + x + ' ' + y + ')" style="--body:#F4F1E7;--edge:#9C97B3;--dot:' + (cols[k] ? '#3E8EF7' : '#E8483F') + '"><use href="#gBody" width="48" height="48"/><use href="#gDot" width="48" height="48"/></g>';
    }
    html += '<text x="20" y="38" fill="#C3C0D2" font-size="12" font-weight="700">前</text><text x="20" y="92" fill="#C3C0D2" font-size="12" font-weight="700">後</text>';
    g.innerHTML = html;
  })();

  /* ================================================================ start */
  // a phone switching apps must not forfeit an online game: only an explicit leave says goodbye
  window.addEventListener('pagehide', function () { save(); });
  renderSound();
  var room = N.cleanCode(params.get('room') || '');
  if (room.length === 4) {
    openScreen('#scrOnline');
    $('#onCode').value = room;
    joinRoom(room);
  } else openScreen('#scrTitle');


  /* Tournament controller uses the same board, setup editor and move presentation. */
  var tourQueue = Promise.resolve();
  var tourAPI = {
    E: E, AI: AI, $: $, prefs: prefs, store: store, esc: esc, think: think,
    screen: openScreen, clear: leaveGame, toast: toast,
    match: function () { return M; },
    waiting: function () { if (M) { M.waiting = true; render(); } },
    present: function (packet) {
      tourQueue = tourQueue.catch(function () {}).then(async function () {
        if (!window.GST_TOUR || !window.GST_TOUR.active) return;
        var fresh = !M || M.mode !== 'tournament' || M.mid !== packet.mid;
        var oldSeat = M && M.seat, before = !fresh ? viewNow() : null;
        if (fresh) {
          leaveGame();
          M = {mode:'tournament', mid:packet.mid, token:newToken(), sel:null};
        }
        M.view = packet.view; M.seat = packet.view.me; M.names = packet.names;
        M.ctrl = packet.ctrl.slice(); M.spectator = !packet.ctrl.length; M.waiting = false;
        if (packet.view.phase === 'setup' && packet.ctrl.indexOf(M.seat) >= 0 && !packet.view.ready[M.seat]) {
          if (fresh || oldSeat !== M.seat || !M.layout) M.layout = packet.ctrl.length === 2 ? E.randomLayout(Math.random) : startLayout();
        } else M.layout = null;
        if (fresh) enterGame();
        if (packet.ctrl.length === 2 && packet.view.phase !== 'over' && (fresh || oldSeat !== M.seat)) {
          var seat = M.seat;
          curtain(seat, nameOf(seat) + 'さんの番です', '端末を受け取ってから「見る」を押してください。相手におばけの色を見せないでください。', null);
          return;
        }
        if (!fresh && packet.ev && before && packet.view.phase !== 'setup') await show(packet.ev, before);
        render();
        if (packet.view.phase === 'over' && !M.spectator) finish();
      });
      return tourQueue;
    }
  };
  window.GST_TOUR_READY = import('./tournaments.mjs?v=20261029-menu1').then(function (mod) {
    window.GST_TOUR = mod.createGeisterTournaments(tourAPI);
    return window.GST_TOUR;
  }).catch(function (e) { console.error('Tournament loading failed', e); toast('大会機能を読み込めませんでした'); });

  if (TEST) {
    window.__gst = {
      M: function () { return M; }, L: function () { return L; }, view: viewNow, E: E, AI: AI,
      act: function (a) { act(a); }, tap: function (q) { var d = disp(q); cellBtns[d].click(); },
      setup: function (layout) { if (layout) M.layout = layout.slice(); confirmSetup(); },
      curtainGo: function () { $('#curtainGo').click(); },
      busy: function () { return !M || M.busy || !!M.thinking || !$('#curtain').hidden; }
    };
  }
})();
