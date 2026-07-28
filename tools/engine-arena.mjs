/* 強さの実測。index.html の sim* エンジンをそのまま抜き出し、審判（ルール）は
   常に忠実モデルにしたうえで、各プレイヤーには自分の「信じているモデル」で
   手を選ばせる。

   これが公平な設計である理由：旧CPUの欠陥は「盤面の理解が間違っている」こと
   だった。だから旧側には旧のバケツ近似で読ませ、結果だけを本物のルールで
   裁定する。旧モデルが本物のゲームでどれだけ損をするかを直接測れる。

   実行例:
     node tools/engine-arena.mjs --games 40 --depth 4
     node tools/engine-arena.mjs --mode depth --games 30
     node tools/engine-arena.mjs --mode legacy --games 40 --depth 4          */
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* ---- ルールDB（旧モデルの再現に使う） ---- */
const dbMatch = html.match(/const D5=([^;]+);\s*const DB=(\{[\s\S]*?\});\s*const HEX=/);
if (!dbMatch) throw new Error('DB の抽出に失敗しました。');

/* ---- sim エンジン ---- */
const start = html.indexOf('const SIM_BRANCH=');
const end = html.indexOf('function cpuPlayScore(');
if (start < 0 || end <= start) throw new Error('sim エンジンの抽出に失敗しました。');
const engineSrc = html.slice(start, end);

const prelude = `
  const POLICY={compiled:.365765,lane:1.55074,ready:1.540927,threat:1.934431,hand:.574282,
    card:1.422803,effect:1.445384,denial:.910808,future:.547067,repeat:.970749,risk:.317444};
  let PROFILE={beam:8,depth:4,maxNodes:400000,searchMs:1500};
  let CPU_SIDE=0;
  const cpuPlayer=()=>CPU_SIDE;
  const humanPlayer=()=>1-CPU_SIDE;
  const cpuPolicy=()=>POLICY;
  const cpuProfile=()=>PROFILE;
  const cpuCardKey=c=>c.id||c.i;
  const cpuOpponentActionPrior=()=>0;
  const cpuNow=()=>Date.now();
  const CPU_SEARCH_ABORT={};
  let CONTROL_ON=false;
  const controlCardsEnabled=()=>CONTROL_ON;
  let G=null;
`;
const epilogue = `
  globalThis.API={
    simApply,simEffect,simEval,simActions,simCompile,simClone,simTotal,simNode,simTop,
    simUpLines,simDownLines,simPrune,simChoose,
    setSide:v=>{CPU_SIDE=v;},setProfile:p=>{PROFILE=p;},getProfile:()=>PROFILE,
    ABORT:CPU_SEARCH_ABORT
  };
  globalThis.DB=null;
`;
const ctx = vm.createContext({ Date, Math, JSON, console });
new vm.Script(prelude + engineSrc + epilogue).runInContext(ctx);
new vm.Script(`const D5=${dbMatch[1]};globalThis.DB=(${dbMatch[2]});`).runInContext(ctx);
const S = ctx.API, DB = ctx.DB;
const PROTOCOLS = Object.keys(DB);

/* ---- 引数 ---- */
const argOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const v = process.argv[at + 1];
  return v === undefined ? fallback : (isNaN(Number(v)) ? v : Number(v));
};
const GAMES = Number(argOf('games', 40));
const DEPTH = Number(argOf('depth', 4));
const BEAM = Number(argOf('beam', 8));
const MODE = String(argOf('mode', 'legacy'));
const MAXTURNS = Number(argOf('maxturns', 120));
const SEED0 = Number(argOf('seed', 12345));

