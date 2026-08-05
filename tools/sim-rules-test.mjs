/* v7 忠実シミュレーションのルール適合テスト。
   index.html から sim* エンジンだけを抜き出し、DOM も G も無い状態で実行する。
   旧エンジンは DEATH 0 / LIFE 1 / WATER 0 などを同一のバケツ処理にまとめていたため、
   ここでは「各カードが実際に違う結果を生むこと」を機械的に検査する。
   実行: node tools/sim-rules-test.mjs                                        */
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dbMatch = html.match(/const D5=([^;]+);\s*const DB=({[\s\S]*?});\s*const HEX=/);
const set2DbMatch = html.match(/Object\.assign\(DB,({\s*CHAOS:\{[\s\S]*?\nWAR:\{[\s\S]*?\n\}\s*})\);/);
if (!dbMatch || !set2DbMatch) throw new Error('カードデータの抽出に失敗しました。');
const dbContext = vm.createContext({});
new vm.Script(`const D5=${dbMatch[1]};globalThis.DB=(${dbMatch[2]});`).runInContext(dbContext);
new vm.Script(`Object.assign(DB,(${set2DbMatch[1]}));`).runInContext(dbContext);
const DB = dbContext.DB;
const start = html.indexOf('const SIM_BRANCH=');
const end = html.indexOf('function cpuPlayScore(');
if (start < 0 || end < 0 || end <= start) throw new Error('sim エンジンの抽出に失敗しました。');
const engineSrc = html.slice(start, end);

/* ---- エンジンが参照する外部依存のスタブ ---- */
const prelude = `
  const POLICY={compiled:1,lane:1,ready:1,threat:1,hand:1,card:1,effect:1,denial:1,future:1,repeat:1,risk:1};
  let PROFILE={beam:8,depth:4,maxNodes:200000,searchMs:2000};
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
    simApply,simEffect,simEval,simTotal,simActions,simCompile,simClone,simTop,
    simEffValue,simNode,simInitialState,simStartPhase,simEndPhase,
    simFinishTurn,simResolveAction,
    setSide:v=>{CPU_SIDE=v;},setControl:v=>{CONTROL_ON=v;},setProfile:v=>{PROFILE={...PROFILE,...v};}
  };
`;
const ctx = vm.createContext({ Date, Math, JSON, console, DB });
new vm.Script(prelude + engineSrc + epilogue).runInContext(ctx);
const S = ctx.API;

/* ---- 盤面ビルダー ---- */
let seq = 0;
const card = (p, v, d = false, o = 0) => ({ i: `c${++seq}`, p, v, d, o });
function blank(protos = [['SPIRIT', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]) {
  return {
    L: [[[], [], []], [[], [], []]],
    H: [[], []], D: [[], []], X: [[], []],
    P: [0, 1].map(p => protos[p].map(n => ({ n, c: false }))),
    skip: [false, false], ctrl: null, ctrlOn: false, win: null
  };
}
/* 手札の1枚を表向きでプレイして、生じた候補状態を返す */
function play(state, p, c, line, mode = 'up') {
  state.H[p].push(c);
  return S.simApply(state, p, { t: 'play', id: c.i, proto: c.p, val: c.v, mode, line, key: 'k' });
}
const fieldIds = (s, p, l) => s.L[p][l].map(c => c.i);
const countField = s => { let n = 0; for (let p = 0; p < 2; p++) for (let l = 0; l < 3; l++) n += s.L[p][l].length; return n; };
const anyOf = (outs, pred) => outs.some(pred);

/* ---- テストランナー ---- */
let pass = 0, fail = 0;
function check(name, fn) {
  try {
    const r = fn();
    if (r === true) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${r ? ' — ' + r : ''}`); }
  } catch (e) { fail++; console.log(`  FAIL ${name} — ${e.message}`); }
}

console.log('\nv7 忠実シミュレーション ルール検査\n');
S.setSide(0);

/* === 削除系：それぞれ挙動が違うことを検査 === */
check('DEATH 0 は他の各ラインから1枚ずつ削除する（計2枚）', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.L[1][1].push(card('LIFE', 3, false, 1));
  s.L[1][2].push(card('WATER', 3, false, 1));
  const before = countField(s);
  const outs = play(s, 0, card('DEATH', 0), 0);
  /* 自身が1枚増え、他ライン2枚が消える → 差し引き -1 */
  return anyOf(outs, o => countField(o) === before - 1) || `結果=${outs.map(countField).join(',')} 期待=${before - 1}`;
});

check('DEATH 3 は裏向きのカードしか削除できない', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const faceUp = card('LIFE', 4, false, 1), faceDown = card('WATER', 1, true, 1);
  s.L[1][1].push(faceUp); s.L[1][2].push(faceDown);
  const outs = play(s, 0, card('DEATH', 3), 0);
  const survives = outs.every(o => fieldIds(o, 1, 1).includes(faceUp.i));
  const removable = anyOf(outs, o => !fieldIds(o, 1, 2).includes(faceDown.i));
  return (survives && removable) || `表向き温存=${survives} 裏向き削除可=${removable}`;
});

check('DEATH 4 は値0か1のカードしか削除できない', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const big = card('LIFE', 4, false, 1), small = card('WATER', 1, false, 1);
  s.L[1][1].push(big); s.L[1][2].push(small);
  const outs = play(s, 0, card('DEATH', 4), 0);
  const bigSafe = outs.every(o => fieldIds(o, 1, 1).includes(big.i));
  const smallHit = anyOf(outs, o => !fieldIds(o, 1, 2).includes(small.i));
  return (bigSafe && smallHit) || `値4温存=${bigSafe} 値1削除可=${smallHit}`;
});

check('DEATH 2 は選んだラインの同値カードを全部まとめて削除する', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.L[1][1].push(card('LIFE', 1, false, 1), card('LIFE', 1, false, 1), card('LIFE', 4, false, 1));
  const outs = play(s, 0, card('DEATH', 2), 0);
  /* 値1が2枚同時に消える候補が存在する */
  return anyOf(outs, o => o.L[1][1].length === 1) || `残数=${outs.map(o => o.L[1][1].length).join(',')}`;
});

/* === 反転系 === */
check('LIFE 1 は異なる2枚を反転させる', () => {
  const s = blank([['SPIRIT', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const a = card('SPIRIT', 2, true, 1), b = card('WATER', 1, true, 1);
  s.L[1][0].push(a); s.L[1][2].push(b);
  const self = card('LIFE', 1);
  const outs = play(s, 0, self, 1);
  /* 効果解決前の向き。どの2枚を選ぶかは評価次第なので、
     「初期状態から向きが変わったカードがちょうど2枚」であることだけを見る。 */
  const baseline = { [self.i]: false, [a.i]: true, [b.i]: true };
  const flipped = o => {
    let n = 0;
    for (let p = 0; p < 2; p++) for (let l = 0; l < 3; l++) for (const c of o.L[p][l])
      if (baseline[c.i] !== undefined && c.d !== baseline[c.i]) n++;
    return n;
  };
  return anyOf(outs, o => flipped(o) === 2) || `反転枚数=${outs.map(flipped).join(',')}`;
});

check('WATER 0 は他を反転させた後、自分自身も裏返る', () => {
  const s = blank([['WATER', 'LIFE', 'SPIRIT'], ['SPIRIT', 'LIFE', 'WATER']]);
  const target = card('SPIRIT', 2, true, 1);
  s.L[1][2].push(target);
  const self = card('WATER', 0);
  const outs = play(s, 0, self, 0);
  return outs.every(o => { const me = o.L[0][0].find(c => c.i === self.i); return me && me.d === true; })
    || '自身が裏向きになっていない';
});

check('PLAGUE 3 は覆われていない表向きの他カードを全部反転させる', () => {
  const s = blank([['PLAGUE', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const t1 = card('SPIRIT', 2, false, 1), t2 = card('WATER', 3, false, 1);
  s.L[1][0].push(t1); s.L[1][2].push(t2);
  const outs = play(s, 0, card('PLAGUE', 3), 0);
  return outs.every(o =>
    o.L[1][0].find(c => c.i === t1.i)?.d === true &&
    o.L[1][2].find(c => c.i === t2.i)?.d === true) || '一部しか反転していない';
});

/* === METAL 6 の自己削除ルール === */
check('METAL 6 は反転させられると反転せず削除される', () => {
  const s = blank([['METAL', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const m6 = card('METAL', 6, false, 1);
  s.L[1][1].push(m6);
  const outs = play(s, 0, card('METAL', 0), 0);
  /* METAL 0 の反転対象に選ばれた候補では、盤面から消えている */
  return anyOf(outs, o => !fieldIds(o, 1, 1).includes(m6.i)) || 'METAL 6 が削除される候補が無い';
});

check('METAL 6 は覆われると先に自壊する', () => {
  const s = blank([['METAL', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const m6 = card('METAL', 6, false, 0);
  s.L[0][0].push(m6);
  const outs = play(s, 0, card('METAL', 2), 0);
  return outs.every(o => !fieldIds(o, 0, 0).includes(m6.i) && o.L[0][0].length === 1)
    || `残り=${outs.map(o => o.L[0][0].length).join(',')}`;
});

/* === 合計値の計算ルール === */
check('METAL 0 は同ラインの相手合計値を2下げる', () => {
  const s = blank([['METAL', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.L[1][0].push(card('SPIRIT', 4, false, 1));
  const before = S.simTotal(s, 1, 0);
  s.L[0][0].push(card('METAL', 0, false, 0));
  const after = S.simTotal(s, 1, 0);
  return after === before - 2 || `${before} -> ${after}`;
});

check('DARKNESS 2 は同スタックの裏向きカードを値4にする', () => {
  const s = blank([['DARKNESS', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  const down = card('LIFE', 1, true, 0);
  s.L[0][0].push(down);
  const plain = S.simTotal(s, 0, 0);
  s.L[0][0].push(card('DARKNESS', 2, false, 0));
  const boosted = S.simEffValue(s, 0, 0, down);
  return (plain === 2 && boosted === 4) || `素=${plain} 強化後=${boosted}`;
});

/* === 手札・盤外への作用 === */
check('METAL 1 は相手の次のコンパイルを禁止する', () => {
  const s = blank([['METAL', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.D[0].push(card('LIFE', 2), card('WATER', 2));
  const outs = play(s, 0, card('METAL', 1), 0);
  return outs.every(o => o.skip[1] === true) || 'skip が立っていない';
});

check('WATER 3 は選んだラインの値2カードを全て手札に戻す', () => {
  const s = blank([['WATER', 'LIFE', 'SPIRIT'], ['SPIRIT', 'LIFE', 'WATER']]);
  const d1 = card('LIFE', 1, true, 1), d2 = card('WATER', 4, true, 1);
  s.L[1][1].push(d1, d2);                    /* 裏向き = 値2 */
  const outs = play(s, 0, card('WATER', 3), 0);
  return anyOf(outs, o => o.L[1][1].length === 0 && o.H[1].length === 2)
    || `残数=${outs.map(o => o.L[1][1].length).join(',')}`;
});

check('LIGHT 0 は反転させたカードの値だけドローする', () => {
  const s = blank([['LIGHT', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.L[1][1].push(card('SPIRIT', 4, true, 1));      /* 表にすると値4 */
  for (let k = 0; k < 6; k++) s.D[0].push(card('LIFE', 1));
  const outs = play(s, 0, card('LIGHT', 0), 0);
  return anyOf(outs, o => o.H[0].length === 4) || `手札=${outs.map(o => o.H[0].length).join(',')}`;
});

check('WATER 1 は他の各ラインへ山札から裏向きに置く', () => {
  const s = blank([['WATER', 'LIFE', 'SPIRIT'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.D[0].push(card('LIFE', 2), card('SPIRIT', 3));
  const outs = play(s, 0, card('WATER', 1), 0);
  return outs.every(o => o.L[0][1].length === 1 && o.L[0][2].length === 1 && o.L[0][1][0].d && o.L[0][2][0].d)
    || '他ラインへの配置が不正';
});

check('GRAVITY 6 は相手の山札を相手のこのラインに置かせる', () => {
  const s = blank([['GRAVITY', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.D[1].push(card('SPIRIT', 3, false, 1));
  const outs = play(s, 0, card('GRAVITY', 6), 0);
  return outs.every(o => o.L[1][0].length === 1 && o.L[1][0][0].d === true) || '相手ラインに置かれていない';
});

check('SPEED 0 は追加でもう1枚プレイする', () => {
  const s = blank([['SPEED', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.H[0].push(card('LIFE', 4));
  const outs = play(s, 0, card('SPEED', 0), 0);
  return anyOf(outs, o => countField(o) === 2 && o.H[0].length === 0) || '追加プレイが発生していない';
});

/* === 旧バケツ処理との決定的な違い === */
check('旧実装で同一視されていた DEATH 0 / LIFE 1 / WATER 0 が別々の結果になる', () => {
  const make = () => {
    const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
    s.L[1][1].push(card('SPIRIT', 3, false, 1));
    s.L[1][2].push(card('WATER', 2, true, 1));
    return s;
  };
  const sig = outs => outs.map(o =>
    [0, 1].map(p => [0, 1, 2].map(l => o.L[p][l].map(c => c.p + c.v + (c.d ? 'd' : 'u')).join('.')).join(';')).join('/')
  ).sort().join('|');
  const a = sig(play(make(), 0, card('DEATH', 0), 0));
  const b = sig(play(make(), 0, card('LIFE', 1), 1));
  const c = sig(play(make(), 0, card('WATER', 0), 2));
  return (a !== b && b !== c && a !== c) || '3枚の結果が区別できていない';
});

check('探索が実際に着手を評価して有限値を返す', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.H[0].push(card('DEATH', 4), card('LIFE', 2));
  s.H[1].push(card('SPIRIT', 3, false, 1));
  for (let k = 0; k < 8; k++) { s.D[0].push(card('LIFE', 1)); s.D[1].push(card('SPIRIT', 1, false, 1)); }
  const ctxNode = { nodes: 0, maxNodes: 60000, deadline: Date.now() + 4000, tt: new Map(), hits: 0 };
  const v = S.simNode(s, 0, 3, ctxNode);
  return (Number.isFinite(v) && ctxNode.nodes > 1) || `値=${v} nodes=${ctxNode.nodes}`;
});

check('同じ勝利でも、早く決着する読み筋を高く評価する', () => {
  const s = blank([['METAL', 'LIFE', 'WATER'], ['SPIRIT', 'LIFE', 'WATER']]);
  s.P[0][0].c = true; s.P[0][1].c = true;
  s.L[0][2].push(card('WATER', 6), card('WATER', 4));
  const context = () => ({ nodes: 0, maxNodes: 100, deadline: Date.now() + 1000, tt: new Map(), hits: 0 });
  S.setProfile({ mateDistance: 0 });
  const plain = S.simNode(s, 0, 3, context());
  S.setProfile({ mateDistance: 1e7 });
  const distanceAware = S.simNode(s, 0, 3, context());
  return distanceAware === plain + 3e7 || `従来=${plain} 手数あり=${distanceAware}`;
});

/* === 本編と同じ手番フェイズ === */
check('SPIRIT 1 の開始効果は、手札を捨てる／自身を反転する両方を読む', () => {
  const s = blank([['SPIRIT', 'LIFE', 'WATER'], ['METAL', 'LIFE', 'WATER']]);
  s.L[0][0].push(card('SPIRIT', 1, false, 0));
  s.H[0].push(card('LIFE', 4, false, 0));
  S.setProfile({ phases: true });
  const outs = S.simStartPhase(s, 0);
  const discarded = outs.some(n => n.H[0].length === 0 && !n.L[0][0][0].d);
  const flipped = outs.some(n => n.H[0].length === 1 && n.L[0][0][0].d);
  return discarded && flipped || `分岐数=${outs.length}`;
});

check('DEATH 1 の開始効果は、実行時にドロー・対象削除・自身削除まで解決する', () => {
  const s = blank([['DEATH', 'LIFE', 'WATER'], ['METAL', 'LIFE', 'WATER']]);
  s.L[0][0].push(card('DEATH', 1, false, 0));
  s.L[1][1].push(card('METAL', 4, false, 1));
  s.D[0].push(card('DEATH', 4, false, 0));
  S.setProfile({ phases: true });
  const outs = S.simStartPhase(s, 0);
  return outs.some(n => n.H[0].length === 1 && !n.L[0][0].length && !n.L[1][1].length)
    || `分岐数=${outs.length}`;
});

check('LIGHT 1 を表で出すと、終了フェイズの1ドローまで探索状態へ入る', () => {
  const s = blank([['LIGHT', 'LIFE', 'WATER'], ['METAL', 'SPIRIT', 'FIRE']]);
  const played = card('LIGHT', 1, false, 0), drawn = card('LIGHT', 4, false, 0);
  s.H[0].push(played); s.D[0].push(drawn);
  S.setProfile({ phases: true });
  const outs = S.simResolveAction(s, 0, { t:'play', id:played.i, mode:'up', line:0, key:'light1' });
  return outs.length === 1 && outs[0].H[0].some(c => c.i === drawn.i)
    || `分岐数=${outs.length} 手札=${outs[0]?.H[0].length}`;
});

check('先読み用の強制フェイズ解決は、通常探索が旧設定でも終了効果を反映する', () => {
  const s = blank([['LIGHT', 'LIFE', 'WATER'], ['METAL', 'SPIRIT', 'FIRE']]);
  const played = card('LIGHT', 1, false, 0), drawn = card('LIGHT', 3, false, 0);
  s.H[0].push(played); s.D[0].push(drawn);
  S.setProfile({ phases: false });
  const outs = S.simResolveAction(s, 0, { t:'play', id:played.i, mode:'up', line:0, key:'ponder-light1' }, false, true);
  return outs[0].H[0].some(c => c.i === drawn.i) || '終了ドローが欠落';
});

check('SPEED 3 の終了効果は、自分のカード移動後に自身を反転する', () => {
  const s = blank([['SPEED', 'LIFE', 'WATER'], ['METAL', 'SPIRIT', 'FIRE']]);
  const source = card('SPEED', 3, false, 0), target = card('LIFE', 2, false, 0);
  s.L[0][0].push(source); s.L[0][1].push(target);
  S.setProfile({ phases: true });
  const outs = S.simEndPhase(s, 0);
  return outs.some(n => {
    const src = [0,1,2].flatMap(l => n.L[0][l]).find(c => c.i === source.i);
    const sourceLoc = [0,1,2].find(l => n.L[0][l].some(c => c.i === source.i));
    const targetLoc = [0,1,2].find(l => n.L[0][l].some(c => c.i === target.i));
    return src?.d && (sourceLoc !== 0 || targetLoc !== 1);
  }) || `分岐数=${outs.length}`;
});

check('コンパイルした手番はアクションへ進まず、終了フェイズへ移る印を持つ', () => {
  const s = blank([['WATER', 'LIGHT', 'LIFE'], ['METAL', 'SPIRIT', 'FIRE']]);
  s.L[0][0].push(card('WATER', 6, false, 0), card('WATER', 4, false, 0));
  s.L[0][1].push(card('LIGHT', 1, false, 0));
  const drawn = card('LIGHT', 3, false, 0); s.D[0].push(drawn);
  S.setProfile({ phases: true });
  const compiled = S.simCompile(s, 0);
  const ended = S.simFinishTurn(compiled, 0, true);
  return compiled.didCompile === true
    && ended.some(n => n.H[0].some(c => c.i === drawn.i))
    || `didCompile=${compiled.didCompile} 終了分岐=${ended.length}`;
});

/* === 第2セット === */
check('CLARITY 0 / MIRROR 0 / SMOKE 2 の常時合計値を読む', () => {
  const s = blank([['CLARITY', 'MIRROR', 'SMOKE'], ['CHAOS', 'PEACE', 'ICE']]);
  s.H[0].push(card('TIME', 1), card('WAR', 2));
  s.L[0][0].push(card('CLARITY', 0, false, 0));
  s.L[0][1].push(card('MIRROR', 0, false, 0));
  s.L[1][1].push(card('ICE', 1, false, 1), card('PEACE', 2, true, 1));
  s.L[0][2].push(card('SMOKE', 2, false, 0), card('TIME', 3, true, 0));
  s.L[1][2].push(card('WAR', 3, true, 1));
  return S.simTotal(s, 0, 0) === 2 && S.simTotal(s, 0, 1) === 2 && S.simTotal(s, 0, 2) === 6
    || `合計=${[0,1,2].map(l => S.simTotal(s,0,l)).join(',')}`;
});

check('FEAR 1 は2枚引き、相手の手札を1枚減らす', () => {
  const s = blank([['FEAR', 'TIME', 'WAR'], ['CHAOS', 'PEACE', 'ICE']]);
  s.D[0].push(card('FEAR', 2), card('TIME', 2));
  s.H[1].push(card('CHAOS', 1, false, 1), card('PEACE', 2, false, 1), card('ICE', 3, false, 1));
  const outs = play(s, 0, card('FEAR', 1), 0);
  return outs.every(o => o.H[0].length === 2 && o.H[1].length === 2)
    || `手札=${outs.map(o => `${o.H[0].length}/${o.H[1].length}`).join(',')}`;
});

check('TIME 1 は反転対象がなくても自分のデッキをすべて捨てる', () => {
  const s = blank([['TIME', 'FEAR', 'WAR'], ['CHAOS', 'PEACE', 'ICE']]);
  s.D[0].push(card('TIME', 2), card('WAR', 3));
  const outs = play(s, 0, card('TIME', 1), 0);
  return outs.every(o => o.D[0].length === 0 && o.X[0].length === 2)
    || `deck/trash=${outs.map(o => `${o.D[0].length}/${o.X[0].length}`).join(',')}`;
});

check('ICE 4 は一番上で表向きなら反転しない', () => {
  const s = blank([['WAR', 'TIME', 'FEAR'], ['ICE', 'PEACE', 'CHAOS']]);
  const ice = card('ICE', 4, false, 1);s.L[1][0].push(ice);
  const outs = S.simEffect(s, 0, card('WAR', 2), 0, false, false);
  return outs.every(o => o.L[1][0][0]?.d === false) || 'ICE 4 が反転した';
});

check('ICE 1 の手札税は一番上にある間だけ発動する', () => {
  const make = covered => {
    const s = blank([['TIME', 'FEAR', 'WAR'], ['ICE', 'PEACE', 'CHAOS']]);
    s.L[1][0].push(card('ICE', 1, false, 1));if(covered)s.L[1][0].push(card('PEACE', 2, false, 1));
    const played=card('TIME', 0),spare=card('WAR', 4);s.H[0].push(played,spare);
    return S.simApply(s,0,{t:'play',id:played.i,mode:'up',line:0,key:'ice-tax'})[0].H[0].length;
  };
  return make(false) === 0 && make(true) === 1 || `手札=${make(false)}/${make(true)}`;
});

check('WAR 2 は別ラインのコンパイル後、相手の手札を全て捨てさせる', () => {
  const s = blank([['TIME', 'FEAR', 'PEACE'], ['WAR', 'ICE', 'CHAOS']]);
  s.L[0][0].push(card('TIME', 5), card('TIME', 5));
  s.L[1][1].push(card('WAR', 2, false, 1));
  s.H[0].push(card('FEAR', 1), card('PEACE', 2));
  const out = S.simCompile(s,0);
  return out.didCompile && out.H[0].length === 0 || `compile=${out.didCompile} hand=${out.H[0].length}`;
});

check('覆われた WAR 2 はコンパイル後の手札破壊を発動しない', () => {
  const s = blank([['TIME', 'FEAR', 'PEACE'], ['WAR', 'ICE', 'CHAOS']]);
  s.L[0][0].push(card('TIME', 5), card('TIME', 5));
  s.L[1][1].push(card('WAR', 2, false, 1), card('ICE', 1, false, 1));
  s.H[0].push(card('FEAR', 1), card('PEACE', 2));
  const out = S.simCompile(s,0);
  return out.didCompile && out.H[0].length === 2 || `compile=${out.didCompile} hand=${out.H[0].length}`;
});

check('CORRUPTION 0 は相手側配置と所有権移動を探索できる', () => {
  const s = blank([['CORRUPTION', 'TIME', 'WAR'], ['CHAOS', 'PEACE', 'ICE']]);
  const corruption=card('CORRUPTION',0,false,0);s.H[0].push(corruption);
  const action=S.simActions(s,0).find(a=>a.id===corruption.i&&a.holder===1&&a.mode==='up');
  if(!action)return '相手側アクションなし';
  const out=S.simApply(s,0,action)[0],placed=out.L[1][action.line].find(c=>c.i===corruption.i);
  return placed?.o===1 || `owner=${placed?.o}`;
});

check('CHAOS 4 の終了効果は手札を同じ枚数だけ入れ替える', () => {
  const s = blank([['CHAOS', 'TIME', 'WAR'], ['FEAR', 'PEACE', 'ICE']]);
  s.L[0][0].push(card('CHAOS',4,false,0));
  s.H[0].push(card('TIME',1),card('WAR',2));s.D[0].push(card('CHAOS',1),card('CHAOS',2));
  S.setProfile({phases:true});const outs=S.simEndPhase(s,0);
  return outs.every(o=>o.H[0].length===2&&o.X[0].length===2) || `分岐=${outs.length}`;
});

console.log(`\n合計 ${pass + fail} 件 / 成功 ${pass} / 失敗 ${fail}\n`);
process.exit(fail ? 1 : 0);
