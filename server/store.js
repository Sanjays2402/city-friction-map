import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  HIDE_AFTER_FLAGS,
  anonymize,
  categories,
  distance,
  findDuplicate,
  prediction,
  validateAlert,
  validateComment,
  validateFlag,
  validateReport,
} from "./domain.js";
import { InputError } from "./errors.js";
import { levelFor, xpForStats } from "./gamify.js";
import { DEFAULT_CITY } from "./cities.js";
export function createStore(path = ":memory:", seed = true) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS votes (report_id TEXT, visitor TEXT, action TEXT, created_at INTEGER, PRIMARY KEY(report_id,visitor,action)); CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, visitor TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, parent_id TEXT); CREATE INDEX IF NOT EXISTS idx_comments_report ON comments(report_id); CREATE TABLE IF NOT EXISTS flags (report_id TEXT NOT NULL, visitor TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(report_id,visitor)); CREATE INDEX IF NOT EXISTS idx_flags_report ON flags(report_id); CREATE TABLE IF NOT EXISTS reactions (comment_id TEXT NOT NULL, visitor TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(comment_id,visitor)); CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, radius_m INTEGER NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_alerts_visitor ON alerts(visitor); CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, report_id TEXT, city TEXT, created_at INTEGER NOT NULL, read_at INTEGER); CREATE INDEX IF NOT EXISTS idx_notifications_visitor ON notifications(visitor, created_at);`,
  );
  // Upgrade path: databases created before threaded replies lack parent_id,
  // and older votes lack created_at (used for streaks and weekly progress).
  const commentColumns = db
    .prepare("PRAGMA table_info(comments)")
    .all()
    .map((c) => c.name);
  if (!commentColumns.includes("parent_id"))
    db.exec("ALTER TABLE comments ADD COLUMN parent_id TEXT");
  // Upgrade path: databases created before v1.5.0 lack the alerts city column.
  const alertColumns = db
    .prepare("PRAGMA table_info(alerts)")
    .all()
    .map((c) => c.name);
  if (!alertColumns.includes("city"))
    db.exec("ALTER TABLE alerts ADD COLUMN city TEXT");
  const voteColumns = db
    .prepare("PRAGMA table_info(votes)")
    .all()
    .map((c) => c.name);
  if (!voteColumns.includes("created_at"))
    db.exec("ALTER TABLE votes ADD COLUMN created_at INTEGER");
  const all = () =>
    db
      .prepare("SELECT payload FROM reports")
      .all()
      .map((r) => JSON.parse(r.payload));
  const save = (r) =>
    db
      .prepare("INSERT OR REPLACE INTO reports VALUES (?,?)")
      .run(r.id, JSON.stringify(r));
  const commentCounts = () => {
    const counts = {};
    for (const row of db
      .prepare(
        "SELECT report_id, COUNT(*) AS c FROM comments GROUP BY report_id",
      )
      .all())
      counts[row.report_id] = row.c;
    return counts;
  };
  const reactionCounts = () => {
    const counts = {};
    for (const row of db
      .prepare(
        "SELECT comment_id, COUNT(*) AS c FROM reactions GROUP BY comment_id",
      )
      .all())
      counts[row.comment_id] = row.c;
    return counts;
  };
  const flagCounts = () => {
    const counts = {};
    for (const row of db
      .prepare("SELECT report_id, COUNT(*) AS c FROM flags GROUP BY report_id")
      .all())
      counts[row.report_id] = row.c;
    return counts;
  };
  const toAlert = (row) => ({
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    radiusM: row.radius_m ?? row.radiusM,
    label: row.label,
    city: row.city || DEFAULT_CITY,
    createdAt: row.created_at ?? row.createdAt,
  });
  const allAlerts = () =>
    db
      .prepare(
        "SELECT id, visitor, lat, lng, radius_m, label, city, created_at FROM alerts",
      )
      .all()
      .map((row) => ({ ...toAlert(row), visitor: row.visitor }));
  // Fan-out for the notification center. Callers pass already-validated
  // content; delivery state lives in read_at (null = unread).
  const notify = (
    visitor,
    { type, title, body, reportId = null, city = null },
  ) => {
    if (!visitor) return;
    db.prepare("INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?,?)").run(
      randomUUID(),
      visitor,
      type,
      String(title).slice(0, 120),
      String(body).slice(0, 300),
      reportId,
      city,
      Date.now(),
      null,
    );
  };
  const toNotification = (row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    reportId: row.report_id,
    city: row.city,
    createdAt: row.created_at,
    read: row.read_at !== null,
  });
  const toComment = (row, counts = {}) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: anonymize(row.visitor),
    helpfulCount: counts[row.id] || 0,
  });
  const commentCountFor = (id) =>
    db.prepare("SELECT COUNT(*) AS c FROM comments WHERE report_id=?").get(id)
      .c;
  const flagCountFor = (id) =>
    db.prepare("SELECT COUNT(*) AS c FROM flags WHERE report_id=?").get(id).c;
  const transaction = (operation) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  if (seed && !all().length) {
    const rows = [
      [
        "queue",
        "Coffee comes with a wait",
        "Hayes Valley · Octavia St",
        "The morning rush is still going. About 12 people in line.",
        37.7769,
        -122.4241,
        2,
        8,
        12,
      ],
      [
        "access",
        "Sidewalk temporarily blocked",
        "SoMa · Howard & 7th",
        "Construction fencing narrows the sidewalk. Use the opposite side.",
        37.7768,
        -122.4104,
        3,
        6,
        24,
      ],
      [
        "noise",
        "A very loud afternoon",
        "Lower Haight · Haight St",
        "Roadwork and drilling along this block.",
        37.7724,
        -122.4312,
        2,
        4,
        18,
      ],
      [
        "bikes",
        "All docks, no bikes",
        "Civic Center · Market St",
        "Station is empty. Check another station before walking over.",
        37.7801,
        -122.4148,
        1,
        5,
        8,
      ],
      [
        "restroom",
        "Restroom closed for cleaning",
        "Mission Dolores Park",
        "The north-side restroom is temporarily closed.",
        37.7602,
        -122.4263,
        2,
        3,
        15,
      ],
      [
        "signal",
        "Calls keep dropping",
        "Duboce Triangle · Duboce Ave",
        "Patchy reception reported along this stretch.",
        37.7694,
        -122.4335,
        1,
        2,
        30,
      ],
      [
        "queue",
        "Lunch line around the corner",
        "Mission · Valencia St",
        "Expect a slow lunch stop. The line is moving, though.",
        37.7634,
        -122.4216,
        2,
        7,
        6,
      ],
      [
        "access",
        "Elevator out of service",
        "Downtown · Powell St",
        "Demo accessibility report; verify real elevator status with the operator.",
        37.7844,
        -122.4078,
        3,
        9,
        40,
      ],
      [
        "noise",
        "Outdoor sound check",
        "Western Addition · Fillmore St",
        "Speakers are being tested near the plaza.",
        37.7825,
        -122.4328,
        1,
        3,
        10,
      ],
    ];
    rows.forEach(
      ([
        category,
        title,
        location,
        description,
        lat,
        lng,
        severity,
        confirmations,
        age,
      ]) =>
        save({
          id: randomUUID(),
          city: "sf",
          category,
          title,
          location,
          description,
          lat,
          lng,
          severity,
          confirmations,
          clearVotes: 0,
          status: "active",
          demo: true,
          createdAt: Date.now() - age * 60000,
          updatedAt: Date.now() - age * 60000,
        }),
    );
  }
  return {
    list: (filter = {}) => {
      const counts = commentCounts();
      const flags = flagCounts();
      const city = filter.city || null;
      return all()
        .filter((r) => !city || (r.city || DEFAULT_CITY) === city)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((r) => ({
          ...r,
          city: r.city || DEFAULT_CITY,
          hidden: !!r.hidden,
          flagCount: flags[r.id] || 0,
          commentCount: counts[r.id] || 0,
          prediction: prediction(r),
        }));
    },
    get(id) {
      const r = all().find((r) => r.id === id);
      if (!r) throw new InputError("Report not found.", 404);
      return {
        ...r,
        city: r.city || DEFAULT_CITY,
        hidden: !!r.hidden,
        flagCount: flagCountFor(id),
        commentCount: commentCountFor(id),
        prediction: prediction(r),
      };
    },
    create(body, visitor) {
      const input = validateReport(body),
        duplicate = findDuplicate(all(), input);
      if (duplicate) {
        this.vote(duplicate.id, visitor, "confirm");
        return {
          report: this.list().find((r) => r.id === duplicate.id),
          merged: true,
        };
      }
      const report = {
        id: randomUUID(),
        creator: visitor,
        ...Object.fromEntries(
          [
            "city",
            "category",
            "title",
            "location",
            "description",
            "photoUrl",
            "lat",
            "lng",
            "severity",
          ].map((k) => [k, input[k]]),
        ),
        confirmations: 1,
        clearVotes: 0,
        status: "active",
        demo: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      transaction(() => {
        save(report);
        db.prepare("INSERT INTO votes VALUES (?,?,?,?)").run(
          report.id,
          visitor,
          "confirm",
          Date.now(),
        );
        // Notify every alert-zone owner whose zone contains the new report.
        // Zones only fire for their own city.
        const seen = new Set();
        for (const zone of allAlerts()) {
          if (zone.visitor === visitor || seen.has(zone.visitor)) continue;
          if ((zone.city || DEFAULT_CITY) !== (report.city || DEFAULT_CITY))
            continue;
          if (distance(zone, report) <= zone.radiusM) {
            seen.add(zone.visitor);
            notify(zone.visitor, {
              type: "alert",
              title: `New friction in “${zone.label}”`,
              body: `${report.title} · ${report.location}`,
              reportId: report.id,
              city: report.city,
            });
          }
        }
      });
      return {
        report: { ...report, commentCount: 0, prediction: prediction(report) },
        merged: false,
      };
    },
    vote(id, visitor, action) {
      return transaction(() => {
        if (!["confirm", "clear"].includes(action))
          throw new InputError("Unknown action.");
        const r = all().find((r) => r.id === id);
        if (!r) throw new InputError("Report not found.", 404);
        if (r.hidden)
          throw new InputError(
            "This report is hidden while under review.",
            409,
          );
        if (r.status !== "active")
          throw new InputError("This report has already cleared.", 409);
        const insert = db
          .prepare("INSERT OR IGNORE INTO votes VALUES (?,?,?,?)")
          .run(id, visitor, action, Date.now());
        if (!insert.changes)
          throw new InputError("You already sent this update.", 409);
        if (action === "confirm") {
          r.confirmations++;
          r.updatedAt = Date.now();
        } else {
          r.clearVotes++;
          if (r.clearVotes >= 2) {
            r.status = "resolved";
            r.resolvedAt = Date.now();
            if (r.creator && r.creator !== visitor)
              notify(r.creator, {
                type: "resolved",
                title: "Your report was cleared",
                body: `${r.title} · ${r.location}`,
                reportId: r.id,
                city: r.city || DEFAULT_CITY,
              });
          }
        }
        save(r);
        const commentCount = commentCountFor(r.id);
        return { ...r, commentCount, prediction: prediction(r) };
      });
    },
    flag(reportId, visitor, reason) {
      const clean = validateFlag({ reason });
      return transaction(() => {
        const r = all().find((r) => r.id === reportId);
        if (!r) throw new InputError("Report not found.", 404);
        const insert = db
          .prepare("INSERT OR IGNORE INTO flags VALUES (?,?,?,?)")
          .run(reportId, visitor, clean, Date.now());
        if (!insert.changes)
          throw new InputError("You already flagged this report.", 409);
        const flagCount = flagCountFor(reportId);
        let hidden = !!r.hidden;
        if (!hidden && flagCount >= HIDE_AFTER_FLAGS) {
          r.hidden = true;
          hidden = true;
          save(r);
        }
        return { id: reportId, flagCount, hidden };
      });
    },
    moderate(id, action) {
      if (!["hide", "restore", "delete"].includes(action))
        throw new InputError("Unknown moderation action.");
      return transaction(() => {
        const r = all().find((r) => r.id === id);
        if (!r) throw new InputError("Report not found.", 404);
        if (action === "delete") {
          db.prepare("DELETE FROM reports WHERE id=?").run(id);
          for (const table of ["votes", "comments", "flags"])
            db.prepare(`DELETE FROM ${table} WHERE report_id=?`).run(id);
          db.prepare(
            "DELETE FROM reactions WHERE comment_id IN (SELECT id FROM comments WHERE report_id=?)",
          ).run(id);
          return { id, deleted: true };
        }
        r.hidden = action === "hide";
        save(r);
        return { id, hidden: r.hidden, flagCount: flagCountFor(id) };
      });
    },
    listComments(reportId) {
      if (!all().some((r) => r.id === reportId))
        throw new InputError("Report not found.", 404);
      const counts = reactionCounts();
      const rows = db
        .prepare(
          "SELECT id, body, visitor, created_at, parent_id FROM comments WHERE report_id=? ORDER BY created_at ASC",
        )
        .all(reportId);
      const byId = {},
        tops = [];
      for (const row of rows) {
        const comment = { ...toComment(row, counts), replies: [] };
        byId[row.id] = comment;
        const parent = row.parent_id && byId[row.parent_id];
        if (parent) parent.replies.push(comment);
        else tops.push(comment);
      }
      return tops;
    },
    addComment(reportId, visitor, body) {
      const text = validateComment(body);
      const parentId =
        body && typeof body.parentId === "string" ? body.parentId : null;
      return transaction(() => {
        const r = all().find((r) => r.id === reportId);
        if (!r) throw new InputError("Report not found.", 404);
        if (r.hidden)
          throw new InputError(
            "This report is hidden while under review.",
            409,
          );
        if (parentId) {
          const parent = db
            .prepare("SELECT id, report_id, parent_id FROM comments WHERE id=?")
            .get(parentId);
          if (!parent || parent.report_id !== reportId)
            throw new InputError(
              "The note you are replying to was not found.",
              404,
            );
          if (parent.parent_id)
            throw new InputError(
              "Replies can only be added to top-level notes.",
            );
        }
        const row = {
          id: randomUUID(),
          report_id: reportId,
          visitor,
          body: text,
          created_at: Date.now(),
          parent_id: parentId,
        };
        db.prepare("INSERT INTO comments VALUES (?,?,?,?,?,?)").run(
          row.id,
          row.report_id,
          row.visitor,
          row.body,
          row.created_at,
          row.parent_id,
        );
        if (r.creator && r.creator !== visitor)
          notify(r.creator, {
            type: "comment",
            title: "New note on your report",
            body: `${text.slice(0, 120)}`,
            reportId: r.id,
            city: r.city || DEFAULT_CITY,
          });
        return toComment(row);
      });
    },
    toggleReaction(commentId, visitor) {
      return transaction(() => {
        if (!db.prepare("SELECT 1 FROM comments WHERE id=?").get(commentId))
          throw new InputError("Note not found.", 404);
        const had = db
          .prepare("SELECT 1 FROM reactions WHERE comment_id=? AND visitor=?")
          .get(commentId, visitor);
        if (had)
          db.prepare(
            "DELETE FROM reactions WHERE comment_id=? AND visitor=?",
          ).run(commentId, visitor);
        else
          db.prepare("INSERT INTO reactions VALUES (?,?,?)").run(
            commentId,
            visitor,
            "helpful",
          );
        const helpfulCount = db
          .prepare("SELECT COUNT(*) AS c FROM reactions WHERE comment_id=?")
          .get(commentId).c;
        return { id: commentId, helpful: !had, helpfulCount };
      });
    },
    createAlert(visitor, body) {
      const zone = validateAlert(body);
      const row = {
        id: randomUUID(),
        visitor,
        ...zone,
        createdAt: Date.now(),
      };
      db.prepare(
        "INSERT INTO alerts (id, visitor, lat, lng, radius_m, label, city, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        row.id,
        visitor,
        zone.lat,
        zone.lng,
        zone.radiusM,
        zone.label,
        zone.city || DEFAULT_CITY,
        row.createdAt,
      );
      return toAlert(row);
    },
    listAlerts(visitor) {
      return db
        .prepare(
          "SELECT id, lat, lng, radius_m, label, city, created_at FROM alerts WHERE visitor=? ORDER BY created_at DESC",
        )
        .all(visitor)
        .map(toAlert);
    },
    deleteAlert(visitor, id) {
      const gone = db
        .prepare("DELETE FROM alerts WHERE id=? AND visitor=?")
        .run(id, visitor).changes;
      if (!gone) throw new InputError("Alert zone not found.", 404);
      return { id, deleted: true };
    },
    alertMatches(visitor) {
      const active = all().filter((r) => r.status === "active" && !r.hidden);
      return this.listAlerts(visitor).map((zone) => {
        const zoneCity = zone.city || DEFAULT_CITY;
        const matches = [];
        for (const r of active) {
          if ((r.city || DEFAULT_CITY) !== zoneCity) continue;
          const meters = distance(zone, r);
          if (meters <= zone.radiusM)
            matches.push({
              id: r.id,
              title: r.title,
              category: r.category,
              severity: r.severity,
              lat: r.lat,
              lng: r.lng,
              distanceM: Math.round(meters),
            });
        }
        matches.sort((a, b) => a.distanceM - b.distanceM);
        return { zone, matches };
      });
    },
    listNotifications(visitor) {
      const rows = db
        .prepare(
          "SELECT id, type, title, body, report_id, city, created_at, read_at FROM notifications WHERE visitor=? ORDER BY created_at DESC LIMIT 50",
        )
        .all(visitor);
      const items = rows.map(toNotification);
      return { items, unread: items.filter((n) => !n.read).length };
    },
    markNotificationsRead(visitor, ids) {
      if (Array.isArray(ids) && ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(
          `UPDATE notifications SET read_at=? WHERE visitor=? AND read_at IS NULL AND id IN (${placeholders})`,
        ).run(Date.now(), visitor, ...ids);
      } else {
        db.prepare(
          "UPDATE notifications SET read_at=? WHERE visitor=? AND read_at IS NULL",
        ).run(Date.now(), visitor);
      }
      return this.listNotifications(visitor);
    },
    contributors: (filter = {}) => {
      const city = filter.city || null;
      const inCity = (r) => !city || (r.city || DEFAULT_CITY) === city;
      const stats = {};
      const bump = (visitor) =>
        (stats[visitor] = stats[visitor] || {
          reports: 0,
          notes: 0,
          confirmations: 0,
          helpful: 0,
          flags: 0,
        });
      for (const r of all())
        if (r.creator && inCity(r)) bump(r.creator).reports++;
      // Notes, confirmations, helpful votes, and flags attach to reports, so
      // scope them through a report-id -> city lookup when a city is given.
      const cityOf = new Map(all().map((r) => [r.id, r.city || DEFAULT_CITY]));
      const commentCity = (id) =>
        cityOf.get(
          db.prepare("SELECT report_id FROM comments WHERE id=?").get(id)
            ?.report_id,
        );
      for (const row of db
        .prepare("SELECT id, visitor, report_id FROM comments")
        .all())
        if (!city || cityOf.get(row.report_id) === city)
          bump(row.visitor).notes++;
      for (const row of db
        .prepare("SELECT visitor, report_id FROM votes WHERE action='confirm'")
        .all())
        if (!city || cityOf.get(row.report_id) === city)
          bump(row.visitor).confirmations++;
      for (const row of db
        .prepare(
          "SELECT c.visitor AS visitor, c.id AS cid FROM reactions r JOIN comments c ON c.id = r.comment_id",
        )
        .all())
        if (!city || commentCity(row.cid) === city) bump(row.visitor).helpful++;
      const hiddenIds = new Set(
        all()
          .filter((r) => r.hidden && inCity(r))
          .map((r) => r.id),
      );
      for (const row of db
        .prepare("SELECT visitor, report_id FROM flags")
        .all())
        if (
          hiddenIds.has(row.report_id) &&
          (!city || cityOf.get(row.report_id) === city)
        )
          bump(row.visitor).flags++;
      return Object.entries(stats)
        .map(([visitor, s]) => {
          const xp = xpForStats({
            reports: s.reports,
            confirms: s.confirmations,
            notes: s.notes,
            helpful: s.helpful,
            flags: s.flags,
          });
          const level = levelFor(xp);
          return {
            name: anonymize(visitor),
            reports: s.reports,
            notes: s.notes,
            confirmations: s.confirmations,
            score: s.reports * 3 + s.notes * 2 + s.confirmations,
            levelName: level.name,
            levelIcon: level.icon,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
    },
    // Per-visitor activity feeds for the gamification profile. Reads are
    // cheap single-table scans; callers do the arithmetic.
    reportsBy(visitor) {
      return all()
        .filter((r) => r.creator === visitor)
        .map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          lat: r.lat,
          lng: r.lng,
        }));
    },
    votesBy(visitor) {
      return db
        .prepare(
          "SELECT report_id, action, created_at FROM votes WHERE visitor=?",
        )
        .all(visitor)
        .map((v) => ({
          reportId: v.report_id,
          action: v.action,
          createdAt: v.created_at,
        }));
    },
    notesBy(visitor) {
      const helpful = {};
      for (const row of db
        .prepare(
          "SELECT comment_id, COUNT(*) AS c FROM reactions GROUP BY comment_id",
        )
        .all())
        helpful[row.comment_id] = row.c;
      return db
        .prepare("SELECT id, created_at FROM comments WHERE visitor=?")
        .all(visitor)
        .map((c) => ({
          id: c.id,
          createdAt: c.created_at,
          helpful: helpful[c.id] || 0,
        }));
    },
    flagsBy(visitor) {
      return db
        .prepare("SELECT report_id, created_at FROM flags WHERE visitor=?")
        .all(visitor)
        .map((f) => ({ reportId: f.report_id, createdAt: f.created_at }));
    },
    hiddenReportIds() {
      return all()
        .filter((r) => r.hidden)
        .map((r) => r.id);
    },
    trends(filter = {}) {
      const city = filter.city || null;
      const inCity = (r) => !city || (r.city || DEFAULT_CITY) === city;
      const now = Date.now(),
        dayMs = 86400000,
        buckets = [];
      for (let i = 13; i >= 0; i--) {
        const start = now - (i + 1) * dayMs,
          end = now - i * dayMs,
          counts = { date: new Date(end).toISOString().slice(0, 10) };
        for (const name of Object.keys(categories)) counts[name] = 0;
        buckets.push({ start, end, counts });
      }
      let active = 0,
        resolved = 0;
      const resolutionMinutes = [];
      for (const r of all()) {
        if (!inCity(r)) continue;
        if (r.status === "resolved") {
          resolved++;
          if (r.resolvedAt > r.createdAt)
            resolutionMinutes.push((r.resolvedAt - r.createdAt) / 60000);
        } else if (!r.hidden) active++;
        if (r.createdAt >= now - 14 * dayMs)
          for (const b of buckets)
            if (r.createdAt >= b.start && r.createdAt < b.end) {
              b.counts[r.category]++;
              break;
            }
      }
      let notes, confirmations;
      if (city) {
        const cityOf = new Map(
          all().map((r) => [r.id, r.city || DEFAULT_CITY]),
        );
        notes = db
          .prepare("SELECT report_id FROM comments")
          .all()
          .filter((c) => cityOf.get(c.report_id) === city).length;
        confirmations = db
          .prepare("SELECT report_id FROM votes WHERE action='confirm'")
          .all()
          .filter((v) => cityOf.get(v.report_id) === city).length;
      } else {
        notes = db.prepare("SELECT COUNT(*) AS c FROM comments").get().c;
        confirmations = db
          .prepare("SELECT COUNT(*) AS c FROM votes WHERE action='confirm'")
          .get().c;
      }
      return {
        days: buckets.map((b) => b.counts),
        avgResolutionMinutes: resolutionMinutes.length
          ? Math.round(
              resolutionMinutes.reduce((a, b) => a + b, 0) /
                resolutionMinutes.length,
            )
          : null,
        totals: { active, resolved, notes, confirmations },
      };
    },
    close: () => db.close(),
  };
}
