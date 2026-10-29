/* スレイザスパイア — Downfall: the Corrupted Shard (rulebook v1.47 p.7 "Effects from Other Characters").
   Gaining a card from outside your character that lets you Load, Advance, Retract, create Soulburn or Vigor, gain a
   bonus from Heat, or enter Attack/Defense Mode gives you the Corrupted Shard (4 in the box). Each combat you then
   start with 1 Chamber slot and Heat 1; the first time each combat you use Soulburn or play a card that references a
   Guardian Mode, you enter the Mode of your choice. The Hermit, Guardian and Hexaghost keep their own Chamber,
   Modes and Heat track. Cards declare what they grant with grants: ['load', 'heat', 'soulburn', 'vigor', 'mode']. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, DF = STS.DF = STS.DF || {};
var G = STS.Game.prototype;

STS.RELICS.CorruptedShard = { id: 'CorruptedShard', type: 'special', price: 0, name: '堕落したシャード',
  tx: 'ほかのキャラクターの「装填・前進・後退・ソウルバーン・活力・ヒート・モード」を使うカードを得た時に得る。各戦闘でチャンバー1枠とヒート1を持って始める。各戦闘で最初にソウルバーンを使うか、モードを参照するカードを使う時、好きなモードに入る。' };
DF.SHARDS = 4;

DF.initShard = function (cb, pc, P) {
  var ch = P.ch;
  pc.shard = true;
  if (ch !== 'M' && !pc.chamber) pc.chamber = [null];
  if (ch !== 'H') { if (pc.heat == null) pc.heat = 1; if (pc.soul == null) pc.soul = 0; }
  if (ch !== 'U') { if (pc.vigor == null) { pc.vigor = 0; pc.vigorSpent = 0; } pc.mode = pc.mode || null; }
};
DF.cardGrants = function (id) { var d = STS.CARDS[DF.canon ? DF.canon(id) : id]; return d && d.grants ? d.grants : null; };
/* The shard is gained when the card is gained (not when it is played). */
G.grantShard = function (p) {
  if (this.relicOf(p, 'CorruptedShard')) return true;
  var d = this.run.decks;
  if (d.shards == null) d.shards = DF.SHARDS;
  if (d.shards <= 0) return false;
  d.shards--;
  p.relics.push({ id: 'CorruptedShard', n: 0 });
  this.emit({ t: 'gainRelic', i: p.i, id: 'CorruptedShard' });
  this.log(p.name + '：レリック「堕落したシャード」');
  return true;
};
var _addCard = G.addCard;
G.addCard = async function (p, id, up, o) {
  var c = await _addCard.call(this, p, id, up, o);
  var d = c && STS.CARDS[c.id];
  if (c && d && d.ch !== p.ch && D.DF_CHARS.indexOf(d.ch) >= 0 && DF.cardGrants(c.id)) this.grantShard(p);
  return c;
};
/* A mechanic needed in combat without the shard (should not happen when cards are gained normally): nothing. */
DF.grantShard = async function () { return false; };
})(typeof window !== 'undefined' ? window : globalThis);
