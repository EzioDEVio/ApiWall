import "server-only";
import { loadSnapshot } from "./server";
import { buildEntries, type Entry } from "@/lib/explore/model";
import { buildPacks, type Pack } from "./packs";
import { readLinkHistory } from "./files";
import type { LinkHistory } from "./linkHistory";

/** Catalog data shaped for the static per-API and per-category pages (built once per process). */
interface PageData {
  entries: Entry[];
  bySlug: Map<string, Entry>;
  categories: { slug: string; name: string; glyph: string; index: number; entries: Entry[] }[];
  categoryBySlug: Map<string, { slug: string; name: string; glyph: string; index: number; entries: Entry[] }>;
  packs: Pack[];
  packBySlug: Map<string, Pack>;
  history: LinkHistory;
}

let cached: PageData | null = null;

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id);

export function pageData(): PageData {
  if (cached) return cached;
  const snap = loadSnapshot();
  const entries = buildEntries(snap, null)
    .filter((e) => e.slug)
    .sort(byName);
  const categories = snap.categories.map((c, index) => ({
    slug: c.slug,
    name: c.name,
    glyph: c.glyph,
    index,
    entries: entries.filter((e) => e.categorySlug === c.slug || e.tags.includes(c.slug)),
  }));
  const packs = buildPacks(entries);
  cached = {
    history: readLinkHistory(process.cwd()),
    packs,
    packBySlug: new Map(packs.map((p) => [p.slug, p])),
    entries,
    bySlug: new Map(entries.map((e) => [e.slug!, e])),
    categories,
    categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
  };
  return cached;
}

/** Up to `n` other APIs from the same category, starting just after this one alphabetically, so every page links to different neighbours. */
export function related(e: Entry, n = 8): Entry[] {
  const cat = pageData().categoryBySlug.get(e.categorySlug);
  if (!cat) return [];
  const list = cat.entries.filter((x) => x.id !== e.id);
  const start = list.findIndex((x) => byName(x, e) > 0);
  const from = start < 0 ? 0 : start;
  return [...list.slice(from), ...list.slice(0, from)].slice(0, n);
}

/** One plain sentence for search results: the description plus the key facts. */
export function summary(e: Entry): string {
  const auth = e.auth === "none" ? "no auth listed" : `auth: ${e.raw.auth || "unknown"}`;
  const facts = e.kind === "mcp" ? auth : `${auth}, HTTPS ${e.https}, CORS ${e.cors}`;
  const d = e.description.replace(/\s+/g, " ").trim();
  const kind = e.kind === "mcp" ? "MCP server" : `${e.category} API`;
  const text = `${d ? (d.endsWith(".") ? d : d + ".") + " " : ""}${kind}, ${facts}.`;
  return text.length > 200 ? text.slice(0, 197).replace(/\s+\S*$/, "") + "…" : text;
}
