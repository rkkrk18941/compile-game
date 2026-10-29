/* スレイザスパイア — Downfall: combat mechanics of the four new characters, added around the existing combat engine
   without changing how the base characters play. Rules: Downfall rulebook v1.47 pp.2–8 (public playtest 2026-07-23).
   - Slimes (Slime Boss): placed in the Powers area, Grow (level up), Command (use the current level).
   - Modes and Vigor (Guardian), Heat and Soulburn (Hexaghost), the Chamber, Load and Dead On (Hermit).
   No DOM. Every piece of state lives in run.combat, so a checkpoint can be saved, resumed and mirrored. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP, DF = STS.DF = STS.DF || {};
var C = STS.Combat.prototype, G = STS.Game.prototype;
function cdef(c) { return STS.cdef(c); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function remove(arr, x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }

/* ------------------------------------------------------------------ helpers shared by card definitions */
DF.printedCost = function (cb, c) { var v = cb.baseCost(c); return typeof v === 'number' ? v : 0; };
DF.isRetainCard = function (c) { var d = STS.CARDS[c.id]; if (!d) return false; var r = d.ret; if (Array.isArray(r)) r = r[c.up ? 1 : 0]; return !!r; };
DF.retainInHand = function (cb, pc, except) { return pc.hand.filter(function (c) { return c !== except && (DF.isRetainCard(c) || c.rt); }).length; };
/* FAQ: a "Tackle" is any card with "Tackle" in its name. */
DF.isTackle = function (c) { var d = c && STS.CARDS[c.id]; return !!(d && (d.tackle || /Tackle/.test(d.en || ''))); };
DF.tacklesInHand = function (pc, except) { return pc.hand.filter(function (c) { return c !== except && DF.isTackle(c); }).length; };
DF.chOf = function (cb, pc) { var P = cb.P(pc); return P ? P.ch : null; };
/* Type of a card as it is played. */
DF.cardType = function (cb, pc, c) { var d = STS.CARDS[c.id]; return d ? d.t : 'X'; };

/* Hooks that the character files fill in. Each is async (cb, pc, ...). */
DF.HOOKS = DF.HOOKS || {};
DF.on = function (name, fn) { (DF.HOOKS[name] || (DF.HOOKS[name] = [])).push(fn); };
DF.fire = async function (name, args) { var list = DF.HOOKS[name]; if (!list) return; for (var i = 0; i < list.length; i++) await list[i].apply(null, args); };

/* ------------------------------------------------------------------ per-player combat state */
DF.INIT = DF.INIT || {};
var _create = STS.Combat.create;
STS.Combat.create = function (g, spec) {
  var cb = _create.call(this, g, spec);
  cb.s.pcs.forEach(function (pc) { DF.initPc(cb, pc); });
  return cb;
};
DF.initPc = function (cb, pc) {
  var P = cb.P(pc), ch = P && P.ch;
  pc.slimes = [];
  if (DF.INIT[ch]) DF.INIT[ch](cb, pc, P);
  if (P && P.relics.some(function (r) { return r.id === 'CorruptedShard'; }) && DF.initShard) DF.initShard(cb, pc, P);
};

