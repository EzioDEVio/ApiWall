// Finds each listing's own logo: the icon its official site declares in its
// HTML (<link rel="icon"/"apple-touch-icon">), else the site's /favicon.ico,
// else (for projects hosted on GitHub) the repository owner's avatar.
//
// Everything is downloaded once by `npm run catalog:logos`, validated, and
// stored under public/marks/. The website never hotlinks third-party images.

import { codeHostOwner, hostOf, registrableDomain } from "./domain";

export interface IconCandidate {
  url: string;
  rel: string;
  size: number; // largest declared edge in px, 0 when unknown
  method: "declared" | "default-path" | "github-owner";
}

export interface SniffedImage {
  mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/x-icon";
  ext: "png" | "jpg" | "webp" | "gif" | "ico";
  width: number | null;
  height: number | null;
}

export interface FaviconRecord {
  file: string; // file name inside public/marks
  width: number | null;
  height: number | null;
  sha256: string;
  iconUrl: string; // where the image was downloaded from
  pageUrl: string; // the official page that declared it (or the site root for /favicon.ico)
  method: IconCandidate["method"];
  fetchedAt: string;
}

export interface FaviconManifest {
  version: 1;
  updatedAt: string;
  entries: Record<string, FaviconRecord>;
  misses: Record<string, string>; // listing id → reason, so reruns can skip known failures
}

/** Hosts whose pages belong to a platform, not to the listed API. */
const NOT_OWN_PAGE = new Set([
  "github.com", "gitlab.com", "bitbucket.org", "rapidapi.com", "postman.com", "getpostman.com", "swaggerhub.com",
  "apiary.io", "medium.com", "wikipedia.org", "wikimedia.org", "docs.google.com", "sites.google.com",
  "drive.google.com", "npmjs.com", "pypi.org", "sourceforge.net", "stoplight.io", "readme.io",
]);

export const MAX_HTML_BYTES = 1_000_000;
export const MAX_ICON_BYTES = 300_000;
export const MIN_ICON_PX = 16;

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return true; // IP literals: never needed for a public API's site
  return false;
}

