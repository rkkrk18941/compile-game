/* スレイザスパイア — Downfall: The Hermit (86 printed cards). Transcribed from the card faces of the official
   Downfall public-playtest TTS module (2026-07-23): decks 3a0392/dcdd4a (starter), 6355da/9a4007 (rewards),
   2b8379/c16bb3 (rares), base and upgraded faces in deck order.
   STATUS: starter (11) and reward cards 00–28 are transcribed; reward cards 29–61 and the 16 rares are not yet,
   so the Hermit is not registered (DF.addChar) until they are. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var CARDS = STS.CARDS;
var DF = STS.DF = STS.DF || {};
function card(id, o) { o.id = id; if (o.cu === undefined) o.cu = o.c; o.ch = o.ch || 'M'; o.df = true; CARDS[id] = o; return o; }
function U(k, a, b) { return k.up ? b : a; }
function curseInChamber(k) { return k.cb.chamberCards(k.pc).some(function (c) { return STS.cdef(c).t === 'C'; }); }
function attacksInChamber(pc) { return (pc.chamber || []).filter(function (c) { return c && STS.cdef(c).t === 'A'; }).length; }

/* ---------------------------------------------------------------- starter */
card('Covet', { t: 'S', r: 'S', c: 0, ret: true, grants: ['load'], name: '渇望', en: 'Covet', tx: ['保留。カードを1枚装填する。', '保留。カードを2枚まで装填する。'],
  play: function (k) { return k.load(U(k, 1, 2), { min: 1 }); } });
card('StrikeM', { t: 'A', r: 'S', c: 1, name: 'ストライク', en: 'Strike', tg: 'E', tx: ['1ダメージ。', '2ダメージ。'], play: function (k) { return k.atk([U(k, 1, 2)]); } });
card('DefendM', { t: 'S', r: 'S', c: 1, name: '防御', en: 'Defend', tx: ['ブロック1。', '任意のプレイヤーにブロック2。'],
  play: async function (k) { var ap = k.cb.powSum(k.pc, 'Apotheosis', function () { return 1; }); if (!k.up) await k.blk(1 + ap); else { var to = await k.playerSel('ブロックを与えるプレイヤーを選択'); await k.blk(2 + ap, to); } } });
/* FAQ p.7: Block equal to the card's damage, whatever the enemy's Block and HP. */
card('Snapshot', { t: 'A', r: 'S', c: 2, name: 'スナップショット', en: 'Snapshot', tg: 'E', tx: ['2ダメージ。デッド-オン：与えたダメージと同じだけブロックを得る。', '3ダメージ。デッド-オン：与えたダメージと同じだけブロックを得る。'],
  play: async function (k) { var r = await k.atk([U(k, 2, 3)]); if (k.deadOn && r && r.dealt) await k.blk(r.dealt); } });

/* ---------------------------------------------------------------- rewards 00–28 */
card('Vantage', { t: 'S', r: 'U', c: 1, ex: [true, false], grants: ['load'], name: '優位', en: 'Vantage', tx: ['カードを1枚装填する。このターン次に使うアタックは連射を得る。廃棄。', 'カードを1枚装填する。このターン次に使うアタックは連射を得る。'],
  play: async function (k) { await k.load(1, { min: 1 }); k.pc.t.vantage = (k.pc.t.vantage || 0) + 1; } });
card('FlashPowder', { t: 'S', r: 'U', c: 2, tg: 'E', rapid: 1, name: '閃光粉', en: 'Flash Powder', tx: ['ブロック1。脱力1。連射。', 'ブロック2。脱力1。連射。'],
  play: async function (k) { await k.blk(U(k, 1, 2)); await k.weak(k.target, 1); } });
card('HeroicBravado', { t: 'S', r: 'U', c: 3, cu: 2, ex: true, name: '英雄の虚勢', en: 'Heroic Bravado', tx: ['筋力1を得る。チャンバーのアタック1枚につきコスト−1。廃棄。', '筋力1を得る。チャンバーのアタック1枚につきコスト−1。廃棄。'],
  costFn: function (cb, pc, c, cost) { return cost - attacksInChamber(pc); },
  play: function (k) { k.str(1); } });
card('PistolWhip', { t: 'A', r: 'C', c: 1, tg: 'E', grants: ['load'], name: '銃床打ち', en: 'Pistol Whip', tx: ['2ダメージ。デッド-オン：1エナジーを得て、カードを1枚装填する。', '3ダメージ。デッド-オン：1エナジーを得て、カードを1枚装填する。'],
  play: async function (k) { await k.atk([U(k, 2, 3)]); if (k.deadOn) { k.energy(1); await k.load(1, { min: 1 }); } } });
card('Misfire', { t: 'A', r: 'C', c: 0, tg: 'R', name: '暴発', en: 'Misfire', tx: ['範囲に1ダメージ。チャンバーに呪いがあれば+1ダメージ。', '範囲に2ダメージ。チャンバーに呪いがあれば+1ダメージ。'],
  play: function (k) { return k.aoe([U(k, 1, 2) + (curseInChamber(k) ? 1 : 0)]); } });
card('Quickdraw', { t: 'A', r: 'C', c: 1, tg: 'E', grants: ['load'], name: '早撃ち', en: 'Quickdraw', tx: ['1ダメージ。カードを1枚引く。カードを1枚装填する。', '1ダメージ。カードを2枚引く。カードを1枚装填する。'],
  play: async function (k) { await k.atk([1]); await k.draw(U(k, 1, 2)); await k.load(1, { min: 1 }); } });
