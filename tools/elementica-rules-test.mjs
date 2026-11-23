// エレメンティカ: rules and CPU checks (no browser).
//   node tools/elementica-rules-test.mjs            rules, random games, CPU games
//   node tools/elementica-rules-test.mjs --league   also a longer CPU-vs-CPU league with timings
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(root, 'elementica/engine.js'));
globalThis.EL_ENG = E;
const AI = require(path.join(root, 'elementica/ai.js'));

const failures = [];
function check(ok, msg) { if (!ok) { failures.push(msg); console.log('FAIL ' + msg); } }
function eq(a, b, msg) { check(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
const players = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i, cpu: 2 }));

/* ---------------------------------------------------------------- set-up */
for (const n of [2, 3, 4]) {
  const S = E.newGame({ players: players(n), seed: 7 + n });
  const open = S.hexes.filter(h => !h.covered);
  eq(S.hexes.length, 54, n + 'p map has 54 hexes');
  eq(open.filter(h => h.x).length, 6, n + 'p has 6 X hexes');
  const chips = open.filter(h => h.token).length;
  eq(chips, { 2: 30, 3: 39, 4: 48 }[n], n + 'p chips on the map');
  check(open.every(h => h.x ? !h.token : !!h.token), n + 'p every open non-X hex has a chip');
  for (let a = 0; a < 3; a++) eq(S.hexes.filter(h => h.area === a).length, 18, n + 'p area ' + a + ' has 18 hexes');
  eq(S.areaTiles.length, 3, n + 'p three area tiles');
  if (n === 2) check(S.areaTiles.indexOf('T9') < 0, '2p never uses T9');
  else check(S.areaTiles.indexOf('T4') < 0, n + 'p never uses T4');
  eq(S.objAreas.map(a => a.length), [n + 1, n + 1], n + 'p objective areas');
  eq(S.players[0].standby.length, 3, 'three white chips');
  eq(E.who(S).pid, S.order[n - 1], n + 'p prep starts with the last player');
  const clash = open.some(h => h.token && E.TOKEN_TYPES[S.toks[h.token].type].front.icon === h.icon && h.icon && h.icon !== 'coin');
  check(!clash, n + 'p no mining/water chip on a hex with the same icon');
}

/* ---------------------------------------------------------------- costs and matching */
{
  const S = E.newGame({ players: players(3), seed: 3 });
  const h0 = S.hexes.find(h => !h.covered && h.ring === 3);
  const nb = E.neighbors(S, h0.id);
  S.hexes[nb[0]].base = 0; S.hexes[nb[1]].base = 1; S.hexes[nb[2]].base = 1;
  const c = E.baseCost(S, 0, h0.id);
  eq([c.supply, c.rivals.length, c.total], [1, 2, 3], 'base cost: -1 per own neighbour, +1 to each rival neighbour');
  S.hexes[nb[3]].base = 0; S.hexes[nb[4]].base = 0;
  eq(E.baseCost(S, 0, h0.id).supply, 0, 'base cost never below 0');

  const p = S.players[0];
  p.forge[3] = { key: 'G1' }; p.forge[4] = { key: 'B1' }; p.forge[5] = { key: 'O1' };
  eq(E.matchRows(p, ['G', 'B', 'O']), [1], 'colours match a full row left to right');
  eq(E.matchRows(p, ['O', 'B', 'G']), [], 'no reversal');
  eq(E.matchRows(p, ['G', 'W', 'O']), [1], 'one rainbow is any colour');
  eq(E.matchRows(p, ['W', 'W', 'O']), [], 'two rainbows never match');
  p.forge[9] = { art: 'A_GB', part: 0 }; p.forge[10] = { art: 'A_GB', part: 1 }; p.forge[11] = { key: 'P1' };
  eq(E.matchRows(p, ['B', 'G', 'P']), [3], 'artifact counts as either colour');
}

