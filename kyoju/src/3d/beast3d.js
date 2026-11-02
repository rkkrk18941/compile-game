// 3D巨獣：6部位の形を符号付き距離関数で滑らかに融合し、一枚の皮膚メッシュにして骨に乗せる。
import * as THREE from 'three';
import { GLSL_NOISE, mulberry32, clamp, lerp, vnoise } from './noise.js';

/* ---------- ベクトル ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const P = (...vs) => { let r = [0, 0, 0]; for (let i = 0; i < vs.length; i += 2) r = madd(r, vs[i], vs[i + 1]); return r; };
const rotAxis = (v, ax, ang) => { const c = Math.cos(ang), s = Math.sin(ang); const d = dot(ax, v); const cr = cross(ax, v); return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };

const SPECIES_SKIN = { varga: 0, ganzo: 1, dromea: 2, gorai: 3, krava: 4, mordra: 5, zagiri: 1, dogram: 3, galdon: 6, ragna: 7, nidhog: 0 };
const SLOT_ID = { head: 0, body: 1, arms: 2, legs: 3, tail: 4, back: 5 };

/* ---------- 骨格 ---------- */
class Rig {
  constructor() { this.j = []; this.map = {}; }
  add(name, parent, pos, dir, ref) {
    const id = this.j.length;
    this.j.push({ name, id, parent: parent == null ? -1 : this.map[parent], pos: pos.slice(), dir: dir ? nrm(dir) : null, ref: ref || [0, 1, 0] });
    this.map[name] = id;
    return name;
  }
  has(n) { return this.map[n] != null; }
  P(n) { return this.j[this.map[n]].pos; }
  finalize() {
    const m = new THREE.Matrix4();
    for (const J of this.j) {
      if (J.dir) {
        let Y = J.dir, X = cross(Y, J.ref);
        if (len(X) < 1e-3) X = cross(Y, [0, 0, 1]);
        X = nrm(X); const Z = nrm(cross(X, Y));
        m.makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z));
        J.rq = new THREE.Quaternion().setFromRotationMatrix(m);
      } else J.rq = J.parent >= 0 ? this.j[J.parent].rq.clone() : new THREE.Quaternion();
      J.rp = new THREE.Vector3(...J.pos);
      if (J.parent >= 0) {
        const p = this.j[J.parent];
        const inv = p.rq.clone().invert();
        J.lo = J.rp.clone().sub(p.rp).applyQuaternion(inv);
        J.lq = inv.multiply(J.rq.clone());
      } else { J.lo = J.rp.clone(); J.lq = J.rq.clone(); }
    }
  }
}

