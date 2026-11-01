// Particles, debris, projectiles and explosions.
import * as THREE from 'three';
import { shared, addCurvature } from './shaders.js';

const PVS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uScale; uniform float uCurv;
attribute float aSize; attribute vec4 aCol;
varying vec4 vCol; varying float vDist;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d2 = dot(mv.xyz, mv.xyz);
  mv.xyz -= (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz * (d2 * uCurv);
  vDist = sqrt(d2);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.5), 1.0, 900.0);
  #include <logdepthbuf_vertex>
}
`;
const PFS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uAdd;
varying vec4 vCol; varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = vCol.a * smoothstep(0.5, 0.12, r);
  if (uAdd < 0.5) a *= 0.75 + 0.25 * sin(c.x * 13.0 + c.y * 9.0);
  vec3 col = vCol.rgb;
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  if (uAdd > 0.5) { a *= 1.0 - fogF; gl_FragColor = vec4(col * a, a); }
  else { col = mix(col, uFogColor, fogF); gl_FragColor = vec4(col, a); }
  #include <colorspace_fragment>
}
`;
class Particles {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grow = new Float32Array(max); this.col = new Float32Array(max * 4); this.drag = new Float32Array(max); this.rise = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aCol', this.aCol);
    this.uScale = { value: 500 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale, uCurv: shared.uCurv, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 7 : 6;
    scene.add(this.points);
  }
  add(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, drag, rise) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.drag[i] = drag || 0.5; this.rise[i] = rise || 0;
  }
  update(dt, origin) {
    let w = 0;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] - dt;
      if (l <= 0) continue;
      // compact in place
      if (w !== i) {
        for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; }
        for (let k = 0; k < 4; k++) this.col[w * 4 + k] = this.col[i * 4 + k];
        this.maxLife[w] = this.maxLife[i]; this.size[w] = this.size[i]; this.grow[w] = this.grow[i]; this.drag[w] = this.drag[i]; this.rise[w] = this.rise[i];
      }
      this.life[w] = l;
      const dr = Math.exp(-this.drag[w] * dt);
      this.v[w * 3] *= dr; this.v[w * 3 + 1] = this.v[w * 3 + 1] * dr + this.rise[w] * dt; this.v[w * 3 + 2] *= dr;
      this.p[w * 3] += this.v[w * 3] * dt; this.p[w * 3 + 1] += this.v[w * 3 + 1] * dt; this.p[w * 3 + 2] += this.v[w * 3 + 2] * dt;
      this.size[w] += this.grow[w] * dt;
      const k = l / this.maxLife[w];
      P[w * 3] = this.p[w * 3] - origin.x; P[w * 3 + 1] = this.p[w * 3 + 1] - origin.y; P[w * 3 + 2] = this.p[w * 3 + 2] - origin.z;
      S[w] = this.size[w];
      C[w * 4] = this.col[w * 4]; C[w * 4 + 1] = this.col[w * 4 + 1]; C[w * 4 + 2] = this.col[w * 4 + 2];
      C[w * 4 + 3] = this.col[w * 4 + 3] * Math.min(1, k * 2.5) * Math.min(1, (1 - k) * 12 + 0.2);
      w++;
    }
    this.n = w;
    this.points.position.copy(origin);
    this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, city, dem, sound) {
    this.scene = scene; this.city = city; this.dem = dem; this.sound = sound;
    this.smoke = new Particles(scene, 900, false);
    this.fire = new Particles(scene, 700, true);
    this.shots = [];
    this.shake = 0;
    this.traffic = null; this.peds = null; this.onBoom = null;
    // debris
    this.debMax = 160;
    this.deb = [];
    this.debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), addCurvature(new THREE.MeshLambertMaterial({ color: '#8a857c' })), this.debMax);
    this.debMesh.count = 0; this.debMesh.frustumCulled = false; this.debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.debMesh);
    // projectile meshes
    this.rocketGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.3, 6).rotateX(Math.PI / 2);
    this.rocketMat = addCurvature(new THREE.MeshLambertMaterial({ color: '#3d4446' }));
    this.shellGeo = new THREE.SphereGeometry(0.25, 6, 4);
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
    // bullet tracers
    this.tracerPos = new Float32Array(120 * 6);
    const tg = new THREE.BufferGeometry(); this.tracerAttr = new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage); tg.setAttribute('position', this.tracerAttr);
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false; this.tracers.renderOrder = 8;
    scene.add(this.tracers);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.e = new THREE.Euler();
  }
  setScale(px) { this.smoke.uScale.value = px; this.fire.uScale.value = px; }
  // ---------- effects ----------
  puff(x, y, z, n, size, life, gray, spread, rise) {
    for (let i = 0; i < n; i++) {
      const g = gray * (0.75 + Math.random() * 0.4);
      this.smoke.add(x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.4, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, size * (0.7 + Math.random() * 0.6), size * 0.35, life * (0.7 + Math.random() * 0.6), g, g * 0.98, g * 0.95, 0.75, 0.6, rise || 0.6);
    }
  }
  explosion(x, y, z, power, radius, opts) {
    const r = radius;
    this.fire.add(x, y + 1, z, 0, 0, 0, r * 3.2, r * 2, 0.22, 1, 0.85, 0.55, 1, 0, 0);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, el = Math.random() * 1.2, sp = r * (1.2 + Math.random() * 1.8);
      this.fire.add(x, y + 1, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp, r * (0.7 + Math.random() * 0.7), r * 0.9, 0.5 + Math.random() * 0.5, 1, 0.45 + Math.random() * 0.3, 0.12, 0.9, 3.5, 2);
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.283, sp = r * Math.random() * 0.9;
      const g = 0.1 + Math.random() * 0.12;
      this.smoke.add(x + Math.cos(a) * r * 0.3, y + 1 + Math.random() * r * 0.4, z + Math.sin(a) * r * 0.3, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, r * (0.9 + Math.random()), r * 0.45, 3 + Math.random() * 3, g, g, g, 0.85, 0.9, 1.4);
    }
    const nd = Math.min(14, 4 + (power / 40) | 0);
    for (let i = 0; i < nd; i++) this.debris(x, y + 1, z, r * 0.9, 0.25 + Math.random() * 0.6);
    this.sound.boom(Math.min(1, power / 400));
    if (this.onBoom) this.onBoom(x, y, z, power, r);
    // damage
    if (!opts || opts.damage !== false) {
      this.city.damage(x, y, z, r, power);
      if (this.peds) { this.peds.blast(x, y, z, r * 1.6, Math.min(25, power / 12)); this.peds.panic(x, z, Math.max(70, r * 6)); }
      if (this.traffic) {
        for (const c of this.traffic.cars) {
          const dx = c.pos.x - x, dz = c.pos.z - z, d = Math.hypot(dx, dz, c.pos.y - y);
          if (d > r * 1.3) continue;
          const k = (1 - d / (r * 1.3)) * Math.min(30, power / 10);
          if (this.traffic.hit(c, (dx / (d || 1)) * k, 4 + k, (dz / (d || 1)) * k, power * (1 - d / (r * 1.3)))) {
            const cc = c; setTimeout(() => this.explosion(cc.pos.x, cc.pos.y, cc.pos.z, 120, 9), 150 + Math.random() * 500);
          }
        }
      }
    }
  }
  debris(x, y, z, sp, size) {
    if (this.deb.length >= this.debMax) this.deb.shift();
    const a = Math.random() * 6.283;
    this.deb.push({ x, y, z, vx: Math.cos(a) * sp * Math.random(), vy: 4 + Math.random() * sp, vz: Math.sin(a) * sp * Math.random(), rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 9, wy: (Math.random() - 0.5) * 9, s: size, life: 6 + Math.random() * 3 });
  }
  collapseDust(x, y, z, w, h, d) {
    const n = Math.min(60, 14 + (w * d) / 60);
    for (let i = 0; i < n; i++) {
      const px = x + (Math.random() - 0.5) * w * 1.1, pz = z + (Math.random() - 0.5) * d * 1.1;
      const g = 0.38 + Math.random() * 0.12;
      this.smoke.add(px, y + Math.random() * Math.min(h, 40), pz, (px - x) * 0.4, 1 + Math.random() * 4, (pz - z) * 0.4, 8 + Math.random() * Math.min(26, w * 0.5), 5, 5 + Math.random() * 4, g, g * 0.97, g * 0.92, 0.85, 0.5, 0.3);
    }
    for (let i = 0; i < 10; i++) this.debris(x + (Math.random() - 0.5) * w * 0.6, y + Math.random() * h * 0.5, z + (Math.random() - 0.5) * d * 0.6, 8, 0.6 + Math.random() * 1.2);
    this.sound.rumble(Math.min(1, h / 60));
    this.shake = Math.max(this.shake, 0.8);
  }
  // ---------- projectiles ----------
  shoot(kind, pos, dir, owner) {
    const spec = { rocket: { v: 120, g: 0, power: 190, r: 13, life: 4 }, shell: { v: 320, g: 6, power: 300, r: 15, life: 4 }, missile: { v: 360, g: 0, power: 430, r: 22, life: 6 }, bullet: { v: 1100, g: 0, power: 14, r: 2.5, life: 1.6 } }[kind];
    const s = { kind, spec, pos: pos.clone(), vel: dir.clone().normalize().multiplyScalar(spec.v), life: spec.life, owner, mesh: null, t: 0 };
    if (owner && owner.vel) s.vel.add(owner.vel);
    if (kind === 'rocket' || kind === 'missile') { s.mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat); s.glow = new THREE.Mesh(this.shellGeo, this.glowMat); s.mesh.add(s.glow); s.glow.position.z = 0.75; this.scene.add(s.mesh); }
    else if (kind === 'shell') { s.mesh = new THREE.Mesh(this.shellGeo, this.glowMat); this.scene.add(s.mesh); }
    this.shots.push(s);
    if (kind === 'bullet') this.sound.gun(); else if (kind === 'shell') { this.sound.cannon(); this.puff(pos.x, pos.y, pos.z, 4, 3, 1.2, 0.6, 1.5, 0.3); } else this.sound.launch();
  }
  updateShots(dt) {
    let tn = 0;
    const T = this.tracerPos;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt; s.t += dt;
      s.vel.y -= s.spec.g * dt;
      const sp = s.vel.length(), dx = s.vel.x / sp, dy = s.vel.y / sp, dz = s.vel.z / sp;
      const step = sp * dt;
      let hit = null;
      // march the segment (buildings, ground)
      for (let d = 0; d <= step; d += 2.5) {
        const x = s.pos.x + dx * d, y = s.pos.y + dy * d, z = s.pos.z + dz * d;
        if (y < this.dem.heightAt(x, z)) { hit = { x, y: this.dem.heightAt(x, z), z }; break; }
        if (this.city.solidAt(x, y, z)) { hit = { x, y, z }; break; }
      }
      // cars & people
      if (!hit && this.traffic) {
        for (const c of this.traffic.cars) {
          const ox = c.pos.x - s.pos.x, oy = c.pos.y + 0.8 - s.pos.y, oz = c.pos.z - s.pos.z;
          const t = Math.max(0, Math.min(step, ox * dx + oy * dy + oz * dz));
          if (Math.hypot(ox - dx * t, oy - dy * t, oz - dz * t) < 2.0) { hit = { x: s.pos.x + dx * t, y: s.pos.y + dy * t, z: s.pos.z + dz * t, car: c }; break; }
        }
      }
      if (!hit && this.peds && s.kind !== 'bullet') {
        for (const p of this.peds.list) {
          const ox = p.pos.x - s.pos.x, oy = p.pos.y + 1 - s.pos.y, oz = p.pos.z - s.pos.z;
          const t = Math.max(0, Math.min(step, ox * dx + oy * dy + oz * dz));
          if (Math.hypot(ox - dx * t, oy - dy * t, oz - dz * t) < 1.0) { hit = { x: s.pos.x + dx * t, y: s.pos.y + dy * t, z: s.pos.z + dz * t }; break; }
        }
      }
      const from = s.pos.clone();
      if (hit) s.pos.set(hit.x, hit.y, hit.z); else s.pos.addScaledVector(s.vel, dt);
      if (s.kind === 'bullet') {
        if (tn < 120) { const k = tn * 6; T[k] = from.x; T[k + 1] = from.y; T[k + 2] = from.z; T[k + 3] = s.pos.x; T[k + 4] = s.pos.y; T[k + 5] = s.pos.z; tn++; }
        if (hit) {
          this.fire.add(hit.x, hit.y, hit.z, 0, 1, 0, 1.4, 2, 0.12, 1, 0.8, 0.4, 1, 0, 0);
          this.smoke.add(hit.x, hit.y, hit.z, 0, 1.5, 0, 1.2, 1.5, 0.8, 0.5, 0.48, 0.45, 0.5, 1, 0.4);
          this.city.damage(hit.x, hit.y, hit.z, s.spec.r, s.spec.power);
          if (hit.car && this.traffic.hit(hit.car, dx * 0.6, 0.4, dz * 0.6, 7)) { const cc = hit.car; this.explosion(cc.pos.x, cc.pos.y, cc.pos.z, 120, 9); }
        }
      } else {
        if (s.mesh) { s.mesh.position.copy(s.pos); s.mesh.lookAt(s.pos.x + dx, s.pos.y + dy, s.pos.z + dz); }
        if (s.kind !== 'shell') this.smoke.add(from.x, from.y, from.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 1.2, 2.2, 1.6, 0.72, 0.72, 0.72, 0.6, 1, 0.2);
        if (s.kind !== 'shell') this.fire.add(s.pos.x - dx, s.pos.y - dy, s.pos.z - dz, 0, 0, 0, 1.6, -2, 0.08, 1, 0.7, 0.3, 1, 0, 0);
        if (hit) this.explosion(hit.x, hit.y, hit.z, s.spec.power, s.spec.r);
      }
      if (hit || s.life <= 0) {
        if (!hit && s.kind !== 'bullet') this.explosion(s.pos.x, s.pos.y, s.pos.z, s.spec.power * 0.6, s.spec.r * 0.8);
        if (s.mesh) { this.scene.remove(s.mesh); }
        this.shots.splice(i, 1);
      }
    }
    for (let k = tn * 6; k < Math.min(T.length, this.lastTn * 6 || 0); k++) T[k] = 0;
    this.lastTn = tn;
    this.tracers.geometry.setDrawRange(0, tn * 2);
    this.tracerAttr.needsUpdate = true;
  }
  update(dt, camPos) {
    this.updateShots(dt);
    this.smoke.update(dt, camPos); this.fire.update(dt, camPos);
    // burning wrecks keep smoking
    if (this.traffic) {
      this.burnT = (this.burnT || 0) - dt;
      if (this.burnT <= 0) { this.burnT = 0.18; for (const c of this.traffic.cars) if (c.burnt && Math.random() < 0.6) { this.smoke.add(c.pos.x, c.pos.y + 1.5, c.pos.z, 0, 2, 0, 2.2, 2.6, 3.5, 0.08, 0.08, 0.08, 0.7, 0.4, 1); this.fire.add(c.pos.x, c.pos.y + 1, c.pos.z, 0, 1.5, 0, 1.6, 0.5, 0.35, 1, 0.5, 0.15, 0.8, 1, 1); } }
    }
    // debris
    let n = 0;
    for (let i = this.deb.length - 1; i >= 0; i--) {
      const d = this.deb[i];
      d.life -= dt;
      if (d.life <= 0) { this.deb.splice(i, 1); continue; }
      d.vy -= 20 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const g = this.dem.heightAt(d.x, d.z) + d.s * 0.5;
      if (d.y < g) { d.y = g; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wy *= 0.5; }
      d.rx += d.wx * dt; d.ry += d.wy * dt;
    }
    for (const d of this.deb) {
      this.e.set(d.rx, d.ry, 0); this.q.setFromEuler(this.e); this.s.setScalar(d.s);
      this.m4.compose(new THREE.Vector3(d.x, d.y, d.z), this.q, this.s);
      this.debMesh.setMatrixAt(n++, this.m4);
    }
    this.debMesh.count = n; this.debMesh.instanceMatrix.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }
}
