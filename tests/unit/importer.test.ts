import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseLink, parseReadme, splitRow } from "@/lib/catalog/parse";
import { listingId, normalize, normalizeAuth, normalizeTri, safeHttpUrl } from "@/lib/catalog/normalize";
import { buildSnapshot } from "@/lib/catalog/build";
import { buildMarks, monogramText, type BrandIcon } from "@/lib/catalog/marks";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const fixture = readFileSync(path.join(__dirname, "../fixtures/README.fixture.md"), "utf8");
const source = {
  repo: "public-apis/public-apis",
  readmeUrl: "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md",
  ref: "master",
  commit: null,
  contentSha256: "x",
  fetchedFrom: "fixture" as const,
  license: { name: "MIT", url: "https://example.org/LICENSE", notice: "Copyright (c) 2022 public-apis" },
};
const build = (readme = fixture, previous?: CatalogSnapshot) =>
  buildSnapshot({ readme, source, importedAt: "2026-10-17T00:00:00.000Z", icons: [], iconBasis: "test", previous });

describe("README parsing", () => {
  const parsed = parseReadme(fixture);

  it("reads categories in order and ignores promotional content outside the catalog", () => {
    expect(parsed.categories).toEqual(["Animals", "Science & Math"]);
    const names = parsed.apiRows.map((r) => r.name);
    expect(names).not.toContain("Promo Stack");
    expect(names).not.toContain("Promo One");
    expect(parsed.ignoredPromoRows).toBe(1);
  });

  it("parses the MCP section as its own listing type with transport and install links", () => {
    expect(parsed.mcpRows.map((r) => r.name)).toEqual(["Weather MCP", "Files"]);
    const w = parsed.mcpRows[0]!;
    expect(w.auth).toBe("apiKey");
    expect(w.transport).toBe("stdio, HTTP");
    expect(w.install).toEqual([
      { label: "Glama", url: "https://glama.ai/mcp/servers/example" },
      { label: "npm", url: "https://www.npmjs.com/package/weather-mcp" },
    ]);
    expect(parsed.mcpRows[1]!.install).toEqual([]);
  });

  it("handles escaped pipes, parentheses in URLs and backticked values", () => {
    const pipes = parsed.apiRows.find((r) => r.name === "Pipes | Co")!;
    expect(pipes.description).toBe("Description with an escaped | pipe");
    expect(pipes.auth).toBe("apiKey");
    const wiki = parsed.apiRows.find((r) => r.name === "Wiki (Animal)")!;
    expect(wiki.url).toBe("https://en.wikipedia.org/wiki/Cat_(disambiguation)");
    expect(splitRow("| a | b \\| c | d |")).toEqual(["a", "b | c", "d"]);
    expect(parseLink("[x](https://a.b/c_(d))")).toEqual({ text: "x", url: "https://a.b/c_(d)" });
  });

  it("skips rows without a link and imports short rows with unknown values, with warnings", () => {
    expect(parsed.apiRows.find((r) => r.name.includes("Not a link"))).toBeUndefined();
    expect(parsed.warnings.some((w) => w.includes("without a [name](url) link"))).toBe(true);
    const short = parsed.apiRows.find((r) => r.name === "Short Row")!;
    expect(short.cors).toBe("");
    expect(parsed.warnings.some((w) => w.includes("Short Row"))).toBe(true);
  });

  it("never throws on garbage input", () => {
    expect(() => parseReadme("")).not.toThrow();
    expect(() => parseReadme("| | |\n## Index\n### X\n| [a](b |\n|||")).not.toThrow();
    expect(parseReadme("random text").apiRows).toEqual([]);
  });
});

