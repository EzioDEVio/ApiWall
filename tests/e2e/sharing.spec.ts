import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  description: string;
  categorySlug: string;
  tags?: string[];
  aiModel?: { provider: string; models: string };
}
const catalog = async (page: Page) => ((await (await page.request.get("/api/catalog")).json()) as { listings: Listing[] }).listings;
const inCat = (l: Listing, slug: string) => l.categorySlug === slug || (l.tags ?? []).includes(slug);

test("a shared link restores category, search and view, and the URL follows every change", async ({ page }) => {
  const ls = await catalog(page);
  const expected = ls.filter((l) => inCat(l, "ai-models") && `${l.name} ${l.description} ${l.aiModel?.provider ?? ""} ${l.aiModel?.models ?? ""}`.toLowerCase().includes("claude"));
  expect(expected.length).toBeGreaterThan(0);
  await page.goto("/?cat=ai-models&q=claude&view=list");
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`^${expected.length} of `));
  await expect(page.getByLabel("Search APIs by name or description")).toHaveValue("claude");
  await expect(page.getByTestId("list-drawer")).toBeVisible();
  await expect(page.getByTestId("active-filters")).toContainText("Category: AI Models");
  for (const l of expected) await expect(page.getByTestId("list-cards").locator(`li[data-id="${l.id}"]`)).toBeVisible();

  await page.getByLabel("Search APIs by name or description").fill("");
  await expect(page).toHaveURL(/\?cat=ai-models&view=list$/);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page).toHaveURL(/\?cat=ai-models$/);
  await page.getByTestId("active-filters").getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("Copy link copies the current view", async ({ page, context, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== "chromium", "clipboard permissions are checked on desktop Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?cat=weather");
  await expect(page.getByTestId("result-count")).toContainText("in Weather");
  await page.getByTestId("copy-link").click();
  await expect(page.getByTestId("toast")).toContainText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test("Surprise me opens a random API from the current results, by button or the R key", async ({ page, isMobile }) => {
  const ls = await catalog(page);
  const weather = new Set(ls.filter((l) => inCat(l, "weather")).map((l) => l.id));
  await page.goto("/?cat=weather");
  await expect(page.getByTestId("result-count")).toContainText("in Weather");
  await page.getByTestId("surprise").click();
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog).toBeVisible();
  const first = new URL(page.url()).searchParams.get("api")!;
  expect(weather.has(first)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  if (!isMobile) {
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.keyboard.press("r");
    await expect(dialog).toBeVisible();
    expect(weather.has(new URL(page.url()).searchParams.get("api")!)).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("/");
    await expect(page.getByLabel("Search APIs by name or description")).toBeFocused();
  }
});

test("details offer copy-ready starter code with keyboard-operable tabs", async ({ page, isMobile }) => {
  const ls = await catalog(page);
  const claude = ls.find((l) => l.name === "Claude API")!;
  await page.goto(`/?api=${claude.id}`);
  const code = page.getByTestId("detail-dialog").getByTestId("code-samples");
  await expect(code.getByRole("tabpanel")).toContainText('curl "https://api.anthropic.com/PATH_FROM_THE_DOCS"');
  await expect(code.getByRole("tabpanel")).toContainText("$API_KEY");
  await expect(code.getByRole("tabpanel")).not.toContainText("sk-");
  if (!isMobile) {
    await code.getByRole("tab", { name: "curl" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(code.getByRole("tab", { name: "JavaScript" })).toHaveAttribute("aria-selected", "true");
    await expect(code.getByRole("tabpanel")).toContainText("process.env.API_KEY");
  }
  await expect(code).toContainText("Never put it in front-end code");
  await expect(page.getByTestId("detail-dialog").getByTestId("report-link")).toHaveAttribute("href", /github\.com\/EzioDEVio\/ApiWall\/issues\/new\?template=report-listing\.yml/);
});

test("the header links to the GitHub repository", async ({ page }) => {
  await page.goto("/about");
  const star = page.getByRole("link", { name: /Star ApiWall on GitHub/ });
  await expect(star).toHaveAttribute("href", "https://github.com/EzioDEVio/ApiWall");
  await expect(star).toHaveAttribute("rel", /noopener/);
});
