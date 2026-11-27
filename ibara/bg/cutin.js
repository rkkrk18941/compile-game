/* スレイザスパイア — 必殺技カットイン (2026-11-27).
   Added on top of the battle director (director.js) and the next-level presentation (impact.js), without rewriting
   them, in the spirit of the anime cut-ins of character mods:
   - When the player uses a rare card, or an attack whose blow is heavy (6 damage or more to one enemy from this
     card, before Block; at most once a round per player for these), the battle pauses for a cut-in: the screen
     darkens behind focus lines, a slanted band in the hero's colour sweeps across with speed lines, the hero's
     battle portrait rushes in and the card's name lands with a flash.
   - The blow that follows lands with a finishing effect in the hero's colour and style (a cross slash for the
     Ironclad, three quick cuts for the Silent, lightning for the Defect, a pillar of light for the Watcher, ...).
     A rare Skill or Power ends with an aura around the hero instead.
   - Budget at normal speed: 0.96 s for the first cut-in of a round, 0.52 s for the next ones. It follows the
     replay speed, a tap ends it at once, nothing happens at speed 「なし」, and prefers-reduced-motion keeps only
     a still band that fades in and out.
   - A teammate's cut-in (online co-op) is a small band over their hero: it never stops the replay or takes taps.
   - Settings: 必殺技カットイン オン／オフ (NL.prefs.cutin, on unless turned off).
   Everything is drawn by the page; the only picture used is the hero's own battle portrait (img/heroes).
   Presentation only: reads events and the page, never changes the run. */
