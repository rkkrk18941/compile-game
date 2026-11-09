// Ground cover around the camera:
//  * Grass: GPU-placed blade clumps on a camera-wrapped grid (stable world positions),
//    density from the biome map, wind, distance shrink.
//  * Ground plants: ferns, クワズイモ, shrubs, seedlings, グンバイヒルガオ - generated per 16 m tile
//    deterministically and culled per tile each frame.
import * as THREE from "three";
import { G, GLSL_WIND, patchMaterial, windDepthMaterial } from "../gfx/shaderlib.js";
import { bakedGeometry } from "../core/loader.js";

// ------------------------------------------------------------------------------------- grass
// One instanced draw: every cell of a camera-wrapped grid picks its grass kind from the biome
// (tropical grass, beach grass, sedge in the mire, wiry tussock on the ridge).
const GRASS_VERT = /* glsl */ `
uniform vec4 uGrid;       // x spacing, y grid size, z radius, w seed
varying vec3 vGrassC;
`;

const GRASS_MAIN = /* glsl */ `
  float G_ = uGrid.y;
  float id = float(gl_InstanceID);
  vec2 ij = vec2(mod(id, G_), floor(id / G_));
  vec2 baseCell = floor(cameraPosition.xz / uGrid.x) - G_ * 0.5;
  vec2 w = baseCell + mod(ij - baseCell, G_);
  vec2 wxz = (w + hash22(w + uGrid.w)) * uGrid.x;
  float h = terrainHeight(wxz);
  float hx = terrainHeight(wxz + vec2(1.2, 0.0)), hz = terrainHeight(wxz + vec2(0.0, 1.2));
  float slope = 1.0 - normalize(vec3(h - hx, 1.2, h - hz)).y;
  vec3 b = biomeAt(wxz);
  float n = fbm3(wxz * 0.09 + 3.0);
  float steep = smoothstep(0.32, 0.5, slope);
  float kG = (1.0 - b.b) * (1.0 - b.g) * smoothstep(2.6, 4.0, h) * (1.0 - steep) * mix(0.95, 0.1, smoothstep(0.35, 0.8, b.r)) * smoothstep(0.15, 0.45, n + 0.2);
  float kB = smoothstep(1.7, 2.3, h) * (1.0 - smoothstep(4.0, 6.0, h)) * (1.0 - b.g) * 0.6 * smoothstep(0.35, 0.65, n);
  float kS = b.g * smoothstep(-0.05, 0.25, h) * (1.0 - smoothstep(2.5, 4.0, h)) * 0.9;
  float kT = b.b * (1.0 - steep) * 0.5 * smoothstep(0.3, 0.7, n);
  float dens = max(max(kG, kB), max(kS, kT));
  vec4 shape; vec3 cBase, cTip;   // shape: height, width, lean, spare
  if (dens == kS) { shape = vec4(1.7, 1.35, 0.8, 0.0); cBase = vec3(0.04, 0.07, 0.02); cTip = vec3(0.2, 0.22, 0.07); }
  else if (dens == kB) { shape = vec4(1.35, 0.55, 1.2, 0.0); cBase = vec3(0.09, 0.1, 0.03); cTip = vec3(0.34, 0.31, 0.14); }
  else if (dens == kT) { shape = vec4(0.65, 0.5, 1.5, 0.0); cBase = vec3(0.08, 0.07, 0.03); cTip = vec3(0.36, 0.3, 0.14); }
  else { shape = vec4(1.0, 1.0, 1.0, 0.0); cBase = vec3(0.03, 0.065, 0.012); cTip = vec3(0.12, 0.19, 0.045); }
  float r = hash12(w * 1.37 + 3.1);
  float dist = length(wxz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(uGrid.z * 0.65, uGrid.z, dist);
  float scale = (r < dens ? 1.0 : 0.0) * fade * (0.65 + 0.7 * hash12(w + 7.7));
  float ang = hash12(w + 1.9) * 6.2831;
  float cs = cos(ang), sn = sin(ang);
  vec3 lp = position * vec3(shape.y, shape.x, shape.y) * scale;
  lp.xz += lp.y * lp.y * (shape.z - 1.0) * 0.3 * vec2(cs, sn);
  lp = vec3(cs * lp.x - sn * lp.z, lp.y, sn * lp.x + cs * lp.z);
  vec3 wp = vec3(wxz.x, h - 0.03, wxz.y) + lp;
  if (scale <= 0.0) wp = vec3(0.0, -1000.0, 0.0);
  wp += windOffset(wp, lp, aWind.rgb, 0.8) * scale;
  vec3 transformed = wp;
  float tint = hash12(w + 5.3);
  vGrassC = mix(cBase, cTip, aWind.a) * (0.75 + 0.5 * tint) * mix(vec3(1.0), vec3(1.2, 1.05, 0.65), step(0.88, tint));
`;

