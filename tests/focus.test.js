import { test } from "node:test";
import assert from "node:assert/strict";
import { filterReports } from "../src/discovery.js";
const now = 1000000000;
const base = { status: "active", category: "all", query: "", now };
const row = {
  id: "a",
  status: "active",
  category: "queue",
  title: "Queue",
  location: "Market",
  description: "",
  lat: 37.77,
  lng: -122.42,
  updatedAt: now - 1000,
};
test("age filter includes its boundary and excludes old reports", () => {
  const rows = [
    row,
    { ...row, id: "b", updatedAt: now - 3600000 },
    { ...row, id: "c", updatedAt: now - 3600001 },
  ];
  assert.equal(filterReports(rows, { ...base, maxAgeHours: 1 }).length, 2);
  assert.equal(filterReports(rows, { ...base, maxAgeHours: 0 }).length, 3);
});
test("map bounds compose with freshness without mutating reports", () => {
  const rows = [
    row,
    { ...row, id: "b", lat: 47.6 },
    { ...row, id: "c", updatedAt: 0 },
  ];
  const bounds = { south: 37.7, north: 37.8, west: -122.5, east: -122.4 };
  assert.deepEqual(
    filterReports(rows, { ...base, bounds, maxAgeHours: 24 }).map((r) => r.id),
    ["a"],
  );
  assert.equal(rows.length, 3);
});
