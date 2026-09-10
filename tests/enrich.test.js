import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createEnrichRouter } from "../server/enrich.js";
import {
  weatherLabel,
  dockColor,
  caseColor,
  alertColor,
  caseCategory,
} from "../src/enrich.js";

const GBFS_INFO = {
  data: {
    stations: [
      {
        station_id: "s1",
        name: "Market St Station",
        lat: 37.77,
        lon: -122.41,
      },
      {
        station_id: "s2",
        name: "San Jose Far Away",
        lat: 37.33,
        lon: -121.9,
      },
    ],
  },
};
const GBFS_STATUS = {
  data: {
    stations: [
      {
        station_id: "s1",
        num_bikes_available: 6,
        num_docks_available: 9,
        num_ebikes_available: 2,
      },
    ],
  },
};
const ROWS_311 = [
  {
    service_request_id: "1",
    service_name: "Graffiti",
    service_subtype: "",
    status_description: "Open",
    address: "123 MAIN ST",
    requested_datetime: "2026-09-08T10:00:00.000",
    lat: "37.77",
    long: "-122.42",
  },
  {
    service_request_id: "2",
    service_name: "Pothole",
    status_description: "Closed",
    address: "",
    requested_datetime: "2026-09-07T10:00:00.000",
    point: { coordinates: [-122.43, 37.76] },
  },
  {
    service_request_id: "3",
    service_name: "No location",
    status_description: "Open",
    requested_datetime: "2026-09-07T10:00:00.000",
  },
];
const METEO = {
  current: {
    time: "2026-09-10T03:45",
    temperature_2m: 18.4,
    weather_code: 2,
    wind_speed_10m: 12.5,
  },
};

function mockFetchImpl(responses, calls) {
  return async (url) => {
    calls.push(url);
    const body = responses(url);
    if (body instanceof Error) throw body;
    return { ok: true, json: async () => body };
  };
}

