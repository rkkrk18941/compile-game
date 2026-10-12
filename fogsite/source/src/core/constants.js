// ─────────────────────────────────────────────────────────────
//  MIST MAZE — shared constants (rules + presentation metadata)
// ─────────────────────────────────────────────────────────────
export const PROTOCOL = 3;
export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DIRS = Object.freeze({
  N: { dx: 0, dy: -1, label: '北', sym: '↑' },
  E: { dx: 1, dy: 0, label: '東', sym: '→' },
  S: { dx: 0, dy: 1, label: '南', sym: '↓' },
  W: { dx: -1, dy: 0, label: '西', sym: '←' },
});
export const DIR_KEYS = Object.freeze(['N', 'E', 'S', 'W']);
export const OPPOSITE = Object.freeze({ N: 'S', S: 'N', E: 'W', W: 'E' });

export const EXPLORER_DEFS = Object.freeze([
  { id: 'x1', label: '青', name: '青の探検家', colorKey: 'blue', glyph: '◆' },
  { id: 'x2', label: '黄', name: '黄の探検家', colorKey: 'yellow', glyph: '●' },
  { id: 'x3', label: '赤', name: '赤の探検家', colorKey: 'red', glyph: '▲' },
]);
export const EXPLORER_INDEX = Object.freeze({ x1: 0, x2: 1, x3: 2 });

// Time stacks (maze tiles on the time board). "legacy" is the value the previous
// version of this app used; the "official" values follow the published setup table.
export const TIME_PRESETS = Object.freeze({
  legacy: { label: '従来版', note: '13 / 13 / 12 / 12', stacks: [13, 13, 12, 12] },
  official: { label: '公式（人数別）', note: '探検家2人 7/9/11/13・3人 11/11/14/14', stacks: null },
  custom: { label: 'カスタム', note: '自由に設定', stacks: null },
});
export function officialStacks(explorerCount) {
  return explorerCount >= 3 ? [11, 11, 14, 14] : [7, 9, 11, 13];
}

export const PHASE_EFFECTS = Object.freeze({
  // effect that happens when the given phase (1-based) ENDS
  1: { title: 'フェイズ1 終了', lines: ['遺跡役の移動トークン +1', '衛兵が石室に追加される'], short: '衛兵が増える' },
  2: { title: 'フェイズ2 終了', lines: ['遺跡役の移動トークン +1', '探検家全員の疲労が回復する'], short: '疲労が回復' },
  3: { title: 'フェイズ3 終了', lines: ['遺跡役の移動トークン +1', '守護神が石室に現れる'], short: '守護神が現れる' },
  4: { title: 'フェイズ4 終了', lines: ['迷宮マスが尽きた', '最後の脱出の機会だけが残る'], short: '時間切れ' },
});

// Character abilities. Names follow the board game roles; descriptions are written for
// this digital edition.
export const CHARACTERS = Object.freeze([
  {
    key: 'guide', name: 'ガイド', en: 'GUIDE',
    short: '仲間がいる方角を聞く',
    desc: '仲間を1人指定する。遺跡役は、あなたから見てその仲間がいる方角（東西南北のどれか）を答える。斜めの位置なら2方向のどちらか、同じマスにいるなら好きな方角が答えられる。',
    tip: '2人の位置関係を一気に絞り込める。合流前の確認にも。',
    host: true,
  },
  {
    key: 'geographer', name: '地理学者', en: 'GEOGRAPHER',
    short: '隣の未確認マス2つを調べる',
    desc: '隣接する未確認マスを2か所選び、部屋か壁かを確認する（迷宮マスを2枚使う＝時間−2）。移動はせず、壁が見つかっても手番は続く。未確認マスが1か所以下のときは使えない。',
    tip: '壁にぶつからずに周囲を調べられる。行き止まりの確認に強い。',
    cost: 2,
  },
  {
    key: 'archaeologist', name: '考古学者', en: 'ARCHAEOLOGIST',
    short: '隣の壁が外壁か内壁か鑑定',
    desc: '隣接する判明済みの壁を1つ選ぶ。遺跡役は、それが迷宮の端の「外壁」か、迷宮の中の「内壁」かを答える。',
    tip: '外壁が分かれば、自分が迷宮のどこにいるかが一気に絞れる。',
  },
  {
    key: 'doctor', name: '医師', en: 'DOCTOR',
    short: '仲間1人の疲労を回復',
    desc: '自分以外の探検家1人の疲労を取り除き、その能力をもう一度使えるようにする。',
    tip: '強力な能力を2回目以降も使わせる。見習いの初期疲労も回復できる。',
  },
  {
    key: 'mercenary', name: '元傭兵', en: 'MERCENARY',
    short: '衛兵の移動を妨害',
    desc: '能力を使うと、遺跡役は移動できなくなった衛兵の数（0〜2）を答える。その衛兵は次の遺跡役の手番で動けない。守護神には効果がない。（対象の判定は遺跡役が行う）',
    tip: '攻撃されそうな時の守りに。答えの数から衛兵の近さも推理できる。',
    host: true,
  },
  {
    key: 'monk', name: '破戒僧', en: 'MONK',
    short: '一直線上の内壁を数える',
    desc: '東西南北から1方向を選ぶ。遺跡役は、あなたの位置からその方向の迷宮の端までにある内壁の数（石室も内壁として数える）を答える。',
    tip: '「0」ならその先は端まで部屋。外壁までの距離の推理にも使える。',
  },
  {
    key: 'apprentice', name: '見習い', en: 'APPRENTICE',
    short: '仲間の能力をまねる',
    desc: 'ゲーム開始時は疲労している。疲労が取れた後は、仲間1人のキャラクター能力を自分が持っているかのように使える（その仲間が疲労中でも使える）。',
    tip: '中盤以降、その場で最も役立つ能力を選んで使える万能型。',
  },
]);
export const CHARACTER_MAP = Object.freeze(Object.fromEntries(CHARACTERS.map(c => [c.key, c])));

export const STAGE_LABEL = Object.freeze({
  lobby: 'ロビー', setup: '迷宮準備', explorerTurns: '探検家の手番', escape: '脱出の相談',
  finalEscape: '最後の脱出', prediction: '行動予測', ruinsTurn: '遺跡役の手番', gameover: 'ゲーム終了',
});

export const AUTO_TURN_MS = 30000;      // if nobody claims the next explorer turn, pick automatically
export const ENCOUNTER_MS = 15000;     // ruins player's window to declare an encounter (default: declare)
export const MAX_EXPLORER_SEATS = 3;
export const MAX_CHAT = 120;
export const MAX_EVENTS = 90;
export const MAX_LOG = 160;

export const MARK_KINDS = Object.freeze({
  meet: { label: '集合地点', sym: '◎' },
  danger: { label: '衛兵注意', sym: '!' },
  question: { label: '要確認', sym: '?' },
  star: { label: '目印', sym: '★' },
});

export const STAMPS = Object.freeze([
  '集合しよう！', '私が先に動きます', 'ちょっと待って', '能力を使います',
  '脱出しよう！', 'まだ早いと思う', '作戦盤を見て', 'ナイス推理！',
  '壁に当たった…', '攻撃に注意', 'ありがとう', '了解！',
]);
