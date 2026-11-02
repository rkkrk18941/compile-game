// CityGMLの構造物（建築物・橋梁・都市設備など）→ 区画ごとの自己完結GLB（tokyo-sora/INTEGRATION.md v1）。
import sharp from 'sharp';
import { triangulatePolygon, ringXZ, convexHullXZ, tileBounds, tileAt, llToWorld, worldToLL } from './geometry.mjs';
import { buildAtlas, mapUV } from './atlas.mjs';
import { writeGLB } from './glb.mjs';

export const TILE_Z = 16;
/** CityGMLの地物型 → レイヤー名（PLATEAUのファイル種別コードに合わせる） */
export const STRUCT_TYPES = { Building: 'bldg', Bridge: 'brid', CityFurniture: 'frn', Tunnel: 'tun', OtherConstruction: 'cons' };
const KEEP_ATTRS = ['name', 'usage', 'class', 'measuredHeight', 'storeysAboveGround', 'storeysBelowGround', 'yearOfConstruction', 'buildingID', 'function'];
// 無テクスチャ面の既定色（データではなく描画上の既定値。manifest では textured:false として区別する）
const DEFAULT_COLOR = { RoofSurface: [140, 140, 138], WallSurface: [208, 206, 201], GroundSurface: [120, 120, 120], ClosureSurface: [190, 190, 190], OuterCeilingSurface: [176, 176, 172] };

/**
 * 解析済みCityGMLから構造物を取り出し、三角形化する。
 * @param {object} parsed parseCityGML の戻り値
 * @param {object} ap indexAppearance の戻り値
 * @param {{resolveImage:(uri:string)=>string|null, maxLod?:number, source:string}} ctx
 */
export function extractStructures(parsed, ap, ctx) {
  const maxLod = ctx.maxLod ?? 2;
  const out = [];
  const stat = { features: 0, byLod: { 1: 0, 2: 0, 3: 0 }, texturedPolys: 0, untexturedPolys: 0, missingImages: new Set(), skippedPolys: 0 };
  for (const f of parsed.features) {
    const layer = STRUCT_TYPES[f.type];
    if (!layer) continue;
    stat.features++;
    const byLod = [[], [], [], [], []];
    for (const p of f.polys) if (p.lod != null && p.lod <= 4) byLod[p.lod].push(p);
    let lod = null;
    for (let l = Math.min(3, maxLod); l >= 1; l--) if (byLod[l].length) { lod = l; break; }
    if (lod == null) continue;
    stat.byLod[lod]++;
    const polys = [];
    let minY = Infinity, maxY = -Infinity, sx = 0, sz = 0, sn = 0;
    const seen = new Set();
    for (const p of byLod[lod]) {
      if (p.id) { if (seen.has(p.id)) continue; seen.add(p.id); }
      let tex = null, uvRings = null;
      const t = p.id ? ap.byPoly.get(p.id) : null;
      if (t) {
        const img = ctx.resolveImage(ap.textures[t.tex].image);
        if (img) {
          uvRings = p.ringIds.map((rid) => (rid && t.rings.get(rid)) || null);
          if (uvRings[0]) tex = img; else uvRings = null;
        } else stat.missingImages.add(ap.textures[t.tex].image);
      }
      const tri = triangulatePolygon(p.rings, uvRings);
      if (!tri) { stat.skippedPolys++; continue; }
      if (!tri.uv) tex = null;
      const c = p.id ? ap.colorByPoly.get(p.id) : null;
      const color = c ? c.diffuse.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) : DEFAULT_COLOR[p.surface] || [190, 190, 186];
      polys.push({ tri, tex, color, colorFromData: !!c, surface: p.surface });
      if (tex) stat.texturedPolys++; else stat.untexturedPolys++;
      for (let i = 0; i < tri.pos.length; i += 3) { const y = tri.pos[i + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; sx += tri.pos[i]; sz += tri.pos[i + 2]; sn++; }
    }
    if (!polys.length) continue;
    // 足跡: LOD0（屋根外形/足跡）→ 地面 → 凸包
    let fp = null;
    const l0 = byLod[0].find((p) => p.prop === 'lod0RoofEdge') || byLod[0].find((p) => p.prop === 'lod0FootPrint');
    if (l0) fp = ringXZ(l0.rings[0]);
    if (!fp || fp.length < 3) {
      const g = polys.filter((p) => p.surface === 'GroundSurface');
      const pts = (g.length ? g : polys).flatMap((p) => Array.from(p.tri.pos));
      fp = convexHullXZ(pts);
    }
    let cx = 0, cz = 0;
    if (fp.length >= 3) { for (const q of fp) { cx += q[0]; cz += q[1]; } cx /= fp.length; cz /= fp.length; } else { cx = sx / sn; cz = sz / sn; }
    const attrs = {};
    for (const k of KEEP_ATTRS) if (f.attrs[k] != null) attrs[k] = f.attrs[k];
    if (f.attrs['usage@codeSpace']) attrs['usage@codeSpace'] = f.attrs['usage@codeSpace'];
    const buildingId = f.attrs.buildingID || f.attrs['gen:建物ID'] || null;
    out.push({ layer, type: f.type, id: f.id, buildingId, attrs, lod, polys, footprint: fp, cx, cz, base: minY, top: maxY, source: ctx.source,
      textured: polys.some((p) => p.tex), texturedShare: polys.filter((p) => p.tex).length / polys.length });
  }
  stat.missingImages = [...stat.missingImages];
  return { structures: out, stat };
}

