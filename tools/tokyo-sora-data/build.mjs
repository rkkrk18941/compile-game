#!/usr/bin/env node
// 東京そらさんぽ: 公式オープンデータ → 実景モデル（tokyo-sora/INTEGRATION.md v1 の形式）
//
//   cd tools/tokyo-sora-data && npm ci
//   node build.mjs --list
//   node build.mjs --district tokyo-station          # PLATEAU配信サービスから最新年度を取得して変換（要ネット接続）
//   node build.mjs --district hamamatsucho-2020      # 公式GitHub同梱の実ファイル（SHA-256固定）から変換
//   node build.mjs --district my-area --bbox 139.762,35.678,139.772,35.686 --name "任意の範囲"
//   node build.mjs --district my-area --local /path/to/13101_chiyoda-ku_city_2023_citygml_1_op --mesh 53394611
//
// 出力（ゲーム本体の src/・index.html は変更しない）:
//   tokyo-sora/data/manifest.json              v1: {version:1, assets:[...]}（他地区の項目は残して置き換え）
//   tokyo-sora/data/models/<地区>/<z>-<x>-<y>.glb   自己完結・非圧縮GLB（画像を内包）
//   tokyo-sora/data/districts/<地区>.json       取得元URL・SHA-256・年度・座標系・置換IDの照合結果などの記録
//   tokyo-sora/data/districts/<地区>/terrain|vector  地形・道路・土地利用（v1では未接続の追加データ）
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseCityGML, indexAppearance } from './lib/citygml.mjs';
import { extractStructures, assignTiles, splitChunks, buildChunk, TILE_Z } from './lib/convert.mjs';
import { meshBounds, meshesInBBox, parsePlateauFileName, bboxIntersects } from './lib/mesh.mjs';
import { download, sha256 } from './lib/fetch.mjs';
import { listCityGMLFiles } from './lib/plateau-api.mjs';
import { collectPlateauMvtIds, replaceIdsFor, GAME_PLATEAU_MVT } from './lib/mvt-ids.mjs';
import { tinToWorld, tinTiles, rasterizeTile, encodeDemPng } from './lib/terrain.mjs';
import { polygonsToGeoJSON, parseCodelist } from './lib/vector.mjs';
import { openZip } from './lib/zip.mjs';
import { llToWorld, worldToLL, K } from './lib/geometry.mjs';
import { validateHandoff, validateDistrict } from './lib/manifest.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..');
const STRUCT = new Set(['bldg', 'brid', 'frn', 'tun', 'cons']);

const { values: A } = parseArgs({
  options: {
    district: { type: 'string' }, list: { type: 'boolean' }, bbox: { type: 'string' }, mesh: { type: 'string' }, name: { type: 'string' },
    local: { type: 'string' }, out: { type: 'string' }, types: { type: 'string' }, year: { type: 'string' },
    'max-lod': { type: 'string' }, 'min-lod': { type: 'string' }, 'texel-density': { type: 'string' }, 'page-size': { type: 'string' },
    'chunk-zoom': { type: 'string' }, 'memory-limit': { type: 'string' }, 'max-triangles': { type: 'string' },
    quality: { type: 'string' }, mode: { type: 'string' }, normals: { type: 'boolean' },
    unmatched: { type: 'string' }, 'replaces-mvt': { type: 'string' }, 'no-replaces': { type: 'boolean' },
    offline: { type: 'boolean' }, 'no-textures': { type: 'boolean' }, quiet: { type: 'boolean' }, help: { type: 'boolean' },
  },
});
const log = (...s) => { if (!A.quiet) console.log(...s); };

const registry = JSON.parse(fs.readFileSync(path.join(HERE, 'districts.json'), 'utf8'));
if (A.help || (!A.list && !A.district)) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 16).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(A.help ? 0 : 1);
}
if (A.list) { for (const d of registry.districts) console.log(`${d.id}\t${d.name}\t(${d.source.kind})`); process.exit(0); }

