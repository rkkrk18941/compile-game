/* スレイザスパイア — combat engine (board-game rules, 1–4 players, rows, shared die).
   No DOM. All state lives in game.run.combat so a play-phase checkpoint can be saved and resumed. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP;

function cdef(c) { var d = STS.CARDS[c.id]; if (!d) throw new Error('unknown card ' + c.id); return d; }
function isType(c, t) { return cdef(c).t === t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function remove(arr, x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }
function nameOf(c) { var d = cdef(c); return d.name + (c.up ? '+' : ''); }
STS.cdef = cdef; STS.cardName = nameOf;

function Combat(g, cs) { this.g = g; this.s = cs; this.q = Promise.resolve(); this.waiters = []; }
STS.Combat = Combat;
var C = Combat.prototype;

/* ------------------------------------------------------------------ setup */
Combat.create = function (g, spec) {
  var run = g.run, n = run.players.length;
  var rows = spec.rows || n;
  var cs = {
    kind: spec.kind, enc: spec.enc || null, act: run.act, rows: rows, round: 0, die: 0, phase: 'setup',
    enemies: [], uid: 1, pending: [], supply: { daze: CAP.daze, status: CAP.status }, flags: {},
    rewards: spec.rewards || null, burning: !!spec.burning, over: false, result: null, log: [], fled: [],
    pcs: run.players.map(function (p, i) {
      var ch = D.CHARS[p.ch];
      return { i: i, row: spec.rows ? Math.min(p.row, rows - 1) : p.row, en: 0, blk: 0, str: 0, weak: 0, vuln: 0, shiv: 0, mir: 0,
        stance: 'none', orbs: [], slots: p.ch === 'B' ? 3 : (p.relics.some(function (r) { return r.id === 'PrismaticShard'; }) ? 2 : 0), draw: [], hand: [], disc: [], exh: [], pow: [], limbo: [],
        t: {}, c: { lostHp: false, exhausted: 0, powersPlayed: 0, used: {}, shuffles: 0, cubesGained: 0 }, ready: false,
        tempStr: 0, strLossEnd: 0, dead: false };
    })
  };
  // "Once per combat" relic uses start fresh.
  run.players.forEach(function (p) { p.relics.forEach(function (r) { delete r.usedCombat; }); });
  return new Combat(g, cs);
};

C.pcs = function () { return this.s.pcs; };
C.pc = function (i) { return this.s.pcs[i]; };
C.P = function (pc) { return this.g.run.players[pc.i]; };
C.n = function () { return this.s.pcs.length; };
C.alive = function () { return this.s.enemies.filter(function (e) { return !e.dead && !e.fled; }); };
C.enemy = function (u) { for (var i = 0; i < this.s.enemies.length; i++) if (this.s.enemies[i].u === u) return this.s.enemies[i]; return null; };
C.mdef = function (e) { return STS.MONSTERS[e.id]; };
C.isBoss = function (e) { return e.row === -1; };
C.rowEnemies = function (r) { return this.alive().filter(function (e) { return e.row === r; }); };
C.aoeTargets = function (r) { return this.alive().filter(function (e) { return e.row === r || e.row === -1; }); };
C.pcInRow = function (r) { for (var i = 0; i < this.s.pcs.length; i++) if (this.s.pcs[i].row === r) return this.s.pcs[i]; return null; };
C.rnd = function (n) { return this.g.rand(n); };
C.asc = function () { return this.g.run.asc || 0; };
C.has = function (pc, relic) { return this.g.hasRelic(this.P(pc), relic); };
C.log = function (msg) { this.s.log.push(msg); if (this.s.log.length > 80) this.s.log.shift(); this.g.emit({ t: 'log', msg: msg }); };
C.emit = function (ev) { return this.g.emit(ev); };
C.ask = function (pc, q) { return this.g.ask(pc.i, q); };
C.cardSnap = function (c, pc) { return { u: c.u, id: c.id, up: !!c.up, cost: pc ? this.costOf(pc, c) : null }; };

/* ------------------------------------------------------------------ enemies */
C.spawn = function (id, row, opts) {
  opts = opts || {};
  var m = STS.MONSTERS[id];
  if (!m) throw new Error('unknown monster ' + id);
  var n = this.n(), asc = this.asc();
  var hp = typeof m.hp === 'function' ? m.hp(asc, n, this) : m.hp;
  if (opts.hp != null) hp = opts.hp;
  var e = { u: this.s.uid++, id: id, row: row, hp: hp, max: hp, blk: 0, str: 0, weak: 0, vuln: 0, psn: 0, dead: false, fled: false,
    cube: 0, mode: m.startMode || null, beh: opts.beh || m.beh || null, x: {}, summon: !!opts.summon, pos: this.s.uid };
  if (opts.pos != null) e.pos = opts.pos;
  this.s.enemies.push(e);
  if (m.onSpawn) m.onSpawn(this, e, opts);
  return e;
};
C.summonFrom = function (key, row, opts) {
  var entry = this.g.drawSummon(key);
  if (!entry) return null;
  // Summon cards are "Monster|behaviour" (the behaviour row printed on that copy of the card).
  var parts = String(entry).split('|');
  var e = this.spawn(parts[0], row, Object.assign({ summon: true }, parts[1] ? { beh: parts[1] } : {}, opts || {}));
  e.summonKey = key; e.summonEntry = entry;
  this.emit({ t: 'spawn', u: e.u });
  return e;
};
C.queueSummon = function (key, row, extra) { this.s.pending.push(Object.assign({ round: this.s.round + 1, key: key, row: row }, extra || {})); };

/* ------------------------------------------------------------------ main loop */
C.run = async function () {
  var s = this.s;
  if (s.phase === 'setup') {
    await this.setup();
    if (this.checkEnd()) return this.finish();
  }
  while (!s.over) {
    if (s.phase === 'setup' || s.phase === 'round') { await this.startRound(); if (s.over) break; }
    if (s.phase === 'play') { await this.playPhase(); if (s.over) break; s.phase = 'endturn'; }
    if (s.phase === 'endturn') { await this.endTurn(); if (s.over) break; s.phase = 'enemy'; }
    if (s.phase === 'enemy') { await this.enemyTurn(); if (s.over) break; s.phase = 'round'; }
  }
  return this.finish();
};

C.setup = async function () {
  var s = this.s, self = this;
  var enc = STS.ENCOUNTERS[s.enc];
  if (enc && enc.setup) await enc.setup(this);
  // decks
  this.pcs().forEach(function (pc) {
    var P = self.P(pc);
    pc.draw = P.deck.map(function (c) { return { u: c.u, id: c.id, up: !!c.up }; });
    self.g.shuffle(pc.draw);
    pc.disc = []; pc.hand = []; pc.exh = []; pc.pow = [];
  });
  for (var i = 0; i < s.enemies.length; i++) { var e = s.enemies[i], m = this.mdef(e); if (m.start) await m.start(this, e); }
  if (s.burning) {
    // Emerald key: each player shuffles 2 Burns into their deck before the Burning Elite.
    for (var j = 0; j < this.pcs().length; j++) await this.addStatus(this.pcs()[j], 'Burn', 2, 'shuffle');
  }
  s.phase = 'round';
  this.emit({ t: 'combatStart' });
};

C.checkEnd = function () {
  var s = this.s;
  if (s.over) return true;
  var dead = this.pcs().filter(function (pc) { return pc.dead; });
  if (dead.length) { s.over = true; s.result = 'defeat'; return true; }
  var keep = s.pending.some(function (p) { return p.keep; });
  if (!this.alive().length && !keep) { s.over = true; s.result = 'victory'; s.pending = []; return true; }
  return false;
};

C.finish = async function () {
  var s = this.s;
  s.phase = 'over';
  this.emit({ t: 'combatEnd', result: s.result });
  return s.result;
};

/* ------------------------------------------------------------------ rounds */
C.startRound = async function () {
  var s = this.s, self = this;
  s.round++;
  s.phase = 'start';
  s.turnPlays = [];
  this.emit({ t: 'round', n: s.round });
  // Delayed summons ("at the start of the next round")
  var due = s.pending.filter(function (p) { return p.round <= s.round; });
  s.pending = s.pending.filter(function (p) { return p.round > s.round; });
  for (var i = 0; i < due.length; i++) {
    var p = due[i];
    if (p.fn) await STS.MONSTERS[p.mid][p.fn](this, p);
    else this.summonFrom(p.key, p.row, p.opts);
  }
  for (var ei = 0; ei < s.enemies.length; ei++) { var e = s.enemies[ei], m = this.mdef(e); if (m.roundStart) await m.roundStart(this, e); }
  // Player turn: reset, draw 5
  this.pcs().forEach(function (pc) {
    pc.t = { played: 0, attacks: 0, skills: 0, powers: 0, discarded: 0, stanceSwitched: false, noDraw: false, lostHp: false,
      first: null, lastAtkSkill: null, scryDiscard: false, attacksInclShiv: 0 };
    pc.pow.forEach(function (p) { p.usedTurn = false; });
    pc.ready = false;
  });
  for (var k = 0; k < this.pcs().length; k++) {
    var pc = this.pcs()[k];
    var en = 3 + this.g.energyBonus(this.P(pc));
    if (pc.iceCream) { en += pc.iceCream; pc.iceCream = 0; }
    pc.en = Math.min(CAP.energy, en);
    var keep = this.powCount(pc, 'Barricade') > 0 || pc.keepBlock;
    pc.keepBlock = false;
    if (!keep) pc.blk = 0;
    for (var f = 0; f < pc.pow.length; f++) if (pc.pow[f].id === 'Foresight') await this.scry(pc, pc.pow[f].up ? 4 : 3);
    await this.draw(pc, 5, { turnDraw: true });
  }
  // Roll the die
  await this.rollDie();
  // Start of turn abilities (start of combat on round 1)
  for (var j = 0; j < this.pcs().length; j++) {
    await this.startOfTurn(this.pcs()[j]);
    if (this.checkEnd()) return;
  }
  for (var ej = 0; ej < s.enemies.length; ej++) { var e2 = s.enemies[ej], m2 = this.mdef(e2); if (!e2.dead && m2.turnStart) await m2.turnStart(this, e2); }
  if (this.checkEnd()) return;
  if (s.facing) { await this.facingStep(); if (this.checkEnd()) return; }
  s.phase = 'play';
  this.g.checkpoint();
};

