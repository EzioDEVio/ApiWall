/*
 * Serves ./out the way GitHub Pages does, under a base path:
 *   npm run preview:static            # builds with --base /ApiWall, then serves http://localhost:4173/ApiWall/
 *   node scripts/serve-static.mjs --base /ApiWall --port 4173
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const base = arg("--base", "/ApiWall").replace(/\/$/, "");
const port = Number(arg("--port", "4173"));
if (!existsSync(root)) {
  console.error("✗ No out/ folder. Run `npm run build:static -- --base " + (base || "/") + "` first.");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (base && !url.pathname.startsWith(base)) {
    res.writeHead(302, { location: base + "/" });
    return res.end();
  }
  let rel = decodeURIComponent(url.pathname.slice(base.length)) || "/";
  let file = path.join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(400);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  else if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    return res.end(existsSync(path.join(root, "404.html")) ? readFileSync(path.join(root, "404.html")) : "Not found");
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`✓ Serving out/ like GitHub Pages at http://localhost:${port}${base}/  (Ctrl+C to stop)`));
