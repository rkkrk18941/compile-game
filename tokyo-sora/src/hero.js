// A small caped hero built from primitives. Faces -Z; origin at the feet.
import * as THREE from 'three';
import { addCurvature } from './shaders.js';

export function makeHero() {
  const L = (c) => addCurvature(new THREE.MeshLambertMaterial({ color: c }));
  const skin = L('#f3c9a2'), suit = L('#2f63c9'), suit2 = L('#244c9c'), gold = L('#ffcf3a'), boots = L('#e8473c'), hair = L('#2b2522');
  const capeMat = addCurvature(new THREE.MeshLambertMaterial({ color: '#e63d3d', side: THREE.DoubleSide }));
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.92; root.add(body); // hip pivot
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.34, 4, 10), suit);
  torso.position.y = 0.3; body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), gold); belt.position.y = 0.06; body.add(belt);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), gold); emblem.position.set(0, 0.42, -0.188); emblem.rotation.y = Math.PI; body.add(emblem);
  const head = new THREE.Group(); head.position.y = 0.76; body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin); head.add(face);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.158, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
  hairM.rotation.x = 0.35; hairM.position.z = 0.02; head.add(hairM);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b1b22' });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), eyeMat); e.position.set(0.055 * s, 0.01, -0.138); head.add(e); }
  const limbs = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0.25 * s, 0.56, 0); body.add(arm);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.4, 4, 8), suit); up.position.y = -0.24; arm.add(up);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin); hand.position.y = -0.5; arm.add(hand);
    const leg = new THREE.Group(); leg.position.set(0.1 * s, 0.02, 0); body.add(leg);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.56, 4, 8), suit2); thigh.position.y = -0.36; leg.add(thigh);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.14, 4, 8), boots); boot.position.set(0, -0.78, -0.03); boot.rotation.x = Math.PI / 2 * 0.25; leg.add(boot);
    limbs[s < 0 ? 'armL' : 'armR'] = arm; limbs[s < 0 ? 'legL' : 'legR'] = leg;
  }
  // cape: a plane hanging from the shoulders, bent by speed
  const capeGeo = new THREE.PlaneGeometry(0.46, 0.9, 3, 8);
  capeGeo.translate(0, -0.45, 0);
  const cape = new THREE.Mesh(capeGeo, capeMat);
  const capePivot = new THREE.Group(); capePivot.position.set(0, 0.62, 0.16); body.add(capePivot); capePivot.add(cape);
  const base = capeGeo.attributes.position.array.slice();
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  let phase = 0;
  root.userData.animate = (dt, st) => {
    // st: {mode, speed (m/s horizontal), vy, onGround, fly (0..1 lean), t}
    const t = st.t;
    const lean = st.lean;
    phase += dt * Math.min(16, 2 + st.speed * 1.6);
    const walkAmp = st.mode === 'walk' && st.onGround ? Math.min(1, st.speed / 6) : 0;
    const sw = Math.sin(phase) * 0.75 * walkAmp;
    body.rotation.x = -lean * 1.45;
    body.position.y = 0.92 + (st.mode === 'walk' && st.onGround ? Math.abs(Math.cos(phase)) * 0.05 * walkAmp : Math.sin(t * 2) * 0.04);
    const flyArms = lean;
    limbs.armL.rotation.x = sw * (1 - flyArms) - flyArms * 2.9;
    limbs.armR.rotation.x = -sw * (1 - flyArms) - flyArms * (st.speed > 60 ? 2.9 : 0.4);
    limbs.armL.rotation.z = -0.12 * (1 - flyArms); limbs.armR.rotation.z = 0.12 * (1 - flyArms);
    const air = st.mode === 'fly' ? 1 - lean : (!st.onGround ? 1 : 0);
    limbs.legL.rotation.x = -sw + air * 0.25 * Math.sin(t * 3) + lean * 0.1;
    limbs.legR.rotation.x = sw - air * 0.25 * Math.sin(t * 3 + 1) + lean * 0.18;
    // cape flutter
    const pa = capeGeo.attributes.position, arr = pa.array;
    const flow = Math.min(1, st.speed / 25 + Math.abs(st.vy) / 30);
    for (let i = 0; i < arr.length; i += 3) {
      const y0 = base[i + 1]; const k = -y0 / 0.9; // 0 at top .. 1 at bottom
      const wave = Math.sin(t * (6 + 10 * flow) - k * 5 + base[i] * 4) * (0.03 + 0.09 * flow) * k;
      arr[i] = base[i];
      arr[i + 1] = y0 * (1 - 0.15 * flow * k);
      arr[i + 2] = base[i + 2] + wave + k * k * 0.5 * flow;
    }
    pa.needsUpdate = true;
    capePivot.rotation.x = 0.12 + flow * 0.6 * (1 - lean);
  };
  return root;
}
