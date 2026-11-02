// 依存の少ない glTF 2.0 (GLB) 書き出し。画像（JPEG）は GLB 内に埋め込む（自己完結）。
//  mode 'plain'（既定）: 拡張なし。位置・UV は float32、色は uint8 正規化。ゲームの GLTFLoader がそのまま読める
//                        （tokyo-sora/INTEGRATION.md v1: 非圧縮メッシュ・別デコーダー不要）
//  mode 'compact'      : KHR_mesh_quantization（int16/int8/uint16）＋ EXT_meshopt_compression。
//                        約1/3〜1/5の大きさになるが、three.js では MeshoptDecoder の組み込みが必要
import { MeshoptEncoder } from 'meshoptimizer';

const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
const BYTE = 5120, UNSIGNED_BYTE = 5121, SHORT = 5122, UNSIGNED_SHORT = 5123, UNSIGNED_INT = 5125, FLOAT = 5126;

/**
 * @param {object} scene
 * @param {{name:string, extras?:object, primitives:{positions:Float32Array, normals?:Float32Array|null, uvs?:Float32Array|null, colors?:Uint8Array|null, indices:Uint32Array, material:number}[]}[]} scene.meshes 1メッシュ=1子ノード
 * @param {{name:string, image?:number|null, color?:number[], doubleSided?:boolean, extras?:object}[]} scene.materials
 * @param {{data:Buffer, mime:string}[]} scene.images
 * @param {object} [scene.extras] ルートノードのextras
 * @param {string} [scene.copyright]
 * @param {{meshopt?:boolean}} [opts]
 * @returns {Promise<{glb:Buffer, stats:object}>}
 */
