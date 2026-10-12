// ─────────────────────────────────────────────────────────────
//  MIST MAZE — authoritative rules engine
//  Runs only on the host device. All functions mutate `state` and throw a
//  RuleError (Japanese message) when an action is not allowed.
// ─────────────────────────────────────────────────────────────
import {
  PROTOCOL, SIZE, CELLS, ROOM_ALPHABET, DIRS, DIR_KEYS, EXPLORER_DEFS, CHARACTERS, CHARACTER_MAP,
  TIME_PRESETS, officialStacks, AUTO_TURN_MS, ENCOUNTER_MS, MAX_EXPLORER_SEATS, MAX_CHAT, MAX_EVENTS, MAX_LOG, MARK_KINDS,
} from './constants.js';
import { xy, idx, inside, key, manhattan, targetIndex, neighborEntries, shrineExitDirs, bfsOpen, shuffled } from './geom.js';
import { setupProblems, generateSetup, presetToSetup, PRESET_MAZES } from './mazegen.js';

export class RuleError extends Error { constructor(msg) { super(msg); this.name = 'RuleError'; } }
const fail = (msg) => { throw new RuleError(msg); };

// ───────────── helpers ─────────────
export function randomToken(length = 12) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  return out;
}
export const normalizeRoomCode = (v = '') => String(v).trim().toUpperCase().replace(/[\s\-‐-―]+/g, '');
export const validRoomCode = (code) => { const s = normalizeRoomCode(code); return s.length === 7 && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(s); };
export const cleanName = (v = '') => String(v).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'PLAYER';

function nextId(state, prefix) { state.idSeq = (state.idSeq || 0) + 1; return `${prefix}${state.idSeq.toString(36)}`; }
export function touch(state) { state.updatedAt = Date.now(); state.revision = (state.revision || 0) + 1; }

export function addLog(state, text, kind = 'info', aud = 'all') {
  state.log.push({ id: nextId(state, 'l'), t: Date.now(), r: state.round, text, kind, aud });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
// Events drive client-side effects. `aud`: 'all' | 'ruins' | 'explorers' | 'c:<clientId>'
export function emit(state, kind, data = {}, aud = 'all') {
  state.events.push({ id: nextId(state, 'e'), t: Date.now(), r: state.round, kind, aud, ...data });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}
function addIntel(state, entry) {
  state.intel.push({ id: nextId(state, 'i'), t: Date.now(), round: state.round, phase: state.phase + 1, ...entry });
  if (state.intel.length > 80) state.intel.shift();
}
const explorerName = (e) => `${e.label}`;
export function explorerOf(state, id) { const e = state.explorers[id]; if (!e) fail('探検家が見つかりません。'); return e; }
function guardOf(state, id) { const g = state.guards.find(x => x.id === id); if (!g) fail('衛兵が見つかりません。'); return g; }
function requireStage(state, ...stages) { if (!stages.includes(state.stage)) fail('今はその操作はできません。'); }
export function seatOf(state, clientId) { return state.seats.find(s => s.clientId === clientId) || null; }
export function isRuins(state, clientId) { return state.ruinsClientId === clientId; }
export function ownedIds(state, clientId) { return Object.values(state.explorers).filter(e => e.ownerClientId === clientId).map(e => e.id); }
export function explorerVoters(state) { return [...new Set(Object.values(state.explorers).map(e => e.ownerClientId))]; }
function requireOwner(state, clientId, eid) { const e = explorerOf(state, eid); if (e.ownerClientId !== clientId) fail('この探検家は操作できません。'); return e; }
function requireActive(state, clientId, eid) {
  requireStage(state, 'explorerTurns');
  const e = requireOwner(state, clientId, eid);
  if (state.activeExplorerId !== eid) fail('この探検家の手番ではありません。');
  if (state.pendingAbility) fail('遺跡役の応答を待っています。');
  return e;
}
const charName = (k) => CHARACTER_MAP[k]?.name || k;

// ───────────── time ─────────────
export function totalTimeRemaining(state) {
  if (state.timeExpired) return 0;
  let t = state.phaseRemaining;
  for (let i = state.phase + 1; i < state.options.timeStacks.length; i++) t += state.options.timeStacks[i];
  return t;
}

// Take `amount` maze tiles from the lowest phase stack, processing phase ends immediately.
export function consumeTime(state, amount, reason, meta = {}) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  let taken = 0;
  while (left > 0 && !state.timeExpired) {
    const take = Math.min(left, state.phaseRemaining);
    state.phaseRemaining -= take; left -= take; taken += take;
    if (state.phaseRemaining === 0) endPhase(state);
  }
  if (taken) {
    state.stats.timeBy[meta.cause || 'other'] = (state.stats.timeBy[meta.cause || 'other'] || 0) + taken;
    addLog(state, `${reason}：時間 −${taken}`, 'time');
    emit(state, 'time', { amount: taken, reason, cause: meta.cause || 'other', eid: meta.eid || null });
  }
  return taken;
}

function endPhase(state) {
  const ended = state.phase; // 0-based index of the phase that just emptied
  if (ended >= 3) {
    state.timeExpired = true;
    state.phaseRemaining = 0;
    addLog(state, '迷宮マスがすべて尽きた。最後の脱出の機会だけが残る。', 'danger');
    emit(state, 'phase', { phase: 5, ended: 4 });
    return;
  }
  state.phase += 1;
  state.phaseRemaining = state.options.timeStacks[state.phase];
  state.baseMoveTokens = 2 + state.phase;
  if (state.stage === 'ruinsTurn') state.moveRemaining += 1;
  if (ended === 0) {
    state.guards.push(newGuard(state, 'guard'));
    addLog(state, 'フェイズ2へ。移動トークン+1、衛兵が石室に追加された。', 'phase');
  } else if (ended === 1) {
    for (const e of Object.values(state.explorers)) e.fatigue = false;
    addLog(state, 'フェイズ3へ。移動トークン+1、探検家全員の疲労が回復した。', 'phase');
  } else if (ended === 2) {
    state.guards.push(newGuard(state, 'guardian'));
    addLog(state, 'フェイズ4へ。移動トークン+1、守護神が石室に現れた。', 'phase');
  }
  emit(state, 'phase', { phase: state.phase + 1, ended: ended + 1 });
}

function newGuard(state, type) {
  const g = { id: nextId(state, type === 'guardian' ? 'k' : 'g'), type, pos: state.shrine.index, leftShrine: false, immobilizedRound: null };
  state.history.guards.push({ r: state.round, id: g.id, type, p: g.pos, k: 'spawn' });
  return g;
}

