import type { CatalogSnapshot, CatalogListing } from "./types";

/**
 * Readable, permanent page addresses (/apis/<slug>/). A listing keeps the slug it was first
 * given for as long as it exists, so links and search results never break. New listings get
 * their name; when two share a name, both get the site's host added ("cat-facts-catfact-ninja"),
 * and if that still clashes, a few characters of the listing ID.
 */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(text: string, max = 60): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/, "");
}

function hostPart(url: string | null): string {
  if (!url) return "";
  try {
    return slugify(new URL(url).hostname.replace(/^www\./, "").replace(/\.(com|org|net|io|dev|app|co)$/, ""), 30);
  } catch {
    return "";
  }
}

export function assignSlugs(next: CatalogSnapshot, previous: CatalogSnapshot | null): void {
  const before = new Map((previous?.listings ?? []).filter((l) => l.slug && SLUG_RE.test(l.slug)).map((l) => [l.id, l.slug!]));
  const taken = new Set<string>();
  const need: CatalogListing[] = [];
  for (const l of next.listings) {
    const s = before.get(l.id);
    if (s && !taken.has(s)) {
      l.slug = s;
      taken.add(s);
    } else need.push(l);
  }
  const base = (l: CatalogListing) => slugify(l.name) || (l.kind === "mcp" ? "mcp-server" : "api");
  const counts = new Map<string, number>();
  for (const l of need) counts.set(base(l), (counts.get(base(l)) ?? 0) + 1);
  for (const l of [...need].sort((a, b) => a.id.localeCompare(b.id))) {
    const b = base(l);
    let s = b;
    if ((counts.get(b) ?? 0) > 1 || taken.has(b)) {
      const h = hostPart(l.url);
      s = h && h !== b ? `${b}-${h}` : b;
    }
    if (taken.has(s)) s = `${s}-${l.id.slice(-6)}`;
    for (let i = 2; taken.has(s); i++) s = `${s.replace(/-\d+$/, "")}-${i}`;
    l.slug = s;
    taken.add(s);
  }
}
