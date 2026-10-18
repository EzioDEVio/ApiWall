/*
 * Refreshes data/catalog.snapshot.json from the upstream public-apis README.
 *
 *   npm run catalog:import                  # fetch master from GitHub, fall back to the cached README
 *   npm run catalog:import -- --offline     # rebuild from the cached README only
 *   npm run catalog:import -- --ref <sha>   # pin a specific upstream commit
 *   npm run catalog:import -- --readme path/to/README.md   # import a local file
 *
 * The website never fetches the catalog at runtime; it only reads the snapshot.
 * If the network and the cache are both unavailable the script fails rather
 * than inventing data.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSnapshot, CATEGORY_GLYPHS, FALLBACK_GLYPH } from "../lib/catalog/build";
import type { BrandIcon } from "../lib/catalog/marks";
import type { FaviconManifest, FaviconRecord } from "../lib/catalog/favicons";
import type { AiModelsFile } from "../lib/catalog/supplements";
import type { CommunityLogosFile } from "../lib/catalog/community";
import { carryAddedAt, type Changelog, diffListings, EMPTY_CHANGELOG, recordChange } from "../lib/catalog/history";
import type { CatalogSnapshot } from "../lib/catalog/types";

const REPO = "public-apis/public-apis";
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const cacheDir = path.join(dataDir, "upstream");
const snapshotPath = path.join(dataDir, "catalog.snapshot.json");
const glyphPath = path.join(dataDir, "glyphs.json");

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ref = opt("--ref") ?? "master";
if (!/^[A-Za-z0-9._/-]{1,100}$/.test(ref)) throw new Error("Invalid --ref");

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "tessera-catalog-importer" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

function resolveCommit(): string | null {
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref.toLowerCase();
  try {
    const out = execFileSync("git", ["ls-remote", `https://github.com/${REPO}`, `refs/heads/${ref}`], { timeout: 15000, encoding: "utf8" });
    const sha = out.split(/\s+/)[0];
    return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function writeAtomic(file: string, content: string) {
  const tmp = file + ".tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

async function loadIcons(): Promise<BrandIcon[]> {
  const si = (await import("simple-icons")) as unknown as Record<string, { title?: string; slug?: string; hex?: string; path?: string; source?: string }>;
  return Object.values(si)
    .filter((x): x is Required<typeof x> => !!x && typeof x === "object" && !!x.path && !!x.source && !!x.slug)
    .map((x) => ({ title: x.title, slug: x.slug, hex: x.hex, path: x.path, source: x.source }));
}

function writeGlyphs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tabler = require("@iconify-json/tabler/icons.json") as { icons: Record<string, { body: string }>; aliases?: Record<string, { parent: string }> };
  const names = new Set([...Object.values(CATEGORY_GLYPHS), FALLBACK_GLYPH]);
  const glyphs: Record<string, string[]> = {};
  for (const name of names) {
    const icon = tabler.icons[name] ?? tabler.icons[tabler.aliases?.[name]?.parent ?? ""];
    if (!icon) throw new Error(`Missing Tabler glyph: ${name}`);
    // Keep only path data; the first path in Tabler icons is an invisible bounding box.
    glyphs[name] = [...icon.body.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!).filter((d) => d !== "M0 0h24v24H0z");
  }
  writeAtomic(glyphPath, JSON.stringify(glyphs) + "\n");
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const readmeUrl = `https://raw.githubusercontent.com/${REPO}/${ref}/README.md`;
  const licenseUrl = `https://raw.githubusercontent.com/${REPO}/${ref}/LICENSE`;
  const cachedReadme = path.join(cacheDir, "README.md");
  const cachedLicense = path.join(cacheDir, "LICENSE");
  const cachedMeta = path.join(cacheDir, "meta.json");

  let readme: string;
  let fetchedFrom: "network" | "cache" | "fixture";
  let commit: string | null = null;
  const local = opt("--readme");

  if (local) {
    readme = readFileSync(path.resolve(local), "utf8");
    fetchedFrom = "fixture";
  } else if (!flag("--offline")) {
    try {
      readme = await fetchText(readmeUrl);
      fetchedFrom = "network";
      commit = resolveCommit();
      writeAtomic(cachedReadme, readme);
      try {
        writeAtomic(cachedLicense, await fetchText(licenseUrl));
      } catch (e) {
        console.warn(`! Could not refresh LICENSE (${(e as Error).message}); keeping the cached copy`);
      }
      writeAtomic(cachedMeta, JSON.stringify({ ref, commit, fetchedAt: new Date().toISOString() }, null, 2) + "\n");
    } catch (e) {
      console.warn(`! Upstream fetch failed (${(e as Error).message}); falling back to the cached README`);
      if (!existsSync(cachedReadme)) throw new Error("No cached README at data/upstream/README.md. Connect to the network and run `npm run catalog:import`.");
      readme = readFileSync(cachedReadme, "utf8");
      fetchedFrom = "cache";
    }
  } else {
    if (!existsSync(cachedReadme)) throw new Error("--offline needs data/upstream/README.md");
    readme = readFileSync(cachedReadme, "utf8");
    fetchedFrom = "cache";
  }
  let sourceRef = ref;
  if (fetchedFrom === "cache" && existsSync(cachedMeta)) {
    // Describe the cached copy as what it is, not as the ref that failed to download.
    const meta = JSON.parse(readFileSync(cachedMeta, "utf8")) as { ref: string; commit: string | null };
    commit = meta.commit;
    sourceRef = meta.ref;
  }

  const contentSha256 = createHash("sha256").update(readme).digest("hex");
  const previous: CatalogSnapshot | null = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : null;
  const icons = await loadIcons();

  // Logos fetched by `npm run catalog:logos`, kept only when the file is present.
  const favicons: Record<string, FaviconRecord> = {};
  const manifestPath = path.join(dataDir, "favicons.json");
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as FaviconManifest;
    for (const [id, r] of Object.entries(m.entries ?? {})) {
      if (/^[a-z0-9-]+\.(png|jpg|webp|gif|ico)$/.test(r.file) && existsSync(path.join(root, "public", "marks", r.file))) favicons[id] = r;
    }
  }

  const snapshot = buildSnapshot({
    readme,
    importedAt: new Date().toISOString(),
    previous,
    icons,
    favicons,
    // Maintainer-approved logos committed to the repo (see data/community-logos.json).
    communityLogos: existsSync(path.join(dataDir, "community-logos.json")) ? (JSON.parse(readFileSync(path.join(dataDir, "community-logos.json"), "utf8")) as CommunityLogosFile) : null,
    communityFileExists: (name: string) => existsSync(path.join(root, "public", "marks", "community", name)),
    // Small WebP copies made by `npm run logos:optimize` (same naming as scripts/optimize-logos.ts).
    tileFor: (src: string) => {
      const rel = src.replace(/^\/marks\//, "");
      const name = rel.replace(/\//g, "__").replace(/\.[a-z]+$/i, ".webp");
      return existsSync(path.join(root, "public", "marks", "tiles", name)) ? `/marks/tiles/${name}` : null;
    },
    // Curated, source-tracked AI Models supplement (see data/ai-models.json).
    aiModels: existsSync(path.join(dataDir, "ai-models.json")) ? (JSON.parse(readFileSync(path.join(dataDir, "ai-models.json"), "utf8")) as AiModelsFile) : null,
    iconBasis: "Simple Icons (CC0-1.0 icon data; marks remain trademarks of their owners)",
    source: {
      repo: REPO,
      readmeUrl: `https://raw.githubusercontent.com/${REPO}/${sourceRef}/README.md`,
      ref: sourceRef,
      commit,
      contentSha256,
      fetchedFrom,
      license: {
        name: "MIT",
        url: `https://github.com/${REPO}/blob/master/LICENSE`,
        notice: existsSync(cachedLicense) ? readFileSync(cachedLicense, "utf8").split("\n")[2] ?? "Copyright (c) public-apis" : "Copyright (c) 2022 public-apis",
      },
    },
  });

  if (snapshot.listings.length === 0) throw new Error("Parsed zero listings; refusing to overwrite the snapshot. Has the README format changed?");
  // First-seen dates and the changelog behind "New this week" and the What's new page.
  carryAddedAt(snapshot, previous, snapshot.source.importedAt);
  const change = diffListings(previous, snapshot);
  const changelogPath = path.join(dataDir, "changelog.json");
  const log = existsSync(changelogPath) ? (JSON.parse(readFileSync(changelogPath, "utf8")) as Changelog) : EMPTY_CHANGELOG;
  const updated = recordChange(log, { at: snapshot.source.importedAt, commit: snapshot.source.commit, ...change });
  if (updated !== log || !existsSync(changelogPath)) writeAtomic(changelogPath, JSON.stringify(updated, null, 1) + "\n");
  writeAtomic(snapshotPath, JSON.stringify(snapshot) + "\n");
  writeGlyphs();

  const api = snapshot.listings.filter((l) => l.kind === "api").length;
  const mcp = snapshot.listings.length - api;
  const brand = Object.values(snapshot.marks).filter((m) => m.type === "brand").length;
  const logos = Object.values(snapshot.marks).filter((m) => m.type === "image").length;
  const moved = previous ? snapshot.listings.filter((l) => previous.placements[l.id] && previous.placements[l.id]!.slot !== snapshot.placements[l.id]?.slot).length : 0;
  console.log(`✓ ${api} APIs and ${mcp} MCP servers in ${snapshot.categories.length} categories (${fetchedFrom}${commit ? ", commit " + commit.slice(0, 7) : ""})`);
  console.log(`  ${logos} official logos, ${brand} icon-set brand marks, ${snapshot.listings.length - brand - logos} generated monograms; ${moved} existing tiles moved`);
  for (const s of snapshot.supplements ?? []) console.log(`  ${s.name}: ${s.providers} curated providers, ${s.crossTagged} upstream listings cross-tagged`);
  if (change.added.length || change.removed.length) console.log(`  ${change.added.length} new and ${change.removed.length} removed since the last import (data/changelog.json)`);
  console.log(`  ${snapshot.warnings.length} warnings`);
  for (const w of snapshot.warnings.slice(0, 15)) console.log("  - " + w);
}

main().catch((e) => {
  console.error("✗ " + (e as Error).message);
  process.exit(1);
});