card('TrackingShots', { t: 'A', r: 'C', c: 2, tg: 'E', grants: ['load'], name: '追尾射撃', en: 'Tracking Shots', tx: ['3ダメージ。手札から使った場合、このカードを装填してもよい。', '4ダメージ。手札から使った場合、このカードを装填してもよい。'],
  play: async function (k) {
    await k.atk([U(k, 3, 4)]);
    if (!k.fromHand || k.copy) return;
    var cb = k.cb, pc = k.pc, c = k.card;
    k.later(async function () {
      if (!pc.chamber || pc.limbo.indexOf(c) >= 0) return;
      var at = pc.disc.indexOf(c); if (at < 0) return;
      var ok = await cb.ask(pc, { type: 'confirm', title: '追尾射撃：このカードを装填しますか？', yes: '装填する', no: 'しない' });
      if (!ok) return;
      pc.disc.splice(pc.disc.indexOf(c), 1); pc.hand.push(c);
      await cb.loadCards(pc, 1, { card: c });
    });
  } });
card('HighCaliber', { t: 'A', r: 'C', c: 2, tg: 'E', rapid: 1, name: '大口径', en: 'High-Caliber', tx: ['1ダメージ。ブロック1。連射。', '2ダメージ。ブロック1。連射。'],
  play: async function (k) { await k.atk([U(k, 1, 2)]); await k.blk(1); } });
card('Headshot', { t: 'A', r: 'C', c: 2, name: 'ヘッドショット', en: 'Headshot', tg: function (k) { return k.deadOn ? 'E' : null; }, tx: ['デッド-オン：5ダメージ。', 'デッド-オン：7ダメージ。'],
  play: function (k) { return k.deadOn ? k.atk([U(k, 5, 7)]) : null; } });
card('ItchyTrigger', { t: 'A', r: 'C', c: 1, tg: 'E', rapid: [1, 2], name: 'せっかちな引き金', en: 'Itchy Trigger', tx: ['1ダメージ。連射。', '1ダメージ。連射。連射。'],
  play: function (k) { return k.atk([1]); } });
card('FanTheHammer', { t: 'A', r: 'C', c: 1, tg: 'E', ex: true, name: 'ファニング', en: 'Fan the Hammer', tx: ['2ダメージ。チャンバーのカード1枚を0エナジーで使う。廃棄。', '4ダメージ。チャンバーのカード1枚を0エナジーで使う。廃棄。'],
  play: async function (k) {
    await k.atk([U(k, 2, 4)]);
    var cb = k.cb, pc = k.pc;
    var cands = cb.chamberCards(pc).filter(function (c) { return !cb.unplayable(pc, c); });
    if (!cands.length) return;
    var pick = cands.length === 1 ? cands[0] : (await cb.pickCards(pc, cands, 1, 1, 'ファニング：0エナジーで使うチャンバーのカードを選択'))[0];
    if (pick) k.later(function () { return cb.playChamberFree(pc, pick); });
  } });
card('Dive', { t: 'S', r: 'C', c: 1, name: '飛び込み', en: 'Dive', tx: ['ブロック2。チャンバーに呪いがあれば+ブロック1。', 'ブロック3。チャンバーに呪いがあれば+ブロック1。'],
  play: function (k) { return k.blk(U(k, 2, 3) + (curseInChamber(k) ? 1 : 0)); } });
card('Feint', { t: 'S', r: 'C', c: 1, grants: ['load'], name: 'フェイント', en: 'Feint', tx: ['カードを2枚引く。カードを1枚装填する。', 'カードを3枚引く。カードを1枚装填する。'],
  play: async function (k) { await k.draw(U(k, 2, 3)); await k.load(1, { min: 1 }); } });
card('TakeCover', { t: 'S', r: 'C', c: 1, name: '物陰に隠れる', en: 'Take Cover', tx: ['ブロック1。筋力1を得る。ターン終了時にその筋力を失う。', 'ブロック2。筋力1を得る。ターン終了時にその筋力を失う。'],
  play: async function (k) { await k.blk(U(k, 1, 2)); k.cb.tempStr(k.pc, 1); } });
card('BodyArmor', { t: 'S', r: 'C', c: 1, deadOnCost: 0, name: 'ボディアーマー', en: 'Body Armor', tx: ['ブロック2。デッド-オン：コスト0。', 'ブロック3。デッド-オン：コスト0。'],
  play: function (k) { return k.blk(U(k, 2, 3)); } });
card('LowProfile', { t: 'S', r: 'C', c: 0, ex: [true, false], grants: ['load'], name: '身を潜める', en: 'Low Profile', tx: ['ブロック1。カードを1枚装填する。廃棄。', 'ブロック1。カードを1枚装填する。'],
  play: async function (k) { await k.blk(1); await k.load(1, { min: 1 }); } });

DF.CHAR_CARDS = DF.CHAR_CARDS || {};
DF.CHAR_CARDS.M = { partial: true }; // Completed by df-cards-hermit-rest.js
DF.CHAR_DEFS.M.deck = ['Covet', 'StrikeM', 'StrikeM', 'StrikeM', 'StrikeM', 'StrikeM', 'Snapshot', 'DefendM', 'DefendM', 'DefendM', 'DefendM'];
DF.CHAR_DEFS.M.ability = 'チャンバー（2枠）にカードを装填できる。チャンバーのカードは手札ではなく、ターン終了時に捨てられない。手札と同じように使え（コストは通常どおり）、チャンバーから使うとデッド-オンの効果が加わる。';
})(typeof window !== 'undefined' ? window : globalThis);
