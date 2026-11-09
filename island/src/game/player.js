// The explorer: Blender-made skinned model, animation blending (locomotion + upper-body
// overlays), kinematic movement on the heightfield with trunk collisions, wading and slopes,
// and the third/first-person camera.
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { patchMaterial } from "../gfx/shaderlib.js";

const UPPER = /^(spine|chest|neck|head|shoulder|upperarm|forearm|hand)/;
const SPEED = { walk: 1.45, run: 4.6, crouch: 0.9, wade: 0.85 };

export async function loadExplorer(loader, csm) {
  const gltf = await loader.glb("chars/explorer.glb");
  const tex = async (n, srgb, rep) => {
    const t = await loader.texture(`chars/${n}`, { srgb, aniso: 4 }).catch(() => null);
    if (t && rep) t.repeat.set(rep, rep);
    return t;
  };
  const [fa, fn, la, ln, na, nn, sa, sn] = await Promise.all([
    tex("fabric_albedo.webp", true, 10), tex("fabric_normal.webp", false, 10),
    tex("leather_albedo.webp", true, 6), tex("leather_normal.webp", false, 6),
    tex("nylon_albedo.webp", true, 8), tex("nylon_normal.webp", false, 8),
    tex("skin_albedo.webp", true, 3), tex("skin_normal.webp", false, 3),
  ]);
  const aoMaps = {};
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  await Promise.all(meshes.map(async (m) => {
    const key = m.name.replace(/_\d+$/, "");
    aoMaps[key] = aoMaps[key] || await tex(`ao_${key}.webp`, false, 0);
  }));
  const kinds = {
    cloth: [fa, fn, 0.92], leather: [la, ln, 0.55], nylon: [na, nn, 0.7], skin: [sa, sn, 0.5],
  };
  for (const m of meshes) {
    const key = m.name.replace(/_\d+$/, "");
    const old = m.material;
    const name = old.name || "";
    let k = null;
    if (name.startsWith("cloth") || name === "glove") k = kinds.cloth;
    else if (name.startsWith("leather") || name === "nylon_strap") k = kinds.leather;
    else if (name.startsWith("nylon")) k = kinds.nylon;
    else if (name === "skin") k = kinds.skin;
    const mat = new THREE.MeshStandardMaterial({
      color: old.color, roughness: k ? k[2] : old.roughness, metalness: name === "metal" ? 0.8 : 0,
      map: k ? k[0] : null, normalMap: k ? k[1] : null, aoMap: aoMaps[key] || null, aoMapIntensity: 0.9,
    });
    if (k) mat.normalScale.set(0.7, 0.7);
    mat.name = name;
    if (name === "eye") { mat.roughness = 0.1; }
    patchMaterial(mat, { csm });
    mat.userData.patched = true;
    m.material = mat;
    // only the big silhouette parts cast shadows (fewer draw calls)
    m.castShadow = /cloth_shirt|cloth_pants|nylon_pack|cloth_hat|leather_boot|cloth_vest/.test(name);
    m.receiveShadow = true;
    m.frustumCulled = false;
  }
  return gltf;
}

