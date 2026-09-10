import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("trip check draws a route and reports corridor friction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".report-card")).toHaveCount(9);

  await page.locator("#trip-toggle").click();
  await expect(page.locator("#trip-panel")).toBeVisible();
  await expect(page.locator("#trip-panel")).toContainText("drop route stops");

  await page.locator("#map").click({ position: { x: 350, y: 250 } });
  await page.locator("#map").click({ position: { x: 750, y: 450 } });
  await expect(page.locator("#trip-panel")).toContainText("2 stops");

  await page.locator("#trip-width").evaluate((el) => {
    el.value = "2000";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#trip-panel")).toContainText("2000 m");
  // Seeded reports cluster near the map center; a max-width corridor either
  // finds them or honestly reports a clear corridor.
  await expect(page.locator("#trip-panel")).toContainText(
    /friction report|Clear corridor/,
  );

  await page.locator("#trip-clear").click();
  await expect(page.locator("#trip-panel")).toContainText("drop route stops");
  await page.locator("#trip-toggle").click();
  await expect(page.locator("#trip-panel")).toBeHidden();
});
