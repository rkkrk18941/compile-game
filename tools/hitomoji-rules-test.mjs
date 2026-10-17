// ヒトモジ・バトル: rules, word lists, CPU and online-protocol regression test.
//   node tools/hitomoji-rules-test.mjs            (quick)
//   node tools/hitomoji-rules-test.mjs --long     (more self-play games and a CPU strength table)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('../hitomoji-battle/engine.js');
const W = require('../hitomoji-battle/words.js');
const AI = require('../hitomoji-battle/ai.js');
const S = require('../hitomoji-battle/session.js');

const LONG = process.argv.includes('--long');
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  NG', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function section(t) { console.log('# ' + t); }
function rngOf(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

/* ------------------------------------------------------------------ writing words */
section('writing a word on the tags');
const N = (w, m = 'ja', L) => { const r = E.normalize(w, m, L); return r.ok ? r.cells.join('') : '!' + r.err; };
eq(N('スパゲッティ'), 'すはけつてい', 'small kana written large, ゛゜ dropped (説明書の例)');
eq(E.pad(E.normalize('スパゲッティ', 'ja').cells).join(''), 'すはけつてい×', 'one × for a 6-letter word');
eq(N('ジャム'), 'しやむ', 'ジャム → しやむ');
eq(N('パン'), 'はん', 'パン → はん');
eq(N('ぱんだ'), 'はんた', 'ぱんだ → はんた');
eq(N('レモネード'), 'れもねーと', 'ー is a letter of its own');
eq(N('ヴェネチア'), 'うえねちあ', 'ヴ → う');
eq(N('ﾊﾟﾝﾀﾞ'), 'はんた', 'half-width kana');
eq(N('ラ・フランス'), 'らふらんす', '・ and spaces are dropped');
eq(N('ラ－メン'), 'らーめん', 'a typed dash is the long-vowel mark');
eq(N('あ'), '!short', 'one letter is too short');
eq(N('ドラゴンフルーツ'), '!long', 'eight letters are too long');
eq(N('すいか', 'ja', 2), 'すいか', 'maxLen below 3 falls back to 7');
eq(N('ハンバーグ', 'ja', 5), 'はんはーく', '5 letters fit the short rule');
eq(N('ロールケーキ', 'ja', 5), '!long', '6 letters do not fit the short rule');
eq(N('大根'), '!chars', 'kanji are refused');
eq(N('Ice cream', 'en'), '!long', 'English: spaces dropped, 8 letters too long');
eq(N('T-Rex', 'en'), 'TREX', 'English: hyphen dropped');
eq(E.KANA.length, 47, '47 letters on the board (あ〜ん + ー)');
ok(E.KANA.includes('を') && E.KANA.includes('ん') && E.KANA.includes('ー'), 'を ん ー are on the board');
eq(E.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 test vector');
eq(E.sha256('あいう'), '486da9b15cffbdea0966687981c51c0281c446681fdc22dad0b8fdca83e99f09', 'SHA-256 with UTF-8');

/* ------------------------------------------------------------------ word lists */
section('お題 word lists');
const NG = ['まんこ', 'ちんこ', 'ちんほ', 'うんこ', 'せつくす', 'おつはい', 'ちんちん'];
for (const mode of ['ja', 'en']) {
  let total = 0;
  for (const th of W.list(mode)) {
    const keys = new Set();
    ok(th.words.length >= 20, mode + ':' + th.id + ' has at least 20 words (' + th.words.length + ')');
    for (const w of th.words) {
      total++;
      const r = E.normalize(w, mode, 7);
      ok(r.ok, mode + ':' + th.id + ' ' + w + ' fits the tags');
      const k = r.cells.join('');
      ok(!keys.has(k), mode + ':' + th.id + ' ' + w + ' is not a duplicate');
      keys.add(k);
      ok(!NG.some((x) => k.includes(x)), mode + ':' + th.id + ' ' + w + ' does not spell something rude');
    }
  }
  console.log('  ' + mode + ': ' + W.list(mode).length + ' お題, ' + total + ' words');
}

/* ------------------------------------------------------------------ the rules, by hand */
section('declaring, opening, continuing, going out');
function table(words, opt = {}) {
  const players = words.map((w, i) => ({ nm: 'P' + i, kind: 'me' }));
  const s = E.newGame(Object.assign({ gid: 77, mode: 'ja', theme: { id: 'free', name: 'なんでも' }, first: 0, players }, opt));
  const sec = words.map((w, i) => { const cells = E.pad(E.normalize(w, s.mode, s.maxLen).cells); return { cells, disp: w, salt: 'abcdef0123456789' + i }; });
  sec.forEach((w, i) => E.setReady(s, i, E.commitHash(s.gid, i, w.cells, w.salt)));
  return { s, sec };
}
function say(t, seat, ch) {
  const r = E.declare(t.s, seat, ch);
  if (!r.ok) return { err: r.err };
  t.s.pend.need.forEach((q) => { const a = E.answerFor(t.sec[q].cells, t.s.P[q].open, ch); if (a.out) a.word = t.sec[q]; E.answer(t.s, q, a); });
  return E.resolve(t.s);
}
{
  const t = table(['らいおん', 'きりん', 'しまうま']);
  eq(t.s.phase, 'play', 'everyone wrote: play starts');
  eq(say(t, 1, 'あ'), { err: 'turn' }, 'only the turn player declares');
  let ev = say(t, 0, 'ん');      // opens らいおん[3] (self) and きりん[2]
  eq(t.s.P[1].open, [null, null, 'ん', null, null, null, null], 'きりん opens its ん');
  eq(t.s.P[0].open[3], 'ん', 'the declarer opens its own ん too (自爆)');
  ok(ev.some((e) => e.k === 'hit' && e.seat === 0 && e.self), 'the self-hit is reported');
  ok(ev.some((e) => e.k === 'again' && e.seat === 0), 'a hit earns one more declaration');
  eq(t.s.turn, 0, 'still player 0');
  eq(say(t, 0, 'ん'), { err: 'used' }, 'a declared letter cannot be declared again');
  ev = say(t, 0, 'き');        // hits きりん again, but it is the second declaration
  ok(ev.some((e) => e.k === 'turn' && e.seat === 1), 'at most two declarations a turn');
  ev = say(t, 1, 'ぬ');
  ok(ev.some((e) => e.k === 'miss'), 'nobody has ぬ: a miss');
  eq(t.s.turn, 2, 'a miss passes the turn');
}
{
  const t = table(['らいおん', 'きりん', 'しまうま'], { selfChain: false });
  let ev = say(t, 0, 'お');    // only らいおん has お
  ok(!ev.some((e) => e.k === 'again'), 'with the "opponents only" option a self-hit does not continue');
  const t2 = table(['らいおん', 'きりん', 'しまうま']);
  ev = say(t2, 0, 'お');
  ok(ev.some((e) => e.k === 'again' && e.self), 'by default a self-hit alone continues (新版の説明書)');
}
{
  const t = table(['かば', 'りす', 'さる']);
  say(t, 0, 'き'); // miss
  say(t, 1, 'か'); // hits かば[0] → again
  let ev = say(t, 1, 'は');     // hits かば[1] → かば is out
  ok(ev.some((e) => e.k === 'out' && e.seat === 0), 'all letters open: out');
  eq(t.s.P[0].open, ['か', 'は', '×', '×', '×', '×', '×'], 'the ×s of a player who is out are shown');
  eq(t.s.P[0].word, 'かば', 'and the word');
  eq(t.s.P[0].ok, true, 'and it matches the commitment and every answer');
  eq(t.s.turn, 2, 'the turn goes past… to the next one still in');
  ev = say(t, 2, 'む');
  eq(t.s.turn, 1, 'and skips the one who is out');
}
{
  // the last two go out on the same letter: the one who declared it wins
  const t = table(['とと', 'ととと']);
  const ev = say(t, 0, 'と');
  eq(t.s.phase, 'over', 'game over');
  eq(t.s.winner, 0, 'the declarer survives (説明書)');
  ok(t.s.last, 'marked as a same-letter finish');
  ok(ev.some((e) => e.k === 'over' && e.last), 'over event says so');
  eq([t.s.P[0].place, t.s.P[1].place], [1, 2], 'places');
}
{
  // the declarer knocks itself out, two others stay
  const t = table(['あい', 'うえお', 'かきく']);
  say(t, 0, 'あ');                 // self-hit, continue
  const ev = say(t, 0, 'い');      // self-hit again: out
  ok(ev.some((e) => e.k === 'out' && e.seat === 0 && e.self), '自爆 can knock you out');
  eq(t.s.turn, 1, 'and the next player goes on');
  eq(t.s.phase, 'play', 'two players are still in');
}
{
  // places, a three-player finish
  const t = table(['あい', 'うえ', 'おか']);
  say(t, 0, 'う'); say(t, 0, 'え');        // P1 out
  say(t, 2, 'お'); say(t, 2, 'か');        // self 自爆 twice: P2 out → P0 wins
  eq(t.s.phase, 'over', 'over');
  eq(t.s.winner, 0, 'last one in wins');
  eq(t.s.P.map((p) => p.place), [1, 3, 2], 'whoever went out later places higher');
}
section('checking a word');
{
  const t = table(['ねこ', 'いぬ']);
  // player 1 lies: says it has no い
  E.declare(t.s, 0, 'い');
  E.answer(t.s, 0, { pos: [], out: false });
  E.answer(t.s, 1, { pos: [], out: false });
  E.resolve(t.s);
  say(t, 1, 'け');
  const c = E.checkWord(t.s, 1, t.sec[1]);
  eq(c.ok, false, 'a false answer is caught when the word is shown');
  eq(c.why, 'answer', 'reason: an answer');
  const c2 = E.checkWord(t.s, 0, { cells: t.sec[0].cells, salt: 'deadbeefdeadbeef' });
  eq(c2.why, 'hash', 'a different word or salt does not match the commitment');
  eq(E.checkWord(t.s, 0, t.sec[0]).ok, true, 'the honest word passes');
}
section('leaving');
{
  const players = ['A', 'B', 'C'].map((nm) => ({ nm, kind: 'me' }));
  const s = E.newGame({ gid: 5, players, first: 1, theme: { id: 'free', name: 'なんでも' } });
  E.setReady(s, 0, E.sha256('x'));
  E.forfeit(s, 1);
  eq(s.phase, 'write', 'still waiting for C');
  E.setReady(s, 2, E.sha256('y'));
  eq(s.phase, 'play', 'starts when the rest are ready');
  eq(s.turn, 2, 'the first seat left was out: the next one starts');
  E.forfeit(s, 2);
  eq(s.phase, 'over', 'one player left: over');
  eq(s.winner, 0, 'A wins');
}

/* ------------------------------------------------------------------ fake clock for sessions */
function clock() {
  let now = 0, seq = 0; const q = [];
  return {
    schedule(fn, ms) { const h = { t: now + ms, fn, id: ++seq }; q.push(h); return h; },
    unschedule(h) { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); },
    run(limit = 100000) { let n = 0; while (q.length && n++ < limit) { q.sort((a, b) => a.t - b.t || a.id - b.id); const h = q.shift(); now = h.t; h.fn(); } return n; },
    get now() { return now; }
  };
}

/* ------------------------------------------------------------------ CPU tables */
section('CPU-only games');
const themesJa = ['free'].concat(W.ja.map((t) => t.id)), themesEn = ['free'].concat(W.en.map((t) => t.id));
function cpuGame(seed, levels, opts = {}) {
  const rng = rngOf(seed), ck = clock();
  const mode = opts.mode || (rng() < 0.2 ? 'en' : 'ja');
  const themes = mode === 'en' ? themesEn : themesJa;
  const themeId = opts.theme || themes[Math.floor(rng() * themes.length)];
  const th = W.theme(mode, themeId);
  let last = null, events = [];
  const tb = new S.Table({
    seats: levels.map((lv, i) => ({ nm: 'C' + i, kind: 'cpu', cpu: lv })),
    mode, theme: { id: th.id, name: th.name }, maxLen: opts.maxLen || 7, selfChain: opts.selfChain !== false, first: Math.floor(rng() * levels.length),
    rng, schedule: ck.schedule, unschedule: ck.unschedule, onUpdate(v, ev) { last = v; events.push(...ev); }
  });
  tb.start();
  ck.run();
  return { s: tb.s, last, events, tb };
}
let games = 0, plies = 0, sameLetter = 0, selfOut = 0;
const nGames = LONG ? 600 : 160;
for (let g = 0; g < nGames; g++) {
  const n = 2 + (g % 5);
  const levels = Array.from({ length: n }, (_, i) => 1 + ((g + i) % 3));
  const { s, events } = cpuGame(1000 + g, levels, { maxLen: g % 7 === 3 ? 5 : 7, selfChain: g % 11 !== 5 });
  games++; plies += s.ply;
  ok(s.phase === 'over', 'game ' + g + ' ends');
  ok(s.winner >= 0 && !s.P[s.winner].out, 'game ' + g + ' has a winner who is in');
  ok(s.P.every((p) => p.ok === true), 'game ' + g + ': every word checks out ' + JSON.stringify(s.P.map((p) => p.ok + ':' + p.why)));
  ok(s.P.every((p) => p.cells && p.word), 'game ' + g + ': every word is shown at the end');
  ok(new Set(s.P.map((p) => p.place)).has(1), 'game ' + g + ': someone placed first');
  ok(s.log.every((r, i) => i === 0 || r.ply === s.log[i - 1].ply + 1), 'game ' + g + ': plies are consecutive');
  // nobody declared twice in a row after a miss, and never three times
  let run = 1;
  for (let i = 1; i < s.log.length; i++) { run = s.log[i].by === s.log[i - 1].by && s.log[i - 1].again ? run + 1 : 1; ok(run <= 2, 'game ' + g + ': at most two declarations a turn'); }
  if (s.last) sameLetter++;
  if (events.some((e) => e.k === 'out' && e.self)) selfOut++;
}
console.log('  ' + games + ' games, ' + (plies / games).toFixed(1) + ' declarations a game, ' + sameLetter + ' same-letter finishes, ' + selfOut + ' games with a 自爆 knock-out');

section('CPU strength (2 players, つよい vs やさしい / ふつう)');
function duel(a, b, n, seed) {
  let wa = 0;
  for (let g = 0; g < n; g++) {
    const flip = g % 2 === 1;
    const { s } = cpuGame(seed + g, flip ? [b, a] : [a, b], { mode: 'ja' });
    if (s.winner === (flip ? 1 : 0)) wa++;
  }
  return wa / n;
}
const nDuel = LONG ? 400 : 120;
const w31 = duel(3, 1, nDuel, 50000), w32 = duel(3, 2, nDuel, 60000), w21 = duel(2, 1, nDuel, 70000);
console.log('  つよい vs やさしい ' + (w31 * 100).toFixed(0) + '%,  つよい vs ふつう ' + (w32 * 100).toFixed(0) + '%,  ふつう vs やさしい ' + (w21 * 100).toFixed(0) + '%');
ok(w31 > 0.6, 'つよい beats やさしい clearly');
ok(w21 > 0.55, 'ふつう beats やさしい');
ok(w32 > 0.5, 'つよい beats ふつう');

section('CPU sense');
{
  // the CPU never declares its own last letter unless it takes everyone with it
  const t = table(['あいう', 'かきく']);
  t.s.P[1].kind = 'cpu';
  say(t, 0, 'か'); say(t, 0, 'き');           // P1: か き open, く hidden
  say(t, 1, 'あ'); say(t, 1, 'い');           // P1 opens P0's あ い (P0 has う hidden)
  // P0's turn: only P0's う and P1's く remain
  const ch = AI.chooseLetter(E.publicView(t.s), 0, t.sec[0].cells, 3, rngOf(3));
  ok(ch !== 'う', 'does not knock itself out with う (got ' + ch + ')');
}
{
  // both last letters the same, and the other word is plain to read: declaring it wins (same-letter finish)
  const t = table(['きいろ', 'くろ']);
  say(t, 0, 'く');            // opens くろ[0] → again
  say(t, 0, 'き');            // self-hit; two declarations, turn ends
  say(t, 1, 'い');            // opens きいろ[1] → again: P1 may declare once more
  const v = E.publicView(t.s);
  v.theme = { id: 'colors', name: 'いろ' };
  const ch = AI.chooseLetter(v, 1, t.sec[1].cells, 3, rngOf(9));
  eq(ch, 'ろ', 'takes the same-letter win (its own last ろ with きいろ\'s)');
}
{
  // known word: finish it
  const t = table(['すいか', 'とまと', 'ばなな']);
  const v = E.publicView(t.s);
  v.theme = { id: 'fruits', name: 'くだもの' };
  const ch = AI.chooseLetter(v, 0, t.sec[0].cells, 3, rngOf(4));
  ok(!t.sec[0].cells.includes(ch), 'opening letter is not one of its own (got ' + ch + ')');
}
{
  const r = AI.chooseWord('ja', 'animals', 3, rngOf(8), 7);
  ok(E.validCells('ja', r.cells, 7), 'CPU words fit the tags');
  const r5 = AI.chooseWord('ja', 'dishes', 2, rngOf(9), 5);
  ok(E.wordLen(r5.cells) <= 5, 'CPU words respect the 5-letter rule');
  const avoid = AI.chooseWord('ja', 'colors', 1, rngOf(1), 7);
  for (let i = 0; i < 20; i++) ok(AI.chooseWord('ja', 'colors', 1, rngOf(100 + i), 7, [avoid.key]).key !== avoid.key, 'CPUs avoid a word already taken');
}

/* ------------------------------------------------------------------ online: host table + guests */
section('online protocol (host table, guests, a CPU)');
function onlineGame(seed, opts = {}) {
  const rng = rngOf(seed), ck = clock();
  const seats = [{ nm: 'Host', kind: 'me' }, { nm: 'G1', kind: 'guest', cid: 'g1' }, { nm: 'G2', kind: 'guest', cid: 'g2' }, { nm: 'CPU', kind: 'cpu', cpu: 2 }];
  const guests = {};
  let hostView = null, msgs = 0;
  const tb = new S.Table({
    seats, mode: 'ja', theme: { id: 'animals', name: 'どうぶつ' }, first: 1, rng, schedule: ck.schedule, unschedule: ck.unschedule,
    onUpdate(v) { hostView = v; for (const k in guests) { const g = guests[k]; ck.schedule(() => g.brain.onView(JSON.parse(JSON.stringify(v)), g.seat), 30 + Math.floor(rng() * 40)); } }
  });
  for (const [seat, cid] of [[1, 'g1'], [2, 'g2']]) {
    const g = { seat, cid };
    g.brain = new S.Guest({ now: () => ck.now, send: (m) => { msgs++; const lie = opts.liar === seat && m.k === 'hits'; if (lie) m = Object.assign({}, m, { pos: [], out: false }); ck.schedule(() => S.hostHandle(tb, seat, JSON.parse(JSON.stringify(m))), 30 + Math.floor(rng() * 40)); } });
    guests[cid] = g;
  }
  tb.start(); ck.run(50);
  // everyone writes
  const words = { 0: 'ライオン', 1: 'カピバラ', 2: 'ペンギン' };
  for (const k in guests) { const g = guests[k]; g.brain.onView(hostView, g.seat); ok(g.brain.write(E.pad(E.normalize(words[g.seat], 'ja').cells), words[g.seat]).ok, 'guest ' + g.seat + ' writes'); }
  tb.writeLocal(0, E.pad(E.normalize(words[0], 'ja').cells), words[0]);
  ck.run(2000);
  ok(tb.s.phase === 'play', 'play starts once all commitments are in');
  ok(!JSON.stringify(hostView).includes('かひはら'), "the host's view never holds a guest's word before it is shown");
  // the people play a simple letter order; the CPU plays itself
  const order = E.KANA.split('');
  let guard = 0;
  while (tb.s.phase === 'play' && guard++ < 400) {
    const s = tb.s;
    if (!s.pend && s.seats !== null) {
      const t = s.turn;
      const pickFree = () => order.find((c) => !s.used[c]);
      if (t === 0) tb.declare(0, pickFree());
      else if (t === 1 || t === 2) { const g = t === 1 ? guests.g1 : guests.g2; g.brain.onView(E.publicView(s), g.seat); g.brain.declare(pickFree()); }
    }
    ck.run(400);
  }
  ck.run(5000);
  return { tb, msgs };
}
{
  const { tb, msgs } = onlineGame(4242);
  ok(tb.s.phase === 'over', 'the online game ends');
  ok(tb.s.P.every((p) => p.ok === true), 'every word (guests included) checks out: ' + JSON.stringify(tb.s.P.map((p) => [p.word, p.ok, p.why])));
  ok(tb.s.P.every((p) => p.word), 'every word is shown at the end');
  console.log('  ' + tb.s.ply + ' declarations, ' + msgs + ' guest messages, winner ' + tb.s.P[tb.s.winner].nm);
}
{
  const { tb } = onlineGame(777, { liar: 2 });
  const p = tb.s.P[2];
  ok(tb.s.phase === 'over', 'a game with a lying guest still ends');
  eq(p.ok, false, 'the lying guest is caught (' + p.why + ')');
}
{
  // a guest gone for good: the host forfeits them during a pending declaration
  const rng = rngOf(99), ck = clock();
  let v0 = null;
  const tb = new S.Table({ seats: [{ nm: 'H', kind: 'me' }, { nm: 'G', kind: 'guest' }, { nm: 'C', kind: 'cpu', cpu: 1 }], mode: 'ja', theme: { id: 'fruits', name: 'くだもの' }, first: 0, rng, schedule: ck.schedule, unschedule: ck.unschedule, onUpdate(v) { v0 = v; } });
  tb.start();
  tb.writeLocal(0, E.pad(E.normalize('りんご', 'ja').cells), 'りんご');
  tb.commitRemote(1, E.sha256('whatever'));
  ck.run(3000);
  eq(tb.s.phase, 'play', 'started');
  tb.declare(0, 'あ');
  ok(tb.waitingFor().includes(1), 'waiting for the guest');
  tb.forfeit(1);
  ck.run(3000);
  ok(tb.s.P[1].out && tb.s.P[1].forfeit, 'the guest is out (棄権)');
  ok(tb.s.phase === 'play' || tb.s.phase === 'over', 'the table goes on');
}

{
  // a guest whose word is not on this device gives up the seat; a guest who leaves while writing can be forfeited
  const rng = rngOf(5), ck = clock();
  let last = null;
  const tb = new S.Table({ seats: [{ nm: 'H', kind: 'me' }, { nm: 'G1', kind: 'guest' }, { nm: 'G2', kind: 'guest' }, { nm: 'C', kind: 'cpu', cpu: 2 }], mode: 'ja', theme: { id: 'colors', name: 'いろ' }, first: 0, rng, schedule: ck.schedule, unschedule: ck.unschedule, onUpdate(v) { last = v; } });
  tb.start();
  tb.writeLocal(0, E.pad(E.normalize('あか', 'ja').cells), 'あか');
  const g1 = new S.Guest({ send: (m) => S.hostHandle(tb, 1, m) });
  g1.onView(tb.view(), 1); g1.write(E.pad(E.normalize('しろ', 'ja').cells), 'しろ');
  ck.run(3000);
  eq(tb.s.phase, 'write', 'still waiting for G2');
  ok(tb.forfeit(2), 'the host can forfeit a guest who left while writing');
  ck.run(3000);
  eq(tb.s.phase, 'play', 'and the game starts without them');
  ok(tb.s.P[2].out && tb.s.P[2].forfeit, 'G2 is out (棄権)');
  const stranger = new S.Guest({ send: (m) => S.hostHandle(tb, 1, m) });   // G1 again, from a browser without the word
  stranger.onView(tb.view(), 1);
  ok(tb.s.P[1].out && tb.s.P[1].forfeit, 'a seat whose word is not on this device is given up');
  for (let i = 0; i < 200 && tb.s.phase === 'play'; i++) {
    if (tb.s.turn === 0 && !tb.s.pend) tb.declare(0, E.KANA.split('').find((c) => !tb.s.used[c] && c !== 'あ' && c !== 'か') || E.KANA.split('').find((c) => !tb.s.used[c]));
    ck.run(400);
  }
  ck.run(20000);
  eq(tb.s.phase, 'over', 'the rest finish the game');
}
{
  // the CPU does not throw itself out on a guess
  const t = table(['あと', 'いと']);
  say(t, 0, 'あ'); say(t, 0, 'い');
  const ch = AI.chooseLetter(E.publicView(t.s), 1, t.sec[1].cells, 3, rngOf(9));
  ok(ch !== 'と', 'with "なんでも" and only あ・ known, it does not gamble on と (got ' + ch + ')');
}

console.log('\n' + (fails ? fails + ' / ' + checks + ' checks FAILED' : 'all ' + checks + ' checks passed'));
process.exit(fails ? 1 : 0);
