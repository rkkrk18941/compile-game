/* おばけキャッチ — the 60 cards and the one rule that decides every card.

   Five animals, each with its own true colour:
     イス = 赤, 本 = 青, ビン = 緑, おばけ = 白, ネズミ = 灰色
   A card (a coloured-in drawing) shows two different animals painted in two different colours.
     - If one of the two animals is painted in its own colour, that animal is the answer.
     - Otherwise the answer is the animal that is on the card neither as a shape nor as a colour.
   The deck: 10 animal pairs × 6 colourings = 60 cards. Every animal is the answer on 12 cards,
   20 cards have an animal in its own colour and 40 do not. Every card has exactly one answer under the
   rule above — tools/nurie-rules-test.mjs checks the whole deck card by card.

   Advanced rule: when a 本 is drawn on the card (in any colour) you call the answer's name instead of
   touching the piece. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NR_DECK = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ANIMALS = ['crab', 'chick', 'turtle', 'fish', 'pig'];      // piece order on the table
  var COLORS = ['r', 'y', 'g', 'b', 'p'];
  var TRUE_COLOR = { crab: 'r', chick: 'y', turtle: 'g', fish: 'b', pig: 'p' };
  var OWNER = { r: 'crab', y: 'chick', g: 'turtle', b: 'fish', p: 'pig' };
  // Stable internal IDs retain saved settings and the card ordering.
  var NAME = { crab: 'イス', chick: '本', turtle: 'ビン', fish: 'おばけ', pig: 'ネズミ' };
  var COLOR_NAME = { r: '赤', y: '青', g: '緑', b: '白', p: '灰色' };
  var COLOR_ADJ = { r: '赤い', y: '青い', g: '緑の', b: '白い', p: '灰色の' };
  var HEX = { r: '#dc3028', y: '#2876b6', g: '#299342', b: '#ffffff', p: '#666666' };
  var CALL_TRIGGER = 'chick';

  /* [animal, colour, animal, colour, answer] — grouped by pair, the two "own colour" cards first. */
  var RAW = [
    // イス × 本
    ['crab', 'r', 'chick', 'b', 'crab'],
    ['crab', 'g', 'chick', 'y', 'chick'],
    ['crab', 'b', 'chick', 'p', 'turtle'],
    ['crab', 'p', 'chick', 'b', 'turtle'],
    ['crab', 'p', 'chick', 'g', 'fish'],
    ['crab', 'g', 'chick', 'b', 'pig'],
    // イス × ビン
    ['crab', 'r', 'turtle', 'y', 'crab'],
    ['crab', 'b', 'turtle', 'g', 'turtle'],
    ['crab', 'p', 'turtle', 'b', 'chick'],
    ['crab', 'p', 'turtle', 'y', 'fish'],
    ['crab', 'y', 'turtle', 'p', 'fish'],
    ['crab', 'b', 'turtle', 'y', 'pig'],
    // イス × おばけ
    ['crab', 'r', 'fish', 'p', 'crab'],
    ['crab', 'y', 'fish', 'b', 'fish'],
    ['crab', 'g', 'fish', 'p', 'chick'],
    ['crab', 'p', 'fish', 'g', 'chick'],
    ['crab', 'y', 'fish', 'p', 'turtle'],
    ['crab', 'g', 'fish', 'y', 'pig'],
    // イス × ネズミ
    ['crab', 'r', 'pig', 'g', 'crab'],
    ['crab', 'b', 'pig', 'p', 'pig'],
    ['crab', 'b', 'pig', 'g', 'chick'],
    ['crab', 'b', 'pig', 'y', 'turtle'],
    ['crab', 'y', 'pig', 'b', 'turtle'],
    ['crab', 'g', 'pig', 'y', 'fish'],
    // 本 × ビン
    ['chick', 'y', 'turtle', 'r', 'chick'],
    ['chick', 'p', 'turtle', 'g', 'turtle'],
    ['chick', 'b', 'turtle', 'p', 'crab'],
    ['chick', 'p', 'turtle', 'b', 'crab'],
    ['chick', 'p', 'turtle', 'r', 'fish'],
    ['chick', 'b', 'turtle', 'r', 'pig'],
    // 本 × おばけ
    ['chick', 'y', 'fish', 'p', 'chick'],
    ['chick', 'p', 'fish', 'b', 'fish'],
    ['chick', 'p', 'fish', 'g', 'crab'],
    ['chick', 'p', 'fish', 'r', 'turtle'],
    ['chick', 'g', 'fish', 'r', 'pig'],
    ['chick', 'r', 'fish', 'g', 'pig'],
    // 本 × ネズミ
    ['chick', 'y', 'pig', 'g', 'chick'],
    ['chick', 'b', 'pig', 'p', 'pig'],
    ['chick', 'g', 'pig', 'b', 'crab'],
    ['chick', 'b', 'pig', 'r', 'turtle'],
    ['chick', 'g', 'pig', 'r', 'fish'],
    ['chick', 'r', 'pig', 'g', 'fish'],
    // ビン × おばけ
    ['turtle', 'g', 'fish', 'y', 'turtle'],
    ['turtle', 'r', 'fish', 'b', 'fish'],
    ['turtle', 'p', 'fish', 'y', 'crab'],
    ['turtle', 'r', 'fish', 'p', 'chick'],
    ['turtle', 'r', 'fish', 'y', 'pig'],
    ['turtle', 'y', 'fish', 'r', 'pig'],
    // ビン × ネズミ
    ['turtle', 'g', 'pig', 'r', 'turtle'],
    ['turtle', 'b', 'pig', 'p', 'pig'],
    ['turtle', 'b', 'pig', 'y', 'crab'],
    ['turtle', 'y', 'pig', 'b', 'crab'],
    ['turtle', 'b', 'pig', 'r', 'chick'],
    ['turtle', 'r', 'pig', 'y', 'fish'],
    // おばけ × ネズミ
    ['fish', 'b', 'pig', 'g', 'fish'],
    ['fish', 'g', 'pig', 'p', 'pig'],
    ['fish', 'y', 'pig', 'g', 'crab'],
    ['fish', 'g', 'pig', 'r', 'chick'],
    ['fish', 'r', 'pig', 'g', 'chick'],
    ['fish', 'r', 'pig', 'y', 'turtle']
  ];

  var CARDS = RAW.map(function (r, i) {
    return { id: i, no: i + 1, pair: Math.floor(i / 6), a: r[0], ca: r[1], b: r[2], cb: r[3], expect: r[4] };
  });
  var PAIRS = [];
  for (var p = 0; p < 10; p++) PAIRS.push([CARDS[p * 6].a, CARDS[p * 6].b]);

  /* The rule. Returns { answer, match, right } or { answer: null } for a drawing that has no single answer. */
  function solve(card) {
    if (!card || card.a === card.b || card.ca === card.cb) return { answer: null };
    var right = [];
    if (TRUE_COLOR[card.a] === card.ca) right.push(card.a);
    if (TRUE_COLOR[card.b] === card.cb) right.push(card.b);
    if (right.length === 1) return { answer: right[0], match: true, right: right[0] };
    if (right.length === 2) return { answer: null };
    var seen = {};
    seen[card.a] = 1; seen[card.b] = 1; seen[OWNER[card.ca]] = 1; seen[OWNER[card.cb]] = 1;
    var missing = ANIMALS.filter(function (x) { return !seen[x]; });
    if (missing.length !== 1) return { answer: null };
    return { answer: missing[0], match: false, right: null };
  }

  function hasAnimal(card, animal) { return card.a === animal || card.b === animal; }
  function needsCall(card) { return hasAnimal(card, CALL_TRIGGER); }

  /* What a player has to do for this card: { type: 'grab' | 'call', item } */
  function required(card, callMode) {
    return { type: callMode && needsCall(card) ? 'call' : 'grab', item: solve(card).answer };
  }

  /* One-line explanation, for the result line and the card list. */
  function explain(card) {
    var s = solve(card);
    if (!s.answer) return '';
    if (s.match) return COLOR_ADJ[card.a === s.answer ? card.ca : card.cb] + NAME[s.answer] + 'がホンモノの色';
    return '出ている：' + NAME[card.a] + '・' + NAME[card.b] + '・' + COLOR_NAME[card.ca] + '・' + COLOR_NAME[card.cb] + ' → いないのは' + NAME[s.answer];
  }
  function short(card) {
    var s = solve(card);
    if (!s.answer) return '';
    return s.match ? 'ホンモノの色' : 'どこにもいない';
  }
  function describe(card) {
    return COLOR_ADJ[card.ca] + NAME[card.a] + 'と' + COLOR_ADJ[card.cb] + NAME[card.b];
  }

  return {
    ANIMALS: ANIMALS, COLORS: COLORS, TRUE_COLOR: TRUE_COLOR, OWNER: OWNER, NAME: NAME,
    COLOR_NAME: COLOR_NAME, COLOR_ADJ: COLOR_ADJ, HEX: HEX, CALL_TRIGGER: CALL_TRIGGER,
    CARDS: CARDS, PAIRS: PAIRS,
    solve: solve, needsCall: needsCall, hasAnimal: hasAnimal, required: required,
    explain: explain, short: short, describe: describe
  };
});
