import { S, set, setSettings } from '../store.js';
import { Btn, Seg, Toggle } from '../common.jsx';
import { Icon, Emblem } from '../icons.jsx';
import { CHARACTERS, PHASE_EFFECTS } from '../../core/constants.js';
import { audio } from '../../audio/audio.js';
import { store as ls, KEYS } from '../../util/storage.js';

function Overlay({ title, children }) {
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <header class="overlay-head">
        <h2>{title}</h2>
        <button type="button" class="btn ghost iconbtn" aria-label="閉じる" onClick={() => { audio.play('back'); set({ overlay: null }); }}><Icon name="close" /></button>
      </header>
      <div class="overlay-body">{children}</div>
    </div>
  );
}

const Mini = ({ rows }) => (
  <div class="rule-mini" aria-hidden="true">{rows.join('').split('').map(c => <i class={{ '#': 'w', 'S': 's', '1': 'b', '2': 'y', '?': 'q', '.': '' }[c] || ''} />)}</div>
);

export function RulesOverlay() {
  return (
    <Overlay title="遊び方">
      <article class="rules">
        <section>
          <h3>どんなゲーム？</h3>
          <p>1人の<b>遺跡役</b>と、1〜3人の<b>探検家</b>に分かれる対戦ゲームです。探検家は霧の迷宮のどこかに散り散りに置かれ、自分の位置も仲間の位置も分かりません。少しずつ地図を描き、仲間と情報を重ね合わせ、<b>全員が同じ部屋に集まって脱出</b>すれば勝利。遺跡役は衛兵を動かして時間を奪い、それを阻みます。</p>
        </section>
        <section>
          <h3>迷宮（遺跡役が作る）</h3>
          <div class="rule-row"><Mini rows={['..#..', '#.#.1', '..S..', '.#...', '2...#']} />
            <ul>
              <li>5×5マス。周りはすべて外壁。</li>
              <li>内壁を5マス以上置く。部屋はすべてひと続きに。</li>
              <li>石室（衛兵の出入口）を1つ。矢印の先は必ず部屋。探検家には壁に見えます。</li>
              <li>探検家の開始位置どうし、開始位置と石室は縦横に隣接させない。</li>
            </ul>
          </div>
        </section>
        <section>
          <h3>ラウンドの流れ</h3>
          <ol class="flow">
            <li><b>探検家の手番</b>：全員が1回ずつ。順番は相談して自由に決めます。</li>
            <li><b>脱出の相談</b>：全員が同意すれば脱出に挑戦。</li>
            <li><b>行動予測</b>：脱出しないなら、各自「休憩」か「警戒」を伏せます。</li>
            <li><b>遺跡役の手番</b>：衛兵を動かし、探検家を攻撃します。</li>
          </ol>
        </section>
        <section>
          <h3>探検家の手番</h3>
          <ul>
            <li><b>探索</b>（時間−1）：隣のマスを調べる。部屋ならそこへ進み、続けて行動できる。壁なら、その手番はもう探索も移動もできない（能力は使える）。</li>
            <li><b>移動</b>（無料）：自分の地図で判明している部屋へ何マスでも。</li>
            <li><b>能力</b>：キャラクターの能力を1回。使うと疲労し、フェイズ2の終わりに回復します。</li>
            <li>衛兵のいる部屋に入ると、遺跡役は<b>遭遇</b>を宣言できます（時間−1）。</li>
          </ul>
        </section>
        <section>
          <h3>キャラクター</h3>
          <div class="charlist">
            {CHARACTERS.map(c => <div class="charline"><Emblem char={c.key} size={34} /><div><b>{c.name}</b><p class="small">{c.desc}</p></div></div>)}
          </div>
        </section>
        <section>
          <h3>行動予測と攻撃</h3>
          <ul>
            <li>衛兵が探検家のいる部屋に入った直後、遺跡役は1人を攻撃できます。</li>
            <li>伏せたカードが<b>休憩</b>なら命中（時間−3）、<b>警戒</b>なら防御。</li>
            <li>警戒したのに攻撃されなかった探検家は、次の予測で警戒を選べません。</li>
            <li>守護神の<b>超攻撃</b>は警戒でも防げません（各探検家に1手番1回まで）。</li>
          </ul>
        </section>
        <section>
          <h3>遺跡役の手番</h3>
          <ul>
            <li>移動トークン1枚で衛兵を隣の部屋へ1マス、守護神は最大2マス動かせます。</li>
            <li>石室からは矢印の方向にしか出られず、一度出ると戻れません。</li>
            <li>どの衛兵がどこへ動いたかは、探検家には分かりません（移動した回数だけ伝わります）。</li>
          </ul>
        </section>
        <section>
          <h3>時間とフェイズ</h3>
          <p>探索や攻撃で迷宮マス（時間）が減り、山が尽きるたびにフェイズが進みます。</p>
          <ul class="phases">
            {[1, 2, 3].map(p => <li><b>{PHASE_EFFECTS[p].title}</b>：{PHASE_EFFECTS[p].lines.join('、')}</li>)}
            <li><b>すべて尽きると</b>：探索はできなくなり、最後の探検家の手番（移動と能力のみ）の後、最後の脱出に挑みます。</li>
          </ul>
          <p>脱出に成功したときの残り時間がスコアになります。</p>
        </section>
        <section>
          <h3>このアプリでの遊び方</h3>
          <ul>
            <li><b>地図</b>：光る「探索」「移動」のマスをタップ。遠くの判明済みの部屋をタップすると、そこまで歩きます。</li>
            <li><b>作戦盤</b>：仲間の地図を透明シートのように重ねて推理。チーム全員にリアルタイムで共有され、矛盾は × で表示されます。◎を置くと全員の地図に集合地点として出ます。</li>
            <li><b>相談</b>：スタンプでワンタップ連絡。脱出は全員の投票で決まります。</li>
            <li>通信が切れても、同じ端末で開き直せば自動で戻れます。</li>
          </ul>
        </section>
      </article>
    </Overlay>
  );
}

