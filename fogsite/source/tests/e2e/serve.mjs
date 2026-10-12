// tiny static server for dist/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2] || 'dist'); const port = Number(process.argv[3] || 8790);
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const fp = path.join(root, p); if (!fp.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (e, d) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'content-type': fp.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(d); });
}).listen(port, () => console.log('serving', root, port));
