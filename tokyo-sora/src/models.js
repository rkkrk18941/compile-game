// Procedural low-poly models for traffic cars, player vehicles and pedestrians.
import * as THREE from 'three';

// merge [geometry, hexColor, extraAttrs] parts into one non-indexed geometry with vertex colours
export function mergeParts(parts) {
  const geos = parts.map(([g, color, extra]) => {
    const n = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color);
    const cnt = n.attributes.position.count;
    const cols = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    n.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (extra) for (const k in extra) { const a = new Float32Array(cnt); a.fill(extra[k]); n.setAttribute(k, new THREE.BufferAttribute(a, 1)); }
    return n;
  });
  const names = ['position', 'normal', 'color'];
  for (const k in (parts[0][2] || {})) names.push(k);
  const total = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize, arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, o * size); o += g.attributes.position.count; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// box whose top face is narrowed (sloped windscreens / tapered cabins)
const TB = (w, h, d, x, y, z, topD, shiftZ, topW) => {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setZ(i, p.getZ(i) * topD + shiftZ); p.setX(i, p.getX(i) * (topW || 1)); }
  g.computeVertexNormals();
  return g.translate(x, y, z);
};
const wheel = (x, y, z, r, w) => new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, y, z);
const BODY = '#ffffff', GLASS = '#1d242c', TIRE = '#141414', TRIM = '#3a3d40';

