// 公式統計 → 補正係数（tokyo-sora/INTEGRATION.md v1, data/traffic/manifest.json の points）
//
// ゲームは「地図由来の推定」に factor(kind, 位置, 時刻, 平休日) を掛ける（src/integration.js TrafficCalibration）。
// 係数は 0〜4 の無次元。ここでは次の2種類だけを作る:
//
//  1) 時間変化の形（shape）: 観測した24時間の時間別の量 V(h) と、推定の時間変化 m(h)（activity.js）から
//       factor(h) = ( V(h) / 平均V ) / ( m(h) / 平均m )
//     1日の総量は推定のまま（Σ factor·m = Σ m）。その地点の「いつ多いか」だけを観測に合わせる。
//     絶対量（台数・人数）は推定の単位と対応しないので掛けない。日交通量を時間交通量や人数とみなさない。
//
//  2) 駅の規模（level）: 1日の乗降客数 R を、同じ範囲の駅の中央値 R̃ と比べ
//       factor = clamp( sqrt(R / R̃), 0.25, 4 )（全時間同じ値）
//     乗降客数は観測だが、駅周辺の歩行者の多さへの換算は仮定（平方根で緩める）なので basis は 'estimated'。

export const LIMITS = { min: 0, max: 4, radius: [20, 2000] };
const r3 = (v) => Math.round(v * 1000) / 1000;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** 時間変化の形の係数（観測が無い時間は null → 1） */
export function shapeFactors(observed, model) {
  const idx = observed.map((v, h) => (v != null && Number.isFinite(v) ? h : -1)).filter((h) => h >= 0);
  if (idx.length < 6) return null;
  const mo = mean(idx.map((h) => observed[h])), mm = mean(idx.map((h) => model[h]));
  if (!(mo > 0) || !(mm > 0)) return null;
  return observed.map((v, h) => (v == null || !Number.isFinite(v) ? 1 : r3(Math.min(LIMITS.max, Math.max(LIMITS.min, (v / mo) / (model[h] / mm))))));
}

export function stationLevel(riders, median) {
  return r3(Math.min(4, Math.max(0.25, Math.sqrt(riders / median))));
}

export function median(a) { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; }

/** ゲーム側 TrafficCalibration.load と同じ条件で検査し、受理されない点はエラー */
export function validatePoints(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.points)) throw new Error('manifest: version 1 / points[]');
  const curve = (c) => Array.isArray(c) && c.length === 24 && c.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4);
  manifest.points.forEach((p, i) => {
    const at = `points[${i}] ${p.id || ''}`;
    if (!(p.lat >= 20 && p.lat <= 46 && p.lon >= 122 && p.lon <= 154)) throw new Error(at + ': lat/lon');
    if (!(p.radius >= LIMITS.radius[0] && p.radius <= LIMITS.radius[1])) throw new Error(at + ': radius 20〜2000');
    if (!['observed', 'interpolated', 'estimated'].includes(p.basis)) throw new Error(at + ': basis');
    if (typeof p.source !== 'string' || !p.source.trim() || typeof p.license !== 'string' || !p.license.trim() || !Number.isInteger(p.year)) throw new Error(at + ': source/license/year');
    let n = 0;
    for (const kind of ['ped', 'car']) for (const day of ['weekday', 'weekend']) {
      const c = p[kind]?.[day];
      if (c === undefined) continue;
      if (!curve(c)) throw new Error(`${at}: ${kind}.${day} は0〜4の24値`);
      n++;
    }
    if (!n) throw new Error(at + ': 係数が無い');
  });
  return true;
}
