// ---------------------------------------------------------------------------
// Everyday places gone wrong. B1 is no longer always the yellow rooms: a dead
// underground station (きさらぎ駅), an abandoned mall, a school at night and an
// endless hotel join the rotation on every floor.
//
// Each place plugs three hooks into the map generator (F2):
//   layout   → the floor plan, before the colour zones are carved
//   features → structure that has to respect the zones (tracks), and moves the
//              arrival points onto sensible floor
//   props    → Blender furnishing on the instanced prop layer, last
// Unused space is "rock": walled off during generation so nothing spawns or
// connects through it, and turned into dark empty floor at the end so that a
// wall blasted open leads into the dead space between the rooms.
// ---------------------------------------------------------------------------

// ---- sign atlas cells (C2 draws aE when the game boots)
const PLACE_SIGNS = {};
for (const t of [
  "きさらぎ", "かたす", "やみ", "1・2番線", "3・4番線", "改札", "出口", "のりば",
  "CLOSED", "SALE", "BOOKS", "CAFE", "DRUG", "SHOES", "TOYS", "PHOTO", "GAMES", "MUSIC", "BAKERY", "FOOD", "テナント募集", "閉店",
  "1-A", "1-B", "2-A", "2-B", "3-A", "3-C", "職員室", "保健室", "音楽室", "理科室", "図書室",
  "237", "1408", "217", "303", "412", "519", "706", "811", "909", "1111",
])
  (PLACE_SIGNS[t] = aE.length), aE.push(t);
const SHOP_SIGNS = ["CLOSED", "SALE", "BOOKS", "CAFE", "DRUG", "SHOES", "TOYS", "PHOTO", "GAMES", "MUSIC", "BAKERY", "FOOD", "テナント募集", "閉店"];
const ROOM_NUMBERS = ["237", "1408", "217", "303", "412", "519", "706", "811", "909", "1111"];

const PLACE_KIND = { ROCK: 0, CORR: 1, ROOM: 2, CONC: 3, SIDE: 4, ISLAND: 5, TRACK: 6, TUNNEL: 7, PROM: 8, ATRIUM: 9, SHOP: 10, SERV: 11, LOBBY: 12 };

// ---------------------------------------------------------------------------
// floor-plan helper: cells get a region id (0 = rock); walls go wherever two
// different regions meet, then explicit openings and BSP subdivisions apply.
// ---------------------------------------------------------------------------
class PlacePlan {
  constructor(m, r) {
    this.m = m;
    this.r = r;
    this.reg = new Int32Array(m.N);
    this.pk = m.pk = new Uint8Array(m.N);
    this.id = 10;
    this.opens = [];
    this.bsp = [];
    m.rooms = [];
  }
  inside(x, y) {
    return x >= 1 && y >= 1 && x < this.m.W - 1 && y < this.m.H - 1;
  }
  fill(x0, y0, x1, y1, rid, k) {
    const m = this.m;
    for (let y = Math.max(1, y0); y < Math.min(m.H - 1, y1); y++)
      for (let x = Math.max(1, x0); x < Math.min(m.W - 1, x1); x++) {
        const c = m.ci(x, y);
        this.reg[c] = rid;
        this.pk[c] = k;
      }
  }
  isFree(x0, y0, x1, y1) {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) if (!this.inside(x, y) || this.reg[this.m.ci(x, y)]) return !1;
    return !0;
  }
  room(x0, y0, x1, y1, k, extra = {}) {
    const rid = this.id++,
      rm = { rid, x0, y0, x1, y1, k, ...extra };
    this.fill(x0, y0, x1, y1, rid, k);
    this.m.rooms.push(rm);
    return rm;
  }
  open(x, y, d, t = 0) {
    this.opens.push([x, y, d, t]);
  }
  apply(bspTheme) {
    const { m, reg } = this,
      W = m.W,
      H = m.H;
    for (let c = 0; c < m.N; c++) m.floor[c] = reg[c] ? 0 : 1;
    for (let y = 0; y < H; y++)
      for (let x = 1; x < W; x++) m.vw[m.vIdx(x, y)] = reg[m.ci(x - 1, y)] === reg[m.ci(x, y)] ? 0 : 1;
    for (let y = 1; y < H; y++)
      for (let x = 0; x < W; x++) m.hw[m.hIdx(x, y)] = reg[m.ci(x, y - 1)] === reg[m.ci(x, y)] ? 0 : 1;
    for (const b of this.bsp) dh(m, this.r, bspTheme, b[0], b[1], b[2], b[3], 0);
    for (const [x, y, d, t] of this.opens) m.inb(x, y) && m.setEdge(x, y, d, t);
    m.pillar.fill(0);
  }
}

// colour zones are carved out of whatever the plan put there (the blue maze
// rebuilds its own walls; red walls crumble), so rock inside a zone is floor
function placeZoneCarve(m) {
  for (let c = 0; c < m.N; c++) m.zone[c] && m.floor[c] === 1 && (m.floor[c] = 0);
}

// arrivals (elevator / up stairs) move onto floor the place considers public
function placeRelocate(m, l, ok) {
  const taken = [];
  for (const p of l) {
    let best = null,
      bd = 1e9;
    for (let y = 4; y < m.H - 4; y++)
      for (let x = 4; x < m.W - 4; x++) {
        const c = m.ci(x, y);
        if (!ok(c) || taken.some((t) => Math.abs(t[0] - x) + Math.abs(t[1] - y) < 8)) continue;
        const d = (x - p[0]) ** 2 + (y - p[1]) ** 2;
        d < bd && ((bd = d), (best = [x, y]));
      }
    best && ((p[0] = best[0]), (p[1] = best[1]));
    taken.push([p[0], p[1]]);
  }
}

// walls between rock and floor, nothing inside the rock
function placeSeal(m) {
  const W = m.W,
    H = m.H,
    R = (x, y) => m.floor[m.ci(x, y)] === 1;
  for (let y = 0; y < H; y++)
    for (let x = 1; x < W; x++) {
      const a = R(x - 1, y),
        b = R(x, y),
        i = m.vIdx(x, y),
        e = m.vw[i];
      a && b ? e !== 2 && (m.vw[i] = 0) : a !== b && (e === 0 || e === 3) && (m.vw[i] = 1);
    }
  for (let y = 1; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = R(x, y - 1),
        b = R(x, y),
        i = m.hIdx(x, y),
        e = m.hw[i];
      a && b ? e !== 2 && (m.hw[i] = 0) : a !== b && (e === 0 || e === 3) && (m.hw[i] = 1);
    }
}

function placeBegin(m) {
  placeSeal(m);
  m.rock = new Uint8Array(m.N);
  for (let c = 0; c < m.N; c++) m.floor[c] === 1 && (m.rock[c] = 1);
  m.pfree = new Set(m.propRects.keys());
}
// the dead space between rooms becomes dark, empty, walkable floor
function placeEnd(m) {
  for (let c = 0; c < m.N; c++) m.rock[c] && ((m.floor[c] = 0), (m.light[c] = 0));
  delete m.pfree;
}

// a cell where furniture may stand: open, reachable floor, away from stairs
// and from anything the base generator already put down
function placeOk(m, c) {
  if (m.floor[c] !== 0 || m.rock[c] || !m.reach[c] || m.zone[c] === 2 || m.pfree.has(c)) return !1;
  const x = c % m.W,
    y = (c / m.W) | 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) if (m.inb(x + i, y + j) && m.feat[m.ci(x + i, y + j)]) return !1;
  return !0;
}

// world point on the wall face of cell (x, y) on side d, `off` metres out of the
// wall and `along` metres sideways
function wallPoint(x, y, d, off = 0, along = 0) {
  const n = Oo[d];
  return [(x + 0.5) * 4 - n[0] * (2 - gs - off) + n[1] * along, (y + 0.5) * 4 - n[1] * (2 - gs - off) - n[0] * along];
}

