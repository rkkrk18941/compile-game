// Maze generation + quality scoring (used by "random maze" and by the CPU ruins player).
import { CELLS, SIZE } from './constants.js';
import { xy, idx, inside, manhattan, targetIndex, neighborEntries, shrineExitDirs, allRoomsConnected, bfsOpen, shuffled } from './geom.js';

export function setupProblems({ board, shrine, starts, explorerIds }) {
  const out = [];
  const shrineIdx = shrine?.index;
  const walls = board.filter(v => v === 'wall').length;
  out.push({ key: 'shrine', ok: shrineIdx != null && board[shrineIdx] === 'shrine', text: '石室を1マス置く' });
  out.push({ key: 'walls', ok: walls >= 5, text: `内壁を5マス以上（現在 ${walls}）` });
  const startList = explorerIds.map(id => starts[id]);
  const allPlaced = startList.every(s => Number.isInteger(s) && board[s] === 'open');
  out.push({ key: 'starts', ok: allPlaced && new Set(startList).size === startList.length, text: '全員の開始位置を部屋に置く' });
  let adjStart = false, adjShrine = false;
  if (allPlaced) {
    for (let i = 0; i < startList.length; i++) for (let j = i + 1; j < startList.length; j++) if (manhattan(startList[i], startList[j]) === 1) adjStart = true;
    if (shrineIdx != null) for (const s of startList) if (manhattan(s, shrineIdx) === 1) adjShrine = true;
  }
  out.push({ key: 'startAdj', ok: allPlaced && !adjStart, text: '開始位置どうしを縦横に隣接させない' });
  out.push({ key: 'shrineAdj', ok: allPlaced && shrineIdx != null && !adjShrine, text: '開始位置と石室を縦横に隣接させない' });
  let exitsOk = shrineIdx != null;
  if (exitsOk) for (const d of shrineExitDirs(shrine.shape, shrine.rotation)) {
    const t = targetIndex(shrineIdx, d);
    if (t == null || board[t] !== 'open') exitsOk = false;
  }
  out.push({ key: 'exits', ok: exitsOk, text: '石室の矢印の先を部屋にする' });
  out.push({ key: 'connected', ok: allRoomsConnected(board), text: 'すべての部屋をひと続きにする' });
  return out;
}

export function isValidSetup(s) { return setupProblems(s).every(p => p.ok); }

// Score how interesting/hard a maze is for explorers (higher = harder / more devious).
export function scoreMaze({ board, shrine, starts, explorerIds }) {
  let score = 0;
  const walls = board.filter(v => v === 'wall').length;
  score -= Math.abs(walls - 6.5) * 0.6;
  // Long straight open lines reveal the outer walls instantly.
  for (let y = 0; y < SIZE; y++) {
    let run = 0, best = 0;
    for (let x = 0; x < SIZE; x++) { run = board[idx(x, y)] === 'open' ? run + 1 : 0; best = Math.max(best, run); }
    if (best >= 5) score -= 2.4; else if (best === 4) score -= 0.5;
  }
  for (let x = 0; x < SIZE; x++) {
    let run = 0, best = 0;
    for (let y = 0; y < SIZE; y++) { run = board[idx(x, y)] === 'open' ? run + 1 : 0; best = Math.max(best, run); }
    if (best >= 5) score -= 2.4; else if (best === 4) score -= 0.5;
  }
  // Diagonal walls make explorers bump into walls more often.
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 'wall') continue;
    const p = xy(i);
    for (const [dx, dy] of [[1, 1], [-1, 1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (inside(x, y) && board[idx(x, y)] === 'wall') score += 0.45;
    }
  }
  // Dead ends and loops.
  let open = 0, edges = 0, deadEnds = 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 'open') continue;
    open++;
    const n = neighborEntries(i).filter(e => board[e.index] === 'open').length;
    edges += n;
    if (n === 1) deadEnds++;
  }
  edges /= 2;
  const loops = Math.max(0, edges - open + 1);
  score += Math.min(deadEnds, 4) * 0.55;
  score += Math.min(loops, 3) * 0.7;
  // Start positions far apart (by walking distance).
  const st = explorerIds.map(id => starts[id]).filter(Number.isInteger);
  let minD = 99, sumD = 0, pairs = 0;
  for (let i = 0; i < st.length; i++) {
    const d = bfsOpen(board, [st[i]]);
    for (let j = i + 1; j < st.length; j++) {
      const v = d.get(st[j]) ?? 12;
      minD = Math.min(minD, v); sumD += v; pairs++;
    }
  }
  if (pairs) score += Math.min(minD, 6) * 0.7 + (sumD / pairs) * 0.25;
  // Guards should be able to reach the explorers' area.
  if (shrine?.index != null) {
    const exits = shrineExitDirs(shrine.shape, shrine.rotation).map(d => targetIndex(shrine.index, d)).filter(i => i != null && board[i] === 'open');
    const dist = bfsOpen(board, exits);
    const ds = st.map(s => (dist.get(s) ?? 9) + 1);
    const avg = ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length);
    score -= Math.abs(avg - 4) * 0.35;
  }
  return score;
}