C.rollDie = async function () {
  var s = this.s;
  s.die = this.rnd(6) + 1;
  s.dieRolled = s.die;
  this.emit({ t: 'die', v: s.die });
  // Modifiers must be used now, before other abilities resolve.
  await this.g.dieWindow(this);
  this.emit({ t: 'dieFinal', v: s.die });
  // Die relic abilities
  for (var i = 0; i < this.pcs().length; i++) await this.g.dieRelics(this, this.pcs()[i], s.die);
};

C.startOfTurn = async function (pc) {
  var s = this.s, P = this.P(pc), g = this.g;
  if (s.round === 1) await g.relicHook(this, pc, 'startCombat');
  await g.relicHook(this, pc, 'startTurn');
  var pows = pc.pow.slice();
  for (var i = 0; i < pows.length; i++) {
    var inst = pows[i], d = STS.CARDS[inst.id];
    if (pc.pow.indexOf(inst) < 0) continue;
    if (d.pw && d.pw.startTurn) await d.pw.startTurn(this, pc, inst);
    if (this.checkEnd()) return;
  }
};

/* ------------------------------------------------------------------ play phase */
C.playPhase = function () {
  var self = this;
  this.s.phase = 'play';
  this.g.update();
  return new Promise(function (res) { self._playDone = res; self.tryFinishPlay(); });
};
C.tryFinishPlay = function () {
  if (!this._playDone) return;
  if (this.s.over || this.pcs().every(function (pc) { return pc.ready || pc.dead; })) {
    var r = this._playDone; this._playDone = null;
    var self = this;
    this.q = this.q.then(function () { r(); });
  }
};
C.command = function (pi, cmd) {
  var self = this;
  var p = this.q.then(function () { return self.exec(pi, cmd); });
  this.q = p.then(function () { self.tryFinishPlay(); self.g.update(); }, function (e) { self.g.update(); });
  return p;
};
C.exec = async function (pi, cmd) {
  var s = this.s, pc = this.pc(pi);
  if (!pc) throw new Error('不明なプレイヤーです。');
  if (cmd.type === 'unready') { if (s.phase === 'play' && pc.ready && this._playDone) pc.ready = false; return; }
  if (s.phase !== 'play' || s.over) throw new Error('今は行動できません。');
  if (pc.ready && cmd.type !== 'unready') throw new Error('ターン終了待ちです。キャンセルしてから行動してください。');
  switch (cmd.type) {
    case 'play': return this.playFromHand(pc, cmd);
    case 'shiv': return this.useShiv(pc, cmd);
    case 'miracle': return this.useMiracle(pc);
    case 'potion': return this.g.usePotion(pc.i, cmd.slot, this, cmd);
    case 'relic': return this.g.activateRelic(this, pc, cmd.id, cmd);
    case 'power': return this.activatePower(pc, cmd);
    case 'end': pc.ready = true; this.emit({ t: 'ready', i: pi }); return;
    case 'row': return this.switchRow(pc, cmd.row);
    default: throw new Error('不明な操作です。');
  }
};

/* ------------------------------------------------------------------ costs */
C.baseCost = function (c) { var d = cdef(c); var v = (c.up && d.cu !== undefined) ? d.cu : d.c; return v; };
C.costOf = function (pc, c) {
  var d = cdef(c);
  if (this.unplayable(pc, c)) return null;
  var base = this.baseCost(c);
  if (base === 'X') return 'X';
  var cost = base;
  if (d.costFn) cost = d.costFn(this, pc, c, cost);
  if (c.cm != null) cost = c.cm;
  if (c.est) cost -= c.est;
  if (d.t === 'S' && this.powCount(pc, 'Corruption') > 0) cost = 0;
  if (pc.t.bulletTime && pc.hand.indexOf(c) >= 0) cost = 0;
  if (pc.t.madness && pc.hand.indexOf(c) >= 0) cost = 0;
  if (pc.t.swivel && d.t === 'A') cost = 0;
  if (pc.t.snecko != null && pc.t.played === 0 && !pc.t.sneckoUsed) cost = pc.t.snecko;
  return Math.max(0, cost);
};
C.unplayable = function (pc, c) {
  var d = cdef(c);
  if (d.unplayable) return true;
  if (d.t === 'C' && d.c == null) return true;
  return false;
};
C.canPlay = function (pc, c, quiet) {
  var d = cdef(c);
  if (this.unplayable(pc, c)) return '使用できないカードです。';
  if (pc.t.noMore) return 'このターンはもうカードを使えません。';
  var lim = this.cardLimit(pc);
  if (lim != null && pc.t.played >= lim) return 'タイムワープ：このターンはこれ以上カードを使えません。';
  if (d.can) { var why = d.can(this, pc, c); if (why) return why; }
  var cost = this.costOf(pc, c);
  if (cost !== 'X' && cost > pc.en + pc.mir) return 'エナジーが足りません。';
  return null;
};
C.cardLimit = function (pc) {
  var lim = null;
  this.alive().forEach(function (e) { if (e.x.timeWarp != null) lim = lim == null ? e.x.timeWarp : Math.min(lim, e.x.timeWarp); });
  return lim;
};

/* ------------------------------------------------------------------ playing cards */
C.playFromHand = async function (pc, cmd) {
  var c = null;
  for (var i = 0; i < pc.hand.length; i++) if (pc.hand[i].u === cmd.u) c = pc.hand[i];
  if (!c) throw new Error('そのカードは手札にありません。');
  var why = this.canPlay(pc, c);
  if (why) throw new Error(why);
  var cost = this.costOf(pc, c), x = null;
  if (cost === 'X') {
    var maxX = pc.en + pc.mir;
    x = cmd.x != null ? cmd.x : (maxX === 0 ? 0 : await this.ask(pc, { type: 'number', title: cdef(c).name + '：Xの値（支払うエナジー）', min: 0, max: maxX, def: maxX }));
    x = clamp(x | 0, 0, maxX);
    this.pay(pc, x);
  } else this.pay(pc, cost);
  if (pc.t.snecko != null && pc.t.played === 0) pc.t.sneckoUsed = true;
  if (pc.t.madness) pc.t.madness = false;
  if (pc.t.swivel && cdef(c).t === 'A') pc.t.swivel = false;
  await this.playCard(pc, c, { x: x, cmd: cmd, from: 'hand', paid: cost === 'X' ? x : cost });
};
C.pay = function (pc, n) {
  if (n <= pc.en) { pc.en -= n; return; }
  var rest = n - pc.en; pc.en = 0;
  pc.mir -= rest;
  if (pc.mir < 0) throw new Error('エナジーが足りません。');
};

C.leaveHand = function (pc, c) {
  remove(pc.hand, c);
  c.wasRetained = !!c.retained;
  delete c.cm; delete c.rt; delete c.est; delete c.de; delete c.retained;
};

/* Plays a card that is in hand (or was just drawn / searched). opts.free: costs nothing (Havoc etc.). */
C.playCard = async function (pc, c, opts) {
  opts = opts || {};
  var d = cdef(c), s = this.s, self = this;
  if (pc.hand.indexOf(c) >= 0) this.leaveHand(pc, c);
  else { remove(pc.draw, c); remove(pc.disc, c); remove(pc.exh, c); }
  pc.limbo.push(c);
  var isShiv = false;
  pc.t.played++;
  if (d.t === 'A') pc.t.attacks++;
  if (d.t === 'S') pc.t.skills++;
  if (d.t === 'P') pc.t.powers++;
  if (pc.t.first == null) pc.t.first = c.u;
  this.emit({ t: 'play', i: pc.i, card: this.cardSnap(c) });
  this.log(this.P(pc).name + '：' + nameOf(c));
  if (d.t === 'A') pc.t.attacksInclShiv = (pc.t.attacksInclShiv || 0) + 1;
  (s.turnPlays || (s.turnPlays = [])).push({ id: c.id, up: !!c.up, cost: this.baseCost(c), t: d.t, by: pc.i, x: opts.x });
  var k = this.ctx(pc, c, { x: opts.x, cmd: opts.cmd, paid: opts.paid, free: opts.free });
  await this.resolve(k, opts.cmd);
  await this.afterResolution(pc, c, k);
  // Copies ("played twice"): each copy may choose new targets, is affected separately by Weak/Vulnerable,
  // and cannot itself be copied.
  if (!d.noCopy && !opts.noCopy && !s.over && !pc.dead) {
    var times = this.copyCount(pc, c);
    for (var t = 0; t < times && !s.over; t++) {
      var k2 = this.ctx(pc, c, { x: opts.x, copy: true, paid: opts.paid });
      this.emit({ t: 'copy', i: pc.i, card: this.cardSnap(c) });
      await this.resolve(k2, null);
      await this.afterResolution(pc, c, k2);
      if (k2.dest) k.dest = k2.dest;
    }
  }
  if (d.t === 'A' || d.t === 'S') pc.t.lastAtkSkill = { id: c.id, up: c.up, x: opts.x, t: d.t, by: pc.i };
  if (d.t === 'A' || d.t === 'S') s.lastAtkSkill = { id: c.id, up: c.up, x: opts.x, t: d.t, by: pc.i };
  if (d.t === 'A') s.lastAttack = { id: c.id, up: c.up, x: opts.x, by: pc.i };
  // After the card resolves: Weak/Vulnerable tokens, triggered abilities.
  await this.afterCard(pc, c, k);
  // Destination
  if (pc.limbo.indexOf(c) >= 0) {
    remove(pc.limbo, c);
    var dest = k.dest;
    if (!dest) {
      if (d.t === 'P') dest = 'power';
      else if (this.exhaustsOnPlay(pc, c, k)) dest = 'exhaust';
      else dest = 'discard';
    }
    if (dest === 'power') { pc.pow.push({ u: c.u, id: c.id, up: !!c.up, card: c, n: 0, v: (k.powerData && k.powerData.n) || 0, used: false, data: {} }); pc.c.powersPlayed++; this.emit({ t: 'power', i: pc.i, id: c.id }); }
    else if (dest === 'exhaust') await this.exhaustCard(pc, c, { fromPlay: true });
    else if (dest === 'drawTop') pc.draw.push(c);
    else if (dest === 'hand') pc.hand.push(c);
    else pc.disc.push(c);
  }
  if (d.t === 'P' && k.dest !== 'exhaust') await this.onPowerPlayed(pc, c);
  // Triggers that occur after the card finished (Rushdown after Tantrum etc.)
  if (k.after) for (var a = 0; a < k.after.length; a++) await k.after[a]();
  delete c.wasRetained;
  while (pc.afterQ && pc.afterQ.length && !pc.limbo.length) { var fn = pc.afterQ.shift(); await fn(); }
  this.checkEnd();
};

