/* スレイザスパイア — interface (title, setup, unlocks, solo and online co-op play). */
(function () {
'use strict';
var STS = window.STS, V = STS.View, D = STS.DATA, SES = STS.Session;
var IB = window.IBARA || (window.IBARA = {});
var FX = IB.FX, SFX = IB.SFX;
var esc = V.esc;
var $app = document.getElementById('app');
var KEYS = { save: 'ibara.bg.save.v3', unlock: 'ibara.bg.unlock.v1', prefs: 'ibara.bg.prefs.v1', coop: 'ibara.bg.coop.v3', token: 'ibara.bg.token.v3', join: 'ibara.bg.join.v3' };
var NET_KIND = /[?&]net=local/.test(location.search) ? 'local' : 'peer';

/* ================================================================== storage */
function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sstore(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
function token() {
  var t = sload(KEYS.token);
  if (!t) { t = ''; for (var i = 0; i < 24; i++) t += 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 33)]; sstore(KEYS.token, t); }
  return t;
}
var PREF = Object.assign({ name: '', music: true, sfx: true, bgm: 'gemini' }, load(KEYS.prefs, {}));
function savePrefs() { store(KEYS.prefs, PREF); }

/* Unlock sheet: boxes per character (locks after 1 / 4 / 8 boxes), Colorless (3 boxes), Act IV (5 boxes), Ascension. */
var LOCKS = D.UNLOCK.charLocks, CHAR_FULL = LOCKS.reduce(function (a, b) { return a + b; }, 0);
function sheet() {
  var s = load(KEYS.unlock, null) || {};
  s.ch = Object.assign({ R: 0, G: 0, B: 0, W: 0 }, s.ch || {});
  s.colorless = s.colorless | 0; s.act4 = s.act4 | 0; s.asc = s.asc | 0; s.spare = s.spare | 0;
  return s;
}
function saveSheet(s) { store(KEYS.unlock, s); }
function charLevel(boxes) { var t = 0, lvl = 0; for (var i = 0; i < LOCKS.length; i++) { t += LOCKS[i]; if (boxes >= t) lvl = i + 1; } return lvl; }
function colorlessOn(s) { return s.colorless >= D.UNLOCK.colorless; }
function act4On(s) { return s.act4 >= D.UNLOCK.act4; }
function charUnlockMap(s) { var o = {}; Object.keys(s.ch).forEach(function (k) { o[k] = charLevel(s.ch[k]); }); return o; }

/* ================================================================== app state */
var A = { screen: 'title', sess: null, host: null, guest: null, me: 0, ui: {}, setup: { ch: 'R', asc: 0 }, coop: {}, evq: [] };
window.STS_APP = A;

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(A.toastT); A.toastT = setTimeout(function () { el.classList.remove('on'); }, 2600);
  sfx('error');
}
function sfx(name, k) { if (PREF.sfx && SFX && SFX.play) try { SFX.play(name, k); } catch (e) {} }
function music(scene) { if (SFX && SFX.music) try { SFX.music(PREF.music ? scene : null); } catch (e) {} }

var rafPending = false;
function render() { if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; draw(); }); }
function draw() {
  var keep = {};
  Array.prototype.forEach.call($app.querySelectorAll('[data-keep]'), function (el) { keep[el.getAttribute('data-keep')] = [el.scrollTop, el.scrollLeft]; });
  var html;
  try { html = screenHTML(); } catch (e) { console.error(e); html = '<div class="page"><h2>表示エラー</h2><p class="muted">' + esc(e && e.message) + '</p><button class="btn" data-a="title">タイトルへ</button></div>'; }
  // Keep the field being typed in (name, room code) focused with its raw text across re-renders.
  var ae = document.activeElement, typing = ae && ae.id && ae.tagName === 'INPUT' && $app.contains(ae) ? { id: ae.id, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd } : null;
  $app.innerHTML = html;
  Array.prototype.forEach.call($app.querySelectorAll('[data-keep]'), function (el) { var k = keep[el.getAttribute('data-keep')]; if (k) { el.scrollTop = k[0]; el.scrollLeft = k[1]; } });
  if (typing) {
    var f = document.getElementById(typing.id);
    if (f && f.tagName === 'INPUT') { f.value = typing.v; try { f.focus({ preventScroll: true }); f.setSelectionRange(typing.a, typing.b); } catch (e) {} }
  }
  afterDraw();
}
function screenHTML() {
  switch (A.screen) {
    case 'title': return titleHTML();
    case 'solo': return soloHTML();
    case 'coop': return coopHTML();
    case 'lobby': return lobbyHTML();
    case 'unlocks': return unlocksHTML();
    case 'rules': return rulesHTML();
    case 'game': return gameHTML();
    default: return titleHTML();
  }
}

/* ================================================================== title / setup */
function titleHTML() {
  var save = load(KEYS.save, null), coop = load(KEYS.coop, null), join = load(KEYS.join, null);
  var s = sheet();
  var h = '<div class="title"><div class="title-bg" style="background-image:url(img/title.jpg)"></div>' +
    '<div class="title-mark"><h1>スレイザスパイア</h1><div class="en">SLAY THE SPIRE · THE BOARD GAME</div>' +
    '<div class="tag">ボードゲーム版のルールで第1〜4幕</div></div><div class="title-menu">';
  if (save && save.run && save.run.phase !== 'over') h += '<button class="btn primary" data-a="resume">続きから<span class="sub">第' + save.run.act + '幕・' + esc(D.CHARS[save.run.players[0].ch].name) + '</span></button>';
  h += '<button class="btn' + (save ? '' : ' primary') + '" data-a="go" data-v="solo">ひとりで遊ぶ</button>';
  h += '<button class="btn" data-a="go" data-v="coop">オンライン協力（2〜4人）</button>';
  if (coop && coop.run && coop.run.phase !== 'over') h += '<button class="btn ghost" data-a="rehost">協力プレイを再開（ホスト・部屋 ' + esc(coop.code) + '）</button>';
  if (join && join.code) h += '<button class="btn ghost" data-a="rejoin">部屋 ' + esc(join.code) + ' に再接続</button>';
  h += '<div class="row"><button class="btn ghost grow" data-a="go" data-v="unlocks">解放状況</button><button class="btn ghost grow" data-a="go" data-v="rules">遊び方</button></div>';
  h += '<a class="btn ghost" href="../games/">ゲーム集へ戻る</a></div>';
  h += '<div class="title-foot">アセンション最大 ' + s.asc + '・無色カード ' + (colorlessOn(s) ? '解放済み' : '未解放') + '・第4幕 ' + (act4On(s) ? '解放済み' : '未解放') +
    '<br>非公式のファン作品です。カードとモンスターの絵は Mega Crit のゲーム素材を使っています（ART_CREDITS.md）。</div></div>';
  return h;
}
function charButtons(sel, taken, s) {
  return '<div class="chars">' + D.CHAR_ORDER.map(function (ch) {
    var c = D.CHARS[ch], lvl = charLevel(s.ch[ch]);
    var t = taken && taken.indexOf(ch) >= 0;
    return '<button class="charbtn' + (sel === ch ? ' on' : '') + (t ? ' taken' : '') + '" data-a="pickch" data-v="' + ch + '" style="background-image:url(' + V.selectImg(ch) + ')">' +
      '<span class="cn"><b>' + esc(c.name) + '</b><span>HP' + c.hp + '・カード解放 ' + lvl + '/3' + (t ? '・選択済み' : '') + '</span></span></button>';
  }).join('') + '</div>';
}
function ascButtons(cur, max) {
  var h = '<div class="seg">';
  for (var i = 0; i <= 13; i++) h += '<button data-a="asc" data-v="' + i + '"' + (i > max ? ' disabled' : '') + (i === cur ? ' class="on"' : '') + '>' + (i === 0 ? 'なし' : i) + '</button>';
  h += '</div>';
  if (cur > 0) h += '<div class="note" style="margin-top:6px">' + ascDesc(cur) + '</div>';
  return h;
}
function ascDesc(n) { var out = []; for (var i = 1; i <= n; i++) out.push(i + '. ' + D.ASCENSION[i].name); return esc(out.join(' / ')); }
function soloHTML() {
  var s = sheet(), st = A.setup;
  st.asc = Math.min(st.asc, s.asc);
  var c = D.CHARS[st.ch];
  return '<div class="page"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">ひとりで遊ぶ</h2></div>' +
    charButtons(st.ch, null, s) +
    '<div class="panel" style="margin-top:12px"><b>' + esc(c.name) + '</b><div class="note">' + esc(c.ability) + '</div>' +
    '<div class="note">1人プレイ：2ゴールドと「いかさまダイス」を持って始めます。カード解放レベル ' + charLevel(s.ch[st.ch]) + '（解放状況で確認）。</div></div>' +
    '<div class="field"><label>アセンション（最大 ' + s.asc + '）</label>' + ascButtons(st.asc, s.asc) + '</div>' +
    '<div class="note">無色カード：' + (colorlessOn(s) ? '使う' : '未解放') + '／第4幕：' + (act4On(s) ? '3つの鍵を集めれば挑戦できる' : '未解放') + '</div>' +
    '<div style="margin-top:16px"><button class="btn primary wide" data-a="startsolo">冒険を始める</button></div></div>';
}
function unlocksHTML() {
  var s = sheet(), edit = A.ui.editUnlock;
  function boxes(n, total, key) {
    var h = '<div class="boxes">';
    var t = 0;
    var groups = key === 'colorless' ? [D.UNLOCK.colorless] : key === 'act4' ? [D.UNLOCK.act4] : LOCKS;
    groups.forEach(function (g, gi) {
      for (var i = 0; i < g; i++) { h += '<i class="' + (t < n ? 'on' : '') + '"' + (edit ? ' data-a="box" data-k="' + key + '" data-v="' + (t + 1) + '"' : '') + '></i>'; t++; }
      if (gi < groups.length - 1) h += '<i class="lock">🔒</i>';
    });
    return h + '</div>';
  }
  var h = '<div class="page"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">解放状況</h2></div>';
  h += '<p class="note">ゲームを終えるたび、各プレイヤーは「倒したボスの数＋1」個のボックスにチェックを入れます。まず自分のキャラクターのボックス（1／3／4個でそれぞれのカードが解放）を埋め、すべて埋まった後は無色カード（3個）か第4幕（5個）のボックスに入れられます。</p>';
  D.CHAR_ORDER.forEach(function (ch) { h += '<div class="panel" style="margin:8px 0"><b>' + esc(D.CHARS[ch].name) + '</b>　<span class="small muted">解放 ' + charLevel(s.ch[ch]) + '/3</span>' + boxes(s.ch[ch], CHAR_FULL, ch) + '</div>'; });
  h += '<div class="panel" style="margin:8px 0"><b>無色カード</b>　<span class="small muted">' + (colorlessOn(s) ? '解放済み' : '') + '</span>' + boxes(s.colorless, 3, 'colorless') + '<div class="note">無色カード報酬デッキ、商人の無色カード、無色カードの出るイベントとネオーの祝福が加わります。</div></div>';
  h += '<div class="panel" style="margin:8px 0"><b>第4幕</b>　<span class="small muted">' + (act4On(s) ? '解放済み' : '') + '</span>' + boxes(s.act4, 5, 'act4') + '<div class="note">マップに燃えるエリートが現れ、3つの鍵を集めると第3幕の後に第4幕へ進めます。</div></div>';
  if (s.spare) h += '<div class="panel" style="margin:8px 0">割り当て待ちのボックス：' + s.spare + '個　<button class="btn sm" data-a="spare" data-v="colorless">無色カードへ</button> <button class="btn sm" data-a="spare" data-v="act4">第4幕へ</button></div>';
  h += '<div class="panel" style="margin:8px 0"><b>アセンション</b>　最大 ' + s.asc + (edit ? '　<button class="btn sm" data-a="ascadj" data-v="-1">−</button> <button class="btn sm" data-a="ascadj" data-v="1">＋</button>' : '') +
    '<div class="note">第2幕のボス（1人プレイでは第3幕のボス）を倒すと次のレベルが解放されます（解放済みの最高レベルで遊んでいる時のみ）。</div></div>';
  h += '<button class="btn ghost wide" data-a="editunlock">' + (edit ? '編集を終える' : '手動で編集する（実物の進行に合わせる）') + '</button></div>';
  return h;
}
function rulesHTML() {
  return '<div class="page"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">遊び方</h2></div>' +
    '<h3>目的</h3><p>マップを下から上へ進み、各幕の最後にいるボスを倒します。第3幕のボスを倒せば勝利。第4幕が解放されていて3つの鍵をそろえていれば、さらに堕落の心臓に挑めます。誰か1人のHPが0になると全員の敗北です。</p>' +
    '<h3>ラウンド</h3><p>ラウンドの始めに全員がエナジー3を得てカードを5枚引き、共通のダイスを1つ振ります。ダイスの目で多くの敵の行動と、一部のレリックの効果が決まります。全員が好きな順でカードを使い、全員がターン終了を宣言したら敵のターンです。</p>' +
    '<h3>列と攻撃</h3><p>各プレイヤーは自分の列を持ちます。単体攻撃はどの敵にも当てられ、範囲攻撃は好きな1列とボスに当たります。敵の通常攻撃は同じ列のプレイヤーに、「全体」の攻撃は全員に当たります。ボスは全員を攻撃します。</p>' +
    '<h3>トークン</h3><p>ブロック（最大20）、筋力（最大8、ヒット1つごとに+1）、脱力（ヒット1つのダメージ−1、アタック後に1つ減る）、弱体化（ダメージ2倍、ダメージを受けた後に1つ減る）、毒（敵全体で最大30、プレイヤーのターン終了時にダメージ）。脱力と弱体化が両方あると打ち消し合います。</p>' +
    '<h3>報酬</h3><p>遭遇の後は書かれたゴールド・ポーションとカード報酬（3枚から1枚）、エリートの後はレリックも得られます。ゴールデンチケットを引くとレア報酬が選べます。</p>' +
    '<h3>マップ</h3><p>遭遇・エリート・イベント（?）・商人・休憩所・宝箱。協力プレイでは移動先を投票で決めます（同数ならホストの票）。</p>' +
    '<h3>操作</h3><p>カードを1回タップすると選択、もう一度タップ（または「使う」）で使います。対象が必要なカードは、続けて敵・列・プレイヤーをタップします。敵やプレイヤーをタップすると詳しい情報が見られます。</p>' +
    '<p class="note">ルールはボードゲーム版のルールブック（v2.30）と公開カードデータに基づいています。調査の記録と不明点は RULES_AUDIT.md を参照してください。</p></div>';
}

