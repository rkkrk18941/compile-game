/* 宝石の煌めき — the CPU thinks here so the table never stutters.
   { id, view, level, seed, extra }   → { id, turn, info }   a turn decided from that seat's view only
   { k: 'tune', job }                 → progress…, tuned     the learning rival's practice (../assets/rival-tune.js) */
importScripts('engine.js?v=20261031-1', 'ai.js?v=20261031-1', '../assets/rival-tune.js?v=2');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k === 'tune') {
    var res = null;
    try {
      res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.SPL_AI.practice(a, b, seed, swap, 2); },
        function (p) { self.postMessage({ k: 'progress', p: p }); });
    } catch (err) { res = null; }
    self.postMessage({ k: 'tuned', res: res });
    return;
  }
  var turn = null, info = null;
  try {
    turn = self.SPL_AI.choose(d.view, d.level, self.SPL_ENG.mulberry32(d.seed >>> 0), d.extra || {});
    info = self.SPL_AI.choose.lastInfo || null;
  } catch (err) { turn = null; info = { error: String(err && err.message || err) }; }
  self.postMessage({ id: d.id, turn: turn, info: info });
};
