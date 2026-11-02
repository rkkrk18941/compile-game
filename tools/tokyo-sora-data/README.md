# 東京そらさんぽ：実際の建物外観を描くためのデータ供給（依頼A）

PLATEAU 等の公式オープンデータから、**テクスチャ付き LOD2 の建物**を、ゲームの実景モデル読込（`tokyo-sora/INTEGRATION.md` v1・`src/real-models.js`）がそのまま読める区画データにするパイプラインです。地形・道路/土地利用の実形状も同じ取得元から作れます（v1 ではまだ読み込まれない追加データ）。

- ゲーム本体（`tokyo-sora/src/`・`tokyo-sora/index.html`）とルートの `package.json` は**変更していません**。
- 座標変換はゲームの `tokyo-sora/src/geo.js` をそのまま読み込んで使います。
- データが無い部分を AI 生成や推測で埋めません。Google 等の写真・ストリートビューも使いません。

## 使い方

```sh
cd tools/tokyo-sora-data
npm ci                                       # このフォルダ専用の依存
node build.mjs --list                        # 定義済みの地区（districts.json）
node build.mjs --district tokyo-station      # PLATEAU配信サービスから最新年度を取得して変換（要ネット接続）
node build.mjs --district hamamatsucho-2020  # 見本地区を再生成（公式GitHub上の実ファイル, SHA-256固定）
node build.mjs --district my-area --bbox 139.762,35.678,139.772,35.686 --name "任意の範囲"
node build.mjs --district my-area --local ~/Downloads/13101_chiyoda-ku_city_2023_citygml_1_op --mesh 53394611
node test.mjs              # オフラインの検証（ゲームの normalizeManifest での受理確認を含む。ルートで npm ci 済みなら）
node test.mjs --browser    # ゲームの real-models.js で同梱の全区画を Chromium に読み込む（playwright）
node test.mjs --live       # 見本地区を実ファイルから作り直し、同梱の GLB・manifest と一致するか確認
```

主なオプション：`--types bldg,brid,frn,tran,luse,dem` / `--min-lod 2`（既定。LOD1だけの建物は既存の押し出しと同等なので含めない）/ `--texel-density 6`（テクスチャ画素密度 px/m の上限）/ `--memory-limit`（1区画の推定メモリ上限、既定10MiB）/ `--chunk-zoom 16` / `--unmatched exclude|include`（下記）/ `--no-replaces` / `--mode compact`（量子化＋meshopt。ゲームにデコーダーを入れる場合用）/ `--offline`。

取得したファイルは `.cache/`（git管理外）に保存します。

確認用ビューア（ゲームの `real-models.js` をそのまま使う）：リポジトリ直下で `npm ci && node serve.js` → `http://localhost:8788/tools/tokyo-sora-data/preview.html`（`?at=経度,緯度` でその地点に立ったときにゲームが読む区画だけを表示）。

## 出力（`tokyo-sora/data/`）

| ファイル | 内容 |
|---|---|
| `manifest.json` | INTEGRATION.md v1：`{version:1, assets:[{id, format:"glb", coordinates:"local-y-up", url, origin:[経度,緯度,0], bbox:[西,南,東,北], source, year, license, bytes, replaces, district}]}`。他の地区の項目は残して置き換える |
| `models/<地区>/<z>-<x>-<y>.glb` | 1区画＝自己完結・非圧縮GLB（拡張なし、テクスチャは JPEG を内包）。中身は原点からの実距離 m（X=東・Y=上・Z=南）、Y は T.P. 標高（原点の標高は0なので二重に加わらない） |
| `districts/<地区>.json` | 記録：取得元URL・SHA-256・整備年度・仕様版・変換元の座標系と標高基準・置換IDの照合結果・区画ごとの三角形数/サイズ/推定メモリ/画素密度（`schema/district-record.schema.json`） |
| `districts/<地区>/terrain/`・`vector/` | 追加データ：PLATEAU 地形（TIN）を地理院 dem_png 互換 PNG に、道路・土地利用を GeoJSON に（v1 では未接続） |
| `README.md` | データ側の説明（座標参照系・標高基準・出典） |

### 区画・メモリ予算（ゲームの読込条件に合わせる）