C.exhaustsOnPlay = function (pc, c, k) {
  var d = cdef(c);
  if (k && k.noExhaust) return false;
  if (k && k.forceExhaust) return true;
  if (d.t === 'S' && this.powCount(pc, 'Corruption') > 0) return true;
  var ex = d.ex;
  if (typeof ex === 'function') ex = ex(c);
  else if (Array.isArray(ex)) ex = ex[c.up ? 1 : 0];
  return !!ex;
};

C.copyCount = function (pc, c) {
  var d = cdef(c), t = pc.t;
  if (d.t === 'A') {
    if (t.blasphemy) { t.blasphemy--; return 2; }
    if (t.doubleTap) { t.doubleTap--; return 1; }
    if (t.atkPotion) { t.atkPotion--; return 1; }
    if (t.necro) { t.necro--; return 1; }
  }
  if (d.t === 'S') {
    if (t.burst) { t.burst--; return 1; }
    if (t.sklPotion) { t.sklPotion--; return 1; }
  }
  if (d.t === 'A' || d.t === 'S') {
    var echoes = this.powCount(pc, 'EchoForm');
    if ((t.echoUsed || 0) < echoes) { t.echoUsed = (t.echoUsed || 0) + 1; return 1; }
  }
  return 0;
};

C.resolve = async function (k, cmd) {
  var d = cdef(k.card);
  await this.chooseTargets(k, cmd);
  if (this.s.over) return;
  if (d.play) await d.play(k);
};

C.chooseTargets = async function (k, cmd) {
  var d = cdef(k.card), pc = k.pc, self = this;
  var tg = typeof d.tg === 'function' ? d.tg(k) : d.tg;
  k.tg = tg;
  if (tg === 'E') k.target = await this.chooseEnemy(pc, d.name + '：対象の敵を選択', cmd && cmd.target);
  else if (tg === 'R') k.row = await this.chooseRow(pc, d.name + '：範囲攻撃する列を選択', cmd && cmd.row);
  else if (tg === 'P') k.player = await this.choosePlayer(pc, d.name + '：対象のプレイヤーを選択', cmd && cmd.player);
};

C.chooseEnemy = async function (pc, title, pre) {
  var al = this.alive();
  if (!al.length) return null;
  if (pre != null) { var e = this.enemy(pre); if (e && !e.dead && !e.fled) return e; }
  if (al.length === 1) return al[0];
  var u = await this.ask(pc, { type: 'enemy', title: title || '敵を選択', options: al.map(function (e) { return e.u; }) });
  var t = this.enemy(u);
  if (!t || t.dead || t.fled) t = this.alive()[0] || null;
  return t;
};
C.rowsWithEnemies = function () {
  var rows = [], self = this;
  for (var r = 0; r < this.s.rows; r++) if (this.aoeTargets(r).length) rows.push(r);
  return rows;
};
C.chooseRow = async function (pc, title, pre) {
  var rows = this.rowsWithEnemies();
  if (!rows.length) return pc.row;
  if (pre != null && rows.indexOf(pre) >= 0) return pre;
  // If every row hits the same set (only bosses), any row is equivalent.
  var onlyBoss = this.alive().every(function (e) { return e.row === -1; });
  if (rows.length === 1 || onlyBoss) return rows.indexOf(pc.row) >= 0 ? pc.row : rows[0];
  return await this.ask(pc, { type: 'row', title: title || '列を選択', options: rows });
};
C.choosePlayer = async function (pc, title, pre) {
  var opts = this.pcs().filter(function (x) { return !x.dead; }).map(function (x) { return x.i; });
  if (opts.length === 1) return this.pc(opts[0]);
  if (pre != null && opts.indexOf(pre) >= 0) return this.pc(pre);
  var i = await this.ask(pc, { type: 'player', title: title || 'プレイヤーを選択', options: opts });
  return this.pc(opts.indexOf(i) >= 0 ? i : pc.i);
};

/* Card-effect context */
C.ctx = function (pc, c, o) {
  var self = this, d = cdef(c);
  var k = {
    cb: this, g: this.g, pc: pc, card: c, d: d, up: !!c.up, x: o.x == null ? 0 : o.x, copy: !!o.copy, paid: o.paid || 0,
    target: null, row: null, player: null, dest: null, after: null, hitAny: false, killed: false, dmgDone: 0,
    v: function (a, b) { return c.up ? b : a; },
    atk: function (dmgs, tgt, extra) { return self.attack(pc, tgt || k.target, dmgs, Object.assign({ card: c, k: k }, extra || {})); },
    aoe: function (dmgs, row, extra) { return self.attackRow(pc, row == null ? k.row : row, dmgs, Object.assign({ card: c, k: k }, extra || {})); },
    atkAll: function (dmgs, extra) { return self.attackAll(pc, dmgs, Object.assign({ card: c, k: k }, extra || {})); },
    blk: function (n, to) { return self.gainBlock(to || pc, n + self.footwork(pc, c), { card: c, from: pc }); },
    draw: function (n) { return self.draw(pc, n); },
    weak: function (e, n) { return self.applyWeak(e || k.target, n == null ? 1 : n, pc); },
    vuln: function (e, n) { return self.applyVuln(e || k.target, n == null ? 1 : n, pc); },
    psn: function (e, n) { return self.applyPoison(e || k.target, n == null ? 1 : n, pc); },
    str: function (n, to) { return self.gainStr(to || pc, n == null ? 1 : n); },
    energy: function (n) { return self.gainEnergy(pc, n); },
    shiv: function (n) { return self.gainShiv(pc, n); },
    mir: function (n) { return self.gainMiracle(pc, n); },
    channel: function (t) { return self.channel(pc, t); },
    stance: function (s) { return self.setStance(pc, s); },
    scry: function (n) { return self.scry(pc, n); },
    loseHp: function (n) { return self.loseHp(pc, n); },
    daze: function (n) { return self.addStatus(pc, 'Daze', n == null ? 1 : n, 'drawTop'); },
    pick: function (from, min, max, title, filter) { return self.pickCards(pc, from, min, max, title, filter); },
    exhaustHand: async function (min, max, title, filter) { var cs = await self.pickCards(pc, 'hand', min, max, title || '廃棄するカードを選択', filter); for (var i = 0; i < cs.length; i++) await self.exhaustCard(pc, cs[i]); return cs; },
    discardHand: async function (min, max, title, filter) { var cs = await self.pickCards(pc, 'hand', min, max, title || '捨てるカードを選択', filter); if (cs.length) await self.discardCards(pc, cs, true); return cs; },
    option: function (opts, title) { return self.ask(pc, { type: 'option', title: title || d.name, options: opts }); },
    enemy: function (title) { return self.chooseEnemy(pc, title || (d.name + '：対象の敵を選択')); },
    rowSel: function (title) { return self.chooseRow(pc, title || (d.name + '：列を選択')); },
    playerSel: function (title) { return self.choosePlayer(pc, title || (d.name + '：プレイヤーを選択')); },
    later: function (fn) { (k.after || (k.after = [])).push(fn); }
  };
  return k;
};

