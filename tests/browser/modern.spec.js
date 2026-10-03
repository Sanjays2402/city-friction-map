import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (r) => r.abort());
});

test("grouped map tools retain controls and the jump action supports keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#map-tools .tool-group")).toHaveCount(4);
  for (const id of [
    "saved-toggle",
    "trip-toggle",
    "bikes-toggle",
    "export-csv",
    "major-only",
    "layer-opacity",
  ]) {
    await expect(page.locator(`#map-tools #${id}`)).toHaveCount(1);
  }
  await page.locator("#tools-jump").click();
  await expect(page.locator("#map-tools")).toBeFocused();
  await expect(page.locator("#report")).toHaveAccessibleName("Report friction");
  await expect(page.locator("#report svg")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("mobile map tools stay compact until requested", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#map-tools")).toBeHidden();
  await expect(page.locator("#tools-jump")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.locator("#tools-jump").click();
  await expect(page.locator("#map-tools")).toBeVisible();
  await expect(page.locator("#tools-jump")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator("#tools-jump").click();
  await expect(page.locator("#map-tools")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("modern layout fits phone, tablet, and desktop in all accent themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const color of ["green", "red", "yellow", "blue"]) {
      await page.locator("#personalize").click();
      await page.locator(`[data-color="${color}"]`).click();
      await page.locator("#personal-dialog .close").click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator("#report")).toBeVisible();
      expect(
        (await page.locator("#report").boundingBox()).height,
      ).toBeGreaterThanOrEqual(44);
    }
  }
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const duration = await page
    .locator("#report")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
