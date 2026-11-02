import * as THREE from 'three';

const emptyMask=new THREE.DataTexture(new Uint8Array([0]),1,1,THREE.RedFormat);emptyMask.needsUpdate=true;
const whiteMask=new THREE.DataTexture(new Uint8Array([255]),1,1,THREE.RedFormat);whiteMask.needsUpdate=true;
export const dryMask=emptyMask;

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
  uSkyTop: { value: new THREE.Color('#3d7ad0') },
  uWaterDetail: { value: 2 },
  uShadowMap: { value: whiteMask },
  uShadowBounds: { value: new THREE.Vector4(0,0,1,1) },
  uShadowStrength: { value: 0 },
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

const SHADOW_FRAG = /* glsl */`
uniform sampler2D uShadowMap; uniform vec4 uShadowBounds; uniform float uShadowStrength;
float groundShadow(vec2 world) {
  vec2 q=(world-uShadowBounds.xy)/uShadowBounds.zw;
  if(any(lessThan(q,vec2(0.0)))||any(greaterThan(q,vec2(1.0))))return 1.0;
  float edge=smoothstep(0.0,0.05,min(min(q.x,q.y),min(1.0-q.x,1.0-q.y)));
  return mix(1.0,texture2D(uShadowMap,q).r,uShadowStrength*edge);
}
`;
const shadowUniforms=()=>({uShadowMap:shared.uShadowMap,uShadowBounds:shared.uShadowBounds,uShadowStrength:shared.uShadowStrength});
const GROUND_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv; uniform vec2 uOff;
varying vec2 vUv; varying float vDist; varying vec2 vW; varying vec3 vWorld;
void main() {
  vUv = uv; vW = position.xz + uOff;vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  ${CURVE_VERT}
  #include <logdepthbuf_vertex>
}
`;
const GROUND_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform sampler2D uWaterMask;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight; uniform vec3 uTint; uniform float uWet;
varying vec2 vUv; varying float vDist; varying vec2 vW; varying vec3 vWorld;
${HASH}
${SHADOW_FRAG}
void main() {
  #include <logdepthbuf_fragment>
  if(texture2D(uWaterMask,vUv).r>0.5)discard;
  vec3 c = texture2D(map, vUv).rgb;
  float near = 1.0 - smoothstep(12.0, 70.0, vDist);
  if (near > 0.0) c *= 1.0 + near * ((vnoise(vW * 2.0) - 0.5) * 0.35 + (vnoise(vW * 7.0) - 0.5) * 0.25);
  vec3 col = c * uTint * (1.0 - uWet * 0.2) * mix(0.62,1.0,groundShadow(vWorld.xz));
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
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function groundMaterial(tex, off) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, uWaterMask:{value:emptyMask}, ...shadowUniforms(), uOff: { value: new THREE.Vector2(off[0], off[1]) },
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
      float rm = vnoise(vLocal * 0.35 + seed * 1.7) * 0.6 + vnoise(vLocal * 2.6 + seed * 3.1) * 0.4;
      col = base * (0.70 + 0.10 * hh(vec3(seed, 1.7, 2.3)) + 0.18 * (rm - 0.5)) * (amb + uSunColor * diff);
    }
    emis = vec3(0.9, 0.55, 0.3) * 0.012 * uNight;
  } else if (ny < -0.6) {
    col = base * 0.35 * amb;
  } else {
    float hgt = vUv.y;
    // Real storefront map signs are separate meshes; never invent shop bands.
    bool shops = false;
    vec3 glass = vec3(0.07, 0.1, 0.14) + uAmbSky * 0.3;
    float fres = pow(1.0 - abs(dot(n, normalize(-vView))), 3.0);
    glass += uFogColor * (0.16 + 0.45 * fres) * (1.0 - uNight) + uWet * 0.04;
    vec3 surf = base;
    surf *= 0.93 + 0.09 * vnoise(vec2(vUv.x * 1.4, vUv.y * 0.22) + seed * 2.7) + 0.05 * vnoise(vUv * 3.1 + seed * 5.3);
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
  if(abs(ny)<.6&&vUv.y>=0.0){
    vec3 nv=normalize(cross(dFdx(vView),dFdy(vView))),V=normalize(-vView),L=normalize((viewMatrix*vec4(uSunDir,0.0)).xyz);
    float glint=pow(max(dot(reflect(-L,nv),V),0.0),64.0);
    col+=uSunColor*glint*.16*(1.0-uNight);
  }
  col += emis;
  ${FOG_FRAG}
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function buildingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight, uTint: shared.uTint, uWet: shared.uWet,
      ...shadowUniforms(),uWaterMask:{value:emptyMask},uMaskTileS:shared.uTileS,
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
varying vec2 vUv; varying vec4 vInfo; varying float vDist; varying vec2 vLocal; varying vec3 vView; varying vec2 vRoadWorld;
void main() {
  vUv = uv; vInfo = aInfo; vLocal = position.xz;vRoadWorld=(modelMatrix*vec4(position,1.0)).xz;
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
varying vec2 vUv; varying vec4 vInfo; varying float vDist; varying vec2 vLocal; varying vec3 vView; varying vec2 vRoadWorld;
${HASH}
${SHADOW_FRAG}
uniform sampler2D uWaterMask;uniform float uMaskTileS;
void main() {
  #include <logdepthbuf_fragment>
  float kind = floor(vInfo.x * 255.0 + 0.5);
  if(kind>4.5&&texture2D(uWaterMask,vLocal/uMaskTileS+0.5).r>0.5)discard;
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
  col *= (1.0 - uWet * 0.3)*mix(.58,1.0,groundShadow(vRoadWorld));
  if (kind < 0.5 && uWet > 0.0) col += uFogColor * 0.08 * uWet;
  col += vec3(0.045, 0.04, 0.032) * uNight * glow * (0.7 + 0.3 * n1);
  ${FOG_FRAG}
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
function roadUniforms() {
  return {
    uFogColor: shared.uFogColor, uFogDensity: shared.uFogDensity, uNight: shared.uNight, uWet: shared.uWet, uTime: shared.uTime,
    ...shadowUniforms(),uWaterMask:{value:emptyMask},uMaskTileS:shared.uTileS,
    uCurv: shared.uCurv, uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uAmbSky: shared.uAmbSky, uAmbGround: shared.uAmbGround,
  };
}
const WATER_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uCurv;attribute vec4 aInfo;
varying vec3 vWorld;varying float vDist;varying float vType;
void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;vType=aInfo.y*255.0;
${CURVE_VERT}
#include <logdepthbuf_vertex>
}
`;
const WATER_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime,uNight,uWet,uWaterDetail,uFogDensity;
uniform vec3 uFogColor,uSkyTop,uSunDir,uSunColor;
varying vec3 vWorld;varying float vDist;varying float vType;
${HASH}
void main(){
#include <logdepthbuf_fragment>
  vec2 p=vWorld.xz;
  float ocean=1.0-step(.5,vType),pool=step(2.5,vType),wind=mix(.55,1.0,ocean)*(1.0+.7*uWet);
  float phase=dot(p,vec2(.73,.41))*.75+uTime*1.2;
  float phase2=dot(p,vec2(-.38,.92))*1.53-uTime*.93;
  vec2 slope=vec2(.73,.41)*cos(phase)*.08+vec2(-.38,.92)*cos(phase2)*.045;
  if(uWaterDetail>1.5){float q=dot(p,vec2(.89,-.23))*5.1+uTime*2.3;slope+=vec2(.89,-.23)*cos(q)*.025;}
  vec3 N=normalize(vec3(-slope.x*wind,1.0,-slope.y*wind)),V=normalize(cameraPosition-vWorld),R=reflect(-V,N);
  float fresnel=.0204+.9796*pow(1.0-max(dot(N,V),0.0),5.0);
  vec3 sky=mix(uFogColor,uSkyTop,smoothstep(-.05,.85,R.y));
  if(uWaterDetail>2.5){float cloud=smoothstep(.52,.73,vnoise(R.xz/max(.2,R.y)*2.0+uTime*.008));sky=mix(sky,uFogColor*1.1,cloud*.2);}
  vec3 deep=mix(vec3(.012,.075,.092),vec3(.025,.105,.075),step(.5,vType));deep=mix(deep,vec3(.025,.22,.28),pool);
  deep*=mix(.07,1.0,1.0-uNight);
  float sparkle=pow(max(dot(reflect(-uSunDir,N),V),0.0),mix(180.0,700.0,1.0-uWet));
  vec3 col=mix(deep,sky,fresnel*.93)+uSunColor*sparkle*1.8;
  col+=vec3(.018,.035,.035)*vnoise(p*3.0+uTime*.15)*(1.0-uNight);
${FOG_FRAG}
  gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;
export function waterMaterial(){return new THREE.ShaderMaterial({uniforms:{uCurv:shared.uCurv,uTime:shared.uTime,uNight:shared.uNight,uWet:shared.uWet,uWaterDetail:shared.uWaterDetail,uFogColor:shared.uFogColor,uFogDensity:shared.uFogDensity,uSkyTop:shared.uSkyTop,uSunDir:shared.uSunDir,uSunColor:shared.uSunColor},vertexShader:WATER_VS,fragmentShader:WATER_FS,side:THREE.DoubleSide,depthTest:true,depthWrite:true});}
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
  #include <tonemapping_fragment>
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
  #include <tonemapping_fragment>
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
