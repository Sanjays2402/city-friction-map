import express from "express";
import { cityById, DEFAULT_CITY } from "./cities.js";

// Server-side proxies for free, keyless public data sources. Each endpoint
// caches the upstream response for 60 seconds, aborts slow upstreams after
// 8 seconds, and answers { available: false } instead of failing the page
// when an upstream is unreachable. Read-only GETs: no visitor id required.
// Pass ?city=<id> to scope all enrichments. Seattle's service requests and
// street events are published by the City of Seattle and refresh daily.
const TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;

const OPEN_METEO = (lat, lng) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m`;
const AIR_QUALITY = (lat, lng) =>
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5`;
const NWS_ALERTS = (lat, lng) =>
  `https://api.weather.gov/alerts/active?point=${lat},${lng}`;
const NWS_UA =
  "CityFrictionMap/1.5.0 (community map demo; contact via GitHub Sanjays2402/city-friction-map)";

const inBounds = (city, lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= city.bounds.lat[0] &&
  lat <= city.bounds.lat[1] &&
  lng >= city.bounds.lng[0] &&
  lng <= city.bounds.lng[1];

function projectBikeshare(city, info, status) {
  const live = new Map();
  for (const s of status?.data?.stations || []) live.set(s.station_id, s);
  const stations = [];
  for (const s of info?.data?.stations || []) {
    const lat = Number(s.lat);
    const lng = Number(s.lon);
    if (!inBounds(city, lat, lng)) continue;
    const st = live.get(s.station_id) || {};
    stations.push({
      id: s.station_id,
      name: s.name,
      lat,
      lng,
      bikes: Number(st.num_bikes_available) || 0,
      docks: Number(st.num_docks_available) || 0,
      ebikes: Number(st.num_ebikes_available) || 0,
    });
    if (stations.length >= 400) break;
  }
  return { available: true, updatedAt: Date.now(), stations };
}

function project311(city, rows) {
  if (!Array.isArray(rows)) throw new Error("bad 311 payload");
  const cases = [];
  for (const r of rows) {
    const sea = city.id === "sea";
    let lat = Number(sea ? r.latitude : r.lat);
    let lng = Number(sea ? r.longitude : r.long);
    const point = sea ? r.latitude_longitude : r.point;
    if (!Number.isFinite(lat) && point?.coordinates) {
      [lng, lat] = point.coordinates.map(Number);
    }
    if (!inBounds(city, lat, lng)) continue;
    cases.push({
      id: sea ? r.servicerequestnumber : r.service_request_id,
      type: (sea ? r.webintakeservicerequests : r.service_name) || "311 case",
      subtype: r.service_subtype || "",
      status: (sea ? r.servicerequeststatusname : r.status_description) || "",
      address: (sea ? r.location : r.address) || "",
      lat,
      lng,
      opened: (sea ? r.createddate : r.requested_datetime) || null,
    });
    if (cases.length >= 100) break;
  }
  return {
    available: true,
    updatedAt: Date.now(),
    cases,
    ...(city.id === "sea"
      ? {
          source:
            "https://data.seattle.gov/City-Administration/Customer-Service-Requests/5ngg-rpne",
          cadence: "daily",
        }
      : {}),
  };
}

export function projectSeattleEvents(city, rows, today) {
  if (!Array.isArray(rows)) throw new Error("bad Seattle street-event payload");
  const events = [];
  for (const r of rows) {
    const coords = r?.line_string?.coordinates;
    if (
      !Array.isArray(coords) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r?.end_date?.slice(0, 10) || "") ||
      r.end_date.slice(0, 10) < today
    )
      continue;
    const path = coords.slice(0, 150).flatMap((point) => {
      if (!Array.isArray(point) || point.length < 2) return [];
      const [lng, lat] = point;
      return inBounds(city, lat, lng) ? [[lat, lng]] : [];
    });
    if (path.length < 2) continue;
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const days = weekdays.flatMap((day, index) => (r[day] ? [index] : []));
    const schedule = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]
      .filter((day) => r[day])
      .map((day) => `${day.slice(0, 3)} ${String(r[day]).slice(0, 40)}`)
      .join(" · ");
    events.push({
      id: String(r.permit_number || events.length),
      type: String(r.permit_type || "Street event").slice(0, 80),
      title: String(
        r.project_name || r.permit_type || "Permitted street event",
      ).slice(0, 160),
      street: String(r.street_on || "").slice(0, 100),
      start: r.start_date?.slice(0, 10) || null,
      end: r.end_date.slice(0, 10),
      schedule,
      days,
      path,
    });
    if (events.length >= 200) break;
  }
  return {
    available: true,
    updatedAt: Date.now(),
    source: "https://data.seattle.gov/Transportation/Street-Closures/ium9-iqtc",
    events,
  };
}