/* ---------- 形（SDF プリミティブ） ---------- */
function mkRC(a, b, r1, r2) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const ax = a[0], ay = a[1], az = a[2], bx = ba[0], by = ba[1], bz = ba[2];
  const f = (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
  const c = mul(add(a, b), 0.5);
  return { f, c, R: len(ba) / 2 + Math.max(r1, r2), r: Math.max(r1, r2) };
}
function mkEL(c, r, U, V, W) {
  // r = [ru, rv, rw]（U=長軸, V=上, W=横）
  const [ra, rb, rc] = r;
  const f = (x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const a = (px * U[0] + py * U[1] + pz * U[2]), b = (px * V[0] + py * V[1] + pz * V[2]), d = (px * W[0] + py * W[1] + pz * W[2]);
    const k0 = Math.sqrt((a / ra) ** 2 + (b / rb) ** 2 + (d / rc) ** 2);
    const k1 = Math.sqrt((a / (ra * ra)) ** 2 + (b / (rb * rb)) ** 2 + (d / (rc * rc)) ** 2);
    return k1 < 1e-9 ? -Math.min(ra, rb, rc) : (k0 * (k0 - 1)) / k1;
  };
  return { f, c, R: Math.max(ra, rb, rc), r: Math.min(ra, rb, rc) };
}
function mkSP(c, r) { const f = (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r; return { f, c, R: r, r }; }

/* ---------- 解剖：部位ごとの形 ---------- */
const FRAME = {
  biped: { hipY: 19, pitch: 0.62, neckPitch: 1.0, armMode: 'hang' },
  quad: { hipY: 16, pitch: 0.05, neckPitch: 0.55, armMode: 'raise' },
  multi: { hipY: 13, pitch: 0.02, neckPitch: 0.35, armMode: 'raise' },
  serpent: { hipY: 11.5, pitch: 1.0, neckPitch: 0.35, armMode: 'hang' },
  hop: { hipY: 9, pitch: 0.42, neckPitch: 0.55, armMode: 'ground' },
};
const BODY = {
  scale: { rx: 15, ry: 11, rz: 9.2 }, carapace: { rx: 16, ry: 9.4, rz: 10.5 }, bloat: { rx: 16, ry: 13, rz: 12.4 },
  muscle: { rx: 14, ry: 12, rz: 10.5 }, bone: { rx: 14, ry: 11, rz: 9 }, rock: { rx: 17, ry: 12, rz: 10.5 },
};
const NECKLEN = { dragon: 11, insect: 3, frog: 1, ape: 3, octo: 2.5, skull: 6, bird: 9, horn: 4 };

export function buildAnatomy(desc) {
  const R = new Rig();
  const prims = [];
  const details = [];
  const parts = desc.parts;
  const legs = parts.legs.arch, F = FRAME[legs];
  const B = BODY[parts.body.arch];
  const rng = mulberry32(((desc.seed || 1) * 1e6) | 0);
  const skinOf = (slot) => SPECIES_SKIN[parts[slot].sp] ?? 0;
  const add3 = (o, j, slot, extra) => { o.j = j; o.slot = SLOT_ID[slot]; o.skin = extra && extra.skin != null ? extra.skin : skinOf(slot); o.k = extra && extra.k != null ? extra.k : 2.2; o.shade = (extra && extra.shade) || 0; o.emis = (extra && extra.emis) || null; o.sub = !!(extra && extra.sub); prims.push(o); return o; };
  const rc = (j, slot, a, b, r1, r2, e) => add3(mkRC(a, b, r1, r2), j, slot, e);
  const el = (j, slot, c, r, U, V, W, e) => add3(mkEL(c, r, U, V, W), j, slot, e);
  const sp = (j, slot, c, r, e) => add3(mkSP(c, r), j, slot, e);
  const det = (j, slot, kind, data) => details.push(Object.assign({ j, slot: SLOT_ID[slot], kind }, data));

  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const u = [0, Math.sin(F.pitch), Math.cos(F.pitch)], v = [0, Math.cos(F.pitch), -Math.sin(F.pitch)];
  const hip = [0, F.hipY, 0];
  const C = P(hip, 1, u, B.rx * 0.42, v, B.ry * 0.22);
  const Ch = madd(C, u, B.rx * 0.52);
  const Nb = P(C, 1, u, B.rx * 0.86, v, B.ry * 0.3);
  const Tb = P(C, 1, u, -B.rx * 0.8, v, B.ry * 0.02);
  R.add('root', null, [0, 0, 0], null);
  R.add('pelvis', 'root', hip, u, Y);
  R.add('spine', 'pelvis', C, u, Y);
  R.add('chest', 'spine', Ch, u, Y);

  /* --- 胴 --- */
  const bt = parts.body.arch;
  const bodyEl = (j, c, r, e) => el(j, 'body', c, r, u, v, X, e);
  if (bt === 'bone') {
    rc('pelvis', 'body', madd(hip, u, -2), Ch, 1.8, 1.6, { k: 1.2 });
    el('spine', 'body', C, [B.rx * 0.55, B.ry * 0.55, B.rz * 0.55], u, v, X, { skin: 4, emis: [0.5, 0.2, 1.0], k: 1.0, shade: 2 });
    for (let i = 0; i < 7; i++) {
      const t = -0.55 + i * 0.19;
      const c0 = P(C, 1, u, B.rx * t, v, B.ry * 0.85);
      for (const s of [-1, 1]) {
        let prev = c0;
        for (let k = 1; k <= 4; k++) {
          const a = (k / 4) * Math.PI * 0.95;
          const p = P(C, 1, u, B.rx * t + Math.sin(a) * 0.6, v, Math.cos(a) * B.ry * 0.85, X, s * Math.sin(a) * B.rz * 0.9);
          rc(t < 0 ? 'spine' : 'chest', 'body', prev, p, 0.9, 0.8, { k: 0.35 });
          prev = p;
        }
      }
    }
    rc('chest', 'body', P(C, 1, u, -B.rx * 0.3, v, -B.ry * 0.75), P(C, 1, u, B.rx * 0.5, v, -B.ry * 0.7), 1.2, 1.0, { k: 0.6 });
    el('pelvis', 'body', madd(hip, v, 1.0), [3.2, 2.6, B.rz * 0.6], u, v, X, { k: 1.0 });
  } else {
    const fl = bt === 'carapace' ? 0.86 : 1;
    bodyEl('pelvis', madd(C, u, -B.rx * 0.42), [B.rx * 0.55, B.ry * 0.82 * fl, B.rz * 0.88], { k: 4 });
    bodyEl('spine', C, [B.rx * 0.58, B.ry * fl, B.rz], { k: 4 });
    bodyEl('chest', madd(C, u, B.rx * 0.46), [B.rx * 0.5, B.ry * 0.92 * fl, B.rz * (bt === 'muscle' ? 1.08 : 0.94)], { k: 4 });
    bodyEl('spine', madd(C, v, -B.ry * 0.28), [B.rx * 0.62, B.ry * 0.62, B.rz * 0.86], { k: 4, shade: 1 });
    if (bt === 'muscle') {
      for (const s of [-1, 1]) el('chest', 'body', P(Ch, 1, u, B.rx * 0.18, v, -B.ry * 0.15, X, s * B.rz * 0.45), [B.rx * 0.28, B.ry * 0.42, B.rz * 0.42], u, v, X, { k: 2 });
      bodyEl('chest', P(C, 1, v, B.ry * 0.62, u, B.rx * 0.15), [B.rx * 0.48, B.ry * 0.38, B.rz * 0.72], { k: 3 });
    }
    if (bt === 'bloat') bodyEl('spine', madd(C, v, -B.ry * 0.1), [B.rx * 0.9, B.ry * 1.02, B.rz * 1.02], { k: 5 });
    if (bt === 'carapace') {
      for (let i = 0; i < 4; i++) {
        const t = -0.6 + i * 0.4;
        bodyEl(i < 2 ? 'spine' : 'chest', P(C, 1, u, B.rx * t, v, B.ry * 0.5), [B.rx * 0.3, B.ry * 0.42, B.rz * 0.95], { k: 0.7 });
      }
    }
    if (bt === 'rock') {
      for (let i = 0; i < 16; i++) {
        const t = -0.8 + rng() * 1.5, a = (rng() - 0.5) * 2.4;
        const p = P(C, 1, u, B.rx * t * 0.95, v, Math.cos(a) * B.ry * 0.88, X, Math.sin(a) * B.rz * 0.9);
        sp(t < -0.2 ? 'pelvis' : t < 0.3 ? 'spine' : 'chest', 'body', p, 1.8 + rng() * 2.6, { k: 1.4 });
      }
    }
  }

  /* --- 首と頭 --- */
  const ht = parts.head.arch;
  const nLen = NECKLEN[ht];
  const na = F.neckPitch;
  const nd = [0, Math.sin(na), Math.cos(na)];
  let prevN = 'chest';
  const nSeg = 3;
  let np = Nb;
  for (let i = 0; i < nSeg; i++) {
    const d = rotAxis(nd, X, -(i - 1) * 0.12);
    const q = madd(np, d, nLen / nSeg);
    R.add('neck' + i, prevN, np, d, Y);
    prevN = 'neck' + i; np = q;
  }
  const hp = -0.1 - (legs === 'biped' ? 0.05 : 0);
  const f = [0, Math.sin(hp), Math.cos(hp)], hv = [0, Math.cos(hp), -Math.sin(hp)];
  const H = np;
  R.add('head', prevN, H, f, Y);
  const neckR0 = Math.min(B.rz * 0.55, B.ry * 0.5), neckR1 = { dragon: 2.9, insect: 3.2, frog: 4, ape: 3.6, octo: 3.4, skull: 2.6, bird: 2.5, horn: 3.8 }[ht];
  for (let i = 0; i < nSeg; i++) {
    const a = R.P('neck' + i), b = i < nSeg - 1 ? R.P('neck' + (i + 1)) : H;
    rc('neck' + i, 'head', a, b, lerp(neckR0, neckR1, i / nSeg), lerp(neckR0, neckR1, (i + 1) / nSeg), { k: 2.5 });
  }
  const side = X;
  const jawOpen = 0.14;
  const hdRig = (hinge, jlen) => {
    const jd = rotAxis(f, X, jawOpen);
    R.add('jaw', 'head', hinge, jd, Y);
    return jd;
  };
  const eyes = (pos, r, s2) => { for (const s of [-1, 1]) { const p = madd(pos, side, s * s2); sp('head', 'head', p, r * 1.05, { sub: true, k: 0.35 }); det('head', 'head', 'eye', { p, r }); } };
  if (ht === 'dragon') {
    el('head', 'head', P(H, 1, f, 2, hv, 0.8), [4.4, 3.3, 3.4], f, hv, side, { k: 1.8 });
    rc('head', 'head', P(H, 1, f, 4.2, hv, 0.6), P(H, 1, f, 14.5, hv, 0.1), 2.7, 1.35, { k: 1.6 });
    for (const s of [-1, 1]) {
      sp('head', 'head', P(H, 1, f, 6.2, hv, 2.0, side, s * 1.9), 1.25, { k: 1.0 });
      el('head', 'head', P(H, 1, f, 1.0, hv, -1.0, side, s * 2.6), [2.8, 2.1, 1.5], f, hv, side, { k: 1.6 });
      sp('head', 'head', P(H, 1, f, 14.0, hv, 0.9, side, s * 0.75), 0.55, { sub: true, k: 0.25 });
    }
    const jd = hdRig(P(H, 1, f, 0.6, hv, -1.6), 13);
    const J = R.P('jaw');
    rc('jaw', 'head', J, madd(J, jd, 13.2), 1.9, 0.9, { k: 0.5 });
    el('jaw', 'head', madd(J, jd, 2), [3, 1.5, 2.3], jd, hv, side, { k: 1.2 });
    el('head', 'head', P(H, 1, f, 9, hv, -1.1), [7.2, 0.5, 2.0], f, hv, side, { sub: true, k: 0.3 });
    eyes(P(H, 1, f, 6.6, hv, 1.35), 0.75, 2.3);
    for (const s of [-1, 1]) {
      det('head', 'head', 'horn', { p: P(H, 1, f, -0.6, hv, 2.4, side, s * 1.8), d: nrm(P(f, -1, hv, 0.55, side, s * 0.35)), L: 10, r: 1.15, bend: [0, -0.06, 0], bendAx: side, mat: 'horn' });
      det('head', 'head', 'horn', { p: P(H, 1, f, 1.8, hv, 2.6, side, s * 1.4), d: nrm(P(f, -1, hv, 0.8, side, s * 0.5)), L: 4.6, r: 0.6, bendAx: side, bendAmt: -0.08, mat: 'horn' });
      for (let i = 0; i < 6; i++) {
        det('head', 'head', 'tooth', { p: P(H, 1, f, 5 + i * 1.6, hv, -1.25, side, s * (1.45 - i * 0.12)), d: nrm(P(hv, -1, f, 0.15)), L: 1.1 - i * 0.05, r: 0.28 });
        det('jaw', 'head', 'tooth', { p: P(J, 1, jd, 4 + i * 1.5, hv, 0.9, side, s * (1.2 - i * 0.1)), d: nrm(P(hv, 1, f, 0.1)), L: 0.9, r: 0.24 });
      }
    }
  } else if (ht === 'insect') {
    el('head', 'head', P(H, 1, f, 3.2), [4.2, 3.6, 3.8], f, hv, side, { k: 1.4 });
    el('head', 'head', P(H, 1, f, 6.2, hv, -1.0), [2.0, 2.2, 2.4], f, hv, side, { k: 1.0 });
    hdRig(P(H, 1, f, 6.5, hv, -1.5), 4);
    for (const s of [-1, 1]) {
      const ep = P(H, 1, f, 4.8, hv, 1.3, side, s * 2.9);
      det('head', 'head', 'eye', { p: ep, r: 2.0, compound: true });
      det('jaw', 'head', 'horn', { p: P(H, 1, f, 7.4, hv, -1.6, side, s * 1.3), d: nrm(P(f, 1, side, -s * 0.25, hv, -0.2)), L: 5.4, r: 0.7, bendAx: hv, bendAmt: s * 0.16, mat: 'chitin' });
      det('head', 'head', 'horn', { p: P(H, 1, f, 5.4, hv, 3.0, side, s * 1.0), d: nrm(P(f, 0.5, hv, 1, side, s * 0.4)), L: 11, r: 0.22, bendAx: side, bendAmt: s * -0.05, mat: 'chitin' });
    }
  } else if (ht === 'frog') {
    el('head', 'head', P(H, 1, f, 5), [7.2, 3.2, 6.2], f, hv, side, { k: 2.2 });
    const jd = hdRig(P(H, 1, f, -0.5, hv, -0.8), 12);
    const J = R.P('jaw');
    el('jaw', 'head', madd(J, jd, 6), [6.6, 1.6, 5.6], jd, hv, side, { k: 0.6 });
    sp('jaw', 'head', P(J, 1, jd, 4.5, hv, -1.8), 2.6, { k: 1.4, shade: 1, emis: [0, 0, 0] });
    el('head', 'head', P(H, 1, f, 6, hv, -0.6), [6.6, 0.45, 5.2], f, hv, side, { sub: true, k: 0.3 });
    for (const s of [-1, 1]) sp('head', 'head', P(H, 1, f, 4.8, hv, 2.8, side, s * 3.2), 2.1, { k: 1.2 });
    eyes(P(H, 1, f, 5.6, hv, 3.4), 1.5, 3.25);
  } else if (ht === 'ape') {
    el('head', 'head', P(H, 1, f, 1.5, hv, 1.2), [4.2, 4.2, 4.0], f, hv, side, { k: 1.6 });
    el('head', 'head', P(H, 1, f, 5.4, hv, -0.6), [3.2, 2.6, 3.1], f, hv, side, { k: 1.6, skin: 4, shade: 3 });
    rc('head', 'head', P(H, 1, f, 3.9, hv, 2.4, side, -2.6), P(H, 1, f, 3.9, hv, 2.4, side, 2.6), 1.1, 1.1, { k: 0.9 });
    rc('head', 'head', P(H, 1, f, -1.5, hv, 4.8), P(H, 1, f, 2.5, hv, 5.0), 1.0, 0.6, { k: 1.2 });
    const jd = hdRig(P(H, 1, f, 1.2, hv, -1.6), 7);
    const J = R.P('jaw');
    rc('jaw', 'head', J, madd(J, jd, 6.8), 2.1, 1.6, { k: 0.5, skin: 4, shade: 3 });
    el('head', 'head', P(H, 1, f, 5.6, hv, -1.9), [3.0, 0.4, 2.4], f, hv, side, { sub: true, k: 0.3 });
    eyes(P(H, 1, f, 4.6, hv, 1.4), 0.6, 1.5);
    for (const s of [-1, 1]) {
      det('head', 'head', 'tooth', { p: P(H, 1, f, 6.3, hv, -1.6, side, s * 1.3), d: nrm(P(hv, -1)), L: 1.8, r: 0.45 });
      det('jaw', 'head', 'tooth', { p: P(J, 1, jd, 5.2, hv, 0.6, side, s * 1.2), d: nrm(P(hv, 1)), L: 1.2, r: 0.35 });
    }
  } else if (ht === 'octo') {
    el('head', 'head', P(H, 1, f, -2.5, hv, 7), [7, 11, 7.5], rotAxis(f, X, -0.5), rotAxis(hv, X, -0.5), side, { k: 3 });
    el('head', 'head', P(H, 1, f, 3.2), [4.6, 4.0, 4.4], f, hv, side, { k: 2 });
    hdRig(P(H, 1, f, 4.5, hv, -1.5), 3);
    sp('jaw', 'head', P(R.P('jaw'), 1, f, 2.2), 1.6, { k: 0.8, shade: 2 });
    eyes(P(H, 1, f, 5.4, hv, 1.0), 1.2, 2.6);
    for (const s of [-1, 1]) det('head', 'head', 'eye', { p: P(H, 1, f, 3.4, hv, 2.6, side, s * 3.2), r: 0.8 });
  } else if (ht === 'skull') {
    sp('head', 'head', P(H, 1, f, 1.6, hv, 1.6), 5.0, { k: 1.4 });
    rc('head', 'head', P(H, 1, f, 3.5, hv, 0.2), P(H, 1, f, 9.6, hv, -0.6), 3.8, 2.6, { k: 1.4 });
    const jd = hdRig(P(H, 1, f, 1.5, hv, -2.8), 9);
    const J = R.P('jaw');
    rc('jaw', 'head', J, madd(J, jd, 8.6), 2.0, 1.6, { k: 0.4 });
    for (const s of [-1, 1]) sp('head', 'head', P(H, 1, f, 6.6, hv, 1.4, side, s * 2.0), 1.75, { sub: true, k: 0.4 });
    sp('head', 'head', P(H, 1, f, 9.6, hv, -0.2), 1.0, { sub: true, k: 0.3 });
    for (const s of [-1, 1]) det('head', 'head', 'eye', { p: P(H, 1, f, 5.8, hv, 1.4, side, s * 2.0), r: 0.7 });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      det('head', 'head', 'tooth', { p: P(H, 1, f, 5.2 + i * 0.85, hv, -2.3, side, s * (2.1 - i * 0.15)), d: nrm(P(hv, -1)), L: 1.0, r: 0.38 });
      det('jaw', 'head', 'tooth', { p: P(J, 1, jd, 4.0 + i * 0.8, hv, 1.3, side, s * (1.8 - i * 0.12)), d: nrm(P(hv, 1)), L: 0.9, r: 0.34 });
    }
    for (const s of [-1, 1]) det('head', 'head', 'horn', { p: P(H, 1, f, -0.5, hv, 3.8, side, s * 3.2), d: nrm(P(side, s, hv, 0.6, f, -0.7)), L: 13, r: 1.6, bendAx: f, bendAmt: s * 0.36, mat: 'bone' });
  } else if (ht === 'bird') {
    sp('head', 'head', P(H, 1, f, 1.5, hv, 0.8), 4.2, { k: 1.5 });
    hdRig(P(H, 1, f, 3.8, hv, -0.8), 8);
    eyes(P(H, 1, f, 3.6, hv, 1.6), 0.85, 2.7);
    det('head', 'head', 'beak', { p: P(H, 1, f, 4.6, hv, 0.6), d: f, L: 11, r: 2.4, up: hv, mat: 'horn' });
    det('jaw', 'head', 'beak', { p: P(H, 1, f, 4.6, hv, -0.9), d: rotAxis(f, X, 0.1), L: 8.5, r: 1.6, up: mul(hv, -1), mat: 'horn', lower: true });
    for (let i = 0; i < 6; i++) det('head', 'head', 'horn', { p: P(H, 1, f, -0.5 - i * 0.6, hv, 3.4 - i * 0.2, side, (i - 2.5) * 0.4), d: nrm(P(f, -1, hv, 0.9 - i * 0.12)), L: 6 - i * 0.5, r: 0.55, flat: true, mat: 'feather' });
  } else if (ht === 'horn') {
    el('head', 'head', P(H, 1, f, 4, hv, 0.4), [6.4, 4.4, 4.6], f, hv, side, { k: 1.8 });
    el('head', 'head', P(H, 1, f, -1.5, hv, 3.2), [1.8, 6.5, 7.8], f, hv, side, { k: 1.4, skin: 5 });
    const jd = hdRig(P(H, 1, f, 2, hv, -2.4), 9);
    const J = R.P('jaw');
    rc('jaw', 'head', J, madd(J, jd, 9), 2.4, 1.2, { k: 0.5 });
    eyes(P(H, 1, f, 5.4, hv, 1.6), 0.7, 3.2);
    det('head', 'head', 'horn', { p: P(H, 1, f, 9, hv, 2.4), d: nrm(P(f, 1, hv, 0.65)), L: 12, r: 2.0, bendAx: X, bendAmt: -0.09, mat: 'horn' });
    for (const s of [-1, 1]) det('head', 'head', 'horn', { p: P(H, 1, f, 3.5, hv, 3.6, side, s * 2.6), d: nrm(P(f, 1, hv, 0.7, side, s * 0.3)), L: 8, r: 1.2, bendAx: X, bendAmt: -0.06, mat: 'horn' });
  }

  const MOUTH = { dragon: [13, -0.8], insect: [7.5, -1.4], frog: [9, -0.6], ape: [6.5, -1.6], octo: [6, -1.5], skull: [9, -1.8], bird: [13, -0.2], horn: [10, -1.8] };
  const mouth = P(H, 1, f, MOUTH[ht][0], hv, MOUTH[ht][1]);

  /* --- 尾 --- */
  const tt = parts.tail.arch;
  const tailBase = legs === 'serpent' ? null : Tb;
  const tailChain = (base, dir0, n, segL, r0, r1, bendFn, prefix, slot = 'tail', parent = 'pelvis', e) => {
    let p = base, d = dir0, prev = parent;
    const names = [];
    for (let i = 0; i < n; i++) {
      d = nrm(bendFn(d, i));
      const q = madd(p, d, segL);
      const nm = prefix + i;
      R.add(nm, prev, p, d, Y);
      rc(nm, slot, p, q, lerp(r0, r1, i / n), lerp(r0, r1, (i + 1) / n), e || { k: 1.8 });
      names.push({ nm, p, q, d, r: lerp(r0, r1, i / n) });
      p = q; prev = nm;
    }
    R.add(prefix + 'end', prev, p, null);
    return names;
  };

  /* --- 脚 --- */
  const footJoints = [];
  const rearDir = mul(u, -1);
  if (legs === 'biped' || legs === 'hop') {
    const hop = legs === 'hop';
    for (const s of [-1, 1]) {
      const pre = s < 0 ? 'R' : 'L';
      const Hh = P(hip, 1, X, s * B.rz * 0.66, v, -1.0);
      let K, A, Bb, T;
      if (!hop) {
        K = P(Hh, 1, Y, -9.4, Z, 4.6, X, s * 0.6);
        A = P(K, 1, Y, -8.0, Z, -4.4);
        Bb = [A[0], 1.4, A[2] + 2.0];
        T = [Bb[0], 0.6, Bb[2] + 4.4];
      } else {
        K = P(Hh, 1, Y, -3.2, Z, 6.6, X, s * 3.6);
        A = P(K, 1, Y, -4.5, Z, -7.4, X, s * 0.6);
        Bb = [A[0], 1.0, A[2] + 1.0];
        T = [Bb[0] + s * 0.6, 0.5, Bb[2] + 7.5];
      }
      R.add(pre + 'thigh', 'pelvis', Hh, sub(K, Hh), Z);
      R.add(pre + 'shin', pre + 'thigh', K, sub(A, K), Z);
      R.add(pre + 'meta', pre + 'shin', A, sub(Bb, A), Z);
      R.add(pre + 'toe', pre + 'meta', Bb, sub(T, Bb), Y);
      R.add(pre + 'toeEnd', pre + 'toe', T, null);
      footJoints.push({ pre, hip: pre + 'thigh', knee: pre + 'shin', ankle: pre + 'meta', ball: pre + 'toe', side: s, kind: legs, L1: len(sub(K, Hh)), L2: len(sub(A, K)), metaV: sub(A, Bb), rest: Bb.slice(), toeV: sub(T, Bb) });
      const big = hop ? 1.25 : 1;
      el(pre + 'thigh', 'legs', madd(mul(add(Hh, K), 0.5), Y, 0.6), [len(sub(K, Hh)) * 0.62, 5.2 * big, 4.4 * big], nrm(sub(K, Hh)), Z, X, { k: 2.5 });
      rc(pre + 'shin', 'legs', K, A, 3.4 * big, 2.0, { k: 1.8 });
      sp(pre + 'shin', 'legs', madd(mul(add(K, A), 0.5), Z, -1.4), 2.8 * big, { k: 2 });
      rc(pre + 'meta', 'legs', A, Bb, 1.9, 1.6, { k: 1.4 });
      el(pre + 'toe', 'legs', madd(Bb, sub(T, Bb), 0.25), [3.2, 1.2, 2.2], nrm(sub(T, Bb)), Y, X, { k: 1.2 });
      for (const t of [-1, 0, 1]) {
        const tp = P(T, 1, X, t * (hop ? 2.6 : 1.5), Z, -Math.abs(t) * 0.8);
        rc(pre + 'toe', 'legs', Bb, tp, 1.2, 0.75, { k: 0.9 });
        det(pre + 'toe', 'legs', 'claw', { p: tp, d: nrm(P(Z, 1, Y, -0.45, X, t * 0.2)), L: hop ? 0.8 : 2.4, r: 0.55 });
      }
    }
  } else if (legs === 'quad') {
    const sh = P(C, 1, u, B.rx * 0.62, v, -B.ry * 0.28);
    for (const front of [0, 1]) for (const s of [-1, 1]) {
      const pre = (front ? 'F' : 'H') + (s < 0 ? 'R' : 'L');
      const Hh = front ? P(sh, 1, X, s * B.rz * 0.66) : P(hip, 1, X, s * B.rz * 0.68, v, -0.8);
      const K = P(Hh, 1, Y, -(Hh[1] * 0.48), Z, front ? -2.2 : 3.0, X, s * 0.5);
      const A = [K[0], 1.8, K[2] + (front ? 1.2 : -1.6)];
      const T = [A[0], 0.5, A[2] + 3.2];
      R.add(pre + 'thigh', front ? 'chest' : 'pelvis', Hh, sub(K, Hh), Z);
      R.add(pre + 'shin', pre + 'thigh', K, sub(A, K), Z);
      R.add(pre + 'toe', pre + 'shin', A, sub(T, A), Y);
      R.add(pre + 'toeEnd', pre + 'toe', T, null);
      footJoints.push({ pre, hip: pre + 'thigh', knee: pre + 'shin', ankle: pre + 'toe', ball: pre + 'toe', side: s, kind: 'quad', front, L1: len(sub(K, Hh)), L2: len(sub(A, K)), rest: A.slice(), metaV: [0, 0, 0], toeV: sub(T, A) });
      el(pre + 'thigh', 'legs', mul(add(Hh, K), 0.5), [len(sub(K, Hh)) * 0.6, 4.4, 4.0], nrm(sub(K, Hh)), Z, X, { k: 2.4 });
      rc(pre + 'shin', 'legs', K, A, 3.4, 2.9, { k: 1.8 });
      el(pre + 'toe', 'legs', madd(A, Y, -0.4), [3.0, 1.6, 3.4], Z, Y, X, { k: 1.4 });
      for (const t of [-1, 0, 1]) det(pre + 'toe', 'legs', 'claw', { p: P(A, 1, Z, 2.6, X, t * 1.5, Y, -0.9), d: nrm(P(Z, 1, Y, -0.4)), L: 1.4, r: 0.7 });
    }
  } else if (legs === 'multi') {
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const pre = 'M' + i + (s < 0 ? 'R' : 'L');
      const t = -0.6 + i * 0.4;
      const Hh = P(C, 1, u, B.rx * t, v, -B.ry * 0.2, X, s * B.rz * 0.82);
      const spread = [-1.0, -0.35, 0.35, 1.0][i];
      const K = P(Hh, 1, X, s * 7.5, Y, 7.5, Z, spread * 3.5);
      const Ft = P([Hh[0], 0.6, Hh[2]], 1, X, s * 16.5, Z, spread * 9.5);
      R.add(pre + 'thigh', t < 0 ? 'spine' : 'chest', Hh, sub(K, Hh), Y);
      R.add(pre + 'shin', pre + 'thigh', K, sub(Ft, K), Y);
      R.add(pre + 'toe', pre + 'shin', Ft, null);
      footJoints.push({ pre, hip: pre + 'thigh', knee: pre + 'shin', ankle: pre + 'toe', ball: pre + 'toe', side: s, kind: 'multi', idx: i, L1: len(sub(K, Hh)), L2: len(sub(Ft, K)), rest: Ft.slice(), metaV: [0, 0, 0], toeV: [0, 0, 0] });
      rc(pre + 'thigh', 'legs', Hh, K, 1.9, 1.3, { k: 0.9 });
      sp(pre + 'thigh', 'legs', K, 1.55, { k: 0.6 });
      rc(pre + 'shin', 'legs', K, Ft, 1.3, 0.35, { k: 0.7 });
    }
  } else if (legs === 'serpent') {
    // 地を這う蛇身（S字）
    let p = madd(hip, v, -B.ry * 0.3), d = nrm(P(Y, -1, u, -0.6)), prev = 'pelvis';
    const n = 12, seg = 4.4;
    for (let i = 0; i < n; i++) {
      const bend = i < 3 ? 0.42 : Math.sin(i * 0.9) * 0.34;
      d = i < 3 ? nrm(rotAxis(d, X, -bend)) : nrm(rotAxis([d[0], 0, d[2]], Y, bend));
      if (i >= 3) d = nrm([d[0], 0, d[2]]);
      let q = madd(p, d, seg);
      if (i >= 2) q[1] = Math.max(lerp(B.rz * 0.68, 2.2, i / n), q[1] * 0.5);
      const nm = 'S' + i;
      R.add(nm, prev, p, sub(q, p), Y);
      rc(nm, 'legs', p, q, lerp(B.rz * 0.8, 2.6, i / n), lerp(B.rz * 0.8, 2.6, (i + 1) / n), { k: 2.2, shade: 0 });
      p = q; prev = nm;
    }
    R.add('Send', prev, p, null);
    footJoints.push({ serpent: true });
    var serpTail = { p, d, parent: prev };
  }

  /* --- 腕 --- */
  const at = parts.arms.arch;
  for (const s of [-1, 1]) {
    const pre = s < 0 ? 'aR' : 'aL';
    const S = P(Ch, 1, X, s * B.rz * 0.8, v, -B.ry * 0.3, u, B.rx * 0.08);
    let d1, d2;
    if (F.armMode === 'raise') { d1 = nrm(P(Z, 1, Y, 0.25, X, s * 0.25)); d2 = nrm(P(Z, 1, Y, -0.4)); }
    else if (F.armMode === 'ground') { d1 = nrm(P(Y, -1, Z, 0.45, X, s * 0.2)); d2 = nrm(P(Y, -1, Z, 0.25)); }
    else { d1 = nrm(P(Y, -0.8, Z, 0.5, X, s * 0.2)); d2 = nrm(P(Z, 1, Y, -0.35)); }
    const L1 = { claw: 10, pincer: 9, fist: 11, scythe: 10, tentacle: 0 }[at];
    const L2 = { claw: 9, pincer: 8, fist: 10, scythe: 8, tentacle: 0 }[at];
    sp('chest', 'arms', S, at === 'fist' ? 4.4 : 3.4, { k: 2.5 });
    if (at === 'tentacle') {
      for (let k = 0; k < 2; k++) {
        const d0 = nrm(P(d1, 1, X, s * (0.3 + k * 0.4), Y, -0.2 * k));
        tailChain(madd(S, X, s * k * 1.2), d0, 9, 3.0, 2.6 - k * 0.3, 0.35, (dd, i) => rotAxis(dd, X, 0.08), pre + 't' + k, 'arms', 'chest', { k: 1.2 });
      }
      continue;
    }
    const E = madd(S, d1, L1), W = madd(E, d2, L2);
    R.add(pre + 'up', 'chest', S, d1, Z);
    R.add(pre + 'fo', pre + 'up', E, d2, Z);
    R.add(pre + 'ha', pre + 'fo', W, d2, Z);
    const r0 = { claw: 3.0, pincer: 2.8, fist: 4.4, scythe: 2.4 }[at];
    rc(pre + 'up', 'arms', S, E, r0, r0 * 0.78, { k: 1.8 });
    rc(pre + 'fo', 'arms', E, W, r0 * 0.76, at === 'fist' ? r0 * 0.9 : r0 * 0.6, { k: 1.6 });
    const wdn = nrm(cross(d2, X));
    if (at === 'claw') {
      el(pre + 'ha', 'arms', madd(W, d2, 1.6), [2.4, 1.3, 2.0], d2, wdn, X, { k: 1.2 });
      for (const t of [-1, 0, 1]) {
        const base = P(W, 1, d2, 3.4, X, t * 1.3);
        det(pre + 'ha', 'arms', 'horn', { p: base, d: nrm(P(d2, 1, wdn, -0.5, X, t * 0.25)), L: 5.6, r: 0.6, bendAx: nrm(cross(d2, wdn)), bendAmt: 0.13, mat: 'claw' });
      }
    } else if (at === 'pincer') {
      el(pre + 'ha', 'arms', madd(W, d2, 3.6), [4.8, 2.7, 3.2], d2, wdn, X, { k: 1.4 });
      rc(pre + 'ha', 'arms', P(W, 1, d2, 7), P(W, 1, d2, 12.6, wdn, -0.6), 1.9, 0.35, { k: 0.8 });
      const dj = P(W, 1, d2, 6.2, wdn, 1.8);
      R.add(pre + 'dac', pre + 'ha', dj, P(d2, 1, wdn, 0.12), Z);
      rc(pre + 'dac', 'arms', dj, P(dj, 1, d2, 6.2, wdn, 0.6), 1.6, 0.35, { k: 0.5 });
    } else if (at === 'fist') {
      sp(pre + 'ha', 'arms', madd(W, d2, 1.6), 4.6, { k: 1.4 });
      for (const t of [-1.5, -0.5, 0.5, 1.5]) sp(pre + 'ha', 'arms', P(W, 1, d2, 4.2, X, t * 1.6, wdn, 0.8), 1.3, { k: 0.9 });
    } else if (at === 'scythe') {
      det(pre + 'fo', 'arms', 'blade', { p: madd(E, d2, 0.5), d: nrm(P(d2, 1, wdn, 0.45)), L: 19, r: 2.6, up: mul(wdn, -1), side: X, mat: 'chitin' });
    }
  }

  /* --- 尾の本体 --- */
  {
    let base, d0, parent;
    if (legs === 'serpent') { base = serpTail.p; d0 = serpTail.d; parent = serpTail.parent; }
    else { base = tailBase; d0 = legs === 'biped' ? nrm([0, -0.84, -1]) : legs === 'hop' ? nrm([0, -0.5, -1]) : nrm([0, -0.2, -1]); parent = 'pelvis'; }
    const tbr = Math.min(B.ry * 0.55, B.rz * 0.62);
    if (tt === 'spike' || tt === 'whip' || tt === 'club' || tt === 'stub') {
      const n = tt === 'stub' ? 2 : tt === 'whip' ? 11 : 9;
      const segL = tt === 'stub' ? 3.4 : tt === 'whip' ? 3.3 : 3.3;
      const r1 = tt === 'whip' ? 0.3 : tt === 'club' ? 1.6 : tt === 'stub' ? tbr * 0.6 : 0.5;
      const ch = tailChain(base, d0, n, segL, tbr, r1, (dd, i) => (i === 0 ? dd : rotAxis(dd, X, legs === 'biped' ? 0.035 : 0.02)), 'tail', 'tail', parent);
      if (tt === 'spike') ch.forEach((c, i) => { if (i > 0) det(c.nm, 'tail', 'horn', { p: madd(c.p, Y, c.r * 0.85), d: nrm(P(Y, 1, c.d, -0.5)), L: 3.2 - i * 0.2, r: 0.75 - i * 0.05, mat: 'horn' }); });
      if (tt === 'club') {
        const e = ch[ch.length - 1];
        el(e.nm, 'tail', e.q, [4.4, 3.2, 4.0], e.d, Y, X, { k: 1.2, skin: 5 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; det(e.nm, 'tail', 'horn', { p: P(e.q, 1, Y, Math.cos(a) * 3, X, Math.sin(a) * 3.4), d: nrm(P(Y, Math.cos(a), X, Math.sin(a))), L: 2.6, r: 0.8, mat: 'horn' }); }
      }
    } else if (tt === 'scorpion') {
      const ch = tailChain(base, nrm(P(d0, 1, Y, 1.3)), 8, 3.3, tbr * 0.8, 1.6, (dd, i) => rotAxis(dd, X, -0.42), 'tail', 'tail', parent, { k: 0.6 });
      ch.forEach((c) => sp(c.nm, 'tail', mul(add(c.p, c.q), 0.5), c.r * 1.12, { k: 0.5 }));
      const e = ch[ch.length - 1];
      el(e.nm, 'tail', madd(e.q, e.d, 1.5), [3.0, 2.2, 2.2], e.d, Y, X, { k: 0.8, emis: [0.4, 0.8, 0.1] });
      det(e.nm, 'tail', 'horn', { p: madd(e.q, e.d, 3.6), d: nrm(P(e.d, 1, Y, -0.9)), L: 5, r: 0.9, bendAx: X, bendAmt: 0.25, mat: 'claw' });
    } else if (tt === 'tentacle') {
      for (let k = 0; k < 3; k++) tailChain(madd(base, X, (k - 1) * 2.2), nrm(P(d0, 1, X, (k - 1) * 0.35)), 9, 3.1, tbr * 0.5, 0.35, (dd, i) => rotAxis(dd, X, 0.05), 'tt' + k, 'tail', parent, { k: 1.2 });
    }
  }

  /* --- 背 --- */
  const bk = parts.back.arch;
  const topAt = (t) => P(C, 1, u, B.rx * t, v, B.ry * (bt === 'bloat' ? 1.0 : 0.92) * Math.sqrt(Math.max(0, 1 - t * t)));
  const jointAt = (t) => (t < -0.3 ? 'pelvis' : t < 0.25 ? 'spine' : 'chest');
  if (bk === 'wing') {
    for (const s of [-1, 1]) {
      const pre = s < 0 ? 'wR' : 'wL';
      const S = P(topAt(0.25), 1, X, s * B.rz * 0.42, v, -1);
      const E = P(S, 1, X, s * 13, Y, 7, Z, -3);
      const Wr = P(E, 1, X, s * 11, Y, -2, Z, 3);
      R.add(pre + '0', 'chest', S, sub(E, S), Z);
      R.add(pre + '1', pre + '0', E, sub(Wr, E), Z);
      R.add(pre + '2', pre + '1', Wr, P(X, s, Z, -0.2), Z);
      rc(pre + '0', 'back', S, E, 2.2, 1.4, { k: 1.4 });
      rc(pre + '1', 'back', E, Wr, 1.4, 0.9, { k: 0.9 });
      const tips = [];
      const fd = [nrm(P(X, s, Y, 0.55, Z, 0.25)), nrm(P(X, s, Y, 0.0, Z, -0.35)), nrm(P(X, s * 0.65, Y, -0.35, Z, -0.8)), nrm(P(X, s * 0.25, Y, -0.45, Z, -1))];
      const fl = [15, 20, 18, 15];
      for (let k = 0; k < 4; k++) {
        const T = madd(Wr, fd[k], fl[k]);
        R.add(pre + 'f' + k, pre + '2', Wr, fd[k], Z);
        R.add(pre + 'f' + k + 'e', pre + 'f' + k, T, null);
        rc(pre + 'f' + k, 'back', Wr, T, 0.75, 0.22, { k: 0.4 });
        tips.push({ T, j: pre + 'f' + k });
      }
      det(pre + '2', 'back', 'membrane', { s, S, E, Wr, tips, body: [topAt(-0.35), P(C, 1, u, -B.rx * 0.6, v, B.ry * 0.3, X, s * B.rz * 0.6)], pre });
      det(pre + '2', 'back', 'horn', { p: Wr, d: nrm(P(Y, 1, X, s * 0.3)), L: 2.6, r: 0.6, mat: 'claw' });
    }
  } else if (bk === 'insectwing') {
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const pre = (s < 0 ? 'iR' : 'iL') + k;
      const S = P(topAt(0.15 - k * 0.3), 1, X, s * 2.5);
      R.add(pre, 'chest', S, nrm(P(u, -1, X, s * 0.25, v, 0.12)), Y);
      det(pre, 'back', 'iwing', { p: S, d: nrm(P(u, -1, X, s * 0.25, v, 0.12)), L: 30 - k * 4, w: 7 - k, s });
    }
  } else if (bk === 'shell') {
    el('spine', 'back', P(C, 1, v, B.ry * 0.35), [B.rx * 1.05, B.ry * 0.85, B.rz * 1.12], u, v, X, { k: 1.6, skin: 1, shade: 2 });
  } else if (bk === 'fin' || bk === 'spine' || bk === 'crystal') {
    for (let i = 0; i < 7; i++) {
      const t = 0.62 - i * 0.22;
      const p = topAt(t);
      const nn = nrm(sub(p, C));
      const j = jointAt(t);
      if (bk === 'fin') det(j, 'back', 'plate', { p: madd(p, nn, -0.6), d: nn, back: mul(u, -1), L: 7.2 - Math.abs(i - 2.5) * 0.9, w: 4.2 - Math.abs(i - 2.5) * 0.35 });
      else if (bk === 'spine') det(j, 'back', 'horn', { p, d: nrm(P(nn, 1, u, -0.55)), L: 9 - i * 0.6, r: 1.2 - i * 0.06, mat: 'horn' });
      else for (let q = 0; q < 2; q++) det(j, 'back', 'crystal', { p: madd(p, X, (q - 0.5) * 3 + (rng() - 0.5)), d: nrm(P(nn, 1, X, (q - 0.5) * 0.8, u, (rng() - 0.6) * 0.6)), L: 6 + rng() * 6, r: 1.2 + rng() * 0.8 });
    }
    if (bk === 'fin' && R.has('tail0')) for (let i = 0; i < 6; i++) det('tail0', 'back', 'plate', { p: madd(add(Tb, mul(u, -i * 3.5)), Y, 3.5 - i * 0.5), d: Y, back: mul(u, -1), L: 3.8 - i * 0.5, w: 2.4 - i * 0.25, tail: i });
  } else if (bk === 'volcano') {
    for (const t of [-0.45, 0.1]) {
      const p = topAt(t), nn = nrm(sub(p, C));
      const top = madd(p, nn, t < 0 ? 8 : 6);
      rc(jointAt(t), 'back', madd(p, nn, -1), top, t < 0 ? 6 : 5, t < 0 ? 2.6 : 2.1, { k: 2, skin: 6 });
      sp(jointAt(t), 'back', madd(top, nn, 0.8), t < 0 ? 2.0 : 1.6, { sub: true, k: 0.6 });
      sp(jointAt(t), 'back', madd(top, nn, -0.6), t < 0 ? 1.8 : 1.4, { k: 0.3, emis: [1.0, 0.35, 0.05], shade: 2 });
    }
  } else if (bk === 'sac') {
    for (let i = 0; i < 3; i++) {
      const t = -0.5 + i * 0.36, p = topAt(t), nn = nrm(sub(p, C));
      sp(jointAt(t), 'back', madd(p, nn, 1.6), 3.4 + (i === 1 ? 0.8 : 0), { k: 1.2, skin: 4, emis: [0.25, 0.6, 0.05] });
    }
  }
  R.finalize();
  // 全体の大きさ
  const sF = desc.sizeF || 1;
  return { rig: R, prims, details, footJoints, sizeF: sF, frame: legs, F, B, parts, headType: ht, bodyType: bt, tailType: tt, armType: at, backType: bk, mouth };
}

