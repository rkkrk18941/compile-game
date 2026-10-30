/* シェディー・レディー — the 3D table (three.js r160 from a CDN). Every texture is drawn here or in cards.js.
   World: y is up, the table is an oval on y = 0, the person at this screen always sits at the bottom (+z).
   One card is 1.0 wide and 1.4 long. Other players sit clockwise from the bottom: left, top, right.
   My own hand is not on the table: it is held in front of the camera (the "hud"), big enough to read and tap.
   The page drives the table with small animated steps (draw, take, discard, reveal, shed, refill, reshuffle,
   point) and can always fall back to sync(view), which lays out everything from a view at once. */

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.SL_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const C = window.SL_CARDS;
const CW = 1, CH = 1.4, CT = 0.018;
const PILE_VIS = 5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rad(d) { return d * Math.PI / 180; }

/* ------------------------------------------------------------------ painted surfaces */
function paintFelt(w, h) {
  const cv = canvas(w, h), x = cv.getContext('2d');
  const g = x.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, '#16625c'); g.addColorStop(0.6, '#0e4744'); g.addColorStop(1, '#082d2c');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // felt grain
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  // printed art-deco rings and rays
  x.save(); x.translate(w / 2, h / 2);
  x.strokeStyle = 'rgba(226,192,111,.30)'; x.lineWidth = w * 0.004;
  x.beginPath(); x.ellipse(0, 0, w * 0.43, h * 0.43, 0, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(226,192,111,.16)'; x.lineWidth = w * 0.002;
  x.beginPath(); x.ellipse(0, 0, w * 0.41, h * 0.41, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.ellipse(0, 0, w * 0.13, h * 0.13, 0, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    x.beginPath(); x.moveTo(Math.cos(a) * w * 0.14, Math.sin(a) * h * 0.14); x.lineTo(Math.cos(a) * w * (k % 2 ? 0.2 : 0.24), Math.sin(a) * h * (k % 2 ? 0.2 : 0.24)); x.stroke();
  }
  // little diamonds on the outer ring
  x.fillStyle = 'rgba(226,192,111,.32)';
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, cx = Math.cos(a) * w * 0.42, cy = Math.sin(a) * h * 0.42, s = w * 0.008;
    x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s * 0.7, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s * 0.7, cy); x.closePath(); x.fill();
  }
  x.restore();
  return cv;
}
function paintFloor(s) {
  const cv = canvas(s, s), x = cv.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s * 0.5);
  g.addColorStop(0, '#2a1a24'); g.addColorStop(0.45, '#170e16'); g.addColorStop(1, '#07050a');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(226,192,111,.05)'; x.lineWidth = 2;
  for (let i = -s; i < 2 * s; i += s / 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i - s, s); x.stroke(); x.beginPath(); x.moveTo(i, 0); x.lineTo(i + s, s); x.stroke(); }
  return cv;
}
function paintGlow(w, h, color) {
  const cv = canvas(w, h), x = cv.getContext('2d');
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.55);
  g.addColorStop(0, color); g.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return cv;
}
function paintBokeh(s) {
  const cv = canvas(s, s), x = cv.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return cv;
}
function paintChipTop(s) {
  const cv = canvas(s, s), x = cv.getContext('2d'), c = s / 2;
  const g = x.createRadialGradient(c * 0.8, c * 0.7, s * 0.05, c, c, c);
  g.addColorStop(0, '#fff1bf'); g.addColorStop(0.5, '#e2c06f'); g.addColorStop(1, '#9c7b34');
  x.fillStyle = g; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#5a1435'; x.lineWidth = s * 0.05;
  x.beginPath(); x.arc(c, c, c * 0.78, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; x.beginPath(); x.moveTo(c + Math.cos(a) * c * 0.84, c + Math.sin(a) * c * 0.84); x.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98); x.stroke(); }
  x.fillStyle = '#5a1435';
  x.beginPath(); x.arc(c, c - s * 0.07, s * 0.1, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(c - s * 0.05, c - s * 0.04); x.lineTo(c + s * 0.05, c - s * 0.04); x.lineTo(c + s * 0.09, c + s * 0.2); x.lineTo(c - s * 0.09, c + s * 0.2); x.closePath(); x.fill();
  return cv;
}

/* ------------------------------------------------------------------ layouts */
// angles are degrees clockwise from the bottom: 90 = left, 180 = top, 270 = right
function layoutFor(n, tall) {
  const L = tall
    ? { tall, rx: 4.25, rz: 7.0, seat: [3.25, 6.0], pile: [1.95, 3.45], arc: [80, 280], deck: [0, -0.1], myPile: [-1.25, 4.05], myChips: [1.65, 4.25], elev: 64, fov: 38 }
    : { tall, rx: 7.8, rz: 4.5, seat: [6.4, 3.45], pile: [3.85, 1.95], arc: [88, 272], deck: [0, -0.2], myPile: [-5.9, 2.55], myChips: [5.9, 2.7], elev: 55, fov: 34, sideMine: true };
  const k = n - 1;
  L.phi = [];
  if (k === 1) L.phi.push(180);
  else for (let i = 0; i < k; i++) L.phi.push(L.arc[0] + (L.arc[1] - L.arc[0]) * i / (k - 1));
  if (tall && k === 2) L.phi = [118, 242];
  if (!tall && k === 2) L.phi = [120, 240];
  return L;
}

