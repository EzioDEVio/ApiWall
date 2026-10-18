import type { AiModelInfo, CatalogListing, SupplementSummary } from "./types";
import { listingId, normalizeAuth, normalizeTri, safeHttpUrl } from "./normalize";
import { hostOf } from "./domain";

/** Shape of data/ai-models.json: a curated, source-tracked supplement to the upstream catalog. */
export interface AiModelsFile {
  version: 1;
  category: { slug: string; name: string };
  about: string;
  crossTags: {
    match: { name: string; host: string };
    provider: string;
    models: string;
    authDetail: string;
    apiHost: string | null;
    docsUrl: string;
    verifiedAt: string;
  }[];
  providers: {
    name: string;
    provider: string;
    description: string;
    url: string;
    auth: string;
    https: string;
    cors: string;
    models: string;
    authDetail: string;
    apiHost: string | null;
    verifiedAt: string;
  }[];
  notVerified?: { provider: string; url: string; reason: string }[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Applies the AI Models supplement without changing upstream facts:
 * - upstream listings named in crossTags keep their own category and gain a tag;
 * - providers become new listings marked origin "supplement" in the AI Models category.
 * Entries without an https docs link or a verification date are rejected.
 */
export function applyAiModels(
  listings: CatalogListing[],
  file: AiModelsFile,
): {
  listings: CatalogListing[];
  summary: SupplementSummary;
  warnings: string[];
} {
  const warnings: string[] = [];
  const { slug, name } = file.category;
  listings = listings.map((l) => ({ ...l })); // never mutate the caller's listings
  let crossTagged = 0;

  for (const t of file.crossTags) {
    const docs = safeHttpUrl(t.docsUrl);
    if (!docs || !DATE.test(t.verifiedAt)) {
      warnings.push(`AI Models: cross-tag for "${t.match.name}" skipped (missing docs link or verification date)`);
      continue;
    }
    const hit = listings.find((l) => l.name === t.match.name && hostOf(l.url) === t.match.host.toLowerCase());
    if (!hit) {
      warnings.push(`AI Models: "${t.match.name}" (${t.match.host}) is no longer in the upstream catalog; cross-tag not applied`);
      continue;
    }
    hit.tags = [...new Set([...(hit.tags ?? []), slug])];
    hit.aiModel = info(t, docs);
    crossTagged++;
  }

  const added: CatalogListing[] = [];
  const ids = new Set(listings.map((l) => l.id));
  for (const p of file.providers) {
    const url = safeHttpUrl(p.url);
    if (!url || !DATE.test(p.verifiedAt)) {
      warnings.push(`AI Models: "${p.name}" skipped (missing docs link or verification date)`);
      continue;
    }
    const id = listingId("api", p.name, url);
    if (ids.has(id)) {
      warnings.push(`AI Models: "${p.name}" is already in the upstream catalog; supplemental copy skipped`);
      continue;
    }
    ids.add(id);
    added.push({
      id,
      kind: "api",
      origin: "supplement",
      name: p.name,
      description: p.description,
      category: name,
      categorySlug: slug,
      url,
      raw: { auth: p.auth, https: p.https, cors: p.cors },
      auth: normalizeAuth(p.auth),
      https: normalizeTri(p.https),
      cors: normalizeTri(p.cors),
      sourceLine: 0,
      tags: [slug],
      aiModel: info(p, url),
    });
  }

  return {
    listings: [...listings, ...added],
    summary: {
      slug,
      name,
      file: "data/ai-models.json",
      about: file.about,
      providers: added.length,
      crossTagged,
      notVerified: file.notVerified ?? [],
    },
    warnings,
  };
}

function info(
  x: {
    provider: string;
    models: string;
    authDetail: string;
    apiHost: string | null;
    verifiedAt: string;
  },
  docsUrl: string,
): AiModelInfo {
  return {
    provider: x.provider,
    models: x.models,
    authDetail: x.authDetail,
    apiHost: x.apiHost,
    docsUrl,
    verifiedAt: x.verifiedAt,
  };
}
