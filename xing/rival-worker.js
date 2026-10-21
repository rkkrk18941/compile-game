/* ×ing／バッティング — the learning rival's practice games, away from the table.
   { k: 'tune', job, n } → progress…, tuned   (assets/rival-tune.js with engine.js practice games) */
importScripts('engine.js?v=20261022-rival', '../assets/rival-tune.js?v=1');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k !== 'tune') return;
  var res = null;
  try {
    res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.XING_ENG.practice(a, b, seed, swap, d.n || 3); },
      function (p) { self.postMessage({ k: 'progress', p: p }); });
  } catch (err) { res = null; }
  self.postMessage({ k: 'tuned', res: res });
};
