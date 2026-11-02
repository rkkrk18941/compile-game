// プロシージャルPBRテクスチャ：Canvasで生成する albedo（map）と height（bumpMap）。
//
// 設計方針
// - albedo は「乗算しても壊れない」明るいグレースケール寄り（概ね 175〜250）。
//   巨獣は頂点カラー、建物・地形はシェーダ手続き色と乗算される前提なので、
//   色そのものは持たせず、質感の濃淡だけを載せる。
// - 全パターンはタイリング可能（格子・セルを周期で折り返す）にして
//   RepeatWrapping の継ぎ目を出さない。
// - 生成は遅延＋キャッシュ（同じ kind は一度だけ）。256px 既定で、
//   1枚あたりの生成は数十ms級に抑える。
// - DOM が無い環境（Node の回帰テスト）では document を触らず null を返し、
//   呼び出し側が「テクスチャ無し＝従来表示」にフォールバックできるようにする。
import * as THREE from 'three';
import { hash2, clamp, lerp } from './noise.js';

/* ---------- タイリング可能なノイズ ---------- */
const wrap = (i, p) => ((i % p) + p) % p;
// 周期 px,py で折り返す値ノイズ
function tnoise(x, y, px, py) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash2(wrap(a, px), wrap(b, py));
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function tfbm(x, y, px, py, oct = 4) {
  let s = 0, a = 0.5, n = 0, fx = 1, fy = 1;
  for (let i = 0; i < oct; i++) {
    s += a * (tnoise(x * fx + i * 13.7, y * fy - i * 7.9, Math.max(1, Math.round(px * fx)), Math.max(1, Math.round(py * fy))) * 2 - 1);
    n += a; a *= 0.5; fx *= 2.03; fy *= 2.03;
  }
  return s / n; // -1..1
}
// 周期 p のセルノイズ： [最寄り距離, 2番目との差, セルID]
function tcell(x, y, p) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 8, d2 = 8, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy;
    const wx = wrap(cx, p), wy = wrap(cy, p);
    const px = cx + hash2(wx, wy), py = cy + hash2(wx + 57, wy + 131);
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash2(wx + 201, wy + 77); }
    else if (d < d2) d2 = d;
  }
  return [Math.sqrt(d1), Math.sqrt(d2), id];
}
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- Canvas 生成 ---------- */
function makeCanvas(size) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try {
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return null;
    c.width = size; c.height = size;
    return c;
  } catch (e) { return null; }
}
function toTexture(data, size, srgb, aniso) {
  const c = makeCanvas(size);
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx || !ctx.createImageData) return null;
  const img = ctx.createImageData(size, size);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = clamp(aniso || 4, 1, 16);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
// fn(u, v) -> [r, g, b, height]（各 0..255 相当、height は 0..1）で両マップを一括生成
function paint(size, fn) {
  const mapData = new Uint8ClampedArray(size * size * 4);
  const bumpData = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const [r, g, b, h] = fn(u, v);
      const i = (y * size + x) * 4;
      mapData[i] = r; mapData[i + 1] = g; mapData[i + 2] = b; mapData[i + 3] = 255;
      const hv = clamp(h, 0, 1) * 255;
      bumpData[i] = hv; bumpData[i + 1] = hv; bumpData[i + 2] = hv; bumpData[i + 3] = 255;
    }
  }
  return { mapData, bumpData };
}
function buildPair(size, aniso, bump, fn) {
  if (!makeCanvas(size)) return null;
  const { mapData, bumpData } = paint(size, fn);
  const map = toTexture(mapData, size, true, aniso);
  if (!map) return null;
  return { map, bump: bump ? toTexture(bumpData, size, false, aniso) : null };
}

