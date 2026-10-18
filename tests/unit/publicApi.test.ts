import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPublicApi, type PublicApiItem } from "@/lib/catalog/publicApi";
import type { Changelog } from "@/lib/catalog/history";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { GET } from "@/app/api/v1/[...path]/route";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const log = JSON.parse(readFileSync(path.join(process.cwd(), "data/changelog.json"), "utf8")) as Changelog;
const SITE = "https://example.test/ApiWall";
const files = buildPublicApi(snap, log, SITE);
const apis = (files.get("apis.json") as { data: PublicApiItem[]; meta: { count: number } }).data;

describe("public API files", () => {
  it("lists every listing once, sorted by name, with an item file for each", () => {
    expect(apis.length).toBe(snap.listings.length);
    expect(new Set(apis.map((a) => a.id)).size).toBe(apis.length);
    const names = apis.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    for (const a of apis) expect((files.get(`apis/${a.id}.json`) as { data: PublicApiItem }).data).toEqual(a);
  });
  it("puts cross-listed APIs in every category they appear in on the wall", () => {
    const cats = (files.get("categories.json") as { data: { slug: string; count: number; url: string }[] }).data;
    expect(cats.length).toBe(snap.categories.length);
    for (const c of cats) {
      const body = files.get(`categories/${c.slug}.json`) as { data: PublicApiItem[] };
      expect(body.data.length).toBe(c.count);
      for (const a of body.data) expect(a.categories).toContain(c.slug);
      expect(c.url).toBe(`${SITE}/api/v1/categories/${c.slug}.json`);
    }
    const ai = files.get("categories/ai-models.json") as { data: PublicApiItem[] };
    const tagged = snap.listings.filter((l) => l.categorySlug === "ai-models" || (l.tags ?? []).includes("ai-models"));
    expect(ai.data.map((a) => a.id).sort()).toEqual(tagged.map((l) => l.id).sort());
  });
  it("reports facts faithfully: booleans only where the catalog says yes or no, nothing for MCP", () => {
    for (const a of apis) {
      const l = snap.listings.find((x) => x.id === a.id)!;
      expect(a.auth.listed).toBe(l.raw.auth);
      expect(a.https).toBe(l.kind === "mcp" || l.https === "unknown" ? null : l.https === "yes");
      expect(a.cors).toBe(l.kind === "mcp" || l.cors === "unknown" ? null : l.cors === "yes");
      expect(a.docsUrl).toBe(l.url);
      expect(a.wallUrl).toBe(`${SITE}/?api=${a.id}`);
      if (a.logo) expect(a.logo.url.startsWith(`${SITE}/marks/`)).toBe(true);
      expect(Object.keys(a)).not.toContain("price");
    }
  });
  it("carries the source, license notice and changelog, and is the same every time", () => {
    const index = files.get("index.json") as { meta: { notice: string; source: { license: string } }; endpoints: Record<string, string> };
    expect(index.meta.source.license).toBe("MIT");
    expect(index.meta.notice).toMatch(/not affiliated/);
    expect(index.endpoints.apis).toBe(`${SITE}/api/v1/apis.json`);
    expect((files.get("changes.json") as { data: unknown }).data).toEqual(log.entries);
    expect(JSON.stringify([...buildPublicApi(snap, log, SITE)])).toBe(JSON.stringify([...files]));
  });
});

describe("self-hosted /api/v1 route", () => {
  const call = (p: string) => GET(new Request(`http://localhost/api/v1/${p}`), { params: Promise.resolve({ path: p.split("/") }) });
  it("serves the same files with CORS open to every site", async () => {
    const res = await call("categories.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(((await res.json()) as { data: unknown[] }).data.length).toBe(snap.categories.length);
  });
  it("answers unknown or odd paths with a JSON 404", async () => {
    for (const p of ["nope.json", "../data/catalog.snapshot.json", "apis/<x>.json"]) {
      const res = await call(p);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: string }).error).toMatch(/index\.json/);
    }
  });
});