(function (root) {
'use strict';
var STS = root.STS, IB = root.IBARA || (root.IBARA = {}), V = STS && STS.View, Dir = STS && STS.Director;
var NL = IB.NL || (IB.NL = {});
if (!Dir || !V || !Dir.prototype.moment) return; // needs impact.js (moments that a tap ends)
var P = Dir.prototype, esc = V.esc, SFX = IB.SFX;

var BIG = 6; // damage from one card to one enemy that counts as a heavy blow (the heaviest weight of hits, impact.js)
/* The hero's colours: a = dark end of the band, b = its middle, hi = light edges and text, glow = halos. */
var PAL = {
  R: { a: '#4a0905', b: '#b8301c', hi: '#ffc09a', glow: '#ff5a2a', fx: ['#ffffff', '#ffd2a0', '#ff7a3a', '#ff3a1a'] },
  G: { a: '#06301f', b: '#1f8a55', hi: '#c4ffd9', glow: '#3cf08a', fx: ['#ffffff', '#d8ffe6', '#6cf0a0', '#2fbf6a'] },
  B: { a: '#071f45', b: '#1f6fca', hi: '#b8ecff', glow: '#3cc0ff', fx: ['#ffffff', '#d4f4ff', '#7ad8ff', '#fff27a'] },
  W: { a: '#1f0a45', b: '#6a3ccc', hi: '#ead8ff', glow: '#a876ff', fx: ['#ffffff', '#f0e2ff', '#c8a2ff', '#ffd86a'] },
  S: { a: '#243f04', b: '#7cb816', hi: '#efffa8', glow: '#c4ff2a', fx: ['#ffffff', '#efffa8', '#b8f02a', '#6ca80e'] },
  U: { a: '#352305', b: '#a87a22', hi: '#ffe8ae', glow: '#ffbf3a', fx: ['#ffffff', '#ffe8ae', '#ffbf3a', '#8fc8ff'] },
  H: { a: '#33062f', b: '#a2309a', hi: '#ffd0f6', glow: '#ff52e2', fx: ['#ffffff', '#ffd0f6', '#ff6ae6', '#b03aff'] },
  M: { a: '#331e0b', b: '#a65e24', hi: '#ffdcae', glow: '#ff9a3a', fx: ['#ffffff', '#ffe6c0', '#ffb05a', '#ff6a2a'] }
};
/* How each portrait sits in the band: s = height as a multiple of the band, y = the point of the picture (from its
   top) placed on the band's middle line, x = left offset, flip = mirrored like on the battlefield (battle.css). */
var FRAME = {
  R: { s: 1.5, y: 40, x: -2, flip: true },
  G: { s: 1.55, y: 38, x: 0 },
  B: { s: 1.5, y: 42, x: 2 },
  W: { s: 1.5, y: 42, x: -6 },
  S: { s: 1.08, y: 49, x: 2 },
  U: { s: 1.32, y: 44, x: -4 },
  H: { s: 1.12, y: 50, x: 2 },
  M: { s: 1.5, y: 36, x: 0 }
};
/* The finishing blow in each hero's style. */
var STYLE = { R: 'cross', G: 'cuts', B: 'bolt', W: 'pillar', S: 'splash', U: 'shards', H: 'flame', M: 'shot' };

/* ------------------------------------------------------------------ small helpers */
function layer() { return document.getElementById('floatLayer'); }
function reduce() { return !!(IB.FX && IB.FX.reduce); }
function anim(el, frames, o) { if (!el || !el.animate) return null; try { return el.animate(frames, o); } catch (e) { return null; } }
function rect(el) { return el ? el.getBoundingClientRect() : null; }
function mid(el, fy) { var r = rect(el); if (!r || (!r.width && !r.height)) return null; return { x: r.left + r.width / 2, y: r.top + r.height * (fy == null ? 0.5 : fy) }; }
function heroEl(i) { return document.querySelector('#app .hero[data-pi="' + i + '"]'); }
function heroBody(i) { var h = heroEl(i); return h ? (h.querySelector('.body') || h) : null; }
function foeBody(u) { var f = document.querySelector('#app .foe[data-u="' + u + '"]'); return f ? (f.querySelector('.body') || f) : null; }
function on() { return !(NL.prefs && NL.prefs.cutin === false); }
NL.cutinOn = on;
/* The character of a player: from the battlefield, else from the adventure. */
function chOf(i) {
  var h = heroEl(i), ch = h && h.getAttribute('data-ch');
  if (ch && PAL[ch]) return ch;
  var A = root.STS_APP, run = A && A.sess && A.sess.run && A.sess.run();
  ch = run && run.players && run.players[i] ? run.players[i].ch : null;
  return PAL[ch] ? ch : 'R';
}
function heroSrc(ch) { try { return V.heroImg(ch); } catch (e) { return ''; } }

/* ------------------------------------------------------------------ which card plays get a cut-in */
/* The events that end what one card did (the queue already holds the whole action when its replay starts). */
var STOP = { play: 1, copy: 1, shivUse: 1, endTurn: 1, enemyTurn: 1, round: 1, combatStart: 1, combatEnd: 1, eact: 1, ready: 1, usePotion: 1 };
/* The largest damage this card is about to deal to a single enemy (all its hits on that enemy, before Block).
   Damage named after another source (relic, power, orb, potion) or poison does not count. */
P.cutinBlow = function () {
  var per = {}, psn = {}, best = 0;
  for (var i = 0; i < this.q.length && i < 160; i++) {
    var e = this.q[i];
    if (!e || STOP[e.t]) break;
    if (e.t === 'poison') { psn[e.u] = true; continue; }
    if (e.t === 'edmg' && !e.src && !psn[e.u]) {
      per[e.u] = (per[e.u] || 0) + (e.n || 0);
      if (per[e.u] > best) best = per[e.u];
    }
  }
  return best;
};
/* Cut-ins already shown in this round, per player (a new battle or a new round starts afresh). */
P.cutinState = function (ev) {
  var r = ev && ev.vs && ev.vs.r != null ? ev.vs.r : (this.api.round ? this.api.round() : 0);
  var s = this.ci || (this.ci = { r: null, big: {}, n: {} });
  if (s.r !== r) { s.r = r; s.big = {}; s.n = {}; }
  return s;
};
/* 'rare', 'big' or null. */
P.cutinKind = function (ev) {
  if (!on() || !ev || !ev.card) return null;
  var d = STS.CARDS[ev.card.id];
  if (!d || d.t === 'C' || d.t === 'T') return null;
  if (d.r === 'R') return 'rare';
  if (d.t !== 'A' || this.cutinBlow() < BIG) return null;
  return this.cutinState(ev).big[ev.i] ? null : 'big';
};

var basePlay = P.on_play;
P.on_play = function (ev, pre, me) {
  var kind = this.cutinKind(ev);
  var w = basePlay.call(this, ev, pre, me);
  this.ctx.ci = null;
  if (!kind) return w;
  var st = this.cutinState(ev), ch = chOf(ev.i), pal = PAL[ch];
  if (kind === 'big') st.big[ev.i] = true;
  if (ev.i !== me) { this.cutinMini(ev, ch, pal, kind); return w; }
  var quick = (st.n[ev.i] || 0) > 0;
  st.n[ev.i] = (st.n[ev.i] || 0) + 1;
  var d = STS.CARDS[ev.card.id] || {};
  this.ctx.ci = { ch: ch, pal: pal, kind: kind, hits: 0, by: ev.i };
  var total = this.cutin(ev, ch, pal, kind, quick);
  if (d.t !== 'A' && total) {
    // a rare Skill or Power: an aura around the hero when the band has gone
    var self = this, at = this.ms(total);
    setTimeout(function () { self.cutinAura(ev.i, pal); }, at);
  }
  return Math.max(w || 0, total);
};
/* A new battle or a new round starts with no cut-in shown; the finishing effect stops with the card. */
var baseTrack = P.trackCtx;
P.trackCtx = function (ev) {
  if (ev.t === 'combatStart') this.ci = null;
  if (ev.t === 'endTurn' || ev.t === 'enemyTurn' || ev.t === 'round' || ev.t === 'eact' || ev.t === 'shivUse' || ev.t === 'combatEnd') { if (this.ctx) this.ctx.ci = null; }
  return baseTrack.call(this, ev);
};

/* ------------------------------------------------------------------ the cut-in (a tap ends it) */
P.cutin = function (ev, ch, pal, kind, quick) {
  if (!layer()) return 0;
  var d = STS.CARDS[ev.card.id] || {}, name = this.cardName(ev.card), en = (d.en || '') + (ev.card.up ? '+' : '');
  var still = reduce();
  // timing (ms at normal speed): D = the card flies up first, T = the cut-in itself
  var D = still ? 0 : quick ? 60 : 200, T = still ? (quick ? 420 : 620) : quick ? 460 : 760, total = D + T;
  var vw = root.innerWidth || 390, vh = root.innerHeight || 700, wide = vw > vh;
  // the band crosses the battlefield (portrait) or the middle of the screen (landscape, less slanted)
  var f = rect(document.querySelector('#app .field-scroll'));
  var cy = !wide && f && f.height ? f.top + f.height * 0.5 : vh * 0.5;
  cy = Math.max(vh * 0.3, Math.min(vh * 0.62, cy));
  var bh = Math.round(wide ? Math.max(110, Math.min(170, vh * 0.34)) : Math.max(116, Math.min(176, vh * 0.19)));
  var rot = wide ? -4 : -7;
  var fr = FRAME[ch] || FRAME.R, src = heroSrc(ch);
  var tag = kind === 'rare' ? '★ レア・' + (V.TYPE[d.t] || 'カード') : '大ダメージ';
  var avail = Math.min(vw, 800) * 0.56;
  var fs = Math.round(Math.max(22, Math.min(54, avail / Math.max(3, name.length * 1.04))));
  var lines = '';
  if (!still) for (var k = 0; k < 14; k++) lines += '<i style="top:' + (4 + k * 6.8 + Math.random() * 3).toFixed(1) + '%;width:' + Math.round(40 + Math.random() * 120) + 'px;opacity:' + (0.35 + Math.random() * 0.5).toFixed(2) + '"></i>';
  var hero = function (cls) { return src ? '<div class="ci-hero' + cls + (fr.flip ? ' flip' : '') + '"><img src="' + esc(src) + '" alt=""></div>' : ''; };
  var html = '<div class="ci-veil"></div>' + (still ? '' : '<div class="ci-rays"></div>') +
    '<div class="ci-band">' + (still ? '' : '<div class="ci-lines">' + lines + '</div>') + '<div class="ci-inner">' + (still ? '' : hero(' ci-echo')) + hero('') +
    '<div class="ci-text"><em class="' + kind + '">' + esc(tag) + '</em>' + (en ? '<small>' + esc(en) + '</small>' : '') + '<b>' + esc(name) + '</b></div>' +
    '</div></div>' + (still ? '' : '<div class="ci-flash"></div>');
  var el = this.moment('nl-cutin ci-' + ch + (quick ? ' quick' : '') + (still ? ' still' : ''), html, total);
  if (!el) return 0;
  var css = { '--ci-a': pal.a, '--ci-b': pal.b, '--ci-hi': pal.hi, '--ci-glow': pal.glow, '--ci-y': Math.round(cy) + 'px', '--ci-bh': bh + 'px', '--ci-fs': fs + 'px', '--ci-rot': rot + 'deg',
    '--ci-hs': String(fr.s), '--ci-hy': fr.y + '%', '--ci-hx': fr.x + '%' };
  for (var key in css) el.style.setProperty(key, css[key]);
  var o = { delay: this.ms(D), duration: this.ms(T), fill: 'both' };
  var q = function (sel) { return el.querySelector(sel); };
  var BAND = 'translate(-50%,-50%) rotate(' + rot + 'deg)';
  anim(q('.ci-veil'), [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.84 }, { opacity: 0 }], o);
  if (still) {
    anim(q('.ci-band'), [{ opacity: 0 }, { opacity: 1, offset: 0.16 }, { opacity: 1, offset: 0.84 }, { opacity: 0 }], o);
  } else {
    anim(q('.ci-rays'), [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.18 },
      { opacity: 0.85, transform: 'scale(1)', offset: 0.82 }, { opacity: 0, transform: 'scale(1.06)' }], o);
    anim(q('.ci-band'), [{ clipPath: 'inset(0 100% 0 0)', transform: BAND + ' scaleY(1)', opacity: 1, easing: 'cubic-bezier(.2,.7,.2,1)' },
      { clipPath: 'inset(0 0% 0 0)', transform: BAND + ' scaleY(1)', opacity: 1, offset: 0.16 },
      { clipPath: 'inset(0 0% 0 0)', transform: BAND + ' scaleY(1)', opacity: 1, offset: 0.82, easing: 'cubic-bezier(.5,0,.8,.4)' },
      { clipPath: 'inset(0 0% 0 0)', transform: BAND + ' scaleY(.04)', opacity: 0 }], o);
    anim(q('.ci-hero:not(.ci-echo)'), [{ transform: 'translateX(-60%)', opacity: 0 }, { transform: 'translateX(-60%)', opacity: 0, offset: 0.06, easing: 'cubic-bezier(.15,.85,.3,1.12)' },
      { transform: 'translateX(0)', opacity: 1, offset: 0.26 }, { transform: 'translateX(5%)', opacity: 1, offset: 0.82, easing: 'ease-in' }, { transform: 'translateX(34%)', opacity: 0 }], o);
    anim(q('.ci-echo'), [{ transform: 'translateX(-80%)', opacity: 0 }, { transform: 'translateX(-80%)', opacity: 0, offset: 0.06 },
      { transform: 'translateX(-16%)', opacity: 0.6, offset: 0.2 }, { transform: 'translateX(-3%)', opacity: 0, offset: 0.36 }, { transform: 'translateX(0)', opacity: 0 }], o);
    anim(q('.ci-text'), [{ transform: 'translate(22%,-50%) scale(1.5)', opacity: 0 }, { transform: 'translate(22%,-50%) scale(1.5)', opacity: 0, offset: 0.14, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
      { transform: 'translate(0,-50%) scale(1)', opacity: 1, offset: 0.27 }, { transform: 'translate(-2%,-50%) scale(1)', opacity: 1, offset: 0.84 }, { transform: 'translate(-6%,-50%) scale(1)', opacity: 0 }], o);
    // the speed lines keep streaming past while the band is on screen
    Array.prototype.forEach.call(el.querySelectorAll('.ci-lines i'), function (line, n) {
      anim(line, [{ transform: 'translateX(' + Math.round(vw + 260) + 'px)' }, { transform: 'translateX(-200px)' }],
        { duration: Math.max(120, (220 + (n * 53) % 190) / Math.max(0.5, this.rate())), delay: (n * 37) % 160, iterations: Infinity });
    }, this);
    // the flash when the name lands (at most three whole-screen flashes per second, impact.js)
    if (!NL.flashOk || NL.flashOk()) anim(q('.ci-flash'), [{ opacity: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 0.55, offset: 0.27 }, { opacity: 0, offset: 0.42 }, { opacity: 0 }], o);
  }
  this.api.sfx('cutin', { d: this.ms(D) / 1000, s: this.ms(D + T * 0.27) / 1000 });
  var self = this;
  setTimeout(function () { if (self.momentEl === el && NL.vibrate) NL.vibrate(28); }, this.ms(D + T * 0.27));
  return total;
};

/* ------------------------------------------------------------------ a teammate's cut-in (never stops the replay) */
P.cutinMini = function (ev, ch, pal, kind) {
  var L = layer(), p = mid(heroEl(ev.i), 0.32);
  if (!L || !p) return;
  var vw = root.innerWidth || 390, src = heroSrc(ch), name = this.cardName(ev.card), fr = FRAME[ch] || FRAME.R;
  var el = document.createElement('div');
  el.className = 'ci-mini';
  el.innerHTML = (src ? '<i class="' + (fr.flip ? 'flip' : '') + '"><img src="' + esc(src) + '" alt=""></i>' : '') +
    '<span><small>' + esc(this.who(ev.i)) + '・' + (kind === 'rare' ? 'レアカード' : '大ダメージ') + '</small><b>' + esc(name) + '</b></span>';
  el.style.setProperty('--ci-a', pal.a); el.style.setProperty('--ci-b', pal.b); el.style.setProperty('--ci-hi', pal.hi); el.style.setProperty('--ci-glow', pal.glow);
  el.style.left = Math.max(118, Math.min(vw - 118, p.x)) + 'px'; el.style.top = Math.max(60, p.y) + 'px';
  L.appendChild(el);
  var dur = this.ms(1250), still = reduce();
  var a = still
    ? anim(el, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: dur, fill: 'forwards' })
    : anim(el, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(-6deg) scaleX(.15)' }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(-6deg) scaleX(1.04)', offset: 0.12 },
      { opacity: 1, transform: 'translate(-50%,-50%) rotate(-6deg) scaleX(1)', offset: 0.2 }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(-6deg) scaleX(1)', offset: 0.82 },
      { opacity: 0, transform: 'translate(-50%,-50%) rotate(-6deg) scaleY(.1)' }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, dur);
  this.api.sfx('whoosh');
};

