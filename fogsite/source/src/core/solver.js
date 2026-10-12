// ─────────────────────────────────────────────────────────────
//  Deduction solver — works only with information explorers have.
//  An explorer's map is relative to its (unknown) start square. A "placement"
//  assigns every explorer an absolute start index (0..24). We enumerate all
//  placements consistent with: the 5×5 bounds, outer/inner wall results,
//  teammates' maps, start-square rules, guide directions and monk counts.
// ─────────────────────────────────────────────────────────────
import { SIZE, CELLS, DIRS, DIR_KEYS } from './constants.js';

const inBox = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
const ix = (x, y) => y * SIZE + x;

export function buildKnowledge(snap) {
  const ids = Object.keys(snap.maps || {}).sort();
  const cells = {};
  for (const id of ids) {
    const m = snap.maps[id];
    cells[id] = Object.entries(m.discovered || {}).map(([k, v]) => {
      const [lx, ly] = k.split(',').map(Number);
      return { lx, ly, v: v === 'wall' ? 'wall' : 'open', kind: m.wallKinds?.[k] || null };
    });
  }
  const monks = [], guides = [];
  for (const it of snap.intel || []) {
    if (it.kind !== 'ability') continue;
    if (it.char === 'monk' && it.local && it.dir) monks.push({ actor: it.actor, local: it.local, dir: it.dir, count: it.count });
    if (it.char === 'guide' && it.actorLocal && it.targetLocal && it.dir) guides.push({ actor: it.actor, target: it.target, a: it.actorLocal, b: it.targetLocal, dir: it.dir });
  }
  const local = Object.fromEntries(ids.map(id => [id, { ...snap.maps[id].localPos }]));
  return { ids, cells, monks, guides, local };
}

export function singleFeasible(know, id, start) {
  const sx = start % SIZE, sy = Math.floor(start / SIZE);
  for (const c of know.cells[id]) {
    const ax = sx + c.lx, ay = sy + c.ly, inside = inBox(ax, ay);
    if (c.v === 'open' && !inside) return false;
    if (c.kind === 'outer' && inside) return false;
    if (c.kind === 'inner' && !inside) return false;
  }
  return true;
}

export function feasibleStarts(know, id) {
  const out = [];
  for (let s = 0; s < CELLS; s++) if (singleFeasible(know, id, s)) out.push(s);
  return out;
}

function absMap(know, id, start) {
  const sx = start % SIZE, sy = Math.floor(start / SIZE), m = new Map();
  for (const c of know.cells[id]) {
    const ax = sx + c.lx, ay = sy + c.ly;
    if (inBox(ax, ay)) m.set(ix(ax, ay), c.v);
  }
  return m;
}

function pairOk(know, a, sa, b, sb, cache) {
  const ka = `${a}:${sa}`, kb = `${b}:${sb}`;
  if (sa === sb) return false;
  const ax = sa % SIZE, ay = Math.floor(sa / SIZE), bx = sb % SIZE, by = Math.floor(sb / SIZE);
  if (Math.abs(ax - bx) + Math.abs(ay - by) === 1) return false; // starts are never orthogonally adjacent
  const ma = cache.get(ka) || (cache.set(ka, absMap(know, a, sa)), cache.get(ka));
  const mb = cache.get(kb) || (cache.set(kb, absMap(know, b, sb)), cache.get(kb));
  const [small, big] = ma.size < mb.size ? [ma, mb] : [mb, ma];
  for (const [cell, v] of small) { const w = big.get(cell); if (w && w !== v) return false; }
  return true;
}

export function mergedGrid(know, combo) {
  const g = Array(CELLS).fill(null);
  know.ids.forEach((id, i) => { for (const [cell, v] of absMap(know, id, combo[i])) g[cell] = v; });
  return g;
}

