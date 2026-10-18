/**
 * Picks the best image out of a .ico file so it can be resized like any other image.
 * Returns PNG bytes (when the icon stores PNG) or raw RGBA pixels (32-bit bitmaps).
 * Other bitmap depths return null and the original .ico is used as is.
 */
export type IcoImage = { kind: "png"; bytes: Uint8Array; size: number } | { kind: "rgba"; pixels: Uint8Array; width: number; height: number };

export function bestIcoImage(buf: Uint8Array): IcoImage | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 6 || dv.getUint16(0, true) !== 0 || dv.getUint16(2, true) !== 1) return null;
  const count = dv.getUint16(4, true);
  type Dir = { w: number; h: number; bpp: number; size: number; offset: number };
  const dirs: Dir[] = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    if (o + 16 > buf.length) break;
    dirs.push({ w: buf[o]! || 256, h: buf[o + 1]! || 256, bpp: dv.getUint16(o + 6, true), size: dv.getUint32(o + 8, true), offset: dv.getUint32(o + 12, true) });
  }
  // Largest first, then deepest colour.
  dirs.sort((a, b) => b.w * b.h - a.w * a.h || b.bpp - a.bpp);
  for (const d of dirs) {
    if (d.offset + d.size > buf.length || d.size < 8) continue;
    const data = buf.subarray(d.offset, d.offset + d.size);
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return { kind: "png", bytes: data, size: Math.max(d.w, d.h) };
    const hv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const headerSize = hv.getUint32(0, true);
    const width = hv.getInt32(4, true);
    const height = Math.abs(hv.getInt32(8, true)) / 2; // the height includes the AND mask
    const bpp = hv.getUint16(14, true);
    if (bpp !== 32 || width <= 0 || height <= 0 || width > 512 || height > 512) continue;
    const start = headerSize;
    if (start + width * height * 4 > data.length) continue;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const src = start + (height - 1 - y) * width * 4; // rows are stored bottom-up, as BGRA
      for (let x = 0; x < width; x++) {
        const s = src + x * 4;
        const t = (y * width + x) * 4;
        pixels[t] = data[s + 2]!;
        pixels[t + 1] = data[s + 1]!;
        pixels[t + 2] = data[s]!;
        pixels[t + 3] = data[s + 3]!;
      }
    }
    return { kind: "rgba", pixels, width, height };
  }
  return null;
}
