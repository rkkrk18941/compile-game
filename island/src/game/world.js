// Static and gameplay props: camp, boulders, logs, research specimens, the Heart,
// relay antennas and memo cases.
import * as THREE from "three";
import { G, patchMaterial, windDepthMaterial } from "../gfx/shaderlib.js";
import { bakedGeometry } from "../core/loader.js";

function hash(n) { const x = Math.sin(n * 91.3458 + 47.13) * 43758.5453; return x - Math.floor(x); }

/** Clone a glTF node inside a fresh group: quantized (meshopt) glTF nodes carry their
 *  dequantization in their own transform, so placement must happen on a wrapper. */
export function placeable(node) {
  const g = new THREE.Group();
  g.add(node.clone(true));
  return g;
}

export class WorldProps {
  constructor(engine, terrain, foliage, loader, quality) {
    this.engine = engine;
    this.t = terrain;
    this.foliage = foliage;
    this.loader = loader;
    this.q = quality;
    this.group = new THREE.Group();
    this.specimens = [];     // {species, pos, y, radius}
    this.colliders = [];
    this.antennas = new Map(); // id -> {obj, data}
    this.memos = new Map();
    this.heartPulse = { value: 0 };
  }

  std(m, opts = {}) { return patchMaterial(m, { csm: this.engine.csm, ...opts }); }

  async load(lz) {
    const L = this.loader;
    const [camp, ant, items, rocks, logs, under, heart] = await Promise.all([
      L.glb("props/camp.glb"), L.glb("props/antenna.glb"), L.glb("props/items.glb"), L.glb("props/rocks.glb"),
      L.glb("props/logs.glb"), L.glb("plants/understory.glb"), L.glb("creatures/heart.glb"),
    ]);
    this.prepareGeneric(camp.scene);
    this.prepareGeneric(ant.scene);
    this.prepareGeneric(items.scene);
    // camp at the landing zone
    const c = camp.scene;
    c.position.set(lz.x, this.t.heightAt(lz.x, lz.z) - 0.02, lz.z);
    this.group.add(c);
    this.camp = c;
    this.mastPos = new THREE.Vector3(lz.x - 1, 0, lz.z - 13);
    this.padPos = new THREE.Vector3(lz.x, 0, lz.z + 14);
    this.colliders.push({ x: lz.x - 9, z: lz.z - 6, r: 1.6 }, { x: lz.x - 6, z: lz.z - 9.5, r: 1.4 }, { x: lz.x + 2, z: lz.z - 9, r: 1.0 },
      { x: lz.x + 5.3, z: lz.z - 7.2, r: 1.0 }, { x: lz.x - 3, z: lz.z - 11, r: 0.7 }, { x: lz.x + 6, z: lz.z - 10, r: 0.6 });
    this.antennaModel = ant.scene.children[0] || ant.scene;
    this.items = {};
    for (const o of items.scene.children) this.items[o.name] = o;
    await this.placeRocks(rocks);
    await this.placeLogs(logs);
    await this.placeSpecimens(under, logs);
    this.placeHeart(heart);
  }