function guideOk(know, combo, gd) {
  const ia = know.ids.indexOf(gd.actor), ib = know.ids.indexOf(gd.target);
  if (ia < 0 || ib < 0) return true;
  const A = { x: combo[ia] % SIZE + gd.a.x, y: Math.floor(combo[ia] / SIZE) + gd.a.y };
  const B = { x: combo[ib] % SIZE + gd.b.x, y: Math.floor(combo[ib] / SIZE) + gd.b.y };
  if (A.x === B.x && A.y === B.y) return true;
  if (gd.dir === 'N') return B.y < A.y;
  if (gd.dir === 'S') return B.y > A.y;
  if (gd.dir === 'E') return B.x > A.x;
  if (gd.dir === 'W') return B.x < A.x;
  return true;
}

function monkOk(know, combo, grid, mk) {
  const i = know.ids.indexOf(mk.actor);
  if (i < 0) return true;
  let x = combo[i] % SIZE + mk.local.x, y = Math.floor(combo[i] / SIZE) + mk.local.y;
  const d = DIRS[mk.dir];
  let walls = 0, unknown = 0;
  for (;;) {
    x += d.dx; y += d.dy;
    if (!inBox(x, y)) break;
    const v = grid[ix(x, y)];
    if (v === 'wall') walls++; else if (v == null) unknown++;
  }
  return walls <= mk.count && mk.count <= walls + unknown;
}

// Enumerate all consistent placements. Returns { combos, ids, starts }.
export function solve(know, { limit = 40000 } = {}) {
  const ids = know.ids;
  const starts = ids.map(id => feasibleStarts(know, id));
  const cache = new Map();
  const combos = [];
  const cur = [];
  const rec = (k) => {
    if (combos.length >= limit) return;
    if (k === ids.length) {
      const combo = [...cur];
      if (know.guides.length && !know.guides.every(g => guideOk(know, combo, g))) return;
      if (know.monks.length) {
        const grid = mergedGrid(know, combo);
        if (!know.monks.every(m => monkOk(know, combo, grid, m))) return;
      }
      combos.push(combo);
      return;
    }
    for (const s of starts[k]) {
      let ok = true;
      for (let j = 0; j < k; j++) if (!pairOk(know, ids[j], cur[j], ids[k], s, cache)) { ok = false; break; }
      if (!ok) continue;
      cur[k] = s; rec(k + 1);
    }
  };
  rec(0);
  return { ids, combos, starts };
}

// Current absolute position of each explorer under a placement.
export function positionsFor(know, combo) {
  return know.ids.map((id, i) => {
    const l = know.local[id];
    return ix(combo[i] % SIZE + l.x, Math.floor(combo[i] / SIZE) + l.y);
  });
}

// Relative frame offsets (explorer k's start minus explorer 0's start) – what matters for meeting.
export function relKey(know, combo) {
  const x0 = combo[0] % SIZE, y0 = Math.floor(combo[0] / SIZE);
  return combo.map(s => `${s % SIZE - x0},${Math.floor(s / SIZE) - y0}`).join('|');
}

