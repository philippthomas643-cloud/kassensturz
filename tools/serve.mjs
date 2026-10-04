// Kleiner Testserver: liefert docs/ unter http://localhost:8080/kassensturz/ aus (wie GitHub Pages).
// Aufruf: node tools/serve.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "docs");
const port = +process.argv[2] || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith("/kassensturz/")) { res.writeHead(302, { Location: "/kassensturz/" }); res.end(); return; }
  p = p.slice("/kassensturz".length);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "max-age=600" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log("http://localhost:" + port + "/kassensturz/"));
