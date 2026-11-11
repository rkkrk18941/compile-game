// Island terrain: CPU height/biome queries for gameplay and a GPU-displaced CDLOD
// quadtree (morphing between levels, so no cracks or popping) with a splatting material
// that blends eight tileable ground layers baked in Blender.
import * as THREE from "three";
import { G, GLSL_COMMON, patchMaterial } from "../gfx/shaderlib.js";

const PATCH = 32;          // quads per patch side
const LEAF = 50;           // metres, finest node size
const LEVELS = 6;          // 50, 100, 200, 400, 800, 1600 m

// layer indices in the material arrays
export const L = { SAND: 0, FOREST: 1, SOIL: 2, ROCK: 3, MUD: 4, ASH: 5, GRAVEL: 6, MOSS: 7 };

export class Terrain {
  constructor({ heights, n, size, hmin, hmax, landmarks }, biome) {
    this.h = heights;          // Float32Array n*n, row = z, col = x
    this.n = n;
    this.size = size;
    this.half = size / 2;
    this.step = size / (n - 1);
    this.hmin = hmin;
    this.hmax = hmax;
    this.landmarks = landmarks;
    this.biome = biome;        // {data: Uint8ClampedArray RGBA, w, h}
    this.water = 0;
    this._buildMinMax();
  }

