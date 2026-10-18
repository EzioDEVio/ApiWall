import type { CatalogListing, CatalogSnapshot, IdentityMark } from "./types";
import type { Changelog } from "./history";
import { type LinkHealth, linkState } from "./links";
import { EMPTY_LINK_HISTORY, type LinkHistory } from "./linkHistory";
import { buildPacks } from "./packs";
import { computeStats } from "./stats";
import { buildEntries } from "@/lib/explore/model";

/**
 * ApiWall's public, read-only API (v1): plain JSON files anyone can fetch, built from the same
 * snapshot as the wall. The static site publishes them under /api/v1/; a self-hosted server
 * answers the same paths. Everything here is derived from committed data, so the output for
 * a given snapshot never changes (no clocks, no randomness).
 */
export const PUBLIC_API_VERSION = "v1";

export interface PublicApiItem {
  id: string;
  name: string;
  description: string;
  /** "api" for HTTP APIs, "mcp" for MCP servers. */
  kind: "api" | "mcp";
  category: { slug: string; name: string };
  /** Every category this listing appears in on the wall (its own, plus curated cross-tags such as ai-models). */
  categories: string[];
  /** Auth as written in the source catalog, and ApiWall's normalized reading of it. */
  auth: { listed: string; type: string };
  /** true / false, or null when the catalog does not say (always null for MCP servers). */
  https: boolean | null;
  cors: boolean | null;
  docsUrl: string | null;
  /** Result of ApiWall's weekly check of docs_url. "unchecked" before the first check or when there is no link. */
  docsLink: { status: "reachable" | "unreachable" | "unchecked"; checkedOn: string | null; failingSince: string | null; reason: string | null };
  /** This API's own page on ApiWall. */
  pageUrl: string | null;
  /** The listing on the wall; opens its details. */
  wallUrl: string;
  /** A logo hosted by ApiWall, when one was found on the provider's own site. Marks belong to their owners. */
  logo: { url: string; source: string } | null;
  /** For well-known brands without a downloaded logo: the brand colour and a 24×24 SVG path (Simple Icons data, CC0; marks remain trademarks). */
  brandIcon?: { hex: string; svgPath: string };
  /** When the listing first appeared on ApiWall (null for the original import). */
  addedAt: string | null;
  /** "public-apis" for the community catalog, "apiwall" for ApiWall's curated AI Models entries. */
  origin: "public-apis" | "apiwall";
  aiModel?: { provider: string; models: string; apiHost: string | null; docsUrl: string; checkedOn: string };
  mcp?: { transport: string[]; install: { label: string; url: string }[] };
}

export interface PublicApiMeta {
  api: "ApiWall";
  version: typeof PUBLIC_API_VERSION;
  docs: string;
  source: { catalog: string; commit: string | null; importedAt: string; license: string };
  notice: string;
  count?: number;
}

const NOTICE =
  "Data from the public-apis community catalog (MIT) plus ApiWall's curated AI Models list. ApiWall is independent and not affiliated with public-apis or the listed providers. Confirm terms, pricing and availability with each provider. Logos belong to their owners.";

const tri = (v: string): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

function logoFor(mark: IdentityMark | undefined, site: string): PublicApiItem["logo"] {
  if (!mark || mark.type !== "image") return null;
  return { url: site + (mark.tile ?? mark.src), source: mark.sourceUrl };
}

export function toPublicItem(
  l: CatalogListing,
  mark: IdentityMark | undefined,
  categoryNames: Map<string, string>,
  site: string,
  health?: LinkHealth,
): PublicApiItem {
  const link = linkState(health, l.id, !!l.url);
  const item: PublicApiItem = {
    id: l.id,
    name: l.name,
    description: l.description,
    kind: l.kind,
    category: { slug: l.categorySlug, name: categoryNames.get(l.categorySlug) ?? l.category },
    categories: [l.categorySlug, ...(l.tags ?? []).filter((t) => t !== l.categorySlug)],
    auth: { listed: l.raw.auth, type: l.auth },
    https: l.kind === "mcp" ? null : tri(l.https),
    cors: l.kind === "mcp" ? null : tri(l.cors),
    docsUrl: l.url,
    docsLink:
      link.state === "unchecked"
        ? { status: "unchecked", checkedOn: null, failingSince: null, reason: null }
        : link.state === "reachable"
          ? { status: "reachable", checkedOn: link.checkedAt, failingSince: null, reason: null }
          : { status: "unreachable", checkedOn: link.checkedAt, failingSince: link.since, reason: link.reason },
    pageUrl: l.slug ? `${site}/apis/${l.slug}/` : null,
    wallUrl: `${site}/?api=${encodeURIComponent(l.id)}`,
    logo: logoFor(mark, site),
    ...(mark?.type === "brand" ? { brandIcon: { hex: mark.hex, svgPath: mark.path } } : {}),
    addedAt: l.addedAt ?? null,
    origin: l.origin === "supplement" ? "apiwall" : "public-apis",
  };
  if (l.aiModel)
    item.aiModel = {
      provider: l.aiModel.provider,
      models: l.aiModel.models,
      apiHost: l.aiModel.apiHost,
      docsUrl: l.aiModel.docsUrl,
      checkedOn: l.aiModel.verifiedAt,
    };
  if (l.kind === "mcp") item.mcp = { transport: l.transport ?? [], install: (l.install ?? []).map((i) => ({ label: i.label, url: i.url })) };
  return item;
}

