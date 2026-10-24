/* スレイザスパイア — interface, animation director and run flow. */
(function () {
'use strict';
var G = window.IBARA, ART = G.ART, FX = G.FX, SFX = G.SFX, Game = G.Game;
var app = document.getElementById('app');
var modalRoot = document.getElementById('modalRoot');
var S = { run: null, game: null, combat: null, screen: '', acting: false, input: false, sel: null, armed: null };

/* ============================ settings ============================ */
var SET_KEY = 'ibara.settings.v1';
S.set = (function () { try { return Object.assign({ sfx: true, music: true, speed: 1, bgmMode: 'gemini', bgmVolume: 0.25 }, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { return { sfx: true, music: true, speed: 1, bgmMode: 'gemini', bgmVolume: 0.25 }; } })();
function saveSet() { try { localStorage.setItem(SET_KEY, JSON.stringify(S.set)); } catch (e) {} applySet(); }
function applySet() { SFX.on = S.set.sfx; SFX.setMusic(S.set.music); SFX.configureBgm({ mode: S.set.bgmMode, volume: S.set.bgmVolume }); FX.speed = S.set.speed; }

/* ============================ helpers ============================ */
function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function wait(ms) { return FX.wait(ms); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
var toastTimer;
function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2400); }
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
/* ---------- contextual terminology and battle presentation ---------- */
var TERM_BY_NAME = {};
(G.GLOSSARY || []).forEach(function(x){TERM_BY_NAME[x.name]=x;});
var EFFECT_NAME = {str:'闘気',weak:'怯み',vuln:'隙',poison:'毒',thorns:'棘',sleep:'眠り',stun:'ふらつき',plated:'鉄皮',retaliate:'炎の壁',keep:'霧隠れ',next:'次のターン'};
function termDetailHTML(name, owner) {
  var item=TERM_BY_NAME[name] || {description:G.KEYWORDS[name]||EXTRA_KW[name]||'カード本文の条件で発動する効果です。'};
  var live='',c=S.combat,t=owner&&c?(owner==='hero'?c.hero:c.byUid(owner)):null;
  if(t){
    var key=Object.keys(EFFECT_NAME).filter(function(k){return EFFECT_NAME[k]===name;})[0];
    var n=t[key];if(n==null&&t.st)n=t.st[key];
    live='<div class="term-live"><span>現在の状態</span><b>'+esc(t.name)+(typeof n==='number'?' · '+esc(name)+' '+n:' · '+esc(name))+'</b></div>';
    if(name==='怯み'||name==='隙')live+='<p class="term-important">この数字はターン数ではなく、あと何回の攻撃に影響するかを表します。</p>';
  }
  return live+'<p class="term-description">'+esc(item.description)+'</p>'+(item.example?'<div class="term-example"><small>たとえば</small><p>'+esc(item.example)+'</p></div>':'')+(item.note?'<p class="term-note">'+esc(item.note)+'</p>':'');
}
function openTerm(name,owner){
  var body=h('<div class="term-detail">'+termDetailHTML(name,owner)+'<button class="btn ghost small term-all">用語一覧を開く</button></div>');
  var m=modal({title:esc(name),body:body,cls:'term-modal'});
  $('.term-all',body).onclick=function(){m.close();showGlossary(name);};
}
function showGlossary(initial){
  var body=h('<div class="glossary"><p class="glossary-intro">このゲーム内のルールを説明しています。カードの点線の用語や状態アイコンからも開けます。</p><label class="glossary-search"><span>用語を検索</span><input type="search" placeholder="怯み、毒、保持…" aria-label="用語を検索"></label><div class="glossary-layout"><div class="glossary-list"></div><section class="glossary-detail" aria-live="polite"></section></div></div>');
  var active=TERM_BY_NAME[initial]?initial:'怯み',input=$('input',body),list=$('.glossary-list',body),detail=$('.glossary-detail',body);
  function render(){
    var q=input.value.trim();var items=(G.GLOSSARY||[]).filter(function(x){return !q||(x.name+x.description+x.category).indexOf(q)>=0;});
    list.innerHTML=items.map(function(x){return '<button class="term-item'+(x.name===active?' active':'')+'" data-name="'+esc(x.name)+'"><b>'+esc(x.name)+'</b><small>'+x.category+'</small></button>';}).join('')||'<p class="term-empty">見つかりません。別の言葉で検索してください。</p>';
    if(items.length&&!items.some(function(x){return x.name===active;}))active=items[0].name;
    if(items.length){detail.innerHTML='<span class="term-category">'+TERM_BY_NAME[active].category+'</span><h3>'+esc(active)+'</h3>'+termDetailHTML(active);$$('.term-item',list).forEach(function(b){b.classList.toggle('active',b.dataset.name===active);});}else detail.innerHTML='';
  }
  input.oninput=render;list.onclick=function(e){var b=e.target.closest('[data-name]');if(!b)return;active=b.dataset.name;render();};render();
  modal({title:'用語と特殊効果',body:body,cls:'glossary-modal'});
}
var effectNoteTimer;
function effectNote(d){
  if(!S.combat||!R.effectNote||d.delta<=0)return;
  var nm=EFFECT_NAME[d.key]||d.key,summary={weak:'攻撃が1ヒットにつき−1。攻撃後に1減る。',vuln:'受ける攻撃が2倍。攻撃を受けたあと1減る。',str:'攻撃が1ヒットにつき＋'+d.t.str+'。',poison:'ターン終了時にHP−'+d.t.poison+'。盾では防げない。'}[d.key]||'状態アイコンをタップすると詳細を確認できます。';
  clearTimeout(effectNoteTimer);
  var note=R.effectNote;
  effectNoteTimer=setTimeout(function(){if(note.isConnected)note.innerHTML='';},8000);
  R.effectNote.innerHTML='<button class="effect-notice" data-term="'+esc(nm)+'" data-owner="'+(d.t.isHero?'hero':d.t.uid)+'"><small>'+esc(d.t.name)+' · '+esc(nm)+' ＋'+d.delta+'</small><span>'+summary+'</span><i>説明 ›</i></button>';
}
function polishCombatSync(){
  var c=S.combat;if(!c||!R.summary)return;
  var total=0,unknown=false;
  c.alive().forEach(function(e){var p=c.patternOf(e);if(p.die&&!c.die){unknown=true;return;}c.actionOf(e).fx.forEach(function(op){if(op[0]==='atk')total+=c.previewEnemyHit(e,op[1])*(op[2]||1);});});
  R.summary.innerHTML='<div><small>ROUND</small><b>'+Math.max(1,c.round)+'</b></div><div><small>現在の攻撃予告 合計</small><b class="danger">'+(unknown?'?':total)+'</b></div><div><small>あなたの盾</small><b class="defense">'+c.hero.block+'</b></div>';
}
// Stop term taps before the card's pointer and drag handlers can consume them.
document.addEventListener('pointerdown',function(e){if(e.target.closest('[data-term],[data-glossary],[data-enemy-info]'))e.stopPropagation();},true);
document.addEventListener('click',function(e){
  var term=e.target.closest('[data-term]'),gloss=e.target.closest('[data-glossary]'),info=e.target.closest('[data-enemy-info]');
  if(!term&&!gloss&&!info)return;e.preventDefault();e.stopImmediatePropagation();SFX.play('click');
  if(term)openTerm(term.dataset.term,term.dataset.owner);
  else if(gloss)showGlossary();
  else if(S.combat){var enemy=S.combat.byUid(info.dataset.enemyInfo);if(enemy)enemySheet(enemy);}
},true);
document.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-term]')){e.preventDefault();e.target.click();}},true);
function wrapRouteMap(sc,zoom){
  var paper=$('.map-paper',sc);if(!paper)return;
  var w=parseFloat(paper.style.width),hh=parseFloat(paper.style.height);
  var stage=h('<div class="map-stage"></div>');paper.replaceWith(stage);stage.appendChild(paper);
  function set(z){S.mapZoom=Math.max(.3,Math.min(1.6,z));stage.style.width=(w*S.mapZoom)+'px';stage.style.height=(hh*S.mapZoom)+'px';paper.style.transform='scale('+S.mapZoom+')';paper.style.transformOrigin='0 0';paper.style.margin='0';paper.style.position='absolute';paper.style.left='0';paper.style.top='0';}
  set(zoom||1);return {set:set,width:w,height:hh,stage:stage};
}

var SVG = {
  heart: '<svg viewBox="0 0 100 100">' + ART.glyph('heart', '#e5483a', '#5a0a06') + '</svg>',
  coin: '<svg viewBox="0 0 100 100">' + ART.glyph('coin', '#f2cc5a', '#8a6410') + '</svg>',
  deck: '<svg viewBox="0 0 64 64"><rect x="10" y="14" width="30" height="40" rx="4" fill="#5a3a26" stroke="#e8c066" stroke-width="2" transform="rotate(-10 25 34)"/><rect x="22" y="10" width="30" height="40" rx="4" fill="#7a4a2e" stroke="#e8c066" stroke-width="2"/></svg>',
  map: '<svg viewBox="0 0 64 64"><path d="M8 14 L24 8 L40 14 L56 8 L56 50 L40 56 L24 50 L8 56 Z" fill="#c8a870" stroke="#3a2410" stroke-width="2"/><path d="M24 8 V50 M40 14 V56" stroke="#3a2410" stroke-width="2"/><path d="M14 40 L22 30 L32 36 L46 22" stroke="#a02a1a" stroke-width="2.5" fill="none" stroke-dasharray="3 3"/></svg>',
  gear: '<svg viewBox="0 0 100 100">' + ART.glyph('gear', '#d8c8a8', '#2a1a10') + '</svg>',
  pileDraw: '<svg viewBox="0 0 22 26"><rect x="1" y="3" width="15" height="21" rx="2" fill="#5a3a26" stroke="#e8c066"/><rect x="5" y="1" width="15" height="21" rx="2" fill="#7a4a2e" stroke="#e8c066"/></svg>',
  pileDisc: '<svg viewBox="0 0 22 26"><rect x="3" y="3" width="15" height="21" rx="2" fill="#3a3a44" stroke="#9aa"/><path d="M7 13 h7 M7 17 h5" stroke="#9aa"/></svg>',
  pileEx: '<svg viewBox="0 0 22 26"><path d="M11 2 C14 8 18 10 17 16 C16 22 13 24 11 24 C8 24 5 22 5 17 C5 12 9 10 11 2 Z" fill="#c8603a"/></svg>',
  shiv: '<svg viewBox="0 0 100 100">' + ART.glyph('needles', '#e6f3e0', '#2a3a2a') + '</svg>',
  miracle: '<svg viewBox="0 0 100 100">' + ART.glyph('star', '#ffe7a8', '#5a3a10') + '</svg>',
  lantern: '<svg viewBox="0 0 100 100">' + ART.glyph('lantern', '#ffcf6a', '#5a3a10') + '</svg>'
};
function dieFaceSvg(v) {
  var P = { 1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]] };
  return '<svg viewBox="0 0 100 100">' + (P[v] || []).map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (v === 1 ? 12 : 9) + '" fill="' + (v === 1 ? '#b02a1a' : '#2a1a10') + '"/>'; }).join('') + '</svg>';
}

/* ============================ card rendering ============================ */
var HILITE = Object.keys(G.KEYWORDS).filter(function (k) { return k !== 'X'; }).sort(function (a, b) { return b.length - a.length; });
var HILITE_RE = new RegExp('(' + HILITE.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'g');
function cardText(c, combat) {
  var d = G.CARDS[c.id], up = G.card.isUp(c);
  var t = (combat && d.tc) ? d.tc : (up && d.tu ? d.tu : d.t);
  var html = esc(t).replace(HILITE_RE, function(k){ return '<span class="kw" data-term="'+k+'" role="button" tabindex="0" aria-label="'+k+'の説明">'+k+'</span>'; });
  var dyn = (combat && d.dyn) ? (d.dyn(combat, c) || {}) : {};
  return html.replace(/\{(\w+)\}/g, function (m, k) {
    var base = dyn[k] != null ? dyn[k] : G.card.val(c, k);
    var shown = base, cls = 'n';
    if (combat && k[0] === 'd' && d.type === 'atk') { shown = combat.previewHeroHit(base, null); if (shown > G.card.val(c, k)) cls += ' buff'; else if (shown < G.card.val(c, k)) cls += ' nerf'; }
    else if (combat && k[0] === 'b' && combat.hero.powers.h_light) { shown = base + combat.hero.powers.h_light; cls += ' buff'; }
    else if (dyn[k] != null && k !== 'x' && dyn[k] !== G.card.val(c, k)) cls += dyn[k] > G.card.val(c, k) ? ' buff' : ' nerf';
    if (cls === 'n' && up && d.v && Array.isArray(d.v[k]) && d.v[k][0] !== d.v[k][1]) cls += ' upv';
    return '<span class="' + cls + '">' + shown + '</span>';
  });
}
var TYPE_NAME = { atk: '攻撃', skl: '技能', pow: '異能', status: '異常', curse: '呪い' };
function cardHTML(c, o) {
  o = o || {};
  var d = G.CARDS[c.id], up = G.card.isUp(c);
  var hk = d.hero || (d.type === 'curse' ? 'curse' : 'status');
  var cost = d.cost == null ? null : (o.combat ? o.combat.costOf(c) : G.card.baseCost(c));
  var costCls = '';
  if (cost !== null && cost !== 'X') {
    var bc = d.cost;
    if (o.combat) { var b2 = G.card.baseCost(c); if (cost < b2) costCls = ' cheap'; else if (up && d.costUp !== undefined && d.costUp < d.cost) costCls = ' cheap'; }
    else if (up && d.costUp !== undefined && d.costUp !== bc) costCls = ' cheap';
  }
  var text = cardText(c, o.combat);
  var plain = text.replace(/<[^>]+>/g, '');
  var tl = plain.length > 46 ? ' long2' : plain.length > 32 ? ' long' : '';
  var nm = d.name + (up ? '＋' : '');
  var nl = nm.length > 8 ? 'sq2' : nm.length > 6 ? 'sq' : '';
  return '<div class="card h-' + hk + ' t-' + d.type + ' r-' + d.rarity + (up ? ' up' : '') + (o.cls ? ' ' + o.cls : '') + '" data-uid="' + (c.uid || '') + '" data-id="' + c.id + '"' + (o.attr || '') + '>' +
    '<div class="cd-frame"><div class="cd-in"><div class="cd-art">' + ART.cardArt(c.id) + '</div>' +
    '<div class="cd-name"><span class="' + nl + '">' + esc(nm) + '</span></div><div class="cd-type">' + TYPE_NAME[d.type] + '</div>' +
    '<div class="cd-text"><div class="tx' + tl + '">' + text + '</div></div></div></div>' +
    (cost !== null ? '<div class="cd-cost' + costCls + '"><span>' + cost + '</span></div>' : '') +
    '<div class="cd-gem"></div><div class="cd-shine"></div>' + CORNERS + (o.tag || '') + '</div>';
}
var CORNER_SVG = '<svg viewBox="0 0 20 20"><path d="M2 18 L2 9 Q2 2 9 2 L18 2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 18 L5 10 Q5 5 10 5 L18 5" fill="none" stroke="currentColor" stroke-width=".8" opacity=".7"/><circle cx="2" cy="18" r="1.6" fill="currentColor"/><circle cx="18" cy="2" r="1.6" fill="currentColor"/></svg>';
var CORNERS = '<i class="corner bl">' + CORNER_SVG + '</i><i class="corner br">' + CORNER_SVG + '</i>';
function cardEl(c, o) { return h(cardHTML(c, o)); }
function cardKeywords(c) {
  var d = G.CARDS[c.id], t = (G.card.isUp(c) && d.tu ? d.tu : d.t), out = [];
  Object.keys(G.KEYWORDS).forEach(function (k) { if (k !== 'X' && t.indexOf(k) >= 0) out.push(k); });
  if (d.cost === 'X') out.push('X');
  if (t.indexOf('「火傷」') >= 0) out.push('火傷');
  if (t.indexOf('「故障」') >= 0) out.push('故障');
  return uniq(out).filter(function (k) { return !out.some(function (o) { return o !== k && o.indexOf(k) >= 0 && k.length < o.length && k !== '盾'; }); });
}
var EXTRA_KW = { '火傷': G.CARDS.st_burn.t, '故障': G.CARDS.st_glitch.t };

/* ============================ modals ============================ */
function modal(o) {
  var el = h('<div class="modal ' + (o.cls || '') + '"><div class="modal-box">' + (o.title != null ? '<div class="modal-head"><h3>' + o.title + '</h3>' + (o.closable !== false ? '<button class="modal-x" data-x aria-label="閉じる">×</button>' : '') + '</div>' : '') + '<div class="modal-body"></div>' + (o.foot ? '<div class="modal-foot">' + o.foot + '</div>' : '') + '</div></div>');
  var body = el.querySelector('.modal-body');
  if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
  modalRoot.appendChild(el);
  var m = { el: el, body: body, closed: false, close: function () { if (m.closed) return; m.closed = true; el.remove(); if (o.onClose) o.onClose(); } };
  el.addEventListener('click', function (e) { if ((e.target === el && o.closable !== false) || e.target.closest('[data-x]')) { SFX.play('click'); m.close(); } });
  return m;
}
function confirmBox(title, text, yes, no) {
  return new Promise(function (res) {
    var m = modal({ title: title, body: '<p style="line-height:1.7;margin:4px 0 6px">' + text + '</p>', foot: '<button class="btn ghost small" data-n>' + (no || 'やめる') + '</button><button class="btn primary small" data-y>' + (yes || 'はい') + '</button>', closable: true, onClose: function () { res(false); } });
    m.el.querySelector('[data-y]').onclick = function () { SFX.play('click'); res(true); m.close(); };
    m.el.querySelector('[data-n]').onclick = function () { SFX.play('click'); res(false); m.close(); };
  });
}
function inspectCard(c, o) {
  o = o || {};
  var wrap = h('<div class="inspect"></div>');
  var cur = o.combat ? c : { id: c.id, up: G.card.isUp(c), uid: c.uid };
  function render() {
    wrap.innerHTML = '';
    wrap.appendChild(cardEl(cur, { combat: o.combat }));
    if (G.card.canUpgrade({ id: c.id, up: false }) && !o.combat) {
      var tg = h('<button class="btn ghost small up-toggle">' + (cur.up ? '強化前を見る' : '強化後を見る') + '</button>');
      tg.onclick = function () { cur.up = !cur.up; render(); };
      wrap.appendChild(tg);
    }
    var kws = cardKeywords(cur);
    if (kws.length) wrap.appendChild(h('<div class="kw-list">' + kws.map(function (k) { return '<div class="kw-item"><b>' + k + '</b>' + esc(G.KEYWORDS[k] || EXTRA_KW[k] || '') + '</div>'; }).join('') + '</div>'));
  }
  render();
  modal({ title: '', body: wrap, cls: 'inspect-modal' });
}
var tipEl = null;
function closeTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
function tipAt(anchor, html) {
  closeTip();
  tipEl = h('<div class="tip">' + html + '</div>');
  document.body.appendChild(tipEl);
  var r = anchor.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  var x = Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
  var y = r.bottom + 8; if (y + tr.height > window.innerHeight - 8) y = Math.max(8, r.top - tr.height - 8);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  return tipEl;
}
document.addEventListener('pointerdown', function (e) { if (tipEl && !tipEl.contains(e.target) && !e.target.closest('[data-tip-anchor]')) closeTip(); }, true);

