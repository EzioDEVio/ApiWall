import type { AuthKind, CatalogListing, TriState } from "./types";
import type { ParseResult } from "./parse";

/** FNV-1a, 32-bit. Deterministic across runtimes (no Math.random, no Date). */
export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 10-character stable hash built from two independent FNV runs. */
export function stableHash(input: string): string {
  const a = fnv1a(input).toString(36).padStart(7, "0");
  const b = fnv1a(input, 0x9e3779b1).toString(36).padStart(7, "0");
  return (a + b).slice(0, 10);
}

export function slugify(s: string): string {
  const slug = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "x";
}

/** Returns a canonical http(s) URL string, or null when the value is not a usable web link. */
export function safeHttpUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Key used for identity and duplicate detection: host + path, ignoring scheme, www, tracking params and trailing slash. */
export function urlIdentityKey(url: string | null, fallback: string): string {
  if (!url) return "nourl:" + fallback.toLowerCase();
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$/i.test(k)) u.searchParams.delete(k);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "") || "";
  const q = u.searchParams.toString();
  return host + path + (q ? "?" + q : "") + (u.hash.length > 1 ? u.hash : "");
}

export function normalizeAuth(raw: string): AuthKind {
  const v = raw.replace(/`/g, "").trim().toLowerCase();
  if (!v) return "unknown";
  if (v === "no" || v === "none") return "none";
  if (v === "apikey" || v === "api key") return "apiKey";
  if (v === "oauth" || v.startsWith("oauth")) return "oauth";
  if (v === "x-mashape-key") return "x-mashape-key";
  if (v === "user-agent") return "user-agent";
  if (v === "unknown") return "unknown";
  return "other";
}

export function normalizeTri(raw: string | undefined): TriState {
  const v = (raw ?? "").replace(/`/g, "").trim().toLowerCase();
  if (v === "yes" || v === "true") return "yes";
  if (v === "no" || v === "false") return "no";
  return "unknown";
}

export const MCP_CATEGORY = "MCP Servers";
export const MCP_CATEGORY_SLUG = "mcp-servers";

export interface NormalizeOutput {
  listings: CatalogListing[];
  warnings: string[];
  duplicatesRemoved: number;
}

export function listingId(kind: "api" | "mcp", name: string, url: string | null): string {
  return `${kind}-${slugify(name).slice(0, 40)}-${stableHash(urlIdentityKey(url, name) + "|" + name.trim().toLowerCase())}`;
}

export function normalize(parsed: ParseResult): NormalizeOutput {
  const warnings = [...parsed.warnings];
  const byId = new Map<string, CatalogListing>();
  let duplicatesRemoved = 0;

  for (const r of parsed.apiRows) {
    const url = safeHttpUrl(r.url);
    if (!url) warnings.push(`line ${r.line}: "${r.name}" has an unusable URL and will show without a link`);
    const id = listingId("api", r.name, url);
    const existing = byId.get(id);
    if (existing) {
      duplicatesRemoved++;
      if (existing.category !== r.category) {
        existing.alsoListedIn = [...new Set([...(existing.alsoListedIn ?? []), r.category])];
      } else warnings.push(`line ${r.line}: duplicate of "${r.name}" in ${r.category} (line ${existing.sourceLine}) removed`);
      continue;
    }
    byId.set(id, {
      id,
      kind: "api",
      name: r.name,
      description: r.description,
      category: r.category,
      categorySlug: slugify(r.category),
      url,
      raw: { auth: r.auth, https: r.https, cors: r.cors },
      auth: normalizeAuth(r.auth),
      https: normalizeTri(r.https),
      cors: normalizeTri(r.cors),
      sourceLine: r.line,
    });
  }

  for (const r of parsed.mcpRows) {
    const url = safeHttpUrl(r.url);
    if (!url) warnings.push(`line ${r.line}: MCP server "${r.name}" has an unusable URL`);
    const id = listingId("mcp", r.name, url);
    if (byId.has(id)) {
      duplicatesRemoved++;
      warnings.push(`line ${r.line}: duplicate MCP server "${r.name}" removed`);
      continue;
    }
    const transport = r.transport
      .split(/[,/]/)
      .map((t) => t.trim())
      .filter(Boolean);
    byId.set(id, {
      id,
      kind: "mcp",
      name: r.name,
      description: r.description,
      category: MCP_CATEGORY,
      categorySlug: MCP_CATEGORY_SLUG,
      url,
      raw: { auth: r.auth, transport: r.transport },
      auth: normalizeAuth(r.auth),
      https: "unknown",
      cors: "unknown",
      transport,
      install: r.install.flatMap((l) => {
        const u = safeHttpUrl(l.url);
        return u ? [{ label: l.label, url: u }] : [];
      }),
      sourceLine: r.line,
    });
  }

  // Deterministic order: category, then name, then id. Never insertion-order dependent.
  const listings = [...byId.values()].sort(
    (a, b) => a.categorySlug.localeCompare(b.categorySlug) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id),
  );
  return { listings, warnings, duplicatesRemoved };
}
