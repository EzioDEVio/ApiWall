import type { CatalogListing, CatalogSnapshot } from "./types";

/**
 * When each listing first appeared, and a changelog of what each import added or
 * removed. Listings present at the very first import have no date (we don't know when
 * they joined public-apis); everything after that is dated by the import that found it.
 */
export interface ChangeItem {
  id: string;
  name: string;
  category: string;
}
export interface ChangeEntry {
  at: string; // ISO time of the import
  commit: string | null; // upstream commit, when known
  note?: string;
  added: ChangeItem[];
  removed: ChangeItem[];
}
export interface Changelog {
  version: 1;
  entries: ChangeEntry[]; // newest first
}

export const EMPTY_CHANGELOG: Changelog = { version: 1, entries: [] };
const MAX_ENTRIES = 104; // about two years of weekly syncs

const item = (l: CatalogListing): ChangeItem => ({ id: l.id, name: l.name, category: l.category });

/** Copies first-seen dates forward and dates listings that are new since `previous`. */
export function carryAddedAt(next: CatalogSnapshot, previous: CatalogSnapshot | null, now: string): void {
  if (!previous) return;
  const before = new Map(previous.listings.map((l) => [l.id, l]));
  for (const l of next.listings) {
    const p = before.get(l.id);
    if (p) {
      if (p.addedAt) l.addedAt = p.addedAt;
    } else l.addedAt = now;
  }
}

export function diffListings(previous: CatalogSnapshot | null, next: CatalogSnapshot): { added: ChangeItem[]; removed: ChangeItem[] } {
  if (!previous) return { added: [], removed: [] };
  const was = new Set(previous.listings.map((l) => l.id));
  const now = new Set(next.listings.map((l) => l.id));
  return {
    added: next.listings.filter((l) => !was.has(l.id)).map(item),
    removed: previous.listings.filter((l) => !now.has(l.id)).map(item),
  };
}

/** Adds an entry when something changed; returns the same log when nothing did. */
export function recordChange(log: Changelog, entry: ChangeEntry): Changelog {
  if (!entry.added.length && !entry.removed.length) return log;
  return { version: 1, entries: [entry, ...log.entries].slice(0, MAX_ENTRIES) };
}

/** True when a listing was first seen within the last `days` days. */
export function isRecent(addedAt: string | undefined, now: number, days = 7): boolean {
  if (!addedAt) return false;
  const t = Date.parse(addedAt);
  return Number.isFinite(t) && now - t <= days * 86_400_000 && t <= now + 86_400_000;
}