// ───────────── room / lobby ─────────────
export function createRoom({ roomCode, hostClientId, hostName, ruinsCpu = null }) {
  const code = normalizeRoomCode(roomCode || randomToken(7));
  if (!validRoomCode(code) && !code.startsWith('CPU')) fail('ルームコードが不正です。');
  const now = Date.now();
  const state = {
    protocol: PROTOCOL, roomCode: code, createdAt: now, updatedAt: now, revision: 0, idSeq: 0,
    status: 'lobby', stage: 'lobby', round: 0, finalRound: false,
    hostClientId, ruinsClientId: null,
    seats: [],
    options: {
      explorerCount: 2, timePreset: 'legacy', customStacks: [13, 13, 12, 12], timeStacks: [13, 13, 12, 12],
      revealTeamTalk: true, assist: 'standard', encounterPolicy: 'ask', cpuLevel: ruinsCpu || 'normal',
    },
    board: Array(CELLS).fill('open'), shrine: { index: 12, shape: 'I', rotation: 0, under: 'open' }, starts: {},
    explorers: {}, guards: [],
    activeExplorerId: null, doneExplorers: [], turnRequests: {}, turnClaimDeadline: null, turnSeq: 0,
    phase: 0, phaseRemaining: 13, timeExpired: false,
    baseMoveTokens: 2, moveRemaining: 0, movesUsed: 0,
    lastMovedPieceId: null, attackOpportunityUsed: false,
    pendingEncounters: [], pendingAbility: null, pendingNormalAttack: null, pendingEndRuins: false,
    escapeVotes: {},
    clue: null,
    intel: [], teamBoard: { layers: {}, marks: [], rev: 0 },
    chat: [], events: [], log: [],
    history: { pos: {}, guards: [] },
    stats: { timeBy: {}, attacks: 0, hits: 0, blocks: 0, superHits: 0, encounters: 0, rounds: 0 },
    winner: null, resultText: null, score: null, endReason: null,
  };
  if (ruinsCpu) {
    state.seats.push({ clientId: 'cpu-ruins', name: 'CPU 遺跡役', role: 'ruins', connected: true, joinedAt: now, cpu: ruinsCpu });
    state.ruinsClientId = 'cpu-ruins';
    state.seats.push({ clientId: hostClientId, name: cleanName(hostName), role: 'explorer', connected: true, joinedAt: now, cpu: null });
  } else {
    state.seats.push({ clientId: hostClientId, name: cleanName(hostName), role: 'ruins', connected: true, joinedAt: now, cpu: null });
    state.ruinsClientId = hostClientId;
  }
  addLog(state, `${cleanName(hostName)} が部屋を作成しました。`);
  touch(state);
  return state;
}

export function joinRoom(state, clientId, name) {
  const existing = seatOf(state, clientId);
  if (existing) {
    existing.connected = true;
    if (name) existing.name = cleanName(name);
    touch(state);
    return existing;
  }
  if (state.status !== 'lobby') fail('ゲーム開始後は新しく参加できません。');
  if (state.seats.filter(s => s.role === 'explorer').length >= MAX_EXPLORER_SEATS) fail('この部屋は満員です。');
  const seat = { clientId, name: cleanName(name), role: 'explorer', connected: true, joinedAt: Date.now(), cpu: null };
  state.seats.push(seat);
  addLog(state, `${seat.name} が参加しました。`);
  emit(state, 'join', { name: seat.name });
  touch(state);
  return seat;
}

export function addCpuExplorer(state, level = 'normal') {
  requireStage(state, 'lobby');
  if (state.seats.filter(s => s.role === 'explorer').length >= MAX_EXPLORER_SEATS) fail('探検家の席は最大3つです。');
  let n = 1; while (seatOf(state, `cpu-ex-${n}`)) n++;
  const seat = { clientId: `cpu-ex-${n}`, name: `CPU 探検家${n}`, role: 'explorer', connected: true, joinedAt: Date.now(), cpu: level };
  state.seats.push(seat);
  addLog(state, `${seat.name} が参加しました。`);
  touch(state);
  return seat;
}

export function removeSeat(state, clientId) {
  requireStage(state, 'lobby');
  const i = state.seats.findIndex(s => s.clientId === clientId && s.role !== 'ruins' && s.clientId !== state.hostClientId);
  if (i < 0) return false;
  const [seat] = state.seats.splice(i, 1);
  addLog(state, `${seat.name} が退出しました。`);
  touch(state);
  return true;
}

export function setSeatConnected(state, clientId, connected) {
  const s = seatOf(state, clientId);
  if (!s || s.cpu) return false;
  if (s.connected === !!connected) return false;
  s.connected = !!connected;
  emit(state, connected ? 'reconnect' : 'disconnect', { name: s.name });
  touch(state);
  return true;
}

export function setOptions(state, patch = {}) {
  requireStage(state, 'lobby', 'setup');
  const o = state.options;
  if (patch.explorerCount != null && state.stage === 'lobby') o.explorerCount = patch.explorerCount >= 3 ? 3 : 2;
  if (patch.timePreset && TIME_PRESETS[patch.timePreset]) o.timePreset = patch.timePreset;
  if (Array.isArray(patch.customStacks)) {
    const v = patch.customStacks.map(Number);
    if (v.length !== 4 || v.some(n => !Number.isInteger(n) || n < 1 || n > 30)) fail('時間の山は1〜30の整数を4つ指定してください。');
    o.customStacks = v;
  }
  if (patch.revealTeamTalk != null) o.revealTeamTalk = !!patch.revealTeamTalk;
  if (patch.assist && ['off', 'standard', 'strong'].includes(patch.assist)) o.assist = patch.assist;
  if (patch.cpuLevel && ['easy', 'normal', 'hard'].includes(patch.cpuLevel)) {
    o.cpuLevel = patch.cpuLevel;
    for (const s of state.seats) if (s.cpu) s.cpu = patch.cpuLevel;
  }
  resolveTimeStacks(state);
  touch(state);
}

export function setEncounterPolicy(state, policy) {
  if (!['ask', 'always', 'never'].includes(policy)) fail('設定が不正です。');
  state.options.encounterPolicy = policy;
  touch(state);
}

function resolveTimeStacks(state) {
  const o = state.options;
  const n = Object.keys(state.explorers).length || o.explorerCount;
  o.timeStacks = o.timePreset === 'official' ? officialStacks(n) : o.timePreset === 'custom' ? [...o.customStacks] : [...TIME_PRESETS.legacy.stacks];
  if (state.stage === 'lobby' || state.stage === 'setup') { state.phase = 0; state.phaseRemaining = o.timeStacks[0]; }
}

// ───────────── setup ─────────────
export function beginSetup(state) {
  requireStage(state, 'lobby');
  const seats = state.seats.filter(s => s.role === 'explorer');
  if (seats.length < 1) fail('探検家が1人以上必要です。');
  const count = Math.min(3, Math.max(seats.length, state.options.explorerCount));
  state.explorers = {};
  for (let i = 0; i < count; i++) {
    const def = EXPLORER_DEFS[i];
    const owner = seats[i % seats.length];
    state.explorers[def.id] = makeExplorer(def, owner.clientId);
  }
  state.options.explorerCount = count;
  state.status = 'setup'; state.stage = 'setup'; state.round = 0;
  state.board = Array(CELLS).fill('open');
  state.shrine = { index: 12, shape: 'I', rotation: 0, under: 'open' };
  state.starts = {};
  state.intel = []; state.teamBoard = { layers: {}, marks: [], rev: 0 };
  resolveTimeStacks(state);
  randomizeSetup(state, isCpuSeat(state, state.ruinsClientId) ? state.options.cpuLevel : 'normal');
  addLog(state, '迷宮の準備を始めました。探検家はキャラクターを選んでください。', 'phase');
  emit(state, 'stage', { stage: 'setup' });
  touch(state);
}

function makeExplorer(def, ownerClientId) {
  return {
    id: def.id, label: def.label, colorKey: def.colorKey, ownerClientId,
    character: null, characterRevealed: false, fatigue: false,
    pos: null, localPos: { x: 0, y: 0 }, discovered: { '0,0': 'start' }, wallKinds: {},
    blocked: false, alertLocked: false,
    predictionCommit: null, predictionSubmitted: false, predictionRevealed: null,
    normalAttacked: false, superAttacked: false, abilityUses: 0,
    turn: { explores: 0, moves: 0, ability: false },
    stats: { explores: 0, walls: 0, moves: 0, abilities: 0, hitBy: 0, blocked: 0, encounters: 0 },
  };
}
export const isCpuSeat = (state, clientId) => !!seatOf(state, clientId)?.cpu;

export function setCharacter(state, clientId, eid, charKey) {
  requireStage(state, 'setup');
  const e = requireOwner(state, clientId, eid);
  if (!CHARACTER_MAP[charKey]) fail('キャラクターが不正です。');
  const taken = Object.values(state.explorers).find(o => o.id !== eid && o.character === charKey);
  if (taken) fail(`${charName(charKey)}は${taken.label}の探検家が選んでいます。`);
  e.character = charKey;
  emit(state, 'character', { eid }, 'explorers');
  touch(state);
}

