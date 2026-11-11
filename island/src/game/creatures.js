// Island fauna in-game: Blender models + animation, AI behaviours, survey targets.
// The host (or the solo player) runs the AI; co-op clients only interpolate states.
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { patchMaterial } from "../gfx/shaderlib.js";

const DEFS = {
  crab: { glb: "creatures/crab.glb", detail: "crab", rep: 4, count: 12, zone: "shore", speed: 0.6, run: 1.6, scale: [0.9, 1.25], dmg: 8 },
  booby: { glb: "creatures/booby.glb", detail: "booby", rep: 3, count: 7, zone: "air", speed: 11, scale: [1, 1.1] },
  monitor: { glb: "creatures/monitor.glb", detail: "monitor", rep: 5, count: 7, zone: "jungle", speed: 0.7, run: 3.6, scale: [0.9, 1.2], dmg: 15 },
  denkui: { glb: "creatures/denkui.glb", detail: "denkui", rep: 4, count: 4, zone: "denkui", speed: 0.55, run: 1.4, scale: [0.95, 1.1], dmg: 25 },
  numa: { glb: "creatures/numa.glb", detail: "numa", rep: 4, count: 5, zone: "mire", speed: 1.4, run: 6.5, scale: [0.9, 1.1], dmg: 45 },
  kurohami: { glb: "creatures/kurohami.glb", detail: "kurohami", rep: 5, count: 4, zone: "ridge", speed: 1.4, run: 7.5, scale: [0.95, 1.1], dmg: 40 },
};

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export class Fauna {
  constructor(engine, terrain, loader, csm, quality) {
    this.engine = engine;
    this.t = terrain;
    this.loader = loader;
    this.csm = csm;
    this.q = quality;
    this.group = new THREE.Group();
    this.list = [];
    this.models = {};
    this.events = [];     // {type, creature, ...} consumed by the game (damage, sounds, antenna destroyed)
    this.authority = true;
  }

  async load() {
    for (const [id, d] of Object.entries(DEFS)) {
      try {
        const gltf = await this.loader.glb(d.glb);
        await this.prepare(id, gltf, d);
        this.models[id] = gltf;
      } catch (e) {
        console.warn("creature", id, e);
      }
    }
  }

  async prepare(id, gltf, d) {
    const L = this.loader;
    const [det, nrm] = await Promise.all([
      L.texture(`creatures/${d.detail}_detail.webp`, { srgb: true }).catch(() => null),
      L.texture(`creatures/${d.detail}_normal.webp`, { srgb: false }).catch(() => null),
    ]);
    const ao = await L.texture(`creatures/ao_${id}.webp`, { srgb: false, repeat: false }).catch(() => null);
    for (const t of [det, nrm]) if (t) t.repeat.set(d.rep, d.rep);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      const emissive = old.emissive && (old.emissive.r + old.emissive.g + old.emissive.b) > 0.01;
      const m = new THREE.MeshStandardMaterial({
        color: old.color, roughness: Math.max(0.25, old.roughness), metalness: 0,
        map: det, normalMap: nrm, aoMap: /body/.test(o.name) ? ao : null,
        emissive: emissive ? old.emissive : new THREE.Color(0), emissiveIntensity: emissive ? 2.5 : 0,
      });
      m.name = old.name;
      if (nrm) m.normalScale.set(0.8, 0.8);
      patchMaterial(m, { csm: this.csm });
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
  }

  spawnAll(seed, avoid) {
    const t = this.t, b = { forest: 0, mire: 0, vol: 0 };
    let k = 0;
    for (const [id, d] of Object.entries(DEFS)) {
      if (!this.models[id]) continue;
      const n = Math.round(d.count * (this.q.tier === 0 ? 0.6 : 1));
      let placed = 0, tries = 0;
      while (placed < n && tries < 4000) {
        tries++;
        const x = (hash(seed + k * 13.1 + tries * 7.7) * 2 - 1) * 700, z = (hash(seed + k * 3.7 + tries * 1.9 + 55) * 2 - 1) * 700;
        const h = t.heightAt(x, z);
        t.biomeAt(x, z, b);
        const sl = t.slopeAt(x, z);
        let ok = false;
        if (d.zone === "shore") ok = h > 1.4 && h < 14 && sl < 25 && b.vol < 0.2 && b.mire < 0.3;
        else if (d.zone === "jungle") ok = b.forest > 0.5 && h > 4 && h < 120 && sl < 28 && b.vol < 0.3 && b.mire < 0.3;
        else if (d.zone === "denkui") ok = b.forest > 0.55 && h > 3 && sl < 25 && b.vol < 0.3 && (z < 150 || b.mire > 0.2);
        else if (d.zone === "mire") ok = b.mire > 0.5 && h < -0.35 && h > -1.6;
        else if (d.zone === "ridge") ok = b.vol > 0.5 && sl < 30 && h > 70;
        else if (d.zone === "air") ok = h < 4 && h > -30;
        if (!ok) continue;
        if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < avoid.r) continue;
        this.add(id, x, z, hash(seed + tries) * Math.PI * 2, d.scale[0] + (d.scale[1] - d.scale[0]) * hash(seed + tries * 3.3));
        placed++;
      }
      k++;
    }
  }

  add(id, x, z, yaw, scale) {
    const gltf = this.models[id];
    const root = SkeletonUtils.clone(gltf.scene);
    root.scale.setScalar(scale);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const c of gltf.animations) {
      const a = mixer.clipAction(c);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      actions[c.name] = a;
    }
    const c = {
      id, uid: this.list.length, root, mixer, actions, weights: {}, def: DEFS[id], scale,
      pos: new THREE.Vector3(x, 0, z), yaw, vel: 0, state: "idle", timer: hash(this.list.length) * 4, anim: "idle",
      home: new THREE.Vector3(x, 0, z), target: null, cooldown: 0, alpha: 1, phase: hash(x + z) * 6.28, alt: 0,
      behaviour: "idle", visible: true,
    };
    if (id === "booby") { c.alt = 30 + hash(x) * 35; c.radius = 60 + hash(z) * 120; c.state = "glide"; }
    c.pos.y = this.groundY(c);
    root.position.copy(c.pos);
    root.rotation.y = yaw;
    this.group.add(root);
    this.list.push(c);
    return c;
  }

  groundY(c) {
    const h = this.t.heightAt(c.pos.x, c.pos.z);
    if (c.id === "numa") {
      if (h < -0.3) return c.state === "lunge" || c.state === "chase" ? -0.12 : -0.24; // body under the surface
      return h;
    }
    if (c.id === "booby") return Math.max(h, 0) + c.alt;
    return h;
  }

  setAnim(c, name, dt, speed = 1) {
    const avail = c.actions[name] ? name : (c.actions.idle ? "idle" : Object.keys(c.actions)[0]);
    const k = 1 - Math.exp(-dt * 6);
    for (const n in c.actions) {
      const target = n === avail ? 1 : 0;
      const w = (c.weights[n] || 0) + (target - (c.weights[n] || 0)) * k;
      c.weights[n] = w;
      c.actions[n].setEffectiveWeight(w);
    }
    if (c.actions[avail]) c.actions[avail].setEffectiveTimeScale(speed);
    c.anim = avail;
  }

  /** ctx: { players: [{pos, noise, alive, inWater, id}], antennas: [{id, x, z, shield, alive}], decoys: [{x,z,t}], repel } */
  update(dt, ctx, camera) {
    const camPos = camera.position;
    for (const c of this.list) {
      if (this.authority) this.think(c, dt, ctx);
      // movement integration
      if (c.vel > 0.001 && c.id !== "booby") {
        const nx = c.pos.x + Math.sin(c.yaw) * c.vel * dt, nz = c.pos.z + Math.cos(c.yaw) * c.vel * dt;
        const h = this.t.heightAt(nx, nz);
        const okTerrain = c.id === "numa" ? h < 0.8 : (h > (c.id === "crab" ? 0.4 : 1.0) && this.t.slopeAt(nx, nz) < 38);
        if (okTerrain) { c.pos.x = nx; c.pos.z = nz; } else { c.yaw += Math.PI * 0.6; c.vel *= 0.5; }
      }
      const gy = this.groundY(c);
      c.pos.y += (gy - c.pos.y) * (1 - Math.exp(-dt * 8));
      c.root.position.copy(c.pos);
      // smooth yaw
      let dy = c.yaw - c.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.root.rotation.y += dy * (1 - Math.exp(-dt * 6));
      if (c.id === "booby") c.root.rotation.z = THREE.MathUtils.clamp(-c.turn * 0.6 || 0, -0.6, 0.6);
      // tilt with the ground for walkers
      const d = c.pos.distanceTo(camPos);
      const vis = d < (c.id === "booby" ? 1200 : 170);
      c.root.visible = vis;
      const cast = d < 45;
      if (c.castShadow !== cast) { c.castShadow = cast; c.root.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
      if (vis) {
        // animation LOD: update far ones less often
        c.animAcc = (c.animAcc || 0) + dt;
        const every = d < 40 ? 0 : d < 100 ? 0.05 : 0.12;
        if (c.animAcc >= every) { c.mixer.update(c.animAcc); c.animAcc = 0; }
      }
    }
  }

  think(c, dt, ctx) {
    c.timer -= dt;
    c.cooldown = Math.max(0, c.cooldown - dt);
    const near = nearestPlayer(c, ctx.players);
    const pd = near ? Math.hypot(near.pos.x - c.pos.x, near.pos.z - c.pos.z) : 1e9;
    const d = c.def;
    switch (c.id) {
      case "crab": {
        if (ctx.repel && pd < 10) { c.state = "flee"; c.timer = 2; }
        if (c.state !== "flee" && pd < 4.5) { c.state = pd < 1.8 ? "threat" : "flee"; c.timer = 2.5; }
        if (c.state === "threat") {
          face(c, near.pos); c.vel = 0; this.setAnim(c, "threat", dt);
          c.behaviour = "threat";
          if (pd < 1.0 && c.cooldown <= 0) { c.cooldown = 2; this.events.push({ type: "attack", c, target: near.id, dmg: d.dmg }); }
          if (c.timer < 0) c.state = "idle";
        } else if (c.state === "flee") {
          if (near) face(c, near.pos, true);
          c.vel = d.run; this.setAnim(c, "run", dt, 1.4); c.behaviour = "flee";
          if (c.timer < 0) c.state = "idle";
        } else wander(this, c, dt, d.speed, "walk", 25);
        break;
      }
      case "booby": {
        c.ang = (c.ang ?? hash(c.uid) * 6.28) + dt * (d.speed / c.radius);
        const cx = c.home.x, cz = c.home.z;
        const tx = cx + Math.cos(c.ang) * c.radius, tz = cz + Math.sin(c.ang) * c.radius;
        c.turn = (c.prevYaw !== undefined) ? (Math.atan2(tx - c.pos.x, tz - c.pos.z) - c.prevYaw) : 0;
        c.yaw = Math.atan2(tx - c.pos.x, tz - c.pos.z);
        c.prevYaw = c.yaw;
        c.pos.x = tx; c.pos.z = tz;
        c.alt = 32 + 14 * Math.sin(c.ang * 0.7 + c.phase);
        const flap = Math.sin(c.ang * 3 + c.phase) > 0.6;
        this.setAnim(c, flap ? "flap" : "glide", dt, flap ? 1.2 : 1);
        c.behaviour = flap ? "flap" : "glide";
        break;
      }
      case "monitor": {
        if ((pd < 7 || (ctx.repel && pd < 14)) && c.state !== "bite") { c.state = "flee"; c.timer = 3; }
        if (c.state === "flee") {
          if (pd < 1.6 && c.cooldown <= 0 && hash(c.timer * 99) < 0.02 && !ctx.repel) { c.state = "bite"; c.timer = 0.8; }
          face(c, near ? near.pos : c.home, true); c.vel = d.run; this.setAnim(c, "run", dt, 1.3); c.behaviour = "flee";
          if (c.timer < 0) c.state = "idle";
        } else if (c.state === "bite") {
          face(c, near.pos); c.vel = 0; this.setAnim(c, "idle", dt, 3);
          if (c.timer < 0) { c.cooldown = 4; this.events.push({ type: "attack", c, target: near.id, dmg: d.dmg }); c.state = "flee"; c.timer = 3; }
        } else wander(this, c, dt, d.speed, "walk", 40);
        break;
      }
      case "denkui": {
        // drawn to unshielded antennas within 75 m
        if (c.state !== "feed" && c.state !== "strike" && c.cooldown <= 0) {
          let best = null, bd = 75;
          for (const a of ctx.antennas) {
            if (!a.alive || a.shield) continue;
            const ad = Math.hypot(a.x - c.pos.x, a.z - c.pos.z);
            if (ad < bd) { bd = ad; best = a; }
          }
          if (best) { c.state = "seek"; c.target = best; }
        }
        if (pd < 3.6 && c.cooldown <= 0 && c.state !== "strike") { c.state = "strike"; c.timer = 0.8; }
        if (c.state === "strike") {
          face(c, near.pos); c.vel = 0; this.setAnim(c, "strike", dt, 1.2); c.behaviour = "strike";
          if (c.timer < 0) {
            if (pd < 4.2) this.events.push({ type: "attack", c, target: near.id, dmg: d.dmg });
            c.cooldown = 3; c.state = "idle"; c.timer = 3;
          }
        } else if (c.state === "seek" && c.target) {
          const a = c.target;
          if (!a.alive) { c.state = "idle"; c.target = null; break; }
          const ad = Math.hypot(a.x - c.pos.x, a.z - c.pos.z);
          face(c, { x: a.x, z: a.z });
          if (ad > 2.2) { c.vel = d.run; this.setAnim(c, "walk", dt, 1.6); c.behaviour = "seek"; }
          else { c.state = "feed"; c.timer = 9; c.vel = 0; this.events.push({ type: "feedStart", c, antenna: a.id }); }
        } else if (c.state === "feed") {
          c.vel = 0; this.setAnim(c, "feed", dt); c.behaviour = "feed";
          if (c.timer < 0) {
            if (c.target) this.events.push({ type: "destroyAntenna", c, antenna: c.target.id });
            c.state = "idle"; c.target = null; c.cooldown = 20; c.timer = 6;
          }
        } else wander(this, c, dt, d.speed, "walk", 30, "idle", 0.35);
        break;
      }
      case "numa": {
        const pw = near && near.inWater && pd < 16;
        if (c.state === "lunge") {
          c.vel = d.run; this.setAnim(c, "lunge", dt, 1); c.behaviour = "lunge";
          if (c.timer < 0) {
            if (near && pd < 2.6) this.events.push({ type: "attack", c, target: near.id, dmg: d.dmg });
            c.state = "retreat"; c.timer = 4; c.cooldown = 7;
          }
        } else if (pw && c.cooldown <= 0) {
          face(c, near.pos);
          if (pd < 4.2) { c.state = "lunge"; c.timer = 0.65; this.events.push({ type: "lunge", c }); }
          else { c.state = "chase"; c.vel = d.speed * 1.6; this.setAnim(c, "swim", dt, 1.3); c.behaviour = "stalk"; }
        } else if (c.state === "retreat") {
          if (near) face(c, near.pos, true);
          c.vel = d.speed; this.setAnim(c, "swim", dt); if (c.timer < 0) c.state = "idle";
        } else {
          c.state = "idle"; c.vel = 0; this.setAnim(c, "idle", dt); c.behaviour = "submerged";
          if (c.timer < 0) { c.timer = 6 + hash(c.pos.x) * 8; c.yaw += (hash(c.pos.z + c.timer) - 0.5) * 2; c.vel = 0.4; }
        }
        break;
      }
      case "kurohami": {
        // hears players: loudness falls with distance
        let heard = null, best = 0;
        for (const p of ctx.players) {
          if (!p.alive) continue;
          const dd = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
          const loud = p.noise * 70 / (dd + 1);
          if (loud > best) { best = loud; heard = p; }
        }
        for (const dc of ctx.decoys) {
          const dd = Math.hypot(dc.x - c.pos.x, dc.z - c.pos.z);
          const loud = 90 / (dd + 1);
          if (loud > best) { best = loud; heard = { pos: { x: dc.x, z: dc.z }, decoy: true, id: null }; }
        }
        if (c.state === "pounce") {
          c.vel = d.run * 0.8; this.setAnim(c, "pounce", dt); c.behaviour = "pounce";
          if (c.timer < 0) {
            if (near && pd < 2.4) this.events.push({ type: "attack", c, target: near.id, dmg: d.dmg });
            c.state = "listen"; c.timer = 3; c.cooldown = 5;
          }
          break;
        }
        if (best > 2.2) { c.lastHeard = { x: heard.pos.x, z: heard.pos.z, decoy: heard.decoy }; c.state = "hunt"; c.timer = 6; }
        else if (best > 1.1 && c.state !== "hunt") { c.state = "listen"; c.timer = 2.5; c.lastHeard = { x: heard.pos.x, z: heard.pos.z }; }
        if (c.state === "hunt" && c.lastHeard) {
          const hd = Math.hypot(c.lastHeard.x - c.pos.x, c.lastHeard.z - c.pos.z);
          face(c, c.lastHeard);
          if (near && pd < 3.2 && !c.lastHeard.decoy && c.cooldown <= 0) { c.state = "pounce"; c.timer = 0.6; this.events.push({ type: "growl", c }); }
          else if (hd > 1.5) { c.vel = d.run; this.setAnim(c, "run", dt, 1.1); c.behaviour = "hunt"; }
          else { c.state = "listen"; c.timer = 3; }
          if (c.timer < 0) c.state = "listen";
        } else if (c.state === "listen") {
          c.vel = 0; this.setAnim(c, "listen", dt); c.behaviour = "listen";
          if (c.timer < 0) c.state = "idle";
        } else wander(this, c, dt, d.speed, "walk", 60, "listen", 0.4);
        break;
      }
    }
  }

  /** Survey targets visible to the scanner. */
  targets(out = []) {
    for (const c of this.list) {
      if (!c.root.visible) continue;
      out.push({ species: c.id, pos: c.pos, y: c.id === "booby" ? 0 : (c.id === "denkui" ? 1.6 : 0.4) * c.scale, radius: c.id === "denkui" ? 1.4 : 0.8, behaviour: c.behaviour, ref: c });
    }
    return out;
  }

  // ---- network
  snapshot() {
    return this.list.map((c) => [Math.round(c.pos.x * 10) / 10, Math.round(c.pos.z * 10) / 10, Math.round(c.yaw * 100) / 100, c.anim, c.behaviour, Math.round(c.alt)]);
  }
  applySnapshot(s) {
    for (let i = 0; i < s.length && i < this.list.length; i++) {
      const c = this.list[i], v = s[i];
      c.pos.x += (v[0] - c.pos.x) * 0.5;
      c.pos.z += (v[1] - c.pos.z) * 0.5;
      c.yaw = v[2];
      c.behaviour = v[4];
      c.alt = v[5];
      this.setAnim(c, v[3], 0.1);
    }
  }
}

function nearestPlayer(c, players) {
  let best = null, bd = 1e9;
  for (const p of players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function face(c, p, away = false) {
  const a = Math.atan2(p.x - c.pos.x, p.z - c.pos.z);
  c.yaw = away ? a + Math.PI : a;
}

function wander(f, c, dt, speed, anim, radius, idleAnim = "idle", idleBias = 0.5) {
  if (c.timer < 0) {
    if (hash(c.timer * 17 + c.uid) < idleBias) { c.state = "idle"; c.timer = 3 + hash(c.uid + c.pos.x) * 6; }
    else {
      c.state = "walk";
      c.timer = 3 + hash(c.uid + c.pos.z) * 5;
      const dx = c.home.x - c.pos.x, dz = c.home.z - c.pos.z;
      const back = Math.hypot(dx, dz) > radius;
      c.yaw = back ? Math.atan2(dx, dz) : c.yaw + (hash(c.timer + c.uid) - 0.5) * 2.4;
    }
  }
  if (c.state === "walk") { c.vel = speed; f.setAnim(c, anim, dt); c.behaviour = "walk"; }
  else { c.vel = 0; f.setAnim(c, idleAnim, dt); c.behaviour = "idle"; }
}
