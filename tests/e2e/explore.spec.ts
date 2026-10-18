import { expect, type Page, test } from "@playwright/test";

// Most tests start with the first-visit welcome card already dismissed.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes("welcome")) await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

/** Filters live in a floating panel: open it, choose, and close it. */
async function setFilter(page: Page, label: string, value: string) {
  const btn = page.getByRole("button", { name: /^Filters/ });
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.getByRole("button", { name: /^Show \d/ }).click();
}

/** Categories live in the sidebar (desktop) or the Categories drawer (narrow windows). */
async function chooseCategory(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Categories" });
  if (!(await nav.isVisible())) await page.getByRole("button", { name: "Categories", exact: true }).click();
  await nav.getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d`) }).click();
}

const errors = (page: Page) => {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (m) => m.type() === "error" && list.push(m.text()));
  return list;
};

/** Catalog listings plus any provider listings approved by other tests. */
async function expectedTotal(page: Page): Promise<string> {
  const catalog = (await (await page.request.get("/api/catalog")).json()) as { listings: unknown[] };
  const providers = (await (await page.request.get("/api/providers/public")).json()) as { listings: unknown[] };
  return (catalog.listings.length + providers.listings.length).toLocaleString("en");
}

async function openMap(page: Page) {
  const total = await expectedTotal(page);
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toContainText(`of ${total}`);
  const mapToggle = page.getByRole("button", { name: "Map", exact: true });
  if ((await mapToggle.getAttribute("aria-pressed")) !== "true") await mapToggle.click();
  const canvas = page.getByTestId("mosaic-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute("data-draws").then(Number)).toBeGreaterThan(0);
  const map = page.getByTestId("mosaic");
  await map.scrollIntoViewIfNeeded(); // pointer coordinates must be inside the viewport
  return { canvas, map };
}

/** Hovers across the visible map until the tooltip names a tile; returns that point and name. */
async function findTile(page: Page) {
  const box = (await page.getByTestId("mosaic").boundingBox())!;
  for (let i = 0; i < 48; i++) {
    const x = Math.round(box.x + box.width * (0.2 + (i % 8) * 0.08));
    const y = Math.round(box.y + box.height * (0.2 + Math.floor(i / 8) * 0.1));
    await page.mouse.move(x, y);
    const tip = page.locator(".mosaic-tip strong");
    if ((await tip.isVisible()) && (await tip.textContent()) !== "Open tile") return { x, y, name: (await tip.textContent())! };
  }
  throw new Error("no tile found under the pointer");
}

test("renders the full catalog without one DOM node per cell", async ({ page }) => {
  const errs = errors(page);
  const { canvas } = await openMap(page);
  const painted = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d")!;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i]! > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(100);
  const nodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  expect(nodes).toBeLessThan(3000);
  await expect(page.getByText(/Snapshot [0-9a-f]{7}/)).toBeVisible();
  expect(errs).toEqual([]);
});

test("search, filters, no-results and reset work in the list view", async ({ page }) => {
  const total = await expectedTotal(page);
  await page.goto("/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByLabel("Search APIs by name or description").fill("weather forecast");
  await expect(page.getByTestId("result-count")).not.toContainText(`${total} of`);
  const cards = page.getByTestId("list-cards").locator("li");
  await expect(cards.first()).toBeVisible();
  await setFilter(page, "HTTPS", "yes");
  for (const chip of await cards.locator(".chip", { hasText: "HTTPS" }).allTextContents()) expect(chip).toBe("HTTPS: Yes");
  await page.getByLabel("Search APIs by name or description").fill("zzqxnotathing");
  await expect(page.getByTestId("no-results")).toBeVisible();
  await page.getByTestId("no-results").getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByTestId("result-count")).toContainText(`${total} of ${total}`);
});

test("selecting a card opens an accessible dialog with a safe external link", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await chooseCategory(page, "MCP Servers");
  const card = page.getByTestId("list-cards").getByRole("button").first();
  const name = (await card.locator(".card-title").textContent())!;
  await card.click();
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name })).toBeVisible();
  await expect(dialog.getByText("MCP server", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Transport", { exact: true })).toBeVisible();
  const link = dialog.getByTestId("docs-link");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(dialog.getByTestId("access-unknown")).toBeVisible();
  await expect(page).toHaveURL(/[?&]api=mcp-/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  await expect(page).not.toHaveURL(/[?&]api=/);
});

test("deep links open the selected listing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByTestId("list-cards").getByRole("button").first().click();
  const url = page.url();
  await page.goto(url);
  await expect(page.getByTestId("detail-dialog")).toBeVisible();
});

test("the map opens zoomed in with names and marks, and scrolls in every direction", async ({ page }) => {
  const { canvas, map } = await openMap(page);
  await expect(page.locator(".mosaic")).toHaveAttribute("data-zoom", "detail");
  const size = await map.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
  expect(size.sw).toBeGreaterThan(size.cw * 1.5);
  expect(size.sh).toBeGreaterThan(size.ch * 1.5);
  const draws = Number(await canvas.getAttribute("data-draws"));
  await map.evaluate((el) => el.scrollTo(600, 900));
  await expect.poll(() => canvas.getAttribute("data-draws").then(Number)).toBeGreaterThan(draws);
  expect(await map.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([600, 900]);
  const mb = (await map.boundingBox())!;
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.wheel(0, 400); // plain wheel scrolls the map, it does not zoom
  await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBeGreaterThan(900);
  await expect(page.locator(".mosaic")).toHaveAttribute("data-zoom", "detail");
});

test("tiles can be selected by pointer when zoomed in and on the whole map", async ({ page, isMobile }) => {
  await openMap(page);
  const dialog = page.getByTestId("detail-dialog");
  const hit = await findTile(page);
  await page.mouse.click(hit.x, hit.y);
  await expect(dialog.getByRole("heading", { name: hit.name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Whole map" }).click();
  await expect(page.locator(".mosaic")).toHaveAttribute("data-zoom", "overview");
  await page.waitForTimeout(400); // the zoom animation (260 ms) finishes before we aim at a tile
  if (!isMobile) {
    // On phones whole-map tiles are a few pixels wide; touch users zoom in or use the list.
    const whole = await findTile(page);
    await page.mouse.click(whole.x, whole.y);
    await expect(dialog.getByRole("heading", { name: whole.name, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Close-up" }).click();
  await expect(page.locator(".mosaic")).toHaveAttribute("data-zoom", "detail");
});

test("dragging pans the map without opening a tile", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse drag is desktop-only; touch uses native scrolling");
  const { map } = await openMap(page);
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.up();
  const pos = await map.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  expect(pos[0]).toBeGreaterThan(100);
  expect(pos[1]).toBeGreaterThan(100);
  await expect(page.getByTestId("detail-dialog")).toBeHidden();
});

test("mini-map and the Open tiles shortcut help navigation", async ({ page, isMobile }) => {
  const { map } = await openMap(page);
  if (!isMobile) {
    // The mini-map is hidden on phones to keep the small screen for tiles.
    const mini = page.getByTestId("mosaic-mini");
    await expect(mini).toBeVisible();
    const mb = (await mini.boundingBox())!;
    await mini.click({ position: { x: mb.width / 2, y: mb.height - 6 } });
    await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBeGreaterThan(1500);
    await mini.click({ position: { x: 4, y: 4 } });
    await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBeLessThan(200);
  }
  if (!(await page.getByRole("navigation", { name: "Categories" }).isVisible())) await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Open tiles · Place your API" }).click();
  await expect.poll(() => map.evaluate((el) => el.scrollTop)).toBeGreaterThan(2000);
  await page.waitForTimeout(600); // smooth scroll settles
  const box = (await map.boundingBox())!;
  let opened = false;
  for (let i = 0; i < 30 && !opened; i++) {
    const x = box.x + box.width * (0.15 + (i % 6) * 0.12);
    const y = box.y + box.height * (0.25 + Math.floor(i / 6) * 0.1);
    await page.mouse.move(x, y);
    const tip = page.locator(".mosaic-tip strong");
    if ((await tip.isVisible()) && (await tip.textContent()) === "Open tile") {
      await page.mouse.click(x, y);
      opened = true;
    }
  }
  expect(opened).toBe(true);
  await expect(page).toHaveURL(/\/submit$/);
});

test("the map is fully keyboard operable", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard path is covered on desktop");
  const { map } = await openMap(page);
  await map.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".mosaic [aria-live]")).toContainText("Press Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(map).toBeFocused();
  await page.keyboard.press("+");
  await page.keyboard.press("0");
  await expect(page.locator(".mosaic")).toHaveAttribute("data-zoom", "overview");
});

test("filtering the map with the full dataset stays responsive", async ({ page }) => {
  await openMap(page);
  const total = await expectedTotal(page);
  const t0 = Date.now();
  await page.getByLabel("Search APIs by name or description").fill("crypto");
  await expect(page.getByTestId("result-count")).not.toContainText(`${total} of`);
  await setFilter(page, "Authentication", "none");
  await expect(page.getByTestId("result-count")).not.toContainText(`${total} of`);
  expect(Date.now() - t0).toBeLessThan(3000);
  const frameMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const c = document.querySelector<HTMLElement>("[data-testid=mosaic]")!;
        const start = performance.now();
        for (let i = 0; i < 5; i++) c.dispatchEvent(new KeyboardEvent("keydown", { key: i % 2 ? "-" : "+", bubbles: true }));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
      }),
  );
  expect(frameMs).toBeLessThan(1000);
});

test("phones get readable cards and no sideways scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("list-cards").locator("li").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("list-cards").getByRole("button").first().tap();
  await expect(page.getByTestId("detail-dialog")).toBeVisible();
  const btn = page.getByRole("button", { name: "Close details" });
  const b = (await btn.boundingBox())!;
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
});

test("the wall fills the window: the page never scrolls, the map does", async ({ page, isMobile }) => {
  await openMap(page);
  const sizes = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, vh: innerHeight, docW: document.documentElement.scrollWidth, vw: innerWidth }));
  expect(sizes.doc).toBeLessThanOrEqual(sizes.vh);
  expect(sizes.docW).toBeLessThanOrEqual(sizes.vw);
  const shell = (await page.locator(".app-shell").boundingBox())!;
  const header = (await page.locator(".site-header").boundingBox())!;
  expect(Math.round(shell.y)).toBeGreaterThanOrEqual(Math.round(header.y + header.height) - 1);
  expect(Math.round(shell.y + shell.height)).toBeGreaterThanOrEqual(sizes.vh - 1);
  // The header stays usable: every page is still one click away.
  for (const name of ["Submit an API", "For Providers", "About & Source"]) await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
  if (!isMobile) {
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByTestId("list-drawer")).toBeVisible();
    await page.getByRole("button", { name: "Show map" }).click();
    await expect(page.getByTestId("list-drawer")).toBeHidden();
  }
});

test("first visit shows a welcome card that stays dismissed", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones open on the list, which hides the card");
  await page.goto("/");
  const card = page.getByTestId("welcome");
  await expect(card).toBeVisible();
  await expect(card.getByText("Never submit a secret here.")).toBeVisible();
  await card.getByRole("button", { name: "Start exploring" }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("result-count")).toBeVisible();
  await expect(page.getByTestId("welcome")).toBeHidden();
});
