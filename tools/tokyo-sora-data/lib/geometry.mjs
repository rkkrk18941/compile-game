// CityGMLの面（緯度・経度・T.P.標高）をゲーム世界座標の三角形に変換する。
// 投影はゲーム本体と同一の tokyo-sora/src/geo.js を読み込んで使う（座標系を二重定義しない）。
//   X = 東, Y = 上（T.P.標高そのまま, m）, Z = 南。原点 = 東京駅（geo.js の ORIGIN_LAT/LON）。
// 変換 (東,北,上)→(X,−Z,Y) は向きを保つので、CityGMLの「外側から見て反時計回り」のリングは
// glTF の表面（反時計回り）にそのまま対応する。
import fs from 'node:fs';
import earcut from 'earcut';

// ゲーム本体の geo.js をそのまま評価して使う（ルートの package.json に "type" が無いので data: URL 経由で ES module として読む）
const GEO_SRC = fs.readFileSync(new URL('../../../tokyo-sora/src/geo.js', import.meta.url), 'utf8');
const geo = await import('data:text/javascript;base64,' + Buffer.from(GEO_SRC).toString('base64'));
export const { llToWorld, worldToLL, tileBounds, tileAt, tileSize, ORIGIN_LAT, ORIGIN_LON, K } = geo;

const EPS2 = 1e-8; // (1e-4 m)^2

/** [lat,lon,h]* のリングを、閉じ点・連続重複点を除いた世界座標 [X,Y,Z]* にする。uv は同じ添字で間引く */
function cleanRing(ll, uv) {
  const n = ll.length / 3;
  const xs = [], us = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = llToWorld(ll[i * 3], ll[i * 3 + 1]);
    const y = ll[i * 3 + 2];
    const k = xs.length;
    if (k) { const dx = x - xs[k - 3], dy = y - xs[k - 2], dz = z - xs[k - 1]; if (dx * dx + dy * dy + dz * dz < EPS2) continue; }
    xs.push(x, y, z);
    if (uv) us.push(uv[i * 2], uv[i * 2 + 1]);
  }
  // 閉じ点
  while (xs.length >= 6) {
    const k = xs.length;
    const dx = xs[k - 3] - xs[0], dy = xs[k - 2] - xs[1], dz = xs[k - 1] - xs[2];
    if (dx * dx + dy * dy + dz * dz >= EPS2) break;
    xs.length -= 3; if (uv) us.length -= 2;
  }
  return { xyz: xs, uv: uv ? us : null };
}

function newell(p) {
  let nx = 0, ny = 0, nz = 0;
  const n = p.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 3], yi = p[i * 3 + 1], zi = p[i * 3 + 2], xj = p[j * 3], yj = p[j * 3 + 1], zj = p[j * 3 + 2];
    nx += (yj - yi) * (zj + zi); ny += (zj - zi) * (xj + xi); nz += (xj - xi) * (yj + yi);
  }
  return [nx, ny, nz];
}

/**
 * 1つの多角形（外周＋内周）を三角形にする。
 * @param {Float64Array[]} rings [lat,lon,h]* （先頭が外周）
 * @param {(Float64Array|null)[]|null} uvRings 各リングのUV（CityGMLの textureCoordinates, 左下原点）
 * @returns {null | {pos:number[], uv:number[]|null, idx:number[], normal:number[], area:number, uvArea:number}}
 */
export function triangulatePolygon(rings, uvRings = null) {
  const cl = [];
  let withUv = !!uvRings;
  for (let r = 0; r < rings.length; r++) {
    const uv = uvRings ? uvRings[r] : null;
    if (uvRings && (!uv || uv.length !== (rings[r].length / 3) * 2)) withUv = false;
    const c = cleanRing(rings[r], uvRings && uv && uv.length === (rings[r].length / 3) * 2 ? uv : null);
    if (c.xyz.length < 9) { if (r === 0) return null; continue; }
    cl.push(c);
  }
  if (!cl.length) return null;
  const ext = cl[0].xyz;
  const nrm = newell(ext);
  const len = Math.hypot(nrm[0], nrm[1], nrm[2]);
  if (len < 1e-6) return null; // 面積ほぼ0
  const N = [nrm[0] / len, nrm[1] / len, nrm[2] / len];
  // 主軸を落として2Dに投影
  const ax = Math.abs(N[0]), ay = Math.abs(N[1]), az = Math.abs(N[2]);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const [iu, iv] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1];
  const flat = [], holes = [], pos = [], uv = withUv ? [] : null;
  for (let r = 0; r < cl.length; r++) {
    if (r > 0) holes.push(pos.length / 3);
    const p = cl[r].xyz;
    for (let i = 0; i < p.length; i += 3) { flat.push(p[i + iu], p[i + iv]); pos.push(p[i], p[i + 1], p[i + 2]); }
    if (uv) { if (!cl[r].uv) return triangulatePolygon(rings, null); uv.push(...cl[r].uv); }
  }
  const tri = earcut(flat, holes.length ? holes : null, 2);
  if (!tri.length) return null;
  // 向きを外向き法線（Newell）にそろえる（glTFは反時計回りが表）
  const idx = [];
  let area = 0, uvArea = 0;
  for (let t = 0; t < tri.length; t += 3) {
    let a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const d = cx * N[0] + cy * N[1] + cz * N[2];
    if (Math.abs(d) < 1e-9) continue; // 退化三角形
    if (d < 0) { const s = b; b = c; c = s; }
    idx.push(a, b, c);
    area += Math.abs(d) / 2;
    if (uv) {
      const du1 = uv[b * 2] - uv[a * 2], dv1 = uv[b * 2 + 1] - uv[a * 2 + 1], du2 = uv[c * 2] - uv[a * 2], dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
      uvArea += Math.abs(du1 * dv2 - du2 * dv1) / 2;
    }
  }
  if (!idx.length) return null;
  return { pos, uv, idx, normal: N, area, uvArea };
}

/** XZ平面の凸包（足跡が無い場合の代替） */
export function convexHullXZ(pts) {
  const p = [];
  for (let i = 0; i < pts.length; i += 3) p.push([pts[i], pts[i + 2]]);
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

/** 緯度経度リング → 世界座標XZ（閉じ点なし） */
export function ringXZ(ll) {
  const out = [];
  for (let i = 0; i < ll.length; i += 3) {
    const [x, z] = llToWorld(ll[i], ll[i + 1]);
    const k = out.length;
    if (k && Math.abs(out[k - 1][0] - x) < 1e-4 && Math.abs(out[k - 1][1] - z) < 1e-4) continue;
    out.push([x, z]);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-4 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out;
}
