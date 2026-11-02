import * as THREE from 'three';
import { heightAt, landAt, RIVER, ROADS, groundH, SETTLEMENTS } from './world.js';
import { GLSL_NOISE, clamp } from './noise.js';

const N = 32;            // チャンクの格子数
const ROOT = 196608;     // 最上位チャンクの一辺（m）
const MAX_LEVEL = 12;    // 最小チャンク 192m（格子 6m）

/* ---------- 地面のシェーダー ---------- */
export const GROUND_GLSL = /* glsl */`
vec3 srgb2lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 groundAlbedo(vec3 wp, vec3 wn, vec4 land, float dist){
  float n1 = fbm2(wp.xz/210.0, 3)*0.5+0.5;
  float n2 = vnoise(wp.xz/7.0);
  float n3 = vnoise(wp.xz/1.3);
  vec3 grass = mix(vec3(0.27,0.33,0.15), vec3(0.42,0.44,0.22), n1);
  grass = mix(grass, vec3(0.47,0.45,0.27), smoothstep(0.6,0.95,n2)*0.35);
  float footprint = max(length(fwidth(wp.xz)), 0.001);
  float near = (1.0 - smoothstep(25.0, 260.0, dist)) * (1.0 - smoothstep(0.08, 0.45, footprint));
  float n4 = vnoise(wp.xz*3.1), n5 = vnoise(wp.xz*11.0);
  grass *= 1.0 + near*((n3-0.5)*0.35 + (n4-0.5)*0.3 + (n5-0.5)*0.25);
  // 耕地：区画（ファーロング）ごとに向きの違う短冊状の畑
  vec2 fw = wp.xz + 60.0*vec2(vnoise(wp.xz/500.0), vnoise(wp.xz/500.0+9.0));
  vec4 vo = vor2p(fw/380.0);
  ivec2 fid = ivec2(floor(vo.xy*7.0));
  vec2 fc = vec2(fid);
  float fh = hash2i(fid + ivec2(3, 7));
  float ang = fh*3.1416;
  vec2 rel = fw - vo.xy*380.0;
  float ca = cos(ang), sa = sin(ang);
  vec2 q = vec2(ca*rel.x - sa*rel.y, sa*rel.x + ca*rel.y);
  float sw = 11.0 + 14.0*hash2i(fid+ivec2(11,5));
  float sid = floor(q.x/sw);
  float hc = hash2i(ivec2(int(sid), 0) + fid*31);
  vec3 crop;
  if (hc < 0.28) crop = vec3(0.66,0.56,0.30);
  else if (hc < 0.42) crop = vec3(0.74,0.67,0.44);
  else if (hc < 0.58) crop = vec3(0.40,0.47,0.21);
  else if (hc < 0.74) crop = vec3(0.40,0.31,0.22) * (0.84 + 0.16*smoothstep(0.3,0.7,abs(fract(q.y*0.75)-0.5)*2.0));
  else crop = vec3(0.45,0.46,0.26);
  crop *= 0.9 + 0.2*vnoise(q/vec2(6.0,22.0)+sid);
  float sf = fract(q.x/sw);
  float balk = 1.0 - smoothstep(0.35, 1.2, min(sf, 1.0-sf)*sw);
  float head = smoothstep(4.0, 9.0, (vo.w - vo.z)*380.0*0.5);
  balk = max(balk, 1.0 - head);
  vec3 c = mix(grass, mix(crop, grass*0.8, balk), land.y);
  // 森：木を置いた範囲の中は暗い林床、外は上から見た樹冠の模様（木が置かれていない遠くの森）
  float farF = smoothstep(uFlora.z*0.72, uFlora.z*0.97, length(wp.xz - uFlora.xy));
  vec3 floorC = vec3(0.16,0.19,0.10)*(0.75+0.5*n2);
  vec3 cr = cell2(wp.xz/8.5);
  float crown = smoothstep(0.75, 0.2, cr.x);
  float conif = smoothstep(0.45, 0.75, fbm2(wp.xz/900.0 + 7.0, 2)*0.5 + 0.5 + (wp.y - 420.0)/300.0);
  vec3 canopy = mix(vec3(0.25,0.32,0.15), vec3(0.17,0.25,0.18), conif) * (0.4 + 0.52*crown + 0.25*(cr.z-0.5)) * (0.8 + 0.3*n1);
  c = mix(c, mix(floorC, canopy, farF), land.x);
  c = mix(c, vec3(0.31,0.36,0.19), land.w*0.55);
  vec3 dirt = mix(vec3(0.42,0.36,0.27), vec3(0.50,0.45,0.35), n2) * (0.9+0.2*n3) * (1.0 + near*((n4-0.5)*0.3 + (n5-0.5)*0.3));
  c = mix(c, dirt, land.z*0.8);
  // Analytic minification: subpixel field strips and treetops must converge
  // to their average instead of sparkling while the camera moves.
  vec3 meadow = mix(vec3(0.35,0.39,0.20), vec3(0.49,0.45,0.29), land.y);
  meadow = mix(meadow, vec3(0.19,0.26,0.15), land.x);
  meadow = mix(meadow, vec3(0.46,0.40,0.30), land.z*0.8);
  c = mix(c, meadow*(0.94+0.12*n1), smoothstep(2.5, 14.0, footprint));
  float slope = 1.0 - wn.y;
  float rock = clamp(smoothstep(0.3, 0.52, slope + n1*0.08) + smoothstep(1080.0, 1300.0, wp.y + n1*60.0)*0.7, 0.0, 1.0);
  c = mix(c, vec3(0.47,0.46,0.43)*(0.78+0.4*n2), rock);
  float snow = smoothstep(1420.0, 1560.0, wp.y + n1*90.0) * smoothstep(0.6, 0.32, slope);
  c = mix(c, vec3(0.70,0.72,0.76), snow);
  return srgb2lin(c);
}
`;

function terrainMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    m.userData.shader = sh;
    sh.uniforms.uTerrainMorph = { value: 1 };
    sh.uniforms.uTime = engine.uniforms.uTime;
    sh.uniforms.uFlora = engine.uniforms.uFlora;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLand; attribute float aParentY; uniform float uTerrainMorph; varying vec4 vLand; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(aParentY, position.y, uTerrainMorph);')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvLand = aLand; vWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlora; varying vec4 vLand; varying vec3 vWP; varying vec3 vWN;\n' + GLSL_NOISE + GROUND_GLSL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n float camDist = length(vWP - cameraPosition); diffuseColor.rgb = groundAlbedo(vWP, normalize(vWN), vLand, camDist);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.97, 0.86, vLand.w);');
  };
  return m;
}

let sharedIndex = null;
function indexBuffer() {
  if (sharedIndex) return sharedIndex;
  const idx = [];
  const V = N + 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // スカート：4辺それぞれ下に垂らす
  const base = V * V;
  const edges = [];
  for (let i = 0; i < V; i++) edges.push(i);                 // 北（j=0）
  for (let j = 0; j < V; j++) edges.push(j * V + N);         // 東
  for (let i = N; i >= 0; i--) edges.push(N * V + i);        // 南
  for (let j = N; j >= 0; j--) edges.push(j * V);            // 西
  for (let k = 0; k < edges.length - 1; k++) {
    const a = edges[k], b = edges[k + 1], sa = base + k, sb = base + k + 1;
    idx.push(a, b, sa, b, sb, sa);
  }
  sharedIndex = { idx: new THREE.BufferAttribute(new Uint32Array(idx), 1), edges };
  return sharedIndex;
}