function rotRect(x, z, yaw, r) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw),
    pts = [
      [r[0], r[1]],
      [r[2], r[1]],
      [r[2], r[3]],
      [r[0], r[3]],
    ].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

// does a world rect stay clear of other furniture and of doorways?
function placeClear(m, rect) {
  const cx0 = Math.max(0, Math.floor(rect[0] / 4)),
    cx1 = Math.min(m.W - 1, Math.floor(rect[2] / 4)),
    cz0 = Math.max(0, Math.floor(rect[1] / 4)),
    cz1 = Math.min(m.H - 1, Math.floor(rect[3] / 4));
  for (let y = cz0; y <= cz1; y++)
    for (let x = cx0; x <= cx1; x++) {
      const c = m.ci(x, y);
      if (m.floor[c] !== 0 || m.rock[c]) return !1;
      for (const q of m.propRects.get(c) || []) if (!q.dead && rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1]) return !1;
      for (let d = 0; d < 4; d++) {
        const e = m.edge(x, y, d);
        if (e !== 3 && e !== 0) continue;
        if (e === 0) {
          // an opening into another space: keep its middle 1.6 m clear
          const nx = x + ge[d],
            ny = y + xe[d];
          if (!m.inb(nx, ny) || m.pk[c] === m.pk[m.ci(nx, ny)]) continue;
        }
        const mx = (x + 0.5) * 4 + ge[d] * 2,
          mz = (y + 0.5) * 4 + xe[d] * 2,
          hw = e === 3 ? 0.9 : 1.1,
          door = ge[d] ? [mx - 1.2, mz - hw, mx + 1.2, mz + hw] : [mx - hw, mz - 1.2, mx + hw, mz + 1.2];
        if (rect[0] < door[2] && rect[2] > door[0] && rect[1] < door[3] && rect[3] > door[1]) return !1;
      }
    }
  return !0;
}

// place a floor prop if it fits; rects are prop-local [x0, z0, x1, z1]
function placeProp(m, type, x, z, yaw, rects, o = {}) {
  if (!o.force && !rects.every((q) => placeClear(m, rotRect(x, z, yaw, q)))) return null;
  return addInst(m, type, x, o.y || 0, z, yaw, { rects, ...o });
}

// legacy geometry (merged into the wall chunk) for simple boxes
function placeBox(m, x0, y0, z0, x1, y1, z1, mat, col, seed = 0) {
  m.props.push({ cx: Math.floor((x0 + x1) / 8), cy: Math.floor((z0 + z1) / 8), build: (b) => b.box(x0, y0, z0, x1, y1, z1, mat, seed, col) });
}

// cells of a rectangle that touch a wall on side d
function* cellsOf(x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) yield [x, y];
}

// scatter clutter along the walls of a set of cells
function placeClutter(m, r, cells, table, density) {
  for (const [x, y] of cells) {
    const c = m.ci(x, y);
    if (!placeOk(m, c) || !r.chance(density)) continue;
    const ds = [0, 1, 2, 3].filter((d) => m.edge(x, y, d) === 1 || m.edge(x, y, d) === 2);
    const kind = r.weighted(table);
    if (!ds.length || kind === "free") {
      const t = r.weighted([
        ["cardboard", 3],
        ["wetfloor", 1],
        ["trashbin", 1],
      ]);
      placeProp(m, t, (x + 0.2 + r.next() * 0.6) * 4, (y + 0.2 + r.next() * 0.6) * 4, r.next() * 6.28, fp(0.5, 0.5));
      continue;
    }
    const d = r.pick(ds),
      along = r.range(-1.2, 1.2),
      depth = { lockers: 0.5, vending: 0.78, watercooler: 0.4, bench: 0.5, trashSort: 0.5, shoeLocker: 0.4, consoleTable: 0.45, iceMachine: 0.7, roomServiceCart: 0.55, plasticChair: 0.5, chair: 0.6, cardboard: 0.5, trashbin: 0.45, plant: 0.5 }[kind] ?? 0.5,
      width = { lockers: 0.95, vending: 0.92, bench: 1.8, trashSort: 0.9, shoeLocker: 2.0, consoleTable: 1.2, iceMachine: 0.8, roomServiceCart: 0.9 }[kind] ?? 0.5,
      [px, pz] = wallPoint(x, y, d, depth / 2 + 0.03, along);
    placeProp(m, kind, px, pz, yawOf(d) + (kind === "cardboard" || kind === "trashbin" ? r.range(-0.6, 0.6) : 0), fp(width, depth));
  }
}

// ===========================================================================
// きさらぎ駅 — an underground station: concourses with ticket gates, island
// platforms between sunken tracks, parked trains, dark tunnels, staff rooms.
// ===========================================================================
const TRAIN_CAR = { L: 19.6, W: 2.85, doors: [-7.5, -2.6, 2.6, 7.5] };
function placeTrain(m, x, z, yaw) {
  const { L, W, doors } = TRAIN_CAR,
    hw = W / 2,
    hl = L / 2,
    rects = [
      [hw - 0.06, -hl, hw + 0.06, hl],
      [-hw, -hl - 0.06, hw, -hl + 0.06],
      [-hw, hl - 0.06, hw, hl + 0.06],
    ];
  const cuts = [-hl, ...doors.flatMap((d) => [d - 0.68, d + 0.68]), hl];
  for (let i = 0; i < cuts.length; i += 2) rects.push([-hw - 0.06, cuts[i], -hw + 0.06, cuts[i + 1]]);
  const seats = [-hl + 0.2, ...doors.flatMap((d) => [d - 0.75, d + 0.75]), hl - 0.2];
  for (let i = 0; i < seats.length; i += 2)
    seats[i + 1] - seats[i] > 0.6 && rects.push([hw - 0.57, seats[i], hw - 0.09, seats[i + 1]], [-hw + 0.09, seats[i], -hw + 0.57, seats[i + 1]]);
  addInst(m, "trainCar", x, -1.1, z, yaw, { rects });
  const along = Math.abs(Math.sin(yaw)) > 0.5;
  m.trains.push(along ? [x - hl - 0.3, z - 2, x + hl + 0.3, z + 2] : [x - 2, z - hl - 0.3, x + 2, z + hl + 0.3]);
}

