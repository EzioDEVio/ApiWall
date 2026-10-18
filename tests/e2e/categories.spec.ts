import { expect, type Page, test } from "@playwright/test";

// Acceptance checks for category navigation, search and map filtering. Expected IDs are
// computed from the served snapshot (and any approved provider listings), never hard-coded.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  description: string;
  category: string;
  categorySlug: string;
  tags?: string[];
  origin?: string;
  https: string;
  auth: string;
  aiModel?: { provider: string; models: string };
}
interface Data {
  listings: Listing[];
  providers: { id: string; name: string; description: string; providerName: string }[];
  categories: { slug: string; name: string }[];
}

async function data(page: Page): Promise<Data> {
  const catalog = await (await page.request.get("/api/catalog")).json();
  const providers = await (await page.request.get("/api/providers/public")).json();
  return { listings: catalog.listings, providers: providers.listings, categories: catalog.categories };
}
const fmt = (n: number) => n.toLocaleString("en");
const inCategory = (l: Listing, slug: string) => l.categorySlug === slug || (l.tags ?? []).includes(slug);
const terms = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);
const textOf = (l: Listing) => `${l.name} ${l.description} ${l.aiModel ? `${l.aiModel.provider} ${l.aiModel.models}` : ""}`.toLowerCase();
/** IDs matching a search; with `pred` (a category or other filter) provider listings are out of scope. */
function searchIds(d: Data, q: string, pred?: (l: Listing) => boolean): string[] {
  const t = terms(q);
  const cat = d.listings.filter((l) => (!pred || pred(l)) && t.every((x) => textOf(l).includes(x))).map((l) => l.id);
  const prov = pred ? [] : d.providers.filter((p) => t.every((x) => `${p.name} ${p.description} ${p.providerName}`.toLowerCase().includes(x))).map((p) => p.id);
  return [...cat, ...prov].sort();
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Categories" });
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function openNav(page: Page) {
  await expect(page.getByTestId("result-count")).toBeVisible(); // the catalog has loaded
  if (!(await nav(page).isVisible())) await page.getByRole("button", { name: "Categories", exact: true }).click();
  await expect(nav(page)).toBeVisible();
}
async function chooseCategory(page: Page, name: string) {
  await openNav(page);
  await nav(page).getByRole("button", { name: new RegExp(`^${escape(name)} \\d`) }).click();
}
async function setFilter(page: Page, label: string, value: string) {
  const btn = page.getByRole("button", { name: /^Filters/ });
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.getByLabel(label, { exact: true }).selectOption(value);
  await page.getByRole("button", { name: /^Show \d/ }).click();
}
async function view(page: Page, which: "Map" | "List") {
  const b = page.getByRole("button", { name: which, exact: true });
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
}

/** Tile IDs the map is drawing right now (exposed only for filtered views). */
async function mapIds(page: Page): Promise<string[]> {
  const raw = await page.locator(".mosaic").getAttribute("data-tile-ids");
  return (raw ?? "").split(" ").filter(Boolean).sort();
}
/** Every card ID in the list, expanding "Show more" pages. */
async function listIds(page: Page): Promise<string[]> {
  await view(page, "List");
  const more = page.getByTestId("list-drawer").getByRole("button", { name: "Show more" });
  while (await more.isVisible()) await more.click();
  return (await page.getByTestId("list-cards").locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")!))).sort();
}
async function expectCount(page: Page, n: number) {
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`^${escape(fmt(n))} of `));
}

test("1. choosing Art & Design shows only its listings, on the map and in the list, fitted to view", async ({ page, isMobile }) => {
  const d = await data(page);
  const expected = d.listings.filter((l) => inCategory(l, "art-and-design")).map((l) => l.id).sort();
  expect(expected.length).toBeGreaterThan(0);
  await page.goto("/");
  await view(page, "Map");
  await chooseCategory(page, "Art & Design");
  await expectCount(page, expected.length);
  const mosaic = page.locator(".mosaic");
  await expect(mosaic).toHaveAttribute("data-layout", "filtered");
  await expect(mosaic).toHaveAttribute("data-tile-count", String(expected.length));
  await expect(mosaic).toHaveAttribute("data-labels", "Art & Design"); // no other category label remains
  expect(await mapIds(page)).toEqual(expected);
  if (!isMobile) {
    // The whole category fits on screen, with readable tiles.
    const fits = await page.getByTestId("mosaic").evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
    await expect(mosaic).not.toHaveAttribute("data-zoom", "overview");
  }
  expect(await listIds(page)).toEqual(expected);
  await openNav(page);
  await expect(nav(page).getByRole("button", { name: /^Art & Design \d/ })).toHaveAttribute("aria-pressed", "true");
});

