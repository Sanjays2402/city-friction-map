import { test, expect } from "@playwright/test";
test("map focus controls and report-age filters work together", async ({
  page,
  context,
}) => {
  await context.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.route(/\/api\/reports(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const rows = await response.json();
    await route.fulfill({
      json: rows.map((r) => ({ ...r, updatedAt: Date.now() - 2 * 3600000 })),
    });
  });
  await page.goto("/");
  await expect(page.locator(".report-card").first()).toBeVisible();
  await expect(page.locator(".demo").first()).not.toContainText("${");
  await page.locator("#report-age").selectOption("1");
  await expect(page.locator(".report-card")).toHaveCount(0);
  await page.locator("#fit-results").click();
  await expect(page.locator("#toast")).toContainText("No matching reports");
  await page.locator("#reset-filters").click();
  await expect(page.locator("#report-age")).toHaveValue("0");
  await page.locator("#fit-results").click();
  await page.locator("#in-view-only").check();
  await expect(page.locator("#count")).toContainText("In this map area");
  await page.locator("#city-overview").click();
  await expect(page.locator(".report-card").first()).toBeVisible();
});
