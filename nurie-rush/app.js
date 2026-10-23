/* おばけキャッチ — screens, the table, CPU timing, 1台でふたり, rankings and online play.
   Local modes run engine.js directly. Online, the host's browser runs engine.js and the guests only show what
   the host sends. Who was first is decided by each player's own reaction time (from the moment the card face
   showed on that player's screen to the touch), and the host waits a short moment after the first correct touch
   so that a faster touch still on its way over the network can win. */
(function () {
  'use strict';
  var D = window.NR_DECK, A = window.NR_ART, E = window.NR_ENGINE, N = window.NR_NET, T = window.NR_TRAIN, R = window.NR_RANK, L = window.NR_LAYOUT, DR = window.NR_DRILL;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var NETKIND = params.get('net') === 'local' ? 'local' : 'peer';
  var TEST = params.get('test') === '1';
  function now() { return performance.now(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function sec(ms) { return (ms / 1000).toFixed(2) + '秒'; }
  function clockText(ms) { ms = Math.max(0, ms); var m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }

  /* ---------------------------------------------------------------- settings */
  var SKEY = 'nurie.v1', CKEY = 'nurie.cid', TKEY = 'obake.training.v1', DKEY = 'obake.drill.v1';
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  var S = Object.assign({ name: '', cpu: 2, level: 2, deck: 60, call: false, sound: true, pattern: false, duo: ['', ''], duoDeck: 60, duoCall: false, rankName: '', rankCall: false, lobLevel: 2, trainCount: 20, trainCall: false, trainGoal: 1, drillLen: 120, drillCall: false }, load(SKEY, {}));
  var TR = T.normalize(load(TKEY, null));
  var DRD = DR.normalize(load(DKEY, null));
  function persist() { save(SKEY, S); }
  function myCid() {
    var c = null;
    try { c = sessionStorage.getItem(CKEY); } catch (e) { /* ignore */ }
    if (!c) { c = N.makeCid(); try { sessionStorage.setItem(CKEY, c); } catch (e) { /* ignore */ } }
    return c;
  }

  var AV = ['#6b5b4f', '#4f6475', '#7a5c7e', '#5e7a5a', '#8a6a3c', '#50707a', '#7c4f4f', '#5b5b7a'];
  var CPU_NAMES = ['クレヨン', 'えのぐ', 'パステル', 'マーカー', 'いろえんぴつ', 'スタンプ', 'ペンキ'];
  var GRAB_KEYS = ['1', '2', '3', '4', '5'], CALL_KEYS = ['q', 'w', 'e', 'r', 't'];
  var GRAB_KEYS2 = ['6', '7', '8', '9', '0'], CALL_KEYS2 = ['y', 'u', 'i', 'o', 'p'];

  document.addEventListener('gemini-bgm-change', function () { globalThis.GEMINI_BGM?.setEnabled(S.sound); });
  /* ---------------------------------------------------------------- sound */
  var Snd = (function () {
    var ctx = null;
    function ac() {
      if (!S.sound) return null;
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, d, type, vol, delay, f2) {
      var c = ac(); if (!c) return;
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.03);
    }
    function noise(d, vol) {
      var c = ac(); if (!c) return;
      var n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0);
      for (var i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 1600; s.buffer = b; g.gain.value = vol || 0.12;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start();
    }
    return {
      unlock: function () { ac(); },
      flip: function () { noise(0.07, 0.15); },
      win: function () { tone(784, 0.11, 'triangle', 0.22); tone(1175, 0.18, 'triangle', 0.2, 0.08); },
      other: function () { tone(660, 0.1, 'triangle', 0.1); tone(550, 0.14, 'triangle', 0.09, 0.07); },
      bad: function () { tone(200, 0.24, 'square', 0.09, 0, 120); },
      back: function () { tone(520, 0.12, 'sine', 0.13); tone(390, 0.2, 'sine', 0.12, 0.1); },
      end: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.24, 'triangle', 0.17, i * 0.11); }); },
      ok: function () { tone(988, 0.08, 'triangle', 0.14); }
    };
  })();
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } }

  /* ---------------------------------------------------------------- screens, toasts, dialogs */
  var SCREENS = ['scrTitle', 'scrSolo', 'scrDuo', 'scrRanking', 'scrTraining', 'scrDrill', 'scrOnline', 'scrLobby'];
  function screen(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    $('app').hidden = true; $('duo').hidden = true;
    var el = $(id); if (el) el.scrollTop = 0;
  }
  function toast(msg, ms) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  }
  var modalEl = null, modalClose = null;
  function openModal(html, o) {
    o = o || {};
    closeModal(true);
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="sheet' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      (o.closable === false ? '' : '<button class="iconbtn x-close" type="button" data-close aria-label="閉じる"><svg><use href="#i-close"/></svg></button>') + html + '</div>';
    document.body.appendChild(m);
    modalEl = m; modalClose = o.onClose || null;
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
      else if (e.target === m && o.closable !== false) closeModal();
    });
    var f = m.querySelector('[data-focus]') || m.querySelector('.sheet button:not(.x-close)') || m.querySelector('.sheet');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    return m;
  }
  function closeModal(silent) {
    if (!modalEl) return;
    var cb = modalClose;
    modalEl.remove(); modalEl = null; modalClose = null;
    if (cb && !silent) cb();
  }
  function bindSeg(el, val, onPick) {
    function paint(v) { el.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === String(v))); }); }
    paint(val);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      paint(b.dataset.v); onPick(b.dataset.v);
    });
    return paint;
  }

  /* ---------------------------------------------------------------- pieces and name buttons */
  var layoutMode = null, layoutOrder = D.ANIMALS.slice();
  function modePieceOrder(mode) {
    if (layoutMode !== mode) {
      var old = layoutOrder.join();
      layoutOrder = D.ANIMALS.slice();
      for (var i = layoutOrder.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), item = layoutOrder[i]; layoutOrder[i] = layoutOrder[j]; layoutOrder[j] = item;
      }
      if (layoutOrder.join() === old) { var last = layoutOrder.pop(); layoutOrder.unshift(last); }
      layoutMode = mode;
    }
    return layoutOrder;
  }
  function pieceButtons(box, onTouch, keys, order) {
    box.innerHTML = '';
    (order || D.ANIMALS).forEach(function (x, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pc'; b.dataset.item = x;
      b.setAttribute('aria-label', D.NAME[x] + '（' + D.COLOR_NAME[D.TRUE_COLOR[x]] + '）をタッチ');
      b.innerHTML = A.piece(x) + (keys ? '<span class="key" aria-hidden="true">' + keys[k].toUpperCase() + '</span>' : '') + '<span class="who"></span>';
      wireTouch(b, function () { onTouch('grab', x); });
      box.appendChild(b);
    });
  }
  function callButtons(box, onTouch, keys, label, order) {
    box.innerHTML = label ? '<div class="lab">' + label + '</div>' : '';
    (order || D.ANIMALS).forEach(function (x, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'nmbtn'; b.dataset.item = x;
      b.setAttribute('aria-label', '「' + D.NAME[x] + '」と呼ぶ');
      b.innerHTML = (keys ? '<span class="key" aria-hidden="true">' + keys[k].toUpperCase() + '</span>' : '') + A.icon(x) + '<span>' + D.NAME[x] + '</span><span class="who"></span>';
      wireTouch(b, function () { onTouch('call', x); });
      box.appendChild(b);
    });
  }
  function wireTouch(b, fn) {
    b.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      Snd.unlock();
      b.classList.add('pressed'); setTimeout(function () { b.classList.remove('pressed'); }, 140);
      fn();
    });
    b.addEventListener('click', function (e) { if (e.detail === 0) fn(); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function repaintArt() {
    document.querySelectorAll('.pc[data-item]').forEach(function (b) {
      var svg = b.querySelector('.nr-piece'); if (svg) svg.outerHTML = A.piece(b.dataset.item);
    });
    document.querySelectorAll('.nmbtn[data-item]').forEach(function (b) {
      var svg = b.querySelector('.nr-icon'); if (svg) svg.outerHTML = A.icon(b.dataset.item);
    });
    renderLineup();
    if (M && M.round && M.round.card != null) M.faces().forEach(function (f) { f.front.innerHTML = A.cardFace(D.CARDS[M.round.card], { label: cardLabel(M.round.card) }); });
  }
  function cardLabel(c) { return 'カード：' + D.describe(D.CARDS[c]); }

  /* ---------------------------------------------------------------- the match (shared state for every mode) */
  var M = null;
  function stopTimers() { if (!M) return; M.timers.forEach(clearTimeout); M.timers = []; if (M.clockTimer) { clearInterval(M.clockTimer); M.clockTimer = null; } }
  function later(fn, ms) { var t = setTimeout(fn, ms); if (M) M.timers.push(t); return t; }
  function endMatch() {
    if (!M) return;
    stopTimers();
    if (M.onEnd) M.onEnd();
    M = null;
    closeModal(true);
  }

  /* one card on screen: back → front flip. returns the time the face became visible */
  function setBack(f) { f.flip.classList.add('instant'); f.flip.classList.remove('up'); f.back.innerHTML = A.cardBack(); void f.flip.offsetWidth; f.flip.classList.remove('instant'); f.wrap.classList.remove('away', 'shake'); }
  function flipTo(f, c) {
    f.front.innerHTML = A.cardFace(D.CARDS[c], { label: cardLabel(c) });
    f.wrap.classList.remove('away', 'shake');
    f.flip.classList.add('up');
  }
  function faceDelay() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 75; }

  function seatChips() {
    var box = $('seats');
    box.innerHTML = '';
    box.className = 'n' + M.seats.length;
    M.seats.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'seat' + (i === M.me ? ' me' : '') + (s.on === false ? ' off' : '');
      d.dataset.seat = i;
      var sub = s.kind === 'cpu' ? (E.LEVELS[s.level] ? E.LEVELS[s.level].name : 'CPU') : (i === M.me ? (s.name === 'あなた' ? '' : 'あなた') : (s.kind === 'host' ? 'ホスト' : ''));
      d.innerHTML = '<span class="av" style="--av:' + AV[i % AV.length] + '">' + esc((s.name || '?').slice(0, 1)) + '</span>' +
        '<span class="nm">' + esc(s.name) + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
        '<span class="sc" title="持っているカード"><i></i><span>' + (M.scores[i] || 0) + '</span></span>';
      box.appendChild(d);
    });
  }
  function seatEl(i) { return $('seats').querySelector('.seat[data-seat="' + i + '"]'); }
  function seatMark(i, text, cls) {
    var d = seatEl(i); if (!d) return;
    var mk = d.querySelector('.mk');
    if (!mk) { mk = document.createElement('span'); d.appendChild(mk); }
    mk.className = 'mk' + (cls ? ' ' + cls : ''); mk.textContent = text;
  }
  function clearSeatMarks() { document.querySelectorAll('.seat .mk').forEach(function (m) { m.remove(); }); document.querySelectorAll('.seat.win').forEach(function (s) { s.classList.remove('win'); }); }
  function setScores(sc, changed) {
    M.scores = sc.slice();
    sc.forEach(function (v, i) {
      var d = seatEl(i); if (!d) return;
      var n = d.querySelector('.sc span'), was = +n.textContent;
      n.textContent = v;
      if (v !== was) {
        var box = d.querySelector('.sc'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
        if (changed !== false) floatAt(d, (v > was ? '+' : '') + (v - was), v < was);
      }
    });
  }
  function floatAt(el, text, bad) {
    var r = el.getBoundingClientRect();
    var f = document.createElement('div');
    f.className = 'float' + (bad ? ' bad' : '');
    f.textContent = text;
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height - 4) + 'px';
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 950);
  }
  function setLeft(n) { $('leftNum').textContent = n; $('duoLeft').textContent = n; drawPile(n); }
  function drawPile(n) {
    var el = $('pileArt'); if (!el) return;
    var layers = n > 30 ? 3 : n > 10 ? 2 : n > 0 ? 1 : 0, s = '';
    for (var i = 0; i < layers; i++) s += '<g transform="translate(' + (i * 2) + ' ' + (-i * 3) + ')"><rect x="1" y="8" width="54" height="42" rx="6" fill="#2f6f6c" stroke="#fffaf0" stroke-width="1.6"/></g>';
    el.innerHTML = layers ? '<svg viewBox="0 0 62 54">' + s + '</svg>' : '';
  }
  function banner(html) { $('banner').innerHTML = html || ''; }
  function whoBadge(seat, ng) { return '<span class="b' + (ng ? ' ng' : '') + '" style="--av:' + AV[seat % AV.length] + '">' + esc((M.seats[seat].name || '?').slice(0, 1)) + '</span>'; }
  function markOn(root, type, item, html) {
    var sel = (type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"] .who';
    var w = root.querySelector(sel); if (w) w.insertAdjacentHTML('beforeend', html);
  }
  function clearMarks(root) {
    root.querySelectorAll('.who').forEach(function (w) { w.innerHTML = ''; });
    root.querySelectorAll('.answer,.mine').forEach(function (b) { b.classList.remove('answer', 'mine'); });
  }
  function showAnswer(root, need, item) {
    var b = root.querySelector((need === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]');
    if (b) b.classList.add('answer');
  }
  function outcomeLine(out) {
    var card = D.CARDS[out.card], s = D.solve(card);
    var how = out.need === 'call' ? '本がいるので「' + D.NAME[out.answer] + '」と呼ぶ' : '';
    return { why: D.explain(card), how: how, match: s.match };
  }

  /* ---------------------------------------------------------------- the table screen */
  function enterTable(o) {
    SCREENS.forEach(function (s) { $(s).hidden = true; });
    $('duo').hidden = true; $('app').hidden = false;
    $('callChip').hidden = !o.call;
    $('roomChip').hidden = !o.code; $('roomChip').textContent = o.code || '';
    $('clock').hidden = !o.clock;
    globalThis.GEMINI_BGM?.setEnabled(S.sound);
    $('btnSound').classList.toggle('off', !S.sound); $('btnSound').setAttribute('aria-pressed', String(S.sound));
    var keys = !matchMedia('(pointer: coarse)').matches;
    var mode = M.mode === 'host' || M.mode === 'guest' ? 'online' : M.mode === 'training' && M.train.unlimited ? 'training-unlimited' : M.mode;
    var order = modePieceOrder(mode);
    $('tapNext').textContent = keys ? 'クリックかスペースで次へ' : 'タップで次へ';
    pieceButtons($('pieces'), function (t, x) { if (M && M.touch) M.touch(t, x); }, keys ? GRAB_KEYS : null, order);
    $('callRow').hidden = !o.call;
    if (o.call) callButtons($('callRow'), function (t, x) { if (M && M.touch) M.touch(t, x); }, keys ? CALL_KEYS : null, '本が描かれていたら、コマではなく名前で答える', order);
    seatChips();
    banner('');
    var f = M.faces()[0]; setBack(f);
    L.attach($('table'), $('stage'), $('pieces'));
    setLeft(o.left);
    lockTable(true);
  }
  function lockTable(on) { $('table').classList.toggle('locked', !!on); }
  function tableFaces() { return [{ wrap: $('cardWrap'), flip: $('flip'), back: $('faceBack'), front: $('faceFront') }]; }

  /* ================================================================ CPU と対戦 */
  var LEVEL_NOTE = {
    4: '最強：同じ絵があるカードは0.6〜1秒、ないカードも0.7〜1.2秒で正解を取りにきます。おてつきもほとんどしません。',
    5: '成長する敵：最強と同じ速さから始まり、あなたに負けるたびに反応が速くなります。あなたの正解の速さも覚えて、それより少し速く取りにきます（人ができる速さより速くはなりません）。'
  };
  var RIVALS = window.PLAYROOM_RIVAL;
  var rival = RIVALS ? RIVALS.open('nurie-rush', { base: {}, space: {}, boostStep: 0.25, boostMax: 3, boostLabel: '反応の速さ', boostUp: '反応を速くしました' }) : null;
  function median(a) { if (!a || !a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function rivalExtra() {
    if (!rival) return null;
    var y = rival.seen.you || {};
    return { boost: rival.boost, you: { match: (y.match || []).length >= 3 ? median(y.match) : 0, none: (y.none || []).length >= 3 ? median(y.none) : 0 } };
  }
  function levelNotes() {
    var note = $('levelNote'), rc = $('rivalCard');
    if (note) note.textContent = LEVEL_NOTE[S.level] || '';
    if (!rc) return;
    if (rival && S.level >= 5) { rc.innerHTML = RIVALS.cardHTML(rival); RIVALS.bindCard(rc, rival, levelNotes); } else rc.innerHTML = '';
  }
  /* after a game against the learning rival: remember how fast you were, and learn when it lost */
  function rivalAfterGame(rk) {
    if (!rival || !M || M.mode !== 'cpu' || !M.seats.some(function (s) { return s.level >= 5; }) || M.rivalDone) return;
    M.rivalDone = true;
    var hrt = M.hrt || [];
    if (hrt.length) rival.observe(function (seen) {
      var y = seen.you = seen.you || { match: [], none: [] };
      hrt.forEach(function (x) { (x[0] ? y.match : y.none).push(x[1]); });
      y.match = y.match.slice(-40); y.none = y.none.slice(-40);
    });
    var top = rk.filter(function (x) { return x.rank === 1; }), mine = top.some(function (x) { return x.seat === M.me; });
    if (!rival.result(mine ? (top.length > 1 ? 'draw' : 'you') : 'cpu')) return;
    var y = rival.seen.you || {}, notes = [];
    var m1 = median(y.match), m2 = median(y.none);
    if (m1 || m2) {
      var fast = (m1 && m1 * 0.92 < E.FLOOR.match + 120) || (m2 && m2 * 0.92 < E.FLOOR.none + 120);
      notes.push('あなたの正解の速さを覚えました（同じ絵があるカード ' + (m1 ? sec(m1) : '—') + '・ないカード ' + (m2 ? sec(m2) : '—') + '）。' + (fast ? 'とても速いので、人が出せる速さの限界近くまで反応を上げます' : '次はそれより少し速く取りにいきます'));
    }
    setTimeout(function () {
      RIVALS.learn(rival, function () { return new Promise(function (res) { setTimeout(function () { res({ params: {} }); }, 1600); }); }, { timeMs: 1800, noLive: true, msg: '反応の速さを見直しています。', notes: notes });
    }, 900);
  }
  function startCpu() {
    var seats = [{ name: S.name || 'あなた', kind: 'human' }];
    for (var i = 0; i < S.cpu; i++) seats.push({ name: CPU_NAMES[i], kind: 'cpu', level: S.level, speed: 0.93 + Math.random() * 0.14 });
    var g = E.newGame({ seats: seats, deckSize: S.deck, callMode: S.call });
    M = localMatch('cpu', g, seats);
    enterTable({ call: S.call, left: g.deck.length });
    nextRound(900);
  }
  function localMatch(mode, g, seats) {
    var m = { mode: mode, g: g, seats: seats, me: mode === 'duo' ? -1 : 0, scores: seats.map(function () { return 0; }), timers: [], round: null, paused: false };
    m.faces = mode === 'duo' ? duoFaces : tableFaces;
    m.touch = function (type, item) { humanTouch(m.me, type, item); };
    return m;
  }
  function nextRound(delay) {
    if (!M) return;
    if (M.mode === 'training') { nextTraining(delay); return; }
    if (M.mode === 'drill') { nextDrill(delay); return; }
    stopTimers();
    if (M.g.over) { if (M.mode === 'ranking') finishRanking(); else finishLocal(); return; }
    M.round = null;
    M.faces().forEach(setBack);
    if (M.mode === 'duo') duoClear(); else { clearMarks($('table')); clearSeatMarks(); banner(''); $('tapNext').hidden = true; }
    lockAll(true);
    later(revealLocal, delay);
  }
  function lockAll(on) { if (M.mode === 'duo') { $('halfP1').classList.toggle('locked', on); $('halfP2').classList.toggle('locked', on); } else lockTable(on); }
  function revealLocal() {
    if (!M || M.paused) return;
    var c = E.reveal(M.g);
    if (c == null) { if (M.mode === 'ranking') finishRanking(); else finishLocal(); return; }
    M.faces().forEach(function (f) { flipTo(f, c); });
    Snd.flip();
    var faceAt = now() + faceDelay();
    M.round = { n: M.g.n, card: c, faceAt: faceAt, done: false, mine: {} };
    setLeft(M.g.deck.length);
    lockAll(false);
    if (M.mode === 'cpu') {
      M.seats.forEach(function (s, i) {
        if (s.kind !== 'cpu') return;
        var p = E.cpuPlan(c, s.level, M.g.callMode, Math.random, s.speed, s.level >= 5 ? rivalExtra() : null);
        later(function () { cpuTouch(i, p); }, Math.max(0, p.rt + faceDelay()));
      });
    }
    if (M.mode === 'ranking') rankingTick();
  }
  function cpuTouch(i, p) {
    if (!M || !M.round || M.round.done) return;
    var rt = Math.max(p.rt, Math.round(now() - M.round.faceAt));
    var t = E.touch(M.g, i, p.type, p.item, rt);
    if (t) afterTouch(t);
  }
  function humanTouch(seat, type, item) {
    if (M && M.mode === 'drill' && M.drill.fix && !M.paused) { drillFix(type, item); return; }
    if (!M || !M.round || M.round.done || M.paused) return;
    if (M.round.mine[seat]) return;
    var tn = now();
    if (tn < M.round.faceAt - 20) return;
    if (M.mode === 'drill') { drillTouch(type, item, tn - M.round.faceAt); return; }
    if (M.mode === 'training') { trainingTouch(type, item, tn - M.round.faceAt); return; }
    if (M.mode === 'ranking') { rankingTouch(type, item, tn - M.round.faceAt); return; }
    var t = E.touch(M.g, seat, type, item, Math.max(1, Math.round(tn - M.round.faceAt)));
    if (!t) return;
    if (M.mode === 'cpu' && seat === M.me) {
      rememberAnswer(M.round.card, M.g.callMode, t.ok);
      if (t.ok) (M.hrt = M.hrt || []).push([D.solve(D.CARDS[M.round.card]).match ? 1 : 0, Math.max(1, Math.round(tn - M.round.faceAt))]);
    }
    M.round.mine[seat] = t;
    if (M.mode === 'duo') duoMine(seat, type, item); else { lockTable(true); var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine'); }
    afterTouch(t);
  }
  function afterTouch(t) {
    if (!t.ok) {
      if (M.mode === 'duo') duoWrong(t);
      else {
        markOn($('table'), t.type, t.item, whoBadge(t.seat, true));
        seatMark(t.seat, '✕');
        if (t.seat === M.me) { Snd.bad(); buzz(40); $('cardWrap').classList.add('shake'); }
      }
    }
    if (t.ok || E.allTouched(M.g)) { settleLocal(); return; }
    // everybody else has missed: the last player can take it calmly
    if (M.mode === 'cpu' && !M.round.mine[M.me]) {
      var others = M.seats.every(function (s, i) { return i === M.me || !!M.g.round.tries[i]; });
      if (others) banner('<div class="hint">ほかの全員がまちがえました。あなたが正解すればカードはあなたのもの</div>');
    }
  }
  function settleLocal() {
    stopTimers();
    var out = E.settle(M.g);
    M.round.done = true;
    if (M.mode === 'duo') duoOutcome(out); else tableOutcome(out);
    var wait = out.back ? 2100 : 1650;
    if (M.mode !== 'duo') {
      $('tapNext').hidden = false;
      M.skip = function () { if (M && M.round && M.round.done) { M.skip = null; nextRound(380); } };
    }
    later(function () { if (M) { M.skip = null; nextRound(rand(450, 850)); } }, wait);
  }
  function tableOutcome(out) {
    var me = M.me, L = outcomeLine(out), html;
    showAnswer($('table'), out.need, out.answer);
    out.tries.forEach(function (t) { if (t.ok) markOn($('table'), t.type, t.item, whoBadge(t.seat, false)); });
    if (out.win >= 0) {
      var w = seatEl(out.win); if (w) w.classList.add('win');
      seatMark(out.win, '+1', 'plus');
      var who = out.win === me ? 'ゲット！' : esc(M.seats[out.win].name) + 'がゲット';
      html = '<div class="big">' + A.icon(out.answer) + who + '<span style="font-size:14px;font-family:var(--f-ui);font-weight:700;color:var(--text-2)">' + sec(out.rt) + '</span></div>';
      if (out.win === me) { Snd.win(); buzz(15); } else Snd.other();
    } else {
      html = '<div class="big bad">全員まちがい！ カードは山札の下へ</div>';
      Snd.back();
      $('cardWrap').classList.add('away'); $('cardWrap').style.setProperty('--dx', '-38%'); $('cardWrap').style.setProperty('--dy', '30%');
    }
    var paid = out.moves.filter(function (mv) { return mv.card !== null; }).map(function (mv) { return esc(M.seats[mv.from].name); });
    html += '<div class="sub">' + esc(L.why) + '</div>' + (L.how ? '<div class="hint">' + esc(L.how) + '</div>' : '');
    if (paid.length) html += '<div class="hint">おてつき：' + paid.join('、') + ' が1枚わたす</div>';
    banner(html);
    out.moves.forEach(function (mv) { seatMark(mv.from, mv.card !== null ? '−1' : '✕'); });
    setScores(E.scores(M.g));
    if (out.win >= 0 && out.win !== me) {
      var mine = out.tries.filter(function (t) { return t.seat === me; })[0];
      if (mine && !mine.ok && mine.late) banner($('banner').innerHTML + '<div class="hint">あなたのタッチは取られたあとだったので、おてつきなし</div>');
    }
  }

  function finishLocal() {
    if (!M) return;
    stopTimers();
    Snd.end();
    var g = M.g, mode = M.mode;
    var rk = E.ranking(g);
    if (mode === 'cpu') rivalAfterGame(rk);
    showResults({
      mode: mode, seats: M.seats, ranking: rk, me: M.me,
      stats: g.seats.map(function (s) { return { ok: s.ok, bad: s.bad, paid: s.paid, rts: s.rts }; }),
      again: function () { closeModal(true); endMatch(); if (mode === 'cpu') startCpu(); else startDuo(); },
      setup: function () { closeModal(true); endMatch(); screen(mode === 'cpu' ? 'scrSolo' : 'scrDuo'); },
      title: function () { closeModal(true); endMatch(); screen('scrTitle'); }
    });
  }

  /* ---------------------------------------------------------------- results dialog */
  function showResults(r) {
    var top = r.ranking.filter(function (x) { return x.rank === 1; });
    var title;
    if (top.length > 1) title = top.some(function (x) { return x.seat === r.me; }) ? '引き分け！' : top.map(function (x) { return esc(r.seats[x.seat].name); }).join('と') + 'が同点1位';
    else if (top[0].seat === r.me) title = 'あなたの勝ち！';
    else title = esc(r.seats[top[0].seat].name) + 'の勝ち！';
    var h = '<h3 class="result-title">' + title + '</h3><ol class="rank">';
    r.ranking.forEach(function (x) {
      h += '<li class="' + (x.rank === 1 ? 'top' : '') + '"><span class="no">' + x.rank + '</span><span class="av" style="--av:' + AV[x.seat % AV.length] + '">' + esc(r.seats[x.seat].name.slice(0, 1)) + '</span><span class="nm">' + esc(r.seats[x.seat].name) + (x.seat === r.me && r.seats[x.seat].name !== 'あなた' ? '（あなた）' : '') + '</span><span class="sc">' + x.score + '</span></li>';
    });
    h += '</ol>';
    var who = r.me >= 0 ? [r.me] : r.mode === 'duo' ? [0, 1] : [];
    who.forEach(function (i) {
      var st = r.stats[i]; if (!st) return;
      var avg = st.rts.length ? st.rts.reduce(function (a, b) { return a + b; }, 0) / st.rts.length : 0;
      var best = st.rts.length ? Math.min.apply(null, st.rts) : 0;
      if (r.mode === 'duo') h += '<h4>' + esc(r.seats[i].name) + '</h4>';
      h += '<div class="stats"><div><span>いちばん早く正解</span><b>' + st.ok + '回</b></div><div><span>おてつき</span><b>' + st.bad + '回</b><small>カードを' + st.paid + '枚わたした</small></div>' +
        '<div><span>正解までの平均</span><b>' + (st.rts.length ? sec(avg) : '—') + '</b></div><div><span>最速</span><b>' + (st.rts.length ? sec(best) : '—') + '</b></div></div>';
    });
    h += '<div class="stack">';
    if (r.again) h += '<button class="btn primary" type="button" data-act="again" data-focus>' + (r.againLabel || 'もう一度') + '</button>';
    h += '<div class="row">';
    if (r.setup) h += '<button class="btn" type="button" data-act="setup">設定を変える</button>';
    h += '<button class="btn ghost" type="button" data-act="title">' + (r.titleLabel || 'タイトルへ') + '</button></div>';
    if (r.note) h += '<p class="note">' + r.note + '</p>';
    h += '</div>';
    var m = openModal(h, { closable: false });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var f = r[b.dataset.act]; if (f) f();
    });
  }

  /* ================================================================ 1台でふたり */
  function duoFaces() {
    return ['halfP1', 'halfP2'].map(function (id) {
      var h = $(id);
      return { wrap: h.querySelector('.cardwrap'), flip: h.querySelector('.flip'), back: h.querySelector('.face.back'), front: h.querySelector('.face.front') };
    });
  }
  function startDuo() {
    var seats = [{ name: S.duo[0] || 'プレイヤー1', kind: 'human' }, { name: S.duo[1] || 'プレイヤー2', kind: 'human' }];
    var g = E.newGame({ seats: seats, deckSize: S.duoDeck, callMode: S.duoCall });
    M = localMatch('duo', g, seats);
    SCREENS.forEach(function (s) { $(s).hidden = true; });
    $('app').hidden = true; $('duo').hidden = false;
    $('duoCallChip').hidden = !S.duoCall;
    $('duoSound').classList.toggle('off', !S.sound);
    var keys = !matchMedia('(pointer: coarse)').matches;
    var order = modePieceOrder('duo');
    [['halfP1', 0, GRAB_KEYS, CALL_KEYS], ['halfP2', 1, GRAB_KEYS2, CALL_KEYS2]].forEach(function (d) {
      var h = $(d[0]), seat = d[1];
      h.innerHTML = '<div class="hd"><span class="av" style="--av:' + AV[seat] + '">' + esc(seats[seat].name.slice(0, 1)) + '</span><span class="nm">' + esc(seats[seat].name) + '</span><span class="msg" aria-live="polite"></span><span class="sc">0</span></div>' +
        '<div class="stg"><div class="cardwrap"><div class="flip"><div class="face back"></div><div class="face front"></div></div></div></div>' +
        '<div class="callrow"' + (S.duoCall ? '' : ' hidden') + '></div><div class="pcs"></div>';
      var touch = function (t, x) { humanTouch(seat, t, x); };
      pieceButtons(h.querySelector('.pcs'), touch, keys ? d[2] : null, order);
      if (S.duoCall) callButtons(h.querySelector('.callrow'), touch, keys ? d[3] : null, null, order);
      L.attach(h, h.querySelector('.stg'), h.querySelector('.pcs'));
    });
    M.faces().forEach(setBack);
    setLeft(g.deck.length);
    nextRound(1100);
  }
  function duoHalf(seat) { return $(seat === 0 ? 'halfP1' : 'halfP2'); }
  function duoMsg(seat, text, cls) { var m = duoHalf(seat).querySelector('.msg'); m.className = 'msg' + (cls ? ' ' + cls : ''); m.textContent = text || ''; }
  function duoClear() { [0, 1].forEach(function (s) { clearMarks(duoHalf(s)); duoMsg(s, ''); }); }
  function duoMine(seat, type, item) {
    var h = duoHalf(seat);
    h.classList.add('locked');
    var b = h.querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
  }
  function duoWrong(t) {
    duoMsg(t.seat, 'まちがい！', 'bad');
    markOn(duoHalf(t.seat), t.type, t.item, whoBadge(t.seat, true));
    duoHalf(t.seat).querySelector('.cardwrap').classList.add('shake');
    Snd.bad(); buzz(40);
    var other = 1 - t.seat;
    if (!M.round.mine[other]) duoMsg(other, 'あいてがまちがえた！ ゆっくりでOK', '');
  }
  function duoOutcome(out) {
    [0, 1].forEach(function (s) { showAnswer(duoHalf(s), out.need, out.answer); });
    if (out.win >= 0) {
      duoMsg(out.win, 'ゲット！ ' + sec(out.rt), 'good');
      var lose = 1 - out.win, paid = out.moves.some(function (mv) { return mv.from === lose && mv.card !== null; });
      duoMsg(lose, paid ? 'おてつき：1枚わたす' : (out.tries.some(function (t) { return t.seat === lose && !t.ok; }) ? 'まちがい' : D.short(D.CARDS[out.card]) + '：' + D.NAME[out.answer]), paid ? 'bad' : '');
      Snd.win();
    } else {
      [0, 1].forEach(function (s) { duoMsg(s, '全員まちがい → 山札の下へ', 'bad'); });
      Snd.back();
    }
    var sc = E.scores(M.g);
    [0, 1].forEach(function (s) {
      var el = duoHalf(s).querySelector('.sc'), was = +el.textContent;
      el.textContent = sc[s];
      if (was !== sc[s]) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    });
    M.scores = sc;
  }

  /* ================================================================ 60枚ランキング */
  function rankTime(ms) { return Math.floor(ms / 60000) + ':' + ((ms % 60000) / 1000).toFixed(3).padStart(6, '0'); }
  function accuracy(correct) { return (correct * 100 / 60).toFixed(1).replace(/\.0$/, '') + '%'; }
  function startRanking() {
    var name = R.cleanName(S.rankName);
    if (!name) { renderRankingSetup(); screen('scrRanking'); $('rankNameError').hidden = false; $('rankName').focus(); return; }
    S.rankName = name; persist();
    var seats = [{ name: name, kind: 'human' }];
    var g = E.newGame({ seats: seats, deckSize: 60, callMode: !!S.rankCall });
    M = localMatch('ranking', g, seats);
    M.rank = { name: name, mode: g.callMode ? 'call' : 'basic', results: [], total: 0, cardStartedAt: null };
    enterTable({ call: g.callMode, left: 60, clock: true });
    $('seats').hidden = true; $('clock').textContent = clockText(0);
    M.onEnd = function () { $('seats').hidden = false; };
    nextRound(900);
  }
  function rankingTick() {
    // Keep the original reveal time when the same unanswered card resumes.
    if (M.rank.cardStartedAt == null) M.rank.cardStartedAt = M.round.faceAt;
    if (M.clockTimer) clearInterval(M.clockTimer);
    M.clockTimer = setInterval(function () {
      if (!M || !M.round || M.round.done) return;
      $('clock').textContent = clockText(M.rank.total + Math.max(0, now() - M.rank.cardStartedAt));
    }, 100);
  }
  function rankingTouch(type, item, rt) {
    var r = M.round, P = M.rank;
    rt = Math.max(1, Math.round(now() - P.cardStartedAt)); P.cardStartedAt = null;
    var q = E.need(M.g, r.card), ok = type === q.type && item === q.item;
    rememberAnswer(r.card, M.g.callMode, ok);
    DR.observe(DRD, M.g.callMode, r.card, ok, rt); saveDrill();   // ranking answers also update the drill's card map
    r.done = true; r.mine[0] = true;
    if (M.clockTimer) { clearInterval(M.clockTimer); M.clockTimer = null; }
    M.g.round.done = true;
    P.results.push({ card: r.card, rt: rt, ok: ok, type: type, item: item }); P.total += rt;
    $('clock').textContent = clockText(P.total);
    lockTable(true);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    showAnswer($('table'), q.type, q.item);
    var heading = ok ? '正解！' : 'まちがい・正解は';
    if (ok) Snd.ok(); else { Snd.bad(); buzz(40); $('cardWrap').classList.add('shake'); }
    banner('<div class="big' + (ok ? '' : ' bad') + '">' + heading + A.icon(q.item) + esc(D.NAME[q.item]) + '</div>' +
      '<div class="training-time">' + P.results.length + ' / 60枚　回答 ' + sec(rt) + (ok ? '' : ' ／ 評価タイムに＋6秒') + '</div><div class="sub">' + esc(trainingReason(D.CARDS[r.card], q)) + '</div>');
    if (!M.g.deck.length) M.g.over = true;
    $('tapNext').hidden = false;
    M.skip = function () { if (M && M.mode === 'ranking' && M.round && M.round.done) { M.skip = null; nextRound(350); } };
    later(function () { nextRound(rand(450, 850)); }, ok ? 1650 : 2100);
  }
  function finishRanking() {
    stopTimers(); M.skip = null; Snd.end();
    var P = M.rank, correct = P.results.filter(function (x) { return x.ok; }).length;
    var attempt = { version: 2, name: P.name, mode: P.mode, answers: P.results.map(function (x) { return { card: x.card, type: x.type, item: x.item, rt: x.rt }; }) };
    var h = '<h3 class="result-title">60枚の挑戦 完了！</h3><p class="sumline">' + esc(P.name) + ' ／ ' + (P.mode === 'call' ? '本は呼ぶ' : '基本ルール') + '</p>' +
      '<div class="stats"><div><span>評価タイム</span><b>' + rankTime(R.adjustedMs({correct:correct,totalMs:P.total})) + '</b><small>回答 ' + rankTime(P.total) + ' ＋ ミス ' + (60-correct) + '回×6秒</small></div><div><span>正答率</span><b>' + accuracy(correct) + '</b><small>' + correct + ' / 60枚 正解</small></div></div>' +
      '<p class="note" id="rankSaveStatus" role="status">ランキングに記録を送信しています…</p>' +
      '<div class="stack"><button class="btn" type="button" data-rank-act="retry" hidden>記録を再送する</button><button class="btn primary" type="button" data-rank-act="board" data-focus>ランキングを見る</button><button class="btn" type="button" data-rank-act="again">同じ名前でもう一度</button><button class="btn ghost" type="button" data-rank-act="title">タイトルへ</button></div>';
    var modal = openModal(h, { closable: false }), busy = false;
    function submit() {
      if (busy) return; busy = true;
      var status = modal.querySelector('#rankSaveStatus'), retry = modal.querySelector('[data-rank-act="retry"]');
      retry.hidden = true; status.textContent = 'ランキングに記録を送信しています…';
      R.submit(attempt).then(function (result) {
        status.textContent = result.updated ? '自己ベストを登録しました！' : '今回の記録は自己ベストを上回らなかったため、これまでの記録を残しました。';
      }).catch(function (e) {
        status.textContent = e.retained ? '通信できませんでした。記録はこの端末に保存しました。「記録を再送する」で登録できます。' : '通信できませんでした。この結果画面から「記録を再送する」を押してください。';
        retry.hidden = false;
      }).finally(function () { busy = false; });
    }
    modal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rank-act]'); if (!b) return; var act = b.dataset.rankAct;
      if (act === 'retry') { submit(); return; }
      closeModal(true); endMatch();
      if (act === 'again') startRanking(); else if (act === 'board') { renderRankingSetup(); screen('scrRanking'); } else screen('scrTitle');
    });
    submit();
  }
  var rankingView = 0;
  function renderRankingSetup() {
    $('rankName').value = S.rankName || S.name || ''; $('rankNameError').hidden = true;
    $('rankCall').checked = !!S.rankCall;
    refreshRanking();
  }
  function refreshRanking() {
    var view = ++rankingView, mode = S.rankCall ? 'call' : 'basic', name = R.cleanName($('rankName').value);
    $('rankBoardTitle').textContent = (S.rankCall ? '本は呼ぶ' : '基本ルール') + 'のランキング';
    $('rankBoardStatus').textContent = 'ランキングを読み込んでいます…'; $('rankBoard').innerHTML = ''; $('rankSelf').textContent = '';
    $('rankRetryPending').hidden = !R.pending().length;
    R.list(mode, name).then(function (data) {
      if (view !== rankingView) return;
      $('rankBoardStatus').textContent = data.total ? data.total + '人が登録（上位100人を表示）' : 'まだ記録がありません。最初の60枚に挑戦しましょう。';
      if (data.entries.length) $('rankBoard').innerHTML = '<table class="rank-table"><thead><tr><th scope="col">順位</th><th scope="col">名前</th><th scope="col">評価タイム</th><th scope="col">正答率</th></tr></thead><tbody>' + data.entries.map(function (r) {
        return '<tr' + (r.name === name ? ' class="is-me"' : '') + '><td>' + r.rank + '</td><th scope="row">' + esc(r.name) + '</th><td><b>' + rankTime(r.scoreMs) + '</b>' + ('<small>回答 ' + rankTime(r.totalMs) + '<br>ミス＋' + ((60-r.correct)*6) + '秒</small>') + '</td><td>' + accuracy(r.correct) + '<small>' + r.correct + ' / 60枚</small></td></tr>';
      }).join('') + '</tbody></table>';
      if (data.self) $('rankSelf').textContent = 'あなたの自己ベスト：' + data.self.rank + '位 ／ ' + ('評価 ' + rankTime(data.self.scoreMs)) + ' ／ ' + accuracy(data.self.correct);
    }).catch(function () { if (view === rankingView) $('rankBoardStatus').textContent = 'ランキングに接続できませんでした。「更新」で再度読み込めます。'; });
  }

  /* ================================================================ 苦手を復習 */
  function rememberAnswer(card, call, ok) {
    T.record(TR, card, call, ok); save(TKEY, TR);
  }
  function renderTrainingSetup() {
    var unlimited = S.trainCount === 'unlimited';
    $('trainGoalField').hidden = !unlimited;
    $('trainUnlimitedNote').hidden = !unlimited;
    $('trainAdaptiveNote').hidden = unlimited;
    $('trainGoalError').hidden = true;
    $('trainGoal').value = String(S.trainGoal || 1);
    var ids = T.weak(TR, !!S.trainCall), mode = S.trainCall ? TR.call : TR.base;
    $('trainSummary').textContent = ids.length ? 'いま復習したいカード：' + ids.length + '枚。苦手な問題を多めに出します。' : '苦手カードはまだありません。まずは全60枚から出題します。';
    $('trainWeak').innerHTML = ids.slice(0, 6).map(function (id) {
      return '<figure>' + A.cardFace(D.CARDS[id], { label: cardLabel(id) }) + '<figcaption><b>No.' + (id + 1) + '</b><span class="k">まちがい ' + mode[id].miss + '回</span></figcaption></figure>';
    }).join('');
    $('trainWeak').hidden = unlimited || !ids.length;
    if (unlimited) $('trainSummary').textContent = '全60枚 → 苦手だけを絞り込み復習 → 全60枚を再テスト。全問を目標以内で正解すればクリアです。';
  }
  function startTraining() {
    var unlimited = S.trainCount === 'unlimited';
    if (unlimited && !S.trainUnlimitedIntroSeen) {
      var intro = openModal('<h3>無制限モード：最高難易度</h3>' +
        '<p>全60枚を、1枚あたり<b>' + trainingGoal({ targetMs: Math.round((+S.trainGoal || 1) * 1000) }) + '以内</b>で正解するチャレンジです。</p>' +
        '<ol><li>まずは全60枚に挑戦します。</li><li>まちがえたカード・目標タイムを超えたカードだけを復習します。</li><li>復習でも不合格だったカードに絞り、すべて合格するまで繰り返します。</li><li>全60枚を最初から再テスト。1巡ですべて目標以内に正解できたらクリアです。</li></ol>' +
        '<p>カードの出題順は毎回ランダムです。コマの並びはモード開始時にランダムになり、同じモードで遊んでいる間は変わりません。回答後は自動で次へ進みます。</p>' +
        '<p class="note">この説明は初回のみ表示します。ルールは設定画面でも確認できます。</p>' +
        '<div class="stack"><button class="btn primary" type="button" data-train-intro="start" data-focus>ルールを確認してはじめる</button><button class="btn ghost" type="button" data-train-intro="cancel">設定にもどる</button></div>', { closable: false });
      intro.addEventListener('click', function (e) {
        var b = e.target.closest('[data-train-intro]'); if (!b) return;
        closeModal(true);
        if (b.dataset.trainIntro === 'start') { S.trainUnlimitedIntroSeen = true; persist(); startTraining(); }
      });
      return;
    }
    var seats = [{ name: S.name || 'あなた', kind: 'human' }];
    var g = E.newGame({ seats: seats, deckSize: 60, callMode: !!S.trainCall });
    var count = [10, 20, 40].indexOf(+S.trainCount) >= 0 ? +S.trainCount : 20;
    g.deck = []; g.deckSize = unlimited ? 60 : count;
    M = localMatch('training', g, seats);
    M.train = { count: count, results: [], history: [], resumeCard: null, unlimited: unlimited ? T.newUnlimited(Math.round((+S.trainGoal || 1) * 1000)) : null };
    enterTable({ call: g.callMode, left: unlimited ? 60 : count, clock: true });
    $('seats').hidden = true;
    $('clock').textContent = '1 / ' + count;
    $('roomChip').hidden = true;
    M.onEnd = function () { $('seats').hidden = false; };
    nextTraining(600);
  }
  function nextTraining(delay) {
    if (!M || M.mode !== 'training') return;
    stopTimers(); M.skip = null;
    var u = M.train.unlimited;
    if (u && u.index >= u.queue.length) {
      var step = T.advanceUnlimited(u);
      if (step.kind === 'clear') finishUnlimited(); else unlimitedTransition(step);
      return;
    }
    if (!u && M.train.results.length >= M.train.count) { finishTraining(); return; }
    M.round = null; M.faces().forEach(setBack);
    clearMarks($('table')); clearSeatMarks(); lockTable(true); $('tapNext').hidden = true;
    $('clock').textContent = u ? (u.index + 1) + ' / ' + u.queue.length : (M.train.results.length + 1) + ' / ' + M.train.count;
    setLeft(trainingRemaining());
    banner('<div class="hint">' + (u ? trainingPhase(u) + '／目標 ' + trainingGoal(u) + '以内' : '時間制限はありません。形と色をゆっくり確認して答えてください。') + '</div>');
    later(revealTraining, delay == null ? 350 : delay);
  }
  function revealTraining() {
    if (!M || M.paused || M.mode !== 'training') return;
    var p = M.train;
    var id = p.resumeCard == null ? (p.unlimited ? T.currentUnlimited(p.unlimited) : T.pick(TR, M.g.callMode, p.history)) : p.resumeCard;
    p.resumeCard = null;
    M.g.n = p.unlimited ? p.unlimited.answers + 1 : p.results.length + 1;
    M.g.round = { n: M.g.n, card: id, tries: {}, done: false };
    M.round = { n: M.g.n, card: id, faceAt: now() + faceDelay(), done: false, mine: {} };
    M.faces().forEach(function (f) { flipTo(f, id); }); M.round.faceAt = now() + faceDelay(); Snd.flip(); lockTable(false);
    if (!p.unlimited && T.weak(TR, M.g.callMode).indexOf(id) >= 0) banner('<div class="hint">苦手カードの復習です。あせらず考えてみましょう。</div>');
  }
  function trainingReason(card, q) {
    var solved = D.solve(card), text;
    if (solved.match) text = D.COLOR_ADJ[D.TRUE_COLOR[q.item]] + D.NAME[q.item] + 'が元の色で描かれているので、' + D.NAME[q.item] + 'が正解です。';
    else text = '形で消す：' + D.NAME[card.a] + '・' + D.NAME[card.b] + '。色で消す：' + D.NAME[D.OWNER[card.ca]] + '・' + D.NAME[D.OWNER[card.cb]] + '。残るのは' + D.NAME[q.item] + 'です。';
    if (M.g.callMode) text += q.type === 'call' ? ' 本が描かれているので、名前ボタンで答えます。' : ' 本がないので、コマをタッチします。';
    return text;
  }
  function trainingTouch(type, item, rt) {
    var r = M.round, p = M.train, q = E.need(M.g, r.card), ok = type === q.type && item === q.item;
    var elapsed = Math.max(1, rt), u = p.unlimited, outcome = u ? T.answerUnlimited(u, r.card, ok, elapsed) : null;
    if (u && !outcome) return;
    var passed = u ? outcome.passed : ok;
    r.done = true; r.mine[0] = true; M.g.round.done = true;
    if (!u) { p.results.push({ card: r.card, ok: ok, rt: Math.round(elapsed) }); p.history.push(r.card); }
    rememberAnswer(r.card, M.g.callMode, ok);
    lockTable(true); showAnswer($('table'), q.type, q.item);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    if (passed) Snd.ok(); else if (ok) Snd.other(); else { Snd.bad(); buzz(40); $('cardWrap').classList.add('shake'); }
    var heading = !ok ? 'まちがい・正解は' : passed ? (u ? '合格！' : '正解！') : '正解・タイム超過';
    banner('<div class="big' + (passed ? '' : ' bad') + '">' + heading + A.icon(q.item) + esc(D.NAME[q.item]) + (q.type === 'call' ? '（名前で答える）' : '') + '</div>' +
      (u ? '<div class="training-time">' + (Math.ceil(elapsed) / 1000).toFixed(3) + '秒 / 目標 ' + trainingGoal(u) + '以内' + (passed ? '' : '（復習対象）') + '</div>' : '') +
      '<div class="sub">' + esc(trainingReason(D.CARDS[r.card], q)) + '</div>');
    $('tapNext').hidden = false;
    M.skip = function () { if (M && M.mode === 'training' && M.round && M.round.done) { M.skip = null; nextTraining(350); } };
    later(function () { nextTraining(rand(450, 850)); }, passed ? 1650 : 2100);
  }
  function trainingRemaining() {
    var p = M.train;
    return p.unlimited ? p.unlimited.queue.length - p.unlimited.index : p.count - p.results.length;
  }
  function trainingPhase(u) { return u.phase === 'all' ? '全60枚テスト・' + u.cycle + '巡目' : '苦手だけ復習・' + u.reviewPass + '回目'; }
  function trainingGoal(u) { return (u.targetMs / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '秒'; }
  function unlimitedTransition(step) {
    var u = M.train.unlimited, title, note;
    if (step.kind === 'all') {
      title = '苦手を克服！ 全60枚で再テスト';
      note = '復習したカードがすべて目標以内になりました。もう一度、全60枚をシャッフルして挑戦します。全問を目標以内で正解したらクリアです。';
    } else {
      title = step.previous === 'all' ? '苦手な' + step.size + '枚だけを復習' : '復習を' + step.previousSize + '枚 → ' + step.size + '枚に絞り込み';
      note = 'まちがえたカードと、正解でも' + trainingGoal(u) + 'を超えたカードだけをやり直します。合格したカードは、この復習から外れます。';
    }
    M.round = null; M.g.round = null;
    M.faces().forEach(setBack); clearMarks($('table')); lockTable(true); $('tapNext').hidden = true;
    setLeft(trainingRemaining());
    $('clock').textContent = '1 / ' + u.queue.length;
    banner('<div class="big">' + title + '</div><div class="sub">' + note + '</div>');
    later(function () { nextTraining(600); }, 2100);
  }
  function finishUnlimited() {
    stopTimers(); M.g.over = true; M.skip = null; Snd.end();
    var u = M.train.unlimited;
    var h = '<h3 class="result-title">無制限トレーニング クリア！</h3><p>全60枚すべてを、1枚あたり<b>' + trainingGoal(u) + '以内</b>で正解できました。</p>' +
      '<div class="stats"><div><span>最後の全60枚</span><b>60 / 60 合格</b></div><div><span>回答した枚数</span><b>' + u.answers + '枚</b></div><div><span>全60枚テスト</span><b>' + u.cycle + '回</b></div><div><span>途中の誤答 / 時間超過</span><b>' + u.wrong + ' / ' + u.slow + '回</b></div></div>' +
      '<div class="stack"><button class="btn primary" type="button" data-unlimited="again" data-focus>同じ目標でもう一度</button><button class="btn" type="button" data-unlimited="setup">目標・設定を変える</button><button class="btn ghost" type="button" data-unlimited="title">タイトルへ</button></div>';
    var modal = openModal(h, { closable: false });
    modal.addEventListener('click', function (e) {
      var b = e.target.closest('[data-unlimited]'); if (!b) return; var act = b.dataset.unlimited;
      closeModal(true); endMatch();
      if (act === 'again') startTraining(); else if (act === 'setup') { renderTrainingSetup(); screen('scrTraining'); } else screen('scrTitle');
    });
  }
  function finishTraining() {
    stopTimers(); M.g.over = true; M.skip = null;
    var res = M.train.results, right = res.filter(function (x) { return x.ok; }).length;
    var weak = T.weak(TR, M.g.callMode), wrong = res.filter(function (x) { return !x.ok; }).map(function (x) { return x.card; }).filter(function (id, i, all) { return all.indexOf(id) === i; });
    var h = '<h3 class="result-title">トレーニング完了</h3><div class="stats"><div><span>正解</span><b>' + right + ' / ' + res.length + '</b></div><div><span>復習したいカード</span><b>' + weak.length + '枚</b></div></div>' +
      '<p class="note">まちがえたカードを覚えました。正解を重ねると、復習の優先度が下がります。次回もこのブラウザで続きを練習できます。</p>';
    if (wrong.length) h += '<h4>今回まちがえたカード</h4><div class="gal-grid">' + wrong.slice(0, 12).map(function (id) { return '<figure>' + A.cardFace(D.CARDS[id], { label: cardLabel(id) }) + '<figcaption><b>No.' + (id + 1) + '</b><span class="k">正解：' + D.NAME[D.solve(D.CARDS[id]).answer] + '</span></figcaption></figure>'; }).join('') + '</div>';
    h += '<div class="stack"><button class="btn primary" type="button" data-act="again" data-focus>もう一度トレーニング</button><button class="btn" type="button" data-act="setup">苦手カード・設定を見る</button><button class="btn ghost" type="button" data-act="title">タイトルへ</button></div>';
    var m = openModal(h, { closable: false });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return; var act = b.dataset.act;
      closeModal(true); endMatch();
      if (act === 'again') startTraining(); else if (act === 'setup') { renderTrainingSetup(); screen('scrTraining'); } else screen('scrTitle');
    });
  }

  /* ================================================================ 反射ドリル
     drill.js picks the cards and keeps the records; this part shows them. One answer is one card: right and
     within the line is a pass (short beep, next card soon), right but slow is shown with the line, and a wrong
     answer shows the right one and waits until it is touched (覚え直し). */
  var BAND = { 'new': '未計測', miss: '要復習', slow: '計算中', strong: 'つよい級', max: '最強級', reflex: '反射級' };
  var BAND_ORDER = ['reflex', 'max', 'strong', 'slow', 'miss', 'new'];
  var DRILL_LENS = [60, 120, 240], paintDrillLen = null, drillRaf = 0, drillBarState = null;
  function saveDrill() { save(DKEY, DRD); }
  function drillLen() { return DRILL_LENS.indexOf(+S.drillLen) >= 0 ? +S.drillLen : 120; }
  /* the CPU game this player usually sets up (つよい or 最強; つよい otherwise) */
  function drillVs() { return { lv: S.level === 4 ? 4 : 3, n: Math.max(1, Math.min(7, +S.cpu || 1)) }; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function signedSec(ms) { return (ms < 0 ? '−' : '＋') + (Math.abs(ms) / 1000).toFixed(1) + '秒'; }
  function bandList(now, before) {
    return BAND_ORDER.filter(function (b) { return b !== 'new' || now[b]; }).map(function (b) {
      var d = before ? now[b] - before[b] : 0;
      return '<li class="st-' + b + '"><i></i>' + BAND[b] + '<b>' + now[b] + '</b>' + (d ? '<small>' + (d > 0 ? '+' : '−') + Math.abs(d) + '</small>' : '') + '</li>';
    }).join('');
  }
  function sparkline(vals) {
    var w = 118, h = 40, pad = 6, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1000) { var mid = (hi + lo) / 2; lo = mid - 500; hi = mid + 500; }
    var x = function (i) { return pad + i * (w - pad * 2) / (vals.length - 1); };
    var y = function (v) { return h - pad - (v - lo) * (h - pad * 2) / (hi - lo); };
    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var lx = x(vals.length - 1).toFixed(1), ly = y(vals[vals.length - 1]).toFixed(1);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="予想タイムの推移（直近' + vals.length + '回、' + clockText(vals[0]) + 'から' + clockText(vals[vals.length - 1]) + '）">' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--spark)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + lx + '" cy="' + ly + '" r="4" fill="var(--spark-now)" stroke="var(--panel-2)" stroke-width="2"/></svg>';
  }
  function drillCell(id, call) {
    var st = DR.status(DRD, call, id), t = DR.estimate(DR.rule(DRD, call).cards[id]);
    var label = st === 'new' ? '未' : st === 'miss' ? '✕復習' : t !== null ? (t / 1000).toFixed(2) : '—';
    return '<button type="button" class="dcell st-' + st + '" data-card="' + id + '" aria-label="No.' + (id + 1) + '：' + BAND[st] + (t !== null ? '・' + sec(t) : '') + '">' +
      A.cardFace(D.CARDS[id]) + '<span class="t">' + label + '</span></button>';
  }
  function renderDrillSetup() {
    var call = !!S.drillCall, rs = DR.rule(DRD, call), pred = DR.predict(DRD, call), ss = rs.sessions;
    $('drillCall').checked = call;
    if (paintDrillLen) paintDrillLen(drillLen());
    var vs = drillVs(), lv = E.LEVELS[vs.lv], take = DR.takeRate(DRD, call, lv, vs.n);
    // the cards without a time are filled in from the others, so wait for a fair sample before showing numbers
    var enough = pred.known >= DR.MIN_KNOWN, first = null;
    for (var j = 0; j < ss.length && first === null; j++) first = ss[j].from || ss[j].pred || null;   // the earliest measured prediction
    var delta = enough && first ? pred.total - first : null;
    var trend = ss.map(function (x) { return x.pred; }).filter(function (v) { return v; }).slice(-12);
    var sub = delta !== null && Math.abs(delta) >= 50 ? '<small class="' + (delta < 0 ? 'good' : 'bad') + '">' + signedSec(delta) + '（ドリルの最初の記録から）</small>'
      : '<small>' + (pred.known ? '記録のあるカード ' + pred.known + ' / 60枚' + (enough ? '' : '（' + DR.MIN_KNOWN + '枚から表示）') : 'まだ記録がありません') + '</small>';
    $('drillKpi').innerHTML = '<div class="drill-main"><span>60枚の予想タイム（ミスなし）</span><b>' + (enough ? clockText(pred.total) : '—') + '</b>' + sub +
      (trend.length >= 2 ? sparkline(trend) : '') + '</div>' +
      '<div><span>' + lv.name + 'CPU×' + vs.n + 'より先に正解</span><b>' + (enough ? pct(take) : '—') + '</b><small>1枚あたりの目安（CPU対戦の設定より）</small></div>' +
      '<div><span>ドリルの回答</span><b>' + rs.trials.toLocaleString('ja-JP') + '回</b><small>記録 ' + ss.length + 'セッション</small></div>';
    $('drillLegend').innerHTML = bandList(DR.counts(DRD, call));
    var cells = '';
    for (var i = 0; i < D.CARDS.length; i++) cells += drillCell(i, call);
    $('drillMap').innerHTML = cells;
    $('drillHistory').hidden = !ss.length;
    $('drillHistoryBody').innerHTML = ss.length ? '<table class="drill-table"><thead><tr><th scope="col">日時</th><th scope="col">回答</th><th scope="col">合格</th><th scope="col">正解</th><th scope="col">予想タイム</th></tr></thead><tbody>' +
      ss.slice().reverse().map(function (x) {
        var d = new Date(x.at), when = x.at ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') : '—';
        return '<tr><td>' + when + '</td><td>' + x.n + '</td><td>' + pct(x.pass / x.n) + '</td><td>' + pct(x.ok / x.n) + '</td><td>' + (x.pred ? clockText(x.pred) : '—') + '</td></tr>';
      }).join('') + '</tbody></table>' : '';
    $('drillReset').disabled = !rs.trials && !Object.keys(rs.cards).length;
  }
  function openDrillCard(id) {
    var call = !!S.drillCall, c = D.CARDS[id], q = D.required(c, call), e = DR.rule(DRD, call).cards[id], st = DR.status(DRD, call, id);
    var t = DR.estimate(e), k = DR.kind(id, call), lim = function (b) { return sec(DR.bandLimit(b, k)); };
    var h = '<h3>No.' + (id + 1) + '　' + BAND[st] + '</h3>' +
      '<div class="ex">' + A.cardFace(c, { label: cardLabel(id) }) + '<div><p>' + esc(D.describe(c)) + '。' + esc(D.explain(c)) + '。</p><div class="ans">→ ' + A.icon(q.item) +
      (q.type === 'call' ? '「' + D.NAME[q.item] + '」と呼ぶ' : D.NAME[q.item] + 'をタッチ') + '</div></div></div>' +
      '<div class="stats"><div><span>いまのタイム</span><b>' + (t !== null ? sec(t) : '—') + '</b><small>直近3回の正解の中央値</small></div>' +
      '<div><span>回答</span><b>' + (e ? e.n : 0) + '回</b><small>正解 ' + (e ? e.ok : 0) + '回</small></div>' +
      '<div><span>最速</span><b>' + (e && e.best ? sec(e.best) : '—') + '</b></div></div>' +
      '<p class="note">このカード（' + DR.KIND_NAME[k] + '）の段階：つよい級 ' + lim('strong') + '以内・最強級 ' + lim('max') + '以内・反射級 ' + lim('reflex') + '以内。まちがえた後は、2回続けて正解するまで要復習です。</p>';
    openModal(h);
  }
  function confirmDrillReset() {
    var call = !!S.drillCall;
    var m = openModal('<h3>ドリルの記録をリセット</h3><p>' + (call ? '上級ルール「本は呼ぶ」' : '基本ルール') + 'の反射ドリルの記録（カードごとのタイム・ライン・セッションの記録）を消します。元には戻せません。</p>' +
      '<div class="row"><button class="btn ghost" type="button" data-close data-focus>やめる</button><button class="btn primary" type="button" data-reset>リセットする</button></div>');
    m.querySelector('[data-reset]').addEventListener('click', function () { DR.reset(DRD, call); saveDrill(); closeModal(true); renderDrillSetup(); toast('ドリルの記録をリセットしました'); });
  }

  function startDrill() {
    if (!S.drillIntroSeen) {
      var intro = openModal('<h3>反射ドリルのやり方</h3><ol class="steps">' +
        '<li>カードがめくられたら、いつもどおり正解のコマをタッチ' + (S.drillCall ? '（本が描かれていたら名前ボタン）' : '') + '。</li>' +
        '<li>カードの下のバーが<b>ライン</b>（目標タイム）です。バーが満ちる前に正解すれば<b>合格</b>。</li>' +
        '<li>ラインは成績に合わせて自動で短く・長くなり、5回に4回くらい合格できる難しさに保たれます。</li>' +
        '<li>まちがえたら、<b>正解のコマをタッチして覚え直し</b>てから次へ進みます。</li>' +
        '<li>カードごとの速さは習熟マップに残ります。1日10分ほどを毎日続けるのがおすすめです。</li></ol>' +
        '<div class="stack"><button class="btn primary" type="button" data-drill-intro="start" data-focus>はじめる</button><button class="btn ghost" type="button" data-drill-intro="back">設定にもどる</button></div>', { closable: false });
      intro.addEventListener('click', function (e) {
        var b = e.target.closest('[data-drill-intro]'); if (!b) return;
        closeModal(true);
        if (b.dataset.drillIntro === 'start') { S.drillIntroSeen = true; persist(); startDrill(); }
      });
      return;
    }
    var call = !!S.drillCall, seats = [{ name: S.name || 'あなた', kind: 'human' }];
    var g = E.newGame({ seats: seats, deckSize: 60, callMode: call });
    g.deck = [];
    M = localMatch('drill', g, seats);
    M.drill = { s: DR.begin(DRD, call, drillLen()), fix: null, streak: 0 };
    enterTable({ call: call, left: M.drill.s.total, clock: true });
    $('seats').hidden = true; $('app').classList.add('drilling'); $('drillBar').hidden = false;
    M.onEnd = function () { drillBarStop(); $('seats').hidden = false; $('app').classList.remove('drilling'); $('drillBar').hidden = true; };
    nextDrill(700);
  }
  function drillLines(s) {
    var t = function (k) { return (s.lines[k] / 1000).toFixed(2) + '秒'; };
    return 'ライン　ホンモノの色 ' + t('m') + '・どこにもいない ' + t('n') + (s.call ? '<br>名前で答えるカード ' + t('mc') + '・' + t('nc') : '');
  }
  function nextDrill(delay) {
    if (!M || M.mode !== 'drill') return;
    stopTimers(); drillBarStop(); M.skip = null; M.drill.fix = null;
    var s = M.drill.s;
    if (s.done >= s.total) { finishDrill(); return; }
    M.round = null; M.g.round = null; M.faces().forEach(setBack);
    clearMarks($('table')); lockTable(true); $('tapNext').hidden = true;
    $('clock').textContent = (s.done + 1) + ' / ' + s.total;
    setLeft(s.total - s.done);
    drillBar(0, '');
    banner('<div class="hint">' + drillLines(s) + '</div>');
    later(revealDrill, delay == null ? rand(300, 600) : delay);
  }
  function revealDrill() {
    if (!M || M.paused || M.mode !== 'drill') return;
    var s = M.drill.s, id = DR.next(s, DRD);
    if (id === null) { finishDrill(); return; }
    M.g.n = s.done + 1;
    M.g.round = { n: M.g.n, card: id, tries: {}, done: false };
    M.round = { n: M.g.n, card: id, faceAt: now() + faceDelay(), done: false, mine: {} };
    M.faces().forEach(function (f) { flipTo(f, id); });
    M.round.faceAt = now() + faceDelay();
    Snd.flip(); lockTable(false);
    drillBarRun(s.lines[DR.kind(id, s.call)]);
  }
  /* the time line under the card: it fills up until the line is reached */
  function drillBar(p, state) {
    if (state !== drillBarState) { $('drillBar').className = 'drillbar' + (state ? ' ' + state : ''); drillBarState = state; }
    $('drillBarFill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)).toFixed(4) + ')';
  }
  function drillBarRun(line) {
    drillBarStop();
    var round = M.round;
    (function step() {
      if (!M || M.round !== round || round.done) return;
      var t = now() - round.faceAt;
      drillBar(t / line, t > line ? 'over' : '');
      drillRaf = requestAnimationFrame(step);
    })();
  }
  function drillBarStop() { if (drillRaf) cancelAnimationFrame(drillRaf); drillRaf = 0; }
  function drillTouch(type, item, rt) {
    var r = M.round, P = M.drill, q = E.need(M.g, r.card), ok = type === q.type && item === q.item;
    var res = DR.answer(P.s, DRD, r.card, ok, Math.max(1, Math.round(rt)));
    if (!res) return;
    drillBarStop();
    r.done = true; r.mine[0] = true; M.g.round.done = true;
    rememberAnswer(r.card, M.g.callMode, ok); saveDrill();
    drillBar(res.rt === null ? 1 : res.rt / res.line, res.pass ? 'pass' : 'fail');
    lockTable(true);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    var head = A.icon(q.item) + esc(D.NAME[q.item]) + (q.type === 'call' ? '（呼ぶ）' : '');
    if (ok) {
      P.streak = res.pass ? P.streak + 1 : 0;
      if (res.pass) Snd.ok(); else Snd.other();
      banner('<div class="big">' + head + '<span class="drill-rt">' + sec(res.rt) + '</span></div>' +
        '<div class="hint' + (res.pass ? '' : ' warn') + '">' + (res.pass ? '合格' + (P.streak >= 3 ? '・' + P.streak + '連続' : '') : 'ラインをこえた') + '（ライン ' + sec(res.line) + '）</div>' +
        (res.up ? '<div class="hint">★ No.' + (r.card + 1) + 'が' + BAND[res.after] + 'になりました</div>' : ''));
      M.skip = function () { if (M && M.mode === 'drill' && M.round === r) { M.skip = null; nextDrill(250); } };
      later(function () { nextDrill(); }, res.pass ? (res.up ? 900 : 420) : 800);
      return;
    }
    P.streak = 0;
    Snd.bad(); buzz(40); $('cardWrap').classList.add('shake');
    showAnswer($('table'), q.type, q.item);
    P.fix = { type: q.type, item: q.item };
    banner('<div class="big bad">まちがい・正解は' + head + '</div><div class="hint">正解の' + (q.type === 'call' ? '名前ボタン' : 'コマ') + 'をタッチして次へ（覚え直し）</div>' +
      '<div class="sub">' + esc(trainingReason(D.CARDS[r.card], q)) + '</div>');
    lockTable(false);
    M.skip = null;   // only the right piece moves on (a stray tap on the card must not skip the 覚え直し)
  }
  /* after a mistake: only the right piece (or name) moves on */
  function drillFix(type, item) {
    var P = M.drill, f = P.fix;
    if (type !== f.type || item !== f.item) {
      Snd.bad(); var w = $('cardWrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
      return;
    }
    P.fix = null; M.skip = null; Snd.ok(); lockTable(true);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    later(function () { nextDrill(250); }, 250);
  }
  function finishDrill() {
    stopTimers(); drillBarStop(); M.skip = null; M.g.over = true; M.drill.fix = null; Snd.end();
    var call = M.drill.s.call, sum = DR.finish(M.drill.s, DRD, Date.now()); saveDrill();
    var vs = drillVs(), lv = E.LEVELS[vs.lv], take = DR.takeRate(DRD, call, lv, vs.n), d = sum.pred - sum.startPred;
    var enough = sum.known >= DR.MIN_KNOWN, delta = enough && sum.startKnown >= DR.MIN_KNOWN && Math.abs(d) >= 50;
    var lineTile = function (k) { return '<div><span>ライン：' + DR.KIND_NAME[k] + '</span><b>' + sec(sum.lines[k]) + '</b><small>開始時 ' + sec(sum.startLines[k]) + '</small></div>'; };
    var focus = sum.misses.concat(sum.slow).slice(0, 6);
    var h = '<h3 class="result-title">ドリル完了！</h3>' +
      '<div class="stats"><div><span>合格（正解・ライン内）</span><b>' + sum.pass + ' / ' + sum.n + '</b><small>正解 ' + sum.ok + ' / ' + sum.n + '</small></div>' +
      '<div><span>60枚の予想タイム</span><b>' + (enough ? clockText(sum.pred) : '—') + '</b><small' +
      (delta ? ' class="' + (d < 0 ? 'good' : 'bad') + '">今回 ' + signedSec(d) : '>' + (enough ? 'ミスなしの目安' : '記録のあるカード ' + sum.known + ' / 60枚')) + '</small></div>' +
      DR.kindsFor(call).map(lineTile).join('') + '</div>' +
      (enough ? '<p class="sumline">' + lv.name + 'CPU×' + vs.n + 'より先に正解できる目安：<b>' + pct(take) + '</b>（1枚あたり）</p>' : '') +
      '<ul class="dlegend">' + bandList(sum.counts, sum.startCounts) + '</ul>';
    if (focus.length) h += '<h4>次に効くカード</h4><div class="gal-grid drill-focus">' + focus.map(function (id) {
      var q = D.required(D.CARDS[id], call);
      return '<figure>' + A.cardFace(D.CARDS[id], { label: cardLabel(id) }) + '<figcaption><span class="no">No.' + (id + 1) + '</span>' + A.icon(q.item) + '<b>' + D.NAME[q.item] + '</b><span class="k">' + (sum.misses.indexOf(id) >= 0 ? 'まちがえた' : 'ラインをこえた') + '</span></figcaption></figure>';
    }).join('') + '</div>';
    h += '<div class="stack"><button class="btn primary" type="button" data-drill="again" data-focus>もう一度（' + sum.n + '回）</button>' +
      '<div class="row"><button class="btn" type="button" data-drill="setup">習熟マップ</button><button class="btn" type="button" data-drill="rank">ランキングへ</button></div>' +
      '<button class="btn ghost" type="button" data-drill="title">タイトルへ</button></div>' +
      '<p class="note">短いセッションを毎日のように続けるのが効率的です（間隔をあけた練習のほうが定着します）。</p>';
    var m = openModal(h, { closable: false });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-drill]'); if (!b) return;
      var act = b.dataset.drill;
      closeModal(true); endMatch();
      if (act === 'again') startDrill();
      else if (act === 'setup') { renderDrillSetup(); screen('scrDrill'); }
      else if (act === 'rank') { renderRankingSetup(); screen('scrRanking'); }
      else screen('scrTitle');
    });
  }

  /* ---------------------------------------------------------------- pause / menu (local modes) */
  function voidRound() {
    var g = M && M.g;
    if (g && g.round && !g.round.done) { g.deck.unshift(g.round.card); g.n -= 1; g.round = null; }
    if (M) M.round = null;
  }
  function pauseLocal() {
    if (!M || M.paused || !M.g) return false;
    M.paused = true;
    stopTimers();
    if (M.mode === 'training') {
      if (M.round && !M.round.done) M.train.resumeCard = M.round.card;
      M.round = null; M.g.round = null;
    } else if (M.mode === 'drill') {
      // an unanswered card stays drill.js's current card and is shown again; a pending 覚え直し is dropped
      drillBarStop(); M.drill.fix = null; M.skip = null;
      M.round = null; M.g.round = null;
    } else {
      // If no question has become visible yet, a pause need not start its clock.
      if (M.mode === 'ranking' && M.rank.cardStartedAt != null && now() < M.rank.cardStartedAt) M.rank.cardStartedAt = null;
      voidRound();
    } // interrupted questions are shown again, without recording an answer
    M.faces().forEach(setBack);
    if (M.mode !== 'duo') { clearMarks($('table')); banner(''); $('tapNext').hidden = true; } else duoClear();
    lockAll(true);
    if (M.g) setLeft(M.mode === 'training' ? trainingRemaining() : M.mode === 'drill' ? M.drill.s.total - M.drill.s.done : M.g.deck.length);
    if (M.mode === 'drill') drillBar(0, '');
    return true;
  }
  function resumeLocal() {
    if (!M || !M.paused) return;
    M.paused = false;
    nextRound(800);
  }
  function openMenu() {
    if (!M) return;
    var online = M.mode === 'host' || M.mode === 'guest';
    if (!online) pauseLocal();
    var h = '<h3>メニュー</h3><div class="stack">' +
      (online ? '<button class="btn primary" type="button" data-act="resume" data-focus>ゲームにもどる</button>' : '<button class="btn primary" type="button" data-act="resume" data-focus>つづける</button>') +
      '<button class="btn" type="button" data-act="rules">あそびかた</button>' +
      '<button class="btn" type="button" data-act="layout">カード・コマの配置</button>' +
      (online ? '' : '<button class="btn" type="button" data-act="restart">はじめからやり直す</button>') +
      '<button class="btn ghost" type="button" data-act="quit">' + (online ? '部屋を出る' : 'やめてタイトルへ') + '</button></div>' +
      (online ? '<p class="note">オンライン対戦は止まりません。メニューを開いているあいだもカードはめくられます。</p>' : '');
    var m = openModal(h, { onClose: function () { if (!online) resumeLocal(); } });
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act;
      if (act === 'resume') closeModal();
      else if (act === 'rules') { openRules(function () { if (!online) resumeLocal(); }); }
      else if (act === 'layout') { L.open(function () { if (!online) resumeLocal(); }); }
      else if (act === 'restart') { var mode = M.mode; closeModal(true); endMatch(); if (mode === 'cpu') startCpu(); else if (mode === 'duo') startDuo(); else if (mode === 'training') startTraining(); else if (mode === 'drill') startDrill(); else startRanking(); }
      else if (act === 'quit') { closeModal(true); if (online) leaveOnline(); else { endMatch(); screen('scrTitle'); } }
    });
  }

  /* ================================================================ online */
  var GRACE = 400, ROUND_LIMIT = 25000, RESULT_MS = 1700;
  var NET = null;   // { role: 'host'|'guest', link, code, ... }

  function onlineErr(msg) { var e = $('onErr'); e.textContent = msg; e.hidden = !msg; }
  function lobbyErr(msg) { var e = $('lobErr'); e.textContent = msg || ''; e.hidden = !msg; }
  function cleanName(v, fallback) { return N.cleanName(v) || fallback; }

  /* ---------------------------------------------------------------- host */
  function hostCreate() {
    onlineErr('');
    var name = cleanName($('onName').value, 'ホスト');
    S.name = name; persist();
    $('onCreate').disabled = true;
    var tries = 0;
    (function attempt() {
      var code = N.makeCode(), link = N.makeHost(NETKIND);
      link.host(code).then(function () {
        $('onCreate').disabled = false;
        NET = { role: 'host', link: link, code: code, phase: 'lobby', set: { call: !!S.call, deck: S.deck || 60 },
          seats: [{ cid: 'host', name: name, kind: 'host', on: true }] };
        link.on('msg', hostMsg);
        link.on('leave', hostLeave);
        showLobby();
      }, function (e) {
        if (e && e.code === 'taken' && tries++ < 3) { attempt(); return; }
        $('onCreate').disabled = false;
        onlineErr(e && e.code === 'lib' ? '通信ライブラリを読み込めませんでした。電波のよい場所でもう一度お試しください。' : '部屋をつくれませんでした。少し待ってからもう一度お試しください。');
      });
    })();
  }
  function seatOf(cid) { for (var i = 0; i < NET.seats.length; i++) if (NET.seats[i].cid === cid) return i; return -1; }
  function lobbyMsg(you) {
    return { k: 'lobby', code: NET.code, set: NET.set, you: you == null ? 0 : you, seats: NET.seats.map(function (s) { return { name: s.name, kind: s.kind, level: s.level || 0, on: s.on !== false }; }) };
  }
  function hostBroadcastLobby() {
    NET.seats.forEach(function (s, i) { if (s.kind === 'guest') NET.link.send(s.cid, lobbyMsg(i)); });
    renderLobby(lobbyMsg(0));
  }
  function hostMsg(cid, m) {
    if (!NET || NET.role !== 'host') return;
    if (m.k === 'hello') {
      if (m.v !== N.PROTOCOL) { NET.link.send(cid, { k: 'deny', why: 'version' }); NET.link.drop(cid); return; }
      var i = seatOf(cid);
      if (NET.phase === 'lobby') {
        if (i < 0) {
          if (NET.seats.length >= 8) { NET.link.send(cid, { k: 'deny', why: 'full' }); NET.link.drop(cid); return; }
          NET.seats.push({ cid: cid, name: cleanName(m.name, 'ゲスト'), kind: 'guest', on: true });
          toast(cleanName(m.name, 'ゲスト') + 'が入りました');
        } else { NET.seats[i].on = true; NET.seats[i].name = cleanName(m.name, NET.seats[i].name); }
        NET.link.send(cid, { k: 'welcome', code: NET.code });
        hostBroadcastLobby();
      } else {
        if (i < 0) { NET.link.send(cid, { k: 'deny', why: 'playing' }); NET.link.drop(cid); return; }
        NET.seats[i].on = true;
        if (M && M.seats[i]) M.seats[i].on = true;
        NET.link.send(cid, hostSnapshot(i));
        hostSeatsChanged();
        toast(NET.seats[i].name + 'がもどりました');
      }
      return;
    }
    if (m.k === 'try') { var s = seatOf(cid); if (s >= 0) hostTry(s, m); return; }
    if (m.k === 'bye') { hostLeave(cid, true); }
  }
  function hostLeave(cid) {
    if (!NET || NET.role !== 'host') return;
    var i = seatOf(cid); if (i < 0) return;
    if (NET.phase === 'lobby') { var nm = NET.seats[i].name; NET.seats.splice(i, 1); toast(nm + 'が退出しました'); hostBroadcastLobby(); return; }
    if (NET.seats[i].on === false) return;
    NET.seats[i].on = false;
    if (M && M.seats[i]) M.seats[i].on = false;
    toast(NET.seats[i].name + 'の接続が切れました');
    hostSeatsChanged();
    // a round may now be complete without them
    if (M && M.g && M.round && !M.round.done && E.allTouched(M.g, activeSeats())) hostSettle();
  }
  function hostSeatsChanged() {
    if (!NET) return;
    NET.link.broadcast({ k: 'seats', on: NET.seats.map(function (s) { return s.on !== false; }) });
    if (M) { M.seats.forEach(function (s, i) { s.on = NET.seats[i] ? NET.seats[i].on !== false : s.on; }); seatChips(); }
  }
  function activeSeats() { return NET.seats.map(function (s, i) { return s.on === false ? -1 : i; }).filter(function (i) { return i >= 0; }); }
  function hostAddCpu() {
    if (NET.seats.length >= 8) { lobbyErr('8人までです'); return; }
    var used = NET.seats.filter(function (s) { return s.kind === 'cpu'; }).map(function (s) { return s.name; });
    var name = CPU_NAMES.filter(function (n) { return used.indexOf(n) < 0; })[0] || 'CPU';
    NET.seats.push({ cid: 'cpu-' + Math.random().toString(36).slice(2, 8), name: name, kind: 'cpu', level: S.lobLevel || 2, on: true, speed: 0.93 + Math.random() * 0.14 });
    lobbyErr('');
    hostBroadcastLobby();
  }
  function hostRemove(i) {
    var s = NET.seats[i]; if (!s || s.kind === 'host') return;
    NET.seats.splice(i, 1);
    if (s.kind === 'guest') { NET.link.send(s.cid, { k: 'kick' }); NET.link.drop(s.cid); }
    hostBroadcastLobby();
  }
  function hostStart() {
    if (NET.seats.length < 2) { lobbyErr('2人以上になったらスタートできます（CPUも入れられます）'); return; }
    lobbyErr('');
    NET.phase = 'play';
    var seats = NET.seats.map(function (s) { return { name: s.name, kind: s.kind, level: s.level || 0, speed: s.speed || 1, on: s.on !== false }; });
    var g = E.newGame({ seats: seats, deckSize: NET.set.deck, callMode: NET.set.call });
    M = { mode: 'host', g: g, seats: seats, me: 0, scores: seats.map(function () { return 0; }), timers: [], round: null, faces: tableFaces };
    M.touch = function (type, item) { hostLocalTouch(type, item); };
    M.onEnd = function () { };
    NET.seats.forEach(function (s, i) { if (s.kind === 'guest') NET.link.send(s.cid, { k: 'start', me: i, seats: seats.map(pubSeat), set: NET.set, left: g.deck.length }); });
    enterTable({ call: NET.set.call, left: g.deck.length, code: NET.code });
    hostNext(1300);
  }
  function pubSeat(s) { return { name: s.name, kind: s.kind, level: s.level || 0, on: s.on !== false }; }
  function hostNext(delay) {
    if (!M || M.mode !== 'host') return;
    stopTimers();
    if (M.g.over) { hostOver(); return; }
    M.round = null;
    setBack(tableFaces()[0]); clearMarks($('table')); clearSeatMarks(); banner(''); lockTable(true);
    later(hostReveal, delay);
  }
  function hostReveal() {
    var c = E.reveal(M.g);
    if (c == null) { hostOver(); return; }
    NET.sentAt = now();
    NET.link.broadcast({ k: 'rv', n: M.g.n, c: c, left: M.g.deck.length });
    flipTo(tableFaces()[0], c); Snd.flip();
    var faceAt = now() + faceDelay();
    M.round = { n: M.g.n, card: c, faceAt: faceAt, done: false, mine: {}, grace: null };
    setLeft(M.g.deck.length);
    lockTable(false);
    M.seats.forEach(function (s, i) {
      if (s.kind !== 'cpu') return;
      var p = E.cpuPlan(c, s.level, M.g.callMode, Math.random, s.speed);
      later(function () { if (M && M.round && !M.round.done) hostApply(i, p.type, p.item, Math.max(p.rt, Math.round(now() - M.round.faceAt))); }, p.rt + faceDelay());
    });
    later(function () { if (M && M.round && !M.round.done) hostSettle(); }, ROUND_LIMIT);
  }
  function hostLocalTouch(type, item) {
    if (!M || !M.round || M.round.done || M.round.mine[0]) return;
    var tn = now(); if (tn < M.round.faceAt - 20) return;
    M.round.mine[0] = true;
    lockTable(true);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    hostApply(0, type, item, Math.max(1, Math.round(tn - M.round.faceAt)));
  }
  function hostTry(seat, m) {
    if (!M || M.mode !== 'host' || !M.round || M.round.done || m.n !== M.round.n) return;
    var item = D.ANIMALS[m.i], type = m.t === 'c' ? 'call' : 'grab';
    if (!item) return;
    // a reaction time can't be longer than the time the message took to come back, nor shorter than a human can react
    var cap = Math.max(150, now() - NET.sentAt);
    var rt = Math.max(120, Math.min(+m.rt || 0, cap));
    hostApply(seat, type, item, Math.round(rt));
  }
  function hostApply(seat, type, item, rt) {
    var t = E.touch(M.g, seat, type, item, rt);
    if (!t) return;
    if (!t.ok) {
      NET.link.broadcast({ k: 'tr', n: M.round.n, s: seat, t: type === 'call' ? 'c' : 'g', i: D.ANIMALS.indexOf(item) });
      markOn($('table'), type, item, whoBadge(seat, true)); seatMark(seat, '✕');
      if (seat === 0) { Snd.bad(); buzz(40); $('cardWrap').classList.add('shake'); }
    }
    if (E.allTouched(M.g, activeSeats())) { hostSettle(); return; }
    if (t.ok && !M.round.grace) M.round.grace = later(hostSettle, GRACE);
  }
  function hostSettle() {
    if (!M || !M.round || M.round.done) return;
    stopTimers();
    var out = E.settle(M.g);
    M.round.done = true;
    var sc = E.scores(M.g);
    NET.link.broadcast({ k: 'rs', o: out, sc: sc });
    tableOutcome(out);
    later(function () { hostNext(rand(450, 850)); }, out.back ? RESULT_MS + 400 : RESULT_MS);
  }
  function hostSnapshot(i) {
    var r = M && M.g ? M.g.round : null;
    return { k: 'st', me: i, seats: M ? M.seats.map(pubSeat) : NET.seats.map(pubSeat), set: NET.set, sc: M ? E.scores(M.g) : [], left: M ? M.g.deck.length : 0,
      round: r ? { n: r.n, c: r.card, done: r.done } : null, over: !!(M && M.g.over), stats: M ? statsOf(M.g) : null };
  }
  function statsOf(g) { return g.seats.map(function (s) { return { ok: s.ok, bad: s.bad, paid: s.paid, rts: s.rts }; }); }
  function hostOver() {
    stopTimers();
    NET.phase = 'over';
    var rk = E.ranking(M.g), st = statsOf(M.g);
    NET.link.broadcast({ k: 'over', rk: rk, stats: st, sc: E.scores(M.g) });
    Snd.end();
    showResults({ mode: 'host', seats: M.seats, ranking: rk, me: 0, stats: st,
      again: function () { closeModal(true); hostBackToLobby(); }, againLabel: 'この部屋でもう一度',
      title: function () { closeModal(true); leaveOnline(); }, titleLabel: '部屋を閉じる' });
  }
  function hostBackToLobby() {
    stopTimers();
    M = null;
    NET.phase = 'lobby';
    NET.seats = NET.seats.filter(function (s) { return s.on !== false; });
    showLobby();
    hostBroadcastLobby();
  }

  /* ---------------------------------------------------------------- guest */
  function guestJoin(codeIn) {
    onlineErr('');
    var code = N.cleanCode(codeIn);
    if (code.length !== 4) { onlineErr('4文字の部屋コードを入れてください'); return; }
    var name = cleanName($('onName').value, 'ゲスト');
    S.name = name; persist();
    $('onJoin').disabled = true;
    var link = N.makeGuest(NETKIND);
    link.join(code).then(function () {
      $('onJoin').disabled = false;
      NET = { role: 'guest', link: link, code: code, cid: myCid(), name: name, phase: 'lobby', me: -1 };
      link.on('msg', guestMsg);
      link.on('close', guestClosed);
      link.send({ k: 'hello', cid: NET.cid, name: name, v: N.PROTOCOL });
    }, function (e) {
      $('onJoin').disabled = false;
      onlineErr(e && e.code === 'notfound' ? '部屋が見つかりませんでした。コードを確かめてください。' : e && e.code === 'lib' ? '通信ライブラリを読み込めませんでした。' : 'つながりませんでした。少し待ってからもう一度お試しください。');
    });
  }
  function guestMsg(m) {
    if (!NET || NET.role !== 'guest') return;
    switch (m.k) {
      case 'welcome': NET.phase = 'lobby'; break;
      case 'lobby':
        NET.phase = 'lobby';
        if (M) { stopTimers(); M = null; closeModal(true); }
        NET.lobby = m;
        showLobby();
        renderLobby(m);
        break;
      case 'deny':
        onlineErr(m.why === 'full' ? 'この部屋は満員です（8人まで）。' : m.why === 'playing' ? 'この部屋はいま対戦中です。終わってから入ってください。' : 'バージョンがちがいます。ページを再読み込みしてください。');
        NET.dead = true; NET.link.close(); NET = null; screen('scrOnline');
        break;
      case 'kick': NET.dead = true; NET.link.close(); NET = null; endMatch(); screen('scrOnline'); onlineErr('ホストが部屋からはずしました。'); break;
      case 'start': guestStart(m); break;
      case 'st': guestSnapshot(m); break;
      case 'seats': if (M) { m.on.forEach(function (on, i) { if (M.seats[i]) M.seats[i].on = on; }); seatChips(); } break;
      case 'rv': guestReveal(m); break;
      case 'tr':
        if (!M || !M.round || m.n !== M.round.n) break;
        markOn($('table'), m.t === 'c' ? 'call' : 'grab', D.ANIMALS[m.i], whoBadge(m.s, true)); seatMark(m.s, '✕');
        break;
      case 'rs': guestResult(m); break;
      case 'over': guestOver(m); break;
    }
  }
  function guestTable(seats, set, me, left) {
    M = { mode: 'guest', seats: seats, me: me, scores: seats.map(function () { return 0; }), timers: [], round: null, faces: tableFaces, set: set };
    M.touch = guestTouch;
    NET.me = me; NET.phase = 'play';
    closeModal(true);
    enterTable({ call: set.call, left: left, code: NET.code });
  }
  function guestStart(m) { guestTable(m.seats, m.set, m.me, m.left); banner('<div class="hint">まもなく最初のカードがめくられます</div>'); }
  function guestSnapshot(m) {
    guestTable(m.seats, m.set, m.me, m.left);
    setScores(m.sc, false);
    if (m.over && m.stats) { guestOver({ rk: rankFrom(m.sc), stats: m.stats, sc: m.sc }); return; }
    if (m.round && !m.round.done) guestReveal({ n: m.round.n, c: m.round.c, left: m.left });
  }
  function rankFrom(sc) {
    var rows = sc.map(function (v, i) { return { seat: i, score: v }; }).sort(function (a, b) { return b.score - a.score || a.seat - b.seat; });
    rows.forEach(function (r, k) { r.rank = k && rows[k - 1].score === r.score ? rows[k - 1].rank : k + 1; });
    return rows;
  }
  function guestReveal(m) {
    if (!M || M.mode !== 'guest') return;
    stopTimers();
    clearMarks($('table')); clearSeatMarks();
    var f = tableFaces()[0];
    setBack(f);
    void f.flip.offsetWidth;
    flipTo(f, m.c); Snd.flip();
    M.round = { n: m.n, card: m.c, faceAt: now() + faceDelay(), done: false, mine: null };
    setLeft(m.left);
    banner('');
    lockTable(false);
  }
  function guestTouch(type, item) {
    if (!M || !M.round || M.round.done || M.round.mine) return;
    var tn = now(); if (tn < M.round.faceAt - 20) return;
    var rt = Math.max(1, Math.round(tn - M.round.faceAt));
    M.round.mine = { type: type, item: item, rt: rt };
    lockTable(true);
    var b = $('table').querySelector((type === 'call' ? '.nmbtn' : '.pc') + '[data-item="' + item + '"]'); if (b) b.classList.add('mine');
    NET.link.send({ k: 'try', n: M.round.n, t: type === 'call' ? 'c' : 'g', i: D.ANIMALS.indexOf(item), rt: rt });
    // instant feedback for a clear miss (the host decides the rest)
    var q = D.required(D.CARDS[M.round.card], M.set.call);
    if (type !== q.type || item !== q.item) { Snd.bad(); buzz(40); $('cardWrap').classList.add('shake'); }
  }
  function guestResult(m) {
    if (!M || M.mode !== 'guest') return;
    if (!M.round || M.round.n !== m.o.n) M.round = { n: m.o.n, card: m.o.card, faceAt: now(), done: true, mine: null };
    M.round.done = true;
    lockTable(true);
    clearMarks($('table'));
    m.o.tries.forEach(function (t) { if (!t.ok) markOn($('table'), t.type, t.item, whoBadge(t.seat, true)); });
    tableOutcomeRemote(m.o, m.sc);
  }
  function tableOutcomeRemote(out, sc) {
    // same picture as tableOutcome, from the host's numbers
    var me = M.me, L = outcomeLine(out), html;
    showAnswer($('table'), out.need, out.answer);
    out.tries.forEach(function (t) { if (t.ok) markOn($('table'), t.type, t.item, whoBadge(t.seat, false)); });
    clearSeatMarks();
    if (out.win >= 0) {
      var w = seatEl(out.win); if (w) w.classList.add('win');
      seatMark(out.win, '+1', 'plus');
      html = '<div class="big">' + A.icon(out.answer) + (out.win === me ? 'ゲット！' : esc(M.seats[out.win].name) + 'がゲット') + '<span style="font-size:14px;font-family:var(--f-ui);font-weight:700;color:var(--text-2)">' + sec(out.rt) + '</span></div>';
      if (out.win === me) { Snd.win(); buzz(15); } else Snd.other();
    } else {
      html = '<div class="big bad">全員まちがい！ カードは山札の下へ</div>';
      Snd.back();
    }
    var paid = out.moves.filter(function (mv) { return mv.card !== null; }).map(function (mv) { return esc(M.seats[mv.from].name); });
    html += '<div class="sub">' + esc(L.why) + '</div>' + (L.how ? '<div class="hint">' + esc(L.how) + '</div>' : '');
    if (paid.length) html += '<div class="hint">おてつき：' + paid.join('、') + ' が1枚わたす</div>';
    var mine = out.tries.filter(function (t) { return t.seat === me; })[0];
    if (mine && !mine.ok && mine.late) html += '<div class="hint">あなたのタッチは取られたあとだったので、おてつきなし</div>';
    banner(html);
    out.moves.forEach(function (mv) { seatMark(mv.from, mv.card !== null ? '−1' : '✕'); });
    setScores(sc);
    setLeft(out.left);
  }
  function guestOver(m) {
    stopTimers();
    NET.phase = 'over';
    Snd.end();
    showResults({ mode: 'guest', seats: M.seats, ranking: m.rk, me: M.me, stats: m.stats,
      note: 'ホストが「この部屋でもう一度」を選ぶと、そのまま次の対戦に入れます。',
      title: function () { closeModal(true); leaveOnline(); }, titleLabel: '部屋を出る' });
  }
  function guestClosed() {
    if (!NET || NET.role !== 'guest' || NET.dead) return;
    var code = NET.code;
    NET = null;
    stopTimers();
    var h = '<h3>ホストとの接続が切れました</h3><p>ホストが部屋を閉じたか、通信が途切れました。</p><div class="stack"><button class="btn primary" type="button" data-act="re" data-focus>もう一度つなぐ</button><button class="btn ghost" type="button" data-act="out">タイトルへ</button></div>';
    var mm = openModal(h, { closable: false });
    mm.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      closeModal(true); M = null;
      if (b.dataset.act === 're') { screen('scrOnline'); $('onCode').value = code; guestJoin(code); } else screen('scrTitle');
    });
  }
  function leaveOnline() {
    if (NET) {
      NET.dead = true;
      try { if (NET.role === 'guest') NET.link.send({ k: 'bye' }); } catch (e) { /* ignore */ }
      var link = NET.link;
      setTimeout(function () { try { link.close(); } catch (e) { /* ignore */ } }, 120);
      NET = null;
    }
    endMatch();
    screen('scrTitle');
  }

  /* ---------------------------------------------------------------- lobby screen */
  var paintLobDeck = null, paintLobLevel = null;
  function showLobby() {
    screen('scrLobby');
    $('lobCode').textContent = NET.code;
    var host = NET.role === 'host';
    $('lobHostTools').hidden = !host;
    $('lobStart').hidden = !host;
    $('lobNote').textContent = host ? 'このコードか招待リンクを友だちに送ってください。そろったらスタート。' : 'ホストがスタートするのを待っています。';
    if (host) renderLobby(lobbyMsg()); else if (NET.lobby) renderLobby(NET.lobby);
  }
  function renderLobby(m) {
    var host = NET && NET.role === 'host';
    var ul = $('lobSeats');
    ul.innerHTML = '';
    m.seats.forEach(function (s, i) {
      var li = document.createElement('li');
      var tag = s.kind === 'host' ? 'ホスト' : s.kind === 'cpu' ? 'CPU・' + (E.LEVELS[s.level] ? E.LEVELS[s.level].name : '') : (s.on ? '' : '接続待ち');
      var mine = i === m.you;
      li.innerHTML = '<span class="av" style="--av:' + AV[i % AV.length] + '">' + esc(s.name.slice(0, 1)) + '</span><span class="nm">' + esc(s.name) + (mine ? '（あなた）' : '') + '</span>' +
        (tag ? '<span class="tag' + (s.on ? '' : ' off') + '">' + tag + '</span>' : '') +
        (host && s.kind !== 'host' ? '<button class="x" type="button" data-rm="' + i + '" aria-label="' + esc(s.name) + 'をはずす"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' : '');
      ul.appendChild(li);
    });
    $('lobRule').innerHTML = (m.set.call ? '上級ルール「本は呼ぶ」あり' : '基本ルール') + '・カード' + m.set.deck + '枚・' + m.seats.length + '人';
    if (host) {
      if (paintLobDeck) paintLobDeck(m.set.deck);
      $('lobCall').checked = !!m.set.call;
      $('lobStart').disabled = m.seats.length < 2;
      $('lobAddCpu').disabled = m.seats.length >= 8;
    }
  }

  /* ---------------------------------------------------------------- rules and card list */
  function openRules(onClose) {
    var ex = function (no, extra) {
      var c = D.CARDS[no - 1], q = D.required(c, !!extra);
      return '<div class="ex">' + A.cardFace(c, { label: cardLabel(no - 1) }) + '<div><p>' + esc(D.describe(c)) + '。' + esc(D.explain(c)) + '。</p><div class="ans">→ ' + A.icon(q.item) + (q.type === 'call' ? '「' + D.NAME[q.item] + '」と呼ぶ' : D.NAME[q.item] + 'をタッチ') + '</div></div></div>';
    };
    var pcs = '<div class="rules-pieces">' + D.ANIMALS.map(function (x) { return '<div>' + A.piece(x) + '<b>' + D.NAME[x] + '</b><small>' + D.COLOR_NAME[D.TRUE_COLOR[x]] + '</small></div>'; }).join('') + '</div>';
    var h = '<h3>あそびかた</h3>' +
      '<p>テーブルのまん中に5つのコマ。どのモノにも<b>ホンモノの色</b>があります。</p>' + pcs +
      '<p>写真カードが1枚めくられたら、全員いっせいに正しいコマをタッチします。カードには2つのモノが、2つの色で描かれています。</p>' +
      '<h4>① ホンモノの色で描かれたモノがいる</h4><p>そのモノが正解。</p>' + ex(7) +
      '<h4>② どちらも色がちがう</h4><p>カードに<b>形も色も出てこない</b>モノが正解。出ている2つと、2つの色が「誰の色か」を消していくと、1つだけ残ります。</p>' + ex(3) +
      '<h4>勝ち負け</h4><ol class="steps"><li>タッチは1枚のカードにつき1人1回。いちばん早く正解した人がカードをもらいます。</li>' +
      '<li><b>おてつき</b>：まちがえた人は、持っているカードを1枚、正解した人にわたします（持っていなければなし）。正解が出たあとにまちがえたタッチは数えません。</li>' +
      '<li>全員まちがえたら、そのカードとわたされたカードは山札のいちばん下へ。</li>' +
      '<li>山札がなくなったら終わり。カードをいちばん多く持っている人の勝ちです。</li></ol>' +
      '<h4>上級ルール「本は呼ぶ」</h4><p>カードに本が描かれていたら（何色でも）、コマをタッチせずに<b>正解のモノの名前ボタン</b>を押します。本がいないカードはいつもどおりコマをタッチ。呼ぶべきときにタッチ・タッチすべきときに呼ぶのも、おてつきです。</p>' + ex(33, true) +
      '<h4>操作</h4><p>スマホはコマをタップ。パソコンは <span class="kbd">1</span>〜<span class="kbd">5</span> でコマ、<span class="kbd">Q</span>〜<span class="kbd">T</span> で名前（左からイス・本・ビン・おばけ・ネズミ）。</p>' +
      '<h4>カードの中身</h4><p>モノの組み合わせ10通り×色の組み合わせ6通り＝60枚。どのモノも正解は12枚ずつで、ホンモノの色のカードが20枚、どこにもいないカードが40枚です。</p>' +
      '<button class="btn" type="button" data-gal>カード60枚を見る</button>';
    var m = openModal(h, { onClose: onClose });
    m.querySelector('[data-gal]').addEventListener('click', function () { openGallery(onClose); });
  }
  function openGallery(onClose) {
    var filters = [['all', 'すべて'], ['match', 'ホンモノの色'], ['none', 'どこにもいない']].concat(D.ANIMALS.map(function (x) { return [x, A.icon(x) + D.NAME[x]]; }));
    var h = '<h3>カード60枚</h3><p class="gal-stats" id="galStats"></p><div class="gal-filter" id="galFilter">' +
      filters.map(function (f, k) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (k === 0) + '">' + f[1] + '</button>'; }).join('') +
      '</div><div class="gal-grid" id="galGrid"></div>';
    var m = openModal(h, { wide: true, onClose: onClose });
    function draw(f) {
      var list = D.CARDS.filter(function (c) {
        var s = D.solve(c);
        if (f === 'all') return true;
        if (f === 'match') return s.match;
        if (f === 'none') return !s.match;
        return s.answer === f;
      });
      m.querySelector('#galGrid').innerHTML = list.map(function (c) {
        var s = D.solve(c);
        return '<figure>' + A.cardFace(c, { label: cardLabel(c.id) }) + '<figcaption><span class="no">No.' + c.no + '</span>' + A.icon(s.answer) + '<b>' + D.NAME[s.answer] + '</b><span class="k">' + (s.match ? 'ホンモノの色' : 'どこにもいない') + (D.needsCall(c) ? '・呼ぶ' : '') + '</span></figcaption></figure>';
      }).join('');
      m.querySelector('#galStats').textContent = list.length + '枚' + (f === 'all' ? '（10組×6枚。どのモノも正解12枚、ホンモノの色20枚・どこにもいない40枚。「呼ぶ」は上級ルールで名前を呼ぶカード）' : '');
    }
    m.querySelector('#galFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return;
      m.querySelectorAll('#galFilter button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      draw(b.dataset.f);
    });
    draw('all');
  }

  /* ---------------------------------------------------------------- title and setup screens */
  function renderLineup() {
    $('lineup').innerHTML = D.ANIMALS.map(function (x) { return '<div class="it">' + A.piece(x) + '<b>' + D.NAME[x] + '</b><small>' + D.COLOR_NAME[D.TRUE_COLOR[x]] + '</small></div>'; }).join('');
  }
  function setPattern(on) {
    S.pattern = !!on; persist();
    A.setPatterns(S.pattern);
    $('patState').textContent = S.pattern ? 'オン' : 'オフ';
    repaintArt();
  }
  function toggleSound(btn) {
    S.sound = !S.sound; persist();
    globalThis.GEMINI_BGM?.setEnabled(S.sound);
    ['btnSound', 'duoSound'].forEach(function (id) { $(id).classList.toggle('off', !S.sound); $(id).setAttribute('aria-pressed', String(S.sound)); });
    if (S.sound) Snd.ok();
    void btn;
  }

  function init() {
    $('patdefs').innerHTML = A.defs();
    A.setPatterns(S.pattern);
    $('patState').textContent = S.pattern ? 'オン' : 'オフ';
    renderLineup();

    $('goSolo').addEventListener('click', function () { $('soloName').value = S.name; screen('scrSolo'); });
    $('goDuo').addEventListener('click', function () { $('duoName1').value = S.duo[0]; $('duoName2').value = S.duo[1]; screen('scrDuo'); });
    $('goOnline').addEventListener('click', function () { $('onName').value = S.name; onlineErr(''); screen('scrOnline'); });
    $('goRanking').addEventListener('click', function () { renderRankingSetup(); screen('scrRanking'); });
    $('goTraining').addEventListener('click', function () { renderTrainingSetup(); screen('scrTraining'); });
    $('goDrill').addEventListener('click', function () { renderDrillSetup(); screen('scrDrill'); });
    L.init({ D: D, A: A, order: function () { return layoutOrder; }, modal: openModal, close: closeModal });
    $('goLayout').addEventListener('click', function () { L.open(); });
    $('goRules').addEventListener('click', function () { openRules(); });
    $('goGallery').addEventListener('click', function () { openGallery(); });
    $('goPattern').addEventListener('click', function () { setPattern(!S.pattern); toast(S.pattern ? '色ごとにもようをつけました（赤=水玉・青=横線・緑=ななめ線・白=無地・灰色=格子）' : 'もようを消しました', 3600); });
    document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { screen('scrTitle'); }); });

    bindSeg($('segCpu'), S.cpu, function (v) { S.cpu = +v; persist(); });
    bindSeg($('segLevel'), S.level, function (v) { S.level = +v; persist(); levelNotes(); });
    levelNotes();
    bindSeg($('segDeck'), S.deck, function (v) { S.deck = +v; persist(); });
    $('soloCall').checked = S.call;
    $('soloCall').addEventListener('change', function () { S.call = $('soloCall').checked; persist(); });
    $('soloStart').addEventListener('click', function () { S.name = N.cleanName($('soloName').value); persist(); Snd.unlock(); startCpu(); });

    bindSeg($('segDuoDeck'), S.duoDeck, function (v) { S.duoDeck = +v; persist(); });
    $('duoCall').checked = S.duoCall;
    $('duoCall').addEventListener('change', function () { S.duoCall = $('duoCall').checked; persist(); });
    $('duoKeys').hidden = matchMedia('(pointer: coarse)').matches;
    $('duoStart').addEventListener('click', function () { S.duo = [N.cleanName($('duoName1').value), N.cleanName($('duoName2').value)]; persist(); Snd.unlock(); startDuo(); });

    $('rankCall').checked = S.rankCall;
    $('rankCall').addEventListener('change', function () { S.rankCall = $('rankCall').checked; persist(); renderRankingSetup(); });
    $('rankName').addEventListener('input', function () { S.rankName = R.cleanName(this.value); persist(); $('rankNameError').hidden = true; });
    $('rankName').addEventListener('change', refreshRanking);
    $('rankRefresh').addEventListener('click', refreshRanking);
    $('rankRetryPending').addEventListener('click', function () {
      var b = this; b.disabled = true; $('rankBoardStatus').textContent = '未送信の記録を送っています…';
      R.retryPending().then(refreshRanking).catch(function () { $('rankBoardStatus').textContent = '再送できませんでした。通信環境を確認してもう一度お試しください。'; }).finally(function () { b.disabled = false; });
    });
    $('rankStart').addEventListener('click', function () { S.rankName = R.cleanName($('rankName').value); persist(); Snd.unlock(); startRanking(); });
    bindSeg($('segTrainCount'), S.trainCount, function (v) { S.trainCount = v === 'unlimited' ? 'unlimited' : +v; persist(); renderTrainingSetup(); });
    $('trainCall').checked = !!S.trainCall;
    $('trainCall').addEventListener('change', function () { S.trainCall = $('trainCall').checked; persist(); renderTrainingSetup(); });
    $('trainGoal').value = String(S.trainGoal || 1);
    $('trainGoal').addEventListener('input', function () { $('trainGoalError').hidden = true; });
    $('trainStart').addEventListener('click', function () {
      if (S.trainCount === 'unlimited') {
        var goal = Number($('trainGoal').value);
        if (!isFinite(goal) || goal < 0.1 || goal > 30) { $('trainGoalError').hidden = false; $('trainGoal').focus(); return; }
        S.trainGoal = goal; persist();
      }
      Snd.unlock(); startTraining();
    });
    paintDrillLen = bindSeg($('segDrillLen'), drillLen(), function (v) { S.drillLen = +v; persist(); });
    $('drillCall').addEventListener('change', function () { S.drillCall = $('drillCall').checked; persist(); renderDrillSetup(); });
    $('drillStart').addEventListener('click', function () { Snd.unlock(); startDrill(); });
    $('drillMap').addEventListener('click', function (e) { var b = e.target.closest('[data-card]'); if (b) openDrillCard(+b.dataset.card); });
    $('drillReset').addEventListener('click', confirmDrillReset);

    $('onCreate').addEventListener('click', function () { Snd.unlock(); hostCreate(); });
    $('onJoin').addEventListener('click', function () { Snd.unlock(); guestJoin($('onCode').value); });
    $('onCode').addEventListener('input', function () { var v = N.cleanCode($('onCode').value); if (v !== $('onCode').value) $('onCode').value = v; });
    $('onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') guestJoin($('onCode').value); });

    paintLobDeck = bindSeg($('lobDeck'), S.deck, function (v) { if (NET && NET.role === 'host') { NET.set.deck = +v; S.deck = +v; persist(); hostBroadcastLobby(); } });
    paintLobLevel = bindSeg($('lobCpuLevel'), S.lobLevel, function (v) { S.lobLevel = +v; persist(); });
    void paintLobLevel;
    $('lobCall').addEventListener('change', function () { if (NET && NET.role === 'host') { NET.set.call = $('lobCall').checked; S.call = NET.set.call; persist(); hostBroadcastLobby(); } });
    $('lobAddCpu').addEventListener('click', function () { if (NET && NET.role === 'host') hostAddCpu(); });
    $('lobSeats').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b && NET && NET.role === 'host') hostRemove(+b.dataset.rm); });
    $('lobStart').addEventListener('click', function () { if (NET && NET.role === 'host') { Snd.unlock(); hostStart(); } });
    $('lobLeave').addEventListener('click', function () { leaveOnline(); });
    $('lobInvite').addEventListener('click', function () {
      if (!NET) return;
      var url = location.origin + location.pathname + '?room=' + NET.code + (NETKIND === 'local' ? '&net=local' : '');
      if (navigator.share) { navigator.share({ title: 'おばけキャッチ', text: '部屋コード ' + NET.code, url: url }).catch(function () { /* cancelled */ }); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('招待リンクをコピーしました'); }, function () { toast(url, 6000); });
      else toast(url, 6000);
    });

    $('btnMenu').addEventListener('click', openMenu);
    $('duoMenu').addEventListener('click', openMenu);
    $('btnSound').addEventListener('click', function () { toggleSound(this); });
    $('duoSound').addEventListener('click', function () { toggleSound(this); });
    $('stage').addEventListener('click', function () { if (M && M.skip) M.skip(); });

    document.addEventListener('keydown', function (e) {
      if (!M || modalEl || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'escape') { openMenu(); return; }
      if ((k === ' ' || k === 'enter') && M.skip) { e.preventDefault(); M.skip(); return; }
      if (M.mode === 'duo') {
        var map = [[GRAB_KEYS, CALL_KEYS, 0], [GRAB_KEYS2, CALL_KEYS2, 1]];
        for (var j = 0; j < 2; j++) {
          var gi = map[j][0].indexOf(k), ci = map[j][1].indexOf(k);
          if (gi >= 0) { e.preventDefault(); humanTouch(map[j][2], 'grab', duoHalf(map[j][2]).querySelectorAll('.pc')[gi].dataset.item); return; }
          if (ci >= 0 && S.duoCall) { e.preventDefault(); humanTouch(map[j][2], 'call', duoHalf(map[j][2]).querySelectorAll('.nmbtn')[ci].dataset.item); return; }
        }
        return;
      }
      var g = GRAB_KEYS.indexOf(k), c = CALL_KEYS.indexOf(k);
      var callOn = !$('callRow').hidden;
      if (g >= 0) { e.preventDefault(); if (M.touch) M.touch('grab', $('pieces').querySelectorAll('.pc')[g].dataset.item); }
      else if (c >= 0 && callOn) { e.preventDefault(); if (M.touch) M.touch('call', $('callRow').querySelectorAll('.nmbtn')[c].dataset.item); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && M && (M.mode === 'cpu' || M.mode === 'duo' || M.mode === 'ranking' || M.mode === 'training' || M.mode === 'drill') && !modalEl && !M.paused && !(M.g && M.g.over)) openMenu();
    });

    var room = N.cleanCode(params.get('room') || '');
    if (room.length === 4) { $('onName').value = S.name; $('onCode').value = room; screen('scrOnline'); $('onNote').textContent = '招待された部屋コードが入っています。名前を入れて「入る」を押してください。'; }
    else screen('scrTitle');

    if (TEST) window.__NR = { get M() { return M; }, get NET() { return NET; }, S: S, D: D, E: E, DR: DR, get DRD() { return DRD; }, startCpu: startCpu, startDuo: startDuo, startRanking: startRanking, startTraining: startTraining, startDrill: startDrill, renderDrillSetup: renderDrillSetup, humanTouch: humanTouch, openRules: openRules, openGallery: openGallery, setPattern: setPattern };
  }

  init();
})();

