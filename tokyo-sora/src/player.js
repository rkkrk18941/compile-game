// Player: walking (gravity, jumping, roofs, walls) and superhero-style flight, plus the follow camera.
import * as THREE from 'three';
import { makeHero } from './hero.js';

const R = 0.38, H = 1.75, STEP = 0.65, MAX_ALT = 12000;
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Player {
  constructor(scene, dem, buildings) {
    this.dem = dem; this.b = buildings;
    this.pos = new THREE.Vector3(0, 200, 0);
    this.vel = new THREE.Vector3();
    this.mode = 'fly';
    this.onGround = false;
    this.heading = 0; this.lean = 0; this.boostT = 0;
    this.camYaw = 0; this.camPitch = -0.22; this.camDist = 7; this.curDist = 7;
    this.view = 'third';
    this.ground = 0; this.alt = 200; this.speed = 0;
    this.hero = makeHero(); scene.add(this.hero);
    this.events = [];
    this.tmp = new THREE.Vector3(); this.tgt = new THREE.Vector3();
  }
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 'fly') { if (this.onGround) this.vel.y = 9; this.onGround = false; this.events.push('takeoff'); }
    else this.events.push('walk');
  }
  teleport(x, z, y, mode) {
    const g = this.dem.heightAt(x, z);
    this.pos.set(x, y !== undefined ? Math.max(y, g) : g + 0.02, z);
    this.vel.set(0, 0, 0);
    if (mode) this.mode = mode;
    this.onGround = this.mode === 'walk' && y === undefined;
    this.snapFrames = 120; // keep snapping to the ground while elevation data arrives
  }
  update(dt, inp, t) {
    const ground = this.dem.heightAt(this.pos.x, this.pos.z);
    this.ground = ground;
    if (this.snapFrames > 0) { this.snapFrames--; if (this.mode === 'walk' && this.onGround) this.pos.y = Math.max(this.pos.y, ground); }
    const yaw = this.camYaw;
    if (this.mode === 'walk') this.walk(dt, inp, yaw);
    else this.fly(dt, inp, yaw, this.pos.y - ground);
    this.integrate(dt);
    this.alt = this.pos.y - this.dem.heightAt(this.pos.x, this.pos.z);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed = this.vel.length();
    // facing & lean
    if (this.mode === 'walk') {
      if (hs > 0.6) this.heading += wrapA(Math.atan2(this.vel.x, -this.vel.z) - this.heading) * Math.min(1, dt * 12);
      this.lean += (0 - this.lean) * Math.min(1, dt * 8);
    } else {
      const fwd = hs > 3 ? Math.atan2(this.vel.x, -this.vel.z) : yaw;
      this.heading += wrapA(fwd - this.heading) * Math.min(1, dt * 6);
      const targetLean = Math.min(1, Math.max(0, (hs - 2) / 22)) * (inp.my > 0.1 || hs > 8 ? 1 : 0);
      this.lean += (targetLean - this.lean) * Math.min(1, dt * 4);
    }
    this.heading = wrapA(this.heading);
    this.hero.position.copy(this.pos);
    this.hero.rotation.y = -this.heading;
    this.hero.userData.animate(dt, { mode: this.mode, speed: hs, vy: this.vel.y, onGround: this.onGround, lean: this.lean, t });
  }
  walk(dt, inp, yaw) {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    let wx = fx * inp.my + rx * inp.mx, wz = fz * inp.my + rz * inp.mx;
    const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    const sp = inp.boost ? 4.5 : 1.5;
    const k = Math.min(1, dt * (this.onGround ? 11 : 2.5));
    this.vel.x += (wx * sp - this.vel.x) * k;
    this.vel.z += (wz * sp - this.vel.z) * k;
    const alt = this.pos.y - this.ground;
    this.vel.y = Math.max(this.vel.y - 26 * dt, -Math.max(70, alt * 0.45));
    if (inp.jump) {
      if (this.onGround) { this.vel.y = inp.boost ? 15 : 10; this.onGround = false; this.events.push('jump'); }
      else this.setMode('fly');
    }
  }
  fly(dt, inp, yaw, alt) {
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const f0 = Math.sin(yaw) * cp, f1 = sp, f2 = -Math.cos(yaw) * cp;
    const r0 = Math.cos(yaw), r2 = Math.sin(yaw);
    const vert = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    let wx = f0 * inp.my + r0 * inp.mx, wy = f1 * inp.my, wz = f2 * inp.my + r2 * inp.mx;
    const wl = Math.hypot(wx, wy, wz); if (wl > 1) { wx /= wl; wy /= wl; wz /= wl; }
    this.boostT = inp.boost ? Math.min(1, this.boostT + dt / 1.4) : Math.max(0, this.boostT - dt * 1.5);
    const base = 18 + Math.min(Math.max(alt, 0), 9000) * 0.22;
    const speed = base * (1 + 2.4 * this.boostT * this.boostT);
    const vs = Math.max(14, speed * 0.6);
    const tx = wx * speed, ty = wy * speed + vert * vs, tz = wz * speed;
    const k = Math.min(1, dt * 2.6);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    this.vel.z += (tz - this.vel.z) * k;
    if (this.pos.y > MAX_ALT && this.vel.y > 0) this.vel.y *= 0.5;
    if (inp.jump && this.onGround) { this.vel.y = 12; this.onGround = false; }
  }
  integrate(dt) {
    const dist = this.vel.length() * dt;
    const low = this.pos.y - this.ground < 800;
    const steps = low ? Math.min(48, Math.max(1, Math.ceil(dist / 1.2))) : 1;
    const h = dt / steps;
    const wasGround = this.onGround;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      const prevY = this.pos.y;
      this.pos.x += this.vel.x * h; this.pos.y += this.vel.y * h; this.pos.z += this.vel.z * h;
      const g = this.dem.heightAt(this.pos.x, this.pos.z);
      let floor = g;
      if (low) {
        const sup = this.b.supportAt(this.pos.x, this.pos.z, prevY + STEP);
        if (sup > floor) floor = sup;
      }
      if (this.pos.y <= floor + 0.001) {
        if (this.vel.y < -28) this.events.push('land');
        this.pos.y = floor;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
      } else if (this.mode === 'walk' && wasGround && this.vel.y <= 0 && this.pos.y - floor < 0.45) {
        this.pos.y = floor; this.vel.y = 0; this.onGround = true; // stick to slopes / steps down
      }
      if (low && this.b.pushOut(this.pos, R, H, STEP)) {
        this.vel.x *= 0.92; this.vel.z *= 0.92;
      }
    }
    if (this.pos.y > MAX_ALT + 200) this.pos.y = MAX_ALT + 200;
  }
  updateCamera(camera, dt) {
    const first = this.view === 'first';
    const tgt = this.tgt.set(this.pos.x, this.pos.y + (first ? 1.62 : 1.5), this.pos.z);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fx = Math.sin(this.camYaw) * cp, fy = sp, fz = -Math.cos(this.camYaw) * cp;
    if (first) {
      this.hero.visible = false;
      camera.position.copy(tgt);
      camera.lookAt(tgt.x + fx, tgt.y + fy, tgt.z + fz);
      return;
    }
    const spd = this.mode === 'fly' ? Math.min(1.4, this.speed / 120) : 0;
    const want = this.camDist * (1 + spd);
    // pull the camera in front of walls / under roofs
    let allowed = want;
    const low = this.pos.y - this.ground < 900;
    if (low) {
      const stepL = 1.2;
      for (let d = stepL; d <= want; d += stepL) {
        const x = tgt.x - fx * d, y = tgt.y - fy * d, z = tgt.z - fz * d;
        if (y < this.dem.heightAt(x, z) + 0.4 || this.b.solidAt(x, y, z)) { allowed = Math.max(0.6, d - stepL); break; }
      }
    }
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * Math.min(1, dt * 3);
    const d = this.curDist;
    camera.position.set(tgt.x - fx * d, tgt.y - fy * d, tgt.z - fz * d);
    this.hero.visible = d > 1.4;
    const gy = this.dem.heightAt(camera.position.x, camera.position.z) + 0.35;
    if (camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(tgt);
  }
}
