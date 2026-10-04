// A viewport summary uses only community reports, never public-data overlays.
export function areaBrief(
  reports,
  bounds,
  { hideDemo = false, now = Date.now() } = {},
) {
  const rows = reports.filter(
    (report) =>
      report.status === "active" &&
      !report.expired &&
      !report.hidden &&
      (!hideDemo || !report.demo) &&
      Number.isFinite(report.lat) &&
      Number.isFinite(report.lng) &&
      report.lat >= bounds.south &&
      report.lat <= bounds.north &&
      report.lng >= bounds.west &&
      report.lng <= bounds.east,
  );
  const counts = new Map();
  for (const report of rows)
    counts.set(report.category, (counts.get(report.category) || 0) + 1);
  return {
    total: rows.length,
    major: rows.filter((report) => report.severity === 3).length,
    stepFree: rows.filter((report) => report.stepFree).length,
    recent: rows.filter(
      (report) =>
        Number.isFinite(report.updatedAt) &&
        now - report.updatedAt >= 0 &&
        now - report.updatedAt <= 24 * 3600000,
    ).length,
    demo: rows.filter((report) => report.demo).length,
    categories: [...counts]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
  };
}

// Share the camera, not a frozen report count. Coordinates are rounded to
// roughly meter precision; reports and viewport dimensions may change later.
export function areaViewUrl(baseUrl, cityId, center, zoom) {
  const url = new URL("/", baseUrl);
  url.searchParams.set("city", cityId);
  url.searchParams.set("lat", center.lat.toFixed(5));
  url.searchParams.set("lng", center.lng.toFixed(5));
  url.searchParams.set("zoom", String(zoom));
  return url.href;
}

export function readAreaView(search, cityId) {
  const params = new URLSearchParams(search);
  if (params.get("city") !== cityId) return null;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const zoom = Number(params.get("zoom"));
  if (
    !params.has("lat") ||
    !params.has("lng") ||
    !params.has("zoom") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isInteger(zoom) ||
    lat < -85 ||
    lat > 85 ||
    lng < -180 ||
    lng > 180 ||
    zoom < 0 ||
    zoom > 19
  )
    return null;
  return { center: [lat, lng], zoom };
}
