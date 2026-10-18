// Deterministic category colours. Hues are spread by the golden angle so
// neighbouring bands differ; lightness is tuned per theme for white text.
export function categoryHue(index: number): number {
  return Math.round((index * 137.508 + 210) % 360);
}

export function categoryColor(index: number, dark: boolean, muted = false): string {
  const h = categoryHue(index);
  if (muted) return dark ? `hsl(${h} 12% 22%)` : `hsl(${h} 14% 86%)`;
  return dark ? `hsl(${h} 52% 42%)` : `hsl(${h} 58% 44%)`;
}

/** Slight per-tile variation so monogram tiles in one band are distinguishable. */
export function tileColor(index: number, seed: number, dark: boolean): string {
  const h = categoryHue(index);
  const dl = ((seed % 7) - 3) * 1.6;
  return dark ? `hsl(${h} 52% ${42 + dl}%)` : `hsl(${h} 58% ${44 + dl}%)`;
}

/** Brand colours that would vanish on a white chip are replaced by ink. */
export function brandInk(hex: string): string {
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return "#14161f";
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.8 ? "#14161f" : `#${hex}`;
}
