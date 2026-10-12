import { useMemo, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';
import { S, toast } from '../store.js';
import { Btn, Seg, Toggle } from '../common.jsx';
import { Icon } from '../icons.jsx';
import { act } from '../session.js';
import { TIME_PRESETS, officialStacks } from '../../core/constants.js';

export function joinUrl(code) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('room', code);
  const net = new URLSearchParams(location.search).get('net');
  if (net) u.searchParams.set('net', net);
  return u.toString();
}

function QR({ text }) {
  const svg = useMemo(() => {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ''; }
  }, [text]);
  return <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="参加用QRコード" />;
}

export async function copyText(text, msg = 'コピーしました') {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('コピーできませんでした。長押しで選択してください。', 'error'); }
}
export function shareRoom(code) {
  const url = joinUrl(code);
  const text = `霧の迷宮（MIST MAZE）で遊ぼう！ ルームコード: ${code}`;
  if (navigator.share) navigator.share({ title: 'MIST MAZE', text, url }).catch(() => {});
  else copyText(`${text}\n${url}`, '招待リンクをコピーしました');
}

export function LobbyScreen({ snap }) {
  const isHost = snap.you.isHost;
  const o = snap.options;
  const exSeats = snap.seats.filter(s => s.role === 'explorer');
  const ruinsSeat = snap.seats.find(s => s.role === 'ruins');
  const [custom, setCustom] = useState(o.customStacks.join(','));
  const cpuRoom = snap.roomCode.startsWith('CPU');
  const count = Math.min(3, Math.max(exSeats.length, o.explorerCount));
  const stacks = o.timePreset === 'official' ? officialStacks(count) : o.timePreset === 'custom' ? o.customStacks : TIME_PRESETS.legacy.stacks;
  const canStart = exSeats.length >= 1;
  const setOpt = (patch) => act({ type: 'options', patch });

  return (
    <div class="screen lobby">
      <section class="panel invite">
        <div class="invite-code">
          <span class="tiny muted">ルームコード</span>
          <b class="roomcode">{snap.roomCode}</b>
          <div class="row">
            <Btn size="small" onClick={() => copyText(snap.roomCode)}><Icon name="copy" size={18} />コピー</Btn>
            <Btn size="small" kind="primary" onClick={() => shareRoom(snap.roomCode)}><Icon name="share" size={18} />招待</Btn>
          </div>
        </div>
        <QR text={joinUrl(snap.roomCode)} />
      </section>

      <section class="panel">
        <div class="panel-title"><h3>参加者</h3><span class="aside">探検家 {exSeats.length}/3</span></div>
        <div class="seats">
          {ruinsSeat && <SeatRow seat={ruinsSeat} isHost={isHost} />}
          {exSeats.map(s => <SeatRow seat={s} isHost={isHost} />)}
          {exSeats.length < 3 && !isHost && <div class="seat empty"><Icon name="user" size={18} /><span class="small muted">空き席</span></div>}
        </div>
        {isHost && exSeats.length < 3 && (
          <div class="row wrap" style="margin-top:10px">
            <Btn size="small" onClick={() => act({ type: 'addCpu', level: o.cpuLevel })}><Icon name="robot" size={18} />CPU探検家を追加</Btn>
            <span class="tiny muted">席が空いていても、1人で2〜3人の探検家を操作できます。</span>
          </div>
        )}
      </section>

      <section class="panel">
        <div class="panel-title"><h3>ルール設定</h3>{!isHost && <span class="aside">ホストが設定します</span>}</div>
        <div class="col">
          <div class="field"><span>探検家の人数</span>
            <Seg value={count} onChange={(v) => isHost && setOpt({ explorerCount: v })} options={[{ value: 2, label: '2人', disabled: !isHost || exSeats.length > 2 }, { value: 3, label: '3人', disabled: !isHost }]} />
            <span class="tiny muted">{exSeats.length === 1 ? `${exSeats[0].name} が${count}人の探検家を操作します。` : count > exSeats.length ? '人数が足りない分は、誰かが2人目を操作します。' : '1人1人の探検家を操作します。'}</span>
          </div>
          <div class="field"><span>時間（迷宮マスの山）</span>
            <Seg value={o.timePreset} onChange={(v) => isHost && setOpt({ timePreset: v })} options={[{ value: 'legacy', label: '従来版', disabled: !isHost }, { value: 'official', label: '公式・人数別', disabled: !isHost }, { value: 'custom', label: 'カスタム', disabled: !isHost }]} />
            <div class="stackline"><span class="tiny muted">フェイズ1〜4：</span>{stacks.map((n, i) => <span class="chip dark num">{['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'][i]} {n}</span>)}<span class="tiny muted">合計 {stacks.reduce((a, b) => a + b, 0)}</span></div>
            {isHost && o.timePreset === 'custom' && (
              <div class="row"><input class="input" inputMode="numeric" value={custom} onInput={(e) => setCustom(e.currentTarget.value)} placeholder="13,13,12,12" /><Btn size="small" onClick={() => setOpt({ customStacks: custom.split(/[,，\s]+/).filter(Boolean).map(Number) })}>適用</Btn></div>
            )}
          </div>
          <div class="field"><span>推理アシスト（作戦盤）</span>
            <Seg value={o.assist} onChange={(v) => isHost && setOpt({ assist: v })} options={[{ value: 'off', label: 'なし', disabled: !isHost }, { value: 'standard', label: '矛盾を表示', disabled: !isHost }, { value: 'strong', label: '候補も表示', disabled: !isHost }]} />
          </div>
          {!cpuRoom && <Toggle on={o.revealTeamTalk} onChange={(v) => isHost && setOpt({ revealTeamTalk: v })} label="探検家の相談を遺跡役にも見せる" sub="ボードゲームと同じく、チャットと作戦盤が遺跡役から見えます。オフにすると探検家だけの秘密になります。" />}
          {snap.seats.some(s => s.cpu) && (
            <div class="field"><span>CPUの強さ</span>
              <Seg value={o.cpuLevel} onChange={(v) => isHost && setOpt({ cpuLevel: v })} options={[{ value: 'easy', label: 'やさしい', disabled: !isHost }, { value: 'normal', label: 'ふつう', disabled: !isHost }, { value: 'hard', label: 'むずかしい', disabled: !isHost }]} />
            </div>
          )}
        </div>
      </section>

      <div class="dock">
        {isHost
          ? <Btn kind="primary" size="big" block disabled={!canStart} onClick={() => act({ type: 'beginSetup' })}>{canStart ? '迷宮の準備をはじめる' : '探検家の参加を待っています'}</Btn>
          : <div class="waiting"><span class="spinner" />ホストが準備をはじめるのを待っています</div>}
      </div>
    </div>
  );
}

function SeatRow({ seat, isHost }) {
  return (
    <div class={`seat ${seat.connected ? '' : 'off'}`}>
      <span class={`seat-icon ${seat.role}`}><Icon name={seat.cpu ? 'robot' : seat.role === 'ruins' ? 'eye' : 'lantern'} size={18} /></span>
      <div class="grow">
        <div class="seat-name">{seat.name}{seat.isYou && <span class="tiny muted">（あなた）</span>}</div>
        <div class="tiny muted">{seat.role === 'ruins' ? '遺跡役' : '探検家'}{seat.isHost ? '・ホスト' : ''}{seat.cpu ? `・CPU` : ''}</div>
      </div>
      <i class={`dot ${seat.connected ? 'on' : 'off'}`} title={seat.connected ? '接続中' : '切断'} />
      {isHost && !seat.isHost && seat.role === 'explorer' && seat.realId && (
        <button type="button" class="btn ghost iconbtn" aria-label={`${seat.name}を退出させる`} onClick={() => act({ type: 'kick', clientId: seat.realId })}><Icon name="close" size={18} /></button>
      )}
    </div>
  );
}
