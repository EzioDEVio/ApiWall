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

/**
 * Slight per-tile variation so monogram tiles in one band are distinguishable. Bright hues
 * (yellows, greens, cyans) are darkened just enough for white letters to meet WCAG AA (4.5:1).
 */
const tileCache = new Map<string, string>();
export function tileColor(index: number, seed: number, dark: boolean): string {
  const key = `${index}|${seed % 7}|${dark ? 1 : 0}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const h = categoryHue(index);
  const dl = ((seed % 7) - 3) * 1.6;
  const sat = dark ? 52 : 58;
  let l = Math.round(((dark ? 42 : 44) + dl) * 10) / 10;
  while (l > 20 && 1.05 / (luminance(`hsl(${h} ${sat}% ${l}%)`) + 0.05) < 4.6) l = Math.round((l - 0.5) * 10) / 10;
  const color = `hsl(${h} ${sat}% ${l}%)`;
  tileCache.set(key, color);
  return color;
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

const INK = "#14161f";
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function parseColor(c: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const hsl = /^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(c.trim());
  return hsl ? hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3])) : null;
}
const channel = (v: number) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
/** WCAG relative luminance of a "#rrggbb" or "hsl(h s% l%)" colour. */
export function luminance(c: string): number {
  const rgb = parseColor(c);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
/**
 * White letters where they meet WCAG AA (4.5:1) on the tile, dark ink otherwise, so monograms on
 * light hues (yellows, greens) stay readable.
 */
export function inkOn(background: string): string {
  const white = 1.05 / (luminance(background) + 0.05);
  return white >= 4.5 ? "#fff" : INK;
}
