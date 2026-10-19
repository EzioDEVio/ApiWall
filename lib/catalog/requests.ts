import type { CatalogListing } from "./types";
import { listingId, normalizeAuth, normalizeTri, safeHttpUrl } from "./normalize";

/**
 * Approved requests, committed to the repo by the approval workflow (see .github/workflows/requests.yml):
 *   data/community-apis.json     new APIs and provider listings, each tied to its GitHub issue
 *   data/listing-overrides.json  corrections and removals of existing listings
 * Upstream facts are never edited in place: overrides are applied at build time and every
 * changed listing is marked, so the site can say what was corrected and where it was approved.
 */
export const AUTH_VALUES = ["No", "apiKey", "OAuth", "Unknown"] as const;
export const TRI_VALUES = ["Yes", "No", "Unknown"] as const;
export type AuthValue = (typeof AUTH_VALUES)[number];
export type TriValue = (typeof TRI_VALUES)[number];

export interface CommunityApi {
  issue: number;
  approvedBy: string;
  approvedAt: string; // YYYY-MM-DD
  name: string;
  url: string;
  categorySlug: string;
  description: string;
  auth: AuthValue;
  https: TriValue;
  cors: TriValue;
  providerSubmitted?: boolean;
  providerName?: string;
}
export interface CommunityApisFile {
  version: 1;
  apis: CommunityApi[];
}

export interface ListingOverride {
  issue: number;
  approvedBy: string;
  approvedAt: string;
  hidden?: boolean;
  reason?: string;
  url?: string;
  description?: string;
  categorySlug?: string;
  auth?: AuthValue;
  https?: TriValue;
  cors?: TriValue;
}
export interface ListingOverridesFile {
  version: 1;
  overrides: Record<string, ListingOverride>;
}

export const EMPTY_COMMUNITY_APIS: CommunityApisFile = { version: 1, apis: [] };
export const EMPTY_OVERRIDES: ListingOverridesFile = { version: 1, overrides: {} };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Category slug → display name, from the listings already in the catalog. */
function categoryNames(listings: CatalogListing[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of listings) if (!m.has(l.categorySlug)) m.set(l.categorySlug, l.category);
  return m;
}

/** Applies corrections and removals. Returns the new listings and warnings; never mutates its input. */
export function applyOverrides(listings: CatalogListing[], file: ListingOverridesFile | null): { listings: CatalogListing[]; warnings: string[] } {
  if (!file) return { listings, warnings: [] };
  const warnings: string[] = [];
  const names = categoryNames(listings);
  const byId = new Set(listings.map((l) => l.id));
  for (const id of Object.keys(file.overrides))
    if (!byId.has(id)) warnings.push(`Override for ${id} (request #${file.overrides[id]!.issue}) matches no listing; it is ignored`);
  const out: CatalogListing[] = [];
  for (const l of listings) {
    const o = file.overrides[l.id];
    if (!o) {
      out.push(l);
      continue;
    }
    if (o.hidden) continue; // removed by an approved request
    const next: CatalogListing = { ...l, raw: { ...l.raw } };
    const fields: string[] = [];
    if (o.url !== undefined) {
      const url = safeHttpUrl(o.url);
      if (url) {
        next.url = url;
        fields.push("url");
      } else warnings.push(`Override for ${l.id}: "${o.url}" is not an http(s) link; kept the catalog link`);
    }
    if (o.description !== undefined && o.description.trim()) {
      next.description = o.description.trim();
      fields.push("description");
    }
    if (o.categorySlug !== undefined && o.categorySlug !== l.categorySlug) {
      const name = names.get(o.categorySlug);
      if (name && l.kind === "api") {
        next.categorySlug = o.categorySlug;
        next.category = name;
        fields.push("category");
      } else warnings.push(`Override for ${l.id}: unknown category "${o.categorySlug}"; kept ${l.categorySlug}`);
    }
    if (o.auth !== undefined) {
      next.raw.auth = o.auth;
      next.auth = normalizeAuth(o.auth);
      fields.push("auth");
    }
    if (o.https !== undefined) {
      next.raw.https = o.https;
      next.https = normalizeTri(o.https);
      fields.push("https");
    }
    if (o.cors !== undefined) {
      next.raw.cors = o.cors;
      next.cors = normalizeTri(o.cors);
      fields.push("cors");
    }
    if (fields.length) next.correction = { issue: o.issue, approvedAt: o.approvedAt, fields };
    out.push(next);
  }
  return { listings: out, warnings };
}

/** Adds approved community and provider listings into their categories. */
export function applyCommunityApis(listings: CatalogListing[], file: CommunityApisFile | null): { listings: CatalogListing[]; warnings: string[] } {
  if (!file) return { listings, warnings: [] };
  const warnings: string[] = [];
  const names = categoryNames(listings);
  const ids = new Set(listings.map((l) => l.id));
  const added: CatalogListing[] = [];
  for (const a of file.apis) {
    const url = safeHttpUrl(a.url);
    const category = names.get(a.categorySlug);
    if (!url || !category || !DATE.test(a.approvedAt) || !a.name.trim()) {
      warnings.push(`Community API "${a.name}" (request #${a.issue}) skipped: needs an http(s) link, a known category and an approval date`);
      continue;
    }
    const id = listingId("api", a.name.trim(), url);
    if (ids.has(id)) {
      warnings.push(`Community API "${a.name}" (request #${a.issue}) is already on the wall; skipped`);
      continue;
    }
    ids.add(id);
    added.push({
      id,
      kind: "api",
      origin: "community",
      name: a.name.trim(),
      description: a.description.trim(),
      category,
      categorySlug: a.categorySlug,
      url,
      raw: { auth: a.auth, https: a.https, cors: a.cors },
      auth: normalizeAuth(a.auth),
      https: normalizeTri(a.https),
      cors: normalizeTri(a.cors),
      sourceLine: 0,
      community: {
        issue: a.issue,
        approvedAt: a.approvedAt,
        providerSubmitted: !!a.providerSubmitted,
        ...(a.providerSubmitted && a.providerName ? { providerName: a.providerName } : {}),
      },
    });
  }
  return { listings: [...listings, ...added], warnings };
}
