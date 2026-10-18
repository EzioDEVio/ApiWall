import type { CatalogSnapshot, IdentityMark, Placement } from "./types";
import { slotToPlacement } from "./placement";

/**
 * The catalog as the browser receives it: the same listings, categories and marks, but
 * tile positions as one slot number each (x, y and size follow from it), no logo download
 * URLs and no import warnings. About 40% smaller than the snapshot on disk.
 */
export type BrowserCatalog = Omit<CatalogSnapshot, "placements" | "warnings" | "marks"> & {
  format: "browser-1";
  slots: Record<string, number>;
  marks: Record<string, BrowserMark>;
};
type BrowserMark = IdentityMark extends infer M ? (M extends { type: "image" } ? Omit<M, "iconUrl"> : M) : never;

export function toBrowserCatalog(s: CatalogSnapshot): BrowserCatalog {
  const slots: Record<string, number> = {};
  for (const [id, p] of Object.entries(s.placements)) slots[id] = p.slot;
  const marks: Record<string, BrowserMark> = {};
  for (const [id, m] of Object.entries(s.marks)) {
    if (m.type === "image") {
      const { iconUrl: _drop, ...rest } = m; // eslint-disable-line @typescript-eslint/no-unused-vars
      marks[id] = rest;
    } else marks[id] = m;
  }
  const { placements: _p, warnings: _w, marks: _m, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, format: "browser-1", slots, marks };
}

/** Accepts either form and returns a full snapshot shape for the app. */
export function fromBrowserCatalog(c: BrowserCatalog | CatalogSnapshot): CatalogSnapshot {
  if (!("format" in c) || c.format !== "browser-1") return c as CatalogSnapshot;
  const placements: Record<string, Placement> = {};
  for (const [id, slot] of Object.entries(c.slots)) placements[id] = slotToPlacement(id, slot);
  const marks: Record<string, IdentityMark> = {};
  for (const [id, m] of Object.entries(c.marks)) marks[id] = m.type === "image" ? { ...m, iconUrl: m.sourceUrl } : m;
  const { slots: _s, format: _f, marks: _m, ...rest } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, placements, marks, warnings: [] };
}
