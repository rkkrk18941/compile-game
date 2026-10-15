/* ナナフシギ・デュエル — the rules. Pure data in, events out; no DOM here so the CPU worker and node tests share it.
   Rules follow the board game「世界の七不思議：デュエル」(7 Wonders Duel): 3 ages, a draft of 8 wonders,
   military supremacy (pawn reaches a capital), scientific supremacy (6 different symbols), otherwise victory points.

   Seats are 0 and 1. The conflict pawn `mil` runs -9..9: positive means seat 0 is pushing toward seat 1's capital.
   apply(state, seat, action) mutates the state and returns { ok, events }. viewFor(state, seat, omni) is what one
   screen may know: face-down cards and the boxed progress tokens are hidden unless omni (a spectator). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NFD_ENG = api;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RES = ['W', 'C', 'S', 'G', 'P'];
  var RES_NAME = { W: '木材', C: '粘土', S: '石材', G: 'ガラス', P: 'パピルス' };
  var TYPES = ['brown', 'grey', 'blue', 'green', 'red', 'yellow', 'purple'];
  var TYPE_NAME = { brown: '原材料', grey: '加工品', blue: '市民施設', green: '科学施設', red: '軍事施設', yellow: '商業施設', purple: 'ギルド' };
  var SCI = ['globe', 'wheel', 'sundial', 'mortar', 'compass', 'quill', 'law'];
  var SCI_NAME = { globe: '天球', wheel: '車輪', sundial: '日時計', mortar: '乳鉢', compass: 'コンパス', quill: '羽根ペン', law: '天秤' };
  var CHAIN_NAME = { mask: '仮面', moon: '月', drop: 'しずく', book: '本', gear: '歯車', horseshoe: '蹄鉄', sword: '剣', tower: '塔', vase: '壺',
    pillar: '柱', sun: '太陽', bank: '議場', harp: '竪琴', lamp: 'ランプ', target: '的', helmet: '兜', barrel: '樽' };

  /* ---------------------------------------------------------------- cards
     c(name, type, cost, coins, extra). cost letters: W wood, C clay, S stone, G glass, P papyrus. */
  var CARDS = [];
  function c(age, name, type, cost, coins, x) {
    var d = { id: CARDS.length, age: age, name: name, type: type, cost: cost || '', $: coins || 0 };
    for (var k in x) d[k] = x[k];
    CARDS.push(d);
    return d;
  }
  // Age I (23)
  c(1, '製材所', 'brown', '', 0, { prod: 'W' });
  c(1, '伐採所', 'brown', '', 1, { prod: 'W' });
  c(1, '粘土置き場', 'brown', '', 0, { prod: 'C' });
  c(1, '粘土坑', 'brown', '', 1, { prod: 'C' });
  c(1, '採石場', 'brown', '', 0, { prod: 'S' });
  c(1, '石切場', 'brown', '', 1, { prod: 'S' });
  c(1, 'ガラス工房', 'grey', '', 1, { prod: 'G' });
  c(1, '製紙所', 'grey', '', 1, { prod: 'P' });
  c(1, '劇場', 'blue', '', 0, { vp: 3, to: 'mask' });
  c(1, '祭壇', 'blue', '', 0, { vp: 3, to: 'moon' });
  c(1, '浴場', 'blue', 'S', 0, { vp: 3, to: 'drop' });
  c(1, '写字室', 'green', '', 2, { sci: 'quill', to: 'book' });
  c(1, '薬剤師', 'green', '', 2, { sci: 'mortar', to: 'gear' });
  c(1, '工房', 'green', 'P', 0, { sci: 'compass', vp: 1 });
  c(1, '薬屋', 'green', 'G', 0, { sci: 'wheel', vp: 1 });
  c(1, '厩舎', 'red', 'W', 0, { sh: 1, to: 'horseshoe' });
  c(1, '駐屯地', 'red', 'C', 0, { sh: 1, to: 'sword' });
  c(1, '柵', 'red', '', 2, { sh: 1, to: 'tower' });
  c(1, '見張り塔', 'red', '', 0, { sh: 1 });
  c(1, '石の備蓄', 'yellow', '', 3, { trade: 'S' });
  c(1, '粘土の備蓄', 'yellow', '', 3, { trade: 'C' });
  c(1, '木材の備蓄', 'yellow', '', 3, { trade: 'W' });
  c(1, '酒場', 'yellow', '', 0, { gain: 4, to: 'vase' });
  // Age II (23)
  c(2, '製材工場', 'brown', '', 2, { prod: 'WW' });
  c(2, 'レンガ工場', 'brown', '', 2, { prod: 'CC' });
  c(2, '段丘採石場', 'brown', '', 2, { prod: 'SS' });
  c(2, 'ガラス吹き場', 'grey', '', 0, { prod: 'G' });
  c(2, '乾燥室', 'grey', '', 0, { prod: 'P' });
  c(2, '法廷', 'blue', 'WWG', 0, { vp: 5 });
  c(2, '彫像', 'blue', 'CC', 0, { vp: 4, from: 'mask', to: 'pillar' });
  c(2, '神殿', 'blue', 'WP', 0, { vp: 4, from: 'moon', to: 'sun' });
  c(2, '水道橋', 'blue', 'SSS', 0, { vp: 5, from: 'drop' });
  c(2, '演壇', 'blue', 'SW', 0, { vp: 4, to: 'bank' });
  c(2, '図書館', 'green', 'SWG', 0, { sci: 'quill', vp: 2, from: 'book' });
  c(2, '診療所', 'green', 'CCS', 0, { sci: 'mortar', vp: 2, from: 'gear' });
  c(2, '学校', 'green', 'WPP', 0, { sci: 'wheel', vp: 1, to: 'harp' });
  c(2, '研究所', 'green', 'WGG', 0, { sci: 'compass', vp: 1, to: 'lamp' });
  c(2, '馬の牧場', 'red', 'CW', 0, { sh: 1, from: 'horseshoe' });
  c(2, '兵舎', 'red', '', 3, { sh: 1, from: 'sword' });
  c(2, '射撃場', 'red', 'SWP', 0, { sh: 2, to: 'target' });
  c(2, '練兵場', 'red', 'CCG', 0, { sh: 2, to: 'helmet' });
  c(2, '城壁', 'red', 'SS', 0, { sh: 2 });
  c(2, '公共広場', 'yellow', 'C', 3, { choice: 'GP' });
  c(2, '隊商宿', 'yellow', 'GP', 2, { choice: 'WCS' });
  c(2, '税関', 'yellow', '', 4, { trade: 'GP' });
  c(2, '醸造所', 'yellow', '', 0, { gain: 6, to: 'barrel' });
  // Age III (20)
  c(3, '宮殿', 'blue', 'CSWGG', 0, { vp: 7 });
  c(3, '市庁舎', 'blue', 'SSSWW', 0, { vp: 7 });
  c(3, 'オベリスク', 'blue', 'SSG', 0, { vp: 5 });
  c(3, '庭園', 'blue', 'CCWW', 0, { vp: 6, from: 'pillar' });
  c(3, 'パンテオン', 'blue', 'CWPP', 0, { vp: 6, from: 'sun' });
  c(3, '元老院', 'blue', 'CCSP', 0, { vp: 5, from: 'bank' });
  c(3, 'アカデミー', 'green', 'SWGG', 0, { sci: 'sundial', vp: 3 });
  c(3, '書斎', 'green', 'WWGP', 0, { sci: 'sundial', vp: 3 });
  c(3, '大学', 'green', 'CGP', 0, { sci: 'globe', vp: 2, from: 'harp' });
  c(3, '天文台', 'green', 'SPP', 0, { sci: 'globe', vp: 2, from: 'lamp' });
  c(3, '要塞', 'red', 'SSCP', 0, { sh: 2, from: 'tower' });
  c(3, '攻城兵器工房', 'red', 'WWWG', 0, { sh: 2, from: 'target' });
  c(3, 'サーカス', 'red', 'CCSS', 0, { sh: 2, from: 'helmet' });
  c(3, '兵器庫', 'red', 'CCCWW', 0, { sh: 3 });
  c(3, '近衛兵舎', 'red', '', 8, { sh: 3 });
  c(3, '商工会議所', 'yellow', 'PP', 0, { vp: 3, per: 'grey', each: 3 });
  c(3, '港', 'yellow', 'WGP', 0, { vp: 3, per: 'brown', each: 2 });
  c(3, '武器庫', 'yellow', 'SSG', 0, { vp: 3, per: 'red', each: 1 });
  c(3, '灯台', 'yellow', 'CCG', 0, { vp: 3, per: 'yellow', each: 1, from: 'vase' });
  c(3, '闘技場', 'yellow', 'CSW', 0, { vp: 3, per: 'wonder', each: 2, from: 'barrel' });
  // Guilds (7, three of them join Age III)
  c(4, '商人ギルド', 'purple', 'CWGP', 0, { guild: 'yellow' });
  c(4, '船主ギルド', 'purple', 'CSGP', 0, { guild: 'raw' });
  c(4, '建築家ギルド', 'purple', 'SSCWG', 0, { guild: 'wonder' });
  c(4, '執政官ギルド', 'purple', 'WWCP', 0, { guild: 'blue' });
  c(4, '科学者ギルド', 'purple', 'CCWW', 0, { guild: 'green' });
  c(4, '金貸しギルド', 'purple', 'SSWW', 0, { guild: 'money' });
  c(4, '戦術家ギルド', 'purple', 'SSCP', 0, { guild: 'red' });

  /* ---------------------------------------------------------------- wonders */
  var WONDERS = [
    { name: 'アッピア街道', short: '街道', cost: 'SSCCP', vp: 3, gain: 3, steal: 3, again: true, art: 'road' },
    { name: 'チルコ・マッシモ', short: '大競技場', cost: 'SSWG', vp: 3, sh: 1, destroy: 'grey', art: 'circus' },
    { name: 'ロドスの巨像', short: '巨像', cost: 'CCCG', vp: 3, sh: 2, art: 'colossus' },
    { name: '大図書館', short: '図書館', cost: 'WWWGP', vp: 4, library: true, art: 'library' },
    { name: 'ファロスの大灯台', short: '大灯台', cost: 'WSPP', vp: 4, choice: 'WCS', art: 'lighthouse' },
    { name: '空中庭園', short: '空中庭園', cost: 'WWGP', vp: 3, gain: 6, again: true, art: 'gardens' },
    { name: 'マウソロス霊廟', short: '霊廟', cost: 'CCGGP', vp: 2, mausoleum: true, art: 'mausoleum' },
    { name: 'ピレウス港', short: '港', cost: 'WWSC', vp: 2, choice: 'GP', again: true, art: 'harbor' },
    { name: 'ギザの大ピラミッド', short: 'ピラミッド', cost: 'SSSP', vp: 9, art: 'pyramids' },
    { name: 'スフィンクス', short: 'スフィンクス', cost: 'SCGG', vp: 6, again: true, art: 'sphinx' },
    { name: 'オリンピアのゼウス像', short: 'ゼウス像', cost: 'SWCPP', vp: 3, sh: 1, destroy: 'brown', art: 'zeus' },
    { name: 'アルテミス神殿', short: 'アルテミス', cost: 'WSGP', vp: 0, gain: 12, again: true, art: 'artemis' }
  ];
  WONDERS.forEach(function (w, i) { w.id = i; });

  /* ---------------------------------------------------------------- progress tokens */
  var T = { AGRI: 0, ARCH: 1, ECON: 2, LAW: 3, MASON: 4, MATH: 5, PHILO: 6, STRAT: 7, THEO: 8, URBAN: 9 };
  var TOKENS = [
    { name: '農業', icon: 'agri', text: '6コインを得る。勝利点4。' },
    { name: '建築学', icon: 'arch', text: 'これから建てる不思議のコストが資源2つ分安くなる。' },
    { name: '経済', icon: 'econ', text: '相手が交易で払うコインを、自分がもらう。' },
    { name: '法律', icon: 'law', text: '科学シンボル「天秤」を1つ得る。' },
    { name: '石工術', icon: 'mason', text: 'これから建てる市民施設（青）のコストが資源2つ分安くなる。' },
    { name: '数学', icon: 'math', text: 'ゲーム終了時、持っている進歩トークン1つにつき勝利点3（これも含む）。' },
    { name: '哲学', icon: 'philo', text: '勝利点7。' },
    { name: '戦略', icon: 'strat', text: 'これから建てる軍事施設（赤）の盾が1つ増える。' },
    { name: '神学', icon: 'theo', text: 'これから建てる不思議すべてに「もう一度手番」がつく。' },
    { name: '都市計画', icon: 'urban', text: '6コインを得る。以後、連鎖で無料建設するたびに4コイン。' }
  ];
  TOKENS.forEach(function (t, i) { t.id = i; });

  /* ---------------------------------------------------------------- layouts (x in half-card steps; row 0 is the far one) */
  function rowsOf(counts) { return counts.map(function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i - (n - 1) / 2); return a; }); }
  var LAYOUTS = {
    1: { rows: rowsOf([2, 3, 4, 5, 6]), up: [1, 0, 1, 0, 1] },
    2: { rows: rowsOf([6, 5, 4, 3, 2]), up: [1, 0, 1, 0, 1] },
    3: { rows: [[-0.5, 0.5], [-1, 0, 1], [-1.5, -0.5, 0.5, 1.5], [-1, 1], [-1.5, -0.5, 0.5, 1.5], [-1, 0, 1], [-0.5, 0.5]], up: [1, 0, 1, 0, 1, 0, 1] }
  };

  /* ---------------------------------------------------------------- rng kept in the state so clones replay identically */
  function rnd(st) {
    var a = (st.rs = (st.rs + 0x6D2B79F5) | 0);
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd(st) * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function range(a, b) { var r = []; for (var i = a; i < b; i++) r.push(i); return r; }

  /* ---------------------------------------------------------------- setup */
  function newGame(seed, opts) {
    opts = opts || {};
    var st = { v: 1, rs: (seed >>> 0) || 1, age: 0, phase: 'draft', active: 0, first: 0, mil: 0,
      loot: { a3: true, a6: true, b3: true, b6: true },
      p: [{ coins: 7, cards: [], wonders: [], tok: [] }, { coins: 7, cards: [], wonders: [], tok: [] }],
      slots: [], decks: {}, boardTok: [], boxTok: [], discard: [], draft: null, built: 0, removedW: [], outW: [],
      pend: null, queue: [], again: false, turnDone: false, last: -1, result: null, turn: 0 };
    for (var i = 0; i < 3; i++) rnd(st);
    st.first = opts.first === 0 || opts.first === 1 ? opts.first : (rnd(st) < 0.5 ? 0 : 1);
    st.active = st.first;
    var a1 = shuffle(st, range(0, 23)), a2 = shuffle(st, range(23, 46)), a3 = shuffle(st, range(46, 66)), g = shuffle(st, range(66, 73));
    st.decks[1] = a1.slice(0, 20);
    st.decks[2] = a2.slice(0, 20);
    st.decks[3] = shuffle(st, a3.slice(0, 17).concat(g.slice(0, 3)));
    var toks = shuffle(st, range(0, 10));
    st.boardTok = toks.slice(0, 5);
    st.boxTok = toks.slice(5);
    var ws = shuffle(st, range(0, 12));
    var F = st.first, O = 1 - F;
    st.draft = { pool: ws.slice(0, 4), next: ws.slice(4, 8), order: [F, O, O, F, O, F, F, O], i: 0 };
    st.removedW = ws.slice(8);   // never seen this game
    return st;
  }

  function dealAge(st, age, ev) {
    var L = LAYOUTS[age], deck = st.decks[age].slice(), k = 0;
    st.age = age;
    st.slots = [];
    L.rows.forEach(function (row, r) {
      row.forEach(function (x) { st.slots.push({ row: r, x: x, card: deck[k++], up: !!L.up[r], taken: false }); });
    });
    computeCovers(st);
    if (ev) ev.push({ t: 'age', age: age });
  }
  function computeCovers(st) {
    st.slots.forEach(function (s) {
      s.cov = [];
      st.slots.forEach(function (o, j) { if (o.row === s.row + 1 && Math.abs(o.x - s.x) === 0.5) s.cov.push(j); });
    });
  }
  function accessible(st, i) {
    var s = st.slots[i];
    if (!s || s.taken) return false;
    for (var j = 0; j < s.cov.length; j++) if (!st.slots[s.cov[j]].taken) return false;
    return true;
  }
  function accessibleSlots(st) { var r = []; for (var i = 0; i < st.slots.length; i++) if (accessible(st, i)) r.push(i); return r; }

  /* ---------------------------------------------------------------- city helpers (work on states and views alike) */
  function countType(pl, type) {
    var n = 0;
    for (var i = 0; i < pl.cards.length; i++) if (CARDS[pl.cards[i]].type === type) n++;
    return n;
  }
  function builtWonders(pl) { var n = 0; pl.wonders.forEach(function (w) { if (w.card >= 0) n++; }); return n; }
  function hasTok(pl, t) { return pl.tok.indexOf(t) >= 0; }
  function production(pl) {
    var fixed = { W: 0, C: 0, S: 0, G: 0, P: 0 }, choices = [], trade = {};
    pl.cards.forEach(function (id) {
      var d = CARDS[id];
      if (d.prod) for (var i = 0; i < d.prod.length; i++) fixed[d.prod[i]]++;
      if (d.choice) choices.push(d.choice);
      if (d.trade) for (var j = 0; j < d.trade.length; j++) trade[d.trade[j]] = true;
    });
    pl.wonders.forEach(function (w) { if (w.card >= 0 && WONDERS[w.w].choice) choices.push(WONDERS[w.w].choice); });
    return { fixed: fixed, choices: choices, trade: trade };
  }
  /* what one unit of each resource costs this seat at the bank: 2 + what the opponent's brown/grey cards make,
     or 1 with the matching yellow reserve */
  function prices(st, seat) {
    var me = production(st.p[seat]), op = production(st.p[1 - seat]), r = {};
    RES.forEach(function (k) { r[k] = me.trade[k] ? 1 : 2 + op.fixed[k]; });
    return r;
  }
  function chainFree(pl, d) {
    if (!d.from) return false;
    for (var i = 0; i < pl.cards.length; i++) if (CARDS[pl.cards[i]].to === d.from) return true;
    return false;
  }
  /* the cheapest way to pay `cost` (letters) with `coins`: returns { coins, trade, buy: {res: n} } */
  function payment(st, seat, cost, coins, discount) {
    var pl = st.p[seat], pr = production(pl), price = prices(st, seat);
    var need = { W: 0, C: 0, S: 0, G: 0, P: 0 };
    for (var i = 0; i < cost.length; i++) need[cost[i]]++;
    var short = {}, anyShort = false;
    RES.forEach(function (k) { short[k] = Math.max(0, need[k] - pr.fixed[k]); if (short[k]) anyShort = true; });
    var best = null;
    var ch = pr.choices.filter(function (o) { for (var q = 0; q < o.length; q++) if (short[o[q]]) return true; return false; });
    function finish(sh) {
      var units = [];
      RES.forEach(function (k) { for (var n = 0; n < sh[k]; n++) units.push(k); });
      units.sort(function (a, b) { return price[b] - price[a]; });
      var buy = {}, tr = 0;
      for (var u = discount || 0; u < units.length; u++) { tr += price[units[u]]; buy[units[u]] = (buy[units[u]] || 0) + 1; }
      if (!best || tr < best.trade) best = { trade: tr, buy: buy };
    }
    if (!anyShort) best = { trade: 0, buy: {} };
    else (function rec(i, sh) {
      if (i === ch.length) { finish(sh); return; }
      rec(i + 1, sh);
      var o = ch[i];
      for (var q = 0; q < o.length; q++) if (sh[o[q]] > 0) { sh[o[q]]--; rec(i + 1, sh); sh[o[q]]++; }
    })(0, short);
    return { coins: (coins || 0) + best.trade, trade: best.trade, buy: best.buy };
  }
  /* price of building a card: { coins, trade, chain, ok } */
  function cardCost(st, seat, id) {
    var d = CARDS[id], pl = st.p[seat];
    if (chainFree(pl, d)) return { coins: 0, trade: 0, chain: true, ok: true, buy: {} };
    var pay = payment(st, seat, d.cost, d.$, d.type === 'blue' && hasTok(pl, T.MASON) ? 2 : 0);
    pay.ok = pay.coins <= pl.coins;
    return pay;
  }
  function wonderCost(st, seat, w) {
    var pl = st.p[seat], pay = payment(st, seat, WONDERS[w].cost, 0, hasTok(pl, T.ARCH) ? 2 : 0);
    pay.ok = pay.coins <= pl.coins;
    return pay;
  }
  function discardValue(pl) { return 2 + countType(pl, 'yellow'); }
  function sciCounts(pl) {
    var n = {};
    pl.cards.forEach(function (id) { var s = CARDS[id].sci; if (s) n[s] = (n[s] || 0) + 1; });
    if (hasTok(pl, T.LAW)) n.law = (n.law || 0) + 1;
    return n;
  }
  function distinctSci(pl) { return Object.keys(sciCounts(pl)).length; }

  /* ---------------------------------------------------------------- scoring */
  function milVP(mil, seat) {
    var m = seat === 0 ? mil : -mil;
    if (m <= 0) return 0;
    return m >= 6 ? 10 : m >= 3 ? 5 : 2;
  }
  function guildVP(st, seat, d) {
    var a = st.p[0], b = st.p[1], mx = function (f) { return Math.max(f(a), f(b)); };
    switch (d.guild) {
      case 'yellow': case 'blue': case 'green': case 'red': return mx(function (p) { return countType(p, d.guild); });
      case 'raw': return mx(function (p) { return countType(p, 'brown') + countType(p, 'grey'); });
      case 'wonder': return 2 * mx(builtWonders);
      case 'money': return Math.floor(mx(function (p) { return p.coins; }) / 3);
    }
    return 0;
  }
  function score(st) {
    return [0, 1].map(function (seat) {
      var pl = st.p[seat], s = { blue: 0, green: 0, yellow: 0, guild: 0, wonder: 0, tok: 0, mil: milVP(st.mil, seat), coin: Math.floor(pl.coins / 3) };
      pl.cards.forEach(function (id) {
        var d = CARDS[id];
        if (d.type === 'purple') s.guild += guildVP(st, seat, d);
        else if (d.vp && s[d.type] !== undefined) s[d.type] += d.vp;
      });
      pl.wonders.forEach(function (w) { if (w.card >= 0) s.wonder += WONDERS[w.w].vp; });
      pl.tok.forEach(function (t) { if (t === T.AGRI) s.tok += 4; if (t === T.PHILO) s.tok += 7; if (t === T.MATH) s.tok += 3 * pl.tok.length; });
      s.total = s.blue + s.green + s.yellow + s.guild + s.wonder + s.tok + s.mil + s.coin;
      return s;
    });
  }

  /* ---------------------------------------------------------------- effects */
  function gain(st, seat, n, ev, why) {
    if (!n) return;
    st.p[seat].coins += n;
    ev.push({ t: 'coins', seat: seat, d: n, why: why || '' });
  }
  function lose(st, seat, n, ev, why) {
    var x = Math.min(n, st.p[seat].coins);
    if (!x) return;
    st.p[seat].coins -= x;
    ev.push({ t: 'coins', seat: seat, d: -x, why: why || '' });
  }
  function military(st, seat, sh, ev) {
    if (!sh) return;
    var dir = seat === 0 ? 1 : -1, from = st.mil, to = Math.max(-9, Math.min(9, from + dir * sh));
    st.mil = to;
    ev.push({ t: 'mil', seat: seat, from: from, to: to, sh: sh });
    var opp = 1 - seat;
    [[3, 2], [6, 5]].forEach(function (z) {
      var key = (seat === 0 ? 'a' : 'b') + z[0];
      var crossed = seat === 0 ? (from < z[0] && to >= z[0]) : (from > -z[0] && to <= -z[0]);
      if (crossed && st.loot[key]) {
        st.loot[key] = false;
        var x = Math.min(z[1], st.p[opp].coins);
        st.p[opp].coins -= x;
        ev.push({ t: 'loot', seat: opp, by: seat, key: key, amount: z[1], lost: x });
      }
    });
    if (Math.abs(to) >= 9 && !st.result) st.result = { winner: seat, how: 'military' };
  }
  function science(st, seat, sym, ev) {
    var n = sciCounts(st.p[seat]);
    ev.push({ t: 'sci', seat: seat, sym: sym, n: n[sym] });
    if (sym !== 'law' && n[sym] === 2 && st.boardTok.length) st.queue.push({ k: 'progress', seat: seat });
    if (Object.keys(n).length >= 6 && !st.result) st.result = { winner: seat, how: 'science' };
  }
  function cityMax(st, f) { return Math.max(f(st.p[0]), f(st.p[1])); }
  function construct(st, seat, id, ev, how) {
    var d = CARDS[id], pl = st.p[seat];
    pl.cards.push(id);
    ev.push({ t: 'build', seat: seat, card: id, how: how || 'build' });
    if (d.gain) gain(st, seat, d.gain, ev, d.name);
    if (d.per) {
      var n = d.per === 'wonder' ? builtWonders(pl) : countType(pl, d.per);
      gain(st, seat, n * d.each, ev, d.name);
    }
    if (d.guild && d.guild !== 'wonder' && d.guild !== 'money') {
      var m = d.guild === 'raw' ? cityMax(st, function (p) { return countType(p, 'brown') + countType(p, 'grey'); }) : cityMax(st, function (p) { return countType(p, d.guild); });
      gain(st, seat, m, ev, d.name);
    }
    if (d.sh) military(st, seat, d.sh + (hasTok(pl, T.STRAT) ? 1 : 0), ev);
    if (d.sci) science(st, seat, d.sci, ev);
  }
  function takeToken(st, seat, t, ev, how) {
    var pl = st.p[seat];
    pl.tok.push(t);
    ev.push({ t: 'token', seat: seat, tok: t, how: how || 'board' });
    if (t === T.AGRI || t === T.URBAN) gain(st, seat, 6, ev, TOKENS[t].name);
    if (t === T.LAW) science(st, seat, 'law', ev);
  }
  function revealUncovered(st, ev) {
    for (var i = 0; i < st.slots.length; i++) {
      var s = st.slots[i];
      if (!s.taken && !s.up && accessible(st, i)) { s.up = true; ev.push({ t: 'reveal', slot: i, card: s.card }); }
    }
  }
  function takeSlot(st, seat, i) { st.slots[i].taken = true; st.last = seat; st.turnDone = true; st.turn++; }

  /* ---------------------------------------------------------------- legal moves */
  function wondersOpen(st) { return st.built < 7; }
  function actions(st, seat) {
    var out = [];
    if (st.phase === 'over') return out;
    var P = st.pend;
    if (P) {
      if (P.seat !== seat) return out;
      (P.opts || []).forEach(function (o) {
        if (P.k === 'progress') out.push({ k: 'progress', tok: o });
        else if (P.k === 'library') out.push({ k: 'library', tok: o });
        else if (P.k === 'destroy') out.push({ k: 'destroy', card: o });
        else if (P.k === 'mausoleum') out.push({ k: 'mausoleum', card: o });
        else if (P.k === 'start') out.push({ k: 'start', who: o });
      });
      return out;
    }
    if (st.active !== seat) return out;
    if (st.phase === 'draft') { st.draft.pool.forEach(function (w) { out.push({ k: 'draft', w: w }); }); return out; }
    var pl = st.p[seat];
    accessibleSlots(st).forEach(function (i) {
      var id = st.slots[i].card;
      if (id == null) return;
      if (cardCost(st, seat, id).ok) out.push({ k: 'build', slot: i });
      out.push({ k: 'discard', slot: i });
      if (wondersOpen(st)) pl.wonders.forEach(function (w) { if (w.card < 0 && wonderCost(st, seat, w.w).ok) out.push({ k: 'wonder', slot: i, w: w.w }); });
    });
    return out;
  }

  /* ---------------------------------------------------------------- apply */
  function fail(why) { return { ok: false, why: why, events: [] }; }
  function apply(st, seat, a) {
    if (!a || st.phase === 'over') return fail('over');
    var ev = [], P = st.pend;
    if (P) {
      if (P.seat !== seat || a.k !== P.k) return fail('turn');
      var o = a.k === 'start' ? a.who : a.k === 'progress' || a.k === 'library' ? a.tok : a.card;
      if ((P.opts || []).indexOf(o) < 0) return fail('option');
      st.pend = null;
      resolvePending(st, seat, P, o, ev);
      advance(st, ev);
      return { ok: true, events: ev };
    }
    if (seat !== st.active) return fail('turn');
    if (a.k === 'draft') {
      var D = st.draft, wi = D.pool.indexOf(a.w);
      if (st.phase !== 'draft' || wi < 0) return fail('draft');
      D.pool.splice(wi, 1);
      st.p[seat].wonders.push({ w: a.w, card: -1 });
      ev.push({ t: 'draft', seat: seat, w: a.w });
      D.i++;
      if (D.i === 4) { D.pool = D.next; D.next = []; ev.push({ t: 'draftPool', pool: D.pool.slice() }); }
      if (D.i >= 8) {
        st.phase = 'play';
        st.draft = null;
        dealAge(st, 1, ev);
        st.active = st.first;
        ev.push({ t: 'turn', seat: st.active });
      } else {
        st.active = D.order[D.i];
        ev.push({ t: 'turn', seat: st.active });
      }
      return { ok: true, events: ev };
    }
    if (st.phase !== 'play') return fail('phase');
    if (!accessible(st, a.slot)) return fail('slot');
    var id = st.slots[a.slot].card, pl = st.p[seat], opp = st.p[1 - seat];
    if (a.k === 'build') {
      var cost = cardCost(st, seat, id);
      if (!cost.ok) return fail('cost');
      takeSlot(st, seat, a.slot);
      ev.push({ t: 'take', seat: seat, slot: a.slot, card: id, how: 'build' });
      if (cost.coins) { pl.coins -= cost.coins; ev.push({ t: 'coins', seat: seat, d: -cost.coins, why: '建設' }); }
      if (cost.trade && hasTok(opp, T.ECON)) gain(st, 1 - seat, cost.trade, ev, '経済');
      if (cost.chain) { ev.push({ t: 'chain', seat: seat, card: id }); if (hasTok(pl, T.URBAN)) gain(st, seat, 4, ev, '都市計画'); }
      construct(st, seat, id, ev, 'build');
    } else if (a.k === 'discard') {
      takeSlot(st, seat, a.slot);
      ev.push({ t: 'take', seat: seat, slot: a.slot, card: id, how: 'discard' });
      st.discard.push(id);
      gain(st, seat, discardValue(pl), ev, '売却');
    } else if (a.k === 'wonder') {
      var ww = null;
      pl.wonders.forEach(function (w) { if (w.w === a.w && w.card < 0) ww = w; });
      if (!ww || !wondersOpen(st)) return fail('wonder');
      var wc = wonderCost(st, seat, a.w);
      if (!wc.ok) return fail('cost');
      takeSlot(st, seat, a.slot);
      ev.push({ t: 'take', seat: seat, slot: a.slot, card: id, how: 'wonder', w: a.w });
      if (wc.coins) { pl.coins -= wc.coins; ev.push({ t: 'coins', seat: seat, d: -wc.coins, why: '不思議' }); }
      if (wc.trade && hasTok(opp, T.ECON)) gain(st, 1 - seat, wc.trade, ev, '経済');
      ww.card = id;
      st.built++;
      var W = WONDERS[a.w];
      ev.push({ t: 'wonder', seat: seat, w: a.w });
      if (W.gain) gain(st, seat, W.gain, ev, W.name);
      if (W.steal) lose(st, 1 - seat, W.steal, ev, W.name);
      if (W.sh) military(st, seat, W.sh, ev);
      if (W.destroy) {
        var opts = opp.cards.filter(function (c2) { return CARDS[c2].type === W.destroy; });
        if (opts.length) st.queue.push({ k: 'destroy', seat: seat, opts: opts });
      }
      if (W.library && st.boxTok.length) {
        var pick = shuffle(st, st.boxTok.slice()).slice(0, 3);
        st.queue.push({ k: 'library', seat: seat, opts: pick });
      }
      if (W.mausoleum && st.discard.length) st.queue.push({ k: 'mausoleum', seat: seat });
      if (W.again || hasTok(pl, T.THEO)) { st.again = true; ev.push({ t: 'again', seat: seat }); }
      if (st.built >= 7) {
        [0, 1].forEach(function (s2) {
          st.p[s2].wonders = st.p[s2].wonders.filter(function (w) {
            if (w.card < 0) { st.outW.push(w.w); ev.push({ t: 'wonderOut', seat: s2, w: w.w }); return false; }
            return true;
          });
        });
      }
    } else return fail('kind');
    revealUncovered(st, ev);
    advance(st, ev);
    return { ok: true, events: ev };
  }
  function resolvePending(st, seat, P, o, ev) {
    if (P.k === 'progress') {
      st.boardTok.splice(st.boardTok.indexOf(o), 1);
      takeToken(st, seat, o, ev, 'board');
    } else if (P.k === 'library') {
      P.opts.forEach(function (t) { st.boxTok.splice(st.boxTok.indexOf(t), 1); });
      takeToken(st, seat, o, ev, 'library');
    } else if (P.k === 'destroy') {
      var opp = st.p[1 - seat];
      opp.cards.splice(opp.cards.indexOf(o), 1);
      st.discard.push(o);
      ev.push({ t: 'destroy', seat: 1 - seat, by: seat, card: o });
    } else if (P.k === 'mausoleum') {
      st.discard.splice(st.discard.indexOf(o), 1);
      ev.push({ t: 'revive', seat: seat, card: o });
      construct(st, seat, o, ev, 'mausoleum');
    } else if (P.k === 'start') {
      st.active = o;
      st.phase = 'play';
      ev.push({ t: 'turn', seat: o, first: true });
    }
  }
  function advance(st, ev) {
    for (;;) {
      if (st.result) { finishGame(st, ev); return; }
      if (st.queue.length) {
        var q = st.queue.shift();
        if (q.k === 'progress') q.opts = st.boardTok.slice();
        if (q.k === 'mausoleum') q.opts = st.discard.slice();
        if (!q.opts || !q.opts.length) continue;
        st.pend = q;
        ev.push({ t: 'pend', k: q.k, seat: q.seat });
        return;
      }
      if (!st.turnDone) return;
      st.turnDone = false;
      if (st.slots.every(function (s) { return s.taken; })) { endAge(st, ev); return; }
      if (!st.again) st.active = 1 - st.active;
      st.again = false;
      ev.push({ t: 'turn', seat: st.active });
      return;
    }
  }
  function endAge(st, ev) {
    st.again = false;
    if (st.age >= 3) {
      var s = score(st), w = s[0].total > s[1].total ? 0 : s[1].total > s[0].total ? 1 : s[0].blue > s[1].blue ? 0 : s[1].blue > s[0].blue ? 1 : -1;
      st.result = { winner: w, how: 'civil', score: s, tie: s[0].total === s[1].total };
      finishGame(st, ev);
      return;
    }
    ev.push({ t: 'ageEnd', age: st.age });
    var chooser = st.mil > 0 ? 1 : st.mil < 0 ? 0 : st.last;
    dealAge(st, st.age + 1, ev);
    st.phase = 'start';
    st.pend = { k: 'start', seat: chooser, opts: [chooser, 1 - chooser] };
    ev.push({ t: 'pend', k: 'start', seat: chooser });
  }
  function finishGame(st, ev) {
    if (st.phase === 'over') return;
    st.phase = 'over';
    st.pend = null;
    st.queue = [];
    if (!st.result.score) st.result.score = score(st);
    ev.push({ t: 'end', result: st.result });
  }

  /* ---------------------------------------------------------------- views */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function viewFor(st, seat, omni) {
    var v = clone(st);
    delete v.rs; delete v.decks; delete v.queue;
    if (!omni) v.removedW = [];
    v.boxN = st.boxTok.length;
    if (!omni) v.boxTok = [];
    v.slots.forEach(function (s, i) {
      s.guild = s.card != null && CARDS[s.card].type === 'purple';
      if (!s.up && !omni) s.card = null;
    });
    if (v.pend && v.pend.k === 'library' && !omni && v.pend.seat !== seat) v.pend.opts = v.pend.opts.map(function () { return -1; });
    if (v.draft) { v.draft.nextN = st.draft.next.length; if (!omni) v.draft.next = []; }
    v.omni = !!omni;
    v.me = seat;
    v.scores = score(st);
    return v;
  }

  /* ---------------------------------------------------------------- text */
  function resText(s) { var o = {}, out = []; for (var i = 0; i < s.length; i++) o[s[i]] = (o[s[i]] || 0) + 1; RES.forEach(function (k) { if (o[k]) out.push(RES_NAME[k] + (o[k] > 1 ? '×' + o[k] : '')); }); return out.join('・'); }
  function costText(cost, coins) {
    var t = [];
    if (coins) t.push(coins + 'コイン');
    if (cost) t.push(resText(cost));
    return t.length ? t.join('＋') : '無料';
  }
  function cardText(id) {
    var d = CARDS[id], t = [];
    if (d.prod) t.push(resText(d.prod) + 'を産出');
    if (d.choice) t.push('毎手番 ' + d.choice.split('').map(function (k) { return RES_NAME[k]; }).join('か') + 'を1つ産出（交易価格には影響しない）');
    if (d.trade) t.push(d.trade.split('').map(function (k) { return RES_NAME[k]; }).join('と') + 'を1コインで買える');
    if (d.sh) t.push('盾' + d.sh + '（軍事コマを' + d.sh + 'マス進める）');
    if (d.sci) t.push('科学シンボル「' + SCI_NAME[d.sci] + '」');
    if (d.gain) t.push(d.gain + 'コインを得る');
    if (d.per) t.push((d.per === 'wonder' ? '建てた不思議' : TYPE_NAME[d.per] + '（' + typeColorName(d.per) + '）') + '1つにつき' + d.each + 'コイン');
    if (d.guild) t.push(guildText(d.guild));
    if (d.vp) t.push('勝利点' + d.vp);
    if (d.from) t.push('「' + CHAIN_NAME[d.from] + '」を持っていれば無料で建設');
    if (d.to) t.push('連鎖シンボル「' + CHAIN_NAME[d.to] + '」');
    return t;
  }
  function typeColorName(t) { return { brown: '茶', grey: '灰', blue: '青', green: '緑', red: '赤', yellow: '黄', purple: '紫' }[t]; }
  function guildText(g) {
    switch (g) {
      case 'yellow': return '建設時、商業施設（黄）が多い方の都市の枚数だけコイン。終了時、同じく1枚につき勝利点1';
      case 'raw': return '建設時、茶＋灰が多い方の都市の枚数だけコイン。終了時、同じく1枚につき勝利点1';
      case 'wonder': return '終了時、建てた不思議が多い方の都市の不思議1つにつき勝利点2';
      case 'blue': return '建設時、市民施設（青）が多い方の都市の枚数だけコイン。終了時、同じく1枚につき勝利点1';
      case 'green': return '建設時、科学施設（緑）が多い方の都市の枚数だけコイン。終了時、同じく1枚につき勝利点1';
      case 'money': return '終了時、コインが多い方の都市の3コインにつき勝利点1';
      case 'red': return '建設時、軍事施設（赤）が多い方の都市の枚数だけコイン。終了時、同じく1枚につき勝利点1';
    }
    return '';
  }
  function wonderText(w) {
    var W = WONDERS[w], t = [];
    if (W.gain) t.push(W.gain + 'コインを得る');
    if (W.steal) t.push('相手は' + W.steal + 'コイン失う');
    if (W.sh) t.push('盾' + W.sh);
    if (W.destroy) t.push('相手の' + TYPE_NAME[W.destroy] + '（' + typeColorName(W.destroy) + '）1枚を捨てさせる');
    if (W.library) t.push('ゲームから除かれた進歩トークン3つを引き、1つを得る');
    if (W.mausoleum) t.push('捨て札から1枚選んで無料で建設');
    if (W.choice) t.push('毎手番 ' + W.choice.split('').map(function (k) { return RES_NAME[k]; }).join('か') + 'を1つ産出');
    if (W.again) t.push('もう一度手番');
    if (W.vp) t.push('勝利点' + W.vp);
    return t;
  }

  return {
    RES: RES, RES_NAME: RES_NAME, TYPES: TYPES, TYPE_NAME: TYPE_NAME, SCI: SCI, SCI_NAME: SCI_NAME, CHAIN_NAME: CHAIN_NAME,
    CARDS: CARDS, WONDERS: WONDERS, TOKENS: TOKENS, T: T, LAYOUTS: LAYOUTS,
    newGame: newGame, apply: apply, actions: actions, viewFor: viewFor, clone: clone, score: score, mulberry32: mulberry32,
    accessible: accessible, accessibleSlots: accessibleSlots, cardCost: cardCost, wonderCost: wonderCost, prices: prices,
    production: production, countType: countType, builtWonders: builtWonders, hasTok: hasTok, discardValue: discardValue,
    sciCounts: sciCounts, distinctSci: distinctSci, milVP: milVP, chainFree: chainFree,
    costText: costText, resText: resText, cardText: cardText, wonderText: wonderText, typeColorName: typeColorName
  };
});
