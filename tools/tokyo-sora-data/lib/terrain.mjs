// PLATEAU地形モデル（dem:TINRelief の三角網）→ z16タイルの標高PNG。
// 符号化は地理院タイル「標高タイル（PNG形式）」と同じ（x = 2^16R + 2^8G + B, x<2^23 なら h=0.01x, 2^23=無効値）。
// ゲームの dem.js と同じ復号で読めるため、既存の地理院DEMの上に高精細な地形として重ねられる。
import sharp from 'sharp';
import { llToWorld, tileBounds, tileAt } from './geometry.mjs';

/** TIN三角形（[lat,lon,h]*4 の閉じたリング）を世界座標の Float64Array(9*n) にする */
export function tinToWorld(tris) {
  const out = new Float64Array(tris.length * 9);
  let o = 0;
  for (const r of tris) {
    for (let k = 0; k < 3; k++) { const [x, z] = llToWorld(r[k * 3], r[k * 3 + 1]); out[o++] = x; out[o++] = r[k * 3 + 2]; out[o++] = z; }
  }
  return out;
}

export function tinTiles(tw, z, bboxWorld = null) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < tw.length; i += 3) { const x = tw[i], zz = tw[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (zz < z0) z0 = zz; if (zz > z1) z1 = zz; }
  if (bboxWorld) { x0 = Math.max(x0, bboxWorld[0]); z0 = Math.max(z0, bboxWorld[1]); x1 = Math.min(x1, bboxWorld[2]); z1 = Math.min(z1, bboxWorld[3]); }
  if (!(x1 > x0 && z1 > z0)) return [];
  const [ax, ay] = tileAt(z, x0, z0), [bx, by] = tileAt(z, x1, z1);
  const out = [];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) out.push([x, y]);
  return out;
}

/** タイルの size×size 画素中心で三角網を補間。データなしは NaN */
export function rasterizeTile(tw, z, tx, ty, size = 256) {
  const [x0, z0, x1, z1] = tileBounds(z, tx, ty);
  const S = (x1 - x0) / size;
  const h = new Float32Array(size * size).fill(NaN);
  for (let t = 0; t < tw.length; t += 9) {
    const ax = tw[t], ay = tw[t + 1], az = tw[t + 2], bx = tw[t + 3], by = tw[t + 4], bz = tw[t + 5], cx = tw[t + 6], cy = tw[t + 7], cz = tw[t + 8];
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
    if (maxx < x0 || minx > x1 || maxz < z0 || minz > z1) continue;
    const i0 = Math.max(0, Math.ceil((minx - x0) / S - 0.5)), i1 = Math.min(size - 1, Math.floor((maxx - x0) / S - 0.5));
    const j0 = Math.max(0, Math.ceil((minz - z0) / S - 0.5)), j1 = Math.min(size - 1, Math.floor((maxz - z0) / S - 0.5));
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + (j + 0.5) * S;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + (i + 0.5) * S;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        h[j * size + i] = l1 * ay + l2 * by + l3 * cy;
      }
    }
  }
  return h;
}

/** 地理院 dem_png 互換の PNG に符号化 */
export async function encodeDemPng(h, size = 256) {
  const rgb = Buffer.alloc(size * size * 3);
  let valid = 0;
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    if (!Number.isFinite(v)) { rgb[i * 3] = 128; rgb[i * 3 + 1] = 0; rgb[i * 3 + 2] = 0; continue; }
    valid++;
    let x = Math.round(v * 100);
    if (x < 0) x += 1 << 24;
    rgb[i * 3] = (x >> 16) & 255; rgb[i * 3 + 1] = (x >> 8) & 255; rgb[i * 3 + 2] = x & 255;
  }
  const png = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, valid, coverage: valid / h.length };
}

/** 復号（テスト・検証用。dem.js と同じ式） */
export function decodeDemRGB(r, g, b) {
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return NaN;
  return (x < 8388608 ? x : x - 16777216) * 0.01;
}
