// Map-derived activity, not measured or live traffic. Kept independent of rendering.
export function poiCategory(p) {
  const c = String(p.class || ''), s = String(p.subclass || p.shop || p.amenity || c);
  if (s === 'convenience') return ['convenience', 'コンビニ', '#13876d', 1.5];
  if (['supermarket', 'mall', 'department_store'].includes(s)) return ['shop', '商業施設', '#c78039', 2];
  if (['station', 'halt', 'subway_entrance', 'railway'].includes(s) || c === 'railway') return ['station', '駅・出入口', '#3478b7', 4];
  if (['park', 'garden', 'nature_reserve', 'playground', 'wood', 'forest'].includes(s)) return ['park', '公園・自然', '#488747', 0.8];
  if (['hospital', 'clinic', 'doctors', 'pharmacy'].includes(s)) return ['health', '医療・薬局', '#bd5270', 0.7];
  if (['school', 'university', 'college', 'kindergarten'].includes(s)) return ['school', '学校', '#916ac0', 1];
  if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food'].includes(s) || ['food', 'cafe', 'restaurant'].includes(c)) return ['food', '飲食店', '#ba7238', 1];
  if (['shop', 'grocery'].includes(c) || p.shop) return ['shop', '店舗', '#c78039', 1];
  return ['place', '施設', '#657c8e', 0.2];
}
export function timeActivity(hour, weekend = false) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return { ped: 0.09, car: 0.22, station: 0.1, park: 0.08 };
  if (h < 7) return { ped: 0.4, car: 0.55, station: 0.5, park: 0.5 };
  if (!weekend && ((h >= 7 && h < 10) || (h >= 17 && h < 20))) return { ped: 1.2, car: 1.15, station: 1.6, park: h < 10 ? 0.7 : 0.4 };
  if (h >= 22) return { ped: 0.28, car: 0.5, station: 0.4, park: 0.12 };
  return { ped: h >= 20 ? 0.6 : 1, car: 0.85, station: 0.9, park: h >= 19 ? 0.2 : weekend ? 1.4 : 1 };
}
// Rates per metre of graph, derived from road class, mapped land use and nearby POIs.
export function edgeActivity(cls, sw, zones, attractions, elevated = false, restricted = false) {
  let ped = cls === 1 || elevated || restricted ? 0 : cls === 8 ? 0.009 : cls <= 5 ? (sw > 0 ? 0.008 : 0) : 0.003;
  let car = restricted || cls >= 8 ? 0 : [0, 0.018, 0.015, 0.013, 0.01, 0.007, 0.0025, 0.0007][cls] || 0;
  let park = false;
  for (const z of zones) {
    if (['commercial', 'retail'].includes(z)) { ped *= 2.5; car *= 1.2; }
    if (z === 'residential') { ped *= 0.7; car *= 0.7; }
    if (['wood', 'forest', 'nature_reserve'].includes(z)) { ped *= 0.3; car *= 0.2; park = true; }
    if (['park', 'garden', 'playground'].includes(z)) { ped *= 1.3; if (cls >= 6) car *= 0.2; park = true; }
    if (z === 'industrial') { ped *= 0.35; car *= 1.1; }
  }
  let station = 0, boost = 0;
  for (const p of attractions) { boost += p.influence; if (p.kind === 'station') station += p.influence; }
  ped *= 1 + Math.min(6, boost);
  return { ped: Math.min(0.12, ped), car, station: Math.min(1, station / 3), park: park ? 1 : 0 };
}
// Clip each polyline segment to the spawn circle, retaining its distance along the edge.
// This prevents a long distant road (or a very finely split one) from dominating spawns.
export class ActivityPool {
  constructor(kind) { this.kind = kind; this.items = []; this.total = 0; this.desired = 0; this.next = 0; this.x = Infinity; this.z = Infinity; }
  update(city, dem, px, pz, radius, hour, weekend, max, dt) {
    this.next -= dt;
    if (this.next > 0 && Math.hypot(px - this.x, pz - this.z) < 35 && this.hour === hour && this.max === max && this.weekend === weekend && this.calibrationRevision === (city.calibration?.revision||0)) return;
    this.calibrationRevision=city.calibration?.revision||0;
    this.next = 2; this.x = px; this.z = pz; this.hour = hour; this.max = max; this.weekend = weekend;
    this.items = []; this.total = 0;
    const tm = timeActivity(hour, weekend), ped = this.kind === 'ped';
    for (const t of city.graphTiles()) {
      if (Math.hypot(t.cx - px, t.cz - pz) > radius + (t.b[2] - t.b[0]) * 0.72) continue;
      const g = t.graph;
      for (let e = 0; e < g.eA.length; e++) {
        const cls = g.eCls[e], base = ped ? g.ePed?.[e] : g.eCar?.[e];
        if (!(base > 0)) continue;
        const rate = base * (ped ? tm.ped * (1 + (g.eStation?.[e] || 0) * (tm.station - 1)) * (g.ePark?.[e] ? tm.park : 1) : tm.car);
        let along = 0;
        for (let j = 1; j < g.eC[e]; j++) {
          const a = (g.eS[e] + j - 1) * 3, b = a + 3;
          const ax = g.pts[a] + t.cx - px, az = g.pts[a + 2] + t.cz - pz, dx = g.pts[b] - g.pts[a], dz = g.pts[b + 2] - g.pts[a + 2];
          const len = Math.hypot(dx, dz); if (len < 0.01) continue;
          const dot = ax * dx + az * dz, disc = dot * dot - len * len * (ax * ax + az * az - radius * radius);
          if (disc > 0 && (!ped || Math.abs(g.pts[a + 1] - dem.heightAt(g.pts[a] + t.cx, g.pts[a + 2] + t.cz)) <= 3)) {
            const r = Math.sqrt(disc), lo = Math.max(0, (-dot - r) / (len * len)), hi = Math.min(1, (-dot + r) / (len * len));
            if (hi > lo) { const middle=(lo+hi)/2,correction=city.calibration?.factor(this.kind,t.cx+g.pts[a]+dx*middle,t.cz+g.pts[a+2]+dz*middle,hour,weekend)??1; const weight = (hi - lo) * len * rate * correction; this.total += weight; this.items.push({ t, e, s: along + lo * len, len: (hi - lo) * len, weight, end: this.total, gv: t.graphVersion, cls }); }
          }
          along += len;
        }
      }
    }
    // max is a GPU budget; density scales the geographic estimate, never fills empty countryside.
    const reference = ped ? 80 : 55;
    this.desired = Math.min(max, Math.round(this.total * max / reference));
  }
  pick(random = Math.random) {
    if (!this.total) return null;
    const r = random() * this.total;
    let lo = 0, hi = this.items.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.items[mid].end < r) lo = mid + 1; else hi = mid; }
    const it = this.items[lo];
    return it && !it.t.dropped && it.t.graph && it.gv === it.t.graphVersion ? { ...it, s: it.s + random() * it.len } : null;
  }
}
