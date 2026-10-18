/*
 * Downloads each listing's own logo into public/marks/ and records where it
 * came from in data/favicons.json. Run it on a machine with normal internet
 * access, then rebuild the snapshot:
 *
 *   npm run catalog:logos                 # fetch missing logos, then rebuild the snapshot
 *   npm run catalog:logos -- --refresh    # re-fetch everything
 *   npm run catalog:logos -- --retry      # also retry listings that failed before
 *   npm run catalog:logos -- --limit 50   # try a small batch first
 *
 * For each listing it reads the provider's own home page, takes the icon that
 * page declares (largest first; SVG is never used), falls back to /favicon.ico,
 * and for GitHub-hosted projects to the owner's avatar. Files are validated by
 * their bytes, size-limited, and icons shared by many unrelated sites (hosting
 * platform defaults) are discarded.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchListingIcon, findPlatformDefaults, type FaviconManifest, type FaviconRecord } from "../lib/catalog/favicons";
import { hostOf, registrableDomain } from "../lib/catalog/domain";
import type { CatalogSnapshot } from "../lib/catalog/types";

const root = path.resolve(__dirname, "..");
const marksDir = path.join(root, "public", "marks");
const manifestPath = path.join(root, "data", "favicons.json");
const snapshotPath = path.join(root, "data", "catalog.snapshot.json");
if (!existsSync(snapshotPath)) {
  console.error("✗ data/catalog.snapshot.json is missing. Run `npm run catalog:import` first, then `npm run catalog:logos`.");
  process.exit(1);
}
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as CatalogSnapshot;

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const retry = args.includes("--retry");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const CONCURRENCY = 12;

const empty: FaviconManifest = { version: 1, updatedAt: "", entries: {}, misses: {} };
const manifest: FaviconManifest = existsSync(manifestPath) && !refresh ? (JSON.parse(readFileSync(manifestPath, "utf8")) as FaviconManifest) : empty;
manifest.misses ??= {};
mkdirSync(marksDir, { recursive: true });

const todo = snapshot.listings
  .filter((l) => l.url)
  .filter((l) => refresh || !(manifest.entries[l.id] && existsSync(path.join(marksDir, manifest.entries[l.id]!.file))))
  .filter((l) => refresh || retry || !manifest.misses[l.id])
  .slice(0, limit);

console.log(`Fetching logos for ${todo.length} listings (${Object.keys(manifest.entries).length} already saved)…`);

const fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => fetch(url, { ...init, redirect: "follow" });
let done = 0;
let saved = 0;
const startedAt = Date.now();

async function worker(queue: typeof todo) {
  for (;;) {
    const l = queue.shift();
    if (!l) return;
    const result = await fetchListingIcon(l.url, fetcher);
    done++;
    if ("miss" in result) {
      manifest.misses[l.id] = result.miss;
      delete manifest.entries[l.id];
    } else {
      const file = `${l.id}.${result.image.ext}`;
      for (const old of readdirSync(marksDir)) if (old.startsWith(l.id + ".") && old !== file) rmSync(path.join(marksDir, old));
      writeFileSync(path.join(marksDir, file), result.bytes);
      const record: FaviconRecord = {
        file,
        width: result.image.width,
        height: result.image.height,
        sha256: createHash("sha256").update(result.bytes).digest("hex"),
        iconUrl: result.candidate.url,
        pageUrl: result.pageUrl,
        method: result.candidate.method,
        fetchedAt: new Date().toISOString(),
      };
      manifest.entries[l.id] = record;
      delete manifest.misses[l.id];
      saved++;
    }
    if (done % 50 === 0 || done === todo.length) {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      console.log(`  ${done}/${todo.length} checked, ${saved} logos saved (${secs}s)`);
    }
  }
}

async function main() {
  const queue = [...todo];
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  // Drop platform default icons (the same image on many unrelated sites).
  const domainOf = new Map(snapshot.listings.map((l) => [l.id, registrableDomain(hostOf(l.url) ?? l.id)]));
  const defaults = findPlatformDefaults(
    Object.entries(manifest.entries)
      .filter(([, r]) => r.method !== "github-owner")
      .map(([id, r]) => ({ id, sha256: r.sha256, domain: domainOf.get(id) ?? id })),
  );
  for (const id of defaults) {
    const r = manifest.entries[id]!;
    rmSync(path.join(marksDir, r.file), { force: true });
    delete manifest.entries[id];
    manifest.misses[id] = "platform default icon, not the provider's own";
  }

  // Remove files for listings that no longer exist.
  const live = new Set(snapshot.listings.map((l) => l.id));
  for (const id of Object.keys(manifest.entries)) if (!live.has(id)) delete manifest.entries[id];
  const keep = new Set(Object.values(manifest.entries).map((r) => r.file));
  // Only loose files are fetched logos; the community/ folder holds maintainer-approved ones.
  for (const f of readdirSync(marksDir, { withFileTypes: true })) if (f.isFile() && !keep.has(f.name) && f.name !== ".gitkeep") rmSync(path.join(marksDir, f.name));

  manifest.updatedAt = new Date().toISOString();
  const tmp = manifestPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(manifest, null, 1) + "\n");
  renameSync(tmp, manifestPath);

  const total = Object.keys(manifest.entries).length;
  console.log(`✓ ${total} of ${snapshot.listings.length} listings now have a logo file (${defaults.size} platform defaults discarded).`);
  const reasons = new Map<string, number>();
  for (const r of Object.values(manifest.misses)) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  if (reasons.size) console.log("  Not found: " + [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r, n]) => `${n} ${r}`).join(", "));
}

main().catch((e) => {
  console.error("✗ " + (e as Error).message);
  process.exit(1);
});
