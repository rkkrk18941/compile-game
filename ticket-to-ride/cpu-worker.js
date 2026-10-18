/* チケット・トゥ・ライド — the CPU thinks here so the table never stutters. */
importScripts('map.js', 'engine.js', 'ai.js');
self.onmessage = function (e) {
  var d = e.data || {};
  var a = null;
  try { a = self.TTR_AI.choose(d.view, d.level, self.TTR_ENG.mulberry32(d.seed >>> 0)); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