/* ============================ top bar ============================ */
function floorText() {
  var run = S.run; if (!run || !run.map) return '';
  var n = run.pos ? S.game.node(run.pos) : null;
  return '<small>階</small>' + (n ? (n.row + 1) : 0) + '<i>/13</i>';
}
function relicBtnHTML(id) {
  var r = G.RELICS[id];
  var used = (S.combat && r.active && S.combat.flags['used_' + id]) || (r.dieMod && S.game && S.game.roomUsed(id));
  var ready = S.combat && r.active && !S.combat.flags['used_' + id];
  return '<button class="relic-btn' + (used ? ' used' : '') + (ready ? ' active-ready' : '') + '" data-relic="' + id + '" data-tip-anchor aria-label="' + esc(r.name) + '">' + ART.relic(id) + '</button>';
}
function topbarHTML() {
  return '<div class="topbar" id="topbar"></div><div class="relicbar" id="relicbar"></div>';
}
function refreshTop() {
  var tb = document.getElementById('topbar'); if (!tb || !S.run) return;
  var run = S.run, g = S.game;
  var hp = S.combat ? S.combat.hero.hp : run.hp, mx = S.combat ? S.combat.hero.maxHp : run.maxHp;
  var gold = run.gold;
  var pots = '';
  for (var i = 0; i < g.potionCap(); i++) { var id = run.potions[i]; pots += '<button class="tb-potion" data-potion="' + i + '" data-tip-anchor aria-label="秘薬">' + (id ? ART.potion(id) : ART.potionEmpty()) + '</button>'; }
  var html = '<div class="tb-stat tb-hp">' + SVG.heart + '<span>' + Math.max(0, hp) + '/' + mx + '</span></div>' +
    '<div class="tb-stat tb-gold" id="tbGold">' + SVG.coin + '<span>' + gold + '</span></div><div class="tb-potions">' + pots + '</div>' +
    '<div class="tb-floor">' + floorText() + '</div>' +
    (S.screen !== 'map' ? '<button class="tb-btn" data-act="map" aria-label="地図を見る">' + SVG.map + '</button>' : '') +
    '<button class="tb-btn" data-act="deck" aria-label="デッキを見る">' + SVG.deck + '<span class="badge">' + run.deck.length + '</span></button>' +
    '<button class="tb-btn" data-act="menu" aria-label="メニュー">' + SVG.gear + '</button>';
  if (tb._html !== html) { tb.innerHTML = html; tb._html = html; }
  var rb = document.getElementById('relicbar');
  if (rb) { var rh = run.relics.map(relicBtnHTML).join(''); if (rb._html !== rh) { rb.innerHTML = rh; rb._html = rh; } }
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('[data-act],[data-relic],[data-potion]');
  if (!t || !t.closest('#topbar,#relicbar')) return;
  SFX.play('click');
  if (t.dataset.act === 'deck') showDeck(S.run.deck, 'デッキ（' + S.run.deck.length + '枚）');
  else if (t.dataset.act === 'map') showMapPeek();
  else if (t.dataset.act === 'menu') showMenu();
  else if (t.dataset.relic) relicTip(t, t.dataset.relic);
  else if (t.dataset.potion != null) potionTip(t, +t.dataset.potion);
});
function relicTip(anchor, id) {
  var r = G.RELICS[id];
  var html = '<b>' + esc(r.name) + '</b>' + esc(r.text);
  var canUse = S.combat && r.active && !S.combat.flags['used_' + id] && S.combat.phase === 'player' && !S.acting;
  if (canUse) html += '<div class="row"><button class="btn small primary" data-use>使う</button></div>';
  var tp = tipAt(anchor, html);
  var b = tp.querySelector('[data-use]');
  if (b) b.onclick = async function () { closeTip(); S.acting = true; await S.combat.activateRelic(id); S.acting = false; CUI.sync(); };
}
function potionTip(anchor, i) {
  var id = S.run.potions[i]; if (!id) return;
  var P = G.POTIONS[id];
  var c = S.combat;
  var canUse = !P.passive && ((c && c.phase === 'player' && !S.acting && P.use) || (!c && P.field));
  var html = '<b>' + esc(P.name) + '</b>' + esc(P.text) + '<div class="row">' + (canUse ? '<button class="btn small primary" data-use>使う</button>' : '') + '<button class="btn small ghost" data-drop>捨てる</button></div>';
  var tp = tipAt(anchor, html);
  var bu = tp.querySelector('[data-use]');
  if (bu) bu.onclick = async function () {
    closeTip();
    if (!c) { P.fieldUse(S.game); S.run.potions.splice(i, 1); S.game.returnPotion(id); SFX.play('heal'); refreshTop(); S.game.save(); return; }
    if (P.target === 'enemy' && c.alive().length > 1) { S.armed = { kind: 'potion', index: i }; CUI.armTargets(true); CUI.hint('秘薬を使う敵を選ぶ'); return; }
    S.acting = true; await c.usePotion(i, c.alive()[0] && c.alive()[0].uid); S.acting = false; CUI.sync();
  };
  tp.querySelector('[data-drop]').onclick = function () { closeTip(); S.run.potions.splice(i, 1); S.game.returnPotion(id); refreshTop(); if (!S.combat) S.game.save(); };
}

/* ============================ choose (player decisions) ============================ */
function pickCards(o) {
  return new Promise(function (res) {
    var sel = [];
    var body = h('<div><p class="room-sub" style="margin:0 0 10px">' + esc(o.prompt || '') + '</p><div class="grid-cards"></div><div class="up-prev"></div></div>');
    var grid = body.querySelector('.grid-cards');
    o.cards.forEach(function (c, i) {
      var el = cardEl(c, { combat: o.combat });
      el.dataset.i = i;
      el.addEventListener('click', function () {
        SFX.play('card');
        var k = sel.indexOf(i);
        if (k >= 0) sel.splice(k, 1); else { if (sel.length >= o.n) sel.shift(); sel.push(i); }
        $$('.card', grid).forEach(function (x) { x.classList.toggle('picked', sel.indexOf(+x.dataset.i) >= 0); });
        upd();
      });
      bindLongPress(el, function () { inspectCard(c, { combat: o.combat }); });
      grid.appendChild(el);
    });
    var min = o.min == null ? o.n : o.min;
    var foot = (min === 0 ? '<button class="btn ghost small" data-skip>' + (o.skipLabel || 'やめる') + '</button>' : '') + '<button class="btn primary small" data-ok disabled>決定</button>';
    var m = modal({ title: o.title || 'カードを選ぶ', body: body, foot: foot, closable: false });
    var ok = m.el.querySelector('[data-ok]');
    function upd() {
      ok.disabled = sel.length < Math.max(1, min) && !(min === 0 && sel.length === 0) ? true : false;
      if (min === 0 && sel.length === 0) ok.disabled = true;
      ok.textContent = '決定' + (o.n > 1 ? '（' + sel.length + '/' + o.n + '）' : '');
      var prev = body.querySelector('.up-prev');
      if (o.mode === 'upgrade' && sel.length === 1) {
        var c = o.cards[sel[0]];
        prev.innerHTML = '<p class="room-sub" style="margin:14px 0 6px">強化すると</p><div class="choice-row" style="margin:0"></div>';
        prev.querySelector('.choice-row').appendChild(cardEl({ id: c.id, up: true }, {}));
      } else prev.innerHTML = '';
    }
    ok.onclick = function () { SFX.play('click'); m.close(); res(sel.map(function (i) { return o.cards[i]; })); };
    var sk = m.el.querySelector('[data-skip]'); if (sk) sk.onclick = function () { SFX.play('click'); m.close(); res([]); };
  });
}
function pickOption(o) {
  return new Promise(function (res) {
    var body = h('<div>' + (o.cards && o.cards.length ? '<div class="choice-row"></div>' : '') + '<div class="opt-list"></div></div>');
    if (o.cards) o.cards.forEach(function (c) { body.querySelector('.choice-row').appendChild(cardEl(c, { combat: o.combat })); });
    var m = modal({ title: o.prompt || '選ぶ', body: body, closable: false });
    o.options.forEach(function (op) {
      var b = h('<button class="event-opt"><b>' + esc(op.label) + '</b></button>');
      b.onclick = function () { SFX.play('click'); m.close(); res(op.id); };
      body.querySelector('.opt-list').appendChild(b);
    });
  });
}
function pickOrb(c, prompt) {
  return new Promise(function (res) {
    var names = { spark: '雷核', frost: '氷核', void: '冥核' };
    var body = h('<div class="orb-pick"></div>');
    c.hero.orbs.forEach(function (o, i) {
      var b = h('<button>' + ART.orb(o) + '<span>' + names[o] + '</span></button>');
      b.onclick = function () { SFX.play('click'); m.close(); res(i); };
      body.appendChild(b);
    });
    var m = modal({ title: prompt || '核を選ぶ', body: body, closable: false });
  });
}
function adjustDie(value, mods) {
  return new Promise(function (res) {
    var cur = value, used = [];
    var body = h('<div class="die-adjust"><div class="die-face"></div><div class="row mods"></div><p class="room-sub" style="margin:0">秘宝で出目を変えられます（1ルームに1回）</p></div>');
    var m = modal({ title: '出目 ' + value, body: body, foot: '<button class="btn primary small" data-ok>この出目で進む</button>', closable: false });
    function render() {
      body.querySelector('.die-face').innerHTML = dieFaceSvg(cur);
      m.el.querySelector('h3').textContent = '出目 ' + cur;
      var row = body.querySelector('.mods'); row.innerHTML = '';
      mods.forEach(function (md) {
        if (used.indexOf(md.id) >= 0) return;
        var opts = md.kind === 'pm1' ? [{ l: '−1', v: cur - 1 }, { l: '+1', v: cur + 1 }] : [{ l: '裏返す（' + (7 - cur) + '）', v: 7 - cur }];
        opts.forEach(function (op) {
          if (op.v < 1 || op.v > 6) return;
          var b = h('<button class="btn ghost small">' + esc(md.name) + '：' + op.l + '</button>');
          b.onclick = function () { SFX.play('dieland'); cur = op.v; used.push(md.id); render(); };
          row.appendChild(b);
        });
      });
    }
    render();
    m.el.querySelector('[data-ok]').onclick = function () { SFX.play('click'); m.close(); res({ value: cur, used: used }); };
  });
}
async function rollDieAnim(v) {
  SFX.play('die');
  var wrap = h('<div class="die3d-wrap"><div class="die3d">' + [1, 2, 3, 4, 5, 6].map(function (i) { return '<div class="face f' + i + '">' + dieFaceSvg(i) + '</div>'; }).join('') + '</div></div>');
  document.body.appendChild(wrap);
  var R = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  var rx = R[v][0] + 720, ry = R[v][1] + 1080;
  var cube = wrap.querySelector('.die3d');
  var dur = 720 / Math.max(0.6, FX.speed);
  var a = cube.animate([{ transform: 'translateY(-160px) rotateX(0) rotateY(0) scale(.6)' }, { transform: 'translateY(10px) rotateX(' + (rx * 0.8) + 'deg) rotateY(' + (ry * 0.8) + 'deg) scale(1.05)', offset: 0.7 }, { transform: 'translateY(0) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) scale(1)' }], { duration: dur, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
  await new Promise(function (r) { a.onfinish = r; });
  SFX.play('dieland');
  var c = FX.center(wrap);
  FX.burst(c.x, c.y, { n: 18, colors: ['#fff3c0', '#ffd27a'], shape: 'star', speed: [60, 200], g: 0, life: [0.4, 0.8], size: [3, 6] });
  var lbl = h('<div class="die-result">出目 ' + v + '</div>'); document.body.appendChild(lbl);
  await wait(400);
  var slot = document.querySelector('.die-slot .die-face');
  if (slot) {
    var r1 = wrap.getBoundingClientRect(), r2 = slot.getBoundingClientRect();
    var b = wrap.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(' + (r2.left + r2.width / 2 - r1.left - r1.width / 2) + 'px,' + (r2.top + r2.height / 2 - r1.top - r1.height / 2) + 'px) scale(.38)', opacity: 0.4 }], { duration: 280 / Math.max(0.6, FX.speed), easing: 'ease-in', fill: 'forwards' });
    lbl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    await new Promise(function (r) { b.onfinish = r; });
  }
  wrap.remove(); lbl.remove();
}
var RANK = { R: 0, U: 1, C: 2, S: 3, X: 4 };
function cardReward(o) {
  return new Promise(function (res) {
    var pick = -1, showUp = !!o.up;
    var body = h('<div><p class="room-sub" style="margin:0 0 6px">' + (o.rare ? 'レア報酬：1枚選んでデッキに加える' : o.up ? '強化済みのカードから1枚選んでデッキに加える' : '1枚選んでデッキに加える') + '</p><div class="choice-row"></div><div style="text-align:center"><button class="btn ghost small" data-prev>' + (o.up ? '' : '強化後を見る') + '</button></div></div>');
    var row = body.querySelector('.choice-row');
    var prevBtn = body.querySelector('[data-prev]'); if (o.up) prevBtn.remove();
    function render() {
      row.innerHTML = '';
      o.options.forEach(function (op, i) {
        var el = cardEl({ id: op.id, up: showUp }, { cls: 'deal' + (pick === i ? ' picked' : '') });
        el.style.animationDelay = (i * 0.08) + 's';
        el.onclick = function () { SFX.play('card'); pick = pick === i ? -1 : i; $$('.card', row).forEach(function (x, j) { x.classList.toggle('picked', j === pick); }); ok.disabled = pick < 0; };
        bindLongPress(el, function () { inspectCard({ id: op.id, up: showUp }); });
        row.appendChild(el);
      });
    }
    var m = modal({ cls:'card-reward-modal', title: o.rare ? 'レア報酬' : 'カード報酬', body: body, foot: '<button class="btn ghost small" data-skip>スキップ</button><button class="btn primary small" data-ok disabled>このカードを加える</button>', closable: false });
    var ok = m.el.querySelector('[data-ok]');
    render();
    if (prevBtn.parentNode) prevBtn.onclick = function () { showUp = !showUp; prevBtn.textContent = showUp ? '強化前を見る' : '強化後を見る'; render(); };
    ok.onclick = function () { SFX.play('card'); m.close(); res(pick); };
    m.el.querySelector('[data-skip]').onclick = function () { SFX.play('click'); m.close(); res(-1); };
  });
}
function relicReveal(id, title) {
  return new Promise(function (res) {
    var r = G.RELICS[id];
    SFX.play('relic');
    var m = modal({ title: title || '秘宝', body: '<div class="relic-reveal">' + ART.relic(id) + '<b>' + esc(r.name) + '</b><p>' + esc(r.text) + '</p></div>', foot: '<button class="btn ghost small" data-n>いらない</button><button class="btn primary small" data-y>受け取る</button>', closable: false });
    m.el.querySelector('[data-y]').onclick = function () { SFX.play('relic'); m.close(); res(true); };
    m.el.querySelector('[data-n]').onclick = function () { SFX.play('click'); m.close(); res(false); };
  });
}
function potionReveal(id, full) {
  return new Promise(function (res) {
    var P = G.POTIONS[id];
    var body = '<div class="relic-reveal">' + ART.potion(id) + '<b>' + esc(P.name) + '</b><p>' + esc(P.text) + '</p>' + (full ? '<p style="color:#e0a090">秘薬がいっぱいです。入れ替える秘薬を選べます。</p><div class="row swap" style="display:flex;gap:8px;justify-content:center"></div>' : '') + '</div>';
    var m = modal({ title: '秘薬', body: body, foot: '<button class="btn ghost small" data-n>いらない</button>' + (full ? '' : '<button class="btn primary small" data-y>受け取る</button>'), closable: false });
    if (full) S.run.potions.forEach(function (pid, i) {
      var b = h('<button class="shop-item">' + ART.potion(pid) + '<span class="nm">' + esc(G.POTIONS[pid].name) + '</span><span class="pr" style="font-size:.66rem;color:#ffb0a0">と交換</span></button>');
      b.onclick = function () { SFX.play('click'); m.close(); res(i); };
      m.el.querySelector('.swap').appendChild(b);
    });
    var y = m.el.querySelector('[data-y]'); if (y) y.onclick = function () { SFX.play('click'); m.close(); res(true); };
    m.el.querySelector('[data-n]').onclick = function () { SFX.play('click'); m.close(); res(false); };
  });
}
function bossRelicPick(list) {
  return new Promise(function (res) {
    var body = h('<div class="opt-list"></div>');
    var m = modal({ title: '至宝を1つ選ぶ', body: body, closable: false });
    list.forEach(function (id, i) {
      var r = G.RELICS[id];
      var b = h('<button class="event-opt" style="flex-direction:row;align-items:center;gap:10px"><span style="width:52px;flex:none">' + ART.relic(id) + '</span><span><b>' + esc(r.name) + '</b><br><small>' + esc(r.text) + '</small></span></button>');
      b.onclick = function () { SFX.play('relic'); m.close(); res(i); };
      body.appendChild(b);
    });
  });
}

var io = {
  emit: function (type, d) { var f = H[type]; var p = null; try { p = f ? f(d || {}) : null; } catch (e) { console.error(e); } if (S.combat && type !== 'draw') CUI.sync(); else if (!S.combat) refreshTop(); return p || null; },
  choose: function (spec) {
    var c = spec.c;
    switch (spec.type) {
      case 'hand': return pickCards({ cards: spec.cards, n: spec.n, min: spec.min, prompt: spec.prompt, title: '手札から選ぶ', combat: c, skipLabel: '選ばない' });
      case 'scry': return pickCards({ cards: spec.cards, n: spec.cards.length, min: 0, prompt: '山札の上から順に並んでいます。捨て札にするカードを選んでください（選ばなくてもよい）。', title: spec.prompt, combat: c, skipLabel: '何も捨てない' });
      case 'pile': return pickCards({ cards: spec.cards, n: spec.n, min: spec.min, prompt: '', title: spec.prompt, combat: c, skipLabel: '選ばない' });
      case 'orb': return pickOrb(c, spec.prompt);
      case 'option': return pickOption(spec);
      case 'die': return adjustDie(spec.value, spec.mods);
      case 'roll': return rollDieAnim(spec.value).then(function () { return spec.mods && spec.mods.length ? adjustDie(spec.value, spec.mods) : { value: spec.value }; });
      case 'relic': return relicReveal(spec.id);
      case 'potion': return potionReveal(spec.id, spec.full);
      case 'reward': return cardReward(spec);
      case 'deck': return pickCards({ cards: spec.cards.slice().sort(deckSort), n: spec.n, min: 0, prompt: spec.prompt, title: { remove: 'カードを取り除く', upgrade: 'カードを強化する', transform: 'カードを変化させる' }[spec.mode] || 'カードを選ぶ', mode: spec.mode, skipLabel: 'やめる' });
      case 'bossRelic': return bossRelicPick(spec.options);
    }
    return Promise.resolve(null);
  }
};
function deckSort(a, b) {
  var da = G.CARDS[a.id], db = G.CARDS[b.id];
  var ta = { atk: 0, skl: 1, pow: 2, status: 3, curse: 4 }, tb = ta;
  return (ta[da.type] - tb[db.type]) || (RANK[da.rarity] - RANK[db.rarity]) || (da.name < db.name ? -1 : da.name > db.name ? 1 : 0) || ((b.up ? 1 : 0) - (a.up ? 1 : 0));
}
function bindLongPress(el, fn) {
  var tm = null, sx = 0, sy = 0;
  el.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; tm = setTimeout(function () { tm = null; el._lp = true; fn(); }, 480); });
  el.addEventListener('pointermove', function (e) { if (tm && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(tm); tm = null; } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { el.addEventListener(ev, function () { if (tm) { clearTimeout(tm); tm = null; } }); });
  el.addEventListener('click', function (e) { if (el._lp) { el._lp = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); fn(); });
}

/* ============================ screens ============================ */
function show(el, name) {
  closeTip();
  app.innerHTML = ''; app.appendChild(el); S.screen = name;
  document.body.classList.toggle('in-combat', name === 'combat');
  if (document.getElementById('topbar')) refreshTop();
}
async function fadeTo(fn) {
  var f = document.querySelector('.fade-black') || document.body.appendChild(h('<div class="fade-black"></div>'));
  f.classList.add('on'); await wait(320);
  var r; try { r = fn(); } finally { setTimeout(function () { f.classList.remove('on'); }, 30); }
  return r;
}
function titleScreen() {
  S.tutorial = null; document.body.classList.remove('in-tutorial');
  S.combat = null; S.run = null; S.game = null;
  SFX.music('title');
  var saved = Game.load();
  var el = h('<div class="screen title-screen"><div class="title-bg sts-title-bg"></div>' +
    '<div class="title-tools"><button class="iconbtn" data-a="settings" aria-label="設定">' + SVG.gear + '</button></div>' +
    '<div class="title-mark"><h1><img class="title-logo" src="img/logo.png" alt="Slay the Spire"></h1><div class="en">スレイザスパイア</div><div class="act">第一層　序章</div></div>' +
    '<div class="title-menu">' + (saved ? '<button class="btn primary" data-a="continue">つづきから</button>' : '') +
    '<button class="btn' + (saved ? '' : ' primary') + '" data-a="new">はじめから</button>' +
    '<button class="btn coop-entry" data-a="coop">オンライン協力 · 最大4人</button><button class="btn tutorial-entry" data-a="tutorial">はじめての方へ · チュートリアル戦</button><button class="btn ghost" data-a="rules">遊び方</button><button class="btn ghost small" data-glossary>用語・特殊効果</button></div>' +
    '<div class="title-foot">公式ルールへの改修中。1人用・オンライン2〜4人協力。第1幕のみで、公式との完全一致は未達です。</div></div>');
  el.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    SFX.unlock(); SFX.play('click'); SFX.music('title');
    var a = b.dataset.a;
    if (a === 'continue') { var run = Game.load(); if (run) resumeRun(run); }
    else if (a === 'new') { if (saved && !(await confirmBox('はじめから', '今の冒険の記録は消えます。よろしいですか？', 'はじめる'))) return; fadeTo(heroScreen); }
    else if (a === 'tutorial') { fadeTo(startTutorial); }
    else if (a === 'coop') { G.COOP.open(); }
    else if (a === 'rules') showRules();
    else if (a === 'settings') showSettings();
  });
  show(el, 'title');
  var amb = setInterval(function () { if (S.screen !== 'title') { clearInterval(amb); return; } FX.burst(Math.random() * window.innerWidth, window.innerHeight * (0.55 + Math.random() * 0.4), { n: 1, colors: ['#ffb35c', '#ffd27a'], shape: 'dot', speed: [10, 30], angle: -Math.PI / 2, spread: 0.5, g: -20, life: [2, 3.5], size: [1, 2.2], glow: true, drag: 0 }); }, 220);
}
function heroScreen() {
  var ids = ['knight', 'huntress', 'doll', 'maiden'], selId = 'knight';
  var el = h('<div class="screen hero-screen"><div class="screen-head"><button class="iconbtn" data-a="back" aria-label="戻る">←</button><h2>挑む者を選ぶ</h2></div><div class="hero-grid"></div><div class="hero-detail"></div></div>');
  var grid = el.querySelector('.hero-grid');
  ids.forEach(function (id) {
    var H = G.HEROES[id];
    var b = h('<button class="hero-card" data-id="' + id + '" style="--hc:' + H.color + ';--hc2:' + H.color2 + '"><div class="portrait">' + ART.hero(id) + '</div><div class="hname">' + H.name + '</div><div class="hen">' + H.en.toUpperCase() + '</div><div class="hmeta"><span>HP ' + H.hp + '</span><span class="stars">' + '★★★'.slice(0, H.difficulty) + '<span style="opacity:.25">' + '★★★'.slice(H.difficulty) + '</span></span></div></button>');
    grid.appendChild(b);
  });
  function detail() {
    var H = G.HEROES[selId], r = G.RELICS[H.relic];
    $$('.hero-card', el).forEach(function (b) { b.classList.toggle('sel', b.dataset.id === selId); });
    var d = el.querySelector('.hero-detail');
    d.innerHTML = '<p>' + esc(H.lore) + '</p><ul>' + H.traits.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="relic-line">' + ART.relic(H.relic) + '<span><b>' + esc(r.name) + '</b>：' + esc(r.text) + '</span></div>' +
      '<div class="mini-deck"></div><button class="btn primary wide" data-a="go">' + H.name + 'で挑む</button>';
    var md = d.querySelector('.mini-deck');
    uniq(H.starter).forEach(function (id) { var n = H.starter.filter(function (x) { return x === id; }).length; var w = h('<div style="position:relative"></div>'); var ce = cardEl({ id: id }); w.appendChild(ce); if (n > 1) w.appendChild(h('<span style="position:absolute;right:-4px;bottom:-4px;background:#1a120c;border-radius:9px;padding:0 5px;font:800 .7rem/18px Cinzel;box-shadow:inset 0 0 0 1px #a8772a">×' + n + '</span>')); w.onclick = function () { inspectCard({ id: id }); }; md.appendChild(w); });
  }
  el.addEventListener('click', function (e) {
    var hc = e.target.closest('.hero-card'); if (hc) { SFX.play('click'); selId = hc.dataset.id; detail(); return; }
    var b = e.target.closest('[data-a]'); if (!b) return;
    SFX.play('click');
    if (b.dataset.a === 'back') fadeTo(titleScreen);
    if (b.dataset.a === 'go') { SFX.play('relic'); fadeTo(function () { startRun(selId); }); }
  });
  show(el, 'hero'); detail();
}

