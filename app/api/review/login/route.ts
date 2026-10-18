import { createSession, sessionCookieHeader, verifyReviewerToken } from "@/lib/server/reviewAuth";
import { reviewConfig, sameOrigin } from "@/lib/server/config";
import { clientKey, loginLimiter } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!reviewConfig()) return Response.json({ error: "Reviewer access is not configured on this server." }, { status: 503 });
  if (!sameOrigin(req)) return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  const rl = loginLimiter.check(clientKey(req.headers));
  if (!rl.ok) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    /* empty body */
  }
  if (!verifyReviewerToken(token)) return Response.json({ error: "That reviewer token is not valid." }, { status: 401 });
  const s = createSession();
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(s.value, s.maxAge), "cache-control": "no-store" } });
}
