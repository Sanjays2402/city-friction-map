import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectUpdates,
  filterReports,
  readFollowed,
  readIdSet,
  readSaved,
  readSnapshot,
  snapshotReports,
  summarize,
  toCSV,
  writeIdSet,
  writeSnapshot,
} from "../src/discovery.js";
const base = { status: "active", category: "all", query: "", sort: "recent" };
const rows = [
  {
    id: "a",
    category: "queue",
    title: "Coffee queue",
    location: "Market",
    description: "",
    status: "active",
    severity: 1,
    confirmations: 5,
    updatedAt: 3,
    demo: true,
    prediction: { minutes: 12 },
  },
  {
    id: "b",
    category: "access",
    title: "Blocked ramp",
    location: "Mission",
    description: "",
    status: "active",
    severity: 3,
    confirmations: 2,
    updatedAt: 2,
    demo: false,
    prediction: { minutes: null },
  },
  {
    id: "c",
    category: "noise",
    title: "Drilling",
    location: "Market",
    description: "",
    status: "resolved",
    severity: 2,
    confirmations: 1,
    updatedAt: 1,
    demo: true,
    prediction: { minutes: 5 },
  },
];
test("discovery filters compose and do not mutate source data", () => {
  assert.deepEqual(
    filterReports(
      rows,
      { ...base, majorOnly: true, hideDemo: true, savedOnly: true },
      new Set(["b"]),
    ).map((r) => r.id),
    ["b"],
  );
  assert.equal(filterReports(rows, { ...base, query: "  COFFEE  " }).length, 1);
  assert.equal(filterReports(rows, { ...base, category: "noise" }).length, 0);
  assert.equal(filterReports(rows, { ...base, status: "resolved" }).length, 1);
  assert.deepEqual(
    filterReports(rows, { ...base, sort: "impact" }).map((r) => r.id),
    ["b", "a"],
  );
  assert.deepEqual(
    filterReports(rows, { ...base, sort: "confirmed" }).map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(rows[0].id, "a");
});
test("followed-only filter composes with the existing filters", () => {
  assert.deepEqual(
    filterReports(
      rows,
      { ...base, followedOnly: true },
      new Set(),
      new Set(["a", "c"]),
    ).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    filterReports(rows, { ...base, followedOnly: true }, new Set(), new Set())
      .length,
    0,
  );
  // Existing three-argument calls keep treating the set as saved reports.
  assert.deepEqual(
    filterReports(rows, { ...base, savedOnly: true }, new Set(["b"])).map(
      (r) => r.id,
    ),
    ["b"],
  );
});
test("detectUpdates describes confirmations, notes, votes and resolutions", () => {
  const before = snapshotReports(rows);
  const after = rows.map((r) =>
    r.id === "a"
      ? { ...r, confirmations: 7, commentCount: 2, clearVotes: 1 }
      : r.id === "b"
        ? { ...r, status: "resolved" }
        : r,
  );
  const updates = detectUpdates(after, new Set(["a", "b", "c"]), before);
  assert.equal(updates.length, 2);
  const a = updates.find((u) => u.id === "a");
  assert.deepEqual(a.changes, [
    "2 new confirmations",
    "2 new neighbor notes",
    "a new clearance vote",
  ]);
  const b = updates.find((u) => u.id === "b");
  assert.deepEqual(b.changes, ["cleared by the community"]);
  // Unfollowed reports and unchanged snapshots produce nothing.
  assert.equal(detectUpdates(after, new Set(["c"]), before).length, 0);
  assert.equal(detectUpdates(after, new Set(["a"]), {}).length, 0);
});
test("toCSV quotes fields and covers the report columns", () => {
  const csv = toCSV([
    {
      id: "x",
      title: 'A "quoted", tricky title',
      location: "Market St",
      category: "queue",
      severity: 2,
      status: "active",
      confirmations: 3,
      clearVotes: 1,
      commentCount: 2,
      lat: 37.77,
      lng: -122.42,
      createdAt: 1700000000000,
      updatedAt: 1700000060000,
    },
  ]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("id,title,location,"));
  assert.ok(lines[1].includes('"A ""quoted"", tricky title"'));
  assert.ok(lines[1].includes("2023-11-14T22:13:20.000Z"));
  assert.equal(
    toCSV([]),
    "id,title,location,category,severity,status,confirmations,clear_votes,comments,latitude,longitude,created_at,updated_at\r\n",
  );
});
test("followed sets and snapshots round-trip through storage", () => {
  const backing = {};
  const storage = {
    getItem: (k) => backing[k] ?? null,
    setItem: (k, v) => (backing[k] = v),
  };
  writeIdSet(storage, "friction-followed", new Set(["a", "b"]));
  assert.deepEqual([...readFollowed(storage)], ["a", "b"]);
  writeSnapshot(storage, snapshotReports(rows));
  const seen = readSnapshot(storage);
  assert.equal(seen.a.confirmations, 5);
  assert.deepEqual(readIdSet({ getItem: () => "nope" }, "k"), new Set());
  assert.deepEqual(readSnapshot({ getItem: () => "nope" }), {});
});
test("summary counts active impact and stale reports separately from resolved", () => {
  assert.deepEqual(summarize(rows), {
    active: 2,
    major: 1,
    stale: 1,
    resolved: 1,
  });
});
test("saved reports tolerate corrupt or unavailable storage", () => {
  assert.equal(readSaved({ getItem: () => "{" }).size, 0);
  assert.equal(readSaved({ getItem: () => '{"id":1}' }).size, 0);
  assert.equal(
    readSaved({
      getItem: () => {
        throw new Error("blocked");
      },
    }).size,
    0,
  );
  assert.deepEqual([...readSaved({ getItem: () => '["a",4,"a"]' })], ["a"]);
});
