// Keyboard + mouse + touch (floating joystick on the left, drag-to-look on the right, pinch to zoom).
export class Input {
  constructor(layer, opts) {
    this.layer = layer;
    this.keys = new Set();
    this.btn = { up: false, down: false, boost: false };
    this.jumpQ = false;
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.looks = new Map();
    this.pinch = 0;
    this.onAction = opts.onAction || (() => {});
    this.joyEl = opts.joyEl; this.knobEl = opts.knobEl;
    this.enabled = false;
    this.mouseDrag = null;
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.btn.up = this.btn.down = this.btn.boost = false; this.releaseJoy(); });
    layer.addEventListener('pointerdown', (e) => this.pdown(e));
    addEventListener('pointermove', (e) => this.pmove(e), { passive: false });
    addEventListener('pointerup', (e) => this.pup(e));
    addEventListener('pointercancel', (e) => this.pup(e));
    layer.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY); }, { passive: false });
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  key(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const c = e.code;
    if (down) {
      if (!this.keys.has(c)) {
        if (c === 'Space') this.jumpQ = true;
        const act = { KeyF: 'fly', KeyV: 'view', KeyM: 'map', KeyT: 'time', KeyH: 'help', Escape: 'escape', KeyR: 'reset' }[c];
        if (act) this.onAction(act);
      }
      this.keys.add(c);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c) && this.enabled) e.preventDefault();
    } else this.keys.delete(c);
  }
  pdown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      this.mouseDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { this.layer.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    e.preventDefault();
    const w = innerWidth;
    if (e.clientX < w * 0.42 && this.joy.id === null) {
      const j = this.joy; j.id = e.pointerId; j.ox = e.clientX; j.oy = e.clientY; j.x = 0; j.y = 0;
      if (this.joyEl) { this.joyEl.classList.add('on'); this.joyEl.style.left = e.clientX + 'px'; this.joyEl.style.top = e.clientY + 'px'; this.knobEl.style.transform = 'translate(-50%,-50%)'; }
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.looks.size === 2) this.pinch = this.pinchDist();
    }
  }
  pinchDist() { const a = [...this.looks.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  pmove(e) {
    if (this.mouseDrag && e.pointerId === this.mouseDrag.id) {
      this.lookX += (e.clientX - this.mouseDrag.x) * 0.0042; this.lookY += (e.clientY - this.mouseDrag.y) * 0.0042;
      this.mouseDrag.x = e.clientX; this.mouseDrag.y = e.clientY;
      return;
    }
    if (e.pointerId === this.joy.id) {
      const R = 58, j = this.joy;
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      j.x = dx / R; j.y = -dy / R;
      if (this.knobEl) this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      e.preventDefault();
      return;
    }
    const p = this.looks.get(e.pointerId);
    if (p) {
      if (this.looks.size >= 2) {
        p.x = e.clientX; p.y = e.clientY;
        const d = this.pinchDist();
        if (this.pinch > 0) this.zoom += (this.pinch - d) * 0.03;
        this.pinch = d;
      } else {
        this.lookX += (e.clientX - p.x) * 0.0068; this.lookY += (e.clientY - p.y) * 0.0068;
        p.x = e.clientX; p.y = e.clientY;
      }
      e.preventDefault();
    }
  }
  pup(e) {
    if (this.mouseDrag && e.pointerId === this.mouseDrag.id) this.mouseDrag = null;
    if (e.pointerId === this.joy.id) this.releaseJoy();
    if (this.looks.delete(e.pointerId)) this.pinch = this.looks.size === 2 ? this.pinchDist() : 0;
  }
  releaseJoy() {
    this.joy.id = null; this.joy.x = this.joy.y = 0;
    if (this.joyEl) { this.joyEl.classList.remove('on'); this.joyEl.style.left = ''; this.joyEl.style.top = ''; }
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%,-50%)';
  }
  bindHold(el, name) {
    const on = (e) => { e.preventDefault(); this.btn[name] = true; el.classList.add('held'); if (name === 'up') this.jumpQ = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { this.btn[name] = false; el.classList.remove('held'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  read() {
    const k = this.keys;
    let mx = this.joy.x, my = this.joy.y;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    mx = Math.max(-1, Math.min(1, mx)); my = Math.max(-1, Math.min(1, my));
    const out = {
      mx, my,
      up: this.btn.up || k.has('Space') || k.has('KeyE'),
      down: this.btn.down || k.has('KeyC') || k.has('KeyQ') || k.has('ControlLeft'),
      boost: this.btn.boost || k.has('ShiftLeft') || k.has('ShiftRight'),
      jump: this.jumpQ,
      lookX: this.lookX, lookY: this.lookY, zoom: this.zoom,
    };
    this.jumpQ = false; this.lookX = 0; this.lookY = 0; this.zoom = 0;
    if (!this.enabled) { out.mx = out.my = 0; out.up = out.down = out.boost = out.jump = false; out.lookX = out.lookY = out.zoom = 0; }
    return out;
  }
}
