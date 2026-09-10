import express from "express";

// Server-side proxies for free, keyless public data sources. Each endpoint
// caches the upstream response for 60 seconds, aborts slow upstreams after
// 8 seconds, and answers { available: false } instead of failing the page
// when an upstream is unreachable. Read-only GETs: no visitor id required.
const TTL_MS = 60_000;
const TIMEOUT_MS = 8_000;
const SF = { minLat: 37.7, maxLat: 37.84, minLng: -122.53, maxLng: -122.35 };

const GBFS_INFO = "https://gbfs.baywheels.com/gbfs/en/station_information.json";
const GBFS_STATUS = "https://gbfs.baywheels.com/gbfs/en/station_status.json";
const SF_311 =
  "https://data.sfgov.org/resource/vw6y-z8j6.json?$limit=100&$order=requested_datetime%20DESC";
const OPEN_METEO =
  "https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,weather_code,wind_speed_10m";
const AIR_QUALITY =
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=37.7749&longitude=-122.4194&current=us_aqi,pm2_5";
const NWS_ALERTS =
  "https://api.weather.gov/alerts/active?point=37.7749,-122.4194";
const NWS_UA =
  "CityFrictionMap/1.4.0 (community map demo; contact via GitHub Sanjays2402/city-friction-map)";

const inSF = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= SF.minLat &&
  lat <= SF.maxLat &&
  lng >= SF.minLng &&
  lng <= SF.maxLng;

function projectBikeshare(info, status) {
  const live = new Map();
  for (const s of status?.data?.stations || []) live.set(s.station_id, s);
  const stations = [];
  for (const s of info?.data?.stations || []) {
    const lat = Number(s.lat);
    const lng = Number(s.lon);
    if (!inSF(lat, lng)) continue;
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

function project311(rows) {
  const cases = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    let lat = Number(r.lat);
    let lng = Number(r.long);
    if (!Number.isFinite(lat) && r.point?.coordinates) {
      [lng, lat] = r.point.coordinates.map(Number);
    }
    if (!inSF(lat, lng)) continue;
    cases.push({
      id: r.service_request_id,
      type: r.service_name || "311 case",
      subtype: r.service_subtype || "",
      status: r.status_description || "",
      address: r.address || "",
      lat,
      lng,
      opened: r.requested_datetime || null,
    });
    if (cases.length >= 100) break;
  }
  return { available: true, updatedAt: Date.now(), cases };
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

  router.get("/bikeshare", async (_, res) => {
    res.json(
      await cached("bikeshare", async (signal) => {
        const [info, status] = await Promise.all([
          getJson(GBFS_INFO, signal),
          getJson(GBFS_STATUS, signal),
        ]);
        return projectBikeshare(info, status);
      }),
    );
  });

  router.get("/cases311", async (_, res) => {
    res.json(
      await cached("cases311", async (signal) =>
        project311(await getJson(SF_311, signal)),
      ),
    );
  });

  router.get("/weather", async (_, res) => {
    res.json(
      await cached("weather", async (signal) =>
        projectWeather(await getJson(OPEN_METEO, signal)),
      ),
    );
  });

  router.get("/airquality", async (_, res) => {
    res.json(
      await cached("airquality", async (signal) =>
        projectAirQuality(await getJson(AIR_QUALITY, signal)),
      ),
    );
  });

  router.get("/alerts", async (_, res) => {
    res.json(
      await cached("alerts", async (signal) =>
        projectAlerts(
          await getJson(NWS_ALERTS, signal, { "User-Agent": NWS_UA }),
        ),
      ),
    );
  });

  router.use((_, res) =>
    res.status(404).json({ error: "Enrichment endpoint not found." }),
  );
  return router;
}