let def = registry.districts.find((d) => d.id === A.district);
if (!def) {
  if (!A.bbox && !A.mesh) throw new Error(`地区 ${A.district} は districts.json にありません。--bbox か --mesh を指定してください`);
  def = { id: A.district, name: A.name || A.district, source: { kind: 'plateau-api', types: ['bldg', 'brid', 'frn', 'tran', 'luse', 'dem'], year: 'latest' } };
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) throw new Error('地区IDは英小文字・数字・ハイフンのみ: ' + def.id);
if (A.local) def = { ...def, source: { kind: 'local', dir: A.local } };
if (A.mesh) def = { ...def, meshes: A.mesh.split(',') };
if (A.bbox) def = { ...def, bbox: A.bbox.split(',').map(Number) };
if (A.name) def = { ...def, name: A.name };

const opts = {
  maxLod: +(A['max-lod'] ?? 2),
  minLod: +(A['min-lod'] ?? 2),                         // LOD1だけの建物は既存の押し出しと同等なので既定では含めない
  texelDensity: +(A['texel-density'] ?? 6),            // px/m（約17cm/画素）。予算超過時は区画ごとに自動で下げる
  pageSize: +(A['page-size'] ?? 2048),
  chunkZoom: +(A['chunk-zoom'] ?? TILE_Z),
  memoryLimit: +(A['memory-limit'] ?? 10 * 1024 * 1024), // ゲームは最大6区画・合計64MiB → 1区画 約10MiB
  maxTriangles: +(A['max-triangles'] ?? 400000),
  quality: +(A.quality ?? 82),
  mode: A.mode === 'compact' ? 'compact' : 'plain',
  normals: !!A.normals,
  unmatched: A.unmatched === 'include' ? 'include' : 'exclude',
};
const types = new Set((A.types || def.source.types?.join(',') || 'bldg,brid,frn,tran,luse,dem').split(','));
const bbox = def.bbox || unionBBox((def.meshes || []).map(meshBounds));
if (!bbox) throw new Error('範囲（bbox / meshes）がありません');
const meshes = def.meshes || meshesInBBox(bbox, 8);
const dataRoot = path.resolve(A.out || path.join(REPO, 'tokyo-sora', 'data'));
const modelsDir = path.join(dataRoot, 'models', def.id);
const extraDir = path.join(dataRoot, 'districts', def.id);
log(`地区 ${def.id}「${def.name}」 範囲 ${bbox.map((v) => v.toFixed(5)).join(',')}  メッシュ ${meshes.join(',')}`);

