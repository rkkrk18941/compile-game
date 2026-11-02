// 人・馬・攻城兵器の見た目。人は一つのインスタンス描画で、手足の振りは頂点シェーダーで動かす。
import * as THREE from 'three';
import { mergeGeos } from './buildings.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// 部位：0胴 1頭 2左脚 3右脚 4左腕 5右腕   材質：0上着 1脚衣 2肌 3帽子・兜 4木 5鉄 6外套
// 武器：1槍 2長槍 3剣 4弓 5弩 6熊手 7盾 8杖 9旗
function part(geo, partId, mat, weap = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(partId), 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Array(n).fill(mat), 1));
  g.setAttribute('aWeap', new THREE.Float32BufferAttribute(new Array(n).fill(weap), 1));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function humanGeometry() {
  const L = [];
  // 胴（少し台形）
  const torso = new THREE.CylinderGeometry(0.19, 0.16, 0.62, 6, 1).scale(1.15, 1, 0.7).translate(0, 1.26, 0);
  L.push(part(torso, 0, 0));
  L.push(part(box(0.34, 0.12, 0.2, 0, 0.98, 0), 0, 1)); // 腰
  L.push(part(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 5).translate(0, 1.6, 0), 1, 2)); // 首
  L.push(part(new THREE.IcosahedronGeometry(0.115, 1).scale(0.9, 1.08, 0.98).translate(0, 1.71, 0.005), 1, 2)); // 頭
  L.push(part(new THREE.SphereGeometry(0.125, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 1.73, -0.005), 1, 3)); // 髪・帽子・兜
  // 脚：股関節が軸
  for (const s of [1, -1]) {
    const leg = new THREE.CylinderGeometry(0.075, 0.06, 0.9, 5).translate(s * 0.1, 0.5, 0);
    L.push(part(leg, s > 0 ? 2 : 3, 1));
    L.push(part(box(0.11, 0.08, 0.24, s * 0.1, 0.04, 0.05), s > 0 ? 2 : 3, 4)); // 靴
  }
  // 腕：肩が軸
  for (const s of [1, -1]) {
    const arm = new THREE.CylinderGeometry(0.055, 0.045, 0.64, 5).translate(s * 0.25, 1.22, 0);
    L.push(part(arm, s > 0 ? 4 : 5, 0));
    L.push(part(new THREE.IcosahedronGeometry(0.05, 0).translate(s * 0.25, 0.88, 0), s > 0 ? 4 : 5, 2)); // 手
  }
  // 武器（右手 = 部位5、手の位置 (-0.25, 0.88, 0)）
  const hand = (g) => g.translate(-0.25, 0.88, 0);
  L.push(part(hand(new THREE.CylinderGeometry(0.022, 0.022, 2.4, 4).translate(0, 0.5, 0)), 5, 4, 1));
  L.push(part(hand(new THREE.ConeGeometry(0.05, 0.25, 4).translate(0, 1.82, 0)), 5, 5, 1));
  L.push(part(hand(new THREE.CylinderGeometry(0.025, 0.025, 4.6, 4).translate(0, 1.4, 0)), 5, 4, 2));
  L.push(part(hand(new THREE.ConeGeometry(0.05, 0.3, 4).translate(0, 3.85, 0)), 5, 5, 2));
  L.push(part(hand(box(0.05, 0.85, 0.02, 0, 0.42, 0)), 5, 5, 3));
  L.push(part(hand(box(0.2, 0.03, 0.05, 0, 0.0, 0)), 5, 4, 3));
  const bow = new THREE.TorusGeometry(0.7, 0.018, 3, 10, Math.PI * 0.75).rotateZ(Math.PI * 0.125).rotateY(Math.PI / 2).translate(0, 0, -0.55);
  L.push(part(hand(bow.translate(0, 0.0, 0.45)), 5, 4, 4));
  L.push(part(hand(box(0.06, 0.06, 0.75, 0, 0, 0.3)), 5, 4, 5));
  L.push(part(hand(box(0.7, 0.04, 0.05, 0, 0, 0.55)), 5, 4, 5));
  L.push(part(hand(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 4).translate(0, 0.4, 0)), 5, 4, 6));
  L.push(part(hand(box(0.3, 0.025, 0.025, 0, 1.36, 0)), 5, 5, 6));
  for (const x of [-0.13, 0, 0.13]) L.push(part(hand(box(0.02, 0.22, 0.02, x, 1.47, 0)), 5, 5, 6));
  // 盾は左腕に
  L.push(part(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 8).rotateZ(Math.PI / 2).translate(0.33, 1.08, 0.08), 4, 5, 7));
  L.push(part(hand(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 4).translate(0, 0.45, 0)), 5, 4, 8));
  L.push(part(hand(new THREE.IcosahedronGeometry(0.07, 0).translate(0, 1.32, 0)), 5, 6, 8));
  L.push(part(hand(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 4).translate(0, 1.0, 0)), 5, 4, 9));
  L.push(part(hand(box(0.02, 0.6, 0.8, 0, 2.2, -0.4)), 5, 6, 9));
  // 外套・長衣（スカート状、iStyle で表示）
  L.push(part(new THREE.CylinderGeometry(0.2, 0.32, 0.85, 7, 1, true).translate(0, 0.55, 0), 0, 6, 10));
  return mergeAll(L);
}
function mergeAll(list) {
  const out = new THREE.BufferGeometry();
  const attrs = ['position', 'normal', 'aPart', 'aMat', 'aWeap'];
  for (const a of attrs) {
    const size = list[0].attributes[a].itemSize;
    let n = 0; for (const g of list) n += g.attributes[a].count;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[a].array, o); o += g.attributes[a].array.length; }
    out.setAttribute(a, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

const HUMAN_GLSL_V = /* glsl */`
attribute float aPart; attribute float aMat; attribute float aWeap;
attribute vec4 iAnim;   // 位相, 振り幅, 姿勢, 武器
attribute vec4 iColA;   // 上着 rgb, 帽子の種類
attribute vec4 iColB;   // 脚衣 rgb, 肌の濃さ
varying vec3 vCol; varying float vHide;
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
`;
const HUMAN_BEGIN = /* glsl */`
  vec3 transformed = position;
  vec3 nrm = objectNormal;
  float ph = iAnim.x, amp = iAnim.y, pose = iAnim.z, weap = iAnim.w;
  // 武器・外套の出し分け
  vHide = 0.0;
  if (aWeap > 0.5 && aWeap < 9.5 && abs(aWeap - weap) > 0.5 && !(aWeap > 6.5 && aWeap < 7.5 && weap > 2.5 && weap < 3.5)) vHide = 1.0;
  if (aWeap > 9.5 && iColA.w < 2.5) vHide = 1.0;
  float legA = 0.0, armL = 0.0, armR = 0.0, armRz = 0.0, armLz = 0.0, lean = 0.0, bob = 0.0, kneel = 0.0;
  float s1 = sin(ph);
  if (pose < 0.5) { armL = 0.05*sin(ph*0.3); armR = -armL; }
  else if (pose < 1.5) { legA = s1*0.45*amp; armL = -s1*0.4*amp; armR = s1*0.4*amp; bob = abs(cos(ph))*0.03; }
  else if (pose < 2.5) { legA = s1*0.85*amp; armL = -s1*0.9*amp; armR = s1*0.9*amp; lean = 0.25; bob = abs(cos(ph))*0.07; }
  else if (pose < 3.5) { float k = max(0.0, sin(ph)); armR = 0.6 + 1.0*k; lean = 0.15*k; legA = 0.25; }       // 突く・斬る
  else if (pose < 4.5) { armR = 1.45; armL = 1.45; armLz = 0.25; armRz = -0.2 - 0.25*max(0.0, sin(ph)); }      // 射る
  else if (pose < 5.5) { armL = 2.6 + 0.3*sin(ph*3.0); armR = 2.6 + 0.3*sin(ph*3.0 + 1.0); legA = s1*0.85*amp; lean = -0.05; bob = abs(cos(ph))*0.06; } // 逃げまどう
  else if (pose < 7.5) { }  // 倒れている（下で処理）
  else if (pose < 8.5) { legA = 0.0; kneel = 1.0; armL = 0.4; armR = 0.4; }  // 騎乗（足を開く）
  else { kneel = 0.6; armL = 0.8 + 0.3*sin(ph); armR = 0.8 + 0.3*sin(ph + 1.5); }  // 砲手：屈む
  int p = int(aPart + 0.5);
  if (p == 2 || p == 3) {
    float a = p == 2 ? legA : -legA;
    vec3 piv = vec3(0.0, 0.95, 0.0);
    mat3 R = rotX(-a);
    if (pose > 7.5 && pose < 8.5) R = rotZ((p == 2 ? 1.0 : -1.0) * 0.55) * rotX(-1.25);
    transformed = piv + R * (transformed - piv); nrm = R * nrm;
  } else if (p == 4 || p == 5) {
    float a = p == 4 ? armL : armR, az = p == 4 ? armLz : armRz;
    vec3 piv = vec3(p == 4 ? 0.25 : -0.25, 1.52, 0.0);
    mat3 R = rotZ(az) * rotX(-a);
    transformed = piv + R * (transformed - piv); nrm = R * nrm;
  }
  // 体の前傾
  if (p != 2 && p != 3) { vec3 piv = vec3(0.0, 0.95, 0.0); mat3 R = rotX(lean); transformed = piv + R * (transformed - piv); nrm = R * nrm; }
  transformed.y += bob - kneel*0.35;
  if (pose > 5.5 && pose < 7.5) {
    // 倒れて横たわる（仰向け／うつ伏せ）
    float k = pose < 6.5 ? 1.0 : clamp(fract(ph), 0.0, 1.0);
    mat3 R = rotX(-1.52 * k);
    transformed = R * transformed; nrm = R * nrm;
    transformed.y += 0.12 * k;
  }
  if (vHide > 0.5) transformed = vec3(0.0);
  objectNormal = nrm;
  transformedNormal = normalMatrix * (mat3(instanceMatrix) * nrm);
  vNormal = normalize( transformedNormal );
`;
function humanMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HUMAN_GLSL_V)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <normal_vertex>', '')
      .replace('#include <begin_vertex>', HUMAN_BEGIN + `
        vec3 cc;
        int mt = int(aMat + 0.5);
        vec3 skin = mix(vec3(0.62,0.42,0.32), vec3(0.28,0.17,0.11), iColB.w);
        if (mt == 0) cc = iColA.rgb; else if (mt == 1) cc = iColB.rgb; else if (mt == 2) cc = skin;
        else if (mt == 3) cc = iColA.w < 0.5 ? vec3(0.12,0.08,0.05) : iColA.w < 1.5 ? vec3(0.42,0.43,0.45) : iColA.w < 2.5 ? iColA.rgb*0.7 : iColA.rgb*0.6;
        else if (mt == 4) cc = vec3(0.24,0.16,0.09); else if (mt == 5) cc = vec3(0.5,0.5,0.52); else cc = iColA.rgb*0.8;
        vCol = cc * (iAnim.z > 5.5 && iAnim.z < 6.5 ? 0.45 : 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCol; varying float vHide;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n if (vHide > 0.5) discard; diffuseColor.rgb = vCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = 0.85;');
  };
  m.customProgramCacheKey = () => 'human';
  return m;
}

/* ---------- 人の群れ（インスタンス） ---------- */
export class Humans {
  constructor(engine, max) {
    this.max = max;
    const g = humanGeometry();
    const geo = new THREE.InstancedBufferGeometry().copy(g);
    this.iAnim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iColA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iColB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAnim', this.iAnim); geo.setAttribute('iColA', this.iColA); geo.setAttribute('iColB', this.iColB);
    this.mesh = new THREE.InstancedMesh(geo, humanMaterial(engine), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // 影は簡易（胴の箱）
    engine.scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  // pose: 0立つ 1歩く 2走る 3突く 4射る 5逃げまどう 6死体 7倒れていく 8騎乗 9砲手
  push(x, y, z, yaw, pose, ph, amp, weap, colA, colB, scale = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    _q.setFromAxisAngle(UP, yaw); _p.set(x, y, z); _s.setScalar(scale);
    this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.iAnim.setXYZW(i, ph, amp, pose, weap);
    this.iColA.setXYZW(i, colA[0], colA[1], colA[2], colA[3]);
    this.iColB.setXYZW(i, colB[0], colB[1], colB[2], colB[3]);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.iAnim, this.iColA, this.iColB]) { a.needsUpdate = true; a.clearUpdateRanges(); if (this.n) a.addUpdateRange(0, this.n * 4); }
    this.mesh.instanceMatrix.clearUpdateRanges(); if (this.n) this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
  }
}

/* ---------- 馬 ---------- */
function horseGeometry() {
  const L = [];
  const P = (g, partId, mat) => part(g, partId, mat);
  L.push(P(new THREE.CylinderGeometry(0.42, 0.4, 1.7, 7).rotateX(Math.PI / 2).scale(0.85, 1.05, 1).translate(0, 1.45, 0), 0, 0));
  L.push(P(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 6).rotateX(-0.7).translate(0, 1.95, 0.95), 1, 0));
  L.push(P(new THREE.CylinderGeometry(0.11, 0.18, 0.62, 6).rotateX(Math.PI / 2 + 0.5).translate(0, 2.3, 1.42), 1, 0));
  L.push(P(new THREE.CylinderGeometry(0.06, 0.12, 0.8, 5).rotateX(0.5).translate(0, 1.3, -1.1), 0, 1)); // 尾
  L.push(P(box(0.86, 0.12, 0.7, 0, 1.9, -0.05), 0, 2)); // 鞍・馬衣
  // 脚：0前左 1前右 2後左 3後右 → 部位 2..5
  [[0.22, 0.65], [-0.22, 0.65], [0.22, -0.62], [-0.22, -0.62]].forEach(([x, z], k) => {
    L.push(P(new THREE.CylinderGeometry(0.08, 0.055, 1.2, 5).translate(x, 0.62, z), 2 + k, 0));
    L.push(P(box(0.12, 0.1, 0.14, x, 0.05, z + 0.02), 2 + k, 1));
  });
  return mergeAll(L);
}
export class Horses {
  constructor(engine, max) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry().copy(horseGeometry());
    this.iAnim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iAnim', this.iAnim);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aMat; attribute vec4 iAnim; varying vec3 vCol;\nmat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );')
        .replace('#include <begin_vertex>', `vec3 transformed = position;
          float ph = iAnim.x, amp = iAnim.y, dead = iAnim.z;
          int p = int(aPart + 0.5);
          if (p >= 2) {
            float off = p == 2 ? 0.0 : p == 3 ? 0.5 : p == 4 ? 0.3 : 0.8;
            float a = sin(ph + off*6.283) * 0.7 * amp;
            vec3 piv = vec3(0.0, 1.2, p < 4 ? 0.65 : -0.62);
            mat3 R = rotX(a); transformed = piv + R*(transformed - piv); objectNormal = R*objectNormal;
          }
          transformed.y += abs(sin(ph))*0.12*amp;
          if (dead > 0.5) { float c = cos(1.5), s = sin(1.5); transformed = vec3(transformed.x*c - transformed.y*s, transformed.x*s + transformed.y*c, transformed.z); transformed.y += 0.45; }
          int mt = int(aMat + 0.5);
          vCol = mt == 0 ? mix(vec3(0.22,0.13,0.07), vec3(0.06,0.05,0.045), iAnim.w) : mt == 1 ? vec3(0.04) : mix(vec3(0.55,0.08,0.06), vec3(0.08,0.12,0.4), step(0.5, fract(iAnim.w*7.0)));`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCol;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vCol;');
    };
    m.customProgramCacheKey = () => 'horse';
    this.mesh = new THREE.InstancedMesh(geo, m, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    engine.scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, yaw, ph, amp, dead, coat) {
    if (this.n >= this.max) return;
    const i = this.n++;
    _q.setFromAxisAngle(UP, yaw); _p.set(x, y, z); _s.setScalar(1);
    this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.iAnim.setXYZW(i, ph, amp, dead ? 1 : 0, coat);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true; this.iAnim.needsUpdate = true;
  }
}

/* ---------- 攻城兵器・大砲 ---------- */
const WOOD = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
const IRON = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.45, metalness: 0.7 });
const BRONZE = new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.35, metalness: 0.85 });
function wheel(r, x, z) { return new THREE.CylinderGeometry(r, r, 0.12, 12).rotateZ(Math.PI / 2).translate(x, r, z); }
function geoCannonBase() {
  return mergeGeos([box(0.7, 0.3, 2.0, 0, 0.75, -0.2), box(0.12, 0.5, 1.4, 0.3, 0.85, 0.1), box(0.12, 0.5, 1.4, -0.3, 0.85, 0.1), box(0.25, 0.18, 1.6, 0, 0.35, -1.2).rotateX(-0.25), wheel(0.65, 0.48, 0.2), wheel(0.65, -0.48, 0.2)].map(stripUV));
}
function geoCannonBarrel(L, r) {
  const g = new THREE.CylinderGeometry(r * 0.85, r, L, 12).rotateX(Math.PI / 2).translate(0, 0, L * 0.35);
  const ring = new THREE.TorusGeometry(r * 1.02, r * 0.18, 4, 12).translate(0, 0, -L * 0.15 + L * 0.35);
  const muzzle = new THREE.TorusGeometry(r * 0.9, r * 0.2, 4, 12).translate(0, 0, L * 0.85);
  return mergeGeos([g, ring, muzzle].map(stripUV));
}
function geoBallista() {
  return mergeGeos([box(0.5, 0.9, 0.5, 0, 0.45, 0), box(0.3, 0.25, 3.2, 0, 1.05, 0.4), box(3.4, 0.16, 0.16, 0, 1.15, 1.6), box(0.12, 0.6, 0.12, 1.5, 1.1, 1.4), box(0.12, 0.6, 0.12, -1.5, 1.1, 1.4)].map(stripUV));
}
function geoTrebFrame() {
  const parts = [box(4.2, 0.4, 7.5, 0, 0.2, 0)];
  for (const x of [-1.6, 1.6]) { parts.push(box(0.4, 9.2, 0.45, x, 4.8, 1.4).rotateX(0.18).translate(0, 0, -0.6)); parts.push(box(0.4, 9.2, 0.45, x, 4.8, -1.4).rotateX(-0.18).translate(0, 0, 0.6)); }
  parts.push(box(3.6, 0.3, 0.3, 0, 9.2, 0));
  return mergeGeos(parts.map(stripUV));
}
function geoTrebArm() {
  return mergeGeos([box(0.32, 0.32, 14, 0, 0, 3.5), box(2.4, 2.2, 2.2, 0, -1.6, -3.3)].map(stripUV));
}
function stripUV(g) { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q; }
export class Machines {
  constructor(engine) {
    this.scene = engine.scene;
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; engine.scene.add(m); return m; };
    this.cBase = mk(geoCannonBase(), WOOD, 64);
    this.cBarrel = mk(geoCannonBarrel(2.6, 0.24), BRONZE, 64);
    this.ball = mk(geoBallista(), WOOD, 48);
    this.tFrame = mk(geoTrebFrame(), WOOD, 12);
    this.tArm = mk(geoTrebArm(), WOOD, 12);
    this.bBase = mk(mergeGeos([box(2.6, 1.0, 7.5, 0, 0.5, 0), box(3.2, 0.5, 1.0, 0, 0.25, -3.0), box(3.2, 0.5, 1.0, 0, 0.25, 3.0)].map(stripUV)), WOOD, 2);
    this.bBarrel = mk(geoCannonBarrel(6.2, 0.95), IRON, 2);
    this.wreck = mk(mergeGeos([box(1.6, 0.5, 2.2, 0, 0.25, 0).rotateZ(0.3), box(0.8, 0.3, 1.6, 0.6, 0.15, 0.7).rotateY(0.6)].map(stripUV)), new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 1 }), 96);
  }
  begin() { for (const k of ['cBase', 'cBarrel', 'ball', 'tFrame', 'tArm', 'bBase', 'bBarrel', 'wreck']) this[k].count = 0; }
  put(mesh, x, y, z, yaw, pitch = 0, roll = 0, sc = 1, off = null) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z);
    if (off) _p.add(new THREE.Vector3(...off).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, yaw)));
    _s.setScalar(sc);
    mesh.setMatrixAt(mesh.count++, _m.compose(_p, _q, _s));
  }
  cannon(x, y, z, yaw, pitch, recoil) {
    this.put(this.cBase, x, y, z, yaw);
    this.put(this.cBarrel, x, y + 1.15, z, yaw, -pitch, 0, 1, [0, 0, -recoil * 0.5]);
  }
  ballista(x, y, z, yaw, pitch) { this.put(this.ball, x, y, z, yaw, -pitch * 0.5); }
  trebuchet(x, y, z, yaw, arm) {
    this.put(this.tFrame, x, y, z, yaw);
    this.put(this.tArm, x, y + 9.2, z, yaw, arm);
  }
  bombard(x, y, z, yaw, pitch, recoil) {
    this.put(this.bBase, x, y, z, yaw);
    this.put(this.bBarrel, x, y + 1.7, z, yaw, -pitch, 0, 1, [0, 0, -1.2 - recoil * 1.2]);
  }
  wrecked(x, y, z, yaw, sc = 1) { this.put(this.wreck, x, y, z, yaw, 0, 0, sc); }
  end() { for (const k of ['cBase', 'cBarrel', 'ball', 'tFrame', 'tArm', 'bBase', 'bBarrel', 'wreck']) this[k].instanceMatrix.needsUpdate = true; }
}
