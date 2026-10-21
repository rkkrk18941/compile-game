/* PLAYROOM — the learning rival's practice (runs in a game's CPU worker, or in node for tests).

   RIVAL_TUNE.run(job, play, post) → { params, score: { w, l, d }, games, tried, accepted }
     job   { params, space, timeMs, seed }   space: { key: { min, max, step } }
     play  (a, b, seed, swap) → the result for strategy a against strategy b: 1 win, 0.5 draw, 0 loss.
           The same seed with swap=false / true deals the same game with the seats exchanged, so luck cancels out.
     post  (progress) optional: { games, tried, accepted }

   It is a careful hill climb: try a small change to one or two values, play paired games against the current
   strategy, give up on the change as soon as it is clearly not better, adopt it only when it wins clearly.
   Whatever time is left goes to the next idea. Nothing changes unless a change has proved itself. */
(function (root) {
  'use strict';
  function rng32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      var t = (a = (a + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function clone(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
  function snap(v, sp) {
    var s = sp.step || 0.01;
    v = Math.round((v - sp.min) / s) * s + sp.min;
    v = Math.max(sp.min, Math.min(sp.max, v));
    return Math.round(v * 1e6) / 1e6;
  }
  function mutate(p, space, rnd) {
    var keys = Object.keys(space).filter(function (k) { return typeof p[k] === 'number'; });
    if (!keys.length) return null;
    var c = clone(p), n = rnd() < 0.7 ? 1 : 2, changed = 0;
    for (var t = 0; t < 8 && changed < n; t++) {
      var k = keys[Math.floor(rnd() * keys.length)], sp = space[k];
      var dir = rnd() < 0.5 ? -1 : 1, mag = rnd() < 0.75 ? 1 : 2;
      var v = snap(p[k] + dir * mag * (sp.step || 0.01), sp);
      if (v === p[k]) v = snap(p[k] - dir * mag * (sp.step || 0.01), sp);
      if (v !== p[k] && c[k] === p[k]) { c[k] = v; changed++; }
    }
    return changed ? c : null;
  }

  /* A sequential test on paired games: after each pair, the mean result m of the challenger and its standard error.
     Adopt when m is more than z standard errors above one half (once at least minPairs pairs are in), drop it as
     soon as it is clearly not better. Slow games get few pairs, so they adopt rarely — and only what has proved. */
  function run(job, play, post) {
    var space = job.space || {}, start = clone(job.params || {}), champ = clone(start);
    var rnd = rng32(job.seed || 1), end = now() + (job.timeMs || 15000);
    var minPairs = job.minPairs || 4, maxPairs = job.maxPairs || 12, z = job.z || 2;
    var games = 0, tried = 0, accepted = 0, score = null;
    var tell = function () { if (post) post({ games: games, tried: tried, accepted: accepted }); };
    var lastTell = 0;
    while (now() < end) {
      var cand = mutate(champ, space, rnd);
      if (!cand) break;
      tried++; tell();
      var w = 0, l = 0, d = 0, pts = 0, sq = 0, pairs = 0, verdict = 0;
      for (var i = 0; i < maxPairs; i++) {
        if (now() > end) break;
        var seed = (rnd() * 4294967296) >>> 0, pair = 0;
        for (var side = 0; side < 2; side++) {
          var r = play(cand, champ, seed, side === 1);
          games++; pair += r;
          if (r > 0.75) w++; else if (r < 0.25) l++; else d++;
        }
        pair /= 2; pts += pair; sq += pair * pair; pairs++;
        if (now() - lastTell > 150) { lastTell = now(); tell(); }
        if (pairs >= minPairs) {
          var m = pts / pairs, varr = Math.max(1e-4, sq / pairs - m * m), se = Math.sqrt(varr / pairs);
          if (m - z * se > 0.5 && w > l) { verdict = 1; break; }
          if (m + se < 0.5 || (pairs >= minPairs * 2 && m < 0.5)) { verdict = -1; break; }   // not better: next idea
        }
      }
      if (verdict === 1) { champ = cand; accepted++; score = { w: w, l: l, d: d }; }
      tell();
    }
    return { params: champ, score: score, games: games, tried: tried, accepted: accepted };
  }

  var api = { run: run, mutate: mutate, rng32: rng32 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RIVAL_TUNE = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