// ---------------------------------------------------------------- 入力ファイルの解決
const inputs = [], datasets = [];
if (def.source.kind === 'plateau-api') {
  const r = await listCityGMLFiles(meshes, { types: [...types], year: A.year || def.source.year, log });
  if (!r.files.length) throw new Error('CityGML Files API に該当ファイルがありません: ' + r.query);
  for (const d of r.datasets) datasets.push({ ...d, title: `3D都市モデル（Project PLATEAU）${d.cityName}（${d.year}年度）`, retrievedVia: 'PLATEAU配信サービス CityGML Files API ' + r.query, landingPage: 'https://www.geospatial.jp/ckan/dataset/plateau' });
  for (const f of r.files) {
    const got = await download(f.url, { log, offline: A.offline });
    const pf = parsePlateauFileName(f.url);
    inputs.push({ type: f.type, file: got.file, url: f.url, sha256: got.sha256, bytes: got.bytes, mesh: f.mesh, variant: pf?.variant || null, dataset: datasets.find((d) => d.cityCode === f.cityCode), imageBase: f.url, images: true });
  }
} else if (def.source.kind === 'urls') {
  const ds = { ...def.source.dataset };
  datasets.push(ds);
  for (const f of def.source.files) {
    const got = await download(f.url, { expectSha256: f.sha256, log, offline: A.offline });
    const pf = parsePlateauFileName(f.url);
    inputs.push({ type: f.type, file: got.file, url: f.url, sha256: got.sha256, bytes: got.bytes, mesh: pf?.mesh || null, variant: pf?.variant || null, dataset: ds, imageBase: f.images === false ? null : f.url, images: f.images !== false });
  }
} else if (def.source.kind === 'local') {
  const dir = path.resolve(def.source.dir);
  const udx = fs.existsSync(path.join(dir, 'udx')) ? path.join(dir, 'udx') : dir;
  const ds = { title: `3D都市モデル（Project PLATEAU）${path.basename(dir)}`, retrievedVia: 'ダウンロード済みの配布データ ' + path.basename(dir), cityName: path.basename(dir) };
  const m = /^(\d{5})_([a-z0-9-]+?)_(?:city_|pref_)?(\d{4})_citygml/.exec(path.basename(dir));
  if (m) { ds.cityCode = m[1]; ds.year = +m[3]; }
  if (A.year && A.year !== 'latest') ds.year = +A.year;
  if (!Number.isInteger(ds.year)) throw new Error('整備年度が分かりません。配布フォルダ名（例: 13101_chiyoda-ku_city_2023_citygml_1_op）のまま指定するか --year を付けてください');
  datasets.push(ds);
  for (const t of types) {
    const td = path.join(udx, t);
    if (!fs.existsSync(td)) continue;
    for (const name of fs.readdirSync(td)) {
      if (!/\.gml(\.zst|\.gz)?$/i.test(name)) continue;
      const pf = parsePlateauFileName(name);
      if (!pf || !bboxIntersects(meshBounds(pf.mesh), bbox)) continue;
      const file = path.join(td, name), buf = fs.readFileSync(file);
      inputs.push({ type: t, file, url: 'file://' + file, sha256: sha256(buf), bytes: buf.length, mesh: pf.mesh, variant: pf.variant, dataset: ds, imageBase: 'file://' + file, images: true });
    }
  }
  const cl = path.join(dir, 'codelists');
  if (fs.existsSync(cl)) ds.codelistsDir = cl;
}
if (!inputs.length) throw new Error('入力ファイルがありません');
const label = (inp) => (inp.url.startsWith('file:') ? path.basename(inp.file) : inp.url.split('/').pop());

const codelists = new Map();
for (const ds of datasets) {
  try {
    if (ds.codelistsDir) for (const n of fs.readdirSync(ds.codelistsDir)) if (n.endsWith('.xml')) codelists.set(n, parseCodelist(fs.readFileSync(path.join(ds.codelistsDir, n), 'utf8')));
    const zu = (ds.metadataZipUrls || []).find((u) => /codelists/i.test(u));
    if (zu) {
      const got = await download(zu, { log, offline: A.offline });
      const z = openZip(got.file);
      for (const [n] of z.entries) if (/codelists\/[^/]+\.xml$/i.test(n)) codelists.set(n.split('/').pop(), parseCodelist(z.read(n).toString('utf8')));
      z.close();
    }
  } catch (e) { log('  コードリストを読めませんでした（コードのまま出力）: ' + e.message); }
}

