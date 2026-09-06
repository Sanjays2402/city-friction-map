export function filterReports(reports, filters, saved = new Set()) {
  const query = filters.query.toLowerCase().trim();
  const rows = reports.filter(
    (r) =>
      r.status === filters.status &&
      (filters.category === "all" || r.category === filters.category) &&
      (!filters.majorOnly || r.severity === 3) &&
      (!filters.hideDemo || !r.demo) &&
      (!filters.savedOnly || saved.has(r.id)) &&
      `${r.title} ${r.location} ${r.description}`.toLowerCase().includes(query),
  );
  return rows.sort((a, b) => {
    if (filters.sort === "impact")
      return b.severity - a.severity || b.updatedAt - a.updatedAt;
    if (filters.sort === "confirmed")
      return b.confirmations - a.confirmations || b.updatedAt - a.updatedAt;
    return b.updatedAt - a.updatedAt;
  });
}

export function summarize(reports) {
  const active = reports.filter((r) => r.status === "active");
  return {
    active: active.length,
    major: active.filter((r) => r.severity === 3).length,
    stale: active.filter((r) => r.prediction.minutes === null).length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };
}

export function readSaved(storage) {
  try {
    const value = JSON.parse(storage.getItem("friction-saved") || "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}
