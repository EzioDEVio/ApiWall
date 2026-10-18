import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import { codeSamples } from "@/lib/explore/snippets";
import { buildEntries, EMPTY_FILTERS, type Entry } from "@/lib/explore/model";
import { asset, issueUrl, REPO_URL } from "@/lib/site";
import { applyCommunityLogos, COMMUNITY_BASIS } from "@/lib/catalog/community";
import type { CatalogSnapshot, IdentityMark } from "@/lib/catalog/types";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const entries = buildEntries(snap, null);
const byName = (n: string) => entries.find((e) => e.name === n)!;

describe("shareable URLs", () => {
  it("round-trips category, search, filters, view and the open API", () => {
    const state = { filters: { ...EMPTY_FILTERS, category: "ai-models", q: "gpt", auth: "apiKey" as const, logo: "missing" as const }, view: "list" as const, api: "api-openai-api-x1" };
    const search = toUrlSearch(state);
    expect(search).toBe("?q=gpt&cat=ai-models&auth=apiKey&logo=missing&view=list&api=api-openai-api-x1");
    expect(parseUrlState(search)).toEqual(state);
  });
  it("ignores invalid values instead of trusting them", () => {
    const s = parseUrlState("?cat=../../x&auth=root&https=maybe&view=grid&api=<script>&type=mcp");
    expect(s.filters).toEqual({ ...EMPTY_FILTERS, kind: "mcp" });
    expect(s.view).toBeNull();
    expect(s.api).toBeNull();
  });
  it("drops cleared filters and keeps unrelated parameters", () => {
    expect(toUrlSearch({ filters: EMPTY_FILTERS, view: null, api: null }, "?q=old&cat=animals&utm_source=x")).toBe("?utm_source=x");
  });
});

describe("site helpers", () => {
  it("builds pre-filled issue form links for this repository", () => {
    const u = new URL(issueUrl("suggest-logo.yml", "Logo: Cat Facts", { listing: "api-cat-facts-1", name: "Cat Facts", source: "" }));
    expect(u.origin + u.pathname).toBe(`${REPO_URL}/issues/new`);
    expect(u.searchParams.get("template")).toBe("suggest-logo.yml");
    expect(u.searchParams.get("listing")).toBe("api-cat-facts-1");
    expect(u.searchParams.has("source")).toBe(false);
  });
  it("leaves external URLs alone", () => {
    expect(asset("https://example.com/x.png")).toBe("https://example.com/x.png");
    expect(asset("/marks/a.png")).toMatch(/\/marks\/a\.png$/);
  });
  it("issue form field ids match the templates", () => {
    const tpl = (f: string) => readFileSync(path.join(process.cwd(), ".github/ISSUE_TEMPLATE", f), "utf8");
    for (const id of ["listing", "name", "source"]) expect(tpl("suggest-logo.yml")).toContain(`id: ${id}\n`);
    for (const id of ["listing", "name"]) expect(tpl("report-listing.yml")).toContain(`id: ${id}\n`);
  });
});

describe("starter code", () => {
  it("uses the checked API host and auth header for AI model APIs, with the key from the environment", () => {
    const s = codeSamples(byName("Claude API"))!;
    expect(s.baseKnown).toBe(true);
    const curl = s.samples.find((x) => x.id === "curl")!.code;
    expect(curl).toContain("https://api.anthropic.com/PATH_FROM_THE_DOCS");
    expect(curl).toContain('-H "Authorization: Bearer $API_KEY"');
    expect(s.samples.find((x) => x.id === "js")!.code).toContain("process.env.API_KEY");
    expect(s.samples.find((x) => x.id === "python")!.code).toContain("os.environ['API_KEY']");
    const gemini = codeSamples(byName("Google Gemini"))!.samples[0]!.code;
    expect(gemini).toContain('-H "x-goog-api-key: $API_KEY"');
  });
  it("never invents an endpoint: unknown hosts get a placeholder and a pointer to the docs", () => {
    const e = entries.find((x) => x.kind === "api" && x.auth === "none" && x.url && !/\/\/api\./.test(x.url) && !x.aiModel)!;
    const s = codeSamples(e)!;
    expect(s.baseKnown).toBe(false);
    expect(s.samples[0]!.code).toContain("https://API_HOST/PATH_FROM_THE_DOCS");
    expect(s.samples[0]!.code).not.toContain("Authorization");
    expect(s.notes.join(" ")).toContain(new URL(e.url!).hostname);
  });
  it("warns about CORS and missing HTTPS, and skips MCP servers", () => {
    const noCors = entries.find((x) => x.kind === "api" && x.cors === "no")!;
    expect(codeSamples(noCors)!.notes.join(" ")).toMatch(/call it from your server/);
    const noHttps = entries.find((x) => x.kind === "api" && x.https === "no")!;
    expect(codeSamples(noHttps)!.notes.join(" ")).toMatch(/without HTTPS/);
    expect(codeSamples(entries.find((x) => x.kind === "mcp") as Entry)).toBeNull();
  });
});

describe("community logos", () => {
  it("take precedence, are labelled maintainer-approved, and skip unknown IDs or files", () => {
    const l = snap.listings[0]!;
    const marks: Record<string, IdentityMark> = { [l.id]: { type: "monogram", text: "XX", seed: 1 } };
    const warnings = applyCommunityLogos(
      marks,
      snap.listings,
      {
        version: 1,
        logos: {
          [l.id]: { file: `${l.id}.png`, listingName: l.name, sourceUrl: "https://example.com/brand", approvedAt: "2026-10-17T00:00:00.000Z" },
          "api-gone-1": { file: "api-gone-1.png", listingName: "Gone", sourceUrl: "https://example.com", approvedAt: "2026-10-17" },
          [snap.listings[1]!.id]: { file: "missing.png", listingName: "x", sourceUrl: "https://example.com", approvedAt: "2026-10-17" },
        },
      },
      (name) => name !== "missing.png",
    );
    expect(marks[l.id]).toMatchObject({ type: "image", src: `/marks/community/${l.id}.png`, basis: COMMUNITY_BASIS, sourceUrl: "https://example.com/brand" });
    expect(warnings).toHaveLength(2);
  });
});
