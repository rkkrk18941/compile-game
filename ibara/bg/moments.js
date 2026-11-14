/* スレイザスパイア — milestone screens (next-level update, 2026-11-13).
   Neow's light, the act title card with a summary, a relic shown large before it joins the relic bar, the
   hammer of the campfire upgrade, gold flying to the purse and counting up, the card that refuses to be played.
   Presentation only. The steps that are replayed (relic, upgrade, gold) follow the replay speed, end with a tap
   and are skipped at speed 「なし」; the act card always waits for a tap (it is also the summary). */
(function (root) {
'use strict';
var STS = root.STS, IB = root.IBARA || (root.IBARA = {}), V = STS && STS.View, Dir = STS && STS.Director;
var NL = IB.NL || (IB.NL = {});
if (!V) return;
var esc = V.esc;
function layer() { return document.getElementById('floatLayer'); }
function reduce() { return !!(IB.FX && IB.FX.reduce); }
function anim(el, frames, o) { if (!el || !el.animate) return null; try { return el.animate(frames, o); } catch (e) { return null; } }
function rect(el) { return el ? el.getBoundingClientRect() : null; }
function mid(el, fy) { var r = rect(el); if (!r || (!r.width && !r.height)) return null; return { x: r.left + r.width / 2, y: r.top + r.height * (fy == null ? 0.5 : fy) }; }
function app() { return root.STS_APP; }
function sfx(n) { var A = app(); if (IB.SFX && IB.SFX.play && NL.sfxOn && NL.sfxOn()) try { IB.SFX.play(n); } catch (e) {} }

/* ------------------------------------------------------------------ Neow: a light in the dark (own drawing) */
V.neowArt = function () {
  return '<div class="nl-neow" aria-hidden="true"><svg viewBox="0 0 220 120">' +
    '<defs><radialGradient id="neowLight" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffe6a0" stop-opacity=".9"/><stop offset=".6" stop-color="#7ac8ff" stop-opacity=".25"/><stop offset="1" stop-color="#2a4a8a" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="neowBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2a44"/><stop offset="1" stop-color="#06080f"/></linearGradient></defs>' +
    '<g class="nl-neow-rays">' + [0, 30, 60, 90, 120, 150].map(function (a) { return '<rect x="108" y="-30" width="4" height="180" rx="2" fill="#ffe9b0" opacity=".16" transform="rotate(' + a + ' 110 60)"/>'; }).join('') + '</g>' +
    '<circle class="nl-neow-glow" cx="110" cy="60" r="58" fill="url(#neowLight)"/>' +
    // an old whale-spirit rising from the dark: wide head, small eye, fins and a long trailing body
    '<path class="nl-neow-body" d="M28 78 C40 46 78 30 118 32 C150 34 176 46 190 62 C198 71 196 80 186 84 C170 90 150 86 132 84 C112 82 96 90 80 96 C62 103 40 100 28 92 C22 88 24 82 28 78 Z M150 84 C160 96 170 104 184 106 C170 110 156 104 146 92 Z M70 96 C66 106 58 112 46 114 C56 106 60 100 62 94 Z" fill="url(#neowBody)" stroke="#9cc8ff" stroke-opacity=".35" stroke-width="1.2"/>' +
    '<circle class="nl-neow-eye" cx="160" cy="58" r="3.4" fill="#fff4c8"/>' +
    '<g class="nl-neow-motes" fill="#fff2c0">' + [[40, 30, 1.6], [70, 18, 1.2], [176, 24, 1.4], [196, 40, 1], [24, 52, 1.1], [130, 14, 1.3]].map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" style="animation-delay:' + (i * 0.35).toFixed(2) + 's"/>'; }).join('') + '</g>' +
    '</svg></div>';
};

/* ------------------------------------------------------------------ the act title card (always waits for a tap) */
NL.actCard = function (act, run, me) {
  var L = layer(); if (!L || !run) return null;
  var old = L.querySelector('.nl-actcard'); if (old) old.remove();
  var p = run.players[me] || run.players[0];
  var s = run.stats || {}, maxHp = p.relics && p.relics.some(function (r) { return r.id === 'MarkOfPain'; }) ? Math.min(6, p.maxHp) : p.maxHp;
  var el = document.createElement('div');
  el.className = 'nl-actcard act-' + act;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '第' + act + '幕');
  el.innerHTML = '<div class="nl-act-inner"><small>' + (act >= 4 ? '最終幕' : 'ACT ' + ['', 'I', 'II', 'III', 'IV'][act]) + '</small><h2>第' + act + '幕</h2>' +
    '<p class="nl-act-sub">' + esc(act >= 4 ? '3つの鍵が塔の心臓への道を開いた' : '塔の上層へ') + '</p>' +
    '<dl class="nl-act-sum"><div><dt>倒した敵</dt><dd>' + (s.kills | 0) + '<small>体</small></dd></div><div><dt>残りHP</dt><dd>' + Math.max(0, p.hp) + '<small>/' + maxHp + '</small></dd></div><div><dt>デッキ</dt><dd>' + p.deck.length + '<small>枚</small></dd></div></dl>' +
    '<button type="button" class="btn primary nl-act-go">タップして進む</button></div>';
  function close(e) { if (e) { e.preventDefault(); e.stopPropagation(); } el.remove(); }
  el.addEventListener('click', close);
  L.appendChild(el);
  var go = el.querySelector('.nl-act-go'); if (go) try { go.focus({ preventScroll: true }); } catch (e) {}
  sfx('turn');
  return el;
};
NL.onEvent = function (ev, A) {
  if (!ev || !A) return;
  if (ev.t === 'act' && A.screen === 'game') { var run = A.sess && A.sess.run(); if (run) NL.actCard(ev.act, run, A.me); }
};

/* ------------------------------------------------------------------ the card that cannot be played */
NL.nope = function (el) {
  if (!el || reduce()) return;
  anim(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)', offset: 0.2 }, { transform: 'translateX(5px)', offset: 0.45 }, { transform: 'translateX(-3px)', offset: 0.7 }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out', composite: 'add' });
};

