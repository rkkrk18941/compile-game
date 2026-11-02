#!/usr/bin/env node
// 東京そらさんぽ: 公式統計から人流・車流の補正係数を作る（tokyo-sora/INTEGRATION.md v1）
//
//   cd tools/tokyo-sora-traffic
//   node update.mjs                          # 道路交通センサス(東京都・神奈川県)と駅別乗降客数を公式サイトから取得して作成
//   node update.mjs --prefs 13,14,11,12      # 都県を変える（JIS都道府県コード）
//   node update.mjs --ped-csv 調査.csv        # 自治体の歩行者通行量（共通形式CSV, lib/pedcsv.mjs）を加える
//   node update.mjs --census-dir dir --s12 S12-25_GML.zip   # ダウンロード済みのファイルを使う
//   node update.mjs --dry-run                # 書き出さずに、列の対応・件数・除外理由だけ表示
//
// 出力: tokyo-sora/data/traffic/manifest.json（ゲームが読む係数）, records.json（元の値・単位・換算式・除外理由の記録）
// ゲーム本体（src/, index.html）は変更しない。データが無い地域・曜日は係数を作らず、ゲームは地図由来の推定を使う。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { download, sha256 } from './lib/fetch.mjs';
import { parseKasyo, parseZkntrf, hourlyBySection, prefName, R3_BASE } from './lib/census.mjs';
import { readS12, stationRidership, latestYear } from './lib/stations.mjs';
import { readPedCSV } from './lib/pedcsv.mjs';
import { geocode } from './lib/geocode.mjs';
import { modelCurve, MODEL_SOURCE } from './lib/model.mjs';
import { shapeFactors, stationLevel, median, validatePoints } from './lib/coeff.mjs';

process.on('uncaughtException', (e) => { console.error('エラー: ' + e.message); process.exit(1); });
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..');
const SRC = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const { values: A } = parseArgs({
  options: {
    prefs: { type: 'string' }, 'no-census': { type: 'boolean' }, 'no-stations': { type: 'boolean' }, 'census-dir': { type: 'string' },
    s12: { type: 'string' }, 's12-year': { type: 'string' }, 'ped-csv': { type: 'string', multiple: true }, bbox: { type: 'string' },
    out: { type: 'string' }, offline: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, quiet: { type: 'boolean' }, help: { type: 'boolean' },
    'census-radius': { type: 'string' }, 'station-radius': { type: 'string' }, 'ped-radius': { type: 'string' },
  },
});
if (A.help) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const log = (...s) => { if (!A.quiet) console.log(...s); };
const prefs = (A.prefs || '13,14').split(',').map((s) => s.trim().padStart(2, '0'));
// 既定の範囲: 東京都・神奈川県（駅の絞り込みに使う）
const bbox = A.bbox ? A.bbox.split(',').map(Number) : [138.9, 35.1, 140.0, 35.95];
const R = { census: { '丁目': +(A['census-radius'] ?? 250), '町': +(A['census-radius'] ?? 400) }, station: +(A['station-radius'] ?? 350), ped: +(A['ped-radius'] ?? 150) };
const outDir = path.resolve(A.out || path.join(REPO, 'tokyo-sora', 'data', 'traffic'));

const model = { car: { weekday: modelCurve('car', false), weekend: modelCurve('car', true) }, ped: { weekday: modelCurve('ped', false), weekend: modelCurve('ped', true) } };
const points = [], records = [], datasets = {}, excluded = [];
const fileRec = (url, got) => ({ url: url.startsWith('file:') ? null : url, file: url.startsWith('file:') ? path.basename(got.file) : undefined, sha256: got.sha256, bytes: got.bytes });

