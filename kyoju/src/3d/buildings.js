// 建物の描画：家（インスタンス描画）、名所、城壁、通り、瓦礫。
import * as THREE from 'three';
import { GLSL_NOISE, mulberry32, clamp, lerp } from './noise.js';
import { groundH, heightAt } from './world.js';
import { ribbonGeometry, roadMaterial } from './terrain.js';

/* ---------- 共通 GLSL：壁と屋根の模様 ---------- */
const WALL_GLSL = /* glsl */`
vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }
vec3 plasterTint(float h){
  if (h < 0.35) return vec3(0.87,0.84,0.77);
  if (h < 0.5) return vec3(0.82,0.69,0.47);
  if (h < 0.62) return vec3(0.83,0.66,0.6);
  if (h < 0.74) return vec3(0.7,0.75,0.77);
  if (h < 0.86) return vec3(0.74,0.77,0.64);
  return vec3(0.9,0.88,0.82);
}
// u: 面に沿った横位置(m), v: 高さ(m), W: 面の幅, H: 壁の高さ
vec3 wallPattern(float style, float u, float v, float W, float H, float face, float seed, float hue, float night, float lit, float isHouse, out float rough, out vec3 emis){
  rough = 0.9; emis = vec3(0.0);
  float floorH = 3.0;
  float fi = floor(v / floorH); float fv = v - fi*floorH;
  float np = max(1.0, floor(W / 1.7)); float pw = W / np;
  float pid = floor((u + W*0.5) / pw); float pu = fract((u + W*0.5) / pw);
  float wh = hash3i(ivec3(int(pid), int(fi), int(face*7.0 + seed*977.0)));
  bool topFloor = (fi + 1.0)*floorH > H - 0.4;
  bool win = isHouse > 0.5 && wh < 0.62 && fv > 0.85 && fv < 2.25 && pu > 0.27 && pu < 0.73 && v < H - 0.5 && np > 0.0 && !(fi < 0.5 && face < 0.5 && pid == floor(np*0.5 + seed*0.4));
  bool door = isHouse > 0.5 && face < 0.5 && fi < 0.5 && pid == floor(np*0.5 + seed*0.4) && pu > 0.22 && pu < 0.78 && fv < 2.25;
  vec3 c;
  float n = vnoise(vec2(u*2.1 + seed*31.0, v*2.1));
  if (style < 0.5) {
    // 木骨造（漆喰と黒い木組み）
    vec3 plaster = mix(vec3(0.8,0.77,0.69), plasterTint(hue), 0.25) * (0.88 + 0.12*n);
    vec3 wood = vec3(0.22,0.14,0.09) * (0.85 + 0.25*vnoise(vec2(u*9.0, v*0.8)));
    float post = step(pu*pw, 0.13) + step((1.0-pu)*pw, 0.13);
    float rail = step(fv, 0.17) + step(floorH - 0.12, fv) + step(abs(fv - 0.86), 0.07)*step(0.5, 1.0 - float(win));
    float brace = 0.0;
    if (!win && !door) {
      float x = pu*pw, y = fv;
      float k = (floorH - 0.3) / pw;
      float hb = hash3i(ivec3(int(pid)+11, int(fi)+3, int(seed*99.0)));
      if (hb < 0.35) brace = step(abs(y - (x*k + 0.15)), 0.1) + step(abs(y - ((pw - x)*k + 0.15)), 0.1);
      else if (hb < 0.65) brace = step(abs(y - (x*k + 0.15)), 0.1);
      else if (hb < 0.85) brace = step(abs(y - ((pw - x)*k*0.55 + 0.15)), 0.09)*step(y, 1.6);
    }
    float beam = clamp(post + rail + brace, 0.0, 1.0);
    c = mix(plaster, wood, beam);
    rough = mix(0.92, 0.75, beam);
  } else if (style < 1.5) {
    // 石造（切石積み）
    float row = floor(v / 0.42); float off = mod(row, 2.0) * 0.37;
    float bl = 0.68 + 0.3*hash2i(ivec2(int(row), 7));
    float bid = floor((u + off) / bl);
    float bu = fract((u + off) / bl), bv = fract(v / 0.42);
    float mortar = 1.0 - step(0.035, bu*bl) * step(0.035, (1.0-bu)*bl) * step(0.05, bv) * step(0.05, 1.0-bv);
    float bh = hash2i(ivec2(int(bid), int(row)) + ivec2(int(seed*991.0), 3));
    vec3 stone = mix(vec3(0.5,0.47,0.42), vec3(0.6,0.57,0.51), bh) * (0.8 + 0.25*n);
    stone = mix(stone, vec3(0.44,0.4,0.33), hash2i(ivec2(int(bid)+5, int(row)))*0.35);
    stone *= 0.85 + 0.25*vnoise(vec2(u*0.15, v*0.25) + seed*7.0);
    c = mix(stone, vec3(0.33,0.31,0.28), mortar*0.8);
    rough = 0.94;
  } else {
    // 漆喰塗り（色つき）と隅石
    vec3 paint = plasterTint(hue) * (0.9 + 0.12*n);
    float edge = min((u + W*0.5), (W*0.5 - u));
    float qrow = floor(v / 0.5);
    float qw = mod(qrow, 2.0) < 0.5 ? 0.55 : 0.35;
    float quoin = step(edge, qw) * step(0.04, fract(v/0.5)) ;
    c = mix(paint, vec3(0.7,0.66,0.58)*(0.85+0.2*n), quoin);
    rough = 0.9;
  }
  if (win) {
    vec2 wq = vec2((pu - 0.27)/0.46, (fv - 0.85)/1.4);
    float frame = step(wq.x, 0.08) + step(0.92, wq.x) + step(wq.y, 0.06) + step(0.94, wq.y);
    vec2 dia = vec2(wq.x*4.0 + wq.y*5.6, wq.x*4.0 - wq.y*5.6);
    float lead = step(0.88, fract(dia.x)) + step(0.88, fract(dia.y));
    bool shut = hash3i(ivec3(int(pid)+7, int(fi), int(seed*311.0))) < 0.35 && style > 0.5;
    vec3 glass = vec3(0.07,0.08,0.09) + vec3(0.06,0.07,0.08)*vnoise(wq*3.0);
    float on = step(hash3i(ivec3(int(pid)+3, int(fi)+9, int(seed*577.0))), 0.55) * lit;
    vec3 warm = vec3(1.0,0.62,0.28) * (0.8 + 0.4*vnoise(wq*2.0 + seed));
    glass = mix(glass, warm*0.35, on*night);
    emis = warm * 2.2 * on * night * (1.0 - clamp(lead, 0.0, 1.0)) * (1.0 - clamp(frame,0.0,1.0));
    c = mix(glass, vec3(0.16,0.1,0.06), clamp(lead*0.8 + frame, 0.0, 1.0));
    if (shut) { c = vec3(0.24,0.3,0.2)*(0.8+0.3*vnoise(wq*vec2(1.0,9.0))); emis = vec3(0.0); }
    rough = 0.35;
  }
  // 窓まわりの石枠（石造・漆喰）
  if (!win && style > 0.5 && isHouse > 0.5 && wh < 0.62 && fv > 0.75 && fv < 2.35 && pu > 0.22 && pu < 0.78 && v < H - 0.5 && !door) c = mix(c, vec3(0.7,0.66,0.58), 0.8);
  if (door) {
    float plank = step(0.85, fract((pu - 0.22)/0.56*5.0));
    c = vec3(0.28,0.17,0.1) * (0.8 + 0.3*vnoise(vec2(pu*30.0, fv*2.0))) * (1.0 - plank*0.4);
    if (fv > 2.1) c = vec3(0.6,0.56,0.5);
    rough = 0.8;
  }
  // Fade subpixel windows, mortar and timber to area-averaged materials.
  float footprint = max(length(fwidth(vec2(u,v))), 0.001);
  vec3 distant = style < 0.5 ? vec3(0.48,0.43,0.35) : style < 1.5 ? vec3(0.52,0.49,0.43) : plasterTint(hue)*0.85;
  float detail = 1.0 - smoothstep(0.08, 0.65, footprint);
  c = mix(distant, c, detail);
  emis *= detail;
  // 地面際の汚れ
  c *= mix(0.62, 1.0, smoothstep(0.0, 0.9, v + n*0.3));
  return c;
}
// 屋根：x=棟に沿う位置, y=軒からの斜面距離
vec3 roofPattern(float type, vec2 r, float seed, float hue, out float rough){
  vec3 c; rough = 0.85;
  float n = vnoise(r*0.7 + seed*17.0);
  if (type < 0.5) {
    // 瓦（赤茶）
    float row = floor(r.y / 0.3); float off = mod(row, 2.0)*0.13;
    float col = floor((r.x + off) / 0.26);
    float fy = fract(r.y/0.3), fx = fract((r.x + off)/0.26);
    float th = hash2i(ivec2(int(col), int(row)) + ivec2(int(seed*733.0), 1));
    vec3 base = mix(vec3(0.55,0.26,0.17), vec3(0.66,0.36,0.22), hue) * (0.8 + 0.3*th);
    c = base * (0.7 + 0.3*smoothstep(0.0, 0.5, fy)) * (0.88 + 0.12*smoothstep(0.0,0.2,min(fx,1.0-fx)));
    c = mix(c, vec3(0.32,0.34,0.2), smoothstep(0.62, 0.85, vnoise(r*0.35 + seed*5.0))*0.45);
    rough = 0.72;
  } else if (type < 1.5) {
    // スレート（青灰）
    float row = floor(r.y / 0.22); float off = mod(row, 2.0)*0.11;
    float col = floor((r.x + off) / 0.24);
    float th = hash2i(ivec2(int(col), int(row)) + ivec2(int(seed*733.0), 5));
    float fy = fract(r.y/0.22);
    c = mix(vec3(0.2,0.205,0.22), vec3(0.29,0.295,0.31), th) * (0.75 + 0.25*smoothstep(0.0, 0.4, fy));
    rough = 0.78;
  } else {
    // 藁葺き
    float f1 = vnoise(vec2(r.x*7.0, r.y*0.6 + seed*13.0));
    float f2 = vnoise(vec2(r.x*23.0, r.y*1.5));
    c = mix(vec3(0.42,0.34,0.2), vec3(0.6,0.5,0.32), f1*0.7 + f2*0.3) * (0.75 + 0.3*n);
    c = mix(c, vec3(0.25,0.24,0.15), smoothstep(0.55, 0.9, vnoise(r*0.25 + seed))*0.5);
    rough = 0.98;
  }
  float footprint = length(fwidth(r));
  vec3 average = type < 0.5 ? mix(vec3(0.39,0.20,0.13), vec3(0.50,0.27,0.17), hue) : type < 1.5 ? vec3(0.25,0.26,0.28) : vec3(0.46,0.39,0.25);
  return mix(c, average, smoothstep(0.05,0.5,footprint));
}
float damageHole(vec2 p, float dmg, float seed){
  if (dmg < 0.5) return 0.0;
  float h = vnoise(p*0.45 + seed*41.0)*0.7 + vnoise(p*1.3)*0.3;
  return step(1.28 - dmg*0.9, h);
}
`;

