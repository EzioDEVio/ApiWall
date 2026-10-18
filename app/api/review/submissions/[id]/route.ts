import { requireReviewer } from "@/lib/server/reviewAuth";
import { deleteLogo, transact } from "@/lib/server/store";
import { applyReviewAction, type ReviewAction, ReviewError } from "@/lib/providers/service";

export const dynamic = "force-dynamic";

const TYPES = new Set(["edit", "approve", "reject", "remove", "verify-claim", "clear-claim"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireReviewer(req, { mutation: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let action: ReviewAction;
  try {
    action = (await req.json()) as ReviewAction;
    if (!action || typeof action !== "object" || !TYPES.has(action.type)) throw new Error();
  } catch {
    return Response.json({ error: "Unknown review action." }, { status: 400 });
  }
  try {
    const result = await transact((d) => {
      const entry = applyReviewAction(d.submissions, id, action, `reviewer:${auth.sid}`, new Date().toISOString());
      d.audit.push(entry);
      const sub = d.submissions.find((s) => s.id === id)!;
      // Removing a listing also deletes its uploaded logo file.
      if (action.type === "remove" && sub.logoFile) {
        deleteLogo(sub.logoFile.file);
        sub.logoFile = null;
        sub.review.logoApproved = false;
      }
      return sub;
    });
    return Response.json({ submission: result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
