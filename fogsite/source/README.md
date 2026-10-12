# MIST MAZE 霧の迷宮

遺跡役と探検家の非対称推理ゲーム（FOGSITE のルールに準拠したデジタル版）。
スマホ・PC のブラウザで、オンライン対戦（2〜4人）と CPU 対戦が遊べます。

## 公開のしかた

`dist/index.html` は画像・音・スクリプトをすべて内蔵した 1 ファイルです。
GitHub Pages なら `fogsite/index.html` をこのファイルで置き換えるだけで動きます
（旧版の `p0.txt`〜`p3.txt` などの分割ファイルは不要になります）。

## ビルド

```sh
npm install
node build.mjs --minify            # → dist/index.html（約 390KB）
node build.mjs                     # 読みやすい未圧縮版
node build.mjs --minify --artifact # claude.ai の Artifact 用（CPU 対戦のみ）
```

## 構成

| ディレクトリ | 内容 |
| --- | --- |
| `src/core/rules.js` | ルールエンジン（ホスト端末だけが状態を持つ） |
| `src/core/view.js` | 役割ごとに見える情報だけを切り出すスナップショット |
| `src/core/solver.js` | 探検家の情報だけで配置を列挙する推理ソルバー（作戦盤の矛盾表示・CPU が使用） |
| `src/core/mazegen.js` | 迷宮の自動生成とおすすめ迷宮 |
| `src/ai/` | CPU 探検家・CPU 遺跡役（やさしい／ふつう／むずかしい） |
| `src/net/` | ホスト権威型の通信（PeerJS / WebRTC）、再接続、状態の保存と復元 |
| `src/ui/` | 画面（Preact） |
| `src/audio/`, `src/fx/` | 合成音（Web Audio）、霧の WebGL 背景、パーティクル |

予測カード（休憩／警戒）は各自の端末がハッシュだけを送り、攻撃されたとき
（または遺跡役の手番の終わり）に初めて中身を公開します。ホスト端末でも他人のカードは先に見えません。

## オンライン対戦の通信

既定では PeerJS の公開シグナリングサーバーを使います。自前の PeerServer を使う場合は
URL に `?peerhost=example.com&peerport=443&peerpath=/myapp&peersecure=1` を付けます。
同じブラウザの複数タブで試すときは `?net=local`（タブごとに `&cid=好きなID`）。

## テスト

```sh
npm test                              # ルールとソルバーの単体テスト
node tests/sim.mjs 30 normal normal 2 # CPU 同士の自動対戦（回数 遺跡役 探検家 人数）
```

`tests/e2e/` は Playwright によるブラウザ通しテストです（フォント読み込みのパスは環境に合わせて変更してください）。

### CPU の強さの目安（従来版の時間・探検家 2 人、各 30〜40 戦の自動対戦）

| | 遺跡役 やさしい | 遺跡役 ふつう | 遺跡役 むずかしい |
| --- | --- | --- | --- |
| 探検家 ふつう の脱出率 | 100% | 約 70% | 約 40% |

| | 探検家 やさしい | 探検家 ふつう | 探検家 むずかしい |
| --- | --- | --- | --- |
| 遺跡役 ふつう に対する脱出率 | 約 30% | 約 70% | 約 90% |

探検家 3 人や公式（人数別）の時間では、探検家側がより厳しくなります。