/* After-card bookkeeping (rulebook: abilities triggered by the card take effect after it finishes). */
C.afterResolution = async function (pc, c, k) {
  var d = (k && k.shiv) ? k.d : cdef(c);
  // Vulnerable tokens on enemies hit by this card are removed now; the attacker loses one Weak.
  this.s.enemies.forEach(function (e) { if (e.vulnUsed) { e.vulnUsed = false; e.vuln = Math.max(0, Math.min(CAP.vuln, e.vuln - 1)); } else if (e.vuln > CAP.vuln) e.vuln = CAP.vuln; });
  if (d.t === 'A' && pc.weak > 0) pc.weak--;
  if (d.t === 'A' && pc.akabeko) { pc.str = Math.max(0, pc.str - pc.akabeko); pc.akabeko = 0; }
  // Enemy reactions (Enraged, Sharp Hide, Thorns...)
  var al = this.s.enemies.slice();
  for (var i = 0; i < al.length; i++) {
    var e = al[i], m = this.mdef(e);
    if (e.dead || e.fled) continue;
    if (m.afterPlayerCard) await m.afterPlayerCard(this, e, pc, c, k);
    if (pc.dead) break;
  }
};
C.afterCard = async function (pc, c, k) {
  var d = cdef(c), self = this;
  // Player-side triggers
  if (d.t === 'P') {
    for (var j = 0; j < pc.pow.length; j++) if (pc.pow[j].id === 'Heatsinks') await this.draw(pc, pc.pow[j].up ? 3 : 2);
  }
  await this.g.relicHook(this, pc, 'afterCard', c, k);
};

C.onPowerPlayed = async function (pc, c) {
  await this.g.relicHook(this, pc, 'onPower', c);
};

/* Free play of a card that is not in hand (Havoc, Mayhem, Distilled Chaos, Omniscience). */
C.playFree = async function (pc, c, opts) {
  opts = opts || {};
  var d = cdef(c);
  if (this.unplayable(pc, c) || (d.can && d.can(this, pc, c))) {
    // FAQ: unplayable → ignore the effect and discard (Havoc/Mayhem/Distilled Chaos: exhausted if Havoc).
    remove(pc.draw, c); remove(pc.hand, c);
    if (opts.exhaust) await this.exhaustCard(pc, c); else pc.disc.push(c);
    return;
  }
  var x = null;
  if (this.baseCost(c) === 'X') x = 0;
  await this.playCard(pc, c, { x: x, free: true, noCopy: opts.noCopy });
  if (opts.exhaust && d.t !== 'P') {
    if (remove(pc.disc, c) || remove(pc.draw, c)) await this.exhaustCard(pc, c);
  }
};

/* ------------------------------------------------------------------ damage */
C.footwork = function (pc, c) {
  var d = cdef(c);
  if (d.t !== 'A' && d.t !== 'S') return 0;
  var n = 0; pc.pow.forEach(function (p) { if (p.id === 'Footwork') n++; });
  return n;
};
C.hitBonus = function (pc, opts) {
  var b = pc.str;
  if (opts.heavy) b = pc.str * opts.heavy;
  if (opts.noStr) b = 0;
  if (pc.stance === 'wrath') { b += 1; b += this.powSum(pc, 'SimmeringFury', function (p) { return p.up ? 2 : 1; }); }
  if (opts.shiv) b += this.powSum(pc, 'Accuracy', function () { return 1; });
  if (opts.zeroCost && (opts.card || opts.shiv || opts.relicAttack) && this.has(pc, 'WristBlade')) b += 1;
  if (opts.card && this.isStarterStrike(opts.card)) {
    b += this.powSum(pc, 'Apotheosis', function () { return 1; });
    b += this.powSum(pc, 'ConjureBlade', function (p) { return p.v || 0; });
    if (this.has(pc, 'StrikeDummy')) b += 1;
  }
  return b;
};
C.isStarterStrike = function (c) { return /^Strike[RGBW]$/.test(c.id); };

/* One attack (one card / Shiv / ability with HIT icons) against a single enemy. */
C.attack = async function (pc, e, dmgs, opts) {
  opts = opts || {};
  if (!e || e.dead || e.fled) return { dealt: 0 };
  var total = 0, killed = false, unblocked = 0;
  if (typeof dmgs === 'number') dmgs = [dmgs];
  if (opts.card && opts.k) opts.zeroCost = opts.k.paid === 0;
  for (var i = 0; i < dmgs.length; i++) {
    if (e.dead || e.fled || this.s.over) break;
    var r = await this.hit(pc, e, dmgs[i], opts);
    total += r.dealt; unblocked += r.hp;
    if (r.killed) killed = true;
  }
  if (opts.k) { opts.k.hitAny = true; opts.k.dmgDone += total; if (killed) opts.k.killed = true; }
  return { dealt: total, hp: unblocked, killed: killed };
};
C.attackRow = async function (pc, row, dmgs, opts) {
  opts = opts || {};
  if (typeof dmgs === 'number') dmgs = [dmgs];
  var ts = this.aoeTargets(row);
  var res = [];
  for (var h = 0; h < dmgs.length; h++) {
    for (var i = 0; i < ts.length; i++) {
      var e = ts[i];
      if (e.dead || e.fled || this.s.over) continue;
      var r = await this.hit(pc, e, dmgs[h], Object.assign({ aoe: true }, opts));
      res.push(r);
    }
  }
  if (opts.k) opts.k.hitAny = true;
  return res;
};
C.attackAll = async function (pc, dmgs, opts) {
  opts = opts || {};
  if (typeof dmgs === 'number') dmgs = [dmgs];
  var ts = this.alive();
  for (var h = 0; h < dmgs.length; h++)
    for (var i = 0; i < ts.length; i++) if (!ts[i].dead && !ts[i].fled && !this.s.over) await this.hit(pc, ts[i], dmgs[h], Object.assign({ aoe: true }, opts));
  if (opts.k) opts.k.hitAny = true;
};

/* A single HIT from a player. */
C.hit = async function (pc, e, base, opts) {
  opts = opts || {};
  var m = this.mdef(e);
  var dmg = base + this.hitBonus(pc, opts);
  var weak = pc.weak > 0, vuln = e.vuln > 0;
  if (opts.noMods) { weak = false; vuln = false; }
  if (weak && vuln) { e.vulnUsed = true; }
  else if (weak) dmg -= 1;
  else if (vuln) { dmg *= 2; e.vulnUsed = true; }
  if (m.hitTaken) dmg = m.hitTaken(this, e, dmg, pc, opts);
  if (pc.t.dealZero) dmg = 0;
  dmg = Math.max(0, dmg);
  var r = await this.damageEnemy(e, dmg, { pc: pc, hit: true, attack: !!opts.card || opts.shiv, card: opts.card, shiv: opts.shiv });
  // Envenom: every HIT also applies Poison (including Shivs), blocked or not.
  if (!e.dead && !e.fled) { var env = this.powCount(pc, 'Envenom'); if (env) await this.applyPoison(e, env, pc); }
  return r;
};

/* Damage to an enemy (HIT or not). Returns {dealt, hp, killed}. */
C.damageEnemy = async function (e, dmg, o) {
  o = o || {};
  if (e.dead || e.fled) return { dealt: 0, hp: 0 };
  var m = this.mdef(e);
  if (o.pc && o.pc.t.dealZero) dmg = 0;
  var b = o.ignoreBlock ? 0 : Math.min(e.blk, dmg);
  e.blk -= b;
  var hpLoss = dmg - b;
  if (e.x.intangible) hpLoss = 0;
  if (m.capLoss) hpLoss = m.capLoss(this, e, hpLoss);
  var before = e.hp;
  e.hp -= hpLoss;
  this.emit({ t: 'edmg', u: e.u, n: dmg, blocked: b, hp: hpLoss });
  if (m.onDamaged) await m.onDamaged(this, e, dmg, hpLoss, o);
  if (e.hp <= 0 && !e.dead) await this.killEnemy(e, o);
  return { dealt: dmg, hp: hpLoss, killed: e.dead };
};
C.killEnemy = async function (e, o) {
  var m = this.mdef(e);
  if (m.beforeDeath) { var saved = await m.beforeDeath(this, e, o); if (saved) return; }
  e.hp = 0; e.dead = true; e.blk = 0; e.str = 0; e.weak = 0; e.vuln = 0;
  var corpse = e.corpse, cc = e.corpseCard; e.psn = 0; e.corpse = null; e.corpseCard = null;
  this.emit({ t: 'die', u: e.u });
  if (m.onDeath) await m.onDeath(this, e, o);
  if (corpse) {
    // Corpse Explosion: deal damage to its row (once, even if played twice), then discard the card.
    if (cc) { var owner = this.pc(cc.pi); remove(owner.attached || [], cc.card); owner.disc.push(cc.card); }
    if (e.row < 0) await this.damageAllEnemies(corpse, cc ? this.pc(cc.pi) : null);
    else await this.damageRow(e.row, corpse, cc ? this.pc(cc.pi) : null);
  }
  var self = this;
  if (o && o.pc && o.feed) o.feed.killed = true;
  this.checkEnd();
};

/* Non-HIT damage (blockable). */
C.damageRow = async function (row, n, pc) {
  var ts = this.aoeTargets(row);
  for (var i = 0; i < ts.length; i++) if (!this.s.over) await this.damageEnemy(ts[i], n, { pc: pc });
};
C.damageAllEnemies = async function (n, pc) {
  var ts = this.alive();
  for (var i = 0; i < ts.length; i++) if (!this.s.over) await this.damageEnemy(ts[i], n, { pc: pc });
};
C.damageTarget = async function (pc, n, title) {
  var e = await this.chooseEnemy(pc, title);
  if (e) await this.damageEnemy(e, n, { pc: pc });
};
C.damageAnyRow = async function (pc, n, title) {
  var r = await this.chooseRow(pc, title || 'ダメージを与える列を選択');
  await this.damageRow(r, n, pc);
};