// ---------------------------------------------------------------- 構造物
const structs = [], extractStats = [], seenIds = new Set(), missingImages = new Set();
let imageFiles = 0;
for (const inp of inputs.filter((i) => STRUCT.has(i.type))) {
  log(`解析 ${label(inp)} …`);
  const parsed = await parseCityGML(inp.file, { maxLod: opts.maxLod });
  const ap = indexAppearance(parsed.appearances);
  const imgMap = new Map();
  if (inp.images && inp.imageBase && !A['no-textures']) {
    const uris = [...new Set(ap.textures.map((t) => t.image))];
    await pool(uris, 8, async (u) => {
      const url = new URL(u.split('/').map(encodeURIComponent).join('/'), inp.imageBase).href;
      try { const got = await download(url, { offline: A.offline, accept404: true }); if (got) { imgMap.set(u, got.file); imageFiles++; } else missingImages.add(u); }
      catch { missingImages.add(u); }
    });
  }
  const { structures, stat } = extractStructures(parsed, ap, { resolveImage: (u) => imgMap.get(u) || null, maxLod: opts.maxLod, source: label(inp) });
  let kept = 0;
  for (const s of structures) {
    const [lat, lon] = worldToLL(s.cx, s.cz);
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    const key = s.id || s.buildingId ? s.layer + ':' + (s.id || s.buildingId) : null; // 区をまたぐ同一地物だけを重複とみなす
    if (key && seenIds.has(key)) continue;
    if (key) seenIds.add(key);
    structs.push(s); kept++;
  }
  extractStats.push({ file: label(inp), type: inp.type, theme: ap.theme, textures: ap.textures.length, features: stat.features, byLod: stat.byLod, texturedPolys: stat.texturedPolys, untexturedPolys: stat.untexturedPolys, skippedPolys: stat.skippedPolys, missingImages: stat.missingImages.length, inBBox: kept });
  log(`  ${stat.features}地物（LOD1:${stat.byLod[1]} LOD2:${stat.byLod[2]} LOD3:${stat.byLod[3]}）範囲内 ${kept}、テクスチャ面 ${stat.texturedPolys} / 無テクスチャ面 ${stat.untexturedPolys}`);
}

// ---------------------------------------------------------------- 置き換えID（ゲームの既存PLATEAU建物と同一と確認できたもの）
let mvt = null;
if (!A['no-replaces']) {
  const pad = 0.003;
  try { mvt = await collectPlateauMvtIds([bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad], { templates: A['replaces-mvt'] ? [A['replaces-mvt']] : undefined, offline: A.offline }); }
  catch (e) { log('  既存PLATEAU MVTを確認できませんでした（replacesは空）: ' + e.message); }
}
const decisions = { lowLod: 0, matched: 0, unmatchedExcluded: [], unmatchedIncluded: [], nonBuilding: 0 };
const selected = [];
for (const s of structs) {
  if (s.lod < opts.minLod) { decisions.lowLod++; continue; }
  if (s.layer !== 'bldg') { decisions.nonBuilding++; s.replaces = []; selected.push(s); continue; } // 橋梁等は既存描画と置き換えない
  const rings = s.buildingId && mvt ? mvt.ids.get(s.buildingId) : undefined;
  if (rings !== undefined) { s.replaces = replaceIdsFor(s.buildingId, rings); decisions.matched++; selected.push(s); continue; }
  s.replaces = [];
  if (opts.unmatched === 'include') { decisions.unmatchedIncluded.push(s.buildingId || s.id); selected.push(s); }
  else decisions.unmatchedExcluded.push(s.buildingId || s.id);
}
log(`選択: ${selected.length}地物（既存と同一ID ${decisions.matched}、LOD${opts.minLod}未満で除外 ${decisions.lowLod}、IDを確認できず${opts.unmatched === 'include' ? '追加' : '除外'} ${opts.unmatched === 'include' ? decisions.unmatchedIncluded.length : decisions.unmatchedExcluded.length}）`);