function projectWeather(payload) {
  const current = payload?.current;
  if (!current || !Number.isFinite(Number(current.temperature_2m)))
    throw new Error("bad weather payload");
  return {
    available: true,
    updatedAt: Date.now(),
    tempC: Number(current.temperature_2m),
    code: Number(current.weather_code),
    windKph: Number(current.wind_speed_10m) || 0,
    time: current.time || null,
  };
}

// US EPA AQI breakpoints -> short label.
function aqiLabel(aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

function projectAirQuality(payload) {
  const current = payload?.current;
  const aqi = Number(current?.us_aqi);
  if (!Number.isFinite(aqi)) throw new Error("bad air quality payload");
  return {
    available: true,
    updatedAt: Date.now(),
    aqi: Math.round(aqi),
    label: aqiLabel(aqi),
    pm25: Number(current.pm2_5) || 0,
    time: current.time || null,
  };
}

function projectAlerts(payload) {
  const features = payload?.features;
  if (!Array.isArray(features)) throw new Error("bad alerts payload");
  const alerts = [];
  for (const f of features) {
    const p = f?.properties || {};
    if (!p.event) continue;
    const coords = f?.geometry?.coordinates;
    alerts.push({
      id: p.id || f.id || `${p.event}-${alerts.length}`,
      event: p.event,
      severity: p.severity || "Unknown",
      headline: (p.headline || "").slice(0, 200),
      description: (p.description || "").slice(0, 300),
      instruction: (p.instruction || "").slice(0, 300),
      expires: p.expires || null,
      // NWS zone alerts often carry no polygon; when coordinates exist they
      // render on the map, otherwise the layer shows an area indicator.
      polygon: Array.isArray(coords) ? coords : null,
    });
    if (alerts.length >= 5) break;
  }
  return { available: true, updatedAt: Date.now(), alerts };
}

export function createEnrichRouter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const router = express.Router();
  router.use((_, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const cache = new Map();

  async function cached(key, work) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.body;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let body;
      try {
        body = await work(controller.signal);
      } finally {
        clearTimeout(timer);
      }
      cache.set(key, { at: Date.now(), body });
      return body;
    } catch {
      return { available: false };
    }
  }

  async function getJson(url, signal, headers) {
    const res = await fetchImpl(url, { signal, headers });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return res.json();
  }

  const cityOf = (req) => cityById(req.query.city) || cityById(DEFAULT_CITY);

  router.get("/bikeshare", async (req, res) => {
    const city = cityOf(req);
    if (!city.bikeshare) return res.json({ available: false });
    res.json(
      await cached(`bikeshare:${city.id}`, async (signal) => {
        const [info, status] = await Promise.all([
          getJson(city.bikeshare.info, signal),
          getJson(city.bikeshare.status, signal),
        ]);
        return {
          ...projectBikeshare(city, info, status),
          name: city.bikeshare.name,
        };
      }),
    );
  });

  router.get("/cases311", async (req, res) => {
    const city = cityOf(req);
    if (!city.cases311) return res.json({ available: false });
    res.json(
      await cached(`cases311:${city.id}`, async (signal) =>
        project311(city, await getJson(city.cases311, signal)),
      ),
    );
  });

  router.get("/seattle-events", async (req, res) => {
    const city = cityOf(req);
    if (city.id !== "sea") return res.json({ available: false });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const url = new URL("https://data.seattle.gov/resource/ium9-iqtc.json");
    url.searchParams.set("$limit", "200");
    url.searchParams.set("$where", `end_date >= '${today}T00:00:00'`);
    res.json(
      await cached(`seattle-events:${today}`, async (signal) =>
        projectSeattleEvents(
          city,
          await getJson(url.toString(), signal),
          today,
        ),
      ),
    );
  });

  router.get("/weather", async (req, res) => {
    const city = cityOf(req);
    const { lat, lng } = city.weather;
    res.json(
      await cached(`weather:${city.id}`, async (signal) =>
        projectWeather(await getJson(OPEN_METEO(lat, lng), signal)),
      ),
    );
  });

  router.get("/airquality", async (req, res) => {
    const city = cityOf(req);
    const { lat, lng } = city.weather;
    res.json(
      await cached(`airquality:${city.id}`, async (signal) =>
        projectAirQuality(await getJson(AIR_QUALITY(lat, lng), signal)),
      ),
    );
  });

  router.get("/alerts", async (req, res) => {
    const city = cityOf(req);
    if (!city.nws) return res.json({ available: false });
    const { lat, lng } = city.weather;
    res.json(
      await cached(`alerts:${city.id}`, async (signal) =>
        projectAlerts(
          await getJson(NWS_ALERTS(lat, lng), signal, { "User-Agent": NWS_UA }),
        ),
      ),
    );
  });

  router.use((_, res) =>
    res.status(404).json({ error: "Enrichment endpoint not found." }),
  );
  return router;
}
