/* 茨の塔 — rules engine (no DOM).
   Combat follows the round structure of the cooperative deck-building board game it is modelled on:
   Player Turn (reset → draw 5 → roll the die → start-of-turn abilities → play → end-of-turn) then
   Enemy Turn (remove enemy block → enemies act → move cubes). Single / die / cube enemy actions,
   token statuses with caps (Strength 8, Weak 3, Vulnerable 3, Poison 30 total, Block 20, Energy 6). */
(function () {
'use strict';
var ROOT = typeof globalThis !== 'undefined' ? globalThis : window;
var G = ROOT.IBARA || (ROOT.IBARA = {});

var CAP = { str: 8, weak: 3, vuln: 3, poisonTotal: 30, shiv: 5, miracle: 5, block: 20, energy: 6, orbMax: 5, enemies: 6 };
G.CAP = CAP;

/* ---------------- RNG ---------------- */
function makeRng(seed) {
  var s = (seed >>> 0) || 1;
  var r = {
    next: function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    int: function (n) { return Math.floor(r.next() * n); },
    pick: function (a) { return a[r.int(a.length)]; },
    shuffle: function (a) { for (var i = a.length - 1; i > 0; i--) { var j = r.int(i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  };
  Object.defineProperty(r, 'state', { get: function () { return s; }, set: function (v) { s = v >>> 0; } });
  return r;
}
G.makeRng = makeRng;

/* ---------------- cards ---------------- */
var UID = 1;
function mkCard(id, up) { return { uid: UID++, id: id, up: !!up }; }
function bumpUid(list) { list.forEach(function (c) { if (c && c.uid >= UID) UID = c.uid + 1; }); }
function cdef(c) { return G.CARDS[c.id || c]; }
function isUp(c) { return !!(c.up || c.cup); }
function val(c, k) { var d = cdef(c); var a = d.v && d.v[k]; if (a == null) return 0; return Array.isArray(a) ? a[isUp(c) ? 1 : 0] : a; }
function baseCost(c) { var d = cdef(c); if (isUp(c) && d.costUp !== undefined) return d.costUp; return d.cost; }
function kws(c) { var d = cdef(c); return (isUp(c) && d.kwUp) ? d.kwUp : (d.kw || []); }
function hasKw(c, k) { return kws(c).indexOf(k) >= 0; }
function canUpgrade(c) { var d = cdef(c); return !c.up && d.type !== 'status' && d.type !== 'curse' && !d.noUp; }
G.card = { mk: mkCard, def: cdef, isUp: isUp, val: val, baseCost: baseCost, kws: kws, hasKw: hasKw, canUpgrade: canUpgrade, bumpUid: bumpUid };

var SLEEP_ACT = { name: '眠り', fx: [['none']], icon: 'sleep' };
var STUN_ACT = { name: 'ふらつき', fx: [['none']], icon: 'stun' };
G.SLEEP_ACT = SLEEP_ACT; G.STUN_ACT = STUN_ACT;

function sum(a, f) { var s = 0; for (var i = 0; i < a.length; i++) s += f(a[i]); return s; }

/* =====================================================================
   COMBAT
   ===================================================================== */
function Combat(game, spec) {
  this.g = game; this.run = game.run; this.io = game.io; this.rng = game.rng; this.spec = spec;
  var run = this.run, H = G.HEROES[run.hero];
  this.H = H;
  this.hero = {
    isHero: true, id: run.hero, name: H.name, hp: run.hp, maxHp: run.maxHp, block: 0, str: 0, weak: 0, vuln: 0, energy: 0,
    shiv: 0, miracle: 0, stance: 'none', orbs: [], orbSlots: H.orbSlots || 0, powers: {},
    next: { block: 0, energy: 0, draw: 0, miracle: 0 }, keepBlock: false, retaliate: 0, plated: 0
  };
  this.enemies = []; this.draw = []; this.hand = []; this.discard = []; this.exhaust = []; this.powerCards = [];
  this.round = 0; this.die = 0; this.phase = 'setup'; this.over = false; this.result = null;
  this.t = this.freshTurn(); this.flags = {}; this.queue = Promise.resolve(); this._end = null;
  this.skipEnemyTurn = false; this.focus = null; this.doubleNext = 0; this.stolen = 0; this.fled = false;
}
G.Combat = Combat;
var CP = Combat.prototype;

CP.freshTurn = function () { return { cards: 0, attacks: 0, skills: 0, exhausted: 0, discarded: 0, stanceChanged: false, echo: false, dmgMul: 1, doubleAtk: false, endReq: false }; };
CP.emit = function (type, data) { data = data || {}; data.c = this; return this.io.emit(type, data) || Promise.resolve(); };
CP.choose = function (spec) { spec.c = this; return this.io.choose(spec); };
CP.alive = function () { return this.enemies.filter(function (e) { return e.alive; }); };
CP.byUid = function (uid) { if (!uid) return null; for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].uid === uid) return this.enemies[i]; return null; };
CP.focusTarget = function () { var f = this.byUid(this.focus); if (f && f.alive) return f; var a = this.alive(); return a[0] || null; };
CP.powerCount = function () { return this.powerCards.length; };
CP.enqueue = function (fn) {
  var self = this;
  var p = this.queue.then(function () { return self.over ? null : fn(); });
  this.queue = p.then(null, function (e) { console.error(e); });
  return p;
};

/* ---------- setup / loop ---------- */
CP.start = function () {
  var self = this, run = this.run;
  (this.spec.enemies || []).forEach(function (id) {
    var rid = id.indexOf('random:') === 0 ? self.g.drawSummon(id.slice(7)) : id;
    self.spawn(rid);
  });
  var cards = run.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up }; });
  this.rng.shuffle(cards);
  var innate = cards.filter(function (c) { return hasKw(c, 'innate'); });
  var rest = cards.filter(function (c) { return !hasKw(c, 'innate'); });
  this.draw = rest.concat(innate); // top of the pile = end of array
  return this.loop();
};
CP.loop = async function () {
  await this.emit('combatStart', {});
  while (!this.over) {
    await this.startPlayerTurn();
    if (this.over) break;
    var self = this;
    await new Promise(function (res) { self._end = res; if (self.over || self._endPending) { self._endPending = false; self._end = null; res(); } });
    if (this.over) break;
    await this.endPlayerTurn();
    if (this.over) break;
    if (this.skipEnemyTurn) { this.skipEnemyTurn = false; await this.emit('skipEnemy', {}); continue; }
    await this.enemyTurn();
  }
  await this.finishCombat();
  return this.result;
};
CP.finish = function (result) {
  if (this.over) return; this.over = true; this.result = result;
  if (this._end) { var r = this._end; this._end = null; r(); }
};
CP.checkEnd = function () {
  if (this.over) return;
  if (this.hero.hp <= 0) return;
  if (this.alive().length === 0) this.finish(this.fled && !this.anyKilled ? 'fled' : 'victory');
};
CP.abort = function () { this.aborted = true; this.over = true; if (this._end) { var r = this._end; this._end = null; r(); } };
CP.finishCombat = async function () {
  var run = this.run, h = this.hero;
  if (this.aborted) return;
  if (this.result === 'victory' || this.result === 'fled') {
    this.phase = 'over';
    await this.relicHook('onCombatEnd');
    if (h.powers.d_repair) await this.healHero(h.powers.d_repair);
    run.hp = Math.max(1, h.hp); run.maxHp = h.maxHp;
    await this.emit('combatEnd', { result: this.result });
  } else {
    run.hp = 0;
    await this.emit('combatEnd', { result: 'defeat' });
  }
};

