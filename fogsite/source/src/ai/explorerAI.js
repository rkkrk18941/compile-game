// ─────────────────────────────────────────────────────────────
//  CPU explorer — plays only from its own (explorer) snapshot.
//  Deduces placements with the solver, gathers information when unsure,
//  and walks everyone to a common room when the relative positions are known.
// ─────────────────────────────────────────────────────────────
import { DIRS, DIR_KEYS, SIZE, CHARACTER_MAP } from '../core/constants.js';
import { buildKnowledge, solve, summarize, relKey, mergedGrid } from '../core/solver.js';

const LEVELS = {
  // exploreBudget: information-only explores per turn; turnCap: explores per turn in total;
  // reach: how far it walks for a better frontier; planAt: confidence needed to head for a meeting room;
  // escapeRisk: how sure it must be that everyone shares a room before voting to escape
  easy: { noise: 0.9, exploreBudget: 1, turnCap: 1, trioBonus: 0.3, think: 1300, escapeRisk: 0.6, abilityBias: 0.4, reach: 3, planAt: 0.4 },
  normal: { noise: 0.5, exploreBudget: 1, turnCap: 1.2, trioBonus: 1.1, think: 950, escapeRisk: 0.85, abilityBias: 0.8, reach: 8, planAt: 0.7 },
  hard: { noise: 0.08, exploreBudget: 3, turnCap: 3, trioBonus: 1, think: 800, escapeRisk: 0.97, abilityBias: 1.2, reach: 25, planAt: 0.45 },
};
const SAMPLE = 1500;
const P_WALL = 0.27;
const CHAR_PREF = ['guide', 'geographer', 'archaeologist', 'monk', 'doctor', 'mercenary', 'apprentice'];

const k = (x, y) => `${x},${y}`;
const H = (ps) => { let h = 0; for (const p of ps) if (p > 0) h -= p * Math.log2(p); return h; };

export class ExplorerAgent {
  constructor({ clientId, level = 'normal', rnd = Math.random }) {
    this.clientId = clientId;
    this.level = LEVELS[level] ? level : 'normal';
    this.cfg = LEVELS[this.level];
    this.rnd = rnd;
    this.secrets = new Map(); // `${round}:${eid}` -> choice
    this.turnKey = null;
    this.turnExplores = 0;
    this.turnMoves = 0;
    this.intent = null;     // { tk, at, dir }: walked to a frontier, explore there next
    this.lastBoardRel = null;
    this.phaseSeen = null;
    this.waitSince = 0;
  }

  thinkDelay(mult = 1) { return Math.round(this.cfg.think * mult * (0.75 + this.rnd() * 0.5)); }

  reveal(eid, round) { return this.secrets.get(`${round}:${eid}`) || 'rest'; }

  // Returns { action, delay } or null when there is nothing to do now.
  decide(snap) {
    if (!snap || snap.stage === 'gameover') return null;
    const owned = snap.you.ownedExplorerIds || [];
    if (!owned.length) return null;
    switch (snap.stage) {
      case 'setup': return this.pickCharacter(snap, owned);
      case 'explorerTurns': return this.explorerTurns(snap, owned);
      case 'escape': case 'finalEscape': return this.vote(snap);
      case 'prediction': return this.predict(snap, owned);
      default: return null;
    }
  }

  pickCharacter(snap, owned) {
    const taken = new Set(Object.values(snap.explorers).map(e => e.character).filter(c => c && c !== 'hidden'));
    for (const eid of owned) {
      if (snap.explorers[eid].character) continue;
      let pool = CHAR_PREF.filter(c => !taken.has(c));
      if (this.level === 'easy') pool = pool.sort(() => this.rnd() - 0.5);
      const char = pool[0];
      if (char) return { action: { type: 'character', eid, char }, delay: this.thinkDelay(1.2) };
    }
    return null;
  }

