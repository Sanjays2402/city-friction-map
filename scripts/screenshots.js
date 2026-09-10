import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] || "http://127.0.0.1:3000";
await mkdir("docs/screenshots", { recursive: true });
// CI installs the Playwright browser bundle; local runs can point at a
// system Chromium with SCREENSHOT_CHROME=/path/to/chrome.
// NOTE: if the capture browser has no public-internet egress, point the
// built bundle at a local tile cache first (dist/ is gitignored, so the
// shipped app always uses tile.openstreetmap.org directly).
const launchOptions = {
  args: ["--disable-dev-shm-usage"],
  ...(process.env.SCREENSHOT_CHROME
    ? { executablePath: process.env.SCREENSHOT_CHROME }
    : {}),
};
const browser = await chromium.launch(launchOptions);

async function settle(page, ms = 1200) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(base);
  await page.locator(".report-card").first().waitFor();
  await settle(page, 1500);

  // 1. Desktop overview with the current toolbar.
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });

  // 2. Enrichment layers: bike docks + 311 cases on.
  await page.locator("#bikes-toggle").click();
  await page.locator("#cases-toggle").click();
  await settle(page, 2500);
  await page.screenshot({
    path: "docs/screenshots/layers.png",
    fullPage: true,
  });
  await page.locator("#bikes-toggle").click();
  await page.locator("#cases-toggle").click();

  // 3. Trip check with a two-stop route drawn on the map.
  await page.locator("#trip-toggle").click();
  await page.waitForTimeout(500);
  const mapBox = await page.locator("#map").boundingBox();
  await page.mouse.click(
    mapBox.x + mapBox.width * 0.35,
    mapBox.y + mapBox.height * 0.35,
  );
  await page.waitForTimeout(300);
  await page.mouse.click(
    mapBox.x + mapBox.width * 0.65,
    mapBox.y + mapBox.height * 0.62,
  );
  await settle(page, 800);
  await page.screenshot({ path: "docs/screenshots/trip.png", fullPage: true });
  await page.locator("#trip-toggle").click();

  // 4. Trends dashboard dialog.
  await page.locator("#trends").click();
  await page.locator("#trends-dialog").waitFor();
  await settle(page, 1200);
  await page.screenshot({
    path: "docs/screenshots/trends.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 5. Report detail panel.
  await page.locator(".report-card").first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "docs/screenshots/report-detail.png",
    fullPage: true,
  });
  await page.locator("#close-detail").click();

  // 6. Report form dialog.
  await page.locator("#report").click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "docs/screenshots/report-form.png",
    fullPage: true,
  });
  await page.locator("#report-dialog .close").click();

  // 7. Gamification profile: seed two reports as this visitor first so the
  // profile shows real XP, a badge, and a streak.
  const visitor = await page.evaluate(() =>
    localStorage.getItem("friction-visitor"),
  );
  for (const body of [
    {
      category: "queue",
      title: "Screenshot seed queue",
      location: "Market St",
      description: "seeded for screenshots",
      lat: 37.7749,
      lng: -122.4194,
      severity: 2,
    },
    {
      category: "noise",
      title: "Screenshot seed noise",
      location: "Mission St",
      description: "seeded for screenshots",
      lat: 37.7599,
      lng: -122.4148,
      severity: 1,
    },
  ]) {
    await fetch(`${base}/api/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": visitor,
      },
      body: JSON.stringify(body),
    });
  }
  await page.reload();
  await page.locator(".report-card").first().waitFor();
  await settle(page, 1000);
  await page.locator("#you-chip").click();
  await page.locator("#profile-dialog").waitFor();
  await settle(page, 800);
  await page.screenshot({
    path: "docs/screenshots/gamify.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");

  // 8. Mobile overview.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator(".report-card").first().waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });

  console.log("Captured eight screenshots in docs/screenshots.");
} finally {
  await browser.close();
}
