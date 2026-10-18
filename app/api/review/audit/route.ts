import { requireReviewer } from "@/lib/server/reviewAuth";
import { snapshot } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireReviewer(req);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const id = url.searchParams.get("submission");
  const audit = snapshot().audit.filter((a) => !id || a.submissionId === id).slice(-500).reverse();
  return Response.json({ audit }, { headers: { "cache-control": "no-store" } });
}
