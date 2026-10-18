import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  slug: string;
  categorySlug: string;
  tags?: string[];
}
const catalog = async (request: import("@playwright/test").APIRequestContext) =>
  (await (await request.get("/api/catalog")).json()) as { listings: Listing[]; categories: { slug: string; name: string }[] };

test("every API has its own page, reachable from the wall and back", async ({ page, isMobile }) => {
  await page.goto("/?cat=ai-models");
  if (isMobile) await page.getByTestId("tabbar").getByRole("button", { name: "List" }).click();
  else await page.getByRole("button", { name: "List", exact: true }).click();
  const first = page.getByTestId("list-cards").locator("li").first();
  const name = (await first.locator(".card-title").textContent())!.trim();
  await first.locator("button.card-hit").click();
  await page.getByTestId("detail-dialog").getByTestId("api-page-link").click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("AI Models");
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toMatch(/\/apis\/[a-z0-9-]+\/$/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!) as { "@type": string; itemListElement: unknown[] };
  expect(ld["@type"]).toBe("BreadcrumbList");
  expect(ld.itemListElement).toHaveLength(4);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /auth/);
  await expect(page.getByTestId("embed-code")).toContainText("data-apiwall-api=");

  await page.getByRole("link", { name: "Show on the wall" }).click();
  await expect(page.getByTestId("detail-dialog").locator("h2")).toHaveText(name);
});

test("category pages list exactly the category's APIs and link to each page", async ({ page, request }) => {
  const d = await catalog(request);
  const weather = d.listings.filter((l) => l.categorySlug === "weather" || (l.tags ?? []).includes("weather"));
  await page.goto("/categories/");
  await page.getByRole("link", { name: /^Weather/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Weather APIs");
  const rows = page.getByTestId("category-page").locator(".api-list > li");
  await expect(rows).toHaveCount(weather.length);
  const target = weather.sort((a, b) => a.name.localeCompare(b.name, "en"))[0]!;
  await rows.first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/apis/${target.slug}/?$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(target.name);
});

test("the A–Z list and sitemap cover every API page", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "content check; covered on desktop");
  const d = await catalog(request);
  await page.goto("/apis/");
  await expect(page.getByTestId("all-apis-page").locator(".az-list a")).toHaveCount(d.listings.length);
  const xml = await (await request.get("/sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(locs.filter((u) => /\/apis\/[a-z0-9-]+\/$/.test(u))).toHaveLength(d.listings.length);
  expect(locs.filter((u) => /\/categories\/[a-z0-9-]+\/$/.test(u))).toHaveLength(d.categories.length);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("the Docs link filter is offered and kept in the URL", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toBeVisible();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Docs link", { exact: true }).selectOption("ok");
  await expect(page).toHaveURL(/[?&]links=ok/);
  await expect(page.getByTestId("active-filters")).toContainText("Hiding broken links");
  if (!isMobile) await expect(page.getByRole("button", { name: /^Show \d/ })).toBeVisible();
});

test("the embed script draws a card inside its own shadow root", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  await page.goto("/developers/");
  const demo = page.getByTestId("embed-demo-api");
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator(".name")).toHaveText("Claude API"); // Playwright locators pierce open shadow roots
  await expect(demo.getByRole("link", { name: "Details on ApiWall" })).toHaveAttribute("href", /\/apis\/claude-api\/$/);
  await expect(page.getByTestId("embed-demo-category").locator("li")).toHaveCount(4);
  expect(await demo.evaluate((el) => !!el.shadowRoot && el.innerHTML === "")).toBe(true);
});