/* ---------- enemies ---------- */
CP.spawn = function (id, o) {
  o = o || {};
  var d = G.ENEMIES[id];
  if (!d) throw new Error('unknown enemy ' + id);
  if (this.alive().length >= CAP.enemies) return null;
  var hp = o.hp != null ? o.hp : d.hp;
  var e = { uid: 'e' + (UID++), id: id, name: d.name, hp: hp, maxHp: o.maxHp || hp, block: d.startBlock || 0, str: 0, weak: 0, vuln: 0, poison: 0,
    alive: true, isBoss: !!d.boss, cube: 0, mode: d.startMode || null, st: {}, justSummoned: !!o.summoned };
  if (o.after && this.enemies.indexOf(o.after) >= 0) this.enemies.splice(this.enemies.indexOf(o.after) + 1, 0, e); else this.enemies.push(e);
  if (d.init) d.init(this, e);
  return e;
};
CP.patternOf = function (e) { var d = G.ENEMIES[e.id]; return d.modes ? d.modes[e.mode] : d; };
CP.actionOf = function (e) {
  var d = G.ENEMIES[e.id];
  if (e.st.sleep) return d.sleepAct || SLEEP_ACT;
  if (e.st.stun) return STUN_ACT;
  if (d.override) { var o = d.override(this, e); if (o) return o; }
  var p = this.patternOf(e);
  if (p.single) return p.single;
  if (p.die) { var v = this.die || 1; for (var i = 0; i < p.die.length; i++) { var r = p.die[i]; if (v >= r[0] && v <= r[1]) return r[2]; } return p.die[0][2]; }
  if (p.cube) return p.cube.acts[Math.min(e.cube, p.cube.acts.length - 1)];
  return SLEEP_ACT;
};
CP.advanceCube = function (e) { var p = this.patternOf(e); if (!p || !p.cube) return; e.cube++; if (e.cube >= p.cube.acts.length) e.cube = p.cube.loop || 0; };
CP.setMode = async function (e, mode) { e.mode = mode; e.cube = 0; if (this.phase === 'enemy') e.st.noAdvance = true; await this.emit('mode', { e: e }); };
CP.previewEnemyHit = function (e, base) {
  var h = this.hero, weak = e.weak > 0, vul = h.vuln > 0;
  var per = base + e.str;
  if (weak && !vul) per -= 1; else if (vul && !weak) per *= 2;
  return Math.max(0, per);
};
CP.summon = async function (src, id, n) {
  var list = [];
  for (var i = 0; i < (n || 1); i++) {
    var rid = id;
    if (id.indexOf('random:') === 0) rid = this.g.drawSummon(id.slice(7));
    var e = this.spawn(rid, { after: list.length ? list[list.length - 1] : src, summoned: true });
    if (e) list.push(e);
  }
  if (list.length) await this.emit('summon', { list: list, src: src });
  return list;
};
CP.splitEnemy = async function (e, childId) {
  e.st.split = true; var hp = e.hp; e.alive = false; e.hp = 0; e.block = 0;
  var pois = e.poison; e.poison = 0;
  await this.emit('split', { e: e });
  var a = Math.ceil(hp / 2), b = Math.floor(hp / 2), list = [];
  var c1 = this.spawn(childId, { hp: a, maxHp: a, after: e }); if (c1) { list.push(c1); c1.poison = Math.ceil(pois / 2); }
  if (b > 0) { var c2 = this.spawn(childId, { hp: b, maxHp: b, after: c1 || e }); if (c2) { list.push(c2); c2.poison = Math.floor(pois / 2); } }
  if (list.length) await this.emit('summon', { list: list, src: e, split: true });
  this.checkEnd();
};
CP.enemyFlee = async function (e) {
  e.alive = false; e.fled = true; this.fled = true;
  await this.emit('flee', { e: e });
  this.checkEnd();
};
CP.gainEnemyBlock = async function (e, n) { if (!e.alive || n <= 0) return; e.block += n; await this.emit('block', { t: e, amount: n }); };
CP.healEnemy = async function (e, n) { var b = e.hp; e.hp = Math.min(e.maxHp, e.hp + n); if (e.hp > b) await this.emit('heal', { t: e, amount: e.hp - b }); };

CP.enemyDo = async function (e, act) {
  await this.emit('enemyAct', { e: e, act: act });
  var loss = 0;
  for (var i = 0; i < act.fx.length; i++) {
    if (this.over || !e.alive) break;
    var op = act.fx[i], k = op[0], a = op[1], b = op[2];
    switch (k) {
      case 'atk': loss += await this.enemyAttack(e, a, b || 1); break;
      case 'block': await this.gainEnemyBlock(e, a); break;
      case 'blockAlly': {
        var others = this.alive().filter(function (x) { return x !== e; }).sort(function (x, y) { return x.hp - y.hp; });
        await this.gainEnemyBlock(others[0] || e, a); break;
      }
      case 'blockAll': { var al = this.alive(); for (var j = 0; j < al.length; j++) await this.gainEnemyBlock(al[j], a); break; }
      case 'str': await this.addStatus(e, 'str', a); break;
      case 'strAll': { var al2 = this.alive(); for (var j2 = 0; j2 < al2.length; j2++) await this.addStatus(al2[j2], 'str', a); break; }
      case 'weak': await this.addStatus(this.hero, 'weak', a); break;
      case 'vuln': await this.addStatus(this.hero, 'vuln', a); break;
      case 'status': await this.addStatusCards(a, b || 1, op[3] || 'discard'); break;
      case 'summon': await this.summon(e, a, b || 1); break;
      case 'heal': await this.healEnemy(e, a); break;
      case 'flee': await this.enemyFlee(e); break;
      case 'mode': await this.setMode(e, a); break;
      case 'fn': await G.ENEMIES[e.id].fns[a](this, e, b); break;
      default: break;
    }
  }
  e.st.lastLoss = loss;
  return loss;
};
CP.enemyAttack = async function (e, base, hits) {
  var h = this.hero, weak = e.weak > 0, vul = h.vuln > 0;
  var per = this.previewEnemyHit(e, base);
  await this.emit('enemyAttack', { e: e, per: per, hits: hits });
  var loss = 0;
  for (var i = 0; i < hits && !this.over; i++) loss += await this.damageHero(per, { hit: true, src: e });
  if (weak && e.alive) { e.weak--; await this.emit('status', { t: e, key: 'weak', delta: -1 }); }
  if (vul) { h.vuln--; await this.emit('status', { t: h, key: 'vuln', delta: -1 }); }
  if (!this.over && h.retaliate > 0 && e.alive) await this.damageEnemy(e, h.retaliate, { kind: 'thorns' });
  var d = G.ENEMIES[e.id];
  if (!this.over && d.afterAttack && e.alive) await d.afterAttack(this, e, loss);
  return loss;
};

/* ---------- damage ---------- */
CP.damageHero = async function (n, o) {
  o = o || {};
  var h = this.hero; if (this.over || n <= 0) { if (n <= 0 && o.hit) await this.emit('heroDamage', { amount: 0, blocked: 0, loss: 0, hit: true, src: o.src }); return 0; }
  var blocked = 0, loss = n;
  if (!o.loseHP) { blocked = Math.min(h.block, n); h.block -= blocked; loss = n - blocked; }
  h.hp -= loss;
  this.run.stats.dmgTaken += loss;
  await this.emit('heroDamage', { amount: n, blocked: blocked, loss: loss, hit: !!o.hit, src: o.src, loseHP: !!o.loseHP });
  if (loss > 0 && o.fromCard && h.powers.k_scaroath && h.hp > 0) await this.addStatus(h, 'str', h.powers.k_scaroath);
  if (h.hp <= 0) await this.heroDeath();
  return loss;
};
CP.loseHP = function (n, o) { o = o || {}; o.loseHP = true; return this.damageHero(n, o); };
CP.heroDeath = async function () {
  var h = this.hero, pots = this.run.potions;
  var fi = pots.indexOf('p_fairy');
  if (fi >= 0) { pots.splice(fi, 1); h.hp = Math.min(h.maxHp, 3); await this.emit('revive', {}); return; }
  h.hp = 0; this.finish('defeat');
};
CP.healHero = async function (n) { var h = this.hero, b = h.hp; h.hp = Math.min(h.maxHp, h.hp + n); if (h.hp > b) await this.emit('heal', { t: h, amount: h.hp - b }); };
CP.damageEnemy = async function (e, n, o) {
  o = o || {};
  if (!e || !e.alive || this.over) return { loss: 0, killed: false };
  var blocked = o.loseHP ? 0 : Math.min(e.block, n);
  e.block -= blocked; var loss = Math.max(0, n - blocked); e.hp -= loss;
  if (loss > 0) this.run.stats.dmgDealt += loss;
  if (o.hit) e.st._dealt = (e.st._dealt || 0) + loss;
  await this.emit('enemyDamage', { e: e, amount: n, blocked: blocked, loss: loss, hit: !!o.hit, kind: o.kind || (o.hit ? 'hit' : 'dmg') });
  var d = G.ENEMIES[e.id];
  if (e.hp <= 0) { await this.killEnemy(e); return { loss: loss, killed: true }; }
  if (loss > 0 && d.onHpLoss) await d.onHpLoss(this, e, loss, o);
  return { loss: loss, killed: false };
};
CP.killEnemy = async function (e) {
  e.alive = false; e.hp = 0; e.block = 0; e.poison = 0; e.weak = 0; e.vuln = 0; e.str = 0;
  this.anyKilled = true;
  this.run.stats.kills++;
  await this.emit('enemyDeath', { e: e });
  var d = G.ENEMIES[e.id];
  if (d.onDeath) await d.onDeath(this, e);
  var al = this.alive();
  for (var i = 0; i < al.length; i++) { var od = G.ENEMIES[al[i].id]; if (od.onAllyDeath) await od.onAllyDeath(this, al[i], e); }
  await this.relicHook('onKill', e);
  this.checkEnd();
};