function requireRuinsSetup(state, clientId) {
  requireStage(state, 'setup');
  if (!isRuins(state, clientId)) fail('迷宮を編集できるのは遺跡役だけです。');
}

export function setupSetCell(state, clientId, cell, tool) {
  requireRuinsSetup(state, clientId);
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) fail('マスが不正です。');
  const clearStartAt = (c) => { for (const k of Object.keys(state.starts)) if (state.starts[k] === c) delete state.starts[k]; };
  if (tool === 'open' || tool === 'wall') {
    if (state.shrine.index === cell) { state.shrine.index = null; }
    clearStartAt(cell);
    state.board[cell] = tool;
  } else if (tool === 'toggle') {
    if (state.shrine.index === cell) return setupSetCell(state, clientId, cell, 'open');
    clearStartAt(cell);
    state.board[cell] = state.board[cell] === 'wall' ? 'open' : 'wall';
  } else if (tool === 'shrine') {
    clearStartAt(cell);
    if (state.shrine.index != null && state.shrine.index !== cell) state.board[state.shrine.index] = 'open';
    state.shrine.index = cell;
    state.board[cell] = 'shrine';
  } else if (state.explorers[tool]) {
    if (state.board[cell] !== 'open') fail('開始位置は部屋マスに置いてください。');
    clearStartAt(cell);
    state.starts[tool] = cell;
  } else fail('編集ツールが不正です。');
  touch(state);
}

export function setShrineStyle(state, clientId, shape, rotation) {
  requireRuinsSetup(state, clientId);
  if (shape && !['I', 'L'].includes(shape)) fail('石室の形が不正です。');
  if (shape) state.shrine.shape = shape;
  if (rotation != null) state.shrine.rotation = ((Number(rotation) % 4) + 4) % 4;
  if (state.shrine.shape === 'I') state.shrine.rotation %= 2;
  touch(state);
}

export function randomizeSetup(state, level = 'normal') {
  const ids = Object.keys(state.explorers);
  if (!ids.length) return false;
  const s = generateSetup(ids, { level });
  if (!s) return false;
  state.board = s.board; state.shrine = s.shrine; state.starts = s.starts;
  touch(state);
  return true;
}

export function applyPresetMaze(state, clientId, presetIndex) {
  requireRuinsSetup(state, clientId);
  const p = PRESET_MAZES[presetIndex];
  if (!p) fail('おすすめ迷宮が見つかりません。');
  const s = presetToSetup(p, Object.keys(state.explorers));
  state.board = s.board; state.shrine = s.shrine; state.starts = s.starts;
  touch(state);
}

export function clearSetup(state, clientId) {
  requireRuinsSetup(state, clientId);
  state.board = Array(CELLS).fill('open');
  state.shrine = { index: null, shape: state.shrine.shape, rotation: state.shrine.rotation, under: 'open' };
  state.starts = {};
  touch(state);
}

export function setupChecks(state) {
  const checks = setupProblems({ board: state.board, shrine: state.shrine, starts: state.starts, explorerIds: Object.keys(state.explorers) });
  checks.push({ key: 'chars', ok: Object.values(state.explorers).every(e => !!e.character), text: '探検家全員がキャラクターを選ぶ' });
  return checks;
}
export function validateSetup(state) {
  const bad = setupChecks(state).find(c => !c.ok);
  return bad ? bad.text : null;
}

// Shortest number of steps for the guard in the shrine to reach the explorer's start.
export function shrineDistance(state, eid) {
  const target = state.starts[eid];
  if (target == null || state.shrine.index == null) return Infinity;
  const exits = shrineExitDirs(state.shrine.shape, state.shrine.rotation)
    .map(d => targetIndex(state.shrine.index, d)).filter(i => i != null && state.board[i] === 'open');
  const dist = bfsOpen(state.board, exits);
  const d = dist.get(target);
  return d == null ? Infinity : d + 1;
}

export function startGame(state, clientId, clueExplorerId) {
  requireRuinsSetup(state, clientId);
  const problem = validateSetup(state);
  if (problem) fail(`まだ開始できません：${problem}`);
  if (!state.explorers[clueExplorerId]) fail('最初の手掛かりを伝える探検家を選んでください。');
  for (const e of Object.values(state.explorers)) {
    e.pos = state.starts[e.id];
    e.localPos = { x: 0, y: 0 };
    e.discovered = { '0,0': 'start' };
    e.wallKinds = {};
    e.blocked = false;
    e.fatigue = e.character === 'apprentice';
    e.alertLocked = false;
    e.characterRevealed = true;
    e.abilityUses = 0;
    state.history.pos[e.id] = [{ r: 1, p: e.pos, k: 'start' }];
  }
  state.guards = [];
  state.guards.push(newGuard(state, 'guard'));
  state.phase = 0;
  state.phaseRemaining = state.options.timeStacks[0];
  state.timeExpired = false;
  state.baseMoveTokens = 2;
  state.moveRemaining = 0;
  state.round = 1;
  state.status = 'playing';
  const distance = shrineDistance(state, clueExplorerId);
  const ce = state.explorers[clueExplorerId];
  state.clue = { explorerId: clueExplorerId, distance };
  addIntel(state, { kind: 'clue', target: clueExplorerId, distance });
  addLog(state, `最初の手掛かり：石室の衛兵から${ce.label}の探検家まで、最短 ${distance} マス。`, 'clue');
  emit(state, 'start', { clue: { target: clueExplorerId, distance } });
  startExplorerPhase(state);
  touch(state);
}

// ───────────── explorer phase & turn order ─────────────
function startExplorerPhase(state) {
  state.stage = 'explorerTurns';
  state.activeExplorerId = null;
  state.doneExplorers = [];
  state.turnRequests = {};
  state.finalRound = !!state.timeExpired;
  for (const e of Object.values(state.explorers)) { e.blocked = false; e.turn = { explores: 0, moves: 0, ability: false }; }
  state.stats.rounds = state.round;
  if (state.finalRound) {
    addLog(state, `第${state.round}ラウンド（最終）：迷宮マスは尽きた。探索はできないが、移動と能力で最後の合流を目指せ。`, 'danger');
  } else {
    addLog(state, `第${state.round}ラウンド：探検家の手番。誰から動くか相談して決めましょう。`, 'phase');
  }
  emit(state, 'round', { round: state.round, final: state.finalRound });
  armTurnClaim(state);
}

function remainingIds(state) { return Object.keys(state.explorers).filter(id => !state.doneExplorers.includes(id)); }

function armTurnClaim(state) {
  const rest = remainingIds(state);
  const owners = new Set(rest.map(id => state.explorers[id].ownerClientId));
  // If every remaining explorer belongs to one player, they simply choose — no countdown.
  state.turnClaimDeadline = owners.size > 1 ? Date.now() + AUTO_TURN_MS : null;
}

function activate(state, eid, how) {
  const e = explorerOf(state, eid);
  state.activeExplorerId = eid;
  state.turnClaimDeadline = null;
  delete state.turnRequests[eid];
  e.blocked = false;
  e.turn = { explores: 0, moves: 0, ability: false };
  state.turnSeq += 1;
  const owner = seatOf(state, e.ownerClientId);
  const why = how === 'pass' ? '（指名）' : how === 'auto' ? '（自動決定）' : how === 'hand' ? '（手番希望）' : '';
  addLog(state, `${e.label}の探検家（${owner?.name || 'PLAYER'}）の手番${why}`, 'turn');
  emit(state, 'turn', { eid, how });
}

export function claimTurn(state, clientId, eid) {
  requireStage(state, 'explorerTurns');
  requireOwner(state, clientId, eid);
  if (state.doneExplorers.includes(eid)) fail('このラウンドの手番は終わっています。');
  if (state.activeExplorerId) fail('別の探検家が手番中です。');
  activate(state, eid, 'claim');
  touch(state);
}