ゲームは現在地から 900m 以内を近い順に最大6区画・同時2取得・合計 64MiB まで読みます。そこで 1区画を

- Web メルカトル z16（約500m四方）で区切り、建物は切らずに足跡の重心が入る区画へ。三角形 40万・推定メモリの上限を超える区画は z17・z18 に自動分割。
- 推定メモリ（ゲームと同じ式：ファイル＋頂点属性＋インデックス＋テクスチャ幅×高さ×4）を **10MiB 以下**（6区画で約60MiB）。超える場合はその区画のテクスチャだけを縮める。
- テクスチャは PLATEAU の外壁・屋根画像を、使われている範囲だけ切り出して区画単位のアトラスに詰め直す（ページ幅を試して面積最小の詰め方を選ぶ、端の画素を複製した余白付き）。画素密度は上限 6px/m（約17cm/画素）で、予算に応じて区画ごとに下げ、実際の値を記録。
- ファイル 16MiB 以下・地上範囲 1500m 以下（`lib/manifest.mjs` の `validateHandoff` がゲームの `normalizeManifest` と同じ条件で先に検査）。

### 既存表示との置き換え（`replaces`）

INTEGRATION.md のとおり、**既存の建物と確実に同一と確認できた ID だけ**を入れます。ゲームが表示している PLATEAU 2020年度 MVT（`city.js` の `PLATEAU_URL`。届かない環境では同じリポジトリの raw）を z16 で取得し、CityGML の建物ID（`uro:buildingID` または汎用属性「建物ID」）が MVT に実在する建物だけを `P+建物ID`（複数ポリゴンの地物は `#番号` 付きも併記）として載せます。座標が近いだけでは消しません。

ID を確認できなかった建物は、既定（`--unmatched exclude`）では**実景モデルに含めません**（既存表示のまま）。`--unmatched include` で追加できますが、その場合は既存表示と重なる可能性があるので PR に明記してください（記録の `replaces.unmatched` に ID 一覧が入ります）。橋梁・都市設備は既存表示と置き換えずに追加します。

## 調査結果：配信経路の比較

| 経路 | 形式 | 長所 | 注意点 | 採否 |
|---|---|---|---|---|
| **PLATEAU配信サービス CityGML Files API**（`api.plateauview.mlit.go.jp/datacatalog/citygml/m:<メッシュ>`） | メッシュ単位の CityGML 個別ファイル（`assets.cms.plateau.reearth.io`）＋テクスチャ画像 | 必要なメッシュだけ取れる。整備年度・仕様版・LOD・ファイルサイズが分かる。T.P. 標高でゲームの地形とそのまま合う | 試験運用（提供期間・SLA の保証なし、スキーマ変更あり得る） | **採用** |
| G空間情報センターの配布 ZIP | CityGML / 3D Tiles / MVT 等 | 原本。オフラインで再現できる | 市区町村単位で数 GB | `--local` で展開済みフォルダを読む |
| PLATEAU配信サービス 3D Tiles | b3dm/glb（テクスチャ有無・LOD 別） | Cesium でそのまま表示できる | **楕円体高**（日本のジオイド2011で変換済み）なので T.P. の地形と合わせるにはジオイド補正が要る。地心直交座標・Cesium の幾何誤差 LOD 前提。試験運用 | 不採用（ゲームは GLB 区画形式） |
| PLATEAU MVT（道路・土地利用等） | ベクトルタイル | 軽い | 2D・属性の一部のみ | CityGML から直接 GeoJSON にする方を採用 |
| PLATEAU-Terrain / PLATEAU-Ortho | Cesium ion の地形 / 航空写真タイル | — | 地形は Cesium ion のトークンが必要 | 不採用 |
| 地理院タイル（標高・航空写真） | XYZ タイル | ゲームが既に使用 | — | 地形の既定として継続 |

東京駅を含む 3次メッシュ `53394611` を API に問い合わせると、**千代田区・中央区の 2025年度（標準製品仕様書 5.0）**の bldg / brid / frn / tran / luse / dem / veg が返ります。区ごとに別ファイルなので両方を読み、同じ gml:id は1つにまとめます。