// ------------------------------------------------------------------ 道路交通センサス（車）
if (!A['no-census']) {
  const ds = SRC['census-r3'];
  datasets['census-r3'] = { ...ds, files: [], counts: {} };
  for (const nn of prefs) {
    const get = async (kind) => {
      const name = `${kind}${nn}.csv`;
      const url = A['census-dir'] ? 'file://' + path.resolve(A['census-dir'], name) : R3_BASE + name;
      const got = await download(url, { offline: A.offline });
      datasets['census-r3'].files.push(fileRec(url, got));
      return fs.readFileSync(got.file);
    };
    const kasyo = parseKasyo(await get('kasyo')), zk = parseZkntrf(await get('zkntrf'));
    log(`センサス ${prefName(nn + '000')}: 箇所別 ${kasyo.sections.length}区間 / 時間帯別 ${zk.rows.length}行`);
    log('  列の対応: ' + Object.entries(kasyo.columns).map(([k, v]) => `${k}=${v ?? '（なし）'}`).join(' ; '));
    const { sections, skipped } = hourlyBySection(zk, kasyo);
    datasets['census-r3'].counts[nn] = { sections: kasyo.sections.length, hourlyRows: zk.rows.length, badRows: zk.bad.length, observed24h: sections.length, skipped: tally(skipped.map((s) => s.reason)) };
    let added = 0;
    for (const s of sections) {
      const id = `census-r3:${s.code}:${s.roadType}:${s.route}:${s.section}`;
      const loc = await geocode(s.place, prefName(s.code), { offline: A.offline });
      if (loc.error) { excluded.push({ id, reason: '位置: ' + loc.error, place: s.place, query: loc.query }); continue; }
      if (loc.lon < bbox[0] || loc.lon > bbox[2] || loc.lat < bbox[1] || loc.lat > bbox[3]) { excluded.push({ id, reason: '範囲外', place: s.place }); continue; }
      const f = shapeFactors(s.hourly, model.car.weekday);
      if (!f) { excluded.push({ id, reason: '交通量が無い', place: s.place }); continue; }
      const label = `${s.routeName || s.roadTypeName || '路線' + s.route} ${s.place}`;
      points.push({ id, lat: r6(loc.lat), lon: r6(loc.lon), radius: R.census[loc.precision], basis: 'observed', source: `${ds.shortTitle}（国土交通省）${label}`, license: ds.license, year: ds.year, car: { weekday: f } });
      records.push({
        id, dataset: 'census-r3', kind: 'car', basis: 'observed', daytype: '平日',
        location: { method: '国土地理院 住所検索（観測地点地名）', place: s.place, query: loc.query, matched: loc.matched, precision: loc.precision, radius: R.census[loc.precision] },
        observation: { code: s.code, roadType: s.roadType, roadTypeName: s.roadTypeName, route: s.route, routeName: s.routeName, section: s.section, date: s.date, weather: s.weather, directions: s.directions, hours: 24 },
        raw: { unit: ds.units, hourly: s.hourly, v24FromHourly: s.v24Hourly, v24Published: s.v24, v12Published: s.v12, heavyVehicleRatioPercent: s.heavy },
        conversion: 'factor(h) = (V(h)/平均V) / (m(h)/平均m)、0〜4に制限。m = 推定の自動車の時間変化（平日）',
        factors: { car: { weekday: f } },
      });
      added++;
    }
    log(`  係数: ${added}地点（24時間観測 ${sections.length}区間中）`);
  }
}

// ------------------------------------------------------------------ 駅別乗降客数（人）
if (!A['no-stations']) {
  const ds = SRC['ksj-s12'];
  const url = A.s12 ? 'file://' + path.resolve(A.s12) : ds.files[0];
  const got = await download(url, { offline: A.offline });
  const { geojson, entry } = readS12(got.file);
  const year = A['s12-year'] ? +A['s12-year'] : latestYear(geojson);
  const r = stationRidership(geojson, { year, bbox });
  const med = median(r.stations.map((s) => s.riders));
  datasets['ksj-s12'] = { ...ds, year, files: [{ ...fileRec(url, got), entry }], counts: { stations: r.stations.length, median: med, skipped: r.skipped }, fields: r.fields };
  for (const s of r.stations) {
    const id = `ksj-s12:${s.group}`;
    const L = stationLevel(s.riders, med), curve = new Array(24).fill(L);
    points.push({ id, lat: r6(s.lat), lon: r6(s.lon), radius: R.station, basis: 'estimated', source: `${ds.shortTitle}（国土交通省, ${year}年度）${s.name}駅`, license: ds.license, year, ped: { weekday: curve, weekend: curve } });
    records.push({
      id, dataset: 'ksj-s12', kind: 'ped', basis: 'estimated', daytype: ds.daytype,
      location: { method: '駅の位置（線）の重心', name: s.name, lines: s.lines, operators: s.operators, radius: R.station },
      raw: { unit: ds.units, ridersPerDay: s.riders, records: s.records, year },
      conversion: `factor = clamp(sqrt(乗降客数 / 範囲内の駅の中央値 ${med}), 0.25, 4)、全時間同じ値。乗降客数を歩行者数とはみなさない`,
      factors: { ped: { weekday: curve, weekend: curve } },
    });
  }
  log(`駅別乗降客数 ${year}年度: ${r.stations.length}駅（中央値 ${med} 人/日）`);
}

