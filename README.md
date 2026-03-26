# json-image-downloader

JSONファイルから画像パスを抽出し、ブラウザ上でプレビューしながら一括ダウンロードするツール。

Node.js のローカルサーバーを経由するため、CORS の制約を受けずにどのドメインの画像でも取得できる。

## 必要なもの

- Node.js（v14 以上）

外部パッケージは不要。標準モジュールだけで動作する。

## 起動方法

```bash
node server.js
```

ブラウザで http://localhost:3456 を開く。

### オプション

| オプション | デフォルト | 説明 |
|---|---|---|
| `--port` | `3456` | サーバーのポート番号 |
| `--out` | `./downloaded_images` | 画像の保存先ディレクトリ |

```bash
# ポートと保存先を変更する例
node server.js --port 8080 --out ./my_images
```

## 使い方

### 1. JSONファイルを読み込む

画面のドロップゾーンにJSONファイルをドラッグ＆ドロップするか、クリックして選択する。

### 2. 設定を調整する

JSON読み込み後に表示される設定パネルで3つの項目を設定する。

**画像キー**

JSON内の画像パスが入っているプロパティ名を指定する。デフォルトは `avatarPath`。

どの階層にネストされていても再帰的に探索して抽出する。たとえば以下のようなJSONでは、`imgUrl` を指定するだけで2箇所すべてを拾う。

```json
{
  "items": [
    {
      "imgUrl": "assets/img/icons/star.png",
      "variants": {
        "imgUrl": "assets/img/icons/star_light.png"
      }
    }
  ]
}
```

**ベースURL**

画像パスが相対パスの場合、先頭に付与するURLを入力する。

例: `https://example.com/` を指定すると、`assets/img/icons/star.png` は `https://example.com/assets/img/icons/star.png` として取得される。

**保存パス除去**

保存時にパスから取り除くプレフィックスを指定する。デフォルトは空欄（フルパスのまま保存）。

| 元のパス | 保存パス除去 | 保存先 |
|---|---|---|
| `assets/img/icons/star.png` | `assets/img/` | `icons/star.png` |
| `data/photos/2024/summer.jpg` | `data/photos/` | `2024/summer.jpg` |
| `assets/img/icons/star.png` | （空欄） | `assets/img/icons/star.png` |

### 3. プレビューで確認する

設定が完了すると画像のサムネイルがグリッド表示される。クリックで個別に選択/解除できる。

### 4. ダウンロード実行

「選択画像をダウンロード（ローカル保存）」ボタンを押すと、サーバーが画像を取得して `--out` で指定したディレクトリ（デフォルト `./downloaded_images`）に保存する。

進捗バーとログで状況を確認できる。

## 仕組み

```
ブラウザ (UI)
  │
  ├─ GET /          → HTML/CSS/JS を配信
  ├─ GET /proxy     → 画像をサーバー経由で取得（プレビュー表示用）
  └─ POST /download → 画像を取得してローカルディスクに保存
  │
Node.js サーバー (server.js)
  │
  └─ 外部の画像サーバーに直接リクエスト（CORSなし）
```