function stationLayout(m, r, th) {
  const K = PLACE_KIND,
    W = m.W,
    H = m.H,
    P = new PlacePlan(m, r),
    halls = (m.halls = []);
  m.passages = [];
  for (let y = r.int(5, 9); y + 8 <= H - 7; y += 8 + r.int(8, 13)) {
    const len = r.int(44, 68),
      x0 = r.int(4, W - 5 - len);
    halls.push({ y, x0, x1: x0 + len, rid: P.id++ });
  }
  for (const h of halls) {
    const { y, x0, x1, rid } = h;
    h.cx0 = x0 + r.int(2, 8);
    h.cx1 = x1 - r.int(2, 8);
    // rows: concourse ×2 | side platform | track | island ×2 | track | side platform
    P.fill(h.cx0, y, h.cx1, y + 2, 1, K.CONC);
    P.fill(x0, y + 2, x1, y + 3, rid, K.SIDE);
    P.fill(x0, y + 3, x1, y + 4, rid, K.TRACK);
    P.fill(x0, y + 4, x1, y + 6, rid, K.ISLAND);
    P.fill(x0, y + 6, x1, y + 7, rid, K.TRACK);
    P.fill(x0, y + 7, x1, y + 8, rid, K.SIDE);
    // the tracks run on into tunnels (or stop at a buffer)
    for (const ty of [y + 3, y + 6]) {
      r.chance(0.8) && P.fill(1, ty, x0, ty + 1, rid, K.TUNNEL);
      r.chance(0.8) && P.fill(x1, ty, W - 1, ty + 1, rid, K.TUNNEL);
    }
    // a staff door and two 8 m gate lines between concourse and platform
    P.open(h.cx1 - 1, y + 1, 1, 3);
    const half = (h.cx1 - h.cx0) >> 1;
    h.gates = [h.cx0 + r.int(1, Math.max(1, half - 3)), h.cx0 + half + r.int(1, Math.max(1, half - 3))];
    for (const gx of h.gates) P.open(gx, y + 1, 1, 0), P.open(gx + 1, y + 1, 1, 0);
  }
  // between the halls: a connecting passage, stair corridors and staff rooms
  let prev = 1;
  const bands = halls.map((h) => {
    const b = [prev, h.y, h];
    prev = h.y + 8;
    return b;
  });
  bands.push([prev, H - 1, null]);
  for (const [b0, b1, below] of bands) {
    const above = halls.find((h) => h.y + 8 === b0) || null;
    if (b1 - b0 < 3) continue;
    const pm = r.int(b0 + (above ? 1 : 0), Math.max(b0, b1 - 2 - (below ? 1 : 0))),
      px0 = r.int(2, 8),
      px1 = W - r.int(2, 8);
    P.fill(px0, pm, px1, pm + 2, 1, K.CORR);
    m.passages.push({ y: pm, x0: px0, x1: px1 });
    const upCols = [],
      downCols = [];
    if (below)
      for (let k = 0; k < 2; k++) {
        const cx = Math.max(px0, Math.min(px1 - 2, r.int(below.cx0, below.cx1 - 2)));
        P.fill(cx, pm + 2, cx + 2, below.y, 1, K.CORR);
        downCols.push(cx);
      }
    if (above)
      for (let k = 0; k < 2; k++) {
        const cx = Math.max(px0, Math.min(px1 - 2, r.int(above.x0 + 1, above.x1 - 3)));
        P.fill(cx, b0, cx + 2, pm, 1, K.CORR);
        P.open(cx, above.y + 7, 1, 0);
        P.open(cx + 1, above.y + 7, 1, 0);
        upCols.push(cx);
      }
    for (const [ra, rb, cols, up] of [
      [b0, pm, upCols, !0],
      [pm + 2, b1, downCols, !1],
    ]) {
      if (rb - ra < 2) continue;
      for (let x = px0; x < px1 - 2; ) {
        let xe = Math.min(px1, x + r.int(4, 13));
        for (const c of cols) c + 2 > x && c < xe && (xe = Math.min(xe, c));
        if (xe - x >= 3 && r.chance(0.7)) {
          P.room(x, ra, xe, rb, K.ROOM);
          P.bsp.push([x, ra, xe, rb]);
          const dx = r.int(x, xe - 1);
          up ? P.open(dx, rb - 1, 1, 3) : P.open(dx, ra, 3, 3);
        }
        x = Math.max(xe, x + 1);
        for (const c of cols) x >= c && x < c + 2 && (x = c + 2);
        r.chance(0.35) && (x += r.int(1, 3));
      }
    }
  }
  P.apply({ ...th, roomMin: 2, stopChance: 0.35, maxArea: 20, doorChance: 0.8, pillarChance: 0 });
}

function stationFeatures(m, r, th, l) {
  const K = PLACE_KIND;
  for (let c = 0; c < m.N; c++) {
    if (m.zone[c] === 2) {
      m.floor[c] = 0;
      continue;
    }
    if (m.zone[c] && m.floor[c] === 1) {
      m.floor[c] = 0;
      continue;
    }
    (m.pk[c] === K.TRACK || m.pk[c] === K.TUNNEL) && m.floor[c] === 0 && (m.floor[c] = 7);
  }
  placeRelocate(m, l, (c) => m.floor[c] === 0 && !m.zone[c] && (m.pk[c] === K.SIDE || m.pk[c] === K.ISLAND || m.pk[c] === K.CONC));
}

function stationProps(m, r, th) {
  const K = PLACE_KIND,
    W = m.W,
    S = PLACE_SIGNS;
  placeBegin(m);
  m.trains = [];
  // tracks, platform edges, tunnel darkness
  for (let c = 0; c < m.N; c++) {
    const x = c % W,
      y = (c / W) | 0,
      X = (x + 0.5) * 4,
      Z = (y + 0.5) * 4;
    if (m.floor[c] === 7) {
      addInst(m, "track", X, -1.1, Z, Math.PI / 2, {});
      m.pk[c] === K.TUNNEL ? ((m.light[c] = r.chance(0.12) ? 2 : 3), (m.lightI[c] *= 0.7)) : (m.light[c] = 0);
      continue;
    }
    if (m.floor[c] !== 0 || m.rock[c]) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + ge[d],
        ny = y + xe[d];
      if (!m.inb(nx, ny) || m.floor[m.ci(nx, ny)] !== 7 || m.edge(x, y, d) !== 0) continue;
      addInst(m, "platformEdge", X + ge[d] * 2, 0, Z + xe[d] * 2, Math.atan2(xe[d], -ge[d]), {});
    }
  }
  for (const h of m.halls) {
    // parked trains, doors open toward the island
    for (const [ty, yaw] of [
      [h.y + 3, Math.PI / 2],
      [h.y + 6, -Math.PI / 2],
    ]) {
      if (!r.chance(0.55)) continue;
      const n = r.int(1, 3),
        span = n * 5;
      if (h.x1 - h.x0 - 2 < span) continue;
      const xs = r.int(h.x0 + 1, h.x1 - 1 - span);
      let ok = !0;
      for (let x = xs; x < xs + span; x++) m.floor[m.ci(x, ty)] !== 7 && (ok = !1);
      if (ok) for (let k = 0; k < n; k++) placeTrain(m, (xs + k * 5 + 2.5) * 4, (ty + 0.5) * 4, yaw);
    }
    // island: columns, back-to-back benches, recycling bins, hanging signs
    const zc = (h.y + 5) * 4;
    for (let x = h.x0 + 1; x < h.x1 - 1; x++) {
      const X = (x + 0.5) * 4,
        j = x - h.x0;
      if (![h.y + 4, h.y + 5].every((yy) => placeOk(m, m.ci(x, yy)))) continue;
      if (j % 3 === 1) {
        placeProp(m, "stationPillar", X, zc, 0, fp(0.66, 0.66), {});
        continue;
      }
      if (j % 9 === 5) placeProp(m, "trashSort", X, zc, r.chance(0.5) ? 0 : Math.PI, fp(0.9, 0.5));
      else if (r.chance(0.75)) placeProp(m, "bench", X, zc - 0.55, Math.PI, fp(1.8, 0.5)), placeProp(m, "bench", X, zc + 0.55, 0, fp(1.8, 0.5));
      if (j === 2 || j === h.x1 - h.x0 - 3) addInst(m, "departureBoard", X, 0, zc, 0);
      else if (j % 6 === 3) addInst(m, "stationSign", X, 0, zc, 0, { sign: S["きさらぎ"] });
      else if (j % 12 === 0) addInst(m, "stationClock", X, 0, zc, 0);
    }
    // side platforms: benches against the wall, name boards over the edge
    for (const [sy, d] of [
      [h.y + 2, 3],
      [h.y + 7, 1],
    ])
      for (let x = h.x0 + 1; x < h.x1 - 1; x++) {
        const c = m.ci(x, sy),
          j = x - h.x0;
        if (!placeOk(m, c) || m.edge(x, sy, d) !== 1) continue;
        if (j % 4 === 0) {
          const [px, pz] = wallPoint(x, sy, d, 0.3);
          placeProp(m, "bench", px, pz, yawOf(d), fp(1.8, 0.5));
        } else if (j % 11 === 6) {
          const [px, pz] = wallPoint(x, sy, d, 0.28);
          placeProp(m, "trashSort", px, pz, yawOf(d), fp(0.9, 0.5));
        }
        j % 8 === 2 && addInst(m, "stationSign", (x + 0.5) * 4, 0, (sy + 0.5) * 4 + (d === 3 ? 0.6 : -0.6), 0, { sign: S[sy === h.y + 2 ? "1・2番線" : "3・4番線"] });
      }
    // concourse: ticket gates across both openings, boards above them
    const gz = (h.y + 2) * 4;
    for (const gx of h.gates) {
      if (![gx, gx + 1].every((x) => placeOk(m, m.ci(x, h.y + 1)) && placeOk(m, m.ci(x, h.y + 2)))) continue;
      for (let k = 0; k < 7; k++) placeProp(m, "ticketGate", gx * 4 + 0.55 + k * 1.15, gz, 0, [[-0.18, -0.8, 0.18, 0.8]], { force: !0 });
      addInst(m, "stationSign", (gx + 1) * 4, 0, gz - 1.4, Math.PI, { sign: S["改札"] });
      addInst(m, "departureBoard", (gx + 1) * 4, 0, gz - 5.2, Math.PI);
    }
    placeClutter(m, r, cellsOf(h.cx0, h.y, h.cx1, h.y + 2), [
      ["trashSort", 3],
      ["bench", 3],
      ["plant", 1],
    ], 0.3);
  }
  // passages: exit signs and the odd abandoned thing
  for (const p of m.passages) {
    for (let x = p.x0 + 2; x < p.x1 - 2; x += 7)
      placeOk(m, m.ci(x, p.y)) && placeOk(m, m.ci(x, p.y + 1)) && addInst(m, "stationSign", (x + 0.5) * 4, 0, (p.y + 1) * 4, 0, { sign: r.chance(0.7) ? S["出口"] : S["のりば"] });
    placeClutter(m, r, cellsOf(p.x0, p.y, p.x1, p.y + 2), [
      ["free", 2],
      ["bench", 1],
      ["trashbin", 1],
    ], 0.08);
  }
  // staff rooms behind the passages
  for (const rm of m.rooms)
    placeClutter(m, r, cellsOf(rm.x0, rm.y0, rm.x1, rm.y1), [
      ["lockers", 3],
      ["cardboard", 3],
      ["plasticChair", 2],
      ["watercooler", 1],
      ["free", 2],
    ], 0.35);
  placeEnd(m);
}

