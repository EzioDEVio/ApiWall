import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEntries, EMPTY_FILTERS, filterEntries, isFiltered } from "@/lib/explore/model";
import { explainAuth, explainCors } from "@/lib/explore/explain";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PublicProviderPayload, VerifiedAccessClaim } from "@/lib/providers/types";
import { PROVIDER_REGION } from "@/lib/catalog/placement";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const entries = buildEntries(snap, null);
const claim: VerifiedAccessClaim = {
  status: "provider-confirmed-free-tier",
  sourceUrl: "https://example.com/pricing",
  verifiedAt: "2026-10-01",
  limits: "1,000 requests/day",
  eligibility: "Everyone",
  expiration: "No expiry stated",
  terms: "Free tier for non-commercial use",
};

describe("search and filters", () => {
  it("matches every listing with no filters", () => {
    expect(filterEntries(entries, EMPTY_FILTERS)).toHaveLength(snap.listings.length);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
  });

  it("searches names and descriptions, all terms required, case-insensitive", () => {
    const r = filterEntries(entries, { ...EMPTY_FILTERS, q: "CAT facts" });
    expect(r.length).toBeGreaterThan(0);
    for (const e of r) expect(e.search).toContain("cat");
    expect(filterEntries(entries, { ...EMPTY_FILTERS, q: "zzqxnotathing" })).toHaveLength(0);
  });

  it("filters by category, auth, HTTPS, CORS and type", () => {
    const animals = filterEntries(entries, { ...EMPTY_FILTERS, category: "animals" });
    expect(animals.length).toBe(snap.categories.find((c) => c.slug === "animals")!.count);
    const keyless = filterEntries(entries, { ...EMPTY_FILTERS, auth: "none" });
    expect(keyless.every((e) => e.auth === "none")).toBe(true);
    const noHttps = filterEntries(entries, { ...EMPTY_FILTERS, https: "no" });
    expect(noHttps.every((e) => e.https === "no")).toBe(true);
    const cors = filterEntries(entries, { ...EMPTY_FILTERS, cors: "yes", https: "yes" });
    expect(cors.every((e) => e.cors === "yes" && e.https === "yes")).toBe(true);
    const mcp = filterEntries(entries, { ...EMPTY_FILTERS, kind: "mcp" });
    expect(mcp.length).toBe(snap.listings.filter((l) => l.kind === "mcp").length);
  });

  it("treats every catalog listing as access unknown until a claim is verified", () => {
    expect(entries.every((e) => e.access === "unknown" && e.claim === null && !e.sponsored)).toBe(true);
    expect(filterEntries(entries, { ...EMPTY_FILTERS, access: "provider-confirmed-free-tier" })).toHaveLength(0);
  });

  it("explains imported values in plain language", () => {
    expect(explainAuth("apiKey", "apiKey")).toMatch(/API key/);
    expect(explainAuth("other", "Token in body")).toContain("Token in body");
    expect(explainCors("no", "api")).toMatch(/server/);
  });
});

describe("provider content stays separate from catalog facts", () => {
  const target = snap.listings.find((l) => l.kind === "api")!;
  const payload: PublicProviderPayload = {
    listings: [
      {
        id: "provider-abc",
        providerName: "Acme",
        name: "Acme Weather",
        description: "Forecasts",
        category: "Weather",
        url: "https://acme.example/docs",
        auth: "apiKey",
        https: "yes",
        cors: "no",
        sponsored: true,
        logo: null,
        claim: { ...claim, eligibility: "" }, // incomplete → must not display
        slot: PROVIDER_REGION.start,
        approvedAt: "2026-10-01T00:00:00Z",
      },
    ],
    catalogClaims: [{ listingId: target.id, providerName: "Owner", claim }],
  };
  const withProviders = buildEntries(snap, payload);

  it("attaches a verified claim to a catalog listing without changing its imported facts", () => {
    const e = withProviders.find((x) => x.id === target.id)!;
    expect(e.access).toBe("provider-confirmed-free-tier");
    expect(e.claim).toEqual(claim);
    expect(e.raw).toEqual(target.raw);
    expect([e.auth, e.https, e.cors]).toEqual([target.auth, target.https, target.cors]);
    expect(e.sponsored).toBe(false); // claims never make a catalog listing sponsored
  });

  it("labels sponsored provider tiles and drops incomplete claims", () => {
    const p = withProviders.find((x) => x.id === "provider-abc")!;
    expect(p.source).toBe("provider");
    expect(p.sponsored).toBe(true);
    expect(p.claim).toBeNull();
    expect(p.access).toBe("unknown");
    expect(p.placement!.slot).toBeGreaterThanOrEqual(PROVIDER_REGION.start);
    expect(filterEntries(withProviders, { ...EMPTY_FILTERS, kind: "provider" }).map((x) => x.id)).toEqual(["provider-abc"]);
  });

  it("never lets a provider tile overlap a catalog tile", () => {
    const catalogSlots = new Set(Object.values(snap.placements).map((p) => p.slot));
    expect(catalogSlots.has(PROVIDER_REGION.start)).toBe(false);
  });
});
