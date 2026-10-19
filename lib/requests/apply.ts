import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { CommunityApisFile, ListingOverride, ListingOverridesFile } from "@/lib/catalog/requests";
import { listingId, urlIdentityKey } from "@/lib/catalog/normalize";
import { MCP_CATEGORY_SLUG } from "@/lib/catalog/normalize";
import { PROVIDER_CATEGORY_SLUG } from "@/lib/explore/model";
import { type Approval, ApprovalSchema } from "./approval";
import { attachmentUrl, formAuth, formTri, type RequestKind } from "./forms";

/** Categories a new API may join: real API categories, not MCP Servers or the provider band. */
export function apiCategories(snap: Pick<CatalogSnapshot, "categories">) {
  return snap.categories.filter((c) => c.kind === "api" && c.slug !== MCP_CATEGORY_SLUG && c.slug !== PROVIDER_CATEGORY_SLUG);
}

/** Finds a category from what a visitor typed ("weather", "Weather", "Weather APIs"). */
export function matchCategory(typed: string, snap: Pick<CatalogSnapshot, "categories">): string | null {
  const t = typed
    .trim()
    .toLowerCase()
    .replace(/\s+apis?$/, "");
  if (!t) return null;
  const cats = apiCategories(snap);
  return (cats.find((c) => c.slug === t || c.name.toLowerCase() === t) ?? cats.find((c) => c.name.toLowerCase().startsWith(t)))?.slug ?? null;
}

/**
 * The approval implied by the form as submitted (used to prefill the admin page, and when a
 * reviewer adds the "approved" label in GitHub without the admin page). Corrections have no
 * default: what to change is the reviewer's decision.
 */
export function defaultApproval(
  kind: RequestKind,
  form: Record<string, string>,
  snap: Pick<CatalogSnapshot, "categories">,
): { approval?: Approval; error?: string } {
  const candidate: Record<string, unknown> =
    kind === "add-api" || kind === "provider"
      ? {
          kind,
          name: form.name,
          url: form.docs,
          categorySlug: matchCategory(form.category ?? "", snap) ?? "",
          description: (form.description ?? "").replace(/\s+/g, " ").trim(),
          auth: formAuth(form.auth ?? ""),
          https: formTri(form.https ?? ""),
          cors: formTri(form.cors ?? ""),
          ...(kind === "provider" ? { providerName: form.providerName } : {}),
        }
      : kind === "logo"
        ? { kind, listingId: (form.listing ?? "").trim(), imageUrl: attachmentUrl(form.logo ?? "") ?? "", sourceUrl: (form.source ?? "").trim() }
        : { kind };
  if (kind === "listing") return { error: "For a correction or removal, choose what to change on the admin page." };
  const r = ApprovalSchema.safeParse(candidate);
  return r.success ? { approval: r.data } : { error: r.error.issues.map((i) => `${i.path.join(".") || kind}: ${i.message}`).join("; ") };
}

/** Problems that only the current catalog can reveal (unknown listing, duplicate API, unknown category). */
export function checkAgainstCatalog(a: Approval, snap: CatalogSnapshot, communityApis?: CommunityApisFile | null, issue?: number): string[] {
  const errors: string[] = [];
  const cats = new Set(apiCategories(snap).map((c) => c.slug));
  if ((a.kind === "add-api" || a.kind === "provider") && !cats.has(a.categorySlug)) errors.push(`unknown category "${a.categorySlug}"`);
  if (a.kind === "listing" && a.categorySlug && !cats.has(a.categorySlug)) errors.push(`unknown category "${a.categorySlug}"`);
  if (a.kind === "add-api" || a.kind === "provider") {
    const id = listingId("api", a.name, a.url);
    const key = urlIdentityKey(a.url, a.name);
    const dup = snap.listings.find((l) => l.id === id || (l.url && urlIdentityKey(l.url, l.name) === key));
    // A listing added by this same request (when it is re-applied) is not a duplicate of itself.
    if (dup && !(dup.community && dup.community.issue === issue)) errors.push(`already on the wall as "${dup.name}" (${dup.id})`);
    const pending = communityApis?.apis.find((x) => x.issue !== issue && urlIdentityKey(x.url, x.name) === key);
    if (pending) errors.push(`already approved in request #${pending.issue}`);
  }
  if ((a.kind === "logo" || a.kind === "listing") && !snap.listings.some((l) => l.id === a.listingId)) errors.push(`no listing with ID ${a.listingId}`);
  return errors;
}

