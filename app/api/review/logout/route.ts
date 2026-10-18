import { clearCookieHeader } from "@/lib/server/reviewAuth";
import { sameOrigin } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  return Response.json({ ok: true }, { headers: { "set-cookie": clearCookieHeader() } });
}