/* hero attacks (hits) */
CP.heroHitBase = function () { var h = this.hero; return h.str + (h.stance === 'wrath' ? 1 : 0) + (h.stance === 'divine' ? 2 : 0); };
CP.previewHeroHit = function (base, target, o) {
  o = o || {};
  var h = this.hero;
  var per = base + this.heroHitBase() + (o.strMul ? h.str * (o.strMul - 1) : 0);
  var weak = h.weak > 0, vul = !!(target && target.vuln > 0);
  if (weak && !vul) per -= 1; else if (vul && !weak) per *= 2;
  per *= (this.t.dmgMul || 1);
  return Math.max(0, per);
};
CP.attack = async function (target, base, hits, o) {
  o = o || {}; hits = hits == null ? 1 : hits;
  if (!target || !target.alive) target = this.focusTarget();
  if (!target || this.over) return { killed: false, dealt: 0 };
  var h = this.hero, weak = h.weak > 0, vul = target.vuln > 0;
  var per = this.previewHeroHit(base, target, o);
  this.focus = target.uid;
  await this.emit('heroAttack', { t: target, per: per, hits: hits, shiv: !!o.shiv });
  var dealt = 0, killed = false;
  for (var i = 0; i < hits; i++) {
    if (!target.alive || this.over) break;
    var r = await this.damageEnemy(target, per, { hit: true, kind: o.shiv ? 'shiv' : 'hit' });
    dealt += r.loss; if (r.killed) killed = true;
  }
  if (weak) { h.weak--; await this.emit('status', { t: h, key: 'weak', delta: -1 }); }
  if (vul && target.alive) { target.vuln--; await this.emit('status', { t: target, key: 'vuln', delta: -1 }); }
  await this.afterHeroAttack([target], dealt);
  return { killed: killed, dealt: dealt };
};
CP.afterHeroAttack = async function (targets, dealt) {
  var h = this.hero;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (t.alive && t.st.thorns && !this.over) await this.damageHero(t.st.thorns, { src: t, kind: 'thorns' });
    if (t.alive && h.powers.h_envenom && t.st._dealt > 0) await this.applyPoison(t, h.powers.h_envenom);
    t.st._dealt = 0;
  }
  this.checkEnd();
};
CP.attackAll = async function (base, hits, o) {
  o = o || {}; hits = hits == null ? 1 : hits;
  var h = this.hero, weak = h.weak > 0, targets = this.alive();
  if (!targets.length || this.over) return { killed: 0, dealt: 0 };
  var vul = targets.map(function (t) { return t.vuln > 0; });
  await this.emit('heroAttackAll', { targets: targets, hits: hits });
  var dealt = 0, killed = 0;
  for (var i = 0; i < hits; i++) {
    for (var j = 0; j < targets.length; j++) {
      var t = targets[j]; if (!t.alive || this.over) continue;
      var per = this.previewHeroHit(base, t, o);
      var r = await this.damageEnemy(t, per, { hit: true, kind: 'aoe' });
      dealt += r.loss; if (r.killed) killed++;
    }
  }
  if (weak) { h.weak--; await this.emit('status', { t: h, key: 'weak', delta: -1 }); }
  for (var k = 0; k < targets.length; k++) if (vul[k] && targets[k].alive) { targets[k].vuln--; await this.emit('status', { t: targets[k], key: 'vuln', delta: -1 }); }
  await this.afterHeroAttack(targets, dealt);
  return { killed: killed, dealt: dealt };
};
CP.attackRandom = async function (base, hits, o) {
  o = o || {};
  var h = this.hero, weak = h.weak > 0, touched = [], vulStart = {};
  var dealt = 0;
  for (var i = 0; i < hits && !this.over; i++) {
    var al = this.alive(); if (!al.length) break;
    var t = this.rng.pick(al);
    if (touched.indexOf(t) < 0) { touched.push(t); vulStart[t.uid] = t.vuln > 0; }
    var per = this.previewHeroHit(base, t, o);
    await this.emit('heroAttack', { t: t, per: per, hits: 1, random: true });
    var r = await this.damageEnemy(t, per, { hit: true, kind: 'hit' });
    dealt += r.loss;
  }
  if (weak) { h.weak--; await this.emit('status', { t: h, key: 'weak', delta: -1 }); }
  for (var k = 0; k < touched.length; k++) if (vulStart[touched[k].uid] && touched[k].alive) { touched[k].vuln--; await this.emit('status', { t: touched[k], key: 'vuln', delta: -1 }); }
  await this.afterHeroAttack(touched, dealt);
  return { dealt: dealt };
};

/* ---------- statuses & resources ---------- */
CP.addStatus = async function (t, key, n) {
  if (!n || !t) return 0;
  if (!t.isHero && !t.alive) return 0;
  if (t.isHero && n > 0 && (key === 'weak' || key === 'vuln') && this.flags.ward > 0) { this.flags.ward--; await this.emit('relicFlash', { id: 'r_charm' }); return 0; }
  var cap = CAP[key] || 99, before = t[key];
  t[key] = Math.max(0, Math.min(cap, t[key] + n));
  var delta = t[key] - before;
  if (delta) await this.emit('status', { t: t, key: key, delta: delta });
  return delta;
};
CP.poisonTotal = function () { return sum(this.alive(), function (e) { return e.poison; }); };
CP.applyPoison = async function (e, n) {
  if (!e || !e.alive || n <= 0) return 0;
  if (this.run.relics.indexOf('r_sheath') >= 0) n += 1;
  var add = Math.max(0, Math.min(n, CAP.poisonTotal - this.poisonTotal()));
  if (add <= 0) return 0;
  e.poison += add;
  await this.emit('status', { t: e, key: 'poison', delta: add });
  return add;
};
CP.applyAll = async function (key, n) {
  var al = this.alive();
  for (var i = 0; i < al.length; i++) { if (key === 'poison') await this.applyPoison(al[i], n); else await this.addStatus(al[i], key, n); }
};
CP.gainBlock = async function (n, o) {
  o = o || {};
  var h = this.hero; var amt = n;
  if (o.fromCard && h.powers.h_light) amt += h.powers.h_light;
  if (amt <= 0) return 0;
  var before = h.block; h.block = Math.min(CAP.block, h.block + amt);
  var d = h.block - before;
  await this.emit('block', { t: h, amount: d });
  return d;
};
CP.gainEnergy = async function (n) { var h = this.hero; var b = h.energy; h.energy = Math.min(Math.max(CAP.energy, h.energy), h.energy + n); if (h.energy !== b) await this.emit('energy', { delta: h.energy - b }); };
CP.gainStr = function (n) { return this.addStatus(this.hero, 'str', n); };
CP.gainMiracle = async function (n) { var h = this.hero, b = h.miracle; h.miracle = Math.min(CAP.miracle, h.miracle + n); if (h.miracle !== b) await this.emit('token', { key: 'miracle', delta: h.miracle - b }); };
CP.gainShiv = async function (n) {
  var h = this.hero;
  for (var i = 0; i < n && !this.over; i++) {
    if (h.shiv < CAP.shiv) { h.shiv++; await this.emit('token', { key: 'shiv', delta: 1 }); }
    else { var t = this.focusTarget(); if (t) await this.throwShiv(t); }
  }
};
CP.throwShiv = async function (t) {
  var dmg = 1 + (this.hero.powers.h_accuracy || 0);
  await this.emit('shivThrow', { t: t });
  await this.attack(t, dmg, 1, { shiv: true });
};