  // ───────── explorer phase ─────────
  explorerTurns(snap, owned) {
    if (snap.waitingOnRuins) return null;
    const active = snap.activeExplorerId;
    if (!active) {
      const mine = owned.filter(id => !snap.explorers[id].done);
      if (!mine.length) return null;
      const othersHuman = Object.values(snap.explorers).some(e => !e.done && !e.ownerIsYou && !e.ownerCpu);
      if (othersHuman) {
        // give human teammates a moment to claim first
        const now = Date.now();
        if (!this.waitSince) this.waitSince = now;
        const left = snap.turnClaimDeadline ? snap.turnClaimDeadline - now : 0;
        if (now - this.waitSince < 6000 && left > 9000) return { action: null, delay: 1200 };
      }
      this.waitSince = 0;
      const eid = this.chooseFirst(snap, mine);
      return { action: { type: 'claimTurn', eid }, delay: this.thinkDelay(0.8) };
    }
    this.waitSince = 0;
    if (!owned.includes(active)) return this.maybeShareBoard(snap);
    const tk = `${snap.round}:${active}:${snap.turnSeq}`;
    if (this.turnKey !== tk) {
      this.turnKey = tk; this.turnExplores = 0; this.turnMoves = 0; this.intent = null;
      // explores allowed this turn: a fractional cap, a little higher with three explorers to gather
      const c = this.cfg.turnCap + (Object.keys(snap.explorers).length >= 3 ? this.cfg.trioBonus : 0);
      this.turnCapNow = Math.floor(c) + (this.rnd() < c - Math.floor(c) ? 1 : 0);
    }
    return this.turnAction(snap, active);
  }

  chooseFirst(snap, mine) {
    const ctx = this.context(snap);
    if (ctx.plan) {
      const movers = mine.filter(id => (ctx.plan.costs[id] ?? 0) > 0 || (ctx.plan.paths[id]?.length ?? 0) > 0);
      if (movers.length) return movers[0];
    }
    return mine[Math.floor(this.rnd() * mine.length)];
  }

  context(snap) {
    const know = buildKnowledge(snap);
    const sol = solve(know, { limit: 30000 });
    const sum = summarize(know, sol);
    // information estimates run on an even sample when the placement space is huge
    let sample = sol.combos;
    if (sample.length > SAMPLE) { const step = sample.length / SAMPLE; sample = Array.from({ length: SAMPLE }, (_, i) => sol.combos[Math.floor(i * step)]); }
    const ctx = { know, sol, sum, plan: null, sample, classes: null, sClasses: null };
    if (sol.combos.length) {
      // most likely relative frame
      const group = (list) => {
        const m = new Map();
        for (const c of list) { const rk = relKey(know, c); if (!m.has(rk)) m.set(rk, []); m.get(rk).push(c); }
        return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
      };
      ctx.classes = group(sol.combos);
      ctx.sClasses = sample === sol.combos ? ctx.classes : group(sample);
      ctx.topCombos = ctx.classes[0][1];
      ctx.topProb = ctx.topCombos.length / sol.combos.length;
      if (ctx.topProb >= this.cfg.planAt || sum.relCertain) ctx.plan = this.meetingPlan(snap, know, ctx.topCombos);
    }
    return ctx;
  }

