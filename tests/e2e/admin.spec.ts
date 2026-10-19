import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// GitHub's API is mocked: these tests never contact GitHub and use no real token.
const ISSUES = [
  {
    number: 101,
    title: "Add API: Acme Weather",
    html_url: "https://github.com/EzioDEVio/ApiWall/issues/101",
    created_at: "2026-10-19T10:00:00Z",
    user: { login: "visitor1" },
    labels: [{ name: "add-api" }],
    body: "### API name\n\nAcme Weather\n\n### Official documentation URL (https)\n\nhttps://docs.acme-weather.example.com/api\n\n### Category\n\nweather\n\n### Short description\n\nForecasts for any city.\n\n### Authentication\n\nAPI key\n\n### HTTPS\n\nYes\n\n### CORS (can browsers call it directly?)\n\nNot sure",
  },
  {
    number: 102,
    title: "Provider: Nimbus <img src=x onerror=alert(1)>",
    html_url: "https://github.com/EzioDEVio/ApiWall/issues/102",
    created_at: "2026-10-19T11:00:00Z",
    user: { login: "nimbus" },
    labels: [{ name: "provider" }],
    body: "### API name\n\nNimbus\n\n### Short description\n\n<script>window.__pwned = 1</script>",
  },
  { number: 103, title: "A bug report", html_url: "x", created_at: "2026-10-19T09:00:00Z", user: { login: "v" }, labels: [{ name: "bug" }], body: "" },
];

async function mockGitHub(page: Page, role: string) {
  const writes: { method: string; path: string; body: string }[] = [];
  const auth: string[] = [];
  await page.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    auth.push(req.headers()["authorization"] ?? "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (req.method() !== "GET") writes.push({ method: req.method(), path: u.pathname, body: req.postData() ?? "" });
    if (u.pathname === "/user") return json({ login: "theslash84" });
    if (u.pathname.endsWith("/permission")) return json({ role_name: role });
    if (u.pathname === "/repos/EzioDEVio/ApiWall/issues" && req.method() === "GET") return json(ISSUES);
    if (u.pathname.endsWith("/collaborators")) return json([{ login: "theslash84", role_name: "admin" }]);
    return json({}, req.method() === "DELETE" ? 200 : 201);
  });
  return { writes, auth };
}

async function signIn(page: Page) {
  await page.goto("/admin/");
  await page.getByLabel("Token").fill("github_pat_TEST_ONLY");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("admin-session")).toBeVisible();
}

test("an admin approves a request: the change goes to GitHub as an approval comment and the approved label", async ({ page }) => {
  const gh = await mockGitHub(page, "admin");
  await signIn(page);
  await expect(page.getByTestId("admin-role")).toHaveText("Admin");
  const cards = page.getByTestId("admin-request");
  await expect(cards).toHaveCount(2); // the bug report is not a request
  await cards.first().getByRole("button").first().click();
  await expect(page.getByTestId("admin-ready")).toBeVisible();
  await page.getByTestId("admin-approve").click();
  await expect(page.getByRole("status")).toContainText("Approved #101");
  const comment = gh.writes.find((w) => w.path.endsWith("/issues/101/comments"))!;
  expect(JSON.parse(comment.body).body).toMatch(/<!-- apiwall-approval:v1 [A-Za-z0-9+/=]+ -->$/);
  expect(gh.writes.at(-1)).toEqual({ method: "POST", path: "/repos/EzioDEVio/ApiWall/issues/101/labels", body: JSON.stringify({ labels: ["approved"] }) });
  // The token only ever goes to api.github.com, as a bearer header.
  expect(new Set(gh.auth)).toEqual(new Set(["Bearer github_pat_TEST_ONLY"]));
  await expect(page.getByTestId("admin-people")).toContainText("@theslash84");
});

test("visitor text is shown as text, and invalid requests cannot be approved", async ({ page }) => {
  await mockGitHub(page, "admin");
  await signIn(page);
  const card = page.getByTestId("admin-request").filter({ hasText: "Nimbus" });
  await expect(card).toContainText("<img src=x onerror=alert(1)>");
  await card.getByRole("button").first().click();
  await expect(card).toContainText("<script>window.__pwned = 1</script>");
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.getByTestId("admin-problems")).toBeVisible();
  await expect(page.getByTestId("admin-approve")).toBeDisabled();
});

test("a triage member can ask for information but cannot approve or reject", async ({ page }) => {
  const gh = await mockGitHub(page, "triage");
  await signIn(page);
  await expect(page.getByTestId("admin-role")).toHaveText("Triage");
  await page.getByTestId("admin-request").first().getByRole("button").first().click();
  await expect(page.getByTestId("admin-approve")).toBeDisabled();
  await page.getByLabel(/Message to the requester/).fill("Which category fits best?");
  await expect(page.getByTestId("admin-reject")).toBeDisabled();
  await page.getByTestId("admin-info").click();
  await expect(page.getByRole("status")).toContainText("Asked for more information");
  expect(gh.writes.map((w) => w.path)).toEqual(["/repos/EzioDEVio/ApiWall/issues/101/comments", "/repos/EzioDEVio/ApiWall/issues/101/labels"]);
  await expect(page.getByTestId("admin-people")).toHaveCount(0); // only admins see who has access
});

test("signing out forgets the token, nothing is stored, and a bad token is refused", async ({ page }) => {
  await mockGitHub(page, "admin");
  await signIn(page);
  const stored = () => page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(await stored()).not.toContain("github_pat_TEST_ONLY");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByTestId("admin-signin")).toBeVisible();
  await expect(page.getByLabel("Token")).toHaveValue("");

  await page.unroute("https://api.github.com/**");
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"message":"Bad credentials"}' }),
  );
  await page.getByLabel("Token").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".admin-error")).toContainText("Bad credentials");
  await expect(page.getByTestId("admin-queue")).toHaveCount(0);
});

test("the admin page passes accessibility checks when signed in", async ({ page }) => {
  await mockGitHub(page, "admin");
  await signIn(page);
  await page.getByTestId("admin-request").first().getByRole("button").first().click();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