export function SettingsOverlay() {
  const s = S().settings;
  const setVol = (patch) => { setSettings(patch); const n = { ...S().settings }; audio.setVolumes({ master: n.master, music: n.music, sfx: n.sfx }); };
  return (
    <Overlay title="設定">
      <div class="col gap-l settings">
        <section class="panel tight col">
          <h3>サウンド</h3>
          <Toggle on={!s.muted} onChange={(v) => { setSettings({ muted: !v }); audio.setMuted(!v); }} label="音を出す" />
          <label class="field"><span>全体の音量</span><input class="slider" type="range" min="0" max="1" step="0.05" value={s.master} onInput={(e) => setVol({ master: Number(e.currentTarget.value) })} /></label>
          <label class="field"><span>BGM</span><input class="slider" type="range" min="0" max="1" step="0.05" value={s.music} onInput={(e) => setVol({ music: Number(e.currentTarget.value) })} /></label>
          <label class="field"><span>効果音</span><input class="slider" type="range" min="0" max="1" step="0.05" value={s.sfx} onInput={(e) => { setVol({ sfx: Number(e.currentTarget.value) }); audio.play('tap'); }} /></label>
        </section>
        <section class="panel tight col">
          <h3>表示</h3>
          <div class="field"><span>演出の品質</span>
            <Seg value={s.quality} onChange={(v) => { setSettings({ quality: v }); window.__mm?.setQuality?.(v); }} options={[{ value: 'high', label: '高' }, { value: 'standard', label: '標準' }, { value: 'low', label: '省電力' }]} />
          </div>
          <Toggle on={s.reduced} onChange={(v) => { setSettings({ reduced: v }); document.documentElement.classList.toggle('reduced', v); }} label="動きを減らす" sub="画面の揺れや大きなアニメーションを抑えます" />
          <Toggle on={s.haptics} onChange={(v) => setSettings({ haptics: v })} label="振動" sub="対応する端末のみ" />
          <Toggle on={s.coach} onChange={(v) => setSettings({ coach: v })} label="ヒントを表示" sub="はじめての操作のときにコツを表示します" />
          <Btn size="small" kind="ghost" onClick={() => { ls.set(KEYS.seen, {}); set({ coachSeen: {} }); }}>ヒントをもう一度表示する</Btn>
        </section>
        <p class="tiny muted center">MIST MAZE — 非対称推理ボードゲームのデジタル版</p>
      </div>
    </Overlay>
  );
}
