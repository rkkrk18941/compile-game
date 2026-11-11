// Physically based sky: a single-scattering atmosphere rendered into a small equirect LUT
// whenever the sun moves, a dome that adds the sun disc, tropical cumulus and stars, and
// a PMREM environment for image based lighting. The same scattering model runs in JS so
// fog and light colours follow the sky without GPU read-backs.
import * as THREE from "three";
import { G } from "./shaderlib.js";

export const GLSL_ATMO = /* glsl */ `
#define PI_A 3.14159265
const float R_PLANET = 6371e3;
const float R_ATMO = 6471e3;
const vec3 BETA_R = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const float BETA_M = 21e-6;
const float H_R = 8e3;
const float H_M = 1.2e3;
const float G_M = 0.76;
vec2 rsi(vec3 r0, vec3 rd, float sr){
  float a = dot(rd, rd), b = 2.0 * dot(rd, r0), c = dot(r0, r0) - sr * sr;
  float d = b*b - 4.0*a*c;
  if (d < 0.0) return vec2(1e5, -1e5);
  return vec2((-b - sqrt(d)) / (2.0*a), (-b + sqrt(d)) / (2.0*a));
}
vec3 atmosphere(vec3 rd, vec3 sunDir, float sunI){
  vec3 r0 = vec3(0.0, R_PLANET + 2.0, 0.0);
  vec2 p = rsi(r0, rd, R_ATMO);
  if (p.x > p.y) return vec3(0.0);
  vec2 pg = rsi(r0, rd, R_PLANET);
  float t0 = max(p.x, 0.0), t1 = p.y;
  if (pg.x > 0.0 && pg.x < pg.y) t1 = min(t1, pg.x);
  const int IS = 16; const int JS = 6;
  float ds = (t1 - t0) / float(IS);
  float t = t0;
  vec3 tR = vec3(0.0), tM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, sunDir);
  float mumu = mu * mu, gg = G_M * G_M;
  float pR = 3.0 / (16.0 * PI_A) * (1.0 + mumu);
  float pM = 3.0 / (8.0 * PI_A) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * G_M, 1.5) * (2.0 + gg));
  for (int i = 0; i < IS; i++){
    vec3 ps = r0 + rd * (t + ds * 0.5);
    float h = length(ps) - R_PLANET;
    float dR = exp(-h / H_R) * ds, dM = exp(-h / H_M) * ds;
    odR += dR; odM += dM;
    float dsj = rsi(ps, sunDir, R_ATMO).y / float(JS);
    float tj = 0.0, odRj = 0.0, odMj = 0.0;
    bool lit = true;
    for (int j = 0; j < JS; j++){
      vec3 pj = ps + sunDir * (tj + dsj * 0.5);
      float hj = length(pj) - R_PLANET;
      if (hj < 0.0) { lit = false; break; }
      odRj += exp(-hj / H_R) * dsj; odMj += exp(-hj / H_M) * dsj;
      tj += dsj;
    }
    if (lit){
      vec3 att = exp(-(BETA_M * 1.1 * (odM + odMj) + BETA_R * (odR + odRj)));
      tR += dR * att; tM += dM * att;
    }
    t += ds;
  }
  return sunI * (pR * BETA_R * tR + pM * BETA_M * tM);
}
`;

// shared cloud field (sky dome, ocean reflection and cloud shadows on the ground)
export const GLSL_CLOUDS = /* glsl */ `
uniform vec4 uCloud; // x coverage, y time offset, z scale, w density
float cnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5453);
  float b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5453);
  float d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float cloudField(vec2 p){
  p *= uCloud.z;
  vec2 drift = vec2(uCloud.y, uCloud.y * 0.37);
  vec2 q = p + drift;
  float w = cnoise(q * 0.5 + 3.0) * 1.2;
  float n = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++){ n += a * cnoise(q * f + w + float(i) * 13.1); f *= 2.07; a *= 0.5; }
  float base = smoothstep(1.0 - uCloud.x, 1.0 - uCloud.x + 0.32, n);
  return base;
}
`;

export function cloudShadowGLSL() {
  return /* glsl */ `
float cloudShadowAt(vec3 wp){
  // project along the sun onto the cloud deck at 1500 m
  float t = (1500.0 - wp.y) / max(uSunDir.y, 0.08);
  vec2 p = (wp.xz + uSunDir.xz * t) / 1000.0;
  return 1.0 - cloudField(p) * 0.72 * uCloud.w;
}`;
}

