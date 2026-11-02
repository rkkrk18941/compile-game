// 木々：カメラの周りに配置するインスタンス描画。森の分布は地面のシェーダーと同じ関数。
import * as THREE from 'three';
import { landAt, groundH, roadAt, riverAt, heightAt } from './world.js';
import { hash2, mulberry32, clamp } from './noise.js';

const CELL = 40;

function crownGeo(kind, seed, distant = false) {
  const rng = mulberry32(seed);
  const parts = [];
  let cc;
  if (kind === 0) {
    // 広葉樹：細い幹 + 大きく丸い樹冠（高さ1の単位）
    parts.push([new THREE.CylinderGeometry(0.016, 0.03, 0.46, 6).translate(0, 0.23, 0), 0]);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rng();
      const b = new THREE.CylinderGeometry(0.006, 0.012, 0.22, 4).translate(0, 0.11, 0);
      b.rotateZ(0.7); b.rotateY(a); b.translate(0, 0.36, 0);
      parts.push([b, 0]);
    }
    cc = [0, 0.66, 0];
    const n = distant ? 4 : 9;
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry((distant ? 0.21 : 0.15) + rng() * 0.07, distant ? 0 : 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const s = 0.88 + rng() * 0.24; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.9, p.getZ(k) * s); }
      const a = (i / n) * Math.PI * 2 + rng() * 0.6, r = i === 0 ? 0 : 0.17 + rng() * 0.08;
      const y = i === 0 ? 0.8 : 0.52 + rng() * 0.26;
      g.translate(Math.cos(a) * r, y, Math.sin(a) * r);
      parts.push([g, 1]);
    }
  } else {
    // 針葉樹：細い幹 + 重ねた円錐
    parts.push([new THREE.CylinderGeometry(0.01, 0.02, 0.3, 5).translate(0, 0.15, 0), 0]);
    cc = [0, 0.5, 0];
    for (let i = 0; i < (distant ? 4 : 6); i++) {
      const r = 0.2 - i * (distant ? 0.045 : 0.03), h = (distant ? 0.4 : 0.3) - i * 0.025;
      const g = new THREE.ConeGeometry(r, h, distant ? 5 : 9, 1, true);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) { const s = 0.8 + rng() * 0.35; p.setXYZ(k, p.getX(k) * s, p.getY(k) + (rng() - 0.5) * 0.04, p.getZ(k) * s); }
      g.translate(0, 0.14 + i * 0.14 + h / 2, 0);
      parts.push([g, 1]);
    }
  }
  // 結合（色は頂点カラー）。樹冠の法線は樹冠の中心から外向きにして、ふんわり見せる
  const pos = [], nor = [], col = [], hgt = [];
  const tmp = new THREE.Color();
  for (const [g0, isLeaf] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      pos.push(x, y, z);
      if (isLeaf) {
        let rx = x - cc[0], ry = (y - cc[1]) * (kind ? 0.35 : 1), rz = z - cc[2];
        if (kind) ry += 0.25;
        const l = Math.hypot(rx, ry, rz) || 1;
        nor.push(n.getX(i) * 0.25 + (rx / l) * 0.75, n.getY(i) * 0.25 + (ry / l) * 0.75, n.getZ(i) * 0.25 + (rz / l) * 0.75);
        const v = 0.7 + 0.45 * rng() + (y - cc[1]) * 0.6;
        if (kind === 0) tmp.setRGB(0.05 * v, 0.085 * v, 0.024 * v); else tmp.setRGB(0.022 * v, 0.05 * v, 0.03 * v);
      } else { nor.push(n.getX(i), n.getY(i), n.getZ(i)); tmp.setRGB(0.07, 0.05, 0.035); }
      col.push(tmp.r, tmp.g, tmp.b);
      hgt.push(isLeaf ? 1 : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(hgt, 1));
  // The merged geometry owns its copied attributes; release temporary pieces.
  for (const [part] of parts) part.dispose();
  return g;
}

