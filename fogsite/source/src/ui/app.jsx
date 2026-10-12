import { useEffect } from 'preact/hooks';
import { useApp, S, set, closeSheet, openSheet } from './store.js';
import { Btn, Sheet, Toasts } from './common.jsx';
import { Icon } from './icons.jsx';
import { Cinematic } from './cinematic.jsx';
import { Hud } from './hud.jsx';
import { TitleScreen } from './screens/title.jsx';
import { LobbyScreen, copyText, shareRoom } from './screens/lobby.jsx';
import { SetupScreen, PresetSheet } from './screens/setup.jsx';
import { GameScreen } from './screens/game.jsx';
import { ResultScreen } from './screens/result.jsx';
import { RulesOverlay, SettingsOverlay } from './screens/rules.jsx';
import { AbilitySheet, ConfirmEscapeSheet } from './panels.jsx';
import { leaveRoom, act, getHost } from './session.js';
import { audio } from '../audio/audio.js';

function Connecting() {
  const conn = S().conn;
  return (
    <div class="connecting">
      <div class="lantern-loader"><span /></div>
      <p class="head">{conn?.text || '接続中…'}</p>
      <Btn kind="ghost" size="small" onClick={() => leaveRoom(false)}>やめる</Btn>
    </div>
  );
}

function MenuSheet({ snap }) {
  const playing = snap?.status === 'playing';
  const online = snap && !snap.roomCode.startsWith('CPU');
  return (
    <Sheet title="メニュー">
      <div class="col">
        {online && <div class="row"><Btn class="grow" onClick={() => copyText(snap.roomCode)}><Icon name="copy" size={18} />コード {snap.roomCode}</Btn><Btn class="grow" onClick={() => shareRoom(snap.roomCode)}><Icon name="share" size={18} />招待</Btn></div>}
        <Btn block onClick={() => { closeSheet(); set({ overlay: 'rules' }); }}><Icon name="book" size={18} />遊び方</Btn>
        <Btn block onClick={() => { closeSheet(); set({ overlay: 'settings' }); }}><Icon name="gear" size={18} />設定</Btn>
        {playing && snap.you.role !== 'spectator' && <Btn block kind="danger" onClick={() => openSheet({ kind: 'concede' })}><Icon name="warn" size={18} />降参する</Btn>}
        <Btn block kind="ghost" onClick={() => openSheet({ kind: 'leave' })}><Icon name="exit" size={18} />部屋を出る</Btn>
      </div>
    </Sheet>
  );
}

function LeaveSheet({ snap }) {
  const host = !!getHost() && snap && !snap.roomCode.startsWith('CPU');
  return (
    <Sheet title="部屋を出ますか？">
      <div class="col">
        <p class="small dim">{host ? 'あなたはホストです。部屋を出ると、他のプレイヤーはゲームを続けられません（このあと「前回の部屋」から復元はできます）。' : 'あとでタイトル画面の「前回の部屋」から戻れます。'}</p>
        <div class="row"><Btn class="grow" onClick={closeSheet}>戻る</Btn><Btn class="grow" kind="danger" onClick={() => { closeSheet(); leaveRoom(!host); }}>部屋を出る</Btn></div>
      </div>
    </Sheet>
  );
}

function ConcedeSheet() {
  return (
    <Sheet title="降参しますか？">
      <div class="col">
        <p class="small dim">相手側の勝利でゲームが終わります。</p>
        <div class="row"><Btn class="grow" onClick={closeSheet}>続ける</Btn><Btn class="grow" kind="danger" onClick={() => { closeSheet(); act({ type: 'concede' }); }}>降参する</Btn></div>
      </div>
    </Sheet>
  );
}

function SheetHost({ sheet, snap }) {
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'menu': return <MenuSheet snap={snap} />;
    case 'leave': return <LeaveSheet snap={snap} />;
    case 'concede': return <ConcedeSheet />;
    case 'ability': return snap ? <Sheet title="能力を使う"><AbilitySheet snap={snap} eid={sheet.eid} /></Sheet> : null;
    case 'confirmEscape': return <Sheet title="脱出に賛成する"><ConfirmEscapeSheet /></Sheet>;
    case 'presets': return <Sheet title="おすすめ迷宮"><PresetSheet /></Sheet>;
    default: return null;
  }
}

export function App() {
  const st = useApp();
  const snap = st.snap;
  useEffect(() => {
    // close ability sheet automatically when it is no longer my turn
    if (st.sheet?.kind === 'ability' && (!snap || snap.activeExplorerId !== st.sheet.eid || snap.stage !== 'explorerTurns')) closeSheet();
    if (st.sheet?.kind === 'confirmEscape' && snap?.stage !== 'escape') closeSheet();
  }, [snap?.revision]);
  // a new screen or stage always starts at the top
  const where = `${st.screen}:${snap?.stage || ''}:${st.overlay || ''}`;
  useEffect(() => { try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { window.scrollTo(0, 0); } }, [where]);
  let screen;
  if (st.screen === 'connecting') screen = <Connecting />;
  else if (st.screen === 'room' && snap) {
    const body = snap.stage === 'lobby' ? <LobbyScreen snap={snap} />
      : snap.stage === 'setup' ? <SetupScreen snap={snap} />
      : snap.stage === 'gameover' ? <ResultScreen snap={snap} />
      : <GameScreen snap={snap} />;
    screen = <div class={`app-room stage-${snap.stage} role-${snap.you.role}`}><Hud snap={snap} onMenu={() => openSheet({ kind: 'menu' })} />{body}</div>;
  } else screen = <TitleScreen />;
  return (
    <>
      {screen}
      <SheetHost sheet={st.sheet} snap={snap} />
      {st.overlay === 'rules' && <RulesOverlay />}
      {st.overlay === 'settings' && <SettingsOverlay />}
      <Cinematic c={st.cine} />
      <Toasts toasts={st.toasts} />
    </>
  );
}