/* ================================================================== co-op setup */
function coopHTML() {
  var s = sheet(), c = A.coop;
  c.ch = c.ch || 'R';
  return '<div class="page"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">オンライン協力</h2></div>' +
    '<p class="note">2〜4人で1つの冒険を進めます。ホストのブラウザがゲームを動かし、ほかの人は4文字の部屋コードで参加します。それぞれ違うキャラクターを選んでください。</p>' +
    '<div class="field"><label>名前</label><input class="txt" id="nm" maxlength="12" value="' + esc(PREF.name || '') + '" placeholder="冒険者"></div>' +
    '<div class="field"><label>キャラクター</label>' + charButtons(c.ch, null, s) + '</div>' +
    '<div class="row"><button class="btn primary grow" data-a="host">部屋を作る</button></div>' +
    '<div class="field"><label>部屋コードで参加</label><div class="row"><input class="txt" id="code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD" value="' + esc(c.code || '') + '"><button class="btn" data-a="join">参加</button></div></div>' +
    (c.err ? '<p style="color:#ff9b7a">' + esc(c.err) + '</p>' : '') + '</div>';
}
function lobbyHTML() {
  var c = A.coop, s = sheet();
  var roster = A.host ? A.host.roster.view() : (A.guest ? A.guest.roster : []);
  var isHost = !!A.host;
  var h = '<div class="page"><div class="back"><button class="ibtn" data-a="leavelobby">←</button><h2 style="margin:0">部屋 ' + esc(c.code || '') + '</h2></div>';
  h += '<p class="note">' + (isHost ? 'ほかのプレイヤーに部屋コード「' + esc(c.code) + '」を伝えてください。同じページで「部屋コードで参加」から入れます。' : 'ホストが開始するのを待っています。') + '</p>';
  h += '<div class="ilist">' + roster.map(function (r) {
    return '<div class="irow"><img src="' + V.heroImg(r.ch) + '" alt=""><div class="grow"><b>' + esc(r.name) + '</b>' + (r.seat === 0 ? '（ホスト）' : '') + '<p>' + esc(D.CHARS[r.ch] ? D.CHARS[r.ch].name : '？') + '・カード解放 ' + (r.unlock | 0) + '/3' + (r.online ? '' : '・<span style="color:#ff9b7a">切断中</span>') + '</p></div>' +
      (isHost && r.seat > 0 && !A.host.roster.started ? '<button class="btn sm ghost" data-a="kick" data-v="' + r.seat + '">外す</button>' : '') + '</div>';
  }).join('') + '</div>';
  if (isHost) {
    var st = A.setup; st.asc = Math.min(st.asc, s.asc);
    var chs = roster.map(function (r) { return r.ch; });
    var ok = roster.length >= 2 && new Set(chs).size === chs.length && roster.every(function (r) { return r.online; });
    h += '<div class="field"><label>アセンション（ホストの最大 ' + s.asc + '）</label>' + ascButtons(st.asc, s.asc) + '</div>';
    h += '<div class="note">無色カード：' + (colorlessOn(s) ? '使う' : '未解放') + '／第4幕：' + (act4On(s) ? '解放済み' : '未解放') + '（ホストの解放状況）</div>';
    h += '<div style="margin-top:14px"><button class="btn primary wide" data-a="startcoop"' + (ok ? '' : ' disabled') + '>冒険を始める（' + roster.length + '人）</button></div>';
  } else {
    var me = roster.filter(function (r) { return r.seat === A.guest.seat; })[0];
    h += '<div class="field"><label>キャラクターを変える</label>' + charButtons(me ? me.ch : A.coop.ch, roster.filter(function (r) { return !me || r.seat !== me.seat; }).map(function (r) { return r.ch; }), s) + '</div>';
    if (A.guest.settings && A.guest.settings.asc != null) h += '<p class="note">アセンション ' + A.guest.settings.asc + '</p>';
  }
  return h + '</div>';
}

/* ================================================================== game screen */
function myPrompt() { var list = A.sess ? A.sess.pending() : []; return list[0] || null; }
function gameHTML() {
  var run = A.sess && A.sess.run();
  if (!run) return '<div class="page center"><h2>接続中…</h2><p class="dots"><i></i><i></i><i></i></p><button class="btn ghost" data-a="quit">タイトルへ</button></div>';
  if (run.phase === 'over') return resultHTML(run);
  var cur = myPrompt();
  if (A.ui.pid !== (cur && cur.id)) { A.ui.pid = cur && cur.id; A.ui.msel = []; A.ui.brew = null; A.ui.gift = null; }
  var stage;
  var inCombat = !!run.combat && !!run.combat.pcs;
  if (inCombat) stage = combatHTML(run, cur);
  else if ((cur && cur.q.type === 'map') || (run.phase === 'map' && !cur)) stage = mapHTML(run, cur, true);
  else stage = roomHTML(run, cur);
  var h = '<div class="game">' + topbarHTML(run) + relicbarHTML(run) + '<div class="stage">' + stage + waitHTML(run, cur) + '</div>';
  h += promptHTML(run, cur, inCombat);
  h += infoHTML(run);
  return h + '</div>';
}
function me(run) { return run.players[A.me] || run.players[0]; }
function topbarHTML(run) {
  var p = me(run), lim = run.asc >= 4 ? 2 : 3;
  var h = '<div class="topbar"><span class="stat hp">' + V.icon('heart') + p.hp + '/' + maxHp(p) + '</span><span class="stat gold">' + V.icon('gold') + p.gold + '</span><span class="pots">';
  for (var i = 0; i < lim; i++) {
    var id = p.potions[i];
    h += id ? '<button class="pot" data-a="pot" data-v="' + i + '">' + V.potionIcon(id) + '</button>' : '<span class="pot empty"></span>';
  }
  h += '</span><span class="sp"></span>';
  if (run.unlock && run.unlock.act4) h += '<span class="keys" title="鍵"><i style="background:#e0443a" class="' + (run.keys.ruby ? 'on' : '') + '"></i><i style="background:#3a7ae0" class="' + (run.keys.sapphire ? 'on' : '') + '"></i><i style="background:#3ae07a" class="' + (run.keys.emerald ? 'on' : '') + '"></i></span>';
  h += '<span class="act">第' + run.act + '幕' + (run.asc ? '・A' + run.asc : '') + '</span>';
  h += '<button class="ibtn" data-a="info" data-v="deck" aria-label="デッキ">' + V.icon('deck') + '</button>';
  h += '<button class="ibtn" data-a="info" data-v="map" aria-label="マップ">' + V.icon('map') + '</button>';
  h += '<button class="ibtn" data-a="info" data-v="menu" aria-label="メニュー">' + V.icon('menu') + '</button></div>';
  return h;
}
function maxHp(p) { return p.relics.some(function (r) { return r.id === 'MarkOfPain'; }) ? Math.min(p.maxHp, 6) : p.maxHp; }
function relicbarHTML(run) {
  var p = me(run), h = '<div class="relicbar" data-keep="relics">';
  var ab = { R: 'BurningBlood', G: 'RingOfTheSnake', B: 'CrackedCore', W: 'Miracles' };
  h += '<button class="relic" data-a="info" data-v="ability" aria-label="キャラクター能力"><img src="img/r/' + ab[p.ch] + '.webp?v=' + V.ASSET + '" alt=""></button>';
  p.relics.forEach(function (r, i) {
    var d = STS.RELICS[r.id] || {};
    var act = run.combat && d.activate && !(r.usedCombat);
    h += '<button class="relic' + (r.usedCombat || r.usedRoom ? ' used' : '') + (act ? ' act' : '') + '" data-a="relic" data-v="' + i + '">' + V.relicIcon(r.id) + (r.n ? '<span class="n">' + r.n + '</span>' : '') + '</button>';
  });
  return h + '</div>';
}
function waitHTML(run, cur) {
  if (cur) return '';
  var w = (A.sess.waiting ? A.sess.waiting() : []).filter(function (i) { return i !== A.me; });
  if (!w.length) return '';
  return '<div class="waitbar">' + w.map(function (i) { return esc(run.players[i] ? run.players[i].name : '?'); }).join('、') + ' を待っています <span class="dots"><i></i><i></i><i></i></span></div>';
}

