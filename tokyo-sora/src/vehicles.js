// Player-driven vehicles: cars (incl. stolen traffic cars), a tank and a fighter jet.
import * as THREE from 'three';
import { carModel, tankModel, jetModel } from './models.js';
import { addCurvature } from './shaders.js';

const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const VEHICLE_NAMES = { car: '車', tank: '戦車', jet: '戦闘機' };

export class Vehicle {
  constructor(kind, scene, opts) {
    this.kind = kind; this.scene = scene;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.speed = 0;
    this.hp = kind === 'tank' ? 600 : kind === 'jet' ? 220 : 140; this.maxHp = this.hp;
    this.cool = 0; this.cool2 = 0; this.throttle = 0.45; this.side = 1;
    this.group = new THREE.Group();
    if (kind === 'car') {
      const m = carModel(opts.carKind || 'sport');
      this.dims = m;
      const mat = addCurvature(new THREE.MeshPhongMaterial({ vertexColors: true, color: opts.color || '#d1342b', shininess: 80, specular: 0x555555 }));
      this.body = new THREE.Mesh(m.body, mat);
      this.lightMat = addCurvature(new THREE.MeshBasicMaterial({ vertexColors: true }));
      this.group.add(this.body, new THREE.Mesh(m.lights, this.lightMat));
      this.carKind = opts.carKind || 'sport';
      this.r = Math.max(1.0, m.wid * 0.55);
    } else if (kind === 'tank') {
      const m = tankModel();
      const mat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.hull = new THREE.Mesh(m.hull, mat);
      this.turret = new THREE.Group(); this.turret.position.set(0, 1.95, 0.2);
      this.turret.add(new THREE.Mesh(m.turret, mat));
      this.barrel = new THREE.Group(); this.barrel.position.set(0, 0.55, -1.2); this.barrel.add(new THREE.Mesh(m.barrel, mat));
      this.turret.add(this.barrel);
      this.group.add(this.hull, this.turret);
      this.turretYaw = 0; this.barrelPitch = 0;
      this.r = 2.3;
    } else {
      const mat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      this.body = new THREE.Mesh(jetModel(), mat);
      this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 10).rotateX(Math.PI / 2).translate(0, 0, 8.1), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(this.body, this.flame);
      this.speed = 150;
      this.r = 6;
    }
    this.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    scene.add(this.group);
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  // ---------------- update ----------------
  update(dt, inp, W) {
    if (this.kind === 'jet') return this.updateJet(dt, inp, W);
    return this.updateGround(dt, inp, W);
  }
  updateGround(dt, inp, W) {
    const tank = this.kind === 'tank';
    const ev = [];
    const vmax = tank ? (inp.boost ? 22 : 15) : (inp.boost ? 75 : 48);
    const acc = tank ? 6 : inp.boost ? 17 : 9.5;
    if (inp.my > 0.05) this.speed += (this.speed < 0 ? 22 : acc) * inp.my * dt;
    else if (inp.my < -0.05 || inp.down) { const b = inp.down ? 1 : -inp.my; if (this.speed > 0.5) this.speed -= 24 * b * dt; else this.speed -= (tank ? 4 : 7) * b * dt; }
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (1.4 + 0.012 * this.speed * this.speed) * dt);
    this.speed = Math.max(tank ? -7 : -14, Math.min(vmax, this.speed));
    if (tank) this.yaw += inp.mx * 0.95 * dt * (this.speed < -0.5 ? -1 : 1);
    else {
      const steer = inp.mx * (0.58 - 0.44 * Math.min(1, Math.abs(this.speed) / 45));
      this.yaw += (this.speed * Math.tan(steer) / 2.7) * dt;
    }
    this.yaw = wrapA(this.yaw);
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.vel.set(fx * this.speed, this.vel.y, fz * this.speed);
    const steps = Math.max(1, Math.ceil(Math.abs(this.speed) * dt / 1.2));
    const h = dt / steps;
    let impact = 0;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * h; this.pos.z += this.vel.z * h;
      // two circles along the body
      for (const off of [-1, 1]) {
        const L = tank ? 2.2 : (this.dims ? this.dims.len * 0.28 : 1.2);
        const p = { x: this.pos.x + fx * L * off, y: this.pos.y, z: this.pos.z + fz * L * off };
        const ox = p.x, oz = p.z;
        if (W.city.pushOut(p, this.r, 2.2, 0.8, (t, b) => {
          if (tank && Math.abs(this.speed) > 2.5) { const hgt = t.coll.top[b] - t.meta.base[b]; if (hgt < 16) { W.city.collapse(t, b); ev.push('crush'); } }
        })) {
          this.pos.x += p.x - ox; this.pos.z += p.z - oz;
          impact = Math.max(impact, Math.abs(this.speed));
        }
      }
    }
    if (impact > 2) {
      if (impact > 14) { this.hp -= (impact - 14) * (tank ? 0.4 : 2.2); ev.push('crash'); if (!tank && impact > 30) W.city.damage(this.pos.x + fx * 3, this.pos.y + 1, this.pos.z + fz * 3, 4, impact * 3); }
      this.speed *= -0.25;
    }
    // terrain following
    const g = W.dem.heightAt(this.pos.x, this.pos.z);
    const gf = W.dem.heightAt(this.pos.x + fx * 2, this.pos.z + fz * 2), gb = W.dem.heightAt(this.pos.x - fx * 2, this.pos.z - fz * 2);
    this.vel.y -= 25 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; }
    this.pitch += (Math.atan2(gf - gb, 4) - this.pitch) * Math.min(1, dt * 8);
    // ramming traffic
    for (const c of W.traffic.cars) {
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      const rr = this.r + c.T.model.wid * 0.6 + (tank ? 1.2 : 0.6);
      if (d > rr || Math.abs(c.pos.y - this.pos.y) > 3) continue;
      const nx = (c.pos.x - this.pos.x) / (d || 1), nz = (c.pos.z - this.pos.z) / (d || 1);
      const rel = Math.max(0, this.vel.x * nx + this.vel.z * nz - (c.state === 'drive' ? c.speed * (Math.sin(c.yaw) * nx - Math.cos(c.yaw) * nz) : 0));
      if (rel < 1 && c.state !== 'drive') { c.pos.x += nx * (rr - d); c.pos.z += nz * (rr - d); continue; }
      const k = tank ? 1.2 : 0.9;
      const boom = W.traffic.hit(c, nx * rel * k + this.vel.x * 0.3, 2 + rel * 0.25, nz * rel * k + this.vel.z * 0.3, tank ? 200 : rel * 2.5);
      if (boom) W.fx.explosion(c.pos.x, c.pos.y, c.pos.z, 120, 9);
      if (!tank) { this.speed *= 0.65; if (rel > 12) this.hp -= rel * 0.6; }
      ev.push('bump');
    }
    // tank turret aims where the camera looks
    if (tank) {
      const want = wrapA(W.aimYaw - this.yaw);
      this.turretYaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, wrapA(want - this.turretYaw)));
      this.barrelPitch += (Math.max(-0.12, Math.min(0.5, W.aimPitch + 0.08)) - this.barrelPitch) * Math.min(1, dt * 6);
      this.cool -= dt;
      if (inp.fireTap && this.cool <= 0) {
        this.cool = 1.15;
        const tip = this.barrelTip();
        const dir = W.aimPoint ? W.aimPoint.clone().sub(tip).normalize() : this.barrelDir();
        // keep the shell within the barrel's cone
        if (dir.dot(this.barrelDir()) < 0.96) dir.copy(this.barrelDir());
        W.fx.shoot('shell', tip, dir, null);
        W.fx.shake = Math.max(W.fx.shake, 0.35);
        ev.push('fire');
      }
    }
    this.place();
    return ev;
  }
  barrelDir() {
    const yaw = this.yaw + this.turretYaw, p = this.barrelPitch + this.pitch;
    return new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p));
  }
  barrelTip() { const d = this.barrelDir(); return new THREE.Vector3(this.pos.x, this.pos.y + 2.5, this.pos.z).addScaledVector(d, 6.2); }
  updateJet(dt, inp, W) {
    const ev = [];
    this.roll += (inp.mx * 2.6) * dt;
    if (Math.abs(inp.mx) < 0.05) this.roll *= 1 - Math.min(1, dt * 1.3);
    this.roll = Math.max(-1.35, Math.min(1.35, this.roll));
    this.pitch += inp.my * 1.05 * dt * Math.cos(this.roll);
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    this.yaw = wrapA(this.yaw + Math.sin(this.roll) * 1.15 * dt + inp.my * Math.sin(this.roll) * 0.4 * dt);
    if (inp.up) this.throttle = Math.min(1, this.throttle + dt * 0.6);
    if (inp.down) this.throttle = Math.max(0, this.throttle - dt * 0.6);
    const target = 95 + this.throttle * 320 + (inp.boost ? 260 : 0);
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), (inp.boost ? 70 : 40) * dt);
    this.speed -= Math.sin(this.pitch) * 9.8 * dt * 1.4;
    if (this.speed < 75) { this.pitch -= (75 - this.speed) * 0.01 * dt; }
    this.speed = Math.max(55, this.speed);
    const f = this.forward;
    this.vel.copy(f).multiplyScalar(this.speed);
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    // crash into the ground or a building
    const g = W.dem.heightAt(this.pos.x, this.pos.z);
    let crashed = this.pos.y < g + 1.2;
    if (!crashed && this.pos.y - g < 700) {
      const L = this.pos.distanceTo(prev);
      for (let d = 0; d <= L; d += 3) { const p = prev.clone().lerp(this.pos, L ? d / L : 1); if (W.city.solidAt(p.x, p.y, p.z)) { crashed = true; this.pos.copy(p); break; } }
    }
    if (crashed) { this.hp = 0; ev.push('crash'); }
    // weapons
    this.cool -= dt; this.cool2 -= dt;
    if (inp.fire && this.cool <= 0) {
      this.cool = 0.055;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const tip = this.pos.clone().addScaledVector(f, 8).addScaledVector(right, (this.side = -this.side) * 0.6);
      const dir = f.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01));
      W.fx.shoot('bullet', tip, dir, null);
    }
    if (inp.special && this.cool2 <= 0) {
      this.cool2 = 0.7;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const tip = this.pos.clone().addScaledVector(f, 1).addScaledVector(right, (this.side = -this.side) * 3).add(new THREE.Vector3(0, -0.6, 0));
      W.fx.shoot('missile', tip, f, null);
      ev.push('missile');
    }
    this.flame.scale.set(1, 1, 0.5 + this.throttle * 0.6 + (inp.boost ? 0.9 : 0));
    this.flame.material.opacity = 0.5 + this.throttle * 0.3 + (inp.boost ? 0.2 : 0);
    this.place();
    return ev;
  }
  place() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, -this.yaw, this.kind === 'jet' ? -this.roll : 0, 'YXZ');
    if (this.kind === 'tank') { this.turret.rotation.y = -this.turretYaw; this.barrel.rotation.x = this.barrelPitch; }
  }
  // chase camera; returns the point the camera looks at
  cameraRig(camera, dt, look) {
    const cfg = this.kind === 'jet' ? { dist: 26, h: 6, ahead: 30 } : this.kind === 'tank' ? { dist: 15, h: 6, ahead: 10 } : { dist: 8.5, h: 2.9, ahead: 6 };
    if (this.kind !== 'jet' && look.zoom) { cfg.dist *= look.zoom; cfg.h *= 0.6 + 0.4 * look.zoom; }
    let yaw, pitch;
    if (this.kind === 'jet') { yaw = this.yaw + look.yawOff; pitch = this.pitch * 0.7 + look.pitchOff - 0.12; }
    else if (this.kind === 'tank') { yaw = look.yaw; pitch = look.pitch - 0.05; }
    else { yaw = this.yaw + look.yawOff; pitch = -0.16 + look.pitchOff; }
    const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const tgt = new THREE.Vector3(this.pos.x + fx * cfg.ahead * 0.3, this.pos.y + cfg.h * 0.45, this.pos.z + fz * cfg.ahead * 0.3);
    const want = new THREE.Vector3(tgt.x - fx * cfg.dist, tgt.y - fy * cfg.dist + cfg.h * 0.5, tgt.z - fz * cfg.dist);
    if (!this.camPos) this.camPos = want.clone();
    this.camPos.lerp(want, Math.min(1, dt * (this.kind === 'jet' ? 6 : 8)));
    camera.position.copy(this.camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(tgt.x + fx * cfg.ahead, tgt.y + fy * cfg.ahead, tgt.z + fz * cfg.ahead);
    if (this.kind === 'jet') camera.rotateZ(-this.roll * 0.35);
    return tgt;
  }
}