/** Every file of the public API, keyed by its path under /api/v1/ (e.g. "apis.json", "categories/weather.json"). */
export function buildPublicApi(snap: CatalogSnapshot, changelog: Changelog, siteUrl: string, history: LinkHistory = EMPTY_LINK_HISTORY): Map<string, unknown> {
  const site = siteUrl.replace(/\/$/, "");
  const base = `${site}/api/${PUBLIC_API_VERSION}`;
  const meta = (count?: number): PublicApiMeta => ({
    api: "ApiWall",
    version: PUBLIC_API_VERSION,
    docs: `${site}/developers/`,
    source: {
      catalog: `https://github.com/${snap.source.repo}`,
      commit: snap.source.commit,
      importedAt: snap.source.importedAt,
      license: snap.source.license.name,
    },
    notice: NOTICE,
    ...(count === undefined ? {} : { count }),
  });

  const names = new Map(snap.categories.map((c) => [c.slug, c.name]));
  const items = snap.listings
    .map((l) => toPublicItem(l, snap.marks[l.id], names, site, snap.linkHealth))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));
  const categories = snap.categories.map((c) => {
    const members = items.filter((i) => i.categories.includes(c.slug));
    return { slug: c.slug, name: c.name, count: members.length, url: `${base}/categories/${c.slug}.json`, members };
  });

  const files = new Map<string, unknown>();
  files.set("index.json", {
    meta: meta(items.length),
    endpoints: {
      apis: `${base}/apis.json`,
      api: `${base}/apis/{id}.json`,
      categories: `${base}/categories.json`,
      category: `${base}/categories/{slug}.json`,
      changes: `${base}/changes.json`,
      packs: `${base}/packs.json`,
      pack: `${base}/packs/{slug}.json`,
      stats: `${base}/stats.json`,
    },
  });
  files.set("apis.json", { meta: meta(items.length), data: items });
  files.set("categories.json", { meta: meta(categories.length), data: categories.map(({ members: _m, ...c }) => c) }); // eslint-disable-line @typescript-eslint/no-unused-vars
  for (const c of categories) files.set(`categories/${c.slug}.json`, { meta: meta(c.count), category: { slug: c.slug, name: c.name }, data: c.members });
  // One file per API stays small: the full notice and source are in index.json and apis.json.
  for (const i of items) files.set(`apis/${i.id}.json`, { meta: { api: "ApiWall", version: PUBLIC_API_VERSION, docs: `${site}/developers/` }, data: i });
  files.set("changes.json", { meta: meta(changelog.entries.length), data: changelog.entries });

  // Starter packs and catalog stats, from the same facts the site shows.
  const entries = buildEntries(snap, null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const packs = buildPacks(entries);
  files.set("packs.json", {
    meta: meta(packs.length),
    data: packs.map((p) => ({
      slug: p.slug,
      title: p.title,
      blurb: p.blurb,
      rule: p.rule,
      count: p.entries.length,
      url: `${base}/packs/${p.slug}.json`,
      pageUrl: `${site}/packs/${p.slug}/`,
    })),
  });
  for (const p of packs)
    files.set(`packs/${p.slug}.json`, {
      meta: meta(p.entries.length),
      pack: { slug: p.slug, title: p.title, blurb: p.blurb, rule: p.rule, pageUrl: `${site}/packs/${p.slug}/` },
      data: p.entries.map((e) => byId.get(e.id)).filter(Boolean),
    });
  const stats = computeStats(entries, snap.categories, history, changelog);
  files.set("stats.json", { meta: meta(), data: stats });
  // shields.io "endpoint" badges: https://img.shields.io/endpoint?url=<site>/api/v1/badges/apis.json
  const fmt = (n: number) => n.toLocaleString("en");
  files.set("badges/apis.json", { schemaVersion: 1, label: "APIs on the wall", message: fmt(stats.total), color: "16a37f" });
  files.set("badges/categories.json", { schemaVersion: 1, label: "categories", message: fmt(stats.categories), color: "3d3dff" });
  files.set("badges/dead-links.json", {
    schemaVersion: 1,
    label: "dead docs links flagged",
    message: stats.links.checkedAt ? fmt(stats.links.unreachable) : "not checked yet",
    color: "e34948",
  });
  files.set("badges/packs.json", { schemaVersion: 1, label: "starter packs", message: fmt(packs.length), color: "f2702b" });
  return files;
}
