import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEntries, categoryCounts, EMPTY_FILTERS, type Entry, type Filters, filterEntries, inCategory } from "@/lib/explore/model";
import { filteredColumns, filteredLayout, fullLayout } from "@/lib/explore/layout";
import { buildSnapshot } from "@/lib/catalog/build";
import { applyAiModels, type AiModelsFile } from "@/lib/catalog/supplements";
import { PROVIDER_REGION, SLOTS_PER_ROW, TILE_SIZE } from "@/lib/catalog/placement";
import type { CatalogSnapshot } from "@/lib/catalog/types";

// Everything here runs against the committed snapshot and curated file, so counts are
// derived from the data rather than hard-coded.
const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const aiFile = JSON.parse(readFileSync(path.join(process.cwd(), "data/ai-models.json"), "utf8")) as AiModelsFile;
const entries = buildEntries(snap, null);
const run = (f: Partial<Filters>) => filterEntries(entries, { ...EMPTY_FILTERS, ...f });
const ids = (list: Entry[]) => list.map((e) => e.id).sort();
const order = new Map(snap.categories.map((c, i) => [c.slug, i]));
const names = new Map(snap.categories.map((c) => [c.slug, c.name]));

describe("one shared filter pipeline", () => {
  it("category selection is an exact match on the normalized slug", () => {
    const art = run({ category: "art-and-design" });
    const expected = snap.listings.filter((l) => l.categorySlug === "art-and-design" || l.tags?.includes("art-and-design"));
    expect(art.length).toBe(expected.length);
    expect(art.length).toBeGreaterThan(0);
    expect(ids(art)).toEqual(expected.map((l) => l.id).sort());
    for (const e of art) expect(e.category).toBe("Art & Design");
  });

  it("never matches categories by substring", () => {
    // "data" is a prefix/substring of data-validation, open-data and test-data; none may leak in.
    expect(snap.categories.some((c) => c.slug.includes("data") && c.slug !== "data")).toBe(true);
    expect(run({ category: "data" })).toHaveLength(0);
    for (const e of run({ category: "open-data" })) expect(inCategory(e, "open-data")).toBe(true);
    for (const e of run({ category: "open-data" })) expect(e.categorySlug).not.toBe("test-data");
  });

  it("AI Models holds only the curated providers and verified cross-tags, each with a docs link and date", () => {
    const ai = run({ category: "ai-models" });
    const expected = aiFile.providers.length + aiFile.crossTags.length;
    expect(ai.length).toBe(expected);
    for (const e of ai) {
      expect(e.aiModel).toBeDefined();
      expect(e.aiModel!.docsUrl).toMatch(/^https:\/\//);
      expect(e.aiModel!.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.aiModel!.models.length).toBeGreaterThan(0);
      expect(e.access).toBe("unknown"); // no free tier is claimed
    }
    const supplements = ai.filter((e) => e.origin === "supplement");
    expect(supplements.map((e) => e.name).sort()).toEqual(aiFile.providers.map((p) => p.name).sort());
    for (const e of supplements) expect(e.categorySlug).toBe("ai-models");
  });

  it("keeps Machine Learning separate: only explicitly cross-tagged listings appear in both", () => {
    const ml = run({ category: "machine-learning" });
    const ai = new Set(ids(run({ category: "ai-models" })));
    expect(ml.length).toBe(snap.listings.filter((l) => l.categorySlug === "machine-learning").length);
    const shared = ml.filter((e) => ai.has(e.id));
    expect(shared.map((e) => e.name).sort()).toEqual(aiFile.crossTags.map((t) => t.match.name).sort());
    expect(ml.length - shared.length).toBeGreaterThan(0); // generic ML tools stay ML-only
    for (const e of ml) expect(e.origin).toBe("upstream"); // supplements never land in ML
    for (const e of ml.filter((x) => !ai.has(x.id))) expect(e.tags).not.toContain("ai-models");
    // Upstream category facts are unchanged for cross-tagged listings.
    for (const e of shared) expect(e.category).toBe("Machine Learning");
  });

  it("search matches names, descriptions and documented model names", () => {
    const r = run({ q: "deepseek" });
    expect(r.map((e) => e.name)).toContain("DeepSeek API");
    for (const e of r) expect(e.search).toContain("deepseek");
    const byModel = run({ q: "grok-4.7" });
    expect(byModel.map((e) => e.name)).toEqual(["xAI API"]);
  });

  it("combines category, search and other filters with AND", () => {
    const f: Partial<Filters> = { category: "weather", q: "forecast", https: "yes" };
    const r = run(f);
    const intersect = run({ category: "weather" }).filter((e) => run({ q: "forecast" }).some((x) => x.id === e.id) && e.https === "yes");
    expect(ids(r)).toEqual(ids(intersect));
    expect(r.length).toBeGreaterThan(0);
    for (const e of r) {
      expect(e.categorySlug).toBe("weather");
      expect(e.search).toContain("forecast");
      expect(e.https).toBe("yes");
    }
    expect(r.length).toBeLessThan(run({ category: "weather" }).length);
  });

  it("returns nothing for a query with no matches, and everything with no filters", () => {
    expect(run({ q: "zzqxnotathing" })).toHaveLength(0);
    expect(run({ category: "ai-models", q: "zzqxnotathing" })).toHaveLength(0);
    expect(run({})).toHaveLength(entries.length);
  });

  it("category counts are the result counts each choice would show with the other filters", () => {
    for (const f of [EMPTY_FILTERS, { ...EMPTY_FILTERS, q: "api" }, { ...EMPTY_FILTERS, auth: "none" as const, category: "animals" }]) {
      const counts = categoryCounts(entries, f);
      expect(counts.all).toBe(filterEntries(entries, { ...f, category: "" }).length);
      for (const c of snap.categories) expect(counts.bySlug.get(c.slug) ?? 0).toBe(filterEntries(entries, { ...f, category: c.slug }).length);
    }
  });
});

describe("map layouts", () => {
  it("the full layout keeps every stable placement and labels each band", () => {
    const L = fullLayout(entries, snap.regions.map((r) => ({ ...r, name: names.get(r.slug)! })), PROVIDER_REGION);
    expect(L.mode).toBe("full");
    expect(L.items).toHaveLength(entries.length);
    for (const it of L.items) {
      expect(it.slot).toBe(snap.placements[it.entry.id]!.slot);
      expect(it.x).toBe(snap.placements[it.entry.id]!.x);
    }
    expect(L.labels.map((l) => l.name)).toContain("AI Models");
    expect(L.openSlots).toEqual(PROVIDER_REGION);
  });

  it("a filtered layout draws exactly the results: no other tiles, labels or open slots", () => {
    const art = run({ category: "art-and-design" });
    const L = filteredLayout(art, { cols: 8, categoryOrder: order, names, focus: { slug: "art-and-design", name: "Art & Design" } });
    expect(L.mode).toBe("filtered");
    expect(L.items.map((i) => i.entry.id).sort()).toEqual(ids(art));
    expect(L.labels).toEqual([{ name: "Art & Design", slot: 0 }]);
    expect(L.openSlots).toBeNull();
    expect(new Set(L.items.map((i) => i.slot)).size).toBe(art.length);
    for (const it of L.items) {
      expect(it.x + TILE_SIZE).toBeLessThanOrEqual(L.width);
      expect(it.y + TILE_SIZE).toBeLessThanOrEqual(L.height);
    }
    expect(L.rows).toBe(Math.ceil(art.length / 8));
    // Underlying IDs and stable placements are untouched.
    for (const e of art) expect(e.placement).toEqual(snap.placements[e.id]);
  });

  it("cross-tagged tiles join the selected group, and unfocused results are grouped by their own category", () => {
    const ai = run({ category: "ai-models" });
    const focused = filteredLayout(ai, { cols: 5, categoryOrder: order, names, focus: { slug: "ai-models", name: "AI Models" } });
    expect(new Set(focused.items.map((i) => i.colorSlug))).toEqual(new Set(["ai-models"]));
    const search = run({ q: "weather" });
    const grouped = filteredLayout(search, { cols: 10, categoryOrder: order, names });
    expect(grouped.labels.length).toBe(new Set(search.map((e) => e.categorySlug)).size);
    const seen = grouped.items.map((i) => order.get(i.entry.categorySlug)!);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("an empty result set has no tiles", () => {
    const L = filteredLayout([], { cols: 4, categoryOrder: order, names });
    expect(L.items).toHaveLength(0);
    expect(L.labels).toHaveLength(0);
  });

  it("chooses readable column counts for the space available", () => {
    expect(filteredColumns(1, 1000, 700)).toBe(1);
    expect(filteredColumns(31, 1000, 700)).toBeLessThanOrEqual(Math.floor(1000 / 72));
    expect(filteredColumns(2000, 350, 700, 60)).toBe(5);
    expect(filteredColumns(5000, 10000, 100)).toBe(SLOTS_PER_ROW);
  });
});

describe("AI Models supplement import", () => {
  const fixture = readFileSync(path.join(__dirname, "../fixtures/README.fixture.md"), "utf8");
  const source = {
    repo: "public-apis/public-apis",
    readmeUrl: "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md",
    ref: "master",
    commit: null,
    contentSha256: "x",
    fetchedFrom: "fixture" as const,
    license: { name: "MIT", url: "https://example.org/LICENSE", notice: "x" },
  };
  const file: AiModelsFile = {
    version: 1,
    category: { slug: "ai-models", name: "AI Models" },
    about: "test",
    crossTags: [
      { match: { name: "NASA", host: "api.nasa.gov" }, provider: "NASA", models: "none", authDetail: "key", apiHost: null, docsUrl: "https://api.nasa.gov", verifiedAt: "2026-10-17" },
      { match: { name: "Gone", host: "gone.example" }, provider: "Gone", models: "x", authDetail: "x", apiHost: null, docsUrl: "https://gone.example", verifiedAt: "2026-10-17" },
    ],
    providers: [
      { name: "Model API", provider: "Acme", description: "LLM", url: "https://docs.acme.example/api", auth: "apiKey", https: "Yes", cors: "Unknown", models: "acme-1", authDetail: "Bearer", apiHost: "api.acme.example", verifiedAt: "2026-10-17" },
      { name: "Undated", provider: "B", description: "LLM", url: "https://b.example", auth: "apiKey", https: "Yes", cors: "Unknown", models: "b", authDetail: "x", apiHost: null, verifiedAt: "" },
      { name: "Unsafe", provider: "C", description: "LLM", url: "javascript:alert(1)", auth: "apiKey", https: "Yes", cors: "Unknown", models: "c", authDetail: "x", apiHost: null, verifiedAt: "2026-10-17" },
    ],
  };
  const plain = buildSnapshot({ readme: fixture, source, importedAt: "2026-10-17T00:00:00.000Z", icons: [], iconBasis: "t" });
  const withAi = buildSnapshot({ readme: fixture, source, importedAt: "2026-10-17T00:00:00.000Z", icons: [], iconBasis: "t", aiModels: file, previous: plain });

  it("adds curated entries as a labelled supplement and rejects undated or unsafe ones", () => {
    const added = withAi.listings.filter((l) => l.origin === "supplement");
    expect(added.map((l) => l.name)).toEqual(["Model API"]);
    expect(added[0]).toMatchObject({ category: "AI Models", categorySlug: "ai-models", sourceLine: 0 });
    expect(withAi.warnings.join(" ")).toMatch(/Undated/);
    expect(withAi.warnings.join(" ")).toMatch(/Unsafe/);
    expect(withAi.categories.find((c) => c.slug === "ai-models")).toMatchObject({ name: "AI Models", count: 1 });
    expect(withAi.supplements?.[0]).toMatchObject({ providers: 1, crossTagged: 1 });
  });

  it("cross-tags upstream listings without changing their facts, and reports missing ones", () => {
    const nasa = withAi.listings.find((l) => l.name === "NASA")!;
    const before = plain.listings.find((l) => l.name === "NASA")!;
    expect(nasa.tags).toEqual(["ai-models"]);
    expect({ ...nasa, tags: undefined, aiModel: undefined }).toEqual({ ...before, tags: undefined, aiModel: undefined });
    expect(withAi.warnings.join(" ")).toMatch(/"Gone".*no longer in the upstream catalog/);
  });

  it("adding the supplement moves no existing tile", () => {
    for (const [id, p] of Object.entries(plain.placements)) expect(withAi.placements[id]).toEqual(p);
  });

  it("does not mutate the input listings array", () => {
    const listings = structuredClone(plain.listings);
    const copy = structuredClone(listings);
    const r = applyAiModels(listings, file);
    expect(listings).toEqual(copy);
    expect(r.listings.find((l) => l.name === "NASA")!.tags).toEqual(["ai-models"]);
  });
});
