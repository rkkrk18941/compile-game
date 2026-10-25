/* Loader + random-play driver for the board-game engine of スレイザスパイア (ibara/bg). Used by the tests. */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'ibara', 'bg');
const FILES = ['data.js', 'cards.js', 'items.js', 'monsters.js', 'events.js', 'combat.js', 'engine.js'];

function load() {
  const ctx = { console, setTimeout, clearTimeout, setImmediate, Promise, Math, JSON, Date, Object, Array, String, Number, Error, RegExp, Map, Set };
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx.STS;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* A random but valid player for every prompt type. */
function randomAnswer(STS, g, pi, q, rnd, stats) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  stats.asks = (stats.asks || 0) + 1;
  stats.types[q.type] = (stats.types[q.type] || 0) + 1;
  switch (q.type) {
    case 'enemy': case 'orb': case 'player': return pick(q.options);
    case 'row': return rnd() < 0.7 ? q.options[0] : pick(q.options);
    case 'map': {
      if (q.wing && q.wing.length && rnd() < 0.2) return pick(q.wing);
      return pick(q.options);
    }
    case 'cards': case 'deck': {
      const n = q.min + Math.floor(rnd() * (q.max - q.min + 1));
      const cs = q.cards.slice();
      const out = [];
      while (out.length < n && cs.length) out.push(cs.splice(Math.floor(rnd() * cs.length), 1)[0].u);
      return out;
    }
    case 'number': return rnd() < 0.7 ? q.max : q.min + Math.floor(rnd() * (q.max - q.min + 1));
    case 'option': {
      const ok = q.options.filter((o) => !o.disabled);
      return (ok.length ? pick(ok) : q.options[0]).id;
    }
    case 'confirm': return rnd() < 0.6;
    case 'reward': {
      const open = q.items.filter((it) => !it.taken);
      if (!open.length || rnd() < 0.05) return 'done';
      return pick(open).idx;
    }
    case 'cardReward': return q.skip && rnd() < 0.25 ? -1 : Math.floor(rnd() * q.cards.length);
    case 'potion': {
      if (!q.full) return { act: rnd() < 0.9 ? 'take' : 'skip' };
      const r = rnd();
      if (q.others.length && r < 0.3) return { act: 'give', to: pick(q.others) };
      if (r < 0.5) return { act: 'discard', slot: Math.floor(rnd() * q.potions.length) };
      return { act: 'skip' };
    }
    case 'relic': return rnd() < 0.9;
    case 'bossRelic': {
      const av = q.ids.filter((id) => q.taken[id] == null);
      return av.length && rnd() < 0.85 ? pick(av) : 'skip';
    }
    case 'shop': {
      const sh = g.run.room && g.run.room.shop;
      stats.shopActs = (stats.shopActs || 0) + 1;
      if (!sh || rnd() < 0.35 || stats.shopActs % 6 === 0) return { act: 'leave' };
      const p = g.P(pi);
      const opts = [];
      sh.relics.forEach((it, i) => { if (!it.sold && p.gold >= it.price) opts.push({ act: 'relic', idx: i }); });
      sh.potions.forEach((it, i) => { if (!it.sold && p.gold >= it.price) opts.push({ act: 'potion', idx: i }); });
      (sh.cards[pi] || []).forEach((it, i) => { if (!it.sold && p.gold >= it.price) opts.push({ act: 'card', idx: i }); });
      sh.colorless.forEach((it, i) => { if (!it.sold && p.gold >= it.price) opts.push({ act: 'colorless', idx: i }); });
      if (!sh.removed[pi] && p.gold >= q.removePrice) opts.push({ act: 'remove' });
      return opts.length ? pick(opts) : { act: 'leave' };
    }
    case 'dieMod': {
      if (rnd() < 0.6) return { k: 'pass' };
      const o = pick(q.options);
      return o.k === 'brew' ? { k: 'brew', slot: o.slot, v: 1 + Math.floor(rnd() * 6) } : o;
    }
    case 'info': return true;
    default: throw new Error('unknown prompt type ' + q.type);
  }
}

