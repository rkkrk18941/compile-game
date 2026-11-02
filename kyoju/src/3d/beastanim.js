// 巨獣の動き：骨を親から順に計算し（FK）、脚は地面に置いた足へ届くように解く（IK）。
// 歩く・跳ねる・這う・飛ぶ・攻撃・咆哮・死を、骨の回転の重ね合わせで作る。
import * as THREE from 'three';
import { groundH } from './world.js';
import { clamp, lerp, smoothstep } from './noise.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const QI = new THREE.Quaternion();
const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);
const frac = (x) => x - Math.floor(x);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// 区間 [a,b] の中での進み具合（0..1）
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const bump = (t, a, b, c, d) => seg(t, a, b) * (1 - seg(t, c, d));

function basisQuat(Y, X, out) {
  _by.copy(Y).normalize();
  _bx.copy(X).addScaledVector(_by, -X.dot(_by));
  if (_bx.lengthSq() < 1e-8) _bx.set(1, 0, 0).addScaledVector(_by, -_by.x);
  _bx.normalize();
  _bz.crossVectors(_bx, _by);
  _m.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_m);
}
const qAxis = (axis, ang, out) => out.setFromAxisAngle(axis, ang);
// 骨の局所軸：X=蝶番（横）、Y=骨の向き、Z=骨の「上」
function qLocal(pitch, yaw, roll, out) {
  _q2.setFromAxisAngle(AZ, yaw);
  _q3.setFromAxisAngle(AX, pitch);
  out.copy(_q2).multiply(_q3);
  if (roll) { _q3.setFromAxisAngle(AY, roll); out.multiply(_q3); }
  return out;
}

const GAIT = {
  biped: { stride: 1.05, duty: 0.4, bob: 0.03, roll: 0.03, lift: 0.2, minCycle: 1.6, footR: 4.6 },
  quad: { stride: 0.9, duty: 0.3, bob: 0.02, roll: 0.015, lift: 0.22, minCycle: 1.4, footR: 4.2 },
  multi: { stride: 0.62, duty: 0.42, bob: 0.012, roll: 0.01, lift: 0.3, minCycle: 1.0, footR: 1.8 },
  hop: { stride: 1, duty: 0.4, bob: 0.03, roll: 0.0, lift: 0.2, minCycle: 1.6, footR: 5.5 },
};

