// ---------------------------------------------------------------------------
// Blender-modelled props (tools/blender/props.py). Packs are fetched per floor
// and their vertices are written straight into the chunk mesh builder, so a
// prop shares the world material (lighting, fog, grime, zones) with the walls.
// Anything missing falls back to the original box-built furniture.
// ---------------------------------------------------------------------------
const PROPS3D = {
  base: "assets/props/",
  manifest: null,
  packs: new Map(), // pack -> Promise
  data: new Map(), // prop -> decoded arrays
  ready: null,
  init() {
    if (this.ready) return this.ready;
    this.ready = fetch(this.base + "manifest.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => (this.manifest = m || {}));
    return this.ready;
  },
  async load(packs) {
    await this.init();
    await Promise.all(
      packs.filter((p) => this.manifest[p]).map((p) => {
        if (!this.packs.has(p))
          this.packs.set(
            p,
            fetch(this.base + this.manifest[p].file)
              .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("props " + p))))
              .then((b) => this.parse(b))
              .catch((e) => (console.warn(e.message), this.packs.delete(p))),
          );
        return this.packs.get(p);
      }),
    );
  },
  parse(buf) {
    const dv = new DataView(buf),
      u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "NPRP") throw new Error("bad prop pack");
    let o = 12;
    const count = dv.getUint32(8, !0),
      pad = () => (o = (o + 3) & ~3),
      gam = new Float32Array(256);
    for (let i = 0; i < 256; i++) gam[i] = Math.pow(i / 255, 2.2);
    for (let k = 0; k < count; k++) {
      const nl = u8[o++],
        name = new TextDecoder().decode(u8.subarray(o, o + nl));
      o += nl;
      pad();
      const nv = dv.getUint32(o, !0),
        ni = dv.getUint32(o + 4, !0),
        lo = [0, 1, 2].map((i) => dv.getFloat32(o + 8 + i * 4, !0)),
        hi = [0, 1, 2].map((i) => dv.getFloat32(o + 20 + i * 4, !0));
      o += 32;
      const q = new Int16Array(buf, o, nv * 3);
      o += nv * 6;
      pad();
      const nq = new Int8Array(buf, o, nv * 3);
      o += nv * 3;
      pad();
      const rgbm = u8.subarray(o, o + nv * 4);
      o += nv * 4;
      const uvq = new Uint16Array(buf.slice(o, o + nv * 4));
      o += nv * 4;
      const idx = nv > 65535 ? new Uint32Array(buf.slice(o, o + ni * 4)) : new Uint16Array(buf.slice(o, o + ni * 2));
      o += ni * (nv > 65535 ? 4 : 2);
      pad();
      const pos = new Float32Array(nv * 3),
        nrm = new Float32Array(nv * 3),
        col = new Float32Array(nv * 3),
        mat = new Uint8Array(nv),
        sign = new Uint8Array(nv),
        uv = new Float32Array(nv * 2);
      for (let i = 0; i < nv; i++) {
        for (let a = 0; a < 3; a++) {
          pos[i * 3 + a] = lo[a] + ((q[i * 3 + a] + 32768) / 65535) * (hi[a] - lo[a]);
          nrm[i * 3 + a] = nq[i * 3 + a] / 127;
          col[i * 3 + a] = gam[rgbm[i * 4 + a]];
        }
        const m = rgbm[i * 4 + 3];
        mat[i] = m & 63;
        sign[i] = m & 64 ? 1 : 0;
        uv[i * 2] = uvq[i * 2] / 65535;
        uv[i * 2 + 1] = uvq[i * 2 + 1] / 65535;
      }
      this.data.set(name, { name, nv, ni, pos, nrm, col, mat, sign, uv, idx, lo, hi });
    }
  },
  has(name) {
    return this.data.has(name);
  },
  // write a prop into a ks mesh builder; yaw turns the prop's front (+Z) toward
  // (sin yaw, cos yaw). opts: scale, tint [r,g,b] (multiplies colours),
  // emis [r,g,b] (multiplies emissive colours), seed, sign (atlas cell)
  emit(b, name, x, y, z, yaw = 0, opts = {}) {
    const d = this.data.get(name);
    if (!d) return !1;
    const c = Math.cos(yaw),
      s = Math.sin(yaw),
      k = opts.scale || 1,
      tint = opts.tint,
      emis = opts.emis,
      seed = opts.seed ?? 0,
      base = b.vc,
      cell = opts.sign !== void 0 ? dd(opts.sign) : null;
    const { pos, nrm, col, mat, sign, uv, idx, nv } = d;
    for (let i = 0; i < nv; i++) {
      const px = pos[i * 3] * k,
        py = pos[i * 3 + 1] * k,
        pz = pos[i * 3 + 2] * k,
        nx = nrm[i * 3],
        ny = nrm[i * 3 + 1],
        nz = nrm[i * 3 + 2],
        m = mat[i];
      b.p.push(x + px * c + pz * s, y + py, z - px * s + pz * c);
      b.n.push(nx * c + nz * s, ny, -nx * s + nz * c);
      if (sign[i] && cell) b.uv.push(cell[0] + uv[i * 2] * (cell[2] - cell[0]), cell[1] + uv[i * 2 + 1] * (cell[3] - cell[1]));
      else b.uv.push(uv[i * 2], uv[i * 2 + 1]);
      b.m.push(m);
      b.s.push(seed);
      let r = col[i * 3],
        g = col[i * 3 + 1],
        bl = col[i * 3 + 2];
      if (m === F.EMIS) emis && ((r *= emis[0]), (g *= emis[1]), (bl *= emis[2]));
      else if (tint && m !== F.GLASS && m !== F.DARK) (r *= tint[0]), (g *= tint[1]), (bl *= tint[2]);
      b.c.push(r, g, bl);
    }
    for (let i = 0; i < idx.length; i++) b.idx.push(base + idx[i]);
    b.vc += nv;
    return !0;
  },
};