参考：[PLATEAU 配信サービス ドキュメント](https://docs.plateauview.mlit.go.jp) ／ [CityGML API](https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/citygml/plateau-citygml.md) ／ [3D Tiles 変換仕様](https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/3d-tiles/specification.md)

## 利用条件・出典

- PLATEAU の 3D 都市モデル：[PLATEAU サイトポリシー](https://www.mlit.go.jp/plateau/site-policy/)（政府標準利用規約準拠・CC BY 4.0 互換。ODC-BY / ODbL での利用も可）。複製・加工・再配布・商用利用が可能。**出典と、加工した旨の記載が条件**で、加工物を国土交通省が作ったように見せてはいけない。
- 表示用の出典文は記録の `sources[].attribution`（例：「「3D都市モデル（Project PLATEAU）東京都23区（2020年度）」（国土交通省）を加工して作成」）。GLB の `asset.copyright` にも入れています。manifest の `source` はデータセット名、`license` は規約名。
- 置換IDの照合に使う MVT（indigo-lab/plateau-tokyo23ku-building-mvt-2020）は PLATEAU 2020年度 CityGML から作られた CC BY 4.0 のタイルで、ゲームが既に表示しているもの。照合にだけ使い、配信物には含めません。

## 年度・対象範囲

- 東京都23区は 2020年度に全域（LOD1、一部 LOD2・テクスチャ）が整備され、その後に区ごとの更新（2023・2025年度など）が公開されています。`plateau-api` は市区町村ごとに**最新年度**を選びます（`--year 2023` で固定も可）。
- 整備年度以降の解体・新築・改修は反映されません（例：見本地区の 2020年度データには、建て替えが進んでいる世界貿易センタービルが旧形状のまま含まれます）。
- 置換IDは 2020年度 MVT との照合なので、2023年度以降のデータで ID が変わった建物は既定では含まれません（`--unmatched include` で追加は可能）。

## 見本地区：浜松町・竹芝・芝公園（`hamamatsucho-2020`）

この作業環境から PLATEAU 配信サービス・G空間情報センターに接続できなかったため、**Project PLATEAU 公式 GitHub（PLATEAU GIS Converter）にテスト用として同梱されている東京都23区 2020年度の実ファイル**（3次メッシュ 53393680 の建築物、zstd 圧縮、SHA-256 固定）から作りました。

- 1,483棟のうち LOD2 の 993棟から、既存表示と ID が一致した **970棟**を 8区画（計 約3.8MB、約11万三角形、区画あたり推定メモリ最大 3.8MiB）に。ID を確認できなかった LOD2 の 23棟と LOD1 だけの 490棟は含めず、既存表示のままです。
- **テクスチャ画像はこのファイルに同梱されていないため形状のみ**（無テクスチャ面の色は描画上の既定値）。地形・道路・土地利用も含みません。
- ゲームの `real-models.js` で全区画が読み込まれ、座標・メモリの検査に通り、998個の既存建物IDが非表示対象になることを Chromium で確認しています（`node test.mjs --browser`）。`node test.mjs --live` で同じ取得元から作り直すと、同梱の GLB・manifest とバイト単位で一致します。

テクスチャ付きの変換（アトラス化・UV写像・メモリ予算による縮小）、地形（TIN→標高PNG）、道路・土地利用の GeoJSON 化も、公式 SDK に同梱された実データ（画像付き）で動作とゲームの読込・描画を確認しましたが、それらの SDK テストデータは属性などがテスト用に改変されているため配信物には含めていません。

**東京駅周辺（2025年度・テクスチャ付き）を作るには**、ネットにつながる環境で `node build.mjs --district tokyo-station` を1回実行し、生成された `tokyo-sora/data/` をコミットしてください。

## 未対応・未検証

- PLATEAU 配信サービスからの実取得（`plateau-api`）は、API のチュートリアル・OpenAPI 定義・実際の応答の形を確認したうえで模擬応答でテストしたのみ。2025年度データでの変換は未実行です。
- 植生（veg：単独木・植被）は未対応。LOD3（`--max-lod 3`）は実データで未検証。LOD4（屋内）は読み飛ばします。
- 元データの裏返った面の自動補正はしていません。衝突判定は既存の地図輪郭のまま（INTEGRATION.md）で、LOD2 形状との差は統合側の確認が必要です。
- スマートフォン実機での表示・メモリは未確認（ヘッドレス Chromium の SwiftShader で確認）。
