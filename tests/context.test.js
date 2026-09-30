import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createContextRouter,
  projectQuakes,
  projectTides,
  projectDaylight,
  PLACES,
} from "../server/context.js";
import { cityById } from "../server/cities.js";

const NOW = Date.parse("2026-09-29T02:00:00Z");
const SUN = {
  date: "2026-09-28",
  sunrise: "2026-09-28T07:02:50-07:00",
  sunset: "2026-09-28T18:57:02-07:00",
  civil_twilight_end: "2026-09-28T19:23:12-07:00",
  day_length: 42852,
};
const TIDES = {
  predictions: [
    { t: "2026-09-29 08:10", v: "1.71", type: "H" },
    { t: "2026-09-29 02:18", v: "-0.009", type: "L" },
  ],
};
const quake = (id, coordinates = [-122.42, 37.77, 7], overrides = {}) => ({
  id,
  geometry: { coordinates },
  properties: {
    mag: 3.1,
    time: NOW - 1000,
    place: "Near San Francisco",
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/example",
    ...overrides,
  },
});
const response = (body) => ({ ok: true, json: async () => body });
const read = async (url) => (await fetch(url)).json();

async function fixture(t, fetchImpl, now = () => NOW) {
  const app = express();
  app.use("/api/context", createContextRouter({ fetchImpl, now }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/context`;
}

test("earthquake projection filters radius and magnitude, skips malformed points and sorts newest first", () => {
  const data = projectQuakes(
    {
      features: [
        quake("older", undefined, { time: NOW - 5000 }),
        quake("far", [-74, 40.71, 5]),
        quake("small", undefined, { mag: 2.4 }),
        quake("newer"),
        quake("invalid", [null, 37, 1]),
        quake("time", undefined, { time: 1e30 }),
        null,
        { geometry: { coordinates: {} } },
      ],
    },
    cityById("sf"),
  );
  assert.deepEqual(
    data.events.map((e) => e.id),
    ["newer", "older"],
  );
  assert.equal(data.events[0].time, new Date(NOW - 1000).toISOString());
  assert.equal(data.events[0].distanceKm, 1);
  assert.equal(data.radiusKm, 200);
  assert.equal(data.minMagnitude, 2.5);
  assert.throws(() => projectQuakes({ features: [null] }, cityById("sf")));
});

test("earthquake output is bounded and allows only USGS event links", () => {
  const data = projectQuakes(
    {
      features: Array.from({ length: 60 }, (_, i) =>
        quake(i, undefined, {
          place: "x".repeat(500),
          url: "javascript:alert(1)",
        }),
      ),
    },
    cityById("sf"),
  );
  assert.equal(data.events.length, 40);
  assert.equal(data.events[0].place.length, 180);
  assert.equal(
    data.events[0].url,
    "https://earthquake.usgs.gov/earthquakes/map/",
  );
});

test("tide projection interprets NOAA GMT times as UTC and preserves negative heights", () => {
  const data = projectTides(TIDES, PLACES.sf);
  assert.deepEqual(data.predictions, [
    { time: "2026-09-29T02:18:00.000Z", heightM: -0.009, type: "L" },
    { time: "2026-09-29T08:10:00.000Z", heightM: 1.71, type: "H" },
  ]);
  assert.equal(data.datum, "MLLW");
  assert.equal(data.station, "9414290");
  assert.equal(
    projectTides({ predictions: [] }, PLACES.sf).predictions.length,
    0,
  );
  assert.throws(() =>
    projectTides(
      { predictions: [null, { t: "bad", v: null, type: "H" }] },
      PLACES.sf,
    ),
  );
});

test("daylight projection converts timezone offsets and rejects malformed upstreams", () => {
  assert.deepEqual(projectDaylight(SUN), {
    date: "2026-09-28",
    sunrise: "2026-09-28T14:02:50.000Z",
    sunset: "2026-09-29T01:57:02.000Z",
    dawn: null,
    dusk: "2026-09-29T02:23:12.000Z",
    dayLengthSeconds: 42852,
  });
  assert.throws(() => projectDaylight({ ...SUN, sunrise: "invalid" }));
  assert.throws(() => projectQuakes({}, cityById("sf")));
  assert.throws(() =>
    projectTides({ error: { message: "bad station" } }, PLACES.sf),
  );
});

test("context routes validate source and city without calling upstream", async (t) => {
  let calls = 0;
  const base = await fixture(t, async () => {
    calls++;
    return response(SUN);
  });
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/constructor`)).status, 404);
  for (const query of ["city=nope", "city=sf&city=nyc", "city="])
    assert.equal((await fetch(`${base}/tides?${query}`)).status, 400);
  assert.equal(calls, 0);
});

