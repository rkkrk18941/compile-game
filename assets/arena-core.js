'use strict';
// Pure competition rules, shared by the lobby and regression tests.
(() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  function create(players, mode = 'league', options = {}) {
    if (!Array.isArray(players) || players.length < 3 || players.length > 16) throw Error('参加者は3〜16人です');
    if (new Set(players.map(p => p.id)).size !== players.length || players.some(p => !p.id || !String(p.name).trim())) throw Error('参加者を確認してください');
    const t = { version: 1, id: options.id || 'arena-' + Date.now(), mode: players.length === 3 ? 'league' : mode,
      transport: options.transport || 'local', status: 'running', players: players.map((p, seed) => ({ id: p.id, name: String(p.name).trim().slice(0, 18), seed })),
      matches: [], createdAt: Date.now(), cardSet: options.cardSet || 'set1', controlEnabled: options.controlEnabled !== false };
    if (!['league', 'knockout'].includes(t.mode)) throw Error('大会方式が不正です');
    if (t.mode === 'league') {
      const ring = t.players.map(p => p.id); if (ring.length % 2) ring.push(null);
      for (let round = 0; round < ring.length - 1; round++) {
        for (let i = 0; i < ring.length / 2; i++) {
          const a = ring[i], b = ring[ring.length - 1 - i]; if (a && b) add(t, round + 1, a, b);
        }
        ring.splice(1, 0, ring.pop());
      }
    } else {
      const size = 2 ** Math.ceil(Math.log2(players.length)), slots = Array(size).fill(null);
      // Separate byes; never generate an empty versus empty match.
      let index = 0;
      for (let pair = 0; pair < size / 2; pair++) { slots[pair * 2] = players[index++].id; }
      for (let pair = 0; index < players.length; pair++) slots[pair * 2 + 1] = players[index++].id;
      for (let i = 0; i < size; i += 2) add(t, 1, slots[i], slots[i + 1]);
      advance(t);
    }
    return t;
  }
  function add(t, round, a, b) {
    const m = { id: t.id + '-m' + (t.matches.length + 1), round, a, b, status: a && b ? 'pending' : 'bye', winner: a && b ? null : a || b, score: null, turns: 0 };
    t.matches.push(m); return m;
  }
  function advance(t) {
    if (t.mode === 'league') { if (t.matches.every(m => m.status === 'done')) t.status = 'completed'; return; }
    while (true) {
      const round = Math.max(...t.matches.map(m => m.round)), group = t.matches.filter(m => m.round === round);
      if (!group.every(m => m.status === 'done' || m.status === 'bye')) return;
      if (group.length === 1) { t.status = 'completed'; t.champion = group[0].winner; return; }
      for (let i = 0; i < group.length; i += 2) add(t, round + 1, group[i].winner, group[i + 1].winner);
    }
  }
  function ready(t) {
    if (t.status !== 'running') return [];
    const rounds = t.matches.filter(m => !['done', 'bye'].includes(m.status)).map(m => m.round);
    const round = Math.min(...rounds); return t.matches.filter(m => m.round === round && ['pending', 'live'].includes(m.status));
  }
  function start(t, id) {
    const m = ready(t).find(m => m.id === id); if (!m || m.status !== 'pending') return false;
    m.status = 'live'; m.startedAt = Date.now(); return true;
  }
  function result(t, id, winner, score, turns = 0) {
    const m = t.matches.find(m => m.id === id);
    if (!m || m.status !== 'live' || ![m.a, m.b].includes(winner) || !Array.isArray(score) || score.length !== 2 ||
      score.some(n => !Number.isInteger(n) || n < 0 || n > 3) || score[winner === m.a ? 0 : 1] !== 3 || score[winner === m.a ? 1 : 0] >= 3) return false;
    m.status = 'done'; m.winner = winner; m.score = score.slice(); m.turns = Math.max(0, Math.min(100000, Number(turns) || 0)); m.endedAt = Date.now(); advance(t); return true;
  }
  function standings(t) {
    const rows = t.players.map(p => ({ ...p, wins: 0, losses: 0, scored: 0, conceded: 0, played: 0, points: 0, lastRound: 0 }));
    for (const m of t.matches.filter(m => m.status === 'done')) for (const [index, id] of [m.a, m.b].entries()) {
      const p = rows.find(p => p.id === id); if (!p) continue;
      p.played++; p.lastRound = Math.max(p.lastRound, m.round); p.scored += m.score[index]; p.conceded += m.score[1 - index];
      if (m.winner === id) { p.wins++; p.points += 3; } else p.losses++;
    }
    for (const p of rows) p.diff = p.scored - p.conceded;
    for (const p of rows) { p.head = 0;
      const tied = rows.filter(q => q.points === p.points && q.diff === p.diff);
      for (const m of t.matches) if (m.status === 'done' && m.winner === p.id && tied.some(q => q.id === (m.a === p.id ? m.b : m.a))) p.head++;
    }
    const metric = p => t.mode === 'league' ? [p.points, p.diff, p.head] : [p.id === t.champion ? 1 : 0, p.lastRound];
    const compare = (a, b) => { const x = metric(a), y = metric(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
    rows.sort((a, b) => compare(a, b) || a.seed - b.seed); rows.forEach((p, i) => { p.rank = i && compare(p, rows[i - 1]) === 0 ? rows[i - 1].rank : i + 1; }); return rows;
  }
  function publicGame(game, totals) {
    if (!game || !Array.isArray(game.players)) return null;
    return { turn: game.turn, current: game.current, phase: game.phase, winner: game.winner, control: game.control, totals: totals || null,
      players: game.players.map(p => ({ name: String(p.name).slice(0, 32), protocols: p.protocols.map(pr => ({ name: pr.name, compiled: !!pr.compiled })),
        handCount: p.hand.length, deckCount: p.deck.length, discardCount: p.discard.length,
        lines: p.lines.map(line => line.map(c => c.faceDown ? { faceDown: true } : { faceDown: false, protocol: c.protocol, value: c.value })) })) };
  }
  globalThis.COMPILE_ARENA_RULES = Object.freeze({ create, ready, start, result, standings, publicGame, copy });
})();
