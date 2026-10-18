/*
 * Makes a small WebP copy of every logo for drawing on tiles:
 *   npm run logos:optimize          # only logos without a tile copy yet
 *   npm run logos:optimize -- --all # redo every copy
 * Originals in public/marks/ stay untouched (the details panel and attribution use them).
 * Copies go to public/marks/tiles/<same name>.webp, at most 160 px on the long side.
 * Run `npm run catalog:import -- --offline` afterwards (catalog:logos and logos:add do it for you).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { bestIcoImage } from "../lib/catalog/ico";

const root = path.resolve(__dirname, "..");
const marks = path.join(root, "public", "marks");
const tiles = path.join(marks, "tiles");
const MAX = 160;
const all = process.argv.includes("--all");

/** Every original logo, as a path relative to public/marks (community logos live in a subfolder). */
function sources(): string[] {
  const out: string[] = [];
  for (const dir of ["", "community"]) {
    const abs = path.join(marks, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) if (/\.(png|jpe?g|webp|gif|ico)$/i.test(f) && statSync(path.join(abs, f)).isFile()) out.push(dir ? `${dir}/${f}` : f);
  }
  return out;
}

export const tileName = (rel: string) => rel.replace(/\//g, "__").replace(/\.[a-z]+$/i, ".webp");

async function main() {
  mkdirSync(tiles, { recursive: true });
  const list = sources();
  let made = 0;
  let kept = 0;
  let before = 0;
  let after = 0;
  for (const rel of list) {
    const src = path.join(marks, rel);
    const dest = path.join(tiles, tileName(rel));
    if (!all && existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) continue;
    const bytes = new Uint8Array(readFileSync(src));
    try {
      let img: ReturnType<typeof sharp>;
      if (/\.ico$/i.test(rel)) {
        const best = bestIcoImage(bytes);
        if (!best) {
          kept++;
          continue;
        }
        img = best.kind === "png" ? sharp(best.bytes) : sharp(best.pixels, { raw: { width: best.width, height: best.height, channels: 4 } });
      } else img = sharp(bytes, { animated: false });
      await img
        .resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, alphaQuality: 90, effort: 5 })
        .toFile(dest);
      before += bytes.length;
      after += statSync(dest).size;
      made++;
    } catch (e) {
      kept++;
      rmSync(dest, { force: true });
      console.warn(`  kept original for ${rel}: ${(e as Error).message}`);
    }
  }
  // Remove copies whose original is gone.
  const live = new Set(list.map(tileName));
  for (const f of readdirSync(tiles)) if (!live.has(f)) rmSync(path.join(tiles, f));
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(`✓ ${made} tile logos written${made ? ` (${mb(before)} MB → ${mb(after)} MB)` : ""}; ${kept} kept as original.`);
}

main().catch((e) => {
  console.error("✗ " + (e as Error).message);
  process.exit(1);
});
