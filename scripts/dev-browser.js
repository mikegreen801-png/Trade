const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PREVIEW_PORT || 3001);
const upstream = process.env.PREVIEW_TARGET || "http://localhost:3000";
const watchDirs = [
  root,
  path.join(root, "assets"),
  path.join(root, "src", "site")
];

const clients = new Set();

function previewHtml(targetPath) {
  const iframeTarget = `${upstream}${targetPath || "/"}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Day Trader OS Preview</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 500 13px/1.4 system-ui, sans-serif; background: #eef2f7; color: #1f2937; }
    .preview-bar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 10px 14px;
      border-bottom: 1px solid #d9e1ea;
      background: rgba(255,255,255,0.95);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .preview-bar strong { font-weight: 700; }
    .preview-bar a { color: #2563eb; text-decoration: none; }
    iframe {
      display: block;
      width: 100%;
      height: calc(100vh - 49px);
      border: 0;
      background: white;
    }
  </style>
</head>
<body>
  <div class="preview-bar">
    <div><strong>Live Preview</strong> refreshing from <a href="${iframeTarget}" target="_blank" rel="noopener">${iframeTarget}</a></div>
    <div id="previewStatus">Watching for edits…</div>
  </div>
  <iframe id="previewFrame" src="${iframeTarget}"></iframe>
  <script>
    const frame = document.getElementById("previewFrame");
    const status = document.getElementById("previewStatus");
    const source = new EventSource("/__reload");
    source.onmessage = event => {
      status.textContent = "Reloaded " + new Date().toLocaleTimeString();
      frame.src = frame.src.split("#")[0];
    };
  </script>
</body>
</html>`;
}

function notifyReload() {
  for (const response of clients) {
    response.write(`data: reload\\n\\n`);
  }
}

watchDirs.forEach(dir => {
  fs.watch(dir, { recursive: true }, () => notifyReload());
});

const server = http.createServer((req, res) => {
  if (req.url === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("retry: 200\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(previewHtml(req.url === "/" ? "/" : req.url));
});

server.listen(port, () => {
  console.log(`[preview] open http://localhost:${port}`);
});