/* ---------- 等値面抽出（サーフェスネッツ） ---------- */
function polygonize(prims, cell) {
  const add_ = prims.filter((p) => !p.sub), sub_ = prims.filter((p) => p.sub);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of add_) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.c[a] - p.R - p.k); mx[a] = Math.max(mx[a], p.c[a] + p.R + p.k); }
  mn = mn.map((x) => x - cell * 2); mx = mx.map((x) => x + cell * 2);
  const nx = Math.ceil((mx[0] - mn[0]) / cell) + 1, ny = Math.ceil((mx[1] - mn[1]) / cell) + 1, nz = Math.ceil((mx[2] - mn[2]) / cell) + 1;
  const field = new Float32Array(nx * ny * nz).fill(1e3);
  const BS = 8;
  const kMax = Math.max(...prims.map((p) => p.k));
  const evalList = (list, sl, x, y, z) => {
    let d = 1e3;
    for (let i = 0; i < list.length; i++) {
      const p = list[i], b = p.f(x, y, z), k = p.k;
      const h = Math.max(k - Math.abs(d - b), 0) / k;
      d = Math.min(d, b) - h * h * k * 0.25;
    }
    for (let i = 0; i < sl.length; i++) {
      const p = sl[i], b = -p.f(x, y, z), k = p.k;
      const h = Math.max(k - Math.abs(d - b), 0) / k;
      d = Math.max(d, b) + h * h * k * 0.25;
    }
    return d;
  };
  for (let bz = 0; bz < nz; bz += BS) for (let by = 0; by < ny; by += BS) for (let bx = 0; bx < nx; bx += BS) {
    const x0 = mn[0] + bx * cell, y0 = mn[1] + by * cell, z0 = mn[2] + bz * cell;
    const x1 = x0 + BS * cell, y1 = y0 + BS * cell, z1 = z0 + BS * cell;
    const m = cell * 2 + kMax;
    const near = (p) => { const dx = Math.max(x0 - p.c[0], 0, p.c[0] - x1), dy = Math.max(y0 - p.c[1], 0, p.c[1] - y1), dz = Math.max(z0 - p.c[2], 0, p.c[2] - z1); return Math.hypot(dx, dy, dz) < p.R + m; };
    const L = add_.filter(near);
    if (!L.length) continue;
    const S = sub_.filter(near);
    for (let k = bz; k < Math.min(nz, bz + BS); k++) for (let j = by; j < Math.min(ny, by + BS); j++) for (let i = bx; i < Math.min(nx, bx + BS); i++) {
      field[(k * ny + j) * nx + i] = evalList(L, S, mn[0] + i * cell, mn[1] + j * cell, mn[2] + k * cell);
    }
  }
  // セルごとに頂点
  const cidx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const F = (i, j, k) => field[(k * ny + j) * nx + i];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { val[c] = F(i + co[c][0], j + co[c][1], k + co[c][2]); if (val[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    cidx[(k * (ny - 1) + j) * (nx - 1) + i] = pos.length / 3;
    pos.push(mn[0] + (i + sx / n) * cell, mn[1] + (j + sy / n) * cell, mn[2] + (k + sz / n) * cell);
  }
  const C = (i, j, k) => cidx[(k * (ny - 1) + j) * (nx - 1) + i];
  const idx = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F(i, j, k) < 0;
    // x 方向の辺
    if (i < nx - 1 && (F(i + 1, j, k) < 0) !== v0) {
      const a = C(i, j - 1, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i, j - 1, k);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
    }
    if (j < ny - 1 && (F(i, j + 1, k) < 0) !== v0) {
      const a = C(i - 1, j, k - 1), b = C(i, j, k - 1), c = C(i, j, k), d = C(i - 1, j, k);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); }
    }
    if (k < nz - 1 && (F(i, j, k + 1) < 0) !== v0) {
      const a = C(i - 1, j - 1, k), b = C(i, j - 1, k), c = C(i, j, k), d = C(i - 1, j, k);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }
    }
  }
  return { pos, idx, evalAt: (x, y, z) => evalList(add_, sub_, x, y, z) };
}