  // ------------------------------------------------------------------ CPU queries
  heightAt(x, z) {
    const n = this.n;
    let fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    fx = Math.min(Math.max(fx, 0), n - 1.001);
    fz = Math.min(Math.max(fz, 0), n - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const h = this.h, i = iz * n + ix;
    const a = h[i], b = h[i + 1], c = h[i + n], d = h[i + n + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.step;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  slopeAt(x, z) {
    const n = this.normalAt(x, z, _v);
    return Math.acos(Math.min(1, n.y)) * 57.2958;
  }
  /** forest, mire, volcanic in 0..1 */
  biomeAt(x, z, out = { forest: 0, mire: 0, vol: 0 }) {
    const b = this.biome;
    let u = (x + this.half) / this.size * (b.w - 1), v = (z + this.half) / this.size * (b.h - 1);
    u = Math.min(Math.max(u, 0), b.w - 1.001);
    v = Math.min(Math.max(v, 0), b.h - 1.001);
    const iu = u | 0, iv = v | 0, tu = u - iu, tv = v - iv;
    const d = b.data, w = b.w;
    const s = (o) => {
      const i0 = (iv * w + iu) * 4 + o, i1 = i0 + 4, i2 = i0 + w * 4, i3 = i2 + 4;
      return ((d[i0] + (d[i1] - d[i0]) * tu) * (1 - tv) + (d[i2] + (d[i3] - d[i2]) * tu) * tv) / 255;
    };
    out.forest = s(0); out.mire = s(1); out.vol = s(2);
    return out;
  }
  /** Ray march against the heightfield. Returns distance or -1. */
  raycast(origin, dir, maxDist = 400, step = 1) {
    let t = 0, prevAbove = origin.y - this.heightAt(origin.x, origin.z);
    while (t < maxDist) {
      t += step;
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const above = y - this.heightAt(x, z);
      if (above < 0) {
        const f = prevAbove / (prevAbove - above);
        return t - step + step * f;
      }
      prevAbove = above;
      step = Math.min(step * 1.05, 6);
    }
    return -1;
  }

  // ------------------------------------------------------------------ quadtree data
  _buildMinMax() {
    // min/max height for every node of every level
    this.mm = [];
    const n = this.n;
    for (let lv = 0; lv < LEVELS; lv++) {
      const size = LEAF * (1 << lv);
      const cnt = Math.round(this.size / size);
      const arr = new Float32Array(cnt * cnt * 2);
      for (let j = 0; j < cnt; j++) {
        for (let i = 0; i < cnt; i++) {
          let mn = 1e9, mx = -1e9;
          if (lv === 0) {
            const x0 = Math.max(0, Math.floor((i * size) / this.step)), x1 = Math.min(n - 1, Math.ceil(((i + 1) * size) / this.step));
            const z0 = Math.max(0, Math.floor((j * size) / this.step)), z1 = Math.min(n - 1, Math.ceil(((j + 1) * size) / this.step));
            for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
              const v = this.h[z * n + x];
              if (v < mn) mn = v;
              if (v > mx) mx = v;
            }
          } else {
            const prev = this.mm[lv - 1], pc = cnt * 2;
            for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
              const k = ((j * 2 + dz) * pc + (i * 2 + dx)) * 2;
              mn = Math.min(mn, prev[k]);
              mx = Math.max(mx, prev[k + 1]);
            }
          }
          arr[(j * cnt + i) * 2] = mn;
          arr[(j * cnt + i) * 2 + 1] = mx;
        }
      }
      this.mm.push(arr);
    }
  }

  // ------------------------------------------------------------------ GPU
  createGPU(renderer, layers, csm, quality) {
    const n = this.n;
    const ht = new THREE.DataTexture(this.h, n, n, THREE.RedFormat, THREE.FloatType);
    ht.minFilter = ht.magFilter = THREE.NearestFilter;
    ht.needsUpdate = true;
    G.uHeightTex.value = ht;
    G.uTerrain.value.set(this.size, this.half, n, this.water);

    // normal + cavity map (RGBA8): xz normal, cavity, flow
    const nm = new Uint8Array(n * n * 4);
    const h = this.h, e = this.step;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const xl = Math.max(x - 1, 0), xr = Math.min(x + 1, n - 1), zu = Math.max(z - 1, 0), zd = Math.min(z + 1, n - 1);
        const dx = (h[z * n + xr] - h[z * n + xl]) / ((xr - xl) * e);
        const dz = (h[zd * n + x] - h[zu * n + x]) / ((zd - zu) * e);
        const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1);
        const c = h[z * n + x];
        // cavity: how much lower than the 8 neighbours average (positive = in a hollow)
        let s = 0;
        for (let oz = -2; oz <= 2; oz += 2) for (let ox = -2; ox <= 2; ox += 2) {
          const xx = Math.min(Math.max(x + ox, 0), n - 1), zz = Math.min(Math.max(z + oz, 0), n - 1);
          s += h[zz * n + xx];
        }
        const cav = (s / 9 - c);
        const i = (z * n + x) * 4;
        nm[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
        nm[i + 1] = Math.round((-dz * inv * 0.5 + 0.5) * 255);
        nm[i + 2] = Math.max(0, Math.min(255, Math.round(128 + cav * 40)));
        nm[i + 3] = 255;
      }
    }
    const nt = new THREE.DataTexture(nm, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    nt.minFilter = THREE.LinearMipmapLinearFilter;
    nt.magFilter = THREE.LinearFilter;
    nt.generateMipmaps = true;
    nt.anisotropy = 4;
    nt.needsUpdate = true;
    this.normalTex = nt;

    // patch geometry: (PATCH+1)^2 grid + skirt ring. position.xz in [0,1], position.y = skirt flag
    const verts = [];
    const idx = [];
    const P = PATCH;
    for (let j = 0; j <= P; j++) for (let i = 0; i <= P; i++) verts.push(i / P, 0, j / P);
    for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
      const a = j * (P + 1) + i, b = a + 1, c = a + P + 1, d = c + 1;
      // alternate the diagonal for nicer shading
      if ((i + j) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
    const ring = [];
    for (let i = 0; i < P; i++) ring.push([i, 0]);
    for (let j = 0; j < P; j++) ring.push([P, j]);
    for (let i = P; i > 0; i--) ring.push([i, P]);
    for (let j = P; j > 0; j--) ring.push([0, j]);
    const base = verts.length / 3;
    for (const [i, j] of ring) verts.push(i / P, 1, j / P);
    for (let k = 0; k < ring.length; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % ring.length];
      const a = j0 * (P + 1) + i0, b = j1 * (P + 1) + i1, sa = base + k, sb = base + (k + 1) % ring.length;
      idx.push(a, sa, b, b, sa, sb);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    this.maxNodes = 512;
    this.nodeAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxNodes * 4), 4);
    this.nodeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aNode", this.nodeAttr);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(1e5, 1e5, 1e5));

