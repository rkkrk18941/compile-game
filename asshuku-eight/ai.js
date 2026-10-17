/* アッシュク・エイト — the CPU players (window.ASE_AI). They run where the whole game state lives (solo, or the
   host's browser online), so they could simply read the memory pile; instead each one plays a person whose notes
   hold only so much. A line is hard to note down when it has many runs (0011 1000 is three runs) and when it is
   long. Past what a level can hold, every answer may slip; a card that was shown a moment ago never does.
     level 1 やさしい: loses the thread early      level 2 ふつう      level 3 つよい: holds long, varied lines
   When a CPU lays the next card, the gentle ones tend to extend the run at that end (easier for everyone); the
   strong one plays whatever keeps the others busiest. */
(function (root, factory) {
  var api = factory(root && root.ASE_ENG ? root.ASE_ENG : (typeof require === 'function' ? require('./engine.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ASE_AI = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  /* tuned by self-play: a CPU alone usually keeps going to a line of about 13 / 19 / 25 cards */
  var LEVELS = {
    1: { cap: 5, k: 0.045, slip: 0.006, extend: 0.75 },
    2: { cap: 11, k: 0.05, slip: 0.002, extend: 0.6 },
    3: { cap: 22, k: 0.04, slip: 0.0008, extend: 0.3 }
  };

  function load(s) {
    var line = E.line(s);
    return E.runs(line) + 0.25 * line.length;
  }

  /* how likely this CPU is to get the next answer wrong (also shown in tests) */
  function slipChance(s, level) {
    var L = LEVELS[level] || LEVELS[2];
    if (s.phase !== 'answer' || !s.mem.length) return 0;
    var top = s.mem[s.mem.length - 1];
    var age = s.ply - (s.seen[top] || 0);
    if (age <= 2) return 0;                         // just shown: everyone saw it
    var over = Math.max(0, load(s) - L.cap);
    var pr = L.slip + over * L.k;
    if (age <= 4) pr *= 0.35;
    return Math.min(0.45, pr);
  }

  function answer(s, p, level, rng) {
    rng = rng || Math.random;
    var top = s.mem[s.mem.length - 1];
    var right = E.digit(top);
    return rng() < slipChance(s, level) ? 1 - right : right;
  }

  /* which card to lay on top of the memory pile */
  function add(s, p, level, rng) {
    rng = rng || Math.random;
    var L = LEVELS[level] || LEVELS[2];
    var hand = s.hands[p].filter(function (c) { return !E.isPen(c); });
    if (!hand.length) return null;
    var nextTo = s.mem.length ? E.digit(s.mem[s.mem.length - 1]) : -1;   // the card the new one will sit against
    var want;
    if (nextTo < 0) want = rng() < 0.5 ? 0 : 1;
    else want = rng() < L.extend ? nextTo : 1 - nextTo;
    var pick = hand.filter(function (c) { return E.digit(c) === want; });
    if (!pick.length) pick = hand;
    // keep a mix of colours in hand: give up the colour there is more of
    var blacks = hand.filter(function (c) { return E.black(c); }).length, whites = hand.length - blacks;
    var prefer = blacks > whites ? 1 : whites > blacks ? 0 : (rng() < 0.5 ? 0 : 1);
    var best = pick.filter(function (c) { return E.black(c) === prefer; });
    var from = best.length ? best : pick;
    return from[Math.floor(rng() * from.length)];
  }

  function act(s, p, level, rng) {
    if (s.phase === 'answer') return { t: 'answer', v: answer(s, p, level, rng) };
    if (s.phase === 'add') { var c = add(s, p, level, rng); return c == null ? null : { t: 'add', card: c }; }
    return null;
  }

  return { LEVELS: LEVELS, load: load, slipChance: slipChance, answer: answer, add: add, act: act };
});