export class Grass {
  constructor(gltf, csm, quality) {
    this.group = new THREE.Group();
    this.q = quality;
    if (quality.grassDensity <= 0) return;
    const node = gltf.scene.getObjectByName("grass0_lod0");
    let src = null;
    if (node) node.traverse((o) => { if (o.isMesh && !src) src = bakedGeometry(o, gltf.scene); });
    if (!src) return;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = src.index;
    geo.setAttribute("position", src.attributes.position);
    geo.setAttribute("normal", src.attributes.normal);
    geo.setAttribute("aWind", src.attributes.color);
    const spacing = 0.6 / Math.sqrt(quality.grassDensity);
    const radius = quality.grassRadius;
    const gsize = Math.ceil((radius * 2) / spacing);
    geo.instanceCount = gsize * gsize;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide });
    patchMaterial(mat, {
      csm, leaf: new THREE.Color(0.25, 0.32, 0.08),
      extra: {
        key: "grass",
        uniforms: { uGrid: { value: new THREE.Vector4(spacing, gsize, radius, 13.7) } },
        vertexPars: GLSL_WIND + "\nattribute vec4 aWind;\n" + GRASS_VERT,
        fragmentPars: "varying vec3 vGrassC;",
      },
    });
    const generic = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      generic(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace("#include <begin_vertex>", GRASS_MAIN)
        .replace("#include <beginnormal_vertex>", "vec3 objectNormal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), 0.65));");
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "diffuseColor.rgb = vGrassC;");
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = "grass";
    this.group.add(mesh);
    this.count = geo.instanceCount;
  }
}

// ------------------------------------------------------------------------------------- tiled plants
const TILE = 16;

export const GROUND_PLANTS = [
  { id: "fern", glb: "plants/fern.glb", variants: 3, spacing: 2.4, scale: [0.7, 1.3], dist: 60,
    density: (h, sl, b) => (b.forest > 0.3 && h > 2.5 && sl < 38 && b.mire < 0.3) ? 0.55 * b.forest + 0.1 : (b.vol > 0.3 && h > 40 && sl < 30 ? 0.08 : 0) },
  { id: "alocasia", glb: "plants/understory.glb", variants: 3, spacing: 4.5, scale: [0.7, 1.3], dist: 70,
    density: (h, sl, b) => (b.forest > 0.45 && h > 3 && sl < 30 && b.vol < 0.3) ? 0.42 : 0 },
  { id: "shrub", glb: "plants/understory.glb", variants: 3, spacing: 4.0, scale: [0.7, 1.4], dist: 70,
    density: (h, sl, b) => (h > 2.4 && sl < 34 && b.mire < 0.4) ? (b.forest > 0.3 ? 0.35 : 0.12 * (1 - b.vol)) : 0 },
  { id: "seedling", glb: "plants/understory.glb", variants: 3, spacing: 1.8, scale: [0.7, 1.5], dist: 40,
    density: (h, sl, b) => (b.forest > 0.4 && h > 2.5 && b.mire < 0.3) ? 0.5 : 0 },
  { id: "morningglory", glb: "plants/understory.glb", variants: 2, spacing: 3.0, scale: [0.8, 1.4], dist: 60,
    density: (h, sl, b) => (h > 1.0 && h < 3.6 && b.mire < 0.2 && b.forest < 0.5) ? 0.4 : 0 },
];