export interface ApprovalMeta {
  issue: number;
  approvedBy: string;
  approvedAt: string; // YYYY-MM-DD
}

/** Writes a new API, provider listing or correction into the data files (logos are stored separately). */
export function applyToFiles(
  a: Approval,
  meta: ApprovalMeta,
  files: { communityApis: CommunityApisFile; overrides: ListingOverridesFile },
): { communityApis: CommunityApisFile; overrides: ListingOverridesFile } {
  if (a.kind === "add-api" || a.kind === "provider") {
    const entry = {
      ...meta,
      name: a.name,
      url: a.url,
      categorySlug: a.categorySlug,
      description: a.description,
      auth: a.auth,
      https: a.https,
      cors: a.cors,
      ...(a.kind === "provider" ? { providerSubmitted: true, providerName: a.providerName } : {}),
    };
    // Re-approving the same request replaces its entry.
    const apis = [...files.communityApis.apis.filter((x) => x.issue !== meta.issue), entry].sort((x, y) => x.issue - y.issue);
    return { ...files, communityApis: { version: 1, apis } };
  }
  if (a.kind === "listing") {
    const o: ListingOverride =
      a.action === "hide"
        ? { ...meta, hidden: true, reason: a.reason! }
        : {
            ...meta,
            ...(a.url !== undefined ? { url: a.url } : {}),
            ...(a.description !== undefined ? { description: a.description } : {}),
            ...(a.categorySlug !== undefined ? { categorySlug: a.categorySlug } : {}),
            ...(a.auth !== undefined ? { auth: a.auth } : {}),
            ...(a.https !== undefined ? { https: a.https } : {}),
            ...(a.cors !== undefined ? { cors: a.cors } : {}),
            ...(a.reason ? { reason: a.reason } : {}),
          };
    const overrides = Object.fromEntries(Object.entries({ ...files.overrides.overrides, [a.listingId]: o }).sort(([x], [y]) => x.localeCompare(y)));
    return { ...files, overrides: { version: 1, overrides } };
  }
  return files;
}

/** Pull request title and description for an approved request. */
export function describeApproval(a: Approval, meta: ApprovalMeta, snap: CatalogSnapshot): { title: string; body: string } {
  const name = (id: string) => snap.listings.find((l) => l.id === id)?.name ?? id;
  const lines: string[] = [];
  let title: string;
  if (a.kind === "add-api" || a.kind === "provider") {
    title = `${a.kind === "provider" ? "Provider listing" : "Add API"}: ${a.name}`;
    lines.push(
      `Adds **${a.name}** to ${snap.categories.find((c) => c.slug === a.categorySlug)?.name ?? a.categorySlug}${a.kind === "provider" ? `, submitted by ${a.providerName}` : ""}.`,
      "",
      `- Docs: ${a.url}`,
      `- Auth ${a.auth} · HTTPS ${a.https} · CORS ${a.cors}`,
      `- Description: ${a.description}`,
    );
  } else if (a.kind === "logo") {
    title = `Logo: ${name(a.listingId)}`;
    lines.push(`Adds the official logo for **${name(a.listingId)}** (\`${a.listingId}\`), published at ${a.sourceUrl}.`);
  } else {
    title = `${a.action === "hide" ? "Remove" : "Correct"}: ${name(a.listingId)}`;
    if (a.action === "hide") lines.push(`Removes **${name(a.listingId)}** (\`${a.listingId}\`) from the wall: ${a.reason}`);
    else {
      lines.push(`Corrects **${name(a.listingId)}** (\`${a.listingId}\`):`, "");
      for (const k of ["url", "description", "categorySlug", "auth", "https", "cors"] as const) if (a[k] !== undefined) lines.push(`- ${k}: ${a[k]}`);
    }
  }
  lines.push(
    "",
    `Approved by @${meta.approvedBy} on ${meta.approvedAt} in #${meta.issue}. Merges automatically once every check passes.`,
    "",
    `Closes #${meta.issue}`,
  );
  return { title: `${title} (request #${meta.issue})`, body: lines.join("\n") };
}
