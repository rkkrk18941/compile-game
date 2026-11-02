// PLATEAU配信サービス「CityGML Files API」（試験運用）
//   GET https://api.plateauview.mlit.go.jp/datacatalog/citygml/m:<メッシュコード,...>
// 指定メッシュを含む各市区町村データセットの CityGML ファイルURL（assets.cms.plateau.reearth.io）を返す。
// 仕様: https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/citygml/plateau-citygml.md
//       https://api.plateauview.mlit.go.jp/openapi.json
// スキーマは予告なく変わり得るため、配列・{cities:[]}・単一オブジェクトのいずれでも読めるようにしている。
import { fetchJSON } from './fetch.mjs';

export const API = 'https://api.plateauview.mlit.go.jp/datacatalog/citygml/';

export function normalizeCities(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.cities)) return res.cities;
  if (res.cityCode && res.files) return [res];
  // {<cityCode>: city} 形式
  return Object.values(res).filter((v) => v && typeof v === 'object' && v.files);
}

/**
 * @param {string[]} meshes 3次メッシュ等
 * @param {{types?:string[], year?:number|'latest', log?:Function}} o
 * @returns {Promise<{datasets: object[], files: {type:string, mesh:string, url:string, cityCode:string, cityName:string, year:number, spec:string, maxLod:number|null, features:number|null, fileSize:number|null}[]}>}
 */
export async function listCityGMLFiles(meshes, o = {}) {
  const types = new Set(o.types || ['bldg']);
  const url = API + 'm:' + meshes.join(',');
  const res = await fetchJSON(url, { log: o.log });
  let cities = normalizeCities(res);
  // 同じ市区町村の複数年度があれば最新（または指定年度）だけを使う
  const byCity = new Map();
  for (const c of cities) {
    if (o.year && o.year !== 'latest' && +c.year !== +o.year) continue;
    const prev = byCity.get(c.cityCode);
    if (!prev || +c.year > +prev.year || (+c.year === +prev.year && +c.registrationYear > +prev.registrationYear)) byCity.set(c.cityCode, c);
  }
  cities = [...byCity.values()];
  const files = [];
  const want = new Set(meshes);
  for (const c of cities) {
    for (const [type, list] of Object.entries(c.files || {})) {
      if (!types.has(type)) continue;
      for (const f of list || []) {
        // 2次メッシュ単位のファイル（dem・luse等）は、指定3次メッシュの上位6桁で一致すれば採用
        const code = String(f.code || '');
        const hit = [...want].some((m) => code === m || m.startsWith(code) || code.startsWith(m));
        if (!hit) continue;
        files.push({ type, mesh: code, url: f.url, cityCode: c.cityCode, cityName: c.cityName, year: +c.year, registrationYear: +c.registrationYear || null, spec: c.spec, maxLod: f.maxLod ?? null, features: f.features ?? null, fileSize: f.fileSize ?? null });
      }
    }
  }
  const datasets = cities.map((c) => ({ cityCode: c.cityCode, cityName: c.cityName, year: +c.year, registrationYear: +c.registrationYear || null, spec: c.spec, url: c.url, metadataZipUrls: c.metadataZipUrls || [] }));
  return { datasets, files, query: url };
}
