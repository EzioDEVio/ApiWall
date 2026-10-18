import { readLogo, snapshot } from "@/lib/server/store";
import { LOGO_ID } from "@/lib/logos/service";

export const dynamic = "force-dynamic";

const headers = (mime: string) => ({
  "content-type": mime,
  "cache-control": "public, max-age=3600",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
});

/**
 * Serves a provider logo only after a reviewer approved both the listing and the logo,
 * and a suggested catalog logo ("l…" IDs) only while it is the approved one.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = snapshot();
  if (LOGO_ID.test(id)) {
    const l = data.logos.find((x) => x.id === id);
    const bytes = l && l.status === "approved" && l.file ? readLogo(l.file.file) : null;
    if (!l?.file || !bytes) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: headers(l.file.mime) });
  }
  const sub = data.submissions.find((s) => s.id === id);
  if (!sub || sub.status !== "approved" || !sub.review.logoApproved || !sub.logoFile) return new Response("Not found", { status: 404 });
  const bytes = readLogo(sub.logoFile.file);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: headers(sub.logoFile.mime) });
}
