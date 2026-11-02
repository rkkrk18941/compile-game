// PLATEAU CityGML（i-UR拡張のCityGML 2.0）をストリーミングで読む最小パーサ。
// 名前空間の接頭辞やi-URの版に依存しないよう、要素はローカル名で判定する。
//
// 取り出すもの:
//   - 地物（cityObjectMember直下）: 種別・gml:id・単純属性（measuredHeight, buildingID, usage など）
//   - 面（gml:Polygon）: LOD・どの境界面（RoofSurface等）か・外周/内周リング（緯度,経度,標高）・リングのgml:id
//   - 三角形（地形TIN の gml:Triangle）
//   - 外観（app:Appearance）: ParameterizedTexture（画像URIと、面ID→リングID→UV）、X3DMaterial（面ID→色）
// 座標は EPSG:6697（緯度・経度・T.P.標高）/ EPSG:6668（緯度・経度）のファイル内の値そのまま。変換は geometry.mjs で行う。
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { SaxesParser } from 'saxes';

const LOD_RE = /^lod(\d)([A-Z]\w*)$/;
const SURFACES = new Set(['RoofSurface', 'WallSurface', 'GroundSurface', 'ClosureSurface', 'OuterCeilingSurface', 'OuterFloorSurface',
  'TrafficArea', 'AuxiliaryTrafficArea', 'WaterSurface', 'WaterGroundSurface', 'WaterClosureSurface']);
const PARTS = new Set(['BuildingPart', 'BridgePart', 'BuildingInstallation', 'BridgeInstallation', 'BridgeConstructionElement', 'TunnelPart']);
// 内部空間（LOD4の部屋など）は外観に不要
const INTERIOR = new Set(['interiorRoom', 'Room', 'IntBuildingInstallation', 'interiorBuildingInstallation', 'interiorBridgeRoom', 'BridgeRoom',
  'InteriorWallSurface', 'FloorSurface', 'CeilingSurface', 'roomInstallation', 'interiorFurniture']);
const NO_ATTR = new Set(['posList', 'pos', 'coordinates', 'lowerCorner', 'upperCorner', 'textureCoordinates', 'imageURI', 'theme', 'value']);

/**
 * @param {string|Buffer} input ファイルパス（.gml / .gml.zst / .gml.gz）または中身
 * @param {{maxLod?:number, keepAttrs?:boolean}} [opts]
 */
