# tokyo-sora/data — 実景モデル（INTEGRATION.md v1）

このフォルダの `manifest.json`・`models/`・`districts/` は `tools/tokyo-sora-data/build.mjs` で作ったデータです。手で編集しません（作り直し方は `tools/tokyo-sora-data/README.md`）。

## 座標参照系・標高基準

| | 変換元（PLATEAU CityGML） | GLB（`models/`） |
|---|---|---|
| 水平 | JGD2011 地理座標（EPSG:6697。2次元のファイルは EPSG:6668）、緯度・経度の順 | `manifest.json` の `origin`（経度・緯度）からの実距離 m。X=東、Z=南 |
| 高さ | T.P.（東京湾平均海面からの標高, m） | Y=T.P.標高そのまま。`origin` の標高は 0 なので、ゲームの配置で標高が二重に加わらない |
| 変換 | — | ゲームの `src/geo.js` で世界座標にしたうえで、`real-models.js` が掛ける倍率 K/cos(原点緯度) の逆をかけた値 |

JGD2011 と WGS84 の差（数十cm以下）は補正していません。楕円体高・ジオイドの変換はしていません（T.P. のまま）。

## 地区

| 地区 | 内容 | 取得元・年度 | 記録 |
|---|---|---|---|
| `hamamatsucho-2020` | 浜松町・竹芝・芝公園の LOD2 建物 970棟（8区画）。テクスチャなし | 「3D都市モデル（Project PLATEAU）東京都23区（2020年度）」の 3次メッシュ 53393680 の建築物ファイル（Project PLATEAU 公式 GitHub に同梱されたもの） | `districts/hamamatsucho-2020.json` |

各地区の記録（`districts/<地区>.json`）に、取得元 URL・SHA-256・整備年度・仕様版・置換IDの照合結果・区画ごとの三角形数・推定メモリ・テクスチャ画素密度があります。

## 出典・利用条件

「3D都市モデル（Project PLATEAU）東京都23区（2020年度）」（国土交通省）を加工して作成。利用条件は [PLATEAU サイトポリシー](https://www.mlit.go.jp/plateau/site-policy/)（政府標準利用規約準拠・CC BY 4.0 互換）。表示する出典文は各記録の `sources[].attribution` にあります。

## 既存表示との関係

- `replaces` は、ゲームが表示している PLATEAU 2020年度 MVT に同じ建物IDが実在すると確認できたものだけです。確認できなかった建物は実景モデルに含めていません（既存表示のまま）。
- 未登録建物の追加・輪郭の変更はありません（同じ2020年度データの LOD2 形状に置き換わるだけ）。衝突判定は既存の地図輪郭のままなので、LOD2 の張り出し・セットバックとの差は残ります。
- 整備年度（2020年度）以降の解体・新築は反映されません。
