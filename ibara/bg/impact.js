/* スレイザスパイア — the weight of moments (next-level update, 2026-11-13).
   Added on top of the battle director (bg/director.js) without rewriting it:
   - three weights of hits (light 1–2 / medium 3–5 / heavy 6+ or 40% of the target's maximum HP): number size,
     shake, a short hit-stop (40 / 90 ms) and a thicker sound. Light hits stay exactly as before.
   - the last blow of a battle: 0.3 s slow motion and a white flash.
   - Boss entrance (darkness, the Boss's shadow, 「第◯幕 ボス」 and its name, the Boss music), Elite entrance,
     the Boss's fall (music stops, slow motion, it shatters, 0.4 s of silence, the victory sound).
   - card trail to the target, the energy spent, wind-up / squash / crumble of the bodies.
   - low-HP pulse and heartbeat, the lethal warning helper, extra sounds and short vibrations.
   Budgets at normal speed: ordinary actions get no extra time; heavy or last blows ≤ 0.4 s; Elite entrance ≤ 1 s;
   Boss entrance and fall ≤ 2.5 s each. Everything follows the replay speed, skips with a tap, does nothing at
   speed 「なし」 (the director only records then) and is reduced under prefers-reduced-motion.
   Presentation only: reads events and the page, never changes the run. */
