/* 風の怪物ピラデロ — the CPU off the main thread, so the table keeps moving while it thinks. */
importScripts('engine.js?v=20261105a', 'ai.js?v=20261105a');
self.onmessage = function (e) {
  var d = e.data || {};
  var act = null;
  try { act = self.PD_AI.decide(d.view, d.level, self.PD_ENG.mulberry32(d.seed >>> 0)); } catch (err) { act = null; }
  self.postMessage({ id: d.id, act: act });
};
