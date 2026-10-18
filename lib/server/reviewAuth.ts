import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { reviewConfig, sameOrigin } from "./config";

export const SESSION_COOKIE = "tessera_review";
const SESSION_TTL_SEC = 8 * 60 * 60;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function verifyReviewerToken(token: string): boolean {
  const cfg = reviewConfig();
  if (!cfg || typeof token !== "string" || token.length < 16 || token.length > 512) return false;
  const got = createHash("sha256").update(token).digest();
  const want = Buffer.from(cfg.tokenSha256, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export function createSession(now = Date.now()): { value: string; sid: string; maxAge: number } {
  const cfg = reviewConfig();
  if (!cfg) throw new Error("Reviewer access is not configured");
  const sid = randomBytes(9).toString("base64url");
  const payload = b64(JSON.stringify({ sid, exp: Math.floor(now / 1000) + SESSION_TTL_SEC }));
  const sig = createHmac("sha256", cfg.sessionSecret).update(payload).digest("base64url");
  return { value: `${payload}.${sig}`, sid, maxAge: SESSION_TTL_SEC };
}

export function readSession(cookieValue: string | undefined, now = Date.now()): { sid: string } | null {
  const cfg = reviewConfig();
  if (!cfg || !cookieValue) return null;
  const [payload, sig] = cookieValue.split(".");
  if (!payload || !sig) return null;
  const want = createHmac("sha256", cfg.sessionSecret).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sid?: string; exp?: number };
    if (!p.sid || !p.exp || p.exp * 1000 < now) return null;
    return { sid: p.sid };
  } catch {
    return null;
  }
}

function cookieFrom(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

export type ReviewerCheck = { ok: true; sid: string } | { ok: false; response: Response };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Guards every reviewer API route. Mutations also require a same-origin request. */
export function requireReviewer(req: Request, opts: { mutation?: boolean } = {}): ReviewerCheck {
  if (!reviewConfig()) return { ok: false, response: json(503, { error: "Reviewer access is not configured on this server." }) };
  const s = readSession(cookieFrom(req));
  if (!s) return { ok: false, response: json(401, { error: "Sign in as a reviewer." }) };
  if (opts.mutation && !sameOrigin(req)) return { ok: false, response: json(403, { error: "Cross-site request rejected." }) };
  return { ok: true, sid: s.sid };
}

export function sessionCookieHeader(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export const clearCookieHeader = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
