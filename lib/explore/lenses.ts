import type { Entry, Filters } from "./model";
import { hasLogo } from "./model";

/**
 * Lenses recolour the wall by one fact instead of by category, so patterns jump out
 * ("where are the APIs that need no key?"). Each bucket maps to the filter that shows
 * exactly those tiles, so the legend doubles as a set of one-click filters.
 */
export const LENS_IDS = ["category", "auth", "https", "cors", "logo"] as const;
export type LensId = (typeof LENS_IDS)[number];

export interface LensBucket {
  key: string;
  label: string;
  /** Hue, saturation and lightness (light theme); dark theme lowers lightness a little. */
  hsl: [number, number, number];
  filter: Partial<Filters>;
}
export interface Lens {
  id: LensId;
  label: string;
  question: string;
  buckets: LensBucket[];
}

const GREEN: [number, number, number] = [158, 64, 38];
const AMBER: [number, number, number] = [38, 88, 46];
const VIOLET: [number, number, number] = [252, 62, 58];
const RED: [number, number, number] = [356, 70, 52];
const GREY: [number, number, number] = [222, 10, 58];
const BLUE: [number, number, number] = [218, 78, 52];

const tri = (field: "https" | "cors"): LensBucket[] => [
  { key: "yes", label: "Yes", hsl: GREEN, filter: { [field]: "yes" } },
  { key: "no", label: "No", hsl: RED, filter: { [field]: "no" } },
  { key: "unknown", label: "Unknown", hsl: GREY, filter: { [field]: "unknown" } },
];

export const LENSES: Record<LensId, Lens> = {
  category: { id: "category", label: "Category", question: "Coloured by category", buckets: [] },
  auth: {
    id: "auth",
    label: "Auth",
    question: "Do I need a key?",
    buckets: [
      { key: "none", label: "No auth", hsl: GREEN, filter: { auth: "none" } },
      { key: "apiKey", label: "API key", hsl: AMBER, filter: { auth: "apiKey" } },
      { key: "oauth", label: "OAuth", hsl: VIOLET, filter: { auth: "oauth" } },
      { key: "other", label: "Other / unknown", hsl: GREY, filter: { auth: "other" } },
    ],
  },
  https: { id: "https", label: "HTTPS", question: "Is traffic encrypted?", buckets: tri("https") },
  cors: { id: "cors", label: "CORS", question: "Can a browser call it directly?", buckets: tri("cors") },
  logo: {
    id: "logo",
    label: "Logo",
    question: "Which tiles still need a logo?",
    buckets: [
      { key: "has", label: "Has a logo", hsl: BLUE, filter: { logo: "has" } },
      { key: "missing", label: "No logo yet", hsl: GREY, filter: { logo: "missing" } },
    ],
  },
};

/** Which bucket of the lens an entry falls in (null for the category lens). */
export function lensKey(e: Entry, lens: LensId): string | null {
  switch (lens) {
    case "auth":
      return e.auth === "none" || e.auth === "apiKey" || e.auth === "oauth" ? e.auth : "other";
    case "https":
      return e.https;
    case "cors":
      return e.cors;
    case "logo":
      return hasLogo(e) ? "has" : "missing";
    default:
      return null;
  }
}

/** Tile colour for an entry under a lens; seed adds the same slight variation category tiles have. */
export function lensColor(e: Entry, lens: LensId, dark: boolean, seed = 0): string | null {
  const key = lensKey(e, lens);
  const b = LENSES[lens].buckets.find((x) => x.key === key);
  if (!b) return null;
  const [h, s, l] = b.hsl;
  const dl = ((seed % 7) - 3) * 1.4;
  return `hsl(${h} ${s}% ${(dark ? l - 6 : l) + dl}%)`;
}

export function lensSwatch(b: LensBucket, dark: boolean): string {
  const [h, s, l] = b.hsl;
  return `hsl(${h} ${s}% ${dark ? l - 6 : l}%)`;
}

/** How many of `entries` fall in each bucket. */
export function lensCounts(entries: Entry[], lens: LensId): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = lensKey(e, lens);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
