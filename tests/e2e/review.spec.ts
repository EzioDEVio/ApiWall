import { expect, test } from "@playwright/test";

// Test-only token; playwright.config.ts gives the server its SHA-256 digest.
const TOKEN = "e2e-reviewer-token-0123456789abcdef";

test.describe.configure({ mode: "serial" });

test("reviewer area is closed without a session", async ({ page, request }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Reviewer sign-in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submissions" })).toHaveCount(0);
  expect((await request.get("/api/review/submissions")).status()).toBe(401);
  expect((await request.get("/api/review/audit")).status()).toBe(401);
});

test("a provider submission stays private until a reviewer approves it, then appears labelled", async ({ page, isMobile }) => {
  test.skip(isMobile, "submission flow runs once, on desktop");
  const apiName = `Acme Tide ${Date.now().toString(36)}`;
  await page.goto("/submit");
  await expect(page.getByText("Never submit a secret here.").first()).toBeVisible();
  await page.getByText("Sponsored tile", { exact: true }).click();
  await page.getByLabel("Provider name").fill("Acme Tides");
  await page.getByLabel("API name").fill(apiName);
  await page.getByLabel("Official website").fill("https://acmetides.test");
  await page.getByLabel("Documentation URL").fill("https://acmetides.test/docs");
  await page.getByLabel("Category").selectOption("Weather");
  await page.getByLabel("Contact email on your domain").fill("api@acmetides.test");
  await page.getByLabel("Short description").fill("Tide tables and coastal water levels for 4,000 stations.");
  await page.getByLabel("Free-tier or paid terms").fill("Free: 500 calls/day");
  await page.getByLabel("Rate limits").fill("10 requests/second");
  await page.getByLabel("Source URL for these claims").fill("https://acmetides.test/pricing");
  await page.getByText(/I am authorised to represent this provider/).click();

  // A pasted key is refused and nothing is stored.
  await page.getByLabel("Rate limits").fill("use key sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  await page.waitForTimeout(3200); // the form refuses instant submissions
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator(".form-summary[role=alert]")).toContainText("secret");
  await page.getByLabel("Rate limits").fill("10 requests/second");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("submission-confirmation")).toContainText("pending review");

  // Not public yet.
  const before = await (await page.request.get("/api/providers/public")).json();
  expect(JSON.stringify(before)).not.toContain(apiName);

  // Reviewer signs in and approves it as a sponsored tile.
  await page.goto("/review");
  await page.getByLabel("Reviewer token").fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Submissions" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(apiName) }).click();
  await page.getByText(/Approve as a sponsored tile/).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("button", { name: new RegExp(apiName) }).click();
  await expect(page.getByRole("list").filter({ hasText: "approved by reviewer:" })).toBeVisible();

  // Public now, clearly labelled, separate from catalog listings.
  const catalogCount = ((await (await page.request.get("/api/catalog")).json()) as { listings: unknown[] }).listings.length;
  const providerCount = ((await (await page.request.get("/api/providers/public")).json()) as { listings: unknown[] }).listings.length;
  await page.goto("/");
  await expect(page.getByTestId("result-count")).toContainText(`of ${(catalogCount + providerCount).toLocaleString("en")}`);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Type", { exact: true }).selectOption("provider");
  await page.getByRole("button", { name: /^Show \d/ }).click();
  const card = page.getByTestId("list-cards").locator("li", { hasText: apiName });
  await expect(card.getByText("★ Sponsored")).toBeVisible();
  await card.getByRole("button").click();
  const dialog = page.getByTestId("detail-dialog");
  await expect(dialog.getByText("Provider-stated facts, reviewed")).toBeVisible();
  await expect(dialog.getByText(/not part of the upstream public-apis catalog/)).toBeVisible();
  await expect(dialog.getByTestId("access-unknown")).toBeVisible(); // claims are unverified until checked

  const after = await (await page.request.get("/api/providers/public")).json();
  expect(JSON.stringify(after)).not.toContain("api@acmetides.test");
});

// A 1×1 PNG, enough for the byte checks; the reviewer judges real logos by eye.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("visitors can suggest a logo for a listing without one; it shows only after a reviewer approves it", async ({ page, isMobile }) => {
  test.skip(isMobile, "logo flow runs once, on desktop");
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
  await page.goto("/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Logo", { exact: true }).selectOption("missing");
  await page.getByRole("button", { name: /^Show \d/ }).click();
  await expect(page.getByTestId("active-filters")).toContainText("No logo yet");
  const cards = page.getByTestId("list-cards").locator("li");
  const first = cards.nth(0);
  const second = cards.nth(1);
  const name = (await first.locator(".card-title").textContent())!;
  const name2 = (await second.locator(".card-title").textContent())!;
  const id = (await first.getAttribute("data-id"))!;

  await first.getByRole("button").click();
  const dialog = page.getByTestId("detail-dialog");
  await dialog.getByRole("button", { name: "Suggest a logo" }).click();
  const form = dialog.getByTestId("logo-suggest");
  await expect(form.getByText("Never submit a secret here.")).toBeVisible();
  await form.getByLabel("Logo image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await form.getByLabel(/Where the provider publishes this logo/).fill("https://example.com/press-kit");
  await page.waitForTimeout(3200); // the form refuses instant submissions
  await form.getByRole("button", { name: "Send for review" }).click();
  await expect(dialog.getByTestId("logo-suggest-done")).toContainText("only after approval");

  // Private until approved.
  let feed = await (await page.request.get("/api/providers/public")).json();
  expect(JSON.stringify(feed.logoOverrides)).not.toContain(id);

  // The reviewer approves it, and publishes a logo for a second listing directly.
  await page.goto("/review");
  if (await page.getByLabel("Reviewer token").isVisible()) {
    await page.getByLabel("Reviewer token").fill(TOKEN);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.getByRole("button", { name: /^Logos/ }).click();
  const item = page.getByTestId("logo-item").filter({ hasText: name });
  await expect(item.getByRole("img", { name: `Suggested logo for ${name}` })).toBeVisible();
  await item.getByRole("button", { name: "Approve logo" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} now shows this logo` })).toBeVisible();

  const upload = page.getByTestId("direct-logo-upload");
  await upload.getByLabel("Find a listing").fill(name2);
  await upload.getByRole("button", { name: new RegExp(`^${name2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first().click();
  await upload.getByLabel(/Logo image/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await upload.getByRole("button", { name: "Publish logo" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Published a logo for ${name2}` })).toBeVisible();

  feed = await (await page.request.get("/api/providers/public")).json();
  expect(feed.logoOverrides.map((o: { listingId: string }) => o.listingId)).toContain(id);

  // The public site now shows the approved logo, labelled as reviewer-approved.
  await page.goto(`/?api=${encodeURIComponent(id)}`);
  const d = page.getByTestId("detail-dialog");
  await expect(d.getByTestId("provider-logo")).toBeVisible();
  await expect(d.getByTestId("logo-source")).toContainText("Approved by a ApiWall reviewer");
  await expect(d.getByRole("button", { name: "Suggest a better logo" })).toBeVisible();
});