function hash2(x, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class GroundPlants {
  constructor(terrain, foliage, quality) {
    this.t = terrain;
    this.foliage = foliage; // for texture + material creation
    this.q = quality;
    this.group = new THREE.Group();
    this.types = [];
    this.tiles = new Map();
    this.radius = 56 * (quality.tier >= 2 ? 1.15 : quality.tier === 0 ? 0.65 : 0.85);
    this.lastTile = "";
    this.exclude = [];
  }

  async load(loader, csm) {
    const mats = new Map();
    for (const def of GROUND_PLANTS) {
      let gltf;
      try { gltf = await loader.glb(def.glb); } catch (e) { continue; }
      const T = { def, variants: [] };
      for (let v = 0; v < def.variants; v++) {
        const node = gltf.scene.getObjectByName(`${def.id}${v}_lod0`);
        if (!node) continue;
        const prims = [];
        node.traverse((o) => {
          if (!o.isMesh) return;
          const g = bakedGeometry(o, gltf.scene);
          if (g.attributes.color) { g.setAttribute("aWind", g.attributes.color); g.deleteAttribute("color"); }
          else g.setAttribute("aWind", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
          prims.push({ geo: g, matName: o.material.name });
        });
        const cap = 1400;
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        attr.setUsage(THREE.DynamicDrawUsage);
        const meshes = [];
        for (const p of prims) {
          if (!mats.has(p.matName)) mats.set(p.matName, await this.material(p.matName, csm));
          const M = mats.get(p.matName);
          const m = new THREE.InstancedMesh(p.geo, M.mat, cap);
          m.instanceMatrix = attr;
          m.count = 0;
          m.name = "gp:" + def.id;
          m.frustumCulled = false;
          m.castShadow = this.q.tier >= 3;
          m.receiveShadow = true;
          if (M.depth) m.customDepthMaterial = M.depth;
          this.group.add(m);
          meshes.push(m);
        }
        T.variants.push({ attr, meshes, cap });
      }
      if (T.variants.length) this.types.push(T);
    }
  }

  async material(name, csm) {
    if (name.startsWith("stem")) {
      const m = new THREE.MeshStandardMaterial({ color: name === "stem_dark" ? 0x1a1a14 : 0x3c5a1e, roughness: 0.8 });
      patchMaterial(m, { csm, wind: 1.5 });
      return { mat: m, depth: windDepthMaterial(null, 1.5) };
    }
    return this.foliage.makeMaterial(name, csm);
  }

  _genTile(tx, tz) {
    const out = [];
    const b = { forest: 0, mire: 0, vol: 0 };
    for (let ti = 0; ti < this.types.length; ti++) {
      const T = this.types[ti], def = T.def;
      const per = new Array(T.variants.length).fill(null).map(() => []);
      const n = Math.max(1, Math.round(TILE / def.spacing));
      const step = TILE / n;
      const seed = def.id.length * 131 + def.id.charCodeAt(1);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const gi = tx * n + i, gj = tz * n + j;
        const x = tx * TILE + (i + hash2(gi, gj, seed)) * step;
        const z = tz * TILE + (j + hash2(gi, gj, seed + 1)) * step;
        const h = this.t.heightAt(x, z);
        if (h < 0.2) continue;
        this.t.biomeAt(x, z, b);
        const sl = this.t.slopeAt(x, z);
        const p = def.density(h, sl, b) * this.q.foliageDensity;
        if (hash2(gi, gj, seed + 2) > p) continue;
        let skip = false;
        for (const e of this.exclude) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) { skip = true; break; }
        if (skip) continue;
        // keep clear of tree trunks
        const near = this.foliage.collidersNear(x, z, _near);
        for (const c of near) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.6) ** 2) { skip = true; break; }
        if (skip) continue;
        const s = def.scale[0] + (def.scale[1] - def.scale[0]) * hash2(gi, gj, seed + 3);
        _m.makeRotationY(hash2(gi, gj, seed + 4) * Math.PI * 2);
        _m.scale(_s.set(s, s, s));
        _m.setPosition(x, h - 0.03, z);
        const v = Math.floor(hash2(gi, gj, seed + 5) * T.variants.length) % T.variants.length;
        per[v].push(..._m.elements);
      }
      out.push(per.map((a) => new Float32Array(a)));
    }
    return { tx, tz, data: out };
  }

  update(camera) {
    const cam = camera.position;
    const R = this.radius;
    const ctx = Math.floor(cam.x / TILE), ctz = Math.floor(cam.z / TILE);
    const key = ctx + "," + ctz;
    const rt = Math.ceil(R / TILE);
    if (key !== this.lastTile) {
      this.lastTile = key;
      for (const [k, tile] of this.tiles) {
        if (Math.abs(tile.tx - ctx) > rt + 1 || Math.abs(tile.tz - ctz) > rt + 1) this.tiles.delete(k);
      }
    }
    // generate a few missing tiles per frame, nearest first
    let budget = this.tiles.size === 0 ? 1e9 : 3;
    for (let r = 0; r <= rt && budget > 0; r++) {
      for (let dz = -r; dz <= r && budget > 0; dz++) for (let dx = -r; dx <= r && budget > 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const k = (ctx + dx) + "," + (ctz + dz);
        if (!this.tiles.has(k)) { this.tiles.set(k, this._genTile(ctx + dx, ctz + dz)); budget--; }
      }
    }
    _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_proj);
    const counts = this.types.map((T) => T.variants.map(() => 0));
    for (const tile of this.tiles.values()) {
      const x0 = tile.tx * TILE, z0 = tile.tz * TILE;
      const cx = Math.max(x0, Math.min(cam.x, x0 + TILE)), cz = Math.max(z0, Math.min(cam.z, z0 + TILE));
      const d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d > R) continue;
      _box.min.set(x0 - 2, cam.y - 300, z0 - 2);
      _box.max.set(x0 + TILE + 2, cam.y + 300, z0 + TILE + 2);
      if (d > 12 && !_frustum.intersectsBox(_box)) continue;
      for (let ti = 0; ti < this.types.length; ti++) {
        const T = this.types[ti];
        if (d > T.def.dist) continue;
        for (let v = 0; v < T.variants.length; v++) {
          const src = tile.data[ti] && tile.data[ti][v];
          if (!src || !src.length) continue;
          const V = T.variants[v];
          const c = counts[ti][v];
          const k = Math.min(src.length / 16, V.cap - c);
          if (k <= 0) continue;
          V.attr.array.set(k * 16 === src.length ? src : src.subarray(0, k * 16), c * 16);
          counts[ti][v] = c + k;
        }
      }
    }
    for (let ti = 0; ti < this.types.length; ti++) {
      const T = this.types[ti];
      for (let v = 0; v < T.variants.length; v++) {
        const V = T.variants[v];
        const c = counts[ti][v];
        for (const m of V.meshes) { m.count = c; m.visible = c > 0; }
        V.attr.clearUpdateRanges();
        V.attr.addUpdateRange(0, c * 16);
        V.attr.needsUpdate = true;
      }
    }
  }
}

const _near = [];
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _proj = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box = new THREE.Box3();
