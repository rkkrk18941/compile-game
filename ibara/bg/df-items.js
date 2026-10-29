/* スレイザスパイア — Downfall: character abilities (player boards) and the Corrupted Shard.
   Rulebook v1.47: Slime Boss p.4, Hexaghost p.4, Guardian p.5, Hermit p.6, Effects from Other Characters p.7. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA, DF = STS.DF = STS.DF || {}, A = STS.ABILITIES;

/* ------------------------------------------------------------------ Slime Boss */
A.S = { name: 'ブルーザースライム', tx: '戦闘開始時、ブルーザースライム（Lv1：1ダメージ／Lv2：2ダメージ。ターン終了時にこのスライムに命令）が場に出ている。ブルーザースライムはデッキに入らず、アップグレードもできない。' };
/* "You start each combat with Bruiser Slime in play." It is not a card of the deck and never shuffled into it. */
DF.INIT.S = function (cb, pc) {
  var c = { u: cb.g.uid(), id: 'BruiserSlime', up: false, tmp: true };
  cb.placeSlime(pc, c, { bruiser: true });
};

/* Reward decks of the Downfall characters: their printed Golden Tickets (2 each in the playtest decks). The
   playtest cards carry no unlock levels, so every reward card is available from the start. */
var G = STS.Game.prototype, _build = G.buildRewardDecks;
G.buildRewardDecks = function (p) {
  _build.call(this, p);
  var cc = DF.CHAR_CARDS && DF.CHAR_CARDS[p.ch];
  if (!cc || cc.tickets == null) return;
  p.rewardDeck = p.rewardDeck.filter(function (id) { return id !== 'Ticket'; });
  for (var i = 0; i < cc.tickets; i++) p.rewardDeck.push('Ticket');
  this.shuffle(p.rewardDeck);
};
})(typeof window !== 'undefined' ? window : globalThis);
