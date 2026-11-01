import * as THREE from 'three';

// Uniforms shared by every custom material (time of day, fog, earth curvature).
export const shared = {
  uFogColor: { value: new THREE.Color('#b9d3ea') },
  uFogDensity: { value: 1 / 9000 },
  uNight: { value: 0 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uCurv: { value: 1 / (2 * 6371000) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.97, 0.9) },
  uAmbSky: { value: new THREE.Color(0.45, 0.5, 0.6) },
  uAmbGround: { value: new THREE.Color(0.25, 0.23, 0.2) },
  uTime: { value: 0 },
};

const CURVE_VERT = /* glsl */`
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d2 = dot(mv.xyz, mv.xyz);
  vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  mv.xyz -= upV * (d2 * uCurv);
  vDist = sqrt(d2);
  gl_Position = projectionMatrix * mv;
`;
const FOG_FRAG = /* glsl */`
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, fogF);
`;
const HASH = /* glsl */`
float hh(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
`;

const GROUND_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv;
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  ${CURVE_VERT}
  #include <logdepthbuf_vertex>
}
`;
const GROUND_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform vec3 uTint;
varying vec2 vUv; varying float vDist;
void main() {
  #include <logdepthbuf_fragment>
  vec3 c = texture2D(map, vUv).rgb;
  vec3 col = c * uTint;
  if (uNight > 0.0) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / (mx + 0.02);
    float urban = (1.0 - smoothstep(0.16, 0.42, sat)) * smoothstep(0.045, 0.2, lum);
    vec3 nightCol = c * vec3(0.03, 0.035, 0.06) + vec3(1.0, 0.55, 0.2) * urban * 0.1;
    col = mix(col, nightCol, uNight);
  }
  ${FOG_FRAG}
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
export function groundMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight,
      uTint: shared.uTint, uCurv: shared.uCurv,
    },
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS, side: THREE.DoubleSide,
  });
}

// Buildings: flat normals from screen-space derivatives, so walls and roofs can share vertices.
// uv.x = metres along the wall, uv.y = metres above the building's ground.
const BUILD_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv;
attribute vec4 aColor;
varying vec4 vColor; varying vec2 vUv; varying vec3 vView; varying float vDist;
void main() {
  vColor = aColor; vUv = uv;
  ${CURVE_VERT}
  vView = mv.xyz;
  #include <logdepthbuf_vertex>
}
`;
const BUILD_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbSky; uniform vec3 uAmbGround;
varying vec4 vColor; varying vec2 vUv; varying vec3 vView; varying float vDist;
${HASH}
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ny = dot(n, upV);
  vec3 base = vColor.rgb;
  float seed = floor(vColor.a * 255.0 + 0.5);
  vec3 amb = mix(uAmbGround, uAmbSky, ny * 0.5 + 0.5);
  float diff = max(dot(n, sunV), 0.0);
  vec3 col;
  vec3 emis = vec3(0.0);
  if (ny > 0.6) {
    float spot = hh(vec3(seed, 1.7, 2.3));
    col = base * (0.74 + 0.06 * spot) * (amb + uSunColor * diff);
    emis = vec3(0.9, 0.55, 0.3) * 0.015 * uNight;
  } else if (ny < -0.6) {
    col = base * 0.35 * amb;
  } else {
    vec2 cell = vec2(vUv.x / 3.6, vUv.y / 3.4);
    vec2 f = fract(cell); vec2 id = floor(cell);
    vec2 fw = fwidth(cell);
    float aa = 1.0 - smoothstep(0.22, 0.65, max(fw.x, fw.y));
    float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.3, f.y) * step(f.y, 0.86);
    float r = hh(vec3(id, seed));
    vec3 glass = vec3(0.09, 0.12, 0.16) + uAmbSky * 0.22;
    float w = mix(0.3, win, aa);
    vec3 surf = mix(base, glass, w * 0.78);
    float ao = mix(0.55, 1.0, smoothstep(-1.0, 7.0, vUv.y));
    col = surf * ao * (amb + uSunColor * diff);
    float lit = step(0.55, r) * step(0.0, vUv.y);
    vec3 lc = mix(vec3(1.0, 0.74, 0.4), vec3(0.72, 0.85, 1.0), step(0.72, hh(vec3(id.yx, seed + 7.0))));
    emis = lc * mix(0.04, win * lit * 0.95, aa) * uNight;
  }
  col += emis;
  ${FOG_FRAG}
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
export function buildingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight,
      uCurv: shared.uCurv, uSunDir: shared.uSunDir, uSunColor: shared.uSunColor,
      uAmbSky: shared.uAmbSky, uAmbGround: shared.uAmbGround,
    },
    vertexShader: BUILD_VS, fragmentShader: BUILD_FS,
  });
}

// Sky dome: gradient, sun/moon, stars at night.
const SKY_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const SKY_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uNight; uniform float uHorizonY;
varying vec3 vDir;
${HASH}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float h = d.y - uHorizonY;
  vec3 col = h > 0.0 ? mix(uHor, uTop, pow(clamp(h * 1.1, 0.0, 1.0), 0.55)) : mix(uHor, uBottom, smoothstep(0.0, 0.35, -h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float disc = smoothstep(0.99975, 0.99988, sd);
  float glow = pow(sd, 8.0) * 0.22 + pow(sd, 120.0) * 0.5;
  col += uSunColor * (disc * mix(5.0, 1.6, uNight) + glow * (1.0 - uNight * 0.75));
  if (uNight > 0.45 && h > -0.05) {
    vec3 p = d * 280.0; vec3 id = floor(p); vec3 fp = fract(p) - 0.5;
    float r = hh(id);
    float s = step(0.9925, r) * smoothstep(0.34, 0.0, length(fp)) * (0.45 + 0.55 * hh(id + 3.0));
    col += vec3(0.9, 0.95, 1.0) * s * smoothstep(0.45, 1.0, uNight) * smoothstep(-0.02, 0.2, h) * 1.4;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
export function skyMaterial(u) {
  return new THREE.ShaderMaterial({
    uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
}

// Light pillar for stamp spots (additive, ignores fog so it can be seen from far away).
const BEAM_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vH; varying vec2 vUv2;
void main() {
  vH = uv.y; vUv2 = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const BEAM_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying float vH; varying vec2 vUv2;
void main() {
  #include <logdepthbuf_fragment>
  float edge = 1.0 - abs(vUv2.x * 2.0 - 1.0);
  float a = (1.0 - vH) * (0.35 + 0.25 * sin(uTime * 3.0 - vH * 18.0)) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`;
export function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: shared.uTime, uAlpha: { value: 1 } },
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Patch a built-in material so it follows the earth curvature (used by landmarks / hero / clouds).
export function addCurvature(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCurv = shared.uCurv;
    sh.vertexShader = 'uniform float uCurv;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      {
        float d2c = dot(mvPosition.xyz, mvPosition.xyz);
        vec3 upVc = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
        mvPosition.xyz -= upVc * (d2c * uCurv);
      }
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  return mat;
}
