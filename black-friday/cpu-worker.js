/* ブラックフライデー — the CPU thinks here, off the main thread, so the animations stay smooth.
   { id, view, level, seed, params, boost } → { id, a }
   { k: 'tune', job, n } → progress…, tuned   (the learning rival's practice, assets/rival-tune.js) */
importScripts('engine.js?v=1', 'ai.js?v=20261021-rival', '../assets/rival-tune.js?v=2');
onmessage = function (e) {
  var d = e.data || {}, a = null;
  if (d.k === 'tune') {
    var res = null;
    try {
      res = RIVAL_TUNE.run(d.job, function (x, y, seed, swap) { return BF_AI.practice(x, y, seed, swap, d.n || 3); },
        function (p) { postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    postMessage({ k: 'tuned', res: res });
    return;
  }
  try {
    var rng = BF_AI._cpu.mulberry32(d.seed >>> 0);
    a = BF_AI.choose(d.view, d.level, rng, { params: d.params, boost: d.boost });
  } catch (err) { a = null; }
  postMessage({ id: d.id, a: a });
};
