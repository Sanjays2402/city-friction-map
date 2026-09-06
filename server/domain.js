import { InputError } from "./errors.js";
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
    body.lat < 37.7 ||
    body.lat > 37.84 ||
    body.lng < -122.53 ||
    body.lng > -122.35
  )
    throw new InputError("Choose a location within San Francisco.");
  if (![1, 2, 3].includes(body.severity))
    throw new InputError("Choose a valid impact level.");
  return {
    ...body,
    title: body.title.trim(),
    location: body.location.trim(),
    description: body.description.trim(),
  };
}
export function findDuplicate(reports, incoming, now = Date.now()) {
  return reports
    .filter(
      (r) =>
        r.status === "active" &&
        r.category === incoming.category &&
        now - r.updatedAt < 90 * 60000 &&
        distance(r, incoming) <= 90,
    )
    .sort((a, b) => distance(a, incoming) - distance(b, incoming))[0];
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
