// 観測地点の地名（例: 千代田区丸の内１丁目）→ 代表点の緯度経度。
// 国土地理院の住所検索（ゲームの search.js と同じ API）。結果はキャッシュし、どの住所に一致したかを記録する。
// 道路交通センサスの観測地点は「地名」までしか公表されていないため、位置は丁目・町の代表点程度の精度。
// 町名が一致しない・市区町村までしか分からない場合は使わない（遠くの道路を補正しないため）。
import { fetchJSON } from './fetch.mjs';
import { nfkc } from './csv.mjs';

export const GSI_ADDRESS = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';
const KAN = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiNumber(s) {
  if (/^\d+$/.test(s)) return +s;
  let n = 0, cur = 0;
  for (const ch of s) { if (ch === '十') { n += (cur || 1) * 10; cur = 0; } else if (ch in KAN) cur = cur * 10 + KAN[ch]; else return NaN; }
  return n + cur;
}
/** 丁目の数字を算用数字にそろえる */
export function canonical(s) {
  return nfkc(s).replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '').replace(/([〇一二三四五六七八九十]+)丁目/g, (_, k) => kanjiNumber(k) + '丁目');
}
function splitAddress(s) {
  const m = /^((?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)?)(.+?郡.+?[町村]|.+?市.+?区|.+?[市区町村])(.*)$/.exec(s);
  if (!m) return null;
  const rest = m[3];
  const town = rest.replace(/[0-9０-９]+(丁目|番|号|-|－|ー).*$|[0-9０-９]+$/, '');
  const chome = (/^[^0-9]*?(\d+)(?:丁目|-|－|番|$)/.exec(rest) || [])[1] || null;
  return { pref: m[1], city: m[2], town, chome };
}

export function normalizePlace(place, prefName) {
  let q = canonical(place);
  if (prefName && !q.startsWith(prefName)) q = prefName + q;
  return q;
}

/**
 * @returns {Promise<{lat:number, lon:number, matched:string, query:string, precision:'丁目'|'町'} | {error:string, query:string}>}
 */
export async function geocode(place, prefName, o = {}) {
  const query = normalizePlace(place, prefName);
  const qa = splitAddress(query);
  if (!qa || !qa.town) return { error: '地名から町名を読み取れない', query };
  let res;
  try { res = await fetchJSON(GSI_ADDRESS + encodeURIComponent(query), { offline: o.offline, retries: 2 }); }
  catch (e) { return { error: '住所検索に失敗: ' + e.message, query }; }
  if (!Array.isArray(res) || !res.length) return { error: '住所検索の結果なし', query };
  let best = null;
  for (const f of res) {
    const t = canonical(f.properties?.title || ''), ta = splitAddress(t);
    if (!ta || ta.city !== qa.city || !ta.town.startsWith(qa.town) && !qa.town.startsWith(ta.town)) continue;
    if (ta.town !== qa.town) continue;
    const precision = ta.chome && qa.chome === ta.chome ? '丁目' : !ta.chome ? '町' : null;
    if (!precision) continue;
    if (!best || (precision === '丁目' && best.precision !== '丁目')) best = { f, t, precision };
  }
  if (!best) return { error: '町名・丁目が一致する住所が無い', query };
  const [lon, lat] = best.f.geometry.coordinates;
  return { lat, lon, matched: best.t, query, precision: best.precision };
}