export class Terrain {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    engine.scene.add(this.group);
    this.mat = terrainMaterial(engine);
    this.cache = new Map();
    this.queue = new Map();
    this.frame = 0;
    this.K = engine.qname === 'low' ? 1.5 : 1.8;
    this.maxLevel = engine.q.terrainLevel || 11;
    this.split = new Set();
    this.visible = new Set();
  }
  key(l, i, j) { return l * 1e8 + i * 1e4 + j; }
  build(l, i, j) {
    const S = ROOT / (1 << l), x0 = -ROOT / 2 + i * S, z0 = -ROOT / 2 + j * S, cx = x0 + S / 2, cz = z0 + S / 2;
    const V = N + 1, step = S / N, E = V + 2;
    const hh = new Float32Array(E * E);
    for (let b = 0; b < E; b++) for (let a = 0; a < E; a++) hh[b * E + a] = heightAt(x0 + (a - 1) * step, z0 + (b - 1) * step);
    const { edges } = indexBuffer();
    const nv = V * V + edges.length;
    const parentY = new Float32Array(nv);
    const parent = l > 0 ? this.get(l - 1, Math.floor(i / 2), Math.floor(j / 2)) : null;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), land = new Uint8Array(nv * 4);
    const L = [0, 0, 0, 0];
    let minY = 1e9, maxY = -1e9;
    for (let b = 0; b < V; b++) for (let a = 0; a < V; a++) {
      const k = b * V + a, h = hh[(b + 1) * E + a + 1];
      const x = x0 + a * step, z = z0 + b * step;
      parentY[k] = parent ? this.sample(parent, x, z) : h;
      pos[k * 3] = x - cx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z - cz;
      const hx = hh[(b + 1) * E + a + 2] - hh[(b + 1) * E + a], hz = hh[(b + 2) * E + a + 1] - hh[b * E + a + 1];
      const nx = -hx, ny = 2 * step, nz = -hz, nl = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / nl; nor[k * 3 + 1] = ny / nl; nor[k * 3 + 2] = nz / nl;
      landAt(x, z, h, L);
      land[k * 4] = L[0] * 255; land[k * 4 + 1] = L[1] * 255; land[k * 4 + 2] = L[2] * 255; land[k * 4 + 3] = L[3] * 255;
      if (h < minY) minY = h; if (h > maxY) maxY = h;
    }
    const drop = S * 0.03 + 4;
    for (let e = 0; e < edges.length; e++) {
      const src = edges[e], k = V * V + e;
      pos[k * 3] = pos[src * 3]; pos[k * 3 + 1] = pos[src * 3 + 1] - drop; pos[k * 3 + 2] = pos[src * 3 + 2];
      parentY[k] = parentY[src] - drop;
      nor[k * 3] = nor[src * 3]; nor[k * 3 + 1] = nor[src * 3 + 1]; nor[k * 3 + 2] = nor[src * 3 + 2];
      for (let c = 0; c < 4; c++) land[k * 4 + c] = land[src * 4 + c];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('aParentY', new THREE.BufferAttribute(parentY, 1));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aLand', new THREE.BufferAttribute(land, 4, true));
    g.setIndex(indexBuffer().idx);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-S / 2, minY - drop, -S / 2), new THREE.Vector3(S / 2, maxY, S / 2));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.visible = false;
    this.group.add(mesh);
    const node = { mesh, l, i, j, S, cx, cz, minY, maxY, used: 0, morph: 1 };
    mesh.onBeforeRender = () => { if (this.mat.userData.shader) this.mat.userData.shader.uniforms.uTerrainMorph.value = node.morph; };
    this.cache.set(this.key(l, i, j), node);
    return node;
  }
  get(l, i, j) { return this.cache.get(this.key(l, i, j)); }
  sample(node, x, z) {
    const fx = clamp((x - node.cx + node.S / 2) / node.S * N, 0, N - 0.000001);
    const fz = clamp((z - node.cz + node.S / 2) / node.S * N, 0, N - 0.000001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const p = node.mesh.geometry.attributes.position, a = j * (N + 1) + i;
    const ha = p.getY(a), hb = p.getY(a + 1), hc = p.getY(a + N + 1), hd = p.getY(a + N + 2);
    return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : hb * (1 - v) + hc * (1 - u) + hd * (u + v - 1);
  }
  dist(cam, l, i, j) {
    const S = ROOT / (1 << l), x0 = -ROOT / 2 + i * S, z0 = -ROOT / 2 + j * S;
    const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + S)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + S));
    // Distance must not depend on whether a tile is cached. The previous
    // cache-dependent altitude made the same tile split/merge repeatedly.
    return Math.hypot(dx, dz, this.altitude * 0.65);
  }
  update(cam, budgetMs = this.engine.q.terrainBudget || 2, force = false, dt = 1 / 60) {
    this.frame++;
    this.altitude = Math.max(0, cam.y - heightAt(cam.x, cam.z));
    const vis = [], want = [];
    const visit = (l, i, j) => {
      const S = ROOT / (1 << l), key = this.key(l, i, j);
      const threshold = S * this.K * (this.split.has(key) ? 1.22 : 1);
      if (l < this.maxLevel && this.dist(cam, l, i, j) < threshold) {
        this.split.add(key);
        const kids = [[l + 1, i * 2, j * 2], [l + 1, i * 2 + 1, j * 2], [l + 1, i * 2, j * 2 + 1], [l + 1, i * 2 + 1, j * 2 + 1]];
        let ready = true;
        for (const k of kids) if (!this.get(...k)) { ready = false; want.push(k); }
        if (ready) { for (const k of kids) visit(...k); return; }
      } else this.split.delete(key);
      vis.push(this.get(l, i, j));
    };
    if (!this.get(0, 0, 0)) this.build(0, 0, 0);
    visit(0, 0, 0);
    want.sort((a, b) => this.dist(cam, ...a) - this.dist(cam, ...b));
    const t0 = performance.now();
    let built = 0;
    for (const k of want) {
      if (built >= (force ? 4 : 1) || (built && performance.now() - t0 >= budgetMs)) break;
      this.build(...k); built++;
    }
    const next = new Set(vis);
    for (const n of this.visible) if (!next.has(n)) n.mesh.visible = false;
    for (const n of vis) {
      if (!this.visible.has(n)) {
        const parent = n.l ? this.get(n.l - 1, Math.floor(n.i / 2), Math.floor(n.j / 2)) : null;
        n.morph = parent && this.visible.has(parent) ? 0 : 1;
      }
      n.morph = Math.min(1, n.morph + dt / 0.35);
      n.mesh.visible = true; n.used = this.frame;
    }
    this.visible = next;
    if (this.frame % 120 === 0 && this.cache.size > 700) {
      for (const [k, n] of this.cache) {
        if (n.l > 1 && this.frame - n.used > 600 && !this.split.has(k)) {
          this.group.remove(n.mesh); n.mesh.geometry.dispose(); this.cache.delete(k);
        }
      }
    }
    return want.length;
  }

}

