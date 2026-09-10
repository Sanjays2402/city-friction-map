// City registry for the multi-city map. Dependency-free on purpose: the
// client imports this module directly (like server/domain.js), so it must
// not touch node builtins. Coordinates are [lat, lng] pairs.
export const CITIES = [
  {
    id: "sf",
    name: "San Francisco",
    short: "SF",
    center: [37.775, -122.421],
    zoom: 14,
    bounds: { lat: [37.7, 37.84], lng: [-122.53, -122.35] },
    weather: { lat: 37.7749, lng: -122.4194 },
    nws: true,
    bikeshare: {
      name: "Bay Wheels",
      info: "https://gbfs.baywheels.com/gbfs/en/station_information.json",
      status: "https://gbfs.baywheels.com/gbfs/en/station_status.json",
    },
    cases311:
      "https://data.sfgov.org/resource/vw6y-z8j6.json?$limit=100&$order=requested_datetime%20DESC",
    seedDemo: true,
  },
  {
    id: "sea",
    name: "Seattle",
    short: "SEA",
    center: [47.6062, -122.3321],
    zoom: 13,
    bounds: { lat: [47.49, 47.73], lng: [-122.44, -122.23] },
    weather: { lat: 47.6062, lng: -122.3321 },
    nws: true,
    // No verified keyless GBFS feed wired up yet; the layer degrades to
    // { available: false } instead of failing the page.
    bikeshare: null,
    cases311: null,
    seedDemo: false,
  },
  {
    id: "nyc",
    name: "New York",
    short: "NYC",
    center: [40.7128, -74.006],
    zoom: 12,
    bounds: { lat: [40.49, 40.92], lng: [-74.26, -73.68] },
    weather: { lat: 40.7128, lng: -74.006 },
    nws: true,
    bikeshare: {
      name: "Citi Bike",
      info: "https://gbfs.citibikenyc.com/gbfs/en/station_information.json",
      status: "https://gbfs.citibikenyc.com/gbfs/en/station_status.json",
    },
    cases311: null,
    seedDemo: false,
  },
];

export const DEFAULT_CITY = "sf";

export function cityById(id) {
  return CITIES.find((c) => c.id === id) || null;
}

export function inCityBounds(cityId, lat, lng) {
  const city = cityById(cityId);
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const { bounds } = city;
  return (
    lat >= bounds.lat[0] &&
    lat <= bounds.lat[1] &&
    lng >= bounds.lng[0] &&
    lng <= bounds.lng[1]
  );
}

// Public shape sent to clients; drops upstream URLs the browser never needs.
export function publicCities() {
  return CITIES.map((c) => ({
    id: c.id,
    name: c.name,
    short: c.short,
    center: c.center,
    zoom: c.zoom,
    bounds: c.bounds,
    hasBikeshare: !!c.bikeshare,
    hasCases311: !!c.cases311,
    hasWeatherAlerts: c.nws,
    seedDemo: c.seedDemo,
  }));
}
