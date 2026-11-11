// The survey helicopter: drop-off at the start, pickup on request. Flies a climb-cruise-
// descend profile over the terrain, banks into turns, spins the rotors with a blur disc.
import * as THREE from "three";
import { patchMaterial } from "../gfx/shaderlib.js";

export class Helicopter {
  constructor(engine, terrain) {
    this.engine = engine;
    this.t = terrain;
    this.root = new THREE.Group();
    this.state = "parked";     // parked | takeoff | away | inbound | landing | waiting | departing
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.bank = 0;
    this.pitch = 0;
    this.rotor = 0;            // 0..1 spin
    this.target = null;
    this.timer = 0;
    this.eta = 0;
    this.home = new THREE.Vector3();
    this.boarded = false;
  }

  async load(loader, csm) {
    const gltf = await loader.glb("props/heli.glb");
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      const m = new THREE.MeshPhysicalMaterial({
        color: old.color, roughness: old.roughness, metalness: old.metalness,
        clearcoat: /paint|orange/.test(old.name) ? 0.6 : 0, clearcoatRoughness: 0.25,
        emissive: old.emissive || new THREE.Color(0), emissiveIntensity: 3,
      });
      if (/glass/.test(old.name)) { m.roughness = 0.04; m.metalness = 0.2; m.envMapIntensity = 2; }
      m.name = old.name;
      patchMaterial(m, { csm });
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.body = gltf.scene.getObjectByName("heli_body");
    this.main = gltf.scene.getObjectByName("heli_rotor");
    this.tail = gltf.scene.getObjectByName("heli_tail");
    this.root.add(gltf.scene);
    // translucent blur disc for the spinning rotor
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.1, 48), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    if (this.main) { disc.position.copy(this.main.position); disc.position.y += 0.03; }
    this.root.add(disc);
    this.disc = disc;
  }

  placeAt(p, yaw) {
    this.pos.set(p.x, this.t.heightAt(p.x, p.z), p.z);
    this.home.copy(this.pos);
    this.yaw = yaw;
    this.state = "parked";
    this.rotor = 0.9;
    this.sync();
  }

  /** Fly away (after dropping the team). */
  leave() { this.state = "takeoff"; this.timer = 0; }

  /** Request pickup at a landing spot. eta in seconds. */
  call(spot) {
    this.target = spot.clone();
    const startDist = this.state === "away" ? 900 : this.pos.distanceTo(spot);
    if (this.state === "away" || this.state === "departing") {
      // reappear offshore to the south-east
      this.pos.set(spot.x + 650, 90, spot.z + 700);
    }
    this.state = "inbound";
    this.eta = 18 + startDist / 42;
    this.timer = 0;
  }

  get landed() { return this.state === "waiting"; }

  update(dt) {
    const p = this.pos;
    this.timer += dt;
    const groundAt = (x, z) => Math.max(this.t.heightAt(x, z), 0);
    let spinTarget = 1;
    switch (this.state) {
      case "parked":
        spinTarget = 0.9;
        break;
      case "takeoff": {
        p.y += Math.min(this.timer, 4) * 2.2 * dt;
        if (this.timer > 4) { this.state = "departing"; this.timer = 0; }
        break;
      }
      case "departing": {
        const dir = new THREE.Vector3(0.7, 0, 0.7).normalize();
        this.fly(p.clone().addScaledVector(dir, 200).setY(groundAt(p.x, p.z) + 90), dt, 45);
        if (this.timer > 25) { this.state = "away"; this.root.visible = false; }
        break;
      }
      case "away":
        spinTarget = 0;
        this.root.visible = false;
        return;
      case "inbound": {
        this.root.visible = true;
        const tg = this.target;
        const d2 = Math.hypot(tg.x - p.x, tg.z - p.z);
        const cruise = Math.max(groundAt(p.x, p.z), groundAt(tg.x, tg.z)) + 55;
        if (d2 > 40) this.fly(new THREE.Vector3(tg.x, cruise, tg.z), dt, Math.min(45, 8 + d2 * 0.35));
        else { this.state = "landing"; this.timer = 0; }
        break;
      }
      case "landing": {
        const tg = this.target;
        const gy = groundAt(tg.x, tg.z) + (this.t.heightAt(tg.x, tg.z) < 0.2 ? 1.2 : 0);
        this.fly(new THREE.Vector3(tg.x, Math.max(gy, p.y - 7 * dt), tg.z), dt, 6);
        if (p.y - gy < 0.15) { p.y = gy; this.state = "waiting"; this.timer = 0; }
        break;
      }
      case "waiting":
        spinTarget = 0.85;
        if (this.timer > 75 && !this.boarded) { this.state = "takeoff"; this.timer = 0; }
        break;
    }
    // attitude follows velocity
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 1) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 1.2));
      this.bank += (THREE.MathUtils.clamp(-d * 1.2, -0.45, 0.45) - this.bank) * (1 - Math.exp(-dt * 2));
    } else this.bank *= 1 - dt * 2;
    this.pitch += (THREE.MathUtils.clamp(speed / 45, 0, 1) * 0.22 - this.pitch) * (1 - Math.exp(-dt * 1.5));
    this.rotor += (spinTarget - this.rotor) * (1 - Math.exp(-dt * 0.6));
    if (this.main) this.main.rotation.y += this.rotor * dt * 42;
    if (this.tail) this.tail.rotation.x += this.rotor * dt * 160;
    if (this.disc) this.disc.material.opacity = THREE.MathUtils.smoothstep(this.rotor, 0.4, 0.9) * 0.18;
    this.sync();
  }

  fly(goal, dt, maxSpeed) {
    const p = this.pos;
    const to = goal.clone().sub(p);
    const d = to.length();
    const want = to.normalize().multiplyScalar(Math.min(maxSpeed, d * 0.8 + 1));
    this.vel.lerp(want, 1 - Math.exp(-dt * 0.9));
    p.addScaledVector(this.vel, dt);
    const floor = Math.max(this.t.heightAt(p.x, p.z), 0) + (this.state === "landing" || this.state === "takeoff" ? 0 : 25);
    if (p.y < floor) p.y += (floor - p.y) * (1 - Math.exp(-dt * 2));
  }

  sync() {
    this.root.position.copy(this.pos);
    // the model faces -Z in its own frame (Blender -Y); rotate so the nose follows yaw
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(this.yaw + Math.PI);
    this.root.rotateX(-this.pitch);
    this.root.rotateZ(this.bank);
  }

  snapshot() { return [this.state, +this.pos.x.toFixed(1), +this.pos.y.toFixed(1), +this.pos.z.toFixed(1), +this.yaw.toFixed(2), this.target ? [this.target.x, this.target.z] : null, Math.round(this.eta - this.timer)]; }
  applySnapshot(s) {
    this.state = s[0];
    this.pos.set(s[1], s[2], s[3]);
    this.yaw = s[4];
    if (s[5]) this.target = new THREE.Vector3(s[5][0], 0, s[5][1]);
    this.root.visible = this.state !== "away";
  }
}

/** Find an open spot near p for the helicopter to set down. */
export function findLandingSpot(terrain, foliage, p, extra = []) {
  const ok = (x, z) => {
    const h = terrain.heightAt(x, z);
    if (h < 0.25) return false;
    if (terrain.slopeAt(x, z) > 14 || terrain.slopeAt(x + 4, z) > 16 || terrain.slopeAt(x - 4, z) > 16) return false;
    const cols = foliage.collidersNear(x, z, []);
    for (const c of cols) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 9) ** 2) return false;
    for (const c of extra) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 8) ** 2) return false;
    // trees nearby (big instances without colliders are covered by foliage colliders)
    return true;
  };
  if (ok(p.x, p.z)) return new THREE.Vector3(p.x, 0, p.z);
  for (let r = 6; r < 170; r += 6) {
    for (let a = 0; a < Math.PI * 2; a += 6 / r) {
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (ok(x, z)) return new THREE.Vector3(x, 0, z);
    }
  }
  return null;
}
