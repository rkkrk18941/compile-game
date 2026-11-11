// Keyboard + mouse (pointer lock) and touch (virtual stick, drag-to-look, buttons).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.held = {};        // action -> bool
    this.pressed = {};     // action -> true for one frame
    this.touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.sensitivity = +(localStorage.getItem("island.sens") || 1);
    this.invertY = localStorage.getItem("island.invertY") === "1";
    this.locked = false;
    this.enabled = true;
    this.zoom = 0;
    this.bindKeys = {
      KeyW: "fwd", ArrowUp: "fwd", KeyS: "back", ArrowDown: "back", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
      ShiftLeft: "sprint", ShiftRight: "sprint", KeyC: "crouch", ControlLeft: "crouch", Space: "jump",
      KeyE: "interact", KeyR: "radio", KeyQ: "antenna", KeyF: "light", KeyM: "map", Tab: "notebook", KeyN: "memo",
      KeyV: "view", KeyG: "item", Digit1: "slot1", Digit2: "slot2", Digit3: "slot3", Digit4: "slot4", KeyH: "heal",
      Escape: "menu", KeyP: "menu",
    };
    addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const a = this.bindKeys[e.code];
      if (!a) return;
      if (a === "notebook" || e.code === "Space") e.preventDefault();
      if (!this.held[a]) this.pressed[a] = true;
      this.held[a] = true;
    });
    addEventListener("keyup", (e) => {
      const a = this.bindKeys[e.code];
      if (a) this.held[a] = false;
    });
    addEventListener("blur", () => { this.held = {}; });
    canvas.addEventListener("mousedown", (e) => {
      if (this.touch) return;
      if (!this.locked && this.enabled) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.held.scan = true; this.pressed.scan = true; }
      if (e.button === 2) { this.held.aim = true; this.pressed.aim = true; }
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.held.scan = false;
      if (e.button === 2) this.held.aim = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.held.scan = false; this.held.aim = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX * 0.0022 * this.sensitivity;
      this.lookDY += e.movementY * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
    });
    addEventListener("wheel", (e) => { if (this.locked) this.zoom += Math.sign(e.deltaY); }, { passive: true });
    if (this.touch) this._setupTouch();
  }

  _setupTouch() {
    const joy = document.getElementById("joy");
    const knob = document.getElementById("knob");
    let joyId = null, jx = 0, jy = 0;
    const R = 52;
    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };
    joy.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      jx = r.left + r.width / 2;
      jy = r.top + r.height / 2;
      moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== joyId) return;
      let dx = e.clientX - jx, dy = e.clientY - jy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      setKnob(dx, dy);
      this.move.x = dx / R;
      this.move.y = -dy / R;
      // pushing the stick to the rim runs
      this.held.sprintStick = l > R * 0.98 && -dy / R > 0.6;
    };
    joy.addEventListener("pointermove", moveJoy);
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      this.move.x = this.move.y = 0;
      this.held.sprintStick = false;
      setKnob(0, 0);
    };
    joy.addEventListener("pointerup", endJoy);
    joy.addEventListener("pointercancel", endJoy);

    // drag anywhere else (not on a control) to look around
    const look = new Map();
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      look.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      const p = look.get(e.pointerId);
      if (!p) return;
      this.lookDX += (e.clientX - p.x) * 0.0058 * this.sensitivity;
      this.lookDY += (e.clientY - p.y) * 0.0058 * this.sensitivity * (this.invertY ? -1 : 1);
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => look.delete(e.pointerId);
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);

    // buttons: data-act="name" (held while pressed), data-toggle="name" (latched)
    document.querySelectorAll("[data-act]").forEach((b) => {
      const a = b.dataset.act;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        this.held[a] = true;
        this.pressed[a] = true;
        b.classList.add("on");
      });
      const up = () => { this.held[a] = false; b.classList.remove("on"); };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("lostpointercapture", up);
    });
    document.querySelectorAll("[data-toggle]").forEach((b) => {
      const a = b.dataset.toggle;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.held[a] = !this.held[a];
        this.pressed[a] = true;
        b.classList.toggle("on", !!this.held[a]);
      });
    });
  }

  setToggle(a, v) {
    this.held[a] = v;
    const b = document.querySelector(`[data-toggle="${a}"]`);
    if (b) b.classList.toggle("on", !!v);
  }

  /** Read movement intent from keys + stick. */
  axes() {
    let x = this.move.x, y = this.move.y;
    if (this.held.fwd) y += 1;
    if (this.held.back) y -= 1;
    if (this.held.left) x -= 1;
    if (this.held.right) x += 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  consumeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return r;
  }
  wasPressed(a) { return !!this.pressed[a]; }
  endFrame() { this.pressed = {}; this.zoom = 0; }
}
