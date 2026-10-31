/* A greedy heuristic player for スレイザスパイア (ibara/bg), used to compare how hard fights and adventures are.
   Combat: for each player, try every playable action on a copy of the battle (one step ahead) and take the one
   that improves a simple evaluation (enemy HP, unblocked damage this round, Strength, debuffs, cards in hand),
   until nothing helps; then end the turn. Outside combat: sensible fixed preferences (rest when hurt, take
   rarer cards, remove Strikes and curses, avoid Elites when hurt). Deterministic for a given seed.
   Not a strong player: it only looks one action ahead. Use the same bot for every compared configuration. */
'use strict';
const sim = require('./ibara-bg-sim.cjs');

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* The base Guardian's Mode Shift hit is an effect, not a printed hit: count it while it still has Block. */
function guardianShift(STS, cb, e, a) {
  if (e.id !== 'Guardian' || !a || !a.fx.some((f) => f[0] === 'fn' && f[1] === 'shift') || !(e.blk > 0)) return 0;
  return (cb.asc() >= 10 ? 7 : 6) + (e.str || 0);
}
/* Damage enemy e will deal to this player with its current intent (before Block). */
function intentDamage(STS, cb, e, pc) {
  let a = null, total = 0;
  try { a = cb.currentAction(e); } catch (err) { a = null; }
  const m = cb.mdef(e);
  if (a && a.fx) {
    for (const fx of a.fx) {
      if (fx[0] !== 'hit' && fx[0] !== 'ahit') continue;
      const ts = cb.targetsOf(e, fx[0] === 'ahit' || a.aoe);
      if (ts.indexOf(pc) < 0) continue;
      let dmg = fx[1] + (e.str || 0);
      if (m.hitBonus) { try { dmg += m.hitBonus(cb, e, pc) || 0; } catch (err) { /* ignore */ } }
      const weak = e.weak > 0, vuln = pc.vuln > 0;
      if (weak && !vuln) dmg -= 1; else if (vuln && !weak) dmg *= 2;
      if (e.x && e.x.dealZero) dmg = 0;
      total += Math.max(0, dmg) * (fx[2] || 1);
    }
  }
  if (m.botIncoming) { try { total += m.botIncoming(cb, e, pc) || 0; } catch (err) { /* ignore */ } }
  total += guardianShift(STS, cb, e, a);
  return total;
}
/* Damage this player will take from the current enemy intents this round (before Block). */
function incoming(STS, cb, pc) {
  let total = 0;
  for (const e of cb.alive()) total += intentDamage(STS, cb, e, pc);
  return total;
}

/* Team evaluation of a battle state at the end of a player's planned turn (higher is better for the players):
   player HP after this round's intents (3 per HP), enemy HP (1 per HP), kills, Strength, debuffs, powers.
   Cards left in hand and unspent energy are worth nothing: they are discarded at the end of the turn. */
function evaluate(STS, cb) {
  const s = cb.s;
  let v = 0;
  if (s.over) v += s.result === 'victory' ? 600 : -600;
  for (const e of s.enemies) {
    if (e.fled) continue;
    if (e.dead) { v += 5; continue; }
    v -= e.hp;
    const md = cb.mdef(e);
    if (md && md.barricade) v -= e.blk * 0.9; // Block that stays (Spheric Guardian)
    v -= (e.str || 0) * 0.8;
    v += Math.min(e.weak || 0, 2) * 1.5 + Math.min(e.vuln || 0, 2) * 1.5 + (e.psn || 0) * 0.7;
  }
  for (const pc of cb.pcs()) {
    const P = cb.P(pc);
    if (pc.dead || P.hp <= 0) { v -= 400; continue; }
    const un = Math.max(0, incoming(STS, cb, pc) - pc.blk);
    v += (P.hp - Math.min(un, P.hp)) * 3;
    if (un >= P.hp) v -= 250;
    v += (pc.str || 0) * 3 + pc.pow.length * 4;
    v += (pc.shiv || 0) * 0.8 + (pc.mir || 0) * 0.8 + (pc.orbs || []).length * 1.5;
    if (pc.slimes) v += pc.slimes.length * 2.5;
    if (pc.vigor) v += pc.vigor * 0.8;
    if (pc.soul) v += pc.soul * 0.8;
    if (pc.charge) v += pc.charge; // Watcher buff at 1 HP: becomes that much damage at the end of the turn
    if (pc.chamber) v += pc.chamber.filter(Boolean).length * 0.8;
  }
  return v;
}