function treeMaterial(engine) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = engine.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aLeaf; attribute vec4 iTree;\nvarying float vLeaf; varying vec4 vTree;')
      .replace('#include <begin_vertex>', `vec3 transformed = position;
        float sway = (sin(uTime*1.3 + iTree.y*6.28) + 0.5*sin(uTime*2.7 + iTree.y*11.0)) * 0.012 * position.y * position.y;
        transformed.x += sway; transformed.z += sway*0.6;
        vLeaf = aLeaf; vTree = iTree;`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb *= mix(vec3(1.0), vec3(1.15,1.0,0.75), iTree.z) * (0.85 + 0.3*iTree.y);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf; varying vec4 vTree;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02,0.018,0.015), vTree.w);');
  };
  m.customProgramCacheKey = () => 'tree';
  return m;
}

export class Flora {
  constructor(engine, max) {
    this.engine = engine;
    this.max = max;
    this.mat = treeMaterial(engine);
    this.kinds = [crownGeo(0, 3), crownGeo(1, 7), crownGeo(0, 3, true), crownGeo(1, 7, true)];
    this.meshes = this.kinds.map((g, lod) => {
      const geo = g.clone();
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iTree', attr);
      const mesh = new THREE.InstancedMesh(geo, this.mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = lod < 2; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      engine.scene.add(mesh);
      return mesh;
    });
    this.cells = new Map();
    this.center = { x: 1e9, z: 1e9 };
    this.fallen = new Map();
    this.burnt = new Map();
    this.radius = engine.q.treeRadius || 900;
    this.pending = null;
  }
  cellTrees(cx, cz) {
    const k = cx * 100003 + cz;
    let c = this.cells.get(k);
    if (c) return c;
    c = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    const L = [0, 0, 0, 0];
    const h0 = heightAt(x0 + CELL / 2, z0 + CELL / 2);
    landAt(x0 + CELL / 2, z0 + CELL / 2, h0, L);
    const fo = L[0] < 0.12 ? 0 : L[0];
    const dens = fo * 9 + 0.05 * (1 - L[1]) * (1 - L[2]) + L[3] * 1.2;
    const rng = mulberry32((cx * 73856093) ^ (cz * 19349663));
    const n = Math.floor(dens + rng());
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * CELL, z = z0 + rng() * CELL;
      const h = groundH(x, z);
      landAt(x, z, h, L);
      if (L[2] > 0.15) continue;
      const rd = roadAt(x, z, 9); if (rd && rd.d < 7) continue;
      const rv = riverAt(x, z, 80); if (rv && rv.d < rv.w * 0.5 + 3) continue;
      if (L[0] < 0.12 && rng() > 0.5 + L[3]) continue;
      const conifer = h > 470 ? rng() < 0.8 : rng() < 0.18;
      const height = conifer ? 22 + rng() * 14 : 16 + rng() * 13;
      c.push({ x, z, y: h - 0.4, kind: conifer ? 1 : 0, s: height, rot: rng() * 6.28, v: rng(), autumn: rng() < 0.25 ? rng() * 0.6 : 0, key: k * 64 + i });
    }
    this.cells.set(k, c);
    if (this.cells.size > 9000) this.cells.clear();
    return c;
  }
  update(tx, tz, force = false, radius) {
    if (radius === 1) {
      for (const mesh of this.meshes) mesh.count = 0;
      this.pending = null; this.center = { x: tx, z: tz }; this.dirty = false;
      this.engine.uniforms.uFlora.value.set(tx, tz, 1);
      return;
    }
    if (radius) this.radius = Math.min(radius, this.engine.q.treeRadius || radius);
    if (this.pending && Math.hypot(tx - this.pending.tx, tz - this.pending.tz) > this.radius * 0.6) this.pending = null;
    if (!this.pending) {
      if (!force && Math.hypot(tx - this.center.x, tz - this.center.z) < 64 && !this.dirty) return;
      const R = this.radius, cells = [];
      for (let cz = Math.floor((tz - R) / CELL); cz <= Math.floor((tz + R) / CELL); cz++) {
        for (let cx = Math.floor((tx - R) / CELL); cx <= Math.floor((tx + R) / CELL); cx++) {
          const d2 = ((cx + 0.5) * CELL - tx) ** 2 + ((cz + 0.5) * CELL - tz) ** 2;
          if (d2 < R * R) cells.push({ cx, cz, d2 });
        }
      }
      cells.sort((a, b) => a.d2 - b.d2);
      this.pending = { tx, tz, cells, cursor: 0, trees: [], R };
      this.dirty = false;
    }
    // Generate at most a handful of cells before yielding. Commit all instance
    // transforms together, so the forest never disappears between updates.
    const job = this.pending, start = performance.now();
    let processed = 0;
    while (job.cursor < job.cells.length && processed < 12) {
      if (processed && performance.now() - start >= 2) break;
      const c = job.cells[job.cursor++];
      for (const t of this.cellTrees(c.cx, c.cz)) {
        const d2 = (t.x - job.tx) ** 2 + (t.z - job.tz) ** 2;
        if (d2 < job.R * job.R) job.trees.push({ t, d2 });
      }
      processed++;
      if (job.trees.length >= this.max + 100) break;
    }
    if (job.cursor < job.cells.length && job.trees.length < this.max + 100) return;
    job.trees.sort((a, b) => a.d2 - b.d2);
    job.trees.length = Math.min(job.trees.length, this.max);
    const R = job.trees.length >= this.max ? Math.min(job.R, Math.sqrt(job.trees.at(-1).d2)) : job.R;
    const cnt = [0, 0, 0, 0];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const { t, d2 } of job.trees) {
      const dd = Math.sqrt(d2), lod = t.kind + (dd > (this.engine.q.treeNear || 80) ? 2 : 0);
      const mesh = this.meshes[lod], i = cnt[lod];
      const f = this.fallen.get(t.key);
      if (f) { q.copy(f.q); p.set(t.x, t.y + 0.6, t.z); }
      else { q.setFromAxisAngle(up, t.rot); p.set(t.x, t.y, t.z); }
      const fade = 1 - clamp((dd - R * 0.76) / Math.max(1, R * 0.24), 0, 1);
      if (fade <= 0.02) continue;
      const k = Math.sqrt(fade);
      sc.set(t.s * (t.kind ? 0.55 : 0.85) * k, t.s * k, t.s * (t.kind ? 0.55 : 0.85) * k);
      mesh.setMatrixAt(i, m.compose(p, q, sc));
      mesh.geometry.attributes.iTree.setXYZW(i, t.s, t.v, t.autumn, this.burnt.get(t.key) || (f ? 0.25 : 0));
      cnt[lod]++;
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = cnt[k]; mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceMatrix.clearUpdateRanges(); if (cnt[k]) mesh.instanceMatrix.addUpdateRange(0, cnt[k] * 16);
      const attr = mesh.geometry.attributes.iTree;
      attr.needsUpdate = true; attr.clearUpdateRanges(); if (cnt[k]) attr.addUpdateRange(0, cnt[k] * 4);
    });
    this.engine.uniforms.uFlora.value.set(job.tx, job.tz, R);
    this.center = { x: job.tx, z: job.tz }; this.pending = null;
  }

  // 巨獣が踏み倒す・焼く
  knock(x, z, r, dirx, dirz, burn) {
    let any = 0;
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL), c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = this.cells.get(cx * 100003 + cz); if (!c) continue;
      for (const t of c) {
        if ((t.x - x) ** 2 + (t.z - z) ** 2 > r * r) continue;
        if (burn) { this.burnt.set(t.key, Math.max(this.burnt.get(t.key) || 0, burn)); any++; continue; }
        if (this.fallen.has(t.key)) continue;
        const dl = Math.hypot(dirx, dirz) || 1, jx = dirx / dl + (Math.random() - 0.5) * 0.6, jz = dirz / dl + (Math.random() - 0.5) * 0.6;
        const axis = new THREE.Vector3(jz, 0, -jx).normalize();
        const qq = new THREE.Quaternion().setFromAxisAngle(axis, 1.42 + Math.random() * 0.12).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot));
        this.fallen.set(t.key, { q: qq });
        any++;
      }
    }
    if (any) this.dirty = true;
    return any;
  }
}
