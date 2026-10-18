import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEntries, EMPTY_FILTERS, filterEntries } from "@/lib/explore/model";
import { parseList, parseUrlState, toUrlSearch } from "@/lib/explore/urlState";
import { carryAddedAt, diffListings, EMPTY_CHANGELOG, isRecent, recordChange, type Changelog } from "@/lib/catalog/history";
import { fromBrowserCatalog, toBrowserCatalog } from "@/lib/catalog/browser";
import type { CatalogListing, CatalogSnapshot } from "@/lib/catalog/types";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const changelog = JSON.parse(readFileSync(path.join(process.cwd(), "data/changelog.json"), "utf8")) as Changelog;

const listing = (id: string, extra: Partial<CatalogListing> = {}): CatalogListing =>
  ({ ...snap.listings[0], id, name: id.toUpperCase(), category: "Animals", addedAt: undefined, ...extra }) as CatalogListing;
const snapOf = (listings: CatalogListing[]): CatalogSnapshot => ({ ...snap, listings });
const DAY = 86_400_000;

describe("first-seen dates and the changelog", () => {
  it("dates only listings that are new since the previous import, and keeps earlier dates", () => {
    const prev = snapOf([listing("a"), listing("b", { addedAt: "2026-01-01T00:00:00.000Z" })]);
    const next = snapOf([listing("a"), listing("b"), listing("c")]);
    carryAddedAt(next, prev, "2026-10-17T00:00:00.000Z");
    expect(next.listings.map((l) => l.addedAt)).toEqual([undefined, "2026-01-01T00:00:00.000Z", "2026-10-17T00:00:00.000Z"]);
  });
  it("leaves the very first import undated, since we cannot know when those joined", () => {
    const next = snapOf([listing("a")]);
    carryAddedAt(next, null, "2026-10-17T00:00:00.000Z");
    expect(next.listings[0]!.addedAt).toBeUndefined();
    expect(diffListings(null, next)).toEqual({ added: [], removed: [] });
  });
  it("lists added and removed listings, and records an entry only when something changed", () => {
    const d = diffListings(snapOf([listing("a"), listing("gone")]), snapOf([listing("a"), listing("fresh")]));
    expect(d.added.map((x) => x.id)).toEqual(["fresh"]);
    expect(d.removed.map((x) => x.id)).toEqual(["gone"]);
    const entry = { at: "2026-10-17T00:00:00.000Z", commit: null, ...d };
    const log = recordChange(EMPTY_CHANGELOG, entry);
    expect(log.entries).toHaveLength(1);
    expect(recordChange(log, { ...entry, added: [], removed: [] })).toBe(log);
  });
  it("keeps the log newest first and bounded", () => {
    let log: Changelog = EMPTY_CHANGELOG;
    for (let i = 0; i < 130; i++)
      log = recordChange(log, {
        at: new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(),
        commit: null,
        added: [{ id: `x${i}`, name: "X", category: "Animals" }],
        removed: [],
      });
    expect(log.entries.length).toBe(104);
    expect(log.entries[0]!.added[0]!.id).toBe("x129");
  });
  it("treats a listing as new for seven days, and ignores bad or future dates", () => {
    const now = Date.parse("2026-10-20T12:00:00.000Z");
    expect(isRecent("2026-10-17T12:00:00.000Z", now)).toBe(true);
    expect(isRecent("2026-10-12T12:00:00.000Z", now)).toBe(false);
    expect(isRecent(undefined, now)).toBe(false);
    expect(isRecent("not a date", now)).toBe(false);
    expect(isRecent("2027-01-01T00:00:00.000Z", now)).toBe(false);
  });
  it("ships a changelog whose added listings exist and carry the same first-seen date", () => {
    expect(changelog.version).toBe(1);
    const byId = new Map(snap.listings.map((l) => [l.id, l]));
    for (const e of changelog.entries)
      for (const a of e.added) {
        const l = byId.get(a.id);
        if (!l) continue; // removed by a later import
        expect(l.addedAt).toBe(changelog.entries.find((x) => x.added.some((y) => y.id === a.id))?.at);
      }
    expect(changelog.entries.length).toBeGreaterThan(0);
  });
  it("keeps first-seen dates in the slim browser catalog", () => {
    const back = fromBrowserCatalog(toBrowserCatalog(snap));
    expect(back.listings.filter((l) => l.addedAt).length).toBe(snap.listings.filter((l) => l.addedAt).length);
  });
});

describe("New this week filter", () => {
  it("shows exactly the listings first seen within the last week", () => {
    const now = Date.now();
    const entries = buildEntries(snap, null).map((e, i) => (i < 3 ? { ...e, addedAt: new Date(now - DAY).toISOString() } : { ...e, addedAt: undefined }));
    const shown = filterEntries(entries, { ...EMPTY_FILTERS, fresh: "yes" });
    expect(shown.map((e) => e.id)).toEqual(entries.slice(0, 3).map((e) => e.id));
  });
});

describe("saved and shared lists in URLs", () => {
  it("round-trips the new, saved and list parameters", () => {
    const state = {
      filters: { ...EMPTY_FILTERS, fresh: "yes" as const, saved: "yes" as const },
      view: null,
      api: null,
      lens: "category" as const,
      list: ["api-a", "api-b"],
    };
    const search = toUrlSearch(state);
    expect(search).toBe("?new=yes&saved=yes&list=api-a%2Capi-b");
    expect(parseUrlState(search)).toEqual(state);
  });
  it("accepts only well-formed IDs in a shared list, without duplicates, up to 100", () => {
    expect(parseList("api-a,<script>,API-B,api-a,,api-c")).toEqual(["api-a", "api-c"]);
    expect(parseList("")).toBeNull();
    expect(parseList("<x>")).toBeNull();
    expect(parseList(Array.from({ length: 150 }, (_, i) => `id-${i}`).join(","))).toHaveLength(100);
    expect(parseUrlState("?new=maybe&saved=1").filters).toEqual(EMPTY_FILTERS);
  });
});
