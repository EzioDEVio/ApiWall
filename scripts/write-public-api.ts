// Writes ApiWall's public JSON API for the static site: tsx scripts/write-public-api.ts out
// Produces out/api/v1/{index,apis,categories,changes}.json, out/api/v1/apis/<id>.json and
// out/api/v1/categories/<slug>.json from the committed snapshot and changelog.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPublicApi, PUBLIC_API_VERSION } from "../lib/catalog/publicApi";
import { EMPTY_CHANGELOG, type Changelog } from "../lib/catalog/history";
import { SITE_URL } from "../lib/site";
import type { CatalogSnapshot } from "../lib/catalog/types";

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, process.argv[2] ?? "out", "api", PUBLIC_API_VERSION);
const snap = JSON.parse(readFileSync(path.join(root, "data", "catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const logPath = path.join(root, "data", "changelog.json");
const changelog = existsSync(logPath) ? (JSON.parse(readFileSync(logPath, "utf8")) as Changelog) : EMPTY_CHANGELOG;

rmSync(outDir, { recursive: true, force: true });
const files = buildPublicApi(snap, changelog, SITE_URL);
for (const [rel, body] of files) {
  const target = path.join(outDir, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(body));
}
console.log(`✓ Public API: ${files.size} files in ${path.relative(root, outDir)} (${SITE_URL}/api/${PUBLIC_API_VERSION}/)`);
