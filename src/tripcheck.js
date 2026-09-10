// Pure helpers for trip checking: which active reports fall inside a route
// corridor. Tested in tests/tripcheck.test.js; the map UI lives in main.js.

export function pointToSegmentM(p, a, b) {
  // Equirectangular projection around the segment midpoint; good enough for
  // city-scale distances (error well under a meter across San Francisco).
  const rad = Math.PI / 180;
  const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * rad || 0);
  const ky = 110540;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  let t = len2 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

export function clampWidth(widthM) {
  const n = Number(widthM);
  if (!Number.isFinite(n)) return 250;
  return Math.max(50, Math.min(2000, Math.round(n)));
}

export function corridorReports(reports, path, widthM) {
  if (!Array.isArray(path) || path.length < 2) return [];
  const width = clampWidth(widthM);
  const hits = [];
  for (const r of reports) {
    if (!r || r.status !== "active" || r.hidden) continue;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    let best = Infinity;
    for (let i = 0; i < path.length - 1; i++)
      best = Math.min(best, pointToSegmentM(r, path[i], path[i + 1]));
    if (best <= width) hits.push({ ...r, corridorM: Math.round(best) });
  }
  return hits.sort((a, b) => a.corridorM - b.corridorM);
}