// ---------------------------------------------------------------- 区画（GLB）
fs.rmSync(modelsDir, { recursive: true, force: true });
fs.rmSync(extraDir, { recursive: true, force: true });
fs.mkdirSync(modelsDir, { recursive: true });
const chunks = splitChunks(assignTiles(selected, opts.chunkZoom), opts);
const attribution = datasets.map((d) => `「${d.title}」（国土交通省）を加工して作成`).join(' / ');
const assets = [], chunkRecords = [];
for (const c of chunks) {
  const r = await buildChunk(c, { ...opts, copyright: attribution, K });
  const name = `${c.z}-${c.x}-${c.y}.glb`;
  fs.writeFileSync(path.join(modelsDir, name), r.glb);
  const replaces = [...new Set(c.structs.flatMap((s) => s.replaces || []))].sort();
  const id = `${def.id}-${c.z}-${c.x}-${c.y}`;
  assets.push({
    id, format: 'glb', coordinates: 'local-y-up', url: `models/${def.id}/${name}`,
    origin: [r7(r.origin[0]), r7(r.origin[1]), 0],
    bbox: [floor7(r.bboxLL[0]), floor7(r.bboxLL[1]), ceil7(r.bboxLL[2]), ceil7(r.bboxLL[3])], // 丸めで内側に縮めない
    source: datasets.map((d) => d.title).join(' / '), year: Math.max(...datasets.map((d) => d.year || 0)) || null,
    license: 'CC BY 4.0互換（PLATEAUサイトポリシー https://www.mlit.go.jp/plateau/site-policy/ ）・国土交通省のデータを加工して作成',
    bytes: r.glb.length, replaces, district: def.id,
  });
  chunkRecords.push({ id, url: `models/${def.id}/${name}`, z: c.z, x: c.x, y: c.y, extentMeters: r.extentMeters.map((v) => Math.round(v)), replaces: replaces.length, ...r.stats });
  log(`区画 ${name}: ${r.stats.structures}地物 ${r.stats.triangles}三角形 ${(r.glb.length / 1e6).toFixed(2)}MB 推定メモリ ${(r.memory / 1048576).toFixed(1)}MiB${r.stats.textures.length ? ' テクスチャ ' + r.stats.textures.map((t) => t.join('x')).join('+') + ` (${r.stats.texelDensity}px/m)` : ''} 置換ID ${replaces.length}`);
}

// ---------------------------------------------------------------- 地形（PLATEAU dem TIN）・道路・土地利用（v1では未接続の追加データ）
const terrainTiles = [];
const demInputs = inputs.filter((i) => i.type === 'dem');
if (demInputs.length) {
  const all = [];
  for (const inp of demInputs) { const p = await parseCityGML(inp.file, { maxLod: 3, keepAttrs: false }); for (const f of p.features) for (const tr of f.tris) all.push(tr); }
  if (all.length) {
    const tw = tinToWorld(all);
    const [bx0, bz1] = llToWorld(bbox[1], bbox[0]), [bx1, bz0] = llToWorld(bbox[3], bbox[2]);
    fs.mkdirSync(path.join(extraDir, 'terrain'), { recursive: true });
    for (const [x, y] of tinTiles(tw, TILE_Z, [bx0, bz0, bx1, bz1])) {
      const { png, coverage } = await encodeDemPng(rasterizeTile(tw, TILE_Z, x, y, 256), 256);
      if (coverage === 0) continue;
      const url = `districts/${def.id}/terrain/${TILE_Z}-${x}-${y}.png`;
      fs.writeFileSync(path.join(dataRoot, url), png);
      terrainTiles.push({ z: TILE_Z, x, y, url, bytes: png.length, coverage: Math.round(coverage * 1000) / 1000 });
    }
    log(`地形: ${all.length}三角形 → ${terrainTiles.length}タイル`);
  }
}
const vector = {};
for (const [kind, type] of [['road', 'tran'], ['landuse', 'luse']]) {
  const ins = inputs.filter((i) => i.type === type);
  if (!ins.length) continue;
  const feats = [];
  for (const inp of ins) feats.push(...polygonsToGeoJSON((await parseCityGML(inp.file, { maxLod: 3 })).features, { kind, bbox, codelists, source: label(inp), fileVariant: inp.variant }));
  fs.mkdirSync(path.join(extraDir, 'vector'), { recursive: true });
  const url = `districts/${def.id}/vector/${kind === 'road' ? 'roads' : 'landuse'}.geojson`;
  fs.writeFileSync(path.join(dataRoot, url), JSON.stringify({ type: 'FeatureCollection', name: kind, features: feats }));
  vector[kind] = { url, features: feats.length, bytes: fs.statSync(path.join(dataRoot, url)).size };
  log(`${kind === 'road' ? '道路' : '土地利用'}: ${feats.length}面`);
}

