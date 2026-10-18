import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assignSlugs, SLUG_RE, slugify } from "@/lib/catalog/slugs";
import { checkLinks, classifyError, classifyStatus, EMPTY_LINK_HEALTH, type Fetcher, linkState, mergeHealth, probeUrl } from "@/lib/catalog/links";
import { buildEntries, EMPTY_FILTERS, filterEntries } from "@/lib/explore/model";
import { parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import { buildPublicApi, type PublicApiItem } from "@/lib/catalog/publicApi";
import { compareRows } from "@/lib/explore/compare";
import { pageData, related, summary } from "@/lib/catalog/pages";
import sitemap from "@/app/sitemap";
import { PACKS } from "@/lib/catalog/packs";
import type { CatalogListing, CatalogSnapshot } from "@/lib/catalog/types";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const listing = (id: string, name: string, url: string | null, extra: Partial<CatalogListing> = {}): CatalogListing =>
  ({ ...snap.listings[0], id, name, url, slug: undefined, ...extra }) as CatalogListing;
const snapOf = (listings: CatalogListing[]): CatalogSnapshot => ({ ...snap, listings });

describe("page slugs", () => {
  it("makes readable slugs", () => {
    expect(slugify("OpenAI API")).toBe("openai-api");
    expect(slugify("Météo-France")).toBe("meteo-france");
    expect(slugify("AT&T")).toBe("at-and-t");
    expect(slugify("  --7Timer!--  ")).toBe("7timer");
  });
  it("gives every listing in the snapshot a unique, valid slug", () => {
    const slugs = snap.listings.map((l) => l.slug);
    expect(slugs.every((s) => typeof s === "string" && SLUG_RE.test(s))).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("tells listings with the same name apart by their site", () => {
    const next = snapOf([listing("a1", "Cat Facts", "https://catfact.ninja/"), listing("a2", "Cat Facts", "https://alexwohlbruck.github.io/cat-facts/")]);
    assignSlugs(next, null);
    expect(next.listings.map((l) => l.slug).sort()).toEqual(["cat-facts-alexwohlbruck-github", "cat-facts-catfact-ninja"]);
  });
  it("never changes a slug once given, even when a same-named listing arrives later", () => {
    const prev = snapOf([listing("a1", "Cat Facts", "https://catfact.ninja/", { slug: "cat-facts" })]);
    const next = snapOf([listing("a1", "Cat Facts", "https://catfact.ninja/"), listing("a2", "Cat Facts", "https://other.example/")]);
    assignSlugs(next, prev);
    expect(next.listings.find((l) => l.id === "a1")!.slug).toBe("cat-facts");
    expect(next.listings.find((l) => l.id === "a2")!.slug).toBe("cat-facts-other-example");
  });
});

describe("docs-link checks", () => {
  it("treats only gone or broken answers as unreachable", () => {
    expect(classifyStatus(200).ok).toBe(true);
    expect(classifyStatus(301).ok).toBe(true);
    for (const s of [401, 403, 405, 429]) expect(classifyStatus(s).ok).toBe(true); // live servers turning robots away
    expect(classifyStatus(404)).toEqual({ ok: false, reason: "page not found (HTTP 404)" });
    expect(classifyStatus(503).reason).toBe("server error (HTTP 503)");
    expect(classifyError(Object.assign(new Error("x"), { cause: { code: "ENOTFOUND" } })).reason).toBe("domain not found");
    expect(classifyError(Object.assign(new Error("x"), { name: "TimeoutError" })).reason).toBe("timed out");
    expect(classifyError(Object.assign(new Error("x"), { cause: { code: "CERT_HAS_EXPIRED" } })).reason).toBe("security certificate problem");
  });
  it("falls back to GET when HEAD fails, and never reads the body", async () => {
    const calls: string[] = [];
    let cancelled = 0;
    const fetcher: Fetcher = async (_u, init) => {
      calls.push(init.method);
      if (init.method === "HEAD") throw Object.assign(new Error("x"), { cause: { code: "ECONNRESET" } });
      return { status: 200, body: { cancel: () => cancelled++ } };
    };
    expect(await probeUrl("https://x.example/", fetcher)).toEqual({ ok: true, reason: "HTTP 200" });
    expect(calls).toEqual(["HEAD", "GET"]);
    expect(cancelled).toBe(1);
  });
  it("reports only links that fail twice, one request at a time per site", async () => {
    let tries = 0;
    const active = new Map<string, number>();
    let maxPerHost = 0;
    const probe = async (u: string) => {
      const h = new URL(u).hostname;
      active.set(h, (active.get(h) ?? 0) + 1);
      maxPerHost = Math.max(maxPerHost, active.get(h)!);
      await new Promise((r) => setTimeout(r, 2));
      active.set(h, active.get(h)! - 1);
      if (u.includes("flaky")) return { ok: tries++ > 0, reason: "timed out" };
      if (u.includes("dead")) return { ok: false, reason: "page not found (HTTP 404)" };
      return { ok: true, reason: "HTTP 200" };
    };
    const targets = [
      { id: "a", url: "https://same.example/1" },
      { id: "b", url: "https://same.example/2" },
      { id: "c", url: "https://same.example/dead" },
      { id: "d", url: "https://flaky.example/" },
      { id: "e", url: "https://same.example/dead" }, // two listings, one link
    ];
    const r = await checkLinks(targets, probe, { sleep: async () => {} });
    expect([...r.failures.keys()].sort()).toEqual(["c", "e"]);
    expect(r.checked).toBe(4);
    expect(maxPerHost).toBe(1);
  });
  it("keeps the first failing date, drops links that work again, and reports state", () => {
    const prev = { ...EMPTY_LINK_HEALTH, checkedAt: "2026-10-12T00:00:00Z", unreachable: { a: { since: "2026-10-05T00:00:00Z", reason: "timed out" }, b: { since: "2026-10-12T00:00:00Z", reason: "x" } } };
    const next = mergeHealth(prev, new Map([["a", "page not found (HTTP 404)"], ["c", "domain not found"]]), 100, "2026-10-19T00:00:00Z");
    expect(next.unreachable).toEqual({
      a: { since: "2026-10-05T00:00:00Z", reason: "page not found (HTTP 404)" },
      c: { since: "2026-10-19T00:00:00Z", reason: "domain not found" },
    });
    expect(linkState(next, "a", true)).toMatchObject({ state: "unreachable", since: "2026-10-05T00:00:00Z" });
    expect(linkState(next, "b", true)).toEqual({ state: "reachable", checkedAt: "2026-10-19T00:00:00Z" });
    expect(linkState(next, "b", false)).toEqual({ state: "unchecked" });
    expect(linkState(EMPTY_LINK_HEALTH, "a", true)).toEqual({ state: "unchecked" });
  });
  it("hides broken links on request, everywhere the shared filter runs, and keeps it in the URL", () => {
    const victim = snap.listings[3]!;
    const health = { version: 1 as const, checkedAt: "2026-10-19T00:00:00Z", checked: 10, unreachable: { [victim.id]: { since: "2026-10-19T00:00:00Z", reason: "timed out" } } };
    const entries = buildEntries({ ...snap, linkHealth: health }, null);
    const all = filterEntries(entries, EMPTY_FILTERS);
    const ok = filterEntries(entries, { ...EMPTY_FILTERS, links: "ok" });
    expect(all.length - ok.length).toBe(1);
    expect(ok.some((e) => e.id === victim.id)).toBe(false);
    expect(compareRows([entries.find((e) => e.id === victim.id)!, ok[0]!]).find((r) => r.key === "link")!.values[0]).toBe("Not reachable: timed out");
    const search = toUrlSearch({ filters: { ...EMPTY_FILTERS, links: "ok" }, view: null, api: null });
    expect(search).toBe("?links=ok");
    expect(parseUrlState(search).filters.links).toBe("ok");
    expect(parseUrlState("?links=all").filters.links).toBe("");
    // The public API says the same.
    const item = (buildPublicApi({ ...snap, linkHealth: health }, { version: 1, entries: [] }, "https://x.test").get(`apis/${victim.id}.json`) as { data: PublicApiItem }).data;
    expect(item.docsLink).toEqual({ status: "unreachable", checkedOn: "2026-10-19T00:00:00Z", failingSince: "2026-10-19T00:00:00Z", reason: "timed out" });
    expect(item.pageUrl).toBe(`https://x.test/apis/${victim.slug}/`);
  });
});

describe("per-API pages and sitemap", () => {
  it("has a page for every catalog listing and every category", () => {
    const d = pageData();
    expect(d.entries.length).toBe(snap.listings.length);
    expect(d.categories.length).toBe(snap.categories.length);
    expect(d.categoryBySlug.get("ai-models")!.entries.length).toBeGreaterThan(6);
  });
  it("writes short search snippets and links to different neighbours", () => {
    const d = pageData();
    for (const e of d.entries) expect(summary(e).length).toBeLessThanOrEqual(200);
    const e = d.bySlug.get("openai-api")!;
    expect(summary(e)).toMatch(/^GPT .*AI Models API, auth: apiKey, HTTPS yes, CORS unknown\.$/);
    const near = related(e);
    expect(near.length).toBeLessThanOrEqual(8);
    expect(near.some((x) => x.id === e.id)).toBe(false);
  });
  it("lists every page in the sitemap once, with absolute URLs", () => {
    const urls = sitemap().map((u) => u.url);
    expect(new Set(urls).size).toBe(urls.length);
    // Every API and category page, every starter pack, and 10 fixed pages (home, A–Z, categories, packs, stats, changes, developers, about, submit, providers).
    expect(urls.length).toBe(snap.listings.length + snap.categories.length + PACKS.length + 10);
    expect(urls).toContain("https://eziodevio.github.io/ApiWall/apis/openai-api/");
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
  });
  it("includes brand icons for well-known brands in the public API", () => {
    const brand = snap.listings.find((l) => snap.marks[l.id]?.type === "brand")!;
    const item = (buildPublicApi(snap, { version: 1, entries: [] }, "https://x.test").get(`apis/${brand.id}.json`) as { data: PublicApiItem }).data;
    expect(item.logo).toBeNull();
    expect(item.brandIcon?.svgPath.length).toBeGreaterThan(10);
  });
});

describe("site address", () => {
  it("lower-cases the host GitHub passes in (EzioDEVio → eziodevio), keeping the path", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const before = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://EzioDEVio.github.io/ApiWall/";
    try {
      const { SITE_URL } = await import("@/lib/site");
      expect(SITE_URL).toBe("https://eziodevio.github.io/ApiWall");
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = before;
      vi.resetModules();
    }
  });
});
