import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("https://tile.openstreetmap.org/**", (r) => r.abort());
});

async function mockSources(
  page,
  { failTides = false, emptyQuakes = false } = {},
) {
  await page.route("**/api/context/*", async (route) => {
    const url = new URL(route.request().url()),
      kind = url.pathname.split("/").pop(),
      city = url.searchParams.get("city"),
      stamp = Date.now();
    const sources = {
      daylight: {
        name: "Sunrise-Sunset.org",
        url: "https://sunrise-sunset.org/",
      },
      tides: { name: "NOAA CO-OPS", url: "https://tidesandcurrents.noaa.gov/" },
      earthquakes: {
        name: "USGS",
        url: "https://earthquake.usgs.gov/earthquakes/map/",
      },
    };
    const data = {
      available: !(failTides && kind === "tides"),
      city,
      timeZone: city === "nyc" ? "America/New_York" : "America/Los_Angeles",
      fetchedAt: new Date(stamp).toISOString(),
      source: sources[kind],
    };
    if (kind === "daylight")
      Object.assign(data, {
        date: "2026-09-28",
        sunrise: "2026-09-28T14:02:50Z",
        sunset: "2026-09-29T01:57:02Z",
        dusk: "2026-09-29T02:23:12Z",
      });
    if (kind === "tides")
      Object.assign(data, {
        station: "9414290",
        stationName: "San Francisco",
        predictions: [
          {
            type: "H",
            time: new Date(stamp + 3600000).toISOString(),
            heightM: 1.7,
          },
        ],
      });
    if (kind === "earthquakes")
      data.events = emptyQuakes
        ? []
        : [
            {
              id: "test",
              magnitude: 3,
              lat: 37.78,
              lng: -122.4,
              place: "<b>Catalog location</b>",
              distanceKm: 2,
              time: new Date(stamp - 3600000).toISOString(),
              url: "https://earthquake.usgs.gov/earthquakes/eventpage/test",
            },
          ];
    await route.fulfill({ json: data });
  });
}

test("live context is on demand, attributes sources, toggles markers and switches city", async ({
  page,
}) => {
  await mockSources(page);
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/context/")) requests.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#live-context")).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.locator("#live-context").click();
  const dialog = page.getByRole("dialog", { name: "Live context" });
  await expect(dialog.locator(".context-card")).toHaveCount(3);
  for (const name of ["Sunrise-Sunset.org", "NOAA CO-OPS", "USGS"])
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(dialog).toContainText("City-local time");
  await expect(dialog).toContainText("1.70 m MLLW");
  await expect(dialog).toContainText(
    "not observed water levels or flood alerts",
  );
  await expect(dialog.locator('[data-source="earthquakes"] b')).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Show on map", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const markers = page.locator('path[stroke="#c75943"]');
  await expect(markers).toHaveCount(1);
  await page.locator("#live-context").click();
  await dialog
    .getByRole("button", { name: "Hide from map", exact: true })
    .click();
  await expect(markers).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Show on map", exact: true })
    .click();
  await page.getByLabel("Choose city").selectOption("nyc");
  await expect(markers).toHaveCount(0);
  await page.locator("#live-context").click();
  await expect(dialog.locator(".context-city")).toHaveText("New York");
  await expect(
    dialog.getByRole("link", { name: "USGS", exact: true }),
  ).toBeVisible();
  expect(requests.filter((u) => u.includes("city=nyc"))).toHaveLength(3);
});

test("empty results and unavailable sources differ, with a working retry", async ({
  page,
}) => {
  await mockSources(page, { failTides: true, emptyQuakes: true });
  await page.goto("/");
  await page.locator("#live-context").click();
  await expect(page.locator('[data-source="tides"]')).toContainText(
    "Source temporarily unavailable.",
  );
  await expect(page.locator('[data-source="earthquakes"]')).toContainText(
    "No M2.5+ events within 200 km in the last 7 days.",
  );
  await expect(page.locator('[data-source="daylight"]')).toContainText(
    "Sunrise",
  );
  await page.unroute("**/api/context/*");
  await mockSources(page);
  await page.locator("#context-refresh").click();
  await expect(page.locator('[data-source="tides"]')).toContainText(
    "1.70 m MLLW",
  );
  await expect(page.locator('[data-source="tides"]')).not.toContainText(
    "unavailable",
  );
});

test("live context fits mobile dark mode with blue accents and restores keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSources(page);
  await page.goto("/");
  await page.locator("#personalize").click();
  await page.locator('[data-color="blue"]').click();
  await page.locator("#personal-dialog .close").click();
  await page.locator("#theme-toggle").click();
  await page.locator("#live-context").click();
  await expect(page.locator('[data-source="earthquakes"]')).toContainText(
    "Catalog location",
  );
  expect(
    await page
      .locator("#context-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const box = await page.locator("#context-dialog").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(page.locator("#context-dialog")).not.toBeVisible();
  await expect(page.locator("#live-context")).toBeFocused();
});

test("network errors and malformed responses show unavailable instead of broken or stale cards", async ({
  page,
}) => {
  await mockSources(page);
  await page.goto("/");
  await page.locator("#live-context").click();
  await expect(page.locator('[data-source="tides"]')).toContainText(
    "1.70 m MLLW",
  );
  await page.unroute("**/api/context/*");
  await page.route("**/api/context/*", (route) =>
    route.request().url().includes("tides")
      ? route.fulfill({ json: { available: true } })
      : route.abort(),
  );
  await page.locator("#context-refresh").click();
  await expect(
    page.locator(".context-card", {
      hasText: "Source temporarily unavailable.",
    }),
  ).toHaveCount(3);
  await expect(page.locator("#context-dialog")).not.toContainText(
    "1.70 m MLLW",
  );
});
