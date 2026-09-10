import { InputError } from "./errors.js";
import { cityById, DEFAULT_CITY, inCityBounds } from "./cities.js";
export const categories = {
  queue: { label: "Long queues", icon: "◷", color: "#c17b20", minutes: 35 },
  access: { label: "Access issues", icon: "↗", color: "#b65252", minutes: 240 },
  noise: { label: "Noise", icon: "≋", color: "#9360af", minutes: 120 },
  bikes: {
    label: "Empty bike docks",
    icon: "◎",
    color: "#3979a0",
    minutes: 50,
  },
  restroom: { label: "Restrooms", icon: "⌂", color: "#348375", minutes: 90 },
  signal: { label: "Poor signal", icon: "▥", color: "#737d8a", minutes: 180 },
};
export function distance(a, b) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function validateReport(body) {
  if (!body || !Object.hasOwn(categories, body.category))
    throw new InputError("Choose a valid category.");
  if (body.city !== undefined && !cityById(body.city))
    throw new InputError("Unknown city.");
  const city = cityById(body.city) || cityById(DEFAULT_CITY);
  for (const [field, max] of [
    ["title", 100],
    ["location", 100],
    ["description", 500],
  ]) {
    if (
      typeof body[field] !== "string" ||
      body[field].trim().length < (field === "description" ? 0 : 3) ||
      body[field].length > max
    )
      throw new InputError(`Invalid ${field} (maximum ${max} characters).`);
  }
  if (
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lng) ||
    !inCityBounds(city.id, body.lat, body.lng)
  )
    throw new InputError(`Choose a location within ${city.name}.`);
  if (![1, 2, 3].includes(body.severity))
    throw new InputError("Choose a valid impact level.");
  let photoUrl = "";
  if (body.photoUrl !== undefined && body.photoUrl !== null) {
    if (typeof body.photoUrl !== "string")
      throw new InputError("The photo must be a URL.");
    const trimmed = body.photoUrl.trim();
    if (trimmed) {
      if (trimmed.length > 500 || !/^https?:\/\/[^\s]+$/i.test(trimmed))
        throw new InputError(
          "The photo must be an http(s) URL under 500 characters.",
        );
      photoUrl = trimmed;
    }
  }
  return {
    ...body,
    city: city.id,
    title: body.title.trim(),
    location: body.location.trim(),
    description: body.description.trim(),
    photoUrl,
  };
}
export function validateComment(body) {
  const text = body && typeof body.body === "string" ? body.body.trim() : "";
  if (text.length < 1 || text.length > 300)
    throw new InputError("Write a note between 1 and 300 characters.");
  return text;
}
export function anonymize(visitor) {
  const clean = String(visitor)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6);
  return `Neighbor ${clean || "anon"}`;
}
export function findDuplicate(reports, incoming, now = Date.now()) {
  const candidates = reports.filter((r) => {
    if (r.status !== "active" || r.hidden) return false;
    if (r.category !== incoming.category) return false;
    if (now - r.updatedAt >= 90 * 60000) return false;
    const d = distance(r, incoming);
    if (d <= 90) return true;
    // A clearly similar headline a little farther away is probably the same
    // incident described twice.
    return d <= 250 && titleSimilarity(r.title, incoming.title) >= 0.5;
  });
  return candidates.sort(
    (a, b) => distance(a, incoming) - distance(b, incoming),
  )[0];
}
export function titleSimilarity(a, b) {
  const tokens = (s) =>
    new Set(
      String(s)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2),
    );
  const first = tokens(a),
    second = tokens(b);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared++;
  return shared / (first.size + second.size - shared);
}
export const FLAG_REASONS = [
  "spam",
  "inaccurate",
  "inappropriate",
  "duplicate",
];
export function validateFlag(body) {
  const reason = body && typeof body.reason === "string" ? body.reason : "";
  if (!FLAG_REASONS.includes(reason))
    throw new InputError(`Choose a reason: ${FLAG_REASONS.join(", ")}.`);
  return reason;
}
export const HIDE_AFTER_FLAGS = 3;
const SF_BOUNDS = { lat: [37.7, 37.84], lng: [-122.53, -122.35] };
export function validateAlert(body) {
  if (!body || typeof body !== "object")
    throw new InputError("Describe the alert zone.");
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (label.length < 1 || label.length > 60)
    throw new InputError("Name the zone (1–60 characters).");
  if (body.city !== undefined && !cityById(body.city))
    throw new InputError("Unknown city.");
  const city = cityById(body.city) || null;
  const { lat, lng } = body;
  const inside = city
    ? inCityBounds(city.id, lat, lng)
    : Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= SF_BOUNDS.lat[0] &&
      lat <= SF_BOUNDS.lat[1] &&
      lng >= SF_BOUNDS.lng[0] &&
      lng <= SF_BOUNDS.lng[1];
  if (!inside)
    throw new InputError(
      city
        ? `Place the zone inside ${city.name}.`
        : "Place the zone inside San Francisco.",
    );
  const radiusM = Number(body.radiusM);
  if (!Number.isInteger(radiusM) || radiusM < 100 || radiusM > 5000)
    throw new InputError("Choose a radius between 100 and 5000 meters.");
  return city
    ? { label, lat, lng, radiusM, city: city.id }
    : { label, lat, lng, radiusM };
}
export function prediction(report, now = Date.now()) {
  const duration =
    categories[report.category].minutes * (0.65 + report.severity * 0.25);
  const remaining = Math.round(
    (report.updatedAt + duration * 60000 - now) / 60000,
  );
  if (remaining <= 0)
    return {
      label: "Needs a fresh update",
      confidence: "Stale",
      minutes: null,
    };
  const low = Math.max(5, Math.round((remaining * 0.65) / 5) * 5),
    high = Math.max(low + 5, Math.round((remaining * 1.4) / 5) * 5);
  const fmt = (n) => (n < 60 ? `${n}m` : `${Math.round(n / 6) / 10}h`);
  return {
    label: `${fmt(low)}–${fmt(high)}`,
    confidence: report.confirmations >= 4 ? "Medium" : "Low",
    minutes: remaining,
  };
}
