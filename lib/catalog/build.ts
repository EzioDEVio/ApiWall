import { parseReadme } from "./parse";
import { MCP_CATEGORY, MCP_CATEGORY_SLUG, normalize, slugify } from "./normalize";
import { assignPlacements, GRID_CELLS, PROVIDER_REGION, SLOTS_PER_ROW, TILE_SIZE } from "./placement";
import { buildMarks, type BrandIcon } from "./marks";
import type { FaviconRecord } from "./favicons";
import { applyAiModels, type AiModelsFile } from "./supplements";
import { applyCommunityLogos, type CommunityLogosFile } from "./community";
import { applyCommunityApis, applyOverrides, type CommunityApisFile, type ListingOverridesFile } from "./requests";
import type { CatalogSnapshot, CategoryInfo, SnapshotSource } from "./types";

// Category → glyph (a Tabler icon name). Glyphs give every category a shape
// cue so the map never relies on colour alone.
export const CATEGORY_GLYPHS: Record<string, string> = {
  animals: "paw", anime: "device-tv", "anti-malware": "shield-check", "art-and-design": "palette",
  "authentication-and-authorization": "lock", blockchain: "link", books: "book", business: "briefcase",
  calendar: "calendar", "cloud-storage-and-file-sharing": "cloud-upload", "continuous-integration": "git-merge",
  cryptocurrency: "currency-bitcoin", "currency-exchange": "arrows-exchange", "data-validation": "checklist",
  development: "code", dictionaries: "vocabulary", "documents-and-productivity": "file-text", email: "mail",
  entertainment: "movie", environment: "leaf", events: "calendar-event", finance: "chart-line",
  "food-and-drink": "tools-kitchen-2", "games-and-comics": "device-gamepad-2", geocoding: "map-pin",
  government: "building-bank", health: "heartbeat", jobs: "briefcase-2", "machine-learning": "brain",
  music: "music", news: "news", "open-data": "database", "open-source-projects": "brand-open-source",
  patent: "certificate", personality: "mood-smile", phone: "phone", photography: "camera",
  programming: "code-dots", "science-and-math": "flask", security: "shield", shopping: "shopping-cart",
  social: "users", "sports-and-fitness": "ball-football", "test-data": "test-pipe", "text-analysis": "text-recognition",
  tracking: "radar", transportation: "bus", "url-shorteners": "link", vehicle: "car", video: "video",
  weather: "cloud-rain", [MCP_CATEGORY_SLUG]: "plug-connected", providers: "building-store", "ai-models": "sparkles",
};
export const FALLBACK_GLYPH = "category";

export interface BuildInput {
  readme: string;
  source: Omit<SnapshotSource, "importedAt">;
  importedAt: string;
  icons: BrandIcon[];
  iconBasis: string;
  previous?: CatalogSnapshot | null;
  favicons?: Record<string, FaviconRecord>;
  aiModels?: AiModelsFile | null;
  /** Approved requests: new APIs and provider listings (data/community-apis.json). */
  communityApis?: CommunityApisFile | null;
  /** Approved requests: corrections and removals (data/listing-overrides.json). */
  overrides?: ListingOverridesFile | null;
  communityLogos?: CommunityLogosFile | null;
  /** Whether a community logo file exists (the importer checks the disk). */
  communityFileExists?: (name: string) => boolean;
  /** Path of the small tile copy for a logo src, if one exists (see scripts/optimize-logos.ts). */
  tileFor?: (src: string) => string | null;
}

export function buildSnapshot({
  readme,
  source,
  importedAt,
  icons,
  iconBasis,
  previous,
  favicons,
  aiModels,
  communityApis,
  overrides,
  communityLogos,
  communityFileExists,
  tileFor,
}: BuildInput): CatalogSnapshot {
  const parsed = parseReadme(readme);
  const normalized = normalize(parsed);
  const warnings = normalized.warnings;
  let listings = normalized.listings;
  const supplements: CatalogSnapshot["supplements"] = [];
  if (aiModels) {
    const r = applyAiModels(listings, aiModels);
    listings = r.listings.sort(
      (a, b) => a.categorySlug.localeCompare(b.categorySlug) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id),
    );
    warnings.push(...r.warnings);
    supplements.push(r.summary);
  }
  // Approved requests: corrections first (they apply to catalog listings), then new listings.
  if (overrides || communityApis) {
    const o = applyOverrides(listings, overrides ?? null);
    const c = applyCommunityApis(o.listings, communityApis ?? null);
    warnings.push(...o.warnings, ...c.warnings);
    listings = c.listings.sort(
      (a, b) => a.categorySlug.localeCompare(b.categorySlug) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id),
    );
  }
  if (parsed.ignoredPromoRows) warnings.push(`${parsed.ignoredPromoRows} promotional table rows outside the catalog were ignored`);

  const counts = new Map<string, number>();
  for (const l of listings) counts.set(l.categorySlug, (counts.get(l.categorySlug) ?? 0) + 1);

  // MCP servers get their own band first; HTTP API categories follow in README order.
  const supplementSlugs = supplements.map((x) => x.slug);
  const categoryOrder = [MCP_CATEGORY_SLUG, ...supplementSlugs, ...parsed.categories.map(slugify)];
  const categories: CategoryInfo[] = [];
  if (counts.has(MCP_CATEGORY_SLUG)) {
    categories.push({ slug: MCP_CATEGORY_SLUG, name: MCP_CATEGORY, kind: "mcp", count: counts.get(MCP_CATEGORY_SLUG)!, glyph: CATEGORY_GLYPHS[MCP_CATEGORY_SLUG]! });
  }
  for (const sup of supplements) {
    if (counts.has(sup.slug)) categories.push({ slug: sup.slug, name: sup.name, kind: "api", count: counts.get(sup.slug)!, glyph: CATEGORY_GLYPHS[sup.slug] ?? FALLBACK_GLYPH });
  }
  for (const name of parsed.categories) {
    const slug = slugify(name);
    if (!counts.has(slug) || categories.some((c) => c.slug === slug)) continue;
    categories.push({ slug, name, kind: "api", count: counts.get(slug)!, glyph: CATEGORY_GLYPHS[slug] ?? FALLBACK_GLYPH });
  }

  const placed = assignPlacements({
    listings,
    categoryOrder,
    previous: previous ? { regions: previous.regions, placements: previous.placements } : undefined,
  });

  const marks = buildMarks(listings, icons, iconBasis, favicons);
  warnings.push(...applyCommunityLogos(marks, listings, communityLogos, communityFileExists));
  if (tileFor)
    for (const m of Object.values(marks)) {
      if (m.type !== "image") continue;
      const t = tileFor(m.src);
      if (t) m.tile = t;
    }
  return {
    schemaVersion: 1,
    source: { ...source, importedAt },
    grid: { cells: GRID_CELLS, tileSize: TILE_SIZE, slotsPerRow: SLOTS_PER_ROW, providerRegion: PROVIDER_REGION },
    categories,
    regions: placed.regions,
    listings,
    placements: placed.placements,
    marks,
    supplements,
    warnings: [...warnings, ...placed.warnings],
  };
}
