// Ocean and mire water. A camera-centred radial grid displaced by Gerstner swell, damped
// over the reef and in the mire. Shading uses the real water depth (terrain heightfield),
// so the lagoon turns turquoise over sand and the seabed shows through the surface.
import * as THREE from "three";
import { G, GLSL_COMMON } from "../gfx/shaderlib.js";
import { GLSL_CLOUDS } from "../gfx/sky.js";

const WAVES = [
  // dirX, dirZ, wavelength, amplitude(m), steepness
  [-0.25, 1.0, 62, 0.42, 0.55],
  [0.35, 1.0, 37, 0.24, 0.6],
  [-0.7, 0.75, 21, 0.11, 0.5],
  [0.9, 0.45, 13, 0.06, 0.45],
  [-0.1, 1.0, 8.5, 0.035, 0.4],
  [0.55, 0.85, 5.3, 0.018, 0.35],
];

const VERT = /* glsl */ `
${GLSL_COMMON}
uniform vec4 uWaves[${WAVES.length}];
uniform vec4 uWaves2[${WAVES.length}];
varying vec3 vWorld;
varying vec3 vRay;
varying float vDepth;
varying float vCrest;
varying vec3 vGNormal;
varying float vDamp;
void main(){
  vec3 p = position;
  vec2 xz = p.xz + floor(cameraPosition.xz / 4.0) * 4.0; // snapped so the grid does not swim
  float ground = terrainHeight(xz);
  float depth = uTerrain.w - ground;
  vec3 bio = biomeAt(xz);
  // damping: shallow lagoon and the sheltered mire are calm
  float damp = smoothstep(0.2, 7.0, depth) * (1.0 - bio.g * 0.95);
  float outside = smoothstep(780.0, 900.0, max(abs(xz.x), abs(xz.y)));
  damp = max(damp, outside);
  vec3 disp = vec3(0.0);
  vec3 tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  float distFade = 1.0 - smoothstep(600.0, 2400.0, length(p.xz));
  for (int i = 0; i < ${WAVES.length}; i++){
    vec2 d = uWaves[i].xy; float k = uWaves[i].z; float a = uWaves[i].w * damp * mix(1.0, distFade, float(i) / ${WAVES.length}.0);
    float q = uWaves2[i].x; float w = uWaves2[i].y;
    float f = k * dot(d, xz) - w * uTime + uWaves2[i].z;
    float c = cos(f), s = sin(f);
    disp.x += q * a * d.x * c;
    disp.z += q * a * d.y * c;
    disp.y += a * s;
    tx += vec3(-q * d.x * d.x * k * a * s, d.x * k * a * c, -q * d.x * d.y * k * a * s);
    tz += vec3(-q * d.x * d.y * k * a * s, d.y * k * a * c, -q * d.y * d.y * k * a * s);
    crest += max(s, 0.0) * a;
  }
  // swash running up the beach
  float shore = smoothstep(1.6, -0.6, depth) * (1.0 - bio.g);
  float run = 0.5 + 0.5 * sin(uTime * 0.85 - depth * 2.2 + fbm3(xz * 0.05) * 3.0);
  disp.y += shore * (run * 0.32 - 0.06);
  vec3 wp = vec3(xz.x, uTerrain.w, xz.y) + disp;
  vWorld = wp;
  vRay = wp - cameraPosition;
  vDepth = depth;
  vCrest = crest;
  vDamp = damp;
  vGNormal = normalize(cross(tz, tx));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_CLOUDS}
uniform sampler2D uLut;
uniform vec3 uSunC;
uniform float uExposure;
uniform sampler2D uWaveNormal;
uniform float uHasWaveNormal;
varying vec3 vWorld;
varying vec3 vRay;
varying float vDepth;
varying float vCrest;
varying vec3 vGNormal;
varying float vDamp;

vec3 lutSample(vec3 d){
  float phi = atan(d.z, d.x);
  float theta = asin(clamp(d.y, -1.0, 1.0));
  return texture2D(uLut, vec2(phi / 6.2831853 + 0.5, theta / 3.14159265 + 0.5)).rgb;
}
vec3 skyReflect(vec3 r){
  r.y = abs(r.y);
  vec3 c = lutSample(r);
  float t = 1500.0 / max(r.y, 0.04);
  float cl = cloudField(r.xz * t / 1000.0) * smoothstep(0.0, 0.15, r.y) * uCloud.w;
  vec3 amb = lutSample(normalize(vec3(r.x, 0.35, r.z)));
  c = mix(c, amb * 1.05 + uSunC * 0.25, cl * 0.85);
  return c;
}
vec2 ripple(vec2 p, float t){
  // analytic derivative of a few travelling ripples (fallback when no baked map)
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 2.1 - t * 2.4) * 0.12;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 3.3 - t * 3.1) * 0.08;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 5.7 - t * 4.2) * 0.05;
  g += (vec2(vnoise(p * 1.7 + t * 0.4), vnoise(p * 1.7 - t * 0.37 + 9.0)) - 0.5) * 0.25;
  return g;
}

void main(){
  float dist = length(vRay);
  vec3 V = -vRay / dist;
  vec3 bio = biomeAt(vWorld.xz);
  float mire = bio.g;
  // detail normals
  vec3 N = normalize(vGNormal);
  vec2 g;
  if (uHasWaveNormal > 0.5){
    vec2 uv1 = vWorld.xz / 23.0 + vec2(uTime * 0.013, uTime * 0.021);
    vec2 uv2 = vWorld.xz / 9.0 + vec2(-uTime * 0.027, uTime * 0.017);
    vec2 n1 = texture2D(uWaveNormal, uv1).xy * 2.0 - 1.0;
    vec2 n2 = texture2D(uWaveNormal, uv2).xy * 2.0 - 1.0;
    g = (n1 * 0.9 + n2 * 0.6);
  } else {
    g = ripple(vWorld.xz, uTime);
  }
  float detail = mix(1.0, 0.25, mire) * (1.0 - smoothstep(80.0, 900.0, dist) * 0.75);
  N = normalize(N + vec3(g.x, 0.0, g.y) * detail * 0.55);

  // fresnel + reflection
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = skyReflect(R) * uExposure;
  // sun glint (GGX-ish), widened by distance to avoid aliasing
  vec3 H = normalize(V + uSunDir);
  float rough = mix(0.035, 0.18, smoothstep(30.0, 800.0, dist)) + mire * 0.1;
  float a2 = rough * rough;
  float NdH = max(dot(N, H), 0.0);
  float dd = NdH * NdH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  vec3 spec = uSunC * D * F * 0.6 * step(0.0, uSunDir.y);

  // water body colour: scattering + absorption over the real depth
  float depth = max(vDepth + (vWorld.y - uTerrain.w), 0.0);
  float path = depth / max(NdV, 0.12);
  vec3 absorb = mix(vec3(0.46, 0.085, 0.06), vec3(0.9, 0.55, 0.42), mire);
  vec3 T = exp(-absorb * path);
  float sunUp = max(uSunDir.y, 0.0);
  vec3 deep = mix(vec3(0.004, 0.032, 0.055), vec3(0.03, 0.035, 0.015), mire);
  vec3 skyAmb = lutSample(vec3(0.0, 1.0, 0.0)) * uExposure;
  vec3 scatter = deep * (0.35 + 2.4 * sunUp) + skyAmb * mix(vec3(0.02, 0.07, 0.08), vec3(0.03, 0.03, 0.015), mire);
  // light shining through wave crests
  float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * clamp(vCrest * 2.0, 0.0, 1.0) * (1.0 - mire);
  scatter += vec3(0.02, 0.12, 0.1) * sss * uSunC * 0.15;

  // shore foam: bands that roll up the beach + broken foam in the surf
  float foam = 0.0;
  if (mire < 0.6){
    float f1 = fbm3(vWorld.xz * 0.35 + vec2(uTime * 0.05, 0.0));
    float bands = smoothstep(0.55, 1.0, sin(vDepth * 3.2 - uTime * 1.25 + f1 * 4.0) * 0.5 + 0.5);
    float surf = smoothstep(2.2, 0.15, vDepth) * smoothstep(-0.8, 0.05, vDepth);
    float cells = smoothstep(0.35, 0.75, fbm3(vWorld.xz * 1.6 + uTime * 0.12));
    foam = surf * (bands * 0.7 + 0.3) * cells;
    foam += smoothstep(0.25, 0.0, abs(vDepth - 0.05 - sin(uTime * 0.85) * 0.15)) * 0.6 * cells;
    // whitecaps offshore on wave crests
    foam += smoothstep(0.55, 0.75, vCrest) * smoothstep(0.6, 0.9, fbm3(vWorld.xz * 0.07 - uTime * 0.03)) * cells * 0.3 * vDamp;
    // reef break
    foam += smoothstep(2.6, 0.9, vDepth) * smoothstep(0.2, 1.4, vDepth) * step(500.0, vWorld.z) * cells * smoothstep(0.4, 0.7, fbm3(vWorld.xz * 0.05 + uTime * 0.02)) * 0.5;
    foam = clamp(foam, 0.0, 1.0);
  }
  vec3 foamC = vec3(0.92) * (skyAmb * 0.9 + uSunC * sunUp * 0.6);

  // assemble against what is already in the frame buffer (the seabed)
  float trans = (T.r + T.g + T.b) / 3.0;
  float alpha = 1.0 - trans * (1.0 - F);
  vec3 col = scatter * (1.0 - T) * (1.0 - F) + refl * F + spec;
  col = col / max(alpha, 0.001);
  col = mix(col, foamC, foam);
  alpha = max(alpha, foam);
  // fade the swash edge so the waterline is soft
  alpha *= smoothstep(-0.25, 0.08, vDepth + (vWorld.y - uTerrain.w));
  col = applyAtmosphere(col, vRay);
  gl_FragColor = vec4(col, alpha);
}`;

