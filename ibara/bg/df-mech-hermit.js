/* スレイザスパイア — Downfall: the Hermit's rules (rulebook v1.47 p.6, p.7 FAQ).
   The Chamber stores up to two cards. They are not in the hand: not discarded at the end of turn, no Ethereal,
   no "while in hand" effects (Pain...). They can be played whenever a hand card could, paying all costs.
   Load: move a card from the hand into a Chamber slot; a card already in that slot is discarded.
   Dead On: bonus effects when played from the Chamber; copies of such a play are Dead On too.
   Rapid Fire: the card is played once more per Rapid Fire; copies made by Rapid Fire do not repeat it, copies from
   other effects (Attack Potion) do (FAQ: High Caliber + Attack Potion plays 4 times).
   Hermit curses: Unplayable but Loadable ("When Loaded"), can be upgraded, not stopped by Omamori, 3 Gold at the
   Merchant. At the end of combat the Chamber returns to the deck (combat uses copies of the deck). No DOM. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, CAP = D.CAP, DF = STS.DF = STS.DF || {};
var C = STS.Combat.prototype, G = STS.Game.prototype;
function remove(arr, x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }

C.chamberCards = function (pc) { return (pc.chamber || []).filter(Boolean); };
C.chooseChamberSlot = async function (pc, title) {
  var free = [];
  pc.chamber.forEach(function (c, i) { if (!c) free.push(i); });
  if (free.length) return free[0];
  if (pc.chamber.length === 1) return 0;
  var a = await this.ask(pc, { type: 'option', title: title || 'チャンバーがいっぱいです。入れ替える枠を選択（入っていたカードは捨て札へ）',
    options: pc.chamber.map(function (c, i) { return { id: String(i), label: (i + 1) + '番目：' + STS.cardName(c) + 'を捨てる', card: { id: c.id, up: !!c.up } }; }) });
  return Math.max(0, Math.min(pc.chamber.length - 1, a | 0));
};
/* Load up to n cards from the hand (o.min: how many must be chosen; o.card: that card). */
C.loadCards = async function (pc, n, o) {
  o = o || {};
  if (!pc.chamber) { if (DF.grantShard) await DF.grantShard(this, pc, 'load'); if (!pc.chamber) return []; }
  var loaded = [];
  for (var k = 0; k < n && !this.s.over; k++) {
    var cands = o.card ? [o.card].filter(function (c) { return pc.hand.indexOf(c) >= 0; }) : pc.hand.filter(function (c) { return !o.filter || o.filter(c); });
    if (!cands.length) break;
    var c = o.card || (await this.pickCards(pc, cands, k < (o.min == null ? 1 : o.min) ? 1 : 0, 1, n > 1 ? '装填するカードを選択（' + (k + 1) + '枚目／最大' + n + '枚）' : '装填するカードを選択'))[0];
    if (!c) break;
    var slot = await this.chooseChamberSlot(pc);
    var old = pc.chamber[slot];
    if (old) { pc.chamber[slot] = null; pc.disc.push(old); this.emit({ t: 'discard', i: pc.i, u: old.u, from: 'chamber' }); this.log(this.P(pc).name + '：チャンバーの' + STS.cardName(old) + 'を捨てた'); }
    this.leaveHand(pc, c);
    pc.chamber[slot] = c;
    this.emit({ t: 'load', i: pc.i, u: c.u, slot: slot, card: this.cardSnap(c) });
    this.log(this.P(pc).name + '：' + STS.cardName(c) + 'を装填した');
    loaded.push(c);
    var d = STS.cdef(c);
    if (d.onLoad) await d.onLoad(this, pc, c);
    await DF.fire('load', [this, pc, c]);
    if (o.card) break;
  }
  return loaded;
};
/* Playing from the Chamber: same checks and costs as from the hand, then Dead On. */
C.playFromChamber = async function (pc, cmd) {
  var ch = pc.chamber || [], slot = -1;
  for (var i = 0; i < ch.length; i++) if (ch[i] && ch[i].u === cmd.u) slot = i;
  if (slot < 0) throw new Error('そのカードはチャンバーにありません。');
  var c = ch[slot];
  pc.t.fromChamber = c.u;
  var why = this.canPlay(pc, c);
  if (why) { pc.t.fromChamber = null; throw new Error(why); }
  var cost = this.costOf(pc, c), x = null;
  if (cost === 'X') {
    var maxX = pc.en + pc.mir;
    x = cmd.x != null ? cmd.x : (maxX === 0 ? 0 : await this.ask(pc, { type: 'number', title: STS.cdef(c).name + '：Xの値（支払うエナジー）', min: 0, max: maxX, def: maxX }));
    x = Math.max(0, Math.min(maxX, x | 0)); this.pay(pc, x);
  } else this.pay(pc, cost);
  ch[slot] = null;
  pc.t.fromChamber = null;
  pc.t.deadOnU = c.u;
  try { await this.playCard(pc, c, { x: x, cmd: cmd, from: 'chamber', paid: cost === 'X' ? x : cost }); }
  finally { if (pc.t.deadOnU === c.u) pc.t.deadOnU = null; }
};
DF.COMMANDS.chamber = function (cb, pc, cmd) { return cb.playFromChamber(pc, cmd); };
/* Costs that are lower when Dead On (printed "Dead On: costs 0" and similar). */
var prevCost = DF.costExtra;
DF.costExtra = function (cb, pc, c, cost) {
  if (prevCost) cost = prevCost(cb, pc, c, cost);
  var d = STS.CARDS[c.id];
  if (d && d.deadOnCost != null && pc.t && pc.t.fromChamber === c.u) cost = typeof d.deadOnCost === 'function' ? d.deadOnCost(c) : d.deadOnCost;
  return cost;
};
/* Rapid Fire: one extra play per instance; the copies made by Rapid Fire never add more (see copyCount). */
DF.rapidOf = function (cb, pc, c) {
  var d = STS.CARDS[c.id], rf = d && d.rapid;
  if (typeof rf === 'function') rf = rf(c, pc, cb);
  else if (Array.isArray(rf)) rf = rf[c.up ? 1 : 0];
  // Vantage: "Your next Attack this turn gains Rapid Fire."
  if (d && d.t === 'A' && pc.t && pc.t.vantage) { rf = (rf || 0) + pc.t.vantage; pc.t.vantage = 0; }
  return rf || 0;
};
/* "Play a card in your Chamber for 0 Energy" (Fan the Hammer): a Chamber play, so Dead On applies. */
C.playChamberFree = async function (pc, c) {
  var i = (pc.chamber || []).indexOf(c);
  if (i < 0 || this.s.over) return;
  if (this.unplayable(pc, c)) return;
  pc.chamber[i] = null;
  pc.t.deadOnU = c.u;
  try { await this.playCard(pc, c, { free: true, from: 'chamber', paid: 0, x: this.baseCost(c) === 'X' ? 0 : null }); }
  finally { if (pc.t.deadOnU === c.u) pc.t.deadOnU = null; }
};