export function requestTurn(state, clientId, eid, wants = true) {
  requireStage(state, 'explorerTurns');
  requireOwner(state, clientId, eid);
  if (state.doneExplorers.includes(eid)) fail('このラウンドは行動済みです。');
  if (state.activeExplorerId === eid) fail('いまはあなたの手番です。');
  if (wants) state.turnRequests[eid] = Date.now(); else delete state.turnRequests[eid];
  emit(state, 'hand', { eid, wants: !!wants }, 'explorers');
  touch(state);
}

export function autoAssignTurn(state, now = Date.now(), force = false) {
  if (state.stage !== 'explorerTurns' || state.activeExplorerId || state.pendingAbility) return null;
  if (!force && (!state.turnClaimDeadline || now < state.turnClaimDeadline)) return null;
  const rest = remainingIds(state);
  if (!rest.length) return null;
  const hands = rest.filter(id => state.turnRequests[id]).sort((a, b) => state.turnRequests[a] - state.turnRequests[b]);
  const pick = hands[0] || rest[Math.floor(Math.random() * rest.length)];
  activate(state, pick, hands[0] ? 'hand' : 'auto');
  touch(state);
  return pick;
}

export function endExplorerTurn(state, clientId, eid, nextEid = null) {
  const e = requireActive(state, clientId, eid);
  const rest = remainingIds(state).filter(id => id !== eid);
  if (nextEid && !rest.includes(nextEid)) fail('その探検家には手番を渡せません。');
  addLog(state, `${e.label}の探検家が手番を終えた。`, 'turn');
  finishExplorer(state, eid, nextEid);
  touch(state);
}

function finishExplorer(state, eid, nextEid = null) {
  if (!state.doneExplorers.includes(eid)) state.doneExplorers.push(eid);
  delete state.turnRequests[eid];
  state.activeExplorerId = null;
  emit(state, 'turnEnd', { eid });
  const rest = remainingIds(state);
  if (!rest.length) return afterExplorerTurns(state);
  if (nextEid && rest.includes(nextEid)) return activate(state, nextEid, 'pass');
  if (rest.length === 1) return activate(state, rest[0], 'auto');
  const hands = rest.filter(id => state.turnRequests[id]).sort((a, b) => state.turnRequests[a] - state.turnRequests[b]);
  if (hands.length) return activate(state, hands[0], 'hand');
  armTurnClaim(state);
}

function afterExplorerTurns(state) {
  // Encounter decisions never block explorers. Undecided ones stay open through the escape talk and
  // the predictions (the ruins player keeps their full window) and resolve before the ruins turn.
  state.activeExplorerId = null;
  state.turnClaimDeadline = null;
  state.turnRequests = {};
  state.escapeVotes = {};
  state.stage = state.timeExpired ? 'finalEscape' : 'escape';
  if (state.timeExpired) addLog(state, '時間は尽きた。最後の脱出に挑むしかない。', 'danger');
  else addLog(state, '探検家全員の手番が終わった。脱出に挑むか相談しよう。', 'phase');
  emit(state, 'stage', { stage: state.stage });
}

// Auto-end when a wall has stopped the explorer and no ability is left to use.
function autoEndIfSpent(state, eid) {
  const e = state.explorers[eid];
  if (state.stage !== 'explorerTurns' || state.activeExplorerId !== eid) return false;
  if (state.pendingAbility) return false;
  if (!e.blocked || !e.fatigue) return false;
  addLog(state, `${e.label}は壁で足止めされ、能力も使用済みのため手番を終えた。`, 'turn');
  finishExplorer(state, eid, null);
  return true;
}

// ───────────── explorer actions ─────────────
function localTarget(e, dir) { const d = DIRS[dir]; return { x: e.localPos.x + d.dx, y: e.localPos.y + d.dy }; }

export function explore(state, clientId, eid, dir) {
  const e = requireActive(state, clientId, eid);
  if (!DIRS[dir]) fail('方角が不正です。');
  if (e.blocked) fail('壁に当たったため、この手番はもう探索・移動できません。');
  const lt = localTarget(e, dir), k = key(lt.x, lt.y);
  if (e.discovered[k]) fail('そのマスは判明済みです。部屋なら「移動」できます。');
  if (totalTimeRemaining(state) <= 0) fail('迷宮マスが残っていないため探索できません。');
  const from = e.pos;
  const actual = targetIndex(e.pos, dir);
  const isRoom = actual != null && state.board[actual] === 'open';
  consumeTime(state, 1, `${e.label}の探索`, { cause: 'explore', eid });
  e.turn.explores++; e.stats.explores++;
  if (isRoom) {
    e.discovered[k] = 'open';
    e.pos = actual; e.localPos = lt;
    state.history.pos[eid].push({ r: state.round, p: actual, k: 'explore' });
    addLog(state, `${e.label}：${DIRS[dir].label}は部屋。進んだ。`, 'explore', 'all');
    emit(state, 'explore', { eid, dir, result: 'open', lx: lt.x, ly: lt.y });
    afterMove(state, eid, from);
    touch(state);
    return { result: 'open' };
  }
  e.discovered[k] = 'wall';
  e.blocked = true; e.stats.walls++;
  addLog(state, `${e.label}：${DIRS[dir].label}は壁。この手番はもう探索・移動できない。`, 'explore');
  emit(state, 'explore', { eid, dir, result: 'wall', lx: lt.x, ly: lt.y });
  const autoEnded = autoEndIfSpent(state, eid);
  touch(state);
  return { autoEnded, result: 'wall' };
}

export function moveExplorer(state, clientId, eid, dir) {
  return movePath(state, clientId, eid, [dir]);
}

// Move along known rooms (one or more steps). Moving is free.
export function movePath(state, clientId, eid, dirs) {
  const e = requireActive(state, clientId, eid);
  if (e.blocked) fail('壁に当たったため、この手番はもう探索・移動できません。');
  if (!Array.isArray(dirs) || !dirs.length || dirs.length > 30) fail('移動経路が不正です。');
  let p = { ...e.localPos };
  for (const d of dirs) {
    if (!DIRS[d]) fail('方角が不正です。');
    p = { x: p.x + DIRS[d].dx, y: p.y + DIRS[d].dy };
    const v = e.discovered[key(p.x, p.y)];
    if (v !== 'open' && v !== 'start') fail('移動できるのは自分の地図で判明済みの部屋だけです。');
  }
  for (const d of dirs) {
    const from = e.pos, actual = targetIndex(e.pos, d);
    if (actual == null || state.board[actual] !== 'open') fail('地図の同期エラー：移動先が部屋ではありません。');
    e.pos = actual; e.localPos = localTarget(e, d);
    e.turn.moves++; e.stats.moves++;
    state.history.pos[eid].push({ r: state.round, p: actual, k: 'move' });
    emit(state, 'move', { eid, dir: d, lx: e.localPos.x, ly: e.localPos.y });
    afterMove(state, eid, from);
  }
  touch(state);
  return { steps: dirs.length };
}

// Entering a room that holds a guard or the guardian lets the ruins player declare an "encounter".
// The decision never blocks the explorer (a pause would leak where the guards are).
function afterMove(state, eid) {
  const e = state.explorers[eid];
  const enemies = state.guards.filter(g => g.pos === e.pos);
  if (!enemies.length || state.timeExpired) return;
  const cpuRuins = isCpuSeat(state, state.ruinsClientId);
  const policy = state.options.encounterPolicy;
  if (!cpuRuins && policy === 'always') return declareEncounter(state, eid, { ...e.localPos });
  if (!cpuRuins && policy === 'never') return;
  const q = { id: nextId(state, 'q'), explorerId: eid, at: e.pos, local: { ...e.localPos }, round: state.round, enemyIds: enemies.map(g => g.id), deadline: Date.now() + ENCOUNTER_MS };
  state.pendingEncounters.push(q);
  emit(state, 'encounterCheck', { eid, qid: q.id }, 'ruins');
}