/* ---------- guided practice: the same cards, engine and input as a normal fight ---------- */
function tutorialAllows(id) {
  var needed = { 1: 'k_strike', 2: 'k_guard', 4: 'k_brand', 5: 'k_strike' };
  return S.tutorial && needed[S.tutorial.step] === id;
}
function tutorialUpdate() {
  if (!S.tutorial || !R.root || !S.combat) return;
  var t = S.tutorial, steps = {
    1: ['攻撃カードを使う', '敵の頭上の「1」は、次に受けるダメージ。まず光っている「ストライク」を2回タップして、1ダメージを与えましょう。', '左上の「1」が必要なエナジー。使うと3 → 2になります。'],
    2: ['防御でダメージを防ぐ', '次は光っている「防御」を2回タップ。盾を1得て、敵の攻撃1をちょうど防ぎます。', '攻撃だけでなく、敵の予告を見て防御を選ぶのがコツです。'],
    3: ['ターンを終了する', '盾が1になりました。光っている「ターン終了」を押して、敵の攻撃を受けてみましょう。', '残ったエナジーは持ち越しません。次のターンには3に戻ります。'],
    4: ['強打で敵を弱らせる', 'HPを減らさず防げました！ エナジーは3に回復し、盾は消え、手札を5枚引き直します。「強打」を2回タップしましょう。', '強打は2コスト。2ダメージに加え「隙」を与えます。'],
    5: ['順番を考えて、とどめ', '強打で敵に「隙」がつきました。残りエナジー1で「ストライク」を使うと、1ダメージが2倍になって敵を倒せます。', '強打 → ストライク。この版では「隙」は次の攻撃を2倍にします。']
  };
  var box = $('#tutorialGuide', R.root);
  if (!box) {
    box = h('<aside class="tutorial-guide" id="tutorialGuide" role="status" aria-live="polite"></aside>'); R.root.appendChild(box);
  }
  var step = steps[t.step];
  if (!step) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="tutorial-top"><span>練習戦 · '+t.step+' / 5</span><button class="tutorial-exit" type="button">練習を終了</button></div><h3>'+step[0]+'</h3><p>'+step[1]+'</p><small>'+step[2]+'</small><div class="tutorial-progress">'+[1,2,3,4,5].map(function(i){return '<i class="'+(i<=t.step?'done':'')+'"></i>';}).join('')+'</div>';
  $('.tutorial-exit', box).onclick = async function(){
    if (!(await confirmBox('練習を終了', '途中の冒険のセーブには影響しません。タイトルに戻りますか？','戻る'))) return;
    S.combat.abort(); S.tutorial = null; document.body.classList.remove('in-tutorial'); titleScreen();
  };
  Object.keys(cardEls).forEach(function(uid){
    var card=S.combat.hand.filter(function(c){return String(c.uid)===uid;})[0];
    cardEls[uid].classList.toggle('tutorial-target',!!card&&tutorialAllows(card.id));
  });
  R.end.classList.toggle('tutorial-target',t.step===3);
  R.energy.classList.toggle('tutorial-energy',t.step===1||t.step===4);
}
async function startTutorial() {
  document.body.classList.add('in-tutorial');
  var run=Game.newRun('knight',1734);
  run.relics=[]; run.potions=[];
  // The deck is dealt from the end. Fixed hands make every lesson reproducible.
  run.deck=['k_strike','k_guard','k_guard','k_strike','k_strike','k_brand','k_strike','k_guard','k_strike','k_guard'].reverse().map(function(id){return G.card.mk(id);});
  var g=new Game(run,io);g.save=function(){};g.rng.shuffle=function(a){return a;};
  G.ENEMIES.tutorial_slime={id:'tutorial_slime',name:'練習用スライム',hp:5,art:'slime_s',single:{name:'体当たり',fx:[['atk',1]]}};
  S.run=run;S.game=g;S.tutorial={step:1};
  var c=g.newCombat({kind:'tutorial',enemies:['tutorial_slime'],rewards:[]});S.combat=c;
  SFX.music('combat');CUI.build(c);
  var result=await c.start();
  if(c.aborted||!S.tutorial||S.combat!==c)return;
  S.input=false;await wait(400);SFX.play('victory');
  S.combat=null;document.body.classList.remove('in-tutorial');
  var el=h('<div class="screen tutorial-complete"><div class="room"><div class="victory-word">練習戦クリア！</div><p class="room-sub">攻撃・防御・エナジー・ターンの流れを覚えました。</p><div class="tutorial-summary"><p><b>① 敵の予告を見る</b>　攻撃の数字に合わせて盾を用意。</p><p><b>② エナジー3で組み立てる</b>　カードの左上がコスト。</p><p><b>③ カードの順番を考える</b>　強打で「隙」→ストライクで大ダメージ。</p></div><h3>最後に、報酬を選んでみよう</h3><p class="room-sub">勝利後は3枚から1枚を選べます。増やさずスキップもできます。</p><div class="tutorial-rewards"></div><button class="btn ghost small" data-a="skip">今回はスキップ</button><p class="tutorial-reward-result" role="status"></p><div class="tutorial-finish-buttons" hidden><button class="btn primary" data-a="start">本番のキャラクターを選ぶ</button><button class="btn ghost" data-a="again">もう一度練習</button><button class="btn ghost" data-a="title">タイトルへ</button></div><p class="room-sub" style="margin-top:16px">練習中のHP・カードは本番へ引き継ぎません。途中の冒険も保存したままです。</p></div></div>');
  show(el,'tutorial-complete');
  var picked=false;
  function pick(id){
    if(picked)return;picked=true;SFX.play('card');
    $('.tutorial-reward-result',el).textContent=id?'「'+G.CARDS[id].name+'」を練習デッキに加えました。これで準備完了！':'カードを増やさないのも戦略。これで準備完了！';
    $('.tutorial-finish-buttons',el).hidden=false;
    $('[data-a="skip"]',el).disabled=true;
    $$('.tutorial-rewards .card',el).forEach(function(x){x.classList.toggle('chosen',x.dataset.id===id);x.classList.toggle('not-chosen',x.dataset.id!==id);});
    if(id)g.addCard(id);
  }
  ['k_sweep','k_wall','k_twin'].forEach(function(id){var card=cardEl({id:id});card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',G.CARDS[id].name+'を受け取る');card.onclick=function(){pick(id);};card.onkeydown=function(e){if(e.key==='Enter'||e.key===' ')pick(id);};$('.tutorial-rewards',el).appendChild(card);});
  el.addEventListener('click',async function(e){var b=e.target.closest('[data-a]');if(!b)return;var a=b.dataset.a;if(a==='skip')pick(null);else if(a==='title')titleScreen();else if(a==='again')startTutorial();else if(a==='start'){
    if(Game.load()&&!(await confirmBox('本番をはじめる','途中の冒険を置き換えて新しくはじめますか？','はじめる')))return;
    S.tutorial=null;heroScreen();
  }});
}

/* ---------- run flow ---------- */
function startRun(heroId) {
  Game.clear();
  var run = Game.newRun(heroId);
  S.run = run; S.game = new Game(run, io);
  var bl = run.blessingDeck[0];
  run.phase = 'blessing'; run.blessing = bl;
  S.game.save();
  blessingScreen();
}
function resumeRun(run) {
  S.run = run; S.game = new Game(run, io);
  fadeTo(function () {
    if (run.phase === 'blessing') blessingScreen();
    else if (run.phase === 'room' && run.room) playRoom(run.room);
    else mapScreen();
  });
}
function blessingScreen() {
  SFX.music('title');
  var run = S.run, g = S.game, X = g.api();
  var B = G.BLESSINGS.filter(function (b) { return b.id === run.blessing; })[0] || G.BLESSINGS[0];
  var el = h('<div class="screen">' + topbarHTML() + '<div class="room"><div class="bless-spirit">' + ART.lanternSpirit() + '</div><div class="room-title">灯火の祝福</div><p class="room-sub">「よく来た、挑む者よ。塔は今夜も目を覚ましている。<br>この灯を持っていくといい」</p>' +
    '<div class="bless-card"><div class="bless-red"><small>灯火の贈り物</small>' + esc(B.red.label) + '</div><div class="bless-blue"></div></div></div></div>');
  show(el, 'bless');
  var blue = el.querySelector('.bless-blue'), done = false;
  (async function () {
    if (!run.blessRed) {
      await wait(650);
      var rc = FX.center(el.querySelector('.bless-red'));
      FX.burst(rc.x, rc.y, { n: 30, colors: ['#ffd27a', '#ff9a5a', '#fff3c0'], shape: 'star', speed: [60, 220], g: 40, life: [0.5, 1.1] });
      await B.red.run(X); run.blessRed = true; SFX.play('relic'); refreshTop(); g.save(); toast('灯火の贈り物：' + B.red.label);
    }
    el.querySelector('.bless-red').classList.add('got');
    $$('.event-opt', blue).forEach(function (x) { x.disabled = false; });
  })();
  B.blue.forEach(function (op, i) {
    var b = h('<button class="event-opt"' + (run.blessRed ? '' : ' disabled') + '><b>' + esc(op.label) + '</b>' + (op.cost ? '<span class="cost">代償：' + esc(op.cost) + '</span>' : '') + '</button>');
    b.onclick = async function () {
      if (done) return; done = true; SFX.play('click');
      $$('.event-opt', blue).forEach(function (x) { x.disabled = true; });
      await op.run(X);
      refreshTop();
      run.phase = 'map'; g.save();
      await wait(300);
      fadeTo(function () { enterNode('S'); });
    };
    blue.appendChild(b);
  });
}
function enterNode(id) {
  var room = S.game.enter(id);
  S.game.save();
  return playRoom(room);
}
async function playRoom(room) {
  var run = S.run;
  if (room.type === 'combat') return combatRoom(room);
  if (room.type === 'rewards') return rewardScreen(room);
  if (room.type === 'event') return eventRoom(room);
  if (room.type === 'rest') return restRoom(room);
  if (room.type === 'shop') return shopRoom(room);
  if (room.type === 'treasure') return treasureRoom(room);
  return afterRoom();
}
function afterRoom() {
  var run = S.run;
  if (run.hp <= 0) return defeatScreen();
  run.phase = 'map'; run.room = null; S.game.save();
  fadeTo(mapScreen);
}

/* ---------- map ---------- */
var ROWH = 76;
function mapGeom(paperW) {
  var rows = 13, pad = 44, top = 150, bottom = 70;
  var H = top + (rows - 1) * ROWH + bottom;
  return { H: H, x: function (n) { return pad + n.x * (paperW - pad * 2); }, y: function (n) { return H - bottom - n.row * ROWH; } };
}
function mapHTML(interactive) {
  var run = S.run, g = S.game, map = run.map;
  var paperW = Math.min(560, window.innerWidth - 20);
  var M = mapGeom(paperW);
  var reach = interactive ? g.reachable() : [];
  var byId = {}; map.nodes.forEach(function (n) { byId[n.id] = n; });
  var visitedEdges = {};
  for (var i = 1; i < run.visited.length; i++) visitedEdges[run.visited[i - 1] + '>' + run.visited[i]] = true;
  var paths = map.edges.map(function (e) {
    var a = byId[e[0]], b = byId[e[1]];
    var x1 = M.x(a), y1 = M.y(a), x2 = M.x(b), y2 = M.y(b);
    var mx = (x1 + x2) / 2 + (((ART.hash(e[0] + e[1]) % 21) - 10)), my = (y1 + y2) / 2;
    var vis = visitedEdges[e[0] + '>' + e[1]];
    var pathClass=vis?'route-used':e[0]===run.pos&&reach.indexOf(e[1])>=0?'route-next':'route-future';
    return '<path class="'+pathClass+'" d="M' + x1 + ' ' + y1 + ' Q' + mx + ' ' + my + ' ' + x2 + ' ' + y2 + '" stroke="' + (vis ? '#8a1a0a' : '#5a3a1a') + '" stroke-width="' + (vis ? 3.5 : 2.2) + '" fill="none" stroke-dasharray="' + (vis ? '0' : '5 6') + '" opacity="' + (vis ? .9 : .7) + '"/>';
  }).join('');
  var nodes = map.nodes.map(function (n) {
    var x = M.x(n), y = M.y(n), cls = 'map-node' + (n.space === 'dark' || n.kind === 'enc' || n.kind === 'elite' || n.kind === 'start' ? ' dark' : '');
    if (n.kind === 'boss') {
      var bossE = G.ENCOUNTERS[run.boss].enemy;
      return '<button class="map-node boss' + (reach.indexOf(n.id) >= 0 ? ' reach' : '') + '" data-node="' + n.id + '" style="left:' + x + 'px;top:' + y + 'px" aria-label="層の主">' + ART.enemy(G.ENEMIES[bossE].art) + '</button><div class="boss-name" style="left:' + x + 'px;top:' + (y - 72) + 'px">' + esc(G.ENEMIES[bossE].name) + '</div>';
    }
    if (reach.indexOf(n.id) >= 0) cls += ' reach';
    if(n.id===run.pos)cls+=' current';
    if (run.visited.indexOf(n.id) >= 0 && n.id !== run.pos) cls += ' visited';
    return '<button class="' + cls + '" data-node="' + n.id + '" style="left:' + x + 'px;top:' + y + 'px" aria-label="' + ART.NODE_NAME[n.kind] + '">' + ART.node(n.kind) + '<span class="map-node-label">'+ART.NODE_NAME[n.kind]+'</span></button>';
  }).join('');
  var cur = run.pos ? byId[run.pos] : null;
  var marker = cur ? '<div class="map-marker" style="left:' + M.x(cur) + 'px;top:' + M.y(cur) + 'px">' + SVG.lantern + '</div>' : '';
  var legend = ['enc', 'elite', 'event', 'rest', 'shop', 'treasure'].map(function (k) { return '<span>' + ART.node(k) + ART.NODE_NAME[k] + '</span>'; }).join('');
  return '<div class="map-paper" style="width:' + paperW + 'px;height:' + (M.H + 60) + 'px"><div class="map-title"><b>第一層　序章</b><small>' + esc(map.name) + '</small></div>' +
    '<svg class="map-svg" viewBox="0 0 ' + paperW + ' ' + (M.H + 60) + '" style="height:' + (M.H + 60) + 'px">' + paths + '</svg>' + nodes + marker +
    '<div class="map-legend" style="position:absolute;left:0;right:0;bottom:12px">' + legend + '</div></div>';
}
function mapScreen() {
  S.combat = null;
  SFX.music('map');
  var el = h('<div class="screen map-screen">' + topbarHTML() + '<div class="route-toolbar"><div><small>THE EXORDIUM</small><b>次の目的地を選ぶ</b></div><div class="route-view-controls"><button data-view="fit">全体</button><button data-view="current">現在地</button><button data-view="minus" aria-label="地図を縮小">−</button><button data-view="plus" aria-label="地図を拡大">＋</button></div></div><div class="route-key"><span class="next">進める場所</span><span class="passed">通過済み</span><button data-glossary>用語・効果 ？</button></div><div class="map-scroll">' + mapHTML(true) + '</div></div>');
  show(el, 'map');
  var sc=el.querySelector('.map-scroll');var view=wrapRouteMap(sc,1);
  $('.route-view-controls',el).onclick=function(e){var b=e.target.closest('[data-view]');if(!b)return;var a=b.dataset.view;if(a==='fit'){view.set(Math.min((sc.clientHeight-24)/view.height,(sc.clientWidth-20)/view.width));sc.scrollTop=0;}else if(a==='current'){view.set(1);var target=$('.map-node.reach',sc)||$('.map-node.current',sc);if(target)sc.scrollTop=target.offsetTop-sc.clientHeight*.55;}else{var old=S.mapZoom,ratio=sc.scrollTop/Math.max(1,view.height*old);view.set(old+(a==='plus'?.15:-.15));sc.scrollTop=ratio*view.height*S.mapZoom;}};
  var target = el.querySelector('.map-node.reach') || el.querySelector('.map-marker');
  requestAnimationFrame(function () { if (target) sc.scrollTop = target.offsetTop + 20 - sc.clientHeight * 0.62; });
  var moving = false;
  el.addEventListener('click', function (e) {
    var b = e.target.closest('.map-node.reach'); if (!b || moving) return;
    moving = true; SFX.play('step');
    var mk = el.querySelector('.map-marker');
    if (mk) { mk.style.left = b.style.left; mk.style.top = b.style.top; }
    b.classList.remove('reach');
    setTimeout(function () { fadeTo(function () { return enterNode(b.dataset.node); }); }, mk ? 520 : 120);
  });
  window.onresize = function () { if (S.screen === 'map') { var st = sc.scrollTop; sc.innerHTML = mapHTML(true); view=wrapRouteMap(sc,S.mapZoom||1); sc.scrollTop = st; } };
}
function showMapPeek() {
  var m = modal({ title: '地図', body: '<div class="map-scroll" style="max-height:72vh;overflow:auto">' + mapHTML(false) + '</div>' });
  var sc = m.el.querySelector('.map-scroll'); var mk = m.el.querySelector('.map-marker');
  requestAnimationFrame(function () { if (mk) sc.scrollTop = mk.offsetTop - sc.clientHeight / 2; });
}

/* ---------- combat room ---------- */
async function combatRoom(room) {
  var g = S.game, run = S.run;
  var spec = room.fightSpec || g.combatSpec(room);
  var c = g.newCombat(spec);
  S.combat = c;
  SFX.music(spec.kind === 'boss' ? 'boss' : 'combat');
  CUI.build(c);
  var result = await c.start();
  if (c.aborted || S.combat !== c) return;
  S.input = false;
  await wait(250);
  if (result === 'defeat') { SFX.play('defeat'); await wait(900); S.combat = null; return defeatScreen(); }
  if (spec.kind === 'elite') run.stats.elites++;
  if (spec.kind === 'boss') { SFX.play('victory'); await CUI.victoryFx(); S.combat = null; return victoryScreen(); }
  SFX.play('victory');
  await CUI.victoryFx(result === 'fled');
  var rewards = g.combatRewards(spec, c).map(function (r) { r.taken = false; return r; });
  S.combat = null;
  run.room = { type: 'rewards', rewards: rewards, fled: result === 'fled', nodeId: room.nodeId };
  g.save();
  return rewardScreen(run.room);
}
function rewardScreen(room) {
  var g = S.game, run = S.run, X = g.api();
  SFX.music('map');
  var el = h('<div class="screen reward-screen">' + topbarHTML() + '<div class="room reward-room"><div class="reward-kicker">BATTLE REWARDS</div><div class="victory-word">' + (room.fled ? '退散' : '勝利') + '</div><p class="room-sub">' + (room.fled ? '敵は逃げ去った。' : '戦利品を手に入れた。') + '</p><div class="reward-treasure"><img src="img/reward-chest.webp" alt="戦利品の宝箱"></div><div class="reward-list"></div><div style="height:16px"></div><button class="btn primary" data-a="next" style="min-width:220px">先へ進む</button></div></div>');
  show(el, 'reward');
  var list = el.querySelector('.reward-list'), busy = false;
  function label(r) {
    if (r.type === 'gold') return ['<span class="ri">' + SVG.coin + '</span>', '金貨 ' + r.n + '枚'];
    if (r.type === 'card') return ['<span class="ri">' + SVG.deck + '</span>', r.up ? 'カード報酬（強化済み）' : 'カード報酬'];
    if (r.type === 'potion') return ['<span class="ri">' + ART.potionEmpty() + '</span>', '秘薬'];
    if (r.type === 'relic') return ['<span class="ri">' + ART.glyphSvg('crown', '#f2cc5a', '#5a3a10') + '</span>', '秘宝'];
    if (r.type === 'rare') return ['<span class="ri">' + ART.glyphSvg('star', '#ffd04a', '#5a3a10') + '</span>', 'レア報酬'];
    return ['', r.type];
  }
  function render() {
    list.innerHTML = '';
    room.rewards.forEach(function (r, i) {
      var L = label(r);
      var desc={gold:'冒険で使える金貨',card:'候補3枚から1枚を選ぶ · スキップも可能',potion:'使い切りのアイテムを受け取る',relic:'冒険中ずっと役立つ秘宝',rare:'強力なカードを選ぶ'}[r.type]||'';
      var b=h('<button class="reward-item reward-'+r.type+(r.taken?' taken':'')+'">'+L[0]+'<span class="reward-caption"><b>'+L[1]+'</b><small>'+desc+'</small></span><i class="reward-action">'+(r.taken?'✓ 受取済み':'受け取る ›')+'</i></button>');
      b.onclick = async function () {
        if (busy || r.taken) return; busy = true;
        if (r.type === 'gold') { SFX.play('coin'); var c = FX.center(b); var gp = FX.center(document.getElementById('tbGold')); for (var k = 0; k < Math.min(10, r.n * 3); k++) FX.burst(c.x, c.y, { n: 1, colors: ['#ffd84a'], shape: 'coin', speed: [80, 200], angle: Math.atan2(gp.y - c.y, gp.x - c.x), spread: 0.5, g: 0, life: [0.4, 0.7], size: [4, 6], add: false }); }
        await X.reward(r);
        r.taken = true; g.save(); refreshTop(); render(); busy = false;
      };
      list.appendChild(b);
    });
  }
  render();
  return new Promise(function (res) {
    el.querySelector('[data-a="next"]').onclick = async function () {
      if (busy) return;
      SFX.play('click');
      if (room.rewards.some(function (r) { return !r.taken; }) && !(await confirmBox('先へ進む', '受け取っていない報酬があります。先へ進みますか？', '進む'))) return;
      res(); afterRoom();
    };
  });
}

/* ---------- event ---------- */
function eventRoom(room) {
  var g = S.game, run = S.run, ev = G.EVENTS[room.eventId];
  if (room.done) return afterRoom();
  SFX.music('map');
  var el = h('<div class="screen">' + topbarHTML() + '<div class="room"><div class="room-title">' + esc(ev.name) + '</div><div class="event-art">' + ART.eventScene(ev) + '</div><div class="event-text">' + esc(ev.text) + '</div><div class="event-opts"></div></div></div>');
  show(el, 'event');
  var opts = el.querySelector('.event-opts'), busy = false;
  ev.options.forEach(function (op) {
    var ok = op.req ? op.req(g) : true;
    var b = h('<button class="event-opt"' + (ok === true ? '' : ' disabled') + '><b>［' + esc(op.label) + '］</b><small>' + esc(op.desc) + (ok === true ? '' : '　<span class="why">（' + esc(ok) + '）</span>') + '</small></button>');
    b.onclick = async function () {
      if (busy) return; busy = true; SFX.play('click');
      $$('.event-opt', opts).forEach(function (x) { x.disabled = true; });
      var X = g.api();
      var r = await op.run(X);
      room.done = true;
      refreshTop(); g.save();
      if (r && r.fight) {
        var E = G.ENCOUNTERS[r.fight];
        var t = el.querySelector('.event-text'); t.textContent = X.log.join(' ');
        await wait(900);
        var fr = { type: 'combat', kind: 'event', encId: r.fight, nodeId: room.nodeId, fightSpec: { kind: 'event', encId: r.fight, enemies: [E.enemy].concat(E.summons || []), rewards: E.rewards } };
        run.room = fr; g.save();
        fadeTo(function () { return combatRoom(fr); });
        return;
      }
      el.querySelector('.event-text').textContent = X.log.join(' ') || '……';
      opts.innerHTML = '';
      var nb = h('<button class="btn primary" style="min-width:220px">先へ進む</button>');
      nb.onclick = function () { SFX.play('click'); afterRoom(); };
      opts.appendChild(nb);
      if (run.hp <= 0) { await wait(600); defeatScreen(); }
    };
    opts.appendChild(b);
  });
}
/* ---------- rest ---------- */
function restRoom(room) {
  var g = S.game, run = S.run;
  SFX.music('rest');
  var canRest = g.canRest();
  var el = h('<div class="screen">' + topbarHTML() + '<div class="room"><div class="room-title">焚き火</div><p class="room-sub">揺れる炎が、張りつめた体をほどいていく。</p><div class="fire-wrap">' + ART.campfire() + '</div>' +
    '<div class="rest-opts"><button class="rest-opt" data-a="rest"' + (canRest ? '' : ' disabled') + '>' + ART.glyphSvg('heart', '#ff8a7a', '#5a0a06') + '<b>休む</b><small>HPを' + (3 + (g.hasRelic('r_boot') ? 1 : 0)) + '回復</small></button>' +
    '<button class="rest-opt" data-a="smith">' + ART.glyphSvg('anvil', '#d8d0c0', '#2a2010') + '<b>鍛える</b><small>カード1枚を強化</small></button></div></div></div>');
  show(el, 'rest');
  var fw = el.querySelector('.fire-wrap');
  var emb = setInterval(function () { if (S.screen !== 'rest') { clearInterval(emb); return; } var c = FX.center(fw, 0.55); FX.burst(c.x + (Math.random() - 0.5) * 40, c.y, { n: 1, colors: ['#ffb35c', '#ff7a2a', '#ffe08a'], shape: 'dot', speed: [30, 80], angle: -Math.PI / 2, spread: 0.4, g: -30, life: [0.8, 1.6], size: [1.2, 2.6], glow: true, drag: 0.5 }); }, 90);
  var busy = false;
  el.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-a]'); if (!b || busy) return; busy = true; SFX.play('click');
    if (b.dataset.a === 'rest') {
      var d = g.rest(); SFX.play('heal'); refreshTop(); toast('HPが' + d + '回復した'); var c = FX.center(fw); FX.burst(c.x, c.y, { n: 24, colors: ['#9effa0', '#e8ffd0'], shape: 'star', g: -60, speed: [40, 140], life: [0.6, 1.2] });
      await wait(700); afterRoom(); return;
    }
    var X = g.api();
    var n = await X.upgrade(1);
    if (n) { SFX.play('relic'); toast('カードを強化した'); await wait(500); afterRoom(); } else busy = false;
  });
}
/* ---------- treasure ---------- */
function treasureRoom(room) {
  var g = S.game;
  SFX.music('map');
  var el = h('<div class="screen">' + topbarHTML() + '<div class="room"><div class="room-title">宝箱</div><p class="room-sub">古い宝箱が置かれている。触れると、錠が音もなく外れた。</p><div class="chest-wrap">' + ART.chest(false) + '</div><button class="btn primary" data-a="open" style="min-width:200px">開ける</button></div></div>');
  show(el, 'treasure');
  var opened = false;
  async function open() {
    if (opened) return; opened = true;
    var svg = el.querySelector('.chest-svg'); svg.classList.add('open'); SFX.play('open');
    var c = FX.center(el.querySelector('.chest-wrap'), 0.45);
    FX.burst(c.x, c.y, { n: 40, colors: ['#fff3c0', '#ffd27a', '#ffb347'], shape: 'star', speed: [80, 300], g: 80, life: [0.6, 1.3], size: [2, 5] });
    await wait(700);
    var btn = el.querySelector('[data-a]'); btn.disabled = true;
    if (room.relic) { var ok = await relicReveal(room.relic, '宝箱の中身'); if (ok) g.gainRelic(room.relic); else g.returnRelic(room.relic); room.relic = null; refreshTop(); g.save(); }
    btn.textContent = '先へ進む'; btn.disabled = false; btn.onclick = function () { SFX.play('click'); afterRoom(); };
  }
  el.querySelector('.chest-wrap').onclick = open;
  el.querySelector('[data-a]').onclick = open;
}
/* ---------- shop ---------- */
function shopRoom(room) {
  var g = S.game, run = S.run, shop = room.shop;
  SFX.music('rest');
  var el = h('<div class="screen">' + topbarHTML() + '<div class="room"><div class="shop-head">' + ART.merchant() + '<div class="say">「おや、生きてここまで来たか。札も、秘宝も、薬も揃ってるよ。金貨さえあればね」</div></div>' +
    '<div class="shop-sec"><h3>カード</h3><div class="shop-cards"></div></div>' +
    '<div class="shop-sec"><h3>秘宝</h3><div class="shop-items relics"></div></div>' +
    '<div class="shop-sec"><h3>秘薬</h3><div class="shop-items potions"></div></div>' +
    '<div class="shop-sec"><h3>サービス</h3><div class="shop-items service"></div></div>' +
    '<div style="height:14px"></div><button class="btn primary" data-a="leave" style="min-width:220px">店を出る</button></div></div>');
  show(el, 'shop');
  function poor(p) { return run.gold < p; }
  function render() {
    refreshTop();
    var cs = el.querySelector('.shop-cards'); cs.innerHTML = '';
    shop.cards.forEach(function (it, i) {
      var ce = cardEl({ id: it.id }, { cls: (it.sold ? 'sold' : '') + (poor(it.price) ? ' poor' : ''), tag: '<span class="tag">' + it.price + ' 金</span>' });
      ce.onclick = function () { buy('card', i); };
      bindLongPress(ce, function () { inspectCard({ id: it.id }); });
      cs.appendChild(ce);
    });
    var rs = el.querySelector('.relics'); rs.innerHTML = '';
    shop.relics.forEach(function (it, i) {
      var b = h('<button class="shop-item' + (it.sold ? ' sold' : '') + (poor(it.price) ? ' poor' : '') + '">' + (it.sale ? '<span class="sale">特価</span>' : '') + ART.relic(it.id) + '<span class="nm">' + esc(G.RELICS[it.id].name) + '</span><span class="pr">' + it.price + ' 金</span></button>');
      b.onclick = function () { buy('relic', i, b); };
      rs.appendChild(b);
    });
    var ps = el.querySelector('.potions'); ps.innerHTML = '';
    shop.potions.forEach(function (it, i) {
      var b = h('<button class="shop-item' + (it.sold ? ' sold' : '') + (poor(it.price) ? ' poor' : '') + '">' + ART.potion(it.id) + '<span class="nm">' + esc(G.POTIONS[it.id].name) + '</span><span class="pr">' + it.price + ' 金</span></button>');
      b.onclick = function () { buy('potion', i, b); };
      ps.appendChild(b);
    });
    var sv = el.querySelector('.service'); sv.innerHTML = '';
    var rb = h('<button class="shop-item' + (shop.removed ? ' sold' : '') + (poor(shop.removeCost) ? ' poor' : '') + '" style="width:110px">' + ART.glyphSvg('flame', '#ff8a5a', '#5a1a0a') + '<span class="nm">カード除去<br>（1回のみ）</span><span class="pr">' + shop.removeCost + ' 金</span></button>');
    rb.onclick = function () { buy('remove'); };
    sv.appendChild(rb);
  }
  var busy = false;
  async function buy(kind, i, anchor) {
    if (busy) return;
    var it = kind === 'card' ? shop.cards[i] : kind === 'relic' ? shop.relics[i] : kind === 'potion' ? shop.potions[i] : null;
    var price = it ? it.price : shop.removeCost;
    if ((it && it.sold) || (kind === 'remove' && shop.removed)) return;
    if (run.gold < price) { SFX.play('error'); toast('金貨が足りない'); return; }
    busy = true;
    if (kind === 'card') {
      if (await confirmBox('カードを買う', '「' + esc(G.CARDS[it.id].name) + '」を' + price + '金で買いますか？', '買う')) { run.gold -= price; it.sold = true; g.addCard(it.id); SFX.play('coin'); }
    } else if (kind === 'relic') {
      var r = G.RELICS[it.id];
      if (await confirmBox(r.name, esc(r.text) + '<br><br>' + price + '金で買いますか？', '買う')) { run.gold -= price; it.sold = true; g.gainRelic(it.id); SFX.play('relic'); }
    } else if (kind === 'potion') {
      var P = G.POTIONS[it.id];
      if (run.potions.length >= g.potionCap()) { toast('秘薬がいっぱいです'); }
      else if (await confirmBox(P.name, esc(P.text) + '<br><br>' + price + '金で買いますか？', '買う')) { run.gold -= price; it.sold = true; run.potions.push(it.id); SFX.play('coin'); }
    } else if (kind === 'remove') {
      var X = g.api();
      var n = await X.remove(1);
      if (n) { run.gold -= price; shop.removed = true; SFX.play('burn'); }
    }
    g.save(); render(); busy = false;
  }
  render();
  el.querySelector('[data-a="leave"]').onclick = function () { if (busy) return; SFX.play('click'); g.closeShop(shop); afterRoom(); };
}

