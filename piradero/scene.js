/* 風の怪物ピラデロ — the 3D table (three.js r160; the copy in ../assets/vendor first, a CDN as a fallback).
   World: y is up, the table top is y = 0, the person at this screen always sits at the bottom (+z).
   A card is 1.0 wide and 1.4 long. Seats run clockwise from the bottom: with 2 players the other one is at the top,
   with 3 the next one is on the left (top-left on a phone) and the last one on the right.
   Every player has a row of meshing metal gears (one per gear left, no two alike) and the key holder has the key.
   The field cards lie in the middle, the wind card on a brass dial with a pointer that swings to 大 or 小,
   the unused cards (2 players) beside it. The page drives the table with small animated steps (deal, peek, take,
   reveal, show, receive, wind, gear, key) and can always fall back to sync(view), which lays out everything at once. */

const THREE_URLS = [
  '../assets/vendor/three-r160.module.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.PD_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const C = window.PD_CARDS;
const CW = 1, CH = 1.4, CT = 0.022;
const GEAR_R = 0.27, GEAR_DX = 0.37, GEAR_DZ = 0.2;
const SEAT_COLORS = ['#f0b44c', '#5cc0ff', '#ff7a9a'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/* ------------------------------------------------------------------ painted surfaces */
function paintSky(h) {
  const cv = canvas(16, h), x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#141a33'); g.addColorStop(0.28, '#2e3463'); g.addColorStop(0.42, '#6b5a8f');
  g.addColorStop(0.5, '#e59a64'); g.addColorStop(0.535, '#f6c690'); g.addColorStop(0.6, '#c98d86');
  g.addColorStop(0.75, '#5d4a6e'); g.addColorStop(1, '#1b1730');
  x.fillStyle = g; x.fillRect(0, 0, 16, h);
  return cv;
}
function paintCloud(w, h, seed) {
  const cv = canvas(w, h), x = cv.getContext('2d');
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const cx = w * (0.15 + r() * 0.7), cy = h * (0.45 + r() * 0.3), rad = h * (0.16 + r() * 0.26);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,240,230,.55)'); g.addColorStop(0.6, 'rgba(255,225,210,.22)'); g.addColorStop(1, 'rgba(255,220,210,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  return cv;
}
function paintTable(s) {
  const cv = canvas(s, s), x = cv.getContext('2d');
  // dark walnut planks
  x.fillStyle = '#3a2416'; x.fillRect(0, 0, s, s);
  const pw = s / 9;
  for (let i = 0; i < 9; i++) {
    const g = x.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
    const base = [58, 36, 22].map((c) => c + ((i * 37) % 13) - 6);
    g.addColorStop(0, `rgb(${base[0] - 8},${base[1] - 6},${base[2] - 4})`); g.addColorStop(0.5, `rgb(${base[0] + 8},${base[1] + 5},${base[2] + 3})`); g.addColorStop(1, `rgb(${base[0] - 10},${base[1] - 7},${base[2] - 5})`);
    x.fillStyle = g; x.fillRect(i * pw, 0, pw, s);
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 3; x.beginPath(); x.moveTo(i * pw, 0); x.lineTo(i * pw, s); x.stroke();
    x.strokeStyle = 'rgba(255,220,170,.05)'; x.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      const xx = i * pw + pw * (0.1 + 0.8 * ((k * 53 + i * 17) % 100) / 100);
      x.beginPath(); x.moveTo(xx, 0);
      for (let y = 0; y <= s; y += s / 16) x.lineTo(xx + Math.sin(y / s * 9 + k + i) * pw * 0.05, y);
      x.stroke();
    }
  }
  // the brass inlay near the edge and the faint compass in the middle
  x.save(); x.translate(s / 2, s / 2);
  x.strokeStyle = 'rgba(214,170,88,.75)'; x.lineWidth = s * 0.008;
  x.beginPath(); x.arc(0, 0, s * 0.47, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(214,170,88,.35)'; x.lineWidth = s * 0.003;
  x.beginPath(); x.arc(0, 0, s * 0.455, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(0, 0, s * 0.2, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, L = k % 4 === 0 ? 0.32 : k % 2 === 0 ? 0.26 : 0.22;
    x.save(); x.rotate(a);
    x.beginPath(); x.moveTo(s * 0.21, -s * 0.006); x.lineTo(s * L, 0); x.lineTo(s * 0.21, s * 0.006); x.closePath();
    x.fillStyle = 'rgba(214,170,88,.16)'; x.fill();
    x.restore();
  }
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2;
    x.fillStyle = 'rgba(230,196,110,.6)'; x.beginPath(); x.arc(Math.cos(a) * s * 0.462, Math.sin(a) * s * 0.462, s * 0.0045, 0, Math.PI * 2); x.fill();
  }
  x.restore();
  return cv;
}
function paintDial(s) {
  const cv = canvas(s, s), x = cv.getContext('2d'), c = s / 2;
  const g = x.createRadialGradient(c * 0.8, c * 0.7, s * 0.05, c, c, c);
  g.addColorStop(0, '#f5dc96'); g.addColorStop(0.55, '#c39a45'); g.addColorStop(1, '#6e4d1a');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(60,38,10,.8)'; x.lineWidth = s * 0.012;
  x.beginPath(); x.arc(c, c, c * 0.93, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.arc(c, c, c * 0.62, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2, r0 = c * (k % 8 === 0 ? 0.8 : 0.86);
    x.lineWidth = s * (k % 8 === 0 ? 0.008 : 0.004);
    x.beginPath(); x.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); x.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92); x.stroke();
  }
  x.font = `900 ${Math.round(s * 0.13)}px "Shippori Mincho B1","Hiragino Mincho ProN","Noto Serif CJK JP",serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#3a2408';
  x.fillText('大', c, c - c * 0.77);
  x.fillStyle = '#7a1a10';
  x.fillText('小', c, c + c * 0.77);
  x.font = `800 ${Math.round(s * 0.06)}px "Shippori Mincho B1","Hiragino Mincho ProN","Noto Serif CJK JP",serif`;
  x.fillStyle = 'rgba(58,36,8,.85)';
  x.fillText('風 向 き', c - c * 0.77, c);
  x.save(); x.translate(c + c * 0.77, c); x.rotate(Math.PI / 2); x.fillText('WIND', 0, 0); x.restore();
  return cv;
}
function paintGlow(color) {
  const w = 160, h = 208, cv = canvas(w, h), x = cv.getContext('2d');
  for (let i = 10; i >= 1; i--) {
    x.strokeStyle = color; x.globalAlpha = 0.07 + (10 - i) * 0.025; x.lineWidth = i * 2.2;
    const m = 12 + i * 0.6;
    x.beginPath(); x.roundRect ? x.roundRect(m, m, w - 2 * m, h - 2 * m, 16) : x.rect(m, m, w - 2 * m, h - 2 * m); x.stroke();
  }
  return cv;
}
function paintShadow() {
  const s = 128, cv = canvas(s, s), x = cv.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.55, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return cv;
}

/* ------------------------------------------------------------------ layouts (see the header) */
function makeLayout(n, tall) {
  const P = Math.PI;
  const meTall = { hand: [-0.66, 0.66], recv: -1.18, scale: 1.18, tilt: 0.5, gear: [0, 1.4], key: [2.05, 0.3], keyRot: P / 2 };
  const meWide = { hand: [-0.64, 0.64], recv: -1.14, scale: 1.12, tilt: 0.45, gear: [-2.8, 0.1], key: [2.3, 0.1], keyRot: 0 };
  if (tall && n === 2) return {
    tall, table: [4.4, 7.9], cols: [-1.18, 0, 1.18], rows6: [-0.95, 0.65], rows9: [-1.55, 0.05, 1.65], dais: [-1.2, -2.78], unused: [1.3, -2.78],
    seats: [{ x: 0, z: 3.85, rot: 0, ...meTall }, { x: 0, z: -5.2, rot: P, hand: [-0.6, 0.6], recv: -1.5, scale: 1, tilt: 0, gear: [0, 1.25], key: [0, 2.1], keyRot: 0 }]
  };
  if (tall) return {
    tall, table: [4.6, 8.4], cols: [-1.18, 0, 1.18], rows6: [-0.75, 0.85], rows9: [-1.5, 0.08, 1.66], dais: [0, -3.28], unused: [2.32, 0.08], unusedRot: P / 2,
    seats: [
      { x: 0, z: 4.42, rot: 0, ...meTall },
      { x: -1.74, z: -5.3, rot: P, hand: [-0.56, 0.56], recv: -1.06, scale: 0.92, tilt: 0, gear: [0, 1.18], key: [0, 1.98], keyRot: 0 },
      { x: 1.74, z: -5.3, rot: P, hand: [-0.56, 0.56], recv: -1.06, scale: 0.92, tilt: 0, gear: [0, 1.18], key: [0, 1.98], keyRot: 0 }
    ]
  };
  if (n === 2) return {
    tall, table: [7.5, 5.6], cols: [-1.8, -0.62, 0.56], rows6: [-0.8, 0.8], rows9: [-1.58, 0, 1.58], dais: [2.3, -0.55], unused: [2.3, 1.25],
    seats: [{ x: 0, z: 3.55, rot: 0, ...meWide }, { x: 0, z: -3.6, rot: P, hand: [-0.6, 0.6], recv: -1.06, scale: 1, tilt: 0, gear: [-2.65, 0], key: [2.25, 0], keyRot: 0 }]
  };
  return {
    tall, table: [7.9, 5.7], cols: [-1.18, 0, 1.18], rows6: [-0.8, 0.8], rows9: [-1.6, -0.02, 1.56], dais: [-0.98, -3.28], unused: [1.02, -3.28],
    seats: [
      { x: 0, z: 3.82, rot: 0, ...meWide },
      { x: -4.8, z: 0.05, rot: -P / 2, hand: [-0.8, 0.8], recv: -1.12, scale: 1, tilt: 0, gear: [-2.6, 0], key: [2.35, 0], keyRot: 0 },
      { x: 4.8, z: 0.05, rot: P / 2, hand: [0.8, -0.8], recv: -1.12, scale: 1, tilt: 0, gear: [2.6, 0], key: [-2.35, 0], keyRot: P }
    ]
  };
}

/* ================================================================== the scene */
export function createScene(host, opts = {}) {
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.keepFrame }); }
  catch (e) { return null; }
  const lowPower = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.75 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  let container = host;
  container.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;
  canvasEl.style.display = 'block'; canvasEl.style.width = '100%'; canvasEl.style.height = '100%'; canvasEl.style.touchAction = 'none';

  const scene = new T.Scene();
  const skyTex = new T.CanvasTexture(paintSky(512)); skyTex.colorSpace = T.SRGBColorSpace;
  scene.fog = new T.Fog('#b98a8c', 34, 110);
  const cam = new T.PerspectiveCamera(36, 1, 0.3, 300);
  scene.add(cam);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  const tex = (cv, srgb = true) => { const t = new T.CanvasTexture(cv); if (srgb) t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso; return t; };

  /* ---------------- sky, clouds, light, and the reflections the metal needs */
  const sky = new T.Mesh(new T.SphereGeometry(160, 32, 24), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  {
    const envScene = new T.Scene();
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide })));
    const panel = (w, h, color, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(30, 10, '#fff1d6', -20, 26, 14); panel(18, 6, '#ffd59a', 26, 14, -10); panel(40, 6, '#9fb6ff', 0, 30, -30);
    // a warm skylight overhead: gears and the key lie flat, so this is what they mostly mirror
    panel(36, 26, '#e9d2ac', 0, 34, 6); panel(14, 10, '#fff6e2', -6, 30, 12); panel(10, 30, '#6d5a7a', 22, 22, 10);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.035).texture;
    pm.dispose();
  }
  scene.add(new T.HemisphereLight('#ffe7cc', '#3b2f52', 1.0));
  const sun = new T.DirectionalLight('#ffd3a2', 1.8); sun.position.set(-7, 14, 8); scene.add(sun);
  const rim = new T.DirectionalLight('#a9bcff', 0.45); rim.position.set(9, 7, -12); scene.add(rim);

  const clouds = [];
  {
    const cloudTex = [1, 2, 3].map((s) => tex(paintCloud(512, 256, s * 977)));
    for (let i = 0; i < 26; i++) {
      const m = new T.SpriteMaterial({ map: cloudTex[i % 3], transparent: true, depthWrite: false, opacity: 0.55 + (i % 4) * 0.1, fog: true });
      const sp = new T.Sprite(m);
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.3, rr = 16 + (i * 37) % 40;
      const sz = 10 + (i * 13) % 18;
      sp.scale.set(sz, sz * 0.45, 1);
      sp.position.set(Math.cos(a) * rr, -6 - (i * 7) % 12, Math.sin(a) * rr - 6);
      sp.userData.v = 0.15 + (i % 5) * 0.06;
      scene.add(sp); clouds.push(sp);
    }
  }

  /* ---------------- the table */
  const world = new T.Group(); scene.add(world);
  const table = new T.Group(); world.add(table);
  const topMat = new T.MeshStandardMaterial({ map: tex(paintTable(1024)), roughness: 0.72, metalness: 0.05 });
  const sideMat = new T.MeshStandardMaterial({ color: '#2b1a10', roughness: 0.6, metalness: 0.1 });
  const brassMat = new T.MeshStandardMaterial({ color: '#d2a24c', roughness: 0.28, metalness: 1, envMapIntensity: 1.2 });
  const tableTop = new T.Mesh(new T.CylinderGeometry(1, 0.97, 0.36, 96, 1), [sideMat, topMat, sideMat]);
  tableTop.position.y = -0.18; table.add(tableTop);
  const tableRim = new T.Mesh(new T.TorusGeometry(1, 0.012, 10, 128), brassMat);
  tableRim.rotation.x = Math.PI / 2; tableRim.position.y = 0.005; table.add(tableRim);
  const under = new T.Mesh(new T.CylinderGeometry(0.16, 0.05, 2.6, 24), brassMat);
  under.position.y = -1.6; table.add(under);

  /* ---------------- the wind dial */
  const dial = new T.Group(); world.add(dial);
  const dialTop = new T.MeshStandardMaterial({ map: tex(paintDial(512)), roughness: 0.38, metalness: 0.85, envMapIntensity: 1 });
  const dialMesh = new T.Mesh(new T.CylinderGeometry(0.98, 1.04, 0.12, 64), [brassMat, dialTop, brassMat]);
  dialMesh.position.y = 0.06; dial.add(dialMesh);
  const pointer = new T.Group(); dial.add(pointer);
  {
    const sh = new T.Shape(); sh.moveTo(0, 0.16); sh.lineTo(0.11, 0); sh.lineTo(0.035, 0); sh.lineTo(0.035, -0.06); sh.lineTo(-0.035, -0.06); sh.lineTo(-0.035, 0); sh.lineTo(-0.11, 0); sh.closePath();
    const g = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    const tip = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#7f1d12', roughness: 0.35, metalness: 0.7, emissive: '#3a0805' }));
    tip.position.set(0, 0.13, -1.12); pointer.add(tip);
  }
  pointer.userData.spin = 0.6;

  /* ---------------- cards */
  const shapeGeo = (() => {
    const s = new T.Shape(), w = CW / 2, h = CH / 2, r = 0.08;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
    s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    return s;
  })();
  const bodyGeo = new T.ExtrudeGeometry(shapeGeo, { depth: CT, bevelEnabled: false, curveSegments: 6 });
  bodyGeo.translate(0, 0, -CT / 2); bodyGeo.rotateX(-Math.PI / 2);
  const faceGeo = new T.ShapeGeometry(shapeGeo, 6); faceGeo.rotateX(-Math.PI / 2); faceGeo.translate(0, CT / 2 + 0.0015, 0);
  const backGeo = new T.ShapeGeometry(shapeGeo, 6); backGeo.rotateX(Math.PI / 2); backGeo.translate(0, -CT / 2 - 0.0015, 0);
  const cardTex = (cv) => { const t = tex(cv); t.repeat.set(1 / CW, 1 / CH); t.offset.set(0.5, 0.5); return t; };
  const backTex = cardTex(C.back());
  const backMat = new T.MeshStandardMaterial({ map: backTex, roughness: 0.55, metalness: 0.15 });
  const edgeMat = new T.MeshStandardMaterial({ color: '#efe2c2', roughness: 0.8 });
  const faceMats = {};
  const faceMat = (v) => {
    if (v === null || v === undefined) return backMat;
    if (!faceMats[v]) faceMats[v] = new T.MeshStandardMaterial({ map: cardTex(C.face(v)), roughness: 0.9, metalness: 0 });
    return faceMats[v];
  };
  const shadowTex = tex(paintShadow());
  const glowTex = { peek: tex(paintGlow('#8fe9ff')), take: tex(paintGlow('#ffd36a')), sel: tex(paintGlow('#ffffff')), win: tex(paintGlow('#ffe08a')) };
  const spriteTex = {};
  const sprite = (key, cv) => { if (!spriteTex[key]) spriteTex[key] = tex(cv); return spriteTex[key]; };

  function makeCard() {
    const g = new T.Group();
    const body = new T.Mesh(bodyGeo, edgeMat);
    const face = new T.Mesh(faceGeo, backMat);
    const back = new T.Mesh(backGeo, backMat);
    g.add(body, face, back);
    const sh = new T.Mesh(new T.PlaneGeometry(1.5, 1.9), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002; sh.renderOrder = -1;
    const glow = new T.Mesh(new T.PlaneGeometry(1.42, 1.82), new T.MeshBasicMaterial({ map: glowTex.take, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.004;
    const badges = new T.Group();
    g.userData = { face, back, body, v: null, up: false, badges, glow, shadow: sh, slot: -1 };
    [body, face, back].forEach((m) => { m.userData.card = g; });
    world.add(g);
    world.add(sh); world.add(glow);
    world.add(badges);
    return g;
  }
  const cards = [];
  for (let i = 0; i < 10; i++) cards.push(makeCard());

  /* ---------------- gears and the key */
  const metal = [
    { color: '#d8a948', roughness: 0.26 }, { color: '#a2954f', roughness: 0.3 }, { color: '#b3a35b', roughness: 0.22 },
    { color: '#8b6a3c', roughness: 0.38 }, { color: '#e2c56e', roughness: 0.2 }, { color: '#867b42', roughness: 0.34 }, { color: '#c98a52', roughness: 0.28 }
  ].map((m) => new T.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: 1, envMapIntensity: 1.25 }));
  function gearShape(teeth, ro, ri, style) {
    const s = new T.Shape();
    for (let i = 0; i < teeth; i++) {
      const f = (k) => ((i + k) / teeth) * Math.PI * 2;
      const pts = [[f(0), ri], [f(0.16), ri], [f(0.3), ro], [f(0.7), ro], [f(0.84), ri]];
      pts.forEach(([a, r], j) => { const X = Math.cos(a) * r, Y = Math.sin(a) * r; if (i === 0 && j === 0) s.moveTo(X, Y); else s.lineTo(X, Y); });
    }
    s.closePath();
    const hole = new T.Path(); hole.absarc(0, 0, ro * 0.16, 0, Math.PI * 2, true); s.holes.push(hole);
    if (style === 'round' || style === 'six') {
      const k = style === 'six' ? 6 : 4, rr = ri * 0.52, hr = ri * (style === 'six' ? 0.17 : 0.22);
      for (let j = 0; j < k; j++) { const a = j / k * Math.PI * 2, p = new T.Path(); p.absarc(Math.cos(a) * rr, Math.sin(a) * rr, hr, 0, Math.PI * 2, true); s.holes.push(p); }
    } else if (style === 'spoke' || style === 'five') {
      const k = style === 'five' ? 5 : 3, r0 = ri * 0.28, r1 = ri * 0.78, gap = style === 'five' ? 0.42 : 0.5;
      for (let j = 0; j < k; j++) {
        const a0 = (j / k) * Math.PI * 2 + gap / 2, a1 = ((j + 1) / k) * Math.PI * 2 - gap / 2;
        const p = new T.Path();
        p.absarc(0, 0, r1, a1, a0, true);
        p.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        p.absarc(0, 0, r0, a0, a1, false);
        p.closePath();
        s.holes.push(p);
      }
    }
    return s;
  }
  const gearDesigns = [
    [14, 'spoke'], [12, 'round'], [16, 'six'], [10, 'five'], [18, 'spoke'], [13, 'round'], [15, 'five']
  ].map(([teeth, style], i) => {
    const g = new T.ExtrudeGeometry(gearShape(teeth, GEAR_R, GEAR_R * 0.82, style), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.009, bevelSegments: 1, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0.012, 0);
    return g;
  });
  function makeGear(design, mat) {
    const g = new T.Group();
    const m = new T.Mesh(gearDesigns[design % gearDesigns.length], metal[mat % metal.length]);
    g.add(m);
    const sh = new T.Mesh(new T.PlaneGeometry(0.85, 0.85), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -0.01; g.add(sh);
    g.userData = { mesh: m, dir: 1, home: null, gone: false };
    world.add(g);
    return g;
  }
  const keyObj = (() => {
    const k = new T.Group();
    const gold = new T.MeshStandardMaterial({ color: '#b4a456', roughness: 0.18, metalness: 1, envMapIntensity: 1.4, emissive: '#3a2604', emissiveIntensity: 0.25 });
    const bowGeo = new T.ExtrudeGeometry(gearShape(10, 0.24, 0.2, 'round'), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 });
    bowGeo.rotateX(-Math.PI / 2);
    const bow = new T.Mesh(bowGeo, gold); bow.position.set(-0.55, 0.02, 0); k.add(bow);
    const ring = new T.Mesh(new T.TorusGeometry(0.1, 0.026, 8, 20), gold); ring.rotation.x = Math.PI / 2; ring.position.set(-0.55, 0.05, 0); k.add(ring);
    const shaft = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.86, 12), gold); shaft.rotation.z = Math.PI / 2; shaft.position.set(0.05, 0.045, 0); k.add(shaft);
    [-0.25, -0.18].forEach((x) => { const c = new T.Mesh(new T.CylinderGeometry(0.056, 0.056, 0.035, 14), gold); c.rotation.z = Math.PI / 2; c.position.set(x, 0.045, 0); k.add(c); });
    [[0.36, 0.14], [0.44, 0.09], [0.52, 0.16]].forEach(([x, d]) => { const b = new T.Mesh(new T.BoxGeometry(0.06, 0.05, d), gold); b.position.set(x, 0.045, d / 2); k.add(b); });
    const sh = new T.Mesh(new T.PlaneGeometry(1.6, 0.7), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.003; k.add(sh);
    k.scale.setScalar(1.05);
    world.add(k);
    return k;
  })();

  /* ---------------- state of the table */
  let L = makeLayout(2, false);
  let me = 0, nSeats = 2, outSeats = [], keyHolder = 0, startGears = 5, gearCount = [5, 5];
  const seatGroups = [];
  let gears = [];            // gears[seat][j]
  let slotCard = [];          // slot index → card object
  let windCard = null, unusedCards = [];
  let fieldN = 6;
  let pickable = null, pickMode = 'take', selSlot = -1;
  let titleMode = true, titleT = 0, coverPose = null;
  let speed = 1;
  const anims = new Set();

  const rel = (s) => (s - me + nSeats) % nSeats;
  function seatG(s) { return seatGroups[rel(s)]; }
  function seatDef(s) { return L.seats[rel(s)]; }
  function local(s, x, z, y = 0) {
    const g = seatG(s); const v = new T.Vector3(x, y, z);
    g.updateMatrixWorld(true);
    return v.applyMatrix4(g.matrixWorld);
  }
  function fieldPos(i) {
    const rows = fieldN === 9 ? L.rows9 : L.rows6;
    const c = i % 3, r = Math.floor(i / 3);
    return new T.Vector3(L.cols[c], 0, rows[r]);
  }
  function handPos(s, idx) {
    const d = seatDef(s);
    if (idx >= 2) return local(s, 0, d.recv, 0);
    return local(s, d.hand[idx], 0, 0);
  }
  function gearPos(s, j, count) {
    const d = seatDef(s);
    const x = d.gear[0] + (j - (count - 1) / 2) * GEAR_DX;
    const z = d.gear[1] + (j % 2 ? GEAR_DZ : -GEAR_DZ);
    return local(s, x, z, 0);
  }
  function keyPose(s) {
    const d = seatDef(s);
    return { p: local(s, d.key[0], d.key[1], 0), r: seatG(s).rotation.y + d.keyRot };
  }

  function buildSeats() {
    seatGroups.forEach((g) => world.remove(g));
    seatGroups.length = 0;
    for (let r = 0; r < nSeats; r++) {
      const d = L.seats[r] || L.seats[L.seats.length - 1];
      const g = new T.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.rot;
      world.add(g); seatGroups.push(g);
    }
    world.updateMatrixWorld(true);
    // gears: a fixed set per seat, each one different
    gears.flat().forEach((g) => world.remove(g));
    gears = [];
    for (let s = 0; s < nSeats; s++) {
      const list = [];
      for (let j = 0; j < startGears; j++) list.push(makeGear((j * 3 + s * 2) % 7, (j + s * 3) % 7));
      gears.push(list);
    }
    table.scale.set(L.table[0], 1, L.table[1]);
    dial.position.set(L.dais[0], 0, L.dais[1]);
  }

  /* ---------------- card placement */
  function setFace(card, v) { card.userData.v = v; card.userData.face.material = faceMat(v); }
  function pose(card, p, ry = 0, up = false, tilt = 0, sc = 1) {
    card.position.copy(p);
    card.rotation.set(tilt, ry, up ? 0 : Math.PI);
    card.userData.up = up;
    card.scale.setScalar(sc);
    syncAttached(card);
  }
  function syncAttached(card) {
    const u = card.userData;
    u.shadow.position.set(card.position.x, 0.003, card.position.z + 0.04);
    u.shadow.scale.setScalar(card.scale.x * (1 + Math.max(0, card.position.y - 0.05) * 0.5));
    u.shadow.material.opacity = 0.55 / (1 + Math.max(0, card.position.y) * 1.6);
    u.glow.position.set(card.position.x, 0.006, card.position.z);
    u.glow.scale.setScalar(card.scale.x);
    u.badges.position.set(card.position.x, card.position.y + 0.06, card.position.z);
  }
  function clearBadges(card) { const b = card.userData.badges; while (b.children.length) b.remove(b.children[0]); }
  function setBadges(card, seen, knownV, color) {
    clearBadges(card);
    const b = card.userData.badges;
    (seen || []).forEach((s, i) => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: sprite('eye' + s, C.eye(SEAT_COLORS[s % 3])), depthTest: false, transparent: true }));
      sp.scale.set(0.3, 0.3, 1);
      sp.position.set(-0.32 + i * 0.3, 0.16, -0.5);
      sp.renderOrder = 10;
      b.add(sp);
    });
    if (knownV !== null && knownV !== undefined) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: sprite('n' + knownV + color, C.num(knownV, color)), depthTest: false, transparent: true }));
      sp.scale.set(0.5, 0.5, 1);
      sp.position.set(0, 0.32, 0.05);
      sp.renderOrder = 11;
      b.add(sp);
    }
  }

  // lay out everything from a view, at once
  function sync(v) {
    stopAnims();
    setupFor(v);
    fieldN = v.slots.length;
    slotCard = [];
    const handIdx = {};
    v.slots.forEach((S, i) => {
      const c = cards[i]; slotCard[i] = c; c.userData.slot = i; c.visible = true;
      c.userData.shadow.visible = true; c.userData.glow.visible = true;
      setFace(c, S.v);
      if (S.by < 0) {
        pose(c, fieldPos(i), 0, !!S.open && S.v !== null);
        setBadges(c, S.open ? [] : S.seen, S.open ? null : (S.mine ? S.v : null), SEAT_COLORS[me % 3]);
      } else {
        const k = (handIdx[S.by] = (handIdx[S.by] || 0) + (S.recv ? 0 : 1)) - 1;
        const idx = S.recv ? 2 : k;
        placeInHand(c, S.by, idx, S.by === me || S.recv);
        setBadges(c, [], S.by !== me && !S.recv && S.v !== null ? S.v : null, SEAT_COLORS[me % 3]);
      }
    });
    // the wind card and the unused ones
    let next = v.slots.length;
    windCard = cards[next++]; windCard.visible = true; windCard.userData.slot = -1;
    setFace(windCard, v.wind);
    pose(windCard, new T.Vector3(L.dais[0], 0.13, L.dais[1]), 0, v.wind !== null);
    clearBadges(windCard);
    unusedCards = [];
    for (let u = 0; u < v.unused; u++) {
      const c = cards[next++]; c.visible = true; c.userData.slot = -1; setFace(c, null); clearBadges(c);
      pose(c, unusedPos(u), L.unusedRot || 0, false, 0, 0.72);
      unusedCards.push(c);
    }
    for (; next < 10; next++) { const c = cards[next]; c.visible = false; c.userData.shadow.visible = false; c.userData.glow.visible = false; clearBadges(c); }
    cards.forEach((c) => { c.userData.glow.material.opacity = 0; });
    // gears and the key
    v.players.forEach((P, s) => { gearCount[s] = P.out ? 0 : P.gears; layGears(s); });
    keyHolder = v.key;
    const kp = keyPose(v.key);
    keyObj.position.copy(kp.p); keyObj.rotation.set(0, kp.r, 0);
    pointer.userData.spin = 0.6; pointer.userData.target = null;
    renderPickable();
  }
  function unusedPos(u) {
    const r = L.unusedRot || 0;
    return new T.Vector3(L.unused[0] + Math.sin(r) * 0 + u * 0.03, 0.02 + u * 0.024, L.unused[1] - u * 0.03);
  }
  function placeInHand(c, s, idx, up) {
    const d = seatDef(s), mine = s === me;
    const p = handPos(s, idx);
    const lift = mine && d.tilt ? 0.32 : 0;
    p.y += lift + (idx >= 2 ? 0.01 : 0);
    pose(c, p, 0, up, mine ? d.tilt : 0, d.scale);
  }
  function layGears(s) {
    const list = gears[s] || [];
    const n = gearCount[s];
    list.forEach((g, j) => {
      g.userData.gone = j >= n;
      g.visible = j < n;
      g.userData.dir = j % 2 ? -1 : 1;
      if (j < n) { const p = gearPos(s, j, n); g.position.copy(p); g.userData.home = p.clone(); g.rotation.set(0, j * 0.4, 0); }
    });
  }

  function setupFor(v) {
    const tall = aspect() < 0.9;
    const changed = v.n !== nSeats || v.me !== me || tall !== L.tall || v.startGears !== startGears || !seatGroups.length;
    me = v.me; nSeats = v.n; startGears = v.startGears || 5;
    if (changed) { L = makeLayout(nSeats, tall); buildSeats(); fit(); }
    outSeats = v.players.map((P, i) => (P.out ? i : -1)).filter((i) => i >= 0);
  }

  /* ---------------- animation helpers */
  function stopAnims() { anims.forEach((a) => a.stop()); anims.clear(); }
  function tween(ms, fn) {
    return new Promise((res) => {
      const dur = Math.max(1, ms * speed);
      const t0 = performance.now();
      const a = { stop() { anims.delete(a); fn(1); res(); }, step(now) { const t = clamp((now - t0) / dur, 0, 1); fn(t); if (t >= 1) { anims.delete(a); res(); } } };
      anims.add(a);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));
  function poseOf(c) { return { p: c.position.clone(), r: c.rotation.clone(), s: c.scale.x }; }
  // move a card along an arc; flip it if `up` changes
  function fly(c, to, opt = {}) {
    const from = poseOf(c), ms = opt.ms || 650, arc = opt.arc === undefined ? 0.9 : opt.arc;
    const upTo = opt.up === undefined ? c.userData.up : opt.up;
    const rz0 = from.r.z, rz1 = upTo ? 0 : Math.PI;
    const rx1 = opt.tilt || 0, ry1 = opt.ry || 0, s1 = opt.scale || from.s;
    return tween(ms, (t) => {
      const e = easeIO(t);
      c.position.set(lerp(from.p.x, to.x, e), lerp(from.p.y, to.y, e) + Math.sin(Math.PI * e) * arc, lerp(from.p.z, to.z, e));
      c.rotation.set(lerp(from.r.x, rx1, e), lerp(from.r.y, ry1, e), lerp(rz0, rz1, e));
      c.scale.setScalar(lerp(from.s, s1, e));
      syncAttached(c);
      if (t >= 1) c.userData.up = upTo;
    });
  }

  /* ---------------- the steps the page shows */
  async function deal(v) {
    stopAnims();
    setupFor(v);
    fieldN = v.slots.length;
    // everything back to one pile in the middle, then out to the field, the dial and the side
    const pile = new T.Vector3(0, 0.02, 0);
    const n = v.slots.length + 1 + v.unused;
    for (let i = 0; i < 10; i++) {
      const c = cards[i];
      if (i >= n) { c.visible = false; c.userData.shadow.visible = false; c.userData.glow.visible = false; clearBadges(c); continue; }
      c.visible = true; c.userData.shadow.visible = true; c.userData.glow.visible = true; c.userData.glow.material.opacity = 0;
      clearBadges(c);
    }
    const live = cards.slice(0, n);
    await Promise.all(live.map((c, i) => fly(c, new T.Vector3(pile.x, 0.02 + i * 0.025, pile.z), { up: false, ms: 420, arc: 0.4, scale: 1 })));
    live.forEach((c) => setFace(c, null));
    // a little shuffle
    await tween(380, (t) => { live.forEach((c, i) => { c.position.x = Math.sin(t * Math.PI * 2 + i) * 0.35 * (1 - t); c.rotation.y = Math.sin(t * 6 + i) * 0.25 * (1 - t); syncAttached(c); }); });
    slotCard = [];
    v.slots.forEach((S, i) => { slotCard[i] = cards[i]; cards[i].userData.slot = i; });
    windCard = cards[v.slots.length]; windCard.userData.slot = -1;
    unusedCards = cards.slice(v.slots.length + 1, n);
    unusedCards.forEach((c) => { c.userData.slot = -1; });
    const jobs = [];
    v.slots.forEach((S, i) => { jobs.push(wait(i * 70).then(() => { sfxCb('deal'); return fly(cards[i], fieldPos(i), { up: false, ms: 420, arc: 0.5 }); })); });
    jobs.push(wait(v.slots.length * 70 + 60).then(() => fly(windCard, new T.Vector3(L.dais[0], 0.13, L.dais[1]), { up: false, ms: 520, arc: 0.7 })));
    unusedCards.forEach((c, u) => jobs.push(wait(v.slots.length * 70 + 160 + u * 60).then(() => fly(c, unusedPos(u), { up: false, ms: 480, arc: 0.4, scale: 0.72, ry: L.unusedRot || 0 }))));
    v.players.forEach((P, s) => { if (gearCount[s] !== (P.out ? 0 : P.gears)) { gearCount[s] = P.out ? 0 : P.gears; layGears(s); } });
    pointer.userData.spin = 0.6; pointer.userData.target = null;
    await Promise.all(jobs);
    sync(v);
  }

  async function peek(p, slot, v) {
    const c = slotCard[slot]; if (!c) return;
    if (p === me && v !== null && v !== undefined) {
      setFace(c, v);
      const home = fieldPos(slot);
      const up = home.clone(); up.y = 1.55; up.z += 0.9;
      await fly(c, up, { up: true, tilt: 0.85, ms: 520, arc: 0.2, scale: 1.25 });
      await wait(1150);
      await fly(c, home, { up: false, tilt: 0, ms: 420, arc: 0.1, scale: 1 });
    } else {
      // seen from here: the card lifts and tips toward the one who looks
      const home = fieldPos(slot), to = seatG(p).position.clone().sub(home).setY(0).normalize();
      const from = poseOf(c);
      await tween(420, (t) => { const e = easeOut(t); c.position.set(home.x + to.x * 0.25 * e, 0.45 * e, home.z + to.z * 0.25 * e); c.rotation.set(-to.z * 0.9 * e, 0, Math.PI - to.x * 0.9 * e); syncAttached(c); });
      await wait(650);
      await tween(360, (t) => { const e = easeIO(t); c.position.set(lerp(home.x + to.x * 0.25, home.x, e), lerp(0.45, 0, e), lerp(home.z + to.z * 0.25, home.z, e)); c.rotation.set(lerp(-to.z * 0.9, from.r.x, e), 0, lerp(Math.PI - to.x * 0.9, Math.PI, e)); syncAttached(c); });
    }
  }
  function markSeen(slot, seen, knownV) {
    const c = slotCard[slot]; if (!c) return;
    setBadges(c, seen, knownV, SEAT_COLORS[me % 3]);
  }
  async function take(p, slot, v, idx) {
    const c = slotCard[slot]; if (!c) return;
    clearBadges(c);
    if (p === me) setFace(c, v);
    const d = seatDef(p), mine = p === me;
    const to = handPos(p, idx); to.y += mine && d.tilt ? 0.32 : 0;
    await fly(c, to, { up: mine, tilt: mine ? d.tilt : 0, scale: d.scale, ms: 640, arc: 1.0 });
    if (!mine && v !== null && v !== undefined) { setFace(c, v); setBadges(c, [], v, SEAT_COLORS[me % 3]); }
  }
  async function reveal(list) {
    for (const r of list) {
      const c = slotCard[r.slot]; if (!c) continue;
      clearBadges(c); setFace(c, r.v);
      sfxCb('flip');
      await fly(c, fieldPos(r.slot), { up: true, ms: 380, arc: 0.55 });
    }
  }
  // hands: { seat: [{ slot, v }] } in hand order; my own cards are face up already
  async function showHands(hands) {
    const jobs = [];
    for (const [s, list] of Object.entries(hands)) {
      if (+s === me) continue;
      list.forEach(({ slot, v }) => {
        const c = slotCard[slot]; if (!c) return;
        clearBadges(c); setFace(c, v);
        const p = c.position.clone();
        jobs.push(fly(c, p, { up: true, ms: 420, arc: 0.45 }));
      });
    }
    if (jobs.length) sfxCb('flip');
    await Promise.all(jobs);
  }
  async function recv(p, slot, v) {
    const c = slotCard[slot]; if (!c) return;
    setFace(c, v);
    const d = seatDef(p), mine = p === me;
    const to = handPos(p, 2); to.y += 0.012 + (mine && d.tilt ? 0.18 : 0);
    await fly(c, to, { up: true, tilt: mine ? d.tilt * 0.6 : 0, scale: d.scale, ms: 720, arc: 1.1 });
  }
  async function wind(v, low) {
    setFace(windCard, v);
    pointer.userData.spin = 9;
    sfxCb('wind');
    const p = windCard.position.clone();
    const up = p.clone(); up.y = 1.1; up.z += 0.25;
    await fly(windCard, up, { up: false, ms: 420, arc: 0, scale: 1.25 });
    await fly(windCard, up, { up: true, ms: 420, arc: 0.2, scale: 1.35, tilt: 0.5 });
    // the pointer swings to 大 (far side) or 小 (near side)
    pointer.userData.spin = 0;
    const cur = pointer.rotation.y % (Math.PI * 2);
    const goal = (low ? Math.PI : 0) + Math.PI * 4;
    const from = cur;
    await tween(1100, (t) => { pointer.rotation.y = lerp(from, goal, easeOut(t)); });
    pointer.userData.target = goal;
    await wait(550);
    await fly(windCard, p, { up: true, ms: 420, arc: 0.15, scale: 1, tilt: 0 });
  }
  async function loseGears(s, d) {
    const list = gears[s] || [];
    const jobs = [];
    for (let k = 0; k < d; k++) {
      const j = gearCount[s] - 1;
      if (j < 0) break;
      gearCount[s] = j;
      const g = list[j];
      const from = g.position.clone();
      const out = from.clone().setY(0).normalize();
      if (out.lengthSq() < 0.01) out.set(0, 0, 1);
      sfxCb('gear');
      jobs.push(wait(k * 260).then(() => tween(1250, (t) => {
        const e = easeIO(t);
        g.position.set(from.x + out.x * 9 * e * e, from.y + Math.sin(Math.PI * Math.min(1, t * 1.6)) * 1.6 - (t > 0.6 ? (t - 0.6) * 22 : 0), from.z + out.z * 9 * e * e);
        g.rotation.x = e * 7; g.rotation.y += 0.25;
        if (t >= 1) { g.visible = false; g.userData.gone = true; }
      })));
    }
    await Promise.all(jobs);
    // the rest close up and mesh again
    const n = gearCount[s];
    await tween(380, (t) => { list.forEach((g, j) => { if (j >= n) return; const p = gearPos(s, j, n); g.position.lerp(p, easeOut(t)); g.userData.home = p; }); });
  }
  async function moveKey(s) {
    if (s === keyHolder) return;
    keyHolder = s;
    const kp = keyPose(s), from = keyObj.position.clone(), r0 = keyObj.rotation.y;
    let r1 = kp.r; while (r1 - r0 > Math.PI) r1 -= Math.PI * 2; while (r0 - r1 > Math.PI) r1 += Math.PI * 2;
    sfxCb('key');
    await tween(900, (t) => {
      const e = easeIO(t);
      keyObj.position.set(lerp(from.x, kp.p.x, e), Math.sin(Math.PI * e) * 1.8, lerp(from.z, kp.p.z, e));
      keyObj.rotation.set(Math.sin(Math.PI * e) * 0.6, lerp(r0, r1, e) + Math.sin(Math.PI * e) * Math.PI * 2, 0);
    });
  }
  /* ---------------- tapping the field */
  function setPickable(list, mode, sel) {
    pickable = list ? new Set(list) : null; pickMode = mode || 'take'; selSlot = sel === undefined ? -1 : sel;
    renderPickable();
  }
  function renderPickable() {
    slotCard.forEach((c, i) => {
      if (!c) return;
      const on = pickable && pickable.has(i);
      c.userData.glow.material.map = on ? (i === selSlot ? glowTex.sel : glowTex[pickMode] || glowTex.take) : glowTex.take;
      c.userData.glow.material.needsUpdate = true;
      c.userData.glowOn = !!on;
      if (!on) c.userData.glow.material.opacity = 0;
    });
  }
  const ray = new T.Raycaster(), ptr = new T.Vector2();
  let down = null;
  canvasEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 14 || titleMode) return;
    const hit = pickAt(e.clientX, e.clientY);
    if (hit !== null && opts.onPick) opts.onPick(hit);
  });
  function pickAt(cx, cy) {
    const r = canvasEl.getBoundingClientRect();
    ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    const meshes = [];
    slotCard.forEach((c) => { if (c && c.visible) meshes.push(c.userData.body, c.userData.face, c.userData.back); });
    const hits = ray.intersectObjects(meshes, false);
    for (const h of hits) { const c = h.object.userData.card; if (c && c.userData.slot >= 0) return c.userData.slot; }
    // a near miss on a phone: the closest pickable card within a little distance on screen
    if (pickable) {
      let best = null, bd = 34;
      pickable.forEach((i) => { const sp = toScreen(fieldPos(i)); const d = Math.hypot(sp.x - (cx - r.left), sp.y - (cy - r.top)); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    return null;
  }

  /* ---------------- camera: fit everything between the top bar and the dock */
  function aspect() { const r = container.getBoundingClientRect(); return r.width / Math.max(1, r.height); }
  const camDir = new T.Vector3();
  const target = new T.Vector3();
  let dist = 16;
  function contentPoints() {
    const pts = [];
    const add = (p, pad = 0.75) => { pts.push(new T.Vector3(p.x - pad, 0, p.z - pad), new T.Vector3(p.x + pad, 0, p.z + pad), new T.Vector3(p.x - pad, 0, p.z + pad), new T.Vector3(p.x + pad, 0, p.z - pad)); };
    const rows = (nSeats === 3 ? L.rows9 : L.rows6);
    rows.forEach((z) => L.cols.forEach((x) => add(new T.Vector3(x, 0, z), 0.72)));
    add(new T.Vector3(L.dais[0], 0, L.dais[1]), 1.05);
    for (let s = 0; s < nSeats; s++) {
      const d = seatDef(s);
      d.hand.forEach((hx) => add(local(s, hx, 0), 0.62 * d.scale + (s === me ? 0.25 : 0)));
      add(local(s, 0, d.recv), 0.6 * d.scale);
      const g0 = local(s, d.gear[0] - (startGears - 1) / 2 * GEAR_DX, d.gear[1]), g1 = local(s, d.gear[0] + (startGears - 1) / 2 * GEAR_DX, d.gear[1]);
      add(g0, 0.42); add(g1, 0.42);
      add(local(s, d.key[0], d.key[1]), 0.62);
    }
    return pts;
  }
  function placeCam() {
    cam.position.copy(target).addScaledVector(camDir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
  }
  // the camera looks at the middle of everything from a fixed angle; its distance is the smallest that fits
  // the safe area, and a lens shift (view offset) moves the picture between the top bar and the dock
  function fit() {
    const r = container.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.clearViewOffset();
    if (titleMode) { const t = W / H < 0.9; cam.fov = t ? 50 : 40; if (t) cam.setViewOffset(W, H, 0, H * 0.24, W, H); cam.updateProjectionMatrix(); return; }
    const tall = W / H < 0.9;
    if (tall !== L.tall && seatGroups.length) { L = makeLayout(nSeats, tall); buildSeats(); if (lastView) { sync(lastView); return; } }
    cam.fov = tall ? 40 : 34;
    cam.updateProjectionMatrix();
    const elev = (tall ? 62 : 56) * Math.PI / 180;
    camDir.set(0, Math.sin(elev), Math.cos(elev));
    const topPx = opts.topPx ? opts.topPx() : 56, barPx = opts.barPx ? opts.barPx() : 110;
    const safe = { x0: -1 + 10 / W * 2, x1: 1 - 10 / W * 2, y0: -1 + barPx / H * 2, y1: 1 - topPx / H * 2 };
    const pts = contentPoints();
    let mx0 = 1e9, mx1 = -1e9, mz0 = 1e9, mz1 = -1e9;
    pts.forEach((p) => { mx0 = Math.min(mx0, p.x); mx1 = Math.max(mx1, p.x); mz0 = Math.min(mz0, p.z); mz1 = Math.max(mz1, p.z); });
    target.set((mx0 + mx1) / 2, 0, (mz0 + mz1) / 2);
    const bounds = () => {
      placeCam();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      pts.forEach((p) => { const q = p.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
      return { x0, x1, y0, y1 };
    };
    let lo = 6, hi = 90;
    for (let it = 0; it < 32; it++) {
      dist = (lo + hi) / 2;
      const b = bounds();
      const fits = b.x1 - b.x0 <= safe.x1 - safe.x0 && b.y1 - b.y0 <= safe.y1 - safe.y0;
      if (fits) hi = dist; else lo = dist;
    }
    dist = hi;
    const b = bounds();
    const dx = (safe.x0 + safe.x1) / 2 - (b.x0 + b.x1) / 2, dy = (safe.y0 + safe.y1) / 2 - (b.y0 + b.y1) / 2;
    cam.setViewOffset(W, H, -dx * W / 2, dy * H / 2, W, H);
    cam.updateProjectionMatrix();
  }
  let lastView = null;

  /* ---------------- screen positions for the page's labels */
  const tmpV = new T.Vector3();
  function toScreen(p) {
    const r = container.getBoundingClientRect();
    tmpV.copy(p).project(cam);
    return { x: (tmpV.x + 1) / 2 * r.width, y: (1 - tmpV.y) / 2 * r.height };
  }
  function anchors() {
    const out = { seats: [], hands: [], slots: [], dial: null };
    if (titleMode || !seatGroups.length) return out;
    for (let s = 0; s < nSeats; s++) {
      const d = seatDef(s);
      const tagLocal = s === me ? local(s, d.hand[0] - 0.95 * d.scale, -0.15) : local(s, 0, d.gear[1] + 0.65);
      if (L.tall && s !== me) tagLocal.copy(local(s, 0, d.key[1] + 0.55));
      if (!L.tall && s !== me) tagLocal.copy(local(s, 0, 0.95));
      out.seats.push(toScreen(tagLocal));
      out.hands.push(toScreen(local(s, 0, d.recv - 0.95)));
    }
    slotCard.forEach((c, i) => { out.slots[i] = c ? toScreen(c.position) : null; });
    const up = L.tall ? -1 : 1;   // phones: the names go above (the field is below them)
    out.dial = toScreen(new T.Vector3(L.dais[0], 0, L.dais[1] + up * 1.22));
    out.unused = unusedCards.length && unusedCards[0].visible ? toScreen(new T.Vector3(L.unused[0], 0, L.unused[1] + (L.unusedRot ? 0.75 : up * 0.82))) : null;
    return out;
  }

  /* ---------------- the title: the table turns slowly with gears and the key on it */
  function titleLayout() {
    me = 0; nSeats = 2; startGears = 5;
    L = makeLayout(2, false);
    buildSeats();
    fieldN = 6;
    slotCard = [];
    const show = [9, 3, 7, 0, 5, 8];
    for (let i = 0; i < 10; i++) {
      const c = cards[i];
      if (i < 6) { c.visible = true; c.userData.slot = -1; c.userData.shadow.visible = true; c.userData.glow.visible = true; setFace(c, show[i]); pose(c, fieldPos(i), 0, true); clearBadges(c); }
      else if (i === 6) { c.visible = true; c.userData.slot = -1; setFace(c, null); pose(c, new T.Vector3(L.dais[0], 0.13, L.dais[1]), 0, false); clearBadges(c); }
      else { c.visible = false; c.userData.shadow.visible = false; c.userData.glow.visible = false; clearBadges(c); }
      c.userData.glow.material.opacity = 0;
    }
    gearCount = [5, 5]; layGears(0); layGears(1);
    keyHolder = 0; const kp = keyPose(0); keyObj.position.copy(kp.p); keyObj.rotation.set(0, kp.r, 0);
  }
  function setTitleMode(on) {
    titleMode = on;
    if (on) titleLayout();
    fit();
  }

  /* ---------------- the frame loop */
  let last = performance.now(), sfxCb = () => {};
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    anims.forEach((a) => a.step(now));
    // idle motion: gears turn, the dial pointer wanders, clouds drift
    gears.forEach((list) => list.forEach((g, j) => { if (g.visible && !g.userData.gone) g.userData.mesh.rotation.y += dt * 0.35 * g.userData.dir; }));
    if (pointer.userData.spin) pointer.rotation.y += dt * pointer.userData.spin;
    clouds.forEach((c) => { c.position.x += dt * c.userData.v; if (c.position.x > 60) c.position.x = -60; });
    // pickable cards breathe
    const pulse = 0.55 + 0.35 * Math.sin(now / 260);
    slotCard.forEach((c) => { if (c && c.userData.glowOn) c.userData.glow.material.opacity = pulse; });
    if (titleMode && coverPose) {
      const c = coverPose;
      cam.position.set(Math.sin(c.angle) * c.radius, c.height, Math.cos(c.angle) * c.radius);
      cam.lookAt(c.look[0], c.look[1], c.look[2]);
    } else if (titleMode) {
      titleT += dt;
      const a = titleT * 0.09, rad = cam.aspect < 0.9 ? 15.5 : 13.5;
      cam.position.set(Math.sin(a) * rad, 7.6 + Math.sin(titleT * 0.3) * 0.5, Math.cos(a) * rad);
      cam.lookAt(0, -0.4, 0);
    }
    renderer.render(scene, cam);
    if (opts.onFrame) opts.onFrame();
    raf = requestAnimationFrame(frame);
  }
  let raf = requestAnimationFrame(frame);
  const ro = new ResizeObserver(() => fit());
  ro.observe(container);
  window.addEventListener('orientationchange', () => setTimeout(fit, 250));

  titleLayout();
  fit();

  return {
    setHost(el) { if (el === container) return; container = el; el.appendChild(canvasEl); ro.disconnect(); ro.observe(el); fit(); },
    setTitleMode,
    setSpeed(k) { speed = k; },
    setSfx(fn) { sfxCb = fn || (() => {}); },
    sync(v) { lastView = v; titleMode = false; sync(v); fit(); },
    remember(v) { lastView = v; },
    deal: async (v) => { lastView = v; titleMode = false; await deal(v); },
    peek, markSeen, take, reveal, showHands, recv, wind, loseGears, moveKey, setPickable,
    anchors, fit,
    seatColor: (s) => SEAT_COLORS[s % 3],
    snapshot() { renderer.render(scene, cam); return canvasEl.toDataURL('image/jpeg', 0.9); },
    // a still picture for the shelf cover: the title table seen from one angle, shifted by a lens offset
    cover(cp) {
      coverPose = cp; titleMode = true; titleLayout();
      if (cp.faces) cp.faces.forEach((v, i) => { const c = cards[i]; if (!c) return; setFace(c, v); pose(c, c.position.clone(), (i % 2 ? 0.08 : -0.06), v !== null, 0, 1); });
      if (cp.keyAt) { keyObj.position.set(cp.keyAt[0], 0, cp.keyAt[1]); keyObj.rotation.set(0, cp.keyAt[2] || 0, 0); }
      if (cp.gearsAt) (gears[0] || []).forEach((g, j) => { const q = cp.gearsAt[j]; if (!q) { g.visible = false; return; } g.visible = true; g.position.set(q[0], 0, q[1]); });
      const r = container.getBoundingClientRect();
      cam.fov = cp.fov || 34; cam.aspect = r.width / r.height;
      renderer.setSize(r.width, r.height, false);
      cam.setViewOffset(r.width, r.height, -(cp.shift || 0) * r.width, (cp.lift || 0) * r.height, r.width, r.height);
      cam.updateProjectionMatrix();
    },
    debug() { return { cam: cam.position.toArray(), target: target.toArray(), dist, fov: cam.fov, aspect: cam.aspect, size: [canvasEl.width, canvasEl.height], parent: canvasEl.parentNode && canvasEl.parentNode.id, titleMode, tall: L.tall, nSeats, me, cards: cards.map((c) => c.visible ? c.position.toArray().map((x) => +x.toFixed(2)) : null) }; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); }
  };
}