export class Ocean {
  constructor(sky, quality) {
    let rings = quality.tier >= 2 ? 150 : 100;
    const segs = quality.tier >= 2 ? 192 : 128;
    const pos = [0, 0, 0];
    const idx = [];
    let r = 0.5;
    const radii = [];
    for (let i = 0; i < rings; i++) { radii.push(r); r *= quality.tier >= 2 ? 1.058 : 1.085; }
    radii.push(r * 1.6, 7000, 13000);
    rings += 3;
    for (const rr of radii) for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let i = 0; i < rings - 1; i++) {
      for (let s = 0; s < segs; s++) {
        const a = 1 + i * segs + s, b = 1 + i * segs + ((s + 1) % segs);
        const c = a + segs, d = b + segs;
        idx.push(a, b, c, b, d, c);
      }
    }
    // reach the horizon
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const w1 = [], w2 = [];
    for (const [dx, dz, L, A, Q] of WAVES) {
      const l = Math.hypot(dx, dz);
      const k = (2 * Math.PI) / L;
      const w = Math.sqrt(9.81 * k);
      w1.push(new THREE.Vector4(dx / l, dz / l, k, A));
      w2.push(new THREE.Vector4(Q / (k * A * WAVES.length), w, Math.random() * 6.28, 0));
    }
    this.uniforms = {
      ...G,
      uWaves: { value: w1 },
      uWaves2: { value: w2 },
      uLut: { value: sky.lut.texture },
      uSunC: sky.domeMat.uniforms.uSunC,
      uExposure: sky.domeMat.uniforms.uExposure,
      uCloud: sky.cloudU,
      uWaveNormal: { value: null },
      uHasWaveNormal: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.waves = WAVES.map((w, i) => ({ d: w1[i], q: w2[i] }));
  }

  setNormalMap(tex) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.uniforms.uWaveNormal.value = tex;
    this.uniforms.uHasWaveNormal.value = 1;
  }

  /** Surface height at a point (for buoyancy and wading), matching the vertex shader. */
  heightAt(x, z, t, depth, mire) {
    const damp = Math.min(1, Math.max(0, (depth - 0.2) / 6.8)) * (1 - mire * 0.95);
    let y = 0;
    for (const { d, q } of this.waves) {
      const f = d.z * (d.x * x + d.y * z) - q.y * t + q.z;
      y += d.w * damp * Math.sin(f);
    }
    return y;
  }
}
