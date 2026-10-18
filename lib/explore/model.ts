import type { AiModelInfo, AuthKind, CatalogSnapshot, IdentityMark, InstallLink, Placement, TriState } from "@/lib/catalog/types";
import { normalizeAuth } from "@/lib/catalog/normalize";
import { slotToPlacement } from "@/lib/catalog/placement";
import { monogramText } from "@/lib/catalog/marks";
import { COMMUNITY_BASIS } from "@/lib/catalog/community";
import { isRecent } from "@/lib/catalog/history";
import { fnv1a } from "@/lib/catalog/normalize";
import { type AccessStatus, isDisplayableClaim, type PublicProviderPayload, type VerifiedAccessClaim } from "@/lib/providers/types";
import type { PublicLogoOverride } from "@/lib/logos/types";

export const PROVIDER_CATEGORY_SLUG = "providers";

export type EntryMark =
  | Exclude<IdentityMark, { type: "image" }>
  | {
      type: "logo";
      src: string;
      /** Small copy for tiles and cards; the original `src` is used in the details panel. */
      tile?: string;
      title: string;
      fallback: { text: string; seed: number };
      source?: { page: string; basis: string; fetchedAt?: string };
      /** Uploaded and approved through ApiWall's logo review. */
      reviewed?: boolean;
    };

function toEntryMark(m: IdentityMark): EntryMark {
  if (m.type !== "image") return m;
  return {
    type: "logo",
    src: m.src,
    tile: m.tile,
    title: m.title,
    fallback: m.fallback,
    source: { page: m.sourceUrl, basis: m.basis, fetchedAt: m.fetchedAt },
    reviewed: m.basis === COMMUNITY_BASIS,
  };
}

/** One tile / card. Catalog facts and provider-supplied facts are kept in separate fields. */
export interface Entry {
  id: string;
  source: "catalog" | "provider";
  kind: "api" | "mcp";
  name: string;
  description: string;
  category: string;
  categorySlug: string;
  url: string | null;
  raw: { auth: string; https?: string; cors?: string; transport?: string };
  auth: AuthKind;
  https: TriState;
  cors: TriState;
  transport?: string[];
  install?: InstallLink[];
  alsoListedIn?: string[];
  sourceLine?: number;
  /** "supplement" = from ApiWall's curated, source-tracked dataset rather than the upstream catalog. */
  origin: "upstream" | "supplement" | "provider";
  /** Extra category slugs (e.g. "ai-models") from curated cross-tags. Matching is exact. */
  tags: string[];
  aiModel?: AiModelInfo;
  /** When the listing first appeared on the wall (absent for the original import). */
  addedAt?: string;
  placement: Placement | null;
  mark: EntryMark;
  /** Provider-side, reviewed. Never derived from auth/HTTPS/CORS. */
  sponsored: boolean;
  providerName?: string;
  access: AccessStatus;
  claim: VerifiedAccessClaim | null;
  claimProvider?: string;
  search: string;
}

/** A reviewer-approved logo takes the tile; otherwise the snapshot's mark, else a monogram. */
function markFor(id: string, name: string, mark: IdentityMark | undefined, o: PublicLogoOverride | undefined): EntryMark {
  const base: EntryMark = mark ? toEntryMark(mark) : { type: "monogram", text: monogramText(name), seed: fnv1a(id) };
  if (!o) return base;
  const fallback =
    base.type === "monogram" ? { text: base.text, seed: base.seed } : base.type === "logo" ? base.fallback : { text: monogramText(name), seed: fnv1a(id) };
  return {
    type: "logo",
    src: o.src,
    title: name,
    fallback,
    source: { page: o.sourceUrl, basis: "Approved by a ApiWall reviewer", fetchedAt: o.approvedAt },
    reviewed: true,
  };
}

/** True when the tile shows a real logo or brand mark rather than a generated monogram. */
export const hasLogo = (e: Entry) => e.mark.type !== "monogram";

