// 炎・煙・土煙・火の粉・瓦礫・地面の跡・飛び道具・光線・稲妻。すべて少数の描画呼び出しにまとめる。
import * as THREE from 'three';
import { groundH, groundNormal } from './world.js';
import { GLSL_NOISE, clamp, lerp, rand } from './noise.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/* ---------- 粒子：種類ごとの性質 ---------- */
// add=加算合成  g=重力  drag=空気抵抗  s0,s1=大きさ  life=寿命  up=上昇
export const PT = {
  fire: { add: 1, g: -6, drag: 1.4, s0: 1, s1: 0.4, life: 1.1, col: [1, 0.55, 0.18], type: 0 },
  flame: { add: 1, g: -3, drag: 2.5, s0: 1, s1: 1.6, life: 0.7, col: [1, 0.5, 0.15], type: 0 },
  ember: { add: 1, g: -2, drag: 0.6, s0: 0.25, s1: 0.1, life: 2.4, col: [1, 0.5, 0.12], type: 2 },
  spark: { add: 1, g: 9.8, drag: 0.2, s0: 0.3, s1: 0.1, life: 0.9, col: [1, 0.8, 0.4], type: 2 },
  flash: { add: 1, g: 0, drag: 0, s0: 1, s1: 1.8, life: 0.18, col: [1, 0.85, 0.6], type: 1 },
  glow: { add: 1, g: 0, drag: 3, s0: 1, s1: 0.2, life: 0.5, col: [1, 0.6, 0.3], type: 1 },
  magic: { add: 1, g: 0, drag: 0.5, s0: 1, s1: 0.3, life: 0.6, col: [0.6, 0.8, 1], type: 1 },
  smoke: { add: 0, g: -1.6, drag: 0.5, s0: 1, s1: 3.2, life: 9, col: [0.16, 0.15, 0.14], type: 0, a: 0.55 },
  bsmoke: { add: 0, g: -2.8, drag: 0.35, s0: 1, s1: 4.5, life: 16, col: [0.07, 0.065, 0.06], type: 0, a: 0.7 },
  dust: { add: 0, g: 0.6, drag: 1.3, s0: 1, s1: 2.6, life: 5, col: [0.42, 0.36, 0.28], type: 0, a: 0.6 },
  gsmoke: { add: 0, g: -0.8, drag: 0.8, s0: 1, s1: 2.5, life: 3.2, col: [0.82, 0.8, 0.76], type: 0, a: 0.6 },
  poison: { add: 0, g: 0.05, drag: 0.9, s0: 1, s1: 2.8, life: 7, col: [0.38, 0.62, 0.12], type: 0, a: 0.5 },
  curse: { add: 0, g: -0.6, drag: 0.9, s0: 1, s1: 2.6, life: 4.5, col: [0.12, 0.04, 0.2], type: 0, a: 0.75 },
  steam: { add: 0, g: -2.5, drag: 0.6, s0: 1, s1: 3, life: 4, col: [0.85, 0.87, 0.9], type: 0, a: 0.4 },
  water: { add: 0, g: 9.8, drag: 0.4, s0: 1, s1: 1.8, life: 1.6, col: [0.75, 0.82, 0.86], type: 0, a: 0.6 },
};

