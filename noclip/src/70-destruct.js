// ---------------------------------------------------------------------------
// Physical destruction. Everything solid can be broken:
//  - walls and pillars are fractured (Voronoi cells, denser around the first
//    hit) the first time they are hit. Every hit knocks out the pieces it
//    lands on, blasts clear whatever is in reach, and pieces left hanging with
//    no support fall. Loose pieces are rigid bodies that tumble, collide and
//    settle as rubble; once there is a hole you can walk through, the wall
//    edge opens for movement, sight, light and monsters.
//  - furniture is knocked over and thrown around, and shatters into physical
//    fragments when it runs out of hit points; shop windows burst.
//  - ceiling lamps break (their light goes out) and ceiling tiles drop.
// The physics engine (Rapier, WASM) loads in the background from lib/; until
// it is ready — or if it cannot load — the original breach system is used.
// ---------------------------------------------------------------------------

const PHYS = {
  R: null,
  p: null,
  failed: !1,
  load() {
    return (
      this.p ||
      (this.p = import(new URL("lib/rapier.mjs", document.baseURI).href)
        .then(async (m) => {
          const R = m.default || m;
          await R.init();
          return (this.R = R);
        })
        .catch((e) => (console.warn("physics unavailable:", e && e.message), (this.failed = !0), null)))
    );
  },
};

// rect array → prop instance that owns it (filled by addInst)
const RECT_OWNER = new WeakMap();
// vertical ray context for the shot currently being traced (see niY)
let RAY_Y = null;

// how each prop reacts: mode push = knocked around by hits, hang = falls
// when hit, fixed = only breaks; kg = mass; hp = hit points
const PROP_PHYS = {
  chair: ["push", 9, 140],
  plasticChair: ["push", 3, 70],
  trashbin: ["push", 6, 380],
  wetfloor: ["push", 1, 30],
  cardboard: ["push", 4, 40],
  cart: ["push", 16, 650],
  mallBench: ["push", 32, 260],
  bench: ["push", 26, 260],
  schoolDesk: ["push", 11, 200],
  teacherDesk: ["push", 38, 320],
  clothesRack: ["push", 12, 150],
  mannequinProp: ["push", 9, 110],
  roomServiceCart: ["push", 25, 200],
  consoleTable: ["push", 15, 150],
  plant: ["push", 6, 50],
  watercooler: ["push", 16, 160],
  trashSort: ["push", 22, 450],
  deskset: ["push", 34, 260],
  hospitalbed: ["push", 70, 420],
  lockers: ["push", 55, 900],
  shoeLocker: ["push", 48, 420],
  iceMachine: ["push", 85, 900],
  kiosk: ["push", 160, 650],
  car: ["push", 1250, 2600],
  stationSign: ["hang", 16, 130],
  departureBoard: ["hang", 22, 160],
  stationClock: ["hang", 6, 45],
  sconce: ["fixed", 2, 18],
  vending: ["fixed", 300, 950],
  storefront: ["fixed", 120, 45, { glass: !0 }],
  hotelDoor: ["fixed", 40, 260],
  blackboard: ["fixed", 30, 220],
  stationPillar: ["fixed", 900, 1600],
  ticketGate: ["fixed", 160, 650],
  planter: ["fixed", 500, 900],
  fountain: ["fixed", 4000, 3200],
  escalator: ["fixed", 3000, 4500],
  trainCar: ["fixed", 30000, 1 / 0, { hollow: !0 }],
  track: ["fixed", 900, 1 / 0, { nohit: !0 }],
  platformEdge: ["fixed", 900, 1 / 0, { nohit: !0 }],
};
const propPhys = (t) => PROP_PHYS[t] || ["push", 20, 200];

// wall build-up per place: hit points per piece, density, broken-core colour
function wallStuff(th) {
  const k = th.wallKind;
  return k === "concrete"
    ? { hp: 6, dens: 2300, core: [0.5, 0.49, 0.46], heavy: 1 }
    : k === "brick"
      ? { hp: 5, dens: 1900, core: [0.42, 0.2, 0.13], heavy: 1 }
      : k === "tile"
        ? { hp: 4.5, dens: 2100, core: [0.56, 0.55, 0.51], heavy: 1 }
        : { hp: 2.2, dens: 800, core: [0.86, 0.85, 0.8], heavy: 0 };
}