/* ------------------------------------------------------------------ the blow after the cut-in */
var baseEdmg = P.on_edmg;
P.on_edmg = function (ev, pre, me) {
  var c = this.ctx || {}, ci = c.ci;
  var byCard = !!(ci && !ev.src && c.card && c.attack && c.by === ci.by && c.poison !== ev.u);
  var w = baseEdmg.call(this, ev, pre, me);
  if (byCard && ci.hits < 3) { ci.hits++; this.cutinHit(ev, ci, ci.hits === 1); }
  return w;
};
P.cutinHit = function (ev, ci, first) {
  var FX = IB.FX, body = foeBody(ev.u), p = mid(body, 0.46);
  if (!FX || !p) return;
  var r = rect(body), rad = Math.max(38, Math.min(130, (r && r.width ? r.width : 80) * 0.55)), pal = ci.pal, cols = pal.fx;
  var hb = heroBody(ci.by), h = mid(hb, 0.4), k = first ? 1 : 0.6, n = Math.round(18 * k);
  switch (STYLE[ci.ch]) {
    case 'cross': // two heavy cuts and embers
      FX.streak(p.x - rad, p.y - rad * 0.8, p.x + rad, p.y + rad * 0.8, { color: pal.glow, w: 10 * k, life: 0.3 });
      FX.streak(p.x + rad, p.y - rad * 0.8, p.x - rad, p.y + rad * 0.8, { color: pal.glow, w: 10 * k, life: 0.34 });
      FX.burst(p.x, p.y, { n: n, colors: cols, speed: [90, 300], life: [0.35, 0.8], g: 260, size: [2, 5] });
      break;
    case 'cuts': // three quick parallel cuts
      for (var j = -1; j <= 1; j++) FX.streak(p.x - rad + j * 14, p.y - rad * 0.7 - j * 10, p.x + rad + j * 14, p.y + rad * 0.7 - j * 10, { color: j ? pal.hi : pal.glow, w: (j ? 4 : 6) * k, life: 0.24 + 0.04 * (j + 1) });
      FX.burst(p.x, p.y, { n: n, colors: cols, speed: [120, 320], life: [0.25, 0.55], g: 160, size: [2, 4] });
      break;
    case 'bolt': // lightning from the hero
      if (h) { FX.bolt(h.x, h.y, p.x, p.y, { color: pal.glow, w: 6 * k, life: 0.32 }); FX.bolt(h.x, h.y, p.x, p.y, { color: '#fff27a', w: 3 * k, life: 0.26 }); }
      FX.burst(p.x, p.y, { n: n, colors: cols, speed: [80, 260], life: [0.3, 0.6], g: 100, size: [2, 4] });
      break;
    case 'pillar': // a pillar of light comes down
      FX.streak(p.x, p.y - rad * 2.4, p.x, p.y + rad * 0.6, { color: pal.glow, w: 16 * k, life: 0.36 });
      FX.streak(p.x, p.y - rad * 2.4, p.x, p.y + rad * 0.6, { color: '#ffffff', w: 5 * k, life: 0.3 });
      FX.burst(p.x, p.y, { n: n, colors: cols, shape: 'star', speed: [40, 180], life: [0.4, 0.9], g: -90, size: [2, 5] });
      break;
    case 'splash': // a splash of slime
      FX.burst(p.x, p.y, { n: n + 4, colors: cols, shape: 'bubble', speed: [60, 260], life: [0.4, 0.9], g: 380, size: [3, 8], add: false });
      break;
    case 'shards': // gears and plates fly apart
      FX.burst(p.x, p.y, { n: n, colors: cols, shape: 'shard', speed: [100, 340], life: [0.4, 0.9], g: 420, size: [3, 7] });
      break;
    case 'flame': // ghost fire rises
      FX.burst(p.x, p.y + rad * 0.3, { n: n + 4, colors: cols, speed: [40, 160], life: [0.45, 0.95], g: -260, size: [3, 7], jitter: rad * 0.4 });
      break;
    case 'shot': // a shot from the Hermit's gun
      if (h) FX.streak(h.x, h.y, p.x, p.y, { color: pal.glow, w: 4 * k, life: 0.2 });
      FX.burst(p.x, p.y, { n: n, colors: cols, speed: [140, 360], life: [0.2, 0.5], g: 200, size: [2, 4] });
      break;
  }
  if (!first) return;
  FX.ring(p.x, p.y, { color: pal.hi, r0: 8, r1: rad * 1.9, w: 6, life: 0.45 });
  if (!reduce()) this.cutinDash(ci.by, p);
  this.api.sfx('cutinhit');
};
/* An afterimage of the hero rushing at the enemy (once, with the first blow). */
P.cutinDash = function (i, to) {
  var L = layer(), face = heroEl(i), pic = face && face.querySelector('.face i'), r = rect(pic);
  if (!L || !pic || !r || !r.width || !to) return;
  var g = document.createElement('div');
  g.className = 'ci-dash';
  g.style.left = r.left + 'px'; g.style.top = r.top + 'px'; g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
  g.style.backgroundImage = pic.style.backgroundImage;
  if (face.getAttribute('data-ch') === 'R') g.style.transform = 'scaleX(-1)';
  L.appendChild(g);
  var dx = Math.max(20, Math.min(160, (to.x - (r.left + r.width / 2)) * 0.45)), flip = face.getAttribute('data-ch') === 'R' ? ' scaleX(-1)' : '';
  var a = anim(g, [{ transform: 'translateX(0)' + flip, opacity: 0.55 }, { transform: 'translateX(' + dx + 'px)' + flip, opacity: 0 }], { duration: this.ms(320), easing: 'ease-out', fill: 'forwards' });
  if (a) a.onfinish = function () { g.remove(); }; else setTimeout(function () { g.remove(); }, 340);
};
/* A rare Skill or Power: a ring and rising lights around the hero. */
P.cutinAura = function (i, pal) {
  var FX = IB.FX, p = mid(heroBody(i), 0.5);
  if (!FX || !p) return;
  FX.ring(p.x, p.y, { color: pal.hi, r0: 10, r1: 90, w: 5, life: 0.5 });
  FX.burst(p.x, p.y + 20, { n: 16, colors: pal.fx, shape: 'star', speed: [30, 120], life: [0.5, 1], g: -120, size: [2, 5], jitter: 26 });
};

