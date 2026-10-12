import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { S, set, setUI, openSheet, closeSheet, toast } from './store.js';
import { Btn, Seg, Seal, Coach, Countdown, Empty, colorClass, useNow } from './common.jsx';
import { Icon, Emblem } from './icons.jsx';
import { TeamBoardView, SurveyMap } from './boards.jsx';
import { act, predict, forceReveal, isLocalHost } from './session.js';
import { audio } from '../audio/audio.js';
import { DIRS, DIR_KEYS, CHARACTER_MAP, STAMPS, MARK_KINDS, AUTO_TURN_MS, ENCOUNTER_MS } from '../core/constants.js';
import { buildKnowledge, boardConflicts, layerCandidates } from '../core/solver.js';

const k = (x, y) => `${x},${y}`;
export const charOf = (e) => (e?.character && e.character !== 'hidden' ? CHARACTER_MAP[e.character] : null);

// ───────── team strip ─────────
export function TeamStrip({ snap, onPick, focus }) {
  const ex = Object.values(snap.explorers);
  return (
    <div class="teamstrip" role="list">
      {ex.map(e => {
        const c = charOf(e);
        const hand = snap.turnRequests?.[e.id];
        // one player steering several explorers: name the explorer, not the (repeated) player
        const multi = ex.filter(o => o.ownerName === e.ownerName && o.ownerIsYou === e.ownerIsYou).length > 1;
        const name = multi ? `${e.label}の探検家` : e.ownerName;
        return (
          <button type="button" role="listitem" title={multi && !e.ownerIsYou ? `${name}（${e.ownerName}）` : undefined} class={`tmember ${colorClass(e.colorKey)} ${e.active ? 'active' : ''} ${e.done ? 'done' : ''} ${focus === e.id ? 'focus' : ''}`} onClick={() => onPick?.(e.id)}>
            <Seal colorKey={e.colorKey} label={e.label} />
            <span class="tm-text">
              <b class="ellipsis">{name}{e.ownerIsYou && <i class="you">あなた</i>}</b>
              <span class="tm-status">
                {c && <span class={`tm-char ${e.fatigue ? 'tired' : ''}`} title={e.fatigue ? `${c.name}（疲労中）` : c.name}><Emblem char={c.key} size={14} />{c.name}</span>}
                {e.active ? <span class="st-act">行動中</span> : e.done ? <span class="st-done">済</span> : hand ? <span class="st-hand">✋</span> : null}
                {e.alertLocked && <span class="st-lock" title="警戒不可"><Icon name="lock" size={11} /></span>}
                {e.blocked && e.active && <span class="st-wall" title="壁に阻まれた"><Icon name="wall" size={11} /></span>}
                {!e.ownerConnected && <span class="st-off">切断</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ───────── turn picker (nobody active) ─────────
export function TurnPicker({ snap }) {
  const mine = snap.you.ownedExplorerIds.filter(id => !snap.explorers[id].done);
  const others = Object.values(snap.explorers).filter(e => !e.done && !e.ownerIsYou);
  return (
    <section class="panel tight stagepanel">
      <div class="panel-title"><h3>次は誰が動く？</h3><span class="aside">順番は相談して決めます</span></div>
      <Coach id="turnpick">順番は自由。先に動いた人の情報を、後の人が使うのがコツ。</Coach>
      <div class="col gap-s">
        {mine.map(id => {
          const e = snap.explorers[id];
          return <Btn kind="primary" block onClick={() => act({ type: 'claimTurn', eid: id })}><Seal colorKey={e.colorKey} label={e.label} size="s" />{e.label}の探検家で行動する</Btn>;
        })}
        {others.length > 0 && <p class="tiny muted">{others.map(e => `${e.ownerName}（${e.label}）`).join('・')} もまだ行動していません。</p>}
        {!mine.length && <div class="waiting small"><span class="spinner" />仲間が行動を始めるのを待っています</div>}
        {snap.turnClaimDeadline && <Countdown deadline={snap.turnClaimDeadline} total={AUTO_TURN_MS} />}
      </div>
    </section>
  );
}

// ───────── action tray (my explorer is active) ─────────
export function ActionTray({ snap, eid }) {
  const e = snap.explorers[eid];
  const map = snap.maps[eid];
  const c = charOf(e);
  const [nextOpen, setNextOpen] = useState(false);
  const noTime = snap.time.total <= 0;
  const waiting = !!snap.waitingOnRuins;
  const rest = Object.values(snap.explorers).filter(x => !x.done && x.id !== eid);
  const step = (dir) => {
    const t = { x: map.localPos.x + DIRS[dir].dx, y: map.localPos.y + DIRS[dir].dy };
    const v = map.discovered[k(t.x, t.y)];
    if (v === 'wall') return;
    if (v === 'open' || v === 'start') { audio.play('step'); act({ type: 'move', eid, dir }); }
    else { audio.play('tap'); act({ type: 'explore', eid, dir }); }
  };
  const mode = (dir) => {
    const t = { x: map.localPos.x + DIRS[dir].dx, y: map.localPos.y + DIRS[dir].dy };
    const v = map.discovered[k(t.x, t.y)];
    if (v === 'wall') return 'wall';
    if (v === 'open' || v === 'start') return 'move';
    return noTime ? 'none' : 'explore';
  };
  const dirBtn = (d) => {
    const m = mode(d);
    const disabled = waiting || e.blocked || m === 'wall' || m === 'none';
    return (
      <button type="button" class={`dpad-btn d-${d} m-${m}`} disabled={disabled} onClick={() => step(d)} aria-label={`${DIRS[d].label}：${m === 'explore' ? '探索' : m === 'move' ? '移動' : '進めない'}`}>
        <Icon name={`arrow${d}`} size={18} />
        <span class="dl">{DIRS[d].label}</span>
        <span class="dm">{m === 'explore' ? '探索 ⌛1' : m === 'move' ? '移動' : m === 'wall' ? '壁' : '—'}</span>
      </button>
    );
  };
  return (
    <section class="panel tight stagepanel tray">
      <div class="tray-status">
        {e.blocked && <span class="chip ward"><Icon name="wall" size={13} />壁に阻まれた{c && !e.fatigue ? '・能力は使える' : ''}</span>}
        {noTime && <span class="chip ward">迷宮マスがないため探索できない</span>}
        {waiting && <span class="chip brass"><span class="spinner s" />遺跡役の応答待ち</span>}
      </div>
      <div class="tray-grid">
        <div class="dpad">
          {dirBtn('N')}{dirBtn('W')}
          <span class="dpad-mid"><Seal colorKey={e.colorKey} label={e.label} size="s" /></span>
          {dirBtn('E')}{dirBtn('S')}
        </div>
        <div class="tray-side">
          <div class="tray-meta"><span>探索 <b class="num">{e.turn?.explores || 0}</b></span><span>移動 <b class="num">{e.turn?.moves || 0}</b></span></div>
          {c ? (
            <button type="button" class={`ability-btn ${e.fatigue ? 'tired' : ''}`} disabled={waiting || e.fatigue} onClick={() => { audio.play('select'); openSheet({ kind: 'ability', eid }); }}>
              <Emblem char={c.key} size={30} />
              <span><b>{c.name}</b><small>{e.fatigue ? '疲労中' : '能力を使う'}</small></span>
            </button>
          ) : null}
          {!nextOpen ? (
            <Btn kind={e.blocked ? 'primary' : ''} block disabled={waiting} onClick={() => (rest.length > 1 ? setNextOpen(true) : act({ type: 'endTurn', eid }))}>手番を終える</Btn>
          ) : (
            <div class="nextpick">
              <span class="tiny muted">次の手番</span>
              {rest.map(x => <Btn size="small" block onClick={() => { setNextOpen(false); act({ type: 'endTurn', eid, next: x.id }); }}><Seal colorKey={x.colorKey} label={x.label} size="s" />{x.ownerIsYou ? `${x.label}（自分）` : x.ownerName}{snap.turnRequests?.[x.id] ? ' ✋' : ''}</Btn>)}
              <Btn size="small" block kind="quiet" onClick={() => { setNextOpen(false); act({ type: 'endTurn', eid }); }}>決めずに終える</Btn>
              <Btn size="tiny" kind="ghost" onClick={() => setNextOpen(false)}>戻る</Btn>
            </div>
          )}
        </div>
      </div>
      <Coach id="explore-first" when={!e.blocked}>「探索」は時間−1。部屋なら進み、壁なら手番中はもう動けません。判明済みの部屋への移動は無料です。地図のマスを直接タップしてもOK。</Coach>
    </section>
  );
}

// ───────── waiting while a teammate acts ─────────
export function TeammateActing({ snap }) {
  const a = snap.explorers[snap.activeExplorerId];
  const mine = snap.you.ownedExplorerIds.filter(id => !snap.explorers[id].done);
  return (
    <section class="panel tight stagepanel">
      <div class="row"><Seal colorKey={a.colorKey} label={a.label} size="l" /><div class="grow"><b class="head">{a.ownerName} が行動中</b><div class="tiny muted">{a.label}の探検家 ・ 探索 {a.turn?.explores || 0} ・ 移動 {a.turn?.moves || 0}{snap.waitingOnRuins ? ' ・ 遺跡役の応答待ち' : ''}</div></div></div>
      <div class="row wrap" style="margin-top:10px">
        <Btn size="small" onClick={() => setUI({ focusEid: a.id, tab: 'map' })}><Icon name="map" size={18} />この人の地図を見る</Btn>
        {mine.map(id => {
          const wants = !!snap.turnRequests?.[id];
          return <Btn size="small" kind={wants ? 'primary' : ''} onClick={() => act({ type: 'requestTurn', eid: id, wants: !wants })}><Icon name="hand" size={18} />{wants ? `${snap.explorers[id].label}：希望中` : `${snap.explorers[id].label}で次に動きたい`}</Btn>;
        })}
      </div>
    </section>
  );
}

// ───────── escape vote ─────────
export function EscapeVote({ snap, teamHint }) {
  const final = snap.stage === 'finalEscape';
  const me = snap.escapeVotes.find(v => v.isYou);
  const isExplorer = snap.you.role === 'explorer';
  const goCount = snap.escapeVotes.filter(v => v.vote === 'go').length;
  return (
    <section class={`panel stagepanel escape ${final ? 'final' : ''}`}>
      <div class="panel-title"><h3>{final ? '最後の脱出' : '脱出に挑戦する？'}</h3><span class="aside">全員の同意で決定</span></div>
      <p class="small dim">{final ? '迷宮マスは尽きました。全員が同じ部屋にいれば勝利です。' : '全員が同じ部屋にいるなら脱出成功。1人でも違えば失敗し、遺跡役の勝利です。脱出はゲーム中1回だけ。'}</p>
      {teamHint && <div class={`hint ${teamHint.ok ? 'good' : 'warn'}`}><Icon name={teamHint.ok ? 'check' : 'warn'} size={16} />{teamHint.text}</div>}
      <div class="votes">
        {snap.escapeVotes.map(v => (
          <span class={`vote ${v.vote || 'none'}`}><Icon name={v.vote === 'go' ? 'exit' : v.vote === 'wait' ? 'hourglass' : 'question'} size={14} />{v.name}{v.isYou ? '（あなた）' : ''}：{v.vote === 'go' ? '脱出する' : v.vote === 'wait' ? 'まだ' : v.connected ? '考え中' : '切断中'}</span>
        ))}
      </div>
      {isExplorer && (
        <div class="row" style="margin-top:12px">
          {!final && <Btn class="grow" kind={me?.vote === 'wait' ? 'primary' : ''} onClick={() => act({ type: 'vote', vote: 'wait' })}>まだ脱出しない</Btn>}
          <Btn class="grow" kind={me?.vote === 'go' ? 'primary' : final ? 'primary' : 'danger'} onClick={() => (final || me?.vote === 'go' ? act({ type: 'vote', vote: 'go' }) : openSheet({ kind: 'confirmEscape' }))}>
            <Icon name="exit" size={18} />{final ? '最後の脱出に挑む' : '脱出する'}
          </Btn>
        </div>
      )}
      {me?.vote && !final && <p class="tiny muted" style="margin-top:6px">全員が投票すると決まります（{goCount}/{snap.escapeVotes.length} が脱出に賛成）。投票は変更できます。</p>}
      {!isExplorer && <div class="waiting small"><span class="spinner" />探検家が相談しています</div>}
    </section>
  );
}

export function ConfirmEscapeSheet() {
  return (
    <div class="col">
      <p>本当に脱出に賛成しますか？ 全員が賛成すると、すぐに判定されます。</p>
      <div class="hint warn"><Icon name="warn" size={16} />1人でも違う部屋にいると、その時点で遺跡役の勝利です。</div>
      <div class="row">
        <Btn class="grow" onClick={closeSheet}>やめる</Btn>
        <Btn class="grow" kind="primary" onClick={() => { closeSheet(); act({ type: 'vote', vote: 'go' }); }}><Icon name="exit" size={18} />脱出に賛成</Btn>
      </div>
    </div>
  );
}

// ───────── prediction ─────────
export function PredictionPanel({ snap }) {
  const mine = snap.you.ownedExplorerIds;
  const submitted = Object.values(snap.explorers).filter(e => e.predictionSubmitted).length;
  return (
    <section class="panel stagepanel">
      <div class="panel-title"><h3>行動予測</h3><span class="aside">{submitted}/{Object.keys(snap.explorers).length} 人が伏せた</span></div>
      <p class="small dim">遺跡役に攻撃されると思うなら「警戒」、されないと思うなら「休憩」。警戒して攻撃されなかった場合、次は警戒できません。</p>
      <Coach id="predict">休憩中に攻撃されると時間−3。守護神の超攻撃は警戒でも防げません。</Coach>
      <div class="col">
        {mine.map(eid => {
          const e = snap.explorers[eid];
          return (
            <div class={`predict-row ${colorClass(e.colorKey)}`}>
              <Seal colorKey={e.colorKey} label={e.label} size="l" />
              {e.predictionSubmitted
                ? <div class="grow predicted"><span class="pcard small faced"><span class="pcard-inner"><span class="pcard-back"><span /></span></span></span><span class="small">カードを伏せました</span></div>
                : <div class="grow pchoices">
                  <button type="button" class="pchoice rest" onClick={() => { audio.play('flip'); predict(eid, 'rest'); }}><Icon name="moon" size={26} /><b>休憩</b><small>攻撃されたら −3</small></button>
                  <button type="button" class={`pchoice alert ${e.alertLocked ? 'locked' : ''}`} disabled={e.alertLocked} onClick={() => { audio.play('flip'); predict(eid, 'alert'); }}><Icon name={e.alertLocked ? 'lock' : 'eye'} size={26} /><b>警戒</b><small>{e.alertLocked ? '前回空振りのため不可' : '通常攻撃を防ぐ'}</small></button>
                </div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────── ruins-turn watch (explorer side) ─────────
export function RuinsWatch({ snap }) {
  const used = snap.time.movesUsed || 0;
  const pa = snap.pendingAttack ? snap.explorers[snap.pendingAttack.explorerId] : null;
  return (
    <section class="panel stagepanel ruinswatch">
      <div class="row"><span class="watch-eye"><Icon name="eye" size={26} /></span><div class="grow"><b class="head">遺跡役の手番</b><div class="small dim">霧の奥で衛兵が動いています。どこへ向かったかは分かりません。</div></div></div>
      <div class="moves">{Array.from({ length: Math.max(used, snap.time.baseMoveTokens) }).map((_, i) => <span class={`mtoken ${i < used ? 'used' : ''}`} />)}<span class="tiny muted">移動 {used} 回</span></div>
      {pa && <div class="hint ward"><Icon name="sword" size={16} />{pa.label}の探検家が攻撃されています。伏せたカードを公開中…</div>}
    </section>
  );
}

// ───────── ability sheet ─────────
export function AbilitySheet({ snap, eid }) {
  const e = snap.explorers[eid];
  const [source, setSource] = useState(null);
  if (!e) return null;
  const c = charOf(e);
  if (!c) return <Empty>キャラクターが設定されていません。</Empty>;
  if (e.character === 'apprentice') {
    const allies = Object.values(snap.explorers).filter(x => x.id !== eid && x.character && x.character !== 'apprentice' && x.character !== 'hidden');
    const src = allies.find(a => a.id === source);
    return (
      <div class="col">
        <AbilityHead c={c} />
        <p class="small dim">複製する仲間の能力を選んでください（仲間が疲労中でも使えます）。</p>
        <div class="row wrap">{allies.map(a => <button type="button" class={`clue-pick ${source === a.id ? 'on' : ''}`} onClick={() => { audio.play('tap'); setSource(a.id); }}><Seal colorKey={a.colorKey} label={a.label} size="s" /><Emblem char={a.character} size={18} />{CHARACTER_MAP[a.character].name}</button>)}</div>
        {src && <AbilityControls snap={snap} eid={eid} charKey={src.character} wrap={(data) => ({ sourceExplorerId: src.id, copy: data })} />}
      </div>
    );
  }
  return <div class="col"><AbilityHead c={c} /><AbilityControls snap={snap} eid={eid} charKey={e.character} wrap={(d) => d} /></div>;
}

function AbilityHead({ c }) {
  return <div class="abhead"><Emblem char={c.key} size={46} /><div><b class="head">{c.name}</b><p class="small dim">{c.desc}</p></div></div>;
}

function AbilityControls({ snap, eid, charKey, wrap }) {
  const map = snap.maps[eid];
  const [dirs, setDirs] = useState([]);
  const use = async (data) => { audio.play('ability'); closeSheet(); await act({ type: 'ability', eid, data: wrap(data) }); };
  const unknownDirs = DIR_KEYS.filter(d => !map.discovered[k(map.localPos.x + DIRS[d].dx, map.localPos.y + DIRS[d].dy)]);
  const wallDirs = DIR_KEYS.filter(d => map.discovered[k(map.localPos.x + DIRS[d].dx, map.localPos.y + DIRS[d].dy)] === 'wall');
  const others = Object.values(snap.explorers).filter(x => x.id !== eid);
  switch (charKey) {
    case 'guide':
      return <div class="col gap-s"><span class="small">方角を知りたい仲間</span><div class="row wrap">{others.map(o => <Btn onClick={() => use({ targetExplorerId: o.id })}><Seal colorKey={o.colorKey} label={o.label} size="s" />{o.label}の探検家</Btn>)}</div></div>;
    case 'geographer': {
      const can = unknownDirs.length >= 2 && snap.time.total >= 2;
      return (
        <div class="col gap-s">
          <span class="small">調べる2方向（隣接する未確認マス）</span>
          <div class="dirpick">{DIR_KEYS.map(d => <button type="button" class={`dirbtn ${dirs.includes(d) ? 'on' : ''}`} disabled={!unknownDirs.includes(d)} onClick={() => { audio.play('tap'); setDirs(dirs.includes(d) ? dirs.filter(x => x !== d) : [...dirs, d].slice(-2)); }}><Icon name={`arrow${d}`} size={18} />{DIRS[d].label}</button>)}</div>
          {!can && <div class="hint warn"><Icon name="warn" size={16} />{unknownDirs.length < 2 ? '隣接する未確認マスが2か所以上ないと使えません。' : '迷宮マスが2枚以上必要です。'}</div>}
          <Btn kind="primary" disabled={!can || dirs.length !== 2} onClick={() => use({ dirs })}>2マスを調べる <span class="cost">⌛2</span></Btn>
        </div>
      );
    }
    case 'archaeologist':
      return (
        <div class="col gap-s">
          <span class="small">鑑定する隣の壁</span>
          <div class="dirpick">{DIR_KEYS.map(d => <button type="button" class="dirbtn" disabled={!wallDirs.includes(d) || map.wallKinds?.[k(map.localPos.x + DIRS[d].dx, map.localPos.y + DIRS[d].dy)]} onClick={() => use({ dir: d })}><Icon name={`arrow${d}`} size={18} />{DIRS[d].label}</button>)}</div>
          {!wallDirs.length && <div class="hint warn"><Icon name="warn" size={16} />隣接する判明済みの壁がありません。先に壁を見つけましょう。</div>}
        </div>
      );
    case 'doctor': {
      const tired = others.filter(o => o.fatigue);
      return <div class="col gap-s"><span class="small">疲労を回復する仲間</span><div class="row wrap">{tired.map(o => <Btn onClick={() => use({ targetExplorerId: o.id })}><Seal colorKey={o.colorKey} label={o.label} size="s" />{o.label}（{charOf(o)?.name || '?'}）</Btn>)}</div>{!tired.length && <div class="hint warn"><Icon name="warn" size={16} />疲労している仲間がいません。</div>}</div>;
    }
    case 'monk':
      return <div class="col gap-s"><span class="small">内壁を数える方向</span><div class="dirpick">{DIR_KEYS.map(d => <button type="button" class="dirbtn" onClick={() => use({ dir: d })}><Icon name={`arrow${d}`} size={18} />{DIRS[d].label}</button>)}</div></div>;
    case 'mercenary':
      return <Btn kind="primary" onClick={() => use({})}><Emblem char="mercenary" size={20} />衛兵を妨害する</Btn>;
    default: return null;
  }
}

// ───────── team board panel ─────────
export function TeamBoardPanel({ snap, readonly }) {
  const ui = S().ui;
  const tb = snap.teamBoard;
  const know = useMemo(() => buildKnowledge(snap), [snap.revision]);
  if (!tb) return <Empty icon="lock">探検家の作戦盤は非公開です。</Empty>;
  const layers = Object.fromEntries(Object.entries(tb.layers || {}).map(([id, L]) => [id, { x: L.x, y: L.y }]));
  const conf = boardConflicts(know, layers);
  const ids = Object.keys(snap.explorers);
  const sel = ui.tbSel && ids.includes(ui.tbSel) ? ui.tbSel : (snap.you.ownedExplorerIds[0] || ids[0]);
  const tool = readonly ? 'move' : (ui.tbTool || 'move');
  const assist = snap.options.assist;
  const showIssues = assist !== 'off';
  const cands = assist === 'strong' && sel ? layerCandidates(know, layers, sel) : [];
  const move = (eid, x, y) => { audio.play('tap'); act({ type: 'tbMove', eid, x, y }, { quiet: true }); };
  const nudge = (dx, dy) => { const L = layers[sel]; if (L) move(sel, L.x + dx, L.y + dy); };
  const place = (eid) => {
    const m = snap.maps[eid];
    move(eid, 3 - m.localPos.x, 3 - m.localPos.y);
    setUI({ tbSel: eid });
  };
  const allPlaced = ids.every(id => layers[id]);
  const issueText = (is) => ({ clash: '部屋と壁が重なっています', openOnRing: '部屋が外壁の位置にあります', outerInside: '外壁が迷宮の内側にあります', innerOnRing: '内壁が外壁の位置にあります', sameStart: '開始地点が同じマスです', adjStart: '開始地点どうしが隣り合っています', guide: 'ガイドの方角と合いません', monk: '破戒僧の数と合いません' }[is.type] || '矛盾');
  const uniq = [...new Set(conf.issues.map(issueText))];
  const tools = [
    { id: 'move', icon: 'move', label: '動かす' },
    { id: 'meet', sym: '◎', label: '集合' },
    { id: 'danger', sym: '!', label: '注意' },
    { id: 'question', sym: '?', label: '確認' },
    { id: 'star', sym: '★', label: '目印' },
  ];
  return (
    <div class="col teamboard">
      <section class="panel tight">
        <div class="panel-title"><h3>作戦盤</h3><span class="aside">{readonly ? '閲覧のみ' : 'チーム全員で共有・リアルタイム'}</span></div>
        <p class="small dim">それぞれの地図を透明シートのように重ねて、全員の位置関係を推理します。外周1マスは外壁です。</p>
        <Coach id="teamboard" when={!readonly}>地図をドラッグして重ねよう。部屋と壁が重なると×。◎を置くと全員の地図に集合地点が出ます。</Coach>
      </section>
      {!readonly && ids.some(id => !tb.layers?.[id]) && (
        <Btn size="small" kind="primary" onClick={() => {
          const free = ids.filter(id => !tb.layers?.[id]);
          free.forEach((id, i) => { const m = snap.maps[id]; const spots = [[2, 2], [4, 4], [4, 2], [2, 4], [3, 3]]; const [sx, sy] = spots[(Object.keys(tb.layers || {}).length + i) % spots.length]; act({ type: 'tbMove', eid: id, x: sx - m.localPos.x, y: sy - m.localPos.y }, { quiet: true }); });
          setUI({ tbSel: snap.you.ownedExplorerIds[0] || ids[0] });
        }}><Icon name="layers" size={16} />まだ置いていない地図を並べる</Btn>
      )}
      <div class="layerchips">
        {ids.map(id => {
          const e = snap.explorers[id], L = tb.layers?.[id];
          const cc = assist === 'strong' ? layerCandidates(know, layers, id).length : null;
          return (
            <button type="button" class={`layerchip ${colorClass(e.colorKey)} ${sel === id ? 'on' : ''} ${L ? '' : 'unplaced'}`} onClick={() => { audio.play('tap'); if (!L && !readonly) place(id); else setUI({ tbSel: id }); }}>
              <Seal colorKey={e.colorKey} label={e.label} size="s" />
              <span class="grow"><b>{e.label}の地図</b><small>{L ? `${L.by}が配置` : readonly ? '未配置' : 'タップで配置'}{cc != null && L ? `・候補${cc}` : ''}</small></span>
            </button>
          );
        })}
      </div>
      <TeamBoardView explorers={snap.explorers} maps={snap.maps} layers={tb.layers || {}} marks={tb.marks || []} issues={showIssues ? conf.issues : []} tool={tool} selected={sel}
        onSelect={(id) => setUI({ tbSel: id })} onDrop={(id, x, y) => move(id, x, y)} readonly={readonly} candidates={cands}
        onMark={(x, y, kind) => { audio.play('ping'); act({ type: 'tbMark', x, y, kind }, { quiet: true }); }} />
      <div class={`tb-status ${conf.placed < 2 ? '' : conf.ok ? 'good' : 'bad'}`}>
        {conf.placed < 2 ? <><Icon name="info" size={16} />2つ以上の地図を置くと、矛盾をチェックします</>
          : !showIssues ? <><Icon name="info" size={16} />推理アシストはオフです</>
          : conf.ok ? <><Icon name="check" size={16} />{allPlaced ? '全員の地図が矛盾なく重なっています' : '置いた地図に矛盾はありません'}</>
          : <><Icon name="warn" size={16} />{uniq.join('／')}</>}
      </div>
      {!readonly && (
        <section class="panel tight">
          <div class="toolrow">{tools.map(t => <button type="button" class={`tool ${tool === t.id ? 'on' : ''}`} onClick={() => { audio.play('tap'); setUI({ tbTool: t.id }); }}>{t.icon ? <Icon name={t.icon} size={18} /> : <span class="tool-sym">{t.sym}</span>}<span>{t.label}</span></button>)}</div>
          {tool === 'move' && sel && layers[sel] && (
            <div class="row wrap" style="margin-top:10px">
              <span class="small dim">{snap.explorers[sel].label}の地図を1マスずつ</span>
              <div class="nudge">
                <button type="button" class="btn small iconbtn" aria-label="上へ" onClick={() => nudge(0, -1)}><Icon name="arrowN" size={18} /></button>
                <button type="button" class="btn small iconbtn" aria-label="左へ" onClick={() => nudge(-1, 0)}><Icon name="arrowW" size={18} /></button>
                <button type="button" class="btn small iconbtn" aria-label="右へ" onClick={() => nudge(1, 0)}><Icon name="arrowE" size={18} /></button>
                <button type="button" class="btn small iconbtn" aria-label="下へ" onClick={() => nudge(0, 1)}><Icon name="arrowS" size={18} /></button>
              </div>
              <Btn size="small" kind="ghost" onClick={() => move(sel, null, null)}>外す</Btn>
            </div>
          )}
          {tool !== 'move' && <p class="tiny muted" style="margin-top:8px">マスをタップして「{MARK_KINDS[tool]?.label}」を置く／同じ印をもう一度タップで消す。</p>}
          {(tb.marks || []).length > 0 && <Btn size="tiny" kind="ghost" onClick={() => act({ type: 'tbClear' })}>目印をすべて消す</Btn>}
        </section>
      )}
    </div>
  );
}

// ───────── intel feed ─────────
export function IntelFeed({ snap }) {
  const items = [...(snap.intel || [])].reverse();
  const L = (eid) => snap.explorers[eid]?.label || '?';
  const C = (eid) => snap.explorers[eid]?.colorKey;
  const render = (it) => {
    switch (it.kind) {
      case 'clue': return { icon: 'compass', tone: 'brass', title: '最初の手掛かり', text: `石室の衛兵から${L(it.target)}の探検家まで、最短 ${it.distance} マス`, eid: it.target };
      case 'encounter': return { icon: 'warn', tone: 'ward', title: '遭遇', text: `${L(it.target)}の探検家が敵とすれ違った（その時の位置に印）`, eid: it.target };
      case 'attack': return { icon: it.type === 'super' ? 'crown' : 'sword', tone: it.result === 'hit' ? 'ward' : 'good', title: it.type === 'super' ? '守護神の超攻撃' : '衛兵の攻撃', text: `${L(it.target)}の探検家：${it.result === 'hit' ? '命中（時間−3）' : '警戒で防いだ'}`, eid: it.target };
      case 'predict': {
        const parts = Object.entries(it.results || {}).map(([eid, r]) => `${L(eid)} ${r.card === 'rest' ? '休憩' : r.card === 'alert' ? '警戒' : '?'}${r.attacked ? '（攻撃あり）' : r.card === 'alert' ? '（空振り→警戒不可）' : ''}`);
        return { icon: 'eye', tone: 'jade', title: '予測カード', text: parts.join('　') };
      }
      case 'ability': {
        const who = `${L(it.actor)}${it.via ? '（見習い）' : ''}`;
        let text = '';
        if (it.char === 'geographer') text = it.results.map(r => `${DIRS[r.dir].label}：${r.cell === 'open' ? '部屋' : '壁'}`).join('　');
        else if (it.char === 'archaeologist') text = `${DIRS[it.dir].label}の壁は${it.wall === 'outer' ? '外壁' : '内壁'}`;
        else if (it.char === 'doctor') text = `${L(it.target)}の疲労を回復`;
        else if (it.char === 'monk') text = `${DIRS[it.dir].label}方向の内壁 ${it.count} 個`;
        else if (it.char === 'guide') text = `${L(it.target)}は${DIRS[it.dir].label}の方角`;
        else if (it.char === 'mercenary') text = `動けなくなった衛兵 ${it.count} 体`;
        return { icon: 'spark', tone: 'brass', title: `${who}・${CHARACTER_MAP[it.char]?.name}`, text, eid: it.actor, char: it.char };
      }
      default: return null;
    }
  };
  return (
    <div class="col">
      <section class="panel tight">
        <div class="panel-title"><h3>手掛かりの記録</h3><span class="aside">新しい順</span></div>
        {!items.length && <Empty icon="scroll">まだ手掛かりはありません。能力の結果や攻撃の記録がここに残ります。</Empty>}
        <div class="intel">
          {items.map(it => {
            const r = render(it); if (!r) return null;
            return (
              <div class={`intel-item tone-${r.tone} ${colorClass(C(r.eid))}`}>
                <span class="intel-icon">{r.char ? <Emblem char={r.char} size={20} /> : <Icon name={r.icon} size={18} />}</span>
                <div class="grow"><div class="intel-title"><b>{r.title}</b><span class="tiny muted">R{it.round}・P{it.phase}</span></div><div class="small">{r.text}</div></div>
              </div>
            );
          })}
        </div>
      </section>
      <LogPanel snap={snap} />
    </div>
  );
}

export function LogPanel({ snap }) {
  const lines = [...(snap.log || [])].reverse().filter(l => l.kind !== 'move');
  return (
    <section class="panel tight">
      <div class="panel-title"><h3>進行ログ</h3></div>
      <div class="log">{lines.map(l => <div class={`logline k-${l.kind}`}><span class="tiny muted num">R{l.r}</span>{l.text}</div>)}</div>
    </section>
  );
}

// ───────── chat ─────────
export function ChatPanel({ snap }) {
  const draft = S().ui.chatDraft || '';
  const listRef = useRef(null);
  const msgs = snap.chat || [];
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);
  useEffect(() => { set({ unread: 0 }); }, [msgs.length]);
  const send = (text, stamp = false) => { const t = String(text || '').trim(); if (!t) return; audio.play('chat'); act({ type: 'chat', text: t, stamp }); if (!stamp) setUI({ chatDraft: '' }); };
  const canStamp = snap.you.role !== 'spectator';
  return (
    <section class="panel tight chat">
      <div class="panel-title"><h3>相談</h3><span class="aside">{snap.options.revealTeamTalk ? '遺跡役にも見えています' : snap.you.role === 'ruins' ? '遺跡役のメッセージは全員に見えます' : '探検家だけの相談'}</span></div>
      <div class="msgs" ref={listRef}>
        {!msgs.length && <Empty icon="chat">スタンプやメッセージで作戦を立てましょう。</Empty>}
        {msgs.map(m => {
          const mine = m.cid === snap.you.clientId;
          const ck = m.colors?.[0] ? snap.explorers[m.colors[0]]?.colorKey : null;
          return (
            <div class={`msg ${mine ? 'mine' : ''} ${m.role} ${m.stamp ? 'stamp' : ''} ${colorClass(ck)}`}>
              <span class="msg-name">{m.role === 'ruins' ? <Icon name="eye" size={12} /> : ck ? <i class="dot" style={{ background: 'var(--c)' }} /> : null}{m.name}</span>
              <span class="msg-text">{m.text}</span>
            </div>
          );
        })}
      </div>
      {canStamp && <div class="stamps">{STAMPS.map(s => <button type="button" class="stamp-btn" onClick={() => send(s, true)}>{s}</button>)}</div>}
      <form class="row" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <input class="input" value={draft} maxLength={200} placeholder="メッセージ" enterkeyhint="send" onInput={(e) => setUI({ chatDraft: e.currentTarget.value })} />
        <Btn kind="primary" onClick={() => send(draft)} disabled={!draft.trim()}>送信</Btn>
      </form>
    </section>
  );
}

// ───────── ruins prompts ─────────
export function RuinsPrompts({ snap }) {
  const r = snap.ruins;
  const now = useNow(500);
  if (!r) return null;
  const out = [];
  for (const q of r.pendingEncounters || []) {
    const e = snap.explorers[q.explorerId];
    const left = Math.max(0, q.deadline - now);
    out.push(
      <section key={q.id} class="panel tight prompt ward">
        <div class="row"><Icon name="warn" size={22} /><div class="grow"><b class="head">遭遇を宣言しますか？</b><div class="small dim">{e.label}の探検家が衛兵のいる部屋に入りました。宣言すると時間−1。黙っていれば衛兵の位置は秘密のまま。</div></div></div>
        <div class="countdown"><i style={{ width: `${(left / ENCOUNTER_MS) * 100}%` }} /><span>{Math.ceil(left / 1000)}秒後に自動で宣言</span></div>
        <div class="row"><Btn class="grow" onClick={() => act({ type: 'encounter', qid: q.id, declare: false })}>黙っておく</Btn><Btn class="grow" kind="danger" onClick={() => act({ type: 'encounter', qid: q.id, declare: true })}>遭遇を宣言</Btn></div>
      </section>,
    );
  }
  const p = r.pendingAbility;
  if (p) {
    const actor = snap.explorers[p.actorId];
    if (p.type === 'guide') {
      const t = snap.explorers[p.targetId];
      out.push(
        <section key="guide" class="panel tight prompt brass">
          <div class="row"><Emblem char="guide" size={30} /><div class="grow"><b class="head">ガイドの質問</b><div class="small dim">{actor.label}から見て、{t.label}の探検家がいる方角を答えてください。{p.same ? '同じマスにいるので、好きな方角を答えられます。' : p.validDirs.length > 1 ? '斜めの位置なので、どちらか一方を選べます。' : ''}</div></div></div>
          <div class="dirpick">{DIR_KEYS.map(d => <button type="button" class="dirbtn" disabled={!p.validDirs.includes(d)} onClick={() => act({ type: 'answerAbility', data: { dir: d } })}><Icon name={`arrow${d}`} size={18} />{DIRS[d].label}</button>)}</div>
        </section>,
      );
    } else if (p.type === 'mercenary') out.push(<MercenaryPrompt key="merc" snap={snap} p={p} actor={actor} />);
  }
  if (r.pendingAttack) out.push(<RevealWait key="atk" snap={snap} eid={r.pendingAttack.explorerId} attack />);
  for (const eid of r.revealWait || []) out.push(<RevealWait key={`rw-${eid}`} snap={snap} eid={eid} />);
  return out.length ? <div class="col prompts">{out}</div> : null;
}

function MercenaryPrompt({ snap, p, actor }) {
  const [sel, setSel] = useState(p.suggestion || []);
  const guards = snap.ruins.guards.filter(g => p.eligibleGuardIds.includes(g.id));
  return (
    <section class="panel tight prompt brass">
      <div class="row"><Emblem char="mercenary" size={30} /><div class="grow"><b class="head">元傭兵の妨害</b><div class="small dim">{actor.label}の探検家の能力。カードの条件に当てはまる衛兵を選んでください（0〜2体）。迷ったら、元傭兵から2歩以内の衛兵（選択済み）がおすすめです。</div></div></div>
      <div class="row wrap">{guards.map((g, i) => <button type="button" class={`clue-pick ${sel.includes(g.id) ? 'on' : ''}`} onClick={() => setSel(sel.includes(g.id) ? sel.filter(x => x !== g.id) : [...sel, g.id].slice(-2))}><Icon name="guard" size={16} />衛兵{i + 1}（{g.pos === snap.ruins.shrine.index ? '石室' : `${Math.floor(g.pos / 5) + 1}行${g.pos % 5 + 1}列`}）</button>)}</div>
      <Btn kind="primary" onClick={() => act({ type: 'answerAbility', data: { guardIds: sel } })}>{sel.length}体を動けなくする</Btn>
    </section>
  );
}

function RevealWait({ snap, eid, attack }) {
  const e = snap.explorers[eid];
  const [since] = useState(Date.now());
  const now = useNow(1000);
  const late = now - since > 15000;
  const offline = !e.ownerConnected;
  return (
    <section class="panel tight prompt">
      <div class="row"><span class="spinner" /><div class="grow"><b>{e.label}の予測カードを公開中…</b><div class="tiny muted">{offline ? `${e.ownerName} の接続が切れています。` : `${e.ownerName} の端末からの返答を待っています。`}</div></div></div>
      {(late || offline) && isLocalHost() && (
        <div class="col gap-s" style="margin-top:8px">
          <span class="tiny muted">応答がない場合だけ、本人に聞いた内容を手動で入力してください。</span>
          <div class="row"><Btn size="small" class="grow" onClick={() => forceReveal(eid, 'rest')}>休憩だった</Btn><Btn size="small" class="grow" disabled={e.alertLocked} onClick={() => forceReveal(eid, 'alert')}>警戒だった</Btn></div>
        </div>
      )}
    </section>
  );
}

// The guard the ruins player is moving: their pick, or the only one that can move right now.
export function selectedGuardFor(snap, ui) {
  const r = snap.ruins;
  if (!r) return null;
  if (ui.selectedGuard && r.guards.some(g => g.id === ui.selectedGuard)) return ui.selectedGuard;
  if (snap.stage !== 'ruinsTurn' || ui.selectedGuard === false) return null;
  const movable = r.guards.filter(g => (r.guardMoves?.[g.id] || []).length && g.immobilizedRound !== snap.round);
  return movable.length === 1 ? movable[0].id : null;
}

export function RuinsControls({ snap }) {
  const ui = S().ui;
  const r = snap.ruins;
  if (snap.stage !== 'ruinsTurn' || !r) return null;
  const busy = !!r.pendingAttack || (r.revealWait || []).length > 0 || snap.pendingEndRuins;
  const sel = selectedGuardFor(snap, ui);
  const attackers = r.attackable || [];
  const last = r.guards.find(g => g.id === r.lastMovedPieceId);
  const tokens = snap.time.moveRemaining ?? 0;
  return (
    <section class="panel tight stagepanel ruinsctl">
      <div class="row wrap">
        <div class="moves big">{Array.from({ length: snap.time.movesUsed + tokens }).map((_, i) => <span class={`mtoken ${i < snap.time.movesUsed ? 'used' : ''}`} />)}</div>
        <span class="small">移動トークン 残り <b class="num">{tokens}</b></span>
      </div>
      <div class="guardpick">
        {r.guards.map((g, i) => {
          const frozen = g.immobilizedRound === snap.round;
          const moves = r.guardMoves?.[g.id] || [];
          return (
            <button type="button" class={`gpick ${g.type} ${sel === g.id ? 'on' : ''}`} disabled={busy || frozen || !tokens || !moves.length}
              onClick={() => {
                audio.play('tap');
                setUI({ selectedGuard: sel === g.id ? false : g.id });
                // bring the glowing destinations into view
                if (sel !== g.id) document.querySelector('.game.ruins .stone')?.scrollIntoView({ block: 'nearest', behavior: S().settings.reduced ? 'auto' : 'smooth' });
              }}>
              <Icon name={g.type === 'guardian' ? 'guardian' : 'guard'} size={20} />
              <span><b>{g.type === 'guardian' ? '守護神' : `衛兵${i + 1}`}</b><small>{frozen ? '妨害で動けない' : g.type === 'guardian' ? '最大2マス・超攻撃' : '1マス移動'}</small></span>
            </button>
          );
        })}
      </div>
      <p class="tiny muted">{sel ? '光っているマスをタップして移動します。' : '動かす駒を選んでください。'}</p>
      <Btn block kind={tokens ? '' : 'primary'} disabled={busy} onClick={() => { setUI({ selectedGuard: null }); act({ type: 'endRuins' }); }}>遺跡役の手番を終える</Btn>
    </section>
  );
}

// Fixed bar that appears right after a guard lands on explorers.
export function AttackBar({ snap }) {
  const ui = S().ui;
  const r = snap.ruins;
  if (snap.stage !== 'ruinsTurn' || !r?.attackable?.length) return null;
  const key = `${r.lastMovedPieceId}:${snap.time.movesUsed}`;
  if (ui.attackSkip === key) return null;
  const last = r.guards.find(g => g.id === r.lastMovedPieceId);
  if (!last) return null;
  const guardian = last.type === 'guardian';
  return (
    <div class="attackbar" role="dialog" aria-label="攻撃のチャンス">
      <div class="row" style="margin-bottom:8px"><Icon name={guardian ? 'guardian' : 'sword'} size={22} /><div class="grow"><b class="head">{guardian ? '守護神の超攻撃' : '攻撃のチャンス'}</b><div class="tiny dim">{guardian ? '警戒していても命中（時間−3）' : '休憩なら命中して時間−3。警戒なら防がれる。見逃して警戒を空振りさせる手も。'}</div></div></div>
      <div class="row wrap">
        {r.attackable.map(eid => { const e = snap.explorers[eid]; return <Btn kind="danger" class="grow" onClick={() => act({ type: 'attack', eid })}><Seal colorKey={e.colorKey} label={e.label} size="s" />{e.label}を攻撃{e.alertLocked ? '（警戒不可）' : ''}</Btn>; })}
        <Btn kind="ghost" onClick={() => setUI({ attackSkip: key })}>見逃す</Btn>
      </div>
    </div>
  );
}

export function EncounterPolicy({ snap }) {
  const p = snap.options.encounterPolicy || 'ask';
  if (snap.ruinsCpu || snap.you.role !== 'ruins') return null;
  return (
    <div class="field"><span>遭遇の宣言</span>
      <Seg value={p} onChange={(v) => act({ type: 'encounterPolicy', policy: v })} options={[{ value: 'ask', label: '毎回確認' }, { value: 'always', label: '常に宣言' }, { value: 'never', label: '宣言しない' }]} />
    </div>
  );
}

export function MiniMaps({ snap }) {
  return (
    <div class="minimaps">
      {Object.values(snap.explorers).map((e, _, all) => (
        <div class={`minimap ${colorClass(e.colorKey)}`}>
          <div class="row gap-s"><Seal colorKey={e.colorKey} label={e.label} size="s" /><b class="small ellipsis">{all.filter(o => o.ownerName === e.ownerName).length > 1 ? `${e.label}の探検家` : e.ownerName}</b></div>
          <SurveyMap map={snap.maps[e.id]} colorKey={e.colorKey} label={e.label} mini />
        </div>
      ))}
    </div>
  );
}
