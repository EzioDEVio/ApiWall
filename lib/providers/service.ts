import { PROVIDER_REGION } from "@/lib/catalog/placement";
import type { SubmissionInput } from "./validation";
import { cleanText } from "./validation";
import {
  type AuditEntry,
  isDisplayableClaim,
  type PublicProviderPayload,
  type Submission,
  type VerifiedAccessClaim,
} from "./types";

export function createSubmission(
  input: SubmissionInput,
  ctx: { id: string; now: string; logoFile: Submission["logoFile"] },
): { submission: Submission; audit: AuditEntry } {
  const submission: Submission = {
    id: ctx.id,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    status: "pending",
    request: input.request,
    providerName: input.providerName,
    apiName: input.apiName,
    website: input.website,
    docsUrl: input.docsUrl,
    category: input.category,
    description: input.description,
    contactEmail: input.contactEmail.toLowerCase(),
    logoUrl: input.logoUrl || null,
    logoFile: ctx.logoFile,
    auth: input.auth,
    https: input.https,
    cors: input.cors,
    claim: { pricing: input.pricing, rateLimits: input.rateLimits, sourceUrl: input.claimSourceUrl },
    demo:
      input.request === "provider-demo"
        ? {
            useCase: input.demoUseCase,
            endpoints: input.demoEndpoints,
            requestLimits: input.demoRequestLimits,
            costOwner: input.demoCostOwner,
            userData: input.demoUserData,
            abuseContact: input.demoAbuseContact,
          }
        : null,
    catalogListingId: input.catalogListingId || null,
    review: { logoApproved: false, sponsoredApproved: false, verifiedClaim: null, slot: null, reason: null },
  };
  return { submission, audit: { at: ctx.now, actor: "public", action: "submitted", submissionId: ctx.id } };
}

