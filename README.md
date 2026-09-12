<div align="center">

<img src="src/icons/icon-128.png" width="96" alt="PixivMaster のアイコン" />

# PixivMaster

**pixiv のユーザーページに、X.com のメディア閲覧に近い画像ビュワーを追加する Chrome 拡張機能**

[![version](https://img.shields.io/github/package-json/v/NEONS-DESIGN/PixivMaster?color=4ea3d6)](package.json)
[![license](https://img.shields.io/github/license/NEONS-DESIGN/PixivMaster?color=4ea3d6)](LICENSE)
![manifest](https://img.shields.io/badge/manifest-v3-4ea3d6)
![tests](https://img.shields.io/badge/tests-302%20passing-4ea3d6)

</div>

---

## これは何か

pixiv のユーザーページで作品をクリックすると、**ページ遷移せずにその場でモーダルが開きます。**
複数枚の切り替え、うごイラの再生、投稿文・タグ・コメントの閲覧、いいね・ブックマーク・フォローまでモーダルの中で完結します。
閉じれば元のグリッドの、元のスクロール位置に戻ります。

![ビュワーで作品を開いたところ](docs/images/viewer.jpg)

サイドバーには投稿文・タグ・投稿日・各種カウンタ・コメントが並びます。

![サイドバーのコメント表示](docs/images/sidebar-comments.jpg)

## 主な機能

| | |
| --- | --- |
| **モーダルで開く** | グリッドのクリックを奪い、ページ遷移せずに表示する。URL は `/artworks/{id}` へ差し替わるので、リロードや共有もできる |
| **複数枚の切り替え** | `←` `→` と画面端の矢印でページ送り。前後の画像を先読みするので切り替えが速い |
| **作品の移動** | `↑` `↓` でグリッドの前後の作品へ。端まで来たら自動で次のページ分を読み足す |
| **うごイラ** | zip を展開してフレームを組み立て、再生・一時停止に対応 |
| **サイドバー** | 投稿文・タグ・投稿日・いいね/ブックマーク/閲覧数、作者のアイコンとフォローボタン |
| **コメント** | スタンプと絵文字を画像で描画。返信の展開、続きの読み込みに対応 |
| **アクション** | いいね、ブックマーク、フォロー、シェア (X / Facebook / Pawoo / リンクのコピー) |
| **テーマ** | pixiv 本体のダーク/ライト設定に追従する |
| **アクセシビリティ** | フォーカストラップ、`role="dialog"`、グリッドの Tab 順の整理 |

## 対応ブラウザ

Chromium 系 (Chrome / Brave / Edge など) の Manifest V3 に対応したブラウザ。Chrome 120 以上を想定しています。

## インストール

現在ストアでは配布していません。ビルドして読み込んでください。

```bash
git clone https://github.com/NEONS-DESIGN/PixivMaster.git
cd PixivMaster
npm install
npm run build
```

1. `chrome://extensions/` を開く
2. 右上の **デベロッパーモード** をオンにする
3. **パッケージ化されていない拡張機能を読み込む** を押す
4. 生成された **`dist/`** フォルダを選ぶ

`src/` ではなく `dist/` を選んでください。ビルド後の成果物だけが動きます。

## 使い方

pixiv の**ユーザーページ** (`https://www.pixiv.net/users/{id}` 系) を開き、作品をクリックするだけです。

### キー操作

| キー | 動作 |
| --- | --- |
| `←` `→` | 同じ作品のページ送り |
| `↑` `↓` | 前後の作品へ移動 |
| `Esc` | モーダルを閉じる (シェアメニューが開いていればそちらを先に閉じる) |
| `Tab` | モーダル内をフォーカス移動する (外へ出ない) |

### 設定

ツールバーのアイコンから開きます。変更はその場で保存され、開いているページにもすぐ反映されます。

| 項目 | 既定 | 効果 |
| --- | --- | --- |
| ビュワーを使う | オン | オフにすると pixiv 標準の動作に戻る |
| 画像の解像度 | 標準 (長辺 1200px) | 原寸を選ぶと鮮明になるが読み込みは重くなる |
| 先読み | 前後 3 枚 | 次のページを先に読み込んでおく枚数 |
| サイドバー | オン | 投稿文・コメント・アクションの表示 |
| 余白のクリックで閉じる | オン | 画像の外側をクリックしたときに閉じるか |
| グリッドの Tab 送り | 画像とタイトル | グリッドで Tab を押したときに何をフォーカス順から外すか |

## 注意事項

- **これは非公式の拡張機能です。** pixiv (ピクシブ株式会社) とは一切関係がありません
- **R-18 作品の表示は pixiv 側の設定に従います。** 拡張側で年齢制限を回避することはしません
- **いいねは取り消せません。** これは pixiv の仕様で、押し間違えても元には戻せません
- 作品のダウンロード機能はありません
- `/artworks/{id}` へ直接アクセスしたときや、検索結果・ランキング・タグページでは起動しません

## 開発

| コマンド | 内容 |
| --- | --- |
| `npm run build` | `dist/` を作る |
| `npm run watch` | ビルドの監視モード |
| `npm test` | `node --test` でテストを走らせる |
| `npm run build:icons` | 拡張機能アイコンの PNG を生成する (生成物はコミット済み) |
| `npm run build:symbols` | UI のアイコン図形データを再生成する (生成物はコミット済み) |

バージョンの出どころは `package.json` の `version` だけで、ビルドが `dist/manifest.json` へ差し込みます。

### ドキュメント

| ファイル | 役割 |
| --- | --- |
| [`SPEC.md`](SPEC.md) | この拡張の詳細設計。構成・モジュール仕様・実行時フロー |
| [`SITE_SPEC.md`](SITE_SPEC.md) | pixiv 側の実測仕様書。API・DOM・画像 CDN の調査結果 |
| [`UI_DESIGN_KIT.md`](UI_DESIGN_KIT.md) | UI の指示書。配色トークン・部品・アクセシビリティ |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 実装中に下した判断とその理由 |

## ライセンス

[MIT License](LICENSE)

同梱している第三者の成果物については [`NOTICE`](NOTICE) を参照してください。