function declareEncounter(state, eid, local) {
  const e = state.explorers[eid];
  state.stats.encounters++; e.stats.encounters++;
  addLog(state, `遭遇！ ${e.label}の探検家が霧の中で敵とすれ違った。`, 'encounter');
  addIntel(state, { kind: 'encounter', target: eid, local: local || { ...e.localPos } });
  emit(state, 'encounter', { eid });
  consumeTime(state, 1, `${e.label}の遭遇`, { cause: 'encounter', eid });
}

export function resolveEncounter(state, clientId, qid, declare) {
  if (!isRuins(state, clientId)) fail('遭遇を判断できるのは遺跡役だけです。');
  const i = state.pendingEncounters.findIndex(q => q.id === qid);
  if (i < 0) fail('その遭遇の確認はもう終わっています。');
  const [q] = state.pendingEncounters.splice(i, 1);
  if (declare && !state.timeExpired) declareEncounter(state, q.explorerId, q.local);
  touch(state);
}

// Undecided encounters default to "declare" once their deadline passes.
export function expireEncounters(state, now = Date.now()) {
  let changed = false;
  for (const q of [...state.pendingEncounters]) {
    if (q.deadline > now) continue;
    state.pendingEncounters.splice(state.pendingEncounters.indexOf(q), 1);
    if (!state.timeExpired && state.status === 'playing') declareEncounter(state, q.explorerId, q.local);
    changed = true;
  }
  if (changed) touch(state);
  return changed;
}

// ───────────── abilities ─────────────
function unknownNeighbors(e) { return DIR_KEYS.filter(d => { const t = localTarget(e, d); return !e.discovered[key(t.x, t.y)]; }); }

export function abilityStatus(state, eid) {
  // Used by UIs to explain why an ability can't be used right now.
  const e = state.explorers[eid];
  if (!e?.character) return { ok: false, why: 'キャラクター未設定' };
  if (e.fatigue) return { ok: false, why: '疲労中（フェイズ2終了時か医師で回復）' };
  return { ok: true };
}

export function useAbility(state, clientId, eid, payload = {}) {
  const e = requireActive(state, clientId, eid);
  if (!e.character) fail('キャラクターが未設定です。');
  if (e.fatigue) fail('疲労しているため能力を使えません。');
  return runAbility(state, e, e.character, payload, false);
}

function runAbility(state, e, charKey, payload, viaApprentice) {
  switch (charKey) {
    case 'geographer': return abGeographer(state, e, payload, viaApprentice);
    case 'archaeologist': return abArchaeologist(state, e, payload, viaApprentice);
    case 'doctor': return abDoctor(state, e, payload, viaApprentice);
    case 'monk': return abMonk(state, e, payload, viaApprentice);
    case 'guide': return abGuide(state, e, payload, viaApprentice);
    case 'mercenary': return abMercenary(state, e, payload, viaApprentice);
    case 'apprentice':
      if (viaApprentice) fail('見習いの能力は複製できません。');
      return abApprentice(state, e, payload);
    default: fail('能力が不明です。');
  }
}

function markUsed(state, e, charKey, viaApprentice) {
  e.fatigue = true; e.abilityUses++; e.stats.abilities++; e.turn.ability = true;
  addLog(state, `${e.label}が「${charName(charKey)}」の能力を使った${viaApprentice ? '（見習いが複製）' : ''}。`, 'ability');
}

function abGeographer(state, e, payload, via) {
  const avail = unknownNeighbors(e);
  if (avail.length < 2) fail('隣接する未確認マスが2か所以上ないと使えません。');
  if (totalTimeRemaining(state) < 2) fail('迷宮マスが2枚以上残っていないと使えません。');
  const dirs = Array.isArray(payload.dirs) ? [...new Set(payload.dirs)] : [];
  if (dirs.length !== 2 || dirs.some(d => !avail.includes(d))) fail('隣接する未確認マスを2方向選んでください。');
  const results = [];
  for (const dir of dirs) {
    const t = localTarget(e, dir), actual = targetIndex(e.pos, dir);
    const room = actual != null && state.board[actual] === 'open';
    e.discovered[key(t.x, t.y)] = room ? 'open' : 'wall';
    results.push({ dir, cell: room ? 'open' : 'wall' });
  }
  consumeTime(state, 2, `${e.label}の地理学者`, { cause: 'ability', eid: e.id });
  markUsed(state, e, 'geographer', via);
  addIntel(state, { kind: 'ability', char: 'geographer', actor: e.id, via, local: { ...e.localPos }, results });
  emit(state, 'ability', { eid: e.id, char: 'geographer', via, results });
  const autoEnded = autoEndIfSpent(state, e.id);
  touch(state);
  return { kind: 'resolved', results, autoEnded };
}

function abArchaeologist(state, e, payload, via) {
  const dir = payload.dir;
  if (!DIRS[dir]) fail('隣接する壁の方角を選んでください。');
  const t = localTarget(e, dir), k = key(t.x, t.y);
  if (e.discovered[k] !== 'wall') fail('隣接する判明済みの壁だけ鑑定できます。');
  const actual = targetIndex(e.pos, dir);
  const kind = actual == null ? 'outer' : 'inner';
  e.wallKinds[k] = kind;
  markUsed(state, e, 'archaeologist', via);
  addIntel(state, { kind: 'ability', char: 'archaeologist', actor: e.id, via, local: { ...e.localPos }, dir, wall: kind });
  emit(state, 'ability', { eid: e.id, char: 'archaeologist', via, dir, wall: kind });
  const autoEnded = autoEndIfSpent(state, e.id);
  touch(state);
  return { kind: 'resolved', wall: kind, autoEnded };
}

function abDoctor(state, e, payload, via) {
  const target = explorerOf(state, payload.targetExplorerId);
  if (target.id === e.id) fail('医師は自分自身を回復できません。');
  if (!target.fatigue) fail('その探検家は疲労していません。');
  target.fatigue = false;
  markUsed(state, e, 'doctor', via);
  addIntel(state, { kind: 'ability', char: 'doctor', actor: e.id, via, target: target.id });
  emit(state, 'ability', { eid: e.id, char: 'doctor', via, target: target.id });
  const autoEnded = autoEndIfSpent(state, e.id);
  touch(state);
  return { kind: 'resolved', autoEnded };
}

function abMonk(state, e, payload, via) {
  const dir = payload.dir;
  if (!DIRS[dir]) fail('方角を選んでください。');
  let cur = e.pos, count = 0, cells = 0;
  for (;;) {
    cur = targetIndex(cur, dir);
    if (cur == null) break;
    cells++;
    if (state.board[cur] === 'wall' || state.board[cur] === 'shrine') count++;
  }
  markUsed(state, e, 'monk', via);
  addIntel(state, { kind: 'ability', char: 'monk', actor: e.id, via, local: { ...e.localPos }, dir, count });
  emit(state, 'ability', { eid: e.id, char: 'monk', via, dir, count });
  const autoEnded = autoEndIfSpent(state, e.id);
  touch(state);
  return { kind: 'resolved', count, autoEnded };
}

function guideDirs(state, from, to) {
  const a = xy(from), b = xy(to), valid = [];
  if (b.y < a.y) valid.push('N');
  if (b.x > a.x) valid.push('E');
  if (b.y > a.y) valid.push('S');
  if (b.x < a.x) valid.push('W');
  return valid.length ? valid : [...DIR_KEYS];
}