/* ---------- piles ---------- */
CP.drawCards = async function (n) {
  var drawn = [];
  for (var i = 0; i < n; i++) {
    if (!this.draw.length) { if (!this.discard.length) break; await this.reshuffle(); }
    var c = this.draw.pop(); this.hand.push(c); drawn.push(c);
    await this.emit('draw', { cards: [c] });
  }
  for (var j = 0; j < drawn.length; j++) { var d = cdef(drawn[j]); if (d.onDraw) await d.onDraw(this, drawn[j]); }
  return drawn;
};
CP.reshuffle = async function () {
  this.draw = this.rng.shuffle(this.discard.splice(0));
  await this.emit('shuffle', { n: this.draw.length });
  await this.relicHook('onShuffle');
};
CP.discardFromHand = async function (cards) {
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i], ix = this.hand.indexOf(c); if (ix < 0) continue;
    this.hand.splice(ix, 1); this.discard.push(c); this.t.discarded++;
    await this.emit('discard', { cards: [c], byEffect: true });
    var d = cdef(c); if (d.onDiscard) await d.onDiscard(this, c);
  }
};
CP.removeFromPiles = function (c) {
  var piles = [this.hand, this.draw, this.discard];
  for (var i = 0; i < piles.length; i++) { var ix = piles[i].indexOf(c); if (ix >= 0) piles[i].splice(ix, 1); }
};
CP.exhaustCard = async function (c) {
  this.removeFromPiles(c);
  this.exhaust.push(c); this.t.exhausted++;
  await this.emit('exhaust', { card: c });
  var h = this.hero;
  if (h.powers.k_burnwill) await this.gainBlock(h.powers.k_burnwill);
  if (h.powers.k_ashembrace) await this.drawCards(h.powers.k_ashembrace);
  await this.relicHook('onExhaust', c);
};
CP.addCardTo = async function (id, where, o) {
  o = o || {};
  var c = mkCard(id, o.up); c.temp = true;
  if (where === 'drawTop') this.draw.push(c);
  else if (where === 'drawRandom') this.draw.splice(this.rng.int(this.draw.length + 1), 0, c);
  else if (where === 'hand') this.hand.push(c);
  else this.discard.push(c);
  await this.emit('addCards', { cards: [c], where: where });
  return c;
};
CP.addStatusCards = async function (id, n, where) {
  for (var i = 0; i < n; i++) await this.addCardTo(id, where);
};

/* ---------- orbs (cores) ---------- */
CP.channel = async function (type) {
  var h = this.hero; if (h.orbSlots <= 0 || this.over) return;
  if (h.orbs.length >= h.orbSlots) await this.evoke({ prompt: '核の枠がいっぱい：解放する核を選ぶ' });
  if (this.over) return;
  h.orbs.push(type);
  await this.emit('orbChannel', { type: type, index: h.orbs.length - 1 });
};
CP.pickOrb = async function (prompt) {
  var h = this.hero; if (!h.orbs.length) return -1;
  var uniq = h.orbs.filter(function (x, i, a) { return a.indexOf(x) === i; });
  if (uniq.length === 1) return 0;
  var ix = await this.choose({ type: 'orb', prompt: prompt || '解放する核を選ぶ' });
  return (ix == null || ix < 0 || ix >= h.orbs.length) ? 0 : ix;
};
CP.evoke = async function (o) {
  o = o || {};
  var h = this.hero; if (!h.orbs.length || this.over) return null;
  var ix = o.index != null ? o.index : await this.pickOrb(o.prompt);
  var type = h.orbs[ix];
  h.orbs.splice(ix, 1);
  await this.emit('orbEvoke', { type: type, index: ix });
  var times = o.times || 1;
  for (var i = 0; i < times && !this.over; i++) await this.orbEvokeFx(type);
  return type;
};
CP.evokeAll = async function () { var h = this.hero; while (h.orbs.length && !this.over) await this.evoke({ index: 0 }); };
CP.orbEvokeFx = async function (type) {
  var h = this.hero;
  if (type === 'spark') await this.orbDamage(2);
  else if (type === 'frost') await this.gainBlock(2);
  else if (type === 'void') { var t = this.focusTarget(); if (t) await this.damageEnemy(t, 3 + this.powerCount(), { kind: 'void' }); }
  if (h.powers.d_heatsink && !this.over) await this.gainBlock(h.powers.d_heatsink);
  this.checkEnd();
};
CP.orbDamage = async function (n) {
  if (this.hero.powers.d_storm) { var al = this.alive(); await this.emit('orbStorm', { n: n }); for (var i = 0; i < al.length; i++) await this.damageEnemy(al[i], n, { kind: 'spark' }); }
  else { var t = this.focusTarget(); if (t) await this.damageEnemy(t, n, { kind: 'spark' }); }
};
CP.orbPassive = async function (type, ix) {
  await this.emit('orbPassive', { type: type, index: ix });
  if (type === 'spark') await this.orbDamage(1);
  else if (type === 'frost') await this.gainBlock(1);
  this.checkEnd();
};

/* ---------- stances ---------- */
CP.enterStance = async function (s) {
  var h = this.hero; if (h.stance === s || this.over) return;
  var prev = h.stance; h.stance = s; this.t.stanceChanged = true;
  await this.emit('stance', { from: prev, to: s });
  if (prev === 'calm') await this.gainEnergy(2);
  if (s === 'divine') await this.gainEnergy(2);
  if (h.powers.m_fortress) await this.gainBlock(h.powers.m_fortress);
  if (s === 'wrath' && h.powers.m_rush) await this.drawCards(2 * h.powers.m_rush);
  await this.relicHook('onStance', s);
};
CP.scry = async function (n) {
  var k = Math.min(n, this.draw.length); if (k <= 0) return;
  var top = this.draw.slice(-k).reverse();
  var picked = (await this.choose({ type: 'scry', cards: top, prompt: '占い' + k + '：捨てるカードを選ぶ' })) || [];
  var moved = [];
  for (var i = 0; i < picked.length; i++) { var ix = this.draw.indexOf(picked[i]); if (ix >= 0) { this.draw.splice(ix, 1); this.discard.push(picked[i]); moved.push(picked[i]); } }
  if (moved.length) await this.emit('discard', { cards: moved, fromDraw: true });
};

/* ---------- choices from hand ---------- */
CP.chooseHand = async function (o) {
  var pool = this.hand.filter(function (c) { return !o.filter || o.filter(c); });
  if (!pool.length) return [];
  var n = o.n || 1;
  if (!o.optional && pool.length <= n && !o.always) return pool.slice(0, n);
  var r = await this.choose({ type: 'hand', cards: pool, n: n, min: o.optional ? 0 : Math.min(n, pool.length), prompt: o.prompt || 'カードを選ぶ' });
  return (r || []).filter(function (c) { return pool.indexOf(c) >= 0; });
};

