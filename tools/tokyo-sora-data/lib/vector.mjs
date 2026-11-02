// 道路（tran）・土地利用（luse）など面データ → GeoJSON（経度・緯度, JGD2011 ≒ WGS84）。
// 実形状の外周・内周をそのまま出す。コードは元の値とコードリストのファイル名を残す（ラベル化はコードリストがある場合のみ）。
import { bboxIntersects } from './mesh.mjs';

const ROAD_ATTRS = ['function', 'usage', 'class', 'widthType', 'width', 'numberOfLanes', 'sectionType', 'roadType', 'name'];
const LUSE_ATTRS = ['class', 'usage', 'function', 'name', 'orgLandUse', 'nominalArea', 'areaInSquareMeter'];

const round = (v) => Math.round(v * 1e7) / 1e7;

function ringToLonLat(r) {
  const out = [];
  for (let i = 0; i < r.length; i += 3) out.push([round(r[i + 1]), round(r[i])]);
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out;
}
function ringBBox(r) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < r.length; i += 3) { const lat = r[i], lon = r[i + 1]; if (lon < a) a = lon; if (lon > c) c = lon; if (lat < b) b = lat; if (lat > d) d = lat; }
  return [a, b, c, d];
}

/**
 * @param {object[]} features parseCityGML の features
 * @param {{kind:'road'|'landuse', bbox?:number[], codelists?:Map<string,Map<string,string>>, source:string, fileVariant?:string|null}} o
 */
export function polygonsToGeoJSON(features, o) {
  const keys = o.kind === 'road' ? ROAD_ATTRS : LUSE_ATTRS;
  const out = [];
  for (const f of features) {
    if (o.kind === 'road' && !['Road', 'Track', 'Square', 'Railway'].includes(f.type)) continue;
    if (o.kind === 'landuse' && f.type !== 'LandUse') continue;
    // 最も詳細なLODだけを使う（TrafficArea等があればLOD2/3）
    const lods = [...new Set(f.polys.map((p) => p.lod))].filter((l) => l != null).sort((a, b) => b - a);
    const lod = lods[0];
    const polys = f.polys.filter((p) => p.lod === lod && p.rings.length);
    if (!polys.length) continue;
    const props = { id: f.id, type: f.type, lod, source: o.source };
    for (const k of keys) if (f.attrs[k] != null) {
      props[k] = f.attrs[k];
      const cs = f.attrs[k + '@codeSpace'];
      if (cs) {
        props[k + 'CodeList'] = cs.split('/').pop();
        const label = o.codelists?.get(props[k + 'CodeList'])?.get(String(f.attrs[k]));
        if (label) props[k + 'Label'] = label;
      }
    }
    if (o.kind === 'landuse') props.park = (o.fileVariant && /park/i.test(o.fileVariant)) || /公園|緑地/.test(props.classLabel || props.usageLabel || '') || undefined;
    for (const p of polys) {
      const bb = ringBBox(p.rings[0]);
      if (o.bbox && !bboxIntersects(bb, o.bbox)) continue;
      out.push({ type: 'Feature', properties: { ...props, surface: p.surface || undefined }, geometry: { type: 'Polygon', coordinates: p.rings.map(ringToLonLat) } });
    }
  }
  return out;
}

/** PLATEAUのコードリスト（gml:Dictionary）を Map(code → label) に */
export function parseCodelist(xml) {
  const m = new Map();
  const re = /<gml:Definition\b[\s\S]*?<\/gml:Definition>/g;
  let r;
  while ((r = re.exec(xml))) {
    const name = /<gml:name>([\s\S]*?)<\/gml:name>/.exec(r[0]), desc = /<gml:description>([\s\S]*?)<\/gml:description>/.exec(r[0]);
    if (name && desc) m.set(name[1].trim(), desc[1].trim());
  }
  return m;
}