export class Explorer {
  /** A visual instance (local player or a co-op partner). */
  constructor(gltf, tint, csm) {
    this.root = SkeletonUtils.clone(gltf.scene);
    this.root.traverse((o) => {
      if (o.isMesh) {
        if (tint && (o.material.name === "cloth_vest" || o.material.name === "nylon_pack" || o.material.name === "cloth_hat")) {
          const src = o.material;
          const m = new THREE.MeshStandardMaterial();
          m.copy(src);
          m.color = src.color.clone().multiply(tint);
          patchMaterial(m, { csm });
          o.material = m;
        }
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = {};
    this.actions = {};
    for (const c of gltf.animations) {
      // drop root motion from the hips location except vertical
      this.clips[c.name] = c;
      const lower = c.clone();
      lower.name = c.name + "_lower";
      lower.tracks = c.tracks.filter((t) => !UPPER.test(t.name.split(".")[0]));
      const upper = c.clone();
      upper.name = c.name + "_upper";
      upper.tracks = c.tracks.filter((t) => UPPER.test(t.name.split(".")[0]));
      for (const clip of [lower, upper]) {
        const a = this.mixer.clipAction(clip);
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.play();
        this.actions[clip.name] = a;
      }
    }
    for (const n of ["hurt"]) {
      for (const part of ["_lower", "_upper"]) {
        const a = this.actions[n + part];
        if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      }
    }
    this.weights = {};
    this.head = this.root.getObjectByName("head");
    this.handR = this.root.getObjectByName("handR") || this.root.getObjectByName("hand.R") || null;
    this.root.traverse((o) => { if (o.isBone && /hand/.test(o.name) && /R$/.test(o.name)) this.handR = o; });
  }

  /** Blend weights: { lower: {walk: w...}, upper: {...} } with speed-matched time scale. */
  setPose(lower, upper, speedScale, dt) {
    const k = 1 - Math.exp(-dt * 9);
    const apply = (part, targets) => {
      for (const name in this.clips) {
        const a = this.actions[name + part];
        if (!a) continue;
        const key = name + part;
        const target = targets[name] || 0;
        const w = (this.weights[key] || 0) + (target - (this.weights[key] || 0)) * k;
        this.weights[key] = w;
        a.setEffectiveWeight(w);
        if (name === "walk" || name === "run" || name === "crouch") a.setEffectiveTimeScale(speedScale[name] || 1);
      }
    };
    apply("_lower", lower);
    apply("_upper", upper);
  }

  playOnce(name) {
    for (const part of ["_lower", "_upper"]) {
      const a = this.actions[name + part];
      if (a) { a.reset(); a.play(); }
    }
  }

  update(dt) { this.mixer.update(dt); }
}

export class PlayerController {
  constructor(engine, terrain, foliage, input, explorer) {
    this.engine = engine;
    this.t = terrain;
    this.foliage = foliage;
    this.input = input;
    this.ex = explorer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;          // facing
    this.camYaw = Math.PI;
    this.camPitch = -0.12;
    this.camDist = 3.0;
    this.firstPerson = false;
    this.stamina = 1;
    this.crouch = false;
    this.speed = 0;
    this.onGround = true;
    this.vy = 0;
    this.noise = 0;              // how loud we are (for creatures that hunt by sound)
    this.state = "free";         // free | scan | kneel | radio | down | wave | board
    this.wading = 0;
    this.stepPhase = 0;
    this.onStep = null;
    this.camPos = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.locked = false;
  }

  spawn(x, z, yaw = Math.PI) {
    this.pos.set(x, this.t.heightAt(x, z), z);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;  // camera behind the explorer
    this.camPos.set(0, 0, 0);
    this.ex.root.position.copy(this.pos);
  }

  update(dt) {
    const inp = this.input;
    const look = inp.consumeLook();
    if (!this.locked) {
      this.camYaw -= look.dx;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - look.dy, -1.2, 0.95);
      if (inp.zoom) this.camDist = THREE.MathUtils.clamp(this.camDist + inp.zoom * 0.5, 1.8, 7);
    }
    if (inp.wasPressed("view")) this.firstPerson = !this.firstPerson;
    if (inp.wasPressed("crouch") && !inp.touch) this.crouch = !this.crouch;
    if (inp.touch) this.crouch = !!inp.held.crouch;

    const busy = this.state === "kneel" || this.state === "down" || this.state === "board" || this.state === "radio";
    const ax = this.locked || busy ? { x: 0, y: 0 } : inp.axes();
    const mag = Math.min(1, Math.hypot(ax.x, ax.y));
    const wantRun = (inp.held.sprint || inp.held.sprintStick) && !this.crouch && this.state !== "scan" && this.stamina > 0.05;
    const p = this.pos;
    const ground = this.t.heightAt(p.x, p.z);
    const depth = Math.max(0, -ground);
    this.wading = THREE.MathUtils.smoothstep(depth, 0.05, 0.9);
    let max = wantRun ? SPEED.run : (this.crouch ? SPEED.crouch : SPEED.walk);
    if (this.state === "scan") max = Math.min(max, 1.0);
    max *= 1 - this.wading * 0.5;
    // slope makes uphill slower
    const target = max * mag;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (target > this.speed ? 4 : 8)));
    if (mag > 0.05) {
      const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
      // camera forward is -Z rotated by camYaw
      const fx = -sy, fz = -cy, rx = cy, rz = -sy;
      const dx = fx * ax.y + rx * ax.x, dz = fz * ax.y + rz * ax.x;
      const want = Math.atan2(dx, dz);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 10));
    }
    const vx = Math.sin(this.yaw) * this.speed, vz = Math.cos(this.yaw) * this.speed;
    let nx = p.x + vx * dt, nz = p.z + vz * dt;
    // steep slopes and deep water block movement
    const nh = this.t.heightAt(nx, nz);
    const rise = nh - ground;
    const stepLen = Math.hypot(nx - p.x, nz - p.z) + 1e-6;
    const grade = rise / stepLen;
    if (grade > 1.05 || nh < -1.15) { nx = p.x; nz = p.z; this.speed *= 0.5; }
    else if (grade > 0.45) { const f = 1 - (grade - 0.45) / 0.6; nx = p.x + (nx - p.x) * f; nz = p.z + (nz - p.z) * f; }
    // trunk / rock collisions (circles)
    const cols = this.foliage.collidersNear(nx, nz, _cols);
    for (const c of cols) {
      const ddx = nx - c.x, ddz = nz - c.z, rr = c.r + 0.3;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = c.x + ddx / d * rr;
        nz = c.z + ddz / d * rr;
      }
    }
    for (const c of this.extraColliders || []) {
      const ddx = nx - c.x, ddz = nz - c.z, rr = c.r + 0.3;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); nx = c.x + ddx / d * rr; nz = c.z + ddz / d * rr; }
    }
    const moved = Math.hypot(nx - p.x, nz - p.z) / Math.max(dt, 1e-4);
    p.x = nx;
    p.z = nz;
    // vertical: hop and gravity
    const gh = Math.max(this.t.heightAt(p.x, p.z), -1.2);
    if (inp.wasPressed("jump") && this.onGround && !busy && this.wading < 0.5) { this.vy = 3.4; this.onGround = false; }
    this.vy -= 9.81 * dt;
    p.y += this.vy * dt;
    if (p.y <= gh) { p.y = gh; this.vy = 0; this.onGround = true; }
    // stamina
    if (wantRun && this.speed > 2.5) this.stamina = Math.max(0, this.stamina - dt / 9);
    else this.stamina = Math.min(1, this.stamina + dt / (this.speed > 0.2 ? 14 : 6));
    // noise for sound hunters
    this.noise = this.speed > 3 ? 1 : this.speed > 0.4 ? (this.crouch ? 0.15 : 0.45) : 0.05;
    // footsteps
    if (this.onGround && moved > 0.3) {
      const cyc = moved > 3 ? 0.73 / 2 : (this.crouch ? 1.33 / 2 : 1.13 / 2);
      this.stepPhase += dt / cyc * Math.min(1.6, moved / (moved > 3 ? SPEED.run : SPEED.walk));
      if (this.stepPhase >= 1) { this.stepPhase -= 1; if (this.onStep) this.onStep(moved, this.wading); }
    }

    // ---- animation
    const lower = {}, upper = {};
    const sp = moved;
    const loco = (tgt) => {
      if (this.crouch && sp > 0.1) { tgt.crouch = 1; return; }
      if (sp < 0.12) { tgt[this.crouch ? "crouch" : "idle"] = 1; return; }
      if (sp < SPEED.walk + 0.4) { const w = Math.min(1, sp / 0.6); tgt.walk = w; tgt.idle = 1 - w; return; }
      const r = THREE.MathUtils.clamp((sp - SPEED.walk - 0.4) / (SPEED.run - SPEED.walk - 0.6), 0, 1);
      tgt.run = r; tgt.walk = 1 - r;
    };
    if (this.state === "down") { lower.down = 1; upper.down = 1; }
    else if (this.state === "kneel") { lower.kneel = 1; upper.kneel = 1; }
    else if (this.state === "board") { lower.idle = 1; upper.wave = 1; }
    else {
      loco(lower);
      if (this.state === "scan") upper.scan = 1;
      else if (this.state === "radio") upper.radio = 1;
      else if (this.state === "wave") upper.wave = 1;
      else loco(upper);
    }
    const ts = { walk: Math.max(0.5, sp / 1.3), run: Math.max(0.6, sp / 4.2), crouch: Math.max(0.5, sp / 0.8) };
    this.ex.setPose(lower, upper, ts, dt);
    this.ex.update(dt);
    this.ex.root.position.copy(p);
    this.ex.root.position.y -= this.crouch && sp < 0.1 ? 0 : 0;
    this.ex.root.rotation.y = this.yaw;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const cam = this.engine.camera;
    const p = this.pos;
    if (this.firstPerson) {
      const eye = _v.set(p.x, p.y + (this.crouch ? 1.05 : 1.62), p.z);
      cam.position.copy(eye);
      cam.rotation.set(this.camPitch, this.camYaw, 0);
      if (this.ex.head) this.ex.head.visible = false;
      this.ex.root.traverse((o) => { if (o.isMesh && /gear_head|head/.test(o.name)) o.visible = false; });
      return;
    }
    this.ex.root.traverse((o) => { if (o.isMesh) o.visible = true; });
    const pivotY = p.y + (this.crouch ? 1.1 : 1.55);
    const dist = this.camDist;
    const cp = Math.cos(this.camPitch), spp = Math.sin(this.camPitch);
    const back = _v2.set(Math.sin(this.camYaw) * cp, -spp, Math.cos(this.camYaw) * cp);
    const right = _v3.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const want = _v.set(p.x, pivotY, p.z).addScaledVector(back, dist).addScaledVector(right, 0.42);
    // keep the camera above the ground along the way
    const gh = this.t.heightAt(want.x, want.z);
    if (want.y < gh + 0.35) want.y = gh + 0.35;
    if (want.y < 0.25) want.y = Math.max(want.y, 0.25);
    const k = 1 - Math.exp(-dt * 14);
    this.camPos.lerp(want, this.camPos.lengthSq() === 0 ? 1 : k);
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.08;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.08;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    cam.rotation.set(this.camPitch, this.camYaw, 0);
  }
}

const _cols = [];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
