#!/usr/bin/env node

/**
 * json-image-downloader (server + UI)
 *
 * ローカルサーバーを起動し、ブラウザでプレビュー＆一括ダウンロードを行う。
 * サーバー側で画像を取得するのでCORS制約なし。
 *
 * 使い方:
 *   node server.js [--port 3456] [--out ./downloaded_images]
 *
 * ブラウザで http://localhost:3456 を開く
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ---- Args ----
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const PORT = parseInt(getArg("--port", "3456"), 10);
const OUT_DIR = getArg("--out", "./downloaded_images");

// ---- HTTP helpers ----
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const doRequest = (targetUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      const c = targetUrl.startsWith("https") ? https : http;
      c.get(targetUrl, { timeout: 15000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          return doRequest(new URL(res.headers.location, targetUrl).href, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
        .on("error", reject)
        .on("timeout", function () { this.destroy(); reject(new Error("Timeout")); });
    };
    doRequest(url);
  });
}

function saveToDisk(imgPath, buffer) {
  // "images/parts/avatar/" 以降のパスだけを使う
  const marker = "images/parts/avatar/";
  const idx = imgPath.indexOf(marker);
  const relativePath = idx !== -1 ? imgPath.substring(idx + marker.length) : path.basename(imgPath);
  const dest = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  return dest;
}

// ---- Inline HTML ----
const HTML = /*html*/ `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JSON Image Downloader</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+JP:wght@400;600;700&display=swap');

  :root {
    --bg: #0e0e12;
    --surface: #18181f;
    --surface2: #22222d;
    --border: #2a2a38;
    --text: #e4e4ef;
    --text-dim: #8888a0;
    --accent: #6ee7b7;
    --accent-dim: #2d6b55;
    --danger: #f87171;
    --info: #60a5fa;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans JP', 'JetBrains Mono', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  .app { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 {
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.6rem; font-weight: 700;
    margin-bottom: 0.25rem; color: var(--accent);
  }
  .subtitle { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 2rem; }

  /* Drop Zone */
  .drop-zone {
    border: 2px dashed var(--border); border-radius: 12px;
    padding: 3rem 2rem; text-align: center; cursor: pointer;
    transition: all 0.25s; background: var(--surface);
  }
  .drop-zone:hover, .drop-zone.dragover {
    border-color: var(--accent); background: var(--surface2);
  }
  .drop-zone.dragover { box-shadow: 0 0 30px rgba(110,231,183,0.1); }
  .drop-zone-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
  .drop-zone-text { font-size: 0.95rem; color: var(--text-dim); }
  .drop-zone-text strong { color: var(--accent); }
  .drop-zone input { display: none; }

  /* Config */
  .config-panel { display:none; margin-top:1.5rem; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.25rem 1.5rem; }
  .config-panel.visible { display:block; }
  .config-row { display:flex; align-items:center; gap:1rem; flex-wrap:wrap; }
  .config-row label { font-size:0.8rem; color:var(--text-dim); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap; }
  .config-row input[type="text"] {
    flex:1; min-width:200px; background:var(--surface2); border:1px solid var(--border);
    border-radius:8px; padding:0.6rem 0.85rem; color:var(--text);
    font-family:'JetBrains Mono',monospace; font-size:0.85rem; outline:none; transition:border 0.2s;
  }
  .config-row input[type="text"]:focus { border-color:var(--accent); }
  .config-row input[type="text"]::placeholder { color:var(--text-dim); opacity:0.6; }
  .key-path-hint { width:100%; font-size:0.75rem; color:var(--text-dim); margin-top:0.35rem; font-family:'JetBrains Mono',monospace; }

  /* Stats */
  .stats-bar {
    display:none; margin-top:1.25rem; padding:0.85rem 1.25rem; background:var(--surface);
    border:1px solid var(--border); border-radius:10px;
    font-family:'JetBrains Mono',monospace; font-size:0.82rem; color:var(--text-dim);
    gap:1.5rem; flex-wrap:wrap; align-items:center; justify-content:space-between;
  }
  .stats-bar.visible { display:flex; }
  .stats-bar .stat-val { color:var(--accent); font-weight:700; }

  /* Actions */
  .actions { display:none; margin-top:1.25rem; gap:0.75rem; flex-wrap:wrap; }
  .actions.visible { display:flex; }
  .btn {
    font-family:'JetBrains Mono',monospace; font-size:0.82rem; font-weight:600;
    padding:0.65rem 1.4rem; border:none; border-radius:8px; cursor:pointer; transition:all 0.2s;
  }
  .btn-primary { background:var(--accent); color:var(--bg); }
  .btn-primary:hover { filter:brightness(1.15); transform:translateY(-1px); }
  .btn-primary:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
  .btn-secondary { background:var(--surface2); color:var(--text); border:1px solid var(--border); }
  .btn-secondary:hover { border-color:var(--accent-dim); }

  /* Progress */
  .progress-area { display:none; margin-top:1.25rem; }
  .progress-area.visible { display:block; }
  .progress-track { height:6px; background:var(--surface2); border-radius:3px; overflow:hidden; }
  .progress-fill { height:100%; width:0%; background:var(--accent); border-radius:3px; transition:width 0.15s; }
  .progress-text { font-family:'JetBrains Mono',monospace; font-size:0.78rem; color:var(--text-dim); margin-top:0.4rem; }

  /* Grid */
  .grid-area { display:none; margin-top:1.75rem; }
  .grid-area.visible { display:block; }
  .grid-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; }
  .grid-header h2 { font-family:'JetBrains Mono',monospace; font-size:1rem; font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:0.75rem; }
  .card {
    background:var(--surface); border:1px solid var(--border); border-radius:10px;
    overflow:hidden; transition:all 0.2s; cursor:pointer; position:relative;
  }
  .card:hover { border-color:var(--accent-dim); transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.3); }
  .card.selected { border-color:var(--accent); }
  .card.selected::after {
    content:'✓'; position:absolute; top:6px; right:6px; width:22px; height:22px;
    background:var(--accent); color:var(--bg); border-radius:50%;
    display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700;
  }
  .card.error { border-color:var(--danger); opacity:0.5; }
  .card-img { width:100%; aspect-ratio:1; object-fit:contain; background:var(--surface2); display:block; }
  .card-img-placeholder {
    width:100%; aspect-ratio:1; background:var(--surface2);
    display:flex; align-items:center; justify-content:center; color:var(--text-dim); font-size:0.7rem;
  }
  .card-info {
    padding:0.5rem 0.6rem; font-family:'JetBrains Mono',monospace; font-size:0.65rem;
    color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }

  /* Log */
  .log-area { display:none; margin-top:1.5rem; }
  .log-area.visible { display:block; }
  .log-area summary { font-family:'JetBrains Mono',monospace; font-size:0.8rem; color:var(--text-dim); cursor:pointer; margin-bottom:0.5rem; }
  .log-box {
    background:var(--surface); border:1px solid var(--border); border-radius:8px;
    padding:0.75rem 1rem; max-height:200px; overflow-y:auto;
    font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--text-dim); line-height:1.7;
  }
  .log-box .err { color:var(--danger); }
  .log-box .ok { color:var(--accent); }

  .select-toggle {
    font-family:'JetBrains Mono',monospace; font-size:0.78rem; color:var(--info);
    cursor:pointer; background:none; border:none; text-decoration:underline; text-underline-offset:2px;
  }
  .select-toggle:hover { color:var(--accent); }

  .server-status {
    display:inline-block; margin-left:1rem; font-size:0.75rem;
    padding:0.2rem 0.6rem; border-radius:6px;
    background:var(--accent-dim); color:var(--accent);
    font-family:'JetBrains Mono',monospace;
  }
</style>
</head>
<body>
<div class="app">
  <h1>⬇ JSON Image Downloader <span class="server-status">Server Mode</span></h1>
  <p class="subtitle">JSONファイルから画像URLを抽出 → サーバー経由でプレビュー＆ローカル保存</p>

  <div class="drop-zone" id="dropZone">
    <div class="drop-zone-icon">📂</div>
    <div class="drop-zone-text"><strong>JSONファイルをドロップ</strong>するか、クリックして選択</div>
    <input type="file" id="fileInput" accept=".json">
  </div>

  <div class="config-panel" id="configPanel">
    <div class="config-row">
      <label>画像キー</label>
      <input type="text" id="keyPath" value="avatarPath" placeholder="avatarPath">
      <label>ベースURL</label>
      <input type="text" id="baseUrl" placeholder="https://example.com/" value="">
    </div>
    <div class="key-path-hint">
      キーを変更するとJSON内の別プロパティを参照できます。ネスト対応: <code>front.avatarPath</code>
    </div>
  </div>

  <div class="stats-bar" id="statsBar">
    <span>検出: <span class="stat-val" id="statTotal">0</span> 件</span>
    <span>選択中: <span class="stat-val" id="statSelected">0</span> 件</span>
    <span>保存済: <span class="stat-val" id="statSaved">0</span> 件</span>
    <span>エラー: <span class="stat-val" id="statErrors" style="color:var(--danger)">0</span> 件</span>
  </div>

  <div class="actions" id="actionsBar">
    <button class="btn btn-primary" id="btnDownload">選択画像をダウンロード（ローカル保存）</button>
    <button class="btn btn-secondary" id="btnReload">再読み込み</button>
  </div>

  <div class="progress-area" id="progressArea">
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
    <div class="progress-text" id="progressText">0 / 0</div>
  </div>

  <div class="grid-area" id="gridArea">
    <div class="grid-header">
      <h2>プレビュー</h2>
      <button class="select-toggle" id="btnSelectAll">すべて選択</button>
    </div>
    <div class="grid" id="grid"></div>
  </div>

  <div class="log-area" id="logArea">
    <details>
      <summary>ログを表示</summary>
      <div class="log-box" id="logBox"></div>
    </details>
  </div>
</div>

<script>
(() => {
  const $ = id => document.getElementById(id);
  const dropZone=$('dropZone'), fileInput=$('fileInput'), configPanel=$('configPanel');
  const keyPathInput=$('keyPath'), baseUrlInput=$('baseUrl');
  const statsBar=$('statsBar'), actionsBar=$('actionsBar');
  const progressArea=$('progressArea'), progressFill=$('progressFill'), progressText=$('progressText');
  const gridArea=$('gridArea'), grid=$('grid'), logArea=$('logArea'), logBox=$('logBox');
  const btnDownload=$('btnDownload'), btnReload=$('btnReload'), btnSelectAll=$('btnSelectAll');

  let jsonData = null;
  let items = [];
  let allSelected = true;
  let savedCount = 0;

  // --- Drop & File ---
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if(e.target.files[0]) loadFile(e.target.files[0]); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const f=e.dataTransfer.files[0];
    if(f && f.name.endsWith('.json')) loadFile(f);
  });

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        jsonData = JSON.parse(e.target.result);
        configPanel.classList.add('visible');
        log('JSON読み込み完了: ' + file.name, 'ok');
        extractAndRender();
      } catch(err) { log('JSONパースエラー: ' + err.message, 'err'); }
    };
    reader.readAsText(file);
  }

  // --- Debounced re-extract ---
  let debounce;
  keyPathInput.addEventListener('input', () => { clearTimeout(debounce); debounce=setTimeout(()=>{ if(jsonData) extractAndRender(); },400); });
  baseUrlInput.addEventListener('input', () => { clearTimeout(debounce); debounce=setTimeout(()=>{ if(jsonData) extractAndRender(); },400); });

  // --- Extract ---
  function extractPaths(data, key) {
    const paths = [];
    function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); }
      else if (node && typeof node === 'object') {
        if (typeof node[key] === 'string' && node[key].length > 0) paths.push(node[key]);
        if (key.includes('.')) {
          const val = key.split('.').reduce((o,k)=>(o&&o[k]!==undefined)?o[k]:undefined, node);
          if (typeof val === 'string' && val.length > 0) paths.push(val);
        }
        Object.entries(node).forEach(([k,v]) => {
          if (k === key) return;
          if (typeof v === 'object' && v !== null) walk(v);
        });
      }
    }
    walk(data);
    return [...new Set(paths)];
  }

  function extractAndRender() {
    const keyPath = keyPathInput.value.trim() || 'avatarPath';
    const paths = extractPaths(jsonData, keyPath);
    items = paths.map(p => ({ path:p, selected:true, el:null, error:false }));
    allSelected = true; savedCount = 0;
    btnSelectAll.textContent = 'すべて解除';
    log('キー "'+keyPath+'" から ' + paths.length + ' 件の画像パスを検出', 'ok');
    renderGrid(); updateStats();
    statsBar.classList.add('visible');
    actionsBar.classList.add('visible');
    gridArea.classList.add('visible');
    logArea.classList.add('visible');
  }

  // --- Grid ---
  function renderGrid() {
    grid.innerHTML = '';
    const base = baseUrlInput.value.trim();
    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card selected';
      item.el = card;
      const fullUrl = base ? new URL(item.path, base).href : item.path;
      // プレビューはサーバーのプロキシ経由
      const img = document.createElement('img');
      img.className = 'card-img';
      img.loading = 'lazy';
      img.src = '/proxy?url=' + encodeURIComponent(fullUrl);
      img.alt = item.path;
      img.onerror = () => {
        item.error = true;
        card.classList.add('error');
        const ph = document.createElement('div');
        ph.className = 'card-img-placeholder'; ph.textContent = '読込失敗';
        img.replaceWith(ph);
        updateStats();
      };
      card.appendChild(img);

      const info = document.createElement('div');
      info.className = 'card-info';
      info.textContent = item.path.split('/').pop();
      info.title = item.path;
      card.appendChild(info);

      card.addEventListener('click', () => {
        item.selected = !item.selected;
        card.classList.toggle('selected', item.selected);
        updateStats();
      });
      grid.appendChild(card);
    });
  }

  // --- Stats ---
  function updateStats() {
    $('statTotal').textContent = items.length;
    $('statSelected').textContent = items.filter(i=>i.selected).length;
    $('statSaved').textContent = savedCount;
    $('statErrors').textContent = items.filter(i=>i.error).length;
    btnDownload.disabled = items.filter(i=>i.selected && !i.error).length === 0;
  }

  // --- Select All ---
  btnSelectAll.addEventListener('click', () => {
    allSelected = !allSelected;
    items.forEach(item => { item.selected=allSelected; item.el.classList.toggle('selected',allSelected); });
    btnSelectAll.textContent = allSelected ? 'すべて解除' : 'すべて選択';
    updateStats();
  });

  // --- Download (server-side save) ---
  btnDownload.addEventListener('click', async () => {
    const selected = items.filter(i => i.selected && !i.error);
    if (!selected.length) return;
    const base = baseUrlInput.value.trim();
    btnDownload.disabled = true;
    progressArea.classList.add('visible');
    let done = 0;
    const total = selected.length;
    savedCount = 0;

    for (const item of selected) {
      const fullUrl = base ? new URL(item.path, base).href : item.path;
      const filename = item.path.split('/').pop();
      try {
        const resp = await fetch('/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fullUrl, path: item.path })
        });
        const result = await resp.json();
        if (result.ok) {
          savedCount++;
          log('✓ ' + filename + ' → ' + result.dest, 'ok');
        } else {
          log('✗ ' + filename + ': ' + result.error, 'err');
        }
      } catch (err) {
        log('✗ ' + filename + ': ' + err.message, 'err');
      }
      done++;
      progressFill.style.width = ((done/total)*100) + '%';
      progressText.textContent = done + ' / ' + total;
      updateStats();
    }
    btnDownload.disabled = false;
    log('完了: ' + savedCount + '/' + total + ' 件保存', 'ok');
  });

  // --- Reload ---
  btnReload.addEventListener('click', () => { if(jsonData) extractAndRender(); });

  // --- Log ---
  function log(msg, type='') {
    const line = document.createElement('div');
    if(type) line.className = type;
    line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }
})();
</script>
</body>
</html>
`;

// ============================================================
// Server
// ============================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- Serve HTML ---
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  // --- Image proxy (for preview) ---
  if (url.pathname === "/proxy") {
    const imgUrl = url.searchParams.get("url");
    if (!imgUrl) {
      res.writeHead(400); res.end("Missing url param");
      return;
    }
    try {
      const buf = await fetchBuffer(imgUrl);
      // Guess content type from extension
      const ext = path.extname(new URL(imgUrl).pathname).toLowerCase();
      const mimeMap = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp", ".svg":"image/svg+xml" };
      res.writeHead(200, {
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(502); res.end(err.message);
    }
    return;
  }

  // --- Download & save to disk ---
  if (url.pathname === "/download" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { url: imgUrl, path: imgPath } = JSON.parse(body);
        const buf = await fetchBuffer(imgUrl);
        const dest = saveToDisk(imgPath, buf);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, dest }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("  \\x1b[36m⬇ json-image-downloader\\x1b[0m");
  console.log("  \\x1b[32mサーバー起動\\x1b[0m http://localhost:" + PORT);
  console.log("  保存先: " + path.resolve(OUT_DIR));
  console.log("");
  console.log("  ブラウザで上のURLを開いてください");
  console.log("  Ctrl+C で終了");
  console.log("");
});