/* ---------- turn structure ---------- */
CP.startPlayerTurn = async function () {
  var h = this.hero, self = this;
  this.round++; this.phase = 'start'; this.t = this.freshTurn();
  this.run.stats.turns++;
  this.hand.forEach(function (c) { c.retained = !!c.retainedFlag; c.retainedFlag = false; });
  await this.emit('turn', { who: 'player', round: this.round });
  if (h.stance === 'divine') await this.enterStance('none');
  if (h.keepBlock) h.keepBlock = false; else if (!h.powers.k_fortress) h.block = 0;
  h.retaliate = 0;
  h.energy = 3;
  await this.emit('reset', {});
  var nx = h.next; h.next = { block: 0, energy: 0, draw: 0, miracle: 0 };
  await this.drawCards(5 + nx.draw);
  this.die = 1 + this.rng.int(6);
  await this.emit('die', { value: this.die, rolled: true });
  await this.dieWindow();
  if (nx.energy) await this.gainEnergy(nx.energy);
  if (nx.block) await this.gainBlock(nx.block);
  if (nx.miracle) await this.gainMiracle(nx.miracle);
  if (this.round === 1) await this.relicHook('onCombatStart');
  await this.relicHook('onTurnStart');
  await this.relicDie();
  await this.powersTurnStart();
  if (h.plated) await this.gainBlock(h.plated);
  var al = this.alive();
  for (var i = 0; i < al.length; i++) { var d = G.ENEMIES[al[i].id]; if (d.onRoundStart) await d.onRoundStart(this, al[i]); }
  if (this.over) return;
  this.phase = 'player';
  await this.emit('playerReady', {});
};
CP.dieMods = function () {
  var self = this, out = [];
  this.run.relics.forEach(function (id) { var r = G.RELICS[id]; if (r.dieMod && !self.g.roomUsed(id)) out.push({ id: id, kind: r.dieMod, name: r.name }); });
  return out;
};
CP.dieWindow = async function () {
  var mods = this.dieMods(); if (!mods.length) return;
  var res = await this.choose({ type: 'die', value: this.die, mods: mods });
  if (res && res.value && res.value !== this.die) {
    this.die = res.value;
    (res.used || []).forEach(function (id) { this.g.useRoom(id); }, this);
    await this.emit('die', { value: this.die, rolled: false });
  }
};
CP.relicDie = async function () {
  var relics = this.run.relics, v = this.die;
  for (var i = 0; i < relics.length; i++) {
    var r = G.RELICS[relics[i]];
    if (r && r.die && r.die.indexOf(v) >= 0 && r.dieFx) { await this.emit('relicFlash', { id: relics[i] }); await r.dieFx(this); if (this.over) return; }
  }
  if (relics.indexOf('solo_die') >= 0 && v === 6) {
    var others = relics.filter(function (id) { return id !== 'solo_die' && G.RELICS[id] && G.RELICS[id].dieFx; });
    var pick = 'self';
    if (others.length) {
      pick = await this.choose({ type: 'option', prompt: '導きの賽：どの能力を使う？', options: [{ id: 'self', label: 'カードを1枚引く' }].concat(others.map(function (id) { return { id: id, label: G.RELICS[id].name + '（' + G.RELICS[id].dieText + '）' }; })) });
    }
    await this.emit('relicFlash', { id: 'solo_die' });
    if (!pick || pick === 'self') await this.drawCards(1); else await G.RELICS[pick].dieFx(this);
  }
};
CP.relicHook = async function (hook, arg) {
  var relics = this.run.relics.slice();
  for (var i = 0; i < relics.length; i++) {
    var r = G.RELICS[relics[i]];
    if (r && r[hook]) { var fired = await r[hook](this, arg); if (fired !== false) { if (r.flash !== false && fired !== 'quiet') await this.emit('relicFlash', { id: relics[i] }); } if (this.over) return; }
  }
};
CP.powersTurnStart = async function () {
  var h = this.hero, keys = Object.keys(h.powers);
  for (var i = 0; i < keys.length; i++) { var P = G.POWERS[keys[i]]; if (P && P.onTurnStart && h.powers[keys[i]]) { await this.emit('powerFlash', { key: keys[i] }); await P.onTurnStart(this, h.powers[keys[i]]); if (this.over) return; } }
};
CP.powersTurnEnd = async function () {
  var h = this.hero, keys = Object.keys(h.powers);
  for (var i = 0; i < keys.length; i++) { var P = G.POWERS[keys[i]]; if (P && P.onTurnEnd && h.powers[keys[i]]) { await this.emit('powerFlash', { key: keys[i] }); await P.onTurnEnd(this, h.powers[keys[i]]); if (this.over) return; } }
};
CP.endPlayerTurn = async function () {
  var h = this.hero;
  this.phase = 'end';
  await this.emit('endTurnStart', {});
  await this.powersTurnEnd(); if (this.over) return;
  await this.relicHook('onTurnEnd'); if (this.over) return;
  var orbs = h.orbs.slice();
  for (var i = 0; i < orbs.length; i++) { if (orbs[i] === 'void') continue; await this.orbPassive(orbs[i], i); if (this.over) return; }
  var hand = this.hand.slice();
  for (var j = 0; j < hand.length; j++) { var d = cdef(hand[j]); if (d.onTurnEndInHand) { await d.onTurnEndInHand(this, hand[j]); if (this.over) return; } }
  if (h.stance === 'wrath') { await this.damageHero(1, { src: 'wrath' }); if (this.over) return; }
  var al = this.alive();
  for (var k = 0; k < al.length; k++) { if (al[k].alive && al[k].poison > 0) { await this.damageEnemy(al[k], al[k].poison, { loseHP: true, kind: 'poison' }); if (this.over) return; } }
  var gone = [];
  hand = this.hand.slice();
  for (var m = 0; m < hand.length; m++) {
    var c = hand[m];
    if (hasKw(c, 'ethereal')) { await this.exhaustCard(c); continue; }
    if (hasKw(c, 'retain') || c.retainOnce) { c.retainOnce = false; c.retainedFlag = true; continue; }
    gone.push(c);
  }
  for (var n = 0; n < gone.length; n++) { var ix = this.hand.indexOf(gone[n]); if (ix >= 0) this.hand.splice(ix, 1); this.discard.push(gone[n]); }
  if (gone.length) await this.emit('discard', { cards: gone, endTurn: true });
};
CP.enemyTurn = async function () {
  this.phase = 'enemy';
  await this.emit('turn', { who: 'enemy', round: this.round });
  var al = this.alive(), any = false;
  for (var i = 0; i < al.length; i++) if (al[i].block) { al[i].block = 0; any = true; }
  if (any) await this.emit('enemyBlockReset', {});
  var order = this.enemyOrder(), acted = [];
  for (var j = 0; j < order.length; j++) {
    var e = order[j];
    if (this.over) return;
    if (!e.alive) continue;
    var wasStill = !!(e.st.sleep || e.st.stun);
    var act = this.actionOf(e);
    if (e.st.stun) e.st.stun = false;
    await this.enemyDo(e, act);
    var d = G.ENEMIES[e.id];
    if (!this.over && d.afterAct && e.alive) await d.afterAct(this, e, act);
    if (!wasStill) acted.push(e); else e.st.noAdvance = true;
  }
  if (this.over) return;
  for (var k = 0; k < acted.length; k++) { var x = acted[k]; if (x.alive && !x.justSummoned && !x.st.noAdvance) this.advanceCube(x); }
  this.enemies.forEach(function (x) { x.justSummoned = false; x.st.noAdvance = false; });
  var al2 = this.alive();
  for (var m = 0; m < al2.length; m++) { var d2 = G.ENEMIES[al2[m].id]; if (d2.onEnemyTurnEnd) await d2.onEnemyTurnEnd(this, al2[m]); if (this.over) return; }
};
CP.enemyOrder = function () {
  var a = this.alive();
  var normal = a.filter(function (e) { return !e.isBoss && !G.ENEMIES[e.id].actsLast; });
  var last = a.filter(function (e) { return !e.isBoss && G.ENEMIES[e.id].actsLast; });
  var boss = a.filter(function (e) { return e.isBoss; });
  return normal.concat(last, boss);
};

