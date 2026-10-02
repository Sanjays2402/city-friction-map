import { test, expect } from "@playwright/test";

test("Seattle map exposes civic requests and street permits only in Seattle", async ({
  page,
}) => {
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
            start: "2026-10-01",
            end: "2026-10-31",
            schedule: "mon 8 AM–5 PM",
            path: [
              [47.61, -122.33],
              [47.62, -122.34],
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#sea-events-toggle")).toBeHidden();
  await page.getByLabel("Choose city").selectOption("sea");
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
  await page.getByLabel("Choose city").selectOption("sf");
  await expect(page.locator("#sea-events-toggle")).toBeHidden();
  await expect(
    page.locator(".leaflet-overlay-pane path[stroke='#e87943']"),
  ).toHaveCount(0);
});
