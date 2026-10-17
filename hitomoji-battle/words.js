/* ヒトモジ・バトル — お題 (themes) and the words the CPUs know.
   The CPUs pick their own word from the theme they are given, and read the table against these lists.
   Every word must fit on the tags (2–7 letters once ゛゜ are dropped and small kana are written large);
   tools/hitomoji-rules-test.mjs checks that. The lists are written for this app (the box's own お題 list is not copied). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HMB_WORDS = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function t(id, name, kids, words) { return { id: id, name: name, kids: !!kids, words: words.trim().split(/\s+/) }; }

  var ja = [
    t('animals', 'どうぶつ', 1, `
      いぬ ねこ うさぎ くま ぞう キリン ライオン トラ サル ゴリラ チンパンジー パンダ コアラ カンガルー シマウマ カバ サイ
      うま うし ぶた ひつじ ヤギ シカ イノシシ タヌキ キツネ オオカミ リス ネズミ ハムスター モグラ コウモリ ラッコ アザラシ
      アシカ セイウチ シロクマ ラクダ チーター ヒョウ ジャガー ピューマ カメ ワニ ヘビ トカゲ ヤモリ カエル イモリ ナマケモノ
      アリクイ アルマジロ バク オランウータン テナガザル マントヒヒ ヒグマ イタチ カワウソ ハリネズミ フェネック ミーアキャット
      カピバラ アルパカ リャマ トナカイ ヘラジカ ヌー インパラ マンモス コヨーテ ジャッカル ハイエナ ポニー ロバ モルモット
      ウォンバット カモノハシ ヤマアラシ ムササビ モモンガ オコジョ レッサーパンダ ユキヒョウ クズリ ビーバー オカピ シマリス
      マレーバク ガゼル トムソンガゼル ジュゴン マナティー アナグマ ハクビシン オポッサム スカンク アライグマ プードル チワワ`),
    t('fruits', 'くだもの', 1, `
      リンゴ ミカン バナナ ブドウ イチゴ メロン スイカ モモ ナシ カキ キウイ レモン パイナップル サクランボ ビワ アンズ ウメ
      ユズ スダチ カボス ライチ ザクロ イチジク パパイヤ アボカド ドリアン ココナッツ オレンジ ブルーベリー ラズベリー
      クランベリー ブラックベリー マスカット デコポン ハッサク キンカン ポンカン イヨカン ナツミカン ネクタリン プラム スモモ
      プルーン ラフランス スターフルーツ グァバ アセロラ ライム シークワーサー ヤマモモ アケビ グレープ ハスカップ ドラゴン
      ナツメ グミ ポポー カシス`),
    t('vegetables', 'やさい', 1, `
      ダイコン ニンジン ジャガイモ サツマイモ サトイモ タマネギ ネギ キャベツ レタス ハクサイ ホウレンソウ コマツナ
      チンゲンサイ ブロッコリー カリフラワー トマト ミニトマト ナス キュウリ ピーマン パプリカ カボチャ ズッキーニ ゴボウ
      レンコン タケノコ アスパラ オクラ ゴーヤ トウモロコシ エダマメ ソラマメ インゲン モヤシ ニラ ショウガ ニンニク セロリ
      パセリ シソ ミョウガ カブ ミズナ シュンギク ヤマイモ ナガイモ クワイ ラディッシュ ルッコラ ケール ビーツ シイタケ
      エノキ マイタケ エリンギ ナメコ シメジ マッシュルーム グリーンピース サヤエンドウ ミツバ セリ フキ ワラビ ゼンマイ`),
    t('drinks', 'のみもの', 1, `
      みず おちゃ りょくちゃ むぎちゃ ほうじちゃ ウーロンちゃ こうちゃ コーヒー カフェオレ カフェラテ ココア ぎゅうにゅう
      ミルク ジュース リンゴジュース トマトジュース コーラ サイダー ラムネ ソーダ レモネード たんさんすい とうにゅう
      あまざけ ミルクティー スムージー シェイク ホットミルク こぶちゃ まっちゃ げんまいちゃ ルイボスティー ハーブティー
      エスプレッソ カプチーノ ラッシー レモンティー ゆずちゃ くずゆ しょうがゆ メロンソーダ アイスティー アイスコーヒー
      カフェモカ チャイ`),
    t('dishes', 'たべもの', 1, `
      カレー ラーメン うどん そば すし てんぷら からあげ ハンバーグ ぎょうざ オムライス チャーハン やきそば たこやき
      おこのみやき にくじゃが すきやき しゃぶしゃぶ とんかつ コロッケ グラタン ピザ パスタ スパゲッティ ステーキ
      サンドイッチ ハンバーガー ホットドッグ おにぎり おでん みそしる とんじる ちゃわんむし たまごやき やきとり エビフライ
      シチュー ドリア リゾット パエリア タコス ナポリタン オムレツ カツどん おやこどん てんどん ぎゅうどん うなじゅう
      ちらしずし てまきずし いなりずし ひやしちゅうか つけめん もんじゃやき ミネストローネ ポトフ ビーフシチュー
      ロールキャベツ やきにく やきざかな さしみ なっとう おぞうに ぞうすい おかゆ チヂミ ビビンバ サラダ ナン トースト`),
    t('sweets', 'おかし', 1, `
      ケーキ プリン ゼリー クッキー チョコレート アイスクリーム ソフトクリーム ドーナツ マカロン シュークリーム ワッフル
      パンケーキ ホットケーキ マドレーヌ タルト パイ クレープ ババロア ティラミス カステラ どらやき だいふく おはぎ だんご
      ようかん せんべい おかき あられ まんじゅう わらびもち もなか かりんとう かきごおり あめ ガム グミ キャラメル
      マシュマロ ポテトチップス ポップコーン ビスケット クラッカー バームクーヘン モンブラン ロールケーキ チーズケーキ
      ショートケーキ シャーベット ジェラート わたあめ こんぺいとう たいやき いまがわやき くずもち みたらしだんご ちんすこう
      カヌレ スコーン ブラウニー マフィン エクレア パフェ あんみつ みつまめ おしるこ ぜんざい`),
    t('sports', 'スポーツ', 1, `
      サッカー やきゅう テニス ゴルフ すいえい じゅうどう けんどう からて すもう ボクシング バレーボール バスケ ラグビー
      ハンドボール たっきゅう バドミントン マラソン りくじょう スキー スケート スノーボード サーフィン ボウリング ビリヤード
      アーチェリー フェンシング レスリング カーリング ホッケー ソフトボール クリケット ゲートボール ヨット カヌー ボート
      トライアスロン ドッジボール なわとび たいそう ダンス ヨガ クライミング スカッシュ ラクロス セパタクロー きゅうどう
      あいきどう なぎなた しんたいそう ボブスレー リュージュ ばじゅつ けいりん`),
    t('instruments', 'がっき', 0, `
      ピアノ ギター バイオリン チェロ フルート トランペット トロンボーン ホルン チューバ サックス クラリネット オーボエ
      ファゴット ハープ ドラム タンバリン カスタネット トライアングル シンバル もっきん てっきん ハーモニカ リコーダー
      オルガン アコーディオン ウクレレ マンドリン バンジョー シタール しゃみせん こと しゃくはち たいこ わだいこ びわ ふえ
      すず オカリナ マラカス コントラバス ビオラ ピッコロ ティンパニ シロフォン マリンバ ビブラフォン ベース キーボード
      シンセサイザー ユーフォニアム コルネット チャルメラ ほらがい`),
    t('stationery', 'ぶんぼうぐ', 1, `
      えんぴつ けしごむ ボールペン シャープペン じょうぎ ものさし はさみ のり セロハンテープ ホッチキス クリップ がびょう
      ふでばこ ノート メモちょう ふせん マーカー けいこうペン いろえんぴつ クレヨン えのぐ ふで すずり すみ コンパス
      ぶんどき カッター したじき バインダー ファイル クリアファイル ペンケース しゅうせいえき スタンプ はんこ インク ふうとう
      びんせん ルーズリーフ スケッチブック がようし おりがみ でんたく じしゃく ガムテープ わゴム てちょう ラベル しおり
      まんねんひつ サインペン ゴムいん`),
    t('school', 'がっこうにあるもの', 1, `
      こくばん チョーク つくえ いす きょうかしょ ランドセル たいいくかん プール こうてい きょうしつ としょしつ ほけんしつ
      しょくいんしつ おんがくしつ りかしつ げたばこ てつぼう すべりだい ブランコ ジャングルジム うんどうじょう こくばんけし
      ちきゅうぎ じかんわり きゅうしょく ほうき ちりとり ぞうきん バケツ チャイム せんせい にゅうがくしき そつぎょうしき
      うんどうかい れんらくちょう しゅくだい テスト つうしんぼ けいじばん ろうか かいだん まど こうしゃ じんたいもけい
      けんびきょう ビーカー フラスコ とびばこ マット ボール`),
    t('kitchen', 'だいどころにあるもの', 0, `
      なべ フライパン ほうちょう まないた おたま しゃもじ さいばし フライがえし ボウル ざる おろしがね ピーラー れいぞうこ
      でんしレンジ すいはんき トースター ミキサー ケトル やかん きゅうす ちゃわん おわん さら コップ マグカップ はし
      スプーン フォーク ナイフ エプロン スポンジ せんざい ふきん しょうゆ さとう しお こしょう みそ あぶら タッパー ラップ
      アルミホイル オーブン ガスコンロ かんきせん じゃぐち しょっきだな ミトン ポット どなべ`),
    t('vehicles', 'のりもの', 1, `
      くるま じてんしゃ バス でんしゃ しんかんせん ひこうき ふね ヘリコプター タクシー トラック パトカー しょうぼうしゃ
      バイク スクーター ロケット ヨット モノレール ちかてつ ろめんでんしゃ ケーブルカー ロープウェイ ショベルカー ブルドーザー
      クレーンしゃ ダンプカー いかだ カヌー ボート フェリー せんすいかん ききゅう ひこうせん スケートボード いちりんしゃ
      じんりきしゃ ベビーカー そり トロッコ きかんしゃ オートバイ キックボード ゴンドラ リヤカー ジェットき ゆうらんせん`),
    t('jobs', 'しょくぎょう', 0, `
      いしゃ かんごし せんせい けいさつかん しょうぼうし だいく パンや コック パイロット うんてんし べんごし さっか がか
      まんがか かしゅ はいゆう びようし りようし のうか けんちくか エンジニア プログラマー デザイナー カメラマン
      アナウンサー ほいくし じゅういし やくざいし はいしゃ ゆうびんや けんきゅうしゃ しゃちょう ぎんこういん おまわりさん
      ピアニスト マジシャン ダンサー モデル ほんやくか つうやく しんぶんきしゃ パティシエ ソムリエ バリスタ にわし
      せいゆう えいがかんとく まいこ はなや`),
    t('countries', 'くにのなまえ', 0, `
      にほん アメリカ イギリス フランス ドイツ イタリア スペイン ロシア ちゅうごく かんこく インド ブラジル カナダ メキシコ
      オーストラリア エジプト ケニア タイ ベトナム フィリピン インドネシア マレーシア シンガポール トルコ ギリシャ スイス
      オランダ ベルギー スウェーデン ノルウェー フィンランド デンマーク ポーランド ポルトガル アルゼンチン チリ ペルー
      コロンビア キューバ ジャマイカ モンゴル ネパール イラン イラク サウジアラビア カタール ナイジェリア ガーナ モロッコ
      アイルランド アイスランド ウクライナ オーストリア ハンガリー チェコ ブータン カンボジア ラオス ミャンマー スリランカ
      マダガスカル エチオピア タンザニア`),
    t('prefectures', 'とどうふけん', 0, `
      ほっかいどう あおもり いわて みやぎ あきた やまがた ふくしま いばらき とちぎ ぐんま さいたま ちば とうきょう かながわ
      にいがた とやま いしかわ ふくい やまなし ながの ぎふ しずおか あいち みえ しが きょうと おおさか ひょうご なら
      わかやま とっとり しまね おかやま ひろしま やまぐち とくしま かがわ えひめ こうち ふくおか さが ながさき くまもと
      おおいた みやざき かごしま おきなわ`),
    t('sea', 'うみのいきもの', 1, `
      イルカ クジラ サメ エイ タコ イカ カニ エビ ヒトデ クラゲ ウニ ナマコ イソギンチャク サンゴ ラッコ アザラシ ペンギン
      ウミガメ マグロ カツオ サケ タイ ヒラメ カレイ フグ アジ サバ イワシ サンマ ブリ ウツボ アンコウ タツノオトシゴ
      カクレクマノミ チンアナゴ マンボウ ジンベエザメ シャチ オットセイ ホタテ アサリ ハマグリ サザエ アワビ カキ ウミウシ
      ヤドカリ シーラカンス ダイオウイカ トビウオ カジキ ハリセンボン クリオネ ホヤ`),
    t('insects', 'むし', 1, `
      カブトムシ クワガタ チョウ トンボ セミ ホタル テントウムシ バッタ コオロギ スズムシ カマキリ アリ ハチ ミツバチ ハエ
      ゴキブリ クモ ダンゴムシ ミミズ ケムシ アオムシ イモムシ カミキリムシ カメムシ アメンボ ゲンゴロウ タガメ ミズスマシ
      モンシロチョウ アゲハチョウ シジミチョウ キリギリス クツワムシ マツムシ ヒグラシ ツクツクボウシ アブラゼミ ミンミンゼミ
      カナブン コガネムシ オニヤンマ シロアリ ムカデ ゲジゲジ ノミ ダニ スズメバチ ホタルガ カイコ ミノムシ`),
    t('birds', 'とり', 0, `
      スズメ カラス ハト ツバメ ニワトリ ヒヨコ アヒル ガチョウ ハクチョウ ツル サギ ペンギン フクロウ ワシ タカ ハヤブサ
      トンビ キツツキ ウグイス メジロ シジュウカラ ヒバリ カモメ カモ オウム インコ ダチョウ フラミンゴ クジャク キジ
      ライチョウ コウノトリ トキ カワセミ ペリカン ハチドリ オオハシ カッコウ ホトトギス ムクドリ ヒヨドリ ウズラ
      シチメンチョウ エミュー オシドリ カナリア ブンチョウ コンドル ハゲワシ`),
    t('flowers', 'はな', 0, `
      さくら うめ ばら ゆり きく ひまわり チューリップ あさがお すみれ たんぽぽ コスモス あじさい カーネーション ラベンダー
      パンジー つばき ききょう なのはな スイセン ツツジ サツキ ハイビスカス ガーベラ マリーゴールド シクラメン ポインセチア
      アネモネ カスミソウ スズラン ボタン シャクヤク ふじ はす すいれん もくれん クレマチス デイジー フリージア ダリア
      サボテン ヒヤシンス アマリリス ナデシコ リンドウ ヒガンバナ ネモフィラ ブーゲンビリア ラン シロツメクサ レンゲ
      アヤメ ショウブ キンモクセイ`),
    t('body', 'からだのぶぶん', 1, `
      あたま かお まゆげ まつげ ほっぺ あご くび かた うで ひじ てくび ゆび つめ むね おなか せなか こし おしり あし ひざ
      かかと つまさき ひたい くちびる した のど ほね きんにく しんぞう はい ちょう かんぞう のう けつえき ひふ
      かみのけ おへそ わきのした ふくらはぎ ふともも てのひら あしのうら はな くち みみ まぶた こめかみ てあし おやゆび
      こゆび くすりゆび なかゆび ひとさしゆび`),
    t('home', 'かぐ・かでん', 0, `
      テレビ れいぞうこ せんたくき そうじき エアコン せんぷうき ストーブ こたつ ソファ ベッド たんす ほんだな つくえ いす
      テーブル カーテン じゅうたん ドライヤー アイロン でんわ パソコン プリンター とけい かがみ ライト シャンデリア
      かしつき じょしつき ふとん まくら もうふ ざぶとん しょっきだな ハンガー ゴミばこ カーペット スピーカー ラジオ
      ゲームき しょくせんき ホットプレート でんきポット ドレッサー`),
    t('clothes', 'ふく・みにつけるもの', 1, `
      シャツ ズボン スカート ワンピース ジャケット コート セーター パーカー マフラー てぶくろ ぼうし くつ くつした
      サンダル ブーツ スニーカー ネクタイ ベルト めがね うでどけい ネックレス イヤリング ゆびわ パジャマ きもの ゆかた
      はかま エプロン レインコート ながぐつ ジーンズ ベスト カーディガン ブラウス ポロシャツ パンツ リュック ハンカチ
      マスク ストール ヘアピン カチューシャ スリッパ げた ぞうり タイツ レギンス`),
    t('summer', 'なつといえば', 1, `
      うみ プール すいか かきごおり はなび せみ ひまわり あさがお うちわ せんぷうき かとりせんこう ゆかた なつまつり
      ぼんおどり きもだめし おばけやしき かいすいよく すなはま うきわ ビーチボール サングラス むぎわらぼうし なつやすみ
      しゅくだい ラジオたいそう キャンプ バーベキュー カブトムシ ほたる にゅうどうぐも ゆうだち たいふう ひやけ あせ
      ふうりん そうめん ひやしちゅうか ラムネ アイス おぼん たなばた すいかわり ねったいや ひがさ`),
    t('winter', 'ふゆといえば', 1, `
      ゆき ゆきだるま スキー スケート こたつ ストーブ マフラー てぶくろ ニットぼう おでん なべ みかん クリスマス
      サンタクロース トナカイ おしょうがつ おせち おもち はつもうで としこし ねんがじょう おおみそか かがみもち たこあげ
      こま かるた ゆきがっせん つらら しもばしら こおり とうみん やきいも あまざけ カイロ ゆたんぽ せつぶん まめまき
      ふゆやすみ オリオンざ かまくら おとしだま ゆきかき`),
    t('town', 'まちのたてもの', 0, `
      えき びょういん がっこう こうえん としょかん ゆうびんきょく ぎんこう こうばん しょうぼうしょ スーパー コンビニ パンや
      ほんや はなや くすりや デパート レストラン カフェ えいがかん すいぞくかん どうぶつえん ゆうえんち
      はくぶつかん びじゅつかん じんじゃ おてら ホテル くうこう みなと スタジアム たいいくかん しやくしょ せんとう おんせん
      ラーメンや すしや カラオケ ゲームセンター ほいくえん ようちえん とうだい ビル タワー`),
    t('colors', 'いろ', 1, `
      あか あお きいろ みどり しろ くろ ちゃいろ むらさき ピンク オレンジ はいいろ きんいろ みずいろ こんいろ
      あいいろ えんじいろ ベージュ クリームいろ レモンいろ ももいろ さくらいろ やまぶきいろ わかくさいろ ふかみどり
      エメラルド ターコイズ ラベンダー ワインレッド ネイビー カーキ セピア マゼンタ シアン あずきいろ だいだいいろ
      うぐいすいろ こげちゃ べにいろ ぐんじょう`),
    t('play', 'あそび・おもちゃ', 1, `
      おにごっこ かくれんぼ なわとび すごろく おりがみ あやとり けんだま こま たこあげ めんこ ビーだま おはじき おてだま
      トランプ パズル つみき ブロック にんぎょう ぬいぐるみ ラジコン ミニカー ヨーヨー ブランコ すべりだい すなば シャボンだま
      じゃんけん しりとり ふくわらい かるた しょうぎ いご チェス ドミノ かざぐるま たけとんぼ ゴムとび けいどろ
      ハンカチおとし いすとりゲーム かんけり だるまおとし うまとび でんしゃごっこ ままごと`),
    t('tools', 'どうぐ', 0, `
      ハンマー ドライバー ペンチ のこぎり かなづち くぎ ねじ スパナ レンチ やすり かんな のみ ドリル メジャー はしご
      スコップ シャベル くわ かま じょうろ ほうき ちりとり バケツ ロープ ひも テープ セメント はけ ペンキ ローラー はかり
      ものさし ルーペ ピンセット てんびん ライター マッチ ろうそく ランタン ちょうつがい ニッパー カッター たわし`),
    t('weather', 'てんき・そら', 0, `
      はれ くもり あめ ゆき かぜ かみなり にじ たいふう きり あられ ひょう みぞれ つゆ おひさま つき ほし くも ゆうやけ
      あさやけ ながれぼし ほっきょくせい オーロラ すいせい わくせい ぎんが うちゅう たいよう まんげつ みかづき しんげつ
      にっしょく げっしょく かすみ しも あおぞら ゆうだち にわかあめ こさめ おおあめ はるいちばん こがらし いなずま
      つむじかぜ`),
    t('cities', 'せかいのとし', 0, `
      パリ ロンドン ニューヨーク ローマ ペキン ソウル シドニー ベルリン モスクワ カイロ バンコク シンガポール ホノルル
      ドバイ ミラノ マドリード リスボン アテネ ウィーン プラハ ブリュッセル アムステルダム ストックホルム ヘルシンキ ベネチア
      フィレンツェ ナポリ ジュネーブ バルセロナ イスタンブール ムンバイ デリー ハノイ マニラ ジャカルタ タイペイ ホンコン
      シャンハイ メルボルン トロント バンクーバー シカゴ ボストン ロサンゼルス リマ メキシコシティ ナイロビ ケープタウン
      ダブリン ワルシャワ ブダペスト ペナン`),
    t('red', 'あかいもの', 1, `
      りんご いちご トマト ポスト しょうぼうしゃ ゆうひ もみじ さくらんぼ きんぎょ ザリガニ カニ ポインセチア ばら ルビー
      あかしんごう ひのまる いちごジャム ケチャップ とうがらし パプリカ うめぼし サンタクロース トマトジュース ランドセル
      あかペン ちょうちん だるま てんとうむし つばき とりい ほのお ラズベリー クランベリー ビーツ たらこ めんたいこ
      マグマ ハート`),
    t('travel', 'いきたいところ', 0, `
      ハワイ うみ やま ゆうえんち どうぶつえん すいぞくかん おんせん キャンプじょう ほっかいどう おきなわ きょうと パリ
      ローマ うちゅう つき プラネタリウム はくぶつかん びじゅつかん としょかん えいがかん カラオケ ゲームセンター
      しょうてんがい フランス イタリア アメリカ エジプト ピラミッド ふじさん ナイアガラ グアム オーストラリア
      ニューヨーク ロンドン ソウル タイ バリとう モルディブ みなみのしま なんきょく ほっきょく`)
  ];

  var en = [
    t('animals', 'Animals（どうぶつ）', 1, `
      CAT DOG LION TIGER BEAR WOLF FOX DEER HORSE ZEBRA GIRAFFE MONKEY PANDA KOALA RABBIT MOUSE RAT HAMSTER SHEEP GOAT PIG
      COW CAMEL HIPPO RHINO OTTER BEAVER BADGER LLAMA ALPACA BISON MOOSE SKUNK RACCOON SLOTH LEMUR GORILLA JAGUAR PUMA
      CHEETAH LEOPARD HYENA JACKAL WALRUS SEAL WHALE DOLPHIN TURTLE LIZARD SNAKE FROG TOAD GECKO IGUANA TAPIR OKAPI MEERKAT
      DONKEY PONY MOLE BAT GERBIL FERRET MINK WEASEL OX YAK BUFFALO ELK COYOTE LYNX OCELOT MULE HARE BOAR LAMB CALF PUPPY
      KITTEN`),
    t('fruits', 'Fruits（くだもの）', 1, `
      APPLE ORANGE BANANA GRAPE PEACH PEAR PLUM CHERRY LEMON LIME MANGO MELON KIWI PAPAYA GUAVA LYCHEE FIG DATE APRICOT
      COCONUT OLIVE QUINCE PRUNE RAISIN DURIAN POMELO CURRANT BERRY AVOCADO KUMQUAT YUZU LOQUAT`),
    t('vegetables', 'Vegetables（やさい）', 1, `
      CARROT ONION POTATO TOMATO CABBAGE LETTUCE SPINACH CELERY PEPPER PUMPKIN SQUASH RADISH TURNIP GARLIC GINGER LEEK
      PEA BEAN CORN KALE BEET OKRA YAM PARSLEY CHARD CRESS SHALLOT CHILI PARSNIP SPROUT LENTIL SOYBEAN TARO LOTUS GOURD`),
    t('food', 'Food（たべもの）', 1, `
      PIZZA PASTA BREAD RICE SUSHI RAMEN CURRY SALAD SOUP STEAK BURGER TACO NOODLE TOAST CHEESE EGG BACON HAM SAUSAGE
      OMELET PANCAKE WAFFLE DONUT COOKIE CAKE PIE MUFFIN BAGEL CANDY JELLY PUDDING STEW TOFU UDON SOBA TEMPURA RISOTTO
      LASAGNA BURRITO NACHOS KEBAB PRETZEL BROWNIE SCONE CREPE POPCORN`),
    t('drinks', 'Drinks（のみもの）', 1, `
      WATER TEA COFFEE MILK JUICE SODA COLA LATTE MOCHA COCOA SHAKE CIDER MATCHA CHAI SOYMILK TONIC PUNCH BROTH LASSI
      KEFIR NECTAR BOBA MALT ICETEA FRAPPE`),
    t('sports', 'Sports（スポーツ）', 1, `
      SOCCER TENNIS GOLF RUGBY BOXING HOCKEY KARATE JUDO SUMO SKIING SURFING DIVING ROWING CYCLING ARCHERY FENCING
      SKATING CRICKET POLO BOWLING DARTS CHESS SAILING RUNNING YOGA DANCE KENDO NETBALL CURLING SQUASH BOCCE`),
    t('colors', 'Colors（いろ）', 1, `
      RED BLUE GREEN YELLOW BLACK WHITE PINK PURPLE ORANGE BROWN GRAY GOLD SILVER NAVY BEIGE CREAM IVORY KHAKI LILAC
      MAROON OLIVE TEAL CYAN MAGENTA INDIGO VIOLET CORAL AMBER LEMON MINT PEACH RUBY SCARLET CRIMSON`),
    t('body', 'Body（からだ）', 1, `
      HEAD FACE EYE EAR NOSE MOUTH LIP TOOTH TONGUE CHEEK CHIN NECK ARM ELBOW WRIST HAND FINGER THUMB NAIL
      CHEST BACK HIP LEG KNEE ANKLE FOOT TOE HEEL HEART LUNG LIVER KIDNEY BRAIN BONE SKIN HAIR BELLY STOMACH`),
    t('clothes', 'Clothes（ふく）', 1, `
      SHIRT SKIRT DRESS JACKET COAT SWEATER HOODIE SCARF GLOVES HAT CAP SHOES SOCKS BOOTS SANDALS TIE BELT JEANS
      SHORTS PAJAMAS KIMONO APRON VEST BLOUSE MITTENS RING WATCH GLASSES BLAZER TIGHTS BEANIE`),
    t('vehicles', 'Vehicles（のりもの）', 1, `
      CAR BUS TRAIN PLANE SHIP BOAT BIKE TAXI TRUCK VAN JEEP TRAM SUBWAY ROCKET YACHT CANOE KAYAK FERRY SCOOTER TRACTOR
      BALLOON SLED WAGON CARAVAN TANKER LORRY JET GLIDER BICYCLE TRAILER AIRSHIP`),
    t('jobs', 'Jobs（しょくぎょう）', 0, `
      DOCTOR NURSE TEACHER POLICE FARMER BAKER CHEF PILOT DRIVER LAWYER WRITER ARTIST SINGER ACTOR DENTIST BARBER
      PLUMBER BUILDER WAITER CASHIER JUDGE MAYOR SAILOR SOLDIER TAILOR POET COACH VET FIREMAN BANKER PAINTER DANCER
      CLERK GUARD MINER BUTCHER`),
    t('countries', 'Countries（くに）', 0, `
      JAPAN CHINA KOREA INDIA FRANCE SPAIN ITALY GERMANY RUSSIA BRAZIL CANADA MEXICO EGYPT KENYA PERU CHILE CUBA
      GREECE TURKEY IRAN IRAQ NEPAL BHUTAN LAOS VIETNAM POLAND NORWAY SWEDEN FINLAND DENMARK IRELAND ICELAND
      AUSTRIA HUNGARY UKRAINE MOROCCO GHANA NIGERIA ANGOLA BOLIVIA PANAMA JAMAICA TAIWAN OMAN QATAR SUDAN MALI FIJI
      TONGA SAMOA`),
    t('instruments', 'Instruments（がっき）', 0, `
      PIANO GUITAR VIOLIN CELLO FLUTE TRUMPET HORN TUBA SAX OBOE BASSOON HARP DRUM BANJO UKULELE ORGAN PICCOLO VIOLA
      BELL GONG CYMBAL MARIMBA SITAR LUTE KAZOO BONGO CONGA TABLA FIDDLE LYRE`),
    t('school', 'School（がっこう）', 1, `
      DESK CHAIR BOOK PEN PENCIL ERASER RULER CHALK BOARD SCHOOL CLASS LESSON TEACHER LIBRARY GYM POOL BELL LOCKER MAP
      GLOBE CRAYON PAINT STAPLER TEST LUNCH RECESS GLUE TAPE FOLDER MARKER STUDENT CAMPUS`),
    t('kitchen', 'Kitchen（だいどころ）', 0, `
      POT PAN KNIFE FORK SPOON PLATE BOWL CUP MUG KETTLE TOASTER OVEN STOVE SINK FRIDGE BLENDER LADLE WHISK GRATER
      SPATULA TONGS APRON SPONGE TEAPOT JAR BOTTLE TRAY NAPKIN`),
    t('weather', 'Weather & Sky（てんき）', 0, `
      SUN RAIN SNOW WIND CLOUD STORM FOG MIST HAIL SLEET THUNDER RAINBOW SUNNY CLOUDY RAINY WINDY STORMY TYPHOON
      TORNADO BREEZE FROST ICE MOON STAR COMET PLANET GALAXY AURORA SUNSET SUNRISE`),
    t('insects', 'Bugs（むし）', 1, `
      ANT BEE WASP FLY MOTH BEETLE CRICKET LOCUST CICADA FIREFLY LADYBUG MANTIS SPIDER TERMITE FLEA LOUSE GNAT HORNET
      EARWIG WEEVIL APHID MAYFLY SNAIL SLUG WORM`),
    t('birds', 'Birds（とり）', 0, `
      CROW DOVE PIGEON SPARROW SWALLOW EAGLE HAWK FALCON OWL DUCK GOOSE SWAN HERON CRANE STORK PARROT PENGUIN OSTRICH
      EMU PEACOCK ROBIN WREN FINCH LARK GULL PELICAN TURKEY CHICKEN QUAIL KIWI TOUCAN PUFFIN MAGPIE RAVEN`),
    t('sea', 'Sea life（うみのいきもの）', 1, `
      FISH SHARK WHALE DOLPHIN SEAL OCTOPUS SQUID CRAB SHRIMP LOBSTER JELLY CORAL CLAM OYSTER MUSSEL TUNA SALMON
      COD EEL RAY ORCA TURTLE URCHIN OTTER WALRUS MANTA PUFFER SARDINE SCALLOP KRILL ANEMONE`),
    t('home', 'Home（いえのなか）', 0, `
      SOFA BED TABLE CHAIR LAMP CLOCK MIRROR CARPET CURTAIN SHELF DRAWER CLOSET PILLOW BLANKET TV RADIO PHONE FAN
      HEATER DOOR WINDOW STAIRS ROOF ATTIC GARAGE BATH SHOWER TOILET TOWEL SOAP`)
  ];

  var FREE = { id: 'free', name: 'なんでも', kids: false, free: true };
  var FREE_EN = { id: 'free', name: 'Anything（なんでも）', kids: false, free: true };
  function list(mode) { return mode === 'en' ? en : ja; }
  function theme(mode, id) {
    if (id === 'free') return mode === 'en' ? FREE_EN : FREE;
    var L = list(mode);
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }
  return { ja: ja, en: en, FREE: FREE, FREE_EN: FREE_EN, list: list, theme: theme };
});
