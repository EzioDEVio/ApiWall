import { requireReviewer } from "@/lib/server/reviewAuth";
import { snapshot } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireReviewer(req);
  if (!auth.ok) return auth.response;
  const data = snapshot();
  const subs = [...data.submissions].sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return Response.json({ submissions: subs }, { headers: { "cache-control": "no-store" } });
}
