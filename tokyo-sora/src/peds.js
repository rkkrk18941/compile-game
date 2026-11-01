// Pedestrians walking along sidewalks / footpaths of the road graph (instanced, animated in the shader).
import * as THREE from 'three';
import { ActivityPool } from './activity.js';
import { personModel } from './models.js';
import { shared } from './shaders.js';

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv; uniform float uTime;
attribute float aPart; attribute float aLimb;
attribute vec3 aShirt; attribute vec3 aPants; attribute vec4 aAnim; // phase, amplitude, omega, skin
varying vec3 vCol; varying vec3 vN; varying float vDist;
void main() {
  vec3 p = position; vec3 nrm = normal;
  float ph = uTime * aAnim.z + aAnim.x;
  float a = 0.0, piv = 0.0;
  if (aLimb > 0.5 && aLimb < 2.5) { piv = 0.9; a = sin(ph) * 0.55 * aAnim.y * (aLimb < 1.5 ? 1.0 : -1.0); }
  else if (aLimb > 2.5) { piv = 1.45; a = -sin(ph) * 0.5 * aAnim.y * (aLimb < 3.5 ? 1.0 : -1.0); }
  if (a != 0.0) {
    float c = cos(a), s = sin(a), y = p.y - piv;
    p = vec3(p.x, piv + y * c - p.z * s, y * s + p.z * c);
    nrm = vec3(nrm.x, nrm.y * c - nrm.z * s, nrm.y * s + nrm.z * c);
  }
  vec3 skin = mix(vec3(0.93, 0.76, 0.62), vec3(0.55, 0.4, 0.3), aAnim.w);
  vCol = aPart < 0.5 ? skin : aPart < 1.5 ? aShirt : aPart < 2.5 ? aPants : aPart < 3.5 ? vec3(0.06, 0.05, 0.045) : vec3(0.09);
  mat4 im = modelMatrix * instanceMatrix;
  vN = normalize(mat3(im) * nrm);
  vec4 mv = viewMatrix * im * vec4(p, 1.0);
  float d2 = dot(mv.xyz, mv.xyz);
  mv.xyz -= (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz * (d2 * uCurv);
  vDist = sqrt(d2);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;
const FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbSky; uniform vec3 uAmbGround;
varying vec3 vCol; varying vec3 vN; varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN);
  vec3 col = vCol * (mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) + uSunColor * max(dot(n, uSunDir), 0.0));
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, fogF);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
const SHIRTS = ['#1f2a44', '#f2f2f0', '#2b2b2d', '#7a8a9e', '#c23b3b', '#e0c9a6', '#3d6b4f', '#5a4a7a', '#d98c3a', '#9fb7d6', '#ead7d7', '#444a52'];
const PANTS = ['#1d2230', '#2b2b2d', '#3a3f4a', '#5b5040', '#22344f', '#8a8478', '#121212'];

