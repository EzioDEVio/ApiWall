// Logo suggestions: pure review rules, the public projection, and the real route handlers.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyLogoAction, createLogoSuggestion, LogoReviewError, parseLogoInput, publicLogoOverrides } from "@/lib/logos/service";
import type { LogoSuggestion } from "@/lib/logos/types";
import { buildEntries, EMPTY_FILTERS, filterEntries, hasLogo } from "@/lib/explore/model";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const NOW = 1_800_000_000_000;
const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const monogramListing = snap.listings.find((l) => !snap.marks[l.id] || snap.marks[l.id]!.type === "monogram")!;
const file = (n: string) => ({ file: `${n}.png`, mime: "image/png" as const, bytes: 100 });
const input = { listingId: monogramListing.id, sourceUrl: "https://example.com/press", note: "" };
const ctx = (id: string, origin: "public" | "reviewer" = "public") => ({ id, now: "2026-10-17T00:00:00.000Z", file: file(id), listingName: "X", origin, actor: origin === "public" ? "public" : "reviewer:abc" });

describe("logo suggestion input", () => {
  const ok = { listingId: monogramListing.id, sourceUrl: "https://example.com/brand", note: "Official press kit", startedAt: String(NOW - 10_000), company_fax: "" };
  it("accepts a listing, an https source and a short note", () => {
    expect(parseLogoInput(ok, { now: NOW, public: true })).toEqual({ ok: true, data: { listingId: ok.listingId, sourceUrl: ok.sourceUrl, note: ok.note } });
  });
  it("rejects bots, secrets, http sources and unknown IDs", () => {
    expect(parseLogoInput({ ...ok, company_fax: "x" }, { now: NOW, public: true })).toEqual({ ok: false, kind: "spam" });
    expect(parseLogoInput({ ...ok, startedAt: String(NOW - 500) }, { now: NOW, public: true })).toEqual({ ok: false, kind: "spam" });
    expect(parseLogoInput({ ...ok, note: "key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345" }, { now: NOW, public: true })).toMatchObject({ ok: false, kind: "secret" });
    expect(parseLogoInput({ ...ok, sourceUrl: "http://example.com" }, { now: NOW, public: true })).toMatchObject({ ok: false, kind: "invalid", errors: { sourceUrl: expect.any(String) } });
    expect(parseLogoInput({ ...ok, listingId: "../../etc" }, { now: NOW, public: true })).toMatchObject({ ok: false, errors: { listingId: "Unknown listing" } });
  });
  it("reviewer uploads skip the visitor spam checks", () => {
    expect(parseLogoInput({ listingId: ok.listingId, sourceUrl: ok.sourceUrl }, { public: false }).ok).toBe(true);
  });
});

describe("logo review rules", () => {
  it("visitor suggestions wait for review and are not public", () => {
    const all: LogoSuggestion[] = [];
    const r = createLogoSuggestion(all, input, ctx("l0000000000000001"));
    expect(r.suggestion.status).toBe("pending");
    expect(r.audit.map((a) => a.action)).toEqual(["logo-suggested"]);
    expect(publicLogoOverrides(all)).toEqual([]);
  });

  it("approving publishes the logo and replaces (and deletes) the previous one for that listing", () => {
    const all: LogoSuggestion[] = [];
    createLogoSuggestion(all, input, ctx("l0000000000000001"));
    createLogoSuggestion(all, input, ctx("l0000000000000002"));
    applyLogoAction(all, "l0000000000000001", { type: "approve" }, "reviewer:a", "2026-10-17T01:00:00.000Z");
    const r = applyLogoAction(all, "l0000000000000002", { type: "approve" }, "reviewer:a", "2026-10-17T02:00:00.000Z");
    expect(r.deleteFiles).toEqual(["l0000000000000001.png"]);
    expect(all.map((x) => x.status)).toEqual(["replaced", "approved"]);
    expect(publicLogoOverrides(all)).toEqual([{ listingId: input.listingId, src: "/api/logos/l0000000000000002", sourceUrl: input.sourceUrl, approvedAt: "2026-10-17T02:00:00.000Z" }]);
  });

  it("a reviewer's own upload is published at once", () => {
    const all: LogoSuggestion[] = [];
    const r = createLogoSuggestion(all, input, ctx("l00000000000000aa", "reviewer"));
    expect(r.suggestion.status).toBe("approved");
    expect(r.audit.map((a) => a.action)).toEqual(["logo-uploaded", "logo-approved"]);
    expect(publicLogoOverrides(all)).toHaveLength(1);
  });

  it("reject and remove need a reason and delete the file", () => {
    const all: LogoSuggestion[] = [];
    createLogoSuggestion(all, input, ctx("l0000000000000001"));
    expect(() => applyLogoAction(all, "l0000000000000001", { type: "reject", reason: "" }, "r", "t")).toThrow(LogoReviewError);
    expect(() => applyLogoAction(all, "l0000000000000001", { type: "remove", reason: "nope" }, "r", "t")).toThrow(/Only approved/);
    const r = applyLogoAction(all, "l0000000000000001", { type: "reject", reason: "Not the official logo" }, "r", "t");
    expect(r.deleteFiles).toEqual(["l0000000000000001.png"]);
    expect(all[0]).toMatchObject({ status: "rejected", file: null, reason: "Not the official logo" });
    expect(() => applyLogoAction(all, "l0000000000000001", { type: "approve" }, "r", "t")).toThrow(/Only pending/);
  });

  it("the public projection never includes notes, origins or pending images", () => {
    const all: LogoSuggestion[] = [];
    createLogoSuggestion(all, { ...input, note: "private note" }, ctx("l00000000000000aa", "reviewer"));
    createLogoSuggestion(all, input, ctx("l00000000000000bb"));
    const out = JSON.stringify(publicLogoOverrides(all));
    expect(out).not.toContain("private note");
    expect(out).not.toContain("reviewer");
    expect(out).not.toContain("l00000000000000bb");
  });
});