// ===========================================================================
// 閉店したモール — a dead mall: promenades with shopfronts, atriums with a dry
// fountain and escalators to nowhere, a food court, service corridors.
// ===========================================================================
function mallLayout(m, r, th) {
  const K = PLACE_KIND,
    W = m.W,
    H = m.H,
    P = new PlacePlan(m, r),
    lines = () => [r.int(14, 19), r.int(46, 51), r.int(78, 83)],
    ys = lines(),
    xs = lines(),
    y0 = ys[0],
    y1 = ys[2] + 3,
    x0 = xs[0],
    x1 = xs[2] + 3;
  for (const y of ys) P.fill(x0, y, x1, y + 3, 1, K.PROM);
  for (const x of xs) P.fill(x, y0, x + 3, y1, 1, K.PROM);
  // entrances: dead-end halls out to locked glass doors
  m.exits = [];
  P.fill(xs[1], 5, xs[1] + 3, y0, 1, K.PROM), m.exits.push([xs[1], 5, 3]);
  P.fill(xs[1], y1, xs[1] + 3, H - 5, 1, K.PROM), m.exits.push([xs[1], H - 6, 1]);
  P.fill(5, ys[1], x0, ys[1] + 3, 1, K.PROM), m.exits.push([5, ys[1], 2]);
  P.fill(x1, ys[1], W - 5, ys[1] + 3, 1, K.PROM), m.exits.push([W - 6, ys[1], 0]);
  // atriums at the crossings
  m.atriums = [];
  for (const y of ys)
    for (const x of xs)
      (r.chance(0.65) || (y === ys[1] && x === xs[1])) && (P.fill(x - 2, y - 2, x + 5, y + 5, 1, K.ATRIUM), m.atriums.push({ x0: x - 2, y0: y - 2, x1: x + 5, y1: y + 5, food: !1 }));
  r.pick(m.atriums).food = !0;
  // shops along both sides of every promenade, a service corridor behind
  const shops = (m.shops = []),
    serv = (x, y) => P.inside(x, y) && !P.reg[m.ci(x, y)] && P.fill(x, y, x + 1, y + 1, 2, K.SERV);
  const shop = (sx0, sy0, sx1, sy1, front, dir, back) => {
    if (!P.isFree(sx0, sy0, sx1, sy1)) return !1;
    const s = P.room(sx0, sy0, sx1, sy1, K.SHOP, { front, dir, type: r.weighted([
      ["clothes", 4],
      ["dark", 3],
      ["store", 2],
      ["cafe", 2],
    ]), sign: PLACE_SIGNS[r.pick(SHOP_SIGNS)] });
    for (const [fx, fy] of front) P.open(fx, fy, dir, 0);
    for (const [bx, by] of back) serv(bx, by);
    shops.push(s);
    return !0;
  };
  for (const y of ys)
    for (const side of [-1, 1])
      for (let x = x0; x < x1; ) {
        const w = r.int(2, 4),
          sy0 = side < 0 ? y - 3 : y + 3,
          fy = side < 0 ? y - 1 : y + 3,
          by = side < 0 ? y - 4 : y + 6,
          dir = side < 0 ? 1 : 3,
          front = [],
          back = [];
        for (let k = 0; k < w; k++) front.push([x + k, fy]), back.push([x + k, by]);
        shop(x, sy0, x + w, sy0 + 3, front, dir, back) ? (x += w) : x++;
      }
  for (const x of xs)
    for (const side of [-1, 1])
      for (let y = y0; y < y1; ) {
        const w = r.int(2, 4),
          sx0 = side < 0 ? x - 3 : x + 3,
          fx = side < 0 ? x - 1 : x + 3,
          bx = side < 0 ? x - 4 : x + 6,
          dir = side < 0 ? 0 : 2,
          front = [],
          back = [];
        for (let k = 0; k < w; k++) front.push([fx, y + k]), back.push([bx, y + k]);
        shop(sx0, y, sx0 + 3, y + w, front, dir, back) ? (y += w) : y++;
      }
  P.apply({ ...th, roomMin: 2, stopChance: 0.4, maxArea: 16, doorChance: 0.8, pillarChance: 0 });
  // back doors from shops into the service corridor (the shop's back row)
  for (const s of shops) {
    if (!r.chance(0.55)) continue;
    const bd = (s.dir + 2) % 4,
      cells = [...cellsOf(s.x0, s.y0, s.x1, s.y1)].filter(([x, y]) => {
        const nx = x + ge[bd],
          ny = y + xe[bd];
        return m.inb(nx, ny) && P.pk[m.ci(nx, ny)] === K.SERV;
      });
    if (cells.length) {
      const [x, y] = r.pick(cells);
      m.setEdge(x, y, bd, 3);
    }
  }
}

function mallFeatures(m, r, th, l) {
  const K = PLACE_KIND;
  placeZoneCarve(m);
  placeRelocate(m, l, (c) => m.floor[c] === 0 && !m.zone[c] && (m.pk[c] === K.PROM || m.pk[c] === K.ATRIUM));
}

