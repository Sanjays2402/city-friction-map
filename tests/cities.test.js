import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createStore } from "../server/store.js";
import { createApi } from "../server/api.js";
import { createEnrichRouter } from "../server/enrich.js";
import {
  cityById,
  inCityBounds,
  publicCities,
  DEFAULT_CITY,
} from "../server/cities.js";
import { validateReport, validateAlert } from "../server/domain.js";

const seaReport = {
  city: "sea",
  category: "queue",
  title: "Ferry line is long",
  location: "Colman Dock",
  description: "",
  lat: 47.602,
  lng: -122.339,
  severity: 2,
};

async function fixture(t, seed = false) {
  const store = createStore(":memory:", seed);
  const app = express();
  app.use("/api", createApi(store));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let n = 0;
  return {
    store,
    base,
    visitor: () => `visitor-${String(++n).padStart(4, "0")}-testid`,
    request: (path, body, visitor = "test-visitor-0001") =>
      fetch(base + "/api" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Id": visitor,
        },
        body: JSON.stringify(body),
      }),
    get: (path, visitor = "test-visitor-0001") =>
      fetch(base + "/api" + path, {
        headers: { "X-Visitor-Id": visitor },
      }),
  };
}

test("city registry exposes three cities with map metadata", () => {
  const cities = publicCities();
  assert.equal(cities.length, 3);
  assert.deepEqual(
    cities.map((c) => c.id),
    ["sf", "sea", "nyc"],
  );
  const sea = cityById("sea");
  assert.equal(sea.name, "Seattle");
  assert.deepEqual(sea.center, [47.6062, -122.3321]);
  assert.equal(cityById("nope"), null);
  assert.equal(DEFAULT_CITY, "sf");
  assert.ok(inCityBounds("sea", 47.6062, -122.3321));
  assert.ok(!inCityBounds("sea", 37.7749, -122.4194));
  assert.ok(!inCityBounds("nope", 47.6, -122.33));
});

test("report validation is scoped to the chosen city", () => {
  const ok = validateReport(seaReport);
  assert.equal(ok.city, "sea");
  assert.throws(
    () => validateReport({ ...seaReport, lat: 37.7749, lng: -122.4194 }),
    /Seattle/,
  );
  // Missing city defaults to San Francisco.
  const sf = validateReport({
    ...seaReport,
    city: undefined,
    lat: 37.7749,
    lng: -122.4194,
  });
  assert.equal(sf.city, "sf");
  assert.throws(
    () => validateReport({ ...seaReport, city: "xx" }),
    /Unknown city/,
  );
});

test("alert zone validation accepts a city", () => {
  const zone = validateAlert({
    label: "Downtown",
    lat: 47.602,
    lng: -122.339,
    radiusM: 500,
    city: "sea",
  });
  assert.equal(zone.city, "sea");
  assert.throws(
    () =>
      validateAlert({
        label: "Downtown",
        lat: 37.77,
        lng: -122.42,
        radiusM: 500,
        city: "sea",
      }),
    /Seattle/,
  );
});

test("report listing filters by city", async (t) => {
  const { store } = await fixture(t);
  const a = "a".repeat(20);
  store.create(seaReport, a);
  store.create(
    {
      ...seaReport,
      city: "sf",
      lat: 37.7749,
      lng: -122.4194,
      title: "SF queue",
    },
    a,
  );
  assert.equal(store.list({ city: "sea" }).length, 1);
  assert.equal(store.list({ city: "sf" }).length, 1);
  assert.equal(store.list().length, 2);
  assert.equal(store.list({ city: "sea" })[0].city, "sea");
});

test("new reports inside an alert zone notify the zone owner", async (t) => {
  const { store } = await fixture(t);
  const owner = "o".repeat(20);
  const reporter = "r".repeat(20);
  store.createAlert(owner, {
    label: "Waterfront",
    lat: 47.602,
    lng: -122.339,
    radiusM: 500,
    city: "sea",
  });
  const before = store.listNotifications(owner).unread;
  store.create(seaReport, reporter);
  const after = store.listNotifications(owner);
  assert.equal(after.unread, before + 1);
  assert.equal(after.items[0].type, "alert");
  assert.equal(after.items[0].reportId, store.list({ city: "sea" })[0].id);
  // The reporter is never notified about their own report.
  assert.equal(store.listNotifications(reporter).unread, 0);
  // A far-away report does not notify.
  store.create(
    { ...seaReport, title: "Far away", lat: 47.7, lng: -122.3 },
    "x".repeat(20),
  );
  assert.equal(store.listNotifications(owner).unread, before + 1);
});

test("resolving a report notifies its creator", async (t) => {
  const { store } = await fixture(t);
  const creator = "c".repeat(20);
  const { report } = store.create(seaReport, creator);
  store.vote(report.id, "d".repeat(20), "clear");
  assert.equal(store.listNotifications(creator).unread, 0);
  store.vote(report.id, "e".repeat(20), "clear");
  const notes = store.listNotifications(creator);
  assert.equal(notes.unread, 1);
  assert.equal(notes.items[0].type, "resolved");
});