describe("approved logos on the map", () => {
  it("replace the tile's monogram, are labelled reviewer-approved, and the logo filter follows", () => {
    const before = buildEntries(snap, null);
    const missing = filterEntries(before, { ...EMPTY_FILTERS, logo: "missing" });
    expect(missing.length).toBe(before.filter((e) => !hasLogo(e)).length);
    expect(missing.map((e) => e.id)).toContain(monogramListing.id);
    const after = buildEntries(snap, {
      listings: [],
      catalogClaims: [],
      logoOverrides: [{ listingId: monogramListing.id, src: "/api/logos/l0000000000000001", sourceUrl: "https://example.com/press", approvedAt: "2026-10-17T00:00:00.000Z" }],
    });
    const e = after.find((x) => x.id === monogramListing.id)!;
    expect(e.mark).toMatchObject({ type: "logo", src: "/api/logos/l0000000000000001", reviewed: true, source: { basis: "Approved by a ApiWall reviewer" } });
    expect(filterEntries(after, { ...EMPTY_FILTERS, logo: "missing" }).length).toBe(missing.length - 1);
    expect(filterEntries(after, { ...EMPTY_FILTERS, logo: "has" }).map((x) => x.id)).toContain(monogramListing.id);
    // Catalog facts are unchanged.
    const b = before.find((x) => x.id === e.id)!;
    expect({ ...e, mark: null }).toEqual({ ...b, mark: null });
  });
});

// ---- real route handlers ---------------------------------------------------
const TOKEN = "unit-test-reviewer-token-0123456789";
const ORIGIN = "http://localhost:3000";
let dir = "";
const PNG = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: "image/png" });
const SVG = () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" });
const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", origin: ORIGIN, ...extra });

