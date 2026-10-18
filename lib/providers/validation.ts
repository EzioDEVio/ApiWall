import { z } from "zod";
import { registrableDomain } from "@/lib/catalog/domain";
import { findSecrets, type SecretFinding } from "@/lib/security/secrets";
import { REQUEST_TYPES } from "./types";

/** Plain text only: strips control characters and markup, collapses whitespace. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const httpsUrl = z
  .string()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Enter a full https:// URL");

const optionalHttpsUrl = z.union([z.literal(""), httpsUrl]);
const tri = z.enum(["yes", "no", "unknown"]);

const baseSchema = z.object({
    request: z.enum(REQUEST_TYPES),
    providerName: z.string().min(2, "Enter the provider name").max(80),
    apiName: z.string().min(2, "Enter the API name").max(80),
    website: httpsUrl,
    docsUrl: httpsUrl,
    category: z.string().min(2, "Choose a category").max(60),
    description: z.string().min(20, "Describe the API in at least 20 characters").max(280),
    contactEmail: z.string().email("Enter a valid email").max(120),
    logoUrl: optionalHttpsUrl,
    auth: z.enum(["No", "apiKey", "OAuth", "Other"]),
    https: tri,
    cors: tri,
    pricing: z.string().min(3, "Describe free-tier or paid terms").max(400),
    rateLimits: z.string().min(2, "State the rate limits, or “None published”").max(300),
    claimSourceUrl: httpsUrl,
    catalogListingId: z.union([z.literal(""), z.string().regex(/^(api|mcp)-[a-z0-9-]{1,60}$/, "Unknown catalog listing")]),
    demoUseCase: z.string().max(400),
    demoEndpoints: z.string().max(300),
    demoRequestLimits: z.string().max(200),
    demoCostOwner: z.string().max(120),
    demoUserData: z.string().max(400),
    demoAbuseContact: z.string().max(160),
    agree: z.literal("yes", { errorMap: () => ({ message: "Confirm that you are authorised and did not include secrets" }) }),
});

export const SUBMISSION_FIELDS = Object.keys(baseSchema.shape) as (keyof z.infer<typeof baseSchema>)[];

export const submissionSchema = baseSchema.superRefine((v, ctx) => {
    // The contact address must belong to the provider's own domain.
    try {
      const site = registrableDomain(new URL(v.website).hostname.replace(/^www\./, ""));
      const mail = registrableDomain(v.contactEmail.split("@")[1]?.toLowerCase() ?? "");
      if (site !== mail) ctx.addIssue({ code: "custom", path: ["contactEmail"], message: `Use an address on ${site}` });
    } catch {
      /* website already invalid */
    }
    if (v.request === "provider-demo") {
      const need: [keyof typeof v, string][] = [
        ["demoUseCase", "Describe the demo use case"],
        ["demoEndpoints", "List the supported models or endpoints"],
        ["demoRequestLimits", "State the request limits"],
        ["demoCostOwner", "Say who pays for usage"],
        ["demoUserData", "Describe what user data the demo handles"],
        ["demoAbuseContact", "Give an abuse-report contact"],
      ];
      for (const [k, msg] of need) if (String(v[k]).trim().length < 3) ctx.addIssue({ code: "custom", path: [k], message: msg });
    }
  });

export type SubmissionInput = z.infer<typeof submissionSchema>;

const LIMITS: Record<string, number> = {
  providerName: 80, apiName: 80, category: 60, description: 280, pricing: 400, rateLimits: 300,
  demoUseCase: 400, demoEndpoints: 300, demoRequestLimits: 200, demoCostOwner: 120, demoUserData: 400, demoAbuseContact: 160,
};

export type ParseOutcome =
  | { ok: true; data: SubmissionInput }
  | { ok: false; kind: "invalid"; errors: Record<string, string> }
  | { ok: false; kind: "secret"; findings: SecretFinding[] }
  | { ok: false; kind: "spam" };

/** Validates raw form fields. Secret detection runs on the raw values, before anything is stored. */
export function parseSubmission(raw: Record<string, unknown>, opts: { now?: number } = {}): ParseOutcome {
  // Honeypot and timing checks: bots fill hidden fields and submit instantly.
  if (typeof raw.company_fax === "string" && raw.company_fax.trim() !== "") return { ok: false, kind: "spam" };
  const started = Number(raw.startedAt);
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(started) || now - started < 3000 || now - started > 24 * 3600 * 1000) return { ok: false, kind: "spam" };

  const strings: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") strings[k] = v;
  const findings = findSecrets(strings);
  if (findings.length) return { ok: false, kind: "secret", findings };

  const cleaned: Record<string, string> = {};
  for (const k of SUBMISSION_FIELDS) {
    const v = strings[k] ?? "";
    cleaned[k] = LIMITS[k] ? cleanText(v, LIMITS[k]!) : v.trim().slice(0, 500);
  }
  const linkCount = (cleaned.description!.match(/https?:\/\//g) ?? []).length + (cleaned.pricing!.match(/https?:\/\//g) ?? []).length;
  if (linkCount > 2) return { ok: false, kind: "invalid", errors: { description: "Remove extra links; use the URL fields instead" } };

  const r = submissionSchema.safeParse(cleaned);
  if (!r.success) {
    const errors: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const k = String(issue.path[0] ?? "form");
      errors[k] ??= issue.message;
    }
    return { ok: false, kind: "invalid", errors };
  }
  return { ok: true, data: r.data };
}

export const MAX_LOGO_BYTES = 256 * 1024;

/** Identifies an uploaded logo by its magic bytes; SVG is not accepted as a file (it can carry script). */
export function sniffImage(bytes: Uint8Array): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" } | null {
  const b = bytes;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { mime: "image/png", ext: "png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}
