// Per-viewer snapshot. Hidden information never leaves the host unless the viewer may see it.
import { CHARACTER_MAP } from './constants.js';
import { totalTimeRemaining, attackableTargets, legalEnemyDestinations, setupChecks, ownedIds, explorerVoters, seatOf, shrineDistance } from './rules.js';

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function viewerRole(state, clientId) {
  if (clientId === state.ruinsClientId) return 'ruins';
  if (ownedIds(state, clientId).length) return 'explorer';
  const seat = seatOf(state, clientId);
  if (seat?.role === 'explorer') return 'explorer';
  return 'spectator';
}

function audienceOk(aud, role, clientId) {
  if (!aud || aud === 'all') return true;
  if (aud === 'ruins') return role === 'ruins';
  if (aud === 'explorers') return role === 'explorer';
  if (aud.startsWith?.('c:')) return aud.slice(2) === clientId;
  return false;
}

export function snapshotFor(state, clientId) {
  const role = viewerRole(state, clientId);
  const isRuins = role === 'ruins';
  const isExplorer = role === 'explorer';
  const over = state.stage === 'gameover';
  const owned = new Set(ownedIds(state, clientId));
  const teamTalkVisible = isExplorer || over || state.options.revealTeamTalk;
  const seatName = (cid) => seatOf(state, cid)?.name || 'PLAYER';

  const snap = {
    protocol: state.protocol, roomCode: state.roomCode, revision: state.revision,
    status: state.status, stage: state.stage, round: state.round, finalRound: !!state.finalRound,
    you: {
      clientId, role, isHost: clientId === state.hostClientId, ownedExplorerIds: [...owned], name: seatName(clientId),
    },
    hostName: seatName(state.hostClientId),
    ruinsName: seatName(state.ruinsClientId),
    ruinsCpu: seatOf(state, state.ruinsClientId)?.cpu || null,
    seats: state.seats.map(s => ({
      id: s.clientId === clientId ? s.clientId : (s.cpu ? s.clientId : `p${Math.abs(hash(s.clientId)) % 99991}`),
      realId: (clientId === state.hostClientId) ? s.clientId : null,
      name: s.name, role: s.role, connected: s.connected, isYou: s.clientId === clientId, cpu: s.cpu || null,
      isHost: s.clientId === state.hostClientId, explorers: ownedIds(state, s.clientId),
    })),
    options: {
      explorerCount: state.options.explorerCount, timePreset: state.options.timePreset, customStacks: [...state.options.customStacks],
      timeStacks: [...state.options.timeStacks], revealTeamTalk: state.options.revealTeamTalk, assist: state.options.assist,
      cpuLevel: state.options.cpuLevel,
      encounterPolicy: isRuins ? state.options.encounterPolicy : undefined,
    },
    time: {
      stacks: [...state.options.timeStacks], phase: Math.min(4, state.phase + 1), phaseRemaining: state.phaseRemaining,
      total: totalTimeRemaining(state), expired: state.timeExpired,
      baseMoveTokens: state.baseMoveTokens, moveRemaining: state.stage === 'ruinsTurn' ? state.moveRemaining : null, movesUsed: state.movesUsed,
    },
    explorers: {},
    activeExplorerId: state.activeExplorerId,
    doneExplorers: [...state.doneExplorers],
    turnRequests: { ...state.turnRequests },
    turnClaimDeadline: state.turnClaimDeadline,
    turnSeq: state.turnSeq,
    waitingOnRuins: state.pendingAbility ? 'ability' : null,
    pendingAbilityPublic: state.pendingAbility ? { type: state.pendingAbility.type, actorId: state.pendingAbility.actorId } : null,
    pendingAttack: state.pendingNormalAttack ? { explorerId: state.pendingNormalAttack.explorerId } : null,
    pendingEndRuins: state.pendingEndRuins,
    escapeVotes: explorerVoters(state).map(cid => ({
      name: seatName(cid), isYou: cid === clientId, cpu: !!seatOf(state, cid)?.cpu, vote: state.escapeVotes[cid] || null,
      connected: seatOf(state, cid)?.connected !== false,
    })),
    clue: state.clue ? { ...state.clue } : null,
    intel: clone(state.intel),
    maps: {},
    teamBoard: teamTalkVisible ? clone(state.teamBoard) : null,
    chat: state.chat.filter(m => teamTalkVisible || m.role !== 'explorer').slice(-80),
    events: state.events.filter(ev => audienceOk(ev.aud, role, clientId)).map(ev => ({ ...ev, aud: undefined })),
    log: state.log.filter(l => audienceOk(l.aud, role, clientId)).slice(-70),
    winner: state.winner, resultText: state.resultText, score: state.score, endReason: state.endReason,
  };

  for (const e of Object.values(state.explorers)) {
    const seeChar = e.characterRevealed || isExplorer || owned.has(e.id);
    snap.explorers[e.id] = {
      id: e.id, label: e.label, colorKey: e.colorKey,
      ownerName: seatName(e.ownerClientId), ownerIsYou: e.ownerClientId === clientId, ownerCpu: !!seatOf(state, e.ownerClientId)?.cpu,
      ownerConnected: seatOf(state, e.ownerClientId)?.connected !== false,
      character: seeChar ? e.character : (e.character ? 'hidden' : null),
      fatigue: e.fatigue, blocked: e.blocked, alertLocked: e.alertLocked,
      done: state.doneExplorers.includes(e.id), active: state.activeExplorerId === e.id,
      predictionSubmitted: e.predictionSubmitted, predictionRevealed: e.predictionRevealed,
      normalAttacked: e.normalAttacked, superAttacked: e.superAttacked, abilityUses: e.abilityUses,
      turn: { ...e.turn },
      stats: over || isRuins ? { ...e.stats } : undefined,
    };
    snap.maps[e.id] = { localPos: { ...e.localPos }, discovered: { ...e.discovered }, wallKinds: { ...e.wallKinds } };
  }

  if (state.stage === 'setup') {
    snap.setup = {
      characterReady: Object.fromEntries(Object.values(state.explorers).map(e => [e.id, !!e.character])),
    };
    if (isRuins) {
      Object.assign(snap.setup, {
        board: [...state.board], shrine: { ...state.shrine }, starts: { ...state.starts }, checks: setupChecks(state),
        distances: Object.fromEntries(Object.keys(state.explorers).map(id => [id, shrineDistance(state, id)])),
      });
    }
  }

  if (isRuins && state.status !== 'lobby' && state.stage !== 'setup') {
    const guardMoves = {};
    const canMove = state.stage === 'ruinsTurn' && state.moveRemaining > 0 && !state.pendingNormalAttack && !state.pendingEndRuins;
    for (const g of state.guards) { try { guardMoves[g.id] = canMove ? legalEnemyDestinations(state, g.id) : []; } catch { guardMoves[g.id] = []; } }
    snap.ruins = {
      board: [...state.board], shrine: { ...state.shrine }, starts: { ...state.starts },
      positions: Object.fromEntries(Object.values(state.explorers).map(e => [e.id, e.pos])),
      guards: state.guards.map(g => ({ ...g })), guardMoves,
      lastMovedPieceId: state.lastMovedPieceId, attackable: attackableTargets(state),
      pendingEncounters: clone(state.pendingEncounters), pendingAbility: clone(state.pendingAbility),
      pendingAttack: clone(state.pendingNormalAttack),
      revealWait: state.pendingEndRuins ? Object.values(state.explorers).filter(e => !e.predictionRevealed).map(e => e.id) : [],
      history: clone(state.history),
    };
  }

  if (over) {
    snap.reveal = {
      board: [...state.board], shrine: { ...state.shrine }, starts: { ...state.starts },
      positions: Object.fromEntries(Object.values(state.explorers).map(e => [e.id, e.pos])),
      guards: state.guards.map(g => ({ ...g })), history: clone(state.history), stats: clone(state.stats),
      characters: Object.fromEntries(Object.values(state.explorers).map(e => [e.id, e.character])),
    };
  }
  return snap;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

export const charName = (k) => CHARACTER_MAP[k]?.name || '';
