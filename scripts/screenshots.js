import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Read-only capture: never submit reports, votes, or comments; never mock feeds.
const base = process.argv[2] || "http://127.0.0.1:3200";
await mkdir("docs/screenshots", { recursive: true });
const browser = await chromium.launch({
  ...(process.env.SCREENSHOT_CHROME
    ? { executablePath: process.env.SCREENSHOT_CHROME }
    : {}),
});
const files = [];
async function capture(target, name, fullPage = false) {
  await target.screenshot({
    path: "docs/screenshots/" + name + ".png",
    animations: "disabled",
    ...(fullPage ? { fullPage: true } : {}),
  });
  files.push(name + ".png");
}
async function ready(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".leaflet-tile")].every(
        (img) => img.complete,
      ),
    null,
    { timeout: 15000 },
  );
}
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const headerFeeds = Promise.all(
    ["weather", "airquality", "alerts"].map((kind) =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/enrich/" + kind,
        { timeout: 20000 },
      ),
    ),
  );
  await page.goto(base);
  await headerFeeds;
  await page.locator(".report-card").first().waitFor();
  await ready(page);
  await capture(page, "desktop", true);

  await page.locator("#personalize").click();
  await page.locator('[data-color="blue"]').click();
  await page.locator("#personal-dialog .close").click();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capture(page, "dark-mode", true);
  await page.locator("#personalize").click();
  await capture(page.locator("#personal-dialog"), "personalization");
  await page.locator('[data-color="green"]').click();
  await page.locator("#personal-dialog .close").click();
  await page.locator("#theme-toggle").click();

  await page.locator("#live-context").click();
  await expect(page.locator(".context-card")).toHaveCount(3);
  await expect(page.locator(".context-grid")).not.toContainText("Loading", {
    timeout: 20000,
  });
  console.log(
    "Live source status:",
    await page.locator(".context-grid").innerText(),
  );
  await capture(page.locator("#context-dialog"), "live-context");
  await page.locator("#context-dialog .close").click();

  await page.locator(".report-card").first().click();
  await expect(page.locator("#detail")).toBeVisible();
  await ready(page);
  await capture(page.locator(".workspace"), "report-detail");
  await page.locator("#close-detail").click();
  await page.locator("#report").click();
  await capture(page.locator("#report-dialog"), "report-form");
  await page.locator("#report-dialog .close").click();

  await page.getByLabel("Choose city").selectOption("sea");
  await page.locator("#cases-toggle").click();
  await expect(page.locator("#layer-filters")).toBeVisible();
  await page.locator("#sea-events-toggle").click();
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']").first(),
  ).toHaveAttribute("stroke", "#e87943");
  await ready(page);
  await expect(page.locator("#toast")).not.toHaveClass(/show/, {
    timeout: 7000,
  });
  await capture(page, "seattle", true);
  await page.locator(".permit-expand").click();
  await capture(page.locator("#permit-panel"), "seattle-explorer");
  await page.getByLabel("Choose city").selectOption("sf");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.querySelector(".personal-bar").scrollLeft = 0;
    window.scrollTo(0, 0);
  });
  await ready(page);
  await capture(page, "mobile");
  if (errors.length) throw Error("Browser errors: " + errors.join("; "));
  console.log("Captured " + files.length + " screenshots: " + files.join(", "));
} finally {
  await browser.close();
}
