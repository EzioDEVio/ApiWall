import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogSnapshot } from "./types";
import { EMPTY_LINK_HEALTH, type LinkHealth } from "./links";
import { EMPTY_LINK_HISTORY, type LinkHistory } from "./linkHistory";
import { EMPTY_CHANGELOG, type Changelog } from "./history";

/** data/link-health.json, or an empty record before the first check. */
export function readLinkHealth(root: string): LinkHealth {
  const p = path.join(root, "data", "link-health.json");
  if (!existsSync(p)) return EMPTY_LINK_HEALTH;
  try {
    const h = JSON.parse(readFileSync(p, "utf8")) as LinkHealth;
    return h && h.version === 1 && h.unreachable ? h : EMPTY_LINK_HEALTH;
  } catch {
    return EMPTY_LINK_HEALTH;
  }
}

/** The committed snapshot with the latest docs-link check attached. */
export function readSnapshot(root: string): CatalogSnapshot {
  const snap = JSON.parse(readFileSync(path.join(root, "data", "catalog.snapshot.json"), "utf8")) as CatalogSnapshot;
  return { ...snap, linkHealth: readLinkHealth(root) };
}

/** data/link-history.json, or an empty history. */
export function readLinkHistory(root: string): LinkHistory {
  const p = path.join(root, "data", "link-history.json");
  if (!existsSync(p)) return EMPTY_LINK_HISTORY;
  try {
    const h = JSON.parse(readFileSync(p, "utf8")) as LinkHistory;
    return h && h.version === 1 && Array.isArray(h.periods) ? h : EMPTY_LINK_HISTORY;
  } catch {
    return EMPTY_LINK_HISTORY;
  }
}

/** data/changelog.json, or an empty log. */
export function readChangelog(root: string): Changelog {
  const p = path.join(root, "data", "changelog.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Changelog) : EMPTY_CHANGELOG;
}