/* ------------------------------------------------------------------ map */
var ROOM_GLYPH = {
  M: '<path d="M-7 4c0-7 3-11 7-11s7 4 7 11zM-4 -2a1.5 1.5 0 1 0 .1 0M4 -2a1.5 1.5 0 1 0 .1 0" fill="#2a1d12"/><path d="M-5 4l2 3 2-3 2 3 2-3" stroke="#2a1d12" stroke-width="1.5" fill="none"/>',
  E: '<path d="M-8 6l2-10 4 5 2-8 2 8 4-5 2 10z" fill="#7a1d12"/>',
  'É': '<path d="M-8 6l2-10 4 5 2-8 2 8 4-5 2 10z" fill="#e05a12"/><path d="M0 -10c3 3 4 6 0 9-4-3-3-6 0-9z" fill="#ffd040"/>',
  '?': '<text x="0" y="6" text-anchor="middle" font-size="17" font-weight="900" fill="#2a1d12" font-family="serif">?</text>',
  '$': '<path d="M-6 -2h12l2 9h-16z" fill="#6a4a1a"/><path d="M-3 -2a3 4 0 0 1 6 0" stroke="#6a4a1a" stroke-width="2" fill="none"/><text x="0" y="6" text-anchor="middle" font-size="8" fill="#ffd77a" font-weight="900">$</text>',
  R: '<path d="M0 -9c4 4 6 8 2 12 1-4-1-5-2-6-1 2-4 3-3 6-4-4 0-8 3-12z" fill="#d05a12"/><path d="M-8 7l16-4M-8 3l16 4" stroke="#4a3018" stroke-width="2"/>',
  T: '<rect x="-8" y="-4" width="16" height="10" rx="1.5" fill="#8a5a1a"/><rect x="-8" y="-7" width="16" height="5" rx="2" fill="#a8772a"/><rect x="-1.5" y="-3" width="3" height="4" fill="#ffd77a"/>',
  B: '<circle r="9" fill="#5a1210"/><path d="M-5 -2a1.5 1.5 0 1 0 .1 0M5 -2a1.5 1.5 0 1 0 .1 0M-4 4h8" stroke="#ffd0c0" stroke-width="2"/>',
  X: '<circle r="4" fill="#7a6a50"/>'
};
function mapHTML(run, cur, full) {
  var m = run.map;
  if (!m) return '';
  var opts = cur && cur.q.type === 'map' ? cur.q.options.concat(cur.q.wing || []) : [];
  var cols = 7, W = Math.min(window.innerWidth, 560), cw = W / cols, rh = 58, H = m.rows * rh + 40;
  function xy(k) { var n = m.nodes[k]; return [cw * (n.c + 0.5), H - 30 - n.r * rh]; }
  var svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
  Object.keys(m.edges).forEach(function (k) {
    m.edges[k].forEach(function (k2) {
      if (!m.nodes[k2]) return;
      var a = xy(k), b = xy(k2), done = m.visited.indexOf(k) >= 0 && m.visited.indexOf(k2) >= 0;
      svg += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + (done ? '#1c6e2d' : '#5a4630') + '" stroke-width="' + (done ? 3 : 2) + '" stroke-dasharray="' + (done ? '0' : '4 5') + '"/>';
    });
  });
  Object.keys(m.nodes).forEach(function (k) {
    var n = m.nodes[k], p = xy(k);
    var reach = opts.indexOf(k) >= 0, curN = m.pos === k, done = m.visited.indexOf(k) >= 0;
    var r = n.t === 'B' ? 20 : 15;
    svg += '<g class="mapnode' + (reach ? ' reach' : '') + (curN ? ' cur' : '') + (done ? ' done' : '') + '" transform="translate(' + p[0] + ',' + p[1] + ')"' + (reach && cur ? ' data-a="node" data-v="' + k + '"' : ' data-a="nodeinfo" data-v="' + k + '"') + '>' +
      '<circle class="bgc" r="' + r + '" fill="rgba(240,226,196,.9)"/><circle class="ring" r="' + r + '"/><g transform="scale(' + (n.t === 'B' ? 1.6 : 1.05) + ')">' + (ROOM_GLYPH[n.t] || '') + '</g></g>';
  });
  svg += '</svg>';
  var title = cur && cur.q.type === 'map' ? (cur.q.portal ? '秘密のポータル：上の好きな部屋へ' : (A.sess.run().players.length > 1 ? '次の部屋に投票してください' : '次の部屋を選んでください')) : '第' + run.act + '幕のマップ';
  var boss = run.boss ? (STS.ENCOUNTERS['Boss:' + run.boss] || {}).name : '';
  return '<div class="mapview" data-keep="map"><div class="mapbanner">' + esc(title) + (boss ? '<div class="small">ボス：' + esc(boss) + (run.boss2 ? '・' + esc((STS.ENCOUNTERS['Boss:' + run.boss2] || {}).name) : '') + '</div>' : '') + '</div>' + svg +
    '<div class="maplegend"><span>遭遇</span><span>エリート</span><span>?イベント</span><span>$商人</span><span>休憩所</span><span>宝箱</span></div></div>';
}

/* ------------------------------------------------------------------ rooms out of combat */
function roomHTML(run, cur) {
  var room = run.room;
  var t = room ? room.t : null;
  var label = t ? (D.ROOM[t] || {}).name : '';
  if (room && room.event && STS.EVENTS[room.event]) label = STS.EVENTS[room.event].name;
  if (run.phase === 'bossRelic') label = 'ボスレリック';
  if (run.phase === 'actEnd') label = '幕の終わり';
  if (run.phase === 'neow' || run.neow) label = 'ネオーの祝福';
  var glyph = ROOM_GLYPH[t] || '';
  return '<div class="roomart"><svg viewBox="-20 -20 40 40">' + glyph + '</svg></div><div class="page center" style="padding-top:30px"><h2>' + esc(label || '') + '</h2>' +
    (!cur ? '<p class="muted">ほかのプレイヤーの選択を待っています…</p>' : '') + '</div>';
}

/* ------------------------------------------------------------------ combat */
function combatHTML(run, cur) {
  var cs = run.combat, cb = SES.query(run);
  var pcMe = cs.pcs[A.me];
  var aim = aimState(run, cur);
  var actCls = 'act' + (cs.act || run.act);
  var bosses = cs.enemies.filter(function (e) { return e.row === -1 && !e.dead && !e.fled; });
  var bandsN = cs.rows + (bosses.length ? 1 : 0);
  var fieldH = Math.max(220, window.innerHeight - 44 - 36 - 66 - 150 - 56);
  var artH = Math.max(46, Math.min(190, Math.floor(fieldH / bandsN) - 92));
  var h = '<div class="combat ' + actCls + '" style="--art:' + artH + 'px;--bossart:' + Math.min(230, Math.round(artH * 1.25)) + 'px"><div class="field-scroll" data-keep="field">';
  var Wf = Math.min(window.innerWidth, 900) - 24;
  function bandArt(k, hero, boss) {
    var w = (Wf - (hero ? 92 : 0) - 6 * Math.max(0, k - 1)) / Math.max(1, k);
    var byW = Math.floor(w / (boss ? 1.15 : 1.1) * 0.96);
    return Math.max(40, Math.min(boss ? Math.round(artH * 1.25) : artH, byW));
  }
  if (bosses.length) h += '<div class="band boss" style="--bossart:' + bandArt(bosses.length, false, true) + 'px"><div class="enemies">' + bosses.map(function (e) { return foeHTML(cb, e, aim, run); }).join('') + '</div></div>';
  for (var r = 0; r < cs.rows; r++) {
    var es = cs.enemies.filter(function (e) { return (e.rows ? e.rows.indexOf(r) >= 0 : e.row === r) && !e.fled && (!e.dead || e.id === 'Darkling'); });
    var pc = cs.pcs.filter(function (p) { return p.row === r; })[0];
    var rowTarget = aim && aim.kind === 'row' && aim.set.indexOf(r) >= 0;
    h += '<div class="band' + (pc && pc.i === A.me ? ' mine' : '') + (rowTarget ? ' rowtarget' : '') + '" style="--art:' + bandArt(es.length, !!pc, false) + 'px"' + (rowTarget ? ' data-a="aimrow" data-v="' + r + '"' : '') + '>' +
      '<span class="rowlbl">' + (r + 1) + '列</span><div class="enemies">' + (es.length ? es.map(function (e) { return foeHTML(cb, e, aim, run); }).join('') : '<div class="emptyrow">敵なし</div>') + '</div>' +
      (pc ? heroHTML(run, pc, aim) : '') + '</div>';
  }
  h += '</div>';
  h += hudHTML(run, cs, pcMe, cb);
  h += previewHTML(run, pcMe);
  h += handHTML(run, cs, pcMe, cur);
  h += actbarHTML(run, cs, pcMe, aim);
  return h + '</div>';
}
function aimState(run, cur) {
  if (A.ui.aim) return A.ui.aim;
  if (!cur) return null;
  var q = cur.q;
  if (q.type === 'enemy') return { kind: 'enemy', set: q.options, prompt: cur.id, title: q.title };
  if (q.type === 'row' && !q.facing) return { kind: 'row', set: q.options, prompt: cur.id, title: q.title };
  if (q.type === 'player') return { kind: 'player', set: q.options, prompt: cur.id, title: q.title };
  return null;
}
function tokHTML(t) {
  var h = '';
  if (t.str) h += '<span class="tok str">筋' + t.str + '</span>';
  if (t.weak) h += '<span class="tok weak">脱' + t.weak + '</span>';
  if (t.vuln) h += '<span class="tok vuln">弱' + t.vuln + '</span>';
  if (t.psn) h += '<span class="tok psn">毒' + t.psn + '</span>';
  return h;
}
function foeHTML(cb, e, aim, run) {
  var m = STS.MONSTERS[e.id] || {};
  var a = null; try { a = cb.currentAction(e); } catch (err) {}
  var tpc = e.row >= 0 ? cb.pcInRow(e.row) : cb.pc(A.me);
  var bonus = 0; try { if (m.hitBonus && tpc) bonus = m.hitBonus(cb, e, tpc); } catch (err) {}
  var target = aim && aim.kind === 'enemy' && aim.set.indexOf(e.u) >= 0;
  var extra = '';
  if (e.x && e.x.thorns) extra += '<span class="tok etc">トゲ' + e.x.thorns + '</span>';
  if (e.x && e.x.enraged) extra += '<span class="tok etc">激怒</span>';
  if (e.mode === 'defense') extra += '<span class="tok etc">防御モード</span>';
  if (e.mode === 'fury') extra += '<span class="tok etc">激怒モード</span>';
  if (e.x && e.x.invincible) extra += '<span class="tok etc">無敵</span>';
  if (e.x && e.x.beat) extra += '<span class="tok etc">死の鼓動' + e.x.beat + '</span>';
  if (e.x && e.x.timeWarp) extra += '<span class="tok etc">ワープ' + e.x.timeWarp + '</span>';
  var pct = Math.max(0, Math.min(100, e.hp / Math.max(1, e.max) * 100));
  return '<button class="foe' + (e.dead ? ' dead' : '') + (target ? ' target' : '') + '" data-a="foe" data-u="' + e.u + '">' +
    (e.blk ? '<span class="blkbadge">' + e.blk + '</span>' : '') +
    '<div class="art">' + V.enemyArt(m.art, m.name) + '</div><div class="nm">' + esc(m.name || e.id) + (e.rows ? '<small class="sharedrows">第' + e.rows.map(function (r) { return r + 1; }).join('・') + '列でHP共通</small>' : '') + '</div>' +
    '<div class="hpbar' + (e.psn ? ' psn' : '') + '"><i style="width:' + pct + '%"></i><span>' + e.hp + '/' + e.max + '</span></div>' +
    '<div class="toks">' + tokHTML(e) + extra + '</div>' +
    (e.dead ? '' : '<div class="intent' + (a && a.aoe ? ' aoe' : '') + '"><span class="an">' + esc(a ? a.name : '') + '</span>' + V.actionText(e, a, { bonus: bonus, vuln: tpc && tpc.vuln > 0 }) + '</div>') + '</button>';
}
function heroHTML(run, pc, aim) {
  var P = run.players[pc.i];
  var target = aim && aim.kind === 'player' && aim.set.indexOf(pc.i) >= 0;
  return '<button class="hero' + (pc.i === A.me ? ' me' : '') + (pc.ready ? ' ready' : '') + (pc.dead ? ' dead' : '') + (target ? ' target' : '') + '" data-a="hero" data-v="' + pc.i + '" data-pi="' + pc.i + '">' +
    (pc.blk ? '<span class="blkbadge">' + pc.blk + '</span>' : '') +
    '<div class="face" style="background-image:url(' + V.heroImg(P.ch) + ')"></div><div class="nm">' + esc(P.name) + '</div>' +
    '<div class="hpbar"><i style="width:' + Math.max(0, P.hp / Math.max(1, maxHp(P)) * 100) + '%"></i><span>' + P.hp + '/' + maxHp(P) + '</span></div>' +
    '<div class="toks">' + tokHTML(pc) + (pc.stance && pc.stance !== 'none' ? '<span class="tok etc">' + stanceName(pc.stance) + '</span>' : '') + '</div></button>';
}
function stanceName(s) { return { wrath: '憤怒', calm: '平静', divinity: '神性' }[s] || ''; }
function hudHTML(run, cs, pc, cb) {
  if (!pc) return '';
  var P = run.players[pc.i];
  var h = '<div class="hud"><div class="hudrow">';
  h += '<div class="energy" style="background-image:url(' + V.energyImg(P.ch) + ')">' + pc.en + '<small>エナジー</small></div>';
  h += '<div class="mestat"><div class="row" style="gap:4px">' + (pc.blk ? '<span class="tok blk">ブロック' + pc.blk + '</span>' : '') + tokHTML(pc) +
    (pc.stance && pc.stance !== 'none' ? '<span class="stance ' + pc.stance + '">' + stanceName(pc.stance) + '</span>' : '') +
    (pc.shiv ? '<span class="tok etc">ナイフ' + pc.shiv + '</span>' : '') + (pc.mir ? '<span class="tok etc">奇跡' + pc.mir + '</span>' : '') + '</div>';
  if (pc.slots) {
    h += '<div class="orbs" style="margin-top:3px">';
    for (var i = 0; i < pc.slots; i++) { var o = pc.orbs[i]; h += '<span class="orb ' + (o || 'empty') + '">' + (o ? { lightning: '雷', frost: '氷', dark: '闇' }[o] : '') + '</span>'; }
    h += '</div>';
  }
  if (pc.pow.length) {
    h += '<div class="powers" data-keep="pows">' + pc.pow.map(function (p) {
      var d = STS.CARDS[p.id] || {};
      var act = d.pw && d.pw.activate;
      return '<button class="powchip' + (act ? ' act' : '') + (p.usedTurn ? ' used' : '') + '" data-a="pow" data-u="' + p.u + '">' + esc(d.name + (p.up ? '+' : '')) + (p.v ? '(' + p.v + ')' : '') + '</button>';
    }).join('') + '</div>';
  }
  h += '</div>';
  h += '<div class="dieface' + (A.ui.dieAnim ? ' roll' : '') + '" data-a="info" data-v="die" title="ダイス">' + (cs.die || '–') + '</div>';
  return h + '</div></div>';
}
function previewHTML(run, pc) {
  if (!pc || A.ui.sel == null || A.ui.aim) return '';
  var c = pc.hand.filter(function (x) { return x.u === A.ui.sel; })[0];
  if (!c) return '';
  var hi = (A.sess.hand(pc.i) || {})[c.u] || {};
  var open = A.sess.playOpen() && !pc.ready;
  return '<div class="preview">' + V.card(c, { cls: 'big', cost: hi.cost == null ? undefined : hi.cost, attrs: 'data-a="playsel"' }) +
    '<div class="pvbtns">' + (hi.why || !open ? '<div class="small" style="color:#ff9b7a;max-width:150px">' + esc(hi.why || '今は使えません') + '</div>' : '<button class="btn primary" data-a="playsel">使う</button>') +
    '<button class="btn ghost" data-a="unsel">戻す</button></div></div>';
}
function handHTML(run, cs, pc, cur) {
  if (!pc) return '<div class="hand"></div>';
  var info = A.sess.hand(pc.i) || {};
  var open = A.sess.playOpen() && !pc.ready;
  var n = Math.max(1, pc.hand.length), avail = Math.min(window.innerWidth, 900) - 12;
  var cw = Math.max(70, Math.min(124, Math.floor(avail / Math.min(n, 5))));
  var ov = n * cw > avail ? Math.ceil((n * cw - avail) / (2 * n)) : 0;
  var h = '<div class="hand" data-keep="hand" style="--cw:' + cw + 'px;--ov:' + ov + 'px">';
  pc.hand.forEach(function (c) {
    var hi = info[c.u] || {};
    var cls = (A.ui.sel === c.u ? 'sel ' : '') + (hi.why || !open ? 'no' : '');
    h += V.card(c, { cost: hi.cost == null ? undefined : hi.cost, cls: cls, attrs: 'data-a="card" data-u="' + c.u + '"' });
  });
  return h + '</div>';
}
function actbarHTML(run, cs, pc, aim) {
  if (!pc) return '';
  var open = A.sess.playOpen();
  var h = '<div class="actbar">';
  h += '<button class="pile" data-a="info" data-v="draw">山札 ' + pc.draw.length + '</button>';
  h += '<button class="pile" data-a="info" data-v="disc">捨て札 ' + pc.disc.length + '</button>';
  if (pc.exh.length) h += '<button class="pile" data-a="info" data-v="exh">廃棄 ' + pc.exh.length + '</button>';
  h += '<span class="grow"></span>';
  if (A.ui.aim) h += '<button class="btn sm ghost" data-a="aimcancel">やめる</button>';
  if (pc.shiv > 0 && open && !pc.ready) h += '<button class="btn sm" data-a="shiv">ナイフ</button>';
  if (pc.mir > 0 && open && !pc.ready) h += '<button class="btn sm" data-a="miracle">奇跡</button>';
  if (A.ui.sel != null && open && !pc.ready) h += '<button class="btn sm primary" data-a="playsel">使う</button>';
  if (pc.ready) h += '<button class="btn" data-a="unready"' + (open ? '' : ' disabled') + '>待機中（取消）</button>';
  else h += '<button class="btn primary" data-a="end"' + (open && !pc.dead ? '' : ' disabled') + '>ターン終了</button>';
  return h + '</div>';
}

