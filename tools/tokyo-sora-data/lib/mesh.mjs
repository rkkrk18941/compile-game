// JIS X 0410 地域メッシュ（標準地域メッシュ）のコード⇔範囲の変換。
// PLATEAUのCityGMLは、建築物などが3次メッシュ（8桁）、地形・土地利用などが2次メッシュ（6桁）単位で
// ファイル分割されている。1/2・1/4地域メッシュ（9・10桁）にも対応する。

const LAT1 = 2 / 3, LON1 = 1;            // 1次: 40分 × 1度
const LAT2 = LAT1 / 8, LON2 = LON1 / 8;  // 2次: 5分 × 7分30秒
const LAT3 = LAT2 / 10, LON3 = LON2 / 10; // 3次: 30秒 × 45秒

/** メッシュコード → [minLon, minLat, maxLon, maxLat]（度） */
export function meshBounds(code) {
  const c = String(code);
  if (!/^\d{4}(\d{2}(\d{2}(\d(\d)?)?)?)?$/.test(c)) throw new Error('invalid mesh code: ' + code);
  let lat = Number(c.slice(0, 2)) * LAT1, lon = Number(c.slice(2, 4)) + 100, dlat = LAT1, dlon = LON1;
  if (c.length >= 6) { lat += Number(c[4]) * LAT2; lon += Number(c[5]) * LON2; dlat = LAT2; dlon = LON2; }
  if (c.length >= 8) { lat += Number(c[6]) * LAT3; lon += Number(c[7]) * LON3; dlat = LAT3; dlon = LON3; }
  for (let i = 8; i < c.length; i++) {
    const q = Number(c[i]);
    if (q < 1 || q > 4) throw new Error('invalid sub-mesh digit in ' + code);
    dlat /= 2; dlon /= 2;
    if (q >= 3) lat += dlat;          // 3,4 = 北
    if (q === 2 || q === 4) lon += dlon; // 2,4 = 東
  }
  return [lon, lat, lon + dlon, lat + dlat];
}

/** 緯度経度 → 指定桁数のメッシュコード */
export function meshCode(lat, lon, digits = 8) {
  const p = Math.floor(lat / LAT1), u = Math.floor(lon - 100);
  let r = lat - p * LAT1, s = lon - 100 - u;
  let code = String(p).padStart(2, '0') + String(u).padStart(2, '0');
  if (digits >= 6) {
    const q = Math.floor(r / LAT2), v = Math.floor(s / LON2);
    code += q + '' + v; r -= q * LAT2; s -= v * LON2;
  }
  if (digits >= 8) {
    const q = Math.floor(r / LAT3), v = Math.floor(s / LON3);
    code += q + '' + v; r -= q * LAT3; s -= v * LON3;
  }
  let dlat = LAT3, dlon = LON3;
  for (let i = 8; i < digits; i++) {
    dlat /= 2; dlon /= 2;
    const n = r >= dlat ? 1 : 0, e = s >= dlon ? 1 : 0;
    code += String(1 + e + 2 * n);
    if (n) r -= dlat; if (e) s -= dlon;
  }
  return code;
}

/** bbox [minLon,minLat,maxLon,maxLat] と交差するメッシュコード一覧 */
export function meshesInBBox(bbox, digits = 8) {
  const [x0, y0, x1, y1] = bbox;
  const dlat = digits >= 8 ? LAT3 / Math.pow(2, digits - 8) : digits >= 6 ? LAT2 : LAT1;
  const dlon = digits >= 8 ? LON3 / Math.pow(2, digits - 8) : digits >= 6 ? LON2 : LON1;
  const out = new Set();
  const eps = 1e-12;
  for (let lat = y0; lat < y1 + dlat; lat += dlat) for (let lon = x0; lon < x1 + dlon; lon += dlon) {
    const la = Math.min(lat, y1 - eps), lo = Math.min(lon, x1 - eps);
    out.add(meshCode(la, lo, digits));
  }
  return [...out].sort();
}

/** PLATEAUのファイル名（例: 53394611_bldg_6697_op.gml）からメッシュコードと地物型を取り出す */
export function parsePlateauFileName(name) {
  const base = String(name).split(/[\\/]/).pop().replace(/\.gml(\.(zst|gz))?$/i, '');
  const m = /^(\d{6,10})_([a-z]+)_(\d{4,5})(?:_(.+))?_op\d*$/i.exec(base);
  if (!m) return null;
  return { mesh: m[1], type: m[2], crs: m[3], variant: m[4] || null };
}

export function bboxIntersects(a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
