/*
 * Static build for GitHub Pages:
 *   npm run build:static                              # site at the domain root
 *   npm run build:static -- --base /ApiWall           # project page (username.github.io/ApiWall)
 *   npm run preview:static                            # build like GitHub Pages and serve it locally
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

// `--base /ApiWall` works the same on Windows PowerShell, macOS and Linux.
const argBase = process.argv.indexOf("--base");
if (argBase > 0 && process.argv[argBase + 1]) process.env.NEXT_PUBLIC_BASE_PATH = process.argv[argBase + 1];
const stash = path.join(root, ".static-stash");
const SERVER_ONLY = ["app/api", "app/review"];

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Moves a folder. On Windows a running dev server, editor or antivirus can briefly lock
 * files (EPERM/EBUSY), so retry, then fall back to copy + delete.
 */
function move(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  for (let i = 0; i < 8; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      sleep(250 * (i + 1));
    }
  }
  cpSync(from, to, { recursive: true });
  try {
    rmSync(from, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch (e) {
    rmSync(to, { recursive: true, force: true });
    const err = new Error(
      `Windows would not let the build move ${path.relative(root, from)} (${e.code}).\n` +
        "  Stop `npm run dev` / `npm start` (Ctrl+C in that window), close editors that have the folder open, then run `npm run build:static` again.",
    );
    err.friendly = true;
    throw err;
  }
}

function restore() {
  for (const rel of SERVER_ONLY) {
    const from = path.join(stash, rel);
    const to = path.join(root, rel);
    if (existsSync(from) && !existsSync(to)) move(from, to);
  }
  if (existsSync(stash)) rmSync(stash, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  return r.status ?? 1;
};

let status = 0;
try {
  restore(); // recover from an interrupted earlier run
  status = run("npx", ["tsx", "scripts/check-data.ts"]);
  if (status === 0) {
    try {
      for (const rel of SERVER_ONLY) {
        const from = path.join(root, rel);
        if (existsSync(from)) move(from, path.join(stash, rel));
      }
      rmSync(path.join(root, "out"), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      status = run("npx", ["next", "build"], { NEXT_PUBLIC_STATIC: "1" });
    } finally {
      restore();
    }
  }
} catch (e) {
  console.error("✗ " + (e.friendly ? e.message : e.stack || e.message));
  process.exit(1);
}
if (status !== 0) {
  console.error("✗ Static build failed.");
  process.exit(status);
}

// Never publish an empty site: the export must contain the home page.
if (!existsSync(path.join(root, "out", "index.html"))) {
  console.error("✗ The static export has no out/index.html, so it would publish a 404. Nothing was written for deployment.");
  process.exit(1);
}
// `npm start` needs a server build; mark this one so the start check can say so.
writeFileSync(path.join(root, ".next", "STATIC_EXPORT"), "This .next folder came from `npm run build:static`. Run `npm run build` before `npm start`.\n");

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
if (run("npx", ["tsx", "scripts/write-browser-catalog.ts", "out/catalog.json"]) !== 0) {
  console.error("✗ Could not write out/catalog.json.");
  process.exit(1);
}
writeFileSync(path.join(root, "out", ".nojekyll"), "");
console.log(`✓ Static site written to out/ (base path: ${process.env.NEXT_PUBLIC_BASE_PATH || "/"}).`);
