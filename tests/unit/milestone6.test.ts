import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyticsAllowed, countPath, countUrl, externalReferrer } from "@/lib/analytics";

const env = { hostname: "eziodevio.github.io" };

describe("cookie-free analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off unless a valid GoatCounter code is configured", async () => {
    expect(analyticsAllowed(env, "")).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_GOATCOUNTER", "https://evil.example/");
    vi.resetModules();
    expect((await import("@/lib/analytics")).GOATCOUNTER_CODE).toBe("");
    vi.stubEnv("NEXT_PUBLIC_GOATCOUNTER", " ApiWall ");
    vi.resetModules();
    const m = await import("@/lib/analytics");
    expect(m.GOATCOUNTER_CODE).toBe("apiwall");
    expect(m.ANALYTICS_ORIGIN).toBe("https://apiwall.goatcounter.com");
  });

  it("respects Do Not Track, Global Privacy Control, automated browsers and localhost", () => {
    expect(analyticsAllowed(env, "apiwall")).toBe(true);
    expect(analyticsAllowed({ ...env, doNotTrack: "1" }, "apiwall")).toBe(false);
    expect(analyticsAllowed({ ...env, globalPrivacyControl: true }, "apiwall")).toBe(false);
    expect(analyticsAllowed({ ...env, webdriver: true }, "apiwall")).toBe(false);
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) expect(analyticsAllowed({ hostname }, "apiwall")).toBe(false);
  });

  it("counts the path only: no query string (search terms) and no fragment", () => {
    expect(countPath("/apis/openai-api/?q=secret+search#top")).toBe("/apis/openai-api/");
    const u = new URL(countUrl({ path: "/packs/", title: "Starter packs", screen: "1920,1080,2" }, "apiwall")!);
    expect(u.origin).toBe("https://apiwall.goatcounter.com");
    expect(u.pathname).toBe("/count");
    expect(u.searchParams.get("p")).toBe("/packs/");
    expect(u.searchParams.get("t")).toBe("Starter packs");
    expect(u.searchParams.get("s")).toBe("1920,1080,2");
    expect(u.searchParams.has("e")).toBe(false);
    expect(countUrl({ path: "/" }, "")).toBeNull();
  });

  it("removes the base path so counts read the same on any address", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/ApiWall");
    vi.resetModules();
    const m = await import("@/lib/analytics");
    expect(m.countPath("/ApiWall/stats/")).toBe("/stats/");
    expect(m.countPath("/ApiWall")).toBe("/");
    expect(m.countPath("/ApiWallpaper/")).toBe("/ApiWallpaper/");
  });

  it("sends events only with short, slug-like names (never free text)", () => {
    const u = new URL(countUrl({ path: "open-api/openai-api", event: true }, "apiwall")!);
    expect(u.searchParams.get("e")).toBe("true");
    expect(u.searchParams.get("p")).toBe("open-api/openai-api");
    expect(countUrl({ path: "search/my secret query", event: true }, "apiwall")).toBeNull();
    expect(countUrl({ path: "Mixed/Case", event: true }, "apiwall")).toBeNull();
  });

  it("keeps only another site's origin as the referrer", () => {
    expect(externalReferrer("https://news.ycombinator.com/item?id=1", "https://eziodevio.github.io")).toBe("https://news.ycombinator.com");
    expect(externalReferrer("https://eziodevio.github.io/ApiWall/packs/", "https://eziodevio.github.io")).toBe("");
    expect(externalReferrer("", "https://eziodevio.github.io")).toBe("");
  });

  it("allows the count request in the security policy only when analytics is on", async () => {
    vi.resetModules();
    const off = (await import("@/next.config")).default;
    const offCsp = JSON.stringify(await off.headers?.());
    expect(offCsp).not.toContain("goatcounter");
    vi.stubEnv("NEXT_PUBLIC_GOATCOUNTER", "apiwall");
    vi.resetModules();
    const on = (await import("@/next.config")).default;
    expect(JSON.stringify(await on.headers?.())).toContain("img-src 'self' data: blob: https://apiwall.goatcounter.com");
  });

  it("the Pages workflow passes the code from a repository variable, never a hard-coded one", () => {
    const wf = readFileSync(path.join(process.cwd(), ".github/workflows/pages.yml"), "utf8");
    expect(wf).toContain("NEXT_PUBLIC_GOATCOUNTER: ${{ vars.GOATCOUNTER_CODE }}");
    expect(wf).toContain("SITE_URL_VAR: ${{ vars.SITE_URL }}");
  });
});
