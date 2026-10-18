/*
 * Static build for GitHub Pages:
 *   npm run build:static                              # site at the domain root
 *   NEXT_PUBLIC_BASE_PATH=/ApiWall npm run build:static  # project page (username.github.io/ApiWall)
 *
 * GitHub Pages serves files only, so server routes (submissions, review, logo uploads)
 * are set aside for this build and restored afterwards. The static site sends people to
 * GitHub issue forms instead. Output: ./out
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stash = path.join(root, ".static-stash");
const SERVER_ONLY = ["app/api", "app/review"];

function restore() {
  for (const rel of SERVER_ONLY) {
    const from = path.join(stash, rel);
    const to = path.join(root, rel);
    if (existsSync(from) && !existsSync(to)) {
      mkdirSync(path.dirname(to), { recursive: true });
      renameSync(from, to);
    }
  }
  if (existsSync(stash)) rmSync(stash, { recursive: true, force: true });
}

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  return r.status ?? 1;
};

restore(); // recover from an interrupted earlier run
let status = run("npx", ["tsx", "scripts/check-data.ts"]);
if (status === 0) {
  try {
    for (const rel of SERVER_ONLY) {
      const from = path.join(root, rel);
      if (!existsSync(from)) continue;
      const to = path.join(stash, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      renameSync(from, to);
    }
    rmSync(path.join(root, "out"), { recursive: true, force: true });
    status = run("npx", ["next", "build"], { NEXT_PUBLIC_STATIC: "1" });
  } finally {
    restore();
  }
}
if (status !== 0) {
  console.error("✗ Static build failed.");
  process.exit(status);
}

// GitHub Pages serves extension-less files as downloads, so give the social preview a .png
// name and point the meta tags at it.
const out = path.join(root, "out");
if (existsSync(path.join(out, "opengraph-image"))) {
  cpSync(path.join(out, "opengraph-image"), path.join(out, "og.png"));
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "_next") walk(p);
      } else if (/\.(html|txt)$/.test(e.name)) {
        const before = readFileSync(p, "utf8");
        const after = before.replace(/\/(opengraph|twitter)-image\?[0-9a-f]+/g, "/og.png");
        if (after !== before) writeFileSync(p, after);
      }
    }
  };
  walk(out);
}

// The catalog the browser loads, and a marker so GitHub Pages serves the _next folder.
cpSync(path.join(root, "data", "catalog.snapshot.json"), path.join(root, "out", "catalog.json"));
writeFileSync(path.join(root, "out", ".nojekyll"), "");
console.log(`✓ Static site written to out/ (base path: ${process.env.NEXT_PUBLIC_BASE_PATH || "/"}).`);
