/* ファンタジーレルムズ — the CPUs think here so the table never stutters. */
importScripts('engine.js?v=1', 'ai.js?v=1');
self.onmessage = function (e) {
  var d = e.data || {};
  var a = null;
  try { a = self.GS_AI.choose(d.view, { level: d.level, seed: d.seed }); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
