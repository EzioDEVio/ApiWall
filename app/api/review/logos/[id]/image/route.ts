import { requireReviewer } from "@/lib/server/reviewAuth";
import { readLogo, snapshot } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** Lets a signed-in reviewer see a suggested logo before deciding. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireReviewer(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const l = snapshot().logos.find((x) => x.id === id);
  const bytes = l?.file ? readLogo(l.file.file) : null;
  if (!l?.file || !bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": l.file.mime,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
