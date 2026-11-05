// Touch gestures share the same thresholds in the table and the card viewer.
export function bindZoomGestures(surface, { zoom, pan, canPan }) {
  const pointers = new Map();
  let dragged = false;

  function capture(id) {
    if (!surface.hasPointerCapture(id)) surface.setPointerCapture(id);
  }

  surface.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!pointers.size) dragged = false;
    const { clientX: x, clientY: y, pointerId } = event;
    pointers.set(pointerId, { x, y, startX: x, startY: y });
    if (pointers.size >= 2) {
      dragged = true;
      for (const id of pointers.keys()) capture(id);
    }
  });

  surface.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    const { clientX: x, clientY: y } = event;
    if (pointers.size >= 2) {
      const [a, b] = pointers.values();
      if (point !== a && point !== b) return;
      const previous = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const oldDistance = Math.hypot(a.x - b.x, a.y - b.y);
      point.x = x;
      point.y = y;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (oldDistance > 1 && distance > 1) {
        zoom(distance / oldDistance, previous, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      return;
    }

    if (!dragged && Math.hypot(x - point.startX, y - point.startY) >= 8) {
      dragged = true;
      capture(event.pointerId);
    }
    if (dragged && canPan()) pan(x - point.x, y - point.y);
    point.x = x;
    point.y = y;
  });

  function end(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (dragged) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // Stop a pan or pinch before the canvas can interpret its release as a pick.
  surface.addEventListener('pointerup', end, true);
  surface.addEventListener('pointercancel', end, true);
  surface.addEventListener('click', (event) => {
    if (dragged && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  surface.addEventListener('pointerleave', (event) => {
    if (!surface.hasPointerCapture(event.pointerId)) pointers.delete(event.pointerId);
  });
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createBoardZoom(surface, slider, percent, resetButton, onChange) {
  let scale = 1;
  let x = 0;
  let y = 0;

  function render() {
    x = clamp(x, (1 - scale) * surface.clientWidth, 0);
    y = clamp(y, (1 - scale) * surface.clientHeight, 0);
    surface.style.setProperty('--board-zoom', scale);
    surface.style.setProperty('--board-x', `${x}px`);
    surface.style.setProperty('--board-y', `${y}px`);
    const percentage = Math.round(scale * 100);
    slider.value = percentage;
    slider.setAttribute('aria-valuetext', `${percentage}%`);
    percent.textContent = `${percentage}%`;
    resetButton.disabled = scale === 1;
    onChange();
  }

  function zoom(factor, from, to = from) {
    const rect = surface.getBoundingClientRect();
    const next = clamp(scale * factor, 1, 3);
    const ratio = next / scale;
    x = to.x - rect.left - (from.x - rect.left - x) * ratio;
    y = to.y - rect.top - (from.y - rect.top - y) * ratio;
    scale = next;
    render();
  }

  function reset() {
    scale = 1;
    x = 0;
    y = 0;
    render();
  }

  bindZoomGestures(surface, {
    zoom,
    pan(dx, dy) {
      x += dx;
      y += dy;
      render();
    },
    canPan: () => scale > 1
  });
  surface.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1 / 1.12 : 1.12, { x: event.clientX, y: event.clientY });
  }, { passive: false });
  slider.addEventListener('input', () => {
    const rect = surface.getBoundingClientRect();
    zoom(Number(slider.value) / 100 / scale, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  });
  resetButton.addEventListener('click', reset);
  new ResizeObserver(render).observe(surface);

  return {
    reset,
    project(point) {
      return { x: point.x * scale + x, y: point.y * scale + y };
    }
  };
}
