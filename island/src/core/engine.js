// Renderer, scene, camera, sun/moon light with cascaded shadows, sky and post.
import * as THREE from "three";
import { CSM } from "three/addons/csm/CSM.js";
import { G } from "../gfx/shaderlib.js";
import { Sky } from "../gfx/sky.js";
import { Post } from "../gfx/post.js";
import { detectQuality, DynamicResolution } from "./quality.js";

export class Engine {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, alpha: false });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the final pass encodes sRGB itself
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.quality = detectQuality(renderer);
    const q = this.quality;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.12, 14000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.sky = new Sky(renderer, q);
    this.scene.add(this.sky.dome);
    this.sky.onEnv = (tex) => { this.scene.environment = tex; };

    // sun & moon share the cascaded shadow lights
    this.csm = new CSM({
      maxFar: q.shadowFar,
      cascades: q.shadowCascades,
      shadowMapSize: q.shadowSize,
      lightDirection: new THREE.Vector3(-0.5, -1, -0.3).normalize(),
      camera: this.camera,
      parent: this.scene,
      lightIntensity: 3,
      lightNear: 1,
      lightFar: 3000,
      lightMargin: 260,
      shadowBias: -0.00025,
      mode: "practical",
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.shadow.normalBias = 0.035;
      l.shadow.radius = 2.2;
    }
    this.post = new Post(renderer, q);
    this.dynres = new DynamicResolution(q, (pr) => { this.pixelRatio = pr; this.resize(); });
    this.pixelRatio = q.pixelRatio;

    this.dayFrac = 0.33;
    this.exposure = 1;
    this.targetExposure = 1;
    this.canopyAtCamera = 0;
    this.time = 0;
    this.clock = new THREE.Clock();
    this.sunVis = { uv: new THREE.Vector2(), vis: 0 };
    this.flash = 0;
    this.grade = { tint: new THREE.Vector3(1, 1, 1) };

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.sky.setTime(this.dayFrac);
    this.sky.update(0, true);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + "px";
    this.renderer.domElement.style.height = h + "px";
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 62;
    this.camera.updateProjectionMatrix();
    const pw = Math.floor(w * this.pixelRatio), ph = Math.floor(h * this.pixelRatio);
    this.post.setSize(pw, ph);
    this.csm.updateFrustums();
  }

  setTime(frac) {
    this.dayFrac = ((frac % 1) + 1) % 1;
    this.sky.setTime(this.dayFrac);
  }

  /** Lighting, exposure and shadows; call once per frame before render(). */
  update(dt) {
    this.time += dt;
    G.uTime.value = this.time;
    const sky = this.sky;
    sky.update(this.time);
    const sun = sky.sunDir;
    const night = THREE.MathUtils.smoothstep(-sun.y, -0.04, 0.12);
    G.uSunDir.value.copy(sun.y > -0.04 ? sun : sky.moonDir);
    G.uNight.value = night;
    // light from the sun by day, a faint blue moon at night
    const lightDir = sun.y > -0.04 ? sun : sky.moonDir;
    this.csm.lightDirection.copy(lightDir).negate();
    const sunC = sky.sunColor;
    const sunI = 4.2;
    const moonC = new THREE.Color(0.55, 0.65, 0.95).multiplyScalar(0.11 * Math.max(sky.moonDir.y, 0));
    const lc = _c.copy(sunC).multiplyScalar(sunI);
    if (sun.y < -0.04) lc.copy(moonC);
    G.uSunColor.value.copy(lc);
    for (const l of this.csm.lights) {
      l.color.copy(lc);
      l.intensity = 1;
    }
    G.uFogColor.value.copy(sky.fogColor);
    G.uFogSun.value.copy(sky.fogSun);

    // eye adaptation: brighter under canopy and at night
    const sunLum = 0.2126 * lc.r + 0.7152 * lc.g + 0.0722 * lc.b;
    const amb = 0.2126 * sky.ambient.r + 0.7152 * sky.ambient.g + 0.0722 * sky.ambient.b;
    const scene = sunLum * Math.max(0.15, 1 - this.canopyAtCamera * 0.8) + amb * 1.4 + 0.02;
    // the eye never fully adapts to moonlight: nights stay dark and the headlamp carries the scene
    this.targetExposure = THREE.MathUtils.clamp(1.35 / Math.pow(scene, 0.72), 0.35, THREE.MathUtils.lerp(14, 3.6, night));
    const k = 1 - Math.exp(-dt * (this.targetExposure > this.exposure ? 0.9 : 2.2));
    this.exposure += (this.targetExposure - this.exposure) * k;
    sky.domeMat.uniforms.uExposure.value = 1; // dome is in scene-referred units already
    this.csm.update();
  }

  render() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    // sun position on screen for god rays
    const sd = _v.copy(this.sky.sunDir).multiplyScalar(4000).add(cam.position).project(cam);
    const facing = _v2.set(0, 0, -1).applyQuaternion(cam.quaternion).dot(this.sky.sunDir);
    this.sunVis.uv.set(sd.x * 0.5 + 0.5, sd.y * 0.5 + 0.5);
    this.sunVis.vis = THREE.MathUtils.smoothstep(facing, 0.1, 0.5) * THREE.MathUtils.smoothstep(this.sky.sunDir.y, -0.02, 0.08);
    const p = this.post.u;
    p.uExposure.value = this.exposure;
    p.uScotopic.value = G.uNight.value;
    p.uTint.value.copy(this.grade.tint);
    p.uFlash.value = this.flash;
    this.renderer.info.reset();
    this.post.render(this.scene, cam, this.time, this.sunVis);
  }
}
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
