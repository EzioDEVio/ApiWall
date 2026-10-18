/*
 * Maintainer tools for logos that are committed to the repository (and so appear on the
 * static GitHub Pages site too).
 *
 *   npm run logos:add -- "<listing name or id>" <image file> <https source page> [--note "..."]
 *   npm run logos:remove -- "<listing name or id>"
 *   npm run logos:promote      # copy logos approved in /review (data/runtime) into the repo
 *
 * Images must be PNG, JPEG or WebP (checked by their bytes, never SVG), up to 256 KB.
 * Files go to public/marks/community/, records to data/community-logos.json, and the
 * snapshot is rebuilt so tiles pick them up. Commit both afterwards.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { MAX_LOGO_BYTES, sniffImage } from "../lib/providers/validation";
import type { CatalogSnapshot } from "../lib/catalog/types";
import type { CommunityLogosFile } from "../lib/catalog/community";
import type { LogoSuggestion } from "../lib/logos/types";

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "public", "marks", "community");
const jsonPath = path.join(root, "data", "community-logos.json");
const snapshot = JSON.parse(readFileSync(path.join(root, "data", "catalog.snapshot.json"), "utf8")) as CatalogSnapshot;

const fail = (msg: string): never => {
  console.error("✗ " + msg);
  process.exit(1);
};

function load(): CommunityLogosFile {
  return existsSync(jsonPath) ? (JSON.parse(readFileSync(jsonPath, "utf8")) as CommunityLogosFile) : { version: 1, logos: {} };
}
function save(f: CommunityLogosFile) {
  const sorted: CommunityLogosFile = { version: 1, logos: Object.fromEntries(Object.entries(f.logos).sort(([a], [b]) => a.localeCompare(b))) };
  const tmp = jsonPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(sorted, null, 2) + "\n");
  renameSync(tmp, jsonPath);
}
function findListing(query: string) {
  const byId = snapshot.listings.find((l) => l.id === query);
  if (byId) return byId;
  const q = query.trim().toLowerCase();
  const hits = snapshot.listings.filter((l) => l.name.toLowerCase() === q);
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) fail(`"${query}" matches ${hits.length} listings. Use one of these IDs:\n  ${hits.map((h) => `${h.id}  (${h.category})`).join("\n  ")}`);
  const near = snapshot.listings.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 8);
  return fail(`No listing named "${query}".${near.length ? ` Did you mean:\n  ${near.map((h) => `${h.name}  →  ${h.id}`).join("\n  ")}` : ""}`);
}
function store(listingId: string, bytes: Uint8Array): string {
  const kind = sniffImage(bytes);
  if (!kind) fail("The image must be a PNG, JPEG or WebP file (SVG is not accepted).");
  if (bytes.length > MAX_LOGO_BYTES) fail(`The image is ${Math.round(bytes.length / 1024)} KB; the limit is 256 KB.`);
  mkdirSync(dir, { recursive: true });
  for (const old of readdirSync(dir)) if (old.startsWith(listingId + ".")) rmSync(path.join(dir, old));
  const name = `${listingId}.${kind!.ext}`;
  writeFileSync(path.join(dir, name), bytes);
  return name;
}
function rebuild() {
  // Small tile copy first, then the catalog that points at it.
  spawnSync("npx", ["tsx", "scripts/optimize-logos.ts"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  const r = spawnSync("npx", ["tsx", "scripts/import-catalog.ts", "--offline"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) fail("Rebuilding the snapshot failed.");
}
const httpsUrl = (v: string | undefined) => {
  try {
    return !!v && new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

const [cmd, ...args] = process.argv.slice(2);
const noteAt = args.indexOf("--note");
const note = noteAt >= 0 ? (args.splice(noteAt, 2)[1] ?? "").slice(0, 200) : undefined;

if (cmd === "add") {
  const [query, image, source] = args;
  if (!query || !image || !source) fail('Usage: npm run logos:add -- "<listing name or id>" <image file> <https source page>');
  if (!httpsUrl(source)) fail("The source must be the https:// page where the provider publishes this logo.");
  if (!existsSync(image!)) fail(`File not found: ${image}`);
  const l = findListing(query!);
  const file = store(l.id, new Uint8Array(readFileSync(image!)));
  const f = load();
  f.logos[l.id] = { file, listingName: l.name, sourceUrl: source!, approvedAt: new Date().toISOString(), ...(note ? { note } : {}) };
  save(f);
  console.log(`✓ Logo for ${l.name} saved as public/marks/community/${file}`);
  rebuild();
} else if (cmd === "remove") {
  const l = findListing(args[0] ?? fail('Usage: npm run logos:remove -- "<listing name or id>"'));
  const f = load();
  const rec = f.logos[l.id];
  if (!rec) fail(`${l.name} has no community logo.`);
  rmSync(path.join(dir, rec!.file), { force: true });
  delete f.logos[l.id];
  save(f);
  console.log(`✓ Removed the community logo for ${l.name}`);
  rebuild();
} else if (cmd === "promote") {
  const dataDir = path.resolve(root, process.env.TESSERA_DATA_DIR || "data/runtime");
  const storePath = path.join(dataDir, "submissions.json");
  if (!existsSync(storePath)) fail(`Nothing to promote: ${path.relative(root, storePath)} does not exist.`);
  const logos = ((JSON.parse(readFileSync(storePath, "utf8")) as { logos?: LogoSuggestion[] }).logos ?? []).filter((l) => l.status === "approved" && l.file);
  const f = load();
  let added = 0;
  for (const s of logos) {
    const current = f.logos[s.listingId];
    if (current && current.approvedAt >= s.updatedAt) continue;
    const src = path.join(dataDir, "logos", s.file!.file);
    if (!existsSync(src)) {
      console.warn(`  skipped ${s.listingName}: file ${s.file!.file} is missing`);
      continue;
    }
    const tmp = path.join(dir, ".promote.tmp");
    mkdirSync(dir, { recursive: true });
    copyFileSync(src, tmp);
    const file = store(s.listingId, new Uint8Array(readFileSync(tmp)));
    rmSync(tmp, { force: true });
    f.logos[s.listingId] = { file, listingName: s.listingName, sourceUrl: s.sourceUrl, approvedAt: s.updatedAt, ...(s.note ? { note: s.note } : {}) };
    added++;
    console.log(`  + ${s.listingName}`);
  }
  save(f);
  console.log(`✓ ${added} approved logo${added === 1 ? "" : "s"} copied into the repository (${Object.keys(f.logos).length} in total).`);
  rebuild();
} else {
  fail("Usage: npm run logos:add | logos:remove | logos:promote (see the top of scripts/community-logos.ts)");
}
