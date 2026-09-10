import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] || "http://127.0.0.1:3000";
await mkdir("docs/screenshots", { recursive: true });
// CI installs the Playwright browser bundle; local runs can point at a
// system Chromium with SCREENSHOT_CHROME=/path/to/chrome.
const launchOptions = process.env.SCREENSHOT_CHROME
  ? { executablePath: process.env.SCREENSHOT_CHROME }
  : {};
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(base);
  await page.locator(".report-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: "docs/screenshots/desktop.png",
    fullPage: true,
  });
  await page.locator(".report-card").first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "docs/screenshots/report-detail.png",
    fullPage: true,
  });
  await page.locator("#close-detail").click();
  await page.locator("#report").click();
  await page.screenshot({
    path: "docs/screenshots/report-form.png",
    fullPage: true,
  });
  await page.locator("#report-dialog .close").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator(".report-card").first().waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  console.log("Captured four screenshots in docs/screenshots.");
} finally {
  await browser.close();
}
