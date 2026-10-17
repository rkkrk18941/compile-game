/* アッシュク・エイト — rules engine (pure, no DOM). Loaded as a plain script (window.ASE_ENG) and by node tests.
   The rules follow the card game コンプレス / Compress (game design: Jun Sasaki, Oink Games 2026), as shown in
   the publisher's how-to-play sheet and reports of play:

   Cards: 0 or 1 printed on white or black, 22 of each kind (88), plus 8 penalty cards (0110 on one side, 1001 on
   the other). Every player holds 8 cards; they are the only thing a player may use to keep notes.
   In the middle lies the memory pile, face down. On a turn a player says whether its top card is 0 or 1 (the
   colour does not count), the card is shown to everyone and goes face down onto the checked pile. A wrong answer
   takes a penalty card (it may be used for notes too); the second one ends the game.
   When the last card of the memory pile has been answered, the checked pile is moved over as it is, so the next
   round runs in reverse order, and the player who answered last shows one card from their hand, lays it on top of
   the memory pile (it is the first card of the next round) and draws a card from the deck. The very first turn of
   a game is just that: the first player lays the first card.
   The game ends when someone takes their second penalty card, or when the deck runs out. Fewest penalties wins.
   Unpublished details (the exact card mix, ending at once when the deck runs out) are our best reading.

   Card ids: 0-87 are number cards, digit = id % 2, black = (id >> 1) % 2. 100-107 are the penalty cards.
   Piles are arrays whose last element is the top card. apply() takes one action and returns events; viewFor()
   is what one player may see (the memory pile is only a count) and reduceView() steps such a view forward by one
   event, so the UI can replay a turn. evFor() strips the one private thing in the events: what someone drew. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ASE_ENG = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var COPIES = 22, NUMBERS = COPIES * 4, PEN_BASE = 100, PEN_COUNT = 8, HAND = 8, MAX_PLAYERS = 7, LOSE_AT = 2;

  function digit(c) { return c >= PEN_BASE ? -1 : c % 2; }
  function black(c) { return c >= PEN_BASE ? -1 : (c >> 1) % 2; }
  function isPen(c) { return c >= PEN_BASE; }
  function kindName(c) { return isPen(c) ? 'ペナルティ' : (black(c) ? '黒の' : '白の') + digit(c); }

  function mulberry32(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function randomSeed() { return (Math.random() * 4294967296) >>> 0; }
  function fail(err) { return { ok: false, err: err }; }
  function gidOf(seed) { return ('000000' + (seed >>> 0).toString(36)).slice(-7); }

  /* opt: { n (1-7), seed, first, deckSize (optional: play with fewer cards in the deck, e.g. a solo challenge) } */
  function newGame(opt) {
    opt = opt || {};
    var n = Math.max(1, Math.min(MAX_PLAYERS, opt.n | 0 || 2));
    var seed = opt.seed != null ? opt.seed >>> 0 : randomSeed();
    var rng = mulberry32(seed);
    var all = [];
    for (var i = 0; i < NUMBERS; i++) all.push(i);
    shuffle(all, rng);
    var hands = [];
    for (var p = 0; p < n; p++) hands.push(all.splice(0, HAND));
    var deck = all;
    if (opt.deckSize != null && opt.deckSize > 0 && opt.deckSize < deck.length) deck = deck.slice(0, opt.deckSize | 0);
    var first = opt.first != null ? ((opt.first | 0) % n + n) % n : Math.floor(rng() * n);
    var pool = [];
    for (var k = 0; k < PEN_COUNT; k++) pool.push(PEN_BASE + k);
    var pens = [];
    for (var q = 0; q < n; q++) pens.push([]);
    return {
      v: 1, n: n, seed: seed, gid: gidOf(seed ^ 0x5bd1e995), deckSize: deck.length,
      hands: hands, deck: deck, mem: [], chk: [], pens: pens, pool: pool,
      turn: first, first: first, phase: 'add', ply: 0, round: 0, added: 0, answers: 0,
      seen: {}, last: null, result: null
    };
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  function seqLen(s) { return s.mem.length + s.chk.length; }
  /* the whole line in the order of the round being played: what has been answered, then the memory pile from the top */
  function line(s) { return s.chk.slice().concat(s.mem.slice().reverse()); }
  function next(s, p) { return (p + 1) % s.n; }

  function legalActions(s) {
    if (s.phase === 'answer') return [{ t: 'answer', v: 0 }, { t: 'answer', v: 1 }];
    if (s.phase === 'add') return s.hands[s.turn].filter(function (c) { return !isPen(c); }).map(function (c) { return { t: 'add', card: c }; });
    return [];
  }

  function finish(s, why, ev, loser) {
    var counts = s.pens.map(function (x) { return x.length; });
    var least = Math.min.apply(null, counts);
    var winners = [];
    counts.forEach(function (c, p) { if (c === least && p !== loser) winners.push(p); });
    s.phase = 'over';
    s.result = { why: why, loser: loser == null ? -1 : loser, winners: winners, pens: counts, len: seqLen(s), seq: line(s), rounds: s.round };
    ev.push({ k: 'over', why: why, loser: s.result.loser, winners: winners.slice(), pens: counts.slice(), len: s.result.len, seq: s.result.seq.slice(), rounds: s.round });
  }

  /* a: { t: 'answer', p, v } | { t: 'add', p, card } */
  function apply(s, a) {
    if (!a || typeof a !== 'object') return fail('bad');
    if (s.phase === 'over') return fail('over');
    var p = a.p | 0;
    if (p !== s.turn) return fail('turn');
    var ev = [];
    if (a.t === 'answer') {
      if (s.phase !== 'answer') return fail('phase');
      var v = a.v === 1 || a.v === '1' ? 1 : a.v === 0 || a.v === '0' ? 0 : -1;
      if (v < 0) return fail('value');
      var pos = s.chk.length + 1, len = seqLen(s);
      var card = s.mem.pop();
      var ok = digit(card) === v;
      s.chk.push(card);
      s.ply++; s.answers++;
      s.seen[card] = s.ply;
      s.last = { p: p, v: v, card: card, ok: ok };
      ev.push({ k: 'answer', p: p, v: v });
      ev.push({ k: 'reveal', p: p, card: card, ok: ok, pos: pos, len: len, round: s.round });
      if (!ok) {
        var pen = s.pool.length ? s.pool.shift() : PEN_BASE + PEN_COUNT + s.pens[p].length + p * 4;
        s.pens[p].push(pen); s.hands[p].push(pen);
        ev.push({ k: 'penalty', p: p, pen: pen, count: s.pens[p].length });
        if (s.pens[p].length >= LOSE_AT) { finish(s, 'pen', ev, p); return { ok: true, ev: ev }; }
      }
      if (!s.mem.length) {
        s.mem = s.chk; s.chk = [];
        s.round++;
        s.phase = 'add';
        ev.push({ k: 'recycle', p: p, len: s.mem.length, round: s.round });
      } else {
        s.turn = next(s, p); s.phase = 'answer';
        ev.push({ k: 'turn', p: s.turn, phase: 'answer' });
      }
      return { ok: true, ev: ev };
    }
    if (a.t === 'add') {
      if (s.phase !== 'add') return fail('phase');
      var c = a.card | 0, i = s.hands[p].indexOf(c);
      if (i < 0 || isPen(c)) return fail('card');
      s.hands[p].splice(i, 1);
      s.mem.push(c);
      s.added++; s.ply++;
      s.seen[c] = s.ply;
      ev.push({ k: 'add', p: p, card: c, len: seqLen(s) });
      if (s.deck.length) {
        var d = s.deck.pop();
        s.hands[p].push(d);
        ev.push({ k: 'draw', p: p, card: d, left: s.deck.length });
      }
      if (!s.deck.length) { finish(s, 'deck', ev, null); return { ok: true, ev: ev }; }
      s.turn = next(s, p); s.phase = 'answer';
      ev.push({ k: 'turn', p: s.turn, phase: 'answer' });
      return { ok: true, ev: ev };
    }
    return fail('bad');
  }

  /* what player `me` may see (me = -1: a spectator) */
  function viewFor(s, me) {
    return {
      v: 1, me: me, n: s.n, gid: s.gid, phase: s.phase, turn: s.turn, first: s.first, ply: s.ply, round: s.round,
      mem: s.mem.length, chk: s.chk.length, len: seqLen(s), deck: s.deck.length, deckSize: s.deckSize, pool: s.pool.length,
      hand: me >= 0 ? s.hands[me].slice() : null,
      pens: s.pens.map(function (x) { return x.length; }),
      myPens: me >= 0 ? s.pens[me].slice() : [],
      answers: s.answers, added: s.added,
      result: s.result ? clone(s.result) : null
    };
  }

  /* the events as one player may receive them */
  function evFor(ev, me) {
    return ev.map(function (e) {
      if (e.k === 'draw' && e.p !== me) return { k: 'draw', p: e.p, card: -1, left: e.left };
      return e;
    });
  }

  function reduceView(v0, e) {
    var v = clone(v0);
    switch (e.k) {
      case 'answer': break;
      case 'reveal': v.mem = Math.max(0, v.mem - 1); v.chk++; v.answers++; v.ply++; break;
      case 'penalty':
        v.pens[e.p] = e.count; v.pool = Math.max(0, v.pool - 1);
        if (e.p === v.me) { v.myPens.push(e.pen); v.hand.push(e.pen); }
        break;
      case 'recycle': v.mem = v.chk; v.chk = 0; v.round = e.round; v.phase = 'add'; break;
      case 'add':
        v.mem++; v.len = e.len; v.added++; v.ply++;
        if (e.p === v.me) { var i = v.hand.indexOf(e.card); if (i >= 0) v.hand.splice(i, 1); }
        break;
      case 'draw':
        v.deck = e.left;
        if (e.p === v.me && e.card >= 0) v.hand.push(e.card);
        break;
      case 'turn': v.turn = e.p; v.phase = e.phase || 'answer'; break;
      case 'over':
        v.phase = 'over';
        v.result = { why: e.why, loser: e.loser, winners: e.winners.slice(), pens: e.pens.slice(), len: e.len, seq: e.seq.slice(), rounds: e.rounds };
        break;
    }
    return v;
  }

  /* runs of equal digits in a line of cards (used by the CPU and the result sheet) */
  function runs(cards) {
    var r = 0, last = -1;
    for (var i = 0; i < cards.length; i++) { var d = digit(cards[i]); if (d !== last) { r++; last = d; } }
    return r;
  }

  return {
    COPIES: COPIES, NUMBERS: NUMBERS, PEN_BASE: PEN_BASE, PEN_COUNT: PEN_COUNT, HAND: HAND, MAX_PLAYERS: MAX_PLAYERS, LOSE_AT: LOSE_AT,
    digit: digit, black: black, isPen: isPen, kindName: kindName,
    newGame: newGame, clone: clone, apply: apply, legalActions: legalActions, viewFor: viewFor, evFor: evFor, reduceView: reduceView,
    seqLen: seqLen, line: line, runs: runs, mulberry32: mulberry32, randomSeed: randomSeed
  };
});