/** The page whose declared icon represents this listing, or null when the URL is not the provider's own site. */
export function ownPageFor(url: string | null): string | null {
  const host = hostOf(url);
  if (!host || isPrivateHost(host)) return null;
  const domain = registrableDomain(host);
  if (NOT_OWN_PAGE.has(host) || NOT_OWN_PAGE.has(domain)) return null;
  try {
    const u = new URL(url!);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/** Extracts icon links from an HTML document head. Tolerant of attribute order and quoting. */
export function extractIconLinks(html: string, pageUrl: string): IconCandidate[] {
  const head = html.slice(0, 200_000);
  const out: IconCandidate[] = [];
  const base = (() => {
    const m = /<base\s[^>]*href\s*=\s*["']?([^"'\s>]+)/i.exec(head);
    try {
      return m ? new URL(m[1]!, pageUrl).toString() : pageUrl;
    } catch {
      return pageUrl;
    }
  })();
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => {
      const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
      return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : "";
    };
    const rel = attr("rel").toLowerCase();
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel) && !rel.split(/\s+/).includes("icon")) continue;
    if (rel.includes("mask-icon")) continue;
    const href = attr("href");
    const type = attr("type").toLowerCase();
    if (!href || href.startsWith("data:") || type.includes("svg") || /\.svgz?(\?|#|$)/i.test(href)) continue;
    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(url)) continue;
    const sizes = attr("sizes")
      .toLowerCase()
      .split(/\s+/)
      .map((s) => Number(s.split("x")[0]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const size = sizes.length ? Math.max(...sizes) : rel.includes("apple-touch-icon") ? 180 : 0;
    out.push({ url, rel, size, method: "declared" });
  }
  // Largest first; apple-touch icons are usually 180px and designed for tiles.
  return out.sort((a, b) => b.size - a.size || Number(b.rel.includes("apple")) - Number(a.rel.includes("apple")));
}

/** Ordered list of images to try for a listing. */
export function iconCandidates(listingUrl: string | null, html: string | null, finalPageUrl?: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  const page = ownPageFor(listingUrl);
  if (page) {
    if (html) out.push(...extractIconLinks(html, finalPageUrl || page)); // relative links resolve against the page after redirects
    out.push({ url: new URL("/favicon.ico", page).toString(), rel: "default", size: 0, method: "default-path" });
  }
  const owner = codeHostOwner(listingUrl);
  if (owner?.startsWith("github.com/")) out.push({ url: `https://${owner}.png?size=128`, rel: "avatar", size: 128, method: "github-owner" });
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/** Identifies a raster image by its magic bytes and reads its pixel size where cheap. SVG is never accepted. */
export function sniffImage(b: Uint8Array): SniffedImage | null {
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const u32be = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: "image/png", ext: "png", width: u32be(16), height: u32be(20) };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { mime: "image/gif", ext: "gif", width: u16le(6), height: u16le(8) };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    return { mime: "image/webp", ext: "webp", width: null, height: null };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Walk JPEG segments to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1]!;
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: "image/jpeg", ext: "jpg", height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", ext: "jpg", width: null, height: null };
  }
  if (b.length >= 22 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    const count = u16le(4);
    if (count < 1 || count > 64 || b.length < 6 + count * 16) return null;
    let best = 0;
    for (let k = 0; k < count; k++) best = Math.max(best, b[6 + k * 16] || 256);
    return { mime: "image/x-icon", ext: "ico", width: best, height: best };
  }
  return null;
}

/** An image is usable when it is a real raster icon of a sensible size. */
export function acceptIcon(bytes: Uint8Array): { ok: true; image: SniffedImage } | { ok: false; reason: string } {
  if (bytes.length < 60) return { ok: false, reason: "empty or tiny file" };
  if (bytes.length > MAX_ICON_BYTES) return { ok: false, reason: "file too large" };
  const image = sniffImage(bytes);
  if (!image) return { ok: false, reason: "not a PNG, JPEG, WebP, GIF or ICO image" };
  if (image.width !== null && (image.width < MIN_ICON_PX || image.height! < MIN_ICON_PX)) return { ok: false, reason: `too small (${image.width}px)` };
  if (image.width !== null && (image.width > 4096 || image.height! > 4096)) return { ok: false, reason: "dimensions too large" };
  return { ok: true, image };
}

/**
 * Platform default icons (hosting providers, doc generators) are the same file
 * on many unrelated sites. Any image shared by `threshold` or more different
 * registrable domains is treated as a platform default and dropped.
 */
export function findPlatformDefaults(records: { id: string; sha256: string; domain: string }[], threshold = 3): Set<string> {
  const domainsByHash = new Map<string, Set<string>>();
  for (const r of records) (domainsByHash.get(r.sha256) ?? domainsByHash.set(r.sha256, new Set()).get(r.sha256)!).add(r.domain);
  const bad = new Set<string>();
  for (const r of records) if ((domainsByHash.get(r.sha256)?.size ?? 0) >= threshold) bad.add(r.id);
  return bad;
}

export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** Reads a response body up to a byte limit; returns null if the limit is exceeded. */
export async function readLimited(res: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > max) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).slice(0, max + 1);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export interface FetchedIcon {
  bytes: Uint8Array;
  image: SniffedImage;
  candidate: IconCandidate;
  pageUrl: string;
}

/** Tries a listing's candidates in order and returns the first acceptable icon. */
export async function fetchListingIcon(listingUrl: string | null, fetcher: Fetcher, timeoutMs = 8000): Promise<FetchedIcon | { miss: string }> {
  const headers = { "user-agent": "ApiWallLogoFetcher/1.0 (+catalog logo import)", accept: "text/html,image/*;q=0.9,*/*;q=0.5" };
  const page = ownPageFor(listingUrl);
  let html: string | null = null;
  let pageUrl = page ?? listingUrl ?? "";
  if (page) {
    try {
      const res = await fetcher(page, { signal: AbortSignal.timeout(timeoutMs), headers });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("html")) {
        const body = await readLimited(res, MAX_HTML_BYTES);
        if (body) html = new TextDecoder().decode(body);
        pageUrl = res.url || page;
      }
    } catch {
      /* the site may be down; still try /favicon.ico */
    }
  }
  const candidates = iconCandidates(listingUrl, html, pageUrl);
  if (!candidates.length) return { miss: "no own site to read" };
  let last = "no icon found";
  for (const c of candidates.slice(0, 5)) {
    try {
      const res = await fetcher(c.url, { signal: AbortSignal.timeout(timeoutMs), headers });
      if (!res.ok) {
        last = `HTTP ${res.status}`;
        continue;
      }
      const bytes = await readLimited(res, MAX_ICON_BYTES);
      if (!bytes) {
        last = "file too large";
        continue;
      }
      const verdict = acceptIcon(bytes);
      if (!verdict.ok) {
        last = verdict.reason;
        continue;
      }
      return { bytes, image: verdict.image, candidate: c, pageUrl: c.method === "github-owner" ? listingUrl ?? c.url : pageUrl };
    } catch (e) {
      last = (e as Error).name === "TimeoutError" ? "timed out" : "network error";
    }
  }
  return { miss: last };
}
