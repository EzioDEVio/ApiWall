import type { CatalogListing, IdentityMark } from "./types";
import { fnv1a } from "./normalize";
import { monogramText } from "./marks";

/**
 * data/community-logos.json: logos a project maintainer approved for listings whose own
 * site offers none (or a poor one). Files live in public/marks/community/ and are part of
 * the repository, so they work on the static GitHub Pages site too.
 */
export interface CommunityLogo {
  file: string; // name inside public/marks/community/
  listingName: string;
  sourceUrl: string; // https page where the provider publishes this logo
  approvedAt: string; // ISO date
  note?: string;
}
export interface CommunityLogosFile {
  version: 1;
  logos: Record<string, CommunityLogo>; // by listing ID
}

export const COMMUNITY_DIR = "community";
export const COMMUNITY_FILE = /^[a-z0-9-]+\.(png|jpg|webp)$/;
export const COMMUNITY_BASIS = "Approved by an ApiWall maintainer";

/** Community logos take precedence over fetched favicons and icon-set marks. Unknown IDs are reported. */
export function applyCommunityLogos(
  marks: Record<string, IdentityMark>,
  listings: CatalogListing[],
  file: CommunityLogosFile | null | undefined,
  exists: (name: string) => boolean = () => true,
): string[] {
  const warnings: string[] = [];
  if (!file) return warnings;
  const byId = new Map(listings.map((l) => [l.id, l]));
  for (const [id, logo] of Object.entries(file.logos)) {
    const l = byId.get(id);
    if (!l) {
      warnings.push(`community logo for "${logo.listingName}" (${id}) skipped: the listing is no longer in the catalog`);
      continue;
    }
    if (!COMMUNITY_FILE.test(logo.file) || !exists(logo.file) || !/^https:\/\//.test(logo.sourceUrl)) {
      warnings.push(`community logo for "${l.name}" skipped: missing file or https source`);
      continue;
    }
    marks[id] = {
      type: "image",
      title: l.name,
      src: `/marks/${COMMUNITY_DIR}/${logo.file}`,
      basis: COMMUNITY_BASIS,
      sourceUrl: logo.sourceUrl,
      iconUrl: logo.sourceUrl,
      fetchedAt: logo.approvedAt,
      fallback: { text: monogramText(l.name), seed: fnv1a(l.id) },
    };
  }
  return warnings;
}
