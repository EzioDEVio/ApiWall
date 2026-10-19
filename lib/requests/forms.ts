/**
 * Reads the GitHub issue forms in .github/ISSUE_TEMPLATE. GitHub turns a submitted form into
 * Markdown with one "### <label>" heading per field; empty optional fields read "_No response_".
 * Everything here is untrusted visitor input: it is only parsed into strings, never rendered as HTML.
 */
export type RequestKind = "add-api" | "provider" | "logo" | "listing";

/** The label each form adds, and the heading text of each field. Keep in sync with the templates. */
export const FORMS: Record<RequestKind, { label: string; title: string; fields: Record<string, string> }> = {
  "add-api": {
    label: "add-api",
    title: "New API",
    fields: {
      name: "API name",
      docs: "Official documentation URL (https)",
      category: "Category",
      description: "Short description",
      auth: "Authentication",
      https: "HTTPS",
      cors: "CORS (can browsers call it directly?)",
      source: "Where are pricing or free-tier terms published? (optional, https)",
    },
  },
  provider: {
    label: "provider",
    title: "Provider listing",
    fields: {
      name: "API name",
      docs: "Official documentation URL (https)",
      category: "Category",
      description: "Short description",
      auth: "Authentication",
      https: "HTTPS",
      cors: "CORS (can browsers call it directly?)",
      providerName: "Company or project",
      role: "Your role there",
    },
  },
  logo: {
    label: "logo",
    title: "Logo",
    fields: { listing: "Listing ID", name: "API name", source: "Page where the provider publishes this logo (https)", logo: "Logo image" },
  },
  listing: {
    label: "listing",
    title: "Correction or removal",
    fields: { listing: "Listing ID", name: "API name", problem: "What is wrong?", details: "Details and a source" },
  },
};

/** Which kind of request an issue is, from its labels. */
export function requestKind(labels: string[]): RequestKind | null {
  for (const k of Object.keys(FORMS) as RequestKind[]) if (labels.includes(FORMS[k].label)) return k;
  return null;
}

/** Splits an issue-form body into { heading: value }. */
export function parseSections(body: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const text = String(body ?? "").replace(/\r\n/g, "\n");
  const parts = text.split(/^###[ \t]+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim();
    const value = (nl < 0 ? "" : part.slice(nl + 1)).trim();
    out.set(heading, value === "_No response_" ? "" : value);
  }
  return out;
}

/** The form's fields by id (e.g. { name, docs, category, ... }), "" when missing. */
export function parseForm(kind: RequestKind, body: string | null | undefined): Record<string, string> {
  const sections = parseSections(body);
  const out: Record<string, string> = {};
  for (const [id, heading] of Object.entries(FORMS[kind].fields)) out[id] = (sections.get(heading) ?? "").slice(0, 4000);
  return out;
}

/** Image links GitHub creates when a file is dropped into an issue. */
const ATTACHMENT =
  /https:\/\/(?:github\.com\/user-attachments\/assets\/[0-9a-f-]{36}|user-images\.githubusercontent\.com\/\d+\/[0-9a-f-]{36}\.(?:png|jpe?g|webp))/i;

/** The first uploaded image in a field, or null. Only GitHub's own attachment links count. */
export function attachmentUrl(text: string): string | null {
  return ATTACHMENT.exec(text)?.[0] ?? null;
}
export const isAttachmentUrl = (u: string) => new RegExp(`^${ATTACHMENT.source}$`, "i").test(u);

/** Form dropdown values → catalog values. */
export function formAuth(v: string): "No" | "apiKey" | "OAuth" | "Unknown" {
  const s = v.trim().toLowerCase();
  if (s === "no auth") return "No";
  if (s === "api key") return "apiKey";
  if (s === "oauth") return "OAuth";
  return "Unknown";
}
export function formTri(v: string): "Yes" | "No" | "Unknown" {
  const s = v.trim().toLowerCase();
  return s === "yes" ? "Yes" : s === "no" ? "No" : "Unknown";
}
