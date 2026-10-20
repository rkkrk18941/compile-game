import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../gensou-seven/table-camera.js');
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }
for (const [vw, vh] of [[320, 360], [393, 510], [800, 300], [1440, 850]]) {
  for (const [ww, wh] of [[1000, 100], [1000, 1550], [1360, 1050]]) {
    const p = C.fitPose(vw, vh, ww, wh);
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.ok(p.x + ww * p.scale <= vw + 0.001);
    assert.ok(p.y + wh * p.scale <= vh - 48 + 0.001);
  }
}
const before = { x: -150, y: -200, scale: 0.7 }, from = { x: 120, y: 80 }, to = { x: 170, y: 130 };
const after = C.zoomPose(before, 1.4, from, to);
near((from.x - before.x) / before.scale, (to.x - after.x) / after.scale);
near((from.y - before.y) / before.scale, (to.y - after.y) / after.scale);
class Classes {
  values = new Set();
  contains(v) { return this.values.has(v); }
  toggle(v, force) { const yes = force ?? !this.values.has(v); if (yes) this.values.add(v); else this.values.delete(v); return yes; }
}
class Events {
  listeners = {};
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(v => v !== f); }
  emit(t, data = {}) {
    const event = { target: this, cancelable: true, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...data };
    for (const f of this.listeners[t] || []) { f(event); if (event.stopped) break; }
    return event;
  }
  closest() { return null; }
}
const frames = [];
const win = new Events();
win.requestAnimationFrame = f => { frames.push(f); return frames.length; };
win.cancelAnimationFrame = () => {};
function flush() { while (frames.length) frames.shift()(); }
const viewport = new Events();
viewport.clientWidth = 393; viewport.clientHeight = 510;
viewport.ownerDocument = { defaultView: win }; viewport.classList = new Classes();
viewport.getBoundingClientRect = () => ({ left: 10, top: 20 });
let captures = 0; viewport.setPointerCapture = () => captures++;
const world = { offsetWidth: 1000, offsetHeight: 1100, style: {}, classList: new Classes() };
const output = { textContent: '' };
const buttons = ['in', 'out', 'fit'].map(value => {
  const b = new Events(); b.getAttribute = () => value; b.closest = s => s === '.table-tools' ? {} : null; return b;
});
viewport.querySelector = () => output; viewport.querySelectorAll = () => buttons;
const camera = C.create(viewport, world); flush();
assert.equal(output.textContent, '100%'); assert.equal(camera.snapshot().fitting, true);
// A tap must reach the existing card action and must not acquire pointer capture.
viewport.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
viewport.emit('pointerup', { pointerId: 1 });
assert.equal(viewport.emit('click').prevented, undefined); assert.equal(captures, 0);
// Manual zoom survives a hand re-render or score-height update.
camera.zoom(3); const manual = camera.snapshot(); world.offsetHeight += 80; camera.refresh(); flush();
assert.equal(camera.snapshot().fitting, false); near(camera.snapshot().pose.scale, manual.pose.scale);
near(camera.snapshot().pose.x, manual.pose.x); near(camera.snapshot().pose.y, manual.pose.y);
// Dragging moves the camera and suppresses the click that would select/discard a card.
viewport.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100 });
const dragBefore = camera.snapshot().pose;
viewport.emit('pointermove', { pointerId: 2, clientX: 160, clientY: 145 });
viewport.emit('pointerup', { pointerId: 2 });
assert.notEqual(camera.snapshot().pose.x, dragBefore.x); assert.ok(captures > 0);
assert.equal(viewport.emit('click').prevented, true);
// Two touches zoom by their distance ratio, and pointer cancellation ends the gesture.
viewport.emit('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 90, clientY: 100 });
viewport.emit('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 190, clientY: 100 });
const pinchBefore = camera.snapshot().pose.scale;
viewport.emit('pointermove', { pointerId: 4, clientX: 290, clientY: 100 });
near(camera.snapshot().pose.scale, pinchBefore * 2);
viewport.emit('pointercancel', { pointerId: 3 }); viewport.emit('pointercancel', { pointerId: 4 });
assert.equal(viewport.classList.contains('panning'), false);
// Controls remain usable after gestures. Zoom is bounded and fit restores all cards.
buttons[0].emit('click'); assert.equal(camera.snapshot().fitting, false);
camera.zoom(1000); near(camera.snapshot().pose.scale / camera.snapshot().fitScale, 12);
camera.zoom(0.00001); near(camera.snapshot().pose.scale / camera.snapshot().fitScale, 0.35);
buttons[2].emit('click'); flush(); assert.equal(output.textContent, '100%');
const fitted = camera.snapshot(); assert.equal(fitted.fitting, true);
assert.ok(fitted.pose.y + world.offsetHeight * fitted.pose.scale < viewport.clientHeight - 48);
viewport.clientWidth = 900; viewport.clientHeight = 420; win.emit('resize'); flush();
assert.equal(world.classList.contains('wide'), true); assert.equal(output.textContent, '100%');
camera.destroy();
assert.equal((viewport.listeners.pointerdown || []).length, 0);
console.log('PASS: overview fit for phone/landscape/desktop, pinch anchoring, tap preservation, drag suppression, zoom persistence, bounds, reset and resize');