test("daylight uses the city's local date, caches responses and sends bounded request options", async (t) => {
  let stamp = NOW;
  const calls = [];
  const base = await fixture(
    t,
    async (url, options) => {
      calls.push({ url, options });
      return response(SUN);
    },
    () => stamp,
  );
  const res = await fetch(`${base}/daylight`),
    data = await res.json();
  assert.equal(data.available, true);
  assert.equal(data.city, "sf");
  assert.equal(data.timeZone, "America/Los_Angeles");
  assert.equal(data.fetchedAt, new Date(NOW).toISOString());
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(new URL(calls[0].url).searchParams.get("date"), "2026-09-28");
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  await read(`${base}/daylight`);
  assert.equal(calls.length, 1);
  stamp += 1800001;
  await read(`${base}/daylight`);
  assert.equal(calls.length, 2);
});

test("daylight cache rolls over at local midnight even within its TTL", async (t) => {
  let stamp = Date.parse("2026-09-29T06:59:00Z");
  const dates = [];
  const base = await fixture(
    t,
    async (url) => {
      dates.push(new URL(url).searchParams.get("date"));
      return response(SUN);
    },
    () => stamp,
  );
  await read(`${base}/daylight?city=sf`);
  stamp += 120000;
  await read(`${base}/daylight?city=sf`);
  assert.deepEqual(dates, ["2026-09-28", "2026-09-29"]);
});

test("NOAA requests use the right city station, GMT, metric units and a 48-hour prediction window", async (t) => {
  const calls = [];
  const base = await fixture(t, async (url) => {
    calls.push(new URL(url));
    return response(TIDES);
  });
  for (const [city, place] of Object.entries(PLACES)) {
    const data = await read(`${base}/tides?city=${city}`);
    assert.equal(data.station, place.station);
    assert.equal(data.timeZone, place.zone);
  }
  assert.deepEqual(
    calls.map((u) => u.searchParams.get("station")),
    ["9414290", "9447130", "8518750"],
  );
  for (const u of calls)
    for (const [key, value] of Object.entries({
      begin_date: "20260929",
      range: "48",
      time_zone: "gmt",
      units: "metric",
      interval: "hilo",
    }))
      assert.equal(u.searchParams.get(key), value);
});

test("one USGS download is shared across cities and concurrent requests", async (t) => {
  let calls = 0;
  const base = await fixture(t, async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return response({
      features: [quake("sf"), quake("nyc", [-74.006, 40.7128, 4])],
    });
  });
  const [sf, same, nyc] = await Promise.all([
    read(`${base}/earthquakes?city=sf`),
    read(`${base}/earthquakes?city=sf`),
    read(`${base}/earthquakes?city=nyc`),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(sf, same);
  assert.deepEqual(
    sf.events.map((e) => e.id),
    ["sf"],
  );
  assert.deepEqual(
    nyc.events.map((e) => e.id),
    ["nyc"],
  );
});

test("empty catalog is available; network failures, non-200s and malformed feeds are unavailable", async (t) => {
  const empty = await fixture(t, async () => response({ features: [] }));
  const data = await read(`${empty}/earthquakes`);
  assert.equal(data.available, true);
  assert.deepEqual(data.events, []);
  for (const impl of [
    async () => {
      throw Error("network");
    },
    async () => ({ ok: false }),
    async () => response({ unexpected: true }),
  ]) {
    const base = await fixture(t, impl);
    for (const kind of ["earthquakes", "tides", "daylight"]) {
      const failed = await read(`${base}/${kind}`);
      assert.equal(failed.available, false);
      assert.equal(failed.city, "sf");
      assert.match(failed.source.url, /^https:\/\//);
      assert.ok(!("events" in failed));
    }
  }
});

test("failed source is retried after one minute, without waiting for its normal cache TTL", async (t) => {
  let calls = 0,
    stamp = NOW;
  const base = await fixture(
    t,
    async () => {
      calls++;
      if (calls === 1) throw Error("offline");
      return response(SUN);
    },
    () => stamp,
  );
  assert.equal((await read(`${base}/daylight`)).available, false);
  assert.equal((await read(`${base}/daylight`)).available, false);
  assert.equal(calls, 1);
  stamp += 60001;
  assert.equal((await read(`${base}/daylight`)).available, true);
  assert.equal(calls, 2);
});
