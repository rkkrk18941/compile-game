import { useEffect, useState } from 'preact/hooks';
import { S, set, toast } from '../store.js';
import { Btn, Seg } from '../common.jsx';
import { Icon, LogoMark } from '../icons.jsx';
import { createOnlineRoom, joinOnlineRoom, startCpuGame, lastSession, restoreSession, clearSession } from '../session.js';
import { audio } from '../../audio/audio.js';
import { normalizeRoomCode } from '../../core/rules.js';

// The claude.ai artifact preview cannot open peer-to-peer connections: CPU play only there.
const EMBED = !!globalThis.__MM_EMBED__;

export function TitleScreen() {
  const st = S();
  const menu = st.menu;
  const [code, setCode] = useState(() => normalizeRoomCode(new URLSearchParams(location.search).get('room') || ''));
  const [cpu, setCpu] = useState({ as: 'explorer', level: 'normal', count: 2 });
  const [online, setOnline] = useState({ ruins: 'me', level: 'normal', count: 2 });
  const [busy, setBusy] = useState(false);
  const sess = lastSession();
  useEffect(() => { if (code && !menu) set({ menu: 'join' }); }, []);
  const setName = (v) => set({ name: v.slice(0, 16) });
  const go = async (fn) => { if (busy) return; audio.unlock(); setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const open = (m) => { audio.unlock(); audio.play(menu === m ? 'back' : 'select'); set({ menu: menu === m ? null : m }); };

  return (
    <main class="title-screen">
      <section class="title-hero">
        <LogoMark size={88} />
        <h1 class="logotype" aria-label="MIST MAZE">MIST MAZE</h1>
        <p class="title-jp">霧の迷宮</p>
        <p class="title-lede">霧の遺跡で散り散りになった探検家たち。<br />見えない地図をつなぎ合わせ、<br />全員で同じ部屋から脱出せよ。</p>
      </section>

      <section class="title-panel panel">
        <label class="field">
          <span>プレイヤー名</span>
          <input class="input" value={st.name} maxLength={16} placeholder="名前を入力" autocomplete="nickname" enterkeyhint="done" onInput={(e) => setName(e.currentTarget.value)} />
        </label>

        <div class="menu-group">
          <Btn kind={menu === 'online' ? 'primary' : ''} size="big" block sound="" onClick={() => open('online')}><Icon name="users" />オンラインで遊ぶ</Btn>
          {menu === 'online' && EMBED && (
            <div class="menu-body">
              <p class="small dim">このプレビュー画面では、端末どうしをつなぐ通信が使えません。オンライン対戦は公開ページ版で遊べます。ここでは「ひとりでCPUと遊ぶ」をお試しください。</p>
            </div>
          )}
          {menu === 'online' && !EMBED && (
            <div class="menu-body">
              <p class="small dim">2〜4人。ホストの端末がゲームを管理します。</p>
              <div class="field"><span>遺跡役</span>
                <Seg value={online.ruins} onChange={(v) => setOnline({ ...online, ruins: v })} options={[{ value: 'me', label: '自分が遺跡役' }, { value: 'cpu', label: 'CPUが遺跡役' }]} />
              </div>
              {online.ruins === 'cpu' && <>
                <div class="field"><span>CPU遺跡役の強さ</span><Seg value={online.level} onChange={(v) => setOnline({ ...online, level: v })} options={LEVELS} /></div>
                <p class="tiny muted">全員が探検家になり、協力してCPUの迷宮に挑みます。</p>
              </>}
              <Btn kind="primary" block disabled={busy} onClick={() => go(() => createOnlineRoom({ ruins: online.ruins, level: online.level, explorerCount: online.count }))}>部屋を作る</Btn>
              <div class="sep" />
              <JoinBox code={code} setCode={setCode} busy={busy} go={go} />
            </div>
          )}
          {menu === 'join' && !EMBED && (
            <div class="menu-body"><JoinBox code={code} setCode={setCode} busy={busy} go={go} autofocus /></div>
          )}
        </div>

        <div class="menu-group">
          <Btn kind={menu === 'cpu' ? 'primary' : ''} size="big" block sound="" onClick={() => open('cpu')}><Icon name="robot" />ひとりでCPUと遊ぶ</Btn>
          {menu === 'cpu' && (
            <div class="menu-body">
              <div class="field"><span>あなたの役</span>
                <Seg value={cpu.as} onChange={(v) => setCpu({ ...cpu, as: v })} options={[{ value: 'explorer', label: '探検家', sub: 'CPUの迷宮から脱出' }, { value: 'ruins', label: '遺跡役', sub: 'CPU探検隊を阻む' }]} />
              </div>
              <div class="field"><span>探検家の人数</span>
                <Seg value={cpu.count} onChange={(v) => setCpu({ ...cpu, count: v })} options={[{ value: 2, label: '2人' }, { value: 3, label: '3人' }]} />
              </div>
              <div class="field"><span>CPUの強さ</span><Seg value={cpu.level} onChange={(v) => setCpu({ ...cpu, level: v })} options={LEVELS} /></div>
              {cpu.as === 'explorer' && <p class="tiny muted">{cpu.count}人の探検家をあなたが1人で操作します。</p>}
              <Btn kind="primary" block onClick={() => { audio.unlock(); audio.play('select'); startCpuGame({ as: cpu.as, level: cpu.level, explorerCount: cpu.count }); }}>はじめる</Btn>
            </div>
          )}
        </div>

        <div class="row title-minor">
          <Btn kind="quiet" class="grow" onClick={() => { audio.unlock(); set({ overlay: 'rules' }); }}><Icon name="book" />遊び方</Btn>
          <Btn kind="quiet" class="grow" onClick={() => { audio.unlock(); set({ overlay: 'settings' }); }}><Icon name="gear" />設定</Btn>
        </div>

        {sess && !(EMBED && !sess.cpu) && (
          <div class="resume">
            <div class="grow"><div class="small">前回の部屋 <b class="code-text">{sess.cpu ? 'CPU対戦' : sess.room}</b></div><div class="tiny muted">{sess.role === 'host' ? 'ホストとして復元できます' : '再接続できます'}</div></div>
            <Btn size="small" kind="primary" disabled={busy} onClick={() => go(restoreSession)}>{sess.role === 'host' ? '復元' : '再接続'}</Btn>
            <Btn size="small" kind="ghost" onClick={() => { clearSession(); set({}); toast('前回の部屋の記録を消しました。'); }}>消す</Btn>
          </div>
        )}
      </section>
      <footer class="title-foot tiny muted">遺跡役と探検家の非対称推理ゲーム</footer>
    </main>
  );
}

const LEVELS = [{ value: 'easy', label: 'やさしい' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: 'むずかしい' }];

function JoinBox({ code, setCode, busy, go, autofocus }) {
  return (
    <div class="col gap-s">
      <label class="field"><span>ルームコードで参加（探検家）</span>
        <input class="input code" value={code} maxLength={8} autocapitalize="characters" autocomplete="off" spellcheck={false} placeholder="7KQ9XPC" autofocus={autofocus}
          onInput={(e) => setCode(normalizeRoomCode(e.currentTarget.value).slice(0, 7))}
          onKeyDown={(e) => { if (e.key === 'Enter') go(() => joinOnlineRoom(code)); }} />
      </label>
      <Btn block disabled={busy || code.length !== 7} onClick={() => go(() => joinOnlineRoom(code))}><Icon name="door" />参加する</Btn>
    </div>
  );
}
