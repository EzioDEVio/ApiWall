import type { CatalogListing, IdentityMark } from "./types";
import { codeHostOwner, hostOf, registrableDomain, SHARED_HOSTS } from "./domain";
import { fnv1a } from "./normalize";
import type { FaviconRecord } from "./favicons";

export interface BrandIcon {
  title: string;
  slug: string;
  hex: string;
  path: string;
  source: string; // where Simple Icons recorded the mark from
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** One or two letters that identify a listing, e.g. "Cat Facts" → "CF", "NASA" → "NA". */
export function monogramText(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .split(/[\s.]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const w = words[0]!;
    if (/\p{L}/u.test(w) && w === w.toUpperCase()) return w.slice(0, 2); // acronyms: NASA → NA
    const caps = w.replace(/[^\p{Lu}\p{N}]/gu, "");
    if (caps.length >= 2 && caps.length <= 3 && w.length > 3) return caps.slice(0, 2);
    return (w[0]!.toUpperCase() + (w[1] ?? "").toLowerCase()).trim();
  }
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Chooses an identity mark for every listing.
 *
 * A brand mark is used only when there is a defensible link between the mark
 * and the listing: the icon set's recorded source for the mark is on the
 * listing's own registrable domain (or the listing's own GitHub/GitLab
 * organisation), the domain is not a shared host, and the listing name
 * identifies the mark (equal to, or starting with, the mark's title). Everything else
 * gets a generated monogram, so no tile is ever blank.
 */
export function buildMarks(
  listings: CatalogListing[],
  icons: BrandIcon[],
  basisLabel: string,
  favicons: Record<string, FaviconRecord> = {},
): Record<string, IdentityMark> {
  const byDomain = new Map<string, BrandIcon[]>();
  const byOwner = new Map<string, BrandIcon[]>();
  for (const icon of icons) {
    const host = hostOf(icon.source);
    if (!host) continue;
    const owner = codeHostOwner(icon.source);
    if (owner) (byOwner.get(owner) ?? byOwner.set(owner, []).get(owner)!).push(icon);
    const domain = registrableDomain(host);
    if (SHARED_HOSTS.has(domain) || SHARED_HOSTS.has(host)) continue;
    (byDomain.get(domain) ?? byDomain.set(domain, []).get(domain)!).push(icon);
  }

  const pick = (candidates: BrandIcon[] | undefined, listing: CatalogListing): BrandIcon | null => {
    if (!candidates?.length) return null;
    const n = norm(listing.name);
    // The listing name must identify the mark: "Contentful Images" → Contentful, but
    // never "Uber" → Uber Eats or "eBird" → Postman (whose platform hosts its docs).
    const named = candidates.filter((c) => {
      const t = norm(c.title);
      return t.length >= 3 && (n === t || n.startsWith(t));
    });
    return named.length ? named.sort((a, b) => norm(b.title).length - norm(a.title).length)[0]! : null;
  };

  const marks: Record<string, IdentityMark> = {};
  for (const l of listings) {
    const host = hostOf(l.url);
    let icon: BrandIcon | null = null;
    if (host) {
      const owner = codeHostOwner(l.url);
      if (owner) icon = pick(byOwner.get(owner), l);
      const domain = registrableDomain(host);
      if (!icon && !SHARED_HOSTS.has(domain) && !SHARED_HOSTS.has(host)) icon = pick(byDomain.get(domain), l);
    }
    const fav = favicons[l.id];
    const fallback = { text: monogramText(l.name), seed: fnv1a(l.id) };
    // A full-colour logo published by the provider's own site wins, unless it is a
    // tiny favicon and a crisp vector mark is available.
    const favUsable = fav && (!icon || (fav.width ?? 0) >= 32 || fav.method === "github-owner");
    marks[l.id] = favUsable
      ? {
          type: "image",
          title: l.name,
          src: `/marks/${fav.file}`,
          basis:
            fav.method === "github-owner"
              ? "Avatar of the GitHub account that hosts this project"
              : fav.method === "declared"
                ? "Icon declared by the provider's own website"
                : "Favicon served by the provider's own website",
          sourceUrl: fav.pageUrl,
          iconUrl: fav.iconUrl,
          fetchedAt: fav.fetchedAt,
          fallback,
        }
      : icon
      ? {
          type: "brand",
          title: icon.title,
          hex: icon.hex,
          path: icon.path,
          basis: `${basisLabel}; the icon project's recorded source for this mark is on the listing's own domain`,
          sourceUrl: icon.source,
        }
      : { type: "monogram", ...fallback };
  }
  return marks;
}
