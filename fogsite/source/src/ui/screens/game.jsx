import { useMemo } from 'preact/hooks';
import { S, set, setUI } from '../store.js';
import { Btn, Seal, Coach, colorClass, Toggle } from '../common.jsx';
import { Icon } from '../icons.jsx';
import { StoneBoard, SurveyMap } from '../boards.jsx';
import {
  TeamStrip, TurnPicker, ActionTray, TeammateActing, EscapeVote, PredictionPanel, RuinsWatch,
  TeamBoardPanel, IntelFeed, ChatPanel, RuinsPrompts, RuinsControls, EncounterPolicy, MiniMaps, LogPanel, AttackBar, selectedGuardFor,
} from '../panels.jsx';
import { act } from '../session.js';
import { audio } from '../../audio/audio.js';
import { buildKnowledge, boardConflicts } from '../../core/solver.js';

const k = (x, y) => `${x},${y}`;

export function GameScreen({ snap }) {
  return snap.you.role === 'ruins' ? <RuinsGame snap={snap} /> : <ExplorerGame snap={snap} />;
}

function Tabs({ tabs, tab }) {
  const unread = S().unread;
  return (
    <nav class="tabbar" role="tablist">
      {tabs.map(t => (
        <button type="button" role="tab" aria-selected={tab === t.id} class={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => { audio.play('tap'); setUI({ tab: t.id }); if (t.id === 'talk') set({ unread: 0 }); }}>
          <Icon name={t.icon} size={20} />
          <span>{t.label}</span>
          {t.id === 'talk' && unread > 0 && <i class="badge">{unread > 9 ? '9+' : unread}</i>}
          {t.alert && <i class="badge dotonly" />}
        </button>
      ))}
    </nav>
  );
}

// Projections of the team board into one explorer's local frame.
function projections(snap, focus) {
  const tb = snap.teamBoard;
  const out = { ghosts: [], teamCells: new Map(), marks: [], meet: null, notes: [] };
  for (const it of snap.intel || []) {
    if (it.kind === 'encounter' && it.target === focus && it.local) out.notes.push({ x: it.local.x, y: it.local.y, icon: 'warn' });
  }
  if (!tb) return out;
  const L = tb.layers?.[focus];
  if (!L) return out;
  const me = snap.maps[focus];
  for (const [eid, OL] of Object.entries(tb.layers || {})) {
    if (eid === focus) continue;
    const m = snap.maps[eid], e = snap.explorers[eid];
    if (!m || !e) continue;
    const bx = OL.x + m.localPos.x, by = OL.y + m.localPos.y;
    out.ghosts.push({ x: bx - L.x, y: by - L.y, colorKey: e.colorKey, label: e.label });
    for (const [key, v] of Object.entries(m.discovered)) {
      const [lx, ly] = key.split(',').map(Number);
      const tx = OL.x + lx - L.x, ty = OL.y + ly - L.y;
      if (me.discovered[k(tx, ty)]) continue;
      if (!out.teamCells.has(k(tx, ty))) out.teamCells.set(k(tx, ty), { v: v === 'wall' ? 'wall' : 'open', colorKey: e.colorKey });
    }
  }
  for (const mk of tb.marks || []) {
    const p = { x: mk.x - L.x, y: mk.y - L.y };
    if (mk.kind === 'meet') out.meet = p; else out.marks.push({ ...p, kind: mk.kind });
  }
  return out;
}