const LUT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSun;
uniform float uSunI;
uniform vec3 uMoon;
uniform float uMoonI;
varying vec2 vUv;
${GLSL_ATMO}
void main(){
  float phi = (vUv.x - 0.5) * 2.0 * PI_A;
  float theta = (vUv.y - 0.5) * PI_A;
  vec3 rd = vec3(cos(theta) * cos(phi), sin(theta), cos(theta) * sin(phi));
  vec3 rdu = rd; rdu.y = max(rdu.y, 0.0005); rdu = normalize(rdu);
  vec3 c = atmosphere(rdu, uSun, uSunI);
  if (uMoonI > 0.0) c += atmosphere(rdu, uMoon, uMoonI) * vec3(0.8, 0.9, 1.15);
  // night sky glow so darkness is never pure black
  c += vec3(0.0006, 0.0009, 0.0018);
  if (rd.y < 0.0) {
    // below the horizon: the sea / ground seen in reflections and ambient light
    float k = smoothstep(0.0, -0.25, rd.y);
    vec3 ground = c * 0.35 + vec3(0.004, 0.012, 0.016) * uSunI * max(uSun.y + 0.1, 0.0);
    c = mix(c, ground, k);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const DOME_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uLut;
uniform vec3 uSun;
uniform vec3 uSunC;
uniform vec3 uMoon;
uniform float uStars;
uniform float uExposure;
uniform float uTime;
varying vec3 vDir;
${GLSL_CLOUDS}
vec3 lutSample(vec3 d){
  float phi = atan(d.z, d.x);
  float theta = asin(clamp(d.y, -1.0, 1.0));
  return texture2D(uLut, vec2(phi / 6.2831853 + 0.5, theta / 3.14159265 + 0.5)).rgb;
}
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 d = normalize(vDir);
  vec3 col = d.y < 0.0 ? lutSample(normalize(vec3(d.x, 0.004, d.z))) * 0.9 : lutSample(d);
  float mu = dot(d, uSun);
  // sun disc with limb darkening
  float disc = smoothstep(0.99996, 0.999985, mu);
  col += uSunC * disc * 60.0 * smoothstep(-0.02, 0.02, d.y);
  // moon
  float md = dot(d, uMoon);
  col += vec3(0.9, 0.95, 1.0) * smoothstep(0.99985, 0.99992, md) * 0.6 * uStars;
  // stars
  if (uStars > 0.0 && d.y > 0.0){
    vec3 sp = d * 420.0;
    vec3 cell = floor(sp);
    float s = h13(cell);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
    float star = step(0.9975, s) * smoothstep(0.5, 0.0, length(fract(sp) - 0.5)) * tw;
    col += vec3(0.8, 0.85, 1.0) * star * uStars * 0.08 * smoothstep(0.0, 0.25, d.y);
    // milky way haze
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, -0.78))) * 3.2, 2.0));
    col += vec3(0.010, 0.011, 0.016) * band * uStars * (0.6 + 0.4 * cnoise(d.xz * 30.0));
  }
  // cumulus deck
  if (d.y > 0.0){
    float t = 1500.0 / max(d.y, 0.035);
    vec2 cp = d.xz * t / 1000.0;
    float c = cloudField(cp);
    if (c > 0.002){
      float c2 = cloudField(cp + uSun.xz * 0.06);
      float lightPath = clamp(c - c2 * 0.85 + 0.35, 0.0, 1.0);
      vec3 amb = lutSample(normalize(vec3(d.x, 0.35, d.z))) * 1.15;
      vec3 sunLit = uSunC * (0.55 + 1.6 * pow(max(mu, 0.0), 6.0));
      vec3 cc = amb * (0.65 + 0.2 * c) + sunLit * lightPath * 0.42;
      cc *= mix(1.0, 0.72, c * c);
      float horizon = smoothstep(0.0, 0.12, d.y);
      float a = c * horizon * uCloud.w;
      // distant clouds fade into the haze
      vec3 haze = lutSample(normalize(vec3(d.x, 0.02, d.z)));
      cc = mix(haze, cc, smoothstep(0.02, 0.2, d.y));
      col = mix(col, cc, a);
    }
  }
  gl_FragColor = vec4(col * uExposure, 1.0);
}`;

// --- JS mirror of the scattering model (for fog/light colours)
const RP = 6371e3, RA = 6471e3;
const BR = [5.5e-6, 13.0e-6, 22.4e-6], BM = 21e-6, HR = 8e3, HM = 1.2e3, GM = 0.76;
function rsi(r0, rd, sr) {
  const a = rd[0] * rd[0] + rd[1] * rd[1] + rd[2] * rd[2];
  const b = 2 * (rd[0] * r0[0] + rd[1] * r0[1] + rd[2] * r0[2]);
  const c = r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2] - sr * sr;
  const d = b * b - 4 * a * c;
  if (d < 0) return [1e5, -1e5];
  return [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)];
}
export function atmosphereJS(rd, sun, sunI) {
  const r0 = [0, RP + 2, 0];
  const p = rsi(r0, rd, RA);
  if (p[0] > p[1]) return [0, 0, 0];
  const pg = rsi(r0, rd, RP);
  const t0 = Math.max(p[0], 0);
  let t1 = p[1];
  if (pg[0] > 0 && pg[0] < pg[1]) t1 = Math.min(t1, pg[0]);
  const IS = 12, JS = 5;
  const ds = (t1 - t0) / IS;
  let t = t0, odR = 0, odM = 0;
  const tR = [0, 0, 0];
  let tM = [0, 0, 0];
  const mu = rd[0] * sun[0] + rd[1] * sun[1] + rd[2] * sun[2];
  const mumu = mu * mu, gg = GM * GM;
  const pR = 3 / (16 * Math.PI) * (1 + mumu);
  const pM = 3 / (8 * Math.PI) * ((1 - gg) * (mumu + 1)) / (Math.pow(1 + gg - 2 * mu * GM, 1.5) * (2 + gg));
  for (let i = 0; i < IS; i++) {
    const ps = [r0[0] + rd[0] * (t + ds / 2), r0[1] + rd[1] * (t + ds / 2), r0[2] + rd[2] * (t + ds / 2)];
    const h = Math.hypot(ps[0], ps[1], ps[2]) - RP;
    const dR = Math.exp(-h / HR) * ds, dM = Math.exp(-h / HM) * ds;
    odR += dR; odM += dM;
    const dsj = rsi(ps, sun, RA)[1] / JS;
    let tj = 0, odRj = 0, odMj = 0, lit = true;
    for (let j = 0; j < JS; j++) {
      const pj = [ps[0] + sun[0] * (tj + dsj / 2), ps[1] + sun[1] * (tj + dsj / 2), ps[2] + sun[2] * (tj + dsj / 2)];
      const hj = Math.hypot(pj[0], pj[1], pj[2]) - RP;
      if (hj < 0) { lit = false; break; }
      odRj += Math.exp(-hj / HR) * dsj; odMj += Math.exp(-hj / HM) * dsj;
      tj += dsj;
    }
    if (lit) {
      for (let k = 0; k < 3; k++) {
        const att = Math.exp(-(BM * 1.1 * (odM + odMj) + BR[k] * (odR + odRj)));
        tR[k] += dR * att;
        tM[k] += dM * att;
      }
    }
    t += ds;
  }
  return [0, 1, 2].map((k) => sunI * (pR * BR[k] * tR[k] + pM * BM * tM[k]));
}
/** Sunlight colour at ground level after passing through the atmosphere. */
export function sunTransmittance(sun) {
  const r0 = [0, RP + 2, 0];
  if (sun[1] < -0.03) return [0, 0, 0];
  const s = [sun[0], Math.max(sun[1], 0.002), sun[2]];
  const l = Math.hypot(...s);
  const d = s.map((v) => v / l);
  const p = rsi(r0, d, RA);
  const n = 24, ds = p[1] / n;
  let odR = 0, odM = 0;
  for (let i = 0; i < n; i++) {
    const ps = [r0[0] + d[0] * (i + 0.5) * ds, r0[1] + d[1] * (i + 0.5) * ds, r0[2] + d[2] * (i + 0.5) * ds];
    const h = Math.hypot(...ps) - RP;
    odR += Math.exp(-h / HR) * ds;
    odM += Math.exp(-h / HM) * ds;
  }
  const fade = THREE.MathUtils.smoothstep(sun[1], -0.03, 0.03);
  return [0, 1, 2].map((k) => Math.exp(-(BR[k] * odR + BM * 1.1 * odM)) * fade);
}

export class Sky {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.sunI = 20;
    this.exposure = 1;
    const lutW = quality.tier >= 2 ? 256 : 128;
    this.lut = new THREE.WebGLRenderTarget(lutW, lutW / 2, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping });
    this.lut.texture.wrapS = THREE.RepeatWrapping;
    this.lut.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.lutMat = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: LUT_FRAG,
      uniforms: { uSun: { value: new THREE.Vector3() }, uSunI: { value: 20 }, uMoon: { value: new THREE.Vector3() }, uMoonI: { value: 0 } },
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();

    this.cloudU = { value: new THREE.Vector4(0.42, 0, 1.0, 1.0) };
    G.uSkyLut.value = this.lut.texture;
    G.uCloud = this.cloudU;
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: {
        uLut: { value: this.lut.texture },
        uSun: { value: this.sunDir },
        uSunC: { value: new THREE.Color() },
        uMoon: { value: this.moonDir },
        uStars: { value: 0 },
        uExposure: { value: 1 },
        uTime: G.uTime,
        uCloud: this.cloudU,
      },
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;

    // environment (IBL) from the dome alone
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.domeMat);
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastSun = new THREE.Vector3(9, 9, 9);
    this.lastEnvT = -1e9;

    this.fogColor = new THREE.Color();
    this.fogSun = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.ambient = new THREE.Color();
  }

  /** dayFrac: 0..1 (0 = midnight, 0.5 = noon) */
  setTime(dayFrac) {
    // sun rises in the east (+x), culminates high in the south (+z), sets in the west
    const a = (dayFrac - 0.25) * Math.PI * 2; // 0 at 6:00
    const decl = 0.32;
    const el = Math.sin(a);
    this.sunDir.set(Math.cos(a), el * Math.cos(decl), Math.sin(decl) * 0.6 + el * 0.25).normalize();
    this.moonDir.set(-Math.cos(a) * 0.9, -el * 0.85 + 0.15, -0.3).normalize();
  }

  update(time, force = false) {
    const sun = this.sunDir;
    const changed = force || sun.angleTo(this.lastSun) > 0.0035;
    if (changed) {
      this.lastSun.copy(sun);
      const night = THREE.MathUtils.smoothstep(-sun.y, -0.02, 0.18);
      this.lutMat.uniforms.uSun.value.copy(sun);
      this.lutMat.uniforms.uSunI.value = this.sunI;
      this.lutMat.uniforms.uMoon.value.copy(this.moonDir);
      this.lutMat.uniforms.uMoonI.value = night * 0.05 * Math.max(this.moonDir.y, 0);
      const r = this.renderer;
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.lut);
      r.render(this.quadScene, this.quadCam);
      r.setRenderTarget(prev);
      this.computeColors(night);
    }
    this.domeMat.uniforms.uStars.value = THREE.MathUtils.smoothstep(-this.sunDir.y, 0.02, 0.2);
    this.cloudU.value.y = time * 0.0035;
    // refresh IBL when the light changed enough or every few seconds for cloud drift
    const envEvery = this.quality.tier >= 2 ? 4 : 10;
    if (changed && (time - this.lastEnvT > 0.5 || force) || time - this.lastEnvT > envEvery) {
      this.lastEnvT = time;
      this.updateEnv();
    }
  }

  computeColors(night) {
    const s = this.sunDir;
    const sd = [s.x, s.y, s.z];
    const tr = sunTransmittance(sd);
    // sun light colour (radiometric, scaled for the renderer)
    this.sunColor.setRGB(tr[0], tr[1], tr[2]);
    // horizon haze colour looking toward and away from the sun
    const az = Math.atan2(s.z, s.x);
    const toward = atmosphereJS([Math.cos(az) * 0.995, 0.1, Math.sin(az) * 0.995], sd, this.sunI);
    const away = atmosphereJS([-Math.cos(az) * 0.995, 0.1, -Math.sin(az) * 0.995], sd, this.sunI);
    const side = atmosphereJS([-Math.sin(az) * 0.995, 0.1, Math.cos(az) * 0.995], sd, this.sunI);
    const zen = atmosphereJS([0, 1, 0], sd, this.sunI);
    const nightC = [0.006, 0.009, 0.016];
    const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
    const avg = [0, 1, 2].map((k) => (away[k] + side[k] * 2) / 3);
    const fog = mix(avg, nightC, night * 0.6);
    this.fogColor.setRGB(fog[0] + nightC[0], fog[1] + nightC[1], fog[2] + nightC[2]);
    this.fogSun.setRGB(toward[0] + nightC[0], toward[1] + nightC[1], toward[2] + nightC[2]);
    this.ambient.setRGB(zen[0] + nightC[0] * 2, zen[1] + nightC[1] * 2, zen[2] + nightC[2] * 2);
    this.domeMat.uniforms.uSunC.value.copy(this.sunColor).multiplyScalar(this.sunI * 0.06);
  }

  updateEnv() {
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200, { size: this.quality.tier >= 2 ? 128 : 64 });
    if (this.onEnv) this.onEnv(this.envRT.texture);
  }
}