/* ------------------------------------------------------------------ damage to players */
C.damagePlayer = async function (pc, n, o) {
  o = o || {};
  if (pc.dead || n <= 0) { return { blocked: 0, hp: 0 }; }
  var b = Math.min(pc.blk, n);
  pc.blk -= b;
  var hp = n - b;
  this.emit({ t: 'pdmg', i: pc.i, n: n, blocked: b });
  var lost = await this.loseHp(pc, hp, o);
  return { blocked: b, hp: lost };
};
C.loseHp = async function (pc, n, o) {
  o = o || {};
  if (pc.dead || n <= 0) return 0;
  var P = this.P(pc);
  // Buffer: prevent the next HP loss, then exhaust (or remove a cube).
  for (var i = 0; i < pc.pow.length; i++) {
    var b = pc.pow[i];
    if (b.id === 'Buffer') {
      b.n = (b.n || 0) + 1;
      var limit = b.up ? 2 : 1;
      this.emit({ t: 'buffer', i: pc.i });
      if (b.n >= limit) { pc.pow.splice(i, 1); pc.c.powersPlayed--; await this.exhaustCard(pc, b.card, { fromPower: true }); }
      return 0;
    }
  }
  // Intangible-like: can't lose more than 1 HP this round/turn.
  if (pc.capHp) {
    var room = Math.max(0, 1 - (pc.capHpLost || 0));
    n = Math.min(n, room);
    pc.capHpLost = (pc.capHpLost || 0) + n;
    if (n <= 0) return 0;
  }
  P.hp -= n;
  pc.c.lostHp = true; pc.t.lostHp = true;
  this.emit({ t: 'hp', i: pc.i, n: -n });
  await this.g.relicHook(this, pc, 'onHpLoss', n);
  if (P.hp <= 0) {
    var saved = await this.g.tryFairy(pc.i, this);
    if (!saved) { P.hp = 0; pc.dead = true; this.emit({ t: 'pdead', i: pc.i }); this.checkEnd(); }
  }
  return n;
};
C.healPlayer = function (pc, n) {
  var P = this.P(pc);
  if (pc.dead || n <= 0) return 0;
  var max = this.g.maxHp(P);
  var before = P.hp;
  P.hp = Math.min(max, P.hp + n);
  if (P.hp > before) this.emit({ t: 'heal', i: pc.i, n: P.hp - before });
  return P.hp - before;
};

/* ------------------------------------------------------------------ tokens */
C.gainBlock = async function (pc, n, o) {
  o = o || {};
  if (n <= 0 || pc.dead) return 0;
  var before = pc.blk;
  pc.blk = Math.min(CAP.block, pc.blk + n);
  var got = pc.blk - before;
  this.emit({ t: 'blk', i: pc.i, n: got });
  if (got > 0) {
    // Juggernaut: whenever you gain Block, deal damage to an enemy.
    for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === 'Juggernaut' && this.alive().length) await this.damageTarget(pc, pc.pow[i].up ? 2 : 1, 'ジャガーノート：ダメージを与える敵を選択');
  }
  return got;
};
C.gainStr = function (pc, n) { var b = pc.str; pc.str = clamp(pc.str + n, 0, CAP.str); this.emit({ t: 'str', i: pc.i, n: pc.str - b }); return pc.str - b; };
C.tempStr = function (pc, n) { var got = this.gainStr(pc, n); pc.strLossEnd += n; return got; };
C.gainEnergy = function (pc, n) { var b = pc.en; pc.en = clamp(pc.en + n, 0, CAP.energy); this.emit({ t: 'en', i: pc.i, n: pc.en - b }); return pc.en - b; };
C.gainShiv = async function (pc, n) {
  for (var i = 0; i < n; i++) {
    if (pc.shiv < CAP.shiv) pc.shiv++;
    else if (this.s.phase === 'play' && this.alive().length) {
      // Out of tokens: may use the Shiv immediately instead of losing it.
      var ok = await this.ask(pc, { type: 'confirm', title: 'ナイフが上限です。今すぐ1本使いますか？', yes: '使う', no: '捨てる' });
      if (ok) await this.useShiv(pc, { immediate: true });
    }
  }
  this.emit({ t: 'shiv', i: pc.i });
};
C.gainMiracle = function (pc, n) { pc.mir = Math.min(CAP.miracle, pc.mir + n); this.emit({ t: 'mir', i: pc.i }); };
C.useMiracle = function (pc) {
  if (pc.mir <= 0) throw new Error('奇跡がありません。');
  if (pc.en >= CAP.energy) throw new Error('エナジーは最大です。');
  pc.mir--; this.gainEnergy(pc, 1);
};
C.useShiv = async function (pc, cmd) {
  if (!cmd.immediate) {
    if (pc.shiv <= 0) throw new Error('ナイフがありません。');
    pc.shiv--;
  }
  var e = await this.chooseEnemy(pc, 'ナイフ：対象の敵を選択', cmd.target);
  if (!e) return;
  this.emit({ t: 'shivUse', i: pc.i, u: e.u });
  pc.t.shivs = (pc.t.shivs || 0) + 1;
  pc.t.attacksInclShiv = (pc.t.attacksInclShiv || 0) + 1;
  var zero = this.has(pc, 'WristBlade');
  await this.attack(pc, e, [1], { shiv: true, zeroCost: zero });
  // A Shiv is a separate Attack: Weak/Vulnerable resolve after it.
  await this.afterResolution(pc, { id: 'Shiv', shiv: true }, { target: e, shiv: true, d: { t: 'A' } });
  this.checkEnd();
};
C.applyWeak = async function (e, n, src) {
  if (!e || e.dead || e.fled || n <= 0) return;
  var m = this.mdef(e);
  if (m.noWeak && m.noWeak(this, e)) return;
  e.weak = Math.min(CAP.weak, e.weak + n);
  this.emit({ t: 'tok', u: e.u, k: 'weak' });
  await this.onTokenApplied(e, 'weak', n, src);
};
C.applyVuln = async function (e, n, src) {
  if (!e || e.dead || e.fled || n <= 0) return;
  e.vuln = Math.min(CAP.vuln + (e.vulnUsed ? 1 : 0), e.vuln + n);
  this.emit({ t: 'tok', u: e.u, k: 'vuln' });
  await this.onTokenApplied(e, 'vuln', n, src);
};
C.poisonTotal = function () { return this.s.enemies.reduce(function (a, e) { return a + (e.dead ? 0 : e.psn); }, 0); };
C.applyPoison = async function (e, n, src) {
  if (!e || e.dead || e.fled || n <= 0) return;
  var room = CAP.poison - this.poisonTotal();
  var add = Math.max(0, Math.min(room, n));
  e.psn += add;
  this.emit({ t: 'tok', u: e.u, k: 'psn' });
  if (add > 0) await this.onTokenApplied(e, 'psn', add, src);
};
C.onTokenApplied = async function (e, kind, n, src) {
  if (!src || !src.pow) return;
  for (var i = 0; i < src.pow.length; i++) {
    var p = src.pow[i];
    if (p.id === 'SadisticNature') await this.damageEnemy(e, (p.up ? 2 : 1) * n, { pc: src });
    if (p.id === 'Distraction' && !p.usedTurn) { p.usedTurn = true; await this.gainBlock(src, 2); }
  }
};
C.weakPlayer = function (pc, n) { if (pc.dead) return; pc.weak = Math.min(CAP.weak, pc.weak + n); this.emit({ t: 'ptok', i: pc.i, k: 'weak' }); };
C.vulnPlayer = function (pc, n) { if (pc.dead) return; pc.vuln = Math.min(CAP.vuln, pc.vuln + n); this.emit({ t: 'ptok', i: pc.i, k: 'vuln' }); };

