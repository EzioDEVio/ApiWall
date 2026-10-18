import type { PublicLogoOverride } from "@/lib/logos/types";

// Provider-supplied content. None of these types can modify a CatalogListing;
// they are shown next to catalog facts, always labelled as provider-supplied.

export const ACCESS_STATUSES = ["unknown", "provider-confirmed-free-tier", "provider-sponsored-demo", "paid-or-other"] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_LABELS: Record<AccessStatus, string> = {
  unknown: "Unknown",
  "provider-confirmed-free-tier": "Provider-confirmed free tier",
  "provider-sponsored-demo": "Provider-sponsored demo",
  "paid-or-other": "Paid or other terms",
};

/** An access claim a reviewer has checked against the provider's own source. */
export interface VerifiedAccessClaim {
  status: Exclude<AccessStatus, "unknown">;
  sourceUrl: string; // provider page that states the terms
  verifiedAt: string; // YYYY-MM-DD, when a reviewer last checked the source
  limits: string; // quota or rate limits, e.g. "1,000 requests/day"
  eligibility: string; // who qualifies
  expiration: string; // "No expiry stated" is a valid value; empty is not
  terms: string; // short summary or link text for the governing terms
}

export const REQUEST_TYPES = ["listing", "sponsored-tile", "provider-demo"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const SUBMISSION_STATUSES = ["pending", "approved", "rejected", "removed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface ProviderClaimInput {
  pricing: string; // free-tier / paid terms as stated by the provider
  rateLimits: string;
  sourceUrl: string; // where those claims are published
}

export interface DemoRequest {
  useCase: string;
  endpoints: string; // supported models/endpoints
  requestLimits: string;
  costOwner: string; // who pays for usage
  userData: string; // what user data is handled
  abuseContact: string; // email or URL for abuse reports
}

export interface Submission {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SubmissionStatus;
  request: RequestType;
  providerName: string;
  apiName: string;
  website: string;
  docsUrl: string;
  category: string;
  description: string;
  contactEmail: string; // never exposed publicly
  logoUrl: string | null; // for reviewer reference only; never hotlinked publicly
  logoFile: { file: string; mime: "image/png" | "image/jpeg" | "image/webp"; bytes: number } | null;
  auth: string;
  https: "yes" | "no" | "unknown";
  cors: "yes" | "no" | "unknown";
  claim: ProviderClaimInput;
  demo: DemoRequest | null;
  catalogListingId: string | null; // set when the provider is claiming an existing catalog entry
  review: {
    logoApproved: boolean;
    sponsoredApproved: boolean;
    verifiedClaim: VerifiedAccessClaim | null;
    slot: number | null; // map slot in the provider band, assigned at approval
    reason: string | null; // rejection or removal reason
  };
}

export interface AuditEntry {
  at: string;
  actor: string; // reviewer session id, or "public" for submissions
  action:
    | "submitted"
    | "edited"
    | "approved"
    | "rejected"
    | "removed"
    | "claim-verified"
    | "claim-cleared"
    | "logo-suggested"
    | "logo-uploaded"
    | "logo-approved"
    | "logo-rejected"
    | "logo-removed"
    | "logo-replaced";
  submissionId: string; // the submission or logo suggestion this entry is about
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}

/** The only shape of provider content that leaves the server for public pages. */
export interface PublicProviderListing {
  id: string;
  providerName: string;
  name: string;
  description: string;
  category: string;
  url: string;
  auth: string;
  https: "yes" | "no" | "unknown";
  cors: "yes" | "no" | "unknown";
  sponsored: boolean;
  logo: string | null; // same-origin URL of a reviewed logo
  claim: VerifiedAccessClaim | null;
  slot: number;
  approvedAt: string;
}

export interface PublicCatalogClaim {
  listingId: string;
  providerName: string;
  claim: VerifiedAccessClaim;
}

export interface PublicProviderPayload {
  listings: PublicProviderListing[];
  catalogClaims: PublicCatalogClaim[];
  /** Reviewer-approved logos for catalog listings. */
  logoOverrides?: PublicLogoOverride[];
}

/** A claim may be displayed only when every disclosure field is present. */
export function isDisplayableClaim(c: VerifiedAccessClaim | null | undefined): c is VerifiedAccessClaim {
  if (!c) return false;
  const filled = (s: string) => typeof s === "string" && s.trim().length > 0;
  return (
    c.status !== ("unknown" as string) &&
    /^https:\/\//.test(c.sourceUrl) &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.verifiedAt) &&
    filled(c.limits) &&
    filled(c.eligibility) &&
    filled(c.expiration) &&
    filled(c.terms)
  );
}
