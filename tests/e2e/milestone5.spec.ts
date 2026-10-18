import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

test("starter packs: index, pack page, JSON and the same set on the wall", async ({ page, request }) => {
  await page.goto("/packs/");
  const cards = page.getByTestId("pack-card");
  expect(await cards.count()).toBeGreaterThanOrEqual(8);
  await page
    .getByTestId("packs-page")
    .getByRole("link", { name: /Build a weather app/ })
    .click();
  await expect(page.getByTestId("pack-page")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Build a weather app");
  const rows = page.getByTestId("pack-page").locator(".api-list > li");
  const json = (await (await request.get("/api/v1/packs/weather-app.json")).json()) as { data: { name: string }[] };
  await expect(rows).toHaveCount(json.data.length);
  await expect(page.getByTestId("embed-code")).toContainText('data-apiwall-pack="weather-app"');
  await page.getByRole("link", { name: "See them on the wall" }).click();
  await expect(page).toHaveURL(/cat=weather/);
  await expect(page.getByTestId("mosaic")).toBeVisible();
  await expect(page.locator(".mosaic")).toHaveAttribute("data-tile-count", String(json.data.length));
});

test("stats page: numbers, charts with table views, and the JSON behind them", async ({ page, request }) => {
  const stats = ((await (await request.get("/api/v1/stats.json")).json()) as { data: { total: number; links: { unreachable: number } } }).data;
  await page.goto("/stats/");
  await expect(page.getByTestId("stats-page")).toBeVisible();
  await expect(page.getByTestId("stat-tiles")).toContainText(stats.total.toLocaleString("en"));
  const tables = page.locator("details.viz-table");
  expect(await tables.count()).toBeGreaterThanOrEqual(3);
  await tables.first().locator("summary").click();
  await expect(tables.first().locator("table tbody tr").first()).toBeVisible();
  // Every bar or segment explains itself on hover.
  expect(await page.locator(".viz-svg title").count()).toBeGreaterThan(10);
});

test("an API page shows its docs-link history", async ({ page }) => {
  await page.goto("/apis/openai-api/");
  const hist = page.getByTestId("link-history");
  await expect(hist).toBeVisible();
  await expect(hist.locator("li").first()).toContainText(/Reachable|Not reachable/);
});

test("category pages show quick stats, quick starts and related packs", async ({ page }) => {
  await page.goto("/categories/animals/");
  await expect(page.getByTestId("category-stats")).toContainText("No auth listed");
  const picks = page.getByTestId("quick-starts").locator(".pick-card");
  expect(await picks.count()).toBeGreaterThan(0);
  expect(await picks.count()).toBeLessThanOrEqual(6);
  await expect(page.getByTestId("category-pack").first()).toBeVisible();
});

test("saved APIs export as Markdown, CSV and JSON", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await page.goto("/?cat=ai-models");
  await page.getByRole("button", { name: "List", exact: true }).click();
  const first = page.getByTestId("list-cards").locator("li").first();
  await first.locator("button.card-hit").click();
  await page.getByTestId("detail-dialog").getByRole("button", { name: /Save/ }).first().click();
  await page.goto("/?saved=yes");
  await expect(page.getByTestId("saved-banner")).toBeVisible();
  const menu = page.getByTestId("export-saved");
  for (const [label, ext] of [
    ["Markdown table", ".md"],
    ["CSV", ".csv"],
    ["JSON", ".json"],
  ] as const) {
    await menu.locator("summary").click();
    const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("button", { name: new RegExp(`^${label}`) }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^apiwall-saved-\\d{4}-\\d{2}-\\d{2}\\${ext}$`));
    const text = readFileSync((await download.path())!, "utf8");
    if (ext === ".md") expect(text).toContain("| API | Description |");
    if (ext === ".csv") expect(text.split("\r\n")[0]).toBe('"name","category","description","auth","https","cors","docs_url","apiwall_url"');
    if (ext === ".json") expect((JSON.parse(text) as { apis: unknown[] }).apis).toHaveLength(1);
  }
});

test("hovering a tile previews it; ? lists the shortcuts", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover and keyboard shortcuts are desktop features");
  await page.goto("/?cat=weather");
  const mosaic = page.getByTestId("mosaic");
  await expect(mosaic).toBeVisible();
  await page.waitForTimeout(1200); // let the tiles settle in
  const box = (await mosaic.boundingBox())!;
  let found = false;
  for (let y = box.y + 120; y < box.y + box.height - 80 && !found; y += 40)
    for (let x = box.x + 60; x < box.x + box.width - 60 && !found; x += 40) {
      await page.mouse.move(x, y);
      found = await page.locator(".mosaic-tip.is-card").isVisible();
    }
  expect(found).toBe(true);
  const card = page.getByTestId("tile-preview");
  await expect(card.locator(".tip-chips")).toContainText(/auth|API key|OAuth/i);
  await expect(card).toContainText("Click for details");

  await page.mouse.move(2, 2);
  await page.keyboard.press("?");
  const sheet = page.getByTestId("shortcuts");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(sheet).toContainText("Surprise me");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Typing "?" into the search box types it rather than opening the sheet.
  await page.locator("#q").fill("");
  await page.locator("#q").press("?");
  await expect(sheet).toBeHidden();
});

test("the palette flies to an API and offers the shortcuts sheet", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await page.goto("/");
  await expect(page.getByTestId("mosaic")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette").getByRole("combobox").fill("keyboard shortcuts");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shortcuts")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette").getByRole("combobox").fill("OpenAI API");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail-dialog").locator("h2")).toHaveText("OpenAI API");
  // No install offer from the browser here, so no install action is shown (never a dead control).
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette").getByRole("combobox").fill("install");
  await expect(page.getByRole("option", { name: /Install ApiWall/ })).toHaveCount(0);
});

test("the embed script also draws starter packs", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await page.goto("/developers/");
  const demo = page.getByTestId("embed-demo-pack");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator(".name")).toHaveText("Call it straight from the browser");
  await expect(demo.locator("li")).toHaveCount(4);
});

test.describe("install as an app", () => {
  test.use({ serviceWorkers: "allow" });
  test("has a manifest, icons and an offline service worker", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "covered on desktop");
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const m = (await (await request.get(href!)).json()) as { icons: { src: string }[]; start_url: string };
    expect(m.start_url).toBe("./");
    for (const i of m.icons) expect((await request.get(new URL(i.src, new URL(href!, "http://h/")).pathname)).status()).toBe(200);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");
    // Once installed, the page and the catalog are cached for offline use.
    await page.reload();
    await expect(page.getByTestId("mosaic")).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(async () =>
          (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat(),
        ),
      )
      .toEqual(expect.arrayContaining(["/", "/api/catalog"]));
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByTestId("mosaic")).toBeVisible();
    await page.context().setOffline(false);
  });
});
