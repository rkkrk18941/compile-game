/* 80% — the bridge to the CrazyGames SDK (HTML5 v3).
   Every call is safe when the SDK is missing, blocked or disabled, so the same build also runs on any other host.
   window.EIGHTY_CG = { init, locale, getItem, setItem, loadingStart, loadingStop, gameplayStart, gameplayStop,
                        happytime, midgame, muted, onMute } */
(function (root) {
  'use strict';
  var sdk = null, playing = false, isMuted = false, muteCbs = [];
  function safe(fn) { try { if (sdk) return fn(sdk); } catch (e) { /* the game never depends on the SDK */ } return undefined; }

  async function init() {
    try {
      var S = root.CrazyGames && root.CrazyGames.SDK;
      if (!S) return;
      await Promise.race([S.init(), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('SDK init timed out')); }, 4000); })]);
      if (S.environment === 'disabled') return;
      sdk = S;
      safe(function (s) {
        isMuted = !!(s.game.settings && s.game.settings.muteAudio);
        s.game.addSettingsChangeListener(function (st) {
          isMuted = !!(st && st.muteAudio);
          muteCbs.forEach(function (cb) { try { cb(isMuted); } catch (e) { /* ignore */ } });
        });
      });
    } catch (e) { sdk = null; }
  }

  function locale() {
    var si = safe(function (s) { return s.user && s.user.systemInfo; });
    return (si && (si.locale || si.language)) || '';
  }

  /* saves: the SDK's data module when it is there (it follows the player's account), the browser otherwise */
  function getItem(k) {
    var v = safe(function (s) { return s.data.getItem(k); });
    if (v !== undefined) return v;
    try { return root.localStorage.getItem(k); } catch (e) { return null; }
  }
  function setItem(k, v) {
    var done = safe(function (s) { s.data.setItem(k, v); return true; });
    if (done) return;
    try { root.localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }

  function gameplayStart() { if (playing) return; playing = true; safe(function (s) { s.game.gameplayStart(); }); }
  function gameplayStop() { if (!playing) return; playing = false; safe(function (s) { s.game.gameplayStop(); }); }

  /* a break between matches. Always resolves; h.onStart / h.onEnd let the game mute and unmute. */
  function midgame(h) {
    h = h || {};
    return new Promise(function (resolve) {
      if (!sdk) { resolve(false); return; }
      var started = false, settled = false;
      function end(shown) {
        if (started && h.onEnd) { try { h.onEnd(); } catch (e) { /* ignore */ } }
        started = false;
        if (!settled) { settled = true; resolve(shown); }
      }
      var guard = setTimeout(function () { if (!started) end(false); }, 5000);
      try {
        sdk.ad.requestAd('midgame', {
          adStarted: function () { clearTimeout(guard); started = true; if (h.onStart) { try { h.onStart(); } catch (e) { /* ignore */ } } },
          adFinished: function () { clearTimeout(guard); end(true); },
          adError: function () { clearTimeout(guard); end(false); }
        });
      } catch (e) { clearTimeout(guard); end(false); }
    });
  }

  root.EIGHTY_CG = {
    init: init, locale: locale, getItem: getItem, setItem: setItem,
    loadingStart: function () { safe(function (s) { s.game.loadingStart(); }); },
    loadingStop: function () { safe(function (s) { s.game.loadingStop(); }); },
    gameplayStart: gameplayStart, gameplayStop: gameplayStop,
    happytime: function () { safe(function (s) { s.game.happytime(); }); },
    midgame: midgame,
    muted: function () { return isMuted; },
    onMute: function (cb) { muteCbs.push(cb); },
    get active() { return !!sdk; }
  };
})(window);