/* ---------- 巨獣の皮膚 ---------- */
// kind: 0鱗 1甲殻 2いぼ/蛙皮 3毛皮 4ぬめり 5骨 6岩 7羽毛（beast3d の aSkin と同じ番号）
//       文字列でも可: 'scale'|'carapace'|'wart'|'fur'|'slime'|'bone'|'rock'|'feather'
const SKIN_NAMES = { scale: 0, carapace: 1, wart: 2, skin: 2, fur: 3, slime: 4, bone: 5, rock: 6, feather: 7 };
function skinPixel(kind) {
  return (u, v) => {
    const X = u * 8, Y = v * 8;
    const mot = tfbm(X * 1.5, Y * 1.5, 12, 12, 3) * 14; // 大きな濃淡
    let g, h, tint = 0;
    if (kind === 0) {          // 鱗：セル状の板、縁が沈む
      const [d1, d2, id] = tcell(u * 12, v * 12, 12);
      const s = Math.sqrt(clamp((d2 - d1) * 2.4, 0, 1));
      h = 0.30 + 0.70 * s * (0.75 + 0.25 * id);
      g = 196 + s * 42 + id * 16 + mot - (1 - s) * 46;
      tint = 5;
    } else if (kind === 1) {   // 甲殻：大きなドームと深い継ぎ目
      const [d1, d2, id] = tcell(u * 7, v * 7, 7);
      const dome = Math.pow(clamp(1 - d1, 0, 1), 1.4);
      const seam = sstep(0.0, 0.16, d2 - d1);
      h = 0.22 + 0.78 * dome * seam + 0.12 * dome;
      g = 188 + dome * 44 + id * 20 + mot - (1 - seam) * 58;
      tint = 3;
    } else if (kind === 2) {   // いぼ・蛙皮
      const n = tfbm(X, Y, 8, 8, 4);
      const bumpN = Math.max(0, tnoise(X * 3, Y * 3, 24, 24) - 0.60) * 2.2;
      h = 0.52 + n * 0.22 + bumpN * 0.30;
      g = 214 + n * 20 + bumpN * 22 + mot;
      tint = 6;
    } else if (kind === 3) {   // 毛皮：流れ方向の筋
      const streak = tnoise(X * 2, Y * 18, 16, 144);
      const streak2 = tnoise(X * 5 + 40, Y * 34, 40, 272);
      h = 0.34 + streak * 0.42 + streak2 * 0.24;
      g = 182 + streak * 52 + streak2 * 26 + mot;
      tint = 8;
    } else if (kind === 4) {   // ぬめり：滑らかで微かな斑
      const n = tfbm(X * 0.9, Y * 0.9, 7, 7, 3);
      h = 0.60 + n * 0.14 + Math.max(0, tnoise(X * 2.4, Y * 2.4, 19, 19) - 0.55) * 0.18;
      g = 226 + n * 16 + mot * 0.7;
      tint = -7; // b 寄り
    } else if (kind === 5) {   // 骨：淡く、ひびと孔
      const base = tfbm(X * 1.6, Y * 1.6, 13, 13, 3);
      const r = 1 - Math.abs(tnoise(X * 1.3 + 31, Y * 1.3, 10, 10) * 2 - 1);
      const crack = sstep(0.93, 0.995, r);
      const pore = Math.max(0, tnoise(X * 9, Y * 9, 72, 72) - 0.72) * 2.4;
      h = 0.58 + base * 0.16 - crack * 0.38 - pore * 0.22;
      g = 234 + base * 10 - crack * 74 - pore * 30 + mot * 0.6;
      tint = 9;
    } else if (kind === 6) {   // 岩：角ばった塊と亀裂
      const [d1, d2, id] = tcell(u * 9, v * 9, 9);
      const seam = sstep(0.0, 0.10, d2 - d1);
      const n = tfbm(X * 2.2, Y * 2.2, 18, 18, 4);
      h = 0.30 + (0.35 + id * 0.4 + n * 0.25) * seam;
      g = 186 + id * 34 + n * 18 - (1 - seam) * 72 + mot;
      tint = 2;
    } else {                   // 羽毛：斜めの羽軸と細かい毛羽
      const shaft = Math.abs(((u * 5 + 0.5) % 1) - 0.5);
      const vane = tnoise((X + Y) * 2.2, (X - Y) * 7, 35, 112);
      const barb = 0.5 + 0.5 * Math.sin((X * 0.9 + Y) * 34 + tfbm(X, Y, 8, 8, 2) * 5);
      h = 0.40 + vane * 0.34 + barb * 0.18 - sstep(0.10, 0.02, shaft) * 0.25;
      g = 196 + vane * 38 + barb * 16 - sstep(0.08, 0.01, shaft) * 40 + mot;
      tint = -3;
    }
    g = clamp(g, 165, 252);
    const r = clamp(g + tint, 165, 252), b = clamp(g - tint, 165, 252);
    return [r, g, b, clamp(h, 0.02, 1)];
  };
}