/* ---- 決定的な乱数 ---- */
let RNG = SEED0 >>> 0;
function rnd() { RNG ^= RNG << 13; RNG ^= RNG >>> 17; RNG ^= RNG << 5; RNG >>>= 0; return RNG / 4294967296; }
function shuffled(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/* ---- 局面の生成 ---- */
let uid = 0;
const valuesFor = p => { const v = Object.keys(DB[p]).map(Number).sort((a, b) => a - b); while (v.length < 6) v.unshift(0); return v; };
function buildDeck(protos, owner) {
  const d = [];
  for (const p of protos) for (const v of valuesFor(p)) d.push({ i: `c${++uid}`, p, v, d: false, o: owner });
  return shuffled(d);
}
function newGame(protoA, protoB) {
  const s = {
    L: [[[], [], []], [[], [], []]],
    H: [[], []], D: [buildDeck(protoA, 0), buildDeck(protoB, 1)], X: [[], []],
    P: [protoA.map(n => ({ n, c: false })), protoB.map(n => ({ n, c: false }))],
    skip: [false, false], ctrl: null, ctrlOn: false, win: null
  };
  for (let p = 0; p < 2; p++) for (let k = 0; k < 5; k++) { const c = s.D[p].pop(); if (c) s.H[p].push(c); }
  return s;
}

/* ================= 旧モデル（バケツ近似）の再現 =================
   v5 以前の cpuPerfectEffect が実際にやっていたこと。多数のカードが
   「相手の最大ラインを4減らす」「4だけ別ラインへ移す」に潰れていた。 */
const LEGACY_DRAWS = { 'SPIRIT:1': 2, 'LIFE:2': 1, 'WATER:2': 2, 'GRAVITY:1': 2, 'METAL:1': 2, 'METAL:3': 1, 'LIGHT:2': 2, 'FIRE:0': 2, 'SPEED:1': 2, 'DARKNESS:0': 3, 'PSYCHIC:0': 2 };
const LEGACY_CUT4 = ['SPIRIT:2', 'LIFE:1', 'WATER:0', 'PLAGUE:3', 'METAL:0', 'LIGHT:0', 'FIRE:0', 'DARKNESS:1'];
const LEGACY_MOVE4 = ['GRAVITY:1', 'GRAVITY:2', 'GRAVITY:4', 'LIGHT:3', 'SPEED:3', 'SPEED:4', 'DARKNESS:0', 'DARKNESS:1', 'DARKNESS:4', 'PSYCHIC:3'];
const LEGACY_DEL6 = ['DEATH:0', 'DEATH:2', 'DEATH:3', 'DEATH:4'];
const textOf = c => Object.values(DB[c.p]?.[c.v] || {}).join(' ');
function legacyTextValue(t = '') {
  let s = 0;
  if (/削除/.test(t)) s += 3; if (/反転/.test(t)) s += 2; if (/移動/.test(t)) s += 1.5;
  if (/引く/.test(t)) s += 1.2; if (/捨て札/.test(t)) s += 1.4; if (/戻す/.test(t)) s += 1.6;
  return s + t.length * 0.02;
}
function legacyThreatLine(s, p) {
  let best = 0, bs = -Infinity;
  for (let l = 0; l < 3; l++) {
    const sc = S.simTotal(s, p, l) - S.simTotal(s, 1 - p, l) + (!s.P[p][l].c && S.simTotal(s, p, l) >= 10 ? 12 : 0);
    if (sc > bs) { bs = sc; best = l; }
  }
  return best;
}
function legacyReduce(s, p, l, amount) {
  /* 合計値だけを削る旧モデルの近似を、実カードで最も近い形に落とす */
  let left = amount;
  const line = s.L[p][l];
  for (let i = line.length - 1; i >= 0 && left > 0; i--) {
    const c = line[i]; left -= (c.d ? 2 : c.v);
    line.splice(i, 1); c.d = false; s.X[c.o].push(c);
  }
}
function legacyMove(s, p, from, to, amount) {
  let left = amount;
  const line = s.L[p][from];
  for (let i = line.length - 1; i >= 0 && left > 0; i--) {
    const c = line[i]; left -= (c.d ? 2 : c.v);
    line.splice(i, 1); s.L[p][to].push(c);
  }
}
function legacyHandDiscard(s, p, n) {
  const rank = s.H[p].slice().sort((a, b) => (a.v * 2) - (b.v * 2) || a.i.localeCompare(b.i));
  for (const c of rank.slice(0, Math.min(n, rank.length))) {
    const at = s.H[p].findIndex(x => x.i === c.i);
    if (at >= 0) { const g = s.H[p].splice(at, 1)[0]; g.d = false; s.X[g.o].push(g); }
  }
}
function legacyDraw(s, p, n) {
  for (let k = 0; k < n; k++) { if (!s.D[p].length && s.X[p].length) s.D[p] = s.X[p].splice(0); const c = s.D[p].pop(); if (!c) break; c.d = false; s.H[p].push(c); }
}
/* 旧モデルでの「1手を指した後の盤面」（信念） */
function legacyApply(s, p, action) {
  const n = S.simClone(s), op = 1 - p;
  if (action.t === 'refresh') { legacyDraw(n, p, Math.max(0, 5 - n.H[p].length)); return n; }
  const at = n.H[p].findIndex(c => c.i === action.id);
  if (at < 0) return n;
  const card = n.H[p].splice(at, 1)[0], line = action.line;
  card.d = action.mode === 'down';
  n.L[p][line].push(card);
  if (action.mode !== 'up') return n;
  const key = card.p + ':' + card.v;
  if (card.v === 5) { if (n.H[p].length) legacyHandDiscard(n, p, 1); return n; }
  const draws = LEGACY_DRAWS[key] || 0; if (draws) legacyDraw(n, p, draws);
  if (key === 'METAL:1') n.skip[op] = true;
  if (['PLAGUE:0', 'PLAGUE:1', 'PSYCHIC:3'].includes(key)) legacyHandDiscard(n, op, 1);
  if (['PSYCHIC:0', 'PSYCHIC:2'].includes(key)) legacyHandDiscard(n, op, 2);
  if (LEGACY_DEL6.includes(key)) { const t = legacyThreatLine(n, op); legacyReduce(n, op, t, 6); }
  if (LEGACY_CUT4.includes(key)) { const t = legacyThreatLine(n, op); legacyReduce(n, op, t, 4); }
  if (LEGACY_MOVE4.includes(key)) {
    const t = legacyThreatLine(n, op);
    const safe = [0, 1, 2].filter(x => x !== t).sort((a, b) => S.simTotal(n, op, a) - S.simTotal(n, op, b))[0];
    if (safe != null) legacyMove(n, op, t, safe, 4);
  }
  /* テキスト頻度による momentum 加点（旧モデルの特徴） */
  n.__mom = (n.__mom || 0) + (p === 0 ? 1 : -1) * legacyTextValue(textOf(card)) * 14;
  return n;
}
function legacyNode(s, actor, plies, ctx2, alpha = -Infinity, beta = Infinity) {
  ctx2.nodes++;
  if (ctx2.nodes > ctx2.maxNodes || Date.now() > ctx2.deadline) throw S.ABORT;
  const ready = S.simCompile(s, actor);
  if (ready.win != null || plies <= 0) return S.simEval(ready) + (ready.__mom || 0);
  const max = actor === 0;
  let children = S.simActions(ready, actor).map(a => {
    const child = legacyApply(ready, actor, a);
    return { child, score: S.simEval(child) + (child.__mom || 0), key: a.key };
  });
  if (!children.length) return legacyNode(ready, 1 - actor, plies - 1, ctx2, alpha, beta);
  children.sort((a, b) => max ? b.score - a.score || a.key.localeCompare(b.key) : a.score - b.score || a.key.localeCompare(b.key));
  children = children.slice(0, ctx2.beam);
  let best = max ? -Infinity : Infinity;
  for (const e of children) {
    const v = legacyNode(e.child, 1 - actor, plies - 1, ctx2, alpha, beta);
    if (max) { best = Math.max(best, v); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, v); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

/* ---- 着手選択 ----
   予算は「時間」ではなく「探索ノード数」で与え、しかも候補手ごとに等分する。
   共通の締切にすると、先に評価された候補だけが深く読まれて有利になり、
   計測そのものが歪む。ノード等分なら再現性もある。 */
function pickMove(state, side, cfg) {
  S.setSide(side);
  S.setProfile({ beam: cfg.beam, depth: cfg.depth, maxNodes: cfg.nodes, searchMs: 1e9 });
  const actions = S.simActions(state, side);
  if (!actions.length) return null;
  const per = Math.max(400, Math.floor(cfg.nodes / actions.length));
  let best = null, bestVal = -Infinity;
  for (const a of actions) {
    /* ルート展開は各自が信じているモデルで行う */
    const roots = cfg.legacy ? [legacyApply(state, side, a)] : S.simApply(state, side, a);
    const root = cfg.legacy ? roots[0] : (S.simChoose(roots, side) || roots[0]);
    let v;
    const c2 = { nodes: 0, maxNodes: per, deadline: Infinity, tt: new Map(), hits: 0, beam: cfg.beam };
    try {
      v = cfg.legacy
        ? legacyNode(root, 1 - side, cfg.depth, c2)
        : S.simNode(root, 1 - side, cfg.depth, c2);
    } catch (e) { v = S.simEval(root) + (root.__mom || 0); }
    /* simEval は cpuPlayer 視点。side を CPU_SIDE に設定済みなので大きいほど良い */
    if (v > bestVal) { bestVal = v; best = a; }
  }
  return best;
}

/* ---- 1局 ---- */
function playGame(cfgA, cfgB, protoA, protoB, first) {
  const s0 = newGame(protoA, protoB);
  let s = s0, turn = 0, cur = first;
  while (turn < MAXTURNS) {
    turn++;
    s = S.simCompile(s, cur);
    if (s.win != null) return { winner: s.win, turns: turn };
    const cfg = cur === 0 ? cfgA : cfgB;
    const move = pickMove(s, cur, cfg);
    if (move) {
      S.setSide(cur);
      const outs = S.simApply(s, cur, move);
      s = S.simChoose(outs, cur) || outs[0];
    }
    s = S.simCompile(s, cur);
    if (s.win != null) return { winner: s.win, turns: turn };
    /* 手番終了時に手札を5枚へ（キャッシュ相当の簡略化） */
    cur = 1 - cur;
  }
  /* 打ち切りはコンパイル数→合計値で判定 */
  const cc = p => s.P[p].filter(x => x.c).length;
  if (cc(0) !== cc(1)) return { winner: cc(0) > cc(1) ? 0 : 1, turns: turn, timeout: true };
  const tot = p => [0, 1, 2].reduce((n, l) => n + S.simTotal(s, p, l), 0);
  return { winner: tot(0) === tot(1) ? null : (tot(0) > tot(1) ? 0 : 1), turns: turn, timeout: true };
}

function runMatch(label, cfgA, cfgB, games) {
  let a = 0, b = 0, draw = 0, turns = 0, t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const pool = shuffled(PROTOCOLS);
    const protoA = pool.slice(0, 3), protoB = pool.slice(3, 6);
    /* 先手と席を入れ替えて偏りを消す */
    const swap = g % 2 === 1;
    const r = swap
      ? playGame(cfgB, cfgA, protoA, protoB, g % 4 < 2 ? 0 : 1)
      : playGame(cfgA, cfgB, protoA, protoB, g % 4 < 2 ? 0 : 1);
    turns += r.turns;
    const winnerIsA = r.winner == null ? null : (swap ? r.winner === 1 : r.winner === 0);
    if (winnerIsA === null) draw++; else if (winnerIsA) a++; else b++;
    process.stdout.write(`\r  ${label}  ${g + 1}/${games}  ${a}-${b}${draw ? ' 分' + draw : ''}   `);
  }
  const dec = a + b;
  const rate = dec ? (a / dec * 100) : 0;
  /* 二項分布の 95% 信頼区間（Wilson） */
  const z = 1.96, n = dec || 1, p = dec ? a / dec : .5;
  const den = 1 + z * z / n, cen = (p + z * z / (2 * n)) / den;
  const halfw = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  console.log(`  ${label.padEnd(34)} ${String(a).padStart(3)}勝 ${String(b).padStart(3)}敗 ${draw ? draw + '分 ' : '   '} ` +
    `勝率 ${rate.toFixed(1)}%  95%CI[${(Math.max(0, cen - halfw) * 100).toFixed(1)}-${(Math.min(1, cen + halfw) * 100).toFixed(1)}]  ` +
    `平均${(turns / games).toFixed(1)}手  ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
  return { a, b, draw, rate };
}

const NODES = Number(argOf('nodes', 12000));
const cfg = (o = {}) => ({ beam: BEAM, depth: DEPTH, nodes: NODES, legacy: false, ...o });

console.log(`\nCOMPILE エンジン強度計測  （審判＝忠実ルール／${GAMES}局・席と先手を交替）\n`);

if (MODE === 'legacy' || MODE === 'all') {
  console.log(`■ 新モデル vs 旧バケツモデル（同じ探索深さ ${DEPTH}・候補 ${BEAM}本）`);
  runMatch('新(忠実) vs 旧(バケツ)', cfg(), cfg({ legacy: true }), GAMES);
  console.log('');
}
if (MODE === 'depth' || MODE === 'all') {
  console.log('■ 深さを変えたときに本当に強くなるか（新モデル同士）');
  runMatch('深さ4 vs 深さ2', cfg({ depth: 4 }), cfg({ depth: 2 }), GAMES);
  runMatch('深さ6 vs 深さ4', cfg({ depth: 6 }), cfg({ depth: 4 }), GAMES);
  runMatch('候補12 vs 候補6', cfg({ beam: 12 }), cfg({ beam: 6 }), GAMES);
  console.log('');
}
if (MODE === 'sanity') {
  console.log('■ 同一設定同士（50%付近になるはず＝計測系の健全性確認）');
  runMatch('同設定 A vs B', cfg(), cfg(), GAMES);
  console.log('');
}
console.log('注: 審判は index.html と同じ忠実ルール実装。旧側は当時のバケツ近似で読み、結果のみ本物のルールで裁定している。\n');