describe("normalization", () => {
  const { listings, warnings, duplicatesRemoved } = normalize(parseReadme(fixture));

  it("removes exact duplicates and records cross-category duplicates", () => {
    const cats = listings.filter((l) => l.name === "Cat Facts");
    expect(cats).toHaveLength(2); // two different URLs
    const ninja = cats.find((l) => l.url?.includes("catfact.ninja"))!;
    expect(ninja.alsoListedIn).toEqual(["Science & Math"]);
    expect(duplicatesRemoved).toBe(2);
    expect(warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("keeps raw values verbatim and normalizes unknowns", () => {
    const odd = listings.find((l) => l.name === "Odd Auth")!;
    expect(odd.raw.auth).toBe("Token in body");
    expect(odd.auth).toBe("other");
    expect(odd.raw.https).toBe("Maybe");
    expect(odd.https).toBe("unknown");
    expect(listings.find((l) => l.name === "Wiki (Animal)")!.cors).toBe("unknown"); // "unknown" in lowercase
    expect(normalizeAuth("`OAuth`")).toBe("oauth");
    expect(normalizeTri(" Yes ")).toBe("yes");
  });

  it("rejects non-http(s) URLs instead of linking them", () => {
    const bad = listings.find((l) => l.name === "Bad URL")!;
    expect(bad.url).toBeNull();
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://user:pw@example.com")).toBeNull();
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("marks MCP entries as their own kind with HTTPS/CORS unknown", () => {
    const mcp = listings.filter((l) => l.kind === "mcp");
    expect(mcp.map((m) => m.name).sort()).toEqual(["Files", "Weather MCP"]);
    for (const m of mcp) {
      expect(m.category).toBe("MCP Servers");
      expect(m.https).toBe("unknown");
      expect(m.cors).toBe("unknown");
    }
    expect(mcp.find((m) => m.name === "Weather MCP")!.transport).toEqual(["stdio", "HTTP"]);
  });

  it("produces stable IDs from name and URL, independent of order and tracking params", () => {
    expect(listingId("api", "NASA", "https://api.nasa.gov/")).toBe(listingId("api", "NASA", "https://api.nasa.gov"));
    expect(listingId("api", "NASA", "https://api.nasa.gov/?utm_source=x")).toBe(listingId("api", "NASA", "https://api.nasa.gov/"));
    expect(listingId("api", "NASA", "https://api.nasa.gov")).not.toBe(listingId("api", "NASA", "https://data.nasa.gov"));
    const lines = fixture.split("\n");
    const iA = lines.findIndex((l) => l.startsWith("| [NASA]"));
    const reordered = [...lines];
    const [row] = reordered.splice(iA, 1);
    reordered.splice(iA + 2, 0, row!);
    const again = normalize(parseReadme(reordered.join("\n"))).listings.map((l) => l.id).sort();
    expect(again).toEqual(listings.map((l) => l.id).sort());
  });
});

describe("snapshot build and placement stability", () => {
  it("is deterministic for the same input", () => {
    const a = build();
    const b = build();
    expect(b.listings).toEqual(a.listings);
    expect(b.placements).toEqual(a.placements);
    expect(b.marks).toEqual(a.marks);
  });

  it("keeps every existing tile in place across a refresh that adds and removes listings", () => {
    const first = build();
    const changed = fixture
      .replace("| [NASA](https://api.nasa.gov) | NASA data, including imagery | `apiKey` | Yes | No |\n", "")
      .replace("| [Cat Facts](https://catfact.ninja/) | Random cat facts | No | Yes | Yes |\n", "| [Aardvark](https://aardvark.example.com) | Sorts first | No | Yes | No |\n| [Cat Facts](https://catfact.ninja/) | Random cat facts | No | Yes | Yes |\n");
    const second = build(changed, first);
    for (const l of second.listings) {
      const prev = first.placements[l.id];
      if (prev) expect(second.placements[l.id]).toEqual(prev);
    }
    const nasaId = first.listings.find((l) => l.name === "NASA")!.id;
    expect(second.placements[nasaId]).toBeUndefined();
    const aard = second.listings.find((l) => l.name === "Aardvark")!;
    const band = second.regions.find((r) => r.slug === "animals")!;
    expect(second.placements[aard.id]!.slot).toBeGreaterThanOrEqual(band.start);
    expect(second.placements[aard.id]!.slot).toBeLessThan(band.end);
  });

  it("places every listing on its own slot inside the 1000×1000 grid and outside the provider band", () => {
    const s = build();
    const slots = Object.values(s.placements).map((p) => p.slot);
    expect(new Set(slots).size).toBe(slots.length);
    for (const p of Object.values(s.placements)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.size).toBeLessThanOrEqual(1000);
      expect(p.y + p.size).toBeLessThanOrEqual(1000);
      expect(p.slot).toBeLessThan(s.grid.providerRegion.start);
    }
    expect(Object.keys(s.placements)).toHaveLength(s.listings.length);
  });

  it("gives every listing an identity mark", () => {
    const s = build();
    for (const l of s.listings) expect(s.marks[l.id]).toBeDefined();
    expect(monogramText("Cat Facts")).toBe("CF");
    expect(monogramText("NASA")).toBe("NA");
    expect(monogramText("arXiv")).toBe("Ar");
    expect(monogramText("!!!")).toBe("?");
  });
});

describe("identity marks", () => {
  const icon = (title: string, source: string): BrandIcon => ({ title, slug: title.toLowerCase(), hex: "112233", path: "M0 0h24v24H0z", source });
  const listing = (name: string, url: string) => normalize(parseReadme(`## Index\n### X\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n| [${name}](${url}) | d | No | Yes | Yes |`)).listings[0]!;

  it("uses a brand mark only when the icon source is on the listing's own domain and the name matches", () => {
    const icons = [icon("Spotify", "https://developer.spotify.com/brand"), icon("Uber Eats", "https://assets.uber.com/x"), icon("Postman", "https://www.getpostman.com/press")];
    const spotify = listing("Spotify", "https://developer.spotify.com/web-api");
    const uber = listing("Uber", "https://developer.uber.com/docs");
    const ebird = listing("eBird", "https://documenter.getpostman.com/view/123");
    const m = buildMarks([spotify, uber, ebird], icons, "test");
    expect(m[spotify.id]!.type).toBe("brand");
    expect(m[uber.id]!.type).toBe("monogram"); // "Uber" is not "Uber Eats"
    expect(m[ebird.id]!.type).toBe("monogram"); // docs hosted on Postman ≠ Postman's mark
  });

  it("never matches through shared hosts", () => {
    const icons = [icon("Nunjucks", "https://github.com/mozilla/nunjucks")];
    const scanner = listing("Mozilla tls scanner", "https://github.com/mozilla/tls-observatory");
    expect(buildMarks([scanner], icons, "test")[scanner.id]!.type).toBe("monogram");
  });
});

describe("real upstream snapshot", () => {
  const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
  const readme = readFileSync(path.join(process.cwd(), "data/upstream/README.md"), "utf8");

  it("contains the imported catalog, not sample data", () => {
    expect(snap.listings.filter((l) => l.kind === "api").length).toBeGreaterThan(2000);
    expect(snap.listings.filter((l) => l.kind === "mcp").length).toBeGreaterThan(5);
    expect(snap.categories.length).toBeGreaterThan(40);
    expect(snap.source.repo).toBe("public-apis/public-apis");
    expect(snap.source.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("imports no rows from above the catalog index except the MCP section", () => {
    const indexLine = readme.split("\n").findIndex((l) => l.trim() === "## Index") + 1;
    for (const l of snap.listings) if (l.kind === "api" && l.origin !== "supplement") expect(l.sourceLine).toBeGreaterThan(indexLine);
  });

  it("rebuilding from the cached README reproduces the same listings and placements", () => {
    const aiModels = JSON.parse(readFileSync(path.join(process.cwd(), "data/ai-models.json"), "utf8"));
    const rebuilt = buildSnapshot({ readme, source: snap.source, importedAt: snap.source.importedAt, icons: [], iconBasis: "x", previous: snap, aiModels });
    expect(rebuilt.listings.map((l) => l.id)).toEqual(snap.listings.map((l) => l.id));
    expect(rebuilt.placements).toEqual(snap.placements);
  });
});
