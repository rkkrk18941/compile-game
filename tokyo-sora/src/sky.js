// Sky dome + time-of-day presets (morning / day / evening / night), smoothly blended.
import * as THREE from 'three';
import { shared, skyMaterial } from './shaders.js';

const C = (h) => new THREE.Color(h);
export const TIMES = ['morning', 'day', 'evening', 'night'];
export const TIME_LABEL = { morning: '朝', day: '昼', evening: '夕方', night: '夜' };
const PRESETS = {
  morning: { el: 13, az: 100, sun: C('#ffd6a8'), sunI: 1.05, top: C('#5f95d8'), hor: C('#f1d6bf'), bottom: C('#b9b2aa'), ambSky: C('#8a97ad'), ambGround: C('#5f564e'), amb: 0.55, night: 0, tint: C('#fff1e0'), vis: 11000 },
  day: { el: 56, az: 165, sun: C('#fff7ea'), sunI: 1.0, top: C('#3d7ad0'), hor: C('#bad3ea'), bottom: C('#a9bccd'), ambSky: C('#93a8c6'), ambGround: C('#6d665d'), amb: 0.6, night: 0, tint: C('#ffffff'), vis: 14000 },
  evening: { el: 5, az: 252, sun: C('#ff9a55'), sunI: 1.0, top: C('#33467c'), hor: C('#ef9a66'), bottom: C('#7d6466'), ambSky: C('#6d6a8e'), ambGround: C('#54443e'), amb: 0.5, night: 0.28, tint: C('#ffd7b8'), vis: 10000 },
  night: { el: 38, az: 205, sun: C('#93a9d8'), sunI: 0.28, top: C('#040918'), hor: C('#17233f'), bottom: C('#0a0f1d'), ambSky: C('#1f2948'), ambGround: C('#0d0f17'), amb: 0.6, night: 1, tint: C('#2f3a58'), vis: 10000 },
};

export class Sky {
  constructor(scene) {
    this.u = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: shared.uSunDir, uSunColor: { value: new THREE.Color() }, uNight: shared.uNight, uHorizonY: { value: 0 },
    };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(this.u));
    this.mesh.renderOrder = -1000; this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1.5e6);
    scene.add(this.mesh);
    this.cur = this.clone(PRESETS.day);
    this.target = PRESETS.day; this.name = 'day';
    this.from = null; this.t = 1;
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(this.sunLight, this.hemi);
    this.apply(this.cur);
  }
  clone(p) { const o = {}; for (const k in p) o[k] = p[k] && p[k].isColor ? p[k].clone() : p[k]; return o; }
  set(name, instant) {
    if (!PRESETS[name]) name = 'day';
    this.name = name;
    this.from = this.clone(this.cur); this.target = PRESETS[name]; this.t = instant ? 1 : 0;
    if (instant) { this.cur = this.clone(this.target); this.apply(this.cur); }
  }
  next() { const i = TIMES.indexOf(this.name); this.set(TIMES[(i + 1) % TIMES.length]); return this.name; }
  update(dt, camera, alt) {
    if (this.t < 1 && this.from) {
      this.t = Math.min(1, this.t + dt / 2.2);
      const k = this.t * this.t * (3 - 2 * this.t);
      const a = this.from, b = this.target, c = this.cur;
      for (const key in b) {
        if (b[key] && b[key].isColor) c[key].copy(a[key]).lerp(b[key], k);
        else if (key === 'az') { let d = ((b.az - a.az + 540) % 360) - 180; c.az = a.az + d * k; }
        else c[key] = a[key] + (b[key] - a[key]) * k;
      }
      this.apply(c);
    }
    this.mesh.position.copy(camera.position);
    const h = Math.max(0, alt);
    this.u.uHorizonY.value = -Math.sqrt(2 * h / 6371000);
    shared.uFogDensity.value = 1 / (this.cur.vis + h * 30);
  }
  apply(c) {
    const el = c.el * Math.PI / 180, az = c.az * Math.PI / 180;
    shared.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    shared.uSunColor.value.copy(c.sun).multiplyScalar(c.sunI);
    shared.uAmbSky.value.copy(c.ambSky).multiplyScalar(c.amb);
    shared.uAmbGround.value.copy(c.ambGround).multiplyScalar(c.amb);
    shared.uNight.value = c.night;
    shared.uTint.value.copy(c.tint);
    shared.uFogColor.value.copy(c.hor);
    this.u.uTop.value.copy(c.top); this.u.uHor.value.copy(c.hor); this.u.uBottom.value.copy(c.bottom);
    this.u.uSunColor.value.copy(c.sun);
    // lights for the built-in materials (hero, landmarks)
    this.sunLight.color.copy(c.sun); this.sunLight.intensity = c.sunI * Math.PI;
    this.sunLight.position.copy(shared.uSunDir.value).multiplyScalar(1000);
    this.hemi.color.copy(c.ambSky); this.hemi.groundColor.copy(c.ambGround); this.hemi.intensity = c.amb * Math.PI;
  }
  get night() { return this.cur.night; }
}
