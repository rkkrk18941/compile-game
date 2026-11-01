// Traffic: cars driving on the left along the OSM road graph of nearby city tiles.
import * as THREE from 'three';
import { ActivityPool } from './activity.js';
import { carModel } from './models.js';
import { addCurvature, shared } from './shaders.js';

const SPEED = { 1: 22, 2: 15, 3: 14, 4: 12, 5: 10, 6: 7, 7: 5 };
const TYPES = [
  { kind: 'sedan', w: 5, colors: ['#f4f4f2', '#1b1c1e', '#9aa0a6', '#d7d9db', '#24365c', '#7d1d22', '#3d4a3a'] },
  { kind: 'kei', w: 3, colors: ['#f4f4f2', '#eadcb8', '#9db7c9', '#d9d9d9', '#f2c9cf'] },
  { kind: 'taxi', w: 1.5, colors: ['#151617', '#f3c623', '#2d6b3e', '#f5f3ee'] },
  { kind: 'truck', w: 1, colors: ['#f4f4f2', '#2f5fa8', '#3c8a52'] },
  { kind: 'bus', w: 0.5, colors: ['#e9ecef'] },
];

export class Traffic {
  constructor(scene, city, dem) {
    this.city = city; this.dem = dem;
    this.max = 50; this.radius = 520;
    this.cars = [];
    this.types = TYPES.map((T) => {
      const m = carModel(T.kind);
      const mat = addCurvature(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x4a4a4a }));
      const body = new THREE.InstancedMesh(m.body, mat, 40);
      const lmat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const lights = new THREE.InstancedMesh(m.lights, addCurvature(lmat), 40);
      for (const im of [body, lights]) { im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
      body.setColorAt(0, new THREE.Color());
      return { ...T, model: m, body, lights, lmat, pool: [] };
    });
    this.totalW = TYPES.reduce((s, t) => s + t.w, 0);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.one = new THREE.Vector3(1, 1, 1); this.v = new THREE.Vector3();
    this.spawnT = 0; this.activity = new ActivityPool('car'); this.hour = 12; this.weekend = false;
  }
  setDensity(n) { this.max = n; }
  pickType() { let r = Math.random() * this.totalW; for (const t of this.types) { r -= t.w; if (r <= 0) return t; } return this.types[0]; }
  // --- graph helpers ---
  edgePoints(t, e, dir) {
    const g = t.graph, s = g.eS[e], c = g.eC[e], pts = [];
    for (let i = 0; i < c; i++) { const k = (s + (dir > 0 ? i : c - 1 - i)) * 3; pts.push([g.pts[k] + t.cx, g.pts[k + 1], g.pts[k + 2] + t.cz]); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  allowed(g, e, dir) { const o = g.eOne[e]; return !o || (o > 0 ? dir > 0 : dir < 0); }
  enter(car, t, e, dir, s) {
    const g = t.graph;
    car.t = t; car.gv = t.graphVersion; car.e = e; car.dir = dir;
    car.path = this.edgePoints(t, e, dir); car.s = s || 0; car.seg = 0;
    const cls = g.eCls[e], hw = g.eHW[e];
    car.vmax = (SPEED[cls] || 7) * car.temper;
    const oneway = g.eOne[e] !== 0;
    const lanes = Math.max(1, Math.round((hw * 2) / 3.25));
    const per = oneway ? lanes : Math.max(1, Math.floor(lanes / 2));
    const laneW = (oneway ? 2 * hw : hw) / per;
    const k = Math.min(per - 1, car.lanePref % per);
    car.lat = cls >= 6 && !oneway ? hw * 0.45 : hw - (k + 0.5) * laneW;
  }
  spawn(px, pz) {
    if (!this.activity.items.length) return false;
    for (let tries = 0; tries < 12; tries++) {
      const candidate = this.activity.pick(); if (!candidate) continue;
      const {t, e} = candidate, g = t.graph;
      const cls = g.eCls[e];
      if (!(g.eCar?.[e] > 0) || cls > 7 || g.eLen[e] < 8) continue;
      let dir = Math.random() < 0.5 ? 1 : -1;
      if (!this.allowed(g, e, dir)) dir = -dir;
      const T = this.pickType();
      if (T.kind === 'bus' && cls > 4) continue;
      const car = { id: this.nextCarId=(this.nextCarId||0)+1, T, color: new THREE.Color(T.colors[(Math.random() * T.colors.length) | 0]), temper: 0.8 + Math.random() * 0.35, lanePref: (Math.random() * 3) | 0,
        speed: 0, pos: new THREE.Vector3(), yaw: 0, pitch: 0, state: 'drive', hp: 60, wait: 0 };
      this.enter(car, t, e, dir, dir > 0 ? candidate.s : g.eLen[e] - candidate.s);
      this.place(car); car.yaw = Math.atan2(car.path.pts[Math.min(car.path.pts.length - 1, car.seg + 1)][0] - car.path.pts[car.seg][0], -(car.path.pts[Math.min(car.path.pts.length - 1, car.seg + 1)][2] - car.path.pts[car.seg][2]));
      const d = Math.hypot(car.pos.x - px, car.pos.z - pz);
      if (d > this.radius || d < 60) continue;
      // keep a gap to cars already on this lane
      let clash = false;
      for (const o of this.cars) if (o.state === 'drive' && o.t === t && o.e === e && o.dir === dir && Math.abs(o.s - car.s) < 14) { clash = true; break; }
      if (clash) continue;
      car.speed = car.vmax * 0.6;
      this.cars.push(car);
      return true;
    }
    return false;
  }
  nextEdge(car) {
    const opts=this.city.roads.continuations(car.t,car.e,car.dir,'car');
    if(!opts.length){
      const g=car.t.graph;
      if(this.allowed(g,car.e,-car.dir)){this.enter(car,car.t,car.e,-car.dir,0);car.speed*=.2;return true;}
      return false;
    }
    const end=car.path.pts.at(-1),before=car.path.pts.at(-2),dx=end[0]-before[0],dz=end[2]-before[2],len=Math.hypot(dx,dz)||1;
    for(const q of opts){const p=this.edgePoints(q.t,q.e,q.dir).pts,l=Math.hypot(p[1][0]-p[0][0],p[1][2]-p[0][2])||1,dot=(dx*(p[1][0]-p[0][0])+dz*(p[1][2]-p[0][2]))/(len*l);q.weight=Math.max(.1,1+dot*2);}
    let r=Math.random()*opts.reduce((s,q)=>s+q.weight,0);let pick=opts.at(-1);
    for(const q of opts){r-=q.weight;if(r<=0){pick=q;break;}}
    this.enter(car,pick.t,pick.e,pick.dir,0);return true;
  }
  // world position at distance s along the current path, offset to the left lane
  place(car) {
    const p = car.path, n = p.pts.length;
    let i = car.seg;
    while (i < n - 2 && p.cum[i + 1] < car.s) i++;
    while (i > 0 && p.cum[i] > car.s) i--;
    car.seg = i;
    const a = p.pts[i], b = p.pts[Math.min(n - 1, i + 1)];
    const L = Math.max(0.001, p.cum[i + 1] - p.cum[i]);
    const f = Math.min(1, Math.max(0, (car.s - p.cum[i]) / L));
    const dx = (b[0] - a[0]) / L, dz = (b[2] - a[2]) / L;
    const lx = dz, lz = -dx; // left of travel direction
    const x = a[0] + (b[0] - a[0]) * f + lx * car.lat, z = a[2] + (b[2] - a[2]) * f + lz * car.lat;
    const elevated = Math.abs(a[1] - this.dem.heightAt(a[0], a[2])) > 3;
    const y = elevated ? a[1] + (b[1] - a[1]) * f + 0.15 : this.dem.heightAt(x, z) + 0.12;
    car.pos.set(x, y, z);
    const yaw = Math.atan2(dx, -dz);
    let dy = yaw - car.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    car.yaw += dy * 0.25;
  }
  update(dt, player, targets) {
    const px = player.x, pz = player.z;
    // retire cars that are too far or whose tile went away
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const far = Math.hypot(c.pos.x - px, c.pos.z - pz) > this.radius + 140;
      if (c.state === 'drive' && (far || c.t.dropped || c.t.graphVersion !== c.gv || !c.t.graph)) this.cars.splice(i, 1);
      else if (c.state === 'wreck' && (far || (c.life -= dt) <= 0)) this.cars.splice(i, 1);
    }
    this.activity.update(this.city, this.dem, px, pz, this.radius, this.hour, this.weekend, this.max, dt);
    this.spawnT -= dt;
    let live = 0; for (const c of this.cars) if (c.state === 'drive') live++;
    if (this.spawnT <= 0 && live < this.activity.desired) { this.spawnT = 0.06; this.spawn(px, pz); }
    if (live > this.activity.desired) { const i = this.cars.findIndex(c => c.state === 'drive' && Math.hypot(c.pos.x-px,c.pos.z-pz)>180); if(i>=0) this.cars.splice(i,1); }
    // queueing: cars on the same edge & direction keep their distance
    const lanes = new Map();
    for (const c of this.cars) if (c.state === 'drive') { const k = c.t.key + ':' + c.e + ':' + c.dir + ':' + Math.round(c.lat); let a = lanes.get(k); if (!a) lanes.set(k, (a = [])); a.push(c); }
    for (const a of lanes.values()) { a.sort((p, q) => p.s - q.s); for (let i = 0; i < a.length; i++) a[i].ahead = i + 1 < a.length ? a[i + 1].s - a[i].s : 1e9; }
    for (const c of this.cars) {
      if (c.state === 'wreck') { this.physics(c, dt); continue; }
      let target = c.vmax;
      if (c.ahead < 9 + c.speed * 1.2) target = Math.min(target, Math.max(0, (c.ahead - 7) * 0.8));
      // stop for whatever stands in front (player, player vehicle)
      const fx = Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const hx = c.pos.x + fx * (c.T.model.len * 0.5 + 3), hz = c.pos.z + fz * (c.T.model.len * 0.5 + 3);
      for (const o of targets) if (Math.hypot(o.x - hx, o.z - hz) < o.r + 2.5 && Math.abs(o.y - c.pos.y) < 4) { target = 0; c.wait += dt; }
      if (target > 0.5) c.wait = 0;
      // slow down before tight turns at the end of an edge
      const remain = c.path.len - c.s;
      if (remain < 12) target = Math.min(target, 5 + remain * 0.6);
      if(remain<18)for(const other of this.cars){
        if(other===c||other.state!=='drive'||Math.abs(other.pos.y-c.pos.y)>2.5)continue;
        const endpoint=c.path.pts.at(-1),distance=Math.hypot(other.pos.x-endpoint[0],other.pos.z-endpoint[2]);
        if(distance>12||Math.cos(other.yaw-c.yaw)>.75)continue;
        // The approach closer to the junction goes first; stable ID breaks a tie.
        const otherRemain=other.path.len-other.s;
        if(otherRemain<remain-1 || Math.abs(otherRemain-remain)<=1 && other.id<c.id)target=0;
      }
      const acc = target > c.speed ? 3.2 : 7;
      c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), acc * dt);
      c.s += c.speed * dt;
      if (c.s >= c.path.len) {
        const over = c.s - c.path.len;
        if (!this.nextEdge(c)) { c.retire=true; continue; }
        c.s = over;
      }
      this.place(c);
      c.honk = c.wait > 1.5;
    }
    this.cars=this.cars.filter(c=>!c.retire);
    this.draw();
  }
  // simple rigid-body motion for hit / destroyed cars
  physics(c, dt) {
    c.vel.y -= 22 * dt;
    c.pos.addScaledVector(c.vel, dt);
    c.yaw += c.spin.y * dt; c.pitch += c.spin.x * dt; c.roll = (c.roll || 0) + c.spin.z * dt;
    const g = this.dem.heightAt(c.pos.x, c.pos.z) + 0.1;
    if (c.pos.y < g) {
      c.pos.y = g;
      if (c.vel.y < -3) c.vel.y *= -0.3; else c.vel.y = 0;
      c.vel.x *= 0.92; c.vel.z *= 0.92; c.spin.multiplyScalar(0.85);
      c.pitch *= 0.9;
      const r = c.roll || 0; const near = Math.round(r / Math.PI) * Math.PI; c.roll = r + (near - r) * 0.12;
    }
    const p = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
    if (this.city.pushOut(p, 1.2, 1.5, 0.3)) { c.pos.x = p.x; c.pos.z = p.z; c.vel.x *= -0.3; c.vel.z *= -0.3; }
  }
  // knock a car away (from a collision or blast)
  hit(c, vx, vy, vz, dmg) {
    if(this.safeMode)return false;
    if (c.state !== 'wreck') { c.state = 'wreck'; c.vel = new THREE.Vector3(); c.spin = new THREE.Vector3(); c.life = 45; c.roll = 0; c.pitch = 0; c.speed = 0; }
    c.vel.x += vx; c.vel.y += vy; c.vel.z += vz;
    c.spin.set((Math.random() - 0.5) * vy * 0.4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * vy * 0.5);
    c.hp -= dmg;
    if (c.hp <= 0 && !c.burnt) { c.burnt = true; c.color.multiplyScalar(0.18); return true; }
    return false;
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) { const d = Math.hypot(c.pos.x - x, c.pos.z - z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  remove(c) { const i = this.cars.indexOf(c); if (i >= 0) this.cars.splice(i, 1); }
  draw() {
    for (const T of this.types) T.n = 0;
    const night = shared.uNight.value;
    for (const c of this.cars) {
      const T = c.T;
      if (T.n >= T.body.instanceMatrix.count) this.grow(T);
      this.e.set(c.pitch || 0, c.yaw ? -c.yaw : 0, c.roll || 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m4.compose(c.pos, this.q, this.one);
      T.body.setMatrixAt(T.n, this.m4); T.lights.setMatrixAt(T.n, this.m4);
      T.body.setColorAt(T.n, c.color);
      T.n++;
    }
    for (const T of this.types) {
      T.body.count = T.n; T.lights.count = T.n;
      T.body.instanceMatrix.needsUpdate = true; T.lights.instanceMatrix.needsUpdate = true;
      if (T.body.instanceColor) T.body.instanceColor.needsUpdate = true;
      T.lmat.color.setScalar(0.6 + night * 1.8);
    }
  }
  grow(T) {
    const cap = T.body.instanceMatrix.count * 2;
    for (const key of ['body', 'lights']) {
      const old = T[key];
      const im = new THREE.InstancedMesh(old.geometry, old.material, cap);
      im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (key === 'body') im.setColorAt(0, new THREE.Color());
      old.parent.add(im); old.parent.remove(old); old.dispose();
      T[key] = im;
    }
  }
}
