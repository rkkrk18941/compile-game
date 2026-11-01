import * as THREE from 'three';

// Uniforms shared by every custom material (time of day, fog, earth curvature, weather).
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
  uWet: { value: 0 },
  uTileS: { value: 1 },
};

const CURVE_VERT = /* glsl */`
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d2 = dot(mv.xyz, mv.xyz);
  vec3 upV0 = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  mv.xyz -= upV0 * (d2 * uCurv);
  vDist = sqrt(d2);
  gl_Position = projectionMatrix * mv;
`;
const FOG_FRAG = /* glsl */`
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
  col = mix(col, uFogColor, fogF);
`;
export const HASH = /* glsl */`
float hh(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); i = mod(i, 512.0);
  float a = hh(vec3(i, 1.0)), b = hh(vec3(mod(i + vec2(1.0, 0.0), 512.0), 1.0)), c = hh(vec3(mod(i + vec2(0.0, 1.0), 512.0), 1.0)), d = hh(vec3(mod(i + vec2(1.0, 1.0), 512.0), 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float aband(float x, float a, float b) { float w = fwidth(x) * 0.75 + 1e-4; return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x); }
`;

const GROUND_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv; uniform vec2 uOff;
varying vec2 vUv; varying float vDist; varying vec2 vW;
void main() {
  vUv = uv; vW = position.xz + uOff;
  ${CURVE_VERT}
  #include <logdepthbuf_vertex>
}
`;
const GROUND_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform vec3 uTint; uniform float uWet;
varying vec2 vUv; varying float vDist; varying vec2 vW;
${HASH}
void main() {
  #include <logdepthbuf_fragment>
  vec3 c = texture2D(map, vUv).rgb;
  float near = 1.0 - smoothstep(12.0, 70.0, vDist);
  if (near > 0.0) c *= 1.0 + near * ((vnoise(vW * 2.0) - 0.5) * 0.35 + (vnoise(vW * 7.0) - 0.5) * 0.25);
  vec3 col = c * uTint * (1.0 - uWet * 0.2);
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
export function groundMaterial(tex, off) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, uOff: { value: new THREE.Vector2(off[0], off[1]) },
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight,
      uTint: shared.uTint, uCurv: shared.uCurv, uWet: shared.uWet,
    },
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS, side: THREE.DoubleSide,
  });
}

// ---------------- buildings ----------------
// uv.x = metres along the wall, uv.y = metres above the building's ground (< -1.5 = rubble).
// aColor.a = (seed << 2) | style   (0 office, 1 apartment, 2 house, 3 apartment over shops)
const BUILD_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv;
attribute vec4 aColor; attribute vec2 aCen;
varying vec4 vColor; varying vec2 vUv; varying vec3 vView; varying float vDist; varying vec2 vLocal; varying vec2 vCen;
void main() {
  vColor = aColor; vUv = uv; vLocal = position.xz; vCen = aCen;
  ${CURVE_VERT}
  vView = mv.xyz;
  #include <logdepthbuf_vertex>
}
`;
const BUILD_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform vec3 uTint; uniform float uWet;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbSky; uniform vec3 uAmbGround;
uniform sampler2D uRoof; uniform float uHasRoof; uniform float uTileS;
varying vec4 vColor; varying vec2 vUv; varying vec3 vView; varying float vDist; varying vec2 vLocal; varying vec2 vCen;
${HASH}
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ny = dot(n, upV);
  float sb = floor(vColor.a * 255.0 + 0.5);
  float style = mod(sb, 4.0);
  float seed = floor(sb / 4.0);
  vec3 base = vColor.rgb;
  if (uHasRoof > 0.5) {
    vec3 pa = textureLod(uRoof, vCen, 3.5).rgb;
    float pl = max(dot(pa, vec3(0.3333)), 0.02);
    base = mix(base, clamp(base * (pa / pl), 0.0, 1.0), 0.32);
  }
  vec3 amb = mix(uAmbGround, uAmbSky, ny * 0.5 + 0.5);
  float diff = max(dot(n, sunV), 0.0);
  vec3 col;
  vec3 emis = vec3(0.0);
  if (vUv.y < -1.5) {
    float g = hh(vec3(floor(vLocal * 1.4), 3.0));
    col = vec3(0.17, 0.16, 0.15) * (0.55 + 0.9 * g) * (amb + uSunColor * diff);
  } else if (ny > 0.6) {
    if (uHasRoof > 0.5) {
      vec3 rc = texture2D(uRoof, vLocal / uTileS + 0.5).rgb;
      col = rc * uTint * (1.0 - 0.96 * uNight) * (1.0 - uWet * 0.2);
    } else {
      col = base * (0.72 + 0.08 * hh(vec3(seed, 1.7, 2.3))) * (amb + uSunColor * diff);
    }
    emis = vec3(0.9, 0.55, 0.3) * 0.012 * uNight;
  } else if (ny < -0.6) {
    col = base * 0.35 * amb;
  } else {
    float hgt = vUv.y;
    bool shops = style > 2.5 || (style < 0.5 && seed > 34.0);
    vec3 glass = vec3(0.07, 0.1, 0.14) + uAmbSky * 0.3;
    float fres = pow(1.0 - abs(dot(n, normalize(-vView))), 3.0);
    glass += uFogColor * (0.16 + 0.45 * fres) * (1.0 - uNight) + uWet * 0.04;
    vec3 surf = base;
    float w;
    if (shops && hgt < 4.3) {
      float u = vUv.x / 4.6; float fx = fract(u); vec2 id = vec2(floor(u), -7.0);
      vec2 fw = fwidth(vec2(u, hgt / 4.3));
      float aa = 1.0 - smoothstep(0.25, 0.7, max(fw.x, fw.y));
      float win = step(0.05, fx) * step(fx, 0.95) * step(0.25, hgt) * step(hgt, 3.05);
      float sign = step(3.25, hgt) * step(hgt, 4.15) * step(0.04, fx) * step(fx, 0.96);
      vec3 sc = 0.45 + 0.45 * cos(6.2831 * (hh(vec3(id, seed)) + vec3(0.0, 0.33, 0.67)));
      surf = mix(surf * 0.7, sc, sign * aa);
      glass = mix(glass, vec3(0.3, 0.28, 0.24), 0.3);
      emis += sc * sign * aa * uNight * 0.7 + vec3(1.0, 0.86, 0.62) * win * aa * uNight * 0.55 * step(0.35, hh(vec3(id, seed + 1.0)));
      w = mix(0.45, win, aa);
    } else {
      float y0 = shops ? hgt - 4.3 : hgt;
      vec2 cs = style < 0.5 ? vec2(1.9, 3.9) : (style > 1.5 && style < 2.5) ? vec2(3.7, 2.9) : vec2(3.3, 3.0);
      vec2 c = vec2(vUv.x / cs.x, y0 / cs.y); vec2 id = floor(c); vec2 f = fract(c);
      vec2 fw = fwidth(c);
      float aa = 1.0 - smoothstep(0.22, 0.65, max(fw.x, fw.y));
      float win;
      if (style < 0.5) win = step(0.07, f.x) * step(f.x, 0.93) * step(0.12, f.y) * step(f.y, 0.93);
      else if (style > 1.5 && style < 2.5) win = step(0.28, f.x) * step(f.x, 0.72) * step(0.4, f.y) * step(f.y, 0.8) * step(0.3, hh(vec3(id, seed + 5.0)));
      else {
        win = step(0.1, f.x) * step(f.x, 0.9) * step(0.36, f.y) * step(f.y, 0.94);
        float bal = step(f.y, 0.33) * step(0.04, f.y);
        surf = mix(surf, surf * 1.12 + 0.03, bal * aa);
      }
      float rl = hh(vec3(id, seed));
      float lit = step(style < 0.5 ? 0.62 : 0.66, rl) * step(0.0, y0) * (0.55 + 0.45 * hh(vec3(id.yx, seed + 3.0)));
      vec3 lc = style < 0.5 ? mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.9, 0.7), step(0.7, hh(vec3(id.yx, seed + 9.0))))
                            : mix(vec3(1.0, 0.74, 0.4), vec3(0.75, 0.85, 1.0), step(0.75, hh(vec3(id.yx, seed + 7.0))));
      emis += lc * mix(0.03, win * lit * 0.75, aa) * uNight;
      w = mix(style < 0.5 ? 0.55 : 0.3, win, aa);
    }
    vec3 wallc = mix(surf, glass, w * 0.82);
    float ao = mix(0.55, 1.0, smoothstep(-1.0, 7.0, vUv.y));
    col = wallc * ao * (amb + uSunColor * diff) * (1.0 - uWet * 0.22);
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
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight, uTint: shared.uTint, uWet: shared.uWet,
      uCurv: shared.uCurv, uSunDir: shared.uSunDir, uSunColor: shared.uSunColor,
      uAmbSky: shared.uAmbSky, uAmbGround: shared.uAmbGround, uTileS: shared.uTileS,
      uRoof: { value: null }, uHasRoof: { value: 0 },
    },
    vertexShader: BUILD_VS, fragmentShader: BUILD_FS,
  });
}

