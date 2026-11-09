import { z } from "zod";
import { AUTH_VALUES, TRI_VALUES } from "@/lib/catalog/requests";
import { isAttachmentUrl } from "./forms";

/**
 * An approval is a comment on the request issue, written by the admin page, that carries the
 * exact change as JSON (base64 inside an HTML comment, so nothing in it can break out of it).
 * The approval workflow reads the comment written by the person who added the "approved" label,
 * checks that person's role on the repository, validates the JSON again, and only then applies it.
 */
export const APPROVAL_MARKER = "apiwall-approval:v1";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), "must not contain < > or control characters");
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.hostname.includes(".") && !x.username && !x.password;
    } catch {
      return false;
    }
  }, "must be an https link");
const slug = z.string().regex(/^[a-z0-9-]{1,60}$/, "must be a category slug");
const listingId = z.string().regex(/^(api|mcp)-[a-z0-9-]{1,120}$/, "must be a listing ID");

const newApi = {
  name: text(80),
  url: httpsUrl,
  categorySlug: slug,
  description: text(300),
  auth: z.enum(AUTH_VALUES),
  https: z.enum(TRI_VALUES),
  cors: z.enum(TRI_VALUES),
};

export const ApprovalSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("add-api"), ...newApi }).strict(),
    z.object({ kind: z.literal("provider"), ...newApi, providerName: text(80) }).strict(),
    z
      .object({
        kind: z.literal("logo"),
        listingId,
        imageUrl: z.string().refine(isAttachmentUrl, "must be an image uploaded to the GitHub issue"),
        sourceUrl: httpsUrl,
      })
      .strict(),
    z
      .object({
        kind: z.literal("listing"),
        listingId,
        action: z.enum(["hide", "update"]),
        reason: text(200).optional(),
        url: httpsUrl.optional(),
        description: text(300).optional(),
        categorySlug: slug.optional(),
        auth: z.enum(AUTH_VALUES).optional(),
        https: z.enum(TRI_VALUES).optional(),
        cors: z.enum(TRI_VALUES).optional(),
      })
      .strict(),
  ])
  .superRefine((o, ctx) => {
    if (o.kind !== "listing") return;
    if (o.action === "update" && ![o.url, o.description, o.categorySlug, o.auth, o.https, o.cors].some((v) => v !== undefined))
      ctx.addIssue({ code: "custom", message: "an update must change at least one fact" });
    if (o.action === "hide" && !o.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "a removal needs a reason" });
  });
export type Approval = z.infer<typeof ApprovalSchema>;

const b64encode = (s: string) => (typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, "utf8").toString("base64"));
const b64decode = (s: string) => (typeof atob === "function" ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, "base64").toString("utf8"));

/** The comment the admin page posts: a readable summary plus the machine-readable change. */
export function approvalComment(a: Approval, summary: string): string {
  return `${summary}\n\n<!-- ${APPROVAL_MARKER} ${b64encode(JSON.stringify(a))} -->`;
}

/** Reads and validates the change from an approval comment. */
export function readApproval(body: string): { ok: true; approval: Approval } | { ok: false; error: string } {
  const m = new RegExp(`<!-- ${APPROVAL_MARKER} ([A-Za-z0-9+/=]{1,20000}) -->`).exec(body);
  if (!m) return { ok: false, error: "no approval data in the comment" };
  let json: unknown;
  try {
    json = JSON.parse(b64decode(m[1]!));
  } catch {
    return { ok: false, error: "the approval data could not be read" };
  }
  const r = ApprovalSchema.safeParse(json);
  return r.success
    ? { ok: true, approval: r.data }
    : { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "approval"}: ${i.message}`).join("; ") };
}

/** Repository roles (GitHub's role_name) → ApiWall roles. */
export type Role = "admin" | "reviewer" | "triage" | "viewer";
export function roleOf(roleName: string | null | undefined): Role {
  switch (roleName) {
    case "admin":
    case "maintain":
      return "admin";
    case "write":
      return "reviewer";
    case "triage":
      return "triage";
    default:
      return "viewer";
  }
}
export const canApprove = (r: Role) => r === "admin" || r === "reviewer";
export const canTriage = (r: Role) => r !== "viewer";

export const ROLE_INFO: { role: Role; github: string; can: string }[] = [
  { role: "admin", github: "Admin or Maintain", can: "Approve and reject requests, and manage who has which role (in GitHub settings)." },
  { role: "reviewer", github: "Write", can: "Approve and reject requests." },
  { role: "triage", github: "Triage", can: "Ask for more information and label requests; cannot approve or reject." },
  { role: "viewer", github: "Read or none", can: "See the queue only." },
];
