// The handheld scanner: picks the plant or animal under the reticle and accumulates
// research data while the scan is held.
import * as THREE from "three";
import { SPECIES_BY_ID } from "./data.js";

// trees whose instances are research targets
const TREE_TARGETS = { palm: { y: 6, r: 1.2, range: 30 }, pandanus: { y: 2.5, r: 1.2, range: 22 }, buttress: { y: 3, r: 2.5, range: 40 },
  mangrove: { y: 2.5, r: 1.2, range: 26 }, treefern: { y: 3, r: 1.0, range: 24 } };
const GROUND_TARGETS = { alocasia: { y: 0.6, r: 0.6, range: 14 }, morningglory: { y: 0.1, r: 0.8, range: 12 } };

export class Scanner {
  constructor(foliage, ground, fauna, world) {
    this.foliage = foliage;
    this.ground = ground;
    this.fauna = fauna;
    this.world = world;
    this.target = null;
    this.hold = 0;
    this._list = [];
  }

  candidates(p) {
    const out = this._list;
    out.length = 0;
    for (const S of this.foliage.species) {
      const def = TREE_TARGETS[S.def.id];
      if (!def) continue;
      const cx = Math.floor(p.x / 64), cz = Math.floor(p.z / 64);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const list = S.cells.get((cx + dx) + "," + (cz + dz));
        if (!list) continue;
        for (const k of list) {
          const inst = S.instances[k];
          const d = Math.hypot(inst.x - p.x, inst.z - p.z);
          if (d < def.range) out.push({ species: S.def.id, x: inst.x, y: inst.y + def.y * inst.s, z: inst.z, r: def.r * inst.s, range: def.range });
        }
      }
    }
    for (const T of this.ground.types) {
      const def = GROUND_TARGETS[T.def.id];
      if (!def) continue;
      const ti = this.ground.types.indexOf(T);
      for (const tile of this.ground.tiles.values()) {
        if (Math.abs(tile.tx * 16 + 8 - p.x) > 30 || Math.abs(tile.tz * 16 + 8 - p.z) > 30) continue;
        for (const arr of tile.data[ti] || []) {
          for (let i = 0; i < arr.length; i += 16) {
            const x = arr[i + 12], y = arr[i + 13], z = arr[i + 14];
            if (Math.hypot(x - p.x, z - p.z) < def.range) out.push({ species: T.def.id, x, y: y + def.y, z, r: def.r, range: def.range });
          }
        }
      }
    }
    for (const s of this.world.specimens) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      const range = s.species === "heart" ? 140 : 16;
      if (d < range) out.push({ species: s.species, x: s.pos.x, y: s.pos.y + (s.species === "heart" ? 0 : s.y), z: s.pos.z, r: s.radius, range });
    }
    for (const c of this.fauna.list) {
      if (!c.root.visible) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      const range = c.id === "booby" ? 120 : 55;
      if (d < range) out.push({ species: c.id, x: c.pos.x, y: c.pos.y + (c.id === "denkui" ? 1.6 : c.id === "booby" ? 0 : 0.35) * c.scale, z: c.pos.z, r: c.id === "denkui" ? 1.2 : c.id === "booby" ? 1.2 : 0.7, range, creature: c });
    }
    return out;
  }

  /** Returns the target under the reticle (or null). */
  pick(camera, playerPos) {
    const list = this.candidates(playerPos);
    const o = camera.position;
    const f = _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    let best = null, bestScore = 1e9;
    for (const c of list) {
      _v.set(c.x - o.x, c.y - o.y, c.z - o.z);
      const d = _v.length();
      if (d > c.range + 4) continue;
      const along = _v.dot(f);
      if (along <= 0) continue;
      const off = Math.sqrt(Math.max(0, d * d - along * along));
      const tol = c.r + d * 0.045;
      if (off > tol) continue;
      const score = off / tol + d * 0.004;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }
}

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export function researchRate(target) {
  const sp = SPECIES_BY_ID[target.species];
  if (!sp) return 0;
  let rate = 1 / sp.need;
  if (target.creature && sp.bonus && target.creature.behaviour === sp.bonus) rate *= 2.5;
  return rate;
}