test("2. AI Models is pinned, selectable and shows documented model APIs on the map and in the list", async ({ page }) => {
  const d = await data(page);
  const expected = d.listings.filter((l) => inCategory(l, "ai-models")).map((l) => l.id).sort();
  expect(expected.length).toBeGreaterThan(5);
  await page.goto("/");
  await openNav(page);
  // Pinned: still visible after the long category list is scrolled to its end.
  await nav(page).locator(".cat-list").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const ai = nav(page).getByRole("button", { name: new RegExp(`^AI Models ${expected.length} results$`) });
  await expect(ai).toBeInViewport();
  await ai.click();
  await expectCount(page, expected.length);
  await view(page, "Map");
  expect(await mapIds(page)).toEqual(expected);
  expect(await listIds(page)).toEqual(expected);
  await page.getByTestId("list-cards").locator(`li[data-id="${d.listings.find((l) => l.name === "Claude API")!.id}"] button.card-hit`).click();
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog.getByTestId("ai-model")).toContainText("Anthropic");
  await expect(dialog.getByTestId("ai-model")).toContainText("Not verified");
  await expect(dialog.getByTestId("supplement-source")).toContainText("not part of the upstream");
});

test("3. Machine Learning stays separate from AI Models apart from verified cross-tags", async ({ page }) => {
  const d = await data(page);
  const ml = d.listings.filter((l) => l.categorySlug === "machine-learning");
  const supplementIds = d.listings.filter((l) => l.origin === "supplement").map((l) => l.id);
  await page.goto("/");
  await chooseCategory(page, "Machine Learning");
  await expectCount(page, ml.length);
  await view(page, "Map");
  const ids = await mapIds(page);
  expect(ids).toEqual(ml.map((l) => l.id).sort());
  for (const id of supplementIds) expect(ids).not.toContain(id);
  const generic = ml.filter((l) => !(l.tags ?? []).includes("ai-models"));
  expect(generic.length).toBeGreaterThan(0);
  await chooseCategory(page, "AI Models");
  const aiIds = await mapIds(page);
  for (const l of generic) expect(aiIds).not.toContain(l.id);
});

test("4. a search updates the count, list and map to the same matches", async ({ page }) => {
  const d = await data(page);
  const q = "deepseek";
  const expected = searchIds(d, q);
  expect(expected.length).toBeGreaterThan(0);
  await page.goto("/");
  await view(page, "Map");
  await page.getByLabel("Search APIs by name or description").fill(q);
  await expectCount(page, expected.length);
  await expect(page.locator(".mosaic")).toHaveAttribute("data-layout", "filtered");
  expect(await mapIds(page)).toEqual(expected);
  expect(await listIds(page)).toEqual(expected);
  await expect(page.getByTestId("active-filters")).toContainText(`Search: “${q}”`);
});

test("5. category, search and another filter apply together", async ({ page }) => {
  const d = await data(page);
  const expected = searchIds(d, "forecast", (l) => inCategory(l, "weather") && l.https === "yes");
  const looser = searchIds(d, "forecast", (l) => inCategory(l, "weather"));
  expect(expected.length).toBeGreaterThan(0);
  expect(expected.length).toBeLessThanOrEqual(looser.length);
  await page.goto("/");
  await chooseCategory(page, "Weather");
  await page.getByLabel("Search APIs by name or description").fill("forecast");
  await expectCount(page, looser.length);
  await setFilter(page, "HTTPS", "yes");
  await expectCount(page, expected.length);
  await view(page, "Map");
  expect(await mapIds(page)).toEqual(expected);
  expect(await listIds(page)).toEqual(expected);
  for (const chip of await page.getByTestId("list-cards").locator(".chip", { hasText: "HTTPS" }).allTextContents()) expect(chip).toBe("HTTPS: Yes");
  const chips = page.getByTestId("active-filters");
  for (const t of ["Category: Weather", "Search: “forecast”", "HTTPS: Yes"]) await expect(chips).toContainText(t);
});

test("6. a search with no matches shows an empty state, not the whole map", async ({ page }) => {
  await page.goto("/");
  await view(page, "Map");
  const q = "zzqxnotathing";
  await page.getByLabel("Search APIs by name or description").fill(q);
  await expectCount(page, 0);
  const empty = page.getByTestId("no-results");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(`“${q}”`);
  await expect(page.locator(".mosaic")).toHaveAttribute("data-tile-count", "0");
  await expect(page.locator(".mosaic")).toHaveAttribute("data-layout", "filtered");
  await view(page, "List");
  await expect(page.getByTestId("list-cards")).toHaveCount(0);
  await empty.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByLabel("Search APIs by name or description")).toHaveValue("");
  await expect(empty).toBeHidden();
});