var prevCtx = DF.ctxExtra;
DF.ctxExtra = function (cb, pc, c, k) {
  if (prevCtx) prevCtx(cb, pc, c, k);
  k.load = function (n, opts) { return cb.loadCards(pc, n == null ? 1 : n, opts); };
  k.chamber = function () { return cb.chamberCards(pc); };
};
/* Unplayable curses can still be Loaded; the Chamber is not the hand at the end of turn. Base end-of-turn steps
   only look at pc.hand, so Chamber cards are never discarded, exhausted (Ethereal) or hurt you (Pain). */

/* Hermit curses from the reward deck: Omamori does not stop them (rulebook p.6). */
var _addCard = G.addCard;
G.addCard = async function (p, id, up, o) {
  var d = STS.CARDS[id];
  if (d && d.hermitCurse && this.relicOf(p, 'Omamori')) {
    var omamori = this.relicOf(p, 'Omamori'), keep = p.relics.indexOf(omamori);
    p.relics.splice(keep, 1);
    try { return await _addCard.call(this, p, id, up, o); } finally { p.relics.splice(keep, 0, omamori); }
  }
  return _addCard.call(this, p, id, up, o);
};
/* Merchant: Hermit curses cost 3 Gold, whichever reward deck they came from. */
var _price = G.cardPrice;
G.cardPrice = function (id) { var d = STS.CARDS[id]; return d && d.hermitCurse ? 3 : _price.call(this, id); };
/* Hermit curses can be upgraded, unlike other curses. */
var _upgradable = G.upgradable;
G.upgradable = function (p) {
  var base = _upgradable.call(this, p);
  p.deck.forEach(function (c) { var d = STS.CARDS[c.id]; if (d && d.hermitCurse && !c.up && base.indexOf(c) < 0) base.push(c); });
  return base;
};

/* ------------------------------------------------------------------ the Hermit's board */
STS.ABILITIES.M = { name: 'チャンバー', tx: 'チャンバー（2枠）にカードを装填できる。チャンバーのカードは手札ではなく、ターン終了時に捨てられない。手札と同じように使え（コストは通常どおり）、チャンバーから使うと「デッド-オン」の効果が加わる。' };
DF.INIT.M = function (cb, pc) { pc.chamber = [null, null]; };
})(typeof window !== 'undefined' ? window : globalThis);
