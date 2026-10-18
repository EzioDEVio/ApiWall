import { describe, expect, it } from "vitest";
import { parseSubmission, sniffImage } from "@/lib/providers/validation";
import { applyReviewAction, createSubmission, ReviewError, toPublicPayload } from "@/lib/providers/service";
import { findSecrets, redact } from "@/lib/security/secrets";
import { createLimiter } from "@/lib/server/rateLimit";
import { PROVIDER_REGION } from "@/lib/catalog/placement";
import type { Submission } from "@/lib/providers/types";

import { NOW, validForm } from "../helpers";

describe("submission validation", () => {
  it("accepts a complete submission and strips markup", () => {
    const r = parseSubmission(validForm({ description: "<b>Hourly</b> forecasts and alerts for any location." }), { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.description).toBe("Hourly forecasts and alerts for any location.");
  });

  it("requires the contact email to be on the provider's domain", () => {
    const r = parseSubmission(validForm({ contactEmail: "someone@gmail.com" }), { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "invalid") expect(r.errors.contactEmail).toMatch(/acme/);
  });

  it("requires https URLs and a claim source", () => {
    const r = parseSubmission(validForm({ docsUrl: "http://docs.acmeweather.test", claimSourceUrl: "" }), { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "invalid") {
      expect(r.errors.docsUrl).toBeDefined();
      expect(r.errors.claimSourceUrl).toBeDefined();
    }
  });

  it("requires demo details for a demo request", () => {
    const r = parseSubmission(validForm({ request: "provider-demo" }), { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === "invalid") expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["demoUseCase", "demoCostOwner", "demoAbuseContact"]));
  });

  it("rejects honeypot and instant submissions as spam", () => {
    expect(parseSubmission(validForm({ company_fax: "555" }), { now: NOW })).toEqual({ ok: false, kind: "spam" });
    expect(parseSubmission(validForm({ startedAt: String(NOW - 500) }), { now: NOW })).toEqual({ ok: false, kind: "spam" });
    expect(parseSubmission(validForm({ startedAt: "nope" }), { now: NOW })).toEqual({ ok: false, kind: "spam" });
  });

  it("refuses anything that looks like a secret, naming the field but not the value", () => {
    const cases: Record<string, string> = {
      pricing: "Use key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345 for free access",
      description: "Our AWS key AKIAIOSFODNN7EXAMPLE lets you try it out today",
      rateLimits: "api_key=9f8e7d6c5b4a39281706f5e4d3c2b1a0",
      demoUseCase: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
      providerName: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    };
    for (const [field, value] of Object.entries(cases)) {
      const r = parseSubmission(validForm({ [field]: value }), { now: NOW });
      expect(r.ok, field).toBe(false);
      if (!r.ok) {
        expect(r.kind, field).toBe("secret");
        if (r.kind === "secret") {
          expect(r.findings[0]!.field).toBe(field);
          expect(JSON.stringify(r)).not.toContain(value);
        }
      }
    }
  });

  it("does not flag ordinary text, URLs or emails as secrets", () => {
    expect(findSecrets({ a: "Free tier: 1000 requests per day, then $0.001 per request", b: "https://docs.acmeweather.test/v2/reference/authentication#api-keys", c: "devrel@acmeweather.test" })).toEqual([]);
  });

  it("redacts secrets from log text", () => {
    const t = redact("failed with sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv and AKIAIOSFODNN7EXAMPLE");
    expect(t).not.toContain("sk-ant");
    expect(t).not.toContain("AKIA");
    expect(t).toContain("[REDACTED]");
  });

  it("accepts PNG/JPEG/WebP by magic bytes and rejects SVG or disguised files", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.mime).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to the limit per window, then blocks with a retry time", () => {
    const l = createLimiter(3, 60_000);
    expect([1, 2, 3].map(() => l.check("k", 1000).ok)).toEqual([true, true, true]);
    const blocked = l.check("k", 2000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(l.check("other", 2000).ok).toBe(true);
    expect(l.check("k", 62_000).ok).toBe(true);
  });
});

function makeSub(id: string, over: Record<string, string> = {}): Submission {
  const r = parseSubmission(validForm(over), { now: NOW });
  if (!r.ok) throw new Error("fixture invalid: " + JSON.stringify(r));
  return createSubmission(r.data, { id, now: "2026-10-17T00:00:00.000Z", logoFile: null }).submission;
}
const T = "2026-10-17T12:00:00.000Z";
const goodClaim = {
  status: "provider-confirmed-free-tier" as const,
  sourceUrl: "https://acmeweather.test/pricing",
  verifiedAt: "2026-10-17",
  limits: "1,000 calls/day",
  eligibility: "Everyone",
  expiration: "No expiry stated",
  terms: "Free tier for non-commercial use",
};

describe("review workflow", () => {
  it("keeps submissions private until approved", () => {
    const all = [makeSub("a")];
    expect(all[0]!.status).toBe("pending");
    expect(toPublicPayload(all).listings).toHaveLength(0);
    applyReviewAction(all, "a", { type: "approve", sponsored: false, logo: false }, "reviewer:x", T);
    const pub = toPublicPayload(all);
    expect(pub.listings).toHaveLength(1);
    expect(pub.listings[0]!.slot).toBeGreaterThanOrEqual(PROVIDER_REGION.start);
    expect(JSON.stringify(pub)).not.toContain("devrel@acmeweather"); // contact never public
  });

  it("only labels a tile sponsored when it was requested and approved as sponsored", () => {
    const all = [makeSub("a"), makeSub("b", { request: "sponsored-tile" })];
    applyReviewAction(all, "a", { type: "approve", sponsored: true, logo: false }, "r", T);
    applyReviewAction(all, "b", { type: "approve", sponsored: true, logo: false }, "r", T);
    const pub = toPublicPayload(all).listings;
    expect(pub.find((l) => l.id === "provider-a")!.sponsored).toBe(false);
    expect(pub.find((l) => l.id === "provider-b")!.sponsored).toBe(true);
  });

  it("shows a claim only after a reviewer verifies it with complete disclosures", () => {
    const all = [makeSub("a")];
    applyReviewAction(all, "a", { type: "approve", sponsored: false, logo: false }, "r", T);
    expect(toPublicPayload(all).listings[0]!.claim).toBeNull();
    expect(() => applyReviewAction(all, "a", { type: "verify-claim", claim: { ...goodClaim, eligibility: "" } }, "r", T)).toThrow(ReviewError);
    expect(() => applyReviewAction(all, "a", { type: "verify-claim", claim: { ...goodClaim, sourceUrl: "http://x.example" } }, "r", T)).toThrow(ReviewError);
    expect(() => applyReviewAction(all, "a", { type: "verify-claim", claim: { ...goodClaim, verifiedAt: "2099-01-01" } }, "r", T)).toThrow(ReviewError);
    expect(() => applyReviewAction(all, "a", { type: "verify-claim", claim: { ...goodClaim, status: "provider-sponsored-demo" } }, "r", T)).toThrow(/demo/);
    applyReviewAction(all, "a", { type: "verify-claim", claim: goodClaim }, "r", T);
    expect(toPublicPayload(all).listings[0]!.claim).toEqual(goodClaim);
  });

  it("attaches claims for existing catalog entries without creating a tile or a sponsorship", () => {
    const all = [makeSub("c", { request: "sponsored-tile", catalogListingId: "api-nasa-abc123" })];
    applyReviewAction(all, "c", { type: "approve", sponsored: true, logo: false }, "r", T);
    applyReviewAction(all, "c", { type: "verify-claim", claim: goodClaim }, "r", T);
    const pub = toPublicPayload(all);
    expect(pub.listings).toHaveLength(0);
    expect(pub.catalogClaims).toEqual([{ listingId: "api-nasa-abc123", providerName: "Acme Inc", claim: goodClaim }]);
    expect(all[0]!.review.sponsoredApproved).toBe(false);
  });

  it("rejects, removes and edits with an audit entry for each", () => {
    const all = [makeSub("a"), makeSub("b")];
    const rej = applyReviewAction(all, "a", { type: "reject", reason: "Not an API" }, "reviewer:1", T);
    expect(rej).toMatchObject({ action: "rejected", actor: "reviewer:1", note: "Not an API" });
    applyReviewAction(all, "b", { type: "approve", sponsored: false, logo: false }, "r", T);
    const ed = applyReviewAction(all, "b", { type: "edit", fields: { apiName: "Acme Forecasts", https: "no" } }, "r", T);
    expect(ed.changes).toEqual({ apiName: { from: "Acme Weather", to: "Acme Forecasts" }, https: { from: "yes", to: "no" } });
    expect(() => applyReviewAction(all, "b", { type: "edit", fields: { docsUrl: "javascript:alert(1)" } }, "r", T)).toThrow(ReviewError);
    const rm = applyReviewAction(all, "b", { type: "remove", reason: "Provider asked" }, "r", T);
    expect(rm.action).toBe("removed");
    expect(toPublicPayload(all).listings).toHaveLength(0);
    expect(() => applyReviewAction(all, "b", { type: "approve", sponsored: false, logo: false }, "r", T)).toThrow(ReviewError);
  });

  it("assigns each approved listing its own provider slot", () => {
    const all = ["a", "b", "c"].map((id) => makeSub(id));
    for (const s of all) applyReviewAction(all, s.id, { type: "approve", sponsored: false, logo: false }, "r", T);
    const slots = toPublicPayload(all).listings.map((l) => l.slot);
    expect(new Set(slots).size).toBe(3);
  });
});