test("7. clearing search, All APIs and Reset filters each restore exactly what they should", async ({ page }) => {
  const d = await data(page);
  const total = d.listings.length + d.providers.length;
  const animals = d.listings.filter((l) => inCategory(l, "animals"));
  const keylessCatalog = d.listings.filter((l) => l.auth === "none").length;
  await page.goto("/");
  await view(page, "Map");
  await chooseCategory(page, "Animals");
  await page.getByLabel("Search APIs by name or description").fill("cat");
  await setFilter(page, "Authentication", "none");
  const chips = page.getByTestId("active-filters");
  // Removing the search keeps the category and auth filter.
  await chips.getByRole("button", { name: /^Remove Search/ }).click();
  await expectCount(page, animals.filter((l) => l.auth === "none").length);
  await expect(chips).toContainText("Category: Animals");
  // All APIs clears only the category.
  await chooseCategory(page, "All APIs");
  // Every keyless catalog listing (plus any keyless provider listings), but not the whole dataset.
  const shown = Number((await page.getByTestId("result-count").locator("strong").textContent())!.replace(/,/g, ""));
  expect(shown).toBeGreaterThanOrEqual(keylessCatalog);
  expect(shown).toBeLessThanOrEqual(keylessCatalog + d.providers.length);
  expect(shown).toBeLessThan(total);
  await expect(chips).not.toContainText("Category");
  await expect(chips).toContainText("Auth: No auth listed");
  // Reset filters restores the full map.
  await chips.getByRole("button", { name: "Reset filters" }).click();
  await expectCount(page, total);
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`^${escape(fmt(total))} of ${escape(fmt(total))} `));
  await expect(page.locator(".mosaic")).toHaveAttribute("data-layout", "full");
  await expect(page.locator(".mosaic")).toHaveAttribute("data-tile-count", String(d.listings.length + d.providers.length));
  await expect(page.getByTestId("active-filters")).toBeHidden();
});

test("8. switching between map and list, and opening the filter panel, keeps the same results", async ({ page }) => {
  const d = await data(page);
  const expected = searchIds(d, "data", (l) => inCategory(l, "science-and-math"));
  await page.goto("/");
  await view(page, "Map");
  await chooseCategory(page, "Science & Math");
  await page.getByLabel("Search APIs by name or description").fill("data");
  await expectCount(page, expected.length);
  const count = await page.getByTestId("result-count").textContent();
  const onMap = await mapIds(page);
  expect(onMap).toEqual(expected);
  expect(onMap.length).toBeGreaterThan(0);
  expect(await listIds(page)).toEqual(onMap);
  await view(page, "Map");
  expect(await mapIds(page)).toEqual(onMap);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByTestId("result-count")).toHaveText(count!);
  expect(await mapIds(page)).toEqual(onMap);
  await expect(page.getByLabel("Search APIs by name or description")).toHaveValue("data");
});

test("9. every category is reachable at desktop, tablet and phone widths without sideways scrolling", async ({ page, isMobile }) => {
  test.skip(isMobile, "this test sets each width itself");
  const d = await data(page);
  for (const [w, h] of [
    [1366, 860],
    [820, 1180],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await openNav(page);
    await expect.poll(async () => (await nav(page).boundingBox())!.x).toBeGreaterThanOrEqual(0); // drawer slide-in settles
    const box = (await nav(page).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(w);
    expect(box.y + box.height).toBeLessThanOrEqual(h + 1);
    const rows = nav(page).locator(".cat-row");
    await expect(rows).toHaveCount(d.categories.length + 1 + (d.providers.length ? 1 : 0)); // + All APIs (+ Provider-submitted)
    for (const c of d.categories) {
      const row = nav(page).locator(`.cat-row[data-slug="${c.slug}"]`);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeInViewport();
      const r = (await row.boundingBox())!;
      expect(r.x + r.width).toBeLessThanOrEqual(w);
      if (w < 900) expect(Math.round(r.height)).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The last category can be chosen at this width, and the map controls stay clear of the panel.
    await chooseCategory(page, d.categories[d.categories.length - 1]!.name);
    await expect(page.locator(".mosaic")).toHaveAttribute("data-layout", "filtered");
    if (w >= 900) {
      const controls = (await page.locator(".mosaic-controls").boundingBox())!;
      expect(controls.x).toBeGreaterThanOrEqual(box.x + box.width);
    } else await expect(nav(page)).toBeHidden(); // the drawer closes after a choice
  }
});

test("10. category navigation works by keyboard and is announced with names, counts and state", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard path is covered on desktop");
  const d = await data(page);
  const total = d.listings.length + d.providers.length;
  await page.goto("/");
  const all = nav(page).getByRole("button", { name: `All APIs ${fmt(total)} results` });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await all.focus();
  await page.keyboard.press("Tab");
  const ai = nav(page).getByRole("button", { name: /^AI Models \d+ results$/ });
  await expect(ai).toBeFocused();
  const outline = await ai.evaluate((el) => getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth);
  expect(outline).not.toMatch(/^none|0px$/);
  await page.keyboard.press("Enter");
  await expect(ai).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space"); // next row: MCP Servers
  const mcp = d.listings.filter((l) => l.categorySlug === "mcp-servers").length;
  await expect(nav(page).getByRole("button", { name: `MCP Servers ${mcp} results` })).toHaveAttribute("aria-pressed", "true");
  await expectCount(page, mcp);
  await expect(page.getByTestId("mosaic")).toHaveAttribute("aria-label", new RegExp(`^Scrollable mosaic of ${mcp} API tiles in MCP Servers`));
});
