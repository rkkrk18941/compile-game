/* Next-level update (2026-11-13) for スレイザスパイア: rules-side checks without a browser.
   - Choices that come after the battle is already decided are not asked (頭突き on the last enemy, reproduced by
     normal play: no HP is set by hand).
   - The presentation details added to events are read-only (the same seed gives the same game with or without them).
   - Statistics, score, records, Today's Tower, seeds and the short adventure (sections added below).
   Run: node tools/ibara-nextlevel-test.cjs [--engine DIR]   (DIR: another copy of ibara/bg, for comparisons) */
'use strict';
const assert = require('assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const at = process.argv.indexOf('--engine');
const DIR = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(__dirname, '..', 'ibara', 'bg');
const ENGINE = ['data.js', 'cards.js', 'items.js', 'monsters.js', 'events.js', 'combat.js', 'engine.js',
  'df-data.js', 'df-mech.js', 'df-mech-guardian.js', 'df-mech-hexaghost.js', 'df-mech-hermit.js', 'df-shard.js', 'df-gems.js',
  'df-cards-slime.js', 'df-cards-guardian.js', 'df-cards-hexaghost.js', 'df-cards-hermit.js', 'df-cards-hermit-rest.js', 'df-items.js', 'df-run.js', 'df-bosses.js', 'df-bosses-official.js', 'df-boons.js', 'df-items-extra.js', 'df-events.js'];
const EXTRA = ['records.js', 'daily.js'];
function load() {
  const ctx = { console, setTimeout, clearTimeout, setImmediate, Promise, Math, JSON, Date, Object, Array, String, Number, Error, RegExp, Map, Set, Intl };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ENGINE) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  for (const f of EXTRA) if (fs.existsSync(path.join(DIR, f))) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  return ctx.STS;
}
const STS = load();
let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks++; }
const tick = () => new Promise((r) => setImmediate(r));

/* A small driver: plays whole fights by itself. play(cb, pc) returns the next command or null (end the turn). */
function driver(g, play, onAsk) {
  return {
    ask: async (pi, q) => { const v = onAsk ? onAsk(q, g) : undefined; return v !== undefined ? v : STS.autoAnswer(g, pi, q); },
    emit: () => {},
    update: () => setImmediate(async () => {
      const cb = g.combat;
      if (!cb || cb.s.phase !== 'play' || cb.s.over || !cb._playDone || cb._driving) return;
      cb._driving = true;
      try {
        for (let guard = 0; guard < 30 && !cb.s.over && cb.s.phase === 'play'; guard++) {
          const pc = cb.pc(0);
          if (pc.ready) break;
          const c = play(cb, pc);
          if (!c) { await cb.command(0, { type: 'end' }); break; }
          await cb.command(0, c).catch(() => cb.command(0, { type: 'end' }));
        }
      } finally { cb._driving = false; }
    })
  };
}