/* ---------- player actions ---------- */
CP.costOf = function (c) {
  var d = cdef(c), cost = baseCost(c);
  if (cost === 'X' || cost == null) return cost;
  if (d.type === 'skl' && this.hero.powers.k_pact) cost = 0;
  if (c.costMod) cost = Math.max(0, cost + c.costMod);
  return cost;
};
CP.canPlay = function (c) {
  var d = cdef(c);
  if (this.phase !== 'player' || this.over) return false;
  if (d.cost == null || hasKw(c, 'unplayable')) return false;
  if (d.canPlay && !d.canPlay(this, c)) return false;
  var cost = this.costOf(c);
  if (cost === 'X') return true;
  return this.hero.energy + this.hero.miracle >= cost;
};
CP.needsTarget = function (c) { var d = cdef(c); return d.target === 'enemy'; };
CP.playCard = function (uid, targetUid) { var self = this; return this.enqueue(function () { return self._playCard(uid, targetUid); }); };
CP._playCard = async function (uid, targetUid) {
  var h = this.hero, card = null, i;
  for (i = 0; i < this.hand.length; i++) if (this.hand[i].uid === uid) { card = this.hand[i]; break; }
  if (!card || !this.canPlay(card)) return false;
  var d = cdef(card);
  var target = this.byUid(targetUid);
  if (target && !target.alive) target = null;
  if (d.target === 'enemy' && !target) target = this.focusTarget();
  if (target) this.focus = target.uid;
  var cost = this.costOf(card), x = 0;
  if (cost === 'X') { x = h.energy; h.energy = 0; if (this.run.relics.indexOf('r_xbox') >= 0) x += 1; }
  else {
    while (h.energy < cost && h.miracle > 0) { h.miracle--; h.energy++; await this.emit('token', { key: 'miracle', delta: -1 }); }
    h.energy -= cost;
  }
  this.hand.splice(this.hand.indexOf(card), 1);
  await this.emit('play', { card: card, target: target, cost: cost });
  var times = 1;
  if (h.powers.d_echo && !this.t.echo) { this.t.echo = true; times = 2; }
  else if (this.doubleNext > 0) { this.doubleNext--; times = 2; }
  if (d.type === 'atk' && this.t.doubleAtk) { this.t.dmgMul = 2; }
  var vf = function (k) { return val(card, k); };
  for (var n = 0; n < times; n++) {
    if (this.over) break;
    var tgt = target && target.alive ? target : (d.target === 'enemy' ? this.focusTarget() : null);
    if (d.target === 'enemy' && !tgt) break;
    if (n > 0) await this.emit('echo', { card: card });
    await d.play(this, card, tgt, vf, { x: x, copy: n < times - 1 });
  }
  if (d.type === 'atk' && this.t.doubleAtk) { this.t.doubleAtk = false; this.t.dmgMul = 1; }
  this.t.cards++; if (d.type === 'atk') this.t.attacks++; if (d.type === 'skl') this.t.skills++;
  this.run.stats.cardsPlayed++;
  if (h.powers.h_afterimg && !this.over) await this.gainBlock(h.powers.h_afterimg);
  await this.relicHook('onPlay', card);
  await this.cleanupPlayed(card);
  this.checkEnd();
  if (this.t.endReq && !this.over) { this.t.endReq = false; this.requestEnd(); }
  return true;
};
CP.cleanupPlayed = async function (card) {
  var d = cdef(card);
  if (card._toDrawTop) { card._toDrawTop = false; this.draw.push(card); await this.emit('toDrawTop', { card: card }); return; }
  if (d.type === 'pow') { this.powerCards.push(card); await this.emit('powerPlaced', { card: card }); return; }
  var ex = hasKw(card, 'exhaust') || (d.type === 'skl' && this.hero.powers.k_pact) || card._exhaustOnce;
  card._exhaustOnce = false;
  if (ex) { await this.exhaustCard(card); return; }
  this.discard.push(card);
  await this.emit('toDiscard', { card: card });
};
CP.playFree = async function (card, times) {
  var d = cdef(card);
  if (d.cost == null || hasKw(card, 'unplayable')) { this.discard.push(card); await this.emit('discard', { cards: [card] }); return; }
  await this.emit('play', { card: card, free: true });
  for (var i = 0; i < (times || 1) && !this.over; i++) {
    var tgt = d.target === 'enemy' ? this.focusTarget() : null;
    if (d.target === 'enemy' && !tgt) break;
    if (i > 0) await this.emit('echo', { card: card });
    await d.play(this, card, tgt, function (k) { return val(card, k); }, { x: 0, free: true });
  }
  this.t.cards++; if (d.type === 'atk') this.t.attacks++;
  await this.cleanupPlayed(card);
  this.checkEnd();
};
CP.requestEnd = function () {
  if (this.phase !== 'player') return;
  this.phase = 'ending';
  if (this._end) { var r = this._end; this._end = null; r(); } else this._endPending = true;
};
CP.endTurn = function () { var self = this; return this.enqueue(async function () { if (self.phase === 'player') self.requestEnd(); }); };
CP.useShiv = function (targetUid) {
  var self = this;
  return this.enqueue(async function () {
    if (self.phase !== 'player' || self.hero.shiv <= 0) return;
    var t = self.byUid(targetUid); if (!t || !t.alive) t = self.focusTarget(); if (!t) return;
    self.hero.shiv--; await self.emit('token', { key: 'shiv', delta: -1 });
    await self.throwShiv(t);
  });
};
CP.useMiracle = function () {
  var self = this;
  return this.enqueue(async function () {
    if (self.phase !== 'player' || self.hero.miracle <= 0) return;
    self.hero.miracle--; self.hero.energy += 1;
    await self.emit('token', { key: 'miracle', delta: -1 });
    await self.emit('energy', { delta: 1 });
  });
};
CP.usePotion = function (index, targetUid) {
  var self = this;
  return this.enqueue(async function () {
    if (self.phase !== 'player') return false;
    var id = self.run.potions[index]; if (!id) return false;
    var P = G.POTIONS[id]; if (!P || !P.use) return false;
    var t = self.byUid(targetUid); if (P.target === 'enemy' && (!t || !t.alive)) t = self.focusTarget();
    self.run.potions.splice(index, 1);
    self.g.returnPotion(id);
    await self.emit('potion', { id: id, t: t });
    await P.use(self, t);
    if (self.run.relics.indexOf('r_kettle') >= 0) { await self.emit('relicFlash', { id: 'r_kettle' }); await self.healHero(1); }
    self.checkEnd();
    return true;
  });
};
CP.activateRelic = function (id) {
  var self = this;
  return this.enqueue(async function () {
    var r = G.RELICS[id]; if (!r || !r.active || self.phase !== 'player') return;
    if (self.flags['used_' + id]) return;
    self.flags['used_' + id] = true;
    await self.emit('relicFlash', { id: id });
    await r.active(self);
    self.checkEnd();
  });
};

/* =====================================================================
   GAME (run level)
   ===================================================================== */
var PRICE = { C: 2, U: 3, R: 5 };
G.PRICE = PRICE;

function Game(run, io) { this.run = run; this.io = io; this.rng = makeRng(run.rngState || run.seed); this.roomFlags = {}; }
G.Game = Game;
var GP = Game.prototype;