function ExplorerGame({ snap }) {
  const ui = S().ui;
  const tab = ui.tab || 'map';
  const owned = snap.you.ownedExplorerIds;
  const activeMine = snap.activeExplorerId && owned.includes(snap.activeExplorerId);
  // which map is shown: active (if mine) > explicit focus > first own
  let focus = ui.focusEid && snap.explorers[ui.focusEid] ? ui.focusEid : null;
  if (activeMine && (!focus || owned.includes(focus))) focus = snap.activeExplorerId;
  if (!focus) focus = owned[0] || Object.keys(snap.explorers)[0];
  const fe = snap.explorers[focus];
  const isMine = owned.includes(focus);
  const ex = useMemo(() => projections(snap, focus), [snap.revision, focus]);
  const canAct = snap.stage === 'explorerTurns' && snap.activeExplorerId === focus && isMine && !snap.waitingOnRuins;
  const onStep = (kind, dir) => { if (kind === 'explore') audio.play('tap'); else audio.play('step'); act({ type: kind === 'explore' ? 'explore' : 'move', eid: focus, dir }); };
  const onPath = (dirs) => { audio.play('walk', { n: Math.min(4, dirs.length) }); act({ type: 'movePath', eid: focus, dirs }); };
  const teamHint = useMemo(() => {
    if (!snap.teamBoard) return null;
    const layers = snap.teamBoard.layers || {};
    const ids = Object.keys(snap.explorers);
    if (!ids.every(id => layers[id])) return null;
    const know = buildKnowledge(snap);
    const conf = boardConflicts(know, Object.fromEntries(ids.map(id => [id, { x: layers[id].x, y: layers[id].y }])));
    const pos = ids.map(id => k(layers[id].x + snap.maps[id].localPos.x, layers[id].y + snap.maps[id].localPos.y));
    const together = pos.every(p => p === pos[0]);
    if (!conf.ok) return { ok: false, text: '作戦盤の配置に矛盾があります。推理を見直しましょう。' };
    return together ? { ok: true, text: '作戦盤の配置では、全員が同じ部屋にいます。' } : { ok: false, text: '作戦盤の配置では、まだ全員が同じ部屋にいません。' };
  }, [snap.revision, snap.stage]);

  let stage = null;
  if (snap.stage === 'explorerTurns') {
    if (!snap.activeExplorerId) stage = <TurnPicker snap={snap} />;
    else if (activeMine) stage = <ActionTray snap={snap} eid={snap.activeExplorerId} />;
    else stage = <TeammateActing snap={snap} />;
  } else if (snap.stage === 'escape' || snap.stage === 'finalEscape') stage = <EscapeVote snap={snap} teamHint={teamHint} />;
  else if (snap.stage === 'prediction') stage = <PredictionPanel snap={snap} />;
  else if (snap.stage === 'ruinsTurn') stage = <RuinsWatch snap={snap} />;

  const mapFirst = snap.stage === 'explorerTurns' && !!activeMine;
  const tabs = [
    { id: 'map', icon: 'map', label: '地図' },
    { id: 'team', icon: 'layers', label: '作戦盤' },
    { id: 'intel', icon: 'scroll', label: '記録' },
    { id: 'talk', icon: 'chat', label: '相談' },
  ];
  return (
    <div class="screen game explorer">
      <div class="game-main">
        <TeamStrip snap={snap} focus={focus} onPick={(id) => { audio.play('tap'); setUI({ focusEid: id, tab: 'map' }); }} />
        {tab === 'map' && <>
          {(!isMine || ex.meet || ex.ghosts.length > 0) && <div class="maphead">
            {!isMine && <span class="chip"><Icon name="eye" size={13} />{fe.ownerName}の地図（閲覧のみ）</span>}
            {ex.meet && <span class="chip brass">◎ 集合地点</span>}
            {ex.ghosts.length > 0 && <span class="chip">作戦盤の推定を表示中</span>}
          </div>}
          {!mapFirst && stage}
          <SurveyMap map={snap.maps[focus]} colorKey={fe.colorKey} label={fe.label} active={canAct} blocked={fe.blocked} canExplore={snap.time.total > 0}
            onStep={canAct ? onStep : null} onPath={canAct ? onPath : null} extras={ex} title={`${fe.label}の探検家の地図`} />
          {mapFirst && stage}
        </>}
        {tab === 'team' && <TeamBoardPanel snap={snap} />}
        {tab === 'intel' && <IntelFeed snap={snap} />}
        {tab === 'talk' && <ChatPanel snap={snap} />}
      </div>
      <aside class="game-side">
        {tab !== 'team' && <TeamBoardPanel snap={snap} />}
        {tab !== 'talk' && <ChatPanel snap={snap} />}
      </aside>
      <Tabs tabs={tabs} tab={tab} />
    </div>
  );
}

