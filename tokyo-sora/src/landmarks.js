// Hand-built models for Tokyo Tower and Tokyo Skytree (replacing their OSM footprints).
import * as THREE from 'three';
import { llToWorld } from './geo.js';
import { addCurvature } from './shaders.js';

export const TOWER_LL = [35.658581, 139.745433];
export const SKYTREE_LL = [35.710063, 139.810700];

// ---- merged-geometry helper ----
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nrm, col) { // a,b,c,d counter-clockwise seen from outside
    const v = this.p.length / 3;
    for (const q of [a, b, c, d]) { this.p.push(q.x, q.y, q.z); this.n.push(nrm.x, nrm.y, nrm.z); this.c.push(col.r, col.g, col.b); }
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  beam(a, b, w, col) { // square beam from a to b
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length(); if (len < 1e-3) return;
    d.divideScalar(len);
    const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w / 2);
    const v = new THREE.Vector3().crossVectors(u, d).normalize().multiplyScalar(w / 2);
    const P = (base, su, sv) => base.clone().addScaledVector(u, su).addScaledVector(v, sv);
    const a00 = P(a, -1, -1), a10 = P(a, 1, -1), a11 = P(a, 1, 1), a01 = P(a, -1, 1);
    const b00 = P(b, -1, -1), b10 = P(b, 1, -1), b11 = P(b, 1, 1), b01 = P(b, -1, 1);
    const nu = u.clone().normalize(), nv = v.clone().normalize();
    this.quad(a10, b10, b11, a11, nu, col);
    this.quad(a01, b01, b00, a00, nu.clone().negate(), col);
    this.quad(a11, b11, b01, a01, nv, col);
    this.quad(a00, b00, b10, a10, nv.clone().negate(), col);
  }
  box(cx, cy, cz, sx, sy, sz, col) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), V(0, 0, 1), col);
    this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), V(0, 0, -1), col);
    this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), V(1, 0, 0), col);
    this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), V(-1, 0, 0), col);
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), V(0, 1, 0), col);
    this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), V(0, -1, 0), col);
  }
  cyl(y0, y1, r0, r1, seg, col) {
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const P = (r, y, a) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
      const nm = new THREE.Vector3(Math.sin((a0 + a1) / 2), (r0 - r1) / (y1 - y0), Math.cos((a0 + a1) / 2)).normalize();
      this.quad(P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), nm, col);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

function makeTokyoTower() {
  const orange = new THREE.Color('#e8501f'), white = new THREE.Color('#f1efe8'), glass = new THREE.Color('#33404c');
  const lv = [[0, 41], [22, 33], [44, 26], [68, 20.5], [94, 16.2], [120, 13.1], [145, 11], [160, 10.2], [185, 8.7], [210, 7.3], [233, 6.2], [250, 5.3]];
  const bandColor = (h) => (h < 70 ? orange : Math.floor((h - 70) / 30) % 2 === 0 ? white : orange);
  const b = new Builder();
  const corner = (i, k) => { const [h, w] = lv[i]; const sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1; return new THREE.Vector3(sx * w, h, sz * w); };
  for (let i = 0; i < lv.length - 1; i++) {
    const midH = (lv[i][0] + lv[i + 1][0]) / 2, col = bandColor(midH);
    const t = 2.6 - i * 0.14;
    for (let k = 0; k < 4; k++) {
      b.beam(corner(i, k), corner(i + 1, k), t, col);
      if (i > 0) b.beam(corner(i, k), corner(i, (k + 1) % 4), t * 0.55, col);
      if (i > 0) { // X bracing on each face
        b.beam(corner(i, k), corner(i + 1, (k + 1) % 4), t * 0.38, col);
        b.beam(corner(i, (k + 1) % 4), corner(i + 1, k), t * 0.38, col);
      } else { // open legs: a small arch-like knee brace
        const a = corner(0, k).lerp(corner(1, k), 0.75), c = corner(0, (k + 1) % 4).lerp(corner(1, (k + 1) % 4), 0.75);
        const m = a.clone().lerp(c, 0.5); m.y += 3;
        b.beam(a, m, 1.2, col); b.beam(m, c, 1.2, col);
      }
    }
  }
  const lvTop = lv.length - 1;
  for (let k = 0; k < 4; k++) b.beam(corner(lvTop, k), corner(lvTop, (k + 1) % 4), 1, white);
  // main deck (150 m) and top deck (250 m)
  b.box(0, 147, 0, 25, 6, 25, white); b.box(0, 153.5, 0, 24, 7, 24, glass); b.box(0, 157.7, 0, 25.5, 1.4, 25.5, white);
  b.box(0, 249, 0, 13, 3, 13, white); b.box(0, 252.5, 0, 12, 4, 12, glass); b.box(0, 255, 0, 12.6, 1, 12.6, white);
  // antenna with red/white bands
  let r = 2.8;
  for (let h = 255; h < 333; h += 10) {
    const h1 = Math.min(333, h + 10), r1 = Math.max(0.35, r - 0.32);
    b.cyl(h, h1, r, r1, 10, Math.floor((h - 255) / 10) % 2 ? white : orange);
    r = r1;
  }
  const mat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const mesh = new THREE.Mesh(b.geometry(), mat);
  const g = new THREE.Group(); g.add(mesh);
  g.userData = { mat, nightEmissive: new THREE.Color('#ff7a2a'), nightI: 0.55, top: 333 };
  return g;
}

function skytreeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e9eef2'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(120,138,156,0.85)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.moveTo(128, 0); g.lineTo(0, 128); g.stroke();
  g.lineWidth = 6; g.strokeStyle = 'rgba(150,165,180,0.9)'; g.beginPath(); g.moveTo(0, 64); g.lineTo(128, 64); g.moveTo(0, 0); g.lineTo(128, 0); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeSkytree() {
  // profile: [height, radius]
  const prof = [[0, 37], [40, 30], [100, 24], [170, 19.5], [250, 16], [320, 14], [336, 14], [340, 20.5], [356, 21], [361, 14], [372, 13.2], [440, 12], [444, 15.5], [452, 15.5], [456, 11.2], [497, 9], [503, 5.2], [540, 3.6], [600, 2.4], [634, 1.0]];
  const SEG = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i < prof.length; i++) {
    const [h, r] = prof[i];
    const tri = Math.max(0, 1 - h / 320) * 0.13; // rounded-triangle base turning circular
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rr = r * (1 + tri * Math.cos(3 * a));
      pos.push(Math.sin(a) * rr, h, Math.cos(a) * rr);
      uv.push((s / SEG) * 20, h / 9);
    }
  }
  for (let i = 0; i < prof.length - 1; i++) for (let s = 0; s < SEG; s++) {
    const a = i * (SEG + 1) + s, b2 = a + 1, c = a + SEG + 1, d = c + 1;
    idx.push(a, b2, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = addCurvature(new THREE.MeshLambertMaterial({ map: skytreeTexture(), color: '#ffffff' }));
  const mesh = new THREE.Mesh(g, mat);
  // deck windows
  const b = new Builder(); const glass = new THREE.Color('#2a3846');
  b.cyl(343, 353, 20.9, 21.2, 40, glass); b.cyl(446, 451, 15.7, 15.7, 40, glass);
  const dmat = addCurvature(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const decks = new THREE.Mesh(b.geometry(), dmat);
  const grp = new THREE.Group(); grp.add(mesh, decks);
  grp.userData = { mat, dmat, nightEmissive: new THREE.Color('#5aa8ff'), nightI: 0.5, top: 634 };
  return grp;
}

export class Landmarks {
  constructor(scene, dem) {
    this.dem = dem;
    this.items = [];
    const add = (obj, ll, rot) => {
      const [x, z] = llToWorld(ll[0], ll[1]);
      obj.position.set(x, 0, z); obj.rotation.y = rot || 0;
      scene.add(obj);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
      lamp.position.y = obj.userData.top + 1;
      obj.add(lamp);
      this.items.push({ obj, x, z, lamp, ground: null });
    };
    this.tower = makeTokyoTower();
    this.skytree = makeSkytree();
    add(this.tower, TOWER_LL, 0.2);
    add(this.skytree, SKYTREE_LL, 0.4);
  }
  exclusions() {
    return [
      // building footprints at the landmarks are kept low (FootTown under Tokyo Tower, Solamachi under the Skytree)
      { x: this.items[0].x, z: this.items[0].z, r: 75, minH: 45, clampH: 18 },
      { x: this.items[1].x, z: this.items[1].z, r: 60, minH: 80, clampH: 32 },
    ];
  }
  update(t, night) {
    for (const it of this.items) {
      if (it.ground === null || !it.exact) {
        const exact = this.dem.hasDetail(it.x, it.z);
        it.ground = this.dem.heightAt(it.x, it.z); it.exact = exact;
        it.obj.position.y = it.ground;
      }
      const ud = it.obj.userData;
      ud.mat.emissive.copy(ud.nightEmissive).multiplyScalar(ud.nightI * night);
      if (ud.dmat) ud.dmat.emissive.setRGB(0.9 * night, 0.92 * night, 1.0 * night);
      it.lamp.visible = Math.sin(t * 3.1) > 0 || night < 0.3;
    }
  }
}