async function fixture(t, fetchImpl) {
  const app = express();
  app.use("/api/enrich", createEnrichRouter({ fetchImpl }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/api/enrich`;
}

const gbfs = (url) =>
  url.includes("station_information") ? GBFS_INFO : GBFS_STATUS;

test("bikeshare proxy joins GBFS feeds, keeps SF stations, and caches", async (t) => {
  const calls = [];
  const base = await fixture(
    t,
    mockFetchImpl(
      (url) => (url.includes("open-meteo") ? METEO : gbfs(url)),
      calls,
    ),
  );
  const first = await (await fetch(base + "/bikeshare")).json();
  assert.equal(first.available, true);
  assert.equal(first.stations.length, 1);
  assert.deepEqual(first.stations[0], {
    id: "s1",
    name: "Market St Station",
    lat: 37.77,
    lng: -122.41,
    bikes: 6,
    docks: 9,
    ebikes: 2,
  });
  const before = calls.length;
  const second = await (await fetch(base + "/bikeshare")).json();
  assert.equal(second.stations.length, 1);
  assert.equal(
    calls.length,
    before,
    "second call is served from the 60s cache",
  );
});

test("311 proxy projects recent cases and skips records without coordinates", async (t) => {
  const calls = [];
  const base = await fixture(
    t,
    mockFetchImpl(() => ROWS_311, calls),
  );
  const data = await (await fetch(base + "/cases311")).json();
  assert.equal(data.available, true);
  assert.equal(data.cases.length, 2);
  assert.equal(data.cases[0].type, "Graffiti");
  assert.equal(data.cases[0].lat, 37.77);
  assert.equal(data.cases[0].lng, -122.42);
  assert.equal(data.cases[1].lat, 37.76);
  assert.ok(!("source" in data.cases[0]), "only projected fields are returned");
});

test("weather proxy projects the current conditions", async (t) => {
  const base = await fixture(
    t,
    mockFetchImpl(() => METEO, []),
  );
  const data = await (await fetch(base + "/weather")).json();
  assert.deepEqual(data, {
    available: true,
    updatedAt: data.updatedAt,
    tempC: 18.4,
    code: 2,
    windKph: 12.5,
    time: "2026-09-10T03:45",
  });
  assert.ok(Date.now() - data.updatedAt < 5000);
});

test("failed or malformed upstreams answer { available: false }", async (t) => {
  const failing = await fixture(
    t,
    mockFetchImpl(() => new Error("boom"), []),
  );
  for (const path of ["/bikeshare", "/cases311", "/weather"]) {
    const data = await (await fetch(failing + path)).json();
    assert.deepEqual(data, { available: false });
  }
  const badWeather = await fixture(
    t,
    mockFetchImpl(() => ({ current: null }), []),
  );
  assert.deepEqual(await (await fetch(badWeather + "/weather")).json(), {
    available: false,
  });
  const unknown = await fetch(failing + "/nope");
  assert.equal(unknown.status, 404);
});

test("airquality proxy projects AQI with EPA labels", async (t) => {
  const AQ = {
    current: {
      time: "2026-09-10T04:00",
      us_aqi: 63,
      pm2_5: 12.7,
    },
  };
  const base = await fixture(
    t,
    mockFetchImpl(() => AQ, []),
  );
  const data = await (await fetch(base + "/airquality")).json();
  assert.deepEqual(data, {
    available: true,
    updatedAt: data.updatedAt,
    aqi: 63,
    label: "Moderate",
    pm25: 12.7,
    time: "2026-09-10T04:00",
  });
});

test("alerts proxy projects NWS alerts with small shapes", async (t) => {
  const NWS = {
    features: [
      {
        id: "alert-1",
        geometry: null,
        properties: {
          id: "urn:oid:1",
          event: "Heat Advisory",
          severity: "Moderate",
          headline: "Hot temperatures expected",
          description: "x".repeat(500),
          expires: "2026-09-10T22:00:00-07:00",
        },
      },
      {
        properties: { event: "" }, // skipped: no event name
      },
    ],
  };
  const base = await fixture(
    t,
    mockFetchImpl(() => NWS, []),
  );
  const data = await (await fetch(base + "/alerts")).json();
  assert.equal(data.available, true);
  assert.equal(data.alerts.length, 1);
  assert.equal(data.alerts[0].event, "Heat Advisory");
  assert.equal(data.alerts[0].severity, "Moderate");
  assert.equal(data.alerts[0].description.length, 300);
  assert.equal(data.alerts[0].polygon, null);
});

test("alerts proxy forwards the NWS User-Agent header", async (t) => {
  let seenHeaders = null;
  const fetchImpl = async (url, init) => {
    seenHeaders = init?.headers;
    return { ok: true, json: async () => ({ features: [] }) };
  };
  const base = await fixture(t, fetchImpl);
  await (await fetch(base + "/alerts")).json();
  assert.match(String(seenHeaders?.["User-Agent"] || ""), /CityFrictionMap/);
});

test("failed airquality/alerts upstreams answer { available: false }", async (t) => {
  const failing = await fixture(
    t,
    mockFetchImpl(() => new Error("boom"), []),
  );
  for (const path of ["/airquality", "/alerts"]) {
    const data = await (await fetch(failing + path)).json();
    assert.deepEqual(data, { available: false });
  }
  const badAqi = await fixture(
    t,
    mockFetchImpl(() => ({ current: {} }), []),
  );
  assert.deepEqual(await (await fetch(badAqi + "/airquality")).json(), {
    available: false,
  });
});

test("gamification profile endpoint validates the visitor id", async (t) => {
  const { createApi } = await import("../server/api.js");
  const { createStore } = await import("../server/store.js");
  const app = express();
  app.use("/api", createApi(createStore(":memory:", false)));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const bad = await fetch(base + "/gamification/me");
  assert.equal(bad.status, 400);
  const good = await (
    await fetch(base + "/gamification/me", {
      headers: { "X-Visitor-Id": "profile-visitor-01" },
    })
  ).json();
  assert.equal(good.xp, 0);
  assert.equal(good.level.name, "Newcomer");
  assert.equal(good.badges.length, 8);
  assert.equal(good.weeklyChallenge.goal, 5);
});

test("enrichment responses are not cached by browsers", async (t) => {
  const base = await fixture(
    t,
    mockFetchImpl(() => METEO, []),
  );
  const res = await fetch(base + "/weather");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("weatherLabel maps WMO codes to short labels", () => {
  assert.equal(weatherLabel(0), "clear");
  assert.equal(weatherLabel(2), "partly cloudy");
  assert.equal(weatherLabel(45), "fog");
  assert.equal(weatherLabel(63), "rain");
  assert.equal(weatherLabel(95), "thunderstorm");
  assert.equal(weatherLabel(999), "—");
});

test("dockColor reflects open-dock availability", () => {
  assert.equal(dockColor({ docks: 0 }), "#c0392b");
  assert.equal(dockColor({ docks: 2 }), "#d4a017");
  assert.equal(dockColor({ docks: 9 }), "#2e7d32");
});

test("caseColor highlights open 311 cases", () => {
  assert.equal(caseColor("Open"), "#c26a1b");
  assert.equal(caseColor("Closed"), "#8a967d");
});

test("alertColor reflects NWS severity", () => {
  assert.equal(alertColor("Extreme"), "#a02020");
  assert.equal(alertColor("Severe"), "#c0392b");
  assert.equal(alertColor("Moderate"), "#d4a017");
  assert.equal(alertColor("Minor"), "#3979a0");
  assert.equal(alertColor("Unknown"), "#3979a0");
});

test("caseCategory maps 311 types to friction categories", () => {
  assert.equal(caseCategory("Loud Music / Noise"), "noise");
  assert.equal(caseCategory("Abandoned Bicycle"), "bikes");
  assert.equal(caseCategory("Blocked Public Toilet"), "restroom");
  assert.equal(caseCategory("Pothole"), "access");
  assert.equal(caseCategory(""), "access");
});
