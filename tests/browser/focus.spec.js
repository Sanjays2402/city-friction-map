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
  await page.locator("#max-age").selectOption("1");
  await expect(page.locator(".report-card")).toHaveCount(0);
  await page.locator("#reset-filters").click();
  await expect(page.locator("#max-age")).toHaveValue("0");
  await page.locator("#area-toggle").click();
  await expect(page.locator("#area-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".report-card").first()).toBeVisible();
});