function mallProps(m, r, th) {
  const K = PLACE_KIND,
    ceil = th.ceilH;
  placeBegin(m);
  const headerCol = [0.82, 0.8, 0.76];
  // shopfronts, with a bulkhead closing the wall above them
  for (const s of m.shops) {
    let lit = s.type !== "dark" && r.chance(0.55);
    for (const [fx, fy] of s.front) {
      const c = m.ci(fx, fy),
        d = s.dir,
        nx = fx + ge[d],
        ny = fy + xe[d];
      if (m.zone[c] === 2 || !m.inb(nx, ny) || m.zone[m.ci(nx, ny)] === 2 || m.edge(fx, fy, d) !== 0) continue;
      const X = (fx + 0.5) * 4 + ge[d] * 2,
        Z = (fy + 0.5) * 4 + xe[d] * 2;
      addInst(m, "storefront", X, 0, Z, Math.atan2(ge[d], xe[d]), {
        rects: [
          [-2.0, -0.1, -0.78, 0.1],
          [0.78, -0.1, 2.0, 0.1],
        ],
        sign: s.sign,
      });
      ge[d] ? placeBox(m, X - 0.1, 3.74, Z - 2, X + 0.1, ceil, Z + 2, F.WALL, headerCol, 0.37) : placeBox(m, X - 2, 3.74, Z - 0.1, X + 2, ceil, Z + 0.1, F.WALL, headerCol, 0.37);
    }
    // interior
    const cells = [...cellsOf(s.x0, s.y0, s.x1, s.y1)];
    lit || cells.forEach(([x, y]) => (m.light[m.ci(x, y)] = r.chance(0.2) ? 2 : 3));
    const inX = (s.x0 + s.x1) * 2,
      inZ = (s.y0 + s.y1) * 2;
    if (s.type === "clothes") {
      for (let k = 0; k < 10; k++) {
        const [x, y] = r.pick(cells);
        placeOk(m, m.ci(x, y)) && placeProp(m, r.chance(0.7) ? "clothesRack" : "mannequinProp", (x + 0.25 + r.next() * 0.5) * 4, (y + 0.25 + r.next() * 0.5) * 4, r.chance(0.5) ? 0 : Math.PI / 2, fp(1.2, 0.5));
      }
      // window mannequins just behind the glass, facing out
      for (const [fx, fy] of s.front.slice(0, 2)) {
        const [px, pz] = wallPoint(fx, fy, s.dir, 0.8, r.chance(0.5) ? 1.4 : -1.4);
        placeProp(m, "mannequinProp", px, pz, Math.atan2(ge[s.dir], xe[s.dir]) + r.range(-0.3, 0.3), fp(0.45, 0.45), { force: !0 });
      }
    } else if (s.type === "cafe") {
      for (let k = 0; k < 4; k++) {
        const [x, y] = r.pick(cells);
        if (!placeOk(m, m.ci(x, y))) continue;
        const tx = (x + 0.5) * 4,
          tz = (y + 0.5) * 4;
        if (!placeClear(m, [tx - 1.2, tz - 1.2, tx + 1.2, tz + 1.2])) continue;
        placeTable(m, tx, tz);
        for (let q = 0; q < 4; q++) placeProp(m, "plasticChair", tx + Math.sin(q * 1.57) * 0.85, tz + Math.cos(q * 1.57) * 0.85, q * 1.57 + Math.PI + r.range(-0.4, 0.4), fp(0.45, 0.45));
      }
    } else if (s.type === "store") {
      placeProp(m, "kiosk", inX, inZ, s.dir * 1.57, fp(2.0, 1.2), { sign: s.sign });
      placeClutter(m, r, cells, [
        ["lockers", 2],
        ["cardboard", 2],
      ], 0.5);
    } else {
      placeClutter(m, r, cells, [
        ["cardboard", 4],
        ["free", 2],
      ], 0.45);
      r.chance(0.3) && placeProp(m, "mannequinProp", inX, inZ, r.next() * 6.28, fp(0.45, 0.45));
    }
  }
  // atriums: dry fountain (or a food court), escalators to nowhere, planters
  for (const a of m.atriums) {
    const X = (a.x0 + a.x1) * 2,
      Z = (a.y0 + a.y1) * 2,
      c = m.ci((a.x0 + a.x1) >> 1, (a.y0 + a.y1) >> 1);
    if (m.zone[c] === 2) continue;
    if (a.food) {
      for (let j = -2; j <= 2; j++)
        for (let i = -2; i <= 2; i++) {
          const tx = X + i * 3.6,
            tz = Z + j * 3.6;
          if ((i + j) % 2 || !placeClear(m, [tx - 1.2, tz - 1.2, tx + 1.2, tz + 1.2])) continue;
          placeTable(m, tx, tz);
          for (let q = 0; q < 4; q++) r.chance(0.8) && placeProp(m, "plasticChair", tx + Math.sin(q * 1.57) * 0.85, tz + Math.cos(q * 1.57) * 0.85, q * 1.57 + Math.PI + r.range(-0.5, 0.5), fp(0.45, 0.45));
        }
      placeProp(m, "kiosk", X - 10, Z - 10, 0, fp(2.0, 1.2), { sign: PLACE_SIGNS.FOOD });
      placeProp(m, "kiosk", X + 10, Z - 10, 0, fp(2.0, 1.2), { sign: PLACE_SIGNS.CAFE });
    } else {
      placeProp(m, "fountain", X, Z, 0, fp(4.9, 4.9), {});
      const ex = X + (r.chance(0.5) ? -1 : 1) * 9.5,
        k = 0.85;
      for (const off of [-0.8, 0.8]) placeProp(m, "escalator", ex + off * k, Z, r.chance(0.5) ? 0 : Math.PI, [[-0.8 * k, -4.5 * k, 0.8 * k, 4.5 * k]], { scale: k });
      for (let q = 0; q < 4; q++) placeProp(m, "mallBench", X + Math.sin(q * 1.57) * 3.6, Z + Math.cos(q * 1.57) * 3.6, q * 1.57 + Math.PI, fp(1.6, 0.6));
    }
    for (const [i, j] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      placeProp(m, "planter", X + i * 11, Z + j * 11, 0, fp(2.4, 1.2));
  }
  // promenades: planters with benches down the middle, kiosks, lost carts
  for (let c = 0; c < m.N; c++) {
    if (m.pk[c] !== K.PROM || !placeOk(m, c)) continue;
    const x = c % m.W,
      y = (c / m.W) | 0,
      X = (x + 0.5) * 4,
      Z = (y + 0.5) * 4,
      horiz = m.pk[m.ci(x, y - 1)] !== K.PROM && m.pk[m.ci(x, y + 1)] === K.PROM && m.pk[m.ci(x, y + 2)] === K.PROM,
      vert = m.pk[m.ci(x - 1, y)] !== K.PROM && m.pk[m.ci(x + 1, y)] === K.PROM && m.pk[m.ci(x + 2, y)] === K.PROM;
    if (horiz && x % 6 === 0 && placeOk(m, m.ci(x, y + 1))) {
      placeProp(m, "planter", X, Z + 4, 0, fp(2.4, 1.2)) && (placeProp(m, "mallBench", X, Z + 2.6, Math.PI, fp(1.6, 0.6)), placeProp(m, "mallBench", X, Z + 5.4, 0, fp(1.6, 0.6)));
    } else if (vert && y % 6 === 3 && placeOk(m, m.ci(x + 1, y))) {
      placeProp(m, "planter", X + 4, Z, Math.PI / 2, fp(2.4, 1.2)) && (placeProp(m, "mallBench", X + 2.6, Z, -Math.PI / 2, fp(1.6, 0.6)), placeProp(m, "mallBench", X + 5.4, Z, Math.PI / 2, fp(1.6, 0.6)));
    } else if (r.chance(0.03)) placeProp(m, "cart", X + r.range(-1, 1), Z + r.range(-1, 1), r.next() * 6.28, fp(0.6, 1.0));
    else if (r.chance(0.012)) placeProp(m, "kiosk", X, Z, r.chance(0.5) ? 0 : Math.PI / 2, fp(2.0, 1.2), { sign: PLACE_SIGNS[r.pick(SHOP_SIGNS)] });
    else if (r.chance(0.02)) placeProp(m, r.pick(["wetfloor", "trashbin", "cardboard"]), X + r.range(-1, 1), Z + r.range(-1, 1), r.next() * 6.28, fp(0.5, 0.5));
  }
  // locked glass doors at the end of every entrance hall
  for (const [ex, ey, d] of m.exits)
    for (let k = 0; k < 3; k++) {
      const x = ge[d] ? ex : ex + k,
        y = ge[d] ? ey + k : ey;
      if (m.zone[m.ci(x, y)] === 2) continue;
      const [px, pz] = wallPoint(x, y, d, 0.12);
      addInst(m, "storefront", px, 0, pz, yawOf(d), { rects: [[-2, -0.12, 2, 0.12]], sign: PLACE_SIGNS["出口"] });
    }
  // service corridors
  placeClutter(m, r, [...Array(m.N).keys()].filter((c) => m.pk[c] === K.SERV).map((c) => [c % m.W, (c / m.W) | 0]), [
    ["cardboard", 4],
    ["lockers", 1],
    ["trashbin", 1],
    ["free", 2],
  ], 0.12);
  placeEnd(m);
}

// a cafe table (merged geometry) with its collision box
function placeTable(m, x, z) {
  placeBox(m, x - 0.42, 0.72, z - 0.42, x + 0.42, 0.76, z + 0.42, F.PROP, [0.72, 0.7, 0.66]);
  placeBox(m, x - 0.035, 0, z - 0.035, x + 0.035, 0.72, z + 0.035, F.METAL, [0.15, 0.15, 0.16]);
  placeBox(m, x - 0.25, 0, z - 0.25, x + 0.25, 0.025, z + 0.25, F.METAL, [0.15, 0.15, 0.16]);
  Uo(m, [x - 0.42, z - 0.42, x + 0.42, z + 0.42]);
}

// ===========================================================================
// 夜の学校 — a school at night: wings of classrooms on long corridors,
// connecting corridors, the shoe-locker entrance, staff room, infirmary…
// ===========================================================================
function schoolLayout(m, r, th) {
  const K = PLACE_KIND,
    W = m.W,
    H = m.H,
    P = new PlacePlan(m, r),
    wings = [];
  for (let y = r.int(3, 6); y < H - 8; ) {
    const dbl = r.chance(0.6),
      x0 = r.int(3, 30),
      x1 = W - r.int(3, 30),
      w = dbl ? { y, corr: y + 2, rows: [[y, y + 2, 1], [y + 3, y + 5, 3]], h: 5, x0, x1 } : r.chance(0.5) ? { y, corr: y, rows: [[y + 1, y + 3, 3]], h: 3, x0, x1 } : { y, corr: y + 2, rows: [[y, y + 2, 1]], h: 3, x0, x1 };
    wings.push(w);
    y += w.h + r.int(4, 9);
  }
  for (const w of wings) P.fill(w.x0, w.corr, w.x1, w.corr + 1, 1, K.CORR);
  // connecting corridors between neighbouring wings, reserved before the rooms
  const reserve = new Map();
  for (let i = 0; i + 1 < wings.length; i++) {
    const a = wings[i],
      b = wings[i + 1],
      lo = Math.max(a.x0, b.x0) + 1,
      hi = Math.min(a.x1, b.x1) - 2;
    if (hi <= lo) continue;
    for (let k = 0; k < 3; k++) {
      const cx = k === 0 ? lo : k === 1 ? hi : r.int(lo, hi);
      P.fill(cx, a.corr + 1, cx + 1, b.corr, 1, K.CORR);
      for (let y = a.corr + 1; y < b.corr; y++) reserve.set(m.ci(cx, y), 1);
    }
  }
  // rooms
  let classN = 0;
  const special = ["staff", "infirmary", "music", "science", "library", "entrance"];
  for (const w of wings)
    for (const [ra, rb, dir] of w.rows)
      for (let x = w.x0; x < w.x1 - 1; ) {
        let wd = r.chance(0.15) ? 3 : 2;
        x + wd > w.x1 && (wd = w.x1 - x);
        let blocked = !1;
        for (let k = 0; k < wd; k++) for (let y = ra; y < rb; y++) reserve.has(m.ci(x + k, y)) && (blocked = !0);
        if (blocked || wd < 2 || !P.isFree(x, ra, x + wd, rb)) {
          x++;
          continue;
        }
        const type = special.length && r.chance(0.18) ? special.splice(r.int(0, special.length - 1), 1)[0] : "class",
          fy = dir === 1 ? rb - 1 : ra;
        const rm = P.room(x, ra, x + wd, rb, K.ROOM, { type, dir, fy, n: classN++ });
        if (type === "entrance") P.fill(x, ra, x + wd, rb, 1, K.LOBBY), (rm.rid = 1);
        else P.open(x, fy, dir, 3), P.open(x + wd - 1, fy, dir, 3);
        x += wd;
      }
  P.apply({ ...th, pillarChance: 0 });
  m.wings = wings;
}

function schoolFeatures(m, r, th, l) {
  const K = PLACE_KIND;
  placeZoneCarve(m);
  placeRelocate(m, l, (c) => m.floor[c] === 0 && !m.zone[c] && (m.pk[c] === K.CORR || m.pk[c] === K.LOBBY));
}

function schoolProps(m, r, th) {
  const K = PLACE_KIND,
    S = PLACE_SIGNS,
    classSigns = ["1-A", "1-B", "2-A", "2-B", "3-A", "3-C"];
  placeBegin(m);
  for (const rm of m.rooms) {
    const cells = [...cellsOf(rm.x0, rm.y0, rm.x1, rm.y1)];
    if (cells.some(([x, y]) => m.zone[m.ci(x, y)] === 2)) continue;
    // door plate on the corridor side
    const sign = { staff: "職員室", infirmary: "保健室", music: "音楽室", science: "理科室", library: "図書室", class: classSigns[rm.n % 6] }[rm.type];
    if (sign) {
      const cx = rm.x0,
        cy = rm.fy + xe[rm.dir],
        [px, pz] = wallPoint(cx, cy, (rm.dir + 2) % 4, 0, 0);
      m.inb(cx, cy) && m.props.push({ cx, cy, build: (b) => dE(b, px, 2.45, pz, (rm.dir + 2) % 4, S[sign]) });
    }
    rm.type === "class" || rm.type === "music" || rm.type === "science" ? r.chance(0.7) || cells.forEach(([x, y]) => (m.light[m.ci(x, y)] = 3)) : 0;
    const X0 = rm.x0 * 4,
      X1 = rm.x1 * 4,
      Z0 = rm.y0 * 4,
      Z1 = rm.y1 * 4;
    if (rm.type === "class" && r.chance(0.55)) {
      // cleared out: a few chairs stacked by the wall, the blackboard left
      addInst(m, "blackboard", X0 + gs, 0, (Z0 + Z1) / 2, Math.PI / 2, {});
      placeClutter(m, r, cells, [
        ["plasticChair", 2],
        ["cardboard", 1],
        ["lockers", 1],
      ], 0.35);
    } else if (rm.type === "class" || rm.type === "music" || rm.type === "science") {
      // blackboard on the west wall, teacher's desk, rows of desks facing it
      const bz = (Z0 + Z1) / 2;
      addInst(m, "blackboard", X0 + gs, 0, bz, Math.PI / 2, {});
      placeProp(m, "teacherDesk", X0 + 1.5, bz, -Math.PI / 2, fp(1.5, 0.75));
      for (let x = X0 + 3.2; x < X1 - 0.8; x += rm.type === "science" ? 2.2 : 1.2)
        for (let z = Z0 + 1.0; z < Z1 - 0.7; z += rm.type === "music" ? 1.0 : 1.3) {
          const knocked = r.chance(0.06);
          if (r.chance(0.08)) continue;
          rm.type === "music"
            ? placeProp(m, "plasticChair", x, z, -Math.PI / 2 + r.range(-0.2, 0.2), fp(0.45, 0.45))
            : rm.type === "science"
              ? placeProp(m, "teacherDesk", x, z, -Math.PI / 2, fp(1.5, 0.75))
              : placeProp(m, "schoolDesk", x + (knocked ? r.range(-0.4, 0.4) : 0), z + (knocked ? r.range(-0.3, 0.3) : 0), -Math.PI / 2 + (knocked ? r.range(-1.2, 1.2) : r.range(-0.06, 0.06)), [[-0.33, -0.25, 0.33, 0.25]]);
        }
    } else if (rm.type === "staff") {
      for (let x = X0 + 1.6; x < X1 - 1.2; x += 1.7)
        for (const z of [(Z0 + Z1) / 2 - 0.42, (Z0 + Z1) / 2 + 0.42]) placeProp(m, "teacherDesk", x, z, z < (Z0 + Z1) / 2 ? Math.PI : 0, fp(1.5, 0.75)) && placeProp(m, "chair", x, z + (z < (Z0 + Z1) / 2 ? -0.75 : 0.75), z < (Z0 + Z1) / 2 ? 0 : Math.PI, fp(0.55, 0.55));
      placeClutter(m, r, cells, [
        ["lockers", 2],
        ["watercooler", 1],
        ["cardboard", 1],
      ], 0.5);
    } else if (rm.type === "infirmary") {
      placeClutter(m, r, cells, [
        ["lockers", 1],
        ["watercooler", 1],
      ], 0.4);
      for (const [x, y] of cells.slice(0, 3)) {
        const ds = [0, 1, 2, 3].filter((d) => m.edge(x, y, d) === 1);
        if (!ds.length) continue;
        const [px, pz] = wallPoint(x, y, ds[0], 1.05);
        placeProp(m, "hospitalbed", px, pz, yawOf(ds[0]), fp(1.0, 2.1));
      }
    } else if (rm.type === "library") {
      for (let z = Z0 + 1.4; z < Z1 - 1; z += 1.6)
        for (let x = X0 + 1.5; x < X1 - 1.4; x += 2.3) placeProp(m, "shoeLocker", x, z, 0, fp(2.0, 0.4)), placeProp(m, "shoeLocker", x, z + 0.42, Math.PI, fp(2.0, 0.4));
    } else if (rm.type === "entrance") {
      for (let x = X0 + 1.4; x < X1 - 1.4; x += 2.3)
        for (let z = Z0 + 1.6; z < Z1 - 1; z += 2.4) placeProp(m, "shoeLocker", x, z, 0, fp(2.0, 0.4)), placeProp(m, "shoeLocker", x, z + 0.42, Math.PI, fp(2.0, 0.4));
    }
  }
  // corridors: lockers, a forgotten desk, wet floor signs
  const corr = [];
  for (let c = 0; c < m.N; c++) m.pk[c] === K.CORR && corr.push([c % m.W, (c / m.W) | 0]);
  placeClutter(m, r, corr, [
    ["lockers", 4],
    ["free", 1],
    ["plasticChair", 1],
  ], 0.12);
  for (let k = 0; k < 6; k++) {
    const [x, y] = r.pick(corr);
    placeOk(m, m.ci(x, y)) && placeProp(m, "schoolDesk", (x + 0.5) * 4, (y + 0.5) * 4, r.next() * 6.28, [[-0.33, -0.25, 0.33, 0.25]]);
  }
  placeEnd(m);
}

// ===========================================================================
// 終わらないホテル — an endless hotel: long carpeted corridors lined with
// numbered doors that never open, sconces, ice machines, lift lobbies.
// ===========================================================================
function hotelLayout(m, r, th) {
  const K = PLACE_KIND,
    W = m.W,
    H = m.H,
    P = new PlacePlan(m, r),
    off = r.int(3, 5),
    rows = [],
    cols = [];
  for (let y = off; y < H - 3; y += 7) rows.push(y);
  for (let x = r.int(4, 9); x < W - 4; x += r.int(11, 19)) cols.push(x);
  // vertical corridors join a few consecutive floors of rooms each
  const vseg = [];
  for (const x of cols)
    for (let i = 0; i < rows.length - 1; ) {
      const n = r.int(1, 4);
      r.chance(0.75) && vseg.push([x, rows[i], rows[Math.min(rows.length - 1, i + n)]]);
      i += n;
    }
  for (const [x, a, b] of vseg) P.fill(x, a, x + 1, b + 1, 1, K.CORR);
  // horizontal runs, each crossing at least one vertical corridor
  for (const y of rows) {
    const vs = [...new Set(vseg.filter((v) => y >= v[1] && y <= v[2]).map((v) => v[0]))];
    if (!vs.length) continue;
    for (let i = 0; i < vs.length; i++) {
      if (i > 0 && r.chance(0.25)) continue;
      const a = i === 0 ? Math.max(2, vs[0] - r.int(3, 12)) : vs[i - 1],
        b = i === vs.length - 1 ? Math.min(W - 2, vs[i] + r.int(3, 12)) : vs[i];
      P.fill(a, y, b + 1, y + 1, 1, K.CORR);
    }
  }
  // lift lobbies at some crossings, a few guest rooms left open
  m.lobbies = [];
  const roomy = (x, y) => P.inside(x, y) && (!P.reg[m.ci(x, y)] || P.pk[m.ci(x, y)] === K.CORR);
  for (const [x, a, b] of vseg)
    for (const y of [a, b])
      if (r.chance(0.3) && [...cellsOf(x - 1, y - 1, x + 2, y + 2)].every(([i, j]) => roomy(i, j)) && !m.lobbies.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) < 6))
        P.fill(x - 1, y - 1, x + 2, y + 2, 1, K.LOBBY), m.lobbies.push([x, y]);
  for (let c = 0; c < m.N; c++) {
    if (P.pk[c] !== K.CORR) continue;
    const x = c % W,
      y = (c / W) | 0;
    for (const d of [1, 3]) {
      if (!r.chance(0.05)) continue;
      const y0 = d === 1 ? y + 1 : y - 3;
      P.isFree(x, y0, x + 1, y0 + 3) && (P.room(x, y0, x + 1, y0 + 3, K.ROOM, { dir: (d + 2) % 4, door: [x, d === 1 ? y0 : y0 + 2] }), P.open(x, d === 1 ? y0 : y0 + 2, (d + 2) % 4, 3));
    }
  }
  P.apply({ ...th, pillarChance: 0 });
}

