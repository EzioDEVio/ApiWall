// Logos people suggest for catalog listings that have none (or a poor one).
// Nothing here changes a CatalogListing: an approved logo is shown in place of the
// tile's generated mark and is always labelled as reviewer-approved.

export const LOGO_STATUSES = ["pending", "approved", "rejected", "replaced", "removed"] as const;
export type LogoStatus = (typeof LOGO_STATUSES)[number];

export interface LogoFile {
  file: string; // name inside the private logo directory
  mime: "image/png" | "image/jpeg" | "image/webp";
  bytes: number;
}

export interface LogoSuggestion {
  id: string; // "l" + 16 hex characters
  listingId: string;
  listingName: string;
  createdAt: string;
  updatedAt: string;
  status: LogoStatus;
  /** "public" = suggested by a visitor; "reviewer" = uploaded directly by a signed-in reviewer. */
  origin: "public" | "reviewer";
  sourceUrl: string; // https page where the provider publishes this logo
  note: string;
  file: LogoFile | null; // null once the file is deleted (rejected, replaced or removed)
  reason: string | null;
}

/** The only shape of a logo suggestion that leaves the server for public pages. */
export interface PublicLogoOverride {
  listingId: string;
  src: string; // same-origin URL
  sourceUrl: string;
  approvedAt: string;
}