// ---------------- roads, sidewalks, rails, parks, water (+ elevated structures) ----------------
// uv.x = lateral metres from the centre line, uv.y = metres along.  aInfo = kind, lanes, flags, halfWidth*8
const ROAD_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv;
attribute vec4 aInfo;
varying vec2 vUv; varying vec4 vInfo; varying float vDist; varying vec2 vLocal; varying vec3 vView;
void main() {
  vUv = uv; vInfo = aInfo; vLocal = position.xz;
  ${CURVE_VERT}
  vView = mv.xyz;
  #include <logdepthbuf_vertex>
}
`;
const ROAD_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform float uWet; uniform float uTime;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uAmbSky; uniform vec3 uAmbGround;
varying vec2 vUv; varying vec4 vInfo; varying float vDist; varying vec2 vLocal; varying vec3 vView;
${HASH}
void main() {
  #include <logdepthbuf_fragment>
  float kind = floor(vInfo.x * 255.0 + 0.5);
  float lanes = floor(vInfo.y * 255.0 + 0.5);
  float flags = floor(vInfo.z * 255.0 + 0.5);
  float hw = vInfo.w * 255.0 / 8.0;
  vec2 lp = vLocal;
  float n1 = vnoise(lp * 0.33), n2 = vnoise(lp * 2.9);
  float lat = vUv.x, al = abs(lat), along = vUv.y;
  vec3 col; float alpha = 1.0; float glow = 0.0;
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  #ifdef STRUCT
  vec3 nv = normalize(cross(dFdx(vView), dFdy(vView)));
  nrm = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
  #endif
  if (kind < 0.5) {
    col = vec3(0.068, 0.07, 0.074) * (0.78 + 0.28 * n1 + 0.14 * n2);
    float m = 0.0, yel = 0.0;
    bool oneway = mod(flags, 2.0) > 0.5;
    if (lanes >= 2.0) {
      m = max(m, aband(hw - al, 0.15, 0.3));
      float per = oneway ? lanes : max(1.0, floor(lanes / 2.0));
      float lw = (oneway ? 2.0 * hw : hw) / per;
      if (!oneway) {
        if (lanes >= 4.0) { float c = aband(al, 0.06, 0.22); yel = c; m = max(m, c); }
        else m = max(m, aband(lat, -0.08, 0.08) * step(fract(along / 10.0), 0.5));
      }
      float off = oneway ? lat + hw : al;
      float k = off / lw; float idx = floor(k + 0.5); float d = (k - idx) * lw;
      if (idx >= 1.0 && idx <= per - 1.0) m = max(m, aband(d, -0.07, 0.07) * step(fract(along / 12.0), 0.45));
    } else if (mod(floor(flags / 2.0), 2.0) > 0.5) {
      m = max(m, aband(hw - al, 0.45, 0.6));
    }
    m *= 1.0 - smoothstep(160.0, 420.0, vDist);
    col = mix(col, mix(vec3(0.7), vec3(0.72, 0.5, 0.1), yel), m * 0.9);
    glow = 1.0;
  } else if (kind < 1.5) {
    vec2 g = fract(vec2(lat, along) / 0.5);
    float joint = max(1.0 - smoothstep(0.0, 0.07, g.x), 1.0 - smoothstep(0.0, 0.07, g.y)) * (1.0 - smoothstep(30.0, 90.0, vDist));
    col = vec3(0.29, 0.28, 0.265) * (0.84 + 0.24 * n1 + 0.08 * hh(vec3(floor(vec2(lat, along) / 0.5), 2.0))) * (1.0 - 0.25 * joint);
    glow = 1.0;
  } else if (kind < 2.5) {
    col = vec3(0.31, 0.285, 0.24) * (0.8 + 0.3 * n1 + 0.12 * n2);
    glow = 0.7;
  } else if (kind < 3.5) {
    float tc = hw > 3.0 ? (lat > 0.0 ? hw * 0.5 : -hw * 0.5) : 0.0; float r = abs(lat - tc);
    col = vec3(0.2, 0.185, 0.17) * (0.55 + 0.9 * hh(vec3(floor(lp * 9.0), 4.0)));
    float sl = step(r, 1.25) * step(fract(along / 0.62), 0.32) * (1.0 - smoothstep(40.0, 120.0, vDist));
    col = mix(col, vec3(0.16, 0.12, 0.09), sl);
    col = mix(col, vec3(0.42, 0.42, 0.44), aband(r, 0.69, 0.81));
  } else if (kind < 4.5) {
    col = vec3(0.4, 0.4, 0.39) * (0.85 + 0.2 * n1 + 0.08 * n2);
  } else if (kind < 7.5 && kind > 6.5) {
    float rip = vnoise(lp * 0.8 + uTime * 0.25) * 0.5 + vnoise(lp * 2.3 - uTime * 0.35) * 0.5;
    vec3 v = normalize(-vView);
    col = mix(vec3(0.02, 0.05, 0.065), uFogColor * 0.55, 0.35 + 0.25 * rip);
    alpha = 0.92;
  } else {
    // grass (kind 6 verges, 12 parks)
    col = vec3(0.075, 0.13, 0.04) * (0.6 + 0.5 * n1 + 0.35 * n2);
    alpha = 1.0 - smoothstep(60.0, 150.0, vDist);
  }
  vec3 amb = mix(uAmbGround, uAmbSky, nrm.y * 0.5 + 0.5);
  col *= amb + uSunColor * max(dot(nrm, uSunDir), 0.0) * 0.95;
  col *= 1.0 - uWet * 0.3;
  if (kind < 0.5 && uWet > 0.0) col += uFogColor * 0.08 * uWet;
  col += vec3(0.045, 0.04, 0.032) * uNight * glow * (0.7 + 0.3 * n1);
  ${FOG_FRAG}
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
function roadUniforms() {
  return {
    uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight, uWet: shared.uWet, uTime: shared.uTime,
    uCurv: shared.uCurv, uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uAmbSky: shared.uAmbSky, uAmbGround: shared.uAmbGround,
  };
}
// flat overlays: drawn right after the ground, always on top of it, alpha-blended (parks fade out far away)
export function overlayMaterial() {
  const m = new THREE.ShaderMaterial({ uniforms: roadUniforms(), vertexShader: ROAD_VS, fragmentShader: ROAD_FS, depthTest: false, depthWrite: false, transparent: false });
  m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  return m;
}
export function structMaterial() {
  return new THREE.ShaderMaterial({ uniforms: roadUniforms(), vertexShader: ROAD_VS, fragmentShader: ROAD_FS, defines: { STRUCT: 1 }, side: THREE.DoubleSide });
}

// ---------------- sky ----------------
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
uniform float uNight; uniform float uHorizonY; uniform float uCloud;
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
  col += uSunColor * (disc * mix(5.0, 1.6, uNight) * (1.0 - uCloud * 0.9) + glow * (1.0 - uNight * 0.75) * (1.0 - uCloud * 0.6));
  if (uNight > 0.45 && h > -0.05) {
    vec3 p = d * 280.0; vec3 id = floor(p); vec3 fp = fract(p) - 0.5;
    float r = hh(id);
    float s = step(0.9925, r) * smoothstep(0.34, 0.0, length(fp)) * (0.45 + 0.55 * hh(id + 3.0));
    col += vec3(0.9, 0.95, 1.0) * s * smoothstep(0.45, 1.0, uNight) * smoothstep(-0.02, 0.2, h) * 1.4 * (1.0 - uCloud);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
export function skyMaterial(u) {
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false });
}

// Light pillar for stamp spots and the destination marker
const BEAM_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vH;
void main() {
  vH = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const BEAM_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
varying float vH;
void main() {
  #include <logdepthbuf_fragment>
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

// Patch a built-in material so it follows the earth curvature (landmarks, hero, vehicles, trees ...).
export function addCurvature(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCurv = shared.uCurv;
    sh.vertexShader = 'uniform float uCurv;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        mvPosition = batchingMatrix * mvPosition;
      #endif
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