function abGuide(state, e, payload, via) {
  const target = explorerOf(state, payload.targetExplorerId);
  if (target.id === e.id) fail('ほかの探検家を選んでください。');
  const valid = guideDirs(state, e.pos, target.pos);
  markUsed(state, e, 'guide', via);
  state.pendingAbility = {
    type: 'guide', actorId: e.id, targetId: target.id, validDirs: valid, via,
    actorLocal: { ...e.localPos }, targetLocal: { ...target.localPos }, same: e.pos === target.pos,
  };
  emit(state, 'abilityAsk', { eid: e.id, char: 'guide', via }, 'all');
  touch(state);
  return { kind: 'hostChoice' };
}

// Default suggestion for the ruins player (and the rule the CPU ruins uses):
// normal guards within 2 steps of the mercenary.
export function mercenarySuggestion(state, eid) {
  const e = state.explorers[eid];
  const dist = bfsOpen(state.board, [e.pos]);
  return state.guards.filter(g => g.type === 'guard' && g.pos !== state.shrine.index && (dist.get(g.pos) ?? 99) <= 2).map(g => g.id).slice(0, 2);
}

function abMercenary(state, e, payload, via) {
  markUsed(state, e, 'mercenary', via);
  state.pendingAbility = {
    type: 'mercenary', actorId: e.id, via,
    eligibleGuardIds: state.guards.filter(g => g.type === 'guard').map(g => g.id),
    suggestion: mercenarySuggestion(state, e.id),
  };
  emit(state, 'abilityAsk', { eid: e.id, char: 'mercenary', via }, 'all');
  touch(state);
  return { kind: 'hostChoice' };
}

function abApprentice(state, e, payload) {
  const source = explorerOf(state, payload.sourceExplorerId);
  if (source.id === e.id) fail('自分自身の能力は複製できません。');
  if (!source.character || source.character === 'apprentice') fail('その仲間の能力は複製できません。');
  return runAbility(state, e, source.character, payload.copy || {}, true);
}

export function resolvePendingAbility(state, clientId, payload = {}) {
  const p = state.pendingAbility;
  if (!p) fail('応答待ちの能力はありません。');
  if (!isRuins(state, clientId)) fail('能力に応答できるのは遺跡役だけです。');
  const actor = explorerOf(state, p.actorId);
  if (p.type === 'guide') {
    if (!p.validDirs.includes(payload.dir)) fail('その方角は答えられません。');
    addIntel(state, { kind: 'ability', char: 'guide', actor: actor.id, via: p.via, target: p.targetId, dir: payload.dir, actorLocal: p.actorLocal, targetLocal: p.targetLocal });
    emit(state, 'ability', { eid: actor.id, char: 'guide', via: p.via, target: p.targetId, dir: payload.dir });
  } else if (p.type === 'mercenary') {
    const ids = Array.isArray(payload.guardIds) ? [...new Set(payload.guardIds)] : [];
    if (ids.length > 2 || ids.some(id => !p.eligibleGuardIds.includes(id))) fail('衛兵の選択が不正です。');
    for (const g of state.guards) if (ids.includes(g.id)) g.immobilizedRound = state.round;
    addIntel(state, { kind: 'ability', char: 'mercenary', actor: actor.id, via: p.via, count: ids.length });
    emit(state, 'ability', { eid: actor.id, char: 'mercenary', via: p.via, count: ids.length });
  } else fail('能力の処理が不明です。');
  state.pendingAbility = null;
  autoEndIfSpent(state, actor.id);
  touch(state);
}

// ───────────── escape ─────────────
export function voteEscape(state, clientId, vote) {
  requireStage(state, 'escape', 'finalEscape');
  if (!ownedIds(state, clientId).length) fail('脱出の相談に参加できるのは探検家だけです。');
  if (!['go', 'wait'].includes(vote)) fail('投票が不正です。');
  if (state.stage === 'finalEscape' && vote !== 'go') fail('最後の脱出に挑むしかありません。');
  state.escapeVotes[clientId] = vote;
  emit(state, 'vote', { name: seatOf(state, clientId)?.name, vote }, 'all');
  const voters = explorerVoters(state);
  if (voters.every(v => state.escapeVotes[v])) {
    if (voters.every(v => state.escapeVotes[v] === 'go')) attemptEscape(state);
    else startPrediction(state);
  }
  touch(state);
}

export function cancelEscapeVote(state, clientId) {
  requireStage(state, 'escape', 'finalEscape');
  delete state.escapeVotes[clientId];
  touch(state);
}

function attemptEscape(state) {
  expireEncounters(state, Infinity);
  const poses = Object.values(state.explorers).map(e => e.pos);
  const success = poses.every(p => p === poses[0]);
  const final = state.stage === 'finalEscape';
  emit(state, 'escapeAttempt', { success, final });
  if (success) finishGame(state, 'explorers', final ? '時間切れ寸前、全員が同じ部屋にいた。最後の脱出に成功！' : '全員が同じ部屋に集まっていた。霧の迷宮からの脱出に成功！', totalTimeRemaining(state), 'escape');
  else if (final) finishGame(state, 'ruins', '迷宮マスは尽き、最後の脱出も届かなかった。探検家は霧の中に消えた…', null, 'timeout');
  else finishGame(state, 'ruins', '脱出を宣言したが、全員が同じ部屋にいなかった。探検家は霧の中に消えた…', null, 'fail');
}

function startPrediction(state) {
  state.stage = 'prediction';
  for (const e of Object.values(state.explorers)) { e.predictionCommit = null; e.predictionSubmitted = false; e.predictionRevealed = null; }
  addLog(state, '脱出は見送り。行動予測：各探検家は「休憩」か「警戒」を伏せる。', 'phase');
  emit(state, 'stage', { stage: 'prediction' });
}

// ───────────── prediction (commit / reveal) ─────────────
export function submitPrediction(state, clientId, eid, commit) {
  requireStage(state, 'prediction');
  const e = requireOwner(state, clientId, eid);
  if (typeof commit !== 'string' || commit.length < 16 || commit.length > 128) fail('予測データが不正です。');
  e.predictionCommit = commit;
  e.predictionSubmitted = true;
  emit(state, 'predicted', { eid });
  if (Object.values(state.explorers).every(x => x.predictionSubmitted)) beginRuinsTurn(state);
  touch(state);
}

function beginRuinsTurn(state) {
  expireEncounters(state, Infinity);
  state.stage = 'ruinsTurn';
  state.moveRemaining = state.baseMoveTokens;
  state.movesUsed = 0;
  state.lastMovedPieceId = null;
  state.attackOpportunityUsed = false;
  state.pendingNormalAttack = null;
  state.pendingEndRuins = false;
  for (const e of Object.values(state.explorers)) { e.normalAttacked = false; e.superAttacked = false; e.predictionRevealed = null; }
  addLog(state, `遺跡役の手番。移動トークン ${state.moveRemaining} 枚。`, 'phase');
  emit(state, 'stage', { stage: 'ruinsTurn', tokens: state.moveRemaining });
}

// ───────────── ruins turn ─────────────
function enemyNeighbors(state, from) {
  if (from === state.shrine.index) {
    return shrineExitDirs(state.shrine.shape, state.shrine.rotation).map(d => targetIndex(from, d)).filter(i => i != null && state.board[i] === 'open');
  }
  return neighborEntries(from).map(n => n.index).filter(i => state.board[i] === 'open');
}

export function legalEnemyDestinations(state, pieceId) {
  const g = guardOf(state, pieceId);
  if (g.immobilizedRound === state.round) return [];
  const max = g.type === 'guardian' ? 2 : 1;
  const seen = new Map([[g.pos, 0]]), q = [g.pos], out = new Set();
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], d = seen.get(cur);
    if (d >= max) continue;
    for (const n of enemyNeighbors(state, cur)) {
      if (seen.has(n)) continue;
      seen.set(n, d + 1); out.add(n); q.push(n);
    }
  }
  return [...out];
}

