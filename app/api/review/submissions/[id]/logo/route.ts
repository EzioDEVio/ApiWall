import { requireReviewer } from "@/lib/server/reviewAuth";
import { readLogo, snapshot } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Lets a signed-in reviewer see an uploaded logo before approving it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireReviewer(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const sub = snapshot().submissions.find((s) => s.id === id);
  const bytes = sub?.logoFile ? readLogo(sub.logoFile.file) : null;
  if (!sub?.logoFile || !bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": sub.logoFile.mime, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  });
}
