// Sky dome + time of day (manual presets or the real sun position) + weather tinting.
import * as THREE from 'three';
import { shared, skyMaterial } from './shaders.js';

const C = (h) => new THREE.Color(h);
export const TIMES = ['real', 'morning', 'day', 'evening', 'night'];
export const TIME_LABEL = { real: 'いま', morning: '朝', day: '昼', evening: '夕方', night: '夜' };
const PRESETS = {
  morning: { el: 13, az: 100, sun: C('#ffd6a8'), sunI: 1.05, top: C('#5f95d8'), hor: C('#f1d6bf'), bottom: C('#b9b2aa'), ambSky: C('#8a97ad'), ambGround: C('#5f564e'), amb: 0.55, night: 0, tint: C('#fff1e0'), vis: 11000 },
  day: { el: 56, az: 165, sun: C('#fff7ea'), sunI: 1.0, top: C('#3d7ad0'), hor: C('#bad3ea'), bottom: C('#a9bccd'), ambSky: C('#93a8c6'), ambGround: C('#6d665d'), amb: 0.6, night: 0, tint: C('#ffffff'), vis: 14000 },
  evening: { el: 5, az: 252, sun: C('#ff9a55'), sunI: 1.0, top: C('#33467c'), hor: C('#ef9a66'), bottom: C('#7d6466'), ambSky: C('#6d6a8e'), ambGround: C('#54443e'), amb: 0.5, night: 0.28, tint: C('#ffd7b8'), vis: 10000 },
  night: { el: 38, az: 205, sun: C('#93a9d8'), sunI: 0.28, top: C('#040918'), hor: C('#17233f'), bottom: C('#0a0f1d'), ambSky: C('#1f2948'), ambGround: C('#0d0f17'), amb: 0.6, night: 1, tint: C('#2f3a58'), vis: 10000 },
};
function clone(p) { const o = {}; for (const k in p) o[k] = p[k] && p[k].isColor ? p[k].clone() : p[k]; return o; }
function mix(a, b, k) {
  const o = {};
  for (const key in a) {
    if (a[key] && a[key].isColor) o[key] = a[key].clone().lerp(b[key], k);
    else if (key === 'az') { const d = ((b.az - a.az + 540) % 360) - 180; o.az = a.az + d * k; }
    else o[key] = a[key] + (b[key] - a[key]) * k;
  }
  return o;
}
// sky parameters for a real sun elevation / azimuth
export function presetForSun(el, az) {
  const am = az < 180; // morning side
  const low = am ? PRESETS.morning : PRESETS.evening;
  let p;
  if (el >= 22) p = clone(PRESETS.day);
  else if (el >= 6) p = mix(low, PRESETS.day, (el - 6) / 16);
  else if (el >= -4) p = clone(low);
  else if (el >= -12) p = mix(PRESETS.night, low, (el + 12) / 8);
  else p = clone(PRESETS.night);
  if (el > -2) { p.el = Math.max(el, 1.5); p.az = az; }
  return p;
}

export class Sky {
  constructor(scene) {
    this.u = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: shared.uSunDir, uSunColor: { value: new THREE.Color() }, uNight: shared.uNight, uHorizonY: { value: 0 }, uCloud: { value: 0 },
    };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(this.u));
    this.mesh.renderOrder = -1000; this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1.5e6);
    scene.add(this.mesh);
    this.cur = clone(PRESETS.day); this.target = PRESETS.day; this.name = 'day';
    this.from = null; this.t = 1;
    this.weather = { cloud: 0.15, rain: 0, snow: 0, fog: 0 }; this.wcur = { cloud: 0.15, rain: 0, snow: 0, fog: 0 };
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(this.sunLight, this.hemi);
    this.apply(this.cur);
  }
  // manual preset name, or 'real' with a parameter set from presetForSun()
  set(name, instant, params) {
    this.name = name;
    const target = name === 'real' ? params || PRESETS.day : PRESETS[name] || PRESETS.day;
    this.from = clone(this.cur); this.target = target; this.t = instant ? 1 : 0;
    if (instant) { this.cur = clone(target); this.apply(this.cur); }
  }
  setWeather(w) { this.weather = { cloud: w.cloud || 0, rain: w.rain || 0, snow: w.snow || 0, fog: w.fog || 0 }; }
  update(dt, camera, alt) {
    let dirty = false;
    if (this.t < 1 && this.from) {
      this.t = Math.min(1, this.t + dt / 2.2);
      const k = this.t * this.t * (3 - 2 * this.t);
      this.cur = mix(this.from, this.target, k);
      dirty = true;
    }
    for (const key of ['cloud', 'rain', 'snow', 'fog']) {
      const d = this.weather[key] - this.wcur[key];
      if (Math.abs(d) > 0.001) { this.wcur[key] += d * Math.min(1, dt * 0.8); dirty = true; }
    }
    if (dirty) this.apply(this.cur);
    this.mesh.position.copy(camera.position);
    const h = Math.max(0, alt);
    this.u.uHorizonY.value = -Math.sqrt(2 * h / 6371000);
    const w = this.wcur;
    const vis = this.cur.vis * (1 - 0.45 * w.rain - 0.35 * w.snow) * (1 - 0.7 * w.fog) * (1 - 0.15 * w.cloud);
    shared.uFogDensity.value = 1 / (vis + h * 30);
  }
  apply(c0) {
    const w = this.wcur;
    const c = clone(c0);
    const grey = (col, k) => { const l = col.r * 0.3 + col.g * 0.55 + col.b * 0.15; col.lerp(new THREE.Color(l, l, l * 1.04), k); };
    const ov = Math.min(1, w.cloud * 0.75 + w.rain * 0.4 + w.snow * 0.4);
    grey(c.top, ov * 0.75); grey(c.hor, ov * 0.6); grey(c.bottom, ov * 0.5); grey(c.tint, ov * 0.35); grey(c.sun, ov * 0.4);
    const dark = 1 - 0.28 * Math.max(w.rain, w.snow * 0.5) - 0.12 * w.cloud;
    c.top.multiplyScalar(dark); c.hor.multiplyScalar(dark); c.tint.multiplyScalar(0.95 + 0.05 * dark);
    c.sunI *= 1 - 0.62 * ov;
    c.amb *= 1 + 0.18 * ov;
    const el = c.el * Math.PI / 180, az = c.az * Math.PI / 180;
    shared.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    shared.uSunColor.value.copy(c.sun).multiplyScalar(c.sunI);
    shared.uAmbSky.value.copy(c.ambSky).multiplyScalar(c.amb);
    shared.uAmbGround.value.copy(c.ambGround).multiplyScalar(c.amb);
    shared.uNight.value = c.night;
    shared.uTint.value.copy(c.tint);
    shared.uFogColor.value.copy(c.hor);
    shared.uWet.value = Math.min(1, w.rain * 1.2);
    shared.uSkyTop.value.copy(c.top);
    this.u.uTop.value.copy(c.top); this.u.uHor.value.copy(c.hor); this.u.uBottom.value.copy(c.bottom);
    this.u.uSunColor.value.copy(c.sun);
    this.u.uCloud.value = Math.min(1, ov);
    this.sunLight.color.copy(c.sun); this.sunLight.intensity = c.sunI * Math.PI;
    this.sunLight.position.copy(shared.uSunDir.value).multiplyScalar(1000);
    this.hemi.color.copy(c.ambSky); this.hemi.groundColor.copy(c.ambGround); this.hemi.intensity = c.amb * Math.PI;
  }
  get night() { return this.cur.night; }
  get cloudiness() { return this.wcur.cloud; }
}
