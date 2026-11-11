// Trees and large plants: GLB species from Blender, deterministic placement from the
// terrain/biome maps, cell-based culling and three LOD tiers rendered with instancing.
import * as THREE from "three";
import { patchMaterial, windDepthMaterial } from "../gfx/shaderlib.js";
import { bakedGeometry } from "../core/loader.js";

const CELL = 64;

// placement rules. density(x, z, h, slope, b) returns 0..1 probability per grid cell.
export const SPECIES = [
  {
    id: "palm", glb: "plants/palm.glb", variants: 3, spacing: 7.5, wind: 4, lod: [36, 120], far: 900, collide: 0.28,
    density: (x, z, h, sl, b) => (h > 1.3 && h < 14 && sl < 22 && b.vol < 0.2 && b.mire < 0.35)
      ? (h < 5 ? 0.42 : 0.16 * (1 - b.forest * 0.6)) : 0,
    scale: [0.85, 1.12],
  },
  {
    id: "pandanus", glb: "plants/pandanus.glb", variants: 2, spacing: 8, wind: 3, lod: [30, 90], far: 500, collide: 0.35,
    density: (x, z, h, sl, b) => (h > 1.8 && h < 9 && sl < 20 && b.mire < 0.3 && b.vol < 0.2) ? 0.3 : 0,
    scale: [0.85, 1.2],
  },
  {
    id: "buttress", glb: "plants/buttress.glb", variants: 2, spacing: 30, wind: 5, lod: [48, 160], far: 1600, collide: 1.0,
    density: (x, z, h, sl, b) => (b.forest > 0.55 && h > 4 && h < 110 && sl < 24 && b.mire < 0.3 && b.vol < 0.3) ? 0.5 : 0,
    scale: [0.9, 1.15],
  },
  {
    id: "canopy", glb: "plants/canopy.glb", variants: 3, spacing: 9, wind: 4.5, lod: [40, 120], far: 1500, collide: 0.45,
    density: (x, z, h, sl, b) => (b.forest > 0.3 && h > 3 && sl < 40 && b.mire < 0.4 && b.vol < 0.5) ? 0.88 * Math.min(1, b.forest * 1.5) : 0,
    scale: [0.9, 1.35],
  },
  {
    id: "smalltree", glb: "plants/smalltree.glb", variants: 2, spacing: 7, wind: 3, lod: [20, 75], far: 450, collide: 0.2,
    density: (x, z, h, sl, b) => (b.forest > 0.4 && h > 2.5 && sl < 34 && b.vol < 0.5) ? 0.45 : 0,
    scale: [0.8, 1.25],
  },
  {
    id: "mangrove", glb: "plants/mangrove.glb", variants: 3, spacing: 5.5, wind: 3, lod: [30, 100], far: 700, collide: 0.6,
    density: (x, z, h, sl, b) => (b.mire > 0.35 && h > -0.7 && h < 1.6) ? 0.6 * b.mire : 0,
    scale: [0.8, 1.25],
  },
  {
    id: "treefern", glb: "plants/treefern.glb", variants: 2, spacing: 9, wind: 2.5, lod: [28, 90], far: 450, collide: 0.2,
    density: (x, z, h, sl, b) => (b.forest > 0.45 && h > 8 && h < 160 && sl < 32 && b.mire < 0.2) ? 0.35 + 0.3 * Math.min(1, (h - 8) / 60) : 0,
    scale: [0.8, 1.25],
  },
];

const IMP_VERT_PARS = /* glsl */ `
attribute vec4 aPos;      // x, y, z, scale
attribute float aVar;
uniform float uCells;
uniform vec2 uSizes[4];
varying vec2 vCrown;
`;
const IMP_BEGIN = /* glsl */ `
  vec2 sz = uSizes[0];
  for (int i = 1; i < 4; i++) if (float(i) == aVar) sz = uSizes[i];
  vec3 toCam = cameraPosition - aPos.xyz; toCam.y = 0.0;
  vec3 F = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), F));
  vec3 transformed = aPos.xyz + R * position.x * sz.x * aPos.w + vec3(0.0, 1.0, 0.0) * position.y * sz.y * aPos.w;
  vCrown = vec2(position.x * 2.0, (position.y - 0.62) * 2.2);
`;

