// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IdentityMark } from "@/components/IdentityMark";
import { DetailDialog } from "@/components/DetailDialog";
import { CategoryNav } from "@/components/CategoryNav";
import type { Entry } from "@/lib/explore/model";
import type { SnapshotSource } from "@/lib/catalog/types";

beforeAll(() => {
  // jsdom lacks scrolling and the modal dialog API.
  Element.prototype.scrollIntoView = function () {};
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

const source: SnapshotSource = {
  repo: "public-apis/public-apis",
  readmeUrl: "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md",
  ref: "master",
  commit: "065455eda4bec6b61984e98b85a585851f7b8cbd",
  contentSha256: "a".repeat(64),
  fetchedFrom: "network",
  importedAt: "2026-10-17T06:20:37.000Z",
  license: { name: "MIT", url: "https://github.com/public-apis/public-apis/blob/master/LICENSE", notice: "Copyright (c) 2022 public-apis" },
};

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "api-cat-facts-abc",
  source: "catalog",
  kind: "api",
  name: "Cat Facts",
  description: "Daily cat facts",
  category: "Animals",
  categorySlug: "animals",
  url: "https://catfact.ninja/",
  raw: { auth: "No", https: "Yes", cors: "Yes" },
  link: { state: "unchecked" },
  auth: "none",
  https: "yes",
  cors: "yes",
  sourceLine: 160,
  origin: "upstream",
  tags: [],
  placement: { id: "x", slot: 0, x: 4, y: 4, size: 16 },
  mark: { type: "monogram", text: "CF", seed: 3 },
  sponsored: false,
  access: "unknown",
  claim: null,
  search: "cat facts daily cat facts",
  ...over,
});

describe("IdentityMark", () => {
  it("falls back to the monogram when a logo fails to load", () => {
    render(<IdentityMark mark={{ type: "logo", src: "/api/logos/missing", title: "Acme", fallback: { text: "AC", seed: 1 } }} name="Acme" categoryIndex={2} />);
    const img = screen.getByTestId("provider-logo");
    fireEvent.error(img);
    expect(screen.queryByTestId("provider-logo")).toBeNull();
    expect(screen.getByTestId("logo-fallback").textContent).toContain("AC");
  });

  it("renders brand marks with an accessible name and monograms otherwise", () => {
    render(<IdentityMark mark={{ type: "brand", title: "Spotify", hex: "1ED760", path: "M0 0h24v24H0z", basis: "x", sourceUrl: "https://x" }} name="Spotify" categoryIndex={0} />);
    expect(screen.getByRole("img", { name: "Spotify mark" })).toBeTruthy();
    cleanup();
    render(<IdentityMark mark={{ type: "monogram", text: "CF", seed: 0 }} name="Cat Facts" categoryIndex={0} />);
    expect(screen.getByRole("img", { name: "Cat Facts monogram" })).toBeTruthy();
  });
});

describe("DetailDialog", () => {
  it("shows imported values, unknown access, source info and a safe external link", () => {
    render(<DetailDialog entry={entry()} onClose={() => {}} source={source} categoryIndex={0} glyph={undefined} dark={false} />);
    expect(screen.getByRole("heading", { name: "Cat Facts" })).toBeTruthy();
    expect(screen.getByTestId("access-unknown").textContent).toMatch(/does not mean it is free/);
    const link = screen.getByTestId("docs-link") as HTMLAnchorElement;
    expect(link.href).toBe("https://catfact.ninja/");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
    expect(screen.getByText(/You are leaving ApiWall/)).toBeTruthy();
    expect(screen.getByText(/README line 160/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /demo/i })).toBeNull(); // never a fake demo control
  });

  it("labels sponsored provider listings and shows verified claim details", () => {
    render(
      <DetailDialog
        entry={entry({
          source: "provider",
          sponsored: true,
          providerName: "Acme",
          access: "provider-confirmed-free-tier",
          claim: { status: "provider-confirmed-free-tier", sourceUrl: "https://acme.test/pricing", verifiedAt: "2026-10-01", limits: "1,000/day", eligibility: "Everyone", expiration: "None stated", terms: "Free tier" },
        })}
        onClose={() => {}}
        source={source}
        categoryIndex={0}
        glyph={undefined}
        dark={false}
      />,
    );
    expect(screen.getByText(/★ Sponsored/)).toBeTruthy();
    expect(screen.getByText(/Provider-submitted, reviewed/)).toBeTruthy();
    expect(screen.getByTestId("verified-claim").textContent).toMatch(/1,000\/day/);
    expect(screen.getByText(/not part of the upstream public-apis catalog/)).toBeTruthy();
  });

  it("shows no link when the imported URL was unusable", () => {
    render(<DetailDialog entry={entry({ url: null })} onClose={() => {}} source={source} categoryIndex={0} glyph={undefined} dark={false} />);
    expect(screen.queryByTestId("docs-link")).toBeNull();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });
});