/* ================================================================== the Slime Boss: slimes */
C.slimesOf = function (pc) { return pc.slimes || (pc.slimes = []); };
C.slimeLevels = function (inst) { var d = STS.CARDS[inst.id]; return (inst.up ? d.lvu : d.lv) || []; };
C.slimeMax = function (inst) { return this.slimeLevels(inst).length; };
C.slimeByU = function (pc, u) { var l = this.slimesOf(pc); for (var i = 0; i < l.length; i++) if (l[i].u === u) return l[i]; return null; };
/* Playing a Slime places it in the Powers area at level 1, for the rest of combat. */
C.placeSlime = function (pc, c, o) {
  remove(pc.limbo, c); remove(pc.hand, c); remove(pc.draw, c); remove(pc.disc, c);
  var inst = { u: c.u, id: c.id, up: !!c.up, lv: 1, str: 0, tstr: 0, card: c, cmdTurn: -1, strTurn: -1 };
  if (o && o.bruiser) inst.bruiser = true;
  this.slimesOf(pc).push(inst);
  this.emit({ t: 'slime', i: pc.i, u: inst.u, id: inst.id, lv: 1 });
  this.log(this.P(pc).name + '：' + STS.CARDS[c.id].name + 'を場に出した（Lv1）', true);
  return inst;
};
C.slimeLabel = function (inst) {
  var d = STS.CARDS[inst.id], lv = this.slimeLevels(inst);
  return d.name + (inst.up ? '+' : '') + '（Lv' + inst.lv + '/' + lv.length + (inst.str ? '・筋力' + inst.str : '') + '）：' + DF.levelText(lv[inst.lv - 1] || []);
};
C.chooseSlime = async function (pc, title, filter, o) {
  o = o || {};
  var self = this, list = this.slimesOf(pc).filter(function (s) { return !filter || filter(s); });
  if (!list.length) return null;
  if (list.length === 1 && !o.optional) return list[0];
  var opts = list.map(function (s) { return { id: 's' + s.u, label: self.slimeLabel(s) }; });
  if (o.optional) opts.push({ id: 'none', label: o.noneLabel || '選ばない' });
  var a = await this.ask(pc, { type: 'option', title: title || 'スライムを選択', options: opts, slimes: true });
  var hit = list.filter(function (s) { return 's' + s.u === a; })[0];
  return hit || (o.optional ? null : list[0]);
};
/* Grow: +1 level, never past the max level. Leeching Slime: whenever you Grow a Slime, Command it. */
C.growSlimeInst = async function (pc, inst) {
  if (!inst || inst.lv >= this.slimeMax(inst) || this.slimesOf(pc).indexOf(inst) < 0) return false;
  inst.lv++;
  this.emit({ t: 'grow', i: pc.i, u: inst.u, lv: inst.lv });
  this.log(this.P(pc).name + '：' + STS.CARDS[inst.id].name + 'が成長した（Lv' + inst.lv + '）');
  var leech = this.slimesOf(pc).filter(function (s) { return STS.CARDS[s.id].onGrow; });
  for (var i = 0; i < leech.length && !this.s.over; i++) if (this.slimesOf(pc).indexOf(leech[i]) >= 0) await this.runSlime(pc, leech[i], { why: STS.CARDS[leech[i].id].name });
  return true;
};
/* Grow n Slimes. o.times: grow the chosen Slime that many times. o.different: up to n different Slimes. */
C.growSlimes = async function (pc, n, o) {
  o = o || {};
  var self = this, grown = [], times = o.times || 1;
  for (var k = 0; k < n && !this.s.over; k++) {
    var can = function (s) { return s.lv < self.slimeMax(s) && grown.indexOf(s) < 0; };
    if (!this.slimesOf(pc).some(can)) break;
    var title = n > 1 ? '成長させるスライムを選択（' + (k + 1) + '体目／最大' + n + '体）' : times > 1 ? times + '回成長させるスライムを選択' : '成長させるスライムを選択';
    var s = await this.chooseSlime(pc, title, can, { optional: k > 0, noneLabel: 'ここで終える' });
    if (!s) break;
    for (var t = 0; t < times; t++) await this.growSlimeInst(pc, s);
    grown.push(s);
  }
  return grown;
};
C.canCommand = function (s) { var d = STS.CARDS[s.id]; return !(d.oncePerTurn && s.cmdTurn === this.s.round); };
/* Command up to n different Slimes (n may be 'all'). o.only: that Slime; o.times: command it that many times. */
C.commandSlimes = async function (pc, n, o) {
  o = o || {};
  var self = this, done = [];
  if (o.only) {
    for (var t0 = 0; t0 < (o.times || 1) && !this.s.over; t0++) { if (!this.canCommand(o.only) || this.slimesOf(pc).indexOf(o.only) < 0) break; await this.runSlime(pc, o.only); }
    return [o.only];
  }
  var can = function (s) { return done.indexOf(s) < 0 && self.canCommand(s); };
  if (n === 'all') {
    // "Command all your Slimes": resolve them in the order you choose (rulebook p.4).
    for (;;) {
      if (this.s.over) break;
      var left = this.slimesOf(pc).filter(can);
      if (!left.length) break;
      var s0 = left.length === 1 ? left[0] : await this.chooseSlime(pc, '次に命令するスライムを選択（残り' + left.length + '体）', can);
      if (!s0) break;
      done.push(s0);
      await this.runSlime(pc, s0);
    }
    return done;
  }
  for (var k = 0; k < n && !this.s.over; k++) {
    if (!this.slimesOf(pc).some(can)) break;
    var title = n > 1 ? '命令するスライムを選択（' + (k + 1) + '体目／異なるスライム最大' + n + '体）' : (o.times > 1 ? o.times + '回命令するスライムを選択' : '命令するスライムを選択');
    var s = await this.chooseSlime(pc, title, can, { optional: k > 0, noneLabel: 'ここで終える' });
    if (!s) break;
    done.push(s);
    for (var t = 0; t < (o.times || 1) && !this.s.over; t++) { if (!this.canCommand(s) || this.slimesOf(pc).indexOf(s) < 0) break; await this.runSlime(pc, s); }
  }
  return done;
};
/* Activate a Slime's current level. Its HITs are not changed by Vulnerable on the enemy nor by the Slime Boss's
   Strength or Weak; only the Slime's own Strength adds +1 to each HIT (rulebook p.4). One target for all of a
   level's HITs (like a multi-hit card); if it dies, the remaining HITs are lost. */
