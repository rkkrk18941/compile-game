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
var PREF = Object.assign({ name: '', music: true, sfx: true, bgm: 'gemini', bgmVolume: 0.25, bgmScenes: null, anim: 1, explainEffects: true }, load(KEYS.prefs, {}));
// Sound permission is per visit; song, volume and effect preferences remain saved.
var EXTERNAL_AUDIO = true;
STS.Explain.enabled = function () { return PREF.explainEffects !== false; };
function savePrefs() { store(KEYS.prefs, PREF); }
function applyBgmPrefs() {
  if (SFX) { SFX.on = PREF.sfx; if (SFX.setExternalAudio) SFX.setExternalAudio(EXTERNAL_AUDIO); }
  if (!SFX || !SFX.configureBgm) return;
  PREF.bgmScenes = SFX.normalizeBgm(PREF.bgmScenes);
  SFX.configureBgm({ mode: PREF.bgm, volume: PREF.bgmVolume, scenes: PREF.bgmScenes });
  SFX.setMusic(PREF.music);
}

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
var A = { screen: 'title', sess: null, host: null, guest: null, me: 0, ui: {}, setup: { ch: 'R', asc: 0, mode: 'normal' }, coop: {}, evq: [] };
window.STS_APP = A;
/* jsdom tests and reduced setups replay instantly (same final state, no timers). */
var NO_ANIM = (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) || /[?&]anim=off/.test(location.search);
var DIR = new STS.Director({
  me: function () { return A.me; },
  setView: function (f) { A.view = f; },
  draw: function () { draw(); },
  sfx: function (n, k) { sfx(n, k); },
  speed: function () { return PREF.anim || 1; },
  instant: function () { return NO_ANIM || PREF.anim === 0 || A.screen !== 'game'; },
  playerName: function (i) { if (i === A.me) return 'あなた'; var run = A.sess && A.sess.run(); return run && run.players[i] ? run.players[i].name : '仲間'; },
  enemyName: function (u) {
    var run = A.sess && A.sess.run(), cs = run && run.combat && run.combat.pcs ? run.combat : A.lastCombat, e = null;
    if (cs) cs.enemies.forEach(function (x) { if (x.u === u) e = x; });
    return e ? ((STS.MONSTERS[e.id] || {}).name || e.id) : '敵';
  },
  round: function () { var f = A.view; if (f && f.vs) return f.vs.r; var run = A.sess && A.sess.run(); return run && run.combat ? run.combat.round : 0; },
  partySize: function () { var run = A.sess && A.sess.run(); return run ? run.players.length : 1; },
  fitCards: function (root) { fitCards(root); }
});

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(A.toastT); A.toastT = setTimeout(function () { el.classList.remove('on'); }, 2600);
  sfx('error');
}
function sfx(name, k) { if (!EXTERNAL_AUDIO && PREF.sfx && SFX && SFX.play) try { SFX.play(name, k); } catch (e) {} }
function music(scene) { if (SFX && SFX.music) try { SFX.music(scene); } catch (e) {} }

var rafPending = false, drawing = false;
function render() { if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; draw(); }); }
/* Renders the whole screen as markup, then morphs the live page to match it: unchanged elements stay in place,
   so running effects, scroll positions and focus survive, and cards / creatures can glide to new places. */
function draw() {
  if (drawing) return;
  if (DIR.waiting() && A.screen === 'game' && !NO_ANIM) return; // the director draws as soon as it starts
  drawing = true;
  try {
    var keep = {};
    Array.prototype.forEach.call($app.querySelectorAll('[data-keep]'), function (el) { keep[el.getAttribute('data-keep')] = [el.scrollTop, el.scrollLeft]; });
    var html;
    try { html = screenHTML(); } catch (e) { console.error(e); html = '<div class="page"><h2>表示エラー</h2><p class="muted">' + esc(e && e.message) + '</p><button class="btn" data-a="title">タイトルへ</button></div>'; }
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    STS.HelpUI.annotate(tpl.content);
    Array.prototype.forEach.call(tpl.content.querySelectorAll('.card .ctext > span'), keepWords);
    var flip = flipBefore();
    STS.morph($app, tpl.content);
    Array.prototype.forEach.call($app.querySelectorAll('[data-keep]'), function (el) { var k = keep[el.getAttribute('data-keep')]; if (k && (el.scrollTop !== k[0] || el.scrollLeft !== k[1])) { el.scrollTop = k[0]; el.scrollLeft = k[1]; } });
    fitCards($app);
    flipAfter(flip);
    if (STS.HelpUI.state.open) $app.inert = true;
    afterDraw();
  } finally { drawing = false; }
}
/* Smooth movement: hand cards slide when one leaves, newly drawn cards fly in from the draw pile,
   creatures close ranks when one falls. */
