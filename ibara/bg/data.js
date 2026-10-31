/* スレイザスパイア — shared rule data for the board-game edition.
   Sources: rulebook v2.30 (Asmodee/Contention Games), the publisher's archived TTS module (Act I party data),
   and LuaViper's StSBoardGameMod (card/monster numbers, which track the printed cards). See RULES_AUDIT.md. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});
var D = STS.DATA = {};

D.RULES_VERSION = 3;
D.MODES = {
  normal: { name: '通常', hp: 0, rest: 0 },
  beginner: { name: '初心者', hp: 2, rest: 1 }
};
D.CAP = { str: 8, weak: 3, vuln: 3, poison: 30, shiv: 5, miracle: 5, block: 20, energy: 6, daze: 10, status: 36, dark: 3, potions: 3, potionsA4: 2 };

/* Characters. HP is the highest number printed on each player board. */
D.CHARS = {
  R: { key: 'R', name: 'アイアンクラッド', en: 'Ironclad', hp: 10, color: 'red', relic: 'BurningBlood',
       deck: ['StrikeR','StrikeR','StrikeR','StrikeR','StrikeR','DefendR','DefendR','DefendR','DefendR','Bash'],
       ability: '戦闘終了時、HPを1回復する（バーニングブラッド）。' },
  G: { key: 'G', name: 'サイレント', en: 'Silent', hp: 9, color: 'green', relic: 'RingOfTheSnake',
       deck: ['StrikeG','StrikeG','StrikeG','StrikeG','StrikeG','DefendG','DefendG','DefendG','DefendG','DefendG','Neutralize','Survivor'],
       ability: '戦闘開始時、カードを2枚引く（蛇の指輪）。ナイフ（最大5）を使える。' },
  B: { key: 'B', name: 'ディフェクト', en: 'Defect', hp: 9, color: 'blue', relic: 'CrackedCore',
       deck: ['StrikeB','StrikeB','StrikeB','StrikeB','DefendB','DefendB','DefendB','DefendB','Zap','Dualcast'],
       ability: '戦闘開始時、ライトニングを1つ生成する（壊れたコア）。オーブスロット3。' },
  W: { key: 'W', name: 'ウォッチャー', en: 'Watcher', hp: 9, color: 'purple', relic: 'Miracles',
       deck: ['StrikeW','StrikeW','StrikeW','StrikeW','DefendW','DefendW','DefendW','DefendW','Eruption','Vigilance'],
       ability: '奇跡（最大5）を使ってエナジーを得られる。スタンス（憤怒・平静）を持つ。' }
};
D.CHAR_ORDER = ['R', 'G', 'B', 'W'];

/* Character buffs: a house rule of this app, chosen in the settings (on unless the player turns it off).
   An adventure uses them when run.buff === true (the engine default is off, the rules as printed). */
D.BUFFS = {
  R: { tx: 'ターン終了時：HPを1回復する。その時HPが1なら、さらに1回復する（合計2）。' },
  G: { tx: 'ターン開始時：毒を持っていない敵1体に毒1を与えられる。ターン終了時（毒のダメージの前）：敵を1体以上選び、その敵の毒をすべて取り除いて、取り除いた数だけブロックを得てもよい。選んだ敵は今回の毒ダメージを受けず、選ばなかった敵の毒は残る。' },
  W: { tx: 'スタンスを変えるたび、ブロック1とチャージ1を得る。ターン終了時、チャージの数と同じダメージを敵1体に1ヒットで与え、チャージは0に戻る。' }
};