export function buildEntries(snapshot: CatalogSnapshot, providers: PublicProviderPayload | null): Entry[] {
  const claims = new Map<string, { claim: VerifiedAccessClaim; provider: string }>();
  const overrides = new Map((providers?.logoOverrides ?? []).map((o) => [o.listingId, o]));
  for (const c of providers?.catalogClaims ?? []) if (isDisplayableClaim(c.claim)) claims.set(c.listingId, { claim: c.claim, provider: c.providerName });

  const entries: Entry[] = snapshot.listings.map((l) => {
    const c = claims.get(l.id);
    return {
      id: l.id,
      source: "catalog",
      kind: l.kind,
      name: l.name,
      description: l.description,
      category: l.category,
      categorySlug: l.categorySlug,
      url: l.url,
      raw: l.raw,
      auth: l.auth,
      https: l.https,
      cors: l.cors,
      transport: l.transport,
      install: l.install,
      alsoListedIn: l.alsoListedIn,
      sourceLine: l.sourceLine,
      origin: l.origin ?? "upstream",
      tags: l.tags ?? [],
      aiModel: l.aiModel,
      addedAt: l.addedAt,
      placement: snapshot.placements[l.id] ?? null,
      mark: markFor(l.id, l.name, snapshot.marks[l.id], overrides.get(l.id)),
      sponsored: false, // catalog listings are never sponsored; sponsorship applies to reviewed provider tiles only
      access: c ? c.claim.status : "unknown",
      claim: c?.claim ?? null,
      claimProvider: c?.provider,
      search: `${l.name} ${l.description} ${l.aiModel ? `${l.aiModel.provider} ${l.aiModel.models}` : ""}`.toLowerCase(),
    };
  });

  for (const p of providers?.listings ?? []) {
    const claim = isDisplayableClaim(p.claim) ? p.claim : null;
    const mono = { text: monogramText(p.name), seed: fnv1a(p.id) };
    entries.push({
      id: p.id,
      source: "provider",
      kind: "api",
      name: p.name,
      description: p.description,
      category: p.category,
      categorySlug: PROVIDER_CATEGORY_SLUG,
      url: p.url,
      raw: { auth: p.auth, https: p.https, cors: p.cors },
      auth: normalizeAuth(p.auth),
      https: p.https,
      cors: p.cors,
      origin: "provider",
      tags: [],
      placement: slotToPlacement(p.id, p.slot),
      mark: p.logo ? { type: "logo", src: p.logo, title: p.name, fallback: mono } : { type: "monogram", ...mono },
      sponsored: p.sponsored,
      providerName: p.providerName,
      access: claim ? claim.status : "unknown",
      claim,
      search: `${p.name} ${p.description} ${p.providerName}`.toLowerCase(),
    });
  }
  return entries;
}

export interface Filters {
  q: string;
  category: string; // slug or ""
  auth: "" | "none" | "apiKey" | "oauth" | "other";
  https: "" | TriState;
  cors: "" | TriState;
  access: "" | AccessStatus;
  kind: "" | "api" | "mcp" | "provider";
  logo: "" | "has" | "missing";
  /** "yes": only listings that appeared in the last 7 days. */
  fresh: "" | "yes";
  /** "yes": only the visitor's saved APIs (applied by the page, which knows the saved set). */
  saved: "" | "yes";
}

export const EMPTY_FILTERS: Filters = { q: "", category: "", auth: "", https: "", cors: "", access: "", kind: "", logo: "", fresh: "", saved: "" };
export const NEW_DAYS = 7;

export const isFiltered = (f: Filters) => Object.values(f).some((v) => v !== "");

/** Exact category membership: the listing's own (normalized) category slug, or a curated tag. Never a substring match. */
export const inCategory = (e: Entry, slug: string) => e.categorySlug === slug || e.tags.includes(slug);

/**
 * The one filter used by the map, the list, the result count and the category counts.
 * Every active criterion must hold (AND).
 */
export function matches(e: Entry, f: Filters, terms: string[] = searchTerms(f.q)): boolean {
  if (f.category && !inCategory(e, f.category)) return false;
  if (f.kind === "provider" ? e.source !== "provider" : f.kind && (e.kind !== f.kind || e.source !== "catalog")) return false;
  if (f.auth) {
    const a = e.auth === "x-mashape-key" || e.auth === "user-agent" || e.auth === "unknown" ? "other" : e.auth;
    if (a !== f.auth) return false;
  }
  if (f.https && e.https !== f.https) return false;
  if (f.cors && e.cors !== f.cors) return false;
  if (f.access && e.access !== f.access) return false;
  if (f.logo && hasLogo(e) !== (f.logo === "has")) return false;
  if (f.fresh && !isRecent(e.addedAt, Date.now(), NEW_DAYS)) return false;
  for (const t of terms) if (!e.search.includes(t)) return false;
  return true;
}

export const searchTerms = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  const terms = searchTerms(f.q);
  return entries.filter((e) => matches(e, f, terms));
}

/**
 * Result counts per category for the current filters *other than* the category itself,
 * so each row in the category list says how many results choosing it would show.
 * `all` is the count for "All APIs".
 */
export function categoryCounts(entries: Entry[], f: Filters): { all: number; bySlug: Map<string, number> } {
  const rest = filterEntries(entries, { ...f, category: "" });
  const bySlug = new Map<string, number>();
  const bump = (slug: string) => bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1);
  for (const e of rest) {
    bump(e.categorySlug);
    for (const t of e.tags) if (t !== e.categorySlug) bump(t);
  }
  return { all: rest.length, bySlug };
}
