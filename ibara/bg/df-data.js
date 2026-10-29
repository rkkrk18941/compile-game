/* スレイザスパイア — Downfall expansion: shared data (characters, adventure modes, caps, terms).
   Source: Contention Games' official Downfall public-playtest Tabletop Simulator module (Steam Workshop 3687082014,
   saved 2026-07-23) and the Downfall rulebook v1.47 inside it. See DOWNFALL_WORKLOG.md. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA;
var DF = STS.DF = STS.DF || {};

/* The four Downfall characters. Max HP 9 for all four (player boards: HP track 1–9). A character is registered
   (selectable, boss candidate, reward decks) by its card file calling DF.addChar once its cards exist. */
DF.CHAR_DEFS = {
  S: { key: 'S', name: 'スライムボス', en: 'Slime Boss', hp: 9, color: 'slime', relic: 'SlimeBossAbility', df: true,
    deck: ['StrikeS', 'StrikeS', 'StrikeS', 'StrikeS', 'DefendS', 'DefendS', 'DefendS', 'DefendS', 'SlimeSlap', 'Lick'],
    ability: '各戦闘の開始時、ブルーザースライムが場に出ている（ターン終了時に命令する）。スライムのカードを使うと場に置かれ、「成長」でレベルが上がり、「命令」で今のレベルの能力を使う。' },
  U: { key: 'U', name: 'ガーディアン', en: 'Guardian', hp: 9, color: 'guardian', relic: 'GuardianAbility', df: true },
  H: { key: 'H', name: 'ヘクサゴースト', en: 'Hexaghost', hp: 9, color: 'hexaghost', relic: 'HexaghostAbility', df: true },
  M: { key: 'M', name: 'ハーミット', en: 'Hermit', hp: 9, color: 'hermit', relic: 'HermitAbility', df: true }
};
D.BASE_CHARS = ['R', 'G', 'B', 'W'];
D.DF_CHARS = ['S', 'U', 'H', 'M'];
DF.addChar = function (key, extra) {
  var c = Object.assign({}, DF.CHAR_DEFS[key], extra || {});
  D.CHARS[key] = c;
  if (D.CHAR_ORDER.indexOf(key) < 0) D.CHAR_ORDER.push(key);
  return c;
};

/* Adventures chosen on the character screen. Independent of the difficulty (beginner / normal / Ascension). */
D.ADVENTURES = {
  normal: { name: '通常の冒険', short: '通常', desc: '基本版のマップ・敵・イベントで塔を登ります。第4幕の最終ボスは堕落の心臓です。追加のキャラクターも使えます。' },
  downfall: { name: 'Downfallの冒険', short: 'Downfall', desc: '通常の冒険に慣れた方向け。ハートの恩恵で始まり、第1〜3幕のボスには今回の冒険で選ばれなかったキャラクターが現れます。第4幕の最終ボスはネオーです。' }
};
D.ADV_ORDER = ['normal', 'downfall'];
/* Saves made before the adventure choice existed are normal adventures. */
DF.adventureOf = function (run) { return run && run.adv === 'downfall' ? 'downfall' : 'normal'; };

/* Caps of the new tokens and tracks. */
D.CAP.vigor = 4; D.CAP.soulburn = 6; D.CAP.heatMin = 1; D.CAP.heatMax = 6; D.CAP.slimeStr = 8; D.CAP.chamber = 2;
})(typeof window !== 'undefined' ? window : globalThis);
