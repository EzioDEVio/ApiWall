import type { CatalogListing, CategoryRegion, Placement } from "./types";

// The map is 1000 × 1000 logical cells. Each listing occupies a 16 × 16 cell
// footprint ("slot"), so the slot grid is 62 × 62 = 3,844 slots with a
// 4-cell margin. The bottom five slot rows are reserved for reviewed
// provider submissions, which keeps them apart from upstream catalog tiles.
export const GRID_CELLS = 1000;
export const TILE_SIZE = 16;
export const SLOTS_PER_ROW = Math.floor(GRID_CELLS / TILE_SIZE); // 62
export const TOTAL_SLOTS = SLOTS_PER_ROW * SLOTS_PER_ROW; // 3844
export const MARGIN = Math.floor((GRID_CELLS - SLOTS_PER_ROW * TILE_SIZE) / 2); // 4
export const PROVIDER_ROWS = 5;
export const PROVIDER_REGION = { start: TOTAL_SLOTS - PROVIDER_ROWS * SLOTS_PER_ROW, end: TOTAL_SLOTS };

export function slotToPlacement(id: string, slot: number): Placement {
  const col = slot % SLOTS_PER_ROW;
  const row = Math.floor(slot / SLOTS_PER_ROW);
  return { id, slot, x: MARGIN + col * TILE_SIZE, y: MARGIN + row * TILE_SIZE, size: TILE_SIZE };
}

/** Logical cell → slot index, or -1 outside the slot grid. */
export function cellToSlot(cx: number, cy: number): number {
  const col = Math.floor((cx - MARGIN) / TILE_SIZE);
  const row = Math.floor((cy - MARGIN) / TILE_SIZE);
  if (cx < MARGIN || cy < MARGIN || col < 0 || row < 0 || col >= SLOTS_PER_ROW || row >= SLOTS_PER_ROW) return -1;
  return row * SLOTS_PER_ROW + col;
}

/** Room left in a new category band for future additions. */
export const regionCapacity = (count: number) => count + Math.max(4, Math.ceil(count * 0.25));

export interface PlacementInput {
  listings: CatalogListing[];
  categoryOrder: string[]; // slugs, in the order new bands are allocated
  previous?: { regions: CategoryRegion[]; placements: Record<string, Placement> };
}

export interface PlacementOutput {
  regions: CategoryRegion[];
  placements: Record<string, Placement>;
  warnings: string[];
}

/**
 * Deterministic and stable: the same input always yields the same output, and
 * when a previous snapshot is supplied, every listing that still exists keeps
 * its slot. New listings take the first free slot in their category band,
 * then the shared overflow area. No randomness is involved.
 */
export function assignPlacements({ listings, categoryOrder, previous }: PlacementInput): PlacementOutput {
  const warnings: string[] = [];
  const counts = new Map<string, number>();
  for (const l of listings) counts.set(l.categorySlug, (counts.get(l.categorySlug) ?? 0) + 1);

  const regions: CategoryRegion[] = [];
  const bySlug = new Map<string, CategoryRegion>();
  for (const r of previous?.regions ?? []) {
    if (counts.has(r.slug)) {
      regions.push({ ...r });
      bySlug.set(r.slug, regions[regions.length - 1]!);
    }
  }
  // Bands of categories that disappeared stay reserved so their neighbours do not move.
  // New bands also start after any slot an earlier import used for overflow, so those tiles keep their place.
  const prevSlots = Object.values(previous?.placements ?? {}).map((p) => p.slot).filter((s) => s < PROVIDER_REGION.start);
  let cursor = Math.max(0, ...(previous?.regions ?? []).map((r) => r.end), ...prevSlots.map((s) => s + 1));
  for (const slug of categoryOrder) {
    if (bySlug.has(slug) || !counts.has(slug)) continue;
    const cap = regionCapacity(counts.get(slug)!);
    const end = Math.min(cursor + cap, PROVIDER_REGION.start);
    if (end - cursor < counts.get(slug)!) warnings.push(`category ${slug}: band truncated to ${end - cursor} slots; extra listings use overflow`);
    const r = { slug, start: cursor, end };
    regions.push(r);
    bySlug.set(slug, r);
    cursor = end;
  }
  const overflowStart = Math.max(cursor, ...regions.map((r) => r.end));

  const taken = new Set<number>();
  const placements: Record<string, Placement> = {};
  const inRegion = (slot: number, r: CategoryRegion | undefined) => !!r && slot >= r.start && slot < r.end;
  // Overflow = any slot outside every category band (earlier imports may have used slots before a newer band).
  const inOverflow = (slot: number) => slot < PROVIDER_REGION.start && !regions.some((r) => slot >= r.start && slot < r.end);

  // Pass 1: keep previous slots that are still valid for the listing's category.
  const pending: CatalogListing[] = [];
  for (const l of listings) {
    const prev = previous?.placements[l.id];
    if (prev && !taken.has(prev.slot) && (inRegion(prev.slot, bySlug.get(l.categorySlug)) || inOverflow(prev.slot))) {
      taken.add(prev.slot);
      placements[l.id] = slotToPlacement(l.id, prev.slot);
    } else pending.push(l);
  }

  // Pass 2: new or moved listings, in deterministic listing order.
  for (const l of pending) {
    const r = bySlug.get(l.categorySlug);
    let slot = -1;
    if (r) for (let s = r.start; s < r.end; s++) if (!taken.has(s)) { slot = s; break; }
    if (slot < 0) for (let s = overflowStart; s < PROVIDER_REGION.start; s++) if (!taken.has(s)) { slot = s; break; }
    if (slot < 0) {
      warnings.push(`no free slot for ${l.id}; it appears in the directory list only`);
      continue;
    }
    taken.add(slot);
    placements[l.id] = slotToPlacement(l.id, slot);
  }
  return { regions, placements, warnings };
}
