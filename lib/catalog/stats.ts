import type { Entry } from "@/lib/explore/model";
import type { Changelog } from "./history";
import type { LinkHistory } from "./linkHistory";

/** Catalog-wide numbers for the stats page, the README badges and the public API. */
export interface CatalogStats {
  total: number;
  apis: number;
  mcp: number;
  categories: number;
  withLogo: number;
  auth: { none: number; apiKey: number; oauth: number; other: number };
  https: { yes: number; no: number; unknown: number };
  cors: { yes: number; no: number; unknown: number };
  links: { checkedAt: string | null; checked: number; unreachable: number };
  topCategories: { slug: string; name: string; count: number }[];
  /** One point per change in the set of unreachable links, oldest first. */
  linkTrend: { at: string; unreachable: number; checked: number }[];
  /** APIs added per import, oldest first (from the changelog). */
  additions: { at: string; added: number; removed: number }[];
}

export function computeStats(entries: Entry[], categories: { slug: string; name: string }[], history: LinkHistory, changelog: Changelog): CatalogStats {
  const cat = entries.filter((e) => e.source === "catalog");
  const apis = cat.filter((e) => e.kind === "api");
  const count = <K extends string>(list: Entry[], key: (e: Entry) => K, keys: readonly K[]) =>
    Object.fromEntries(keys.map((k) => [k, list.filter((e) => key(e) === k).length])) as Record<K, number>;
  const authKey = (e: Entry) => (e.auth === "none" || e.auth === "apiKey" || e.auth === "oauth" ? e.auth : "other");
  const perCat = categories
    .map((c) => ({ slug: c.slug, name: c.name, count: cat.filter((e) => e.categorySlug === c.slug || e.tags.includes(c.slug)).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"));
  const lastPeriod = history.periods[history.periods.length - 1];
  const checkedAt = cat.find((e) => e.link.state !== "unchecked")?.link;
  return {
    total: cat.length,
    apis: apis.length,
    mcp: cat.length - apis.length,
    categories: categories.length,
    withLogo: cat.filter((e) => e.mark.type !== "monogram").length,
    auth: count(apis, authKey, ["none", "apiKey", "oauth", "other"] as const),
    https: count(apis, (e) => e.https, ["yes", "no", "unknown"] as const),
    cors: count(apis, (e) => e.cors, ["yes", "no", "unknown"] as const),
    links: {
      checkedAt: checkedAt && checkedAt.state !== "unchecked" ? checkedAt.checkedAt : null,
      checked: lastPeriod?.checked ?? 0,
      unreachable: cat.filter((e) => e.link.state === "unreachable").length,
    },
    topCategories: perCat.slice(0, 15),
    linkTrend: history.periods.map((p) => ({ at: p.from, unreachable: p.unreachable.length, checked: p.checked })),
    additions: [...changelog.entries].reverse().map((e) => ({ at: e.at, added: e.added.length, removed: e.removed.length })),
  };
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