/* Every action worth trying for this player now. */
function actions(STS, cb, pc, g, fightKind) {
  const out = [];
  const enemyTargets = () => {
    const al = cb.alive();
    if (al.length <= 4) return al.map((e) => e.u);
    return al.slice().sort((a, b) => (a.row === -1 ? -1 : b.row === -1 ? 1 : a.hp - b.hp)).slice(0, 4).map((e) => e.u);
  };
  const withTargets = (base, d, k) => {
    let tg = d.tg;
    if (typeof tg === 'function') { try { tg = tg(k || { pc, cb, deadOn: false, card: base }); } catch (err) { tg = 'E'; } }
    if (tg === 'E') { const ts = enemyTargets(); if (ts.length > 1) return ts.map((u) => Object.assign({}, base, { target: u })); }
    if (tg === 'R') { const rows = cb.rowsWithEnemies(); if (rows.length > 1) return rows.map((r) => Object.assign({}, base, { row: r })); }
    if (tg === 'P') { const ps = cb.pcs().filter((x) => !x.dead).map((x) => x.i); if (ps.length > 1) return ps.map((i) => Object.assign({}, base, { player: i })); }
    return [base];
  };
  pc.hand.forEach((c) => {
    let why = null;
    try { why = cb.canPlay(pc, c); } catch (err) { why = 'x'; }
    if (why) return;
    const d = STS.CARDS[c.id];
    let cost = null;
    try { cost = cb.costOf(pc, c); } catch (err) { cost = null; }
    const base = { type: 'play', u: c.u };
    if (cost === 'X') base.x = pc.en + (pc.mir || 0);
    withTargets(base, d).forEach((cmd) => out.push(cmd));
  });
  (pc.chamber || []).forEach((c) => {
    if (!c) return;
    const t = pc.t || (pc.t = {}), was = t.fromChamber;
    let why = null;
    t.fromChamber = c.u;
    try { why = cb.canPlay(pc, c); } catch (err) { why = 'x'; }
    t.fromChamber = was;
    if (why) return;
    withTargets({ type: 'chamber', u: c.u }, STS.CARDS[c.id]).forEach((cmd) => out.push(cmd));
  });
  if (pc.shiv > 0 && cb.alive().length) enemyTargets().forEach((u) => out.push({ type: 'shiv', target: u }));
  if (pc.mir > 0) out.push({ type: 'miracle' });
  const P = g.P(pc.i);
  P.potions.forEach((id, slot) => {
    const d = STS.POTIONS[id];
    if (!d || !d.use || d.passive || d.dieOnly) return;
    const base = { type: 'potion', slot, botCost: fightKind === 'boss' ? 0.5 : fightKind === 'elite' ? 2 : 4 };
    if (d.tg === 'E') enemyTargets().forEach((u) => out.push(Object.assign({}, base, { target: u })));
    else out.push(base);
  });
  P.relics.forEach((r) => {
    const d = STS.RELICS[r.id];
    if (d && d.activate) { let no = null; try { no = d.canActivate ? d.canActivate(cb, pc, r) : null; } catch (err) { no = 'x'; } if (!no) out.push({ type: 'relic', id: r.id }); }
  });
  pc.pow.forEach((p) => { const d = STS.CARDS[p.id]; if (d.pw && d.pw.activate && !p.usedTurn && !(d.pw.canActivate && d.pw.canActivate(cb, pc, p))) out.push({ type: 'power', u: p.u }); });
  const DF = STS.DF;
  if (DF && DF.COMMANDS) {
    if (DF.COMMANDS.vigor && pc.vigor > 0) out.push({ type: 'vigor' });
    if (DF.COMMANDS.soulburn && pc.soul > 0) cb.alive().slice(0, 4).forEach((e) => out.push({ type: 'soulburn', target: e.u }));
  }
  return out;
}