  // Plan a meeting room in the team frame (explorer 0's local coordinates) for one relative class.
  meetingPlan(snap, know, combos) {
    const ids = know.ids;
    const c0 = combos[0];
    const s0x = c0[0] % SIZE, s0y = Math.floor(c0[0] / SIZE);
    const off = ids.map((id, i) => ({ x: c0[i] % SIZE - s0x, y: Math.floor(c0[i] / SIZE) - s0y }));
    // team-known cells in the team frame
    const known = new Map(), mine = ids.map(() => new Set());
    ids.forEach((id, i) => {
      for (const c of know.cells[id]) {
        const tk = k(c.lx + off[i].x, c.ly + off[i].y);
        known.set(tk, c.v);
        if (c.v === 'open') mine[i].add(tk);
      }
    });
    // probability that an unknown team-frame cell lies inside the 5×5 box
    const insideProb = (tx, ty) => {
      let n = 0;
      for (const c of combos) { const ax = c[0] % SIZE + tx, ay = Math.floor(c[0] / SIZE) + ty; if (ax >= 0 && ay >= 0 && ax < SIZE && ay < SIZE) n++; }
      return n / combos.length;
    };
    const cur = ids.map((id, i) => ({ x: know.local[id].x + off[i].x, y: know.local[id].y + off[i].y }));
    const stepCost = (i, tx, ty) => {
      const v = known.get(k(tx, ty));
      if (v === 'wall') return Infinity;
      if (mine[i].has(k(tx, ty))) return 0.001;
      if (v === 'open') return 1;
      const pin = insideProb(tx, ty);
      if (pin <= 0.001) return Infinity;
      const pw = 1 - pin + pin * P_WALL;
      return 1 + pw * 4;
    };
    const dijkstra = (i) => {
      const dist = new Map(), prev = new Map();
      const start = k(cur[i].x, cur[i].y);
      dist.set(start, 0);
      const pq = [[0, cur[i].x, cur[i].y]];
      while (pq.length) {
        pq.sort((a, b) => a[0] - b[0]);
        const [d, x, y] = pq.shift();
        if (d > (dist.get(k(x, y)) ?? Infinity)) continue;
        for (const dir of DIR_KEYS) {
          const nx = x + DIRS[dir].dx, ny = y + DIRS[dir].dy;
          if (Math.abs(nx - cur[0].x) > 7 || Math.abs(ny - cur[0].y) > 7) continue;
          const c = stepCost(i, nx, ny);
          if (!Number.isFinite(c)) continue;
          const nd = d + c, nk = k(nx, ny);
          if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, { from: k(x, y), dir }); pq.push([nd, nx, ny]); }
        }
      }
      return { dist, prev };
    };
    const runs = ids.map((_, i) => dijkstra(i));
    let best = null;
    const candidates = new Set(runs[0].dist.keys());
    for (const tk of candidates) {
      const [tx, ty] = tk.split(',').map(Number);
      if (known.get(tk) === 'wall') continue;
      let total = 0, ok = true, worst = 0;
      for (let i = 0; i < ids.length; i++) { const d = runs[i].dist.get(tk); if (d == null) { ok = false; break; } total += d; worst = Math.max(worst, d); }
      if (!ok) continue;
      const unknownPenalty = known.get(tk) === 'open' ? 0 : 0.8;
      const score = total + worst * 0.15 + unknownPenalty;
      if (!best || score < best.score) best = { score, tx, ty };
    }
    if (!best) return null;
    const paths = {}, costs = {};
    ids.forEach((id, i) => {
      const path = [];
      let at = k(best.tx, best.ty);
      const startK = k(cur[i].x, cur[i].y);
      while (at !== startK) { const p = runs[i].prev.get(at); if (!p) break; path.unshift(p.dir); at = p.from; }
      paths[id] = path;
      costs[id] = runs[i].dist.get(k(best.tx, best.ty)) || 0;
    });
    return { target: { x: best.tx, y: best.ty }, paths, costs, off, cur, ids };
  }

  turnAction(snap, eid) {
    const e = snap.explorers[eid], map = snap.maps[eid];
    const ctx = this.context(snap);
    const timeLeft = snap.time.total;
    const delay = this.thinkDelay();
    const here = k(map.localPos.x, map.localPos.y);
    const endTurn = () => ({ action: { type: 'endTurn', eid }, delay: this.thinkDelay(0.8) });

    // 1) everyone already together → just end turns
    if (ctx.sum.allTogether) return { action: { type: 'endTurn', eid }, delay };

    const capped = this.turnExplores >= (this.turnCapNow ?? this.cfg.turnCap);

    // 2) finish "walk to a frontier, then explore from there"
    const intent = this.intent;
    this.intent = null;
    if (intent && intent.tk === this.turnKey && intent.at === here && !e.blocked && timeLeft > 0 && !capped) {
      const t = k(map.localPos.x + DIRS[intent.dir].dx, map.localPos.y + DIRS[intent.dir].dy);
      if (!map.discovered[t]) { this.turnExplores++; return { action: { type: 'explore', eid, dir: intent.dir }, delay }; }
    }

    // 3) follow the meeting plan
    if (ctx.plan && !e.blocked) {
      const step = this.followPlan(snap, eid, ctx.plan, delay, capped);
      if (step) return step;
    }

    // 4) abilities when they are informative, otherwise the most informative exploration
    //    anywhere on the explorer's own map (walking over known rooms is free)
    const ab = this.bestAbility(snap, eid, ctx);
    const ex = (!e.blocked && timeLeft > 0 && !capped) ? this.bestExplore(snap, eid, ctx) : null;
    const budget = this.cfg.exploreBudget - (timeLeft < 14 ? 1 : 0) - (ctx.plan ? 1 : 0);
    const exploreAllowed = ex && (this.turnExplores < budget || ex.gain > 0.9);
    if (ab && (!exploreAllowed || ab.score >= ex.score * 0.9)) return { action: ab.action, delay: this.thinkDelay(1.3) };
    const useful = exploreAllowed && (ex.score > 0.05 - this.cfg.noise * 0.2 || (this.turnExplores === 0 && !ctx.plan));
    if (useful) return this.exploreAt(eid, ex, delay);

    // 5) nothing informative left: head for the most likely meeting room anyway —
    //    the walls met on the way settle which arrangement is real
    if (!ctx.plan && ctx.topCombos && !e.blocked && this.turnExplores < budget + 1) {
      const plan = this.meetingPlan(snap, ctx.know, ctx.topCombos);
      const step = plan && this.followPlan(snap, eid, plan, delay, capped);
      if (step) return step;
    }
    // 6) a stalled explorer with time left still opens up the map
    if (ex && this.turnExplores === 0 && ex.pwall < 0.95) return this.exploreAt(eid, ex, delay);
    return endTurn();
  }

  followPlan(snap, eid, plan, delay, capped = false) {
    const map = snap.maps[eid];
    const path = plan.paths[eid] || [];
    if (!path.length) return null;
    // walk known rooms in one go, then explore the first unknown step
    const known = [];
    let x = map.localPos.x, y = map.localPos.y;
    for (const d of path) {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy, v = map.discovered[k(nx, ny)];
      if (v === 'open' || v === 'start') { known.push(d); x = nx; y = ny; } else break;
    }
    if (known.length) {
      if (this.turnMoves > 24) return null; // never shuffle back and forth forever
      this.turnMoves += known.length;
      return { action: { type: 'movePath', eid, dirs: known }, delay };
    }
    const nx = x + DIRS[path[0]].dx, ny = y + DIRS[path[0]].dy;
    if (map.discovered[k(nx, ny)] === 'wall' || capped) return null;
    if (snap.time.total > 0) { this.turnExplores++; return { action: { type: 'explore', eid, dir: path[0] }, delay }; }
    return null;
  }

  exploreAt(eid, ex, delay) {
    if (!ex.path.length) { this.turnExplores++; return { action: { type: 'explore', eid, dir: ex.dir }, delay }; }
    this.turnMoves += ex.path.length;
    this.intent = { tk: this.turnKey, at: ex.at, dir: ex.dir };
    return { action: { type: 'movePath', eid, dirs: ex.path }, delay };
  }

  // Known rooms reachable from the explorer's square, each with the path there.
  reachable(map) {
    const s = map.localPos, out = new Map();
    const first = { x: s.x, y: s.y, path: [] };
    out.set(k(s.x, s.y), first);
    const q = [first];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c.path.length >= this.cfg.reach) continue;
      for (const d of DIR_KEYS) {
        const nx = c.x + DIRS[d].dx, ny = c.y + DIRS[d].dy, kk = k(nx, ny);
        if (out.has(kk)) continue;
        const v = map.discovered[kk];
        if (v !== 'open' && v !== 'start') continue;
        const n = { x: nx, y: ny, path: [...c.path, d] };
        out.set(kk, n); q.push(n);
      }
    }
    return out;
  }

  // Probability mass over relative classes after observing an outcome.
  gainFrom(ctx, outcomeOf) {
    const classes = ctx.sClasses;
    if (!classes || classes.length <= 1) return 0;
    const total = ctx.sample.length;
    const prior = classes.map(([, cs]) => cs.length / total);
    const h0 = H(prior);
    const byOutcome = new Map(); // outcome -> per-class mass
    classes.forEach(([, cs], ci) => {
      for (const c of cs) {
        const dist = outcomeOf(c); // [[outcome, prob], ...]
        for (const [o, p] of dist) {
          if (!byOutcome.has(o)) byOutcome.set(o, new Array(classes.length).fill(0));
          byOutcome.get(o)[ci] += p / total;
        }
      }
    });
    let eh = 0;
    for (const masses of byOutcome.values()) {
      const po = masses.reduce((a, b) => a + b, 0);
      if (po <= 0) continue;
      eh += po * H(masses.map(m => m / po));
    }
    return Math.max(0, h0 - eh);
  }

  cellStatus(ctx, combo, eid, lx, ly) {
    const i = ctx.know.ids.indexOf(eid);
    const ax = combo[i] % SIZE + lx, ay = Math.floor(combo[i] / SIZE) + ly;
    if (ax < 0 || ay < 0 || ax >= SIZE || ay >= SIZE) return 'wall';
    if (!combo._grid) Object.defineProperty(combo, '_grid', { value: mergedGrid(ctx.know, combo), enumerable: false });
    return combo._grid[ay * SIZE + ax] || null;
  }

  bestExplore(snap, eid, ctx) {
    const map = snap.maps[eid];
    const n = ctx.sample.length || 1;
    let best = null;
    for (const cell of this.reachable(map).values()) {
      for (const d of DIR_KEYS) {
        const lx = cell.x + DIRS[d].dx, ly = cell.y + DIRS[d].dy;
        if (map.discovered[k(lx, ly)]) continue;
        let pwall = 0;
        for (const c of ctx.sample) { const st = this.cellStatus(ctx, c, eid, lx, ly); pwall += st === 'wall' ? 1 : st === 'open' ? 0 : P_WALL; }
        pwall = ctx.sample.length ? pwall / n : P_WALL;
        if (pwall > 0.995 && ctx.sample.length) continue; // a certain wall teaches nothing
        const gain = this.gainFrom(ctx, (c) => {
          const st = this.cellStatus(ctx, c, eid, lx, ly);
          if (st === 'wall') return [['w', 1]];
          if (st === 'open') return [['o', 1]];
          return [['w', P_WALL], ['o', 1 - P_WALL]];
        });
        // also value plain localisation (absolute uncertainty) a little
        const locGain = ctx.sample.length > 1 ? (pwall > 0.05 && pwall < 0.95 ? 0.15 : 0.03) : 0;
        const walk = cell.path.length * 0.02;
        const score = gain + locGain - pwall * 0.35 - walk + (this.rnd() - 0.5) * this.cfg.noise * 0.6;
        if (!best || score > best.score) best = { dir: d, score, gain, pwall, path: cell.path, at: k(cell.x, cell.y) };
      }
    }
    return best;
  }

  bestAbility(snap, eid, ctx) {
    const e = snap.explorers[eid];
    if (e.fatigue || !e.character) return null;
    const options = [];
    const consider = (charKey, via, sourceId) => {
      const r = this.abilityOption(snap, eid, ctx, charKey);
      if (!r) return;
      const action = via
        ? { type: 'ability', eid, data: { sourceExplorerId: sourceId, copy: r.data } }
        : { type: 'ability', eid, data: r.data };
      options.push({ score: r.score * this.cfg.abilityBias, action });
    };
    if (e.character === 'apprentice') {
      for (const o of Object.values(snap.explorers)) if (o.id !== eid && o.character && o.character !== 'apprentice' && o.character !== 'hidden') consider(o.character, true, o.id);
    } else consider(e.character, false);
    options.sort((a, b) => b.score - a.score);
    const best = options[0];
    if (!best) return null;
    const threshold = 0.22 + this.cfg.noise * 0.2 - (snap.time.phase >= 2 && e.abilityUses === 0 ? 0.12 : 0);
    return best.score > threshold ? best : null;
  }

  abilityOption(snap, eid, ctx, charKey) {
    const map = snap.maps[eid];
    const lp = map.localPos;
    const others = Object.values(snap.explorers).filter(o => o.id !== eid);
    switch (charKey) {
      case 'guide': {
        let best = null;
        for (const t of others) {
          const ti = ctx.know.ids.indexOf(t.id), ei = ctx.know.ids.indexOf(eid);
          const tl = snap.maps[t.id].localPos;
          const gain = this.gainFrom(ctx, (c) => {
            const ax = c[ei] % SIZE + lp.x, ay = Math.floor(c[ei] / SIZE) + lp.y;
            const bx = c[ti] % SIZE + tl.x, by = Math.floor(c[ti] / SIZE) + tl.y;
            const v = [];
            if (by < ay) v.push('N'); if (bx > ax) v.push('E'); if (by > ay) v.push('S'); if (bx < ax) v.push('W');
            const list = v.length ? v : DIR_KEYS;
            return list.map(d => [d, 1 / list.length]);
          });
          if (!best || gain > best.score) best = { score: gain, data: { targetExplorerId: t.id } };
        }
        return best;
      }
      case 'monk': {
        let best = null;
        for (const d of DIR_KEYS) {
          const gain = this.gainFrom(ctx, (c) => {
            let x = lp.x, y = lp.y, walls = 0, unknown = 0;
            for (;;) {
              x += DIRS[d].dx; y += DIRS[d].dy;
              const st = this.cellStatus(ctx, c, eid, x, y);
              const i = ctx.know.ids.indexOf(eid);
              const ax = c[i] % SIZE + x, ay = Math.floor(c[i] / SIZE) + y;
              if (ax < 0 || ay < 0 || ax >= SIZE || ay >= SIZE) break;
              if (st === 'wall') walls++; else if (st == null) unknown++;
            }
            // binomial over unknown cells
            const out = [];
            for (let j = 0; j <= unknown; j++) out.push([walls + j, binom(unknown, j) * P_WALL ** j * (1 - P_WALL) ** (unknown - j)]);
            return out;
          });
          if (!best || gain > best.score) best = { score: gain * 0.9, data: { dir: d } };
        }
        return best;
      }
      case 'archaeologist': {
        let best = null;
        for (const d of DIR_KEYS) {
          const kk = k(lp.x + DIRS[d].dx, lp.y + DIRS[d].dy);
          if (map.discovered[kk] !== 'wall' || map.wallKinds?.[kk]) continue;
          const lx = lp.x + DIRS[d].dx, ly = lp.y + DIRS[d].dy;
          const i = ctx.know.ids.indexOf(eid);
          const gain = this.gainFrom(ctx, (c) => {
            const ax = c[i] % SIZE + lx, ay = Math.floor(c[i] / SIZE) + ly;
            return [[ax < 0 || ay < 0 || ax >= SIZE || ay >= SIZE ? 'outer' : 'inner', 1]];
          });
          // localisation value even if relative frame is already known
          const loc = ctx.sample.length > 1 ? 0.25 : 0;
          if (!best || gain + loc > best.score) best = { score: gain + loc, data: { dir: d } };
        }
        return best;
      }
      case 'geographer': {
        if (snap.time.total < 3) return null;
        const unk = DIR_KEYS.filter(d => !map.discovered[k(lp.x + DIRS[d].dx, lp.y + DIRS[d].dy)]);
        if (unk.length < 2) return null;
        let best = null;
        for (let a = 0; a < unk.length; a++) for (let b = a + 1; b < unk.length; b++) {
          const dirs = [unk[a], unk[b]];
          const gain = this.gainFrom(ctx, (c) => {
            let res = [['', 1]];
            for (const d of dirs) {
              const st = this.cellStatus(ctx, c, eid, lp.x + DIRS[d].dx, lp.y + DIRS[d].dy);
              const opts = st === 'wall' ? [['w', 1]] : st === 'open' ? [['o', 1]] : [['w', P_WALL], ['o', 1 - P_WALL]];
              const next = [];
              for (const [o1, p1] of res) for (const [o2, p2] of opts) next.push([o1 + o2, p1 * p2]);
              res = next;
            }
            return res;
          });
          const score = gain + 0.18 - 0.12; // safe peek, but costs 2 tiles
          if (!best || score > best.score) best = { score, data: { dirs } };
        }
        return best;
      }
      case 'doctor': {
        const valuable = others.filter(o => o.fatigue && ['guide', 'geographer', 'archaeologist', 'monk', 'apprentice'].includes(o.character) && !o.done);
        if (!valuable.length) return null;
        return { score: 0.45, data: { targetExplorerId: valuable[0].id } };
      }
      case 'mercenary': {
        const recentlyHit = (snap.intel || []).some(i => i.kind === 'attack' && i.target === eid && i.round >= snap.round - 1);
        const score = recentlyHit ? 0.5 : snap.time.phase >= 2 ? 0.28 : 0.1;
        return { score, data: {} };
      }
      default: return null;
    }
  }

  // Mixed teams: drop our best arrangement on the shared board so humans can see it.
  maybeShareBoard(snap) {
    if (!snap.teamBoard) return null;
    const hasHuman = Object.values(snap.explorers).some(e => !e.ownerIsYou && !e.ownerCpu);
    if (!hasHuman) return null;
    const ctx = this.context(snap);
    if (!ctx.sum.relCertain || !ctx.sol.combos.length) return null;
    const combo = ctx.sol.combos[0];
    const rk = relKey(ctx.know, combo);
    if (this.lastBoardRel === rk) return null;
    const layers = snap.teamBoard.layers || {};
    for (let i = 0; i < ctx.know.ids.length; i++) {
      const id = ctx.know.ids[i];
      const want = { x: combo[i] % SIZE + 1, y: Math.floor(combo[i] / SIZE) + 1 };
      const L = layers[id];
      const fresh = L && Date.now() - L.t < 45000 && !String(L.by || '').startsWith('CPU');
      if (fresh) continue;
      if (!L || L.x !== want.x || L.y !== want.y) return { action: { type: 'tbMove', eid: id, x: want.x, y: want.y }, delay: 900 };
    }
    this.lastBoardRel = rk;
    return { action: { type: 'chat', text: '作戦盤に推理を並べました', stamp: true }, delay: 600 };
  }

  // ───────── escape vote ─────────
  vote(snap) {
    const me = snap.escapeVotes.find(v => v.isYou);
    if (!me || me.vote) return null;
    if (snap.stage === 'finalEscape') return { action: { type: 'vote', vote: 'go' }, delay: this.thinkDelay(1.2) };
    const ctx = this.context(snap);
    let go = ctx.sum.allTogether;
    if (!go && ctx.sum.togetherProb >= this.cfg.escapeRisk && ctx.sum.count > 0) go = true;
    if (!go && snap.time.total <= 3 && ctx.sum.togetherProb >= 0.5) go = true;
    return { action: { type: 'vote', vote: go ? 'go' : 'wait' }, delay: this.thinkDelay(1.4) };
  }

  // ───────── prediction ─────────
  predict(snap, owned) {
    for (const eid of owned) {
      const e = snap.explorers[eid];
      if (e.predictionSubmitted) continue;
      let choice = 'rest';
      if (!e.alertLocked) {
        const intel = snap.intel || [];
        // how aggressive has the ruins player been? (attacks per explorer-round so far)
        const attacks = intel.filter(i => i.kind === 'attack' && i.type !== 'super').length;
        const rounds = Math.max(1, snap.round - 1), n = Object.keys(snap.explorers).length;
        const rate = attacks / (rounds * n);
        let p = this.level === 'hard' ? 0.25 + rate * 0.9 : [0, 0.3, 0.42, 0.48, 0.45][snap.time.phase] || 0.4;
        const hits = intel.filter(i => i.kind === 'attack' && i.target === eid);
        if (hits.some(h => h.round === snap.round - 1)) p += 0.12;
        const enc = intel.filter(i => i.kind === 'encounter' && i.target === eid && i.round >= snap.round - 1);
        if (enc.length) p += 0.15;
        if (snap.time.phase >= 4) p -= 0.05; // the guardian ignores alert
        if (this.level === 'easy') p = 0.33;
        choice = this.rnd() < Math.max(0.15, Math.min(0.75, p)) ? 'alert' : 'rest';
      }
      this.secrets.set(`${snap.round}:${eid}`, choice);
      const commit = `cpu-${eid}-${snap.round}-${Math.floor(this.rnd() * 1e12).toString(36)}-commit`;
      return { action: { type: 'predict', eid, commit }, delay: this.thinkDelay(1.1) };
    }
    return null;
  }
}

function binom(n, r) { let v = 1; for (let i = 1; i <= r; i++) v = v * (n - r + i) / i; return v; }

export const characterInfo = (key) => CHARACTER_MAP[key];