Game.newRun = function (heroId, seed) {
  seed = seed || (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  var rng = makeRng(seed);
  var H = G.HEROES[heroId];
  var heroCards = Object.keys(G.CARDS).filter(function (k) { return G.CARDS[k].hero === heroId; });
  var commons = heroCards.filter(function (k) { return G.CARDS[k].rarity === 'C'; });
  var uncommons = heroCards.filter(function (k) { return G.CARDS[k].rarity === 'U'; });
  var rares = heroCards.filter(function (k) { return G.CARDS[k].rarity === 'R'; });
  var rewardDeck = commons.concat(commons, uncommons, ['ticket', 'ticket', 'ticket']);
  var run = {
    v: 1, seed: seed, hero: heroId, hp: H.hp, maxHp: H.hp, gold: 0,
    deck: H.starter.map(function (id) { return mkCard(id); }),
    relics: [H.relic, 'solo_die'], potions: [], potionSlots: 3,
    rewardDeck: rng.shuffle(rewardDeck), rareDeck: rng.shuffle(rares.slice()),
    firstEnc: rng.pick(G.ACT1.first), encDeck: rng.shuffle(G.ACT1.encounters.slice()), eliteDeck: rng.shuffle(G.ACT1.elites.slice()),
    eventDeck: rng.shuffle(G.ACT1.events.slice()),
    relicDeck: rng.shuffle(Object.keys(G.RELICS).filter(function (k) { return ['C', 'U', 'R'].indexOf(G.RELICS[k].rarity) >= 0; })),
    bossRelicDeck: rng.shuffle(Object.keys(G.RELICS).filter(function (k) { return G.RELICS[k].rarity === 'B'; })),
    potionDeck: rng.shuffle(Object.keys(G.POTIONS).filter(function (k) { return !G.POTIONS[k].special; })),
    blessingDeck: rng.shuffle(G.BLESSINGS.map(function (b) { return b.id; })),
    summonDecks: {},
    act: 1, boss: rng.pick(G.ACT1.bosses), map: null, pos: null, visited: [],
    phase: 'blessing', room: null,
    stats: { floors: 0, kills: 0, dmgDealt: 0, dmgTaken: 0, cardsPlayed: 0, elites: 0, goldEarned: 0, turns: 0, start: Date.now() }
  };
  run.map = Game.makeMap(rng);
  run.rngState = rng.state;
  return run;
};
Game.makeMap = function (rng) {
  var L = rng.pick(G.ACT1.maps);
  var nodes = L.nodes.map(function (n) { return { id: n.id, row: n.row, x: n.x, space: n.space, kind: n.kind || null }; });
  var dark = nodes.filter(function (n) { return n.space === 'dark'; });
  var light = nodes.filter(function (n) { return n.space === 'light'; });
  var dt = [], lt = [];
  Object.keys(L.dark).forEach(function (k) { for (var i = 0; i < L.dark[k]; i++) dt.push(k); });
  Object.keys(L.light).forEach(function (k) { for (var i = 0; i < L.light[k]; i++) lt.push(k); });
  while (dt.length < dark.length) dt.push('enc');
  while (lt.length < light.length) lt.push('event');
  rng.shuffle(dt); rng.shuffle(lt);
  dark.forEach(function (n, i) { n.kind = dt[i]; });
  light.forEach(function (n, i) { n.kind = lt[i]; });
  // keep elites out of the first rows: swap with a later encounter
  dark.forEach(function (n) {
    if (n.kind === 'elite' && n.row < (L.eliteMinRow || 4)) {
      var swap = dark.filter(function (m) { return m.kind === 'enc' && m.row >= (L.eliteMinRow || 4); });
      if (swap.length) { var s = rng.pick(swap); s.kind = 'elite'; n.kind = 'enc'; }
    }
  });
  // no campfire straight after the start
  light.forEach(function (n) {
    if (n.kind === 'rest' && n.row <= 1) {
      var swap = light.filter(function (m) { return m.kind !== 'rest' && m.row >= 3; });
      if (swap.length) { var s = rng.pick(swap); var k = s.kind; s.kind = 'rest'; n.kind = k; }
    }
  });
  return { id: L.id, name: L.name, nodes: nodes, edges: L.edges.map(function (e) { return e.slice(); }) };
};

GP.saveRng = function () { this.run.rngState = this.rng.state; };
GP.roomUsed = function (id) { return !!this.roomFlags[id]; };
GP.useRoom = function (id) { this.roomFlags[id] = true; };
GP.newRoom = function () { this.roomFlags = {}; };
GP.hasRelic = function (id) { return this.run.relics.indexOf(id) >= 0; };
GP.node = function (id) { var ns = this.run.map.nodes; for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return ns[i]; return null; };
GP.reachable = function () {
  var run = this.run;
  if (run.pos == null) return run.map.nodes.filter(function (n) { return n.row === 0; }).map(function (n) { return n.id; });
  return run.map.edges.filter(function (e) { return e[0] === run.pos; }).map(function (e) { return e[1]; });
};
GP.drawSummon = function (group) {
  var pools = G.ACT1.summonGroups[group];
  var deck = this.run.summonDecks[group];
  if (!deck || !deck.length) deck = this.run.summonDecks[group] = this.rng.shuffle(pools.slice());
  return deck.pop();
};
GP.roomFor = function (node) {
  var run = this.run, k = node.kind;
  if (k === 'start') return { type: 'combat', kind: 'first', encId: run.firstEnc, nodeId: node.id };
  if (k === 'enc') { var id = run.encDeck.shift(); run.encDeck.push(id); return { type: 'combat', kind: 'enc', encId: id, nodeId: node.id }; }
  if (k === 'elite') { var el = run.eliteDeck.shift(); run.eliteDeck.push(el); return { type: 'combat', kind: 'elite', encId: el, nodeId: node.id }; }
  if (k === 'boss') return { type: 'combat', kind: 'boss', encId: run.boss, nodeId: node.id };
  if (k === 'event') { var ev = run.eventDeck.shift(); run.eventDeck.push(ev); return { type: 'event', eventId: ev, nodeId: node.id }; }
  if (k === 'rest') return { type: 'rest', nodeId: node.id };
  if (k === 'shop') return { type: 'shop', shop: this.makeShop(), nodeId: node.id };
  if (k === 'treasure') return { type: 'treasure', relic: this.drawRelic(), nodeId: node.id };
  return { type: 'rest', nodeId: node.id };
};
GP.enter = function (nodeId) {
  var run = this.run, node = this.node(nodeId);
  run.pos = nodeId; run.visited.push(nodeId); run.stats.floors++;
  this.newRoom();
  run.room = this.roomFor(node); run.phase = 'room';
  this.saveRng();
  return run.room;
};
GP.combatSpec = function (room) {
  var E = G.ENCOUNTERS[room.encId];
  return { kind: room.kind, encId: room.encId, enemies: [E.enemy].concat(E.summons || []), rewards: E.rewards, extra: room.extra };
};
GP.newCombat = function (spec) { this.newRoom(); return new Combat(this, spec); };

/* rewards */
GP.combatRewards = function (spec, combat) {
  var r = spec.rewards || {}, list = [];
  var gold = r.gold || 0;
  if (combat && combat.fled) gold = 0;
  else if (combat && combat.stolen) gold += combat.stolen;
  if (this.hasRelic('r_goldtooth') && gold) gold += 1;
  if (gold) list.push({ type: 'gold', n: gold });
  if (r.card) list.push({ type: 'card', up: r.card === 'up' });
  if (r.potion) list.push({ type: 'potion' });
  if (r.relic) list.push({ type: 'relic' });
  if (r.rare) list.push({ type: 'rare' });
  if (this.hasRelic('r_pouch') && spec.kind !== 'boss' && !r.potion && this.rng.next() < 0.34) list.push({ type: 'potion' });
  return list;
};
GP.revealCards = function (n) {
  var run = this.run, out = [], guard = 0;
  while (out.length < n && run.rewardDeck.length && guard++ < 40) {
    var id = run.rewardDeck.shift();
    if (id === 'ticket') { run.rewardDeck.push('ticket'); if (run.rareDeck.length) out.push({ id: run.rareDeck.shift(), rare: true, ticket: true }); continue; }
    out.push({ id: id, rare: false });
  }
  return out;
};
GP.revealRares = function (n) { var run = this.run, out = []; for (var i = 0; i < n && run.rareDeck.length; i++) out.push({ id: run.rareDeck.shift(), rare: true }); return out; };
GP.returnRevealed = function (list, keptIndex) {
  var run = this.run;
  list.forEach(function (o, i) { if (i === keptIndex) return; if (o.rare) run.rareDeck.push(o.id); else run.rewardDeck.push(o.id); });
};
GP.takeTransform = function () {
  var run = this.run;
  for (var g = 0; g < 10 && run.rewardDeck.length; g++) {
    var id = run.rewardDeck.shift();
    if (id === 'ticket') { run.rewardDeck.push('ticket'); if (run.rareDeck.length) return run.rareDeck.shift(); continue; }
    return id;
  }
  return null;
};
GP.drawRelic = function () { var d = this.run.relicDeck; var self = this; for (var i = 0; i < d.length; i++) { if (!self.hasRelic(d[0])) return d.shift(); d.push(d.shift()); } return null; };
GP.returnRelic = function (id) { if (id) this.run.relicDeck.push(id); };
GP.drawPotion = function () { var d = this.run.potionDeck; return d.length ? d.shift() : null; };
GP.returnPotion = function (id) { if (id && G.POTIONS[id] && !G.POTIONS[id].special) this.run.potionDeck.push(id); };
GP.drawBossRelics = function (n) { var out = []; for (var i = 0; i < n && this.run.bossRelicDeck.length; i++) out.push(this.run.bossRelicDeck.shift()); return out; };

GP.gainGold = function (n) { this.run.gold += n; if (n > 0) this.run.stats.goldEarned += n; if (this.run.gold < 0) this.run.gold = 0; };
GP.heal = function (n) { var run = this.run; var b = run.hp; run.hp = Math.min(run.maxHp, run.hp + n); return run.hp - b; };
GP.hurt = function (n) { var run = this.run; run.hp -= n; if (run.hp <= 0) { if (run.potions.indexOf('p_fairy') >= 0) { run.potions.splice(run.potions.indexOf('p_fairy'), 1); run.hp = Math.min(run.maxHp, 3); return 'revive'; } run.hp = 0; return 'dead'; } return 'ok'; };
GP.changeMaxHp = function (n) { var run = this.run; run.maxHp = Math.max(1, run.maxHp + n); if (n > 0) run.hp += n; run.hp = Math.min(run.hp, run.maxHp); };
GP.gainRelic = function (id) {
  if (!id || this.hasRelic(id)) return false;
  this.run.relics.push(id);
  var r = G.RELICS[id]; if (r.onPickup) r.onPickup(this);
  return true;
};
GP.potionCap = function () { return this.run.potionSlots + (this.hasRelic('r_belt') ? 1 : 0); };
GP.gainPotion = function (id) { if (!id) return false; if (this.run.potions.length >= this.potionCap()) return false; this.run.potions.push(id); return true; };
GP.addCard = function (id, up) {
  if (G.CARDS[id].type === 'curse' && this.hasRelic('r_omamori') && !this.roomFlags.omamori && (this.run.omamori || 0) < 2) {
    this.run.omamori = (this.run.omamori || 0) + 1; return null;
  }
  var c = mkCard(id, up); this.run.deck.push(c); return c;
};
GP.removeCard = function (uid) {
  var d = this.run.deck; for (var i = 0; i < d.length; i++) if (d[i].uid === uid) { var c = d.splice(i, 1)[0]; if (c.id === 'cu_parasite') this.changeMaxHp(-1); return c; }
  return null;
};
GP.upgradeCard = function (uid) { var c = this.run.deck.filter(function (x) { return x.uid === uid; })[0]; if (c && canUpgrade(c)) { c.up = true; return c; } return null; };
GP.transformCard = function (uid) {
  var c = this.run.deck.filter(function (x) { return x.uid === uid; })[0];
  if (!c || G.CARDS[c.id].type === 'curse') return null;
  this.removeCard(uid);
  var id = this.takeTransform(); return id ? this.addCard(id, false) : null;
};
GP.randomCurse = function () { return this.rng.pick(G.CURSE_POOL); };

/* shop */
GP.makeShop = function () {
  var self = this, disc = this.hasRelic('r_spoon') ? 1 : 0;
  var relics = [], potions = [];
  for (var i = 0; i < 3; i++) { var id = this.drawRelic(); if (id) relics.push({ id: id, price: Math.max(1, G.RELICS[id].price - (i === 0 ? 1 : 0) - disc), sale: i === 0, sold: false }); }
  for (var j = 0; j < 3; j++) { var p = this.drawPotion(); if (p) potions.push({ id: p, price: Math.max(1, G.POTIONS[p].price - disc), sold: false }); }
  var cards = this.revealCards(3).map(function (o) { var R = G.CARDS[o.id].rarity; return { id: o.id, rare: o.rare, price: Math.max(1, PRICE[R] - disc), sold: false }; });
  return { relics: relics, potions: potions, cards: cards, removeCost: Math.max(1, 3 - disc), removed: false };
};
GP.closeShop = function (shop) {
  var run = this.run, self = this;
  shop.relics.forEach(function (r) { if (!r.sold) self.returnRelic(r.id); });
  shop.potions.forEach(function (p) { if (!p.sold) self.returnPotion(p.id); });
  shop.cards.forEach(function (c) { if (!c.sold) { if (c.rare) run.rareDeck.push(c.id); else run.rewardDeck.push(c.id); } });
};

/* event / reward API shared by events, blessings and combat rewards.
   Anything that needs the player goes through io.choose so the UI and the simulator share the rules. */
GP.api = function () {
  var g = this, io = this.io, run = this.run;
  function emit(t, d) { return io.emit(t, d || {}) || Promise.resolve(); }
  var X = {
    log: [],
    say: function (t) { X.log.push(t); },
    gold: function (n) { g.gainGold(n); emit('runGold', { delta: n }); },
    heal: function (n) { var d = g.heal(n); emit('runHeal', { amount: d }); },
    maxHp: function (n) { g.changeMaxHp(n); emit('runMaxHp', { delta: n }); },
    hurt: async function (n) { var r = g.hurt(n); await emit('runHurt', { amount: n, result: r }); return r; },
    relic: async function (id) {
      id = id || g.drawRelic(); if (!id) return null;
      var ok = await io.choose({ type: 'relic', id: id });
      if (ok) { g.gainRelic(id); await emit('runRelic', { id: id }); return id; }
      g.returnRelic(id); return null;
    },
    potion: async function (n) {
      for (var i = 0; i < (n || 1); i++) {
        var id = g.drawPotion(); if (!id) return;
        var r = await io.choose({ type: 'potion', id: id, full: run.potions.length >= g.potionCap() });
        if (r === true && run.potions.length < g.potionCap()) { run.potions.push(id); await emit('runPotion', { id: id }); }
        else if (typeof r === 'number' && run.potions[r]) { g.returnPotion(run.potions[r]); run.potions[r] = id; await emit('runPotion', { id: id }); }
        else g.returnPotion(id);
      }
    },
    cardReward: async function (up) {
      var n = 3 - (g.hasRelic('b_crown') ? 1 : 0);
      var list = g.revealCards(n); if (!list.length) return null;
      var pick = await io.choose({ type: 'reward', options: list, up: !!up });
      var card = null;
      if (pick != null && pick >= 0 && list[pick]) card = g.addCard(list[pick].id, !!up);
      g.returnRevealed(list, pick != null && pick >= 0 ? pick : -1);
      if (card) await emit('runCard', { card: card });
      return card;
    },
    rare: async function () {
      var list = g.revealRares(3); if (!list.length) return null;
      var pick = await io.choose({ type: 'reward', options: list, rare: true });
      var card = null;
      if (pick != null && pick >= 0 && list[pick]) card = g.addCard(list[pick].id, false);
      g.returnRevealed(list, pick != null && pick >= 0 ? pick : -1);
      if (card) await emit('runCard', { card: card });
      return card;
    },
    curse: async function (id) { var c = g.addCard(id || g.randomCurse(), false); await emit('runCurse', { card: c, blocked: !c }); return c; },
    deckPick: async function (mode, n, filter, prompt) {
      var pool = run.deck.filter(filter);
      if (!pool.length) return [];
      var picks = await io.choose({ type: 'deck', mode: mode, n: Math.min(n, pool.length), cards: pool, prompt: prompt });
      return (picks || []).filter(function (c) { return pool.indexOf(c) >= 0; });
    },
    remove: async function (n) {
      var picks = await X.deckPick('remove', n || 1, function () { return true; }, '取り除くカードを選ぶ');
      picks.forEach(function (c) { g.removeCard(c.uid); });
      if (picks.length) await emit('runRemove', { cards: picks });
      return picks.length;
    },
    removeCurse: async function () {
      var picks = await X.deckPick('remove', 1, function (c) { return G.CARDS[c.id].type === 'curse'; }, '取り除く呪いを選ぶ');
      picks.forEach(function (c) { g.removeCard(c.uid); });
      if (picks.length) await emit('runRemove', { cards: picks });
      return picks.length;
    },
    upgrade: async function (n) {
      var picks = await X.deckPick('upgrade', n || 1, canUpgrade, '強化するカードを選ぶ');
      picks.forEach(function (c) { g.upgradeCard(c.uid); });
      if (picks.length) await emit('runUpgrade', { cards: picks });
      return picks.length;
    },
    upgradeRandom: async function (n) {
      var can = run.deck.filter(canUpgrade); g.rng.shuffle(can);
      var list = can.slice(0, n); list.forEach(function (c) { c.up = true; });
      if (list.length) await emit('runUpgrade', { cards: list, random: true });
      return list.length;
    },
    transform: async function (n) {
      var picks = await X.deckPick('transform', n || 1, function (c) { return G.CARDS[c.id].type !== 'curse'; }, '変化させるカードを選ぶ');
      var made = [];
      picks.forEach(function (c) { var nc = g.transformCard(c.uid); if (nc) made.push(nc); });
      if (picks.length) await emit('runTransform', { from: picks, to: made });
      return made.length;
    },
    roll: async function () {
      var v = 1 + g.rng.int(6);
      var mods = run.relics.filter(function (id) { return G.RELICS[id].dieMod && !g.roomUsed(id); }).map(function (id) { return { id: id, kind: G.RELICS[id].dieMod, name: G.RELICS[id].name }; });
      var r = await io.choose({ type: 'roll', value: v, mods: mods });
      if (r && r.value) { (r.used || []).forEach(function (id) { g.useRoom(id); }); return r.value; }
      return v;
    },
    bossSwap: async function () {
      var starter = G.HEROES[run.hero].relic;
      var list = g.drawBossRelics(3); if (!list.length) return;
      var pick = await io.choose({ type: 'bossRelic', options: list });
      var ix = run.relics.indexOf(starter); if (ix >= 0) run.relics.splice(ix, 1);
      list.forEach(function (id, i) { if (i !== pick) run.bossRelicDeck.push(id); });
      if (pick != null && pick >= 0) { g.gainRelic(list[pick]); await emit('runRelic', { id: list[pick] }); }
    },
    reward: async function (item) {
      if (item.type === 'gold') X.gold(item.n);
      else if (item.type === 'card') await X.cardReward(item.up);
      else if (item.type === 'potion') await X.potion(1);
      else if (item.type === 'relic') await X.relic();
      else if (item.type === 'rare') await X.rare();
    }
  };
  return X;
};
GP.rest = function () { var n = 3 + (this.hasRelic('r_boot') ? 1 : 0); return this.heal(n); };
GP.canRest = function () { return !this.hasRelic('b_sun'); };

/* save */
var SAVE_KEY = 'ibara.run.v1';
G.SAVE_KEY = SAVE_KEY;
GP.save = function () { this.saveRng(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.run)); } catch (e) {} };
Game.load = function () { try { var s = localStorage.getItem(SAVE_KEY); if (!s) return null; var run = JSON.parse(s); if (!run || run.v !== 1 || !G.HEROES[run.hero]) return null; bumpUid(run.deck); return run; } catch (e) { return null; } };
Game.clear = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

})();