// ---------------------------------------------------------------- 記録（districts/<地区>.json）
const unmatchedList = opts.unmatched === 'include' ? decisions.unmatchedIncluded : decisions.unmatchedExcluded;
const record = {
  schema: 'tokyo-sora/district-record@1',
  id: def.id, name: def.name, note: def.note || undefined,
  generated: {
    at: new Date().toISOString(), by: 'tools/tokyo-sora-data/build.mjs',
    command: `node tools/tokyo-sora-data/build.mjs --district ${def.id}` + (A.bbox ? ` --bbox ${A.bbox}` : '') + (A.mesh ? ` --mesh ${A.mesh}` : '') + (A.local ? ' --local <配布データのフォルダ>' : ''),
    options: { ...opts, types: [...types] },
  },
  bbox: bbox.map(r7), meshes,
  crs: {
    source: { horizontal: 'JGD2011 地理座標（EPSG:6697。2次元のファイルは EPSG:6668）', vertical: 'T.P.（東京湾平均海面からの標高, m）', axisOrder: '緯度, 経度, 標高' },
    glb: {
      coordinates: 'local-y-up', axes: 'X=東, Y=上, Z=南（原点からの実距離 m）', origin: 'manifest の origin = [経度, 緯度, 0]（区画の範囲の中心, 標高0m）',
      height: 'Y = T.P.標高（m）。origin の標高を0にしているので標高は二重に加わらない',
      transform: 'ゲーム世界座標（tokyo-sora/src/geo.js）の (X−原点)/s, (Z−原点)/s。s = K/cos(原点緯度) は real-models.js が掛ける倍率',
    },
  },
  sources: datasets.map((d) => ({
    title: d.title, publisher: '国土交通省 Project PLATEAU', year: d.year ?? null, registrationYear: d.registrationYear ?? null, spec: d.spec ?? null,
    landingPage: d.landingPage || null, distribution: d.distribution || null, retrievedVia: d.retrievedVia,
    files: inputs.filter((i) => i.dataset === d).map((i) => ({ type: i.type, mesh: i.mesh, url: i.url.startsWith('file:') ? null : i.url, file: i.url.startsWith('file:') ? path.basename(i.file) : undefined, sha256: i.sha256, bytes: i.bytes })),
    license: { name: 'PLATEAU サイトポリシー（政府標準利用規約準拠・CC BY 4.0互換）', url: 'https://www.mlit.go.jp/plateau/site-policy/', commercialUse: true, redistribution: true, attributionRequired: true },
    attribution: `「${d.title}」（国土交通省）を加工して作成`,
  })),
  replaces: {
    rule: 'ゲームが表示中の PLATEAU 2020年度 MVT に同じ建物IDが実在するものだけ（P+建物ID。複数ポリゴンの地物は #番号 付きも併記）。座標が近いだけでは置き換えない',
    checkedAgainst: mvt ? { gameUrl: GAME_PLATEAU_MVT, fetchedFrom: mvt.template, z: 16, tiles: mvt.tiles.length, ids: mvt.ids.size } : null,
    matched: decisions.matched, excludedBelowMinLod: decisions.lowLod, nonBuildingKept: decisions.nonBuilding,
    unmatched: { policy: opts.unmatched, count: unmatchedList.length, note: opts.unmatched === 'include' ? '既存表示と重なる可能性がある追加分（PRに明記）' : '既存表示と同一と確認できないため実景モデルに含めない', ids: unmatchedList.slice(0, 500) },
  },
  structures: {
    total: structs.length, included: selected.length, lod2: selected.filter((s) => s.lod >= 2).length,
    textured: selected.some((s) => s.textured), texturedCount: selected.filter((s) => s.textured).length, imageFiles, missingImages: missingImages.size,
    lodPolicy: `各地物で LOD${Math.min(3, opts.maxLod)} 以下の最大LODを採用。LOD${opts.minLod} 未満の地物は含めない`,
    textureNote: selected.some((s) => s.textured) ? 'PLATEAUのテクスチャ画像を区画単位のアトラスに再配置（切り出し・縮小のみ。生成・補完なし）' : 'テクスチャ画像なし（取得元に画像が含まれない）。無テクスチャ面は X3DMaterial の色、無ければ描画上の既定色',
    extract: extractStats,
  },
  budget: { perChunk: { memoryLimit: opts.memoryLimit, maxTriangles: opts.maxTriangles, maxBytes: 16 * 1024 * 1024, maxExtentMeters: 1500 }, game: '現在地から900m以内を近い順に最大6区画・同時2取得・合計64MiB（tokyo-sora/INTEGRATION.md）' },
  chunks: chunkRecords,
  extras: {
    note: 'INTEGRATION.md v1 ではまだ読み込まれない追加データ（統合側で必要なら接続）',
    terrain: terrainTiles.length ? { encoding: '地理院 dem_png 互換（x=2^16R+2^8G+B, h=0.01x, 無効値 2^23）', z: TILE_Z, tileSize: 256, tiles: terrainTiles, source: 'PLATEAU 地形モデル（dem, TIN）' } : null,
    roads: vector.road ? { ...vector.road, content: 'PLATEAU 道路モデル（tran）の面（道路区域の実形状）' } : null,
    landuse: vector.landuse ? { ...vector.landuse, content: 'PLATEAU 土地利用モデル（luse）の面' } : null,
  },
  knownLimitations: [
    'PLATEAUの整備年度時点の建物。その後の解体・新築・改修は反映されない',
    'LOD2が整備されていない建物は含めない（既存の押し出し表示のまま）',
    'テクスチャは航空写真等から作成されたもので、看板・窓の内側・店舗の入口位置は再現しない',
    '面の向きは元データのまま（裏返った面があると片面描画で見えないことがある）',
    '衝突判定は既存の地図輪郭のまま（INTEGRATION.md）。LOD2の形状と輪郭の差は統合側で確認が必要',
  ],
};
validateDistrict(record);
fs.mkdirSync(path.join(dataRoot, 'districts'), { recursive: true });
fs.writeFileSync(path.join(dataRoot, 'districts', def.id + '.json'), JSON.stringify(record, null, 1) + '\n');

