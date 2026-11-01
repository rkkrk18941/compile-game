// World coordinates: Web Mercator scaled to true metres at Tokyo's latitude.
//   X = east, Y = up (metres), Z = south. Origin = Tokyo Station.
export const R_EARTH = 6371000;
const EQ_C = 2 * Math.PI * 6378137;
export const ORIGIN_LAT = 35.681236, ORIGIN_LON = 139.767125;
export const K = Math.cos(ORIGIN_LAT * Math.PI / 180);
export const WORLD = EQ_C * K; // world units across the whole Mercator square

export function latToY01(lat) {
  const s = Math.sin(lat * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
export function y01ToLat(y) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI; }
const OX = (ORIGIN_LON + 180) / 360;
const OY = latToY01(ORIGIN_LAT);

export const wx01 = (x) => x / WORLD + OX;
export const wy01 = (z) => z / WORLD + OY;
export function llToWorld(lat, lon) { return [((lon + 180) / 360 - OX) * WORLD, (latToY01(lat) - OY) * WORLD]; }
export function worldToLL(x, z) { return [y01ToLat(wy01(z)), wx01(x) * 360 - 180]; }
export const tileSize = (z) => WORLD / Math.pow(2, z);
export function tileBounds(z, x, y) {
  const n = Math.pow(2, z), s = WORLD / n;
  const x0 = (x / n - OX) * WORLD, z0 = (y / n - OY) * WORLD;
  return [x0, z0, x0 + s, z0 + s];
}
export function tileAt(z, wx, wz) {
  const n = Math.pow(2, z);
  return [Math.floor(wx01(wx) * n), Math.floor(wy01(wz) * n)];
}
// distance (horizontal) from point to tile rectangle
export function distToRect(px, pz, x0, z0, x1, z1) {
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
  return Math.sqrt(dx * dx + dz * dz);
}
