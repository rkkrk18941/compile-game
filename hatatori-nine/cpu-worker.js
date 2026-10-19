/* ハタトリ・ナイン — the CPU thinks here so the table never stutters. */
importScripts('engine.js?v=20261019-turn-1', 'ai.js?v=20261019-turn-1');
self.onmessage = function (e) {
  var d = e.data || {};
  var a = null;
  try { a = self.HTN_AI.choose(d.view, d.level, self.HTN_ENG.mulberry32(d.seed >>> 0)); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
