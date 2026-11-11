// Ground material layers baked in Blender (island/blender/materials.py).
import * as THREE from "three";

export const LAYERS = [
  // name, metres per tile, roughness, fallback albedo
  ["sand", 2.6, 0.92, [0.78, 0.71, 0.58]],
  ["forest", 3.2, 0.95, [0.24, 0.18, 0.12]],
  ["soil", 3.0, 0.93, [0.33, 0.30, 0.18]],
  ["rock", 5.0, 0.82, [0.36, 0.34, 0.31]],
  ["mud", 3.0, 0.55, [0.20, 0.17, 0.12]],
  ["ash", 3.4, 0.9, [0.11, 0.10, 0.10]],
  ["gravel", 2.2, 0.88, [0.40, 0.38, 0.35]],
  ["moss", 2.4, 0.95, [0.16, 0.24, 0.08]],
];

export async function loadLayers(loader, quality) {
  const size = quality.layerSize;
  const scale = LAYERS.map((l) => l[1]);
  const rough = LAYERS.map((l) => l[2]);
  try {
    const albedo = await loader.textureArray(LAYERS.map((l) => `ground/${l[0]}_albedo.webp`), size, true);
    const normal = await loader.textureArray(LAYERS.map((l) => `ground/${l[0]}_normal.webp`), size, false);
    return { albedo, normal, scale, rough, baked: true };
  } catch (e) {
    console.warn("ground layers missing, using flat colours", e);
    return fallbackLayers(scale, rough);
  }
}

function fallbackLayers(scale, rough) {
  const s = 4, n = LAYERS.length;
  const a = new Uint8Array(s * s * 4 * n), b = new Uint8Array(s * s * 4 * n);
  LAYERS.forEach((l, i) => {
    for (let p = 0; p < s * s; p++) {
      const k = (i * s * s + p) * 4;
      const c = l[3];
      a[k] = Math.pow(c[0], 1 / 2.2) * 255; a[k + 1] = Math.pow(c[1], 1 / 2.2) * 255; a[k + 2] = Math.pow(c[2], 1 / 2.2) * 255; a[k + 3] = 255;
      b[k] = 128; b[k + 1] = 128; b[k + 2] = 128; b[k + 3] = 255;
    }
  });
  const mk = (d, srgb) => {
    const t = new THREE.DataArrayTexture(d, s, s, n);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: mk(a, true), normal: mk(b, false), scale, rough, baked: false };
}
