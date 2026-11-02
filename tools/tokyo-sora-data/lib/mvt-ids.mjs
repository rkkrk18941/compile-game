// ゲームが現在表示している PLATEAU 建物（2020年度 MVT）の「建物ID」を集める。
// manifest の replaces には、ここで実在が確認できたIDだけを入れる（座標が近いだけでは消さない）。
// city.js の PLATEAU_URL と同じタイル。GitHub Pages に届かない環境では同じリポジトリの raw を使う。
import fs from 'node:fs';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { download } from './fetch.mjs';

export const GAME_PLATEAU_MVT = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf';
export const GAME_PLATEAU_MVT_MIRROR = 'https://raw.githubusercontent.com/indigo-lab/plateau-tokyo23ku-building-mvt-2020/main/{z}/{x}/{y}.pbf';

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };

/**
 * bbox内の z16 タイルから「建物ID → リング数」を集める。
 * @returns {Promise<{ids: Map<string, number>, tiles: {z:number,x:number,y:number,url:string|null,features:number}[], template:string|null}>}
 */
export async function collectPlateauMvtIds(bbox, o = {}) {
  const z = 16, templates = o.templates || [GAME_PLATEAU_MVT, GAME_PLATEAU_MVT_MIRROR];
  const ids = new Map(), tiles = [];
  let used = null;
  for (let y = lat2y(bbox[3], z); y <= lat2y(bbox[1], z); y++) for (let x = lon2x(bbox[0], z); x <= lon2x(bbox[2], z); x++) {
    let got = null, url = null;
    for (const t of used ? [used] : templates) {
      url = t.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      try { got = await download(url, { accept404: true, retries: 1, offline: o.offline }); if (got !== undefined) { used = t; break; } }
      catch { got = null; }
    }
    if (!got) { tiles.push({ z, x, y, url: null, features: 0 }); continue; }
    const vt = new VectorTile(new Pbf(fs.readFileSync(got.file)));
    const l = vt.layers.bldg;
    let n = 0;
    for (let i = 0; l && i < l.length; i++) {
      const f = l.feature(i), id = f.properties['建物ID'];
      if (!id) continue;
      let rings = 0; try { rings = f.loadGeometry().length; } catch { /* ignore */ }
      ids.set(String(id), Math.max(ids.get(String(id)) || 0, rings));
      n++;
    }
    tiles.push({ z, x, y, url, features: n });
  }
  return { ids, tiles, template: used };
}

/** ゲーム側の ID 規則（worker.js）: PLATEAU は 'P'+建物ID、複数ポリゴンの地物は '#番号' が付く */
export function replaceIdsFor(buildingId, rings) {
  const out = ['P' + buildingId];
  for (let k = 0; k < Math.max(0, rings > 1 ? rings : 0); k++) out.push('P' + buildingId + '#' + k);
  return out;
}