// ---------------------------------------------------------------- manifest.json（v1）
const mf = path.join(dataRoot, 'manifest.json');
let manifest = { version: 1, assets: [] };
try { const old = JSON.parse(fs.readFileSync(mf, 'utf8')); if (old.version === 1 && Array.isArray(old.assets)) manifest = old; } catch { /* new */ }
manifest.assets = manifest.assets.filter((a) => a.district !== def.id).concat(assets).sort((a, b) => a.id.localeCompare(b.id));
validateHandoff(manifest, dataRoot);
fs.writeFileSync(mf, JSON.stringify(manifest, null, 1) + '\n');
const total = assets.reduce((a, x) => a + x.bytes, 0);
log(`完了: ${assets.length}区画 ${(total / 1e6).toFixed(2)}MB → ${path.relative(REPO, mf)}（記録: ${path.relative(REPO, path.join(dataRoot, 'districts', def.id + '.json'))}）`);

function unionBBox(bs) { if (!bs.length) return null; return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))]; }
function r7(v) { return Math.round(v * 1e7) / 1e7; }
function floor7(v) { return Math.floor(v * 1e7) / 1e7; }
function ceil7(v) { return Math.ceil(v * 1e7) / 1e7; }
async function pool(items, n, fn) { let i = 0; const run = async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }; await Promise.all(Array.from({ length: Math.min(n, items.length) }, run)); }
