/* スレイザスパイア — score, records and medals (next-level update, 2026-11-13). No DOM.
   The engine counts statistics in run.stats (bg/engine.js, never read by the rules). This file turns a finished
   adventure into a score, keeps the records of this device (localStorage ibara.bg.records.v1: best score, furthest
   point, wins and streaks per character, the last 50 adventures, medals, Today's Tower) and finds the next goal.
   Every player keeps their own records on their own device, as with the unlock sheet. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var R = STS.Records = {};
R.KEY = 'ibara.bg.records.v1';
R.MAX_HISTORY = 50;

/* ------------------------------------------------------------------ points (one table; record any change and why) */
R.POINTS = {
  room: 5,                                  // each room entered
  normal: 10,                               // each ordinary fight won
  elite: 30, burning: 45,                   // each Elite (Burning Elite) defeated
  boss: 100, boss3: 150, heart: 300,        // Act I–II Boss, Act III Boss, the Heart
  flawless: { n: 10, e: 20, b: 50 },        // bonus for a fight won without losing HP
  hpAtClear: 5,                             // each HP left when the adventure is won
  ascStep: 0.10,                            // +10% per Ascension level
  beginner: 0.5,                            // beginner mode
  noBuff: 1.25                              // the printed rules (character buffs off)
};
R.CATEGORY = { normal: 'ひとりで遊ぶ', coop: 'オンライン協力', downfall: 'Downfall', short: '短い冒険', daily: '今日の塔' };

function num(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }
function statsOf(run) {
  var s = run && run.stats && typeof run.stats === 'object' ? run.stats : {};
  return { rooms: num(s.rooms), won: { n: num(s.won && s.won.n), e: num(s.won && s.won.e), b: num(s.won && s.won.b) },
    flawless: { n: num(s.flawless && s.flawless.n), e: num(s.flawless && s.flawless.e), b: num(s.flawless && s.flawless.b) },
    burning: num(s.burning), bosses: Array.isArray(s.bosses) ? s.bosses.filter(function (a) { return typeof a === 'number'; }) : [],
    dmg: num(s.dmg), maxHit: num(s.maxHit), rounds: num(s.rounds), kills: num(s.kills), cards: num(s.cards), relics: num(s.relics),
    poisonFinish: num(s.poisonFinish), partial: !!s.partial };
}
R.statsOf = statsOf;

/* The adventure's kind for the records. */
R.category = function (run) {
  if (!run) return 'normal';
  if (run.daily) return 'daily';
  if (run.short) return 'short';
  if (run.adv === 'downfall') return 'downfall';
  return run.players && run.players.length > 1 ? 'coop' : 'normal';
};

/* How far the adventure got: a value to compare and a label. */
R.reach = function (run) {
  var act = run.act || 1, bosses = run.bosses || 0, res = run.result;
  var inBoss = !!(run.room && run.room.t === 'B');
  var label;
  if (res === 'victory') label = run.short ? '第1幕クリア' : act >= 4 ? (run.adv === 'downfall' ? '最終幕クリア' : '心臓を撃破') : '第' + Math.min(act, 3) + '幕クリア';
  else if (res === 'stopped') label = '第' + act + '幕クリアで終了';
  else label = '第' + act + '幕' + (inBoss ? 'ボスまで' : 'まで');
  // bosses first, then the act, then how far in it (5: at its Boss, 9: the adventure won); decoded by the result screen
  var value = bosses * 100 + act * 10 + (res === 'victory' ? 9 : inBoss ? 5 : 0);
  return { value: value, label: label, act: act, bosses: bosses };
};