export async function parseCityGML(input, opts = {}) {
  const maxLod = opts.maxLod ?? 3;
  const out = { envelope: null, srsName: null, srsDimension: null, features: [], appearances: [] };
  const parser = new SaxesParser({ xmlns: false, position: false });
  const stack = []; // {name, text, kids}
  let feature = null, featureDepth = -1, memberDepth = -1;
  const lodStack = [], surfStack = [], partStack = [];
  let interiorDepth = -1;
  let poly = null, ringRole = null, ringId = null, ringPts = null;
  let tri = null;
  let app = null, tex = null, target = null, mat = null;
  let genName = null;
  let posDim = null;

  const local = (q) => { const i = q.indexOf(':'); return i < 0 ? q : q.slice(i + 1); };
  const num = (s) => { const t = s.trim(); if (!t) return []; const a = t.split(/\s+/); const r = new Float64Array(a.length); for (let i = 0; i < a.length; i++) r[i] = +a[i]; return r; };
  const dims = (attrs) => +(attrs.srsDimension || 0) || posDim || out.srsDimension || 3;
  const wantGeom = () => {
    if (!feature || interiorDepth >= 0) return false;
    const l = lodStack[lodStack.length - 1];
    return !l || l.lod <= maxLod;
  };

  parser.on('opentag', (tag) => {
    const name = local(tag.name), a = tag.attributes;
    const parent = stack[stack.length - 1];
    if (parent) parent.kids++;
    stack.push({ name, text: '', kids: 0, attrs: a });
    const depth = stack.length - 1;

    if (name === 'cityObjectMember') { memberDepth = depth; return; }
    if (memberDepth >= 0 && depth === memberDepth + 1 && !feature) {
      feature = { type: name, id: a['gml:id'] || null, attrs: {}, polys: [], tris: [], parts: [] };
      featureDepth = depth; return;
    }
    if (name === 'Envelope' && !feature && !out.envelope) { out.srsName = a.srsName || null; if (a.srsDimension) out.srsDimension = +a.srsDimension; }

    // ---------- appearance (in a feature or at the CityModel level) ----------
    if (name === 'Appearance') { app = { theme: null, textures: [], materials: [] }; return; }
    if (app) {
      if (name === 'ParameterizedTexture' || name === 'GeoreferencedTexture') { tex = { kind: name, image: null, mime: null, wrap: null, targets: [] }; return; }
      if (name === 'X3DMaterial') { mat = { diffuse: null, transparency: 0, targets: [] }; return; }
      if (name === 'target' && tex) { target = { poly: (a.uri || '').replace(/^#/, ''), rings: [] }; return; }
      if (name === 'textureCoordinates' && target) { target.ringNext = (a.ring || '').replace(/^#/, ''); return; }
      return;
    }
    if (!feature) return;

    if (INTERIOR.has(name) && interiorDepth < 0) interiorDepth = depth;
    const lm = LOD_RE.exec(name);
    if (lm) { lodStack.push({ lod: +lm[1], prop: name, depth }); return; }
    if (name === 'tin' || name === 'TINRelief') { if (name === 'tin') lodStack.push({ lod: 1, prop: 'tin', depth }); return; }
    if (SURFACES.has(name)) { surfStack.push({ type: name, id: a['gml:id'] || null, depth }); return; }
    if (PARTS.has(name)) { partStack.push({ type: name, id: a['gml:id'] || null, depth }); feature.parts.push({ type: name, id: a['gml:id'] || null }); return; }
    if (name === 'stringAttribute' || name === 'intAttribute' || name === 'doubleAttribute' || name === 'measureAttribute' || name === 'dateAttribute' || name === 'uriAttribute') { genName = a.name || null; return; }

    if (!wantGeom()) { if (name === 'posList' || name === 'pos') stack[depth].skip = true; return; }
    if (name === 'Polygon' || name === 'Triangle' || name === 'Rectangle') {
      const l = lodStack[lodStack.length - 1], s = surfStack[surfStack.length - 1], p = partStack[partStack.length - 1];
      const kind = name === 'Triangle' && l && l.prop === 'tin' ? 'tri' : 'poly';
      const o = { id: a['gml:id'] || null, rings: [], ringIds: [], lod: l ? l.lod : null, prop: l ? l.prop : null, surface: s ? s.type : null, surfaceId: s ? s.id : null, part: p ? p.id : null };
      if (kind === 'tri') tri = o; else poly = o;
      return;
    }
    if ((poly || tri) && (name === 'exterior' || name === 'interior' || name === 'outerBoundaryIs' || name === 'innerBoundaryIs')) { ringRole = name === 'exterior' || name === 'outerBoundaryIs' ? 'ext' : 'int'; return; }
    if ((poly || tri) && name === 'LinearRing') { ringId = a['gml:id'] || null; ringPts = []; return; }
    if (name === 'posList' || name === 'pos') { posDim = +(a.srsDimension || 0) || posDim; }
  });

  // 子要素を持つ要素の空白は不要なので、子がまだない要素の文字だけをためる
  parser.on('text', (t) => { const top = stack[stack.length - 1]; if (top && top.kids === 0 && !top.skip) top.text += t; });

  parser.on('closetag', () => {
    const el = stack.pop();
    const name = el.name, depth = stack.length;
    if (name === 'cityObjectMember') { memberDepth = -1; return; }

    if (name === 'lowerCorner' || name === 'upperCorner') {
      if (!feature && !out.envelope?.[name]) { out.envelope = out.envelope || {}; out.envelope[name] = Array.from(num(el.text)); }
      return;
    }

    if (app) {
      if (name === 'theme') app.theme = el.text.trim();
      else if (tex && name === 'imageURI') tex.image = el.text.trim();
      else if (tex && name === 'mimeType') tex.mime = el.text.trim();
      else if (tex && name === 'wrapMode') tex.wrap = el.text.trim();
      else if (target && name === 'textureCoordinates') target.rings.push([target.ringNext, num(el.text)]);
      else if (tex && name === 'target' && target) { tex.targets.push(target); target = null; }
      else if (mat && name === 'diffuseColor') mat.diffuse = Array.from(num(el.text));
      else if (mat && name === 'transparency') mat.transparency = +el.text.trim() || 0;
      else if (mat && name === 'target') mat.targets.push(el.text.trim().replace(/^#/, ''));
      else if (name === 'ParameterizedTexture' || name === 'GeoreferencedTexture') { if (tex) app.textures.push(tex); tex = null; }
      else if (name === 'X3DMaterial') { if (mat) app.materials.push(mat); mat = null; }
      else if (name === 'Appearance') { out.appearances.push(app); app = null; }
      return;
    }
    if (!feature) return;

    if (depth === featureDepth) {
      out.features.push(feature);
      feature = null; featureDepth = -1; lodStack.length = 0; surfStack.length = 0; partStack.length = 0; interiorDepth = -1;
      return;
    }
    if (interiorDepth === depth) interiorDepth = -1;
    if (lodStack.length && lodStack[lodStack.length - 1].depth === depth) { lodStack.pop(); return; }
    if (surfStack.length && surfStack[surfStack.length - 1].depth === depth) { surfStack.pop(); return; }
    if (partStack.length && partStack[partStack.length - 1].depth === depth) { partStack.pop(); return; }

    const g = poly || tri;
    if (g) {
      if (name === 'posList' && ringPts) { ringPts.push(num(el.text)); ringPts.dim = dims(el.attrs); return; }
      if (name === 'pos' && ringPts) { ringPts.push(num(el.text)); ringPts.dim = dims(el.attrs); return; }
      if (name === 'LinearRing' && ringPts) {
        let flat;
        if (ringPts.length === 1) flat = ringPts[0];
        else { let n = 0; for (const p of ringPts) n += p.length; flat = new Float64Array(n); let o = 0; for (const p of ringPts) { flat.set(p, o); o += p.length; } }
        const d = ringPts.dim || 3;
        const n = Math.floor(flat.length / d), pts = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) { pts[i * 3] = flat[i * d]; pts[i * 3 + 1] = flat[i * d + 1]; pts[i * 3 + 2] = d >= 3 ? flat[i * d + 2] : 0; }
        if (ringRole === 'int') { g.rings.push(pts); g.ringIds.push(ringId); }
        else { g.rings.unshift(pts); g.ringIds.unshift(ringId); }
        ringPts = null; ringId = null; return;
      }
      if ((name === 'Polygon' || name === 'Rectangle') && poly) { if (poly.rings.length) feature.polys.push(poly); poly = null; return; }
      if (name === 'Triangle' && tri) { if (tri.rings.length) feature.tris.push(tri.rings[0]); tri = null; return; }
      return;
    }

    // simple attributes (leaf elements outside geometry)
    if (opts.keepAttrs !== false && el.kids === 0) {
      const v = el.text.trim();
      if (!v) return;
      if (name === 'value' && genName) { if (!('gen:' + genName in feature.attrs)) feature.attrs['gen:' + genName] = v; return; }
      if (NO_ATTR.has(name)) return;
      if (!(name in feature.attrs)) {
        feature.attrs[name] = v;
        if (el.attrs.codeSpace) feature.attrs[name + '@codeSpace'] = el.attrs.codeSpace;
        if (el.attrs.uom) feature.attrs[name + '@uom'] = el.attrs.uom;
      }
    }
    if (name.endsWith('Attribute') && genName) genName = null;
  });

  let err = null;
  parser.on('error', (e) => { err = e; });
  const stream = toTextStream(input);
  for await (const chunk of stream) { parser.write(chunk); if (err) throw err; }
  parser.close();
  if (err) throw err;
  if (!out.srsDimension && out.srsName) out.srsDimension = /6668$/.test(out.srsName) ? 2 : 3;
  return out;
}

function toTextStream(input) {
  if (Buffer.isBuffer(input) || typeof input !== 'string') {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return Readable.from([buf.toString('utf8')]);
  }
  let s = fs.createReadStream(input);
  if (/\.zst$/i.test(input)) s = s.pipe(zlib.createZstdDecompress());
  else if (/\.gz$/i.test(input)) s = s.pipe(zlib.createGunzip());
  s.setEncoding('utf8');
  return s;
}

/**
 * 外観を面ID索引にする。theme は 'rgbTexture' を優先し、なければ最初のテーマ。
 * @returns {{theme:string|null, textures: {image:string,mime:string|null,wrap:string|null}[], byPoly: Map<string,{tex:number, rings: Map<string, Float64Array>}>, colorByPoly: Map<string,{diffuse:number[], transparency:number}>}}
 */
export function indexAppearance(appearances, preferTheme = 'rgbTexture') {
  const themes = [...new Set(appearances.map((a) => a.theme))];
  // PLATEAUは通常 rgbTexture。FME出力では FMETheme などになるため、優先テーマが無いときは全テーマを使う（先勝ち）
  const theme = themes.includes(preferTheme) ? preferTheme : themes.length ? themes.join('|') : null;
  const textures = [], byPoly = new Map(), colorByPoly = new Map();
  for (const ap of appearances) {
    if (themes.includes(preferTheme) && ap.theme !== preferTheme) continue;
    for (const t of ap.textures) {
      if (!t.image || t.kind !== 'ParameterizedTexture') continue;
      const ti = textures.push({ image: t.image, mime: t.mime, wrap: t.wrap }) - 1;
      for (const tg of t.targets) {
        if (!tg.poly) continue;
        const rings = new Map();
        for (const [rid, uv] of tg.rings) if (!rings.has(rid)) rings.set(rid, uv);
        if (!byPoly.has(tg.poly)) byPoly.set(tg.poly, { tex: ti, rings });
      }
    }
    for (const m of ap.materials) for (const id of m.targets) if (m.diffuse && !colorByPoly.has(id)) colorByPoly.set(id, { diffuse: m.diffuse, transparency: m.transparency });
  }
  return { theme, textures, byPoly, colorByPoly };
}
