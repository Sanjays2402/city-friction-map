import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("area brief summarizes the map and shares a restorable camera", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?city=sf&lat=37.76&lng=-122.44&zoom=15");
  await page.locator(".report-card").first().waitFor();
  await page.locator("#tools-jump").click();
  await page.locator("#area-brief-toggle").click();
  await expect(page.locator("#area-brief-dialog")).toBeVisible();
  await expect(page.locator("#area-brief-content")).toContainText(
    "Center 37.7600, -122.4400 · zoom 15",
  );
  await expect(page.locator(".area-brief-metrics > div")).toHaveCount(4);
  await page.locator("#area-brief-copy").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Community reports only; not verified passability.");
  await page.locator("#area-view-copy").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.get("city")).toBe("sf");
  expect(new URL(link).searchParams.get("zoom")).toBe("15");
  await page.goto(link);
  await page.locator("#tools-jump").click();
  await page.locator("#area-brief-toggle").click();
  await expect(page.locator("#area-brief-content")).toContainText(
    "Center 37.7600, -122.4400 · zoom 15",
  );
  await page.locator("#area-brief-dialog .close").click();
  await page.getByLabel("Choose city").selectOption("sea");
  await expect(page).not.toHaveURL(/[?&]zoom=/);
  await page.locator("#area-brief-toggle").click();
  await expect(page.locator("#area-brief-content")).toContainText(
    "No active reports mapped here",
  );
});

test("area brief stays usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?city=sea");
  await page.locator("#tools-jump").click();
  await page.locator("#area-brief-toggle").click();
  await expect(page.locator("#area-brief-dialog")).toBeVisible();
  await expect(page.locator("#area-brief-copy")).toBeVisible();
  await expect(page.locator("#area-view-copy")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
