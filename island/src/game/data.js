// Research targets, items and texts.

export const ZONES = {
  shore: { name: "浜辺", en: "SHORE", interference: 1.0 },
  jungle: { name: "密林", en: "JUNGLE", interference: 0.88 },
  mire: { name: "湿地", en: "MIRE", interference: 0.82 },
  ridge: { name: "黒い尾根", en: "BLACK RIDGE", interference: 0.78 },
  heart: { name: "火口・心臓部", en: "THE HEART", interference: 0.42 },
};

// kind: plant | animal | special | core
// need: seconds of scanning for a full record; bonus: behaviour that doubles the rate
export const SPECIES = [
  { id: "palm", name: "ココヤシ", sci: "Cocos nucifera", kind: "plant", zone: "shore", need: 3,
    text: ["浜辺に並ぶヤシ。幹は海側へ大きく傾いている。", "実は海流に乗って島々へ運ばれる。この島にも漂着した実から根付いたらしい。", "ココナッツの胚乳と果汁は、飲み水が乏しい時の貴重な補給源になる。"] },
  { id: "pandanus", name: "アダン", sci: "Pandanus odoratissimus", kind: "plant", zone: "shore", need: 3,
    text: ["幹から支柱根を何本も下ろし、砂地に体を支えている。", "葉の縁には鋭い棘が並ぶ。素手で触るのは避けるべきだ。", "パイナップルに似た集合果は熟すと橙色になり、ヤシガニの好物らしい。"] },
  { id: "morningglory", name: "グンバイヒルガオ", sci: "Ipomoea pes-caprae", kind: "plant", zone: "shore", need: 2,
    text: ["砂浜を這うつる植物。葉の先が軍配のように凹む。", "砂を押さえ、浜の崩れを防いでいる。", "桃色の花は朝に開き、昼過ぎにはしぼむ。"] },
  { id: "treefern", name: "ヘゴ", sci: "Cyathea lepifera", kind: "plant", zone: "jungle", need: 3,
    text: ["高さ数メートルになる木性シダ。", "幹の表面には葉が落ちた跡が菱形の模様となって残る。", "若い葉はゼンマイ状に巻いて伸びる。恐竜の時代から姿をほとんど変えていない。"] },
  { id: "buttress", name: "サキシマスオウノキ", sci: "Heritiera littoralis", kind: "plant", zone: "jungle", need: 4,
    text: ["板のような根（板根）を四方へ広げる大木。", "板根は柔らかい湿った土の上で巨体を支える。", "葉の裏は銀白色。風に揺れると森の色が変わって見える。"] },
  { id: "alocasia", name: "クワズイモ", sci: "Alocasia odora", kind: "plant", zone: "jungle", need: 2,
    text: ["林床に生える巨大な葉の草。", "シュウ酸カルシウムを含み、食べると口の中が激しく痛む。名前の通り“食わず”の芋。", "葉は雨傘になるほど大きい。"] },
  { id: "mangrove", name: "ヤエヤマヒルギ", sci: "Rhizophora mucronata", kind: "plant", zone: "mire", need: 3,
    text: ["湿地の泥に支柱根を突き立てるマングローブ。", "海水と淡水の混じる汽水でも育つ。", "細長い胎生種子が枝から垂れ下がり、そのまま泥に刺さって芽を出す。"] },
  { id: "pitcher", name: "ウツボカズラ", sci: "Nepenthes sp.", kind: "plant", zone: "mire", need: 4,
    text: ["葉の先が袋状の捕虫器になる食虫植物。", "袋の中の消化液で虫を溶かし、養分の乏しい泥地で栄養を補う。", "この島の個体は袋が異常に大きい。小さな動物も落ちるかもしれない。"] },
  { id: "mushroom", name: "ヤコウタケ", sci: "Mycena chlorophos", kind: "plant", zone: "jungle", need: 3,
    text: ["朽ちた倒木に群生する小さなキノコ。", "夜になると傘が淡い緑色に光る。", "この島では発光が通常より強い。島の地下深くとの関係が疑われる。"] },
  { id: "glassbloom", name: "ガラスバナ", sci: "Vitriflora insularis（新種）", kind: "plant", zone: "ridge", need: 5,
    text: ["黒い尾根の溶岩の隙間に咲く、ガラス質の花弁をもつ未知の植物。", "花弁はケイ酸の結晶でできている。太陽光を集め、内部で淡く光る。", "根は火口の方向へ異常に長く伸びている。この島が“生きている”ことと関係があるのかもしれない。"] },
  { id: "crab", name: "ヤシガニ", sci: "Birgus latro", kind: "animal", zone: "shore", need: 6,
    text: ["陸に住む最大級の甲殻類。脚を広げると1メートル近い。", "ハサミの力は非常に強い。追い詰めると威嚇してくる。", "夜行性で、昼は岩陰や根元の穴に潜む。"] },
  { id: "booby", name: "カツオドリ", sci: "Sula leucogaster", kind: "animal", zone: "shore", need: 6,
    text: ["海岸の上空を滑空する海鳥。", "魚群を見つけると翼をたたんで海へ突入する。", "島が出現してから数週間で、早くも営巣を始めている。"] },
  { id: "monitor", name: "オオトカゲ", sci: "Varanus sp.", kind: "animal", zone: "jungle", need: 8,
    text: ["林床を歩き回る大型のトカゲ。", "二股の舌で匂いを集め、獲物を探す。", "臆病だが、追い詰められると噛みつく。口の中の細菌に注意。"] },
  { id: "denkui", name: "デンクイ", sci: "Phasmatodea gen. nov.（未記載）", kind: "special", zone: "jungle", need: 12,
    text: ["樹木に擬態する、体高2メートルを超える巨大なナナフシ型の生物。", "触角の先端で電波を感知し、発信源に引き寄せられる。無線アンテナをかじって破壊する。", "【対策】電波を漏らさない遮蔽をすれば、アンテナを見つけられない。→ 装備「電磁シールド」"],
    bonus: "feed", unlock: "shield" },
  { id: "numa", name: "ヌマカクシ", sci: "Crocodylomorpha? gen. nov.（未記載）", kind: "special", zone: "mire", need: 12,
    text: ["湿地の水に身を沈め、目だけを出して獲物を待つ六本脚の捕食者。", "水の振動で獲物の位置を探り、近づいたところへ一気に飛びかかる。", "【対策】水中の振動を逆に読み取れば、潜む位置が分かる。→ 装備「振動ソナー」"],
    bonus: "lunge", unlock: "sonar" },
  { id: "kurohami", name: "クロハミ", sci: "Carnivora? gen. nov.（未記載）", kind: "special", zone: "ridge", need: 12,
    text: ["黒い尾根を徘徊する、目をもたない捕食者。", "頭の大きなひだで音を集め、足音や物音だけで獲物を追う。しゃがんで静かに動けば気づかれにくい。", "【対策】別の場所で音を出せば、そちらへ誘い出せる。→ 装備「音響デコイ」"],
    bonus: "listen", unlock: "decoy" },
  { id: "heart", name: "心核", sci: "—", kind: "core", zone: "heart", need: 20,
    text: ["火口の底で脈打つ巨大な組織。", "島全体に根のような管を張り巡らせている。島は“生き物”だったのだ。", "この記録を本部へ届ければ、調査は完了する。"] },
];