    this.range = [];
    const r0 = quality.tier >= 2 ? 110 : 80;
    for (let i = 0; i < LEVELS; i++) this.range.push(r0 * Math.pow(2, i));
    const morph = [];
    for (let i = 0; i < LEVELS; i++) {
      const prev = i ? this.range[i - 1] : 0;
      morph.push(new THREE.Vector2(prev + (this.range[i] - prev) * 0.62, this.range[i]));
    }
    this.morphU = { value: morph };

    const vertPars = /* glsl */ `
      attribute vec4 aNode;
      uniform vec2 uMorph[${LEVELS}];
      varying vec3 vTerrainPos;
      vec3 terrainVertex(vec3 p){
        vec2 gp = p.xz;
        vec2 wxz = aNode.xy + gp * aNode.z;
        float hh = terrainHeight(wxz);
        float d = distance(cameraPosition, vec3(wxz.x, hh, wxz.y));
        int lod = int(aNode.w + 0.5);
        vec2 mr = uMorph[0];
        for (int i = 1; i < ${LEVELS}; i++) if (i == lod) mr = uMorph[i];
        float k = clamp((d - mr.x) / (mr.y - mr.x), 0.0, 1.0);
        vec2 fr = fract(gp * ${P.toFixed(1)} * 0.5) * 2.0 / ${P.toFixed(1)};
        gp -= fr * k;
        wxz = aNode.xy + gp * aNode.z;
        float y = terrainHeight(wxz) - p.y * (1.0 + aNode.z * 0.04);
        return vec3(wxz.x, y, wxz.y);
      }
    `;
    const vertMain = /* glsl */ `
      vec3 transformed = terrainVertex(position);
      vTerrainPos = transformed;
    `;

    // ---- material
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    mat.envMapIntensity = 1.0;
    this.layerU = {
      uAlbedo: { value: layers.albedo },
      uNormH: { value: layers.normal },
      uLayerScale: { value: layers.scale },
      uLayerRough: { value: layers.rough },
      uTerrainNormal: { value: nt },
      uDetail: { value: quality.tier >= 2 ? 1 : 0 },
      uTile2: { value: quality.tier >= 1 ? 1 : 0 },
    };
    const self = this;
    patchMaterial(mat, {
      csm,
      extra: {
        key: "terrain" + quality.tier,
        uniforms: { ...this.layerU, uMorph: this.morphU },
        vertexPars: vertPars,
        fragmentPars: TERRAIN_FRAG_PARS,
      },
    });
    // replace vertex position and the surface inputs on top of the generic patch
    const generic = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      generic(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace("#include <begin_vertex>", vertMain)
        .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);");
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "varying vec3 vTerrainPos;\nvoid main() {\n TerrainSurface ts = terrainSurface(vTerrainPos);")
        .replace("#include <map_fragment>", "diffuseColor.rgb = ts.albedo;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = ts.rough;")
        .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0; vec3 normal = normalize((viewMatrix * vec4(ts.normal, 0.0)).xyz); vec3 nonPerturbedNormal = normal;")
        .replace("#include <normal_fragment_maps>", "")
        .replace("#include <aomap_fragment>", "reflectedLight.indirectDiffuse *= ts.ao; reflectedLight.indirectSpecular *= ts.ao;");
    };
    this.material = mat;

    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => {
      for (const k in G) shader.uniforms[k] = G[k];
      shader.uniforms.uMorph = self.morphU;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n" + GLSL_COMMON + vertPars)
        .replace("#include <begin_vertex>", vertMain);
    };
    depth.customProgramCacheKey = () => "terrain-depth";

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = quality.tier >= 1;
    this.mesh.customDepthMaterial = depth;
    this.mesh.name = "terrain";
    return this.mesh;
  }

  /** CDLOD selection; call each frame. */
  update(camera) {
    if (!this.mesh) return;
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this._count = 0;
    this._cam = camera.position;
    this._select(0, 0, LEVELS - 1);
    this.mesh.geometry.instanceCount = this._count;
    this.nodeAttr.needsUpdate = true;
    this.nodeAttr.clearUpdateRanges();
    this.nodeAttr.addUpdateRange(0, this._count * 4);
  }
  _box(i, j, lv, box) {
    const size = LEAF * (1 << lv);
    const cnt = Math.round(this.size / size);
    const mm = this.mm[lv];
    const k = (j * cnt + i) * 2;
    box.min.set(-this.half + i * size, mm[k] - 2, -this.half + j * size);
    box.max.set(-this.half + (i + 1) * size, mm[k + 1] + 1, -this.half + (j + 1) * size);
    return box;
  }
  _select(i, j, lv) {
    const box = this._box(i, j, lv, _box);
    if (!_frustum.intersectsBox(box)) return;
    if (lv === 0) return this._add(i, j, 0);
    _sphere.center.copy(this._cam);
    _sphere.radius = this.range[lv - 1];
    if (!box.intersectsSphere(_sphere)) return this._add(i, j, lv);
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      const ci = i * 2 + dx, cj = j * 2 + dz;
      const cb = this._box(ci, cj, lv - 1, _box2);
      if (cb.intersectsSphere(_sphere)) this._select(ci, cj, lv - 1);
      else if (_frustum.intersectsBox(cb)) this._add(ci, cj, lv - 1);
    }
  }
  _add(i, j, lv) {
    if (this._count >= this.maxNodes) return;
    const size = LEAF * (1 << lv);
    const a = this.nodeAttr.array, k = this._count * 4;
    a[k] = -this.half + i * size;
    a[k + 1] = -this.half + j * size;
    a[k + 2] = size;
    a[k + 3] = lv;
    this._count++;
  }
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box = new THREE.Box3();
const _box2 = new THREE.Box3();
const _sphere = new THREE.Sphere();