describe("CategoryNav", () => {
  const rows = [
    { slug: "ai-models", name: "AI Models", glyph: "sparkles", count: 13 },
    { slug: "animals", name: "Animals", glyph: "paw", count: 24 },
    { slug: "art-and-design", name: "Art & Design", glyph: "palette", count: 0 },
  ];
  const props = { rows, allCount: 37, aiSlug: "ai-models", categoryIndex: new Map(rows.map((r, i) => [r.slug, i])), glyphs: {}, dark: false, onClose: () => {}, onOpenTiles: null };

  it("lists All APIs and AI Models first, then every category, as toggle buttons named with their counts", () => {
    const chosen: string[] = [];
    render(<CategoryNav {...props} active="animals" onChoose={(s) => chosen.push(s)} drawer={false} />);
    const nav = screen.getByRole("navigation", { name: "Categories" });
    const buttons = Array.from(nav.querySelectorAll("button"));
    // Names come from the visible text plus screen-reader-only words, so they always contain what is on screen (WCAG 2.5.3).
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([null, null, null, null]);
    expect(buttons.map((b) => b.textContent!.replace(/\s+/g, " ").trim())).toEqual(["All APIs 37 results", "AI Models 13 results", "Animals 24 results", "Art & Design 0 results"]);
    expect(screen.getByRole("button", { name: "Animals 24 results" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All APIs 37 results" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /^AI Models/ }));
    fireEvent.click(screen.getByRole("button", { name: /^All APIs/ }));
    expect(chosen).toEqual(["ai-models", ""]);
    expect(screen.queryByRole("button", { name: "Close categories" })).toBeNull();
  });

  it("as a drawer it has a close button", () => {
    let closed = false;
    render(<CategoryNav {...props} active="" onChoose={() => {}} drawer onClose={() => (closed = true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Close categories" }));
    expect(closed).toBe(true);
  });
});

describe("DetailDialog for AI model entries", () => {
  const ai = {
    provider: "Acme",
    models: "acme-1",
    authDetail: "Bearer key",
    apiHost: "api.acme.example",
    docsUrl: "https://docs.acme.example/api",
    verifiedAt: "2026-10-17",
  };
  it("shows the checked model facts and marks curated entries as not from the upstream catalog", () => {
    render(<DetailDialog entry={entry({ origin: "supplement", category: "AI Models", categorySlug: "ai-models", tags: ["ai-models"], sourceLine: 0, aiModel: ai })} onClose={() => {}} source={source} categoryIndex={0} glyph={undefined} dark={false} />);
    const box = screen.getByTestId("ai-model");
    expect(box.textContent).toContain("acme-1");
    expect(box.textContent).toContain("Not verified");
    expect(screen.getByTestId("supplement-source").textContent).toMatch(/not part of the upstream/);
  });
  it("keeps upstream attribution for cross-tagged listings", () => {
    render(<DetailDialog entry={entry({ tags: ["ai-models"], aiModel: ai })} onClose={() => {}} source={source} categoryIndex={0} glyph={undefined} dark={false} />);
    expect(screen.queryByTestId("supplement-source")).toBeNull();
    expect(screen.getByText(/README line 160/)).toBeTruthy();
    expect(screen.getByText("Also in AI Models")).toBeTruthy();
  });
});
