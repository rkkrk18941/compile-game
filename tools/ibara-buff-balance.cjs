/* Balance check for the character buffs (house rules) of スレイザスパイア (ibara/bg).
   The greedy bot (tools/ibara-bot.cjs) plays whole solo adventures (Acts I–III, Ascension 0) with every base
   character, once with the buffs off (normal rules) and once with them on, on the same seeds. It prints, per
   character: clears, how far the runs got (Act I Boss, Act II, Act II Boss, Act III), Elite and Boss fights won,
   and the HP lost per fight. The bot is much weaker than a person, so compare the two columns of the same
   character (and the characters with each other), not the absolute clear rate with real play.
   Run: node tools/ibara-buff-balance.cjs [seeds=400] [chars=R,G,B,W] [jobs=2] [--json out.json] [--asc N]
        (a party is written as its letters, e.g. RG,GW for two-player online co-op)
   Prints a table. Takes a few minutes (1000 seeds: about 20 minutes on two cores).
   node tools/ibara-buff-balance.cjs --report out.json   prints the table again from a saved --json file. */
'use strict';
const path = require('path');
const { fork } = require('child_process');

function parseArgs(argv) {
  const o = { seeds: 400, chars: ['R', 'G', 'B', 'W'], jobs: 2, json: null, asc: 0, from: 1, modes: ['off', 'on'] };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = argv[++i];
    else if (a === '--asc') o.asc = +argv[++i];
    else if (a === '--from') o.from = +argv[++i];
    else if (a === '--modes') o.modes = argv[++i].split(',');
    else pos.push(a);
  }
  if (pos[0]) o.seeds = +pos[0];
  if (pos[1]) o.chars = pos[1].split(',');
  if (pos[2]) o.jobs = Math.max(1, +pos[2]);
  return o;
}

/* A fight that lasts this many rounds is a stalemate: neither side can finish the other (for example a deck
   with no attacks left against an enemy whose damage the Ironclad buff heals every turn). The adventure is
   stopped there and counted separately. */
const STALEMATE_ROUNDS = 100;

/* One adventure. buff: true = house-rule buffs on. */
async function playOne(STS, bot, ch, seed, buff, asc) {
  const t0 = Date.now();
  // ch: one character (solo) or several letters for an online party, e.g. 'RG'.
  const cfg = { players: ch.split('').map((c) => ({ ch: c })), asc: asc || 0, seed: seed * 7919 + 101, buff: !!buff };
  const fights = [];
  let cur = null, game = null;
  const hp = (g) => g.run.players.reduce((a, p) => a + Math.max(0, p.hp), 0);
  const onEmit = (g, ev) => {
    game = g;
    if (ev.t === 'combatStart' && g.run.combat) cur = [g.run.act, g.run.combat.kind[0], 0, hp(g), 0, g.run.combat.enc || (g.run.combat.encs || []).join('+')];
    if (ev.t === 'round' && cur) { cur[4] = ev.n; if (ev.n > STALEMATE_ROUNDS) { const err = new Error('stalemate'); err.stalemate = true; throw err; } }
    if (ev.t === 'combatEnd' && cur) { cur[2] = ev.result === 'victory' ? 1 : 0; cur[3] = Math.max(0, cur[3] - hp(g)); fights.push(cur); cur = null; }
  };
  try {
    const r = await bot.playSmart(STS, cfg, { onEmit });
    return { ch, seed, buff: !!buff, result: r.result, act: r.run.act, bosses: r.run.bosses, buffFlag: r.run.buff, fights, ms: Date.now() - t0 };
  } catch (e) {
    if (e && e.stalemate && game) {
      if (cur) { cur[3] = Math.max(0, cur[3] - hp(game)); fights.push(cur); }
      return { ch, seed, buff: !!buff, result: 'stalemate', act: game.run.act, bosses: game.run.bosses, buffFlag: game.run.buff, fights, ms: Date.now() - t0 };
    }
    return { ch, seed, buff: !!buff, error: String(e && e.message || e).slice(0, 200), ms: Date.now() - t0 };
  }
}

async function worker() {
  const sim = require('./ibara-bg-sim.cjs');
  const bot = require('./ibara-bot.cjs');
  const STS = sim.load();
  process.on('message', async (job) => {
    const out = [];
    for (const t of job.tasks) out.push(await playOne(STS, bot, t.ch, t.seed, t.buff, job.asc));
    process.send(out);
  });
}

