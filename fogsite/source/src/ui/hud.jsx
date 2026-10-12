import { useEffect, useState } from 'preact/hooks';
import { S, set } from './store.js';
import { Icon } from './icons.jsx';
import { AnimNum, Seal } from './common.jsx';
import { PHASE_EFFECTS } from '../core/constants.js';
import { audio } from '../audio/audio.js';

const PHASE_ICON = { 1: 'guard', 2: 'spark', 3: 'crown', 4: 'hourglass' };

export function TimeMeter({ time, compact }) {
  const stacks = time.stacks || [13, 13, 12, 12];
  const max = stacks.reduce((a, b) => a + b, 0) || 1;
  const cur = (time.phase || 1) - 1;
  const pop = S().timePop;
  const [popKey, setPopKey] = useState(null);
  useEffect(() => { if (pop?.k) { setPopKey(pop.k); const t = setTimeout(() => setPopKey(null), 1300); return () => clearTimeout(t); } }, [pop?.k]);
  const untilNext = time.expired ? 0 : time.phaseRemaining;
  const nextEff = PHASE_EFFECTS[cur + 1];
  const danger = time.total <= 10;
  return (
    <div class={`tmeter ${danger ? 'danger' : ''} ${compact ? 'compact' : ''}`}>
      <div class="tm-count" aria-label={`残り時間 ${time.total}`}>
        <Icon name="hourglass" size={20} />
        <b class="num"><AnimNum value={time.total} /></b>
        {popKey && pop && <span class="tm-pop" key={popKey}>−{pop.n}</span>}
      </div>
      <div class="tm-body">
        <div class="tm-bar" role="img" aria-label={`フェイズ${time.phase}、このフェイズの残り${time.phaseRemaining}`}>
          {stacks.map((n, i) => {
            const left = time.expired ? 0 : i < cur ? 0 : i > cur ? n : time.phaseRemaining;
            return (
              <div class={`tm-seg ${i === cur && !time.expired ? 'cur' : ''} ${i < cur || time.expired ? 'spent' : ''}`} style={{ flexGrow: n }}>
                <i style={{ width: `${(left / n) * 100}%` }} />
                <span class="tm-label">{['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][i]}</span>
                {i < 3 && <span class={`tm-mark ${i < cur ? 'done' : ''}`} title={PHASE_EFFECTS[i + 1].short}><Icon name={PHASE_ICON[i + 1]} size={11} /></span>}
              </div>
            );
          })}
        </div>
        {!compact && <div class="tm-note">
          {time.expired ? <span class="ward-text">迷宮マスは尽きた</span>
            : <span>あと <b class="num">{untilNext}</b>：{nextEff?.short || '時間切れ'}</span>}
        </div>}
      </div>
    </div>
  );
}

export function TurnRibbon({ snap }) {
  const text = ribbonText(snap);
  if (!text) return null;
  const color = text.color;
  return (
    <div class={`ribbon tone-${text.tone || 'jade'}`}>
      {color && <Seal colorKey={color} label={text.seal} size="s" />}
      <span class="ribbon-main">{text.main}</span>
      {text.aside && <span class="ribbon-aside">{text.aside}</span>}
    </div>
  );
}

function ribbonText(snap) {
  const role = snap.you.role;
  const ex = snap.explorers || {};
  const active = snap.activeExplorerId ? ex[snap.activeExplorerId] : null;
  switch (snap.stage) {
    case 'explorerTurns': {
      if (active) {
        const own = active.ownerIsYou;
        return { color: active.colorKey, seal: active.label, tone: own ? 'brass' : 'jade', main: own ? 'あなたの手番' : `${active.ownerName} の手番`, aside: `${active.label}の探検家${snap.waitingOnRuins ? '・遺跡役の応答待ち' : ''}` };
      }
      const left = Object.values(ex).filter(e => !e.done).length;
      return { tone: 'jade', main: role === 'ruins' ? '探検家が順番を相談中' : '次は誰が動く？', aside: `残り ${left} 人` };
    }
    case 'escape': return { tone: 'jade', main: '脱出の相談', aside: role === 'ruins' ? '探検家の決断を待っています' : '全員の同意で脱出' };
    case 'finalEscape': return { tone: 'ward', main: '最後の脱出', aside: '時間切れ' };
    case 'prediction': return { tone: 'jade', main: '行動予測', aside: role === 'ruins' ? `${Object.values(ex).filter(e => e.predictionSubmitted).length}/${Object.keys(ex).length} 人が伏せた` : '休憩か警戒を伏せる' };
    case 'ruinsTurn': {
      const used = snap.time.movesUsed || 0;
      const total = used + (snap.time.moveRemaining ?? 0);
      return { tone: 'ward', main: role === 'ruins' ? 'あなたの手番（遺跡役）' : '遺跡役の手番', aside: role === 'ruins' ? `移動トークン 残り ${snap.time.moveRemaining}` : `衛兵の移動 ${used} 回目` + (total ? '' : '') };
    }
    default: return null;
  }
}

export function Hud({ snap, onMenu }) {
  const conn = S().conn;
  const settings = S().settings;
  const playing = snap.status === 'playing';
  return (
    <header class="hud">
      <div class="hud-row">
        {playing ? <TimeMeter time={snap.time} /> : <div class="hud-room"><span class="tiny muted">部屋</span><b class="code-text">{snap.roomCode.startsWith('CPU') ? 'CPU対戦' : snap.roomCode}</b></div>}
        <div class="hud-side">
          {playing && <span class="hud-round"><span class="tiny">R</span><b class="num">{snap.round}</b></span>}
          <ConnDot conn={conn} cpu={snap.roomCode.startsWith('CPU')} />
          <button type="button" class="btn ghost iconbtn" aria-label={settings.muted ? '音を出す' : '消音'} onClick={() => { set(s => ({ settings: { ...s.settings, muted: !s.settings.muted } })); audio.setMuted(!settings.muted); }}>
            <Icon name={settings.muted ? 'mute' : 'sound'} />
          </button>
          <button type="button" class="btn ghost iconbtn" aria-label="メニュー" onClick={() => { audio.play('tap'); onMenu(); }}><Icon name="menu" /></button>
        </div>
      </div>
      <NetBanner conn={conn} snap={snap} />
      {playing && <TurnRibbon snap={snap} />}
    </header>
  );
}

// Persistent notice when this device has lost the host (guests) or the signalling server (host).
function NetBanner({ conn, snap }) {
  const [since, setSince] = useState(null);
  const bad = conn && ['reconnecting', 'warn'].includes(conn.state) && !snap.roomCode.startsWith('CPU');
  useEffect(() => { if (bad && !since) setSince(Date.now()); if (!bad && since) setSince(null); }, [bad]);
  const [, tick] = useState(0);
  useEffect(() => { if (!bad) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [bad]);
  if (!bad || !since || Date.now() - since < 2500) return null;
  const host = snap.you.isHost;
  return (
    <div class="netbanner" role="status">
      <span class="spinner s" />
      <span>{host ? '通信サーバーとの接続が切れています。仲間との通信は続いている場合があります。' : 'ホストとの接続が切れました。自動で再接続しています…'}</span>
    </div>
  );
}

function ConnDot({ conn, cpu }) {
  if (cpu) return null;
  const st = conn?.state;
  const cls = st === 'open' || st === 'local' ? 'on' : st === 'reconnecting' || st === 'connecting' || st === 'warn' ? 'warn' : 'off';
  return <span class="conn" title={conn?.text || ''}><i class={`dot ${cls}`} /><span class="conn-text">{st === 'open' || st === 'local' ? '' : conn?.text}</span></span>;
}