export const EDITABLE_FIELDS = ["providerName", "apiName", "website", "docsUrl", "category", "description", "auth", "https", "cors"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type ReviewAction =
  | { type: "edit"; fields: Partial<Record<EditableField, string>> }
  | { type: "approve"; sponsored: boolean; logo: boolean; note?: string }
  | { type: "reject"; reason: string }
  | { type: "remove"; reason: string }
  | { type: "verify-claim"; claim: VerifiedAccessClaim }
  | { type: "clear-claim" };

export class ReviewError extends Error {}

const LIMITS: Record<EditableField, number> = { providerName: 80, apiName: 80, website: 500, docsUrl: 500, category: 60, description: 280, auth: 20, https: 10, cors: 10 };

function nextFreeSlot(all: Submission[]): number {
  const used = new Set(all.filter((s) => s.status === "approved" && s.review.slot !== null).map((s) => s.review.slot!));
  for (let s = PROVIDER_REGION.start; s < PROVIDER_REGION.end; s++) if (!used.has(s)) return s;
  throw new ReviewError("The provider area of the map is full.");
}

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** Applies a reviewer action to one submission (in place) and returns the audit entry. */
export function applyReviewAction(all: Submission[], id: string, action: ReviewAction, actor: string, now: string): AuditEntry {
  const sub = all.find((s) => s.id === id);
  if (!sub) throw new ReviewError("Submission not found.");
  const entry: AuditEntry = { at: now, actor, action: "edited", submissionId: id };

  switch (action.type) {
    case "edit": {
      const changes: AuditEntry["changes"] = {};
      for (const k of EDITABLE_FIELDS) {
        const v = action.fields[k];
        if (v === undefined) continue;
        const clean = cleanText(v, LIMITS[k]);
        if ((k === "website" || k === "docsUrl") && !isHttps(clean)) throw new ReviewError(`${k} must be an https:// URL.`);
        if ((k === "https" || k === "cors") && !["yes", "no", "unknown"].includes(clean)) throw new ReviewError(`${k} must be yes, no or unknown.`);
        if (k === "auth" && !["No", "apiKey", "OAuth", "Other"].includes(clean)) throw new ReviewError("auth must be No, apiKey, OAuth or Other.");
        if (clean !== sub[k]) {
          changes[k] = { from: sub[k], to: clean };
          (sub as unknown as Record<string, string>)[k] = clean;
        }
      }
      entry.changes = changes;
      break;
    }
    case "approve": {
      if (sub.status === "approved") throw new ReviewError("Already approved.");
      if (sub.status === "removed") throw new ReviewError("Removed submissions cannot be re-approved; ask the provider to resubmit.");
      const prev = sub.status;
      sub.status = "approved";
      // Sponsorship only for tiles the provider asked to sponsor; never for claims on catalog entries.
      sub.review.sponsoredApproved = action.sponsored && sub.request === "sponsored-tile" && !sub.catalogListingId;
      sub.review.logoApproved = action.logo && !!sub.logoFile;
      sub.review.slot = sub.catalogListingId ? null : nextFreeSlot(all);
      sub.review.reason = null;
      entry.action = "approved";
      entry.changes = {
        status: { from: prev, to: "approved" },
        sponsored: { from: false, to: sub.review.sponsoredApproved },
        logoApproved: { from: false, to: sub.review.logoApproved },
      };
      entry.note = action.note ? cleanText(action.note, 300) : undefined;
      break;
    }
    case "reject":
    case "remove": {
      const reason = cleanText(action.reason, 300);
      if (reason.length < 3) throw new ReviewError("Give a reason.");
      if (action.type === "remove" && sub.status !== "approved") throw new ReviewError("Only approved listings can be removed.");
      if (action.type === "reject" && sub.status !== "pending") throw new ReviewError("Only pending submissions can be rejected.");
      const from = sub.status;
      sub.status = action.type === "reject" ? "rejected" : "removed";
      sub.review.slot = null;
      sub.review.sponsoredApproved = false;
      sub.review.reason = reason;
      entry.action = action.type === "reject" ? "rejected" : "removed";
      entry.changes = { status: { from, to: sub.status } };
      entry.note = reason;
      break;
    }
    case "verify-claim": {
      const c = action.claim;
      const claim: VerifiedAccessClaim = {
        status: c.status,
        sourceUrl: String(c.sourceUrl ?? "").trim(),
        verifiedAt: String(c.verifiedAt ?? "").trim(),
        limits: cleanText(c.limits, 200),
        eligibility: cleanText(c.eligibility, 200),
        expiration: cleanText(c.expiration, 120),
        terms: cleanText(c.terms, 300),
      };
      if (claim.status === "provider-sponsored-demo") throw new ReviewError("No in-site demo is implemented, so a sponsored-demo claim cannot be verified.");
      if (!["provider-confirmed-free-tier", "paid-or-other"].includes(claim.status)) throw new ReviewError("Choose a verified access status.");
      if (!isDisplayableClaim(claim)) throw new ReviewError("A verified claim needs an https source, a YYYY-MM-DD date, limits, eligibility, expiration and terms.");
      if (claim.verifiedAt > now.slice(0, 10)) throw new ReviewError("The verification date cannot be in the future.");
      entry.action = "claim-verified";
      entry.changes = { verifiedClaim: { from: sub.review.verifiedClaim, to: claim } };
      sub.review.verifiedClaim = claim;
      break;
    }
    case "clear-claim": {
      entry.action = "claim-cleared";
      entry.changes = { verifiedClaim: { from: sub.review.verifiedClaim, to: null } };
      sub.review.verifiedClaim = null;
      break;
    }
  }
  sub.updatedAt = now;
  return entry;
}

/**
 * The public projection. Only approved submissions appear; contact details,
 * demo plans and unreviewed logos never leave the server; unverified claims are
 * dropped; sponsorship is shown only when a reviewer approved it.
 */
export function toPublicPayload(all: Submission[]): PublicProviderPayload {
  const payload: PublicProviderPayload = { listings: [], catalogClaims: [] };
  for (const s of all) {
    if (s.status !== "approved") continue;
    const claim = isDisplayableClaim(s.review.verifiedClaim) ? s.review.verifiedClaim : null;
    if (s.catalogListingId) {
      if (claim) payload.catalogClaims.push({ listingId: s.catalogListingId, providerName: s.providerName, claim });
      continue;
    }
    if (s.review.slot === null) continue;
    payload.listings.push({
      id: `provider-${s.id}`,
      providerName: s.providerName,
      name: s.apiName,
      description: s.description,
      category: s.category,
      url: s.docsUrl,
      auth: s.auth,
      https: s.https,
      cors: s.cors,
      sponsored: s.review.sponsoredApproved,
      logo: s.review.logoApproved && s.logoFile ? `/api/logos/${s.id}` : null,
      claim,
      slot: s.review.slot,
      approvedAt: s.updatedAt,
    });
  }
  return payload;
}
