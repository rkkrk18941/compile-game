#!/usr/bin/env node
// tools/tokyo-sora-traffic の検証（ネット接続なし）。
//   node test.mjs
// 時間帯別交通量表の行には、国土交通省が公表した令和3年度 時間帯別交通量表（東京都, zkntrf13）の実際の4行
// （都道府県指定市コード13000・区間10・道路種別1・路線1010、上下×小型/大型）を使う。
// 箇所別基本表の地名・駅・歩行者通行量は形式確認用の合成データ（実在の値ではない）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import iconv from 'iconv-lite';
import crypto from 'node:crypto';
import { parseKasyo, parseZkntrf, hourlyBySection, HOUR_OF_POSITION } from './lib/census.mjs';
import { stationRidership, yearFields, latestYear } from './lib/stations.mjs';
import { readPedCSV } from './lib/pedcsv.mjs';
import { geocode, normalizePlace, GSI_ADDRESS } from './lib/geocode.mjs';
import { modelCurve } from './lib/model.mjs';
import { shapeFactors, stationLevel, median, validatePoints } from './lib/coeff.mjs';
import { decodeText } from './lib/csv.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..', '..');
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name); console.error(e); process.exitCode = 1; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-'));
const sjis = (s) => iconv.encode(s, 'Shift_JIS');

// 令和3年度 時間帯別交通量表（東京都）に掲載の実データ4行（7時台始まりの24値、昼間12h、24h）
const REAL = [
  '13000,10,1,1010,1,0,2,20210929,1,1,1,2772,2391,1974,1900,2132,2386,2559,3210,3980,4157,3927,3494,2310,1673,1053,641,369,236,280,158,180,274,1080,2834,34882,45970',
  '13000,10,1,1010,1,0,2,20210929,1,1,2,1259,1121,1329,1377,1286,1176,1072,1081,959,848,667,690,667,625,610,522,865,926,1509,1262,1439,1521,1770,1457,12865,26038',
  '13000,10,1,1010,1,0,2,20210929,1,2,1,3802,2936,2568,2872,2819,2437,2242,2151,2212,2490,2883,2569,1945,1314,895,598,381,263,168,151,233,269,1085,3519,31981,42802',
  '13000,10,1,1010,1,0,2,20210929,1,2,2,933,948,1296,1651,1627,1530,1396,1440,1474,1376,1188,954,960,1129,1234,1106,862,645,509,452,581,523,745,1056,15813,25615',
];
const twelve = (v) => [...v.slice(0, 12), ...new Array(12).fill(0)];
const ZK = [
  '都道府県指定市コード,交通量調査単位区間番号,道路種別,路線番号,令和3年度調査交通量観測・非観測の別,個別調査観測値活用の別,12時間・24時間観測の別,交通量観測年月日,天候,上り・下りの別,車種区分,' + HOUR_OF_POSITION.map((h) => h + '時台').join(',') + ',昼間12時間自動車類交通量,24時間自動車類交通量',
  ...REAL,
  // 12時間観測（夜は観測していない）→ 使わない
  '13100,20,3,1,1,0,1,20211006,2,1,1,' + twelve([100, 120, 110, 100, 90, 95, 100, 105, 110, 120, 130, 125]).join(',') + ',1305,',
  // 非観測（推定値）→ 使わない
  '13100,30,3,15,2,0,0,,,1,1,' + new Array(24).fill(50).join(',') + ',600,1200',
  // 検算が合わない → 使わない
  '13100,40,4,405,1,0,2,20211006,1,1,1,' + new Array(24).fill(10).join(',') + ',120,999',
  '13100,40,4,405,1,0,2,20211006,1,1,2,' + new Array(24).fill(1).join(',') + ',12,24',
].join('\r\n');
// 箇所別基本表（2段の見出し。列の並び・見出しの語は説明資料の項目名に合わせた形式確認用）
const KASYO = [
  '交通調査基本区間番号,道路種別,路線,路線,区間延長,交通量調査単位区間番号,交通量観測地点地名,令和3年度調査交通量観測・非観測の別,12時間・24時間観測の別,交通量観測年月日,昼間12時間自動車類交通量,24時間自動車類交通量,昼間12時間大型車混入率,平成27年度交通量調査単位区間番号・自動車類交通量',
  ',,路線番号,路線名,（km）,,,,,,（台/12h）,（台/24h）,（%）,',
  '1301010010,1,1010,中央自動車道,1.2,10,八王子市石川町,1,2,20210929,95541,140425,20.1,10',
  '1310000020,3,1,一般国道1号,0.8,20,港区芝公園４丁目,1,1,20211006,1305,,12.0,20',
  '1310000030,3,15,一般国道15号,0.5,30,中央区銀座８丁目,2,0,,600,1200,10.0,30',
  '1310000040,4,405,主要地方道405号,0.4,40,千代田区丸の内１丁目,1,2,20211006,132,,8.0,40',
].join('\r\n');
const cdir = path.join(tmp, 'census');
fs.mkdirSync(cdir, { recursive: true });
fs.writeFileSync(path.join(cdir, 'zkntrf13.csv'), sjis(ZK));
fs.writeFileSync(path.join(cdir, 'kasyo13.csv'), sjis(KASYO));