  prepareGeneric(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material;
      const m = new THREE.MeshStandardMaterial({
        color: old.color, roughness: old.roughness, metalness: old.metalness,
        emissive: old.emissive || new THREE.Color(0), emissiveIntensity: old.emissiveIntensity || 1,
      });
      m.name = old.name;
      if (/glass/.test(m.name)) { m.roughness = 0.05; m.metalness = 0.4; m.envMapIntensity = 1.5; }
      if (old.emissive && old.emissive.r + old.emissive.g + old.emissive.b > 0.01) m.emissiveIntensity = 3;
      this.std(m);
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  async placeRocks(gltf) {
    const L = this.loader;
    const [ra, rn] = await Promise.all([L.texture("ground/rock_albedo.webp", { srgb: true }), L.texture("ground/rock_normal.webp", { srgb: false })]);
    const variants = [];
    for (let k = 0; k < 6; k++) {
      const node = gltf.scene.getObjectByName(`rock${k}_lod0`);
      if (!node) continue;
      let geo = null;
      node.traverse((o) => { if (o.isMesh && !geo) geo = bakedGeometry(o, gltf.scene); });
      const nao = await L.texture(`props/rock${k}_nao.webp`, { srgb: false, repeat: false });
      const m = new THREE.MeshStandardMaterial({ map: ra, normalMap: nao, aoMap: nao, roughness: 0.85 });
      ra.repeat.set(1, 1);
      this.std(m, {
        extra: {
          key: "rock", uniforms: { uDetailN: { value: rn } },
          fragmentPars: "uniform sampler2D uDetailN;",
        },
      });
      const generic = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        generic(shader, r);
        shader.fragmentShader = shader.fragmentShader
          // triplanar albedo from the terrain rock layer so boulders match the cliffs
          .replace("#include <map_fragment>", `
            vec3 wn = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
            vec3 bw = pow(abs(wn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
            vec3 tp = vAtmoWorld / 5.0;
            vec3 ta = texture2D(map, tp.zy).rgb * bw.x + texture2D(map, tp.xz).rgb * bw.y + texture2D(map, tp.xy).rgb * bw.z;
            diffuseColor.rgb *= ta;
            vec3 bio = biomeAt(vAtmoWorld.xz);
            float mossy = smoothstep(0.55, 0.9, wn.y) * bio.r * (1.0 - bio.b) * smoothstep(0.35, 0.6, fbm3(vAtmoWorld.xz * 0.7));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.08, 0.02), mossy * 0.85);
            float wetR = smoothstep(0.8, 0.0, vAtmoWorld.y);
            diffuseColor.rgb *= mix(1.0, 0.55, wetR);
          `)
          .replace("#include <normal_fragment_maps>", `
            vec3 mapN = vec3(texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0, 0.0);
            mapN.z = sqrt(max(1.0 - dot(mapN.xy, mapN.xy), 0.0));
            normal = normalize(tbn * mapN);
          `)
          .replace("#include <aomap_fragment>", `
            float ambientOcclusion = mix(1.0, texture2D(aoMap, vAoMapUv).b, 0.9);
            reflectedLight.indirectDiffuse *= ambientOcclusion;
            reflectedLight.indirectSpecular *= ambientOcclusion;
          `);
      };
      variants.push({ geo, m, size: [1.0, 1.4, 0.9, 2.2, 1.2, 3.0][k] });
    }
    // placement
    const insts = variants.map(() => []);
    const b = { forest: 0, mire: 0, vol: 0 };
    const n = 2600;
    for (let i = 0; i < n; i++) {
      const x = (hash(i * 1.37) * 2 - 1) * 760, z = (hash(i * 2.11 + 5) * 2 - 1) * 760;
      const h = this.t.heightAt(x, z);
      if (h < -2.5 || h > 230) continue;
      this.t.biomeAt(x, z, b);
      const sl = this.t.slopeAt(x, z);
      let p = 0.02;
      if (b.vol > 0.4) p = 0.55;
      else if (sl > 25) p = 0.35;
      else if (h < 3 && h > -2) p = 0.1;       // boulders on the shore
      else if (b.forest > 0.5) p = 0.12;
      if (b.mire > 0.4) p = 0.01;
      if (hash(i * 7.7) > p) continue;
      if (Math.hypot(x - this.camp.position.x, z - this.camp.position.z) < 40) continue;
      const v = Math.floor(hash(i * 3.3) * variants.length) % variants.length;
      const s = (0.5 + hash(i * 5.1) * 1.1) * (b.vol > 0.4 ? 1.3 : 1);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, h - 0.15 * s, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(i) - 0.5) * 0.3, hash(i * 9.1) * 6.28, (hash(i * 2) - 0.5) * 0.3)),
        new THREE.Vector3(s, s, s));
      insts[v].push(m);
      const r = variants[v].size * s * 0.75;
      if (r > 0.6) this.foliage.addCollider(x, z, r, "rock");
    }
    variants.forEach((V, k) => {
      const im = new THREE.InstancedMesh(V.geo, V.m, Math.max(1, insts[k].length));
      insts[k].forEach((m, i) => im.setMatrixAt(i, m));
      im.count = insts[k].length;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = "rocks" + k;
      this.group.add(im);
    });
  }

  async placeLogs(gltf) {
    const L = this.loader;
    const [a, n] = await Promise.all([L.texture("plants/bark_drift_albedo.webp", { srgb: true }), L.texture("plants/bark_drift_normal.webp", { srgb: false })]);
    const ma = await L.texture("plants/bark_rough_albedo.webp", { srgb: true });
    const mn = await L.texture("plants/bark_rough_normal.webp", { srgb: false });
    const drift = this.std(new THREE.MeshStandardMaterial({ map: a, normalMap: n, roughness: 0.9 }));
    const rotten = this.std(new THREE.MeshStandardMaterial({ map: ma, normalMap: mn, roughness: 0.95, color: 0x8a8a70 }));
    const geos = [];
    gltf.scene.traverse((o) => { if (o.isMesh) geos.push(bakedGeometry(o, gltf.scene)); });
    const b = { forest: 0, mire: 0, vol: 0 };
    const buckets = new Map();
    for (let i = 0; i < 700; i++) {
      const x = (hash(i * 4.31 + 1) * 2 - 1) * 720, z = (hash(i * 6.17 + 2) * 2 - 1) * 720;
      const h = this.t.heightAt(x, z);
      this.t.biomeAt(x, z, b);
      const beach = h > 0.6 && h < 2.6 && b.mire < 0.2;
      const jungle = b.forest > 0.55 && h > 4 && this.t.slopeAt(x, z) < 20;
      if (!(beach && hash(i) < 0.25) && !(jungle && hash(i * 1.7) < 0.3)) continue;
      if (Math.hypot(x - this.camp.position.x, z - this.camp.position.z) < 30) continue;
      const gi = i % geos.length;
      const key = gi + (beach ? "b" : "j");
      if (!buckets.has(key)) buckets.set(key, { geo: geos[gi], mat: beach ? drift : rotten, list: [] });
      buckets.get(key).list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.12, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i * 2.2) * 6.28), new THREE.Vector3(1, 1, 1)));
      this.foliage.addCollider(x, z, 0.6, "log");
    }
    for (const B of buckets.values()) {
      const im = new THREE.InstancedMesh(B.geo, B.mat, B.list.length);
      B.list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = "logs";
      this.group.add(im);
    }
  }

  async placeSpecimens(under, logs) {
    const make = (name) => {
      const src = under.scene.getObjectByName(name);
      return src;
    };
    // materials for specimen meshes
    const L = this.loader;
    const glow = new THREE.MeshStandardMaterial({ color: 0xd8e8c8, roughness: 0.5, emissive: new THREE.Color(0.35, 1.0, 0.45), emissiveIntensity: 0 });
    this.std(glow);
    this.mushroomGlow = glow;
    const crystal = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.08, metalness: 0, transmission: 0.0, thickness: 0.2,
      emissive: new THREE.Color(0.35, 0.6, 1.0), emissiveIntensity: 0.6, clearcoat: 1, transparent: false });
    this.std(crystal);
    const [pa, pn] = await Promise.all([L.texture("plants/pitcher_albedo.webp", { srgb: true }), L.texture("plants/pitcher_normal.webp", { srgb: false })]);
    const pitcherM = this.std(new THREE.MeshStandardMaterial({ map: pa, normalMap: pn, roughness: 0.35 }));
    const [da, dn] = await Promise.all([L.texture("plants/bark_drift_albedo.webp", { srgb: true }), L.texture("plants/bark_drift_normal.webp", { srgb: false })]);
    const logM = this.std(new THREE.MeshStandardMaterial({ map: da, normalMap: dn, roughness: 0.9, color: 0x6a6a58 }));
    const stem = this.std(new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.7 }));
    const shrubLeaf = await this.foliage.makeMaterial("leaf_leaves_shrub", this.engine.csm);
    const matFor = (name) => {
      if (name === "glow_mushroom") return glow;
      if (name === "glass_crystal") return crystal;
      if (name === "bark_pitcher") return pitcherM;
      if (name === "bark_drift") return logM;
      if (name === "leaf_leaves_shrub") return shrubLeaf.mat;
      return stem;
    };
    const kinds = [
      { species: "pitcher", obj: ["pitcher0_lod0", "pitcher1_lod0"], n: 14, test: (h, sl, b) => b.mire > 0.45 && h > 0.05 && h < 1.6, y: 0.3, r: 0.6 },
      { species: "mushroom", obj: ["mushlog0_lod0", "mushlog1_lod0"], n: 12, test: (h, sl, b) => b.forest > 0.6 && h > 5 && sl < 18 && b.vol < 0.2, y: 0.3, r: 1.0 },
      { species: "glassbloom", obj: ["glassbloom0_lod0", "glassbloom1_lod0"], n: 14, test: (h, sl, b) => b.vol > 0.5 && h > 85 && sl < 32, y: 0.5, r: 0.5 },
    ];
    const b = { forest: 0, mire: 0, vol: 0 };
    for (const K of kinds) {
      let placed = 0;
      for (let i = 0; i < 5000 && placed < K.n; i++) {
        const x = (hash(i * 3.17 + K.species.length) * 2 - 1) * 720, z = (hash(i * 7.31 + K.species.length * 3) * 2 - 1) * 720;
        const h = this.t.heightAt(x, z);
        this.t.biomeAt(x, z, b);
        if (!K.test(h, this.t.slopeAt(x, z), b)) continue;
        const src = make(K.obj[placed % K.obj.length]);
        if (!src) break;
        const obj = placeable(src);
        obj.traverse((o) => {
          if (o.isMesh) {
            o.material = matFor(o.material.name);
            if (o.geometry.attributes.color && !o.geometry.attributes.aWind) {
              o.geometry = o.geometry.clone();
              o.geometry.setAttribute("aWind", o.geometry.attributes.color);
              o.geometry.deleteAttribute("color");
            }
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        obj.position.set(x, h - 0.02, z);
        obj.rotation.y = hash(i) * 6.28;
        obj.scale.setScalar(K.species === "pitcher" ? 1.6 : 1.0);
        this.group.add(obj);
        this.specimens.push({ species: K.species, pos: new THREE.Vector3(x, h, z), y: K.y, radius: K.r, obj });
        placed++;
      }
    }
  }

  placeHeart(gltf) {
    const hx = this.t.landmarks.heart;
    const root = gltf.scene;
    const L = this.loader;
    const hn = this.heartNormal = this.heartNormal || L.texture("creatures/heart_normal.webp", { srgb: false }).catch(() => null);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      const m = new THREE.MeshPhysicalMaterial({ color: 0x1c0609, roughness: 0.42, clearcoat: 0.9, clearcoatRoughness: 0.35, sheen: 0.25, sheenColor: new THREE.Color(0.35, 0.08, 0.1) });
      hn.then((t) => { if (t) { t.repeat.set(6, 6); m.normalMap = t; m.normalScale.set(1.4, 1.4); m.needsUpdate = true; } });
      // the glow mask is the second colour layer (the first one is plain white)
      const glow = g.attributes.color_1 || g.attributes.color;
      if (glow) { g.setAttribute("aGlow", glow); g.deleteAttribute("color"); g.deleteAttribute("color_1"); }
      const pulse = this.heartPulse;
      this.std(m, {
        extra: {
          key: "heart", uniforms: { uPulse: pulse },
          vertexPars: "attribute vec4 aGlow; uniform float uPulse; varying float vGlow;",
          vertex: "vGlow = aGlow.r;",
          fragmentPars: "varying float vGlow; uniform float uPulse;",
          fragment: "outgoingLight += vec3(1.0, 0.16, 0.24) * vGlow * vGlow * (0.9 + 3.2 * uPulse) * (1.0 + 0.6 * uNight);",
        },
      });
      const generic = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        generic(shader, r);
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
          vec3 transformed = position;
          float beat = uPulse;
          transformed += normal * beat * 0.25 * (0.6 + 0.4 * sin(position.x * 0.6 + uTime));
        `);
      };
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    const y = this.t.heightAt(hx[0], hx[2]);
    root.position.set(hx[0], y - 1.5, hx[2]);
    this.group.add(root);
    this.heart = root;
    this.specimens.push({ species: "heart", pos: new THREE.Vector3(hx[0], y + 4, hx[2]), y: 4, radius: 9, obj: root });
    // a red glow light inside the caldera
    const light = new THREE.PointLight(0xff3040, 0, 120, 1.6);
    light.position.set(hx[0], y + 10, hx[2]);
    this.group.add(light);
    this.heartLight = light;
  }

  update(dt, time, night) {
    // heartbeat: double thump every ~1.6 s
    const ph = (time % 1.6) / 1.6;
    const beat = Math.exp(-(((ph - 0.08) / 0.05) ** 2)) + 0.6 * Math.exp(-(((ph - 0.26) / 0.06) ** 2));
    this.heartPulse.value = beat;
    if (this.heartLight) this.heartLight.intensity = (400 + 1500 * beat) * (0.3 + night);
    if (this.mushroomGlow) this.mushroomGlow.emissiveIntensity = 2.2 * night;
    for (const { obj } of this.antennas.values()) {
      obj.userData.blink = (obj.userData.blink || 0) + dt;
    }
    // distance culling of the specimen props
    const cam = this.engine.camera.position;
    for (const s of this.specimens) {
      if (s.species === "heart") continue;
      const d = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z);
      const vis = d < 150;
      if (s.obj.visible !== vis) s.obj.visible = vis;
      const cast = d < 45;
      if (s.cast !== cast) { s.cast = cast; s.obj.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
    }
  }

  // ---- antennas
  addAntenna(a) {
    if (this.antennas.has(a.id)) return;
    const obj = placeable(this.antennaModel);
    obj.position.set(a.x, this.t.heightAt(a.x, a.z) - 0.02, a.z);
    obj.rotation.y = (a.id * 1.7) % 6.28;
    if (a.shield) {
      obj.traverse((o) => {
        if (o.isMesh && /orange/.test(o.material.name)) {
          const m = o.material.clone();
          m.color.setRGB(0.2, 0.22, 0.25);
          this.std(m);
          o.material = m;
        }
      });
    }
    this.group.add(obj);
    this.antennas.set(a.id, { obj, data: a });
  }
  removeAntenna(id) {
    const e = this.antennas.get(id);
    if (!e) return;
    this.group.remove(e.obj);
    this.antennas.delete(id);
  }

  // ---- memos
  addMemo(m) {
    if (this.memos.has(m.id) || !this.items.memo) return;
    const obj = placeable(this.items.memo);
    obj.position.set(m.x, this.t.heightAt(m.x, m.z), m.z);
    obj.rotation.y = hash(m.id.length + m.x) * 6.28;
    this.group.add(obj);
    this.memos.set(m.id, { obj, data: m });
  }
  removeMemo(id) {
    const e = this.memos.get(id);
    if (!e) return;
    this.group.remove(e.obj);
    this.memos.delete(id);
  }
}
