import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("flagging flow reports progress and blocks repeat flags", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".report-card")).toHaveCount(9);
  await page.locator(".report-card").first().click();
  await expect(page.locator("#detail")).toBeVisible();

  await page.locator("#flag-report").click();
  await expect(page.locator("#flag-dialog")).toBeVisible();
  await page.locator('#flag-form input[value="spam"]').check();
  await page.getByRole("button", { name: "Flag this report" }).click();
  await expect(page.locator("#toast")).toContainText("flag 1 of 3");

  // The same visitor cannot flag the same report twice.
  await page.locator("#flag-report").click();
  await page.locator('#flag-form input[value="inaccurate"]').check();
  await page.getByRole("button", { name: "Flag this report" }).click();
  await expect(page.locator("#flag-error")).toContainText(
    "You already flagged this report.",
  );
  await expect(page.locator("#flag-dialog")).toBeVisible();
});