await test('CSV: Shift_JIS と UTF-8(BOM) を判別', () => {
  assert.equal(decodeText(sjis('東京都,丸の内')), '東京都,丸の内');
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('道路種別')])), '道路種別');
});

let zk, kasyo;
await test('時間帯別交通量表: 列の順・7時台始まり→0〜23時・12h/24h の検算', () => {
  zk = parseZkntrf(fs.readFileSync(path.join(cdir, 'zkntrf13.csv')));
  assert.equal(zk.rows.length, 8);
  const r = zk.rows[0];
  assert.deepEqual([r.code, r.section, r.roadType, r.route, r.observed, r.obsHours, r.date, r.dir, r.vehicle], ['13000', '10', 1, '1010', 1, 2, '20210929', 1, 1]);
  assert.equal(r.hourly[7], 2772); assert.equal(r.hourly[18], 3494); assert.equal(r.hourly[19], 2310); assert.equal(r.hourly[0], 236); assert.equal(r.hourly[6], 2834);
  assert.ok(zk.rows.slice(0, 4).every((x) => x.sumsOk), '公表行は検算が合う');
  assert.equal(zk.rows[6].sumsOk, false); assert.equal(zk.rows[7].sumsOk, true);
});

await test('箇所別基本表: 2段見出しから列を特定', () => {
  kasyo = parseKasyo(fs.readFileSync(path.join(cdir, 'kasyo13.csv')));
  assert.equal(kasyo.sections.length, 4);
  assert.equal(kasyo.columns.section, '交通量調査単位区間番号');
  assert.ok(kasyo.columns.v24.includes('24時間自動車類交通量'));
  const s = kasyo.sections[0];
  assert.deepEqual([s.roadType, s.route, s.routeName, s.section, s.place, s.observed, s.obsHours, s.v24], [1, '1010', '中央自動車道', '10', '八王子市石川町', 1, 2, 140425]);
});

let sections;
await test('区間ごとの時間別合計: 観測・24時間・検算一致だけを使い、理由を記録', () => {
  const r = hourlyBySection(zk, kasyo);
  sections = r.sections;
  assert.equal(sections.length, 1);
  assert.equal(sections[0].v24Hourly, 45970 + 26038 + 42802 + 25615);
  assert.equal(sections[0].hourly[8], 2391 + 1121 + 2936 + 948);
  const reasons = r.skipped.map((s) => s.reason).sort();
  assert.deepEqual(reasons, ['12時間観測（夜間は観測していない）', '時間帯別の和が12h/24h合計と一致しない', '非観測（推定値）']);
});

await test('換算: 形の係数は1日の総量を変えず、0〜4に収まる', () => {
  const m = modelCurve('car', false);
  const f = shapeFactors(sections[0].hourly, m);
  assert.equal(f.length, 24);
  assert.ok(f.every((v) => v >= 0 && v <= 4));
  const tot = f.reduce((a, v, h) => a + v * m[h], 0), base = m.reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(tot - base) / base < 0.01, `${tot} vs ${base}`);
  // 実データの形: 深夜（2時）は昼（14時）より少ない
  assert.ok(sections[0].hourly[2] < sections[0].hourly[14]);
  // 観測が6時間未満なら作らない、欠けた時間は1
  assert.equal(shapeFactors([1, 2, null, null, null, null, ...new Array(18).fill(null)], m), null);
  const part = shapeFactors(Array.from({ length: 24 }, (_, h) => (h >= 7 && h < 19 ? 100 : null)), m);
  assert.equal(part[3], 1);
});

