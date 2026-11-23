/* エレメンティカ — the rules, with nothing about the screen.

   Built from the English rulebook of Elementica (14games, 2026). The rule flow follows that book; the printed
   numbers on the pieces (token faces, plant costs, map bonuses, track rewards) could not be read from the
   published files, so the values below are this app's own, chosen to keep the game moving at the same pace.

   A game for 2–4 players. Everyone starts with 6 coins, workforce 1 and three white planning chips.
     prep     in reverse turn order everyone puts one base on the map (2 coins, +1 to each neighbouring rival).
     round    1 action   each player in turn order takes 2 actions in a row (only 1 in the first round).
                         An action: put 0–3 planning chips from standby on the three action spaces, either face up.
                         With exactly three chips, a row of your forge whose plant colours read the same left to
                         right pays its row bonus. Then the spaces resolve left to right: a chip does what its face
                         shows, an empty space does what is printed under it (research +1 / base / build).
                         Used chips go to the used pile; when standby is empty they all come back.
              2 mana     in turn order each player runs their plants, puts the mana disc on the track at that value
                         (or lower) and takes its VP and coins.
              3 income   flipped income tiles pay out.   4 salary   pay for the workforce, 1 VP per missing coin.
              5 order    least mana goes first (on a tie the disc on top goes first). Skipped in the final round.
     end      when a round ends with someone on 15+ VP the next round is the last. After its salary the map
              areas, research, full forge columns and objective tiles score. Ties: more mana in the last round,
              then the disc on top.
   State is plain JSON, so it can be saved, cloned and sent over the network. The only randomness is the set-up. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EL_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ pieces */
  var COLORS = {
    G: { name: 'ガイア', short: '緑', hex: '#3e9f62' },
    B: { name: '水', short: '青', hex: '#3a78cf' },
    O: { name: '火', short: '橙', hex: '#e2792d' },
    P: { name: '闇', short: '紫', hex: '#8650c2' },
    W: { name: '虹', short: '虹', hex: '#d9b54a' },
    N: { name: '白', short: '白', hex: '#ebe6da' }
  };
  var ELEMENTS = ['G', 'B', 'O', 'P'];

  // effect atoms: coin gem res work mine water vp env (+n), base, build, cpw (coins = water rights), gpm (gems = mining rights)
  function fx() { return Array.prototype.slice.call(arguments); }
  var C = function (n) { return { t: 'coin', n: n }; }, GM = function (n) { return { t: 'gem', n: n }; },
      R = function (n) { return { t: 'res', n: n }; }, WK = function (n) { return { t: 'work', n: n }; },
      MN = function (n) { return { t: 'mine', n: n }; }, WT = function (n) { return { t: 'water', n: n }; },
      V = function (n) { return { t: 'vp', n: n }; }, EV = function (n) { return { t: 'env', n: n }; };
  var BASE = { t: 'base' }, BUILD = { t: 'build' };
  var BACK = { fx: fx(C(1)) };

  // token types; pc = the copies and the smallest player count each copy is used in
  var TOKEN_TYPES = {
    G_RES: { color: 'G', front: { fx: fx(R(2)) }, pc: [2, 2, 3] },
    G_WORK: { color: 'G', front: { fx: fx(WK(1), R(1)) }, pc: [2, 2, 4] },
    G_ENV: { color: 'G', front: { fx: fx(EV(1), C(1)) }, pc: [2, 3] },
    G_GEM: { color: 'G', front: { fx: fx(GM(1), R(1)) }, pc: [2, 4] },
    B_WATER: { color: 'B', front: { fx: fx(WT(1)), icon: 'water' }, pc: [2, 2, 3] },
    B_CPW: { color: 'B', front: { fx: fx({ t: 'cpw', max: 4 }) }, pc: [2, 2, 4] },
    B_RES: { color: 'B', front: { fx: fx(R(1), C(1)) }, pc: [2, 3] },
    B_WORK: { color: 'B', front: { fx: fx(WK(1), C(1)) }, pc: [2, 4] },
    O_MINE: { color: 'O', front: { fx: fx(MN(1)), icon: 'mine' }, pc: [2, 2, 3] },
    O_GPM: { color: 'O', front: { fx: fx({ t: 'gpm', max: 3 }) }, pc: [2, 2, 4] },
    O_GEM: { color: 'O', front: { fx: fx(GM(2)) }, pc: [2, 3] },
    O_VP: { color: 'O', front: { fx: fx(V(2)), cost: { gem: 3 } }, pc: [2, 4] },
    P_COIN: { color: 'P', front: { fx: fx(C(3)), icon: 'coin' }, pc: [2, 2, 3] },
    P_RES: { color: 'P', front: { fx: fx(R(1), GM(1)) }, pc: [2, 2, 4] },
    P_ENV: { color: 'P', front: { fx: fx(EV(-1), C(2)) }, pc: [2, 3] },
    P_VP: { color: 'P', front: { fx: fx(V(2)), cost: { coin: 4 } }, pc: [2, 4] },
    W_COIN: { color: 'W', front: { fx: fx(C(2)) }, pc: [2, 2, 2, 3] },
    W_MIX: { color: 'W', front: { fx: fx(R(1), GM(1)) }, pc: [2, 2, 2, 4] },
    N_BASE: { color: 'N', front: { fx: fx(BASE) }, pc: [] },
    N_BUILD: { color: 'N', front: { fx: fx(BUILD) }, pc: [] },
    N_COIN: { color: 'N', front: { fx: fx(C(2)) }, pc: [] }
  };
  var WHITE = ['N_BASE', 'N_BUILD', 'N_COIN'];
  // what an empty action space does, left to right
  var SLOT_PRINT = [fx(R(1)), fx(BASE), fx(BUILD)];

  // the 12 plant piles; row = research row needed (1–3)
  var PLANTS = {
    G1: { color: 'G', lv: 1, cost: 3, req: { work: 1 }, env: 1, prod: { k: 'gaia', base: 1 } },
    G2: { color: 'G', lv: 2, cost: 5, req: { work: 3 }, env: 1, prod: { k: 'gaia', base: 2 } },
    G3: { color: 'G', lv: 3, cost: 7, req: { work: 5 }, env: 2, prod: { k: 'gaia', base: 3 } },
    B1: { color: 'B', lv: 1, cost: 3, req: { water: 1 }, env: 0, prod: { k: 'water', cap: 2, flat: 0 } },
    B2: { color: 'B', lv: 2, cost: 5, req: { water: 2, work: 2 }, env: 0, prod: { k: 'water', cap: 3, flat: 1 } },
    B3: { color: 'B', lv: 3, cost: 7, req: { water: 4, work: 4 }, env: 0, prod: { k: 'water', cap: 4, flat: 2 } },
    O1: { color: 'O', lv: 1, cost: 3, req: { mine: 1 }, env: 0, prod: { k: 'fire', gem: 1, mana: 2, uses: 1 } },
    O2: { color: 'O', lv: 2, cost: 5, req: { mine: 2, work: 2 }, env: 0, prod: { k: 'fire', gem: 1, mana: 3, uses: 2 } },
    O3: { color: 'O', lv: 3, cost: 7, req: { mine: 4, work: 4 }, env: 0, prod: { k: 'fire', gem: 1, mana: 4, uses: 2 } },
    P1: { color: 'P', lv: 1, cost: 2, req: { work: 1 }, env: -1, prod: { k: 'dark', coin: 1, mana: 1, uses: 2 } },
    P2: { color: 'P', lv: 2, cost: 4, req: { work: 3 }, env: -1, prod: { k: 'dark', coin: 2, mana: 3, uses: 2 } },
    P3: { color: 'P', lv: 3, cost: 6, req: { work: 5 }, env: -2, prod: { k: 'dark', coin: 2, mana: 4, uses: 2 } }
  };
  var PLANT_KEYS = ['G1', 'G2', 'G3', 'B1', 'B2', 'B3', 'O1', 'O2', 'O3', 'P1', 'P2', 'P3'];
  var PILE = 5;

  var ARTIFACTS = [
    { id: 'A_GB', colors: ['G', 'B'], name: '翠水の聖杯' },
    { id: 'A_GO', colors: ['G', 'O'], name: '芽吹きの炉心' },
    { id: 'A_GP', colors: ['G', 'P'], name: '月影の苗床' },
    { id: 'A_BO', colors: ['B', 'O'], name: '蒸気の心臓' },
    { id: 'A_BP', colors: ['B', 'P'], name: '深淵の水鏡' },
    { id: 'A_OP', colors: ['O', 'P'], name: '黒曜の熾火' }
  ];
  var ARTIFACT_COST = 4, ARTIFACT_REQ = { work: 2 }, ARTIFACT_ROW = 2;

  // personal board: forge area 4 rows x 3 columns (space = row*3+col)
  var FORGE_SPACE = [fx(C(1)), fx(GM(1)), fx(R(1)), fx(WK(1)), fx(C(2)), fx(MN(1)), fx(WT(1)), fx(R(1)), fx(GM(2)), fx(V(1)), fx(C(3)), fx(V(1))];
  var FORGE_ROW = [fx(C(3)), fx(R(2)), fx(GM(2), C(2)), fx(V(3))];
  var FORGE_COL_VP = [3, 4, 5];

  // tracks
  var WORK_MAX = 8, MINE_MAX = 6, WATER_MAX = 6, ENV_MAX = 10, RES_MAX = 15;
  var SALARY = [0, 1, 1, 2, 2, 3, 3, 4, 4]; // by workforce 1..8
  var MINE_HANDS = [2, 4], WATER_HAND = 3;   // flip the gem income tiles / the coin income tile
  var GEM_INCOME = 1, COIN_INCOME = 2;
  var RESEARCH = [null, fx(C(1)), 'objA', fx(GM(1)), fx(WK(1)), fx(C(2)), fx(MN(1)), 'objB', fx(WT(1)), fx(GM(1)),
                  fx(V(1)), fx(C(2)), fx(WK(1)), fx(V(1)), fx(GM(2)), fx(V(1))];
  var RES_ROWS = [0, 5, 10];        // first space of research rows 1..3
  var RES_END = 13, RES_END_VP = 2;  // dark brown area at the end of the track
  // mana track: [vp, coins] for 0..20
  var MANA = [[0, 0], [0, 1], [0, 1], [0, 2], [1, 1], [1, 2], [1, 2], [2, 2], [2, 3], [2, 3], [3, 3], [3, 4], [3, 4], [4, 4],
              [4, 5], [4, 5], [5, 5], [5, 6], [5, 6], [6, 6], [6, 7]];
  var MANA_MAX = 20;
  var END_VP = 15, MAX_ROUNDS = 14;
  var START_COINS = 6, BASES = 15, CUBES = 15;

  /* ------------------------------------------------------------------ the map: a ring of hexes, 3 areas */
  var AREAS = [{ name: '黄', hex: '#e6c34a' }, { name: '緑', hex: '#62b27a' }, { name: '青', hex: '#5f95d8' }];
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // bonus by ring and position in each area (same in all three); x = no chip there
  var LAYOUT = {
    2: [{ fx: fx(GM(2)) }, { fx: fx(R(2)), x: true }, { fx: fx(V(1)) }, { fx: fx(WK(1)) }],
    3: [{ fx: fx(MN(1)), icon: 'mine' }, { fx: fx(C(3)) }, { fx: fx(WT(1)), icon: 'water' }, { fx: fx(V(2)), x: true },
        { fx: fx(GM(1)) }, { fx: fx(R(1)) }],
    4: [{ fx: fx(C(2)), edge2: true }, { fx: fx(WT(1), C(1)), icon: 'water' }, { fx: fx(GM(1)) }, { fx: fx(C(2)) },
        { fx: fx(MN(1), C(1)), icon: 'mine' }, { fx: fx(V(1)) }, { fx: fx(C(2)) }, { fx: fx(GM(1)), edge2: true }]
  };
  var COVER = { 2: [1, 2, 3, 4, 5, 6], 3: [2, 3, 4], 4: [] }; // ring-4 positions covered, per area

  function buildMap(n) {
    var hexes = [];
    for (var k = 2; k <= 4; k++) {
      var h = [DIRS[4][0] * k, DIRS[4][1] * k], idx = 0;
      for (var side = 0; side < 6; side++) {
        for (var j = 0; j < k; j++) {
          var area = Math.floor(side / 2), pos = idx - area * 2 * k, L = LAYOUT[k][pos];
          var covered = k === 4 && COVER[n].indexOf(pos) >= 0;
          var bonus = L.fx.slice();
          if (n === 2 && k === 4 && L.edge2) bonus.push(C(1)); // the ➤ marks on the 2-player cover tiles
          hexes.push({ id: hexes.length, q: h[0], r: h[1], ring: k, area: area, pos: pos, x: !!L.x, icon: L.icon || null,
                       bonus: bonus, covered: covered, token: null, base: null });
          h = [h[0] + DIRS[side][0], h[1] + DIRS[side][1]];
          idx++;
        }
      }
    }
    return hexes;
  }
  var NB_CACHE = {};
  function neighbors(S, id) {
    var key = S.n + ':' + id;
    if (NB_CACHE[key]) return NB_CACHE[key];
    var h = S.hexes[id], out = [];
    for (var d = 0; d < 6; d++) {
      var q = h.q + DIRS[d][0], r = h.r + DIRS[d][1];
      for (var i = 0; i < S.hexes.length; i++) {
        var o = S.hexes[i];
        if (o.q === q && o.r === r && !o.covered) { out.push(i); break; }
      }
    }
    NB_CACHE[key] = out;
    return out;
  }

  /* ------------------------------------------------------------------ scoring tiles */
  // rates: [vp, per] -> floor(count / per) * vp
  var AREA_TILES = [
    { id: 'T1', name: '大集団', text: 'いちばん大きい拠点のかたまりの数', r1: [1, 1], r2: [1, 2] },
    { id: 'T2', name: '一直線', text: '一直線に並んだ拠点の最長の長さ', r1: [1, 1], r2: [1, 2] },
    { id: 'T3', name: '遠征', text: 'ほかの2エリアにある拠点の数', r1: [1, 1], r2: [1, 2] },
    { id: 'T4', name: '点在', text: 'かたまりの数（1個でも1つ）', r1: [1, 1], r2: [1, 2], only: 2 },
    { id: 'T5', name: '連携', text: '2個以上のかたまりの数', r1: [2, 1], r2: [1, 1] },
    { id: 'T6', name: '専門家', text: '同じ色の計画書チップの最大数（虹・白は除く）', r1: [1, 1], r2: [1, 2] },
    { id: 'T7', name: '辺境', text: '外周のマスにある拠点の数', r1: [1, 1], r2: [1, 2] },
    { id: 'T8', name: '三角陣', text: 'ちょうど3個で三角形になったかたまりの数', r1: [4, 1], r2: [2, 1] },
    { id: 'T9', name: '国境', text: '他人の拠点と隣り合う拠点の数（隣の他人の拠点が4個以上のものは除く）', r1: [1, 1], r2: [1, 2], min: 3 }
  ];
  var OBJECTIVES = [
    { id: 'J1', text: 'ガイア（緑）プラント1枚につき1VP' },
    { id: 'J2', text: '水（青）プラント2枚につき3VP' },
    { id: 'J3', text: '火（橙）プラント2枚につき3VP' },
    { id: 'J4', text: '闇（紫）プラント2枚につき3VP' },
    { id: 'J5', text: 'ジェムのボーナスマスにある拠点1つにつき1VP' },
    { id: 'J6', text: 'コインのボーナスマスにある拠点1つにつき1VP' },
    { id: 'J7', text: '採掘権のマスにある拠点2つにつき3VP' },
    { id: 'J8', text: '水利権のマスにある拠点2つにつき3VP' },
    { id: 'J9', text: '単独1位のエリア得点タイル1枚につき3VP' },
    { id: 'J10', text: '持っているジェム3個につき1VP' },
    { id: 'J11', text: '持っているコイン3枚につき1VP' },
    { id: 'J12', text: 'プラント2枚につき1VP' },
    { id: 'J13', text: 'レベルIIのプラント2枚につき3VP' },
    { id: 'J14', text: 'レベルIIIのプラント1枚につき2VP' },
    { id: 'J15', text: '埋まった魔力プラントエリアの行1つにつき3VP' },
    { id: 'J16', text: '除外した計画書チップ3枚につき2VP' },
    { id: 'J17', text: '労働力1につき1VP' },
    { id: 'J18', text: '環境が0〜2なら3VP、3〜7なら6VP、8以上なら9VP' }
  ];
  var MAX_OBJ = 2;

  /* ------------------------------------------------------------------ random (set-up only) */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------ set-up */
  // opts: { players: [{ name, cpu: 0|1|2|3 }], seed, first }
  function newGame(opts) {
    var n = opts.players.length;
    if (n < 2 || n > 4) throw new Error('players: 2–4');
    var seed = (opts.seed >>> 0) || 1, rnd = mulberry32(seed);
    var S = { v: 1, seed: seed, n: n, round: 0, final: null, phase: 'prep', seq: 0, env: 0, log: [], result: null };
    S.hexes = buildMap(n);
    // planning chips on the map
    S.toks = {};
    var pool = [], tid = 0;
    Object.keys(TOKEN_TYPES).forEach(function (type) {
      TOKEN_TYPES[type].pc.forEach(function (pc) {
        if (pc <= n) { var id = 't' + (tid++); S.toks[id] = { id: id, type: type, color: TOKEN_TYPES[type].color }; pool.push(id); }
        else tid++;
      });
    });
    var spots = S.hexes.filter(function (h) { return !h.covered && !h.x; }).map(function (h) { return h.id; });
    if (spots.length !== pool.length) throw new Error('map/token count mismatch ' + spots.length + '/' + pool.length);
    shuffle(pool, rnd);
    for (var tries = 0; tries < 400; tries++) { // a mining/water chip never starts on a hex with the same icon
      var bad = -1;
      for (var i = 0; i < spots.length; i++) if (clash(S, spots[i], pool[i])) { bad = i; break; }
      if (bad < 0) break;
      var j = Math.floor(rnd() * pool.length), t = pool[bad]; pool[bad] = pool[j]; pool[j] = t;
    }
    spots.forEach(function (hid, i) { S.hexes[hid].token = pool[i]; });
    // scoring tiles, objectives, artifact
    var tiles = AREA_TILES.filter(function (t) { return (!t.only || t.only === n) && (!t.min || n >= t.min); }).map(function (t) { return t.id; });
    S.areaTiles = shuffle(tiles, rnd).slice(0, 3);
    var objs = shuffle(OBJECTIVES.map(function (o) { return o.id; }), rnd);
    S.objAreas = [objs.slice(0, n + 1), objs.slice(n + 1, 2 * n + 2)];
    var art = ARTIFACTS[Math.floor(rnd() * ARTIFACTS.length)];
    S.dev = {};
    PLANT_KEYS.forEach(function (k) { S.dev[k] = { left: PILE, cubes: [] }; });
    S.artifact = { id: art.id, cubes: [] };
    // players
    S.players = opts.players.map(function (p, i) {
      var whites = WHITE.map(function (type, w) { var id = 'w' + i + w; S.toks[id] = { id: id, type: type, color: 'N' }; return id; });
      return { name: String(p.name || ('プレイヤー' + (i + 1))).slice(0, 12), cpu: p.cpu | 0, coins: START_COINS, gems: 0, vp: 0,
               work: 1, mine: 0, water: 0, res: 0, standby: whites, used: [], removed: [], action: [null, null, null],
               forge: [null, null, null, null, null, null, null, null, null, null, null, null], gemInc: [false, false], coinInc: false,
               objs: [], bases: BASES, cubes: CUBES, art: false };
    });
    var first = opts.first == null ? Math.floor(rnd() * n) : (opts.first | 0) % n;
    S.order = [];
    for (var s = 0; s < n; s++) S.order.push((first + s) % n);
    S.mana = S.players.map(function () { return { pos: 0, h: 0 }; });
    S.cur = 0; S.left = 0; S.hseq = 0;
    S.prepOrder = S.order.slice().reverse();
    log(S, '準備：手番の逆順に拠点を1つずつ置きます');
    return S;
  }
  function clash(S, hid, tokId) {
    var face = TOKEN_TYPES[S.toks[tokId].type].front;
    return !!face.icon && face.icon === S.hexes[hid].icon && face.icon !== 'coin';
  }

  function log(S, text, pid) {
    S.log.push({ r: S.round, p: pid == null ? -1 : pid, t: text });
    if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
  }

  /* ------------------------------------------------------------------ helpers */
  function face(S, tokId, side) { var T = TOKEN_TYPES[S.toks[tokId].type]; return side === 'b' ? BACK : T.front; }
  function gemPrice(env) { return env <= 2 ? 1 : env <= 7 ? 2 : 3; }
  function envBand(env) { return env <= 2 ? 0 : env <= 7 ? 1 : 2; }
  function resRow(res) { return res >= RES_ROWS[2] ? 3 : res >= RES_ROWS[1] ? 2 : 1; }
  function plantCost(S, key) { return PLANTS[key].cost + S.dev[key].cubes.length * (S.n === 2 ? 2 : 1); }
  function artifactCost(S) { return ARTIFACT_COST + S.artifact.cubes.length * (S.n === 2 ? 2 : 1); }
  function artifactDef(id) { for (var i = 0; i < ARTIFACTS.length; i++) if (ARTIFACTS[i].id === id) return ARTIFACTS[i]; return null; }
  function meetsReq(p, req) { return (p.work >= (req.work || 0)) && (p.mine >= (req.mine || 0)) && (p.water >= (req.water || 0)); }

  function baseCost(S, pid, hid) {
    var cost = 2, pay = [];
    neighbors(S, hid).forEach(function (o) {
      var b = S.hexes[o].base;
      if (b === pid) cost--;
      else if (b != null) pay.push(b);
    });
    if (cost < 0) cost = 0;
    return { supply: cost, rivals: pay, total: cost + pay.length };
  }
  // hexes where pid could put a base now, with the cost
  function legalHexes(S, pid, prep) {
    var p = S.players[pid], out = [];
    if (p.bases <= 0) return out;
    S.hexes.forEach(function (h) {
      if (h.covered || h.base != null) return;
      var c = baseCost(S, pid, h.id);
      if (prep) c = { supply: 2, rivals: c.rivals, total: 2 + c.rivals.length };
      if (c.total <= p.coins) out.push({ hex: h.id, cost: c });
    });
    return out;
  }
  // build targets pid can afford now: { key, cost, art }
  function buildTargets(S, pid) {
    var p = S.players[pid], out = [];
    if (p.cubes <= 0) return out;
    var free = p.forge.filter(function (x) { return x == null; }).length;
    if (!free) return out;
    var row = resRow(p.res);
    PLANT_KEYS.forEach(function (k) {
      var P = PLANTS[k];
      if (S.dev[k].left <= 0 || row < P.lv || !meetsReq(p, P.req)) return;
      var c = plantCost(S, k);
      if (c <= p.coins) out.push({ key: k, cost: c });
    });
    if (!p.art && row >= ARTIFACT_ROW && meetsReq(p, ARTIFACT_REQ) && S.artifact.cubes.indexOf(pid) < 0 && artifactPairs(p).length) {
      var ac = artifactCost(S);
      if (ac <= p.gems) out.push({ key: 'ART', cost: ac, art: true });
    }
    return out;
  }
  // left spaces of free horizontal pairs (for the artifact activation tile)
  function artifactPairs(p) {
    var out = [];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 2; c++) {
      var s = r * 3 + c;
      if (p.forge[s] == null && p.forge[s + 1] == null) out.push(s);
    }
    return out;
  }
  function freeSpaces(p) { var out = []; for (var i = 0; i < 12; i++) if (p.forge[i] == null) out.push(i); return out; }

  // colours a forge space can stand for (null if empty)
  function spaceColors(p, s) {
    var f = p.forge[s];
    if (!f) return null;
    if (f.art) return artifactDef(f.art).colors;
    return [PLANTS[f.key].color];
  }
  function rowFull(p, r) { return p.forge[r * 3] && p.forge[r * 3 + 1] && p.forge[r * 3 + 2]; }
  // rows of the forge whose colours match three chip colours left to right
  function matchRows(p, colors) {
    if (colors.length !== 3) return [];
    var wild = colors.filter(function (c) { return c === 'W'; }).length;
    if (wild > 1 || colors.indexOf('N') >= 0) return [];
    var rows = [];
    for (var r = 0; r < 4; r++) {
      if (!rowFull(p, r)) continue;
      var ok = true;
      for (var c = 0; c < 3; c++) {
        var cs = spaceColors(p, r * 3 + c);
        if (colors[c] !== 'W' && cs.indexOf(colors[c]) < 0) { ok = false; break; }
      }
      if (ok) rows.push(r);
    }
    return rows;
  }

  /* ------------------------------------------------------------------ gaining things */
  // a generator: yields choice requests, returns when the effects are applied
  function* gainFx(S, pid, atoms, why) {
    var p = S.players[pid];
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      switch (a.t) {
        case 'coin': p.coins += a.n; break;
        case 'gem': p.gems += a.n; break;
        case 'vp': p.vp += a.n; break;
        case 'env': S.env = Math.max(0, Math.min(ENV_MAX, S.env + a.n)); break;
        case 'work': trackUp(S, pid, 'work', a.n, WORK_MAX); break;
        case 'mine': trackUp(S, pid, 'mine', a.n, MINE_MAX); break;
        case 'water': trackUp(S, pid, 'water', a.n, WATER_MAX); break;
        case 'cpw': p.coins += Math.max(1, Math.min(p.water, a.max)); break;
        case 'gpm': p.gems += Math.max(1, Math.min(p.mine, a.max)); break;
        case 'res': yield* research(S, pid, a.n); break;
        case 'base': yield* placeBase(S, pid, false); break;
        case 'build': yield* build(S, pid); break;
      }
    }
  }
  function trackUp(S, pid, key, n, max) {
    var p = S.players[pid];
    var to = p[key] + n;
    if (to > max) { p.vp += to - max; to = max; }
    p[key] = to;
    if (key === 'mine') { if (p.mine >= MINE_HANDS[0]) p.gemInc[0] = true; if (p.mine >= MINE_HANDS[1]) p.gemInc[1] = true; }
    if (key === 'water' && p.water >= WATER_HAND) p.coinInc = true;
  }
  function* research(S, pid, n) {
    var p = S.players[pid];
    for (var k = 0; k < n; k++) {
      if (p.res >= RES_MAX) { p.vp += 1; continue; }
      p.res += 1;
      var b = RESEARCH[p.res];
      if (b === 'objA' || b === 'objB') {
        var area = b === 'objA' ? 0 : 1, list = S.objAreas[area];
        if (p.objs.length < MAX_OBJ && list.length) {
          var pick = yield { k: 'obj', pid: pid, area: area, options: list.slice() };
          if (pick != null) {
            var at = list.indexOf(pick);
            if (at < 0) throw new Error('bad objective');
            list.splice(at, 1);
            p.objs.push({ id: pick, dark: false });
            log(S, '目標タイル「' + objDef(pick).text + '」を取った', pid);
          }
        }
      } else if (b) yield* gainFx(S, pid, b, 'research');
    }
  }
  function* placeBase(S, pid, prep) {
    var legal = legalHexes(S, pid, prep);
    if (!legal.length) return;
    var hid = yield { k: 'hex', pid: pid, prep: !!prep, options: legal };
    if (hid == null) { if (prep) throw new Error('prep needs a hex'); return; }
    var opt = null;
    legal.forEach(function (o) { if (o.hex === hid) opt = o; });
    if (!opt) throw new Error('bad hex');
    var p = S.players[pid], h = S.hexes[hid];
    p.coins -= opt.cost.total;
    opt.cost.rivals.forEach(function (o) { S.players[o].coins += 1; });
    p.bases -= 1;
    h.base = pid;
    var got = '';
    if (h.token) { p.used.push(h.token); got = '（計画書チップを獲得）'; h.token = null; }
    log(S, AREAS[h.area].name + 'エリアに拠点を置いた' + got, pid);
    yield* gainFx(S, pid, h.bonus, 'hex');
  }
  function* build(S, pid) {
    var targets = buildTargets(S, pid);
    if (!targets.length) return;
    var p = S.players[pid];
    var pick = yield { k: 'build', pid: pid, options: targets, spaces: freeSpaces(p), pairs: artifactPairs(p) };
    if (pick == null) return;
    var t = null;
    targets.forEach(function (o) { if (o.key === pick.key) t = o; });
    if (!t) throw new Error('bad build');
    var sp = pick.space | 0;
    if (t.art) {
      if (artifactPairs(p).indexOf(sp) < 0) throw new Error('bad artifact space');
      p.gems -= t.cost;
      p.cubes -= 1;
      S.artifact.cubes.push(pid);
      p.art = true;
      p.forge[sp] = { art: S.artifact.id, part: 0 };
      p.forge[sp + 1] = { art: S.artifact.id, part: 1 };
      log(S, 'アーティファクト「' + artifactDef(S.artifact.id).name + '」を建てた', pid);
      yield* gainFx(S, pid, FORGE_SPACE[sp], 'space');
      yield* gainFx(S, pid, FORGE_SPACE[sp + 1], 'space');
      var row = Math.floor(sp / 3);
      if (rowFull(p, row)) { log(S, (row + 1) + '行目がそろった', pid); yield* gainFx(S, pid, FORGE_ROW[row], 'row'); }
      return;
    }
    if (p.forge[sp] != null || sp < 0 || sp > 11) throw new Error('bad space');
    var P = PLANTS[t.key];
    p.coins -= t.cost;
    p.cubes -= 1;
    S.dev[t.key].cubes.push(pid);
    S.dev[t.key].left -= 1;
    if (P.env) S.env = Math.max(0, Math.min(ENV_MAX, S.env + P.env));
    p.forge[sp] = { key: t.key };
    log(S, plantName(t.key) + 'を建てた', pid);
    yield* gainFx(S, pid, FORGE_SPACE[sp], 'space');
    var r = Math.floor(sp / 3);
    if (rowFull(p, r)) { log(S, (r + 1) + '行目がそろった', pid); yield* gainFx(S, pid, FORGE_ROW[r], 'row'); }
  }
  function plantName(key) {
    var P = PLANTS[key];
    return COLORS[P.color].name + 'のプラント' + ['', 'I', 'II', 'III'][P.lv];
  }
  function objDef(id) { for (var i = 0; i < OBJECTIVES.length; i++) if (OBJECTIVES[i].id === id) return OBJECTIVES[i]; return null; }
  function areaDef(id) { for (var i = 0; i < AREA_TILES.length; i++) if (AREA_TILES[i].id === id) return AREA_TILES[i]; return null; }

  /* ------------------------------------------------------------------ whose decision is it */
  function who(S) {
    if (S.phase === 'prep') return { pid: S.prepOrder[S.cur], kind: 'prep' };
    if (S.phase === 'action') return { pid: S.order[S.cur], kind: 'action', left: S.left };
    if (S.phase === 'produce') return { pid: S.order[S.cur], kind: 'produce' };
    return null;
  }

  /* ------------------------------------------------------------------ prep */
  function* prepGen(S, pid) { yield* placeBase(S, pid, true); }

  /* ------------------------------------------------------------------ an action */
  // slots: three entries, each null (use the printed effect), { skip: true } (leave it), or { tok, face: 'f'|'b', skip? }
  function* actionGen(S, pid, slots) {
    var p = S.players[pid];
    if (!slots || slots.length !== 3) throw new Error('slots');
    var placed = [], seen = {};
    slots.forEach(function (s) {
      if (s && s.tok) {
        if (seen[s.tok] || p.standby.indexOf(s.tok) < 0) throw new Error('chip not in standby');
        if (s.face !== 'f' && s.face !== 'b') throw new Error('face');
        seen[s.tok] = 1; placed.push(s.tok);
      }
    });
    var standbyWasEmpty = p.standby.length === 0;
    placed.forEach(function (id) { p.standby.splice(p.standby.indexOf(id), 1); });
    p.action = slots.map(function (s) { return s && s.tok ? { tok: s.tok, face: s.face } : null; });
    // (b) three chips: rows whose colours read the same pay their row bonus
    if (placed.length === 3) {
      var cols = slots.map(function (s) { return S.toks[s.tok].color; });
      var rows = matchRows(p, cols);
      for (var i = 0; i < rows.length; i++) {
        log(S, '計画書の色が' + (rows[i] + 1) + '行目とそろった', pid);
        yield* gainFx(S, pid, FORGE_ROW[rows[i]], 'match');
      }
    }
    // (c) left to right
    for (var k = 0; k < 3; k++) {
      var s = slots[k];
      if (s && s.skip) continue;
      if (s && s.tok) {
        var f = face(S, s.tok, s.face);
        if (f.cost) {
          if (f.cost.coin && p.coins < f.cost.coin) continue;
          if (f.cost.gem && p.gems < f.cost.gem) continue;
          if (f.cost.coin) p.coins -= f.cost.coin;
          if (f.cost.gem) p.gems -= f.cost.gem;
        }
        yield* gainFx(S, pid, f.fx, 'chip');
      } else {
        yield* gainFx(S, pid, SLOT_PRINT[k], 'slot');
      }
    }
    // (d) chips to the used pile; an empty standby takes them all back
    p.action.forEach(function (a) { if (a) p.used.push(a.tok); });
    p.action = [null, null, null];
    if (standbyWasEmpty || p.standby.length === 0) {
      p.standby = p.standby.concat(p.used);
      p.used = [];
      log(S, '計画書チップがすべて手元に戻った', pid);
    }
  }

  /* drive a generator with a chooser(request) -> answer; returns the list of answers given */
  function drive(gen, chooser) {
    var answers = [], r = gen.next();
    while (!r.done) { var a = chooser(r.value); answers.push(a === undefined ? null : a); r = gen.next(a === undefined ? null : a); }
    return answers;
  }
  function replay(list) {
    var i = 0;
    return function () { if (i >= list.length) throw new Error('missing choice'); return list[i++]; };
  }

  /* ------------------------------------------------------------------ mana */
  function waterMana(tiles, water) {
    // tiles: [{ cap, flat }]; flat counts once a tile gets at least 1 water
    var order = tiles.slice().sort(function (a, b) { return b.flat - a.flat; }), left = water, mana = 0, used = order.map(function () { return 0; });
    for (var i = 0; i < order.length && left > 0; i++) if (order[i].flat > 0) { used[i] = 1; left--; }
    for (var j = 0; j < order.length && left > 0; j++) { var add = Math.min(order[j].cap - used[j], left); used[j] += add; left -= add; }
    for (var k = 0; k < order.length; k++) if (used[k] > 0) mana += used[k] + order[k].flat;
    return mana;
  }
  // what a player can make: fixed mana and the paid options
  function produceInfo(S, pid) {
    var p = S.players[pid], fixed = 0, waters = [], fire = [], dark = [], parts = [];
    for (var s = 0; s < 12; s++) {
      var f = p.forge[s];
      if (!f) continue;
      if (f.art) {
        if (f.part !== 0) continue;
        var cols = artifactDef(f.art).colors, cnt = 0;
        p.standby.concat(p.used).forEach(function (id) { if (cols.indexOf(S.toks[id].color) >= 0) cnt++; });
        fixed += cnt; parts.push({ space: s, kind: 'art', mana: cnt });
        continue;
      }
      var P = PLANTS[f.key], pr = P.prod;
      if (pr.k === 'gaia') { var m = pr.base + envBand(S.env); fixed += m; parts.push({ space: s, kind: 'gaia', mana: m }); }
      else if (pr.k === 'water') waters.push({ space: s, cap: pr.cap, flat: pr.flat });
      else if (pr.k === 'fire') fire.push({ space: s, gem: pr.gem, mana: pr.mana, uses: pr.uses });
      else if (pr.k === 'dark') dark.push({ space: s, coin: pr.coin, mana: pr.mana, uses: pr.uses });
    }
    var wm = waterMana(waters, p.water);
    if (waters.length) parts.push({ kind: 'water', mana: wm });
    return { fixed: fixed + wm, water: wm, fire: fire, dark: dark, parts: parts };
  }
  // plan: { fire: [uses per fire tile in produceInfo order], dark: [...], disc }
  function produceResult(S, pid, plan) {
    var p = S.players[pid], info = produceInfo(S, pid), gems = 0, coins = 0, mana = info.fixed;
    plan = plan || {};
    info.fire.forEach(function (t, i) { var u = Math.max(0, Math.min(t.uses, (plan.fire && plan.fire[i]) | 0)); gems += u * t.gem; mana += u * t.mana; });
    info.dark.forEach(function (t, i) { var u = Math.max(0, Math.min(t.uses, (plan.dark && plan.dark[i]) | 0)); coins += u * t.coin; mana += u * t.mana; });
    var ok = gems <= p.gems && coins <= p.coins;
    var total = Math.min(mana, MANA_MAX);
    var disc = plan.disc == null ? total : Math.max(0, Math.min(total, plan.disc | 0));
    return { ok: ok, gems: gems, coins: coins, mana: mana, total: total, disc: disc, vp: MANA[disc][0], gain: MANA[disc][1] };
  }
  function applyProduce(S, pid, plan) {
    var w = who(S);
    if (!w || w.kind !== 'produce' || w.pid !== pid) throw new Error('not your production');
    var r = produceResult(S, pid, plan);
    if (!r.ok) throw new Error('cannot pay');
    var p = S.players[pid];
    p.gems -= r.gems; p.coins -= r.coins;
    p.vp += r.vp; p.coins += r.gain;
    S.mana[pid] = { pos: r.disc, h: ++S.hseq };
    log(S, '魔力' + r.disc + (r.disc < r.total ? '（' + r.total + 'から下げた）' : '') + '：' + r.vp + 'VP・' + r.gain + 'コイン', pid);
    S.seq++;
    S.cur++;
    if (S.cur >= S.n) endOfRound(S);
  }

  /* ------------------------------------------------------------------ free actions */
  function freeOk(S, pid) { var w = who(S); return !!w && w.pid === pid && (w.kind === 'action' || w.kind === 'produce'); }
  function applyFree(S, pid, a) {
    if (!freeOk(S, pid)) throw new Error('not now');
    var p = S.players[pid];
    if (a.k === 'g2c') {
      if (p.gems < 3) throw new Error('gems');
      p.gems -= 3; p.coins += 1; log(S, '3ジェムを1コインにした', pid);
    } else if (a.k === 'buy') {
      var price = gemPrice(S.env);
      if (p.coins < price) throw new Error('coins');
      p.coins -= price; p.gems += 1; log(S, price + 'コインで1ジェムを買った', pid);
    } else if (a.k === 'rm2') {
      if (!a.a || !a.b || a.a === a.b) throw new Error('two chips');
      [a.a, a.b].forEach(function (id) { if (!ownedLoose(p, id) || S.toks[id].color === 'N') throw new Error('chip'); });
      var ca = S.toks[a.a].color, cb = S.toks[a.b].color;
      if (!(ca === cb || ca === 'W' || cb === 'W')) throw new Error('colours');
      removeChip(p, a.a); removeChip(p, a.b);
      log(S, '計画書チップを2枚除外した', pid);
    } else if (a.k === 'flip') {
      var o = p.objs[a.obj | 0];
      if (!o || o.dark) throw new Error('objective');
      if (!ownedLoose(p, a.tok) || S.toks[a.tok].color === 'N') throw new Error('chip');
      o.dark = true; removeChip(p, a.tok);
      log(S, '目標タイルを裏返して計画書チップを1枚除外した', pid);
    } else throw new Error('free action?');
    S.seq++;
  }
  function ownedLoose(p, id) { return p.standby.indexOf(id) >= 0 || p.used.indexOf(id) >= 0; }
  function removeChip(p, id) {
    var i = p.standby.indexOf(id);
    if (i >= 0) p.standby.splice(i, 1); else p.used.splice(p.used.indexOf(id), 1);
    p.removed.push(id);
  }

  /* ------------------------------------------------------------------ applying moves */
  function applyPrep(S, pid, hex) {
    var w = who(S);
    if (!w || w.kind !== 'prep' || w.pid !== pid) throw new Error('not your prep');
    drive(prepGen(S, pid), function (req) { if (req.k === 'hex') return hex; return null; });
    S.seq++;
    S.cur++;
    if (S.cur >= S.n) startRound(S);
  }
  function applyAction(S, pid, move) {
    var w = who(S);
    if (!w || w.kind !== 'action' || w.pid !== pid) throw new Error('not your action');
    drive(actionGen(S, pid, move.slots), replay(move.choices || []));
    S.seq++;
    S.left--;
    if (S.left <= 0) {
      S.cur++;
      if (S.cur >= S.n) { S.phase = 'produce'; S.cur = 0; log(S, '魔力生産フェイズ'); }
      else S.left = actionsPerTurn(S);
    }
  }
  function actionsPerTurn(S) { return S.round === 1 ? 1 : 2; }
  function startRound(S) {
    S.round += 1;
    S.phase = 'action';
    S.cur = 0;
    S.left = actionsPerTurn(S);
    log(S, (S.round === S.final ? '最終ラウンド' : 'ラウンド' + S.round) + '開始');
  }
  function endOfRound(S) {
    // income
    S.players.forEach(function (p) {
      var g = (p.gemInc[0] ? GEM_INCOME : 0) + (p.gemInc[1] ? GEM_INCOME : 0), c = p.coinInc ? COIN_INCOME : 0;
      p.gems += g; p.coins += c;
    });
    // salary
    S.players.forEach(function (p, i) {
      var due = SALARY[p.work], paid = Math.min(due, p.coins);
      p.coins -= paid;
      if (paid < due) { p.vp -= due - paid; log(S, '給料が' + (due - paid) + 'コイン足りず、' + (due - paid) + 'VPを失った', i); }
    });
    if (S.final === S.round || S.round >= MAX_ROUNDS) { finish(S); return; }
    // turn order: less mana first; on a tie the disc on top (placed later) goes first
    S.order = S.order.slice().sort(function (a, b) { return S.mana[a].pos - S.mana[b].pos || S.mana[b].h - S.mana[a].h; });
    if (S.final == null && S.players.some(function (p) { return p.vp >= END_VP; })) {
      S.final = S.round + 1;
      log(S, '誰かが' + END_VP + 'VPに届いたので、次が最終ラウンド');
    }
    startRound(S);
  }

  /* ------------------------------------------------------------------ the map, counted */
  function clusters(S, pid) {
    var seen = {}, out = [];
    S.hexes.forEach(function (h) {
      if (h.base !== pid || seen[h.id]) return;
      var stack = [h.id], group = [];
      seen[h.id] = 1;
      while (stack.length) {
        var c = stack.pop(); group.push(c);
        neighbors(S, c).forEach(function (o) { if (!seen[o] && S.hexes[o].base === pid) { seen[o] = 1; stack.push(o); } });
      }
      out.push(group);
    });
    return out;
  }
  function longestLine(S, pid) {
    var best = 0, byQR = {};
    S.hexes.forEach(function (h) { if (h.base === pid) byQR[h.q + ',' + h.r] = 1; });
    Object.keys(byQR).forEach(function (k) {
      var qr = k.split(',').map(Number);
      for (var d = 0; d < 3; d++) {
        var bq = qr[0] - DIRS[d][0], br = qr[1] - DIRS[d][1];
        if (byQR[bq + ',' + br]) continue; // not the start of a run
        var len = 0, q = qr[0], r = qr[1];
        while (byQR[q + ',' + r]) { len++; q += DIRS[d][0]; r += DIRS[d][1]; }
        if (len > best) best = len;
      }
    });
    return best;
  }
  function isTriangle(S, group) {
    if (group.length !== 3) return false;
    var a = neighbors(S, group[0]), b = neighbors(S, group[1]);
    return a.indexOf(group[1]) >= 0 && a.indexOf(group[2]) >= 0 && b.indexOf(group[2]) >= 0;
  }
  function areaCount(S, tileId, pid, area) {
    var p = S.players[pid];
    switch (tileId) {
      case 'T1': return clusters(S, pid).reduce(function (m, g) { return Math.max(m, g.length); }, 0);
      case 'T2': return longestLine(S, pid);
      case 'T3': return S.hexes.filter(function (h) { return h.base === pid && h.area !== area; }).length;
      case 'T4': return clusters(S, pid).length;
      case 'T5': return clusters(S, pid).filter(function (g) { return g.length >= 2; }).length;
      case 'T6': {
        var cnt = { G: 0, B: 0, O: 0, P: 0 };
        p.standby.concat(p.used).forEach(function (id) { var c = S.toks[id].color; if (cnt[c] != null) cnt[c]++; });
        return Math.max(cnt.G, cnt.B, cnt.O, cnt.P);
      }
      case 'T7': return S.hexes.filter(function (h) { return h.base === pid && h.ring === 4; }).length;
      case 'T8': return clusters(S, pid).filter(function (g) { return isTriangle(S, g); }).length;
      case 'T9': return S.hexes.filter(function (h) {
        if (h.base !== pid) return false;
        var rivals = neighbors(S, h.id).filter(function (o) { var b = S.hexes[o].base; return b != null && b !== pid; }).length;
        return rivals >= 1 && rivals <= 3;
      }).length;
    }
    return 0;
  }
  function rate(count, r) { return Math.floor(count / r[1]) * r[0]; }
  // map points per area: [{ area, tile, rows: [{ pid, count, vp, rank }] }]
  function areaScores(S) {
    return S.areaTiles.map(function (tid, area) {
      var T = areaDef(tid), rows = [];
      S.players.forEach(function (p, pid) {
        var here = S.hexes.some(function (h) { return h.base === pid && h.area === area; });
        rows.push({ pid: pid, count: here ? areaCount(S, tid, pid, area) : 0, eligible: here, vp: 0, rank: 0 });
      });
      var el = rows.filter(function (x) { return x.eligible && x.count > 0; }).sort(function (a, b) { return b.count - a.count; });
      if (el.length) {
        var top = el[0].count, firsts = el.filter(function (x) { return x.count === top; });
        if (firsts.length > 1) firsts.forEach(function (x) { x.vp = rate(x.count, T.r2); x.rank = 1; });
        else {
          firsts[0].vp = rate(firsts[0].count, T.r1); firsts[0].rank = 1; firsts[0].sole = true;
          var rest = el.filter(function (x) { return x.count < top; });
          if (rest.length) {
            var sec = rest[0].count, seconds = rest.filter(function (x) { return x.count === sec; });
            if (seconds.length === 1) { seconds[0].vp = rate(sec, T.r2); seconds[0].rank = 2; }
          }
        }
      }
      return { area: area, tile: tid, rows: rows };
    });
  }

  /* ------------------------------------------------------------------ objectives and the final count */
  function plantsOf(p) {
    var list = [];
    p.forge.forEach(function (f) { if (f && !f.art) list.push(PLANTS[f.key]); });
    return list;
  }
  function objectiveVp(S, pid, id, areas, artColor) {
    var p = S.players[pid], plants = plantsOf(p), ownHex = S.hexes.filter(function (h) { return h.base === pid; });
    function colorCount(c) { return plants.filter(function (x) { return x.color === c; }).length + (artColor === c ? 1 : 0); }
    function hexWith(t) { return ownHex.filter(function (h) { return h.bonus.some(function (a) { return a.t === t; }); }).length; }
    switch (id) {
      case 'J1': return colorCount('G');
      case 'J2': return Math.floor(colorCount('B') / 2) * 3;
      case 'J3': return Math.floor(colorCount('O') / 2) * 3;
      case 'J4': return Math.floor(colorCount('P') / 2) * 3;
      case 'J5': return hexWith('gem');
      case 'J6': return hexWith('coin');
      case 'J7': return Math.floor(hexWith('mine') / 2) * 3;
      case 'J8': return Math.floor(hexWith('water') / 2) * 3;
      case 'J9': return (areas || areaScores(S)).filter(function (a) { return a.rows[pid].sole; }).length * 3;
      case 'J10': return Math.floor(Math.max(0, p.gems) / 3);
      case 'J11': return Math.floor(Math.max(0, p.coins) / 3);
      case 'J12': return Math.floor((plants.length + (p.art ? 1 : 0)) / 2);
      case 'J13': return Math.floor(plants.filter(function (x) { return x.lv === 2; }).length / 2) * 3;
      case 'J14': return plants.filter(function (x) { return x.lv === 3; }).length * 2;
      case 'J15': return [0, 1, 2, 3].filter(function (r) { return rowFull(p, r); }).length * 3;
      case 'J16': return Math.floor(p.removed.length / 3) * 2;
      case 'J17': return p.work;
      case 'J18': return S.env <= 2 ? 3 : S.env <= 7 ? 6 : 9;
    }
    return 0;
  }
  function scoreOf(S, pid, areas) {
    var p = S.players[pid];
    areas = areas || areaScores(S);
    var map = areas.reduce(function (s, a) { return s + a.rows[pid].vp; }, 0);
    var res = p.res >= RES_END ? RES_END_VP : 0;
    var cols = 0;
    for (var c = 0; c < 3; c++) if (p.forge[c] && p.forge[3 + c] && p.forge[6 + c] && p.forge[9 + c]) cols += FORGE_COL_VP[c];
    // the artifact counts as one tile of either of its colours: take the better one
    var artColors = [null];
    p.forge.forEach(function (f) { if (f && f.art && f.part === 0) artColors = artifactDef(f.art).colors; });
    var obj = 0, objList = [];
    artColors.forEach(function (ac) {
      var list = p.objs.map(function (o) { return { id: o.id, vp: objectiveVp(S, pid, o.id, areas, ac) }; });
      var sum = list.reduce(function (s, x) { return s + x.vp; }, 0);
      if (sum >= obj || !objList.length) { obj = sum; objList = list; }
    });
    return { pid: pid, game: p.vp, map: map, research: res, columns: cols, objectives: obj, objList: objList,
             total: p.vp + map + res + cols + obj };
  }
  function finish(S) {
    var areas = areaScores(S);
    var rows = S.players.map(function (p, pid) { return scoreOf(S, pid, areas); });
    var rank = rows.slice().sort(function (a, b) {
      return b.total - a.total || S.mana[b.pid].pos - S.mana[a.pid].pos || S.mana[b.pid].h - S.mana[a.pid].h;
    });
    rank.forEach(function (r, i) { r.place = i + 1; });
    S.result = { rows: rows, order: rank.map(function (r) { return r.pid; }), areas: areas };
    S.phase = 'end';
    log(S, 'ゲーム終了：' + S.players[rank[0].pid].name + 'の勝ち（' + rank[0].total + '点）');
  }

  /* ------------------------------------------------------------------ for the screen */
  function fxText(atoms) {
    return atoms.map(function (a) {
      switch (a.t) {
        case 'coin': return 'コイン+' + a.n;
        case 'gem': return 'ジェム+' + a.n;
        case 'res': return '研究+' + a.n;
        case 'work': return '労働力+' + a.n;
        case 'mine': return '採掘権+' + a.n;
        case 'water': return '水利権+' + a.n;
        case 'vp': return a.n + 'VP';
        case 'env': return '環境' + (a.n > 0 ? '+' : '') + a.n;
        case 'base': return '拠点を置く';
        case 'build': return 'プラント建設';
        case 'cpw': return 'コイン＝水利権（最大' + a.max + '）';
        case 'gpm': return 'ジェム＝採掘権（最大' + a.max + '）';
      }
      return '';
    }).join('・');
  }
  function faceText(f) { return (f.cost ? (f.cost.coin ? f.cost.coin + 'コイン' : f.cost.gem + 'ジェム') + '払って' : '') + fxText(f.fx); }
  function tokenText(S, id, side) { return faceText(face(S, id, side)); }
  function prodText(key) {
    var pr = PLANTS[key].prod;
    if (pr.k === 'gaia') return '魔力' + pr.base + '＋環境ボーナス（0〜2）';
    if (pr.k === 'water') return '水利権を最大' + pr.cap + 'まで使い1につき魔力1' + (pr.flat ? '、使えば+' + pr.flat : '');
    if (pr.k === 'fire') return pr.gem + 'ジェム→魔力' + pr.mana + '（' + pr.uses + '回まで）';
    if (pr.k === 'dark') return pr.coin + 'コイン→魔力' + pr.mana + '（' + pr.uses + '回まで）';
    return '';
  }
  function reqText(req) {
    var out = [];
    if (req.work) out.push('労働力' + req.work);
    if (req.mine) out.push('採掘権' + req.mine);
    if (req.water) out.push('水利権' + req.water);
    return out.join('・');
  }

  return {
    COLORS: COLORS, ELEMENTS: ELEMENTS, TOKEN_TYPES: TOKEN_TYPES, SLOT_PRINT: SLOT_PRINT, PLANTS: PLANTS, PLANT_KEYS: PLANT_KEYS,
    ARTIFACTS: ARTIFACTS, ARTIFACT_COST: ARTIFACT_COST, ARTIFACT_REQ: ARTIFACT_REQ, FORGE_SPACE: FORGE_SPACE, FORGE_ROW: FORGE_ROW,
    FORGE_COL_VP: FORGE_COL_VP, SALARY: SALARY, RESEARCH: RESEARCH, RES_ROWS: RES_ROWS, RES_END: RES_END, RES_MAX: RES_MAX,
    MANA: MANA, MANA_MAX: MANA_MAX, AREAS: AREAS, AREA_TILES: AREA_TILES, OBJECTIVES: OBJECTIVES, END_VP: END_VP,
    WORK_MAX: WORK_MAX, MINE_MAX: MINE_MAX, WATER_MAX: WATER_MAX, ENV_MAX: ENV_MAX, MINE_HANDS: MINE_HANDS, WATER_HAND: WATER_HAND,
    MAX_OBJ: MAX_OBJ, BACK: BACK,
    mulberry32: mulberry32, clone: clone, newGame: newGame, who: who, neighbors: neighbors,
    legalHexes: legalHexes, baseCost: baseCost, buildTargets: buildTargets, artifactPairs: artifactPairs, freeSpaces: freeSpaces,
    matchRows: matchRows, rowFull: rowFull, spaceColors: spaceColors, face: face, gemPrice: gemPrice, envBand: envBand, resRow: resRow,
    plantCost: plantCost, artifactCost: artifactCost, artifactDef: artifactDef, objDef: objDef, areaDef: areaDef, meetsReq: meetsReq,
    prepGen: prepGen, actionGen: actionGen, drive: drive, replay: replay,
    applyPrep: applyPrep, applyAction: applyAction, applyProduce: applyProduce, applyFree: applyFree, freeOk: freeOk,
    produceInfo: produceInfo, produceResult: produceResult, waterMana: waterMana,
    areaScores: areaScores, areaCount: areaCount, scoreOf: scoreOf, clusters: clusters, objectiveVp: objectiveVp,
    fxText: fxText, faceText: faceText, tokenText: tokenText, prodText: prodText, reqText: reqText, plantName: plantName,
    actionsPerTurn: actionsPerTurn
  };
});
