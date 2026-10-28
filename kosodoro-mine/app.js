/* コソドロ・マイン: the page. Screens, the tag board, your hand, the reveal animation, sound,
   saving a solo game, and wiring to the solo/online sessions in net.js. */
(function () {
  'use strict';
  var E = window.KOSO_ENG, AI = window.KOSO_AI, NET = window.KOSO_NET, ART = window.KOSO_ART;
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var TEST = /[?&]test=1/.test(location.search);
  var LOCALNET = /[?&]net=local/.test(location.search);   // rooms between tabs of this browser (for testing)

  /* ---------- storage ---------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('kosodoro.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('kosodoro.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('kosodoro.' + k); } catch (e) {} }
  };
  var prefs = Object.assign({ name: '', ani: 4, count: 5, level: 2, mult: E.DEFAULT_MULT, adv: false, sound: true, speed: 1, chat: true }, LS.get('prefs', {}));
  if (E.MULTS.indexOf(prefs.mult) < 0) prefs.mult = E.DEFAULT_MULT;
  function savePrefs() { LS.set('prefs', prefs); }
  /* who I am in an online room: one id per tab (kept over a reload, so a dropped player gets the seat
     back), so two tabs of one browser are two players */
  var cid = '';
  try { cid = sessionStorage.getItem('kosodoro.cid') || ''; } catch (e) {}
  if (!/^[0-9a-f]{16}$/.test(cid)) { cid = NET.randHex(8); try { sessionStorage.setItem('kosodoro.cid', cid); } catch (e) {} }

  /* ---------- sound (synthesised, nothing to download) ---------- */
  var SFX = (function () {
    var ctx = null;
    function ac() {
      if (!prefs.sound) return null;
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ctx.state === 'suspended') try { ctx.resume(); } catch (e) {}
      return ctx;
    }
    function tone(f, t0, dur, type, vol, f2) {
      var c = ac(); if (!c) return;
      var t = c.currentTime + t0, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(t0, dur, vol, freq, q) {
      var c = ac(); if (!c) return;
      var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + t0;
      src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq || 1200; bp.Q.value = q || 0.8; g.gain.value = vol || 0.1;
      src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t);
    }
    return {
      unlock: function () { ac(); },
      tap: function () { tone(1250, 0, 0.05, 'square', 0.025); },
      place: function () { noise(0, 0.09, 0.22, 700, 1.2); },
      flip: function () { noise(0, 0.22, 0.12, 2600, 0.6); },
      ore: function (k) { tone(1700 + (k || 0) % 5 * 140, 0, 0.11, 'sine', 0.06); },
      steal: function () { tone(880, 0, 0.32, 'triangle', 0.07, 260); tone(660, 0.1, 0.3, 'triangle', 0.05, 200); },
      caught: function () { tone(1760, 0, 0.11, 'square', 0.035); tone(1320, 0.12, 0.11, 'square', 0.035); tone(1760, 0.24, 0.11, 'square', 0.035); tone(1320, 0.36, 0.16, 'square', 0.035); },
      coin: function () { tone(1250, 0, 0.09, 'sine', 0.06); tone(1870, 0.07, 0.16, 'sine', 0.05); },
      magic: function () { [990, 1320, 1760].forEach(function (f, i) { tone(f, i * 0.05, 0.22, 'sine', 0.045); }); },
      last: function () { [660, 880, 1100, 1320].forEach(function (f, i) { tone(f, i * 0.07, 0.18, 'triangle', 0.06); }); },
      bell: function () { tone(523, 0, 0.9, 'sine', 0.05); tone(1046, 0, 0.6, 'sine', 0.025); },
      win: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, i * 0.12, 0.34, 'triangle', 0.07); }); }
    };
  })();
  document.addEventListener('pointerdown', function () { SFX.unlock(); }, { capture: true, passive: true });

  /* ---------- app state (window.KOSO_APP is also the test hook) ---------- */
  var A = window.KOSO_APP = { session: null, mode: '', view: null, shown: null, busy: false, queue: [], animSeq: 0, sel: null, tags: [], logKey: '' };
  function speed() { return TEST ? 6 : prefs.speed || 1; }
  function D(ms) { return reduce.matches ? Math.min(ms, 80) : ms / speed(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    $('toasts').appendChild(t); setTimeout(function () { t.remove(); }, 3300);
  }
  function banner(text, ms) {
    var b = $('banner'); b.textContent = text; b.classList.remove('on'); void b.offsetWidth;
    b.style.setProperty('--bd', (ms || D(900)) + 'ms'); b.classList.add('on');
  }
  function spOf(ani) { return E.ANIMALS[ani].sp; }

  /* ---------- screens ---------- */
  var SCREENS = ['scrTitle', 'scrSolo', 'scrOnline', 'scrLobby', 'game'];
  function show(id) { SCREENS.forEach(function (x) { $(x).hidden = x !== id; }); window.scrollTo(0, 0); }
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show('scrTitle'); refreshTitle(); }); });
  document.querySelectorAll('dialog [data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  function segInit(el, values, labels, current, onPick) {
    el.innerHTML = values.map(function (v, i) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (String(v) === String(current)) + '">' + labels[i] + '</button>'; }).join('');
    el.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        SFX.tap(); onPick(b.dataset.v);
      });
    });
  }
  function segSet(el, v) { el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.v === String(v))); }); }
  var MULT_LABEL = { 3: '短め（×3）', 4: '原作どおり（×4）', 5: '長め（×5）' };

  /* animal picker: taken = {ani: true} disabled */
  function animalPicker(el, current, onPick, taken, withSp) {
    el.innerHTML = E.ANIMALS.map(function (a, i) {
      return '<button type="button" data-v="' + i + '" aria-pressed="' + (i === current) + '"' + (taken && taken[i] ? ' disabled' : '') + ' aria-label="' + a.nm + '">' +
        ART.face(i) + a.nm + (withSp ? '<small>' + a.sp.no + '「' + a.sp.nm + '」</small>' : '') + '</button>';
    }).join('');
    el.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        SFX.tap(); onPick(+b.dataset.v);
      });
    });
  }

  /* ---------- title ---------- */
  $('lineup').innerHTML = [4, 0, 2, 3, 6, 1, 5, 7].map(function (i) { return '<span>' + ART.face(i) + '</span>'; }).join('');
  function refreshTitle() {
    var sv = LS.get('save', null);
    var ok = sv && sv.v === 2 && sv.state && sv.state.ph === 'pick';
    $('goResume').hidden = !ok;
    if (ok) $('goResume').textContent = '続きから遊ぶ（シーズン' + sv.state.season + '）';
  }
  refreshTitle();
  $('goSolo').addEventListener('click', function () { SFX.tap(); openSolo(); });
  $('goOnline').addEventListener('click', function () { SFX.tap(); openOnline(); });
  $('goRules').addEventListener('click', function () { SFX.tap(); openRules(); });
  $('goResume').addEventListener('click', function () { SFX.tap(); resumeSolo(); });

  /* ---------- solo setup ---------- */
  function openSolo() {
    $('soloName').value = prefs.name;
    animalPicker($('soloAnimals'), prefs.ani, function (i) { prefs.ani = i; spHelp(); }, null, true);
    segInit($('segCount'), [3, 4, 5, 6, 7, 8], ['3人', '4人', '5人', '6人', '7人', '8人'], prefs.count, function (v) { prefs.count = +v; targetNote(); });
    segSet($('segLevel'), prefs.level);
    $('segLevel').querySelectorAll('button').forEach(function (b) { b.onclick = function () { segSet($('segLevel'), b.dataset.v); prefs.level = +b.dataset.v; SFX.tap(); }; });
    segInit($('segTarget'), E.MULTS, E.MULTS.map(function (m) { return MULT_LABEL[m]; }), prefs.mult, function (v) { prefs.mult = +v; targetNote(); });
    $('soloAdv').checked = !!prefs.adv;
    targetNote(); spHelp();
    show('scrSolo');
  }
  function targetNote() { $('targetNote').textContent = prefs.count + '人なら' + E.targetFor(prefs.count, prefs.mult) + '個。全員2個ずつ持って始めます。'; }
  function spHelp() {
    var a = E.ANIMALS[prefs.ani];
    $('soloSpHelp').textContent = $('soloAdv').checked ? a.nm + 'の特殊カード ' + a.sp.no + '「' + a.sp.nm + '」：' + a.sp.tx : '';
  }
  $('soloAdv').addEventListener('change', function () { prefs.adv = $('soloAdv').checked; spHelp(); });
  $('soloStart').addEventListener('click', function () {
    var n = $('soloName').value.trim();
    prefs.name = n ? NET.cleanName(n) : 'あなた';
    prefs.adv = $('soloAdv').checked;
    savePrefs(); SFX.tap();
    startSolo();
  });
  function hostOpts(extra) {
    return Object.assign({
      me: { cid: cid, nm: prefs.name || 'あなた', ani: prefs.ani },
      onView: onView, onEvent: onEvent,
      roundPause: TEST ? 60 : Math.round(2700 / speed()),
      think: TEST ? [10, 40] : [Math.round(450 / speed()), Math.round(1700 / speed())]
    }, extra || {});
  }
  function startSolo() {
    closeSession();
    var s = new NET.HostSession(hostOpts({ settings: { mult: prefs.mult, adv: prefs.adv } }));
    A.session = s; A.mode = 'solo';
    for (var i = 1; i < prefs.count; i++) s.addCpu(prefs.level);
    LS.del('save');
    s.start();
  }
  function resumeSolo() {
    var sv = LS.get('save', null);
    if (!sv || !sv.state) { refreshTitle(); return; }
    closeSession();
    var me = sv.state.P.filter(function (p) { return !p.cpu; })[0];
    var s = new NET.HostSession(hostOpts({ me: { cid: me.id, nm: me.nm, ani: me.ani }, settings: { mult: sv.state.opts.mult, adv: sv.state.opts.adv } }));
    A.session = s; A.mode = 'solo';
    if (!s.resume(sv.state)) { LS.del('save'); refreshTitle(); toast('続きを読みこめませんでした'); }
  }
  function saveSolo() {
    if (A.mode !== 'solo' || !A.session || !A.session.state) return;
    var st = A.session.state;
    if (st.ph === 'pick') LS.set('save', { v: 2, state: st, at: Date.now() }); else LS.del('save');
  }

  /* ---------- online ---------- */
  function openOnline() {
    $('onName').value = prefs.name === 'あなた' ? '' : prefs.name;
    animalPicker($('onAnimals'), prefs.ani, function (i) { prefs.ani = i; }, null, false);
    $('onErr').hidden = true;
    show('scrOnline');
  }
  function onErr(msg) { $('onErr').textContent = msg; $('onErr').hidden = false; }
  function readName() {
    var n = $('onName').value.trim();
    if (!n) { onErr('名前を入れてください'); $('onName').focus(); return null; }
    prefs.name = NET.cleanName(n); savePrefs();
    return prefs.name;
  }
  var NETERR = { lib: 'オンライン用の部品を読みこめませんでした。通信を確かめてください。', net: '接続できませんでした。少し待ってからもう一度ためしてください。', notfound: 'その部屋が見つかりません。コードを確かめてください。', taken: 'その部屋コードは使われています。' };
  $('onCreate').addEventListener('click', async function () {
    var nm = readName(); if (!nm) return;
    var btn = this; btn.disabled = true; btn.textContent = '部屋をつくっています…';
    closeSession();
    var tr = (LOCALNET ? new NET.LocalTransport() : new NET.PeerTransport()), code = '', ok = false, err = null;
    var s = new NET.HostSession(hostOpts({ transport: tr, settings: { mult: prefs.mult, adv: prefs.adv } }));
    for (var k = 0; k < 4 && !ok; k++) {
      code = String(1000 + Math.floor(Math.random() * 9000));
      try { await tr.hostOpen(code); ok = true; } catch (e) { err = e; if (!e || e.code !== 'taken') break; }
    }
    btn.disabled = false; btn.textContent = '部屋をつくる';
    if (!ok) { onErr(NETERR[err && err.code] || NETERR.net); return; }
    s.code = code; A.session = s; A.mode = 'host';
    s.publish();
  });
  async function join() {
    var nm = readName(); if (!nm) return;
    var code = $('onCode').value.replace(/\D/g, '');
    if (code.length !== 4) { onErr('4けたの部屋コードを入れてください'); return; }
    var btn = $('onJoin'); btn.disabled = true; btn.textContent = '…';
    closeSession();
    var tr = (LOCALNET ? new NET.LocalTransport() : new NET.PeerTransport());
    var s = new NET.GuestSession({ me: { cid: cid, nm: nm, ani: prefs.ani }, transport: tr, code: code, onView: onView, onEvent: onEvent, onClose: onClosed });
    A.session = s; A.mode = 'guest';
    try { await tr.clientConnect(code, { cid: cid, nm: nm, ani: prefs.ani }); }
    catch (e) { A.session = null; A.mode = ''; btn.disabled = false; btn.textContent = '入る'; onErr(NETERR[e && e.code] || NETERR.net); return; }
    btn.disabled = false; btn.textContent = '入る';
    if (!A.view) { $('lobCode').textContent = code; $('lobSeats').innerHTML = ''; $('lobNote').textContent = 'ホストにつないでいます…'; show('scrLobby'); }
  }
  $('onJoin').addEventListener('click', join);
  $('onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
  function onClosed(why) {
    if (!A.session) return;
    var msg = why === 'full' ? 'この部屋は満員です（8人まで）。' : why === 'started' ? 'この部屋はもうゲームを始めています。' : 'ホストとの接続が切れました。';
    closeSession();
    show('scrOnline'); onErr(msg);
  }
  function closeSession() {
    var s = A.session;
    A.session = null; A.mode = ''; A.view = null; A.shown = null; A.queue = []; A.busy = false; A.animSeq = 0; A.sel = null;
    if (s) try { s.close(); } catch (e) {}
    ['dlgResult', 'dlgMenu', 'dlgChat'].forEach(function (d) { if ($(d).open) $(d).close(); });
  }

  /* ---------- lobby ---------- */
  segInit($('lobTarget'), E.MULTS, E.MULTS.map(function (m) { return MULT_LABEL[m]; }), prefs.mult, function (v) { prefs.mult = +v; savePrefs(); if (A.mode === 'host') A.session.setSettings({ mult: +v }); });
  $('lobAdv').addEventListener('change', function () { prefs.adv = $('lobAdv').checked; savePrefs(); if (A.mode === 'host') A.session.setSettings({ adv: prefs.adv }); });
  $('lobAddCpu').addEventListener('click', function () { SFX.tap(); if (A.mode === 'host' && !A.session.addCpu(+$('lobCpuLevel').value)) toast('8人までです'); });
  $('lobStart').addEventListener('click', function () { SFX.tap(); if (A.mode === 'host' && !A.session.start()) toast('3〜8人で始められます'); });
  $('lobLeave').addEventListener('click', function () { closeSession(); show('scrTitle'); refreshTitle(); });
  var LV = { 1: 'やさしい', 2: 'ふつう', 3: 'つよい' };
  function renderLobby(v) {
    if (A.mode === 'solo' || !A.mode) return;
    show('scrLobby');
    var host = A.mode === 'host', lob = v.lobby || [];
    $('lobCode').textContent = v.code || '----';
    $('lobNote').textContent = host ? 'このコードを友だちに伝えてください。同じページで「部屋コードで入る」に入れると参加できます。' : 'ホストがスタートするのを待っています。';
    $('lobSeats').innerHTML = lob.map(function (s, i) {
      var who = s.cpu ? 'CPU（' + LV[s.cpu] + '）' : s.id === v.hostId ? 'ホスト' : '参加者';
      if (s.id === cid) who += '・あなた';
      var ctl = '';
      if (host && s.cpu) ctl = '<span><select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map(function (l) { return '<option value="' + l + '"' + (l === s.cpu ? ' selected' : '') + '>' + LV[l] + '</option>'; }).join('') + '</select> <button class="x" data-rm="' + i + '" aria-label="このCPUを外す">×</button></span>';
      return '<div class="seat">' + (s.ani >= 0 ? ART.face(s.ani) : '<svg viewBox="0 0 100 100"><circle cx="50" cy="55" r="32" fill="#3a4a44"/><text x="50" y="66" text-anchor="middle" font-size="34" fill="#bcb5a4">?</text></svg>') +
        '<span><b>' + esc(s.nm) + '</b><small>' + who + (s.ani >= 0 ? '　' + E.ANIMALS[s.ani].nm : '　動物はおまかせ') + '</small></span>' + ctl + '</div>';
    }).join('');
    $('lobSeats').querySelectorAll('[data-lv]').forEach(function (el) { el.onchange = function () { A.session.setCpuLevel(+el.dataset.lv, +el.value); }; });
    $('lobSeats').querySelectorAll('[data-rm]').forEach(function (el) { el.onclick = function () { A.session.removeSeat(+el.dataset.rm); }; });
    var mine = lob.filter(function (s) { return s.id === cid; })[0];
    var taken = {};
    lob.forEach(function (s) { if (s.id !== cid && !s.cpu && s.ani >= 0) taken[s.ani] = true; });
    animalPicker($('lobAnimals'), mine ? mine.ani : -1, function (i) {
      prefs.ani = i; savePrefs();
      if (host) { if (!A.session.setAnimal(cid, i)) toast('その動物はほかの人が選んでいます'); }
      else A.session.setAnimal(i);
    }, taken, !!v.settings.adv);
    $('lobHost').hidden = !host;
    segSet($('lobTarget'), v.settings.mult);
    $('lobAdv').checked = !!v.settings.adv;
    $('lobRule').textContent = lob.length + '人：勝利に必要な鉱石 ' + E.targetFor(Math.max(3, lob.length), v.settings.mult) + '個　特殊カード：' + (v.settings.adv ? 'あり' : 'なし');
    $('lobStart').hidden = !host;
    $('lobStart').disabled = lob.length < E.MIN_PLAYERS;
  }

  /* ---------- the table ---------- */
  function mySeat() { return A.session ? A.session.mySeat() : -1; }
  function buildBoard(st) {
    var board = $('board');
    board.innerHTML = '';
    A.tags = st.P.map(function (p, i) {
      var el = document.createElement('div');
      el.className = 'tag'; el.dataset.seat = i;
      el.innerHTML = '<div class="tag-in"><div class="side front"><div class="face"></div><div class="nm"></div><div class="ore"></div><div class="trail"></div></div>' +
        '<div class="side back"><div class="face"></div><div class="nm"></div><div class="ore"></div><span class="gone"></span></div></div>' +
        '<div class="slot empty"><div class="cb">' + ART.back + '</div><div class="cf"></div></div><div class="badges"></div><div class="bubble"></div>';
      board.appendChild(el);
      return { el: el, face: null };
    });
  }
  /* lay the tags out in 1, 2 or 3 rows, whichever gives the biggest tags that still leave room for the cart */
  function fitBoard() {
    if (!A.shown || $('game').hidden) return;
    var n = A.shown.P.length, board = $('board'), table = $('table'), tag = board.querySelector('.tag');
    if (!tag) return;
    var bs = getComputedStyle(board), ts = getComputedStyle(table);
    var cap = px(getComputedStyle(tag).getPropertyValue('--tagcap')) || 108;
    var innerW = board.clientWidth - px(bs.paddingLeft) - px(bs.paddingRight), colGap = px(bs.columnGap), rowGap = px(bs.rowGap);
    var freeH = table.clientHeight - px(ts.paddingTop) - px(ts.paddingBottom) - px(ts.rowGap) - $('poolWrap').offsetHeight -
      px(bs.paddingTop) - px(bs.paddingBottom) - 4;
    var best = null;
    [n, Math.ceil(n / 2), Math.ceil(n / 3)].forEach(function (c) {
      if (c < 2 && n > 1) return;
      var rows = Math.ceil(n / c);
      var byW = (innerW - (c - 1) * colGap) / c, byH = (freeH - (rows - 1) * rowGap) / rows * 0.8;
      var w = Math.min(cap, byW, Math.max(byH, 56));   // below 56px the table may scroll instead
      if (!best || w > best.w * 1.12) best = { c: c, w: w, byH: byH };   // another row only for clearly bigger tags
    });
    board.style.setProperty('--cols', best.c);
    board.style.setProperty('--tagmax', Math.max(58, Math.floor(best.byH)) + 'px');
  }
  function px(v) { return parseFloat(v) || 0; }
  window.addEventListener('resize', fitBoard);
  if (window.ResizeObserver) new ResizeObserver(function () { fitBoard(); }).observe($('table'));

  function tagEl(i) { return A.tags[i] && A.tags[i].el; }
  function setFace(i, ani, mood) {
    var t = A.tags[i]; if (!t) return;
    var key = ani + ':' + (mood || '');
    if (t.face === key) return;
    t.face = key;
    var svg = ART.face(ani, mood);
    t.el.querySelectorAll('.face').forEach(function (f) { f.innerHTML = svg; });
  }
  function setOre(i, n) { var el = tagEl(i); if (el) el.querySelectorAll('.ore').forEach(function (o) { o.innerHTML = ART.nugget(16) + '<span>' + n + '</span>'; }); }
  var GONE = { guard: ['見張り', 'g'], caught: ['御用', 's'], special: ['特殊', 'x'], thief: ['持ち逃げ', 's'] };
  function setOut(i, why) {
    var el = tagEl(i); if (!el) return;
    el.classList.toggle('out', !!why);
    var g = el.querySelector('.gone'), d = GONE[why] || ['', ''];
    g.className = 'gone ' + d[1]; g.textContent = d[0];
  }
  function cardFace(a, ani) {
    if (a === 'x') { var nm = spOf(ani).nm; return ART.face(ani) + '<b' + (nm.length >= 4 ? ' class="long"' : '') + '>' + nm + '</b>'; }
    return ART.icon(a) + '<b>' + E.ACT_NAME[a] + '</b>';
  }
  function setSlot(i, mode, a, ani) {
    var el = tagEl(i); if (!el) return;
    var sl = el.querySelector('.slot');
    sl.classList.toggle('empty', mode === 'none');
    sl.classList.toggle('think', mode === 'think');
    sl.classList.toggle('up', mode === 'up');
    if (mode === 'up' && a) { var cf = sl.querySelector('.cf'); cf.className = 'cf ' + a; cf.innerHTML = cardFace(a, ani); }
  }
  function stamp(i, text, kind, ms) {
    var el = tagEl(i); if (!el) return;
    var s = document.createElement('div'); s.className = 'stamp ' + (kind || 's'); s.textContent = text;
    el.appendChild(s); setTimeout(function () { s.remove(); }, ms || D(1500) + 300);
  }
  function pop(i, n) {
    var el = tagEl(i); if (!el || !n) return;
    var p = document.createElement('div'); p.className = 'pop' + (n < 0 ? ' neg' : ''); p.textContent = (n > 0 ? '+' : '') + n;
    el.appendChild(p); setTimeout(function () { p.remove(); }, 1400);
  }
  function bubble(i, text) {
    var el = tagEl(i); if (!el || !prefs.chat) return;
    var b = el.querySelector('.bubble'); b.textContent = text; b.classList.add('on');
    clearTimeout(b._t); b._t = setTimeout(function () { b.classList.remove('on'); }, 2800);
  }
  var poolShown = -1;
  function setPool(n, bump) {
    if (n !== poolShown) { $('cart').innerHTML = ART.cart(n); poolShown = n; }
    $('poolNum').textContent = n;
    if (bump) { var b = $('poolNum'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 }; }
  /* nuggets flying from one place to another */
  function fly(fromEl, toEl, count) {
    if (!fromEl || !toEl || reduce.matches || count <= 0) return;
    var a = center(fromEl), b = center(toEl), fx = $('fx');
    count = Math.min(count, 10);
    for (var k = 0; k < count; k++) (function (k) {
      setTimeout(function () {
        var d = document.createElement('div'); d.className = 'fly'; d.innerHTML = ART.nugget(20);
        fx.appendChild(d);
        var jx = (Math.random() - 0.5) * 18, jy = (Math.random() - 0.5) * 12;
        var mx = (a.x + b.x) / 2 + jx, my = Math.min(a.y, b.y) - 50 - Math.random() * 20;
        var anim = d.animate([
          { transform: 'translate(' + (a.x + jx) + 'px,' + (a.y + jy) + 'px) scale(.7)', opacity: 0 },
          { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.1)', opacity: 1, offset: 0.5 },
          { transform: 'translate(' + b.x + 'px,' + b.y + 'px) scale(.8)', opacity: 0.9 }
        ], { duration: D(560), easing: 'cubic-bezier(.45,0,.3,1)' });
        anim.onfinish = function () { d.remove(); SFX.ore(k); };
      }, D(55) * k);
    })(k);
  }

  function roundText(st) { return st.ph === 'over' ? 'ゲーム終了' : 'シーズン' + st.season + '　ラウンド' + st.rnd; }
  /* draw the shown state plus the live round (who has put a card down) */
  function renderLive() {
    var st = A.shown, v = A.view;
    if (!st) return;
    var rd = v && v.state && v.state.gid === st.gid && v.state.turn === st.turn ? v.rd : null, me = mySeat();
    $('dayChip').textContent = roundText(st);
    $('targetChip').textContent = '目標' + st.opts.target;
    $('roomChip').hidden = A.mode === 'solo' || !A.session || !A.session.code;
    if (!$('roomChip').hidden) $('roomChip').textContent = '部屋 ' + A.session.code;
    st.P.forEach(function (p, i) {
      var el = tagEl(i); if (!el) return;
      setFace(i, p.ani, '');
      el.querySelectorAll('.nm').forEach(function (n) { n.textContent = p.nm; });
      setOre(i, p.ore);
      setOut(i, p.out);
      el.querySelector('.trail').innerHTML = p.hist.slice(-6).map(function (a) { return '<i class="' + a + '"></i>'; }).join('');
      var badges = '';
      if (p.susp) badges += '<span class="b-susp" title="謹慎：トロッコが3個になるまで盗めない">謹慎</span>';
      if (st.opts.adv) badges += '<span class="b-sp' + (p.used ? ' used' : '') + '" title="' + esc('特殊カード' + spOf(p.ani).no + '「' + spOf(p.ani).nm + '」：' + spOf(p.ani).tx) + '">' + spOf(p.ani).no + '<span class="nm">' + spOf(p.ani).nm + '</span></span>';
      el.querySelector('.badges').innerHTML = badges;
      var pill = el.querySelector('.me-pill');
      if (i === me && !pill) { pill = document.createElement('span'); pill.className = 'me-pill'; pill.textContent = 'あなた'; el.appendChild(pill); }
      var away = v && v.here && v.here[i] === false;
      if (st.ph !== 'pick' || p.out) setSlot(i, 'none');
      else setSlot(i, rd && rd.cm[i] ? 'down' : 'think');
      el.style.opacity = away ? 0.6 : '';
      el.setAttribute('aria-label', p.nm + (i === me ? '（あなた）' : '') + '、' + E.ANIMALS[p.ani].nm + '、鉱石' + p.ore + '個、' +
        (p.out ? 'このシーズンは抜けた' : 'シーズンに残っている') + (p.susp ? '、謹慎中' : ''));
    });
    setPool(st.pool);
    $('poolNote').textContent = st.ph === 'pick' ? '残り' + E.activeSeats(st).length + '人' : '';
    renderDock();
    renderLog();
  }

  /* ---------- your hand ---------- */
  var HINT = {
    w: function () { return 'プールに1個。最後のひとりなら全部もらえる'; },
    s: function (st, me) { var add = E.activeSeats(st).length - 1; return 'プール最大' + (st.pool + add) + '個を盗む。防衛がいたら' + st.P[me].ore + '個を全部失う'; },
    g: function () { return '泥棒がいれば手持ちを没収。いなければプールから1個。今シーズンはここまで'; },
    x: function (st, me) { return SHORT[spOf(st.P[me].ani).no]; }
  };
  var SHORT = { 1: '労働として出す。泥棒から2個ずつもらう', 2: '労働として出す。働いた人から1個ずつもらう', 3: '労働として出す。プールを労働の人で山分け',
    4: '盗みとして出す。仲間の泥棒がいれば没収されない', 5: '盗みとして出す。没収されても半分だけ', 6: 'プールの半分をもらってシーズンを抜ける',
    7: '盗みが出なければ、見張りの鉱石を全部もらう', 8: 'いちばん多く持つ人から3個もらう' };
  document.querySelectorAll('.pcard').forEach(function (b) {
    if (b.dataset.a !== 'x') b.querySelector('.ic').innerHTML = ART.icon(b.dataset.a);
    b.addEventListener('click', function () {
      if (b.disabled) return;
      A.sel = b.dataset.a; SFX.tap(); renderDock();
    });
  });
  $('btnCommit').addEventListener('click', function () {
    var st = A.shown, me = mySeat();
    if (!A.session || !st || !A.sel || A.busy) return;
    var r = A.session.pick({ a: A.sel });
    if (!r || !r.ok) { toast('いまは札を出せません'); return; }
    SFX.place();
    setSlot(me, 'down');
    renderDock();
  });
  function renderDock() {
    var st = A.shown, me = mySeat(), v = A.view;
    if (!st || me < 0) { $('handWrap').hidden = true; $('dockMsg').hidden = false; $('dockMsg').textContent = '観戦中'; return; }
    var p = st.P[me];
    $('myOre').textContent = p.ore;
    $('myMeter').style.width = Math.min(100, p.ore / st.opts.target * 100) + '%';
    $('myGoal').textContent = '目標' + st.opts.target;
    var live = v && v.state && v.state.gid === st.gid && v.state.turn === st.turn ? v.rd : null;
    var over = st.ph === 'over';
    $('handWrap').hidden = over; $('dockMsg').hidden = !over; $('dockMsg').textContent = over ? 'ゲーム終了' : '';
    if (over) return;
    var status = '';
    if (A.busy) status = '公開中…';
    else if (p.out === 'guard') status = '見張りをしてシーズンを抜けました。結末を見守りましょう。';
    else if (p.out === 'caught') status = 'つかまってシーズンを抜けました。次のシーズンで取り返しましょう。';
    else if (p.out === 'special') status = '特殊カードを使ってシーズンを抜けました。';
    else if (!live) status = '次のラウンドを準備しています…';
    var canPick = !status && !live.lock;
    var legal = canPick ? E.legalActions(st, me) : [], mine = canPick ? A.session.myPick() : null;
    if (!A.sel && mine) A.sel = mine.a;
    if (!canPick || legal.indexOf(A.sel) < 0) A.sel = canPick ? null : A.sel;
    var showX = st.opts.adv && !p.used;
    $('hand').classList.toggle('four', showX);
    document.querySelectorAll('.pcard').forEach(function (b) {
      var a = b.dataset.a, ok = legal.indexOf(a) >= 0;
      if (a === 'x') {
        b.hidden = !showX;
        if (!showX) return;
        var sp = spOf(p.ani);
        b.querySelector('.hd').textContent = sp.nm;
        b.querySelector('.ic').innerHTML = ART.face(p.ani);
        var no = b.querySelector('.no'); if (!no) { no = document.createElement('span'); no.className = 'no'; b.appendChild(no); }
        no.textContent = sp.no;
      }
      b.disabled = !ok;
      b.setAttribute('aria-pressed', String(canPick && A.sel === a));
      b.setAttribute('aria-label', a === 'x' ? E.ANIMALS[p.ani].nm + 'の特殊カード ' + spOf(p.ani).no : E.ACT_NAME[a]);
      b.setAttribute('aria-describedby', 'cardHint');
      var lk = b.querySelector('.lock');
      var why = canPick && !ok && (a === 's' || a === 'x') && p.susp ? '謹慎中' : '';
      if (why) { if (!lk) { lk = document.createElement('span'); lk.className = 'lock'; b.appendChild(lk); } lk.textContent = why; }
      else if (lk) lk.remove();
    });
    var btn = $('btnCommit');
    if (status) {
      $('cardHint').textContent = status === '公開中…' ? '' : status;
      btn.disabled = true; btn.textContent = status === '公開中…' ? status : '待っています';
      return;
    }
    if (live.lock) { $('cardHint').textContent = ''; btn.disabled = true; btn.textContent = '公開中…'; return; }
    var waiting = E.activeSeats(st).filter(function (i) { return !live.cm[i]; }).length;
    $('cardHint').innerHTML = A.sel ? '<b>' + (A.sel === 'x' ? spOf(p.ani).no + '「' + spOf(p.ani).nm + '」' : E.ACT_NAME[A.sel]) + '</b>　' + esc(HINT[A.sel](st, me)) : '出す札を選んでください。全員がそろうと、いっせいに表になります。';
    var label = A.sel ? (A.sel === 'x' ? spOf(p.ani).nm : E.ACT_NAME[A.sel]) : '';
    if (!A.sel) { btn.disabled = true; btn.textContent = '札を選んでください'; }
    else if (mine && mine.a === A.sel) { btn.disabled = true; btn.textContent = '出しました。あと' + waiting + '人を待っています'; }
    else { btn.disabled = false; btn.textContent = (mine ? '札を変える：' : 'この札を出す：') + label; }
  }

  /* ---------- log ---------- */
  function renderLog() {
    var st = A.shown; if (!st) return;
    var key = st.gid + ':' + st.log.length;
    if (A.logKey === key) return;
    A.logKey = key;
    var groups = [], cur = null;
    st.log.forEach(function (L) {
      if (!cur || cur.d !== L.d) { cur = { d: L.d, rows: [] }; groups.push(cur); }
      var picks = L.a.split(',').map(function (a, i) {
        if (a === '-') return '';
        var name = a === 'x' ? spOf(st.P[i].ani).nm : E.ACT_NAME[a];
        return '<span>' + ART.face(st.P[i].ani) + esc(st.P[i].nm) + ' <i class="' + a + '">' + name + '</i></span>';
      }).join('');
      var res = L.e === 'stolen' ? '盗まれてシーズン終了' : L.e === 'last' ? '最後のひとりが総取り' : L.e === 'empty' ? 'だれも残らず持ち越し' : '';
      var gains = L.dl.map(function (d, i) { return d ? esc(st.P[i].nm) + (d > 0 ? '+' : '') + d : ''; }).filter(Boolean).join('　');
      cur.rows.push('<div class="lg"><div class="when">ラウンド' + L.r + '　プール' + L.p0 + '→' + L.p1 + (res ? '　' + res : '') + '</div><div class="picks">' + picks + '</div>' + (gains ? '<div>' + gains + '</div>' : '') + '</div>');
    });
    var html = groups.reverse().map(function (g) { return '<div class="lg day">シーズン' + g.d + '</div>' + g.rows.reverse().join(''); });
    $('logList').innerHTML = html.join('') || '<p class="note">まだ記録はありません。</p>';
  }
  $('btnLog').addEventListener('click', function () { $('logPanel').classList.toggle('on'); });
  $('logClose').addEventListener('click', function () { $('logPanel').classList.remove('on'); });

  /* ---------- views and events from the session ---------- */
  function onView(v) {
    A.view = v;
    if (!v.state) { A.shown = null; renderLobby(v); return; }
    var st = v.state;
    if (!A.shown || A.shown.gid !== st.gid) {
      A.shown = st; A.queue = []; A.busy = false; A.animSeq = v.ev ? v.ev.seq : 0; A.sel = null; A.logKey = ''; poolShown = -1;
      if ($('dlgResult').open) $('dlgResult').close();
      buildBoard(st); show('game'); fitBoard(); renderLive();
      if (st.turn === 1) banner('シーズン1　入坑！', D(1300));
      return;
    }
    if (v.ev && v.ev.seq > A.animSeq) { A.animSeq = v.ev.seq; A.queue.push({ ev: v.ev, state: st }); pump(); }
    if (!A.busy && !A.queue.length) { if (st.turn === A.shown.turn) A.shown = st; renderLive(); }
  }
  function onEvent(e) {
    if (!e) return;
    if (e.k === 'chat' && A.shown) bubble(e.p, AI.CHAT[e.id] || '');
    else if (e.k === 'join') toast(e.nm + (e.back ? 'がもどってきました' : 'が入りました'));
    else if (e.k === 'leave') toast(e.nm + 'が抜けました。CPUが代わりに遊びます');
    else if (e.k === 'proof') toast('注意：ホストの公開した札が、伏せた札と一致しませんでした');
  }
  function pump() {
    if (A.busy || !A.queue.length) return;
    A.busy = true;
    var item = A.queue.shift(), prev = A.shown;
    renderDock();
    animate(prev, item.ev, item.state).catch(function (e) { console.error(e); }).then(function () {
      A.shown = item.state; A.busy = false; A.sel = null;
      if (!A.queue.length && A.view && A.view.state && A.view.state.gid === A.shown.gid && A.view.state.turn === A.shown.turn) A.shown = A.view.state;
      renderLive();
      saveSolo();
      if (A.shown.ph === 'over') showResult(A.shown);
      pump();
    });
  }

  /* ---------- the reveal ---------- */
  async function animate(prev, ev, next) {
    var st = ev.steps || [], i, k;
    var ore = ev.ore0.slice(), pool = prev.pool, cart = $('cart');
    var ani = function (p) { return prev.P[p].ani; };
    var setO = function (p, n) { ore[p] = n; setOre(p, n); };
    $('caption').textContent = '';
    ev.picks.forEach(function (p, i) { if (p) setSlot(i, 'down'); });
    banner('せーの！', D(700)); SFX.flip();
    await sleep(D(420));
    ev.picks.forEach(function (p, i) { if (p) setSlot(i, 'up', p.a, ani(i)); });
    SFX.place();
    await sleep(D(650));
    if (ev.card.some(Boolean)) {
      ev.card.forEach(function (c, i) { if (c) stamp(i, c + '「' + spOf(ani(i)).nm + '」', 'o', D(1200)); });
      SFX.magic();
      await sleep(D(800));
    }
    var works = st.filter(function (x) { return x.k === 'work'; });
    if (works.length) {
      works.forEach(function (x) { fly(tagEl(x.p), cart, 1); pool += 1; });
      await sleep(D(520)); setPool(pool, true); await sleep(D(280));
    }
    var caughtAny = false;
    for (k = 0; k < st.length; k++) {
      var x = st[k];
      if (x.k === 'steal') {
        SFX.steal();
        x.ps.forEach(function (p) { stamp(p, x.ps.length > 1 ? '山分け！' : '持ち逃げ！', 's'); setFace(p, ani(p), 'sly'); });
        ev.picks.forEach(function (pk, p) { if (pk && E.kindOf(ani(p), pk.a) === 'w') setFace(p, ani(p), 'oops'); });
        await sleep(D(500));
        x.ps.forEach(function (p) { fly(cart, tagEl(p), x.each); });
        await sleep(D(560));
        x.ps.forEach(function (p) { setO(p, ore[p] + x.each); pop(p, x.each); });
        pool = x.rem; setPool(pool, true);
        await sleep(D(800));
      } else if (x.k === 'caught') {
        if (!caughtAny) SFX.caught();
        caughtAny = true;
        x.by.forEach(function (g) { var el = tagEl(g); el.classList.add('hl'); setTimeout(function () { el.classList.remove('hl'); }, D(1400)); });
        if (x.why === 'cover') { stamp(x.p, '身代わり！', 'o'); setFace(x.p, ani(x.p), 'sly'); }
        else { stamp(x.p, x.why === 'half' ? '半分没収' : '御用！', 's'); setFace(x.p, ani(x.p), 'oops'); }
        await sleep(D(450));
        if (x.n) { pop(x.p, -x.n); setO(x.p, ore[x.p] - x.n); }
        if (x.susp) stamp(x.p, '謹慎', 'o', D(1300));
        await sleep(D(350));
      } else if (x.k === 'split') {
        var src = st.filter(function (y) { return y.k === 'caught' && y.n; });
        x.to.forEach(function (t) { src.forEach(function (c) { fly(tagEl(c.p), tagEl(t.p), Math.max(1, Math.round(c.n / x.to.length))); }); });
        await sleep(D(600));
        x.to.forEach(function (t) { setO(t.p, ore[t.p] + t.n); pop(t.p, t.n); setFace(t.p, ani(t.p), 'proud'); });
        if (x.rem) { pool += x.rem; setPool(pool, true); }
        await sleep(D(400));
      } else if (x.k === 'wage') {
        fly(cart, tagEl(x.p), 1); pool -= 1;
        await sleep(D(300));
        setO(x.p, ore[x.p] + 1); pop(x.p, 1); setPool(pool); SFX.coin();
        stamp(x.p, '見張り代', 'g', D(1100));
      } else if (x.k === 'nowage') {
        x.ps.forEach(function (p) { stamp(p, '見張り代なし', 'g', D(1200)); });
        await sleep(D(500));
      } else if (x.k === 'sp') {
        await specialStep(x, ore, setO, function (n) { pool = n; setPool(n, true); }, function () { return pool; });
      } else if (x.k === 'leave') {
        await sleep(D(120));
        setOut(x.p, x.why); setSlot(x.p, 'none');
      } else if (x.k === 'last') {
        await sleep(D(350));
        SFX.last();
        stamp(x.p, 'ひとり占め！', 'o'); setFace(x.p, ani(x.p), 'proud');
        fly(cart, tagEl(x.p), x.n);
        await sleep(D(600));
        setO(x.p, ore[x.p] + x.n); pop(x.p, x.n); pool = 0; setPool(0, true);
        await sleep(D(800));
      } else if (x.k === 'unsusp') {
        stamp(x.p, '謹慎とけた', 'w', D(1200));
      } else if (x.k === 'win') {
        await sleep(D(250));
        stamp(x.p, '目標達成！', 'o', D(1600)); setFace(x.p, ani(x.p), 'proud');
        await sleep(D(700));
      }
    }
    $('caption').textContent = E.summary(next, ev);
    for (i = 0; i < next.P.length; i++) setOre(i, next.P[i].ore);
    setPool(next.pool);
    if (ev.over) { await sleep(D(900)); return; }
    if (ev.end) {
      await sleep(D(900));
      SFX.bell();
      banner('シーズン' + prev.season + '　おわり', D(1200));
      await sleep(D(1250));
      next.P.forEach(function (p, i) { setOut(i, ''); setFace(i, p.ani, ''); setSlot(i, 'none'); });
      banner('シーズン' + next.season + '　入坑！', D(1100));
      $('caption').textContent = next.pool ? 'プールに' + next.pool + '個が残っています' : '';
      await sleep(D(900));
    } else {
      await sleep(D(500));
      next.P.forEach(function (p, i) { if (!p.out) setFace(i, p.ani, ''); });
    }
  }
  async function specialStep(x, ore, setO, setPoolN, getPool) {
    var p = x.p, el = tagEl(p);
    if (x.no === 4 || x.no === 5) return;            // their effect already showed during the theft
    if (x.no === 3) {
      if (!x.to.length) return;
      SFX.magic();
      x.to.forEach(function (t) { fly($('cart'), tagEl(t.p), Math.min(3, t.n)); });
      await sleep(D(600));
      x.to.forEach(function (t) { setO(t.p, ore[t.p] + t.n); pop(t.p, t.n); });
      setPoolN(0);
      await sleep(D(400));
      return;
    }
    if (x.no === 6) {
      SFX.magic();
      if (x.n) { fly($('cart'), el, x.n); await sleep(D(600)); setO(p, ore[p] + x.n); pop(p, x.n); setPoolN(getPool() - x.n); }
      else stamp(p, '空振り', 'o', D(1000));
      await sleep(D(400));
      return;
    }
    // 1, 2, 7, 8: ore taken from other players
    if (!x.from || !x.from.length) { stamp(p, '空振り', 'o', D(1000)); await sleep(D(500)); return; }
    SFX.magic();
    x.from.forEach(function (f) { fly(tagEl(f.p), el, f.n); });
    await sleep(D(600));
    var tot = 0;
    x.from.forEach(function (f) { setO(f.p, ore[f.p] - f.n); pop(f.p, -f.n); tot += f.n; });
    setO(p, ore[p] + tot); pop(p, tot); setFace(p, A.shown.P[p].ani, 'sly');
    await sleep(D(500));
  }

  /* ---------- results ---------- */
  function showResult(st) {
    var order = E.ranking(st), win = st.winners[0], me = mySeat();
    SFX.win();
    var rows = order.map(function (i, r) {
      var p = st.P[i], s = p.st;
      var line = [s.stole ? '盗み成功' + s.stole : '', s.catches ? '御用' + s.catches : '', s.last ? 'ひとり占め' + s.last : '', s.caught ? 'つかまる' + s.caught : ''].filter(Boolean).join('　') || 'こつこつ労働';
      return '<div class="res-row' + (i === win ? ' win' : '') + '"><span class="rk">' + (r + 1) + '</span>' + ART.face(p.ani, i === win ? 'proud' : '') +
        '<span><b>' + esc(p.nm) + (i === me ? '（あなた）' : '') + '</b><small>' + line + '</small></span><span class="sc">' + p.ore + '</span></div>';
    }).join('');
    var btns = '';
    if (A.mode === 'solo') btns = '<button class="btn primary" id="rAgain">もう一度（同じ設定）</button><button class="btn" id="rSetup">設定を変える</button><button class="btn ghost" id="rTitle">タイトルへ</button>';
    else if (A.mode === 'host') btns = '<button class="btn primary" id="rAgain">もう一度</button><button class="btn" id="rLobby">ロビーにもどる</button><button class="btn ghost" id="rTitle">部屋を閉じる</button>';
    else btns = '<p class="note">ホストが次のゲームを始めるのを待っています。</p><button class="btn ghost" id="rTitle">退出する</button>';
    var seasons = st.season - (st.rnd === 1 ? 1 : 0);
    $('resultBody').innerHTML = '<div class="res-hero"><div class="face">' + ART.face(st.P[win].ani, 'proud') + '</div><h2>' + esc(st.P[win].nm) + 'の勝ち！</h2>' +
      '<p class="note" style="margin:0">' + (win === me ? 'おめでとう！ ジャングルの王座はあなたのものです。' : '目標の' + st.opts.target + '個に届きました。') + '　' + seasons + 'シーズン</p></div>' +
      '<div class="res-list">' + rows + '</div><div class="menu-list">' + btns + '</div>';
    var bind = function (id, fn) { var b = $(id); if (b) b.addEventListener('click', function () { SFX.tap(); $('dlgResult').close(); fn(); }); };
    bind('rAgain', function () { A.session.rematch(); });
    bind('rSetup', function () { closeSession(); openSolo(); });
    bind('rLobby', function () { A.session.backToLobby(); });
    bind('rTitle', function () { closeSession(); show('scrTitle'); refreshTitle(); });
    $('dlgResult').showModal();
  }

  /* ---------- menu, chat, rules ---------- */
  function syncSound() {
    $('btnSound').setAttribute('aria-pressed', String(!!prefs.sound));
    if (window.GEMINI_BGM) try { window.GEMINI_BGM.setEnabled(!!prefs.sound); } catch (e) {}
  }
  syncSound();
  document.addEventListener('gemini-bgm-change', syncSound);
  $('btnSound').addEventListener('click', function () { prefs.sound = !prefs.sound; savePrefs(); syncSound(); SFX.tap(); });
  $('btnMenu').addEventListener('click', function () {
    SFX.tap();
    segSet($('segSpeed'), prefs.speed); segSet($('segChat'), prefs.chat ? 'on' : 'off');
    $('mRestart').hidden = A.mode !== 'solo';
    $('mLobby').hidden = A.mode !== 'host';
    $('mQuit').textContent = A.mode === 'solo' ? 'タイトルにもどる（続きは保存されます）' : A.mode === 'host' ? '部屋を閉じてタイトルへ' : '部屋から抜ける';
    $('dlgMenu').showModal();
  });
  $('segSpeed').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () {
      prefs.speed = +b.dataset.v; savePrefs(); segSet($('segSpeed'), prefs.speed);
      if (A.session && A.session.isHost) { A.session.roundPause = Math.round(2700 / speed()); A.session.think = [Math.round(450 / speed()), Math.round(1700 / speed())]; }
    });
  });
  $('segChat').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { prefs.chat = b.dataset.v === 'on'; savePrefs(); segSet($('segChat'), b.dataset.v); }); });
  $('mRules').addEventListener('click', function () { $('dlgMenu').close(); openRules(); });
  $('mChat').addEventListener('click', function () { $('dlgMenu').close(); openChat(); });
  $('mRestart').addEventListener('click', function () { $('dlgMenu').close(); startSolo(); });
  $('mLobby').addEventListener('click', function () { $('dlgMenu').close(); if (A.mode === 'host') A.session.backToLobby(); });
  $('mQuit').addEventListener('click', function () { $('dlgMenu').close(); closeSession(); show('scrTitle'); refreshTitle(); });
  function openChat() {
    $('chatList').innerHTML = AI.HUMAN_CHAT.map(function (id) { return '<button type="button" data-id="' + id + '">' + AI.CHAT[id] + '</button>'; }).join('');
    $('chatList').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { if (A.session) A.session.chat(b.dataset.id); $('dlgChat').close(); }); });
    $('dlgChat').showModal();
  }
  (function () {   // a quick chat button next to your trolley
    var b = document.createElement('button');
    b.className = 'iconbtn'; b.id = 'btnChat'; b.setAttribute('aria-label', 'ひと言を送る'); b.title = 'ひと言を送る';
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>';
    b.addEventListener('click', function () { SFX.tap(); openChat(); });
    $('dockTop').appendChild(b);
  })();
  function openRules() {
    var TX = { w: '報酬プールに鉱石を1個入れる。シーズンに残れるのはこの札だけ', s: 'プールの鉱石を全部もらう。防衛がいたら自分の鉱石を全部没収される', g: '泥棒の鉱石を没収する。盗みがなければプールから1個' };
    var COL = { w: 'var(--work)', s: 'var(--steal)', g: 'var(--guard)' };
    $('rulesCards').innerHTML = ['w', 's', 'g'].map(function (a) {
      return '<div><b style="background:' + COL[a] + '">' + E.ACT_NAME[a] + '</b>' + ART.icon(a) + '<span style="display:block;padding:0 6px">' + TX[a] + '</span></div>';
    }).join('');
    var list = E.ANIMALS.map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) { return x.a.sp.no - y.a.sp.no; });
    $('rulesAbil').innerHTML = list.map(function (o) { return '<div>' + ART.face(o.i) + '<span><b><span class="n">' + o.a.sp.no + '</span> ' + o.a.nm + '「' + o.a.sp.nm + '」</b><br>' + o.a.sp.tx + '</span></div>'; }).join('');
    $('dlgRules').showModal();
  }

  window.addEventListener('pagehide', function () { if (A.mode === 'host' || A.mode === 'guest') try { A.session.close(); } catch (e) {} });
  if (/[?&]rules=1/.test(location.search)) openRules();
})();