await test('住所検索: 町名・丁目が一致する結果だけを採用（地理院 API の応答形式）', async () => {
  const orig = globalThis.fetch;
  const resp = {
    '東京都千代田区丸の内1丁目': [{ geometry: { coordinates: [139.7650, 35.6800], type: 'Point' }, type: 'Feature', properties: { addressCode: '', title: '東京都千代田区丸の内一丁目' } }],
    '東京都港区芝公園4丁目': [{ geometry: { coordinates: [139.745, 35.657] }, properties: { title: '東京都港区芝公園' } }, { geometry: { coordinates: [139.7466, 35.6585] }, properties: { title: '東京都港区芝公園四丁目' } }],
    '東京都中央区銀座8丁目': [{ geometry: { coordinates: [139.0, 35.0] }, properties: { title: '東京都中央区日本橋' } }],
  };
  globalThis.fetch = async (u) => { const q = decodeURIComponent(String(u).slice(GSI_ADDRESS.length)); return new Response(JSON.stringify(resp[q] || [])); };
  process.env.TOKYO_SORA_TRAFFIC_CACHE = path.join(tmp, 'cache-geo');
  try {
    assert.equal(normalizePlace('千代田区丸の内１丁目', '東京都'), '東京都千代田区丸の内1丁目');
    const a = await geocode('千代田区丸の内１丁目', '東京都');
    assert.equal(a.precision, '丁目'); assert.equal(a.matched, '東京都千代田区丸の内1丁目');
    const b = await geocode('港区芝公園４丁目', '東京都');
    assert.equal(b.precision, '丁目'); assert.equal(b.lon, 139.7466);
    const c = await geocode('中央区銀座８丁目', '東京都');
    assert.ok(c.error, '町名が違う結果は使わない');
  } finally { globalThis.fetch = orig; }
});

await test('駅別乗降客数(S12): 年度の項目番号・重複/非公開を除いた合計・規模の係数', () => {
  assert.deepEqual(yearFields(2011), { dup: 'S12_006', exists: 'S12_007', note: 'S12_008', riders: 'S12_009' });
  assert.deepEqual(yearFields(2024), { dup: 'S12_058', exists: 'S12_059', note: 'S12_060', riders: 'S12_061' });
  const F = yearFields(2024);
  const feat = (name, g, op, line, lon, lat, dup, ex, riders) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lon - 0.001, lat], [lon + 0.001, lat]] }, properties: { S12_001: name, S12_001c: g + op, S12_001g: g, S12_002: op, S12_003: line, S12_004: 11, S12_005: 2, [F.dup]: dup, [F.exists]: ex, [F.note]: '', [F.riders]: riders } });
  const gj = { type: 'FeatureCollection', features: [
    feat('甲', 'G1', '事業者A', 'A線', 139.76, 35.68, 1, 1, 400000), feat('甲', 'G1', '事業者A', 'B線', 139.761, 35.68, 2, 1, 400000), feat('甲', 'G1', '事業者B', 'C線', 139.762, 35.681, 1, 1, 100000),
    feat('乙', 'G2', '事業者A', 'A線', 139.70, 35.69, 1, 1, 20000), feat('丙', 'G3', '事業者C', 'D線', 139.60, 35.60, 1, 3, 0), feat('丁', 'G4', '事業者D', 'E線', 139.65, 35.62, 1, 1, 80000),
  ] };
  assert.equal(latestYear(gj), 2024);
  const r = stationRidership(gj, { year: 2024, bbox: [139, 35, 140, 36] });
  assert.deepEqual(r.stations.map((s) => [s.name, s.riders]), [['甲', 500000], ['丁', 80000], ['乙', 20000]]);
  assert.equal(r.skipped.duplicate, 1); assert.equal(r.skipped.noData, 1);
  const med = median(r.stations.map((s) => s.riders));
  assert.equal(med, 80000);
  assert.equal(stationLevel(500000, med), 2.5); assert.equal(stationLevel(20000, med), 0.5); assert.equal(stationLevel(10, med), 0.25);
  fs.writeFileSync(path.join(tmp, 's12.geojson'), JSON.stringify(gj));
});

await test('歩行者通行量CSV（共通形式）: 地点・平休日ごとの1時間値', () => {
  const rows = ['point_id,name,lat,lon,daytype,hour,count,unit,year,date,source,license,method'];
  for (let h = 7; h <= 18; h++) rows.push(`p1,合成地点,35.6812,139.7671,weekday,${h},${h === 8 || h === 18 ? 900 : 400},人/時,2024,2024-10-08,形式確認用の合成データ,CC BY 4.0,人手計測`);
  for (let h = 10; h <= 12; h++) rows.push(`p1,合成地点,35.6812,139.7671,weekend,${h},300,人/時,2024,2024-10-13,形式確認用の合成データ,CC BY 4.0,人手計測`);
  fs.writeFileSync(path.join(tmp, 'ped.csv'), rows.join('\n'));
  const [p] = readPedCSV(path.join(tmp, 'ped.csv'));
  assert.equal(p.hours.weekday[8], 900); assert.equal(p.hours.weekday[3], null);
  const f = shapeFactors(p.hours.weekday, modelCurve('ped', false));
  assert.ok(f[8] > f[12], '朝のピークが残る'); assert.equal(f[3], 1);
  assert.equal(shapeFactors(p.hours.weekend, modelCurve('ped', true)), null, '3時間分だけでは作らない');
});