const PART_VERT = /* glsl */`
attribute vec4 aPos; attribute vec4 aCol; attribute vec4 aMisc; // pos: xyz+大きさ  misc: 回転, 種類, 寿命比, 乱数
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; varying float vFog;
uniform float uFogD;
void main(){
  vUv = position.xy;
  vCol = aCol; vMisc = aMisc;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aMisc.x), s = sin(aMisc.x);
  vec2 p = vec2(position.x*c - position.y*s, position.x*s + position.y*c) * aPos.w;
  vec3 wp = aPos.xyz + right*p.x + up*p.y;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFog = 1.0 - exp(-uFogD*uFogD*d*d);
}`;
const PART_FRAG = /* glsl */`
varying vec2 vUv; varying vec4 vCol; varying vec4 vMisc; varying float vFog;
uniform float uAdd; uniform vec3 uFogC; uniform float uNight; uniform vec3 uAmb; uniform vec3 uSun;
${GLSL_NOISE}
void main(){
  float r = length(vUv);
  if (r > 1.0) discard;
  float life = vMisc.z, seed = vMisc.w, type = vMisc.y;
  vec3 col; float a;
  if (uAdd > 0.5) {
    if (type < 0.5) {
      // 炎：上へ伸びる揺らぎ
      vec2 q = vUv; q.y -= 0.15;
      float n = vnoise(q*3.0 + vec2(seed*17.0, -life*6.0 - seed*9.0));
      float m = smoothstep(1.0, 0.15, length(q*vec2(1.0, 0.75)) + (n-0.5)*0.7);
      float hot = smoothstep(0.5, 1.0, m) * (1.0 - life);
      col = vCol.rgb * (0.4 + hot*0.7) + vec3(1.0,0.65,0.25)*hot*0.22;
      col *= m * (1.0 - smoothstep(0.4, 1.0, life)) * 0.62;
      a = 1.0;
    } else if (type < 1.5) {
      float m = exp(-r*r*5.0);
      col = vCol.rgb * m * 0.6 * (1.0 - life*life);
      a = 1.0;
    } else {
      float m = smoothstep(1.0, 0.0, r);
      col = vCol.rgb * m * m * 3.0 * (1.0 - life);
      a = 1.0;
    }
    col *= 1.0 - vFog*0.85;
    gl_FragColor = vec4(col, 1.0);
  } else {
    float n = vnoise(vUv*2.3 + vec2(seed*31.0, seed*7.0 + life*0.6)) * 0.6 + vnoise(vUv*5.0 + seed*13.0)*0.4;
    float m = smoothstep(1.0, 0.25, r + (n-0.5)*0.55);
    a = m;
    a *= smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.6, 1.0, life)) * vCol.a;
    // 簡単な陰影：上が明るい
    float lit = 0.6 + 0.4*clamp(vUv.y*0.5 + 0.5 + (n-0.5)*0.4, 0.0, 1.0);
    col = vCol.rgb * (uAmb + uSun*lit);
    col = mix(col, uFogC, vFog);
    gl_FragColor = vec4(col, a);
  }
}`;

class ParticlePool {
  constructor(engine, max, additive) {
    this.max = max; this.n = 0;
    this.P = new Float32Array(max * 3); this.V = new Float32Array(max * 3);
    this.L = new Float32Array(max * 4); // life, maxLife, s0, s1
    this.C = new Float32Array(max * 4); // rgb, alpha
    this.M = new Float32Array(max * 4); // rot, type, rotSpeed, seed
    this.K = new Array(max);            // 種類
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aMisc', this.aMisc);
    g.instanceCount = 0;
    this.uni = { uAdd: { value: additive ? 1 : 0 }, uFogD: { value: 0 }, uFogC: { value: new THREE.Color() }, uNight: engine.uniforms.uNight, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) }, uSun: { value: new THREE.Color(0.6, 0.6, 0.6) } };
    const m = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: this.uni, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.geo = g;
    engine.scene.add(this.mesh);
  }
  spawn(kind, x, y, z, vx, vy, vz, size, life, col, alpha) {
    if (this.n >= this.max) return -1;
    const T = PT[kind];
    const i = this.n++;
    this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z;
    this.V[i * 3] = vx; this.V[i * 3 + 1] = vy; this.V[i * 3 + 2] = vz;
    this.L[i * 4] = 0; this.L[i * 4 + 1] = (life || T.life) * (0.8 + Math.random() * 0.4); this.L[i * 4 + 2] = size * T.s0; this.L[i * 4 + 3] = size * T.s1;
    const c = col || T.col;
    const tint = 0.85 + Math.random() * 0.3;
    this.C[i * 4] = c[0] * tint; this.C[i * 4 + 1] = c[1] * tint; this.C[i * 4 + 2] = c[2] * tint; this.C[i * 4 + 3] = alpha != null ? alpha : T.a || 1;
    this.M[i * 4] = Math.random() * 6.28; this.M[i * 4 + 1] = T.type; this.M[i * 4 + 2] = (Math.random() - 0.5) * 0.6; this.M[i * 4 + 3] = Math.random();
    this.K[i] = T;
    return i;
  }
  update(dt, wind) {
    const P = this.P, V = this.V, L = this.L, C = this.C, M = this.M, K = this.K;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      L[i * 4] += dt;
      if (L[i * 4] >= L[i * 4 + 1]) {
        n--;
        if (i !== n) {
          for (let k = 0; k < 3; k++) { P[i * 3 + k] = P[n * 3 + k]; V[i * 3 + k] = V[n * 3 + k]; }
          for (let k = 0; k < 4; k++) { L[i * 4 + k] = L[n * 4 + k]; C[i * 4 + k] = C[n * 4 + k]; M[i * 4 + k] = M[n * 4 + k]; }
          K[i] = K[n];
        }
        i--; continue;
      }
      const T = K[i];
      const dr = Math.exp(-T.drag * dt);
      V[i * 3] = V[i * 3] * dr + wind[0] * (1 - dr) * (T.add ? 0.3 : 1);
      V[i * 3 + 1] = V[i * 3 + 1] * dr - T.g * dt;
      V[i * 3 + 2] = V[i * 3 + 2] * dr + wind[1] * (1 - dr) * (T.add ? 0.3 : 1);
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (T.g > 0 && P[i * 3 + 1] < this.floor(i)) { P[i * 3 + 1] = this.floor(i); V[i * 3 + 1] *= -0.2; V[i * 3] *= 0.5; V[i * 3 + 2] *= 0.5; }
      M[i * 4] += M[i * 4 + 2] * dt;
    }
    this.n = n;
    const ap = this.aPos.array, ac = this.aCol.array, am = this.aMisc.array;
    for (let i = 0; i < n; i++) {
      const u = L[i * 4] / L[i * 4 + 1];
      ap[i * 4] = P[i * 3]; ap[i * 4 + 1] = P[i * 3 + 1]; ap[i * 4 + 2] = P[i * 3 + 2];
      ap[i * 4 + 3] = L[i * 4 + 2] + (L[i * 4 + 3] - L[i * 4 + 2]) * Math.sqrt(u);
      ac[i * 4] = C[i * 4]; ac[i * 4 + 1] = C[i * 4 + 1]; ac[i * 4 + 2] = C[i * 4 + 2]; ac[i * 4 + 3] = C[i * 4 + 3];
      am[i * 4] = M[i * 4]; am[i * 4 + 1] = M[i * 4 + 1]; am[i * 4 + 2] = u; am[i * 4 + 3] = M[i * 4 + 3];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true;
    this.aPos.clearUpdateRanges(); this.aCol.clearUpdateRanges(); this.aMisc.clearUpdateRanges();
    if (n) { this.aPos.addUpdateRange(0, n * 4); this.aCol.addUpdateRange(0, n * 4); this.aMisc.addUpdateRange(0, n * 4); }
  }
  floor(i) {
    // 落ちる粒子は地面で止まる（簡易：16個に1回だけ地面を調べる）
    if (!this._fl || this._fl.length < this.max) this._fl = new Float32Array(this.max).fill(-1e9);
    if ((i + this._tick) % 16 === 0 || this._fl[i] < -1e8) this._fl[i] = groundH(this.P[i * 3], this.P[i * 3 + 2]);
    return this._fl[i];
  }
}

