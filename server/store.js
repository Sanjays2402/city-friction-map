import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { findDuplicate, prediction, validateReport } from "./domain.js";
export function createStore(path = ":memory:", seed = true) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS votes (report_id TEXT, visitor TEXT, action TEXT, PRIMARY KEY(report_id,visitor,action));`,
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
    list: () =>
      all()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((r) => ({ ...r, prediction: prediction(r) })),
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
      save(report);
      db.prepare("INSERT INTO votes VALUES (?,?,?)").run(
        report.id,
        visitor,
        "confirm",
      );
      return {
        report: { ...report, prediction: prediction(report) },
        merged: false,
      };
    },
    vote(id, visitor, action) {
      if (!["confirm", "clear"].includes(action))
        throw new Error("Unknown action.");
      const r = all().find((r) => r.id === id);
      if (!r) throw new Error("Report not found.");
      if (r.status !== "active")
        throw new Error("This report has already cleared.");
      const insert = db
        .prepare("INSERT OR IGNORE INTO votes VALUES (?,?,?)")
        .run(id, visitor, action);
      if (!insert.changes) throw new Error("You already sent this update.");
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
      return { ...r, prediction: prediction(r) };
    },
    close: () => db.close(),
  };
}
