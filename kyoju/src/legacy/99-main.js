/* ---------- 起動 ---------- */
(function boot() {
  let booted = false;
  function start(data) {
    if (booted) return;
    booted = true;
    let st = null;
    try { if (data && data.save) st = sanitizeState(JSON.parse(JSON.stringify(data.save))); } catch (e) { st = null; }
    Store.state = st || Store.loadLocal() || newState();
    UI.init();
    Store.initCloud((cloud) => {
      if (UI.busy()) return;
      Store.state = cloud;
      Store.saveLocal();
      UI.refresh();
      UI.toast('保存された記録を読み込んだ');
    });
  }
  let hot = null;
  try { hot = window.claude && window.claude.hot; } catch (e) { hot = null; }
  try { if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: Store.state })); } catch (e) { /* 無視 */ }
  try {
    if (hot && typeof hot.ready === 'function') hot.ready(start);
    else start((hot && hot.data) || {});
  } catch (e) { start({}); }
  setTimeout(() => start({}), 1500);
})();
