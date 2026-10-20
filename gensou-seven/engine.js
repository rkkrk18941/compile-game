/* ファンタジーレルムズ — rules engine (no DOM; runs in pages, workers and Node).
   The 53 cards, hand scoring in the official resolution order, the search for each hand's best legal choices,
   and the game flow: the basic game for 3–6 players and the official two-player variant.
   The rules and their sources are written down in RULES.md next to this file. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GS_ENGINE = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ================================================================== suits */
  var SUITS = ['land', 'flood', 'weather', 'flame', 'army', 'wizard', 'leader', 'beast', 'weapon', 'artifact'];
  var ALL_SUITS = SUITS.concat(['wild']);
  var SUIT_JA = { land: '大地', flood: '洪水', weather: '天候', flame: '炎', army: '軍隊', wizard: '魔術師', leader: '指導者', beast: '獣', weapon: '武器', artifact: '秘宝', wild: 'ワイルド' };
  var SUIT_EN = { land: 'Land', flood: 'Flood', weather: 'Weather', flame: 'Flame', army: 'Army', wizard: 'Wizard', leader: 'Leader', beast: 'Beast', weapon: 'Weapon', artifact: 'Artifact', wild: 'Wild' };
  var MIRAGE_SUITS = ['army', 'land', 'weather', 'flood', 'flame'];
  var SHAPESHIFTER_SUITS = ['artifact', 'leader', 'wizard', 'weapon', 'beast'];
  var NECROMANCER_SUITS = ['army', 'leader', 'wizard', 'beast'];

  /* ================================================================== the cards
     n = card number (the order of the rulebook's suits), en = English card name (used as the card's name in rules),
     b = bonus text, p = penalty text (Japanese, written for this app). */
  var CARDS = [
    { n: 1, key: 'mountain', en: 'Mountain', ja: '山脈', suit: 'land', str: 9,
      b: ['「煙」と「野火」の両方があれば +50。', 'すべての洪水のペナルティを解除する。'] },
    { n: 2, key: 'cavern', en: 'Cavern', ja: '洞窟', suit: 'land', str: 6,
      b: ['「ドワーフの歩兵」か「ドラゴン」があれば +25。', 'すべての天候のペナルティを解除する。'] },
    { n: 3, key: 'bellTower', en: 'Bell Tower', ja: '鐘楼', suit: 'land', str: 8,
      b: ['魔術師が1枚でもあれば +15。'] },
    { n: 4, key: 'forest', en: 'Forest', ja: '森', suit: 'land', str: 7,
      b: ['獣1枚ごとに +12、「エルフの射手」1枚ごとに +12。'] },
    { n: 5, key: 'earthElemental', en: 'Earth Elemental', ja: '大地の精霊', suit: 'land', str: 4,
      b: ['ほかの大地1枚ごとに +15。'] },

    { n: 6, key: 'fountainOfLife', en: 'Fountain of Life', ja: '生命の泉', suit: 'flood', str: 1,
      b: ['手札の武器・洪水・炎・大地・天候から1枚を選び、その基本値を加える。'] },
    { n: 7, key: 'swamp', en: 'Swamp', ja: '沼地', suit: 'flood', str: 18,
      p: ['軍隊と炎1枚ごとに −3。'] },
    { n: 8, key: 'greatFlood', en: 'Great Flood', ja: '大洪水', suit: 'flood', str: 32,
      p: ['すべての軍隊、「山脈」以外のすべての大地、「稲妻」以外のすべての炎を無効化する。'] },
    { n: 9, key: 'island', en: 'Island', ja: '島', suit: 'flood', str: 14,
      b: ['洪水か炎1枚のペナルティを解除する。'] },
    { n: 10, key: 'waterElemental', en: 'Water Elemental', ja: '水の精霊', suit: 'flood', str: 4,
      b: ['ほかの洪水1枚ごとに +15。'] },

    { n: 11, key: 'rainstorm', en: 'Rainstorm', ja: '暴風雨', suit: 'weather', str: 8,
      b: ['洪水1枚ごとに +10。'], p: ['「稲妻」以外のすべての炎を無効化する。'] },
    { n: 12, key: 'blizzard', en: 'Blizzard', ja: '吹雪', suit: 'weather', str: 30,
      p: ['すべての洪水を無効化する。', '軍隊・指導者・獣・炎1枚ごとに −5。'] },
    { n: 13, key: 'smoke', en: 'Smoke', ja: '煙', suit: 'weather', str: 27,
      p: ['炎が1枚もなければ、このカードは無効化される。'] },
    { n: 14, key: 'whirlwind', en: 'Whirlwind', ja: '旋風', suit: 'weather', str: 13,
      b: ['「暴風雨」があり、さらに「吹雪」か「大洪水」があれば +40。'] },
    { n: 15, key: 'airElemental', en: 'Air Elemental', ja: '風の精霊', suit: 'weather', str: 4,
      b: ['ほかの天候1枚ごとに +15。'] },

    { n: 16, key: 'wildfire', en: 'Wildfire', ja: '野火', suit: 'flame', str: 40,
      p: ['炎・魔術師・天候・武器・秘宝と、「山脈」「大洪水」「島」「ユニコーン」「ドラゴン」を除く、すべてのカードを無効化する。'] },
    { n: 17, key: 'candle', en: 'Candle', ja: 'ろうそく', suit: 'flame', str: 2,
      b: ['「変化の書」と「鐘楼」と魔術師がそろえば +100。'] },
    { n: 18, key: 'forge', en: 'Forge', ja: '鍛冶場', suit: 'flame', str: 9,
      b: ['武器と秘宝1枚ごとに +9。'] },
    { n: 19, key: 'lightning', en: 'Lightning', ja: '稲妻', suit: 'flame', str: 11,
      b: ['「暴風雨」があれば +30。'] },
    { n: 20, key: 'fireElemental', en: 'Fire Elemental', ja: '炎の精霊', suit: 'flame', str: 4,
      b: ['ほかの炎1枚ごとに +15。'] },

    { n: 21, key: 'knights', en: 'Knights', ja: '騎士団', suit: 'army', str: 20,
      p: ['指導者が1枚もなければ −8。'] },
    { n: 22, key: 'elvenArchers', en: 'Elven Archers', ja: 'エルフの射手', suit: 'army', str: 10,
      b: ['天候が1枚もなければ +5。'] },
    { n: 23, key: 'lightCavalry', en: 'Light Cavalry', ja: '軽騎兵', suit: 'army', str: 17,
      p: ['大地1枚ごとに −2。'] },
    { n: 24, key: 'dwarvishInfantry', en: 'Dwarvish Infantry', ja: 'ドワーフの歩兵', suit: 'army', str: 15,
      p: ['ほかの軍隊1枚ごとに −2。'] },
    { n: 25, key: 'rangers', en: 'Rangers', ja: 'レンジャー', suit: 'army', str: 5,
      b: ['大地1枚ごとに +10。', 'すべてのペナルティから「軍隊」の語を解除する。'] },

    { n: 26, key: 'collector', en: 'Collector', ja: '収集家', suit: 'wizard', str: 7,
      b: ['同じスートで名前の異なるカードが3枚なら +10、4枚なら +40、5枚なら +100。'] },
    { n: 27, key: 'beastmaster', en: 'Beastmaster', ja: '獣使い', suit: 'wizard', str: 9,
      b: ['獣1枚ごとに +9。', 'すべての獣のペナルティを解除する。'] },
    { n: 28, key: 'necromancer', en: 'Necromancer', ja: '死霊術師', suit: 'wizard', str: 3,
      b: ['ゲーム終了時、捨て場から軍隊・指導者・魔術師・獣を1枚取り、8枚目の手札にしてよい。'] },
    { n: 29, key: 'warlockLord', en: 'Warlock Lord', ja: '妖術王', suit: 'wizard', str: 25,
      p: ['指導者とほかの魔術師1枚ごとに −10。'] },
    { n: 30, key: 'enchantress', en: 'Enchantress', ja: '魔女', suit: 'wizard', str: 5,
      b: ['大地・天候・洪水・炎1枚ごとに +5。'] },

    { n: 31, key: 'king', en: 'King', ja: '国王', suit: 'leader', str: 8,
      b: ['軍隊1枚ごとに +5。', '「女王」がいれば代わりに、軍隊1枚ごとに +20。'] },
    { n: 32, key: 'queen', en: 'Queen', ja: '女王', suit: 'leader', str: 6,
      b: ['軍隊1枚ごとに +5。', '「国王」がいれば代わりに、軍隊1枚ごとに +20。'] },
    { n: 33, key: 'princess', en: 'Princess', ja: '王女', suit: 'leader', str: 2,
      b: ['軍隊・魔術師・ほかの指導者1枚ごとに +8。'] },
    { n: 34, key: 'warlord', en: 'Warlord', ja: '将軍', suit: 'leader', str: 4,
      b: ['すべての軍隊の基本値の合計を加える。'] },
    { n: 35, key: 'empress', en: 'Empress', ja: '女帝', suit: 'leader', str: 15,
      b: ['軍隊1枚ごとに +10。'], p: ['ほかの指導者1枚ごとに −5。'] },

    { n: 36, key: 'unicorn', en: 'Unicorn', ja: 'ユニコーン', suit: 'beast', str: 9,
      b: ['「王女」がいれば +30。', 'いなければ、「女帝」「女王」「魔女」のどれかがいれば +15。'] },
    { n: 37, key: 'basilisk', en: 'Basilisk', ja: 'バジリスク', suit: 'beast', str: 35,
      p: ['すべての軍隊と指導者、ほかのすべての獣を無効化する。'] },
    { n: 38, key: 'warhorse', en: 'Warhorse', ja: '軍馬', suit: 'beast', str: 6,
      b: ['指導者か魔術師が1枚でもあれば +14。'] },
    { n: 39, key: 'dragon', en: 'Dragon', ja: 'ドラゴン', suit: 'beast', str: 30,
      p: ['魔術師が1枚もなければ −40。'] },
    { n: 40, key: 'hydra', en: 'Hydra', ja: 'ヒュドラ', suit: 'beast', str: 12,
      b: ['「沼地」があれば +28。'] },

    { n: 41, key: 'warship', en: 'Warship', ja: '軍艦', suit: 'weapon', str: 23,
      b: ['すべての洪水のペナルティから「軍隊」の語を解除する。'], p: ['洪水が1枚もなければ、このカードは無効化される。'] },
    { n: 42, key: 'magicWand', en: 'Magic Wand', ja: '魔法の杖', suit: 'weapon', str: 1,
      b: ['魔術師が1枚でもあれば +25。'] },
    { n: 43, key: 'swordOfKeth', en: 'Sword of Keth', ja: 'ケスの剣', suit: 'weapon', str: 7,
      b: ['指導者がいれば +10。', '指導者と「ケスの盾」の両方があれば代わりに +40。'] },
    { n: 44, key: 'elvenLongbow', en: 'Elven Longbow', ja: 'エルフの長弓', suit: 'weapon', str: 3,
      b: ['「エルフの射手」「将軍」「獣使い」のどれかがあれば +30。'] },
    { n: 45, key: 'warDirigible', en: 'War Dirigible', ja: '軍用飛行船', suit: 'weapon', str: 35,
      p: ['軍隊が1枚もなければ、このカードは無効化される。', '天候が1枚でもあれば、このカードは無効化される。'] },

    { n: 46, key: 'shieldOfKeth', en: 'Shield of Keth', ja: 'ケスの盾', suit: 'artifact', str: 4,
      b: ['指導者がいれば +15。', '指導者と「ケスの剣」の両方があれば代わりに +40。'] },
    { n: 47, key: 'gemOfOrder', en: 'Gem of Order', ja: '秩序の宝珠', suit: 'artifact', str: 5,
      b: ['基本値が連続する3枚で +10、4枚で +30、5枚で +60、6枚で +100、7枚で +150。'] },
    { n: 48, key: 'worldTree', en: 'World Tree', ja: '世界樹', suit: 'artifact', str: 2,
      b: ['無効化されていないカードがすべて異なるスートなら +50。'] },
    { n: 49, key: 'bookOfChanges', en: 'Book of Changes', ja: '変化の書', suit: 'artifact', str: 3,
      b: ['ほかのカード1枚のスートを変えてよい。そのカードの名前・ボーナス・ペナルティはそのまま。'] },
    { n: 50, key: 'protectionRune', en: 'Protection Rune', ja: '守護のルーン', suit: 'artifact', str: 1,
      b: ['すべてのカードのペナルティを解除する。'] },

    { n: 51, key: 'shapeshifter', en: 'Shapeshifter', ja: '変身者', suit: 'wild', str: 0,
      b: ['秘宝・指導者・魔術師・武器・獣のうち、ゲームにある好きな1枚の名前とスートになってよい。', 'そのカードのボーナス・ペナルティ・基本値は写さない。'] },
    { n: 52, key: 'mirage', en: 'Mirage', ja: '蜃気楼', suit: 'wild', str: 0,
      b: ['軍隊・大地・天候・洪水・炎のうち、ゲームにある好きな1枚の名前とスートになってよい。', 'そのカードのボーナス・ペナルティ・基本値は写さない。'] },
    { n: 53, key: 'doppelganger', en: 'Doppelgänger', ja: 'ドッペルゲンガー', suit: 'wild', str: 0,
      b: ['自分の手札のほかのカード1枚の、名前・基本値・スート・ペナルティを写してよい（ボーナスは写さない）。'] }
  ];
  var BY_N = {}, BY_KEY = {}, BY_NAME = {};
  CARDS.forEach(function (c) { BY_N[c.n] = c; BY_KEY[c.key] = c; BY_NAME[c.en] = c; });
  var DECK_SIZE = CARDS.length; // 53

  function nameJa(en) { var d = BY_NAME[en]; return d ? d.ja : en; }

  /* ================================================================== hand helpers (blanked cards are ignored) */
  function countSuit(ctx, s, self) {
    var k = 0, cs = ctx.cards;
    for (var i = 0; i < cs.length; i++) if (!cs[i].blanked && cs[i].suit === s && cs[i] !== self) k++;
    return k;
  }
  function hasSuit(ctx, s) {
    var cs = ctx.cards;
    for (var i = 0; i < cs.length; i++) if (!cs[i].blanked && cs[i].suit === s) return true;
    return false;
  }
  function hasName(ctx, nm) {
    var cs = ctx.cards;
    for (var i = 0; i < cs.length; i++) if (!cs[i].blanked && cs[i].name === nm) return true;
    return false;
  }
  function countName(ctx, nm) {
    var k = 0, cs = ctx.cards;
    for (var i = 0; i < cs.length; i++) if (!cs[i].blanked && cs[i].name === nm) k++;
    return k;
  }
  // Rangers clear the word Army from every Penalty; the Warship clears it from the Penalties of Floods. Both are
  // Bonuses of the real cards, so they work even when the clearing card itself ends up blanked.
  function armyCleared(ctx, c) { return ctx.rangers || (ctx.warship && c.suit === 'flood'); }
  function ex(e, s) { if (e) e.push(s); }

  var RUN_BONUS = [0, 0, 0, 10, 30, 60, 100, 150];
  function runBonus(len) { return len >= 7 ? 150 : RUN_BONUS[len]; }
  // Gem of Order: separate runs of consecutive base strengths each score; no card counts in two runs.
  function bestRuns(counts, from) {
    var v = from;
    while (v < counts.length && !counts[v]) v++;
    if (v >= counts.length) return 0;
    counts[v]--;
    var best = bestRuns(counts, v); // this card is not the start of a run
    counts[v]++;
    var len = 0, w = v;
    while (w < counts.length && counts[w] > 0) { counts[w]--; len++; w++; if (len >= 3) { var r = runBonus(len) + bestRuns(counts, v); if (r > best) best = r; } }
    for (var u = v; u < w; u++) counts[u]++;
    return best;
  }
  function gemRuns(ctx) {
    var counts = [], cs = ctx.cards, any = false;
    for (var i = 0; i < cs.length; i++) if (!cs[i].blanked) { var s = cs[i].str; counts[s] = (counts[s] || 0) + 1; any = true; }
    if (!any) return 0;
    for (var j = 0; j < counts.length; j++) counts[j] = counts[j] || 0;
    return bestRuns(counts, 0);
  }

  /* ================================================================== the rules of each card
     bonus(ctx, c, e)         points from the card's Bonus (e: optional array that collects explanations)
     penalty(ctx, c, e)       points from the card's Penalty (≤ 0)
     blanks(ctx, self, t)     the Penalty blanks card t
     blankedIf(ctx, self)     the Penalty blanks the card itself
     clears(ctx, self, t)     the Bonus clears the whole Penalty of card t
     suits / names            the suits and card names the card's rules look at (used to prune the choice search) */
  var R = {};
  R.mountain = { names: ['Smoke', 'Wildfire'], suits: ['flood'],
    bonus: function (x, c, e) { if (hasName(x, 'Smoke') && hasName(x, 'Wildfire')) { ex(e, '「煙」「野火」 +50'); return 50; } return 0; },
    clears: function (x, s, t) { return t.suit === 'flood'; } };
  R.cavern = { names: ['Dwarvish Infantry', 'Dragon'], suits: ['weather'],
    bonus: function (x, c, e) { if (hasName(x, 'Dwarvish Infantry') || hasName(x, 'Dragon')) { ex(e, '「ドワーフの歩兵」か「ドラゴン」 +25'); return 25; } return 0; },
    clears: function (x, s, t) { return t.suit === 'weather'; } };
  R.bellTower = { suits: ['wizard'],
    bonus: function (x, c, e) { if (hasSuit(x, 'wizard')) { ex(e, '魔術師あり +15'); return 15; } return 0; } };
  R.forest = { names: ['Elven Archers'], suits: ['beast'],
    bonus: function (x, c, e) {
      var b = countSuit(x, 'beast'), a = countName(x, 'Elven Archers');
      if (b) ex(e, '獣' + b + '枚 ×12'); if (a) ex(e, '「エルフの射手」' + a + '枚 ×12');
      return 12 * (b + a);
    } };
  R.earthElemental = { suits: ['land'],
    bonus: function (x, c, e) { var k = countSuit(x, 'land', c); if (k) ex(e, 'ほかの大地' + k + '枚 ×15'); return 15 * k; } };
  R.fountainOfLife = { suits: ['weapon', 'flood', 'flame', 'land', 'weather'],
    bonus: function (x, c, e) {
      var best = null, cs = x.cards;
      for (var i = 0; i < cs.length; i++) {
        var t = cs[i];
        if (!t.blanked && (t.suit === 'weapon' || t.suit === 'flood' || t.suit === 'flame' || t.suit === 'land' || t.suit === 'weather') && (!best || t.str > best.str)) best = t;
      }
      if (best && best.str > 0) { ex(e, '「' + nameJa(best.name) + '」の基本値 +' + best.str); return best.str; }
      return 0;
    } };
  R.swamp = { suits: ['army', 'flame', 'flood'],
    penalty: function (x, c, e) {
      var f = countSuit(x, 'flame'), a = armyCleared(x, c) ? 0 : countSuit(x, 'army');
      if (a) ex(e, '軍隊' + a + '枚 ×−3'); if (f) ex(e, '炎' + f + '枚 ×−3');
      return -3 * (f + a);
    } };
  R.greatFlood = { names: ['Mountain', 'Lightning'], suits: ['army', 'land', 'flame', 'flood'],
    blanks: function (x, s, t) {
      return (t.suit === 'army' && !armyCleared(x, s)) || (t.suit === 'land' && t.name !== 'Mountain') || (t.suit === 'flame' && t.name !== 'Lightning');
    } };
  R.island = { suits: ['flood', 'flame'] }; // its CLEAR is the chosen target (see scoreHand)
  R.waterElemental = { suits: ['flood'],
    bonus: function (x, c, e) { var k = countSuit(x, 'flood', c); if (k) ex(e, 'ほかの洪水' + k + '枚 ×15'); return 15 * k; } };
  R.rainstorm = { names: ['Lightning'], suits: ['flood', 'flame'],
    bonus: function (x, c, e) { var k = countSuit(x, 'flood'); if (k) ex(e, '洪水' + k + '枚 ×10'); return 10 * k; },
    blanks: function (x, s, t) { return t.suit === 'flame' && t.name !== 'Lightning'; } };
  R.blizzard = { suits: ['flood', 'army', 'leader', 'beast', 'flame'],
    blanks: function (x, s, t) { return t.suit === 'flood'; },
    penalty: function (x, c, e) {
      var a = armyCleared(x, c) ? 0 : countSuit(x, 'army'), l = countSuit(x, 'leader'), b = countSuit(x, 'beast'), f = countSuit(x, 'flame');
      if (a) ex(e, '軍隊' + a + '枚 ×−5'); if (l) ex(e, '指導者' + l + '枚 ×−5'); if (b) ex(e, '獣' + b + '枚 ×−5'); if (f) ex(e, '炎' + f + '枚 ×−5');
      return -5 * (a + l + b + f);
    } };
  R.smoke = { suits: ['flame'],
    blankedIf: function (x, s) { return !hasSuit(x, 'flame'); } };
  R.whirlwind = { names: ['Rainstorm', 'Blizzard', 'Great Flood'],
    bonus: function (x, c, e) {
      if (hasName(x, 'Rainstorm') && (hasName(x, 'Blizzard') || hasName(x, 'Great Flood'))) { ex(e, '「暴風雨」と「' + (hasName(x, 'Blizzard') ? '吹雪' : '大洪水') + '」 +40'); return 40; }
      return 0;
    } };
  R.airElemental = { suits: ['weather'],
    bonus: function (x, c, e) { var k = countSuit(x, 'weather', c); if (k) ex(e, 'ほかの天候' + k + '枚 ×15'); return 15 * k; } };
  R.wildfire = { names: ['Mountain', 'Great Flood', 'Island', 'Unicorn', 'Dragon'], suits: ['flame', 'wizard', 'weather', 'weapon', 'artifact'],
    blanks: function (x, s, t) {
      var su = t.suit, nm = t.name;
      return !(su === 'flame' || su === 'wizard' || su === 'weather' || su === 'weapon' || su === 'artifact' ||
        nm === 'Mountain' || nm === 'Great Flood' || nm === 'Island' || nm === 'Unicorn' || nm === 'Dragon');
    } };
  R.candle = { names: ['Book of Changes', 'Bell Tower'], suits: ['wizard'],
    bonus: function (x, c, e) { if (hasName(x, 'Book of Changes') && hasName(x, 'Bell Tower') && hasSuit(x, 'wizard')) { ex(e, '「変化の書」「鐘楼」と魔術師 +100'); return 100; } return 0; } };
  R.forge = { suits: ['weapon', 'artifact'],
    bonus: function (x, c, e) { var w = countSuit(x, 'weapon'), a = countSuit(x, 'artifact'); if (w + a) ex(e, '武器と秘宝' + (w + a) + '枚 ×9'); return 9 * (w + a); } };
  R.lightning = { names: ['Rainstorm'],
    bonus: function (x, c, e) { if (hasName(x, 'Rainstorm')) { ex(e, '「暴風雨」 +30'); return 30; } return 0; } };
  R.fireElemental = { suits: ['flame'],
    bonus: function (x, c, e) { var k = countSuit(x, 'flame', c); if (k) ex(e, 'ほかの炎' + k + '枚 ×15'); return 15 * k; } };
  R.knights = { suits: ['leader'],
    penalty: function (x, c, e) { if (hasSuit(x, 'leader')) return 0; ex(e, '指導者なし −8'); return -8; } };
  R.elvenArchers = { suits: ['weather'],
    bonus: function (x, c, e) { if (hasSuit(x, 'weather')) return 0; ex(e, '天候なし +5'); return 5; } };
  R.lightCavalry = { suits: ['land'],
    penalty: function (x, c, e) { var k = countSuit(x, 'land'); if (k) ex(e, '大地' + k + '枚 ×−2'); return -2 * k; } };
  R.dwarvishInfantry = { suits: ['army', 'flood'],
    penalty: function (x, c, e) { if (armyCleared(x, c)) return 0; var k = countSuit(x, 'army', c); if (k) ex(e, 'ほかの軍隊' + k + '枚 ×−2'); return -2 * k; } };
  R.rangers = { suits: ['land', 'army'],
    bonus: function (x, c, e) { var k = countSuit(x, 'land'); if (k) ex(e, '大地' + k + '枚 ×10'); return 10 * k; } };
  R.collector = {
    bonus: function (x, c, e) {
      var bySuit = {}, cs = x.cards, total = 0;
      for (var i = 0; i < cs.length; i++) if (!cs[i].blanked) { var s = cs[i].suit; (bySuit[s] = bySuit[s] || {})[cs[i].name] = true; }
      for (var su in bySuit) {
        var k = Object.keys(bySuit[su]).length, v = k >= 5 ? 100 : k === 4 ? 40 : k === 3 ? 10 : 0;
        if (v) { ex(e, SUIT_JA[su] + 'の異なるカード' + k + '枚 +' + v); total += v; }
      }
      return total;
    } };
  R.beastmaster = { suits: ['beast'],
    bonus: function (x, c, e) { var k = countSuit(x, 'beast'); if (k) ex(e, '獣' + k + '枚 ×9'); return 9 * k; },
    clears: function (x, s, t) { return t.suit === 'beast'; } };
  R.necromancer = {}; // the eighth card is taken before scoring (see bestFinal)
  R.warlockLord = { suits: ['leader', 'wizard'],
    penalty: function (x, c, e) {
      var l = countSuit(x, 'leader'), w = countSuit(x, 'wizard', c);
      if (l) ex(e, '指導者' + l + '枚 ×−10'); if (w) ex(e, 'ほかの魔術師' + w + '枚 ×−10');
      return -10 * (l + w);
    } };
  R.enchantress = { suits: ['land', 'weather', 'flood', 'flame'],
    bonus: function (x, c, e) {
      var k = countSuit(x, 'land') + countSuit(x, 'weather') + countSuit(x, 'flood') + countSuit(x, 'flame');
      if (k) ex(e, '大地・天候・洪水・炎' + k + '枚 ×5'); return 5 * k;
    } };
  function royal(other, otherJa) {
    return { names: [other], suits: ['army'],
      bonus: function (x, c, e) {
        var k = countSuit(x, 'army'); if (!k) return 0;
        if (hasName(x, other)) { ex(e, '「' + otherJa + '」あり：軍隊' + k + '枚 ×20'); return 20 * k; }
        ex(e, '軍隊' + k + '枚 ×5'); return 5 * k;
      } };
  }
  R.king = royal('Queen', '女王');
  R.queen = royal('King', '国王');
  R.princess = { suits: ['army', 'wizard', 'leader'],
    bonus: function (x, c, e) {
      var a = countSuit(x, 'army'), w = countSuit(x, 'wizard'), l = countSuit(x, 'leader', c);
      if (a + w + l) ex(e, '軍隊・魔術師・ほかの指導者' + (a + w + l) + '枚 ×8'); return 8 * (a + w + l);
    } };
  R.warlord = { suits: ['army'],
    bonus: function (x, c, e) {
      var sum = 0, cs = x.cards;
      for (var i = 0; i < cs.length; i++) if (!cs[i].blanked && cs[i].suit === 'army') sum += cs[i].str;
      if (sum) ex(e, '軍隊の基本値の合計 +' + sum); return sum;
    } };
  R.empress = { suits: ['army', 'leader'],
    bonus: function (x, c, e) { var k = countSuit(x, 'army'); if (k) ex(e, '軍隊' + k + '枚 ×10'); return 10 * k; },
    penalty: function (x, c, e) { var k = countSuit(x, 'leader', c); if (k) ex(e, 'ほかの指導者' + k + '枚 ×−5'); return -5 * k; } };
  R.unicorn = { names: ['Princess', 'Empress', 'Queen', 'Enchantress'],
    bonus: function (x, c, e) {
      if (hasName(x, 'Princess')) { ex(e, '「王女」 +30'); return 30; }
      if (hasName(x, 'Empress') || hasName(x, 'Queen') || hasName(x, 'Enchantress')) { ex(e, '「女帝」「女王」「魔女」のどれか +15'); return 15; }
      return 0;
    } };
  R.basilisk = { suits: ['army', 'leader', 'beast', 'flood'],
    blanks: function (x, s, t) { return (t.suit === 'army' && !armyCleared(x, s)) || t.suit === 'leader' || (t.suit === 'beast' && t !== s); } };
  R.warhorse = { suits: ['leader', 'wizard'],
    bonus: function (x, c, e) { if (hasSuit(x, 'leader') || hasSuit(x, 'wizard')) { ex(e, '指導者か魔術師 +14'); return 14; } return 0; } };
  R.dragon = { suits: ['wizard'],
    penalty: function (x, c, e) { if (hasSuit(x, 'wizard')) return 0; ex(e, '魔術師なし −40'); return -40; } };
  R.hydra = { names: ['Swamp'],
    bonus: function (x, c, e) { if (hasName(x, 'Swamp')) { ex(e, '「沼地」 +28'); return 28; } return 0; } };
  R.warship = { suits: ['flood', 'army'],
    blankedIf: function (x, s) { return !hasSuit(x, 'flood'); } }; // its CLEAR works through armyCleared()
  R.magicWand = { suits: ['wizard'],
    bonus: function (x, c, e) { if (hasSuit(x, 'wizard')) { ex(e, '魔術師あり +25'); return 25; } return 0; } };
  R.swordOfKeth = { names: ['Shield of Keth'], suits: ['leader'],
    bonus: function (x, c, e) {
      if (!hasSuit(x, 'leader')) return 0;
      if (hasName(x, 'Shield of Keth')) { ex(e, '指導者と「ケスの盾」 +40'); return 40; }
      ex(e, '指導者あり +10'); return 10;
    } };
  R.elvenLongbow = { names: ['Elven Archers', 'Warlord', 'Beastmaster'],
    bonus: function (x, c, e) { if (hasName(x, 'Elven Archers') || hasName(x, 'Warlord') || hasName(x, 'Beastmaster')) { ex(e, '「エルフの射手」「将軍」「獣使い」のどれか +30'); return 30; } return 0; } };
  // "Blanked unless with at least one Army": once Rangers (or the Warship, for a Flood) clear the word Army,
  // that whole sentence is gone (ruling by the designer).
  R.warDirigible = { suits: ['army', 'weather', 'flood'],
    blankedIf: function (x, s) { return (!hasSuit(x, 'army') && !armyCleared(x, s)) || hasSuit(x, 'weather'); } };
  R.shieldOfKeth = { names: ['Sword of Keth'], suits: ['leader'],
    bonus: function (x, c, e) {
      if (!hasSuit(x, 'leader')) return 0;
      if (hasName(x, 'Sword of Keth')) { ex(e, '指導者と「ケスの剣」 +40'); return 40; }
      ex(e, '指導者あり +15'); return 15;
    } };
  R.gemOfOrder = {
    bonus: function (x, c, e) { var v = gemRuns(x); if (v) ex(e, '基本値の連続 +' + v); return v; } };
  R.worldTree = {
    bonus: function (x, c, e) {
      var seen = {}, cs = x.cards;
      for (var i = 0; i < cs.length; i++) if (!cs[i].blanked) { if (seen[cs[i].suit]) return 0; seen[cs[i].suit] = true; }
      ex(e, 'すべて異なるスート +50'); return 50;
    } };
  R.bookOfChanges = {};
  R.protectionRune = { clears: function () { return true; } };
  R.shapeshifter = {}; R.mirage = {}; R.doppelganger = {};

  // Which part of each card is a Penalty (the Doppelgänger copies exactly this part).
  function hasPenaltyPart(key) { var r = R[key]; return !!(r && (r.penalty || r.blanks || r.blankedIf)); }

  /* ================================================================== scoring one hand with given choices
     ids     the card numbers in the hand (7, or 8 with the Necromancer's card)
     choice  { doppel: index of the copied card,
               mirage / shapeshifter: { n: card number } (take that card's name and suit) or { g: suit } (a generic card of that suit),
               book: { t: index of the card, s: new suit },
               island: index of the Flood or Flame whose Penalty it clears }
             Anything left out is not used. Invalid choices are ignored and reported in result.invalid. */
  function scoreHand(ids, choice, opts) {
    choice = choice || {};
    var explain = !!(opts && opts.explain);
    var cards = new Array(ids.length);
    var x = { cards: cards, rangers: false, warship: false };
    var i, c, t, invalid = [];
    for (i = 0; i < ids.length; i++) {
      var d = BY_N[ids[i]];
      if (!d) throw new Error('unknown card ' + ids[i]);
      cards[i] = { i: i, n: d.n, key: d.key, name: d.en, suit: d.suit, str: d.str,
        bonusKey: d.key, penKey: hasPenaltyPart(d.key) ? d.key : null,
        blanked: false, cleared: false, by: null, selfBlank: false, as: null, bookFrom: null, islandOn: false };
      if (d.key === 'rangers') x.rangers = true;
      if (d.key === 'warship') x.warship = true;
    }
    function find(key) { for (var k = 0; k < cards.length; k++) if (cards[k].key === key) return cards[k]; return null; }

    // 1. Doppelgänger: name, base strength, suit and Penalty (not Bonus) of one other card in this hand.
    var dop = find('doppelganger');
    if (dop && choice.doppel != null) {
      t = cards[choice.doppel];
      if (t && t !== dop) {
        dop.name = t.name; dop.suit = t.suit; dop.str = t.str; dop.penKey = t.penKey;
        dop.as = { type: 'doppel', of: t.i, n: t.n };
      } else invalid.push('doppel');
    }
    // 2. Mirage, 3. Shapeshifter: name and suit of any card in the game of the listed suits, or a generic card of one
    //    of those suits. Base strength stays 0; no Bonus or Penalty.
    [['mirage', MIRAGE_SUITS], ['shapeshifter', SHAPESHIFTER_SUITS]].forEach(function (w) {
      var card = find(w[0]), ch = choice[w[0]];
      if (!card || !ch) return;
      if (ch.n != null && BY_N[ch.n] && w[1].indexOf(BY_N[ch.n].suit) >= 0) {
        card.name = BY_N[ch.n].en; card.suit = BY_N[ch.n].suit; card.as = { type: w[0], n: ch.n };
      } else if (ch.g && w[1].indexOf(ch.g) >= 0) {
        card.suit = ch.g; card.as = { type: w[0], g: ch.g };
      } else invalid.push(w[0]);
    });
    // 4. Book of Changes: the suit of one other card. Name, base strength, Bonus and Penalty stay.
    var book = find('bookOfChanges');
    if (book && choice.book) {
      t = cards[choice.book.t];
      if (t && t !== book && ALL_SUITS.indexOf(choice.book.s) >= 0 && t.suit !== choice.book.s) { t.bookFrom = t.suit; t.suit = choice.book.s; }
      else invalid.push('book');
    }
    // 5. Island: the Penalty of one Flood or Flame.
    var island = find('island');
    if (island && choice.island != null) {
      t = cards[choice.island];
      if (t && (t.suit === 'flood' || t.suit === 'flame') && t.penKey) t.islandOn = true;
      else invalid.push('island');
    }
    // 6. Clear Penalties. Clearing is a Bonus of the clearing card and happens before any Penalty, so it stands even if
    //    the clearing card is blanked afterwards.
    for (i = 0; i < cards.length; i++) {
      c = cards[i];
      var cl = R[c.bonusKey] && R[c.bonusKey].clears;
      if (cl) for (var j = 0; j < cards.length; j++) if (cl(x, c, cards[j])) cards[j].cleared = true;
    }
    for (i = 0; i < cards.length; i++) if (cards[i].islandOn) cards[i].cleared = true;

    // 7. Penalties that blank other cards, starting with cards not blanked by any other card. A blanked card does
    //    nothing; cards that blank each other (or a closed chain of them) are all blanked.
    var n = cards.length, P = new Array(n), any = false;
    for (i = 0; i < n; i++) {
      c = cards[i];
      var bl = c.penKey && !c.cleared && R[c.penKey].blanks;
      if (bl) { P[i] = []; for (j = 0; j < n; j++) { P[i][j] = !!bl(x, c, cards[j]); if (P[i][j]) any = true; } }
    }
    if (any) {
      var blankedFrom = function (k, stack) {
        var blankers = [], b;
        for (b = 0; b < n; b++) if (P[b] && P[b][k]) blankers.push(b);
        if (!blankers.length) return false;
        for (b = 0; b < blankers.length; b++) {
          if (P[k] && P[k][blankers[b]]) return true;       // they blank each other
          if (stack.indexOf(blankers[b]) >= 0) return true;  // a closed chain
        }
        for (b = 0; b < blankers.length; b++) if (!blankedFrom(blankers[b], stack.concat([blankers[b]]))) return true;
        return false;
      };
      var result = [];
      for (i = 0; i < n; i++) result.push(blankedFrom(i, [i]));
      for (i = 0; i < n; i++) if (result[i]) {
        cards[i].blanked = true;
        if (explain) {
          // the cards that blank it: those still standing, or (in a mutual or closed chain) the cards of that chain
          var by = [];
          for (j = 0; j < n; j++) if (P[j] && P[j][i] && !result[j]) by.push(j);
          if (!by.length) for (j = 0; j < n; j++) if (P[j] && P[j][i]) by.push(j);
          cards[i].by = by;
        }
      }
    }
    // 8. Cards blanked by their own Penalty (Smoke, Warship, War Dirigible, or a Doppelgänger copying them),
    //    checked in card-number order until nothing changes.
    var changed;
    do {
      changed = false;
      var live = cards.filter(function (q) { return !q.blanked; }).sort(function (a, b) { return a.n - b.n; });
      for (i = 0; i < live.length; i++) {
        c = live[i];
        var bi = c.penKey && !c.cleared && R[c.penKey].blankedIf;
        if (bi && bi(x, c)) { c.blanked = true; c.selfBlank = true; changed = true; }
      }
    } while (changed);

    // 9. Points of every card that is not blanked.
    var total = 0, baseTotal = 0, out = new Array(n);
    for (i = 0; i < n; i++) {
      c = cards[i];
      var eb = explain ? [] : null, ep = explain ? [] : null;
      var bonus = 0, pen = 0;
      if (!c.blanked) {
        var rb = R[c.bonusKey] && R[c.bonusKey].bonus;
        if (rb) bonus = rb(x, c, eb);
        var rp = c.penKey && !c.cleared && R[c.penKey].penalty;
        if (rp) pen = rp(x, c, ep);
        total += c.str + bonus + pen;
        baseTotal += c.str;
      }
      out[i] = { i: i, n: c.n, name: c.name, suit: c.suit, str: c.str, penKey: c.penKey, blanked: c.blanked, selfBlank: c.selfBlank,
        blankedBy: c.by, cleared: c.cleared, armyCleared: !!(c.penKey && !c.cleared && armyCleared(x, c)),
        hasPenalty: !!c.penKey, bonus: bonus, penalty: pen, points: c.blanked ? 0 : c.str + bonus + pen,
        as: c.as, bookFrom: c.bookFrom, island: c.islandOn, bonusWhy: eb, penaltyWhy: ep };
    }
    return { total: total, baseTotal: baseTotal, cards: out, invalid: invalid };
  }

  /* ================================================================== the best legal choices for a hand
     Every option that can change the score is tried. Options that cannot are left out:
     - Mirage/Shapeshifter: names no card in this hand refers to behave like a generic card of that suit (a generic
       card is also never a duplicate name), and suits that no card refers to and nobody holds are interchangeable.
     - Book of Changes: likewise for target suits.
     - Island: it must clear a Penalty when it can (designer's ruling), so only cards with a Penalty are candidates.
     Ties go to the lower total base strength (the rulebook's tie-breaker), then to fewer transformations. */
  function refsOf(keys) {
    var names = {}, suits = {};
    keys.forEach(function (k) { var r = k && R[k]; if (!r) return; (r.names || []).forEach(function (s) { names[s] = true; }); (r.suits || []).forEach(function (s) { suits[s] = true; }); });
    return { names: names, suits: suits };
  }
  function ruleKeys(ids, choice) {
    // rule keys whose texts are in play: every card's own key, plus the Penalty a Doppelgänger copies
    var keys = ids.map(function (id) { return BY_N[id].key; });
    if (choice && choice.doppel != null) { var t = BY_N[ids[choice.doppel]]; if (hasPenaltyPart(t.key)) keys.push(t.key); }
    return keys;
  }
  function better(a, b) { // is result a better than result b?
    if (!b) return true;
    if (a.total !== b.total) return a.total > b.total;
    if (a.baseTotal !== b.baseTotal) return a.baseTotal < b.baseTotal;
    return a.moves < b.moves;
  }
  function wildOptions(kind, suitsAllowed, ids, refs, held) {
    var opts = [null], unreferencedDone = false;
    suitsAllowed.forEach(function (s) {
      CARDS.forEach(function (d) { if (d.suit === s && refs.names[d.en]) opts.push({ n: d.n }); });
      var interesting = refs.suits[s] || held[s];
      if (interesting) opts.push({ g: s });
      else if (!unreferencedDone) { unreferencedDone = true; opts.push({ g: s }); }
    });
    return opts;
  }
  function scoreHandSuits(ids, choice) {
    // suits after steps 1–3 (Doppelgänger, Mirage, Shapeshifter)
    var suits = ids.map(function (id) { return BY_N[id].suit; });
    var keys = ids.map(function (id) { return BY_N[id].key; });
    var di = keys.indexOf('doppelganger');
    if (di >= 0 && choice.doppel != null) suits[di] = BY_N[ids[choice.doppel]].suit;
    ['mirage', 'shapeshifter'].forEach(function (k) {
      var wi = keys.indexOf(k), ch = choice[k];
      if (wi >= 0 && ch) suits[wi] = ch.n != null ? BY_N[ch.n].suit : ch.g;
    });
    return suits;
  }
  function countMoves(ch) { var m = 0; for (var k in ch) if (ch[k] != null && k !== 'island') m++; return m; }

  function bestChoice(ids, opts) {
    opts = opts || {};
    var keys = ids.map(function (id) { return BY_N[id].key; });
    var has = function (k) { return keys.indexOf(k) >= 0; };
    var best = null, bestCh = null, evaluated = 0;
    var limit = opts.limit || Infinity;

    var dopIdx = keys.indexOf('doppelganger');
    var dopOpts = [null];
    if (dopIdx >= 0) for (var i = 0; i < ids.length; i++) if (i !== dopIdx) dopOpts.push(i);

    function tryChoice(ch) {
      var r = scoreHand(ids, ch);
      evaluated++;
      r.moves = countMoves(ch);
      if (better(r, best)) { best = r; bestCh = JSON.parse(JSON.stringify(ch)); }
    }
    function islandStage(ch) {
      if (!has('island')) { tryChoice(ch); return; }
      // which cards are Floods/Flames with a Penalty after the Book
      var suits = scoreHandSuits(ids, ch);
      if (ch.book) suits[ch.book.t] = ch.book.s;
      var pen = ids.map(function (id, i) {
        if (i === dopIdx && ch.doppel != null) return hasPenaltyPart(BY_N[ids[ch.doppel]].key);
        return hasPenaltyPart(BY_N[id].key);
      });
      var cand = [];
      for (var i = 0; i < ids.length; i++) if ((suits[i] === 'flood' || suits[i] === 'flame') && pen[i]) cand.push(i);
      if (!cand.length) { tryChoice(ch); return; }
      cand.forEach(function (k) { var c2 = Object.assign({}, ch, { island: k }); tryChoice(c2); });
    }
    function bookStage(ch) {
      if (!has('bookOfChanges')) { islandStage(ch); return; }
      var bi = keys.indexOf('bookOfChanges');
      islandStage(ch); // not used
      var refs = refsOf(ruleKeys(ids, ch));
      var suitsNow = scoreHandSuits(ids, ch);
      for (var t = 0; t < ids.length; t++) {
        if (t === bi) continue;
        var held = {}; suitsNow.forEach(function (s, i) { if (i !== t) held[s] = true; });
        var plainDone = false;
        for (var s = 0; s < ALL_SUITS.length; s++) {
          var su = ALL_SUITS[s];
          if (su === suitsNow[t]) continue;
          if (!(refs.suits[su] || held[su])) { if (plainDone) continue; plainDone = true; }
          islandStage(Object.assign({}, ch, { book: { t: t, s: su } }));
          if (evaluated > limit) return;
        }
      }
    }
    dopOpts.forEach(function (dop) {
      if (evaluated > limit) return;
      var ch0 = {}; if (dop != null) ch0.doppel = dop;
      var refs = refsOf(ruleKeys(ids, ch0));
      var mirOpts = [null], shaOpts = [null];
      if (has('mirage')) {
        var heldM = {}; scoreHandSuits(ids, ch0).forEach(function (s, i) { if (keys[i] !== 'mirage') heldM[s] = true; });
        mirOpts = wildOptions('mirage', MIRAGE_SUITS, ids, refs, heldM);
      }
      mirOpts.forEach(function (mo) {
        var ch1 = Object.assign({}, ch0); if (mo) ch1.mirage = mo;
        if (has('shapeshifter')) {
          var heldS = {}; scoreHandSuits(ids, ch1).forEach(function (s, i) { if (keys[i] !== 'shapeshifter') heldS[s] = true; });
          shaOpts = wildOptions('shapeshifter', SHAPESHIFTER_SUITS, ids, refs, heldS);
        }
        shaOpts.forEach(function (so) {
          if (evaluated > limit) return;
          var ch2 = Object.assign({}, ch1); if (so) ch2.shapeshifter = so;
          bookStage(ch2);
        });
      });
    });
    if (opts.fast) return { total: best.total, baseTotal: best.baseTotal, choice: bestCh, evaluated: evaluated };
    var detailed = scoreHand(ids, bestCh, { explain: true });
    detailed.choice = bestCh;
    detailed.evaluated = evaluated;
    return detailed;
  }

  // The final score of a hand at the end of the game: the Necromancer may first take one Army, Leader, Wizard or
  // Beast from the discard area as an eighth card.
  function bestFinal(hand, discard, opts) {
    var picks = [null];
    if (hand.indexOf(BY_KEY.necromancer.n) >= 0) {
      (discard || []).forEach(function (id) { if (NECROMANCER_SUITS.indexOf(BY_N[id].suit) >= 0) picks.push(id); });
    }
    var best = null;
    picks.forEach(function (p) {
      var ids = p == null ? hand.slice() : hand.concat([p]);
      var r = bestChoice(ids, opts);
      r.ids = ids; r.necroPick = p;
      r.moves = countMoves(r.choice || {}) + (p == null ? 0 : 1);
      if (better(r, best)) best = r;
    });
    return best;
  }

  /* ================================================================== a fast estimate for the computer players
     Same scoring, with the wild-card search capped. Used only to choose moves, never for final scores. */
  function quickScore(ids, cap) {
    var keys = ids.map(function (id) { return BY_N[id].key; });
    var special = keys.some(function (k) { return k === 'doppelganger' || k === 'mirage' || k === 'shapeshifter' || k === 'bookOfChanges' || k === 'island'; });
    if (!special) return scoreHand(ids, {}).total;
    return bestChoice(ids, { limit: cap || 600, fast: true }).total;
  }

  /* ================================================================== random numbers (seeded, so games can be replayed) */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function shuffle(a, rand) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ================================================================== the game
     cfg = { players: [{ name, kind }], twoPlayerVariant: true|false (2 players only), seed }
     Basic game (3–6, or 2 without the variant): everyone starts with 7 cards. On a turn, draw the top card of the
     deck or take any face-up card from the discard area, then discard one card face up. The game ends as soon as
     the discard area holds 10 cards.
     Two-player variant: nobody starts with cards. While a player has fewer than 7 cards, a turn is either: take one
     face-up card from the discard area (no discard), or draw two cards from the deck and discard one of those two.
     With 7 cards, turns are as in the basic game. The game ends when both players have 7 cards and the discard area
     holds at least 12 cards. */
  function newGame(cfg) {
    var n = cfg.players.length;
    if (n < 2 || n > 6) throw new Error('players must be 2–6');
    var seed = cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 4294967296);
    var rand = rng(seed);
    var deck = shuffle(CARDS.map(function (c) { return c.n; }), rand);
    var variant = n === 2 && cfg.twoPlayerVariant !== false;
    var hands = [];
    for (var p = 0; p < n; p++) hands.push(variant ? [] : deck.splice(deck.length - 7, 7));
    var first = cfg.first != null ? cfg.first : Math.floor(rand() * n);
    return {
      v: 1, seed: seed, gid: Math.floor(Math.random() * 1e9).toString(36) + Date.now().toString(36),
      players: cfg.players.map(function (pl, i) { return { name: pl.name, kind: pl.kind || 'cpu', seat: i }; }),
      variant: variant, deck: deck, discard: [], hands: hands,
      turn: first, first: first, phase: 'draw', drawn: null, pending: null,
      turns: 0, over: false, result: null, log: [], seq: 0
    };
  }
  function building(st, seat) { return st.variant && st.hands[seat].length < 7; }

  // What the player to move may do now.
  function legal(st) {
    if (st.over) return [];
    var seat = st.turn, acts = [];
    if (st.phase === 'draw') {
      if (st.deck.length >= (building(st, seat) ? 2 : 1)) acts.push({ t: 'deck' });
      st.discard.forEach(function (id) { acts.push({ t: 'take', id: id }); });
    } else if (st.phase === 'discard') {
      var from = st.drawn2 ? st.drawn2 : st.hands[seat];
      from.forEach(function (id) { acts.push({ t: 'discard', id: id }); });
    }
    return acts;
  }

  function isLegal(st, a) {
    return legal(st).some(function (b) { return b.t === a.t && (b.id === a.id || (b.id == null && a.id == null)); });
  }

  function apply(st, a) {
    if (!isLegal(st, a)) throw new Error('illegal action ' + JSON.stringify(a));
    var seat = st.turn, hand = st.hands[seat];
    st.seq++;
    if (a.t === 'deck') {
      if (building(st, seat)) {
        var two = [st.deck.pop(), st.deck.pop()];
        hand.push(two[0], two[1]);
        st.drawn2 = two; st.drawn = null; st.phase = 'discard';
        st.log.push({ k: st.log.length, seat: seat, t: 'deck2' });
      } else {
        var c = st.deck.pop();
        hand.push(c); st.drawn = c; st.phase = 'discard';
        st.log.push({ k: st.log.length, seat: seat, t: 'deck' });
      }
      return st;
    }
    if (a.t === 'take') {
      var collecting = building(st, seat); // decided before the card joins the hand
      var k = st.discard.indexOf(a.id);
      st.discard.splice(k, 1);
      hand.push(a.id);
      st.log.push({ k: st.log.length, seat: seat, t: 'take', id: a.id });
      if (collecting) { // two-player variant, fewer than 7 cards: no discard
        st.drawn = null;
        return endTurn(st);
      }
      st.drawn = a.id; st.phase = 'discard';
      return st;
    }
    if (a.t === 'discard') {
      hand.splice(hand.indexOf(a.id), 1);
      st.discard.push(a.id);
      st.log.push({ k: st.log.length, seat: seat, t: 'discard', id: a.id });
      st.drawn = null; st.drawn2 = null;
      return endTurn(st);
    }
    throw new Error('unknown action');
  }

  function endTurn(st) {
    st.turns++;
    st.phase = 'draw';
    var done;
    if (st.variant) done = st.hands[0].length === 7 && st.hands[1].length === 7 && st.discard.length >= 12;
    else done = st.discard.length >= 10;
    if (!done && st.turns >= 600) done = true; // safety net for endless discard-area swaps
    if (!done) {
      st.turn = (st.turn + 1) % st.players.length;
      if (st.deck.length < (building(st, st.turn) ? 2 : 1) && !st.discard.length) done = true;
    }
    if (done) finish(st);
    return st;
  }

  function finish(st) {
    st.over = true; st.phase = 'over';
    var scores = st.hands.map(function (h) { return bestFinal(h, st.discard); });
    var top = null;
    scores.forEach(function (r, i) {
      if (!top || r.total > top.total || (r.total === top.total && r.baseTotal < top.baseTotal)) top = r;
    });
    var winners = [];
    scores.forEach(function (r, i) { if (r.total === top.total && r.baseTotal === top.baseTotal) winners.push(i); });
    var order = scores.map(function (r, i) { return i; }).sort(function (a, b) {
      return scores[b].total - scores[a].total || scores[a].baseTotal - scores[b].baseTotal || a - b;
    });
    st.result = { scores: scores, winners: winners, order: order };
    return st;
  }

  // What one seat may see: its own hand, the discard area, the counts of the others.
  function view(st, seat) {
    return {
      v: st.v, gid: st.gid, seq: st.seq, variant: st.variant, players: st.players.map(function (p) { return { name: p.name, kind: p.kind, seat: p.seat }; }), me: seat,
      hand: seat != null && seat >= 0 ? st.hands[seat].slice() : null,
      handSizes: st.hands.map(function (h) { return h.length; }),
      deck: st.deck.length, discard: st.discard.slice(), turn: st.turn, first: st.first, phase: st.phase,
      drawn: seat === st.turn ? st.drawn : null, drawn2: seat === st.turn && st.drawn2 ? st.drawn2.slice() : null,
      turns: st.turns, over: st.over, log: st.log.slice(-60),
      hands: st.over ? st.hands.map(function (h) { return h.slice(); }) : null,
      result: st.over ? st.result : null
    };
  }

  function clone(st) { return JSON.parse(JSON.stringify(st)); }

  return {
    SUITS: SUITS, ALL_SUITS: ALL_SUITS, SUIT_JA: SUIT_JA, SUIT_EN: SUIT_EN,
    MIRAGE_SUITS: MIRAGE_SUITS, SHAPESHIFTER_SUITS: SHAPESHIFTER_SUITS, NECROMANCER_SUITS: NECROMANCER_SUITS,
    CARDS: CARDS, BY_N: BY_N, BY_KEY: BY_KEY, BY_NAME: BY_NAME, DECK_SIZE: DECK_SIZE, nameJa: nameJa,
    hasPenaltyPart: hasPenaltyPart, RULES: R,
    scoreHand: scoreHand, bestChoice: bestChoice, bestFinal: bestFinal, quickScore: quickScore, gemRuns: gemRuns,
    rng: rng, shuffle: shuffle,
    newGame: newGame, legal: legal, isLegal: isLegal, apply: apply, view: view, clone: clone, building: building
  };
});
