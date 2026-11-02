// 出力の検査。
//  validateHandoff: tokyo-sora/data/manifest.json（tokyo-sora/INTEGRATION.md v1）。
//    ゲーム側の normalizeManifest（tokyo-sora/src/integration.js）が捨てる項目を、ここで先にエラーにする。
//  validateDistrict: tokyo-sora/data/districts/<地区>.json（取得元・年度・座標系などの記録）。
import fs from 'node:fs';
import path from 'node:path';
import { llToWorld } from './geometry.mjs';

function fail(msg) { throw new Error(msg); }
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export const LIMITS = { maxBytes: 16 * 1024 * 1024, maxTriangles: 400000, maxExtent: 1500, lon: [122, 154], lat: [20, 46] };

export function validateHandoff(m, dataRoot = null) {
  if (m?.version !== 1 || !Array.isArray(m.assets)) fail('manifest: version 1 / assets[]');
  const ids = new Set();
  for (const a of m.assets) {
    const at = `manifest.assets[${a.id}]`;
    if (typeof a.id !== 'string' || !a.id || ids.has(a.id)) fail(at + ': id が空か重複'); ids.add(a.id);
    if (a.format !== 'glb' || a.coordinates !== 'local-y-up') fail(at + ': format=glb, coordinates=local-y-up');
    if (typeof a.url !== 'string' || /^[a-z]+:/i.test(a.url) && !/^https?:/i.test(a.url)) fail(at + ': url');
    const b = a.bbox, o = a.origin;
    if (!Array.isArray(b) || b.length !== 4 || !b.every(fin) || b[0] >= b[2] || b[1] >= b[3] || b[0] < LIMITS.lon[0] || b[2] > LIMITS.lon[1] || b[1] < LIMITS.lat[0] || b[3] > LIMITS.lat[1]) fail(at + ': bbox [西,南,東,北]');
    if (!Array.isArray(o) || o.length !== 3 || !o.every(fin) || o[0] < b[0] || o[0] > b[2] || o[1] < b[1] || o[1] > b[3]) fail(at + ': origin [経度,緯度,標高] が bbox 内');
    if (typeof a.source !== 'string' || !a.source.trim() || typeof a.license !== 'string' || !a.license.trim()) fail(at + ': source / license');
    if (!Number.isInteger(a.year) || a.year < 1990 || a.year > 2100) fail(at + ': year');
    if (!fin(a.bytes) || a.bytes <= 0 || a.bytes > LIMITS.maxBytes) fail(at + ': bytes（16MiB以下）');
    const [x0, z1] = llToWorld(b[1], b[0]), [x1, z0] = llToWorld(b[3], b[2]);
    if (x1 - x0 > LIMITS.maxExtent || z1 - z0 > LIMITS.maxExtent) fail(at + ': 地上範囲が1500mを超える');
    if (!Array.isArray(a.replaces) || !a.replaces.every((v) => typeof v === 'string' && /^[PO]\S+$/.test(v))) fail(at + ': replaces は P/O で始まるID');
    if (dataRoot && !/^https?:/i.test(a.url)) {
      const f = path.join(dataRoot, a.url);
      if (!fs.existsSync(f)) fail(at + ': ファイルが無い ' + a.url);
      if (fs.statSync(f).size !== a.bytes) fail(at + ': bytes とファイルサイズが違う');
    }
  }
  return true;
}

export function validateDistrict(r) {
  if (r.schema !== 'tokyo-sora/district-record@1') fail('district: schema');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(r.id || '') || !r.name) fail('district: id / name');
  if (!r.crs?.source?.vertical || !r.crs?.glb?.height) fail('district: crs（変換元の座標参照系・標高基準）');
  if (!Array.isArray(r.sources) || !r.sources.length) fail('district: sources');
  for (const s of r.sources) {
    if (!s.title || !s.publisher || !s.attribution || !s.license?.url) fail('district: sources[] の title/publisher/attribution/license');
    if (!('year' in s)) fail('district: sources[].year');
    if (!s.files?.length || !s.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256 || ''))) fail('district: sources[].files[].sha256');
  }
  if (!r.replaces?.rule || !Array.isArray(r.chunks)) fail('district: replaces / chunks');
  return true;
}
