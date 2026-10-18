import { describe, expect, it } from "vitest";
import {
  acceptIcon,
  extractIconLinks,
  fetchListingIcon,
  findPlatformDefaults,
  iconCandidates,
  ownPageFor,
  sniffImage,
  type Fetcher,
} from "@/lib/catalog/favicons";
import { buildMarks } from "@/lib/catalog/marks";
import { normalize } from "@/lib/catalog/normalize";
import { parseReadme } from "@/lib/catalog/parse";

/** A minimal valid PNG header with the given size, padded to look like a real file. */
function png(w: number, h = w): Uint8Array {
  const b = new Uint8Array(200);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function ico(sizes: number[]): Uint8Array {
  const b = new Uint8Array(Math.max(200, 6 + sizes.length * 16));
  b.set([0, 0, 1, 0, sizes.length, 0]);
  sizes.forEach((s, i) => (b[6 + i * 16] = s >= 256 ? 0 : s));
  return b;
}

/** Fake network: url → [status, content-type, body]. */
function fakeFetch(routes: Record<string, [number, string, Uint8Array | string]>, log: string[] = []): Fetcher {
  return async (url) => {
    log.push(url);
    const r = routes[url];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    const [status, type, body] = r;
    const res = new Response(typeof body === "string" ? body : new Blob([body as Uint8Array<ArrayBuffer>]), { status, headers: { "content-type": type } });
    Object.defineProperty(res, "url", { value: url });
    return res;
  };
}

describe("finding a provider's own icon", () => {
  it("reads declared icons, largest first, skipping SVG and mask icons", () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel='icon' type='image/svg+xml' href='/logo.svg'>
      <link rel="mask-icon" href="/mask.png">
      <link href="/apple.png" rel="apple-touch-icon">
      <link rel="icon" sizes="32x32 64x64" href="https://cdn.example.net/icon-64.png">
      <link rel="stylesheet" href="/style.css">
    </head></html>`;
    const c = extractIconLinks(html, "https://api.acme.test/");
    expect(c.map((x) => x.url)).toEqual(["https://api.acme.test/apple.png", "https://cdn.example.net/icon-64.png", "https://api.acme.test/favicon-16.png"]);
    expect(c[0]!.size).toBe(180);
  });

  it("only reads pages the provider owns", () => {
    expect(ownPageFor("https://developer.spotify.com/documentation/web-api")).toBe("https://developer.spotify.com/");
    expect(ownPageFor("https://github.com/acme/api")).toBeNull();
    expect(ownPageFor("https://rapidapi.com/acme/api/x")).toBeNull();
    expect(ownPageFor("https://docs.google.com/document/d/1")).toBeNull();
    expect(ownPageFor("http://127.0.0.1:8080/")).toBeNull();
    expect(ownPageFor("http://localhost/")).toBeNull();
    // A project's own subdomain on a hosting platform is still its own site.
    expect(ownPageFor("https://theaxolotlapi.netlify.app/")).toBe("https://theaxolotlapi.netlify.app/");
  });

  it("uses the GitHub owner's avatar for GitHub-hosted projects", () => {
    const c = iconCandidates("https://github.com/Acme/weather-api", null);
    expect(c).toEqual([{ url: "https://github.com/acme.png?size=128", rel: "avatar", size: 128, method: "github-owner" }]);
  });

  it("sniffs real image types and rejects SVG, HTML and tiny icons", () => {
    expect(sniffImage(png(180))).toMatchObject({ ext: "png", width: 180 });
    expect(sniffImage(ico([16, 32, 48]))).toMatchObject({ ext: "ico", width: 48 });
    expect(sniffImage(ico([16, 256]))).toMatchObject({ width: 256 });
    expect(acceptIcon(new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">${" ".repeat(100)}</svg>`)).ok).toBe(false);
    expect(acceptIcon(new TextEncoder().encode(`<!doctype html><html>${" ".repeat(100)}</html>`)).ok).toBe(false);
    expect(acceptIcon(png(8))).toEqual({ ok: false, reason: "too small (8px)" });
    expect(acceptIcon(png(64)).ok).toBe(true);
  });

  it("flags icons shared by many unrelated domains as platform defaults", () => {
    const bad = findPlatformDefaults([
      { id: "a", sha256: "same", domain: "one.netlify.app" },
      { id: "b", sha256: "same", domain: "two.netlify.app" },
      { id: "c", sha256: "same", domain: "three.netlify.app" },
      { id: "d", sha256: "unique", domain: "acme.test" },
      { id: "e", sha256: "pair", domain: "nasa.gov" },
      { id: "f", sha256: "pair", domain: "nasa.gov" }, // same organisation, not a platform default
    ]);
    expect([...bad].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("fetchListingIcon with a simulated network", () => {
  it("downloads the largest declared icon from the provider's page", async () => {
    const log: string[] = [];
    const fetcher = fakeFetch(
      {
        "https://api.acme.test/": [200, "text/html; charset=utf-8", `<link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/fav.ico">`],
        "https://api.acme.test/touch.png": [200, "image/png", png(180)],
      },
      log,
    );
    const r = await fetchListingIcon("https://api.acme.test/docs/v2", fetcher);
    expect("miss" in r).toBe(false);
    if (!("miss" in r)) {
      expect(r.candidate.url).toBe("https://api.acme.test/touch.png");
      expect(r.image.width).toBe(180);
      expect(r.pageUrl).toBe("https://api.acme.test/");
    }
    expect(log).toEqual(["https://api.acme.test/", "https://api.acme.test/touch.png"]);
  });

  it("skips broken or fake images and falls back to /favicon.ico", async () => {
    const fetcher = fakeFetch({
      "https://acme.test/": [200, "text/html", `<link rel="icon" href="/broken.png"><link rel="icon" href="/actually-html.png">`],
      "https://acme.test/broken.png": [500, "text/plain", "err"],
      "https://acme.test/actually-html.png": [200, "image/png", `<!doctype html><title>Not found</title>${" ".repeat(100)}`],
      "https://acme.test/favicon.ico": [200, "image/x-icon", ico([16, 32])],
    });
    const r = await fetchListingIcon("https://acme.test/api", fetcher);
    expect("miss" in r ? r.miss : r.candidate.method).toBe("default-path");
  });

  it("still tries /favicon.ico when the home page is down, and reports a miss when nothing works", async () => {
    const down: Fetcher = async (url) => {
      if (url.endsWith("/")) throw new TypeError("fetch failed");
      return new Response("nope", { status: 404 });
    };
    const r = await fetchListingIcon("https://gone.example.org/api", down);
    expect(r).toEqual({ miss: "HTTP 404" });
  });

  it("never reads platform pages such as RapidAPI", async () => {
    const log: string[] = [];
    const r = await fetchListingIcon("https://rapidapi.com/acme/api/weather", fakeFetch({}, log));
    expect(r).toEqual({ miss: "no own site to read" });
    expect(log).toEqual([]);
  });

  it("refuses oversized HTML and images", async () => {
    const huge = "x".repeat(1_100_000);
    const r = await fetchListingIcon(
      "https://big.example.com/",
      fakeFetch({ "https://big.example.com/": [200, "text/html", huge], "https://big.example.com/favicon.ico": [200, "image/x-icon", new Uint8Array(400_000)] }),
    );
    expect(r).toEqual({ miss: "file too large" });
  });
});

describe("logo marks in the snapshot", () => {
  const listing = (name: string, url: string) => normalize(parseReadme(`## Index\n### X\nAPI | Description | Auth | HTTPS | CORS\n|---|---|---|---|---|\n| [${name}](${url}) | d | No | Yes | Yes |`)).listings[0]!;
  const rec = (over: Partial<import("@/lib/catalog/favicons").FaviconRecord> = {}) => ({
    file: "x.png",
    width: 180,
    height: 180,
    sha256: "h",
    iconUrl: "https://acme.test/touch.png",
    pageUrl: "https://acme.test/",
    method: "declared" as const,
    fetchedAt: "2026-10-17T00:00:00Z",
    ...over,
  });

  it("uses a fetched logo with its source, keeping the monogram as fallback", () => {
    const l = listing("Acme", "https://acme.test/api");
    const m = buildMarks([l], [], "x", { [l.id]: rec({ file: `${l.id}.png` }) })[l.id]!;
    expect(m.type).toBe("image");
    if (m.type === "image") {
      expect(m.src).toBe(`/marks/${l.id}.png`);
      expect(m.sourceUrl).toBe("https://acme.test/");
      expect(m.basis).toMatch(/provider's own website/);
      expect(m.fallback.text).toBe("Ac");
    }
  });

  it("prefers a crisp vector mark over a 16px favicon, but a large logo over the vector", () => {
    const icons = [{ title: "Spotify", slug: "spotify", hex: "1ED760", path: "M0 0", source: "https://developer.spotify.com/brand" }];
    const l = listing("Spotify", "https://developer.spotify.com/web-api");
    expect(buildMarks([l], icons, "x", { [l.id]: rec({ width: 16 }) })[l.id]!.type).toBe("brand");
    expect(buildMarks([l], icons, "x", { [l.id]: rec({ width: 180 }) })[l.id]!.type).toBe("image");
  });
});