/* ---------- end screens ---------- */
function statsHTML() {
  var s = S.run.stats, mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  return '<div class="stats"><span>到達した階</span><b>' + s.floors + '</b><span>倒した敵</span><b>' + s.kills + '</b><span>強敵の撃破</span><b>' + s.elites + '</b><span>与えたダメージ</span><b>' + s.dmgDealt + '</b><span>受けたダメージ</span><b>' + s.dmgTaken + '</b><span>使ったカード</span><b>' + s.cardsPlayed + '</b><span>手に入れた金貨</span><b>' + s.goldEarned + '</b><span>プレイ時間</span><b>' + mins + '分</b></div>';
}
function victoryScreen() {
  SFX.music('title');
  Game.clear();
  var H = G.HEROES[S.run.hero];
  var el = h('<div class="screen end-screen"><div class="room"><div class="victory-word" style="font-size:clamp(2rem,10vw,3.4rem)">第一層 踏破</div><p class="room-sub">' + esc(G.ENEMIES[G.ENCOUNTERS[S.run.boss].enemy].name) + 'を討ち、' + H.name + 'は序章を抜けた。<br>塔の上層──鐘楼の都が、霧の向こうに見えている。</p><div class="hero-art" style="width:140px;margin:0 auto 6px">' + ART.hero(S.run.hero) + '</div>' + statsHTML() +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn ghost" data-a="deck">最終デッキ</button><button class="btn primary" data-a="again">もう一度挑む</button><button class="btn ghost" data-a="title">タイトルへ</button></div><p class="room-sub" style="margin-top:14px">第二層は今後追加予定です。</p></div></div>');
  show(el, 'victory');
  var c = { x: window.innerWidth / 2, y: window.innerHeight * 0.25 };
  for (var i = 0; i < 4; i++) setTimeout(function () { FX.burst(c.x + (Math.random() - 0.5) * 200, c.y + Math.random() * 60, { n: 30, colors: ['#fff3c0', '#ffd27a', '#ff9a5a', '#a6ff8f'], shape: 'star', speed: [100, 320], g: 160, life: [0.8, 1.6], size: [2, 5] }); }, i * 380);
  bindEnd(el);
}
function defeatScreen() {
  SFX.music(null);
  Game.clear();
  var el = h('<div class="screen end-screen" style="background:radial-gradient(circle at 50% 30%,#2a0d0a,#060303 70%)"><div class="room"><div class="defeat-word">力尽きた……</div><p class="room-sub">茨が、静かに亡骸を覆っていく。<br>だが灯は消えていない。また挑めばいい。</p>' + statsHTML() +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn ghost" data-a="deck">最後のデッキ</button><button class="btn primary" data-a="again">もう一度挑む</button><button class="btn ghost" data-a="title">タイトルへ</button></div></div></div>');
  show(el, 'defeat');
  bindEnd(el);
}
function bindEnd(el) {
  var deck = S.run.deck.slice();
  el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return; SFX.play('click');
    if (b.dataset.a === 'deck') showDeck(deck, 'デッキ（' + deck.length + '枚）');
    if (b.dataset.a === 'again') fadeTo(heroScreen);
    if (b.dataset.a === 'title') fadeTo(titleScreen);
  });
}

