/* ヒトモジ・バトル — the learning rival's practice games run here, so the page never stalls.
   { k: 'tune', job, n, mode } → { k: 'progress', p }…, { k: 'tuned', res }   (../assets/rival-tune.js) */
importScripts('engine.js?v=20261017', 'words.js?v=20261017', 'ai.js?v=20261022-rival', 'session.js?v=20261022-rival', '../assets/rival-tune.js?v=2');
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.k !== 'tune') return;
  var res = null;
  try {
    res = self.RIVAL_TUNE.run(d.job, function (a, b, seed, swap) { return self.HMB_SES.practice(a, b, seed, swap, d.n || 3, d.mode || 'ja'); },
      function (p) { self.postMessage({ k: 'progress', p: p }); });
  } catch (err) { res = null; }
  self.postMessage({ k: 'tuned', res: res });
};
