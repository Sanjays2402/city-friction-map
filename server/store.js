import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  anonymize,
  findDuplicate,
  prediction,
  validateComment,
  validateReport,
} from "./domain.js";
import { InputError } from "./errors.js";
export function createStore(path = ":memory:", seed = true) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS votes (report_id TEXT, visitor TEXT, action TEXT, PRIMARY KEY(report_id,visitor,action)); CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, visitor TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_comments_report ON comments(report_id);`,
  );
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
  const toComment = (row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: anonymize(row.visitor),
  });
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
    list: () => {
      const counts = commentCounts();
      return all()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((r) => ({
          ...r,
          commentCount: counts[r.id] || 0,
          prediction: prediction(r),
        }));
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
        ...Object.fromEntries(
          [
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
        db.prepare("INSERT INTO votes VALUES (?,?,?)").run(
          report.id,
          visitor,
          "confirm",
        );
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
        if (r.status !== "active")
          throw new InputError("This report has already cleared.", 409);
        const insert = db
          .prepare("INSERT OR IGNORE INTO votes VALUES (?,?,?)")
          .run(id, visitor, action);
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
          }
        }
        save(r);
        const commentCount = db
          .prepare("SELECT COUNT(*) AS c FROM comments WHERE report_id=?")
          .get(r.id).c;
        return { ...r, commentCount, prediction: prediction(r) };
      });
    },
    listComments(reportId) {
      if (!all().some((r) => r.id === reportId))
        throw new InputError("Report not found.", 404);
      return db
        .prepare(
          "SELECT id, body, visitor, created_at FROM comments WHERE report_id=? ORDER BY created_at ASC",
        )
        .all(reportId)
        .map(toComment);
    },
    addComment(reportId, visitor, body) {
      const text = validateComment(body);
      return transaction(() => {
        if (!all().some((r) => r.id === reportId))
          throw new InputError("Report not found.", 404);
        const row = {
          id: randomUUID(),
          report_id: reportId,
          visitor,
          body: text,
          created_at: Date.now(),
        };
        db.prepare("INSERT INTO comments VALUES (?,?,?,?,?)").run(
          row.id,
          row.report_id,
          row.visitor,
          row.body,
          row.created_at,
        );
        return toComment(row);
      });
    },
    close: () => db.close(),
  };
}
