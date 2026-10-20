/* Pan and zoom for the whole table; card taps remain normal clicks. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GS_TABLE_CAMERA = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fitPose(vw, vh, ww, wh) {
    var scale = Math.min(Math.max(1, vw - 16) / Math.max(1, ww), Math.max(1, vh - 64) / Math.max(1, wh));
    return { scale: scale, x: (vw - ww * scale) / 2, y: 8 + (Math.max(1, vh - 64) - wh * scale) / 2 };
  }
  function zoomPose(pose, scale, from, to) {
    to = to || from;
    return { scale: scale, x: to.x - (from.x - pose.x) * scale / pose.scale, y: to.y - (from.y - pose.y) * scale / pose.scale };
  }
  function create(viewport, world) {
    var win = viewport.ownerDocument.defaultView;
    var pose = { scale: 1, x: 0, y: 0 }, fit = pose, autoFit = true;
    var dims = { vw: 0, vh: 0, ww: 0, wh: 0 }, points = new Map(), pinch = null;
    var moved = false, ignoreClickUntil = 0, frame = null, destroyed = false, removers = [];
    var output = viewport.querySelector('[data-zoom-value]');
    function listen(el, type, fn, opts) { el.addEventListener(type, fn, opts); removers.push(function () { el.removeEventListener(type, fn, opts); }); }
    function clampScale(s) { return Math.max(fit.scale * 0.35, Math.min(fit.scale * 12, s)); }
    function constrain() {
      var w = dims.ww * pose.scale, h = dims.wh * pose.scale;
      pose.x = w <= dims.vw ? (dims.vw - w) / 2 : Math.max(dims.vw - w - dims.vw * 0.35, Math.min(dims.vw * 0.35, pose.x));
      pose.y = h <= dims.vh - 64 ? 8 + (dims.vh - 64 - h) / 2 : Math.max(dims.vh - 56 - h - dims.vh * 0.35, Math.min(dims.vh * 0.35, pose.y));
    }
    function paint() {
      world.style.transform = 'translate(' + pose.x + 'px,' + pose.y + 'px) scale(' + pose.scale + ')';
      if (output) output.textContent = Math.round(pose.scale / fit.scale * 100) + '%';
      viewport.classList.toggle('panning', moved && points.size > 0);
    }
    function layout() {
      frame = null;
      if (destroyed) return;
      var vw = viewport.clientWidth, vh = viewport.clientHeight;
      if (!vw || !vh) return;
      var wide = vw > vh * 1.25;
      if (wide !== world.classList.contains('wide')) { world.classList.toggle('wide', wide); autoFit = true; }
      var ww = world.offsetWidth, wh = world.offsetHeight;
      if (!ww || !wh) return;
      var previous = dims;
      dims = { vw: vw, vh: vh, ww: ww, wh: wh };
      fit = fitPose(vw, vh, ww, wh);
      if (autoFit) pose = { scale: fit.scale, x: fit.x, y: fit.y };
      else {
        if (previous.vw && (previous.vw !== vw || previous.vh !== vh)) pose = zoomPose(pose, clampScale(pose.scale), { x: previous.vw / 2, y: previous.vh / 2 }, { x: vw / 2, y: vh / 2 });
        constrain();
      }
      paint();
    }
    function refresh() { if (!destroyed && frame === null) frame = win.requestAnimationFrame(layout); }
    function reset() { autoFit = true; refresh(); }
    function zoom(factor, anchor) {
      if (!dims.vw) layout();
      anchor = anchor || { x: dims.vw / 2, y: (dims.vh - 48) / 2 };
      autoFit = false; pose = zoomPose(pose, clampScale(pose.scale * factor), anchor); constrain(); paint();
    }
    function local(e) { var r = viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function controls(e) { return e.target.closest && e.target.closest('.table-tools'); }
    function pair() {
      var p = Array.from(points.values()).slice(0, 2);
      return { center: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }, distance: Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) };
    }
    function capture(id) { try { viewport.setPointerCapture(id); } catch (e) {} }
    listen(viewport, 'pointerdown', function (e) {
      if (controls(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var p = local(e); points.set(e.pointerId, { x: p.x, y: p.y, startX: p.x, startY: p.y });
      if (points.size === 1) moved = false;
      if (points.size >= 2) { moved = true; pinch = pair(); points.forEach(function (_, id) { capture(id); }); ignoreClickUntil = Date.now() + 500; }
    });
    listen(viewport, 'pointermove', function (e) {
      var p = points.get(e.pointerId); if (!p) return;
      var now = local(e), old = { x: p.x, y: p.y }; p.x = now.x; p.y = now.y;
      if (points.size >= 2) {
        var next = pair();
        if (pinch) { autoFit = false; pose = zoomPose(pose, clampScale(pose.scale * next.distance / pinch.distance), pinch.center, next.center); constrain(); paint(); }
        pinch = next; moved = true;
      } else {
        var beginning = !moved;
        if (beginning && Math.hypot(p.x - p.startX, p.y - p.startY) < 7) return;
        moved = true; capture(e.pointerId); autoFit = false;
        pose.x += p.x - (beginning ? p.startX : old.x); pose.y += p.y - (beginning ? p.startY : old.y);
        constrain(); paint();
      }
      ignoreClickUntil = Date.now() + 500;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function end(e) {
      if (!points.has(e.pointerId)) return;
      points.delete(e.pointerId);
      if (moved) ignoreClickUntil = Date.now() + 500;
      pinch = points.size >= 2 ? pair() : null;
      points.forEach(function (p) { p.startX = p.x; p.startY = p.y; });
      if (!points.size) moved = false;
      paint();
    }
    listen(viewport, 'pointerup', end); listen(viewport, 'pointercancel', end); listen(viewport, 'lostpointercapture', end);
    listen(viewport, 'click', function (e) {
      if (!controls(e) && Date.now() < ignoreClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    listen(viewport, 'wheel', function (e) { if (controls(e)) return; e.preventDefault(); zoom(Math.exp(-Math.max(-180, Math.min(180, e.deltaY)) * 0.006), local(e)); }, { passive: false });
    listen(viewport, 'dragstart', function (e) { e.preventDefault(); });
    listen(viewport, 'keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || controls(e)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.25); }
      if (e.key === '-') { e.preventDefault(); zoom(0.8); }
      if (e.key === '0') { e.preventDefault(); reset(); }
    });
    viewport.querySelectorAll('[data-table-zoom]').forEach(function (button) {
      listen(button, 'click', function () { var value = button.getAttribute('data-table-zoom'); if (value === 'fit') reset(); else zoom(value === 'in' ? 1.25 : 0.8); });
    });
    var observer = win.ResizeObserver ? new win.ResizeObserver(refresh) : null;
    if (observer) { observer.observe(viewport); observer.observe(world); }
    listen(win, 'resize', refresh); refresh();
    return { refresh: refresh, reset: reset, zoom: zoom, snapshot: function () { return { pose: Object.assign({}, pose), fitting: autoFit, fitScale: fit.scale }; }, destroy: function () { destroyed = true; if (observer) observer.disconnect(); if (frame !== null) win.cancelAnimationFrame(frame); removers.forEach(function (remove) { remove(); }); } };
  }
  return { fitPose: fitPose, zoomPose: zoomPose, create: create };
});
