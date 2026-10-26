/* スレイザスパイア — battle director.
   The rules engine resolves a whole action at once. The director replays its events one by one, showing for each
   step the battlefield as it was at that moment (ev.vs) and an effect that says what happened: a card being
   played, a slash and the damage number, Block absorbing a hit, a token being applied, an enemy acting, dying...
   It also writes a readable battle log. Presentation only: never touches the run. */
(function (root) {
'use strict';
var STS = root.STS, V = STS.View, IB = root.IBARA || (root.IBARA = {});
var esc = V.esc;

var ICON = {
  shield: '<svg viewBox="0 0 24 24"><path d="M12 1.8l8.4 3.1v6.4c0 5.3-3.6 9.3-8.4 11-4.8-1.7-8.4-5.7-8.4-11V4.9z" fill="#3d8fdc" stroke="#e8f6ff" stroke-width="1.4"/><path d="M12 4.6l5.6 2.1v4.6c0 3.6-2.3 6.3-5.6 7.6z" fill="#bfe4ff" opacity=".5"/></svg>',
  broken: '<svg viewBox="0 0 24 24"><path d="M12 1.8l8.4 3.1v6.4c0 5.3-3.6 9.3-8.4 11-4.8-1.7-8.4-5.7-8.4-11V4.9z" fill="#2f5f8c" stroke="#e8f6ff" stroke-width="1.4"/><path d="M12.6 2.4l-2.2 6.2 3.4 2.2-2.6 5.6 1.2 5" fill="none" stroke="#0b1622" stroke-width="2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 2.5l7.5 8.5h-4.6v10.5H9.1V11H4.5z" fill="#ff8a45" stroke="#3a0e04" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 21.5l-7.5-8.5h4.6V2.5h5.8V13h4.6z" fill="#b97cf0" stroke="#1d0a33" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  poison: '<svg viewBox="0 0 24 24"><path d="M12 2.5c3.6 4.6 6.4 8.3 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.3 2.8-7 6.4-11.6z" fill="#69d43b" stroke="#12300a" stroke-width="1.3"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="#6cff8a" stroke="#0d3a16" stroke-width="1.2"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13.5 1.5L4.5 13.5h6l-1.5 9 9-12h-6z" fill="#ffd54a" stroke="#3a2a00" stroke-width="1.2" stroke-linejoin="round"/></svg>'
};
var TOKEN = {
  weak: { name: '脱力', cls: 'debuff', icon: 'down', why: 'アタックのダメージ−1' },
  vuln: { name: '弱体化', cls: 'debuff', icon: 'down', why: '受けるダメージ2倍' },
  psn: { name: '毒', cls: 'poison', icon: 'poison', why: 'ターン終了時にダメージ' }
};
var STANCE = { wrath: '憤怒', calm: '平静', divinity: '神性', none: 'スタンス解除' };
var ORB = { lightning: 'ライトニング', frost: 'フロスト', dark: 'ダーク' };

function Director(api) {
  this.api = api;
  this.q = [];
  this.busy = false;
  this.skipping = false;
  this.relics = [];
  this.ctx = {};
  this.lines = [];
  this.timer = null;
}
STS.Director = Director;

/* ------------------------------------------------------------------ queue */
Director.prototype.push = function (ev) {
  if (!ev || typeof ev !== 'object' || !ev.t) return;
  if (ev.t === 'relic') this.relics.push(ev);
  this.q.push(ev);
  if (this.q.length > 700) this.q.splice(0, this.q.length - 700);
  // Start after the engine has finished its current step (events arrive from inside the rules code).
  if (!this.busy && !this.sched) { var self = this; this.sched = true; setTimeout(function () { self.sched = false; if (!self.busy) self.pump(); }, 0); }
};
Director.prototype.idle = function () { return !this.busy; };
/* Events have arrived but the replay has not started yet: the page must keep showing the moment before them. */
Director.prototype.waiting = function () { return !this.busy && this.q.length > 0; };
Director.prototype.rate = function () { return Math.max(0.5, this.api.speed ? this.api.speed() : 1); };
/* Finish the current batch at once (tap during the enemy turn, or a command from the player). */
Director.prototype.skip = function () {
  if (!this.busy) return;
  this.skipping = true;
  if (this.timer) { clearTimeout(this.timer); this.timer = null; this.pump(); }
};
Director.prototype.pump = function () {
  var self = this;
  this.busy = true;
  var instant = this.api.instant && this.api.instant();
  while (this.q.length) {
    var ev = this.q.shift(), wait = 0;
    if (this.skipping || instant) { this.record(ev); this.trackCtx(ev); continue; }
    try { wait = this.play(ev) || 0; } catch (e) { if (root.console) console.error(e); }
    var ms = wait / this.rate();
    if (ms > 1 && !this.skipping) { this.timer = setTimeout(function () { self.timer = null; self.pump(); }, ms); return; }
  }
  this.busy = false; this.skipping = false; this.relics = []; this.ctx = {};
  this.caption(null);
  this.api.setView(null);
  this.api.draw();
  if (this.api.onIdle) this.api.onIdle();
};

/* ------------------------------------------------------------------ helpers */
function $(sel) { return document.querySelector('#app ' + sel); }
function foeEl(u) { return $('.foe[data-u="' + u + '"]'); }
function heroEl(i) { return $('.hero[data-pi="' + i + '"]'); }
function bodyOf(el) { return el ? (el.querySelector('.body') || el) : null; }
function rect(el) { return el ? el.getBoundingClientRect() : null; }
function mid(el, fy) { var r = rect(el); if (!r || (!r.width && !r.height)) return null; return { x: r.left + r.width / 2, y: r.top + r.height * (fy == null ? 0.5 : fy) }; }
function anim(el, frames, o) { if (!el || !el.animate) return null; try { return el.animate(frames, o); } catch (e) { return null; } }
function layer() { return document.getElementById('floatLayer'); }
function reduce() { return IB.FX && IB.FX.reduce; }

Director.prototype.ms = function (n) { return n / this.rate(); };
/* A floating label. kind: num (damage), blk, heal, buff, debuff, info, big */
Director.prototype.text = function (pt, text, kind, o) {
  var L = layer(); if (!L || !pt) return;
  o = o || {};
  var el = document.createElement('div');
  el.className = 'fxt fxt-' + (kind || 'info');
  el.innerHTML = (o.icon ? '<i>' + ICON[o.icon] + '</i>' : '') + '<span>' + esc(text) + '</span>' + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '');
  el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px';
  L.appendChild(el);
  var dx = (o.dx != null ? o.dx : (Math.random() * 2 - 1) * 14), dur = this.ms(o.dur || (kind === 'num' ? 1100 : 1250));
  var frames = kind === 'num' || kind === 'big'
    ? [{ transform: 'translate(-50%,-50%) translate(0,6px) scale(.35)', opacity: 0 }, { transform: 'translate(-50%,-50%) translate(' + dx * 0.3 + 'px,-22px) scale(1.35)', opacity: 1, offset: 0.16 },
       { transform: 'translate(-50%,-50%) translate(' + dx * 0.6 + 'px,-30px) scale(1)', opacity: 1, offset: 0.34 }, { transform: 'translate(-50%,-50%) translate(' + dx + 'px,-18px) scale(.95)', opacity: 1, offset: 0.78 },
       { transform: 'translate(-50%,-50%) translate(' + dx + 'px,-8px) scale(.9)', opacity: 0 }]
    : kind === 'debuff'
    ? [{ transform: 'translate(-50%,-50%) translate(0,-36px) scale(1.1)', opacity: 0 }, { transform: 'translate(-50%,-50%) translate(0,-6px) scale(1)', opacity: 1, offset: 0.2 },
       { transform: 'translate(-50%,-50%) translate(0,0) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) translate(0,10px) scale(.96)', opacity: 0 }]
    : [{ transform: 'translate(-50%,-50%) translate(0,10px) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) translate(0,-8px) scale(1.08)', opacity: 1, offset: 0.16 },
       { transform: 'translate(-50%,-50%) translate(0,-16px) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) translate(0,-34px) scale(.98)', opacity: 0 }];
  var a = anim(el, frames, { duration: dur, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'forwards' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, dur);
};
/* A large icon popping over a body (shield, arrows...). */
Director.prototype.icon = function (pt, name, cls, size) {
  var L = layer(); if (!L || !pt) return;
  var el = document.createElement('div');
  el.className = 'fxi ' + (cls || '');
  el.innerHTML = ICON[name] || '';
  var s = size || 46;
  el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; el.style.width = s + 'px'; el.style.height = s + 'px';
  L.appendChild(el);
  var frames = cls === 'drop'
    ? [{ transform: 'translate(-50%,-50%) translateY(-40px) scale(.9)', opacity: 0 }, { transform: 'translate(-50%,-50%) translateY(0) scale(1.1)', opacity: 1, offset: 0.35 }, { transform: 'translate(-50%,-50%) translateY(4px) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) translateY(12px) scale(.9)', opacity: 0 }]
    : cls === 'rise'
    ? [{ transform: 'translate(-50%,-50%) translateY(20px) scale(.7)', opacity: 0 }, { transform: 'translate(-50%,-50%) translateY(-4px) scale(1.12)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-50%) translateY(-24px) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) translateY(-44px) scale(.9)', opacity: 0 }]
    : [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.65 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0 }];
  var a = anim(el, frames, { duration: this.ms(780), easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, 780);
};
/* A shield with a number inside: Block gained (+n), or how much of a hit the Block absorbed (cracked when it broke). */
Director.prototype.chip = function (pt, n, kind, size) {
  var L = layer(); if (!L || !pt) return;
  var el = document.createElement('div');
  el.className = 'fxi fx-chip ' + (kind || 'gain');
  var s = size || 52;
  el.innerHTML = ICON[kind === 'break' ? 'broken' : 'shield'] + '<b>' + esc(String(n)) + '</b>';
  el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; el.style.width = s + 'px'; el.style.height = s + 'px';
  el.style.fontSize = Math.round(s * (String(n).length > 2 ? 0.34 : 0.42)) + 'px';
  L.appendChild(el);
  var dur = this.ms(kind === 'gain' ? 900 : 1050);
  var frames = kind === 'break'
    ? [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.22)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
       { transform: 'translate(-50%,-50%) translateY(2px) rotate(-6deg) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) translateY(16px) rotate(-14deg) scale(.92)', opacity: 0 }]
    : [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.22)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
       { transform: 'translate(-50%,-50%) translateY(-6px) scale(1)', opacity: 1, offset: 0.78 }, { transform: 'translate(-50%,-50%) translateY(-14px) scale(.96)', opacity: 0 }];
  var a = anim(el, frames, { duration: dur, easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, dur);
};
/* Brief pulse on the Block badge of an HP bar, so the eye goes to the number that changed. */
function pulseBadge(owner) {
  var b = owner && owner.querySelector('.blkbadge');
  if (b) anim(b, [{ transform: 'translateY(-50%) scale(1)' }, { transform: 'translateY(-50%) scale(1.45)', filter: 'brightness(1.8)', offset: 0.3 }, { transform: 'translateY(-50%) scale(1)' }], { duration: 520, easing: 'ease-out' });
}
/* Clone a DOM element into the effect layer at its place (for things that disappear from the page). */
function ghost(el, cls) {
  var L = layer(); if (!L || !el) return null;
  var r = rect(el); if (!r || !r.width) return null;
  var g = el.cloneNode(true);
  g.removeAttribute('data-a'); g.removeAttribute('data-u'); g.removeAttribute('data-pi'); g.removeAttribute('id');
  var w = document.createElement('div');
  w.className = 'fx-ghost ' + (cls || '');
  w.style.left = r.left + 'px'; w.style.top = r.top + 'px'; w.style.width = r.width + 'px'; w.style.height = r.height + 'px';
  w.appendChild(g);
  L.appendChild(w);
  return { el: w, r: r };
}
function flash(el, color, dur) {
  return anim(el, [{ filter: 'brightness(1)' }, { filter: color === 'white' ? 'brightness(2.6) saturate(.2)' : color === 'red' ? 'brightness(1.4) sepia(1) saturate(6) hue-rotate(-30deg)' : color === 'blue' ? 'brightness(1.5) sepia(1) saturate(5) hue-rotate(170deg)' : color === 'green' ? 'brightness(1.3) sepia(1) saturate(5) hue-rotate(60deg)' : 'brightness(1.6)', offset: 0.25 }, { filter: 'brightness(1)' }], { duration: dur || 320, easing: 'ease-out' });
}
function shake(el, mag, dur) {
  if (!el || reduce()) return;
  var k = [];
  for (var i = 0; i < 7; i++) { var m = mag * (1 - i / 7); k.push({ transform: 'translate(' + ((Math.random() * 2 - 1) * m).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * m * 0.4).toFixed(1) + 'px)' }); }
  k.push({ transform: 'translate(0,0)' });
  anim(el, k, { duration: dur || 300 });
}
function lunge(el, dx, dur) {
  if (!el || reduce()) return;
  anim(el, [{ transform: 'translate(0,0)' }, { transform: 'translate(' + (-dx * 0.18) + 'px,0)', offset: 0.25 }, { transform: 'translate(' + dx + 'px,-4px)', offset: 0.55 }, { transform: 'translate(0,0)' }],
    { duration: dur || 360, easing: 'cubic-bezier(.3,.6,.3,1)' });
}
function recoil(el, dx) {
  if (!el || reduce()) return;
  anim(el, [{ transform: 'translate(0,0)' }, { transform: 'translate(' + dx + 'px,0) rotate(' + (dx > 0 ? 2 : -2) + 'deg)', offset: 0.2 }, { transform: 'translate(' + (-dx * 0.3) + 'px,0)', offset: 0.55 }, { transform: 'translate(0,0)' }],
    { duration: 380, easing: 'ease-out' });
}
/* Where to show a hit on a body: the Block shield on the left half, the HP damage number on the right half
   (both at the centre when only one of them is shown), so the two numbers never sit on top of each other. */