// which packs a place needs
const PROP_PACKS = {
  yellow: ["common"],
  office: ["common", "office"],
  hospital: ["common", "hospital"],
  parking: ["common", "parking"],
  pool: ["common"],
  pipes: ["common"],
  abyss: ["common"],
};
function themePropPacks(themeId) {
  return PROP_PACKS[themeId] || (ah[themeId] && ah[themeId].packs) || ["common"];
}

// a prop centred at (x, z) near a wall faces away from the closest wall edge
function yawAwayFromWall(map, x, z) {
  const cx = Math.floor(x / 4),
    cz = Math.floor(z / 4),
    lx = x - cx * 4,
    lz = z - cz * 4,
    cand = [
      [4 - lx, 0, -Math.PI / 2],
      [4 - lz, 1, Math.PI],
      [lx, 2, Math.PI / 2],
      [lz, 3, 0],
    ];
  let best = null;
  for (const [d, dir, yaw] of cand) map.inb(cx, cz) && map.edge(cx, cz, dir) && (!best || d < best[0]) && (best = [d, yaw]);
  return best ? best[1] : 0;
}
const yawOf = (dir) => Math.atan2(Oo[dir][0], Oo[dir][1]);

// ---- swap the old box furniture for the Blender models
{
  const old = { k2, mE, gE, lE, hE, uE, fE, cE };
  const P = PROPS3D;
  // at generation (F2) the furniture closures are run once against a
  // collecting builder: anything with a model becomes a destructible instance
  const inst = (s, type, x, z, yaw, o = {}) => {
    const m = s.__collect,
      it = addInst(m, type, x, 0, z, yaw, o),
      cell = m.propRects.get(Math.floor(z / 4) * m.W + Math.floor(x / 4)) || [];
    for (const r of cell) if (!RECT_OWNER.has(r) && x >= r[0] - 0.05 && x <= r[2] + 0.05 && z >= r[1] - 0.05 && z <= r[3] + 0.05) it.rects.push(r), RECT_OWNER.set(r, it), (r.h = (P.data.get(type).hi[1] || 1) * (o.scale || 1));
    LEGACY_HIT = !0;
    return !0;
  };
  k2 = (s, x, z, n, col) => {
    const t = Math.abs(Math.sin(n * 7.3)) > 0.5 || col[0] < 0.08 ? "chair" : "plasticChair";
    if (s.__collect && P.has(t)) return inst(s, t, x, z, -n, { seed: 0.3 });
    return P.has("chair") ? P.emit(s, t, x, 0, z, -n, { seed: 0.3 }) : old.k2(s, x, z, n, col);
  };
  mE = (s, x, z) => {
    const o = { scale: 0.9 + ((x * 13 + z * 7) % 1) * 0.25 };
    if (s.__collect && P.has("plant")) return inst(s, "plant", x, z, (x * 7 + z * 3) % 6.28, o);
    return P.has("plant") ? P.emit(s, "plant", x, 0, z, (x * 7 + z * 3) % 6.28, o) : old.mE(s, x, z);
  };
  gE = (s, x, z) => {
    const map = s.__collect || PROP_MAP;
    if (s.__collect && P.has("watercooler")) return inst(s, "watercooler", x, z, yawAwayFromWall(map, x, z));
    return P.has("watercooler") && PROP_MAP ? P.emit(s, "watercooler", x, 0, z, yawAwayFromWall(PROP_MAP, x, z)) : old.gE(s, x, z);
  };
  lE = (s, r) => {
    if (s.__collect && P.has("deskset")) {
      const x = (r[0] + r[2]) / 2,
        z = (r[1] + r[3]) / 2;
      let yaw = yawAwayFromWall(s.__collect, x, z);
      r[2] - r[0] > r[3] - r[1] || (yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2));
      return inst(s, "deskset", x, z, yaw + Math.PI);
    }
    if (!P.has("deskset") || !PROP_MAP) return old.lE(s, r);
    const x = (r[0] + r[2]) / 2,
      z = (r[1] + r[3]) / 2,
      along = r[2] - r[0] > r[3] - r[1];
    let yaw = yawAwayFromWall(PROP_MAP, x, z);
    along || (yaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2));
    P.emit(s, "deskset", x, 0, z, yaw + Math.PI);
  };
  hE = (s, x, z, isX, on) => (P.has("deskset") ? void 0 : old.hE(s, x, z, isX, on));
  uE = (s, r) => {
    if (s.__collect && P.has("hospitalbed")) return inst(s, "hospitalbed", (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, yawAwayFromWall(s.__collect, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2));
    if (!P.has("hospitalbed") || !PROP_MAP) return old.uE(s, r);
    const x = (r[0] + r[2]) / 2,
      z = (r[1] + r[3]) / 2;
    P.emit(s, "hospitalbed", x, 0, z, yawAwayFromWall(PROP_MAP, x, z));
  };
  fE = (s, r, isX, col) => {
    if (s.__collect && P.has("car")) {
      const x = (r[0] + r[2]) / 2,
        z = (r[1] + r[3]) / 2;
      return inst(s, "car", x, z, yawAwayFromWall(s.__collect, x, z) + ((x * 3 + z * 5) % 2 < 1 ? Math.PI : 0), { tint: col.map((v) => v / 0.3), scale: 0.95 });
    }
    if (!P.has("car") || !PROP_MAP) return old.fE(s, r, isX, col);
    const x = (r[0] + r[2]) / 2,
      z = (r[1] + r[3]) / 2,
      yaw = yawAwayFromWall(PROP_MAP, x, z) + ((x * 3 + z * 5) % 2 < 1 ? Math.PI : 0);
    P.emit(s, "car", x, 0, z, yaw, { tint: col.map((v) => v / 0.3), scale: 0.95 });
  };
  cE = (s, r, dir, kind) => {
    if (!P.has("vending")) return old.cE(s, r, dir, kind);
    const light = { water: [0.5, 0.8, 1.4], bomb: [1.4, 0.4, 0.3], med: [1.4, 0.45, 0.45], gas: [0.5, 1.4, 1.1], ammo: [0.6, 1.4, 0.6] }[kind] || [1, 1, 1];
    const body = { water: [0.35, 0.55, 1.1], bomb: [1.1, 0.3, 0.25], med: [1.25, 1.25, 1.25], gas: [0.4, 0.95, 0.85], ammo: [0.45, 0.75, 0.45] }[kind] || [1, 1, 1];
    P.emit(s, "vending", (r[0] + r[2]) / 2, 0, (r[1] + r[3]) / 2, yawOf(dir), { tint: body, emis: light });
  };
}

