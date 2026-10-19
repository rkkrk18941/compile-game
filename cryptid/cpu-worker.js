/* クリプティッド — the CPU players think here so the table never stutters. */
importScripts('data.js?v=20261020a', 'engine.js?v=20261020a', 'ai.js?v=20261020a');
self.onmessage = function (e) {
  var d = e.data || {}, out = { id: d.id };
  try {
    var rng = self.CRY_ENG.mulberry32((d.seed >>> 0) || 1);
    if (d.kind === 'vote') out.vote = self.CRY_AI.voteHint(d.view, d.level, rng);
    else out.act = self.CRY_AI.choose(d.view, d.level, rng);
  } catch (err) { out.err = String(err && err.message || err); }
  self.postMessage(out);
};