/* ---------- 川の水面 ---------- */
export function makeRiver(engine) {
  const pts = RIVER.pts;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const w = RIVER.width[i] * 0.5 + 5;
    const y = RIVER.floor[i] + 0.15;
    pos.push(pts[i][0] - dz * w, y, pts[i][1] + dx * w, pts[i][0] + dz * w, y, pts[i][1] - dx * w);
    uv.push(RIVER.cum[i], 0, RIVER.cum[i], 1);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0x101c1e, roughness: 0.16, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = engine.uniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP2;\n' + GLSL_NOISE)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 p = vWP2.xz; float t = uTime;
          float e = 0.6;
          float h0 = vnoise(p*0.35 + vec2(t*0.25, t*0.1)) + 0.5*vnoise(p*1.1 - vec2(t*0.4, -t*0.2));
          float hx = vnoise((p+vec2(e,0.0))*0.35 + vec2(t*0.25, t*0.1)) + 0.5*vnoise((p+vec2(e,0.0))*1.1 - vec2(t*0.4, -t*0.2));
          float hz = vnoise((p+vec2(0.0,e))*0.35 + vec2(t*0.25, t*0.1)) + 0.5*vnoise((p+vec2(0.0,e))*1.1 - vec2(t*0.4, -t*0.2));
          vec3 wn = normalize(vec3(-(hx-h0)*0.35, 1.0, -(hz-h0)*0.35));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`);
  };
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  engine.scene.add(mesh);
  return mesh;
}

/* ---------- 街道（地面に沿わせた帯） ---------- */
export function roadMaterial(engine, kind) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP3; varying vec2 vUv3;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP3 = (modelMatrix * vec4(transformed,1.0)).xyz; vUv3 = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP3; varying vec2 vUv3;\n' + GLSL_NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float across = vUv3.y; float n = vnoise(vWP3.xz*0.9); float n2 = vnoise(vWP3.xz*0.18);
          ${kind === 'cobble' ? `
          vec3 cc = cell2(vWP3.xz*2.4);
          float stone = smoothstep(0.02, 0.12, cc.y - cc.x);
          vec3 sc = mix(vec3(0.36,0.34,0.31), vec3(0.52,0.49,0.45), cc.z) * (0.85+0.3*n);
          vec3 col = mix(vec3(0.18,0.16,0.14), sc, stone);
          float edgeA = smoothstep(0.0, 0.07, across) * smoothstep(1.0, 0.93, across);
          diffuseColor.rgb = pow(col, vec3(2.2));
          diffuseColor.a = edgeA;` : `
          float rut = smoothstep(0.08,0.0,abs(across-0.3)) + smoothstep(0.08,0.0,abs(across-0.7));
          vec3 col = mix(vec3(0.62,0.55,0.42), vec3(0.52,0.46,0.35), n) * (0.9+0.2*n2);
          float cd = length(vWP3 - cameraPosition);
          float nearD = smoothstep(90.0, 8.0, cd);
          vec3 pb = cell2(vWP3.xz*5.0);
          float pebble = smoothstep(0.28, 0.12, pb.x) * step(0.55, pb.z);
          col *= 1.0 + nearD*((vnoise(vWP3.xz*3.7)-0.5)*0.3 + (vnoise(vWP3.xz*14.0)-0.5)*0.22);
          col = mix(col, col*mix(0.6, 1.25, pb.z), pebble*nearD);
          col = mix(col, vec3(0.36,0.42,0.2), smoothstep(0.62, 0.8, vnoise(vWP3.xz*0.7 + 3.0))*smoothstep(0.42,0.5,abs(across-0.5))*0.6);
          col = mix(col, vec3(0.42,0.36,0.27), rut*0.5);
          float edgeA = smoothstep(0.0, 0.2, across) * smoothstep(1.0, 0.8, across) * (0.6+0.3*n);
          diffuseColor.rgb = pow(col, vec3(2.2));
          diffuseColor.a = edgeA;`} }`);
  };
  m.transparent = true; m.depthWrite = false;
  return m;
}
export function ribbonGeometry(pts, width, yfn, step = 6, lift = 0.25) {
  // 点列を step ごとに細かくし、地面の高さに沿わせる
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  dense.push(pts[pts.length - 1]);
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i > 0) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    const w = width * 0.5;
    const lx = dense[i][0] - dz * w, lz = dense[i][1] + dx * w, rx = dense[i][0] + dz * w, rz = dense[i][1] - dx * w;
    pos.push(lx, yfn(lx, lz) + lift, lz, rx, yfn(rx, rz) + lift, rz);
    uv.push(acc, 0, acc, 1);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function makeRoads(engine) {
  const mat = roadMaterial(engine, 'dirt');
  const group = new THREE.Group();
  for (const r of ROADS) {
    // 町の中は町の通りで描くので、ここでは町の外だけ
    const g = ribbonGeometry(r.pts, r.w * 1.6, heightAt, 8, 0.3);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.renderOrder = 2;
    group.add(mesh);
  }
  engine.scene.add(group);
  return group;
}