/* ------------------------------------------------------------------ piles */
C.shuffleDiscard = async function (pc) {
  if (!pc.disc.length) return false;
  pc.draw = pc.disc.concat(pc.draw);
  pc.disc = [];
  this.g.shuffle(pc.draw);
  pc.c.shuffles++;
  this.emit({ t: 'shuffle', i: pc.i });
  for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === 'AThousandCuts') await this.damageAnyRow(pc, pc.pow[i].up ? 7 : 5, '千の切り傷：ダメージを与える列を選択');
  await this.g.relicHook(this, pc, 'onShuffle');
  return true;
};
C.draw = async function (pc, n, o) {
  o = o || {};
  var got = [];
  for (var i = 0; i < n; i++) {
    if (pc.dead || this.s.over && !o.turnDraw) break;
    if (!o.turnDraw && (pc.t.noDraw || pc.t.cantDraw)) break;
    if (!pc.draw.length) { var sh = await this.shuffleDiscard(pc); if (!sh) break; }
    var c = pc.draw.pop();
    pc.hand.push(c);
    got.push(c);
    this.emit({ t: 'draw', i: pc.i, u: c.u });
    await this.onDrawn(pc, c);
  }
  return got;
};
C.onDrawn = async function (pc, c) {
  var d = cdef(c);
  var statusish = c.id === 'Daze' || c.id === 'Burn' || c.id === 'Slimed';
  if (c.id === 'Slimed' && this.alive().some(function (e) { return e.id === 'AwakenedOne2'; })) {
    // Void: pay 1 energy to exhaust it, if able.
    if (pc.en >= 1 && pc.hand.indexOf(c) >= 0) { pc.en -= 1; await this.exhaustCard(pc, c); this.log('虚無：粘液を廃棄'); return; }
  }
  for (var i = 0; i < pc.pow.length; i++) {
    var p = pc.pow[i];
    if (p.id === 'Evolve' && statusish) await this.draw(pc, 1);
    if (p.id === 'FireBreathing' && (statusish || d.t === 'C')) await this.damageAnyRow(pc, p.up ? 3 : 2, 'ファイアブレス：ダメージを与える列を選択');
  }
  if (d.t === 'C') await this.g.relicHook(this, pc, 'onDrawCurse', c);
};
C.discardCards = async function (pc, cards, byEffect) {
  if (!cards.length) return;
  for (var i = 0; i < cards.length; i++) {
    var c = cards[i];
    if (pc.hand.indexOf(c) >= 0) this.leaveHand(pc, c);
    pc.disc.push(c);
    this.emit({ t: 'discard', i: pc.i, u: c.u });
  }
  if (!byEffect) return;
  pc.t.discarded += cards.length;
  for (var j = 0; j < cards.length; j++) {
    var c2 = cards[j], d = cdef(c2);
    if (d.onDiscard) await d.onDiscard(this, pc, c2);
  }
  for (var k = 0; k < pc.pow.length; k++) if (pc.pow[k].id === 'AfterImage') await this.gainBlock(pc, 1);
};
C.exhaustCard = async function (pc, c, o) {
  o = o || {};
  if (pc.hand.indexOf(c) >= 0) this.leaveHand(pc, c);
  remove(pc.draw, c); remove(pc.disc, c); remove(pc.limbo, c);
  var d = cdef(c);
  if (d.t === 'T') {
    // Status and Daze return to their supply when Exhausted.
    if (c.id === 'Daze') this.s.supply.daze++; else this.s.supply.status++;
    this.emit({ t: 'exhaust', i: pc.i, u: c.u, ret: true });
  } else {
    pc.exh.push(c);
    this.emit({ t: 'exhaust', i: pc.i, u: c.u });
  }
  pc.c.exhausted++;
  if (d.onExhaust) await d.onExhaust(this, pc, c);
  for (var i = 0; i < pc.pow.length; i++) {
    var p = pc.pow[i];
    if (p.id === 'FeelNoPain') await this.gainBlock(pc, 1);
    if (p.id === 'DarkEmbrace') { var got = await this.draw(pc, 1); if (o.ethereal) got.forEach(function (x) { x.de = 1; }); }
    if (p.id === 'Berserk') await this.damageAnyRow(pc, p.up ? 2 : 1, 'バーサーク：ダメージを与える列を選択');
  }
  await this.g.relicHook(this, pc, 'onExhaust', c);
};
C.pickCards = async function (pc, from, min, max, title, filter) {
  var pile = from === 'hand' ? pc.hand : from === 'discard' ? pc.disc : from === 'draw' ? pc.draw : from === 'exhaust' ? pc.exh : from;
  var cands = pile.filter(function (c) { return !filter || filter(c); });
  if (!cands.length) return [];
  max = Math.min(max, cands.length); min = Math.min(min, max);
  if (min === max && min === cands.length && !(from === 'draw' || from === 'discard')) return cands.slice();
  var self = this;
  var ans = await this.ask(pc, { type: 'cards', title: title || 'カードを選択', from: typeof from === 'string' ? from : 'list', min: min, max: max,
    cards: cands.map(function (c) { return self.cardSnap(c, pc); }) });
  var picked = [];
  (ans || []).forEach(function (u) { for (var i = 0; i < cands.length; i++) if (cands[i].u === u && picked.indexOf(cands[i]) < 0) picked.push(cands[i]); });
  if (picked.length < min) { cands.forEach(function (c) { if (picked.length < min && picked.indexOf(c) < 0) picked.push(c); }); }
  return picked.slice(0, max);
};
C.addStatus = async function (pc, id, n, where) {
  if (pc.dead) return 0;
  var added = 0;
  for (var i = 0; i < n; i++) {
    if (id === 'Daze') { if (this.s.supply.daze <= 0) break; this.s.supply.daze--; }
    else { if (this.s.supply.status <= 0) break; this.s.supply.status--; }
    var c = { u: this.g.uid(), id: id, up: false, tmp: true };
    if (where === 'drawTop' || (where == null && id === 'Daze')) pc.draw.push(c);
    else if (where === 'shuffle') { pc.draw.splice(this.rnd(pc.draw.length + 1), 0, c); }
    else pc.disc.push(c);
    added++;
  }
  if (added) this.emit({ t: 'status', i: pc.i, id: id, n: added });
  return added;
};

/* Scry X: look at the top X cards, discard any number, keep the rest in order. */
C.scry = async function (pc, n) {
  if (pc.dead) return;
  if (!pc.draw.length) return;
  var top = pc.draw.slice(-n).reverse();
  var self = this;
  var ans = await this.ask(pc, { type: 'cards', title: '占術' + n + '：捨てるカードを選択（残りは同じ順で戻す）', from: 'scry', min: 0, max: top.length,
    cards: top.map(function (c) { return self.cardSnap(c, pc); }) });
  var disc = top.filter(function (c) { return (ans || []).indexOf(c.u) >= 0; });
  disc.forEach(function (c) { remove(pc.draw, c); pc.disc.push(c); });
  if (disc.length) pc.t.scryDiscard = true;
  this.emit({ t: 'scry', i: pc.i, n: disc.length });
  for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === 'Nirvana') await this.gainBlock(pc, pc.pow[i].up ? 2 : 1);
  // Weave: if discarded by Scry, play it.
  for (var j = 0; j < disc.length; j++) {
    var c = disc[j], d = cdef(c);
    if (d.onScryDiscard) await d.onScryDiscard(this, pc, c);
  }
  await this.g.relicHook(this, pc, 'onScry', n);
};

/* ------------------------------------------------------------------ orbs */
C.channel = async function (pc, type) {
  if (pc.dead) return;
  if (pc.slots <= 0) {
    // Other characters' orbs come with the Prismatic Shard (2 slots).
    if (this.P(pc).ch !== 'B' && this.g.grantPrismatic(this.P(pc))) pc.slots = 2;
    if (pc.slots <= 0) return;
  }
  if (type === 'dark' && pc.orbs.filter(function (o) { return o === 'dark'; }).length >= CAP.dark) {
    if (pc.orbs.length < pc.slots) return; // no Dark cubes left
  }
  if (pc.orbs.length >= pc.slots) {
    var idx = await this.chooseOrb(pc, '空きスロットがありません。解放するオーブを選択');
    await this.evokeAt(pc, idx, 1);
  }
  if (type === 'dark' && pc.orbs.filter(function (o) { return o === 'dark'; }).length >= CAP.dark) return;
  pc.orbs.push(type);
  this.emit({ t: 'channel', i: pc.i, o: type });
};
C.chooseOrb = async function (pc, title, filter) {
  var opts = [];
  pc.orbs.forEach(function (o, i) { if (!filter || filter(o)) opts.push(i); });
  if (!opts.length) return -1;
  if (opts.length === 1) return opts[0];
  var same = opts.every(function (i) { return pc.orbs[i] === pc.orbs[opts[0]]; });
  if (same) return opts[0];
  var ans = await this.ask(pc, { type: 'orb', title: title || 'オーブを選択', options: opts, orbs: pc.orbs.slice() });
  return opts.indexOf(ans) >= 0 ? ans : opts[0];
};
C.evokeBonus = function (pc) { return this.powSum(pc, 'Consume', function () { return 1; }); };
C.evokeAt = async function (pc, idx, times) {
  if (idx < 0 || idx >= pc.orbs.length) return;
  var type = pc.orbs.splice(idx, 1)[0];
  this.emit({ t: 'evoke', i: pc.i, o: type });
  for (var t = 0; t < (times || 1); t++) await this.evokeEffect(pc, type);
};
C.evokeEffect = async function (pc, type) {
  var bonus = this.evokeBonus(pc);
  if (type === 'lightning') await this.lightningDamage(pc, 2 + bonus, '解放：ライトニングの対象');
  else if (type === 'frost') await this.gainBlock(pc, 1 + bonus);
  else if (type === 'dark') {
    var amp = this.powSum(pc, 'Amplify', function (p) { return p.up ? 5 : 3; });
    var dmg = 3 + bonus + amp + this.powersInPlay(pc);
    var e = await this.chooseEnemy(pc, '解放：ダークの対象');
    if (e) await this.damageEnemy(e, dmg, { pc: pc });
  }
};
C.lightningDamage = async function (pc, n, title) {
  if (this.powCount(pc, 'Electrodynamics') > 0) await this.damageAnyRow(pc, n, title + '（列）');
  else await this.damageTarget(pc, n, title);
};
C.orbEnd = async function (pc, idx) {
  var type = pc.orbs[idx];
  var defrag = this.powCount(pc, 'Defragment');
  if (type === 'lightning') {
    var sd = this.powSum(pc, 'StaticDischarge', function (p) { return p.up ? 2 : 1; });
    await this.lightningDamage(pc, 1 + defrag + sd, 'ライトニング：対象');
  } else if (type === 'frost') await this.gainBlock(pc, 1 + defrag);
};
C.evokeFirst = async function (pc, times, title) {
  if (!pc.orbs.length) return;
  var idx = await this.chooseOrb(pc, title || '解放するオーブを選択');
  await this.evokeAt(pc, idx, times || 1);
};