/* Answers for prompts. Deterministic when rnd is the fixed lookahead stand-in. */
const STATUS_IDS = { Daze: 1, Burn: 1, Slimed: 1, Wound: 1, Void: 1 };
function cardJunk(STS, c) {
  const d = STS.CARDS[c.id] || {};
  if (STATUS_IDS[c.id] || d.t === 'T') return 3;
  if (d.t === 'C') return 4;
  if (/^Strike/.test(c.id)) return c.up ? 1.5 : 2;
  if (/^Defend/.test(c.id)) return c.up ? 1 : 1.5;
  return 0;
}
function cardWorth(STS, id) {
  const d = STS.CARDS[id] || {};
  return { R: 3, U: 2, C: 1, S: 0.5 }[d.r] || 0;
}
/* Character buff (Silent), before Poison damage: choose the poisoned enemies to turn into Block. Converts when the
   Block stops damage this round and that HP (3 per HP, as in evaluate) is worth more than the next two Poison
   ticks; always converts when it is the difference between surviving and dying. */
function buffShieldChoice(STS, cb, pi, q) {
  const pc = cb.pc(pi), P = cb.P(pc);
  const un = Math.max(0, incoming(STS, cb, pc) - pc.blk);
  const saved = Math.min(q.gain || 0, un);
  if (!saved) return [];
  if (un >= P.hp && un - saved < P.hp) return q.options.slice();
  let keep = 0;
  for (const e of cb.alive()) if (e.psn > 0) keep += Math.min(e.hp, e.psn * 2);
  keep = Math.max(0, keep - 2); // after converting, the free Poison 1 can be placed again next turn
  return saved * 3 >= keep ? q.options.slice() : [];
}
function smartAnswer(STS, g, pi, q, rnd, stats) {
  stats.asks = (stats.asks || 0) + 1;
  const run = g.run, P = g.P(pi);
  const cb = g.combat;
  switch (q.type) {
    case 'enemies': return cb ? buffShieldChoice(STS, cb, pi, q) : [];
    case 'enemy': {
      if (!cb) return q.options[0];
      const es = q.options.map((u) => cb.enemy(u)).filter(Boolean);
      es.sort((a, b) => a.hp - b.hp);
      return es.length ? es[0].u : q.options[0];
    }
    case 'row': return q.options[0];
    case 'orb': return q.options[0];
    case 'player': {
      let best = q.options[0], low = 99;
      q.options.forEach((i) => { const p = g.P(i); if (p && p.hp / p.maxHp < low) { low = p.hp / p.maxHp; best = i; } });
      return best;
    }
    case 'cards': case 'deck': {
      const t = q.title || '';
      const cs = q.cards.slice();
      let order;
      if (/除去|廃棄|捨て|変化|山札の一番下/.test(t)) order = cs.sort((a, b) => cardJunk(STS, b) - cardJunk(STS, a));
      else if (/アップグレード|強化/.test(t)) order = cs.sort((a, b) => (cardWorth(STS, b.id) - cardJunk(STS, b)) - (cardWorth(STS, a.id) - cardJunk(STS, a)));
      else order = cs.sort((a, b) => (cardWorth(STS, b.id) - cardJunk(STS, b)) - (cardWorth(STS, a.id) - cardJunk(STS, a)));
      let n = q.min;
      if (/除去|廃棄|捨て|変化/.test(t)) {
        const junk = order.filter((c) => cardJunk(STS, c) >= 2).length;
        n = Math.max(q.min, Math.min(q.max, junk));
      } else if (/手札に加え|選んで.*手札|引く/.test(t)) n = q.max;
      return order.slice(0, n).map((c) => c.u);
    }
    case 'number': return q.max;
    case 'option': {
      const ok = q.options.filter((o) => !o.disabled);
      if (!ok.length) return q.options[0].id;
      if (q.rest) {
        const hurt = P.hp / P.maxHp;
        if (hurt < 0.7 && ok.some((o) => o.id === 'rest')) return 'rest';
        if (ok.some((o) => o.id === 'smith')) return 'smith';
        return ok[0].id;
      }
      if (ok.some((o) => o.id === 'rest') && ok.some((o) => o.id === 'key')) return 'rest';
      if (ok.some((o) => o.id === 'next')) return 'next';
      if (g.combat) return ok[0].id;
      return ok[Math.floor(rnd() * ok.length)].id;
    }
    case 'confirm': return true;
    case 'map': {
      const m = run.map, hpr = P.hp / P.maxHp;
      const score = (k) => {
        const t = (m.nodes[k] || {}).t;
        const w = { M: 3, '?': 3, E: hpr >= 0.75 ? 2.5 : 0.3, 'É': hpr >= 0.85 ? 2 : 0.1, R: hpr < 0.6 ? 6 : 1.5, $: P.gold >= 4 ? 3 : 0.5, T: 4, B: 5, X: 1 }[t];
        return (w == null ? 1 : w) + rnd() * 0.5;
      };
      let best = q.options[0], bs = -1;
      q.options.forEach((k) => { const sc = score(k); if (sc > bs) { bs = sc; best = k; } });
      return best;
    }
    case 'reward': {
      const open = q.items.filter((it) => !it.taken);
      return open.length ? open[0].idx : 'done';
    }
    case 'cardReward': {
      const size = P.deck.length;
      let best = -1, bs = size > 26 ? 2.5 : size > 20 ? 1.5 : 0.5;
      q.cards.forEach((c, i) => { const sc = cardWorth(STS, c.id) + rnd() * 0.6; if (sc > bs) { bs = sc; best = i; } });
      return q.skip ? best : Math.max(0, best);
    }
    case 'potion': return { act: q.full ? 'skip' : 'take' };
    case 'relic': return true;
    case 'bossRelic': {
      // Mark of Pain caps HP at 6: skip it (the comparisons run with raised HP).
      const av = q.ids.filter((id) => q.taken[id] == null && id !== 'MarkOfPain');
      return av.length ? av[Math.floor(rnd() * av.length)] : 'skip';
    }
    case 'shop': {
      const sh = run.room && run.room.shop;
      stats.shopActs = (stats.shopActs || 0) + 1;
      if (!sh || stats.shopActs % 8 === 0) return { act: 'leave' };
      if (!sh.removed[pi] && P.gold >= q.removePrice && P.deck.some((c) => cardJunk(STS, c) >= 1.5)) return { act: 'remove' };
      const rel = sh.relics.map((it, i) => ({ it, i })).filter((x) => !x.it.sold && P.gold >= x.it.price);
      if (rel.length) return { act: 'relic', idx: rel[0].i };
      const cards = (sh.cards[pi] || []).map((it, i) => ({ it, i })).filter((x) => !x.it.sold && P.gold >= x.it.price && cardWorth(STS, x.it.id) >= 2);
      if (cards.length && P.deck.length < 24) return { act: 'card', idx: cards[0].i };
      return { act: 'leave' };
    }
    case 'dieMod': return { k: 'pass' };
    case 'info': return true;
    default: return STS.autoAnswer(g, pi, q);
  }
}