/* ------------------------------------------------------------------ sounds (fx.js synthesizer) */
if (SFX && SFX.define) {
  // o.d: when the band sweeps in, o.s: when the name lands (seconds, already at the replay speed)
  SFX.define('cutin', function (t, o, S) {
    o = o || {}; var d = o.d || 0, s = o.s || 0.2;
    S.noise(t + d, Math.max(0.1, s - d + 0.06), 0.24, { f: 260, f2: 3800, q: 0.7 });
    S.osc('sine', 84, t + s, 0.5, 0.55, null, { f2: 34 });
    S.noise(t + s, 0.32, 0.28, { f: 900, f2: 160, q: 0.6, verb: true });
    S.osc('triangle', 2093, t + s, 0.5, 0.06, null, { verb: true });
    S.osc('triangle', 3136, t + s + 0.03, 0.45, 0.04, null, { verb: true });
    S.noise(t + s, 0.12, 0.1, { f: 7000, q: 1.2 });
  });
  SFX.define('cutinhit', function (t, k, S) {
    S.noise(t, 0.2, 0.3, { f: 5200, f2: 900, q: 0.9 });
    S.osc('sine', 70, t, 0.4, 0.5, null, { f2: 30 });
    S.osc('triangle', 1568, t + 0.02, 0.35, 0.05, null, { verb: true });
  });
}
})(typeof window !== 'undefined' ? window : globalThis);
