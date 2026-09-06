import { test } from "node:test";
import assert from "node:assert/strict";
import { filterReports, summarize, readSaved } from "../src/discovery.js";
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