export async function writeGLB(scene, opts = {}) {
  const compact = opts.mode === 'compact';
  const useMeshopt = compact && opts.meshopt !== false;
  if (useMeshopt) await MeshoptEncoder.ready;

  // 量子化の範囲（全メッシュ共通・等倍）
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], nv = 0;
  for (const m of scene.meshes) for (const p of m.primitives) {
    const a = p.positions; nv += a.length / 3;
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { const v = a[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  }
  if (!nv) { mn = [0, 0, 0]; mx = [0, 0, 0]; }
  const offset = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2);
  const half = Math.max(1e-3, ...[0, 1, 2].map((k) => (mx[k] - mn[k]) / 2));
  const scale = half * 1.0001; // q/32767 * scale + offset

  const json = {
    asset: { version: '2.0', generator: 'tokyo-sora-data (compile-game/tools/tokyo-sora-data)' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [compact ? { name: 'tile', translation: offset, scale: [scale, scale, scale], children: [], extras: scene.extras || undefined } : { name: 'tile', children: [], extras: scene.extras || undefined }],
    meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [],
  };
  if (compact) { json.extensionsUsed = ['KHR_mesh_quantization']; json.extensionsRequired = ['KHR_mesh_quantization']; }
  if (scene.copyright) json.asset.copyright = scene.copyright;
  if (useMeshopt) { json.extensionsUsed.push('EXT_meshopt_compression'); json.extensionsRequired.push('EXT_meshopt_compression'); }

  const bin = [];      // BIN chunk pieces
  let binLen = 0, fbLen = 0;
  const pushBin = (buf) => { const pad = (4 - (binLen % 4)) % 4; if (pad) { bin.push(Buffer.alloc(pad)); binLen += pad; } const off = binLen; bin.push(buf); binLen += buf.length; return off; };
  const stats = { vertices: 0, triangles: 0, rawGeometryBytes: 0, geometryBytes: 0, imageBytes: 0 };

  const view = (raw, stride, count, target, mode) => {
    // raw: Buffer (uncompressed, stride-aligned)
    stats.rawGeometryBytes += raw.length;
    if (!useMeshopt) {
      const off = pushBin(raw);
      json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: raw.length, ...(target === ARRAY_BUFFER ? { byteStride: stride } : {}), target });
      stats.geometryBytes += raw.length;
      return json.bufferViews.length - 1;
    }
    const enc = Buffer.from(MeshoptEncoder.encodeGltfBuffer(new Uint8Array(raw.buffer, raw.byteOffset, raw.length), count, stride, mode));
    const off = pushBin(enc);
    const fpad = (4 - (fbLen % 4)) % 4; fbLen += fpad;
    const fOff = fbLen; fbLen += raw.length;
    json.bufferViews.push({
      buffer: 1, byteOffset: fOff, byteLength: raw.length, ...(target === ARRAY_BUFFER ? { byteStride: stride } : {}), target,
      extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: off, byteLength: enc.length, byteStride: stride, count, mode } },
    });
    stats.geometryBytes += enc.length;
    return json.bufferViews.length - 1;
  };
  const accessor = (bv, componentType, type, count, normalized, mnv, mxv) => {
    const a = { bufferView: bv, componentType, type, count };
    if (normalized) a.normalized = true;
    if (mnv) { a.min = mnv; a.max = mxv; }
    json.accessors.push(a); return json.accessors.length - 1;
  };

  // images / textures / materials
  if (scene.images.length) {
    json.images = []; json.textures = []; json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
    for (const im of scene.images) {
      const off = pushBin(im.data);
      json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: im.data.length });
      json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: im.mime || 'image/jpeg' });
      json.textures.push({ sampler: 0, source: json.images.length - 1 });
      stats.imageBytes += im.data.length;
    }
  }
  for (const m of scene.materials) {
    const pbr = { baseColorFactor: m.color || [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 };
    if (m.image != null) pbr.baseColorTexture = { index: m.image };
    json.materials.push({ name: m.name, pbrMetallicRoughness: pbr, ...(m.doubleSided ? { doubleSided: true } : {}), ...(m.extras ? { extras: m.extras } : {}) });
  }

  for (const m of scene.meshes) {
    const prims = [];
    for (const p of m.primitives) {
      const n = p.positions.length / 3;
      if (!n || !p.indices.length) continue;
      stats.vertices += n; stats.triangles += p.indices.length / 3;
      let attributes;
      if (!compact) {
        const pos = Buffer.alloc(n * 12), pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = Math.fround(p.positions[i * 3 + k]); pos.writeFloatLE(v, i * 12 + k * 4); if (v < pmin[k]) pmin[k] = v; if (v > pmax[k]) pmax[k] = v; }
        attributes = { POSITION: accessor(view(pos, 12, n, ARRAY_BUFFER), FLOAT, 'VEC3', n, false, pmin, pmax) };
        if (p.normals) { const nb = Buffer.alloc(n * 12); for (let i = 0; i < n * 3; i++) nb.writeFloatLE(p.normals[i], i * 4); attributes.NORMAL = accessor(view(nb, 12, n, ARRAY_BUFFER), FLOAT, 'VEC3', n, false); }
        if (p.uvs) { const ub = Buffer.alloc(n * 8); for (let i = 0; i < n * 2; i++) ub.writeFloatLE(p.uvs[i], i * 4); attributes.TEXCOORD_0 = accessor(view(ub, 8, n, ARRAY_BUFFER), FLOAT, 'VEC2', n, false); }
        if (p.colors) attributes.COLOR_0 = accessor(view(Buffer.from(p.colors.buffer, p.colors.byteOffset, n * 4), 4, n, ARRAY_BUFFER), UNSIGNED_BYTE, 'VEC4', n, true);
      } else {
      // POSITION: int16 x3 + pad (stride 8)
      const pos = Buffer.alloc(n * 8), pmin = [32767, 32767, 32767], pmax = [-32767, -32767, -32767];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        let q = Math.round(((p.positions[i * 3 + k] - offset[k]) / scale) * 32767);
        q = q < -32767 ? -32767 : q > 32767 ? 32767 : q;
        pos.writeInt16LE(q, i * 8 + k * 2);
        if (q < pmin[k]) pmin[k] = q; if (q > pmax[k]) pmax[k] = q;
      }
      attributes = { POSITION: accessor(view(pos, 8, n, ARRAY_BUFFER, 'ATTRIBUTES'), SHORT, 'VEC3', n, true, pmin, pmax) };
      if (p.normals) {
        const nb = Buffer.alloc(n * 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nb.writeInt8(Math.max(-127, Math.min(127, Math.round(p.normals[i * 3 + k] * 127))), i * 4 + k);
        attributes.NORMAL = accessor(view(nb, 4, n, ARRAY_BUFFER, 'ATTRIBUTES'), BYTE, 'VEC3', n, true);
      }
      if (p.uvs) {
        const ub = Buffer.alloc(n * 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) ub.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(p.uvs[i * 2 + k] * 65535))), i * 4 + k * 2);
        attributes.TEXCOORD_0 = accessor(view(ub, 4, n, ARRAY_BUFFER, 'ATTRIBUTES'), UNSIGNED_SHORT, 'VEC2', n, true);
      }
      if (p.colors) {
        attributes.COLOR_0 = accessor(view(Buffer.from(p.colors.buffer, p.colors.byteOffset, n * 4), 4, n, ARRAY_BUFFER, 'ATTRIBUTES'), UNSIGNED_BYTE, 'VEC4', n, true);
      }
      }
      const big = n > 65535;
      const ib = Buffer.alloc(p.indices.length * (big ? 4 : 2));
      for (let i = 0; i < p.indices.length; i++) big ? ib.writeUInt32LE(p.indices[i], i * 4) : ib.writeUInt16LE(p.indices[i], i * 2);
      const ia = accessor(view(ib, big ? 4 : 2, p.indices.length, ELEMENT_ARRAY_BUFFER, 'TRIANGLES'), big ? UNSIGNED_INT : UNSIGNED_SHORT, 'SCALAR', p.indices.length, false);
      prims.push({ attributes, indices: ia, material: p.material, mode: 4 });
    }
    if (!prims.length) continue;
    json.meshes.push({ name: m.name, primitives: prims });
    json.nodes.push({ name: m.name, mesh: json.meshes.length - 1, ...(m.extras ? { extras: m.extras } : {}) });
    json.nodes[0].children.push(json.nodes.length - 1);
  }
  if (!json.nodes[0].children.length) delete json.nodes[0].children;
  for (const k of ['materials', 'meshes', 'accessors', 'bufferViews']) if (!json[k].length) delete json[k];

  json.buffers.push({ byteLength: binLen });
  if (useMeshopt) json.buffers.push({ byteLength: fbLen, extensions: { EXT_meshopt_compression: { fallback: true } } });
  const binBuf = Buffer.concat(bin, binLen);
  const glb = packGLB(json, binBuf);
  stats.bytes = glb.length;
  if (compact) stats.quantization = { offset, scale };
  return { glb, stats };
}

function packGLB(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = (4 - (js.length % 4)) % 4; if (jp) js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bp = (4 - (bin.length % 4)) % 4; if (bp) bin = Buffer.concat([bin, Buffer.alloc(bp)]);
  const total = 12 + 8 + js.length + (bin.length ? 8 + bin.length : 0);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const parts = [h, jh, js];
  if (bin.length) { const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4); parts.push(bh, bin); }
  return Buffer.concat(parts);
}

/** テスト用: GLBのJSONチャンクを読む */
export function readGLBJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not GLB');
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}
