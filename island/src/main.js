// The・Island — entry point.
import * as THREE from "three";
import { Engine } from "./core/engine.js";
import { Loader, loadTerrainData } from "./core/loader.js";
import { Input } from "./core/input.js";
import { Game } from "./game/game.js";
import { Audio } from "./audio/audio.js";
import { G } from "./gfx/shaderlib.js";

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

async function boot() {
  const engine = new Engine($("stage"));
  const loader = new Loader();
  loader.onProgress = (p) => { $("lbar").style.width = (p * 100).toFixed(1) + "%"; };
  const msg = (t) => { $("lmsg").textContent = t; };
  msg("島のデータを読み込んでいます…");
  const tdata = await loadTerrainData(loader);
  const input = new Input(engine.renderer.domElement);
  const game = new Game(engine, loader, input, tdata);
  await game.load(msg);
  window.__engine = engine;
  window.__game = game;
  $("loading").hidden = true;

  // debug: ?cam=x,y,z,yawDeg,pitchDeg (free camera), ?play=1 (start an expedition), ?t=dayFraction
  const fly = !!params.get("cam") || params.get("fly") === "1";
  let yaw = 0, pitch = 0;
  if (fly) {
    const c = (params.get("cam") || "0,60,600,0,-5").split(",").map(Number);
    engine.camera.position.set(c[0], c[1], c[2]);
    yaw = c[3] * Math.PI / 180;
    pitch = c[4] * Math.PI / 180;
    game.state = "debug";
  } else if (params.get("play") === "1") {
    game.startExpedition();
    if (params.get("x")) game.player.spawn(+params.get("x"), +params.get("z"), +(params.get("yaw") || 180) * Math.PI / 180);
  } else game.toTitle();
  if (params.get("t")) { engine.setTime(+params.get("t")); game.dayFrac = +params.get("t"); }

  input.onLockChange = () => {};
  // debug camera control for capture scripts
  window.__fly = {
    set(x, y, z, yawDeg, pitchDeg) { engine.camera.position.set(x, y, z); yaw = yawDeg * Math.PI / 180; pitch = pitchDeg * Math.PI / 180; },
    look(x, y, z, tx, ty, tz) {
      engine.camera.position.set(x, y, z);
      const dx = tx - x, dy = ty - y, dz = tz - z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
  };
  document.addEventListener("pointerdown", () => Audio.init(), { once: true });
  window.__stats = () => {
    const out = {};
    engine.scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1);
      const key = o.name || (o.parent && o.parent.name) || "?";
      out[key] = (out[key] || 0) + tris * n;
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + " " + Math.round(v / 1000) + "k");
  };

  let last = performance.now();
  let frames = 0;
  const still = +(params.get("still") || 0);
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const cam = engine.camera;
    if (fly) {
      const look = input.consumeLook();
      yaw -= look.dx;
      pitch = Math.max(-1.45, Math.min(1.45, pitch - look.dy));
      const ax = input.axes();
      const speed = input.held.sprint ? 60 : 12;
      const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      cam.position.addScaledVector(fwd, ax.y * speed * dt).addScaledVector(right, ax.x * speed * dt);
      const gh = game.terrain.heightAt(cam.position.x, cam.position.z);
      cam.position.y = Math.max(cam.position.y, Math.max(gh, 0) + 0.2);
      cam.rotation.set(pitch, yaw, 0);
      const b = game.terrain.biomeAt(cam.position.x, cam.position.z);
      engine.canopyAtCamera = b.forest * (1 - b.vol) * (1 - THREE.MathUtils.smoothstep(cam.position.y - gh, 6, 26));
      if (params.get("anim") === "1") {
        game.fauna.update(dt, { players: [], antennas: [], decoys: [] }, cam);
        game.world.update(dt, engine.time, G.uNight.value);
      }
    } else {
      game.update(dt);
    }
    cam.updateMatrixWorld();
    engine.update(dt);
    game.terrain.update(cam);
    game.foliage.update(cam);
    game.ground.update(cam);
    engine.render();
    engine.dynres.tick(dt);
    input.endFrame();
    frames++;
    if (still && frames >= still) { window.__ready = true; return; }
    if (frames === 3) window.__ready = true;
    if (window.__hold) { window.__held = true; return; }
    requestAnimationFrame(frame);
  }
  // capture scripts: __hold = true stops the loop; __step(n) renders n frames synchronously
  window.__step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { last = performance.now() - dt * 1000; frame(performance.now()); } };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  $("lmsg").textContent = "読み込みに失敗しました: " + (e && e.message ? e.message : e);
});