// ------------------------------------------------------------------ 自治体の歩行者通行量（人）
for (const file of A['ped-csv'] || []) {
  const ds = SRC['ped-csv'];
  const buf = fs.readFileSync(file);
  datasets['ped-csv'] = datasets['ped-csv'] || { ...ds, files: [] };
  datasets['ped-csv'].files.push({ file: path.basename(file), sha256: sha256(buf), bytes: buf.length });
  for (const p of readPedCSV(file)) {
    const id = `ped:${p.id}`;
    const ped = {};
    for (const day of ['weekday', 'weekend']) { const f = shapeFactors(p.hours[day], model.ped[day]); if (f) ped[day] = f; }
    if (!Object.keys(ped).length) { excluded.push({ id, reason: '1時間ごとの値が6時間分未満' }); continue; }
    if (!Number.isInteger(p.year) || !(p.lat > 0)) { excluded.push({ id, reason: 'year/lat/lon が無い' }); continue; }
    points.push({ id, lat: r6(p.lat), lon: r6(p.lon), radius: p.radius || R.ped, basis: 'observed', source: p.source, license: p.license, year: p.year, ped });
    records.push({ id, dataset: 'ped-csv', kind: 'ped', basis: 'observed', daytype: Object.keys(ped).join('/'), location: { method: 'CSVの緯度経度', name: p.name, radius: p.radius || R.ped },
      observation: { date: p.date, method: p.method }, raw: { unit: p.unit, hourly: p.hours }, conversion: 'factor(h) = (C(h)/平均C) / (m(h)/平均m)、観測の無い時間は1', factors: { ped } });
  }
}

const manifest = {
  version: 1,
  note: '公開統計で補正した推定の係数（tools/tokyo-sora-traffic で生成）。ライブの混雑・人数ではない。詳細は records.json',
  generated: new Date().toISOString(),
  points: points.sort((a, b) => a.id.localeCompare(b.id)),
};
validatePoints(manifest);
const rec = {
  schema: 'tokyo-sora/traffic-records@1',
  generated: { at: manifest.generated, by: 'tools/tokyo-sora-traffic/update.mjs', args: process.argv.slice(2).map((a) => (path.isAbsolute(a) || a.includes(path.sep) ? path.basename(a) : a)) },
  model: { source: MODEL_SOURCE, curves: model, note: '係数はこの曲線に対する比。activity.js の時間変化を変えたら作り直す' },
  datasets, points: records, excluded,
  summary: { points: points.length, car: points.filter((p) => p.car).length, ped: points.filter((p) => p.ped).length, excluded: excluded.length, excludedReasons: tally(excluded.map((e) => e.reason.replace(/:.*/, ''))) },
};
const manifestText = JSON.stringify(manifest) + '\n';
const manifestBytes = Buffer.byteLength(manifestText);
log(`合計 ${points.length}地点（車 ${rec.summary.car} / 人 ${rec.summary.ped}）、除外 ${excluded.length}、manifest.json ${(manifestBytes / 1024).toFixed(0)} KB`);
// src/integration.js の optionalJSON は 2MiB を超える JSON を読まない（読めないと推定のままになる）
if (manifestBytes > 2 * 1024 * 1024) throw new Error(`manifest.json が ${(manifestBytes / 1048576).toFixed(2)} MiB で、ゲームが読む上限（2MiB）を超えます。--bbox か --prefs で範囲を狭めてください`);
if (A['dry-run']) { log(JSON.stringify(rec.summary, null, 1)); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestText);
fs.writeFileSync(path.join(outDir, 'records.json'), JSON.stringify(rec, null, 1) + '\n');
log(`書き出し: ${path.relative(REPO, path.join(outDir, 'manifest.json'))}`);

function r6(v) { return Math.round(v * 1e6) / 1e6; }
function tally(a) { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return m; }