/* Lookahead on copies of the battle. Prompts inside a copy (and in the real battle) are answered without
   randomness, so a planned sequence plays out the same way for real. */
const FIXED = () => 0.5;
function copyGame(STS, runState) {
  const r2 = clone(runState);
  const g2 = new STS.Game(r2, null);
  const st = {};
  g2.io = { ask: (p, q) => smartAnswer(STS, g2, p, q, FIXED, st) };
  const cb2 = new STS.Combat(g2, r2.combat);
  g2.combat = cb2;
  return { g: g2, cb: cb2, st };
}
async function runCmd(g2, cb2, pi, cmd) {
  const c2 = Object.assign({}, cmd); delete c2.botCost;
  if (c2.type === 'potion') return g2.usePotion(pi, c2.slot, cb2, c2);
  return cb2.exec(pi, c2);
}
async function tryAction(STS, g, pi, cmd) {
  const x = copyGame(STS, g.run);
  try { await runCmd(x.g, x.cb, pi, cmd); } catch (err) { return null; }
  if ((x.st.asks || 0) > 200) return null;
  return evaluate(STS, x.cb) - (cmd.botCost || 0);
}
function stateKey(cb, pc) {
  return JSON.stringify([cb.s.enemies.map((e) => [e.hp, e.blk, e.str, e.weak, e.vuln, e.psn, e.dead]), pc.hand.map((c) => c.u).sort(), pc.en, pc.blk, pc.str, pc.shiv, pc.mir, (pc.orbs || []).length, pc.pow.length, cb.P(pc).potions.length]);
}
/* Beam search over this player's actions for the rest of the turn. Returns the best sequence (maybe empty). */
async function planTurn(STS, g, pc, kind, o) {
  const width = o.width || 3, depthMax = o.depth || 8;
  const start = { run: g.run, seq: [], v: evaluate(STS, g.combat) + 0.05, cost: 0 };
  let best = start, beams = [start], looks = 0;
  for (let depth = 0; depth < depthMax && beams.length; depth++) {
    const next = [], seen = new Set();
    for (const b of beams) {
      const base = depth === 0 ? { g, cb: g.combat } : copyGame(STS, b.run);
      const bpc = base.cb.pc(pc.i);
      if (base.cb.s.over || bpc.dead) continue;
      for (const cmd of actions(STS, base.cb, bpc, base.g, kind)) {
        const x = copyGame(STS, base.g.run);
        looks++;
        try { await runCmd(x.g, x.cb, pc.i, cmd); } catch (err) { continue; }
        if ((x.st.asks || 0) > 200) continue;
        const key = stateKey(x.cb, x.cb.pc(pc.i));
        if (seen.has(key)) continue;
        seen.add(key);
        const cost = b.cost + (cmd.botCost || 0);
        next.push({ run: x.g.run, seq: b.seq.concat([cmd]), v: evaluate(STS, x.cb) - cost, cost, over: x.cb.s.over });
      }
    }
    next.sort((a, b) => b.v - a.v);
    if (next.length && next[0].v > best.v) best = next[0];
    beams = next.filter((n) => !n.over).slice(0, width);
  }
  return { seq: best.seq, looks };
}

