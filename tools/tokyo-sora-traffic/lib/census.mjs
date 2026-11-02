// 令和3年度 全国道路・街路交通情勢調査（道路交通センサス）一般交通量調査
//   箇所別基本表 kasyoNN.csv / 時間帯別交通量表 zkntrfNN.csv（NN=都道府県コード）
//   https://www.mlit.go.jp/road/census/r3/index.html
//   項目の定義: https://www.mlit.go.jp/road/census/r3/data/pdf/kasyorep.pdf
//
// 時間帯別交通量表の列（説明資料の順）:
//   都道府県指定市コード, 交通量調査単位区間番号, 道路種別, 路線番号, 令和3年度調査交通量観測・非観測の別(1観測/2非観測=推定),
//   個別調査観測値活用の別, 12時間・24時間観測の別(1=12h/2=24h/0=非観測), 交通量観測年月日, 天候, 上り・下りの別(1/2),
//   車種区分(1小型/2大型), 時間帯別自動車類交通量 24値（7時台…18時台, 19時台…23時台, 0時台…6時台, 台/時）,
//   昼間12時間自動車類交通量(台/12h), 24時間自動車類交通量(台/24h)
// CSV版では推定値の斜体が区別できないため、観測=1 かつ 24時間観測=2 の区間だけを「観測値」として扱う。
import { decodeText, parseCSV, headerIndex, findColumn, nfkc, num, isNumericCell } from './csv.mjs';

export const R3_BASE = 'https://www.mlit.go.jp/road/census/r3/data/csv/';
export const ROAD_TYPES = { 1: '高速自動車国道', 2: '都市高速道路', 3: '一般国道', 4: '主要地方道（都道府県道）', 5: '主要地方道（指定市市道）', 6: '一般都道府県道', 7: '指定市の一般市道' };
export const PREFS = ['', '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
/** CSVの24値の並び（7時台始まり）→ 0〜23時 */
export const HOUR_OF_POSITION = Array.from({ length: 24 }, (_, p) => (7 + p) % 24);

export function prefName(code) { const c = String(code).padStart(5, '0'); return PREFS[+c.slice(0, 2)] || ''; }

/** 時間帯別交通量表 */
export function parseZkntrf(buf) {
  const rows = parseCSV(decodeText(buf));
  const out = [], bad = [];
  for (const r of rows) {
    const cells = r.map(nfkc);
    if (!isNumericCell(cells[0])) continue; // 見出し
    if (cells.length < 37) { bad.push({ reason: 'columns', cells: cells.length }); continue; }
    const v = cells.slice(11, 35).map(num), v12 = num(cells[35]), v24 = num(cells[36]);
    const hourly = new Array(24).fill(null);
    v.forEach((x, p) => { hourly[HOUR_OF_POSITION[p]] = x; });
    const row = {
      code: cells[0], section: cells[1], roadType: num(cells[2]), route: cells[3], observed: num(cells[4]), individual: num(cells[5]), obsHours: num(cells[6]),
      date: cells[7], weather: num(cells[8]), dir: num(cells[9]), vehicle: num(cells[10]), hourly, v12, v24,
    };
    // 説明資料どおり 7〜18時の和 = 昼間12時間、全24値の和 = 24時間 になっているか
    const s12 = v.slice(0, 12).reduce((a, x) => a + (x || 0), 0), s24 = v.reduce((a, x) => a + (x || 0), 0);
    row.sumsOk = v.every((x) => x != null) && (v12 == null || s12 === v12) && (v24 == null || s24 === v24);
    out.push(row);
  }
  return { rows: out, bad };
}

/** 箇所別基本表（見出しの語で列を特定） */
export function parseKasyo(buf) {
  const rows = parseCSV(decodeText(buf));
  const { first, labels } = headerIndex(rows);
  const col = {
    code: findColumn(labels, ['都道府県'], ['名']),
    section: findColumn(labels, ['交通量調査単位区間番号'], ['平成27', '観測地点']),
    roadType: findColumn(labels, ['道路種別']),
    route: findColumn(labels, ['路線番号']),
    routeName: findColumn(labels, ['路線名']),
    place: findColumn(labels, ['観測地点地名']),
    city: findColumn(labels, ['市区町村コード']),
    observed: findColumn(labels, ['観測・非観測'], ['旅行速度']),
    obsHours: findColumn(labels, ['12時間', '24時間', '観測の別']),
    date: findColumn(labels, ['交通量観測年月日']),
    v12: findColumn(labels, ['昼間12時間', '自動車類交通量'], ['平成27', 'ピーク', '旅行速度']),
    v24: findColumn(labels, ['24時間', '自動車類交通量'], ['平成27', '昼間']),
    heavy: findColumn(labels, ['大型車混入率'], ['平成27']),
    length: findColumn(labels, ['区間延長']),
  };
  const need = ['section', 'roadType', 'route', 'place', 'v24'];
  const missing = need.filter((k) => col[k] < 0);
  if (missing.length) throw new Error(`箇所別基本表の列を特定できません: ${missing.join(', ')}\n見出し: ${labels.slice(0, 80).map((l, i) => i + ':' + l).join(' | ')}`);
  const out = [];
  for (let i = first; i < rows.length; i++) {
    const c = rows[i].map(nfkc);
    if (!isNumericCell(c[0]) || !isNumericCell(c[col.section])) continue;
    out.push({
      code: col.code >= 0 ? c[col.code] : null, section: c[col.section], roadType: num(c[col.roadType]), route: c[col.route], routeName: col.routeName >= 0 ? c[col.routeName] : null,
      place: c[col.place], city: col.city >= 0 ? c[col.city] : null, observed: col.observed >= 0 ? num(c[col.observed]) : null, obsHours: col.obsHours >= 0 ? num(c[col.obsHours]) : null,
      date: col.date >= 0 ? c[col.date] : null, v12: col.v12 >= 0 ? num(c[col.v12]) : null, v24: num(c[col.v24]), heavy: col.heavy >= 0 ? num(c[col.heavy]) : null, lengthKm: col.length >= 0 ? num(c[col.length]) : null,
    });
  }
  return { sections: out, columns: Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i >= 0 ? labels[i] : null])) };
}

