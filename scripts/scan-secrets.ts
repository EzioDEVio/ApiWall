/*
 * Scans source files and the built client bundle for anything that looks like
 * a credential, checks that server-only configuration never reaches the
 * browser bundle, and checks that no API route forwards requests to other hosts.
 *
 *   npm run build && npm run check:secrets
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { findSecrets } from "../lib/security/secrets";

const root = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "upstream"]);
// Test files contain deliberately fake keys to prove the detector works.
const ALLOW = [/^tests\//, /^lib\/security\/secrets\.ts$/, /^playwright\.config\.ts$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|json|md|css|env|example)$/.test(name) || name.startsWith(".env")) out.push(p);
  }
  return out;
}

const problems: string[] = [];

// 1. Source files.
let scanned = 0;
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (ALLOW.some((r) => r.test(rel))) continue;
  if (rel === "data/glyphs.json") continue; // icon path data
  scanned++;
  const text = readFileSync(file, "utf8");
  for (const f of findSecrets({ [rel]: text }, { entropy: false })) problems.push(`${rel}: looks like a ${f.kind}`);
  if (/^\.env(\.|$)/.test(path.basename(file)) && !rel.endsWith(".env.example")) problems.push(`${rel}: environment file in the repository`);
}

// 2. Built client bundle: no secret-shaped strings and no server-only configuration.
const staticDir = path.join(root, ".next", "static");
let bundleFiles = 0;
if (existsSync(staticDir)) {
  const files: string[] = [];
  const collect = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) collect(p);
      else if (n.endsWith(".js") || n.endsWith(".css")) files.push(p);
    }
  };
  collect(staticDir);
  const forbidden = ["REVIEWER_TOKEN_SHA256", "REVIEW_SESSION_SECRET", "TESSERA_DATA_DIR", "createHmac", "timingSafeEqual", "submissions.json"];
  for (const f of files) {
    bundleFiles++;
    const text = readFileSync(f, "utf8");
    for (const word of forbidden) if (text.includes(word)) problems.push(`client bundle ${path.relative(root, f)} contains server-only "${word}"`);
    for (const s of findSecrets({ bundle: text }, { entropy: false })) problems.push(`client bundle ${path.relative(root, f)}: looks like a ${s.kind}`);
  }
} else problems.push(".next/static not found — run `npm run build` first");

// 3. No API route may make outbound requests (which would make it a proxy).
const apiDir = path.join(root, "app", "api");
for (const file of walk(apiDir)) {
  const text = readFileSync(file, "utf8");
  if (/\bfetch\s*\(|\bhttps?\.request\s*\(|axios|undici/.test(text)) problems.push(`${path.relative(root, file)}: makes outbound requests`);
}

if (problems.length) {
  console.error("✗ " + problems.length + " problem(s):\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`✓ No secrets in ${scanned} source files or ${bundleFiles} client bundle files; no server-only config in the bundle; no API route makes outbound requests.`);
