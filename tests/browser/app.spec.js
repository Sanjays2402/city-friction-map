import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});
test("filter, report, confirm and clear a persisted incident", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page.locator(".report-card")).toHaveCount(9);
  await page.locator('[data-category="signal"]').click();
  await expect(page.locator(".report-card")).toHaveCount(1);
  await page.getByRole("button", { name: "All friction", exact: true }).click();
  await page.locator("#report").click();
  await page.locator("[name=title]").fill("Test queue at the waterfront");
  await page.locator("[name=location]").fill("Embarcadero test location");
  await page.locator("[name=lat]").fill("37.8");
  await page.locator("[name=lng]").fill("-122.4");
  await page.getByRole("button", { name: "Put it on the map" }).click();
  await expect(page.locator("#detail")).toContainText(
    "Test queue at the waterfront",
  );
  await page.reload();
  await page.locator("#search").fill("Test queue at the waterfront");
  await expect(page.locator(".report-card")).toHaveCount(1);
  await page.locator(".report-card").click();
  await page.getByRole("button", { name: "Looks clear" }).click();
  await expect(page.locator("#detail")).toContainText("1/2 clearance votes");
  const context = await browser.newContext();
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  const other = await context.newPage();
  await other.goto("/");
  await other.locator("#search").fill("Test queue at the waterfront");
  await other.locator(".report-card").click();
  await other.getByRole("button", { name: "Looks clear" }).click();
  await expect(other.locator("#detail")).toContainText(
    "community marked this cleared",
  );
  await context.close();
});
test("comment on a report, follow it, and filter to followed reports", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".report-card").first().click();
  await expect(page.locator("#detail")).toBeVisible();
  await page.locator("#comment-form input").fill("Still blocked at lunchtime");
  await page.locator("#comment-form button").click();
  await expect(page.locator(".comment").first()).toContainText(
    "Still blocked at lunchtime",
  );
  await expect(page.locator(".comment-meta strong").first()).toContainText(
    "Neighbor",
  );
  await page.locator("#follow-report").click();
  await expect(page.locator("#follow-report")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#followed-toggle").click();
  await expect(page.locator(".report-card")).toHaveCount(1);
  await page.reload();
  await page.locator("#followed-toggle").click();
  await expect(page.locator(".report-card")).toHaveCount(1);
});

test("mobile layout fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#map")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("save, reload, share, filter and sort reports", async ({ page }) => {
  await page.goto("/");
  await page.locator("#major-only").check();
  await expect(page.locator(".report-card")).toHaveCount(2);
  await page.locator("#sort").selectOption("confirmed");
  await expect(page.locator(".report-card").first()).toContainText(
    "Elevator out of service",
  );
  await page.locator(".report-card").first().click();
  const shared = page.url();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9-]+$/);
  await page.locator("#save-report").click();
  await expect(page.locator("#save-report")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.locator("#detail")).toContainText(
    "Elevator out of service",
  );
  await page.locator("#saved-toggle").click();
  await expect(page.locator(".report-card")).toHaveCount(1);
  await page.locator("#hide-demo").check();
  await expect(page.locator(".report-card")).toHaveCount(0);
  await page.locator("#reset-filters").click();
  await page.goto(shared);
  await expect(page.locator("#detail")).toContainText(
    "Elevator out of service",
  );
  await page.locator("#save-report").click();
  await page.locator("#saved-toggle").click();
  await expect(page.locator(".report-card")).toHaveCount(0);
});
