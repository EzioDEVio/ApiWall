import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEntries, EMPTY_FILTERS, filterEntries } from "@/lib/explore/model";
import { LENS_IDS, LENSES, lensColor, lensCounts, lensKey } from "@/lib/explore/lenses";
import { rankSuggestions } from "@/lib/explore/suggest";
import { districts, fullLayout } from "@/lib/explore/layout";
import { fromBrowserCatalog, toBrowserCatalog } from "@/lib/catalog/browser";
import { bestIcoImage } from "@/lib/catalog/ico";
import { PROVIDER_REGION } from "@/lib/catalog/placement";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
const entries = buildEntries(snap, null);
const names = new Map(snap.categories.map((c) => [c.slug, c.name]));

describe("lenses", () => {
  it("put every entry in exactly one bucket, and each bucket's filter shows exactly that bucket", () => {
    for (const id of LENS_IDS) {
      if (id === "category") continue;
      const counts = lensCounts(entries, id);
      expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(entries.length);
      for (const b of LENSES[id].buckets) {
        const shown = filterEntries(entries, { ...EMPTY_FILTERS, ...b.filter });
        expect(shown.length).toBe(counts.get(b.key) ?? 0);
        for (const e of shown) expect(lensKey(e, id)).toBe(b.key);
      }
    }
  });
  it("colour tiles by bucket, and leave the category lens to category colours", () => {
    const keyless = entries.find((e) => e.auth === "none")!;
    const keyed = entries.find((e) => e.auth === "apiKey")!;
    expect(lensColor(keyless, "auth", false)).not.toBe(lensColor(keyed, "auth", false));
    expect(lensColor(keyless, "category", false)).toBeNull();
    expect(lensColor(keyless, "auth", true)).toMatch(/^hsl\(/);
  });
});

describe("search suggestions", () => {
  it("rank exact and prefix name matches first, and only suggest current results", () => {
    const s = rankSuggestions(entries, "open", 8);
    expect(s).toHaveLength(8);
    expect(s[0]!.name.toLowerCase().startsWith("open")).toBe(true);
    const ai = filterEntries(entries, { ...EMPTY_FILTERS, category: "ai-models" });
    const inAi = rankSuggestions(ai, "api", 20);
    for (const e of inAi) expect(ai).toContain(e);
    expect(rankSuggestions(entries, "   ")).toEqual([]);
    expect(rankSuggestions(entries, "claude api")[0]!.name).toBe("Claude API");
  });
});

describe("map labels at overview", () => {
  it("give each category one label inside its band", () => {
    const L = fullLayout(entries, snap.regions.map((r) => ({ ...r, name: names.get(r.slug)! })), PROVIDER_REGION);
    const d = districts(L, names);
    expect(d.length).toBe(new Set(entries.filter((e) => e.placement).map((e) => e.categorySlug)).size);
    const dev = d.find((x) => x.slug === "development")!;
    expect(dev.name).toBe("Development");
    expect(d[0]!.count).toBeGreaterThanOrEqual(d[d.length - 1]!.count); // biggest first
    for (const x of d) {
      expect(x.cx).toBeGreaterThanOrEqual(x.x0);
      expect(x.cx).toBeLessThanOrEqual(x.x0 + x.w);
    }
  });
});

describe("slim browser catalog", () => {
  it("round-trips every listing and placement, without logo download URLs or warnings", () => {
    const b = toBrowserCatalog(snap);
    const json = JSON.stringify(b);
    expect(json.length).toBeLessThan(JSON.stringify(snap).length * 0.9);
    expect(json).not.toContain('"iconUrl"');
    const back = fromBrowserCatalog(JSON.parse(json));
    expect(back.listings).toEqual(snap.listings);
    expect(back.placements).toEqual(snap.placements);
    expect(Object.keys(back.marks)).toEqual(Object.keys(snap.marks));
    expect(fromBrowserCatalog(snap)).toBe(snap); // the full form passes through untouched
  });
  it("points image marks at small tile copies where they exist", () => {
    const withTile = Object.values(snap.marks).filter((m) => m.type === "image" && m.tile);
    for (const m of withTile) expect(m.type === "image" && m.tile).toMatch(/^\/marks\/tiles\/[a-z0-9_-]+\.webp$/);
  });
});

describe("ico reader", () => {
  it("picks the largest PNG entry, or decodes a 32-bit bitmap, and refuses junk", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const ico = (entries: { w: number; data: Uint8Array }[]) => {
      const header = 6 + entries.length * 16;
      const total = header + entries.reduce((a, e) => a + e.data.length, 0);
      const buf = new Uint8Array(total);
      const dv = new DataView(buf.buffer);
      dv.setUint16(2, 1, true);
      dv.setUint16(4, entries.length, true);
      let off = header;
      entries.forEach((e, i) => {
        const o = 6 + i * 16;
        buf[o] = e.w % 256;
        buf[o + 1] = e.w % 256;
        dv.setUint16(o + 6, 32, true);
        dv.setUint32(o + 8, e.data.length, true);
        dv.setUint32(o + 12, off, true);
        buf.set(e.data, off);
        off += e.data.length;
      });
      return buf;
    };
    // A 2×2 32-bit bitmap: 40-byte header, rows bottom-up in BGRA, plus an AND mask.
    const bmp = new Uint8Array(40 + 16 + 8);
    const bv = new DataView(bmp.buffer);
    bv.setUint32(0, 40, true);
    bv.setInt32(4, 2, true);
    bv.setInt32(8, 4, true);
    bv.setUint16(14, 32, true);
    bmp.set([0, 0, 255, 255], 40 + 8); // top-left pixel (stored in the last row): red
    const big = bestIcoImage(ico([{ w: 16, data: bmp }, { w: 256, data: png }]))!;
    expect(big).toMatchObject({ kind: "png", size: 256 });
    const small = bestIcoImage(ico([{ w: 2, data: bmp }]))!;
    expect(small.kind).toBe("rgba");
    if (small.kind === "rgba") expect([...small.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(bestIcoImage(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