/* Score: lines that the result screen counts up one by one, then the multiplier. pi: whose HP counts at a clear. */
R.score = function (run, pi) {
  var P = R.POINTS, s = statsOf(run), lines = [];
  function line(key, label, n, each, pts) { if (n > 0 || pts > 0) lines.push({ key: key, label: label, n: n, each: each, pts: pts != null ? pts : n * each }); }
  line('rooms', '進んだ部屋', s.rooms, P.room);
  line('normal', '通常戦の勝利', s.won.n, P.normal);
  var plainElites = Math.max(0, s.won.e - s.burning);
  line('elite', 'エリート撃破', plainElites, P.elite);
  line('burning', '燃えるエリート撃破', Math.min(s.burning, s.won.e), P.burning);
  var bossPts = 0, b12 = 0, b3 = 0, b4 = 0;
  s.bosses.forEach(function (act) { if (act >= 4) { b4++; bossPts += P.heart; } else if (act === 3) { b3++; bossPts += P.boss3; } else { b12++; bossPts += P.boss; } });
  if (s.bosses.length) line('boss', 'ボス撃破' + (b4 ? '（心臓を含む）' : ''), s.bosses.length, null, bossPts);
  var fl = s.flawless.n * P.flawless.n + s.flawless.e * P.flawless.e + s.flawless.b * P.flawless.b;
  line('flawless', 'HPを失わずに勝った戦闘', s.flawless.n + s.flawless.e + s.flawless.b, null, fl);
  var p = run.players && (run.players[pi || 0] || run.players[0]);
  if (run.result === 'victory' && p) line('hp', '残りHP', Math.max(0, p.hp), P.hpAtClear);
  var base = lines.reduce(function (a, l) { return a + l.pts; }, 0);
  var mult = 1, notes = [];
  if (run.mode === 'beginner') { mult *= P.beginner; notes.push('初心者 ×' + P.beginner); }
  else if (run.asc > 0) { mult *= 1 + P.ascStep * run.asc; notes.push('アセンション' + run.asc + ' ×' + (1 + P.ascStep * run.asc).toFixed(1)); }
  if (run.buff === false) { mult *= P.noBuff; notes.push('×' + P.noBuff); }
  return { lines: lines, base: base, mult: Math.round(mult * 1000) / 1000, multText: notes.join('・'), total: Math.round(base * mult) };
};

/* ------------------------------------------------------------------ medals (decoration only: a title on the start screen) */
function clear(run) { return run.result === 'victory' && !run.short; }
R.MEDALS = [
  { id: 'boss1', name: '門番越え', tx: '初めてボスを倒す', ok: function (run, s) { return s.bosses.length > 0; } },
  { id: 'clearR', name: '鉄の意志', tx: 'アイアンクラッドで冒険をクリア', ok: function (run, s, me) { return clear(run) && me.ch === 'R'; } },
  { id: 'clearG', name: '静かな刃', tx: 'サイレントで冒険をクリア', ok: function (run, s, me) { return clear(run) && me.ch === 'G'; } },
  { id: 'clearB', name: '回路の勝者', tx: 'ディフェクトで冒険をクリア', ok: function (run, s, me) { return clear(run) && me.ch === 'B'; } },
  { id: 'clearW', name: '悟りの境地', tx: 'ウォッチャーで冒険をクリア', ok: function (run, s, me) { return clear(run) && me.ch === 'W'; } },
  { id: 'short', name: '最初の踊り場', tx: '短い冒険をクリア', ok: function (run) { return run.result === 'victory' && !!run.short; } },
  { id: 'flawlessBoss', name: '無傷の凱旋', tx: 'HPを失わずにボスを倒す', ok: function (run, s) { return s.flawless.b > 0; } },
  { id: 'elite3', name: '精鋭狩り', tx: 'エリートを3体以上倒して冒険をクリア', ok: function (run, s) { return clear(run) && s.won.e >= 3; } },
  { id: 'burning', name: '炎をくぐる者', tx: '燃えるエリートを倒す', ok: function (run, s) { return s.burning > 0; } },
  { id: 'poison', name: '毒の決着', tx: '戦闘の最後の一撃を毒で決める', ok: function (run, s) { return s.poisonFinish > 0; } },
  { id: 'bigHit', name: '一撃必殺', tx: '1回で20以上のダメージを与える', ok: function (run, s) { return s.maxHit >= 20; } },
  { id: 'lean', name: '研ぎ澄ます', tx: 'デッキ15枚以下で冒険をクリア', ok: function (run, s, me) { return clear(run) && me.deck.length <= 15; } },
  { id: 'collector', name: '遺物の蒐集家', tx: 'レリックを10個以上持って冒険をクリア', ok: function (run, s, me) { return clear(run) && me.relics.length >= 10; } },
  { id: 'score1000', name: '千点の旅路', tx: '1回の冒険で1000点以上', ok: function (run, s, me, sc) { return sc.total >= 1000; } },
  { id: 'coop', name: '背中を預けて', tx: 'オンライン協力で冒険をクリア', ok: function (run) { return clear(run) && run.players.length > 1; } },
  { id: 'asc5', name: '登り詰める者', tx: 'アセンション5以上で冒険をクリア', ok: function (run) { return clear(run) && run.asc >= 5; } },
  { id: 'asc10', name: '茨の頂', tx: 'アセンション10以上で冒険をクリア', ok: function (run) { return clear(run) && run.asc >= 10; } },
  { id: 'asc13', name: '塔の覇者', tx: 'アセンション13で冒険をクリア', ok: function (run) { return clear(run) && run.asc >= 13; } },
  { id: 'heart', name: '心臓を穿つ', tx: '第4幕で心臓を倒す', ok: function (run, s) { return run.adv !== 'downfall' && s.bosses.some(function (a) { return a >= 4; }); } },
  { id: 'downfall', name: '堕ちた英雄', tx: 'Downfallの冒険をクリア', ok: function (run) { return clear(run) && run.adv === 'downfall'; } },
  { id: 'daily1', name: '今日の塔', tx: '今日の塔を本番で遊ぶ', ok: function (run, s, me, sc, rec) { return !!run.daily && !rec.practice; } },
  { id: 'daily3', name: '三日の登攀', tx: '今日の塔を3日続けて本番で遊ぶ', ok: function (run, s, me, sc, rec, data) { return !!run.daily && !rec.practice && R.dailyStreak(data, run.daily) >= 3; } }
];
R.medal = function (id) { return R.MEDALS.filter(function (m) { return m.id === id; })[0] || null; };

