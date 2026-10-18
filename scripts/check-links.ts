// Weekly docs-link check: npm run links:check
// Visits every listing's docs link and writes data/link-health.json (only the failures).
// Run by the weekly catalog sync on GitHub's servers; it needs normal internet access.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkLinks, EMPTY_LINK_HEALTH, type LinkHealth, mergeHealth, probeUrl } from "../lib/catalog/links";
import type { CatalogSnapshot } from "../lib/catalog/types";

// If more than this share of links fail at once, the runner's network is the likely problem,
// not the APIs, so nothing is written.
const MAX_FAILED_SHARE = 0.3;

async function main() {
  const root = path.resolve(__dirname, "..");
  const snap = JSON.parse(readFileSync(path.join(root, "data", "catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
  const target = path.join(root, "data", "link-health.json");
  const previous = existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as LinkHealth) : EMPTY_LINK_HEALTH;
  const targets = snap.listings.filter((l) => l.url).map((l) => ({ id: l.id, url: l.url! }));

  const started = Date.now();
  console.log(`Checking ${new Set(targets.map((t) => t.url)).size} docs links…`);
  const { failures, checked } = await checkLinks(targets, (u) => probeUrl(u, fetch as never));
  const failedUrls = new Set(targets.filter((t) => failures.has(t.id)).map((t) => t.url)).size;
  const share = checked ? failedUrls / checked : 0;
  console.log(`  ${failedUrls} of ${checked} links unreachable (${(share * 100).toFixed(1)}%) in ${Math.round((Date.now() - started) / 1000)} s`);
  if (share > MAX_FAILED_SHARE) {
    console.warn(`✗ More than ${MAX_FAILED_SHARE * 100}% failed: probably a network problem on this machine. data/link-health.json was not changed.`);
    return;
  }
  const next = mergeHealth(previous, failures, checked, new Date().toISOString());
  const fixed = Object.keys(previous.unreachable).filter((id) => !next.unreachable[id]).length;
  const broke = Object.keys(next.unreachable).filter((id) => !previous.unreachable[id]).length;
  const tmp = target + ".tmp";
  writeFileSync(tmp, JSON.stringify(next, null, 1) + "\n");
  renameSync(tmp, target);
  console.log(`✓ data/link-health.json: ${Object.keys(next.unreachable).length} unreachable (${broke} newly broken, ${fixed} working again)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