/* ---------- 建物・地形の表面 ---------- */
function surfacePixel(kind) {
  return (u, v) => {
    const X = u * 8, Y = v * 8;
    let g, h, tr = 0, tb = 0;
    if (kind === 'stone') {        // 切石：段と目地
      const row = Math.floor(v * 6), rf = (v * 6) % 1;
      const off = (row % 2) * 0.5;
      const colF = u * 4 + off, cf = colF % 1;
      const id = hash2(Math.floor(colF) + row * 31, row + 7);
      const mortar = (rf < 0.09 || cf < 0.035) ? 1 : 0;
      const grain = tfbm(X * 4, Y * 4, 32, 32, 3) * 12;
      h = mortar ? 0.18 : 0.68 + id * 0.22 + grain * 0.004;
      g = (mortar ? 168 : 208 + id * 30) + grain;
      tr = 6; tb = -6;
    } else if (kind === 'wood') {  // 板・木目
      const plank = Math.floor(u * 4), pf = (u * 4) % 1;
      const seam = pf < 0.045 ? 1 : 0;
      const grain = tnoise(u * 46, v * 3.2, 184, 26) * 0.65 + tnoise(u * 12, v * 1.6, 48, 13) * 0.35;
      const id = hash2(plank, 3);
      h = seam ? 0.15 : 0.45 + grain * 0.35;
      g = (seam ? 172 : 208 + id * 18) + grain * 42;
      tr = 10; tb = -12;
    } else if (kind === 'thatch') {// 藁葺き：縦の束と段
      const streak = tnoise(u * 96, v * 5, 384, 20) * 0.6 + tnoise(u * 30, v * 2.4, 120, 10) * 0.4;
      const band = Math.floor(v * 9), bf = (v * 9) % 1;
      const shade = (hash2(band, 11) - 0.5) * 22 - sstep(0.75, 1.0, bf) * 26;
      h = 0.35 + streak * 0.5 - sstep(0.8, 1.0, bf) * 0.25;
      g = 204 + streak * 46 + shade;
      tr = 12; tb = -14;
    } else if (kind === 'tile') {  // 瓦：列と一枚ごとの丸み
      const row = Math.floor(v * 8), rf = (v * 8) % 1;
      const off = (row % 2) * 0.5;
      const colF = u * 8 + off, cf = colF % 1;
      const id = hash2(Math.floor(colF) + row * 17, row + 29);
      const curve = Math.sin(cf * Math.PI);            // 瓦の断面の丸み
      const lip = sstep(0.86, 1.0, rf) * 0.5 + sstep(0.10, 0.0, rf) * 0.3;
      h = 0.30 + curve * 0.45 + lip + id * 0.10;
      g = 198 + curve * 34 + id * 20 - sstep(0.88, 1.0, rf) * 34;
      tr = 9; tb = -7;
    } else if (kind === 'plaster') {// 漆喰：穏やかなむらと染み
      const n = tfbm(X * 1.4, Y * 1.4, 11, 11, 4);
      const stain = sstep(0.55, 0.95, tfbm(X * 0.6 + 40, Y * 0.6, 5, 5, 2) * 0.5 + 0.5);
      h = 0.55 + n * 0.10;
      g = 234 + n * 13 - stain * 22;
      tr = 4; tb = -2;
    } else if (kind === 'grass') { // 草地：短い葉の筋と斑
      const blade = tnoise(u * 130, v * 20, 520, 80);
      const patch = tfbm(X * 1.2, Y * 1.2, 10, 10, 3);
      h = 0.40 + blade * 0.38 + patch * 0.18;
      g = 202 + blade * 30 + patch * 26;
      tr = -14; tb = -4; // 緑寄り（乗算用に淡く）
    } else if (kind === 'road') {  // 踏み固めた土
      const n = tfbm(X * 2.4, Y * 2.4, 19, 19, 4);
      const track = Math.max(0, tnoise(X * 6, Y * 6, 48, 48) - 0.66) * 1.8;
      h = 0.52 + n * 0.20 - track * 0.14;
      g = 220 + n * 17 + track * 16;
      tr = 7; tb = -7;
    } else {                        // 'ground' 土・畑
      const n = tfbm(X * 2.0, Y * 2.0, 16, 16, 4);
      const [d1, , id] = tcell(u * 26, v * 26, 26);
      const pebble = sstep(0.30, 0.12, d1) * sstep(0.55, 0.8, id);
      h = 0.44 + n * 0.30 + pebble * 0.30;
      g = 206 + n * 30 + pebble * (id > 0.68 ? 30 : -24);
      tr = 8; tb = -8;
    }
    g = clamp(g, 160, 252);
    return [clamp(g + tr, 160, 252), g, clamp(g + tb, 160, 252), clamp(h, 0.02, 1)];
  };
}

const SURFACE_KINDS = ['stone', 'wood', 'thatch', 'tile', 'plaster', 'ground', 'grass', 'road'];

/* ---------- 公開 API（遅延生成＋キャッシュ） ---------- */
const cache = new Map();
function cached(key, make) {
  if (cache.has(key)) return cache.get(key);
  const v = make();
  cache.set(key, v);
  return v;
}
function normOpts(opts = {}) {
  return {
    size: clamp(Math.round(opts.size || 256), 64, 512),
    anisotropy: clamp(opts.anisotropy || 4, 1, 16),
    bump: opts.bump !== false,
  };
}
// 巨獣の皮膚テクスチャ { map, bump } / 生成不可（DOM無し等）なら null
export function getSkinTexture(kind, opts = {}) {
  const k = typeof kind === 'string' ? (SKIN_NAMES[kind] ?? 0) : clamp(Math.round(kind || 0), 0, 7);
  const o = normOpts(opts);
  return cached(`skin:${k}:${o.size}:${o.anisotropy}:${o.bump ? 1 : 0}`, () => buildPair(o.size, o.anisotropy, o.bump, skinPixel(k)));
}
// 建物・地形の表面テクスチャ { map, bump } / 未知の kind や生成不可なら null
export function getSurfaceTexture(kind, opts = {}) {
  if (!SURFACE_KINDS.includes(kind)) return null;
  const o = normOpts(opts);
  return cached(`surf:${kind}:${o.size}:${o.anisotropy}:${o.bump ? 1 : 0}`, () => buildPair(o.size, o.anisotropy, o.bump, surfacePixel(kind)));
}
export function clearTextureCache() {
  for (const v of cache.values()) { v?.map?.dispose?.(); v?.bump?.dispose?.(); }
  cache.clear();
}
