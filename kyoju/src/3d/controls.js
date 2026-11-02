import * as THREE from 'three';
import { groundH } from './world.js';
import { clamp, lerp, smoothstep } from './noise.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Ray(), _plane = new THREE.Plane();
const _ndc = new THREE.Vector2();

export class CameraRig {
  constructor(engine, dom) {
    this.engine = engine;
    this.cam = engine.camera;
    this.dom = dom;
    this.mode = 'follow';
    this.target = new THREE.Vector3(0, 200, 0);
    this.dist = 380; this.yaw = 0.7; this.pitch = 0.32;
    this.goal = null;               // なめらかに移動する目標
    this.vel = new THREE.Vector2(); // 慣性
    this.ptrs = new Map();
    this.fp = { yaw: 0, pitch: 0, idle: 99, fov: 70 };
    this.shake = 0;
    this.shakeScale = 0;
    this.shakeTime = 0;
    this.onModeBreak = null;
    this.lastInput = 0;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.suppressKeys = false; // 操縦モード中は WASD をカメラ移動に使わない（stage が切り替える）
    this.padPrev = [];
    this.bind();
  }
  // ゲームパッドの現在値と「今押された」ボタン。未接続なら active:false。
  gamepad() {
    const out = { active: false, lx: 0, ly: 0, pressed: new Set(), held: new Set() };
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return out;
    let gp = null;
    try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch (e) { return out; }
    if (!gp) { this.padPrev = []; return out; }
    out.active = true;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    out.lx = dz(gp.axes[0] || 0); out.ly = dz(gp.axes[1] || 0);
    const prev = this.padPrev;
    gp.buttons.forEach((b, i) => { if (b.pressed) { out.held.add(i); if (!prev[i]) out.pressed.add(i); } });
    this.padPrev = gp.buttons.map((b) => b.pressed);
    return out;
  }
  bind() {
    const d = this.dom;
    d.style.touchAction = 'none';
    d.addEventListener('pointerdown', (e) => this.down(e));
    d.addEventListener('pointermove', (e) => this.move(e));
    d.addEventListener('pointerup', (e) => this.up(e));
    d.addEventListener('pointercancel', (e) => this.up(e));
    d.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.up(e); });
    d.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('dblclick', (e) => this.dbl(e));
    this._kd = (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; this.keys.add(e.key.toLowerCase()); };
    this._blur = () => { this.keys.clear(); this.ptrs.clear(); this.vel.set(0, 0); };
    window.addEventListener('blur', this._blur);
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._kd); window.addEventListener('keyup', this._ku);
  }
  unbind() { window.removeEventListener('blur', this._blur); window.removeEventListener('keydown', this._kd); window.removeEventListener('keyup', this._ku); }
  isFP() { return this.mode === 'resident' || this.mode === 'beast'; }
  setMode(m) {
    this.mode = m;
    this.fp.yaw = 0; this.fp.pitch = 0; this.fp.idle = 99;
    this.vel.set(0, 0);
  }
  // 画面座標 → 地面（水平面）上の点
  groundPoint(cx, cy, y) {
    const r = this.dom.getBoundingClientRect();
    _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.cam.updateMatrixWorld();
    _ray.origin.setFromMatrixPosition(this.cam.matrixWorld);
    _ray.direction.set(_ndc.x, _ndc.y, 0.5).unproject(this.cam).sub(_ray.origin).normalize();
    _plane.set(_v2.set(0, 1, 0), -y);
    const hit = _ray.intersectPlane(_plane, new THREE.Vector3());
    if (!hit) return null;
    if (hit.distanceTo(_ray.origin) > 250000) return null;
    return hit;
  }
  down(e) {
    this.dom.setPointerCapture && this.dom.setPointerCapture(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, b: e.button, shift: e.shiftKey || e.ctrlKey });
    this.lastInput = performance.now();
    this.vel.set(0, 0);
    this.goal = null;
    this.startGesture();
  }
  startGesture() {
    const p = [...this.ptrs.values()];
    this.applyCamera();
    if (p.length === 1) {
      this.grab = (!this.isFP() && this.mode === 'map' && p[0].b === 0 && !p[0].shift) ? this.groundPoint(p[0].x, p[0].y, this.target.y) : null;
    } else if (p.length === 2) {
      const [a, b] = p;
      this.g2 = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.grab = null;
    }
  }
  move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    this.lastInput = performance.now();
    const all = [...this.ptrs.values()];
    const H = this.dom.clientHeight || 600;
    if (this.isFP()) {
      if (all.length === 1) { this.fp.yaw -= dx * 0.0045; this.fp.pitch = clamp(this.fp.pitch - dy * 0.0045, -1.3, 1.3); this.fp.idle = 0; }
      return;
    }
    if (all.length === 1) {
      const rotate = p.b === 2 || p.b === 1 || p.shift || this.mode !== 'map';
      if (rotate) {
        this.yaw -= dx * 0.006;
        this.pitch = clamp(this.pitch + dy * 0.004, 0.06, 1.53);
      } else if (this.grab) {
        this.applyCamera();
        const now = this.groundPoint(e.clientX, e.clientY, this.grab.y);
        if (now) {
          const mx = this.grab.x - now.x, mz = this.grab.z - now.z;
          const lim = this.dist * 0.6;
          this.target.x += clamp(mx, -lim, lim); this.target.z += clamp(mz, -lim, lim);
          this.vel.set(mx, mz);
        }
      }
    } else if (all.length === 2 && this.g2) {
      const [a, b] = all;
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ratio = d / Math.max(1, this.g2.d);
      let da = ang - this.g2.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      const dmy = my - this.g2.my;
      const pinching = Math.abs(ratio - 1) > 0.012 || Math.abs(da) > 0.012;
      if (pinching) {
        this.zoomAt(1 / ratio, mx, my);
        this.yaw += da;
      } else if (Math.abs(dmy) > 0.5) {
        this.pitch = clamp(this.pitch + (dmy / H) * 2.2, 0.06, 1.53);
      }
      this.g2 = { d, ang, mx, my };
    }
  }
  up(e) {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size === 0) { this.grab = null; this.g2 = null; }
    else this.startGesture();
  }
  wheel(e) {
    e.preventDefault();
    this.lastInput = performance.now();
    if (this.isFP()) { this.fp.fov = clamp(this.fp.fov * Math.exp(e.deltaY * 0.001), 20, 85); return; }
    this.goal = null;
    this.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
  }
  dbl(e) {
    if (this.isFP()) return;
    this.zoomAt(0.45, e.clientX, e.clientY);
  }
  zoomAt(f, cx, cy) {
    const nd = clamp(this.dist * f, 8, 90000);
    f = nd / this.dist;
    if (this.mode === 'map') {
      this.applyCamera();
      const q = this.groundPoint(cx, cy, this.target.y);
      if (q && q.distanceTo(this.target) < this.dist * 4) { this.target.x += (q.x - this.target.x) * (1 - f); this.target.z += (q.z - this.target.z) * (1 - f); }
    }
    this.dist = nd;
  }
  zoomBy(f) { this.dist = clamp(this.dist * f, 8, 90000); }
  flyTo(x, z, dist, pitch) { this.goal = { x, z, dist: dist || this.dist, pitch: pitch == null ? this.pitch : pitch, t: 0 }; }
  minPitch() { return lerp(0.06, 0.55, smoothstep(2500, 40000, this.dist)); }
  applyCamera() {
    const c = this.cam;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    c.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + sp * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    const gy = groundH(c.position.x, c.position.z) + 2.5;
    if (c.position.y < gy) c.position.y = gy;
    c.lookAt(this.target);
    c.updateMatrixWorld();
  }
  update(dt, ctx) {
    const c = this.cam;
    const now = performance.now();
    if (this.isFP()) {
      this.fp.idle += dt;
      const eye = ctx.eye, look = ctx.look;
      if (!eye) return;
      c.position.copy(eye);
      let baseYaw = ctx.baseYaw, basePitch = ctx.basePitch;
      if (this.fp.idle > 4) { this.fp.yaw *= 1 - Math.min(1, dt * 1.2); this.fp.pitch *= 1 - Math.min(1, dt * 1.2); }
      const yaw = baseYaw + this.fp.yaw, pitch = clamp(basePitch + this.fp.pitch, -1.45, 1.45);
      _v.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      c.lookAt(_v.add(c.position));
      if (Math.abs(c.fov - this.fp.fov) > 0.1) { c.fov = this.fp.fov; c.updateProjectionMatrix(); }
    } else {
      if (Math.abs(c.fov - 48) > 0.1) { c.fov = 48; c.updateProjectionMatrix(); }
      // キーボード
      const k = this.keys, sp = this.dist * dt * 0.9;
      if (k.size && !this.suppressKeys) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        if (k.has('w') || k.has('arrowup')) { this.target.x += fx * sp; this.target.z += fz * sp; }
        if (k.has('s') || k.has('arrowdown')) { this.target.x -= fx * sp; this.target.z -= fz * sp; }
        if (k.has('a') || k.has('arrowleft')) { this.target.x += fz * sp; this.target.z -= fx * sp; }
        if (k.has('d') || k.has('arrowright')) { this.target.x -= fz * sp; this.target.z += fx * sp; }
        if (k.has('q')) this.yaw += dt * 1.2; if (k.has('e')) this.yaw -= dt * 1.2;
        if (k.has('r')) this.pitch = clamp(this.pitch + dt, 0.06, 1.53); if (k.has('f')) this.pitch = clamp(this.pitch - dt, 0.06, 1.53);
        if (k.has('+') || k.has('=')) this.zoomBy(Math.exp(-dt * 1.5)); if (k.has('-')) this.zoomBy(Math.exp(dt * 1.5));
        if ((k.has('w') || k.has('a') || k.has('s') || k.has('d')) && this.mode === 'follow' && this.onModeBreak) this.onModeBreak('map');
      }
      if (this.mode === 'follow' && ctx.follow) {
        const f = ctx.follow;
        const a = 1 - Math.exp(-dt * 3);
        this.target.x += (f.x - this.target.x) * a; this.target.z += (f.z - this.target.z) * a;
        const ty = f.y; this.target.y += (ty - this.target.y) * a;
      } else {
        if (this.ptrs.size === 0 && this.vel.lengthSq() > 0.01) {
          this.target.x += this.vel.x * dt * 8; this.target.z += this.vel.y * dt * 8;
          this.vel.multiplyScalar(Math.exp(-dt * 5));
        }
        const gy = groundH(this.target.x, this.target.z);
        this.target.y += (gy - this.target.y) * (1 - Math.exp(-dt * 6));
      }
      if (this.goal) {
        const gl = this.goal; gl.t += dt;
        const a = 1 - Math.exp(-dt * 2.2);
        this.target.x += (gl.x - this.target.x) * a; this.target.z += (gl.z - this.target.z) * a;
        this.dist *= Math.pow(gl.dist / this.dist, a);
        this.pitch += (gl.pitch - this.pitch) * a;
        if (gl.t > 3) this.goal = null;
      }
      this.pitch = Math.max(this.pitch, this.minPitch());
      this.applyCamera();
    }
    if (this.shake > 0.001) {
      const s = this.shakeScale * this.shake * this.shake * (this.isFP() ? 0.12 : Math.min(1.8, this.dist * 0.004));
      this.shakeTime += dt;
      c.position.x += Math.sin(this.shakeTime * 21) * s; c.position.y += Math.sin(this.shakeTime * 17 + 1) * s * 0.55;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    // 視距離に合わせて near/far を調整
    const alt = Math.max(0.5, c.position.y - groundH(c.position.x, c.position.z));
    // Stable clip ranges: changing projection every few frames produced
    // depth discontinuities on roads, rooftops and decals.
    const near = this.isFP() ? 0.3 : this.dist < 120 ? 0.5 : this.dist < 1500 ? 2 : this.dist < 12000 ? 8 : 30;
    const far = this.isFP() ? 32000 : 240000;
    if (c.near !== near || c.far !== far) { c.near = near; c.far = far; c.updateProjectionMatrix(); }
    const fog = this.engine.scene.fog;
    fog.density = this.engine.fogBase * (1 + this.engine.haze * 3) * clamp(2400 / Math.max(alt, 300), 0.08, 1);
  }
  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }
}