// Cars face -Z. Returns {body, lights} geometries. Body parts in white take the instance colour.
export function carModel(kind) {
  const p = [], l = [];
  const W = '#fff6dc', R = '#ff2a1f';
  if (kind === 'truck') {
    p.push([B(2.1, 1.25, 1.7, 0, 1.15, -2.55), BODY], [B(2.0, 0.8, 0.08, 0, 1.55, -3.41), GLASS], [B(2.2, 2.5, 4.6, 0, 1.8, 0.75), '#eeeeea'], [B(2.15, 0.35, 6.9, 0, 0.45, -0.3), TRIM]);
    for (const [x, z] of [[-0.95, -2.55], [0.95, -2.55], [-0.95, 1.6], [0.95, 1.6], [-0.95, 2.5], [0.95, 2.5]]) p.push([wheel(x, 0.45, z, 0.45, 0.32), TIRE]);
    l.push([B(0.35, 0.2, 0.05, -0.75, 0.85, -3.42), W], [B(0.35, 0.2, 0.05, 0.75, 0.85, -3.42), W], [B(0.3, 0.2, 0.05, -0.9, 0.7, 3.07), R], [B(0.3, 0.2, 0.05, 0.9, 0.7, 3.07), R]);
    return { body: mergeParts(p), lights: mergeParts(l), len: 6.9, wid: 2.2, h: 3 };
  }
  if (kind === 'bus') {
    p.push([B(2.45, 2.6, 10.6, 0, 1.65, 0), BODY], [B(2.5, 0.95, 9.6, 0, 2.15, 0.1), GLASS], [B(2.3, 1.0, 0.06, 0, 2.0, -5.32), GLASS], [B(2.47, 0.3, 10.62, 0, 0.55, 0), '#2c8a4a']);
    for (const [x, z] of [[-1.05, -3.4], [1.05, -3.4], [-1.05, 3.4], [1.05, 3.4]]) p.push([wheel(x, 0.5, z, 0.5, 0.35), TIRE]);
    l.push([B(0.4, 0.2, 0.05, -0.85, 0.75, -5.33), W], [B(0.4, 0.2, 0.05, 0.85, 0.75, -5.33), W], [B(0.3, 0.3, 0.05, -1.0, 0.9, 5.32), R], [B(0.3, 0.3, 0.05, 1.0, 0.9, 5.32), R]);
    return { body: mergeParts(p), lights: mergeParts(l), len: 10.6, wid: 2.5, h: 3.2 };
  }
  if (kind === 'kei') {
    p.push([TB(1.48, 0.75, 3.35, 0, 0.62, 0, 0.94, 0.05), BODY], [TB(1.42, 0.78, 2.4, 0, 1.38, 0.2, 0.9, 0.08, 0.96), GLASS], [B(1.34, 0.07, 2.1, 0, 1.8, 0.3), BODY], [B(1.5, 0.2, 3.38, 0, 0.32, 0), TRIM]);
    for (const [x, z] of [[-0.66, -1.1], [0.66, -1.1], [-0.66, 1.1], [0.66, 1.1]]) p.push([wheel(x, 0.3, z, 0.3, 0.22), TIRE]);
    l.push([B(0.3, 0.16, 0.05, -0.52, 0.8, -1.69), W], [B(0.3, 0.16, 0.05, 0.52, 0.8, -1.69), W], [B(0.2, 0.25, 0.05, -0.62, 0.85, 1.69), R], [B(0.2, 0.25, 0.05, 0.62, 0.85, 1.69), R]);
    return { body: mergeParts(p), lights: mergeParts(l), len: 3.4, wid: 1.5, h: 1.8 };
  }
  if (kind === 'sport') {
    p.push([TB(1.92, 0.5, 4.4, 0, 0.5, 0, 0.92, 0.12, 0.96), BODY], [TB(1.72, 0.42, 2.3, 0, 0.96, 0.4, 0.5, 0.2, 0.84), GLASS], [B(1.38, 0.05, 1.1, 0, 1.18, 0.6), BODY],
      [B(1.95, 0.16, 4.45, 0, 0.27, 0), TRIM], [B(1.7, 0.05, 0.34, 0, 1.02, 2.08), TRIM], [B(0.08, 0.26, 0.08, -0.62, 0.86, 2.08), TRIM], [B(0.08, 0.26, 0.08, 0.62, 0.86, 2.08), TRIM]);
    for (const [x, z] of [[-0.85, -1.35], [0.85, -1.35], [-0.85, 1.4], [0.85, 1.4]]) p.push([wheel(x, 0.33, z, 0.33, 0.28), TIRE]);
    l.push([B(0.45, 0.1, 0.05, -0.6, 0.6, -2.21), W], [B(0.45, 0.1, 0.05, 0.6, 0.6, -2.21), W], [B(0.5, 0.1, 0.05, -0.55, 0.62, 2.21), R], [B(0.5, 0.1, 0.05, 0.55, 0.62, 2.21), R]);
    return { body: mergeParts(p), lights: mergeParts(l), len: 4.4, wid: 1.95, h: 1.25 };
  }
  // sedan / taxi
  p.push([TB(1.78, 0.68, 4.6, 0, 0.62, 0, 0.97, 0.03), BODY], [TB(1.64, 0.6, 2.6, 0, 1.25, 0.2, 0.74, 0.12, 0.92), GLASS], [B(1.46, 0.07, 1.86, 0, 1.58, 0.29), BODY], [B(1.8, 0.18, 4.64, 0, 0.33, 0), TRIM]);
  if (kind === 'taxi') p.push([B(0.5, 0.22, 0.2, 0, 1.73, 0.1), '#ffd23a']);
  for (const [x, z] of [[-0.8, -1.45], [0.8, -1.45], [-0.8, 1.4], [0.8, 1.4]]) p.push([wheel(x, 0.33, z, 0.33, 0.24), TIRE]);
  l.push([B(0.38, 0.14, 0.05, -0.6, 0.78, -2.31), W], [B(0.38, 0.14, 0.05, 0.6, 0.78, -2.31), W], [B(0.4, 0.16, 0.05, -0.62, 0.8, 2.31), R], [B(0.4, 0.16, 0.05, 0.62, 0.8, 2.31), R]);
  return { body: mergeParts(p), lights: mergeParts(l), len: 4.6, wid: 1.8, h: 1.6 };
}

// Tank: hull + turret (separate so the turret can turn). Faces -Z.
export function tankModel() {
  const OL = '#5d6b3a', DK = '#3f4a28', TR = '#2a2a26';
  const hull = mergeParts([
    [B(3.4, 1.0, 6.8, 0, 1.0, 0), OL], [B(3.0, 0.5, 5.6, 0, 1.7, 0.2), OL], [B(3.5, 0.25, 1.2, 0, 1.45, -3.0), DK],
    [B(0.75, 1.0, 7.2, -1.55, 0.55, 0), TR], [B(0.75, 1.0, 7.2, 1.55, 0.55, 0), TR],
    ...[-2.6, -1.3, 0, 1.3, 2.6].flatMap((z) => [[wheel(-1.55, 0.5, z, 0.48, 0.8), '#1c1c1a'], [wheel(1.55, 0.5, z, 0.48, 0.8), '#1c1c1a']]),
  ]);
  const turret = mergeParts([
    [B(2.6, 0.85, 3.2, 0, 0.42, 0.3), OL], [B(1.2, 0.35, 1.0, 0.6, 1.0, 0.9), DK], [new THREE.CylinderGeometry(0.42, 0.42, 0.25, 10).translate(-0.6, 0.95, 0.9), DK],
  ]);
  const barrel = mergeParts([[new THREE.CylinderGeometry(0.13, 0.17, 5.2, 10).rotateX(Math.PI / 2).translate(0, 0, -2.6), DK], [new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10).rotateX(Math.PI / 2).translate(0, 0, -5.0), DK]]);
  return { hull, turret, barrel };
}

