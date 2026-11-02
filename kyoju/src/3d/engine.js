import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { FrameBudget } from './performance.js';
import { clamp, lerp, smoothstep } from './noise.js';

export const QUALITY = {
  low: { dpr: 1.15, shadow: 0, bloom: false, aa: true, particles: 650, people: 350, trees: 900, treeRadius: 650, treeNear: 80, beastCell: 0.6, terrainBudget: 2, terrainLevel: 11, clouds: false },
  std: { dpr: 1.5, shadow: 1536, bloom: true, aa: true, particles: 1400, people: 700, trees: 2200, treeRadius: 950, treeNear: 130, beastCell: 0.5, terrainBudget: 3, terrainLevel: 11, clouds: true },
  high: { dpr: 1.75, shadow: 2048, bloom: true, aa: true, particles: 2400, people: 1100, trees: 4000, treeRadius: 1200, treeNear: 180, beastCell: 0.42, terrainBudget: 3, terrainLevel: 12, clouds: true },
};
// モバイル std は QUALITY.std の展開だが、Bloom は明示的に無効のままにする（負荷対策）
const MOBILE_STD = { ...QUALITY.std, bloom: false, dpr: 1.25, shadow: 1024, particles: 900, people: 450, trees: 1300, treeRadius: 750, treeNear: 100, terrainBudget: 2, clouds: false };
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820); }
export function defaultQuality() {
  return isMobile() ? 'low' : 'std';
}

const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function srgb(hex) { return new THREE.Color(hex); }

export class Engine {
  constructor(canvas, quality = 'auto') {
    const selected = quality === 'auto' ? defaultQuality() : quality;
    this.q = { ...(selected === 'std' && isMobile() ? MOBILE_STD : QUALITY[selected] || QUALITY.std) };
    this.qname = selected;
    this.autoResolution = true;
    const r = new THREE.WebGLRenderer({ canvas, antialias: this.q.aa, powerPreference: 'high-performance', stencil: false, alpha: false, depth: true });
    this.budget = new FrameBudget(Math.min(this.q.dpr, window.devicePixelRatio || 1));
    r.setPixelRatio(this.budget.ratio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = this.q.shadow > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 120000);
    this.scene.fog = new THREE.FogExp2(0xbfc8d0, 0.00007);
    this.fogBase0 = 0.000085;
    this.fogBase = this.fogBase0;
    this.haze = 0;

    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    this.sky.frustumCulled = false;
    const su = this.sky.material.uniforms;
    su.turbidity.value = 5.5; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
    su.cloudCoverage.value = this.q.clouds ? 0.26 : 0; su.cloudDensity.value = 0.45; su.cloudScale.value = 0.00018; su.cloudElevation.value = 0.55;
    this.scene.add(this.sky);
    const clampSky = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min(texColor, vec3(2.2)), 1.0 );'); };
    this.sky.material.onBeforeCompile = clampSky;