export const ITEMS = {
  antenna: { name: "中継アンテナ", desc: "通信網を広げる中継局。設置すると周囲が通信圏になる。", always: true },
  aid: { name: "救急キット", desc: "体力を回復する。", always: true },
  shield: { name: "電磁シールド", desc: "設置するアンテナを遮蔽し、デンクイに見つからなくする。", unlockBy: "denkui", passive: true },
  sonar: { name: "振動ソナー", desc: "水中に潜むヌマカクシの位置を表示する。", unlockBy: "numa", passive: true },
  decoy: { name: "音響デコイ", desc: "投げると20秒間音を出し、クロハミを誘い出す。", unlockBy: "kurohami", count: 3 },
  gain: { name: "高利得アンテナ", desc: "アンテナの通信距離が1.5倍になる。（植物8種の報告で解放）", unlockBy: "plants8", passive: true },
  coconut: { name: "ココナッツ", desc: "救急キットが1つ増える。（ココヤシの報告で解放）", unlockBy: "palm", passive: true },
  repel: { name: "忌避スプレー", desc: "オオトカゲとヤシガニが近寄らなくなる。（オオトカゲの報告で解放）", unlockBy: "monitor", passive: true },
};

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function zoneAt(terrain, x, z, b) {
  const hx = terrain.landmarks.heart;
  const dh = Math.hypot(x - hx[0], z - hx[2]);
  if (dh < 260) return "heart";
  if (b.vol > 0.45) return "ridge";
  if (b.mire > 0.35) return "mire";
  const h = terrain.heightAt(x, z);
  if (b.forest > 0.4 && h > 3) return "jungle";
  return "shore";
}

export const TEXT = {
  noSignal: "通信圏外",
  signal: "通信可",
};