/* Plays the combat for every player: random playable cards, sometimes potions, relics, Shivs, Miracles. */
function makeDriver(STS, g, rnd, stats, opts) {
  opts = opts || {};
  let busy = false, scheduled = false;
  async function act() {
    const cb = g.combat;
    if (!cb || cb.s.phase !== 'play' || !cb._playDone) return;
    for (const pc of cb.pcs()) {
      if (pc.dead || pc.ready) continue;
      for (let guard = 0; guard < 40 && !cb.s.over && cb.s.phase === 'play'; guard++) {
        const choices = [];
        pc.hand.forEach((c) => { if (!cb.canPlay(pc, c)) choices.push({ type: 'play', u: c.u }); });
        if (pc.shiv > 0 && cb.alive().length) choices.push({ type: 'shiv' });
        if (pc.mir > 0 && pc.en < 6 && rnd() < 0.3) choices.push({ type: 'miracle' });
        const P = g.P(pc.i);
        P.potions.forEach((id, slot) => { const d = STS.POTIONS[id]; if (d && d.use && !d.passive && !d.dieOnly && rnd() < 0.15) choices.push({ type: 'potion', slot }); });
        P.relics.forEach((r) => { const d = STS.RELICS[r.id]; if (d && d.activate && !(d.canActivate && d.canActivate(cb, pc, r)) && rnd() < 0.3) choices.push({ type: 'relic', id: r.id }); });
        pc.pow.forEach((p) => { const d = STS.CARDS[p.id]; if (d.pw && d.pw.activate && !p.usedTurn && rnd() < 0.5) choices.push({ type: 'power', u: p.u }); });
        if (!choices.length || rnd() < 0.04) break;
        const cmd = choices[Math.floor(rnd() * choices.length)];
        try { await cb.command(pc.i, cmd); stats.cmds = (stats.cmds || 0) + 1; }
        catch (e) { stats.cmdErrors = (stats.cmdErrors || 0) + 1; if (opts.strict && !/足り|できません|ありません|もう|上限|ターン|最大/.test(e.message)) throw e; }
        if (g.combat !== cb) return;
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

/* Runs one game to the end with random choices. Returns { result, run, stats }. */
async function playRandom(STS, cfg, o) {
  o = o || {};
  const rnd = makeRng((cfg.seed || 1) * 7919 + 13);
  const run = STS.Game.newRun(cfg);
  if (o.mutate) o.mutate(run);
  const stats = { types: {}, events: {}, rooms: {}, fights: 0, acts: {}, maxAct: 1 };
  const g = new STS.Game(run, null);
  const update = makeDriver(STS, g, rnd, stats, o);
  let snapshots = 0;
  g.io = {
    ask: (pi, q) => {
      if (stats.asks > (o.maxAsks || 400000)) throw new Error('too many prompts (possible loop)');
      if (o.onAsk) { const v = o.onAsk(g, pi, q, rnd); if (v !== undefined) return v; }
      return randomAnswer(STS, g, pi, q, rnd, stats);
    },
    emit: (ev) => {
      if (ev.t === 'event') stats.events[ev.id] = (stats.events[ev.id] || 0) + 1;
      if (ev.t === 'room') stats.rooms[ev.room] = (stats.rooms[ev.room] || 0) + 1;
      if (ev.t === 'combatStart') stats.fights++;
      if (ev.t === 'act') { stats.maxAct = Math.max(stats.maxAct, ev.act); }
      if (o.onEmit) o.onEmit(g, ev);
    },
    update: () => { update(); if (o.onUpdate) o.onUpdate(g); },
    checkpoint: (snap) => { snapshots++; if (o.checkpoint) o.checkpoint(snap); }
  };
  if (o.beforeStart) await o.beforeStart(g);
  const result = await g.start();
  if (stats.fatal) throw stats.fatal;
  stats.snapshots = snapshots;
  return { result, run, stats, g };
}

module.exports = { load, makeRng, randomAnswer, makeDriver, playRandom };
