/* スカルキング — the rules. No DOM: the page, the CPU worker and the Node tests all load this file.
   Rules follow the Grandpa Beck's Games edition of Skull King (2021–, 2〜8人, 74枚). See RULES.md for the sources and
   for the rulings this file implements. The whole state is plain JSON, so it can be saved and sent online.

   Cards are numbers 0–73:
     0–55  数字カード  suit = floor(id / 14) → y 宝箱(黄) / p 地図(紫) / g オウム(緑) / k 海賊旗(黒・切り札), number = id % 14 + 1
     56–60 逃走 ×5     61–65 海賊 ×5 (ロージー, ベント, ラスカル, フアニータ, ハリー)   66 ティグレス   67 スカルキング
     68–69 マーメイド ×2   70 クラーケン   71 白クジラ   72–73 略奪品 ×2
   newGame(cfg) → state.  actors(st) → seats that must act now.  legal(st, seat) / isLegal(st, seat, a) / apply(st, seat, a).
   view(st, seat) → what that seat may know (the page and the CPUs only ever see views). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SK_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================ cards */
  var SUITS = ['y', 'p', 'g', 'k'];
  var SUIT = {
    y: { ja: '宝箱', color: '黄', en: 'Treasure Chest' },
    p: { ja: '地図', color: '紫', en: 'Treasure Map' },
    g: { ja: 'オウム', color: '緑', en: 'Parrot' },
    k: { ja: '海賊旗', color: '黒', en: 'Jolly Roger' }
  };
  var PIRATES = [
    { key: 'rosie', ja: 'ロージー', full: 'ロージー・ディレイニー', en: "Rosie D'Laney", ab: '次のトリックを始める人を決める' },
    { key: 'bendt', ja: 'ベント', full: '盗賊ベント', en: 'Bendt the Bandit', ab: '山札から2枚引き、手札から2枚捨てる' },
    { key: 'rascal', ja: 'ラスカル', full: 'ロアタンのラスカル', en: 'Rascal of Roatan', ab: '0・10・20点のどれかを賭ける' },
    { key: 'juanita', ja: 'フアニータ', full: 'フアニータ・ジェイド', en: 'Juanita Jade', ab: '配られなかったカードをこっそり見る' },
    { key: 'harry', ja: 'ハリー', full: '巨人ハリー', en: 'Harry the Giant', ab: 'ビッドを1増やすか1減らす（そのままでもよい）' }
  ];
  var ESCAPES = [56, 57, 58, 59, 60], PIRATE_IDS = [61, 62, 63, 64, 65];
  var TIGRESS = 66, KING = 67, MERMAIDS = [68, 69], KRAKEN = 70, WHALE = 71, LOOTS = [72, 73];
  var TYPE_JA = { num: '数字', escape: '逃走', pirate: '海賊', tigress: 'ティグレス', king: 'スカルキング', mermaid: 'マーメイド', kraken: 'クラーケン', whale: '白クジラ', loot: '略奪品' };

  var CARDS = [];
  SUITS.forEach(function (s, si) {
    for (var n = 1; n <= 14; n++) CARDS.push({ id: si * 14 + n - 1, t: 'num', s: s, n: n, ja: SUIT[s].ja + 'の' + n, short: SUIT[s].color + n });
  });
  ESCAPES.forEach(function (id) { CARDS[id] = { id: id, t: 'escape', ja: '逃走', short: '逃走' }; });
  PIRATE_IDS.forEach(function (id, i) { var p = PIRATES[i]; CARDS[id] = { id: id, t: 'pirate', key: p.key, name: p.full, ja: '海賊（' + p.ja + '）', short: p.ja }; });
  CARDS[TIGRESS] = { id: TIGRESS, t: 'tigress', ja: 'ティグレス', short: 'ティグレス' };
  CARDS[KING] = { id: KING, t: 'king', ja: 'スカルキング', short: 'スカルキング' };
  MERMAIDS.forEach(function (id) { CARDS[id] = { id: id, t: 'mermaid', ja: 'マーメイド', short: 'マーメイド' }; });
  CARDS[KRAKEN] = { id: KRAKEN, t: 'kraken', ja: 'クラーケン', short: 'クラーケン' };
  CARDS[WHALE] = { id: WHALE, t: 'whale', ja: '白クジラ', short: '白クジラ' };
  LOOTS.forEach(function (id) { CARDS[id] = { id: id, t: 'loot', ja: '略奪品', short: '略奪品' }; });

  function card(id) { return CARDS[id]; }
  function isNum(id) { return id >= 0 && id < 56; }
  function suitOf(id) { return isNum(id) ? SUITS[Math.floor(id / 14)] : null; }

  /* ================================================================ options and round schedules */
  var SCHEDULES = {
    standard: { ja: 'ふつう', note: '1枚から10枚まで、10ラウンド', cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    even: { ja: '波おだやか', note: '2・2・4・4・6・6・8・8・10・10枚', cards: [2, 2, 4, 4, 6, 6, 8, 8, 10, 10] },
    brawl: { ja: 'いきなり大乱闘', note: '6・7・8・9・10枚の5ラウンド', cards: [6, 7, 8, 9, 10] },
    swift: { ja: 'さくっと小競り合い', note: '5枚を5ラウンド', cards: [5, 5, 5, 5, 5] },
    broadside: { ja: '一斉砲撃', note: '10枚を10ラウンド', cards: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10] },
    whirlpool: { ja: '大渦', note: '9・9・7・7・5・5・3・3・1・1枚', cards: [9, 9, 7, 7, 5, 5, 3, 3, 1, 1] },
    bedtime: { ja: '寝る前の1回', note: '1枚を1ラウンドだけ', cards: [1] }
  };
  var SCHEDULE_KEYS = ['standard', 'even', 'brawl', 'swift', 'broadside', 'whirlpool', 'bedtime'];

  function normOpts(o, n) {
    o = o || {};
    return {
      kraken: !!o.kraken,
      whale: !!o.whale,
      loot: !!o.loot && n > 2,           // 2人（白ひげの幽霊）では略奪品を使わない
      abilities: !!o.abilities,
      scoring: o.scoring === 'rascal' ? 'rascal' : 'classic',
      cannon: o.scoring === 'rascal' && !!o.cannon,
      schedule: SCHEDULES[o.schedule] ? o.schedule : 'standard'
    };
  }
  function deckFor(opts) {
    var d = [];
    for (var i = 0; i < 70; i++) d.push(i);
    if (opts.kraken) d.push(KRAKEN);
    if (opts.whale) d.push(WHALE);
    if (opts.loot) d.push(LOOTS[0], LOOTS[1]);
    return d;
  }
  // Every player always gets the same number of cards: with many players the last rounds repeat the largest count
  // the deck allows (8 players, 70 cards → rounds 9 and 10 are dealt 8 each).
  function scheduleFor(opts, n) {
    var hands = n === 2 ? 3 : n;
    var cap = Math.floor(deckFor(opts).length / hands);
    return SCHEDULES[opts.schedule].cards.map(function (c) { return Math.min(c, cap); });
  }

  /* ================================================================ random numbers (seeded, stored in the state) */
  function rnd(st) {
    var t = (st.rng = (st.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffleWith(arr, next) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  /* ================================================================ tricks
     A play is { seat, id, as } — as is 'pirate' or 'escape' for the Tigress. */
  function eff(p) {
    var c = CARDS[p.id];
    if (c.t === 'tigress') return p.as === 'pirate' ? 'pirate' : 'escape';
    if (c.t === 'loot') return 'escape';          // 略奪品は逃走と同じように扱う
    return c.t;
  }
  // The suit to follow. A trick led by a character or a beast has none. After an escape-like lead (逃走・逃走のティグレス・
  // 略奪品) the first numbered card played sets it; special cards played before that pass the choice on.
  function leadSuit(plays) {
    if (!plays.length) return null;
    var f = eff(plays[0]);
    if (f === 'pirate' || f === 'king' || f === 'mermaid' || f === 'kraken' || f === 'whale') return null;
    for (var i = 0; i < plays.length; i++) if (isNum(plays[i].id)) return suitOf(plays[i].id);
    return null;
  }
  // Must follow suit with a numbered card if you can; special cards may always be played instead.
  function legalCards(hand, plays) {
    var ls = leadSuit(plays);
    if (ls === null) return hand.slice();
    var has = hand.some(function (id) { return suitOf(id) === ls; });
    if (!has) return hand.slice();
    return hand.filter(function (id) { return !isNum(id) || suitOf(id) === ls; });
  }

  // Index of the winning play when no beast is active (a beast that lost its power counts as an escape).
  function normalWinner(plays) {
    var king = -1, mer = -1, pir = -1, i, t;
    for (i = 0; i < plays.length; i++) {
      t = eff(plays[i]);
      if (t === 'king' && king < 0) king = i;
      else if (t === 'mermaid' && mer < 0) mer = i;
      else if (t === 'pirate' && pir < 0) pir = i;
    }
    if (king >= 0) return mer >= 0 ? mer : king;     // マーメイドだけがスカルキングを捕らえる（海賊がいても）
    if (pir >= 0) return pir;                        // 海賊どうしは先に出した方
    if (mer >= 0) return mer;                        // マーメイドどうしも先に出した方
    var ls = null, best = -1, bestTrump = -1;
    for (i = 0; i < plays.length; i++) {
      var id = plays[i].id;
      if (!isNum(id)) continue;
      var s = suitOf(id), n = id % 14 + 1;
      if (ls === null) ls = s;
      if (s === 'k') { if (bestTrump < 0 || n > plays[bestTrump].id % 14 + 1) bestTrump = i; }
      else if (s === ls) { if (best < 0 || n > plays[best].id % 14 + 1) best = i; }
    }
    if (bestTrump >= 0) return bestTrump;
    if (best >= 0) return best;
    return 0;                                         // 全員が逃走なら最初に出した人
  }

  // Resolve a (possibly partial) trick.
  //   { kind: 'win', winner: playIndex, whale: bool, next: seat }   the winner takes the trick
  //   { kind: 'kraken', winner: -1, next: seat }                     destroyed; the would-be winner leads next
  //   { kind: 'void', winner: -1, next: seat }                       白クジラ with only special cards: discarded
  function resolve(plays) {
    var ki = -1, wi = -1, i;
    for (i = 0; i < plays.length; i++) {
      var t = CARDS[plays[i].id].t;
      if (t === 'kraken') ki = i; else if (t === 'whale') wi = i;
    }
    var active = null;
    if (ki >= 0 && wi >= 0) active = ki > wi ? 'kraken' : 'whale';   // 後から出た方だけが効く
    else if (ki >= 0) active = 'kraken';
    else if (wi >= 0) active = 'whale';
    if (active === 'kraken') {
      var rest = plays.filter(function (p, j) { return j !== ki && j !== wi; });   // 2匹とも出なかったとしたら
      var w = rest.length ? normalWinner(rest) : -1;
      return { kind: 'kraken', winner: -1, whale: false, next: w >= 0 ? rest[w].seat : plays[ki].seat, beast: ki };
    }
    if (active === 'whale') {
      var best = -1;
      for (i = 0; i < plays.length; i++) {
        if (!isNum(plays[i].id)) continue;
        if (best < 0 || plays[i].id % 14 > plays[best].id % 14) best = i;      // スートは関係なく数字だけ。同じなら先
      }
      if (best < 0) return { kind: 'void', winner: -1, whale: true, next: plays[wi].seat, beast: wi };
      return { kind: 'win', winner: best, whale: true, next: plays[best].seat, beast: wi };
    }
    var nw = normalWinner(plays);
    return { kind: 'win', winner: nw, whale: false, next: plays[nw].seat, beast: -1 };
  }

  // Bonus points the winner banks (paid only if the bid comes true) and the loot alliances the trick forms.
  function trickBonus(plays, res) {
    var out = { list: [], alliances: [] };
    if (res.kind !== 'win') return out;
    var wp = plays[res.winner];
    plays.forEach(function (p) {
      if (isNum(p.id) && p.id % 14 === 13) out.list.push({ k: '14', id: p.id, pts: suitOf(p.id) === 'k' ? 20 : 10 });
    });
    if (res.whale) return out;                         // 白クジラの効いたトリックでは特殊カードは力を失う
    var wt = eff(wp);
    plays.forEach(function (p) {
      var t = eff(p);
      if (wt === 'pirate' && t === 'mermaid') out.list.push({ k: 'mermaid', id: p.id, pts: 20 });
      else if (wt === 'king' && t === 'pirate') out.list.push({ k: 'pirate', id: p.id, pts: 30 });
      else if (wt === 'mermaid' && t === 'king') out.list.push({ k: 'king', id: p.id, pts: 40 });
      if (CARDS[p.id].t === 'loot' && p.seat !== wp.seat) out.alliances.push({ a: p.seat, b: wp.seat, id: p.id });
    });
    return out;
  }

  // Play order of a trick. With two players 白ひげの幽霊 (seat 2) always plays second; when he leads, the player who led the
  // round's first trick plays second.
  function orderFrom(g, leader) {
    var o = [], i;
    if (g.ghost) {
      if (leader === 2) return [2, g.roundLeader, 1 - g.roundLeader];
      return [leader, 2, 1 - leader];
    }
    for (i = 0; i < g.n; i++) o.push((leader + i) % g.n);
    return o;
  }

  /* ================================================================ scoring */
  // r = { bid, won, cards, bonus (sum of banked bonus points), loot (alliances whose two members both hit), wager, cannon }
  function roundScore(r, opts) {
    var hit = r.won === r.bid, diff = Math.abs(r.won - r.bid);
    var base, bonus, factor;
    if (opts.scoring === 'rascal') {
      var pot = 10 * r.cards;
      if (r.cannon) { base = hit ? 15 * r.cards : 0; factor = hit ? 1 : 0; }
      else { base = diff === 0 ? pot : diff === 1 ? pot / 2 : 0; factor = diff === 0 ? 1 : diff === 1 ? 0.5 : 0; }
      bonus = r.bonus * factor;
    } else {
      if (r.bid === 0) base = hit ? 10 * r.cards : -10 * r.cards;
      else base = hit ? 20 * r.bid : -10 * diff;
      bonus = hit ? r.bonus : 0;
    }
    var loot = hit ? 20 * (r.loot || 0) : 0;
    var wager = r.wager ? (hit ? r.wager : -r.wager) : 0;
    return { hit: hit, diff: diff, base: base, bonus: bonus, loot: loot, wager: wager, total: base + bonus + loot + wager };
  }

  /* ================================================================ the game */
  function zeros(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v === undefined ? 0 : v); return a; }
  function makeGid() { var s = ''; for (var i = 0; i < 8; i++) s += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]; return s; }

  function newGame(cfg) {
    var players = (cfg.players || []).map(function (p) { return { name: String((p && p.name) || '').slice(0, 12) }; });
    var n = players.length;
    if (n < 2 || n > 8) throw new Error('players must be 2..8');
    var opts = normOpts(cfg.opts, n);
    var seed = (cfg.seed == null ? Math.floor(Math.random() * 4294967296) : cfg.seed) >>> 0;
    var st = {
      v: 1, gid: cfg.gid || makeGid(), seed: seed, rng: seed,
      n: n, ghost: n === 2, G: n === 2 ? 2 : -1, opts: opts, schedule: scheduleFor(opts, n), players: players,
      scores: zeros(n), history: [], round: -1, firstLeader: 0,
      phase: 'bid', over: false, ranking: null, log: [], k: 0, seq: 0
    };
    st.firstLeader = cfg.first != null && cfg.first >= 0 && cfg.first < n ? cfg.first | 0 : Math.floor(rnd(st) * n);
    startRound(st);
    return st;
  }

  function addLog(st, e) { e.k = ++st.k; st.log.push(e); }

  function startRound(st) {
    st.round++;
    var n = st.n, cards = st.schedule[st.round];
    var deck = shuffleWith(deckFor(st.opts), function () { return rnd(st); });
    var hc = n + (st.ghost ? 1 : 0);
    st.hands = [];
    for (var h = 0; h < hc; h++) st.hands.push(deck.splice(0, cards));
    st.deck = deck;                                 // 配られなかったカード（ベントが引き、フアニータが見る）
    st.cards = cards;
    st.bids = zeros(n, null); st.cannon = zeros(n, null);
    st.won = zeros(n); st.ghostWon = 0;
    st.bonus = []; for (var i = 0; i < n; i++) st.bonus.push([]);
    st.alliances = []; st.wager = zeros(n, null); st.harry = zeros(n); st.seen = zeros(n, null); st.out = [];
    st.outBy = []; for (i = 0; i < n; i++) st.outBy.push([]);
    st.played = []; st.tricks = []; st.lastTrick = null;
    st.roundLeader = st.ghost ? (st.firstLeader + st.round) % 2 : (st.firstLeader + st.round) % n;
    st.trick = null; st.turn = -1; st.ability = null; st.tricksDone = 0;
    st.phase = 'bid';
    addLog(st, { t: 'deal', round: st.round, cards: cards, leader: st.roundLeader });
  }

  function actors(st) {
    if (st.over) return [];
    if (st.phase === 'bid') { var a = []; for (var i = 0; i < st.n; i++) if (st.bids[i] === null) a.push(i); return a; }
    if (st.phase === 'play') return st.turn >= 0 && st.turn !== st.G ? [st.turn] : [];
    if (st.phase === 'ability' && st.ability) return [st.ability.seat];
    return [];
  }

  function combos(arr, k) {
    var out = [];
    (function rec(start, cur) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (var i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return out;
  }

  function harryChoices(st, seat) {
    var out = [];
    [-1, 0, 1].forEach(function (d) { var b = st.bids[seat] + d; if (b >= 0 && b <= st.cards) out.push(d); });
    return out;
  }

  function legal(st, seat) {
    var out = [], i;
    if (st.over) return out;
    if (st.phase === 'bid') {
      if (seat < 0 || seat >= st.n || st.bids[seat] !== null) return out;
      for (i = 0; i <= st.cards; i++) {
        if (st.opts.cannon) { out.push({ t: 'bid', n: i, cannon: false }); out.push({ t: 'bid', n: i, cannon: true }); }
        else out.push({ t: 'bid', n: i });
      }
    } else if (st.phase === 'play') {
      if (st.turn !== seat || seat === st.G) return out;
      legalCards(st.hands[seat], st.trick.plays).forEach(function (id) {
        if (id === TIGRESS) { out.push({ t: 'play', id: id, as: 'pirate' }); out.push({ t: 'play', id: id, as: 'escape' }); }
        else out.push({ t: 'play', id: id });
      });
    } else if (st.phase === 'ability' && st.ability && st.ability.seat === seat) {
      var ab = st.ability;
      if (ab.key === 'rosie') for (i = 0; i < st.n; i++) out.push({ t: 'rosie', seat: i });
      else if (ab.key === 'bendt') combos(st.hands[seat], ab.need).forEach(function (c) { out.push({ t: 'bendt', discard: c }); });
      else if (ab.key === 'rascal') [0, 10, 20].forEach(function (w) { out.push({ t: 'rascal', w: w }); });
      else if (ab.key === 'juanita') out.push({ t: 'juanita' });
      else if (ab.key === 'harry') harryChoices(st, seat).forEach(function (d) { out.push({ t: 'harry', d: d }); });
    }
    return out;
  }

  function isLegal(st, seat, a) {
    if (!a || typeof a !== 'object' || st.over) return false;
    var i;
    if (st.phase === 'bid') {
      if (a.t !== 'bid' || seat < 0 || seat >= st.n || st.bids[seat] !== null) return false;
      return a.n === (a.n | 0) && a.n >= 0 && a.n <= st.cards;
    }
    if (st.phase === 'play') {
      if (a.t !== 'play' || st.turn !== seat || seat === st.G) return false;
      if (legalCards(st.hands[seat], st.trick.plays).indexOf(a.id) < 0) return false;
      if (a.id === TIGRESS && a.as !== 'pirate' && a.as !== 'escape') return false;
      return true;
    }
    if (st.phase === 'ability' && st.ability && st.ability.seat === seat) {
      var ab = st.ability;
      if (a.t !== ab.key) return false;
      if (ab.key === 'rosie') return a.seat === (a.seat | 0) && a.seat >= 0 && a.seat < st.n;
      if (ab.key === 'bendt') {
        if (!Array.isArray(a.discard) || a.discard.length !== ab.need) return false;
        var hand = st.hands[seat].slice();
        for (i = 0; i < a.discard.length; i++) { var j = hand.indexOf(a.discard[i]); if (j < 0) return false; hand.splice(j, 1); }
        return true;
      }
      if (ab.key === 'rascal') return a.w === 0 || a.w === 10 || a.w === 20;
      if (ab.key === 'juanita') return true;
      if (ab.key === 'harry') return harryChoices(st, seat).indexOf(a.d) >= 0;
    }
    return false;
  }

  function apply(st, seat, a) {
    if (!isLegal(st, seat, a)) return false;
    st.seq++;
    if (a.t === 'bid') {
      st.bids[seat] = a.n;
      if (st.opts.cannon) st.cannon[seat] = !!a.cannon;
      addLog(st, { t: 'bidMade', seat: seat });
      if (st.bids.every(function (b) { return b !== null; })) {
        addLog(st, { t: 'reveal', bids: st.bids.slice(), cannon: st.cannon.slice() });
        st.phase = 'play';
        beginTrick(st, st.roundLeader);
      }
    } else if (a.t === 'play') {
      playCard(st, seat, a.id, a.id === TIGRESS ? a.as : undefined);
    } else {
      finishAbility(st, seat, a);
    }
    return true;
  }

  function beginTrick(st, leader) {
    st.trick = { leader: leader, order: orderFrom(st, leader), plays: [] };
    st.turn = st.trick.order[0];
    ghostTurns(st);
  }
  function ghostTurns(st) {
    // 白ひげの幽霊は手札のいちばん上を表にして出すだけ（マストフォローしない。ティグレスは逃走）
    while (st.phase === 'play' && st.trick && st.turn === st.G) {
      var id = st.hands[st.G][0];
      playCard(st, st.G, id, id === TIGRESS ? 'escape' : undefined);
    }
  }
  function playCard(st, seat, id, as) {
    var hand = st.hands[seat];
    hand.splice(hand.indexOf(id), 1);
    var p = { seat: seat, id: id };
    if (as) p.as = as;
    st.trick.plays.push(p);
    st.played.push(id);
    var e = { t: 'play', seat: seat, id: id };
    if (as) e.as = as;
    addLog(st, e);
    if (st.trick.plays.length === st.trick.order.length) finishTrick(st);
    else { st.turn = st.trick.order[st.trick.plays.length]; ghostTurns(st); }
  }

  function finishTrick(st) {
    var plays = st.trick.plays.map(function (p) { return Object.assign({}, p); });
    var res = resolve(plays);
    var winner = res.kind === 'win' ? plays[res.winner].seat : -1;
    var entry = { t: 'trick', plays: plays, kind: res.kind, whale: !!res.whale, winner: winner, wi: res.winner, next: res.next, bonus: [], alliances: [] };
    if (res.kind === 'win') {
      if (winner === st.G) st.ghostWon++;
      else {
        st.won[winner]++;
        var b = trickBonus(plays, res);
        b.list.forEach(function (x) { st.bonus[winner].push(x); });
        b.alliances.forEach(function (x) { st.alliances.push(x); });
        entry.bonus = b.list; entry.alliances = b.alliances;
      }
    }
    st.tricks.push({ plays: plays, kind: res.kind, whale: !!res.whale, winner: winner, next: res.next });
    st.tricksDone++;
    st.trick = null; st.turn = -1;
    st.lastTrick = entry;
    addLog(st, entry);
    if (st.opts.abilities && res.kind === 'win' && !res.whale && winner !== st.G) {
      var wc = CARDS[plays[res.winner].id];
      if (wc.t === 'pirate') {
        var final = st.tricksDone === st.cards;
        // ハリーだけは最後のトリックのあとでも使える。ほかの能力は最後のトリックでは意味がないので使わない
        if (wc.key === 'harry' || (!final && (wc.key !== 'bendt' || st.deck.length > 0))) {
          var ab = { seat: winner, key: wc.key, final: final, next: res.next };
          var le = { t: 'ability', seat: winner, key: wc.key, final: final };
          if (wc.key === 'bendt') {
            ab.need = Math.min(2, st.deck.length);
            ab.drawn = st.deck.splice(0, ab.need);
            st.hands[winner] = st.hands[winner].concat(ab.drawn);
            le.n = ab.need; le.priv = { seat: winner, drawn: ab.drawn.slice() };
          }
          if (wc.key === 'juanita') st.seen[winner] = st.deck.slice();
          st.ability = ab;
          st.phase = 'ability';
          addLog(st, le);
          return;
        }
      }
    }
    afterTrick(st, res.next);
  }

  function afterTrick(st, next) {
    if (st.tricksDone >= st.cards) endRound(st);
    else { st.phase = 'play'; beginTrick(st, next); }
  }

  function finishAbility(st, seat, a) {
    var ab = st.ability, e = { t: 'abilityDone', seat: seat, key: ab.key };
    if (ab.key === 'rosie') { ab.next = a.seat; e.to = a.seat; }
    else if (ab.key === 'bendt') {
      var hand = st.hands[seat];
      a.discard.forEach(function (id) { hand.splice(hand.indexOf(id), 1); st.out.push(id); st.outBy[seat].push(id); });
      e.n = a.discard.length; e.priv = { seat: seat, discard: a.discard.slice() };
    } else if (ab.key === 'rascal') { st.wager[seat] = a.w; e.w = a.w; }
    else if (ab.key === 'harry') { st.bids[seat] += a.d; st.harry[seat] += a.d; e.d = a.d; e.bid = st.bids[seat]; }
    addLog(st, e);
    st.ability = null;
    afterTrick(st, ab.next);
  }

  function endRound(st) {
    var n = st.n, results = [], i;
    for (i = 0; i < n; i++) {
      var me = i, loot = 0;
      st.alliances.forEach(function (al) {
        if (al.a !== me && al.b !== me) return;
        var other = al.a === me ? al.b : al.a;
        if (st.bids[other] === st.won[other]) loot++;        // 相手も的中したときだけ（自分の的中は roundScore が見る）
      });
      var bonusSum = st.bonus[i].reduce(function (s, x) { return s + x.pts; }, 0);
      var sc = roundScore({ bid: st.bids[i], won: st.won[i], cards: st.cards, bonus: bonusSum, loot: loot, wager: st.wager[i] || 0, cannon: !!st.cannon[i] }, st.opts);
      st.scores[i] += sc.total;
      results.push({ seat: i, bid: st.bids[i], won: st.won[i], cannon: st.cannon[i], harry: st.harry[i], wager: st.wager[i],
        bonusList: st.bonus[i].slice(), lootCount: loot, hit: sc.hit, base: sc.base, bonus: sc.bonus, loot: sc.loot, wagerPts: sc.wager, total: sc.total, score: st.scores[i] });
    }
    var rec = { round: st.round, cards: st.cards, results: results, ghostWon: st.ghost ? st.ghostWon : 0, alliances: st.alliances.slice() };
    st.history.push(rec);
    addLog(st, { t: 'round', round: st.round, cards: st.cards, results: results, ghostWon: rec.ghostWon });
    st.phase = 'roundEnd';
    if (st.round >= st.schedule.length - 1) {
      st.over = true; st.phase = 'over';
      st.ranking = ranking(st.scores);
      addLog(st, { t: 'over', scores: st.scores.slice(), ranking: st.ranking });
    } else startRound(st);
  }

  // Places with shared ties: [{ seat, score, place }] best first.
  function ranking(scores) {
    var order = scores.map(function (s, i) { return { seat: i, score: s }; }).sort(function (a, b) { return b.score - a.score || a.seat - b.seat; });
    order.forEach(function (o, i) { o.place = i > 0 && order[i - 1].score === o.score ? order[i - 1].place : i + 1; });
    return order;
  }

  /* ================================================================ what one seat may see */
  function view(st, seat) {
    var revealed = st.phase !== 'bid';
    var mine = seat >= 0 && seat < st.n;
    var log = st.log.slice(-160).map(function (e) {
      if (!e.priv) return e;
      var c = Object.assign({}, e);
      if (!(mine && e.priv.seat === seat)) delete c.priv;
      return c;
    });
    var ab = null;
    if (st.ability) {
      ab = { seat: st.ability.seat, key: st.ability.key, final: st.ability.final };
      if (mine && st.ability.seat === seat && st.ability.key === 'bendt') { ab.need = st.ability.need; ab.drawn = st.ability.drawn.slice(); }
    }
    return {
      gid: st.gid, seq: st.seq, k: st.k, me: seat, n: st.n, ghost: st.ghost, G: st.G,
      opts: Object.assign({}, st.opts), schedule: st.schedule.slice(), round: st.round, cards: st.cards,
      phase: st.phase, over: st.over, ranking: st.ranking, roundLeader: st.roundLeader, tricksDone: st.tricksDone,
      players: st.players.map(function (p, i) {
        return {
          name: p.name, score: st.scores[i],
          bid: revealed || i === seat ? st.bids[i] : null, hasBid: st.bids[i] !== null,
          cannon: revealed || i === seat ? st.cannon[i] : null,
          won: st.won[i], hand: st.hands[i].length, wager: st.wager[i], harry: st.harry[i],
          bonus: st.bonus[i].slice()
        };
      }),
      ghostHand: st.ghost ? st.hands[st.G].length : 0, ghostWon: st.ghostWon,
      hand: mine ? st.hands[seat].slice() : [],
      trick: st.trick ? { leader: st.trick.leader, order: st.trick.order.slice(), plays: st.trick.plays.map(function (p) { return Object.assign({}, p); }) } : null,
      turn: st.turn,
      ability: ab,
      seen: mine && st.seen[seat] ? st.seen[seat].slice() : null,
      discarded: mine ? st.outBy[seat].slice() : [],
      alliances: st.alliances.map(function (x) { return Object.assign({}, x); }),
      tricks: st.tricks.map(function (t) { return { plays: t.plays.map(function (p) { return Object.assign({}, p); }), kind: t.kind, whale: t.whale, winner: t.winner, next: t.next }; }),
      played: st.played.slice(),
      lastTrick: st.lastTrick,
      history: st.history,
      deckCount: st.deck.length, outCount: st.out.length,
      log: log
    };
  }

  return {
    SUITS: SUITS, SUIT: SUIT, PIRATES: PIRATES, CARDS: CARDS, TYPE_JA: TYPE_JA,
    ESCAPES: ESCAPES, PIRATE_IDS: PIRATE_IDS, TIGRESS: TIGRESS, KING: KING, MERMAIDS: MERMAIDS, KRAKEN: KRAKEN, WHALE: WHALE, LOOTS: LOOTS,
    SCHEDULES: SCHEDULES, SCHEDULE_KEYS: SCHEDULE_KEYS,
    card: card, isNum: isNum, suitOf: suitOf, eff: eff, normOpts: normOpts, deckFor: deckFor, scheduleFor: scheduleFor,
    leadSuit: leadSuit, legalCards: legalCards, resolve: resolve, normalWinner: normalWinner, trickBonus: trickBonus,
    orderFrom: orderFrom, roundScore: roundScore, ranking: ranking, shuffleWith: shuffleWith,
    newGame: newGame, actors: actors, legal: legal, isLegal: isLegal, apply: apply, view: view
  };
});