(async () => {
  /* ---------------- 頭突き after the last enemy is defeated (normal play) ---------------- */
  {
    // An Ironclad whose Strikes are replaced by Headbutts plays the first fights of a run normally; every turn it
    // uses Headbutt on the weakest enemy. We record the prompts asked after an enemy died with no enemy left.
    let afterWin = 0, kills = 0, headbuttKills = 0;
    for (let seed = 1; seed <= 12 && headbuttKills < 3; seed++) {
      const run = STS.Game.newRun({ players: [{ ch: 'R' }], seed, buff: false });
      run.players[0].deck.forEach((c) => { if (c.id === 'StrikeR') c.id = 'Headbutt'; });
      run.players[0].hp = run.players[0].maxHp = 60;
      let g;
      const play = (cb, pc) => {
        const foes = cb.alive().sort((a, b) => a.hp - b.hp);
        if (!foes.length) return null;
        const hb = pc.hand.find((c) => c.id === 'Headbutt' && pc.en >= 1);
        if (hb) return { type: 'play', u: hb.u, target: foes[0].u };
        const any = pc.hand.find((c) => { try { return !cb.canPlay(pc, c) && cb.costOf(pc, c) <= pc.en; } catch (e) { return false; } });
        return any ? { type: 'play', u: any.u, target: foes[0].u } : null;
      };
      let lastPlayed = null;
      const io = {};
      g = new STS.Game(run, io);
      Object.assign(io, driver(g, play, (q, gg) => {
        const cb = gg.combat;
        if (q.type === 'cards' && cb && cb.s.over) afterWin++;
        if (q.type === 'map' || q.type === 'reward' || q.type === 'info') throw Object.assign(new Error('stop'), { stop: true });
        return undefined;
      }));
      g.io.emit = (ev) => {
        if (ev.t === 'play') lastPlayed = ev.card.id;
        if (ev.t === 'die' && ev.u != null) { kills++; const cb = g.combat; if (cb && !cb.alive().length && lastPlayed === 'Headbutt') headbuttKills++; }
      };
      g.setupDecks(); g.setupAct(1); run.phase = 'map';
      try { await g.start(); } catch (e) { if (!e.stop) throw e; }
    }
    ok(headbuttKills >= 1, 'normal play reached a Headbutt that defeated the last enemy (' + headbuttKills + ' times, ' + kills + ' kills)');
    console.log('頭突きで最後の敵を倒した回数: ' + headbuttKills + ' / その後に出たカード選択: ' + afterWin);
    if (at < 0) ok(afterWin === 0, 'no card choice is asked after the battle is decided');
  }

  /* ---------------- read-only presentation details on events ---------------- */
  {
    const evs = [];
    const run = STS.Game.newRun({ players: [{ ch: 'G' }], seed: 77, buff: true });
    const g = new STS.Game(run, { emit: (ev) => evs.push(ev) });
    g.setupDecks(); g.setupAct(1);
    const cb = STS.Combat.create(g, { kind: 'boss', enc: 'Boss:' + run.boss });
    run.combat = cb.s; g.combat = cb;
    await STS.ENCOUNTERS['Boss:' + run.boss].build(cb);
    await cb.setup();
    const start = evs.find((e) => e.t === 'combatStart');
    ok(start && start.kind === 'boss' && start.act === 1 && start.enc === 'Boss:' + run.boss, 'combatStart names the kind, act and encounter');
    const e = cb.alive()[0];
    await cb.damageEnemy(e, e.hp + e.blk + 5, {});
    const die = evs.find((x) => x.t === 'die' && x.u === e.u);
    ok(die && die.id === e.id && die.boss === true, 'an enemy death names the enemy and whether it is a Boss');
  }

  if (at > 0) { console.log('(old engine: the remaining sections need the new files)'); console.log('ok: ' + checks + ' checks'); return; }
  const bot = require('./ibara-bot.cjs');
  const R = STS.Records, Y = STS.Daily;

  /* ---------------- statistics match what actually happened ---------------- */
  for (const [ch, seed, buff] of [['R', 3, true], ['G', 8, false], ['B', 12, true], ['W', 21, true]]) {
    const seen = { rooms: 0, won: { n: 0, e: 0, b: 0 }, cards: 0, relics: 0, kills: 0, dmg: 0, maxHit: 0, rounds: 0 };
    let kind = null;
    const r = await bot.playSmart(STS, { players: [{ ch }], seed, buff }, {
      onEmit: (g, ev) => {
        if (ev.t === 'move') seen.rooms++;
        if (ev.t === 'combatStart') kind = ev.kind;
        if (ev.t === 'combatEnd') { seen.rounds += g.run.combat ? g.run.combat.round : 0; if (ev.result === 'victory') seen.won[kind === 'boss' ? 'b' : kind === 'elite' ? 'e' : 'n']++; }
        if (ev.t === 'gainCard') { const d = STS.CARDS[ev.id]; if (d.t !== 'C' && d.t !== 'T') seen.cards++; }
        if (ev.t === 'gainRelic') seen.relics++;
        if (ev.t === 'die' && ev.u != null) seen.kills++;
        if (ev.t === 'edmg' && ev.hp > 0) { seen.dmg += ev.hp; seen.maxHit = Math.max(seen.maxHit, ev.hp); }
      }
    });
    const st = r.run.stats;
    ok(st && !st.partial, ch + ': statistics kept from the start');
    ok(st.rooms === seen.rooms && st.cards === seen.cards && st.relics === seen.relics && st.kills === seen.kills, ch + ': rooms/cards/relics/kills (' + JSON.stringify([st.rooms, st.cards, st.relics, st.kills]) + ' vs ' + JSON.stringify([seen.rooms, seen.cards, seen.relics, seen.kills]) + ')');
    ok(JSON.stringify(st.won) === JSON.stringify(seen.won), ch + ': fights won ' + JSON.stringify(st.won) + ' vs ' + JSON.stringify(seen.won));
    ok(st.dmg === seen.dmg && st.maxHit === seen.maxHit, ch + ': damage dealt and biggest hit');
    ok(st.bosses.length === st.won.b && r.run.bosses === st.won.b, ch + ': Bosses');
    const sc = R.score(r.run, 0);
    ok(sc.total === Math.round(sc.base * sc.mult) && sc.base === sc.lines.reduce((a, l) => a + l.pts, 0), ch + ': score adds up');
  }

  /* ---------------- score table ---------------- */
  {
    const run = STS.Game.newRun({ players: [{ ch: 'G' }], seed: 1, buff: true, asc: 2 });
    run.phase = 'over'; run.result = 'victory'; run.act = 3; run.bosses = 3; run.players[0].hp = 6;
    run.stats = Object.assign(STS.newStats(), { rooms: 40, won: { n: 20, e: 4, b: 3 }, burning: 1, bosses: [1, 2, 3], flawless: { n: 5, e: 1, b: 1 } });
    const sc = R.score(run, 0);
    // 40*5 + 20*10 + 3*30 + 1*45 + (100+100+150) + (5*10+1*20+1*50) + 6*5 = 200+200+90+45+350+120+30 = 1035; ×1.2 (Ascension 2)
    ok(sc.base === 1035 && sc.mult === 1.2 && sc.total === 1242, 'score table: ' + sc.base + ' × ' + sc.mult + ' = ' + sc.total);
    run.buff = false; run.asc = 0; run.mode = 'beginner';
    ok(R.score(run, 0).total === Math.round(1035 * 0.5 * 1.25), 'beginner ×0.5 and the printed rules ×1.25');
  }

  /* ---------------- records: 50 adventures kept, damaged data never breaks ---------------- */
  {
    const store = { m: {}, getItem(k) { return this.m[k] == null ? null : this.m[k]; }, setItem(k, v) { this.m[k] = String(v); } };
    const data = R.load(store);
    for (let i = 0; i < 55; i++) {
      const run = STS.Game.newRun({ players: [{ ch: 'R' }], seed: 1000 + i, buff: true });
      run.phase = 'over'; run.result = i % 3 ? 'defeat' : 'victory'; run.act = 1 + (i % 3); run.bosses = i % 3;
      R.record(data, run, 0, 1700000000000 + i * 1000);
    }
    R.save(data, store);
    const back = R.load(store);
    ok(back.history.length === 50 && back.history[0].seed === 1005 && back.history[49].seed === 1054, 'only the last 50 adventures are kept (oldest removed first)');
    ok(back.cats.normal.R.runs === 55 && back.cats.normal.R.wins === 19, 'per-character totals keep counting');
    const again = R.record(back, (() => { const r = STS.Game.newRun({ players: [{ ch: 'R' }], seed: 1054, buff: true }); r.phase = 'over'; r.result = 'victory'; r.act = 1; r.bosses = 0; return r; })(), 0);
    ok(again.duplicate && back.history.length === 50, 'the same adventure is recorded once');
    for (const bad of ['{', 'null', '[]', '"x"', '{"history":[1,null,{"id":5}],"cats":{"normal":{"R":"x"}},"medals":{"nope":1,"boss1":{"at":"y"}}}', '{"cats":5,"daily":{"2026-1-1":{}}}']) {
      store.m[R.KEY] = bad;
      let d2; try { d2 = R.load(store); } catch (e) { d2 = null; }
      ok(d2 && Array.isArray(d2.history) && typeof d2.cats === 'object', 'damaged data: ' + bad.slice(0, 20));
    }
    const run = STS.Game.newRun({ players: [{ ch: 'W' }], seed: 9, buff: true }); run.phase = 'over'; run.result = 'defeat'; delete run.stats;
    let out = null; try { out = R.record(R.parse(null), run, 0); } catch (e) { out = null; }
    ok(out && out.score.total === 0, 'an adventure from an old save (no statistics) is recorded without errors');
  }

  /* ---------------- Today's Tower ---------------- */
  {
    const d1 = Y.dateJST(Date.UTC(2026, 10, 13, 14, 59, 59)), d2 = Y.dateJST(Date.UTC(2026, 10, 13, 15, 0, 0));
    ok(d1 === '2026-11-13' && d2 === '2026-11-14', 'the day changes at midnight in Japan (' + d1 + ' → ' + d2 + ')');
    ok(Y.seedFor('2026-11-13') === Y.seedFor('2026-11-13') && Y.seedFor('2026-11-13') !== Y.seedFor('2026-11-14'), 'same date, same seed; another date, another seed');
    const days = {}; for (let i = 0; i < 60; i++) days[Y.charFor(Y.dateJST(Date.UTC(2026, 0, 1) + i * 86400000))] = 1;
    ok(Object.keys(days).sort().join('') === 'BGRW', 'the four base characters take turns');
    const c = Y.config('2026-11-13', 'まる');
    ok(c.buff === true && c.mode === 'normal' && c.asc === 0 && c.act4 === false && c.colorless === true && c.players[0].unlock === 3 && c.daily === '2026-11-13', 'fixed conditions');
    const a = STS.Game.newRun(Y.config('2026-11-13', 'A')), b = STS.Game.newRun(Y.config('2026-11-13', 'B'));
    a.players[0].name = b.players[0].name = '';
    ok(JSON.stringify(a) === JSON.stringify(b), 'the tower does not depend on this device (name or unlocks)');
    const data = R.parse(null);
    ok(R.startDaily(data, '2026-11-13') === true && R.startDaily(data, '2026-11-13') === false, 'the first start of the day is the real one; later ones are practice');
    const play = (official) => { const r = STS.Game.newRun(Y.config('2026-11-13')); if (official) r.dailyOfficial = true; r.phase = 'over'; r.result = 'defeat'; r.act = 2; r.bosses = 1; r.stats.rooms = official ? 20 : 30; return r; };
    const first = R.record(data, play(true), 0), second = R.record(data, play(false), 0);
    ok(!first.practice && second.practice && data.daily['2026-11-13'].score === first.score.total, 'practice does not replace the real record');
    ok(/^スレイザスパイア 今日の塔 11\/13｜.+｜第2幕まで｜\d+点$/.test(Y.shareText('2026-11-13', 'G', '第2幕まで', 482)), 'share text');
    ok(Y.parseSeed(' 1234567890 ') === 1234567890 && Y.parseSeed('１２３') === 123 && Y.parseSeed('abc') === null && Y.parseSeed('0') === null && Y.parseSeed('99999999999') === null, 'typed seeds');
  }

  /* ---------------- the same seed, settings and choices give the same adventure ---------------- */
  {
    const play = async () => { const r = await bot.playSmart(STS, { players: [{ ch: 'G' }], seed: 424242, buff: true, seeded: true }); return JSON.stringify(r.run); };
    const x = await play(), y = await play();
    ok(x === y, 'two plays of seed 424242 end in the same state, statistics included');
    const z = JSON.parse(x);
    ok(z.seeded === true && z.seed === 424242, 'the seed is kept in the adventure');
  }

  /* ---------------- the short adventure (Act I only) ---------------- */
  {
    let wins = 0, losses = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const phases = [];
      const r = await bot.playSmart(STS, { players: [{ ch: 'R' }], seed, buff: true, short: true }, { mutate: (run) => { run.players[0].hp = run.players[0].maxHp = 60; }, onEmit: (g) => { if (phases[phases.length - 1] !== g.run.phase) phases.push(g.run.phase); } });
      ok(r.run.act === 1 && r.run.phase === 'over' && phases.indexOf('bossRelic') < 0, 'short adventure stays in Act I (seed ' + seed + ')');
      if (r.result === 'victory') { wins++; ok(r.run.bosses === 1 && r.run.boxes === 2, 'beating the Act I Boss wins; boxes = Bosses + 1'); }
      else losses++;
    }
    ok(wins > 0, 'short adventures can be won (' + wins + ' of 6, ' + losses + ' lost)');
  }

  console.log('ok: ' + checks + ' checks');
})().catch((e) => { console.error(e); process.exit(1); });
