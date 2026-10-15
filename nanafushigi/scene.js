/* ナナフシギ・デュエル — the 3D table (three.js r160 from a CDN).
   World units: a card is 1.0 wide and 1.5 long, lying flat (y up). The card structure sits around the origin,
   the conflict track and the progress tokens beside it. Two layouts: 'wide' (track on the left, tokens on the right,
   both upright) and 'tall' for phones held upright (track across the top, tokens along the bottom).
   The seat in `persp` is the one sitting at the near side; the conflict pawn moves toward the far side when that
   seat pushes. Every animation returns a promise and is scaled by `speed`. */
import { cardCanvas, backCanvas, tokenCanvas, canvas, rr, SEAT_COL, FONT_LAT, FONT_JP, drawCoin } from './art.js';

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
  'https://unpkg.com/three@0.160.0/build/three.module.min.js'
];
let T = null;
export async function loadThree() {
  if (T) return T;
  let err = null;
  for (const u of (window.NFD_THREE_URLS || THREE_URLS)) {
    try { T = await import(u); return T; } catch (e) { err = e; }
  }
  throw err || new Error('three.js');
}

const E = window.NFD_ENG;
const CW = 1.0, CH = 1.5, CT = 0.022, RZ = 0.68, PX = 1.08, CELL = 0.3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = { io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), out: (t) => 1 - Math.pow(1 - t, 3), back: (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }, lin: (t) => t, in: (t) => t * t * t };

