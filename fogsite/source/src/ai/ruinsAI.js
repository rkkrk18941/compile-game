// ─────────────────────────────────────────────────────────────
//  CPU ruins player — sees the true maze (as the ruins player does), never
//  the hidden rest/alert cards. Plans guard moves with a small beam search.
// ─────────────────────────────────────────────────────────────
import { SIZE, DIR_KEYS } from '../core/constants.js';
import { neighborEntries, targetIndex, shrineExitDirs, bfsOpen, shortestPathOpen } from '../core/geom.js';
import { buildKnowledge, solve } from '../core/solver.js';

const LEVELS = {
  // randomMove: chance a token is spent on an unplanned move; attackRate: chance to take an attack chance
  easy: { beam: 6, noise: 1.0, declare: 0.5, think: 900, bait: false, randomMove: 0.4, attackRate: 0.6 },
  normal: { beam: 24, noise: 0.35, declare: 0.9, think: 750, bait: true, randomMove: 0.12, attackRate: 0.92 },
  hard: { beam: 70, noise: 0.04, declare: 0.98, think: 650, bait: true, randomMove: 0, attackRate: 1 },
};

export class RuinsAgent {
  constructor({ clientId, level = 'normal', rnd = Math.random }) {
    this.clientId = clientId;
    this.level = LEVELS[level] ? level : 'normal';
    this.cfg = LEVELS[this.level];
    this.rnd = rnd;
    this.plan = null;
  }
  thinkDelay(m = 1) { return Math.round(this.cfg.think * m * (0.7 + this.rnd() * 0.6)); }

  decide(snap) {
    if (!snap || snap.you.role !== 'ruins') return null;
    if (snap.stage === 'setup') return this.setup(snap);
    if (snap.stage === 'gameover' || !snap.ruins) return null;
    const r = snap.ruins;
    if (r.pendingAbility) return this.answerAbility(snap);
    if (r.pendingEncounters?.length) {
      const q = r.pendingEncounters[0];
      const declare = this.rnd() < this.cfg.declare || (this.level !== 'easy' && snap.time.total <= 6);
      return { action: { type: 'encounter', qid: q.id, declare }, delay: this.thinkDelay(0.6) };
    }
    if (snap.stage === 'ruinsTurn') return this.ruinsTurn(snap);
    return null;
  }

  setup(snap) {
    const ready = snap.setup?.characterReady && Object.values(snap.setup.characterReady).every(Boolean);
    const ok = snap.setup?.checks?.filter(c => c.key !== 'chars').every(c => c.ok);
    if (!ready || !ok) return null;
    const ids = Object.keys(snap.explorers);
    // reveal the distance for a random explorer (hard: the one farthest from the shrine)
    let clue = ids[Math.floor(this.rnd() * ids.length)];
    if (this.level === 'hard' && snap.setup.distances) clue = ids.slice().sort((a, b) => (snap.setup.distances[b] || 0) - (snap.setup.distances[a] || 0))[0];
    return { action: { type: 'startGame', clue }, delay: 1400 };
  }

  answerAbility(snap) {
    const p = snap.ruins.pendingAbility;
    if (p.type === 'guide') {
      let d = p.validDirs[Math.floor(this.rnd() * p.validDirs.length)];
      // when two answers are honest, a sharp ruins player gives the one that teaches less
      if (p.validDirs.length > 1 && (this.level === 'hard' || (this.level === 'normal' && this.rnd() < 0.5))) {
        try {
          const know = buildKnowledge(snap);
          let best = null;
          for (const dir of p.validDirs) {
            const k2 = { ...know, guides: [...know.guides, { actor: p.actorId, target: p.targetId, a: p.actorLocal, b: p.targetLocal, dir }] };
            const n = solve(k2, { limit: 20000 }).combos.length;
            if (!best || n > best.n) best = { n, dir };
          }
          if (best) d = best.dir;
        } catch { /* fall back to the random honest answer */ }
      }
      return { action: { type: 'answerAbility', data: { dir: d } }, delay: this.thinkDelay(1) };
    }
    if (p.type === 'mercenary') return { action: { type: 'answerAbility', data: { guardIds: p.suggestion || [] } }, delay: this.thinkDelay(1) };
    return null;
  }

  // ───────── ruins turn ─────────
  pRest(snap, eid) {
    const e = snap.explorers[eid];
    if (e.alertLocked) return 1;
    if (e.predictionRevealed) return e.predictionRevealed === 'rest' ? 1 : 0;
    let rest = 1.1, total = 2;
    for (const it of snap.intel || []) {
      if (it.kind === 'predict' && it.results?.[eid]?.card) { total++; if (it.results[eid].card === 'rest') rest++; }
    }
    let p = rest / total;
    const hitLast = (snap.intel || []).some(i => i.kind === 'attack' && i.target === eid && i.round === snap.round - 1);
    if (hitLast) p -= 0.12;
    return Math.max(0.15, Math.min(0.9, p));
  }