C.runSlime = async function (pc, inst, o) {
  o = o || {};
  if (!inst || pc.dead || this.s.over) return;
  var d = STS.CARDS[inst.id], atoms = this.slimeLevels(inst)[inst.lv - 1] || [];
  inst.cmdTurn = this.s.round;
  this.emit({ t: 'command', i: pc.i, u: inst.u, id: inst.id, lv: inst.lv, why: o.why || undefined });
  this.log(this.P(pc).name + '：' + d.name + 'に命令（Lv' + inst.lv + '：' + DF.levelText(atoms) + '）');
  var target = null, row = null, chosen = false, n = this.slimesOf(pc).length;
  var opts = { slime: inst, noMods: true, src: d.name };
  for (var i = 0; i < atoms.length; i++) {
    if (this.s.over || pc.dead) break;
    var a = atoms[i], str = Math.min(CAP.slimeStr, inst.str || 0);
    if (a[0] === 'hit' || a[0] === 'hitX' || a[0] === 'weak' || a[0] === 'vuln') {
      if (!chosen) { target = await this.chooseEnemy(pc, d.name + '：対象の敵を選択'); chosen = true; }
      if (!target || target.dead || target.fled) continue;
      if (a[0] === 'weak') await this.applyWeak(target, 1, pc);
      else if (a[0] === 'vuln') await this.applyVuln(target, 1, pc);
      else await this.hit(pc, target, (a[0] === 'hitX' ? n : a[1]) + str, opts);
    } else if (a[0] === 'aoe') {
      if (row == null) row = await this.chooseRow(pc, d.name + '：範囲攻撃する列を選択');
      await this.attackRow(pc, row, [a[1] + str], opts);
    } else if (a[0] === 'blk') await this.gainBlock(pc, a[1], { slime: true });
    else if (a[0] === 'draw') await this.draw(pc, a[1]);
    else if (a[0] === 'str') await this.giveSlimeStr(pc, inst, 1);
  }
  this.checkEnd();
};
C.giveSlimeStr = async function (pc, inst, n, o) {
  o = o || {};
  if (!inst || n <= 0) return 0;
  var before = inst.str || 0;
  inst.str = clamp(before + n, 0, CAP.slimeStr);
  var got = inst.str - before;
  if (o.temp) inst.tstr = (inst.tstr || 0) + got;
  this.emit({ t: 'slimeStr', i: pc.i, u: inst.u, n: got, v: inst.str });
  // Muscle Slime: once per turn, when this Slime gains Strength, Command it.
  if (got > 0 && STS.CARDS[inst.id].onStr && inst.strTurn !== this.s.round && !this.s.over) { inst.strTurn = this.s.round; await this.runSlime(pc, inst, { why: STS.CARDS[inst.id].name }); }
  return got;
};
C.chooseSlimeForStr = async function (pc, n, o) {
  var s = await this.chooseSlime(pc, 'スライムに筋力' + n + 'を与える：スライムを選択');
  if (!s) return null;
  await this.giveSlimeStr(pc, s, n, o);
  return s;
};

