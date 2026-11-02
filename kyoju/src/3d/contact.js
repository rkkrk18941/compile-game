import * as THREE from 'three';
import { groundH } from './world.js';

// Soft grounding survives the mobile preset without a second shadow-map pass.
// A small conforming mesh avoids the rectangular blob floating through slopes.
export class ContactShadow {
  constructor(engine, beast) {
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 14;
      data[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 1.6) * 110);
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(beast.height * 0.8, beast.height * 1.1, 8, 8);
    geometry.rotateX(-Math.PI / 2);
    this.local = geometry.attributes.position.array.slice();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    engine.scene.add(this.mesh);
    this.lastX = Infinity; this.lastZ = Infinity; this.lastYaw = Infinity;
  }
  update(pos, yaw) {
    if (Math.hypot(pos.x - this.lastX, pos.z - this.lastZ) < 1 && Math.abs(yaw - this.lastYaw) < 0.03) return;
    this.lastX = pos.x; this.lastZ = pos.z; this.lastYaw = yaw;
    const p = this.mesh.geometry.attributes.position, c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < p.count; i++) {
      const lx = this.local[i * 3], lz = this.local[i * 3 + 2];
      const x = pos.x + lx * c + lz * s, z = pos.z - lx * s + lz * c;
      p.setXYZ(i, x, groundH(x, z) + 0.18, z);
    }
    p.needsUpdate = true;
  }
}