function patchCommon(sh, engine) {
  sh.uniforms.uNight = engine.uniforms.uNight;
  sh.uniforms.uTime = engine.uniforms.uTime;
}

/* ---------- 家の壁（インスタンス） ---------- */
function houseWallMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    patchCommon(sh, engine);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iSize; attribute vec4 iStyle; attribute vec4 iState;\nvarying vec3 vL; varying vec3 vNL; varying vec3 vSz; varying vec4 vSt; varying vec4 vSs;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position * iSize; vL = transformed; vNL = normal; vSz = iSize; vSt = iStyle; vSs = iState;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vL; varying vec3 vNL; varying vec3 vSz; varying vec4 vSt; varying vec4 vSs;\n' + GLSL_NOISE + WALL_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        bool sx = abs(vNL.x) > 0.5; bool top = vNL.y > 0.5 || vNL.y < -0.5;
        float u = sx ? vL.z : vL.x; float W = sx ? vSz.z : vSz.x;
        float face = sx ? (vNL.x > 0.0 ? 1.0 : 3.0) : (vNL.z > 0.0 ? 2.0 : 0.0);
        float vOff = vSt.w;
        float rgh; vec3 em;
        vec3 col = wallPattern(vSt.x, u, vL.y + vOff, W, vSz.y + vOff, face, vSt.z, vSt.y, uNight, vSs.z, 1.0, rgh, em);
        if (top) { col = vec3(0.25,0.22,0.2); em = vec3(0.0); }
        // 破損：割れ目と煤と穴
        vec3 cc = cell2(vec2(u, vL.y)*0.55 + vSt.z*13.0);
        float crack = (1.0 - smoothstep(0.0, 0.05, cc.y - cc.x)) * step(0.25, vSs.x) * step(0.45, vnoise(vec2(u, vL.y)*0.3 + vSt.z*7.0));
        col = mix(col, vec3(0.08,0.07,0.06), crack*0.85);
        float soot = vSs.y * smoothstep(0.2, 0.75, vnoise(vec2(u*0.5, vL.y*0.35) + vSt.z*3.0) + vL.y/max(vSz.y,1.0)*0.4);
        col = mix(col, vec3(0.04,0.035,0.03), clamp(soot, 0.0, 0.95));
        em *= 1.0 - vSs.x;
        if (damageHole(vec2(u, vL.y), vSs.x, vSt.z) > 0.5) discard;
        if (vSs.w > 0.0) { float cut = vSz.y * (0.55 + 0.45*vnoise(vec2(u*0.45 + vSt.z*20.0, 1.0))) ; if (vL.y > cut) discard; }
        if (!gl_FrontFacing) { col = mix(vec3(0.16,0.12,0.09), vec3(0.03), vSs.y); em = vec3(0.0); }
        diffuseColor.rgb = s2l(col);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = rgh;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += em;');
  };
  m.customProgramCacheKey = () => 'housewall';
  return m;
}
function roofMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    patchCommon(sh, engine);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iSize; attribute vec4 iStyle; attribute vec4 iState; attribute vec2 aR;\nvarying vec2 vRU; varying vec3 vRL; varying float vGab; varying vec4 vSt; varying vec4 vSs; varying vec3 vSz;')
      .replace('#include <begin_vertex>', `vec3 transformed = position * iSize;
        float ov = iStyle.x > 1.5 ? 0.75 : 0.45;
        float slope = iSize.y / max(0.5*iSize.x, 0.1);
        if (aR.y > 0.5) { transformed.x += sign(position.x) * ov; transformed.y -= ov * slope; }
        if (aR.x > 0.5) transformed.z += sign(position.z) * (iStyle.x > 1.5 ? 0.6 : 0.35);
        float sl = sqrt(1.0 + slope*slope);
        vRU = vec2(transformed.z, (iSize.y - transformed.y) / slope * sl);
        vRL = transformed; vGab = 1.0 - aR.x; vSt = iStyle; vSs = iState; vSz = iSize;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec2 vRU; varying vec3 vRL; varying float vGab; varying vec4 vSt; varying vec4 vSs; varying vec3 vSz;\n' + GLSL_NOISE + WALL_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float rgh; vec3 col; vec3 em = vec3(0.0);
        if (vGab > 0.5) { col = wallPattern(vSt.w, vRL.x, vRL.y + 30.0, vSz.x, 40.0, 0.0, vSt.z, vSt.y, uNight, 0.0, 0.0, rgh, em);
          if (vSt.w < 0.5) { float tri = step(abs(vRL.x), 0.12) ; col = mix(col, vec3(0.22,0.14,0.09), tri); } }
        else col = roofPattern(vSt.x, vRU, vSt.z, vSt.y, rgh);
        float soot = vSs.y * smoothstep(0.25, 0.7, vnoise(vRU*0.4 + vSt.z*9.0));
        col = mix(col, vec3(0.03,0.025,0.02), clamp(soot*1.1, 0.0, 0.97));
        if (vGab < 0.5 && damageHole(vRU, max(vSs.x, vSs.y*0.9), vSt.z + 0.3) > 0.5) discard;
        if (!gl_FrontFacing) col = mix(vec3(0.13,0.1,0.08), vec3(0.02), vSs.y);
        diffuseColor.rgb = s2l(col);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = rgh;');
  };
  m.customProgramCacheKey = () => 'houseroof';
  return m;
}
function rubbleMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  m.onBeforeCompile = (sh) => {
    patchCommon(sh, engine);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iSize; attribute vec4 iStyle; attribute vec4 iState; varying vec3 vL; varying vec4 vSt; varying vec4 vSs;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position * iSize; vL = transformed; vSt = iStyle; vSs = iState;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uTime; varying vec3 vL; varying vec4 vSt; varying vec4 vSs;\n' + GLSL_NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 cc = cell3(vL*1.6 + vSt.z*10.0);
        float stone = smoothstep(0.02, 0.15, cc.y - cc.x);
        vec3 a = vSt.x < 0.5 ? mix(vec3(0.62,0.58,0.5), vec3(0.3,0.2,0.13), step(0.6, cc.z)) : mix(vec3(0.55,0.52,0.47), vec3(0.66,0.62,0.55), cc.z);
        if (vSt.x > 1.5) a = mix(vec3(0.7,0.66,0.58), vec3(0.62,0.32,0.2), step(0.55, cc.z));
        vec3 col = mix(vec3(0.2,0.18,0.16), a*(0.75+0.35*cc.z), stone);
        col = mix(col, vec3(0.05,0.04,0.035), vSs.y*smoothstep(0.3, 0.8, vnoise(vL.xz*0.6 + vSt.z)));
        diffuseColor.rgb = pow(col, vec3(2.2));
        float ember = vSs.y * smoothstep(0.78, 0.95, vnoise(vL.xz*1.7 + vec2(uTime*0.15, 0.0))) * (1.0 - stone);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0,0.35,0.08) * ember * 3.0;');
  };
  m.customProgramCacheKey = () => 'rubble';
  return m;
}

/* ---------- 単位ジオメトリ ---------- */
function unitBox() { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }
function unitRoof() {
  // 切妻屋根：x=-0.5..0.5（妻側の幅）, y=0..1, z=-0.5..0.5（棟の方向）
  const P = [], R = [], I = [];
  const v = (x, y, z, s, e) => { P.push(x, y, z); R.push(s, e); return P.length / 3 - 1; };
  // 斜面（左右）
  for (const sd of [-1, 1]) {
    const a = v(sd * 0.5, 0, -0.5, 1, 1), b = v(sd * 0.5, 0, 0.5, 1, 1), c = v(0, 1, 0.5, 1, 0), d = v(0, 1, -0.5, 1, 0);
    if (sd < 0) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c);
  }
  // 妻（三角）
  for (const sz of [-1, 1]) {
    const a = v(-0.5, 0, sz * 0.5, 0, 0), b = v(0.5, 0, sz * 0.5, 0, 0), c = v(0, 1, sz * 0.5, 0, 0);
    if (sz > 0) I.push(a, b, c); else I.push(a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(R, 2));
  g.setIndex(I);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
function unitRoofGeo() { const g = unitRoof(); return g; }
function unitMound() {
  const g = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  const rng = mulberry32(77);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.5 * rng();
    p.setXYZ(i, x * (1 + (rng() - 0.5) * 0.2), y * 2 * k * 0.55, z * (1 + (rng() - 0.5) * 0.2));
  }
  g.computeVertexNormals();
  return g;
}

const BOX_VERT = 'vec3 transformed = position * iSize;';
const ROOF_VERT = `vec3 transformed = position * iSize;
        float ov = iStyle.x > 1.5 ? 0.75 : 0.45;
        float slope = iSize.y / max(0.5*iSize.x, 0.1);
        if (aR.y > 0.5) { transformed.x += sign(position.x) * ov; transformed.y -= ov * slope; }
        if (aR.x > 0.5) transformed.z += sign(position.z) * (iStyle.x > 1.5 ? 0.6 : 0.35);`;
function depthMat(vert, roof) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iSize; attribute vec4 iStyle;' + (roof ? ' attribute vec2 aR;' : ''))
      .replace('#include <begin_vertex>', vert);
  };
  m.customProgramCacheKey = () => 'depth' + (roof ? 'roof' : 'box');
  return m;
}
const DEPTH = {};
function addInstAttr(geo, name, n, size) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; }
function instMesh(geo, mat, n, cast = true) {
  const g = geo.clone();
  const m = new THREE.InstancedMesh(g, mat, n);
  m.castShadow = cast; m.receiveShadow = true;
  const roof = !!g.attributes.aR;
  const key = roof ? 'roof' : 'box';
  if (!DEPTH[key]) DEPTH[key] = depthMat(roof ? ROOF_VERT : BOX_VERT, roof);
  m.customDepthMaterial = DEPTH[key];
  m.attrs = { size: addInstAttr(g, 'iSize', n, 3), style: addInstAttr(g, 'iStyle', n, 4), state: addInstAttr(g, 'iState', n, 4) };
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/* ---------- 一つの集落の家並み ---------- */
export class HouseSet {
  constructor(engine, town, mats) {
    this.town = town;
    const B = town.buildings;
    const n = B.length;
    this.n = n;
    this.group = new THREE.Group();
    const nUp = B.filter((b) => b.jetty > 0).length;
    const nCh = B.filter((b) => !b.barn && b.roof !== 2).length;
    this.lower = instMesh(mats.box, mats.wall, n);
    this.upper = instMesh(mats.box, mats.wall, Math.max(1, nUp));
    this.roof = instMesh(mats.roof, mats.roofM, n);
    this.chim = instMesh(mats.box, mats.wall, Math.max(1, nCh));
    this.rubble = instMesh(mats.mound, mats.rubble, n, false);
    this.beams = new THREE.InstancedMesh(mats.beam, mats.beamM, n * 3);
    this.beams.castShadow = true;
    this.upper.count = 0; this.chim.count = 0; this.rubble.count = 0; this.beams.count = 0;
    this.group.add(this.lower, this.upper, this.roof, this.chim, this.rubble, this.beams);
    for (let i = 0; i < n; i++) { B[i].hi = i; B[i].set = this; this.place(B[i]); }
    for (const m of [this.lower, this.upper, this.roof, this.chim]) { m.computeBoundingSphere(); m.boundingSphere.radius += 60; m.frustumCulled = true; }
    this.rubble.frustumCulled = false; this.beams.frustumCulled = false;
    this.anim = new Set();
    this.dirty = false;
    engine.scene.add(this.group);
  }
  baseY(b) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    let y = 1e9;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const lx = dx * b.w / 2, lz = dz * b.d / 2;
      y = Math.min(y, groundH(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
    }
    return y;
  }
  place(b) {
    const i = b.hi;
    b.y = this.baseY(b);
    const groundFloor = b.jetty > 0 ? 3.1 : b.h;
    b.gf = groundFloor;
    _q.setFromAxisAngle(UP, b.rot);
    _p.set(b.x, b.y, b.z); this.lower.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.lower.attrs.size.setXYZ(i, b.w, groundFloor, b.d);
    const lit = b.barn ? 0 : (b.seed * 7.3) % 1 < 0.75 ? 1 : 0;
    b.lit = lit;
    this.lower.attrs.style.setXYZW(i, b.style === 0 && b.jetty > 0 ? (b.seed < 0.5 ? 1 : 2) : b.style, b.hue, b.seed, 0);
    this.lower.attrs.state.setXYZW(i, 0, 0, lit, 0);
    b.ui = -1;
    if (b.jetty > 0) {
      const u = (b.ui = this.upper.count++);
      const j = b.jetty;
      _p.set(b.x, b.y + groundFloor, b.z); this.upper.setMatrixAt(u, _m.compose(_p, _q, _s));
      this.upper.attrs.size.setXYZ(u, b.w + j * 0.4, b.h - groundFloor, b.d + j * 2);
      this.upper.attrs.style.setXYZW(u, 0, b.hue, b.seed + 0.37, groundFloor);
      this.upper.attrs.state.setXYZW(u, 0, 0, lit, 0);
    }
    const span = b.ridge === 0 ? b.w + (b.jetty ? b.jetty * 0.4 : 0) : b.d + (b.jetty ? b.jetty * 2 : 0);
    const len = b.ridge === 0 ? b.d + (b.jetty ? b.jetty * 2 : 0) : b.w + (b.jetty ? b.jetty * 0.4 : 0);
    const rh = (span / 2) * b.pitch;
    b.roofH = rh;
    const rq = b.ridge === 0 ? _q.clone() : _q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
    b.rq = rq;
    _p.set(b.x, b.y + b.h, b.z); this.roof.setMatrixAt(i, _m.compose(_p, rq, _s));
    this.roof.attrs.size.setXYZ(i, span, rh, len);
    this.roof.attrs.style.setXYZW(i, b.roof, (b.hue * 3.7) % 1, b.seed, b.style === 1 ? 1 : b.style === 2 ? 2 : 0);
    this.roof.attrs.state.setXYZW(i, 0, 0, 0, 0);
    b.ci = -1; b.chimTop = null;
    if (!b.barn && b.roof !== 2) {
      const ci = (b.ci = this.chim.count++);
      const off = (b.seed - 0.5) * len * 0.6, side = span * 0.18;
      const lx = b.ridge === 0 ? side : off, lz = b.ridge === 0 ? off : side;
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      _p.set(b.x + lx * c + lz * s, b.y + b.h + rh * 0.45, b.z - lx * s + lz * c);
      this.chim.setMatrixAt(ci, _m.compose(_p, _q, _s));
      this.chim.attrs.size.setXYZ(ci, 0.9, rh * 0.75 + 1.2, 0.9);
      this.chim.attrs.style.setXYZW(ci, 1, 0.5, b.seed + 0.71, 0);
      this.chim.attrs.state.setXYZW(ci, 0, 0, 0, 0);
      b.chimTop = [_p.x, _p.y + rh * 0.75 + 1.2, _p.z];
    }
    b.top = b.y + b.h + rh;
  }
  setState(b) {
    const i = b.hi, dmg = b.dmg || 0, burn = b.burnt || 0;
    this.lower.attrs.state.setX(i, dmg); this.lower.attrs.state.setY(i, burn);
    this.roof.attrs.state.setX(i, dmg); this.roof.attrs.state.setY(i, burn);
    if (b.ui >= 0) { this.upper.attrs.state.setX(b.ui, dmg); this.upper.attrs.state.setY(b.ui, burn); }
    if (b.ci >= 0) { this.chim.attrs.state.setX(b.ci, dmg); this.chim.attrs.state.setY(b.ci, burn); }
    if (b.ri >= 0) this.rubble.attrs.state.setY(b.ri, burn);
    this.dirty = true;
  }
  collapse(b, dir) {
    b.cAnim = { t: 0, dir: dir || (Math.random() < 0.5 ? -1 : 1), tilt: (Math.random() - 0.5) * 0.5, dur: 1.4 + Math.random() * 0.8 + b.h * 0.03 };
    this.anim.add(b);
  }
  finishRuin(b) {
    const i = b.hi;
    b.cAnim = null; this.anim.delete(b);
    _q.setFromAxisAngle(UP, b.rot);
    const stub = clamp(0.25 + b.seed * 0.35, 0.2, 0.6) * (b.style === 1 ? 1.2 : 0.8);
    _p.set(b.x, b.y, b.z); this.lower.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.lower.attrs.size.setY(i, Math.max(1.2, Math.min(b.h, 3.1) * stub * 2));
    this.lower.attrs.state.setW(i, 1);
    this.lower.attrs.state.setX(i, 0.4);
    if (b.ui >= 0) this.upper.setMatrixAt(b.ui, _m.makeScale(0, 0, 0));
    this.roof.setMatrixAt(i, _m.makeScale(0, 0, 0));
    if (b.ci >= 0) this.chim.setMatrixAt(b.ci, _m.makeScale(0, 0, 0));
    if (b.ri == null || b.ri < 0) {
      const r = (b.ri = this.rubble.count++);
      _p.set(b.x, b.y, b.z); this.rubble.setMatrixAt(r, _m.compose(_p, _q, _s));
      this.rubble.attrs.size.setXYZ(r, b.w * 1.25, clamp(b.h * 0.22, 1.2, 4.5), b.d * 1.25);
      this.rubble.attrs.style.setXYZW(r, b.style, b.hue, b.seed, 0);
      this.rubble.attrs.state.setXYZW(r, 0, b.burnt || 0, 0, 0);
      const rng = mulberry32((b.seed * 1e6) | 0);
      for (let k = 0; k < 3; k++) {
        const L = b.w * (0.6 + rng() * 0.6);
        _e.set((rng() - 0.5) * 0.9, b.rot + rng() * 3, (rng() - 0.5) * 0.6);
        const qq = new THREE.Quaternion().setFromEuler(_e);
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        const lx = (rng() - 0.5) * b.w * 0.6, lz = (rng() - 0.5) * b.d * 0.6;
        _p.set(b.x + lx * c + lz * s, b.y + 0.8 + rng() * 1.6, b.z - lx * s + lz * c);
        this.beams.setMatrixAt(this.beams.count++, _m.compose(_p, qq, new THREE.Vector3(0.28, 0.28, L)));
      }
      this.beams.instanceMatrix.needsUpdate = true;
    }
    b.top = b.y + 3;
    this.dirty = true;
    this.matDirty = true;
  }
  update(dt) {
    if (this.anim.size) {
      for (const b of this.anim) {
        const a = b.cAnim; a.t += dt;
        const u = Math.min(1, a.t / a.dur);
        const e = u * u;
        const sink = e * (b.h + b.roofH) * 0.85;
        const i = b.hi;
        _e.set(a.tilt * e * 0.6, b.rot, a.dir * e * 0.35);
        _q.setFromEuler(_e);
        const sq = 1 - e * 0.55;
        _s.set(1, sq, 1);
        _p.set(b.x + a.dir * e * 2, b.y - sink, b.z); this.lower.setMatrixAt(i, _m.compose(_p, _q, _s));
        if (b.ui >= 0) { _p.set(b.x + a.dir * e * 2.5, b.y + b.gf * sq - sink, b.z); this.upper.setMatrixAt(b.ui, _m.compose(_p, _q, _s)); }
        const rq = _q.clone().multiply(b.rq.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(UP, -b.rot)));
        _p.set(b.x + a.dir * e * 3, b.y + b.h * sq - sink, b.z); this.roof.setMatrixAt(i, _m.compose(_p, rq, _s));
        if (b.ci >= 0) this.chim.setMatrixAt(b.ci, _m.makeScale(0, 0, 0));
        _s.set(1, 1, 1);
        if (u >= 1) this.finishRuin(b);
      }
      this.matDirty = true;
    }
    if (this.matDirty) {
      for (const m of [this.lower, this.upper, this.roof, this.chim, this.rubble]) m.instanceMatrix.needsUpdate = true;
      this.matDirty = false;
    }
    if (this.dirty) {
      for (const m of [this.lower, this.upper, this.roof, this.chim, this.rubble]) { m.attrs.state.needsUpdate = true; m.attrs.size.needsUpdate = true; m.attrs.style.needsUpdate = true; }
      this.dirty = false;
    }
  }
}

/* ---------- 名所：ジオメトリ作成の道具 ---------- */
// aMat: 0=石壁 1=スレート屋根 2=瓦屋根 3=木 4=窓ガラス 5=暗い開口 6=漆喰 7=金属
class GB {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.mat = []; }
  addGeo(g, matrix, mat, uvMode = 'box') {
    g = g.index ? g.toNonIndexed() : g;
    const p = g.attributes.position, n = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      a.fromBufferAttribute(p, i);
      const lp = a.clone();
      a.applyMatrix4(matrix);
      b.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.pos.push(a.x, a.y, a.z); this.nor.push(b.x, b.y, b.z);
      // 壁はメートル単位の UV（横, 高さ）、屋根は（棟方向, 斜面）
      let u, v;
      if (Math.abs(b.y) > 0.92) { u = a.x; v = a.z; }
      else {
        const tx = -b.z, tz = b.x, tl = Math.hypot(tx, tz) || 1;
        u = (a.x * tx + a.z * tz) / tl;
        v = uvMode === 'roof' ? (lp.y * -1) : a.y;
        if (uvMode === 'cyl') { u = Math.atan2(lp.z, lp.x) * Math.hypot(lp.x, lp.z); v = a.y; }
        if (uvMode === 'roof') { const h = Math.hypot(b.x, b.z); v = -a.y / Math.max(0.2, h); }
      }
      this.uv.push(u, v); this.mat.push(mat);
    }
  }
  box(w, h, d, x, y, z, ry, mat) { const g = new THREE.BoxGeometry(w, h, d); this.addGeo(g, new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion().setFromAxisAngle(UP, ry || 0), new THREE.Vector3(1, 1, 1)), mat); }
  cyl(r0, r1, h, x, y, z, seg, mat, open = false) { const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open); this.addGeo(g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), mat, 'cyl'); }
  cone(r, h, x, y, z, seg, mat) { const g = new THREE.ConeGeometry(r, h, seg); this.addGeo(g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), mat, 'roof'); }
  gable(w, h, d, x, y, z, ry, mat, wallMat) {
    // 屋根の斜面と妻壁
    const g = unitRoof();
    const pos = g.attributes.position, R = g.attributes.aR;
    const roofPart = new THREE.BufferGeometry(), wallPart = new THREE.BufferGeometry();
    const rp = [], wp = [];
    for (let i = 0; i < pos.count; i += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        let px = pos.getX(i + k) * w, py = pos.getY(i + k) * h, pz = pos.getZ(i + k) * d;
        if (R.getX(i + k) > 0.5) { if (R.getY(i + k) > 0.5) { px += Math.sign(px) * 0.6; py -= 0.6 * h / (w / 2); } pz += Math.sign(pz) * 0.5; }
        tri.push(px, py, pz);
      }
      (R.getX(i) > 0.5 ? rp : wp).push(...tri);
    }
    roofPart.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); roofPart.computeVertexNormals();
    wallPart.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wallPart.computeVertexNormals();
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry || 0), new THREE.Vector3(1, 1, 1));
    this.addGeo(roofPart, M, mat, 'roof');
    this.addGeo(wallPart, M, wallMat == null ? 0 : wallMat);
  }
  pyramid(w, h, x, y, z, ry, mat, seg = 4) { const g = new THREE.ConeGeometry(w / Math.SQRT2, h, seg); g.rotateY(Math.PI / 4); this.addGeo(g, new THREE.Matrix4().compose(new THREE.Vector3(x, y + h / 2, z), new THREE.Quaternion().setFromAxisAngle(UP, ry || 0), new THREE.Vector3(1, 1, 1)), mat, 'roof'); }
  merlons(len, y, z0, w, ry, cx, cz, mat, step = 2.2) {
    const n = Math.floor(len / step);
    for (let i = 0; i < n; i++) {
      const lx = -len / 2 + (i + 0.5) * step;
      const c = Math.cos(ry), s = Math.sin(ry);
      this.box(step * 0.55, 1.4, w, cx + lx * c + z0 * s, y, cz - lx * s + z0 * c, ry, mat);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function landmarkMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  m.userData.uniforms = { uCut: { value: 999 }, uDmg: { value: 0 }, uBurn: { value: 0 }, uSeed: { value: Math.random() } };
  m.onBeforeCompile = (sh) => {
    patchCommon(sh, engine);
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; varying float vMat; varying vec2 vUvM; varying vec3 vLP; varying vec3 vNo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vUvM = uv; vLP = position; vNo = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uCut; uniform float uDmg; uniform float uBurn; uniform float uSeed; varying float vMat; varying vec2 vUvM; varying vec3 vLP; varying vec3 vNo;\n' + GLSL_NOISE + WALL_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float rgh = 0.9; vec3 em = vec3(0.0); vec3 col;
        float mt = vMat;
        if (mt < 0.5) col = wallPattern(1.0, vUvM.x, vUvM.y, 1000.0, 1000.0, 1.0, uSeed, 0.5, uNight, 0.0, 0.0, rgh, em);
        else if (mt < 1.5) col = roofPattern(1.0, vUvM, uSeed, 0.5, rgh);
        else if (mt < 2.5) col = roofPattern(0.0, vUvM, uSeed, 0.6, rgh);
        else if (mt < 3.5) { col = vec3(0.3,0.2,0.12)*(0.75+0.4*vnoise(vUvM*vec2(0.8,12.0))); rgh = 0.85; }
        else if (mt < 4.5) { vec2 q = vUvM*vec2(1.6,1.0); float lead = step(0.85, fract(q.x*2.0+q.y*2.0)) + step(0.85, fract(q.x*2.0-q.y*2.0));
          vec3 g1 = mix(vec3(0.35,0.12,0.1), vec3(0.12,0.2,0.45), vnoise(q*1.7)); col = mix(g1*0.25, vec3(0.05), clamp(lead,0.0,1.0)); rgh = 0.3;
          em = g1 * 1.6 * uNight * (1.0 - clamp(lead,0.0,1.0)) * (1.0 - uDmg); }
        else if (mt < 5.5) { col = vec3(0.04,0.035,0.03); }
        else if (mt < 6.5) col = wallPattern(2.0, vUvM.x, vUvM.y, 1000.0, 1000.0, 1.0, uSeed, 0.05, uNight, 0.0, 0.0, rgh, em);
        else { col = vec3(0.75,0.6,0.3); rgh = 0.35; }
        vec3 cc = cell2(vUvM*0.4 + uSeed*9.0);
        float crack = (1.0 - smoothstep(0.0, 0.05, cc.y - cc.x)) * step(0.2, uDmg) * step(0.4, vnoise(vUvM*0.25 + uSeed*3.0));
        col = mix(col, vec3(0.07), crack*0.85);
        float soot = uBurn * smoothstep(0.25, 0.75, vnoise(vUvM*0.15 + uSeed*5.0) + vLP.y*0.004);
        col = mix(col, vec3(0.035,0.03,0.025), clamp(soot,0.0,0.95));
        if (vLP.y > uCut * (0.7 + 0.3*vnoise(vec2(vUvM.x*0.12 + uSeed*30.0, 0.0)) + 0.25*vnoise(vLP.xz*0.07))) discard;
        if (damageHole(vUvM, uDmg, uSeed) > 0.5 && mt > 0.5 && mt < 2.5) discard;
        if (!gl_FrontFacing) { col = vec3(0.12,0.1,0.08); em = vec3(0.0); }
        diffuseColor.rgb = s2l(col);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = rgh;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = vMat > 6.5 ? 0.8 : 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += em;');
  };
  m.customProgramCacheKey = () => 'landmark';
  return m;
}

/* ---------- 名所の形 ---------- */
function buildChurch(sc) {
  const g = new GB();
  const L = 34 * sc, W = 13 * sc, H = 15 * sc;
  g.box(W, H, L, 0, 0, 0, 0, 0);
  g.gable(W, W * 0.75, L, 0, H, 0, 0, 1, 0);
  // 後陣
  g.cyl(W * 0.5, W * 0.5, H * 0.85, 0, 0, L / 2, 10, 0);
  g.cone(W * 0.55, W * 0.6, 0, H * 0.85, L / 2, 10, 1);
  // 塔と尖塔
  const T = 9 * sc, TH = 30 * sc + 8;
  g.box(T, TH, T, 0, 0, -L / 2 - T / 2 + 1, 0, 0);
  g.box(T * 0.7, 2.2, 0.3, 0, TH - 6, -L / 2 - T + 0.8, 0, 5);
  g.pyramid(T * 1.05, T * 2.6, 0, TH, -L / 2 - T / 2 + 1, 0, 1, 8);
  g.box(0.25, 3.2, 0.25, 0, TH + T * 2.6, -L / 2 - T / 2 + 1, 0, 7);
  // 窓（縦長）
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) g.box(0.25, H * 0.5, 2.2 * sc, sd * (W / 2 + 0.05), H * 0.25, -L / 2 + (i + 0.8) * L / 5.5, 0, 4);
  // 控え壁
  for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) g.box(1.2 * sc, H * 0.75, 1.4 * sc, sd * (W / 2 + 0.6 * sc), 0, -L / 2 + i * L / 5, 0, 0);
  return { geo: g.geometry(), h: TH + T * 2.6, r: Math.max(L, W) * 0.6 + T, hp: 2600 * sc, value: 30 * sc };
}
function buildCathedral() {
  const g = new GB();
  const L = 120, W = 30, H = 34;
  g.box(W * 0.55, H, L, 0, 0, 0, 0, 0);
  g.gable(W * 0.55, 13, L, 0, H, 0, 0, 1, 0);
  for (const sd of [-1, 1]) {
    g.box(W * 0.23, H * 0.52, L * 0.9, sd * W * 0.39, 0, 0, 0, 0);
    // 飛梁
    for (let i = 0; i < 9; i++) {
      const z = -L * 0.42 + i * L * 0.105;
      g.box(1.6, H * 0.62, 2.0, sd * (W * 0.52), 0, z, 0, 0);
      const fb = new THREE.BoxGeometry(1.0, 1.0, W * 0.32);
      g.addGeo(fb, new THREE.Matrix4().compose(new THREE.Vector3(sd * W * 0.4, H * 0.66, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, sd * 0.6)), new THREE.Vector3(1, 1, 1)), 0);
      g.box(0.3, H * 0.4, 3.2, sd * (W * 0.276), H * 0.48, z + 4.5, 0, 4);
    }
  }
  // 翼廊
  g.box(W * 1.65, H, 22, 0, 0, L * 0.18, 0, 0);
  g.gable(22, 12, W * 1.65, 0, H, L * 0.18, Math.PI / 2, 1, 0);
  // 後陣
  g.cyl(W * 0.28, W * 0.28, H * 0.9, 0, 0, L / 2, 14, 0);
  g.cone(W * 0.32, 14, 0, H * 0.9, L / 2, 14, 1);
  // 交差部の尖塔
  g.box(12, 14, 12, 0, H, L * 0.18, 0, 0);
  g.pyramid(13, 34, 0, H + 14, L * 0.18, 0, 1, 8);
  // 西側の双塔
  for (const sd of [-1, 1]) {
    const tx = sd * 11, tz = -L / 2 - 6;
    g.box(14, 64, 14, tx, 0, tz, 0, 0);
    g.box(10, 14, 10, tx, 64, tz, 0, 0);
    g.pyramid(11.5, 36, tx, 78, tz, 0, 1, 8);
    g.box(0.4, 4, 0.4, tx, 114, tz, 0, 7);
    for (let k = 0; k < 4; k++) g.box(0.3, 9, 2.2, tx + sd * 7.05, 18 + k * 12, tz, 0, 4);
  }
  // バラ窓
  const rose = new THREE.CircleGeometry(6.2, 24);
  g.addGeo(rose, new THREE.Matrix4().compose(new THREE.Vector3(0, 30, -L / 2 - 0.2), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI), new THREE.Vector3(1, 1, 1)), 4);
  g.box(8, 11, 0.5, 0, 0, -L / 2 - 0.3, 0, 5);
  return { geo: g.geometry(), h: 118, r: 75, hp: 26000, value: 420 };
}
function buildCastle(r) {
  const g = new GB();
  const n = 7, R = r * 0.62, wallH = 17;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    g.box(len, wallH, 4.5, (x0 + x1) / 2, 0, (z0 + z1) / 2, ry, 0);
    g.merlons(len, wallH, 1.6, 1.2, ry, (x0 + x1) / 2, (z0 + z1) / 2, 0);
    g.cyl(7, 6.2, wallH + 9, x0, 0, z0, 14, 0);
    g.cone(7.6, 10, x0, wallH + 9, z0, 14, 1);
  }
  // 天守（キープ）
  g.box(26, 40, 26, 0, 0, -6, 0, 0);
  g.merlons(26, 40, 12.4, 1.4, 0, 0, -6, 0, 2.4);
  g.merlons(26, 40, -12.4, 1.4, 0, 0, -6, 0, 2.4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.cyl(4, 4, 47, sx * 13, 0, -6 + sz * 13, 10, 0); g.cone(5, 9, sx * 13, 47, -6 + sz * 13, 10, 1); }
  for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) g.box(0.3, 3, 1.4, sd * 13.1, 10 + k * 8, -6, 0, 4);
  // 宮殿の広間
  g.box(40, 18, 16, 6, 0, 26, 0.1, 6);
  g.gable(16, 10, 40, 6, 18, 26, 0.1 + Math.PI / 2, 1, 6);
  for (let k = 0; k < 6; k++) g.box(2, 5, 0.3, -12 + k * 7, 7, 17.8, 0.1, 4);
  // 門楼
  g.box(16, 22, 12, R + 2, 0, 0, Math.PI / 2, 0);
  g.box(5, 7, 13, R + 2, 0, 0, Math.PI / 2, 5);
  return { geo: g.geometry(), h: 56, r: R + 10, hp: 38000, value: 520 };
}
function buildTownhall() {
  const g = new GB();
  g.box(32, 13, 15, 0, 0, 0, 0, 6);
  g.gable(32, 11, 15, 0, 13, 0, Math.PI / 2, 2, 6);
  g.box(6, 30, 6, -10, 0, 0, 0, 0);
  g.pyramid(6.6, 12, -10, 30, 0, 0, 1, 8);
  for (let k = 0; k < 6; k++) { g.box(1.6, 2.8, 0.3, -12 + k * 5, 2.5, -7.6, 0, 4); g.box(1.6, 2.8, 0.3, -12 + k * 5, 7.5, -7.6, 0, 4); }
  g.box(4, 4, 0.4, 6, 0, -7.7, 0, 3);
  return { geo: g.geometry(), h: 42, r: 20, hp: 5200, value: 60 };
}
function buildWindmill() {
  const g = new GB();
  g.cyl(4.6, 3.3, 15, 0, 0, 0, 14, 6);
  g.cone(4, 4.5, 0, 15, 0, 14, 3);
  g.box(1.4, 2.2, 0.3, 0, 0, -4.5, 0, 3);
  return { geo: g.geometry(), h: 20, r: 8, hp: 900, value: 14 };
}
function buildSails() {
  const g = new GB();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const M = new THREE.Matrix4().makeRotationZ(a);
    const arm = new THREE.BoxGeometry(0.35, 11, 0.25); arm.translate(0, 5.8, 0);
    g.addGeo(arm, M, 3);
    const sail = new THREE.BoxGeometry(2.2, 8.4, 0.08); sail.translate(1.25, 6.6, 0);
    g.addGeo(sail, M, 6);
  }
  return g.geometry();
}
function buildWatermill() {
  const g = new GB();
  g.box(11, 6, 9, 0, 0, 0, 0, 0);
  g.gable(11, 5, 9, 0, 6, 0, 0, 2, 0);
  return { geo: g.geometry(), h: 11, r: 9, hp: 1100, value: 14 };
}
function buildWheel() {
  const g = new GB();
  const ring = new THREE.TorusGeometry(3.4, 0.25, 6, 24); g.addGeo(ring, new THREE.Matrix4(), 3);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const p = new THREE.BoxGeometry(0.18, 1.6, 1.4); g.addGeo(p, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2), new THREE.Vector3(1, 1, 1)), 3); }
  return g.geometry();
}
function buildGate(rot, cap) {
  const g = new GB();
  const H = cap ? 24 : 19;
  g.box(10, H, 10, -7, 0, 0, 0, 0);
  g.box(10, H, 10, 7, 0, 0, 0, 0);
  g.box(6, H - 8, 9, 0, 8, 0, 0, 0);
  g.box(5.6, 7.5, 9.4, 0, 0, 0, 0, 5);
  for (const sx of [-7, 7]) { g.pyramid(11, 9, sx, H, 0, 0, 1, 4); }
  g.gable(6, 5, 9, 0, H, 0, 0, 1, 0);
  return { geo: g.geometry(), h: H + 9, r: 15, hp: cap ? 9000 : 6000, value: cap ? 40 : 28 };
}
function buildBridge(L, w) {
  const g = new GB();
  g.box(w, 1.6, L, 0, 4.8, 0, 0, 0);
  g.box(0.6, 1.2, L, w / 2 - 0.3, 6.4, 0, 0, 0);
  g.box(0.6, 1.2, L, -w / 2 + 0.3, 6.4, 0, 0, 0);
  const n = Math.max(2, Math.round(L / 14));
  for (let i = 0; i <= n; i++) g.box(w + 1, 5, 3, 0, -1, -L / 2 + (i * L) / n, 0, 0);
  return g.geometry();
}

/* ---------- 城壁（インスタンス） ---------- */


/* ---------- 王国全体の建物 ---------- */
export class KingdomBuildings {
  constructor(engine, kingdom) {
    this.engine = engine;
    const mats = {
      box: unitBox(), roof: unitRoofGeo(), mound: unitMound(), beam: new THREE.BoxGeometry(1, 1, 1),
      wall: houseWallMaterial(engine), roofM: roofMaterial(engine), rubble: rubbleMaterial(engine),
      beamM: new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.95 }),
    };
    this.mats = mats;
    this.sets = [];
    this.landmarks = [];
    this.wallSets = [];
    this.spinners = [];
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    const lmMat = null;
    const cobble = roadMaterial(engine, 'cobble'), dirt = roadMaterial(engine, 'dirt');
    for (const t of kingdom.towns) {
      this.sets.push(new HouseSet(engine, t, mats));
      // 通り
      const yf = (x, z) => groundH(x, z);
      const cg = [], dg = [];
      for (const st of t.streets) (st.kind === 'cobble' ? cg : dg).push(ribbonGeometry(st.pts, st.w, yf, 4, 0.12));
      for (const [arr, mat] of [[cg, cobble], [dg, dirt]]) {
        if (!arr.length) continue;
        const merged = mergeGeos(arr);
        const mesh = new THREE.Mesh(merged, mat); mesh.receiveShadow = true; mesh.renderOrder = 3;
        this.group.add(mesh);
      }
      for (const p of t.plazas) {
        const g = new THREE.PlaneGeometry(p.w, p.d, 8, 8); g.rotateX(-Math.PI / 2);
        const pos = g.attributes.position;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        const uvs = [];
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i), lz = pos.getZ(i);
          const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
          pos.setXYZ(i, x, groundH(x, z) + 0.14, z);
          uvs.push(0, 0.5);
        }
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, cobble); mesh.receiveShadow = true; mesh.renderOrder = 3;
        this.group.add(mesh);
      }
      // 名所
      for (const L of t.landmarks) this.addLandmark(t, L, lmMat);
      for (const gt of t.gates) this.addLandmark(t, { type: 'gate', x: gt.x, z: gt.z, rot: gt.rot, name: '城門' }, lmMat);
      // 城壁と塔
      if (t.walls.length) this.wallSets.push(new WallSet(engine, t, mats, this.group));
    }
  }
  addLandmark(t, L, baseMat) {
    let info;
    const mat = landmarkMaterial(this.engine);
    let x = L.x, z = L.z, rot = L.rot || 0, extra = null;
    if (L.type === 'church') info = buildChurch(L.scale || 1);
    else if (L.type === 'cathedral') info = buildCathedral();
    else if (L.type === 'castle') info = buildCastle(L.r);
    else if (L.type === 'townhall') info = buildTownhall();
    else if (L.type === 'windmill') { info = buildWindmill(); extra = { geo: buildSails(), y: 13.5, z: -4.9, spin: 0.9, axis: 'z' }; }
    else if (L.type === 'watermill') { info = buildWatermill(); extra = { geo: buildWheel(), y: 2.6, x: 6.6, spin: -0.6, axis: 'x' }; }
    else if (L.type === 'gate') info = buildGate(rot, t.s.kind === 'capital');
    else if (L.type === 'bridge') {
      const Lb = Math.hypot(L.x1 - L.x0, L.z1 - L.z0) + 18;
      x = (L.x0 + L.x1) / 2; z = (L.z0 + L.z1) / 2; rot = Math.atan2(L.x1 - L.x0, L.z1 - L.z0);
      info = { geo: buildBridge(Lb, t.s.kind === 'capital' ? 12 : 8), h: 8, r: Lb / 2, hp: 99999, value: 0, indestructible: true };
    }
    if (!info) return;
    const y = L.type === 'bridge' ? Math.max(groundH(L.x0, L.z0), groundH(L.x1, L.z1)) - 4.2 : Math.min(groundH(x, z), groundH(x + 4, z + 4), groundH(x - 4, z - 4)) - 0.3;
    const mesh = new THREE.Mesh(info.geo, mat);
    mesh.position.set(x, y, z); mesh.rotation.y = rot;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    const lm = { kind: 'landmark', type: L.type, name: L.name, x, z, y, rot, mesh, mat, h: info.h, r: info.r, hp: info.hp, max: info.hp, value: info.value, sid: t.s.id, indestructible: !!info.indestructible, state: 0, dmg: 0, burnt: 0, fire: 0, tall: info.h > 30 };
    if (extra) {
      const em = new THREE.Mesh(extra.geo, mat);
      em.position.set(extra.x || 0, extra.y, extra.z || 0);
      if (extra.axis === 'x') em.rotation.y = Math.PI / 2;
      em.castShadow = true;
      mesh.add(em);
      lm.spinner = { mesh: em, speed: extra.spin, axis: extra.axis };
      this.spinners.push(lm);
    }
    if (L.type === 'castle' || L.type === 'cathedral' || L.type === 'gate') lm.garrison = true;
    this.landmarks.push(lm);
    t.landmarkObjs = t.landmarkObjs || [];
    t.landmarkObjs.push(lm);
    return lm;
  }
  update(dt) {
    for (const s of this.sets) s.update(dt);
    for (const w of this.wallSets) w.update(dt);
    for (const lm of this.spinners) if (lm.state < 2) { if (lm.spinner.axis === 'z') lm.spinner.mesh.rotation.z += dt * lm.spinner.speed; else lm.spinner.mesh.rotation.z += dt * lm.spinner.speed; }
    for (const lm of this.landmarks) if (lm.cAnim) this.animLandmark(lm, dt);
  }
  setLandmarkState(lm) {
    const u = lm.mat.userData.uniforms;
    u.uDmg.value = lm.dmg; u.uBurn.value = lm.burnt;
  }
  collapseLandmark(lm, dir) {
    lm.cAnim = { t: 0, dur: lm.tall ? 3.4 : 2.2, dir: dir || 1, topple: lm.tall && lm.type !== 'castle' && lm.type !== 'cathedral' ? 1 : 0 };
  }
  animLandmark(lm, dt) {
    const a = lm.cAnim; a.t += dt;
    const u = Math.min(1, a.t / a.dur), e = u * u;
    if (a.topple) {
      lm.mesh.rotation.set(0, lm.rot, 0);
      lm.mesh.rotateZ(-a.dir * e * 1.45);
      lm.mesh.position.y = lm.y - e * 3;
    } else {
      lm.mesh.position.y = lm.y - e * lm.h * 0.62;
      lm.mesh.rotation.set(Math.sin(a.t * 9) * 0.004 * (1 - u), lm.rot, Math.sin(a.t * 7) * 0.005 * (1 - u));
    }
    if (u >= 1) {
      lm.cAnim = null;
      lm.mesh.rotation.set(0, lm.rot, 0);
      lm.mesh.position.y = lm.y;
      lm.mat.userData.uniforms.uCut.value = lm.h * (a.topple ? 0.18 : 0.3);
      lm.mat.userData.uniforms.uDmg.value = Math.max(0.6, lm.dmg);
      if (lm.spinner) lm.spinner.mesh.visible = false;
      lm.ruined = true;
      if (lm.onRuin) lm.onRuin(lm);
    }
  }
}

class WallSet {
  constructor(engine, t, mats, group) {
    this.town = t;
    const W = t.walls, T = t.towers;
    this.seg = instMesh(mats.box, mats.wall, W.length);
    this.tow = instMesh(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0), mats.wall, T.length);
    this.cap = instMesh(new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0), mats.roofM, T.length);
    this.merl = instMesh(mats.box, mats.wall, W.length * 6);
    W.forEach((w, i) => {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0) + 1.2, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      const rot = Math.atan2(-(w.z1 - w.z0), w.x1 - w.x0);
      w.rot = rot; w.len = len; w.cx = cx; w.cz = cz; w.wi = i; w.kind = 'wall'; w.y = Math.min(groundH(w.x0, w.z0), groundH(w.x1, w.z1), groundH(cx, cz)) - 0.5;
      _q.setFromAxisAngle(UP, rot); _p.set(cx, w.y, cz);
      this.seg.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.seg.attrs.size.setXYZ(i, len, w.h, w.t);
      this.seg.attrs.style.setXYZW(i, 1, 0.5, (i * 0.137) % 1, 0);
      this.seg.attrs.state.setXYZW(i, 0, 0, 0, 0);
      // 狭間（凸）
      for (let k = 0; k < 6; k++) {
        const lx = -len / 2 + (k + 0.5) * (len / 6);
        const c = Math.cos(rot), s = Math.sin(rot);
        _p.set(cx + lx * c - w.t * 0.38 * s * 0 + (w.t * 0.38) * s, w.y + w.h, cz - lx * s + (w.t * 0.38) * c);
        this.merl.setMatrixAt(i * 6 + k, _m.compose(_p, _q, _s));
        this.merl.attrs.size.setXYZ(i * 6 + k, len / 6 * 0.55, 1.5, 0.9);
        this.merl.attrs.style.setXYZW(i * 6 + k, 1, 0.5, (k * 0.31) % 1, 0);
      }
      w.hp = t.s.kind === 'capital' ? 5200 : 3600; w.max = w.hp; w.state = 0; w.dmg = 0; w.sid = t.s.id; w.value = 4;
    });
    T.forEach((tw, i) => {
      tw.y = groundH(tw.x, tw.z) - 0.5; tw.ti = i; tw.kind = 'tower';
      _q.identity(); _p.set(tw.x, tw.y, tw.z);
      this.tow.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.tow.attrs.size.setXYZ(i, tw.r, tw.h, tw.r);
      this.tow.attrs.style.setXYZW(i, 1, 0.5, (i * 0.193) % 1, 0);
      _p.set(tw.x, tw.y + tw.h, tw.z);
      this.cap.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.cap.attrs.size.setXYZ(i, tw.r * 1.25, tw.r * 1.8, tw.r * 1.25);
      this.cap.attrs.style.setXYZW(i, 1, 0.5, (i * 0.37) % 1, 0);
      tw.hp = t.s.kind === 'capital' ? 6500 : 4500; tw.max = tw.hp; tw.state = 0; tw.dmg = 0; tw.sid = t.s.id; tw.value = 6;
    });
    for (const m of [this.seg, this.tow, this.cap, this.merl]) { m.computeBoundingSphere(); m.boundingSphere.radius += 40; group.add(m); }
    this.dirty = false;
  }
  ruinWall(w) {
    const i = w.wi;
    this.seg.attrs.size.setY(i, w.h * 0.45);
    this.seg.attrs.state.setXYZW(i, 0.6, w.burnt || 0, 0, 1);
    for (let k = 0; k < 6; k++) this.merl.setMatrixAt(i * 6 + k, _m.makeScale(0, 0, 0));
    this.dirty = true;
  }
  ruinTower(tw) {
    const i = tw.ti;
    this.tow.attrs.size.setY(i, tw.h * 0.35);
    this.tow.attrs.state.setXYZW(i, 0.6, 0, 0, 1);
    this.cap.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.dirty = true;
  }
  setState(o) {
    if (o.kind === 'wall') this.seg.attrs.state.setX(o.wi, o.dmg);
    else this.tow.attrs.state.setX(o.ti, o.dmg);
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    for (const m of [this.seg, this.tow, this.cap, this.merl]) { m.attrs.state.needsUpdate = true; m.attrs.size.needsUpdate = true; m.instanceMatrix.needsUpdate = true; }
    this.dirty = false;
  }
}

export function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, ov * 3); nor.set(n.array, ov * 3); if (u) uv.set(u.array, ov * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[oi + i] = a[i] + ov; oi += a.length; }
    else { for (let i = 0; i < p.count; i++) idx[oi + i] = ov + i; oi += p.count; }
    ov += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