export class BeastAnimator {
  constructor(beast, onEvent) {
    const A = beast.A, rig = A.rig;
    this.b = beast; this.A = A; this.sF = A.sizeF; this.J = rig.j; this.n = rig.j.length;
    this.onEvent = onEvent || (() => {});
    this.W = this.J.map(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() }));
    this.loc = this.J.map(() => new THREE.Quaternion());
    this.absQ = this.J.map(() => new THREE.Quaternion());
    this.abs = new Uint8Array(this.n);
    const id = (nm) => (rig.map[nm] != null ? rig.map[nm] : -1);
    this.id = id;
    this.iPelvis = id('pelvis'); this.iSpine = id('spine'); this.iChest = id('chest');
    this.iNeck = ['neck0', 'neck1', 'neck2'].map(id).filter((i) => i >= 0);
    this.iHead = id('head'); this.iJaw = id('jaw');
    const chain = (prefix, endName) => { const out = []; for (let k = 0; ; k++) { const i = id(prefix + k); if (i < 0) break; out.push(i); } const e = id(endName || prefix + 'end'); if (e >= 0) out.push(e); return out; };
    this.tails = [];
    if (id('tail0') >= 0) this.tails.push(chain('tail'));
    for (let k = 0; k < 3; k++) if (id('tt' + k + '0') >= 0) this.tails.push(chain('tt' + k));
    this.tents = [];
    for (const s of ['aR', 'aL']) for (let k = 0; k < 2; k++) if (id(s + 't' + k + '0') >= 0) this.tents.push({ side: s === 'aR' ? -1 : 1, k, c: chain(s + 't' + k) });
    this.serp = id('S0') >= 0 ? chain('S', 'Send') : null;
    this.arms = [];
    for (const s of ['aR', 'aL']) if (id(s + 'up') >= 0) this.arms.push({ side: s === 'aR' ? -1 : 1, up: id(s + 'up'), fo: id(s + 'fo'), ha: id(s + 'ha'), dac: id(s + 'dac') });
    this.wings = [];
    for (const s of ['wR', 'wL']) if (id(s + '0') >= 0) this.wings.push({ side: s === 'wR' ? -1 : 1, b: [id(s + '0'), id(s + '1'), id(s + '2')], f: [0, 1, 2, 3].map((k) => id(s + 'f' + k)) });
    this.iwings = [];
    for (const s of ['iR', 'iL']) for (let k = 0; k < 2; k++) if (id(s + k) >= 0) this.iwings.push({ side: s === 'iR' ? -1 : 1, k, i: id(s + k) });
    this.frame = A.frame;
    this.G = GAIT[this.frame] || GAIT.biped;
    // 口の位置（頭の骨の局所座標）
    const hj = this.J[this.iHead];
    this.mouthL = new THREE.Vector3(...A.mouth).multiplyScalar(this.sF).sub(hj.rp).applyQuaternion(hj.rq.clone().invert());
    this.headLen = this.mouthL.length();
    // 脚
    this.legs = [];
    for (const f of A.footJoints) {
      if (f.serpent) continue;
      const L = { kind: f.kind, side: f.side, front: f.front, idx: f.idx, pre: f.pre };
      L.thigh = id(f.pre + 'thigh'); L.shin = id(f.pre + 'shin'); L.meta = id(f.pre + 'meta'); L.toe = id(f.pre + 'toe');
      L.plantJ = L.toe; L.ankleJ = L.meta >= 0 ? L.meta : L.toe;
      const J = this.J;
      L.L1 = J[L.shin].lo.length(); L.L2 = J[L.ankleJ].lo.length();
      L.home = J[L.plantJ].rp.clone(); L.footY = L.home.y;
      L.metaV = J[L.ankleJ].rp.clone().sub(J[L.plantJ].rp);
      const H = J[L.thigh].rp, K = J[L.shin].rp, An = J[L.ankleJ].rp;
      const ha = An.clone().sub(H).normalize();
      L.pole = K.clone().sub(H); L.pole.addScaledVector(ha, -L.pole.dot(ha)).normalize();
      const hingeRest = AX.clone().applyQuaternion(J[L.thigh].rq);
      L.hsign = Math.sign(_v1.crossVectors(ha, L.pole).dot(hingeRest)) || 1;
      if (L.meta >= 0) L.metaX = AX.clone().applyQuaternion(J[L.meta].rq);
      L.toeQ = J[L.toe].rq.clone();
      L.plant = new THREE.Vector3(); L.yaw = 0; L.swing = false; L.from = new THREE.Vector3(); L.fromYaw = 0; L.lift = 0; L.u = 0;
      L.target = new THREE.Vector3(); L.tYaw = 0;
      L.reach = L.L1 + L.L2;
      this.legs.push(L);
    }
    this.legLen = this.legs.length ? Math.max(...this.legs.map((l) => l.reach + l.metaV.length())) : 14 * this.sF;
    this.stride = this.G.stride * this.legLen;
    this.footR = this.G.footR * this.sF;
    // 脚の位相
    for (const L of this.legs) {
      if (L.kind === 'biped' || L.kind === 'hop') L.off = L.side < 0 ? 0 : 0.5;
      else if (L.kind === 'quad') L.off = (L.front ? 0.25 : 0) + (L.side < 0 ? 0.5 : 0);
      else L.off = ((L.idx % 2 === 0) === (L.side < 0) ? 0 : 0.5) + L.idx * 0.05;
    }
    // 翼をたたむ姿勢・羽ばたきの軸
    this.poseFold = null;
    if (this.wings.length) {
      const dirs = {};
      for (const w of this.wings) {
        const s = w.side;
        dirs[w.b[0]] = new THREE.Vector3(s * 0.55, -0.05, -0.83);
        dirs[w.b[1]] = new THREE.Vector3(s * 0.02, 0.12, 0.99);
        dirs[w.b[2]] = new THREE.Vector3(s * 0.12, -0.25, -0.96);
        [[0.14, -0.2], [0.12, -0.36], [0.1, -0.5], [0.08, -0.64]].forEach(([x, y], k) => { dirs[w.f[k]] = new THREE.Vector3(s * x, y, -Math.sqrt(Math.max(0.05, 1 - x * x - y * y))); });
        w.flapAxis = AZ.clone().applyQuaternion(this.J[w.b[0]].rq.clone().invert());
        w.foldAxis = AY.clone().applyQuaternion(this.J[w.b[0]].rq.clone().invert());
      }
      this.poseFold = this.makePose(dirs);
    }
    // 状態
    this.pos = new THREE.Vector3(); this.yaw = 0; this.rootY = 0; this.air = 0; this.airV = 0;
    this.speed = 0; this.wantSpeed = 0; this.wantYaw = 0; this.yawRate = 0; this.maxTurn = 0.4; this.accel = 2.2 * Math.sqrt(this.sF);
    this.vel = new THREE.Vector3();
    this.phase = 0; this.time = 0;
    this.bob = 0; this.lean = 0; this.roll = 0; this.twist = 0; this.crouch = 0;
    this.lookT = null; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.jolt = { p: 0, y: 0, vp: 0, vy: 0 };
    this.act = null;
    this.fold = this.wings.length ? 1 : 0; this.flapT = 0; this.flapAmp = 0;
    this.groundW = 1;
    this.dead = false; this.deathT = 0; this.fallSide = 1; this.fallAng = 0; this.fallV = 0;
    this.hop = this.frame === 'hop' ? { st: 'ground', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), dur: 1, h: 0, wait: 0 } : null;
    this.trail = []; this.trailLen = 0;
    this.rootP = new THREE.Vector3(); this.rootQ = new THREE.Quaternion();
    this.mouthW = new THREE.Vector3(); this.headDirW = new THREE.Vector3(0, 0, 1);
    this.hip = this.J[this.iPelvis].rp.clone();
    this.halfW = (A.B.rz || 10) * this.sF * 0.85;
    this.flying = 0;
  }
  // 根元の向きに対する姿勢（局所回転）を、骨の向き指定から作る
  makePose(dirs) {
    const J = this.J, n = this.n;
    const Wq = new Array(n);
    const out = new Map();
    for (let i = 0; i < n; i++) {
      const j = J[i];
      const pq = j.parent >= 0 ? Wq[j.parent] : new THREE.Quaternion();
      const base = pq.clone().multiply(j.lq);
      let q = base.clone();
      const d = dirs[i];
      if (d && j.dir) {
        const cur = AY.clone().applyQuaternion(q);
        q = new THREE.Quaternion().setFromUnitVectors(cur, d.clone().normalize()).multiply(q);
        out.set(i, base.clone().invert().multiply(q));
      }
      Wq[i] = q;
    }
    return out;
  }
  applyPose(pose, w) {
    if (!pose || w <= 0.001) return;
    for (const [i, lq] of pose) { _q1.copy(QI).slerp(lq, Math.min(1, w)); this.loc[i].multiply(_q1); }
  }
  place(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.wantYaw = yaw;
    this.rootY = groundH(x, z); this.pos.y = this.rootY;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const L of this.legs) {
      L.plant.set(x + L.home.x * c + L.home.z * s, 0, z - L.home.x * s + L.home.z * c);
      L.plant.y = groundH(L.plant.x, L.plant.z) + L.footY;
      L.yaw = yaw; L.swing = false;
    }
    this.trail = [];
    for (let k = 0; k < 200; k++) this.trail.push(new THREE.Vector3(x - Math.sin(yaw) * k * this.sF, 0, z - Math.cos(yaw) * k * this.sF));
    this.update(0);
  }
  setMove(yaw, speed) { this.wantYaw = yaw; this.wantSpeed = speed; }
  look(target, w = 1) { if (target) { this.lookT = this.lookT || new THREE.Vector3(); this.lookT.copy(target); } this.lookWant = target ? w : 0; }
  hit(dirx, dirz, k = 1) {
    // 被弾でびくっとする（局所座標の向きに変換）
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = dirx * c - dirz * s, lz = dirx * s + dirz * c;
    this.jolt.vp += -lz * 0.6 * k; this.jolt.vy += lx * 0.6 * k;
  }
  busy() { return !!this.act && !this.act.soft; }
  play(name, data = {}) {
    if (this.dead) return false;
    const D = { roar: 2.6, swipe: 1.5, bite: 1.3, tailswipe: 1.9, stomp: 1.6, cast: data.dur || 4, charge: data.dur || 4, fly: data.dur || 7, flinch: 0.6 };
    this.act = { name, t: 0, dur: D[name] || 2, data, fired: {} };
    if (name === 'swipe') this.act.side = data.side || (Math.random() < 0.5 ? -1 : 1);
    if (name === 'stomp') this.act.leg = this.legs.length ? this.legs[Math.floor(Math.random() * Math.min(2, this.legs.length))] : null;
    if (name === 'fly') { this.act.start = this.pos.clone(); this.act.to = data.to ? data.to.clone() : this.pos.clone(); }
    return true;
  }
  die(side) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0; this.fallSide = side || (Math.random() < 0.5 ? -1 : 1);
    this.act = null; this.wantSpeed = 0;
  }
  fire(key, type, data) { if (!this.act.fired[key]) { this.act.fired[key] = 1; this.onEvent(type, data || {}); } }
  /* ---------- 毎フレーム ---------- */
  update(dt) {
    this.time += dt;
    const sF = this.sF, G = this.G;
    const loc = this.loc;
    for (let i = 0; i < this.n; i++) { loc[i].identity(); this.abs[i] = 0; }
    // ---- 移動 ----
    let wantSpeed = this.dead ? 0 : this.wantSpeed;
    const act = this.act;
    if (act) {
      act.t += dt;
      if (act.name === 'charge') wantSpeed = (act.data.speed || 3) * Math.max(4, this.wantSpeed) * bump(act.t, 0.5, 1.2, act.dur - 0.6, act.dur);
      else if (act.name !== 'fly' && act.name !== 'flinch') wantSpeed *= act.name === 'cast' ? 0.15 : 0.35;
    }
    const dy = angDiff(this.yaw, this.wantYaw);
    const maxTurn = this.maxTurn * (this.flying > 0.5 ? 2 : 1);
    const turn = clamp(dy * 1.5, -maxTurn, maxTurn);
    this.yawRate = lerp(this.yawRate, this.dead ? 0 : turn, 1 - Math.exp(-dt * 3));
    this.yaw += this.yawRate * dt;
    this.speed += clamp(wantSpeed - this.speed, -this.accel * 1.5 * dt, this.accel * dt);
    if (this.hop) this.updateHop(dt);
    else {
      const sp = this.speed;
      this.vel.set(Math.sin(this.yaw) * sp, 0, Math.cos(this.yaw) * sp);
      this.pos.addScaledVector(this.vel, dt);
    }
    if (act && act.name === 'fly') this.updateFly(dt, act);
    const gh = groundH(this.pos.x, this.pos.z);
    this.rootY = dt > 0 ? lerp(this.rootY, gh, 1 - Math.exp(-dt * 5)) : gh;
    this.pos.y = this.rootY + this.air;
    // ---- 歩行の位相 ----
    const cycle = Math.max(G.minCycle * Math.sqrt(sF), this.stride / Math.max(0.01, this.speed));
    let off = 0;
    for (const L of this.legs) if (L.swing || this.footOff(L) > 0.28 * this.stride) off = 1;
    const prate = this.speed > 0.15 ? 1 / cycle : off ? 0.7 / (G.minCycle * Math.sqrt(sF)) : 0;
    if (!this.hop && !this.dead) this.phase += dt * prate;
    const ph = this.phase, moving = clamp(this.speed / (this.stride / (G.minCycle * 1.6)), 0, 1);
    // ---- 体（根元）の上下・傾き ----
    let bob = 0, roll = 0, lean = 0, twist = 0;
    if (this.frame === 'biped') { bob = -G.bob * this.legLen * (0.5 + 0.5 * Math.cos(TAU * 2 * (ph - 0.1))) * moving; roll = G.roll * Math.sin(TAU * ph) * moving; twist = 0.05 * Math.sin(TAU * ph) * moving; lean = 0.05 * moving; }
    else if (this.frame === 'quad') { bob = -G.bob * this.legLen * (0.5 + 0.5 * Math.cos(TAU * 2 * ph)) * moving; roll = G.roll * Math.sin(TAU * ph) * moving; twist = 0.03 * Math.sin(TAU * ph) * moving; }
    else if (this.frame === 'multi') { bob = -G.bob * this.legLen * (0.5 + 0.5 * Math.cos(TAU * 2 * ph)) * moving; }
    else if (this.frame === 'serpent') { roll = 0.04 * Math.sin(this.time * 1.3); twist = 0.12 * Math.sin(this.trailLen * 0.05 / sF) * moving; }
    // 呼吸
    const breath = Math.sin(this.time * 1.1);
    bob += breath * 0.12 * sF;
    if (this.hop) { bob += this.hop.bob || 0; lean += this.hop.lean || 0; }
    // ---- 行動の姿勢 ----
    const P = { jaw: 0.04 + 0.03 * breath, nP: 0, nY: 0, armR: [0, 0, 0], armL: [0, 0, 0], tailY: 0, tailP: 0, wingOpen: 0, flap: 0, chestY: 0, chestP: 0, crouch: 0, lookW: 0 };
    if (act) this.actionPose(act, P, dt);
    if (act && act.t >= act.dur) { this.act = null; this.onEvent('actEnd', { name: act.name }); }
    lean += P.chestP * 0.3; twist += P.chestY * 0.5;
    bob -= P.crouch * this.legLen * 0.18;
    // 被弾の揺れ（ばね）
    const jo = this.jolt;
    jo.vp += (-jo.p * 40 - jo.vp * 7) * dt; jo.vy += (-jo.y * 40 - jo.vy * 7) * dt;
    jo.p += jo.vp * dt; jo.y += jo.vy * dt;
    // ---- 死 ----
    let fallQ = null, fallP = null;
    if (this.dead) {
      this.deathT += dt;
      const t = this.deathT;
      P.jaw = 0.9 * bump(t, 0, 0.4, 1.4, 2.4) + 0.25 * seg(t, 3, 4);
      P.nP = 0.55 * bump(t, 0, 0.5, 1.2, 2.2) - 0.3 * seg(t, 2.2, 3.2);
      P.chestP = -0.2 * bump(t, 0, 0.5, 1.2, 2.0);
      bob -= this.legLen * 0.22 * seg(t, 1.0, 2.2);
      P.wingOpen = Math.max(P.wingOpen, bump(t, 0, 0.4, 2.2, 3.2));
      if (t > 1.8) {
        this.fallV += dt * (2.6 + this.fallAng * 2.2);
        this.fallAng = Math.min(1.42, this.fallAng + this.fallV * dt);
        if (this.fallAng >= 1.42 && !this.landed) { this.landed = true; this.onEvent('fall', { x: this.pos.x, z: this.pos.z, side: this.fallSide }); }
      }
      // 体を横倒しにする：足もとの外側を支点に、前後の軸で回す
      const s = this.fallSide;
      fallQ = _q3.setFromAxisAngle(AZ, -s * this.fallAng);
      fallP = _v5.set(s * this.halfW * 0.9, 0, 0);
    }
    // ---- 根元の骨 ----
    _q1.setFromEuler(new THREE.Euler(-lean + jo.p * 0.3, twist + jo.y * 0.2, roll, 'YXZ'));
    this.rootP.set(0, bob, 0).sub(this.hip).applyQuaternion(_q1).add(this.hip);
    this.rootQ.copy(_q1);
    if (fallQ) { this.rootP.sub(fallP).applyQuaternion(fallQ).add(fallP); this.rootQ.premultiply(fallQ); this.rootP.y -= this.halfW * 0.25 * seg(this.fallAng, 0.8, 1.42); }
    // ---- 背骨 ----
    if (this.iSpine >= 0) qLocal(0.02 * breath + jo.p * 0.4, -twist * 0.6 + P.chestY * 0.4, 0, loc[this.iSpine]);
    if (this.iChest >= 0) qLocal(0.02 * breath + P.chestP * 0.5 + jo.p * 0.5, -twist * 0.9 + P.chestY * 0.6 + jo.y, 0, loc[this.iChest]);
    // ---- 首と頭：注視 ----
    this.lookW = lerp(this.lookW || 0, this.dead ? 0 : Math.max(this.lookWant || 0, P.lookW), 1 - Math.exp(-dt * 3));
    let lyaw = 0, lpitch = 0;
    if (this.lookT && this.lookW > 0.01) {
      const hw = this.W[this.iHead].p;
      _v1.copy(this.lookT).sub(this.pos).applyAxisAngle(AY, -this.yaw).sub(hw);
      lyaw = clamp(Math.atan2(_v1.x, _v1.z), -1.3, 1.3);
      lpitch = clamp(Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z)) - (this.restHeadPitch || 0), -0.7, 0.5);
    }
    this.lookYaw = lerp(this.lookYaw, lyaw * this.lookW, 1 - Math.exp(-dt * 4));
    this.lookPitch = lerp(this.lookPitch, lpitch * this.lookW, 1 - Math.exp(-dt * 4));
    const nY = this.lookYaw + P.nY + Math.sin(this.time * 0.37) * 0.06 * (1 - this.lookW) + twist * 1.2;
    const nP = this.lookPitch + P.nP + Math.sin(this.time * 0.29) * 0.04 - bob / this.legLen * 0.4 + jo.p * 0.6;
    const nw = [0.22, 0.26, 0.26], hwgt = 0.26;
    this.iNeck.forEach((i, k) => qLocal(nP * nw[k], nY * nw[k], 0, loc[i]));
    if (this.iHead >= 0) qLocal(nP * hwgt, nY * hwgt + jo.y * 0.5, 0, loc[this.iHead]);
    if (this.iJaw >= 0) qLocal(-P.jaw * 0.75, 0, 0, loc[this.iJaw]);
    // ---- 腕 ----
    for (const a of this.arms) {
      const s = a.side, sw = (this.frame === 'biped' ? 0.12 : 0.05) * Math.sin(TAU * ph + (s < 0 ? 0 : Math.PI)) * moving;
      const pa = s < 0 ? P.armR : P.armL;
      qLocal(sw + pa[0] + 0.03 * breath, pa[1] * -s, 0, loc[a.up]);
      qLocal(-0.12 + pa[2] - sw * 0.5, 0, 0, loc[a.fo]);
      if (a.dac >= 0) qLocal(-0.25 * Math.max(0, Math.sin(this.time * 0.9 + s)) - (pa[3] || 0), 0, 0, loc[a.dac]);
    }
    for (const T of this.tents) {
      const s = T.side, pa = s < 0 ? P.armR : P.armL;
      T.c.forEach((i, k) => { if (k < T.c.length - 1) qLocal(0.12 * Math.sin(this.time * 1.4 - k * 0.7 + T.k * 2) + pa[0] / 4, 0.16 * Math.sin(this.time * 1.1 - k * 0.6 + T.k + s) + pa[1] * -s / 4, 0, loc[i]); });
    }
    // ---- 尾 ----
    this.tails.forEach((c, ti) => {
      const nT = c.length - 1;
      c.forEach((i, k) => {
        if (k >= nT) return;
        const u = k / nT;
        const sway = 0.07 * Math.sin(TAU * ph - k * 0.55) * moving + 0.05 * Math.sin(this.time * 0.8 - k * 0.45 + ti * 2) + (ti ? 0.12 * Math.sin(this.time * 1.3 - k * 0.6 + ti) : 0);
        qLocal(P.tailP * (k < 3 ? 0.3 : 0.1), sway - this.yawRate * 0.25 * (0.3 + u) + P.tailY / Math.max(1, nT * 0.6), 0, loc[i]);
      });
    });
    // ---- 翼 ----
    if (this.wings.length) {
      const wantFold = this.dead ? 1 - P.wingOpen : 1 - Math.max(P.wingOpen, this.flying);
      this.fold = lerp(this.fold, wantFold, 1 - Math.exp(-dt * 3));
      this.applyPose(this.poseFold, this.fold);
      this.flapAmp = lerp(this.flapAmp, Math.max(P.flap, this.flying * 0.9), 1 - Math.exp(-dt * 3));
      this.flapT += dt * (2.2 + this.flapAmp * 1.5);
      for (const w of this.wings) {
        const a = Math.sin(this.flapT * 1.6) * 0.55 * this.flapAmp;
        _q1.setFromAxisAngle(w.flapAxis, -w.side * a); loc[w.b[0]].multiply(_q1);
        _q1.setFromAxisAngle(w.foldAxis, w.side * Math.sin(this.flapT * 1.6 + 1.2) * 0.12 * this.flapAmp); loc[w.b[0]].multiply(_q1);
        qLocal(0, -w.side * Math.sin(this.flapT * 1.6 - 0.6) * 0.25 * this.flapAmp, 0, _q1); loc[w.b[1]].multiply(_q1);
      }
    }
    for (const w of this.iwings) {
      const buzz = this.flying > 0.1 || P.flap > 0 ? Math.sin(this.time * 55 + w.k) * 0.5 : 0;
      qLocal(0, w.side * (0.08 + 0.35 * Math.max(this.flying, P.flap)) + buzz * w.side * 0.6, 0, loc[w.i]);
    }
    // ---- 骨の計算 ----
    this.fk();
    if (this.restHeadPitch == null && this.iHead >= 0) { _v1.set(0, 1, 0).applyQuaternion(this.J[this.iHead].rq); this.restHeadPitch = Math.atan2(_v1.y, Math.hypot(_v1.x, _v1.z)); }
    // ---- 這う胴（蛇） ----
    if (this.serp) this.updateSerpent(dt, moving);
    // ---- 脚 ----
    if (this.legs.length) this.updateLegs(dt, ph, fallQ != null);
    // ---- 尾・首を地面の上に ----
    for (const c of this.tails) this.clampChain(c, 1.6 * sF);
    if (this.dead && this.fallAng > 0.6) this.clampChain([this.iPelvis, this.iSpine, this.iChest].concat(this.iNeck, [this.iHead]).filter((i) => i >= 0), 2.5 * sF, true);
    for (const T of this.tents) this.clampChain(T.c, 0.8 * sF);
    // ---- 書き込み ----
    const bones = this.b.bones;
    for (let i = 0; i < this.n; i++) { bones[i].position.copy(this.W[i].p); bones[i].quaternion.copy(this.W[i].q); }
    const root = this.b.root;
    root.position.copy(this.pos);
    root.rotation.set(0, this.yaw, 0);
    root.updateMatrixWorld(true);
    // 口と頭の向き（世界座標）
    const hw = this.W[this.iHead];
    this.mouthW.copy(this.mouthL).applyQuaternion(hw.q).add(hw.p).applyMatrix4(root.matrixWorld);
    this.headDirW.set(0, 1, 0).applyQuaternion(hw.q).applyAxisAngle(AY, this.yaw).normalize();
  }
  footOff(L) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const hx = this.pos.x + L.home.x * c + L.home.z * s, hz = this.pos.z - L.home.x * s + L.home.z * c;
    return Math.hypot(L.plant.x - hx, L.plant.z - hz);
  }
  fk() {
    const J = this.J, W = this.W;
    for (let i = 0; i < this.n; i++) {
      const j = J[i], w = W[i];
      if (j.parent < 0) { w.p.copy(this.rootP); w.q.copy(this.rootQ); continue; }
      const pw = W[j.parent];
      w.p.copy(j.lo).applyQuaternion(pw.q).add(pw.p);
      if (this.abs[i]) w.q.copy(this.absQ[i]);
      else w.q.copy(pw.q).multiply(j.lq).multiply(this.loc[i]);
    }
  }
  setAbs(i, q) { this.absQ[i].copy(q); this.abs[i] = 1; }
  // 根元の局所座標 ⇔ 世界
  toLocal(v, out) { return out.copy(v).sub(this.pos).applyAxisAngle(AY, -this.yaw); }
  toWorld(v, out) { return out.copy(v).applyAxisAngle(AY, this.yaw).add(this.pos); }
  jointWorld(i, out) { return this.toWorld(this.W[i].p, out); }
  /* ---------- 脚：足を置く・振る・IK ---------- */
  updateLegs(dt, ph, falling) {
    const G = this.G, sF = this.sF;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const ground = this.groundW * (this.dead ? 1 - seg(this.fallAng, 0.1, 0.6) : 1);
    for (const L of this.legs) {
      // 振り出し中の判定
      if (!this.hop && !this.dead && this.flying < 0.5) {
        const lp = frac(ph + L.off);
        if (lp < G.duty) {
          const u = lp / G.duty;
          if (!L.swing) {
            if (u < 0.5 && (this.speed > 0.15 || this.footOff(L) > 0.1 * this.stride)) { L.swing = true; L.from.copy(L.plant); L.fromYaw = L.yaw; }
          }
          if (L.swing) {
            L.u = u;
            // 着地点の予測
            const cyc = this.speed > 0.15 ? this.stride / this.speed : G.minCycle * Math.sqrt(sF) / 0.7;
            const rem = (1 - u) * G.duty * cyc;
            const yawL = this.yaw + this.yawRate * rem;
            const cl = Math.cos(yawL), sl = Math.sin(yawL);
            const ahead = Math.min(this.speed * cyc * (1 - G.duty) * 0.5, this.stride * 0.6);
            const hx = L.home.x, hz = L.home.z + ahead;
            L.target.set(this.pos.x + this.vel.x * rem + hx * cl + hz * sl, 0, this.pos.z + this.vel.z * rem - hx * sl + hz * cl);
            L.target.y = groundH(L.target.x, L.target.z) + L.footY;
            L.tYaw = yawL;
            const e = ease(u);
            L.plant.lerpVectors(L.from, L.target, e);
            L.lift = Math.sin(Math.PI * Math.pow(u, 0.8)) * G.lift * this.legLen * clamp(L.from.distanceTo(L.target) / (this.stride * 0.5), 0.35, 1);
            L.yaw = L.fromYaw + angDiff(L.fromYaw, L.tYaw) * e;
          }
        } else if (L.swing) {
          L.swing = false; L.lift = 0; L.plant.copy(L.target); L.yaw = L.tYaw;
          this.onEvent('step', { x: L.plant.x, z: L.plant.z, y: L.plant.y - L.footY, r: this.footR, leg: L, force: this.frame === 'multi' ? 0.4 : 1 });
        }
      }
      // 踏みつけ（片足を高く上げて落とす）
      let extraLift = 0;
      if (this.act && this.act.name === 'stomp' && this.act.leg === L) {
        const t = this.act.t;
        extraLift = this.legLen * 0.75 * (seg(t, 0.15, 0.85) * (1 - seg(t, 0.85, 0.98)));
        if (t > 0.98) this.fire('stomp', 'stomp', { x: L.plant.x, z: L.plant.z, y: L.plant.y - L.footY, r: this.footR * 2.6, leg: L, force: 3 });
      }
      // 目標の足首位置（根元の局所座標）
      const tgt = this.toLocal(L.plant, _v1);
      tgt.y += L.lift + extraLift;
      if (ground < 1) {
        // 浮いている・倒れている：体についてくる（だらりと下がる）
        _v2.copy(L.home); _v2.y += this.legLen * 0.25; _v2.z -= this.legLen * 0.15;
        _v2.applyQuaternion(this.rootQ).add(this.rootP);
        tgt.lerp(_v2, 1 - ground);
      }
      const yawLocal = L.yaw - this.yaw;
      _q1.setFromAxisAngle(AY, yawLocal);
      const plantL = _v4.copy(tgt);
      const ank = _v2.copy(L.metaV).applyQuaternion(_q1).add(tgt);
      this.solveLeg(L, ank, _q1, plantL, falling && ground < 1);
    }
    this.fk();
  }
  solveLeg(L, ank, qYaw, plantL, limp) {
    const W = this.W, J = this.J;
    const ball = (this._ball || (this._ball = new THREE.Vector3())).copy(plantL);
    const H = W[L.thigh].p;
    const d = _v3.copy(ank).sub(H);
    let D = d.length();
    const dn = d.divideScalar(D || 1);
    D = clamp(D, Math.abs(L.L1 - L.L2) * 1.05 + 0.01, (L.L1 + L.L2) * 0.995);
    // 膝の向き：体の回転に合わせた元の膝の向き
    const pole = _v5.copy(L.pole).applyQuaternion(qYaw);
    if (limp) pole.applyQuaternion(this.rootQ);
    pole.addScaledVector(dn, -pole.dot(dn));
    if (pole.lengthSq() < 1e-6) pole.set(0, 0, 1);
    pole.normalize();
    const a = (L.L1 * L.L1 - L.L2 * L.L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L.L1 * L.L1 - a * a));
    const K = _v4.copy(H).addScaledVector(dn, a).addScaledVector(pole, h);
    const hinge = new THREE.Vector3().crossVectors(dn, pole).multiplyScalar(L.hsign);
    const A2 = new THREE.Vector3().copy(H).addScaledVector(dn, D);
    this.setAbs(L.thigh, basisQuat(_v1.copy(K).sub(H), hinge, _q2));
    this.setAbs(L.shin, basisQuat(_v1.copy(A2).sub(K), hinge, _q2));
    if (L.meta >= 0) {
      // 中足：足首から母趾球（接地点）へ
      const mx = _v1.copy(L.metaX).applyQuaternion(qYaw);
      const dir = new THREE.Vector3().copy(ball).sub(A2);
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      this.setAbs(L.meta, basisQuat(dir, mx, _q2));
    }
    // 指：地面に沿わせる（振り出し中は少し曲げる）
    _q2.copy(qYaw).multiply(L.toeQ);
    if (L.lift > 0.01) { _q3.setFromAxisAngle(_v1.set(1, 0, 0).applyQuaternion(qYaw), -0.5 * Math.sin(Math.PI * L.u)); _q2.premultiply(_q3); }
    if (limp) _q2.premultiply(this.rootQ);
    if (this.J[L.toe].dir) this.setAbs(L.toe, _q2);
    // 子の位置を更新
    this.fkFrom(L.thigh);
  }
  fkFrom(i0) {
    // i0 の子孫だけ再計算（関節は親より後ろに並ぶ）
    const J = this.J, W = this.W;
    const mark = this._mark || (this._mark = new Uint8Array(this.n));
    mark.fill(0); mark[i0] = 1;
    for (let i = i0; i < this.n; i++) {
      const j = J[i];
      if (i !== i0 && !(j.parent >= 0 && mark[j.parent])) continue;
      mark[i] = 1;
      if (i === i0 && j.parent >= 0) {
        const pw = W[j.parent];
        W[i].p.copy(j.lo).applyQuaternion(pw.q).add(pw.p);
        if (this.abs[i]) W[i].q.copy(this.absQ[i]);
        continue;
      }
      const pw = W[j.parent];
      W[i].p.copy(j.lo).applyQuaternion(pw.q).add(pw.p);
      if (this.abs[i]) W[i].q.copy(this.absQ[i]);
      else W[i].q.copy(pw.q).multiply(j.lq).multiply(this.loc[i]);
    }
  }
  // 鎖を地面より上に（尾・触手・倒れた首）
  clampChain(c, r, hard) {
    const W = this.W, J = this.J;
    let changed = false;
    for (let k = 0; k < c.length - 1; k++) {
      const i = c[k], ch = c[k + 1];
      const pw = W[i];
      const cp = _v1.copy(J[ch].lo).applyQuaternion(pw.q).add(pw.p);
      const wx = this.pos.x + cp.x * Math.cos(this.yaw) + cp.z * Math.sin(this.yaw), wz = this.pos.z - cp.x * Math.sin(this.yaw) + cp.z * Math.cos(this.yaw);
      const gy = groundH(wx, wz) - this.pos.y + r;
      if (cp.y < gy || changed) {
        if (cp.y < gy) {
          const d = _v2.copy(cp).sub(pw.p);
          const L = d.length();
          const want = _v3.copy(d); want.y = Math.min(L * 0.98, Math.max(gy - pw.p.y, -L * 0.98));
          const hz = Math.sqrt(Math.max(1e-6, L * L - want.y * want.y)), hl = Math.hypot(d.x, d.z) || 1;
          want.x = d.x / hl * hz; want.z = d.z / hl * hz;
          _q1.setFromUnitVectors(d.normalize(), want.normalize());
          this.setAbs(i, _q2.copy(_q1).multiply(pw.q));
          pw.q.copy(this.absQ[i]);
          changed = true;
        }
        // 子を親に合わせて更新
        W[ch].p.copy(J[ch].lo).applyQuaternion(pw.q).add(pw.p);
        if (!this.abs[ch]) W[ch].q.copy(pw.q).multiply(J[ch].lq).multiply(this.loc[ch]);
      }
    }
    if (changed) this.fkFrom(c[0]);
  }
  /* ---------- 蛇身：通った跡をたどる ---------- */
  updateSerpent(dt, moving) {
    const sF = this.sF;
    const last = this.trail[0];
    if (!last || Math.hypot(this.pos.x - last.x, this.pos.z - last.z) > 0.8 * sF) {
      this.trailLen += last ? Math.hypot(this.pos.x - last.x, this.pos.z - last.z) : 0;
      this.trail.unshift(new THREE.Vector3(this.pos.x, 0, this.pos.z));
      if (this.trail.length > 400) this.trail.pop();
    }
    const c = this.serp, J = this.J, W = this.W;
    // 道のり上の点
    const atDist = (d, out) => {
      let acc = Math.hypot(this.trail[0].x - this.pos.x, this.trail[0].z - this.pos.z);
      let prev = this.pos;
      if (d <= acc) return out.lerpVectors(prev, this.trail[0], d / Math.max(acc, 1e-6));
      for (let k = 1; k < this.trail.length; k++) {
        const a = this.trail[k - 1], b = this.trail[k];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        if (acc + l >= d) return out.lerpVectors(a, b, (d - acc) / Math.max(l, 1e-6));
        acc += l;
      }
      const t = this.trail[this.trail.length - 1];
      return out.set(t.x, 0, t.z);
    };
    let dist = 0;
    const tgt = new THREE.Vector3();
    for (let k = 2; k < c.length - 1; k++) {
      const i = c[k], ch = c[k + 1];
      dist += J[ch].lo.length() * (k === 2 ? 0.6 : 1);
      atDist(dist, tgt);
      // 横うねり
      const wave = Math.sin(dist / sF * 0.11 - this.trailLen / sF * 0.11) * 2.6 * sF * smoothstep(0, 18 * sF, dist);
      const px = -Math.cos(this.yaw), pz = Math.sin(this.yaw);
      tgt.x += px * wave; tgt.z += pz * wave;
      const r = this.b.A.B.rz * sF * lerp(0.75, 0.25, k / c.length);
      tgt.y = groundH(tgt.x, tgt.z) + r;
      this.toLocal(tgt, tgt);
      const pw = W[i];
      const cur = _v1.copy(J[ch].lo).applyQuaternion(pw.q).normalize();
      const want = _v2.copy(tgt).sub(pw.p).normalize();
      _q1.setFromUnitVectors(cur, want);
      this.setAbs(i, _q2.copy(_q1).multiply(pw.q));
      pw.q.copy(this.absQ[i]);
      W[ch].p.copy(J[ch].lo).applyQuaternion(pw.q).add(pw.p);
      W[ch].q.copy(pw.q).multiply(J[ch].lq).multiply(this.loc[ch]);
    }
    this.fkFrom(c[2]);
  }
  /* ---------- 跳脚：屈む→跳ぶ→着地 ---------- */
  updateHop(dt) {
    const h = this.hop, sF = this.sF;
    h.t += dt;
    h.bob = 0; h.lean = 0;
    this.vel.set(0, 0, 0);
    if (h.st === 'ground') {
      h.wait -= dt;
      if (this.speed > 0.5 && h.wait <= 0 && !this.dead && !(this.act && this.act.name !== 'flinch')) { h.st = 'crouch'; h.t = 0; }
    } else if (h.st === 'crouch') {
      const u = seg(h.t, 0, 0.45);
      h.bob = -this.legLen * 0.2 * ease(u); h.lean = -0.08 * u;
      if (h.t >= 0.45) {
        h.st = 'air'; h.t = 0;
        const dist = clamp(this.speed * 2.4, 8 * sF, 34 * sF);
        h.from.copy(this.pos); h.to.set(this.pos.x + Math.sin(this.yaw) * dist, 0, this.pos.z + Math.cos(this.yaw) * dist);
        h.dur = 0.9 * Math.sqrt(sF) + dist / (60 * sF); h.h = dist * 0.32;
        this.onEvent('hopOff', { x: this.pos.x, z: this.pos.z });
      }
    } else if (h.st === 'air') {
      const u = clamp(h.t / h.dur, 0, 1);
      this.pos.x = lerp(h.from.x, h.to.x, u); this.pos.z = lerp(h.from.z, h.to.z, u);
      this.vel.set((h.to.x - h.from.x) / h.dur, 0, (h.to.z - h.from.z) / h.dur);
      this.air = 4 * h.h * u * (1 - u);
      h.lean = lerp(0.25, -0.3, u);
      this.groundW = 1 - bump(u, 0.02, 0.15, 0.8, 0.97);
      // 空中では足を体の下へ
      if (u > 0.5) {
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        for (const L of this.legs) {
          const tx = h.to.x + L.home.x * c + L.home.z * s, tz = h.to.z - L.home.x * s + L.home.z * c;
          L.plant.set(tx, groundH(tx, tz) + L.footY, tz); L.yaw = this.yaw;
        }
      }
      if (u >= 1) {
        h.st = 'land'; h.t = 0; this.air = 0; this.groundW = 1;
        this.onEvent('land', { x: this.pos.x, z: this.pos.z, r: 15 * sF, force: 2.2 });
      }
    } else if (h.st === 'land') {
      const u = seg(h.t, 0, 0.5);
      h.bob = -this.legLen * 0.24 * Math.sin(Math.PI * u) ; h.lean = 0.06 * Math.sin(Math.PI * u);
      if (h.t >= 0.5) { h.st = 'ground'; h.t = 0; h.wait = 0.25; }
    }
  }
  /* ---------- 飛翔：舞い上がり→滑空→急降下 ---------- */
  updateFly(dt, act) {
    const t = act.t, d = act.dur, sF = this.sF;
    const up = seg(t, 0.4, 1.6), down = seg(t, d - 1.3, d - 0.2);
    const H = 34 * sF;
    this.flying = Math.min(1, seg(t, 0.1, 0.6)) * (1 - seg(t, d - 0.25, d));
    this.air = H * ease(up) * (1 - Math.pow(down, 2));
    this.groundW = 1 - this.flying;
    // 目標へ水平移動
    const u = seg(t, 1.0, d - 0.2);
    const k = ease(u);
    this.pos.x = lerp(act.start.x, act.to.x, k); this.pos.z = lerp(act.start.z, act.to.z, k);
    this.wantYaw = Math.atan2(act.to.x - act.start.x, act.to.z - act.start.z);
    for (const L of this.legs) { L.plant.copy(this.pos); L.plant.y = groundH(this.pos.x, this.pos.z) + L.footY; L.swing = false; }
    if (t >= d - 0.22) {
      this.fire('slam', 'land', { x: this.pos.x, z: this.pos.z, r: 22 * sF, force: 3 });
      // 着地した足を体の下に置き直す
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      for (const L of this.legs) { const tx = this.pos.x + L.home.x * c + L.home.z * s, tz = this.pos.z - L.home.x * s + L.home.z * c; L.plant.set(tx, groundH(tx, tz) + L.footY, tz); L.yaw = this.yaw; }
    }
  }
  /* ---------- 行動ごとの姿勢 ---------- */
  actionPose(a, P, dt) {
    const t = a.t, sF = this.sF;
    const at = this.A.armType;
    switch (a.name) {
      case 'roar': {
        const w = bump(t, 0.1, 0.6, 2.0, 2.6);
        P.nP += 0.55 * w; P.jaw = Math.max(P.jaw, w * (1 + 0.08 * Math.sin(t * 40)));
        P.chestP -= 0.18 * w; P.wingOpen = w; P.flap = 0.25 * w;
        P.armR = [0.5 * w, 0.5 * w, -0.3 * w]; P.armL = [0.5 * w, 0.5 * w, -0.3 * w];
        P.tailP = 0.3 * w;
        if (t > 0.6) this.fire('roar', 'roar', { x: this.pos.x, z: this.pos.z });
        break;
      }
      case 'swipe': {
        const s = a.side;
        const wind = seg(t, 0, 0.55), strike = seg(t, 0.55, 0.75), rec = seg(t, 0.85, 1.5);
        const raise = (1.35 * ease(wind) - 1.9 * ease(strike)) * (1 - ease(rec));
        const arm = s < 0 ? P.armR : P.armL;
        arm[0] = raise; arm[1] = 0.35 * ease(wind) * (1 - strike); arm[2] = -0.6 * ease(wind) * (1 - strike) * (1 - rec); arm[3] = 0.6 * ease(wind) * (1 - strike);
        P.chestY = s * (0.35 * ease(wind) - 0.6 * ease(strike)) * (1 - ease(rec));
        P.chestP = -0.1 * ease(wind) + 0.2 * ease(strike) * (1 - rec);
        P.lookW = 1;
        if (this.tents.length) { arm[0] = raise * 0.8; }
        if (t > 0.66) this.fire('hit', 'hit', { kind: 'swipe', side: s, ...this.handHit(s) });
        break;
      }
      case 'bite': {
        const wind = seg(t, 0, 0.45), strike = seg(t, 0.45, 0.6), rec = seg(t, 0.7, 1.3);
        P.nP += (0.3 * ease(wind) - 0.75 * ease(strike)) * (1 - ease(rec));
        P.jaw = Math.max(P.jaw, ease(wind) * (1 - strike) * 1.0);
        P.chestP = 0.25 * ease(strike) * (1 - rec);
        P.lookW = 1;
        if (t > 0.58) this.fire('hit', 'hit', { kind: 'bite', x: this.mouthW.x, y: this.mouthW.y, z: this.mouthW.z, r: 9 * sF });
        break;
      }
      case 'tailswipe': {
        const s = a.data.side || 1;
        const wind = seg(t, 0, 0.6), strike = seg(t, 0.6, 1.0), rec = seg(t, 1.1, 1.9);
        const k = (ease(wind) - 2 * ease(strike) + ease(rec));
        P.tailY = s * 1.2 * k; P.chestY = -s * 0.35 * k; P.tailP = 0.25 * bump(t, 0.4, 0.7, 1.0, 1.4);
        if (t > 0.85) this.fire('hit', 'hit', { kind: 'tail', ...this.tailHit() });
        break;
      }
      case 'stomp': {
        P.chestP = 0.1 * bump(t, 0.2, 0.8, 1.0, 1.5); P.nP -= 0.15 * bump(t, 0.6, 0.9, 1.1, 1.5);
        P.armR = [0.3 * bump(t, 0.1, 0.6, 0.9, 1.4), 0.4, 0]; P.armL = [0.3 * bump(t, 0.1, 0.6, 0.9, 1.4), 0.4, 0];
        break;
      }
      case 'cast': {
        // 吐息・光線・弾・招雷：狙う→溜める→放つ
        const charge = a.data.charge || 1.0;
        const w = bump(t, 0, 0.4, a.dur - 0.4, a.dur);
        P.lookW = 1;
        const em = t > charge && t < a.dur - 0.35;
        a.emitting = em;
        this.b.uni.uCharge.value = seg(t, 0, charge) * (1 - seg(t, a.dur - 0.5, a.dur));
        P.jaw = Math.max(P.jaw, w * (em ? 0.95 + 0.05 * Math.sin(t * 30) : 0.45));
        P.chestP = -0.08 * w; P.wingOpen = 0.6 * w;
        P.armR = [0.25 * w, 0.4 * w, -0.2 * w]; P.armL = [0.25 * w, 0.4 * w, -0.2 * w];
        if (a.data.up) P.nP += 0.6 * w;
        if (t >= a.dur - 0.05) this.b.uni.uCharge.value = 0;
        break;
      }
      case 'charge': {
        const w = bump(t, 0, 0.5, a.dur - 0.5, a.dur);
        P.nP -= 0.45 * w; P.chestP = 0.2 * w; P.lookW = 0;
        P.armR = [-0.3 * w, 0.2 * w, 0]; P.armL = [-0.3 * w, 0.2 * w, 0];
        a.active = t > 0.6 && t < a.dur - 0.4;
        break;
      }
      case 'fly': {
        P.flap = 1; P.wingOpen = 1;
        P.nP -= 0.2 * this.flying;
        break;
      }
      case 'flinch': {
        const w = bump(t, 0, 0.1, 0.25, 0.6);
        P.nP += 0.3 * w; P.jaw = Math.max(P.jaw, 0.6 * w); P.chestP = -0.15 * w;
        break;
      }
    }
  }
  handHit(s) {
    const a = this.arms.find((x) => x.side === s) || this.arms[0];
    const sF = this.sF;
    if (a) { this.jointWorld(a.ha, _v1); return { x: _v1.x, y: _v1.y, z: _v1.z, r: 12 * sF }; }
    const T = this.tents.find((x) => x.side === s) || this.tents[0];
    if (T) { this.jointWorld(T.c[T.c.length - 1], _v1); return { x: _v1.x, y: _v1.y, z: _v1.z, r: 14 * sF }; }
    return { x: this.mouthW.x, y: this.mouthW.y, z: this.mouthW.z, r: 10 * sF };
  }
  tailHit() {
    const c = this.tails[0];
    if (!c) return { x: this.pos.x, y: this.pos.y, z: this.pos.z, r: 10 };
    this.jointWorld(c[Math.floor(c.length * 0.75)], _v1);
    return { x: _v1.x, y: _v1.y, z: _v1.z, r: 16 * this.sF };
  }
  // 足などの当たり（世界座標）を列挙
  feetWorld() { return this.legs.map((L) => ({ x: L.plant.x, z: L.plant.z, y: L.plant.y, swing: L.swing })); }
}
