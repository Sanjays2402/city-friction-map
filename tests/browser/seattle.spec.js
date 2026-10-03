import { test, expect } from "@playwright/test";
import { seattleToday } from "../../src/permit-windows.js";

test("Seattle map exposes civic requests and street permits only in Seattle", async ({
  page,
}) => {
  const nextWeekday =
    (new Date(`${seattleToday()}T12:00:00Z`).getUTCDay() + 1) % 7;
  const tomorrow = new Date(`${seattleToday()}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/enrich/cases311?city=sea", (route) =>
    route.fulfill({
      json: {
        available: true,
        cases: [
          {
            id: "SEA-1",
            type: "Pothole",
            status: "Open",
            address: "Pine St",
            lat: 47.61,
            lng: -122.33,
            opened: "2026-10-01",
          },
        ],
      },
    }),
  );
  await page.route("**/api/enrich/seattle-events?city=sea", (route) =>
    route.fulfill({
      json: {
        available: true,
        events: [
          {
            id: "P1",
            type: "Construction",
            title: "Pike St work",
            street: "Pike St",
            start: "2020-01-01",
            end: "2099-12-31",
            schedule: "mon 8 AM–5 PM",
            days: [nextWeekday],
            path: [
              [47.61, -122.33],
              [47.62, -122.34],
            ],
          },
          {
            id: "P2",
            type: "Festival",
            title: "Future festival",
            street: "Broadway",
            start: "2099-11-01",
            end: "2099-11-30",
            schedule: "sun 10 AM–4 PM",
            days: [0],
            path: [
              [47.62, -122.32],
              [47.63, -122.33],
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#sea-events-toggle")).toBeHidden();
  await page.getByLabel("Choose city").selectOption("sea");
  await expect(page.locator("#summary.is-empty")).toContainText(
    "No community reports in Seattle yet",
  );
  await page.locator("#summary-report").click();
  await expect(page.locator("#report-dialog")).toBeVisible();
  await page.locator("#report-dialog .close").click();
  await expect(page.locator("#sea-events-toggle")).toBeVisible();
  await expect(page.locator("#cases-toggle")).toContainText("Seattle requests");
  await page.locator("#cases-toggle").click();
  await expect(page.locator("#layer-filters")).toContainText("Pothole");
  await page.locator("#sea-events-toggle").click();
  await expect(page.locator("#sea-events-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']"),
  ).toHaveCount(1);
  await expect(page.locator("#permit-panel")).toContainText("1 of 2 segments");
  await expect(page.locator("#permit-details")).toBeHidden();
  const compactHeight = await page
    .locator("#permit-panel")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(compactHeight).toBeLessThan(90);
  await page.locator(".permit-expand").click();
  await expect(page.locator("#permit-details")).toBeVisible();
  await page.locator("#permit-panel .permit-item").first().click();
  await expect(page.locator(".leaflet-popup-content")).toContainText(
    "Pike St work",
  );
  await page.locator("[data-permit-mode='all']").click();
  await expect(page.locator("#permit-panel")).toContainText("2 of 2 segments");
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']"),
  ).toHaveCount(2);
  await page.locator("[data-permit-mode='today']").click();
  await expect(page.locator("#permit-panel")).toContainText("0 of 2 segments");
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']"),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Search Seattle permits" })
    .fill("Pike");
  await page
    .locator(`[data-permit-day='${tomorrow.toISOString().slice(0, 10)}']`)
    .click();
  await expect(page.locator("#permit-panel")).toContainText("1 of 2 segments");
  await page
    .getByRole("searchbox", { name: "Search Seattle permits" })
    .fill("Broadway");
  await expect(page.locator("#permit-panel")).toContainText("0 of 2 segments");
  await page.locator("[data-permit-mode='all']").click();
  await expect(page.locator("#permit-panel")).toContainText("1 of 2 segments");
  await page.locator(".permit-share").click();
  const permitLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(permitLink).searchParams.get("permit")).toBe("P2");
  await page.goto(permitLink);
  await expect(page.getByLabel("Choose city")).toHaveValue("sea");
  await expect(page.locator(".leaflet-popup-content")).toContainText(
    "Future festival",
  );
  await expect(page.locator("#permit-details")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#permit-panel")).toBeVisible();
  const mobileWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(mobileWidth).toBeLessThanOrEqual(390);
  await page.getByLabel("Choose city").selectOption("sf");
  await expect(page.locator("#sea-events-toggle")).toBeHidden();
  await expect(page.locator("#permit-panel")).toBeHidden();
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']"),
  ).toHaveCount(0);
});

test("city-specific links open the intended city and can be copied", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("friction-city", "sf"));
  await page.goto("/?city=sea");
  await expect(page.getByLabel("Choose city")).toHaveValue("sea");
  await page.locator("#city-link").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assertCityUrl(copied, "sea");
  await page.getByLabel("Choose city").selectOption("nyc");
  await expect(page).toHaveURL(/\?city=nyc$/);
  await page.reload();
  await expect(page.getByLabel("Choose city")).toHaveValue("nyc");
});

function assertCityUrl(value, city) {
  const url = new URL(value);
  if (url.pathname !== "/" || url.searchParams.get("city") !== city)
    throw new Error(`Expected a shareable ${city} link, got ${value}`);
}
