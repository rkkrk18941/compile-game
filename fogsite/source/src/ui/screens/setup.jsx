import { useState } from 'preact/hooks';
import { S, setUI, openSheet } from '../store.js';
import { Btn, Seg, Seal, Coach } from '../common.jsx';
import { Icon, Emblem } from '../icons.jsx';
import { StoneBoard } from '../boards.jsx';
import { act } from '../session.js';
import { CHARACTERS, CHARACTER_MAP, EXPLORER_DEFS } from '../../core/constants.js';
import { PRESET_MAZES } from '../../core/mazegen.js';
import { audio } from '../../audio/audio.js';

export function SetupScreen({ snap }) {
  if (snap.you.role === 'ruins') return <RuinsSetup snap={snap} />;
  return <ExplorerSetup snap={snap} />;
}

function RuinsSetup({ snap }) {
  const ui = S().ui;
  const su = snap.setup || {};
  const ids = Object.keys(snap.explorers);
  const tool = ui.setupTool || 'toggle';
  const checks = su.checks || [];
  const mazeOk = checks.filter(c => c.key !== 'chars').every(c => c.ok);
  const charsOk = checks.find(c => c.key === 'chars')?.ok;
  const clue = ui.clue && ids.includes(ui.clue) ? ui.clue : ids[0];
  const tokens = [];
  const highlights = {};
  for (let i = 0; i < 25; i++) highlights[i] = 'edit';
  const setCell = (i) => { audio.play(tool === 'shrine' ? 'stoneMove' : 'tap'); act({ type: 'setCell', cell: i, tool }); };
  const tools = [
    { id: 'toggle', label: '壁 / 部屋', icon: 'wall' },
    { id: 'shrine', label: '石室', icon: 'crown' },
    ...ids.map(id => ({ id, label: `${snap.explorers[id].label}の開始`, seal: id })),
  ];
  return (
    <div class="screen setup">
      <section class="panel tight">
        <div class="panel-title"><h3>迷宮を築く</h3><span class="aside">探検家には見えません</span></div>
        <p class="small dim">マスをタップして壁と部屋を切り替えます。石室と探検家の開始位置を置いて、条件をすべて満たしたら開始できます。</p>
      </section>

      <StoneBoard board={su.board || []} shrine={su.shrine} starts={su.starts} tokens={tokens} highlights={highlights} onCell={setCell} mode="setup" />

      <section class="panel tight">
        <div class="toolrow" role="toolbar" aria-label="編集ツール">
          {tools.map(t => (
            <button type="button" class={`tool ${tool === t.id ? 'on' : ''}`} onClick={() => { audio.play('tap'); setUI({ setupTool: t.id }); }}>
              {t.seal ? <Seal eid={t.seal} size="s" /> : <Icon name={t.icon} size={18} />}<span>{t.label}</span>
            </button>
          ))}
        </div>
        <div class="row wrap" style="margin-top:10px">
          <span class="small dim">石室の形</span>
          <Seg value={su.shrine?.shape || 'I'} onChange={(v) => act({ type: 'shrineStyle', shape: v })} options={[{ value: 'I', label: 'I字（反対2方向）' }, { value: 'L', label: 'L字（直角2方向）' }]} />
          <Btn size="small" onClick={() => act({ type: 'shrineStyle', rotation: ((su.shrine?.rotation || 0) + 1) % 4 })}><Icon name="rotate" size={18} />矢印を回す</Btn>
        </div>
        <div class="row wrap" style="margin-top:10px">
          <Btn size="small" onClick={() => act({ type: 'randomMaze', level: 'easy' })}><Icon name="dice" size={18} />やさしい</Btn>
          <Btn size="small" onClick={() => act({ type: 'randomMaze', level: 'normal' })}><Icon name="dice" size={18} />ふつう</Btn>
          <Btn size="small" onClick={() => act({ type: 'randomMaze', level: 'hard' })}><Icon name="dice" size={18} />いじわる</Btn>
          <Btn size="small" onClick={() => openSheet({ kind: 'presets' })}><Icon name="book" size={18} />おすすめ迷宮</Btn>
          <Btn size="small" kind="ghost" onClick={() => act({ type: 'clearMaze' })}><Icon name="trash" size={18} />全消去</Btn>
        </div>
      </section>

      <section class="panel tight">
        <div class="panel-title"><h3>迷宮の条件</h3><span class={`aside ${mazeOk ? 'good-text' : ''}`}>{mazeOk ? 'すべて満たしています' : '未達成あり'}</span></div>
        <ul class="checks">{checks.map(c => <li class={c.ok ? 'ok' : 'ng'}><Icon name={c.ok ? 'check' : 'close'} size={16} />{c.text}</li>)}</ul>
      </section>

      <section class="panel tight">
        <div class="panel-title"><h3>最初の手掛かり</h3><span class="aside">石室の衛兵からの最短歩数を伝えます</span></div>
        <div class="row wrap">
          {ids.map(id => (
            <button type="button" class={`clue-pick ${clue === id ? 'on' : ''}`} onClick={() => { audio.play('tap'); setUI({ clue: id }); }}>
              <Seal eid={id} size="s" />{snap.explorers[id].label}<b class="num">{Number.isFinite(su.distances?.[id]) ? `${su.distances[id]}マス` : '—'}</b>
            </button>
          ))}
        </div>
      </section>

      <section class="panel tight">
        <div class="panel-title"><h3>探検家の準備</h3></div>
        <div class="row wrap">
          {ids.map(id => <span class={`chip ${su.characterReady?.[id] ? 'good' : ''}`}><Seal eid={id} size="s" />{snap.explorers[id].label}・{snap.explorers[id].ownerName}{su.characterReady?.[id] ? ' 選択済み' : ' 選択中…'}</span>)}
        </div>
      </section>

      <div class="dock">
        <Btn kind="primary" size="big" block disabled={!mazeOk || !charsOk} onClick={() => act({ type: 'startGame', clue })}>
          {!mazeOk ? '迷宮の条件を満たしてください' : !charsOk ? 'キャラクター選択を待っています' : '探索を開始する'}
        </Btn>
      </div>
    </div>
  );
}