/* ================================================================== hooks into the existing engine */
/* Card-effect context: the new verbs. */
var _ctx = C.ctx;
C.ctx = function (pc, c, o) {
  var k = _ctx.call(this, pc, c, o), self = this;
  k.deadOn = !!(pc.t && pc.t.deadOnU === c.u);
  k.fromHand = c.pf === 'hand';
  k.grow = function (n, opts) { return self.growSlimes(pc, n == null ? 1 : n, opts); };
  k.command = function (n, opts) { return self.commandSlimes(pc, n == null ? 1 : n, opts); };
  k.slimeStr = function (n, opts) { return self.chooseSlimeForStr(pc, n == null ? 1 : n, opts); };
  if (DF.ctxExtra) DF.ctxExtra(self, pc, c, k);
  return k;
};
/* Slime HITs (and the HITs printed on Slime cards) ignore the player's Strength and Weak. */
var _hitBonus = C.hitBonus;
C.hitBonus = function (pc, opts) {
  if (opts && (opts.slime || opts.slimeCard)) return 0;
  var b = _hitBonus.call(this, pc, opts);
  var c = opts && opts.card;
  if (c && STS.CARDS[c.id]) {
    if (DF.isTackle(c)) b += this.powSum(pc, 'Recklessness', function (p) { return p.up ? 3 : 2; });
    if (DF.hitBonusExtra) b += DF.hitBonusExtra(this, pc, opts) || 0;
  }
  return b;
};
var _hit = C.hit;
C.hit = function (pc, e, base, opts) {
  if (opts && opts.slimeCard && !opts.noMods) opts = Object.assign({}, opts, { noMods: true });
  return _hit.call(this, pc, e, base, opts);
};
/* Starter Strikes of every character (Apotheosis, Strike Dummy...). */
C.isStarterStrike = function (c) { return /^Strike[RGBWSUHM]$/.test(c.id); };

/* Costs: Just Desserts, Relentless Tackle and character-specific changes. Player effects first, enemy effects
   afterwards (FAQ p.7). */
var _costOf = C.costOf;
C.costOf = function (pc, c) {
  var cost = _costOf.call(this, pc, c);
  if (typeof cost !== 'number') return cost;
  var t = DF.cardType(this, pc, c);
  if (pc.t && pc.t.desserts && (t === 'P' || t === 'L')) cost = pc.t.desserts === 'zero' ? 0 : cost - 1;
  if (t === 'A' && this.s.freeAttack && this.s.freeAttack.round === this.s.round && this.s.freeAttack.from !== c.u) cost = 0;
  if (DF.costExtra) cost = DF.costExtra(this, pc, c, cost);
  return Math.max(0, cost);
};
/* X can never be 0 on some cards (Divide & Conquer+). */
var _playFromHand = C.playFromHand;
C.playFromHand = async function (pc, cmd) {
  var c = null;
  for (var i = 0; i < pc.hand.length; i++) if (pc.hand[i].u === cmd.u) c = pc.hand[i];
  if (c && this.baseCost(c) === 'X') {
    var d = cdef(c), xMin = typeof d.xMin === 'function' ? d.xMin(c) : (d.xMin || 0);
    if (xMin > 0) {
      var maxX = pc.en + pc.mir;
      if (maxX < xMin) throw new Error('Xを' + xMin + '以上にする必要があります。');
      cmd = Object.assign({}, cmd);
      if (cmd.x == null) cmd.x = maxX === xMin ? xMin : await this.ask(pc, { type: 'number', title: d.name + '：Xの値（支払うエナジー）', min: xMin, max: maxX, def: maxX });
      cmd.x = clamp(cmd.x | 0, xMin, maxX);
    }
  }
  return _playFromHand.call(this, pc, cmd);
};