(function (root) {
'use strict';
var STS = root.STS, IB = root.IBARA || (root.IBARA = {}), V = STS && STS.View, Dir = STS && STS.Director;
var NL = IB.NL || (IB.NL = {});
if (!Dir || !V) return;
var P = Dir.prototype, esc = V.esc, SFX = IB.SFX;

/* ------------------------------------------------------------------ small helpers */
function layer() { return document.getElementById('floatLayer'); }
function $(sel) { return document.querySelector('#app ' + sel); }
function reduce() { return !!(IB.FX && IB.FX.reduce); }
function anim(el, frames, o) { if (!el || !el.animate) return null; try { return el.animate(frames, o); } catch (e) { return null; } }
function rect(el) { return el ? el.getBoundingClientRect() : null; }
function mid(el, fy) { var r = rect(el); if (!r || (!r.width && !r.height)) return null; return { x: r.left + r.width / 2, y: r.top + r.height * (fy == null ? 0.5 : fy) }; }
function foeBody(u) { var f = $('.foe[data-u="' + u + '"]'); return f ? (f.querySelector('.body') || f) : null; }
function heroBody(i) { var h = $('.hero[data-pi="' + i + '"]'); return h ? (h.querySelector('.body') || h) : null; }
function shake(el, mag, dur) {
  if (!el || reduce()) return;
  var k = [];
  for (var i = 0; i < 6; i++) { var m = mag * (1 - i / 6); k.push({ transform: 'translate(' + ((Math.random() * 2 - 1) * m).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * m * 0.5).toFixed(1) + 'px)' }); }
  k.push({ transform: 'translate(0,0)' });
  anim(el, k, { duration: dur });
}
/* Whole-screen flashes (white flashes and the red edge of a hit, director.js): never more than three in one second. */
var flashes = [];
NL.flashOk = function () {
  var now = Date.now();
  flashes = flashes.filter(function (t) { return now - t < 1000; });
  if (flashes.length >= 3) return false;
  flashes.push(now);
  return true;
};
function screenFlash(color, dur, peak) {
  if (reduce() || !NL.flashOk()) return false;
  var L = layer(); if (!L) return false;
  var f = document.createElement('div'); f.className = 'nl-flash'; f.style.background = color || '#fff'; L.appendChild(f);
  var a = anim(f, [{ opacity: 0 }, { opacity: peak || 0.75, offset: 0.18 }, { opacity: 0 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { f.remove(); }; else setTimeout(function () { f.remove(); }, dur);
  return true;
}
NL.flashCount = function () { var now = Date.now(); return flashes.filter(function (t) { return now - t < 1000; }).length; };
/* Short vibrations on Android (navigator.vibrate). Off in the settings or unsupported: nothing happens. */
NL.vibrate = function (ms) {
  if (NL.prefs && NL.prefs.vibrate === false) return false;
  var n = root.navigator;
  if (!n || typeof n.vibrate !== 'function') return false;
  try { return n.vibrate(ms); } catch (e) { return false; }
};
/* Hit-stop: the target's running animations hold still for a moment (the time is taken from the step's own wait). */
function hold(els, ms) {
  if (reduce() || !(ms > 0)) return;
  var list = [];
  els.forEach(function (el) { if (el && el.getAnimations) try { list = list.concat(el.getAnimations({ subtree: true })); } catch (e) {} });
  list.forEach(function (a) { try { a.pause(); } catch (e) {} });
  setTimeout(function () { list.forEach(function (a) { try { if (a.playState === 'paused') a.play(); } catch (e) {} }); }, ms);
}
/* Slow motion: everything moving on the page and in the effect layer runs at a third of its speed for a moment. */
function slow(ms) {
  if (reduce() || !document.getAnimations) return;
  var list = [];
  try { list = document.getAnimations(); } catch (e) { list = []; }
  list.forEach(function (a) { try { a.updatePlaybackRate ? a.updatePlaybackRate(0.33) : (a.playbackRate = 0.33); } catch (e) {} });
  if (IB.FX) IB.FX.speed = 0.4;
  setTimeout(function () {
    list.forEach(function (a) { try { a.updatePlaybackRate ? a.updatePlaybackRate(1) : (a.playbackRate = 1); } catch (e) {} });
    if (IB.FX) IB.FX.speed = 1;
  }, ms);
}
function music(scene) { if (SFX && SFX.music) try { SFX.music(scene); } catch (e) {} }
function duck(level, ms) { if (SFX && SFX.duckBgm) try { SFX.duckBgm(level, ms); } catch (e) {} }

/* ------------------------------------------------------------------ weights of hits */
/* 0: no HP lost, 1: light (1–2), 2: medium (3–5), 3: heavy (6 or more, or 40% of the target's maximum HP). */
function tier(lost, max) {
  if (!(lost > 0)) return 0;
  if (lost >= 6 || (max > 0 && lost >= max * 0.4)) return 3;
  return lost >= 3 ? 2 : 1;
}
NL.tier = tier;
NL.HOLD = { 2: 40, 3: 90 };
function foeMax(ev) {
  var e = ev.vs && ev.vs.e ? ev.vs.e.filter(function (x) { return x.u === ev.u; })[0] : null;
  return e ? e.max : 0;
}
/* Newly added floating numbers (to give them their weight). */
function newNums(L, before) {
  if (!L) return [];
  var out = [];
  for (var i = before; i < L.children.length; i++) if (L.children[i].classList.contains('fxt-num')) out.push(L.children[i]);
  return out;
}
/* The last blow of the battle: the enemy falls and the queue already holds the victory, with nothing in between
   that would continue the fight (a revival or new enemies make it not the last). */
P.decisive = function (u) {
  for (var i = 0; i < this.q.length; i++) {
    var t = this.q[i].t;
    if (t === 'combatEnd') return this.q[i].result === 'victory';
    if (t === 'round' || t === 'enemyTurn' || t === 'endTurn' || t === 'play' || t === 'spawn' || t === 'ready') return false;
  }
  return false;
};
P.finalBlowOf = function (ev) {
  if (!(ev.hp > 0) || !ev.vs || !ev.vs.e) return false;
  var self = ev.vs.e.filter(function (x) { return x.u === ev.u; })[0];
  if (!self || self.hp > 0) return false;
  if (ev.vs.e.some(function (x) { return x.u !== ev.u && !x.dead && !x.fled && x.hp > 0; })) return false;
  return this.decisive(ev.u);
};
function isBossFight(dir) {
  var A = root.STS_APP, run = A && A.sess && A.sess.run && A.sess.run();
  var cs = run && run.combat && run.combat.pcs ? run.combat : A && A.lastCombat;
  return !!(dir.fight && dir.fight.kind === 'boss') || !!(cs && cs.kind === 'boss');
}

var baseEdmg = P.on_edmg;
P.on_edmg = function (ev, pre, me) {
  var t = tier(ev.hp, foeMax(ev)), last = this.finalBlowOf(ev), api = this.api, sfx = api.sfx, L = layer(), n0 = L ? L.children.length : 0;
  if (t >= 2 || last) {
    // the same step, with a thicker sound for medium and heavy hits
    api.sfx = function (name, k) { if (name === 'hit' || name === 'bighit') { sfx(t === 3 || last ? 'heavyhit' : 'hit', t === 3 ? 3 : 2.4); if (t === 3) sfx('bighit'); return; } sfx(name, k); };
  }
  var w;
  try { w = baseEdmg.call(this, ev, pre, me); } finally { api.sfx = sfx; }
  var body = foeBody(ev.u);
  if (ev.hp > 0 && body && !reduce()) {
    // squash of the body that took the hit (the existing recoil moves it; this flattens the picture inside)
    var art = body.querySelector('.art') || body;
    anim(art, [{ transform: 'scale(1,1)' }, { transform: 'scale(' + (1 + 0.04 * t) + ',' + (1 - 0.06 * t) + ')', offset: 0.25 }, { transform: 'scale(1,1)' }], { duration: this.ms(240 + 40 * t), easing: 'ease-out' });
  }
  if (t >= 2) {
    newNums(L, n0).forEach(function (el) { el.classList.add('nl-t' + t); });
    if (t === 3) shake($('.field-scroll'), 9, this.ms(320)); else shake(body, 5, this.ms(220));
    hold([body], NL.HOLD[t]);
    if (t === 3) { NL.vibrate(40); if (!last) w = (w || 0) + NL.HOLD[3]; }
  }
  if (last) w = this.lastBlow(ev, w, t);
  return w;
};
/* 0.3 s of slow motion and a white flash. For a Boss, the music stops here. */
P.lastBlow = function (ev, w, t) {
  var boss = isBossFight(this);
  slow(this.ms(300));
  screenFlash('#fff', this.ms(360), boss ? 0.85 : 0.7);
  if (boss) { music(null); this.bossFalling = true; }
  NL.vibrate(boss ? 80 : 50);
  this.lastShown = ev.u;
  return (w || 0) + 300;
};

/* The hero's side: the same three weights for HP lost. */
var baseHp = P.on_hp;
P.on_hp = function (ev, pre, me) {
  var L = layer(), n0 = L ? L.children.length : 0;
  var w = baseHp.call(this, ev, pre, me);
  if (!(ev.n < 0)) return w;
  var p = ev.vs && ev.vs.p ? ev.vs.p[ev.i] : null;
  var t = tier(-ev.n, p ? p.mx : 0), body = heroBody(ev.i);
  if (body && !reduce()) {
    var face = body.querySelector('.face') || body;
    anim(face, [{ transform: 'scale(1,1)' }, { transform: 'scale(' + (1 + 0.04 * t) + ',' + (1 - 0.06 * t) + ')', offset: 0.25 }, { transform: 'scale(1,1)' }], { duration: this.ms(240 + 40 * t), easing: 'ease-out' });
  }
  if (ev.i === me) NL.vibrate(t >= 3 ? 70 : t === 2 ? 45 : 25);
  if (t >= 2) {
    newNums(L, n0).forEach(function (el) { el.classList.add('nl-t' + t); });
    hold([body], NL.HOLD[t]);
    if (t === 3) { if (ev.i === me) this.api.sfx('heavyhit', 3); w = (w || 0) + NL.HOLD[3]; }
  }
  return w;
};

/* ------------------------------------------------------------------ cards and energy */
var basePlay = P.on_play;
P.on_play = function (ev, pre, me) {
  var from = pre.cardGhost ? { x: pre.cardGhost.r.left + pre.cardGhost.r.width / 2, y: pre.cardGhost.r.top + pre.cardGhost.r.height / 2 } : null;
  var target = ev.i === me && from ? (ev.tg != null ? foeBody(ev.tg) : ev.row != null ? $('.band[data-key="band-' + ev.row + '"] .foe .body') : null) : null;
  var to = mid(target, 0.45);
  var w = basePlay.call(this, ev, pre, me);
  this.fight = this.fight || {};
  // an attack card: the hero gathers itself before the strike (inside the card's own time)
  var hb = heroBody(ev.i), face = hb && (hb.querySelector('.face') || hb);
  if (face && !reduce() && (STS.CARDS[ev.card.id] || {}).t === 'A') anim(face, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.05,.92) translateY(3px)', offset: 0.45 }, { transform: 'scale(1,1)' }], { duration: this.ms(220), easing: 'ease-out' });
  // the energy that was just paid: the orb lights up as it drains
  var mine = ev.vs && ev.vs.p ? ev.vs.p[me] : null;
  if (ev.i === me && mine && this.fight.en != null && mine.en < this.fight.en) {
    var orb = $('.energy');
    if (orb) anim(orb, [{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(2.1) drop-shadow(0 0 10px #ffd86a)', transform: 'scale(.86)', offset: 0.3 }, { filter: 'brightness(1)', transform: 'scale(1)' }], { duration: this.ms(420), easing: 'ease-out' });
    this.api.sfx('spend');
  }
  if (mine) this.fight.en = mine.en;
  // a trail from the card to what it aims at (a light page element: cheap to draw, also on slow phones)
  if (from && to && !reduce()) trail(from, to, this.ms(340));
  return w;
};
function trail(from, to, dur) {
  var L = layer(); if (!L) return;
  var dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
  var el = document.createElement('div'); el.className = 'nl-trail';
  el.style.left = from.x + 'px'; el.style.top = from.y + 'px'; el.style.width = len.toFixed(1) + 'px';
  L.appendChild(el);
  var r = 'rotate(' + ang.toFixed(4) + 'rad) ';
  var a = anim(el, [{ transform: r + 'scaleX(0)', opacity: 1 }, { transform: r + 'scaleX(1)', opacity: 1, offset: 0.45 }, { transform: r + 'scaleX(1)', opacity: 0 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, dur);
}
/* The energy shown before the first card of a turn. */
var baseRound = P.on_round;
P.on_round = function (ev, pre, me) {
  this.fight = this.fight || {};
  var mine = ev.vs && ev.vs.p ? ev.vs.p[me] : null;
  this.fight.en = mine ? mine.en : null;
  return baseRound.call(this, ev, pre, me);
};
var baseEnRefresh = P.trackCtx;
P.trackCtx = function (ev) {
  if (ev.vs && ev.vs.p && this.fight && (ev.t === 'en' || ev.t === 'draw')) { var m = ev.vs.p[this.api.me()]; if (m) this.fight.en = m.en; }
  return baseEnRefresh.call(this, ev);
};

/* ------------------------------------------------------------------ enemy wind-up */
var baseEhit = P.on_ehit;
P.on_ehit = function (ev, pre, me) {
  var body = foeBody(ev.u), art = body && (body.querySelector('.art') || body);
  // gather before the strike, inside the existing lunge (no extra time)
  if (art && !reduce()) anim(art, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.06,.9) translateY(4px)', offset: 0.22 }, { transform: 'scale(.96,1.06)', offset: 0.5 }, { transform: 'scale(1,1)' }], { duration: Math.max(440, this.ms(480)), easing: 'ease-out' });
  return baseEhit.call(this, ev, pre, me);
};

/* ------------------------------------------------------------------ deaths */
var baseDie = P.on_die;
P.on_die = function (ev, pre, me) {
  if (ev.u == null) return baseDie.call(this, ev, pre, me);
  if (ev.boss && this.decisive(ev.u) && pre.foeGhost) return this.bossShatter(ev, pre);
  var g = pre.foeGhost;
  var w = baseDie.call(this, ev, pre, me);
  // the body crumbles: small pieces fall from where it stood
  if (g && IB.FX && !reduce()) IB.FX.burst(g.r.left + g.r.width / 2, g.r.top + g.r.height * 0.6, { n: 10, colors: ['#6b5a50', '#3a2f2a', '#a08a78'], shape: 'shard', speed: [30, 120], life: [0.5, 0.9], g: 520, size: [3, 6], add: false, jitter: g.r.width * 0.25 });
  return w;
};
/* The Boss shatters into pieces, then 0.4 s of silence. */
P.bossShatter = function (ev, pre) {
  var g = pre.foeGhost, L = layer(), self = this;
  var r = g.r, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var img = g.el.querySelector('img'), src = img ? img.getAttribute('src') : null;
  g.el.remove();
  var n = 9, dur = this.ms(800);
  if (src && L && !reduce()) {
    for (var i = 0; i < n; i++) {
      var a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      var poly = '50% 50%,' + (50 + 75 * Math.cos(a0)).toFixed(1) + '% ' + (50 + 75 * Math.sin(a0)).toFixed(1) + '%,' + (50 + 75 * Math.cos(a1)).toFixed(1) + '% ' + (50 + 75 * Math.sin(a1)).toFixed(1) + '%';
      var s = document.createElement('div');
      s.className = 'nl-shard';
      s.style.left = r.left + 'px'; s.style.top = r.top + 'px'; s.style.width = r.width + 'px'; s.style.height = r.height + 'px';
      s.style.clipPath = 'polygon(' + poly + ')';
      s.innerHTML = '<img src="' + esc(src) + '" alt="">';
      L.appendChild(s);
      var am = (a0 + a1) / 2, dist = 60 + Math.random() * 90;
      var a = anim(s, [{ transform: 'translate(0,0) rotate(0)', opacity: 1, filter: 'brightness(2.4) saturate(.3)' },
        { transform: 'translate(' + (Math.cos(am) * dist * 0.25).toFixed(1) + 'px,' + (Math.sin(am) * dist * 0.25).toFixed(1) + 'px) rotate(' + (Math.random() * 20 - 10).toFixed(1) + 'deg)', opacity: 1, filter: 'brightness(1.4)', offset: 0.25 },
        { transform: 'translate(' + (Math.cos(am) * dist).toFixed(1) + 'px,' + (Math.sin(am) * dist + 70).toFixed(1) + 'px) rotate(' + (Math.random() * 120 - 60).toFixed(1) + 'deg)', opacity: 0, filter: 'brightness(.6)' }],
        { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
      (function (el) { if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, dur); })(s);
    }
  }
  if (IB.FX) IB.FX.burst(cx, cy, { n: 40, colors: ['#ffffff', '#ffe2b0', '#ff9a5a', '#5a3a30'], shape: 'shard', speed: [80, 320], life: [0.5, 1.1], g: 260, size: [3, 7] });
  if (IB.FX) IB.FX.ring(cx, cy, { color: '#ffe6b0', r0: 10, r1: Math.max(120, r.width), w: 6, life: 0.6 });
  shake($('.field-scroll'), 12, this.ms(420));
  this.api.sfx('bossbreak');
  this.caption(esc(this.foeName(ev.u)) + 'を倒した！', 'kill');
  this.addLine(this.foeName(ev.u) + 'を倒した', 'kill');
  this.bossFell = true;
  return 800 + 400; // the fall, then 0.4 s of silence
};

/* ------------------------------------------------------------------ entrances */
function nameOfEncounter(ev) {
  var enc = ev.enc && STS.ENCOUNTERS ? STS.ENCOUNTERS[ev.enc] : null;
  if (enc && enc.name) return enc.name;
  return '';
}
/* The Boss's picture on the battlefield: a sprite (its shadow is drawn) or a painted card portrait (shown dimmed). */
function bossArt() {
  var imgs = Array.prototype.slice.call(document.querySelectorAll('#app .foe.sz-b .art img'));
  if (!imgs.length) return null;
  imgs.sort(function (a, b) { return (rect(b).width * rect(b).height) - (rect(a).width * rect(a).height); });
  return { src: imgs[0].getAttribute('src'), portrait: imgs[0].classList.contains('official-portrait') };
}
function secondBoss() {
  var A = root.STS_APP, run = A && A.sess && A.sess.run && A.sess.run();
  return !!(run && run.room && run.room.second);
}
/* An overlay that a tap ends at once. */
P.moment = function (cls, html, ms) {
  var L = layer(); if (!L) return null;
  this.endMoment();
  var el = document.createElement('div'), self = this;
  el.className = 'nl-moment ' + cls;
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = html;
  el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self.hurry(); });
  L.appendChild(el);
  this.momentEl = el;
  this.momentT = setTimeout(function () { if (self.momentEl === el) self.endMoment(); }, this.ms(ms) + 60);
  return el;
};
P.endMoment = function () {
  clearTimeout(this.momentT);
  if (this.momentEl) { this.momentEl.remove(); this.momentEl = null; }
};
/* A tap on an entrance or a fall: that step ends now, the replay continues with the next one. */
P.hurry = function () {
  this.endMoment();
  if (this.busy && this.timer) { clearTimeout(this.timer); this.timer = null; this.pump(); }
};
var baseSkip = P.skip;
P.skip = function () { this.endMoment(); return baseSkip.call(this); };

var baseStart = P.on_combatStart;
P.on_combatStart = function (ev, pre, me) {
  this.fight = { kind: ev.kind, act: ev.act, en: null };
  this.bossFell = false; this.bossFalling = false;
  if (ev.kind === 'boss') return this.bossEntrance(ev);
  if (ev.kind === 'elite') return this.eliteEntrance(ev);
  return baseStart.call(this, ev, pre, me);
};
P.bossEntrance = function (ev) {
  this.clearNotices();
  var act = ev.act || 1, name = nameOfEncounter(ev) || 'ボス', art = bossArt(), src = art && art.src;
  var label = (act >= 4 ? '最終幕' : '第' + act + '幕') + ' ボス' + (secondBoss() ? '（2体目）' : '');
  var el = this.moment('nl-boss', '<div class="nl-dark"></div>' + (src ? '<div class="nl-shadow' + (art.portrait ? ' portrait' : '') + '"><img src="' + esc(src) + '" alt=""></div>' : '') +
    '<div class="nl-plate"><small>' + esc(label) + '</small><b>' + esc(name) + '</b></div><span class="nl-tap">タップでとばす</span>', 2300);
  music('boss'); duck(0.4, this.ms(2300));
  this.api.sfx('bossdrum');
  if (el && !reduce()) {
    var dark = el.querySelector('.nl-dark'), sh = el.querySelector('.nl-shadow'), pl = el.querySelector('.nl-plate');
    anim(dark, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.84 }, { opacity: 0 }], { duration: this.ms(2300), fill: 'forwards' });
    if (sh) anim(sh, [{ opacity: 0, transform: 'translate(-50%,-46%) scale(.82)' }, { opacity: 0, transform: 'translate(-50%,-46%) scale(.82)', offset: 0.1 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.42 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.04)', offset: 0.84 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.1)' }], { duration: this.ms(2300), easing: 'ease-out', fill: 'forwards' });
    anim(pl, [{ opacity: 0, transform: 'translate(-50%,0) scale(1.3)', letterSpacing: '.5em' }, { opacity: 0, transform: 'translate(-50%,0) scale(1.3)', offset: 0.3 }, { opacity: 1, transform: 'translate(-50%,0) scale(1)', letterSpacing: '.14em', offset: 0.42 }, { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.84 }, { opacity: 0, transform: 'translate(-50%,0) scale(.98)' }], { duration: this.ms(2300), easing: 'ease-out', fill: 'forwards' });
    var self = this;
    setTimeout(function () { if (self.momentEl === el) shake(document.querySelector('#app .field-scroll'), 8, 360); }, this.ms(960));
  }
  this.addLine((secondBoss() ? '2体目のボス：' : 'ボス戦：') + name, 'sys');
  return 2300;
};
P.eliteEntrance = function (ev) {
  this.clearNotices();
  var name = nameOfEncounter(ev);
  var el = this.moment('nl-elite' + (ev.burning ? ' burning' : ''), '<div class="nl-frame"></div><div class="nl-plate"><small>' + (ev.burning ? '燃えるエリート' : 'エリート') + '</small>' + (name ? '<b>' + esc(name) + '</b>' : '') + '</div>', 900);
  music('elite');
  this.api.sfx('elite');
  if (el && !reduce()) {
    anim(el.querySelector('.nl-frame'), [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: this.ms(900), fill: 'forwards' });
    anim(el.querySelector('.nl-plate'), [{ opacity: 0, transform: 'translate(-50%,-50%) scaleY(.2)' }, { opacity: 1, transform: 'translate(-50%,-50%) scaleY(1)', offset: 0.18 }, { opacity: 1, transform: 'translate(-50%,-50%) scaleY(1)', offset: 0.78 }, { opacity: 0, transform: 'translate(-50%,-50%) scaleY(.6)' }], { duration: this.ms(900), easing: 'ease-out', fill: 'forwards' });
  }
  this.addLine((ev.burning ? '燃えるエリート：' : 'エリート戦：') + (name || ''), 'sys');
  return 900;
};

/* ------------------------------------------------------------------ the end of a battle */
var baseEnd = P.on_combatEnd;
P.on_combatEnd = function (ev, pre, me) {
  var boss = ev.kind === 'boss' || (ev.kind == null && isBossFight(this));
  if (!(ev.result === 'victory' && boss && (this.bossFell || this.bossFalling))) { this.fight = null; return baseEnd.call(this, ev, pre, me); }
  this.fight = null; this.bossFell = this.bossFalling = false;
  this.banner('ボス撃破', null, 'victory nl-bossdown');
  this.api.sfx('bossdown');
  screenFlash('#ffe8a0', this.ms(600), 0.35);
  duck(1);
  return 700;
};

/* ------------------------------------------------------------------ low HP and the lethal warning */
var beat = { timer: null, on: false };
function heartbeat(on) {
  if (on === beat.on) return;
  beat.on = on;
  clearInterval(beat.timer); beat.timer = null;
  if (on) beat.timer = setInterval(function () { if (SFX && SFX.play && !document.hidden) try { if (NL.sfxOn()) SFX.play('heartbeat'); } catch (e) {} }, 1700);
}
NL.sfxOn = function () { return !(NL.prefs && NL.prefs.sfx === false); };
/* After every draw: the red pulse at the edge of the screen while the hero has 3 HP or less (and is alive). */
NL.lowHp = function (A) {
  var run = A && A.screen === 'game' && A.sess && A.sess.run && A.sess.run();
  var hp = null, inCombat = false;
  if (run && run.phase !== 'over' && run.players[A.me]) {
    hp = run.players[A.me].hp;
    inCombat = !!(run.combat && run.combat.pcs);
    if (A.view && A.view.vs && A.view.vs.p && A.view.vs.p[A.me]) { hp = A.view.vs.p[A.me].hp; inCombat = true; }
  }
  var low = hp != null && hp > 0 && hp <= 3;
  var edge = document.getElementById('nlEdge');
  if (!edge && low) { edge = document.createElement('div'); edge.id = 'nlEdge'; edge.setAttribute('aria-hidden', 'true'); document.body.appendChild(edge); }
  document.body.classList.toggle('nl-lowhp', low);
  heartbeat(low && inCombat);
  return low;
};
/* The lethal warning: the enemies' announced attacks on this player (the same sum the intent bubbles show,
   ui.js incomingTo) reach the player's Block plus HP. */
NL.lethal = function (incoming, blk, hp) {
  return incoming > 0 && incoming >= (blk || 0) + (hp || 0) ? { on: true, incoming: incoming, guard: (blk || 0) + (hp || 0) } : null;
};

/* ------------------------------------------------------------------ sounds (fx.js synthesizer) */
if (SFX && SFX.define) {
  SFX.define('heavyhit', function (t, k, S) { S.noise(t, 0.5, 0.6, { f: 520, f2: 90, q: 0.6, verb: true }); S.osc('sine', 75, t, 0.55, 0.65, null, { f2: 28 }); S.osc('triangle', 150, t, 0.18, 0.25, null, { f2: 60 }); });
  SFX.define('spend', function (t, k, S) { S.osc('sine', 1320, t, 0.12, 0.07, null, { f2: 660 }); S.noise(t, 0.08, 0.05, { f: 4200, q: 1.5 }); });
  SFX.define('rare', function (t, k, S) { [784, 988, 1175, 1568, 1976].forEach(function (f, i) { S.osc('triangle', f, t + i * 0.06, 0.7, 0.09, null, { verb: true }); }); S.osc('sine', 2637, t + 0.32, 0.9, 0.04, null, { verb: true }); });
  SFX.define('bossdrum', function (t, k, S) {
    S.osc('sine', 62, t, 1.4, 0.8, null, { f2: 32, verb: true }); S.noise(t, 0.7, 0.5, { f: 260, f2: 60, q: 0.5, type: 'lowpass', verb: true });
    S.osc('sine', 62, t + 0.9, 1.2, 0.6, null, { f2: 30, verb: true }); S.noise(t + 0.9, 0.6, 0.4, { f: 240, f2: 60, q: 0.5, type: 'lowpass', verb: true });
    S.osc('sawtooth', 98, t + 0.9, 1.0, 0.08, null, { f2: 92, verb: true });
  });
  SFX.define('elite', function (t, k, S) { S.osc('sawtooth', 110, t, 0.5, 0.12, null, { f2: 104, verb: true }); S.osc('sine', 55, t, 0.6, 0.45, null, { f2: 40 }); S.noise(t, 0.3, 0.25, { f: 700, f2: 300, q: 0.6 }); });
  SFX.define('bossbreak', function (t, k, S) {
    S.noise(t, 0.9, 0.7, { f: 2600, f2: 300, q: 0.4, verb: true }); S.osc('sine', 90, t, 0.9, 0.6, null, { f2: 25, verb: true });
    for (var i = 0; i < 7; i++) S.osc('triangle', 1800 + Math.random() * 2400, t + 0.05 + i * 0.05, 0.25, 0.05, null, { verb: true });
  });
  SFX.define('bossdown', function (t, k, S) { [392, 523, 659, 784, 1046].forEach(function (f, i) { S.osc('triangle', f, t + i * 0.07, 1.3, 0.12, null, { verb: true }); }); S.osc('sine', 196, t + 0.3, 1.8, 0.2, null, { verb: true }); S.osc('sine', 131, t, 1.6, 0.18, null, { verb: true }); });
  SFX.define('heartbeat', function (t, k, S) { S.osc('sine', 58, t, 0.16, 0.22, null, { f2: 40 }); S.osc('sine', 52, t + 0.22, 0.2, 0.16, null, { f2: 36 }); });
}
})(typeof window !== 'undefined' ? window : globalThis);
