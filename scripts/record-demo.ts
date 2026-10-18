/*
 * Records the README demo GIF from a running copy of the site:
 *   npm run dev            (or npm run build && npm start), then in another terminal:
 *   npm run media:demo                                   # http://localhost:3000
 *   npm run media:demo -- --url http://localhost:3200    # another address
 * Writes docs/media/apiwall-demo.gif and docs/media/apiwall-*.png. Run it after
 * `npm run catalog:logos` so tiles show real logos.
 * Needs Playwright's Chromium: `npx playwright install chromium` (or PLAYWRIGHT_CHROMIUM_PATH).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { applyPalette, GIFEncoder, quantize } from "gifenc";

const args = process.argv.slice(2);
const base = (args[args.indexOf("--url") + 1] && args.includes("--url") ? args[args.indexOf("--url") + 1]! : "http://localhost:3000").replace(/\/$/, "");
const outDir = path.resolve(__dirname, "..", "docs", "media");
const W = 1100;
const H = 640;

type Frame = { png: Buffer; delay: number };
const frames: Frame[] = [];
const snap = async (page: Page, delay = 110) => frames.push({ png: await page.screenshot({ type: "png" }), delay });
const film = async (page: Page, ms: number, every = 110) => {
  const end = Date.now() + ms;
  while (Date.now() < end) await snap(page, every);
};
const hold = async (page: Page, ms: number) => snap(page, ms);

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: process.env.PLAYWRIGHT_CHROMIUM_PATH ? ["--no-sandbox", "--disable-gpu"] : [],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByTestId("mosaic-canvas").waitFor();
  await page.waitForTimeout(1600); // tiles settle in
  await hold(page, 1400);
  await page.screenshot({ path: path.join(outDir, "apiwall-map.png") });

  // Drift across the wall, then zoom out to the whole thing and back.
  const map = page.getByTestId("mosaic");
  for (let i = 0; i < 12; i++) {
    await map.evaluate((el, d) => el.scrollBy(d, d * 0.6), 60);
    await snap(page, 90);
  }
  await page.getByRole("button", { name: "Whole map" }).click();
  await film(page, 700);
  await hold(page, 1300);
  await page.screenshot({ path: path.join(outDir, "apiwall-whole.png") });

  // Colour lens: where are the APIs that need no key?
  await page.getByTestId("lens-select").selectOption("auth");
  await film(page, 500);
  await hold(page, 1500);
  await page.screenshot({ path: path.join(outDir, "apiwall-lens.png") });
  await page.getByTestId("lens-select").selectOption("category");
  await film(page, 300);

  // One category: only its tiles, fitted to the screen.
  await page.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: /^AI Models, / }).click();
  await film(page, 1100);
  await hold(page, 1400);
  await page.screenshot({ path: path.join(outDir, "apiwall-ai-models.png") });

  // Open a tile: docs link, verified facts and starter code; add it to a comparison.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await film(page, 400);
  const cards = page.getByTestId("list-cards");
  await cards.locator("li", { hasText: "Claude API" }).locator("button.card-hit").click();
  await film(page, 500);
  await page.getByTestId("detail-dialog").getByTestId("code-samples").scrollIntoViewIfNeeded();
  await film(page, 400);
  await hold(page, 1400);
  await page.screenshot({ path: path.join(outDir, "apiwall-details.png") });
  await page.getByTestId("detail-dialog").getByTestId("compare-api").click();
  await snap(page, 400);
  for (const name of ["OpenAI API", "Perplexity API"]) {
    await page.keyboard.press("Escape"); // the side panel covers the list
    await snap(page, 200);
    await cards.locator("li", { hasText: name }).locator("button.card-hit").click();
    await film(page, 300);
    await page.getByTestId("detail-dialog").getByTestId("compare-api").click();
    await snap(page, 350);
  }
  await page.keyboard.press("Escape");
  await film(page, 300);

  // Compare them side by side, differences marked.
  await page.getByTestId("compare-open").click();
  await film(page, 500);
  await hold(page, 2000);
  await page.screenshot({ path: path.join(outDir, "apiwall-compare.png") });
  await page.keyboard.press("Escape");
  await page.getByTestId("compare-tray").getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await film(page, 300);

  // Ctrl+K: jump anywhere by typing.
  await page.keyboard.press("Control+k");
  await film(page, 300);
  const palette = page.getByTestId("palette").getByRole("combobox");
  for (const ch of "weather") {
    await palette.type(ch);
    await snap(page, 120);
  }
  await hold(page, 1200);
  await page.screenshot({ path: path.join(outDir, "apiwall-palette.png") });
  const weather = page.getByTestId("palette").getByRole("group", { name: "Categories" }).getByRole("option", { name: /^Weather/ });
  for (let i = 0; i < 10 && (await weather.getAttribute("aria-selected")) !== "true"; i++) {
    await page.keyboard.press("ArrowDown");
    await snap(page, 110);
  }
  await page.keyboard.press("Enter");
  await film(page, 1000);
  await hold(page, 1200);

  // Every API has its own page.
  await page.getByRole("button", { name: "List", exact: true }).click();
  await film(page, 300);
  await page.getByTestId("list-cards").locator("button.card-hit").first().click();
  await film(page, 400);
  await page.getByTestId("detail-dialog").getByTestId("api-page-link").click();
  await page.getByTestId("api-page").waitFor();
  await film(page, 500);
  await hold(page, 1500);
  await page.screenshot({ path: path.join(outDir, "apiwall-api-page.png") });
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 70);
    await snap(page, 90);
  }
  await hold(page, 1200);

  // Back on the wall, in the dark.
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByTestId("mosaic-canvas").waitFor();
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette").getByRole("combobox").fill("dark theme");
  await snap(page, 500);
  await page.keyboard.press("Enter");
  await film(page, 800);
  await page.getByTestId("surprise").click();
  await film(page, 600);
  await hold(page, 1800);
  // Leave the browser profile as it was found.
  await page.evaluate(() => localStorage.removeItem("apiwall.theme"));
  await browser.close();

  // Encode: one palette per frame keeps logos and colours faithful.
  const gif = GIFEncoder();
  for (const f of frames) {
    const img = PNG.sync.read(f.png);
    const scale = 0.72;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.round(x / scale));
        const sy = Math.min(img.height - 1, Math.round(y / scale));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        rgba[di] = img.data[si]!;
        rgba[di + 1] = img.data[si + 1]!;
        rgba[di + 2] = img.data[si + 2]!;
        rgba[di + 3] = 255;
      }
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay: f.delay });
  }
  gif.finish();
  const bytes = gif.bytes();
  writeFileSync(path.join(outDir, "apiwall-demo.gif"), bytes);
  console.log(`✓ docs/media/apiwall-demo.gif: ${frames.length} frames, ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error("✗ " + (e as Error).message + `\n  Is the site running at ${base}?`);
  process.exit(1);
});