/* ---------- deck / menus ---------- */
function showDeck(cards, title, opts) {
  var list = cards.slice().sort(deckSort);
  var body = h('<div class="grid-cards"></div>');
  list.forEach(function (c) { var el = cardEl(c, opts && opts.combat ? { combat: opts.combat } : {}); el.onclick = function () { SFX.play('card'); inspectCard(c, opts); }; body.appendChild(el); });
  if (!list.length) body.innerHTML = '<p class="room-sub">カードはありません。</p>';
  modal({ title: title, body: body });
}
function showMenu() {
  var body = h('<div class="opt-list"><button class="event-opt" data-glossary><b>用語・特殊効果</b><small>怯み・隙・毒などを例つきで確認</small></button><button class="event-opt" data-a="rules"><b>遊び方</b><small>ルールと用語の説明</small></button><button class="event-opt" data-a="settings"><b>設定</b><small>音・演出の速さ</small></button><button class="event-opt" data-a="abandon"><b>冒険をあきらめる</b><small>記録を消してタイトルに戻る</small></button><button class="event-opt" data-a="title"><b>タイトルに戻る</b><small>' + (S.combat ? '戦闘は最初からやり直しになります' : '記録は保存されています') + '</small></button></div>');
  var m = modal({ title: 'メニュー', body: body });
  body.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return; SFX.play('click');
    var a = b.dataset.a;
    if (a === 'rules') { m.close(); showRules(); }
    if (a === 'settings') { m.close(); showSettings(); }
    if (a === 'abandon' && S.tutorial) { m.close(); leaveRun(); return; }
    if (a === 'abandon') { if (await confirmBox('冒険をあきらめる', 'この冒険の記録は消えます。', 'あきらめる')) { m.close(); Game.clear(); leaveRun(); } }
    if (a === 'title') { m.close(); if (S.game && !S.combat) S.game.save(); leaveRun(); }
  });
}
function leaveRun() {
  if (S.combat) S.combat.abort();
  S.combat = null; S.input = false; S.acting = false;
  modalRoot.innerHTML = ''; closeTip();
  $$('.limbo,.die3d-wrap,.die-result').forEach(function (x) { x.remove(); });
  fadeTo(titleScreen);
}
function showSettings() {
  var body = h('<div><div class="set-row"><span>効果音</span><div class="seg" data-k="sfx"><button data-v="1">あり</button><button data-v="0">なし</button></div></div>' +
    '<div class="set-row"><span>音楽</span><div class="seg" data-k="music"><button data-v="1">あり</button><button data-v="0">なし</button></div></div>' +
    '<div class="set-row"><span>BGM</span><div class="seg" data-k="bgmMode"><button data-v="gemini">Gemini製</button><button data-v="original">これまでの曲</button></div></div>' +
    '<label class="set-row"><span>Gemini音量 <output data-bgm-volume></output></span><input type="range" min="0" max="1" step="0.01" data-bgm-slider aria-label="Gemini BGMの音量"></label>' +
    '<p class="sub" data-bgm-now role="status"></p><p class="sub">探索・通常戦闘・ボス戦で専用曲に自動で切り替わります。<a href="../music-studio/" target="_blank" rel="noopener">音楽アプリで3曲を試聴・保存</a></p>' +
    '<div class="set-row"><span>演出の速さ</span><div class="seg" data-k="speed"><button data-v="1">ふつう</button><button data-v="1.8">はやい</button></div></div></div>');
  function render() {
    $$('.seg', body).forEach(function (s) { var k = s.dataset.k; $$('button', s).forEach(function (b) { var v = k === 'bgmMode' ? b.dataset.v : k === 'speed' ? +b.dataset.v : b.dataset.v === '1'; b.classList.toggle('on', S.set[k] === v); }); });
    $('[data-bgm-slider]', body).value = S.set.bgmVolume;
    $('[data-bgm-volume]', body).value = Math.round(S.set.bgmVolume * 100) + '%';
    var info = SFX.bgmInfo(); $('[data-bgm-now]', body).textContent = (S.set.music ? info.title : 'BGMなし') + (info.fallback ? '（音源を読み込めないため元の曲で再生）' : '');
  }
  body.addEventListener('click', function (e) {
    var b = e.target.closest('.seg button'); if (!b) return;
    var k = b.parentNode.dataset.k; S.set[k] = k === 'bgmMode' ? b.dataset.v : k === 'speed' ? +b.dataset.v : b.dataset.v === '1';
    saveSet(); SFX.unlock(); SFX.play('click'); render();
  });
  $('[data-bgm-slider]', body).oninput = function (e) { S.set.bgmVolume = +e.target.value; saveSet(); SFX.unlock(); render(); };
  render();
  body.appendChild(h('<div class="save-location"><b>セーブの保存先</b><p>1人用の記録は、この端末・このブラウザに自動保存されます。他の端末とは同期されません。戦闘の途中で閉じた場合、再開はその戦闘の開始時からです。</p><small>オンライン協力はタイトルの「オンライン協力」から参加できます。協力記録は1人用とは別に保存され、部屋に入る前から再開できます。</small></div>'));
  modal({ title: '設定', body: body });
}
function showRules() {
  var body = '<div class="rules"><button class="btn primary small" data-glossary>用語・特殊効果を検索</button>' +
    '<h4>目的</h4><p>スレイザスパイアの第一層「序章」を登り、最上部で待つ<b>層の主</b>を倒せば踏破です。HPが0になると冒険は終わり、最初からやり直しになります。</p>' +
    '<h4>地図</h4><p>道に沿って下から1部屋ずつ進みます。部屋の種類は冒険ごとに変わります。</p><ul><li>戦闘：敵を倒すとカード報酬と金貨。</li><li>強敵：手強いが、秘宝と強化済みのカード報酬が手に入る。</li><li>異聞：不思議な出来事。選択肢を選ぶ。</li><li>焚き火：HPを3回復するか、カードを1枚強化する。</li><li>行商人：金貨でカード・秘宝・秘薬を買える。カード除去も1回できる。</li><li>宝箱：秘宝が1つ手に入る。</li></ul>' +
    '<h4>ラウンドの流れ</h4><ul><li>あなたのターン開始：エナジーが3に戻り、盾が消え、カードを5枚引く。</li><li><b>サイコロを振る</b>：出目で一部の敵の行動と、秘宝の能力が決まる。このラウンドはずっと同じ出目。</li><li>カードを使う：左上の数字がコスト。エナジーの範囲で好きな順に使える。</li><li>ターン終了：毒や核などの効果を好きな順で処理。保持などの例外を除き、手札を捨てます。</li><li>敵のターン：敵の盾が消え、表示された行動を順に行う。</li></ul>' +
    '<h4>敵の行動</h4><p>敵の頭上の印が次の行動です。敵をタップすると行動の一覧を見られます。</p><ul><li>サイコロ型：出目によって行動が変わる（印の横に小さなサイコロ）。</li><li>順番型：決まった順番で行動し、最後まで行くと繰り返す。</li><li>固定型：毎ターン同じ行動。</li></ul>' +
    '<h4>カードの操作</h4><ul><li>タップで選び、もう一度タップ（攻撃は敵をタップ）で使う。上や敵に向かってドラッグしても使える。</li><li>長押しで大きく表示し、用語の説明を見られる。</li></ul>' +
    '<h4>状態</h4><ul>' + ['盾', '闘気', '怯み', '隙', '毒'].map(function (k) { return '<li><b>' + k + '</b>：' + esc(G.KEYWORDS[k]) + '</li>'; }).join('') + '<li>怯みのある攻撃が、隙のある相手に当たると、どちらの効果も起きない（両方1つずつ減る）。</li></ul>' +
    '<h4>カードの用語</h4><ul>' + ['消滅', '泡沫', '保持', '先手', '使用不可', '占い', 'X'].map(function (k) { return '<li><b>' + k + '</b>：' + esc(G.KEYWORDS[k]) + '</li>'; }).join('') + '</ul>' +
    '<h4>主人公の仕組み</h4><ul><li><b>投げ針</b>（サイレント）：' + esc(G.KEYWORDS['投げ針']) + '</li><li><b>核</b>（ディフェクト）：雷核・氷核・冥核を枠に宿す。' + esc(G.KEYWORDS['宿す']) + '</li><li><b>構え</b>（ウォッチャー）：' + esc(G.KEYWORDS['凪の構え']) + '／' + esc(G.KEYWORDS['烈の構え']) + '</li><li><b>祈り</b>：' + esc(G.KEYWORDS['祈り']) + '</li></ul>' +
    '<h4>報酬とデッキ</h4><p>カード報酬では山から3枚めくって1枚を選ぶか、スキップします。「金の札」がめくれると、レアカードが候補に加わります。強化したカードは数字が緑色になります。</p>' +
    '<h4>一人用の特別ルール</h4><p>最初に金貨2枚と秘宝「導きの賽」を受け取ります。出目6のとき、カードを1枚引くか、他の秘宝の出目能力を発動できます。</p>' +
    '<p style="color:#9a8a70;margin-top:16px">協力型デッキ構築ボードゲームのルールを一人用に再現した作品です。原作のキャラクター・カード・敵の画像を使用した非公式ファン版です。公式ルールへの改修中です。第1幕のカード・敵・イベントには独自の内容が残っており、完全一致には達していません。</p></div>';
  modal({ title: '遊び方', body: body });
}

