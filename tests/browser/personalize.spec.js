import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (r) => r.abort());
});
test("all accents persist across reload and cooperate with dark mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
  await page.locator("#personalize").click();
  for (const color of ["red", "yellow", "blue", "green"]) {
    await page.locator(`[data-color="${color}"]`).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", color);
    await expect(page.locator(`[data-color="${color}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.locator('[data-color="blue"]').click();
  await page.locator("#personal-dialog .close").click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
});
test("saved places persist, restore a view, and can be removed", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#personalize").click();
  await page.locator("#save-view-form input").fill("My neighborhood");
  await page.locator("#save-view-form button").click();
  await expect(page.locator(".saved-place")).toContainText("My neighborhood");
  await page.reload();
  await page.locator("#personalize").click();
  await expect(page.locator(".saved-place")).toContainText("My neighborhood");
  await page.locator(".saved-place button").first().click();
  await expect(page.locator("#personal-dialog")).not.toBeVisible();
  await page.locator("#personalize").click();
  await page.getByRole("button", { name: "Remove My neighborhood" }).click();
  await expect(page.locator(".saved-place")).toHaveCount(0);
});