/* ================================================================== prompts */
function sheetWrap(inner, o) {
  o = o || {};
  return '<div class="sheet-back' + (o.clear ? ' clear' : '') + '"><div class="sheet' + (o.full ? ' full' : '') + '" data-keep="sheet">' + inner + '</div></div>';
}
function ansAttr(v) { return 'data-a="ans" data-p="' + (A.ui.pid || 0) + '" data-v="' + V.attr(v) + '"'; }
function promptHTML(run, cur, inCombat) {
  if (!cur || A.ui.hide) return '';
  var q = cur.q, t = q.type, h = '';
  if (A.ui.aim && inCombat) return '<div class="sheet-back clear"><div class="sheet"><h3>' + esc(A.ui.aim.title || '対象を選択') + '</h3><div class="sub">光っている対象をタップしてください。</div></div></div>';
  switch (t) {
    case 'enemy': case 'player': case 'row':
      if (inCombat && !(t === 'row' && q.facing)) return sheetWrap('<h3>' + esc(q.title || '対象を選択') + '</h3><div class="sub">光っている対象をタップしてください。</div>', { clear: true });
      if (t === 'row' && q.facing) {
        h = '<h3>' + esc(q.title) + '</h3><div class="sub">ラウンドの始めに、自分の列の敵の「対面」効果を受けます。</div><div class="opts">';
        (q.info || []).forEach(function (r) {
          var occ = r.player != null && run.players[r.player] ? run.players[r.player].name : '空き';
          h += '<button class="opt" ' + ansAttr(r.row) + '><span class="br">' + (r.row + 1) + '列</span>　対面：' + esc(r.facing) + '　<span class="muted">（' + esc(occ) + '）</span></button>';
        });
        return sheetWrap(h + '</div>');
      }
      h = '<h3>' + esc(q.title || '選択') + '</h3><div class="opts">';
      q.options.forEach(function (v) {
        var label = t === 'player' ? (run.players[v] ? run.players[v].name + '（' + D.CHARS[run.players[v].ch].name + '）' : v) : t === 'row' ? (v + 1) + '列' : v;
        h += '<button class="opt" ' + ansAttr(v) + '>' + esc(label) + '</button>';
      });
      return sheetWrap(h + '</div>');
    case 'orb':
      h = '<h3>' + esc(q.title) + '</h3><div class="opts">';
      q.options.forEach(function (i) { h += '<button class="opt" ' + ansAttr(i) + '>' + (i + 1) + '番目：' + esc({ lightning: 'ライトニング', frost: 'フロスト', dark: 'ダーク' }[q.orbs[i]] || q.orbs[i]) + '</button>'; });
      return sheetWrap(h + '</div>');
    case 'map': return '';
    case 'cards': case 'deck': return pickCardsHTML(cur);
    case 'number':
      h = '<h3>' + esc(q.title) + '</h3><div class="numpick">';
      for (var n = q.min; n <= q.max; n++) h += '<button ' + ansAttr(n) + '>' + n + '</button>';
      return sheetWrap(h + '</div>');
    case 'confirm':
      return sheetWrap('<h3>' + esc(q.title) + '</h3><div class="sheetbtns"><button class="btn primary" ' + ansAttr(true) + '>' + esc(q.yes || 'はい') + '</button><button class="btn" ' + ansAttr(false) + '>' + esc(q.no || 'いいえ') + '</button></div>');
    case 'option': return optionHTML(run, cur);
    case 'info':
      h = (q.ev && V.eventImg(q.ev) ? '<img class="evimg" src="' + V.eventImg(q.ev) + '" alt="">' : '') + '<h3>' + esc(q.title || '') + '</h3><p class="evtext">' + esc(q.text || '') + '</p>';
      return sheetWrap(h + '<div class="sheetbtns"><button class="btn primary" ' + ansAttr(true) + '>' + esc(q.ok || 'OK') + '</button></div>');
    case 'reward': return rewardHTML(run, cur);
    case 'cardReward': {
      h = '<h3>' + esc(q.title) + '</h3><div class="cardgrid">';
      q.cards.forEach(function (c) { h += V.card({ id: c.id, up: c.up }, { cls: 'pick', attrs: ansAttr(c.idx) }); });
      h += '</div>';
      if (q.skip) h += '<div class="sheetbtns"><button class="btn ghost" ' + ansAttr(-1) + '>見送る</button></div>';
      return sheetWrap(h);
    }
    case 'potion': return potionOfferHTML(run, cur);
    case 'relic':
      h = '<h3>' + esc(q.title || 'レリック') + '</h3><div class="itemrow">' + V.relicIcon(q.id) + '<div class="t"><b>' + esc(V.relicName(q.id)) + '</b><span>' + esc(V.relicText(q.id)) + '</span></div></div>';
      h += '<div class="sheetbtns"><button class="btn primary" ' + ansAttr(true) + '>受け取る</button>' + (q.skip ? '<button class="btn ghost" ' + ansAttr(false) + '>見送る</button>' : '') + '</div>';
      return sheetWrap(h);
    case 'bossRelic':
      h = '<h3>' + esc(q.title) + '</h3><div class="opts">';
      q.ids.forEach(function (id) {
        var tk = q.taken[id];
        h += '<button class="opt' + (tk != null ? ' off' : '') + '"' + (tk != null ? '' : ' ' + ansAttr(id)) + '><div class="itemrow">' + V.relicIcon(id) + '<div class="t"><b>' + esc(V.relicName(id)) + '</b><span>' + esc(V.relicText(id)) + '</span>' +
          (tk != null ? '<span class="why">' + esc(run.players[tk] ? run.players[tk].name : '') + 'が選択</span>' : '') + '</div></div></button>';
      });
      return sheetWrap(h + '</div><div class="sheetbtns"><button class="btn ghost" ' + ansAttr('skip') + '>見送る</button></div>');
    case 'shop': return shopHTML(run, cur);
    case 'dieMod': {
      h = '<h3>' + esc(q.title) + '</h3><div class="row" style="justify-content:center;margin:6px 0 12px"><div class="dieface">' + q.die + '</div></div><div class="opts">';
      q.options.forEach(function (o) {
        if (o.k === 'brew') return;
        h += '<button class="opt" ' + ansAttr(o) + '>' + esc(o.label) + '</button>';
      });
      var brew = q.options.filter(function (o) { return o.k === 'brew'; })[0];
      if (brew) {
        h += '<div class="panel"><div class="small">' + esc(brew.label) + '</div><div class="numpick" style="margin-top:6px">';
        for (var f = 1; f <= 6; f++) h += '<button ' + ansAttr({ k: 'brew', slot: brew.slot, v: f }) + '>' + f + '</button>';
        h += '</div></div>';
      }
      return sheetWrap(h + '<button class="opt" ' + ansAttr({ k: 'pass' }) + '>このままにする</button></div>');
    }
    default:
      return sheetWrap('<h3>' + esc(q.title || t) + '</h3><button class="btn" ' + ansAttr(null) + '>OK</button>');
  }
}
function optionHTML(run, cur) {
  var q = cur.q, h = '';
  if (q.ev && V.eventImg(q.ev)) h += '<img class="evimg" src="' + V.eventImg(q.ev) + '" alt="">';
  if (q.neow) h += '<div class="center" style="font-size:2.2rem">🐋</div>';
  h += '<h3>' + esc(q.title || '') + '</h3>';
  if (q.text) h += '<p class="evtext">' + esc(q.text) + '</p>';
  if (q.vote) h += '<div class="sub">全員の投票で決まります（同数ならホストの票）。</div>';
  if (q.reveal) h += '<div class="opts" style="margin-bottom:8px">' + q.reveal.map(function (id, i) { return id ? '<div class="itemrow">' + V.relicIcon(id) + '<div class="t"><b>' + esc((run.players[i] || {}).name || '') + '：' + esc(V.relicName(id)) + '</b><span>' + esc(V.relicText(id)) + '</span></div></div>' : ''; }).join('') + '</div>';
  h += '<div class="opts">';
  q.options.forEach(function (o) {
    var lbl = esc(o.label).replace(/^\[([^\]]+)\]/, '<span class="br">[$1]</span>');
    var icon = o.relic ? V.relicIcon(o.relic) : o.potion ? V.potionIcon(o.potion) : '';
    var inner = icon ? '<div class="itemrow">' + icon + '<div class="t"><b>' + lbl + '</b><span>' + esc(o.relic ? V.relicText(o.relic) : V.potionText(o.potion)) + '</span></div></div>' : lbl;
    if (o.card) inner = '<div class="row">' + V.card(o.card, { cls: 'mini' }) + '<span>' + lbl + '</span></div>';
    var off = o.disabled || (o.gold && me(run).gold < o.gold);
    h += '<button class="opt' + (off ? ' off' : '') + '"' + (off ? '' : ' ' + ansAttr(o.id)) + '>' + inner + (off && (o.why || o.gold) ? '<span class="why">' + esc(o.why || (o.gold + 'ゴールド必要')) + '</span>' : '') + '</button>';
  });
  h += '</div>';
  if (run.players.length > 1 && q.ev) h += '<div class="sheetbtns"><button class="btn sm ghost" data-a="giftgold">ゴールドを渡す</button></div>';
  return sheetWrap(h);
}
function pickCardsHTML(cur) {
  var q = cur.q, sel = A.ui.msel || [];
  var h = '<h3>' + esc(q.title) + '</h3><div class="sub">' + (q.min === q.max ? q.min + '枚選んでください' : q.min + '〜' + q.max + '枚選べます') + '（選択中 ' + sel.length + '）</div><div class="cardgrid">';
  q.cards.forEach(function (c) {
    var on = sel.indexOf(c.u) >= 0;
    var shown = { id: c.id, up: c.up || (on && q.preview === 'upgrade') };
    h += V.card(shown, { cls: 'pick' + (on ? ' chosen' : ''), attrs: 'data-a="msel" data-u="' + c.u + '"', cost: c.cost == null ? undefined : c.cost });
  });
  h += '</div>';
  var ok = sel.length >= q.min && sel.length <= q.max;
  h += '<div class="sheetbtns"><button class="btn primary" data-a="mselok"' + (ok ? '' : ' disabled') + '>決定</button></div>';
  return sheetWrap(h, { full: q.cards.length > 6 });
}
function rewardHTML(run, cur) {
  var q = cur.q, h = '<h3>' + esc(q.title || '報酬') + '</h3><div class="rewards">';
  q.items.forEach(function (it) {
    var label, icon = '';
    if (it.k === 'gold') { label = it.n + 'ゴールド'; icon = V.icon('gold'); }
    else if (it.k === 'potion') { label = 'ポーション'; icon = '<img src="img/ui/potion.webp?v=' + V.ASSET + '" alt="">'; }
    else if (it.k === 'relic') { label = it.fixed ? 'レリック：' + V.relicName(it.fixed) : 'レリック'; icon = it.fixed ? V.relicIcon(it.fixed) : '<img src="img/reward-chest.webp" alt="">'; }
    else if (it.k === 'card') { label = it.kind === 'rare' ? 'レアカード報酬' : it.kind === 'upgraded' ? 'カード報酬（アップグレード済み）' : 'カード報酬'; icon = V.icon('deck'); }
    else if (it.k === 'colorless') { label = '無色カード報酬'; icon = V.icon('deck'); }
    else label = it.k;
    h += '<button class="reward' + (it.taken ? ' taken' : '') + '"' + (it.taken ? '' : ' ' + ansAttr(it.idx)) + '><span class="ic">' + icon + '</span>' + esc(label) + '</button>';
  });
  h += '</div><div class="sheetbtns"><button class="btn" ' + ansAttr('done') + '>報酬を閉じる</button></div>';
  return sheetWrap(h);
}
function potionOfferHTML(run, cur) {
  var q = cur.q, p = me(run);
  var h = '<h3>ポーションを得る</h3><div class="itemrow">' + V.potionIcon(q.id) + '<div class="t"><b>' + esc(V.potionName(q.id)) + '</b><span>' + esc(V.potionText(q.id)) + '</span></div></div>';
  h += '<div class="opts" style="margin-top:10px">';
  if (!q.full) h += '<button class="opt" ' + ansAttr({ act: 'take' }) + '><span class="br">受け取る</span></button>';
  else {
    h += '<div class="sub">ポーションが上限です。1つ捨てるか使ってから受け取れます。</div>';
    q.potions.forEach(function (id, slot) {
      h += '<button class="opt" ' + ansAttr({ act: 'discard', slot: slot }) + '>「' + esc(V.potionName(id)) + '」を捨てる</button>';
      if (STS.POTIONS[id] && STS.POTIONS[id].out) h += '<button class="opt" ' + ansAttr({ act: 'use', slot: slot }) + '>「' + esc(V.potionName(id)) + '」を使う</button>';
    });
  }
  (q.others || []).forEach(function (i) { h += '<button class="opt" ' + ansAttr({ act: 'give', to: i }) + '>' + esc(run.players[i].name) + 'に渡す</button>'; });
  if (q.skip !== false) h += '<button class="opt" ' + ansAttr({ act: 'skip' }) + '>見送る</button>';
  return sheetWrap(h + '</div>');
}
function shopHTML(run, cur) {
  var sh = run.room && run.room.shop, p = me(run), q = cur.q;
  if (!sh) return sheetWrap('<h3>商人</h3><button class="btn" ' + ansAttr({ act: 'leave' }) + '>店を出る</button>');
  var h = '<h3>商人</h3><div class="sub">所持金 ' + p.gold + 'ゴールド。ほかのプレイヤーにゴールドを渡して支払いを助けられます。</div>';
  function item(kind, i, it, icon, name) {
    var cant = p.gold < it.price, off = it.sold || cant;
    return '<button class="shopitem' + (it.sold ? ' sold' : '') + (cant ? ' cant' : '') + '" ' + (off ? 'aria-disabled="true"' : ansAttr({ act: kind, idx: i })) + '>' + icon + '<div class="nm">' + esc(name) + '</div><span class="price">' + it.price + 'G</span></button>';
  }
  h += '<div class="shopsec"><h4>レリック</h4><div class="shopitems">' + sh.relics.map(function (it, i) { return item('relic', i, it, V.relicIcon(it.id), V.relicName(it.id)); }).join('') + '</div></div>';
  h += '<div class="shopsec"><h4>ポーション</h4><div class="shopitems">' + sh.potions.map(function (it, i) { return item('potion', i, it, V.potionIcon(it.id), V.potionName(it.id)); }).join('') + '</div></div>';
  var mine = sh.cards[A.me] || [];
  h += '<div class="shopsec"><h4>カード</h4><div class="cardgrid">' + mine.map(function (c, i) { return V.card({ id: c.id, up: false }, { cls: 'pick' + (c.sold ? ' sold' : p.gold < c.price ? ' dim' : ''), attrs: c.sold || p.gold < c.price ? 'aria-disabled="true"' : ansAttr({ act: 'card', idx: i }), price: c.price }); }).join('') + '</div></div>';
  if (sh.colorless && sh.colorless.length) h += '<div class="shopsec"><h4>無色カード（全員で共有）</h4><div class="cardgrid">' + sh.colorless.map(function (c, i) { return V.card({ id: c.id, up: false }, { cls: 'pick' + (c.sold ? ' sold' : p.gold < c.price ? ' dim' : ''), attrs: c.sold || p.gold < c.price ? 'aria-disabled="true"' : ansAttr({ act: 'colorless', idx: i }), price: c.price }); }).join('') + '</div></div>';
  h += '<div class="opts">';
  var noRemove = sh.removed[A.me] ? 'この商人では使用済み' : p.gold < q.removePrice ? 'ゴールドが足りません' : '';
  h += '<button class="opt' + (noRemove ? ' off' : '') + '"' + (noRemove ? '' : ' ' + ansAttr({ act: 'remove' })) + '><span class="br">[カード除去]</span> ' + q.removePrice + 'ゴールド' + (noRemove ? '<span class="why">' + noRemove + '</span>' : '') + '</button>';
  if (run.players.length > 1) h += '<button class="opt" data-a="shopgift">ゴールドを渡す</button>';
  h += '<button class="opt" ' + ansAttr({ act: 'leave' }) + '><span class="br">店を出る</span></button></div>';
  if (A.ui.gift) h += giftHTML(run, true);
  return sheetWrap(h, { full: true });
}
function giftHTML(run, inShop) {
  var p = me(run), g = A.ui.gift || {};
  var h = '<div class="panel" style="margin-top:10px"><b>ゴールドを渡す</b><div class="seg" style="margin:6px 0">';
  run.players.forEach(function (o) { if (o.i !== A.me) h += '<button data-a="giftto" data-v="' + o.i + '"' + (g.to === o.i ? ' class="on"' : '') + '>' + esc(o.name) + '</button>'; });
  h += '</div><div class="seg">';
  [1, 2, 3, 5, 10].forEach(function (n) { if (n <= p.gold) h += '<button data-a="giftsend" data-v="' + n + '" data-shop="' + (inShop ? 1 : 0) + '">' + n + 'G</button>'; });
  return h + '</div></div>';
}