export function PresetSheet() {
  return (
    <div class="col">
      {PRESET_MAZES.map((p, i) => (
        <button type="button" class="preset" onClick={() => { audio.play('select'); act({ type: 'presetMaze', index: i }); openSheet(null); }}>
          <div class="preset-mini">{p.rows.join('').split('').map(ch => <i class={ch === '#' ? 'w' : ch === 'S' ? 's' : ''} />)}</div>
          <div class="grow"><b>{p.name}</b><div class="tiny muted">{p.note}</div></div>
        </button>
      ))}
    </div>
  );
}

function ExplorerSetup({ snap }) {
  const owned = snap.you.ownedExplorerIds;
  const [open, setOpen] = useState(null);
  const takenBy = {};
  for (const e of Object.values(snap.explorers)) if (e.character && e.character !== 'hidden') takenBy[e.character] = e;
  const ruinsCpu = !!snap.ruinsCpu;
  return (
    <div class="screen setup">
      <section class="panel tight">
        <div class="panel-title"><h3>キャラクターを選ぶ</h3><span class="aside">遺跡役には開始まで秘密</span></div>
        <p class="small dim">能力は手番中に1回使えます。使うと疲労し、フェイズ2の終わりに回復します。仲間と相談して、組み合わせを決めましょう。</p>
      </section>
      <Coach id="setup-chars">迷ったら「ガイド」「考古学者」「地理学者」。仲間と自分の位置を推理しやすくなります。</Coach>
      {owned.map(eid => {
        const e = snap.explorers[eid];
        return (
          <section class="panel tight charpick">
            <div class="row"><Seal eid={eid} size="l" /><div class="grow"><b class="head">{e.label}の探検家</b><div class="tiny muted">{e.character ? `${CHARACTER_MAP[e.character]?.name}を選択中` : '未選択'}</div></div></div>
            <div class="chargrid">
              {CHARACTERS.map(c => {
                const t = takenBy[c.key];
                const mine = e.character === c.key;
                const other = t && t.id !== eid;
                return (
                  <button type="button" class={`charcard ${mine ? 'on' : ''} ${other ? 'taken' : ''}`} disabled={other}
                    onClick={() => { audio.play('select'); act({ type: 'character', eid, char: c.key }); }}
                    onContextMenu={(ev) => { ev.preventDefault(); setOpen(c.key); }}>
                    <Emblem char={c.key} size={40} />
                    <b>{c.name}</b>
                    <span>{c.short}</span>
                    {other && <span class="taken-by"><Seal eid={t.id} size="s" />{t.ownerName}</span>}
                    {mine && <span class="picked"><Icon name="check" size={14} /></span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <section class="panel tight">
        <div class="panel-title"><h3>能力の詳細</h3><span class="aside">タップで開く</span></div>
        <div class="col gap-s">
          {CHARACTERS.map(c => (
            <details class="chardetail" open={open === c.key}>
              <summary><Emblem char={c.key} size={22} /><b>{c.name}</b><span class="tiny muted">{c.short}</span></summary>
              <p class="small">{c.desc}</p>
              <p class="tiny muted">ヒント：{c.tip}</p>
            </details>
          ))}
        </div>
      </section>
      <div class="dock"><div class="waiting"><span class="spinner" />{ruinsCpu ? 'CPU遺跡役が迷宮を築いています…' : `${snap.ruinsName} が迷宮を築いています…`}</div></div>
    </div>
  );
}