// Fighter jet facing -Z.
export function jetModel() {
  const G = '#8c96a0', D = '#5e6670', C = '#2b3d52';
  const body = new THREE.CylinderGeometry(0.75, 0.95, 12, 12).rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.75, 3.5, 12).rotateX(-Math.PI / 2).translate(0, 0, -7.75);
  const wing = (s) => { const g = new THREE.BufferGeometry(); const v = new Float32Array([0, 0, -2.2, 6.2 * s, 0, 2.4, 0, 0, 4.0, 0, 0, -2.2, 0, 0, 4.0, 6.2 * s, 0, 2.4]); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.computeVertexNormals(); return g; };
  const wingT = (s) => { const g = wing(s); g.translate(0, 0.02, 0); return g; };
  const tail = (s) => { const g = new THREE.BufferGeometry(); const v = new Float32Array([0, 0, 3.2, 0, 3.0, 5.6, 0, 0, 6.0, 0, 0, 3.2, 0, 0, 6.0, 0, 3.0, 5.6]); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.rotateZ(s * 0.35); g.translate(s * 0.9, 0.4, 0); g.computeVertexNormals(); return g; };
  const stab = (s) => { const g = new THREE.BufferGeometry(); const v = new Float32Array([0, 0, 4.4, 2.8 * s, 0, 6.6, 0, 0, 6.6, 0, 0, 4.4, 0, 0, 6.6, 2.8 * s, 0, 6.6]); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.translate(0, -0.1, 0); g.computeVertexNormals(); return g; };
  const geo = mergeParts([
    [body, G], [nose, D], [new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 2.6).translate(0, 0.62, -3.8), C],
    [wing(1), G], [wing(-1), G], [wingT(1), D], [wingT(-1), D], [tail(1), D], [tail(-1), D], [stab(1), G], [stab(-1), G],
    [new THREE.CylinderGeometry(0.62, 0.7, 0.8, 12).rotateX(Math.PI / 2).translate(0, 0, 6.2), '#2a2a2a'],
  ]);
  return geo;
}

// Pedestrian (1.7 m), with per-vertex part (0 skin,1 shirt,2 pants,3 hair,4 shoes) and limb (0 body,1 legL,2 legR,3 armL,4 armR)
export function personModel() {
  const P = (g, part, limb) => [g, '#ffffff', { aPart: part, aLimb: limb }];
  return mergeParts([
    P(B(0.17, 0.82, 0.2, -0.11, 0.49, 0), 2, 1), P(B(0.17, 0.82, 0.2, 0.11, 0.49, 0), 2, 2),
    P(B(0.18, 0.1, 0.28, -0.11, 0.05, -0.04), 4, 1), P(B(0.18, 0.1, 0.28, 0.11, 0.05, -0.04), 4, 2),
    P(B(0.46, 0.62, 0.26, 0, 1.2, 0), 1, 0),
    P(B(0.12, 0.6, 0.14, -0.3, 1.18, 0), 1, 3), P(B(0.12, 0.6, 0.14, 0.3, 1.18, 0), 1, 4),
    P(B(0.1, 0.1, 0.1, -0.3, 0.83, 0), 0, 3), P(B(0.1, 0.1, 0.1, 0.3, 0.83, 0), 0, 4),
    P(new THREE.IcosahedronGeometry(0.13, 1).translate(0, 1.63, 0), 0, 0),
    P(new THREE.IcosahedronGeometry(0.135, 1).scale(1, 0.6, 1).translate(0, 1.71, 0.02), 3, 0),
  ]);
}