// props are oriented against the walls of the map whose chunk is being built
let PROP_MAP = null;
{
  const buildChunk = pd.prototype.buildChunk;
  pd.prototype.buildChunk = function (cx, cy) {
    PROP_MAP = this.m;
    try {
      return buildChunk.call(this, cx, cy);
    } finally {
      PROP_MAP = null;
    }
  };
  const loadFloor = Td.prototype.loadFloor;
  Td.prototype.loadFloor = async function (depth, arrive, show = !0, opts = {}) {
    const themeId = this.run && this.run.themes[depth - 1];
    themeId && (await PROPS3D.load(themePropPacks(themeId)));
    return loadFloor.call(this, depth, arrive, show, opts);
  };
}
PROPS3D.init();

// ---------------------------------------------------------------------------
// Instanced prop layer. Generators register prop instances on the map
// (map.pinst); this system builds one InstancedMesh per (chunk, prop type)
// near the camera, drawn with the world shader so lighting matches the walls.
// Instances are separate from the wall chunks: breaking a wall never rebuilds
// props, and a prop can be removed on its own.
// ---------------------------------------------------------------------------
const PROP_VS = `
in float aMat; in float aSeed; in float aSignV;
in vec3 aTint; in vec3 aEmis; in vec4 aSignRect; in float aSeedI;
out vec3 vPos; out vec3 vNrm; out vec2 vUv; flat out float vMat; out float vSeed; out vec3 vCol;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vUv = aSignV > 0.5 ? mix(aSignRect.xy, aSignRect.zw, uv) : uv;
  vMat = aMat; vSeed = aSeed + aSeedI;
  vec3 c = color;
  if (abs(aMat - 7.0) < 0.5) c *= aEmis;
  else if (abs(aMat - 13.0) > 0.5 && abs(aMat - 9.0) > 0.5) c *= aTint;
  vCol = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// register an instance while generating a map
function addInst(m, type, x, y, z, yaw = 0, o = {}) {
  const it = { type, x, y, z, yaw, scale: o.scale || 1, tint: o.tint || null, emis: o.emis || null, sign: o.sign ?? -1, seed: o.seed ?? ((x * 0.37 + z * 0.61) % 1), cx: Math.floor(x / 4), cy: Math.floor(z / 4), rects: [], hp: o.hp ?? null, alive: !0, id: (m.pinst || (m.pinst = [])).length };
  m.pinst.push(it);
  for (const r of o.rects || []) {
    // r in prop-local metres [x0, z0, x1, z1]; rotate by yaw (quarter turns keep boxes axis aligned)
    const c = Math.cos(yaw),
      s = Math.sin(yaw),
      pts = [
        [r[0], r[1]],
        [r[2], r[1]],
        [r[2], r[3]],
        [r[0], r[3]],
      ].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]),
      rect = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    Uo(m, rect, o.block !== !1);
    const cell = m.propRects.get(Math.floor((rect[1] + rect[3]) / 2 / 4) * m.W + Math.floor((rect[0] + rect[2]) / 2 / 4));
    if (cell) {
      const q = cell[cell.length - 1];
      it.rects.push(q);
      RECT_OWNER.set(q, it);
      const d = PROPS3D.data.get(type);
      q.h = d ? d.hi[1] * it.scale + y : 1;
      o.low && (q.low = !0);
    }
  }
  return it;
}
// footprint helper: a centred box of w × d metres
const fp = (w, d) => [[-w / 2, -d / 2, w / 2, d / 2]];

const PROP_FAR = new Set(["track", "platformEdge", "trainCar", "stationPillar", "stationSign", "storefront", "escalator", "fountain", "planter", "hotelDoor", "sconce", "blackboard", "car", "vending"]);
class PropLayer {
  constructor(game) {
    this.game = game;
    this.group = new We();
    game.scene.add(this.group);
    this.geos = new Map();
    this.chunks = new Map();
    this.byChunk = new Map();
    this.mat = null;
    this.tmpM = new Qt();
    this.tmpQ = new xn();
    this.tmpS = new L();
    this.tmpP = new L();
    this.up = new L(0, 1, 0);
  }
  material() {
    if (this.mat) return this.mat;
    const w = this.game.mat;
    this.mat = new De({ glslVersion: yn, vertexShader: PROP_VS, fragmentShader: w.fragmentShader, vertexColors: !0, uniforms: w.uniforms });
    return this.mat;
  }
  geo(type) {
    if (this.geos.has(type)) return this.geos.get(type);
    const d = PROPS3D.data.get(type);
    if (!d) return null;
    const g = new Vt();
    g.setAttribute("position", new Kt(d.pos, 3));
    g.setAttribute("normal", new Kt(d.nrm, 3));
    g.setAttribute("color", new Kt(d.col, 3));
    g.setAttribute("uv", new Kt(d.uv, 2));
    g.setAttribute("aMat", new Kt(Float32Array.from(d.mat), 1));
    g.setAttribute("aSignV", new Kt(Float32Array.from(d.sign), 1));
    g.setAttribute("aSeed", new Kt(new Float32Array(d.nv), 1));
    g.setIndex(new Kt(d.idx, 1));
    g.computeBoundingSphere();
    this.geos.set(type, g);
    return g;
  }
  warmup() {
    const geo = new To();
    geo.setAttribute("position", new Kt(new Float32Array(9), 3));
    geo.setAttribute("normal", new Kt(new Float32Array(9), 3));
    geo.setAttribute("color", new Kt(new Float32Array(9), 3));
    geo.setAttribute("uv", new Kt(new Float32Array(6), 2));
    for (const [k, n] of [["aMat", 1], ["aSignV", 1], ["aSeed", 1]]) geo.setAttribute(k, new Kt(new Float32Array(3 * n), n));
    for (const [k, n] of [["aTint", 3], ["aEmis", 3], ["aSignRect", 4], ["aSeedI", 1]]) geo.setAttribute(k, new Mi(new Float32Array(n), n));
    return new go(geo, this.material(), 1);
  }
  onFloorEnter(fs) {
    this.clear();
    this.fs = fs;
    this.byChunk.clear();
    for (const it of fs.map.pinst || []) {
      const k = Math.floor(it.cx / 12) + "," + Math.floor(it.cy / 12);
      let a = this.byChunk.get(k);
      a || this.byChunk.set(k, (a = []));
      a.push(it);
    }
  }
  onFloorExit() {
    this.clear();
  }
  clear() {
    // the per-chunk geometries share the prop vertex buffers; disposing them
    // only costs a re-upload of those buffers on the next floor
    for (const c of this.chunks.values()) for (const m of c) (this.group.remove(m), m.geometry.dispose(), m.dispose());
    this.chunks.clear();
  }
  buildChunk(k) {
    const list = this.byChunk.get(k) || [],
      byType = new Map();
    for (const it of list) it.alive && PROPS3D.has(it.type) && (byType.get(it.type) || byType.set(it.type, []).get(it.type)).push(it);
    const meshes = [];
    for (const [type, items] of byType) {
      const geo = this.geo(type);
      if (!geo) continue;
      const n = items.length,
        mesh = new go(geo, this.material(), n),
        tint = new Float32Array(n * 3),
        emis = new Float32Array(n * 3),
        sign = new Float32Array(n * 4),
        seed = new Float32Array(n);
      let cx = 0,
        cz = 0;
      items.forEach((it, i) => {
        it.q ? this.tmpQ.set(it.q[0], it.q[1], it.q[2], it.q[3]) : this.tmpQ.setFromAxisAngle(this.up, it.yaw);
        this.tmpS.setScalar(it.alive ? it.scale : 0);
        this.tmpM.compose(this.tmpP.set(it.x, it.y, it.z), this.tmpQ, this.tmpS);
        mesh.setMatrixAt(i, this.tmpM);
        const t = it.tint || [1, 1, 1],
          e = it.emis || [1, 1, 1];
        tint.set(t, i * 3);
        emis.set(e, i * 3);
        it.sign >= 0 ? sign.set(dd(it.sign), i * 4) : sign.set([0, 0, 1, 1], i * 4);
        seed[i] = it.seed;
        it.mesh = mesh;
        it.idx = i;
        cx += it.x;
        cz += it.z;
      });
      mesh.geometry = geo;
      mesh.instanceMatrix.needsUpdate = !0;
      // per-instance attributes live on a geometry clone that shares the vertex buffers
      const g2 = new To();
      g2.index = geo.index;
      for (const a of ["position", "normal", "color", "uv", "aMat", "aSignV", "aSeed"]) g2.setAttribute(a, geo.getAttribute(a));
      g2.setAttribute("aTint", new Mi(tint, 3));
      g2.setAttribute("aEmis", new Mi(emis, 3));
      g2.setAttribute("aSignRect", new Mi(sign, 4));
      g2.setAttribute("aSeedI", new Mi(seed, 1));
      g2.instanceCount = n;
      mesh.geometry = g2;
      mesh.frustumCulled = !1;
      mesh.matrixAutoUpdate = !1;
      mesh.userData.center = new L(cx / n, 1.5, cz / n);
      mesh.userData.items = items;
      mesh.userData.type = type;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    this.chunks.set(k, meshes);
  }
  // move one instance (a loose prop driven by physics)
  setPose(it, t, q) {
    it.x = t.x;
    it.y = t.y;
    it.z = t.z;
    it.q = [q.x, q.y, q.z, q.w];
    if (!it.mesh || !it.alive) return;
    this.tmpQ.set(q.x, q.y, q.z, q.w);
    this.tmpM.compose(this.tmpP.set(t.x, t.y, t.z), this.tmpQ, this.tmpS.setScalar(it.scale));
    it.mesh.setMatrixAt(it.idx, this.tmpM);
    it.mesh.instanceMatrix.needsUpdate = !0;
  }
  // hide one instance (destroyed) without rebuilding the chunk
  kill(it) {
    if (!it.alive) return;
    it.alive = !1;
    for (const r of it.rects) r.dead = !0;
    if (it.mesh) {
      this.tmpM.makeScale(0, 0, 0);
      it.mesh.setMatrixAt(it.idx, this.tmpM);
      it.mesh.instanceMatrix.needsUpdate = !0;
    }
  }
  near(x, z, r) {
    const out = [],
      cx0 = Math.floor((x - r) / 48),
      cx1 = Math.floor((x + r) / 48),
      cz0 = Math.floor((z - r) / 48),
      cz1 = Math.floor((z + r) / 48);
    for (let a = cz0; a <= cz1; a++)
      for (let b = cx0; b <= cx1; b++) for (const it of this.byChunk.get(b + "," + a) || []) it.alive && Math.hypot(it.x - x, it.z - z) < r && out.push(it);
    return out;
  }
  preRender(cam) {
    if (!this.fs) return;
    const p = cam.position;
    // build chunks as the camera nears them (one per frame); they stay built
    // for the rest of the floor and are only hidden when far
    for (const k of this.byChunk.keys()) {
      if (this.chunks.has(k)) continue;
      const [a, b] = k.split(",").map(Number),
        dx = (a + 0.5) * 48 - p.x,
        dz = (b + 0.5) * 48 - p.z;
      if (dx * dx + dz * dz < 100 * 100) {
        this.buildChunk(k);
        break;
      }
    }
    // structure (tracks, shopfronts, doors…) is drawn as far as the walls;
    // furniture only in the nearby chunks
    const low = this.game.settings.q === "low",
      far = (75 + 48 * 0.75) ** 2 + 900,
      near = ((low ? 26 : 40) + 48 * 0.75) ** 2;
    for (const ms of this.chunks.values())
      for (const m of ms) {
        const c = m.userData.center;
        m.visible = (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < (PROP_FAR.has(m.userData.type) ? far : near);
      }
  }
}
