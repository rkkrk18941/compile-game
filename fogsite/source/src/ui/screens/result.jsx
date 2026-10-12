import { useEffect, useMemo, useState } from 'preact/hooks';
import { S, setUI } from '../store.js';
import { Btn, Seal, colorClass } from '../common.jsx';
import { Icon, Emblem } from '../icons.jsx';
import { StoneBoard } from '../boards.jsx';
import { act, leaveRoom } from '../session.js';
import { CHARACTER_MAP } from '../../core/constants.js';
import { audio } from '../../audio/audio.js';

export function explorerTitle(score) {
  if (score >= 30) return { name: '霧を払う者', note: '伝説的な速さで脱出した' };
  if (score >= 22) return { name: '遺跡の踏破者', note: '迷いなく仲間と合流した' };
  if (score >= 15) return { name: '熟練の探検隊', note: '確かな推理で脱出した' };
  if (score >= 8) return { name: '生還者', note: '霧の中から帰還した' };
  if (score >= 1) return { name: 'からくも脱出', note: '時間ぎりぎりの生還' };
  return { name: '時の淵からの帰還', note: '最後の一瞬で脱出した' };
}
function ruinsTitle(reason) {
  if (reason === 'timeout') return { name: '霧の番人', note: '探検家の時間を奪い尽くした' };
  if (reason === 'fail') return { name: '惑わしの迷宮', note: '探検家に脱出を誤らせた' };
  return { name: '遺跡の勝利', note: '' };
}

function heroTitle(snap, won, youWin) {
  if (won) return youWin ? '脱出成功' : '脱出された';
  if (snap.endReason === 'timeout') return youWin ? '時間切れ' : '時間切れ';
  if (snap.endReason === 'concede') return youWin ? '降参により勝利' : '降参';
  return youWin ? '遺跡の勝利' : '脱出失敗';
}

