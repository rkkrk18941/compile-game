// 国土数値情報「駅別乗降客数データ」（S12, 国土交通省, CC BY 4.0）
//   https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-S12-2024.html
// 属性: S12_001 駅名, S12_001c 駅コード, S12_001g グループコード（300m以内・同名駅の代表）, S12_002 運営会社, S12_003 路線名,
//       S12_004 鉄道区分, S12_005 事業者種別, 年度ごとに [重複コード, データ有無コード, 備考, 乗降客数(人/日)] の4項目が
//       2011年度 S12_006〜S12_009 から順に並ぶ（2024年度は S12_058〜S12_061）。
// 乗降客数は事業者ごとの集計で、統一基準ではない（データ提供ページの注記）。
import { openZip } from './zip.mjs';
import fs from 'node:fs';

export function yearFields(year) {
  const base = 6 + (year - 2011) * 4;
  const f = (n) => 'S12_' + String(n).padStart(3, '0');
  return { dup: f(base), exists: f(base + 1), note: f(base + 2), riders: f(base + 3) };
}

/** S12 の zip（GeoJSON 同梱）または GeoJSON を読む */
export function readS12(file) {
  if (/\.zip$/i.test(file)) {
    const z = openZip(file);
    const name = [...z.entries.keys()].find((n) => /\.geojson$/i.test(n) && /S12/i.test(n));
    if (!name) { z.close(); throw new Error('S12 の zip に GeoJSON がありません: ' + file); }
    const gj = JSON.parse(z.read(name).toString('utf8'));
    z.close();
    return { geojson: gj, entry: name };
  }
  return { geojson: JSON.parse(fs.readFileSync(file, 'utf8')), entry: null };
}

/** データに含まれる最新の年度 */
export function latestYear(gj) {
  const p = gj.features[0]?.properties || {};
  let y = null;
  for (let k = 2011; k <= 2100; k++) if (yearFields(k).riders in p) y = k;
  if (y == null) throw new Error('S12 の乗降客数の項目が見つかりません');
  return y;
}

function centroid(geom) {
  let sx = 0, sy = 0, n = 0;
  const walk = (c) => { if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++; } else c.forEach(walk); };
  walk(geom.coordinates);
  return n ? [sx / n, sy / n] : null;
}

/**
 * 駅（グループコード単位）ごとの1日の乗降客数。
 * 重複コード=2（他の路線の駅と同じ値を重ねて載せている）を除き、データ有無コード=1（データあり）だけを合計する。
 * @returns {{year:number, stations: {group:string, name:string, operators:string[], lines:string[], riders:number, lon:number, lat:number, records:number}[], skipped:object}}
 */
export function stationRidership(gj, { year = latestYear(gj), bbox = null } = {}) {
  const F = yearFields(year);
  const groups = new Map();
  const skipped = { noData: 0, duplicate: 0, outside: 0 };
  for (const f of gj.features) {
    const p = f.properties, c = centroid(f.geometry);
    if (!c) continue;
    if (bbox && (c[0] < bbox[0] || c[0] > bbox[2] || c[1] < bbox[1] || c[1] > bbox[3])) { skipped.outside++; continue; }
    const g = String(p.S12_001g || p.S12_001c || p.S12_001 + '@' + c.map((v) => v.toFixed(3)).join(','));
    let s = groups.get(g);
    if (!s) { s = { group: g, name: p.S12_001, operators: new Set(), lines: new Set(), riders: 0, pts: [], records: 0 }; groups.set(g, s); }
    s.pts.push(c); s.lines.add(p.S12_003);
    if (+p[F.exists] !== 1) { skipped.noData++; continue; }
    if (+p[F.dup] === 2) { skipped.duplicate++; continue; }
    const r = +p[F.riders];
    if (!(r >= 0)) { skipped.noData++; continue; }
    s.riders += r; s.records++; s.operators.add(p.S12_002);
  }
  const stations = [];
  for (const s of groups.values()) {
    if (!s.records) continue;
    const lon = s.pts.reduce((a, q) => a + q[0], 0) / s.pts.length, lat = s.pts.reduce((a, q) => a + q[1], 0) / s.pts.length;
    stations.push({ group: s.group, name: s.name, operators: [...s.operators], lines: [...s.lines], riders: s.riders, lon, lat, records: s.records });
  }
  stations.sort((a, b) => b.riders - a.riders);
  return { year, fields: F, stations, skipped };
}