/* Official map layouts (row 0 = bottom). D/L are dark/light token spaces filled from shuffled token pools. */
D.MAPS = {"1":[{"rows":["...M...",".?.?.?.","?..M..M","M.L.?.?","D.M.D.L",".L..L.D","T..T.T.","M.?.D.M",".D..L.D","L.M.?.L","D.$.D.?",".RR.RR.","...B..."],"edges":[["0-3","1-1"],["0-3","1-3"],["0-3","1-5"],["1-1","2-0"],["1-3","2-3"],["1-5","2-6"],["2-0","3-0"],["2-3","3-2"],["2-3","3-4"],["2-6","3-6"],["3-0","4-0"],["3-0","4-2"],["3-2","4-2"],["3-2","4-4"],["3-4","4-4"],["3-6","4-6"],["4-0","5-1"],["4-2","5-4"],["4-4","5-4"],["4-6","5-6"],["5-1","6-0"],["5-1","6-3"],["5-4","6-3"],["5-4","6-5"],["5-6","6-5"],["6-0","7-0"],["6-3","7-2"],["6-3","7-4"],["6-5","7-4"],["6-5","7-6"],["7-0","8-1"],["7-2","8-1"],["7-4","8-4"],["7-6","8-6"],["8-1","9-0"],["8-1","9-2"],["8-4","9-2"],["8-4","9-4"],["8-6","9-6"],["9-0","10-0"],["9-2","10-2"],["9-4","10-4"],["9-6","10-4"],["9-6","10-6"],["10-0","11-1"],["10-2","11-2"],["10-4","11-4"],["10-6","11-5"],["11-1","12-3"],["11-2","12-3"],["11-4","12-3"],["11-5","12-3"],["12-3","13-3"]]},{"rows":["...M...",".?.?.?.","M..M..?","$.L.?.M","D.M.L.L","?.D.M.D",".T.TT.T",".M.D.D.","L.?.L.L","E.L.?.D","?.D.D.?",".RR.RR.","...B..."],"edges":[["0-3","1-1"],["0-3","1-3"],["0-3","1-5"],["1-1","2-0"],["1-3","2-3"],["1-5","2-6"],["2-0","3-0"],["2-0","3-2"],["2-3","3-2"],["2-3","3-4"],["2-6","3-6"],["3-0","4-0"],["3-2","4-2"],["3-4","4-4"],["3-6","4-6"],["4-0","5-0"],["4-2","5-0"],["4-2","5-2"],["4-4","5-2"],["4-4","5-4"],["4-6","5-4"],["4-6","5-6"],["5-0","6-1"],["5-2","6-1"],["5-4","6-3"],["5-4","6-4"],["5-6","6-6"],["6-1","7-1"],["6-1","7-3"],["6-3","7-3"],["6-4","7-5"],["6-6","7-5"],["7-1","8-0"],["7-1","8-2"],["7-3","8-2"],["7-3","8-4"],["7-5","8-4"],["7-5","8-6"],["8-0","9-0"],["8-2","9-2"],["8-4","9-4"],["8-6","9-6"],["9-0","10-0"],["9-2","10-2"],["9-2","10-4"],["9-4","10-4"],["9-6","10-6"],["10-0","11-1"],["10-2","11-2"],["10-4","11-4"],["10-6","11-5"],["11-1","12-3"],["11-2","12-3"],["11-4","12-3"],["11-5","12-3"]]}],"2":[{"rows":["...M...",".M.?.?.",".$.L.M.","D.D.M.L","L.L.D.D","DD.D.LL","?.L.?.?","D.M.?.E",".RR.RR.","...B..."],"edges":[["0-3","1-1"],["0-3","1-3"],["0-3","1-5"],["1-1","2-1"],["1-3","2-3"],["1-5","2-5"],["2-1","3-0"],["2-3","3-2"],["2-3","3-4"],["2-5","3-4"],["2-5","3-6"],["3-0","4-0"],["3-0","4-2"],["3-2","4-2"],["3-4","4-2"],["3-4","4-4"],["3-6","4-6"],["4-0","5-0"],["4-0","5-1"],["4-2","5-1"],["4-2","5-3"],["4-4","5-5"],["4-6","5-5"],["4-6","5-6"],["5-0","6-0"],["5-1","6-2"],["5-3","6-2"],["5-3","6-4"],["5-5","6-4"],["5-6","6-6"],["6-0","7-0"],["6-2","7-0"],["6-2","7-2"],["6-4","7-4"],["6-4","7-6"],["6-6","7-6"],["7-0","8-1"],["7-2","8-2"],["7-4","8-4"],["7-6","8-5"],["8-1","9-3"],["8-2","9-3"],["8-4","9-3"],["8-5","9-3"],["12-3","13-3"]]}],"3":[{"rows":["...M...",".?.M.?.",".L.L.M.","?D.?.LL","D.MDD.D",".LL.L.?","D.D.$D.",".RR.RR.","...B..."],"edges":[["0-3","1-1"],["0-3","1-3"],["0-3","1-5"],["1-1","2-1"],["1-3","2-3"],["1-5","2-5"],["2-1","3-0"],["2-1","3-1"],["2-1","3-3"],["2-3","3-3"],["2-5","3-5"],["2-5","3-6"],["3-0","4-0"],["3-1","4-2"],["3-3","4-2"],["3-3","4-3"],["3-5","4-3"],["3-5","4-4"],["3-6","4-6"],["4-0","5-1"],["4-2","5-1"],["4-3","5-2"],["4-3","5-4"],["4-4","5-4"],["4-6","5-6"],["5-1","6-0"],["5-1","6-2"],["5-2","6-2"],["5-4","6-4"],["5-4","6-5"],["5-6","6-5"],["6-0","7-1"],["6-2","7-2"],["6-4","7-4"],["6-5","7-5"],["7-1","8-3"],["7-2","8-3"],["7-4","8-3"],["7-5","8-3"]]}]};
D.TOKENS = {
  dark: ['E','E','E','M','M','M','?','?'],
  darkEmerald: ['E','E','E','É','M','M','?','?'],
  light: ['M','?','$','$','R','R','R']
};
D.ROOM = {
  M: { name: '遭遇', icon: 'monster' }, E: { name: 'エリート', icon: 'elite' }, 'É': { name: '燃えるエリート', icon: 'burning' },
  '?': { name: 'イベント', icon: 'event' }, '$': { name: '商人', icon: 'shop' }, R: { name: '休憩所', icon: 'rest' },
  T: { name: '宝箱', icon: 'treasure' }, B: { name: 'ボス', icon: 'boss' }, X: { name: '空き部屋', icon: 'empty' }
};
/* Act IV: map printed on the back of the Act IV boss card. Rest, Merchant, Elite (Ascension 11+), Heart. */
D.ACT4 = ['R', '$', 'E', 'B'];