const keyOf = (r, withCode) => [withCode ? r.code : '', r.roadType, r.route, r.section].join('|');

/**
 * 区間ごとの「上下線・小型＋大型」の時間帯別合計。観測（1）かつ24時間観測（2）で、合計の検算が合う区間だけ。
 * @returns {{sections: object[], skipped: {reason:string, key:string}[]}}
 */
export function hourlyBySection(zk, kasyo) {
  // 箇所別基本表に都道府県指定市コードの列が無ければ、道路種別・路線番号・区間番号で結ぶ（重複したら使わない）
  const withCode = kasyo.sections.length > 0 && kasyo.sections.every((s) => s.code);
  const key = (r) => keyOf(r, withCode);
  const byKey = new Map();
  for (const r of zk.rows) { const k = key(r); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const info = new Map(), dup = new Set();
  for (const s of kasyo.sections) { const k = key(s); if (info.has(k)) dup.add(k); info.set(k, s); }
  const out = [], skipped = [];
  for (const [k, rows] of byKey) {
    const r0 = rows[0];
    if (dup.has(k) || new Set(rows.map((r) => r.code)).size > 1) { skipped.push({ reason: '区間の対応が一意でない', key: k }); continue; }
    if (r0.observed !== 1) { skipped.push({ reason: '非観測（推定値）', key: k }); continue; }
    if (r0.obsHours !== 2) { skipped.push({ reason: '12時間観測（夜間は観測していない）', key: k }); continue; }
    if (!rows.every((r) => r.sumsOk)) { skipped.push({ reason: '時間帯別の和が12h/24h合計と一致しない', key: k }); continue; }
    const dirs = new Set(rows.map((r) => r.dir));
    if (![...dirs].every((d) => rows.some((r) => r.dir === d && r.vehicle === 1) && rows.some((r) => r.dir === d && r.vehicle === 2))) { skipped.push({ reason: '車種区分が欠けている', key: k }); continue; }
    const hourly = new Array(24).fill(0);
    for (const r of rows) for (let h = 0; h < 24; h++) hourly[h] += r.hourly[h];
    const s = info.get(k);
    if (!s) { skipped.push({ reason: '箇所別基本表に無い区間', key: k }); continue; }
    out.push({ key: k, ...s, code: r0.code, roadTypeName: ROAD_TYPES[s.roadType] || null, date: r0.date, weather: r0.weather, directions: dirs.size, hourly, v24Hourly: hourly.reduce((a, x) => a + x, 0) });
  }
  return { sections: out, skipped };
}
