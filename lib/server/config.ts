import "server-only";
import path from "node:path";

export function dataDir(): string {
  return path.resolve(process.cwd(), process.env.TESSERA_DATA_DIR || "data/runtime");
}

/** Reviewer access is available only when both values are configured. */
export function reviewConfig(): { tokenSha256: string; sessionSecret: string } | null {
  const tokenSha256 = (process.env.REVIEWER_TOKEN_SHA256 || "").trim().toLowerCase();
  const sessionSecret = process.env.REVIEW_SESSION_SECRET || "";
  if (!/^[0-9a-f]{64}$/.test(tokenSha256) || sessionSecret.length < 32) return null;
  return { tokenSha256, sessionSecret };
}

/** Rejects cross-site state-changing requests. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") && process.env.TRUST_PROXY === "1" ? req.headers.get("x-forwarded-host") : req.headers.get("host");
    return !!host && o.host === host;
  } catch {
    return false;
  }
}