/* Neow's Blessing deck: three blue options per card; the red reward is always a card reward.
   Drawback: - none, D lose 2 HP, 3 lose 3 HP, G lose 3 gold, C gain a curse.
   Reward: 4/5/8/X(=10) gold, r remove, R remove 2, t transform, T transform 2, u upgrade, U upgrade 2 random,
   c card reward, C 2 random cards, P 3 potions, ? random rare, ! choose a rare, % random relic,
   = choose a colorless card, ) choose 2 colorless cards, W card reward + 5 gold, V choose 2 cards. */
D.NEOW = [
  { c: '-= -t DX', colorless: true }, { c: '-u -r DX' }, { c: '-u -? CX' }, { c: '-= -r D!', colorless: true },
  { c: '-u -P C!' }, { c: '-5 -? G!' }, { c: '-= -? G%', colorless: true }, { c: '-u -5 C%' },
  { c: '-P -c G%' }, { c: '-r -t D%' }, { c: '-= -u GR', colorless: true }, { c: '-t -5 GR' },
  { c: '-? -c DR' }, { c: '-? -t CU' }, { c: '-r -5 GU' }, { c: '-u -P DU' },
  { c: '-= -P CT', colorless: true }, { c: '-r -t 3T' }, { c: '-t -5 C)', colorless: true }, { c: '-r -P CW' }
];
D.NEOW_DRAWBACK = { '-': '', D: 'HPを2失う', '3': 'HPを3失う', G: '3ゴールドを失う', C: '呪いを1枚得る' };
D.NEOW_REWARD = {
  '4': '4ゴールドを得る', '5': '5ゴールドを得る', '8': '8ゴールドを得る', X: '10ゴールドを得る',
  r: 'カードを1枚除去する', R: 'カードを2枚除去する', t: 'カードを1枚変化させる', T: 'カードを2枚変化させる',
  u: 'カードを1枚アップグレードする', U: 'ランダムなカード2枚をアップグレードする', c: 'カード報酬を1回得る',
  C: 'ランダムなカードを2枚得る', P: 'ポーションを3つ得る', '?': 'ランダムなレアカードを1枚得る',
  '!': 'レアカード報酬を1回得る', '%': 'ランダムなレリックを1つ得る', '=': '無色カード報酬を1回得る',
  ')': '無色カード報酬を2回得る', W: 'カード報酬を1回得て、5ゴールドを得る', V: 'カード報酬を2回得る', '+': 'ランダムな無色カードを2枚得る'
};

