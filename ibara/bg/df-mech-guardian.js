/* スレイザスパイア — Downfall: the Guardian's rules (rulebook v1.47 p.5, p.8).
   Modes: Attack Mode / Defense Mode, no passive effect by themselves. Mode Shift switches. Start of turn (after
   drawing): you may Mode Shift. Every combat starts in Attack Mode.
   Vigor: tokens (max 4 including the Spent zone). Spend whenever you could play a card; for the rest of the turn
   each spent Vigor gives +1 damage on every HIT of your Attacks and Skills (Attack Mode) or +1 Block on every Block
   icon of your Attacks and Skills (Defense Mode). Spent Vigor is lost at the end of the turn.
   "???" cards are Attacks in Attack Mode and Skills in Defense Mode, neither outside combat: each has two hidden
   twins ("Id~A", "Id~S") and the cards in combat carry the twin of the current Mode, so every existing rule that
   looks at the type (Weak, Corruption, Echo Form, enemy reactions...) sees the right type.
   Gems: sockets on some reward cards, filled from the Guardian's Gem deck (see df-gems.js). No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP, DF = STS.DF = STS.DF || {};
var C = STS.Combat.prototype;

/* ------------------------------------------------------------------ "???" cards */
DF.canon = function (id) { var i = String(id).indexOf('~'); return i < 0 ? id : id.slice(0, i); };
DF.variable = function (id, o) {
  // o: card definition with t: 'V'. Registers the printed card and its two typed twins.
  var CARDS = STS.CARDS;
  o.t = 'V';
  CARDS[id] = o;
  ['A', 'S'].forEach(function (t) {
    var twin = Object.assign({}, o, { id: id + '~' + t, t: t, twinOf: id, hidden: true });
    delete twin.r; twin.rr = o.r; // never in reward decks
    CARDS[id + '~' + t] = twin;
  });
  return o;
};
DF.isVariable = function (id) { var d = STS.CARDS[DF.canon(id)]; return !!(d && d.t === 'V'); };
/* Give every "???" card of this player the twin of the current Mode (cards being played keep theirs). */
DF.retype = function (cb, pc) {
  var t = pc.mode === 'defense' ? 'S' : 'A';
  function fix(c) { if (c && DF.isVariable(c.id)) c.id = DF.canon(c.id) + '~' + t; }
  ['hand', 'draw', 'disc', 'exh'].forEach(function (k) { (pc[k] || []).forEach(fix); });
  (pc.chamber || []).forEach(fix);
  (pc.attached || []).forEach(fix);
};

/* ------------------------------------------------------------------ Modes */
C.enterMode = function (pc, mode, why) {
  if (mode !== 'attack' && mode !== 'defense') return false;
  if (pc.mode === mode) return false;
  pc.mode = mode;
  DF.retype(this, pc);
  this.emit({ t: 'mode', i: pc.i, mode: mode, why: why || undefined });
  this.log(this.P(pc).name + '：' + (mode === 'attack' ? '攻撃モード' : '防御モード') + 'になった');
  return true;
};
C.modeShift = function (pc, why) { return this.enterMode(pc, pc.mode === 'defense' ? 'attack' : 'defense', why || 'モードシフト'); };
/* Corrupted Shard holders enter a Mode of their choice the first time a Mode matters in a combat. */
C.needMode = async function (pc) {
  if (pc.mode) return pc.mode;
  if (!pc.shard) return null;
  var a = await this.ask(pc, { type: 'option', title: '堕落したシャード：入るモードを選択', options: [{ id: 'attack', label: '攻撃モード' }, { id: 'defense', label: '防御モード' }] });
  pc.mode = a === 'defense' ? 'defense' : 'attack';
  DF.retype(this, pc);
  this.emit({ t: 'mode', i: pc.i, mode: pc.mode });
  return pc.mode;
};

