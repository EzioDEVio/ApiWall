// Site-wide settings. Build-time environment variables (inlined into the client bundle):
//   NEXT_PUBLIC_STATIC=1          static export for GitHub Pages (no server routes)
//   NEXT_PUBLIC_BASE_PATH=/ApiWall path the site is served under (project pages)
//   NEXT_PUBLIC_SITE_URL          public origin + path, used for share links and previews

export const SITE_NAME = "ApiWall";
export const REPO = "EzioDEVio/ApiWall";
export const REPO_URL = `https://github.com/${REPO}`;
export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === "1";
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
/** Hostnames are lower-cased (GitHub passes the owner as "EzioDEVio"), so links, the sitemap and Search Console all agree. */
function normalizeSiteUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}
export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || "https://eziodevio.github.io/ApiWall");

/** Prefixes a same-origin path with the base path (Link does this itself; fetch and img do not). */
export function asset(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith(BASE_PATH + "/") ? BASE_PATH + path : path;
}

export type IssueTemplate = "add-api.yml" | "suggest-logo.yml" | "report-listing.yml" | "place-api.yml";

/** A pre-filled GitHub issue form. Field keys must match the `id`s in .github/ISSUE_TEMPLATE. */
export function issueUrl(template: IssueTemplate, title: string, fields: Record<string, string> = {}): string {
  const p = new URLSearchParams({ template, title });
  for (const [k, v] of Object.entries(fields)) if (v) p.set(k, v.slice(0, 500));
  return `${REPO_URL}/issues/new?${p.toString()}`;
}

/** The site-wide preview image, for pages that set their own openGraph/twitter metadata (which replaces the inherited image). */
export const OG_IMAGE = STATIC_MODE ? `${SITE_URL}/og.png` : "/opengraph-image";