/** 構造物を代表点（足跡の重心）で Webメルカトル z タイルに振り分ける（建物は切らない） */
export function assignTiles(structs, z = TILE_Z) {
  const tiles = new Map();
  for (const s of structs) {
    const [x, y] = tileAt(z, s.cx, s.cz);
    const k = z + '/' + x + '/' + y;
    if (!tiles.has(k)) { const b = tileBounds(z, x, y); tiles.set(k, { z, x, y, bounds: b, structs: [] }); }
    tiles.get(k).structs.push(s);
  }
  return [...tiles.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

/** 上限（三角形・メモリ）を超える区画を z+1 の4区画に分ける */
export function splitChunks(chunks, limits, maxZ = 18) {
  const out = [];
  const stack = [...chunks];
  while (stack.length) {
    const c = stack.shift();
    const g = estimateGeometry(c.structs);
    if ((g.tris > limits.maxTriangles || g.bytes > limits.memoryLimit * 0.8) && c.z < maxZ && c.structs.length > 1) stack.push(...assignTiles(c.structs, c.z + 1));
    else out.push(c);
  }
  return out.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

const metaCache = new Map();
async function imageMeta(src) {
  let m = metaCache.get(src);
  if (!m) { m = await sharp(src).metadata(); metaCache.set(src, m); }
  return m;
}

/** 区画のジオメトリ量（テクスチャ以外）の概算。分割の判定に使う */
export function estimateGeometry(structs) {
  let tris = 0, verts = 0, textured = 0;
  for (const s of structs) for (const p of s.polys) { tris += p.tri.idx.length / 3; verts += p.tri.pos.length / 3; if (p.tex) textured += p.tri.pos.length / 3; }
  // ゲームのメモリ概算（RealModels）: ファイル + 頂点属性 + インデックス。plain GLB は 位置12B＋(UV8B or 色4B)
  const attr = verts * 12 + textured * 8 + (verts - textured) * 4, idx = tris * 3 * (verts > 65535 ? 4 : 2);
  return { tris, verts, bytes: 2 * (attr + idx) };
}

/**
 * 1区画分の自己完結GLB（tokyo-sora/INTEGRATION.md v1）を作る。
 * GLBの中身は原点（経度・緯度・標高0m）からの実距離m（X=東, Y=上=T.P.標高, Z=南）。
 * ゲームは llToWorld(原点) に置き、X/Z を K/cos(緯度) 倍する（real-models.js）ので、その逆をかけておく。
 * @param {{structs:object[]}} chunk
 * @param {{texelDensity:number, memoryLimit:number, pageSize:number, quality:number, mode:'plain'|'compact', normals:boolean, copyright:string, K:number}} o
 */
export async function buildChunk(chunk, o) {
  // 実際の中身の範囲（世界座標）→ 経度緯度の bbox と原点
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const s of chunk.structs) for (const p of s.polys) { const a = p.tri.pos; for (let i = 0; i < a.length; i += 3) { const x = a[i], z = a[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } }
  const [latS, lonW] = worldToLL(x0, z1), [latN, lonE] = worldToLL(x1, z0);
  const bboxLL = [lonW, latS, lonE, latN];
  const lon0 = (lonW + lonE) / 2, lat0 = (latS + latN) / 2;
  const [ox, oz] = llToWorld(lat0, lon0);
  const sc = o.K / Math.cos((lat0 * Math.PI) / 180);
  const geo = estimateGeometry(chunk.structs);
  let budget = Math.max(64 * 64, Math.min(o.pageSize * o.pageSize, Math.floor((o.memoryLimit - geo.bytes) / 4.6)));
  let result = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    result = await assemble(chunk, { ...o, tileTexelBudget: budget }, { ox, oz, sc });
    if (result.memory <= o.memoryLimit || !result.textureTexels) break;
    // 実際のアトラス面積から、テクスチャ由来のメモリ（GPU 4B/画素＋JPEG）を残り枠に収める比率を求めて縮める
    const nonTex = result.memory - result.textureTexels * 4 - result.jpegBytes;
    const perTexel = 4 + result.jpegBytes / result.textureTexels;
    const target = Math.max(0, o.memoryLimit - nonTex) / perTexel;
    budget = Math.floor(budget * Math.min(0.9, (target / result.textureTexels) * 0.95));
    if (budget < 64 * 64) break;
  }
  return { ...result, bboxLL, origin: [lon0, lat0, 0], extentMeters: [(x1 - x0) / sc, (z1 - z0) / sc] };
}

async function assemble(chunk, o, { ox, oz, sc }) {
  // ---- テクスチャ計画: 画像ごとの使用UV範囲と画素密度 ----
  const imgs = new Map();
  for (const s of chunk.structs) for (const p of s.polys) {
    if (!p.tex) continue;
    let g = imgs.get(p.tex);
    if (!g) { g = { src: p.tex, u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity, area: 0, uvArea: 0 }; imgs.set(p.tex, g); }
    const uv = p.tri.uv;
    for (let i = 0; i < uv.length; i += 2) { const u = uv[i], v = uv[i + 1]; if (u < g.u0) g.u0 = u; if (u > g.u1) g.u1 = u; if (v < g.v0) g.v0 = v; if (v > g.v1) g.v1 = v; }
    g.area += p.tri.area; g.uvArea += p.tri.uvArea;
  }
  let atlas = null, density = null, srcDensity = null;
  if (imgs.size) {
    let total = 0, sumPx = 0, sumArea = 0;
    for (const g of imgs.values()) {
      const m = await imageMeta(g.src);
      g.W = m.width; g.H = m.height;
      const px = g.uvArea * g.W * g.H;
      g.density = g.area > 0 ? Math.sqrt(px / g.area) : o.texelDensity;
      sumPx += px; sumArea += g.area;
      g.scale = Math.min(1, o.texelDensity / Math.max(1e-6, g.density));
      g.cropPx = Math.max(1, (g.u1 - g.u0) * g.W) * Math.max(1, (g.v1 - g.v0) * g.H);
      total += g.cropPx * g.scale * g.scale;
    }
    srcDensity = sumArea > 0 ? Math.sqrt(sumPx / sumArea) : null;
    // 詰め込みの無駄（余白・棚）を見込んで 0.8 掛け
    const k = total > o.tileTexelBudget * 0.8 ? Math.sqrt((o.tileTexelBudget * 0.8) / total) : 1;
    for (const g of imgs.values()) g.scale *= k;
    density = Math.min(o.texelDensity, srcDensity || o.texelDensity) * k;
    atlas = await buildAtlas([...imgs.values()].map((g) => ({ key: g.src, src: g.src, uvBox: [g.u0, g.v0, g.u1, g.v1], scale: g.scale })), { pageSize: o.pageSize, quality: o.quality });
  }
  // ---- 頂点（レイヤー別メッシュ × マテリアル別プリミティブ） ----
  const layers = [...new Set(chunk.structs.map((s) => s.layer))].sort();
  const pageCount = atlas ? atlas.pages.length : 0;
  const materials = [];
  for (let i = 0; i < pageCount; i++) materials.push({ name: 'plateau-texture-atlas-' + i, image: i, extras: { photoTexture: true } });
  const colorMat = materials.push({ name: 'plateau-untextured', image: null, extras: { photoTexture: false } }) - 1;
  const meshes = [];
  for (const layer of layers) {
    const prims = new Map();
    const getP = (mat) => { let b = prims.get(mat); if (!b) { b = { material: mat, pos: [], nrm: [], uv: mat === colorMat ? null : [], col: mat === colorMat ? [] : null, idx: [] }; prims.set(mat, b); } return b; };
    for (const s of chunk.structs.filter((q) => q.layer === layer)) for (const p of s.polys) {
      const am = p.tex ? atlas.map.get(p.tex) : null;
      const b = getP(am ? am.page : colorMat);
      const base = b.pos.length / 3, t = p.tri;
      for (let i = 0; i < t.pos.length; i += 3) {
        b.pos.push((t.pos[i] - ox) / sc, t.pos[i + 1], (t.pos[i + 2] - oz) / sc);
        if (o.normals) b.nrm.push(t.normal[0], t.normal[1], t.normal[2]);
        if (am) { const [u, v] = mapUV(am, t.uv[(i / 3) * 2], t.uv[(i / 3) * 2 + 1]); b.uv.push(u, v); }
        else b.col.push(p.color[0], p.color[1], p.color[2], 255);
      }
      for (const ix of t.idx) b.idx.push(base + ix);
    }
    meshes.push({ name: layer, extras: { layer }, primitives: [...prims.values()].sort((a, b) => a.material - b.material).map((b) => ({
      positions: Float32Array.from(b.pos), normals: o.normals ? Float32Array.from(b.nrm) : null, uvs: b.uv ? Float32Array.from(b.uv) : null,
      colors: b.col ? Uint8Array.from(b.col) : null, indices: Uint32Array.from(b.idx), material: b.material })) });
  }
  const out = await writeGLB({ meshes, materials, images: atlas ? atlas.pages.map((p) => ({ data: p.jpeg, mime: 'image/jpeg' })) : [], extras: { generator: 'tools/tokyo-sora-data', coordinates: 'local-y-up', units: 'm', verticalDatum: 'T.P.' }, copyright: o.copyright }, { mode: o.mode, meshopt: o.mode === 'compact' });
  // ゲームと同じメモリ概算: ファイル + 頂点属性 + インデックス + テクスチャ(幅×高さ×4)
  let attr = 0, idx = 0;
  for (const m of meshes) for (const p of m.primitives) {
    const n = p.positions.length / 3;
    attr += n * (o.mode === 'compact' ? 8 : 12) + (p.normals ? n * (o.mode === 'compact' ? 4 : 12) : 0) + (p.uvs ? n * (o.mode === 'compact' ? 4 : 8) : 0) + (p.colors ? n * 4 : 0);
    idx += p.indices.length * (n > 65535 ? 4 : 2);
  }
  const textureTexels = atlas ? atlas.pages.reduce((a, p) => a + p.width * p.height, 0) : 0;
  const jpegBytes = atlas ? atlas.pages.reduce((a, p) => a + p.jpeg.length, 0) : 0;
  const memory = out.glb.length + attr + idx + textureTexels * 4;
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    glb: out.glb, memory, textureTexels, jpegBytes,
    stats: {
      structures: chunk.structs.length, lod2: chunk.structs.filter((s) => s.lod >= 2).length, textured: chunk.structs.filter((s) => s.textured).length,
      triangles: out.stats.triangles, vertices: out.stats.vertices, bytes: out.glb.length, memoryEstimate: memory,
      textures: atlas ? atlas.pages.map((p) => [p.width, p.height]) : [], texelDensity: density ? r2(density) : null, sourceTexelDensity: srcDensity ? r2(srcDensity) : null,
    },
  };
}
