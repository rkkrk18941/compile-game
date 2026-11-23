/* エレメンティカ — the CPU off the main thread, so the table keeps moving while it thinks. */
importScripts('engine.js?v=20261123a', 'ai.js?v=20261123a');
self.onmessage = function (e) {
  var d = e.data || {};
  var dec = null;
  try { dec = self.EL_AI.decide(d.state, d.level, self.EL_ENG.mulberry32(d.seed >>> 0)); } catch (err) { dec = null; }
  self.postMessage({ id: d.id, dec: dec });
};
