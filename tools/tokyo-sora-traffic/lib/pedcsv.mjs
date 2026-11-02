// 自治体などが公表した歩行者通行量を、共通の形の CSV にして読み込む。
// 自治体ごとに公表形式（PDF・Excel・独自CSV）が違うため、元の表から次の列を写したCSVを用意する:
//   point_id, name, lat, lon, daytype(weekday|weekend), hour(0-23, その時台), count, unit, year, date,
//   source（調査名・地点名・公表URL）, license（利用条件）, method（観測方法: 人手計測/センサー等）, radius(任意, m)
// 1時間ごとでない調査（例: 7〜19時の12時間合計だけ）は時間帯の形が分からないので使わない。
import fs from 'node:fs';
import { decodeText, parseCSV, nfkc, num } from './csv.mjs';

const REQUIRED = ['point_id', 'name', 'lat', 'lon', 'daytype', 'hour', 'count', 'unit', 'year', 'source', 'license'];

export function readPedCSV(file) {
  const rows = parseCSV(decodeText(fs.readFileSync(file)));
  const head = rows[0].map((h) => nfkc(h).toLowerCase());
  const miss = REQUIRED.filter((k) => !head.includes(k));
  if (miss.length) throw new Error(`${file}: 列が足りません: ${miss.join(', ')}`);
  const at = (r, k) => r[head.indexOf(k)];
  const pts = new Map();
  for (const r of rows.slice(1)) {
    const id = nfkc(at(r, 'point_id')), day = nfkc(at(r, 'daytype')).toLowerCase(), h = num(at(r, 'hour')), c = num(at(r, 'count'));
    if (!id || !['weekday', 'weekend'].includes(day) || !(h >= 0 && h <= 23) || !(c >= 0)) continue;
    let p = pts.get(id);
    if (!p) {
      p = { id, name: nfkc(at(r, 'name')), lat: num(at(r, 'lat')), lon: num(at(r, 'lon')), unit: nfkc(at(r, 'unit')), year: num(at(r, 'year')),
        date: head.includes('date') ? nfkc(at(r, 'date')) : null, source: nfkc(at(r, 'source')), license: nfkc(at(r, 'license')),
        method: head.includes('method') ? nfkc(at(r, 'method')) : null, radius: head.includes('radius') ? num(at(r, 'radius')) : null, hours: { weekday: new Array(24).fill(null), weekend: new Array(24).fill(null) } };
      pts.set(id, p);
    }
    p.hours[day][h] = (p.hours[day][h] || 0) + c;
  }
  return [...pts.values()];
}