/* ---------- 皮膚の質感（シェーダー） ---------- */
const SKIN_GLSL = /* glsl */`
// 皮膚の凹凸：0鱗 1甲殻 2いぼ 3皮・毛 4ぬめり 5骨 6岩 7羽毛。fw=画素あたりの大きさ（細かすぎる模様は平均値へ溶かす）
float fadeF(float fw, float f){ return 1.0 - smoothstep(0.1, 0.34, fw*f); }
float skinHeight(float t, vec3 p, float fw, out float rough, out float lava){
  rough = 0.6; lava = 0.0;
  float big = vnoise3(p*0.11)*0.35 + vnoise3(p*0.33)*0.2*fadeF(fw,0.33);
  if (t < 0.5) { float a = fadeF(fw,0.85); vec3 c = cell3(p*0.85); float s = smoothstep(0.0, 0.5, c.y - c.x); s = sqrt(s);
    rough = mix(0.55, 0.42 + 0.22*c.z, a); return big + mix(0.42, s*0.75 + c.z*0.15, a) + (vnoise3(p*3.5)-0.5)*0.1*fadeF(fw,3.5); }
  if (t < 1.5) { float a = fadeF(fw,0.55); vec3 c = cell3(p*0.55); float tub = smoothstep(0.42, 0.08, c.x) * step(0.5, c.z);
    vec3 c2 = cell3(p*0.11); float seam = 1.0 - smoothstep(0.0, 0.05, c2.y - c2.x);
    rough = 0.3 + 0.2*vnoise3(p*0.8); return big*0.6 + 0.55 + mix(0.08, tub*0.55, a) - seam*0.5*fadeF(fw,0.2) + (vnoise3(p*2.6)-0.5)*0.12*fadeF(fw,2.6); }
  if (t < 2.5) { float a = fadeF(fw,0.7); vec3 c = cell3(p*0.7); float w = smoothstep(0.6, 0.12, c.x);
    rough = 0.4; return big + mix(0.3, w*0.7, a) + (vnoise3(p*2.2)-0.5)*0.2*fadeF(fw,2.2); }
  if (t < 3.5) { float a = fadeF(fw,2.0); float n = vnoise3(p*vec3(2.0,0.7,2.0));
    rough = 0.92; return big + mix(0.5, n*0.7, a) + (vnoise3(p*vec3(7.0,2.0,7.0))-0.5)*0.4*fadeF(fw,7.0); }
  if (t < 4.5) { rough = 0.2; return big*1.4 + (vnoise3(p*1.6)-0.5)*0.25*fadeF(fw,1.6); }
  if (t < 5.5) { float a = fadeF(fw,0.45); vec3 c = cell3(p*0.45); float cr = 1.0 - smoothstep(0.0, 0.05, c.y - c.x);
    rough = 0.72; return big + (vnoise3(p*2.3)-0.5)*0.3*fadeF(fw,2.3) - cr*0.5*a; }
  if (t < 6.5) { float a = fadeF(fw,0.2); vec3 c = cell3(p*0.2); float cr = 1.0 - smoothstep(0.0, 0.035, c.y - c.x);
    float hot = smoothstep(0.45, 0.75, vnoise3(p*0.09 + vec3(uTime*0.02)));
    lava = cr*a*hot + (1.0-a)*0.03*hot; rough = 0.92; return big + vnoise3(p*1.2)*0.5*fadeF(fw,1.2) - cr*0.6*a + (vnoise3(p*4.0)-0.5)*0.2*fadeF(fw,4.0); }
  float a = fadeF(fw,1.4); vec3 c = cell3(p*vec3(1.4,0.7,1.4)); rough = 0.78; return big + mix(0.3, smoothstep(0.0, 0.5, c.y - c.x)*0.6, a);
}
`;
function skinMaterial(engine, uni) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.uniforms.uTime = engine.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSkin; attribute vec3 aEmit; attribute float aAO;\nvarying float vSkin; varying vec3 vEmit; varying float vAO; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin; vEmit = aEmit; vAO = aAO; vRest = position / max(uScale, 0.01);');
    sh.vertexShader = 'uniform float uScale;\n' + sh.vertexShader;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uFlash; uniform float uCharge; uniform float uDead; uniform vec3 uGlow; uniform float uScaleF;\nvarying float vSkin; varying vec3 vEmit; varying float vAO; varying vec3 vRest;\n' + GLSL_NOISE + SKIN_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat sRough, sLava; float sFw = length(fwidth(vRest)); float sh0 = skinHeight(vSkin, vRest, sFw, sRough, sLava);')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= (0.42 + 0.58*smoothstep(0.05, 1.0, sh0)) * mix(0.35, 1.0, vAO); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.3, uDead);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = sRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 dh = vec2(dFdx(sh0), dFdy(sh0)) * 0.55 * uScaleF;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
          normal = normalize(abs(det) * normal - grad * (1.0 - smoothstep(0.18, 0.9, sFw))); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pulse = 0.75 + 0.25*sin(uTime*2.3 + vRest.x*0.3);
        totalEmissiveRadiance += vEmit * pulse * (1.5 + uCharge*3.0) * (1.0 - uDead);
        totalEmissiveRadiance += vec3(1.0,0.32,0.05) * sLava * (1.8 + 0.8*sin(uTime*1.7 + vRest.y)) * (1.0 - uDead);
        totalEmissiveRadiance += vec3(0.8,0.22,0.06) * uFlash * 0.08;`);
  };
  m.customProgramCacheKey = () => 'beastskin';
  return m;
}

function membraneMaterial(engine, color, glow) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = engine.uniforms.uSunDir; sh.uniforms.uGlowC = { value: glow };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uGlowC; varying vec3 vMP;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n { vec3 c = cell3(vMP*0.12); float vein = 1.0 - smoothstep(0.0, 0.06, c.y - c.x); diffuseColor.rgb *= 0.75 + 0.35*vnoise3(vMP*0.3) - vein*0.3; }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 sv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz); float back = max(0.0, -dot(normal, sv)) * smoothstep(-0.05, 0.2, uSunDir.y); totalEmissiveRadiance += uGlowC * back * 0.9; }');
  };
  m.customProgramCacheKey = () => 'membrane';
  return m;
}

/* ---------- 小部品のジオメトリ ---------- */
function tubeAlong(points, radii, seg) {
  const pos = [], idx = [];
  const n = points.length;
  let prevX = null;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const d = nrm(sub(b, a));
    let ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let x = prevX ? nrm(sub(prevX, mul(d, dot(prevX, d)))) : nrm(cross(d, ref));
    if (!isFinite(x[0])) x = nrm(cross(d, ref));
    prevX = x;
    const y = cross(d, x);
    for (let k = 0; k < seg; k++) {
      const ang = (k / seg) * Math.PI * 2;
      const r = radii[i];
      pos.push(...P(points[i], 1, x, Math.cos(ang) * r, y, Math.sin(ang) * r));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = (i + 1) * seg + k, d = (i + 1) * seg + ((k + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  return { pos, idx };
}
function hornGeo(D) {
  const n = 8;
  const pts = [], rad = [];
  let p = D.p, d = D.d;
  for (let i = 0; i <= n; i++) {
    pts.push(p); rad.push(D.r * Math.pow(1 - i / n, 0.9) + 0.03);
    if (D.bendAx) d = nrm(rotAxis(d, D.bendAx, D.bendAmt != null ? D.bendAmt : 0.06));
    p = madd(p, d, D.L / n);
  }
  const t = tubeAlong(pts, rad, D.flat ? 4 : 7);
  if (D.flat) for (let i = 0; i < t.pos.length; i += 3) { /* 羽：平たく */ }
  return t;
}
function blade(D) {
  // 鎌：平たい弧
  const pos = [], idx = [];
  const n = 10, side = D.side, up = D.up;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dd = nrm(rotAxis(D.d, side, -0.9 * t));
    const c = madd(D.p, dd, D.L * t);
    const w = D.r * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (1 - t * 0.6) + 0.05;
    pos.push(...madd(c, side, 0.35 * (1 - t)), ...madd(madd(c, up, w), side, 0), ...madd(c, side, -0.35 * (1 - t)));
    if (i > 0) { const a = (i - 1) * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 2, a + 1, a + 5, a + 1, a + 4, a + 5, a, a + 2, a + 3, a + 2, a + 5, a + 3); }
  }
  return { pos, idx };
}
function plateGeo(D) {
  const pos = [], idx = [];
  const back = D.back, up = D.d, side = nrm(cross(up, back));
  const pts = [[0, 0], [0.55, 0.1], [0.9, 0.42], [1, 0.75], [0.62, 0.55], [0.25, 0.4], [0.05, 0.2]];
  const ring = pts.map(([h, w]) => madd(madd(D.p, up, h * D.L), back, (w - 0.25) * D.w));
  const th = 0.45;
  for (const s of [-1, 1]) for (const r of ring) pos.push(...madd(r, side, s * th * (1 - 0.6 * dot(sub(r, D.p), up) / D.L)));
  const n = ring.length;
  for (let i = 1; i < n - 1; i++) { idx.push(0, i, i + 1); idx.push(n, n + i + 1, n + i); }
  for (let i = 0; i < n; i++) { const a = i, b = (i + 1) % n; idx.push(a, n + a, b, b, n + a, n + b); }
  return { pos, idx };
}
function crystalGeo(D) {
  const g = new THREE.ConeGeometry(D.r, D.L, 6, 1);
  g.translate(0, D.L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...D.d));
  g.applyQuaternion(q); g.translate(...D.p);
  return { pos: Array.from(g.attributes.position.array), idx: g.index ? Array.from(g.index.array) : null };
}
function sphereGeo(c, r, det = 1) {
  const g = new THREE.IcosahedronGeometry(r, det);
  g.translate(...c);
  return { pos: Array.from(g.attributes.position.array), idx: null };
}
function beakGeo(D) {
  const pos = [], idx = [];
  const n = 8, up = D.up, side = nrm(cross(D.d, up));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dd = nrm(rotAxis(D.d, side, (D.lower ? -0.15 : 0.35) * t * t));
    const c = madd(madd(D.p, D.d, D.L * t), up, (D.lower ? 0 : -1.2) * t * t);
    const w = D.r * (1 - t * 0.92), h = D.r * 0.8 * (1 - t * 0.85);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pos.push(...P(c, 1, side, Math.cos(a) * w * 0.7, up, Math.sin(a) * h)); }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) { const a = i * 6 + k, b = i * 6 + ((k + 1) % 6), c = a + 6, d = b + 6; idx.push(a, c, b, b, c, d); }
  return { pos, idx };
}
function membraneGeo(D, rig) {
  // 指先の間と胴体のあいだに張る膜
  const pos = [], idx = [], sk = [], sw = [];
  const Wr = D.Wr;
  const jWr = rig.map[D.pre + '2'], jE = rig.map[D.pre + '1'], jChest = rig.map.chest, jSp = rig.map.spine;
  const edges = [D.tips[0].T, D.tips[1].T, D.tips[2].T, D.tips[3].T, D.body[1], D.body[0]];
  const ej = [rig.map[D.tips[0].j], rig.map[D.tips[1].j], rig.map[D.tips[2].j], rig.map[D.tips[3].j], jSp, jChest];
  const N = 7;
  const vtx = (p, a, b, wb) => { pos.push(...p); sk.push(a, b, 0, 0); sw.push(1 - wb, wb, 0, 0); return pos.length / 3 - 1; };
  // 前縁（上腕〜前腕）
  for (let e = 0; e < edges.length - 1; e++) {
    const A = edges[e], Bp = edges[e + 1];
    const base = [];
    for (let i = 0; i <= N; i++) {
      const row = [];
      for (let k = 0; k <= N; k++) {
        const s = i / N, t = k / N;
        // 指の付け根 Wr から、辺 A–B へ
        const edge = add(mul(A, 1 - t), mul(Bp, t));
        const sag = Math.sin(t * Math.PI) * 0.18 * s;
        let p = add(mul(Wr, 1 - s), mul(edge, s));
        p = madd(p, sub(Wr, edge), sag);
        const ja = e < 4 ? ej[e] : jSp, jb = e + 1 < 4 ? ej[e + 1] : ej[e + 1];
        row.push(vtx(p, s < 0.15 ? jWr : ja, s < 0.15 ? jWr : jb, t));
      }
      base.push(row);
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) { const a = base[i][k], b = base[i + 1][k], c = base[i + 1][k + 1], d = base[i][k + 1]; idx.push(a, b, c, a, c, d); }
  }
  // 腕と胴のあいだ
  const S = D.S, E = D.E, b0 = D.body[0];
  const quad = [S, E, Wr, b0];
  const qj = [jChest, jE, jWr, jChest];
  const base = [];
  for (let i = 0; i <= N; i++) {
    const row = [];
    for (let k = 0; k <= N; k++) {
      const s = i / N, t = k / N;
      const top = add(mul(quad[0], 1 - t), mul(quad[2], t)), bot = add(mul(quad[3], 1 - t), mul(quad[2], t));
      const p = add(mul(top, 1 - s), mul(bot, s));
      row.push(vtx(p, t < 0.5 ? qj[0] : qj[2], qj[1], Math.sin(t * Math.PI) * 0.5));
    }
    base.push(row);
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) { const a = base[i][k], b = base[i + 1][k], c = base[i + 1][k + 1], d = base[i][k + 1]; idx.push(a, b, c, a, c, d); }
  return { pos, idx, sk, sw };
}
function iwingGeo(D) {
  const pos = [], idx = [], uvs = [];
  const side = [D.s, 0, 0];
  const n = 10;
  const w = nrm(cross(D.d, [0, 1, 0]));
  pos.push(...D.p); uvs.push(0, 0.5);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    const p = P(D.p, 1, D.d, (1 - Math.cos(a)) * 0.5 * D.L, w, Math.sin(a) * D.w * D.s, [0, 1, 0], Math.sin(a) * 0.4);
    pos.push(...p); uvs.push((1 - Math.cos(a)) * 0.5, 0.5 + Math.sin(a) * 0.5);
    if (i > 0) idx.push(0, i, i + 1);
  }
  return { pos, idx, uvs };
}

/* ---------- 3D巨獣 ---------- */
export class Beast3D {
  constructor(engine, desc, opts = {}) {
    this.engine = engine;
    this.desc = desc;
    const A = buildAnatomy(desc);
    this.A = A;
    const sF = A.sizeF;
    const rig = A.rig;
    // 大きさを掛ける
    for (const J of rig.j) { J.rp.multiplyScalar(sF); J.lo.multiplyScalar(sF); }
    const prims = A.prims.map((p) => Object.assign({}, p));
    // プリミティブは scale 済みで作り直す
    const scaled = A.prims.map((p) => {
      const q = Object.assign({}, p);
      const f0 = p.f;
      q.f = (x, y, z) => f0(x / sF, y / sF, z / sF) * sF;
      q.c = mul(p.c, sF); q.R = p.R * sF; q.r = p.r * sF; q.k = p.k * sF;
      return q;
    });
    const t0 = performance.now();
    const cell = (opts.cell || 0.5) * sF;
    const surf = polygonize(scaled, cell);
    this.buildMs = performance.now() - t0;
    this.uni = { uFlash: { value: 0 }, uCharge: { value: 0 }, uDead: { value: 0 }, uScale: { value: sF }, uScaleF: { value: sF }, uGlow: { value: new THREE.Color(1, 0.5, 0.2) } };
    this.root = new THREE.Group();
    this.bones = rig.j.map((J) => { const b = new THREE.Bone(); b.name = J.name; return b; });
    for (const b of this.bones) this.root.add(b);
    const boneInv = rig.j.map((J) => new THREE.Matrix4().compose(J.rp, J.rq, new THREE.Vector3(1, 1, 1)).invert());
    this.skeleton = new THREE.Skeleton(this.bones, boneInv);
    this.setRest();
    // 皮膚メッシュ
    const geo = this.skinGeometry(surf, scaled, rig, A);
    this.skinMat = skinMaterial(engine, this.uni);
    this.mesh = new THREE.SkinnedMesh(geo, this.skinMat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    // 小部品
    this.detailMeshes = this.buildDetails(A, rig, sF);
    for (const m of this.detailMeshes) { m.frustumCulled = false; this.root.add(m); m.bind(this.skeleton, new THREE.Matrix4()); }
    // 骨格アニメ用
    this.height = 0; this.computeSize();
  }
  setRest() {
    const rig = this.A.rig;
    rig.j.forEach((J, i) => { this.bones[i].position.copy(J.rp); this.bones[i].quaternion.copy(J.rq); this.bones[i].scale.set(1, 1, 1); });
    this.root.updateMatrixWorld(true);
  }
  computeSize() {
    const bb = this.mesh.geometry.boundingBox;
    this.height = bb.max.y; this.length = bb.max.z - bb.min.z; this.width = bb.max.x - bb.min.x;
    this.frontZ = bb.max.z; this.backZ = bb.min.z;
  }
  skinGeometry(surf, prims, rig, A) {
    const nv = surf.pos.length / 3;
    const pos = new Float32Array(surf.pos), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const skI = new Uint16Array(nv * 4), skW = new Float32Array(nv * 4), skin = new Float32Array(nv), emit = new Float32Array(nv * 3), ao = new Float32Array(nv);
    const ev = surf.evalAt;
    const pal = {};
    for (const slot of Object.keys(SLOT_ID)) {
      const p = A.parts[slot].pal;
      const c = (h) => new THREE.Color(h);
      pal[SLOT_ID[slot]] = { base: c(p.base), dark: c(p.dark), light: c(p.light), belly: c(p.belly), horn: c(p.horn) };
    }
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();
    const sF = A.sizeF;
    // 頂点の近くのプリミティブだけ調べる格子
    const G = 6 * sF, buckets = new Map();
    const key = (x, y, z) => (Math.floor(x / G) + 512) * 1048576 + (Math.floor(y / G) + 512) * 1024 + (Math.floor(z / G) + 512);
    prims.forEach((p, pi) => {
      const r = p.R + p.k + G;
      for (let x = Math.floor((p.c[0] - r) / G); x <= Math.floor((p.c[0] + r) / G); x++)
        for (let y = Math.floor((p.c[1] - r) / G); y <= Math.floor((p.c[1] + r) / G); y++)
          for (let z = Math.floor((p.c[2] - r) / G); z <= Math.floor((p.c[2] + r) / G); z++) {
            const k = (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);
            let a = buckets.get(k); if (!a) buckets.set(k, (a = [])); a.push(pi);
          }
    });
    const jw = new Float32Array(rig.j.length), sw = new Float32Array(6);
    const e = 0.06 * sF;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const nx = ev(x + e, y, z) - ev(x - e, y, z), ny = ev(x, y + e, z) - ev(x, y - e, z), nz = ev(x, y, z + e) - ev(x, y, z - e);
      const nl = Math.hypot(nx, ny, nz) || 1;
      const n0 = nx / nl, n1 = ny / nl, n2 = nz / nl;
      nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
      // 影（SDF による凹み）
      let occ = 0;
      for (let k = 1; k <= 4; k++) { const h = k * 0.9 * sF; occ += (h - ev(x + n0 * h, y + n1 * h, z + n2 * h)) / Math.pow(2, k); }
      ao[i] = clamp(1 - occ * 0.55 / sF, 0, 1);
      // 重み
      const list = buckets.get(key(x, y, z)) || [];
      let dmin = 1e9;
      const ds = [];
      for (const pi of list) { const p = prims[pi]; if (p.sub) continue; const d = p.f(x, y, z); ds.push([pi, d]); if (d < dmin) dmin = d; }
      jw.fill(0); sw.fill(0);
      let best = null, bw = -1, ex = 0, ey = 0, ez = 0, shadeBelly = 0, shadeDark = 0, shadeFace = 0;
      for (const [pi, d] of ds) {
        const p = prims[pi];
        const w = Math.exp(-Math.max(0, d - dmin) / (0.55 * sF + p.k * 0.15));
        if (w < 0.02) continue;
        jw[rig.map[p.j]] += w; sw[p.slot] += w;
        if (w > bw) { bw = w; best = p; }
        if (p.emis) { ex += p.emis[0] * w; ey += p.emis[1] * w; ez += p.emis[2] * w; }
        if (p.shade === 1) shadeBelly += w; if (p.shade === 2) shadeDark += w; if (p.shade === 3) shadeFace += w;
      }
      // 上位4本の骨
      const top = [];
      for (let j = 0; j < jw.length; j++) if (jw[j] > 0) top.push([j, jw[j]]);
      top.sort((a, b) => b[1] - a[1]);
      let tw = 0;
      for (let k = 0; k < 4; k++) if (top[k]) tw += top[k][1];
      for (let k = 0; k < 4; k++) { skI[i * 4 + k] = top[k] ? top[k][0] : 0; skW[i * 4 + k] = top[k] ? top[k][1] / tw : 0; }
      if (!top.length) skW[i * 4] = 1;
      // 色
      let tot = 0; for (let k = 0; k < 6; k++) tot += sw[k];
      tmp.setRGB(0, 0, 0);
      const rx = x / sF, ry = y / sF, rz = z / sF;
      const mot = vnoise(rx * 0.21 + ry * 0.07, rz * 0.21 - ry * 0.05) * 0.6 + vnoise(rz * 0.6 + 31, ry * 0.6 + rx * 0.3) * 0.4;
      const stripe = Math.sin(rz * 0.42 + vnoise(rx * 0.3, rz * 0.3) * 3.0) * 0.5 + 0.5;
      for (let k = 0; k < 6; k++) {
        if (!sw[k]) continue;
        const pl = pal[k];
        tmp2.copy(pl.base);
        if (n1 < -0.2) tmp2.lerp(pl.belly, clamp((-n1 - 0.2) * 1.6, 0, 1));
        if (n1 > 0.35) tmp2.lerp(pl.dark, clamp((n1 - 0.35) * 1.1, 0, 0.6));
        if (n1 > 0.1 && stripe > 0.3) tmp2.lerp(pl.dark, clamp((stripe - 0.3) * 1.4, 0, 0.55) * clamp((n1 - 0.1) * 2, 0, 1));
        if (mot > 0.56) tmp2.lerp(pl.light, clamp((mot - 0.56) * 2.2, 0, 0.5));
        else if (mot < 0.38) tmp2.lerp(pl.dark, clamp((0.38 - mot) * 1.6, 0, 0.35));
        tmp.r += tmp2.r * sw[k] / tot; tmp.g += tmp2.g * sw[k] / tot; tmp.b += tmp2.b * sw[k] / tot;
      }
      const sb = shadeBelly / (bw > 0 ? bw + 1e-6 : 1);
      if (shadeBelly > 0) tmp.lerp(pal[best ? best.slot : 1].belly, clamp(shadeBelly / (shadeBelly + 0.3), 0, 0.8));
      if (shadeDark > 0) tmp.multiplyScalar(1 - clamp(shadeDark / (shadeDark + 0.3), 0, 0.75));
      if (shadeFace > 0) tmp.lerp(tmp2.setRGB(0.07, 0.055, 0.05), clamp(shadeFace / (shadeFace + 0.4), 0, 0.85));
      // 足もとの泥・土埃
      if (ry < 5) tmp.lerp(tmp2.setRGB(0.085, 0.07, 0.05), (1 - ry / 5) * 0.55);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      skin[i] = best ? best.skin : 0;
      emit[i * 3] = ex; emit[i * 3 + 1] = ey; emit[i * 3 + 2] = ez;
    }
    // 口の中を暗く
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skW, 4));
    geo.setAttribute('aSkin', new THREE.BufferAttribute(skin, 1));
    geo.setAttribute('aEmit', new THREE.BufferAttribute(emit, 3));
    geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    geo.setIndex(surf.idx);
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }
  buildDetails(A, rig, sF) {
    const groups = {};
    const push = (mat, g, j, slot) => {
      const G = groups[mat] || (groups[mat] = { pos: [], idx: [], sk: [], sw: [], uv: [], slot: [] });
      const base = G.pos.length / 3;
      for (let i = 0; i < g.pos.length; i++) G.pos.push(g.pos[i] * sF);
      const nv = g.pos.length / 3;
      for (let i = 0; i < nv; i++) {
        if (g.sk) { G.sk.push(g.sk[i * 4], g.sk[i * 4 + 1], 0, 0); G.sw.push(g.sw[i * 4], g.sw[i * 4 + 1], 0, 0); }
        else { G.sk.push(rig.map[j], 0, 0, 0); G.sw.push(1, 0, 0, 0); }
        G.uv.push(g.uvs ? g.uvs[i * 2] : 0, g.uvs ? g.uvs[i * 2 + 1] : 0);
        G.slot.push(slot);
      }
      if (g.idx) for (const k of g.idx) G.idx.push(base + k);
      else for (let i = 0; i < nv; i++) G.idx.push(base + i);
    };
    for (const D of A.details) {
      if (D.kind === 'horn') push(D.mat || 'horn', hornGeo(D), D.j, D.slot);
      else if (D.kind === 'tooth') push('tooth', hornGeo({ p: D.p, d: D.d, L: D.L, r: D.r }), D.j, D.slot);
      else if (D.kind === 'claw') push('claw', hornGeo({ p: D.p, d: D.d, L: D.L, r: D.r, bendAx: nrm(cross(D.d, [0, 1, 0])), bendAmt: -0.12 }), D.j, D.slot);
      else if (D.kind === 'eye') { push(D.compound ? 'ceye' : 'eye', sphereGeo(D.p, D.r * (D.compound ? 1 : 0.8), D.compound ? 2 : 1), D.j, D.slot); }
      else if (D.kind === 'blade') push('chitin', blade(D), D.j, D.slot);
      else if (D.kind === 'plate') push('plate', plateGeo(D), D.j, D.slot);
      else if (D.kind === 'crystal') push('crystal', crystalGeo(D), D.j, D.slot);
      else if (D.kind === 'beak') push('horn', beakGeo(D), D.j, D.slot);
      else if (D.kind === 'membrane') push('membrane', membraneGeo(D, rig), D.j, D.slot);
      else if (D.kind === 'iwing') push('iwing', iwingGeo(D), D.j, D.slot);
    }
    const parts = A.parts;
    const col = (slot, k) => new THREE.Color(parts[Object.keys(SLOT_ID).find((s) => SLOT_ID[s] === slot)].pal[k]);
    const eyeCol = new THREE.Color(parts.head.pal.eye);
    const elemCol = { fire: 0xff6a2a, poison: 0x8fdc4a, thunder: 0x56c8ff, curse: 0xb07bff, shock: 0xeadcb6 }[this.desc.elem] || 0xff6a2a;
    const mats = {
      horn: () => new THREE.MeshStandardMaterial({ color: col(0, 'horn'), roughness: 0.45, metalness: 0.05 }),
      bone: () => new THREE.MeshStandardMaterial({ color: col(0, 'horn'), roughness: 0.7 }),
      feather: () => new THREE.MeshStandardMaterial({ color: col(0, 'light'), roughness: 0.8, side: THREE.DoubleSide }),
      tooth: () => new THREE.MeshStandardMaterial({ color: 0xe9e0c8, roughness: 0.35 }),
      claw: () => new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.3, metalness: 0.1 }),
      chitin: () => new THREE.MeshStandardMaterial({ color: col(2, 'dark'), roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide }),
      eye: () => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: eyeCol, emissiveIntensity: 1.6, roughness: 0.08 }),
      ceye: () => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: eyeCol, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.3 }),
      plate: () => new THREE.MeshStandardMaterial({ color: col(5, 'horn'), roughness: 0.5, emissive: new THREE.Color(elemCol), emissiveIntensity: 0 }),
      crystal: () => new THREE.MeshStandardMaterial({ color: new THREE.Color(elemCol).multiplyScalar(0.4), emissive: new THREE.Color(elemCol), emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.88 }),
      membrane: () => membraneMaterial(this.engine, col(5, 'base').multiplyScalar(0.75), col(5, 'light')),
      iwing: () => new THREE.MeshPhysicalMaterial({ color: 0xd8f0e0, roughness: 0.15, transparent: true, opacity: 0.32, side: THREE.DoubleSide, iridescence: 1, iridescenceIOR: 1.6, depthWrite: false }),
    };
    this.detailMat = {};
    const out = [];
    for (const k of Object.keys(groups)) {
      const G = groups[k];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(G.sk, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(G.sw, 4));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
      g.setIndex(G.idx);
      g.computeVertexNormals();
      const m = mats[k]();
      this.detailMat[k] = m;
      const mesh = new THREE.SkinnedMesh(g, m);
      mesh.castShadow = k !== 'iwing'; mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
  dispose() {
    this.mesh.geometry.dispose(); this.skinMat.dispose();
    for (const m of this.detailMeshes) { m.geometry.dispose(); m.material.dispose(); }
  }
}
export { rotAxis, nrm, cross, dot, sub, add, mul, madd };