/* ------------------------------------------------------------------ replayed steps out of combat */
if (Dir) {
  var P = Dir.prototype;
  /* A relic shown large, its name and effect in one line, then it flies to the relic bar. */
  P.on_gainRelic = function (ev, pre, me) {
    if (ev.i !== me) return 0;
    var L = layer(), d = STS.RELICS[ev.id]; if (!L || !d) return 0;
    var tx = String(d.tx || ''), cut = tx.indexOf('。'), line = cut >= 0 ? tx.slice(0, cut + 1) : tx;
    var el = this.moment('nl-relicshow', '<div class="nl-relic-card"><img src="' + esc(V.relicImg(ev.id)) + '" alt=""><b>' + esc(d.name || ev.id) + '</b><span>' + esc(line) + '</span></div><span class="nl-tap">タップでとばす</span>', 1500);
    sfx('rare');
    var self = this;
    if (el && !reduce()) {
      var card = el.querySelector('.nl-relic-card'), img = card.querySelector('img');
      anim(card, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.06)', offset: 0.14 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.24 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.7 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: this.ms(1500), fill: 'forwards' });
      setTimeout(function () {
        if (self.momentEl !== el) return;
        var to = mid(document.querySelector('#app .relicbar .relic[data-rid="' + ev.id + '"]')) || mid(document.querySelector('#app .relicbar'));
        var from = mid(img);
        if (!to || !from) return;
        var fly = document.createElement('img'); fly.className = 'nl-relicfly'; fly.src = V.relicImg(ev.id); fly.style.left = from.x + 'px'; fly.style.top = from.y + 'px';
        L.appendChild(fly);
        var a = anim(fly, [{ transform: 'translate(-50%,-50%) scale(1.6)', opacity: 1 }, { transform: 'translate(' + (to.x - from.x) + 'px,' + (to.y - from.y) + 'px) translate(-50%,-50%) scale(.5)', opacity: 0.9 }], { duration: self.ms(420), easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
        if (a) a.onfinish = function () { fly.remove(); var b = document.querySelector('#app .relicbar .relic[data-rid="' + ev.id + '"]'); if (b) anim(b, [{ transform: 'scale(1.5)', filter: 'brightness(2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 360 }); };
        else setTimeout(function () { fly.remove(); }, 450);
      }, this.ms(1050));
    }
    return 1500;
  };
  /* The campfire upgrade: the hammer strikes, sparks fly, the card becomes its upgraded self. */
  P.on_upgrade = function (ev, pre, me) {
    var A = app(), run = A && A.sess && A.sess.run();
    if (ev.i !== me || !run || !run.room || run.room.t !== 'R' || !ev.ids || !ev.ids.length) return 0;
    var id = ev.ids[0];
    var el = this.moment('nl-forge', '<div class="nl-forge-card">' + V.card({ id: id, up: false }, { attrs: 'tabindex="-1"', cls: 'nl-forge-before' }) + '</div>' +
      '<svg class="nl-hammer" viewBox="0 0 64 64" aria-hidden="true"><rect x="28" y="22" width="7" height="40" rx="2" fill="#7a4a22" stroke="#2a1608" stroke-width="1.5"/><rect x="10" y="8" width="44" height="18" rx="3" fill="#8a8f98" stroke="#20242a" stroke-width="2"/><rect x="12" y="10" width="40" height="5" rx="2" fill="#c8ccd2"/></svg>' +
      '<p class="nl-forge-word">強化</p><span class="nl-tap">タップでとばす</span>', 1200);
    if (!el) return 0;
    if (A && STS.UI && STS.UI.fitCards) try { STS.UI.fitCards(el); } catch (e) {}
    var self = this, holder = el.querySelector('.nl-forge-card'), hammer = el.querySelector('.nl-hammer');
    if (!reduce()) anim(hammer, [{ transform: 'translate(-10%,-60%) rotate(-50deg)', opacity: 0 }, { transform: 'translate(-10%,-60%) rotate(-50deg)', opacity: 1, offset: 0.2 }, { transform: 'translate(-10%,-30%) rotate(18deg)', opacity: 1, offset: 0.42 }, { transform: 'translate(-10%,-40%) rotate(0deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-10%,-40%) rotate(0deg)', opacity: 0 }], { duration: this.ms(1200), fill: 'forwards' });
    setTimeout(function () {
      if (self.momentEl !== el) return;
      var c = mid(holder, 0.25);
      if (c && IB.FX) { IB.FX.burst(c.x, c.y, { n: 26, colors: ['#ffffff', '#ffe08a', '#ff9a3a'], speed: [120, 360], life: [0.25, 0.6], g: 380, size: [2, 4] }); IB.FX.ring(c.x, c.y, { color: '#ffe6a0', r0: 6, r1: 70, w: 4, life: 0.35 }); }
      sfx('heavyhit');
      holder.innerHTML = V.card({ id: id, up: true }, { attrs: 'tabindex="-1"', cls: 'nl-forge-after' });
      if (STS.UI && STS.UI.fitCards) try { STS.UI.fitCards(el); } catch (e) {}
      anim(holder, [{ transform: 'translate(-50%,-50%) scale(1.12)', filter: 'brightness(1.8)' }, { transform: 'translate(-50%,-50%) scale(1)', filter: 'brightness(1)' }], { duration: self.ms(380), easing: 'ease-out' });
    }, this.ms(500));
    return 1200;
  };
  /* Gold flies to the purse and the number counts up. */
  var baseGold = P.on_gold;
  P.on_gold = function (ev, pre, me) {
    var w = baseGold ? baseGold.call(this, ev, pre, me) : 0;
    if (ev.i !== me || !(ev.n > 0)) return w;
    var stat = document.querySelector('#app .stat.gold'), num = stat && stat.querySelector('b');
    var to = mid(stat), src = document.querySelector('#app .reward-treasure img') || document.querySelector('#app .rewards') || document.querySelector('#app .stage');
    var from = mid(src, 0.4);
    if (to && from && IB.FX && !reduce()) {
      var L = layer();
      for (var i = 0; i < Math.min(8, 2 + ev.n); i++) (function (k) {
        var c = document.createElement('i'); c.className = 'nl-coin'; c.style.left = from.x + 'px'; c.style.top = from.y + 'px'; L.appendChild(c);
        var dx = to.x - from.x, dy = to.y - from.y, bend = (Math.random() * 2 - 1) * 40;
        var a = anim(c, [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(' + (dx * 0.4 + bend) + 'px,' + (dy * 0.4 - 30) + 'px) translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) translate(-50%,-50%) scale(.7)', opacity: 0.9 }], { duration: this.ms(520), delay: this.ms(k * 45), easing: 'ease-in', fill: 'both' });
        if (a) a.onfinish = function () { c.remove(); }; else setTimeout(function () { c.remove(); }, 900);
      }).call(this, i);
    }
    if (num) {
      // count up from the old amount to the new one (the next redraw shows the same final number)
      var end = +num.textContent || 0, start = Math.max(0, end - ev.n), t0 = Date.now(), dur = this.ms(560);
      num.textContent = String(start);
      var tick = function () { var k = Math.min(1, (Date.now() - t0) / dur); if (!num.isConnected) return; num.textContent = String(Math.round(start + (end - start) * k)); if (k < 1) requestAnimationFrame(tick); };
      setTimeout(function () { requestAnimationFrame(tick); }, this.ms(260));
    }
    return Math.max(w || 0, 260);
  };
}

/* ------------------------------------------------------------------ after every draw */
var seenPrompt = null;
NL.afterDrawMoments = function (A, run) {
  // a rare card among the card rewards: a short chime the first time the choice is shown
  var cur = A && A.sess && A.sess.pending ? A.sess.pending()[0] : null;
  if (cur && cur.q && cur.q.type === 'cardReward' && cur.id !== seenPrompt) {
    seenPrompt = cur.id;
    if (cur.q.cards.some(function (c) { return (STS.CARDS[c.id] || {}).r === 'R'; })) setTimeout(function () { sfx('rare'); }, 420);
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