let out;
await test('update.mjs: ダウンロード済みファイルから manifest と記録を作り、検査に通る', () => {
  // 住所検索の応答をキャッシュに置き、--offline で実行（ネットに出ない）
  const cache = path.join(tmp, 'cache');
  const put = (q, title, lon, lat) => {
    const u = new URL(GSI_ADDRESS + encodeURIComponent(q));
    const f = path.join(cache, (u.hostname + u.pathname).replace(/[^A-Za-z0-9._\-\/%]/g, '_') + '_' + crypto.createHash('sha256').update(u.search).digest('hex').slice(0, 12));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify([{ geometry: { coordinates: [lon, lat] }, properties: { title } }]));
  };
  put('東京都八王子市石川町', '東京都八王子市石川町', 139.3683, 35.6713);
  out = path.join(tmp, 'out');
  execFileSync(process.execPath, [path.join(HERE, 'update.mjs'), '--census-dir', cdir, '--prefs', '13', '--s12', path.join(tmp, 's12.geojson'), '--ped-csv', path.join(tmp, 'ped.csv'), '--out', out, '--offline', '--quiet'], { stdio: 'inherit', env: { ...process.env, TOKYO_SORA_TRAFFIC_CACHE: cache } });
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  validatePoints(m);
  const rec = JSON.parse(fs.readFileSync(path.join(out, 'records.json'), 'utf8'));
  assert.equal(m.points.filter((p) => p.car).length, 1);
  assert.equal(m.points.filter((p) => p.ped).length, 4); // 駅3＋歩行者1
  const car = m.points.find((p) => p.car);
  assert.equal(car.basis, 'observed'); assert.equal(car.year, 2021); assert.ok(!car.car.weekend, '休日の係数は作らない');
  assert.equal(car.radius, 400, '町の代表点（丁目なし）は広めの半径');
  const cr = rec.points.find((p) => p.id === car.id);
  assert.equal(cr.raw.v24FromHourly, 140425); assert.equal(cr.raw.v24Published, 140425, '箇所別基本表の24時間交通量と時間別の和が一致');
  assert.equal(cr.raw.unit, '台/時（上り・下り、小型車・大型車の合計）');
  const st = m.points.find((p) => p.id === 'ksj-s12:G1');
  assert.equal(st.basis, 'estimated'); assert.deepEqual(st.ped.weekday, new Array(24).fill(2.5));
  assert.ok(rec.datasets['census-r3'].files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  assert.ok(rec.excluded.length >= 0 && rec.summary.points === m.points.length);
  assert.ok(!JSON.stringify(rec).includes(tmp), '記録にローカルの絶対パスを含めない');
});

await test('ゲームの TrafficCalibration が全地点を受理し、観測点で係数どおり・範囲外と休日は推定のまま', async () => {
  let build;
  try { ({ build } = await import(pathToFileURL(path.join(REPO, 'node_modules', 'esbuild', 'lib', 'main.js')).href)); } catch { console.log('     （ルートで npm ci していないため省略）'); return; }
  const bundle = async (rel) => { const r = await build({ entryPoints: [path.join(REPO, rel)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' }); const f = path.join(tmp, path.basename(rel) + '.mjs'); fs.writeFileSync(f, r.outputFiles[0].text); return import(pathToFileURL(f).href); };
  const { TrafficCalibration } = await bundle('tokyo-sora/src/integration.js');
  const { llToWorld } = await bundle('tokyo-sora/src/geo.js');
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  const cal = new TrafficCalibration();
  cal.load(m);
  assert.equal(cal.points.length, m.points.length, '捨てられる地点が無い');
  const car = m.points.find((p) => p.car);
  const [x, z] = llToWorld(car.lat, car.lon);
  assert.ok(Math.abs(cal.factor('car', x, z, 8, false) - car.car.weekday[8]) < 1e-9);
  assert.equal(cal.factor('car', x, z, 8, true), 1, '休日は推定のまま');
  assert.equal(cal.factor('car', x + 5000, z, 8, false), 1, '範囲外は推定のまま');
});

if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept', tmp);
console.log(`\n${passed} passed${process.exitCode ? ', FAILED' : ''}`);
