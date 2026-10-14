/* ×ing／バッティング (browser edition): screens, input and the reveal animation. */
(function (G) {
  'use strict';
  var E = G.XING_ENG, NET = G.XING_NET, SC = G.XING_SCENE;
  var $ = function (id) { return document.getElementById(id); };
  var CK = ['b', 'y', 'r', 'w'], CN = ['青', '黄', '赤', '白'];
  var PCOL = SC ? SC.PCOL : ['#ff8a5c', '#2ec4b6', '#b18cff', '#a5d84e', '#ff73b9', '#56cdf5'];

  /* ---------- small utils ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('xing.' + k); localStorage.setItem('xing.' + k, v); } catch (e) { return null; } }
  function tabId() {
    var id = null;
    try { id = sessionStorage.getItem('xing.cid'); } catch (e) {}
    if (!id) { id = 'u' + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem('xing.cid', id); } catch (e) {} }
    return id;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function gi(k) { return '<i class="gi ' + CK[k] + '"></i>'; }
  function gemsHTML(ids) {
    var c = E.counts(ids), h = '';
    c.forEach(function (n, k) { if (n) h += '<span class="gc">' + gi(k) + n + '</span>'; });
    return h || '<span class="none">なし</span>';
  }
  function countsText(ids) { var c = E.counts(ids), out = []; c.forEach(function (n, k) { if (n) out.push(CN[k] + n); }); return out.join('・') || 'なし'; }

  /* ---------- app state ---------- */
  var params = new URLSearchParams(G.location ? G.location.search : '');
  if (params.get('peerhost')) G.XING_PEER_OPTS = { host: params.get('peerhost'), port: +(params.get('peerport') || 9000), path: params.get('peerpath') || '/', secure: params.get('peersecure') === '1' };
  var App = G.XING_APP = {
    scene: null, session: null, mode: 'title', view: null, shown: null, busy: false, queue: [],
    me: { cid: tabId(), nm: store('name') || '' },
    ui: { sel: {}, hand: -1, deal: null, key: '' },
    hist: [], resultShown: '', proof: null,
    set: { sound: store('sound') !== 'off', quality: store('quality') || 'high', speed: +(store('speed') || 1) }
  };

  /* ---------- sound (synthesized after the first touch) ---------- */
  var actx = null, master = null;
  function audio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return actx; }
    var AC = G.AudioContext || G.webkitAudioContext; if (!AC) return null;
    try { actx = new AC(); master = actx.createGain(); master.gain.value = 0.7; master.connect(actx.destination); } catch (e) { actx = null; }
    return actx;
  }
  function tone(freq, dur, type, vol, when, slide) {
    if (!App.set.sound || !actx) return;
    var t = actx.currentTime + (when || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, freq, vol, when) {
    if (!App.set.sound || !actx) return;
    var t = actx.currentTime + (when || 0), len = Math.floor(actx.sampleRate * dur), b = actx.createBuffer(1, len, actx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol || 0.4;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  var SFX = {
    tick: function () { noise(0.05, 3400, 0.3); },
    lock: function () { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.16, 'triangle', 0.08, 0.07); },
    go: function () { noise(0.35, 900, 0.35); tone(330, 0.3, 'sawtooth', 0.04, 0, 660); },
    gain: function () { [1318, 1568, 2093].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.07, i * 0.06); }); },
    steal: function () { tone(880, 0.3, 'triangle', 0.08, 0, 330); noise(0.2, 2600, 0.25, 0.05); },
    clash: function () { tone(140, 0.32, 'square', 0.07, 0, 90); noise(0.18, 600, 0.4); },
    shield: function () { [523, 784, 1046].forEach(function (f, i) { tone(f, 0.5, 'sine', 0.05, i * 0.03); }); },
    drop: function () { for (var i = 0; i < 4; i++) tone(1800 + Math.random() * 900, 0.06, 'sine', 0.04, i * 0.07); },
    final: function () { [392, 494, 587].forEach(function (f, i) { tone(f, 0.35, 'triangle', 0.08, i * 0.12); }); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i === 4 ? 0.6 : 0.3, 'triangle', 0.1, i * 0.12); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.32, 'triangle', 0.08, i * 0.16); }); }
  };
  function sfx(k) { try { SFX[k](); } catch (e) {} }

  /* ---------- toasts / stamp / modal ---------- */
  function toast(html) {
    var box = $('toasts'), d = document.createElement('div');
    d.className = 'toast'; d.innerHTML = html; box.appendChild(d);
    while (box.children.length > 2) box.removeChild(box.firstChild);
    setTimeout(function () { d.classList.add('bye'); setTimeout(function () { d.remove(); }, 320); }, 3000);
  }
  function stamp(text, cls, sub) {
    var s = $('stamp'); s.className = ''; void s.offsetWidth;
    s.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : ''); s.className = 'show ' + cls;
  }
  function openLayer(html, cls, onClose) {
    var layer = $('layer');
    layer.innerHTML = '<div class="scrim ' + (cls || '') + '" id="scrim"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var scrim = $('scrim');
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeLayer(); });
    layer.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeLayer); });
    App.layerClose = onClose || null;
    var f = layer.querySelector('[data-close]'); if (f) f.focus({ preventScroll: true });
  }
  function closeLayer() { $('layer').innerHTML = ''; var f = App.layerClose; App.layerClose = null; if (f) f(); }
  function sheetHead(title) { return '<div class="sheet-h"><h3>' + title + '</h3><button class="iconbtn" data-close aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('layer').innerHTML) closeLayer(); });

  /* ---------- screens ---------- */
  function show(id) {
    ['scrTitle', 'scrSolo', 'scrOnline', 'scrLobby'].forEach(function (s) { $(s).hidden = s !== id; });
    var inGame = !id;
    $('topbar').hidden = !inGame; $('actionbar').hidden = !inGame; $('chart').hidden = !inGame;
    $('app').classList.toggle('nochart', !inGame);
    if (!inGame) { $('tags').innerHTML = ''; App.tagEls = null; $('zoomReset').hidden = true; }
    reserve();
    if (App.scene) requestAnimationFrame(function () { App.scene.resize(); });
  }
  function narrow() { return G.innerWidth <= 640 || G.innerHeight <= 500; }
  function reserve() { if (App.scene) App.scene.reserve = App.mode === 'title' ? { top: 6, bottom: 6, left: 6, right: 6 } : narrow() ? { top: 30, bottom: 26, left: 6, right: 6 } : { top: 34, bottom: 30, left: 14, right: 14 }; }
  function segValue(id) { var b = $(id).querySelector('[aria-pressed="true"]'); return b ? +b.dataset.v : 0; }
  function segInit(id, onChange) {
    $(id).querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { $(id).querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); if (onChange) onChange(+b.dataset.v); });
    });
  }
  function segSet(id, v) { $(id).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === +v)); }); }

  /* ---------- the title table: CPUs mid-game ---------- */
  function demoState() {
    var rng = E.mulberry32(20261014);
    var s = E.newGame([0, 1, 2, 3].map(function (i) { return { id: 'd' + i, nm: NET.CPU_NAMES[i], cpu: 2 }; }), { seed: 4242, now: 0, gid: 'demo', dealer: 0 });
    for (var r = 0; r < 4 && s.ph === 'pick'; r++) {
      var v = E.publicView(s), picks = s.A.map(function () { return null; });
      for (var p = 0; p < 4; p++) { var d = E.cpuDecide(v, p, 2, rng); Object.keys(d).forEach(function (a) { picks[a] = d[a]; }); }
      E.resolveRound(s, picks);
      while (s.ph === 'deal') E.dealPlace(s, s.dealer, s.deal.legal[0]);
    }
    return E.publicView(s);
  }
  function toTitle() {
    if (App.session) { try { App.session.close(); } catch (e) {} }
    App.session = null; App.mode = 'title'; App.view = null; App.shown = null; App.queue = []; App.busy = false;
    App.ui = { sel: {}, hand: -1, deal: null, key: '' };
    closeLayer(); show('scrTitle');
    $('stamp').className = ''; $('stamp').textContent = '';
    App.scene.attract = true; App.scene.setHighlight([], {});
    App.scene.clearArcs();
    App.scene.setView(demoState(), -1, { instant: true });
    App.scene.fitCamera();
  }

  /* ---------- sessions ---------- */
  function mySeat() { return App.session ? App.session.mySeat() : -1; }
  function myPicks() { return App.session && App.session.myPicks ? App.session.myPicks() : {}; }
  function onView(v) {
    App.view = v;
    if (!v) return;
    if (v.lobby) { renderLobby(v); return; }
    if (!v.state) return;
    if (!$('scrLobby').hidden || !$('scrTitle').hidden || !$('scrOnline').hidden || !$('scrSolo').hidden) {
      show(null); App.scene.attract = false; App.scene.resetCam();
    }
    App.queue.push(v);
    pump();
  }
  function startSolo() {
    audio();
    var nm = NET.cleanName($('soloName').value || 'あなた'); App.me.nm = nm; store('name', nm);
    var cnt = segValue('segCount') || 4, lv = segValue('segLevel') || 2;
    store('soloCount', cnt); store('soloLevel', lv);
    var hs = new NET.HostSession({ me: App.me, onView: onView, onEvent: hostEvent });
    hs.speed = App.set.speed;
    for (var i = 1; i < cnt; i++) hs.addCpu(lv);
    App.session = hs; App.mode = 'solo'; App.resultShown = ''; App.hist = []; App.shown = null; App.queue = [];
    reserve();
    var seed = params.get('seed');
    hs.start(seed ? { seed: +seed } : undefined);
  }
  function onlineErr(e) {
    var code = e && e.code, msg = {
      notfound: 'その部屋が見つかりません。コードを確認してください。',
      taken: '部屋をつくれませんでした。もう一度ためしてください。',
      lib: '通信ライブラリを読みこめませんでした。電波のよい場所でためしてください。',
      net: '通信サーバーにつながりませんでした。少し待ってからためしてください。'
    }[code] || '接続できませんでした。もう一度ためしてください。';
    $('onErr').textContent = msg; $('onErr').hidden = false;
  }
  function busyBtns(b) { $('onCreate').disabled = b; $('onJoin').disabled = b; }
  async function createRoom() {
    audio();
    var nm = NET.cleanName($('onName').value || 'ホスト'); App.me.nm = nm; store('name', nm);
    $('onErr').hidden = true; busyBtns(true); $('onNote').textContent = '部屋をつくっています…';
    try {
      var tr = new NET.PeerTransport(), code = null;
      for (var tries = 0; tries < 4; tries++) {
        var c = String(Math.floor(1000 + Math.random() * 9000));
        try { await tr.hostOpen(c); code = c; break; } catch (e) { if (!e || e.code !== 'taken') throw e; }
      }
      if (!code) throw { code: 'taken' };
      var hs = new NET.HostSession({ me: App.me, transport: tr, code: code, onView: onView, onEvent: hostEvent });
      hs.speed = App.set.speed;
      App.session = hs; App.mode = 'host'; App.resultShown = ''; App.hist = []; App.shown = null; App.queue = [];
      show('scrLobby'); hs.publish();
    } catch (e) { onlineErr(e); } finally { busyBtns(false); setOnlineNote(); }
  }
  async function joinRoom() {
    audio();
    var code = ($('onCode').value || '').replace(/\D/g, '').slice(0, 4);
    if (code.length !== 4) { $('onErr').textContent = '4けたの部屋コードを入れてください。'; $('onErr').hidden = false; return; }
    var nm = NET.cleanName($('onName').value || 'ゲスト'); App.me.nm = nm; store('name', nm);
    $('onErr').hidden = true; busyBtns(true); $('onNote').textContent = '部屋をさがしています…';
    var tr = null;
    try {
      tr = new NET.PeerTransport();
      var cs = new NET.ClientSession({ me: App.me, transport: tr, code: code, onView: onView, onClose: hostGone, onProof: function (ok) { App.proof = ok; if (!ok) toast('<b>注意</b> 選択の照合に失敗しました'); } });
      App.session = cs; App.mode = 'client'; App.resultShown = ''; App.hist = []; App.shown = null; App.queue = [];
      await tr.clientConnect(code, { cid: App.me.cid, nm: nm });
      if (!cs.v) { show('scrLobby'); renderLobby({ lobby: [], code: code }); }
    } catch (e) {
      if (tr) { try { tr.close(); } catch (x) {} }
      App.session = null; App.mode = 'title'; App.view = null;
      onlineErr(e);
    } finally { busyBtns(false); setOnlineNote(); }
  }
  function hostEvent(ev) {
    if (ev.k === 'join' && App.view && App.view.lobby) toast(esc(ev.nm) + ' が入りました');
    if (ev.k === 'left') toast(esc(ev.nm) + ' が退出しました');
    if (ev.k === 'away') toast(esc(ev.nm) + ' の通信が切れました');
    if (ev.k === 'back') toast(esc(ev.nm) + ' がもどりました');
  }
  function hostGone() {
    if (App.mode !== 'client') return;
    openLayer(sheetHead('接続が切れました') + '<div class="sheet-b"><p>ホストとの接続が切れました。ホストが部屋を閉じたか、電波が不安定になったようです。</p><button class="btn primary" id="goneOk">タイトルへ</button></div>', 'modal-mid');
    $('goneOk').addEventListener('click', function () { closeLayer(); toTitle(); });
  }
  function setOnlineNote() { $('onNote').textContent = '部屋をつくって、4けたのコードを友だちに伝えてください。同じページを開いてコードを入れると参加できます。2〜6人で遊べます（CPUを入れることもできます）。'; }

  /* ---------- lobby ---------- */
  function renderLobby(v) {
    if ($('scrLobby').hidden) show('scrLobby');
    var host = App.session && App.session.isHost;
    $('lobCode').textContent = v.code || '----';
    var seats = v.lobby || [];
    $('lobSeats').innerHTML = seats.map(function (s, i) {
      var who = s.id === App.me.cid ? 'あなた' : s.cpu ? 'CPU' : (i === 0 ? 'ホスト' : '参加者');
      var tools = '';
      if (host && s.cpu) tools += '<select data-lv="' + i + '" aria-label="CPUの強さ">' + [1, 2, 3].map(function (l) { return '<option value="' + l + '"' + (s.cpu === l ? ' selected' : '') + '>' + E.LEVELS[l].name + '</option>'; }).join('') + '</select>';
      if (host && i > 0 && s.cpu) tools += '<button class="x" data-rm="' + i + '" aria-label="外す">✕</button>';
      return '<div class="seat"><span class="dot" style="background:' + PCOL[i % PCOL.length] + '"></span><span class="nm">' + esc(s.nm) + '</span><span class="who">' + who + '</span>' + tools + '</div>';
    }).join('') || '<p class="note">接続中…</p>';
    $('lobSeats').querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { App.session.removeSeat(+b.dataset.rm); }); });
    $('lobSeats').querySelectorAll('[data-lv]').forEach(function (sel) { sel.addEventListener('change', function () { App.session.setCpuLevel(+sel.dataset.lv, +sel.value); }); });
    var n = seats.length;
    $('lobHostTools').hidden = !host || n >= NET.MAX_SEATS;
    $('lobStart').hidden = !host; $('lobStart').disabled = n < 2;
    $('lobNote').textContent = host ? (n < 2 ? '2人以上でスタートできます。CPUを入れることもできます。' : n + '人でスタートできます（最大6人）。') : 'ホストがスタートするのを待っています…';
    $('lobRule').hidden = n !== 2;
    $('lobRule').textContent = '2人のときは公式の2人用ルールです。宝石台3枚・4人分の宝石で、ひとりが左手と右手の2つの金庫を受け持ちます。得点は低いほうの手になります。';
  }

  /* ---------- displaying views: animate each revealed round in order ---------- */
  function pump() {
    if (App.busy || !App.queue.length) return;
    var v = App.queue.shift();
    while (App.queue.length && !isRoundChange(App.shown, v.state) && !isRoundChange(v.state, App.queue[0].state)) v = App.queue.shift();
    var prev = App.shown, s = v.state, me = mySeat();
    if (prev && prev.gid === s.gid && isRoundChange(prev, s)) { animateRound(prev, s, v); return; }
    var fresh = !prev || prev.gid !== s.gid;
    if (fresh) { App.hist = []; App.ui = { sel: {}, hand: -1, deal: null, key: '' }; App.scene.clearArcs(); }
    App.shown = s;
    App.scene.setView(s, me, { instant: fresh });
    if (!fresh && prev.ph === 'deal' && s.ph === 'pick') { sfx('drop'); if (s.final) { stamp('最終ラウンド', 'final', '袋の宝石がなくなりました'); sfx('final'); } }
    if (fresh) App.scene.resetCam();
    afterShow(v);
    pump();
  }
  function isRoundChange(prev, s) { return !!(prev && s && prev.gid === s.gid && s.last && s.last.rnd === prev.rnd && prev.ph === 'pick' && (s.rnd > prev.rnd || s.ph !== 'pick')); }
  function afterShow(v) {
    var s = v.state;
    renderHud();
    if (s.ph === 'over' && App.resultShown !== s.gid) {
      App.resultShown = s.gid;
      setTimeout(function () { if (App.shown && App.shown.gid === s.gid) showResult(); }, 900 / App.set.speed);
    }
  }
  function later(ms, fn) { setTimeout(fn, ms / App.set.speed); }
  function fxLabel(anchor, text, cls, delay) {
    if (!anchor) return;
    setTimeout(function () {
      var d = document.createElement('div');
      d.className = 'fx ' + cls; d.textContent = text;
      d.style.left = anchor.x + 'px'; d.style.top = anchor.y + 'px';
      $('tags').appendChild(d);
      setTimeout(function () { d.remove(); }, 2000);
    }, (delay || 0) / App.set.speed);
  }
  function animateRound(prev, s, v) {
    App.busy = true;
    var sc = App.scene, res = s.last, me = mySeat();
    App.ui.sel = {}; App.ui.deal = null;
    sc.setHighlight([], {});
    renderHud();
    logRound(prev, s);
    var anyPick = res.picks.some(Boolean);
    if (anyPick) { stamp('せーの！', 'go'); sfx('go'); sc.showArcs(prev, res.picks); }
    // 1) where everyone pointed, then what happened there
    later(anyPick ? 700 : 100, function () {
      sc.markArcs(res.out);
      var clashT = {}, blockedV = {};
      res.out.forEach(function (o, a) {
        var t = res.picks[a];
        if (o === 'clash') clashT[t] = 1;
        if (o === 'blocked') blockedV[t] = 1;
        if (o === 'barrier') { sc.barrierAt(a, false); fxLabel(sc.vaultCenter(a), 'バリア！', 'barrier'); }
        if (o === 'rest') fxLabel(sc.vaultCenter(a), '休み', 'rest');
      });
      Object.keys(clashT).forEach(function (t) { sc.clashAt(t); fxLabel(sc.targetAnchor(t), 'バッティング！', 'clash', 80); });
      Object.keys(blockedV).forEach(function (t) { var b = E.vIdx(t); sc.barrierAt(b, true); fxLabel(sc.trayCenter(b), '防いだ！', 'blocked', 260); });
      if (Object.keys(clashT).length) sfx('clash');
      if (res.out.indexOf('barrier') >= 0) later(150, function () { sfx('shield'); });
    });
    // 2) gems move from the snapshot of the moment of pointing; new gems wait in the bag
    later(anyPick ? 1500 : 200, function () {
      var hide = {}; (res.refill || []).forEach(function (r) { hide[r.g] = 1; });
      sc.setView(s, me, { hide: hide });
      var stole = false, got = false;
      res.moves.forEach(function (m) {
        var isSteal = E.vIdx(m.from) >= 0;
        if (isSteal) stole = true; else got = true;
        fxLabel(sc.vaultCenter(m.a), (isSteal ? '横取り！ ' : '獲得 ') + '+' + m.gems.length, isSteal ? 'steal' : 'gain', 420);
        later(500, function () { sc.sparkleAt(sc.targetPos('v' + m.a, 0.4), 5); });
      });
      if (got) later(380, function () { sfx('gain'); });
      if (stole) later(300, function () { sfx('steal'); });
      res.secured.forEach(function (x) { if (x.gems.length) fxLabel(sc.trayCenter(x.a), x.gems.length + '個 確保', 'barrier', 500); });
    });
    // 3) refill from the bag
    later(anyPick ? 2550 : 900, function () {
      sc.clearArcs(true);
      sc.setView(s, me);
      if ((res.refill || []).length) sfx('drop');
    });
    later(anyPick ? 3150 : 1500, function () {
      if (s.ph === 'over') { stamp('ゲーム終了', 'info'); }
      else if (res.finalNext && s.ph === 'pick') { stamp('最終ラウンド', 'final', '袋の宝石がなくなりました'); sfx('final'); }
      else if (s.ph === 'deal') { stamp('最後の1個', 'info', '宝石係が置く台を決めます'); }
      App.shown = s;
      App.busy = false;
      afterShow(v);
      pump();
    });
  }
  function logRound(prev, s) {
    var res = s.last, parts = [];
    res.picks.forEach(function (t, a) {
      var x = prev.A[a], who = x.p === mySeat() ? 'あなた' + (x.h === 'L' ? 'の左手' : x.h === 'R' ? 'の右手' : '') : E.actorName(s, a);
      var o = res.out[a], what;
      if (o === 'rest') what = '休み';
      else if (o === 'none') what = '指さしなし';
      else if (o === 'barrier') { var sec = res.secured.filter(function (x) { return x.a === a; })[0]; what = 'バリア（' + countsText(sec ? sec.gems : []) + 'を確保）'; }
      else {
        var m = res.moves.filter(function (x) { return x.a === a; })[0];
        what = E.targetName(prev, t) + ' → ' + ({ gain: '獲得（' + countsText(m ? m.gems : []) + '）', steal: '横取り（' + countsText(m ? m.gems : []) + '）', clash: 'バッティング', blocked: 'バリアで防がれた' }[o] || o);
      }
      parts.push('<b>' + esc(who) + '</b>：' + esc(what));
    });
    App.hist.push('<b>第' + res.rnd + 'ラウンド</b><br>' + parts.join('<br>') + (res.refill && res.refill.length ? '<br>補充：' + res.refill.length + '個' : '') + (res.finalNext ? '<br>袋が空になりました。次が最終ラウンドです。' : ''));
  }

  /* ---------- the HUD ---------- */
  function pickKey(s) { return s ? s.gid + ':' + s.rnd + ':' + s.ph : ''; }
  function myActors(s) { var me = mySeat(); return me >= 0 ? E.actorsOf(s, me) : []; }
  function activeMine(s) { return myActors(s).filter(function (a) { return E.isActive(s, a); }); }
  function rd() { return App.view && App.view.rd && App.shown && App.view.rd.r === App.shown.rnd && App.view.rd.g === App.shown.gid ? App.view.rd : null; }
  function committed(a) { var r = rd(); return !!(r && r.cm[a]); }
  function syncUi(s) {
    var k = pickKey(s);
    if (App.ui.key !== k) { App.ui = { sel: {}, hand: -1, deal: null, key: k }; }
    var act = activeMine(s).filter(function (a) { return !committed(a); });
    if (act.indexOf(App.ui.hand) < 0) App.ui.hand = act.length ? act[0] : -1;
    Object.keys(App.ui.sel).forEach(function (a) { if (!E.isLegal(s, +a, App.ui.sel[a]) || committed(+a)) delete App.ui.sel[a]; });
  }
  function renderHud() {
    var s = App.shown; if (!s) return;
    syncUi(s);
    var me = mySeat(), ui = App.ui, busy = App.busy;
    // round chip
    var chip = $('roundChip');
    if (s.ph === 'over') { chip.className = 'chip'; chip.innerHTML = 'ゲーム終了'; }
    else {
      chip.className = 'chip' + (s.final ? ' final' : '');
      chip.innerHTML = (s.final ? '最終ラウンド' : '第<b>' + s.rnd + '</b>ラウンド') + ' ・ 袋 <b>' + (s.bagN || 0) + '</b>';
    }
    $('roomChip').hidden = !(App.mode === 'host' || App.mode === 'client');
    $('roomChip').textContent = '部屋 ' + (App.view && App.view.code || '');
    renderChartMe(s, me);
    // action strip
    var pr = '', acts = '';
    var myP = myPicks(), r = rd();
    var waiting = r ? E.activeActors(s).filter(function (a) { return !r.cm[a]; }) : [];
    var nAct = E.activeActors(s).length;
    var hl = [], sel = {};
    if (busy) { pr = '<span class="dim">結果を確認中…</span>'; }
    else if (s.ph === 'over') { pr = 'ゲーム終了'; acts = '<button class="btn primary" id="aResult">結果を見る</button>'; }
    else if (me < 0) { pr = '観戦中 <span class="dim">（決定 ' + (nAct - waiting.length) + '/' + nAct + '）</span>'; }
    else if (s.ph === 'deal') {
      if (s.dealer === me) {
        var c = E.colorIdx(s.deal.gem);
        hl = s.deal.legal.map(function (t) { return 't' + t; });
        if (ui.deal != null) sel = { d: 't' + ui.deal };
        pr = '宝石係のあなたへ：袋の最後の宝石 ' + gi(c) + '<b>' + CN[c] + '</b> を置く宝石台をタップ <span class="dim">（まだ補充していない台から選べます）</span>';
        if (ui.deal != null) acts = '<button class="btn primary" id="aDeal">宝石台' + E.TABLE_NAMES[ui.deal] + 'に置く</button>';
      } else pr = '宝石係の <b>' + esc(s.P[s.dealer].nm) + '</b> が最後の宝石を置いています…';
    } else {
      var mine = myActors(s), act = activeMine(s), open = act.filter(function (a) { return !committed(a); });
      if (!act.length) pr = 'バリアの次のラウンドなので、今回は<b>休み</b>です <span class="dim">（決定 ' + (nAct - waiting.length) + '/' + nAct + '）</span>';
      else if (!open.length) {
        pr = '決定しました。全員がそろうまで、ほかの人の選択は見えません <span class="dim">（' + (nAct - waiting.length) + '/' + nAct + '）</span>';
        Object.keys(myP).forEach(function (a) { sel[a] = myP[a]; });
      } else {
        var two = mine.length === 2;
        hl = ui.hand >= 0 ? E.legalTargets(s, ui.hand) : [];
        Object.keys(ui.sel).forEach(function (a) { sel[a] = ui.sel[a]; });
        Object.keys(myP).forEach(function (a) { sel[a] = myP[a]; });
        var chosen = ui.hand >= 0 && ui.sel[ui.hand];
        if (!two) pr = chosen ? '<b>' + esc(targetLabel(s, ui.hand, chosen)) + '</b> を指さします' : '指さす場所をタップ <span class="dim">宝石台・ほかの人の金庫・自分の金庫（バリア）</span>';
        else pr = chosen ? '<span class="dim">両手とも選んだら「決定」</span>' : '<b>' + (s.A[ui.hand].h === 'L' ? '左手' : '右手') + '</b>で指さす場所をタップ';
        if (two) acts += mine.map(function (a) {
          var x = s.A[a], lab = x.h === 'L' ? '左手' : '右手';
          var t = myP[a] || ui.sel[a], rest = x.rest;
          var txt = rest ? '休み' : t ? shortTarget(s, a, t) : '？';
          return '<button class="hand' + (t ? ' set' : '') + '" data-hand="' + a + '" aria-pressed="' + (a === ui.hand) + '"' + (rest || committed(a) ? ' disabled' : '') + '><span class="hl">' + lab + '</span><span class="ht">' + esc(txt) + '</span></button>';
        }).join('');
        var ready = open.every(function (a) { return !!ui.sel[a]; });
        acts += '<button class="btn sm ghost" id="aList">一覧</button><button class="btn primary" id="aGo"' + (ready ? '' : ' disabled') + '>決定</button>';
      }
      if (App.session && App.session.isHost) {
        var gone = s.P.map(function (p, i) { return i; }).filter(function (i) { return s.P[i].here === false && !s.P[i].cpu && E.actorsOf(s, i).some(function (a) { return waiting.indexOf(a) >= 0; }); });
        if (gone.length) acts += '<button class="btn sm" id="aSub" data-p="' + gone[0] + '">' + esc(s.P[gone[0]].nm) + 'をCPUに交代</button>';
      }
    }
    if (s.ph === 'deal' && s.dealer !== me && App.session && App.session.isHost && s.P[s.dealer].here === false && !s.P[s.dealer].cpu) acts += '<button class="btn sm" id="aSub" data-p="' + s.dealer + '">' + esc(s.P[s.dealer].nm) + 'をCPUに交代</button>';
    $('prompt').innerHTML = pr;
    $('actions').innerHTML = acts;
    App.scene.setHighlight(busy ? [] : hl, busy ? {} : sel);
    App.marks = busy ? {} : sel;
    var b;
    if ((b = $('aResult'))) b.addEventListener('click', showResult);
    if ((b = $('aGo'))) b.addEventListener('click', commitPicks);
    if ((b = $('aList'))) b.addEventListener('click', openList);
    if ((b = $('aDeal'))) b.addEventListener('click', doDeal);
    if ((b = $('aSub'))) b.addEventListener('click', function () { App.session.replaceWithCpu(+this.dataset.p); });
    $('actions').querySelectorAll('[data-hand]').forEach(function (h) { h.addEventListener('click', function () { App.ui.hand = +h.dataset.hand; sfx('tick'); renderHud(); }); });
    renderTags();
  }
  function shortTarget(s, a, t) {
    if (t === 'v' + a) return 'バリア';
    var i = E.tIdx(t); if (i >= 0) return '台' + E.TABLE_NAMES[i];
    return E.actorName(s, E.vIdx(t)) + 'の金庫';
  }
  function targetLabel(s, a, t) {
    if (t === 'v' + a) return '自分の金庫（バリア）';
    return E.targetName(s, t);
  }
  function renderChartMe(s, me) {
    var box = $('chMe');
    // highlight how many white gems I hold in the white table
    var whites = 0;
    if (me >= 0) E.actorsOf(s, me).forEach(function (a) { whites = Math.max(whites, E.counts(s.A[a].vault.concat(s.A[a].kept))[3]); });
    $('chWhite').innerHTML = [1, 2, 3, 4, 5, 6].map(function (n) { return '<span' + (n === whites ? ' class="on"' : '') + '><i>' + n + '個</i>' + n * n + '</span>'; }).join('');
    if (me < 0) { box.hidden = true; return; }
    var ps = E.personScore(s, me), two = ps.hands.length === 2;
    var h = '<span class="lab">あなた' + (two ? '（低い手）' : '') + '</span><span class="pts"><span class="pt-sec">確定<b>' + ps.secured + '</b></span><span class="pt-all">金庫込<b>' + ps.total + '</b></span></span>';
    box.innerHTML = h; box.hidden = false;
  }

  /* ---------- labels that follow the table ---------- */
  function renderTags() {
    var s = App.shown; if (!s) return;
    var box = $('tags');
    var key = s.gid + ':' + s.A.length + ':' + s.T.length;
    if (!App.tagEls || App.tagEls.key !== key) {
      box.querySelectorAll('.tag,.ttag,.pmark').forEach(function (n) { n.remove(); });
      App.tagEls = { key: key, seats: [], tables: [], marks: {}, bag: null };
      s.A.forEach(function () { var d = document.createElement('div'); d.className = 'tag'; box.appendChild(d); App.tagEls.seats.push(d); });
      s.T.forEach(function () { var d = document.createElement('div'); d.className = 'ttag'; box.appendChild(d); App.tagEls.tables.push(d); });
      var bg = document.createElement('div'); bg.className = 'ttag tiny'; box.appendChild(bg); App.tagEls.bag = bg;
    }
    var me = mySeat(), r = rd(), busy = App.busy, nw = narrow();
    s.A.forEach(function (x, a) {
      var d = App.tagEls.seats[a], p = s.P[x.p], sc = E.actorScore(s, a);
      var hand = x.h === 'L' ? '左手' : x.h === 'R' ? '右手' : '';
      var nm = x.p === me ? (hand && nw ? hand : 'あなた' + (hand ? '・' + hand : '')) : nw && hand ? p.nm.slice(0, 4) + hand.slice(0, 1) : p.nm + (hand ? '・' + hand : '');
      var st = '';
      if (!busy && s.ph === 'pick') {
        if (x.rest) st = '<span class="st rest">休み</span>';
        else if (r && r.cm[a]) st = '<span class="st done">' + (nw ? '✓' : '決定') + '</span>';
        else if (p.here === false && !p.cpu) st = '<span class="st away">' + (nw ? '切断' : '通信切れ') + '</span>';
        else st = '<span class="st think">' + (nw ? '<i class="dots"><i></i><i></i><i></i></i>' : '考え中') + '</span>';
      }
      var h = '<div class="nmrow"><span class="av" style="background:' + PCOL[x.p % PCOL.length] + '">' + esc((p.nm || '?').slice(0, 1)) + '</span><span class="nmt">' + esc(nm) + '</span>' + st + '</div>' +
        '<div class="ptrow"><span class="pt-sec" title="バリアで確保した宝石の得点">確定<b>' + sc.secured + '</b></span><span class="pt-all" title="金庫の宝石も含めた得点（金庫の分は奪われる可能性あり）">' + (nw ? '込' : '金庫込') + '<b>' + sc.total + '</b></span></div>' +
        (s.dealer === x.p && (x.h !== 'R') ? '<span class="dealer">宝石係</span>' : '');
      if (d._h !== h) { d._h = h; d.innerHTML = h; }
      d.classList.toggle('me', x.p === me);
    });
    s.T.forEach(function (g, i) {
      var d = App.tagEls.tables[i];
      var h = '<span class="ltr">' + E.TABLE_NAMES[i] + '</span>' + gemsHTML(g);
      if (d._h !== h) { d._h = h; d.innerHTML = h; }
    });
    var bh = '袋 <b>' + (s.bagN || 0) + '</b>';
    if (App.tagEls.bag._h !== bh) { App.tagEls.bag._h = bh; App.tagEls.bag.innerHTML = bh; }
    // my own pointing marks (never anyone else's before the reveal)
    var marks = App.marks || {}, two = myActors(s).length === 2;
    Object.keys(App.tagEls.marks).forEach(function (k) { if (!marks[k]) { App.tagEls.marks[k].remove(); delete App.tagEls.marks[k]; } });
    Object.keys(marks).forEach(function (k) {
      var el = App.tagEls.marks[k];
      if (!el) { el = App.tagEls.marks[k] = document.createElement('div'); el.className = 'pmark'; box.appendChild(el); }
      var t = marks[k], txt = k === 'd' ? 'ここ' : t === 'v' + k ? 'バリア' : two ? (s.A[k].h === 'L' ? '左' : '右') : '☝';
      el.textContent = txt; el._t = t;
    });
    placeTags();
  }
  function placeTags() {
    var s = App.shown, sc = App.scene; if (!s || !App.tagEls || !sc.layout) return;
    App.tagEls.seats.forEach(function (d, a) { var p = sc.seatAnchor(a); if (!p) return; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; d.style.transform = 'translate(-50%, -50%)'; });
    App.tagEls.tables.forEach(function (d, i) { var p = sc.tableAnchor(i); if (!p) return; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; });
    var b = sc.bagAnchor(); if (b) { App.tagEls.bag.style.left = b.x + 'px'; App.tagEls.bag.style.top = (b.y - 22) + 'px'; }
    var twoOff = {};
    Object.keys(App.tagEls.marks).forEach(function (k) {
      var el = App.tagEls.marks[k], t = el._t, p = sc.targetAnchor(t); if (!p) return;
      var n = twoOff[t] = (twoOff[t] || 0) + 1;
      el.style.left = (p.x + (n - 1) * 34) + 'px'; el.style.top = (p.y - 8) + 'px';
    });
    $('zoomReset').hidden = !sc.zoomed() || App.mode === 'title';
  }

  /* ---------- input ---------- */
  function onTap(t) {
    var s = App.shown, me = mySeat();
    if (!s || App.busy || me < 0 || !t) return;
    if (s.ph === 'deal') {
      if (s.dealer !== me) return;
      var i = E.tIdx(t);
      if (i >= 0 && s.deal.legal.indexOf(i) >= 0) { App.ui.deal = i; sfx('tick'); renderHud(); }
      else toast('この台はもう補充ずみです');
      return;
    }
    if (s.ph !== 'pick') return;
    var a = App.ui.hand;
    if (a < 0) {
      if (activeMine(s).length === 0) toast('このラウンドは休みです');
      return;
    }
    if (!E.isLegal(s, a, t)) {
      var vi = E.vIdx(t), ti = E.tIdx(t);
      if (ti >= 0) toast('宝石がない台は指させません');
      else if (vi === a) toast('金庫が空なのでバリアはできません');
      else if (vi >= 0 && s.A[vi].rest) toast(esc(E.actorName(s, vi)) + 'は休み中で、金庫は空です');
      else if (vi >= 0) toast('空の金庫は指させません');
      return;
    }
    App.ui.sel[a] = t; sfx('tick');
    var open = activeMine(s).filter(function (x) { return !committed(x) && !App.ui.sel[x]; });
    if (open.length) App.ui.hand = open[0];
    renderHud();
  }
  function commitPicks() {
    var s = App.shown; if (!s || App.busy) return;
    var open = activeMine(s).filter(function (a) { return !committed(a); });
    if (!open.length || !open.every(function (a) { return !!App.ui.sel[a]; })) return;
    var sess = App.session, ok = true;
    open.forEach(function (a) {
      var r = sess.isHost ? sess.commitLocal(a, App.ui.sel[a]) : sess.commit(a, App.ui.sel[a]);
      if (!r || (!r.ok && r.err !== 'closed')) ok = false;     // 'closed' = already locked in (a double tap)
    });
    sfx('lock');
    if (!ok) toast('決定を送れませんでした。もう一度ためしてください');
    if (!sess.isHost) renderHud();
  }
  function doDeal() {
    var s = App.shown; if (!s || App.ui.deal == null) return;
    var r = App.session.isHost ? App.session.dealLocal(App.ui.deal) : App.session.deal(App.ui.deal);
    if (!r || !r.ok) toast('置けませんでした');
    sfx('tick');
  }
  function openList() {
    var s = App.shown, a = App.ui.hand; if (!s || a < 0) return;
    var L = E.legalTargets(s, a);
    var h = sheetHead((s.A[a].h ? (s.A[a].h === 'L' ? '左手' : '右手') + 'で' : '') + '指さす場所') + '<div class="sheet-b"><div class="menu-list">' + L.map(function (t) {
      var gems = E.tIdx(t) >= 0 ? s.T[E.tIdx(t)] : s.A[E.vIdx(t)].vault;
      return '<button class="btn" data-t="' + t + '">' + esc(targetLabel(s, a, t)) + '<span class="ttag" style="position:static;transform:none;margin-left:auto">' + gemsHTML(gems) + '</span></button>';
    }).join('') + '</div></div>';
    openLayer(h, 'modal-mid');
    $('layer').querySelectorAll('[data-t]').forEach(function (b) { b.addEventListener('click', function () { closeLayer(); onTap(b.dataset.t); }); });
  }

  /* ---------- result ---------- */
  function showResult() {
    var s = App.shown; if (!s || !s.result) return;
    var me = mySeat(), rows = s.result;
    var mine = rows.filter(function (r) { return r.p === me; })[0];
    var title = mine ? (mine.rank === 1 ? (rows.filter(function (r) { return r.rank === 1; }).length > 1 ? '同点で1位！' : 'あなたの勝ち！') : mine.rank + '位') : esc(rows[0].nm) + 'の勝ち';
    if (mine) sfx(mine.rank === 1 ? 'win' : 'lose');
    function bd(sc) {
      var a = sc.all;
      return '<span>' + gi(0) + a.b + '</span><span>' + gi(1) + a.y + '</span><span>' + gi(2) + a.r + '</span><span>' + gi(3) + a.w + '</span>' +
        '<span>基本' + a.base + '</span><span>3色×' + a.sets + ' +' + a.bonus + '</span><span>白 +' + a.white + '</span><span>確定' + sc.secured + '</span>';
    }
    var h = sheetHead('結果') + '<div class="sheet-b"><div class="win-title">' + title + '</div><div class="res-table">' + rows.map(function (r) {
      var ps = r.score, two = ps.hands.length === 2, body;
      if (two) body = ps.hands.map(function (hs, k) { return '<div class="bd"><b>' + (k ? '右手' : '左手') + ' ' + hs.total + '点</b>' + bd(hs) + '</div>'; }).join('') + '<div class="bd">低いほうの手（' + Math.min(ps.hands[0].total, ps.hands[1].total) + '点）が得点です。</div>';
      else body = '<div class="bd">' + bd(ps.hands[0]) + '</div>';
      return '<div class="res-row' + (r.rank === 1 ? ' win' : '') + '"><span class="rk">' + r.rank + '</span><span class="nm">' + esc(r.p === me ? 'あなた' : r.nm) + '</span><span class="tot">' + r.total + '<small>点</small></span>' + body +
        (r.sameTotal ? '<div class="bd">同点：宝石' + r.gems + '個</div>' : '') + '</div>';
    }).join('') + '</div>' +
      (rows.some(function (r) { return r.sameTotal; }) ? '<p class="note">同点のときは、獲得した宝石の数が多い人が上位です。数も同じなら同順位です。</p>' : '') +
      '<p class="note">宝石台に残った宝石は得点になりません。</p>' +
      (App.mode === 'client' && App.proof !== null ? '<p class="verify' + (App.proof ? '' : ' bad') + '">' + (App.proof ? '全員の選択を、公開前の暗号化した約束と照合しました。' : '照合できない選択がありました。') + '</p>' : '') +
      '<div class="row">' + (App.session && App.session.isHost ? '<button class="btn primary" id="rAgain">もう一度</button>' : '') + '<button class="btn" id="rTitle">タイトルへ</button></div></div>';
    openLayer(h, 'modal-mid');
    var b;
    if ((b = $('rAgain'))) b.addEventListener('click', function () { closeLayer(); App.resultShown = ''; App.session.rematch(); });
    $('rTitle').addEventListener('click', function () { closeLayer(); toTitle(); });
  }

  /* ---------- menus ---------- */
  var SOURCES = '<ul><li><a href="https://rigoler.wixsite.com/rigoler/blank-21" target="_blank" rel="noopener">リゴレ「バッティング」公式ページ</a></li><li><a href="https://www.youtube.com/watch?v=pWTmLFXJpOs" target="_blank" rel="noopener">公式の遊び方動画「バッティング(Xing)の遊び方」</a></li></ul>';
  function rulesHTML() {
    return '<h4>目的</h4><p>宝石を集め、ゲーム終了時にいちばん得点が高い人が勝ちです。</p>' +
      '<h4>準備</h4><p>宝石台は人数より1枚少なく置き、袋から2個ずつのせます。各自の前に金庫を1枚。</p>' +
      '<table><tr><th>人数</th><th>宝石台</th><th>青・黄・赤</th><th>白</th></tr><tr><td>2人</td><td>3</td><td>各12</td><td>6</td></tr><tr><td>3人</td><td>2</td><td>各9</td><td>6</td></tr><tr><td>4人</td><td>3</td><td>各12</td><td>6</td></tr><tr><td>5人</td><td>4</td><td>各15</td><td>6</td></tr><tr><td>6人</td><td>5</td><td>各18</td><td>6</td></tr></table>' +
      '<h4>ラウンド（全員同時）</h4><ol><li>全員がいっせいに1か所を指さします。この画面では選んで「決定」。全員がそろうまで、ほかの人の選択は見えません。</li>' +
      '<li><b>宝石台</b>：指したのが自分だけなら、その台の宝石を全部、自分の金庫へ。</li>' +
      '<li><b>ほかの人の金庫</b>（宝石があるとき）：自分だけなら、その金庫の宝石を全部、自分の金庫へ（横取り）。</li>' +
      '<li><b>自分の金庫＝バリア</b>（宝石があるとき）：金庫の宝石をわきに移して確保。もう取られません。その金庫を指した人は何も取れません。次のラウンドは休み（パス）で、金庫は「×」の面になります。</li>' +
      '<li>同じ場所を2人以上が指したら<b>バッティング</b>。だれも取れず、宝石はそのまま残ります。</li>' +
      '<li>移動はすべて、指さした瞬間の状態から同時に行います（おたがいの金庫を指せば入れ替わります）。</li></ol>' +
      '<h4>補充</h4><p>空の宝石台に2個ずつ、そのあと宝石が残っている台に1個ずつ、袋から置きます。全部の台に置けないときは、袋の最後の1個を、それを取り出した人（この画面では「宝石係」）が残りの台の好きな所に置きます。</p>' +
      '<h4>終了</h4><p>袋の最後の宝石を宝石台に置いたら、次のラウンドが最終ラウンドです。終わったら得点計算をします。</p>' +
      '<h4>得点</h4><p>金庫の宝石と、バリアで確保した宝石が得点になります（宝石台に残った宝石は0点）。青1点・黄2点・赤3点。青黄赤の3色1組ごとに+4点（1組で10点）。白は個数の2乗（1・4・9・16・25・36点）。同点なら、獲得した宝石の数が多い人が上位です。</p>' +
      '<h4>2人用ルール</h4><p>4人用と同じ準備をします（宝石台3枚、各色12個と白6個）。左手と右手を別のプレイヤーとして、それぞれ金庫を1つ受け持ちます。両手が同じ場所を指すとバッティングです。自分のもう一方の手の金庫を指すこともできます。バリアはその手の金庫にだけ。最後は手ごとに得点を出し、低いほうが自分の得点です。</p>' +
      '<h4>操作</h4><p>宝石台や金庫をタップして選び、「決定」。2人用では左手・右手を順に選びます。「一覧」からも選べます。ドラッグで傾き、ピンチやホイールで拡大できます。</p>' +
      '<h4>出典</h4>' + SOURCES + '<p class="note">このブラウザ版は非公式のファンメイドです。原作：篠原良英（篠原遊戯重工）／発売：リゴレ。</p>';
  }
  function openRules() { openLayer(sheetHead('あそびかた') + '<div class="sheet-b">' + rulesHTML() + '</div>'); }
  function openChart() {
    var s = App.shown, me = mySeat();
    var h = sheetHead('得点表') + '<div class="sheet-b"><div class="big-chart">' +
      gi(0) + '<span>青</span><b>1点</b>' + gi(1) + '<span>黄</span><b>2点</b>' + gi(2) + '<span>赤</span><b>3点</b>' +
      '<span class="trio">' + gi(0) + gi(1) + gi(2) + '</span><span>3色そろえると1組ごとに</span><b>+4点</b><span class="sub">1組＝1＋2＋3＋4＝10点</span>' +
      gi(3) + '<span>白は個数の2乗</span><b>n²</b></div>' +
      '<div class="wt-big">' + [1, 2, 3, 4, 5, 6].map(function (n) { return '<span><i>白' + n + '個</i><b>' + n * n + '</b></span>'; }).join('') + '</div>' +
      '<div class="ex">例：' + gi(0) + gi(0) + gi(1) + gi(1) + gi(2) + gi(3) + gi(3) + gi(3) + ' ＝ 1×2 ＋ 2×2 ＋ 3 ＋ 3色1組4 ＋ 白3個9 ＝ <b>22点</b></div>' +
      '<p class="note">得点になるのは、金庫の宝石とバリアで確保した宝石。タグの「確定」は確保した分だけ、「金庫込」は奪われる可能性がある金庫の分も足した得点です。宝石台に残った宝石は0点。同点なら宝石の数が多い人が上。</p>' +
      (s && s.np === 2 ? '<p class="note">2人用：左手と右手で別々に計算し、低いほうがあなたの得点です。</p>' : '') +
      (s && me >= 0 ? myBreakdown(s, me) : '') + '</div>';
    openLayer(h, 'modal-mid');
  }
  function myBreakdown(s, me) {
    var ps = E.personScore(s, me);
    return '<h4>いまのあなた</h4>' + ps.hands.map(function (hs, k) {
      var a = hs.all;
      return '<div class="ex">' + (ps.hands.length === 2 ? (k ? '右手' : '左手') + '：' : '') + gi(0) + a.b + ' ' + gi(1) + a.y + ' ' + gi(2) + a.r + ' ' + gi(3) + a.w + ' → 基本' + a.base + ' ＋ 3色' + a.sets + '組 ' + a.bonus + ' ＋ 白' + a.white + ' ＝ <b>' + a.total + '点</b>（うち確定 ' + hs.secured + '点）</div>';
    }).join('');
  }
  function openLog() {
    openLayer(sheetHead('できごと') + '<div class="sheet-b"><div class="logl">' + (App.hist.slice().reverse().map(function (t) { return '<div>' + t + '</div>'; }).join('') || '<p class="note">まだ何も起きていません。</p>') + '</div></div>');
  }
  function openSettings() {
    var st = App.set;
    function seg(id, opts, cur) { return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
    openLayer(sheetHead('設定') + '<div class="sheet-b">' +
      '<div class="field"><span>効果音</span>' + seg('sSound', [['on', 'あり'], ['off', 'なし']], st.sound ? 'on' : 'off') + '</div>' +
      '<div class="field"><span>画質</span>' + seg('sQual', [['high', 'きれい'], ['low', '軽い']], st.quality) + '</div>' +
      '<div class="field"><span>演出の速さ</span>' + seg('sSpeed', [['1', 'ふつう'], ['1.6', 'はやい']], st.speed) + '</div></div>');
    ['sSound', 'sQual', 'sSpeed'].forEach(function (id) {
      $(id).querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          $(id).querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          var v = b.dataset.v;
          if (id === 'sSound') { st.sound = v === 'on'; store('sound', v); renderSoundBtn(); if (st.sound) audio(); }
          if (id === 'sQual') { st.quality = v; store('quality', v); App.scene.setQuality(v); }
          if (id === 'sSpeed') { st.speed = +v; store('speed', v); App.scene.speed = st.speed; if (App.session && App.session.isHost) App.session.speed = st.speed; }
        });
      });
    });
  }
  function renderSoundBtn() { $('btnSound').classList.toggle('off', !App.set.sound); $('btnSound').setAttribute('aria-pressed', String(App.set.sound)); }
  function openMenu() {
    openLayer(sheetHead('メニュー') + '<div class="sheet-b"><div class="menu-list">' +
      '<button class="btn" id="mnRules">あそびかた</button><button class="btn" id="mnChart">得点表</button><button class="btn" id="mnLog">できごと</button>' +
      '<button class="btn" id="mnSet">設定</button><button class="btn" id="mnCam">カメラを戻す</button>' +
      '<a class="btn" href="../games/">PLAYROOMへ戻る</a><button class="btn danger" id="mnExit">タイトルへ</button></div></div>');
    $('mnRules').addEventListener('click', openRules);
    $('mnChart').addEventListener('click', openChart);
    $('mnLog').addEventListener('click', openLog);
    $('mnSet').addEventListener('click', openSettings);
    $('mnCam').addEventListener('click', function () { closeLayer(); App.scene.resetCam(); });
    $('mnExit').addEventListener('click', confirmExit);
  }
  function confirmExit() {
    var online = App.mode === 'host' || App.mode === 'client';
    openLayer(sheetHead('タイトルへ戻る') + '<div class="sheet-b"><p>' + (online ? (App.mode === 'host' ? 'ホストが抜けると、この部屋の対戦は終わります。' : '対戦から抜けます。') : 'このゲームを終了します。') + '</p><div class="row"><button class="btn ghost" data-close>やめる</button><button class="btn danger" id="exGo">タイトルへ</button></div></div>', 'modal-mid');
    $('exGo').addEventListener('click', function () { closeLayer(); toTitle(); });
  }

  /* ---------- pointer handling on the table ---------- */
  function bindStage() {
    var el = $('stage'), pts = {}, start = null, moved = false, pinch = 0;
    el.addEventListener('pointerdown', function (e) {
      audio();
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
      else if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
    });
    el.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId]; if (!p) return;
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var mx0 = (a.x + b.x) / 2, my0 = (a.y + b.y) / 2;
        p.x = e.clientX; p.y = e.clientY;
        var d = Math.hypot(a.x - b.x, a.y - b.y), mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2;
        if (pinch > 0 && !App.scene.attract) { App.scene.zoomAt(d / pinch, mx1, my1); App.scene.panBy(mx0, my0, mx1, my1); }
        pinch = d; return;
      }
      var px = p.x, py = p.y;
      if (!moved && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) moved = true;
      if (moved && !App.scene.attract) {
        if (App.scene.camZoom > 1.02) App.scene.panBy(px, py, e.clientX, e.clientY);
        else App.scene.orbit(e.clientX - px, e.clientY - py);
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    function up(e) {
      var wasTap = !moved && start && performance.now() - start.t < 700 && Object.keys(pts).length === 1;
      delete pts[e.pointerId];
      if (!Object.keys(pts).length) pinch = 0;
      if (wasTap && App.shown && App.mode !== 'title') onTap(App.scene.pick(e.clientX, e.clientY));
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function (e) { delete pts[e.pointerId]; moved = true; });
    el.addEventListener('wheel', function (e) { e.preventDefault(); if (!App.scene.attract) App.scene.zoomAt(e.deltaY > 0 ? 0.9 : 1.11, e.clientX, e.clientY); }, { passive: false });
    $('zoomReset').addEventListener('click', function () { App.scene.resetCam(true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !$('layer').innerHTML && $('aGo') && !$('aGo').disabled) commitPicks(); });
  }

  /* ---------- boot ---------- */
  function soloNote() {
    var n = segValue('segCount') || 4, cfg = E.SETUP[n];
    $('soloNote').textContent = n === 2
      ? '2人用ルール：CPUと1対1。宝石台3枚・各色12個＋白6個。あなたは左手と右手の2つの金庫を受け持ち、低いほうの手が得点です。'
      : n + '人：宝石台' + cfg.tables + '枚、青・黄・赤 各' + cfg.col + '個＋白6個。CPU ' + (n - 1) + '人と対戦します。';
  }
  function boot() {
    if (!G.THREE || !SC) throw new Error('three.js missing');
    App.scene = new SC.Scene($('stage'));
    App.scene.speed = App.set.speed;
    if (App.set.quality !== 'high') App.scene.setQuality(App.set.quality);
    App.scene.onFrame = placeTags;
    reserve();
    if (G.ResizeObserver) new ResizeObserver(function () { reserve(); App.scene.resize(); }).observe($('stage'));
    window.addEventListener('resize', function () { reserve(); App.scene.resize(); });
    bindStage();
    $('goSolo').addEventListener('click', function () {
      show('scrSolo'); $('soloName').value = App.me.nm || '';
      var c = store('soloCount'), l = store('soloLevel'); if (c) segSet('segCount', c); if (l) segSet('segLevel', l); soloNote();
    });
    $('goOnline').addEventListener('click', function () { show('scrOnline'); $('onName').value = App.me.nm || ''; $('onErr').hidden = true; setOnlineNote(); });
    $('goRules').addEventListener('click', openRules);
    document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { show('scrTitle'); }); });
    segInit('segCount', soloNote); segInit('segLevel');
    $('soloStart').addEventListener('click', startSolo);
    $('onCreate').addEventListener('click', createRoom);
    $('onJoin').addEventListener('click', joinRoom);
    $('onCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });
    $('lobAddCpu').addEventListener('click', function () { if (App.session && App.session.isHost) App.session.addCpu(2); });
    $('lobStart').addEventListener('click', function () { if (App.session && App.session.isHost) App.session.start(); });
    $('lobLeave').addEventListener('click', toTitle);
    $('btnMenu').addEventListener('click', openMenu);
    $('btnSound').addEventListener('click', function () { App.set.sound = !App.set.sound; store('sound', App.set.sound ? 'on' : 'off'); renderSoundBtn(); if (App.set.sound) { audio(); sfx('tick'); } });
    $('chartBtn').addEventListener('click', openChart);
    renderSoundBtn();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('900 40px "Zen Maru Gothic"'), document.fonts.load('700 70px "Fredoka"')]).then(function () { if (App.scene) { App.scene._tableKey = null; if (App.scene.state) App.scene.setView(App.scene.state, App.scene.mySeat, { instant: true }); } }).catch(function () {});
    toTitle();
  }
  try { boot(); }
  catch (e) {
    console.error(e);
    var d = document.createElement('p'); d.className = 'note warn';
    d.style.cssText = 'position:fixed;left:16px;right:16px;top:40%;text-align:center;z-index:99;font-size:15px';
    d.textContent = '3D表示を開始できませんでした。ブラウザを最新にするか、別の端末でお試しください。';
    document.body.appendChild(d);
  }
})(window);