function flipBefore() {
  if (!$app.querySelector('.classic-combat')) return null;
  var m = {};
  Array.prototype.forEach.call($app.querySelectorAll('.hand .card[data-u], .foe[data-u], .hero[data-pi]'), function (el) { m[STS.morph.keyOf(el)] = el.getBoundingClientRect(); });
  var dp = $app.querySelector('.pile.draw');
  m.__draw = dp ? dp.getBoundingClientRect() : null;
  m.__hand = !!$app.querySelector('.hand');
  return m;
}
function flipAfter(m) {
  if (!m || (FX && FX.reduce)) return;
  Array.prototype.forEach.call($app.querySelectorAll('.hand .card[data-u], .foe[data-u], .hero[data-pi]'), function (el) {
    if (!el.animate) return;
    var k = STS.morph.keyOf(el), old = m[k], r = el.getBoundingClientRect();
    try {
      if (old) {
        var dx = old.left - r.left, dy = old.top - r.top;
        if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1)', composite: 'add' });
      } else if (m.__hand && m.__draw && el.classList.contains('card')) {
        var d = m.__draw, fx = d.left + d.width / 2 - (r.left + r.width / 2), fy = d.top + d.height / 2 - (r.top + r.height / 2);
        el.animate([{ transform: 'translate(' + fx + 'px,' + fy + 'px) scale(.3) rotate(-10deg)', opacity: 0 }, { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1)', composite: 'add' });
      }
    } catch (e) {}
  });
}
/* Card text: the largest size that fits the printed panel (never outside the card). Sizes are cached per card
   width and text, and recomputed once the web fonts have loaded. */
var FITC = Object.create(null);
function fitCards(root) {
  var cards = root.querySelectorAll('.card'), jobs = [], i, j;
  for (i = 0; i < cards.length; i++) {
    var c = cards[i], w = c.offsetWidth;
    if (!w) continue;
    var t = c.querySelector('.ctext > span'), n = c.querySelector('.cname > span');
    jobs.push({ c: c, w: w, t: t, n: n, cost: !!c.querySelector('.cost'), tk: t ? 'T' + w + '|' + t.innerHTML : null, nk: n ? 'N' + w + '|' + (c.querySelector('.cost') ? 1 : 0) + n.textContent : null });
  }
  var miss = [];
  for (i = 0; i < jobs.length; i++) { j = jobs[i]; if ((j.t && !FITC[j.tk]) || (j.n && !FITC[j.nk])) miss.push(j); else applyFit(j); }
  for (i = 0; i < miss.length; i++) {
    j = miss[i];
    if (j.t && !FITC[j.tk]) FITC[j.tk] = measureText(j);
    if (j.n && !FITC[j.nk]) FITC[j.nk] = measureName(j);
    applyFit(j);
  }
}
function applyFit(j) {
  if (j.t) { var a = FITC[j.tk]; var fs = a.fs + 'px'; if (j.t.style.fontSize !== fs) j.t.style.fontSize = fs; j.t.parentNode.classList.toggle('clip', !!a.clip); }
  if (j.n) { var b = FITC[j.nk]; var ns = (Math.floor(b.fs * 4) / 4) + 'px'; if (j.n.style.fontSize !== ns) j.n.style.fontSize = ns; j.n.parentNode.classList.toggle('wide', !!b.wide); }
}
function measureText(j) {
  var t = j.t, box = t.parentNode, W = box.clientWidth, H = box.clientHeight, w = j.w;
  var hi = Math.min(w * 0.135, 7 + w * 0.06), lo = Math.max(5.2, w * 0.062), best = lo;
  function q(fs) { return Math.floor(fs * 4) / 4; } // quarter pixels: the applied size is exactly the measured one
  function fits(fs) { t.style.fontSize = fs + 'px'; return t.scrollHeight <= H + 0.5 && t.scrollWidth <= W + 0.5; }
  hi = q(hi); lo = q(lo); best = lo;
  if (fits(hi)) return { fs: hi };
  for (var k = 0; k < 7; k++) { var m = q((lo + hi) / 2); if (m <= lo || m >= hi) break; if (fits(m)) { best = m; lo = m; } else hi = m; }
  return { fs: best, clip: !fits(best) };
}
function measureName(j) {
  var n = j.n, w = j.w, max = Math.min(w * 0.125, 5 + w * 0.065);
  n.style.fontSize = max + 'px';
  var tw = n.scrollWidth || n.offsetWidth || 1;
  var min = Math.max(4, w * 0.07);
  if (!j.cost) return { fs: tw <= w * 0.84 ? max : Math.max(min, max * w * 0.84 / tw * 0.98) };
  if (tw <= w * 0.6) return { fs: max };
  return { fs: tw <= w * 0.735 ? max : Math.max(min, max * w * 0.735 / tw * 0.98), wide: true };
}
// "2ダメージ" / "ブロック1" style phrases never split across lines on a card face.
var NOBREAK = /([0-9X]+(?:回)?(?:ダメージ|枚|エナジー)|ダメージ|ブロック[0-9X]*|エナジー[0-9X]*|[^\s。、（）()]{1,4}[0-9X]+)/g;
function keepWords(el) {
  if (el.getAttribute('data-nb')) return;
  el.setAttribute('data-nb', '1');
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(function (t) {
    if (t.parentNode.classList && t.parentNode.classList.contains('nb')) return;
    var v = t.nodeValue; NOBREAK.lastIndex = 0;
    if (!NOBREAK.test(v)) return;
    var frag = document.createDocumentFragment(), last = 0; NOBREAK.lastIndex = 0; var m;
    while ((m = NOBREAK.exec(v))) {
      if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
      var sp = document.createElement('span'); sp.className = 'nb'; sp.textContent = m[0]; frag.appendChild(sp); last = m.index + m[0].length;
    }
    if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
    t.parentNode.replaceChild(frag, t);
  });
  // Bind digits to the keyword they touch (1+ダメージ, 弱体化+1).
  Array.prototype.forEach.call(el.querySelectorAll('.kw'), function (k) {
    var grp = [k], p = k.previousSibling, q = k.nextSibling, m;
    if (p && p.nodeType === 3 && (m = p.nodeValue.match(/[0-9X+＋]+$/))) { p.nodeValue = p.nodeValue.slice(0, -m[0].length); var a1 = document.createTextNode(m[0]); k.parentNode.insertBefore(a1, k); grp.unshift(a1); }
    if (q && q.nodeType === 3 && (m = q.nodeValue.match(/^[0-9X+＋]*[。、]?/)) && m[0]) { q.nodeValue = q.nodeValue.slice(m[0].length); var b1 = document.createTextNode(m[0]); k.parentNode.insertBefore(b1, q); grp.push(b1); }
    if (grp.length < 2) return;
    var w = document.createElement('span'); w.className = 'nb'; k.parentNode.insertBefore(w, grp[0]);
    grp.forEach(function (x) { w.appendChild(x); });
  });
}
function screenHTML() {
  switch (A.screen) {
    case 'title': return titleHTML();
    case 'solo': return soloHTML();
    case 'coop': return coopHTML();
    case 'lobby': return lobbyHTML();
    case 'characters': return characterSelectionHTML();
    case 'unlocks': return unlocksHTML();
    case 'rules': return rulesHTML();
    case 'settings': return '<div class="page settings-page" data-keep="settings-page"><div class="settings-heading"><h2>設定</h2><button class="btn ghost" data-a="title">戻る</button></div>' + settingsContent() + '</div>';
    case 'game': return gameHTML();
    default: return titleHTML();
  }
}

/* ================================================================== title / setup */
function titleHTML() {
  var save = load(KEYS.save, null), coop = load(KEYS.coop, null), join = load(KEYS.join, null);
  var s = sheet();
  var h = '<div class="title"><div class="title-bg" style="background-image:url(img/title.jpg)"></div>' +
    '<div class="title-tools" role="group" aria-label="ヘルプと設定">' +
    '<button type="button" class="ibtn" data-help="" aria-label="用語・効果の解説" title="用語・効果の解説">？</button>' +
    '<button type="button" class="ibtn" data-a="go" data-v="settings" aria-label="設定・BGM" title="設定・BGM"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M9 3h6l.5 3 2 1.2 2.8-1 3 5.2-2.3 2v2.3l2.3 2-3 5.2-2.8-1-2 1.2-.5 3H9l-.5-3-2-1.2-2.8 1-3-5.2 2.3-2v-2.3l-2.3-2 3-5.2 2.8 1 2-1.2z" transform="translate(2 0) scale(.83)"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>' +
    '<button type="button" class="ibtn title-audio" data-a="externalaudio" aria-pressed="' + !EXTERNAL_AUDIO + '" aria-label="' + (EXTERNAL_AUDIO ? 'ゲーム音を使う（現在は外部の音声を優先）' : 'ゲーム音を止めて外部の音声を優先する') + '" title="' + (EXTERNAL_AUDIO ? 'ゲーム音オフ・外部音声を優先中' : 'ゲーム音オン') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' + (EXTERNAL_AUDIO ? '<path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' : '<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>') + '</svg></button></div>' +
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
/* The same controls are available before starting and from the in-game menu. */
function bgmLibrary() { return window.IBARA_BGM_LIBRARY || []; }
function externalAudioButton() {
  return '<button class="btn ghost external-audio" data-a="externalaudio" aria-pressed="' + EXTERNAL_AUDIO + '">' + (EXTERNAL_AUDIO ? 'ゲーム音を使う' : '外部の音声を優先する') + '<span class="sub">' + (EXTERNAL_AUDIO ? '現在はYouTubeなどの音声を優先' : 'ゲームのBGM・効果音を停止') + '</span></button>';
}
function bgmZone() { return A.ui.bgmZone === 'explore' ? 'explore' : 'combat'; }
function bgmList() {
  if (!PREF.bgmScenes) applyBgmPrefs();
  return (PREF.bgmScenes || {})[bgmZone()] || { mode: 'auto', tracks: [] };
}
function bgmStatus() {
  var info = SFX && SFX.bgmInfo ? SFX.bgmInfo() : {};
  if (EXTERNAL_AUDIO) return '外部音声を優先中：ゲームのBGM・効果音は停止しています';
  if (!PREF.music) return 'BGMはオフです';
  if (info.fallback) return '曲を読み込めないため、これまでのBGMを再生しています。';
  return (info.preview ? '試聴：' : info.playing ? '再生中：' : '再生待ち：') + (info.title || '曲を選んでください');
}
function updateBgmStatus() {
  Array.prototype.forEach.call($app.querySelectorAll('.bgm-now'), function (el) { el.textContent = bgmStatus(); });
  var info = SFX && SFX.bgmInfo ? SFX.bgmInfo() : {};
  Array.prototype.forEach.call($app.querySelectorAll('[data-a="bgmnext"]'), function (el) { el.disabled = EXTERNAL_AUDIO || !info.random || !!info.preview || !PREF.music; });
  Array.prototype.forEach.call($app.querySelectorAll('[data-a="bgmpreview"]'), function (el) {
    var on = info.preview === el.getAttribute('data-v');
    el.textContent = on ? '停止' : '試聴'; el.setAttribute('aria-pressed', String(on));
  });
}
function settingsContent() {
  var list = bgmList(), zone = bgmZone(), library = bgmLibrary();
  var query = String(A.ui.bgmSearch || '').toLowerCase();
  var shown = library.filter(function (t) { return (t.title + ' ' + t.description).toLowerCase().indexOf(query) >= 0; });
  var h = '<div class="bgm-settings">' + externalAudioButton() + '<p class="note">開いた直後は外部の音声を優先します。ゲーム音はこのページを開いている間だけ有効になります。選曲・音量の設定は保存されます。</p><details class="settings-section settings-audio"><summary>音量・効果音・戦闘演出</summary><div class="settings-toggles">' +
    '<button class="opt" data-a="togglemusic" aria-pressed="' + PREF.music + '">BGM：' + (PREF.music ? 'オン' : 'オフ') + '</button>' +
    '<button class="opt" data-a="togglesfx" aria-pressed="' + PREF.sfx + '">効果音：' + (PREF.sfx ? 'オン' : 'オフ') + '</button></div>' +
    '<label class="bgm-volume" for="bgmVolume">BGM音量 <output id="bgmVolumeText">' + Math.round(PREF.bgmVolume * 100) + '%</output><input id="bgmVolume" type="range" min="0" max="100" step="1" value="' + Math.round(PREF.bgmVolume * 100) + '"></label>' +
    '<button class="opt" data-a="animspeed">戦闘演出：' + ({ 1: 'ふつう', 1.6: 'はやい', 2.6: 'とてもはやい', 0: 'なし' }[PREF.anim] || 'ふつう') + '</button></details>';
  h += '<section class="settings-section"><h3>BGMを選ぶ <small>Gemini製 全' + library.length + '曲</small></h3><p class="note">変更はこの端末に自動保存されます。曲はタップして選択、右のボタンで試聴できます。</p>' +
    '<div class="seg bgm-zones" aria-label="BGMを設定する場面"><button data-a="bgmzone" data-v="combat" aria-pressed="' + (zone === 'combat') + '" class="' + (zone === 'combat' ? 'on' : '') + '">戦闘時</button><button data-a="bgmzone" data-v="explore" aria-pressed="' + (zone === 'explore') + '" class="' + (zone === 'explore' ? 'on' : '') + '">非戦闘時</button></div>' +
    '<p class="note">' + (zone === 'combat' ? '通常戦闘・ボス戦に適用。おまかせでは、それぞれの専用曲を再生します。' : 'スタート画面・マップ・商店・休憩などに適用します。') + '</p><div class="bgm-modes" aria-label="BGM再生方法">';
  [['auto', 'おまかせ'], ['single', '1曲固定'], ['random', 'ランダム']].forEach(function (x) {
    h += '<button class="btn ghost' + (list.mode === x[0] ? ' selected' : '') + '" data-a="bgmmode" data-v="' + x[0] + '" aria-pressed="' + (list.mode === x[0]) + '">' + x[1] + '</button>';
  });
  h += '</div><p class="bgm-policy">' + (list.mode === 'random' ? '選択した' + list.tracks.length + '曲からランダム。曲が終わると次の曲へ進み、複数曲なら同じ曲が続きません。' : list.mode === 'single' ? '選んだ1曲を繰り返し再生します。' : '今までの場面別BGMを再生します。下の曲を選ぶと1曲固定へ切り替わります。') + '</p>' +
    '<div class="bgm-source"><button class="btn ghost sm" data-a="bgmsource">音源：' + (PREF.bgm === 'original' ? 'これまでのBGM' : 'Gemini製') + '</button><button class="btn ghost sm" data-a="bgmall">全曲をランダム対象にする</button></div>' +
    '<p class="bgm-now" role="status">' + esc(bgmStatus()) + '</p><div class="row"><button class="btn ghost sm" data-a="bgmnext">次のランダム曲</button><button class="btn ghost sm" data-a="bgmstoppreview">試聴を終了</button></div>' +
    '<label class="bgm-search-label" for="bgmSearch">曲名・雰囲気で検索</label><input id="bgmSearch" class="txt" type="search" value="' + esc(A.ui.bgmSearch || '') + '" placeholder="例：疾走、ピアノ、海"><div class="bgm-tracks" data-keep="bgm-tracks-' + zone + '">';
  shown.forEach(function (t) {
    var on = list.mode !== 'auto' && list.tracks.indexOf(t.id) >= 0 && (list.mode !== 'single' || list.tracks[0] === t.id);
    var seconds = t.duration % 60;
    h += '<div class="bgm-track" data-key="bgm-track-' + t.id + '"><button class="bgm-pick' + (on ? ' selected' : '') + '" data-a="bgmtrack" data-v="' + esc(t.id) + '" role="checkbox" aria-checked="' + on + '" aria-label="' + esc(t.title) + '"><span class="bgm-check" aria-hidden="true">' + (on ? '✓' : '+') + '</span><span><b>' + esc(t.title) + '</b><small>' + Math.floor(t.duration / 60) + ':' + (seconds < 10 ? '0' : '') + seconds + ' · ' + esc(t.description) + '</small></span></button><button class="btn ghost sm bgm-preview" data-a="bgmpreview" data-v="' + esc(t.id) + '" aria-label="' + esc(t.title) + 'を試聴" aria-pressed="false">試聴</button></div>';
  });
  h += (shown.length ? '' : '<p class="note">該当する曲はありません。</p>') + '</div></section></div>';
  return h;
}
function saveBgmChoice() { PREF.bgm = 'gemini'; applyBgmPrefs(); savePrefs(); render(); }
function modePickerHTML(mode) {
  var easy = mode === 'beginner';
  return '<section class="field mode-picker" aria-label="冒険の難易度"><label>難易度</label><div class="seg">' +
    [['normal', '通常'], ['beginner', '初心者']].map(function (x) { var on = (easy ? 'beginner' : 'normal') === x[0]; return '<button type="button" data-a="mode" data-v="' + x[0] + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' + x[1] + '</button>'; }).join('') +
    '</div><p class="note">' + (easy ? '最大HP・開始HP＋2／休憩の回復＋1。通常難易度をベースにした独自調整です。カード解放は進みます（アセンション解放は通常で挑戦）。' : '通常のルールで冒険します。') + '</p></section>';
}
function charButtons(sel, taken, s, mode) {
  return '<div class="chars">' + D.CHAR_ORDER.map(function (ch) {
    var c = D.CHARS[ch], lvl = charLevel(s.ch[ch]);
    var t = taken && taken.indexOf(ch) >= 0;
    return '<button class="charbtn' + (sel === ch ? ' on' : '') + (t ? ' taken' : '') + '" data-a="pickch" data-v="' + ch + '" style="background-image:url(' + V.selectImg(ch) + ')">' +
      '<span class="cn"><b>' + esc(c.name) + '</b><span>HP' + (c.hp + (mode === 'beginner' ? D.MODES.beginner.hp : 0)) + '・カード解放 ' + lvl + '/3' + (t ? '・選択済み' : '') + '</span></span></button>';
  }).join('') + '</div>';
}
/* Preview the exact starting cards without starting/saving an adventure. */
function starterDeckHTML(ch, asc) {
  var hero = D.CHARS[ch];
  if (!hero) return '';
  var cards = STS.Game.newRun({ players: [{ ch: ch }], asc: asc || 0, seed: 1 }).players[0].deck;
  var groups = [], byId = {};
  cards.forEach(function (c) { if (!byId[c.id]) { byId[c.id] = { card: c, count: 0 }; groups.push(byId[c.id]); } byId[c.id].count++; });
  var open = !!A.ui.starterOpen;
  var h = '<section class="starter-deck panel" aria-label="初期デッキ"><h3>' + esc(hero.name) + 'の初期デッキ <span>' + cards.length + '枚</span></h3><div class="starter-summary">' +
    groups.map(function (g) { return '<span>' + esc(V.cardName(g.card)) + ' ×' + g.count + '</span>'; }).join('') + '</div>' +
    '<button type="button" class="btn ghost wide" data-a="startertoggle" aria-expanded="' + open + '" aria-controls="starterCards">' + (open ? 'カード一覧を閉じる' : '初期カードを詳しく見る') + '</button>' +
    '<div id="starterCards"' + (open ? '' : ' hidden') + '><p class="note">カードや説明欄をタップすると、効果と強化前・強化後の姿を比較できます。</p><div class="starter-list">';
  groups.forEach(function (g) {
    var c = g.card, d = STS.CARDS[c.id];
    h += '<div class="starter-row" data-help="card:' + esc(c.id) + '" data-starter-id="' + esc(c.id) + '" data-count="' + g.count + '">' + V.card(c) + '<div class="starter-copy"><b>' + esc(V.cardName(c)) + ' <span>×' + g.count + '枚</span></b><small>' + esc(V.TYPE[d.t] || '') + '・' + (d.unplayable || d.c == null ? '使用不可' : 'コスト' + esc(d.c)) + '</small><p>' + V.kw(V.cardText(c.id, false)) + '</p></div></div>';
  });
  return h + '</div></div><p class="note">ネオーの祝福などを受ける前の構成です。' + (asc == null ? '協力プレイでは部屋の難易度により追加カードがあります。' : asc >= 5 ? 'アセンション5以上の追加カードを含みます。' : '') + '</p></section>';
}

function ascButtons(cur, max) {
  var h = '<div class="seg">';
  for (var i = 0; i <= 13; i++) h += '<button data-a="asc" data-v="' + i + '"' + (i > max ? ' disabled' : '') + (i === cur ? ' class="on"' : '') + '>' + (i === 0 ? 'なし' : i) + '</button>';
  h += '</div>';
  h += '<p class="note">アセンション＝クリア後に選べる追加の難易度です。「なし」は通常の難易度。数字までの変更がすべて累積します。</p>' + STS.HelpUI.button('term:ascension', '各難易度の変更・解放条件');
  if (cur > 0) h += '<div class="note" style="margin-top:6px">' + ascDesc(cur) + '</div>';
  return h;
}
function ascDesc(n) { var out = []; for (var i = 1; i <= n; i++) out.push('<div><b>' + i + '. ' + esc(D.ASCENSION[i].name) + '</b>：' + esc(D.ASCENSION[i].desc) + '</div>'); return out.join(''); }
function soloHTML() {
  var s = sheet(), st = A.setup;
  st.asc = Math.min(st.asc, s.asc);
  var c = D.CHARS[st.ch];
  return '<div class="page" data-keep="setup"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">ひとりで遊ぶ</h2></div>' +
    STS.HelpUI.button('', '？ 用語・効果を調べる', 'wide') + charButtons(st.ch, null, s, st.mode) + modePickerHTML(st.mode) +
    '<div class="panel" style="margin-top:12px"><b>' + esc(c.name) + '</b><div class="note">' + esc(c.ability) + '</div>' +
    STS.HelpUI.button('hero:' + st.ch, 'このキャラクターの能力を解説') + '<div class="note">1人プレイ：2ゴールドと「いかさまダイス」を持って始めます。カード解放レベル ' + charLevel(s.ch[st.ch]) + '（解放状況で確認）。</div></div>' +
    starterDeckHTML(st.ch, st.mode === 'beginner' ? 0 : st.asc) + (st.mode === 'beginner' ? '' : '<div class="field"><label>アセンション（最大 ' + s.asc + '）</label>' + ascButtons(st.asc, s.asc) + '</div>') +
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
  var h = '<div class="page"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">解放状況</h2></div>' + STS.HelpUI.button('', '？ 用語・効果を調べる', 'wide');
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
    STS.HelpUI.button('', '用語・全カード・アイテムの解説を開く', 'wide') + '<h3>目的</h3><p>マップを下から上へ進み、各幕の最後にいるボスを倒します。第3幕のボスを倒せば勝利。第4幕が解放されていて3つの鍵をそろえていれば、さらに堕落の心臓に挑めます。誰か1人のHPが0になると全員の敗北です。</p>' +
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
  var c = A.coop;
  return '<div class="page" data-keep="setup"><div class="back"><button class="ibtn" data-a="title">←</button><h2 style="margin:0">オンライン協力</h2></div>' + STS.HelpUI.button('', '？ 用語・効果を調べる', 'wide') +
    '<p class="note">2〜4人で1つの冒険を進めます。キャラクターはゲーム開始後に全員で選びます（早い者勝ち）。</p>' +
    '<div class="field"><label>名前</label><input class="txt" id="nm" maxlength="12" value="' + esc(PREF.name || '') + '" placeholder="冒険者"></div>' +
    '<div class="row"><button class="btn primary grow" data-a="host">部屋を作る</button></div>' +
    '<div class="field"><label>部屋コードで参加</label><div class="row"><input class="txt" id="code" maxlength="4" style="text-transform:uppercase" placeholder="ABCD" value="' + esc(c.code || '') + '"><button class="btn" data-a="join">参加</button></div></div>' +
    (c.err ? '<p style="color:#ff9b7a">' + esc(c.err) + '</p>' : '') + '</div>';
}
function roomPlayersHTML(roster, selecting) {
  return '<div class="ilist">' + roster.map(function (r) {
    var hero = D.CHARS[r.ch];
    return '<div class="irow">' + (hero ? '<img src="' + V.heroImg(r.ch) + '" alt="">' : '<span class="unpicked-avatar" aria-hidden="true">？</span>') + '<div class="grow"><b>' + esc(r.name) + '</b>' + (r.seat === 0 ? '（ホスト）' : '') + '<p>' + (hero ? esc(hero.name) + '・選択済み' : selecting ? '選択中' : '開始後にキャラクターを選択') + (r.online ? '' : '・切断中') + '</p></div>' +
      (A.host && r.seat > 0 && (!A.host.roster.started || (selecting && !r.online)) ? '<button class="btn sm ghost" data-a="kick" data-v="' + r.seat + '">外す</button>' : '') + '</div>';
  }).join('') + '</div>';
}
function roomDifficultyHTML(settings) {
  return '<p class="note">' + (settings.mode === 'beginner' ? '初心者：全員の最大HP・開始HP＋2／休憩の回復＋1（ホストが選択）' : '通常・アセンション ' + (settings.asc || 0)) + '</p>';
}
function lobbyHTML() {
  var c = A.coop, s = sheet(), roster = A.host ? A.host.roster.view() : (A.guest ? A.guest.roster : []);
  var h = '<div class="page" data-keep="setup"><div class="back"><button class="ibtn" data-a="leavelobby">←</button><h2 style="margin:0">部屋 ' + esc(c.code || '') + '</h2></div>';
  h += STS.HelpUI.button('', '？ 用語・効果を調べる', 'wide');
  h += '<p class="note">' + (A.host ? '部屋コード「' + esc(c.code) + '」を参加する人に伝えてください。全員がそろったら開始します。' : 'ホストが開始するのを待っています。') + ' 開始後にキャラクターを選びます（早い者勝ち）。</p>' + roomPlayersHTML(roster, false);
  if (A.host) {
    var st = A.setup; st.asc = Math.min(st.asc, s.asc);
    var ok = roster.length >= 2 && roster.every(function (r) { return r.online; });
    h += modePickerHTML(st.mode) + (st.mode === 'beginner' ? '' : '<div class="field"><label>アセンション（ホストの最大 ' + s.asc + '）</label>' + ascButtons(st.asc, s.asc) + '</div>');
    h += '<div class="note">無色カード：' + (colorlessOn(s) ? '使う' : '未解放') + '／第4幕：' + (act4On(s) ? '解放済み' : '未解放') + '（ホストの解放状況）</div>';
    h += '<div style="margin-top:14px"><button class="btn primary wide" data-a="startcoop"' + (ok ? '' : ' disabled') + '>ゲームを開始（' + roster.length + '人）</button></div>';
  } else if (A.guest) h += roomDifficultyHTML(A.guest.settings || {});
  return h + '</div>';
}
function characterSelectionHTML() {
  var s = sheet(), roster = A.host ? A.host.roster.view() : A.guest ? A.guest.roster : [];
  var seat = A.host ? 0 : A.guest ? A.guest.seat : -1, mine = roster.filter(function (r) { return r.seat === seat; })[0];
  var settings = A.host ? A.host.settings : A.guest ? A.guest.settings : {};
  var selected = roster.filter(function (r) { return !!D.CHARS[r.ch]; }).length;
  var h = '<div class="page character-selection" data-keep="characters"><div class="back"><h2>キャラクターを選択</h2></div><p class="note">先にタップした人のキャラクターに確定します。全員が選ぶと冒険が始まります。</p><p class="selection-status" role="status">' + (mine && mine.ch ? esc(D.CHARS[mine.ch].name) + 'に確定。ほかの人の選択を待っています。' : '空いているキャラクターを選んでください。') + '（' + selected + '/' + roster.length + '人）</p>';
  h += '<div class="chars">' + D.CHAR_ORDER.map(function (ch) {
    var c = D.CHARS[ch], owner = roster.filter(function (r) { return r.ch === ch; })[0], own = owner && owner.seat === seat;
    var disabled = !!owner || !!(mine && mine.ch) || !mine;
    return '<button type="button" class="charbtn' + (own ? ' on' : owner ? ' taken' : '') + '" data-a="pickonlinech" data-v="' + ch + '"' + (disabled ? ' disabled' : '') + ' aria-pressed="' + !!own + '" style="background-image:url(' + V.selectImg(ch) + ')"><span class="cn"><b>' + esc(c.name) + '</b><span>' + (owner ? esc(owner.name) + 'が選択済み' : 'HP' + (c.hp + (settings.mode === 'beginner' ? 2 : 0)) + '・カード解放 ' + charLevel(s.ch[ch]) + '/3') + '</span></span></button>';
  }).join('') + '</div>' + roomPlayersHTML(roster, true) + roomDifficultyHTML(settings);
  if (mine && mine.ch) h += starterDeckHTML(mine.ch, settings.asc || 0);
  if (A.host) h += '<button class="btn ghost wide" data-a="cancelselection">部屋に戻る（全員の選択をリセット）</button>';
  return h + '</div>';
}

/* ================================================================== game screen */
function myPrompt() { var list = A.sess ? A.sess.pending() : []; return list[0] || null; }
function gameHTML() {
  var real = A.sess && A.sess.run();
  if (!real) return '<div class="page center"><h2>接続中…</h2><p class="dots"><i></i><i></i><i></i></p><button class="btn ghost" data-a="quit">タイトルへ</button></div>';
  if (real.combat && real.combat.pcs) A.lastCombat = real.combat;
  // While a step of the battle is being replayed, the page shows that step and holds back new prompts.
  var run = A.view ? viewRun(real) : real;
  if (run.phase === 'over' && !(A.view && run.combat)) return resultHTML(run);
  var cur = A.view ? null : myPrompt();
  if (!A.view && A.ui.pid !== (cur && cur.id)) { A.ui.pid = cur && cur.id; A.ui.msel = []; A.ui.brew = null; A.ui.gift = null; A.ui.rewardPick = null; }
  var stage;
  var inCombat = !!run.combat && !!run.combat.pcs;
  var rewardPage = cur && cur.q.type === 'reward';
  if (inCombat) stage = combatHTML(run, cur);
  else if (rewardPage) stage = rewardHTML(run, cur);
  else if ((cur && cur.q.type === 'map') || (run.phase === 'map' && !cur)) stage = mapHTML(run, cur, true);
  else if (run.room && run.room.rewards) stage = rewardSceneHTML(run, '');
  else stage = roomHTML(run, cur);
  var h = '<div class="game' + (inCombat || rewardPage || (run.room && run.room.rewards) ? ' classic-game' : '') + (inCombat ? ' in-combat' : '') + '">' + topbarHTML(run) + relicbarHTML(run) + '<div class="stage">' + stage + (A.view || inCombat ? '' : waitHTML(run, cur)) + '</div>';
  if (!rewardPage) h += promptHTML(run, cur, inCombat);
  h += infoHTML(run);
  return h + '</div>';
}
function me(run) { return run.players[A.me] || run.players[0]; }
function topbarHTML(run) {
  var p = me(run), lim = run.asc >= 4 ? 2 : 3;
  var h = '<div class="topbar"><div class="top-resources"><span class="stat hp" aria-label="HP">' + V.icon('heart') + '<b>' + Math.max(0, p.hp) + '</b><small>/' + maxHp(p) + '</small></span><span class="stat gold" aria-label="ゴールド">' + V.icon('gold') + '<b>' + p.gold + '</b><small>G</small></span><span class="pots">';
  for (var i = 0; i < lim; i++) {
    var id = p.potions[i];
    h += id ? '<button class="pot" data-a="pot" data-v="' + i + '">' + V.potionIcon(id) + '</button>' : '<span class="pot empty"></span>';
  }
  h += '</span>';
  if (run.unlock && run.unlock.act4) h += '<span class="keys" title="鍵"><i style="background:#e0443a" class="' + (run.keys.ruby ? 'on' : '') + '"></i><i style="background:#3a7ae0" class="' + (run.keys.sapphire ? 'on' : '') + '"></i><i style="background:#3ae07a" class="' + (run.keys.emerald ? 'on' : '') + '"></i></span>';
  h += '<span class="act">第' + run.act + '幕' + (run.mode === 'beginner' ? '・初心者' : run.asc ? '・A' + run.asc : '') + '</span>';
  h += '</div><button class="ibtn" data-a="info" data-v="deck" aria-label="デッキ">' + V.icon('deck') + '</button>';
  h += '<button class="ibtn" data-a="info" data-v="map" aria-label="マップ">' + V.icon('map') + '</button>';
  h += '<button class="ibtn" data-a="info" data-v="menu" aria-label="メニュー">' + V.icon('menu') + '</button></div>';
  return h;
}
function maxHp(p) { return p.relics.some(function (r) { return r.id === 'MarkOfPain'; }) ? Math.min(p.maxHp, 6) : p.maxHp; }
function relicbarHTML(run) {
  var p = me(run), h = '<div class="relicbar" data-keep="relics">';
  var ab = { R: 'BurningBlood', G: 'RingOfTheSnake', B: 'CrackedCore', W: 'Miracles' };
  h += '<button class="relic" data-a="info" data-v="ability" data-rid="' + ab[p.ch] + '" aria-label="キャラクター能力"><img src="img/r/' + ab[p.ch] + '.webp?v=' + V.ASSET + '" alt=""></button>';
  p.relics.forEach(function (r, i) {
    var d = STS.RELICS[r.id] || {};
    var act = run.combat && d.activate && !(r.usedCombat);
    h += '<button class="relic' + (r.usedCombat || r.usedRoom ? ' used' : '') + (act ? ' act' : '') + '" data-a="relic" data-v="' + i + '" data-rid="' + esc(r.id) + '" aria-label="' + esc(d.name || r.id) + '">' + V.relicIcon(r.id) + (r.n ? '<span class="n">' + r.n + '</span>' : '') + '</button>';
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
/* The battlefield shows the hero and the enemies on one floor, in the proportions of the original sprites
   (a small slime stays small, a boss stays large), scaled to the screen. During a replay (A.view) every value
   comes from the step being shown, so HP drops at the moment of the hit. */
function viewRun(run) {
  var f = A.view;
  if (!f || !f.vs) return run;
  var base = run && run.combat && run.combat.pcs ? run.combat : A.lastCombat;
  if (!base || !base.pcs) return run;
  var vs = f.vs, byU = {}, cards = {};
  base.enemies.forEach(function (e) { byU[e.u] = e; });
  base.pcs.forEach(function (pc) {
    ['hand', 'draw', 'disc', 'exh', 'limbo'].forEach(function (k) { (pc[k] || []).forEach(function (c) { if (c) cards[c.u] = c; }); });
    (pc.pow || []).forEach(function (p) { if (p.card) cards[p.card.u] = p.card; });
  });
  var enemies = vs.e.map(function (v) {
    var e = byU[v.u]; if (!e) return null;
    var o = Object.assign({}, e, { hp: v.hp, max: v.max, blk: v.blk, str: v.str, weak: v.weak, vuln: v.vuln, psn: v.psn, dead: v.dead, fled: v.fled, cube: v.cube, mode: v.mode, row: v.row });
    if (v.rows) o.rows = v.rows;
    o.x = Object.assign({}, e.x, v.x);
    return o;
  }).filter(Boolean);
  function pile(arr, n) { arr = arr || []; return arr.length >= n ? arr.slice(0, n) : arr.concat(new Array(n - arr.length).fill(null)); }
  var pcs = base.pcs.map(function (pc, i) {
    var v = vs.p[i]; if (!v) return pc;
    return Object.assign({}, pc, { blk: v.b, str: v.s, weak: v.w, vuln: v.v, en: v.en, stance: v.st, dead: v.dead, shiv: v.sh, mir: v.mi, orbs: v.o, ready: v.ready, row: v.row,
      hand: v.h.map(function (u) { return cards[u]; }).filter(Boolean), draw: pile(pc.draw, v.dr), disc: pile(pc.disc, v.di), exh: pile(pc.exh, v.ex),
      pow: (pc.pow || []).filter(function (p) { return v.pw.indexOf(p.u) >= 0; }) });
  });
  var players = run.players.map(function (p, i) { var v = vs.p[i]; return v ? Object.assign({}, p, { hp: v.hp }) : p; });
  return Object.assign({}, run, { players: players, combat: Object.assign({}, base, { round: vs.r, die: vs.d, phase: vs.ph, enemies: enemies, pcs: pcs }) });
}
function rankOf(e) { var m = STS.MONSTERS[e.id] || {}; return e.row === -1 || m.boss ? 'b' : m.elite ? 'e' : 'n'; }
function foeNat(e) { return V.artSize((STS.MONSTERS[e.id] || {}).art, rankOf(e)); }
// The Ironclad's sword and the Watcher's staff may reach into the gap; they do not need their own width.
function heroNat(ch) { var s = V.ART_SIZE[V.heroArtKey(ch)] || [320, 320]; return [Math.round(s[0] * ({ R: 0.74, W: 0.8 }[ch] || 1)), s[1]]; }
function fieldK() {
  var w = window.innerWidth, h = window.innerHeight, small = w < 640 || h < 560;
  return { small: small, intentH: small ? 56 : 74, plateH: small ? 50 : 60, minFoe: small ? 84 : 112, minHero: small ? 104 : 128, gap: small ? 4 : 14, heroGap: small ? 10 : 48, smax: small ? 0.8 : Math.min(0.66, Math.max(0.45, h / 1500)), smin: 0.1 };
}
function fieldSize() {
  if (A.field && A.field.vw === window.innerWidth && A.field.vh === window.innerHeight && A.field.w > 40 && A.field.h > 40) return A.field;
  var w = window.innerWidth, h = window.innerHeight, low = w > h && h <= 520;
  var cw = handCardWidth(5, low ? w * 0.5 : w);
  return { w: (low ? w * 0.5 : Math.min(w, 1400)) - 16, h: Math.max(160, h - 44 - 34 - 44 - 16 - 54 - (low ? 0 : cw * 1.41 + 16)) };
}
/* One scale for a row of actors that keeps their natural proportions and fits both width and height. */
function fitScale(actors, W, H, K) {
  if (!actors.length) return K.smax;
  var foes = 0, s = K.smax;
  actors.forEach(function (a) { if (!a.hero) foes++; s = Math.min(s, (H - (a.plate || K.plateH) - (a.over || 0)) / Math.max(1, a.nat[1])); });
  var gaps = (actors.length > foes ? K.heroGap : 0) + K.gap * Math.max(0, foes - 1);
  // Minimum label widths must leave room for the sprites on crowded mobile rows.
  // Otherwise no scale can fit, and repeated subtraction collapses everyone to smin.
  var minWidth = actors.reduce(function (sum, a) { return sum + (a.hero ? K.minHero : K.minFoe); }, 0);
  var density = Math.min(1, Math.max(0, W - gaps) * 0.82 / Math.max(1, minWidth));
  if (density < 1) { K.minHero *= density; K.minFoe *= density; }
  function widthAt(k) {
    return gaps + actors.reduce(function (sum, a) {
      return sum + Math.max(a.hero ? K.minHero : K.minFoe, (a.full || a.nat)[0] * k);
    }, 0);
  }
  var lo = 0, hi = Math.max(0, s);
  if (widthAt(hi) <= W) return hi;
  for (var it = 0; it < 24; it++) { var mid = (lo + hi) / 2; if (widthAt(mid) <= W) lo = mid; else hi = mid; }
  return lo;
}
/* Height the forecast bubble will need above an enemy (it wraps inside the enemy's width). */
function bubbleHeight(ib, K) {
  if (!ib) return 0;
  if (K.compact) return 64;
  var inner = (K.small ? K.minFoe + 18 : 150) - 14, px = K.small ? 10 : 12, lines = 0;
  ib.texts.forEach(function (t) { var w = 0; for (var i = 0; i < t.length; i++) w += /[ -~]/.test(t[i]) ? px * 0.6 : px; lines += Math.max(1, Math.ceil(w / inner)); });
  return (K.small ? 26 : 32) + lines * Math.round(px * 1.3) + 22;
}
function combatLayout(cs, run, cb) {
  var K = fieldK(), F = fieldSize(), solo = cs.pcs.length === 1;
  K.compact = solo ? F.h < 320 : (K.small || F.h / Math.max(1, cs.rows) < 230);
  function visible(e) { return !e.fled && (!e.dead || e.id === 'Darkling'); }
  var bosses = cs.enemies.filter(function (e) { return e.row === -1 && visible(e); });
  var bands = [];
  if (!solo && bosses.length) bands.push({ boss: true, foes: bosses });
  for (var r = 0; r < cs.rows; r++) {
    // Match the rendered actors: the defeated Slime Boss must not reserve a hidden slot
    // after its three replacements arrive (including in resumed games and replay frames).
    var fs = cs.enemies.filter(function (e) { return (e.rows ? e.rows.indexOf(r) >= 0 : e.row === r) && visible(e); });
    if (solo) fs = fs.concat(bosses);
    bands.push({ row: r, pc: cs.pcs.filter(function (p) { return p.row === r; })[0] || null, foes: fs });
  }
  // Wide screens: a shared boss stands in its own column on the right, beside every player's row.
  var side = !solo && bosses.length && F.w >= 700;
  var rowsN = bands.filter(function (b) { return !b.boss; }).length;
  var minBand = K.small ? 156 : Math.max(120, Math.min(200, (F.h - 4 * rowsN) / rowsN)), bossBand = K.small ? 196 : 270;
  var weight = bands.map(function (b) { return b.boss ? 1.35 : 1; }), wsum = weight.reduce(function (a, b) { return a + b; }, 0);
  var sizes = {}, scales = [];
  bands.forEach(function (b, i) {
    b.w = side ? (b.boss ? F.w * 0.34 : F.w * 0.66 - 6) : F.w;
    if (solo) b.h = F.h;
    else if (side) b.h = b.boss ? F.h : Math.max(minBand, (F.h - 4 * rowsN) / rowsN);
    else b.h = Math.max(b.boss ? bossBand : minBand, (F.h - 4 * bands.length) * weight[i] / wsum);
    var actors = b.foes.map(function (e) {
      var ib = null;
      if (cb && !e.dead) { try { ib = V.intentBubble(cb, e, cb.currentAction(e), run, A.me); } catch (err) { ib = null; } }
      // Status chips add real height below the sprite; reserve it before fitting the forecast/art.
      var chips = ['str', 'weak', 'vuln', 'psn'].filter(function (k) { return !!e[k]; }).length;
      chips += ['thorns', 'enraged', 'invincible', 'beat', 'timeWarp', 'intangible'].filter(function (k) { return e.x && !!e.x[k]; }).length;
      if (e.mode === 'defense' || e.mode === 'fury') chips++;
      return { e: e, nat: foeNat(e), over: bubbleHeight(ib, K), plate: K.plateH + chips * (K.small ? 18 : 22) };
    });
    if (b.pc) { var ch = run.players[b.pc.i].ch; actors.unshift({ hero: true, pc: b.pc, nat: heroNat(ch), full: V.ART_SIZE[V.heroArtKey(ch)] }); }
    b.actors = actors;
    // Restore the original shared sprite scale; neither side grows to fill its own slot.
    b.K = Object.assign({}, K);
    b.s = fitScale(actors, b.w - 22, b.h - (solo ? 8 : 26), b.K);
    if (!b.boss) scales.push(b.s);
  });
  // Rows of a party share one scale so that the same enemy looks the same size everywhere.
  var common = scales.length ? Math.min.apply(null, scales) : K.smax;
  bands.forEach(function (b) {
    var s = b.boss ? b.s : common;
    b.actors.forEach(function (a) {
      // Keep the former shared proportions, with a compact hero cap and room for the complete artwork.
      var actorScale = a.hero ? Math.min(s, (K.small ? 120 : 180) / a.nat[1], b.w * 0.34 / (a.full || a.nat)[0], Math.max(24, b.h - K.plateH - (a.pc.slots ? 32 : 8) - 36) / a.nat[1]) : s;
      var w = Math.round(a.nat[0] * actorScale), h = Math.round(a.nat[1] * actorScale);
      var slot = Math.max(a.hero ? b.K.minHero : b.K.minFoe, w, a.hero && a.full ? Math.round(a.full[0] * actorScale) : 0);
      sizes[a.hero ? 'p' + a.pc.i : 'e' + a.e.u] = { w: w, h: h, fw: a.full ? Math.round(a.full[0] * actorScale) : w, slot: Math.min(slot, Math.round(b.w * (a.hero ? 0.42 : 0.7))) };
    });
  });
  return { K: K, F: F, bands: bands, sizes: sizes, solo: solo, side: side };
}
function combatHeaderHTML(cs, run) {
  var enemyPhase = /^(endturn|enemy)$/.test(cs.phase), party = cs.pcs.length > 1;
  var waitFor = party && !enemyPhase && !A.view && A.sess && A.sess.waiting ? A.sess.waiting().filter(function (i) { return i !== A.me; }) : [];
  var phase = enemyPhase ? '敵のターン' : waitFor.length ? waitFor.map(function (i) { return run.players[i] ? run.players[i].name : '?'; }).join('・') + 'を待っています' : party ? '全員のターン' : 'あなたのターン';
  return '<div class="battle-header" data-key="bh"><button class="battle-die" data-a="info" data-v="die" aria-label="行動ダイスの説明"><span class="dieface">' + (cs.die || '–') + '</span><small>行動ダイス</small></button>' +
    '<div class="battle-turn' + (enemyPhase ? ' enemy' : '') + '"><span class="rd"><small>ラウンド</small><b>' + Math.max(1, cs.round || 1) + '</b></span><span class="phase' + (waitFor.length ? ' waiting' : '') + '">' + esc(phase) + '</span></div>' +
    '<span class="grow"></span><button class="battle-log" data-a="info" data-v="blog" aria-label="戦闘ログ">' + V.icon('log') + '<span>ログ</span></button>' +
    '<button class="battle-help" data-help="" aria-label="用語・効果の解説">？<span> 用語</span></button></div>';
}
function combatHTML(run, cur) {
  var cs = run.combat, cb = SES.query(run), pcMe = cs.pcs[A.me], aim = aimState(run, cur);
  var L = combatLayout(cs, run, cb), solo = L.solo;
  var enemyPhase = /^(endturn|enemy)$/.test(cs.phase);
  var revival = !A.view && !cs.over && !cb.alive().length && cs.pending.some(function (p) { return p.keep; });
  var revivalHTML = revival ? '<div class="battle-revival" role="status"><b>' + (cs.pending.some(function (p) { return p.mid === 'AwakenedOne'; }) ? '覚醒者はまだ倒しきっていません' : '次のラウンドに敵が出現します') + '</b><span>ターン終了後、次のラウンドに進みます。</span><button class="btn primary" data-a="end"' + (A.sess.playOpen() && !pcMe.ready && !pcMe.dead ? '' : ' disabled') + '>' + (pcMe.ready ? 'ほかのプレイヤーを待っています' : 'ターン終了して進む') + '</button></div>' : '';
  var h = '<div class="combat classic-combat act' + (cs.act || run.act) + (solo ? ' solo-battle' : ' party-battle') + (enemyPhase ? ' enemy-phase' : '') + (A.view ? ' replaying' : '') + '" data-key="combat">' +
    '<div class="battle-scenery" aria-hidden="true"></div>' + combatHeaderHTML(cs, run) +
    '<div class="battle-guide"><span>出目 → 敵の行動・一部の効果</span><span>' + (solo ? 'ターン終了後に敵が行動' : '全員の終了後に敵が行動') + '</span><span>予告の数字はブロック前</span>' + (!A.view && cs.enemyResults && cs.enemyResults.length ? '<button class="enemy-round-report" data-a="info" data-v="enemyresults">前の敵ターンの結果：' + esc(cs.enemyResults.map(function (ev) { return STS.Explain.enemyResult(ev, A.me, function (i) { return run.players[i].name; }); }).join(' ／ ')) + '</button>' : '') + '</div>' +
    '<div class="field-scroll' + (L.side ? ' boss-side' : '') + '" data-keep="field" data-key="field">' + (L.side ? '<div class="rows-col" data-key="rows">' : '');
  L.bands.forEach(function (b, bi) {
    if (L.side && b.boss) return;
    var mine = b.pc && b.pc.i === A.me, rowTarget = !b.boss && aim && aim.kind === 'row' && aim.set.indexOf(b.row) >= 0;
    var es = b.foes.filter(function (e) { return !e.fled && (!e.dead || e.id === 'Darkling'); });
    h += '<div class="band' + (b.boss ? ' boss' : '') + (solo && es.some(function (e) { return e.row === -1; }) ? ' solo-boss' : '') + (mine ? ' mine' : '') + (rowTarget ? ' rowtarget' : '') + '" data-key="band-' + (b.boss ? 'boss' : b.row) + '"' +
      ' style="--bandh:' + Math.round(b.h) + 'px"' + (rowTarget ? ' data-a="aimrow" data-v="' + b.row + '"' : '') + '>' +
      (solo ? '' : '<span class="rowlbl">' + (b.boss ? '共有ボス（全員を攻撃）' : (b.row + 1) + '列' + (mine ? '・あなた' : '')) + '</span>') +
      (b.pc ? heroHTML(run, b.pc, aim, L.sizes['p' + b.pc.i]) : '') +
      '<div class="enemies" data-count="' + es.length + '">' + (es.length ? es.map(function (e) { return foeHTML(cb, e, aim, run, L.sizes['e' + e.u], L.K.compact); }).join('') : (mine && revivalHTML ? revivalHTML : b.boss ? '' : '<div class="emptyrow">敵なし</div>')) + '</div></div>';
  });
  if (L.side) {
    var bb = L.bands.filter(function (b) { return b.boss; })[0];
    var bes = bb.foes.filter(function (e) { return !e.fled && !e.dead; });
    h += '</div><div class="band boss boss-col" data-key="band-boss" style="--bandh:' + Math.round(bb.h) + 'px"><span class="rowlbl">共有ボス（全員を攻撃）</span><div class="enemies" data-count="' + bes.length + '">' + bes.map(function (e) { return foeHTML(cb, e, aim, run, L.sizes['e' + e.u], L.K.compact); }).join('') + '</div></div>';
  }
  var pv = previewHTML(run, pcMe);
  h += '</div><div class="battle-controls' + (pv ? ' selecting' : '') + '" data-key="controls">' + hudHTML(run, cs, pcMe, cb) + (pv || actbarHTML(run, cs, pcMe, aim)) + '</div>' + battleItemsHTML(run, pcMe) + handHTML(run, cs, pcMe, cur);
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
function statusChip(label, key, interactive, cls) { return '<span class="tok ' + (cls || 'etc') + '"' + (interactive === false ? '' : ' data-help="term:' + key + '"') + '>' + esc(label) + '</span>'; }
var TOK_TIP = { str: 'アタックの各ヒット+', weak: 'アタックのダメージ−1', vuln: '受けるダメージ2倍', psn: 'ターン終了時にダメージ' };
function tokHTML(t, interactive) {
  var h = '';
  if (t.str) h += '<span class="tok str"' + (interactive === false ? '' : ' data-help="term:strength"') + ' title="' + TOK_TIP.str + t.str + '"><i>▲</i>筋力' + t.str + '</span>';
  if (t.weak) h += '<span class="tok weak"' + (interactive === false ? '' : ' data-help="term:weak"') + ' title="' + TOK_TIP.weak + '"><i>▼</i>脱力' + t.weak + '</span>';
  if (t.vuln) h += '<span class="tok vuln"' + (interactive === false ? '' : ' data-help="term:vulnerable"') + ' title="' + TOK_TIP.vuln + '"><i>▼</i>弱体化' + t.vuln + '</span>';
  if (t.psn) h += '<span class="tok psn"' + (interactive === false ? '' : ' data-help="term:poison"') + ' title="' + TOK_TIP.psn + '"><i>●</i>毒' + t.psn + '</span>';
  return h;
}
function hpBarHTML(hp, max, blk, psn, interactive) {
  var pct = Math.max(0, Math.min(100, hp / Math.max(1, max) * 100));
  return '<div class="hpbar' + (blk ? ' has-blk' : '') + (psn ? ' psn' : '') + '">' + (blk ? '<span class="blkbadge"' + (interactive === false ? '' : ' data-help="term:block"') + ' aria-label="ブロック' + blk + '">' + blk + '</span>' : '') +
    '<i class="hpfill" style="width:' + pct.toFixed(1) + '%"></i>' + (psn ? '<i class="psnfill" style="left:' + Math.max(0, pct - Math.min(pct, psn / Math.max(1, max) * 100)).toFixed(1) + '%;width:' + Math.min(pct, psn / Math.max(1, max) * 100).toFixed(1) + '%"></i>' : '') +
    '<span class="hptxt">' + Math.max(0, hp) + '/' + max + '</span></div>';
}
function foeHTML(cb, e, aim, run, sz, compact) {
  var m = STS.MONSTERS[e.id] || {};
  var a = null; try { a = cb.currentAction(e); } catch (err) {}
  var target = aim && aim.kind === 'enemy' && aim.set.indexOf(e.u) >= 0;
  var extra = '';
  if (e.x && e.x.thorns) extra += statusChip('トゲ' + e.x.thorns, 'thorns', !aim);
  if (e.x && e.x.enraged) extra += statusChip('激怒', 'enrage', !aim);
  if (e.mode === 'defense') extra += statusChip('防御モード', 'modeshift', !aim);
  if (e.mode === 'fury') extra += statusChip('激怒モード', 'enrage', !aim);
  if (e.x && e.x.invincible) extra += statusChip('無敵', 'intangible', !aim);
  if (e.x && e.x.beat) extra += statusChip('死の鼓動' + e.x.beat, 'beat', !aim);
  if (e.x && e.x.timeWarp) extra += statusChip('ワープ' + e.x.timeWarp, 'timewarp', !aim);
  if (e.x && e.x.intangible) extra += statusChip('HPを失わない', 'intangible', !aim);
  sz = sz || { w: 100, h: 80, slot: 100 };
  var rank = rankOf(e), ib = null;
  if (!e.dead) { try { ib = V.intentBubble(cb, e, a, run, A.me); } catch (err2) { ib = null; } }
  var portrait = V.OFFICIAL_PORTRAIT[m.art] ? ' portrait' : '';
  return '<button class="foe sz-' + rank + portrait + (e.dead ? ' dead' : '') + (target ? ' target' : '') + '" data-a="foe" data-u="' + e.u + '" style="--slot:' + sz.slot + 'px;--bw:' + sz.w + 'px;--bh:' + sz.h + 'px"' +
    ' aria-label="' + esc((m.name || e.id) + ' HP' + e.hp + '/' + e.max + (e.blk ? ' ブロック' + e.blk : '')) + '">' +
    (ib ? '<div class="intent clear-intent' + (ib.aoe ? ' aoe' : '') + (compact ? ' compact' : '') + ' k-' + ib.kinds[0] + '">' + (compact ? ib.compact : ib.html) + '</div>' : '') +
    '<div class="body"><div class="art">' + V.enemyArt(m.art, m.name) + '</div></div>' +
    '<div class="foe-plate"><div class="nm"><span class="side-badge enemy-side">' + (e.row === -1 ? 'ボス' : '敵') + '</span>' + esc(m.name || e.id) + (e.rows ? '<small class="sharedrows">第' + e.rows.map(function (r) { return r + 1; }).join('・') + '列でHP共通</small>' : '') + '</div>' +
    hpBarHTML(e.hp, e.max, e.blk, e.psn, !aim) + '<div class="toks">' + tokHTML(e, !aim) + extra + '</div>' + (target ? '<span class="aimtag">タップで選ぶ</span>' : '') + '</div></button>';
}
function heroHTML(run, pc, aim, sz) {
  var P = run.players[pc.i];
  var target = aim && aim.kind === 'player' && aim.set.indexOf(pc.i) >= 0;
  sz = sz || { w: 100, h: 90, fw: 100, slot: 100 };
  var party = run.players.length > 1;
  return '<button class="hero' + (pc.i === A.me ? ' me' : '') + (pc.ready ? ' ready' : '') + (pc.dead ? ' dead' : '') + (target ? ' target' : '') + (pc.stance && pc.stance !== 'none' ? ' st-' + pc.stance : '') + '" data-ch="' + esc(P.ch) + '" data-a="hero" data-v="' + pc.i + '" data-pi="' + pc.i + '"' +
    ' style="--slot:' + sz.slot + 'px;--bw:' + sz.w + 'px;--bh:' + sz.h + 'px;--fw:' + (sz.fw || sz.w) + 'px" aria-label="' + esc((pc.i === A.me ? 'あなた ' : '') + P.name + ' HP' + P.hp + '/' + maxHp(P) + (pc.blk ? ' ブロック' + pc.blk : '')) + '">' +
    (party ? '<div class="hero-status">' + (pc.dead ? '戦闘不能' : pc.ready ? '✓ ターン終了' : pc.i === A.me ? '' : '行動中…') + '</div>' : '') +
    '<div class="body"><div class="face"><i style="background-image:url(' + V.heroImg(P.ch) + ')"></i></div>' + orbsHTML(pc, !aim) + '</div>' +
    '<div class="hero-plate"><div class="nm"><span class="side-badge ally-side">' + (pc.i === A.me ? 'あなた' : '味方') + '</span>' + esc(P.name) + '</div>' +
    hpBarHTML(P.hp, maxHp(P), pc.blk, 0, !aim) +
    '<div class="toks">' + tokHTML(pc, !aim) + (pc.stance && pc.stance !== 'none' ? statusChip(stanceName(pc.stance), pc.stance, !aim, 'stance-' + pc.stance) : '') + (pc.shiv ? statusChip('ナイフ' + pc.shiv, 'shiv', !aim) : '') + (pc.mir ? statusChip('奇跡' + pc.mir, 'miracle', !aim) : '') + '</div>' +
    (target ? '<span class="aimtag">タップで選ぶ</span>' : '') + '</div></button>';
}
function orbsHTML(pc, interactive) {
  if (!pc.slots) return '';
  var h = '<div class="orbs" aria-label="オーブ">';
  for (var i = 0; i < pc.slots; i++) { var o = pc.orbs[i]; h += '<span class="orb ' + (o || 'empty') + '" data-key="orb-' + pc.i + '-' + i + '"' + (interactive === false ? '' : ' data-a="orbinfo" data-v="' + (o || '') + '" data-pi="' + pc.i + '" title="オーブの効果を読む"') + '>' + (o ? { lightning: '雷', frost: '氷', dark: '闇' }[o] : '') + '</span>'; }
  return h + '</div>';
}
function stanceName(s) { return { wrath: '憤怒', calm: '平静', divinity: '神性' }[s] || ''; }
function hudHTML(run, cs, pc, cb) {
  if (!pc) return '';
  var P = run.players[pc.i], base = 3;
  try { base = Math.min(6, 3 + new STS.Game(run, {}).energyBonus(P)); } catch (e) {}
  var h = '<div class="hud"><div class="energy' + (pc.en ? '' : ' empty') + '" style="background-image:url(' + V.energyImg(P.ch) + ')" aria-label="エナジー' + pc.en + '"><b>' + pc.en + '</b><small>/' + base + '</small></div>';
  if (pc.pow.length) {
    h += '<div class="powers" data-keep="pows">' + pc.pow.map(function (p) {
      var d = STS.CARDS[p.id] || {};
      var act = d.pw && d.pw.activate;
      return '<button class="powchip' + (act ? ' act' : '') + (p.usedTurn ? ' used' : '') + '" data-a="pow" data-u="' + p.u + '">' + esc(d.name + (p.up ? '+' : '')) + (p.v ? '(' + p.v + ')' : '') + '</button>';
    }).join('') + '</div>';
  }
  return h + '</div>';
}
/* One compact shortcut row above the hand. Taps inspect; using still requires the effect panel. */
function itemReadiness(run, pc, kind, def, relic) {
  if (kind === 'potion' && def.passive) return { label: '自動', why: '条件を満たした時に自動で発動します。' };
  if (kind === 'potion' && def.dieOnly) return { label: '出目変更時', why: 'ダイスの結果を受け入れる前の画面で使います。' };
  if (!pc || pc.dead || pc.ready || A.view || !A.sess.playOpen() || run.combat.phase !== 'play') return { label: '待機', why: '自分が行動できる時に使えます。' };
  if (kind === 'relic') {
    var why = def.canActivate ? def.canActivate(SES.query(run), pc, relic) : relic.usedCombat ? 'この戦闘では使用済みです。' : null;
    if (why) return { label: relic.usedCombat ? '使用済み' : '条件待ち', why: why };
  }
  return { label: '使用可', why: '', ready: true };
}
function battleItemsHTML(run, pc) {
  if (!pc) return '';
  var p = run.players[pc.i], items = [];
  p.potions.forEach(function (id, slot) { var def = STS.POTIONS[id]; if (def) items.push({ kind: 'potion', def: def, id: id, value: slot, status: itemReadiness(run, pc, 'potion', def) }); });
  p.relics.forEach(function (r, index) { var def = STS.RELICS[r.id]; if (def && def.activate) items.push({ kind: 'relic', def: def, id: r.id, value: index, status: itemReadiness(run, pc, 'relic', def, r) }); });
  if (!items.length) return '';
  var count = items.filter(function (x) { return x.status.ready; }).length;
  return '<div class="battle-items" data-key="battle-items" aria-label="手札の上のアイテム"><span class="item-row-label">アイテム<small>' + (count ? count + '個使用可' : 'タップで効果') + '</small>' + (items.length > 3 ? '<small>横へ →</small>' : '') + '</span><div class="battle-item-list" data-keep="battle-items">' + items.map(function (x) {
    return '<button type="button" class="battle-item' + (x.status.ready ? ' available' : ' inactive') + '" data-key="item-' + x.kind + '-' + x.value + '" data-a="' + (x.kind === 'potion' ? 'pot' : 'relic') + '" data-v="' + x.value + '" aria-label="' + esc(x.def.name + '：' + x.status.label + '。タップで効果を確認。' + x.status.why) + '">' + (x.kind === 'potion' ? V.potionIcon(x.id) : V.relicIcon(x.id)) + '<span><b>' + esc(x.def.name) + '</b><small>' + x.status.label + '</small></span></button>';
  }).join('') + '</div></div>';
}
function previewHTML(run, pc) {
  if (!pc || A.ui.sel == null || A.ui.aim) return '';
  var c = pc.hand.filter(function (x) { return x.u === A.ui.sel; })[0];
  if (!c) return '';
  var hi = (A.sess.hand(pc.i) || {})[c.u] || {};
  var open = A.sess.playOpen() && !pc.ready && !A.view;
  var d = STS.CARDS[c.id] || {}, cost = hi.cost == null ? (c.up && d.cu !== undefined ? d.cu : d.c) : hi.cost;
  return '<div class="preview classic-preview"><span class="selection-hint"><b>' + esc(V.cardName(c)) + '<small>' + esc(V.TYPE[d.t] || '') + (cost == null || d.unplayable ? '' : '・コスト' + esc(cost)) + '</small></b>' + '<em>' + V.kw(V.cardText(c.id, c.up)) + '</em>' + (hi.why || !open ? '<em class="why">' + esc(hi.why || (A.view ? '演出の後に使えます' : '今は使えません')) + '</em>' : '') + '</span>' +
    '<div class="pvbtns">' + (hi.why || !open ? '' : '<button class="btn primary" data-a="playsel">使う</button>') +
    '<button class="btn ghost sm" data-a="info" data-v="cardGuide">解説</button><button class="btn ghost" data-a="unsel">戻す</button>' +
    (hi.why && open && !pc.ready ? '<button class="btn endturn" data-a="end">ターン終了</button>' : '') + '</div></div>';
}
/* Hand layout: side by side while every card stays readable; from six cards the cards overlap a little
   (left part and cost always visible, press and hold to read one at full size); two rows only when crowded. */
function handLayout(n, avail) {
  var maxW = window.innerWidth >= 900 && window.innerHeight >= 700 ? 150 : 132, gap = 4, room = avail - 12;
  n = Math.max(1, n);
  var flat = Math.floor((room - gap * (n - 1)) / n);
  if (n <= 5 || flat >= 66) return { cw: Math.max(54, Math.min(maxW, flat)), ov: 0, rows: 1 };
  for (var cw = Math.min(maxW, 80); cw >= 58; cw -= 2) { var ov = 1 - ((room - cw) / (n - 1)) / cw; if (ov <= 0.45) return { cw: cw, ov: Math.max(0, ov), rows: 1 }; }
  var per = Math.ceil(n / 2);
  return { cw: Math.max(54, Math.min(maxW, Math.floor((room - gap * (per - 1)) / per))), ov: 0, rows: 2 };
}
function handCardWidth(n, avail) { return handLayout(n, avail).cw; }
function handHTML(run, cs, pc, cur) {
  if (!pc) return '<div class="hand" data-key="hand"></div>';
  var info = A.sess.hand(pc.i) || {};
  var open = A.sess.playOpen() && !pc.ready && !A.view;
  var low = window.innerWidth > window.innerHeight && window.innerHeight <= 520;
  var avail = low ? window.innerWidth * 0.5 : Math.min(window.innerWidth, 1100);
  var n = Math.max(1, pc.hand.length), HL = handLayout(Math.max(5, n), avail);
  var h = '<div class="hand flat-hand' + (HL.rows > 1 ? ' two-rows' : '') + (HL.ov ? ' fan' : '') + '" data-key="hand" style="--cw:' + HL.cw + 'px;--ov:' + HL.ov.toFixed(3) + '">';
  var liveOpen = A.sess.playOpen() && !pc.ready;
  pc.hand.forEach(function (c) {
    var hi = info[c.u];
    // During a replay the marks still follow the real hand, so a card already used never looks playable.
    var playable = hi && !hi.why && (A.view ? liveOpen : open);
    var cls = (A.ui.sel === c.u ? 'sel ' : '') + (playable ? 'ok' : 'no');
    hi = hi || {};
    h += V.card(c, { cost: hi.cost == null ? undefined : hi.cost, cls: cls, attrs: 'data-a="card" data-u="' + c.u + '"' });
  });
  if (!pc.hand.length && /^(endturn|enemy)$/.test(cs.phase)) h += '<div class="hand-empty">敵のターン</div>';
  else if (!pc.hand.length && cs.phase === 'play' && !A.view) h += '<div class="hand-empty">手札なし</div>';
  return h + '</div>';
}
function actbarHTML(run, cs, pc, aim) {
  if (!pc) return '';
  var open = A.sess.playOpen() && !A.view;
  var enemyPhase = /^(endturn|enemy)$/.test(cs.phase);
  var h = '<div class="actbar">';
  h += '<button class="pile draw" data-a="info" data-v="draw" aria-label="山札' + pc.draw.length + '枚"><i></i><b>' + pc.draw.length + '</b><small>山札</small></button>';
  h += '<span class="grow"></span>';
  if (A.ui.aim) h += '<button class="btn sm ghost" data-a="aimcancel">やめる</button>';
  if (pc.shiv > 0 && open && !pc.ready) h += '<button class="btn sm" data-a="shiv">ナイフ</button>';
  if (pc.mir > 0 && open && !pc.ready) h += '<button class="btn sm" data-a="miracle">奇跡</button>';
  if (pc.exh.length) h += '<button class="pile exh" data-a="info" data-v="exh" aria-label="廃棄' + pc.exh.length + '枚"><i></i><b>' + pc.exh.length + '</b><small>廃棄</small></button>';
  h += '<button class="pile disc" data-a="info" data-v="disc" aria-label="捨て札' + pc.disc.length + '枚"><i></i><b>' + pc.disc.length + '</b><small>捨て札</small></button>';
  if (enemyPhase && A.view) h += '<button class="btn ghost endturn" data-a="skipreplay">演出を省略</button>';
  else if (pc.ready) h += '<button class="btn endturn waiting" data-a="unready"' + (open ? '' : ' disabled') + '>待機中<small>取り消す</small></button>';
  else h += '<button class="btn ghost sm turn-guide-button" data-a="info" data-v="turnGuide" aria-label="ターン終了後に起きることの解説">終了後は？</button><button class="btn primary endturn" data-a="end"' + (open && !pc.dead && !enemyPhase ? '' : ' disabled') + '>' + (enemyPhase ? '敵のターン' : 'ターン終了') + '</button>';
  return h + '</div>';
}

/* ================================================================== prompts */
function sheetWrap(inner, o) {
  o = o || {};
  if (!o.dismissible && STS.Explain.enabled()) { var active = curPrompt(); if (active) inner += STS.Explain.fold(STS.Explain.prompt(active.q)); }
  return '<div class="sheet-back' + (o.clear ? ' clear' : '') + (o.cls ? ' ' + esc(o.cls) : '') + '"><div class="sheet' + (o.full ? ' full' : '') + '" data-keep="' + (o.shop ? 'shop-detail' : 'sheet') + '"' + (o.dismissible ? ' role="dialog" aria-modal="true" aria-label="ゲーム情報"' : '') + '>' +
    '<div class="help-sheet-entry">' + STS.HelpUI.button('', '？ この画面の用語・効果') + (o.dismissible ? '<button type="button" class="btn sm ghost sheet-close" data-a="close" aria-label="情報画面を閉じる">閉じる ×</button>' : '') + '</div>' + inner + '</div></div>';
}
function infoWrap(inner, o) {
  o = Object.assign({}, o, { dismissible: true, cls: 'info-sheet' + (o && o.shop ? ' shop-detail' : '') });
  return sheetWrap(inner, o);
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
      q.options.forEach(function (i) { var ocb = SES.query(run), opc = ocb.pc(q.pi == null ? A.me : q.pi), od = STS.Explain.orb(ocb, opc, q.orbs[i]); h += '<button class="opt" ' + ansAttr(i) + '>' + (i + 1) + '番目：' + esc(od.name) + '</button>' + STS.Explain.fold('<p>' + esc(od.endText) + '</p><p>' + esc(od.evokeText) + '</p><p>「ループ」は終了時効果だけを追加発動し、球を取り除きません。「解放」は解放効果を使って球を取り除きます。</p>', (i + 1) + '番目のオーブの解説'); });
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
      if (q.result) return sheetWrap(STS.Explain.result(q.result, A.me) + '<div class="sheetbtns result-continue"><button class="btn primary" ' + ansAttr(true) + (A.ui.resultAck === cur.id ? ' disabled' : '') + '>' + esc(q.ok || '確認して進む') + '</button></div>');
      h = (q.ev && V.eventImg(q.ev) ? '<img class="evimg" src="' + V.eventImg(q.ev) + '" alt="">' : '') + '<h3>' + esc(q.title || '') + '</h3><p class="evtext">' + esc(q.text || '') + '</p>';
      return sheetWrap(h + '<div class="sheetbtns"><button class="btn primary" ' + ansAttr(true) + '>' + esc(q.ok || 'OK') + '</button></div>');
    case 'reward': return rewardHTML(run, cur);
    case 'cardReward': {
      h = '<h3>' + esc(q.title) + '</h3><p class="sub">1枚選んでデッキに加える</p><div class="cardgrid" style="--reward-count:' + Math.max(1, Math.min(3, q.cards.length)) + '">';
      q.cards.forEach(function (c) { h += '<div class="help-card-wrap">' + V.card({ id: c.id, up: c.up }, { cls: 'pick' + (A.ui.rewardPick === c.idx ? ' chosen picked' : ''), attrs: 'data-a="rewardpick" data-v="' + c.idx + '" aria-pressed="' + (A.ui.rewardPick === c.idx) + '"' }) + STS.HelpUI.button('card:' + c.id, '効果を解説') + '</div>'; });
      h += '</div>';
      var pickedC = q.cards.filter(function (c) { return c.idx === A.ui.rewardPick; })[0];
      h += '<p class="reward-pick-text" aria-live="polite">' + (pickedC ? '<b>' + esc(V.cardName(pickedC)) + '</b>' + V.kw(V.cardText(pickedC.id, pickedC.up)) : 'カードをタップすると、ここに効果が大きく表示されます。') + '</p>';
      if (pickedC) h += STS.Explain.fold(STS.Explain.terms(V.cardText(pickedC.id, pickedC.up)));
      h += '<div class="sheetbtns">';
      if (q.skip) h += '<button class="btn ghost" ' + ansAttr(-1) + '>スキップ</button>';
      h += '<button class="btn primary" data-a="rewardconfirm"' + (A.ui.rewardPick == null ? ' disabled' : '') + '>このカードを加える</button></div>';
      return sheetWrap(h, { cls: 'classic-card-reward' });
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
    var explanation = STS.Explain.option(o, run, A.me);
    var off = o.disabled || (o.gold && me(run).gold < o.gold);
    h += '<button class="opt' + (off ? ' off' : '') + '"' + (off ? '' : ' ' + ansAttr(o.id)) + '>' + inner + (off && (o.why || o.gold) ? '<span class="why">' + esc(o.why || (o.gold + 'ゴールド必要')) + '</span>' : '') + '</button>' + STS.Explain.fold(explanation, o.label + 'の解説');
  });
  h += '</div>';
  if (run.players.length > 1 && q.ev) h += '<div class="sheetbtns"><button class="btn sm ghost" data-a="giftgold">ゴールドを渡す</button></div>';
  return sheetWrap(h);
}
// Printed facts are readable outside the small card artwork, including cost-only upgrades.
function upgradeCost(c, up) {
  var d = STS.CARDS[c.id];
  return d.unplayable ? '使用不可' : (up && d.cu !== undefined ? d.cu : d.c);
}
// What actually changes, in words: cost and the differing part of the printed effect.
function upgradeDiffHTML(c) {
  var c0 = upgradeCost(c, false), c1 = upgradeCost(c, true), t0 = V.cardText(c.id, false), t1 = V.cardText(c.id, true), out = [];
  if (String(c0) !== String(c1)) out.push('コスト <s>' + esc(c0) + '</s> → <ins>' + esc(c1) + '</ins>');
  if (t0 !== t1) {
    var i = 0; while (i < t0.length && i < t1.length && t0[i] === t1[i]) i++;
    var j = 0; while (j < t0.length - i && j < t1.length - i && t0[t0.length - 1 - j] === t1[t1.length - 1 - j]) j++;
    // widen to whole digits so "2→12" never reads as a partial number
    while (i > 0 && /[0-9]/.test(t0[i - 1])) i--;
    while (j > 0 && /[0-9]/.test(t0[t0.length - j])) j--;
    var a = t0.slice(i, t0.length - j), b = t1.slice(i, t1.length - j);
    var pre = t0.slice(0, i), post = t0.slice(t0.length - j);
    out.push(t0.length + t1.length <= 44
      ? '<span class="was">' + esc(pre) + (a ? '<s>' + esc(a) + '</s>' : '') + esc(post) + '</span> → ' + esc(pre) + (b ? '<ins>' + esc(b) + '</ins>' : '') + esc(post)
      : (a ? '<s>' + esc(a) + '</s> → ' : '') + (b ? '<ins>' + esc(b) + '</ins>' : '（なくなる）'));
  }
  return '<p class="upgrade-diff">' + (out.length ? '変化：' + out.join('　') : '変化なし') + '</p>';
}
function pickCardsHTML(cur) {
  var q = cur.q, sel = A.ui.msel || [], upgrade = q.preview === 'upgrade';
  var h = '<div class="picker-head"><h3>' + esc(q.title) + '</h3><div class="sub">' + (q.min === q.max ? q.min + '枚選んでください' : q.min + '〜' + q.max + '枚選べます') + '（選択中 ' + sel.length + '）</div></div><div class="picker-body" data-keep="picker"><div class="cardgrid">';
  q.cards.forEach(function (c) {
    var on = sel.indexOf(c.u) >= 0;
    h += V.card(c, { cls: 'pick' + (on ? ' chosen' : ''), attrs: 'data-a="msel" data-u="' + c.u + '" aria-pressed="' + on + '"', cost: c.cost == null ? undefined : c.cost });
  });
  h += '</div></div>';
  var ok = sel.length >= q.min && sel.length <= q.max && (!upgrade || sel.length > 0);
  h += '<div class="picker-footer">';
  if (upgrade && sel.length === 1) {
    var chosen = q.cards.filter(function (c) { return c.u === sel[0]; })[0];
    if (chosen) h += '<div class="upgrade-preview" aria-live="polite"><div class="upgrade-comparison"><div><b>強化前</b>' + V.card(chosen) + '</div><span class="upgrade-arrow" aria-hidden="true">→</span><div class="after"><b>強化後</b>' + V.card({ id: chosen.id, up: true }) + '</div></div>' + upgradeDiffHTML(chosen) + '</div>';
  } else if (upgrade && sel.length > 1) {
    h += '<p class="picker-hint" aria-live="polite">選択中：' + q.cards.filter(function (c) { return sel.indexOf(c.u) >= 0; }).map(function (c) { return esc(V.cardName(c)); }).join('、') + '</p>';
  } else if (upgrade) h += '<p class="picker-hint">強化するカードをタップすると、強化前→強化後をカードで比べられます。選ぶだけでは強化されません。</p>';
  h += '<div class="sheetbtns">' + (q.min === 0 ? '<button class="btn ghost" data-a="mselskip">やめる</button>' : '') + '<button class="btn primary" data-a="mselok"' + (ok ? '' : ' disabled') + '>' + (upgrade ? (sel.length > 1 ? '選んだ' + sel.length + '枚を強化' : 'このカードを強化') : '決定') + '</button></div></div>';
  return sheetWrap(h, { cls: 'card-picker' + (upgrade ? ' upgrade-picker' : '') });
}
function rewardSceneHTML(run, body) {
  var room = run.room || {}, treasure = room.t === 'T';
  var fled = room.fledRows && room.fledRows.indexOf(me(run).row) >= 0;
  return '<div class="classic-reward-screen"><div class="reward-room"><div class="reward-kicker">' + (treasure ? 'TREASURE' : 'BATTLE REWARDS') + '</div><h2 class="victory-word">' + (treasure ? '宝箱' : fled ? '退散' : '勝利') + '</h2><p class="room-sub">' + (fled ? '敵は逃げ去った。' : '戦利品を手に入れた。') + '</p><div class="reward-treasure"><img src="img/reward-chest.webp" alt="戦利品の宝箱"></div>' + body + '</div></div>';
}
function rewardHTML(run, cur) {
  var q = cur.q, h = '<div class="reward-help">' + STS.HelpUI.button('', '？ 用語・効果') + '</div><div class="rewards">';
  q.items.forEach(function (it) {
    var label, icon = '';
    if (it.k === 'gold') { label = it.n + 'ゴールド'; icon = V.icon('gold'); }
    else if (it.k === 'potion') { label = 'ポーション'; icon = '<img src="img/ui/potion.webp?v=' + V.ASSET + '" alt="">'; }
    else if (it.k === 'relic') { label = it.fixed ? 'レリック：' + V.relicName(it.fixed) : 'レリック'; icon = it.fixed ? V.relicIcon(it.fixed) : '<img src="img/reward-chest.webp" alt="">'; }
    else if (it.k === 'card') { label = it.kind === 'rare' ? 'レアカード報酬' : it.kind === 'upgraded' ? 'カード報酬（アップグレード済み）' : 'カード報酬'; icon = V.icon('deck'); }
    else if (it.k === 'colorless') { label = '無色カード報酬'; icon = V.icon('deck'); }
    else label = it.k;
    var desc = { gold: '冒険に使うゴールドを手に入れる', potion: '使い切りのアイテムを手に入れる', relic: '冒険を助けるレリックを手に入れる', card: '候補から1枚選んでデッキに加える', colorless: '無色カードから1枚選ぶ' }[it.k] || '';
    h += '<button class="reward' + (it.taken ? ' taken' : '') + '"' + (it.taken ? ' disabled' : ' ' + ansAttr(it.idx)) + '><span class="ic">' + icon + '</span><span class="reward-caption"><b>' + esc(label) + '</b><small>' + desc + '</small></span><i class="reward-action">' + (it.taken ? '✓ 受取済み' : '受け取る ›') + '</i></button>';
  });
  h += '</div><div class="sheetbtns"><button class="btn primary" ' + ansAttr('done') + '>先へ進む</button></div>';
  return rewardSceneHTML(run, h);
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
// Shop taps are read-only. Only the explicit confirmation submits an answer.
function shopAttr(kind, idx) {
  return 'data-a="shopinspect" data-kind="' + kind + '" data-v="' + idx + '"';
}
function shopSelection(run, cur, v) {
  if (!cur || cur.q.type !== 'shop' || v.pid !== cur.id || !run.room || !run.room.shop) return null;
  var sh = run.room.shop, p = me(run), kind = v.kind;
  var list = kind === 'card' ? sh.cards[A.me] : kind === 'colorless' ? sh.colorless : kind === 'relic' ? sh.relics : kind === 'potion' ? sh.potions : null;
  var it = kind === 'remove' ? { id: 'remove', price: cur.q.removePrice, sold: sh.removed[A.me] } : list && list[v.idx];
  if (!it || (v.id != null && (it.id !== v.id || it.price !== v.price))) return null;
  var why = it.sold ? (kind === 'remove' ? 'この商人では使用済みです。' : '売り切れです。') : p.gold < it.price ? 'ゴールドが足りません。' : '';
  if (!why && kind === 'potion') {
    if (p.relics.some(function (r) { return r.id === 'Sozu'; })) why = 'ソズのためポーションを得られません。';
    else if (p.potions.length >= (run.asc >= 4 ? D.CAP.potionsA4 : D.CAP.potions)) why = 'ポーションが上限です。先に使うか捨ててください。';
  }
  if (!why && kind === 'remove' && !p.deck.some(function (c) { return !(STS.CARDS[c.id] || {}).noRemove; })) why = '除去できるカードがありません。';
  return { item: it, why: why };
}
function shopDetailHTML(run, v) {
  var cur = curPrompt(), choice = shopSelection(run, cur, v);
  if (!choice) { A.ui.info = null; return ''; }
  var it = choice.item, kind = v.kind, card = kind === 'card' || kind === 'colorless';
  var name = card ? V.cardName({ id: it.id }) : kind === 'relic' ? V.relicName(it.id) : kind === 'potion' ? V.potionName(it.id) : 'カード除去';
  var tx = card ? V.cardText(it.id, false) : kind === 'relic' ? V.relicText(it.id) : kind === 'potion' ? V.potionText(it.id) : 'デッキからカードを1枚取り除きます。購入後に除去するカードを選びます。';
  var h = '<h3>' + esc(name) + '</h3>';
  if (card) h += '<div class="cardgrid">' + V.card({ id: it.id, up: false }, { cls: 'big' }) + '</div>';
  else if (kind !== 'remove') h += '<div class="itemrow">' + (kind === 'relic' ? V.relicIcon(it.id) : V.potionIcon(it.id)) + '</div>';
  h += '<p class="evtext">' + esc(tx) + '</p><p class="sub">価格：' + it.price + 'ゴールド ／ 所持金：' + me(run).gold + 'ゴールド' + (me(run).gold >= it.price && !it.sold ? '<br>購入後の残金：' + (me(run).gold - it.price) + 'ゴールド' : '') + '</p>';
  if (kind !== 'remove') h += STS.HelpUI.button((card ? 'card' : kind) + ':' + it.id, '効果を詳しく解説');
  h += STS.HelpUI.related(tx);
  if (choice.why) h += '<p class="why" role="status">' + esc(choice.why) + '</p>';
  h += '<div class="sheetbtns shop-confirm-actions"><button class="btn ghost" data-a="close">やめる</button><button class="btn primary" data-a="shopconfirm"' + (choice.why ? ' disabled' : '') + '>' + it.price + 'Gで購入する</button></div>';
  return infoWrap(h, { shop: true });
}
function shopHTML(run, cur) {
  var sh = run.room && run.room.shop, p = me(run), q = cur.q;
  if (!sh) return sheetWrap('<h3>商人</h3><button class="btn" ' + ansAttr({ act: 'leave' }) + '>店を出る</button>');
  var h = '<h3>商人</h3><div class="sub">所持金 ' + p.gold + 'ゴールド。商品をタップすると効果と価格を確認できます。購入は確認画面から行います。ほかのプレイヤーにゴールドを渡して支払いを助けられます。</div>';
  function item(kind, i, it, icon, name) {
    var cant = p.gold < it.price;
    return '<button class="shopitem' + (it.sold ? ' sold' : '') + (cant ? ' cant' : '') + '" ' + shopAttr(kind, i) + '>' + icon + '<div class="nm">' + esc(name) + '</div><span class="price">' + it.price + 'G</span></button>';
  }
  h += '<div class="shopsec"><h4>レリック</h4><div class="shopitems">' + sh.relics.map(function (it, i) { return item('relic', i, it, V.relicIcon(it.id), V.relicName(it.id)); }).join('') + '</div></div>';
  h += '<div class="shopsec"><h4>ポーション</h4><div class="shopitems">' + sh.potions.map(function (it, i) { return item('potion', i, it, V.potionIcon(it.id), V.potionName(it.id)); }).join('') + '</div></div>';
  var mine = sh.cards[A.me] || [];
  h += '<div class="shopsec"><h4>カード</h4><div class="cardgrid">' + mine.map(function (c, i) { return V.card({ id: c.id, up: false }, { cls: 'pick' + (c.sold ? ' sold' : p.gold < c.price ? ' dim' : ''), attrs: shopAttr('card', i), price: c.price }); }).join('') + '</div></div>';
  if (sh.colorless && sh.colorless.length) h += '<div class="shopsec"><h4>無色カード（全員で共有）</h4><div class="cardgrid">' + sh.colorless.map(function (c, i) { return V.card({ id: c.id, up: false }, { cls: 'pick' + (c.sold ? ' sold' : p.gold < c.price ? ' dim' : ''), attrs: shopAttr('colorless', i), price: c.price }); }).join('') + '</div></div>';
  h += '<div class="opts">';
  var noRemove = sh.removed[A.me] ? 'この商人では使用済み' : p.gold < q.removePrice ? 'ゴールドが足りません' : '';
  h += '<button class="opt' + (noRemove ? ' off' : '') + '"' + (' ' + shopAttr('remove', 0)) + '><span class="br">[カード除去]</span> ' + q.removePrice + 'ゴールド' + (noRemove ? '<span class="why">' + noRemove + '</span>' : '') + '</button>';
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
  if (v.k === 'orbs' && cs) { var orbPc = cs.pcs[v.pi == null ? A.me : v.pi]; return infoWrap(STS.Explain.orbs(SES.query(run), orbPc) + close); }
  if (v.k === 'enemyresults' && cs) { return infoWrap('<h3>ラウンド' + (cs.enemyResultRound || cs.round) + '：敵の行動結果</h3>' + (cs.enemyResults || []).map(function (ev) { return '<section class="effect-guide"><h4>' + esc((STS.MONSTERS[ev.id] || {}).name || ev.id) + '</h4><p>' + esc(STS.Explain.enemyResult(ev, A.me, function (i) { return run.players[i].name; })) + '</p></section>'; }).join('') + close); }
  if (v.k === 'turnGuide' && cs && pc) return infoWrap(STS.Explain.turn(run, A.me) + close);
  if (v.k === 'cardGuide' && pc) {
    var selectedCard = pc.hand.filter(function (c) { return c.u === A.ui.sel; })[0];
    if (!selectedCard) return infoWrap('<p>手札のカードを選んでください。</p>' + close);
    return infoWrap('<h3>' + esc(V.cardName(selectedCard)) + '</h3><p>' + esc(V.cardText(selectedCard.id, selectedCard.up)) + '</p>' + STS.Explain.cardType(selectedCard) + STS.Explain.cardGuide(selectedCard, pc) + STS.HelpUI.button('card:' + selectedCard.id, '用語・詳しい解説') + close);
  }
  if (v.k === 'shop') return shopDetailHTML(run, v);
  if (v.k === 'deck') {
    var who = v.pi != null ? run.players[v.pi] : p;
    h = '<h3>' + esc(who.name) + 'のデッキ（' + who.deck.length + '枚）</h3><div class="cardgrid">' + sortCards(who.deck).map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    return infoWrap(h + close, { full: true });
  }
  if (v.k === 'draw' || v.k === 'disc' || v.k === 'exh' || v.k === 'hand') {
    var tp = cs && cs.pcs[v.pi != null ? v.pi : A.me];
    var list = tp ? (v.k === 'draw' ? sortCards(tp.draw.filter(Boolean)) : v.k === 'disc' ? tp.disc.filter(Boolean).reverse() : v.k === 'hand' ? tp.hand : tp.exh.filter(Boolean)) : [];
    var nm = { draw: '山札（順番は伏せて並べ替え）', disc: '捨て札', exh: '廃棄', hand: '手札' }[v.k];
    h = '<h3>' + esc((tp ? run.players[tp.i].name + '：' : '') + nm) + '（' + list.length + '）</h3><div class="cardgrid">' + list.map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    return infoWrap(h + close, { full: list.length > 6 });
  }
  if (v.k === 'map') return infoWrap('<div style="position:relative;height:70vh">' + mapHTML(run, null, false) + '</div>' + close, { full: true });
  if (v.k === 'menu') {
    h = '<h3>メニュー</h3><div class="opts">';
    h += '<button class="opt" data-a="info" data-v="' + (run.combat ? 'blog' : 'log') + '">' + (run.combat ? '戦闘ログ（ダメージの内訳）' : 'ログ') + '</button>';
    h += '<button class="opt" data-a="info" data-v="party">パーティー</button>';
    if (!run.combat && run.players.length > 1) h += '<button class="opt" data-a="info" data-v="rows">列の入れ替え（戦闘外）</button>';
    h += '<button class="opt" data-a="toggleexplain" aria-pressed="' + STS.Explain.enabled() + '">用語・発動前の補足説明：' + (STS.Explain.enabled() ? 'オン' : 'オフ') + '</button>';
    h += '<button class="opt" data-a="togglemusic">音楽：' + (PREF.music ? 'オン' : 'オフ') + '</button>';
    h += '<button class="opt" data-a="info" data-v="settings">設定・BGMを選ぶ</button>';
    h += externalAudioButton();
    h += '<button class="opt" data-a="togglesfx">効果音：' + (PREF.sfx ? 'オン' : 'オフ') + '</button>';
    h += '<button class="opt" data-a="animspeed">戦闘演出の速さ：' + ({ 1: 'ふつう', 1.6: 'はやい', 2.6: 'とてもはやい', 0: 'なし（結果だけ表示）' }[PREF.anim] || 'ふつう') + '</button>';
    h += '<button class="opt" data-help="">用語・全カード・アイテムの解説</button>';
    h += '<button class="opt" data-a="info" data-v="help">ルールの要点</button>';
    h += '<button class="opt" data-a="quit">' + (A.guest ? '部屋から抜ける' : 'セーブしてタイトルへ') + '</button>';
    if (!A.guest) h += '<button class="opt" data-a="abandon">冒険をあきらめる</button>';
    return infoWrap(h + '</div>' + close);
  }
  if (v.k === 'settings') return infoWrap('<div class="settings-heading"><h3>設定・BGM</h3><button class="btn ghost" data-a="close">戦闘・冒険へ戻る</button></div>' + settingsContent(), { full: true });
  if (v.k === 'log') {
    var lines = (cs && cs.log && cs.log.length ? cs.log : run.log || []).slice().reverse();
    return infoWrap('<h3>ログ</h3><div class="logbox">' + lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' + close, { full: true });
  }
  if (v.k === 'blog') {
    var bl = DIR.lines.slice().reverse(), lastR = null, out = '';
    bl.forEach(function (l) { out += '<div class="lg ' + esc(l.kind) + '">' + esc(l.text) + '</div>'; });
    return infoWrap('<h3>戦闘ログ</h3><p class="note">新しい順です。ダメージがブロックで防がれた量と、実際に減ったHPを確認できます。</p><div class="logbox battle-loglist">' + (out || '<div>まだ記録はありません。</div>') + '</div>' + close, { full: true });
  }
  if (v.k === 'help') return infoWrap(rulesHTML().replace('<div class="page">', '<div>').replace(/<div class="back">.*?<\/div>/, '<h3>ルールの要点</h3>') + close, { full: true });
  if (v.k === 'party') {
    h = '<h3>パーティー</h3><div class="ilist">' + run.players.map(function (o) {
      return '<div class="irow"><img src="' + V.heroImg(o.ch) + '" alt=""><div class="grow"><b>' + esc(o.name) + '</b>（' + esc(D.CHARS[o.ch].name) + '）<p>HP ' + o.hp + '/' + maxHp(o) + '・' + o.gold + 'ゴールド・' + (o.row + 1) + '列・デッキ' + o.deck.length + '枚</p>' +
        '<p>' + o.relics.map(function (r) { return esc(V.relicName(r.id)); }).join('、') + '</p><p>' + o.potions.map(function (id) { return esc(V.potionName(id)); }).join('、') + '</p>' +
        '<button class="btn sm ghost" data-a="info" data-v="deck" data-pi="' + o.i + '">デッキを見る</button></div></div>';
    }).join('') + '</div>';
    return infoWrap(h + close, { full: true });
  }
  if (v.k === 'rows') {
    h = '<h3>列の入れ替え</h3><div class="sub">戦闘の外では列（＝どの遭遇と戦うか）を入れ替えられます。</div><div class="opts">';
    run.players.forEach(function (o) { if (o.i !== A.me) h += '<button class="opt" data-a="swaprow" data-v="' + o.i + '">' + esc(o.name) + '（' + (o.row + 1) + '列）と入れ替える</button>'; });
    return infoWrap(h + '</div>' + close);
  }
  if (v.k === 'relic') {
    var r = p.relics[v.i];
    if (!r) { A.ui.info = null; return ''; }
    var d = STS.RELICS[r.id] || {};
    h = '<div class="itemrow">' + V.relicIcon(r.id) + '<div class="t"><b>' + esc(d.name) + '</b><span>' + esc(V.RELIC_KIND[d.type] || '') + (d.price ? '・' + d.price + 'G' : '') + '</span></div></div><p class="evtext" style="margin-top:8px">' + esc(d.tx) + '</p>';
    if (d.activate && cs) { var rs = itemReadiness(run, pc, 'relic', d, r); h += '<button class="btn primary wide" data-a="userelic" data-v="' + esc(r.id) + '"' + (rs.ready ? '' : ' disabled') + '>使う</button>' + (rs.why ? '<p class="note">' + esc(rs.why) + '</p>' : ''); }
    return infoWrap(h + STS.HelpUI.button('relic:' + r.id, '効果を詳しく解説') + STS.HelpUI.related(d.tx) + close);
  }
  if (v.k === 'ability') {
    var c = D.CHARS[p.ch];
    return infoWrap('<h3>' + esc(c.name) + 'の能力</h3><p class="evtext">' + esc(c.ability) + '</p>' + STS.HelpUI.button('hero:' + p.ch, '能力を詳しく解説') + STS.HelpUI.related(c.ability) + close);
  }
  if (v.k === 'potion') {
    var id = p.potions[v.slot];
    if (!id) { A.ui.info = null; return ''; }
    var pd = STS.POTIONS[id];
    h = '<div class="itemrow">' + V.potionIcon(id) + '<div class="t"><b>' + esc(pd.name) + '</b><span>' + esc(pd.tx) + '</span></div></div><div class="opts" style="margin-top:10px">';
    if (cs && !pd.passive && !pd.dieOnly) { var ps = itemReadiness(run, pc, 'potion', pd); h += '<button class="opt" data-a="usepot" data-v="' + v.slot + '"' + (ps.ready ? '' : ' disabled') + '><span class="br">使う</span></button>' + (ps.why ? '<p class="note">' + esc(ps.why) + '</p>' : ''); }
    if (!cs && pd.out) h += '<button class="opt" data-a="usepotout" data-v="' + v.slot + '"><span class="br">使う</span></button>';
    if (!cs) run.players.forEach(function (o) { if (o.i !== A.me) h += '<button class="opt" data-a="givepot" data-v="' + v.slot + '" data-to="' + o.i + '">' + esc(o.name) + 'に渡す</button>'; });
    h += '<button class="opt" data-a="droppot" data-v="' + v.slot + '">捨てる</button></div>';
    return infoWrap(h + STS.HelpUI.button('potion:' + id, '効果を詳しく解説') + STS.HelpUI.related(pd.tx) + close);
  }
  if (v.k === 'enemy' && cs) {
    var e = null; cs.enemies.forEach(function (x) { if (x.u === v.u) e = x; });
    if (!e) { A.ui.info = null; return ''; }
    var m = STS.MONSTERS[e.id], cb = SES.query(run);
    var rows = V.behaviour(cb, e);
    h = '<div class="row"><div style="width:96px;height:96px;flex:0 0 auto" class="foe-art">' + V.enemyArt(m.art, m.name) + '</div><div><h3 style="margin:0">' + esc(m.name) + '</h3><div class="small">HP ' + e.hp + '/' + e.max + (e.blk ? '・ブロック' + e.blk : '') + '</div><div class="toks" style="justify-content:flex-start">' + tokHTML(e) + '</div>' +
      '<div class="small muted">' + (e.row < 0 ? 'ボス（全員を攻撃）' : (e.row + 1) + '列') + (m.type === 'die' ? '・ダイスで行動' : m.type === 'cube' ? '・行動は順番に進む' : '') + '</div></div></div>';
    if (V.PASSIVE[e.id]) h += '<p class="evtext" style="margin-top:8px">' + esc(V.PASSIVE[e.id]) + '</p>';
    h += STS.Explain.enemy(cb, e, run, A.me);
    h += '<section class="intent-detail"><h4>次の敵ターンの予告</h4><p>' + esc(V.actionRule(cb, e)) + '</p>' + V.intentHTML(cb, e, cb.currentAction(e), run, A.me) + '<p class="note">ダメージはブロックで防ぐ前の値です。カード・状態・先に行動する敵の効果で変わります。</p></section><h4>行動表（今回の行動を強調）</h4><table class="acttable">' + rows.map(function (r) { return '<tr class="' + (r.cur ? 'cur' : '') + '"><td>' + esc(r.k) + '</td><td><b>' + esc(r.name) + '</b><br>' + r.text + '</td></tr>'; }).join('') + '</table>';
    return infoWrap(h + STS.HelpUI.button('enemy:' + e.id, '敵の能力を解説') + STS.HelpUI.related((V.PASSIVE[e.id] || '') + rows.map(function (r) { return r.text; }).join(' ') + ' ブロック 筋力 脱力 弱体化 毒') + close);
  }
  if (v.k === 'hero' && cs) {
    var tpc = cs.pcs[v.i], P = run.players[v.i];
    h = '<h3>' + esc(P.name) + '（' + esc(D.CHARS[P.ch].name) + '）</h3><div class="small">HP ' + P.hp + '/' + maxHp(P) + '・ブロック' + tpc.blk + '・エナジー' + tpc.en + '・' + (tpc.row + 1) + '列</div><div class="toks" style="justify-content:flex-start">' + tokHTML(tpc) + '</div>';
    h += STS.Explain.player(SES.query(run), tpc, run);
    if (tpc.slots) h += '<button class="btn ghost" data-a="orbinfo" data-pi="' + tpc.i + '">オーブ全種類と現在の数値</button>';
    if (tpc.pow.length) h += '<p class="small">パワー：' + tpc.pow.map(function (x) { return esc(STS.CARDS[x.id].name + (x.up ? '+' : '')); }).join('、') + '</p>';
    h += '<p class="small">レリック：' + P.relics.map(function (r) { return esc(V.relicName(r.id)); }).join('、') + '</p>';
    h += '<h3>手札</h3><div class="cardgrid">' + tpc.hand.map(function (c) { return V.card(c, { cls: 'pick' }); }).join('') + '</div>';
    h += '<div class="row wrap"><button class="btn sm ghost" data-a="info" data-v="draw" data-pi="' + v.i + '">山札</button><button class="btn sm ghost" data-a="info" data-v="disc" data-pi="' + v.i + '">捨て札</button><button class="btn sm ghost" data-a="info" data-v="exh" data-pi="' + v.i + '">廃棄</button></div>';
    return infoWrap(h + close, { full: true });
  }
  if (v.k === 'powcard') return infoWrap('<div class="cardgrid">' + V.card({ id: v.id, up: v.up }, { cls: 'big' }) + '</div>' + STS.HelpUI.button('card:' + v.id, '効果を詳しく解説') + STS.HelpUI.related(V.cardText(v.id, v.up)) + (cs && v.u != null && (STS.CARDS[v.id].pw || {}).activate ? '<button class="btn primary" data-a="activatepow" data-u="' + v.u + '">このパワーの起動効果を使う</button>' : '') + close);
  if (v.k === 'die' && cs) {
    var dieCB = SES.query(run);
    h = '<h3>行動ダイス：出目' + (cs.die || '–') + '</h3><p class="evtext">この数字はダメージではありません。ラウンドの始めに1個振り、全員で同じ出目を使います。出目に対応する敵の行動や、一部のレリック・カードの効果が決まります。</p>' +
      '<p class="note">順番で行動する敵や、毎回同じ行動をする敵もいます。敵ごとの表示を確認してください。' + (cs.dieRolled && cs.dieRolled !== cs.die ? '最初の出目' + cs.dieRolled + 'から変更されています。' : '') + '</p><h4>' + (run.players.length > 1 ? '全員がターン終了すると' : 'ターン終了すると') + '</h4>';
    dieCB.actionOrder().forEach(function (e) { var a = dieCB.currentAction(e); h += '<section class="intent-detail"><b>' + esc((STS.MONSTERS[e.id] || {}).name) + '：' + esc(a ? a.name : '') + '</b><p>' + esc(V.actionRule(dieCB, e)) + '</p>' + V.intentHTML(dieCB, e, a, run, A.me) + '</section>'; });
    h += '<p class="note">表示は今の状態で、ブロックで防ぐ前のダメージです。攻撃の回数にも注意。カードや状態、先に行動する敵の効果で変わるため、予告はそのつど更新します。</p>';
    return infoWrap(h + close);
  }
  if (v.k === 'node') {
    var n = run.map && run.map.nodes[v.key];
    return infoWrap('<h3>' + esc(n ? (D.ROOM[n.t] || {}).name : '') + '</h3>' + close);
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
  h += '<p>倒したボス：' + run.bosses + '体（第' + run.act + '幕まで到達）' + (run.mode === 'beginner' ? '・初心者モード' : run.asc ? '・アセンション' + run.asc : '') + '</p>';
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
  if (run.mode !== 'beginner' && run.bosses >= needBosses && run.asc >= s.asc && s.asc < 13) { s.asc = run.asc + 1; msgs.push('アセンション' + s.asc + 'が解放されました'); }
  saveSheet(s);
  A.ui.awardMsg = msgs.join('。');
  A.ui.awarded = true;
  if (!A.guest) store(A.host ? KEYS.coop : KEYS.save, null);
  else store(KEYS.join, null);
}

/* ================================================================== sessions */
function onSession(kind, x) {
  if (kind === 'ev') { DIR.push(x); return; }
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
  var cfg = { players: [{ name: PREF.name || D.CHARS[st.ch].name, ch: st.ch, unlock: charLevel(s.ch[st.ch]) }], mode: st.mode, asc: Math.min(st.asc, s.asc), seed: newSeed(),
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
function readName() { var el = document.getElementById('nm'); if (el) { PREF.name = SES.cleanName(el.value); savePrefs(); } return PREF.name || '冒険者'; }
function hostRoom(saved) {
  var net = NET(); if (!net) { toast('通信モジュールを読み込めませんでした。'); return; }
  if (saved && saved.run) { A.setup.mode = saved.run.mode === 'beginner' ? 'beginner' : 'normal'; A.setup.asc = saved.run.asc || 0; }
  var s = sheet();
  var name = saved ? PREF.name || '冒険者' : readName();
  var code = saved ? saved.code : net.makeCode();
  var link = net.makeLink(NET_KIND);
  A.coop.err = null; A.coop.busy = true; render();
  link.host(code).then(function () {
    var ch = saved ? saved.roster[0].ch : null;
    var roster = new SES.Roster({ name: name, ch: ch, unlock: charLevel(s.ch[ch]), token: token(), deferred: true });
    if (saved) {
      roster.slots = saved.roster.map(function (r, i) { return { name: r.name, ch: r.ch, unlock: r.unlock, token: i === 0 ? token() : r.token, cid: null, online: i === 0 }; });
      roster.started = true;
    }
    var host = new SES.Host(link, roster, { settings: { asc: A.setup.mode === 'beginner' ? 0 : A.setup.asc, mode: A.setup.mode } });
    A.host = host; A.coop.code = code; A.coop.busy = false;
    host.on(function () {
      if (host.roster.phase === 'selecting') { A.screen = 'characters'; completeCoopSelection(); }
      else if (host.roster.phase === 'waiting' && A.screen === 'characters') A.screen = 'lobby';
      render();
    });
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
  if (!host || host.local || host.roster.started) return;
  host.settings = { asc: A.setup.mode === 'beginner' ? 0 : Math.min(A.setup.asc, s.asc), mode: A.setup.mode };
  if (!host.startSelection()) toast('オンラインの参加者が2〜4人そろってから開始してください。');
}
function completeCoopSelection() {
  var host = A.host;
  if (!host || host.local || host.roster.phase !== 'selecting') return;
  var slots = host.roster.slots, chs = slots.map(function (x) { return x.ch; });
  if (slots.length < 2 || slots.length > 4 || !slots.every(function (x) { return x.online && D.CHARS[x.ch]; }) || new Set(chs).size !== slots.length) return;
  host.roster.phase = 'launching';
  var s = sheet();
  var cfg = { players: slots.map(function (x) { return { name: x.name, ch: x.ch, unlock: x.unlock }; }), mode: host.settings.mode, asc: host.settings.asc, seed: newSeed(),
    colorless: colorlessOn(s), act4: act4On(s), charUnlock: charUnlockMap(s) };
  beginHostGame(host, STS.Game.newRun(cfg));
}

function joinRoom(code, tok, ch, name) {
  var net = NET(); if (!net) { toast('通信モジュールを読み込めませんでした。'); return; }
  code = net.cleanCode(code || '');
  if (code.length !== 4) { A.coop.err = '4文字の部屋コードを入れてください。'; render(); return; }
  var s = sheet();
  ch = ch || null;
  var link = net.makeLink(NET_KIND);
  A.coop.err = null; A.coop.code = code; render();
  link.join(code).then(function () {
    var guest = new SES.Guest(link, { token: tok || token(), name: name || PREF.name || '冒険者', ch: ch, unlock: charLevel(s.ch[ch]) });
    A.guest = guest;
    store(KEYS.join, { code: code, token: guest.hello.token, ch: ch, name: guest.hello.name });
    guest.on(function (kind, x) {
      if (kind === 'error' && x && x.rejected) { A.coop.err = x.text; try { guest.close(); } catch (e) {} A.guest = null; A.screen = 'coop'; render(); return; }
      if (kind === 'error' && x && !x.rejected) toast(x.text);
      if (kind === 'roster' && guest.phase === 'selecting') { A.screen = 'characters'; A.coop.err = null; }
      else if (kind === 'roster' && guest.phase === 'waiting' && A.screen === 'characters') A.screen = 'lobby';
      if (kind === 'close') { toast('ホストとの接続が切れました。タイトルから再接続できます。'); }
      if (kind === 'change' && guest.started && A.screen !== 'game') { A.sess = guest; A.me = guest.seat; A.ui = {}; A.screen = 'game'; }
      if (kind === 'ev') { DIR.push(x); return; }
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
  // A long press that opened the magnified card is not also a tap on it.
  if (ZOOM.suppress) { ZOOM.suppress = false; if (ev.target.closest('.hand .card')) { ev.preventDefault(); return; } }
  // Normal taps must not silently erase the remaining enemy attacks.
  if (A.ui.info && ev.target.matches('.info-sheet')) { A.ui.info = null; render(); return; }
  var el = ev.target.closest('[data-a]');
  if (!el) return;
  var a = el.getAttribute('data-a'), v = el.getAttribute('data-v');
  var run = A.sess && A.sess.run();
  var cur = curPrompt();
  switch (a) {
    case 'skipreplay': if (DIR.busy && A.view && A.view.vs && /^(endturn|enemy)$/.test(A.view.vs.ph)) DIR.skip(); return;
    case 'title': A.screen = 'title'; A.ui = {}; render(); return;
    case 'go': A.screen = v; A.coop.err = null; render(); return;
    case 'startertoggle': A.ui.starterOpen = !A.ui.starterOpen; render(); return;
    case 'pickch':
      if (A.screen === 'solo') { A.setup.ch = v; render(); }
      return;
    case 'pickonlinech':
      if (A.screen !== 'characters' || !D.CHARS[v] || el.disabled) return;
      if (A.host) { var claimed = A.host.claimCharacter(0, v, charLevel(sheet().ch[v]), A.host.roster.selection); if (claimed.err) toast(claimed.err); }
      else if (A.guest && A.guest.phase === 'selecting') A.guest.claimCharacter(v, charLevel(sheet().ch[v]));
      return;
    case 'cancelselection': if (A.host) A.host.cancelSelection(); return;
    case 'mode':
      if (['solo', 'coop', 'lobby'].indexOf(A.screen) < 0 || (A.screen === 'lobby' && (!A.host || A.host.roster.started))) return;
      A.setup.mode = v === 'beginner' ? 'beginner' : 'normal';
      if (A.host) { A.host.settings = { asc: A.setup.mode === 'beginner' ? 0 : A.setup.asc, mode: A.setup.mode }; A.host.publishRoster(); }
      render(); return;
    case 'asc': if ((A.host && A.host.roster.started) || A.setup.mode === 'beginner') return; A.setup.asc = +v; if (A.host) { A.host.settings = { asc: +v, mode: A.setup.mode }; A.host.publishRoster(); } render(); return;
    case 'startsolo': startSolo(); return;
    case 'resume': { var sv = load(KEYS.save, null); if (sv && sv.run) startLocal(sv.run, 'solo'); return; }
    case 'host': hostRoom(null); return;
    case 'rehost': { var cs = load(KEYS.coop, null); if (cs && cs.run) hostRoom(cs); return; }
    case 'join': { var code = (document.getElementById('code') || {}).value || A.coop.code; readName(); joinRoom(code); return; }
    case 'rejoin': { var j = load(KEYS.join, null); if (j) joinRoom(j.code, j.token, j.ch, j.name); return; }
    case 'leavelobby': quitGame(); A.screen = 'coop'; render(); return;
    case 'kick': if (A.host) { var gone = A.host.roster.kick(+v); if (gone && gone.cid) try { A.host.link.drop(gone.cid); } catch (e) {} A.host.publishRoster(); completeCoopSelection(); render(); } return;
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
    case 'rewardpick':
      if (!cur || cur.q.type !== 'cardReward' || !cur.q.cards.some(function (c) { return c.idx === +v; })) return;
      A.ui.rewardPick = A.ui.rewardPick === +v ? null : +v; sfx('card'); render(); return;
    case 'rewardconfirm':
      if (!cur || cur.q.type !== 'cardReward' || !cur.q.cards.some(function (c) { return c.idx === A.ui.rewardPick; })) return;
      answer(cur.id, A.ui.rewardPick); return;
    case 'shopinspect': {
      if (!run || !cur || cur.q.type !== 'shop' || A.ui.info) return;
      var view = { k: 'shop', kind: el.getAttribute('data-kind'), idx: +v, pid: cur.id };
      var choice = shopSelection(run, cur, view);
      if (!choice) return;
      view.id = choice.item.id; view.price = choice.item.price;
      A.ui.info = view; render(); return;
    }
    case 'shopconfirm': {
      var selected = A.ui.info;
      if (!run || !selected || selected.k !== 'shop') return;
      var checked = shopSelection(run, cur, selected);
      if (!checked || checked.why) { render(); return; }
      A.ui.info = null;
      answer(cur.id, { act: selected.kind, idx: selected.idx }); return;
    }
    case 'ans': {
      if (!cur) return;
      var pid = +el.getAttribute('data-p');
      if (pid && pid !== cur.id) return;
      var val; try { val = JSON.parse(v); } catch (e) { val = v; }
      if (cur.q.result) { if (A.ui.resultAck === cur.id) return; A.ui.resultAck = cur.id; el.disabled = true; }
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
    case 'mselskip': if (cur && cur.q.min === 0) answer(cur.id, []); return;
    case 'mselok': if (cur) answer(cur.id, (A.ui.msel || []).slice()); return;
    case 'node': if (cur && cur.q.type === 'map') { sfx('step'); answer(cur.id, v); } return;
    case 'nodeinfo': A.ui.info = { k: 'node', key: v }; render(); return;
    case 'card': {
      var uu = +el.getAttribute('data-u');
      if (A.ui.aim) { A.ui.aim = null; }
      if (A.ui.sel === uu) { playSelected(); return; }
      A.ui.sel = uu; sfx('click'); render(); return;
    }
    case 'playsel': playSelected(); return;
    case 'unsel': A.ui.sel = null; render(); return;
    case 'aimcancel': A.ui.aim = null; A.ui.sel = null; render(); return;
    case 'orbinfo': A.ui.info = { k: 'orbs', pi: +(el.getAttribute('data-pi') || A.me) }; render(); return;
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
    case 'end':
      if (!run || !run.combat || run.combat.phase !== 'play' || !A.sess.playOpen() || A.view || run.combat.pcs[A.me].ready) return;
      A.ui.sel = null; A.ui.aim = null; sfx('turn'); cmd({ type: 'end' }); return;
    case 'unready': cmd({ type: 'unready' }); return;
    case 'shiv': {
      var al = aliveEnemies(run);
      if (al.length > 1) { A.ui.aim = { kind: 'enemy', set: al.map(function (e) { return e.u; }), shiv: true, title: 'ナイフ：対象の敵を選択' }; render(); return; }
      sfx('shiv'); cmd({ type: 'shiv' }); return;
    }
    case 'miracle': sfx('energy'); cmd({ type: 'miracle' }); return;
    case 'activatepow': {
      var activePc = myPc(run), activeU = +el.getAttribute('data-u'), activePow = activePc && activePc.pow.filter(function (x) { return x.u === activeU; })[0];
      if (!activePow || activePow.usedTurn || !A.sess.playOpen() || activePc.ready || A.view) return;
      A.ui.info = null; cmd({ type: 'power', u: activeU }); return;
    }
    case 'pow': {
      var pc = myPc(run), pu = +el.getAttribute('data-u');
      var inst = pc && pc.pow.filter(function (p) { return p.u === pu; })[0];
      if (!inst) return;
      var pd = STS.CARDS[inst.id];
      A.ui.info = { k: 'powcard', id: inst.id, up: inst.up, u: inst.u }; render(); return;
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
    case 'toggleexplain': PREF.explainEffects = !STS.Explain.enabled(); savePrefs(); render(); return;
    case 'bgmzone': A.ui.bgmZone = v === 'explore' ? 'explore' : 'combat'; render(); return;
    case 'bgmmode':
      if (['auto', 'single', 'random'].indexOf(v) < 0) return;
      bgmList().mode = v; saveBgmChoice(); return;
    case 'bgmtrack': {
      if (!bgmLibrary().some(function (t) { return t.id === v; })) return;
      var list = bgmList(), at = list.tracks.indexOf(v);
      if (list.mode !== 'random') { list.mode = 'single'; list.tracks = [v]; }
      else if (at < 0) list.tracks.push(v);
      else if (list.tracks.length > 1) list.tracks.splice(at, 1);
      else { toast('ランダム再生には1曲以上選んでください。'); return; }
      saveBgmChoice(); return;
    }
    case 'bgmall': bgmList().tracks = bgmLibrary().map(function (t) { return t.id; }); bgmList().mode = 'random'; saveBgmChoice(); return;
    case 'bgmsource': PREF.bgm = PREF.bgm === 'original' ? 'gemini' : 'original'; applyBgmPrefs(); savePrefs(); render(); return;
    case 'bgmpreview':
      if (SFX && SFX.previewBgm) { EXTERNAL_AUDIO = false; PREF.music = true; if (PREF.bgmVolume === 0) PREF.bgmVolume = 0.25; applyBgmPrefs(); savePrefs(); SFX.previewBgm(v); render(); } return;
    case 'bgmstoppreview': if (SFX && SFX.stopBgmPreview) SFX.stopBgmPreview(); return;
    case 'bgmnext': if (SFX && SFX.nextBgm) SFX.nextBgm(); return;
    case 'externalaudio': EXTERNAL_AUDIO = !EXTERNAL_AUDIO; applyBgmPrefs(); if (!EXTERNAL_AUDIO && SFX && SFX.unlock) SFX.unlock(); render(); return;
    case 'togglemusic': PREF.music = !PREF.music; if (PREF.music) EXTERNAL_AUDIO = false; applyBgmPrefs(); savePrefs(); if (!EXTERNAL_AUDIO && SFX && SFX.unlock) SFX.unlock(); render(); return;
    case 'togglesfx': PREF.sfx = !PREF.sfx; if (PREF.sfx) EXTERNAL_AUDIO = false; applyBgmPrefs(); savePrefs(); if (!EXTERNAL_AUDIO && SFX && SFX.unlock) SFX.unlock(); render(); return;
    case 'animspeed': PREF.anim = PREF.anim === 1 ? 1.6 : PREF.anim === 1.6 ? 2.6 : PREF.anim === 2.6 ? 0 : 1; savePrefs(); render(); return;
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
  if (A.screen !== 'settings' && (!A.ui.info || A.ui.info.k !== 'settings') && SFX && SFX.stopBgmPreview) SFX.stopBgmPreview();
  // music
  if (A.screen === 'game' && run && A.view) { /* keep the battle music until the replay ends */ }
  else if (A.screen === 'game' && run) {
    var scene = run.combat && run.combat.pcs ? (run.combat.kind === 'boss' ? 'boss' : 'combat') : run.room && run.room.t === 'R' ? 'rest' : 'map';
    music(run.phase === 'over' ? null : scene);
  } else music('title');
  updateBgmStatus();
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
  // Party battles: bring the player's own row into view once per battle.
  var mineBand = $app.querySelector('.party-battle .band.mine');
  if (mineBand && run && run.combat && A.ui.scrolledFor !== run.combat) {
    A.ui.scrolledFor = run.combat;
    try { mineBand.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  // The battlefield layout depends on the space it really gets.
  var fsEl = $app.querySelector('.field-scroll');
  if (fsEl) {
    var fw = fsEl.clientWidth, fh = fsEl.clientHeight;
    if (fw && fh && (!A.field || A.field.vw !== window.innerWidth || A.field.vh !== window.innerHeight || Math.abs(A.field.w - fw) > 6 || Math.abs(A.field.h - fh) > 6)) { A.field = { w: fw, h: fh, vw: window.innerWidth, vh: window.innerHeight }; render(); }
  }
}

/* ================================================================== boot */
function boot() {
  if (FX && FX.init) FX.init(document.getElementById('fx'), document.getElementById('floatLayer'));
  applyBgmPrefs();
  document.addEventListener('ibara-bgm-change', updateBgmStatus);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', function (ev) {
    if (ev.defaultPrevented || ev.key !== 'Escape' || STS.HelpUI.state.open) return;
    if (A.ui.info) { A.ui.info = null; ev.preventDefault(); render(); }
    else if (A.ui.aim || A.ui.sel != null) { A.ui.aim = null; A.ui.sel = null; ev.preventDefault(); render(); }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t && t.id === 'bgmVolume') {
      PREF.bgmVolume = Math.max(0, Math.min(100, +t.value)) / 100; applyBgmPrefs(); savePrefs();
      var output = document.getElementById('bgmVolumeText'); if (output) output.textContent = Math.round(PREF.bgmVolume * 100) + '%';
    }
    if (t && t.id === 'bgmSearch') { A.ui.bgmSearch = t.value; render(); }
    if (t && t.id === 'nm') { PREF.name = SES.cleanName(t.value); savePrefs(); }
    if (t && t.id === 'code') A.coop.code = String(t.value || '').toUpperCase();
  });
  // Press and hold a hand card (or point at it with a mouse) to read it at full size.
  document.addEventListener('pointerdown', function (ev) {
    var c = ev.target.closest && ev.target.closest('.hand .card[data-u]');
    clearTimeout(ZOOM.t); ZOOM.start = null;
    if (!c || ev.pointerType === 'mouse') return;
    ZOOM.start = [ev.clientX, ev.clientY];
    ZOOM.t = setTimeout(function () { zoomCard(c); ZOOM.suppress = true; }, 380);
  }, { passive: true });
  document.addEventListener('pointermove', function (ev) { if (ZOOM.start && Math.abs(ev.clientX - ZOOM.start[0]) + Math.abs(ev.clientY - ZOOM.start[1]) > 12) { clearTimeout(ZOOM.t); ZOOM.start = null; } }, { passive: true });
  ['pointerup', 'pointercancel'].forEach(function (n) { document.addEventListener(n, function (ev) { clearTimeout(ZOOM.t); ZOOM.start = null; if (ev.pointerType !== 'mouse') hideZoom(); }, { passive: true }); });
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    var c = ev.target.closest && ev.target.closest('.hand .card[data-u]');
    clearTimeout(ZOOM.h);
    if (c && c.offsetWidth < 118) ZOOM.h = setTimeout(function () { if (c.isConnected && c.matches(':hover')) zoomCard(c); }, 260); else hideZoom();
  });
  document.addEventListener('contextmenu', function (ev) { if (ev.target.closest && ev.target.closest('.hand .card')) ev.preventDefault(); });
  window.addEventListener('resize', function () { hideZoom(); if (Object.keys(FITC).length > 4000) FITC = Object.create(null); render(); });
  // Card text is fitted with the real web fonts once they arrive.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { FITC = Object.create(null); render(); });
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { FITC = Object.create(null); render(); });
  }
  render();
}
var ZOOM = { t: null, h: null, el: null, suppress: false, start: null };
function zoomCard(cardEl) {
  hideZoom();
  var run = A.sess && A.sess.run(); if (!run || !cardEl.isConnected) return;
  var vr = A.view ? viewRun(run) : run;
  var pc = vr.combat && vr.combat.pcs ? vr.combat.pcs[A.me] : null; if (!pc) return;
  var u = +cardEl.getAttribute('data-u'), c = pc.hand.filter(function (x) { return x.u === u; })[0]; if (!c) return;
  var info = (A.sess.hand(A.me) || {})[u] || {};
  var r = cardEl.getBoundingClientRect(), W = window.innerWidth;
  var zw = Math.min(250, Math.max(150, W * 0.46)), zh = zw * 1.41;
  var el = document.createElement('div');
  el.className = 'card-zoom';
  el.style.left = Math.max(6, Math.min(W - zw - 6, r.left + r.width / 2 - zw / 2)) + 'px';
  el.style.top = Math.max(6, r.top - zh - 12) + 'px';
  el.style.width = zw + 'px'; el.style.height = zh + 'px';
  el.innerHTML = V.card(c, { cost: info.cost == null ? undefined : info.cost, attrs: 'tabindex="-1" aria-hidden="true"' });
  document.getElementById('floatLayer').appendChild(el);
  Array.prototype.forEach.call(el.querySelectorAll('.ctext > span'), keepWords);
  fitCards(el);
  if (el.animate) el.animate([{ opacity: 0, transform: 'translateY(14px) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 150, easing: 'ease-out' });
  ZOOM.el = el;
  sfx('click');
}
function hideZoom() { clearTimeout(ZOOM.h); if (ZOOM.el) { ZOOM.el.remove(); ZOOM.el = null; } }
STS.UI = { render: render, draw: function () { draw(); }, fitCards: function (root) { Array.prototype.forEach.call(root.querySelectorAll('.card .ctext > span'), keepWords); fitCards(root); }, state: A, startSolo: startSolo, sheet: sheet, director: DIR, startRun: function (run) { return startLocal(run, 'test'); } };
boot();
})();