function hash2(x, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Foliage {
  constructor(engine, terrain, loader, quality) {
    this.engine = engine;
    this.terrain = terrain;
    this.loader = loader;
    this.q = quality;
    this.group = new THREE.Group();
    this.group.name = "foliage";
    this.species = [];
    this.colliders = new Map(); // cell key -> [{x, z, r}]
    this.texCache = new Map();
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.exclude = [];        // [{x, z, r}] clearings (LZ, camp)
  }

  tex(name, srgb) {
    const key = name + (srgb ? ":s" : ":l");
    if (!this.texCache.has(key)) {
      const p = this.loader.texture(name, { srgb, aniso: 8 }).catch(() => null);
      this.texCache.set(key, p);
    }
    return this.texCache.get(key);
  }

  async makeMaterial(name, csm) {
    // material names from Blender: bark_<tex>, leaf_<tex>, fruit_vc
    if (name.startsWith("fruit")) {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
      return { mat: patchMaterial(m, { csm }), depth: null, wind: false };
    }
    const leaf = name.startsWith("leaf_");
    const texName = leaf ? name.slice(5) : name;
    const [map, nmap] = await Promise.all([this.tex(`plants/${texName}_albedo.webp`, true), this.tex(`plants/${texName}_normal.webp`, false)]);
    const m = new THREE.MeshStandardMaterial({
      map, normalMap: nmap, roughness: leaf ? 0.62 : 0.92, metalness: 0,
      side: leaf ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: leaf ? 0.45 : 0,
    });
    if (leaf) {
      m.alphaToCoverage = this.q.msaa > 0;
      m.normalScale.set(0.6, 0.6);
      m.envMapIntensity = 0.7;
    }
    const wind = leaf ? 1 : 3;
    const size = map && map.image ? new THREE.Vector2(map.image.width, map.image.height) : new THREE.Vector2(1024, 1024);
    patchMaterial(m, { csm, wind, leaf: leaf ? new THREE.Color(0.28, 0.36, 0.1) : null, alphaMip: leaf ? size : null });
    const depth = windDepthMaterial(leaf ? map : null, wind, 0.45);
    return { mat: m, depth, wind: true };
  }

  async impostorMaterial(id, meta, csm) {
    const [map, nmap] = await Promise.all([this.tex(`plants/${id}_imp_albedo.webp`, true), this.tex(`plants/${id}_imp_normal.webp`, false)]);
    if (!map) return null;
    map.wrapS = map.wrapT = nmap.wrapS = nmap.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map, normalMap: nmap, alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide });
    m.alphaToCoverage = this.q.msaa > 0;
    m.envMapIntensity = 0.7;
    const sizes = [0, 1, 2, 3].map((i) => new THREE.Vector2(...(meta.sizes[Math.min(i, meta.sizes.length - 1)])));
    patchMaterial(m, {
      csm,
      extra: {
        key: "imp", uniforms: { uCells: { value: meta.variants }, uSizes: { value: sizes } },
        vertexPars: IMP_VERT_PARS, fragmentPars: "varying vec2 vCrown;",
      },
    });
    const generic = m.onBeforeCompile;
    m.onBeforeCompile = (shader, r) => {
      generic(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace("#include <begin_vertex>", IMP_BEGIN)
        .replace("#include <beginnormal_vertex>", "vec3 toCamN = cameraPosition - aPos.xyz; toCamN.y = 0.0; vec3 objectNormal = normalize(toCamN + vec3(1e-4, 0.0, 0.0));")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n vMapUv = vec2((uv.x + aVar) / uCells, uv.y); vNormalMapUv = vMapUv;");
      // soften the noisy card normals toward a rounded crown
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { vec3 sph = normalize(vec3(vCrown.x, vCrown.y, 0.9));
          vec3 sphV = normalize(tbn * sph);
          normal = normalize(mix(normal, sphV, 0.55)); }`);
    };
    return m;
  }

  async load(csm, onProgress) {
    const t = this.terrain;
    const mats = new Map();
    let impMeta = {};
    try { impMeta = await this.loader.json("plants/impostors.json"); } catch (e) { impMeta = {}; }
    let done = 0;
    for (const sp of SPECIES) {
      let gltf;
      try {
        gltf = await this.loader.glb(sp.glb);
      } catch (e) {
        console.warn("missing", sp.glb);
        continue;
      }
      const S = { def: sp, variants: [], instances: [] };
      for (let v = 0; v < sp.variants; v++) {
        const lods = [];
        for (let l = 0; l < 2; l++) {
          const node = gltf.scene.getObjectByName(`${sp.id}${v}_lod${l}`);
          if (!node) continue;
          const prims = [];
          node.updateMatrixWorld(true);
          node.traverse((o) => {
            if (!o.isMesh) return;
            const g = bakedGeometry(o, gltf.scene);
            if (g.attributes.color) {
              const isFruit = o.material.name.startsWith("fruit");
              if (!isFruit) {
                g.setAttribute("aWind", g.attributes.color);
                g.deleteAttribute("color");
              }
            } else {
              g.setAttribute("aWind", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
            }
            prims.push({ geo: g, matName: o.material.name });
          });
          lods.push(prims);
        }
        S.variants.push(lods);
      }
      // materials
      for (const lods of S.variants) for (const prims of lods) for (const p of prims) {
        if (!mats.has(p.matName)) mats.set(p.matName, await this.makeMaterial(p.matName, csm));
        p.m = mats.get(p.matName);
      }
      this.place(S);
      this.buildMeshes(S);
      if (impMeta[sp.id]) {
        const im = await this.impostorMaterial(sp.id, impMeta[sp.id], csm);
        if (im) this.buildImpostor(S, im);
      }
      this.species.push(S);
      done++;
      if (onProgress) onProgress(done / SPECIES.length);
    }
  }

  place(S) {
    const sp = S.def, t = this.terrain;
    const half = t.half - 4;
    const step = sp.spacing;
    const n = Math.floor((half * 2) / step);
    const b = { forest: 0, mire: 0, vol: 0 };
    const seed = sp.id.length * 977 + sp.id.charCodeAt(0);
    const density = this.q.foliageDensity;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const r0 = hash2(i, j, seed);
        if (r0 > 0.98 * density + 0.02 && density < 1) continue;
        const x = -half + (i + 0.15 + 0.7 * hash2(i, j, seed + 1)) * step;
        const z = -half + (j + 0.15 + 0.7 * hash2(i, j, seed + 2)) * step;
        const h = t.heightAt(x, z);
        if (h < -1) continue;
        t.biomeAt(x, z, b);
        const sl = t.slopeAt(x, z);
        let p = sp.density(x, z, h, sl, b);
        if (p <= 0) continue;
        // clumping: modulate by a low frequency hash field
        const clump = 0.55 + 0.9 * valueNoise(x / 60, z / 60, seed);
        if (hash2(i, j, seed + 3) > p * clump) continue;
        let excluded = false;
        for (const e of this.exclude) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) { excluded = true; break; }
        if (excluded) continue;
        const s = sp.scale[0] + (sp.scale[1] - sp.scale[0]) * hash2(i, j, seed + 4);
        const inst = {
          x, y: h - 0.05, z, rot: hash2(i, j, seed + 5) * Math.PI * 2, s,
          v: Math.floor(hash2(i, j, seed + 6) * S.variants.length) % S.variants.length,
          cell: cellKey(x, z),
        };
        S.instances.push(inst);
        if (sp.collide) this.addCollider(x, z, sp.collide * s, sp.id);
      }
    }
    // bucket instances by cell
    S.cells = new Map();
    for (let k = 0; k < S.instances.length; k++) {
      const inst = S.instances[k];
      if (!S.cells.has(inst.cell)) S.cells.set(inst.cell, []);
      S.cells.get(inst.cell).push(k);
    }
  }

  addCollider(x, z, r, kind) {
    const key = cellKey(x, z);
    if (!this.colliders.has(key)) this.colliders.set(key, []);
    this.colliders.get(key).push({ x, z, r, kind });
  }

  /** Colliders near a point (3x3 cells). */
  collidersNear(x, z, out = []) {
    out.length = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.colliders.get((cx + dx) + "," + (cz + dz));
      if (list) for (const c of list) out.push(c);
    }
    return out;
  }

  buildMeshes(S) {
    // per variant: tiers 0 (LOD0), 1 (LOD1 casting), 2 (LOD1 far, no shadows)
    const maxPer = Math.max(16, S.instances.length);
    S.tiers = [];
    for (let v = 0; v < S.variants.length; v++) {
      const tiers = [];
      for (let tier = 0; tier < 3; tier++) {
        const lod = Math.min(tier, 1);
        const prims = S.variants[v][lod] || S.variants[v][0];
        const cap = tier === 0 ? Math.min(maxPer, 400) : maxPer;
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
        attr.setUsage(THREE.DynamicDrawUsage);
        const meshes = prims.map((p) => {
          const m = new THREE.InstancedMesh(p.geo, p.m.mat, cap);
          m.instanceMatrix = attr;
          m.count = 0;
          m.name = `${S.def.id}:t${tier}`;
          m.frustumCulled = false;
          m.castShadow = tier < 2 && (this.q.tier > 0 || tier === 0);
          m.receiveShadow = true;
          if (p.m.depth) m.customDepthMaterial = p.m.depth;
          this.group.add(m);
          return m;
        });
        tiers.push({ attr, meshes, cap, count: 0 });
      }
      S.tiers.push(tiers);
    }
  }

  buildImpostor(S, mat) {
    const cap = Math.max(16, S.instances.length);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const aVar = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    aPos.setUsage(THREE.DynamicDrawUsage);
    aVar.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aPos", aPos);
    geo.setAttribute("aVar", aVar);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.name = S.def.id + ":imp";
    this.group.add(mesh);
    S.imp = { geo, aPos, aVar, cap, count: 0 };
  }

  update(camera, force = false) {
    const cam = camera.position;
    const dir = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (!force && cam.distanceToSquared(this.lastCam) < 1.5 && dir.dot(this.lastDir) > 0.995) return;
    this.lastCam.copy(cam);
    this.lastDir.copy(dir);
    _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_proj);
    const shadowFar = this.q.shadowFar;
    for (const S of this.species) {
      const sp = S.def;
      for (const tiers of S.tiers) for (const t of tiers) t.count = 0;
      if (S.imp) S.imp.count = 0;
      const far = Math.min(sp.far, this.q.viewDist);
      const lod0 = sp.lod[0] * (this.q.tier >= 2 ? 1 : 0.75);
      const cr = Math.ceil(far / CELL);
      const ccx = Math.floor(cam.x / CELL), ccz = Math.floor(cam.z / CELL);
      for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
        const list = S.cells.get((ccx + dx) + "," + (ccz + dz));
        if (!list) continue;
        const x0 = (ccx + dx) * CELL, z0 = (ccz + dz) * CELL;
        const nearX = Math.max(x0, Math.min(cam.x, x0 + CELL)), nearZ = Math.max(z0, Math.min(cam.z, z0 + CELL));
        const cd = Math.hypot(nearX - cam.x, nearZ - cam.z);
        if (cd > far) continue;
        _box.min.set(x0 - 12, -10, z0 - 12);
        _box.max.set(x0 + CELL + 12, 260, z0 + CELL + 12);
        const inView = _frustum.intersectsBox(_box);
        if (!inView && cd > 30) continue;
        for (const k of list) {
          const inst = S.instances[k];
          const d = Math.hypot(inst.x - cam.x, inst.z - cam.z);
          if (d > far) continue;
          const castD = shadowFar * 0.55;
          const tier = d < lod0 ? 0 : (d < castD ? 1 : (d < sp.lod[1] ? 2 : 3));
          if (tier === 3 && !S.imp) { /* no impostor: keep the far LOD1 */ }
          if (tier === 3 && S.imp) {
            const I = S.imp;
            if (I.count < I.cap) {
              I.aPos.array[I.count * 4] = inst.x;
              I.aPos.array[I.count * 4 + 1] = inst.y;
              I.aPos.array[I.count * 4 + 2] = inst.z;
              I.aPos.array[I.count * 4 + 3] = inst.s;
              I.aVar.array[I.count] = inst.v;
              I.count++;
            }
            continue;
          }
          const T = S.tiers[inst.v][Math.min(tier, 2)];
          if (T.count >= T.cap) continue;
          _m.makeRotationY(inst.rot);
          _m.scale(_s.set(inst.s, inst.s, inst.s));
          _m.setPosition(inst.x, inst.y, inst.z);
          _m.toArray(T.attr.array, T.count * 16);
          T.count++;
        }
      }
      if (S.imp) {
        const I = S.imp;
        I.geo.instanceCount = I.count;
        I.mesh = I.mesh || this.group.children.find((m) => m.geometry === I.geo);
        if (I.mesh) I.mesh.visible = I.count > 0;
        I.aPos.clearUpdateRanges(); I.aPos.addUpdateRange(0, I.count * 4); I.aPos.needsUpdate = true;
        I.aVar.clearUpdateRanges(); I.aVar.addUpdateRange(0, I.count); I.aVar.needsUpdate = true;
      }
      for (const tiers of S.tiers) for (const t of tiers) {
        for (const m of t.meshes) { m.count = t.count; m.visible = t.count > 0; }
        t.attr.clearUpdateRanges();
        t.attr.addUpdateRange(0, t.count * 16);
        t.attr.needsUpdate = true;
      }
    }
  }

  /** Remove instances inside a circle (e.g. for a camp clearing) - before load(). */
  clear(x, z, r) { this.exclude.push({ x, z, r }); }
}

function cellKey(x, z) {
  return Math.floor(x / CELL) + "," + Math.floor(z / CELL);
}

function valueNoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), tx = x - xi, tz = z - zi;
  const u = tx * tx * (3 - 2 * tx), w = tz * tz * (3 - 2 * tz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return (a + (b - a) * u) * (1 - w) + (c + (d - c) * u) * w;
}

const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _proj = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box = new THREE.Box3();