/* ================================================================== the scene */
export function createScene(host, opts = {}) {
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.keepFrame }); }
  catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  let container = host;
  container.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;
  canvasEl.style.display = 'block'; canvasEl.style.width = '100%'; canvasEl.style.height = '100%'; canvasEl.style.touchAction = 'none';

  const scene = new T.Scene();
  scene.background = new T.Color('#07050a');
  scene.fog = new T.Fog('#07050a', 26, 60);
  const cam = new T.PerspectiveCamera(38, 1, 0.3, 200);
  scene.add(cam);
  scene.add(new T.HemisphereLight('#ffe9c9', '#1a1030', 1.05));
  const key = new T.DirectionalLight('#fff0d8', 1.35); key.position.set(-4, 16, 9); scene.add(key);
  const rim = new T.DirectionalLight('#c9a8ff', 0.35); rim.position.set(8, 6, -12); scene.add(rim);
  const hudLight = new T.PointLight('#fff4e0', 0.0, 20); cam.add(hudLight);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  const tex = (cv) => { const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso; return t; };

  /* ---------------- room and table */
  const floor = new T.Mesh(new T.PlaneGeometry(90, 90), new T.MeshStandardMaterial({ map: tex(paintFloor(1024)), roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; scene.add(floor);
  const bokehMat = new T.SpriteMaterial({ map: tex(paintBokeh(64)), color: '#ffcf8a', transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.55 });
  const bokehs = new T.Group(); scene.add(bokehs);
  {
    const cols = ['#ffcf8a', '#ff8fc8', '#9fd6ff', '#ffd27a', '#c7a3ff'];
    for (let i = 0; i < 26; i++) {
      const s = new T.Sprite(bokehMat.clone()); s.material.color.set(cols[i % cols.length]);
      const a = Math.PI * (0.9 + 1.2 * Math.random()), r = 16 + Math.random() * 12;
      s.position.set(Math.cos(a) * r, 1 + Math.random() * 7, Math.sin(a) * r * 0.9 - 6);
      const sz = 0.6 + Math.random() * 1.8; s.scale.set(sz, sz, 1); s.material.opacity = 0.18 + Math.random() * 0.35;
      bokehs.add(s);
    }
  }
  const feltMat = new T.MeshStandardMaterial({ map: tex(paintFelt(1024, 1024)), roughness: 0.92 });
  const felt = new T.Mesh(new T.CircleGeometry(1, 96), feltMat);
  felt.rotation.x = -Math.PI / 2; scene.add(felt);
  const woodMat = new T.MeshStandardMaterial({ color: '#2b1610', roughness: 0.55, metalness: 0.1 });
  const apron = new T.Mesh(new T.CylinderGeometry(1, 0.96, 1, 96, 1, true), woodMat); scene.add(apron);
  const brass = new T.MeshStandardMaterial({ color: '#d8b25a', roughness: 0.28, metalness: 0.85, emissive: '#3a2a08', emissiveIntensity: 0.25 });
  let rail = null;
  function buildTable(L) {
    felt.scale.set(L.rx, L.rz, 1);
    apron.scale.set(L.rx + 0.32, 0.7, L.rz + 0.32); apron.position.y = -0.36;
    if (rail) { scene.remove(rail); rail.geometry.dispose(); }
    const pts = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * (L.rx + 0.16), 0.08, Math.sin(a) * (L.rz + 0.16))); }
    rail = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 192, 0.2, 10, true), brass);
    scene.add(rail);
  }

  /* ---------------- cards */
  const cardGeo = new T.BoxGeometry(CW, CT, CH);
  const edgeMat = new T.MeshStandardMaterial({ color: '#e9dfc6', roughness: 0.8 });
  const backTex = tex(C.backCanvas(360));
  const backMat = new T.MeshStandardMaterial({ map: backTex, roughness: 0.55, emissive: '#ffffff', emissiveMap: backTex, emissiveIntensity: 0.12 });
  const faceMats = {};
  function faceMat(n) {
    if (!faceMats[n]) { const t = tex(C.faceCanvas(n, 360)); faceMats[n] = new T.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.32 }); }
    return faceMats[n];
  }
  function refreshFaces() {   // after the number font arrives
    Object.keys(faceMats).forEach((n) => { const t = tex(C.faceCanvas(+n, 360)); faceMats[n].map.dispose(); faceMats[n].map = t; faceMats[n].emissiveMap = t; faceMats[n].needsUpdate = true; });
    const b = tex(C.backCanvas(360)); backMat.map = b; backMat.emissiveMap = b; backMat.needsUpdate = true;
  }
  function makeCard(n) {
    const m = new T.Mesh(cardGeo, [edgeMat, edgeMat, n ? faceMat(n) : backMat, backMat, edgeMat, edgeMat]);
    m.userData.n = n || 0;
    return m;
  }
  function setFace(m, n) { m.material[2] = n ? faceMat(n) : backMat; m.userData.n = n || 0; }
  const glowTex = tex(paintGlow(128, 160, 'rgba(255,214,120,0.95)'));
  const glowGeo = new T.PlaneGeometry(CW * 1.5, CH * 1.42);
  function addGlow(m, color) {
    if (m.userData.glow) return m.userData.glow;
    const g = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowTex, color: color || '#ffffff', transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -CT * 0.6; g.renderOrder = -1;
    m.add(g); m.userData.glow = g;
    return g;
  }
  function setGlow(m, on, color) { const g = addGlow(m, color); g.userData.on = !!on; if (color) g.material.color.set(color); }

  /* ---------------- chips, deck, rings */
  const chipGeo = new T.CylinderGeometry(0.26, 0.26, 0.075, 32);
  const chipTop = new T.MeshStandardMaterial({ map: tex(paintChipTop(128)), roughness: 0.35, metalness: 0.5 });
  const chipSide = new T.MeshStandardMaterial({ color: '#b48a3a', roughness: 0.35, metalness: 0.7 });
  function makeChip() { return new T.Mesh(chipGeo, [chipSide, chipTop, chipTop]); }
  const deckGroup = new T.Group(); scene.add(deckGroup);
  const deckBody = new T.Mesh(new T.BoxGeometry(CW, 1, CH), [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]);
  deckGroup.add(deckBody);
  deckBody.userData.pick = { kind: 'deck' };
  const ringTex = tex(paintGlow(128, 128, 'rgba(255,214,120,0.9)'));
  const turnRing = new T.Mesh(new T.PlaneGeometry(3.4, 2.6), new T.MeshBasicMaterial({ map: ringTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0 }));
  turnRing.rotation.x = -Math.PI / 2; turnRing.position.y = 0.01; scene.add(turnRing);

  /* ---------------- state of the table */
  let L = layoutFor(4, false), N = 4, ME = 0, tall = false;
  const seats = [];            // per seat: { hand: [mesh], pile: [n], pileM: [mesh], stack: mesh, chips: [mesh], revealed: bool }
  const hud = new T.Group(); cam.add(hud);
  let mine = [];               // my hand: [{ id, n, mesh }]
  let drawnId = null, selectedId = null;
  let deckCount = 0;
  let pick = { deck: false, piles: [], hand: false };
  let speed = 1;
  let titleMode = false, titleT = 0;
  const titleProps = new T.Group(); scene.add(titleProps);
  let dirty = true;

  function rel(s) { return (s - ME + N) % N; }                  // 0 = me, 1 = next clockwise, …
  function phiOf(s) { return L.phi[rel(s) - 1]; }
  function dirOf(s) { const p = rad(phiOf(s)); return new T.Vector3(-Math.sin(p), 0, Math.cos(p)); }
  function handPos(s) { const p = rad(phiOf(s)); return new T.Vector3(-Math.sin(p) * L.seat[0], 0, Math.cos(p) * L.seat[1]); }
  function pilePos(s) {
    if (s === ME) return new T.Vector3(L.myPile[0], 0, L.myPile[1]);
    const p = rad(phiOf(s)); return new T.Vector3(-Math.sin(p) * L.pile[0], 0, Math.cos(p) * L.pile[1]);
  }
  function chipPos(s) {
    if (s === ME) return new T.Vector3(L.myChips[0], 0, L.myChips[1]);
    const h = handPos(s), p = rad(phiOf(s)), t = new T.Vector3(Math.cos(p), 0, Math.sin(p));
    return h.addScaledVector(t, 1.45).addScaledVector(dirOf(s), -0.2);
  }
  function tagPos(s) {   // opponents: the top edge of the name tag sits just under their cards
    if (s === ME) return new T.Vector3(0, 0, L.myPile[1] + 1.4);
    const up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    return handPos(s).setY(0.55).addScaledVector(up, -0.52);
  }
  function deckPos() { return new T.Vector3(L.deck[0], 0, L.deck[1]); }

  /* ---------------- transforms for each place */
  const Q = (x, y, z, order) => new T.Quaternion().setFromEuler(new T.Euler(x, y, z, order || 'XYZ'));
  const FLAT_UP = Q(0, 0, 0), FLAT_DOWN = Q(0, 0, Math.PI);
  function standingQuat(s) {   // a held card of seat s, its back towards the middle of the table
    const u = dirOf(s), Y = new T.Vector3(0, 1, 0), a = rad(28);
    const ny = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(Y, Math.sin(a)).normalize();   // face → the holder
    const top = Y.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, -Math.sin(a)).normalize();
    const nz = top.clone().negate(), nx = new T.Vector3().crossVectors(ny, nz).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(nx, ny, nz));
  }
  function facingCamQuat() {   // a card turned to look at the camera, upright on screen
    cam.updateMatrixWorld();
    const f = new T.Vector3(); cam.getWorldDirection(f);
    const up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const ny = f.clone().negate(), nz = up.clone().negate(), nx = new T.Vector3().crossVectors(ny, nz).normalize();
    return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(nx, ny, nz));
  }
  // the cards another player holds: a small fan of backs turned towards the camera
  function handSlots(s, count) {
    const out = [], base = handPos(s), q0 = facingCamQuat().multiply(Q(0, 0, Math.PI));
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const fwd = new T.Vector3(); cam.getWorldDirection(fwd);
    for (let i = 0; i < count; i++) {
      const off = i - (count - 1) / 2;
      const fan = new T.Quaternion().setFromAxisAngle(fwd, off * 0.16);
      const pos = base.clone().setY(0.55).addScaledVector(right, off * 0.36).addScaledVector(up, -Math.abs(off) * 0.05).addScaledVector(fwd, -i * 0.02);
      out.push({ pos, quat: fan.multiply(q0), scale: 0.62 });
    }
    return out;
  }
  function revealSlots(s, count) {
    const out = [], q = facingCamQuat();
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const base = s === ME ? new T.Vector3(0, 1.15, (L.sideMine ? 2.2 : L.myPile[1] - 0.4)) : handPos(s).multiplyScalar(0.86).setY(1.25);
    const sc = s === ME ? 1.05 : (tall ? 1.02 : 1.12);
    for (let i = 0; i < count; i++) out.push({ pos: base.clone().addScaledVector(right, (i - (count - 1) / 2) * 1.06 * sc), quat: q, scale: sc });
    return out;
  }
  function pileSlot(s, k, of) {   // the k-th visible card (0 = oldest visible) of a pile showing `of` cards
    const b = pilePos(s), fan = tall ? 0.24 : 0.27;
    const off = (k - (of - 1) / 2) * fan;
    const jitter = ((k * 37 + s * 11) % 7 - 3) * 0.012;
    return { pos: new T.Vector3(b.x + off, CT * (1.2 + k * 1.1) + stackH(s), b.z + k * 0.03), quat: Q(0, jitter, 0), scale: 1 };
  }
  function stackH(s) { const hidden = Math.max(0, seats[s].pile.length - PILE_VIS); return hidden * CT * 0.55; }
  function hudLayout(count) {
    const vp = view();
    const dist = 6, halfH = dist * Math.tan(rad(cam.fov / 2)), halfW = halfH * cam.aspect;
    const barPx = opts.barPx ? opts.barPx() : 70;
    let cw = tall ? Math.min(halfW * 2 * 0.205, halfH * 2 * 0.15) : Math.min(halfH * 2 * 0.24 / 1.4, halfW * 2 * 0.1);
    cw = Math.min(cw, halfW * 1.88 / (1 + Math.max(0, count - 1) * 1.07));
    const gap = cw * 1.07;
    const yBottom = -halfH + (barPx / vp.h) * 2 * halfH + cw * 0.05;
    const out = [];
    for (let i = 0; i < count; i++) {
      const off = i - (count - 1) / 2;
      out.push({ pos: new T.Vector3(off * gap, yBottom + cw * 0.7 - off * off * cw * 0.03, -dist), quat: Q(Math.PI / 2 - 0.1, 0, -off * 0.045, 'ZXY'), scale: cw });
    }
    return out;
  }

  /* ---------------- tweens */
  const tweens = [];
  function moveTo(obj, to, dur, o = {}) {
    dur = (dur || 420) * speed;
    return new Promise((res) => {
      const from = { pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.x };
      if (dur <= 0) { apply(obj, to, 1, from, 0); res(); return; }
      tweens.push({ obj, from, to, t0: performance.now() + (o.delay || 0) * speed, dur, lift: o.lift || 0, res, ease: o.ease || easeIO });
      dirty = true;
    });
  }
  function apply(obj, to, k, from, lift) {
    obj.position.lerpVectors(from.pos, to.pos, k);
    if (lift) obj.position.y += Math.sin(Math.PI * k) * lift;
    obj.quaternion.slerpQuaternions(from.quat, to.quat, k);
    const s = from.scale + ((to.scale == null ? from.scale : to.scale) - from.scale) * k;
    obj.scale.set(s, s, s);
  }
  function stopTweens(obj) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj) { const tw = tweens[i]; tweens.splice(i, 1); tw.res(); } }
  function place(obj, to) { stopTweens(obj); obj.position.copy(to.pos); obj.quaternion.copy(to.quat); obj.scale.setScalar(to.scale == null ? 1 : to.scale); dirty = true; }
  function worldToParent(obj, parent) { parent.attach(obj); }

  /* ---------------- building everything from a view */
  function clearAll() {
    seats.forEach((S) => {
      [...S.hand, ...S.pileM, ...S.chips].forEach((m) => { stopTweens(m); m.removeFromParent(); });
      if (S.stack) S.stack.removeFromParent();
    });
    mine.forEach((c) => { stopTweens(c.mesh); c.mesh.removeFromParent(); });
    seats.length = 0; mine = [];
    floating.forEach((m) => m.removeFromParent()); floating.clear();
  }
  const floating = new Set();     // meshes in flight between places
  function newStack() {
    const m = new T.Mesh(new T.BoxGeometry(CW, 1, CH), [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]);
    m.visible = false; scene.add(m); return m;
  }
  function sync(v) {
    clearAll();
    N = v.n; ME = v.me;
    L = layoutFor(N, tall);
    buildTable(L);
    fitCamera();
    for (let s = 0; s < N; s++) {
      const P = v.players[s];
      const S = { hand: [], pile: P.pile.slice(), pileM: [], stack: newStack(), chips: [], revealed: !!P.shown };
      seats.push(S);
      // pile
      layPile(s, false);
      // chips
      for (let k = 0; k < P.pts; k++) { const c = makeChip(); scene.add(c); place(c, chipSlot(s, k)); S.chips.push(c); }
      // hands
      if (s !== ME) {
        const cnt = P.count;
        const slots = P.shown ? revealSlots(s, cnt) : handSlots(s, cnt);
        for (let k = 0; k < cnt; k++) { const m = makeCard(P.shown ? P.shown[k] : 0); scene.add(m); place(m, slots[k]); S.hand.push(m); }
      }
    }
    // my hand
    const me = v.players[ME];
    drawnId = v.drawnId;
    (me.hand || []).forEach((c) => { const m = makeCard(c.n); m.userData.pick = { kind: 'hand', id: c.id }; hud.add(m); mine.push({ id: c.id, n: c.n, mesh: m }); });
    seats[ME].revealed = !!me.shown;
    layMine(false);
    setDeck(v.deck);
    dirty = true;
  }
  function chipSlot(s, k) {
    const b = chipPos(s);
    return { pos: new T.Vector3(b.x + (k % 2) * 0.06, 0.04 + k * 0.078, b.z), quat: Q(0, k * 0.7, 0), scale: 1 };
  }
  function layPile(s, animate) {
    const S = seats[s], vis = Math.min(PILE_VIS, S.pile.length), hidden = S.pile.length - vis;
    // keep meshes for the visible top cards, oldest first
    while (S.pileM.length > vis) { const m = S.pileM.shift(); stopTweens(m); m.removeFromParent(); }
    while (S.pileM.length < vis) { const n = S.pile[hidden + (vis - S.pileM.length - 1)]; const m = makeCard(n); scene.add(m); S.pileM.unshift(m); place(m, pileSlot(s, 0, vis)); m.position.y -= 0.02; }
    const ps = [];
    S.pileM.forEach((m, k) => { setFace(m, S.pile[hidden + k]); m.userData.pick = k === vis - 1 ? { kind: 'pile', seat: s } : null; const to = pileSlot(s, k, vis); if (animate) ps.push(moveTo(m, to, 260)); else place(m, to); });
    // the hidden rest: a low stack under the visible fan
    if (hidden > 0) {
      const b = pilePos(s), h = hidden * CT * 0.55;
      S.stack.visible = true; S.stack.scale.set(1, h, 1); S.stack.position.set(b.x - (vis - 1) / 2 * (tall ? 0.24 : 0.27), h / 2, b.z);
    } else S.stack.visible = false;
    dirty = true;
    return Promise.all(ps);
  }
  function sortMine() {
    mine.sort((a, b) => {
      if (a.id === drawnId) return 1;
      if (b.id === drawnId) return -1;
      return a.n - b.n || a.id - b.id;
    });
  }
  function layMine(animate) {
    sortMine();
    const slots = hudLayout(mine.length), ps = [];
    mine.forEach((c, i) => {
      const s = slots[i], to = { pos: s.pos.clone(), quat: s.quat, scale: s.scale };
      if (c.id === selectedId) to.pos.y += s.scale * 0.32;
      if (animate) ps.push(moveTo(c.mesh, to, 300)); else place(c.mesh, to);
      setGlow(c.mesh, pick.hand || c.id === drawnId, c.id === selectedId ? '#ffffff' : c.id === drawnId ? '#9be7ff' : '#ffd678');
    });
    return Promise.all(ps);
  }
  function setDeck(n) {
    deckCount = n;
    const h = Math.max(0.012, n * 0.0085);
    deckBody.scale.set(1, h, 1); deckBody.position.set(0, h / 2, 0);
    deckGroup.position.copy(deckPos());
    deckBody.visible = n > 0;
    dirty = true;
  }
  function deckTop() { return deckPos().setY(Math.max(0.012, deckCount * 0.0085) + CT); }
  function layHand(s, animate) {
    const S = seats[s];
    const slots = S.revealed ? revealSlots(s, S.hand.length) : handSlots(s, S.hand.length), ps = [];
    S.hand.forEach((m, i) => { if (animate) ps.push(moveTo(m, slots[i], 340)); else place(m, slots[i]); });
    return Promise.all(ps);
  }

  /* ---------------- animated steps (each resolves when the cards have landed) */
  async function draw(p, card) {
    const m = makeCard(0); scene.add(m);
    place(m, { pos: deckTop(), quat: FLAT_DOWN, scale: 1 });
    setDeck(Math.max(0, deckCount - 1));
    if (p === ME && card) {
      setFace(m, card.n); m.userData.pick = { kind: 'hand', id: card.id };
      worldToParent(m, hud);
      mine.push({ id: card.id, n: card.n, mesh: m }); drawnId = card.id;
      await layMine(true);
    } else {
      seats[p].hand.push(m);
      await layHand(p, true);
    }
  }
  async function take(p, from, n, id) {
    const S = seats[from];
    if (!S.pile.length) return;
    let m = S.pileM.pop();
    S.pile.pop();
    if (!m) { m = makeCard(n); scene.add(m); place(m, pileSlot(from, 0, 1)); }
    m.userData.pick = null; setGlow(m, false);
    layPile(from, true);
    const lift = { pos: m.position.clone().setY(m.position.y + 0.9), quat: FLAT_UP, scale: 1.15 };
    await moveTo(m, lift, 220, { ease: easeOut });
    if (p === ME) {
      setFace(m, n); m.userData.pick = { kind: 'hand', id };
      worldToParent(m, hud);
      mine.push({ id, n, mesh: m }); drawnId = id;
      await layMine(true);
    } else {
      seats[p].hand.push(m);
      await layHand(p, true);
      setFace(m, 0);
    }
  }
  async function discard(p, n, id) {
    let m;
    if (p === ME) {
      const at = mine.findIndex((c) => c.id === id);
      if (at < 0) return;
      m = mine[at].mesh; mine.splice(at, 1);
      setGlow(m, false); m.userData.pick = null;
      scene.attach(m);
      drawnId = null; selectedId = null;
      layMine(true);
    } else {
      const S = seats[p];
      if (!S.hand.length) return;
      m = S.hand.splice(Math.floor(Math.random() * S.hand.length), 1)[0];
      setFace(m, n);
      layHand(p, true);
    }
    const S = seats[p];
    const vis = Math.min(PILE_VIS, S.pile.length + 1);
    S.pile.push(n);
    await moveTo(m, { pos: pileSlot(p, vis - 1, vis).pos.setY(0.9), quat: FLAT_UP, scale: 1.1 }, 300, { ease: easeOut });
    await moveTo(m, pileSlot(p, vis - 1, vis), 200);
    S.pileM.push(m);
    if (S.pileM.length > PILE_VIS) { const old = S.pileM.shift(); old.removeFromParent(); }
    await layPile(p, true);
  }
  async function reveal(p, ns) {
    const S = seats[p];
    S.revealed = true;
    if (p === ME) {
      mine.forEach((c) => setGlow(c.mesh, true, '#ffd678'));
      await layMine(true);
      return;
    }
    S.hand.forEach((m, i) => setFace(m, ns[i]));
    await layHand(p, true);
  }
  async function shed(p, nsBottomFirst, ids) {
    const S = seats[p];
    S.revealed = false;
    let meshes;
    if (p === ME) {
      meshes = (ids || []).map((id) => { const at = mine.findIndex((c) => c.id === id); return at >= 0 ? mine.splice(at, 1)[0].mesh : null; });
      mine.splice(0).forEach((c) => meshes.push(c.mesh));
      meshes = meshes.filter(Boolean);
      meshes.forEach((m) => { setGlow(m, false); m.userData.pick = null; scene.attach(m); });
    } else {
      meshes = S.hand.splice(0);
      // match the shown numbers to the order they go down in
      const pool = meshes.slice(); meshes = [];
      nsBottomFirst.forEach((n) => { let at = pool.findIndex((m) => m.userData.n === n); if (at < 0) at = 0; meshes.push(pool.splice(at, 1)[0]); });
      pool.forEach((m) => meshes.push(m));
    }
    for (let k = 0; k < nsBottomFirst.length; k++) {
      const m = meshes[k]; if (!m) continue;
      setFace(m, nsBottomFirst[k]);
      S.pile.push(nsBottomFirst[k]);
      const vis = Math.min(PILE_VIS, S.pile.length);
      await moveTo(m, pileSlot(p, vis - 1, vis), 260, { lift: 0.5 });
      S.pileM.push(m);
      if (S.pileM.length > PILE_VIS) { const old = S.pileM.shift(); old.removeFromParent(); }
      layPile(p, true);
    }
    meshes.slice(nsBottomFirst.length).forEach((m) => m.removeFromParent());
    await layPile(p, true);
  }
  async function refill(p, cards, count) {
    const k = cards ? cards.length : count;
    for (let i = 0; i < k; i++) {
      await draw(p, cards ? cards[i] : null);
      if (p === ME) drawnId = null;
    }
    if (p === ME) await layMine(true);
  }
  async function reshuffle(newDeck) {
    const fly = [];
    seats.forEach((S, s) => {
      const keep = S.pile.length ? S.pile[S.pile.length - 1] : null;
      S.pileM.slice(0, -1).forEach((m, i) => { fly.push(moveTo(m, { pos: deckTop().setY(0.3 + i * 0.05), quat: FLAT_DOWN, scale: 1 }, 520, { lift: 1.2, delay: i * 40 }).then(() => m.removeFromParent())); });
      S.pileM = S.pileM.slice(-1);
      S.pile = keep === null ? [] : [keep];
    });
    S_stackHide();
    await Promise.all(fly);
    setDeck(newDeck);
    seats.forEach((S, s) => layPile(s, true));
    await sleep(120 * speed);
  }
  function S_stackHide() { seats.forEach((S) => { S.stack.visible = false; }); }
  async function point(p) {
    const c = makeChip(); scene.add(c);
    place(c, { pos: deckTop().setY(2.4), quat: Q(0.6, 0, 0.3), scale: 1.4 });
    const S = seats[p];
    await moveTo(c, chipSlot(p, S.chips.length), 650, { lift: 1.4, ease: easeOut });
    S.chips.push(c);
  }
  function setTurn(p) {
    if (p == null || p < 0 || !seats[p]) { turnRing.userData.on = false; return; }
    const at = p === ME ? pilePos(ME).add(new T.Vector3(1.0, 0, 0.3)) : handPos(p).addScaledVector(dirOf(p), -0.3);
    turnRing.position.set(at.x, 0.01, at.z);
    turnRing.scale.set(p === ME ? 1.6 : 1.1, p === ME ? 1.2 : 1.1, 1);
    turnRing.userData.on = true; dirty = true;
  }
  function setPickable(o) {
    pick = { deck: !!o.deck, piles: o.piles || [], hand: !!o.hand };
    setGlow(deckBody, pick.deck, '#ffd678');
    deckBody.userData.glow.scale.set(1, 1 / Math.max(0.05, deckBody.scale.y), 1);
    seats.forEach((S, s) => S.pileM.forEach((m, k) => setGlow(m, k === S.pileM.length - 1 && pick.piles.indexOf(s) >= 0, '#ffd678')));
    mine.forEach((c) => setGlow(c.mesh, pick.hand || c.id === drawnId, c.id === selectedId ? '#ffffff' : c.id === drawnId ? '#9be7ff' : '#ffd678'));
    dirty = true;
  }
  function setSelected(id) { selectedId = id; layMine(true); }
  function setDrawn(id) { drawnId = id; layMine(true); }

  /* ---------------- camera: fit the whole table between the top bar and my hand */
  function view() { const r = container.getBoundingClientRect(); return { w: Math.max(1, r.width), h: Math.max(1, r.height) }; }
  function fitCamera() {
    const vp = view();
    tall = vp.h > vp.w * 1.05;
    const L2 = layoutFor(N, tall);
    if (L2.tall !== L.tall) { L = L2; buildTable(L); } else L = L2;
    cam.fov = L.fov; cam.aspect = vp.w / vp.h; cam.updateProjectionMatrix();
    const barPx = opts.barPx ? opts.barPx() : 96;
    const handPx = tall ? Math.min(vp.w * 0.205 * 1.4, vp.h * 0.15 * 1.4) : Math.min(vp.h * 0.24, vp.w * 0.1 * 1.4);
    const topPx = opts.topPx ? opts.topPx() : 54;
    const toNdc = (px) => 1 - 2 * px / vp.h;              // px from the top → NDC y
    const yHi = toNdc(topPx);
    const yLoHand = toNdc(vp.h - barPx - handPx * 0.9 - 6);   // above my hand
    const yLoDock = toNdc(vp.h - barPx - 8);                 // above the dock
    const handHalf = tall ? 2 : (4.4 * handPx / 1.4 / 2 + 24) / (vp.w / 2);   // half the width of my hand, in NDC
    // points that must be visible, each with the lowest place it may be shown
    const pts = [];
    for (let s = 0; s < N; s++) if (rel(s) !== 0) { pts.push([handPos(s).setY(1.2), yLoHand]); pts.push([handPos(s).setY(0.0), yLoHand]); pts.push([pilePos(s), yLoHand]); }
    const mineLo = L.sideMine ? yLoDock : yLoHand;
    pts.push([new T.Vector3(L.myPile[0] - 0.75, 0, L.myPile[1] + 0.75), mineLo], [new T.Vector3(L.myPile[0] + 0.75, 0, L.myPile[1] + 0.75), mineLo], [new T.Vector3(L.myChips[0] + 0.4, 0, L.myChips[1] + 0.4), mineLo]);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; if (Math.sin(a) < 0.15) pts.push([new T.Vector3(Math.cos(a) * (L.rx + 0.35), 0.1, Math.sin(a) * (L.rz + 0.35)), -1]); }
    const el = rad(L.elev), dir = new T.Vector3(0, Math.sin(el), Math.cos(el));
    const v = new T.Vector3(), target = new T.Vector3();
    const setCam = (d, tz) => { target.set(0, 0, tz); cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    const topOf = () => { let hi = -9; for (const q of pts) { v.copy(q[0]).project(cam); if (v.y > hi) hi = v.y; } return hi; };
    let best = null;
    for (let d = 9; d < 70; d += 0.25) {
      // slide the camera along the table until the farthest thing touches the top band
      // (moving the camera towards +z lifts everything on screen)
      let a = -14, b = 14;
      for (let it = 0; it < 26; it++) { const m = (a + b) / 2; setCam(d, m); if (topOf() > yHi) b = m; else a = m; }
      setCam(d, a);
      let ok = true;
      for (const q of pts) {
        v.copy(q[0]).project(cam);
        // beside my hand (wide screens) things may come down to the dock
        const lo = q[1] === yLoHand && Math.abs(v.x) > handHalf ? yLoDock : q[1];
        if (v.x < -0.97 || v.x > 0.97 || v.y < lo || v.y > yHi + 0.001) { ok = false; break; }
      }
      if (ok) { best = { d, tz: a }; break; }
    }
    if (!best) best = { d: 30, tz: 0.4 };
    setCam(best.d, best.tz);
    dirty = true;
  }
  function resize() {
    const vp = view();
    renderer.setSize(vp.w, vp.h, false);
    const wasTall = tall;
    fitCamera();
    if (seats.length) {
      if (wasTall !== tall) { setDeck(deckCount); }
      relayout();
    }
  }
  function relayout() {
    seats.forEach((S, s) => { if (s !== ME) layHand(s, false); layPile(s, false); S.chips.forEach((c, k) => place(c, chipSlot(s, k))); });
    if (seats[ME] && seats[ME].revealed) { /* my revealed cards stay in the hud */ }
    layMine(false);
    setDeck(deckCount);
    dirty = true;
  }

  /* ---------------- title backdrop */
  function setTitleMode(on) {
    titleMode = !!on;
    titleProps.clear();
    if (titleMode) {
      L = layoutFor(4, false); buildTable(L);
      const fan = [7, 8, 9];
      fan.forEach((n, i) => { const m = makeCard(n); m.position.set(-1.2 + i * 1.15, 0.03 + i * 0.02, 0.6 - Math.abs(i - 1) * 0.1); m.rotation.y = (1 - i) * 0.18; titleProps.add(m); });
      const d = makeCard(0); d.rotation.z = Math.PI; d.position.set(2.6, 0.2, -1.2); d.scale.set(1, 1, 1); titleProps.add(d);
      for (let k = 0; k < 3; k++) { const c = makeChip(); c.position.set(-3.1 + (k % 2) * 0.05, 0.04 + k * 0.078, -0.9); titleProps.add(c); }
      deckGroup.visible = false; turnRing.userData.on = false;
    } else deckGroup.visible = true;
    dirty = true;
  }

  /* ---------------- picking */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  let down = null;
  canvasEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 14 || !opts.onPick) return;
    const r = canvasEl.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const objs = [deckBody];
    seats.forEach((S) => { if (S.pileM.length) objs.push(S.pileM[S.pileM.length - 1]); });
    mine.forEach((c) => objs.push(c.mesh));
    const hits = ray.intersectObjects(objs, false);
    // the hand is in front of everything: prefer it
    let hit = hits.find((h) => h.object.userData.pick && h.object.userData.pick.kind === 'hand') || hits.find((h) => h.object.userData.pick);
    if (!hit) {   // a little forgiveness for fingers: the nearest card of the hand within a few pixels
      hit = null;
    }
    opts.onPick(hit ? hit.object.userData.pick : null);
  });

  /* ---------------- screen positions for the page's name tags */
  const tmp = new T.Vector3();
  function project(p) { tmp.copy(p).project(cam); const vp = view(); return { x: (tmp.x + 1) / 2 * vp.w, y: (1 - tmp.y) / 2 * vp.h, z: tmp.z }; }
  function anchors() {
    const out = {};
    for (let s = 0; s < N; s++) out[s] = { tag: project(tagPos(s)), pile: project(pilePos(s)), hand: project(s === ME ? pilePos(s) : handPos(s).setY(1.2)) };
    out.deck = project(deckPos().setY(Math.max(0.05, deckCount * 0.0085)));
    return out;
  }
  // where to tap: my hand cards and the top card of each pile (used by the tests)
  function tapPoints() {
    const out = { hand: {}, piles: {} }, w = new T.Vector3();
    mine.forEach((c) => { c.mesh.getWorldPosition(w); out.hand[c.id] = project(w); });
    seats.forEach((S, s) => { const m = S.pileM[S.pileM.length - 1]; if (m) { m.getWorldPosition(w); w.x -= 0.25; out.piles[s] = project(w); } });
    out.deck = project(deckPos().setY(Math.max(0.05, deckCount * 0.0085)));
    return out;
  }

  /* ---------------- the loop */
  let last = performance.now(), frameCb = null, raf = 0, stopped = false;
  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let busy = false;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (now < tw.t0) { busy = true; continue; }
      const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      apply(tw.obj, tw.to, tw.ease(k), tw.from, tw.lift);
      busy = true;
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    // glows fade in/out and breathe
    const pulse = 0.55 + 0.45 * Math.sin(now / 320);
    scene.traverse((o) => {
      if (o.userData && o.userData.glow) { const g = o.userData.glow, want = g.userData.on ? 0.55 + 0.35 * pulse : 0; const cur = g.material.opacity; if (Math.abs(cur - want) > 0.004) { g.material.opacity += (want - cur) * Math.min(1, dt * 10); busy = true; } else if (g.userData.on) busy = true; }
    });
    const tw = turnRing.userData.on ? 0.28 + 0.2 * pulse : 0;
    if (Math.abs(turnRing.material.opacity - tw) > 0.004) { turnRing.material.opacity += (tw - turnRing.material.opacity) * Math.min(1, dt * 6); busy = true; } else if (turnRing.userData.on) busy = true;
    if (titleMode) {
      titleT += dt * 0.06;
      const r = 13, el = rad(38);
      cam.position.set(Math.sin(titleT) * r * Math.cos(el), r * Math.sin(el), Math.cos(titleT) * r * Math.cos(el));
      cam.lookAt(0, 0, 0);
      busy = true;
    }
    if (busy || dirty) {
      renderer.render(scene, cam);
      dirty = false;
      if (frameCb && !titleMode) frameCb(anchors());
    }
  }
  raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  return {
    renderer, sync, draw, take, discard, reveal, shed, refill, reshuffle, point, setTurn, setPickable, setSelected, setDrawn, setDeck,
    setTitleMode, refreshFaces, resize, anchors, tapPoints,
    get me() { return ME; },
    onFrame(cb) { frameCb = cb; dirty = true; },
    setSpeed(k) { speed = k; },
    setHost(el) { if (el === container) return; ro.unobserve(container); container = el; el.appendChild(canvasEl); ro.observe(el); resize(); },
    hasHand(id) { return mine.some((c) => c.id === id); },
    counts() { return { seats: seats.map((S) => ({ hand: S.hand.length, pile: S.pile.slice(), chips: S.chips.length, revealed: S.revealed })), mine: mine.map((c) => c.id), deck: deckCount }; },
    redraw() { dirty = true; },
    dispose() { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); }
  };
}
