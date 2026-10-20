/* Price-board camera: one touch belongs to the page; two touches zoom/pan the board. */
(function (root) {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function geometry(width, prices, targets) {
    const cw = Math.max(24, Math.floor((width - 56) / 7));
    const pieceW = clamp(Math.round(cw * .82), 24, 48);
    const pieceH = clamp(Math.round(cw * .45), 20, 28);
    const font = clamp(Math.round(cw * .28), 11, 16), band = font + 5;
    const rowHeights = Array(13).fill(Math.max(band + 4, Math.round(cw * .38)));
    const occupants = new Map();
    for (const positions of [prices, targets || prices]) positions.forEach((cell, color) => {
      if (!occupants.has(cell)) occupants.set(cell, new Set());
      occupants.get(cell).add(color);
    });
    occupants.forEach((colors, cell) => {
      const r = Math.floor(cell / 7);
      rowHeights[r] = Math.max(rowHeights[r], band + colors.size * (pieceH + 3) + 3);
    });
    let height = 0;
    const rowTop = rowHeights.map(h => { const top = height; height += h; return top; });
    return { cw, ch: band + pieceH + 6, pieceW, pieceH, font, band, rowHeights, rowTop, height, width: cw * 7 + 56, prices: prices.slice(), targets: (targets || prices).slice() };
  }
  function point(g, cell, color) {
    const slot = g.prices.reduce((n, p, i) => n + (i < color && (p === cell || g.targets[i] === cell) ? 1 : 0), 0);
    return [(cell % 7 + .5) * g.cw, g.rowTop[Math.floor(cell / 7)] + g.band + 3 + g.pieceH / 2 + slot * (g.pieceH + 3)];
  }
  function create(viewport, surface, onChange) {
    const state = { zoom: 1, x: 0, y: 0, fit: 1, width: 1, height: 1, viewW: 1, viewH: 1 };
    let pinch = null, multiTouch = false, drag = null;
    const listeners = [];
    const listen = (type, fn, options) => { viewport.addEventListener(type, fn, options); listeners.push([type, fn, options]); };
    function draw() {
      const s = state.fit * state.zoom;
      state.x = clamp(state.x, Math.min(0, state.viewW - state.width * s), 0);
      state.y = clamp(state.y, Math.min(0, state.viewH - state.height * s), 0);
      surface.style.transform = `translate(${state.x}px,${state.y}px) scale(${s})`;
      viewport.classList.toggle('is-zoomed', state.zoom > 1.01);
      if (onChange) onChange(state.zoom);
    }
    function setZoom(zoom, x = state.viewW / 2, y = state.viewH / 2) {
      zoom = clamp(zoom, 1, 4);
      const ratio = zoom / state.zoom;
      state.x = x - (x - state.x) * ratio;
      state.y = y - (y - state.y) * ratio;
      state.zoom = zoom;
      draw();
    }
    function touchPoint(e) {
      const [a, b] = e.touches, rect = viewport.getBoundingClientRect();
      return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top, d: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) };
    }
    listen('touchstart', e => {
      if (e.touches.length !== 2) return;
      e.preventDefault(); multiTouch = true;
      const p = touchPoint(e);
      pinch = { ...p, zoom: state.zoom, panX: state.x, panY: state.y };
    }, { passive: false });
    listen('touchmove', e => {
      if (!multiTouch) return; // A single-finger swipe never gets cancelled or moves this camera.
      e.preventDefault();
      if (!pinch || e.touches.length !== 2) return;
      const p = touchPoint(e), zoom = clamp(pinch.zoom * p.d / pinch.d, 1, 4), ratio = zoom / pinch.zoom;
      state.zoom = zoom;
      state.x = p.x - (pinch.x - pinch.panX) * ratio;
      state.y = p.y - (pinch.y - pinch.panY) * ratio;
      draw();
    }, { passive: false });
    const endTouch = e => { pinch = null; if (!e.touches.length) multiTouch = false; };
    listen('touchend', endTouch, { passive: true });
    listen('touchcancel', () => { pinch = null; multiTouch = false; }, { passive: true });
    listen('wheel', e => {
      if (!e.ctrlKey) return; // Ordinary wheel scrolling also belongs to the page.
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      setZoom(state.zoom * Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    listen('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || state.zoom <= 1 || e.target.closest('button')) return;
      e.preventDefault(); drag = { x: e.clientX, y: e.clientY, panX: state.x, panY: state.y };
      viewport.setPointerCapture(e.pointerId);
    });
    listen('pointermove', e => { if (drag) { state.x = drag.panX + e.clientX - drag.x; state.y = drag.panY + e.clientY - drag.y; draw(); } });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, () => { drag = null; });
    return {
      state,
      resize(width, height, fitHeight) {
        state.width = width; state.height = height; state.viewW = viewport.clientWidth;
        state.fit = Math.min(1, state.viewW / width, fitHeight ? fitHeight / height : 1);
        state.viewH = Math.ceil(height * state.fit);
        viewport.style.height = state.viewH + 'px';
        draw();
      },
      zoomBy(delta) { setZoom(Math.round((state.zoom + delta) * 100) / 100); },
      fit() { state.zoom = 1; state.x = 0; state.y = 0; draw(); },
      focus(x, y) { if (state.zoom <= 1) return; const s = state.fit * state.zoom; state.x = state.viewW / 2 - x * s; state.y = state.viewH / 2 - y * s; draw(); },
      destroy() { listeners.forEach(args => viewport.removeEventListener(...args)); }
    };
  }
  const api = { geometry, point, create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BF_BOARD_VIEW = api;
})(typeof window !== 'undefined' ? window : globalThis);