function requireRuinsTurn(state, clientId) {
  requireStage(state, 'ruinsTurn');
  if (!isRuins(state, clientId)) fail('遺跡役だけが操作できます。');
}

export function moveEnemy(state, clientId, pieceId, target) {
  requireRuinsTurn(state, clientId);
  if (state.pendingNormalAttack || state.pendingEndRuins) fail('攻撃の判定が終わるまで待ってください。');
  if (state.moveRemaining <= 0) fail('移動トークンが残っていません。');
  const g = guardOf(state, pieceId);
  if (g.immobilizedRound === state.round) fail('この衛兵は元傭兵に妨害されていて動けません。');
  if (!legalEnemyDestinations(state, pieceId).includes(target)) fail('そのマスへは移動できません。');
  if (g.pos === state.shrine.index) g.leftShrine = true;
  g.pos = target;
  state.moveRemaining--; state.movesUsed++;
  state.lastMovedPieceId = pieceId;
  state.attackOpportunityUsed = false;
  state.history.guards.push({ r: state.round, id: g.id, type: g.type, p: target, k: 'move' });
  addLog(state, `${g.type === 'guardian' ? '守護神' : '衛兵'}が移動した。`, 'enemy', 'ruins');
  emit(state, 'enemyMove', { id: g.id, type: g.type, to: target }, 'ruins');
  emit(state, 'ruinsMove', { used: state.movesUsed, left: state.moveRemaining }, 'explorers');
  touch(state);
}

export function attackableTargets(state, pieceId = state.lastMovedPieceId) {
  if (state.stage !== 'ruinsTurn' || !pieceId || state.lastMovedPieceId !== pieceId || state.attackOpportunityUsed) return [];
  const g = state.guards.find(x => x.id === pieceId);
  if (!g) return [];
  return Object.values(state.explorers)
    .filter(e => e.pos === g.pos && (g.type === 'guardian' ? !e.superAttacked : !e.normalAttacked && !e.predictionRevealed))
    .map(e => e.id);
}

export function declareAttack(state, clientId, eid) {
  requireRuinsTurn(state, clientId);
  if (state.pendingNormalAttack || state.pendingEndRuins) fail('処理中の攻撃があります。');
  const g = guardOf(state, state.lastMovedPieceId);
  if (!attackableTargets(state, g.id).includes(eid)) fail('その探検家は今は攻撃できません。');
  const e = explorerOf(state, eid);
  state.attackOpportunityUsed = true;
  state.stats.attacks++;
  if (g.type === 'guardian') {
    e.superAttacked = true;
    state.stats.superHits++; e.stats.hitBy++;
    addLog(state, `守護神の超攻撃！ ${e.label}の探検家に命中。警戒しても防げない。`, 'attack-super');
    addIntel(state, { kind: 'attack', target: eid, type: 'super', result: 'hit' });
    emit(state, 'attack', { eid, type: 'super', result: 'hit' });
    consumeTime(state, 3, `${e.label}への超攻撃`, { cause: 'attack', eid });
    touch(state);
    return { reveal: null };
  }
  if (!e.predictionCommit) fail('行動予測が見つかりません。');
  state.pendingNormalAttack = { pieceId: g.id, explorerId: eid };
  emit(state, 'attackDeclared', { eid });
  touch(state);
  return { reveal: { explorerId: eid, ownerClientId: e.ownerClientId, purpose: 'attack' } };
}

// Called once the explorer's device has revealed (and the host verified) the hidden card.
export function applyReveal(state, eid, choice) {
  if (!['rest', 'alert'].includes(choice)) fail('公開内容が不正です。');
  const e = explorerOf(state, eid);
  if (e.alertLocked && choice === 'alert') fail('警戒不可のため、警戒は選べないはずです。');
  if (state.pendingNormalAttack?.explorerId === eid) {
    state.pendingNormalAttack = null;
    e.predictionRevealed = choice;
    e.normalAttacked = true;
    if (choice === 'rest') {
      state.stats.hits++; e.stats.hitBy++;
      addLog(state, `衛兵の攻撃！ ${e.label}は休憩していた。命中！`, 'attack-hit');
      addIntel(state, { kind: 'attack', target: eid, type: 'normal', result: 'hit' });
      emit(state, 'attack', { eid, type: 'normal', result: 'hit' });
      consumeTime(state, 3, `${e.label}への攻撃`, { cause: 'attack', eid });
    } else {
      state.stats.blocks++; e.stats.blocked++;
      addLog(state, `衛兵の攻撃！ ${e.label}は警戒していた。防いだ！`, 'attack-block');
      addIntel(state, { kind: 'attack', target: eid, type: 'normal', result: 'block' });
      emit(state, 'attack', { eid, type: 'normal', result: 'block' });
    }
  } else if (state.pendingEndRuins) {
    e.predictionRevealed = choice;
  } else fail('今は予測を公開するタイミングではありません。');
  if (state.pendingEndRuins && Object.values(state.explorers).every(x => x.predictionRevealed)) finishRuinsTurn(state);
  touch(state);
}

export function endRuinsTurn(state, clientId) {
  requireRuinsTurn(state, clientId);
  if (state.pendingNormalAttack) fail('攻撃の判定が終わるまで待ってください。');
  state.pendingEndRuins = true;
  state.moveRemaining = 0;
  const need = Object.values(state.explorers).filter(e => !e.predictionRevealed).map(e => ({ explorerId: e.id, ownerClientId: e.ownerClientId, purpose: 'end' }));
  emit(state, 'ruinsPass', {});
  if (!need.length) finishRuinsTurn(state);
  touch(state);
  return { reveals: need };
}

function finishRuinsTurn(state) {
  const results = {};
  for (const e of Object.values(state.explorers)) e.alertLocked = false; // old lock expires first
  for (const e of Object.values(state.explorers)) {
    results[e.id] = { card: e.predictionRevealed, attacked: e.normalAttacked };
    if (!e.normalAttacked && e.predictionRevealed === 'alert') {
      e.alertLocked = true;
      addLog(state, `${e.label}は警戒したが攻撃されなかった。次の予測では警戒できない。`, 'prediction-miss');
    }
    e.predictionCommit = null; e.predictionSubmitted = false; e.predictionRevealed = null;
  }
  addIntel(state, { kind: 'predict', results });
  emit(state, 'predictReveal', { results });
  for (const g of state.guards) if (g.immobilizedRound === state.round) g.immobilizedRound = null;
  state.pendingEndRuins = false;
  state.lastMovedPieceId = null;
  state.attackOpportunityUsed = false;
  state.moveRemaining = 0;
  state.round += 1;
  startExplorerPhase(state);
}

// ───────────── team board (shared deduction table) ─────────────
// Board coordinates are a 7×7 frame: the 5×5 maze (1..5) plus the outer wall ring (0 and 6).
function requireTeam(state, clientId) {
  if (!ownedIds(state, clientId).length) fail('作戦盤は探検家だけが操作できます。');
  requireStage(state, 'explorerTurns', 'escape', 'finalEscape', 'prediction', 'ruinsTurn');
}
export function layerBounds(e) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const k of Object.keys(e.discovered)) {
    const [x, y] = k.split(',').map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}
