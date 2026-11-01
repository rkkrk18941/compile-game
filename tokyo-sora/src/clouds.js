// A sparse layer of soft billboard clouds that wraps around the camera.
import * as THREE from 'three';
import { shared } from './shaders.js';

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 40 + rnd() * 176, y = 52 + rnd() * 40 - Math.abs(x - 128) * 0.12, r = 18 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPAN = 30000;
export class Clouds {
  constructor(scene) {
    const tex = cloudTexture();
    this.items = [];
    this.color = new THREE.Color();
    let s = 99;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.9 });
      const sp = new THREE.Sprite(mat);
      const size = 700 + rnd() * 1100;
      sp.scale.set(size * 2, size, 1);
      sp.renderOrder = 2;
      scene.add(sp);
      this.items.push({ sp, mat, ox: rnd() * SPAN, oz: rnd() * SPAN, y: 1500 + rnd() * 1300, size });
    }
    this.drift = 0;
  }
  update(dt, cam, night) {
    this.drift += dt * 5;
    this.color.copy(shared.uSunColor.value).multiplyScalar(0.55).add(shared.uAmbSky.value).multiplyScalar(1.15);
    const lum = Math.max(this.color.r, this.color.g, this.color.b);
    if (lum > 1) this.color.multiplyScalar(1 / lum);
    for (const it of this.items) {
      const x = cam.x + ((((it.ox + this.drift - cam.x) % SPAN) + SPAN) % SPAN) - SPAN / 2;
      const z = cam.z + ((((it.oz - cam.z) % SPAN) + SPAN) % SPAN) - SPAN / 2;
      it.sp.position.set(x, it.y, z);
      const d = Math.hypot(x - cam.x, it.y - cam.y, z - cam.z);
      const near = Math.min(1, Math.max(0, (d - it.size * 0.25) / (it.size * 0.6)));
      it.mat.opacity = (0.85 - night * 0.45) * near;
      it.mat.color.copy(this.color);
      it.sp.visible = near > 0.01;
    }
  }
}