/* ============================ combat UI ============================ */
var CUI = {};
var R = {};
var cardEls = {}, enemyEls = {}, limbo = {};
CUI.build = function (c) {
  cardEls = {}; enemyEls = {}; limbo = {}; S.effectLog = [];
  S.sel = null; S.armed = null; S.acting = false; S.input = false;
  var kind = c.spec.kind;
  var el = h('<div class="screen combat-screen h-' + c.hero.id + '">' + topbarHTML() +
    '<div class="bf ' + (kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : '') + '"><div class="bf-bg"></div><div class="battle-light"></div><div class="battle-summary"></div><div class="battle-tools"><button class="battle-help" data-glossary>？ 用語・効果</button></div><div class="effect-note"></div><div class="bf-roots">' + rootsSvg() + '</div><div class="bf-fog"></div>' +
    '<div class="die-slot" data-tip-anchor><div class="die-face"></div><span class="lbl">出目</span><span class="round"></span></div>' +
    '<div class="enemies"></div>' +
    '<div class="hero-wrap"><div class="hero-aura"></div><div class="hero-art">' + ART.hero(c.hero.id) + '</div><div class="orbs"></div><div class="hero-plate"><div class="hpwrap"><div class="blockbadge"><svg viewBox="0 0 64 64">' + '<path d="M32 4 L56 12 Q56 42 32 60 Q8 42 8 12 Z" fill="#3f7fb0" stroke="#dff2ff" stroke-width="3"/></svg><b>0</b></div><div class="hpbar"><div class="ghost"></div><div class="fill"></div><span class="txt"></span></div></div><div class="statuses"></div></div></div>' +
    '<div class="powers-row"></div><div class="turn-banner"><span></span></div></div>' +
    '<div class="hud"><div class="hud-bar"><div class="energy" data-tip-anchor><span>3</span><small>/3</small></div>' +
    '<button class="pile draw" data-pile="draw" aria-label="山札">' + SVG.pileDraw + '<span>0</span></button>' +
    '<button class="pile exhaust" data-pile="exhaust" aria-label="消滅したカード">' + SVG.pileEx + '<span>0</span></button><div class="sp"></div>' +
    '<button class="pile discard" data-pile="discard" aria-label="捨て札">' + SVG.pileDisc + '<span>0</span></button><button class="end-turn" disabled>ターン終了</button></div>' +
    '<div class="hud-tok"><button class="tok shiv hidden" data-tok="shiv" aria-label="投げ針">' + SVG.shiv + '<span>0</span><i class="tl">投げ針</i></button><button class="tok miracle hidden" data-tok="miracle" aria-label="祈り">' + SVG.miracle + '<span>0</span><i class="tl">祈り</i></button></div>' +
    '<div class="hint"></div><div class="hand"></div></div>' +
    '<svg class="target-arrow"><defs><marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#ffd27a"/></marker></defs><path class="ta" d="" fill="none" stroke="#ffd27a" stroke-width="5" stroke-dasharray="10 7" marker-end="url(#ah)" opacity="0"/></svg>' +
    '<div class="vignette"></div></div>');
  show(el, 'combat');
  R = { root: el, bf: $('.bf', el), enemies: $('.enemies', el), hero: $('.hero-wrap', el), heroArt: $('.hero-art', el), orbs: $('.orbs', el), hand: $('.hand', el), energy: $('.energy', el), end: $('.end-turn', el),
    draw: $('.pile.draw', el), discard: $('.pile.discard', el), exhaust: $('.pile.exhaust', el), die: $('.die-slot', el), banner: $('.turn-banner', el), powers: $('.powers-row', el), hint: $('.hint', el),
    shiv: $('.tok.shiv', el), miracle: $('.tok.miracle', el), arrow: $('.target-arrow .ta', el), vig: $('.vignette', el) };
  R.summary=$('.battle-summary',el); R.effectNote=$('.effect-note',el);
  c.enemies.forEach(function (e) { addEnemyEl(e, false); });
  bindCombatInput(c);
  CUI.sync();
};
function rootsSvg() {
  return '<svg viewBox="0 0 400 300" preserveAspectRatio="none"><g fill="none" stroke="#070505" stroke-linecap="round">' +
    '<path d="M-10 20 C40 40 60 10 110 30 C150 46 170 20 210 26" stroke-width="10"/><path d="M60 0 C70 30 50 60 70 90" stroke-width="6"/><path d="M410 30 C360 50 340 20 300 40 C270 56 250 40 230 50" stroke-width="12"/><path d="M340 0 C330 40 360 70 340 110" stroke-width="7"/>' +
    '<path d="M-10 180 C20 170 30 200 10 230" stroke-width="8"/><path d="M410 160 C380 170 390 210 404 240" stroke-width="9"/></g>' +
    '<g fill="#070505"><path d="M106 30 l6 -8 l2 9 z M300 40 l-4 -9 l-3 9 z M66 60 l8 2 l-6 5 z M346 80 l-8 0 l5 6 z"/></g>' +
    '<g fill="#ffb35c" opacity=".55"><circle cx="30" cy="120" r="2"/><circle cx="372" cy="104" r="2.4"/></g></svg>';
}
function addEnemyEl(e, anim) {
  var d = G.ENEMIES[e.id];
  var el = h('<div class="enemy' + (d.elite ? ' elite' : '') + (e.isBoss ? ' boss' : '') + '" data-uid="' + e.uid + '"><div class="intent"></div><div class="en-art">' + ART.enemy(d.art || e.id) + '</div>' +
    '<div class="en-plate"><div class="enemy-rank">'+(e.isBoss?'BOSS':d.elite?'ELITE':'ENEMY')+'</div><div class="en-name">' + esc(e.name) + '<button class="enemy-info" data-enemy-info="'+e.uid+'" aria-label="'+esc(e.name)+'の詳細">ⓘ</button></div><div class="hpwrap"><div class="blockbadge"><svg viewBox="0 0 64 64"><path d="M32 4 L56 12 Q56 42 32 60 Q8 42 8 12 Z" fill="#3f7fb0" stroke="#dff2ff" stroke-width="3"/></svg><b>0</b></div><div class="hpbar"><div class="ghost"></div><div class="fill"></div><span class="txt"></span></div></div><div class="statuses"></div><div class="badge-ctr"></div></div></div>');
  var list = R.enemies;
  var idx = S.combat.enemies.indexOf(e), next = null;
  for (var i = idx + 1; i < S.combat.enemies.length; i++) { if (enemyEls[S.combat.enemies[i].uid]) { next = enemyEls[S.combat.enemies[i].uid]; break; } }
  list.insertBefore(el, next);
  enemyEls[e.uid] = el;
  if (anim) el.animate([{ transform: 'scale(.3) translateY(30px)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'ease-out' });
  return el;
}
function enemyIntentHTML(c, e) {
  var d = G.ENEMIES[e.id];
  var p = c.patternOf(e);
  var dieBased = !!(p && p.die) && !e.st.sleep && !e.st.stun;
  if (dieBased && !c.die) return ART.icon('unknown');
  var act = c.actionOf(e), atk = null, kinds = [];
  act.fx.forEach(function (op) {
    var k = op[0];
    if (k === 'atk') atk = op;
    else if (k === 'block' || k === 'blockAlly' || k === 'blockAll') kinds.push('block');
    else if (k === 'str' || k === 'strAll') kinds.push('buff');
    else if (k === 'weak' || k === 'vuln') kinds.push('debuff');
    else if (k === 'status') kinds.push('status');
    else if (k === 'summon') kinds.push('summon');
    else if (k === 'flee') kinds.push('flee');
    else if (k === 'fn' || k === 'mode') { }
  });
  kinds = uniq(kinds);
  var s = '';
  if (atk) { var per = c.previewEnemyHit(e, atk[1]); s += ART.icon('attack') + '<span class="num atk">' + per + ((atk[2] || 1) > 1 ? '×' + atk[2] : '') + '</span>'; }
  kinds.slice(0, atk ? 1 : 2).forEach(function (k) { s += ART.icon(k); });
  if (!atk && !kinds.length) s += ART.icon(act.icon || 'special');
  if (dieBased) s += '<svg class="dd" viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="18" fill="#efe3c2"/><circle cx="32" cy="32" r="9" fill="#2a1a10"/><circle cx="68" cy="68" r="9" fill="#2a1a10"/><circle cx="50" cy="50" r="9" fill="#2a1a10"/></svg>';
  return '<span class="intent-symbols">'+s+'</span><span class="intent-caption">'+esc(act.name)+' · '+esc(actText(act))+'</span>';
}
function statusIcons(t, isHero) {
  var out = [];
  function add(k,n,tip){out.push('<button class="st" data-st="'+k+'" data-term="'+esc(tip)+'" data-owner="'+(isHero?'hero':t.uid)+'" aria-label="'+esc(tip)+(n!=null?' '+n:'')+'の説明">'+ART.status(k)+'<span class="st-label">'+esc(tip)+'</span>'+(n!=null?'<b>'+n+'</b>':'')+'</button>');}
  if (t.str) add('str', t.str, '闘気');
  if (t.weak) add('weak', t.weak, '怯み');
  if (t.vuln) add('vuln', t.vuln, '隙');
  if (!isHero) {
    if (t.poison) add('poison', t.poison, '毒');
    if (t.st.thorns) add('thorns', t.st.thorns, '棘');
    if (t.st.sleep) add('sleep', null, '眠り');
    if (t.st.stun) add('stun', null, 'ふらつき');
  } else {
    if (t.plated) add('plated', t.plated, '鉄皮');
    if (t.retaliate) add('retaliate', t.retaliate, '炎の壁');
    if (t.keepBlock) add('keep', null, '霧隠れ');
    var nx = t.next; if (nx && (nx.block || nx.energy || nx.draw || nx.miracle)) add('next', null, '次のターン');
  }
  return out.join('');
}
CUI.sync = function () {
  var c = S.combat; if (!c || !R.root || !R.root.isConnected) return;
  var hh = c.hero;
  refreshTop();
  // hero
  setHp(R.hero, hh.hp, hh.maxHp, hh.block, false);
  R.root.classList.toggle('lowhp', hh.hp > 0 && hh.hp <= Math.max(2, Math.floor(hh.maxHp * 0.3)));
  var hs = statusIcons(hh, true), hst = $('.statuses', R.hero);
  if (hst.dataset.sig !== hs) { hst.innerHTML = hs; hst.dataset.sig = hs; }
  R.hero.classList.remove('st-none', 'st-calm', 'st-wrath', 'st-divine'); R.hero.classList.add('st-' + hh.stance);
  // orbs
  if (hh.orbSlots > 0) {
    var n = hh.orbSlots, w = R.heroArt.clientWidth || 120, html = '';
    for (var i = 0; i < n; i++) {
      var a = (-140 + (n === 1 ? 50 : 100 * i / (n - 1))) * Math.PI / 180, rr = w * 0.5;
      var x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.75 + w * 0.42;
      var o = hh.orbs[i];
      html += '<div class="orb ' + (o ? 'orb-' + o : 'empty') + '" data-orb="' + i + '" style="transform:translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)">' + (o ? ART.orb(o) : '') + '</div>';
    }
    if (R.orbs.dataset.sig !== hh.orbs.join(',') + '|' + n + '|' + w) { R.orbs.innerHTML = html; R.orbs.dataset.sig = hh.orbs.join(',') + '|' + n + '|' + w; }
  }
  // powers
  var pw = Object.keys(hh.powers).filter(function (k) { return hh.powers[k]; }).map(function (k) { var P = G.POWERS[k] || { glyph: 'star', name: k }; return '<div class="pw" data-pw="' + k + '" data-tip-anchor>' + ART.glyphSvg(P.glyph || 'star', '#ffe2a0', '#3a2410', 'g') + '<b>' + (hh.powers[k] > 1 ? hh.powers[k] : '') + '</b></div>'; }).join('');
  if (R.powers.dataset.sig !== pw) { R.powers.innerHTML = pw; R.powers.dataset.sig = pw; }
  // energy
  $('span', R.energy).textContent = hh.energy; R.energy.classList.toggle('zero', hh.energy <= 0 && hh.miracle <= 0);
  // tokens
  R.shiv.classList.toggle('hidden', !(hh.shiv > 0 || c.H.id === 'huntress'));
  $('span', R.shiv).textContent = hh.shiv; R.shiv.disabled = hh.shiv <= 0;
  R.shiv.classList.toggle('armed', S.armed && S.armed.kind === 'shiv');
  R.miracle.classList.toggle('hidden', !(hh.miracle > 0 || c.H.id === 'maiden'));
  $('span', R.miracle).textContent = hh.miracle; R.miracle.disabled = hh.miracle <= 0;
  // piles
  $('span', R.draw).textContent = c.draw.length; $('span', R.discard).textContent = c.discard.length; $('span', R.exhaust).textContent = c.exhaust.length;
  R.exhaust.classList.toggle('hidden', c.exhaust.length === 0);
  // die
  var df = $('.die-face', R.die); var sig = String(c.die);
  if (df.dataset.v !== sig) { df.innerHTML = c.die ? dieFaceSvg(c.die) : ''; df.dataset.v = sig; }
  $('.round', R.die).textContent = 'R' + c.round;
  // enemies
  var alive = c.alive().length;
  R.root.classList.toggle('many-enemies',alive>=3);
  R.enemies.className = 'enemies n' + Math.min(6, alive);
  fitEnemies(alive);
  c.enemies.forEach(function (e) {
    var el = enemyEls[e.uid]; if (!el) return;
    if (!e.alive) return;
    setHp(el, e.hp, e.maxHp, e.block, e.poison > 0);
    var ih = enemyIntentHTML(c, e), it = $('.intent', el);
    if (it.dataset.sig !== ih) { it.innerHTML = ih; it.dataset.sig = ih; it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop'); }
    var sh = statusIcons(e, false), st = $('.statuses', el);
    if (st.dataset.sig !== sh) { st.innerHTML = sh; st.dataset.sig = sh; }
    var d = G.ENEMIES[e.id];
    var bc = $('.badge-ctr', el);
    if (d.badge) { var b = d.badge(e); var cs = ''; for (var i = 0; i < b.max; i++) cs += '<i class="' + (i < b.value ? 'on' : '') + '"></i>'; bc.innerHTML = cs; el.className = el.className.replace(/\bc\d\b/g, '').trim() + ' c' + b.value; }
    el.classList.toggle('asleep', !!e.st.sleep);
    el.classList.toggle('awake', !e.st.sleep);
    el.classList.toggle('mode-shell', e.mode === 'shell');
    el.classList.toggle('focus', c.focus === e.uid && alive > 1);
  });
  // hand
  var playerTurn = c.phase === 'player' && !c.over;
  Object.keys(cardEls).forEach(function (uid) {
    var el = cardEls[uid], card = c.hand.filter(function (x) { return String(x.uid) === uid; })[0];
    if (!card) return;
    var ok = playerTurn && c.canPlay(card);
    el.classList.toggle('dim', playerTurn && !ok);
    el.classList.toggle('playable', ok && S.input);
    var sigc = cardSig(c, card);
    if (el.dataset.sig !== sigc) { refreshCardEl(el, card); el.dataset.sig = sigc; }
  });
  var anyPlayable = playerTurn && c.hand.some(function (x) { return c.canPlay(x); });
  R.end.disabled = !playerTurn || !S.input;
  R.end.textContent = c.phase === 'enemy' ? '敵のターン' : 'ターン終了';
  R.end.classList.toggle('ready', playerTurn && S.input && !anyPlayable && !c.hero.shiv);
  if (S.tutorial && S.tutorial.step !== 3) R.end.disabled = true;
  polishCombatSync();
};
function fitEnemies(n) {
  var box = R.enemies; if (!box) return;
  var Hh = box.clientHeight, Ww = box.clientWidth;
  var sig = Hh + 'x' + Ww + 'x' + n;
  if (box._fit === sig) return; box._fit = sig;
  box.style.setProperty('--esmax', Math.max(48, Hh - 84) + 'px');
  box.style.setProperty('--eswmax', Math.max(48, (Ww - 4 * Math.max(0, n - 1)) / Math.max(1, n)) + 'px');
}
function cardSig(c, card) {
  var d = G.CARDS[card.id];
  return [c.costOf(card), G.card.isUp(card), c.hero.str, c.hero.weak, c.hero.stance, c.hero.block, c.hero.orbs.join(''), c.t.exhausted, c.t.discarded, c.t.attacks, c.t.stanceChanged, card.bonus || 0, card.pen || 0, c.flags.claw || 0, c.hero.powers.h_light || 0, d.dyn ? c.alive().map(function (e) { return e.poison; }).join(',') : ''].join('|');
}
function refreshCardEl(el, card) {
  var ne = cardEl(card, { combat: S.combat });
  el.className = ne.className + (el.classList.contains('dim') ? ' dim' : '') + (el.classList.contains('playable') ? ' playable' : '');
  el.innerHTML = ne.innerHTML;
}
function setHp(el, hp, mx, block, pois) {
  var bar = $('.hpbar', el); if (!bar) return;
  var pct = Math.max(0, Math.min(100, hp / mx * 100));
  $('.fill', bar).style.width = pct + '%';
  $('.ghost', bar).style.width = pct + '%';
  $('.txt', bar).textContent = Math.max(0, hp) + '/' + mx;
  bar.classList.toggle('poisoned', !!pois);
  var bb = $('.blockbadge', el);
  var was = bb.classList.contains('on');
  bb.classList.toggle('on', block > 0);
  if (block > 0) $('b', bb).textContent = block;
  if (block > 0 && !was) { bb.classList.remove('on'); void bb.offsetWidth; bb.classList.add('on'); }
}

/* ---------- hand layout ---------- */
function handList() { var c = S.combat; if (!c) return []; return c.hand.map(function (x) { return cardEls[x.uid]; }).filter(Boolean); }
CUI.layout = function () {
  var els = handList(), n = els.length; if (!n || !R.hand) return;
  var W = R.hand.clientWidth, cw = els[0].offsetWidth || 90;
  var landscape = window.innerWidth > window.innerHeight && window.innerHeight < 520;
  var rstep = Math.min(3, 15 / n), maxRot = rstep * (n - 1) / 2 * Math.PI / 180;
  var margin = 1.68 * cw * Math.sin(maxRot) + cw * 0.06;
  var step = n > 1 ? Math.min(cw * 0.92, (W - cw - 2 * margin - 8) / (n - 1)) : 0;
  els.forEach(function (el, i) {
    var off = i - (n - 1) / 2;
    var x = off * step, rot = off * rstep, y = off * off * Math.min(1.6, 6 / n) * cw / 100;
    if (el === S.sel) {
      var sc = landscape ? 1.25 : 1.32;
      var lim = W / 2 - cw * sc / 2 - 4;
      var sx = Math.max(-lim, Math.min(lim, x));
      el.style.transform = 'translate(' + sx + 'px,' + (-cw * (landscape ? 0.32 : 0.5)) + 'px) scale(' + sc + ')';
      el.style.zIndex = 60;
    } else if (el === S.hover && !S.sel) {
      el.style.transform = 'translate(' + x + 'px,' + (-cw * 0.25) + 'px) scale(1.12)';
      el.style.zIndex = 55;
    } else {
      el.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg)';
      el.style.zIndex = i + 1;
    }
  });
};
function pileXY(which) { var el = which === 'draw' ? R.draw : which === 'discard' ? R.discard : R.exhaust; var hr = R.hand.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - (hr.left + hr.width / 2), y: r.top + r.height / 2 - hr.bottom + 20 }; }

/* ---------- input ---------- */
function bindCombatInput(c) {
  var root = R.root;
  var drag = null;
  R.end.addEventListener('click', function () {
    var cc = S.combat; if (!cc || cc.phase !== 'player' || S.acting || !S.input) return;
    if (S.tutorial && S.tutorial.step !== 3) { toast('まず光っているカードを使ってみましょう'); return; }
    SFX.play('click'); deselect(); S.input = false; CUI.sync(); cc.endTurn();
  });
  R.shiv.addEventListener('click', function () {
    var cc = S.combat; if (!cc || cc.phase !== 'player' || S.acting || cc.hero.shiv <= 0) return;
    SFX.play('click');
    if (cc.alive().length === 1) { doShiv(cc.alive()[0].uid); return; }
    deselect();
    S.armed = S.armed && S.armed.kind === 'shiv' ? null : { kind: 'shiv' };
    CUI.armTargets(!!S.armed); CUI.hint(S.armed ? '投げ針を当てる敵を選ぶ' : ''); CUI.sync();
  });
  R.miracle.addEventListener('click', async function () {
    var cc = S.combat; if (!cc || cc.phase !== 'player' || S.acting || cc.hero.miracle <= 0) return;
    SFX.play('energy'); S.acting = true; await cc.useMiracle(); S.acting = false; CUI.sync();
  });
  root.addEventListener('click', function (e) {
    var p = e.target.closest('[data-pile]');
    if (p) { SFX.play('click'); var cc = S.combat; var k = p.dataset.pile; var list = k === 'draw' ? cc.draw.slice().sort(deckSort) : k === 'discard' ? cc.discard.slice().reverse() : cc.exhaust.slice(); showDeck(list, { draw: '山札（順不同）', discard: '捨て札', exhaust: '消滅したカード' }[k] + '：' + list.length + '枚', { combat: cc }); return; }
    var pw = e.target.closest('[data-pw]');
    if (pw) { var P = G.POWERS[pw.dataset.pw], n = S.combat.hero.powers[pw.dataset.pw]; tipAt(pw, '<b>' + esc(P.name) + '</b>' + esc(P.text(n))); return; }
    var dsl = e.target.closest('.die-slot');
    if (dsl) { tipAt(dsl, '<b>このラウンドの出目：' + (S.combat.die || '—') + '</b>サイコロ型の敵の行動と、秘宝の出目能力がこの出目で決まります。'); return; }
    var orb = e.target.closest('[data-orb]');
    if (orb) { var o = S.combat.hero.orbs[+orb.dataset.orb]; var nm = { spark: '雷核', frost: '氷核', void: '冥核' }; if (o) tipAt(orb, '<b>' + nm[o] + '</b>' + esc(G.KEYWORDS[nm[o]]) + (o === 'void' ? '（今なら' + (3 + S.combat.powerCount()) + '）' : '')); else tipAt(orb, '<b>空きの枠</b>核を宿せる。'); return; }
    var en = e.target.closest('.enemy');
    if (en) { onEnemyTap(en.dataset.uid); return; }
    if (e.target.closest('.hero-wrap')) { heroTip(); return; }
    if (!e.target.closest('.card') && !e.target.closest('.hud') && S.sel) { deselect(); }
  });
  R.hand.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.card'); if (!el) return;
    var cc = S.combat; if (!cc) return;
    var uid = +el.dataset.uid;
    drag = { el: el, uid: uid, sx: e.clientX, sy: e.clientY, moved: false, t: Date.now(), lp: null };
    drag.lp = setTimeout(function () { if (drag && !drag.moved) { var card = cc.hand.filter(function (x) { return x.uid === uid; })[0]; drag = null; if (card) inspectCard(card, { combat: cc }); } }, 520);
    try { el.setPointerCapture(e.pointerId); } catch (er) {}
  });
  R.hand.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var cc = S.combat;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 10) {
      drag.moved = true; clearTimeout(drag.lp);
      var card = cc.hand.filter(function (x) { return x.uid === drag.uid; })[0];
      if (!card || !canAct() || !cc.canPlay(card)) { drag.blocked = true; return; }
      drag.target = cc.needsTarget(card) && cc.alive().length > 0;
      if (S.sel !== drag.el) { S.sel = drag.el; CUI.layout(); }
      drag.el.classList.add('drag');
      if (drag.target) CUI.armTargets(true);
    }
    if (!drag.moved || drag.blocked) return;
    if (drag.target) {
      var r = drag.el.getBoundingClientRect();
      var x1 = r.left + r.width / 2, y1 = r.top + 6, x2 = e.clientX, y2 = e.clientY;
      var mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 60;
      R.arrow.setAttribute('d', 'M' + x1 + ' ' + y1 + ' Q' + mx + ' ' + my + ' ' + x2 + ' ' + y2);
      R.arrow.setAttribute('opacity', '1');
      var hit = enemyAt(e.clientX, e.clientY);
      $$('.enemy', R.enemies).forEach(function (x) { x.classList.toggle('target-hover', x === hit); });
    } else {
      var hr = R.hand.getBoundingClientRect();
      var base = drag.base || (drag.base = drag.el.style.transform.replace(/translate\([^)]*\)/, ''));
      drag.el.style.transform = 'translate(' + (e.clientX - (hr.left + hr.width / 2)) + 'px,' + (e.clientY - hr.bottom + drag.el.offsetHeight * 0.5) + 'px) scale(1.1)';
      drag.el.classList.toggle('sel-glow', e.clientY < hr.top - 20);
    }
  });
  function endDrag(e) {
    if (!drag) return;
    clearTimeout(drag.lp);
    var d = drag; drag = null;
    var cc = S.combat;
    d.el.classList.remove('drag', 'sel-glow');
    R.arrow.setAttribute('opacity', '0');
    $$('.enemy', R.enemies).forEach(function (x) { x.classList.remove('target-hover'); });
    if (!d.moved) { onCardTap(d.uid, d.el); return; }
    if (d.blocked) { denyCard(d.el); deselect(); return; }
    if (d.target) {
      var hit = enemyAt(e.clientX, e.clientY);
      CUI.armTargets(false);
      if (hit) { tryPlay(d.uid, hit.dataset.uid); return; }
      deselect(); return;
    }
    var hr = R.hand.getBoundingClientRect();
    if (e.clientY < hr.top - 20) { tryPlay(d.uid, null); return; }
    deselect();
  }
  R.hand.addEventListener('pointerup', endDrag);
  R.hand.addEventListener('pointercancel', endDrag);
  R.hand.addEventListener('pointerover', function (e) { if (!window.matchMedia('(hover: hover)').matches) return; var el = e.target.closest('.card'); if (el && S.hover !== el) { S.hover = el; CUI.layout(); } });
  R.hand.addEventListener('pointerleave', function () { if (S.hover) { S.hover = null; CUI.layout(); } });
  window.onresize = function () { if (S.combat) { CUI.layout(); CUI.sync(); } };
}
function enemyAt(x, y) {
  var best = null;
  $$('.enemy', R.enemies).forEach(function (el) { if (el.classList.contains('dying') || el.classList.contains('gone')) return; var r = el.getBoundingClientRect(); if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 10 && y <= r.bottom + 10) best = el; });
  return best;
}
function canAct() { var c = S.combat; return c && c.phase === 'player' && !S.acting && S.input && !c.over; }
function onCardTap(uid, el) {
  var c = S.combat; var card = c.hand.filter(function (x) { return x.uid === uid; })[0]; if (!card) return;
  S.armed = null;
  if (S.sel === el) {
    if (!canAct()) return;
    if (!c.canPlay(card)) { denyCard(el); return; }
    if (c.needsTarget(card) && c.alive().length > 1) { CUI.hint('使う相手（敵）をタップ'); return; }
    tryPlay(uid, c.needsTarget(card) ? c.alive()[0].uid : null);
    return;
  }
  SFX.play('card');
  S.sel = el; CUI.layout();
  var playable = canAct() && c.canPlay(card);
  CUI.armTargets(playable && c.needsTarget(card) && c.alive().length > 1);
  CUI.hint(!playable ? (G.card.hasKw(card, 'unplayable') || G.CARDS[card.id].cost == null ? 'このカードは使えない' : canAct() ? 'エナジーが足りない' : '') : c.needsTarget(card) && c.alive().length > 1 ? '敵をタップして使う／もう一度タップで取り消し' : 'もう一度タップで使う');
}
function onEnemyTap(uid) {
  var c = S.combat; var e = c.byUid(uid); if (!e || !e.alive) return;
  if (S.armed && canAct()) {
    var a = S.armed; S.armed = null; CUI.armTargets(false); CUI.hint('');
    if (a.kind === 'shiv') { doShiv(uid); return; }
    if (a.kind === 'potion') { S.acting = true; c.usePotion(a.index, uid).then(function () { S.acting = false; CUI.sync(); }); return; }
  }
  if (S.sel && canAct()) {
    var card = c.hand.filter(function (x) { return x.uid === +S.sel.dataset.uid; })[0];
    if (card && c.canPlay(card)) { tryPlay(card.uid, c.needsTarget(card) ? uid : null); return; }
  }
  c.focus = uid; CUI.sync();
  enemySheet(e);
}
async function doShiv(uid) {
  var c = S.combat; S.acting = true; CUI.sync();
  await c.useShiv(uid);
  S.acting = false; CUI.armTargets(false); CUI.hint(''); CUI.sync();
}
function denyCard(el) { SFX.play('error'); el.animate([{ transform: el.style.transform }, { transform: el.style.transform + ' translateX(-6px)' }, { transform: el.style.transform + ' translateX(6px)' }, { transform: el.style.transform }], { duration: 220 }); }
function deselect() { if (S.sel || S.armed) { S.sel = null; S.armed = null; CUI.armTargets(false); CUI.hint(''); CUI.layout(); CUI.sync(); } }
CUI.armTargets = function (on) { $$('.enemy', R.enemies).forEach(function (x) { x.classList.toggle('targetable', !!on && !x.classList.contains('dying')); }); };
CUI.hint = function (t) { if (!R.hint) return; R.hint.textContent = t || ''; R.hint.classList.toggle('on', !!t); };
async function tryPlay(uid, targetUid) {
  var c = S.combat; if (!canAct()) return;
  var card = c.hand.filter(function (x) { return x.uid === uid; })[0]; if (!card) return;
  if (!c.canPlay(card)) { denyCard(cardEls[uid]); return; }
  if (S.tutorial && !tutorialAllows(card.id)) { toast('今は光っているカードを使ってみましょう'); return; }
  S.acting = true; S.sel = null; CUI.armTargets(false); CUI.hint('');
  await c.playCard(uid, targetUid);
  if (S.tutorial) { S.tutorial.step++; }
  S.acting = false;
  CUI.layout(); CUI.sync();
  tutorialUpdate();
}
function heroTip() {
  var c = S.combat, hh = c.hero;
  var lines = [];
  if (hh.str) lines.push('闘気 ' + hh.str + '：' + G.KEYWORDS['闘気']);
  if (hh.weak) lines.push('怯み ' + hh.weak + '：' + G.KEYWORDS['怯み']);
  if (hh.vuln) lines.push('隙 ' + hh.vuln + '：' + G.KEYWORDS['隙']);
  if (hh.stance !== 'none') lines.push({ calm: '凪の構え', wrath: '烈の構え', divine: '天の構え' }[hh.stance] + '：' + G.KEYWORDS[{ calm: '凪の構え', wrath: '烈の構え', divine: '天の構え' }[hh.stance]]);
  if (hh.retaliate) lines.push('炎の壁：攻撃を受けるたび攻撃者に' + hh.retaliate + 'ダメージ');
  if (hh.plated) lines.push('鉄皮：ターン開始時に盾' + hh.plated);
  if (hh.keepBlock) lines.push('霧隠れ：次のターン開始時に盾が消えない');
  var nx = hh.next; if (nx.block) lines.push('次のターン：盾' + nx.block); if (nx.energy) lines.push('次のターン：エナジー' + nx.energy); if (nx.draw) lines.push('次のターン：' + nx.draw + '枚多く引く'); if (nx.miracle) lines.push('次のターン：祈り' + nx.miracle);
  if (c.doubleNext) lines.push('写し身：次のカードを2回使う');
  Object.keys(hh.powers).forEach(function (k) { if (hh.powers[k] && G.POWERS[k]) lines.push(G.POWERS[k].name + '：' + G.POWERS[k].text(hh.powers[k])); });
  tipAt(R.hero, '<b>' + esc(hh.name) + '　HP ' + hh.hp + '/' + hh.maxHp + '</b>' + (lines.length ? lines.map(esc).join('<br>') : '特別な効果はない。'));
}
function actText(act) {
  var parts = act.fx.map(function (op) {
    var k = op[0], a = op[1], b = op[2];
    if (k === 'atk') return a + 'ダメージ' + (b > 1 ? '×' + b : '');
    if (k === 'block') return '盾' + a;
    if (k === 'blockAlly') return '仲間に盾' + a;
    if (k === 'blockAll') return '全員に盾' + a;
    if (k === 'str') return '闘気+' + a;
    if (k === 'strAll') return '全員の闘気+' + a;
    if (k === 'weak') return '怯み' + a;
    if (k === 'vuln') return '隙' + a;
    if (k === 'status') return '「' + G.CARDS[a].name + '」' + (b || 1) + '枚を' + ({ drawTop: '山札の上', hand: '手札' }[op[3]] || '捨て札') + 'に';
    if (k === 'summon') return (a.indexOf('random:') === 0 ? '仲間' : G.ENEMIES[a].name) + 'を呼ぶ';
    if (k === 'heal') return 'HP' + a + '回復';
    if (k === 'flee') return '逃げる';
    if (k === 'none') return act.icon === 'charge' ? '力を溜める' : act.icon === 'sleep' ? '眠っている' : '何もしない';
    if (k === 'fn') return a === 'unshell' ? '攻撃形態に戻る' : a === 'out' ? '火が全て消える' : '';
    return '';
  }).filter(Boolean);
  return parts.join('、');
}
function enemySheet(e) {
  var c = S.combat, d = G.ENEMIES[e.id];
  function table(p, curIdx, isCur) {
    if (p.single) return '<table class="act-table"><tr class="' + (isCur ? 'cur' : '') + '"><td class="dv">毎ターン</td><td><b>' + esc(p.single.name) + '</b>：' + esc(actText(p.single)) + '</td></tr></table>';
    if (p.die) return '<table class="act-table">' + p.die.map(function (r) { var cur = isCur && c.die >= r[0] && c.die <= r[1]; return '<tr class="' + (cur ? 'cur' : '') + '"><td class="dv">出目' + r[0] + (r[1] !== r[0] ? '〜' + r[1] : '') + '</td><td><b>' + esc(r[2].name) + '</b>：' + esc(actText(r[2])) + '</td></tr>'; }).join('') + '</table>';
    if (p.cube) return '<table class="act-table">' + p.cube.acts.map(function (a, i) { var gray = i < (p.cube.loop || 0); return '<tr class="' + (isCur && i === curIdx ? 'cur' : '') + '"><td class="dv">' + (i + 1) + (i === (p.cube.loop || 0) ? ' ↻' : '') + '</td><td><b>' + esc(a.name) + '</b>：' + esc(actText(a)) + (gray ? ' <span class="gray">（最初だけ）</span>' : '') + '</td></tr>'; }).join('') + '</table><p class="room-sub" style="text-align:left;margin:6px 0 0">上から順に行動し、最後まで行くと ↻ から繰り返す。</p>';
    return '';
  }
  var body = '<div class="enemy-sheet"><div class="en-pic">' + ART.enemy(d.art || e.id) + '</div><div style="flex:1;min-width:0"><div style="font-family:var(--f-lat);font-weight:800">HP ' + e.hp + '/' + e.maxHp + (e.block ? '　盾 ' + e.block : '') + '</div>' +
    '<div style="margin-top:4px;font-size:.84rem;color:#d8c8a8">次の行動：<b style="color:#ffd27a">' + esc(c.actionOf(e).name) + '</b>（' + esc(actText(c.actionOf(e))) + '）</div></div></div>';
  if (e.st.sleep) body += '<p class="room-sub" style="text-align:left">眠っている。</p>';
  if (d.modes) Object.keys(d.modes).forEach(function (m) { body += '<h4 style="margin:12px 0 4px;color:#ffd27a;font-family:var(--f-min)">' + esc(d.modes[m].label) + (e.mode === m ? '（現在）' : '') + '</h4>' + table(d.modes[m], e.cube, e.mode === m); });
  else body += '<div style="margin-top:10px">' + table(d, e.cube, true) + '</div>';
  if (d.sp && d.sp.length) body += '<div class="sp-list">' + d.sp.map(function (s) { return '<div><b>' + esc(s[0]) + '</b>：' + esc(s[1]) + '</div>'; }).join('') + '</div>';
  var st = [];
  if (e.str) st.push('闘気 ' + e.str); if (e.weak) st.push('怯み ' + e.weak); if (e.vuln) st.push('隙 ' + e.vuln); if (e.poison) st.push('毒 ' + e.poison);
  if(st.length)body+='<div class="enemy-active-effects"><h4>現在の特殊効果</h4>'+['str','weak','vuln','poison'].filter(function(k){return e[k]>0;}).map(function(k){return '<button data-term="'+EFFECT_NAME[k]+'" data-owner="'+e.uid+'"><b>'+EFFECT_NAME[k]+' '+e[k]+'</b><span>'+esc(TERM_BY_NAME[EFFECT_NAME[k]].description)+'</span></button>';}).join('')+'</div>';
  modal({ title: esc(e.name), body: body, cls: 'sheet' });
}

