import { distance } from "../server/domain.js";

export function filterReports(
  reports,
  filters,
  saved = new Set(),
  followed = new Set(),
) {
  const query = filters.query.toLowerCase().trim();
  const now = filters.now ?? Date.now();
  const maxAgeMs = (filters.maxAgeHours || 0) * 3600000;
  const bounds = filters.bounds;
  const rows = reports.filter(
    (r) =>
      r.status === filters.status &&
      (filters.category === "all" || r.category === filters.category) &&
      (!filters.majorOnly || r.severity === 3) &&
      (!filters.hideDemo || !r.demo) &&
      (!filters.savedOnly || saved.has(r.id)) &&
      (!filters.followedOnly || followed.has(r.id)) &&
      (!r.hidden || filters.includeHidden) &&
      (maxAgeMs <= 0 || now - r.updatedAt <= maxAgeMs) &&
      (!bounds ||
        (r.lat >= bounds.south &&
          r.lat <= bounds.north &&
          r.lng >= bounds.west &&
          r.lng <= bounds.east)) &&
      `${r.title} ${r.location} ${r.description}`.toLowerCase().includes(query),
  );
  return rows.sort((a, b) => {
    if (filters.sort === "impact")
      return b.severity - a.severity || b.updatedAt - a.updatedAt;
    if (filters.sort === "confirmed")
      return b.confirmations - a.confirmations || b.updatedAt - a.updatedAt;
    if (filters.sort === "nearby" && filters.userLoc) {
      const loc = filters.userLoc;
      return distance(loc, a) - distance(loc, b) || b.updatedAt - a.updatedAt;
    }
    return b.updatedAt - a.updatedAt;
  });
}

export function summarize(reports) {
  // Expired reports keep status "active" but aren't live heads-ups — they
  // get their own bucket so the stale tab can't inflate the active count.
  const live = reports.filter((r) => r.status === "active" && !r.expired);
  const expired = reports.filter((r) => r.expired).length;
  return {
    active: live.length,
    major: live.filter((r) => r.severity === 3).length,
    stale: expired || live.filter((r) => r.prediction.minutes === null).length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };
}

export function readSaved(storage) {
  return readIdSet(storage, "friction-saved");
}

export function readFollowed(storage) {
  return readIdSet(storage, "friction-followed");
}

export function readIdSet(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function writeIdSet(storage, key, set) {
  try {
    storage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Storage unavailable; the in-memory set still works for this session.
  }
}

// A snapshot records the last-seen state of a report so background refreshes
// can describe what actually changed on followed reports.
export function snapshotReports(reports) {
  const seen = {};
  for (const r of reports)
    seen[r.id] = {
      updatedAt: r.updatedAt,
      confirmations: r.confirmations,
      commentCount: r.commentCount || 0,
      clearVotes: r.clearVotes || 0,
      status: r.status,
      hidden: !!r.hidden,
    };
  return seen;
}

export function readSnapshot(storage) {
  try {
    const value = JSON.parse(storage.getItem("friction-seen") || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeSnapshot(storage, seen) {
  try {
    storage.setItem("friction-seen", JSON.stringify(seen));
  } catch {
    // Session-only tracking when storage is unavailable.
  }
}

export function detectUpdates(current, followed, seen) {
  const updates = [];
  for (const r of current) {
    if (!followed.has(r.id)) continue;
    const before = seen[r.id];
    if (!before) continue;
    const changes = [];
    if (r.hidden && !before.hidden) {
      changes.push("hidden after community flags");
    }
    if (r.status === "resolved" && before.status !== "resolved") {
      changes.push("cleared by the community");
    } else if (r.status === "active" && !r.hidden) {
      const fresh = r.confirmations - before.confirmations;
      if (fresh > 0)
        changes.push(`${fresh} new confirmation${fresh === 1 ? "" : "s"}`);
      const notes = (r.commentCount || 0) - (before.commentCount || 0);
      if (notes > 0)
        changes.push(`${notes} new neighbor note${notes === 1 ? "" : "s"}`);
      const clearing = (r.clearVotes || 0) - (before.clearVotes || 0);
      if (clearing > 0) changes.push("a new clearance vote");
    }
    if (changes.length) updates.push({ id: r.id, title: r.title, changes });
  }
  return updates;
}

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function toCSV(reports) {
  const header = [
    "id",
    "title",
    "location",
    "category",
    "severity",
    "status",
    "confirmations",
    "clear_votes",
    "comments",
    "latitude",
    "longitude",
    "created_at",
    "updated_at",
  ];
  const lines = [header.join(",")];
  for (const r of reports)
    lines.push(
      [
        r.id,
        r.title,
        r.location,
        r.category,
        r.severity,
        r.status,
        r.confirmations,
        r.clearVotes || 0,
        r.commentCount || 0,
        r.lat,
        r.lng,
        new Date(r.createdAt).toISOString(),
        new Date(r.updatedAt).toISOString(),
      ]
        .map(csvCell)
        .join(","),
    );
  return lines.join("\r\n") + "\r\n";
}
