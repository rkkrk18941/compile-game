/* スカルキング — the CPUs think here so the table never stutters.
   { id, view, level, seed, params, boost } → { id, a }
   { k: 'tune', job, n, opts } → progress…, tuned   (the learning rival's practice, ../assets/rival-tune.js) */
importScripts('engine.js?v=20261021-score', 'ai.js?v=20261021-rival', '../assets/rival-tune.js?v=2');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k === 'tune') {
    var res = null;
    try {
      res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.SK_AI.practice(a, b, seed, swap, d.n || 4, d.opts); },
        function (p) { self.postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    self.postMessage({ k: 'tuned', res: res });
    return;
  }
  var a = null;
  try { a = self.SK_AI.choose(d.view, { level: d.level, seed: d.seed, params: d.params, boost: d.boost }); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
