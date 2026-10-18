import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  categorySlug: string;
}
const listings = async (page: Page) => ((await (await page.request.get("/api/catalog")).json()) as { listings: Listing[] }).listings;
const count = async (page: Page) => Number((await page.getByTestId("result-count").locator("strong").textContent())!.replace(/,/g, ""));

async function showList(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByTestId("tabbar").getByRole("button", { name: "List" }).click();
  else await page.getByRole("button", { name: "List", exact: true }).click();
}

/** Opens card `i` in the list and presses ⇄ Compare in its details. */
async function addToCompare(page: Page, i: number) {
  await page.getByTestId("list-cards").locator("button.card-hit").nth(i).click();
  const dialog = page.getByTestId("detail-dialog");
  const btn = dialog.getByTestId("compare-api");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test("pick APIs from their details and compare them side by side", async ({ page, isMobile }) => {
  await page.goto("/?cat=ai-models");
  await showList(page, isMobile);
  const names = await page.getByTestId("list-cards").locator(".card-title").allTextContents();
  await addToCompare(page, 0);
  const tray = page.getByTestId("compare-tray");
  await expect(tray).toBeVisible();
  await expect(tray.getByTestId("compare-open")).toBeDisabled(); // one API is not a comparison
  await addToCompare(page, 1);
  await addToCompare(page, 2);
  await expect(page).toHaveURL(/[?&]compare=/);

  // A fourth is refused with a message; nothing is silently dropped.
  await page.getByTestId("list-cards").locator("button.card-hit").nth(3).click();
  await page.getByTestId("detail-dialog").getByTestId("compare-api").click();
  await expect(page.getByTestId("toast")).toContainText("holds 3 APIs");
  await expect(page.getByTestId("detail-dialog").getByTestId("compare-api")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");

  await tray.getByTestId("compare-open").click();
  const cmp = page.getByTestId("compare-dialog");
  await expect(cmp.getByRole("heading", { name: "Compare 3 APIs" })).toBeVisible();
  for (const n of names.slice(0, 3)) await expect(cmp.getByRole("columnheader", { name: new RegExp(n) })).toBeVisible();
  await expect(cmp.locator('tr[data-row="access"] td').first()).toHaveText("Not verified");

  // "Only differences" hides rows where all three agree (they share a category).
  await expect(cmp.locator('tr[data-row="category"]')).toBeVisible();
  await cmp.getByLabel(/Only differences/).check();
  await expect(cmp.locator('tr[data-row="category"]')).toHaveCount(0);
  await expect(cmp.locator('tr[data-row="ai-provider"]')).toBeVisible();

  // Removing one updates the table, and Details opens that API.
  await cmp.getByRole("button", { name: `Remove ${names[2]} from comparison` }).click();
  await expect(cmp.getByRole("heading", { name: "Compare 2 APIs" })).toBeVisible();
  await cmp.getByRole("button", { name: "Details" }).first().click();
  await expect(cmp).toBeHidden();
  await expect(page.getByTestId("detail-dialog").locator("h2")).toHaveText(names[0]!);
  await page.keyboard.press("Escape");

  await tray.getByRole("button", { name: "Clear" }).click();
  await expect(tray).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]compare=/);
  if (!isMobile) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test("a comparison link opens the comparison for anyone", async ({ page }) => {
  const ls = (await listings(page)).filter((l) => l.categorySlug === "ai-models").slice(0, 2);
  await page.goto(`/?compare=${ls.map((l) => l.id).join(",")}`);
  const cmp = page.getByTestId("compare-dialog");
  await expect(cmp.getByRole("heading", { name: "Compare 2 APIs" })).toBeVisible();
  for (const l of ls) await expect(cmp.getByRole("columnheader", { name: new RegExp(l.name) })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cmp).toBeHidden();
  await expect(page.getByTestId("compare-tray")).toBeVisible(); // the picks stay until cleared
});

test("Ctrl+K jumps to an API, a category or an action from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut");
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toBeVisible();

  // An API: type, Enter opens the best match.
  await page.keyboard.press("Control+k");
  const pal = page.getByTestId("palette");
  const input = pal.getByRole("combobox", { name: "Search APIs, categories and actions" });
  await expect(input).toBeFocused();
  await input.fill("openai api");
  await expect(pal.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(pal.getByRole("option").first()).toContainText("OpenAI API");
  await page.keyboard.press("Enter");
  await expect(pal).toBeHidden();
  await expect(page.getByTestId("detail-dialog").locator("h2")).toHaveText("OpenAI API");
  await page.keyboard.press("Escape");

  // A category: arrow down to it.
  await page.keyboard.press("Control+k");
  await input.fill("weather");
  const catOption = pal.getByRole("group", { name: "Categories" }).getByRole("option", { name: /^Weather/ });
  for (let i = 0; i < 10 && (await catOption.getAttribute("aria-selected")) !== "true"; i++) await page.keyboard.press("ArrowDown");
  await expect(catOption).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]cat=weather/);

  // An action: switching the theme updates the header toggle too.
  await page.keyboard.press("Control+k");
  await input.fill("dark theme");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-choice", "dark");

  // Esc closes without doing anything; the top-bar button opens it too.
  await page.getByTestId("palette-open").click();
  await expect(input).toBeFocused();
  await input.fill("show the list");
  await page.keyboard.press("Escape");
  await expect(pal).toBeHidden();
  await expect(page.getByTestId("list-drawer")).toHaveCount(0);
  expect(await count(page)).toBeGreaterThan(0);
});

test("the palette opens on phones too and tapping a result works", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toBeVisible();
  await page.keyboard.press("Control+k"); // external keyboards on tablets and phones
  const pal = page.getByTestId("palette");
  await pal.getByRole("combobox").fill("saved");
  await pal.getByRole("option", { name: /Show saved APIs/ }).click();
  await expect(page).toHaveURL(/[?&]saved=yes/);
  const box = (await page.getByTestId("result-count").boundingBox())!;
  expect(box.width).toBeGreaterThan(0);
});