/* ---------------------------------------------------------------- water and area scoring */
{
  eq(E.waterMana([{ cap: 2, flat: 0 }, { cap: 4, flat: 2 }], 3), 5, 'water: the flat bonus tile gets water first');
  eq(E.waterMana([{ cap: 2, flat: 0 }], 5), 2, 'water: capped');
  const S = E.newGame({ players: players(4), seed: 11 });
  S.areaTiles = ['T7', 'T7', 'T7'];
  const edge = S.hexes.filter(h => !h.covered && h.ring === 4 && h.area === 0);
  edge[0].base = 0; edge[1].base = 0; edge[2].base = 1; edge[3].base = 1; edge[4].base = 2;
  const a = E.areaScores(S)[0];
  eq(a.rows.map(r => r.vp), [1, 1, 0, 0], 'a tie for 1st scores the 2nd-place rate, nobody is 2nd');
  edge[5].base = 0;
  const b = E.areaScores(S)[0];
  eq(b.rows.map(r => r.vp), [3, 1, 0, 0], 'sole 1st takes the 1st-place rate, sole 2nd the 2nd-place rate');
  edge[3].base = null;
  const b2 = E.areaScores(S)[0];
  eq(b2.rows.map(r => r.vp), [3, 0, 0, 0], 'sole 1st, a tie for 2nd scores nothing');
  const c = E.areaScores(S)[1];
  eq(c.rows.map(r => r.vp), [0, 0, 0, 0], 'no base in the area: no points there (errata)');
}

/* ---------------------------------------------------------------- an action resolves left to right */
{
  const S = E.newGame({ players: players(2), seed: 5 });
  // prep for both
  for (let k = 0; k < 2; k++) {
    const w = E.who(S);
    E.applyPrep(S, w.pid, E.legalHexes(S, w.pid, true)[0].hex);
  }
  eq([S.round, S.phase, S.left], [1, 'action', 1], 'round 1 starts with one action');
  const pid = E.who(S).pid, p = S.players[pid];
  const coin = p.standby.find(id => S.toks[id].type === 'N_COIN');
  const before = p.coins;
  E.applyAction(S, pid, { slots: [{ tok: coin, face: 'f' }, { skip: true }, { skip: true }], choices: [] });
  eq(S.players[pid].coins, before + 2, 'white coin chip pays 2');
  check(S.players[pid].used.indexOf(coin) >= 0, 'used chip goes to the used pile');
}

/* ---------------------------------------------------------------- random games end cleanly */
function randomChooser(rnd) {
  return req => {
    if (req.k === 'hex') return rnd() < 0.15 && !req.prep ? null : req.options[Math.floor(rnd() * req.options.length)].hex;
    if (req.k === 'build') {
      if (rnd() < 0.2) return null;
      const o = req.options[Math.floor(rnd() * req.options.length)];
      const sp = o.art ? req.pairs : req.spaces;
      return { key: o.key, space: sp[Math.floor(rnd() * sp.length)] };
    }
    if (req.k === 'obj') return req.options[Math.floor(rnd() * req.options.length)];
    return null;
  };
}
function randomMove(S, rnd) {
  const w = E.who(S), p = S.players[w.pid];
  if (w.kind === 'prep') { const L = E.legalHexes(S, w.pid, true); E.applyPrep(S, w.pid, L[Math.floor(rnd() * L.length)].hex); return; }
  if (w.kind === 'produce') {
    const info = E.produceInfo(S, w.pid);
    let plan = { fire: info.fire.map(() => Math.floor(rnd() * 3)), dark: info.dark.map(() => Math.floor(rnd() * 3)) };
    if (!E.produceResult(S, w.pid, plan).ok) plan = {};
    E.applyProduce(S, w.pid, plan);
    return;
  }
  const slots = [null, null, null], pool = p.standby.slice();
  for (let s = 0; s < 3; s++) if (pool.length && rnd() < 0.5) slots[s] = { tok: pool.splice(Math.floor(rnd() * pool.length), 1)[0], face: rnd() < 0.8 ? 'f' : 'b' };
  const c = E.clone(S);
  const choices = E.drive(E.actionGen(c, w.pid, slots), randomChooser(rnd));
  E.applyAction(S, w.pid, { slots, choices });
}
for (let g = 0; g < 60; g++) {
  const n = 2 + (g % 3), rnd = E.mulberry32(1000 + g);
  const S = E.newGame({ players: players(n), seed: 500 + g });
  let steps = 0;
  try {
    while (S.phase !== 'end' && steps < 5000) {
      // sometimes a free action that might be refused
      const w = E.who(S);
      if (rnd() < 0.05) { try { E.applyFree(S, w.pid, { k: rnd() < 0.5 ? 'buy' : 'g2c' }); } catch (e) { /* not allowed now */ } }
      randomMove(S, rnd); steps++;
    }
  } catch (e) { check(false, 'random game ' + g + ' threw: ' + e.message); continue; }
  check(S.phase === 'end', 'random game ' + g + ' ends (round ' + S.round + ')');
  check(S.players.every(p => p.coins >= 0 && p.gems >= 0), 'random game ' + g + ' never goes below 0 coins/gems');
  check(S.result && S.result.order.length === n, 'random game ' + g + ' has a result');
}

