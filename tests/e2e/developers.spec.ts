import { expect, test } from "@playwright/test";

test("the Developers page documents the API, and the API answers with open CORS", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "content page; covered on desktop");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Developers" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Use ApiWall in your app");
  await expect(page.getByRole("cell", { name: "apis.json", exact: true })).toBeVisible();

  const res = await request.get("/api/v1/apis.json", { headers: { origin: "https://someone-elses-app.example" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["access-control-allow-origin"]).toBe("*");
  const body = (await res.json()) as { meta: { count: number }; data: { id: string; name: string }[] };
  expect(body.data.length).toBe(body.meta.count);
  const one = await request.get(`/api/v1/apis/${body.data[0]!.id}.json`);
  expect(((await one.json()) as { data: { name: string } }).data.name).toBe(body.data[0]!.name);
  expect((await request.get("/api/v1/nothing-here.json")).status()).toBe(404);
});
