import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogSnapshot } from "./types";
import { EMPTY_LINK_HEALTH, type LinkHealth } from "./links";

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
