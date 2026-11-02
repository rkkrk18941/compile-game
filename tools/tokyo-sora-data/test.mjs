#!/usr/bin/env node
// tools/tokyo-sora-data の検証。
//   node test.mjs          オフライン（合成データ）＋同梱サンプル（tokyo-sora/data/districts）の整合性
//   node test.mjs --live     さらに公式GitHub上の実ファイルから見本地区を作り直し、同梱物とバイト一致するか確認
//                            （PLATEAU配信サービスに接続できる環境なら CityGML Files API の応答形式も確認）
//   node test.mjs --browser  ゲーム本体の real-models.js で同梱の全区画を Chromium に読み込む（playwright が必要）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { validateBytes } from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
import { meshCode, meshBounds, meshesInBBox, parsePlateauFileName } from './lib/mesh.mjs';
import { parseCityGML, indexAppearance } from './lib/citygml.mjs';
import { triangulatePolygon, llToWorld, worldToLL, K } from './lib/geometry.mjs';
import { buildAtlas, mapUV } from './lib/atlas.mjs';
import { extractStructures, assignTiles, buildChunk } from './lib/convert.mjs';
import { writeGLB, readGLBJson } from './lib/glb.mjs';
import { tinToWorld, rasterizeTile, encodeDemPng, decodeDemRGB, tinTiles } from './lib/terrain.mjs';
import { polygonsToGeoJSON, parseCodelist } from './lib/vector.mjs';
import { listCityGMLFiles, normalizeCities } from './lib/plateau-api.mjs';
import { validateHandoff, validateDistrict } from './lib/manifest.mjs';
import { replaceIdsFor } from './lib/mvt-ids.mjs';
import { pathToFileURL } from 'node:url';
import { sha256 } from './lib/fetch.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..');
const LIVE = process.argv.includes('--live'), BROWSER = process.argv.includes('--browser');
let passed = 0, skipped = 0;
const SKIP = Symbol('skip');
const test = async (name, fn) => { try { if ((await fn()) === SKIP) { skipped++; console.log('skip', name); return; } passed++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name); console.error(e); process.exitCode = 1; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsd-'));

// ------------------------------------------------------------------ 合成CityGML（PLATEAUと同じ構造）
// 合成データの「m」はゲーム世界座標（geo.js: 球面Webメルカトルを東京駅の緯度で実寸化）に合わせる
const DEG = (2 * Math.PI * 6378137) / 360, K0 = Math.cos(35.681236 * Math.PI / 180);
const LAT0 = 35.6810, LON0 = 139.7660, M_LON = 1 / (DEG * K0), M_LAT = Math.cos(LAT0 * Math.PI / 180) / (DEG * K0);
const ll = (x, y, h) => `${(LAT0 + y * M_LAT).toFixed(10)} ${(LON0 + x * M_LON).toFixed(10)} ${h}`;
const ring = (pts, id) => `<gml:LinearRing${id ? ` gml:id="${id}"` : ''}><gml:posList>${[...pts, pts[0]].map((p) => ll(...p)).join(' ')}</gml:posList></gml:LinearRing>`;
const poly = (id, ext, holes = []) => `<gml:surfaceMember><gml:Polygon gml:id="${id}"><gml:exterior>${ring(ext, id + '_r0')}</gml:exterior>${holes.map((h, i) => `<gml:interior>${ring(h, id + '_r' + (i + 1))}</gml:interior>`).join('')}</gml:Polygon></gml:surfaceMember>`;
const ms = (lod, ...p) => `<bldg:${lod}><gml:MultiSurface>${p.join('')}</gml:MultiSurface></bldg:${lod}>`;
const W = 20, D = 10, H0 = 3, H1 = 23;
// 外側から見て反時計回り（CityGMLの規約）
const walls = {
  S: [[0, 0, H0], [W, 0, H0], [W, 0, H1], [0, 0, H1]], E: [[W, 0, H0], [W, D, H0], [W, D, H1], [W, 0, H1]],
  N: [[W, D, H0], [0, D, H0], [0, D, H1], [W, D, H1]], Wst: [[0, D, H0], [0, 0, H0], [0, 0, H1], [0, D, H1]],
};
const roof = [[0, 0, H1], [W, 0, H1], [W, D, H1], [0, D, H1]], hole = [[8, 3, H1], [8, 7, H1], [12, 7, H1], [12, 3, H1]];
const ground = [[0, 0, H0], [0, D, H0], [W, D, H0], [W, 0, H0]];
const uv4 = (u0, v0, u1, v1) => `${u0} ${v0} ${u1} ${v0} ${u1} ${v1} ${u0} ${v1} ${u0} ${v0}`;
const box = (x0, y0, w, d, h0, h1) => {
  const p = (x, y, h) => [x0 + x, y0 + y, h];
  return [[p(0, 0, h0), p(0, d, h0), p(w, d, h0), p(w, 0, h0)], [p(0, 0, h1), p(w, 0, h1), p(w, d, h1), p(0, d, h1)],
    [p(0, 0, h0), p(w, 0, h0), p(w, 0, h1), p(0, 0, h1)], [p(w, 0, h0), p(w, d, h0), p(w, d, h1), p(w, 0, h1)],
    [p(w, d, h0), p(0, d, h0), p(0, d, h1), p(w, d, h1)], [p(0, d, h0), p(0, 0, h0), p(0, 0, h1), p(0, d, h1)]];
};
const solid = (lod, faces) => `<bldg:${lod}><gml:Solid><gml:exterior><gml:CompositeSurface>${faces.map((f) => `<gml:surfaceMember><gml:Polygon><gml:exterior>${ring(f)}</gml:exterior></gml:Polygon></gml:surfaceMember>`).join('')}</gml:CompositeSurface></gml:exterior></gml:Solid></bldg:${lod}>`;
const GML = `<?xml version="1.0" encoding="UTF-8"?>
<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:app="http://www.opengis.net/citygml/appearance/2.0" xmlns:gen="http://www.opengis.net/citygml/generics/2.0" xmlns:uro="https://www.geospatial.jp/iur/uro/3.1" xmlns:xlink="http://www.w3.org/1999/xlink">
<gml:boundedBy><gml:Envelope srsName="http://www.opengis.net/def/crs/EPSG/0/6697" srsDimension="3"><gml:lowerCorner>${ll(-5, -5, 0)}</gml:lowerCorner><gml:upperCorner>${ll(80, 40, 30)}</gml:upperCorner></gml:Envelope></gml:boundedBy>
<core:cityObjectMember><bldg:Building gml:id="bldg_A">
 <gen:stringAttribute name="建物ID"><gen:value>13101-bldg-1</gen:value></gen:stringAttribute>
 <bldg:usage codeSpace="../../codelists/Building_usage.xml">401</bldg:usage>
 <bldg:measuredHeight uom="m">20.0</bldg:measuredHeight>
 ${ms('lod0RoofEdge', poly('A_l0', roof.map(([x, y]) => [x, y, H1])))}
 ${solid('lod1Solid', box(0, 0, W, D, H0, H1))}
 ${Object.entries(walls).map(([k, w]) => `<bldg:boundedBy><bldg:WallSurface gml:id="A_wall_${k}">${ms('lod2MultiSurface', poly('A_w' + k, w))}</bldg:WallSurface></bldg:boundedBy>`).join('\n ')}
 <bldg:boundedBy><bldg:RoofSurface gml:id="A_roof">${ms('lod2MultiSurface', poly('A_r', roof, [hole]))}</bldg:RoofSurface></bldg:boundedBy>
 <bldg:boundedBy><bldg:GroundSurface gml:id="A_ground">${ms('lod2MultiSurface', poly('A_g', ground))}</bldg:GroundSurface></bldg:boundedBy>
 <uro:buildingIDAttribute><uro:BuildingIDAttribute><uro:buildingID>13101-bldg-0001</uro:buildingID></uro:BuildingIDAttribute></uro:buildingIDAttribute>
</bldg:Building></core:cityObjectMember>
<core:cityObjectMember><bldg:Building gml:id="bldg_B">
 <bldg:measuredHeight uom="m">9.5</bldg:measuredHeight>
 ${solid('lod1Solid', box(40, 0, 12, 12, 3, 12.5))}
</bldg:Building></core:cityObjectMember>
<core:cityObjectMember><bldg:Building gml:id="bldg_C">
 <bldg:consistsOfBuildingPart><bldg:BuildingPart gml:id="bldg_C_part1">
  <bldg:boundedBy><bldg:RoofSurface gml:id="C_roof">${ms('lod2MultiSurface', poly('C_r', [[60, 0, 15], [70, 0, 15], [70, 10, 15], [60, 10, 15]]))}</bldg:RoofSurface></bldg:boundedBy>
 </bldg:BuildingPart></bldg:consistsOfBuildingPart>
</bldg:Building></core:cityObjectMember>
<app:appearanceMember><app:Appearance><app:theme>rgbTexture</app:theme>
 <app:surfaceDataMember><app:ParameterizedTexture><app:imageURI>tex_appearance/a.png</app:imageURI><app:mimeType>image/png</app:mimeType>
  ${['S', 'E', 'N', 'Wst'].map((k, i) => `<app:target uri="#A_w${k}"><app:TexCoordList><app:textureCoordinates ring="#A_w${k}_r0">${uv4(i % 2 ? 0.5 : 0, 0, i % 2 ? 1 : 0.5, 1)}</app:textureCoordinates></app:TexCoordList></app:target>`).join('')}
 </app:ParameterizedTexture></app:surfaceDataMember>
 <app:surfaceDataMember><app:ParameterizedTexture><app:imageURI>tex_appearance/b.png</app:imageURI>
  <app:target uri="#A_r"><app:TexCoordList><app:textureCoordinates ring="#A_r_r0">0 0 1 0 1 1 0 1 0 0</app:textureCoordinates><app:textureCoordinates ring="#A_r_r1">0.4 0.3 0.4 0.7 0.6 0.7 0.6 0.3 0.4 0.3</app:textureCoordinates></app:TexCoordList></app:target>
 </app:ParameterizedTexture></app:surfaceDataMember>
 <app:surfaceDataMember><app:X3DMaterial><app:diffuseColor>0.2 0.4 0.6</app:diffuseColor><app:target>#A_g</app:target></app:X3DMaterial></app:surfaceDataMember>
</app:Appearance></app:appearanceMember>
</core:CityModel>`;
const fx = path.join(tmp, 'udx', 'bldg');
fs.mkdirSync(path.join(fx, 'tex_appearance'), { recursive: true });
fs.writeFileSync(path.join(fx, '53394611_bldg_6697_op.gml'), GML);
// a.png: 左半分=赤, 右半分=青 / b.png: 緑
const solidPng = (w, h, fn) => { const b = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(fn(x, y), (y * w + x) * 3); return sharp(b, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(); };
fs.writeFileSync(path.join(fx, 'tex_appearance', 'a.png'), await solidPng(128, 64, (x) => (x < 64 ? [220, 30, 30] : [30, 30, 220])));
fs.writeFileSync(path.join(fx, 'tex_appearance', 'b.png'), await solidPng(64, 64, () => [30, 200, 30]));

// ------------------------------------------------------------------ tests
await test('地域メッシュ: 東京駅=53394611、範囲・1/2メッシュ・ファイル名', () => {
  assert.equal(meshCode(35.681236, 139.767125, 8), '53394611');
  const b = meshBounds('53394611');
  assert.ok(Math.abs(b[0] - 139.7625) < 1e-9 && Math.abs(b[1] - 35.675) < 1e-9 && Math.abs(b[3] - 35.683333333) < 1e-6);
  assert.equal(meshCode(35.68, 139.77, 9), '533946114');
  assert.deepEqual(meshesInBBox([139.7626, 35.6751, 139.7740, 35.6830], 8), ['53394611']);
  assert.deepEqual(parsePlateauFileName('53393680_bldg_6697_lod4.2_op.gml.zst'), { mesh: '53393680', type: 'bldg', crs: '6697', variant: 'lod4.2' });
  assert.equal(parsePlateauFileName('533946_dem_6697_op.gml').type, 'dem');
});

let parsed, ap;
await test('CityGML: 地物・LOD・境界面・リングID・属性・外観', async () => {
  parsed = await parseCityGML(path.join(fx, '53394611_bldg_6697_op.gml'));
  ap = indexAppearance(parsed.appearances);
  assert.equal(parsed.features.length, 3);
  const A = parsed.features[0];
  assert.equal(A.id, 'bldg_A');
  assert.equal(A.attrs.measuredHeight, '20.0');
  assert.equal(A.attrs.buildingID, '13101-bldg-0001');
  assert.equal(A.attrs['gen:建物ID'], '13101-bldg-1');
  assert.equal(A.attrs['usage@codeSpace'], '../../codelists/Building_usage.xml');
  const l2 = A.polys.filter((p) => p.lod === 2);
  assert.equal(l2.length, 6);
  assert.deepEqual(l2.map((p) => p.surface).sort(), ['GroundSurface', 'RoofSurface', 'WallSurface', 'WallSurface', 'WallSurface', 'WallSurface']);
  const r = l2.find((p) => p.surface === 'RoofSurface');
  assert.equal(r.rings.length, 2); assert.deepEqual(r.ringIds, ['A_r_r0', 'A_r_r1']);
  assert.equal(A.polys.filter((p) => p.prop === 'lod1Solid').length, 6);
  assert.equal(A.polys.filter((p) => p.prop === 'lod0RoofEdge').length, 1);
  assert.equal(parsed.features[2].polys[0].part, 'bldg_C_part1');
  assert.equal(ap.theme, 'rgbTexture');
  assert.equal(ap.textures.length, 2);
  assert.equal(ap.byPoly.get('A_r').rings.size, 2);
  assert.deepEqual(ap.colorByPoly.get('A_g').diffuse, [0.2, 0.4, 0.6]);
});

await test('三角形化: 穴あき屋根の面積・外向き法線・反時計回り', () => {
  const p = parsed.features[0].polys.find((q) => q.surface === 'RoofSurface');
  const t = triangulatePolygon(p.rings, [ap.byPoly.get('A_r').rings.get('A_r_r0'), ap.byPoly.get('A_r').rings.get('A_r_r1')]);
  assert.ok(Math.abs(t.area - (W * D - 16)) < 0.6, 'roof area ' + t.area);
  assert.ok(t.normal[1] > 0.999, 'roof normal up');
  assert.ok(Math.abs(t.uvArea - (1 - 0.08)) < 1e-6, 'uv area');
  const g = triangulatePolygon(parsed.features[0].polys.find((q) => q.surface === 'GroundSurface').rings);
  assert.ok(g.normal[1] < -0.999, 'ground faces down');
  const s = triangulatePolygon(parsed.features[0].polys.find((q) => q.id === 'A_wS').rings);
  assert.ok(s.normal[2] > 0.999, 'south wall faces +Z (south)');
  // 反時計回り（法線方向から見て）
  for (let i = 0; i < s.idx.length; i += 3) {
    const [a, b, c] = [s.idx[i], s.idx[i + 1], s.idx[i + 2]].map((k) => s.pos.slice(k * 3, k * 3 + 3));
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    assert.ok(n[0] * s.normal[0] + n[1] * s.normal[1] + n[2] * s.normal[2] > 0);
  }
  // geo.js と往復一致
  const [x, z] = llToWorld(35.6812, 139.7671); const [la, lo] = worldToLL(x, z);
  assert.ok(Math.abs(la - 35.6812) < 1e-9 && Math.abs(lo - 139.7671) < 1e-9);
});

await test('アトラス: 切り出し・余白・UV写像の色が元画像と一致', async () => {
  const a = path.join(fx, 'tex_appearance', 'a.png'), b = path.join(fx, 'tex_appearance', 'b.png');
  const at = await buildAtlas([{ key: 'a', src: a, uvBox: [0, 0, 1, 1], scale: 0.5 }, { key: 'b', src: b, uvBox: [0.25, 0.25, 0.75, 0.75], scale: 1 }], { pageSize: 256, padding: 2 });
  assert.equal(at.pages.length, 1);
  const { data, info } = await sharp(at.pages[0].jpeg).raw().toBuffer({ resolveWithObject: true });
  const px = (m, u, v) => { const [s, t] = mapUV(m, u, v); const X = Math.min(info.width - 1, Math.floor(s * info.width)), Y = Math.min(info.height - 1, Math.floor(t * info.height)); return [...data.subarray((Y * info.width + X) * 3, (Y * info.width + X) * 3 + 3)]; };
  const near = (c, e) => c.every((v, i) => Math.abs(v - e[i]) < 40);
  assert.ok(near(px(at.map.get('a'), 0.2, 0.5), [220, 30, 30]), 'left=red ' + px(at.map.get('a'), 0.2, 0.5));
  assert.ok(near(px(at.map.get('a'), 0.8, 0.5), [30, 30, 220]), 'right=blue');
  assert.ok(near(px(at.map.get('b'), 0.5, 0.5), [30, 200, 30]), 'green');
  // 切り出し範囲（0.25〜0.75）の端は画像内に収まる
  const m = at.map.get('b'); const [s0, t0] = mapUV(m, 0.25, 0.75), [s1, t1] = mapUV(m, 0.75, 0.25);
  assert.ok(s0 >= 0 && t0 >= 0 && s1 <= 1 && t1 <= 1 && s1 > s0 && t1 > t0);
});

let chunkOut, chunkStructs;
await test('区画GLB（v1）: 拡張なし・glTF-Validatorでエラー/警告なし・原点からの実距離m・ゲームの配置で元の位置に戻る', async () => {
  const resolveImage = (u) => path.join(fx, u);
  const { structures, stat } = extractStructures(parsed, ap, { resolveImage, maxLod: 2, source: 'fixture' });
  assert.equal(structures.length, 3);
  assert.deepEqual(structures.map((s) => s.lod), [2, 1, 2]);
  assert.equal(stat.texturedPolys, 5); // 壁4＋屋根
  chunkStructs = structures;
  const chunks = assignTiles(structures, 16);
  assert.equal(chunks.length, 1);
  const o = { texelDensity: 6, memoryLimit: 10 * 1024 * 1024, pageSize: 1024, quality: 85, mode: 'plain', normals: false, copyright: 'test', K };
  chunkOut = await buildChunk(chunks[0], o);
  const r = await validateBytes(new Uint8Array(chunkOut.glb));
  assert.equal(r.issues.numErrors, 0, JSON.stringify(r.issues.messages.slice(0, 5)));
  assert.equal(r.issues.numWarnings, 0, JSON.stringify(r.issues.messages.slice(0, 5)));
  const j = readGLBJson(chunkOut.glb);
  assert.ok(!j.extensionsUsed && !j.extensionsRequired, '拡張を使わない（ゲームに別デコーダーが無い）');
  assert.ok(!j.nodes[0].translation && !j.nodes[0].scale);
  assert.equal(j.images.length, 1); assert.ok(j.images[0].bufferView != null, '画像はGLB内に埋め込み');
  // 原点は bbox の中、標高0
  const [lon0, lat0, h0] = chunkOut.origin, b = chunkOut.bboxLL;
  assert.equal(h0, 0); assert.ok(lon0 > b[0] && lon0 < b[2] && lat0 > b[1] && lat0 < b[3]);
  // real-models.js と同じ配置（llToWorld(原点) + K/cos(緯度) 倍）で、元の世界座標に戻ること
  const [ox, oz] = llToWorld(lat0, lon0), s = K / Math.cos((lat0 * Math.PI) / 180);
  const acc = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
  const jl = chunkOut.glb.readUInt32LE(12), bin = chunkOut.glb.subarray(20 + jl + 8), bv = j.bufferViews[acc.bufferView];
  const p0 = [0, 1, 2].map((k) => bin.readFloatLE(bv.byteOffset + k * 4));
  const first = chunkStructs[0].polys[0].tri.pos;
  const world = [ox + s * p0[0], p0[1], oz + s * p0[2]];
  assert.ok(Math.hypot(world[0] - first[0], world[1] - first[1], world[2] - first[2]) < 1e-3, 'round trip ' + world + ' vs ' + Array.from(first.slice(0, 3)));
  // 実距離: 建物A（幅20m）の東西の広がり
  assert.ok(Math.abs(chunkOut.extentMeters[0] - 70) < 0.5, 'extent ' + chunkOut.extentMeters);
  // 高さは T.P. のまま（原点標高0なので二重加算しない）
  assert.ok(Math.abs(acc.max[1] - H1) < 1e-3 && Math.abs(acc.min[1] - H0) < 1e-3);
});

await test('区画GLB: メモリ上限を超える場合はテクスチャを縮めて収める', async () => {
  const chunks = assignTiles(chunkStructs, 16);
  const o = { texelDensity: 400, pageSize: 2048, quality: 85, mode: 'plain', normals: false, copyright: 't', K };
  const big = await buildChunk(chunks[0], { ...o, memoryLimit: 10 * 1024 * 1024 });
  const limit = Math.floor(big.memory * 0.6);
  const small = await buildChunk(chunks[0], { ...o, memoryLimit: limit });
  assert.ok(small.memory <= limit, `memory ${small.memory} > ${limit}`);
  assert.ok(small.textureTexels < big.textureTexels);
  assert.ok(small.stats.texelDensity < big.stats.texelDensity);
});

await test('compact モード: 量子化＋meshopt は展開後に非圧縮版と同じ内容', async () => {
  const resolveImage = (u) => path.join(fx, u);
  const { structures } = extractStructures(parsed, ap, { resolveImage, maxLod: 2, source: 'fixture' });
  const c = assignTiles(structures, 16)[0];
  const meshes = [{ name: 'bldg', primitives: [] }];
  const pos = [], col = [], idx = [];
  for (const s of structures) for (const p of s.polys) { const base = pos.length / 3; pos.push(...p.tri.pos.map((v, i) => v - (i % 3 === 0 ? c.bounds[0] : i % 3 === 2 ? c.bounds[1] : 0))); for (let i = 0; i < p.tri.pos.length / 3; i++) col.push(200, 200, 200, 255); for (const k of p.tri.idx) idx.push(base + k); }
  meshes[0].primitives.push({ positions: Float32Array.from(pos), normals: null, uvs: null, colors: Uint8Array.from(col), indices: Uint32Array.from(idx), material: 0 });
  const scene = { meshes, materials: [{ name: 'm' }], images: [] };
  const plain = await writeGLB(scene, { mode: 'compact', meshopt: false });
  const comp = await writeGLB(scene, { mode: 'compact', meshopt: true });
  for (const g of [plain.glb]) { const r = await validateBytes(new Uint8Array(g)); assert.equal(r.issues.numErrors, 0); }
  await MeshoptDecoder.ready;
  const jp = readGLBJson(plain.glb), jc = readGLBJson(comp.glb);
  const bin = (g) => { const jl = g.readUInt32LE(12); return g.subarray(20 + jl + 8); };
  const bp = bin(plain.glb), bc = bin(comp.glb);
  for (let i = 0; i < jp.bufferViews.length; i++) {
    const vp = jp.bufferViews[i], ex = jc.bufferViews[i].extensions?.EXT_meshopt_compression;
    const raw = bp.subarray(vp.byteOffset, vp.byteOffset + vp.byteLength);
    const out = new Uint8Array(ex.count * ex.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, ex.count, ex.byteStride, bc.subarray(ex.byteOffset, ex.byteOffset + ex.byteLength), ex.mode, ex.filter);
    if (ex.mode !== 'TRIANGLES') { assert.ok(Buffer.from(out).equals(raw), 'bufferView ' + i); continue; }
    // 三角形モードは頂点の巡回（向きは保つ）が変わり得るので正規化して比較
    const rd = (b, k) => (ex.byteStride === 2 ? b.readUInt16LE(k * 2) : b.readUInt32LE(k * 4));
    const canon = (b) => { const t = []; for (let k = 0; k < ex.count; k += 3) { const a = [rd(b, k), rd(b, k + 1), rd(b, k + 2)]; const m = a.indexOf(Math.min(...a)); t.push([a[m], a[(m + 1) % 3], a[(m + 2) % 3]].join(',')); } return t; };
    assert.deepEqual(canon(Buffer.from(out)), canon(raw), 'bufferView ' + i);
  }
  assert.deepEqual(jc.extensionsRequired, ['KHR_mesh_quantization', 'EXT_meshopt_compression']);
});

await test('置換ID: ゲームのID規則（P+建物ID、複数ポリゴンは #番号）', () => {
  assert.deepEqual(replaceIdsFor('13101-bldg-1', 1), ['P13101-bldg-1']);
  assert.deepEqual(replaceIdsFor('13101-bldg-1', 3), ['P13101-bldg-1', 'P13101-bldg-1#0', 'P13101-bldg-1#1', 'P13101-bldg-1#2']);
});

await test('地形: TIN → dem_png互換PNG → 復号で元の面と一致、範囲外は無効値', async () => {
  // 傾いた平面 h = 10 + 0.01*x(東m) - 0.02*y(北m) を2三角形で
  const P = (x, y) => [LAT0 + y * M_LAT, LON0 + x * M_LON, 10 + 0.01 * x - 0.02 * y];
  const tri = (a, b, c) => Float64Array.from([...a, ...b, ...c, ...a]);
  const tris = [tri(P(0, 0), P(300, 0), P(300, 300)), tri(P(0, 0), P(300, 300), P(0, 300))];
  const tw = tinToWorld(tris);
  const [[tx, ty]] = tinTiles(tw, 16).filter(([x, y]) => { const h = rasterizeTile(tw, 16, x, y, 64); return h.some(Number.isFinite); });
  const h = rasterizeTile(tw, 16, tx, ty, 256);
  const { png, coverage } = await encodeDemPng(h, 256);
  assert.ok(coverage > 0 && coverage < 1);
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let checked = 0, bad = 0, na = 0;
  for (let i = 0; i < 256 * 256; i += 97) {
    const d = decodeDemRGB(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    if (!Number.isFinite(h[i])) { if (Number.isFinite(d)) bad++; na++; continue; }
    if (Math.abs(d - h[i]) > 0.0051) bad++;
    checked++;
  }
  assert.equal(bad, 0); assert.ok(checked > 10 && na > 10);
  // 平面の式とも一致（ゲーム座標→緯度経度→局所m）
  let worst = 0;
  const [x0, z0, x1] = [tw[0], tw[2], 0];
  for (let i = 0; i < h.length; i += 211) if (Number.isFinite(h[i])) {
    const S = (await import('./lib/geometry.mjs')).tileBounds(16, tx, ty);
    const px = S[0] + ((i % 256) + 0.5) * (S[2] - S[0]) / 256, pz = S[1] + (Math.floor(i / 256) + 0.5) * (S[3] - S[1]) / 256;
    const [la, lo] = worldToLL(px, pz);
    const e = 10 + 0.01 * ((lo - LON0) / M_LON) - 0.02 * ((la - LAT0) / M_LAT);
    worst = Math.max(worst, Math.abs(e - h[i]));
  }
  assert.ok(worst < 0.05, 'plane error ' + worst);
  void x0; void z0; void x1;
});

await test('道路・土地利用: GeoJSON（経度,緯度・閉じたリング・コードとラベル）', async () => {
  const xml = `<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:tran="http://www.opengis.net/citygml/transportation/2.0" xmlns:luse="http://www.opengis.net/citygml/landuse/2.0" xmlns:gml="http://www.opengis.net/gml">
<core:cityObjectMember><tran:Road gml:id="road1"><tran:function codeSpace="../../codelists/Road_function.xml">1</tran:function><tran:lod1MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${[[0, 0, 0], [100, 0, 0], [100, 8, 0], [0, 8, 0], [0, 0, 0]].map((p) => ll(...p)).join(' ')}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></tran:lod1MultiSurface></tran:Road></core:cityObjectMember>
<core:cityObjectMember><luse:LandUse gml:id="lu1"><luse:class codeSpace="../../codelists/Common_landUseType.xml">214</luse:class><luse:lod1MultiSurface><gml:MultiSurface><gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${[[0, 20, 0], [50, 20, 0], [50, 60, 0], [0, 60, 0], [0, 20, 0]].map((p) => ll(...p)).join(' ')}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember></gml:MultiSurface></luse:lod1MultiSurface></luse:LandUse></core:cityObjectMember>
</core:CityModel>`;
  const p = await parseCityGML(Buffer.from(xml));
  const cl = new Map([['Road_function.xml', parseCodelist('<gml:Dictionary><gml:dictionaryEntry><gml:Definition gml:id="i1"><gml:description>一般国道</gml:description><gml:name>1</gml:name></gml:Definition></gml:dictionaryEntry></gml:Dictionary>')]]);
  const roads = polygonsToGeoJSON(p.features, { kind: 'road', codelists: cl, source: 'fixture' });
  const lu = polygonsToGeoJSON(p.features, { kind: 'landuse', source: 'fixture', fileVariant: 'park' });
  assert.equal(roads.length, 1); assert.equal(lu.length, 1);
  assert.equal(roads[0].properties.function, '1'); assert.equal(roads[0].properties.functionLabel, '一般国道'); assert.equal(roads[0].properties.functionCodeList, 'Road_function.xml');
  const c = roads[0].geometry.coordinates[0];
  assert.ok(Math.abs(c[0][0] - LON0) < 1e-6 && Math.abs(c[0][1] - LAT0) < 1e-6, '[lon,lat]');
  assert.deepEqual(c[0], c[c.length - 1]);
  assert.equal(lu[0].properties.park, true);
  // bbox で除外
  assert.equal(polygonsToGeoJSON(p.features, { kind: 'road', bbox: [140, 36, 141, 37], source: 'x' }).length, 0);
});

await test('CityGML Files API: 応答形式の差を吸収し、最新年度・種別・メッシュで絞る', async () => {
  const city = (code, year, files) => ({ cityCode: code, cityName: 'x', year, registrationYear: year, spec: '5.0', url: 'u', metadataZipUrls: [], featureTypes: {}, files });
  const res = { cities: [
    city('13101', 2025, { bldg: [{ code: '53394611', maxLod: 2, url: 'https://a/13101_2025/udx/bldg/53394611_bldg_6697_op.gml' }], dem: [{ code: '533946', maxLod: 1, url: 'https://a/13101_2025/udx/dem/533946_dem_6697_op.gml' }], veg: [{ code: '53394611', maxLod: 1, url: 'v' }] }),
    city('13101', 2023, { bldg: [{ code: '53394611', maxLod: 2, url: 'https://a/13101_2023/old.gml' }] }),
    city('13102', 2025, { bldg: [{ code: '53394611', maxLod: 2, url: 'https://a/13102/udx/bldg/53394611_bldg_6697_op.gml' }, { code: '53394612', maxLod: 2, url: 'other' }] }),
  ] };
  assert.equal(normalizeCities(res).length, 3);
  assert.equal(normalizeCities(res.cities).length, 3);
  assert.equal(normalizeCities(res.cities[0]).length, 1);
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => { assert.ok(String(u).startsWith('https://api.plateauview.mlit.go.jp/datacatalog/citygml/m:53394611')); return new Response(JSON.stringify(res)); };
  try {
    const r = await listCityGMLFiles(['53394611'], { types: ['bldg', 'dem'] });
    assert.deepEqual(r.files.map((f) => f.url).sort(), ['https://a/13101_2025/udx/bldg/53394611_bldg_6697_op.gml', 'https://a/13101_2025/udx/dem/533946_dem_6697_op.gml', 'https://a/13102/udx/bldg/53394611_bldg_6697_op.gml']);
    assert.ok(r.files.every((f) => f.year === 2025));
  } finally { globalThis.fetch = orig; fs.rmSync(path.join(HERE, '.cache', 'api.plateauview.mlit.go.jp'), { recursive: true, force: true }); }
});

await test('build.mjs: --local で地区を作り、v1 manifest・GLB・記録が検査を通る', async () => {
  const out = path.join(tmp, 'out');
  // 合成データのIDはゲームのMVTに無いので、置換IDの照合を省いて未確認分も含める
  execFileSync(process.execPath, [path.join(HERE, 'build.mjs'), '--district', 'fixture-area', '--local', tmp, '--year', '2025', '--mesh', '53394611', '--types', 'bldg', '--out', out, '--quiet', '--no-replaces', '--unmatched', 'include', '--texel-density', '8'], { stdio: 'inherit' });
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  validateHandoff(m, out);
  assert.equal(m.assets.length, 1);
  assert.deepEqual(m.assets[0].replaces, [], '照合していないので置き換えない');
  assert.equal(m.assets[0].year, 2025);
  const rec = JSON.parse(fs.readFileSync(path.join(out, 'districts', 'fixture-area.json'), 'utf8'));
  validateDistrict(rec);
  assert.equal(rec.structures.included, 2, 'LOD1だけの建物Bは既定で含めない');
  assert.equal(rec.replaces.unmatched.count, 2);
  assert.ok(!JSON.stringify(m).includes(tmp) && !JSON.stringify(rec).includes(tmp), '出力にローカルの絶対パスを含めない');
  const r = await validateBytes(new Uint8Array(fs.readFileSync(path.join(out, m.assets[0].url))));
  assert.equal(r.issues.numErrors, 0);
  // 既定（未確認IDは除外）なら区画が空になり、manifest からも消える
  execFileSync(process.execPath, [path.join(HERE, 'build.mjs'), '--district', 'fixture-area', '--local', tmp, '--year', '2025', '--mesh', '53394611', '--types', 'bldg', '--out', out, '--quiet', '--no-replaces'], { stdio: 'inherit' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).assets.length, 0);
});

const clientModule = async (rel) => {
  // ゲーム本体のモジュールを、ルートの esbuild（npm ci 済みなら）で束ねて読み込む
  let build;
  try { ({ build } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'esbuild', 'lib', 'main.js')).href)); } catch { return null; }
  const r = await build({ entryPoints: [path.join(REPO, rel)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const f = path.join(tmp, 'client-' + path.basename(rel) + '.mjs');
  fs.writeFileSync(f, r.outputFiles[0].text);
  return import(pathToFileURL(f).href);
};

await test('同梱データ: v1 manifest・ファイル・記録の整合、ゲームの normalizeManifest がすべて受理', async () => {
  const root = path.join(REPO, 'tokyo-sora', 'data');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  validateHandoff(m, root);
  assert.ok(m.assets.length >= 1);
  const districts = new Set(m.assets.map((a) => a.district));
  for (const d of districts) {
    const rec = JSON.parse(fs.readFileSync(path.join(root, 'districts', d + '.json'), 'utf8'));
    validateDistrict(rec);
    for (const s of rec.sources) for (const f of s.files) assert.ok(f.url, '取得元URLを記録');
    const ids = new Set(m.assets.filter((a) => a.district === d).map((a) => a.id));
    assert.deepEqual(new Set(rec.chunks.map((c) => c.id)), ids);
    for (const c of rec.chunks) { assert.ok(c.triangles <= 400000 && c.memoryEstimate <= rec.budget.perChunk.memoryLimit && c.bytes <= 16 * 1024 * 1024); assert.ok(c.extentMeters.every((v) => v <= 1500)); }
  }
  for (const a of m.assets) {
    const g = fs.readFileSync(path.join(root, a.url));
    const j = readGLBJson(g);
    assert.ok(!j.extensionsRequired, a.id + ' は拡張なし');
    // GLBの中身が bbox に収まる（real-models.js は ±20m を超えると捨てる）
    const [ox, oz] = llToWorld(a.origin[1], a.origin[0]), s = K / Math.cos((a.origin[1] * Math.PI) / 180);
    const [x0, z1] = llToWorld(a.bbox[1], a.bbox[0]), [x1, z0] = llToWorld(a.bbox[3], a.bbox[2]);
    for (const mesh of j.meshes) for (const p of mesh.primitives) {
      const acc = j.accessors[p.attributes.POSITION];
      assert.ok(ox + s * acc.min[0] >= x0 - 20 && ox + s * acc.max[0] <= x1 + 20 && oz + s * acc.min[2] >= z0 - 20 && oz + s * acc.max[2] <= z1 + 20, a.id + ' bbox');
      assert.ok(acc.min[1] > -100 && acc.max[1] < 4000);
    }
  }
  const client = await clientModule('tokyo-sora/src/integration.js');
  if (!client) { console.log('     （ルートで npm ci していないため normalizeManifest の確認を省略）'); return; }
  const accepted = client.normalizeManifest(m, 'https://example.test/tokyo-sora/data/manifest.json');
  assert.equal(accepted.length, m.assets.length, 'ゲームが捨てる項目が無い');
});

if (BROWSER) {
  await test('ブラウザ: ゲームの RealModels で全区画を読み込み・配置検査に通り、既存建物の置換IDが反映される', async () => {
    let chromium;
    try { ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright')); } catch { console.log('     （playwright が無いため省略）'); return SKIP; }
    const http = await import('node:http');
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
    const server = http.createServer((req, res) => { const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'content-length': fs.statSync(f).size }); fs.createReadStream(f).pipe(res); });
    await new Promise((r) => server.listen(0, r));
    const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
      const page = await b.newPage({ viewport: { width: 800, height: 600 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://localhost:${server.address().port}/tools/tokyo-sora-data/preview.html`);
      await page.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
      const res = await page.evaluate(() => window.__result);
      assert.deepEqual(errors, []);
      assert.equal(res.failed.length, 0); assert.equal(res.loaded, res.assets); assert.ok(res.replaced > 0);
      console.log('     ', JSON.stringify(res));
    } finally { await b.close(); server.close(); }
  });
}

if (LIVE) {
  await test('LIVE: 公式GitHub上の実ファイルとゲームのMVTから見本地区を再生成し、同梱のGLBとmanifestが一致', async () => {
    const out = path.join(tmp, 'live');
    execFileSync(process.execPath, [path.join(HERE, 'build.mjs'), '--district', 'hamamatsucho-2020', '--out', out, '--quiet'], { stdio: 'inherit' });
    const root = path.join(REPO, 'tokyo-sora', 'data');
    const ra = JSON.parse(fs.readFileSync(path.join(out, 'districts', 'hamamatsucho-2020.json'), 'utf8'));
    const rb = JSON.parse(fs.readFileSync(path.join(root, 'districts', 'hamamatsucho-2020.json'), 'utf8'));
    assert.equal(ra.sources[0].files[0].sha256, rb.sources[0].files[0].sha256);
    const ma = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).assets;
    const mb = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).assets.filter((a) => a.district === 'hamamatsucho-2020');
    assert.deepEqual(ma, mb, 'manifest の項目（置換IDを含む）が一致');
    for (const a of mb) assert.equal(sha256(fs.readFileSync(path.join(out, a.url))), sha256(fs.readFileSync(path.join(root, a.url))), a.url);
  });
  await test('LIVE: PLATEAU配信サービス CityGML Files API（東京駅 53394611）', async () => {
    let r;
    try { r = await listCityGMLFiles(['53394611'], { types: ['bldg', 'dem', 'tran', 'luse'] }); }
    catch (e) { console.log('     （PLATEAU配信サービスに接続できないため省略: ' + e.message + '）'); return SKIP; }
    assert.ok(r.files.some((f) => f.type === 'bldg' && /53394611_bldg/.test(f.url)));
    assert.ok(r.datasets.every((d) => d.year >= 2020));
    console.log('     ', r.datasets.map((d) => `${d.cityName} ${d.year}年度 spec ${d.spec}`).join(' / '));
  });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed${skipped ? `, ${skipped} skipped` : ''}${process.exitCode ? ', FAILED' : ''}`);