function hotelFeatures(m, r, th, l) {
  const K = PLACE_KIND;
  placeZoneCarve(m);
  placeRelocate(m, l, (c) => m.floor[c] === 0 && !m.zone[c] && (m.pk[c] === K.CORR || m.pk[c] === K.LOBBY));
}

function hotelProps(m, r, th) {
  const K = PLACE_KIND;
  placeBegin(m);
  for (let c = 0; c < m.N; c++) {
    if ((m.pk[c] !== K.CORR && m.pk[c] !== K.LOBBY) || m.floor[c] !== 0 || m.rock[c] || m.zone[c] === 2) continue;
    const x = c % m.W,
      y = (c / m.W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + ge[d],
        ny = y + xe[d];
      if (!m.inb(nx, ny) || m.edge(x, y, d) !== 1 || !m.rock[m.ci(nx, ny)]) continue;
      // numbered doors staggered along both walls, sconces between them
      if (((d === 1 || d === 3 ? x : y) + (d < 2 ? 0 : 1)) % 2 === 0 && m.pk[c] === K.CORR) {
        const [px, pz] = wallPoint(x, y, d, 0);
        addInst(m, "hotelDoor", px, 0, pz, yawOf(d), { sign: PLACE_SIGNS[ROOM_NUMBERS[(x * 7 + y * 13 + d) % ROOM_NUMBERS.length]] });
      } else {
        const [px, pz] = wallPoint(x, y, d, 0);
        addInst(m, "sconce", px, 0, pz, yawOf(d), {});
      }
    }
  }
  // lobbies: console tables with mirrors and flowers, an ice machine
  for (const [x, y] of m.lobbies) {
    const X = (x + 0.5) * 4,
      Z = (y + 0.5) * 4;
    placeProp(m, "consoleTable", X - 5.3, Z, Math.PI / 2, fp(1.2, 0.45));
    placeProp(m, "consoleTable", X + 5.3, Z, -Math.PI / 2, fp(1.2, 0.45));
    placeProp(m, "plant", X + 4.6, Z + 4.6, 0, fp(0.5, 0.5));
    placeProp(m, "plant", X - 4.6, Z - 4.6, 0, fp(0.5, 0.5));
  }
  const corr = [];
  for (let c = 0; c < m.N; c++) (m.pk[c] === K.CORR || m.pk[c] === K.LOBBY) && corr.push([c % m.W, (c / m.W) | 0]);
  placeClutter(m, r, corr, [
    ["roomServiceCart", 3],
    ["iceMachine", 1],
    ["consoleTable", 1],
    ["free", 1],
  ], 0.035);
  // the few open rooms: dark, a chair, something left behind
  for (const rm of m.rooms) {
    const cells = [...cellsOf(rm.x0, rm.y0, rm.x1, rm.y1)];
    cells.forEach(([x, y]) => (m.light[m.ci(x, y)] = r.chance(0.3) ? 2 : 3));
    placeClutter(m, r, cells, [
      ["chair", 2],
      ["consoleTable", 1],
      ["roomServiceCart", 1],
      ["free", 1],
    ], 0.6);
  }
  placeEnd(m);
}