    this.sun = new THREE.DirectionalLight(0xfff1dd, 3.2);
    this.sun.castShadow = this.q.shadow > 0;
    if (this.sun.castShadow) {
      this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
      const sc = this.sun.shadow.camera;
      sc.left = -380; sc.right = 380; sc.top = 380; sc.bottom = -380; sc.near = 10; sc.far = 3200;
      this.sun.shadow.bias = -0.00008; this.sun.shadow.normalBias = 0.3;
    }
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb8c7d9, 0x3d3324, 1.1);
    this.scene.add(this.hemi);
    this.sunDir = new THREE.Vector3(0.4, 0.4, 0.5).normalize();
    this.shadowCenter = new THREE.Vector3();
    this.shadowSize = 380;
    this.shadowRight = new THREE.Vector3(); this.shadowUp = new THREE.Vector3();
    this.nightDir = new THREE.Vector3();

    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envRT = null;

    this.hours = 16;
    this.stars = this.makeStars();
    this.scene.add(this.stars);

    if (this.q.bloom) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 2.8);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      // Renderer antialiasing does not apply to an offscreen composer target.
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    this.uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: this.sunDir }, uFlora: { value: new THREE.Vector3(0, 0, 1e7) } };
    this.contextLost = false;
    this.onContextLost = (e) => { e.preventDefault(); this.contextLost = true; this.onLost?.(); };
    this.onContextRestored = () => { this.contextLost = false; this.budget.reset(); this.envRT?.dispose(); this.envRT = null; this.setTime(this.hours); this.onRestored?.(); };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }
  makeStars() {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * rr * 9000; pos[i * 3 + 1] = y * 9000; pos[i * 3 + 2] = Math.sin(a) * rr * 9000;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -1;
    return p;
  }
  resize() {
    const c = this.renderer.domElement;
    const w = Math.max(1, c.clientWidth || window.innerWidth), h = Math.max(1, c.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(this.budget.ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      const pr = this.renderer.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
  }
  // 時刻（時）→ 太陽・空・光
  setTime(hours) {
    this.hours = hours;
    const rise = 6.6, set = 18.6;
    const u = (hours - rise) / (set - rise);
    const el = Math.sin(clamp(u, -0.25, 1.25) * Math.PI) * THREE.MathUtils.degToRad(38) - (u < 0 || u > 1 ? 0.05 : 0);
    const az = THREE.MathUtils.degToRad(90 + 180 * u);
    const d = this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(d);
    const day = smoothstep(-0.12, 0.12, d.y);
    const golden = smoothstep(0.42, 0.05, d.y) * day;
    const night = 1 - smoothstep(-0.2, -0.02, d.y);
    this.night = night;
    this.uniforms.uNight.value = night;
    this.sky.material.uniforms.rayleigh.value = lerp(1.4, 3.2, golden);
    this.sky.material.uniforms.turbidity.value = lerp(5, 9, golden) + this.haze * 6;
    // 太陽光
    _c.setRGB(1, lerp(0.95, 0.62, golden), lerp(0.88, 0.38, golden));
    this.sun.color.copy(_c);
    this.sun.intensity = lerp(0, 2.8, day) * (1 - this.haze * 0.45);
    // 月明かり
    if (d.y < 0.02) { this.sun.color.setRGB(0.55, 0.65, 0.95); this.sun.intensity = 0.32 * night; }
    this.hemi.intensity = lerp(0.22, 0.9, day) * (1 - this.haze * 0.3);
    this.hemi.color.setRGB(lerp(0.3, 0.72, day), lerp(0.36, 0.78, day), lerp(0.55, 0.86, day));
    this.hemi.groundColor.setRGB(lerp(0.06, 0.24, day), lerp(0.06, 0.2, day), lerp(0.08, 0.14, day));
    // 霧の色（地平線の色）：夕景では暖色を強め、密度も僅かに上げて空気感を出す。
    // 密度は controls.js が毎フレーム fogBase から再計算するので、基底値をここで動かす。
    this.fogBase = this.fogBase0 * (1 + golden * 0.35 + this.haze * 0.6);
    const fog = this.scene.fog.color;
    fog.setRGB(lerp(0.035, 0.66, day), lerp(0.045, 0.70, day), lerp(0.08, 0.76, day));
    fog.lerp(_c.setRGB(0.88, 0.52, 0.32), golden * 0.72);
    fog.lerp(_c.setRGB(0.33, 0.25, 0.22), this.haze * 0.5);
    this.stars.material.opacity = night * 0.9;
    this.renderer.toneMappingExposure = lerp(0.85, 1.25, night);
    // Prefilter once. Rebuilding a sky cubemap during marching caused periodic
    // stalls and abrupt reflection changes. Direct light still follows the sun.
    if (!this.envRT) this.updateEnv();
    this.scene.environmentIntensity = lerp(0.07, 0.45, day);
  }
  updateEnv() {
    const d = this.sunDir;
    const u = this.envSky.material.uniforms, s = this.sky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = s[k].value;
    u.sunPosition.value.set(0.3, 0.6, 0.4).normalize();
    u.cloudCoverage.value = 0; u.showSunDisc.value = 0;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.5, 5000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = lerp(0.08, 0.6, smoothstep(-0.1, 0.2, d.y));
  }
  // 影の範囲をカメラの注視点に合わせる
  updateShadow(center, size) {
    if (!this.sun.castShadow) {
      const dir = this.sunDir.y > 0.02 ? this.sunDir : this.nightDir.set(-this.sunDir.x, Math.max(0.35, -this.sunDir.y + 0.5), -this.sunDir.z).normalize();
      this.sun.position.copy(center).addScaledVector(dir, 1500);
      this.sun.target.position.copy(center);
      return;
    }
    // Snap in LIGHT space, not world X/Z. This keeps the shadow texels fixed
    // while the follow camera moves diagonally through the kingdom.
    size = clamp(size, 128, 1024);
    const bucket = size <= 200 ? 256 : size <= 430 ? 512 : 1024;
    const sc = this.sun.shadow.camera;
    if (bucket !== this.shadowSize) {
      this.shadowSize = bucket;
      sc.left = -bucket; sc.right = bucket; sc.top = bucket; sc.bottom = -bucket; sc.updateProjectionMatrix();
    }
    const dir = this.sunDir.y > 0.02 ? this.sunDir : this.nightDir.set(-this.sunDir.x, Math.max(0.35, -this.sunDir.y + 0.5), -this.sunDir.z).normalize();
    const right = this.shadowRight.crossVectors(UP, dir).normalize();
    const up = this.shadowUp.crossVectors(dir, right).normalize();
    const texel = (this.shadowSize * 2) / this.q.shadow;
    this.shadowCenter.copy(center)
      .addScaledVector(right, Math.round(center.dot(right) / texel) * texel - center.dot(right))
      .addScaledVector(up, Math.round(center.dot(up) / texel) * texel - center.dot(up));
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.position.copy(this.shadowCenter).addScaledVector(dir, 1600);
    this.sun.shadow.normalBias = 0.22 + this.shadowSize / 4000;
  }
  measure(dt) {
    if (this.autoResolution && this.budget.sample(dt)) this.resize();
  }

  render(dt) {
    if (this.contextLost) return;
    this.uniforms.uTime.value += dt;
    this.sky.material.uniforms.time.value += dt;
    this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material, o.customDepthMaterial, o.customDistanceMaterial].flat()) if (m) materials.add(m);
      if (o.skeleton) skeletons.add(o.skeleton);
      if (o.isInstancedMesh) o.dispose();
    });
    for (const m of materials) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      m.dispose();
    }
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const s of skeletons) s.dispose();
    if (this.composer) { for (const p of this.composer.passes) p.dispose?.(); this.composer.dispose(); }
    if (this.envRT) this.envRT.dispose();
    this.envSky.geometry.dispose(); this.envSky.material.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch (e) { /* already lost */ }
  }
}