/* ---------------------------------------------------------------- CPU games */
function playCpu(n, levels, seed, quiet) {
  const S = E.newGame({ players: levels.map((l, i) => ({ name: 'L' + l + '#' + i, cpu: l })), seed });
  const rnd = E.mulberry32(seed * 7 + 1);
  let maxMs = 0, total = 0, count = 0;
  while (S.phase !== 'end') {
    const w = E.who(S), lvl = S.players[w.pid].cpu;
    const t0 = performance.now();
    const d = AI.decide(S, lvl, rnd);
    const ms = performance.now() - t0;
    if (w.kind === 'action') { maxMs = Math.max(maxMs, ms); total += ms; count++; }
    if (d.k === 'prep') E.applyPrep(S, w.pid, d.hex);
    else if (d.k === 'produce') { (d.free || []).forEach(a => E.applyFree(S, w.pid, a)); E.applyProduce(S, w.pid, d.plan); }
    else { (d.free || []).forEach(a => E.applyFree(S, w.pid, a)); E.applyAction(S, w.pid, d.move); }
  }
  const rows = S.result.rows;
  if (!quiet) console.log(n + 'p seed ' + seed + ': rounds ' + S.round + ', scores ' + rows.map(r => S.players[r.pid].name + '=' + r.total + '(' + r.game + '+' + r.map + 'm+' + r.objectives + 'o+' + r.columns + 'c)').join(' ') +
    ', action ms avg ' + (total / Math.max(1, count)).toFixed(0) + ' max ' + maxMs.toFixed(0));
  return { S, maxMs, avgMs: total / Math.max(1, count) };
}
for (const [n, lv] of [[2, [2, 2]], [3, [1, 2, 3]], [4, [2, 2, 2, 2]]]) {
  let r;
  try { r = playCpu(n, lv, 42 + n); } catch (e) { check(false, 'cpu game ' + n + 'p threw: ' + e.stack); continue; }
  check(r.S.round >= 4 && r.S.round <= 12, n + 'p CPU game takes 4–12 rounds (took ' + r.S.round + ')');
}

if (process.argv.includes('--league')) {
  const wins = { 1: 0, 2: 0, 3: 0 }, rounds = [], tops = [];
  for (let g = 0; g < 18; g++) {
    const r = playCpu(3, [1, 2, 3], 900 + g, true);
    wins[r.S.players[r.S.result.order[0]].cpu]++;
    rounds.push(r.S.round); tops.push(r.S.result.rows[r.S.result.order[0]].total);
  }
  console.log('league 3p (levels 1/2/3) wins', wins, 'rounds avg', (rounds.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1),
    'winning score avg', (tops.reduce((a, b) => a + b, 0) / tops.length).toFixed(1));
}

console.log(failures.length ? failures.length + ' FAILED' : 'all elementica rules checks passed');
process.exit(failures.length ? 1 : 0);