// ---- small geometry helpers ------------------------------------------------
function clipPoly(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = nx * a[0] + ny * a[1] - c,
      db = nx * b[0] + ny * b[1] - c;
    da <= 0 && out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
// Voronoi cells of `sites` clipped to the rectangle [x0, y0, x1, y1]
function voronoiCells(rect, sites) {
  const cells = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    let poly = [
      [rect[0], rect[1]],
      [rect[2], rect[1]],
      [rect[2], rect[3]],
      [rect[0], rect[3]],
    ];
    for (let j = 0; j < sites.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const t = sites[j],
        nx = t[0] - s[0],
        ny = t[1] - s[1];
      poly = clipPoly(poly, nx, ny, (nx * (t[0] + s[0]) + ny * (t[1] + s[1])) / 2);
    }
    // drop near-duplicate vertices left by the clipping
    poly = poly.filter((p, k) => {
      const q = poly[(k + 1) % poly.length];
      return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-4;
    });
    poly.length >= 3 && polyArea(poly) > 0.002 && cells.push(poly);
  }
  return cells;
}
function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i],
      r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return Math.abs(a) / 2;
}
function inPoly(p, x, y) {
  let c = !1;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0] && (c = !c);
  return c;
}
// do two convex polygons share (part of) an edge?
function polysTouch(a, b) {
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      dx = q[0] - p[0],
      dy = q[1] - p[1],
      len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    for (let j = 0; j < b.length; j++) {
      const r = b[j],
        s = b[(j + 1) % b.length],
        d1 = Math.abs((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / len,
        d2 = Math.abs((s[0] - p[0]) * dy - (s[1] - p[1]) * dx) / len;
      if (d1 > 2e-3 || d2 > 2e-3) continue;
      const t1 = ((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / (len * len),
        t2 = ((s[0] - p[0]) * dx + (s[1] - p[1]) * dy) / (len * len);
      if (Math.min(Math.max(t1, t2), 1) - Math.max(Math.min(t1, t2), 0) > 0.01) return !0;
    }
  }
  return !1;
}
const qRot = (q, x, y, z, out, o) => {
  // rotate (x, y, z) by unit quaternion q
  const ix = q.w * x + q.y * z - q.z * y,
    iy = q.w * y + q.z * x - q.x * z,
    iz = q.w * z + q.x * y - q.y * x,
    iw = -q.x * x - q.y * y - q.z * z;
  out[o] = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  out[o + 1] = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  out[o + 2] = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
};
const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const rnd05 = (v) => Math.round(v * 20) / 20;

// ---- rendering of loose / fractured geometry --------------------------------
// REST: the surface is shaded where it was built (textures stay glued to a
// tumbling wall chunk); otherwise shaded where it is (prop fragments).
const RUBBLE_VS = `
in float aMat; in float aSeed; in vec3 aRest;
out vec3 vPos; out vec3 vNrm; out vec2 vUv; flat out float vMat; out float vSeed; out vec3 vCol;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
#ifdef REST
  vPos = aRest;
#else
  vPos = wp.xyz;
#endif
  vNrm = normalize(normal);
  vUv = uv; vMat = aMat; vSeed = aSeed; vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// a set of pieces drawn as one mesh; piece poses come from their bodies
class Rubble {
  constructor(sys, rest) {
    this.sys = sys;
    this.rest = rest;
    this.pieces = [];
    this.mesh = null;
  }
  build() {
    const ps = this.pieces;
    let nv = 0,
      ni = 0;
    for (const p of ps) (p.cont = this), (p.v0 = nv), (nv += p.local.length / 3), (ni += p.idx.length);
    const pos = new Float32Array(nv * 3),
      rest = new Float32Array(nv * 3),
      nrm = new Float32Array(nv * 3),
      col = new Float32Array(nv * 3),
      mat = new Float32Array(nv),
      seed = new Float32Array(nv),
      uv = new Float32Array(nv * 2),
      idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let k = 0;
    for (const p of ps) {
      rest.set(p.rest, p.v0 * 3);
      nrm.set(p.nrm, p.v0 * 3);
      col.set(p.col, p.v0 * 3);
      mat.set(p.mat, p.v0);
      seed.set(p.seed, p.v0);
      p.uv && uv.set(p.uv, p.v0 * 2);
      for (let i = 0; i < p.idx.length; i++) idx[k++] = p.v0 + p.idx[i];
    }
    const g = new Vt();
    g.setAttribute("position", new Kt(pos, 3).setUsage(35048));
    g.setAttribute("normal", new Kt(nrm, 3).setUsage(35048));
    g.setAttribute("aRest", new Kt(rest, 3));
    g.setAttribute("color", new Kt(col, 3));
    g.setAttribute("aMat", new Kt(mat, 1));
    g.setAttribute("aSeed", new Kt(seed, 1));
    g.setAttribute("uv", new Kt(uv, 2));
    g.setIndex(new Kt(idx, 1));
    this.mesh && (this.sys.group.remove(this.mesh), this.mesh.geometry.dispose());
    this.mesh = new te(g, this.sys.material(this.rest));
    this.mesh.frustumCulled = !1;
    this.mesh.matrixAutoUpdate = !1;
    this.sys.group.add(this.mesh);
    for (const p of ps) this.write(p, !0);
  }
  // write a piece's vertices at its body's pose (or at rest)
  write(p, all) {
    if (!this.mesh) return;
    const pa = this.mesh.geometry.attributes.position,
      na = this.mesh.geometry.attributes.normal,
      n = p.local.length / 3,
      o = p.v0 * 3;
    if (p.gone) {
      const a = pa.array;
      for (let i = 0; i < n; i++) (a[o + i * 3] = a[o]), (a[o + i * 3 + 1] = a[o + 1]), (a[o + i * 3 + 2] = a[o + 2]);
    } else if (!p.body || p.attached) {
      for (let i = 0; i < n * 3; i += 3) (pa.array[o + i] = p.c[0] + p.local[i]), (pa.array[o + i + 1] = p.c[1] + p.local[i + 1]), (pa.array[o + i + 2] = p.c[2] + p.local[i + 2]);
      this.rest || na.array.set(p.nrm, o);
    } else {
      const t = p.body.translation(),
        q = p.body.rotation(),
        a = pa.array,
        nn = na.array;
      for (let i = 0; i < n * 3; i += 3) {
        qRot(q, p.local[i], p.local[i + 1], p.local[i + 2], a, o + i);
        a[o + i] += t.x;
        a[o + i + 1] += t.y;
        a[o + i + 2] += t.z;
        this.rest || qRot(q, p.nrm[i], p.nrm[i + 1], p.nrm[i + 2], nn, o + i);
      }
    }
    if (all) {
      pa.needsUpdate = !0;
      na.needsUpdate = !0;
    } else {
      pa.addUpdateRange(o, n * 3);
      pa.needsUpdate = !0;
      if (!this.rest) na.addUpdateRange(o, n * 3), (na.needsUpdate = !0);
    }
  }
  dispose() {
    this.mesh && (this.sys.group.remove(this.mesh), this.mesh.geometry.dispose(), (this.mesh = null));
  }
}

// build a prism piece from a 2D polygon in a plane frame
// frame: O (world origin), A (along), N (normal), half thickness h
function prismPiece(poly, fr, h, faceMat, seed, coreMat, coreCol) {
  const k = poly.length,
    W = (a, y, d) => [fr.O[0] + fr.A[0] * a + fr.N[0] * d, y, fr.O[2] + fr.A[2] * a + fr.N[2] * d];
  let ca = 0,
    cy = 0;
  for (const p of poly) (ca += p[0]), (cy += p[1]);
  ca /= k;
  cy /= k;
  const c = W(ca, cy, 0),
    pos = [],
    nrm = [],
    mat = [],
    sd = [],
    col = [],
    idx = [],
    vert = (w, n, m, cc) => {
      pos.push(w[0], w[1], w[2]);
      nrm.push(n[0], n[1], n[2]);
      mat.push(m);
      sd.push(seed);
      col.push(cc[0], cc[1], cc[2]);
      return pos.length / 3 - 1;
    };
  // caps (the two wall faces), pushed out 3 mm so neighbours overlap and an
  // intact stretch of wall shows no hairline seams
  const capPoly = poly.map((p) => {
    const dx = p[0] - ca,
      dy = p[1] - cy,
      l = Math.hypot(dx, dy) || 1;
    return [p[0],p[1]];
  });
  for (const s of [1, -1]) {
    const base = pos.length / 3,
      n = [fr.N[0] * s, 0, fr.N[2] * s];
    for (const p of capPoly) vert(W(p[0], p[1], h * s), n, faceMat, [1, 1, 1]);
    // the frame is right handed (A × Y = N); flip winding on the back face
    for (let i = 1; i < k - 1; i++) s > 0 ? idx.push(base, base + i, base + i + 1) : idx.push(base, base + i + 1, base + i);
  }
  // cut faces around the rim
  for (let i = 0; i < k; i++) {
    const p = poly[i],
      q = poly[(i + 1) % k],
      ea = q[0] - p[0],
      ey = q[1] - p[1],
      l = Math.hypot(ea, ey) || 1,
      // outward normal in the plane (polygon is counter-clockwise in a/y)
      na = ey / l,
      ny = -ea / l,
      n = [fr.A[0] * na, ny, fr.A[2] * na],
      b = pos.length / 3;
    vert(W(p[0], p[1], h), n, coreMat, coreCol);
    vert(W(q[0], q[1], h), n, coreMat, coreCol);
    vert(W(q[0], q[1], -h), n, coreMat, coreCol);
    vert(W(p[0], p[1], -h), n, coreMat, coreCol);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const rest = new Float32Array(pos),
    local = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) (local[i] = pos[i] - c[0]), (local[i + 1] = pos[i + 1] - c[1]), (local[i + 2] = pos[i + 2] - c[2]);
  // collision hull: the true cell outline, shrunk a little so neighbours
  // never start out interpenetrating
  const hull = [];
  for (const p of poly)
    for (const d of [h, -h]) {
      const w = W(ca + (p[0] - ca) * 0.95, cy + (p[1] - cy) * 0.95, d * 0.95);
      hull.push(w[0] - c[0], w[1] - c[1], w[2] - c[2]);
    }
  return { c, local, rest, hull: new Float32Array(hull), nrm: new Float32Array(nrm), mat: new Float32Array(mat), seed: new Float32Array(sd), col: new Float32Array(col), idx, poly, area: polyArea(poly) };
}
// the triangle winding above assumes A × up = N; flip N where that is not so
function planeFrame(O, A, N) {
  // A × (0,1,0) = (-A.z, 0, A.x)
  const cx = -A[2],
    cz = A[0],
    s = cx * N[0] + cz * N[2] >= 0 ? 1 : -1;
  return { O, A, N: [N[0] * s, 0, N[2] * s] };
}

// ---------------------------------------------------------------------------
// the destruction system
// ---------------------------------------------------------------------------
class Destruction {
  constructor(game) {
    this.game = game;
    this.group = new We();
    game.scene.add(this.group);
    this.mats = {};
    this.world = null;
    this.awake = new Set();
    this.rubble = [];
    this.walls = new Map(); // frac key -> fractured wall/pillar runtime
    this.statCells = new Set();
    this.statEdges = new Map();
    this.statRects = new Map();
    this.acc = 0;
    this.tStat = 0;
    this.sndT = 0;
    this.blast = null;
    this.pieceCount = 0;
    PHYS.load().then(() => this.fs && this.ensureWorld());
  }
  ready() {
    return !!PHYS.R && !!this.fs;
  }
  material(rest) {
    const k = rest ? "rest" : "live";
    if (this.mats[k]) return this.mats[k];
    const w = this.game.mat;
    return (this.mats[k] = new De({ glslVersion: yn, vertexShader: RUBBLE_VS, fragmentShader: w.fragmentShader, vertexColors: !0, side: tn.DoubleSide, uniforms: w.uniforms, defines: rest ? { REST: 1 } : {} }));
  }

  // ---- lifecycle
  onFloorEnter(fs) {
    glassSound(this.game.audio);
    this.fs = fs;
    this.map = fs.map;
    this.map.frac || (this.map.frac = new Map());
    PHYS.R && this.ensureWorld();
  }
  ensureWorld() {
    if (this.world || !PHYS.R || !this.fs) return this.world;
    const R = PHYS.R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    // rubble does not need a precise solver; half the iterations, twice the bodies
    this.world.integrationParameters.numSolverIterations = 2;
    this.low = this.game.settings.q === "low";
    this.statBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.player = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.world.createCollider(R.ColliderDesc.capsule(0.55, 0.3).setFriction(0.4), this.player);
    this.mons = [];
    // walls and pillars broken on an earlier visit come back as they were left
    for (const [key, st] of this.map.frac) this.restoreWall(key, st);
    return this.world;
  }
  onFloorExit() {
    this.flushLight();
    for (const it of this.map ? this.map.pinst || [] : []) it.body && this.parkProp(it);
    for (const r of this.rubble) r.dispose();
    this.rubble = [];
    this.walls.clear();
    this.awake.clear();
    this.statCells.clear();
    this.statEdges.clear();
    this.statRects.clear();
    this.world && this.world.free();
    this.world = null;
    this.fs = null;
    this.pieceCount = 0;
  }

  // ---- static world, built lazily around where things move
  box(x0, y0, z0, x1, y1, z1) {
    const R = PHYS.R;
    return this.world.createCollider(
      R.ColliderDesc.cuboid(Math.max(0.01, (x1 - x0) / 2), Math.max(0.01, (y1 - y0) / 2), Math.max(0.01, (z1 - z0) / 2))
        .setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        .setFriction(0.8),
      this.statBody,
    );
  }
  ensureStatic(x, z, rad = 2) {
    if (!this.world) return;
    const m = this.map,
      cx = Math.floor(x / 4),
      cz = Math.floor(z / 4),
      H = this.fs.theme.ceilH;
    for (let j = cz - rad; j <= cz + rad; j++)
      for (let i = cx - rad; i <= cx + rad; i++) {
        if (!m.inb(i, j)) continue;
        const c = m.ci(i, j);
        if (this.statCells.has(c)) continue;
        this.statCells.add(c);
        const f = m.floor[c],
          X = i * 4,
          Z = j * 4,
          gy = f === 2 ? -(m.waterDepth?.[c]||1.6) : f === 7 ? -1.1 : 0;
        f !== 1 && this.box(X, gy - 0.5, Z, X + 4, gy, Z + 4);
        this.box(X, H, Z, X + 4, H + 0.3, Z + 4);
        // pit walls down to a sunken floor
        if (gy < 0)
          for (let d = 0; d < 4; d++) {
            const ni = i + ge[d],
              nj = j + xe[d];
            if (!m.inb(ni, nj) || m.floor[m.ci(ni, nj)] === f) continue;
            const ex = X + 2 + ge[d] * 2,
              ez = Z + 2 + xe[d] * 2;
            ge[d] ? this.box(ex - 0.05, gy, Z, ex + 0.05, 0, Z + 4) : this.box(X, gy, ez - 0.05, X + 4, 0, ez + 0.05);
          }
        for (let d = 0; d < 4; d++) this.staticEdge(i, j, d);
        for (const [pi, pj] of [
          [i, j],
          [i + 1, j],
          [i, j + 1],
          [i + 1, j + 1],
        ]) {
          const k = "p" + (pj * (m.W + 1) + pi);
          if (this.statEdges.has(k) || m.pillar[pj * (m.W + 1) + pi] !== 1) continue;
          this.statEdges.set(k, [this.box(pi * 4 - 0.28, 0, pj * 4 - 0.28, pi * 4 + 0.28, H, pj * 4 + 0.28)]);
        }
        for (const r of m.propRects.get(c) || []) {
          if (r.dead || this.statRects.has(r)) continue;
          const it = RECT_OWNER.get(r);
          if (it && propPhys(it.type)[3] && propPhys(it.type)[3].hollow) continue;
          this.statRects.set(r, this.box(r[0], 0, r[1], r[2], r.h || 1, r[3]));
        }
      }
  }
  staticEdge(i, j, d) {
    const m = this.map,
      e = d === 0 ? { vert: !0, i: i + 1, j } : d === 2 ? { vert: !0, i, j } : d === 1 ? { vert: !1, i, j: j + 1 } : { vert: !1, i, j },
      key = Wo(e);
    if (this.statEdges.has(key)) return;
    const v = e.vert ? m.vw[m.vIdx(e.i, e.j)] : m.hw[m.hIdx(e.i, e.j)],
      H = this.fs.theme.ceilH,
      out = [];
    this.statEdges.set(key, out);
    if (!v || m.frac.has(key)) return;
    const seg = (a0, a1, y0, y1, t = 0.1) => {
      const P = e.vert ? e.i * 4 : e.j * 4,
        S = e.vert ? e.j * 4 : e.i * 4;
      out.push(e.vert ? this.box(P - t, y0, S + a0, P + t, y1, S + a1) : this.box(S + a0, y0, P - t, S + a1, y1, P + t));
    };
    if (v === 1 || v === 2 || v === 6) seg(0, 4, 0, H);
    else if (v === 3) seg(0, 1.4, 0, H), seg(2.6, 4, 0, H), seg(1.4, 2.6, 2.2, H);
    else if (v === 4) seg(0, 4, 0, 1.35, 0.05);
    else if (v === 5) seg(0, 4, 0, 1, 0.04);
    else if (v === 7) {
      const st = m.breachStub.get(e.vert ? m.vIdx(e.i, e.j) * 2 : m.hIdx(e.i, e.j) * 2 + 1) || z1;
      seg(0, st[0], 0, H), seg(4 - st[1], 4, 0, H);
    }
  }
  dropStaticEdge(key) {
    const cs = this.statEdges.get(key);
    if (!cs) return;
    for (const c of cs) this.world.removeCollider(c, !0);
    this.statEdges.delete(key);
  }
  dropStaticRect(r) {
    const c = this.statRects.get(r);
    c && this.world && this.world.removeCollider(c, !0);
    this.statRects.delete(r);
  }

  // ---- bodies
  hullDesc(p, dens) {
    const R = PHYS.R;
    let pts = p.hull || p.local;
    if (pts.length > 3 * 64) {
      const s = [],
        step = Math.ceil(pts.length / 3 / 64);
      for (let i = 0; i < pts.length / 3; i += step) s.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      pts = new Float32Array(s);
    }
    let cd = R.ColliderDesc.convexHull(pts);
    if (!cd) {
      let r = 0.05;
      for (let i = 0; i < p.local.length; i++) r = Math.max(r, Math.abs(p.local[i]));
      cd = R.ColliderDesc.ball(Math.min(0.5, r * 0.6));
    }
    return cd.setDensity(dens).setFriction(0.75).setRestitution(0.08);
  }
  pieceBody(p, dens) {
    const R = PHYS.R,
      b = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.c[0], p.c[1], p.c[2]).setLinearDamping(0.05).setAngularDamping(0.25));
    this.world.createCollider(this.hullDesc(p, dens), b);
    p.body = b;
    return b;
  }
  wake(p, v, w) {
    const b = p.body;
    p.attached = !1;
    (p.ccd = Math.hypot(v.x, v.y, v.z) > 6) && b.enableCcd && b.enableCcd(!0);
    b.setLinvel(v, !0);
    b.setAngvel(w, !0);
    p.lastV = Math.hypot(v.x, v.y, v.z);
    this.awake.add(p);
    this.ensureStatic(p.c[0], p.c[2], 2);
  }

  // ---- walls and pillars
  wallFrame(key) {
    const m = this.map,
      H = this.fs.theme.ceilH;
    if (key[0] === "p") {
      const idx = +key.slice(1),
        vx = idx % (m.W + 1),
        vy = (idx / (m.W + 1)) | 0;
      return { fr: planeFrame([vx * 4 - 0.28, 0, vy * 4], [1, 0, 0], [0, 0, 1]), L: 0.56, H, h: 0.28, rects: [[0, 0, 0.56, H]], pillar: idx, faceMat: F.PILLAR, seed: Qn(vx, vy, 9) };
    }
    const vert = key[0] === "v",
      [i, j] = key.slice(1).split(",").map(Number),
      v = vert ? m.vw[m.vIdx(i, j)] : m.hw[m.hIdx(i, j)],
      fr = vert ? planeFrame([i * 4, 0, j * 4], [0, 0, 1], [1, 0, 0]) : planeFrame([i * 4, 0, j * 4], [1, 0, 0], [0, 0, 1]);
    // the seed matches the chunk builder's, so the wallpaper lines up
    const rects = v === 3 ? [[0, 0, 1.4, H], [2.6, 0, 4, H], [1.4, 2.2, 2.6, H]] : [[0, 0, 4, H]];
    return { fr, L: 4, H, h: 0.1, rects, edge: { vert, i, j }, value: v, faceMat: F.WALL, seed: vert ? Qn(i, j, 7) : Qn(i, j, 8) };
  }
  // fracture pattern for a wall: sites spread over it, clustered at the hit
  fracture(key, a0, y0) {
    const f = this.wallFrame(key),
      r = new Ci(strHash(key) ^ (this.fs.depth * 7919)),
      cells = [];
    for (const rc of f.rects) {
      const w = rc[2] - rc[0],
        hh = rc[3] - rc[1],
        sites = [],
        add = (x, y) => {
          x = Math.min(rc[2] - 0.02, Math.max(rc[0] + 0.02, x));
          y = Math.min(rc[3] - 0.02, Math.max(rc[1] + 0.02, y));
          sites.every((s) => Math.hypot(s[0] - x, s[1] - y) > 0.11) && sites.push([x, y]);
        },
        hit = a0 >= rc[0] - 0.3 && a0 <= rc[2] + 0.3 && y0 >= rc[1] - 0.3 && y0 <= rc[3] + 0.3;
      // the pattern must not depend on settings: co-op peers have to agree
      // on where a wall opens
      const qn = 1;
      if (hit) {
        for (let k = 0; k < Math.round(9 * qn); k++) {
          const ang = r.next() * 6.283,
            d = 0.06 + r.next() * r.next() * 0.45;
          add(a0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d * 1.2);
        }
        for (let k = 0; k < Math.round(8 * qn); k++) {
          const ang = r.next() * 6.283,
            d = 0.4 + r.next() * 0.9;
          add(a0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d);
        }
      }
      const n = Math.max(2, Math.round(w * hh * (f.pillar !== void 0 ? 3 : 0.75) * qn));
      for (let k = 0; k < n * 3 && sites.length < (hit ? 17 : 0) + n; k++) add(rc[0] + r.next() * w, rc[1] + r.next() * hh);
      for (const c of voronoiCells(rc, sites)) cells.push(c);
    }
    return cells;
  }
  getWall(key, a0, y0) {
    let W = this.walls.get(key);
    if (W) return W;
    const m = this.map,
      st = m.frac.get(key) || { a: rnd05(a0), y: rnd05(y0), gone: [] };
    m.frac.set(key, st);
    W = this.buildWall(key, st);
    const old = m.wdmg && m.wdmg.get(key);
    if (old) {
      for (const [ha, hy, hd] of old)
        for (const p of W.pieces) p.attached && !p.gone && inPoly(p.poly, ha, hy) && (p.hp -= hd * (W.reinf ? 0.25 : 1));
      m.wdmg.delete(key);
    }
    // the static wall goes; its pieces take over (render + collision)
    this.dropStaticEdge(key);
    if (W.f.edge) {
      const e = W.f.edge,
        h = e.vert ? e.i - 1 : e.i,
        u = e.vert ? e.j : e.j - 1;
      this.game.world.rebuildAtCell(Math.max(0, h), Math.max(0, u));
      this.game.world.rebuildAtCell(Math.min(m.W - 1, e.i), Math.min(m.H - 1, e.j));
      this.game.decals && this.game.decals.removeKey(key);
    } else {
      m.pillar[W.f.pillar] = 2;
      const vx = W.f.pillar % (m.W + 1),
        vy = (W.f.pillar / (m.W + 1)) | 0;
      this.game.world.rebuildAtCell(Math.max(0, vx - 1), Math.max(0, vy - 1));
      this.game.world.rebuildAtCell(Math.min(m.W - 1, vx), Math.min(m.H - 1, vy));
    }
    return W;
  }
  buildWall(key, st) {
    const f = this.wallFrame(key),
      mat = wallStuff(this.fs.theme),
      reinf = this.map.reinforced.has(key),
      cells = this.fracture(key, st.a, st.y),
      R = new Rubble(this, !0),
      core = mat.core,
      W = { key, f, mat, reinf, R, pieces: [] };
    cells.forEach((poly, i) => {
      const p = prismPiece(poly, f.fr, f.h, f.faceMat, f.seed, F.CORE, core);
      p.i = i;
      p.attached = !0;
      p.hp = mat.hp * (reinf ? 4 : 1) * Math.max(0.35, Math.sqrt(p.area / 0.3));
      p.W = W;
      p.cont = R;
      R.pieces.push(p);
      W.pieces.push(p);
    });
    // neighbours across shared cell borders (for support)
    for (const p of W.pieces) p.nb = [];
    for (let a = 0; a < W.pieces.length; a++)
      for (let b = a + 1; b < W.pieces.length; b++) polysTouch(W.pieces[a].poly, W.pieces[b].poly) && (W.pieces[a].nb.push(W.pieces[b]), W.pieces[b].nb.push(W.pieces[a]));
    for (const p of W.pieces) {
      const xs = p.poly.map((q) => q[0]),
        ys = p.poly.map((q) => q[1]);
      p.root = Math.min(...ys) < 0.01 || Math.max(...ys) > f.H - 0.01 || (!f.pillar && (Math.min(...xs) < 0.01 || Math.max(...xs) > f.L - 0.01));
    }
    for (const i of st.gone) W.pieces[i] && (W.pieces[i].gone = !0);
    W.body = this.world.createRigidBody(PHYS.R.RigidBodyDesc.fixed());
    for (const p of W.pieces) p.gone || (p.col = this.world.createCollider(this.hullDesc(p, mat.dens).setTranslation(p.c[0], p.c[1], p.c[2]), W.body));
    R.build();
    this.rubble.push(R);
    this.walls.set(key, W);
    this.pieceCount += W.pieces.length;
    return W;
  }
  restoreWall(key, st) {
    if (this.walls.has(key)) return;
    this.buildWall(key, st);
  }
  // is the wall solid at (a, y)?
  solidAt(key, a, y) {
    const W = this.walls.get(key);
    if (!W) return !0;
    for (const p of W.pieces) if (p.attached && !p.gone && inPoly(p.poly, a, y)) return !0;
    return !1;
  }
  // hit a wall: kind bullet | melee | blast
  hitWall(edge, p, n, dmg, kind, opts = {}) {
    // the demolition passive (Kagura) hits walls harder
    const mul = (!opts.remote && this.game.player.stats.wallMul) || 1;
    if (mul !== 1) (dmg *= mul), opts.blast && (opts = { ...opts, blast: { ...opts.blast, dmg: opts.blast.dmg * mul } });
    const g = this.game,
      m = this.map,
      key = Wo(edge),
      vert = edge.vert,
      a = vert ? p.z - edge.j * 4 : p.x - edge.i * 4,
      y = Math.max(0.05, Math.min(this.fs.theme.ceilH - 0.05, p.y));
    if (!this.walls.has(key) && !this.pileUp(key, a, y, dmg, kind, n, p, opts)) {
      !opts.remote && g.net && g.net.fx(g.fs.depth, "d:w", p, { e: [vert ? 1 : 0, edge.i, edge.j], a: pe(dmg), n: [n.x, n.z], kk: kind, b: 0 });
      return;
    }
    const W = this.getWall(key, a, y);
    this.applyHit(W, a, y, n, dmg, kind, opts);
    !opts.remote && g.net && g.net.fx(g.fs.depth, "d:w", p, { e: [vert ? 1 : 0, edge.i, edge.j], a: pe(dmg), n: [n.x, n.z], kk: kind, b: kind === "blast" && opts.blast ? [pe(opts.blast.p.x), pe(opts.blast.p.y), pe(opts.blast.p.z), pe(opts.blast.r), pe(opts.blast.dmg)] : 0 });
  }
  // until a spot on a wall has taken more than the material can hold, hits
  // only crack it; returns true when the wall should fracture now
  pileUp(key, a, y, dmg, kind, n, p, opts) {
    if (kind === "blast") return !0;
    const m = this.map,
      mat = wallStuff(this.fs.theme),
      lim = mat.hp * (m.reinforced.has(key) ? 4 : 1) * (kind === "melee" ? 0.4 : 0.9),
      hits = (m.wdmg || (m.wdmg = new Map())).get(key) || [];
    m.wdmg.set(key, hits);
    hits.push([a, y, kind === "melee" ? dmg * 2.4 : dmg]);
    let local = 0;
    for (const h of hits) Math.hypot(h[0] - a, h[1] - y) < 0.35 && (local += h[2]);
    if (local >= lim) return !0;
    const g = this.game;
    kind === "melee" && g.combat.decal(g.combat.onFace(p, Wo2edge(key), n), n, Xe.CRACK, 0.5 + Math.random() * 0.4, { key, alpha: 0.8 });
    g.combat.puff(p.x + n.x * 0.12, p.y, p.z + n.z * 0.12, 2, g.combat.wallColorAt(p, n));
    !opts.quiet && g.audio && g.audio.sfx("hit_wall", { vol: 0.55, pos: p, vary: 0.2 });
    return !1;
  }
  hitPillar(idx, p, n, dmg, kind, opts = {}) {
    dmg *= (!opts.remote && this.game.player.stats.wallMul) || 1;
    const g = this.game,
      m = this.map,
      key = "p" + idx,
      vx = idx % (m.W + 1),
      a = p.x - (vx * 4 - 0.28),
      y = Math.max(0.05, Math.min(this.fs.theme.ceilH - 0.05, p.y)),
      W = this.getWall(key, a, y);
    this.applyHit(W, Math.max(0, Math.min(0.56, a)), y, n, dmg, kind, opts);
    !opts.remote && g.net && g.net.fx(g.fs.depth, "d:x", p, { i: idx, a: pe(dmg), n: [n.x, n.z], kk: kind });
  }
  applyHit(W, a, y, n, dmg, kind, opts) {
    const g = this.game,
      f = W.f,
      mul = W.reinf && kind !== "blast" ? 0.25 : 1,
      hit = [],
      fr = f.fr,
      // impulse direction: through the wall, away from the attacker
      dir = { x: -n.x, y: 0, z: -n.z };
    if (kind === "blast" && opts.blast) {
      const B = opts.blast;
      for (const p of W.pieces) {
        if (!p.attached || p.gone) continue;
        const d = Math.hypot(p.c[0] - B.p.x, p.c[1] - B.p.y, p.c[2] - B.p.z);
        if (d > B.r) continue;
        const k = Math.pow(1 - d / B.r, 1.1);
        p.hp -= (B.breach ? 999 : 26 * (B.dmg / 300)) * k * 1.6 + (d < 1.2 ? 4 : 0);
        p.hp <= 0 && hit.push([p, d]);
      }
    } else {
      let best = null,
        bd = 1e9;
      for (const p of W.pieces) {
        if (!p.attached || p.gone) continue;
        if (inPoly(p.poly, a, y)) {
          best = p;
          bd = 0;
          break;
        }
        const d = Math.hypot(p.c[0] - (fr.O[0] + fr.A[0] * a), p.c[1] - y, p.c[2] - (fr.O[2] + fr.A[2] * a));
        d < bd && ((bd = d), (best = p));
      }
      if (best && bd < 0.6) {
        const rad = kind === "melee" ? 0.22 + dmg * 0.05 : 0.12,
          wx = fr.O[0] + fr.A[0] * a,
          wz = fr.O[2] + fr.A[2] * a;
        best.hp -= dmg * mul * (kind === "melee" ? 2.4 : 1);
        for (const p of best.nb) {
          if (!p.attached || p.gone) continue;
          const d = Math.hypot(p.c[0] - wx, p.c[1] - y, p.c[2] - wz);
          d < rad + 0.25 && (p.hp -= dmg * mul * (kind === "melee" ? 1.4 : 0.35) * (1 - d / (rad + 0.25)));
        }
        for (const p of [best, ...best.nb]) p.attached && !p.gone && p.hp <= 0 && hit.push([p, 0]);
      }
    }
    // knock the dead pieces out
    const wp = { x: fr.O[0] + fr.A[0] * a, y, z: fr.O[2] + fr.A[2] * a };
    for (const [p] of hit) {
      let v;
      if (kind === "blast" && opts.blast) {
        const B = opts.blast,
          dx = p.c[0] - B.p.x,
          dy = p.c[1] - B.p.y,
          dz = p.c[2] - B.p.z,
          d = Math.hypot(dx, dy, dz) || 1,
          s = (B.breach ? 9 : 4 + 9 * (B.dmg / 300)) * Math.max(0.2, 1 - d / B.r) + 1;
        v = { x: (dx / d) * s, y: (dy / d) * s + 1.5, z: (dz / d) * s };
      } else {
        const s = kind === "melee" ? 2.2 + Math.random() * 2.5 : 1.2 + Math.random() * 1.8;
        v = { x: dir.x * s + (Math.random() - 0.5) * 1.2, y: Math.random() * 1.2, z: dir.z * s + (Math.random() - 0.5) * 1.2 };
      }
      this.detach(p, v);
    }
    if (hit.length) {
      this.trim();
      // decals painted on the old surface would float in the hole
      W.f.edge && g.decals && g.decals.removeKey(W.key);
      this.afterLoss(W, wp, kind, opts);
    }
    // feedback for every hit
    const col = g.combat.wallColorAt(wp, n);
    g.combat.puff(wp.x + n.x * 0.15, wp.y, wp.z + n.z * 0.15, hit.length ? 6 : 3, col);
    for (let k = 0; k < (hit.length ? 6 : 2); k++)
      g.combat.debris.spawn(wp.x + n.x * 0.1, wp.y, wp.z + n.z * 0.1, n.x * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, Math.random() * 1.6, n.z * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, 0.02 + Math.random() * 0.04, W.mat.core);
    if (!opts.quiet && g.audio) g.audio.sfx(W.reinf ? "hit_metal" : "hit_wall", { vol: hit.length ? 1 : 0.6, pos: wp, vary: 0.2, rate: W.mat.heavy ? 0.75 : 1 });
    !opts.remote && g.emitNoise(wp.x, wp.z, hit.length ? 45 : 25, "wallhit");
    W.reinf && !opts.remote && hit.length === 0 && kind !== "blast" && !this._reinfToast && ((this._reinfToast = !0), g.toast("頑丈な壁だ。重い武器か爆発物が要る", 1600));
  }
  detach(p, v) {
    const st = this.map.frac.get(p.W.key);
    st && st.gone.indexOf(p.i) < 0 && st.gone.push(p.i);
    p.col && (this.world.removeCollider(p.col, !0), (p.col = null));
    this.pieceBody(p, p.W.mat.dens);
    const w = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 };
    this.wake(p, v, w);
    // a burst of plaster/concrete dust where it came from
    const g = this.game,
      c = p.W.mat.core;
    Math.random() < 0.6 &&
      g.combat.dust.spawn(p.c[0], p.c[1], p.c[2], (Math.random() - 0.5) * 1.2, Math.random() * 0.4, (Math.random() - 0.5) * 1.2, c[0] * 0.5 + 0.3, c[1] * 0.5 + 0.29, c[2] * 0.5 + 0.27, 0.16, 10 + Math.random() * 12, 1 + Math.random() * 1.5, -0.03, 0.8, 10);
  }
  // after pieces are lost: drop what has no support, open the wall if a
  // person fits through
  afterLoss(W, wp, kind, opts) {
    const g = this.game,
      m = this.map,
      f = W.f,
      seen = new Set(),
      q = [];
    for (const p of W.pieces) p.attached && !p.gone && p.root && (seen.add(p), q.push(p));
    while (q.length) {
      const p = q.pop();
      for (const n of p.nb) n.attached && !n.gone && !seen.has(n) && (seen.add(n), q.push(n));
    }
    let fell = 0;
    for (const p of W.pieces) if (p.attached && !p.gone && !seen.has(p)) this.detach(p, { x: (Math.random() - 0.5) * 0.4, y: 0, z: (Math.random() - 0.5) * 0.4 }), fell++;
    if (f.pillar !== void 0) {
      // a pillar with its middle shot away stops blocking
      let solid = 0,
        tot = 0;
      for (const p of W.pieces) {
        const ys = p.poly.map((q) => q[1]),
          lo = Math.min(...ys),
          hi = Math.max(...ys);
        if (hi < 0.3 || lo > 1.9) continue;
        tot += p.area;
        p.attached && !p.gone && (solid += p.area);
      }
      if (tot > 0 && solid / tot < 0.4 && m.pillar[f.pillar] === 2) {
        m.pillar[f.pillar] = 0;
        // the rest of the column comes down
        for (const p of W.pieces) p.attached && !p.gone && p.c[1] > 1.2 && this.detach(p, { x: 0, y: 0, z: 0 });
        this.mapChanged(wp, !0, opts);
      }
      return;
    }
    // widest gap at walking height
    let best = 0,
      run = 0,
      bestA = [0, 0];
    for (let a = 0.05; a < f.L; a += 0.1) {
      let open = !0;
      for (const y of [0.62, 0.95, 1.3, 1.7]) if (this.solidAt(W.key, a, y)) open = !1;
      if (open) {
        run += 0.1;
        run > best && ((best = run), (bestA = [a - run + 0.05, a + 0.05]));
      } else run = 0;
    }
    const e = f.edge,
      cur = e.vert ? m.vw[m.vIdx(e.i, e.j)] : m.hw[m.hIdx(e.i, e.j)];
    if (best >= (cur === 3 ? 1.3 : 0.75)) {
      const sidx = e.vert ? m.vIdx(e.i, e.j) * 2 : m.hIdx(e.i, e.j) * 2 + 1,
        stub = [Math.max(0, bestA[0]), Math.max(0, f.L - bestA[1])],
        old = m.breachStub.get(sidx);
      if (cur !== 7 || !old || stub[0] < old[0] - 0.05 || stub[1] < old[1] - 0.05) {
        // what is left below the hole gives way, so you can step through
        for (const p of W.pieces)
          if (p.attached && !p.gone) {
            const xs = p.poly.map((q) => q[0]),
              ys = p.poly.map((q) => q[1]);
            Math.max(...ys) < 0.75 && Math.min(...xs) > bestA[0] - 0.3 && Math.max(...xs) < bestA[1] + 0.3 && this.detach(p, { x: (Math.random() - 0.5) * 0.6, y: 0.3, z: (Math.random() - 0.5) * 0.6 });
          }
        e.vert ? (m.vw[m.vIdx(e.i, e.j)] = 7) : (m.hw[m.hIdx(e.i, e.j)] = 7);
        m.breachStub.set(sidx, stub);
        m.breaches.set(W.key, { seed: 1, side: 1 });
        m.wallHP.delete(W.key);
        this.mapChanged(wp, cur !== 7, opts);
      }
    } else fell && this.game.audio && this.game.audio.sfx("wall_break", { vol: 0.5, pos: wp, rate: 1.2 });
  }
  mapChanged(wp, big, opts) {
    const g = this.game,
      m = this.map,
      cx = Math.floor(wp.x / 4),
      cz = Math.floor(wp.z / 4);
    this.queueLight(cx, cz);
    g.onMapChanged && g.onMapChanged();
    if (!big) return;
    g.audio && g.audio.sfx("wall_break", { vol: 1, pos: wp, important: !0 });
    opts.remote || g.emitNoise(wp.x, wp.z, 85, "wallbreak");
    const d = Math.hypot(g.player.pos.x - wp.x, g.player.pos.z - wp.z);
    g.player.shake = Math.max(g.player.shake, ke(0.7 - d / 20, 0, 0.6));
    opts.remote || opts.quiet || g.feed("壁を壊した。大きな音が響く", "#ff9a7a");
  }

  // light changes of a frame are re-baked together (a blast can open a wall
  // and burst several lamps at once)
  queueLight(cx, cz) {
    const m = this.map,
      b = [Math.max(0, cx - 3), Math.max(0, cz - 3), Math.min(m.W - 1, cx + 3), Math.min(m.H - 1, cz + 3)],
      q = this.ld;
    this.ld = q ? [Math.min(q[0], b[0]), Math.min(q[1], b[1]), Math.max(q[2], b[2]), Math.max(q[3], b[3])] : b;
  }
  flushLight() {
    if (!this.ld || !this.fs) return;
    this.game.lf.bake(...this.ld);
    this.game.uploadLight();
    this.ld = null;
  }
  // compile the rubble shaders with the rest of the scene on the first floor
  warmup() {
    const g = new We(),
      geo = new Vt();
    geo.setAttribute("position", new Kt(new Float32Array(9), 3));
    geo.setAttribute("normal", new Kt(new Float32Array(9), 3));
    geo.setAttribute("aRest", new Kt(new Float32Array(9), 3));
    geo.setAttribute("color", new Kt(new Float32Array(9), 3));
    geo.setAttribute("uv", new Kt(new Float32Array(6), 2));
    geo.setAttribute("aMat", new Kt(new Float32Array(3), 1));
    geo.setAttribute("aSeed", new Kt(new Float32Array(3), 1));
    g.add(new te(geo, this.material(!0)), new te(geo, this.material(!1)));
    return g;
  }

  // ---- props
  propOf(rect) {
    return RECT_OWNER.get(rect) || null;
  }
  propQuat(it) {
    if (it.q) return { x: it.q[0], y: it.q[1], z: it.q[2], w: it.q[3] };
    const h = it.yaw / 2;
    return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
  }
  // turn a standing prop into a loose rigid body
  loosen(it) {
    if (it.body || !it.alive) return it.body;
    const R = PHYS.R,
      d = PROPS3D.data.get(it.type);
    if (!d || !this.world) return null;
    const s = it.scale,
      [, kg] = propPhys(it.type),
      hx = Math.max(0.03, ((d.hi[0] - d.lo[0]) * s) / 2),
      hy = Math.max(0.03, ((d.hi[1] - d.lo[1]) * s) / 2),
      hz = Math.max(0.03, ((d.hi[2] - d.lo[2]) * s) / 2),
      q = this.propQuat(it),
      b = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(it.x, it.y, it.z).setRotation(q).setLinearDamping(0.05).setAngularDamping(0.3));
    this.world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(((d.hi[0] + d.lo[0]) / 2) * s, ((d.hi[1] + d.lo[1]) / 2) * s, ((d.hi[2] + d.lo[2]) / 2) * s)
        .setMass(kg)
        .setFriction(0.6)
        .setRestitution(0.1),
      b,
    );
    it.body = b;
    for (const r of it.rects) (r.dead = !0), this.dropStaticRect(r);
    this.ensureStatic(it.x, it.z, 2);
    this.awake.add(it);
    return b;
  }
  // keep a loose prop's final pose on the instance for later visits
  parkProp(it) {
    const t = it.body.translation(),
      q = it.body.rotation();
    it.x = t.x;
    it.y = t.y;
    it.z = t.z;
    it.q = [q.x, q.y, q.z, q.w];
    it.body = null;
  }
  hitProp(it, p, dir, dmg, kind, opts = {}) {
    if (!it || !it.alive) return;
    const g = this.game,
      [mode, kg, hp0, ex = {}] = propPhys(it.type);
    if (ex.nohit) return;
    it.hp = it.hp ?? hp0;
    if (it.hp === 1 / 0 || hp0 === 1 / 0) it.hp = 1 / 0;
    it.hp -= dmg;
    !opts.remote && g.net && g.net.fx(g.fs.depth, "d:p", p, { i: it.id, a: pe(dmg), kk: kind, dv: [pe(dir.x), pe(dir.y), pe(dir.z)] });
    if (it.hp <= 0) return this.shatter(it, p, dir, kind);
    if (!this.world) return;
    if (mode === "push" || (mode === "hang" && dmg > 8)) {
      const b = this.loosen(it);
      if (!b) return;
      const k = kind === "blast" ? 1 : kind === "melee" ? 0.5 : 0.12,
        j = Math.min(kg * 14, dmg * k * (kind === "blast" ? kg * 0.06 + 3 : 1));
      b.applyImpulseAtPoint({ x: dir.x * j, y: dir.y * j + (kind === "blast" ? j * 0.4 : 0), z: dir.z * j }, { x: p.x, y: p.y, z: p.z }, !0);
    }
  }
  // break a prop into physical fragments: it comes apart along its real parts
  // (welded connected pieces, grouped into a handful of chunks); glass panes
  // burst into thin Voronoi shards
  shatter(it, p, dir, kind) {
    const g = this.game,
      d = PROPS3D.data.get(it.type);
    if (!d) return;
    const [, kg, , ex = {}] = propPhys(it.type),
      s = it.scale,
      q = it.body ? it.body.rotation() : this.propQuat(it),
      t = it.body ? it.body.translation() : { x: it.x, y: it.y, z: it.z },
      v0 = it.body ? it.body.linvel() : { x: 0, y: 0, z: 0 },
      glassOnly = ex.glass,
      comps = propParts(it.type, d),
      tint = it.tint || [1, 1, 1],
      emis = it.emis || [1, 1, 1],
      cell = it.sign >= 0 ? dd(it.sign) : null,
      R = new Rubble(this, !1),
      tmp = [0, 0, 0],
      loose = [],
      keep = [],
      glass = [];
    for (const c of comps) (c.glass ? glass : glassOnly ? keep : loose).push(c);
    // group loose parts into a few chunks around the biggest ones
    const K = Math.max(1, Math.min(8, loose.length, Math.round(Math.cbrt((d.hi[0] - d.lo[0]) * (d.hi[1] - d.lo[1]) * (d.hi[2] - d.lo[2]) * s * s * s) * 5) + 2)),
      seeds = [...loose].sort((a, b) => b.size - a.size).slice(0, K),
      groups = seeds.map(() => []);
    for (const c of loose) {
      let bi = 0,
        bd = 1e9;
      seeds.forEach((sd, i) => {
        const dd2 = (sd.c[0] - c.c[0]) ** 2 + (sd.c[1] - c.c[1]) ** 2 + (sd.c[2] - c.c[2]) ** 2;
        dd2 < bd && ((bd = dd2), (bi = i));
      });
      groups[bi].push(...c.tris);
    }
    // the instance goes; for a window, the frame stays where it stood
    PROPLAYER && PROPLAYER.kill(it);
    for (const r2 of it.rects) (r2.dead = !0), this.dropStaticRect(r2);
    it.body && (this.world.removeRigidBody(it.body), this.awake.delete(it), (it.body = null));
    if (keep.length) {
      const kp = this.fromTris(d, keep.flatMap((c) => c.tris), s, q, t, tint, emis, cell, tmp);
      kp.fixedFrame = !0;
      R.pieces.push(kp);
    }
    for (const grp of groups) grp.length && R.pieces.push(this.fromTris(d, grp, s, q, t, tint, emis, cell, tmp));
    for (const c of glass) for (const sh of glassShards(d, c, s, q, t, p, it.id)) R.pieces.push(sh);
    if (!R.pieces.length) return;
    R.build();
    this.rubble.push(R);
    const free = R.pieces.filter((x) => !x.fixedFrame),
      cx = t.x,
      cz = t.z;
    for (const pc of free) {
      if (!this.world) break;
      const vol = this.hullVol(pc),
        dens = pc.shard ? 2500 : Math.max(80, Math.min(3000, kg / free.length / vol));
      this.pieceBody(pc, dens);
      const sp = kind === "blast" ? 6 : kind === "melee" ? 2.5 : 1.4,
        rx = pc.c[0] - cx,
        rz = pc.c[2] - cz,
        rl = Math.hypot(rx, rz) || 1,
        out = pc.shard ? 0.9 : 0.6;
      this.wake(pc, { x: v0.x + dir.x * sp + (rx / rl) * out, y: v0.y + Math.random() * 1.2 + dir.y * sp, z: v0.z + dir.z * sp + (rz / rl) * out }, { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 });
    }
    this.pieceCount += R.pieces.length;
    this.trim();
    const glassy = glass.length > 0,
      wood = d.mat.some((m) => m === F.WOOD);
    g.audio && g.audio.sfx(glassy ? "glass" : wood ? "wall_break" : "hit_metal", { vol: 1, pos: p, vary: 0.2, rate: glassy ? 1 : wood ? 1.4 : 0.7, important: !0 });
    glassy && glass.length > 1 && g.audio && g.audio.sfx("hit_metal", { vol: 0.5, pos: p, rate: 0.6 });
    g.combat.puff(p.x, p.y, p.z, 6, [0.6, 0.6, 0.6]);
    g.emitNoise(p.x, p.z, glassy ? 55 : 40, "wallhit");
    it.broken = !0;
  }
  // too much rubble: the oldest loose bits quietly go
  trim() {
    if (this.pieceCount < (this.low ? 500 : 900)) return;
    for (const R of this.rubble) {
      for (const p of R.pieces) if (!p.attached && !p.gone && !p.fixedFrame && p.body && (p.body.isSleeping() || p.shard)) this.remove(p), this.pieceCount--;
      if (this.pieceCount < (this.low ? 380 : 700)) break;
    }
  }
  hullVol(pc) {
    let lo = [1e9, 1e9, 1e9],
      hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pc.local.length; i += 3) for (let a = 0; a < 3; a++) (lo[a] = Math.min(lo[a], pc.local[i + a])), (hi[a] = Math.max(hi[a], pc.local[i + a]));
    return Math.max(0.02, hi[0] - lo[0]) * Math.max(0.02, hi[1] - lo[1]) * Math.max(0.02, hi[2] - lo[2]) * 0.5;
  }
  // a piece from some of a prop's triangles, posed like the prop
  fromTris(d, tri, s, q, t, tint, emis, cell, tmp) {
    const map = new Map(),
      pos = [],
      nrm = [],
      col = [],
      mat = [],
      sd = [],
      uv = [],
      idx = [];
    for (const v of tri) {
      let k = map.get(v);
      if (k === void 0) {
        k = pos.length / 3;
        map.set(v, k);
        qRot(q, d.pos[v * 3] * s, d.pos[v * 3 + 1] * s, d.pos[v * 3 + 2] * s, tmp, 0);
        pos.push(tmp[0] + t.x, tmp[1] + t.y, tmp[2] + t.z);
        qRot(q, d.nrm[v * 3], d.nrm[v * 3 + 1], d.nrm[v * 3 + 2], tmp, 0);
        nrm.push(tmp[0], tmp[1], tmp[2]);
        const m = d.mat[v],
          mul = m === F.EMIS ? emis : m !== F.GLASS && m !== F.DARK ? tint : [1, 1, 1];
        col.push(d.col[v * 3] * mul[0], d.col[v * 3 + 1] * mul[1], d.col[v * 3 + 2] * mul[2]);
        mat.push(m);
        sd.push(0.3);
        d.sign[v] && cell ? uv.push(cell[0] + d.uv[v * 2] * (cell[2] - cell[0]), cell[1] + d.uv[v * 2 + 1] * (cell[3] - cell[1])) : uv.push(d.uv[v * 2], d.uv[v * 2 + 1]);
      }
      idx.push(k);
    }
    let cx = 0,
      cy = 0,
      cz = 0;
    const n = pos.length / 3;
    for (let i = 0; i < pos.length; i += 3) (cx += pos[i]), (cy += pos[i + 1]), (cz += pos[i + 2]);
    const c = [cx / n, cy / n, cz / n],
      local = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) (local[i] = pos[i] - c[0]), (local[i + 1] = pos[i + 1] - c[1]), (local[i + 2] = pos[i + 2] - c[2]);
    return { c, local, rest: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(col), mat: new Float32Array(mat), seed: new Float32Array(sd), uv: new Float32Array(uv), idx, attached: !1 };
  }

  // ---- ceiling: lamps break, tiles fall
  hitCeiling(p, dmg, opts = {}) {
    const g = this.game,
      m = this.map,
      cx = Math.floor(p.x / 4),
      cz = Math.floor(p.z / 4);
    if (!m.inb(cx, cz)) return;
    const c = m.ci(cx, cz),
      lamp = this.fs.theme.lamp || [0.6, 0.3],
      lx = p.x - (cx + 0.5) * 4,
      lz = p.z - (cz + 0.5) * 4,
      H = this.fs.theme.ceilH;
    if (Math.abs(lx) < lamp[0] + 0.06 && Math.abs(lz) < lamp[1] + 0.06 && (m.light[c] === 1 || m.light[c] === 2)) {
      m.light[c] = 3;
      this.queueLight(cx, cz);
      // glass and sparks
      for (let k = 0; k < 14; k++) g.combat.debris.spawn(p.x + (Math.random() - 0.5) * lamp[0], H - 0.05, p.z + (Math.random() - 0.5) * lamp[1], (Math.random() - 0.5) * 2, -Math.random() * 2, (Math.random() - 0.5) * 2, 0.015 + Math.random() * 0.025, [0.85, 0.88, 0.9]);
      for (let k = 0; k < 16; k++) g.combat.add.spawn(p.x, H - 0.05, p.z, (Math.random() - 0.5) * 4, -Math.random() * 3, (Math.random() - 0.5) * 4, 1, 0.85, 0.5, 1, 4, 0.05 + Math.random() * 0.05, 9, 1);
      g.audio && g.audio.sfx("glass", { vol: 0.9, pos: p, vary: 0.25 });
      opts.remote || g.emitNoise(p.x, p.z, 30, "wallhit");
      !opts.remote && g.net && g.net.fx(g.fs.depth, "d:c", p, { c });
      return;
    }
    // suspended tile ceilings shed tiles
    const tiles = (LE[this.fs.themeId] || {}).ceilKind === 0;
    if (!tiles || !this.world || Math.random() > 0.3 + dmg * 0.02) return;
    const tx = Math.floor(p.x / 0.6) * 0.6,
      tz = Math.floor(p.z / 0.6) * 0.6,
      key = "t" + Math.round(tx / 0.6) + "," + Math.round(tz / 0.6);
    m.ceilGone || (m.ceilGone = new Set());
    if (m.ceilGone.has(key)) return;
    m.ceilGone.add(key);
    const poly = [
        [0, H - 0.03],
        [0.6, H - 0.03],
        [0.6, H - 0.005],
        [0, H - 0.005],
      ],
      fr = planeFrame([tx, 0, tz + 0.3], [1, 0, 0], [0, 0, 1]),
      pc = prismPiece(poly, fr, 0.3, F.CEIL, 0, F.CEIL, [1, 1, 1]);
    const R = new Rubble(this, !0);
    R.pieces.push(pc);
    R.build();
    this.rubble.push(R);
    this.pieceBody(pc, 300);
    this.wake(pc, { x: (Math.random() - 0.5) * 0.5, y: -0.5, z: (Math.random() - 0.5) * 0.5 }, { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 });
    g.combat.decal({ x: tx + 0.3, y: H - 0.004, z: tz + 0.3 }, { x: 0, y: -1, z: 0 }, Xe.HOLE, 0.62, { alpha: 1 });
    for (let k = 0; k < 10; k++) g.combat.dust.spawn(tx + Math.random() * 0.6, H - 0.1, tz + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, -Math.random() * 0.4, (Math.random() - 0.5) * 0.6, 0.55, 0.53, 0.5, 0.3, 14 + Math.random() * 16, 2 + Math.random() * 2, 0.02, 0.6, 12);
  }

  // ---- explosions push everything around
  onBlast(c, r, dmg, opts) {
    if (!this.fs) return;
    const g = this.game;
    // props in reach take damage (and get thrown)
    if (PROPLAYER)
      for (const it of PROPLAYER.near(c.x, c.z, r)) {
        const d = PROPS3D.data.get(it.type);
        if (!d) continue;
        const cy = it.y + ((d.hi[1] + d.lo[1]) / 2) * it.scale,
          dx = it.x - c.x,
          dy = cy - c.y,
          dz = it.z - c.z,
          dist = Math.hypot(dx, dy, dz);
        if (dist > r || !nn(this.map, c.x, c.z, it.x, it.z)) continue;
        const k = Math.pow(1 - dist / r, 1.1),
          l = dist || 1;
        this.hitProp(it, { x: it.x, y: cy, z: it.z }, { x: dx / l, y: Math.max(0.3, dy / l), z: dz / l }, dmg * 1.4 * k, "blast", { remote: !0 });
      }
    if (!this.world) return;
    // loose bodies get blown away
    for (const p of this.awake) {
      const b = p.body;
      if (!b) continue;
      const t = b.translation(),
        dx = t.x - c.x,
        dy = t.y - c.y,
        dz = t.z - c.z,
        dist = Math.hypot(dx, dy, dz);
      if (dist > r) continue;
      const k = (1 - dist / r) * 10 * b.mass(),
        l = dist || 1;
      b.applyImpulse({ x: (dx / l) * k, y: (dy / l) * k + k * 0.3, z: (dz / l) * k }, !0);
    }
    // ceiling lamps nearby burst
    const m = this.map,
      H = this.fs.theme.ceilH;
    for (let j = Math.floor((c.z - r) / 4); j <= Math.floor((c.z + r) / 4); j++)
      for (let i = Math.floor((c.x - r) / 4); i <= Math.floor((c.x + r) / 4); i++) {
        if (!m.inb(i, j)) continue;
        const d = Math.hypot((i + 0.5) * 4 - c.x, H - c.y, (j + 0.5) * 4 - c.z);
        d < r * 0.7 && Math.random() < 0.8 && this.hitCeiling({ x: (i + 0.5) * 4, y: H, z: (j + 0.5) * 4 }, dmg / 20, { remote: opts.remote });
      }
  }
  // ---- per frame
  update(dt) {
    this.flushLight();
    if (!this.world || !this.fs) return;
    const g = this.game,
      pl = g.player;
    this.player.setNextKinematicTranslation({ x: pl.pos.x, y: pl.pos.y + 0.86, z: pl.pos.z });
    this.acc = Math.min(this.acc + dt, 3 / 60);
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 3) {
      this.world.step();
      this.acc -= 1 / 60;
      steps++;
    }
    if (!steps) return;
    this.tStat -= dt;
    const statNow = this.tStat <= 0;
    statNow && (this.tStat = 0.25);
    this.sndT = Math.max(0, this.sndT - dt);
    // every loose body is checked (sleeping ones cost one call); contacts can
    // wake anything, so there is no separate "awake" bookkeeping to go stale
    let n = 0;
    for (const p of this.awake) {
      const b = p.body;
      if (!b) {
        this.awake.delete(p);
        continue;
      }
      if (b.isSleeping()) continue;
      n++;
      const t = b.translation();
      if (t.y < -30) {
        this.remove(p);
        continue;
      }
      const v = b.linvel(),
        sp = Math.hypot(v.x, v.y, v.z);
      // knocks when something heavy lands
      if (p.lastV - sp > 2.2 && this.sndT <= 0 && g.audio) {
        const heavy = p.type ? propPhys(p.type)[1] > 20 : p.W && p.W.mat.heavy;
        g.audio.sfx(p.type ? "hit_metal" : "hit_wall", { vol: Math.min(0.7, (p.lastV - sp) * 0.12), pos: t, vary: 0.3, rate: heavy ? 0.6 : 1.3, range: 35 });
        this.sndT = 0.06;
      }
      p.lastV = sp;
      statNow && this.ensureStatic(t.x, t.z, 1);
      if (p.type) PROPLAYER && PROPLAYER.setPose(p, t, b.rotation());
      else p.cont.write(p, !1);
      // continuous collision only while it flies
      p.ccd && sp < 4 && ((p.ccd = !1), b.enableCcd(!1));
      // big piles jitter forever; anything nearly still for a moment rests
      const w = b.angvel();
      sp < 0.08 && Math.hypot(w.x, w.y, w.z) < 0.25 ? (p.still = (p.still || 0) + dt) : (p.still = 0);
      p.still > 0.6 && (b.sleep(), (p.still = 0));
    }
  }
  moving() {
    let n = 0;
    for (const p of this.awake) p.body && !p.body.isSleeping() && n++;
    return n;
  }
  remove(p) {
    this.awake.delete(p);
    if (p.type) {
      PROPLAYER && PROPLAYER.kill(p);
    } else {
      p.gone = !0;
      p.cont.write(p, !1);
    }
    p.body && this.world.removeRigidBody(p.body);
    p.body = null;
  }

  // ---- network
  onNet(kind, pos, msg) {
    if (!this.ready()) return;
    const n = { x: (msg.n && msg.n[0]) || 0, y: 0, z: (msg.n && msg.n[1]) || 0 };
    if (kind === "d:w") {
      const b = msg.b ? { p: { x: msg.b[0], y: msg.b[1], z: msg.b[2] }, r: msg.b[3], dmg: msg.b[4] } : null;
      this.hitWall({ vert: !!msg.e[0], i: msg.e[1], j: msg.e[2] }, pos, n, msg.a, msg.kk, { remote: !0, blast: b, quiet: !!b });
    } else if (kind === "d:x") this.hitPillar(msg.i, pos, n, msg.a, msg.kk, { remote: !0 });
    else if (kind === "d:p") {
      const it = (this.map.pinst || [])[msg.i];
      it && this.hitProp(it, pos, { x: msg.dv[0], y: msg.dv[1], z: msg.dv[2] }, msg.a, msg.kk, { remote: !0 });
    } else if (kind === "d:c") this.hitCeiling(pos, 10, { remote: !0 });
  }
}
let DESTRUCT = null,
  PROPLAYER = null;

// ---------------------------------------------------------------------------
// engine hooks
// ---------------------------------------------------------------------------

// shots: a 3D-aware map ray. Fractured walls and pillars let shots through
// their holes; prop instances are hit by their real (rotated) bounds.
function niY(s, t, e, n, i, r, y0, dy) {
  RAY_Y = [y0, dy];
  try {
    const hit = ni(s, t, e, n, i, r, "shot");
    if (!PROPLAYER) return hit;
    // the ray in 3D: horizontal dir (n, i) normalised, dy per horizontal metre
    const hl = Math.hypot(n, i) || 1,
      dx = n / hl,
      dz = i / hl,
      L3 = Math.hypot(1, dy),
      ux = dx / L3,
      uy = dy / L3,
      uz = dz / L3,
      maxH = hit.kind ? hit.dist : r,
      mid = maxH / 2;
    let best = null,
      bt3 = (maxH * L3) / 1,
      tmp = [0, 0, 0];
    for (const it of PROPLAYER.near(t + dx * mid, e + dz * mid, mid + 3)) {
      const d = PROPS3D.data.get(it.type);
      if (!d || propPhys(it.type)[3]?.hollow || propPhys(it.type)[3]?.nohit) continue;
      // ray into the prop's frame
      const q = DESTRUCT ? DESTRUCT.propQuat(it) : { x: 0, y: Math.sin(it.yaw / 2), z: 0, w: Math.cos(it.yaw / 2) },
        qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w },
        sc = it.scale || 1;
      qRot(qi, t - it.x, y0 - it.y, e - it.z, tmp, 0);
      const ox = tmp[0] / sc,
        oy = tmp[1] / sc,
        oz = tmp[2] / sc;
      qRot(qi, ux, uy, uz, tmp, 0);
      let t0 = 0,
        t1 = bt3 / sc;
      const o = [ox, oy, oz];
      let ok = !0;
      for (let a = 0; a < 3 && ok; a++) {
        const dv = tmp[a];
        if (Math.abs(dv) < 1e-8) {
          (o[a] < d.lo[a] || o[a] > d.hi[a]) && (ok = !1);
          continue;
        }
        let ta = (d.lo[a] - o[a]) / dv,
          tb = (d.hi[a] - o[a]) / dv;
        ta > tb && ([ta, tb] = [tb, ta]);
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        t1 < t0 && (ok = !1);
      }
      if (!ok || t0 <= 0.02) continue;
      if(it.cutGeo){const ray=new tn.Ray(new L(ox,oy,oz),new L(tmp[0],tmp[1],tmp[2])),g=it.cutGeo,pa=g.attributes.position,ix=g.index,pt=new L();let nearest=Infinity;const a=new L(),b=new L(),c=new L();for(let j=0;j<ix.count;j+=3){a.fromBufferAttribute(pa,ix.getX(j));b.fromBufferAttribute(pa,ix.getX(j+1));c.fromBufferAttribute(pa,ix.getX(j+2));if(ray.intersectTriangle(a,b,c,false,pt))nearest=Math.min(nearest,ray.origin.distanceTo(pt));}if(!Number.isFinite(nearest))continue;t0=nearest;}
      const tw = t0 * sc;
      tw < bt3 && ((bt3 = tw), (best = it));
    }
    if (best) return { dist: (bt3 / L3) * 1, kind: "prop", inst: best, nx: 0, nz: 0 };
    return hit;
  } finally {
    RAY_Y = null;
  }
}

{
  // map ray: holes in fractured walls/pillars, instance rects left to niY
  const ni0 = ni;
  ni = function (s, t, e, n, i, r, o = "shot") {
    if (!DESTRUCT || !DESTRUCT.fs || s !== DESTRUCT.map || !s.frac || (!s.frac.size && !RAY_Y)) return ni0(s, t, e, n, i, r, o);
    // walk hits one at a time and skip the ones that are not solid at this height
    let ox = t,
      oz = e,
      left = r,
      done = 0;
    const l = Math.hypot(n, i) || 1,
      dx = n / l,
      dz = i / l;
    for (let k = 0; k < 24; k++) {
      const h = ni0(s, ox, oz, dx, dz, left, o);
      if (!h.kind) return { dist: done + h.dist, kind: null };
      let pass = !1;
      if (RAY_Y && o === "shot") {
        const yAt = RAY_Y[0] + RAY_Y[1] * (done + h.dist),
          hx = ox + dx * h.dist,
          hz = oz + dz * h.dist;
        if (h.kind === "wall") {
          const key = Wo(h.edge);
          if (s.frac.has(key) && DESTRUCT.walls.has(key)) {
            const a = h.edge.vert ? hz - h.edge.j * 4 : hx - h.edge.i * 4;
            pass = !DESTRUCT.solidAt(key, a, yAt-terrainY(s,hx,hz));
          }
        } else if (h.kind === "pillar") {
          const idx = h.vy * (s.W + 1) + h.vx,
            key = "p" + idx;
          s.pillar[idx] === 2 && DESTRUCT.walls.has(key) && (pass = !DESTRUCT.solidAt(key, Math.max(0, Math.min(0.56, hx - (h.vx * 4 - 0.28))), yAt));
        } else if (h.kind === "prop" && h.rect && RECT_OWNER.has(h.rect) && !propPhys(RECT_OWNER.get(h.rect).type)[3]?.hollow) pass = !0;
      }
      if (!pass) return { ...h, dist: done + h.dist };
      // step through and keep going
      const step = h.dist + (h.kind === "wall" ? 0.25 : 0.05);
      done += step;
      left -= step;
      ox += dx * step;
      oz += dz * step;
      if (left <= 0) return { dist: r, kind: null };
    }
    return { dist: r, kind: null };
  };

  // fractured walls/pillars are drawn by their pieces
  const wallSeg = pd.prototype.wallSeg;
  pd.prototype.wallSeg = function (t, e, n, i, r, o) {
    const m = this.m;
    if (PHYS.R && m.frac && m.frac.size && m.frac.has((e ? "v" : "h") + Math.round(n / 4) + "," + Math.round(i / 4))) return;
    return wallSeg.call(this, t, e, n, i, r, o);
  };

  const C = Id.prototype,
    damageWall = C.damageWall,
    impact = C.impact,
    explode = C.explode,
    meleeHit = C.meleeHit;
  C.damageWall = function (t, e, n, i, r, o, a = {}) {
    const D = DESTRUCT,
      m = this.game.fs && this.game.fs.map;
    if (!D || !D.ready() || !m || !(e === 1 || e === 3 || (e === 7 && m.frac && m.frac.has(Wo(t))))) return damageWall.apply(this, arguments);
    const blast = D.blast;
    D.hitWall(t, i, r, n, blast ? "blast" : "melee", { ...a, blast, quiet: a.quiet || !!blast });
    return !1;
  };
  C.impact = function (t, e, n, i) {
    const D = DESTRUCT;
    if (D && D.ready() && i) {
      const cam = this.game.camera.position,
        l = Math.hypot(t.x - cam.x, t.y - cam.y, t.z - cam.z) || 1,
        dir = { x: (t.x - cam.x) / l, y: (t.y - cam.y) / l, z: (t.z - cam.z) / l },
        dmg = (i.dmg || 25) * (i.pellets > 1 ? 1 : 1);
      if (n === "wall" && e && e.edge && (e.value === 1 || e.value === 2 || e.value === 3 || e.value === 7) && i.wallDmg !== 0) {
        if (e.value !== 7 || D.map.frac.has(Wo(e.edge))) {
          D.hitWall(e.edge, t, { x: e.nx, y: 0, z: e.nz }, Math.min(3, Math.max(0.25, dmg / 25)), "bullet", {});
          i = { ...i, wallDmg: 0 };
        }
      } else if (n === "prop" && e) {
        if (e.kind === "pillar" && D.map.pillar[e.vy * (D.map.W + 1) + e.vx]) D.hitPillar(e.vy * (D.map.W + 1) + e.vx, t, { x: -dir.x, y: 0, z: -dir.z }, Math.min(3, Math.max(0.25, dmg / 25)), "bullet", {});
        else if (e.inst) D.hitProp(e.inst, t, dir, dmg, "bullet");
        else if (e.rect && RECT_OWNER.has(e.rect)) D.hitProp(RECT_OWNER.get(e.rect), t, dir, dmg, "bullet");
      } else if (n === "ceil") D.hitCeiling(t, dmg / 25);
    }
    return impact.call(this, t, e, n, i);
  };
  C.explode = function (t, e, n, i = {}) {
    const D = DESTRUCT;
    D && (D.blast = { p: { x: t.x, y: Math.max(0.2, t.y), z: t.z }, r: e, dmg: n, breach: !!i.breach });
    try {
      return explode.call(this, t, e, n, i);
    } finally {
      D && ((D.blast = null), D.ready() && D.onBlast({ x: t.x, y: Math.max(0.2, t.y), z: t.z }, e, n, i));
    }
  };
  // melee also smashes furniture and pillars it lands on
  C.meleeHit = function (t) {
    const D = DESTRUCT,
      g = this.game;
    const ray = D && D.ready() ? this.camRay() : null;
    if (ray && !(g.monsters && g.monsters.meleeTarget(ray.o, ray.d, t.range))) {
      const { o: r, d: o } = ray,
        c = Math.hypot(o.x, o.z) || 1,
        h = niY(g.fs.map, r.x, r.z, o.x / c, o.z / c, t.range * c, r.y, o.y / c);
      if (h.kind === "prop" && h.dist / c <= t.range) {
        const d = h.dist / c,
          p = { x: r.x + o.x * d, y: r.y + o.y * d, z: r.z + o.z * d },
          dir = { x: o.x, y: o.y, z: o.z };
        if (h.inst || (h.rect && RECT_OWNER.has(h.rect))) {
          D.hitProp(h.inst || RECT_OWNER.get(h.rect), p, dir, t.dmg * 1.5, "melee");
          g.player.shake = Math.max(g.player.shake, 0.3);
          this.kick = 1;
          g.audio && g.audio.sfx("hit_wall", { vol: 0.8, pos: p, rate: 1.3, vary: 0.2 });
          return;
        }
        if (h.kind === "prop" && h.vx !== void 0) {
          D.hitPillar(h.vy * (g.fs.map.W + 1) + h.vx, p, { x: -o.x / c, y: 0, z: -o.z / c }, (t.wallDmg || 1) * 2.5, "melee");
          this.kick = 1;
          return;
        }
      }
    }
    return meleeHit.call(this, t);
  };

  // network: destruction events ride on the fx channel
  const netFx = heroNetFx;
  heroNetFx = function (g, kind, pos, msg) {
    if (typeof kind === "string" && kind.startsWith("d:")) return DESTRUCT && DESTRUCT.onNet(kind, pos, msg);
    return netFx(g, kind, pos, msg);
  };

  // legacy furniture (chairs, plants, desks, beds, cars) becomes instances
  const F2_ = F2;
  F2 = function (s) {
    const m = F2_(s);
    try {
      if (m.props && m.props.length) {
        const col = new ks();
        col.__collect = m;
        m.props = m.props.filter((e) => {
          if (!e.build) return !0;
          LEGACY_HIT = !1;
          try {
            e.build(col);
          } catch {}
          return !LEGACY_HIT;
        });
      }
    } catch (e) {
      console.warn("prop conversion", e);
    }
    return m;
  };
}
let LEGACY_HIT = !1;

// glass shatter, synthesised once
function glassSound(a) {
  if (!a || !a.ctx || a.bufs.glass) return;
  const sr = a.ctx.sampleRate;
  a.bufs.glass = [0, 1, 2].map((v) => {
    const n = Math.floor(sr * 1.1),
      b = a.ctx.createBuffer(1, n, sr),
      d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr,
        w = Math.random() * 2 - 1,
        hp = w - prev;
      prev = w;
      d[i] = hp * Math.exp(-t * 18) * 0.9;
    }
    // falling shards: short bright pings scattered over the tail
    for (let k = 0; k < 38 + v * 6; k++) {
      const t0 = Math.random() * Math.random() * 0.9,
        f = 2600 + Math.random() * 5200,
        a0 = 0.25 * Math.random() * Math.exp(-t0 * 2.5),
        s0 = Math.floor(t0 * sr),
        len = Math.floor(sr * (0.02 + Math.random() * 0.06));
      for (let i = 0; i < len && s0 + i < n; i++) d[s0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * a0 * Math.exp(-i / (len * 0.3));
    }
    return b;
  });
}

const Wo2edge = (k) => {
  const [i, j] = k.slice(1).split(",").map(Number);
  return { vert: k[0] === "v", i, j };
};

// a prop model's connected parts (positions welded to 1 mm), cached per type
const PROP_PARTS = new Map();
function propParts(type, d) {
  if (PROP_PARTS.has(type)) return PROP_PARTS.get(type);
  const key = new Map(),
    id = new Int32Array(d.nv),
    par = [];
  for (let v = 0; v < d.nv; v++) {
    const k = Math.round(d.pos[v * 3] * 1000) + "," + Math.round(d.pos[v * 3 + 1] * 1000) + "," + Math.round(d.pos[v * 3 + 2] * 1000);
    let w = key.get(k);
    w === void 0 && (key.set(k, (w = par.length)), par.push(w));
    id[v] = w;
  }
  const find = (a) => {
    for (; par[a] !== a; a = par[a]) par[a] = par[par[a]];
    return a;
  };
  for (let t = 0; t < d.idx.length; t += 3) {
    const a = find(id[d.idx[t]]),
      b = find(id[d.idx[t + 1]]),
      c = find(id[d.idx[t + 2]]);
    par[b] = a;
    par[find(c)] = a;
  }
  const comps = new Map();
  for (let t = 0; t < d.idx.length; t += 3) {
    const r = find(id[d.idx[t]]);
    let c = comps.get(r);
    c || comps.set(r, (c = { tris: [], lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], glass: !0 }));
    for (let k = 0; k < 3; k++) {
      const v = d.idx[t + k];
      c.tris.push(v);
      for (let a = 0; a < 3; a++) (c.lo[a] = Math.min(c.lo[a], d.pos[v * 3 + a])), (c.hi[a] = Math.max(c.hi[a], d.pos[v * 3 + a]));
      d.mat[v] !== F.GLASS && (c.glass = !1);
    }
  }
  const out = [...comps.values()].map((c) => ({ ...c, c: [0, 1, 2].map((a) => (c.lo[a] + c.hi[a]) / 2), size: Math.hypot(c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]) }));
  PROP_PARTS.set(type, out);
  return out;
}

// a glass pane (an axis-aligned box in the prop's frame) bursts into thin
// Voronoi shards, finer around where it was hit
function glassShards(d, c, s, q, t, hitP, seed) {
  const ext = [0, 1, 2].map((a) => c.hi[a] - c.lo[a]),
    thin = ext.indexOf(Math.min(...ext)),
    [u, v] = [0, 1, 2].filter((a) => a !== thin),
    r = new Ci((seed * 7919 + Math.round(c.c[0] * 100)) >>> 0),
    w = ext[u],
    h = ext[v],
    tmp = [0, 0, 0],
    // hit point in the prop frame
    qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  qRot(qi, hitP.x - t.x, hitP.y - t.y, hitP.z - t.z, tmp, 0);
  const hu = Math.min(c.hi[u], Math.max(c.lo[u], tmp[u] / s)) - c.lo[u],
    hv = Math.min(c.hi[v], Math.max(c.lo[v], tmp[v] / s)) - c.lo[v],
    sites = [],
    add = (x, y) => sites.every((p) => Math.hypot(p[0] - x, p[1] - y) > 0.03) && sites.push([Math.min(w - 0.005, Math.max(0.005, x)), Math.min(h - 0.005, Math.max(0.005, y))]);
  for (let k = 0; k < 10; k++) {
    const a = r.next() * 6.283,
      dd = r.next() * r.next() * 0.5;
    add(hu + Math.cos(a) * dd, hv + Math.sin(a) * dd);
  }
  const n = Math.min(26, Math.max(6, Math.round(w * h * 10)));
  for (let k = 0; k < n * 3 && sites.length < n + 10; k++) add(r.next() * w, r.next() * h);
  const col = [0.25, 0.27, 0.28],
    out = [];
  for (const poly of voronoiCells([0, 0, w, h], sites)) {
    // build in the prop frame, then pose like the prop
    const P = (pu, pv, pt) => {
      const l = [0, 0, 0];
      l[u] = c.lo[u] + pu;
      l[v] = c.lo[v] + pv;
      l[thin] = pt;
      qRot(q, l[0] * s, l[1] * s, l[2] * s, tmp, 0);
      return [tmp[0] + t.x, tmp[1] + t.y, tmp[2] + t.z];
    };
    const N = (a) => {
        const l = [0, 0, 0];
        l[a < 0 ? thin : a] = a < 0 ? -1 : 1;
        return l;
      },
      pos = [],
      nrm = [],
      idx = [],
      k = poly.length,
      t0 = c.lo[thin],
      t1 = c.hi[thin],
      push = (w3, n3) => {
        qRot(q, n3[0], n3[1], n3[2], tmp, 0);
        pos.push(w3[0], w3[1], w3[2]);
        nrm.push(tmp[0], tmp[1], tmp[2]);
        return pos.length / 3 - 1;
      };
    for (const [tt, nn] of [
      [t1, 1],
      [t0, -1],
    ]) {
      const nl = [0, 0, 0];
      nl[thin] = nn;
      const b = pos.length / 3;
      for (const pp of poly) push(P(pp[0], pp[1], tt), nl);
      for (let i = 1; i < k - 1; i++) idx.push(b, b + i, b + i + 1);
    }
    for (let i = 0; i < k; i++) {
      const a = poly[i],
        b2 = poly[(i + 1) % k],
        nl = [0, 0, 0],
        eu = b2[0] - a[0],
        ev = b2[1] - a[1],
        l = Math.hypot(eu, ev) || 1;
      nl[u] = ev / l;
      nl[v] = -eu / l;
      const b = pos.length / 3;
      push(P(a[0], a[1], t1), nl);
      push(P(b2[0], b2[1], t1), nl);
      push(P(b2[0], b2[1], t0), nl);
      push(P(a[0], a[1], t0), nl);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const nv = pos.length / 3;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let i = 0; i < pos.length; i += 3) (cx += pos[i]), (cy += pos[i + 1]), (cz += pos[i + 2]);
    const cc = [cx / nv, cy / nv, cz / nv],
      local = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) (local[i] = pos[i] - cc[0]), (local[i + 1] = pos[i + 1] - cc[1]), (local[i + 2] = pos[i + 2] - cc[2]);
    out.push({ c: cc, local, rest: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Float32Array(nv * 3).map((_, i) => col[i % 3]), mat: new Float32Array(nv).fill(F.GLASS), seed: new Float32Array(nv), uv: new Float32Array(nv * 2), idx, attached: !1, shard: !0 });
  }
  return out;
}
