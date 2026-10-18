import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  auth: string;
  categorySlug: string;
  tags?: string[];
}
const listings = async (page: Page) => ((await (await page.request.get("/api/catalog")).json()) as { listings: Listing[] }).listings;
const count = async (page: Page) => Number((await page.getByTestId("result-count").locator("strong").textContent())!.replace(/,/g, ""));

test("the Color picker recolours the wall, and the legend filters to one colour", async ({ page }) => {
  const ls = await listings(page);
  const keyless = ls.filter((l) => l.auth === "none").length;
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toBeVisible();
  await page.getByTestId("lens-select").selectOption("auth");
  await expect(page).toHaveURL(/[?&]lens=auth/);
  const legend = page.getByTestId("lens-legend");
  await expect(legend).toContainText("Do I need a key?");
  const none = legend.getByRole("button", { name: /only No auth/ });
  await expect(none).toHaveAccessibleName(new RegExp(`${keyless.toLocaleString("en")}$`));
  await none.click();
  await expect(none).toHaveAttribute("aria-pressed", "true");
  expect(await count(page)).toBe(keyless); // catalog only; provider listings have their own auth
  await expect(page).toHaveURL(/auth=none/);
  // The other colours still say what choosing them would show.
  await expect(legend.getByRole("button", { name: /only API key/ })).not.toHaveAccessibleName(/: 0$/);
  await none.click();
  await expect(page).not.toHaveURL(/auth=none/);
  await legend.getByRole("button", { name: "Back to categories" }).click();
  await expect(page).not.toHaveURL(/lens=/);
  await expect(legend).toBeHidden();
});

test("search suggestions open a match with the keyboard", async ({ page }) => {
  await page.goto("/");
  const q = page.getByLabel("Search APIs by name or description");
  await q.fill("claude");
  const list = page.getByTestId("suggestions");
  await expect(list.getByRole("option").first()).toContainText("Claude API");
  await expect(q).toHaveAttribute("aria-expanded", "true");
  await q.press("ArrowDown");
  await expect(q).toHaveAttribute("aria-activedescendant", "sug-0");
  await q.press("Enter");
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog.getByRole("heading", { name: "Claude API" })).toBeVisible();
  await expect(list).toBeHidden();
});

test("on wide screens details sit beside the map and step through results", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones use the full-screen details");
  await page.setViewportSize({ width: 1440, height: 900 });
  const ls = await listings(page);
  const ai = ls.filter((l) => l.categorySlug === "ai-models" || (l.tags ?? []).includes("ai-models"));
  await page.goto("/?cat=ai-models");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByTestId("list-cards").getByRole("button").first().click();
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog).toHaveClass(/is-side/);
  await expect(dialog.getByTestId("detail-position")).toHaveText(`1 of ${ai.length}`);
  const first = await dialog.locator("h2").textContent();
  // The rest of the page stays usable while it is open.
  await expect(page.getByRole("navigation", { name: "Categories" }).getByRole("button", { name: /^All APIs \d/ })).toBeEnabled();
  await dialog.getByRole("button", { name: "Next API" }).click();
  await expect(dialog.getByTestId("detail-position")).toHaveText(`2 of ${ai.length}`);
  await expect(dialog.locator("h2")).not.toHaveText(first!);
  await dialog.getByRole("button", { name: "Next API" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByTestId("detail-position")).toHaveText(`1 of ${ai.length}`);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]api=/);
});

test("the theme toggle switches light and dark and remembers the choice", async ({ page }) => {
  await page.goto("/about");
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("data-theme-choice", "system");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(12, 14, 20)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
});

test("tiles load small logo copies, not the full-size originals", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/marks/")) requested.push(u.pathname);
  });
  await page.goto("/?view=map");
  await expect.poll(() => requested.length).toBeGreaterThan(10);
  const tiles = requested.filter((p) => p.startsWith("/marks/tiles/"));
  expect(tiles.length / requested.length).toBeGreaterThan(0.8);
});
