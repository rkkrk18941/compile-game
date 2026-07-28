/* ローカル動作確認用の超小型 静的サーバー（依存なし）
   実行: node serve.js  → http://localhost:8788/
   ※ 本番(GitHub Pages)では不要。手元での確認専用。 */
const http = require("http"), fs = require("fs"), path = require("path");
const root = __dirname, port = process.env.PORT || 8788;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const fp = path.join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("404 not found"); return; }
    res.writeHead(200, { "content-type": types[path.extname(fp).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log("serving " + root + " on http://localhost:" + port));
