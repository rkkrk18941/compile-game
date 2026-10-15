/* ハシッコ・セブン — the CPU thinks here so the table never stutters. */
importScripts('engine.js', 'ai.js');
self.onmessage = function (e) {
  var d = e.data || {};
  var a = null;
  try { a = self.HSV_AI.choose(d.view, d.level, self.HSV_ENG.mulberry32(d.seed >>> 0), d.mind || null); } catch (err) { a = null; }
  self.postMessage({ id: d.id, a: a });
};