D.ASCENSION = [
  null,
  { name: 'エリート強化', desc: '各幕のエリートがアセンション1版に置き換わる。' },
  { name: '最大HP減少', desc: '最大HPが1低くなる。' },
  { name: 'イベント強化', desc: 'アセンション3のイベントカードを各幕のイベントデッキに加える。' },
  { name: 'ポーション上限2', desc: 'ポーションを2つまでしか持てない。' },
  { name: '呪われた開始', desc: '初期デッキに「登塔者の災厄」を加える。' },
  { name: 'ボス後の回復4', desc: '第2幕以降の開始時、全回復の代わりにHPを4回復する。' },
  { name: '遭遇強化', desc: '遭遇カードがアセンション7版に置き換わり、追加の召喚カードを使う。' },
  { name: '除去費用4', desc: '商人でのカード除去が4ゴールドになる。' },
  { name: '負傷した開始', desc: 'ゲーム開始時にHPを1失う（最大HP減少の後）。' },
  { name: 'ボス強化', desc: 'アセンション10版のボスデッキだけを使う。' },
  { name: '第4幕強化', desc: 'アセンション11版の堕落の心臓を使い、第4幕でエリートと戦う。' },
  { name: 'エリート再強化', desc: '第1〜3幕のエリートがアセンション12版に置き換わる。' },
  { name: '第3幕ボス2連戦', desc: '第3幕のボスを倒した後、別のランダムな第3幕ボスと戦う。' }
];

/* Unlocks. Each finished game: 1 box per Boss defeated + 1. Own character first (1 / +3 / +4 boxes),
   then Colorless or Act IV boxes. */
D.UNLOCK = { charLocks: [1, 3, 4], colorless: 3, act4: 5 };

D.PRICE = { common: 2, uncommon: 3, rare: 6, remove: 3, removeA8: 4 };
D.REST_HEAL = 3;

/* Short Japanese labels for tokens and keywords (video-game localisation terms). */
D.TERMS = {
  block: 'ブロック', str: '筋力', weak: '脱力', vuln: '弱体化', poison: '毒', shiv: 'ナイフ', miracle: '奇跡',
  energy: 'エナジー', exhaust: '廃棄', ethereal: 'エーテリアル', retain: '保留', scry: '占術', channel: '生成', evoke: '解放',
  wrath: '憤怒', calm: '平静', neutral: 'ニュートラル', lightning: 'ライトニング', frost: 'フロスト', dark: 'ダーク',
  unplayable: '使用不可', daze: 'めまい', burn: '火傷', slimed: '粘液', voidslime: '虚無', curse: '呪い', status: '状態異常',
  transform: '変化', upgrade: 'アップグレード', remove: '除去', aoe: '範囲', hit: 'ヒット'
};
})(typeof window !== 'undefined' ? window : globalThis);