function makeSmartDriver(STS, g, stats, opts) {
  opts = opts || {};
  let busy = false, scheduled = false;
  async function act() {
    const cb = g.combat;
    if (!cb || cb.s.phase !== 'play' || !cb._playDone) return;
    const kind = cb.s.kind;
    for (const pc of cb.pcs()) {
      if (pc.dead || pc.ready) continue;
      for (let replan = 0; replan < 6 && !cb.s.over && cb.s.phase === 'play'; replan++) {
        const plan = await planTurn(STS, g, pc, kind, opts);
        stats.looks = (stats.looks || 0) + plan.looks;
        if (!plan.seq.length) break;
        let failed = false;
        for (const cmd of plan.seq) {
          if (cb.s.over || g.combat !== cb) break;
          const c2 = Object.assign({}, cmd); delete c2.botCost;
          try { await cb.command(pc.i, c2); stats.cmds = (stats.cmds || 0) + 1; }
          catch (err) { stats.cmdErrors = (stats.cmdErrors || 0) + 1; if (opts.strict) throw err; failed = true; break; }
        }
        if (g.combat !== cb) return;
        if (!failed) break;
      }
      if (cb.s.phase === 'play' && !cb.s.over && !pc.ready && !pc.dead) await cb.command(pc.i, { type: 'end' });
      if (g.combat !== cb) return;
    }
  }
  return function update() {
    if (scheduled || busy) return;
    const cb = g.combat;
    if (!cb || cb.s.phase !== 'play') return;
    scheduled = true;
    setImmediate(async () => {
      scheduled = false;
      if (busy) return;
      busy = true;
      try { await act(); } catch (e) { stats.fatal = stats.fatal || e; }
      busy = false;
      const cb2 = g.combat;
      if (cb2 && cb2.s.phase === 'play' && cb2._playDone) update();
    });
  };
}

