/* 宝石の煌めき — the table: setup, drawing, your turn, CPU turns (in a worker), animations, saving, records. */
(function () {
  'use strict';
  var E = window.SPL_ENG, AI = window.SPL_AI, ART = window.SPL_ART, SND = window.SPL_AUDIO, RIVALS = window.PLAYROOM_RIVAL;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = ART.esc, GEMS = ART.GEMS, CARDS = E.CARDS, NOBLES = E.NOBLES, ROMAN = ART.ROMAN;
  var TEST = new URLSearchParams(location.search).get('test') === '1';
  var LEVELS = { 1: 'よわい', 2: 'ふつう', 3: 'つよい', 4: 'かなりつよい', 5: '最強', 6: '成長する敵' };
  var LEVEL_SUB = { 1: '入門', 2: '中級', 3: '上級', 4: '約1秒の先読み', 5: '約3秒の読み合い', 6: '負けるほど強く' };
  var LEVEL_NOTES = {
    1: '目の前のことだけを見て、よく見落とします。はじめての人向け。',
    2: '筋のいい手を選びますが、ときどき迷います。',
    3: '盤面を読み、毎回いちばん良さそうな手を選びます。相手の欲しいカードも気にします。',
    4: '良さそうな手を、見えないカードを推定しながら何百回も先まで試してから選びます（1手に約1秒）。',
    5: '自分の手だけでなく、あなたの最善の返しまで読み合います。1手に数千通りの先を試して選ぶ、いちばん強いCPUです（1手に約3秒）。',
    6: '最強と同じ強さから始まり、あなたに負けるたびに作戦を学び、考える時間もふやします。'
  };
  var KEYS = { prefs: 'splendor.prefs.v1', save: 'splendor.save.v1', rec: 'splendor.records.v1' };
  var WORKER_URL = 'cpu-worker.js?v=20261031-1';
  var SPEED = { slow: 1.5, normal: 1, fast: 0.5 };

  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null');
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
    return null;
  }
  var prefs = store(KEYS.prefs) || {};
  prefs = {
    players: [2, 3, 4].indexOf(prefs.players) >= 0 ? prefs.players : 2,
    levels: Array.isArray(prefs.levels) && prefs.levels.length === 3 && prefs.levels.every(function (l) { return LEVELS[l]; }) ? prefs.levels : [3, 3, 3],
    first: ['random', 'you', 'cpu'].indexOf(prefs.first) >= 0 ? prefs.first : 'random',
    speed: SPEED[prefs.speed] ? prefs.speed : 'normal'
  };
  function savePrefs() { store(KEYS.prefs, prefs); }

  var rival = RIVALS ? RIVALS.open('splendor', { base: AI.GROW_BASE, space: AI.GROW_SPACE, boostStep: 0.25, boostMax: 2.5 }) : null;

  var M = null;          // the match on the table
  var token = 0;          // changes whenever a match starts or is left, so old timers stop

  /* ================================================================ setup */
  function renderSetup() {
    $('#heroChips').innerHTML = [0, 1, 2, 3, 4, 5].map(function (i) { return '<span>' + ART.chip(i) + '</span>'; }).join('');
    $$('#segPlayers button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === prefs.players)); });
    $$('#segFirst button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === prefs.first)); });
    $$('#segSpeed button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === prefs.speed)); });
    var rows = '';
    for (var i = 0; i < prefs.players - 1; i++) {
      rows += '<div class="cpu-row">' + (prefs.players > 2 ? '<b>CPU' + (i + 1) + '</b>' : '') + '<div class="levels" data-cpu="' + i + '">';
      for (var l = 1; l <= 6; l++) rows += '<button type="button" data-v="' + l + '" aria-pressed="' + (prefs.levels[i] === l) + '">' + LEVELS[l] + '<small>' + LEVEL_SUB[l] + '</small></button>';
      rows += '</div></div>';
    }
    $('#cpuRows').innerHTML = rows;
    var shown = prefs.levels.slice(0, prefs.players - 1);
    var last = shown[shown.length - 1];
    $('#levelNote').textContent = prefs.players === 2 ? LEVEL_NOTES[last] : shown.map(function (l, k) { return 'CPU' + (k + 1) + '：' + LEVELS[l]; }).join('　');
    var rc = $('#rivalCard');
    if (rival && shown.indexOf(6) >= 0) { rc.innerHTML = RIVALS.cardHTML(rival); RIVALS.bindCard(rc, rival, renderSetup); } else rc.innerHTML = '';
    var sv = store(KEYS.save);
    var rb = $('#resumeBtn');
    if (sv && sv.s && !sv.s.over) {
      rb.hidden = false;
      rb.textContent = '続きから（' + sv.s.n + '人・ラウンド' + (Math.floor(sv.s.turn / sv.s.n) + 1) + '）';
    } else rb.hidden = true;
    renderRecords();
    renderMusicRow();
  }
  function renderRecords() {
    var rec = store(KEYS.rec) || {}, out = '';
    for (var l = 1; l <= 6; l++) {
      var r = rec[l] || { w: 0, l: 0, d: 0 };
      out += '<div>' + LEVELS[l] + '　<b>' + r.w + '勝 ' + r.l + '敗</b>' + (r.d ? ' ' + r.d + '分' : '') + '</div>';
    }
    var m = rec.multi; if (m) out += '<div>3〜4人戦　<b>' + m.w + '勝 ' + m.l + '敗</b>' + (m.d ? ' ' + m.d + '分' : '') + '</div>';
    $('#records').innerHTML = out;
  }
  function renderMusicRow() {
    SND.tracks().then(function () {
      var t = SND.current(), st = SND.settings;
      $('#musicTitle').textContent = !st.bgm ? 'BGMなし' : t ? t.title : 'BGM';
      $('#musicSub').textContent = !st.bgm ? '効果音は' + (st.sfx ? 'あり' : 'なし') : (st.mode === 'shuffle' ? '全曲シャッフル' : '1曲をくり返す') + (t && t.games.length ? '・' + t.games.join('／') + 'の曲' : '');
    });
  }
  function bindSetup() {
    $('#segPlayers').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; prefs.players = +b.dataset.v; savePrefs(); renderSetup(); };
    $('#segFirst').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; prefs.first = b.dataset.v; savePrefs(); renderSetup(); };
    $('#segSpeed').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; prefs.speed = b.dataset.v; savePrefs(); renderSetup(); };
    $('#cpuRows').onclick = function (e) {
      var b = e.target.closest('button'), row = e.target.closest('.levels'); if (!b || !row) return;
      var i = +row.dataset.cpu, v = +b.dataset.v;
      if (prefs.players > 2 && i === 0) { for (var k = 0; k < 3; k++) if (prefs.levels[k] === prefs.levels[0]) prefs.levels[k] = v; }   // the first row moves the others that matched it
      prefs.levels[i] = v; savePrefs(); renderSetup();
    };
    $('#startBtn').onclick = function () { SND.unlock(); startMatch(); };
    $('#resumeBtn').onclick = function () { SND.unlock(); resumeMatch(); };
    $('#rulesOpen').onclick = openRules;
    $('#musicOpen').onclick = openSound;
    $('#recordsReset').onclick = function () {
      confirmSheet('対戦成績を消しますか', 'よわい〜最強と3〜4人戦の勝ち負けの記録を消します。成長する敵の記録は、その欄から消せます。', '消す', function () { store(KEYS.rec, null); renderRecords(); toast('成績を消しました'); });
    };
  }

  /* ================================================================ match lifecycle */
  function seatName(seat) {
    var p = M.seats[seat];
    if (!p.cpu) return 'あなた';
    return p.name + '（' + LEVELS[p.level] + '）';
  }
  function startMatch() {
    var n = prefs.players, seats = [{ cpu: false, name: 'あなた' }];
    for (var i = 1; i < n; i++) seats.push({ cpu: true, level: prefs.levels[i - 1], name: n === 2 ? 'CPU' : 'CPU' + i });
    var first = prefs.first === 'you' ? 0 : prefs.first === 'cpu' ? 1 : Math.floor(Math.random() * n);
    var s = E.newGame({ players: n, first: first, rng: Math.random });
    M = { s: s, seats: seats, me: 0, log: [], phase: 'idle', sel: [], at: Date.now(), last: '' };
    token++;
    showGame();
    addLog(null, (first === 0 ? 'あなた' : seatName(first)) + 'から始めます');
    save();
    dealIn().then(function () { nextTurn(); });
  }
  function resumeMatch() {
    var sv = store(KEYS.save);
    if (!sv || !sv.s) { renderSetup(); return; }
    M = { s: sv.s, seats: sv.seats, me: 0, log: sv.log || [], phase: 'idle', sel: [], at: sv.at || Date.now(), last: sv.last || '' };
    token++;
    showGame();
    nextTurn();
  }
  function save() {
    if (!M || TEST && M.noSave) return;
    if (M.s.over) { store(KEYS.save, null); return; }
    store(KEYS.save, { v: 1, s: M.s, seats: M.seats, log: M.log.slice(-60), at: M.at, last: M.last });
  }
  function showGame() {
    $('#setup').hidden = true; $('#game').hidden = false;
    SND.setActive(true);
    render(); fit();
  }
  function leaveToSetup() {
    token++;
    closeAllSheets();
    if (M) save();
    M = null;
    $('#game').hidden = true; $('#setup').hidden = false;
    renderSetup();
  }

  /* ================================================================ drawing */
  function cardFor(id) { return CARDS[id]; }
  function shortfall(p, id) { return Math.max(0, E.goldNeeded(p, id) - p.tok[5]); }
  function myTurn() { return M && M.phase === 'human'; }
  function render() {
    if (!M) return;
    renderStatus(); renderOpps(); renderNobles(); renderMarket(); renderBank(); renderMe(); renderAct();
  }
  function renderStatus() {
    var s = M.s;
    var left = (s.first - s.cur + s.n) % s.n || s.n;
    $('#roundTxt').innerHTML = s.over ? 'ゲーム終了' : s.fin ? '<span class="final">最終ラウンド・残り' + left + '手番</span>' : 'ラウンド ' + (Math.floor(s.turn / s.n) + 1);
    $('#turnTxt').textContent = s.over ? '結果' : s.cur === M.me ? 'あなたの番' : seatName(s.cur) + 'の番';
  }
  function miniCols(p, hideZero) {
    var out = '';
    for (var c = 0; c < 6; c++) {
      out += '<div data-c="' + c + '">' + (c < 5 ? '<span class="mb k' + c + (p.bon[c] ? '' : ' zero') + '">' + p.bon[c] + '</span>' : '<span class="mb" style="visibility:hidden">0</span>') +
        '<span class="mt' + (p.tok[c] ? '' : ' zero') + '">' + ART.chip(c) + '<b>' + p.tok[c] + '</b></span></div>';
    }
    return out;
  }
  function renderOpps() {
    var s = M.s, n = s.n, html = '';
    var box = $('#opps');
    box.classList.toggle('many', n > 2); box.style.setProperty('--n', n - 1);
    for (var k = 1; k < n; k++) {
      var q = (M.me + k) % n, p = s.pl[q], seat = M.seats[q];
      var rs = '';
      for (var j = 0; j < p.res.length; j++) rs += p.hid[j] ? '<i title="伏せて確保"></i>' : '<i class="open k' + CARDS[p.res[j]].color + '"></i>';
      html += '<button type="button" class="opp' + (s.cur === q && !s.over ? ' turn' : '') + '" data-seat="' + q + '" aria-label="' + esc(seatName(q) + '、' + p.pts + '点、くわしく見る') + '">' +
        '<div class="opp-left"><span class="opp-name">' + esc(n > 2 ? seat.name : seatName(q)) + '</span><span class="opp-pts">' + p.pts + '<small>点</small></span><span class="opp-lv">' + esc(LEVELS[seat.level]) + '</span></div>' +
        '<div class="mini">' + miniCols(p) + '</div>' +
        '<div class="opp-extra">' + (q === s.first ? '<span class="first">先手</span>' : '') + '<span class="rs">' + (p.res.length ? '確保' + rs : '確保なし') + '</span><span>カード' + p.nc + '</span>' +
        (p.nob.length ? '<span class="nb"><svg viewBox="0 0 100 100"><use href="#crown"/></svg>' + p.nob.length + '</span>' : '') + '</div>' +
        (M.phase === 'cpu' && s.cur === q ? '<span class="think" aria-label="考え中"><i></i><i></i><i></i></span>' : '') +
        '</button>';
    }
    box.innerHTML = html;
  }
  function renderNobles() {
    var s = M.s, me = s.pl[M.me], html = '';
    for (var i = 0; i < s.nb.length; i++) {
      var nb = NOBLES[s.nb[i]], left = 0;
      for (var c = 0; c < 5; c++) left += Math.max(0, nb.req[c] - me.bon[c]);
      html += ART.noble(nb, { attrs: ' data-noble="' + nb.id + '"', cls: left <= 1 ? 'near' : '', note: 'あと' + left, extraLabel: '。あなたはあと' + left + '枚' });
    }
    $('#nobles').innerHTML = html;
  }
  function renderMarket() {
    var s = M.s, me = s.pl[M.me], live = myTurn(), html = '';
    for (var t = 2; t >= 0; t--) {
      html += '<div class="row" data-tier="' + t + '">';
      var dl = s.dk[t].length, canRes = live && me.res.length < E.MAXRES && dl > 0;
      html += ART.back(t, { tag: 'button', cls: 'deck' + (dl ? '' : ' empty'), count: dl, attrs: ' type="button" data-deck="' + t + '"' + (dl ? '' : ' disabled'),
        label: 'レベル' + ROMAN[t] + 'の山札、残り' + dl + '枚' + (canRes ? '。タップで伏せて確保' : '') });
      for (var k = 0; k < 4; k++) {
        var i = t * 4 + k, id = s.mk[i];
        if (id < 0) { html += '<div class="slot" data-slot="' + i + '"></div>'; continue; }
        var need = shortfall(me, id), can = need === 0;
        html += ART.card(cardFor(id), { tag: 'button', cls: can ? 'can' : '', attrs: ' type="button" data-slot="' + i + '"', badge: can ? '買える' : 'あと' + need, badgeCls: can ? 'ok' : '', extraLabel: can ? '。買えます' : '。あと' + need + '個足りません' });
      }
      html += '</div>';
    }
    $('#market').innerHTML = html;
  }
  function renderBank() {
    var s = M.s, live = myTurn(), html = '';
    var counts = [0, 0, 0, 0, 0, 0]; M.sel.forEach(function (c) { counts[c]++; });
    for (var c = 0; c < 6; c++) {
      var n = s.bank[c] - counts[c];
      html += '<button type="button" class="pile' + (s.bank[c] ? '' : ' out') + (counts[c] ? ' pick' : '') + '" data-c="' + c + '"' + (!live || c === 5 ? ' disabled' : '') +
        ' aria-label="' + GEMS[c].name + '、残り' + s.bank[c] + (c === 5 ? '（確保したときにもらえます）' : '') + '">' + ART.chip(c) +
        '<span class="count">' + n + '</span>' + (counts[c] ? '<span class="sel">+' + counts[c] + '</span>' : '') + '</button>';
    }
    var b = $('#bank'); b.innerHTML = html; b.classList.toggle('live', live);
  }
  function renderMe() {
    var s = M.s, p = s.pl[M.me], live = myTurn(), html = '';
    html += '<div class="me-head"><div class="me-pts" aria-label="あなた ' + p.pts + '点' + (s.first === M.me ? '、先手' : '') + '">' + p.pts + '<small>点</small>' + (s.first === M.me ? '<span class="first">先手</span>' : '') + '</div><div class="power">';
    for (var c = 0; c < 6; c++) {
      html += '<div class="pw' + (c === 5 ? ' gold' : '') + '" data-c="' + c + '" aria-label="' + GEMS[c].name + (c < 5 ? '、ボーナス' + p.bon[c] : '') + '、トークン' + p.tok[c] + '">' +
        '<span class="bn k' + c + (p.bon[c] ? '' : ' zero') + '">' + (c < 5 ? p.bon[c] : '') + '</span>' +
        '<span class="tk' + (p.tok[c] ? '' : ' zero') + '">' + ART.chip(c) + '<b>' + p.tok[c] + '</b></span></div>';
    }
    html += '</div></div><div class="me-foot"><span class="lbl">確保</span><div class="reserved">';
    for (var j = 0; j < 3; j++) {
      var id = p.res[j];
      if (id == null) { html += '<div class="ph"></div>'; continue; }
      var need = shortfall(p, id);
      html += ART.card(cardFor(id), { tag: 'button', cls: (need ? '' : 'can') + (p.hid[j] ? ' secret' : ''), attrs: ' type="button" data-res="' + j + '"', badge: need ? 'あと' + need : '買える', badgeCls: need ? '' : 'ok', extraLabel: (p.hid[j] ? '（伏せて確保）' : '') + (need ? '。あと' + need + '個' : '。買えます') });
    }
    html += '</div>';
    html += '<div class="me-meta">' + (p.nob.length ? '<span class="me-nob"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#crown"/></svg>貴族' + p.nob.length + '</span><br>' : '') +
      'カード' + p.nc + '枚<br>トークン' + E.tokenCount(p) + '/10</div>';
    html += '</div>';
    var me = $('#me'); me.innerHTML = html; me.classList.toggle('turn', live);
  }
  function renderAct() {
    var s = M.s, act = $('#act'), html = '';
    if (s.over) {
      html = '<div class="act-msg">ゲーム終了</div><div class="act-btns"><button class="btn primary small" type="button" data-act="result">結果を見る</button></div>';
    } else if (M.phase === 'human') {
      var legal = E.legal(s);
      if (legal.length === 1 && legal[0].k === 'pass') {
        html = '<div class="act-msg">できる行動がありません<small>宝石も確保もできず、買えるカードもありません</small></div><div class="act-btns"><button class="btn primary small" type="button" data-act="pass">パス</button></div>';
      } else if (M.sel.length) {
        var err = E.check(s, { k: 'take', g: M.sel.slice() });
        var chips = M.sel.map(function (c) { return ART.chip(c); }).join('');
        html = '<div class="act-msg"><div class="act-sel">' + chips + '</div><small>' + esc(err ? hintFor(s) : '取る宝石が決まりました') + '</small></div>' +
          '<div class="act-btns"><button class="btn ghost small" type="button" data-act="clear">やめる</button><button class="btn primary small" type="button" data-act="take"' + (err ? ' disabled' : '') + '>取る</button></div>';
      } else {
        html = '<div class="act-msg">あなたの番です<small>' + (M.last ? esc(M.last) : '宝石をタップして取るか、カードをタップして買う・確保する') + '</small></div>' +
          '<div class="act-btns"><button class="btn ghost small" type="button" data-act="hint">ヒント</button></div>';
      }
    } else if (M.phase === 'cpu') {
      html = '<div class="act-msg">' + esc(seatName(s.cur)) + 'が考えています<small>' + esc(M.last || '') + '</small></div>';
    } else {
      html = '<div class="act-msg">' + esc(M.last || '') + '</div>';
    }
    act.innerHTML = html;
  }
  function hintFor(s) {
    var sel = M.sel, avail = E.colorsAvailable(s);
    if (sel.length === 1) return avail >= 3 ? 'あと2色えらぶ（同じ色をもう一度で2つ）' : '残りの色もえらぶ';
    if (sel.length === 2 && sel[0] !== sel[1]) return avail >= 3 ? 'あと1色えらぶ' : '取る宝石が決まりました';
    return '違う色を3つ、または同じ色を2つ';
  }

  /* ================================================================ layout: card size from the screen */
  var fitTimer = null;
  function setCw(cw) {
    var root = document.documentElement;
    root.style.setProperty('--cw', cw.toFixed(1) + 'px');
    root.style.setProperty('--cwm', Math.max(34, Math.min(70, cw * 0.62)).toFixed(1) + 'px');
  }
  /* height the table's content needs at the current card size (not limited by the screen) */
  function contentHeight() {
    var kids = [$('#opps'), $('.board'), $('.dock')], top = Infinity, bottom = -Infinity;
    kids.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < top) top = r.top; if (r.bottom > bottom) bottom = r.bottom; });
    var cs = getComputedStyle($('#table'));
    return bottom - top + parseFloat(cs.paddingBottom || 0);
  }
  function fit() {
    if ($('#game').hidden) return;
    var W = window.innerWidth, table = $('#table');
    var wide = W / window.innerHeight >= 1.25 && W >= 640;
    var maxByWidth = wide ? (W * 0.56 - 40) / 5.4 : (W - 24) / 5.42;
    var measure = function (cw) { setCw(cw); return contentHeight(); };
    var c1 = 50, c2 = 80, h1 = measure(c1), h2 = measure(c2), avail = table.clientHeight;
    var slope = Math.max(0.5, (h2 - h1) / (c2 - c1)), base = h1 - slope * c1;
    var cw = (avail - base - 2) / slope;
    cw = Math.max(36, Math.min(maxByWidth, 128, cw));
    var h = measure(cw);
    // the parts that stop growing (chips, panels) make the first guess slightly off: settle it
    for (var k = 0; k < 4 && cw > 36 && h > avail + 0.5; k++) { cw = Math.max(36, cw - (h - avail) / slope - 0.5); h = measure(cw); }
  }
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  /* ================================================================ your turn */
  function bindTable() {
    $('#bank').onclick = function (e) {
      var b = e.target.closest('.pile'); if (!b || b.disabled || !myTurn()) return;
      toggleGem(+b.dataset.c);
    };
    $('#market').onclick = function (e) {
      var d = e.target.closest('[data-deck]'); if (d && !d.disabled) { openDeckSheet(+d.dataset.deck); return; }
      var c = e.target.closest('[data-slot]'); if (c && c.tagName === 'BUTTON') openCardSheet({ from: 'm', i: +c.dataset.slot });
    };
    $('#me').onclick = function (e) {
      var c = e.target.closest('[data-res]'); if (c) openCardSheet({ from: 'r', i: +c.dataset.res });
    };
    $('#opps').onclick = function (e) { var o = e.target.closest('.opp'); if (o) openOppSheet(+o.dataset.seat); };
    $('#nobles').onclick = function (e) { var n = e.target.closest('.noble'); if (n) toast(n.getAttribute('aria-label').replace(/、/g, ' ')); };
    $('#act').onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      var k = b.dataset.act;
      if (k === 'clear') { M.sel = []; SND.sfx('tap'); renderBank(); renderAct(); }
      else if (k === 'take') humanAction({ k: 'take', g: M.sel.slice() });
      else if (k === 'pass') humanAction({ k: 'pass' });
      else if (k === 'result') showResult();
      else if (k === 'hint') showHint();
    };
    $('#menuBtn').onclick = openMenu;
    $('#soundBtn').onclick = openSound;
  }
  function toggleGem(c) {
    var s = M.s, sel = M.sel, avail = s.bank[c];
    if (!avail) { SND.sfx('deny'); toast(GEMS[c].name + 'は残っていません'); return; }
    if (sel.length === 1 && sel[0] === c) {
      if (avail >= 4) sel.push(c);
      else { sel.length = 0; toast('同じ色を2つ取れるのは、その色が4つ以上あるときだけです'); }
    }
    else if (sel.length === 2 && sel[0] === c && sel[1] === c) sel.length = 0;
    else if (sel.indexOf(c) >= 0) sel.splice(sel.indexOf(c), 1);
    else if (sel.length === 2 && sel[0] === sel[1]) { sel.length = 0; sel.push(c); }
    else if (sel.length < 3 && avail > 0) sel.push(c);
    else { SND.sfx('deny'); toast('一度に取れるのは違う色3つか、同じ色2つまでです'); return; }
    SND.sfx('tap');
    renderBank(); renderAct();
  }
  function showHint() {
    var t = AI.hint(E.view(M.s, M.me));
    toast('つよいCPUなら：' + describe(M.s, M.me, t.a, null, true));
  }
  function humanAction(a) {
    if (!myTurn()) return;
    var err = E.check(M.s, a);
    if (err) { SND.sfx('deny'); toast(err); return; }
    M.phase = 'busy';
    var probe = E.clone(M.s); E.act(probe, a);
    var x = E.excess(probe), my = token;
    var step = x ? askReturns(probe, x) : Promise.resolve(null);
    step.then(function (ret) {
      if (my !== token) return null;
      if (ret === false) { M.phase = 'human'; render(); return null; }      // backed out of the action
      if (ret) for (var i = 0; i < 6; i++) { probe.pl[probe.cur].tok[i] -= ret[i]; probe.bank[i] += ret[i]; }
      var el = E.eligible(probe);
      var nobStep = el.length > 1 ? askNoble(el) : Promise.resolve(el.length ? el[0] : -1);
      return nobStep.then(function (nob) {
        if (my !== token) return;
        M.sel = [];
        return applyTurn({ a: a, ret: ret, nob: nob }, M.me);
      });
    }).then(function () { if (my === token && M && M.phase !== 'human') nextTurn(); });
  }

  /* ================================================================ turns */
  function nextTurn() {
    if (!M) return;
    var s = M.s;
    if (s.over) { finishGame(); return; }
    if (s.cur === M.me) {
      M.phase = 'human'; M.sel = [];
      render();
      SND.sfx('turn');
      return;
    }
    cpuTurn();
  }
  var worker = null, workerBroken = false, pending = {}, reqId = 0;
  function getWorker() {
    if (workerBroken) return null;
    if (worker) return worker;
    try {
      worker = new Worker(WORKER_URL);
      worker.onmessage = function (e) { var d = e.data || {}; var cb = pending[d.id]; if (cb) { delete pending[d.id]; cb(d); } };
      worker.onerror = function () { workerBroken = true; worker = null; Object.keys(pending).forEach(function (k) { var cb = pending[k]; delete pending[k]; cb({ turn: null }); }); };
    } catch (e) { workerBroken = true; worker = null; }
    return worker;
  }
  function cpuExtra(level) {
    if (level === 6 && rival) return { params: Object.assign({}, rival.params), boost: rival.boost };
    return {};
  }
  function askCpu(seat) {
    var s = M.s, level = M.seats[seat].level, view = E.view(s, seat), extra = cpuExtra(level), seed = (Math.random() * 4294967296) >>> 0;
    if (TEST && M.testMs != null && AI.LEVELS[level] && AI.LEVELS[level].search) extra.ms = M.testMs;
    var budget = (AI.LEVELS[level] && AI.LEVELS[level].search ? (extra.ms || AI.LEVELS[level].search.ms * (extra.boost || 1)) : 50) + 8000;
    var local = function () {
      var o = Object.assign({}, extra); if (AI.LEVELS[level].search) o.ms = Math.min(o.ms || 700, 700);
      return AI.choose(view, level, E.mulberry32(seed), o);
    };
    var w = getWorker();
    if (!w) return new Promise(function (res) { setTimeout(function () { res(local()); }, 30); });
    return new Promise(function (res) {
      var id = ++reqId, done = false;
      var timer = setTimeout(function () { if (done) return; done = true; delete pending[id]; res(local()); }, budget);
      pending[id] = function (d) { if (done) return; done = true; clearTimeout(timer); res(d.turn || local()); };
      w.postMessage({ id: id, view: view, level: level, seed: seed, extra: extra });
    });
  }
  function cpuTurn() {
    var my = token, seat = M.s.cur, t0 = Date.now();
    M.phase = 'cpu'; render();
    var k = SPEED[prefs.speed] || 1;
    askCpu(seat).then(function (turn) {
      if (my !== token) return;
      // safety: a turn that does not fit the table is replaced by the つよい move
      try { E.play(E.clone(M.s), turn); } catch (e) { turn = AI.greedyView(M.s, AI.params(3), Math.random, 0); }
      var wait = Math.max(0, (TEST ? 0 : 520 * k) - (Date.now() - t0));
      return delay(wait).then(function () {
        if (my !== token) return;
        return preview(turn, k).then(function () { if (my === token) return applyTurn(turn, seat); });
      });
    }).then(function () { if (my === token && M) nextTurn(); });
  }
  /* show what a CPU is about to do: the gems or the card light up */
  function preview(turn, k) {
    if (TEST) return Promise.resolve();
    var a = turn.a, els = [];
    if (a.k === 'take') a.g.forEach(function (c) { var el = $('#bank .pile[data-c="' + c + '"]'); if (el) els.push(el); });
    if ((a.k === 'buy' || a.k === 'res') && a.m != null) { var el2 = $('#market [data-slot="' + a.m + '"]'); if (el2) els.push(el2); }
    if (a.k === 'res' && a.d != null) { var el3 = $('#market [data-deck="' + a.d + '"]'); if (el3) els.push(el3); }
    if (!els.length) return delay(120 * k);
    els.forEach(function (el) { el.classList.add(el.classList.contains('pile') ? 'pick' : 'lift'); });
    return delay(560 * k);
  }

  function gemList(g) {
    if (g.length === 2 && g[0] === g[1]) return GEMS[g[0]].name + '2つ';
    return g.map(function (c) { return GEMS[c].name; }).join('・');
  }
  function cardText(id) { var c = CARDS[id]; return 'レベル' + ROMAN[c.tier] + 'の' + GEMS[c.color].name + (c.pts ? '（' + c.pts + '点）' : ''); }
  function describe(s, seat, a, ret, plain) {
    var t = '';
    if (a.k === 'take') t = gemList(a.g) + 'を取る';
    else if (a.k === 'res') t = a.m != null ? cardText(s.mk[a.m]) + 'を確保' : 'レベル' + ROMAN[a.d] + 'の山札から1枚確保';
    else if (a.k === 'buy') t = cardText(a.m != null ? s.mk[a.m] : s.pl[seat].res[a.r]) + 'を買う';
    else t = 'パス';
    if (ret && ret.some(function (x) { return x; })) t += '（' + ret.map(function (x, c) { return x ? GEMS[c].name + (x > 1 ? x : '') : ''; }).filter(Boolean).join('・') + 'を返す）';
    return t;
  }
  function addLog(seat, text) { M.log.push({ seat: seat, text: text, round: Math.floor(M.s.turn / M.s.n) + 1 }); if (M.log.length > 400) M.log.shift(); }

  /* where a piece lands for a seat */
  function seatBox(seat) { return seat === M.me ? $('#me') : $('#opps .opp[data-seat="' + seat + '"]'); }
  function rectOf(el) { if (!el) return null; var r = el.getBoundingClientRect(); return r.width ? r : null; }
  function tokenSpot(seat, c) {
    if (seat === M.me) return rectOf($('#me .pw[data-c="' + c + '"] .tk'));
    return rectOf($('#opps .opp[data-seat="' + seat + '"] .mini [data-c="' + c + '"] .mt')) || rectOf(seatBox(seat));
  }
  function cardSpot(seat, color, reserved) {
    if (seat === M.me) return rectOf(reserved ? $('#me .reserved') : $('#me .pw[data-c="' + color + '"] .bn'));
    return rectOf($('#opps .opp[data-seat="' + seat + '"] .mini [data-c="' + (color == null ? 0 : color) + '"] .mb')) || rectOf(seatBox(seat));
  }
  function applyTurn(turn, seat) {
    var s = M.s, a = turn.a, k = seat === M.me ? 0.75 : (SPEED[prefs.speed] || 1);
    if (TEST) k = 0;
    // where things start
    var from = { bank: [], slot: null, deck: null, seat: [] }, i;
    for (i = 0; i < 6; i++) from.bank[i] = rectOf($('#bank .pile[data-c="' + i + '"]'));
    for (i = 0; i < 6; i++) from.seat[i] = tokenSpot(seat, i);
    if (a.m != null) from.slot = rectOf($('#market [data-slot="' + a.m + '"]'));
    if (a.k === 'res' && a.d != null) from.deck = rectOf($('#market [data-deck="' + a.d + '"]'));
    if (a.k === 'buy' && a.r != null && seat === M.me) from.slot = rectOf($('#me [data-res="' + a.r + '"]'));
    if (a.k === 'buy' && a.r != null && seat !== M.me) from.slot = rectOf(seatBox(seat));
    var nobleFrom = {}; $$('#nobles [data-noble]').forEach(function (el) { nobleFrom[el.dataset.noble] = rectOf(el); });
    var text = describe(s, seat, a, turn.ret);
    var cardId = a.k === 'buy' ? (a.m != null ? s.mk[a.m] : s.pl[seat].res[a.r]) : (a.k === 'res' && a.m != null ? s.mk[a.m] : -1);
    var r;
    try { r = E.play(s, turn); } catch (e) { toast('その手はできません：' + e.message); return Promise.resolve(); }
    var who = seat === M.me ? 'あなた' : seatName(seat);
    M.last = who + '：' + text;
    addLog(seat, text);
    if (r.fin.noble >= 0) { addLog(seat, '貴族が来訪（+3点）'); M.last += '。貴族が来訪'; }
    M.phase = 'anim';
    render();
    if (a.m != null && s.mk[a.m] >= 0) { var nc = $('#market [data-slot="' + a.m + '"]'); if (nc && !TEST) nc.classList.add('flip'); }
    var jobs = [], d = 0;
    if (a.k === 'take') {
      a.g.forEach(function (c, j) { jobs.push(flyChip(c, from.bank[c], tokenSpot(seat, c), 420 * k, j * 90 * k)); });
      SND.sfx('chip', a.g.length);
      d = a.g.length * 90 * k;
    } else if (a.k === 'res') {
      var src = a.m != null ? from.slot : from.deck;
      var art = a.m != null ? ART.card(CARDS[cardId]) : ART.back(a.d);
      jobs.push(flyCard(seat === M.me && a.m == null ? ART.back(a.d) : art, src, cardSpot(seat, null, true), 520 * k, 0));
      if (r.act.gold) jobs.push(flyChip(5, from.bank[5], tokenSpot(seat, 5), 460 * k, 120 * k));
      SND.sfx('reserve');
      d = 200 * k;
    } else if (a.k === 'buy') {
      var pay = r.act.pay;
      var j2 = 0;
      for (i = 0; i < 6; i++) for (var x = 0; x < pay[i]; x++) jobs.push(flyChip(i, from.seat[i], rectOf($('#bank .pile[data-c="' + i + '"]')), 380 * k, (j2++) * 60 * k));
      if (j2) SND.sfx('chip', Math.min(4, j2));
      jobs.push(flyCard(ART.card(CARDS[cardId]), from.slot, cardSpot(seat, CARDS[cardId].color, false), 560 * k, Math.min(j2, 4) * 60 * k));
      setTimeout(function () { SND.sfx('buy'); }, 200 * k);
      d = 300 * k;
    }
    if (turn.ret && turn.ret.some(function (v) { return v; })) {
      var j3 = 0;
      for (i = 0; i < 6; i++) for (var y = 0; y < turn.ret[i]; y++) jobs.push(flyChip(i, tokenSpot(seat, i), rectOf($('#bank .pile[data-c="' + i + '"]')), 380 * k, d + 320 * k + (j3++) * 60 * k));
    }
    if (r.fin.noble >= 0) {
      jobs.push(delay(d + 500 * k).then(function () {
        SND.sfx('noble');
        return flyNoble(r.fin.noble, nobleFrom[r.fin.noble], rectOf(seatBox(seat)), 700 * Math.max(k, 0.5));
      }));
      toast(who + 'のもとに貴族が来訪しました（+3点）');
    }
    return Promise.all(jobs).then(function () {
      if (r.fin.trigger != null) {
        SND.sfx('final');
        banner((r.fin.trigger === M.me ? 'あなた' : seatName(r.fin.trigger)) + 'が15点に到達', s.over ? '' : 'このラウンドの最後の人まで続けます');
        addLog(r.fin.trigger, '15点に到達。最終ラウンドへ');
      }
      if (r.fin.stalled) addLog(null, '12ラウンドのあいだ動きがなかったため終了');
      save();
      return delay(TEST ? 0 : (r.fin.trigger != null ? 1400 : 120) * Math.max(k, 0.6));
    });
  }

  /* ================================================================ animation helpers */
  function delay(ms) { return new Promise(function (res) { setTimeout(res, Math.max(0, ms)); }); }
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function fly(html, a, b, dur, wait, cls, size) {
    if (!a || !b || TEST || reduced.matches || dur <= 0) return Promise.resolve();
    return delay(wait).then(function () {
      var el = document.createElement('div');
      el.className = 'flyer ' + (cls || '');
      el.innerHTML = html;
      var w = size ? size[0] : a.width, h = size ? size[1] : a.height;
      el.style.width = w + 'px'; el.style.height = h + 'px';
      $('#fly').appendChild(el);
      var x0 = a.left + a.width / 2 - w / 2, y0 = a.top + a.height / 2 - h / 2, x1 = b.left + b.width / 2 - w / 2, y1 = b.top + b.height / 2 - h / 2;
      var sc = Math.max(0.35, Math.min(1, (b.width / w) || 1));
      var mid = 'translate(' + ((x0 + x1) / 2) + 'px,' + (Math.min(y0, y1) - 40) + 'px) scale(' + ((1 + sc) / 2 * 1.08) + ')';
      var anim = el.animate([
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)', opacity: 1 },
        { transform: mid, opacity: 1, offset: 0.5 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + sc + ')', opacity: 0.85 }
      ], { duration: dur, easing: 'cubic-bezier(.3,.1,.25,1)', fill: 'forwards' });
      return new Promise(function (res) { anim.onfinish = function () { el.remove(); res(); }; anim.oncancel = function () { el.remove(); res(); }; });
    });
  }
  function flyChip(c, a, b, dur, wait) { var sz = a ? Math.min(42, a.width) : 34; return fly(ART.chip(c), a, b, dur, wait, 'chipf', [sz, sz]); }
  function flyCard(html, a, b, dur, wait) {
    if (!a) return Promise.resolve();
    var wrap = '<div style="--cw:' + a.width + 'px">' + html + '</div>';
    return fly(wrap, a, b, dur, wait, '', [a.width, a.height]);
  }
  function flyNoble(id, a, b, dur) {
    if (!a) return Promise.resolve();
    return fly('<div style="--cw:' + (a.width / 0.86) + 'px">' + ART.noble(NOBLES[id]) + '</div>', a, b, dur, 0, '', [a.width, a.height]);
  }
  function dealIn() {
    if (TEST || reduced.matches) return Promise.resolve();
    var cards = $$('#market .card, #nobles .noble');
    cards.forEach(function (el, i) { el.style.animation = 'flipIn .42s cubic-bezier(.2,.8,.3,1) ' + (i * 0.035) + 's both'; });
    SND.sfx('card');
    return delay(cards.length * 35 + 420).then(function () { cards.forEach(function (el) { el.style.animation = ''; }); });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function banner(title, sub) {
    var b = document.createElement('div'); b.className = 'final-banner'; b.innerHTML = esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 1900);
  }

  /* ================================================================ sheets */
  var sheets = [];
  function openSheet(title, body, opts) {
    opts = opts || {};
    var d = document.createElement('dialog');
    d.className = 'sheet' + (opts.cls ? ' ' + opts.cls : '');
    d.setAttribute('aria-label', title);
    d.innerHTML = '<div class="sheet-in"><div class="sheet-head"><h2>' + esc(title) + '</h2>' + (opts.noClose ? '' : '<button class="icon-btn" type="button" data-close aria-label="閉じる"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>') + '</div>' + body + '</div>';
    document.body.appendChild(d);
    sheets.push(d);
    d.addEventListener('cancel', function (e) { if (opts.noClose) e.preventDefault(); });
    d.addEventListener('close', function () { var i = sheets.indexOf(d); if (i >= 0) sheets.splice(i, 1); d.remove(); if (opts.onClose) opts.onClose(d.returnValue); });
    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { d.close(''); return; }
      if (e.target === d && !opts.noClose) d.close('');
    });
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    return d;
  }
  function closeAllSheets() { sheets.slice().forEach(function (d) { try { d.close('abort'); } catch (e) { d.remove(); } }); sheets = []; }
  function confirmSheet(title, text, ok, fn) {
    var d = openSheet(title, '<p>' + esc(text) + '</p><div class="sheet-actions"><button class="btn primary" type="button" data-ok>' + esc(ok) + '</button><button class="btn ghost" type="button" data-close>やめる</button></div>');
    d.querySelector('[data-ok]').onclick = function () { d.close('ok'); fn(); };
  }

  function payHTML(p, id) {
    var c = CARDS[id], pay = E.canAfford(p, id) ? E.payment(p, id) : null, out = '';
    if (pay) {
      var any = false;
      for (var i = 0; i < 6; i++) if (pay[i]) { any = true; out += '<span>' + ART.chip(i) + GEMS[i].short + '×' + pay[i] + '</span>'; }
      return any ? '<b>支払い</b><div class="pay">' + out + '</div>' : '<b>ボーナスだけで買えます（支払いなし）</b>';
    }
    var miss = 0;
    for (var k = 0; k < 5; k++) {
      var short = c.cost[k] - p.bon[k] - p.tok[k];
      if (short > 0) { miss += short; out += '<span class="short">' + ART.chip(k) + GEMS[k].short + '×' + short + '</span>'; }
    }
    return '<b>足りない宝石</b>' + (p.tok[5] ? '（黄金' + p.tok[5] + 'で' + Math.min(p.tok[5], miss) + 'つ補える）' : '') + '<div class="pay">' + out + '</div>';
  }
  function openCardSheet(src) {
    var s = M.s, p = s.pl[M.me], id = src.from === 'm' ? s.mk[src.i] : p.res[src.i];
    if (id == null || id < 0) return;
    var c = CARDS[id], live = myTurn();
    var bonusLine = '<b>ボーナス</b>：' + GEMS[c.color].name + '（買うと、ずっと' + GEMS[c.color].name + 'が1つ安くなる）';
    var body = '<div class="card-big">' + ART.card(c) + '<div class="card-info">' + (c.pts ? '<b>' + c.pts + '点</b><br>' : '<b>0点</b><br>') + bonusLine + '<div style="margin-top:8px">' + payHTML(p, id) + '</div></div></div>';
    var buy = { k: 'buy' }, res = { k: 'res', m: src.i };
    if (src.from === 'm') buy.m = src.i; else buy.r = src.i;
    var canBuy = live && !E.check(s, buy), canRes = live && src.from === 'm' && !E.check(s, res);
    if (live) {
      body += '<div class="sheet-actions"><button class="btn primary" type="button" data-do="buy"' + (canBuy ? '' : ' disabled') + '>' + (canBuy ? 'このカードを買う' : '宝石が足りません') + '</button>';
      if (src.from === 'm') body += '<button class="btn" type="button" data-do="res"' + (canRes ? '' : ' disabled') + '>' + (canRes ? '確保する' + (s.bank[5] ? '（黄金を1つもらう）' : '（黄金は残っていません）') : '確保は3枚までです') + '</button>';
      body += '</div>';
    } else body += '<p>' + (s.over ? '' : 'あなたの番になったら、買ったり確保したりできます。') + '</p>';
    var d = openSheet(src.from === 'm' ? 'レベル' + ROMAN[c.tier] + 'のカード' : '確保したカード', body);
    $$('[data-do]', d).forEach(function (b) {
      b.onclick = function () { d.close('ok'); humanAction(b.dataset.do === 'buy' ? buy : res); };
    });
  }
  function openDeckSheet(t) {
    var s = M.s, p = s.pl[M.me], live = myTurn(), a = { k: 'res', d: t }, ok = live && !E.check(s, a);
    var body = '<div class="card-big">' + ART.back(t, { count: s.dk[t].length }) + '<div class="card-info">山札のいちばん上を、見ないまま伏せて確保します。中身はあなただけが見られます。' +
      (s.bank[5] ? '黄金を1つもらいます。' : '黄金は残っていないので、もらえません。') + '<br>残り' + s.dk[t].length + '枚</div></div>';
    if (live) body += '<div class="sheet-actions"><button class="btn primary" type="button" data-do' + (ok ? '' : ' disabled') + '>' + (ok ? '伏せて確保する' : p.res.length >= 3 ? '確保は3枚までです' : '確保できません') + '</button></div>';
    var d = openSheet('レベル' + ROMAN[t] + 'の山札', body);
    var b = $('[data-do]', d); if (b) b.onclick = function () { d.close('ok'); humanAction(a); };
  }
  function askReturns(probe, x) {
    return new Promise(function (resolve) {
      var p = probe.pl[probe.cur], ret = [0, 0, 0, 0, 0, 0], decided = false;
      var d = openSheet('トークンを' + x + '個返す', '<p>手番の終わりに持てるのは10個までです。返すトークンをタップしてください（いま取ったものでも、黄金でもかまいません）。</p><div class="ret-grid"></div><p class="ret-left"></p>' +
        '<div class="sheet-actions"><button class="btn primary" type="button" data-ok disabled>返す</button><button class="btn" type="button" data-auto>おまかせで選ぶ</button><button class="btn ghost" type="button" data-back>この行動をやめる</button></div>', {
        noClose: true, onClose: function () { if (!decided) resolve(false); }
      });
      var grid = $('.ret-grid', d);
      function draw() {
        var sum = ret.reduce(function (a, b) { return a + b; }, 0), html = '';
        for (var c = 0; c < 6; c++) {
          var left = p.tok[c] - ret[c];
          html += '<button type="button" data-c="' + c + '"' + (left > 0 && sum < x ? '' : ' disabled') + ' aria-label="' + GEMS[c].name + '、持っている' + left + '">' + ART.chip(c) + '<small>' + left + '</small>' + (ret[c] ? '<span class="minus">-' + ret[c] + '</span>' : '') + '</button>';
        }
        grid.innerHTML = html;
        $('.ret-left', d).textContent = sum < x ? 'あと' + (x - sum) + '個えらんでください' : '返すトークンが決まりました' + (sum ? '（' + ret.map(function (v, c) { return v ? GEMS[c].name + v : ''; }).filter(Boolean).join('・') + '）' : '');
        $('[data-ok]', d).disabled = sum !== x;
      }
      grid.onclick = function (e) { var b = e.target.closest('button'); if (!b || b.disabled) return; ret[+b.dataset.c]++; SND.sfx('tap'); draw(); };
      $('.ret-left', d).onclick = function () { ret = [0, 0, 0, 0, 0, 0]; draw(); };
      $('[data-auto]', d).onclick = function () { ret = AI.suggestReturns(probe, x); draw(); };
      $('[data-ok]', d).onclick = function () { decided = true; d.close('ok'); resolve(ret.slice()); };
      $('[data-back]', d).onclick = function () { decided = true; d.close('back'); resolve(false); };
      draw();
    });
  }
  function askNoble(el) {
    return new Promise(function (resolve) {
      var decided = false;
      var html = '<p>条件を満たした貴族が' + el.length + '人います。1手番に来るのは1人だけです。来てもらう貴族を選んでください（残りの貴族は、次の手番の終わりにまだ条件を満たしていれば来ます）。</p><div class="nob-pick">';
      el.forEach(function (id) { html += ART.noble(NOBLES[id], { tag: 'button', attrs: ' type="button" data-n="' + id + '"' }); });
      var d = openSheet('来てもらう貴族を選ぶ', html + '</div>', { noClose: true, onClose: function () { if (!decided) resolve(el[0]); } });
      $('.nob-pick', d).onclick = function (e) { var b = e.target.closest('[data-n]'); if (!b) return; decided = true; d.close('ok'); resolve(+b.dataset.n); };
    });
  }
  function openOppSheet(seat) {
    var s = M.s, p = s.pl[seat], body = '<div class="opp-detail">';
    body += '<p><b style="font-family:var(--f-d);font-size:28px;color:var(--laurel)">' + p.pts + '</b> 点　カード' + p.nc + '枚　トークン' + E.tokenCount(p) + '/10</p>';
    body += '<div class="owned">';
    for (var c = 0; c < 5; c++) body += '<div>' + ART.gem(c) + '<span>ボーナス ' + p.bon[c] + '</span><span>トークン ' + p.tok[c] + '</span></div>';
    body += '</div><p>黄金 ' + p.tok[5] + '</p>';
    body += '<p><b>確保したカード</b>（' + p.res.length + '/3）</p><div class="reserved">';
    for (var j = 0; j < p.res.length; j++) body += p.hid[j] ? ART.back(CARDS[p.res[j]].tier, { label: '伏せて確保したカード（レベル' + ROMAN[CARDS[p.res[j]].tier] + '）' }) : ART.card(CARDS[p.res[j]]);
    if (!p.res.length) body += '<span style="color:var(--faint);font-size:13px">なし</span>';
    body += '</div>';
    if (p.nob.length) { body += '<p><b>来訪した貴族</b></p><div class="nob-pick">'; p.nob.forEach(function (id) { body += '<div style="--cw:64px">' + ART.noble(NOBLES[id]) + '</div>'; }); body += '</div>'; }
    body += '</div>';
    openSheet(seatName(seat), body);
  }
  function openMenu() {
    var body = '<div class="sheet-actions">' +
      '<button class="btn" type="button" data-m="rules">遊び方</button>' +
      '<button class="btn" type="button" data-m="log">行動の記録</button>' +
      '<button class="btn" type="button" data-m="sound">BGMと効果音</button>' +
      '<button class="btn" type="button" data-m="leave">' + (M && !M.s.over ? '設定にもどる（続きは保存されます）' : '設定にもどる') + '</button>' +
      (M && !M.s.over ? '<button class="btn ghost" type="button" data-m="resign">この対戦をやめる</button>' : '') + '</div>';
    var d = openSheet('メニュー', body);
    $$('[data-m]', d).forEach(function (b) {
      b.onclick = function () {
        var m = b.dataset.m; d.close('ok');
        if (m === 'rules') openRules();
        else if (m === 'log') openLog();
        else if (m === 'sound') openSound();
        else if (m === 'leave') leaveToSetup();
        else if (m === 'resign') confirmSheet('この対戦をやめますか', '保存した続きも消えます。成績には数えません。', 'やめる', function () { store(KEYS.save, null); M = null; leaveToSetup(); });
      };
    });
  }
  function openRules() { openSheet('遊び方', $('#rulesTpl').innerHTML); }
  function openLog() {
    var items = M.log.slice().reverse().map(function (e) {
      return '<li><b>' + (e.seat == null ? '' : esc(e.seat === M.me ? 'あなた' : seatName(e.seat)) + '：') + '</b>' + esc(e.text) + ' <small style="color:var(--faint)">R' + e.round + '</small></li>';
    }).join('');
    openSheet('行動の記録', '<ul class="log-list">' + (items || '<li>まだありません</li>') + '</ul>');
  }
  function fmtTime(sec) { sec = Math.round(sec || 0); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
  function openSound() {
    var d = openSheet('BGMと効果音', '<div class="switch-row"><span>BGM</span><div class="seg" style="width:180px"><button type="button" data-bgm="1">流す</button><button type="button" data-bgm="0">なし</button></div></div>' +
      '<div class="switch-row"><span>流し方</span><div class="seg" style="width:240px"><button type="button" data-mode="one">1曲をくり返す</button><button type="button" data-mode="shuffle">全曲シャッフル</button></div></div>' +
      '<label class="slider"><span>BGMの音量</span><input type="range" min="0" max="1" step="0.01" data-vol="bgmVol"><output></output></label>' +
      '<p class="track-head" style="margin:12px 0 4px"><b>曲</b>（PLAYROOMの全曲）</p><ul class="track-list" role="list"></ul>' +
      '<div class="switch-row" style="margin-top:14px"><span>効果音</span><div class="seg" style="width:180px"><button type="button" data-sfx="1">あり</button><button type="button" data-sfx="0">なし</button></div></div>' +
      '<label class="slider"><span>効果音の音量</span><input type="range" min="0" max="1" step="0.01" data-vol="sfxVol"><output></output></label>', { onClose: renderMusicRow });
    function draw() {
      var st = SND.settings;
      $$('[data-bgm]', d).forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.bgm === '1') === st.bgm)); });
      $$('[data-mode]', d).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)); });
      $$('[data-sfx]', d).forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.sfx === '1') === st.sfx)); });
      $$('[data-vol]', d).forEach(function (r) { r.value = st[r.dataset.vol]; r.nextElementSibling.textContent = Math.round(st[r.dataset.vol] * 100) + '%'; });
      SND.tracks().then(function (list) {
        var cur = SND.current();
        $('.track-list', d).innerHTML = list.length ? list.map(function (t) {
          return '<li><button type="button" data-track="' + esc(t.id) + '" aria-pressed="' + (cur && cur.id === t.id) + '"><span class="dot"></span><span><b>' + esc(t.title) + '</b><small>' + esc((t.games.length ? t.games.join('／') + '｜' : '') + t.style) + '</small></span><span class="tm">' + fmtTime(t.duration) + '</span></button></li>';
        }).join('') : '<li style="color:var(--faint)">曲の一覧を読み込めませんでした</li>';
        $('.track-head', d).innerHTML = '<b>曲</b>（PLAYROOMの全' + list.length + '曲）';
      });
    }
    d.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.bgm) SND.update({ bgm: b.dataset.bgm === '1' });
      else if (b.dataset.mode) SND.update({ mode: b.dataset.mode });
      else if (b.dataset.sfx) { SND.update({ sfx: b.dataset.sfx === '1' }); SND.sfx('chip', 2); }
      else if (b.dataset.track) { SND.unlock(); SND.update({ bgm: true }); SND.choose(b.dataset.track); }
      else return;
      draw();
    });
    d.addEventListener('input', function (e) { var r = e.target.closest('[data-vol]'); if (!r) return; var p = {}; p[r.dataset.vol] = +r.value; SND.update(p); r.nextElementSibling.textContent = Math.round(r.value * 100) + '%'; if (r.dataset.vol === 'sfxVol') SND.sfx('tap'); });
    draw();
  }

  /* ================================================================ end of game */
  function finishGame() {
    var s = M.s;
    if (M.phase === 'over') { render(); return; }
    M.phase = 'over';
    store(KEYS.save, null);
    var res = E.result(s), meWin = res.winners.indexOf(M.me) >= 0, outcome = !meWin ? 'l' : res.winners.length > 1 ? 'd' : 'w';
    M.outcome = outcome; M.res = res;
    // records: 2 players by level, 3-4 players together
    var rec = store(KEYS.rec) || {}, key = s.n === 2 ? M.seats[1].level : 'multi';
    var r = rec[key] || { w: 0, l: 0, d: 0 }; r[outcome]++; rec[key] = r; store(KEYS.rec, rec);
    render();
    SND.sfx(outcome === 'w' ? 'win' : outcome === 'd' ? 'final' : 'lose');
    if (s.n === 2 && M.seats[1].level === 6 && rival && !M.rivalDone) {
      M.rivalDone = true;
      if (rival.result(outcome === 'w' ? 'you' : outcome === 'l' ? 'cpu' : 'draw')) {
        showResult(function () { RIVALS.learn(rival, RIVALS.workerTune(WORKER_URL), { timeMs: 16000, tune: { minPairs: 6, maxPairs: 40 } }); });
        return;
      }
    }
    showResult();
  }
  function showResult(after) {
    var s = M.s, res = M.res || E.result(s), out = M.outcome;
    var title = out === 'w' ? 'あなたの勝ち' : out === 'd' ? '同率1位' : seatName(res.winners[0]) + 'の勝ち';
    var list = res.order.map(function (o) {
      return '<li class="' + (o.rank === 1 ? 'win' : '') + '"><span class="rk">' + o.rank + '</span><span class="nm">' + esc(o.seat === M.me ? 'あなた' : seatName(o.seat)) + '</span><span class="sc">' + o.pts + '<small>点・カード' + o.nc + '</small></span></li>';
    }).join('');
    var tie = res.order.length > 1 && res.order[0].pts === res.order[1].pts && res.order[0].nc !== res.order[1].nc ? '<p>同点のため、買ったカードが少ないほうが上位です。</p>' : '';
    var stalled = s.stalled ? '<p>12ラウンドのあいだ動きがなかったため、そこで終了しました。</p>' : '';
    var next = '';
    if (s.n === 2 && out === 'w' && M.seats[1].level < 5) next = '<p>次は「' + LEVELS[M.seats[1].level + 1] + '」に挑戦してみませんか。</p>';
    var recLine = '';
    if (s.n === 2) { var rr = (store(KEYS.rec) || {})[M.seats[1].level] || { w: 0, l: 0, d: 0 }; recLine = '<p>' + LEVELS[M.seats[1].level] + 'との成績：' + rr.w + '勝 ' + rr.l + '敗' + (rr.d ? ' ' + rr.d + '分' : '') + '</p>'; }
    if (s.n === 2 && M.seats[1].level === 6 && rival) recLine = '<p>' + esc(RIVALS.recordText(rival)) + '</p>';
    var body = '<ol class="result-list">' + list + '</ol>' + tie + stalled + recLine + next +
      '<div class="sheet-actions">' + (next ? '<button class="btn primary" type="button" data-r="up">「' + LEVELS[M.seats[1].level + 1] + '」と対戦する</button>' : '') +
      '<button class="btn' + (next ? '' : ' primary') + '" type="button" data-r="again">同じ設定でもう一度</button>' +
      '<button class="btn" type="button" data-r="setup">設定にもどる</button><button class="btn ghost" type="button" data-close>盤面を見る</button></div>';
    var d = openSheet(title, body, { onClose: function () { if (after) { var f = after; after = null; f(); } } });
    $$('[data-r]', d).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.r; d.close('ok');
        if (k === 'up') { prefs.levels[0] = M.seats[1].level + 1; savePrefs(); startMatch(); }
        else if (k === 'again') startMatch();
        else leaveToSetup();
      };
    });
  }

  /* ================================================================ boot */
  document.getElementById('sprite').innerHTML = ART.sprite();
  bindSetup(); bindTable();
  renderSetup();
  SND.tracks().then(renderMusicRow);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) fit(); });

  // hooks for automated checks (?test=1): no animations, CPU budget override, direct access
  if (TEST) window.SPL_TEST = {
    get M() { return M; }, E: E, AI: AI,
    start: function (o) { o = o || {}; if (o.players) prefs.players = o.players; if (o.levels) prefs.levels = o.levels; if (o.first) prefs.first = o.first; startMatch(); if (o.ms != null) M.testMs = o.ms; },
    act: humanAction, render: render, fit: fit, leave: leaveToSetup, finish: finishGame
  };
})();