  ruinsTurn(snap) {
    const r = snap.ruins;
    if (snap.pendingAttack || snap.pendingEndRuins || r.pendingAttack || r.revealWait?.length) return null;
    // attack opportunity right after a move
    if (r.attackable?.length) {
      const g = r.guards.find(x => x.id === r.lastMovedPieceId);
      const scored = r.attackable.map(eid => ({ eid, v: g.type === 'guardian' ? 3 : 3 * this.pRest(snap, eid) }));
      scored.sort((a, b) => b.v - a.v);
      const best = scored[0];
      const baitValue = this.cfg.bait && g.type === 'guard' ? (1 - this.pRest(snap, best.eid)) * 1.6 : 0;
      const willing = this.rnd() < this.cfg.attackRate;
      if (willing && (g.type === 'guardian' || best.v >= baitValue + (this.rnd() - 0.5) * this.cfg.noise)) {
        return { action: { type: 'attack', eid: best.eid }, delay: this.thinkDelay(0.9) };
      }
      // decline: keep the threat, hope the alert goes to waste and gets locked
    }
    if ((snap.time.moveRemaining ?? 0) > 0) {
      if (this.rnd() < this.cfg.randomMove) {
        const opts = [];
        for (const g of r.guards) for (const to of r.guardMoves?.[g.id] || []) opts.push({ id: g.id, to });
        if (opts.length) { const mv = opts[Math.floor(this.rnd() * opts.length)]; return { action: { type: 'moveEnemy', id: mv.id, to: mv.to }, delay: this.thinkDelay() }; }
      }
      const mv = this.planMove(snap);
      if (mv) return { action: { type: 'moveEnemy', id: mv.id, to: mv.to }, delay: this.thinkDelay() };
    }
    return { action: { type: 'endRuins' }, delay: this.thinkDelay(0.8) };
  }

  planMove(snap) {
    const r = snap.ruins, board = r.board, shrine = r.shrine;
    const tokens = snap.time.moveRemaining;
    const explorers = Object.values(snap.explorers);
    const pos = r.positions;
    const pRest = Object.fromEntries(explorers.map(e => [e.id, this.pRest(snap, e.id)]));
    const nbr = (from) => {
      if (from === shrine.index) return shrineExitDirs(shrine.shape, shrine.rotation).map(d => targetIndex(from, d)).filter(i => i != null && board[i] === 'open');
      return neighborEntries(from).map(n => n.index).filter(i => board[i] === 'open');
    };
    const dests = (g) => {
      if (g.immobilizedRound === snap.round) return [];
      const max = g.type === 'guardian' ? 2 : 1, seen = new Map([[g.pos, 0]]), q = [g.pos], out = [];
      for (let h = 0; h < q.length; h++) { const c = q[h], d = seen.get(c); if (d >= max) continue; for (const n of nbr(c)) if (!seen.has(n)) { seen.set(n, d + 1); out.push(n); q.push(n); } }
      return out;
    };
    // cells explorers are likely to walk through: shortest paths between them
    const lanes = new Map();
    for (let i = 0; i < explorers.length; i++) for (let j = i + 1; j < explorers.length; j++) {
      const path = shortestPathOpen(board, pos[explorers[i].id], pos[explorers[j].id]) || [];
      for (const c of path) lanes.set(c, (lanes.get(c) || 0) + 1);
    }
    const distFrom = new Map();
    const distOf = (c) => { if (!distFrom.has(c)) distFrom.set(c, bfsOpen(board, [c])); return distFrom.get(c); };
    const evalState = (guards) => {
      let v = 0;
      for (const e of explorers) {
        let best = 99;
        for (const g of guards) {
          if (g.pos === shrine.index) continue;
          const d = distOf(g.pos).get(pos[e.id]);
          if (d == null) continue;
          const steps = g.type === 'guardian' ? Math.ceil(d / 2) : d;
          best = Math.min(best, steps);
        }
        const nextTokens = snap.time.baseMoveTokens;
        const reach = best <= nextTokens ? 1 : 0.4;
        v += (1.4 / (1 + best)) * (0.6 + 0.8 * pRest[e.id]) * reach;
      }
      for (const g of guards) {
        if (lanes.has(g.pos)) v += 0.35 * Math.min(2, lanes.get(g.pos));
        if (g.pos === shrine.index) v -= 0.4; // get out of the shrine
      }
      return v;
    };
    const start = {
      guards: r.guards.map(g => ({ id: g.id, type: g.type, pos: g.pos, immobilizedRound: g.immobilizedRound })),
      hit: Object.fromEntries(explorers.map(e => [e.id, { n: e.normalAttacked || !!e.predictionRevealed, s: e.superAttacked }])),
      gain: 0, first: null,
    };
    let beam = [start];
    for (let t = 0; t < tokens; t++) {
      const next = [];
      for (const st of beam) {
        next.push({ ...st, done: true });
        if (st.done) continue;
        for (const g of st.guards) {
          for (const to of dests(g)) {
            const guards = st.guards.map(x => x.id === g.id ? { ...x, pos: to } : x);
            const hit = JSON.parse(JSON.stringify(st.hit));
            let gain = st.gain;
            const here = explorers.filter(e => pos[e.id] === to);
            if (here.length) {
              if (g.type === 'guardian') {
                const tgt = here.find(e => !hit[e.id].s);
                if (tgt) { hit[tgt.id].s = true; gain += 3; }
              } else {
                const cands = here.filter(e => !hit[e.id].n).sort((a, b) => pRest[b.id] - pRest[a.id]);
                if (cands.length) { hit[cands[0].id].n = true; gain += 3 * pRest[cands[0].id]; }
              }
            }
            next.push({ guards, hit, gain, first: st.first || { id: g.id, to } });
          }
        }
      }
      for (const s of next) s.score = s.gain + evalState(s.guards) + (this.rnd() - 0.5) * this.cfg.noise;
      next.sort((a, b) => b.score - a.score);
      beam = next.slice(0, this.cfg.beam);
    }
    const best = beam.filter(b => b.first).sort((a, b) => b.score - a.score)[0];
    const stay = start.gain + evalState(start.guards);
    if (!best || best.score < stay - 0.05) return null;
    return best.first;
  }
}
