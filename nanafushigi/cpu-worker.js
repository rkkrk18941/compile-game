/* ナナフシギ・デュエル — the CPU thinks here so the table never stutters. */
importScripts('engine.js', 'ai.js');
self.onmessage = function (e) {
  var d = e.data || {};
  var a = null;
  try { a = self.NFD_AI.choose(d.state, d.level, self.NFD_ENG.mulberry32(d.seed >>> 0)); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
