import { requireReviewer } from "@/lib/server/reviewAuth";
import { deleteLogo, snapshot, transact } from "@/lib/server/store";
import { createLogoSuggestion, parseLogoInput } from "@/lib/logos/service";
import { catalogListing, formStrings, newLogoId, readAndSaveLogo } from "@/lib/logos/upload";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** All logo suggestions, pending first. */
export function GET(req: Request) {
  const auth = requireReviewer(req);
  if (!auth.ok) return auth.response;
  const logos = [...snapshot().logos].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt.localeCompare(a.createdAt));
  return json(200, { logos });
}

/** A reviewer adds (or replaces) the logo of any catalog listing directly. It is published at once. */
export async function POST(req: Request) {
  const auth = requireReviewer(req, { mutation: true });
  if (!auth.ok) return auth.response;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "The form could not be read." });
  }
  const parsed = parseLogoInput(formStrings(form), { public: false });
  if (!parsed.ok) {
    if (parsed.kind === "secret") return json(422, { error: "This looks like it contains a secret, so nothing was saved." });
    return json(422, { error: parsed.kind === "invalid" ? Object.values(parsed.errors).join(". ") : "Rejected." });
  }
  const listing = catalogListing(parsed.data.listingId);
  if (!listing) return json(422, { error: "Unknown listing." });
  const id = newLogoId();
  const saved = await readAndSaveLogo(form, id);
  if (!saved.ok) return json(422, { error: saved.error });
  const now = new Date().toISOString();
  const suggestion = await transact((d) => {
    const r = createLogoSuggestion(d.logos, parsed.data, {
      id,
      now,
      file: saved.file,
      listingName: listing.name,
      origin: "reviewer",
      actor: `reviewer:${auth.sid}`,
    });
    d.audit.push(...r.audit);
    for (const f of r.deleteFiles) deleteLogo(f);
    return r.suggestion;
  });
  return json(201, { logo: suggestion });
}
