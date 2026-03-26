jsonに書かれた画像をダウンロードするツール。
外部パッケージは不要です。

```
$ node server.js
```
ブラウザで http://localhost:3456 を開いて、あとはJSON読み込み → プレビュー → ダウンロードボタンで ./downloaded_images/ にパス構造を維持して保存されます。


ポートや保存先を変えたい場合は以下のように指定します。

```
$ node server.js --port 8080 --out ./my_images
```