/* ================================================================== info sheets */
function infoHTML(run) {
  var v = A.ui.info;
  if (!v) return '';
  var h = '', close = '<div class="sheetbtns"><button class="btn" data-a="close">閉じる</button></div>';
  var p = me(run), cs = run.combat, pc = cs && cs.pcs ? cs.pcs[A.me] : null;
  if (v.k === 'deck') {
    var who = v.pi != null ? run.players[v.pi] : p;
    h = '<h3>' + esc(who.name) + 'のデッキ（' + who.deck.length + '枚）</h3><div class="cardgrid">' + sortCards(who.deck).map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    return sheetWrap(h + close, { full: true });
  }
  if (v.k === 'draw' || v.k === 'disc' || v.k === 'exh' || v.k === 'hand') {
    var tp = cs && cs.pcs[v.pi != null ? v.pi : A.me];
    var list = tp ? (v.k === 'draw' ? sortCards(tp.draw) : v.k === 'disc' ? tp.disc.slice().reverse() : v.k === 'hand' ? tp.hand : tp.exh) : [];
    var nm = { draw: '山札（順番は伏せて並べ替え）', disc: '捨て札', exh: '廃棄', hand: '手札' }[v.k];
    h = '<h3>' + esc((tp ? run.players[tp.i].name + '：' : '') + nm) + '（' + list.length + '）</h3><div class="cardgrid">' + list.map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    return sheetWrap(h + close, { full: list.length > 6 });
  }
  if (v.k === 'map') return sheetWrap('<div style="position:relative;height:70vh">' + mapHTML(run, null, false) + '</div>' + close, { full: true });
  if (v.k === 'menu') {
    h = '<h3>メニュー</h3><div class="opts">';
    h += '<button class="opt" data-a="info" data-v="log">ログ</button>';
    h += '<button class="opt" data-a="info" data-v="party">パーティー</button>';
    if (!run.combat && run.players.length > 1) h += '<button class="opt" data-a="info" data-v="rows">列の入れ替え（戦闘外）</button>';
    h += '<button class="opt" data-a="togglemusic">音楽：' + (PREF.music ? 'オン' : 'オフ') + '</button>';
    h += '<button class="opt" data-a="togglesfx">効果音：' + (PREF.sfx ? 'オン' : 'オフ') + '</button>';
    h += '<button class="opt" data-a="info" data-v="help">ルールの要点</button>';
    h += '<button class="opt" data-a="quit">' + (A.guest ? '部屋から抜ける' : 'セーブしてタイトルへ') + '</button>';
    if (!A.guest) h += '<button class="opt" data-a="abandon">冒険をあきらめる</button>';
    return sheetWrap(h + '</div>' + close);
  }
  if (v.k === 'log') {
    var lines = (cs && cs.log && cs.log.length ? cs.log : run.log || []).slice().reverse();
    return sheetWrap('<h3>ログ</h3><div class="logbox">' + lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' + close, { full: true });
  }
  if (v.k === 'help') return sheetWrap(rulesHTML().replace('<div class="page">', '<div>').replace(/<div class="back">.*?<\/div>/, '<h3>ルールの要点</h3>') + close, { full: true });
  if (v.k === 'party') {
    h = '<h3>パーティー</h3><div class="ilist">' + run.players.map(function (o) {
      return '<div class="irow"><img src="' + V.heroImg(o.ch) + '" alt=""><div class="grow"><b>' + esc(o.name) + '</b>（' + esc(D.CHARS[o.ch].name) + '）<p>HP ' + o.hp + '/' + maxHp(o) + '・' + o.gold + 'ゴールド・' + (o.row + 1) + '列・デッキ' + o.deck.length + '枚</p>' +
        '<p>' + o.relics.map(function (r) { return esc(V.relicName(r.id)); }).join('、') + '</p><p>' + o.potions.map(function (id) { return esc(V.potionName(id)); }).join('、') + '</p>' +
        '<button class="btn sm ghost" data-a="info" data-v="deck" data-pi="' + o.i + '">デッキを見る</button></div></div>';
    }).join('') + '</div>';
    return sheetWrap(h + close, { full: true });
  }
  if (v.k === 'rows') {
    h = '<h3>列の入れ替え</h3><div class="sub">戦闘の外では列（＝どの遭遇と戦うか）を入れ替えられます。</div><div class="opts">';
    run.players.forEach(function (o) { if (o.i !== A.me) h += '<button class="opt" data-a="swaprow" data-v="' + o.i + '">' + esc(o.name) + '（' + (o.row + 1) + '列）と入れ替える</button>'; });
    return sheetWrap(h + '</div>' + close);
  }
  if (v.k === 'relic') {
    var r = p.relics[v.i];
    if (!r) { A.ui.info = null; return ''; }
    var d = STS.RELICS[r.id] || {};
    h = '<div class="itemrow">' + V.relicIcon(r.id) + '<div class="t"><b>' + esc(d.name) + '</b><span>' + esc(V.RELIC_KIND[d.type] || '') + (d.price ? '・' + d.price + 'G' : '') + '</span></div></div><p class="evtext" style="margin-top:8px">' + esc(d.tx) + '</p>';
    if (d.activate && cs) h += '<button class="btn primary wide" data-a="userelic" data-v="' + esc(r.id) + '"' + (r.usedCombat ? ' disabled' : '') + '>使う</button>';
    return sheetWrap(h + close);
  }
  if (v.k === 'ability') {
    var c = D.CHARS[p.ch];
    return sheetWrap('<h3>' + esc(c.name) + 'の能力</h3><p class="evtext">' + esc(c.ability) + '</p>' + close);
  }
  if (v.k === 'potion') {
    var id = p.potions[v.slot];
    if (!id) { A.ui.info = null; return ''; }
    var pd = STS.POTIONS[id];
    h = '<div class="itemrow">' + V.potionIcon(id) + '<div class="t"><b>' + esc(pd.name) + '</b><span>' + esc(pd.tx) + '</span></div></div><div class="opts" style="margin-top:10px">';
    if (cs && !pd.passive && !pd.dieOnly) h += '<button class="opt" data-a="usepot" data-v="' + v.slot + '"><span class="br">使う</span></button>';
    if (!cs && pd.out) h += '<button class="opt" data-a="usepotout" data-v="' + v.slot + '"><span class="br">使う</span></button>';
    if (!cs) run.players.forEach(function (o) { if (o.i !== A.me) h += '<button class="opt" data-a="givepot" data-v="' + v.slot + '" data-to="' + o.i + '">' + esc(o.name) + 'に渡す</button>'; });
    h += '<button class="opt" data-a="droppot" data-v="' + v.slot + '">捨てる</button></div>';
    return sheetWrap(h + close);
  }
  if (v.k === 'enemy' && cs) {
    var e = null; cs.enemies.forEach(function (x) { if (x.u === v.u) e = x; });
    if (!e) { A.ui.info = null; return ''; }
    var m = STS.MONSTERS[e.id], cb = SES.query(run);
    var rows = V.behaviour(cb, e);
    h = '<div class="row"><div style="width:96px;height:96px;flex:0 0 auto" class="foe-art">' + V.enemyArt(m.art, m.name) + '</div><div><h3 style="margin:0">' + esc(m.name) + '</h3><div class="small">HP ' + e.hp + '/' + e.max + (e.blk ? '・ブロック' + e.blk : '') + '</div><div class="toks" style="justify-content:flex-start">' + tokHTML(e) + '</div>' +
      '<div class="small muted">' + (e.row < 0 ? 'ボス（全員を攻撃）' : (e.row + 1) + '列') + (m.type === 'die' ? '・ダイスで行動' : m.type === 'cube' ? '・行動は順番に進む' : '') + '</div></div></div>';
    if (V.PASSIVE[e.id]) h += '<p class="evtext" style="margin-top:8px">' + esc(V.PASSIVE[e.id]) + '</p>';
    h += '<table class="acttable">' + rows.map(function (r) { return '<tr class="' + (r.cur ? 'cur' : '') + '"><td>' + esc(r.k) + '</td><td><b>' + esc(r.name) + '</b><br>' + r.text + '</td></tr>'; }).join('') + '</table>';
    return sheetWrap(h + close);
  }
  if (v.k === 'hero' && cs) {
    var tpc = cs.pcs[v.i], P = run.players[v.i];
    h = '<h3>' + esc(P.name) + '（' + esc(D.CHARS[P.ch].name) + '）</h3><div class="small">HP ' + P.hp + '/' + maxHp(P) + '・ブロック' + tpc.blk + '・エナジー' + tpc.en + '・' + (tpc.row + 1) + '列</div><div class="toks" style="justify-content:flex-start">' + tokHTML(tpc) + '</div>';
    if (tpc.pow.length) h += '<p class="small">パワー：' + tpc.pow.map(function (x) { return esc(STS.CARDS[x.id].name + (x.up ? '+' : '')); }).join('、') + '</p>';
    h += '<p class="small">レリック：' + P.relics.map(function (r) { return esc(V.relicName(r.id)); }).join('、') + '</p>';
    h += '<h3>手札</h3><div class="cardgrid">' + tpc.hand.map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    h += '<div class="row wrap"><button class="btn sm ghost" data-a="info" data-v="draw" data-pi="' + v.i + '">山札</button><button class="btn sm ghost" data-a="info" data-v="disc" data-pi="' + v.i + '">捨て札</button><button class="btn sm ghost" data-a="info" data-v="exh" data-pi="' + v.i + '">廃棄</button></div>';
    return sheetWrap(h + close, { full: true });
  }
  if (v.k === 'powcard') return sheetWrap('<div class="cardgrid">' + V.card({ id: v.id, up: v.up }, { cls: 'big' }) + '</div>' + close);
  if (v.k === 'die' && cs) return sheetWrap('<h3>ダイス：' + (cs.die || '–') + '</h3><p class="evtext">ラウンドの始めに振るダイスの目で、多くの敵の行動と一部のレリック・カードの効果が決まります。' + (cs.dieRolled && cs.dieRolled !== cs.die ? '（最初の目は' + cs.dieRolled + '）' : '') + '</p>' + close);
  if (v.k === 'node') {
    var n = run.map && run.map.nodes[v.key];
    return sheetWrap('<h3>' + esc(n ? (D.ROOM[n.t] || {}).name : '') + '</h3>' + close);
  }
  A.ui.info = null;
  return '';
}
function sortCards(list) {
  var order = { A: 0, S: 1, P: 2, X: 3, T: 4, C: 5 };
  return list.slice().sort(function (a, b) {
    var da = STS.CARDS[a.id] || {}, db = STS.CARDS[b.id] || {};
    return (order[da.t] - order[db.t]) || String(da.name).localeCompare(String(db.name), 'ja') || ((a.up ? 1 : 0) - (b.up ? 1 : 0));
  });
}

/* ================================================================== result */
function resultHTML(run) {
  var win = run.result === 'victory', s = sheet();
  var p = me(run);
  if (!A.ui.awarded && !A.ui.awarding) awardBoxes(run);
  var stop = run.result === 'stopped';
  var h = '<div class="result"><div style="font-size:3rem">' + (win ? '🏆' : stop ? '🏕️' : '💀') + '</div><h1>' + (win ? '勝利！' : stop ? '冒険を終えた' : '敗北…') + '</h1>';
  h += '<p>倒したボス：' + run.bosses + '体（第' + run.act + '幕まで到達）' + (run.asc ? '・アセンション' + run.asc : '') + '</p>';
  h += '<div class="panel" style="max-width:420px;width:100%;text-align:left"><b>解放ボックス</b><p class="small">' + esc(p.name) + '：ボックスを' + (run.boxes || run.bosses + 1) + '個獲得しました。</p>' +
    (A.ui.awardMsg ? '<p class="small">' + esc(A.ui.awardMsg) + '</p>' : '') +
    (s.spare ? '<p class="small">余ったボックス ' + s.spare + '個を割り当ててください：</p><div class="row"><button class="btn sm" data-a="spare" data-v="colorless">無色カード（' + s.colorless + '/3）</button><button class="btn sm" data-a="spare" data-v="act4">第4幕（' + s.act4 + '/5）</button></div>' : '') + '</div>';
  h += '<div class="ilist" style="max-width:420px;width:100%;margin-top:12px">' + run.players.map(function (o) { return '<div class="irow"><img src="' + V.heroImg(o.ch) + '" alt=""><div><b>' + esc(o.name) + '</b><p>HP ' + Math.max(0, o.hp) + '/' + maxHp(o) + '・デッキ' + o.deck.length + '枚・レリック' + o.relics.length + '個</p></div></div>'; }).join('') + '</div>';
  h += '<div style="margin-top:18px;display:grid;gap:8px;width:min(340px,90vw)"><button class="btn primary" data-a="quit">タイトルへ</button><button class="btn ghost" data-a="info" data-v="deck">デッキを見る</button></div></div>';
  return h + infoHTML(run);
}
function awardBoxes(run) {
  A.ui.awarding = true;
  var s = sheet(), p = me(run), n = run.boxes || (run.bosses + 1);
  var need = Math.max(0, CHAR_FULL - s.ch[p.ch]);
  var toChar = Math.min(n, need);
  var before = charLevel(s.ch[p.ch]);
  s.ch[p.ch] += toChar;
  s.spare += n - toChar;
  var msgs = [];
  if (toChar) msgs.push(D.CHARS[p.ch].name + 'に' + toChar + '個');
  if (charLevel(s.ch[p.ch]) > before) msgs.push('カード解放レベル' + charLevel(s.ch[p.ch]) + 'に上がりました');
  // Ascension: defeat an Act II Boss (Act III solo) while playing at your highest unlocked level.
  var needBosses = run.players.length === 1 ? 3 : 2;
  if (run.bosses >= needBosses && run.asc >= s.asc && s.asc < 13) { s.asc = run.asc + 1; msgs.push('アセンション' + s.asc + 'が解放されました'); }
  saveSheet(s);
  A.ui.awardMsg = msgs.join('。');
  A.ui.awarded = true;
  if (!A.guest) store(A.host ? KEYS.coop : KEYS.save, null);
  else store(KEYS.join, null);
}

/* ================================================================== sessions */
function onSession(kind, x) {
  if (kind === 'ev') { A.evq.push(x); if (A.evq.length > 80) A.evq.splice(0, 40); }
  if (kind === 'error' && x && x.message) toast('エラー：' + x.message);
  render();
}
function newSeed() { return (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0; }
function startLocal(run, mode) {
  A.ui = {};
  A.me = 0;
  var sess = new SES.Local(run, { seats: [0], onCheckpoint: function (snap) { if (mode === 'solo') store(KEYS.save, { v: 3, run: snap, at: Date.now() }); } });
  A.sess = sess; A.screen = 'game';
  sess.on(onSession);
  sess.start();
  render();
  return sess;
}
function startSolo() {
  var s = sheet(), st = A.setup;
  var cfg = { players: [{ name: PREF.name || D.CHARS[st.ch].name, ch: st.ch, unlock: charLevel(s.ch[st.ch]) }], asc: Math.min(st.asc, s.asc), seed: newSeed(),
    colorless: colorlessOn(s), act4: act4On(s), charUnlock: charUnlockMap(s) };
  var run = STS.Game.newRun(cfg);
  store(KEYS.save, { v: 3, run: run, at: Date.now() });
  startLocal(run, 'solo');
}
function quitGame() {
  if (A.guest) { try { A.guest.close(); } catch (e) {} }
  if (A.host) { try { A.host.close(); } catch (e) {} }
  if (A.sess && A.sess.close) A.sess.close();
  A.sess = null; A.host = null; A.guest = null; A.ui = {}; A.screen = 'title';
  music('title');
  render();
}

/* ---------- online ---------- */
function NET() { return window.IBARA_NET; }
function readName() { var el = document.getElementById('nm'); if (el) { PREF.name = SES.cleanName(el.value); savePrefs(); } return PREF.name || D.CHARS[A.coop.ch || 'R'].name; }
function hostRoom(saved) {
  var net = NET(); if (!net) { toast('通信モジュールを読み込めませんでした。'); return; }
  var s = sheet();
  var name = saved ? PREF.name || '冒険者' : readName();
  var code = saved ? saved.code : net.makeCode();
  var link = net.makeLink(NET_KIND);
  A.coop.err = null; A.coop.busy = true; render();
  link.host(code).then(function () {
    var ch = saved ? saved.roster[0].ch : A.coop.ch;
    var roster = new SES.Roster({ name: name, ch: ch, unlock: charLevel(s.ch[ch]), token: token() });
    if (saved) {
      roster.slots = saved.roster.map(function (r, i) { return { name: r.name, ch: r.ch, unlock: r.unlock, token: i === 0 ? token() : r.token, cid: null, online: i === 0 }; });
      roster.started = true;
    }
    var host = new SES.Host(link, roster, { settings: { asc: A.setup.asc } });
    A.host = host; A.coop.code = code; A.coop.busy = false;
    host.on(function () { render(); });
    if (saved) beginHostGame(host, saved.run);
    else { A.screen = 'lobby'; render(); }
  }, function (e) {
    A.coop.busy = false;
    A.coop.err = e && e.code === 'taken' ? 'その部屋コードは使われています。もう一度お試しください。' : '部屋を作れませんでした（通信エラー）。';
    render();
  });
}
function beginHostGame(host, run) {
  A.ui = {}; A.me = 0;
  var code = A.coop.code;
  var local = new SES.Local(run, { seats: [0], onCheckpoint: function (snap) {
    store(KEYS.coop, { v: 3, code: code, run: snap, roster: host.roster.slots.map(function (s) { return { name: s.name, ch: s.ch, unlock: s.unlock, token: s.token }; }), at: Date.now() });
  } });
  A.sess = local; A.screen = 'game';
  local.on(onSession);
  host.begin(local);
  local.start();
  render();
}
function startCoop() {
  var host = A.host, s = sheet();
  if (!host) return;
  var slots = host.roster.slots;
  var chs = slots.map(function (x) { return x.ch; });
  if (slots.length < 2 || new Set(chs).size !== chs.length) { toast('違うキャラクターを選んだ2〜4人がそろってから始めてください。'); return; }
  host.settings = { asc: Math.min(A.setup.asc, s.asc) };
  var cfg = { players: slots.map(function (x) { return { name: x.name, ch: x.ch, unlock: x.unlock }; }), asc: host.settings.asc, seed: newSeed(),
    colorless: colorlessOn(s), act4: act4On(s), charUnlock: charUnlockMap(s) };
  var run = STS.Game.newRun(cfg);
  beginHostGame(host, run);
}
function joinRoom(code, tok, ch, name) {
  var net = NET(); if (!net) { toast('通信モジュールを読み込めませんでした。'); return; }
  code = net.cleanCode(code || '');
  if (code.length !== 4) { A.coop.err = '4文字の部屋コードを入れてください。'; render(); return; }
  var s = sheet();
  ch = ch || A.coop.ch || 'R';
  var link = net.makeLink(NET_KIND);
  A.coop.err = null; A.coop.code = code; render();
  link.join(code).then(function () {
    var guest = new SES.Guest(link, { token: tok || token(), name: name || PREF.name || D.CHARS[ch].name, ch: ch, unlock: charLevel(s.ch[ch]) });
    A.guest = guest;
    store(KEYS.join, { code: code, token: guest.hello.token, ch: ch, name: guest.hello.name });
    guest.on(function (kind, x) {
      if (kind === 'error' && x && x.rejected) { A.coop.err = x.text; try { guest.close(); } catch (e) {} A.guest = null; A.screen = 'coop'; render(); return; }
      if (kind === 'close') { toast('ホストとの接続が切れました。タイトルから再接続できます。'); }
      if (kind === 'change' && guest.started && A.screen !== 'game') { A.sess = guest; A.me = guest.seat; A.ui = {}; A.screen = 'game'; }
      if (kind === 'ev') A.evq.push(x);
      if (A.sess === guest) A.me = guest.seat;
      render();
    });
    guest.sendHello();
    A.screen = 'lobby'; render();
  }, function (e) {
    A.coop.err = e && e.code === 'notfound' ? 'その部屋が見つかりません。コードを確認してください。' : '接続できませんでした。';
    render();
  });
}

/* ================================================================== input */
function curPrompt() { return myPrompt(); }
function cmd(c) {
  if (!A.sess) return;
  return A.sess.command(A.me, c).then(function () { render(); }, function (e) { toast(e && e.message || String(e)); render(); });
}
function answer(id, v) {
  if (!A.sess) return;
  A.ui.aim = null;
  A.sess.answer(id, v);
  sfx('click');
  render();
}
function myPc(run) { return run && run.combat && run.combat.pcs ? run.combat.pcs[A.me] : null; }
function aliveEnemies(run) { return run.combat.enemies.filter(function (e) { return !e.dead && !e.fled; }); }
function playSelected() {
  var run = A.sess.run(), pc = myPc(run);
  if (!pc || A.ui.sel == null) return;
  var c = pc.hand.filter(function (x) { return x.u === A.ui.sel; })[0];
  if (!c) { A.ui.sel = null; render(); return; }
  var info = (A.sess.hand(A.me) || {})[c.u] || {};
  if (info.why) { toast(info.why); return; }
  var d = STS.CARDS[c.id], tg = typeof d.tg === 'string' ? d.tg : null;
  var title = d.name + (c.up ? '+' : '') + '：';
  if (tg === 'E') {
    var al = aliveEnemies(run);
    if (al.length > 1) { A.ui.aim = { kind: 'enemy', set: al.map(function (e) { return e.u; }), u: c.u, title: title + '対象の敵を選択' }; render(); return; }
  } else if (tg === 'R') {
    var cb = SES.query(run), rows = cb.rowsWithEnemies();
    var onlyBoss = cb.alive().every(function (e) { return e.row === -1; });
    if (rows.length > 1 && !onlyBoss) { A.ui.aim = { kind: 'row', set: rows, u: c.u, title: title + '範囲攻撃する列を選択' }; render(); return; }
  } else if (tg === 'P') {
    var ps = run.combat.pcs.filter(function (x) { return !x.dead; }).map(function (x) { return x.i; });
    if (ps.length > 1) { A.ui.aim = { kind: 'player', set: ps, u: c.u, title: title + '対象のプレイヤーを選択' }; render(); return; }
  }
  A.ui.sel = null;
  sfx('card');
  cmd({ type: 'play', u: c.u });
}
function finishAim(kind, v) {
  var aim = A.ui.aim;
  if (aim) {
    A.ui.aim = null; A.ui.sel = null;
    if (aim.shiv) { sfx('shiv'); return cmd({ type: 'shiv', target: v }); }
    var c = { type: 'play', u: aim.u };
    if (kind === 'enemy') c.target = v; else if (kind === 'row') c.row = v; else c.player = v;
    sfx('card');
    return cmd(c);
  }
  var cur = curPrompt();
  if (cur && (cur.q.type === kind)) answer(cur.id, v);
}
function onClick(ev) {
  var el = ev.target.closest('[data-a]');
  if (!el) return;
  var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
  var run = A.sess && A.sess.run();
  var cur = curPrompt();
  switch (a) {
    case 'title': A.screen = 'title'; A.ui = {}; render(); return;
    case 'go': A.screen = v; A.coop.err = null; render(); return;
    case 'pickch':
      if (A.screen === 'solo') A.setup.ch = v;
      else if (A.screen === 'coop') A.coop.ch = v;
      else if (A.screen === 'lobby') {
        if (A.host && !A.host.roster.started) { if (A.host.roster.slots.some(function (s, i) { return i && s.ch === v; })) { toast('そのキャラクターは選ばれています。'); return; } A.host.roster.setHost({ ch: v, unlock: charLevel(sheet().ch[v]) }); A.host.publishRoster(); }
        else if (A.guest) { A.guest.hello.ch = v; A.guest.hello.unlock = charLevel(sheet().ch[v]); A.guest.sendHello(); }
      }
      render(); return;
    case 'asc': A.setup.asc = +v; if (A.host) { A.host.settings = { asc: +v }; A.host.publishRoster(); } render(); return;
    case 'startsolo': startSolo(); return;
    case 'resume': { var sv = load(KEYS.save, null); if (sv && sv.run) startLocal(sv.run, 'solo'); return; }
    case 'host': hostRoom(null); return;
    case 'rehost': { var cs = load(KEYS.coop, null); if (cs && cs.run) hostRoom(cs); return; }
    case 'join': { var code = (document.getElementById('code') || {}).value || A.coop.code; readName(); joinRoom(code); return; }
    case 'rejoin': { var j = load(KEYS.join, null); if (j) joinRoom(j.code, j.token, j.ch, j.name); return; }
    case 'leavelobby': quitGame(); A.screen = 'coop'; render(); return;
    case 'kick': if (A.host) { var gone = A.host.roster.kick(+v); if (gone && gone.cid) try { A.host.link.drop(gone.cid); } catch (e) {} A.host.publishRoster(); render(); } return;
    case 'startcoop': startCoop(); return;
    case 'editunlock': A.ui.editUnlock = !A.ui.editUnlock; render(); return;
    case 'box': {
      var sh = sheet(), k = el.getAttribute('data-k'), n = +v;
      if (k === 'colorless' || k === 'act4') sh[k] = sh[k] === n ? n - 1 : n; else sh.ch[k] = sh.ch[k] === n ? n - 1 : n;
      saveSheet(sh); render(); return;
    }
    case 'ascadj': { var s2 = sheet(); s2.asc = Math.max(0, Math.min(13, s2.asc + (+v))); saveSheet(s2); render(); return; }
    case 'spare': {
      var s3 = sheet(); if (s3.spare <= 0) return;
      var cap = v === 'colorless' ? D.UNLOCK.colorless : D.UNLOCK.act4;
      if (s3[v] >= cap) { toast('すでにすべて埋まっています。'); return; }
      s3[v]++; s3.spare--; saveSheet(s3); render(); return;
    }
    case 'quit': quitGame(); return;
    case 'abandon':
      if (!window.confirm('この冒険をあきらめますか？（セーブは消えます）')) return;
      store(A.host ? KEYS.coop : KEYS.save, null); quitGame(); return;
    case 'ans': {
      if (!cur) return;
      var pid = +el.getAttribute('data-p');
      if (pid && pid !== cur.id) return;
      var val; try { val = JSON.parse(v); } catch (e) { val = v; }
      answer(cur.id, val); return;
    }
    case 'msel': {
      if (!cur) return;
      var u = +el.getAttribute('data-u'), sel = A.ui.msel || (A.ui.msel = []);
      var i = sel.indexOf(u);
      if (i >= 0) sel.splice(i, 1);
      else { if (cur.q.max === 1) sel.length = 0; if (sel.length < cur.q.max) sel.push(u); }
      render(); return;
    }
    case 'mselok': if (cur) answer(cur.id, (A.ui.msel || []).slice()); return;
    case 'node': if (cur && cur.q.type === 'map') { sfx('step'); answer(cur.id, v); } return;
    case 'nodeinfo': return;
    case 'card': {
      var uu = +el.getAttribute('data-u');
      if (A.ui.aim) { A.ui.aim = null; }
      if (A.ui.sel === uu) { playSelected(); return; }
      A.ui.sel = uu; sfx('click'); render(); return;
    }
    case 'playsel': playSelected(); return;
    case 'unsel': A.ui.sel = null; render(); return;
    case 'aimcancel': A.ui.aim = null; A.ui.sel = null; render(); return;
    case 'foe': {
      var fu = +el.getAttribute('data-u');
      var aim = aimState(run, cur);
      if (aim && aim.kind === 'enemy' && aim.set.indexOf(fu) >= 0) { finishAim('enemy', fu); return; }
      A.ui.info = { k: 'enemy', u: fu }; render(); return;
    }
    case 'aimrow': { var aim2 = aimState(run, cur); if (aim2 && aim2.kind === 'row') finishAim('row', +v); return; }
    case 'hero': {
      var aim3 = aimState(run, cur);
      if (aim3 && aim3.kind === 'player' && aim3.set.indexOf(+v) >= 0) { finishAim('player', +v); return; }
      if (aim3 && aim3.kind === 'row') { var rr = run.combat.pcs[+v].row; if (aim3.set.indexOf(rr) >= 0) { finishAim('row', rr); return; } }
      A.ui.info = { k: 'hero', i: +v }; render(); return;
    }
    case 'end': A.ui.sel = null; A.ui.aim = null; sfx('turn'); cmd({ type: 'end' }); return;
    case 'unready': cmd({ type: 'unready' }); return;
    case 'shiv': {
      var al = aliveEnemies(run);
      if (al.length > 1) { A.ui.aim = { kind: 'enemy', set: al.map(function (e) { return e.u; }), shiv: true, title: 'ナイフ：対象の敵を選択' }; render(); return; }
      sfx('shiv'); cmd({ type: 'shiv' }); return;
    }
    case 'miracle': sfx('energy'); cmd({ type: 'miracle' }); return;
    case 'pow': {
      var pc = myPc(run), pu = +el.getAttribute('data-u');
      var inst = pc && pc.pow.filter(function (p) { return p.u === pu; })[0];
      if (!inst) return;
      var pd = STS.CARDS[inst.id];
      if (pd.pw && pd.pw.activate && !inst.usedTurn && A.sess.playOpen() && !pc.ready) { cmd({ type: 'power', u: pu }); return; }
      A.ui.info = { k: 'powcard', id: inst.id, up: inst.up }; render(); return;
    }
    case 'relic': A.ui.info = { k: 'relic', i: +v }; render(); return;
    case 'userelic': A.ui.info = null; sfx('relic'); cmd({ type: 'relic', id: v }); return;
    case 'pot': A.ui.info = { k: 'potion', slot: +v }; render(); return;
    case 'usepot': A.ui.info = null; sfx('buff'); cmd({ type: 'potion', slot: +v }); return;
    case 'usepotout': A.ui.info = null; sfx('heal'); cmd({ type: 'potionOut', slot: +v }); return;
    case 'givepot': A.ui.info = null; cmd({ type: 'givePotion', slot: +v, to: +el.getAttribute('data-to') }); return;
    case 'droppot': A.ui.info = null; cmd({ type: 'discardPotion', slot: +v }); return;
    case 'info': { var pi = el.getAttribute('data-pi'); A.ui.info = { k: v, pi: pi == null ? null : +pi }; if (v === 'node') A.ui.info.key = v; render(); return; }
    case 'close': A.ui.info = null; render(); return;
    case 'swaprow': A.ui.info = null; cmd({ type: 'swapRows', a: A.me, b: +v }); return;
    case 'giftgold': case 'shopgift': A.ui.gift = A.ui.gift ? null : {}; render(); return;
    case 'giftto': A.ui.gift = { to: +v }; render(); return;
    case 'giftsend': {
      var g = A.ui.gift || {};
      if (g.to == null) { toast('渡す相手を選んでください。'); return; }
      var n2 = +v;
      if (el.getAttribute('data-shop') === '1' && cur && cur.q.type === 'shop') { answer(cur.id, { act: 'giveGold', to: g.to, n: n2 }); A.ui.gift = null; return; }
      A.ui.gift = null; sfx('coin'); cmd({ type: 'giveGold', to: g.to, n: n2 }); return;
    }
    case 'togglemusic': PREF.music = !PREF.music; savePrefs(); if (SFX && SFX.setMusic) SFX.setMusic(PREF.music); render(); return;
    case 'togglesfx': PREF.sfx = !PREF.sfx; savePrefs(); render(); return;
  }
}

/* ================================================================== effects after drawing */
function elFor(sel) { return $app.querySelector(sel); }
function floatAt(el, text, cls) { if (!FX || !el) return; var c = FX.center(el, 0.35); FX.float(c.x, c.y, text, cls); }
function banner(text) {
  var layer = document.getElementById('floatLayer'); if (!layer) return;
  Array.prototype.forEach.call(layer.querySelectorAll('.banner'), function (x) { x.remove(); });
  var b = document.createElement('div'); b.className = 'banner'; b.textContent = text; layer.appendChild(b);
  setTimeout(function () { b.remove(); }, 1700);
}
function afterDraw() {
  var run = A.sess && A.sess.run();
  // music
  if (A.screen === 'game' && run) {
    var scene = run.combat && run.combat.pcs ? (run.combat.kind === 'boss' ? 'boss' : 'combat') : run.room && run.room.t === 'R' ? 'rest' : 'map';
    music(run.phase === 'over' ? null : scene);
  } else music('title');
  // map: scroll to the current position the first time
  var mv = $app.querySelector('.mapview');
  if (mv && !mv.getAttribute('data-scrolled') && !A.ui.mapScrolled) {
    var curNode = mv.querySelector('.mapnode.cur') || mv.querySelector('.mapnode.reach');
    if (curNode) { var r = curNode.getBoundingClientRect(), mr = mv.getBoundingClientRect(); mv.scrollTop += r.top - mr.top - mr.height * 0.6; }
    else mv.scrollTop = mv.scrollHeight;
    A.ui.mapScrolled = true;
  }
  if (!mv) A.ui.mapScrolled = false;
  if (A.ui.sel != null && run) { var pc = myPc(run); if (!pc || !pc.hand.some(function (c) { return c.u === A.ui.sel; })) A.ui.sel = null; }
  var evs = A.evq.splice(0);
  evs.forEach(function (e) {
    try {
      switch (e.t) {
        case 'edmg': { var fe = elFor('.foe[data-u="' + e.u + '"]'); if (e.hp > 0) { floatAt(fe, '-' + e.hp, 'dmg'); sfx(e.hp >= 6 ? 'bighit' : 'hit', e.hp / 3); FX && FX.shake(fe, 5, 260); } else if (e.blocked) { floatAt(fe, 'ブロック', 'blk'); sfx('blocked'); } break; }
        case 'pdmg': { var he = elFor('.hero[data-pi="' + e.i + '"]'); if (e.blocked) floatAt(he, 'ブロック' + e.blocked, 'blk'); break; }
        case 'hp': { if (e.n < 0) { floatAt(elFor('.hero[data-pi="' + e.i + '"]') || elFor('.stat.hp'), String(e.n), 'hurt'); if (e.i === A.me) { sfx('hurt'); FX && FX.shake($app.querySelector('.combat') || $app, 6, 300); } } break; }
        case 'heal': floatAt(elFor('.hero[data-pi="' + e.i + '"]') || elFor('.stat.hp'), '+' + e.n, 'heal'); if (e.i === A.me) sfx('heal'); break;
        case 'blk': if (e.n > 0) { floatAt(elFor('.hero[data-pi="' + e.i + '"]'), '+' + e.n, 'blk'); if (e.i === A.me) sfx('block'); } break;
        case 'die':
          if (e.u != null) { sfx('death'); }
          else { A.ui.dieAnim = true; sfx('die'); setTimeout(function () { A.ui.dieAnim = false; }, 700); }
          break;
        case 'round': if (e.n > 1) banner('ラウンド ' + e.n); break;
        case 'enemyTurn': sfx('enemyturn'); break;
        case 'combatStart': banner('戦闘開始'); break;
        case 'combatEnd': banner(e.result === 'victory' ? '勝利！' : '敗北…'); sfx(e.result === 'victory' ? 'victory' : 'defeat'); break;
        case 'gold': if (e.i === A.me && e.n > 0) { floatAt(elFor('.stat.gold'), '+' + e.n + 'G', 'st'); sfx('coin'); } break;
        case 'gainRelic': if (e.i === A.me) sfx('relic'); break;
        case 'key': banner({ ruby: 'ルビーの鍵', sapphire: 'サファイアの鍵', emerald: 'エメラルドの鍵' }[e.k] + 'を手に入れた'); break;
        case 'act': banner('第' + e.act + '幕'); break;
        case 'bossDown': banner('ボス撃破！'); break;
        case 'shuffle': if (e.i === A.me) sfx('shuffle'); break;
        case 'stance': if (e.i === A.me) sfx(e.s === 'wrath' ? 'wrath' : e.s === 'calm' ? 'calm' : e.s === 'divinity' ? 'divine' : 'click'); break;
        case 'channel': if (e.i === A.me) sfx(e.o === 'frost' ? 'frost' : e.o === 'dark' ? 'void' : 'zap'); break;
        case 'exhaust': if (e.i === A.me) sfx('exhaust'); break;
        case 'error': if (e.i === A.me) toast(e.msg); break;
        case 'facing': if (e.i === A.me) banner('対面：' + (V.FACING[e.k] || '')); break;
        case 'event': sfx('open'); break;
      }
    } catch (err) { /* ignore effect errors */ }
  });
}

/* ================================================================== boot */
function boot() {
  if (FX && FX.init) FX.init(document.getElementById('fx'), document.getElementById('floatLayer'));
  document.addEventListener('click', onClick);
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t && t.id === 'nm') { PREF.name = SES.cleanName(t.value); savePrefs(); }
    if (t && t.id === 'code') A.coop.code = String(t.value || '').toUpperCase();
  });
  document.addEventListener('pointerdown', function () { if (SFX && SFX.unlock) try { SFX.unlock(); } catch (e) {} }, { passive: true });
  window.addEventListener('resize', function () { render(); });
  render();
}
STS.UI = { render: render, state: A, startSolo: startSolo, sheet: sheet, startRun: function (run) { return startLocal(run, 'test'); } };
boot();
})();