/* ---------- 瓦礫（物理つきの破片） ---------- */
class Debris {
  constructor(engine, max) {
    this.max = max; this.list = [];
    const g = new THREE.IcosahedronGeometry(0.6, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + Math.random() * 0.5), p.getY(i) * (0.6 + Math.random() * 0.5), p.getZ(i) * (0.8 + Math.random() * 0.5));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.95 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    engine.scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, size, col) {
    let d;
    if (this.list.length >= this.max) { d = this.list.shift(); } else d = {};
    d.p = new THREE.Vector3(x, y, z); d.v = new THREE.Vector3(vx, vy, vz); d.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0));
    d.w = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); d.ws = rand(2, 8);
    d.s = size; d.col = col; d.t = 0; d.rest = false; d.sink = 0;
    d.sc = new THREE.Vector3(size * rand(0.7, 1.4), size * rand(0.5, 1), size * rand(0.7, 1.4));
    this.list.push(d);
  }
  update(dt) {
    const L = this.list;
    for (let k = L.length - 1; k >= 0; k--) {
      const d = L[k];
      d.t += dt;
      if (!d.rest) {
        d.v.y -= 9.8 * dt;
        d.p.addScaledVector(d.v, dt);
        d.q.multiply(_q.setFromAxisAngle(d.w, d.ws * dt));
        const gy = groundH(d.p.x, d.p.z) + d.s * 0.3;
        if (d.p.y < gy) {
          d.p.y = gy;
          if (Math.abs(d.v.y) < 2.5) { d.rest = true; }
          d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; d.ws *= 0.5;
        }
      } else if (d.t > 40) { d.sink += dt * 0.2; if (d.sink > 1) { L.splice(k, 1); continue; } }
    }
    for (let i = 0; i < L.length; i++) {
      const d = L[i];
      _s.copy(d.sc).multiplyScalar(1 - d.sink);
      this.mesh.setMatrixAt(i, _m.compose(d.p, d.q, _s));
      this.mesh.setColorAt(i, _c.setRGB(d.col[0], d.col[1], d.col[2]));
    }
    this.mesh.count = L.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ---------- 地面の跡（足跡・焦げ・穴） ---------- */
const DECAL_N = 6;
class Decals {
  constructor(engine, max) {
    this.max = max; this.i = 0; this.count = 0;
    const nv = (DECAL_N + 1) * (DECAL_N + 1);
    this.nv = nv;
    const pos = new Float32Array(max * nv * 3), uv = new Float32Array(max * nv * 2), dat = new Float32Array(max * nv * 4);
    const idx = [];
    for (let d = 0; d < max; d++) {
      for (let j = 0; j < DECAL_N; j++) for (let i = 0; i < DECAL_N; i++) {
        const a = d * nv + j * (DECAL_N + 1) + i, b = a + 1, c = a + DECAL_N + 1, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDat', new THREE.BufferAttribute(dat, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = engine.uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aDat; varying vec4 vDat; varying vec2 vUv2;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDat = aDat; vUv2 = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec4 vDat; varying vec2 vUv2;\n' + GLSL_NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 q = vUv2*2.0 - 1.0; float r = length(q);
          float n = vnoise(q*4.0 + vDat.z*13.0)*0.5 + vnoise(q*11.0 + vDat.z*7.0)*0.5;
          float type = vDat.x, age = vDat.y, hot = vDat.w;
          float a = 0.0; vec3 c = vec3(0.0);
          if (type < 0.5) { // 足跡・穴：押し固められた暗い土、縁にめくれた土
            vec2 qq = q * vec2(1.25, 0.85);
            float rr = length(qq) + (n-0.5)*0.4;
            a = smoothstep(1.0, 0.72, rr) * 0.7;
            c = mix(vec3(0.03,0.026,0.02), vec3(0.075,0.062,0.045), smoothstep(0.55, 0.95, rr) + (n-0.5)*0.3);
          } else if (type < 1.5) { // 焦げ
            float rr = r + (n-0.5)*0.5;
            a = smoothstep(1.0, 0.35, rr) * 0.92;
            c = vec3(0.025,0.022,0.02);

          } else if (type < 2.5) { // 毒の染み
            float rr = r + (n-0.5)*0.5;
            a = smoothstep(1.0, 0.4, rr) * 0.8; c = vec3(0.12,0.2,0.03);
          } else { // 血や煤ではなく、泥はね
            float rr = r + (n-0.5)*0.7;
            a = smoothstep(1.0, 0.5, rr) * 0.7; c = vec3(0.13,0.11,0.08);
          }
          a *= 1.0 - smoothstep(0.8, 1.0, age);
          diffuseColor = vec4(c, a);`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (vDat.x > 0.5 && vDat.x < 1.5) { float qq = length(vUv2*2.0-1.0); float nn = vnoise(vUv2*9.0 + vDat.z*5.0); totalEmissiveRadiance += vec3(1.0,0.32,0.04) * vDat.w * smoothstep(0.55, 0.0, qq + (nn-0.5)*0.5) * smoothstep(0.55, 0.8, nn) * 1.4; }');
    };
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.renderOrder = 4;
    this.geo = g;
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.hot = new Float32Array(max);
    engine.scene.add(this.mesh);
  }
  add(type, x, z, r, rot, life = 600, hot = 0) {
    const d = this.i; this.i = (this.i + 1) % this.max; this.count = Math.max(this.count, d + 1);
    const pos = this.geo.attributes.position.array, uv = this.geo.attributes.uv.array, dat = this.geo.attributes.aDat.array;
    const c = Math.cos(rot), s = Math.sin(rot), seed = Math.random();
    for (let j = 0; j <= DECAL_N; j++) for (let i = 0; i <= DECAL_N; i++) {
      const k = d * this.nv + j * (DECAL_N + 1) + i;
      const lx = (i / DECAL_N * 2 - 1) * r, lz = (j / DECAL_N * 2 - 1) * r;
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      pos[k * 3] = wx; pos[k * 3 + 1] = groundH(wx, wz) + 0.18; pos[k * 3 + 2] = wz;
      uv[k * 2] = i / DECAL_N; uv[k * 2 + 1] = j / DECAL_N;
      dat[k * 4] = type; dat[k * 4 + 1] = 0; dat[k * 4 + 2] = seed; dat[k * 4 + 3] = hot;
    }
    this.age[d] = 0; this.life[d] = life; this.hot[d] = hot;
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.uv.needsUpdate = true; a.aDat.needsUpdate = true;
    this.geo.setDrawRange(0, this.count * DECAL_N * DECAL_N * 6);
    if (!this.dirtyN) this.geo.computeBoundingSphere();
  }
  update(dt) {
    const dat = this.geo.attributes.aDat.array;
    let dirty = false;
    this.t = (this.t || 0) + dt;
    if (this.t < 0.5) return;
    const step = this.t; this.t = 0;
    for (let d = 0; d < this.count; d++) {
      if (this.life[d] <= 0) continue;
      this.age[d] += step;
      const u = Math.min(1, this.age[d] / this.life[d]);
      const hot = this.hot[d] * Math.max(0, 1 - this.age[d] / 40);
      for (let k = d * this.nv; k < (d + 1) * this.nv; k++) { dat[k * 4 + 1] = u; dat[k * 4 + 3] = hot; }
      dirty = true;
    }
    if (dirty) this.geo.attributes.aDat.needsUpdate = true;
  }
}

/* ---------- 飛び道具 ---------- */
const PROJ = {
  arrow: { geo: 'stick', len: 1.1, r: 0.04, col: 0x2a2018, trail: null },
  bolt: { geo: 'stick', len: 2.4, r: 0.09, col: 0x2a2018, trail: null },
  ball: { geo: 'ball', r: 0.32, col: 0x111111, trail: null },
  bigball: { geo: 'ball', r: 0.8, col: 0x151515, trail: null },
  stone: { geo: 'rock', r: 0.8, col: 0x6b665c, trail: null },
  glob: { geo: 'ball', r: 2.2, col: 0x000000, emit: true, trail: 'poison' },
  lava: { geo: 'rock', r: 1.6, col: 0x000000, emit: true, trail: 'smoke' },
  orb: { geo: 'ball', r: 0.6, col: 0x000000, emit: true, trail: 'magic' },
};
class Projectiles {
  constructor(engine, fx) {
    this.fx = fx; this.list = [];
    const stick = new THREE.CylinderGeometry(1, 1, 1, 4).rotateX(Math.PI / 2);
    const ball = new THREE.IcosahedronGeometry(1, 1);
    const rock = new THREE.IcosahedronGeometry(1, 0);
    this.meshes = {};
    for (const [k, P] of Object.entries(PROJ)) {
      const g = P.geo === 'stick' ? stick : P.geo === 'ball' ? ball : rock;
      const m = P.emit ? new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) : new THREE.MeshStandardMaterial({ color: P.col, roughness: 0.6, metalness: P.geo === 'ball' ? 0.4 : 0 });
      const mesh = new THREE.InstancedMesh(g, m, k === 'arrow' ? 900 : 120);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (P.emit) mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = P.geo !== 'stick';
      engine.scene.add(mesh);
      this.meshes[k] = mesh;
    }
  }
  // p0 から target へ、飛行時間 T で放物線
  launch(kind, p0, target, T, onHit, opts = {}) {
    const g = opts.g != null ? opts.g : 9.8;
    const v = new THREE.Vector3((target.x - p0.x) / T, (target.y - p0.y) / T + 0.5 * g * T, (target.z - p0.z) / T);
    const pr = { kind, p: p0.clone(), v, g, t: 0, T, onHit, col: opts.col, scale: opts.scale || 1, trailT: 0 };
    this.list.push(pr);
    return pr;
  }
  // 飛行と着弾（シミュレーションの時間で進める）
  step(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      p.v.y -= p.g * dt;
      p.p.addScaledVector(p.v, dt);
      const P = PROJ[p.kind];
      if (P.trail) {
        p.trailT -= dt;
        if (p.trailT <= 0) { p.trailT = p.kind === 'orb' ? 0.012 : P.emit ? 0.03 : 0.05; this.fx.puff(P.trail, p.p.x, p.p.y, p.p.z, 0, 0, 0, p.kind === 'orb' ? 0.7 : P.emit ? 1.6 * p.scale : 0.9, p.kind === 'orb' ? 0.35 : P.emit ? 1.2 : 1.6, p.col); }
      }
      if (p.t >= p.T) { L.splice(i, 1); if (p.onHit) p.onHit(p.p, p); }
    }
  }
  // 描画用の行列を書く
  update() {
    const L = this.list;
    const cnt = {};
    for (const k in this.meshes) cnt[k] = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      const P = PROJ[p.kind];
      const mesh = this.meshes[p.kind];
      const n = cnt[p.kind]++;
      if (n >= mesh.instanceMatrix.count) continue;
      _q.setFromUnitVectors(_v.set(0, 0, 1), _v2.copy(p.v).normalize());
      if (P.geo === 'stick') _s.set(P.r, P.r, P.len); else _s.setScalar(P.r * p.scale);
      mesh.setMatrixAt(n, _m.compose(p.p, _q, _s));
      if (P.emit) mesh.setColorAt(n, _c.setRGB(...(p.col ? p.col.map((x) => x * 3) : [3, 1.4, 0.4])));
    }
    for (const k in this.meshes) { const m = this.meshes[k]; m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}

/* ---------- 光線・稲妻・衝撃波 ---------- */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(1, 0.5, 1) }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uCol; uniform float uK;
      void main(){ float x = abs(vUv.x - 0.5)*2.0; float core = exp(-x*x*18.0); float halo = exp(-x*x*3.0)*0.5;
        float w = 0.75 + 0.25*sin(vUv.y*60.0 - uTime*80.0);
        vec3 c = (uCol*halo*w + vec3(1.0)*core) * 3.0 * uK; gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

export class FX {
  constructor(engine, opts = {}) {
    this.engine = engine;
    const n = engine.q.particles;
    this.add = new ParticlePool(engine, Math.round(n * 0.55), true);
    this.alpha = new ParticlePool(engine, n, false);
    this.debris = new Debris(engine, engine.qname === 'low' ? 200 : 500);
    this.decals = new Decals(engine, engine.qname === 'low' ? 120 : 260);
    this.proj = new Projectiles(engine, this);
    this.wind = [3, 1.2];
    this.tick = 0;
    // 光線（巨獣の必殺）
    this.beamMat = beamMaterial();
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 8), this.beamMat);
    this.beam.visible = false; this.beam.frustumCulled = false; this.beam.renderOrder = 13;
    engine.scene.add(this.beam);
    // 稲妻
    this.boltGeo = new THREE.BufferGeometry();
    this.boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.boltGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(600 * 2), 2).setUsage(THREE.DynamicDrawUsage));
    this.boltMat = beamMaterial(); this.boltMat.uniforms.uCol.value.setRGB(0.6, 0.8, 1);
    this.boltMesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    this.boltMesh.frustumCulled = false; this.boltMesh.renderOrder = 13;
    engine.scene.add(this.boltMesh);
    this.bolts = [];
    // 衝撃波の輪
    this.rings = [];
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 }, uCol: { value: new THREE.Color(1, 0.9, 0.8) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uA; uniform vec3 uCol; void main(){ float r = length(vUv*2.0-1.0); float a = smoothstep(0.8, 0.97, r) * smoothstep(1.0, 0.97, r) * uA; gl_FragColor = vec4(uCol, a); }',
      transparent: true, depthWrite: false,
    });
    // 結界のドーム
    this.lights = [];
    for (let i = 0; i < (engine.qname === 'low' ? 1 : engine.qname === 'high' ? 4 : 2); i++) { const L = new THREE.PointLight(0xff8040, 0, 300, 1.6); L.castShadow = false; engine.scene.add(L); this.lights.push({ L, t: 0, k: 0, i: 0 }); }
    this.flashes = [];
    this.shake = 0;
  }
  // 便利関数
  puff(kind, x, y, z, vx, vy, vz, size, life, col, alpha) {
    const T = PT[kind];
    return (T.add ? this.add : this.alpha).spawn(kind, x, y, z, vx, vy, vz, size, life, col, alpha);
  }
  burst(kind, x, y, z, n, speed, size, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, e = (opts.up != null ? opts.up : 0.5) + Math.random() * (opts.spread != null ? opts.spread : 0.5);
      const s = speed * (0.4 + Math.random() * 0.6);
      const h = Math.sqrt(Math.max(0, 1 - e * e));
      const ox = (opts.r || 0) * (Math.random() - 0.5) * 2, oz = (opts.r || 0) * (Math.random() - 0.5) * 2;
      this.puff(kind, x + ox, y + (opts.ry || 0) * Math.random(), z + oz, Math.cos(a) * h * s, e * s, Math.sin(a) * h * s, size * (0.7 + Math.random() * 0.6), opts.life, opts.col, opts.alpha);
    }
  }
  // 爆発（大砲・岩の着弾など）
  explode(x, y, z, r, opts = {}) {
    const big = r > 8;
    this.burst('flash', x, y + 1, z, 1, 0, r * 1.4);
    if (opts.fire !== false) this.burst('fire', x, y + 0.5, z, Math.min(24, 6 + r * 1.2), r * 2.2, r * 0.45, { up: 0.3, spread: 0.7 });
    this.burst('dust', x, y, z, Math.min(30, 6 + r * 1.5), r * 1.8, r * 0.55, { up: 0.15, spread: 0.6, r: r * 0.3 });
    this.burst(opts.smoke || 'smoke', x, y + 1, z, Math.min(14, 3 + r * 0.6), r * 0.8, r * 0.5, { up: 0.6 });
    this.burst('spark', x, y + 0.5, z, Math.min(30, 6 + r * 2), r * 3, 0.5, { up: 0.5, spread: 0.5 });
    if (opts.debris !== false) for (let i = 0; i < Math.min(14, 2 + r * 0.6); i++) this.debris.spawn(x, y + 0.5, z, rand(-1, 1) * r * 1.4, rand(0.6, 1.2) * r * 1.8, rand(-1, 1) * r * 1.4, rand(0.2, 0.6) * (big ? 1.6 : 1), opts.col || [0.3, 0.27, 0.22]);
    if (opts.decal !== false) this.decals.add(opts.decal || 0, x, z, r * 0.8, Math.random() * 6, 900);
    this.light(x, y + r, z, opts.lightCol || 0xff8840, r * r * 8, 0.35);
  }
  // 建物の倒壊：瓦礫を倒壊方向へ初速付きで飛ばし、粉塵は低速・長寿命で滞留させる。
  // 閃光は火災時のみ（collapse は光らない）。
  collapseFX(x, y, z, r, dirX, dirZ, opts = {}) {
    const dl = Math.hypot(dirX, dirZ) || 1;
    const dx = dirX / dl, dz = dirZ / dl, px = -dz, pz = dx;
    const low = this.engine.qname === 'low';
    const col = opts.col || [0.42, 0.38, 0.32];
    const h = opts.h || Math.max(6, r);
    const nD = Math.round(clamp(r * 1.1, 8, low ? 14 : 24));
    for (let i = 0; i < nD; i++) {
      const along = rand(-0.3, 1) * r * 0.5, side = rand(-1, 1) * r * 0.5;
      const sp = rand(3, 13) * (0.7 + r / 18);
      this.debris.spawn(
        x + dx * along + px * side, y + rand(1, Math.max(2, h * 0.55)), z + dz * along + pz * side,
        dx * sp + px * rand(-3, 3), rand(2, 9), dz * sp + pz * rand(-3, 3),
        rand(0.4, 1.3) * (r > 14 ? 1.4 : 1), col);
    }
    // 滞留する粉塵（低速で倒壊方向へ流れながら広がる）
    const nP = low ? 10 : 18;
    for (let i = 0; i < nP; i++) {
      this.puff('dust', x + rand(-r, r) * 0.6, y + rand(0.5, 3), z + rand(-r, r) * 0.6,
        dx * rand(1, 4) + rand(-1, 1), rand(0.2, 1.0), dz * rand(1, 4) + rand(-1, 1),
        rand(r * 0.5, r * 0.9), rand(7, 12));
    }
    for (let i = 0; i < (low ? 3 : 6); i++) {
      this.puff('gsmoke', x + rand(-r, r) * 0.4, y + rand(2, 5), z + rand(-r, r) * 0.4,
        dx * rand(0.5, 2), rand(0.5, 1.4), dz * rand(0.5, 2), rand(r * 0.4, r * 0.7), rand(6, 9));
    }
    if (opts.fire) {
      this.burst('fire', x, y + 1, z, 12, r * 1.6, r * 0.4, { up: 0.4, spread: 0.6 });
      this.burst('ember', x, y + 3, z, 12, 9, 1);
      this.light(x, y + Math.max(6, h * 0.5), z, 0xff7a30, 1800, 0.5);
    }
  }
  light(x, y, z, col, intensity, dur) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.t <= 0 || l.k < best.k) { best = l; if (l.t <= 0) break; }
    best.L.position.set(x, y, z); best.L.color.set(col); best.k = intensity; best.t = dur; best.dur = dur; best.L.distance = Math.sqrt(intensity) * 18;
  }
  ring(x, z, r1, dur, col) {
    const g = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
    const m = this.ringMat.clone(); if (col) m.uniforms.uCol.value.set(col);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, groundH(x, z) + 1.5, z); mesh.renderOrder = 11;
    this.engine.scene.add(mesh);
    this.rings.push({ mesh, r1, t: 0, dur });
  }
  // 稲妻（上空から地点へ）
  lightning(x, y, z, col) {
    const pts = [];
    let p = new THREE.Vector3(x + rand(-60, 60), y + 600, z + rand(-60, 60));
    const end = new THREE.Vector3(x, y, z);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const q = new THREE.Vector3().lerpVectors(p, end, u);
      if (i > 0 && i < n) { q.x += rand(-1, 1) * 30 * (1 - u * 0.7); q.z += rand(-1, 1) * 30 * (1 - u * 0.7); q.y += rand(-1, 1) * 10; }
      pts.push(q);
    }
    this.bolts.push({ pts, t: 0, dur: 0.35, w: 4 });
    // 枝分かれ
    const k = Math.floor(n * 0.4);
    const br = [pts[k].clone()];
    for (let i = 1; i <= 6; i++) br.push(br[i - 1].clone().add(new THREE.Vector3(rand(-1, 1) * 25, -rand(20, 45), rand(-1, 1) * 25)));
    this.bolts.push({ pts: br, t: 0, dur: 0.25, w: 2 });
    this.light(x, y + 40, z, col || 0xa8c8ff, 6000, 0.3);
    this.skyFlash = 0.6;
  }
  showBeam(a, b, width, col, k) {
    if (!a) { this.beam.visible = false; return; }
    const m = this.beam;
    const d = _v.copy(b).sub(a); const L = d.length();
    m.visible = true;
    m.position.copy(a).add(b).multiplyScalar(0.5);
    // 板をカメラの方に向けつつ光線方向へ伸ばす
    const cam = this.engine.camera.position;
    const y = d.clone().normalize();
    const toCam = _v2.copy(cam).sub(m.position).normalize();
    const x = new THREE.Vector3().crossVectors(y, toCam).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    _m.makeBasis(x, y, z);
    m.quaternion.setFromRotationMatrix(_m);
    m.scale.set(width, L, 1);
    this.beamMat.uniforms.uCol.value.set(col);
    this.beamMat.uniforms.uK.value = k;
  }
  update(dt) {
    this.tick++;
    const e = this.engine;
    // 霧・光の色を粒子に渡す
    for (const P of [this.add, this.alpha]) {
      P._tick = this.tick;
      P.uni.uFogD.value = e.scene.fog.density; P.uni.uFogC.value.copy(e.scene.fog.color);
      const day = 1 - e.night;
      P.uni.uAmb.value.copy(e.hemi.color).multiplyScalar(e.hemi.intensity * 0.55);
      P.uni.uSun.value.copy(e.sun.color).multiplyScalar(e.sun.intensity * 0.22 * day);
    }
    this.add.update(dt, this.wind); this.alpha.update(dt, this.wind);
    this.debris.update(dt);
    this.decals.update(dt);
    this.proj.update();
    this.beamMat.uniforms.uTime.value += dt;
    // 稲妻
    if (this.bolts.length) {
      const pos = this.boltGeo.attributes.position.array, uv = this.boltGeo.attributes.uv.array;
      const cam = e.camera.position;
      let v = 0;
      const idx = [];
      for (let b = this.bolts.length - 1; b >= 0; b--) {
        const B = this.bolts[b]; B.t += dt;
        if (B.t > B.dur) { this.bolts.splice(b, 1); continue; }
        const flick = Math.random() < 0.7 ? 1 : 0.3;
        for (let i = 0; i < B.pts.length - 1 && v < 590; i++) {
          const a = B.pts[i], c = B.pts[i + 1];
          const dir = _v.copy(c).sub(a).normalize();
          const side = _v2.copy(cam).sub(a).cross(dir).normalize().multiplyScalar(B.w * flick);
          const base = v;
          for (const [p, s, u] of [[a, -1, 0], [a, 1, 1], [c, -1, 0], [c, 1, 1]]) { pos[v * 3] = p.x + side.x * s; pos[v * 3 + 1] = p.y + side.y * s; pos[v * 3 + 2] = p.z + side.z * s; uv[v * 2] = u; uv[v * 2 + 1] = 0.5; v++; }
          idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        }
      }
      this.boltGeo.setIndex(idx);
      this.boltGeo.attributes.position.needsUpdate = true; this.boltGeo.attributes.uv.needsUpdate = true;
      this.boltMesh.visible = idx.length > 0;
    } else this.boltMesh.visible = false;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const R = this.rings[i]; R.t += dt;
      const u = R.t / R.dur;
      if (u >= 1) { this.engine.scene.remove(R.mesh); R.mesh.geometry.dispose(); R.mesh.material.dispose(); this.rings.splice(i, 1); continue; }
      R.mesh.scale.setScalar(R.r1 * Math.sqrt(u));
      R.mesh.material.uniforms.uA.value = (1 - u) * 0.8;
    }
    for (const l of this.lights) {
      if (l.t > 0) { l.t -= dt; const target = Math.min(l.k, 8000) * Math.max(0, l.t / l.dur) * (0.25 + e.night * 0.4); l.L.intensity += (target - l.L.intensity) * Math.min(1, dt * 14); }
      else l.L.intensity *= Math.exp(-dt * 14);
    }
    if (this.skyFlash > 0) { this.skyFlash -= dt * 3; }
  }
}
