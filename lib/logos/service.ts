import { z } from "zod";
import { cleanText } from "@/lib/providers/validation";
import type { AuditEntry } from "@/lib/providers/types";
import { findSecrets } from "@/lib/security/secrets";
import type { LogoFile, LogoSuggestion, PublicLogoOverride } from "./types";

export const MAX_PENDING_PER_LISTING = 3;
export const LOGO_ID = /^l[0-9a-f]{16}$/;
const LISTING_ID = /^(api|mcp)-[a-z0-9-]{1,80}$/;

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
  }, "Enter the full https:// address of the page that shows this logo");

export interface LogoInput {
  listingId: string;
  sourceUrl: string;
  note: string;
}

export type LogoParse =
  | { ok: true; data: LogoInput }
  | { ok: false; kind: "invalid"; errors: Record<string, string> }
  | { ok: false; kind: "secret"; fields: string[] }
  | { ok: false; kind: "spam" };

/**
 * Validates the text fields of a logo suggestion. Public forms also pass the honeypot
 * and timing checks used by provider submissions; reviewer uploads skip them.
 */
export function parseLogoInput(raw: Record<string, unknown>, opts: { now?: number; public: boolean }): LogoParse {
  if (opts.public) {
    if (typeof raw.company_fax === "string" && raw.company_fax.trim() !== "") return { ok: false, kind: "spam" };
    const started = Number(raw.startedAt);
    const now = opts.now ?? Date.now();
    if (!Number.isFinite(started) || now - started < 3000 || now - started > 24 * 3600 * 1000) return { ok: false, kind: "spam" };
  }
  const strings: Record<string, string> = {};
  for (const k of ["listingId", "sourceUrl", "note"]) if (typeof raw[k] === "string") strings[k] = raw[k] as string;
  const secrets = findSecrets(strings);
  if (secrets.length) return { ok: false, kind: "secret", fields: [...new Set(secrets.map((s) => s.field))] };

  const errors: Record<string, string> = {};
  const listingId = (strings.listingId ?? "").trim();
  if (!LISTING_ID.test(listingId)) errors.listingId = "Unknown listing";
  const sourceUrl = (strings.sourceUrl ?? "").trim();
  const u = httpsUrl.safeParse(sourceUrl);
  if (!u.success) errors.sourceUrl = u.error.issues[0]!.message;
  const note = cleanText(strings.note ?? "", 200);
  if ((note.match(/https?:\/\//g) ?? []).length > 1) errors.note = "Put the link in the source field instead";
  if (Object.keys(errors).length) return { ok: false, kind: "invalid", errors };
  return { ok: true, data: { listingId, sourceUrl, note } };
}

/**
 * Creates a suggestion. A reviewer's own upload is approved at once (and replaces any
 * earlier approved logo for that listing); a visitor's waits for review.
 */
export function createLogoSuggestion(
  all: LogoSuggestion[],
  input: LogoInput,
  ctx: { id: string; now: string; file: LogoFile; listingName: string; origin: "public" | "reviewer"; actor: string },
): { suggestion: LogoSuggestion; audit: AuditEntry[]; deleteFiles: string[] } {
  const suggestion: LogoSuggestion = {
    id: ctx.id,
    listingId: input.listingId,
    listingName: ctx.listingName,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    status: "pending",
    origin: ctx.origin,
    sourceUrl: input.sourceUrl,
    note: input.note,
    file: ctx.file,
    reason: null,
  };
  const audit: AuditEntry[] = [
    {
      at: ctx.now,
      actor: ctx.actor,
      action: ctx.origin === "reviewer" ? "logo-uploaded" : "logo-suggested",
      submissionId: ctx.id,
      note: `${ctx.listingName} (${input.listingId})`,
    },
  ];
  all.push(suggestion);
  let deleteFiles: string[] = [];
  if (ctx.origin === "reviewer") {
    const r = applyLogoAction(all, ctx.id, { type: "approve" }, ctx.actor, ctx.now);
    audit.push(...r.audit);
    deleteFiles = r.deleteFiles;
  }
  return { suggestion, audit, deleteFiles };
}

export type LogoAction = { type: "approve"; note?: string } | { type: "reject"; reason: string } | { type: "remove"; reason: string };

export class LogoReviewError extends Error {}

/** Applies a reviewer decision in place. Returns audit entries and logo files to delete. */
export function applyLogoAction(
  all: LogoSuggestion[],
  id: string,
  action: LogoAction,
  actor: string,
  now: string,
): { audit: AuditEntry[]; deleteFiles: string[] } {
  const s = all.find((x) => x.id === id);
  if (!s) throw new LogoReviewError("Logo suggestion not found.");
  const audit: AuditEntry[] = [];
  const deleteFiles: string[] = [];
  const drop = (x: LogoSuggestion) => {
    if (x.file) deleteFiles.push(x.file.file);
    x.file = null;
  };

  if (action.type === "approve") {
    if (s.status !== "pending") throw new LogoReviewError("Only pending logos can be approved.");
    if (!s.file) throw new LogoReviewError("This suggestion has no image file.");
    // One approved logo per listing: the previous one is replaced and its file deleted.
    for (const other of all) {
      if (other !== s && other.listingId === s.listingId && other.status === "approved") {
        other.status = "replaced";
        other.updatedAt = now;
        drop(other);
        audit.push({
          at: now,
          actor,
          action: "logo-replaced",
          submissionId: other.id,
          changes: { status: { from: "approved", to: "replaced" } },
          note: `by ${s.id}`,
        });
      }
    }
    s.status = "approved";
    s.reason = null;
    audit.push({
      at: now,
      actor,
      action: "logo-approved",
      submissionId: s.id,
      changes: { status: { from: "pending", to: "approved" } },
      note: action.note ? cleanText(action.note, 300) : undefined,
    });
  } else {
    const reason = cleanText(action.reason, 300);
    if (reason.length < 3) throw new LogoReviewError("Give a reason.");
    if (action.type === "reject" && s.status !== "pending") throw new LogoReviewError("Only pending logos can be rejected.");
    if (action.type === "remove" && s.status !== "approved") throw new LogoReviewError("Only approved logos can be removed.");
    const from = s.status;
    s.status = action.type === "reject" ? "rejected" : "removed";
    s.reason = reason;
    drop(s);
    audit.push({
      at: now,
      actor,
      action: action.type === "reject" ? "logo-rejected" : "logo-removed",
      submissionId: s.id,
      changes: { status: { from, to: s.status } },
      note: reason,
    });
  }
  s.updatedAt = now;
  return { audit, deleteFiles };
}

export const pendingFor = (all: LogoSuggestion[], listingId: string) => all.filter((s) => s.listingId === listingId && s.status === "pending").length;

/** Only approved logos with a file are public; notes, origins and pending images never leave the server. */
export function publicLogoOverrides(all: LogoSuggestion[]): PublicLogoOverride[] {
  return all
    .filter((s) => s.status === "approved" && s.file)
    .map((s) => ({ listingId: s.listingId, src: `/api/logos/${s.id}`, sourceUrl: s.sourceUrl, approvedAt: s.updatedAt }));
}
