import express from "express";
import { cityById, DEFAULT_CITY } from "./cities.js";
import { distance } from "./domain.js";

export const PLACES = {
  sf: {
    station: "9414290",
    name: "San Francisco",
    zone: "America/Los_Angeles",
  },
  sea: { station: "9447130", name: "Seattle", zone: "America/Los_Angeles" },
  nyc: { station: "8518750", name: "The Battery", zone: "America/New_York" },
};
const SOURCES = {
  earthquakes: {
    name: "USGS",
    url: "https://earthquake.usgs.gov/earthquakes/map/",
  },
  tides: { name: "NOAA CO-OPS", url: "https://tidesandcurrents.noaa.gov/" },
  daylight: { name: "Sunrise-Sunset.org", url: "https://sunrise-sunset.org/" },
};
const validNumber = (v) => typeof v === "number" && Number.isFinite(v);
const iso = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;

export function projectQuakes(payload, city) {
  if (!Array.isArray(payload?.features)) throw Error("Invalid earthquake feed");
  let validRecords = 0;
  const events = payload.features
    .flatMap((f) => {
      const [lng, lat, depth] = Array.isArray(f?.geometry?.coordinates)
        ? f.geometry.coordinates
        : [];
      const p = f?.properties || {};
      if (
        !validNumber(lat) ||
        !validNumber(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180 ||
        !validNumber(p.mag) ||
        !validNumber(p.time) ||
        !Number.isFinite(new Date(p.time).getTime())
      )
        return [];
      validRecords++;
      const km =
        distance(
          { lat: city.weather.lat, lng: city.weather.lng },
          { lat, lng },
        ) / 1000;
      if (km > 200 || p.mag < 2.5) return [];
      return [
        {
          id: String(f.id),
          lat,
          lng,
          depthKm: validNumber(depth) ? depth : null,
          magnitude: p.mag,
          place: String(p.place || "Regional earthquake").slice(0, 180),
          time: new Date(p.time).toISOString(),
          distanceKm: Math.round(km),
          url:
            typeof p.url === "string" &&
            p.url.startsWith("https://earthquake.usgs.gov/")
              ? p.url
              : SOURCES.earthquakes.url,
        },
      ];
    })
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, 40);
  if (payload.features.length && !validRecords)
    throw Error("Invalid earthquake records");
  return { events, radiusKm: 200, minMagnitude: 2.5, periodDays: 7 };
}

export function projectTides(payload, place) {
  if (!Array.isArray(payload?.predictions))
    throw Error("Invalid tide predictions");
  const predictions = payload.predictions
    .flatMap((p) => {
      const time =
        typeof p?.t === "string" ? iso(`${p.t.replace(" ", "T")}:00Z`) : null;
      if (
        !time ||
        !["H", "L"].includes(p.type) ||
        p.v === null ||
        p.v === "" ||
        !Number.isFinite(Number(p.v))
      )
        return [];
      return [{ time, heightM: Number(p.v), type: p.type }];
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (payload.predictions.length && !predictions.length)
    throw Error("Invalid tide records");
  return {
    predictions,
    station: place.station,
    stationName: place.name,
    datum: "MLLW",
    units: "meters",
  };
}

export function projectDaylight(payload) {
  const sunrise = iso(payload?.sunrise),
    sunset = iso(payload?.sunset);
  if (!sunrise || !sunset || !/^\d{4}-\d{2}-\d{2}$/.test(payload?.date || ""))
    throw Error("Invalid daylight data");
  return {
    date: payload.date,
    sunrise,
    sunset,
    dawn: iso(payload.civil_twilight_begin),
    dusk: iso(payload.civil_twilight_end),
    dayLengthSeconds: validNumber(payload.day_length)
      ? payload.day_length
      : null,
  };
}

export function createContextRouter({
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  const router = express.Router(),
    cache = new Map(),
    pending = new Map();
  async function cached(key, ttl, fn) {
    for (const [k, v] of cache) if (v.expires <= now()) cache.delete(k);
    if (cache.has(key)) return cache.get(key).value;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      try {
        const value = await fn();
        cache.set(key, {
          value,
          expires: now() + (value?.available === false ? 60000 : ttl),
        });
        return value;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, work);
    return work;
  }
  async function json(url) {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw Error("Upstream unavailable");
    return res.json();
  }
  router.get("/:kind", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const kind = req.params.kind,
      city = cityById(req.query.city ?? DEFAULT_CITY);
    if (!Object.hasOwn(SOURCES, kind))
      return res.status(404).json({ error: "Unknown source." });
    if (!city) return res.status(400).json({ error: "Unknown city." });
    const place = PLACES[city.id];
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: place.zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now()));
    const body = await cached(
      `${kind}:${city.id}:${date}`,
      kind === "earthquakes" ? 300000 : 1800000,
      async () => {
        try {
          let result;
          if (kind === "earthquakes") {
            const feed = await cached("usgs-feed", 300000, () =>
              json(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson",
              ),
            );
            result = projectQuakes(feed, city);
          } else if (kind === "tides") {
            const begin = new Date(now())
              .toISOString()
              .slice(0, 10)
              .replaceAll("-", "");
            result = projectTides(
              await json(
                `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=CityFrictionMap&begin_date=${begin}&range=48&datum=MLLW&station=${place.station}&time_zone=gmt&units=metric&interval=hilo&format=json`,
              ),
              place,
            );
          } else {
            result = projectDaylight(
              await json(
                `https://api.sunrise-sunset.org/v2?lat=${city.weather.lat}&lng=${city.weather.lng}&date=${date}`,
              ),
            );
          }
          return {
            available: true,
            city: city.id,
            timeZone: place.zone,
            fetchedAt: new Date(now()).toISOString(),
            source: SOURCES[kind],
            ...result,
          };
        } catch {
          return {
            available: false,
            city: city.id,
            source: SOURCES[kind],
            message: "Source temporarily unavailable.",
          };
        }
      },
    );
    res.json(body);
  });
  return router;
}
