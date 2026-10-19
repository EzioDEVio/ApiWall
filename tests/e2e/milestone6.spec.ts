import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

test("the About page explains exactly what is counted, linked from every footer", async ({ page }) => {
  await page.goto("/stats/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/about\/?#privacy$/); // the static build keeps the trailing slash, the server build drops it
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByTestId("privacy-analytics")).toContainText("never sent anywhere");
});

test("browsing the wall sends no request to any other site", async ({ page, isMobile }) => {
  test.skip(isMobile, "covered on desktop");
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["127.0.0.1", "localhost"].includes(u.hostname) && !u.protocol.startsWith("data")) outside.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("mosaic")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette").getByRole("combobox").fill("OpenAI API");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("detail-dialog").locator("h2")).toHaveText("OpenAI API");
  await page.goto("/packs/weather-app/");
  await page.getByRole("link", { name: "See them on the wall" }).click();
  await expect(page.getByTestId("mosaic")).toBeVisible();
  expect(outside).toEqual([]);
});
