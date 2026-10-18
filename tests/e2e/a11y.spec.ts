import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tessera.welcome.dismissed", "1"));
});

// Every kind of page, in both themes. Serious and critical WCAG 2.2 A/AA problems fail the run.
const PAGES = [
  "/",
  "/apis/openai-api/",
  "/apis/",
  "/categories/",
  "/categories/weather/",
  "/packs/",
  "/packs/no-key-needed/",
  "/stats/",
  "/changes/",
  "/developers/",
  "/submit/",
  "/about/",
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`no serious accessibility problems on ${path}`, async ({ page, isMobile }) => {
        test.skip(isMobile && scheme === "dark", "dark theme is covered on desktop");
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        if (path === "/") await expect(page.getByTestId("mosaic")).toBeVisible();
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        const report = bad
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes
                .slice(0, 5)
                .map((n) => n.target.join(" "))
                .join("\n  ")}`,
          )
          .join("\n");
        expect(bad, report).toEqual([]);
      });
    }
  });
}

test("the keyboard shortcuts sheet and the Ctrl+K palette pass too", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcuts are a desktop feature");
  await page.goto("/");
  await expect(page.getByTestId("mosaic")).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts")).toBeVisible();
  let r = await new AxeBuilder({ page }).include('[data-testid="shortcuts"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("palette")).toBeVisible();
  r = await new AxeBuilder({ page }).include('[data-testid="palette"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