export async function createScene(host, opts) {
  const THREE = await loadThree();
  const quality = opts.quality || 'high';
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080d');
  scene.fog = new THREE.Fog('#07080d', 18, 34);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* ---------------------------------------------------------- lights */
  scene.add(new THREE.HemisphereLight('#ffe9c4', '#1a1c2a', 0.85));
  const key = new THREE.DirectionalLight('#fff1d8', 1.55);
  key.position.set(-4, 12, 6);
  key.castShadow = renderer.shadowMap.enabled;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -0.0006;
  scene.add(key);
  const torches = [new THREE.PointLight('#ff9a3c', 14, 16, 1.8), new THREE.PointLight('#ff8a2a', 12, 16, 1.8)];
  torches[0].position.set(-6.5, 3.2, -4.5); torches[1].position.set(6.5, 3.2, 4.2);
  torches.forEach((l) => scene.add(l));
  const glowLight = new THREE.PointLight('#ffd27a', 0, 9, 1.6);
  scene.add(glowLight);

  /* ---------------------------------------------------------- table */
  function tableTexture() {
    const c = canvas(1024, 1024), x = c.getContext('2d');
    const g = x.createRadialGradient(512, 512, 60, 512, 512, 720);
    g.addColorStop(0, '#2b2a33'); g.addColorStop(0.6, '#1a1920'); g.addColorStop(1, '#0b0b10');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    // marble veins
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = 'rgba(200,190,220,' + (0.02 + Math.random() * 0.04) + ')'; x.lineWidth = 1 + Math.random() * 3;
      x.beginPath(); let px = Math.random() * 1024, py = Math.random() * 1024; x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (Math.random() - 0.5) * 220; py += (Math.random() - 0.3) * 160; x.lineTo(px, py); }
      x.stroke();
    }
    // gilt inlay
    x.strokeStyle = 'rgba(214,176,90,.55)'; x.lineWidth = 6; rr(x, 92, 92, 840, 840, 40); x.stroke();
    x.strokeStyle = 'rgba(214,176,90,.25)'; x.lineWidth = 2; rr(x, 112, 112, 800, 800, 30); x.stroke();
    x.save(); x.translate(512, 512); x.strokeStyle = 'rgba(214,176,90,.12)'; x.lineWidth = 2;
    for (let i = 0; i < 24; i++) { x.rotate(Math.PI / 12); x.beginPath(); x.moveTo(0, 150); x.lineTo(0, 420); x.stroke(); }
    x.beginPath(); x.arc(0, 0, 150, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 420, 0, 7); x.stroke();
    x.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  }
  const table = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: tableTexture(), roughness: 0.62, metalness: 0.15 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  /* ---------------------------------------------------------- geometry shared by cards */
  function roundedShape(w, h, r) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  }
  function faceGeo(w, h, r) {
    const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 6);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    return g;
  }
  const FACE = faceGeo(CW, CH, 0.07);
  const EDGE = new THREE.ExtrudeGeometry(roundedShape(CW * 0.995, CH * 0.995, 0.07), { depth: CT, bevelEnabled: false, curveSegments: 6 });
  EDGE.translate(0, 0, -CT / 2);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#d9c08a', roughness: 0.6, metalness: 0.2 });
  const texCache = new Map();
  function tex(key, make) {
    if (texCache.has(key)) return texCache.get(key);
    const t = new THREE.CanvasTexture(make()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    texCache.set(key, t);
    return t;
  }
  function frontMat(id) { return new THREE.MeshStandardMaterial({ map: tex('c' + id, () => cardCanvas(id)), roughness: 0.55, metalness: 0.05, emissive: '#ffcf6a', emissiveIntensity: 0 }); }
  function backMat(kind) { return new THREE.MeshStandardMaterial({ map: tex('b' + kind, () => backCanvas(kind)), roughness: 0.5, metalness: 0.12 }); }
  function haloTexture() {
    const c = canvas(256, 360), x = c.getContext('2d');
    for (let i = 14; i > 0; i--) { x.strokeStyle = 'rgba(255,214,110,' + (0.06 * (15 - i) / 14) + ')'; x.lineWidth = i * 3; rr(x, 40, 40, 176, 280, 22); x.stroke(); }
    x.strokeStyle = 'rgba(255,240,190,.95)'; x.lineWidth = 3; rr(x, 40, 40, 176, 280, 22); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const haloTex = haloTexture();

  /* a card: a group whose local +y is the face. Flip by rotating group.rotation.z = PI. */
  function makeCard(id, back) {
    const g = new THREE.Group();
    const front = new THREE.Mesh(FACE, id != null ? frontMat(id) : backMat(back));
    front.rotation.x = -Math.PI / 2; front.position.y = CT / 2 + 0.0005; front.castShadow = true;
    const rear = new THREE.Mesh(FACE, backMat(back));
    rear.rotation.x = Math.PI / 2; rear.position.y = -CT / 2 - 0.0005; rear.rotation.z = Math.PI;
    const edge = new THREE.Mesh(EDGE, edgeMat); edge.rotation.x = -Math.PI / 2; edge.castShadow = true;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.45, CH * 1.4), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.004; halo.renderOrder = -1;
    g.add(halo, edge, front, rear);
    g.userData = { front, rear, halo, id, back };
    return g;
  }
  function setFace(g, id) {
    if (g.userData.id === id) return;
    g.userData.id = id;
    g.userData.front.material = id != null ? frontMat(id) : backMat(g.userData.back);
  }
  /* a face-down card that a spectator may see: face up, dimmed blue, with a faint glow so it reads as 'secret' */
  function setPeek(g, on) {
    g.userData.peek = on;
    const m = g.userData.front.material;
    if (m.color) m.color.set(on ? '#8d97c4' : '#ffffff');
  }

  /* ---------------------------------------------------------- conflict track */
  let layout = 'wide', persp = 0;
  const trackGroup = new THREE.Group(); scene.add(trackGroup);
  function trackTexture() {
    const c = canvas(2048, 260), x = c.getContext('2d'), w = 2048 / 21;
    x.fillStyle = '#16120d'; rr(x, 0, 0, 2048, 260, 40); x.fill();
    for (let i = -9; i <= 9; i++) {
      const cx = (i + 10) * w, a = Math.abs(i);
      const col = a === 0 ? '#8a7a5a' : a <= 2 ? '#6b5a3a' : a <= 5 ? '#7a3a28' : '#8f2219';
      x.fillStyle = col; rr(x, cx - w / 2 + 6, 46, w - 12, 168, 14); x.fill();
      x.strokeStyle = 'rgba(255,220,150,.45)'; x.lineWidth = 3; rr(x, cx - w / 2 + 6, 46, w - 12, 168, 14); x.stroke();
      if (a === 9) {
        x.fillStyle = i > 0 ? SEAT_COL[1 - persp] : SEAT_COL[persp];
        x.globalAlpha = 0.85; rr(x, cx - w / 2 + 6, 46, w - 12, 168, 14); x.fill(); x.globalAlpha = 1;
        x.fillStyle = '#1a120a'; x.font = '900 70px ' + FONT_LAT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('♜', cx, 132);
      }
    }
    // VP numbers under each zone (for the side that would score them)
    x.fillStyle = '#ffe7a6'; x.font = '900 46px ' + FONT_LAT; x.textAlign = 'center'; x.textBaseline = 'middle';
    [[1.5, '2'], [4, '5'], [7, '10']].forEach(([m, t]) => { x.fillText(t, (10 + m) * w, 132); x.fillText(t, (10 - m) * w, 132); });
    x.fillStyle = 'rgba(255,231,166,.85)'; x.font = '700 30px ' + FONT_JP; x.fillText('勝利点', 10 * w, 26); x.fillText('▲ 相手の首都', 18.5 * w, 238); x.fillText('自分の首都 ▼', 1.5 * w, 238);
    x.fillStyle = '#ffe7a6'; x.font = '900 60px ' + FONT_LAT; x.fillText('⚔', 10 * w, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  }
  const trackLen = 21 * CELL;
  let trackMesh = new THREE.Mesh(new THREE.PlaneGeometry(trackLen, trackLen * 260 / 2048), new THREE.MeshStandardMaterial({ map: trackTexture(), roughness: 0.5, metalness: 0.25 }));
  trackMesh.receiveShadow = true;
  trackGroup.add(trackMesh);
  const pawn = new THREE.Group();
  {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color: '#ff3b2a', emissive: '#ff2a10', emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3 }));
    crystal.scale.y = 1.7; crystal.position.y = 0.32; crystal.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#d4af5a', metalness: 0.8, roughness: 0.3 }));
    base.position.y = 0.04; base.castShadow = true;
    const pl = new THREE.PointLight('#ff4a2a', 2.5, 2.5, 2); pl.position.y = 0.5;
    pawn.add(crystal, base, pl);
    pawn.userData.crystal = crystal;
  }
  trackGroup.add(pawn);
  const lootMeshes = {};
  function lootTexture(n) {
    const c = canvas(128, 128), x = c.getContext('2d');
    drawCoin(x, n, 64, 64, 120);
    x.strokeStyle = '#7a1a10'; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 54, 0, 7); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  ['a3', 'a6', 'b3', 'b6'].forEach((k) => {
    const n = k[1] === '3' ? 2 : 5;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28), [new THREE.MeshStandardMaterial({ color: '#a8740c', metalness: 0.7, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: lootTexture(n), metalness: 0.4, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#a8740c' })]);
    m.castShadow = true;
    trackGroup.add(m);
    lootMeshes[k] = m;
  });
  function trackPoint(m, off) {
    // m: pawn value (seat0 positive); p: toward the far player when > 0
    const p = persp === 0 ? m : -m;
    if (layout === 'wide') return new THREE.Vector3(TRACK.x + (off || 0), 0.03, -p * CELL);
    return new THREE.Vector3(p * CELL, 0.03, TRACK.z + (off || 0));
  }
  const TRACK = { x: -4.15, z: -3.62 };
  function placeTrack() {
    if (layout === 'wide') { trackMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2); trackMesh.position.set(TRACK.x, 0.012, 0); }
    else { trackMesh.rotation.set(-Math.PI / 2, 0, 0); trackMesh.position.set(0, 0.012, TRACK.z); }
    for (const k in lootMeshes) {
      const m = lootMeshes[k], v = (k[0] === 'a' ? 1 : -1) * (k[1] === '3' ? 4 : 7);
      const p = trackPoint(v, layout === 'wide' ? 0.62 : 0.62);
      m.position.set(p.x, m.visible ? 0.05 : -1, p.z);
    }
  }

  /* ---------------------------------------------------------- progress tokens */
  const tokGroup = new THREE.Group(); scene.add(tokGroup);
  const tokMeshes = new Map();   // token id -> mesh
  function makeToken(t) {
    const top = new THREE.MeshStandardMaterial({ map: tex('t' + t, () => tokenCanvas(t, 256)), roughness: 0.4, metalness: 0.2, emissive: '#7dffb0', emissiveIntensity: 0 });
    const side = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.75, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.07, 40), [side, top, side]);
    m.castShadow = true;
    m.userData = { tok: t, top };
    return m;
  }
  function tokenSpot(i, n) {
    if (layout === 'wide') return new THREE.Vector3(-TRACK.x, 0.05, (i - (n - 1) / 2) * 1.0);
    return new THREE.Vector3((i - (n - 1) / 2) * 1.0, 0.05, -TRACK.z);
  }
  let tokOrder = [];
  function setTokens(list, animate) {
    tokOrder = list.slice();
    for (const [t, m] of tokMeshes) if (list.indexOf(t) < 0) { tokGroup.remove(m); tokMeshes.delete(t); }
    list.forEach((t, i) => {
      let m = tokMeshes.get(t);
      if (!m) { m = makeToken(t); tokMeshes.set(t, m); tokGroup.add(m); m.position.copy(tokenSpot(i, 5)); if (animate) { m.position.y = 3; tween(0.5, (k) => { m.position.y = 0.05 + (1 - k) * 3; }, ease.out, i * 0.08); } }
      else m.position.copy(tokenSpot(i, 5));
    });
  }
  function slotTokenSpots() { for (let i = 0; i < 5; i++) { const p = tokenSpot(i, 5); const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.44, 40), new THREE.MeshBasicMaterial({ color: '#c9a24a', transparent: true, opacity: 0.35 })); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.013, p.z); ring.userData.spot = i; tokGroup.add(ring); } }

  /* ---------------------------------------------------------- the card structure */
  let slots = [];          // { g (group), s (slot data), i }
  const cardGroup = new THREE.Group(); scene.add(cardGroup);
  let nRows = 5;
  function slotPos(s) {
    return new THREE.Vector3(s.x * PX, 0.02 + s.row * 0.006, (s.row - (nRows - 1) / 2) * RZ);
  }
  const deckPos = () => new THREE.Vector3(0, 2.6, -7.5);
  function backKind(age, guild) { return guild ? 'guild' : age; }
  function clearSlots() { slots.forEach((o) => { if (o) cardGroup.remove(o.g); }); slots = []; }
  async function dealAge(view, animate) {
    clearSlots();
    nRows = E.LAYOUTS[view.age].rows.length;
    const proms = [];
    view.slots.forEach((s, i) => {
      if (s.taken) { slots.push(null); return; }
      const g = makeCard(s.card, backKind(view.age, s.guild));
      const p = slotPos(s);
      g.userData.slot = i;
      g.userData.front.userData.slot = i;
      g.userData.rear.userData.slot = i;
      cardGroup.add(g);
      const o = { g, s: Object.assign({}, s), i, home: p };
      slots.push(o);
      const showUp = s.up || s.card != null;
      if (!s.up && s.card != null) setPeek(g, true);
      if (!animate) { g.position.copy(p); g.rotation.z = showUp ? 0 : Math.PI; return; }
      g.position.copy(deckPos()); g.rotation.set(0.3, 0, Math.PI);
      const from = deckPos(), d = i * 0.045;
      proms.push(tween(0.55, (k) => {
        g.position.lerpVectors(from, p, k);
        g.position.y += Math.sin(k * Math.PI) * 1.4;
        g.rotation.x = 0.3 * (1 - k);
        g.rotation.z = showUp ? Math.PI * (1 - k) : Math.PI;
      }, ease.io, d).then(() => { if (opts.sfx) opts.sfx('deal'); }));
    });
    await Promise.all(proms);
  }
  function syncSlots(view) {
    if (!view.slots || !view.slots.length) { clearSlots(); return; }
    if (slots.length !== view.slots.length || view.age !== curAge) { curAge = view.age; dealAge(view, false); return; }
    view.slots.forEach((s, i) => {
      let o = slots[i];
      if (s.taken) { if (o) { cardGroup.remove(o.g); slots[i] = null; } return; }
      if (!o) {   // a card that should be on the table but is not (e.g. after an interrupted deal)
        const g = makeCard(s.card, backKind(view.age, s.guild));
        g.userData.slot = i; g.userData.front.userData.slot = i; g.userData.rear.userData.slot = i;
        cardGroup.add(g);
        o = slots[i] = { g, s: Object.assign({}, s), i, home: slotPos(s) };
        g.position.copy(o.home); g.rotation.z = s.up || s.card != null ? 0 : Math.PI;
        if (!s.up && s.card != null) setPeek(g, true);
      }
      if (s.card != null && o.g.userData.id !== s.card) setFace(o.g, s.card);
      if (!s.up && s.card != null && !o.g.userData.peek) setPeek(o.g, true);
      if (s.up && o.g.userData.peek) setPeek(o.g, false);
      if ((s.up || s.card != null) && o.g.rotation.z !== 0 && !o.busy) o.g.rotation.z = 0;
      o.s = Object.assign({}, s);
      if (!o.busy) o.g.position.copy(o.home);
    });
  }
  let curAge = 0;
  function setAge(a) { curAge = a; }

  /* ---------------------------------------------------------- tweens */
  const tweens = [];
  let speed = 1;
  function tween(dur, fn, ez, delay) {
    return new Promise((res) => tweens.push({ t: -(delay || 0) / speed, dur: Math.max(0.01, dur / speed), fn, ez: ez || ease.io, res }));
  }
  function stepTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      w.t += dt;
      if (w.t < 0) continue;
      const k = clamp(w.t / w.dur, 0, 1);
      w.fn(w.ez(k));
      if (k >= 1) { tweens.splice(i, 1); w.res(); }
    }
  }

  /* ---------------------------------------------------------- effects */
  const fxGroup = new THREE.Group(); scene.add(fxGroup);
  function pillarTexture() {
    const c = canvas(64, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,230,150,0)'); g.addColorStop(0.7, 'rgba(255,220,120,.7)'); g.addColorStop(1, 'rgba(255,250,220,1)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const pillarTex = pillarTexture();
  function pillar(pos, color, height) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, height || 9, 32, 1, true), new THREE.MeshBasicMaterial({ map: pillarTex, color: color || '#ffd27a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos.x, (height || 9) / 2, pos.z);
    fxGroup.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 64), new THREE.MeshBasicMaterial({ color: color || '#ffd27a', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.05, pos.z); fxGroup.add(ring);
    glowLight.position.set(pos.x, 1.5, pos.z); glowLight.color.set(color || '#ffd27a');
    return tween(1.6, (k) => {
      m.material.opacity = Math.sin(k * Math.PI) * 0.95; m.scale.set(0.4 + k * 0.9, 1, 0.4 + k * 0.9); m.rotation.y = k * 3;
      ring.scale.setScalar(1 + k * 6); ring.material.opacity = (1 - k) * 0.9;
      glowLight.intensity = Math.sin(k * Math.PI) * 22;
    }, ease.lin).then(() => { fxGroup.remove(m); fxGroup.remove(ring); glowLight.intensity = 0; });
  }
  function shockRing(pos, color, size) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, 0.06, pos.z); fxGroup.add(ring);
    return tween(0.8, (k) => { ring.scale.setScalar(1 + k * (size || 5)); ring.material.opacity = 1 - k; }, ease.out).then(() => fxGroup.remove(ring));
  }
  // golden dust
  const DUST = quality === 'low' ? 60 : 180;
  const dustGeo = new THREE.BufferGeometry(), dustPos = new Float32Array(DUST * 3), dustVel = [];
  for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 16; dustPos[i * 3 + 1] = Math.random() * 5; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 12; dustVel.push(0.05 + Math.random() * 0.15); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dotC = canvas(32, 32), dx = dotC.getContext('2d'), dg = dx.createRadialGradient(16, 16, 0, 16, 16, 16); dg.addColorStop(0, 'rgba(255,230,160,1)'); dg.addColorStop(1, 'rgba(255,200,100,0)'); dx.fillStyle = dg; dx.fillRect(0, 0, 32, 32);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(dotC), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  /* ---------------------------------------------------------- camera fitting */
  const camTarget = new THREE.Vector3(0, 0, 0.1);
  let camDist = 14, camTilt = 1.1, W = 1, H = 1, fitBox = null, breathe = 0;
  function bounds() {
    if (layout === 'wide') return { x0: -4.75, x1: 4.75, z0: -3.25, z1: 3.25 };
    return { x0: -3.4, x1: 3.4, z0: -4.25, z1: 4.25 };
  }
  function fit() {
    const b = fitBox || bounds();
    camTarget.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2 + 0.15);
    const corners = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
    let lo = 4, hi = 60;
    for (let it = 0; it < 26; it++) {
      const d = (lo + hi) / 2;
      placeCam(d, 0);
      camera.updateMatrixWorld();
      const ok = corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) <= 0.97 && Math.abs(p.y) <= 0.95; });
      if (ok) hi = d; else lo = d;
    }
    camDist = hi;
    placeCam(camDist, 0);
  }
  function placeCam(d, t) {
    const tilt = camTilt + Math.sin(t * 0.25) * 0.008;
    camera.position.set(camTarget.x + Math.sin(t * 0.17) * 0.06, camTarget.y + Math.sin(tilt) * d, camTarget.z + Math.cos(tilt) * d);
    camera.lookAt(camTarget);
  }
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const want = W / H < 0.95 ? 'tall' : 'wide';
    if (want !== layout) { layout = want; relayout(); }
    fit();
  }
  function relayout() {
    placeTrack();
    pawnTo(lastMil, false);
    setTokens(tokOrder, false);
    tokGroup.children.filter((c) => c.userData.spot != null).forEach((c) => { const p = tokenSpot(c.userData.spot, 5); c.position.set(p.x, 0.013, p.z); });
  }
  let lastMil = 0;
  function pawnTo(m, animate) {
    const from = pawn.position.clone(), to = trackPoint(m);
    const prev = lastMil; lastMil = m;
    if (!animate) { pawn.position.copy(to); return Promise.resolve(); }
    const steps = Math.max(1, Math.abs(m - prev));
    const p = tween(0.32 * steps + 0.2, (k) => { pawn.position.lerpVectors(from, to, k); pawn.position.y = Math.abs(Math.sin(k * Math.PI * steps)) * 0.35; }, ease.io);
    return p.then(() => { shockRing(to, '#ff4a2a', 2.5); });
  }
  function setPersp(seat) {
    if (seat === persp) return;
    persp = seat;
    trackMesh.material.map.dispose();
    trackMesh.material.map = trackTexture();
    trackMesh.material.needsUpdate = true;
    relayout();
  }

  /* ---------------------------------------------------------- card actions */
  function slotWorld(i) { const o = slots[i]; return o ? o.g.position.clone() : null; }
  function toScreen(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, z: p.z };
  }
  function slotScreen(i, top) {
    const o = slots[i]; if (!o) return null;
    const v = o.g.position.clone(); if (top) v.z -= CH * 0.36;
    return toScreen(v);
  }
  async function takeCard(i, how, nearSide, card) {
    const o = slots[i]; if (!o) return;
    o.busy = true;
    const g = o.g, from = g.position.clone();
    if (card != null) setFace(g, card);
    if (g.userData.peek) setPeek(g, false);
    g.userData.halo.material.opacity = 0;
    const lift = new THREE.Vector3(from.x, 1.3, from.z + (nearSide ? 0.4 : -0.4));
    await tween(0.28, (k) => { g.position.lerpVectors(from, lift, k); g.rotation.x = (nearSide ? -0.5 : 0.5) * k; g.scale.setScalar(1 + k * 0.15); }, ease.out);
    if (how === 'build' || how === 'mausoleum') {
      const to = new THREE.Vector3(nearSide ? 1.5 : -1.5, nearSide ? 4.5 : 3.2, nearSide ? 7.5 : -8.5);
      const a = g.position.clone();
      await tween(0.5, (k) => { g.position.lerpVectors(a, to, k); g.rotation.x = (nearSide ? -0.5 : 0.5) + (nearSide ? -0.6 : 0.4) * k; g.scale.setScalar(1.15 - k * 0.3); }, ease.in);
    } else if (how === 'discard') {
      const a = g.position.clone(), to = new THREE.Vector3(a.x + 3.5, 0.6, a.z + 1);
      await tween(0.55, (k) => { g.position.lerpVectors(a, to, k); g.rotation.z = k * Math.PI * 3; g.scale.setScalar(1.15 * (1 - k)); }, ease.in);
    } else if (how === 'wonder') {
      const a = g.position.clone(), to = new THREE.Vector3(0, 3.2, 1.2);
      await tween(0.45, (k) => { g.position.lerpVectors(a, to, k); g.rotation.x = -0.9 * k; g.rotation.y = k * Math.PI * 2; g.scale.setScalar(1.15 + k * 0.5); g.userData.front.material.emissiveIntensity = k * 0.8; }, ease.io);
      pillar(new THREE.Vector3(0, 0, 0.6), '#ffd27a');
      await tween(0.35, (k) => { g.scale.setScalar(1.65 * (1 - k)); g.position.y = 3.2 + k; }, ease.in);
    }
    cardGroup.remove(g);
    slots[i] = null;
  }
  async function reveal(i, card) {
    const o = slots[i]; if (!o) return;
    setFace(o.g, card);
    if (o.g.userData.peek) {   // a spectator already saw it: just light it up
      setPeek(o.g, false);
      shockRing(o.home, '#ffe7a6', 1.2);
      await tween(0.35, (k) => { o.g.position.y = o.home.y + Math.sin(k * Math.PI) * 0.4; }, ease.io);
      return;
    }
    o.busy = true;
    const g = o.g, base = o.home.clone();
    await tween(0.5, (k) => { g.rotation.z = Math.PI * (1 - k); g.position.y = base.y + Math.sin(k * Math.PI) * 0.7; }, ease.io);
    g.rotation.z = 0; g.position.copy(base);
    o.busy = false;
    shockRing(base, '#ffe7a6', 1.2);
  }
  function lootGone(key) {
    const m = lootMeshes[key]; if (!m) return Promise.resolve();
    const p = m.position.clone();
    shockRing(p, '#ffcc4a', 3);
    return tween(0.6, (k) => { m.position.y = p.y + k * 1.5; m.rotation.x = k * 6; m.scale.setScalar(1 - k); }, ease.in).then(() => { m.visible = false; });
  }
  function setLoot(loot) { for (const k in lootMeshes) { const m = lootMeshes[k]; m.visible = !!loot[k]; m.scale.setScalar(1); m.rotation.set(0, 0, 0); } placeTrack(); }
  function tokenTaken(t, nearSide) {
    const m = tokMeshes.get(t); if (!m) return Promise.resolve();
    const a = m.position.clone(), to = new THREE.Vector3(0, nearSide ? 4 : 3, nearSide ? 7 : -8);
    m.userData.top.emissiveIntensity = 1;
    shockRing(a, '#7dffb0', 2.4);
    return tween(0.8, (k) => { m.position.lerpVectors(a, to, ease.in(k)); m.position.y += Math.sin(k * Math.PI) * 1.4; m.rotation.x = k * 4; }, ease.lin).then(() => { tokGroup.remove(m); tokMeshes.delete(t); tokOrder = tokOrder.filter((x) => x !== t); });
  }

  /* ---------------------------------------------------------- highlighting & picking */
  let hi = new Set(), hover = -1, hiTok = new Set();
  function highlight(list) { hi = new Set(list || []); }
  function highlightTokens(list) { hiTok = new Set(list || []); }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const objs = [];
    slots.forEach((o) => { if (o) objs.push(o.g.userData.front, o.g.userData.rear); });
    tokMeshes.forEach((m) => objs.push(m));
    const hit = ray.intersectObjects(objs, false)[0];
    if (!hit) return null;
    if (hit.object.userData.tok != null) return { tok: hit.object.userData.tok };
    return { slot: hit.object.userData.slot };
  }
  function setHover(i) { hover = i == null ? -1 : i; }

  /* ---------------------------------------------------------- loop */
  let last = performance.now(), running = true, t0 = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t0 += dt;
    stepTweens(dt);
    // highlight pulse + hover lift
    const pulse = 0.55 + Math.sin(t0 * 4) * 0.25;
    slots.forEach((o) => {
      if (!o) return;
      const on = hi.has(o.i);
      o.g.userData.halo.material.opacity += ((on ? pulse : 0) - o.g.userData.halo.material.opacity) * Math.min(1, dt * 10);
      if (!o.busy) {
        const want = o.home.y + (o.i === hover && on ? 0.12 : 0);
        o.g.position.y += (want - o.g.position.y) * Math.min(1, dt * 12);
      }
    });
    tokMeshes.forEach((m, t) => { const on = hiTok.has(t); m.userData.top.emissiveIntensity += ((on ? 0.25 + Math.sin(t0 * 5) * 0.2 : 0) - m.userData.top.emissiveIntensity) * Math.min(1, dt * 8); if (on) m.position.y = 0.05 + Math.abs(Math.sin(t0 * 3)) * 0.12; });
    pawn.userData.crystal.rotation.y += dt * 1.4;
    torches[0].intensity = 13 + Math.sin(t0 * 9.1) * 1.2 + Math.sin(t0 * 23.7) * 0.8;
    torches[1].intensity = 11 + Math.sin(t0 * 8.3 + 1) * 1.2 + Math.sin(t0 * 19.1) * 0.8;
    const pa = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) { pa[i * 3 + 1] += dustVel[i] * dt; pa[i * 3] += Math.sin(t0 * 0.7 + i) * dt * 0.05; if (pa[i * 3 + 1] > 5) pa[i * 3 + 1] = 0; }
    dustGeo.attributes.position.needsUpdate = true;
    placeCam(camDist, t0 + breathe);
    if (shakeAmt > 0.001) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt *= Math.pow(0.02, dt); }
    renderer.render(scene, camera);
    if (opts.onFrame) opts.onFrame();
    requestAnimationFrame(frame);
  }
  slotTokenSpots();
  placeTrack();
  resize();
  requestAnimationFrame(frame);
  window.addEventListener('resize', resize);

  return {
    THREE, renderer, camera, resize,
    get layout() { return layout; },
    set speed(v) { speed = v; }, get speed() { return speed; },
    dealAge, syncSlots, setAge, takeCard, reveal, pawnTo, setPersp, setTokens, tokenTaken, lootGone, setLoot,
    highlight, highlightTokens, pick, setHover, slotScreen, toScreen, slotWorld,
    pawnScreen: () => toScreen(pawn.position.clone().setY(0.4)),
    tokenScreen: (t) => { const m = tokMeshes.get(t); return m ? toScreen(m.position) : null; },
    lootScreen: (k) => toScreen(lootMeshes[k].position),
    centerScreen: () => toScreen(new THREE.Vector3(0, 0.5, 0.6)),
    pillar: (color) => pillar(new THREE.Vector3(0, 0, 0.6), color), shockRing: (color, size) => shockRing(new THREE.Vector3(0, 0, 0.6), color, size),
    shake, tween, ease,
    stop() { running = false; }
  };
}
