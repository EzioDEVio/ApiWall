import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_CHROMIUM_PATH lets sandboxes without Playwright's browser download use a local Chromium.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const port = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  // On GitHub, failures also appear as annotations on the run summary, so they are readable without opening the log.
  reporter: process.env.GITHUB_ACTIONS ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath, args: ["--no-sandbox", "--disable-gpu"] } : {},
  },
  webServer: {
    command: `npx next start -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      TESSERA_DATA_DIR: "test-results/e2e-data",
      REVIEWER_TOKEN_SHA256: "333daeebf988ba0d8c34ef4fc318cfec1cb5a0036f61898c0fb670a3cda41768", // sha256 of the test-only token in tests/e2e/review.spec.ts
      REVIEW_SESSION_SECRET: "e2e-session-secret-not-for-production-0123456789",
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