function RuinsGame({ snap }) {
  const ui = S().ui;
  const tab = ui.tab === 'map' ? 'maze' : (ui.tab || 'maze');
  const r = snap.ruins;
  if (!r) return null;
  const sel = selectedGuardFor(snap, ui);
  const highlights = {};
  if (snap.stage === 'ruinsTurn' && sel) {
    const g = r.guards.find(x => x.id === sel);
    for (const c of r.guardMoves?.[sel] || []) highlights[c] = g?.type === 'guardian' ? 'legal2' : 'legal';
  }
  const attackable = new Set(r.attackable || []);
  const tokens = [
    ...Object.values(snap.explorers).map(e => ({ id: e.id, kind: 'explorer', pos: r.positions[e.id], colorKey: e.colorKey, label: e.label, active: e.active, ring: attackable.has(e.id) ? 'target' : null })),
    ...r.guards.map(g => ({ id: g.id, kind: g.type, pos: g.pos, selected: g.id === sel, frozen: g.immobilizedRound === snap.round })),
  ];
  // what explorers know, mapped onto the true board
  let knowledge = null;
  if (ui.showKnowledge) {
    knowledge = {};
    for (const e of Object.values(snap.explorers)) {
      const s = r.starts[e.id], sx = s % 5, sy = Math.floor(s / 5);
      for (const [key, v] of Object.entries(snap.maps[e.id].discovered)) {
        const [lx, ly] = key.split(',').map(Number);
        const x = sx + lx, y = sy + ly;
        if (x < 0 || y < 0 || x > 4 || y > 4) continue;
        (knowledge[y * 5 + x] ||= []).push({ colorKey: e.colorKey, v: v === 'wall' ? 'wall' : 'open' });
      }
    }
  }
  const onCell = (i) => {
    if (snap.stage !== 'ruinsTurn') return;
    const target = (r.attackable || []).find(eid => r.positions[eid] === i);
    if (target && !(sel && highlights[i])) { act({ type: 'attack', eid: target }); return; }
    if (sel && highlights[i]) { audio.play('stoneMove'); act({ type: 'moveEnemy', id: sel, to: i }); return; }
    const g = r.guards.find(x => x.pos === i && (r.guardMoves?.[x.id] || []).length && x.immobilizedRound !== snap.round);
    if (g) { audio.play('tap'); setUI({ selectedGuard: g.id === sel ? false : g.id }); }
  };
  const active = snap.activeExplorerId ? snap.explorers[snap.activeExplorerId] : null;
  const tabs = [
    { id: 'maze', icon: 'eye', label: '遺跡' },
    { id: 'know', icon: 'map', label: '地図' },
    { id: 'team', icon: 'layers', label: '作戦盤' },
    { id: 'intel', icon: 'scroll', label: '記録' },
    { id: 'talk', icon: 'chat', label: '相談' },
  ];
  return (
    <div class="screen game ruins">
      <div class="game-main">
        <TeamStrip snap={snap} />
        {tab === 'maze' && <>
          <RuinsPrompts snap={snap} />
          <div class="maphead">
            <Icon name="eye" size={18} /><b class="head small">遺跡の全景</b>
            {active && <span class="chip"><Seal colorKey={active.colorKey} label={active.label} size="s" />{active.ownerName} が行動中</span>}
            <button type="button" class={`chip toggle-chip ${ui.showKnowledge ? 'brass' : ''}`} onClick={() => { audio.play('tap'); setUI({ showKnowledge: !ui.showKnowledge }); }}><Icon name="layers" size={14} />探検家の知識</button>
          </div>
          <StoneBoard board={r.board} shrine={r.shrine} starts={r.starts} tokens={tokens} highlights={highlights} onCell={onCell} knowledge={knowledge} spot={active ? r.positions[active.id] : null} />
          <Coach id="ruins-turn" when={snap.stage === 'ruinsTurn'}>衛兵を選んで光るマスへ動かします。探検家のいるマスに入ったら攻撃できます。トークンは使い切らなくても構いません。</Coach>
          <Coach id="ruins-watch" when={snap.stage === 'explorerTurns'}>探検家の動きはリアルタイムに表示されます。衛兵のいる部屋に入ると「遭遇」を宣言できます。</Coach>
          <RuinsControls snap={snap} />
          {snap.stage !== 'ruinsTurn' && <RuinsStatus snap={snap} />}
        </>}
        {tab === 'know' && <MiniMaps snap={snap} />}
        {tab === 'team' && <TeamBoardPanel snap={snap} readonly />}
        {tab === 'intel' && <IntelFeed snap={snap} />}
        {tab === 'talk' && <ChatPanel snap={snap} />}
        {tab === 'maze' && <section class="panel tight"><EncounterPolicy snap={snap} /></section>}
      </div>
      <aside class="game-side">
        <IntelFeed snap={snap} />
        {tab !== 'talk' && <ChatPanel snap={snap} />}
      </aside>
      <AttackBar snap={snap} />
      <Tabs tabs={tabs} tab={tab} />
    </div>
  );
}

function RuinsStatus({ snap }) {
  const ex = Object.values(snap.explorers);
  let text = '';
  if (snap.stage === 'explorerTurns') text = snap.activeExplorerId ? '探検家が探索しています。遭遇のチャンスを待ちましょう。' : '探検家が手番の順番を相談しています。';
  else if (snap.stage === 'escape') text = '探検家が脱出するか相談しています。';
  else if (snap.stage === 'finalEscape') text = '時間切れ。探検家の最後の脱出を待っています。';
  else if (snap.stage === 'prediction') text = `探検家が予測カードを伏せています（${ex.filter(e => e.predictionSubmitted).length}/${ex.length}）。`;
  return <section class="panel tight"><div class="waiting small"><span class="spinner" />{text}</div></section>;
}