function hitPoints(body, both) {
  var r = rect(body), c = mid(body, 0.42);
  if (!c) return { shield: null, num: null };
  var w = r && r.width ? Math.max(56, Math.min(150, r.width)) : 80;
  if (!both) return { shield: c, num: c };
  var vw = window.innerWidth || 1000, sx = c.x - w * 0.26, nx = c.x + w * 0.24;
  // keep both inside the screen (heroes stand at the left edge)
  if (sx < 34) { nx += 34 - sx; sx = 34; }
  if (nx > vw - 26) { sx -= nx - (vw - 26); nx = vw - 26; }
  return { shield: { x: sx, y: c.y }, num: { x: nx, y: c.y - 4 } };
}
/* A point for a short label over a body: a little above p, but never above the body's top edge
   (small enemies would otherwise put it on their forecast bubble). */
function labelAt(body, p, off) {
  if (!p) return null;
  var r = rect(body), y = p.y - off;
  if (r && r.height) y = Math.max(r.top + 14, y);
  return { x: p.x, y: y };
}
function burst(pt, o) { if (IB.FX && pt) IB.FX.burst(pt.x, pt.y, o); }
function ring(pt, o) { if (IB.FX && pt) IB.FX.ring(pt.x, pt.y, o); }
function slash(pt, o) { if (IB.FX && pt) IB.FX.slash(pt.x, pt.y, o); }
function vignette(color) {
  var L = layer(); if (!L) return;
  var v = document.createElement('div'); v.className = 'fx-vignette ' + (color || 'red'); L.appendChild(v);
  var a = anim(v, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
  if (a) a.onfinish = function () { v.remove(); }; else setTimeout(function () { v.remove(); }, 520);
}

/* Caption: one plain sentence describing the step being shown. */
Director.prototype.caption = function (text, kind) {
  var L = layer(); if (!L) return;
  var el = L.querySelector('.fx-caption');
  clearTimeout(this.capT);
  if (!text) { if (el) { el.classList.remove('on'); } return; }
  if (!el) { el = document.createElement('div'); el.className = 'fx-caption'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); L.appendChild(el); }
  var f = document.querySelector('#app .field-scroll');
  var r = rect(f);
  if (r && r.width) { el.style.top = (r.top + 6) + 'px'; el.style.left = (r.left + r.width / 2) + 'px'; el.style.maxWidth = Math.max(220, r.width - 16) + 'px'; }
  el.className = 'fx-caption on ' + (kind || '');
  el.innerHTML = text;
  var self = this;
  this.capT = setTimeout(function () { el.classList.remove('on'); }, this.ms(2600));
};
Director.prototype.banner = function (title, sub, cls) {
  var L = layer(); if (!L) return;
  Array.prototype.forEach.call(L.querySelectorAll('.fx-banner'), function (x) { x.remove(); });
  var b = document.createElement('div');
  b.className = 'fx-banner ' + (cls || '');
  b.innerHTML = '<div class="fx-band"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  L.appendChild(b);
  var dur = this.ms(1250);
  var a = anim(b, [{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)', offset: 0.14 }, { opacity: 1, transform: 'scaleY(1)', offset: 0.78 }, { opacity: 0, transform: 'scaleY(.6)' }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { b.remove(); }; else setTimeout(function () { b.remove(); }, dur);
};

/* ------------------------------------------------------------------ names and log */
Director.prototype.who = function (i) { return this.api.playerName(i); };
Director.prototype.foeName = function (u) { return this.api.enemyName(u); };
Director.prototype.cardName = function (card) { var d = STS.CARDS[card.id]; return d ? d.name + (card.up ? '+' : '') : card.id; };
Director.prototype.addLine = function (text, kind) {
  var r = this.api.round ? this.api.round() : 0;
  this.lines.push({ r: r, text: text, kind: kind || '' });
  if (this.lines.length > 300) this.lines.splice(0, this.lines.length - 300);
};
/* Readable log line for one event (also used when animations are skipped). */
Director.prototype.record = function (ev) {
  var t = ev.t, me = this.api.me();
  switch (t) {
    case 'combatStart': this.lines = []; this.addLine('戦闘開始', 'sys'); break;
    case 'round': this.addLine('― ラウンド' + ev.n + ' ―', 'sys'); break;
    case 'dieFinal': this.addLine('行動ダイスの出目：' + ev.v, 'sys'); break;
    case 'play': this.addLine(this.who(ev.i) + '：「' + this.cardName(ev.card) + '」を使った', 'play'); break;
    case 'copy': this.addLine('「' + this.cardName(ev.card) + '」の効果をもう一度', 'play'); break;
    case 'log': if (ev.cb && !ev.quiet && ev.msg) this.addLine(ev.msg, 'sys'); break;
    case 'dieRelic': this.addLine(this.who(ev.i) + '：' + (relicName(ev.id) || ev.id) + 'が発動', 'relic'); break;
    case 'edmg': this.addLine((ev.src ? ev.src + '：' : '') + this.foeName(ev.u) + 'に' + ev.n + 'ダメージ' + (ev.blocked ? '（ブロックで' + ev.blocked + '防がれ、HP−' + ev.hp + '）' : '（HP−' + ev.hp + '）'), 'hit'); break;
    case 'die': if (ev.u != null) this.addLine(this.foeName(ev.u) + 'を倒した', 'kill'); break;
    case 'eact': this.addLine(this.foeName(ev.u) + 'の行動：' + (ev.name || '—'), 'enemy'); break;
    case 'pdmg': this.addLine((ev.why ? ev.why + '：' : '') + this.who(ev.i) + 'に' + ev.n + 'ダメージ' + (ev.blocked ? '：ブロックで' + ev.blocked + '防いだ' + (ev.n - ev.blocked > 0 ? '（HP−' + (ev.n - ev.blocked) + '）' : '（HPは減らない）') : ''), 'hurt'); break;
    case 'hp': if (ev.n < 0 && !this.ctx.pdmgOpen) this.addLine(this.who(ev.i) + 'はHPを' + (-ev.n) + '失った' + (ev.why ? '（' + ev.why + '）' : ''), 'hurt'); break;
    case 'heal': this.addLine(this.who(ev.i) + 'はHPを' + ev.n + '回復', 'heal'); break;
    case 'blk': if (ev.n > 0) this.addLine(this.who(ev.i) + '：ブロック+' + ev.n, 'blk'); break;
    case 'eblk': this.addLine(this.foeName(ev.u) + '：ブロック' + (ev.n ? '+' + ev.n : 'を得た') + (ev.why ? '（' + ev.why + '）' : ''), 'enemy'); break;
    case 'tok': this.addLine(this.foeName(ev.u) + 'に' + (TOKEN[ev.k] || {}).name, 'debuff'); break;
    case 'ptok': this.addLine(this.who(ev.i) + 'は' + (TOKEN[ev.k] || {}).name + 'を受けた', 'debuff'); break;
    case 'str': if (ev.n) this.addLine(this.who(ev.i) + '：筋力' + (ev.n > 0 ? '+' : '') + ev.n, 'buff'); break;
    case 'estr': this.addLine(this.foeName(ev.u) + '：筋力アップ', 'enemy'); break;
    case 'poison': this.addLine(this.foeName(ev.u) + '：毒のダメージ', 'debuff'); break;
    case 'spawn': this.addLine(this.foeName(ev.u) + 'が現れた', 'enemy'); break;
    case 'flee': this.addLine(this.foeName(ev.u) + 'が逃げた', 'enemy'); break;
    case 'stance': this.addLine(this.who(ev.i) + '：' + STANCE[ev.s], 'buff'); break;
    case 'channel': this.addLine(this.who(ev.i) + '：' + ORB[ev.o] + 'を生成', 'buff'); break;
    case 'evoke': this.addLine(this.who(ev.i) + '：' + ORB[ev.o] + 'を解放', 'buff'); break;
    case 'status': this.addLine(this.who(ev.i) + 'のデッキに「' + ((STS.CARDS[ev.id] || {}).name || ev.id) + '」×' + ev.n, 'debuff'); break;
    case 'exhaust': break;
    case 'power': this.addLine(this.who(ev.i) + '：パワー「' + ((STS.CARDS[ev.id] || {}).name || '') + '」が場に出た', 'play'); break;
    case 'usePotion': this.addLine(this.who(ev.i) + '：' + ((STS.POTIONS[ev.id] || {}).name || '') + 'を使った', 'play'); break;
    case 'relic': this.addLine(this.who(ev.i) + '：' + (relicName(ev.id) || 'キャラクター能力') + 'が発動', 'relic'); break;
    case 'buffer': this.addLine(this.who(ev.i) + '：バッファーでHPの減少を防いだ', 'blk'); break;
    case 'enemyTurn': this.addLine('― 敵のターン ―', 'sys'); break;
    case 'facing': this.addLine(this.who(ev.i) + '：対面効果「' + (V.FACING[ev.k] || '') + '」', 'debuff'); break;
    case 'pdead': this.addLine(this.who(ev.i) + 'は倒れた', 'hurt'); break;
    case 'combatEnd': this.addLine(ev.result === 'victory' ? '勝利！' : '敗北…', 'sys'); break;
    case 'shivUse': this.addLine(this.who(ev.i) + '：ナイフを投げた', 'play'); break;
  }
  if (t === 'pdmg') this.ctx.pdmgOpen = true;
  else if (t !== 'hp') this.ctx.pdmgOpen = false;
};
Director.prototype.trackCtx = function (ev) {
  var c = this.ctx;
  if (ev.t === 'play' || ev.t === 'copy') { c.card = ev.card; c.by = ev.i; c.lunged = false; c.attack = (STS.CARDS[ev.card.id] || {}).t === 'A'; c.poison = null; c.enemy = null; }
  else if (ev.t === 'shivUse') { c.card = { id: 'Shiv' }; c.by = ev.i; c.lunged = false; c.attack = true; c.poison = null; }
  else if (ev.t === 'eact') { c.enemy = ev.u; c.card = null; c.attack = false; c.poison = null; }
  else if (ev.t === 'poison') c.poison = ev.u;
  else if (ev.t === 'endTurn' || ev.t === 'enemyTurn' || ev.t === 'round') { c.card = null; c.attack = false; c.enemy = null; c.poison = null; }
};

/* Relics are named after the effects they caused; show each when its first effect plays. */
Director.prototype.relicFor = function (n) {
  if (n == null) return;
  for (var i = 0; i < this.relics.length; i++) {
    var r = this.relics[i];
    if (!r.shown && r.first <= n) { r.shown = true; this.showRelic(r); }
  }
};
/* Relic names, including the character abilities that are shown as relics (Burning Blood, Cracked Core...). */
var ABILITY_OF = { BurningBlood: 'R', RingOfTheSnake: 'G', CrackedCore: 'B', Miracles: 'W' };
function relicName(id) {
  var d = STS.RELICS[id];
  if (d && d.name) return d.name;
  var ch = ABILITY_OF[id], ab = ch && STS.ABILITIES && STS.ABILITIES[ch];
  return ab ? ab.name : '';
}
Director.prototype.showRelic = function (r) {
  var name = relicName(r.id);
  if (!name) return;
  var mine = r.i === this.api.me();
  var icon = mine ? $('.relicbar .relic[data-rid="' + r.id + '"]') : null;
  if (icon) { anim(icon, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.45)', filter: 'brightness(1.8) drop-shadow(0 0 6px #ffe39a)', offset: 0.3 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: this.ms(700) }); }
  var h = heroEl(r.i);
  var p = mid(h, 0.05);
  if (p && layer()) {
    var el = document.createElement('div');
    el.className = 'fx-relic';
    el.innerHTML = '<img src="' + V.relicImg(r.id) + '" alt=""><span>' + esc(name) + '</span>';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    layer().appendChild(el);
    var a = anim(el, [{ opacity: 0, transform: 'translate(-50%,-30%) scale(.7)' }, { opacity: 1, transform: 'translate(-50%,-80%) scale(1)', offset: 0.18 }, { opacity: 1, transform: 'translate(-50%,-95%) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-120%) scale(.95)' }], { duration: this.ms(1300), fill: 'forwards' });
    if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, 1300);
  }
  this.api.sfx('relic');
};

/* ------------------------------------------------------------------ one step */
Director.prototype.play = function (ev) {
  var t = ev.t, api = this.api, me = api.me(), self = this;
  this.record(ev);
  if (t === 'relic') { if (!ev.shown) { ev.shown = true; this.showRelic(ev); } this.relics = this.relics.filter(function (r) { return r !== ev; }); return 0; }
  if (t === 'log') {
    // Special abilities and changes of state (激怒, 再生, モード移行…) are named on screen while they happen.
    if (ev.cb && !ev.quiet && ev.msg) { this.caption(esc(ev.msg), 'sys'); return 680; }
    return 0;
  }
  if (t === 'ready' && !ev.vs) return 0;
  var c = this.ctx;
  // Things that are about to disappear from the page are captured before the frame changes.
  var pre = {};
  if (t === 'play' && ev.i === me) pre.card = $('.hand .card[data-u="' + ev.card.u + '"]');
  if ((t === 'discard' || t === 'exhaust') && ev.i === me) pre.card = $('.hand .card[data-u="' + ev.u + '"]');
  if ((t === 'die' && ev.u != null) || t === 'flee') pre.foe = foeEl(ev.u);
  if (pre.card) pre.cardGhost = ghost(pre.card, t === 'play' ? 'card-play' : t === 'exhaust' ? 'card-burn' : 'card-discard');
  if (pre.foe) pre.foeGhost = ghost(bodyOf(pre.foe), t === 'flee' ? 'foe-flee' : 'foe-death');
  if (ev.vs) { api.setView({ vs: ev.vs, t: t }); api.draw(); }
  this.relicFor(ev.sq);
  this.trackCtx(ev);
  var F = this['on_' + t];
  var w = F ? F.call(this, ev, pre, me) : 0;
  return w || 0;
};

/* ------------------------------------------------------------------ effects by event */
var D = Director.prototype;
D.on_combatStart = function () { this.api.sfx('open'); this.banner('戦闘開始', null, 'start'); return 520; };
D.on_round = function (ev) {
  var party = this.api.partySize() > 1;
  this.banner(party ? '全員のターン' : 'あなたのターン', 'ラウンド ' + ev.n, 'player');
  this.api.sfx('turn');
  return 650;
};
D.on_die = function (ev, pre) {
  if (ev.u == null) {
    // shared action die
    var d = $('.battle-die .dieface');
    if (d && !reduce()) anim(d, [{ transform: 'rotate(-320deg) scale(.4)', opacity: 0.3 }, { transform: 'rotate(20deg) scale(1.25)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: this.ms(560), easing: 'ease-out' });
    this.api.sfx('die');
    if (ev.reactive) { this.caption('のたうつ塊がダイスを振り直した：出目 <b>' + ev.v + '</b>', 'enemy'); return 520; }
    this.caption('行動ダイス：出目 <b>' + ev.v + '</b> → 敵の行動が決まった', 'sys');
    return 420;
  }
  // an enemy dies
  var g = pre.foeGhost;
  if (g) {
    var p = { x: g.r.left + g.r.width / 2, y: g.r.top + g.r.height * 0.55 };
    anim(g.el, [{ opacity: 1, filter: 'brightness(1)', transform: 'none' }, { opacity: 1, filter: 'brightness(2.2) saturate(.2)', transform: 'translateY(-2px)', offset: 0.15 },
      { opacity: 0, filter: 'brightness(.3) blur(3px)', transform: 'translateY(14px) scale(.94)' }], { duration: this.ms(700), easing: 'ease-in', fill: 'forwards' });
    setTimeout(function () { g.el.remove(); }, this.ms(720));
    burst(p, { n: 26, colors: ['#ffffff', '#ffd8b0', '#b98a6a', '#4b3a33'], speed: [60, 240], life: [0.4, 0.9], g: 120, size: [2, 5] });
    this.text({ x: p.x, y: g.r.top + 10 }, '撃破', 'big', { dur: 900 });
  }
  this.api.sfx('death');
  this.caption(esc(this.foeName(ev.u)) + 'を倒した！', 'kill');
  return 460;
};
D.on_dieMod = function (ev) { this.caption('出目が <b>' + ev.v + '</b> に変わった', 'sys'); var d = $('.battle-die .dieface'); flash(d, 'white', 400); return 320; };
D.on_dieFinal = function () { return 0; };
D.on_dieRelic = function (ev) { this.showRelic({ i: ev.i, id: ev.id }); return 320; };
D.on_draw = function (ev, pre, me) { if (ev.i !== me) return 0; this.api.sfx('draw'); return 85; };
D.on_shuffle = function (ev, pre, me) {
  if (ev.i !== me) return 0;
  var from = mid($('.pile[data-v=disc]')), to = mid($('.pile[data-v=draw]'));
  if (from && to) for (var k = 0; k < 4; k++) this.flyBack(from, to, k * 60);
  this.api.sfx('shuffle');
  this.caption('捨て札をシャッフルして山札にした', 'sys');
  return 360;
};
D.flyBack = function (from, to, delay) {
  var L = layer(); if (!L) return;
  var el = document.createElement('div'); el.className = 'fx-cardback'; el.style.left = from.x + 'px'; el.style.top = from.y + 'px'; L.appendChild(el);
  var a = anim(el, [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) translate(' + (to.x - from.x) * 0.5 + 'px,' + ((to.y - from.y) * 0.5 - 40) + 'px) rotate(-90deg) scale(.8)', opacity: 1, offset: 0.5 },
    { transform: 'translate(-50%,-50%) translate(' + (to.x - from.x) + 'px,' + (to.y - from.y) + 'px) rotate(-180deg) scale(.6)', opacity: 0 }], { duration: this.ms(480), delay: this.ms(delay), easing: 'ease-in-out', fill: 'both' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, 600);
};
D.on_play = function (ev, pre, me) {
  var d = STS.CARDS[ev.card.id] || {}, name = this.cardName(ev.card);
  this.api.sfx('card');
  if (ev.i === me && pre.cardGhost) {
    var g = pre.cardGhost, f = rect($('.field-scroll'));
    var tx = f && f.width ? f.left + f.width * 0.5 : g.r.left, ty = f && f.width ? f.top + f.height * 0.36 : g.r.top - 120;
    var dx = tx - (g.r.left + g.r.width / 2), dy = ty - (g.r.top + g.r.height / 2);
    var dest = d.t === 'P' ? $('.hero[data-pi="' + me + '"]') : $('.pile[data-v=disc]');
    var dm = mid(dest) || { x: g.r.right, y: g.r.bottom };
    var ex = dm.x - (g.r.left + g.r.width / 2), ey = dm.y - (g.r.top + g.r.height / 2);
    var big = Math.min(1.5, 170 / Math.max(60, g.r.width));
    anim(g.el, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + big + ')', opacity: 1, offset: 0.28 },
      { transform: 'translate(' + dx + 'px,' + (dy - 6) + 'px) scale(' + big + ')', opacity: 1, offset: 0.62 },
      { transform: 'translate(' + ex + 'px,' + ey + 'px) scale(.25) rotate(' + (d.t === 'P' ? 0 : 12) + 'deg)', opacity: 0 }],
      { duration: this.ms(980), easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' });
    setTimeout(function () { g.el.remove(); }, this.ms(1000));
  } else if (ev.i !== me) {
    this.mini(ev.i, ev.card);
  }
  this.caption('<b>' + esc(this.who(ev.i)) + '</b>：「' + esc(name) + '」', 'play');
  return ev.i === me ? 260 : 380;
};
/* A small copy of the card another player used, above their hero. */
D.mini = function (i, card) {
  var h = heroEl(i), p = mid(h, 0.1), L = layer(); if (!p || !L) return;
  var w = document.createElement('div'); w.className = 'fx-mini'; w.innerHTML = V.card({ id: card.id, up: card.up }, { attrs: 'tabindex="-1"', cls: 'fx-card' });
  w.style.left = p.x + 'px'; w.style.top = p.y + 'px'; L.appendChild(w);
  var a = anim(w, [{ opacity: 0, transform: 'translate(-50%,-60%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: 0.18 }, { opacity: 1, transform: 'translate(-50%,-104%) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-110%) scale(.9)' }], { duration: this.ms(1300), fill: 'forwards' });
  if (a) a.onfinish = function () { w.remove(); }; else setTimeout(function () { w.remove(); }, 1300);
  if (this.api.fitCards) this.api.fitCards(w);
};
D.on_copy = function (ev) { var p = mid(heroEl(ev.i), 0.1); this.text(p, 'もう一度！', 'buff'); this.caption('「' + esc(this.cardName(ev.card)) + '」の効果をもう一度', 'play'); return 280; };
D.on_shivUse = function (ev) {
  var h = mid(heroEl(ev.i), 0.45), f = mid(bodyOf(foeEl(ev.u)), 0.5);
  if (h && f && IB.FX) IB.FX.streak(h.x, h.y, f.x, f.y, { color: '#e9f6ff', w: 3, life: 0.2 });
  this.api.sfx('shiv');
  return 120;
};
D.on_edmg = function (ev) {
  var c = this.ctx, fe = foeEl(ev.u), body = bodyOf(fe), p = mid(body, 0.5), me = this.api.me();
  // Who dealt it: an explicit source from the engine (relic, power, orb, potion), poison, or the card being played.
  var poison = c.poison === ev.u && !ev.src, byCard = !ev.src && c.card && c.attack && c.by != null && !poison;
  if (byCard && !c.lunged) { c.lunged = true; lunge(bodyOf(heroEl(c.by)), 26, this.ms(300)); }
  if (poison) {
    burst(p, { n: 16, colors: ['#9dff6a', '#5ccf2e', '#d8ffb8'], shape: 'bubble', speed: [20, 90], g: -60, life: [0.5, 1], size: [3, 7], add: false });
    flash(body, 'green', this.ms(380));
  } else if (byCard) {
    slash(p, { r: Math.max(34, (rect(body) || { width: 80 }).width * 0.42), color: c.card && c.card.id === 'Shiv' ? '#dff3ff' : '#fff1d0', w: 7 });
    burst(p, { n: 12, colors: ['#ffffff', '#ffd9a0', '#ff9a5a'], speed: [120, 320], life: [0.2, 0.45], g: 200 });
    flash(body, 'white', this.ms(260));
  } else {
    var zap = ev.src && /ライトニング/.test(ev.src);
    if (ev.src && ev.by != null && IB.FX && p) {
      // a line from the player whose relic / power / orb / potion dealt it
      var h = mid(bodyOf(heroEl(ev.by)), zap ? 0.15 : 0.4);
      if (h) IB.FX.streak(h.x, h.y, p.x, p.y, { color: zap ? '#fff27a' : '#ffe8c0', w: zap ? 4 : 3, life: 0.28 });
    }
    burst(p, { n: 12, colors: zap ? ['#ffffff', '#fff27a', '#ffd040'] : ['#ffffff', '#c8e8ff', '#ffe08a'], speed: [80, 240], life: [0.25, 0.55], g: 120 });
    flash(body, 'white', this.ms(260));
    if (ev.src) this.text(labelAt(body, mid(body, 0.2), 0), ev.src, 'info', { dx: 0, dur: 1100 });
  }
  if (ev.hp > 0) recoil(body, 10);
  var pts = hitPoints(body, ev.blocked > 0 && ev.hp > 0);
  if (ev.blocked > 0) {
    // The shield shows how much the Block absorbed (cracked if it broke); the HP bar's badge pulses.
    this.chip(pts.shield, ev.blocked, ev.hp > 0 ? 'break' : 'absorb', 46);
    ring(pts.shield, { color: '#8fd2ff', r0: 6, r1: 50, w: 3, life: 0.35 });
    pulseBadge(fe);
    this.api.sfx('blocked');
  }
  if (ev.hp > 0) { this.text(pts.num, String(ev.hp), poison ? 'num psn' : 'num', { dx: 8 }); this.api.sfx(ev.hp >= 6 ? 'bighit' : 'hit', ev.hp / 3); }
  else if (!ev.blocked) { this.text(p, ev.n > 0 ? '0' : '無効', 'info'); this.api.sfx('blocked'); }
  else if (pts.shield) this.text({ x: pts.shield.x, y: pts.shield.y - 40 }, 'ブロックされた', 'blkword');
  var who = poison ? '毒' : ev.src ? ev.src
    : c.card && c.by != null ? this.who(c.by) + '「' + (c.card.id === 'Shiv' ? 'ナイフ' : this.cardName(c.card)) + '」' : '効果';
  this.caption(esc(this.foeName(ev.u)) + 'に <b>' + ev.n + '</b> ダメージ' + (ev.blocked ? (ev.hp > 0 ? '（ブロックで' + ev.blocked + '防がれ、HP−' + ev.hp + '）' : '：すべて<b class="c-blk">ブロックされた</b>') : '') + '<small>' + esc(who) + '</small>', ev.blocked && !ev.hp ? 'blk' : 'hit');
  return byCard ? 300 : 260;
};
D.on_poison = function () { return 60; };
D.on_eact = function (ev) {
  var fe = foeEl(ev.u), it = fe && fe.querySelector('.intent'), shown = it && rect(it) && rect(it).width > 0;
  var body = bodyOf(fe);
  if (shown) {
    // The forecast bubble already names the action: light it up instead of covering it with another label.
    anim(it, [{ transform: 'scale(1)', filter: 'brightness(1)', boxShadow: '0 0 0 0 #ffd08a00, 0 5px 14px #000b' },
      { transform: 'scale(1.14)', filter: 'brightness(1.45)', boxShadow: '0 0 0 3px #ffd08a, 0 0 22px #ffb45acc', offset: 0.3 },
      { transform: 'scale(1.06)', filter: 'brightness(1.2)', boxShadow: '0 0 0 2px #ffd08acc, 0 0 16px #ffb45a88', offset: 0.75 },
      { transform: 'scale(1)', filter: 'brightness(1)', boxShadow: '0 0 0 0 #ffd08a00, 0 5px 14px #000b' }], { duration: this.ms(1100), easing: 'ease-out' });
  } else {
    var p = mid(body, 0.05);
    if (p) this.text({ x: p.x, y: p.y - 2 }, ev.name || '行動', 'act', { dx: 0, dur: 1300 });
  }
  flash(body, 'bright', this.ms(300));
  this.caption('<b>' + esc(this.foeName(ev.u)) + '</b>の行動：' + esc(ev.name || '—'), 'enemy');
  this.api.sfx('enemyturn');
  return 520;
};
D.on_ehit = function (ev) {
  var fb = bodyOf(foeEl(ev.u)), hb = bodyOf(heroEl(ev.i));
  var a = mid(fb), b = mid(hb);
  var dx = a && b ? Math.max(-90, Math.min(-18, (b.x - a.x) * 0.22)) : -30;
  lunge(fb, dx, this.ms(330));
  this.api.sfx('slash');
  var self = this;
  setTimeout(function () { var bp = mid(hb, 0.45); if (bp) slash(bp, { r: 40, color: '#ffb8a0', a0: -0.6, a1: 2.2, w: 6 }); }, this.ms(170));
  return 230;
};
D.on_pdmg = function (ev) {
  var he = heroEl(ev.i), body = bodyOf(he), p = mid(body, 0.42);
  var lost = ev.n - ev.blocked;
  this.lastShield = null;
  if (ev.blocked > 0) {
    var pts = hitPoints(body, lost > 0);
    // The shield shows how much the Block absorbed; it cracks when the hit went through.
    this.chip(pts.shield, ev.blocked, lost > 0 ? 'break' : 'absorb', 56);
    ring(pts.shield, { color: '#8fd2ff', r0: 10, r1: 70, w: 4, life: 0.4 });
    burst(pts.shield, { n: 10, colors: ['#cfeaff', '#8fd2ff', '#ffffff'], speed: [80, 220], life: [0.25, 0.5], g: 100 });
    pulseBadge(he);
    flash(body, 'blue', this.ms(320));
    this.api.sfx('blocked');
    if (lost <= 0) { if (pts.shield) this.text({ x: pts.shield.x, y: pts.shield.y - 44 }, 'ブロック！', 'blkword', { dur: 1200 }); }
    else if (pts.num) this.lastShield = { i: ev.i, pt: pts.num };
  }
  if (ev.n <= 0) this.text(p, '0', 'info');
  // What dealt it: an ability (激怒, トゲ, 死の鼓動, 火傷…) or the enemy that is acting.
  var from = ev.why ? (ev.u != null ? this.foeName(ev.u) + '：' : '') + ev.why : ev.u != null ? this.foeName(ev.u) : this.ctx.enemy != null ? this.foeName(this.ctx.enemy) : '';
  if (ev.why && body) this.text(labelAt(body, mid(body, 0.15), 0), ev.why, 'debuff', { dur: 1200 });
  this.caption(esc(this.who(ev.i)) + 'へ <b>' + ev.n + '</b> ダメージ' + (ev.blocked ? (lost > 0 ? '：ブロックで' + ev.blocked + '防ぎ、HP−' + lost : '：<b class="c-blk">ブロックですべて防いだ</b>') : '：ブロックなし') + (from ? '<small>' + esc(from) + '</small>' : ''), lost > 0 ? 'hurt' : 'blk');
  return lost > 0 ? 110 : 360;
};
D.on_hp = function (ev, pre, me) {
  if (ev.n >= 0) return 0;
  var he = heroEl(ev.i), body = bodyOf(he), p = mid(body, 0.4);
  if (!p) { var st = $('.stat.hp'); p = mid(st); }
  // Right after a Block shield for the same hit, the number goes beside the shield instead of on top of it.
  var at = this.lastShield && this.lastShield.i === ev.i ? this.lastShield.pt : p;
  this.lastShield = null;
  this.text(at, String(-ev.n), 'num hurt', { dx: 6 });
  if (!this.ctx.pdmgOpen) {
    // HP lost without a hit (a card's cost, 苦痛…): say so, since there is no damage step before it.
    var c = this.ctx, why = ev.why || (c.card && c.by === ev.i ? '「' + this.cardName(c.card) + '」' : '');
    if (ev.why && body) this.text(labelAt(body, mid(body, 0.15), 0), ev.why, 'debuff', { dur: 1200 });
    this.caption(esc(this.who(ev.i)) + 'はHPを <b>' + (-ev.n) + '</b> 失った' + (why ? '<small>' + esc(why) + '</small>' : ''), 'hurt');
  }
  flash(body, 'red', this.ms(360));
  recoil(body, -12);
  burst(p, { n: 14, colors: ['#ff6a5a', '#ffb0a0', '#ffffff'], speed: [90, 260], life: [0.25, 0.6], g: 220 });
  if (ev.i === me) { vignette('red'); shake($('.field-scroll'), 7, this.ms(320)); this.api.sfx('hurt'); }
  return 380;
};
D.on_heal = function (ev) {
  var p = mid(bodyOf(heroEl(ev.i)), 0.45) || mid($('.stat.hp'));
  burst(p, { n: 14, colors: ['#9dffb0', '#ffffff', '#5ce07a'], shape: 'star', speed: [30, 120], g: -80, life: [0.5, 1], size: [3, 6] });
  this.text(p, '+' + ev.n, 'heal', { icon: 'heart' });
  this.api.sfx('heal');
  return 320;
};
D.on_blk = function (ev, pre, me) {
  if (!(ev.n > 0)) return 0;
  var he = heroEl(ev.i), p = mid(bodyOf(he), 0.45);
  this.chip(p, '+' + ev.n, 'gain', 52);
  ring(p, { color: '#8fd2ff', r0: 8, r1: 58, w: 3, life: 0.35 });
  pulseBadge(he);
  if (ev.i === me) this.api.sfx('block');
  return 240;
};
D.on_eblk = function (ev) {
  var fe = foeEl(ev.u), p = mid(bodyOf(fe), 0.45);
  this.chip(p, ev.n ? '+' + ev.n : '', 'gain', 46);
  ring(p, { color: '#8fd2ff', r0: 8, r1: 50, w: 3, life: 0.35 });
  pulseBadge(fe);
  if (ev.why) this.text({ x: p.x, y: p.y - 38 }, ev.why, 'blkword', { dur: 1100 });
  this.api.sfx('block');
  this.caption(esc(this.foeName(ev.u)) + 'がブロック' + (ev.n ? '<b>+' + ev.n + '</b>' : 'を得た') + (ev.why ? '（' + esc(ev.why) + '）' : ''), 'enemy');
  return 300;
};
D.on_tok = function (ev) {
  var tk = TOKEN[ev.k] || { name: ev.k, cls: 'debuff', icon: 'down' };
  var fe = foeEl(ev.u), body = bodyOf(fe), p = mid(body, 0.35);
  this.icon(p, tk.icon, 'drop', 40);
  this.text(labelAt(body, p, 30), tk.name, tk.cls === 'poison' ? 'psnword' : 'debuff', { dur: 1200 });
  flash(body, tk.cls === 'poison' ? 'green' : 'bright', this.ms(300));
  this.api.sfx(tk.cls === 'poison' ? 'poison' : 'debuff');
  return 260;
};
D.on_ptok = function (ev, pre, me) {
  var tk = TOKEN[ev.k] || { name: ev.k, cls: 'debuff', icon: 'down' };
  var he = heroEl(ev.i), body = bodyOf(he), p = mid(body, 0.35);
  this.icon(p, tk.icon, 'drop', 44);
  this.text(labelAt(body, p, 32), tk.name, 'debuff', { sub: tk.why, dur: 1400 });
  flash(body, 'bright', this.ms(300));
  if (ev.i === me) { vignette('purple'); this.api.sfx('debuff'); }
  this.caption(esc(this.who(ev.i)) + 'は<b>' + tk.name + '</b>を受けた（' + tk.why + '）', 'debuff');
  return 420;
};
D.on_str = function (ev) {
  if (!ev.n) return 0;
  var body = bodyOf(heroEl(ev.i)), p = mid(body, 0.4);
  this.icon(p, ev.n > 0 ? 'up' : 'down', ev.n > 0 ? 'rise' : 'drop', 40);
  burst(p, { n: 12, colors: ['#ff8a45', '#ffd08a', '#ff4a2a'], speed: [30, 110], g: -160, life: [0.4, 0.8], size: [2, 4] });
  this.text(labelAt(body, p, 30), '筋力' + (ev.n > 0 ? '+' : '') + ev.n, ev.n > 0 ? 'buff' : 'debuff');
  this.api.sfx(ev.n > 0 ? 'buff' : 'debuff');
  return 300;
};
D.on_estr = function (ev) {
  var body = bodyOf(foeEl(ev.u)), p = mid(body, 0.4);
  this.icon(p, 'up', 'rise', 40);
  burst(p, { n: 12, colors: ['#ff8a45', '#ffd08a', '#ff4a2a'], speed: [30, 110], g: -160, life: [0.4, 0.8], size: [2, 4] });
  this.text(labelAt(body, p, 30), '筋力アップ', 'buff');
  this.api.sfx('buff');
  this.caption(esc(this.foeName(ev.u)) + 'の<b>筋力</b>が上がった（攻撃のダメージが増える）', 'enemy');
  return 340;
};
D.on_eheal = function (ev) {
  var list = ev.u != null ? [foeEl(ev.u)] : Array.prototype.slice.call(document.querySelectorAll('#app .foe:not(.dead)'));
  var self = this;
  list.forEach(function (fe) { var p = mid(bodyOf(fe), 0.45); burst(p, { n: 12, colors: ['#9dffb0', '#ffffff'], shape: 'star', speed: [30, 110], g: -80, life: [0.4, 0.9], size: [2, 5] }); self.text(p, '回復', 'heal'); });
  this.api.sfx('heal');
  return 340;
};
D.on_spawn = function (ev) {
  var fe = foeEl(ev.u), body = bodyOf(fe), p = mid(body, 0.6), opening = !ev.vs || !ev.vs.r;
  if (body) anim(body, [{ opacity: 0, transform: 'translateY(16px) scale(.6)', filter: 'brightness(3)' }, { opacity: 1, transform: 'none', filter: 'brightness(1)' }], { duration: this.ms(520), easing: 'cubic-bezier(.2,.8,.3,1.2)' });
  burst(p, { n: 22, colors: ['#d8d0c8', '#9a8f86', '#ffffff'], speed: [40, 160], g: -20, life: [0.4, 0.9], size: [3, 8], add: false, shape: 'bubble' });
  if (opening) return 120; // the encounter's own enemies simply appear before the battle starts
  this.caption(esc(this.foeName(ev.u)) + 'が現れた', 'enemy');
  this.api.sfx('void');
  return 420;
};
D.on_flee = function (ev, pre) {
  var g = pre.foeGhost;
  if (g) { anim(g.el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(120px)' }], { duration: this.ms(600), easing: 'ease-in', fill: 'forwards' }); setTimeout(function () { g.el.remove(); }, this.ms(620)); }
  this.caption(esc(this.foeName(ev.u)) + 'は逃げ去った', 'enemy');
  this.api.sfx('whoosh');
  return 460;
};
D.on_en = function (ev, pre, me) {
  if (ev.i !== me || !ev.n) return 0;
  var e = $('.energy');
  if (e) anim(e, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.25)', filter: 'brightness(1.7)', offset: 0.3 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: this.ms(480) });
  this.text(mid(e, 0.2), (ev.n > 0 ? '+' : '') + ev.n, 'energy', { icon: 'bolt' });
  this.api.sfx('energy');
  return 160;
};
D.on_stance = function (ev) {
  var body = bodyOf(heroEl(ev.i)), p = mid(body, 0.5);
  var col = ev.s === 'wrath' ? ['#ff5a3a', '#ffb08a'] : ev.s === 'calm' ? ['#7ac8ff', '#e0f4ff'] : ev.s === 'divinity' ? ['#ffe08a', '#fff6d0'] : ['#cccccc', '#ffffff'];
  ring(p, { color: col[0], r0: 10, r1: 90, w: 5, life: 0.5 });
  burst(p, { n: 20, colors: col, speed: [40, 160], g: -60, life: [0.4, 0.9], size: [2, 5] });
  this.text(labelAt(body, p, 40), STANCE[ev.s] || '', 'stance s-' + ev.s, { dur: 1300 });
  this.api.sfx(ev.s === 'wrath' ? 'wrath' : ev.s === 'calm' ? 'calm' : ev.s === 'divinity' ? 'divine' : 'click');
  return 360;
};
D.on_channel = function (ev) {
  var p = mid(bodyOf(heroEl(ev.i)), 0.05);
  var col = ev.o === 'lightning' ? ['#fff27a', '#ffd040'] : ev.o === 'frost' ? ['#dff6ff', '#7ac8ff'] : ['#c8a0ff', '#6a3ab0'];
  burst(p, { n: 12, colors: col, speed: [20, 90], g: 0, life: [0.3, 0.7], size: [2, 5], glow: true });
  this.text(p, ORB[ev.o] || '', 'orb o-' + ev.o, { dur: 1000 });
  this.api.sfx(ev.o === 'frost' ? 'frost' : ev.o === 'dark' ? 'void' : 'zap');
  return 220;
};
D.on_evoke = function (ev) {
  var p = mid(bodyOf(heroEl(ev.i)), 0.05);
  var col = ev.o === 'lightning' ? ['#fff27a', '#ffd040', '#ffffff'] : ev.o === 'frost' ? ['#dff6ff', '#7ac8ff', '#ffffff'] : ['#c8a0ff', '#6a3ab0', '#ffffff'];
  ring(p, { color: col[0], r0: 6, r1: 60, w: 4, life: 0.4 });
  burst(p, { n: 22, colors: col, speed: [80, 260], g: 0, life: [0.3, 0.7], size: [2, 5] });
  this.text(p, '解放', 'orb o-' + ev.o, { dur: 900 });
  this.api.sfx('orb');
  return 260;
};
D.on_exhaust = function (ev, pre, me) {
  if (ev.i !== me) return 0;
  var g = pre.cardGhost;
  if (g) {
    anim(g.el, [{ opacity: 1, filter: 'brightness(1)', transform: 'none' }, { opacity: 1, filter: 'brightness(1.6) sepia(1) saturate(4) hue-rotate(-20deg)', transform: 'translateY(-10px)', offset: 0.35 }, { opacity: 0, filter: 'brightness(.2) blur(2px)', transform: 'translateY(-30px) scale(.9)' }], { duration: this.ms(620), fill: 'forwards' });
    var p = { x: g.r.left + g.r.width / 2, y: g.r.top + g.r.height * 0.5 };
    burst(p, { n: 18, colors: ['#ffb84a', '#ff6a2a', '#ffe8a0'], speed: [30, 140], g: -180, life: [0.4, 0.9], size: [2, 5] });
    setTimeout(function () { g.el.remove(); }, this.ms(640));
  } else {
    this.text(mid($('.pile[data-v=exh]') || $('.pile[data-v=disc]'), 0.1), '廃棄', 'info', { dur: 900 });
  }
  this.api.sfx('exhaust');
  return pre.cardGhost ? 220 : 60;
};
D.on_discard = function (ev, pre, me) {
  if (ev.i !== me || !pre.cardGhost) return 0;
  var g = pre.cardGhost, d = mid($('.pile[data-v=disc]'));
  if (d) {
    var dx = d.x - (g.r.left + g.r.width / 2), dy = d.y - (g.r.top + g.r.height / 2);
    anim(g.el, [{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2) rotate(25deg)', opacity: 0.2 }], { duration: this.ms(380), easing: 'ease-in', fill: 'forwards' });
  }
  setTimeout(function () { g.el.remove(); }, this.ms(400));
  return 55;
};
D.on_status = function (ev, pre, me) {
  var he = heroEl(ev.i), p = mid(bodyOf(he), 0.2), L = layer();
  var name = (STS.CARDS[ev.id] || {}).name || ev.id;
  if (p && L) {
    var w = document.createElement('div'); w.className = 'fx-mini status'; w.innerHTML = V.card({ id: ev.id, up: false }, { attrs: 'tabindex="-1"', cls: 'fx-card' }) + (ev.n > 1 ? '<b>×' + ev.n + '</b>' : '');
    w.style.left = p.x + 'px'; w.style.top = p.y + 'px'; L.appendChild(w);
    if (this.api.fitCards) this.api.fitCards(w);
    var to = ev.i === me ? mid($('.pile[data-v=' + (ev.id === 'Daze' ? 'draw' : 'disc') + ']')) : null;
    var dx = to ? to.x - p.x : 0, dy = to ? to.y - p.y : 30;
    var a = anim(w, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.5)' }, { opacity: 1, transform: 'translate(-50%,-90%) scale(1)', offset: 0.22 }, { opacity: 1, transform: 'translate(-50%,-90%) scale(1)', offset: 0.6 }, { opacity: 0, transform: 'translate(calc(-50% + ' + dx + 'px),calc(-50% + ' + dy + 'px)) scale(.3)' }], { duration: this.ms(1100), easing: 'ease-in-out', fill: 'forwards' });
    if (a) a.onfinish = function () { w.remove(); }; else setTimeout(function () { w.remove(); }, 1100);
  }
  this.caption(esc(this.who(ev.i)) + 'のデッキに「' + esc(name) + '」×' + ev.n + (ev.id === 'Daze' ? '（山札の上）' : ev.id === 'Burn' ? '' : ''), 'debuff');
  this.api.sfx('debuff');
  return 420;
};
D.on_shiv = function (ev, pre, me) { if (ev.i === me) { this.text(mid($('.hero[data-pi="' + me + '"]'), 0.1), 'ナイフ', 'buff', { dur: 900 }); this.api.sfx('shiv'); } return 120; };
D.on_mir = function (ev, pre, me) { if (ev.i === me) { this.text(mid($('.hero[data-pi="' + me + '"]'), 0.1), '奇跡', 'buff', { dur: 900 }); this.api.sfx('divine'); } return 120; };
D.on_power = function (ev) {
  var body = bodyOf(heroEl(ev.i)), p = mid(body, 0.5);
  ring(p, { color: '#c8a0ff', r0: 10, r1: 80, w: 4, life: 0.5 });
  burst(p, { n: 16, colors: ['#e0c8ff', '#a070ff', '#ffffff'], speed: [30, 140], g: -60, life: [0.4, 0.8], size: [2, 4], glow: true });
  this.text(labelAt(body, p, 30), (STS.CARDS[ev.id] || {}).name || 'パワー', 'power', { dur: 1200 });
  this.api.sfx('buff');
  return 300;
};
D.on_buffer = function (ev) { var p = mid(bodyOf(heroEl(ev.i)), 0.4); this.icon(p, 'shield', 'pop', 56); this.text(p, 'バッファー', 'blkword'); this.caption('バッファーでHPの減少を防いだ', 'blk'); return 380; };
D.on_endTurn = function () { this.caption('ターン終了', 'sys'); return 120; };
D.on_enemyTurn = function () { this.banner('敵のターン', null, 'enemy'); this.api.sfx('enemyturn'); return 720; };
D.on_facing = function (ev) { var p = mid(bodyOf(heroEl(ev.i)), 0.3); this.text(p, '対面：' + (V.FACING[ev.k] || ''), 'debuff', { dur: 1500 }); this.caption(esc(this.who(ev.i)) + 'は対面効果を受けた：' + esc(V.FACING[ev.k] || ''), 'debuff'); return 520; };
D.on_pdead = function (ev) { var body = bodyOf(heroEl(ev.i)); anim(body, [{ filter: 'grayscale(0)', transform: 'none' }, { filter: 'grayscale(1) brightness(.4)', transform: 'translateY(8px) rotate(-6deg)' }], { duration: this.ms(700), fill: 'forwards' }); this.api.sfx('defeat'); return 700; };
D.on_fairy = function (ev) { var p = mid(bodyOf(heroEl(ev.i)), 0.4); burst(p, { n: 30, colors: ['#ffd0f0', '#ffffff', '#ff9ad8'], shape: 'star', speed: [40, 200], g: -60, life: [0.6, 1.2] }); this.text(p, '妖精の瓶！', 'heal', { dur: 1500 }); this.api.sfx('heal'); return 700; };
D.on_usePotion = function (ev) {
  var p = mid(bodyOf(heroEl(ev.i)), 0.25) || mid($('.pots'));
  var L = layer();
  if (p && L) {
    var el = document.createElement('div'); el.className = 'fx-relic potion'; el.innerHTML = '<img src="' + V.potionImg(ev.id) + '" alt=""><span>' + esc((STS.POTIONS[ev.id] || {}).name || '') + '</span>';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; L.appendChild(el);
    var a = anim(el, [{ opacity: 0, transform: 'translate(-50%,-30%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-80%) scale(1.05)', offset: 0.2 }, { opacity: 1, transform: 'translate(-50%,-90%) scale(1)', offset: 0.75 }, { opacity: 0, transform: 'translate(-50%,-110%) scale(.9)' }], { duration: this.ms(1200), fill: 'forwards' });
    if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, 1200);
  }
  burst(p, { n: 16, colors: ['#ffffff', '#b8e8ff', '#ffe8a0'], speed: [40, 150], g: -40, life: [0.3, 0.8], size: [2, 5] });
  this.api.sfx('heal');
  return 340;
};
D.on_gold = function (ev, pre, me) { if (ev.i === me && ev.n) { this.text(mid($('.stat.gold')), (ev.n > 0 ? '+' : '') + ev.n + 'G', ev.n > 0 ? 'gold' : 'debuff'); this.api.sfx('coin'); } return ev.n < 0 ? 300 : 0; };
D.on_ready = function (ev, pre, me) { if (ev.i !== me) { var p = mid(heroEl(ev.i), 0.1); this.text(p, '準備完了', 'info', { dur: 1000 }); } return 0; };
D.on_combatEnd = function (ev) {
  var win = ev.result === 'victory';
  this.banner(win ? '勝利！' : '敗北…', null, win ? 'victory' : 'defeat');
  this.api.sfx(win ? 'victory' : 'defeat');
  return win ? 1100 : 1500;
};
D.on_rowSwitch = function () { return 80; };
})(typeof window !== 'undefined' ? window : globalThis);
