// Shared data model. Upstream catalog facts, map placement, identity marks and
// provider-supplied content are deliberately separate types so one can never
// silently overwrite another.

export type ListingKind = "api" | "mcp";

/** Tri-state for HTTPS/CORS. The raw upstream value is always kept alongside. */
export type TriState = "yes" | "no" | "unknown";

export type AuthKind = "none" | "apiKey" | "oauth" | "x-mashape-key" | "user-agent" | "other" | "unknown";

export interface InstallLink {
  label: string;
  url: string;
}

/** A listing exactly as imported from the upstream README, plus normalized helpers. */
export interface CatalogListing {
  id: string;
  kind: ListingKind;
  name: string;
  description: string;
  category: string; // display name ("MCP Servers" for kind === "mcp")
  categorySlug: string;
  url: string | null; // null when the upstream URL could not be parsed as http(s)
  /** Raw cell values from the upstream table, kept verbatim (backticks removed). */
  raw: { auth: string; https?: string; cors?: string; transport?: string };
  auth: AuthKind;
  https: TriState; // "unknown" for MCP entries, which do not list HTTPS
  cors: TriState; // "unknown" for MCP entries, which do not list CORS
  transport?: string[]; // MCP only
  install?: InstallLink[]; // MCP only
  alsoListedIn?: string[]; // other categories that list the same name + URL
  sourceLine: number; // 1-based line in the upstream README (0 for supplemental entries)
  /**
   * "supplement" = added by ApiWall from a curated, source-tracked dataset; "community" = added
   * through an approved request (data/community-apis.json). Neither is in public-apis.
   */
  origin?: "upstream" | "supplement" | "community";
  /** For community listings: the approved request it came from. */
  community?: CommunityInfo;
  /** Set when an approved correction changed or confirmed this listing's facts (data/listing-overrides.json). */
  correction?: CorrectionInfo;
  /** Extra category slugs this listing also belongs to (e.g. "ai-models"), set by curated cross-tags. */
  tags?: string[];
  aiModel?: AiModelInfo;
  /** When this listing first appeared on the wall (absent for the original import). */
  addedAt?: string;
  /** Permanent page address: /apis/<slug>/ (see lib/catalog/slugs.ts). */
  slug?: string;
}

export interface CommunityInfo {
  issue: number;
  approvedAt: string; // YYYY-MM-DD
  /** Submitted by someone at the provider (shown as "Submitted by the provider"). */
  providerSubmitted: boolean;
  providerName?: string;
}

export interface CorrectionInfo {
  issue: number;
  approvedAt: string; // YYYY-MM-DD
  fields: string[]; // which facts were changed, e.g. ["url", "auth"]
}

/** Facts checked by ApiWall against a provider's official documentation. */
export interface AiModelInfo {
  provider: string;
  models: string; // model names or families as the docs name them
  authDetail: string;
  apiHost: string | null;
  docsUrl: string;
  verifiedAt: string; // YYYY-MM-DD
}

/** True for listings that come from the public-apis catalog itself. */
export const isUpstream = (l: { origin?: CatalogListing["origin"] }) => !l.origin || l.origin === "upstream";

export interface SupplementSummary {
  slug: string;
  name: string;
  file: string;
  about: string;
  providers: number;
  crossTagged: number;
  notVerified: { provider: string; url: string; reason: string }[];
}

export interface CategoryInfo {
  slug: string;
  name: string;
  kind: ListingKind;
  count: number;
  glyph: string; // key into the glyph table, a non-color category cue
}

/** Map placement on the 1000 × 1000 logical-cell grid. */
export interface Placement {
  id: string;
  slot: number; // row-major index into the slot grid
  x: number; // top-left logical cell
  y: number;
  size: number; // footprint edge in logical cells
}

export interface CategoryRegion {
  slug: string;
  start: number; // first slot (inclusive)
  end: number; // last slot (exclusive)
}

export type IdentityMark =
  | {
      type: "brand";
      title: string;
      hex: string; // brand color without '#'
      path: string; // 24 × 24 SVG path data
      basis: string; // why we consider this mark defensible to show
      sourceUrl: string; // where the icon project recorded the mark from
    }
  | {
      type: "image";
      title: string;
      src: string; // same-origin path under /marks
      tile?: string; // small WebP copy for tiles and cards (public/marks/tiles), when one was made
      basis: string;
      sourceUrl: string; // the official page that declared the icon
      iconUrl: string; // where it was downloaded from
      fetchedAt: string;
      fallback: { text: string; seed: number };
    }
  | { type: "monogram"; text: string; seed: number };

export interface SnapshotSource {
  repo: string; // "public-apis/public-apis"
  readmeUrl: string;
  ref: string; // branch or commit the importer requested
  commit: string | null; // resolved commit SHA when available
  contentSha256: string; // hash of the README text that produced this snapshot
  fetchedFrom: "network" | "cache" | "fixture";
  importedAt: string; // ISO timestamp
  license: { name: string; url: string; notice: string };
}

export interface CatalogSnapshot {
  schemaVersion: 1;
  /** Attached when loaded (from data/link-health.json); never stored in the snapshot file. */
  linkHealth?: import("./links").LinkHealth;
  source: SnapshotSource;
  grid: { cells: number; tileSize: number; slotsPerRow: number; providerRegion: { start: number; end: number } };
  categories: CategoryInfo[];
  regions: CategoryRegion[];
  listings: CatalogListing[];
  placements: Record<string, Placement>;
  marks: Record<string, IdentityMark>;
  supplements?: SupplementSummary[];
  warnings: string[];
}
