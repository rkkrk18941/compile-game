/* クリプティッド — the CPU players think here so the table never stutters.
   { id, kind: 'move'|'vote', view, level, seed, over } → { id, act | vote }
   { k: 'tune', job, n } → progress…, tuned   (the learning rival's practice, ../assets/rival-tune.js) */
importScripts('data.js?v=20261020a', 'engine.js?v=20261020a', 'ai.js?v=20261021-rival', '../assets/rival-tune.js?v=2');
self.onmessage = function (e) {
  var d = e.data || {}, out = { id: d.id };
  if (d.k === 'tune') {
    var res = null;
    try {
      res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.CRY_AI.practice(a, b, seed, swap, d.n || 3); },
        function (p) { self.postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    self.postMessage({ k: 'tuned', res: res });
    return;
  }
  try {
    var rng = self.CRY_ENG.mulberry32((d.seed >>> 0) || 1);
    if (d.kind === 'vote') out.vote = self.CRY_AI.voteHint(d.view, d.level, rng);
    else out.act = self.CRY_AI.choose(d.view, d.level, rng, d.over || undefined);
  } catch (err) { out.err = String(err && err.message || err); }
  self.postMessage(out);
};
