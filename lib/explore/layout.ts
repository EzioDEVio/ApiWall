import type { Entry } from "./model";
import { GRID_CELLS, MARGIN, SLOTS_PER_ROW, TILE_SIZE } from "@/lib/catalog/placement";

/**
 * Where each visible tile is drawn. Two kinds:
 * - "full": the unfiltered overview. Every tile sits at its stable placement from the
 *   snapshot, with category band labels and the open provider band.
 * - "filtered": only the entries that pass the filters, packed into a compact grid
 *   (grouped by category, in category order). Listing IDs never change; only screen
 *   positions do, and the full layout comes back unchanged when filters clear.
 * Positions are in logical cells (one tile = TILE_SIZE cells), like the full map.
 */
export interface LayoutItem {
  entry: Entry;
  slot: number;
  x: number;
  y: number;
  /** Category slug whose colour the tile uses (the selected category when one is chosen). */
  colorSlug: string;
}

export interface MapLayout {
  mode: "full" | "filtered";
  cols: number;
  rows: number;
  width: number; // logical cells
  height: number;
  items: LayoutItem[];
  bySlot: Map<number, LayoutItem>;
  byId: Map<string, LayoutItem>;
  labels: { name: string; slot: number }[];
  /** Open provider slots (full layout only). */
  openSlots: { start: number; end: number } | null;
}

export interface Band {
  slug: string;
  name: string;
  start: number;
  end: number;
}

const index = (items: LayoutItem[]) => ({
  bySlot: new Map(items.map((i) => [i.slot, i])),
  byId: new Map(items.map((i) => [i.entry.id, i])),
});

export function fullLayout(entries: Entry[], bands: Band[], providerRegion: { start: number; end: number }): MapLayout {
  const items: LayoutItem[] = [];
  for (const e of entries)
    if (e.placement)
      items.push({
        entry: e,
        slot: e.placement.slot,
        x: e.placement.x,
        y: e.placement.y,
        colorSlug: e.categorySlug,
      });
  return {
    mode: "full",
    cols: SLOTS_PER_ROW,
    rows: SLOTS_PER_ROW,
    width: GRID_CELLS,
    height: GRID_CELLS,
    items,
    ...index(items),
    labels: [...bands.map((b) => ({ name: b.name, slot: b.start })), { name: "Open tiles · Place your API", slot: providerRegion.start }],
    openSlots: providerRegion,
  };
}

/**
 * Packs `entries` (already filtered) into `cols` columns. With a selected category every
 * tile belongs to one group named after it (cross-tagged listings included); otherwise
 * tiles are grouped by their own category, in `categoryOrder`, each group labelled where it starts.
 */
export function filteredLayout(
  entries: Entry[],
  opts: {
    cols: number;
    categoryOrder: Map<string, number>;
    names: Map<string, string>;
    focus?: { slug: string; name: string } | null;
  },
): MapLayout {
  const cols = Math.max(1, Math.min(SLOTS_PER_ROW, Math.floor(opts.cols)));
  const order = (slug: string) => opts.categoryOrder.get(slug) ?? Number.MAX_SAFE_INTEGER;
  const sorted = opts.focus
    ? [...entries].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id))
    : [...entries].sort((a, b) => order(a.categorySlug) - order(b.categorySlug) || a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id));

  const items: LayoutItem[] = [];
  const labels: { name: string; slot: number }[] = [];
  let group: string | null = null;
  sorted.forEach((e, slot) => {
    const g = opts.focus ? opts.focus.slug : e.categorySlug;
    if (g !== group) {
      group = g;
      labels.push({
        name: opts.focus ? opts.focus.name : (opts.names.get(g) ?? e.category),
        slot,
      });
    }
    items.push({
      entry: e,
      slot,
      x: MARGIN + (slot % cols) * TILE_SIZE,
      y: MARGIN + Math.floor(slot / cols) * TILE_SIZE,
      colorSlug: g,
    });
  });
  const rows = Math.max(1, Math.ceil(items.length / cols));
  return {
    mode: "filtered",
    cols,
    rows,
    width: cols * TILE_SIZE + 2 * MARGIN,
    height: rows * TILE_SIZE + 2 * MARGIN,
    items,
    ...index(items),
    labels,
    openSlots: null,
  };
}

/**
 * Columns for a filtered view: roughly the shape of the available area, but never so many
 * that tiles drop below `minTilePx` when the grid is fitted to the width.
 */
export function filteredColumns(count: number, availW: number, availH: number, minTilePx = 72): number {
  if (count <= 0) return 1;
  const maxCols = Math.max(1, Math.floor(availW / minTilePx));
  const ideal = Math.ceil(Math.sqrt(count * Math.max(0.4, availW / Math.max(1, availH))));
  return Math.max(1, Math.min(count, maxCols, ideal, SLOTS_PER_ROW));
}

/** Logical cell → slot in this layout, or -1. */
export function cellToLayoutSlot(layout: MapLayout, cx: number, cy: number): number {
  if (cx < MARGIN || cy < MARGIN) return -1;
  const col = Math.floor((cx - MARGIN) / TILE_SIZE);
  const row = Math.floor((cy - MARGIN) / TILE_SIZE);
  if (col >= layout.cols || row >= layout.rows) return -1;
  return row * layout.cols + col;
}

export function slotXY(layout: MapLayout, slot: number) {
  return {
    x: MARGIN + (slot % layout.cols) * TILE_SIZE,
    y: MARGIN + Math.floor(slot / layout.cols) * TILE_SIZE,
  };
}

export interface District {
  slug: string;
  name: string;
  /** Centre of the band's tiles, and the left edge and size of its main body, in logical cells. */
  cx: number;
  x0: number;
  cy: number;
  w: number;
  h: number;
  count: number;
}

/**
 * Where to write each category's name when the whole map is in view. A band wraps
 * across rows, so the label sits over the rows that hold most of its tiles.
 */
export function districts(layout: MapLayout, names: Map<string, string>): District[] {
  if (layout.mode !== "full") return [];
  const bySlug = new Map<string, LayoutItem[]>();
  for (const it of layout.items) (bySlug.get(it.colorSlug) ?? bySlug.set(it.colorSlug, []).get(it.colorSlug)!).push(it);
  const out: District[] = [];
  for (const [slug, items] of bySlug) {
    const rows = new Map<number, LayoutItem[]>();
    for (const it of items) (rows.get(it.y) ?? rows.set(it.y, []).get(it.y)!).push(it);
    const fullest = Math.max(...[...rows.values()].map((r) => r.length));
    const core = [...rows.values()].filter((r) => r.length >= fullest * 0.5).flat();
    const xs = core.map((i) => i.x);
    const ys = core.map((i) => i.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + TILE_SIZE;
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys) + TILE_SIZE;
    // Centre on where the tiles actually are (bands rarely fill whole rows), within the band's box.
    const meanX = core.reduce((a, i) => a + i.x, 0) / core.length + TILE_SIZE / 2;
    out.push({ slug, name: names.get(slug) ?? items[0]!.entry.category, cx: meanX, x0, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, count: items.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
