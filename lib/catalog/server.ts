import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogSnapshot } from "./types";
import { readSnapshot } from "./files";

let cached: CatalogSnapshot | null = null;

/** Reads the committed snapshot. The site never fetches the upstream catalog at runtime. */
export function loadSnapshot(): CatalogSnapshot {
  if (!cached) cached = readSnapshot(process.cwd());
  return cached;
}

export function loadGlyphs(): Record<string, string[]> {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", "glyphs.json"), "utf8")) as Record<string, string[]>;
}
