/* ガイスター — the CPU thinks here so the board never stutters.
   { id, view, level, seed, extra }          → { id, a, info }   a move, decided from that player's view only
   { id, k: 'setup', level, seed, extra }    → { id, layout }    where the CPU puts its good and bad ghosts
   { k: 'tune', job }                        → progress…, tuned  the learning rival's practice (../assets/rival-tune.js) */
importScripts('engine.js?v=20261025-1', 'ai.js?v=20261025-1', '../assets/rival-tune.js?v=2');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k === 'tune') {
    var res = null;
    try {
      res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.GST_AI.practice(a, b, seed, swap, 2); },
        function (p) { self.postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    self.postMessage({ k: 'tuned', res: res });
    return;
  }
  var rng = self.GST_ENG.mulberry32(d.seed >>> 0);
  if (d.k === 'setup') {
    var layout = null;
    try { layout = self.GST_AI.setupFor(d.level, rng, d.extra || {}); } catch (err) { layout = null; }
    self.postMessage({ id: d.id, layout: layout });
    return;
  }
  var a = null;
  try { a = self.GST_AI.choose(d.view, d.level, rng, d.extra || {}); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a, info: self.GST_AI.choose.lastInfo || null });
};
