import { requireReviewer } from "@/lib/server/reviewAuth";
import { deleteLogo, transact } from "@/lib/server/store";
import { applyLogoAction, type LogoAction, LogoReviewError } from "@/lib/logos/service";

export const dynamic = "force-dynamic";

const TYPES = new Set(["approve", "reject", "remove"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireReviewer(req, { mutation: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let action: LogoAction;
  try {
    action = (await req.json()) as LogoAction;
    if (!action || typeof action !== "object" || !TYPES.has(action.type)) throw new Error();
  } catch {
    return Response.json({ error: "Unknown review action." }, { status: 400 });
  }
  try {
    const logo = await transact((d) => {
      const r = applyLogoAction(d.logos, id, action, `reviewer:${auth.sid}`, new Date().toISOString());
      d.audit.push(...r.audit);
      for (const f of r.deleteFiles) deleteLogo(f);
      return d.logos.find((x) => x.id === id)!;
    });
    return Response.json({ logo }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LogoReviewError) return Response.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