var _copyCount = C.copyCount;
C.copyCount = function (pc, c) {
  var n = _copyCount.call(this, pc, c), t = DF.cardType(this, pc, c);
  if (t === 'A') {
    if (pc.t.overexert) { pc.t.overexert--; n += 1; }
    // Duplicated Form: once per turn (per copy of the Power), the next Attack is played twice.
    var forms = this.powCount(pc, 'DuplicatedForm');
    if ((pc.t.dupForm || 0) < forms) { pc.t.dupForm = (pc.t.dupForm || 0) + 1; n += 1; }
  }
  if (DF.copyExtra) n += DF.copyExtra(this, pc, c, t) || 0;
  // Rapid Fire multiplies: each play made by another effect (Attack Potion...) also repeats it (FAQ p.7).
  var rf = DF.rapidOf ? DF.rapidOf(this, pc, c) || 0 : 0;
  return (1 + n) * (1 + rf) - 1;
};

var _playCard = C.playCard;
C.playCard = async function (pc, c, opts) {
  opts = opts || {};
  if (DF.beforePlay) await DF.beforePlay(this, pc, c, opts);
  var t = DF.cardType(this, pc, c), s = this.s;
  if (t === 'A' && s.freeAttack && s.freeAttack.round === s.round && s.freeAttack.from !== c.u) delete s.freeAttack;
  if ((t === 'P' || t === 'L') && pc.t.desserts) pc.t.desserts = null;
  var wasRetain = DF.isRetainCard(c);
  c.pf = opts.from || (opts.free ? 'free' : 'effect');
  try { await _playCard.call(this, pc, c, opts); } finally { delete c.pf; }
  if (s.over || pc.dead) return;
  // Abilities triggered by the card resolve after it has finished.
  var paid = typeof opts.paid === 'number' ? opts.paid : 0;
  if (paid >= 2) {
    pc.t.spent2 = true;
    var spread = this.slimesOf(pc).filter(function (x) { return STS.CARDS[x.id].onSpend2; });
    for (var i = 0; i < spread.length && !s.over; i++) if (this.slimesOf(pc).indexOf(spread[i]) >= 0) await this.runSlime(pc, spread[i], { why: STS.CARDS[spread[i].id].name });
  }
  if (DF.isTackle(c)) {
    var pows = pc.pow.slice();
    for (var j = 0; j < pows.length && !s.over; j++) {
      var p = pows[j];
      if (p.id === 'GoopArmor') await this.gainBlock(pc, p.up ? 2 : 1);
      if (p.id === 'ConsultPlaybook' && !p.usedTurn) { p.usedTurn = true; await this.draw(pc, p.up ? 2 : 1); this.gainEnergy(pc, 1); }
    }
  }
  if (wasRetain && this.powCount(pc, 'DarklingDuo') > 0) {
    var br = this.slimesOf(pc).filter(function (x) { return x.bruiser; })[0];
    for (var dd = 0; dd < this.powCount(pc, 'DarklingDuo') && br && !s.over; dd++) await this.runSlime(pc, br, { why: 'ダークリングの相棒' });
  }
  await DF.fire('afterPlay', [this, pc, c, opts]);
};

/* Combat setup: deck cards keep their attachments (Gems) in the combat piles; character files may act now. */
var _setup = C.setup;
C.setup = async function () {
  await _setup.call(this);
  var self = this;
  for (var i = 0; i < this.pcs().length; i++) {
    var pc = this.pcs()[i], P = this.P(pc), byU = {};
    P.deck.forEach(function (c) { byU[c.u] = c; });
    pc.draw.forEach(function (c) { var o = byU[c.u]; if (o && o.gem) c.gem = o.gem; });
    await DF.fire('afterSetup', [this, pc]);
  }
};
var _cardSnap = C.cardSnap;
C.cardSnap = function (c, pc) { var o = _cardSnap.call(this, c, pc); if (c.gem) o.gem = c.gem; return o; };

