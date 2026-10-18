import { randomBytes } from "node:crypto";
import { MAX_LOGO_BYTES, parseSubmission, sniffImage } from "@/lib/providers/validation";
import { createSubmission } from "@/lib/providers/service";
import { saveLogo, transact } from "@/lib/server/store";
import { clientKey, submissionGlobalLimiter, submissionLimiter } from "@/lib/server/rateLimit";
import { sameOrigin } from "@/lib/server/config";
import { safeLog } from "@/lib/security/secrets";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json(403, { error: "Submit the form from this website." });

  const limited = submissionLimiter.check(clientKey(req.headers));
  const global = submissionGlobalLimiter.check("all");
  if (!limited.ok || !global.ok) {
    const retry = Math.max(limited.retryAfterSec, global.retryAfterSec);
    return json(429, { error: `Too many submissions. Try again in about ${Math.ceil(retry / 60)} minutes.` }, { "retry-after": String(retry) });
  }

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_LOGO_BYTES + 64 * 1024) return json(413, { error: "The submission is too large. Logos must be 256 KB or smaller." });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "The form could not be read." });
  }

  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;

  const parsed = parseSubmission(raw);
  if (!parsed.ok) {
    if (parsed.kind === "spam") return json(400, { error: "The submission was rejected." });
    if (parsed.kind === "secret") {
      // Never echo or store the value; name the fields only.
      safeLog("submission refused: possible secret", parsed.findings.map((f) => `${f.field} (${f.kind})`).join(", "));
      return json(422, {
        error: "This looks like it contains a secret, so nothing was saved. Remove it and submit again. We will contact verified providers about secure setup.",
        fields: Object.fromEntries(parsed.findings.map((f) => [f.field, `Remove what looks like a ${f.kind}`])),
      });
    }
    return json(422, { error: "Some fields need attention.", fields: parsed.errors });
  }

  const id = randomBytes(8).toString("hex");
  let logoFile = null as null | { file: string; mime: "image/png" | "image/jpeg" | "image/webp"; bytes: number };
  const logo = form.get("logoFile");
  if (logo && typeof logo !== "string" && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return json(422, { error: "Some fields need attention.", fields: { logoFile: "Logos must be 256 KB or smaller" } });
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return json(422, { error: "Some fields need attention.", fields: { logoFile: "Upload a PNG, JPEG or WebP image" } });
    logoFile = { file: saveLogo(id, kind.ext, bytes), mime: kind.mime, bytes: bytes.length };
  }

  const { submission, audit } = createSubmission(parsed.data, { id, now: new Date().toISOString(), logoFile });
  await transact((d) => {
    d.submissions.push(submission);
    d.audit.push(audit);
  });
  return json(201, { id, status: "pending" });
}