function randomCandidate(explorerIds, rnd, opts = {}) {
  const minWalls = opts.minWalls ?? 5, maxWalls = opts.maxWalls ?? 8;
  const board = Array(CELLS).fill('open');
  const cells = shuffled(Array.from({ length: CELLS }, (_, i) => i), rnd);
  const wallCount = minWalls + Math.floor(rnd() * (maxWalls - minWalls + 1));
  for (const w of cells.slice(0, wallCount)) board[w] = 'wall';
  const shrineIndex = cells[wallCount];
  board[shrineIndex] = 'shrine';
  const shape = rnd() < 0.5 ? 'I' : 'L';
  const rotation = Math.floor(rnd() * 4);
  const shrine = { index: shrineIndex, shape, rotation, under: 'open' };
  for (const d of shrineExitDirs(shape, rotation)) {
    const t = targetIndex(shrineIndex, d);
    if (t == null || board[t] !== 'open') return null;
  }
  if (!allRoomsConnected(board)) return null;
  const candidates = shuffled(cells.filter(i => board[i] === 'open' && manhattan(i, shrineIndex) !== 1), rnd);
  const picked = [];
  for (const c of candidates) {
    if (picked.every(p => manhattan(p, c) !== 1)) picked.push(c);
    if (picked.length === explorerIds.length) break;
  }
  if (picked.length !== explorerIds.length) return null;
  const starts = Object.fromEntries(explorerIds.map((id, i) => [id, picked[i]]));
  return { board, shrine, starts, explorerIds };
}

// Better start placement for a fixed maze: try every combination and keep the best scoring one.
function bestStartsFor(setup, rnd, level) {
  const { board, shrine, explorerIds } = setup;
  const options = [];
  for (let i = 0; i < CELLS; i++) if (board[i] === 'open' && manhattan(i, shrine.index) !== 1) options.push(i);
  let best = null;
  const tries = level === 'hard' ? 260 : 90;
  for (let t = 0; t < tries; t++) {
    const pick = [];
    for (const c of shuffled(options, rnd)) {
      if (pick.every(p => manhattan(p, c) !== 1)) pick.push(c);
      if (pick.length === explorerIds.length) break;
    }
    if (pick.length !== explorerIds.length) continue;
    const starts = Object.fromEntries(explorerIds.map((id, i) => [id, pick[i]]));
    const s = scoreMaze({ ...setup, starts });
    if (!best || s > best.s) best = { s, starts };
  }
  return best?.starts || setup.starts;
}

// level: 'easy' | 'normal' | 'hard' | 'random'
export function generateSetup(explorerIds, { level = 'normal', rnd = Math.random, samples } = {}) {
  const opts = level === 'easy' ? { minWalls: 5, maxWalls: 6 } : level === 'hard' ? { minWalls: 6, maxWalls: 8 } : { minWalls: 5, maxWalls: 8 };
  const want = samples ?? (level === 'random' ? 1 : level === 'easy' ? 25 : level === 'hard' ? 260 : 110);
  const pool = [];
  for (let tries = 0; tries < 20000 && pool.length < want; tries++) {
    const c = randomCandidate(explorerIds, rnd, opts);
    if (c) pool.push(c);
  }
  if (!pool.length) return null;
  if (level === 'random') return pool[0];
  for (const c of pool) c.score = scoreMaze(c);
  pool.sort((a, b) => b.score - a.score);
  let chosen;
  if (level === 'easy') chosen = pool[pool.length - 1 - Math.floor(rnd() * Math.min(6, pool.length))];
  else if (level === 'hard') chosen = pool[Math.floor(rnd() * Math.min(3, pool.length))];
  else chosen = pool[Math.floor(rnd() * Math.min(12, pool.length))];
  if (level !== 'easy') chosen = { ...chosen, starts: bestStartsFor(chosen, rnd, level) };
  return chosen;
}

// Hand-made sample mazes for the ruins player ("おすすめ迷宮"). Letters: . room, # wall, S shrine.
// Shrine shape/rotation and suggested starts per explorer slot.
export const PRESET_MAZES = [
  {
    name: '回廊', note: '外周をぐるりと回る通路と中央の壁。待ち伏せしやすい。',
    rows: ['.....', '.#.#.', '..S..', '.#.#.', '....#'], shape: 'I', rotation: 1, starts: [0, 14, 22],
  },
  {
    name: '斜めの壁', note: '斜めに並んだ内壁で、探索が何度も止まる。',
    rows: ['....#', '.#...', '..#S.', '#..#.', '...#.'], shape: 'L', rotation: 0, starts: [0, 21, 9],
  },
  {
    name: '袋小路', note: '行き止まりが多く、迷宮マスを無駄遣いさせる。',
    rows: ['..#..', '#.#.#', '..S..', '#.#.#', '.....'], shape: 'I', rotation: 1, starts: [0, 4, 22],
  },
  {
    name: '双子の部屋', note: '左右が似た構造。脱出失敗を誘う意地悪な迷宮。',
    rows: ['.#.#.', '.....', '#.S.#', '.....', '.#.#.'], shape: 'I', rotation: 0, starts: [0, 9, 24],
  },
];

export function presetToSetup(preset, explorerIds) {
  const board = Array(CELLS).fill('open');
  let shrineIndex = null;
  preset.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const i = idx(x, y);
    if (ch === '#') board[i] = 'wall';
    else if (ch === 'S') { board[i] = 'shrine'; shrineIndex = i; }
  }));
  const shrine = { index: shrineIndex, shape: preset.shape, rotation: preset.rotation, under: 'open' };
  const starts = Object.fromEntries(explorerIds.map((id, i) => [id, preset.starts[i]]));
  return { board, shrine, starts, explorerIds };
}