describe("logo routes", () => {
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "tessera-logos-"));
    process.env.TESSERA_DATA_DIR = dir;
    process.env.REVIEWER_TOKEN_SHA256 = createHash("sha256").update(TOKEN).digest("hex");
    process.env.REVIEW_SESSION_SECRET = "unit-test-session-secret-0123456789abcdef";
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(async () => {
    const rl = await import("@/lib/server/rateLimit");
    rl.logoLimiter.reset();
    rl.logoGlobalLimiter.reset();
    rl.loginLimiter.reset();
  });

  async function suggest(over: Record<string, string> = {}, blob: Blob | null = PNG()) {
    const fd = new FormData();
    const fields = { listingId: monogramListing.id, sourceUrl: "https://example.com/press", note: "", startedAt: String(Date.now() - 10_000), company_fax: "", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (blob) fd.set("logoFile", blob, "logo.png");
    const { POST } = await import("@/app/api/logo-suggestions/route");
    return POST(new Request(`${ORIGIN}/api/logo-suggestions`, { method: "POST", body: fd, headers: headers() }));
  }
  async function cookie() {
    const { POST } = await import("@/app/api/review/login/route");
    const res = await POST(new Request(`${ORIGIN}/api/review/login`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ token: TOKEN }) }));
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }
  const feed = async () => (await (await (await import("@/app/api/providers/public/route")).GET()).json()) as { logoOverrides: { listingId: string; src: string }[] };
  const serve = async (id: string) => (await import("@/app/api/logos/[id]/route")).GET(new Request(`${ORIGIN}/api/logos/${id}`), { params: Promise.resolve({ id }) });

  it("a visitor's logo stays private until a reviewer approves it, then is served safely", async () => {
    const res = await suggest();
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await serve(id)).status).toBe(404);
    expect((await feed()).logoOverrides).toEqual([]);

    const c = await cookie();
    const list = await (await import("@/app/api/review/logos/route")).GET(new Request(`${ORIGIN}/api/review/logos`, { headers: headers({ cookie: c }) }));
    expect(((await list.json()) as { logos: { id: string; status: string }[] }).logos.find((l) => l.id === id)?.status).toBe("pending");

    const { PATCH } = await import("@/app/api/review/logos/[id]/route");
    const anon = await PATCH(new Request(`${ORIGIN}/api/review/logos/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ type: "approve" }) }), { params: Promise.resolve({ id }) });
    expect(anon.status).toBe(401);
    const cross = await PATCH(new Request(`${ORIGIN}/api/review/logos/${id}`, { method: "PATCH", headers: headers({ cookie: c, origin: "https://evil.example" }), body: JSON.stringify({ type: "approve" }) }), {
      params: Promise.resolve({ id }),
    });
    expect(cross.status).toBe(403);
    const ok = await PATCH(new Request(`${ORIGIN}/api/review/logos/${id}`, { method: "PATCH", headers: headers({ cookie: c, "content-type": "application/json" }), body: JSON.stringify({ type: "approve" }) }), {
      params: Promise.resolve({ id }),
    });
    expect(ok.status).toBe(200);
    expect((await feed()).logoOverrides).toEqual([expect.objectContaining({ listingId: monogramListing.id, src: `/api/logos/${id}` })]);
    const img = await serve(id);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("refuses SVG, unknown listings, secrets and cross-site posts, storing nothing", async () => {
    const store = await import("@/lib/server/store");
    const before = store.snapshot().logos.length;
    expect((await suggest({}, SVG())).status).toBe(422);
    expect((await suggest({}, null)).status).toBe(422);
    expect((await suggest({ listingId: "api-not-a-real-listing-123" })).status).toBe(422);
    const secret = await suggest({ note: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789" });
    expect(secret.status).toBe(422);
    expect(JSON.stringify(await secret.json())).not.toContain("ghp_");
    const { POST } = await import("@/app/api/logo-suggestions/route");
    expect((await POST(new Request(`${ORIGIN}/api/logo-suggestions`, { method: "POST", body: new FormData(), headers: headers({ origin: "https://evil.example" }) }))).status).toBe(403);
    expect(store.snapshot().logos.length).toBe(before);
  });

  it("caps pending suggestions per listing", async () => {
    const other = snap.listings.find((l) => l.id !== monogramListing.id && l.kind === "api")!;
    for (let i = 0; i < 3; i++) expect((await suggest({ listingId: other.id })).status).toBe(201);
    expect((await suggest({ listingId: other.id })).status).toBe(409);
  });

  it("a reviewer can publish a logo for any listing directly, replacing the old file", async () => {
    const c = await cookie();
    const { POST } = await import("@/app/api/review/logos/route");
    const fd = new FormData();
    fd.set("listingId", monogramListing.id);
    fd.set("sourceUrl", "https://example.com/brand");
    fd.set("logoFile", PNG(), "x.png");
    const anon = await POST(new Request(`${ORIGIN}/api/review/logos`, { method: "POST", body: fd, headers: headers() }));
    expect(anon.status).toBe(401);
    const res = await POST(new Request(`${ORIGIN}/api/review/logos`, { method: "POST", body: fd, headers: headers({ cookie: c }) }));
    expect(res.status).toBe(201);
    const { logo } = (await res.json()) as { logo: { id: string; status: string } };
    expect(logo.status).toBe("approved");
    const overrides = (await feed()).logoOverrides.filter((o) => o.listingId === monogramListing.id);
    expect(overrides).toEqual([expect.objectContaining({ src: `/api/logos/${logo.id}` })]);
    const store = await import("@/lib/server/store");
    const replaced = store.snapshot().logos.filter((l) => l.listingId === monogramListing.id && l.status === "replaced");
    expect(replaced.length).toBeGreaterThan(0);
    for (const r of replaced) {
      expect(r.file).toBeNull();
      expect(existsSync(path.join(dir, "logos", `${r.id}.png`))).toBe(false);
    }
    expect(store.snapshot().audit.some((a) => a.action === "logo-uploaded")).toBe(true);
  });
});
