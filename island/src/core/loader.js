// Asset loading with progress: binary (gzip), images, GLB (meshopt) and texture arrays.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { gunzipSync } from "three/addons/libs/fflate.module.js";

export const ASSET_VER = "1";
export const base = new URL("assets/", location.href).href;

export class Loader {
  constructor() {
    this.total = 0;
    this.done = 0;
    this.onProgress = null;
    this.gltf = new GLTFLoader();
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.cache = new Map();
  }
  _track(p, weight = 1) {
    this.total += weight;
    this._emit();
    return p.then((v) => { this.done += weight; this._emit(); return v; });
  }
  _emit() { if (this.onProgress) this.onProgress(this.done / Math.max(this.total, 1)); }
  url(path) { return base + path + (path.includes("?") ? "&" : "?") + "v=" + ASSET_VER; }

  async bin(path, gz = true) {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error("load " + path + " " + res.status);
    if (!gz) return new Uint8Array(await res.arrayBuffer());
    if (typeof DecompressionStream !== "undefined") {
      const ds = res.body.pipeThrough(new DecompressionStream("gzip"));
      return new Uint8Array(await new Response(ds).arrayBuffer());
    }
    return gunzipSync(new Uint8Array(await res.arrayBuffer()));
  }
  binTracked(path, w = 3) { return this._track(this.bin(path), w); }

  image(path) {
    return this._track(new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image " + path));
      img.src = this.url(path);
    }));
  }
  async pixels(path) {
    const img = await this.image(path);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, img };
  }
  async texture(path, { srgb = true, repeat = true, aniso = 8 } = {}) {
    const img = await this.image(path);
    const t = new THREE.Texture(img);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  }
  json(path) { return this._track(fetch(this.url(path)).then((r) => r.json())); }
  glb(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    const p = this._track(new Promise((resolve, reject) => this.gltf.load(this.url(path), resolve, undefined, reject)), 2);
    this.cache.set(path, p);
    return p;
  }

  /** Stack same-sized images into an RGBA8 DataArrayTexture. */
  async textureArray(paths, size, srgb) {
    const imgs = await Promise.all(paths.map((p) => this.image(p)));
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const data = new Uint8Array(size * size * 4 * imgs.length);
    imgs.forEach((img, i) => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
    });
    const t = new THREE.DataArrayTexture(data, size, size, imgs.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }
}

/** Load the island heightfield and biome map. */
export async function loadTerrainData(loader) {
  const [meta, raw, biome] = await Promise.all([
    loader.json("terrain/terrain.json"),
    loader.binTracked("terrain/height.bin.gz", 4),
    loader.pixels("terrain/biome.png"),
  ]);
  const n = meta.n;
  const u16 = new Uint16Array(raw.buffer, raw.byteOffset, n * n);
  const heights = new Float32Array(n * n);
  const k = (meta.hmax - meta.hmin) / 65535;
  for (let i = 0; i < n * n; i++) heights[i] = meta.hmin + u16[i] * k;
  return { ...meta, heights, biome: { data: biome.data, w: biome.w, h: biome.h, img: biome.img } };
}

/**
 * Geometry of a mesh inside a GLB with the mesh's transform (relative to `root`) baked in
 * and quantized attributes converted to float. Needed for instancing meshes from
 * meshopt/quantized GLBs, where the dequantization scale lives on the node.
 */
export function bakedGeometry(mesh, root) {
  root.updateMatrixWorld(true);
  const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  for (const name in src.attributes) {
    const a = src.attributes[name];
    const n = a.count, s = a.itemSize;
    const arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  if (src.index) g.setIndex(src.index.clone());
  const isIdentity = rel.equals(new THREE.Matrix4());
  if (!isIdentity) {
    g.attributes.position.applyMatrix4(rel);
    if (g.attributes.normal) {
      const n = g.attributes.normal;
      n.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(rel));
      for (let i = 0; i < n.count; i++) {
        const x = n.getX(i), y = n.getY(i), z = n.getZ(i), l = Math.hypot(x, y, z) || 1;
        n.setXYZ(i, x / l, y / l, z / l);
      }
    }
  }
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
