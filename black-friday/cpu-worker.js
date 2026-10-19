/* ブラックフライデー — the CPU thinks here, off the main thread, so the animations stay smooth. */
importScripts('engine.js?v=1', 'ai.js?v=1');
onmessage = function (e) {
  var d = e.data || {}, a = null;
  try {
    var rng = BF_AI._cpu.mulberry32(d.seed >>> 0);
    a = BF_AI.choose(d.view, d.level, rng);
  } catch (err) { a = null; }
  postMessage({ id: d.id, a: a });
};