/* ------------------------------------------------------------------ Vigor */
C.vigorRoom = function (pc) { return Math.max(0, CAP.vigor - (pc.vigor || 0) - (pc.vigorSpent || 0)); };
C.gainVigor = async function (pc, n) {
  if (pc.vigor == null) { if (DF.grantShard) await DF.grantShard(this, pc, 'vigor'); if (pc.vigor == null) return 0; }
  var got = Math.min(this.vigorRoom(pc), n);
  pc.vigor += got;
  if (got) this.emit({ t: 'vigor', i: pc.i, n: got });
  return got;
};
C.spendVigor = async function (pc) {
  if (!(pc.vigor > 0)) throw new Error('活力がありません。');
  if (pc.limbo && pc.limbo.length) throw new Error('カードの処理中は使えません。');
  pc.vigor--; pc.vigorSpent = (pc.vigorSpent || 0) + 1;
  await this.needMode(pc);
  this.emit({ t: 'vigorSpend', i: pc.i, n: pc.vigorSpent });
  this.log(this.P(pc).name + '：活力を使った（このターン、' + (pc.mode === 'defense' ? '防御モードならブロック' : '攻撃モードならヒット') + '+' + pc.vigorSpent + '）');
};
DF.COMMANDS.vigor = function (cb, pc) { return cb.spendVigor(pc); };
DF.vigorApplies = function (cb, pc, c) {
  if (!pc.vigorSpent || !c || !STS.CARDS[c.id]) return false;
  var t = STS.CARDS[c.id].t;
  return t === 'A' || t === 'S';
};

/* Bonuses: +HIT in Attack Mode, +Block in Defense Mode, per spent Vigor, on Attacks and Skills. */
var prevHitExtra = DF.hitBonusExtra;
DF.hitBonusExtra = function (cb, pc, opts) {
  var b = prevHitExtra ? prevHitExtra(cb, pc, opts) || 0 : 0;
  if (pc.mode === 'attack' && !opts.gemPower && DF.vigorApplies(cb, pc, opts.card)) b += pc.vigorSpent;
  return b;
};
var prevCtx = DF.ctxExtra;
DF.ctxExtra = function (cb, pc, c, k) {
  if (prevCtx) prevCtx(cb, pc, c, k);
  var blk0 = k.blk;
  k.blk = function (n, to) { return blk0(n + (pc.mode === 'defense' && DF.vigorApplies(cb, pc, c) ? pc.vigorSpent : 0), to); };
  k.vigor = function (n) { return cb.gainVigor(pc, n == null ? 1 : n); };
  k.mode = function () { return pc.mode; };
  k.inMode = async function (m) { await cb.needMode(pc); return pc.mode === m; };
  k.shift = function () { return cb.modeShift(pc, STS.cdef(c).name); };
  k.enterMode = function (m) { return cb.enterMode(pc, m, STS.cdef(c).name); };
};
/* End of turn: spent Vigor is lost. */
var prevLate = DF.endTurnLate;
DF.endTurnLate = function (cb, pc) {
  if (prevLate) prevLate(cb, pc);
  if (pc.vigorSpent) { pc.vigorSpent = 0; cb.emit({ t: 'vigorSpend', i: pc.i, n: 0 }); }
};

/* The draw pile exists only after the combat setup: give the "???" cards their typed twins then. */
DF.on('afterSetup', function (cb, pc) { if (pc.mode) DF.retype(cb, pc); });
/* Corrupted Shard: playing a card that references a Mode (or a "???" card) enters a Mode first. */
var prevBefore = DF.beforePlay;
DF.beforePlay = async function (cb, pc, c, opts) {
  if (prevBefore) await prevBefore(cb, pc, c, opts);
  var d = STS.CARDS[c.id];
  if (!pc.mode && pc.shard && d && (d.refMode || d.t === 'V' || d.twinOf)) { await cb.needMode(pc); if (STS.CARDS[c.id].t === 'V') c.id = DF.canon(c.id) + '~' + (pc.mode === 'defense' ? 'S' : 'A'); }
};

/* ------------------------------------------------------------------ the Guardian's board */
STS.ABILITIES.U = { name: 'モードシフト', tx: '攻撃モードで戦闘を始める。ターン開始時（カードを引いた後）：モードシフトしてもよい。' };
DF.INIT.U = function (cb, pc) {
  pc.mode = 'attack'; pc.vigor = 0; pc.vigorSpent = 0;
  DF.retype(cb, pc);
};
DF.on('startTurn', async function (cb, pc) {
  var P = cb.P(pc);
  if (!P || P.ch !== 'U' || pc.dead || cb.s.over) return;
  var other = pc.mode === 'defense' ? '攻撃モード' : '防御モード';
  var a = await cb.ask(pc, { type: 'option', title: 'ターン開始時：モードシフトしますか？（今は' + (pc.mode === 'defense' ? '防御モード' : '攻撃モード') + '）',
    options: [{ id: 'stay', label: (pc.mode === 'defense' ? '防御モード' : '攻撃モード') + 'のまま' }, { id: 'shift', label: other + 'へモードシフト' }], modeShift: true });
  if (a === 'shift') cb.modeShift(pc, 'ターン開始時');
});
})(typeof window !== 'undefined' ? window : globalThis);
