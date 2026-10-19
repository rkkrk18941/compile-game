/* ブラックフライデー — rules engine (pure, no DOM). Loaded as a plain script (window.BF_ENG) and by node tests.

   The rules are those of BLACK FRIDAY by Friedemann Friese, the new edition (2F-Spiele 2023; Rio Grande Games;
   Japanese edition by Sunny Bird 2024), as written in the publisher's rule booklets (German and English) and printed
   on the board. RULES.md (next to this file) lists every source, the board data and the few readings we had to make.

   The board (2-4 side; the 5 side differs only in the length of the purchase tracks):
     share price table   13 rows x 7 columns, prices $4..$240. A price token moves right / left one space; on the
                         right column "right" means one space up, on the left column "left" means one space down; in
                         the top row "up" means right, in the bottom row "down" means left. $4 and $240 are the ends.
     areas               the table is split into 10 coloured areas (levels 0-9). A black share sits on the right edge
                         of areas 1-9 and goes into the bag the first time the most valuable colour reaches (or skips)
                         that area during a price change.
     price change chart  n drawn shares of a colour (less the black ones when two or more were drawn) move its token
                         n=1 up, 2 up+right, 3 up 2, 4 up 2+right, 5 up 3, 6 up 3+right, and so on upward;
                         n=0 left, -1 down, -2 down+left, -3 down 2, ... Vertical steps first, then horizontal.
     gold price track    20 21 ... 29 30 35 ... 95 100. Reaching 100 ends the game after that price change.
     tracks              share purchase and gold purchase (5 spaces; 6 with five seats), three share sale tracks of
                         10 shares each with 1 / 2 / 3 black shares beside them (order top, centre, bottom, then the
                         centre one again and again, refilled from the market and the bank).
   Seats are in turn order and seat 0 starts. With the M.I.B.S. it is seat 0 (it always starts). Bonus tile k goes to
   seat k-1 (seat 1 gets "2.", seat 2 gets "3." ...).

   apply(state, p, action) checks and plays one action of seat p and returns { ok, ev } (ev = list of events the UI
   replays). viewFor(state, p) is what seat p may see: other players' screens are reduced to what the table can work
   out from public play (exact cash and gold, the shares bought and sold) and the bag to its size and black count. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BF_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ board data */
  var COLOR_KEYS = ['purple', 'yellow', 'green', 'blue', 'white'];   // the market order: price changes and ties use it
  var NC = 5, BLACK = 5;
  var GRID = [                                                        // row 0 is the top row
    [150, 175, 190, 200, 210, 225, 240],
    [135, 150, 160, 170, 180, 200, 210],
    [115, 125, 135, 145, 160, 170, 180],
    [95, 105, 115, 125, 135, 145, 155],
    [75, 85, 95, 100, 110, 120, 130],
    [60, 70, 75, 85, 90, 100, 110],
    [45, 50, 60, 65, 75, 85, 90],
    [35, 40, 45, 50, 60, 65, 75],
    [25, 30, 35, 40, 45, 50, 60],
    [15, 20, 25, 30, 35, 40, 45],
    [10, 12, 15, 20, 25, 30, 35],
    [6, 8, 10, 12, 15, 20, 25],
    [4, 5, 6, 8, 10, 12, 15]
  ];
  var AREA = [                                                        // the level each space belongs to
    [8, 8, 8, 9, 9, 9, 9],
    [7, 7, 8, 8, 8, 8, 9],
    [6, 7, 7, 7, 7, 8, 8],
    [6, 6, 6, 6, 7, 7, 7],
    [5, 5, 5, 6, 6, 6, 6],
    [4, 4, 5, 5, 5, 5, 6],
    [3, 4, 4, 4, 4, 5, 5],
    [3, 3, 3, 3, 4, 4, 4],
    [2, 2, 2, 3, 3, 3, 3],
    [1, 1, 2, 2, 2, 2, 3],
    [0, 1, 1, 1, 1, 2, 2],
    [0, 0, 0, 0, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0]
  ];
  var ROWS = 13, COLS = 7;
  var START_CELL = 12 * COLS + 3;                                     // the marked "8" space
  var GOLD_TRACK = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
  var GOLD_END = GOLD_TRACK.length - 1;
  /* level tiles: s = shares bought or sold per action, g = gold bars per purchase, d = shares drawn at a price change */
  var LEVELS = [
    { s: 1, g: 1, d: 5 }, { s: 1, g: 1, d: 6 }, { s: 2, g: 2, d: 6 }, { s: 2, g: 2, d: 7 }, { s: 3, g: 3, d: 7 },
    { s: 3, g: 3, d: 8 }, { s: 4, g: 4, d: 9 }, { s: 5, g: 5, d: 10 }, { s: 5, g: 5, d: 11 }, { s: 5, g: 5, d: 12 }
  ];
  var SALE_BLACK = [1, 2, 3];                                         // black shares beside the top / centre / bottom track
  var PER_COLOR = 25, BLACK_TOTAL = 15, START_CASH = 100, START_DRAW = 5, MARKET_DRAW = 20, GOLD_VALUE = 100;
  /* bonus tile k offers advantages 1..k-1: 1 manipulate (buy/sell/gold zero), 2 sell +1, 3 gold +1, 4 buy +1 */
  var ADV = { manip: 2, sell: 3, gold: 4, buy: 5 };

  function cellRow(cell) { return Math.floor(cell / COLS); }
  function cellCol(cell) { return cell % COLS; }
  function cellPrice(cell) { return GRID[cellRow(cell)][cellCol(cell)]; }
  function cellArea(cell) { return AREA[cellRow(cell)][cellCol(cell)]; }

  /* one space in each direction, with the edge rules printed on the board */
  function stepRight(cell) { var r = cellRow(cell), c = cellCol(cell); if (c < COLS - 1) return cell + 1; if (r > 0) return cell - COLS; return cell; }
  function stepUp(cell) { var r = cellRow(cell), c = cellCol(cell); if (r > 0) return cell - COLS; if (c < COLS - 1) return cell + 1; return cell; }
  function stepLeft(cell) { var r = cellRow(cell), c = cellCol(cell); if (c > 0) return cell - 1; if (r < ROWS - 1) return cell + COLS; return cell; }
  function stepDown(cell) { var r = cellRow(cell), c = cellCol(cell); if (r < ROWS - 1) return cell + COLS; if (c > 0) return cell - 1; return cell; }

  /* the price change chart: n -> { v: rows up (negative = down), h: columns right (negative = left) } */
  function chart(n) {
    if (n > 0) return { v: Math.ceil(n / 2), h: n % 2 === 0 ? 1 : 0 };
    var k = -n;
    if (k === 0) return { v: 0, h: -1 };
    return { v: -Math.ceil(k / 2), h: k % 2 === 0 ? -1 : 0 };
  }
  /* the spaces a token passes on its way, start included: vertical steps first, then horizontal, one at a time */
  function chartPath(cell, n) {
    var o = chart(n), path = [cell], cur = cell, i;
    for (i = 0; i < Math.abs(o.v); i++) { cur = o.v > 0 ? stepUp(cur) : stepDown(cur); if (cur !== path[path.length - 1]) path.push(cur); }
    for (i = 0; i < Math.abs(o.h); i++) { cur = o.h > 0 ? stepRight(cur) : stepLeft(cur); if (cur !== path[path.length - 1]) path.push(cur); }
    return path;
  }

  /* ------------------------------------------------------------------ helpers */
  function mulberry(st) {                                              // the state carries its own random stream
    st.rs = (st.rs + 0x6D2B79F5) >>> 0;
    var t = st.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randomSeed() { return (Math.random() * 4294967296) >>> 0; }
  function zeros(k) { var a = []; for (var i = 0; i < k; i++) a.push(0); return a; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function fail(err, extra) { var r = { ok: false, err: err }; if (extra) r.info = extra; return r; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function validColor(c) { return isInt(c) && c >= 0 && c < NC; }
  function countArr(n) { if (!Array.isArray(n) || n.length !== NC) return null; for (var i = 0; i < NC; i++) if (!isInt(n[i]) || n[i] < 0 || n[i] > 99) return null; return n.slice(); }

  /* draw k shares from the bag (counts [p,y,g,b,w,black]); returns the colours in the order drawn */
  function drawFromBag(st, k) {
    var out = [], bag = st.bag;
    for (var i = 0; i < k; i++) {
      var total = sum(bag);
      if (total <= 0) break;
      var x = Math.floor(mulberry(st) * total), c = 0;
      while (x >= bag[c]) { x -= bag[c]; c++; }
      bag[c]--; out.push(c);
    }
    return out;
  }

  function limits(st) { return LEVELS[st.level]; }
  function curSale(st) { return st.sale.tracks[st.sale.cur]; }
  function goldPrice(st) { return GOLD_TRACK[st.gold]; }
  function prices(st) { return st.price.map(cellPrice); }

  /* ------------------------------------------------------------------ setup */
  /* opt: { seats: [{ nm, mibs }], seed }. Seats are in turn order, seat 0 starts; a M.I.B.S. seat must be seat 0.
     3-5 seats (2 players play with the M.I.B.S. as a third). */
  function newGame(opt) {
    opt = opt || {};
    var seats = Array.isArray(opt.seats) ? opt.seats : [];
    var n = seats.length;
    if (n < 3 || n > 5) throw new Error('3-5 seats');
    for (var i = 1; i < n; i++) if (seats[i] && seats[i].mibs) throw new Error('the M.I.B.S. must start');
    var seed = opt.seed != null ? opt.seed >>> 0 : randomSeed();
    var five = n === 5;
    var st = {
      v: 1, seed: seed, rs: seed, n: n, five: five,
      cap: five ? 6 : 5, saleLeft: five ? 4 : 5,                    // purchase track length; colours left on a sale track that trigger
      seats: seats.map(function (s, k) { return { nm: String((s && s.nm) || 'P' + (k + 1)).slice(0, 12), mibs: !!(s && s.mibs) }; }),
      phase: 'play', turn: 0, step: 'pre', turnNo: 0, pcNo: 0,
      price: zeros(NC).map(function () { return START_CELL; }),
      gold: 0, bought: 0, level: 0,
      levelBlack: [false, true, true, true, true, true, true, true, true, true],
      market: zeros(NC), bag: zeros(NC + 1), bank: 0, box: zeros(NC),
      buyTrack: [], goldTrack: [],
      sale: { cur: 0, stage: 1, tracks: SALE_BLACK.map(function (k) { return { c: [2, 2, 2, 2, 2], k: k }; }) },
      players: [], hist: [], setup: null, last: null, result: null,
      pub: { bagAtDeal: null, flowIn: zeros(NC), flowOut: zeros(NC) }
    };
    var each = five ? 5 : 4;
    for (var c = 0; c < NC; c++) {
      st.market[c] = each;
      st.box[c] = five ? 0 : 1;
      st.bag[c] = PER_COLOR - 2 * SALE_BLACK.length - each - st.box[c];   // 14 of each colour either way
    }
    // 20 random shares to the market
    var drawn = drawFromBag(st, MARKET_DRAW), toMarket = zeros(NC);
    drawn.forEach(function (x) { st.market[x]++; toMarket[x]++; });
    // the colour with the fewest shares in the market starts at $10, the one with the most at $6
    var lo = Math.min.apply(null, st.market), hi = Math.max.apply(null, st.market), moves = [];
    if (lo !== hi) {
      for (c = 0; c < NC; c++) {
        if (st.market[c] === lo) { st.price[c] = stepRight(START_CELL); moves.push({ c: c, to: st.price[c] }); }
        else if (st.market[c] === hi) { st.price[c] = stepLeft(START_CELL); moves.push({ c: c, to: st.price[c] }); }
      }
    }
    st.pub.bagAtDeal = st.bag.slice(0, NC);
    for (i = 0; i < n; i++) {
      var hand = zeros(NC);
      drawFromBag(st, START_DRAW).forEach(function (x) { hand[x]++; });
      st.players.push({
        cash: START_CASH, sh: hand, gold: 0,
        tile: i === 0 ? 0 : i + 1, tileUsed: false, mibs: st.seats[i].mibs,
        init: hand.slice(), bought: zeros(NC), sold: zeros(NC), rev: zeros(NC),   // rev: least initial shares the table can infer
        spent: { shares: 0, gold: 0 }, earned: 0
      });
    }
    st.setup = { toMarket: toMarket, moves: moves };
    pushHist(st);
    return st;
  }

  function pushHist(st) {
    if (st.quiet) return;                                              // simulations (the CPU's look-ahead) keep no history
    st.hist.push({ t: st.turnNo, pc: st.pcNo, p: prices(st), g: goldPrice(st), lv: st.level });
  }

  /* ------------------------------------------------------------------ price moves */
  function moveRight(st, c, why, ev) { var from = st.price[c], to = stepRight(from); st.price[c] = to; ev.push({ k: 'move', c: c, path: from === to ? [from] : [from, to], why: why }); }
  function moveLeft(st, c, why, ev) { var from = st.price[c], to = stepLeft(from); st.price[c] = to; ev.push({ k: 'move', c: c, path: from === to ? [from] : [from, to], why: why }); }
  function moveUp(st, c, why, ev) { var from = st.price[c], to = stepUp(from); st.price[c] = to; ev.push({ k: 'move', c: c, path: from === to ? [from] : [from, to], why: why }); }

  /* place one share of colour c from the market on the purchase track `which` ('buy' | 'gold') */
  function placeOnTrack(st, which, c, ev) {
    var track = which === 'buy' ? st.buyTrack : st.goldTrack;
    st.market[c]--;
    track.push(c);
    ev.push({ k: 'place', track: which, c: c, slot: track.length - 1 });
    var emptied = st.market[c] === 0;
    var third = track.filter(function (x) { return x === c; }).length === 3;
    return { emptied: emptied, third: third };
  }

  /* ------------------------------------------------------------------ the price change */
  function priceChange(st, trig, ev) {
    st.pcNo++;
    var lv = limits(st), before = prices(st), goldFrom = st.gold;
    var drawn = drawFromBag(st, lv.d);
    var counts = zeros(NC), black = 0;
    drawn.forEach(function (x) { if (x === BLACK) black++; else counts[x]++; });
    for (var c = 0; c < NC; c++) st.pub.flowOut[c] += counts[c];
    ev.push({ k: 'pc', trig: trig, want: lv.d, drawn: drawn, counts: counts.slice(), black: black, level: st.level, no: st.pcNo });
    // gold price: one space per black share, one per 3 gold bars bought since the last price change
    var bars = Math.floor(st.bought / 3);
    var g1 = Math.min(GOLD_END, st.gold + black), g2 = Math.min(GOLD_END, g1 + bars);
    ev.push({ k: 'gold-up', from: goldFrom, black: g1 - goldFrom, bars: g2 - g1, barsWanted: bars, boughtWas: st.bought, to: g2 });
    st.gold = g2; st.bought = 0;
    var ends = st.gold >= GOLD_END;
    // share prices, in market order
    var eff = counts.map(function (x) { return black >= 2 ? x - black : x; });
    var moves = [];
    for (c = 0; c < NC; c++) {
      var path = chartPath(st.price[c], eff[c]);
      st.price[c] = path[path.length - 1];
      moves.push({ c: c, n: eff[c], path: path });
    }
    ev.push({ k: 'pc-move', moves: moves, black: black });
    // clean up: drawn colours to the market, black shares back in the bag (one) or to the bank (two or more)
    for (c = 0; c < NC; c++) st.market[c] += counts[c];
    var blackTo = black === 1 ? 'bag' : black >= 2 ? 'bank' : null;
    if (black === 1) st.bag[BLACK] += 1;
    else if (black >= 2) st.bank += black;
    // the track that triggered goes into the bag
    var toBag = zeros(NC), toBagBlack = 0, t;
    if (trig === 'buy' || trig === 'gold') {
      t = trig === 'buy' ? st.buyTrack : st.goldTrack;
      t.forEach(function (x) { toBag[x]++; });
      if (trig === 'buy') st.buyTrack = []; else st.goldTrack = [];
    } else {
      t = curSale(st);
      for (c = 0; c < NC; c++) { toBag[c] = t.c[c]; t.c[c] = 0; }
      toBagBlack = t.k; t.k = 0;
    }
    for (c = 0; c < NC; c++) { st.bag[c] += toBag[c]; st.pub.flowIn[c] += toBag[c]; }
    st.bag[BLACK] += toBagBlack;
    ev.push({ k: 'pc-clean', toMarket: counts.slice(), blackTo: blackTo, black: black, trig: trig, toBag: toBag, toBagBlack: toBagBlack, sale: trig === 'sale' ? st.sale.cur : -1 });
    // a colour that is still missing in the market rises one space up
    for (c = 0; c < NC; c++) if (st.market[c] === 0) moveUp(st, c, 'empty', ev);
    // level: the area of the most valuable colour (ties: the higher area)
    var best = -1, area = 0;
    for (c = 0; c < NC; c++) {
      var pr = cellPrice(st.price[c]), ar = cellArea(st.price[c]);
      if (pr > best) { best = pr; area = ar; } else if (pr === best && ar > area) area = ar;
    }
    if (area > st.level) {
      var from = st.level, blacks = [];
      for (var L = from + 1; L <= area; L++) if (st.levelBlack[L]) { st.levelBlack[L] = false; st.bag[BLACK]++; blacks.push(L); }
      st.level = area;
      ev.push({ k: 'level', from: from, to: area, blacks: blacks });
    }
    // the share sale tracks: top -> centre -> bottom -> centre (refilled) -> centre (refilled) ...
    if (trig === 'sale') {
      var stage = st.sale.stage;
      if (stage === 1) { st.sale.cur = 1; st.sale.stage = 2; ev.push({ k: 'sale-next', cur: 1, stage: 2 }); }
      else if (stage === 2) { st.sale.cur = 2; st.sale.stage = 3; ev.push({ k: 'sale-next', cur: 2, stage: 3 }); }
      else {
        st.sale.cur = 1; st.sale.stage = stage + 1;
        var tr = st.sale.tracks[1], put = zeros(NC), raised = [];
        for (c = 0; c < NC; c++) {
          var had = st.market[c], k = Math.min(2, had);
          st.market[c] -= k; tr.c[c] += k; put[c] = k;
          if (had > 0 && st.market[c] === 0) raised.push(c);
        }
        var kb = Math.min(2, st.bank); st.bank -= kb; tr.k += kb;
        ev.push({ k: 'sale-next', cur: 1, stage: stage + 1, refill: put, black: kb });
        raised.forEach(function (x) { moveRight(st, x, 'refill', ev); });
      }
    }
    st.last = { no: st.pcNo, trig: trig, drawn: drawn, counts: counts, black: black, eff: eff, before: before, after: prices(st), goldFrom: goldFrom, goldTo: st.gold, turnNo: st.turnNo };
    pushHist(st);
    if (ends) finish(st, ev);
  }

  /* after an action or a manipulation: does a track trigger a price change? */
  function checkTrigger(st, touched, ev) {
    if (st.phase !== 'play') return;
    if (touched === 'buy' && st.buyTrack.length >= st.cap) priceChange(st, 'buy', ev);
    else if (touched === 'gold' && st.goldTrack.length >= st.cap) priceChange(st, 'gold', ev);
    else if (touched === 'sale' && sum(curSale(st).c) <= st.saleLeft) priceChange(st, 'sale', ev);
  }

  /* ------------------------------------------------------------------ game end */
  function finish(st, ev) {
    if (st.phase === 'over') return;
    st.phase = 'over';
    var pr = prices(st);
    var rows = st.players.map(function (pl, i) {
      var shareValue = 0, sold = zeros(NC);
      for (var c = 0; c < NC; c++) { shareValue += pl.sh[c] * pr[c]; sold[c] = pl.sh[c]; }
      var total = pl.cash + shareValue + pl.gold * GOLD_VALUE;
      return { p: i, cash: pl.cash, shares: sold, shareValue: shareValue, gold: pl.gold, goldValue: pl.gold * GOLD_VALUE, total: total };
    });
    var order = rows.slice().sort(function (a, b) { return b.total - a.total || b.gold - a.gold || a.p - b.p; });
    var rank = 0;
    order.forEach(function (r, k) {
      if (k === 0 || r.total !== order[k - 1].total || r.gold !== order[k - 1].gold) rank = k + 1;
      r.rank = rank;
    });
    // everybody sells everything to the market for the current price (prices do not drop for these sales)
    st.players.forEach(function (pl, i) {
      pl.cash = rows[i].cash + rows[i].shareValue;
      for (var c = 0; c < NC; c++) { st.market[c] += pl.sh[c]; pl.sh[c] = 0; }
    });
    st.result = { rows: rows, order: order.map(function (r) { return r.p; }), prices: pr, gold: goldPrice(st) };
    ev.push({ k: 'end', result: clone(st.result) });
  }

  /* ------------------------------------------------------------------ validation helpers */
  function bonusAvail(pl, adv) { return pl.tile >= ADV[adv] && !pl.tileUsed; }

  /* which colours may go on a purchase track after buying `n` (null = none needed, [] = nothing available) */
  function placeChoices(st, n) {
    var after = st.market.map(function (m, c) { return m - (n ? n[c] : 0); });
    var bought = [], any = [];
    for (var c = 0; c < NC; c++) {
      if (after[c] >= 1) { any.push(c); if (n && n[c] > 0) bought.push(c); }
    }
    return bought.length ? bought : any;
  }
  /* which colours may be taken from the current sale track after selling `n` */
  function removeChoices(st, n) {
    var t = curSale(st), sold = [], any = [];
    for (var c = 0; c < NC; c++) {
      if (t.c[c] >= 1) { any.push(c); if (n && n[c] > 0) sold.push(c); }
    }
    return sold.length ? sold : any;
  }

  /* ------------------------------------------------------------------ actions */
  /* a: { t: 'bonus', track: 'buy'|'gold'|'sale', c }   the one-time manipulation (before or after the action)
        { t: 'buy', n: [5], place: c, then: bool }    buy shares (n may be all zero), then: keep the turn open for the bonus
        { t: 'sell', n: [5], remove: c, then: bool }
        { t: 'gold', k: bars, place: c, then: bool }
        { t: 'end' }                                   end the turn after the action (only while the bonus could follow) */
  function apply(st, p, a) {
    if (!st || st.phase !== 'play') return fail('over');
    if (p !== st.turn) return fail('turn');
    if (!a || typeof a !== 'object') return fail('bad');
    var pl = st.players[p], ev = [];
    var lv = limits(st);
    if (a.t === 'end') {
      if (st.step !== 'post') return fail('step');
      nextTurn(st, ev);
      return { ok: true, ev: ev };
    }
    if (a.t === 'bonus') {
      if (!bonusAvail(pl, 'manip')) return fail('nobonus');
      var tr = a.track, c = a.c;
      if (tr !== 'buy' && tr !== 'gold' && tr !== 'sale') return fail('bad');
      if (!validColor(c)) return fail('color');
      if (tr === 'sale') { if (curSale(st).c[c] < 1) return fail('color'); }
      else if (st.market[c] < 1) return fail('color');
      pl.tileUsed = true;
      ev.push({ k: 'bonus', p: p, adv: 'manip', track: tr, c: c, when: st.step });
      if (tr === 'sale') {
        curSale(st).c[c]--; st.market[c]++;
        ev.push({ k: 'unsale', c: c, track: st.sale.cur });
        moveLeft(st, c, 'sale', ev);
      } else {
        var r0 = placeOnTrack(st, tr, c, ev);
        if (r0.emptied) moveRight(st, c, 'emptied', ev);
        if (r0.third) moveRight(st, c, 'third', ev);
      }
      checkTrigger(st, tr, ev);
      if (st.phase === 'play' && st.step === 'post') nextTurn(st, ev);
      return { ok: true, ev: ev };
    }
    if (st.step !== 'pre') return fail('step');
    var r;
    if (a.t === 'buy') r = doBuy(st, p, pl, lv, a, ev);
    else if (a.t === 'sell') r = doSell(st, p, pl, lv, a, ev);
    else if (a.t === 'gold') r = doGold(st, p, pl, lv, a, ev);
    else return fail('bad');
    if (r) return r;
    if (st.phase !== 'play') return { ok: true, ev: ev };
    if (a.then && bonusAvail(pl, 'manip')) { st.step = 'post'; ev.push({ k: 'await-bonus', p: p }); }
    else nextTurn(st, ev);
    return { ok: true, ev: ev };
  }

  function useExtra(pl, kind, qty, limit) {
    if (qty <= limit) return 'none';
    if (qty === limit + 1 && bonusAvail(pl, kind)) return 'use';
    return 'over';
  }

  function doBuy(st, p, pl, lv, a, ev) {
    var n = countArr(a.n);
    if (!n) return fail('bad');
    var qty = sum(n), x = useExtra(pl, 'buy', qty, lv.s);
    if (x === 'over') return fail('limit');
    var cost = 0;
    for (var c = 0; c < NC; c++) { if (n[c] > st.market[c]) return fail('market'); cost += n[c] * cellPrice(st.price[c]); }
    if (cost > pl.cash) return fail('cash');
    var choices = placeChoices(st, n), place = a.place;
    if (choices.length) { if (choices.indexOf(place) < 0) return fail('place', choices); }
    else place = null;
    // pay and take the shares
    if (x === 'use') { pl.tileUsed = true; ev.push({ k: 'bonus', p: p, adv: 'buy' }); }
    var before = st.market.slice();
    pl.cash -= cost; pl.spent.shares += cost;
    for (c = 0; c < NC; c++) { st.market[c] -= n[c]; pl.sh[c] += n[c]; pl.bought[c] += n[c]; }
    ev.push({ k: 'buy', p: p, n: n, cost: cost, prices: n.map(function (q, cc) { return cellPrice(st.price[cc]); }) });
    var third = false;
    if (place != null) third = placeOnTrack(st, 'buy', place, ev).third;
    // the price does not change, except: the last share of a colour left the market, or a third share on the track
    for (c = 0; c < NC; c++) if (before[c] > 0 && st.market[c] === 0) moveRight(st, c, 'emptied', ev);
    if (third) moveRight(st, place, 'third', ev);
    st.lastAct = { p: p, t: 'buy' };
    if (place != null) checkTrigger(st, 'buy', ev);
    return null;
  }

  function doSell(st, p, pl, lv, a, ev) {
    var n = countArr(a.n);
    if (!n) return fail('bad');
    var qty = sum(n), x = useExtra(pl, 'sell', qty, lv.s);
    if (x === 'over') return fail('limit');
    for (var c = 0; c < NC; c++) if (n[c] > pl.sh[c]) return fail('own');
    var choices = removeChoices(st, n), rem = a.remove;
    if (choices.length) { if (choices.indexOf(rem) < 0) return fail('remove', choices); }
    else rem = null;
    if (x === 'use') { pl.tileUsed = true; ev.push({ k: 'bonus', p: p, adv: 'sell' }); }
    var gain = 0;
    for (c = 0; c < NC; c++) {
      if (!n[c]) continue;
      gain += n[c] * cellPrice(st.price[c]);
      pl.sh[c] -= n[c]; st.market[c] += n[c]; pl.sold[c] += n[c];
      // what the table now knows about the screen: at least this many of the starting shares were of colour c
      pl.rev[c] = Math.max(pl.rev[c], pl.sold[c] - pl.bought[c]);
    }
    pl.cash += gain; pl.earned += gain;
    ev.push({ k: 'sell', p: p, n: n, gain: gain, prices: n.map(function (q, cc) { return cellPrice(st.price[cc]); }) });
    if (rem != null) {
      curSale(st).c[rem]--; st.market[rem]++;
      ev.push({ k: 'unsale', c: rem, track: st.sale.cur });
      moveLeft(st, rem, 'sale', ev);
    }
    st.lastAct = { p: p, t: 'sell' };
    if (rem != null) checkTrigger(st, 'sale', ev);
    return null;
  }

  function doGold(st, p, pl, lv, a, ev) {
    var k = a.k;
    if (!isInt(k) || k < 0) return fail('bad');
    var x = useExtra(pl, 'gold', k, lv.g);
    if (x === 'over') return fail('limit');
    var price = goldPrice(st), cost = k * price;
    if (cost > pl.cash) return fail('cash');
    var choices = placeChoices(st, null), place = a.place;
    if (choices.length) { if (choices.indexOf(place) < 0) return fail('place', choices); }
    else place = null;
    if (x === 'use') { pl.tileUsed = true; ev.push({ k: 'bonus', p: p, adv: 'gold' }); }
    pl.cash -= cost; pl.gold += k; pl.spent.gold += cost; st.bought += k;
    ev.push({ k: 'gold', p: p, n: k, cost: cost, price: price, bought: st.bought });
    if (place != null) {
      var r = placeOnTrack(st, 'gold', place, ev);
      if (r.emptied) moveRight(st, place, 'emptied', ev);
      if (r.third) moveRight(st, place, 'third', ev);
    }
    st.lastAct = { p: p, t: 'gold' };
    if (place != null) checkTrigger(st, 'gold', ev);
    return null;
  }

  function nextTurn(st, ev) {
    if (st.phase !== 'play') return;
    st.turnNo++;
    st.turn = (st.turn + 1) % st.n;
    st.step = 'pre';
    pushHist(st);
    ev.push({ k: 'turn', p: st.turn, no: st.turnNo });
  }

  /* ------------------------------------------------------------------ what a seat may see */
  /* p = seat index, or -1 for a spectator. Everything the table can see or work out from public play is kept:
     cash and gold of everybody (every payment is open), the shares bought and sold, and the least number of each
     colour a screen must have started with (when someone sold more than they had bought). */
  function bagEstimate(st, p) {
    var pool = st.pub.bagAtDeal.slice(), hidden = 0;
    st.players.forEach(function (q, i) {
      var open = i === p || q.mibs || st.phase === 'over';
      for (var c = 0; c < NC; c++) pool[c] -= open ? q.init[c] : q.rev[c];
      if (!open) hidden += START_DRAW - sum(q.rev);
    });
    var tot = sum(pool), est = [];
    for (var c = 0; c < NC; c++) {
      var e = pool[c] - (tot > 0 ? hidden * pool[c] / tot : 0) + st.pub.flowIn[c] - st.pub.flowOut[c];
      est.push(Math.max(0, Math.round(e * 100) / 100));
    }
    return est;
  }

  function viewFor(st, p) {
    var v = {
      v: st.v, n: st.n, five: st.five, cap: st.cap, saleLeft: st.saleLeft, me: p,
      seats: clone(st.seats), phase: st.phase, turn: st.turn, step: st.step, turnNo: st.turnNo, pcNo: st.pcNo,
      price: st.price.slice(), gold: st.gold, bought: st.bought, level: st.level, levelBlack: st.levelBlack.slice(),
      market: st.market.slice(), bank: st.bank, buyTrack: st.buyTrack.slice(), goldTrack: st.goldTrack.slice(),
      sale: clone(st.sale), bagCount: sum(st.bag), bagBlack: st.bag[BLACK], bagEst: bagEstimate(st, p),
      hist: clone(st.hist), last: st.last ? clone(st.last) : null, result: st.result ? clone(st.result) : null,
      players: st.players.map(function (q, i) {
        var open = i === p || q.mibs || st.phase === 'over';
        var known = zeros(NC), unknown = 0;
        if (!open) {
          for (var c = 0; c < NC; c++) known[c] = q.rev[c] + q.bought[c] - q.sold[c];
          unknown = START_DRAW - sum(q.rev);
        }
        return {
          nm: st.seats[i].nm, mibs: q.mibs, open: open, cash: q.cash, gold: q.gold,
          sh: open ? q.sh.slice() : null, known: open ? q.sh.slice() : known, unknown: open ? 0 : unknown,
          shCount: sum(q.sh), tile: q.tile, tileUsed: q.tileUsed,
          bought: q.bought.slice(), sold: q.sold.slice()
        };
      })
    };
    return v;
  }

  /* events as a seat may see them (nothing private happens after the deal, so they pass unchanged) */
  function evFor(ev) { return ev; }

  /* a quick summary for the UI of what the seat on turn may do */
  function options(st) {
    var p = st.turn, pl = st.players[p], lv = limits(st);
    return {
      p: p, step: st.step, lim: lv,
      buyMax: lv.s + (bonusAvail(pl, 'buy') ? 1 : 0),
      sellMax: lv.s + (bonusAvail(pl, 'sell') ? 1 : 0),
      goldMax: lv.g + (bonusAvail(pl, 'gold') ? 1 : 0),
      manip: bonusAvail(pl, 'manip'),
      goldPrice: goldPrice(st)
    };
  }

  return {
    COLOR_KEYS: COLOR_KEYS, NC: NC, BLACK: BLACK, GRID: GRID, AREA: AREA, ROWS: ROWS, COLS: COLS, START_CELL: START_CELL,
    GOLD_TRACK: GOLD_TRACK, GOLD_END: GOLD_END, LEVELS: LEVELS, SALE_BLACK: SALE_BLACK, ADV: ADV, GOLD_VALUE: GOLD_VALUE,
    START_CASH: START_CASH, PER_COLOR: PER_COLOR, BLACK_TOTAL: BLACK_TOTAL,
    cellRow: cellRow, cellCol: cellCol, cellPrice: cellPrice, cellArea: cellArea,
    stepRight: stepRight, stepLeft: stepLeft, stepUp: stepUp, stepDown: stepDown, chart: chart, chartPath: chartPath,
    newGame: newGame, apply: apply, viewFor: viewFor, evFor: evFor, options: options, limits: limits,
    placeChoices: placeChoices, removeChoices: removeChoices, bonusAvail: bonusAvail, goldPrice: goldPrice, prices: prices,
    clone: clone, sum: sum, zeros: zeros, randomSeed: randomSeed
  };
});
