import { MAX_LOGO_BYTES } from "@/lib/providers/validation";
import { createLogoSuggestion, MAX_PENDING_PER_LISTING, parseLogoInput, pendingFor } from "@/lib/logos/service";
import { catalogListing, formStrings, newLogoId, readAndSaveLogo } from "@/lib/logos/upload";
import { deleteLogo, snapshot, transact } from "@/lib/server/store";
import { clientKey, logoGlobalLimiter, logoLimiter } from "@/lib/server/rateLimit";
import { sameOrigin } from "@/lib/server/config";
import { safeLog } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

/** A visitor suggests a logo for a catalog listing. It stays private until a reviewer approves it. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Suggest logos from this website." });
  const mine = logoLimiter.check(clientKey(req.headers));
  const all = logoGlobalLimiter.check("all");
  if (!mine.ok || !all.ok) {
    const retry = Math.max(mine.retryAfterSec, all.retryAfterSec);
    return json(429, { error: `Too many logo suggestions. Try again in about ${Math.ceil(retry / 60)} minutes.` }, { "retry-after": String(retry) });
  }
  if (Number(req.headers.get("content-length") || 0) > MAX_LOGO_BYTES + 16 * 1024) return json(413, { error: "Logos must be 256 KB or smaller." });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "The form could not be read." });
  }
  const parsed = parseLogoInput(formStrings(form), { public: true });
  if (!parsed.ok) {
    if (parsed.kind === "spam") return json(400, { error: "The suggestion was rejected." });
    if (parsed.kind === "secret") {
      safeLog("logo suggestion refused: possible secret in", parsed.fields.join(", "));
      return json(422, { error: "This looks like it contains a secret, so nothing was saved. Never submit a secret here." });
    }
    return json(422, { error: "Some fields need attention.", fields: parsed.errors });
  }
  const listing = catalogListing(parsed.data.listingId);
  if (!listing) return json(422, { error: "Some fields need attention.", fields: { listingId: "Unknown listing" } });
  if (pendingFor(snapshot().logos, listing.id) >= MAX_PENDING_PER_LISTING)
    return json(409, { error: "This listing already has logo suggestions waiting for review. Thank you; please check back later." });

  const id = newLogoId();
  const saved = await readAndSaveLogo(form, id);
  if (!saved.ok) return json(422, { error: "Some fields need attention.", fields: { logoFile: saved.error } });

  const now = new Date().toISOString();
  await transact((d) => {
    const r = createLogoSuggestion(d.logos, parsed.data, { id, now, file: saved.file, listingName: listing.name, origin: "public", actor: "public" });
    d.audit.push(...r.audit);
    for (const f of r.deleteFiles) deleteLogo(f);
  });
  return json(201, { id, status: "pending" });
}
