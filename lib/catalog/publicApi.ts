import type { CatalogListing, CatalogSnapshot, IdentityMark } from "./types";
import type { Changelog } from "./history";

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
  /** The listing on the wall; opens its details. */
  wallUrl: string;
  /** A logo hosted by ApiWall, when one was found on the provider's own site. Marks belong to their owners. */
  logo: { url: string; source: string } | null;
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

export function toPublicItem(l: CatalogListing, mark: IdentityMark | undefined, categoryNames: Map<string, string>, site: string): PublicApiItem {
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
    wallUrl: `${site}/?api=${encodeURIComponent(l.id)}`,
    logo: logoFor(mark, site),
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
export function buildPublicApi(snap: CatalogSnapshot, changelog: Changelog, siteUrl: string): Map<string, unknown> {
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
    .map((l) => toPublicItem(l, snap.marks[l.id], names, site))
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
    },
  });
  files.set("apis.json", { meta: meta(items.length), data: items });
  files.set("categories.json", { meta: meta(categories.length), data: categories.map(({ members: _m, ...c }) => c) }); // eslint-disable-line @typescript-eslint/no-unused-vars
  for (const c of categories) files.set(`categories/${c.slug}.json`, { meta: meta(c.count), category: { slug: c.slug, name: c.name }, data: c.members });
  // One file per API stays small: the full notice and source are in index.json and apis.json.
  for (const i of items) files.set(`apis/${i.id}.json`, { meta: { api: "ApiWall", version: PUBLIC_API_VERSION, docs: `${site}/developers/` }, data: i });
  files.set("changes.json", { meta: meta(changelog.entries.length), data: changelog.entries });
  return files;
}
