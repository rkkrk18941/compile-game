import { SIZE, DIRS, DIR_KEYS } from './constants.js';

export const xy = (i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) });
export const idx = (x, y) => y * SIZE + x;
export const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
export const key = (x, y) => `${x},${y}`;
export const parseKey = (k) => { const [x, y] = k.split(',').map(Number); return { x, y }; };

export function manhattan(a, b) {
  const A = xy(a), B = xy(b);
  return Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
}
export function targetIndex(index, dir) {
  const d = DIRS[dir];
  if (!d || index == null) return null;
  const p = xy(index), x = p.x + d.dx, y = p.y + d.dy;
  return inside(x, y) ? idx(x, y) : null;
}
export function neighborEntries(index) {
  return DIR_KEYS.map(dir => ({ dir, index: targetIndex(index, dir) })).filter(n => n.index != null);
}
export function dirBetween(a, b) {
  const A = xy(a), B = xy(b);
  for (const d of DIR_KEYS) if (A.x + DIRS[d].dx === B.x && A.y + DIRS[d].dy === B.y) return d;
  return null;
}

// Shrine exits: I = two opposite directions, L = two adjacent directions.
export function shrineExitDirs(shape = 'I', rotation = 0) {
  const r = ((Number(rotation) % 4) + 4) % 4;
  if (shape === 'L') return [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']][r];
  return r % 2 === 0 ? ['N', 'S'] : ['E', 'W'];
}
export function shrineArrowText(shape, rotation) {
  return shrineExitDirs(shape, rotation).map(d => DIRS[d].sym).join('');
}

// Rooms ("open") are the only cells pieces may stand on. The shrine is a wall for explorers.
export function openNeighbors(board, index) {
  return neighborEntries(index).filter(n => board[n.index] === 'open');
}

// BFS over open cells. Returns Map(index -> distance).
export function bfsOpen(board, sources) {
  const dist = new Map();
  const q = [];
  for (const s of sources) if (s != null && board[s] === 'open' && !dist.has(s)) { dist.set(s, 0); q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], d = dist.get(cur);
    for (const n of openNeighbors(board, cur)) if (!dist.has(n.index)) { dist.set(n.index, d + 1); q.push(n.index); }
  }
  return dist;
}

export function shortestPathOpen(board, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    for (const n of openNeighbors(board, cur)) {
      if (prev.has(n.index)) continue;
      prev.set(n.index, cur);
      if (n.index === to) {
        const path = [to];
        let c = cur;
        while (c != null) { path.push(c); c = prev.get(c); }
        return path.reverse();
      }
      q.push(n.index);
    }
  }
  return null;
}

export function allRoomsConnected(board) {
  const rooms = [];
  board.forEach((v, i) => { if (v === 'open') rooms.push(i); });
  if (!rooms.length) return false;
  return bfsOpen(board, [rooms[0]]).size === rooms.length;
}

export function shuffled(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
