// "Real-time" Tokyo: sun position for the current moment, current weather from Open-Meteo, rain/snow.
import * as THREE from 'three';
import { shared } from './shaders.js';

export function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * rad;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = ((gmst * 15 + lon) * rad - ra);
  const la = lat * rad;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
  az = (az / rad + 360) % 360;
  return { el: el / rad, az };
}

const WTEXT = (c) => (c === 0 ? '快晴' : c <= 1 ? '晴れ' : c === 2 ? '晴れ時々くもり' : c === 3 ? 'くもり' : c === 45 || c === 48 ? '霧'
  : c >= 51 && c <= 57 ? '霧雨' : c >= 61 && c <= 67 ? '雨' : c >= 71 && c <= 77 ? '雪' : c >= 80 && c <= 82 ? 'にわか雨' : c >= 85 && c <= 86 ? 'にわか雪' : c >= 95 ? '雷雨' : '—');

export class Weather {
  constructor() { this.data = null; this.at = 0; }
  async refresh(lat, lon) {
    if (Date.now() - this.at < 9 * 60 * 1000 && this.data) return this.data;
    this.at = Date.now();
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,precipitation,rain,snowfall,cloud_cover,weather_code,wind_speed_10m&timezone=Asia%2FTokyo`;
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const c = j.current || {};
      this.data = { code: c.weather_code | 0, cloud: (c.cloud_cover || 0) / 100, rain: Math.min(1, (c.rain || c.precipitation || 0) / 3), snow: Math.min(1, (c.snowfall || 0) * 2), temp: c.temperature_2m, wind: c.wind_speed_10m, text: WTEXT(c.weather_code | 0) };
      if (this.data.code >= 51 && this.data.code <= 67 && this.data.rain < 0.25) this.data.rain = 0.35;
      if (this.data.code >= 80 && this.data.code <= 82 && this.data.rain < 0.4) this.data.rain = 0.5;
      if (this.data.code >= 95) this.data.rain = Math.max(this.data.rain, 0.8);
      if (this.data.code >= 71 && this.data.code <= 77) this.data.snow = Math.max(this.data.snow, 0.5);
      this.data.fog = this.data.code === 45 || this.data.code === 48 ? 1 : 0;
    } catch (e) { this.at = Date.now() - 8 * 60 * 1000; }
    return this.data;
  }
}
export const MANUAL_WEATHER = {
  clear: { code: 0, cloud: 0.05, rain: 0, snow: 0, fog: 0, text: '晴れ' },
  cloudy: { code: 3, cloud: 0.9, rain: 0, snow: 0, fog: 0, text: 'くもり' },
  rain: { code: 63, cloud: 1, rain: 0.7, snow: 0, fog: 0, text: '雨' },
  snow: { code: 73, cloud: 1, rain: 0, snow: 0.7, fog: 0, text: '雪' },
};

// falling rain streaks / snow flakes around the camera
export class Precip {
  constructor(scene) {
    const N = 1600;
    this.N = N;
    this.off = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.off[i * 3] = (Math.random() - 0.5) * 70; this.off[i * 3 + 1] = Math.random() * 40; this.off[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    this.pos = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.mat = new THREE.LineBasicMaterial({ color: '#c8d4e2', transparent: true, opacity: 0.35, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 9;
    scene.add(this.lines);
    this.t = 0; this.rain = 0; this.snow = 0;
  }
  update(dt, cam, rain, snow) {
    this.rain = rain; this.snow = snow;
    const k = Math.max(rain, snow);
    this.lines.visible = k > 0.02;
    if (!this.lines.visible) return;
    const n = Math.floor(this.N * Math.min(1, k * 1.3));
    const fall = snow > rain ? 2.2 : 26, len = snow > rain ? 0.08 : 0.9;
    this.t += dt;
    const P = this.pos;
    for (let i = 0; i < n; i++) {
      let x = this.off[i * 3], z = this.off[i * 3 + 2];
      let y = 40 - ((this.off[i * 3 + 1] + this.t * fall) % 40);
      if (snow > rain) { x += Math.sin(this.t * 0.8 + i) * 0.6; z += Math.cos(this.t * 0.7 + i * 1.3) * 0.6; }
      const wx = ((x - cam.x) % 70 + 105) % 70 - 35 + cam.x, wz = ((z - cam.z) % 70 + 105) % 70 - 35 + cam.z;
      const wy = cam.y - 15 + y;
      P[i * 6] = wx; P[i * 6 + 1] = wy; P[i * 6 + 2] = wz;
      P[i * 6 + 3] = wx + (snow > rain ? 0.05 : 0.15); P[i * 6 + 4] = wy - len; P[i * 6 + 5] = wz + (snow > rain ? 0.05 : 0.05);
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    this.attr.needsUpdate = true;
    this.mat.opacity = snow > rain ? 0.9 : 0.3 + 0.2 * rain;
    this.mat.color.set(snow > rain ? '#ffffff' : '#c8d4e2').multiplyScalar(1 - shared.uNight.value * 0.6);
  }
}
