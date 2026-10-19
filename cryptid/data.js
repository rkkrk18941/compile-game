/* クリプティッド — map tiles, terrain, structures, the clue catalogue and the hint table.
   Board: 12 columns x 9 rows of flat-topped hexes, odd-q layout (odd columns sit half a hex lower).
   Hex index h = y * 12 + x. Each of the six map tiles is 6 columns x 3 rows and can be laid turned 180 degrees.
   The terrain and animal territories of the six tiles were checked hex by hex against three independent public
   transcriptions (Manezki/CryptidSolver, epsalon/decryptid, ymouse91/cryptid); all three agree. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CRY_DATA = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var W = 12, H = 9, N = W * H;

  // terrain index: 0 forest, 1 desert, 2 water, 3 swamp, 4 mountain (this order gives the terrain-pair clues in the
  // same order as the official deduction sheet: forest/desert, forest/water, forest/swamp, forest/mountain, ...)
  var TERRAIN = [
    { key: 'forest', name: '森林', letter: 'F' },
    { key: 'desert', name: '砂漠', letter: 'D' },
    { key: 'water', name: '水辺', letter: 'W' },
    { key: 'swamp', name: '沼地', letter: 'S' },
    { key: 'mountain', name: '山岳', letter: 'M' }
  ];
  var TERRAIN_CODE = { F: 0, D: 1, W: 2, S: 3, M: 4 };

  // animal territory: 0 none, 1 bear, 2 cougar
  var ANIMAL = [null, { key: 'bear', name: 'クマ' }, { key: 'cougar', name: 'ピューマ' }];
  var ANIMAL_CODE = { '.': 0, B: 1, C: 2 };

  // The six map tiles, rows top to bottom as printed (number in the top-left corner).
  var TILES = {
    1: { t: ['WWWWFF', 'SSWDFF', 'SSDDDF'], a: ['......', '......', '...BBB'] },
    2: { t: ['SFFFFF', 'SSFDDD', 'SMMMMD'], a: ['CCC...', '......', '......'] },
    3: { t: ['SSFFFW', 'SSFMWW', 'MMMMWW'], a: ['......', 'CC....', 'C.....'] },
    4: { t: ['DDMMMM', 'DDMWWW', 'DDDFFF'], a: ['......', '.....C', '.....C'] },
    5: { t: ['SSSMMM', 'SDDWMM', 'DDWWWW'], a: ['......', '.....B', '....BB'] },
    6: { t: ['DDSSSF', 'MMSSFF', 'MWWWWF'], a: ['B.....', 'B.....', '......'] }
  };

  var STRUCT_TYPES = ['stone', 'shack'];
  var STRUCT_NAME = { stone: '巨石', shack: '廃墟' };
  var COLORS = ['white', 'green', 'blue', 'black']; // black only in the advanced game
  var COLOR_NAME = { white: '白', green: '緑', blue: '青', black: '黒' };
  var COLOR_ADJ = { white: '白い', green: '緑の', blue: '青い', black: '黒い' };

  // Player piece colours (five sets of wooden cubes and discs).
  var PLAYER_COLORS = [
    { key: 'yellow', name: '黄', hex: '#f4c21b' },
    { key: 'red', name: '赤', hex: '#d8352b' },
    { key: 'green', name: '緑', hex: '#2aa84a' },
    { key: 'cyan', name: '水色', hex: '#1fb4cc' },
    { key: 'purple', name: '紫', hex: '#8a47cc' }
  ];

  /* ---------------------------------------------------------------- clues
     Positive clues 0..23 in deduction-sheet order, then their "not" versions 24..47 (advanced game only).
     dist: 0 = on the terrain itself, otherwise "within dist spaces" (an element is 0 spaces from itself). */
  var CLUES = [];
  function add(o) { o.i = CLUES.length; o.neg = false; CLUES.push(o); }
  var PAIRS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  PAIRS.forEach(function (p) { add({ kind: 'on', a: p[0], b: p[1], dist: 0, group: 'on' }); });
  [0, 1, 3, 4, 2].forEach(function (t) { add({ kind: 'nearT', t: t, dist: 1, group: 'n1' }); });
  add({ kind: 'nearAnimal', dist: 1, group: 'n1' });
  add({ kind: 'nearS', s: 'stone', dist: 2, group: 'n2' });
  add({ kind: 'nearS', s: 'shack', dist: 2, group: 'n2' });
  add({ kind: 'nearA', a: 1, dist: 2, group: 'n2' });
  add({ kind: 'nearA', a: 2, dist: 2, group: 'n2' });
  ['blue', 'white', 'green', 'black'].forEach(function (c) { add({ kind: 'nearC', c: c, dist: 3, group: 'n3' }); });
  CLUES.forEach(function (c) { c.adv = c.kind === 'nearC' && c.c === 'black'; });
  var POS = CLUES.length; // 24
  for (var i = 0; i < POS; i++) {
    var p = CLUES[i], q = {};
    for (var k in p) q[k] = p[k];
    q.i = CLUES.length; q.neg = true; q.base = i; q.adv = true;
    CLUES.push(q);
  }
  CLUES.forEach(function (c) { if (c.base == null) c.base = c.i; });

  function clueSubject(c) {
    switch (c.kind) {
      case 'on': return TERRAIN[c.a].name + 'か' + TERRAIN[c.b].name;
      case 'nearT': return TERRAIN[c.t].name;
      case 'nearAnimal': return 'どちらかの動物の縄張り';
      case 'nearS': return STRUCT_NAME[c.s];
      case 'nearA': return ANIMAL[c.a].name + 'の縄張り';
      case 'nearC': return COLOR_ADJ[c.c] + '建造物';
    }
    return '';
  }
  // Full sentence, as written in a clue book.
  function clueText(i) {
    var c = CLUES[i];
    if (!c) return '';
    if (c.kind === 'on') {
      return c.neg ? '生息地は、' + TERRAIN[c.a].name + 'にも' + TERRAIN[c.b].name + 'にもない'
        : '生息地は、' + TERRAIN[c.a].name + 'か' + TERRAIN[c.b].name + 'のマスにある';
    }
    return '生息地は、' + clueSubject(c) + 'から' + c.dist + 'マス以内に' + (c.neg ? 'はない' : 'ある');
  }
  // Compact label for the deduction memo.
  function clueShort(i) {
    var c = CLUES[i];
    if (!c) return '';
    var s;
    switch (c.kind) {
      case 'on': s = TERRAIN[c.a].name + '/' + TERRAIN[c.b].name; break;
      case 'nearT': s = TERRAIN[c.t].name + ' 1'; break;
      case 'nearAnimal': s = '動物 1'; break;
      case 'nearS': s = STRUCT_NAME[c.s] + ' 2'; break;
      case 'nearA': s = ANIMAL[c.a].name + ' 2'; break;
      case 'nearC': s = COLOR_NAME[c.c] + ' 3'; break;
    }
    return s;
  }
  // Short explanation of what counts for a clue type (shown under the clue card).
  function clueNote(i) {
    var c = CLUES[i];
    if (!c) return '';
    switch (c.kind) {
      case 'on': return c.neg ? 'この2つ以外の地形なら生息地になりうる' : 'この2つの地形のどちらか';
      case 'nearT': return 'その地形のマス自体と、となりのマス';
      case 'nearAnimal': return 'クマかピューマの縄張りのマスと、そのとなり';
      case 'nearS': return '色は関係なし。建造物のマスから2マス以内';
      case 'nearA': return (c.a === 1 ? 'クマ' : 'ピューマ') + 'の縄張りだけを数える。縄張りのマスも含む';
      case 'nearC': return '巨石・廃墟どちらでも。建造物のマスから3マス以内';
    }
    return '';
  }

  /* ---------------------------------------------------------------- hints ("追加の手がかり")
     Every hint says which kind of clue nobody has. Weights follow how often each kind appears in the 80 entries of
     the rulebook's hint table. */
  function mentionsTerrain(c, t) { return (c.kind === 'on' && (c.a === t || c.b === t)) || (c.kind === 'nearT' && c.t === t); }
  var HINTS = [
    { key: 'n1', text: '「1マス以内」の手がかりは、だれも持っていない', w: 12, covers: function (c) { return c.group === 'n1'; } },
    { key: 'n2', text: '「2マス以内」の手がかりは、だれも持っていない', w: 24, covers: function (c) { return c.group === 'n2'; } },
    { key: 'n3', text: '「3マス以内」の手がかりは、だれも持っていない', w: 19, covers: function (c) { return c.group === 'n3'; } },
    { key: 'on', text: '「地形か地形」の手がかりは、だれも持っていない', w: 6, covers: function (c) { return c.kind === 'on'; } },
    { key: 'animal', text: '動物の縄張りが出てくる手がかりは、だれも持っていない', w: 1, covers: function (c) { return c.kind === 'nearAnimal' || c.kind === 'nearA'; } },
    { key: 'terrain', text: '地形が出てくる手がかりは、だれも持っていない', w: 1, covers: function (c) { return c.kind === 'on' || c.kind === 'nearT'; } }
  ];
  TERRAIN.forEach(function (t, ti) {
    HINTS.push({ key: 't' + ti, text: t.name + 'が出てくる手がかりは、だれも持っていない', w: 3, covers: function (c) { return mentionsTerrain(c, ti); } });
  });
  var HINT_BY_KEY = {};
  HINTS.forEach(function (h) { HINT_BY_KEY[h.key] = h; });
  function hintCovers(key, clueIndex) { var h = HINT_BY_KEY[key]; return !!(h && h.covers(CLUES[clueIndex])); }

  /* ---------------------------------------------------------------- hex geometry (odd-q offset) */
  var DIRS = [
    [[1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [0, -1]], // even column
    [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, -1]]    // odd column
  ];
  function hx(h) { return h % W; }
  function hy(h) { return (h / W) | 0; }
  function neighbors(h) {
    var x = hx(h), y = hy(h), out = [];
    DIRS[x & 1].forEach(function (d) {
      var nx = x + d[0], ny = y + d[1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) out.push(ny * W + nx);
    });
    return out;
  }
  function cubeOf(h) { var x = hx(h), y = hy(h), r = y - ((x - (x & 1)) >> 1); return [x, r, -x - r]; }
  var DIST = new Int8Array(N * N);
  for (var a = 0; a < N; a++) {
    var ca = cubeOf(a);
    for (var b = 0; b < N; b++) {
      var cb = cubeOf(b);
      DIST[a * N + b] = Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2]));
    }
  }
  function dist(a, b) { return DIST[a * N + b]; }

  return {
    W: W, H: H, N: N,
    TERRAIN: TERRAIN, TERRAIN_CODE: TERRAIN_CODE, ANIMAL: ANIMAL, ANIMAL_CODE: ANIMAL_CODE, TILES: TILES,
    STRUCT_TYPES: STRUCT_TYPES, STRUCT_NAME: STRUCT_NAME, COLORS: COLORS, COLOR_NAME: COLOR_NAME, COLOR_ADJ: COLOR_ADJ,
    PLAYER_COLORS: PLAYER_COLORS,
    CLUES: CLUES, POS: POS, clueText: clueText, clueShort: clueShort, clueNote: clueNote, clueSubject: clueSubject,
    HINTS: HINTS, HINT_BY_KEY: HINT_BY_KEY, hintCovers: hintCovers,
    hx: hx, hy: hy, neighbors: neighbors, dist: dist, DIRS: DIRS
  };
});