export class Peds {
  constructor(scene, city, dem) {
    this.city = city; this.dem = dem;
    this.max = 70; this.radius = 230; this.cap = 200;
    this.list = [];
    const geo = personModel();
    this.aShirt = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.aPants = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.aAnim = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    for (const a of [this.aShirt, this.aPants, this.aAnim]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShirt', this.aShirt); geo.setAttribute('aPants', this.aPants); geo.setAttribute('aAnim', this.aAnim);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCurv: shared.uCurv, uTime: shared.uTime, uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uAmbSky: shared.uAmbSky, uAmbGround: shared.uAmbGround },
      vertexShader: VS, fragmentShader: FS,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.one = new THREE.Vector3(1, 1, 1);
    this.c = new THREE.Color();
    this.spawnT = 0; this.activity = new ActivityPool('ped'); this.hour = 12; this.weekend = false;
  }
  setDensity(n) { this.max = Math.min(this.cap, n); }
  walkable(g, e) { const c = g.eCls[e]; return (g.ePed?.[e] > 0) && c >= 2 && c <= 8 && !(g.eSW[e] === 0 && c <= 5); }
  path(t, e, dir) {
    const g = t.graph, s = g.eS[e], c = g.eC[e], pts = [];
    for (let i = 0; i < c; i++) { const k = (s + (dir > 0 ? i : c - 1 - i)) * 3; pts.push([g.pts[k] + t.cx, g.pts[k + 1], g.pts[k + 2] + t.cz]); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  enter(p, t, e, dir, s) {
    const g = t.graph;
    p.t = t; p.gv = t.graphVersion; p.e = e; p.dir = dir; p.path = this.path(t, e, dir); p.s = s || 0; p.seg = 0;
    const hw = g.eHW[e], sw = g.eSW[e], cls = g.eCls[e];
    p.lat = p.side * (sw > 0 ? hw + sw * (0.3 + p.rnd * 0.45) : cls === 8 ? Math.min(0.7, hw * 0.4) : Math.max(0.3, hw - 0.45));
  }
  spawn(px, pz) {
    if (!this.activity.items.length) return false;
    for (let tries = 0; tries < 12; tries++) {
      const candidate = this.activity.pick(); if (!candidate) continue;
      const {t, e} = candidate, g = t.graph;
      if (!this.walkable(g, e) || g.eLen[e] < 5) continue;
      const k = g.eS[e] * 3;
      if (Math.abs(g.pts[k + 1] - this.dem.heightAt(g.pts[k] + t.cx, g.pts[k + 2] + t.cz)) > 3) continue; // elevated
      const p = { side: Math.random() < 0.5 ? 1 : -1, rnd: Math.random(), pos: new THREE.Vector3(), yaw: 0, state: 'walk', timer: 0,
        speed: 1.05 + Math.random() * 0.55, phase: Math.random() * 6.28,
        shirt: new THREE.Color(SHIRTS[(Math.random() * SHIRTS.length) | 0]), pants: new THREE.Color(PANTS[(Math.random() * PANTS.length) | 0]), skin: Math.random() * 0.35 };
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.enter(p, t, e, dir, dir > 0 ? candidate.s : g.eLen[e] - candidate.s);
      this.place(p, 1);
      const d = Math.hypot(p.pos.x - px, p.pos.z - pz);
      if (d > this.radius || d < 25) continue;
      this.list.push(p);
      return;
    }
  }
  next(p) {
    const t = p.t, g = t.graph;
    const node = p.dir > 0 ? g.eB[p.e] : g.eA[p.e];
    const opts = [];
    for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) { const e = g.adj[k]; if (e !== p.e && this.walkable(g, e)) opts.push(e); }
    if (!opts.length || Math.random() < 0.06) { this.enter(p, t, p.e, -p.dir, 0); p.side = -p.side; p.lat = -p.lat; return; }
    const e = opts[(Math.random() * opts.length) | 0];
    this.enter(p, t, e, g.eA[e] === node ? 1 : -1, 0);
  }
  place(p, k) {
    const P = p.path, n = P.pts.length;
    let i = p.seg;
    while (i < n - 2 && P.cum[i + 1] < p.s) i++;
    while (i > 0 && P.cum[i] > p.s) i--;
    p.seg = i;
    const a = P.pts[i], b = P.pts[Math.min(n - 1, i + 1)];
    const L = Math.max(0.001, P.cum[i + 1] - P.cum[i]), f = Math.min(1, Math.max(0, (p.s - P.cum[i]) / L));
    const dx = (b[0] - a[0]) / L, dz = (b[2] - a[2]) / L;
    const x = a[0] + (b[0] - a[0]) * f + dz * p.lat, z = a[2] + (b[2] - a[2]) * f - dx * p.lat;
    p.pos.x += (x - p.pos.x) * k; p.pos.z += (z - p.pos.z) * k;
    p.pos.y = this.dem.heightAt(p.pos.x, p.pos.z) + 0.2;
    const yaw = Math.atan2(dx, -dz);
    let d = yaw - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    p.yaw += d * Math.min(1, k * 0.3 + 0.1);
  }
  // explosion nearby: run away
  panic(x, z, r) {
    if (this.list.length > this.activity.desired) { const i=this.list.findIndex(p=>Math.hypot(p.pos.x-px,p.pos.z-pz)>90); if(i>=0)this.list.splice(i,1); }
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d > r) continue;
      p.state = 'flee'; p.timer = 7 + Math.random() * 4;
      // turn around if heading towards the danger
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      if (fx * (x - p.pos.x) + fz * (z - p.pos.z) > 0 && p.path) { p.dir = -p.dir; this.enter(p, p.t, p.e, p.dir, Math.max(0, p.path.len - p.s)); p.side = -p.side; p.lat = -p.lat; }
    }
  }
  // knocked over by a car or blast
  knock(p, vx, vy, vz) {
    p.state = 'down'; p.vel = new THREE.Vector3(vx, vy, vz); p.timer = 14; p.spin = (Math.random() - 0.5) * 8; p.fall = 0;
  }
  blast(x, y, z, r, power) {
    for (const p of this.list) {
      const dx = p.pos.x - x, dz = p.pos.z - z, d = Math.hypot(dx, dz, p.pos.y - y);
      if (d > r || p.state === 'down') continue;
      const k = (1 - d / r) * power;
      this.knock(p, (dx / (d || 1)) * k, 3 + k * 0.6, (dz / (d || 1)) * k);
    }
  }
  update(dt, px, pz, hazards) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const far = Math.hypot(p.pos.x - px, p.pos.z - pz) > this.radius + 60;
      if (far || (p.state !== 'down' && (!p.t.graph || p.t.dropped || p.t.graphVersion !== p.gv)) || (p.state === 'down' && p.timer <= 0)) this.list.splice(i, 1);
    }
    this.activity.update(this.city, this.dem, px, pz, this.radius, this.hour, this.weekend, this.max, dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.list.length < this.activity.desired) { this.spawnT = 0.05; this.spawn(px, pz); }
    for (const p of this.list) {
      if (p.state === 'down') {
        p.timer -= dt;
        p.vel.y -= 20 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const g = this.dem.heightAt(p.pos.x, p.pos.z) + 0.15;
        if (p.pos.y < g) { p.pos.y = g; p.vel.multiplyScalar(0.6); p.vel.y = Math.abs(p.vel.y) > 2 ? -p.vel.y * 0.3 : 0; }
        p.fall = Math.min(Math.PI / 2, p.fall + dt * 5);
        p.yaw += p.spin * dt; p.spin *= 0.95;
        continue;
      }
      // vehicles (player car, wrecks) hitting people
      for (const h of hazards) {
        if (h.speed < 4) continue;
        const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
        if (d < h.r && Math.abs(p.pos.y - h.y) < 3) { this.knock(p, h.vx * 0.7 + (p.pos.x - h.x) * 2, 4 + h.speed * 0.2, h.vz * 0.7 + (p.pos.z - h.z) * 2); break; }
      }
      if (p.state === 'down') continue;
      let sp = p.speed;
      if (p.state === 'flee') { sp = 4.2; p.timer -= dt; if (p.timer <= 0) p.state = 'walk'; }
      p.s += sp * dt;
      if (p.s >= p.path.len) { const over = p.s - p.path.len; this.next(p); p.s = over; }
      this.place(p, Math.min(1, dt * 8));
      p.anim = p.state === 'flee' ? 1.4 : 1;
      p.omega = sp * 4.6;
    }
    this.draw();
  }
  draw() {
    let n = 0;
    for (const p of this.list) {
      if (n >= this.cap) break;
      this.e.set(p.state === 'down' ? -(p.fall || 0) : 0, -p.yaw, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m4.compose(p.pos, this.q, this.one);
      this.mesh.setMatrixAt(n, this.m4);
      this.aShirt.setXYZ(n, p.shirt.r, p.shirt.g, p.shirt.b);
      this.aPants.setXYZ(n, p.pants.r, p.pants.g, p.pants.b);
      this.aAnim.setXYZW(n, p.phase, p.state === 'down' ? 0 : p.anim || 1, p.omega || 6, p.skin);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aShirt.needsUpdate = true; this.aPants.needsUpdate = true; this.aAnim.needsUpdate = true;
  }
}
