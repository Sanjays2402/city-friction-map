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

  await page.locator("#tools-jump").click();
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

test("route links restore stops and corridor width, then clear on city change", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(
    "/?city=sf&route=37.77000,-122.42000;37.78000,-122.42000&width=350",
  );
  await expect(page.locator("#trip-panel")).toBeVisible();
  await expect(page.locator(".trip-stop")).toHaveCount(2);
  await expect(page.locator("#trip-width")).toHaveValue("350");
  await expect(page.locator(".trip-summary > div")).toHaveCount(3);
  await expect(page.locator(".trip-caution")).toContainText(
    "does not guarantee a passable route",
  );
  await page.locator("#trip-share").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).searchParams.get("width")).toBe("350");
  expect(new URL(copied).searchParams.get("route")).toContain("37.77000");
  await page.locator("#trip-clear").click();
  await expect(page).not.toHaveURL(/[?&]route=/);
  await page.goto(copied);
  await expect(page.locator(".trip-stop")).toHaveCount(2);
  await page.getByLabel("Choose city").selectOption("sea");
  await expect(page).not.toHaveURL(/[?&]route=/);
  await expect(page.locator(".trip-stop")).toHaveCount(0);
});

test("shared trip remains readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/?city=sf&route=37.77000,-122.42000;37.78000,-122.42000&width=250",
  );
  await expect(page.locator("#trip-share")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
