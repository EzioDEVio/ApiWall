import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEntries, EMPTY_FILTERS } from "@/lib/explore/model";
import { compareRows, MAX_COMPARE, toggleCompare } from "@/lib/explore/compare";
import { paletteGroups, type PaletteAction } from "@/lib/explore/palette";
import { parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const entries = buildEntries(snap, null);
const byName = (n: string) => entries.find((e) => e.name === n)!;
const cats = snap.categories.map((c) => ({ slug: c.slug, name: c.name, count: 1 }));
const actions: PaletteAction[] = [
  { id: "list", label: "Show the list", keywords: "cards view" },
  { id: "saved", label: "Show saved APIs", keywords: "favourites favorites starred" },
  { id: "theme-dark", label: "Use the dark theme", keywords: "night mode" },
];

describe("compare", () => {
  it("adds, removes, and refuses a fourth API without dropping one", () => {
    let ids: string[] = [];
    for (const id of ["a", "b", "c"]) ids = toggleCompare(ids, id).ids;
    expect(ids).toEqual(["a", "b", "c"]);
    expect(MAX_COMPARE).toBe(3);
    expect(toggleCompare(ids, "d")).toEqual({ ids: ["a", "b", "c"], refused: true });
    expect(toggleCompare(ids, "b")).toEqual({ ids: ["a", "c"], refused: false });
  });
  it("lines up the same facts the details show, and marks rows that differ", () => {
    const claude = byName("Claude API");
    const openai = byName("OpenAI API");
    const rows = compareRows([claude, openai]);
    const row = (k: string) => rows.find((r) => r.key === k)!;
    expect(row("category").values).toEqual(["AI Models", "AI Models"]);
    expect(row("category").differs).toBe(false);
    expect(row("ai-provider").values).toEqual([claude.aiModel!.provider, openai.aiModel!.provider]);
    expect(row("ai-provider").differs).toBe(true);
    // Pricing is never claimed without a verified claim.
    expect(row("access").values).toEqual(["Not verified", "Not verified"]);
  });
  it("adds MCP and AI rows only when a compared API has them, and never shows HTTPS for MCP", () => {
    const mcp = entries.find((e) => e.kind === "mcp")!;
    const plain = entries.find((e) => e.kind === "api" && !e.aiModel)!;
    const rows = compareRows([mcp, plain]);
    expect(rows.some((r) => r.key === "ai-provider")).toBe(false);
    expect(rows.find((r) => r.key === "transport")!.values[1]).toBe("—");
    expect(rows.find((r) => r.key === "https")!.values[0]).toBe("Does not apply (MCP)");
    expect(compareRows([plain, plain]).some((r) => r.key === "transport")).toBe(false);
  });
  it("round-trips ?compare= with at most three well-formed IDs", () => {
    const state = { filters: EMPTY_FILTERS, view: null, api: null, lens: "category" as const, list: null, compare: ["api-a", "api-b"] };
    const search = toUrlSearch(state);
    expect(search).toBe("?compare=api-a%2Capi-b");
    expect(parseUrlState(search)).toEqual(state);
    expect(parseUrlState("?compare=a,b,c,d,e").compare).toEqual(["a", "b", "c"]);
    expect(parseUrlState("?compare=<x>").compare).toBeNull();
  });
});

describe("command palette", () => {
  it("lists actions when nothing is typed", () => {
    const g = paletteGroups("", entries, cats, actions);
    expect(g.map((x) => x.name)).toEqual(["Actions"]);
    expect(g[0]!.items.map((i) => i.label)).toEqual(actions.map((a) => a.label));
  });
  it("finds APIs across the whole catalog, best name match first, and matching categories", () => {
    const g = paletteGroups("weather", entries, cats, actions);
    const apis = g.find((x) => x.name === "APIs")!.items;
    expect(apis.length).toBeGreaterThan(0);
    expect(apis.length).toBeLessThanOrEqual(6);
    expect(apis[0]!.label.toLowerCase().startsWith("weather")).toBe(true);
    expect(g.find((x) => x.name === "Categories")!.items.map((i) => i.label)).toContain("Weather");
  });
  it("puts an action first when its name starts with the query, and matches keywords", () => {
    expect(paletteGroups("show saved", entries, cats, actions)[0]!.name).toBe("Actions");
    const fav = paletteGroups("favourites", entries, cats, actions).find((x) => x.name === "Actions")!;
    expect(fav.items.map((i) => i.label)).toEqual(["Show saved APIs"]);
  });
  it("returns nothing for gibberish", () => {
    expect(paletteGroups("zzqqxxnotathing", entries, cats, actions)).toEqual([]);
  });
});