/* ---------- animation handlers ---------- */
var H = {};
function heroPos(oy) { return FX.center(R.heroArt, oy == null ? 0.45 : oy); }
function enemyPos(e, oy) { var el = enemyEls[e.uid]; return el ? FX.center($('.en-art', el), oy == null ? 0.55 : oy) : { x: window.innerWidth * 0.7, y: window.innerHeight * 0.3 }; }
function screenShake(m) { FX.shake(R.bf, m, 360); }
var STNAME = { str: '闘気', weak: '怯み', vuln: '隙', poison: '毒' };
H.combatStart = async function () {
  S.combat.enemies.forEach(function (e) { if (!enemyEls[e.uid]) addEnemyEl(e, false); });
  CUI.sync();
  SFX.play('turn');
  $$('.enemy', R.enemies).forEach(function (el, i) { el.animate([{ transform: 'translateX(60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, delay: i * 90, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' }); });
  R.hero.animate([{ transform: 'translateX(-60px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1)' });
  await wait(450);
};
H.turn = async function (d) {
  var who = d.who;
  R.banner.classList.toggle('enemy', who === 'enemy');
  $('span', R.banner).textContent = who === 'player' ? (d.round === 1 ? '戦闘開始' : 'あなたのターン') : '敵のターン';
  SFX.play(who === 'player' ? 'turn' : 'enemyturn');
  var a = R.banner.animate([{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)', offset: 0.18 }, { opacity: 1, transform: 'scaleY(1)', offset: 0.75 }, { opacity: 0, transform: 'scaleY(.6)' }], { duration: 950 / Math.max(0.6, FX.speed) });
  if (who === 'enemy') { S.input = false; deselect(); }
  await wait(who === 'player' ? 520 : 600);
};
H.reset = function () { CUI.sync(); };
H.playerReady = function () { S.input = true; if (S.tutorial && S.combat.round === 2) S.tutorial.step = 4; CUI.sync(); CUI.layout(); tutorialUpdate(); };
H.endTurnStart = function () { S.input = false; deselect(); CUI.sync(); };
H.draw = async function (d) {
  var cards = d.cards;
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    if (cardEls[card.uid]) continue;
    var el = cardEl(card, { combat: S.combat });
    el.dataset.sig = cardSig(S.combat, card);
    var p = d.fromDiscard ? pileXY('discard') : pileXY('draw');
    el.style.transition = 'none';
    el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(.35) rotate(-20deg)';
    el.style.opacity = '0';
    R.hand.appendChild(el);
    cardEls[card.uid] = el;
    void el.offsetWidth;
    el.style.transition = '';
    el.style.opacity = '1';
    SFX.play('draw');
    CUI.layout();
    await wait(95);
  }
  CUI.sync();
};
H.shuffle = async function () {
  SFX.play('shuffle');
  var a = FX.center(R.discard), b = FX.center(R.draw);
  for (var i = 0; i < 4; i++) {
    var bk = h('<div class="limbo card-back">' + ART.cardBack() + '</div>');
    bk.style.left = (a.x - 24) + 'px'; bk.style.top = (a.y - 34) + 'px'; bk.style.width = '48px'; bk.style.height = '68px';
    document.body.appendChild(bk);
    (function (bk, i) { var an = bk.animate([{ transform: 'translate(0,0) rotate(0) scale(.8)' }, { transform: 'translate(' + ((b.x - a.x) / 2) + 'px,-70px) rotate(' + (180 + i * 30) + 'deg) scale(1)' }, { transform: 'translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) rotate(360deg) scale(.6)' }], { duration: 480, delay: i * 70, easing: 'ease-in-out', fill: 'forwards' }); an.onfinish = function () { bk.remove(); }; })(bk, i);
  }
  FX.pulse(R.draw, 'bump', 400);
  await wait(420);
};
H.die = async function (d) {
  if (d.rolled) { await rollDieAnim(d.value); }
  else { SFX.play('dieland'); FX.float(FX.center(R.die).x, FX.center(R.die).y + 30, '出目 ' + d.value, 'sp'); }
  CUI.sync();
  FX.pulse(R.die, 'glow', 900);
  $$('.intent', R.enemies).forEach(function (it) { it.dataset.sig = ''; });
  CUI.sync();
  await wait(200);
};
function takeToLimbo(card) {
  var el = cardEls[card.uid];
  if (el) {
    delete cardEls[card.uid];
    var r = el.getBoundingClientRect(), w = el.offsetWidth, hgt = el.offsetHeight;
    el.classList.remove('dim', 'playable', 'drag', 'sel-glow');
    el.style.transition = 'none';
    el.style.left = (r.left + r.width / 2 - w / 2) + 'px'; el.style.top = (r.top + r.height / 2 - hgt / 2) + 'px'; el.style.bottom = 'auto'; el.style.margin = '0';
    el.style.transform = 'none';
    el.style.zIndex = '';
    el.classList.add('limbo');
    document.body.appendChild(el);
  } else {
    el = cardEl(card, { combat: S.combat, cls: 'limbo' });
    document.body.appendChild(el);
    var p = FX.center(R.draw);
    el.style.left = (p.x - el.offsetWidth / 2) + 'px'; el.style.top = (p.y - el.offsetHeight / 2) + 'px';
  }
  limbo[card.uid] = el;
  return el;
}
H.play = async function (d) {
  var card = d.card, el = takeToLimbo(card);
  if (S.sel === el) S.sel = null;
  CUI.layout();
  var r = el.getBoundingClientRect();
  var tx = window.innerWidth / 2 - (r.left + r.width / 2), ty = window.innerHeight * 0.42 - (r.top + r.height / 2);
  var type = G.CARDS[card.id].type;
  SFX.play('play');
  var glow = type === 'atk' ? 'rgba(255,120,80,.9)' : type === 'pow' ? 'rgba(200,150,255,.95)' : 'rgba(120,200,255,.9)';
  var an = el.animate([{ transform: 'none' }, { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(1.18)', filter: 'drop-shadow(0 0 18px ' + glow + ')' }], { duration: 220 / Math.max(0.6, FX.speed), easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
  el._pos = { tx: tx, ty: ty };
  await wait(260);
};
H.echo = async function (d) {
  var el = limbo[d.card.uid];
  if (el) { var c = FX.center(el); FX.ring(c.x, c.y, { color: '#d8b8ff', r1: 90 }); FX.float(c.x, c.y - 60, 'もう一度！', 'sp'); }
  SFX.play('buff');
  await wait(220);
};
function limboFly(uid, to, cls) {
  var el = limbo[uid]; if (!el) return Promise.resolve();
  delete limbo[uid];
  var r = el.getBoundingClientRect(), t = FX.center(to);
  var p = el._pos || { tx: 0, ty: 0 };
  var dx = t.x - (r.left + r.width / 2) + p.tx, dy = t.y - (r.top + r.height / 2) + p.ty;
  var an = el.animate([{ transform: 'translate(' + p.tx + 'px,' + p.ty + 'px) scale(1.18)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(30deg)', opacity: 0.2 }], { duration: 300 / Math.max(0.6, FX.speed), easing: 'ease-in', fill: 'forwards' });
  return new Promise(function (res) { an.onfinish = function () { el.remove(); FX.pulse(to, 'bump', 350); res(); }; });
}
H.toDiscard = function (d) { return limboFly(d.card.uid, R.discard); };
H.toDrawTop = function (d) { return limboFly(d.card.uid, R.draw); };
H.powerPlaced = async function (d) {
  var el = limbo[d.card.uid];
  if (el) {
    delete limbo[d.card.uid];
    var c = heroPos(), r = el.getBoundingClientRect(), p = el._pos || { tx: 0, ty: 0 };
    var dx = c.x - (r.left + r.width / 2) + p.tx, dy = c.y - (r.top + r.height / 2) + p.ty;
    SFX.play('buff');
    var an = el.animate([{ transform: 'translate(' + p.tx + 'px,' + p.ty + 'px) scale(1.18)' }, { transform: 'translate(' + p.tx + 'px,' + (p.ty - 30) + 'px) scale(1.3)', filter: 'brightness(1.8) drop-shadow(0 0 24px #c9a2ff)', offset: 0.4 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.1)', opacity: 0 }], { duration: 520 / Math.max(0.6, FX.speed), easing: 'ease-in', fill: 'forwards' });
    await new Promise(function (res) { an.onfinish = res; });
    el.remove();
    FX.ring(c.x, c.y, { color: '#d8b8ff', r1: 80, w: 5 });
    FX.burst(c.x, c.y, { n: 22, colors: ['#e8d4ff', '#b58aff', '#fff'], shape: 'star', g: -40, speed: [40, 160], life: [0.5, 1] });
  }
  CUI.sync();
};
H.exhaust = async function (d) {
  var card = d.card;
  var el = limbo[card.uid] || cardEls[card.uid];
  SFX.play('exhaust');
  if (el) {
    var inHand = !!cardEls[card.uid];
    delete limbo[card.uid]; delete cardEls[card.uid];
    if (S.sel === el) S.sel = null;
    var c = FX.center(el);
    var base = el.getAnimations && el.getAnimations().length ? '' : '';
    var p = el._pos ? 'translate(' + el._pos.tx + 'px,' + el._pos.ty + 'px) scale(1.18)' : el.style.transform;
    if (el._pos) c = { x: c.x, y: c.y };
    var an = el.animate([{ transform: p, filter: 'none', opacity: 1 }, { transform: p, filter: 'brightness(2.2) sepia(1) saturate(3) hue-rotate(-15deg)', opacity: 1, offset: 0.35 }, { transform: p + ' translateY(-18px) scale(.92)', filter: 'brightness(.4) sepia(1)', opacity: 0 }], { duration: 560 / Math.max(0.6, FX.speed), fill: 'forwards' });
    var t0 = 0, iv = setInterval(function () { t0++; FX.burst(c.x + (Math.random() - 0.5) * 60, c.y + (Math.random() - 0.3) * 70, { n: 4, colors: ['#ffb35c', '#ff6a2a', '#ffe08a'], shape: 'dot', g: -120, speed: [20, 80], life: [0.4, 0.9], size: [1.5, 3], glow: true }); if (t0 > 6) clearInterval(iv); }, 60);
    await new Promise(function (res) { an.onfinish = res; });
    el.remove();
    if (inHand) CUI.layout();
  }
  FX.pulse(R.exhaust, 'bump', 350);
  CUI.sync();
};
H.discard = async function (d) {
  var els = [];
  d.cards.forEach(function (card) { var el = cardEls[card.uid]; if (el) { delete cardEls[card.uid]; els.push(el); } });
  if (d.fromDraw) { SFX.play('card'); FX.pulse(R.discard, 'bump', 350); return; }
  if (!els.length) return;
  var t = pileXY('discard');
  SFX.play('card');
  els.forEach(function (el, i) {
    if (S.sel === el) S.sel = null;
    el.style.transition = 'transform .34s ease-in ' + (i * 0.035) + 's, opacity .34s ease-in ' + (i * 0.035) + 's';
    el.style.transform = 'translate(' + t.x + 'px,' + t.y + 'px) scale(.25) rotate(40deg)';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 420 + i * 40);
  });
  CUI.layout();
  await wait(d.endTurn ? 380 : 260);
  FX.pulse(R.discard, 'bump', 350);
};
H.addCards = async function (d) {
  for (var i = 0; i < d.cards.length; i++) {
    var card = d.cards[i];
    var el = cardEl(card, { combat: S.combat, cls: 'limbo' });
    var w = R.hand.querySelector('.card') ? R.hand.querySelector('.card').offsetWidth : 90;
    el.style.left = (window.innerWidth / 2 - w / 2) + 'px'; el.style.top = (window.innerHeight * 0.36 - w * 0.7) + 'px';
    document.body.appendChild(el);
    SFX.play('card');
    el.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1 }], { duration: 260, fill: 'forwards' });
    await wait(380);
    if (d.where === 'hand') {
      el.remove(); el.classList.remove('limbo'); el.style.left = ''; el.style.top = '';
      var ne = cardEl(card, { combat: S.combat }); R.hand.appendChild(ne); cardEls[card.uid] = ne; ne.dataset.sig = cardSig(S.combat, card); CUI.layout();
    } else {
      var to = d.where === 'discard' ? R.discard : R.draw, tc = FX.center(to), r = el.getBoundingClientRect();
      var an = el.animate([{ transform: 'scale(1.1)' }, { transform: 'translate(' + (tc.x - r.left - r.width / 2) + 'px,' + (tc.y - r.top - r.height / 2) + 'px) scale(.2) rotate(20deg)', opacity: 0.2 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
      await new Promise(function (res) { an.onfinish = res; });
      el.remove(); FX.pulse(to, 'bump', 300);
    }
  }
  CUI.sync();
};
H.upgradeInHand = async function (d) {
  SFX.play('relic');
  d.cards.forEach(function (card) { var el = cardEls[card.uid]; if (el) { refreshCardEl(el, card); el.dataset.sig = cardSig(S.combat, card); var c = FX.center(el); FX.burst(c.x, c.y, { n: 12, colors: ['#a6ff8f', '#e0ffd0'], shape: 'star', g: -60, speed: [30, 120] }); } });
  await wait(300);
};
H.heroAttack = async function (d) {
  if (d.shiv || d.random) { return; }
  R.heroArt.animate([{transform:'translateX(0)'},{transform:'translateX(-8px) rotate(-2deg)',offset:.2},{transform:'translateX(42px) rotate(5deg)',offset:.52},{transform:'translateX(0)'}],{duration:370/Math.max(.6,FX.speed),easing:'cubic-bezier(.2,.8,.2,1)'});
  SFX.play('slash');
  await wait(150);
};
H.heroAttackAll = async function (d) {
  R.hero.animate([{ transform: 'none' }, { transform: 'translateX(20px) scale(1.04)' }, { transform: 'none' }], { duration: 260 });
  SFX.play('slash');
  var r = R.enemies.getBoundingClientRect();
  FX.slash(r.left + r.width / 2, r.top + r.height * 0.55, { r: r.width * 0.45, a0: -2.8, a1: -0.3, w: 10, color: '#ffd8b0' });
  await wait(140);
};
H.shivThrow = async function (d) {
  var a = heroPos(0.3), b = enemyPos(d.t);
  SFX.play('shiv');
  FX.streak(a.x, a.y, b.x, b.y, { color: '#e6ffd8', w: 3 });
  await wait(90);
};
H.enemyDamage = async function (d) {
  var e = d.e, el = enemyEls[e.uid]; if (!el) return;
  var p = enemyPos(e), k = d.kind;
  if (k === 'hit' || k === 'aoe') { if (k === 'hit') FX.slash(p.x, p.y, { r: 46 + Math.min(40, d.amount * 6), a0: -2.6 + Math.random() * 0.4, a1: -0.5, color: '#ffe2c0' }); FX.burst(p.x, p.y, { n: 10 + d.amount * 2, colors: ['#fff2d0', '#ffb070', '#ff7040'], speed: [120, 340], life: [0.25, 0.55] }); SFX.play(d.amount >= 6 ? 'bighit' : 'hit', d.amount / 3); }
  else if (k === 'shiv') { FX.burst(p.x, p.y, { n: 8, colors: ['#e6ffd8', '#a8f090'], speed: [80, 220], life: [0.2, 0.4] }); SFX.play('hit', 0.6); }
  else if (k === 'poison') { FX.burst(p.x, p.y + 10, { n: 14, colors: ['#9eff7a', '#4ad040'], shape: 'bubble', g: -90, speed: [20, 80], life: [0.6, 1.1], size: [2, 5], add: false }); SFX.play('poison'); }
  else if (k === 'spark') { var a = heroPos(0.1); FX.bolt(a.x, a.y, p.x, p.y, { color: '#fff27a' }); FX.burst(p.x, p.y, { n: 12, colors: ['#fff7a0', '#ffd447'], speed: [100, 260] }); SFX.play('zap'); }
  else if (k === 'void') { FX.ring(p.x, p.y, { color: '#b066ff', r0: 80, r1: 4, life: 0.45, w: 6 }); FX.burst(p.x, p.y, { n: 18, colors: ['#d8a8ff', '#7a2aff'], speed: [60, 200] }); SFX.play('void'); }
  else if (k === 'fire') { FX.burst(p.x, p.y, { n: 26, colors: ['#ffe08a', '#ff8a3a', '#ff4a1a'], g: -80, speed: [60, 220], shape: 'dot', glow: true, size: [3, 6] }); SFX.play('burn'); }
  else { FX.burst(p.x, p.y, { n: 8, colors: ['#ffe0b0'], speed: [80, 200] }); SFX.play('hit', 0.5); }
  if (d.loss > 0) {
    FX.float(p.x, p.y - 10, String(d.loss), k === 'poison' ? 'pois' : d.loss >= 6 ? 'big' : 'dmg');
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    if (d.loss >= 5) screenShake(Math.min(12, 3 + d.loss));
    else FX.shake($('.en-art', el), 5, 260);
  }
  if (d.blocked > 0) { FX.float(p.x + 26, p.y - 40, '防 ' + d.blocked, 'blk'); if (!d.loss) SFX.play('blocked'); }
  CUI.sync();
  await wait(k === 'poison' ? 260 : 150);
};
H.enemyDeath = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  var p = enemyPos(d.e);
  SFX.play('death');
  FX.burst(p.x, p.y, { n: 36, colors: ['#e0d0c0', '#8a7a6a', '#ffb070'], speed: [60, 260], g: 120, life: [0.5, 1.1], size: [2, 5], shape: 'shard', add: false });
  el.classList.add('dying');
  await wait(560);
  el.classList.add('gone');
  CUI.sync();
};
H.split = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  var p = enemyPos(d.e);
  SFX.play('death');
  FX.burst(p.x, p.y, { n: 30, colors: ['#9ab86a', '#5e6e3c', '#c8d8a0'], shape: 'bubble', speed: [80, 240], g: 200, life: [0.5, 1], add: false });
  FX.float(p.x, p.y - 50, '分裂！', 'sp');
  el.classList.add('dying');
  await wait(380);
  el.classList.add('gone');
};
H.summon = async function (d) {
  d.list.forEach(function (e) { if (!enemyEls[e.uid]) addEnemyEl(e, true); });
  CUI.sync();
  SFX.play('orb');
  d.list.forEach(function (e) { var p = enemyPos(e); FX.burst(p.x, p.y, { n: 16, colors: ['#c8e8a0', '#fff'], shape: 'dot', speed: [40, 160], g: -40, life: [0.4, 0.8], glow: true }); });
  await wait(420);
};
H.flee = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  SFX.play('whoosh');
  var an = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(120px,-140px) rotate(20deg) scale(.6)', opacity: 0 }], { duration: 600, easing: 'ease-in', fill: 'forwards' });
  FX.float(enemyPos(d.e).x, enemyPos(d.e).y - 40, '逃げた！', 'sp');
  await new Promise(function (res) { an.onfinish = res; });
  el.classList.add('gone');
};
H.enemyAct = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  el.classList.add('acting');
  var lb = h('<div class="act-label">' + esc(d.act.name) + '</div>');
  el.appendChild(lb); setTimeout(function () { lb.remove(); }, 1100);
  await wait(300);
  setTimeout(function () { el.classList.remove('acting'); }, 500);
};
H.enemyAttack = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  var a = enemyPos(d.e), b = heroPos();
  var dx = (b.x - a.x) * 0.18, dy = (b.y - a.y) * 0.18;
  SFX.play('whoosh');
  $('.en-art',el).animate([{transform:'none'},{transform:'translate('+(-dx*.2)+'px,0) scale(.97)',offset:.2},{transform:'translate('+dx+'px,'+dy+'px) scale(1.06)',offset:.55},{transform:'none'}],{duration:390/Math.max(.6,FX.speed),easing:'cubic-bezier(.2,.7,.3,1)'});
  await wait(150);
};
H.heroDamage = async function (d) {
  var p = heroPos();
  if (d.loss > 0) {
    R.hero.classList.remove('hit'); void R.hero.offsetWidth; R.hero.classList.add('hit');
    R.vig.classList.remove('on'); void R.vig.offsetWidth; R.vig.classList.add('on');
    FX.float(p.x, p.y - 10, String(d.loss), 'hurt');
    FX.burst(p.x, p.y, { n: 12 + d.loss * 3, colors: ['#ff6a5a', '#ffb0a0', '#a01a0a'], speed: [100, 300], life: [0.3, 0.6] });
    screenShake(Math.min(14, 4 + d.loss * 2));
    SFX.play('hurt');
  }
  if (d.blocked > 0) { FX.float(p.x + 30, p.y - 40, '防 ' + d.blocked, 'blk'); if (!d.loss) { SFX.play('blocked'); FX.burst(p.x + 10, p.y, { n: 10, colors: ['#bfe6ff', '#fff'], speed: [80, 220], life: [0.2, 0.4] }); } }
  if (!d.loss && !d.blocked && d.hit) { FX.float(p.x, p.y - 10, '0', 'blk'); }
  CUI.sync();
  await wait(d.loss > 0 ? 260 : 160);
};
H.block = async function (d) {
  var t = d.t;
  if (t.isHero) { var p = heroPos(0.55); FX.float(p.x, p.y, '+' + d.amount, 'blk'); FX.ring(p.x, p.y, { color: '#8fd0ff', r1: 50, w: 3 }); SFX.play('block'); }
  else { var q = enemyPos(t); FX.float(q.x, q.y - 20, '+' + d.amount, 'blk'); SFX.play('block'); }
  CUI.sync();
  await wait(120);
};
H.status = async function (d) {
  effectNote(d);
  var t = d.t, nm = STNAME[d.key] || d.key;
  var p = t.isHero ? heroPos(0.35) : enemyPos(t, 0.35);
  var good = d.key === 'str' ? d.delta > 0 : false;
  if (t.isHero && d.key !== 'str' && d.delta > 0) good = false;
  if (Math.abs(d.delta) >= 1 && d.delta > 0) {
    FX.float(p.x, p.y, nm + '+' + d.delta, 'st' + (good || (!t.isHero && d.key !== 'str') ? ' good' : ''));
    if (d.key === 'poison') { SFX.play('poison'); FX.burst(p.x, p.y + 16, { n: 8, colors: ['#9eff7a'], shape: 'bubble', g: -60, speed: [20, 70], life: [0.5, 0.9], add: false }); }
    else if (d.key === 'str') { SFX.play(t.isHero ? 'buff' : 'debuff'); FX.burst(p.x, p.y + 20, { n: 12, colors: ['#ffb060', '#ff7030'], shape: 'dot', g: -140, speed: [20, 90], glow: true, life: [0.5, 0.9] }); }
    else SFX.play(t.isHero ? 'debuff' : 'buff');
  }
  CUI.sync();
  var el = t.isHero ? R.hero : enemyEls[t.uid];
  if (el) { var st = el.querySelector('.st[data-st="' + d.key + '"]'); if (st) { st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop'); } }
  await wait(d.delta > 0 ? 150 : 40);
};
H.energy = function (d) { CUI.sync(); if (d && d.delta > 0) { SFX.play('energy'); FX.pulse(R.energy, 'pulse', 450); var c = FX.center(R.energy); FX.burst(c.x, c.y, { n: 12, colors: ['#ffe2a0', '#fff'], shape: 'star', speed: [40, 140], g: 0, life: [0.3, 0.6] }); } };
H.token = async function (d) {
  CUI.sync();
  var b = d.key === 'shiv' ? R.shiv : R.miracle;
  FX.pulse(b, 'bump', 350);
  if (d.delta > 0) { var c = FX.center(b); FX.burst(c.x, c.y, { n: 8, colors: d.key === 'shiv' ? ['#e6ffd8'] : ['#ffe7a8'], shape: 'star', g: 0, speed: [30, 120], life: [0.3, 0.6] }); SFX.play(d.key === 'shiv' ? 'shiv' : 'energy'); await wait(80); }
};
H.heal = async function (d) {
  var t = d.t, p = t.isHero ? heroPos(0.4) : enemyPos(t);
  FX.float(p.x, p.y, '+' + d.amount, 'heal');
  FX.burst(p.x, p.y + 20, { n: 16, colors: ['#9effa0', '#e8ffd0'], shape: 'star', g: -80, speed: [20, 100], life: [0.5, 1] });
  SFX.play('heal');
  CUI.sync(); await wait(240);
};
H.maxhp = function (d) { var p = heroPos(0.3); FX.float(p.x, p.y, '最大HP+' + d.delta, 'heal'); SFX.play('heal'); };
H.gold = function (d) { refreshTop(); var g = document.getElementById('tbGold'); if (g) { var c = FX.center(g); FX.float(c.x, c.y + 26, (d.delta > 0 ? '+' : '') + d.delta, 'gold'); } SFX.play('coin'); };
H.relicFlash = async function (d) {
  var b = document.querySelector('.relic-btn[data-relic="' + d.id + '"]');
  if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
  if (R.heroArt && R.heroArt.isConnected) { var p = heroPos(0.05); FX.float(p.x, p.y - 20, G.RELICS[d.id].name, 'sp'); }
  SFX.play('relic');
  await wait(260);
};
H.powerFlash = async function (d) { var b = R.powers && R.powers.querySelector('[data-pw="' + d.key + '"]'); if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } await wait(120); };
H.power = function () { CUI.sync(); };
H.next = function () { CUI.sync(); };
H.stance = async function (d) {
  var nm = { none: '無の構え', calm: '凪の構え', wrath: '烈の構え', divine: '天の構え' }[d.to];
  CUI.sync();
  var p = heroPos(0.25);
  FX.float(p.x, p.y, nm, 'sp');
  SFX.play(d.to === 'calm' ? 'calm' : d.to === 'wrath' ? 'wrath' : d.to === 'divine' ? 'divine' : 'whoosh');
  var col = d.to === 'calm' ? ['#9fd8ff', '#e0f4ff'] : d.to === 'wrath' ? ['#ff7a4a', '#ffcf8a'] : d.to === 'divine' ? ['#fff3c0', '#ffd27a'] : ['#d8d0c0'];
  FX.burst(p.x, p.y + 40, { n: 26, colors: col, shape: d.to === 'wrath' ? 'dot' : 'star', g: d.to === 'wrath' ? -160 : -40, speed: [40, 180], life: [0.5, 1.1], glow: d.to === 'wrath' });
  FX.ring(p.x, p.y + 40, { color: col[0], r1: 90, w: 4 });
  await wait(300);
};
H.orbChannel = async function (d) {
  CUI.sync();
  var el = R.orbs.querySelector('[data-orb="' + d.index + '"]');
  if (el) { el.classList.add('flash'); var c = FX.center(el); FX.ring(c.x, c.y, { color: d.type === 'spark' ? '#ffd447' : d.type === 'frost' ? '#7fd3ff' : '#b066ff', r1: 40, w: 3 }); }
  SFX.play(d.type === 'spark' ? 'zap' : d.type === 'frost' ? 'frost' : 'void');
  await wait(220);
};
H.orbEvoke = async function (d) {
  var el = R.orbs.querySelector('[data-orb="' + d.index + '"]');
  var c = el ? FX.center(el) : heroPos(0.1);
  FX.burst(c.x, c.y, { n: 22, colors: d.type === 'spark' ? ['#fff7a0', '#ffd447'] : d.type === 'frost' ? ['#e0f8ff', '#7fd3ff'] : ['#e0c0ff', '#9a4aff'], shape: d.type === 'frost' ? 'shard' : 'star', speed: [80, 240], g: 0, life: [0.3, 0.7] });
  SFX.play(d.type === 'spark' ? 'zap' : d.type === 'frost' ? 'frost' : 'void');
  R.orbs.dataset.sig = '';
  CUI.sync();
  await wait(160);
};
H.orbPassive = async function (d) {
  var el = R.orbs.querySelector('[data-orb="' + d.index + '"]');
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  await wait(120);
};
H.orbStorm = async function () { var a = heroPos(0.05); S.combat.alive().forEach(function (e) { var b = enemyPos(e); FX.bolt(a.x, a.y, b.x, b.y, { color: '#fff27a', w: 4 }); }); SFX.play('zap'); await wait(120); };
H.orbClear = function () { R.orbs.dataset.sig = ''; CUI.sync(); SFX.play('void'); };
H.special = async function (d) {
  var el = enemyEls[d.e.uid]; if (!el) return;
  var lb = h('<div class="act-label sp">' + esc(d.name) + '</div>');
  el.appendChild(lb); setTimeout(function () { lb.remove(); }, 1100);
  SFX.play('buff');
  await wait(380);
};
H.mode = async function (d) { CUI.sync(); var p = enemyPos(d.e); FX.burst(p.x, p.y, { n: 30, colors: ['#a8c88a', '#e0f0c0', '#6a7a5a'], shape: 'shard', speed: [60, 220], g: 120, add: false }); SFX.play('bighit'); screenShake(8); await wait(400); };
H.badge = function () { CUI.sync(); };
H.enemyBlockReset = function () { CUI.sync(); };
H.potion = async function (d) {
  var P = G.POTIONS[d.id], p = d.t ? enemyPos(d.t) : heroPos(0.4);
  FX.burst(p.x, p.y, { n: 26, colors: [P.color, '#fff'], shape: 'bubble', speed: [40, 180], g: -40, life: [0.5, 1], add: false });
  SFX.play('heal');
  refreshTop();
  await wait(260);
};
H.revive = async function () { var p = heroPos(); FX.burst(p.x, p.y, { n: 60, colors: ['#ffd1f0', '#fff', '#ff9ad8'], shape: 'star', speed: [60, 280], g: -30, life: [0.8, 1.6] }); FX.float(p.x, p.y - 40, '妖精が現れた！', 'heal'); SFX.play('divine'); CUI.sync(); refreshTop(); await wait(700); };
H.skipEnemy = async function () { $('span', R.banner).textContent = '時が止まった'; R.banner.classList.remove('enemy'); R.banner.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1000 }); SFX.play('divine'); await wait(900); };
H.cardFlash = function () { };
H.combatEnd = function () { S.input = false; CUI.sync(); };
H.addCards_ = null;
/* run-level (outside combat) */
H.runGold = function (d) { refreshTop(); var g = document.getElementById('tbGold'); if (g && d.delta) { var c = FX.center(g); FX.float(c.x, c.y + 26, (d.delta > 0 ? '+' : '') + d.delta, 'gold'); SFX.play('coin'); } };
H.runHeal = function (d) { refreshTop(); if (d.amount) { toast('HPが' + d.amount + '回復した'); SFX.play('heal'); } };
H.runMaxHp = function (d) { refreshTop(); toast('最大HP' + (d.delta > 0 ? '+' : '') + d.delta); SFX.play(d.delta > 0 ? 'heal' : 'hurt'); };
H.runHurt = function (d) { refreshTop(); toast('HPを' + d.amount + '失った' + (d.result === 'revive' ? '……妖精の瓶で復活した' : '')); SFX.play('hurt'); var a = document.querySelector('.app'); FX.shake(a, 8, 300); };
H.runRelic = function (d) { refreshTop(); toast('秘宝「' + G.RELICS[d.id].name + '」を手に入れた'); };
H.runPotion = function (d) { refreshTop(); toast('秘薬「' + G.POTIONS[d.id].name + '」を手に入れた'); };
H.runCard = function (d) { refreshTop(); toast('「' + G.CARDS[d.card.id].name + (d.card.up ? '＋' : '') + '」をデッキに加えた'); SFX.play('card'); };
H.runCurse = function (d) { refreshTop(); if (d.blocked) toast('守り札が呪いを防いだ'); else { toast('呪い「' + G.CARDS[d.card.id].name + '」を受けた'); SFX.play('debuff'); } };
H.runRemove = function (d) { refreshTop(); toast(d.cards.map(function (c) { return '「' + G.CARDS[c.id].name + '」'; }).join('') + 'を取り除いた'); SFX.play('burn'); };
H.runUpgrade = function (d) { refreshTop(); toast(d.cards.map(function (c) { return '「' + G.CARDS[c.id].name + '」'; }).join('') + 'を強化した'); SFX.play('relic'); };
H.runTransform = function (d) { refreshTop(); toast((d.to.length ? d.to.map(function (c) { return '「' + G.CARDS[c.id].name + '」'; }).join('') : '新しいカード') + 'に変化した'); SFX.play('orb'); };
CUI.victoryFx = async function (fled) {
  var word = h('<div class="turn-banner" style="opacity:1"><span>' + (fled ? '退散' : '勝利') + '</span></div>');
  if (R.bf) R.bf.appendChild(word);
  var c = { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
  FX.burst(c.x, c.y, { n: 50, colors: ['#fff3c0', '#ffd27a', '#ff9a5a'], shape: 'star', speed: [120, 380], g: 140, life: [0.7, 1.4], size: [2, 5] });
  Object.keys(cardEls).forEach(function (k) { cardEls[k].style.transition = 'transform .4s ease-in, opacity .4s'; cardEls[k].style.transform += ' translateY(200px)'; cardEls[k].style.opacity = '0'; });
  await wait(1100);
};

/* ============================ boot ============================ */
function boot() {
  FX.init(document.getElementById('fx'), document.getElementById('floatLayer'));
  applySet();
  document.addEventListener('pointerdown', function once() { SFX.unlock(); if (S.screen === 'title') SFX.music('title'); document.removeEventListener('pointerdown', once); }, { once: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { SFX.setMusic(false); } else { SFX.setMusic(S.set.music); } });
  titleScreen();
}
G.UI = { S: S, CUI: CUI, io: io, titleScreen: titleScreen, cardHTML: cardHTML, modal: modal, confirmBox: confirmBox, showSettings: showSettings, showGlossary: showGlossary, showDeck: showDeck, mapHTML: mapHTML };
/* test hooks (used by automated checks; not reachable from the interface) */
G.UI.debug = {
  run: function (heroId, seed) { Game.clear(); var run = Game.newRun(heroId, seed); run.blessRed = true; run.phase = 'map'; S.run = run; S.game = new Game(run, io); return run; },
  fight: function (heroId, encId, seed) {
    var run = G.UI.debug.run(heroId, seed);
    var kind = encId.indexOf('b_') === 0 ? 'boss' : encId.indexOf('el_') === 0 ? 'elite' : 'enc';
    var room = { type: 'combat', kind: kind, encId: encId, nodeId: 'S' };
    run.room = room; run.phase = 'room';
    return combatRoom(room);
  },
  room: function (heroId, type, arg) {
    var run = G.UI.debug.run(heroId);
    var room = type === 'shop' ? { type: 'shop', shop: S.game.makeShop() } : type === 'treasure' ? { type: 'treasure', relic: S.game.drawRelic() } : type === 'event' ? { type: 'event', eventId: arg || run.eventDeck[0] } : { type: type };
    run.gold = 12; run.room = room; run.phase = 'room';
    return playRoom(room);
  },
  victory: function (heroId) { G.UI.debug.run(heroId); victoryScreen(); }
};
boot();
})();
