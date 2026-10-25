// クォ・ヴァディス: CPU-only games, to see that games end, how long they take and how the levels compare.
//   node tools/quovadis-selfplay.mjs [games=200] [players=3,4,5] [levels=2]
// The negotiation is played the way the page plays it: the mover asks the voters it planned for; a voter answers
// yes, names a price, or refuses; the mover pays a named price only if the move still beats its next plan.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../quo-vadis/engine.js');
const AI = require('../quo-vadis/ai.js');
const D = require('../quo-vadis/data.js');

const games = +(process.argv[2] || 200);
const counts = (process.argv[3] || '3,4,5').split(',').map(Number);
const levelArg = (process.argv[4] || '2').split(',').map(Number);

export function cpuTurn(st, rnd, stats) {
  if (st.phase === 'bonus') {
    const by = st.bonus.by;
    const to = AI.bonus(st, by, st.players[by].level, rnd);
    return E.apply(st, by, { t: 'bonus', to });
  }
  const p = st.turn, lvl = st.players[p].level;
  const cands = AI.decide(st, p, lvl, rnd);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (!c.asks) { const r = E.apply(st, p, c.act); if (r.ok) return r; continue; }
    let act = E.clone(c.act), ok = true;
    for (const a of c.asks) {
      const ans = AI.respond(st, a.q, { mover: p, from: act.from, to: act.to, votes: a.k, pay: a.pay }, st.players[a.q].level, rnd);
      if (stats) stats.asks++;
      if (ans.ok) continue;
      if (ans.ask !== undefined) {
        const rest = cands.slice(i + 1).find((x) => !x.asks);
        const acc = AI.acceptCounter(st, p, { act }, a.q, ans.ask, lvl, rest ? rest.val : undefined);
        if (acc) { act = acc; if (stats) stats.counters++; continue; }
      }
      if (E.owes(st, a.q, p)) E.breakPromise(st, a.q, p);
      ok = false; if (stats) stats.refused++;
      break;
    }
    if (!ok) continue;
    const r = E.apply(st, p, act);
    if (r.ok) return r;
    if (stats) stats.bad = (stats.bad || 0) + 1;
  }
  return E.apply(st, p, { t: 'caesar', to: E.caesarTargets(st)[0] });
}

function play(n, levels, seed) {
  const rnd = E.mulberry32(seed * 7919 + 13);
  const players = [];
  for (let i = 0; i < n; i++) players.push({ name: 'CPU' + (i + 1), kind: 'cpu', level: levels[i % levels.length], color: D.PLAYER_COLORS[i].key });
  const st = E.newGame({ players, seed });
  const stats = { asks: 0, counters: 0, refused: 0, caesar: 0, moves: 0, places: 0 };
  let guard = 0;
  while (st.phase !== 'over' && guard < 1500) {
    const r = cpuTurn(st, rnd, stats);
    if (!r.ok) throw new Error('illegal ' + r.err);
    r.ev.forEach((e) => { if (e.e === 'caesar' && !e.bonus) stats.caesar++; if (e.e === 'move') stats.moves++; if (e.e === 'place') stats.places++; });
    guard++;
  }
  return { st, stats, turns: st.turnNo, stalled: st.phase !== 'over' };
}

if (process.argv[1] && process.argv[1].endsWith('quovadis-selfplay.mjs')) {
  for (const n of counts) {
    let sumTurns = 0, stalled = 0, sumWin = 0, sumPts = 0, unq = 0, maxTurns = 0;
    const wins = {}, agg = { asks: 0, counters: 0, refused: 0, caesar: 0, moves: 0, places: 0 };
    const t0 = Date.now();
    for (let g = 0; g < games; g++) {
      const levels = levelArg.length > 1 ? levelArg : [levelArg[0]];
      const r = play(n, levels, g + 1);
      if (r.stalled) { stalled++; continue; }
      sumTurns += r.turns; maxTurns = Math.max(maxTurns, r.turns);
      const res = r.st.over;
      const w = res.rows[0];
      sumWin += w.pts;
      res.rows.forEach((row) => { sumPts += row.pts; if (!row.qualified) unq++; });
      const lv = r.st.players[res.winner].level;
      wins[lv] = (wins[lv] || 0) + 1;
      Object.keys(agg).forEach((k) => { agg[k] += r.stats[k]; });
    }
    const done = games - stalled;
    console.log(`${n} players: ${games} games, stalled ${stalled}, avg turns ${(sumTurns / done).toFixed(1)} (max ${maxTurns}), ` +
      `winner avg ${(sumWin / done).toFixed(1)} pts, player avg ${(sumPts / done / n).toFixed(1)}, unqualified/game ${(unq / done).toFixed(2)}, ` +
      `per game: moves ${(agg.moves / done).toFixed(1)}, places ${(agg.places / done).toFixed(1)}, caesar ${(agg.caesar / done).toFixed(1)}, asks ${(agg.asks / done).toFixed(1)}, counters ${(agg.counters / done).toFixed(1)}, refused ${(agg.refused / done).toFixed(1)}; ` +
      `wins by level ${JSON.stringify(wins)}  (${((Date.now() - t0) / done).toFixed(0)} ms/game)`);
  }
}