// ------------------------------------------------------------------ splatting shader
const TERRAIN_FRAG_PARS = /* glsl */ `
uniform sampler2DArray uAlbedo;   // rgb albedo (AO baked in)
uniform sampler2DArray uNormH;    // rg tangent normal, b height
uniform float uLayerScale[8];     // metres per tile
uniform float uLayerRough[8];
uniform sampler2D uTerrainNormal;
uniform float uDetail;
uniform float uTile2;              // 1: second texture lattice against visible tiling

struct TerrainSurface { vec3 albedo; vec3 normal; float rough; float ao; };

vec3 macroNormal(vec2 xz, out float cav){
  vec4 t = texture2D(uTerrainNormal, (xz + uTerrain.y) / uTerrain.x);
  vec2 n = t.xy * 2.0 - 1.0;
  cav = (t.z - 0.5) * 2.0;
  return normalize(vec3(n.x, sqrt(max(1.0 - dot(n, n), 0.0)), n.y));
}

// a second lattice, rotated ~38 degrees and 1.6x larger, so its repeats never line up with the
// base tile's; world noise and the two height maps pick between them in patches (nb < 0: off)
const mat2 ROT_B = mat2(0.788, 0.616, -0.616, 0.788);
void sampleLayer(int i, vec2 uv, float far, float nb, out vec3 alb, out vec3 nh){
  vec3 a = texture(uAlbedo, vec3(uv, float(i))).rgb;
  vec3 n = texture(uNormH, vec3(uv, float(i))).rgb;
  if (nb >= 0.0 && far < 0.6){
    vec2 uvB = ROT_B * uv * 0.62 + vec2(0.37, 0.71);
    vec3 aB = texture(uAlbedo, vec3(uvB, float(i))).rgb;
    vec3 nB = texture(uNormH, vec3(uvB, float(i))).rgb;
    nB.xy = ((nB.xy * 2.0 - 1.0) * ROT_B) * 0.4 + 0.5;   // back into the base frame, softer slopes
    float k = clamp((nb - 0.5) * 3.0 + (nB.b - n.b) * 1.6 + 0.5, 0.0, 1.0) * (1.0 - far / 0.6);
    a = mix(a, aB, k);
    n = mix(n, nB, k);
  }
  if (far > 0.0){
    // far away: blend in larger samples to break up tiling
    vec3 a2 = texture(uAlbedo, vec3(uv * 0.23 + 0.37, float(i))).rgb;
    vec3 n2 = texture(uNormH, vec3(uv * 0.23 + 0.37, float(i))).rgb;
    a = mix(a, a2, far * 0.6);
    n = mix(n, n2, far * 0.5);
    if (far > 0.99 && i == 3){
      vec3 a3 = texture(uAlbedo, vec3(uv * 0.061 + 0.71, float(i))).rgb;
      vec3 n3 = texture(uNormH, vec3(uv * 0.061 + 0.71, float(i))).rgb;
      a = mix(a, a3, 0.55);
      n = mix(n, n3, 0.55);
    }
  }
  alb = a; nh = n;
}

TerrainSurface terrainSurface(vec3 wp){
  TerrainSurface s;
  float cav;
  vec3 N = macroNormal(wp.xz, cav);
  vec3 bio = biomeAt(wp.xz);
  float forest = bio.r, mire = bio.g, vol = bio.b;
  float h = wp.y;
  float slope = 1.0 - N.y;               // 0 flat .. ~0.3 at 45 degrees
  float dist = length(wp - cameraPosition);
  float far = smoothstep(25.0, 120.0, dist);
  float n1 = fbm3(wp.xz * 0.045);
  float n2 = fbm3(wp.xz * 0.21 + 3.0);
  float nb = uTile2 > 0.5 ? fbm3(wp.xz * 0.13 + 7.0) : -1.0;

  // ---- layer weights
  float w[8];
  float beach = smoothstep(3.3, 2.1, h + (n1 - 0.5) * 1.4) * (1.0 - mire);
  float rock = smoothstep(0.17, 0.3, slope + (n2 - 0.5) * 0.12);
  rock = max(rock, vol * smoothstep(0.08, 0.2, slope + (n1 - 0.5) * 0.1));
  float underwater = smoothstep(0.0, -2.5, h);
  w[0] = beach * (1.0 - rock);
  w[1] = forest * (1.0 - beach) * (1.0 - rock) * (1.0 - mire) * (1.0 - vol);
  w[2] = (1.0 - forest) * (1.0 - beach) * (1.0 - rock) * (1.0 - mire) * (1.0 - vol) * 0.9;
  w[3] = rock;
  w[4] = mire * (1.0 - rock);
  w[5] = vol * (1.0 - rock) * (1.0 - beach);
  // gravel: stream beds (cavities) and the western boulder beaches
  w[6] = (1.0 - rock) * smoothstep(0.5, 1.2, cav * 1.5 + n2 * 0.6) * (1.0 - mire) * (1.0 - beach * 0.6) * (0.3 + vol * 0.5);
  w[7] = forest * rock * (1.0 - vol) * smoothstep(0.3, 0.7, n1 + 0.15) + w[1] * smoothstep(0.62, 0.9, n2) * 0.8;
  // seabed: sand with reef rubble
  w[0] = mix(w[0], 1.0, underwater * (1.0 - rock * 0.5));
  w[6] += underwater * smoothstep(0.55, 0.85, n2) * 0.8;

  // ---- height-aware blending
  vec3 alb[8]; vec3 nh[8];
  float best = -1.0;
  float wt[8];
  for (int i = 0; i < 8; i++){
    wt[i] = w[i];
    if (w[i] > 0.02){
      vec2 uv = wp.xz / uLayerScale[i];
      if (i == 3){
        // cliffs: blend planar projections so steep faces are not stretched
        vec3 bw = pow(abs(N), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 a1, a2, a3, n1_, n2_, n3_;
        sampleLayer(3, wp.zy / uLayerScale[3], far, -1.0, a1, n1_);
        sampleLayer(3, wp.xz / uLayerScale[3], far, bw.y > 0.5 ? nb : -1.0, a2, n2_);
        sampleLayer(3, wp.xy / uLayerScale[3], far, -1.0, a3, n3_);
        alb[i] = a1 * bw.x + a2 * bw.y + a3 * bw.z;
        nh[i] = n1_ * bw.x + n2_ * bw.y + n3_ * bw.z;
      } else {
        sampleLayer(i, uv, far, nb, alb[i], nh[i]);
      }
      wt[i] = w[i] + nh[i].b * 0.55;
      best = max(best, wt[i]);
    } else { alb[i] = vec3(0.0); nh[i] = vec3(0.5, 0.5, 0.0); wt[i] = -1.0; }
  }
  float depthB = 0.22;
  vec3 A = vec3(0.0); vec3 NH = vec3(0.0); float R = 0.0; float sum = 0.0;
  for (int i = 0; i < 8; i++){
    float k = max(wt[i] - (best - depthB), 0.0);
    vec3 nhs = nh[i];
    // beach sand: wind ripples only in patches and near the waterline, otherwise soft
    if (i == 0) nhs.xy = mix(vec2(0.5), nhs.xy, 0.07 + 0.33 * smoothstep(0.6, 0.85, fbm3(wp.xz * 0.04 + 2.0)) + 0.25 * smoothstep(1.2, 0.3, h));
    A += alb[i] * k; NH += nhs * k; R += uLayerRough[i] * k; sum += k;
  }
  A /= max(sum, 1e-4); NH /= max(sum, 1e-4); R /= max(sum, 1e-4);

  // seen from afar, dense jungle reads as a continuous dark canopy between the tree impostors
  float canopyFar = forest * (1.0 - mire) * (1.0 - vol) * smoothstep(110.0, 380.0, dist) * smoothstep(3.0, 6.0, h);
  A = mix(A, vec3(0.025, 0.05, 0.015) * (0.75 + 0.5 * n1), canopyFar * 0.85);
  // volcanic rock is darker basalt
  A *= mix(1.0, 0.72, vol * w[3] / max(best + 0.3, 1.0));
  // macro colour variation so large areas never look tiled
  float macro = fbm3(wp.xz * 0.012 + 11.0);
  A *= mix(0.82, 1.12, macro);
  A = mix(A, A * vec3(1.05, 0.98, 0.86), smoothstep(0.55, 0.8, fbm3(wp.xz * 0.03 + 5.0)) * forest * 0.5);
  // cavities collect moisture and debris
  A *= 1.0 - clamp(cav, 0.0, 1.0) * 0.25;

  // detail normal in world space (uv = xz)
  vec2 dn = (NH.xy * 2.0 - 1.0) * vec2(1.0, -1.0) * mix(1.0, 0.45, far);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = normalize(vec3(0.0, 0.0, 1.0) - N * N.z);
  vec3 Nd = normalize(N * 1.0 + T * dn.x + B * dn.y);

  // wet sand at the waterline and in the mire; darker, glossier, flatter
  float wet = smoothstep(0.75, 0.05, h + (n2 - 0.5) * 0.3) * (1.0 - underwater);
  wet = max(wet, mire * smoothstep(0.55, 0.1, NH.b));
  A = mix(A, A * 0.55, wet * 0.85);
  R = mix(R, 0.18, wet * 0.9);
  Nd = normalize(mix(Nd, N, wet * 0.6));

  // under water: sunlight caustics and absorption tint
  if (h < 0.0){
    float d = -h;
    vec2 cp = wp.xz * 0.55;
    float c1 = abs(sin(cp.x * 1.7 + uTime * 1.1 + sin(cp.y * 1.3 + uTime * 0.7) * 1.6));
    float c2 = abs(sin(cp.y * 1.9 - uTime * 0.9 + sin(cp.x * 1.1 - uTime * 0.6) * 1.8));
    float caust = pow(1.0 - min(c1, c2), 6.0) * smoothstep(8.0, 0.3, d);
    A += vec3(0.5, 0.6, 0.55) * caust * max(uSunDir.y, 0.0) * 0.9;
    A *= exp(-d * vec3(0.32, 0.09, 0.06));
  }

  s.albedo = A;
  s.normal = Nd;
  s.rough = clamp(R, 0.05, 1.0);
  s.ao = clamp(mix(1.0, NH.b * 0.6 + 0.4, 0.7) * (1.0 - clamp(cav, 0.0, 1.0) * 0.3), 0.0, 1.0);
  return s;
}
`;