/* ------------------------------------------------------------------ stances (Watcher) */
C.setStance = async function (pc, st) {
  if (pc.stance === st) return;
  if (this.P(pc).ch !== 'W' && st !== 'none') this.g.grantPrismatic(this.P(pc));
  var old = pc.stance;
  pc.stance = st;
  pc.t.stanceSwitched = true;
  this.emit({ t: 'stance', i: pc.i, s: st });
  if (old === 'calm') this.gainEnergy(pc, 2);
  for (var i = 0; i < pc.pow.length; i++) {
    var p = pc.pow[i];
    if (p.id === 'MentalFortress') await this.gainBlock(pc, p.up ? 2 : 1);
    if (p.id === 'Rushdown' && st === 'wrath' && !p.usedTurn) {
      p.usedTurn = true;
      var n = p.up ? 3 : 2, self = this;
      if (this._cardInFlight(pc)) this._queueAfter(pc, function () { return self.draw(pc, n); });
      else await this.draw(pc, n);
    }
  }
};
C._cardInFlight = function (pc) { return pc.limbo.length > 0; };
C._queueAfter = function (pc, fn) { (pc.afterQ || (pc.afterQ = [])).push(fn); };

/* ------------------------------------------------------------------ powers */
C.powCount = function (pc, id) { var n = 0; for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === id) n++; return n; };
C.powSum = function (pc, id, f) { var n = 0; for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === id) n += f(pc.pow[i]); return n; };
C.powersInPlay = function (pc) { return pc.pow.length; };
C.activatePower = async function (pc, cmd) {
  var inst = null;
  for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].u === cmd.u) inst = pc.pow[i];
  if (!inst) throw new Error('そのパワーは場にありません。');
  var d = STS.CARDS[inst.id];
  if (!d.pw || !d.pw.activate) throw new Error('起動できないパワーです。');
  if (inst.usedTurn) throw new Error('このターンはもう使いました。');
  inst.usedTurn = true;
  await d.pw.activate(this, pc, inst, cmd);
  this.checkEnd();
};
C.removePower = async function (pc, inst, exhaust) {
  var i = pc.pow.indexOf(inst);
  if (i < 0) return;
  pc.pow.splice(i, 1);
  pc.c.powersPlayed = Math.max(0, pc.c.powersPlayed - 1);
  if (exhaust) await this.exhaustCard(pc, inst.card, { fromPower: true });
  else pc.disc.push(inst.card);
};

/* ------------------------------------------------------------------ rows (Act IV elite) */
/* Spire Shield & Spire Spear: after start-of-turn effects, players can switch rows (empty rows included); then each
   player is targeted by the Facing ability of the enemy in their row. */
C.facingInfo = function (row) {
  var e = this.rowEnemies(row)[0];
  if (!e) return null;
  var a = this.currentAction(e);
  return a && a.facing ? { u: e.u, key: a.facing } : null;
};
C.facingStep = async function () {
  var s = this.s, self = this;
  s.rowSwitch = true;
  var rows = []; for (var r = 0; r < s.rows; r++) rows.push(r);
  var labels = { energy: 'エナジーを1失う', nodraw: 'このターン、カードを引けない', zero: 'このターン与えるダメージが0になる', burn: '火傷を2枚得る' };
  for (var i = 0; i < this.pcs().length; i++) {
    var pc = this.pcs()[i];
    if (pc.dead || s.over) continue;
    var opts = [pc.row].concat(rows.filter(function (x) { return x !== pc.row; }));
    var ans = await this.ask(pc, { type: 'row', title: '列を移動できます（移動先のプレイヤーと入れ替え）', options: opts, facing: true,
      info: rows.map(function (x) { var f = self.facingInfo(x); var o = self.pcInRow(x); return { row: x, facing: f ? labels[f.key] : 'なし', player: o ? o.i : null }; }) });
    if (opts.indexOf(ans) >= 0 && ans !== pc.row) { this.switchRow(pc, ans); this.emit({ t: 'rowSwitch', i: pc.i, row: ans }); }
  }
  s.rowSwitch = false;
  for (var j = 0; j < this.pcs().length; j++) {
    var p = this.pcs()[j];
    if (p.dead) continue;
    var f = this.facingInfo(p.row);
    if (!f) continue;
    this.emit({ t: 'facing', i: p.i, u: f.u, k: f.key });
    if (f.key === 'energy') p.en = Math.max(0, p.en - 1);
    else if (f.key === 'nodraw') p.t.cantDraw = true;
    else if (f.key === 'zero') p.t.dealZero = true;
    else if (f.key === 'burn') await this.addStatus(p, 'Burn', 2);
    this.log(this.P(p).name + '：対面効果「' + labels[f.key] + '」');
  }
};
C.switchRow = function (pc, row) {
  if (!this.s.rowSwitch) throw new Error('今は列を移動できません。');
  if (row < 0 || row >= this.s.rows) throw new Error('その列はありません。');
  var other = this.pcInRow(row);
  if (other) other.row = pc.row;
  pc.row = row;
};

/* ------------------------------------------------------------------ end of turn */
C.endTurn = async function () {
  var s = this.s, self = this;
  s.phase = 'endturn';
  this.emit({ t: 'endTurn' });
  var pcs = this.pcs().filter(function (pc) { return !pc.dead; });
  // 1. Effects that damage enemies (chosen first so a lethal effect can end the combat).
  if (this.poisonTotal() > 0) {
    var ps = this.alive().filter(function (e) { return e.psn > 0; });
    for (var i = 0; i < ps.length; i++) { if (s.over) break; this.emit({ t: 'poison', u: ps[i].u }); await this.damageEnemy(ps[i], ps[i].psn, { poison: true, ignoreBlock: true }); }
    if (this.checkEnd()) return;
  }
  for (var a = 0; a < pcs.length; a++) {
    var pc = pcs[a];
    // Lightning orbs
    for (var o = 0; o < pc.orbs.length; o++) if (pc.orbs[o] === 'lightning' && !s.over) await this.orbEnd(pc, o);
    for (var p = 0; p < pc.pow.length; p++) {
      var inst = pc.pow[p], d = STS.CARDS[inst.id];
      if (d.pw && d.pw.endTurnDmg && !s.over) await d.pw.endTurnDmg(this, pc, inst);
    }
    await this.g.relicHook(this, pc, 'endTurnDmg');
    if (this.checkEnd()) return;
  }
  // 2. Ethereal (Dark Embrace draws during this step ignore end-of-turn effects).
  for (var b = 0; b < pcs.length; b++) {
    var pe = pcs[b];
    var eth = pe.hand.filter(function (c) { return self.isEthereal(c) && !c.de; });
    for (var q = 0; q < eth.length; q++) if (pe.hand.indexOf(eth[q]) >= 0) await this.exhaustCard(pe, eth[q], { ethereal: true });
  }
  // 3. Shame, Orichalcum, then Block gains.
  for (var c1 = 0; c1 < pcs.length; c1++) {
    var pb = pcs[c1];
    pb.hand.filter(function (c) { return c.id === 'Shame' && !c.de; }).forEach(function () { pb.blk = Math.max(0, pb.blk - 1); });
    await this.g.relicHook(this, pb, 'endTurnFirst');
    for (var fo = 0; fo < pb.orbs.length; fo++) if (pb.orbs[fo] === 'frost') await this.orbEnd(pb, fo);
    for (var p2 = 0; p2 < pb.pow.length; p2++) {
      var inst2 = pb.pow[p2], d2 = STS.CARDS[inst2.id];
      if (d2.pw && d2.pw.endTurn) await d2.pw.endTurn(this, pb, inst2);
      if (s.over) return;
    }
    await this.g.relicHook(this, pb, 'endTurn');
    // Retained-card end effects (Well-Laid Plans / Equilibrium choose cards to retain)
    if (this.checkEnd()) return;
  }
  // 4. Damage to players: Wrath, Burn, Decay, Pain, Doubt, Beat of Death.
  for (var c2 = 0; c2 < pcs.length; c2++) {
    var pd = pcs[c2];
    if (pd.dead) continue;
    var handNow = pd.hand.filter(function (c) { return !c.de; });
    for (var h = 0; h < handNow.length; h++) {
      var hc = handNow[h];
      if (hc.id === 'Burn') await this.damagePlayer(pd, hc.up ? 2 : 1, { status: true });
      if (hc.id === 'Decay') await this.damagePlayer(pd, 1, { curse: true });
      if (hc.id === 'Doubt') this.weakPlayer(pd, 1);
      if (hc.id === 'Pain' && pd.hand.length <= 2) await this.loseHp(pd, 1);
      if (pd.dead) break;
    }
    if (pd.stance === 'wrath' && !pd.dead) await this.damagePlayer(pd, 1, { wrath: true });
    if (this.checkEnd()) return;
  }
  for (var ei = 0; ei < s.enemies.length; ei++) { var e = s.enemies[ei], m = this.mdef(e); if (!e.dead && m.playerEndTurn) await m.playerEndTurn(this, e); if (this.checkEnd()) return; }
  // 5. Temporary Strength wears off; choose cards to retain; discard hand.
  for (var c3 = 0; c3 < pcs.length; c3++) {
    var pf = pcs[c3];
    if (pf.strLossEnd) { pf.str = Math.max(0, pf.str - pf.strLossEnd); pf.strLossEnd = 0; }
    if (pf.capHp === 'turn') { pf.capHp = null; pf.capHpLost = 0; }
    await this.chooseRetain(pf);
    var keep = pf.hand.filter(function (c) { return self.isRetained(pf, c) || c.de; });
    var drop = pf.hand.filter(function (c) { return keep.indexOf(c) < 0; });
    keep.forEach(function (c) {
      delete c.cm; delete c.est;
      if (!c.de && self.powCount(pf, 'Establishment')) c.est = self.powSum(pf, 'Establishment', function (p) { return p.up ? 2 : 1; });
      delete c.de; c.retained = true;
    });
    drop.forEach(function (c) { delete c.retained; });
    await this.discardCards(pf, drop, false);
    pf.hand = keep;
    if (this.has(pf, 'IceCream') && pf.en > 0) pf.iceCream = pf.en;
  }
};
C.isEthereal = function (c) {
  var d = cdef(c);
  var e = d.eth;
  if (Array.isArray(e)) e = e[c.up ? 1 : 0];
  return !!e;
};
C.isRetained = function (pc, c) {
  var d = cdef(c);
  if (c.rt) return true;
  var r = d.ret;
  if (Array.isArray(r)) r = r[c.up ? 1 : 0];
  return !!r;
};
C.chooseRetain = async function (pc) {
  var n = 0;
  for (var i = 0; i < pc.pow.length; i++) if (pc.pow[i].id === 'WellLaidPlans') n += pc.pow[i].up ? 2 : 1;
  n += pc.t.retainN || 0;
  if (pc.t.retainAll) { pc.hand.forEach(function (c) { c.rt = true; }); return; }
  if (n <= 0) return;
  var self = this;
  var cands = pc.hand.filter(function (c) { return !self.isRetained(pc, c); });
  if (!cands.length) return;
  var cs = await this.pickCards(pc, 'hand', 0, n, '保留するカードを選択（最大' + n + '枚）', function (c) { return !self.isRetained(pc, c); });
  cs.forEach(function (c) { c.rt = true; });
};

