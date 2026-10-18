import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

interface Listing {
  id: string;
  name: string;
  categorySlug: string;
  tags?: string[];
  addedAt?: string;
}
const listings = async (page: Page) => ((await (await page.request.get("/api/catalog")).json()) as { listings: Listing[] }).listings;
const count = async (page: Page) => Number((await page.getByTestId("result-count").locator("strong").textContent())!.replace(/,/g, ""));
const nav = (page: Page) => page.getByRole("navigation", { name: "Categories" });

/** Opens the list view with the desktop toggle or the phone tab bar. */
async function showList(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByTestId("tabbar").getByRole("button", { name: "List" }).click();
  else await page.getByRole("button", { name: "List", exact: true }).click();
}

test("saving an API keeps it in this browser, and the Saved list shows only saved APIs", async ({ page, isMobile }) => {
  await page.goto("/?cat=ai-models");
  await showList(page, isMobile);
  const first = page.getByTestId("list-cards").locator("li").first();
  const name = (await first.locator(".card-title").textContent())!.trim();
  await first.locator("button.card-hit").click();
  const dialog = page.getByTestId("detail-dialog");
  const save = dialog.getByTestId("save-api");
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(save).toHaveText("★ Saved");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]api=/);

  // The card's star reflects it, and saving survives a reload.
  await expect(first.getByRole("button", { name: `Save ${name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  if (isMobile) await page.getByTestId("tabbar").getByRole("button", { name: "Saved" }).click();
  else await nav(page).getByRole("button", { name: "Saved, 1 result" }).click();
  await expect(page).toHaveURL(/[?&]saved=yes/);
  expect(await count(page)).toBe(1);
  await expect(page.getByTestId("saved-banner")).toBeVisible();

  // Removing it leaves the empty state, not the whole wall.
  await showList(page, isMobile);
  await page
    .getByTestId("list-cards")
    .getByRole("button", { name: `Save ${name}`, exact: true })
    .click();
  await expect(page.getByTestId("no-saved")).toBeVisible();
  expect(await count(page)).toBe(0);
});

test("saved APIs can be shared as one link, and the receiver can save them all", async ({ page, context, browser, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== "chromium", "clipboard permissions are checked on desktop Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const ls = await listings(page);
  const picks = ls.filter((l) => l.categorySlug === "ai-models").slice(0, 2);
  await page.addInitScript(
    (ids) => localStorage.setItem("apiwall.saved", JSON.stringify(ids)),
    picks.map((p) => p.id),
  );
  await page.goto("/?saved=yes");
  expect(await count(page)).toBe(2);
  await page.getByTestId("share-saved").click();
  await expect(page.getByTestId("toast")).toContainText("Link to your 2 saved APIs copied.");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.get("list")!.split(",").sort()).toEqual(picks.map((p) => p.id).sort());

  // Someone else opens the link in a fresh browser.
  const other = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const p2 = await other.newPage();
  await p2.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
  await p2.goto(new URL(link).pathname + new URL(link).search);
  const banner = p2.getByTestId("shared-list");
  await expect(banner).toContainText("Shared list · 2 APIs");
  expect(await count(p2)).toBe(2);
  await banner.getByRole("button", { name: "★ Save all" }).click();
  await expect(nav(p2).getByRole("button", { name: "Saved, 2 results" })).toBeVisible();
  await banner.getByRole("button", { name: "Close list" }).click();
  await expect(banner).toBeHidden();
  expect(await count(p2)).toBeGreaterThan(2);
  await other.close();
});

test("New this week shows APIs first seen in the last seven days, with badges", async ({ page, isMobile }) => {
  const ls = await listings(page);
  const dated = ls.filter((l) => l.addedAt);
  expect(dated.length).toBeGreaterThan(0);
  const latest = Math.max(...dated.map((l) => Date.parse(l.addedAt!)));
  // Pin the clock two days after the latest import so the result does not depend on today's date.
  const now = latest + 2 * 86_400_000;
  await page.clock.setFixedTime(new Date(now));
  const fresh = dated.filter((l) => now - Date.parse(l.addedAt!) <= 7 * 86_400_000);
  await page.goto("/");
  if (!isMobile) {
    const row = nav(page).getByRole("button", { name: `New this week, ${fresh.length} result${fresh.length === 1 ? "" : "s"}` });
    await row.click();
    await expect(row).toHaveAttribute("aria-pressed", "true");
  } else await page.goto("/?new=yes");
  await expect(page).toHaveURL(/[?&]new=yes/);
  expect(await count(page)).toBe(fresh.length);
  await showList(page, isMobile);
  const cards = page.getByTestId("list-cards").locator("li");
  await expect(cards).toHaveCount(fresh.length);
  await expect(cards.first().getByText("New", { exact: true })).toBeVisible();

  // A week later nothing is new any more.
  await page.clock.setFixedTime(new Date(latest + 9 * 86_400_000));
  await page.goto("/?new=yes");
  expect(await count(page)).toBe(0);
  if (!isMobile) await expect(nav(page).getByRole("button", { name: /^New this week,/ })).toHaveCount(0);
});

test("the What's new page lists each import's additions with links to the wall", async ({ page }) => {
  await page.goto("/changes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Changes to the wall");
  const added = page.locator(".change").first().getByRole("link", { name: "Claude API" });
  await expect(added).toBeVisible();
  await added.click();
  await expect(page).toHaveURL(/[?&]api=api-claude-api-/);
  await expect(page.getByTestId("detail-dialog")).toBeVisible();
});

test("phones get a tab bar and a details sheet that swipes down to close", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await page.goto("/?cat=ai-models");
  const bar = page.getByTestId("tabbar");
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.y + box.height).toBeGreaterThan(vh - 40);
  for (const b of await bar.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // The status bar and map controls sit above the tab bar.
  for (const sel of [".status-bar", ".mosaic-controls"])
    expect((await page.locator(sel).boundingBox())!.y + (await page.locator(sel).boundingBox())!.height).toBeLessThanOrEqual(box.y);

  await bar.getByRole("button", { name: "Categories" }).click();
  await expect(bar.getByRole("button", { name: "Categories" })).toHaveAttribute("aria-expanded", "true");
  await expect(nav(page)).toBeVisible();
  await nav(page).getByRole("button", { name: "Close categories" }).click();

  await bar.getByRole("button", { name: "List" }).click();
  await expect(bar.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("list-cards").locator("button.card-hit").first().click();
  const sheet = page.getByTestId("detail-dialog");
  await expect(sheet).toHaveClass(/is-sheet/);
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // the slide-up settles
  const handle = (await sheet.locator(".sheet-handle").boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 4 });
  await page.mouse.move(x, y + 160, { steps: 6 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]api=/);
});
