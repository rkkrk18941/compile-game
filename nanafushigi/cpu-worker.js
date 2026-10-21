/* ナナフシギ・デュエル — the CPU thinks here so the table never stutters.
   { id, state, level, seed, extra } → { id, a }        a move (extra: { params, boost } for the learning rival)
   { k: 'tune', job }                → progress…, tuned  the learning rival's practice games (assets/rival-tune.js) */
importScripts('engine.js', 'ai.js?v=20261022-rival', '../assets/rival-tune.js?v=1');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k === 'tune') {
    var res = null;
    try {
      res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.NFD_AI.practice(a, b, seed, swap, 2); },
        function (p) { self.postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    self.postMessage({ k: 'tuned', res: res });
    return;
  }
  var a = null;
  try { a = self.NFD_AI.choose(d.state, d.level, self.NFD_ENG.mulberry32(d.seed >>> 0), d.extra || {}); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