export function clampLayer(e, ox, oy) {
  const b = layerBounds(e);
  const loX = 0 - b.minX, hiX = 6 - b.maxX, loY = 0 - b.minY, hiY = 6 - b.maxY;
  return {
    x: loX <= hiX ? Math.max(loX, Math.min(hiX, Math.round(ox))) : Math.round((loX + hiX) / 2),
    y: loY <= hiY ? Math.max(loY, Math.min(hiY, Math.round(oy))) : Math.round((loY + hiY) / 2),
  };
}
export function teamMoveLayer(state, clientId, eid, x, y) {
  requireTeam(state, clientId);
  const e = explorerOf(state, eid);
  const name = seatOf(state, clientId)?.name || 'PLAYER';
  if (x == null) { delete state.teamBoard.layers[eid]; }
  else {
    const c = clampLayer(e, Number(x), Number(y));
    state.teamBoard.layers[eid] = { x: c.x, y: c.y, by: name, t: Date.now() };
  }
  state.teamBoard.rev++;
  touch(state);
}
export function teamMark(state, clientId, x, y, kind) {
  requireTeam(state, clientId);
  if (!MARK_KINDS[kind]) fail('目印の種類が不正です。');
  x = Math.round(Number(x)); y = Math.round(Number(y));
  if (!(x >= 0 && x <= 6 && y >= 0 && y <= 6)) fail('作戦盤の外です。');
  const marks = state.teamBoard.marks;
  const same = marks.findIndex(m => m.x === x && m.y === y);
  if (same >= 0 && marks[same].kind === kind) marks.splice(same, 1);
  else {
    if (same >= 0) marks.splice(same, 1);
    if (kind === 'meet') for (let i = marks.length - 1; i >= 0; i--) if (marks[i].kind === 'meet') marks.splice(i, 1);
    if (marks.length >= 24) marks.shift();
    marks.push({ id: nextId(state, 'm'), x, y, kind, by: seatOf(state, clientId)?.name || 'PLAYER', t: Date.now() });
    emit(state, 'mark', { kind, by: seatOf(state, clientId)?.name }, 'explorers');
  }
  state.teamBoard.rev++;
  touch(state);
}
export function teamClearMarks(state, clientId) {
  requireTeam(state, clientId);
  state.teamBoard.marks = [];
  state.teamBoard.rev++;
  touch(state);
}

// ───────────── chat ─────────────
export function addChat(state, clientId, text, stamp = false) {
  const seat = seatOf(state, clientId);
  if (!seat) fail('参加者が見つかりません。');
  const msg = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  if (!msg) return;
  const role = isRuins(state, clientId) ? 'ruins' : ownedIds(state, clientId).length ? 'explorer' : 'other';
  const colors = ownedIds(state, clientId);
  state.chat.push({ id: nextId(state, 'c'), t: Date.now(), name: seat.name, cid: clientId, role, colors, text: msg, stamp: !!stamp });
  if (state.chat.length > MAX_CHAT) state.chat.shift();
  emit(state, 'chat', { from: clientId, name: seat.name, role, stamp: !!stamp, text: msg.slice(0, 40) }, role === 'explorer' && !state.options.revealTeamTalk ? 'explorers' : 'all');
  touch(state);
}

// ───────────── end ─────────────
export function finishGame(state, winner, resultText, score = null, reason = null) {
  state.winner = winner; state.resultText = resultText; state.score = score; state.endReason = reason;
  state.status = 'gameover'; state.stage = 'gameover';
  state.activeExplorerId = null; state.pendingEncounters = []; state.pendingAbility = null;
  state.pendingNormalAttack = null; state.pendingEndRuins = false; state.turnClaimDeadline = null;
  addLog(state, resultText, winner === 'explorers' ? 'success' : 'danger');
  emit(state, 'gameover', { winner, reason, score });
  touch(state);
}

export function concede(state, clientId) {
  if (state.stage === 'gameover' || state.status !== 'playing') fail('今は降参できません。');
  if (isRuins(state, clientId)) finishGame(state, 'explorers', '遺跡役が降参した。探検家の勝利。', totalTimeRemaining(state), 'concede');
  else if (ownedIds(state, clientId).length) finishGame(state, 'ruins', '探検家が降参した。遺跡役の勝利。', null, 'concede');
  else fail('降参できるのはプレイヤーだけです。');
}

// Back to the lobby with the same seats for a rematch.
export function resetToLobby(state) {
  const keep = { roomCode: state.roomCode, hostClientId: state.hostClientId, ruinsClientId: state.ruinsClientId, seats: state.seats, options: state.options, chat: state.chat };
  const fresh = createRoom({ roomCode: 'CPU0000', hostClientId: keep.hostClientId, hostName: 'x' });
  Object.assign(state, fresh, keep, { revision: state.revision + 1, idSeq: state.idSeq + 1, log: [], events: [] });
  state.status = 'lobby'; state.stage = 'lobby';
  emit(state, 'stage', { stage: 'lobby' });
  touch(state);
}

// ───────────── single entry point for every client action ─────────────
export function applyAction(state, clientId, action = {}) {
  const t = action.type, p = action;
  switch (t) {
    case 'chat': return addChat(state, clientId, p.text, p.stamp);
    case 'character': return setCharacter(state, clientId, p.eid, p.char);
    case 'claimTurn': return claimTurn(state, clientId, p.eid);
    case 'requestTurn': return requestTurn(state, clientId, p.eid, p.wants !== false);
    case 'explore': return explore(state, clientId, p.eid, p.dir);
    case 'move': return moveExplorer(state, clientId, p.eid, p.dir);
    case 'movePath': return movePath(state, clientId, p.eid, p.dirs);
    case 'endTurn': return endExplorerTurn(state, clientId, p.eid, p.next || null);
    case 'ability': return useAbility(state, clientId, p.eid, p.data || {});
    case 'vote': return voteEscape(state, clientId, p.vote);
    case 'unvote': return cancelEscapeVote(state, clientId);
    case 'predict': return submitPrediction(state, clientId, p.eid, p.commit);
    case 'tbMove': return teamMoveLayer(state, clientId, p.eid, p.x, p.y);
    case 'tbMark': return teamMark(state, clientId, p.x, p.y, p.kind);
    case 'tbClear': return teamClearMarks(state, clientId);
    case 'concede': return concede(state, clientId);
    // ruins
    case 'setCell': return setupSetCell(state, clientId, p.cell, p.tool);
    case 'shrineStyle': return setShrineStyle(state, clientId, p.shape, p.rotation);
    case 'randomMaze': if (!isRuins(state, clientId)) fail('遺跡役だけが操作できます。'); requireStage(state, 'setup'); if (!randomizeSetup(state, p.level || 'normal')) fail('迷宮を生成できませんでした。'); return;
    case 'presetMaze': return applyPresetMaze(state, clientId, p.index);
    case 'clearMaze': return clearSetup(state, clientId);
    case 'startGame': return startGame(state, clientId, p.clue);
    case 'encounter': return resolveEncounter(state, clientId, p.qid, !!p.declare);
    case 'answerAbility': return resolvePendingAbility(state, clientId, p.data || {});
    case 'moveEnemy': return moveEnemy(state, clientId, p.id, p.to);
    case 'attack': return declareAttack(state, clientId, p.eid);
    case 'endRuins': return endRuinsTurn(state, clientId);
    case 'encounterPolicy': if (!isRuins(state, clientId)) fail('遺跡役だけが設定できます。'); return setEncounterPolicy(state, p.policy);
    // host
    case 'options': if (clientId !== state.hostClientId) fail('部屋の設定はホストだけが変更できます。'); return setOptions(state, p.patch || {});
    case 'beginSetup': if (clientId !== state.hostClientId) fail('ホストだけが開始できます。'); return beginSetup(state);
    case 'addCpu': if (clientId !== state.hostClientId) fail('ホストだけが追加できます。'); return addCpuExplorer(state, p.level || state.options.cpuLevel);
    case 'kick': if (clientId !== state.hostClientId) fail('ホストだけが操作できます。'); return removeSeat(state, p.clientId);
    case 'rematch': if (clientId !== state.hostClientId) fail('ホストだけが操作できます。'); if (state.stage !== 'gameover') fail('ゲーム終了後に使えます。'); return resetToLobby(state);
    default: fail('不明な操作です。');
  }
}

export { CHARACTERS, PRESET_MAZES };