export function ResultScreen({ snap }) {
  const rv = snap.reveal;
  const won = snap.winner === 'explorers';
  const youWin = (snap.winner === 'ruins') === (snap.you.role === 'ruins');
  const title = won ? explorerTitle(snap.score ?? 0) : ruinsTitle(snap.endReason);
  const maxRound = snap.round || 1;
  const [round, setRound] = useState(maxRound);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setRound(r => { if (r >= maxRound) { setPlaying(false); return r; } audio.play('step'); return r + 1; }), 1100);
    return () => clearInterval(t);
  }, [playing, maxRound]);
  const trails = useMemo(() => {
    if (!rv?.history) return [];
    const out = [];
    for (const [eid, list] of Object.entries(rv.history.pos || {})) {
      out.push({ colorKey: snap.explorers[eid]?.colorKey, points: list.filter(p => p.r <= round).map(p => p.p) });
    }
    const byGuard = {};
    for (const g of rv.history.guards || []) if (g.r <= round) (byGuard[g.id] ||= { type: g.type, pts: [] }).pts.push(g.p);
    for (const g of Object.values(byGuard)) out.push({ dashed: true, kind: g.type, points: g.pts });
    return out;
  }, [rv, round]);
  const posAt = (eid) => { const list = (rv?.history?.pos?.[eid] || []).filter(p => p.r <= round); return list.length ? list[list.length - 1].p : rv?.starts?.[eid]; };
  const guardAt = () => {
    const last = {};
    for (const g of rv?.history?.guards || []) if (g.r <= round) last[g.id] = g;
    return Object.values(last);
  };
  const tokens = rv ? [
    ...Object.values(snap.explorers).map(e => ({ id: e.id, kind: 'explorer', pos: posAt(e.id), colorKey: e.colorKey, label: e.label })),
    ...guardAt().map(g => ({ id: g.id, kind: g.type, pos: g.p })),
  ] : [];
  const st = rv?.stats || {};
  return (
    <div class="screen result">
      <section class={`result-hero ${youWin ? 'win' : 'lose'}`}>
        <span class="result-kicker">{youWin ? 'あなたの勝利' : 'あなたの敗北'}</span>
        <h1 class="result-title">{heroTitle(snap, won, youWin)}</h1>
        <p class="result-text">{snap.resultText}</p>
        <div class="result-badge">
          <Icon name={won ? 'exit' : 'eye'} size={22} />
          <div><b>{title.name}</b>{title.note && <span>{title.note}</span>}</div>
          {won && <div class="result-score"><span class="tiny">残り時間</span><b class="num">{snap.score}</b></div>}
        </div>
      </section>

      {rv && (
        <section class="panel tight">
          <div class="panel-title"><h3>迷宮の真の姿</h3><span class="aside">足跡をラウンドごとに再生</span></div>
          <StoneBoard board={rv.board} shrine={rv.shrine} starts={rv.starts} tokens={tokens} trails={trails} mode="reveal" />
          <div class="replay">
            <button type="button" class="btn iconbtn" aria-label={playing ? '一時停止' : '再生'} onClick={() => { audio.play('tap'); if (!playing && round >= maxRound) setRound(1); setPlaying(!playing); }}><Icon name={playing ? 'pause' : 'play'} /></button>
            <input class="slider" type="range" min="1" max={maxRound} value={round} onInput={(e) => { setPlaying(false); setRound(Number(e.currentTarget.value)); }} aria-label="ラウンド" />
            <span class="small num">R{round}/{maxRound}</span>
          </div>
          <div class="legend tiny muted"><span><i class="lg-trail" />探検家の足跡</span><span><i class="lg-guard" />衛兵の動き</span><span><i class="lg-start" />開始位置</span></div>
        </section>
      )}

      <section class="panel tight">
        <div class="panel-title"><h3>探検の記録</h3></div>
        <div class="statgrid">
          {Object.values(snap.explorers).map((e, _, all) => {
            const c = CHARACTER_MAP[rv?.characters?.[e.id]];
            const s = e.stats || {};
            const multi = all.filter(o => o.ownerName === e.ownerName).length > 1;
            return (
              <div class={`statcard ${colorClass(e.colorKey)}`}>
                <div class="row gap-s"><Seal colorKey={e.colorKey} label={e.label} /><div class="grow"><b class="ellipsis">{multi ? `${e.label}の探検家` : e.ownerName}</b>{c && <div class="tiny muted row gap-s"><Emblem char={c.key} size={14} />{c.name}</div>}</div></div>
                <dl><dt>探索</dt><dd class="num">{s.explores ?? 0}</dd><dt>壁</dt><dd class="num">{s.walls ?? 0}</dd><dt>能力</dt><dd class="num">{s.abilities ?? 0}</dd><dt>被弾</dt><dd class="num">{s.hitBy ?? 0}</dd></dl>
              </div>
            );
          })}
        </div>
        <div class="row wrap tiny muted" style="margin-top:10px">
          <span class="chip">ラウンド {maxRound}</span>
          <span class="chip">攻撃 {st.attacks ?? 0}（命中 {(st.hits ?? 0) + (st.superHits ?? 0)}）</span>
          <span class="chip">遭遇 {st.encounters ?? 0}</span>
          {st.timeBy && <span class="chip">探索で −{st.timeBy.explore || 0}・攻撃で −{st.timeBy.attack || 0}</span>}
        </div>
      </section>

      <div class="dock row">
        {snap.you.isHost && <Btn kind="primary" class="grow" onClick={async () => { setUI({ tab: 'map' }); const ok = await act({ type: 'rematch' }); if (ok && snap.roomCode.startsWith('CPU')) act({ type: 'beginSetup' }); }}><Icon name="rotate" size={18} />{snap.roomCode.startsWith('CPU') ? 'もう一度遊ぶ' : '同じメンバーでもう一度'}</Btn>}
        <Btn class="grow" onClick={() => leaveRoom(true)}>タイトルへ</Btn>
      </div>
    </div>
  );
}