/* ------------------------------------------------------------------ enemy turn */
C.enemyTurn = async function () {
  var s = this.s, self = this;
  s.phase = 'enemy';
  this.emit({ t: 'enemyTurn' });
  // Record whether bosses start this turn with Block (Guardian Mode Shift), then remove enemy Block.
  this.alive().forEach(function (e) {
    e.x.startBlk = e.blk;
    var m = self.mdef(e);
    if (!(m.barricade)) e.blk = 0;
  });
  var order = this.actionOrder();
  for (var i = 0; i < order.length; i++) {
    var e = order[i];
    if (e.dead || e.fled || s.over) continue;
    await this.enemyAct(e);
    if (this.checkEnd()) return;
  }
  // Move cubes
  this.s.enemies.forEach(function (e) { if (!e.dead && !e.fled) self.advance(e); });
  this.pcs().forEach(function (pc) { if (pc.capHp === 'round') { pc.capHp = null; pc.capHpLost = 0; } });
  this.alive().forEach(function (e) { if (e.x.intangible) e.x.intangible = false; });
};
C.actionOrder = function () {
  var self = this, al = this.alive();
  var normal = [], last = [], bosses = [];
  al.sort(function (a, b) {
    var ra = a.row < 0 ? 99 : a.row, rb = b.row < 0 ? 99 : b.row;
    if (ra !== rb) return ra - rb;
    return a.pos - b.pos;
  });
  al.forEach(function (e) {
    if (e.row === -1) { bosses.push(e); return; }
    var a = self.currentAction(e);
    var m = self.mdef(e);
    if ((a && a.last) || (m.actsLast && m.actsLast(self, e))) last.push(e); else normal.push(e);
  });
  return normal.concat(last, bosses);
};
/* Which action will this enemy take this round? */
C.currentAction = function (e) {
  var m = this.mdef(e);
  if (m.action) return m.action(this, e);
  var acts = m.acts;
  if (typeof acts === 'function') acts = acts(this, e);
  if (m.type === 'single') return acts[0];
  if (m.type === 'die') {
    var beh = e.beh || m.beh, die = this.s.die || 1;
    var ch;
    if (beh.length === 3) ch = beh[Math.floor((die - 1) / 2)];
    else if (beh.length === 2) ch = beh[die <= 3 ? 0 : 1];
    else if (beh.length === 6) ch = beh[die - 1];
    else ch = beh[0];
    return acts[ch];
  }
  if (m.type === 'cube') {
    var tr = typeof m.track === 'function' ? m.track(this, e) : m.track;
    return tr[e.cube] || null;
  }
  return null;
};
C.advance = function (e) {
  var m = this.mdef(e);
  if (m.advance) return m.advance(this, e);
  if (m.type !== 'cube') return;
  var tr = typeof m.track === 'function' ? m.track(this, e) : m.track;
  var loop = typeof m.loop === 'function' ? m.loop(this, e) : (m.loop || 0);
  e.cube++;
  if (e.cube >= tr.length) e.cube = loop;
};
C.targetsOf = function (e, aoe) {
  var self = this;
  var all = this.pcs().filter(function (pc) { return !pc.dead; });
  if (aoe || e.row === -1) return all;
  var p = this.pcInRow(e.row);
  return p && !p.dead ? [p] : [];
};
C.enemyAct = async function (e) {
  var a = this.currentAction(e);
  e.lastAct = a ? a.name : null;
  this.emit({ t: 'eact', u: e.u, name: a ? a.name : '' });
  if (!a) return;
  var ctx = { attacked: false, hitPlayers: [] };
  for (var i = 0; i < a.fx.length; i++) {
    if (e.dead || e.fled || this.s.over) break;
    await this.enemyFx(e, a, a.fx[i], ctx);
  }
  if (ctx.attacked) {
    if (e.weak > 0) e.weak--;
    ctx.hitPlayers.forEach(function (pc) { if (pc.vuln > 0) pc.vuln--; });
  }
  var m = this.mdef(e);
  if (m.afterAct && !e.dead) await m.afterAct(this, e, a, ctx);
};
C.enemyFx = async function (e, a, fx, ctx) {
  var kind = fx[0], m = this.mdef(e), self = this;
  var aoeAll = a.aoe;
  var tg = function (forceAll) { return self.targetsOf(e, forceAll || aoeAll); };
  switch (kind) {
    case 'hit': case 'ahit': {
      var ts = tg(kind === 'ahit');
      var times = fx[2] || 1;
      for (var h = 0; h < times; h++) {
        for (var i = 0; i < ts.length; i++) {
          var pc = ts[i];
          if (pc.dead || e.dead || this.s.over) continue;
          await this.enemyHit(e, pc, fx[1], ctx);
        }
      }
      ctx.attacked = true;
      return;
    }
    case 'blk': e.blk += fx[1]; this.emit({ t: 'eblk', u: e.u, n: fx[1] }); return;
    case 'blkPer': e.blk += fx[1] * this.n(); this.emit({ t: 'eblk', u: e.u }); return;
    case 'str': this.enemyStr(e, fx[1]); return;
    case 'strAll': this.alive().forEach(function (x) { self.enemyStr(x, fx[1]); }); return;
    case 'blkAll': this.alive().forEach(function (x) { x.blk += fx[1]; }); return;
    case 'healAll': this.alive().forEach(function (x) { x.hp = Math.min(x.max, x.hp + fx[1]); }); this.emit({ t: 'eheal' }); return;
    case 'weak': case 'aweak': tg(kind === 'aweak').forEach(function (pc) { self.weakPlayer(pc, fx[1] || 1); }); return;
    case 'vuln': case 'avuln': tg(kind === 'avuln').forEach(function (pc) { self.vulnPlayer(pc, fx[1] || 1); }); return;
    case 'daze': case 'adaze': { var t1 = tg(kind === 'adaze'); for (var d1 = 0; d1 < t1.length; d1++) await this.addStatus(t1[d1], 'Daze', fx[1] || 1, 'drawTop'); return; }
    case 'burn': case 'aburn': { var t2 = tg(kind === 'aburn'); for (var d2 = 0; d2 < t2.length; d2++) await this.addStatus(t2[d2], 'Burn', fx[1] || 1, fx[2] || 'discard'); return; }
    case 'slime': case 'aslime': { var t3 = tg(kind === 'aslime'); for (var d3 = 0; d3 < t3.length; d3++) await this.addStatus(t3[d3], 'Slimed', fx[1] || 1, fx[2] || 'discard'); return; }
    case 'fn': return m.fns[fx[1]](this, e, a, ctx, fx);
    case 'none': return;
    default: throw new Error('unknown enemy effect ' + kind);
  }
};
C.enemyStr = function (e, n) {
  var cap = this.mdef(e).noStrCap ? 99 : CAP.str;
  e.str = clamp(e.str + n, 0, cap);
  this.emit({ t: 'estr', u: e.u });
};
C.enemyHit = async function (e, pc, base, ctx) {
  var m = this.mdef(e);
  var dmg = base + e.str;
  if (m.hitBonus) dmg += m.hitBonus(this, e, pc);
  var weak = e.weak > 0, vuln = pc.vuln > 0;
  if (weak && vuln) { /* cancel */ }
  else if (weak) dmg -= 1;
  else if (vuln) dmg *= 2;
  if (vuln && ctx.hitPlayers.indexOf(pc) < 0) ctx.hitPlayers.push(pc);
  if (e.x.dealZero) dmg = 0;
  dmg = Math.max(0, dmg);
  this.emit({ t: 'ehit', u: e.u, i: pc.i, n: dmg });
  var r = await this.damagePlayer(pc, dmg, { enemy: e });
  if (m.afterHit) await m.afterHit(this, e, pc, r, ctx);
  return r;
};

/* Flame Barrier: damage enemies that intend to attack this player, once per HIT in their next action. */
C.intendsToAttack = function (e, pc) {
  var a = this.currentAction(e);
  if (!a) return 0;
  var n = 0, self = this;
  a.fx.forEach(function (fx) {
    if (fx[0] === 'hit' || fx[0] === 'ahit') {
      var ts = self.targetsOf(e, fx[0] === 'ahit' || a.aoe);
      if (ts.indexOf(pc) >= 0) n += (fx[2] || 1);
    }
  });
  return n;
};
})(typeof window !== 'undefined' ? window : globalThis);
