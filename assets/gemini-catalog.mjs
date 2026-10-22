// Only completed Gemini / Lyria recordings are listed here.
const catalog={
  "sk-rush": {
    "id": "sk-rush",
    "title": "逆転の疾走",
    "tempo": 176,
    "style": "4拍子の疾走ロック。エレキギターの8分刻み、走るエレキベース、生ドラム、短いリードギター旋律",
    "duration": 123.167347,
    "file": "bgm/gemini/rush.mp3"
  },
  "sk-pursuit": {
    "id": "sk-pursuit",
    "title": "追走の弦",
    "tempo": 168,
    "style": "3拍子の緊迫した管弦楽。16分音符の弦楽合奏、バイオリンの追走、金管の応答、ティンパニ",
    "duration": 124.081633,
    "file": "bgm/gemini/pursuit.mp3"
  },
  "sk-swing": {
    "id": "sk-swing",
    "title": "切り札のスウィング",
    "tempo": 192,
    "style": "軽快な高速スウィングジャズ。アコースティックピアノ、トランペット、歩くウッドベース、ブラシとライド",
    "duration": 122.592653,
    "file": "bgm/gemini/swing.mp3"
  },
  "sk-mind": {
    "id": "sk-mind",
    "title": "疑心のテーブル",
    "tempo": 112,
    "style": "心理戦サスペンス。脈打つ低音、冷たい電子音、余白ある短い旋律。不穏で知的",
    "duration": 125.831837,
    "file": "bgm/gemini/mind.mp3"
  },
  "sk-cipher": {
    "id": "sk-cipher",
    "title": "暗号の駆け引き",
    "tempo": 124,
    "style": "細かいシーケンスと鋭いビートの心理戦。少しずつ加速する緊張感、低いベース、冷たいシンセ",
    "duration": 113.293061,
    "file": "bgm/gemini/cipher.mp3"
  },
  "sk-verdict": {
    "id": "sk-verdict",
    "title": "最後の宣告",
    "tempo": 96,
    "style": "重いハーフタイム、不穏な生ピアノ、深い低音、静かな間から戻るビート。終盤の緊迫感",
    "duration": 117.995102,
    "file": "bgm/gemini/verdict.mp3"
  },
  "sk-harbor": {
    "id": "sk-harbor",
    "title": "凪の港",
    "tempo": 88,
    "style": "3拍子、ゆったりした港のフォーク。柔らかい弦、撥弦、控えめな低音。素朴な海辺のあたたかさ",
    "duration": 121.835102,
    "file": "bgm/gemini/harbor.mp3"
  },
  "sk-sailing": {
    "id": "sk-sailing",
    "title": "帆をあげて",
    "tempo": 104,
    "style": "軽やかな航海のフォーク。弾む弦とアコースティックギター、小さな打楽器、明るい帆船の旅",
    "duration": 121.521633,
    "file": "bgm/gemini/sailing.mp3"
  },
  "sk-moonlight": {
    "id": "sk-moonlight",
    "title": "月明かりの航路",
    "tempo": 76,
    "style": "静かな夜の海。余白ある生ピアノ、穏やかな和音、繊細なアルペジオ。静謐で落ち着く",
    "duration": 121.155918,
    "file": "bgm/gemini/moonlight.mp3"
  },
  "garden": {
    "id": "garden",
    "title": "夜明けの庭",
    "tempo": 96,
    "style": "あたたかいピアノ、きらめくベル、柔らかい弦、穏やかな朝のメロディー",
    "duration": 121.443265,
    "file": "bgm/gemini/garden.mp3"
  },
  "depth": {
    "id": "depth",
    "title": "地下の残響",
    "tempo": 76,
    "style": "暗いアンビエント。遠くのベル、低いドローン、広い残響、孤独な地下空間、控えめな拍動",
    "duration": 119.693061,
    "file": "bgm/gemini/depth.mp3"
  },
  "battle": {
    "id": "battle",
    "title": "赤い境界",
    "tempo": 140,
    "style": "緊迫したシンセバトル。鋭いリード、8bitのきらめき、走るベース、タイトなドラム",
    "duration": 125.622857,
    "file": "bgm/gemini/battle.mp3"
  },
  "gensou-seven": {
    "id": "gensou-seven",
    "title": "七枚の王国",
    "tempo": 100,
    "style": "中世ファンタジーの国づくり。ハープ、リュート、フルート、弦楽四重奏。魔法と冒険を感じる穏やかな戦略曲",
    "duration": 120.581224,
    "file": "bgm/gemini/gensou-seven.mp3"
  },
  "cryptid": {
    "id": "cryptid",
    "title": "未踏の手がかり",
    "tempo": 96,
    "style": "森と山と湖の地図で未確認生物を推理。木管、ピチカート、低い弦、微かな打楽器。自然の神秘と知的探索",
    "duration": 121.025306,
    "file": "bgm/gemini/cryptid.mp3"
  },
  "compile": {
    "id": "compile",
    "title": "切り札のカウントダウン",
    "tempo": 160,
    "style": "心理戦、ブレイクビーツ、ベース、ギター、弦、ピアノ",
    "duration": 182.569796,
    "file": "bgm/gemini/compile.mp3"
  }
};
for(const track of Object.values(catalog))track.url=new URL(track.file,import.meta.url).href;
export const RECORDINGS=Object.freeze(catalog);
