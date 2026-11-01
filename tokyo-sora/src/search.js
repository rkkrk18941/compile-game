import { fetchResource } from './network.js';
// Address / place search: GSI address search (Japanese addresses) + OSM Nominatim (place names).
export async function geocode(q) {
  q = q.trim();
  if (!q) return [];
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (m) {
    let a = +m[1], b = +m[2];
    if (a > 90) [a, b] = [b, a];
    return a>=20&&a<=46&&b>=122&&b<=154 ? [{ name: `北緯${a.toFixed(5)} 東経${b.toFixed(5)}`, lat: a, lon: b, kind: '座標' }] : [];
  }
  const out = [];
  const gsi = fetchResource('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q),{},r=>r.ok?r.json():[]).then((a) => {
    for (const f of (a || []).slice(0, 8)) {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) continue;
      out.push({ name: (f.properties && f.properties.title) || q, lat: +c[1], lon: +c[0], kind: '住所' });
    }
  }).catch(() => {});
  const nom = fetchResource('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ja&countrycodes=jp&q=' + encodeURIComponent(q),{},r=>r.ok?r.json():[]).then((a) => {
    for (const f of (a || [])) {
      const parts = String(f.display_name || '').split(',').map((s) => s.trim());
      const name = parts.slice(0, 3).join(' ');
      out.push({ name: name || q, lat: +f.lat, lon: +f.lon, kind: '地名' });
    }
  }).catch(() => {});
  await Promise.all([gsi, nom]);
  // de-duplicate nearby results, keep addresses first
  const res = [];
  for (const r of out) {
    if (!(r.lat > 20 && r.lat < 46 && r.lon > 122 && r.lon < 154)) continue;
    if (res.some((x) => Math.abs(x.lat - r.lat) < 0.0004 && Math.abs(x.lon - r.lon) < 0.0004)) continue;
    res.push(r);
  }
  return res.slice(0, 10);
}
