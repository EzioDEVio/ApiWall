// Exercises the real route handlers against a temporary data directory.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validForm } from "../helpers";

const TOKEN = "unit-test-reviewer-token-0123456789";
const ORIGIN = "http://localhost:3000";
let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tessera-"));
  process.env.TESSERA_DATA_DIR = dir;
  process.env.REVIEWER_TOKEN_SHA256 = createHash("sha256").update(TOKEN).digest("hex");
  process.env.REVIEW_SESSION_SECRET = "unit-test-session-secret-0123456789abcdef";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const submissions = () => import("@/app/api/submissions/route");
const publicFeed = () => import("@/app/api/providers/public/route");
const login = () => import("@/app/api/review/login/route");
const reviewList = () => import("@/app/api/review/submissions/route");
const reviewItem = () => import("@/app/api/review/submissions/[id]/route");
const logos = () => import("@/app/api/logos/[id]/route");
const demos = () => import("@/app/api/demos/[id]/route");

const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", origin: ORIGIN, ...extra });

async function submit(over: Record<string, string> = {}, file?: Blob) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(validForm({ startedAt: String(Date.now() - 10_000), ...over }))) fd.set(k, v);
  if (file) fd.set("logoFile", file, "logo.png");
  const { POST } = await submissions();
  return POST(new Request(`${ORIGIN}/api/submissions`, { method: "POST", body: fd, headers: headers() }));
}

async function reviewerCookie(): Promise<string> {
  const { POST } = await login();
  const res = await POST(new Request(`${ORIGIN}/api/review/login`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ token: TOKEN }) }));
  expect(res.status).toBe(200);
  const set = res.headers.get("set-cookie")!;
  expect(set).toMatch(/HttpOnly/);
  expect(set).toMatch(/SameSite=Strict/);
  return set.split(";")[0]!;
}

const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: "image/png" });

beforeEach(async () => {
  (await import("@/lib/server/rateLimit")).submissionLimiter.reset();
  (await import("@/lib/server/rateLimit")).loginLimiter.reset();
});

describe("submission endpoint", () => {
  it("stores a valid submission as pending and keeps it out of the public feed", async () => {
    const res = await submit({}, PNG);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const feed = await (await (await publicFeed()).GET()).json();
    expect(feed.listings).toEqual([]);
    const logo = await (await logos()).GET(new Request(`${ORIGIN}/api/logos/${id}`), { params: Promise.resolve({ id }) });
    expect(logo.status).toBe(404); // unreviewed logos are never served
  });

  it("refuses submissions containing secrets and stores nothing", async () => {
    const before = (await import("@/lib/server/store")).snapshot().submissions.length;
    const res = await submit({ pricing: "free with key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345" });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Never|secret/i);
    expect(JSON.stringify(body)).not.toContain("sk-proj");
    expect((await import("@/lib/server/store")).snapshot().submissions.length).toBe(before);
  });

  it("rejects cross-site posts and rate-limits bursts", async () => {
    const { POST } = await submissions();
    const cross = await POST(new Request(`${ORIGIN}/api/submissions`, { method: "POST", body: new FormData(), headers: headers({ origin: "https://evil.example" }) }));
    expect(cross.status).toBe(403);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await submit({ apiName: `Burst ${i}` })).status);
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it("rejects a disguised logo file", async () => {
    const res = await submit({}, new Blob(["<svg onload=alert(1)>"], { type: "image/png" }));
    expect(res.status).toBe(422);
    expect((await res.json()).fields.logoFile).toMatch(/PNG/);
  });
});

describe("reviewer-only access", () => {
  it("returns 401 without a session and rejects a bad token", async () => {
    const { GET } = await reviewList();
    expect((await GET(new Request(`${ORIGIN}/api/review/submissions`))).status).toBe(401);
    const { POST } = await login();
    const bad = await POST(new Request(`${ORIGIN}/api/review/login`, { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ token: "wrong-token-wrong-token" }) }));
    expect(bad.status).toBe(401);
    const forged = await GET(new Request(`${ORIGIN}/api/review/submissions`, { headers: { cookie: "tessera_review=eyJzaWQiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5fQ.forged" } }));
    expect(forged.status).toBe(401);
  });

  it("lets a signed-in reviewer approve, which publishes the listing and logo", async () => {
    const res = await submit({ request: "sponsored-tile", apiName: "Acme Approved" }, PNG);
    const { id } = (await res.json()) as { id: string };
    const cookie = await reviewerCookie();
    const list = await (await reviewList()).GET(new Request(`${ORIGIN}/api/review/submissions`, { headers: { cookie } }));
    expect(list.status).toBe(200);
    expect(((await list.json()) as { submissions: { id: string }[] }).submissions.some((s) => s.id === id)).toBe(true);

    const { PATCH } = await reviewItem();
    const noOrigin = await PATCH(new Request(`${ORIGIN}/x`, { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ type: "approve", sponsored: true, logo: true }) }), { params: Promise.resolve({ id }) });
    expect(noOrigin.status).toBe(403); // CSRF guard
    const ok = await PATCH(
      new Request(`${ORIGIN}/x`, { method: "PATCH", headers: headers({ cookie, "content-type": "application/json" }), body: JSON.stringify({ type: "approve", sponsored: true, logo: true }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(ok.status).toBe(200);

    const feed = await (await (await publicFeed()).GET()).json();
    const tile = feed.listings.find((l: { id: string }) => l.id === `provider-${id}`);
    expect(tile).toMatchObject({ name: "Acme Approved", sponsored: true, logo: `/api/logos/${id}` });
    expect(JSON.stringify(feed)).not.toContain("devrel@");
    const logo = await (await logos()).GET(new Request(`${ORIGIN}/api/logos/${id}`), { params: Promise.resolve({ id }) });
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/png");
    expect(logo.headers.get("x-content-type-options")).toBe("nosniff");

    const unknown = await PATCH(new Request(`${ORIGIN}/x`, { method: "PATCH", headers: headers({ cookie, "content-type": "application/json" }), body: JSON.stringify({ type: "delete-everything" }) }), { params: Promise.resolve({ id }) });
    expect(unknown.status).toBe(400);
  });

  it("closes reviewer routes entirely when reviewer access is not configured", async () => {
    const saved = process.env.REVIEWER_TOKEN_SHA256;
    delete process.env.REVIEWER_TOKEN_SHA256;
    try {
      const cookie = "tessera_review=anything";
      expect((await (await reviewList()).GET(new Request(`${ORIGIN}/x`, { headers: { cookie } }))).status).toBe(503);
      const { POST } = await login();
      expect((await POST(new Request(`${ORIGIN}/x`, { method: "POST", headers: headers(), body: "{}" }))).status).toBe(503);
    } finally {
      process.env.REVIEWER_TOKEN_SHA256 = saved;
    }
  });
});

describe("disabled demos", () => {
  it("answers 404 for every method and never proxies", async () => {
    const m = await demos();
    for (const fn of [m.GET, m.POST, m.PUT, m.DELETE]) {
      const res = await fn();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/No approved in-site demo/);
    }
  });
});