export function summarize(know, sol) {
  const n = sol.combos.length;
  const rel = new Map();
  let together = 0;
  const marg = know.ids.map(() => new Map());
  for (const c of sol.combos) {
    const k = relKey(know, c);
    rel.set(k, (rel.get(k) || 0) + 1);
    const pos = positionsFor(know, c);
    if (pos.every(p => p === pos[0])) together++;
    c.forEach((s, i) => marg[i].set(s, (marg[i].get(s) || 0) + 1));
  }
  return {
    count: n, relClasses: rel.size, relCertain: rel.size === 1 && n > 0,
    togetherProb: n ? together / n : 0, allTogether: n > 0 && together === n,
    marginals: Object.fromEntries(know.ids.map((id, i) => [id, marg[i]])),
    topRel: [...rel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };
}

// ───────────── team board helpers (7×7 frame: maze 1..5 + ring 0/6) ─────────────
// layers[eid] = { x, y } offset: local (0,0) sits at board (x, y).
export function boardConflicts(know, layers) {
  const claims = new Map(); // "x,y" -> {open:Set, wall:Set}
  const issues = [];
  const placed = know.ids.filter(id => layers[id]);
  for (const id of placed) {
    const L = layers[id];
    for (const c of know.cells[id]) {
      const bx = L.x + c.lx, by = L.y + c.ly, k = `${bx},${by}`;
      const onRing = bx === 0 || by === 0 || bx === 6 || by === 6;
      const outside = bx < 0 || by < 0 || bx > 6 || by > 6;
      if (c.v === 'open' && (onRing || outside)) issues.push({ x: bx, y: by, type: 'openOnRing', id });
      if (c.kind === 'outer' && !onRing) issues.push({ x: bx, y: by, type: 'outerInside', id });
      if (c.kind === 'inner' && onRing) issues.push({ x: bx, y: by, type: 'innerOnRing', id });
      if (!claims.has(k)) claims.set(k, { open: new Set(), wall: new Set(), x: bx, y: by });
      claims.get(k)[c.v].add(id);
    }
  }
  for (const c of claims.values()) {
    if (c.open.size && c.wall.size) issues.push({ x: c.x, y: c.y, type: 'clash', ids: [...c.open, ...c.wall] });
  }
  // start squares may not touch orthogonally
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const A = layers[placed[i]], B = layers[placed[j]];
    const d = Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
    if (d <= 1) issues.push({ x: B.x, y: B.y, type: d === 0 ? 'sameStart' : 'adjStart', ids: [placed[i], placed[j]] });
  }
  // guide / monk results checked against the arrangement (board coordinates; maze = 1..5)
  for (const g of know.guides) {
    const A0 = layers[g.actor], B0 = layers[g.target];
    if (!A0 || !B0) continue;
    const A = { x: A0.x + g.a.x, y: A0.y + g.a.y }, B = { x: B0.x + g.b.x, y: B0.y + g.b.y };
    const same = A.x === B.x && A.y === B.y;
    const ok = same || (g.dir === 'N' ? B.y < A.y : g.dir === 'S' ? B.y > A.y : g.dir === 'E' ? B.x > A.x : B.x < A.x);
    if (!ok) issues.push({ x: A.x, y: A.y, type: 'guide', ids: [g.actor, g.target] });
  }
  for (const m of know.monks) {
    const L = layers[m.actor];
    if (!L) continue;
    let x = L.x + m.local.x, y = L.y + m.local.y;
    const d = DIRS[m.dir];
    let walls = 0, unknown = 0;
    for (;;) {
      x += d.dx; y += d.dy;
      if (x < 1 || y < 1 || x > 5 || y > 5) break;
      const c = claims.get(`${x},${y}`);
      if (c?.wall.size) walls++; else if (!c?.open.size) unknown++;
    }
    if (walls > m.count || m.count > walls + unknown) issues.push({ x: L.x + m.local.x, y: L.y + m.local.y, type: 'monk', ids: [m.actor] });
  }
  return { issues, ok: issues.length === 0, placed: placed.length };
}

// How many positions of `id` are consistent with the frame and the other placed layers.
export function layerCandidates(know, layers, id) {
  const out = [];
  for (let s = 0; s < CELLS; s++) {
    if (!singleFeasible(know, id, s)) continue;
    const trial = { ...layers, [id]: { x: (s % SIZE) + 1, y: Math.floor(s / SIZE) + 1 } };
    const r = boardConflicts(know, trial);
    if (r.ok) out.push({ x: trial[id].x, y: trial[id].y });
  }
  return out;
}

// Project a board coordinate into an explorer's local map coordinate.
export const boardToLocal = (layer, bx, by) => ({ x: bx - layer.x, y: by - layer.y });
export const localToBoard = (layer, lx, ly) => ({ x: lx + layer.x, y: ly + layer.y });

export { DIR_KEYS };