// ===========================================================================
// registration
// ===========================================================================
Object.assign(ah, {
  station: {
    id: "station",
    name: "きさらぎ駅",
    en: "KISARAGI STATION",
    ceilH: 4.4,
    wallKind: "tile",
    floorKind: "tile",
    ceilKind: "concreteCeil",
    lightCol: [0.9, 0.97, 1],
    lightI: 1.05,
    ambient: [0.004, 0.005, 0.006],
    fogCol: [0.07, 0.08, 0.085],
    fogDen: 0.021,
    lightOn: 0.62,
    lightFlick: 0.08,
    darkPatch: 0.2,
    roomMin: 2,
    stopChance: 0.3,
    maxArea: 30,
    wallRemove: 0,
    stubs: 0,
    pillarChance: 0,
    doorChance: 0.7,
    grade: { lift: [0, 0.004, 0.008], gamma: [1.02, 1, 0.98], gain: [0.94, 1, 1.06], sat: 0.8 },
    exposure: 1.15,
    baseboard: [0.16, 0.16, 0.18],
    lamp: [1.6, 0.12],
    layout: stationLayout,
    features: stationFeatures,
    props: stationProps,
    packs: ["common", "station"],
  },
  mall: {
    id: "mall",
    name: "閉店したモール",
    en: "THE DEAD MALL",
    ceilH: 5,
    wallKind: "office",
    floorKind: "tile",
    ceilKind: "tiles",
    lightCol: [1, 0.95, 0.86],
    lightI: 1.1,
    ambient: [0.007, 0.006, 0.005],
    fogCol: [0.19, 0.17, 0.14],
    fogDen: 0.015,
    lightOn: 0.55,
    lightFlick: 0.06,
    darkPatch: 0.22,
    roomMin: 2,
    stopChance: 0.4,
    maxArea: 16,
    wallRemove: 0,
    stubs: 0,
    pillarChance: 0,
    doorChance: 0.7,
    grade: { lift: [0.008, 0.006, 0.004], gamma: [1, 1, 1.02], gain: [1.04, 1, 0.94], sat: 0.85 },
    exposure: 1.15,
    baseboard: [0.32, 0.3, 0.27],
    lamp: [0.45, 0.45],
    layout: mallLayout,
    features: mallFeatures,
    props: mallProps,
    packs: ["common", "mall"],
  },
  school: {
    id: "school",
    name: "夜の学校",
    en: "THE NIGHT SCHOOL",
    ceilH: 3.1,
    wallKind: "office",
    floorKind: "lino",
    ceilKind: "tiles",
    lightCol: [0.86, 0.95, 1],
    lightI: 0.95,
    ambient: [0.003, 0.0035, 0.005],
    fogCol: [0.05, 0.06, 0.08],
    fogDen: 0.026,
    lightOn: 0.5,
    lightFlick: 0.1,
    darkPatch: 0.28,
    roomMin: 2,
    stopChance: 0.3,
    maxArea: 30,
    wallRemove: 0,
    stubs: 0,
    pillarChance: 0,
    doorChance: 0.7,
    grade: { lift: [0, 0.002, 0.008], gamma: [1.02, 1, 0.98], gain: [0.95, 0.99, 1.05], sat: 0.78 },
    exposure: 1.2,
    baseboard: [0.12, 0.14, 0.13],
    lamp: [1.2, 0.1],
    layout: schoolLayout,
    features: schoolFeatures,
    props: schoolProps,
    packs: ["common", "school", "hospital"],
  },
  hotel: {
    id: "hotel",
    name: "終わらないホテル",
    en: "THE ENDLESS HOTEL",
    ceilH: 2.8,
    wallKind: "paper",
    paperKind: "damask",
    paperCol: [0.5, 0.41, 0.22],
    paperScale: 1.06,
    floorKind: "carpet",
    ceilKind: "tiles",
    lightCol: [1, 0.78, 0.52],
    lightI: 0.9,
    ambient: [0.006, 0.004, 0.002],
    fogCol: [0.12, 0.07, 0.04],
    fogDen: 0.028,
    lightOn: 0.72,
    lightFlick: 0.07,
    darkPatch: 0.18,
    roomMin: 2,
    stopChance: 0.3,
    maxArea: 30,
    wallRemove: 0,
    stubs: 0,
    pillarChance: 0,
    doorChance: 0.7,
    grade: { lift: [0.01, 0.005, 0], gamma: [1, 1.02, 1.06], gain: [1.08, 0.98, 0.86], sat: 0.92 },
    exposure: 1.2,
    baseboard: [0.16, 0.09, 0.05],
    lamp: [0.22, 0.22],
    layout: hotelLayout,
    features: hotelFeatures,
    props: hotelProps,
    packs: ["common", "hotel"],
  },
});
Object.assign(LE, {
  station: { tex: { wall: "metroTile", floor: "platformTile", ceil: "metalCeil" }, scale: [1.2, 2.4, 2.4], wallKind: 1, ceilKind: 1, gloss: 0.25, wet: 0.45, tint: [1, 1, 1], tint2: [1, 1, 1] },
  mall: { tex: { wall: "drywall", floor: "terrazzo", ceil: "tiles" }, scale: [2, 3, 1.2], wallKind: 1, ceilKind: 0, gloss: 0.45, wet: 0.2, tint: [0.88, 0.85, 0.8], tint2: [1, 1, 1] },
  school: { tex: { wall: "drywall", floor: "woodFloor", ceil: "tiles" }, scale: [2, 2.4, 1.2], wallKind: 2, ceilKind: 0, gloss: 0.3, wet: 0.15, tint: [0.42, 0.5, 0.44], tint2: [0.8, 0.78, 0.7] },
  hotel: { tex: { wall: "paper", floor: "hotelCarpet", ceil: "drywall" }, scale: [0.53, 2, 2], wallKind: 0, ceilKind: 1, gloss: 0, wet: 0.2, tint: [1, 1, 1], tint2: [1, 1, 1] },
});
LE.pipes.tex.floor = "concreteFloor";
Object.assign(Hd, {
  station: [
    ["wanderer", 4],
    ["tall", 1.5],
    ["headlight", 1],
    ["crawler", 1.5],
  ],
  mall: [
    ["mannequin", 4],
    ["wanderer", 3],
    ["crawler", 1],
  ],
  school: [
    ["wanderer", 3],
    ["crawler", 2],
    ["tall", 1],
    ["mannequin", 1],
  ],
  hotel: [
    ["wanderer", 3],
    ["wraith", 2],
    ["tall", 1.5],
    ["mannequin", 1],
  ],
});
S2.push("station", "mall", "school", "hotel");

// B1 is any everyday place; the deeper floors draw from everything else
{
  const newRun = Td.prototype.newRun;
  Td.prototype.newRun = function (seed, opts = {}) {
    const res = newRun.call(this, seed, opts),
      rr = new Ci((seed ^ 0x51ac3) >>> 0),
      first = rr.weighted([
        ["yellow", 3],
        ["station", 2],
        ["mall", 2],
        ["school", 2],
        ["hotel", 2],
      ]);
    this.run.themes = [first, ...rr.shuffle(S2.filter((t) => t !== first)).slice(0, 4)];
    return res;
  };
}