/* Wires the bot to a game. */
function attach(STS, g, o) {
  o = o || {};
  const rnd = sim.makeRng(((g.run.seed || 1) * 104729 + 7) >>> 0);
  const stats = o.stats || { types: {}, fights: [] };
  const update = makeSmartDriver(STS, g, stats, o);
  g.io = {
    ask: (pi, q) => {
      if ((stats.asks || 0) > (o.maxAsks || 300000)) throw new Error('too many prompts (possible loop)');
      if (o.onAsk) { const v = o.onAsk(g, pi, q, rnd); if (v !== undefined) return v; }
      return smartAnswer(STS, g, pi, q, rnd, stats);
    },
    emit: (ev) => { if (o.onEmit) o.onEmit(g, ev); },
    update: () => { update(); },
    checkpoint: (snap) => { if (o.checkpoint) o.checkpoint(snap); }
  };
  return stats;
}

/* Plays a whole run with the bot. Records each fight: act, kind, encounter, result, HP lost. */
async function playSmart(STS, cfg, o) {
  o = o || {};
  const run = STS.Game.newRun(cfg);
  if (o.mutate) o.mutate(run);
  const g = new STS.Game(run, null);
  const stats = { types: {}, fights: [] };
  let cur = null;
  attach(STS, g, Object.assign({}, o, {
    stats,
    onEmit: (gg, ev) => {
      if (ev.t === 'combatStart' && gg.run.combat) cur = { act: gg.run.act, kind: gg.run.combat.kind, enc: gg.run.combat.enc || (gg.run.combat.encs || []).join('+'), hp: gg.run.players.reduce((a, p) => a + p.hp, 0), max: gg.run.players.reduce((a, p) => a + p.maxHp, 0) };
      if (ev.t === 'combatEnd' && cur) { cur.result = ev.result; cur.hpAfter = gg.run.players.reduce((a, p) => a + Math.max(0, p.hp), 0); cur.rounds = gg.run.combat ? gg.run.combat.round : null; stats.fights.push(cur); cur = null; }
      if (o.onEmit) o.onEmit(gg, ev);
    }
  }));
  const result = await g.start();
  if (stats.fatal) throw stats.fatal;
  return { result, run, stats, g };
}

/* Fights one boss from a saved run state (taken just before a boss room). */
async function fightFrom(STS, snap, bossId, o) {
  o = o || {};
  const run = clone(snap);
  run.boss = bossId; run.boss2 = null;
  const g = new STS.Game(run, null);
  const stats = { types: {}, fights: [] };
  attach(STS, g, Object.assign({}, o, { stats }));
  const before = run.players.map((p) => p.hp);
  let result;
  try { result = await g.fight({ kind: 'boss', boss: bossId }); }
  catch (e) { if (e && e.gameOver) result = 'defeat'; else throw e; }
  if (stats.fatal) throw stats.fatal;
  const lost = run.players.reduce((a, p, i) => a + (before[i] - Math.max(0, p.hp)), 0);
  return { result: result || (run.result === 'defeat' ? 'defeat' : result), lost, rounds: run.lastCombat ? run.lastCombat.rounds : null, players: run.players.length };
}

module.exports = { evaluate, incoming, intentDamage, actions, smartAnswer, tryAction, planTurn, makeSmartDriver, attach, playSmart, fightFrom };