test("commenting on a report notifies its creator", async (t) => {
  const { store } = await fixture(t);
  const creator = "c".repeat(20);
  const { report } = store.create(seaReport, creator);
  store.addComment(report.id, "f".repeat(20), { body: "Still there at noon." });
  const notes = store.listNotifications(creator);
  assert.equal(notes.unread, 1);
  assert.equal(notes.items[0].type, "comment");
  store.markNotificationsRead(creator);
  assert.equal(store.listNotifications(creator).unread, 0);
});

test("API serves cities, city-filtered reports, and notifications", async (t) => {
  const { get, request, visitor } = await fixture(t);
  const cities = await (await get("/cities")).json();
  assert.equal(cities.length, 3);
  assert.ok(cities.every((c) => c.center && c.bounds));

  const me = visitor();
  const created = await request("/reports", seaReport, me);
  assert.equal(created.status, 201);

  const sea = await (await get("/reports?city=sea", me)).json();
  assert.equal(sea.length, 1);
  const sf = await (await get("/reports?city=sf", me)).json();
  assert.equal(sf.length, 0);
  const bad = await get("/reports?city=nope", me);
  assert.equal(bad.status, 400);

  const notes = await (await get("/notifications", me)).json();
  assert.deepEqual(Object.keys(notes).sort(), ["items", "unread"]);

  const marked = await request("/notifications/read", {}, me);
  assert.equal(marked.status, 200);
  assert.equal((await marked.json()).unread, 0);

  const trends = await (await get("/trends?city=sea", me)).json();
  assert.ok(Array.isArray(trends.days));
  const leaders = await (await get("/contributors?city=sea", me)).json();
  assert.ok(Array.isArray(leaders));
});

test("enrichment endpoints scope to the requested city", async (t) => {
  const seen = [];
  const fakeFetch = async (url) => {
    seen.push(url);
    if (url.includes("open-meteo.com/v1/forecast"))
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 9,
            weather_code: 61,
            wind_speed_10m: 3,
            time: "t",
          },
        }),
      };
    throw new Error("upstream down");
  };
  const app = express();
  app.use("/api/enrich", createEnrichRouter({ fetchImpl: fakeFetch }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/enrich`;

  const sea = await (await fetch(`${base}/weather?city=sea`)).json();
  assert.equal(sea.available, true);
  assert.equal(sea.tempC, 9);
  assert.ok(seen.some((u) => u.includes("latitude=47.6062")));

  // Seattle has no bikeshare feed wired up: graceful unavailable.
  const bikes = await (await fetch(`${base}/bikeshare?city=sea`)).json();
  assert.equal(bikes.available, false);

  // Unknown city falls back to the default city instead of erroring.
  const fallback = await (await fetch(`${base}/weather?city=nope`)).json();
  assert.equal(fallback.available, true);
  assert.ok(seen.some((u) => u.includes("latitude=37.7749")));
});

test("unknown city ids are rejected in report and alert bodies", async (t) => {
  const f = await fixture(t);
  const badReport = await f.request("/reports", { ...seaReport, city: "mars" });
  assert.equal(badReport.status, 400);
  const badAlert = await f.request("/alerts", {
    label: "Home",
    radiusM: 500,
    lat: 47.6062,
    lng: -122.3321,
    city: "mars",
  });
  assert.equal(badAlert.status, 400);
});

test("alert zones only match and notify within their own city", async (t) => {
  const f = await fixture(t);
  const watcher = f.visitor();
  const zoneRes = await f.request(
    "/alerts",
    {
      label: "Downtown",
      radiusM: 2000,
      lat: 47.6062,
      lng: -122.3321,
      city: "sea",
    },
    watcher,
  );
  assert.equal(zoneRes.status, 201);
  const zone = await zoneRes.json();
  assert.equal(zone.city, "sea");

  // A San Francisco report near the same relative spot must not match.
  const other = f.visitor();
  const sfRes = await f.request(
    "/reports",
    { ...seaReport, city: "sf", lat: 37.7749, lng: -122.4194 },
    other,
  );
  assert.equal(sfRes.status, 201);
  let matches = await (await f.get("/alerts/matches", watcher)).json();
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matches.length, 0);
  let notes = (await (await f.get("/notifications", watcher)).json()).items;
  assert.equal(notes.filter((n) => n.type === "alert").length, 0);

  // A Seattle report inside the zone matches and notifies.
  const sf2 = await f.request(
    "/reports",
    { ...seaReport, title: "Blocked bike lane", city: "sea" },
    f.visitor(),
  );
  assert.equal(sf2.status, 201);
  matches = await (await f.get("/alerts/matches", watcher)).json();
  assert.equal(matches[0].matches.length, 1);
  assert.equal(matches[0].matches[0].title, "Blocked bike lane");
  notes = (await (await f.get("/notifications", watcher)).json()).items;
  assert.equal(notes.filter((n) => n.type === "alert").length, 1);
});