function pct(n, d) { return d ? (100 * n / d).toFixed(1) + '%' : '-'; }
/* Terminal width: Japanese (full-width) characters take two columns. */
function width(t) { let n = 0; for (const c of String(t)) n += c.charCodeAt(0) > 0xff ? 2 : 1; return n; }
function padEnd(t, n) { t = String(t); return t + ' '.repeat(Math.max(1, n - width(t))); }
function padStart(t, n) { t = String(t); return ' '.repeat(Math.max(1, n - width(t))) + t; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function summarize(rows) {
  const ok = rows.filter((r) => !r.error);
  const s = { runs: rows.length, errors: rows.length - ok.length };
  s.clear = ok.filter((r) => r.result === 'victory').length;
  s.stalemate = ok.filter((r) => r.result === 'stalemate').length;
  s.boss1 = ok.filter((r) => r.bosses >= 1).length;
  s.boss2 = ok.filter((r) => r.bosses >= 2).length;
  s.act3 = ok.filter((r) => r.act >= 3).length;
  const fights = [].concat.apply([], ok.map((r) => r.fights));
  const kind = (k, act) => fights.filter((f) => f[1] === k && (act == null || f[0] === act));
  const won = (a) => a.filter((f) => f[2]).length;
  s.normal = kind('n'); s.elite = kind('e'); s.boss = kind('b');
  s.normalWon = won(s.normal); s.eliteWon = won(s.elite); s.bossWon = won(s.boss);
  s.boss1Fights = kind('b', 1); s.boss1Won = won(s.boss1Fights);
  s.lossNormal = mean(s.normal.filter((f) => f[2]).map((f) => f[3]));
  s.lossElite = mean(s.elite.filter((f) => f[2]).map((f) => f[3]));
  s.lossBoss = mean(s.boss.filter((f) => f[2]).map((f) => f[3]));
  s.fightsPerRun = mean(ok.map((r) => r.fights.length));
  s.wonPerRun = mean(ok.map((r) => r.fights.filter((f) => f[2]).length));
  s.ms = mean(ok.map((r) => r.ms));
  return s;
}

function report(all, o) {
  const NAMES = { R: 'アイアンクラッド', G: 'サイレント', B: 'ディフェクト', W: 'ウォッチャー' };
  const lines = [];
  const row = (label, f) => lines.push(padEnd(label, 34) + o.modes.map((m) => f(m)).join(''));
  for (const ch of o.chars) {
    const by = {};
    o.modes.forEach((m) => { by[m] = summarize(all.filter((r) => r.ch === ch && r.buff === (m === 'on'))); });
    lines.push('');
    lines.push('■ ' + ch.split('').map((c) => NAMES[c] || c).join('＋') + '  (' + by[o.modes[0]].runs + ' runs each, Ascension ' + o.asc + ')');
    row('', (m) => padStart(m === 'on' ? '強化' : '通常', 18));
    const P = (k) => (m) => padStart(pct(by[m][k], by[m].runs - by[m].errors) + ' (' + by[m][k] + ')', 18);
    row('冒険クリア（第3幕ボス撃破）', P('clear'));
    row('第1幕ボス撃破', P('boss1'));
    row('第3幕到達', P('act3'));
    row('第2幕ボス撃破', P('boss2'));
    row('膠着（' + STALEMATE_ROUNDS + 'ラウンド超の戦闘）', P('stalemate'));
    const W = (n, d) => (m) => padStart(pct(by[m][n], by[m][d].length) + ' (' + by[m][n] + '/' + by[m][d].length + ')', 18);
    row('通常戦の勝率', W('normalWon', 'normal'));
    row('エリート戦の勝率', W('eliteWon', 'elite'));
    row('ボス戦の勝率', W('bossWon', 'boss'));
    row('第1幕ボス戦の勝率', W('boss1Won', 'boss1Fights'));
    const N = (k, d) => (m) => padStart(by[m][k].toFixed(d == null ? 2 : d), 18);
    row('勝った通常戦の被ダメ', N('lossNormal'));
    row('勝ったエリート戦の被ダメ', N('lossElite'));
    row('勝ったボス戦の被ダメ', N('lossBoss'));
    row('1冒険の勝利戦闘数', N('wonPerRun'));
    row('エラー', (m) => padStart(by[m].errors, 18));
  }
  return lines.join('\n');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const tasks = [];
  for (let s = o.from; s < o.from + o.seeds; s++) for (const ch of o.chars) for (const m of o.modes) tasks.push({ ch, seed: s, buff: m === 'on' });
  const t0 = Date.now();
  const chunks = [];
  for (let j = 0; j < o.jobs; j++) chunks.push([]);
  // Both modes of the same seed go to the same worker, so the slower (longer) buffed games are spread evenly.
  tasks.forEach((t, i) => chunks[Math.floor(i / o.modes.length) % o.jobs].push(t));
  const results = await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const w = fork(__filename, ['--worker']);
    w.once('message', (m) => { w.kill(); res(m); });
    w.once('error', rej);
    w.send({ tasks: c, asc: o.asc });
  })));
  const all = [].concat.apply([], results);
  console.log(report(all, o));
  console.log('\n' + all.length + ' adventures in ' + Math.round((Date.now() - t0) / 1000) + 's');
  if (o.json) require('fs').writeFileSync(o.json, JSON.stringify({ options: o, results: all }));
}

if (process.argv[2] === '--worker') worker();
else if (process.argv[2] === '--report') { const j = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); console.log(report(j.results, j.options)); }
else main().catch((e) => { console.error(e); process.exit(1); });