/* New commands: Vigor, Soulburn, a Chamber card... registered by the character files. */
DF.COMMANDS = DF.COMMANDS || {};
var _exec = C.exec;
C.exec = async function (pi, cmd) {
  var s = this.s, pc = this.pc(pi), fn = cmd && DF.COMMANDS[cmd.type];
  if (!pc || !fn) return _exec.call(this, pi, cmd);
  if (s.phase !== 'play' || s.over) throw new Error('今は行動できません。');
  if (pc.ready) throw new Error('ターン終了待ちです。キャンセルしてから行動してください。');
  if (pc.dead) throw new Error('戦闘不能です。');
  return fn(this, pc, cmd);
};
var _gcommand = G.command;
G.command = function (pi, cmd) {
  if (this.combat && this.run.combat && cmd && DF.COMMANDS[cmd.type]) return this.combat.command(pi, cmd);
  return _gcommand.call(this, pi, cmd);
};
var canPlayDf=C.canPlay;C.canPlay=function(pc,c){var reason=canPlayDf.call(this,pc,c);if(reason)return reason;var d=STS.cdef(c);if(d.xMin&&this.baseCost(c)==='X'&&pc.en<d.xMin)return 'エナジーが足りません。';return null;};
/* Powers usable "any time" (Shape of Puddle) are not limited to once per turn. */
var _activatePower = C.activatePower;
C.activatePower = async function (pc, cmd) {
  var inst = null;
  for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].u === cmd.u) inst = pc.pow[i];
  var d = inst && STS.CARDS[inst.id];
  if (d && d.pw && d.pw.anyTime && d.pw.activate) { await d.pw.activate(this, pc, inst, cmd); this.checkEnd(); return; }
  return _activatePower.call(this, pc, cmd);
};

/* Character abilities and other hooks, dispatched after relics and the base abilities. */
var _relicHook = G.relicHook;
G.relicHook = async function (cb, pc, hook) {
  await _relicHook.apply(this, arguments);
  if (!DF.HOOKS[hook]) return;
  if (cb && cb.s && cb.s.over && hook !== 'endCombat') return;
  await DF.fire(hook, Array.prototype.slice.call(arguments));
};
/* End of turn, step 1 (damage to enemies): Slimes with "End of turn: Command this Slime". */
DF.on('endTurnDmg', async function (cb, pc) {
  var list = cb.slimesOf(pc).filter(function (x) { return STS.CARDS[x.id].endTurn; });
  for (var i = 0; i < list.length && !cb.s.over; i++) if (cb.slimesOf(pc).indexOf(list[i]) >= 0) await cb.runSlime(pc, list[i], { why: 'ターン終了時' });
});
/* After the end of turn: temporary Slime Strength is removed, per-turn counters reset. */
var _endTurn = C.endTurn;
C.endTurn = async function () {
  await _endTurn.call(this);
  var self = this;
  this.pcs().forEach(function (pc) {
    self.slimesOf(pc).forEach(function (x) { if (x.tstr) { x.str = Math.max(0, x.str - x.tstr); x.tstr = 0; } });
    if (DF.endTurnLate) DF.endTurnLate(self, pc);
  });
};

/* Replays show the board as it was: slimes, Modes, tokens, the Chamber. */
DF.visualPc = function (pc) {
  return { sl: (pc.slimes || []).map(function (x) { return [x.u, x.lv, x.str]; }), md: pc.mode || null, vg: pc.vigor, vs: pc.vigorSpent, ht: pc.heat, so: pc.soul,
    cm: pc.chamber ? pc.chamber.map(function (c) { return c ? c.u : null; }) : null };
};
DF.applyVisual = function (pc, v, cards) {
  if (!v) return pc;
  var out = Object.assign({}, pc);
  if (pc.slimes) {
    var byU = {}; pc.slimes.forEach(function (x) { byU[x.u] = x; });
    out.slimes = v.sl.map(function (a) { var x = byU[a[0]]; return x ? Object.assign({}, x, { lv: a[1], str: a[2] }) : null; }).filter(Boolean);
  }
  out.mode = v.md; out.vigor = v.vg; out.vigorSpent = v.vs; out.heat = v.ht; out.soul = v.so;
  if (v.cm) out.chamber = v.cm.map(function (u) { return u == null ? null : cards[u] || null; });
  return out;
};
})(typeof window !== 'undefined' ? window : globalThis);