/* ------------------------------------------------------------------ storage */
function empty() { return { v: 1, cats: {}, history: [], medals: {}, daily: {}, title: null, seen: [] }; }
/* Never throws: damaged or foreign data gives empty records (the damaged text is kept aside once). */
R.parse = function (text) {
  var d;
  try { d = text ? JSON.parse(text) : null; } catch (e) { d = null; }
  var out = empty();
  if (!d || typeof d !== 'object') return out;
  if (d.cats && typeof d.cats === 'object') Object.keys(d.cats).forEach(function (cat) {
    var c = d.cats[cat]; if (!c || typeof c !== 'object') return;
    out.cats[cat] = {};
    Object.keys(c).forEach(function (ch) {
      var x = c[ch]; if (!x || typeof x !== 'object') return;
      out.cats[cat][ch] = { best: num(x.best), reach: num(x.reach), reachLabel: typeof x.reachLabel === 'string' ? x.reachLabel : '', wins: num(x.wins), streak: num(x.streak), bestStreak: num(x.bestStreak), runs: num(x.runs) };
    });
  });
  if (Array.isArray(d.history)) out.history = d.history.filter(function (h) { return h && typeof h === 'object' && typeof h.id === 'string'; }).slice(-R.MAX_HISTORY);
  if (d.medals && typeof d.medals === 'object') Object.keys(d.medals).forEach(function (k) { if (R.medal(k)) out.medals[k] = { at: num(d.medals[k] && d.medals[k].at) }; });
  if (d.daily && typeof d.daily === 'object') Object.keys(d.daily).forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && d.daily[k] && typeof d.daily[k] === 'object') out.daily[k] = d.daily[k]; });
  if (typeof d.title === 'string' && out.medals[d.title]) out.title = d.title;
  if (Array.isArray(d.seen)) out.seen = d.seen.filter(function (x) { return typeof x === 'string'; }).slice(-60);
  return out;
};
R.load = function (storage) {
  storage = storage || (root.localStorage);
  var text = null;
  try { text = storage.getItem(R.KEY); } catch (e) { text = null; }
  var d = R.parse(text);
  if (text && !d.history.length && !Object.keys(d.cats).length && !/^\s*\{/.test(text)) { try { storage.setItem(R.KEY + '.damaged', text.slice(0, 20000)); } catch (e) {} }
  return d;
};
R.save = function (data, storage) {
  storage = storage || root.localStorage;
  try { storage.setItem(R.KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
};

/* ------------------------------------------------------------------ Today's Tower helpers used here */
function prevDay(date) { var t = Date.parse(date + 'T00:00:00Z'); return new Date(t - 86400000).toISOString().slice(0, 10); }
R.prevDay = prevDay;
R.dailyStreak = function (data, date) {
  var n = 0, d = date;
  while (data.daily[d] && data.daily[d].id) { n++; d = prevDay(d); }
  return n;
};

/* Today's Tower: the first start of the day on this device is the real attempt (an adventure given up still used
   it); later starts are practice. Returns true for the real attempt and marks the day as started. */
R.startDaily = function (data, date, now) {
  var day = data.daily[date];
  if (day) return false;
  data.daily[date] = { started: now || Date.now() };
  return true;
};

/* A stable id of an adventure, so that it is recorded once (a reload of the result screen, a guest's repeated state). */
R.runId = function (run, pi) { return [run.seed >>> 0, run.daily || '', run.short ? 's' : '', (run.players || []).map(function (p) { return p.ch; }).join(''), pi || 0, run.act, run.bosses, run.result].join(':'); };

/* Records one finished adventure. Returns what the result screen shows: score, best before/after, new medals... */
R.record = function (data, run, pi, now) {
  pi = pi || 0;
  now = now || Date.now();
  var me = run.players[pi] || run.players[0];
  var id = R.runId(run, pi);
  var sc = R.score(run, pi), reach = R.reach(run), cat = R.category(run), s = statsOf(run);
  var already = data.seen.indexOf(id) >= 0;
  var practice = false, rec = { practice: false };
  if (run.daily) { var day = data.daily[run.daily]; practice = !run.dailyOfficial || !!(day && day.id && day.id !== id); }
  rec.practice = practice;
  var per = (data.cats[cat] = data.cats[cat] || {});
  var row = per[me.ch] = per[me.ch] || { best: 0, reach: 0, reachLabel: '', wins: 0, streak: 0, bestStreak: 0, runs: 0 };
  var before = { best: row.best, reach: row.reach, reachLabel: row.reachLabel, streak: row.streak };
  // A seeded adventure or a practice run of Today's Tower is kept in the history but never sets a best or a streak.
  var counts = !run.seeded && !practice;
  var out = { id: id, category: cat, score: sc, reach: reach, practice: practice, counts: counts, before: before, newBest: false, newReach: false, newMedals: [], duplicate: already };
  if (already) { out.after = row; return out; }
  data.seen.push(id); if (data.seen.length > 60) data.seen.splice(0, data.seen.length - 60);
  if (counts) {
    row.runs++;
    if (sc.total > row.best) { out.newBest = row.best > 0; row.best = sc.total; }
    if (reach.value > row.reach) { out.newReach = row.reach > 0; row.reach = reach.value; row.reachLabel = reach.label; }
    if (run.result === 'victory') { row.wins++; row.streak++; row.bestStreak = Math.max(row.bestStreak, row.streak); } else row.streak = 0;
  }
  if (run.daily && !practice) data.daily[run.daily] = { id: id, score: sc.total, result: run.result, reach: reach.label, ch: me.ch, at: now };
  data.history.push({ id: id, at: now, cat: cat, ch: me.ch, name: me.name, mode: run.mode, asc: run.asc || 0, players: run.players.length, result: run.result, reach: reach.label, reachValue: reach.value,
    score: sc.total, seed: run.seed >>> 0, seeded: !!run.seeded, daily: run.daily || null, practice: practice, partial: s.partial || undefined,
    deck: me.deck.map(function (c) { return c.id + (c.up ? '+' : ''); }), relics: me.relics.map(function (r) { return r.id; }), stats: { rooms: s.rooms, won: s.won, kills: s.kills, dmg: s.dmg, maxHit: s.maxHit } });
  if (data.history.length > R.MAX_HISTORY) data.history.splice(0, data.history.length - R.MAX_HISTORY);
  R.MEDALS.forEach(function (m) {
    if (data.medals[m.id]) return;
    var got = false;
    try { got = !!m.ok(run, s, me, sc, rec, data); } catch (e) { got = false; }
    if (got) { data.medals[m.id] = { at: now }; out.newMedals.push(m.id); }
  });
  if (out.newMedals.length && !data.title) data.title = out.newMedals[out.newMedals.length - 1];
  out.after = row;
  return out;
};

/* The next goal shown on the result screen: beat the best, today's tower, or a medal still to earn. */
R.nextGoal = function (data, out, run, today) {
  var goals = [];
  var row = out && out.after;
  if (out && out.counts && row && row.best > 0 && out.score.total < row.best) goals.push({ k: 'best', text: '自己ベスト ' + row.best + '点まで あと' + (row.best - out.score.total) + '点' });
  else if (out && out.newBest) goals.push({ k: 'best', text: '自己ベスト更新！ 次は ' + (Math.ceil((out.score.total + 1) / 100) * 100) + '点を目指そう' });
  if (today && !data.daily[today]) goals.push({ k: 'daily', text: '今日の塔にまだ挑戦していません（1日1回の本番）' });
  var next = R.MEDALS.filter(function (m) { return !data.medals[m.id]; })[0];
  if (next) goals.push({ k: 'medal', text: '未取得の勲章「' + next.name + '」：' + next.tx, id: next.id });
  return goals;
};

/* Per-character summary for the records screen. */
R.summary = function (data, cat) { return data.cats[cat] || {}; };
})(typeof window !== 'undefined' ? window : globalThis);
